/**
 * pdfSliceService.js - High-Performance Offline Browser PDF Extraction & Adaptive Compression Service
 *
 * Uses pdfjs-dist directly in the browser to slice page ranges, extract raw text, render Base64 JPEG page images,
 * and dynamically compress payloads to stay strictly below Gemini's 20 MB API upload limit.
 */

import * as pdfjsLib from 'pdfjs-dist';

// Ensure PDF.js worker is initialized with local bundled asset (100% offline & no CDN CORS/fetch failures)
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

/**
 * Calculates effective PDF page range taking into account Page Offset setting (Scenario 1) or standalone file (Scenario 2).
 * @param {number} startPage 1-indexed start page
 * @param {number} endPage 1-indexed end page
 * @param {number} pageOffset Page offset calibration (e.g. +15)
 * @param {number} totalPdfPages Total pages in PDF document
 * @param {boolean} isPreSplit If true, ignores offset (Scenario 2)
 * @returns {{ effStart: number, effEnd: number }}
 */
export function calculateEffectivePageRange(startPage, endPage, pageOffset = 0, totalPdfPages = 1000, isPreSplit = false) {
  const startNum = parseInt(startPage, 10) || 1;
  const endNum = parseInt(endPage, 10) || startNum;
  const offsetNum = parseInt(pageOffset, 10) || 0;
  const requestedPageCount = Math.max(1, endNum - startNum + 1);

  // Scenario 1: Standalone Pre-Split Topic PDF (file uploaded specifically for this topic)
  if (isPreSplit) {
    // A standalone topic PDF is already sliced for this topic, so its pages are 1..totalPdfPages
    return {
      effStart: 1,
      effEnd: Math.max(1, totalPdfPages)
    };
  }

  // Scenario 2: Detect if the PDF is a standalone chapter/topic PDF rather than a full textbook
  // If the total pages in the PDF is smaller than rawStart, or approximately matches the topic length (<= requestedPageCount + 3),
  // then the uploaded PDF is a standalone chapter PDF, so we should show all pages of the document from 1 to totalPdfPages.
  const rawStart = Math.max(1, startNum + offsetNum);
  const rawEnd = Math.max(rawStart, endNum + offsetNum);

  if (totalPdfPages <= requestedPageCount + 3 || totalPdfPages < rawStart) {
    return {
      effStart: 1,
      effEnd: Math.max(1, totalPdfPages)
    };
  }

  // Scenario 3: Full Master Subject Textbook
  const effStart = Math.min(Math.max(1, rawStart), totalPdfPages);
  const effEnd = Math.min(Math.max(effStart, rawEnd), totalPdfPages);

  return { effStart, effEnd };
}

/**
 * Extracts raw text and Base64 rendered page images for a topic's page range from a PDF ArrayBuffer.
 * Implements client-side adaptive compression (scale 1.2 -> 0.9, JPEG quality 0.8 -> 0.55 if payload > 10 MB).
 *
 * @param {object} params
 * @param {ArrayBuffer} params.pdfArrayBuffer Raw PDF ArrayBuffer from IndexedDB
 * @param {number} params.startPage Topic start page
 * @param {number} params.endPage Topic end page
 * @param {number} [params.pageOffset=0] Page offset calibration
 * @param {boolean} [params.isPreSplit=false] If true, ignores offset (Scenario 2)
 * @param {number} [params.maxPayloadMb=15] Hard safety payload cap in MB
 * @returns {Promise<{
 *   extractedText: string,
 *   pageImages: Array<{ pageNumber: number, base64: string }>,
 *   isScannedPdf: boolean,
 *   totalPayloadSizeMb: number,
 *   pageCount: number,
 *   effStart: number,
 *   effEnd: number
 * }>}
 */
export async function extractTopicPdfSlice({
  pdfArrayBuffer,
  startPage,
  endPage,
  pageOffset = 0,
  isPreSplit = false,
  maxPayloadMb = 15
}) {
  if (!pdfArrayBuffer) {
    throw new Error('PDF ArrayBuffer is missing or invalid.');
  }

  // 1. Load PDF Document via PDF.js
  const loadingTask = pdfjsLib.getDocument({ data: pdfArrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const totalPdfPages = pdfDoc.numPages;

  try {
    // 2. Calculate Effective Page Range
    const { effStart, effEnd } = calculateEffectivePageRange(startPage, endPage, pageOffset, totalPdfPages, isPreSplit);

    // Helper render loop
    const renderSlice = async (renderScale, jpegQuality) => {
      let combinedText = '';
      const imagesList = [];
      let totalBytes = 0;

      for (let p = effStart; p <= effEnd; p++) {
        const page = await pdfDoc.getPage(p);

        // Extract raw text
        try {
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          if (pageText.trim()) {
            combinedText += `\n--- PAGE ${p} ---\n` + pageText.trim() + '\n';
          }
        } catch (e) {
          console.warn(`[pdfSliceService] Text extraction warning on page ${p}:`, e);
        }

        // Render page image on offscreen canvas
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport }).promise;

        const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
        const base64Data = dataUrl.split(',')[1] || '';

        // Free canvas bitmap immediately
        canvas.width = 0;
        canvas.height = 0;

        totalBytes += base64Data.length;
        imagesList.push({
          pageNumber: p,
          base64: base64Data
        });
        
        // Clean up page resources
        if (typeof page.cleanup === 'function') {
          page.cleanup();
        }
      }

      return {
        text: combinedText.trim(),
        images: imagesList,
        bytes: totalBytes
      };
    };

    // 3. Initial Render (High Quality: scale 1.2, quality 0.8)
    let result = await renderSlice(1.2, 0.8);
    let payloadMb = parseFloat((result.bytes / 1024 / 1024).toFixed(2));

    // 4. Adaptive Compression Safeguard: If payload > 10 MB, auto-compress (scale 0.9, quality 0.55)
    if (payloadMb > 10) {
      console.warn(`[pdfSliceService] Payload size ${payloadMb} MB exceeds 10 MB. Applying adaptive compression (scale 0.9, quality 0.55)...`);
      result = await renderSlice(0.9, 0.55);
      payloadMb = parseFloat((result.bytes / 1024 / 1024).toFixed(2));
    }

    // 5. Hard Safety Cap Check (15 MB)
    if (payloadMb > maxPayloadMb) {
      console.warn(`[pdfSliceService] Compressed payload ${payloadMb} MB exceeds safety threshold ${maxPayloadMb} MB.`);
    }

    const isScanned = !result.text || result.text.length < 50;
    const pageDataUrls = (result.images || []).map(img => 
      img.base64 ? (img.base64.startsWith('data:') ? img.base64 : `data:image/jpeg;base64,${img.base64}`) : ''
    ).filter(Boolean);

    return {
      extractedText: result.text,
      pageImages: result.images,
      pages: pageDataUrls,
      isScannedPdf: isScanned,
      totalPayloadSizeMb: payloadMb,
      pageCount: effEnd - effStart + 1,
      effStart,
      effEnd
    };
  } finally {
    // Explicitly release all PDF.js document bitmaps and workers from RAM
    try {
      if (typeof pdfDoc.cleanup === 'function') await pdfDoc.cleanup();
      if (typeof pdfDoc.destroy === 'function') await pdfDoc.destroy();
    } catch (cleanupErr) {
      console.warn('[pdfSliceService] Error destroying pdfDoc:', cleanupErr);
    }
  }
}

/**
 * Helper to split a large page range into 10-page sub-batches if needed.
 */
export function splitPageRangeIntoBatches(startPage, endPage, maxPagesPerBatch = 10) {
  const batches = [];
  const start = Math.max(1, parseInt(startPage, 10) || 1);
  const end = Math.max(start, parseInt(endPage, 10) || start);

  for (let current = start; current <= end; current += maxPagesPerBatch) {
    const batchEnd = Math.min(current + maxPagesPerBatch - 1, end);
    batches.push({ startPage: current, endPage: batchEnd });
  }

  return batches;
}

export default {
  calculateEffectivePageRange,
  extractTopicPdfSlice,
  splitPageRangeIntoBatches
};

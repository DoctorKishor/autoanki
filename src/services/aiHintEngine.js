/**
 * aiHintEngine.js - AI Active-Recall Hint Generation Engine
 *
 * Enforces Free Tier 500 RPD daily quota budget, slices PDF text/images using pdfSliceService,
 * formulates active-recall prompts, sends requests through AutoAnki's multi-model fallback chain,
 * and saves generated hint arrays to IndexedDB.
 */

import { extractTopicPdfSlice } from './pdfSliceService';
import { checkDailyHintQuotaLocal, incrementDailyHintQuotaLocal, saveTopicHintsLocal } from './localDb';

/**
 * Executes a Gemini API request with multi-model fallback.
 */
async function callGeminiMultimodalFallback({ prompt, images = [], geminiApiKey, modelList = [] }) {
  if (!geminiApiKey) {
    throw new Error('Missing Gemini API Key. Please add your API key in Settings.');
  }

  const fallbackChain = modelList.length > 0
    ? modelList
    : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

  let lastError = null;

  for (const modelName of fallbackChain) {
    try {
      console.log(`[aiHintEngine] Attempting active-recall hint generation with model: ${modelName}`);

      const parts = [{ text: prompt }];

      // Attach inline Base64 page images if available
      for (const img of images) {
        if (img.base64) {
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: img.base64
            }
          });
        }
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[aiHintEngine] Model ${modelName} HTTP ${response.status} Error:`, errorText);
        lastError = new Error(`HTTP ${response.status}: ${errorText}`);
        continue; // Try next model in fallback chain
      }

      const json = await response.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        lastError = new Error(`Model ${modelName} returned empty response.`);
        continue;
      }

      // Parse JSON
      let parsedJson;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (parseErr) {
        // Fallback markdown code block extraction
        const clean = rawText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
        parsedJson = JSON.parse(clean);
      }

      let hintsArray = [];
      let structure = null;
      let chapterTitle = '';

      if (Array.isArray(parsedJson)) {
        hintsArray = parsedJson;
      } else if (parsedJson && typeof parsedJson === 'object') {
        structure = parsedJson.structure || parsedJson.topics || null;
        chapterTitle = parsedJson.chapterTitle || '';
        hintsArray = parsedJson.hints || parsedJson.clues || [];
      }

      if (!structure && hintsArray.length === 0) {
        lastError = new Error(`Model ${modelName} returned empty hint structure.`);
        continue;
      }

      return {
        hints: hintsArray,
        structure,
        chapterTitle,
        usedModel: modelName
      };
    } catch (err) {
      console.warn(`[aiHintEngine] Exception during call to ${modelName}:`, err);
      lastError = err;
    }
  }

  throw new Error(`All fallback models failed. Last error: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Main function: Generates Active-Recall hints for a textbook topic from a PDF slice.
 *
 * @param {object} params
 * @param {string} params.topicId Topic unique identifier
 * @param {string} params.topicName Topic title
 * @param {string} params.subject Subject name
 * @param {ArrayBuffer} params.pdfArrayBuffer Raw PDF ArrayBuffer from IndexedDB
 * @param {number} params.startPage Start page
 * @param {number} params.endPage End page
 * @param {number} [params.pageOffset=0] Page offset calibration (+N)
 * @param {boolean} [params.isPreSplit=false] If true, ignores offset (Scenario 2)
 * @param {string} params.geminiApiKey User Gemini API key
 * @param {object} [params.aiFeatureModels] App feature models mapping
 * @returns {Promise<{ hints: string[], structure: array, generatedAt: string, isScannedPdf: boolean }>}
 */
export async function generateTopicActiveRecallHints({
  topicId,
  topicName,
  subject,
  pdfArrayBuffer,
  startPage,
  endPage,
  pageOffset = 0,
  isPreSplit = false,
  geminiApiKey,
  aiFeatureModels
}) {
  // 1. Quota Check (500 RPD)
  const quotaStatus = await checkDailyHintQuotaLocal(500);
  if (quotaStatus.isExceeded) {
    throw new Error(`Daily AI Hint generation limit reached (${quotaStatus.count}/500 requests today). Quota resets at midnight.`);
  }

  if (!pdfArrayBuffer) {
    throw new Error(`No Master Subject PDF found for ${subject || 'this topic'}. Please upload a Subject PDF in the Subject Tracker tab.`);
  }

  // 2. Extract PDF slice text & images
  console.log(`[aiHintEngine] Slicing PDF for topic "${topicName}" (p. ${startPage}-${endPage}, offset: +${pageOffset})...`);
  const pdfSlice = await extractTopicPdfSlice({
    pdfArrayBuffer,
    startPage,
    endPage,
    pageOffset,
    isPreSplit
  });

  // 3. Construct Hierarchical Active-Recall Blueprint Prompt
  const prompt = `You are an expert medical professor and active-recall blueprint architect.
Your task is to analyze the provided textbook pages for the topic: "${topicName}" (${subject || ''}) and build a COMPREHENSIVE HIERARCHICAL ACTIVE-RECALL BLUEPRINT covering the ENTIRE chapter/topic material from start to finish.

### CRITICAL INSTRUCTIONS & CONSTRAINTS:
1. COVER THE ENTIRE CHAPTER: Do NOT skip any major sections, sub-headings, or key concepts from the textbook pages provided.
2. HIERARCHICAL TREE STRUCTURE: Organize the output into a 3-level tree:
   - Level 1: Main Topics (Major headings/sections in the chapter in chronological order)
   - Level 2: Subtopics (Core sub-concepts, anatomical structures, pathophysiologies, clinical presentations, diagnostics, or treatments under each Main Topic)
   - Level 3: Sub-subtopics / Recall Anchors (Concise active-recall triggers/prompts for specific points, criteria, mechanisms, or facts the student must recall from memory).
3. ACTIVE-RECALL PROMPTS (NO ANSWERS/SPOILERS): Do NOT write out full definitions, long textbook summaries, or answer keys. Write recall anchors (e.g. "3 diagnostic criteria for X", "Anatomic boundary of Y", "First-line pharmacological treatment & mechanism").
4. OUTPUT FORMAT: Output ONLY a valid JSON object matching this exact schema:

{
  "chapterTitle": "${topicName}",
  "structure": [
    {
      "topic": "1. Main Topic Name",
      "subtopics": [
        {
          "title": "Subtopic Title",
          "points": [
            "Specific Active-Recall Prompt 1",
            "Specific Active-Recall Prompt 2"
          ]
        }
      ]
    }
  ]
}

### EXTRACTED TEXTBOOK CONTENT (Pages ${pdfSlice.effStart} to ${pdfSlice.effEnd}):
${pdfSlice.extractedText || '(No raw text parsed; scanned textbook page images attached below.)'}
`;

  // 4. Send request through Fallback Chain (Only attach heavy page images if scanned or text < 100 chars)
  const modelList = aiFeatureModels?.activeRecallHints || ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  const attachImages = pdfSlice.isScannedPdf || !pdfSlice.extractedText || pdfSlice.extractedText.length < 100;
  
  const result = await callGeminiMultimodalFallback({
    prompt,
    images: attachImages ? pdfSlice.pageImages : [],
    geminiApiKey,
    modelList
  });

  // 5. Increment Quota & Save to IndexedDB
  await incrementDailyHintQuotaLocal();

  const generatedAt = new Date().toISOString();
  const hintPayload = {
    topicId,
    hints: result.hints || [],
    structure: result.structure || null,
    chapterTitle: result.chapterTitle || topicName,
    generatedAt,
    usedModel: result.usedModel,
    startPage: pdfSlice.effStart,
    endPage: pdfSlice.effEnd,
    isScannedPdf: pdfSlice.isScannedPdf
  };

  await saveTopicHintsLocal(topicId, hintPayload);

  return hintPayload;
}

export default {
  generateTopicActiveRecallHints
};

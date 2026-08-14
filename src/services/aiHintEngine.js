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
    : ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];

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

      // Parse JSON array of hints
      let parsedJson;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (parseErr) {
        // Fallback markdown code block extraction
        const clean = rawText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
        parsedJson = JSON.parse(clean);
      }

      const hintsArray = Array.isArray(parsedJson)
        ? parsedJson
        : (parsedJson.hints || parsedJson.clues || []);

      if (hintsArray.length === 0) {
        lastError = new Error(`Model ${modelName} returned 0 hints.`);
        continue;
      }

      return {
        hints: hintsArray,
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
 * @returns {Promise<{ hints: string[], usedModel: string, generatedAt: string, isScannedPdf: boolean }>}
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

  // 3. Construct Active-Recall Prompt
  const prompt = `You are an expert medical study tutor and active-recall assistant.
Your task is to generate a dynamic, ordered ladder of progressive memory clues (hints) for the medical topic: "${topicName}" (${subject || ''}).

### STRICT RULES & CONSTRAINTS:
1. DO NOT summarize, define, explain, or reveal direct answers or final diagnoses.
2. Generate a dynamic list of N progressive memory clues following the exact chronological flow of the textbook pages provided.
3. Clues must prompt the student's brain to recall specific facts, diagnostic criteria, mechanisms, clinical signs, or treatment protocols from memory.
4. Each clue must be a concise, guiding question or trigger phrase (1-2 sentences max).
5. DO NOT restrict yourself to a fixed 3-hint template. Create as many distinct clues (e.g. 3 to 8 clues) as naturally covered in these textbook pages.
6. Output ONLY a valid JSON array of string clues:
["Clue 1...", "Clue 2...", "Clue 3..."]

### EXTRACTED TEXTBOOK CONTENT (Pages ${pdfSlice.effStart} to ${pdfSlice.effEnd}):
${pdfSlice.extractedText || '(No raw text parsed; scanned textbook page images attached below.)'}
`;

  // 4. Send request through Fallback Chain
  const modelList = aiFeatureModels?.activeRecallHints || ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  const result = await callGeminiMultimodalFallback({
    prompt,
    images: pdfSlice.pageImages,
    geminiApiKey,
    modelList
  });

  // 5. Increment Quota & Save to IndexedDB
  await incrementDailyHintQuotaLocal();

  const generatedAt = new Date().toISOString();
  const hintPayload = {
    topicId,
    hints: result.hints,
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

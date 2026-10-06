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

      const isHighTokenModel = modelName.includes('2.5') || modelName.includes('3.5');
      const maxTokens = isHighTokenModel ? 65536 : 8192;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: maxTokens,
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
      let tree = null;
      let chapterTitle = '';

      if (Array.isArray(parsedJson)) {
        hintsArray = parsedJson;
      } else if (parsedJson && typeof parsedJson === 'object') {
        tree = parsedJson.tree || parsedJson.outline || null;
        structure = parsedJson.structure || parsedJson.topics || null;
        chapterTitle = parsedJson.chapterTitle || '';
        hintsArray = parsedJson.hints || parsedJson.clues || [];
      }

      if (!tree && !structure && hintsArray.length === 0) {
        lastError = new Error(`Model ${modelName} returned empty hint structure.`);
        continue;
      }

      return {
        hints: hintsArray,
        structure,
        tree,
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
 * @returns {Promise<{ hints: string[], tree: array, structure: array, generatedAt: string, isScannedPdf: boolean }>}
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

  // 3. Construct Recursive N-Level Active-Recall Outline Prompt (Ultra-Fast 2-3s Read Time & Zero-Spoiler)
  const prompt = `You are an elite medical professor and master cognitive active-recall architect preparing high-yield study blueprints for INI-CET and NEET-PG candidates.

Your mission is to transform the provided textbook text into an ultra-concise, non-redundant, 100% SPOILER-FREE HIERARCHICAL RECURSIVE ACTIVE-RECALL TREE in valid JSON format.

================================================================================
CRITICAL CONCISENESS & SPEED RULES (2-3 SECOND READ TIME):
================================================================================
1. ULTRA-SHORT PROMPTS (MAX 10-12 WORDS):
   - Every "prompt" MUST be punchy, direct, and readable in under 3 seconds.
   - NO filler intros ("Can you explain...", "What is the primary persistent...", "Which of the following...").
   - Strip all fluff. Go straight to the retrieval trigger:
     - Example: "Notochord remnant in the IV disc?"
     - Example: "Initial drug of choice for acute gout attack?"
     - Example: "Pathognomonic histopathology in Rheumatic Carditis?"

2. NEUTRAL CONCEPT TITLES (2-4 WORDS MAX, ZERO SPOILERS):
   - The "title" of EVERY node MUST be a neutral conceptual or anatomical anchor.
   - NEVER put the answer, eponym, specific drug name, organism, or gene in the "title"!
   - CORRECT Title: "IV Disc Core"  |  FORBIDDEN: "Nucleus Pulposus Origin"
   - CORRECT Title: "Dens Cranial Attachment"  |  FORBIDDEN: "Apical Ligament of Dens"
   - CORRECT Title: "First-Line T2DM Drug"  |  FORBIDDEN: "Metformin Therapy"

3. HIERARCHICAL LEVEL DISCIPLINE (NO CROSS-LEVEL LEAKAGE):
   - L1 (System/Division): Neutral overview. Prompt asks to recall the 2-4 major categories/parts.
   - L2 (Category/Entity): Neutral category. Prompt asks for branches, subtypes, or clinical groupings.
   - L3 (Domain/Region): Neutral domain. Prompt asks for functional mechanisms or anatomical relations.
   - L4 (Atomic Leaf Fact): Neutral anchor. Prompt asks exactly ONE high-yield fact. Answer contains the definitive answer (1-5 words).

4. CONCISE "answer" (1-5 WORDS):
   - Keep the "answer" field razor-sharp (the exact medical term, value, or drug).

================================================================================
JSON SCHEMA:
================================================================================
{
  "chapterTitle": "${topicName}",
  "tree": [
    {
      "id": "1",
      "title": "Neutral L1 Title (2-4 words)",
      "prompt": "Broad category trigger (max 10 words)?",
      "answer": "Concise summary of major divisions",
      "children": [
        {
          "id": "1.1",
          "title": "Neutral L2 Title (2-4 words)",
          "prompt": "Subdivision trigger (max 10 words)?",
          "answer": "Concise list of types / branches",
          "children": [
            {
              "id": "1.1.1",
              "title": "Neutral L3 Title (2-4 words)",
              "prompt": "Domain trigger (max 10 words)?",
              "answer": "Concise mechanisms / relations",
              "children": [
                {
                  "id": "1.1.1.1",
                  "title": "Neutral L4 Concept Anchor (NO ANSWER IN TITLE)",
                  "prompt": "Ultra-short active recall trigger (5-10 words)?",
                  "answer": "Exact high-yield term / pearl (1-5 words)",
                  "children": []
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

================================================================================
TEXTBOOK CONTENT FOR "${topicName}" (${subject || 'Medical Science'} - Pages ${pdfSlice.effStart} to ${pdfSlice.effEnd}):
================================================================================
${pdfSlice.extractedText || '(Scanned textbook page images attached below.)'}
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
    tree: result.tree || null,
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

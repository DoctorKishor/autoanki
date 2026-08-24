/**
 * googleDriveSync.js - Manifest-Hashed Delta Cloud Synchronization Engine for AutoAnki
 *
 * Implements partitioned chunk cloud storage, two-phase hydration, Anki-style conflict detection,
 * automatic pre-sync local snapshots, debounced smart push, and background media transfer.
 */

import {
  getValidAccessToken,
  getGoogleDriveAuthState
} from './googleDriveAuth';

import {
  getAllLocalItems,
  putLocalItem,
  clearLocalStore,
  getLocalKV,
  setLocalKV,
  deleteLocalItem,
  getLocalPages,
  saveLocalPages,
  getLocalCards,
  saveLocalCards,
  getAllLocalTopics,
  saveAllLocalTopics,
  getLocalStudyLogs,
  saveLocalStudyLog,
  getFSRSConfig,
  saveFSRSConfig,
  saveInternalSnapshot,
  STORES,
  initDB,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  serializeBinaryValues,
  deserializeBinaryValues
} from './localDb';

export const VAULT_FOLDER_NAME = 'AutoAnki_Sync_Vault';
export const MEDIA_FOLDER_NAME = 'media';
export const SYNC_STATE_KEY = 'google_drive_sync_state';

// In-memory sync lock & event listeners
let isSyncInProgress = false;
let autoSyncDebounceTimer = null;
let lastAutoPushTimestamp = 0;
const AUTO_PUSH_COOLDOWN_MS = 30 * 1000; // 30s cooldown between auto pushes

// Device identifier (persisted in localStorage or generated)
export function getDeviceId() {
  let devId = null;
  try {
    devId = localStorage.getItem('autoanki_device_id');
    if (!devId) {
      devId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
      localStorage.setItem('autoanki_device_id', devId);
    }
  } catch (e) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 10);
  }
  return devId;
}

/**
 * Serializes an object deterministically with recursively sorted keys.
 * @param {any} obj
 * @returns {string}
 */
export function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalStringify).join(',') + ']';
  const sortedKeys = Object.keys(obj).sort();
  return '{' + sortedKeys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

/**
 * Computes a fast, deterministic FNV-1a 32-bit hex hash of any string or serialized object.
 * @param {string|object} input 
 * @returns {string} 8-character hex string
 */
export function computeHash(input) {
  const str = typeof input === 'string' ? input : canonicalStringify(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Parses any timestamp safely without returning NaN.
 * @param {any} val
 * @returns {number}
 */
export function safeTimestamp(val) {
  if (!val) return 0;
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  const parsed = new Date(val).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Dispatches sync status changes to the global window environment.
 */
function emitSyncEvent(status, details = {}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gdrive-sync-status', {
      detail: { status, timestamp: Date.now(), ...details }
    }));
  }
}

/**
 * Dispatches a hydration notification event to instruct React components
 * to reload fresh in-memory data from IndexedDB.
 */
function emitDataHydratedEvent(details = {}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gdrive-data-hydrated', {
      detail: { timestamp: Date.now(), ...details }
    }));
  }
}

// ============================================================================
// GOOGLE DRIVE REST API HELPERS (v3 with Timeout Controls)
// ============================================================================

/**
 * Executes a fetch request with timeout protection via AbortController.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Google Drive request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Searches for a file or folder by name and parent folder ID.
 */
async function findDriveItem(accessToken, name, parentFolderId = null, isFolder = false) {
  const mimeQuery = isFolder ? "mimeType = 'application/vnd.google-apps.folder'" : "mimeType != 'application/vnd.google-apps.folder'";
  const parentQuery = parentFolderId ? `'${parentFolderId}' in parents` : "'root' in parents";
  const query = `name = '${name}' and ${mimeQuery} and ${parentQuery} and trashed = false`;

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,size)&pageSize=10`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error(`Failed to query Google Drive for "${name}": ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return (data.files && data.files.length > 0) ? data.files[0] : null;
}

/**
 * Lists all files inside a specific Google Drive folder with full nextPageToken pagination.
 */
async function listFilesInFolder(accessToken, folderId) {
  const allFiles = [];
  let pageToken = null;

  do {
    const parentQuery = folderId ? `'${folderId}' in parents` : "'root' in parents";
    const query = `${parentQuery} and trashed = false`;
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,size)&pageSize=1000`;
    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) throw new Error(`Failed to list files in folder: ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      allFiles.push(...data.files);
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return allFiles;
}

/**
 * Creates a folder inside a parent folder in Google Drive.
 */
async function createDriveFolder(accessToken, folderName, parentFolderId = null) {
  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentFolderId ? [parentFolderId] : []
  };

  const res = await fetchWithTimeout('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!res.ok) {
    throw new Error(`Failed to create folder "${folderName}": ${res.status} ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Uploads or updates a JSON/text file using Google Drive REST API multipart upload conforming to RFC 2046.
 */
async function uploadDriveFile(accessToken, folderId, fileName, contentObj, existingFileId = null, keepalive = false) {
  const jsonString = typeof contentObj === 'string' ? contentObj : JSON.stringify(contentObj);
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    ...(existingFileId ? {} : { parents: [folderId] })
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    '\r\n' +
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    jsonString +
    '\r\n' +
    closeDelimiter;

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,modifiedTime,size`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size';

  const method = existingFileId ? 'PATCH' : 'POST';

  const res = await fetchWithTimeout(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody,
    keepalive: Boolean(keepalive)
  }, 35000);

  if (!res.ok) {
    throw new Error(`Failed to upload "${fileName}" to Google Drive: ${res.status} ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Uploads a binary media file (e.g. image/webp, image/jpeg, or pdf blob) to Google Drive.
 */
async function uploadDriveMediaFile(accessToken, mediaFolderId, fileName, mimeType, arrayBuffer, existingFileId = null) {
  const metadata = {
    name: fileName,
    mimeType: mimeType || 'image/webp',
    ...(existingFileId ? {} : { parents: [mediaFolderId] })
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const bytes = new Uint8Array(arrayBuffer);
  const metaHeader = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n${delimiter}Content-Type: ${mimeType}\r\n\r\n`;
  const metaBytes = new TextEncoder().encode(metaHeader);
  const endBytes = new TextEncoder().encode(closeDelimiter);

  const totalLength = metaBytes.byteLength + bytes.byteLength + endBytes.byteLength;
  const combined = new Uint8Array(totalLength);
  combined.set(metaBytes, 0);
  combined.set(bytes, metaBytes.byteLength);
  combined.set(endBytes, metaBytes.byteLength + bytes.byteLength);

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,size`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size';

  const method = existingFileId ? 'PATCH' : 'POST';

  const res = await fetchWithTimeout(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: combined
  }, 45000);

  if (!res.ok) {
    throw new Error(`Failed to upload media file "${fileName}": ${res.status}`);
  }

  return await res.json();
}

/**
 * Downloads a file's content from Google Drive by file ID.
 */
async function downloadDriveFile(accessToken, fileId, isJson = true) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }, 30000);

  if (!res.ok) {
    throw new Error(`Failed to download file ${fileId} from Drive: ${res.status} ${res.statusText}`);
  }

  if (isJson) {
    return await res.json();
  }
  return await res.arrayBuffer();
}

/**
 * Locates or creates the AutoAnki_Sync_Vault folder and its /media subfolder.
 */
export async function ensureSyncVault(accessToken) {
  let vault = await findDriveItem(accessToken, VAULT_FOLDER_NAME, null, true);
  if (!vault) {
    vault = await createDriveFolder(accessToken, VAULT_FOLDER_NAME, null);
  }

  let media = await findDriveItem(accessToken, MEDIA_FOLDER_NAME, vault.id, true);
  if (!media) {
    media = await createDriveFolder(accessToken, MEDIA_FOLDER_NAME, vault.id);
  }

  return { vaultFolderId: vault.id, mediaFolderId: media.id };
}

// ============================================================================
// PARTITIONED LOCAL DATA EXTRACTION & HYDRATION
// ============================================================================

/**
 * Gathers and serializes local data into partitioned chunks, adhering to Zero-Data-Loss rules.
 */
export async function extractLocalBundles() {
  // 1. Cards Bundle
  const flashcards = (await getLocalKV('flashcards')) || [];
  const trashCards = (await getLocalKV('trash_cards')) || [];
  const cardsBundle = {
    flashcards: serializeBinaryValues(flashcards),
    trashCards: serializeBinaryValues(trashCards)
  };

  // 2. Curriculum Topics Bundle
  const topics = (await getAllLocalTopics()) || [];
  const pytData = (await getAllLocalItems(STORES.PYT_DATA)) || [];
  const subjectTracker = (await getLocalKV('subject_tracker_data')) || [];
  const pytUserProgress = (await getLocalKV('pyt_user_progress')) || [];
  const textbooksMetadata = (await getLocalKV('textbooks_metadata')) || [];
  const curriculumBundle = {
    topics: serializeBinaryValues(topics),
    pytData: serializeBinaryValues(pytData),
    subjectTracker,
    pytUserProgress,
    textbooksMetadata
  };

  // 3. Study Logs Bundle
  const studyLogs = (await getLocalStudyLogs()) || {};
  const studySchedule = (await getLocalKV('study_schedule')) || {};
  const scheduleTemplates = (await getLocalKV('schedule_templates')) || [];
  const campDailyLogs = (await getAllLocalItems(STORES.CAMP_DAILY_LOGS)) || [];
  const timerState = (await getLocalKV('timerState')) || null;
  const syncTodayStr = new Date().toLocaleDateString('en-CA');
  const activeNewTopicsToday = (await getLocalKV('active_new_topics_' + syncTodayStr)) || (await getLocalKV('active_new_topics_today')) || [];
  const studyLogsBundle = {
    studyLogs,
    studySchedule,
    scheduleTemplates,
    campDailyLogs,
    timerState,
    activeNewTopicsToday
  };

  // 4. FSRS Config & Settings Bundle
  const fsrsConfig = (await getFSRSConfig()) || {};
  const settings = (await getAllLocalItems(STORES.SETTINGS)) || [];
  const filteredSettings = settings.filter(s => s?.key !== 'google_drive_auth');
  const topicHints = (await getAllLocalItems(STORES.TOPIC_HINTS)) || [];
  const hintQuota = (await getAllLocalItems(STORES.HINT_QUOTA)) || [];
  const customPrompts = (await getLocalKV('custom_prompts')) || [];
  const localUserProfile = (await getLocalKV('local_user_profile')) || null;
  const aiRecommendations = (await getLocalKV('ai_topic_recommendations_' + syncTodayStr)) || (await getLocalKV('ai_topic_recommendations')) || null;
  const fsrsBundle = {
    fsrsConfig,
    settings: filteredSettings,
    topicHints,
    hintQuota,
    customPrompts,
    localUserProfile,
    aiRecommendations
  };

  // 5. CAMP Tracker Bundle
  const campTracker = (await getAllLocalItems(STORES.CAMP_TRACKER)) || [];
  const campData = (await getAllLocalItems(STORES.CAMP_DATA)) || [];
  const campBundle = {
    campTracker,
    campData
  };

  // 6. Scanned Pages & Occlusions Metadata Bundle (Zero-Data-Loss Guaranteed)
  const pages = (await getLocalPages()) || [];
  const trashPages = (await getLocalKV('trash_pages')) || [];
  
  // Separate heavy image binary payload & Base64 strings from metadata for cloud JSON chunking
  const cleanPageForBundle = (p) => {
    const copy = { ...p };
    if (copy.data instanceof ArrayBuffer || copy.data?.__type === 'ArrayBuffer') {
      copy.hasMedia = true;
      delete copy.data;
    }
    if (typeof copy.originalImage === 'string' && copy.originalImage.startsWith('data:')) {
      copy.hasMedia = true;
      delete copy.originalImage;
    }
    if (typeof copy.imageUrl === 'string' && copy.imageUrl.startsWith('data:')) {
      copy.hasMedia = true;
      delete copy.imageUrl;
    }
    return copy;
  };

  const pagesMetadata = pages.map(cleanPageForBundle);
  const trashPagesMetadata = trashPages.map(cleanPageForBundle);

  const pagesBundle = {
    pages: serializeBinaryValues(pagesMetadata),
    trashPages: serializeBinaryValues(trashPagesMetadata)
  };

  // Compute hashes
  const hashes = {
    cards_bundle: computeHash(cardsBundle),
    curriculum_topics: computeHash(curriculumBundle),
    study_logs: computeHash(studyLogsBundle),
    fsrs_config: computeHash(fsrsBundle),
    camp_tracker: computeHash(campBundle),
    pages_bundle: computeHash(pagesBundle)
  };

  const manifest = {
    version: '2.1',
    engine: 'AutoAnki Google Drive Sync',
    deviceId: getDeviceId(),
    timestamp: new Date().toISOString(),
    schemaVersion: 4,
    hashes,
    stats: {
      cardsCount: flashcards.length,
      topicsCount: topics.length,
      logsDaysCount: Object.keys(studyLogs).length,
      pagesCount: pages.length,
      mediaCount: pages.length
    }
  };

  return {
    manifest,
    bundles: {
      'cards_bundle.json': cardsBundle,
      'curriculum_topics.json': curriculumBundle,
      'study_logs.json': studyLogsBundle,
      'fsrs_config.json': fsrsBundle,
      'camp_tracker.json': campBundle,
      'pages_bundle.json': pagesBundle
    },
    pages,
    trashPages
  };
}

/**
 * Hydrates downloaded partitioned bundles into IndexedDB with timestamp-aware defensive merging.
 * @param {object} bundles Downloaded bundles keyed by filename
 * @param {'merge'|'replace'} strategy Merge non-destructively or replace
 * @param {Function} [onProgress] Progress reporter
 */
export async function hydrateLocalBundles(bundles, strategy = 'merge', onProgress = null) {
  const emit = (step, total, msg) => { if (onProgress) onProgress(step, total, msg); };
  const totalSteps = 7;
  let step = 0;

  // 1. Cards Bundle (Timestamp-Aware & FSRS Safe)
  if (bundles['cards_bundle.json']) {
    emit(++step, totalSteps, 'Hydrating Flashcards & FSRS memory states…');
    const b = bundles['cards_bundle.json'];
    const incomingCards = deserializeBinaryValues(b.flashcards || []);
    const incomingTrash = deserializeBinaryValues(b.trashCards || []);

    if (strategy === 'replace') {
      await setLocalKV('flashcards', incomingCards);
      await setLocalKV('trash_cards', incomingTrash);
    } else {
      // Merge cards by ID with safe timestamp check & trash awareness
      const existing = (await getLocalKV('flashcards')) || [];
      const localTrash = (await getLocalKV('trash_cards')) || [];
      const trashMap = new Map(localTrash.map(c => [c.id, safeTimestamp(c.deletedAt)]));
      const map = new Map(existing.map(c => [c.id, c]));

      incomingCards.forEach(inc => {
        if (inc && inc.id) {
          const localDeletedAt = trashMap.get(inc.id);
          const incTime = safeTimestamp(inc.updatedAt || inc.lastReviewDate || inc.createdAt);
          if (localDeletedAt && localDeletedAt > incTime) {
            return;
          }

          const localCard = map.get(inc.id);
          if (!localCard) {
            map.set(inc.id, inc);
          } else {
            const localTime = safeTimestamp(localCard.updatedAt || localCard.lastReviewDate || localCard.createdAt);
            if (incTime >= localTime) {
              map.set(inc.id, { ...localCard, ...inc });
            } else {
              map.set(inc.id, { ...inc, ...localCard });
            }
          }
        }
      });
      await setLocalKV('flashcards', Array.from(map.values()));

      // Merge trash cards
      const existingTrash = (await getLocalKV('trash_cards')) || [];
      const trashSet = new Map(existingTrash.map(c => [c.id, c]));
      incomingTrash.forEach(c => {
        if (c && c.id && !trashSet.has(c.id)) trashSet.set(c.id, c);
      });
      await setLocalKV('trash_cards', Array.from(trashSet.values()));
    }
  }

  // 2. Curriculum Topics
  if (bundles['curriculum_topics.json']) {
    emit(++step, totalSteps, 'Hydrating Curriculum Topics & PYT Progress…');
    const b = bundles['curriculum_topics.json'];
    const incomingTopics = deserializeBinaryValues(b.topics || []);
    const incomingPyt = deserializeBinaryValues(b.pytData || []);

    if (strategy === 'replace') {
      const db = await initDB();
      // Atomic clear and put for topics
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.TOPICS, 'readwrite');
        const st = tx.objectStore(STORES.TOPICS);
        const clearReq = st.clear();
        clearReq.onsuccess = () => {
          incomingTopics.forEach(t => { if (t && t.id) st.put(t); });
        };
        clearReq.onerror = () => reject(clearReq.error);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });

      // Atomic clear and put for pytData
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.PYT_DATA, 'readwrite');
        const st = tx.objectStore(STORES.PYT_DATA);
        const clearReq = st.clear();
        clearReq.onsuccess = () => {
          incomingPyt.forEach(p => { if (p) st.put(p); });
        };
        clearReq.onerror = () => reject(clearReq.error);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });

      if (b.subjectTracker) await setLocalKV('subject_tracker_data', b.subjectTracker);
      if (b.pytUserProgress) await setLocalKV('pyt_user_progress', b.pytUserProgress);
      if (b.textbooksMetadata) await setLocalKV('textbooks_metadata', b.textbooksMetadata);
    } else {
      if (Array.isArray(incomingTopics)) {
        const existingTopics = (await getAllLocalTopics()) || [];
        const topMap = new Map(existingTopics.map(t => [t.id, t]));
        incomingTopics.forEach(incT => {
          if (incT && incT.id) {
            const locT = topMap.get(incT.id);
            if (!locT) {
              topMap.set(incT.id, incT);
            } else {
              const locTime = safeTimestamp(locT.updatedAt || locT.createdAt);
              const incTime = safeTimestamp(incT.updatedAt || incT.createdAt);
              topMap.set(incT.id, incTime >= locTime ? { ...locT, ...incT } : { ...incT, ...locT });
            }
          }
        });
        await saveAllLocalTopics(Array.from(topMap.values()));
      }

      if (Array.isArray(incomingPyt)) {
        for (const item of incomingPyt) {
          if (item && item.key) await putLocalItem(STORES.PYT_DATA, item);
        }
      }
      if (b.subjectTracker) await setLocalKV('subject_tracker_data', b.subjectTracker);
      if (b.pytUserProgress) await setLocalKV('pyt_user_progress', b.pytUserProgress);
      if (b.textbooksMetadata) await setLocalKV('textbooks_metadata', b.textbooksMetadata);
    }
  }

  // 3. Study Logs (Deep Merging & FSRS Log Aggregation)
  if (bundles['study_logs.json']) {
    emit(++step, totalSteps, 'Hydrating Study Logs & Velocity Telemetry…');
    const b = bundles['study_logs.json'];
    const incomingLogs = b.studyLogs || {};

    if (strategy === 'replace') {
      await setLocalKV('study_logs', incomingLogs);
      if (b.studySchedule) await setLocalKV('study_schedule', b.studySchedule);
      if (b.scheduleTemplates) await setLocalKV('schedule_templates', b.scheduleTemplates);
      if (b.timerState) await setLocalKV('timerState', b.timerState);
      if (b.activeNewTopicsToday) await setLocalKV('active_new_topics_today', b.activeNewTopicsToday);
      if (Array.isArray(b.campDailyLogs)) {
        const db = await initDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORES.CAMP_DAILY_LOGS, 'readwrite');
          const st = tx.objectStore(STORES.CAMP_DAILY_LOGS);
          const clearReq = st.clear();
          clearReq.onsuccess = () => {
            b.campDailyLogs.forEach(log => { if (log && log.dateStr) st.put(log); });
          };
          clearReq.onerror = () => reject(clearReq.error);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        });
      }
    } else {
      // Deep-merge study logs by date with aligned property naming
      const existing = (await getLocalStudyLogs()) || {};
      const merged = { ...existing };

      for (const [dateKey, incLog] of Object.entries(incomingLogs)) {
        if (!merged[dateKey]) {
          merged[dateKey] = incLog;
        } else {
          const cur = merged[dateKey];
          const existingFsrs = Array.isArray(cur.fsrsLogs) ? cur.fsrsLogs : [];
          const incomingFsrs = Array.isArray(incLog?.fsrsLogs) ? incLog.fsrsLogs : [];

          // Union FSRS logs by unique review timestamp or log key
          const fsrsMap = new Map();
          existingFsrs.forEach(l => {
            const k = l.timestamp || l.cardId + '_' + (l.rating || 'rev');
            fsrsMap.set(k, l);
          });
          incomingFsrs.forEach(l => {
            const k = l.timestamp || l.cardId + '_' + (l.rating || 'rev');
            if (!fsrsMap.has(k)) fsrsMap.set(k, l);
          });

          const totalCards = Math.max(cur.totalCardsReviewed || cur.cards || 0, incLog?.totalCardsReviewed || incLog?.cards || 0, fsrsMap.size);
          const totalQuestions = Math.max(cur.totalQuestionsAttempted || cur.questions || 0, incLog?.totalQuestionsAttempted || incLog?.questions || 0);
          const totalHours = Math.max(cur.studyHours || cur.hours || 0, incLog?.studyHours || incLog?.hours || 0);

          merged[dateKey] = {
            ...cur,
            ...incLog,
            cards: totalCards,
            totalCardsReviewed: totalCards,
            questions: totalQuestions,
            totalQuestionsAttempted: totalQuestions,
            hours: totalHours,
            studyHours: totalHours,
            pages: Math.max(cur.pages || 0, incLog?.pages || 0),
            fsrsLogs: Array.from(fsrsMap.values())
          };
        }
      }
      await setLocalKV('study_logs', merged);

      if (b.studySchedule) {
        const existSched = (await getLocalKV('study_schedule')) || {};
        await setLocalKV('study_schedule', { ...existSched, ...b.studySchedule });
      }
      if (b.scheduleTemplates) await setLocalKV('schedule_templates', b.scheduleTemplates);
      if (Array.isArray(b.campDailyLogs)) {
        for (const log of b.campDailyLogs) {
          if (log && log.dateStr) await putLocalItem(STORES.CAMP_DAILY_LOGS, log);
        }
      }
      if (Array.isArray(b.activeNewTopicsToday)) {
        const hydTodayStr = new Date().toLocaleDateString('en-CA');
        await setLocalKV('active_new_topics_' + hydTodayStr, b.activeNewTopicsToday);
        await setLocalKV('active_new_topics_today', b.activeNewTopicsToday);
      }
    }
  }

  // 4. FSRS Config & Settings
  if (bundles['fsrs_config.json']) {
    emit(++step, totalSteps, 'Hydrating FSRS-6 Config, Hints & Prompts…');
    const b = bundles['fsrs_config.json'];
    if (b.fsrsConfig) await saveFSRSConfig(b.fsrsConfig);
    if (b.localUserProfile) await setLocalKV('local_user_profile', b.localUserProfile);
    if (b.aiRecommendations) {
      const hydTodayStr = new Date().toLocaleDateString('en-CA');
      await setLocalKV('ai_topic_recommendations_' + hydTodayStr, b.aiRecommendations);
      await setLocalKV('ai_topic_recommendations', b.aiRecommendations);
    }

    // Merge custom prompts non-destructively
    if (Array.isArray(b.customPrompts)) {
      const existingPrompts = (await getLocalKV('custom_prompts')) || [];
      const promptMap = new Map(existingPrompts.map(p => [p.id, p]));
      b.customPrompts.forEach(p => {
        if (p && p.id && !promptMap.has(p.id)) promptMap.set(p.id, p);
      });
      await setLocalKV('custom_prompts', Array.from(promptMap.values()));
    }

    if (Array.isArray(b.topicHints)) {
      for (const h of b.topicHints) {
        if (h && h.topicId) await putLocalItem(STORES.TOPIC_HINTS, h);
      }
    }
    if (Array.isArray(b.hintQuota)) {
      for (const q of b.hintQuota) {
        if (q && q.dateStr) await putLocalItem(STORES.HINT_QUOTA, q);
      }
    }
    if (Array.isArray(b.settings)) {
      for (const s of b.settings) {
        if (s && s.key && s.key !== 'google_drive_auth') {
          await putLocalItem(STORES.SETTINGS, s);
        }
      }
    }
  }

  // 5. CAMP Tracker
  if (bundles['camp_tracker.json']) {
    emit(++step, totalSteps, 'Hydrating CAMP tracker logs…');
    const b = bundles['camp_tracker.json'];
    if (Array.isArray(b.campTracker)) {
      for (const t of b.campTracker) {
        if (t && t.id) await putLocalItem(STORES.CAMP_TRACKER, t);
      }
    }
    if (Array.isArray(b.campData)) {
      for (const d of b.campData) {
        if (d && d.key) await putLocalItem(STORES.CAMP_DATA, d);
      }
    }
  }

  // 6. Scanned Pages & Image Occlusions (Zero-Data-Loss Restoration)
  if (bundles['pages_bundle.json']) {
    emit(++step, totalSteps, 'Hydrating Scanned Pages & Image Occlusions…');
    const b = bundles['pages_bundle.json'];
    const incomingPages = deserializeBinaryValues(b.pages || []);
    const incomingTrashPages = deserializeBinaryValues(b.trashPages || []);

    if (strategy === 'replace') {
      // Retain existing local image blobs if incoming metadata stripped them
      const localPages = (await getLocalPages()) || [];
      const localMap = new Map(localPages.map(p => [p.id, p]));
      const hydratedPages = incomingPages.map(p => {
        const local = localMap.get(p.id);
        return {
          ...p,
          data: local?.data || p.data,
          originalImage: local?.originalImage || p.originalImage,
          imageUrl: local?.imageUrl || p.imageUrl
        };
      });
      await setLocalKV('pages', hydratedPages);
      await setLocalKV('trash_pages', incomingTrashPages);
    } else {
      const existing = (await getLocalPages()) || [];
      const localTrashPages = (await getLocalKV('trash_pages')) || [];
      const trashMap = new Map(localTrashPages.map(p => [p.id, p.deletedAt || 0]));
      const map = new Map(existing.map(p => [p.id, p]));

      incomingPages.forEach(p => {
        if (p && p.id) {
          const localDeletedAt = trashMap.get(p.id);
          const incTime = new Date(p.updatedAt || p.createdAt || 0).getTime();
          if (localDeletedAt && localDeletedAt > incTime) {
            // Page was deleted locally after incoming version was updated
            return;
          }

          const localP = map.get(p.id);
          if (!localP) {
            map.set(p.id, p);
          } else {
            const locTime = new Date(localP.updatedAt || localP.createdAt || 0).getTime();
            map.set(p.id, {
              ...(incTime >= locTime ? { ...localP, ...p } : { ...p, ...localP }),
              data: localP.data || p.data,
              originalImage: localP.originalImage || p.originalImage,
              imageUrl: localP.imageUrl || p.imageUrl
            });
          }
        }
      });
      await setLocalKV('pages', Array.from(map.values()));

      // Merge trash pages
      const existingTrash = (await getLocalKV('trash_pages')) || [];
      const trashSet = new Map(existingTrash.map(p => [p.id, p]));
      incomingTrashPages.forEach(p => {
        if (p && p.id && !trashSet.has(p.id)) trashSet.set(p.id, p);
      });
      await setLocalKV('trash_pages', Array.from(trashSet.values()));
    }
  }

  emit(++step, totalSteps, 'Local database hydrated successfully.');

  // Emit hydration event so React views reload fresh state
  emitDataHydratedEvent({ strategy, bundleKeys: Object.keys(bundles) });
}

// ============================================================================
// MAIN SYNCHRONIZATION ENGINE (MUTEX & ZERO DESYNC)
// ============================================================================

/**
 * Main Google Drive Cloud Sync routine.
 * Handles Fast check, 2-phase hydration, Anki-style conflict modal invocation,
 * Web Locks mutex locking, and background media sync.
 *
 * @param {object} [options]
 * @param {boolean} [options.force=false]
 * @param {Function} [options.onProgress] Callback (step, total, message)
 * @param {Function} [options.onConflict] Callback for conflict resolution modal
 * @returns {Promise<{ success: boolean, action: string, message: string }>}
 */
export async function syncWithGoogleDrive(options = {}) {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return await navigator.locks.request('autoanki_gdrive_sync', { ifAvailable: true }, async (lock) => {
      if (!lock) {
        return { success: false, action: 'busy', message: 'Sync in progress in another tab.' };
      }
      return await executeSyncInternal(options);
    });
  } else {
    return await executeSyncInternal(options);
  }
}

async function executeSyncInternal({
  force = false,
  interactive = true,
  onProgress = null,
  onConflict = null
} = {}) {
  if (isSyncInProgress) {
    return { success: false, action: 'busy', message: 'Sync already in progress.' };
  }

  const authState = await getGoogleDriveAuthState();
  if (!authState || !authState.accessToken) {
    return { success: false, action: 'unauthenticated', message: 'Google Drive is not connected.' };
  }

  const emit = (step, total, msg) => {
    emitSyncEvent('syncing', { step, total, message: msg });
    if (onProgress) onProgress(step, total, msg);
  };

  isSyncInProgress = true;
  emitSyncEvent('started', { message: 'Initiating Google Drive synchronization…' });

  try {
    const accessToken = await getValidAccessToken(interactive);
    if (!accessToken) {
      if (!interactive) {
        console.log('[GDriveSync] Silent background sync paused: access token expired.');
        return { success: false, action: 'token_expired', message: 'Token expired. Background sync paused.' };
      }
      throw new Error('Could not obtain a valid Google access token. Please re-authenticate.');
    }

    emit(1, 10, 'Connecting to Google Drive Vault…');
    const { vaultFolderId, mediaFolderId } = await ensureSyncVault(accessToken);

    // List files currently in the vault
    const remoteFiles = await listFilesInFolder(accessToken, vaultFolderId);
    const remoteFileMap = new Map(remoteFiles.map(f => [f.name, f]));

    // Fetch remote manifest if present
    let remoteManifest = null;
    const remoteManifestFile = remoteFileMap.get('manifest.json');
    if (remoteManifestFile) {
      emit(2, 10, 'Checking cloud manifest…');
      try {
        remoteManifest = await downloadDriveFile(accessToken, remoteManifestFile.id, true);
      } catch (e) {
        console.warn('[GDriveSync] Could not read remote manifest:', e);
      }
    }

    // Extract local data
    emit(3, 10, 'Calculating local entity checksums…');
    const localData = await extractLocalBundles();
    const localManifest = localData.manifest;

    // Check if cloud vault is completely empty (first-time push)
    if (!remoteManifest) {
      emit(4, 10, 'Uploading initial collection to Google Drive…');
      return await executeOneWayPush(accessToken, vaultFolderId, mediaFolderId, localData, remoteFileMap, emit);
    }

    // Compare hashes
    const localHashes = localManifest.hashes;
    const remoteHashes = remoteManifest.hashes || {};

    const isIdentical = Object.keys(localHashes).every(k => localHashes[k] === remoteHashes[k]);
    if (isIdentical && !force) {
      emit(10, 10, 'Everything is up to date.');
      emitSyncEvent('synced', { message: 'In sync with Google Drive.' });
      return { success: true, action: 'noop', message: 'Everything is up to date.' };
    }

    // Check device ID differences
    const isSameDevice = remoteManifest.deviceId === localManifest.deviceId;

    // Identify which bundles have changed
    const modifiedBundleNames = Object.keys(localData.bundles).filter(name => {
      const bundleKey = name.replace('.json', '');
      return localHashes[bundleKey] !== remoteHashes[bundleKey];
    });

    console.log('[GDriveSync] Modified bundles:', modifiedBundleNames);

    if (modifiedBundleNames.length > 0) {
      // Check if either cards or curriculum conflict between separate devices
      const cardsConflict = localHashes.cards_bundle !== remoteHashes.cards_bundle;
      const topicsConflict = localHashes.curriculum_topics !== remoteHashes.curriculum_topics;
      const pagesConflict = localHashes.pages_bundle !== remoteHashes.pages_bundle;

      // Anki-Style Conflict Detection: Trigger modal if distinct device and conflicting primary content
      if (!isSameDevice && (cardsConflict || topicsConflict || pagesConflict) && onConflict && !force) {
        emitSyncEvent('conflict', { message: 'Conflict detected between local and cloud versions.' });
        const conflictResolution = await new Promise((resolve) => {
          onConflict({
            local: {
              cardsCount: localManifest.stats.cardsCount,
              topicsCount: localManifest.stats.topicsCount,
              logsDaysCount: localManifest.stats.logsDaysCount,
              pagesCount: localManifest.stats.pagesCount,
              timestamp: localManifest.timestamp,
              deviceId: localManifest.deviceId
            },
            remote: {
              cardsCount: remoteManifest.stats?.cardsCount || 0,
              topicsCount: remoteManifest.stats?.topicsCount || 0,
              logsDaysCount: remoteManifest.stats?.logsDaysCount || 0,
              pagesCount: remoteManifest.stats?.pagesCount || 0,
              timestamp: remoteManifest.timestamp,
              deviceId: remoteManifest.deviceId
            },
            onResolve: resolve
          });
        });

        if (conflictResolution === 'upload') {
          return await executeOneWayPush(accessToken, vaultFolderId, mediaFolderId, localData, remoteFileMap, emit);
        } else if (conflictResolution === 'download') {
          return await executeOneWayDownload(accessToken, vaultFolderId, mediaFolderId, remoteFileMap, emit);
        } else {
          emitSyncEvent('cancelled', { message: 'Sync cancelled by user.' });
          return { success: false, action: 'cancelled', message: 'Sync cancelled by user.' };
        }
      }

      // Safe Pre-Merge Snapshot (Rollback Guarantee)
      emit(4, 10, 'Creating pre-sync safety snapshot…');
      try {
        await saveInternalSnapshot('pre_cloud_sync_merge');
      } catch (snapErr) {
        console.warn('[GDriveSync] Pre-merge snapshot warning:', snapErr);
      }

      // Smart delta merge: download remote modified bundles, merge in-memory, push new unified manifest
      emit(5, 10, 'Downloading modified cloud bundles (Phase 1)…');
      const downloadedBundles = {};
      for (const bName of modifiedBundleNames) {
        const rFile = remoteFileMap.get(bName);
        if (rFile) {
          emit(6, 10, `Downloading ${bName}…`);
          downloadedBundles[bName] = await downloadDriveFile(accessToken, rFile.id, true);
        }
      }

      emit(7, 10, 'Merging non-conflicting records…');
      await hydrateLocalBundles(downloadedBundles, 'merge', (s, t, m) => emit(7, 10, m));

      // After merge, re-extract and push unified bundles
      emit(8, 10, 'Pushing synchronized manifest to Drive…');
      const updatedLocalData = await extractLocalBundles();
      return await executeOneWayPush(accessToken, vaultFolderId, mediaFolderId, updatedLocalData, remoteFileMap, emit);
    }

    emit(10, 10, 'Synchronization complete.');
    emitSyncEvent('synced', { message: 'Sync finished successfully.' });
    return { success: true, action: 'synced', message: 'Sync finished successfully.' };
  } catch (err) {
    console.error('[GDriveSync] Sync error:', err);
    emitSyncEvent('error', { error: err.message });
    return { success: false, action: 'error', message: err.message };
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Executes a safe one-way push from LocalDB to Google Drive.
 */
async function executeOneWayPush(accessToken, vaultFolderId, mediaFolderId, localData, remoteFileMap, emit) {
  let step = 4;
  const total = 4 + Object.keys(localData.bundles).length + 2;

  // 1. Upload all partitioned bundles
  for (const [fileName, bundleObj] of Object.entries(localData.bundles)) {
    emit(++step, total, `Uploading ${fileName}…`);
    const existingFile = remoteFileMap.get(fileName);
    await uploadDriveFile(accessToken, vaultFolderId, fileName, bundleObj, existingFile?.id);
  }

  // 2. Upload manifest.json
  emit(++step, total, 'Writing manifest.json…');
  const existingManifest = remoteFileMap.get('manifest.json');
  await uploadDriveFile(accessToken, vaultFolderId, 'manifest.json', localData.manifest, existingManifest?.id);

  // 3. Queue Phase 2: Non-blocking media uploads
  emit(++step, total, 'Sync complete! Media queued in background.');
  emitSyncEvent('synced', {
    lastSynced: localData.manifest.timestamp,
    stats: localData.manifest.stats
  });

  // Background non-blocking media sync (includes active and trash pages)
  setTimeout(() => {
    const allMediaPages = [...(localData.pages || []), ...(localData.trashPages || [])];
    syncMediaToDrive(accessToken, mediaFolderId, allMediaPages).catch(e => {
      console.warn('[GDriveSync] Background media upload error:', e);
    });
  }, 100);

  return { success: true, action: 'uploaded', message: 'Collection uploaded successfully to Google Drive.' };
}

/**
 * Executes a safe one-way download from Google Drive, taking a local snapshot first.
 */
async function executeOneWayDownload(accessToken, vaultFolderId, mediaFolderId, remoteFileMap, emit) {
  emit(1, 6, 'Creating automatic pre-sync local snapshot…');
  await saveInternalSnapshot('pre_cloud_sync_snapshot');

  emit(2, 6, 'Downloading all JSON bundles from Google Drive (Phase 1)…');
  const downloadedBundles = {};
  for (const [name, file] of remoteFileMap.entries()) {
    if (name.endsWith('.json') && name !== 'manifest.json') {
      emit(3, 6, `Downloading ${name}…`);
      downloadedBundles[name] = await downloadDriveFile(accessToken, file.id, true);
    }
  }

  emit(4, 6, 'Replacing local database with cloud collection…');
  await hydrateLocalBundles(downloadedBundles, 'replace', (s, t, m) => emit(5, 6, m));

  emit(6, 6, 'Cloud download complete. Queueing media downloads…');
  emitSyncEvent('synced', { message: 'Cloud collection restored.' });

  // Phase 2: Non-blocking background media download
  setTimeout(() => {
    syncMediaFromDrive(accessToken, mediaFolderId).catch(e => {
      console.warn('[GDriveSync] Background media download error:', e);
    });
  }, 100);

  return { success: true, action: 'downloaded', message: 'Collection successfully downloaded from Google Drive.' };
}

/**
 * Phase 2: Uploads local scanned page images to the Drive /media folder in the background.
 */
async function syncMediaToDrive(accessToken, mediaFolderId, pages) {
  if (!Array.isArray(pages) || pages.length === 0) return;
  const remoteMediaFiles = await listFilesInFolder(accessToken, mediaFolderId);
  const existingNames = new Set(remoteMediaFiles.map(f => f.name));

  const pagesToUpload = pages.filter(p => p && p.id && !existingNames.has(`page_${p.id}.webp`));
  const totalMedia = pagesToUpload.length;
  if (totalMedia === 0) return;

  emitSyncEvent('syncing', {
    message: `Uploading media 0/${totalMedia} (0%)`,
    step: 0,
    total: totalMedia,
    mediaProgress: { current: 0, total: totalMedia, percent: 0, type: 'upload' }
  });

  let uploadedCount = 0;
  for (const page of pagesToUpload) {
    const mediaName = `page_${page.id}.webp`;

    let buffer = null;
    let mimeType = 'image/webp';

    const candidate = page.data || page.originalImage || page.imageUrl;

    if (candidate instanceof ArrayBuffer) {
      buffer = candidate;
    } else if (typeof candidate === 'string' && candidate.startsWith('data:')) {
      const parts = candidate.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      mimeType = mimeMatch ? mimeMatch[1] : 'image/webp';
      buffer = base64ToArrayBuffer(parts[1]);
    } else if (candidate?.__type === 'ArrayBuffer' && candidate.base64) {
      buffer = base64ToArrayBuffer(candidate.base64);
    }

    if (buffer && buffer.byteLength > 0) {
      try {
        await uploadDriveMediaFile(accessToken, mediaFolderId, mediaName, mimeType, buffer);
      } catch (err) {
        console.warn(`[GDriveSync] Failed to upload media ${mediaName}:`, err);
      }
    }

    uploadedCount++;
    const percent = Math.round((uploadedCount / totalMedia) * 100);
    emitSyncEvent('syncing', {
      message: `Uploading media ${uploadedCount}/${totalMedia} (${percent}%)`,
      step: uploadedCount,
      total: totalMedia,
      mediaProgress: { current: uploadedCount, total: totalMedia, percent, type: 'upload' }
    });
  }

  emitSyncEvent('synced', {
    message: `All media synchronized (${totalMedia}/${totalMedia})`
  });
}

/**
 * Phase 2: Downloads missing images from the Drive /media folder in chunked batches.
 */
async function syncMediaFromDrive(accessToken, mediaFolderId) {
  const remoteMedia = await listFilesInFolder(accessToken, mediaFolderId);
  if (remoteMedia.length === 0) return;

  const localPages = (await getLocalPages()) || [];
  const localPageMap = new Map(localPages.map(p => [p.id, p]));
  let hasUpdates = false;

  // Filter missing media files
  const missingFiles = [];
  for (const file of remoteMedia) {
    const match = file.name.match(/^page_(.*?)\./);
    if (!match) continue;
    const pageId = match[1];
    const localPage = localPageMap.get(pageId);
    if (localPage && !localPage.data && !localPage.imageUrl && !localPage.originalImage) {
      missingFiles.push({ file, pageId });
    }
  }

  const totalToDownload = missingFiles.length;
  if (totalToDownload === 0) return;

  emitSyncEvent('syncing', {
    message: `Downloading media 0/${totalToDownload} (0%)`,
    step: 0,
    total: totalToDownload,
    mediaProgress: { current: 0, total: totalToDownload, percent: 0, type: 'download' }
  });

  // Download in throttled batches of 4 to protect mobile RAM
  const BATCH_SIZE = 4;
  let downloadedCount = 0;
  for (let i = 0; i < missingFiles.length; i += BATCH_SIZE) {
    const chunk = missingFiles.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map(async ({ file, pageId }) => {
      try {
        const arrayBuf = await downloadDriveFile(accessToken, file.id, false);
        const localPage = localPageMap.get(pageId);
        if (localPage) {
          localPage.data = arrayBuf;
          localPage.updatedAt = new Date().toISOString();
          hasUpdates = true;
        }
      } catch (e) {
        console.warn(`[GDriveSync] Could not download media for page ${pageId}:`, e);
      }
    }));
    downloadedCount = Math.min(totalToDownload, i + chunk.length);
    const percent = Math.round((downloadedCount / totalToDownload) * 100);
    emitSyncEvent('syncing', {
      message: `Downloading media ${downloadedCount}/${totalToDownload} (${percent}%)`,
      step: downloadedCount,
      total: totalToDownload,
      mediaProgress: { current: downloadedCount, total: totalToDownload, percent, type: 'download' }
    });
  }

  if (hasUpdates) {
    // Re-fetch fresh pages from storage before saving to prevent clobbering concurrent user edits
    const currentPages = (await getLocalPages()) || [];
    const currentMap = new Map(currentPages.map(p => [p.id, p]));
    for (const [id, updatedP] of localPageMap.entries()) {
      if (updatedP.data && currentMap.has(id)) {
        const existingCur = currentMap.get(id);
        if (!existingCur.data) {
          existingCur.data = updatedP.data;
        }
      }
    }
    await saveLocalPages(Array.from(currentMap.values()));
    emitDataHydratedEvent({ type: 'media_hydrated' });
  }

  emitSyncEvent('synced', {
    message: `All media downloaded (${totalToDownload}/${totalToDownload})`
  });
}

// ============================================================================
// AUTOMATIC TRIGGER & HOOK MANAGEMENT
// ============================================================================

/**
 * Triggers a debounced smart push when decks or reviews are completed.
 * Enforces a 5s debounce and a 30s cooldown.
 */
export function triggerDebouncedSmartPush() {
  if (autoSyncDebounceTimer) clearTimeout(autoSyncDebounceTimer);

  autoSyncDebounceTimer = setTimeout(async () => {
    const now = Date.now();
    if (now - lastAutoPushTimestamp < AUTO_PUSH_COOLDOWN_MS) {
      console.log('[GDriveSync] Auto-push skipped due to cooldown window.');
      return;
    }

    const auth = await getGoogleDriveAuthState();
    if (!auth?.accessToken) return;

    lastAutoPushTimestamp = now;
    console.log('[GDriveSync] Triggering debounced smart push to Google Drive…');
    syncWithGoogleDrive({ force: false, interactive: false }).catch(err => {
      console.warn('[GDriveSync] Smart push error:', err);
    });
  }, 5000);
}

/**
 * App Exit handler: flags pending sync for next clean launch without failing 64KB keepalive limit.
 */
export function handleAppExitKeepaliveSync() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('autoanki_pending_sync_launch', 'true');
    }
  } catch (e) {
    console.warn('[GDriveSync] Exit sync flag error:', e);
  }
}

/**
 * Calculates the total storage size (in bytes) of all files stored in the Google Drive AutoAnki_Sync_Vault.
 * @param {string} accessToken
 * @returns {Promise<{ totalBytes: number, vaultFileCount: number, mediaFileCount: number }>}
 */
export async function getGoogleDriveVaultStorageSize(accessToken) {
  if (!accessToken) return { totalBytes: 0, vaultFileCount: 0, mediaFileCount: 0 };
  try {
    const vault = await findDriveItem(accessToken, VAULT_FOLDER_NAME, null, true);
    if (!vault) return { totalBytes: 0, vaultFileCount: 0, mediaFileCount: 0 };

    const vaultFiles = await listFilesInFolder(accessToken, vault.id);
    let totalBytes = 0;
    let vaultFileCount = 0;
    let mediaFileCount = 0;

    let mediaFolderId = null;
    for (const f of vaultFiles) {
      if (f.mimeType === 'application/vnd.google-apps.folder' && f.name === MEDIA_FOLDER_NAME) {
        mediaFolderId = f.id;
      } else if (f.mimeType !== 'application/vnd.google-apps.folder') {
        totalBytes += Number(f.size) || 0;
        vaultFileCount++;
      }
    }

    if (mediaFolderId) {
      const mediaFiles = await listFilesInFolder(accessToken, mediaFolderId);
      for (const m of mediaFiles) {
        if (m.mimeType !== 'application/vnd.google-apps.folder') {
          totalBytes += Number(m.size) || 0;
          mediaFileCount++;
        }
      }
    }

    return { totalBytes, vaultFileCount, mediaFileCount };
  } catch (err) {
    console.warn('[GDriveSync] Could not calculate vault storage size:', err);
    return { totalBytes: 0, vaultFileCount: 0, mediaFileCount: 0 };
  }
}

// ============================================================================
// REAL-TIME GOOGLE DRIVE TIMER SYNCHRONIZATION ENGINE
// ============================================================================

export const TIMER_STATE_FILE = 'timer_state.json';
let lastPushedTimerTimestamp = 0;
let lastKnownRemoteTimerModified = null;
let timerPushDebounceTimer = null;

/**
 * Pushes the local timer state to Google Drive AutoAnki_Sync_Vault.
 * @param {object} timerState
 * @param {boolean} [immediate=true]
 */
export async function pushTimerStateToDrive(timerState, immediate = true) {
  if (!timerState) return;

  const auth = await getGoogleDriveAuthState();
  if (!auth?.accessToken) return;

  const doPush = async () => {
    try {
      const { vaultFolderId } = await ensureSyncVault(auth.accessToken);
      const existingFile = await findDriveItem(auth.accessToken, TIMER_STATE_FILE, vaultFolderId);

      const deviceId = getOrCreateDeviceId();
      const payload = {
        timerType: timerState.timerType || 'pomodoro',
        pomodoroStatus: timerState.pomodoroStatus || 'idle',
        pomodoroDuration: timerState.pomodoroDuration || 1500,
        pomodoroBreakDuration: timerState.pomodoroBreakDuration || 300,
        pomodoroLongBreakDuration: timerState.pomodoroLongBreakDuration || 1200,
        pomodoroTargetRounds: timerState.pomodoroTargetRounds || 4,
        pomodoroTimeLeft: timerState.pomodoroTimeLeft || 1500,
        pomodoroTimeLeftAtStart: timerState.pomodoroTimeLeftAtStart || 1500,
        pomodoroStartedAt: timerState.pomodoroStartedAt || null,
        pomodoroMode: timerState.pomodoroMode || 'study',
        pomodoroRounds: timerState.pomodoroRounds || 0,
        timerStatus: timerState.timerStatus || 'idle',
        timerDuration: timerState.timerDuration || 600,
        timerTimeLeft: timerState.timerTimeLeft || 600,
        timerTimeLeftAtStart: timerState.timerTimeLeftAtStart || 600,
        timerStartedAt: timerState.timerStartedAt || null,
        stopwatchStatus: timerState.stopwatchStatus || 'idle',
        stopwatchStartedAt: timerState.stopwatchStartedAt || null,
        stopwatchElapsedBeforePause: timerState.stopwatchElapsedBeforePause || 0,
        stopwatchLaps: timerState.stopwatchLaps || [],
        updatedAt: Date.now(),
        deviceId
      };

      lastPushedTimerTimestamp = payload.updatedAt;
      const uploaded = await uploadDriveFile(auth.accessToken, vaultFolderId, TIMER_STATE_FILE, payload, existingFile?.id);
      if (uploaded?.modifiedTime) {
        lastKnownRemoteTimerModified = uploaded.modifiedTime;
      }
    } catch (err) {
      console.warn('[GDriveTimer] Failed to push timer state to Drive:', err);
    }
  };

  if (timerPushDebounceTimer) clearTimeout(timerPushDebounceTimer);

  if (immediate) {
    await doPush();
  } else {
    timerPushDebounceTimer = setTimeout(doPush, 500);
  }
}

/**
 * Checks if a newer remote timer state exists in Google Drive and applies it.
 * @param {Function} onRemoteUpdate Callback with the new remote timer state
 * @returns {Promise<boolean>} True if remote state was applied
 */
export async function checkAndSyncRemoteTimerState(onRemoteUpdate) {
  try {
    const auth = await getGoogleDriveAuthState();
    if (!auth?.accessToken) return false;

    const { vaultFolderId } = await ensureSyncVault(auth.accessToken);
    const remoteFile = await findDriveItem(auth.accessToken, TIMER_STATE_FILE, vaultFolderId);
    if (!remoteFile) return false;

    if (lastKnownRemoteTimerModified && remoteFile.modifiedTime <= lastKnownRemoteTimerModified) {
      return false;
    }

    const remoteState = await downloadDriveFile(auth.accessToken, remoteFile.id, true);
    if (!remoteState || typeof remoteState !== 'object') return false;

    lastKnownRemoteTimerModified = remoteFile.modifiedTime;

    const localDeviceId = getOrCreateDeviceId();
    // Ignore if update originated from this same device earlier
    if (remoteState.deviceId === localDeviceId && remoteState.updatedAt <= lastPushedTimerTimestamp) {
      return false;
    }

    if (remoteState.updatedAt && remoteState.updatedAt > lastPushedTimerTimestamp) {
      if (typeof onRemoteUpdate === 'function') {
        onRemoteUpdate(remoteState);
      }
      return true;
    }

    return false;
  } catch (err) {
    console.warn('[GDriveTimer] Error checking remote timer state:', err);
    return false;
  }
}



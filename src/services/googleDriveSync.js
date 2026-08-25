/**
 * googleDriveSync.js - Manifest-Hashed Delta Cloud Synchronization Engine for AutoAnki
 *
 * Implements partitioned chunk cloud storage, two-phase hydration, Anki-style conflict detection,
 * automatic pre-sync local snapshots, debounced smart push, and background media transfer.
 */

import {
  getValidAccessToken,
  getGoogleDriveAuthState
} from './googleDriveAuth.js';

import {
  getAllLocalItems,
  getLocalItem,
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
  deserializeBinaryValues,
  LS_KEYS_TO_SNAPSHOT,
  setMutationNotificationSuppressed
} from './localDb.js';
import logger from './logger.js';

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
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  return '{' + sortedKeys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

/**
 * Computes a fast, deterministic, collision-resistant 64-bit dual-seed FNV-1a hex hash.
 * @param {string|object} input 
 * @returns {string} 16-character hex string
 */
export function computeHash(input) {
  const str = typeof input === 'string' ? input : canonicalStringify(input);
  let hash1 = 0x811c9dc5;
  let hash2 = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    hash1 ^= code;
    hash1 = (hash1 * 0x01000193) >>> 0;
    hash2 ^= code;
    hash2 = ((hash2 * 0x01000193) + (hash1 >>> 5)) >>> 0;
  }
  return hash1.toString(16).padStart(8, '0') + hash2.toString(16).padStart(8, '0');
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

  // 2. Curriculum Topics Bundle (with Tombstone Support)
  const topics = (await getAllLocalTopics()) || [];
  const trashTopics = (await getLocalKV('trash_topics')) || [];
  const pytData = (await getAllLocalItems(STORES.PYT_DATA)) || [];
  const subjectTracker = (await getLocalKV('subject_tracker_data')) || [];
  const pytUserProgress = (await getLocalKV('pyt_user_progress')) || [];
  const textbooksMetadata = (await getLocalKV('textbooks_metadata')) || [];
  const curriculumBundle = {
    topics: serializeBinaryValues(topics),
    trashTopics: serializeBinaryValues(trashTopics),
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
  const activeNewTopicsList = (await getLocalKV('active_new_topics_' + syncTodayStr)) || (await getLocalKV('active_new_topics_today')) || [];
  const studyLogsBundle = {
    studyLogs,
    studySchedule,
    scheduleTemplates,
    campDailyLogs,
    timerState,
    activeNewTopicsDate: syncTodayStr,
    activeNewTopicsToday: activeNewTopicsList
  };

  // 4. FSRS Config & Settings Bundle (including 24 synchronized localStorage settings)
  const fsrsConfig = (await getFSRSConfig()) || {};
  const settings = (await getAllLocalItems(STORES.SETTINGS)) || [];
  const filteredSettings = settings.filter(s => s?.key !== 'google_drive_auth');
  const topicHints = (await getAllLocalItems(STORES.TOPIC_HINTS)) || [];
  const hintQuota = (await getAllLocalItems(STORES.HINT_QUOTA)) || [];
  const customPrompts = (await getLocalKV('custom_prompts')) || [];
  const localUserProfile = (await getLocalKV('local_user_profile')) || null;
  const aiRecommendations = (await getLocalKV('ai_topic_recommendations_' + syncTodayStr)) || (await getLocalKV('ai_topic_recommendations')) || null;

  const localStorageSnapshot = {};
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      (LS_KEYS_TO_SNAPSHOT || []).forEach(key => {
        const val = localStorage.getItem(key);
        if (val !== null && val !== undefined) localStorageSnapshot[key] = val;
      });
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && (k.startsWith('camp_sessions_') || k.startsWith('camp_bedToBook_'))) {
          const val = window.localStorage.getItem(k);
          if (val !== null && val !== undefined) localStorageSnapshot[k] = val;
        }
      }
    } catch (e) {
      console.warn('[GDriveSync] Error capturing localStorage settings:', e);
    }
  }

  const fsrsBundle = {
    fsrsConfig,
    settings: filteredSettings,
    topicHints,
    hintQuota,
    customPrompts,
    localUserProfile,
    aiRecommendations,
    localStorageSnapshot
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

  // Suppress local mutation notifications during bulk bundle hydration to prevent auto-push feedback loops
  setMutationNotificationSuppressed(true);
  try {
  // 1. Cards Bundle (Timestamp-Aware, Tombstone Pruning & FSRS Safe)
  if (bundles['cards_bundle.json']) {
    emit(++step, totalSteps, 'Hydrating Flashcards & FSRS memory statesΓÇª');
    const b = bundles['cards_bundle.json'];
    const incomingCards = deserializeBinaryValues(b.flashcards || []);
    const incomingTrash = deserializeBinaryValues(b.trashCards || []);

    if (strategy === 'replace') {
      await setLocalKV('flashcards', incomingCards);
      await setLocalKV('trash_cards', incomingTrash);
    } else {
      // Merge cards by ID with safe timestamp check & trash tombstone awareness
      const existing = (await getLocalKV('flashcards')) || [];
      const localTrash = (await getLocalKV('trash_cards')) || [];
      const localTrashMap = new Map(localTrash.map(c => [c.id, safeTimestamp(c.deletedAt)]));
      const incomingTrashMap = new Map(incomingTrash.map(c => [c.id, safeTimestamp(c.deletedAt)]));
      const map = new Map(existing.map(c => [c.id, c]));

      incomingCards.forEach(inc => {
        if (inc && inc.id) {
          const localDeletedAt = localTrashMap.get(inc.id);
          const incTime = safeTimestamp(inc.updatedAt || inc.lastReviewDate || inc.createdAt);
          if (localDeletedAt && localDeletedAt > incTime) {
            return;
          }

          const localCard = map.get(inc.id);
          if (!localCard) {
            map.set(inc.id, inc);
          } else {
            const localRevTime = safeTimestamp(localCard.lastReviewDate || 0);
            const incRevTime = safeTimestamp(inc.lastReviewDate || 0);
            
            let latestRev = localCard;
            if (incRevTime > localRevTime) {
              latestRev = inc;
            } else if (localRevTime > incRevTime) {
              latestRev = localCard;
            } else {
              // Tie-break: prefer higher stability, then higher reps
              const incStab = Number(inc.stability || 0);
              const locStab = Number(localCard.stability || 0);
              if (incStab > locStab) {
                latestRev = inc;
              } else if (locStab > incStab) {
                latestRev = localCard;
              } else {
                const incReps = Number(inc.reps || 0);
                const locReps = Number(localCard.reps || 0);
                latestRev = incReps > locReps ? inc : localCard;
              }
            }

            const localContentTime = safeTimestamp(localCard.updatedAt || localCard.createdAt || 0);
            const incContentTime = safeTimestamp(inc.updatedAt || inc.createdAt || 0);
            const latestContent = incContentTime >= localContentTime ? inc : localCard;

            // Merge: preserve latest content edits AND latest FSRS review parameters
            const mergedCard = {
              ...localCard,
              ...inc,
              ...latestContent,
              stability: latestRev.stability !== undefined ? latestRev.stability : (latestContent.stability ?? 0),
              difficulty: latestRev.difficulty !== undefined ? latestRev.difficulty : (latestContent.difficulty ?? 0),
              reps: latestRev.reps !== undefined ? latestRev.reps : (latestContent.reps ?? 0),
              lapses: latestRev.lapses !== undefined ? latestRev.lapses : (latestContent.lapses ?? 0),
              due: latestRev.due || latestContent.due,
              state: latestRev.state !== undefined ? latestRev.state : latestContent.state,
              lastReviewDate: latestRev.lastReviewDate || latestContent.lastReviewDate,
              scheduledDays: latestRev.scheduledDays !== undefined ? latestRev.scheduledDays : latestContent.scheduledDays,
              history: Array.isArray(latestRev.history) && latestRev.history.length > 0 ? latestRev.history : (latestContent.history || []),
              updatedAt: new Date(Math.max(localContentTime, incContentTime, localRevTime, incRevTime, Date.now())).toISOString()
            };
            map.set(inc.id, mergedCard);
          }
        }
      });

      // Tombstone pruning: remove any local card that was deleted in the incoming trash
      for (const [id, card] of map.entries()) {
        const remoteDeletedAt = incomingTrashMap.get(id);
        if (remoteDeletedAt) {
          const localCardTime = safeTimestamp(card.updatedAt || card.lastReviewDate || card.createdAt);
          if (remoteDeletedAt > localCardTime) {
            map.delete(id);
          }
        }
      }

      await setLocalKV('flashcards', Array.from(map.values()));

      // Merge trash cards with latest deletedAt
      const mergedTrashMap = new Map(localTrash.map(c => [c.id, c]));
      incomingTrash.forEach(c => {
        if (c && c.id) {
          const exist = mergedTrashMap.get(c.id);
          if (!exist || safeTimestamp(c.deletedAt) > safeTimestamp(exist.deletedAt)) {
            mergedTrashMap.set(c.id, c);
          }
        }
      });
      await setLocalKV('trash_cards', Array.from(mergedTrashMap.values()));
    }
  }

  // 2. Curriculum Topics
  if (bundles['curriculum_topics.json']) {
    emit(++step, totalSteps, 'Hydrating Curriculum Topics & PYT ProgressΓÇª');
    const b = bundles['curriculum_topics.json'];
    const incomingTopics = deserializeBinaryValues(b.topics || []);
    const incomingTrashTopics = deserializeBinaryValues(b.trashTopics || []);
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

      await setLocalKV('trash_topics', incomingTrashTopics);

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
        const localTrashTopics = (await getLocalKV('trash_topics')) || [];
        const localTrashMap = new Map(localTrashTopics.map(t => [t.id, safeTimestamp(t.deletedAt)]));
        const incomingTrashMap = new Map(incomingTrashTopics.map(t => [t.id, safeTimestamp(t.deletedAt)]));
        const topMap = new Map(existingTopics.map(t => [t.id, t]));

        incomingTopics.forEach(incT => {
          if (incT && incT.id) {
            const localDeletedAt = localTrashMap.get(incT.id);
            const incTime = safeTimestamp(incT.updatedAt || incT.createdAt);
            if (localDeletedAt && localDeletedAt > incTime) return;

            const locT = topMap.get(incT.id);
            if (!locT) {
              topMap.set(incT.id, incT);
            } else {
              const locTime = safeTimestamp(locT.updatedAt || locT.createdAt);
              topMap.set(incT.id, incTime >= locTime ? { ...locT, ...incT } : { ...incT, ...locT });
            }
          }
        });

        // Prune topics deleted remotely
        for (const [id, topic] of topMap.entries()) {
          const remoteDeletedAt = incomingTrashMap.get(id);
          if (remoteDeletedAt) {
            const localTopicTime = safeTimestamp(topic.updatedAt || topic.createdAt);
            if (remoteDeletedAt > localTopicTime) {
              topMap.delete(id);
            }
          }
        }

        await saveAllLocalTopics(Array.from(topMap.values()));

        // Merge trash topics
        const mergedTrashTopics = new Map(localTrashTopics.map(t => [t.id, t]));
        incomingTrashTopics.forEach(t => {
          if (t && t.id) {
            const exist = mergedTrashTopics.get(t.id);
            if (!exist || safeTimestamp(t.deletedAt) > safeTimestamp(exist.deletedAt)) {
              mergedTrashTopics.set(t.id, t);
            }
          }
        });
        await setLocalKV('trash_topics', Array.from(mergedTrashTopics.values()));
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

  // 3. Study Logs (Deep Merging & Session/GT Unioning)
  if (bundles['study_logs.json']) {
    emit(++step, totalSteps, 'Hydrating Study Logs & Velocity TelemetryΓÇª');
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
      // Deep-merge study logs by date with session unioning
      const existing = (await getLocalStudyLogs()) || {};
      const merged = { ...existing };

      for (const [dateKey, incLog] of Object.entries(incomingLogs)) {
        if (!merged[dateKey]) {
          merged[dateKey] = incLog;
        } else {
          const cur = merged[dateKey];
          const existingFsrs = Array.isArray(cur.fsrsLogs) ? cur.fsrsLogs : [];
          const incomingFsrs = Array.isArray(incLog?.fsrsLogs) ? incLog.fsrsLogs : [];

          // Union FSRS logs by unique review timestamp or deterministic content key
          const fsrsMap = new Map();
          const getFsrsKey = (l) => l.id || (l.cardId && l.timestamp ? `${l.cardId}_${l.rating || 'r'}_${l.timestamp}` : computeHash(canonicalStringify(l)));
          existingFsrs.forEach(l => { if (l) fsrsMap.set(getFsrsKey(l), l); });
          incomingFsrs.forEach(l => { if (l) { const k = getFsrsKey(l); if (!fsrsMap.has(k)) fsrsMap.set(k, l); } });

          // Union study sessions by unique session ID or deterministic content key
          const existingSessions = Array.isArray(cur.sessions) ? cur.sessions : [];
          const incomingSessions = Array.isArray(incLog?.sessions) ? incLog.sessions : [];
          const sessionMap = new Map();
          const getSessionKey = (s) => s.id || (s.subject && s.startedAt ? `${s.subject}_${s.startedAt}_${s.duration || 0}` : computeHash(canonicalStringify(s)));
          existingSessions.forEach(s => { if (s) sessionMap.set(getSessionKey(s), s); });
          incomingSessions.forEach(s => { if (s) { const k = getSessionKey(s); if (!sessionMap.has(k)) sessionMap.set(k, s); } });

          // Union Grand Tests (GTs)
          const existingGts = Array.isArray(cur.gts) ? cur.gts : [];
          const incomingGts = Array.isArray(incLog?.gts) ? incLog.gts : [];
          const gtMap = new Map();
          const getGtKey = (g) => g.id || (g.testName && (g.date || g.timestamp) ? `${g.testName}_${g.date || g.timestamp}` : computeHash(canonicalStringify(g)));
          existingGts.forEach(g => { if (g) gtMap.set(getGtKey(g), g); });
          incomingGts.forEach(g => { if (g) { const k = getGtKey(g); if (!gtMap.has(k)) gtMap.set(k, g); } });

          const allSessions = Array.from(sessionMap.values());
          const sessionHours = allSessions.reduce((sum, s) => sum + (Number(s.duration || s.minutes || 0) / 60 || Number(s.hours || 0)), 0);
          const totalHours = sessionHours > 0 ? Number(sessionHours.toFixed(2)) : Math.max(cur.studyHours || cur.hours || 0, incLog?.studyHours || incLog?.hours || 0);

          const totalCards = Math.max(cur.totalCardsReviewed || cur.cards || 0, incLog?.totalCardsReviewed || incLog?.cards || 0, fsrsMap.size);
          const totalQuestions = Math.max(cur.totalQuestionsAttempted || cur.questions || 0, incLog?.totalQuestionsAttempted || incLog?.questions || 0);

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
            fsrsLogs: Array.from(fsrsMap.values()),
            sessions: allSessions,
            gts: Array.from(gtMap.values())
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
          if (log && log.dateStr) {
            const existingLog = await getLocalItem(STORES.CAMP_DAILY_LOGS, log.dateStr);
            if (!existingLog) {
              await putLocalItem(STORES.CAMP_DAILY_LOGS, log);
            } else {
              const mergedSessions = Array.isArray(existingLog.sessions) ? [...existingLog.sessions] : [];
              const existSessionKeys = new Set(mergedSessions.map(s => s?.id || s?.startedAt || (s ? s.subject + '_' + s.duration : '')));
              const incomingSessions = Array.isArray(log.sessions) ? log.sessions : [];
              incomingSessions.forEach(s => {
                if (s) {
                  const k = s.id || s.startedAt || (s.subject + '_' + s.duration);
                  if (!existSessionKeys.has(k)) {
                    mergedSessions.push(s);
                  }
                }
              });
              await putLocalItem(STORES.CAMP_DAILY_LOGS, {
                ...existingLog,
                ...log,
                sessions: mergedSessions,
                bedToBook: log.bedToBook || existingLog.bedToBook
              });
            }
          }
        }
      }
      if (Array.isArray(b.activeNewTopicsToday)) {
        const targetDateStr = b.activeNewTopicsDate || new Date().toLocaleDateString('en-CA');
        await setLocalKV('active_new_topics_' + targetDateStr, b.activeNewTopicsToday);
        await setLocalKV('active_new_topics_today', b.activeNewTopicsToday);
      }
    }
  }

  // 4. FSRS Config & Settings (including synchronized localStorage settings)
  if (bundles['fsrs_config.json']) {
    emit(++step, totalSteps, 'Hydrating FSRS-6 Config, Hints & PreferencesΓÇª');
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

    // Hydrate localStorage snapshot settings into browser localStorage
    if (b.localStorageSnapshot && typeof b.localStorageSnapshot === 'object') {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const DEVICE_SPECIFIC_KEYS = new Set([
            'autoanki_device_id',
            'local_device_id',
            'obs_device_id',
            'autoanki_gdrive_auth',
            'autoanki_pending_sync_launch',
            'auto_anki_last_auto_backup',
            'auto_anki_last_manual_backup'
          ]);
          Object.entries(b.localStorageSnapshot).forEach(([k, v]) => {
            if (v !== null && v !== undefined && !DEVICE_SPECIFIC_KEYS.has(k)) {
              localStorage.setItem(k, v);
            }
          });
        }
      } catch (e) {
        console.warn('[GDriveSync] Error hydrating localStorage settings:', e);
      }
    }
  }

  // 5. CAMP Tracker
  if (bundles['camp_tracker.json']) {
    emit(++step, totalSteps, 'Hydrating CAMP tracker logsΓÇª');
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

  // 6. Scanned Pages & Image Occlusions (Zero-Data-Loss Restoration with Tombstone Pruning)
  if (bundles['pages_bundle.json']) {
    emit(++step, totalSteps, 'Hydrating Scanned Pages & Image OcclusionsΓÇª');
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
      const localTrashMap = new Map(localTrashPages.map(p => [p.id, safeTimestamp(p.deletedAt)]));
      const incomingTrashMap = new Map(incomingTrashPages.map(p => [p.id, safeTimestamp(p.deletedAt)]));
      const map = new Map(existing.map(p => [p.id, p]));

      incomingPages.forEach(p => {
        if (p && p.id) {
          const localDeletedAt = localTrashMap.get(p.id);
          const incTime = safeTimestamp(p.updatedAt || p.createdAt);
          if (localDeletedAt && localDeletedAt > incTime) {
            // Page was deleted locally after incoming version was updated
            return;
          }

          const localP = map.get(p.id);
          if (!localP) {
            map.set(p.id, p);
          } else {
            const locTime = safeTimestamp(localP.updatedAt || localP.createdAt);
            map.set(p.id, {
              ...(incTime >= locTime ? { ...localP, ...p } : { ...p, ...localP }),
              data: localP.data || p.data,
              originalImage: localP.originalImage || p.originalImage,
              imageUrl: localP.imageUrl || p.imageUrl
            });
          }
        }
      });

      // Tombstone pruning: remove any local page that was deleted in incoming trash
      for (const [id, page] of map.entries()) {
        const remoteDeletedAt = incomingTrashMap.get(id);
        if (remoteDeletedAt) {
          const localPageTime = safeTimestamp(page.updatedAt || page.createdAt);
          if (remoteDeletedAt > localPageTime) {
            map.delete(id);
          }
        }
      }

      await setLocalKV('pages', Array.from(map.values()));

      // Merge trash pages with latest deletedAt
      const mergedTrashPages = new Map(localTrashPages.map(p => [p.id, p]));
      incomingTrashPages.forEach(p => {
        if (p && p.id) {
          const exist = mergedTrashPages.get(p.id);
          if (!exist || safeTimestamp(p.deletedAt) > safeTimestamp(exist.deletedAt)) {
            mergedTrashPages.set(p.id, p);
          }
        }
      });
      await setLocalKV('trash_pages', Array.from(mergedTrashPages.values()));
    }
  }

  emit(++step, totalSteps, 'Local database hydrated successfully.');

  // Emit hydration event so React views reload fresh state
  emitDataHydratedEvent({ strategy, bundleKeys: Object.keys(bundles) });
  } finally {
    setMutationNotificationSuppressed(false);
  }
}

/**
 * Builds a rich, human-readable breakdown of differences between Local Device and Google Drive Cloud.
 */
function buildConflictDiffDetails(localManifest, remoteManifest, modifiedBundleNames, localHashes, remoteHashes) {
  const localTime = new Date(localManifest?.timestamp || 0).getTime();
  const remoteTime = new Date(remoteManifest?.timestamp || 0).getTime();
  const timeDiffMs = Math.abs(localTime - remoteTime);
  const timeDiffMinutes = Math.round(timeDiffMs / 60000);

  let timeRelation = 'equal';
  let timeDiffText = 'Both versions were saved around the same time.';
  if (localTime > remoteTime) {
    timeRelation = 'local_newer';
    timeDiffText = timeDiffMinutes >= 60
      ? `Local device was saved ~${Math.round(timeDiffMinutes / 60)} hour(s) more recently than Cloud`
      : `Local device was saved ${timeDiffMinutes || '< 1'} minute(s) more recently than Cloud`;
  } else if (remoteTime > localTime) {
    timeRelation = 'remote_newer';
    timeDiffText = timeDiffMinutes >= 60
      ? `Cloud version was saved ~${Math.round(timeDiffMinutes / 60)} hour(s) more recently than Local`
      : `Cloud version was saved ${timeDiffMinutes || '< 1'} minute(s) more recently than Local`;
  }

  const bundleDifferences = [];

  const BUNDLE_META = {
    'cards_bundle.json': {
      title: 'Flashcards & FSRS Review States',
      icon: 'Layers',
      describe: (loc, rem) => {
        const lCount = loc?.stats?.cardsCount ?? 0;
        const rCount = rem?.stats?.cardsCount ?? 0;
        if (lCount !== rCount) {
          const diff = lCount - rCount;
          return {
            badge: diff > 0 ? `+${diff} Local Cards` : `${diff} Cloud Cards`,
            badgeType: 'warning',
            diffSummary: `Card counts differ: Local has ${lCount.toLocaleString()} vs Cloud has ${rCount.toLocaleString()} cards.`,
            localDetail: `${lCount.toLocaleString()} cards (${diff > 0 ? `+${diff} added locally` : ''})`,
            remoteDetail: `${rCount.toLocaleString()} cards (${diff < 0 ? `+${Math.abs(diff)} in cloud` : ''})`
          };
        }
        return {
          badge: 'Review States & Content Updated',
          badgeType: 'info',
          diffSummary: `Card count is identical (${lCount.toLocaleString()}), but review logs, FSRS memory stability, ratings, or tags were updated on another device.`,
          localDetail: `${lCount.toLocaleString()} cards (Local FSRS states & edits)`,
          remoteDetail: `${rCount.toLocaleString()} cards (Cloud FSRS states & edits)`
        };
      }
    },
    'pages_bundle.json': {
      title: 'Scanned Pages & Image Occlusions',
      icon: 'FileText',
      describe: (loc, rem) => {
        const lCount = loc?.stats?.pagesCount ?? 0;
        const rCount = rem?.stats?.pagesCount ?? 0;
        if (lCount !== rCount) {
          return {
            badge: `Page Count Differs`,
            badgeType: 'warning',
            diffSummary: `Scanned textbook/note pages differ: Local (${lCount}) vs Cloud (${rCount}).`,
            localDetail: `${lCount} scanned pages`,
            remoteDetail: `${rCount} scanned pages`
          };
        }
        return {
          badge: 'Page Occlusions / Notes Modified',
          badgeType: 'info',
          diffSummary: `Scanned pages contain different occlusion boxes, topic links, or metadata.`,
          localDetail: `${lCount} pages (Local edits)`,
          remoteDetail: `${rCount} pages (Cloud version)`
        };
      }
    },
    'study_logs.json': {
      title: 'Study History & Daily Hours',
      icon: 'Clock',
      describe: (loc, rem) => {
        const lCount = loc?.stats?.logsDaysCount ?? 0;
        const rCount = rem?.stats?.logsDaysCount ?? 0;
        return {
          badge: 'Study Sessions & Hours Differ',
          badgeType: 'info',
          diffSummary: `Study logs or logged study sessions differ between your devices.`,
          localDetail: `${lCount} logged study days`,
          remoteDetail: `${rCount} logged study days`
        };
      }
    },
    'curriculum_topics.json': {
      title: 'Subject Tracker & Curriculum',
      icon: 'BookOpen',
      describe: (loc, rem) => {
        const lCount = loc?.stats?.topicsCount ?? 0;
        const rCount = rem?.stats?.topicsCount ?? 0;
        return {
          badge: lCount !== rCount ? `Topics Differ` : `Progress Checkmarks Differ`,
          badgeType: 'info',
          diffSummary: `Curriculum topics, read checkboxes, or subject progress were modified.`,
          localDetail: `${lCount} curriculum topics`,
          remoteDetail: `${rCount} curriculum topics`
        };
      }
    },
    'study_schedule.json': {
      title: 'Study Scheduler & Templates',
      icon: 'Calendar',
      describe: () => ({
        badge: 'Calendar Modified',
        badgeType: 'info',
        diffSummary: `Study schedule calendar events or study plan templates differ.`,
        localDetail: `Local study calendar`,
        remoteDetail: `Cloud study calendar`
      })
    },
    'camp_tracker.json': {
      title: 'CAMP Tracker & Performance Metrics',
      icon: 'Activity',
      describe: () => ({
        badge: 'CAMP Logs Differ',
        badgeType: 'info',
        diffSummary: `CAMP daily concentration, alertness, mastery, and performance ratings differ.`,
        localDetail: `Local CAMP entries`,
        remoteDetail: `Cloud CAMP entries`
      })
    },
    'fsrs_config.json': {
      title: 'Topic Hints, FSRS Config & Settings',
      icon: 'Settings',
      describe: () => ({
        badge: 'Settings & Prompts Modified',
        badgeType: 'info',
        diffSummary: `Topic hints, FSRS parameters, custom AI prompts, or user preferences differ.`,
        localDetail: `Local settings & config`,
        remoteDetail: `Cloud settings & config`
      })
    }
  };

  for (const bName of (modifiedBundleNames || [])) {
    const meta = BUNDLE_META[bName] || {
      title: bName.replace('.json', '').replace(/_/g, ' ').toUpperCase(),
      icon: 'Layers',
      describe: () => ({
        badge: 'Modified',
        badgeType: 'info',
        diffSummary: `${bName} differs between local device and Google Drive cloud.`,
        localDetail: 'Modified locally',
        remoteDetail: 'Modified in cloud'
      })
    };

    const details = meta.describe(localManifest, remoteManifest);
    bundleDifferences.push({
      bundleName: bName,
      title: meta.title,
      icon: meta.icon,
      ...details
    });
  }

  let recommendation = 'merge';
  let recommendationText = 'Smart Merge is recommended to combine all new cards, reviews, and logs from both devices with zero data loss.';
  if (timeRelation === 'local_newer' && timeDiffMinutes >= 5) {
    recommendationText = `Local device has newer activity (${timeDiffText}). Smart Merge is recommended to keep all new changes, or Upload Local if you want to replace Cloud entirely.`;
  } else if (timeRelation === 'remote_newer' && timeDiffMinutes >= 5) {
    recommendationText = `Cloud has newer activity from another device (${timeDiffText}). Smart Merge is recommended to retain everything, or Download Cloud to replace local.`;
  }

  return {
    timeRelation,
    timeDiffText,
    timeDiffMinutes,
    bundleDifferences,
    recommendation,
    recommendationText
  };
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
// Storage key prefix for last known synchronized bundle hashes per device
const LAST_SYNCED_HASHES_PREFIX = 'autoanki_synced_hashes_';

function getDeviceAncestorKey() {
  return `${LAST_SYNCED_HASHES_PREFIX}${getDeviceId()}`;
}

async function getLastSyncedHashes() {
  try {
    const key = getDeviceAncestorKey();
    const fromIdb = await getLocalKV(key);
    if (fromIdb && typeof fromIdb === 'object') return fromIdb;
    // Fallback to legacy shared key if migrating
    const legacy = await getLocalKV('autoanki_last_synced_hashes');
    if (legacy && typeof legacy === 'object') return legacy;
  } catch (e) {
    console.warn('[GDriveSync] Error getting last synced hashes from LocalDB:', e);
  }
  return null;
}

async function saveLastSyncedHashes(hashes) {
  if (!hashes || typeof hashes !== 'object') return;
  try {
    await setLocalKV(getDeviceAncestorKey(), hashes);
  } catch (e) {
    console.warn('[GDriveSync] Error saving last synced hashes to LocalDB:', e);
  }
}

/**
 * Merges local bundles with downloaded remote bundles completely in-memory,
 * producing a new staged bundle set and manifest without mutating IndexedDB.
 */
export function mergeBundlesInMemory(localData, downloadedBundles) {
  const localBundles = localData.bundles || {};
  const merged = { ...localBundles };

  // 1. Cards Bundle (Timestamp-aware, Tie-breaking & Tombstone Pruning)
  if (downloadedBundles['cards_bundle.json']) {
    const locCardsB = localBundles['cards_bundle.json'] || {};
    const remCardsB = downloadedBundles['cards_bundle.json'] || {};
    const locCards = deserializeBinaryValues(locCardsB.flashcards || []);
    const locTrash = deserializeBinaryValues(locCardsB.trashCards || []);
    const remCards = deserializeBinaryValues(remCardsB.flashcards || []);
    const remTrash = deserializeBinaryValues(remCardsB.trashCards || []);

    const locTrashMap = new Map(locTrash.map(c => [c.id, safeTimestamp(c.deletedAt)]));
    const remTrashMap = new Map(remTrash.map(c => [c.id, safeTimestamp(c.deletedAt)]));
    const cardMap = new Map(locCards.map(c => [c.id, c]));

    remCards.forEach(inc => {
      if (inc && inc.id) {
        const localDeletedAt = locTrashMap.get(inc.id);
        const incTime = safeTimestamp(inc.updatedAt || inc.lastReviewDate || inc.createdAt);
        if (localDeletedAt && localDeletedAt > incTime) return;

        const localCard = cardMap.get(inc.id);
        if (!localCard) {
          cardMap.set(inc.id, inc);
        } else {
          const localRevTime = safeTimestamp(localCard.lastReviewDate || 0);
          const incRevTime = safeTimestamp(inc.lastReviewDate || 0);

          let latestRev = localCard;
          if (incRevTime > localRevTime) {
            latestRev = inc;
          } else if (localRevTime > incRevTime) {
            latestRev = localCard;
          } else {
            // Tie-break: prefer higher stability, then higher reps
            const incStab = Number(inc.stability || 0);
            const locStab = Number(localCard.stability || 0);
            if (incStab > locStab) {
              latestRev = inc;
            } else if (locStab > incStab) {
              latestRev = localCard;
            } else {
              const incReps = Number(inc.reps || 0);
              const locReps = Number(localCard.reps || 0);
              latestRev = incReps > locReps ? inc : localCard;
            }
          }

          const localContentTime = safeTimestamp(localCard.updatedAt || localCard.createdAt || 0);
          const incContentTime = safeTimestamp(inc.updatedAt || inc.createdAt || 0);
          const latestContent = incContentTime >= localContentTime ? inc : localCard;

          const mergedCard = {
            ...localCard,
            ...inc,
            ...latestContent,
            stability: latestRev.stability !== undefined ? latestRev.stability : (latestContent.stability ?? 0),
            difficulty: latestRev.difficulty !== undefined ? latestRev.difficulty : (latestContent.difficulty ?? 0),
            reps: latestRev.reps !== undefined ? latestRev.reps : (latestContent.reps ?? 0),
            lapses: latestRev.lapses !== undefined ? latestRev.lapses : (latestContent.lapses ?? 0),
            due: latestRev.due || latestContent.due,
            state: latestRev.state !== undefined ? latestRev.state : latestContent.state,
            lastReviewDate: latestRev.lastReviewDate || latestContent.lastReviewDate,
            scheduledDays: latestRev.scheduledDays !== undefined ? latestRev.scheduledDays : latestContent.scheduledDays,
            history: Array.isArray(latestRev.history) && latestRev.history.length > 0 ? latestRev.history : (latestContent.history || []),
            updatedAt: new Date(Math.max(localContentTime, incContentTime, localRevTime, incRevTime, Date.now())).toISOString()
          };
          cardMap.set(inc.id, mergedCard);
        }
      }
    });

    for (const [id, card] of cardMap.entries()) {
      const remoteDeletedAt = remTrashMap.get(id);
      if (remoteDeletedAt) {
        const localCardTime = safeTimestamp(card.updatedAt || card.lastReviewDate || card.createdAt);
        if (remoteDeletedAt > localCardTime) {
          cardMap.delete(id);
        }
      }
    }

    const mergedTrashMap = new Map(locTrash.map(c => [c.id, c]));
    remTrash.forEach(c => {
      if (c && c.id) {
        const exist = mergedTrashMap.get(c.id);
        if (!exist || safeTimestamp(c.deletedAt) > safeTimestamp(exist.deletedAt)) {
          mergedTrashMap.set(c.id, c);
        }
      }
    });

    merged['cards_bundle.json'] = {
      flashcards: serializeBinaryValues(Array.from(cardMap.values())),
      trashCards: serializeBinaryValues(Array.from(mergedTrashMap.values()))
    };
  }

  // 2. Curriculum Topics (with Tombstone Support)
  if (downloadedBundles['curriculum_topics.json']) {
    const locCur = localBundles['curriculum_topics.json'] || {};
    const remCur = downloadedBundles['curriculum_topics.json'] || {};
    const locTopics = deserializeBinaryValues(locCur.topics || []);
    const locTrashTopics = deserializeBinaryValues(locCur.trashTopics || []);
    const remTopics = deserializeBinaryValues(remCur.topics || []);
    const remTrashTopics = deserializeBinaryValues(remCur.trashTopics || []);

    const locTrashMap = new Map(locTrashTopics.map(t => [t.id, safeTimestamp(t.deletedAt)]));
    const remTrashMap = new Map(remTrashTopics.map(t => [t.id, safeTimestamp(t.deletedAt)]));
    const topicMap = new Map(locTopics.map(t => [t.id, t]));

    remTopics.forEach(incT => {
      if (incT && incT.id) {
        const localDeletedAt = locTrashMap.get(incT.id);
        const incTime = safeTimestamp(incT.updatedAt || incT.createdAt);
        if (localDeletedAt && localDeletedAt > incTime) return;

        const locT = topicMap.get(incT.id);
        if (!locT) {
          topicMap.set(incT.id, incT);
        } else {
          const locTime = safeTimestamp(locT.updatedAt || locT.createdAt);
          const incTime = safeTimestamp(incT.updatedAt || incT.createdAt);
          topicMap.set(incT.id, incTime >= locTime ? { ...locT, ...incT } : { ...incT, ...locT });
        }
      }
    });

    for (const [id, topic] of topicMap.entries()) {
      const remoteDeletedAt = remTrashMap.get(id);
      if (remoteDeletedAt) {
        const localTopicTime = safeTimestamp(topic.updatedAt || topic.createdAt);
        if (remoteDeletedAt > localTopicTime) {
          topicMap.delete(id);
        }
      }
    }

    const mergedTrashTopics = new Map(locTrashTopics.map(t => [t.id, t]));
    remTrashTopics.forEach(t => {
      if (t && t.id) {
        const exist = mergedTrashTopics.get(t.id);
        if (!exist || safeTimestamp(t.deletedAt) > safeTimestamp(exist.deletedAt)) {
          mergedTrashTopics.set(t.id, t);
        }
      }
    });

    const locPyt = deserializeBinaryValues(locCur.pytData || []);
    const remPyt = deserializeBinaryValues(remCur.pytData || []);
    const pytMap = new Map();
    locPyt.forEach(p => { if (p && p.key) pytMap.set(p.key, p); });
    remPyt.forEach(p => { if (p && p.key && !pytMap.has(p.key)) pytMap.set(p.key, p); });

    merged['curriculum_topics.json'] = {
      topics: serializeBinaryValues(Array.from(topicMap.values())),
      trashTopics: serializeBinaryValues(Array.from(mergedTrashTopics.values())),
      pytData: serializeBinaryValues(Array.from(pytMap.values())),
      subjectTracker: remCur.subjectTracker || locCur.subjectTracker || [],
      pytUserProgress: remCur.pytUserProgress || locCur.pytUserProgress || [],
      textbooksMetadata: remCur.textbooksMetadata || locCur.textbooksMetadata || []
    };
  }

  // 3. Study Logs (Additive Sessions, Collision-Resistant Keys & Canonical Dates)
  if (downloadedBundles['study_logs.json']) {
    const locLogB = localBundles['study_logs.json'] || {};
    const remLogB = downloadedBundles['study_logs.json'] || {};
    const locLogs = locLogB.studyLogs || {};
    const remLogs = remLogB.studyLogs || {};

    const mergedLogs = { ...locLogs };

    for (const [dateKey, incLog] of Object.entries(remLogs)) {
      if (!mergedLogs[dateKey]) {
        mergedLogs[dateKey] = incLog;
      } else {
        const cur = mergedLogs[dateKey];
        const existingFsrs = Array.isArray(cur.fsrsLogs) ? cur.fsrsLogs : [];
        const incomingFsrs = Array.isArray(incLog?.fsrsLogs) ? incLog.fsrsLogs : [];

        const fsrsMap = new Map();
        const getFsrsKey = (l) => l.id || (l.cardId && l.timestamp ? `${l.cardId}_${l.rating || 'r'}_${l.timestamp}` : computeHash(canonicalStringify(l)));
        existingFsrs.forEach(l => { if (l) fsrsMap.set(getFsrsKey(l), l); });
        incomingFsrs.forEach(l => { if (l) { const k = getFsrsKey(l); if (!fsrsMap.has(k)) fsrsMap.set(k, l); } });

        const existingSessions = Array.isArray(cur.sessions) ? cur.sessions : [];
        const incomingSessions = Array.isArray(incLog?.sessions) ? incLog.sessions : [];
        const sessionMap = new Map();
        const getSessionKey = (s) => s.id || (s.subject && s.startedAt ? `${s.subject}_${s.startedAt}_${s.duration || 0}` : computeHash(canonicalStringify(s)));
        existingSessions.forEach(s => { if (s) sessionMap.set(getSessionKey(s), s); });
        incomingSessions.forEach(s => { if (s) { const k = getSessionKey(s); if (!sessionMap.has(k)) sessionMap.set(k, s); } });

        const existingGts = Array.isArray(cur.gts) ? cur.gts : [];
        const incomingGts = Array.isArray(incLog?.gts) ? incLog.gts : [];
        const gtMap = new Map();
        const getGtKey = (g) => g.id || (g.testName && (g.date || g.timestamp) ? `${g.testName}_${g.date || g.timestamp}` : computeHash(canonicalStringify(g)));
        existingGts.forEach(g => { if (g) gtMap.set(getGtKey(g), g); });
        incomingGts.forEach(g => { if (g) { const k = getGtKey(g); if (!gtMap.has(k)) gtMap.set(k, g); } });

        const allSessions = Array.from(sessionMap.values());
        const sessionHours = allSessions.reduce((sum, s) => sum + (Number(s.duration || s.minutes || 0) / 60 || Number(s.hours || 0)), 0);
        const totalHours = sessionHours > 0 ? Number(sessionHours.toFixed(2)) : Math.max(cur.studyHours || cur.hours || 0, incLog?.studyHours || incLog?.hours || 0);

        const totalCards = Math.max(cur.totalCardsReviewed || cur.cards || 0, incLog?.totalCardsReviewed || incLog?.cards || 0, fsrsMap.size);
        const totalQuestions = Math.max(cur.totalQuestionsAttempted || cur.questions || 0, incLog?.totalQuestionsAttempted || incLog?.questions || 0);

        mergedLogs[dateKey] = {
          ...cur,
          ...incLog,
          cards: totalCards,
          totalCardsReviewed: totalCards,
          questions: totalQuestions,
          totalQuestionsAttempted: totalQuestions,
          hours: totalHours,
          studyHours: totalHours,
          pages: Math.max(cur.pages || 0, incLog?.pages || 0),
          fsrsLogs: Array.from(fsrsMap.values()),
          sessions: allSessions,
          gts: Array.from(gtMap.values())
        };
      }
    }

    const mergedSched = { ...(locLogB.studySchedule || {}), ...(remLogB.studySchedule || {}) };
    const mergedTemplates = remLogB.scheduleTemplates || locLogB.scheduleTemplates || [];

    const locCampLogs = Array.isArray(locLogB.campDailyLogs) ? locLogB.campDailyLogs : [];
    const remCampLogs = Array.isArray(remLogB.campDailyLogs) ? remLogB.campDailyLogs : [];
    const campDailyMap = new Map();
    locCampLogs.forEach(l => { if (l && l.dateStr) campDailyMap.set(l.dateStr, l); });
    remCampLogs.forEach(l => {
      if (l && l.dateStr) {
        const exist = campDailyMap.get(l.dateStr);
        if (!exist) {
          campDailyMap.set(l.dateStr, l);
        } else {
          const mergedSess = Array.isArray(exist.sessions) ? [...exist.sessions] : [];
          const sKeys = new Set(mergedSess.map(s => s?.id || s?.startedAt || (s ? s.subject + '_' + s.duration : '')));
          (Array.isArray(l.sessions) ? l.sessions : []).forEach(s => {
            if (s) {
              const k = s.id || s.startedAt || (s.subject + '_' + s.duration);
              if (!sKeys.has(k)) mergedSess.push(s);
            }
          });
          campDailyMap.set(l.dateStr, { ...exist, ...l, sessions: mergedSess });
        }
      }
    });

    merged['study_logs.json'] = {
      studyLogs: mergedLogs,
      studySchedule: mergedSched,
      scheduleTemplates: mergedTemplates,
      campDailyLogs: Array.from(campDailyMap.values()),
      timerState: remLogB.timerState || locLogB.timerState || null,
      activeNewTopicsDate: remLogB.activeNewTopicsDate || locLogB.activeNewTopicsDate,
      activeNewTopicsToday: remLogB.activeNewTopicsToday || locLogB.activeNewTopicsToday || []
    };
  }

  // 4. FSRS Config & Settings
  if (downloadedBundles['fsrs_config.json']) {
    const locFsrs = localBundles['fsrs_config.json'] || {};
    const remFsrs = downloadedBundles['fsrs_config.json'] || {};

    const promptMap = new Map((locFsrs.customPrompts || []).map(p => [p.id, p]));
    (remFsrs.customPrompts || []).forEach(p => { if (p && p.id && !promptMap.has(p.id)) promptMap.set(p.id, p); });

    // Non-destructive snapshot merge: preserve local preferences
    const mergedLs = { ...(remFsrs.localStorageSnapshot || {}) };
    Object.entries(locFsrs.localStorageSnapshot || {}).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') {
        mergedLs[k] = v;
      }
    });

    merged['fsrs_config.json'] = {
      ...locFsrs,
      ...remFsrs,
      customPrompts: Array.from(promptMap.values()),
      localStorageSnapshot: mergedLs
    };
  }

  // 5. CAMP Tracker
  if (downloadedBundles['camp_tracker.json']) {
    const locCamp = localBundles['camp_tracker.json'] || {};
    const remCamp = downloadedBundles['camp_tracker.json'] || {};
    const trkMap = new Map((locCamp.campTracker || []).map(t => [t.id, t]));
    (remCamp.campTracker || []).forEach(t => { if (t && t.id) trkMap.set(t.id, t); });

    const datMap = new Map((locCamp.campData || []).map(d => [d.key, d]));
    (remCamp.campData || []).forEach(d => { if (d && d.key) datMap.set(d.key, d); });

    merged['camp_tracker.json'] = {
      campTracker: Array.from(trkMap.values()),
      campData: Array.from(datMap.values())
    };
  }

  // 6. Pages & Occlusions
  if (downloadedBundles['pages_bundle.json']) {
    const locPagesB = localBundles['pages_bundle.json'] || {};
    const remPagesB = downloadedBundles['pages_bundle.json'] || {};
    const locPages = deserializeBinaryValues(locPagesB.pages || []);
    const locTrash = deserializeBinaryValues(locPagesB.trashPages || []);
    const remPages = deserializeBinaryValues(remPagesB.pages || []);
    const remTrash = deserializeBinaryValues(remPagesB.trashPages || []);

    const locTrashMap = new Map(locTrash.map(p => [p.id, safeTimestamp(p.deletedAt)]));
    const remTrashMap = new Map(remTrash.map(p => [p.id, safeTimestamp(p.deletedAt)]));
    const pageMap = new Map(locPages.map(p => [p.id, p]));

    remPages.forEach(p => {
      if (p && p.id) {
        const localDeletedAt = locTrashMap.get(p.id);
        const incTime = safeTimestamp(p.updatedAt || p.createdAt);
        if (localDeletedAt && localDeletedAt > incTime) return;

        const locP = pageMap.get(p.id);
        if (!locP) {
          pageMap.set(p.id, p);
        } else {
          const locTime = safeTimestamp(locP.updatedAt || locP.createdAt);
          pageMap.set(p.id, incTime >= locTime ? { ...locP, ...p } : { ...p, ...locP });
        }
      }
    });

    for (const [id, page] of pageMap.entries()) {
      const remoteDeletedAt = remTrashMap.get(id);
      if (remoteDeletedAt) {
        const localPageTime = safeTimestamp(page.updatedAt || page.createdAt);
        if (remoteDeletedAt > localPageTime) {
          pageMap.delete(id);
        }
      }
    }

    const mergedTrashMap = new Map(locTrash.map(p => [p.id, p]));
    remTrash.forEach(p => {
      if (p && p.id) {
        const exist = mergedTrashMap.get(p.id);
        if (!exist || safeTimestamp(p.deletedAt) > safeTimestamp(exist.deletedAt)) {
          mergedTrashMap.set(p.id, p);
        }
      }
    });

    merged['pages_bundle.json'] = {
      pages: serializeBinaryValues(Array.from(pageMap.values())),
      trashPages: serializeBinaryValues(Array.from(mergedTrashMap.values()))
    };
  }

  // Compute fresh hashes
  const hashes = {
    cards_bundle: computeHash(merged['cards_bundle.json']),
    curriculum_topics: computeHash(merged['curriculum_topics.json']),
    study_logs: computeHash(merged['study_logs.json']),
    fsrs_config: computeHash(merged['fsrs_config.json']),
    camp_tracker: computeHash(merged['camp_tracker.json']),
    pages_bundle: computeHash(merged['pages_bundle.json'])
  };

  const flashcards = deserializeBinaryValues(merged['cards_bundle.json']?.flashcards || []);
  const topics = deserializeBinaryValues(merged['curriculum_topics.json']?.topics || []);
  const studyLogs = merged['study_logs.json']?.studyLogs || {};
  const pages = deserializeBinaryValues(merged['pages_bundle.json']?.pages || []);

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
    bundles: merged,
    pages: localData.pages,
    trashPages: localData.trashPages
  };
}

export async function syncWithGoogleDrive(options = {}) {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    try {
      const lockPromise = navigator.locks.request('autoanki_gdrive_sync', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          return { success: false, action: 'busy', message: 'Sync already in progress in another tab or process.' };
        }
        if (isSyncInProgress) {
          return { success: false, action: 'busy', message: 'Sync already in progress.' };
        }
        return await executeSyncInternal(options);
      });

      // 8-second timeout on lock acquisition to prevent mobile freeze deadlock
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(null), 8000);
      });

      const result = await Promise.race([lockPromise, timeoutPromise]);
      if (result !== null) return result;
      return { success: false, action: 'lock_timeout', message: 'Sync lock acquisition timed out. Please try again.' };
    } catch (err) {
      console.warn('[GDriveSync] Web lock error, falling back to guarded sync:', err);
      return await executeSyncInternal(options);
    }
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
  logger.sync('START', 'Initiating Google Drive synchronization...', { force, interactive });
  emitSyncEvent('started', { message: 'Initiating Google Drive synchronization…' });

  try {
    const accessToken = await getValidAccessToken(interactive);
    if (!accessToken) {
      if (!interactive) {
        logger.sync('TOKEN-PAUSED', 'Silent background sync paused: access token expired.');
        return { success: false, action: 'token_expired', message: 'Token expired. Background sync paused.' };
      }
      throw new Error('Could not obtain a valid Google access token. Please re-authenticate.');
    }

    emit(1, 10, 'Connecting to Google Drive Vault…');
    const { vaultFolderId, mediaFolderId } = await ensureSyncVault(accessToken);
    logger.sync('VAULT-CONNECTED', 'Connected to Google Drive Vault and media directory.', { vaultFolderId, mediaFolderId });

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
        logger.sync('MANIFEST-DOWNLOADED', 'Retrieved remote cloud manifest.', {
          timestamp: remoteManifest?.timestamp,
          stats: remoteManifest?.stats,
          deviceId: remoteManifest?.deviceId
        });
      } catch (e) {
        logger.warn('MANIFEST-READ-FAIL', 'Could not read remote manifest:', e);
      }
    }

    // Extract local data
    emit(3, 10, 'Calculating local entity checksums…');
    const localData = await extractLocalBundles();
    const localManifest = localData.manifest;
    logger.sync('LOCAL-EXTRACTED', 'Calculated local entity checksums & manifest stats.', {
      stats: localManifest.stats,
      hashes: localManifest.hashes
    });

    // Check if cloud vault is completely empty (first-time push)
    if (!remoteManifest) {
      logger.sync('INITIAL-PUSH', 'Uploading initial collection to Google Drive...');
      emit(4, 10, 'Uploading initial collection to Google Drive…');
      const res = await executeOneWayPush(accessToken, vaultFolderId, mediaFolderId, localData, remoteFileMap, emit);
      if (res.success) {
        await saveLastSyncedHashes(localManifest.hashes);
        logger.sync('INITIAL-PUSH-SUCCESS', 'Initial collection upload complete.');
      }
      return res;
    }

    // Compare hashes against both local and last-synced ancestor hashes
    const localHashes = localManifest.hashes;
    const remoteHashes = remoteManifest.hashes || {};
    const lastSyncedHashes = await getLastSyncedHashes();

    const isIdentical = Object.keys(localHashes).every(k => localHashes[k] === remoteHashes[k]);
    if (isIdentical && !force) {
      await saveLastSyncedHashes(localHashes);
      logger.sync('UP-TO-DATE', 'Local and remote collections are 100% identical. No-op.');
      emit(10, 10, 'Everything is up to date.');
      emitSyncEvent('synced', { message: 'In sync with Google Drive.' });
      return { success: true, action: 'noop', message: 'Everything is up to date.' };
    }

    // Scenario 0: Fresh/empty local device auto fast-forward
    const isLocalEmpty = (!localManifest.stats?.cardsCount && !localManifest.stats?.topicsCount && !localManifest.stats?.pagesCount && !localManifest.stats?.logsDaysCount);
    const hasRemoteData = remoteManifest.stats && ((remoteManifest.stats.cardsCount || 0) > 0 || (remoteManifest.stats.topicsCount || 0) > 0 || (remoteManifest.stats.pagesCount || 0) > 0);

    if (isLocalEmpty && hasRemoteData && !force) {
      logger.sync('FAST-FORWARD-DOWNLOAD', 'Local device is uninitialized. Downloading complete collection from cloud...');
      emit(3, 10, 'Downloading your collection from Google Drive…');
      const res = await executeOneWayDownload(accessToken, vaultFolderId, mediaFolderId, remoteFileMap, emit);
      if (res.success) {
        await saveLastSyncedHashes(remoteHashes);
        logger.sync('FAST-FORWARD-DOWNLOAD-SUCCESS', 'Local database restored with cloud collection.');
      }
      return res;
    }

    // Fast-Forward Analysis:
    const isLocalClean = lastSyncedHashes && Object.keys(lastSyncedHashes).length > 0 &&
      Object.keys(localHashes).every(k => localHashes[k] === lastSyncedHashes[k]);

    const isRemoteClean = lastSyncedHashes && Object.keys(lastSyncedHashes).length > 0 &&
      Object.keys(remoteHashes).length > 0 &&
      Object.keys(remoteHashes).every(k => remoteHashes[k] === lastSyncedHashes[k]);

    // Scenario 1: Clean Fast-Forward Download
    if (isLocalClean && !force) {
      logger.sync('FAST-FORWARD-DOWNLOAD', 'Local had zero edits since last sync. Fast-forwarding local database to newer cloud version...');
      emit(3, 10, 'Fast-forwarding to newer cloud version…');
      const res = await executeOneWayDownload(accessToken, vaultFolderId, mediaFolderId, remoteFileMap, emit);
      if (res.success) {
        await saveLastSyncedHashes(remoteHashes);
        logger.sync('FAST-FORWARD-DOWNLOAD-SUCCESS', 'Local database updated to cloud state.');
      }
      return res;
    }

    // Scenario 2: Clean Fast-Forward Push
    if (isRemoteClean && !force) {
      logger.sync('FAST-FORWARD-PUSH', 'Remote had zero edits since last sync. Pushing local changes to cloud...');
      emit(3, 10, 'Pushing local changes to cloud…');
      const res = await executeOneWayPush(accessToken, vaultFolderId, mediaFolderId, localData, remoteFileMap, emit);
      if (res.success) {
        await saveLastSyncedHashes(localHashes);
        logger.sync('FAST-FORWARD-PUSH-SUCCESS', 'Cloud updated to fresh local state.');
      }
      return res;
    }

    // Scenario 3: Divergence (Both devices edited data since last sync)
    const isSameDevice = remoteManifest.deviceId === localManifest.deviceId;

    const modifiedBundleNames = Object.keys(localData.bundles).filter(name => {
      const bundleKey = name.replace('.json', '');
      return localHashes[bundleKey] !== remoteHashes[bundleKey];
    });

    logger.sync('DIVERGENCE', 'Divergent bundles detected across devices:', { modifiedBundleNames });

    if (modifiedBundleNames.length > 0) {
      const cardsConflict = localHashes.cards_bundle !== remoteHashes.cards_bundle;
      const topicsConflict = localHashes.curriculum_topics !== remoteHashes.curriculum_topics;
      const pagesConflict = localHashes.pages_bundle !== remoteHashes.pages_bundle;

      const diffDetails = buildConflictDiffDetails(localManifest, remoteManifest, modifiedBundleNames, localHashes, remoteHashes);

      if (interactive && !isSameDevice && (cardsConflict || topicsConflict || pagesConflict) && onConflict && !force) {
        logger.sync('CONFLICT-PROMPT', 'Prompting user for interactive conflict choice...');
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
            diffDetails,
            onResolve: resolve
          });
        });

        logger.sync('CONFLICT-RESOLVED', `User chose resolution: ${conflictResolution}`);

        if (conflictResolution === 'upload') {
          const res = await executeOneWayPush(accessToken, vaultFolderId, mediaFolderId, localData, remoteFileMap, emit);
          if (res.success) await saveLastSyncedHashes(localHashes);
          return res;
        } else if (conflictResolution === 'download') {
          const res = await executeOneWayDownload(accessToken, vaultFolderId, mediaFolderId, remoteFileMap, emit);
          if (res.success) await saveLastSyncedHashes(remoteHashes);
          return res;
        } else if (conflictResolution === 'merge') {
          logger.sync('MERGE-OPTED', 'User selected smart non-destructive merge.');
        } else {
          emitSyncEvent('cancelled', { message: 'Sync cancelled by user.' });
          return { success: false, action: 'cancelled', message: 'Sync cancelled by user.' };
        }
      }

      // Safe Pre-Merge Snapshot (Rollback Guarantee)
      logger.sync('SAFETY-SNAPSHOT', 'Creating automatic pre-sync local safety snapshot...');
      emit(4, 10, 'Creating pre-sync safety snapshot…');
      try {
        await saveInternalSnapshot('pre_cloud_sync_merge');
      } catch (snapErr) {
        logger.warn('SAFETY-SNAPSHOT-WARN', 'Pre-merge snapshot warning:', snapErr);
      }

      // Download remote modified bundles
      emit(5, 10, 'Downloading modified cloud bundles (Phase 1)…');
      const downloadedBundles = {};
      for (const bName of modifiedBundleNames) {
        const rFile = remoteFileMap.get(bName);
        if (rFile) {
          emit(6, 10, `Downloading ${bName}…`);
          downloadedBundles[bName] = await downloadDriveFile(accessToken, rFile.id, true);
        }
      }

      // Phase 1: In-Memory Merge
      logger.sync('TWO-PHASE-COMMIT-1', 'Staging non-destructive in-memory merge...');
      emit(7, 10, 'Staging non-destructive in-memory merge…');
      const stagedMergedData = mergeBundlesInMemory(localData, downloadedBundles);
      logger.sync('MERGE-STATS', 'Staged merged dataset calculated:', stagedMergedData.manifest.stats);

      // Phase 2: Push Merged Bundles to Google Drive First (Two-Phase Commit)
      logger.sync('TWO-PHASE-COMMIT-2', 'Pushing merged collection to Google Drive first...');
      emit(8, 10, 'Pushing merged collection to Google Drive…');
      const pushRes = await executeOneWayPush(accessToken, vaultFolderId, mediaFolderId, stagedMergedData, remoteFileMap, emit);
      
      if (!pushRes.success) {
        throw new Error(`Cloud upload failed: ${pushRes.message || 'Unknown network error'}`);
      }

      // Phase 3: Hydrate Local IndexedDB only after confirmed Google Drive receipt
      logger.sync('TWO-PHASE-COMMIT-3', 'Committing merged collection to local IndexedDB...');
      emit(9, 10, 'Committing merged collection to local storage…');
      await hydrateLocalBundles(stagedMergedData.bundles, 'replace', (s, t, m) => emit(9, 10, m));
      await saveLastSyncedHashes(stagedMergedData.manifest.hashes);

      // Phase 4: Download missing media in background if pages bundle changed
      if (modifiedBundleNames.includes('pages_bundle.json')) {
        logger.sync('MEDIA-SYNC-QUEUE', 'Queueing background delta media sync...');
        setTimeout(() => {
          syncMediaFromDrive(accessToken, mediaFolderId).catch(e => {
            logger.warn('MEDIA-SYNC-WARN', 'Background delta media download error:', e);
          });
        }, 200);
      }

      logger.sync('SUCCESS', 'Two-phase merge and sync completed successfully!');
      emit(10, 10, 'Synchronization complete.');
      emitSyncEvent('synced', { message: 'Sync finished successfully.' });
      return { success: true, action: 'merged', message: 'Merged and synchronized successfully with Google Drive.' };
    }

    logger.sync('SUCCESS', 'Synchronization complete.');
    emit(10, 10, 'Synchronization complete.');
    emitSyncEvent('synced', { message: 'Sync finished successfully.' });
    return { success: true, action: 'synced', message: 'Sync finished successfully.' };
  } catch (err) {
    logger.error('SYNC-FAIL', 'Google Drive synchronization failed:', err);
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
    emit(++step, total, `Uploading ${fileName}ΓÇª`);
    const existingFile = remoteFileMap.get(fileName);
    await uploadDriveFile(accessToken, vaultFolderId, fileName, bundleObj, existingFile?.id);
  }

  // 2. Upload manifest.json
  emit(++step, total, 'Writing manifest.jsonΓÇª');
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
    const allMediaPages = [
      ...(Array.isArray(localData?.pages) ? localData.pages : []),
      ...(Array.isArray(localData?.trashPages) ? localData.trashPages : [])
    ];
    syncMediaToDrive(accessToken, mediaFolderId, allMediaPages).catch(e => {
      console.warn('[GDriveSync] Background media upload error:', e);
    });
  }, 100);

  return { success: true, action: 'uploaded', message: 'Collection uploaded successfully to Google Drive.' };
}

/**
 * Executes a safe one-way download from Google Drive with completeness validation.
 */
async function executeOneWayDownload(accessToken, vaultFolderId, mediaFolderId, remoteFileMap, emit) {
  emit(1, 6, 'Downloading all JSON bundles from Google Drive (Phase 1)ΓÇª');
  const downloadedBundles = {};
  const filesToDownload = Array.from(remoteFileMap.entries()).filter(([name]) => name.endsWith('.json') && name !== 'manifest.json');
  
  for (const [name, file] of filesToDownload) {
    emit(2, 6, `Downloading ${name}ΓÇª`);
    downloadedBundles[name] = await downloadDriveFile(accessToken, file.id, true);
  }

  // Completeness check: make sure we got bundles
  if (Object.keys(downloadedBundles).length === 0 && filesToDownload.length > 0) {
    throw new Error('Downloaded bundles are empty or incomplete.');
  }

  emit(3, 6, 'Creating automatic pre-sync local snapshotΓÇª');
  await saveInternalSnapshot('pre_cloud_sync_snapshot');

  emit(4, 6, 'Replacing local database with cloud collectionΓÇª');
  await hydrateLocalBundles(downloadedBundles, 'replace', (s, t, m) => emit(5, 6, m));

  emit(6, 6, 'Cloud download complete. Queueing media downloadsΓÇª');
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
 * Phase 2: Uploads local scanned page images to the Drive /media folder in the background with dynamic token refresh.
 */
async function syncMediaToDrive(accessToken, mediaFolderId, pages) {
  if (!Array.isArray(pages) || pages.length === 0) return;
  
  let currentToken = (await getValidAccessToken(false)) || accessToken;
  if (!currentToken) return;

  const remoteMediaFiles = await listFilesInFolder(currentToken, mediaFolderId);
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
        const freshToken = (await getValidAccessToken(false)) || currentToken;
        if (freshToken) currentToken = freshToken;
        await uploadDriveMediaFile(currentToken, mediaFolderId, mediaName, mimeType, buffer);
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
 * Phase 2: Downloads missing images from the Drive /media folder in chunked batches with dynamic token refresh.
 */
async function syncMediaFromDrive(accessToken, mediaFolderId) {
  let currentToken = (await getValidAccessToken(false)) || accessToken;
  if (!currentToken) return;

  const remoteMedia = await listFilesInFolder(currentToken, mediaFolderId);
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
    const freshToken = (await getValidAccessToken(false)) || currentToken;
    if (freshToken) currentToken = freshToken;

    await Promise.all(chunk.map(async ({ file, pageId }) => {
      try {
        const arrayBuf = await downloadDriveFile(currentToken, file.id, false);
        const localPage = localPageMap.get(pageId);
        if (localPage) {
          localPage.data = arrayBuf;
          const base64Str = arrayBufferToBase64(arrayBuf);
          const dataUrl = `data:image/webp;base64,${base64Str}`;
          localPage.imageUrl = dataUrl;
          localPage.originalImage = dataUrl;
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
    setMutationNotificationSuppressed(true);
    try {
      // Re-fetch fresh pages from storage before saving to prevent clobbering concurrent user edits
      const currentPages = (await getLocalPages()) || [];
      const currentMap = new Map(currentPages.map(p => [p.id, p]));
      for (const [id, updatedP] of localPageMap.entries()) {
        if (currentMap.has(id)) {
          const existingCur = currentMap.get(id);
          if (!existingCur.data && updatedP.data) {
            existingCur.data = updatedP.data;
          }
          if (!existingCur.imageUrl && updatedP.imageUrl) {
            existingCur.imageUrl = updatedP.imageUrl;
          }
          if (!existingCur.originalImage && updatedP.originalImage) {
            existingCur.originalImage = updatedP.originalImage;
          }
        }
      }
      await saveLocalPages(Array.from(currentMap.values()));
      emitDataHydratedEvent({ type: 'media_hydrated' });
    } finally {
      setMutationNotificationSuppressed(false);
    }
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
 * Enforces a 5s debounce with a 30s cooldown and trailing timer guarantees.
 */
export function triggerDebouncedSmartPush() {
  if (autoSyncDebounceTimer) clearTimeout(autoSyncDebounceTimer);

  autoSyncDebounceTimer = setTimeout(async () => {
    const now = Date.now();
    const elapsed = now - lastAutoPushTimestamp;
    if (elapsed < AUTO_PUSH_COOLDOWN_MS) {
      const remaining = AUTO_PUSH_COOLDOWN_MS - elapsed;
      console.log(`[GDriveSync] Auto-push deferred for remaining cooldown (${Math.round(remaining / 1000)}s)`);
      if (autoSyncDebounceTimer) clearTimeout(autoSyncDebounceTimer);
      autoSyncDebounceTimer = setTimeout(triggerDebouncedSmartPush, remaining + 500);
      return;
    }

    const auth = await getGoogleDriveAuthState();
    if (!auth?.accessToken) return;

    lastAutoPushTimestamp = Date.now();
    console.log('[GDriveSync] Triggering debounced smart push to Google DriveΓÇª');
    syncWithGoogleDrive({ force: false, interactive: false }).catch(err => {
      console.warn('[GDriveSync] Smart push error:', err);
    });
  }, 5000);
}

// Auto-listen to local database mutations to trigger debounced cloud pushes
if (typeof window !== 'undefined') {
  window.addEventListener('localdb-mutation', () => {
    if (!isSyncInProgress) {
      triggerDebouncedSmartPush();
    }
  });
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
const TIMER_META_KEY = 'autoanki_remote_timer_sync_meta';

function getStoredTimerMeta() {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(TIMER_META_KEY);
      if (stored) return JSON.parse(stored);
    }
  } catch (e) {}
  return { lastPushed: 0, lastKnownRemoteModified: null };
}

function saveStoredTimerMeta(lastPushed, lastKnownRemoteModified) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TIMER_META_KEY, JSON.stringify({ lastPushed, lastKnownRemoteModified }));
    }
  } catch (e) {}
}

const initialTimerMeta = getStoredTimerMeta();
let lastPushedTimerTimestamp = initialTimerMeta.lastPushed || 0;
let lastKnownRemoteTimerModified = initialTimerMeta.lastKnownRemoteModified || null;
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

      const deviceId = getDeviceId();
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
      saveStoredTimerMeta(lastPushedTimerTimestamp, lastKnownRemoteTimerModified);
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
    saveStoredTimerMeta(lastPushedTimerTimestamp, lastKnownRemoteTimerModified);

    const localDeviceId = getDeviceId();
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



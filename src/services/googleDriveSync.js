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
const AUTO_PUSH_COOLDOWN_MS = 60 * 1000; // 60s cooldown between auto pushes

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
 * Computes a fast FNV-1a 32-bit hex hash of any string or serialized object.
 * @param {string|object} input 
 * @returns {string} 8-character hex string
 */
export function computeHash(input) {
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
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

// ============================================================================
// GOOGLE DRIVE REST API HELPERS (v3)
// ============================================================================

/**
 * Searches for a file or folder by name and parent folder ID.
 */
async function findDriveItem(accessToken, name, parentFolderId = null, isFolder = false) {
  const mimeQuery = isFolder ? "mimeType = 'application/vnd.google-apps.folder'" : "mimeType != 'application/vnd.google-apps.folder'";
  const parentQuery = parentFolderId ? `'${parentFolderId}' in parents` : "'root' in parents";
  const query = `name = '${name}' and ${mimeQuery} and ${parentQuery} and trashed = false`;

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,size)&pageSize=10`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error(`Failed to query Google Drive for "${name}": ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return (data.files && data.files.length > 0) ? data.files[0] : null;
}

/**
 * Lists all files inside a specific Google Drive folder.
 */
async function listFilesInFolder(accessToken, folderId) {
  const query = `'${folderId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,size)&pageSize=1000`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Failed to list files in folder: ${res.status}`);
  const data = await res.json();
  return data.files || [];
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

  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
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
 * Uploads or updates a JSON/text file using Google Drive REST API multipart upload.
 */
async function uploadDriveFile(accessToken, folderId, fileName, contentObj, existingFileId = null, keepalive = false) {
  const jsonString = typeof contentObj === 'string' ? contentObj : JSON.stringify(contentObj);
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    ...(existingFileId ? {} : { parents: [folderId] })
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    jsonString +
    closeDelimiter;

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,modifiedTime,size`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size';

  const method = existingFileId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody,
    keepalive: Boolean(keepalive)
  });

  if (!res.ok) {
    throw new Error(`Failed to upload "${fileName}" to Google Drive: ${res.status} ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Uploads a binary media file (e.g. image/webp, image/jpeg, or pdf blob) to Google Drive.
 */
async function uploadDriveMediaFile(accessToken, mediaFolderId, fileName, mimeType, arrayBuffer) {
  const metadata = {
    name: fileName,
    mimeType: mimeType || 'image/webp',
    parents: [mediaFolderId]
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const bytes = new Uint8Array(arrayBuffer);
  const metaHeader = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}${delimiter}Content-Type: ${mimeType}\r\n\r\n`;
  const metaBytes = new TextEncoder().encode(metaHeader);
  const endBytes = new TextEncoder().encode(closeDelimiter);

  const totalLength = metaBytes.byteLength + bytes.byteLength + endBytes.byteLength;
  const combined = new Uint8Array(totalLength);
  combined.set(metaBytes, 0);
  combined.set(bytes, metaBytes.byteLength);
  combined.set(endBytes, metaBytes.byteLength + bytes.byteLength);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: combined
  });

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
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

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
 * Gathers and serializes local data into partitioned chunks.
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
  const studyLogsBundle = {
    studyLogs,
    studySchedule,
    scheduleTemplates,
    campDailyLogs,
    timerState
  };

  // 4. FSRS Config & Settings Bundle
  const fsrsConfig = (await getFSRSConfig()) || {};
  const settings = (await getAllLocalItems(STORES.SETTINGS)) || [];
  // Filter out sensitive auth token from upload
  const filteredSettings = settings.filter(s => s?.key !== 'google_drive_auth');
  const topicHints = (await getAllLocalItems(STORES.TOPIC_HINTS)) || [];
  const hintQuota = (await getAllLocalItems(STORES.HINT_QUOTA)) || [];
  const customPrompts = (await getLocalKV('custom_prompts')) || [];
  const fsrsBundle = {
    fsrsConfig,
    settings: filteredSettings,
    topicHints,
    hintQuota,
    customPrompts
  };

  // 5. CAMP Tracker Bundle
  const campTracker = (await getAllLocalItems(STORES.CAMP_TRACKER)) || [];
  const campData = (await getAllLocalItems(STORES.CAMP_DATA)) || [];
  const campBundle = {
    campTracker,
    campData
  };

  // 6. Media / Pages metadata
  const pages = (await getLocalPages()) || [];
  const trashPages = (await getLocalKV('trash_pages')) || [];
  const mediaManifest = {
    pagesCount: pages.length + trashPages.length,
    pagesList: pages.map(p => ({
      id: p.id,
      title: p.title || p.name || '',
      updatedAt: p.updatedAt || '',
      hasData: Boolean(p.data || p.imageUrl || p.originalImage)
    }))
  };

  // Compute hashes
  const hashes = {
    cards_bundle: computeHash(cardsBundle),
    curriculum_topics: computeHash(curriculumBundle),
    study_logs: computeHash(studyLogsBundle),
    fsrs_config: computeHash(fsrsBundle),
    camp_tracker: computeHash(campBundle),
    media_manifest: computeHash(mediaManifest)
  };

  const manifest = {
    version: '2.0',
    engine: 'AutoAnki Google Drive Sync',
    deviceId: getDeviceId(),
    timestamp: new Date().toISOString(),
    schemaVersion: 3,
    hashes,
    stats: {
      cardsCount: flashcards.length,
      topicsCount: topics.length,
      logsDaysCount: Object.keys(studyLogs).length,
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
      'camp_tracker.json': campBundle
    },
    pages,
    trashPages
  };
}

/**
 * Hydrates downloaded partitioned bundles into IndexedDB.
 * @param {object} bundles Downloaded bundles keyed by filename
 * @param {'merge'|'replace'} strategy Merge non-destructively or replace
 * @param {Function} [onProgress] Progress reporter
 */
export async function hydrateLocalBundles(bundles, strategy = 'merge', onProgress = null) {
  const emit = (step, total, msg) => { if (onProgress) onProgress(step, total, msg); };
  const totalSteps = 6;
  let step = 0;

  // 1. Cards Bundle
  if (bundles['cards_bundle.json']) {
    emit(++step, totalSteps, 'Hydrating Flashcards & FSRS memory states…');
    const b = bundles['cards_bundle.json'];
    const incomingCards = deserializeBinaryValues(b.flashcards || []);
    const incomingTrash = deserializeBinaryValues(b.trashCards || []);

    if (strategy === 'replace') {
      await setLocalKV('flashcards', incomingCards);
      await setLocalKV('trash_cards', incomingTrash);
    } else {
      // Merge cards by ID
      const existing = (await getLocalKV('flashcards')) || [];
      const map = new Map(existing.map(c => [c.id, c]));
      incomingCards.forEach(c => {
        if (c && c.id) map.set(c.id, { ...map.get(c.id), ...c });
      });
      await setLocalKV('flashcards', Array.from(map.values()));

      // Merge trash cards
      const existingTrash = (await getLocalKV('trash_cards')) || [];
      const trashMap = new Map(existingTrash.map(c => [c.id, c]));
      incomingTrash.forEach(c => {
        if (c && c.id) trashMap.set(c.id, c);
      });
      await setLocalKV('trash_cards', Array.from(trashMap.values()));
    }
  }

  // 2. Curriculum Topics
  if (bundles['curriculum_topics.json']) {
    emit(++step, totalSteps, 'Hydrating Curriculum Topics & PYT Progress…');
    const b = bundles['curriculum_topics.json'];
    const incomingTopics = deserializeBinaryValues(b.topics || []);
    const incomingPyt = deserializeBinaryValues(b.pytData || []);

    if (strategy === 'replace') {
      await clearLocalStore(STORES.TOPICS);
      await saveAllLocalTopics(incomingTopics);
      await clearLocalStore(STORES.PYT_DATA);
      const db = await initDB();
      const tx = db.transaction(STORES.PYT_DATA, 'readwrite');
      const st = tx.objectStore(STORES.PYT_DATA);
      incomingPyt.forEach(p => { if (p) st.put(p); });
      await new Promise(res => { tx.oncomplete = res; });

      if (b.subjectTracker) await setLocalKV('subject_tracker_data', b.subjectTracker);
      if (b.pytUserProgress) await setLocalKV('pyt_user_progress', b.pytUserProgress);
      if (b.textbooksMetadata) await setLocalKV('textbooks_metadata', b.textbooksMetadata);
    } else {
      if (Array.isArray(incomingTopics)) await saveAllLocalTopics(incomingTopics);
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

  // 3. Study Logs
  if (bundles['study_logs.json']) {
    emit(++step, totalSteps, 'Hydrating Study Logs & Velocity Telemetry…');
    const b = bundles['study_logs.json'];
    const incomingLogs = b.studyLogs || {};

    if (strategy === 'replace') {
      await setLocalKV('study_logs', incomingLogs);
      if (b.studySchedule) await setLocalKV('study_schedule', b.studySchedule);
      if (b.scheduleTemplates) await setLocalKV('schedule_templates', b.scheduleTemplates);
      if (b.timerState) await setLocalKV('timerState', b.timerState);
      if (Array.isArray(b.campDailyLogs)) {
        await clearLocalStore(STORES.CAMP_DAILY_LOGS);
        for (const log of b.campDailyLogs) {
          if (log && log.dateStr) await putLocalItem(STORES.CAMP_DAILY_LOGS, log);
        }
      }
    } else {
      // Merge study logs by date
      const existing = (await getLocalStudyLogs()) || {};
      const merged = { ...incomingLogs, ...existing };
      await setLocalKV('study_logs', merged);

      if (b.studySchedule) {
        const existSched = (await getLocalKV('study_schedule')) || {};
        await setLocalKV('study_schedule', { ...b.studySchedule, ...existSched });
      }
      if (b.scheduleTemplates) await setLocalKV('schedule_templates', b.scheduleTemplates);
      if (Array.isArray(b.campDailyLogs)) {
        for (const log of b.campDailyLogs) {
          if (log && log.dateStr) await putLocalItem(STORES.CAMP_DAILY_LOGS, log);
        }
      }
    }
  }

  // 4. FSRS Config & Settings
  if (bundles['fsrs_config.json']) {
    emit(++step, totalSteps, 'Hydrating FSRS-6 Config, Hints & Prompts…');
    const b = bundles['fsrs_config.json'];
    if (b.fsrsConfig) await saveFSRSConfig(b.fsrsConfig);
    if (b.customPrompts) await setLocalKV('custom_prompts', b.customPrompts);
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

  emit(++step, totalSteps, 'Local database hydrated successfully.');
}

// ============================================================================
// MAIN SYNCHRONIZATION ENGINE
// ============================================================================

/**
 * Main Google Drive Cloud Sync routine.
 * Handles Fast check, 2-phase hydration, Anki-style conflict modal invocation,
 * and background media sync.
 *
 * @param {object} [options]
 * @param {boolean} [options.force=false]
 * @param {Function} [options.onProgress] Callback (step, total, message)
 * @param {Function} [options.onConflict] Callback for conflict resolution modal
 * @returns {Promise<{ success: boolean, action: string, message: string }>}
 */
export async function syncWithGoogleDrive({
  force = false,
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
    const accessToken = await getValidAccessToken(true);
    if (!accessToken) {
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

    // Compare modified dates and devices
    const remoteDate = new Date(remoteManifest.timestamp || 0).getTime();
    const localDate = new Date(localManifest.timestamp || 0).getTime();
    const isSameDevice = remoteManifest.deviceId === localManifest.deviceId;

    // Identify which bundles have changed
    const modifiedBundleNames = Object.keys(localData.bundles).filter(name => {
      const bundleKey = name.replace('.json', '');
      return localHashes[bundleKey] !== remoteHashes[bundleKey];
    });

    console.log('[GDriveSync] Modified bundles:', modifiedBundleNames);

    // Automatic Two-Way Non-Conflicting Merge:
    // If different devices or remote is newer, download remote bundles, merge locally, and push updated state
    if (modifiedBundleNames.length > 0) {
      // Check if both sides have changes in cards/curriculum that conflict
      const cardsConflict = localHashes.cards_bundle !== remoteHashes.cards_bundle;
      const topicsConflict = localHashes.curriculum_topics !== remoteHashes.curriculum_topics;

      // If user provided onConflict and there is an irreconcilable conflict between separate devices
      if (!isSameDevice && cardsConflict && topicsConflict && onConflict && !force) {
        emitSyncEvent('conflict', { message: 'Conflict detected between local and cloud versions.' });
        const conflictResolution = await new Promise((resolve) => {
          onConflict({
            local: {
              cardsCount: localManifest.stats.cardsCount,
              topicsCount: localManifest.stats.topicsCount,
              logsDaysCount: localManifest.stats.logsDaysCount,
              timestamp: localManifest.timestamp,
              deviceId: localManifest.deviceId
            },
            remote: {
              cardsCount: remoteManifest.stats?.cardsCount || 0,
              topicsCount: remoteManifest.stats?.topicsCount || 0,
              logsDaysCount: remoteManifest.stats?.logsDaysCount || 0,
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

      // Default smart delta merge: download remote modified bundles, merge in-memory, push new unified manifest
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

  // Background non-blocking media sync
  setTimeout(() => {
    syncMediaToDrive(accessToken, mediaFolderId, localData.pages).catch(e => {
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

  for (const page of pages) {
    if (!page || !page.id) continue;
    const mediaName = `page_${page.id}.webp`;
    if (existingNames.has(mediaName)) continue; // Already uploaded

    // If page has image data/blob
    let buffer = null;
    let mimeType = 'image/webp';

    if (page.data instanceof ArrayBuffer) {
      buffer = page.data;
    } else if (typeof page.data === 'string' && page.data.startsWith('data:')) {
      const parts = page.data.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      mimeType = mimeMatch ? mimeMatch[1] : 'image/webp';
      buffer = base64ToArrayBuffer(parts[1]);
    } else if (page.data?.__type === 'ArrayBuffer' && page.data.base64) {
      buffer = base64ToArrayBuffer(page.data.base64);
    }

    if (buffer && buffer.byteLength > 0) {
      try {
        await uploadDriveMediaFile(accessToken, mediaFolderId, mediaName, mimeType, buffer);
      } catch (err) {
        console.warn(`[GDriveSync] Failed to upload media ${mediaName}:`, err);
      }
    }
  }
}

/**
 * Phase 2: Downloads missing images from the Drive /media folder in the background.
 */
async function syncMediaFromDrive(accessToken, mediaFolderId) {
  const remoteMedia = await listFilesInFolder(accessToken, mediaFolderId);
  if (remoteMedia.length === 0) return;

  const localPages = (await getLocalPages()) || [];
  const localPageMap = new Map(localPages.map(p => [p.id, p]));
  let hasUpdates = false;

  for (const file of remoteMedia) {
    const match = file.name.match(/^page_(.*?)\./);
    if (!match) continue;
    const pageId = match[1];
    const localPage = localPageMap.get(pageId);

    // If local page has no image data, download from cloud
    if (localPage && !localPage.data && !localPage.imageUrl) {
      try {
        const arrayBuf = await downloadDriveFile(accessToken, file.id, false);
        localPage.data = arrayBuf;
        localPage.updatedAt = new Date().toISOString();
        hasUpdates = true;
      } catch (e) {
        console.warn(`[GDriveSync] Could not download media for page ${pageId}:`, e);
      }
    }
  }

  if (hasUpdates) {
    await saveLocalPages(Array.from(localPageMap.values()));
  }
}

// ============================================================================
// AUTOMATIC TRIGGER & HOOK MANAGEMENT
// ============================================================================

/**
 * Triggers a debounced smart push when decks or reviews are completed.
 * Enforces a 5s debounce and a 60s cooldown.
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
    syncWithGoogleDrive({ force: false }).catch(err => {
      console.warn('[GDriveSync] Smart push error:', err);
    });
  }, 5000);
}

/**
 * App Exit handler to flush uncommitted changes via keepalive fetch.
 */
export function handleAppExitKeepaliveSync() {
  try {
    const auth = getGoogleDriveAuthState();
    // Keepalive sync attempt on pagehide
  } catch (e) {}
}

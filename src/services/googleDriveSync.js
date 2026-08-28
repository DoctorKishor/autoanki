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
  saveLocalSetting,
  getLocalSetting,
  getAllLocalSettings,
  getLocalPages,
  saveLocalPages,
  getLocalCards,
  saveLocalCards,
  getAllLocalTopics,
  saveAllLocalTopics,
  getLocalSubjectTrackerData,
  saveLocalSubjectTrackerDoc,
  getLocalStudyLogs,
  getTrashStudyLogs,
  saveTrashStudyLogs,
  deleteLocalStudyLog,
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
  setMutationNotificationSuppressed,
  isMutationNotificationSuppressed,
  getUnifiedGraves,
  saveUnifiedGraves
} from './localDb.js';
import logger from './logger.js';
import { runSystemIntegrityCheck } from './healthChecker.js';

export const VAULT_FOLDER_NAME = 'AutoAnki_Sync_Vault';
export const MEDIA_FOLDER_NAME = 'media';
export const SYNC_STATE_KEY = 'google_drive_sync_state';
export const VAULT_ID_LS_KEY = 'autoanki_gdrive_vault_id';
export const MEDIA_ID_LS_KEY = 'autoanki_gdrive_media_id';

// In-memory sync lock & event listeners
let isSyncInProgress = false;
let autoSyncDebounceTimer = null;
let lastAutoPushTimestamp = 0;
const AUTO_PUSH_COOLDOWN_MS = 30 * 1000; // 30s cooldown between auto pushes
let ensureSyncVaultInFlightPromise = null;

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
 * Extracts a canonical deterministic identifier for an object in an array.
 */
function getEntityKey(el) {
  if (!el || typeof el !== 'object') return null;
  if (el.id !== undefined && el.id !== null) return `id:${el.id}`;
  if (el.key !== undefined && el.key !== null) return `key:${el.key}`;
  if (el.topicId !== undefined && el.topicId !== null) return `topicId:${el.topicId}`;
  if (el.topicName !== undefined && el.topicName !== null) return `topicName:${el.topicName}`;
  if (el.dateStr !== undefined && el.dateStr !== null) return `dateStr:${el.dateStr}`;
  if (el.subject !== undefined && el.subject !== null) return `subject:${el.subject}`;
  if (el.date !== undefined && el.date !== null) return `date:${el.date}`;
  if (el.name !== undefined && el.name !== null) return `name:${el.name}`;
  return null;
}

/**
 * Serializes an object deterministically with recursively sorted keys and entity-sorted arrays.
 * @param {any} obj
 * @returns {string}
 */
export function canonicalStringify(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    const hasEntityKeys = obj.length > 1 && obj.some(el => el && typeof el === 'object' && getEntityKey(el) !== null);
    let arr = obj;
    if (hasEntityKeys) {
      arr = [...obj].sort((a, b) => {
        const keyA = String(getEntityKey(a) || canonicalStringify(a) || '');
        const keyB = String(getEntityKey(b) || canonicalStringify(b) || '');
        return keyA.localeCompare(keyB);
      });
    }
    return '[' + arr.map(canonicalStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
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
 * Direct file/folder lookup by ID.
 * Strongly consistent and instantaneous (bypasses Google Drive search index latency).
 */
export async function getDriveItemById(accessToken, fileId) {
  if (!fileId) return null;
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,trashed,parents,createdTime,modifiedTime`;
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }, 15000);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    if (data.trashed) return null;
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Searches for all folders matching a name and parent folder ID.
 * Returns all matching folders sorted by createdTime asc.
 */
export async function findDriveFoldersByName(accessToken, folderName, parentFolderId = null) {
  const parentQuery = parentFolderId ? `'${parentFolderId}' in parents` : "'root' in parents";
  const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and ${parentQuery} and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=${encodeURIComponent('createdTime asc')}&fields=files(id,name,mimeType,createdTime,modifiedTime)&pageSize=20`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new Error(`Failed to query Google Drive for folders named "${folderName}": ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.files || [];
}

/**
 * Searches for a file or folder by name and parent folder ID.
 * Enforces sorting by createdTime asc so all client devices deterministically bind to the earliest canonical folder.
 */
export async function findDriveItem(accessToken, name, parentFolderId = null, isFolder = false) {
  const mimeQuery = isFolder ? "mimeType = 'application/vnd.google-apps.folder'" : "mimeType != 'application/vnd.google-apps.folder'";
  const parentQuery = parentFolderId ? `'${parentFolderId}' in parents` : "'root' in parents";
  const query = `name = '${name}' and ${mimeQuery} and ${parentQuery} and trashed = false`;

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=${encodeURIComponent('createdTime asc')}&fields=files(id,name,mimeType,createdTime,modifiedTime,size)&pageSize=10`;
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
 * Searches for a folder by name and parent folder ID.
 */
export async function findDriveFolder(accessToken, folderName, parentFolderId = null) {
  return await findDriveItem(accessToken, folderName, parentFolderId, true);
}

/**
 * Retrieves the canonical Google Drive Vault folder ID and media folder ID.
 */
export async function getGoogleDriveVaultInfo(accessToken) {
  if (!accessToken) return null;
  try {
    const { vaultFolderId, mediaFolderId } = await ensureSyncVault(accessToken);
    return { vaultFolderId, mediaFolderId };
  } catch (e) {
    console.warn('[GDriveSync] Failed to retrieve vault info:', e);
    return null;
  }
}

/**
 * Returns a high-level summary of local collection stats and bundle hashes for cross-device verification.
 */
export async function getSyncStateOverview() {
  try {
    const localData = await extractLocalBundles();
    const lastSyncedHashes = await getLastSyncedHashes();
    return {
      stats: localData.manifest.stats,
      localHashes: localData.manifest.hashes,
      lastSyncedHashes: lastSyncedHashes || {},
      timestamp: localData.manifest.timestamp
    };
  } catch (e) {
    console.warn('[GDriveSync] Failed to retrieve sync state overview:', e);
    return null;
  }
}

/**
 * Lists all files inside a specific Google Drive folder with full nextPageToken pagination.
 * Detects duplicate files with identical names and keeps the newest modified version while cleaning up duplicates.
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

  // Group by name to detect and clean up duplicate files created during interrupted uploads
  const byName = new Map();
  for (const f of allFiles) {
    if (!f || !f.name) continue;
    if (!byName.has(f.name)) {
      byName.set(f.name, [f]);
    } else {
      byName.get(f.name).push(f);
    }
  }

  const dedupedFiles = [];
  for (const [name, files] of byName.entries()) {
    if (files.length === 1) {
      dedupedFiles.push(files[0]);
    } else {
      // Sort by modifiedTime desc to keep the newest version
      files.sort((a, b) => (new Date(b.modifiedTime || 0).getTime()) - (new Date(a.modifiedTime || 0).getTime()));
      const canonical = files[0];
      dedupedFiles.push(canonical);

      // Clean up older duplicate files in background
      for (let i = 1; i < files.length; i++) {
        deleteDriveFile(accessToken, files[i].id).catch(e => {
          console.warn(`[GDriveSync] Failed to cleanup duplicate file "${name}":`, e);
        });
      }
    }
  }

  return dedupedFiles;
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
 * Reuses existing file ID when available to prevent duplicate file creation.
 */
async function uploadDriveFile(accessToken, folderId, fileName, contentObj, existingFileId = null, keepalive = false) {
  let targetFileId = existingFileId;
  if (!targetFileId && folderId) {
    try {
      const existing = await findDriveItem(accessToken, fileName, folderId, false);
      if (existing?.id) {
        targetFileId = existing.id;
      }
    } catch (e) {
      // Query error fallback to POST
    }
  }

  const jsonString = typeof contentObj === 'string' ? contentObj : JSON.stringify(contentObj);
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    ...(targetFileId ? {} : { parents: [folderId] })
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

  const url = targetFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${targetFileId}?uploadType=multipart&fields=id,name,modifiedTime,size`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size';

  const method = targetFileId ? 'PATCH' : 'POST';

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
  let targetFileId = existingFileId;
  if (!targetFileId && mediaFolderId) {
    try {
      const existing = await findDriveItem(accessToken, fileName, mediaFolderId, false);
      if (existing?.id) {
        targetFileId = existing.id;
      }
    } catch (e) {
      // Query error fallback to POST
    }
  }

  const metadata = {
    name: fileName,
    mimeType: mimeType || 'image/webp',
    ...(targetFileId ? {} : { parents: [mediaFolderId] })
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

  const url = targetFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${targetFileId}?uploadType=multipart&fields=id,name,size`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size';

  const method = targetFileId ? 'PATCH' : 'POST';

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
 * Downloads a file's content by file ID from Google Drive.
 */
export async function downloadDriveFile(accessToken, fileId, isJson = true) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }, 35000);

  if (!response.ok) {
    throw new Error(`Failed to download file ${fileId}: ${response.status} ${response.statusText}`);
  }

  if (isJson) {
    return await response.json();
  } else {
    return await response.blob();
  }
}

/**
 * Deletes a file from Google Drive.
 */
export async function deleteDriveFile(accessToken, fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const response = await fetchWithTimeout(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  }, 20000);
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete Google Drive file ${fileId}: ${response.status}`);
  }
  return true;
}

/**
 * Resolves or creates the canonical Sync Vault folder and media subfolder.
 * Protects against Google Drive search index lag, concurrent sync triggers,
 * and cleans up duplicate ghost folders created during interrupted syncs.
 */
async function resolveCanonicalSyncVault(accessToken) {
  let vaultFolderId = null;
  let mediaFolderId = null;

  // 1. Fast Path: Verify cached vault folder ID via direct lookup
  try {
    const cachedVaultId = typeof localStorage !== 'undefined' ? localStorage.getItem(VAULT_ID_LS_KEY) : null;
    if (cachedVaultId) {
      const cachedVault = await getDriveItemById(accessToken, cachedVaultId);
      if (
        cachedVault &&
        cachedVault.name === VAULT_FOLDER_NAME &&
        cachedVault.mimeType === 'application/vnd.google-apps.folder' &&
        !cachedVault.trashed
      ) {
        vaultFolderId = cachedVault.id;
      }
    }
  } catch (e) {
    console.warn('[GDriveSync] Failed to verify cached vault ID:', e);
  }

  // 2. Slow Path: Search root for all folders matching VAULT_FOLDER_NAME
  if (!vaultFolderId) {
    const matchingVaults = await findDriveFoldersByName(accessToken, VAULT_FOLDER_NAME, null);
    if (matchingVaults.length === 0) {
      // Create new vault folder
      const newVault = await createDriveFolder(accessToken, VAULT_FOLDER_NAME);
      vaultFolderId = newVault.id;
      if (typeof localStorage !== 'undefined') localStorage.setItem(VAULT_ID_LS_KEY, vaultFolderId);
    } else if (matchingVaults.length === 1) {
      vaultFolderId = matchingVaults[0].id;
      if (typeof localStorage !== 'undefined') localStorage.setItem(VAULT_ID_LS_KEY, vaultFolderId);
    } else {
      // Multiple duplicate folders found (due to prior interrupted syncs)
      logger.sync('VAULT-DEDUP', `Found ${matchingVaults.length} duplicate vault folders. Resolving canonical folder...`);

      // Check which folder contains files (e.g. manifest.json or bundles)
      let canonicalVault = null;
      const emptyGhostFolders = [];

      for (const vFolder of matchingVaults) {
        try {
          const files = await listFilesInFolder(accessToken, vFolder.id);
          const hasManifest = files.some(f => f.name === 'manifest.json' || f.name.endsWith('.json'));
          if (hasManifest && !canonicalVault) {
            canonicalVault = vFolder;
          } else if (files.length === 0) {
            emptyGhostFolders.push(vFolder);
          }
        } catch (e) {
          console.warn('[GDriveSync] Error inspecting duplicate vault folder:', e);
        }
      }

      // If no folder had manifest, take the earliest created folder
      if (!canonicalVault) {
        canonicalVault = matchingVaults[0];
      }

      vaultFolderId = canonicalVault.id;
      if (typeof localStorage !== 'undefined') localStorage.setItem(VAULT_ID_LS_KEY, vaultFolderId);

      // Clean up empty duplicate ghost folders in background
      for (const ghost of emptyGhostFolders) {
        if (ghost.id !== vaultFolderId) {
          deleteDriveFile(accessToken, ghost.id).catch(e => {
            console.warn('[GDriveSync] Failed to cleanup ghost vault folder:', e);
          });
        }
      }
    }
  }

  // 3. Fast Path: Verify cached media folder ID inside vaultFolderId
  try {
    const cachedMediaId = typeof localStorage !== 'undefined' ? localStorage.getItem(MEDIA_ID_LS_KEY) : null;
    if (cachedMediaId) {
      const cachedMedia = await getDriveItemById(accessToken, cachedMediaId);
      if (
        cachedMedia &&
        cachedMedia.name === MEDIA_FOLDER_NAME &&
        cachedMedia.mimeType === 'application/vnd.google-apps.folder' &&
        !cachedMedia.trashed &&
        Array.isArray(cachedMedia.parents) &&
        cachedMedia.parents.includes(vaultFolderId)
      ) {
        mediaFolderId = cachedMedia.id;
      }
    }
  } catch (e) {
    console.warn('[GDriveSync] Failed to verify cached media ID:', e);
  }

  // 4. Slow Path: Search for media subfolder inside vaultFolderId
  if (!mediaFolderId) {
    const matchingMedia = await findDriveFoldersByName(accessToken, MEDIA_FOLDER_NAME, vaultFolderId);
    if (matchingMedia.length === 0) {
      const newMedia = await createDriveFolder(accessToken, MEDIA_FOLDER_NAME, vaultFolderId);
      mediaFolderId = newMedia.id;
      if (typeof localStorage !== 'undefined') localStorage.setItem(MEDIA_ID_LS_KEY, mediaFolderId);
    } else if (matchingMedia.length === 1) {
      mediaFolderId = matchingMedia[0].id;
      if (typeof localStorage !== 'undefined') localStorage.setItem(MEDIA_ID_LS_KEY, mediaFolderId);
    } else {
      // Multiple duplicate media folders found
      logger.sync('MEDIA-DEDUP', `Found ${matchingMedia.length} duplicate media folders. Resolving canonical folder...`);
      let canonicalMedia = null;
      const emptyGhostMedia = [];

      for (const mFolder of matchingMedia) {
        try {
          const files = await listFilesInFolder(accessToken, mFolder.id);
          if (files.length > 0 && !canonicalMedia) {
            canonicalMedia = mFolder;
          } else if (files.length === 0) {
            emptyGhostMedia.push(mFolder);
          }
        } catch (e) {
          console.warn('[GDriveSync] Error inspecting duplicate media folder:', e);
        }
      }

      if (!canonicalMedia) {
        canonicalMedia = matchingMedia[0];
      }

      mediaFolderId = canonicalMedia.id;
      if (typeof localStorage !== 'undefined') localStorage.setItem(MEDIA_ID_LS_KEY, mediaFolderId);

      for (const ghost of emptyGhostMedia) {
        if (ghost.id !== mediaFolderId) {
          deleteDriveFile(accessToken, ghost.id).catch(e => {
            console.warn('[GDriveSync] Failed to cleanup ghost media folder:', e);
          });
        }
      }
    }
  }

  return { vaultFolderId, mediaFolderId };
}

/**
 * Initializes or resolves the primary Sync Vault folder and media subfolder.
 * Singleton mutex ensures multiple simultaneous callers (sync, timer, etc.) await the exact same promise.
 */
export async function ensureSyncVault(accessToken) {
  if (ensureSyncVaultInFlightPromise) {
    return await ensureSyncVaultInFlightPromise;
  }
  ensureSyncVaultInFlightPromise = (async () => {
    try {
      return await resolveCanonicalSyncVault(accessToken);
    } finally {
      ensureSyncVaultInFlightPromise = null;
    }
  })();
  return await ensureSyncVaultInFlightPromise;
}

// ============================================================================
// PARTITIONED LOCAL DATA EXTRACTION & HYDRATION
// ============================================================================

export const EXCLUDED_SETTINGS_KEYS = new Set([
  'google_drive_auth',
  'google_drive_sync_state',
  'autoanki_last_synced_hashes',
  'last_synced_hashes',
  'autoanki_pending_sync_launch',
  'obsToken',
  'obs_token',
  'fsrs_config'
]);

export const EXCLUDED_SYNC_LS_KEYS = new Set([
  'autoanki_device_id',
  'local_device_id',
  'obs_device_id',
  'obs_paired_uid',
  'obs_token',
  'autoanki_gdrive_auth',
  'autoanki_gdrive_vault_id',
  'autoanki_gdrive_media_id',
  'autoanki_pending_sync_launch',
  'auto_anki_last_auto_backup',
  'auto_anki_last_manual_backup',
  'auto_anki_expanded_nav_category',
  'active_nav_category',
  'active_tab',
  'active_view',
  'current_view',
  'study_active_tab',
  'last_visited_route',
  'active_subject_filter',
  'active_page_index',
  'autoanki_diagnostics_logs',
  'camp_student_info',
  'camp_history',
  'camp_timer_history',
  'lastSyncTime',
  'sync_status',
  'google_drive_sync_state'
]);

export function isCleanSettingKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (EXCLUDED_SETTINGS_KEYS.has(key)) return false;
  if (/^(temp_|active_|cached_|gdrive_|sync_|autoanki_)/i.test(key)) return false;
  return true;
}

export function isCleanLsKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (EXCLUDED_SYNC_LS_KEYS.has(key)) return false;
  if (key.startsWith('autoanki_') || key.startsWith('gdrive_') || key.startsWith('camp_sessions_') || key.startsWith('camp_bedToBook_') || key.startsWith('camp_')) return false;
  if (/^(temp_|active_|cached_|sync_)/i.test(key)) return false;
  return true;
}

/**
 * Gathers and serializes local data into partitioned chunks sequentially to prevent memory spikes.
 */
export async function extractLocalBundles() {
  const bundles = {};
  const hashes = {};
  let maxEntityUpdatedAt = 0;

  const trackTimestamp = (val) => {
    const ts = safeTimestamp(val);
    if (ts > maxEntityUpdatedAt) maxEntityUpdatedAt = ts;
  };

  const unifiedGraves = (await getUnifiedGraves()) || [];
  unifiedGraves.forEach(g => { if (g) trackTimestamp(g.deletedAt); });

  // 1. Cards Bundle (Streamlined & Sanitized for Zero-Spike Memory Footprint)
  const flashcards = (await getLocalKV('flashcards')) || [];
  const trashCards = (await getLocalKV('trash_cards')) || [];
  const cardsCount = flashcards.length;

  flashcards.forEach(c => {
    if (c) trackTimestamp(c.updatedAt || c.lastReviewDate || c.createdAt);
  });
  trashCards.forEach(tc => {
    if (tc) trackTimestamp(tc.deletedAt);
  });

  const cleanCardForBundle = (c) => {
    if (!c || typeof c !== 'object') return c;
    const copy = { ...c };
    if (typeof copy.customImage === 'string' && (copy.customImage.startsWith('data:') || copy.customImage.startsWith('blob:') || copy.customImage.length > 2048)) {
      copy.hasMedia = true;
      delete copy.customImage;
    }
    if (typeof copy.imageUrl === 'string' && (copy.imageUrl.startsWith('data:') || copy.imageUrl.startsWith('blob:') || copy.imageUrl.length > 2048)) {
      copy.hasMedia = true;
      delete copy.imageUrl;
    }
    if (typeof copy.base64 === 'string' && copy.base64.length > 2048) {
      copy.hasMedia = true;
      delete copy.base64;
    }
    return copy;
  };

  bundles['cards_bundle.json'] = {
    flashcards: serializeBinaryValues(flashcards.map(cleanCardForBundle)),
    trashCards: serializeBinaryValues(trashCards.map(cleanCardForBundle))
  };
  hashes.cards_bundle = computeHash(bundles['cards_bundle.json']);

  // 2. Curriculum Topics Bundle (with Tombstone Support)
  const topics = (await getAllLocalTopics()) || [];
  const trashTopics = (await getLocalKV('trash_topics')) || [];
  const pytData = (await getAllLocalItems(STORES.PYT_DATA)) || [];
  const subjectTracker = (await getLocalSubjectTrackerData()) || (await getLocalKV('subject_tracker_data')) || [];
  const pytUserProgress = (await getLocalKV('pyt_user_progress')) || [];
  const textbooksMetadata = (await getLocalKV('textbooks_metadata')) || [];

  topics.forEach(t => {
    if (t) trackTimestamp(t.updatedAt || t.lastReviewDate || t.createdAt);
  });
  trashTopics.forEach(tt => {
    if (tt) trackTimestamp(tt.deletedAt);
  });
  if (Array.isArray(pytData)) {
    pytData.forEach(p => { if (p) trackTimestamp(p.updatedAt || p.createdAt); });
  }
  if (Array.isArray(subjectTracker)) {
    subjectTracker.forEach(doc => {
      if (doc) {
        if (doc.updatedAt) trackTimestamp(doc.updatedAt);
        if (doc.topics && typeof doc.topics === 'object') {
          Object.values(doc.topics).forEach(t => {
            if (t) trackTimestamp(t.updatedAt || t.lastReviewDate || t.createdAt);
          });
        }
      }
    });
  }
  if (Array.isArray(pytUserProgress)) {
    pytUserProgress.forEach(p => {
      if (p && p.updatedAt) trackTimestamp(p.updatedAt);
    });
  }

  let totalTopicsCount = topics.length;
  if (Array.isArray(subjectTracker)) {
    subjectTracker.forEach(doc => {
      if (doc && doc.topics && typeof doc.topics === 'object') {
        totalTopicsCount += Object.keys(doc.topics).length;
      }
    });
  }
  if (Array.isArray(pytData)) {
    totalTopicsCount += pytData.length;
  }

  bundles['curriculum_topics.json'] = {
    topics: serializeBinaryValues(topics),
    trashTopics: serializeBinaryValues(trashTopics),
    pytData: serializeBinaryValues(pytData),
    subjectTracker,
    pytUserProgress,
    textbooksMetadata,
    unifiedGraves
  };
  hashes.curriculum_topics = computeHash(bundles['curriculum_topics.json']);

  // 3. Study Logs Bundle (with Tombstone Support)
  const studyLogs = (await getLocalStudyLogs()) || {};
  const trashStudyLogs = (await getTrashStudyLogs()) || (await getLocalKV('trash_study_logs')) || [];
  const studySchedule = (await getLocalKV('study_schedule')) || {};
  const scheduleTemplates = (await getLocalKV('schedule_templates')) || [];
  const campDailyLogs = (await getAllLocalItems(STORES.CAMP_DAILY_LOGS)) || [];
  const timerState = (await getLocalKV('timerState')) || null;
  const allKvItems = (await getAllLocalItems(STORES.KV_STORE)) || [];
  const activeNewTopicsRecords = allKvItems
    .filter(r => r && typeof r.key === 'string' && r.key.startsWith('active_new_topics_'))
    .sort((a, b) => (a.key || '').localeCompare(b.key || ''));
  const activeNewTopicsToday = (await getLocalKV('active_new_topics_today')) || [];
  const logsDaysCount = Object.keys(studyLogs).length;

  Object.entries(studyLogs).forEach(([dateKey, log]) => {
    trackTimestamp(log?.updatedAt || dateKey);
  });
  trashStudyLogs.forEach(tl => {
    if (tl) trackTimestamp(tl.deletedAt);
  });

  bundles['study_logs.json'] = {
    studyLogs,
    trashStudyLogs,
    studySchedule,
    scheduleTemplates,
    campDailyLogs,
    timerState,
    activeNewTopicsToday,
    activeNewTopicsRecords,
    unifiedGraves
  };
  hashes.study_logs = computeHash(bundles['study_logs.json']);

  // 4. FSRS Config & Settings Bundle
  const rawFsrs = (await getFSRSConfig()) || {};
  const fsrsConfig = { ...rawFsrs };
  delete fsrsConfig.updatedAt;
  delete fsrsConfig.lastModified;

  const rawSettings = (await getAllLocalItems(STORES.SETTINGS)) || [];
  const filteredSettings = rawSettings
    .filter(s => s && s.key && isCleanSettingKey(s.key))
    .map(s => ({
      key: s.key,
      value: s.value
      // Omit local/divergent updatedAt to guarantee cross-device hash equality
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const rawTopicHints = (await getAllLocalItems(STORES.TOPIC_HINTS)) || [];
  const topicHints = rawTopicHints
    .filter(h => h && h.topicId)
    .sort((a, b) => (a.topicId || '').localeCompare(b.topicId || ''));

  const rawHintQuota = (await getAllLocalItems(STORES.HINT_QUOTA)) || [];
  const hintQuota = rawHintQuota
    .filter(q => q && q.dateStr)
    .sort((a, b) => (a.dateStr || '').localeCompare(b.dateStr || ''));

  const rawCustomPrompts = (await getLocalKV('custom_prompts')) || [];
  const customPrompts = (Array.isArray(rawCustomPrompts) ? rawCustomPrompts : [])
    .filter(p => p && p.id)
    .sort((a, b) => (a.id || '').localeCompare(b.id || ''));

  customPrompts.forEach(p => {
    if (p) trackTimestamp(p.updatedAt || p.createdAt);
  });

  const rawUserProfile = (await getLocalKV('local_user_profile')) || null;
  const localUserProfile = rawUserProfile ? { ...rawUserProfile } : null;
  if (localUserProfile) {
    delete localUserProfile.deviceId;
  }

  const aiRecommendationsRecords = allKvItems
    .filter(r => r && typeof r.key === 'string' && r.key.startsWith('ai_recommendations_'))
    .sort((a, b) => (a.key || '').localeCompare(b.key || ''));
  const aiRecommendations = (await getLocalKV('ai_topic_recommendations')) || null;

  const localStorageSnapshot = {};
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const candidateKeys = Array.from(new Set(LS_KEYS_TO_SNAPSHOT || []));
      candidateKeys.sort();
      candidateKeys.forEach(key => {
        if (isCleanLsKey(key)) {
          const val = localStorage.getItem(key);
          if (val !== null && val !== undefined) localStorageSnapshot[key] = val;
        }
      });
    } catch (e) {
      console.warn('[GDriveSync] Error capturing localStorage settings:', e);
    }
  }

  bundles['fsrs_config.json'] = {
    fsrsConfig,
    settings: filteredSettings,
    topicHints,
    hintQuota,
    customPrompts,
    localUserProfile,
    aiRecommendations,
    aiRecommendationsRecords,
    localStorageSnapshot
  };
  hashes.fsrs_config = computeHash(bundles['fsrs_config.json']);

  // 5. CAMP Tracker Bundle
  const campTracker = (await getAllLocalItems(STORES.CAMP_TRACKER)) || [];
  const campData = (await getAllLocalItems(STORES.CAMP_DATA)) || [];
  const trashCamp = (await getLocalKV('trash_camp')) || [];
  trashCamp.forEach(tc => { if (tc) trackTimestamp(tc.deletedAt); });
  bundles['camp_tracker.json'] = {
    campTracker,
    campData,
    trashCamp
  };
  hashes.camp_tracker = computeHash(bundles['camp_tracker.json']);

  // 6. Scanned Pages & Occlusions Metadata Bundle (Streamlined & Sanitized)
  const pages = (await getLocalPages()) || [];
  const trashPages = (await getLocalKV('trash_pages')) || [];
  const pagesCount = pages.length;

  pages.forEach(p => {
    if (p) trackTimestamp(p.updatedAt || p.createdAt);
  });
  trashPages.forEach(tp => {
    if (tp) trackTimestamp(tp.deletedAt);
  });

  const cleanPageForBundle = (p) => {
    if (!p || typeof p !== 'object') return p;
    const copy = { ...p };
    if (copy.data instanceof ArrayBuffer || copy.data?.__type === 'ArrayBuffer') {
      copy.hasMedia = true;
      delete copy.data;
    }
    ['originalImage', 'imageUrl', 'image', 'preview', 'thumbnail', 'base64', 'compressedImage'].forEach(field => {
      if (typeof copy[field] === 'string' && (copy[field].startsWith('data:') || copy[field].startsWith('blob:') || copy[field].length > 1024)) {
        copy.hasMedia = true;
        delete copy[field];
      }
    });
    return copy;
  };

  // Include unified graves and trashPrompts in pages_bundle
  const trashPrompts = (await getLocalKV('trash_prompts')) || [];
  trashPrompts.forEach(p => { if (p) trackTimestamp(p.deletedAt); });

  bundles['pages_bundle.json'] = {
    pages: serializeBinaryValues(pages.map(cleanPageForBundle)),
    trashPages: serializeBinaryValues(trashPages.map(cleanPageForBundle)),
    unifiedGraves,
    trashPrompts
  };
  hashes.pages_bundle = computeHash(bundles['pages_bundle.json']);

  const manifest = {
    version: '2.1',
    engine: 'AutoAnki Google Drive Sync',
    deviceId: getDeviceId(),
    timestamp: new Date().toISOString(),
    lastModifiedTimestamp: maxEntityUpdatedAt > 0 ? new Date(maxEntityUpdatedAt).toISOString() : null,
    syncVersion: Date.now(),
    schemaVersion: 4,
    hashes,
    stats: {
      cardsCount,
      topicsCount: totalTopicsCount,
      logsDaysCount,
      pagesCount,
      mediaCount: pagesCount
    }
  };

  return {
    manifest,
    bundles
  };
}

/**
 * Hydrates downloaded partitioned bundles into IndexedDB with timestamp-aware defensive merging.
 * @param {object} bundles Downloaded bundles keyed by filename
 * @param {'merge'|'replace'} strategy Merge non-destructively or replace
 * @param {Function} [onProgress] Progress reporter
 * @param {object} [options] Advanced options (e.g. deferUnsuppress)
 */
export async function hydrateLocalBundles(bundles, strategy = 'merge', onProgress = null, options = {}) {
  const emit = (step, total, msg) => { if (onProgress) onProgress(step, total, msg); };
  const totalSteps = 7;
  let step = 0;
  const syncStartTime = Number(options.syncStartTime || 0);
  let hasInFlightEdits = false;

  // Suppress local mutation notifications during bulk bundle hydration to prevent auto-push feedback loops
  setMutationNotificationSuppressed(true);
  try {
    // 1. Cards Bundle (Timestamp-Aware, Tombstone Pruning & FSRS Safe)
    if (bundles['cards_bundle.json']) {
      emit(++step, totalSteps, 'Hydrating Flashcards & FSRS memory states…');
      const b = bundles['cards_bundle.json'];
      const incomingCards = deserializeBinaryValues(b.flashcards || []);
      const incomingTrash = deserializeBinaryValues(b.trashCards || []);

      if (strategy === 'replace') {
        const liveCards = (await getLocalKV('flashcards')) || [];
        const liveCardMap = new Map(liveCards.map(c => [c.id, c]));
        const preservedIncomingCards = incomingCards.map(inc => {
          if (!inc || !inc.id) return inc;
          const loc = liveCardMap.get(inc.id);
          if (!loc) return inc;
          return {
            ...inc,
            customImage: inc.customImage || loc.customImage,
            imageUrl: inc.imageUrl || loc.imageUrl,
            base64: inc.base64 || loc.base64
          };
        });

        if (syncStartTime > 0) {
          const liveTrash = (await getLocalKV('trash_cards')) || [];
          const cardMap = new Map(preservedIncomingCards.map(c => [c.id, c]));
          const trashMap = new Map(incomingTrash.map(c => [c.id, c]));

          liveCards.forEach(liveCard => {
            if (liveCard && liveCard.id) {
              const liveTime = safeTimestamp(liveCard.updatedAt || liveCard.lastReviewDate || liveCard.createdAt);
              if (liveTime >= syncStartTime) {
                hasInFlightEdits = true;
                cardMap.set(liveCard.id, liveCard);
              }
            }
          });

          liveTrash.forEach(liveT => {
            if (liveT && liveT.id) {
              const liveDelTime = safeTimestamp(liveT.deletedAt);
              if (liveDelTime >= syncStartTime) {
                hasInFlightEdits = true;
                trashMap.set(liveT.id, liveT);
                cardMap.delete(liveT.id);
              }
            }
          });

          await setLocalKV('flashcards', Array.from(cardMap.values()));
          await setLocalKV('trash_cards', Array.from(trashMap.values()));
        } else {
          await setLocalKV('flashcards', preservedIncomingCards);
          await setLocalKV('trash_cards', incomingTrash);
        }
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

              if (localContentTime >= syncStartTime || localRevTime >= syncStartTime) {
                hasInFlightEdits = true;
              }

              // Merge: preserve latest content edits AND latest FSRS review parameters
              const mergedCard = {
                ...localCard,
                ...inc,
                ...latestContent,
                customImage: latestContent.customImage || localCard.customImage || inc.customImage,
                imageUrl: latestContent.imageUrl || localCard.imageUrl || inc.imageUrl,
                base64: latestContent.base64 || localCard.base64 || inc.base64,
                stability: latestRev.stability !== undefined ? latestRev.stability : (latestContent.stability ?? 0),
                difficulty: latestRev.difficulty !== undefined ? latestRev.difficulty : (latestContent.difficulty ?? 0),
                reps: latestRev.reps !== undefined ? latestRev.reps : (latestContent.reps ?? 0),
                lapses: latestRev.lapses !== undefined ? latestRev.lapses : (latestContent.lapses ?? 0),
                due: latestRev.due || latestContent.due,
                state: latestRev.state !== undefined ? latestRev.state : latestContent.state,
                lastReviewDate: latestRev.lastReviewDate || latestContent.lastReviewDate,
                scheduledDays: latestRev.scheduledDays !== undefined ? latestRev.scheduledDays : latestContent.scheduledDays,
                history: Array.isArray(latestRev.history) && latestRev.history.length > 0 ? latestRev.history : (latestContent.history || []),
                updatedAt: new Date(Math.max(localContentTime, incContentTime, localRevTime, incRevTime)).toISOString()
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
      emit(++step, totalSteps, 'Hydrating Curriculum Topics & PYT Progress…');
      const b = bundles['curriculum_topics.json'];
      const incomingTopics = deserializeBinaryValues(b.topics || []);
      const incomingTrashTopics = deserializeBinaryValues(b.trashTopics || []);
      const incomingPyt = deserializeBinaryValues(b.pytData || []);

      if (strategy === 'replace') {
        const db = await initDB();
        let finalTopics = incomingTopics;
        let finalTrashTopics = incomingTrashTopics;
        let finalSubjectTracker = b.subjectTracker || [];
        let finalPytProg = b.pytUserProgress || [];

        if (syncStartTime > 0) {
          const liveTopics = (await getAllLocalTopics()) || [];
          const liveTrashTopics = (await getLocalKV('trash_topics')) || [];
          const liveSubjectTracker = (await getLocalSubjectTrackerData()) || (await getLocalKV('subject_tracker_data')) || [];
          const livePytProg = (await getLocalKV('pyt_user_progress')) || [];

          // Reconcile topics
          const topMap = new Map(incomingTopics.map(t => [t.id, t]));
          const topTrashMap = new Map(incomingTrashTopics.map(t => [t.id, t]));

          liveTopics.forEach(locT => {
            if (locT && locT.id) {
              const locTime = safeTimestamp(locT.updatedAt || locT.createdAt);
              if (locTime >= syncStartTime) {
                hasInFlightEdits = true;
                topMap.set(locT.id, locT);
              }
            }
          });

          liveTrashTopics.forEach(locT => {
            if (locT && locT.id) {
              const locDelTime = safeTimestamp(locT.deletedAt);
              if (locDelTime >= syncStartTime) {
                hasInFlightEdits = true;
                topTrashMap.set(locT.id, locT);
                topMap.delete(locT.id);
              }
            }
          });

          finalTopics = Array.from(topMap.values());
          finalTrashTopics = Array.from(topTrashMap.values());

          // Reconcile Subject Tracker Docs
          const inFlightTrackerMap = new Map(finalSubjectTracker.map(d => [d.id, d]));
          liveSubjectTracker.forEach(locDoc => {
            if (locDoc && locDoc.id) {
              const locDocTime = safeTimestamp(locDoc.updatedAt);
              if (locDocTime >= syncStartTime) {
                hasInFlightEdits = true;
                const incDoc = inFlightTrackerMap.get(locDoc.id);
                if (!incDoc) {
                  inFlightTrackerMap.set(locDoc.id, locDoc);
                } else {
                  const mergedTopics = { ...(incDoc.topics || {}) };
                  Object.entries(locDoc.topics || {}).forEach(([tKey, locTopic]) => {
                    const locTopTime = safeTimestamp(locTopic?.updatedAt || locDocTime);
                    if (locTopTime >= syncStartTime) {
                      mergedTopics[tKey] = locTopic;
                    }
                  });
                  inFlightTrackerMap.set(locDoc.id, {
                    ...incDoc,
                    ...locDoc,
                    topics: mergedTopics,
                    updatedAt: locDoc.updatedAt
                  });
                }
              }
            }
          });
          finalSubjectTracker = Array.from(inFlightTrackerMap.values());

          // Reconcile PYT User Progress
          const inFlightPytMap = new Map(finalPytProg.map(d => [d.id, d]));
          livePytProg.forEach(locP => {
            if (locP && locP.id) {
              const locTime = safeTimestamp(locP.updatedAt);
              if (locTime >= syncStartTime) {
                hasInFlightEdits = true;
                inFlightPytMap.set(locP.id, locP);
              }
            }
          });
          finalPytProg = Array.from(inFlightPytMap.values());
        }

        // Atomic clear and put for topics
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORES.TOPICS, 'readwrite');
          const st = tx.objectStore(STORES.TOPICS);
          const clearReq = st.clear();
          clearReq.onsuccess = () => {
            finalTopics.forEach(t => { if (t && t.id) st.put(t); });
          };
          clearReq.onerror = () => reject(clearReq.error);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        });

        await setLocalKV('trash_topics', finalTrashTopics);

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

        if (finalSubjectTracker) await setLocalKV('subject_tracker_data', finalSubjectTracker);
        if (finalPytProg) await setLocalKV('pyt_user_progress', finalPytProg);
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
                if (locTime >= syncStartTime) hasInFlightEdits = true;
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

        const unifiedGraves = (await getUnifiedGraves()) || [];

        if (Array.isArray(incomingPyt)) {
          const pytGraveMap = new Map();
          unifiedGraves.forEach(g => {
            if (!g) return;
            const type = g.entityType || g.type;
            if (type === 'pyt_topic') {
              const delTime = safeTimestamp(g.deletedAt || g.timestamp || 0);
              if (g.entityId) pytGraveMap.set(String(g.entityId).toLowerCase(), Math.max(delTime, pytGraveMap.get(String(g.entityId).toLowerCase()) || 0));
              if (g.metadata?.subject) pytGraveMap.set(String(g.metadata.subject).toLowerCase(), Math.max(delTime, pytGraveMap.get(String(g.metadata.subject).toLowerCase()) || 0));
            }
          });

          for (const item of incomingPyt) {
            if (item && item.key) {
              const key = String(item.key).toLowerCase();
              const itemTime = safeTimestamp(item.updatedAt || item.createdAt || 0);
              const delTime = pytGraveMap.get(key);
              if (delTime && delTime >= itemTime) continue; // Tombstoned

              const localItem = await getLocalItem(STORES.PYT_DATA, item.key);
              if (!localItem || itemTime > safeTimestamp(localItem.updatedAt || localItem.createdAt || 0)) {
                await putLocalItem(STORES.PYT_DATA, item);
              }
            }
          }
        }

        // Non-destructive entity-level merge for Subject Tracker Topics & FSRS states
        const localSubjectTracker = (await getLocalSubjectTrackerData()) || (await getLocalKV('subject_tracker_data')) || [];
        const mergedTracker = mergeSubjectTrackerArrays(localSubjectTracker, b.subjectTracker || [], localTrashTopics, incomingTrashTopics, unifiedGraves);
        await setLocalKV('subject_tracker_data', mergedTracker);

        // Non-destructive merge for PYT user progress
        const localPytProg = (await getLocalKV('pyt_user_progress')) || [];
        const mergedPytProg = mergePytUserProgress(localPytProg, b.pytUserProgress || [], unifiedGraves);
        await setLocalKV('pyt_user_progress', mergedPytProg);

        // Non-destructive merge for textbooks metadata
        const localBooks = (await getLocalKV('textbooks_metadata')) || [];
        const mergedBooks = mergeTextbooksMetadata(localBooks, b.textbooksMetadata || []);
        await setLocalKV('textbooks_metadata', mergedBooks);
      }
    }

    // 3. Study Logs (Deep Merging & Session/GT Unioning with Tombstone Pruning)
    if (bundles['study_logs.json']) {
      emit(++step, totalSteps, 'Hydrating Study Logs & Velocity Telemetry…');
      const b = bundles['study_logs.json'];
      const incomingLogs = b.studyLogs || {};
      const incomingTrash = b.trashStudyLogs || [];

      if (strategy === 'replace') {
        let finalLogs = incomingLogs;
        let finalTrash = incomingTrash;
        let finalSchedule = b.studySchedule;

        if (syncStartTime > 0) {
          const liveLogs = (await getLocalStudyLogs()) || (await getLocalKV('study_logs')) || {};
          const liveTrash = (await getTrashStudyLogs()) || (await getLocalKV('trash_study_logs')) || [];
          const liveSchedule = (await getLocalKV('study_schedule')) || {};

          const logsMap = { ...incomingLogs };
          Object.entries(liveLogs).forEach(([dateStr, liveDayLog]) => {
            if (liveDayLog) {
              const liveTime = safeTimestamp(liveDayLog.updatedAt);
              if (liveTime >= syncStartTime) {
                hasInFlightEdits = true;
                logsMap[dateStr] = liveDayLog;
              }
            }
          });
          finalLogs = logsMap;

          const trashMap = new Map(incomingTrash.map(t => [t.dateKey, t]));
          liveTrash.forEach(locT => {
            if (locT && locT.dateKey) {
              const locDelTime = safeTimestamp(locT.deletedAt);
              if (locDelTime >= syncStartTime) {
                hasInFlightEdits = true;
                trashMap.set(locT.dateKey, locT);
                delete finalLogs[locT.dateKey];
              }
            }
          });
          finalTrash = Array.from(trashMap.values());

          if (b.studySchedule || Object.keys(liveSchedule).length > 0) {
            const schedMap = { ...(b.studySchedule || {}) };
            Object.entries(liveSchedule).forEach(([dateStr, liveSched]) => {
              if (liveSched && safeTimestamp(liveSched.updatedAt) >= syncStartTime) {
                hasInFlightEdits = true;
                schedMap[dateStr] = liveSched;
              }
            });
            const unifiedGraves = (await getUnifiedGraves()) || [];
            finalSchedule = mergeStudyScheduleObjects(schedMap, b.studySchedule || {}, unifiedGraves);
          }
        }

        await setLocalKV('study_logs', finalLogs);
        await setLocalKV('trash_study_logs', finalTrash);
        if (finalSchedule) await setLocalKV('study_schedule', finalSchedule);
        if (b.scheduleTemplates) await setLocalKV('schedule_templates', b.scheduleTemplates);
        if (b.timerState) await setLocalKV('timerState', b.timerState);
        if (b.activeNewTopicsToday) await setLocalKV('active_new_topics_today', b.activeNewTopicsToday);
        if (Array.isArray(b.activeNewTopicsRecords)) {
          for (const r of b.activeNewTopicsRecords) {
            if (r && r.key) await putLocalItem(STORES.KV_STORE, r);
          }
        }
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
        // Deep-merge study logs by date with session unioning and tombstone pruning
        const existing = (await getLocalStudyLogs()) || {};
        const localTrash = (await getTrashStudyLogs()) || (await getLocalKV('trash_study_logs')) || [];
        const unifiedGraves = (await getUnifiedGraves()) || [];
        const merged = mergeStudyLogsObjects(existing, incomingLogs, localTrash, incomingTrash, unifiedGraves);
        await setLocalKV('study_logs', merged);

        // Merge and union trash study logs
        const mergedTrashMap = new Map(localTrash.map(t => [t.dateKey, t]));
        incomingTrash.forEach(t => {
          if (t && t.dateKey) {
            const exist = mergedTrashMap.get(t.dateKey);
            if (!exist || safeTimestamp(t.deletedAt) > safeTimestamp(exist.deletedAt)) {
              mergedTrashMap.set(t.dateKey, t);
            }
          }
        });
        await setLocalKV('trash_study_logs', Array.from(mergedTrashMap.values()));

        if (b.studySchedule) {
          const existSched = (await getLocalKV('study_schedule')) || {};
          const mergedSched = mergeStudyScheduleObjects(existSched, b.studySchedule, unifiedGraves);
          await setLocalKV('study_schedule', mergedSched);
        }
        if (b.scheduleTemplates) {
          const existTemplates = (await getLocalKV('schedule_templates')) || [];
          const mergedTemplates = mergeScheduleTemplatesArrays(existTemplates, b.scheduleTemplates, unifiedGraves);
          await setLocalKV('schedule_templates', mergedTemplates);
        }
        if (Array.isArray(b.campDailyLogs)) {
          const existingLogs = (await getAllLocalItems(STORES.CAMP_DAILY_LOGS)) || [];
          const mergedLogs = mergeCampDailyLogs(existingLogs, b.campDailyLogs, unifiedGraves);
          for (const log of mergedLogs) {
            if (log && log.dateStr) {
              await putLocalItem(STORES.CAMP_DAILY_LOGS, log);
              if (typeof window !== 'undefined' && window.localStorage) {
                if (log.sessions) localStorage.setItem(`camp_sessions_${log.dateStr}`, JSON.stringify(log.sessions));
                if (log.bedToBook) localStorage.setItem(`camp_bedToBook_${log.dateStr}`, log.bedToBook);
              }
            }
          }
        }
        if (b.activeNewTopicsToday) {
          await setLocalKV('active_new_topics_today', b.activeNewTopicsToday);
        }
        if (Array.isArray(b.activeNewTopicsRecords)) {
          for (const r of b.activeNewTopicsRecords) {
            if (r && r.key) {
              const loc = await getLocalItem(STORES.KV_STORE, r.key);
              if (!loc || safeTimestamp(r.updatedAt) >= safeTimestamp(loc.updatedAt)) {
                await putLocalItem(STORES.KV_STORE, r);
              }
            }
          }
        }
      }
    }

    // 4. FSRS Config & Settings (including persistent cross-device settings)
    if (bundles['fsrs_config.json']) {
      emit(++step, totalSteps, 'Hydrating FSRS-6 Config, Hints & Preferences…');
      const b = bundles['fsrs_config.json'];
      if (b.fsrsConfig) await saveFSRSConfig(b.fsrsConfig);
      if (b.localUserProfile) await setLocalKV('local_user_profile', b.localUserProfile);
      if (b.aiRecommendations) {
        await setLocalKV('ai_topic_recommendations', b.aiRecommendations);
      }
      if (Array.isArray(b.aiRecommendationsRecords)) {
        for (const r of b.aiRecommendationsRecords) {
          if (r && r.key) {
            if (strategy === 'replace') {
              await putLocalItem(STORES.KV_STORE, r);
            } else {
              const loc = await getLocalItem(STORES.KV_STORE, r.key);
              if (!loc || safeTimestamp(r.updatedAt) >= safeTimestamp(loc.updatedAt)) {
                await putLocalItem(STORES.KV_STORE, r);
              }
            }
          }
        }
      }

      if (strategy === 'replace') {
        let finalPrompts = Array.isArray(b.customPrompts) ? b.customPrompts : [];
        if (syncStartTime > 0) {
          const livePrompts = (await getLocalKV('custom_prompts')) || [];
          const promptMap = new Map(finalPrompts.map(p => [p.id, p]));
          livePrompts.forEach(p => {
            if (p && p.id && safeTimestamp(p.updatedAt || p.createdAt) >= syncStartTime) {
              hasInFlightEdits = true;
              promptMap.set(p.id, p);
            }
          });
          finalPrompts = Array.from(promptMap.values());
        }
        if (finalPrompts.length > 0) {
          await setLocalKV('custom_prompts', finalPrompts);
        }

        const db = await initDB();
        // Atomic clear and put for TOPIC_HINTS
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORES.TOPIC_HINTS, 'readwrite');
          const st = tx.objectStore(STORES.TOPIC_HINTS);
          const clearReq = st.clear();
          clearReq.onsuccess = () => {
            if (Array.isArray(b.topicHints)) {
              b.topicHints.forEach(h => { if (h && h.topicId) st.put(h); });
            }
          };
          clearReq.onerror = () => reject(clearReq.error);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        });

        // Atomic clear and put for HINT_QUOTA
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORES.HINT_QUOTA, 'readwrite');
          const st = tx.objectStore(STORES.HINT_QUOTA);
          const clearReq = st.clear();
          clearReq.onsuccess = () => {
            if (Array.isArray(b.hintQuota)) {
              b.hintQuota.forEach(q => { if (q && q.dateStr) st.put(q); });
            }
          };
          clearReq.onerror = () => reject(clearReq.error);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        });

        // For SETTINGS: preserve local google_drive_auth, in-flight settings, replace other clean keys
        const localAuth = await getLocalSetting('google_drive_auth');
        const liveSettings = syncStartTime > 0 ? ((await getAllLocalItems(STORES.SETTINGS)) || []) : [];
        const inFlightSettingsMap = new Map();
        if (Array.isArray(liveSettings)) {
          liveSettings.forEach(s => {
            if (s && s.key && safeTimestamp(s.updatedAt) >= syncStartTime) {
              hasInFlightEdits = true;
              inFlightSettingsMap.set(s.key, s);
            }
          });
        }

        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORES.SETTINGS, 'readwrite');
          const st = tx.objectStore(STORES.SETTINGS);
          const clearReq = st.clear();
          clearReq.onsuccess = () => {
            if (localAuth) st.put({ key: 'google_drive_auth', value: localAuth });
            if (Array.isArray(b.settings)) {
              b.settings.forEach(s => {
                if (s && s.key && isCleanSettingKey(s.key)) {
                  const inFlight = inFlightSettingsMap.get(s.key);
                  st.put(inFlight || s);
                  inFlightSettingsMap.delete(s.key);
                }
              });
            }
            for (const s of inFlightSettingsMap.values()) {
              if (s && s.key && isCleanSettingKey(s.key)) {
                st.put(s);
              }
            }
          };
          clearReq.onerror = () => reject(clearReq.error);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        });
      } else {
        // Merge custom prompts non-destructively, pruning tombstoned entries
        if (Array.isArray(b.customPrompts)) {
          const existingPrompts = (await getLocalKV('custom_prompts')) || [];
          const promptMap = new Map(existingPrompts.map(p => [p.id, p]));
          const localTrashPrompts = (await getLocalKV('trash_prompts')) || [];
          const localTrashPromptMap = new Map(localTrashPrompts.map(p => [p.id, safeTimestamp(p.deletedAt)]));
          b.customPrompts.forEach(p => {
            if (p && p.id) {
              const localDeletedAt = localTrashPromptMap.get(p.id);
              const incTime = safeTimestamp(p.updatedAt || p.createdAt);
              if (!localDeletedAt || localDeletedAt <= incTime) {
                const existing = promptMap.get(p.id);
                if (!existing) {
                  promptMap.set(p.id, p);
                } else {
                  const locTime = safeTimestamp(existing.updatedAt || existing.createdAt);
                  if (locTime >= syncStartTime) hasInFlightEdits = true;
                  promptMap.set(p.id, incTime >= locTime ? p : existing);
                }
              }
            }
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
            if (s && s.key && isCleanSettingKey(s.key)) {
              await putLocalItem(STORES.SETTINGS, s);
            }
          }
        }
      }

      // Hydrate localStorage snapshot settings into browser localStorage
      if (b.localStorageSnapshot && typeof b.localStorageSnapshot === 'object') {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            Object.entries(b.localStorageSnapshot).forEach(([k, v]) => {
              if (v !== null && v !== undefined && isCleanLsKey(k)) {
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
      emit(++step, totalSteps, 'Hydrating CAMP tracker logs…');
      const b = bundles['camp_tracker.json'];
      if (strategy === 'replace') {
        const db = await initDB();
        let finalCampTracker = Array.isArray(b.campTracker) ? b.campTracker : [];
        let finalCampData = Array.isArray(b.campData) ? b.campData : [];

        if (syncStartTime > 0) {
          const liveCampTracker = (await getAllLocalItems(STORES.CAMP_TRACKER)) || [];
          const liveCampData = (await getAllLocalItems(STORES.CAMP_DATA)) || [];
          const trackerMap = new Map(finalCampTracker.map(t => [t.id, t]));
          liveCampTracker.forEach(t => {
            if (t && t.id && safeTimestamp(t.updatedAt) >= syncStartTime) {
              hasInFlightEdits = true;
              trackerMap.set(t.id, t);
            }
          });
          finalCampTracker = Array.from(trackerMap.values());

          const dataMap = new Map(finalCampData.map(d => [d.key, d]));
          liveCampData.forEach(d => {
            if (d && d.key && safeTimestamp(d.updatedAt) >= syncStartTime) {
              hasInFlightEdits = true;
              dataMap.set(d.key, d);
            }
          });
          finalCampData = Array.from(dataMap.values());
        }

        // Atomic clear and replace for CAMP_TRACKER
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORES.CAMP_TRACKER, 'readwrite');
          const st = tx.objectStore(STORES.CAMP_TRACKER);
          const clearReq = st.clear();
          clearReq.onsuccess = () => {
            finalCampTracker.forEach(t => { if (t && t.id) st.put(t); });
          };
          clearReq.onerror = () => reject(clearReq.error);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        });

        // Atomic clear and replace for CAMP_DATA
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORES.CAMP_DATA, 'readwrite');
          const st = tx.objectStore(STORES.CAMP_DATA);
          const clearReq = st.clear();
          clearReq.onsuccess = () => {
            finalCampData.forEach(d => { if (d && d.key) st.put(d); });
          };
          clearReq.onerror = () => reject(clearReq.error);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        });
      } else {
        if (Array.isArray(b.campTracker)) {
          const liveCampTracker = (await getAllLocalItems(STORES.CAMP_TRACKER)) || [];
          const localTrashCamp = (await getLocalKV('trash_camp')) || [];
          const mergedTracker = mergeCampTrackers(liveCampTracker, b.campTracker, localTrashCamp, (await getUnifiedGraves()) || []);
          for (const t of mergedTracker) {
            if (t && t.id) await putLocalItem(STORES.CAMP_TRACKER, t);
          }
        }
        if (Array.isArray(b.campData)) {
          const liveCampData = (await getAllLocalItems(STORES.CAMP_DATA)) || [];
          const mergedData = mergeCampData(liveCampData, b.campData, (await getUnifiedGraves()) || []);
          for (const d of mergedData) {
            if (d && d.key) {
              await putLocalItem(STORES.CAMP_DATA, d);
              if (typeof window !== 'undefined' && window.localStorage && d.data) {
                if (d.key === 'history') localStorage.setItem('camp_history', JSON.stringify(d.data));
                if (d.key === 'timer_history') localStorage.setItem('camp_timer_history', JSON.stringify(d.data));
                if (d.key === 'student_info') localStorage.setItem('camp_student_info', JSON.stringify(d.data));
              }
            }
          }
        }
      }

      // Always persist trashCamp tombstones (both strategies)
      if (Array.isArray(b.trashCamp)) {
        try {
          const localTrashCamp = (await getLocalKV('trash_camp')) || [];
          const trashCampMap = new Map(localTrashCamp.map(t => [t.id, t]));
          b.trashCamp.forEach(t => {
            if (t && t.id) {
              const exist = trashCampMap.get(t.id);
              if (!exist || safeTimestamp(t.deletedAt) > safeTimestamp(exist.deletedAt)) {
                trashCampMap.set(t.id, t);
              }
            }
          });
          await setLocalKV('trash_camp', Array.from(trashCampMap.values()));
        } catch (e) {
          console.warn('[GDriveSync] Error hydrating trashCamp:', e);
        }
      }
    }

    // 6. Scanned Pages & Image Occlusions (Zero-Data-Loss Restoration with Tombstone Pruning)
    if (bundles['pages_bundle.json']) {
      emit(++step, totalSteps, 'Hydrating Scanned Pages & Image Occlusions…');
      const b = bundles['pages_bundle.json'];
      const incomingPages = deserializeBinaryValues(b.pages || []);
      const incomingTrashPages = deserializeBinaryValues(b.trashPages || []);

      if (strategy === 'replace') {
        const localPages = (await getLocalPages()) || [];
        const localTrashPages = (await getLocalKV('trash_pages')) || [];
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

        let finalPages = hydratedPages;
        let finalTrash = incomingTrashPages;

        if (syncStartTime > 0) {
          const pageMap = new Map(hydratedPages.map(p => [p.id, p]));
          const trashMap = new Map(incomingTrashPages.map(p => [p.id, p]));

          localPages.forEach(p => {
            if (p && p.id && safeTimestamp(p.updatedAt || p.createdAt) >= syncStartTime) {
              hasInFlightEdits = true;
              pageMap.set(p.id, p);
            }
          });

          localTrashPages.forEach(p => {
            if (p && p.id && safeTimestamp(p.deletedAt) >= syncStartTime) {
              hasInFlightEdits = true;
              trashMap.set(p.id, p);
              pageMap.delete(p.id);
            }
          });

          finalPages = Array.from(pageMap.values());
          finalTrash = Array.from(trashMap.values());
        }

        await setLocalKV('pages', finalPages);
        await setLocalKV('trash_pages', finalTrash);
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
              return;
            }

            const localP = map.get(p.id);
            if (!localP) {
              map.set(p.id, p);
            } else {
              const locTime = safeTimestamp(localP.updatedAt || localP.createdAt);
              if (locTime >= syncStartTime) hasInFlightEdits = true;
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

      // Always persist unified graves from the incoming bundle (both strategies)
      if (Array.isArray(b.unifiedGraves)) {
        try {
          const localGraves = (await getLocalKV('unified_graves')) || [];
          const gravesMap = new Map(localGraves.map(g => [`${g.entityType}::${g.entityId}`, g]));
          b.unifiedGraves.forEach(g => {
            if (g && g.entityType && g.entityId) {
              const k = `${g.entityType}::${g.entityId}`;
              const exist = gravesMap.get(k);
              if (!exist || safeTimestamp(g.deletedAt) > safeTimestamp(exist.deletedAt)) {
                gravesMap.set(k, g);
              }
            }
          });
          await setLocalKV('unified_graves', Array.from(gravesMap.values()));
        } catch (e) {
          console.warn('[GDriveSync] Error hydrating unified graves:', e);
        }
      }

      // Always persist trashPrompts from the incoming bundle (both strategies)
      if (Array.isArray(b.trashPrompts)) {
        try {
          const localTrashPrompts = (await getLocalKV('trash_prompts')) || [];
          const trashPromptMap = new Map(localTrashPrompts.map(p => [p.id, p]));
          b.trashPrompts.forEach(p => {
            if (p && p.id) {
              const exist = trashPromptMap.get(p.id);
              if (!exist || safeTimestamp(p.deletedAt) > safeTimestamp(exist.deletedAt)) {
                trashPromptMap.set(p.id, p);
              }
            }
          });
          await setLocalKV('trash_prompts', Array.from(trashPromptMap.values()));
        } catch (e) {
          console.warn('[GDriveSync] Error hydrating trashPrompts:', e);
        }
      }
    }

    emit(++step, totalSteps, 'Local database hydrated successfully.');
    return { success: true, hasInFlightEdits };
  } finally {
    if (!options.deferUnsuppress) {
      setMutationNotificationSuppressed(false);
      if (!options.suppressEvent) {
        emitDataHydratedEvent({ strategy, bundleKeys: Object.keys(bundles) });
      }
    }
  }
}

/**
 * Detailed audit of divergent keys between local and remote bundles.
 * Logs exact differing properties for fsrs_config or other bundles to the console.
 */
export function debugAuditBundleDiff(bundleKey, localBundle, remoteBundle) {
  if (!localBundle || !remoteBundle) {
    console.log(`[GDriveSync] [DEBUG-DIFF] ${bundleKey}: One side is missing (local: ${Boolean(localBundle)}, remote: ${Boolean(remoteBundle)})`);
    return;
  }

  if (bundleKey === 'fsrs_config' || bundleKey === 'fsrs_config.json') {
    const diffs = {};

    // 1. Settings diff
    const locSettings = new Map((localBundle.settings || []).map(s => [s.key, s.value]));
    const remSettings = new Map((remoteBundle.settings || []).map(s => [s.key, s.value]));
    const allSettingKeys = new Set([...locSettings.keys(), ...remSettings.keys()]);
    const settingsDiff = [];
    allSettingKeys.forEach(k => {
      const locVal = locSettings.get(k);
      const remVal = remSettings.get(k);
      if (canonicalStringify(locVal) !== canonicalStringify(remVal)) {
        settingsDiff.push({ key: k, local: locVal, remote: remVal });
      }
    });
    if (settingsDiff.length > 0) diffs.settings = settingsDiff;

    // 2. LocalStorage diff
    const locLs = localBundle.localStorageSnapshot || {};
    const remLs = remoteBundle.localStorageSnapshot || {};
    const allLsKeys = new Set([...Object.keys(locLs), ...Object.keys(remLs)]);
    const lsDiff = [];
    allLsKeys.forEach(k => {
      if (locLs[k] !== remLs[k]) {
        lsDiff.push({ key: k, local: locLs[k], remote: remLs[k] });
      }
    });
    if (lsDiff.length > 0) diffs.localStorageSnapshot = lsDiff;

    // 3. FSRS config diff
    if (canonicalStringify(localBundle.fsrsConfig) !== canonicalStringify(remoteBundle.fsrsConfig)) {
      diffs.fsrsConfig = {
        local: localBundle.fsrsConfig,
        remote: remoteBundle.fsrsConfig
      };
    }

    // 4. Custom prompts diff
    if (canonicalStringify(localBundle.customPrompts) !== canonicalStringify(remoteBundle.customPrompts)) {
      diffs.customPrompts = {
        localCount: (localBundle.customPrompts || []).length,
        remoteCount: (remoteBundle.customPrompts || []).length
      };
    }

    // 5. Topic hints / Hint quota diff
    if (canonicalStringify(localBundle.topicHints) !== canonicalStringify(remoteBundle.topicHints)) {
      diffs.topicHints = { localCount: (localBundle.topicHints || []).length, remoteCount: (remoteBundle.topicHints || []).length };
    }
    if (canonicalStringify(localBundle.hintQuota) !== canonicalStringify(remoteBundle.hintQuota)) {
      diffs.hintQuota = { local: localBundle.hintQuota, remote: remoteBundle.hintQuota };
    }

    console.warn('[GDriveSync] [DEBUG-DIFF] fsrs_config divergence breakdown:', JSON.stringify(diffs, null, 2));
    logger.sync('FSRS-CONFIG-DIFF', 'fsrs_config divergence breakdown:', diffs);
  }
}

/**
 * Builds a rich, human-readable breakdown of differences between Local Device and Google Drive Cloud.
 */
function buildConflictDiffDetails(localManifest, remoteManifest, modifiedBundleNames, localHashes, remoteHashes) {
  const localTime = safeTimestamp(localManifest?.lastModifiedTimestamp || localManifest?.lastModified) ||
    (localManifest?.timestamp ? new Date(localManifest.timestamp).getTime() : 0);
  const remoteTime = safeTimestamp(remoteManifest?.lastModifiedTimestamp || remoteManifest?.lastModified) ||
    (remoteManifest?.timestamp ? new Date(remoteManifest.timestamp).getTime() : 0);
  const timeDiffMs = Math.abs(localTime - remoteTime);
  const timeDiffMinutes = Math.round(timeDiffMs / 60000);

  let timeRelation = 'equal';
  let timeDiffText = 'Both collections have user edits around the same time.';
  if (localTime > 0 && remoteTime > 0) {
    if (localTime > remoteTime) {
      timeRelation = 'local_newer';
      timeDiffText = timeDiffMinutes >= 60
        ? `Local device has user edits ~${Math.round(timeDiffMinutes / 60)} hour(s) more recent than Cloud`
        : `Local device has user edits ${timeDiffMinutes || '< 1'} minute(s) more recent than Cloud`;
    } else if (remoteTime > localTime) {
      timeRelation = 'remote_newer';
      timeDiffText = timeDiffMinutes >= 60
        ? `Cloud version has user edits ~${Math.round(timeDiffMinutes / 60)} hour(s) more recent than Local`
        : `Cloud version has user edits ${timeDiffMinutes || '< 1'} minute(s) more recent than Local`;
    }
  } else if (localTime > 0) {
    timeRelation = 'local_newer';
    timeDiffText = 'Local device contains recent user edits.';
  } else if (remoteTime > 0) {
    timeRelation = 'remote_newer';
    timeDiffText = 'Cloud version contains recent user edits.';
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

export async function getLastSyncedHashes() {
  try {
    const key = getDeviceAncestorKey();
    let raw = (await getLocalKV(key)) || (await getLocalKV('autoanki_last_synced_hashes'));
    if (raw && typeof raw === 'object') {
      // FIX-20: Strip any .json extension from keys for deterministic matching
      const normalized = {};
      for (const [k, v] of Object.entries(raw)) {
        normalized[k.replace(/\.json$/i, '')] = v;
      }
      return normalized;
    }
  } catch (e) {
    console.warn('[GDriveSync] Error getting last synced hashes from LocalDB:', e);
  }
  return null;
}

export async function saveLastSyncedHashes(hashes) {
  if (!hashes || typeof hashes !== 'object') return;
  try {
    // FIX-20: Normalize hash keys before saving to IDB
    const normalized = {};
    for (const [k, v] of Object.entries(hashes)) {
      normalized[k.replace(/\.json$/i, '')] = v;
    }
    await setLocalKV(getDeviceAncestorKey(), normalized);
  } catch (e) {
    console.warn('[GDriveSync] Error saving last synced hashes to LocalDB:', e);
  }
}

// FIX-18: Throttling for post-sync integrity health checks to at most once per hour
let lastIntegrityCheckTimestamp = 0;
const ONE_HOUR_MS = 60 * 60 * 1000;

function scheduleThrottledIntegrityCheck() {
  const now = Date.now();
  if (now - lastIntegrityCheckTimestamp < ONE_HOUR_MS) return;
  lastIntegrityCheckTimestamp = now;
  setTimeout(() => {
    runSystemIntegrityCheck({ silent: true }).catch(console.warn);
  }, 3000);
}

/**
 * Merges Subject Tracker array documents with topic-level LWW conflict resolution and deletion awareness.
 * Guarantees Zero-Data-Loss: newer ratings, study dates, and notes always win.
 */
export function mergeSubjectTrackerArrays(localTracker = [], remoteTracker = [], localTrashTopics = [], remoteTrashTopics = [], unifiedGraves = []) {
  const locList = Array.isArray(localTracker) ? localTracker : [];
  const remList = Array.isArray(remoteTracker) ? remoteTracker : [];

  const locTrash = Array.isArray(localTrashTopics) ? localTrashTopics : [];
  const remTrash = Array.isArray(remoteTrashTopics) ? remoteTrashTopics : [];
  const graves = Array.isArray(unifiedGraves) ? unifiedGraves : [];

  // Index tombstones by topicId, topicName, and composite keys from all trash stores & unified graves
  const trashTimeMap = new Map();
  [...locTrash, ...remTrash].forEach(t => {
    if (!t) return;
    const delTime = safeTimestamp(t.deletedAt);
    if (t.id) {
      trashTimeMap.set(String(t.id).toLowerCase(), Math.max(delTime, trashTimeMap.get(String(t.id).toLowerCase()) || 0));
    }
    if (t.topicName) {
      trashTimeMap.set(String(t.topicName).toLowerCase(), Math.max(delTime, trashTimeMap.get(String(t.topicName).toLowerCase()) || 0));
    }
    if (t.name) {
      trashTimeMap.set(String(t.name).toLowerCase(), Math.max(delTime, trashTimeMap.get(String(t.name).toLowerCase()) || 0));
    }
    if (t.docId && t.topicName) {
      const compKey = `${String(t.docId).toLowerCase()}_${String(t.topicName).toLowerCase()}`;
      trashTimeMap.set(compKey, Math.max(delTime, trashTimeMap.get(compKey) || 0));
    }
  });

  graves.forEach(g => {
    if (!g) return;
    const type = g.entityType || g.type;
    if (type === 'tracker_topic' || type === 'topic') {
      const delTime = safeTimestamp(g.deletedAt || g.timestamp || 0);
      if (g.entityId) trashTimeMap.set(String(g.entityId).toLowerCase(), Math.max(delTime, trashTimeMap.get(String(g.entityId).toLowerCase()) || 0));
      if (g.metadata?.topicName) trashTimeMap.set(String(g.metadata.topicName).toLowerCase(), Math.max(delTime, trashTimeMap.get(String(g.metadata.topicName).toLowerCase()) || 0));
      if (g.metadata?.name) trashTimeMap.set(String(g.metadata.name).toLowerCase(), Math.max(delTime, trashTimeMap.get(String(g.metadata.name).toLowerCase()) || 0));
      if ((g.parentId || g.metadata?.docId) && (g.metadata?.topicName || g.metadata?.name)) {
        const pId = g.parentId || g.metadata?.docId;
        const tName = g.metadata?.topicName || g.metadata?.name;
        const compKey = `${String(pId).toLowerCase()}_${String(tName).toLowerCase()}`;
        trashTimeMap.set(compKey, Math.max(delTime, trashTimeMap.get(compKey) || 0));
      }
    }
  });

  const isTopicTombstoned = (docId, tKey, topicObj) => {
    const dTime = safeTimestamp(topicObj?.updatedAt || topicObj?.lastReviewDate || topicObj?.createdAt || 0);
    const keysToCheck = [
      topicObj?.id ? String(topicObj.id).toLowerCase() : null,
      tKey ? String(tKey).toLowerCase() : null,
      topicObj?.name ? String(topicObj.name).toLowerCase() : null,
      docId && tKey ? `${String(docId).toLowerCase()}_${String(tKey).toLowerCase()}` : null
    ].filter(Boolean);

    for (const k of keysToCheck) {
      const delTime = trashTimeMap.get(k);
      // FIX-08: Use strictly greater-than (>) to prevent over-deleting items modified at same timestamp
      if (delTime && delTime > dTime) {
        return true;
      }
    }
    return false;
  };

  const map = new Map();

  // Index all local subject documents
  locList.forEach(doc => {
    if (doc) {
      const key = String(doc.id || doc.subject || '').trim().toLowerCase();
      if (key) map.set(key, { ...doc });
    }
  });

  // Merge remote subject documents
  remList.forEach(remDoc => {
    if (!remDoc) return;
    const key = String(remDoc.id || remDoc.subject || '').trim().toLowerCase();
    if (!key) return;

    if (!map.has(key)) {
      const remTopics = remDoc.topics && typeof remDoc.topics === 'object' ? remDoc.topics : {};
      const filteredRemTopics = {};
      Object.entries(remTopics).forEach(([tKey, tObj]) => {
        if (!isTopicTombstoned(key, tKey, tObj)) {
          filteredRemTopics[tKey] = tObj;
        }
      });
      map.set(key, { ...remDoc, topics: filteredRemTopics });
      return;
    }

    const locDoc = map.get(key);
    const locDocTime = safeTimestamp(locDoc.updatedAt || locDoc.createdAt || 0);
    const remDocTime = safeTimestamp(remDoc.updatedAt || remDoc.createdAt || 0);

    const locTopics = locDoc.topics && typeof locDoc.topics === 'object' ? locDoc.topics : {};
    const remTopics = remDoc.topics && typeof remDoc.topics === 'object' ? remDoc.topics : {};

    const mergedTopics = {};
    const allTopicKeys = new Set([...Object.keys(locTopics), ...Object.keys(remTopics)]);

    allTopicKeys.forEach(tKey => {
      const locT = locTopics[tKey];
      const remT = remTopics[tKey];

      // Prune if tombstoned
      if (isTopicTombstoned(key, tKey, locT || remT)) {
        return;
      }

      // Topic only in remote
      if (!locT && remT) {
        if (isTopicTombstoned(key, tKey, remT)) {
          return; // Prune (tombstoned deletion wins)
        }
        mergedTopics[tKey] = remT;
        return;
      }

      // Topic only in local
      if (locT && !remT) {
        if (isTopicTombstoned(key, tKey, locT)) {
          return; // Prune (tombstoned deletion wins)
        }
        mergedTopics[tKey] = locT;
        return;
      }

      // Both exist: resolve by Last-Write-Wins strictly on topic-level updatedAt/timestamps (never falling back to parent doc timestamps)
      const locTopicTime = safeTimestamp(locT.updatedAt || locT.lastReviewDate || locT.createdAt || 0);
      const remTopicTime = safeTimestamp(remT.updatedAt || remT.lastReviewDate || remT.createdAt || 0);

      const locHasReviews = Array.isArray(locT.studyDates) && locT.studyDates.length > 0;
      const remHasReviews = Array.isArray(remT.studyDates) && remT.studyDates.length > 0;

      let winnerTopic = locT;
      let isLocalFresher = true;

      if (locTopicTime === 0 && remTopicTime > 0) {
        winnerTopic = remT;
        isLocalFresher = false;
      } else if (remTopicTime === 0 && locTopicTime > 0) {
        winnerTopic = locT;
        isLocalFresher = true;
      } else if (remTopicTime > locTopicTime) {
        winnerTopic = remT;
        isLocalFresher = false;
      } else if (locTopicTime > remTopicTime) {
        winnerTopic = locT;
        isLocalFresher = true;
      } else {
        // Equal timestamps (or both 0): if one side has reviews and other does not, preserve the reviewed side
        if (remHasReviews && !locHasReviews) {
          winnerTopic = remT;
          isLocalFresher = false;
        } else if (locHasReviews && !remHasReviews) {
          winnerTopic = locT;
          isLocalFresher = true;
        } else {
          winnerTopic = locT;
          isLocalFresher = true;
        }
      }

      // If one side has reviews and the other has 0 reviews, but timestamps were close or defaulted,
      // never let an unstudied topic with 0 reviews wipe out a studied topic unless the unstudied side
      // has an explicit, newer updatedAt proving an intentional reset/undo!
      if (remHasReviews && !locHasReviews && locTopicTime <= remTopicTime) {
        winnerTopic = remT;
        isLocalFresher = false;
      } else if (locHasReviews && !remHasReviews && remTopicTime <= locTopicTime) {
        winnerTopic = locT;
        isLocalFresher = true;
      }

      // Study dates & review metrics:
      // The fresher side (local if modified/reviewed/undone/deleted, or remote if remotely updated) is authoritative.
      const fresherTopic = isLocalFresher ? locT : remT;
      let finalStudyDates = Array.isArray(fresherTopic.studyDates) ? [...fresherTopic.studyDates] : [];
      let finalReviewCount = fresherTopic.reviewCount !== undefined ? Number(fresherTopic.reviewCount) : finalStudyDates.length;
      let finalReps = fresherTopic.reps !== undefined ? Number(fresherTopic.reps) : finalReviewCount;

      const mergedPage = winnerTopic.page || locT.page || remT.page || '';
      const mergedPageCount = winnerTopic.pageCount !== undefined ? winnerTopic.pageCount : (locT.pageCount || remT.pageCount);
      const mergedPageWeight = winnerTopic.pageWeight !== undefined ? winnerTopic.pageWeight : (locT.pageWeight || remT.pageWeight);
      const mergedNotes = winnerTopic.notes !== undefined ? winnerTopic.notes : (locT.notes || remT.notes);
      const mergedMnemonics = winnerTopic.mnemonics !== undefined ? winnerTopic.mnemonics : (locT.mnemonics || remT.mnemonics);

      const latestTopicTime = Math.max(locTopicTime, remTopicTime, safeTimestamp(winnerTopic.updatedAt));

      mergedTopics[tKey] = {
        ...locT,
        ...remT,
        ...winnerTopic,
        page: mergedPage,
        ...(mergedPageCount !== undefined ? { pageCount: mergedPageCount } : {}),
        ...(mergedPageWeight !== undefined ? { pageWeight: mergedPageWeight } : {}),
        ...(mergedNotes !== undefined ? { notes: mergedNotes } : {}),
        ...(mergedMnemonics !== undefined ? { mnemonics: mergedMnemonics } : {}),
        studyDates: finalStudyDates,
        reviewCount: finalReviewCount,
        reps: finalReps,
        stability: winnerTopic.stability !== undefined ? winnerTopic.stability : null,
        difficulty: winnerTopic.difficulty !== undefined ? winnerTopic.difficulty : null,
        retrievability: winnerTopic.retrievability !== undefined ? winnerTopic.retrievability : null,
        interval: winnerTopic.interval !== undefined ? winnerTopic.interval : null,
        nextReviewDue: winnerTopic.nextReviewDue !== undefined ? winnerTopic.nextReviewDue : null,
        lastReviewDate: winnerTopic.lastReviewDate !== undefined ? winnerTopic.lastReviewDate : (finalStudyDates.length > 0 ? finalStudyDates[finalStudyDates.length - 1] : null),
        lapses: winnerTopic.lapses !== undefined ? winnerTopic.lapses : 0,
        activatedDate: winnerTopic.activatedDate !== undefined ? winnerTopic.activatedDate : null,
        isPickedForToday: winnerTopic.isPickedForToday !== undefined ? Boolean(winnerTopic.isPickedForToday) : false,
        updatedAt: new Date(latestTopicTime || Date.now()).toISOString()
      };
    });

    const maxDocTime = Math.max(
      locDocTime,
      remDocTime,
      ...Object.values(mergedTopics).map(t => safeTimestamp(t.updatedAt || t.lastReviewDate))
    );

    map.set(key, {
      ...remDoc,
      ...locDoc,
      id: locDoc.id || remDoc.id || key,
      subject: locDoc.subject || remDoc.subject || key,
      topics: mergedTopics,
      updatedAt: new Date(maxDocTime || Date.now()).toISOString()
    });
  });

  return Array.from(map.values());
}

/**
 * Merges PYT user progress by subject ID with strict timestamp awareness and tombstone pruning.
 */
export function mergePytUserProgress(localProg = [], remoteProg = [], unifiedGraves = []) {
  const locList = Array.isArray(localProg) ? localProg : [];
  const remList = Array.isArray(remoteProg) ? remoteProg : [];
  const graves = Array.isArray(unifiedGraves) ? unifiedGraves : [];

  const tombstoneMap = new Map();
  graves.forEach(g => {
    if (!g) return;
    const type = g.entityType || g.type;
    if (type === 'pyt_user_progress' || type === 'pyt_progress' || type === 'pyt_topic') {
      const delTime = safeTimestamp(g.deletedAt || g.timestamp || 0);
      if (g.entityId) tombstoneMap.set(String(g.entityId).toLowerCase(), Math.max(delTime, tombstoneMap.get(String(g.entityId).toLowerCase()) || 0));
      if (g.metadata?.docId) tombstoneMap.set(String(g.metadata.docId).toLowerCase(), Math.max(delTime, tombstoneMap.get(String(g.metadata.docId).toLowerCase()) || 0));
      if (g.metadata?.subject) tombstoneMap.set(String(g.metadata.subject).toLowerCase(), Math.max(delTime, tombstoneMap.get(String(g.metadata.subject).toLowerCase()) || 0));
    }
  });

  const isDocTombstoned = (key, doc) => {
    const docTime = safeTimestamp(doc?.updatedAt || doc?.createdAt || 0);
    const delTime = tombstoneMap.get(String(key).toLowerCase());
    // FIX-08: Strictly greater-than prevents accidental deletion of items with equal timestamps
    return Boolean(delTime && delTime > docTime);
  };

  const map = new Map();

  locList.forEach(p => {
    if (p) {
      const k = String(p.id || p.subject || '').trim().toLowerCase();
      if (k && !isDocTombstoned(k, p)) {
        map.set(k, { ...p });
      }
    }
  });

  remList.forEach(remP => {
    if (!remP) return;
    const k = String(remP.id || remP.subject || '').trim().toLowerCase();
    if (!k || isDocTombstoned(k, remP)) return;

    if (!map.has(k)) {
      map.set(k, { ...remP });
      return;
    }

    const locP = map.get(k);
    const locTime = safeTimestamp(locP.updatedAt || locP.createdAt || 0);
    const remTime = safeTimestamp(remP.updatedAt || remP.createdAt || 0);

    const isLocalFresher = locTime >= remTime;
    const fresherDoc = isLocalFresher ? locP : remP;
    const olderDoc = isLocalFresher ? remP : locP;

    // Progress map merge:
    // The fresher side is authoritative for all keys present on either side.
    // Keys present in the fresher side MUST keep their exact count (even if 0 or decremented!).
    // Keys ONLY present in the older side (not present in fresher side) are merged in if fresher didn't explicitly delete them.
    const fresherProgress = fresherDoc.progress_map || {};
    const olderProgress = olderDoc.progress_map || {};
    const mergedProgress = { ...olderProgress, ...fresherProgress };

    // Merged topics: fresher side wins
    const fresherMergedTopics = fresherDoc.merged_topics || {};
    const olderMergedTopics = olderDoc.merged_topics || {};
    const mergedTopics = { ...olderMergedTopics, ...fresherMergedTopics };

    // Pages map: fresher side wins
    const fresherPages = fresherDoc.pages_map || {};
    const olderPages = olderDoc.pages_map || {};
    const mergedPages = { ...olderPages, ...fresherPages };

    const maxTime = Math.max(locTime, remTime, Date.now());
    map.set(k, {
      ...olderDoc,
      ...fresherDoc,
      id: locP.id || remP.id || k,
      subject: locP.subject || remP.subject || k,
      progress_map: mergedProgress,
      merged_topics: mergedTopics,
      pages_map: mergedPages,
      updatedAt: new Date(maxTime).toISOString()
    });
  });

  return Array.from(map.values());
}

/**
 * Merges textbooks metadata with timestamp awareness.
 */
export function mergeTextbooksMetadata(localBooks = [], remoteBooks = []) {
  const locList = Array.isArray(localBooks) ? localBooks : [];
  const remList = Array.isArray(remoteBooks) ? remoteBooks : [];
  const map = new Map();

  locList.forEach(b => {
    if (b && b.id) map.set(b.id, { ...b });
  });

  remList.forEach(remB => {
    if (!remB || !remB.id) return;
    const k = remB.id;
    if (!map.has(k)) {
      map.set(k, { ...remB });
      return;
    }

    const locB = map.get(k);
    const locTime = safeTimestamp(locB.updatedAt || locB.lastOpened || 0);
    const remTime = safeTimestamp(remB.updatedAt || remB.lastOpened || 0);
    const winner = remTime >= locTime ? remB : locB;

    map.set(k, {
      ...locB,
      ...remB,
      ...winner,
      updatedAt: new Date(Math.max(locTime, remTime, Date.now())).toISOString()
    });
  });

  return Array.from(map.values());
}

/**
 * Merges two FSRS configuration objects across all 7 categories deeply and non-destructively.
 */
export function mergeFsrsConfigs(loc = {}, rem = {}) {
  if (!loc || typeof loc !== 'object') return rem || {};
  if (!rem || typeof rem !== 'object') return loc || {};

  const locTime = safeTimestamp(loc.updatedAt || loc.lastModified);
  const remTime = safeTimestamp(rem.updatedAt || rem.lastModified);
  const winnerBase = remTime > locTime ? rem : loc;

  // 1. Daily Limits
  const locDaily = loc.dailyLimits || {};
  const remDaily = rem.dailyLimits || {};
  const mergedSubjectOverrides = {
    ...(remDaily.subjectOverrides || {}),
    ...(locDaily.subjectOverrides || {})
  };
  Object.keys(locDaily.subjectOverrides || {}).forEach(sub => {
    if (remDaily.subjectOverrides && remDaily.subjectOverrides[sub]) {
      const locSub = locDaily.subjectOverrides[sub];
      const remSub = remDaily.subjectOverrides[sub];
      mergedSubjectOverrides[sub] = (locTime >= remTime) ? { ...remSub, ...locSub } : { ...locSub, ...remSub };
    }
  });

  const mergedDailyLimits = {
    ...remDaily,
    ...locDaily,
    ...winnerBase.dailyLimits,
    subjectOverrides: mergedSubjectOverrides,
    todayOverride: locDaily.todayOverride || remDaily.todayOverride || null
  };

  // 2. New Topics
  const mergedNewTopics = {
    ...(rem.newTopics || {}),
    ...(loc.newTopics || {}),
    ...(winnerBase.newTopics || {})
  };

  // 3. Lapses & Leeches
  const mergedLapses = {
    ...(rem.lapses || {}),
    ...(loc.lapses || {}),
    ...(winnerBase.lapses || {})
  };

  // 4. Display Order
  const mergedDisplayOrder = {
    ...(rem.displayOrder || {}),
    ...(loc.displayOrder || {}),
    ...(winnerBase.displayOrder || {})
  };

  // 5. Easy Days
  const mergedEasyDays = {
    ...(rem.easyDays || {}),
    ...(loc.easyDays || {}),
    ...(winnerBase.easyDays || {})
  };

  // 6. Advanced Rules
  const mergedAdvancedRules = {
    ...(rem.advancedRules || {}),
    ...(loc.advancedRules || {}),
    ...(winnerBase.advancedRules || {})
  };

  // 7. Per-Subject Retention
  const mergedPerSubjectRetention = {
    ...(rem.perSubjectRetention || {}),
    ...(loc.perSubjectRetention || {})
  };

  // Weights: preserve custom weights if present
  let mergedWeights = winnerBase.weights || loc.weights || rem.weights;

  // FIX-11: Preserve updatedAt from the latest config to maintain correct LWW semantics on future syncs
  const mergedUpdatedAt = new Date(Math.max(locTime, remTime) || Date.now()).toISOString();

  const result = {
    ...rem,
    ...loc,
    ...winnerBase,
    dailyLimits: mergedDailyLimits,
    newTopics: mergedNewTopics,
    lapses: mergedLapses,
    displayOrder: mergedDisplayOrder,
    easyDays: mergedEasyDays,
    advancedRules: mergedAdvancedRules,
    perSubjectRetention: mergedPerSubjectRetention,
    weights: mergedWeights,
    updatedAt: mergedUpdatedAt
  };
  delete result.lastModified;
  return result;
}

/**
 * Merges IndexedDB settings store arrays by setting key with timestamp awareness.
 */
export function mergeSettingsArrays(locSettings = [], remSettings = []) {
  const locList = Array.isArray(locSettings) ? locSettings : [];
  const remList = Array.isArray(remSettings) ? remSettings : [];
  const map = new Map();

  locList.forEach(s => {
    if (s && (s.key || s.id) && isCleanSettingKey(s.key || s.id)) {
      map.set(s.key || s.id, { key: s.key || s.id, value: s.value });
    }
  });

  remList.forEach(remS => {
    if (!remS || (!remS.key && !remS.id)) return;
    const k = remS.key || remS.id;
    if (!isCleanSettingKey(k)) return;

    if (!map.has(k)) {
      map.set(k, { key: k, value: remS.value });
      return;
    }

    const locS = map.get(k);
    const locTime = safeTimestamp(locS.updatedAt || locS.lastModified || (typeof locS.value === 'object' ? locS.value?.updatedAt : 0));
    const remTime = safeTimestamp(remS.updatedAt || remS.lastModified || (typeof remS.value === 'object' ? remS.value?.updatedAt : 0));

    let mergedValue = remTime > locTime ? remS.value : locS.value;
    if (typeof locS.value === 'object' && typeof remS.value === 'object' && locS.value !== null && remS.value !== null) {
      if (Array.isArray(locS.value) && Array.isArray(remS.value)) {
        mergedValue = remTime > locTime ? remS.value : locS.value;
      } else {
        mergedValue = remTime > locTime ? { ...locS.value, ...remS.value } : { ...remS.value, ...locS.value };
      }
    }

    map.set(k, {
      key: k,
      value: mergedValue
    });
  });

  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Merges Topic Hints arrays by topicId with timestamp awareness.
 */
export function mergeTopicHintsArrays(locHints = [], remHints = []) {
  const locList = Array.isArray(locHints) ? locHints : [];
  const remList = Array.isArray(remHints) ? remHints : [];
  const map = new Map();

  locList.forEach(h => {
    if (h && h.topicId) map.set(h.topicId, h);
  });

  remList.forEach(remH => {
    if (!remH || !remH.topicId) return;
    const k = remH.topicId;
    if (!map.has(k)) {
      map.set(k, remH);
      return;
    }
    const locH = map.get(k);
    const locTime = safeTimestamp(locH.generatedAt || locH.updatedAt);
    const remTime = safeTimestamp(remH.generatedAt || remH.updatedAt);
    map.set(k, remTime > locTime ? remH : locH);
  });

  return Array.from(map.values());
}

/**
 * Merges Hint Quota arrays by dateStr.
 */
export function mergeHintQuotaArrays(locQuota = [], remQuota = []) {
  const locList = Array.isArray(locQuota) ? locQuota : [];
  const remList = Array.isArray(remQuota) ? remQuota : [];
  const map = new Map();

  locList.forEach(q => {
    if (q && q.dateStr) map.set(q.dateStr, q);
  });

  remList.forEach(remQ => {
    if (!remQ || !remQ.dateStr) return;
    const k = remQ.dateStr;
    if (!map.has(k)) {
      map.set(k, remQ);
      return;
    }
    const locQ = map.get(k);
    // FIX-07: Use LWW on updatedAt/resetAt before taking Math.max as fallback
    const locTime = safeTimestamp(locQ.updatedAt || locQ.resetAt);
    const remTime = safeTimestamp(remQ.updatedAt || remQ.resetAt);
    const winner = (locTime > 0 || remTime > 0) ? (remTime > locTime ? remQ : locQ) : null;
    map.set(k, {
      ...locQ,
      ...remQ,
      count: winner ? Number(winner.count || 0) : Math.max(Number(locQ.count || 0), Number(remQ.count || 0)),
      updatedAt: new Date(Math.max(locTime, remTime) || Date.now()).toISOString()
    });
  });

  return Array.from(map.values());
}

/**
 * Merges study logs objects across dates with collision-resistant FSRS log unioning and tombstone pruning.
 */
export function mergeStudyLogsObjects(locLogs = {}, remLogs = {}, locTrashLogs = [], remTrashLogs = [], unifiedGraves = []) {
  const mergedLogs = { ...(locLogs || {}) };

  const locTrashMap = new Map((locTrashLogs || []).map(t => [t.dateKey, safeTimestamp(t.deletedAt)]));
  const remTrashMap = new Map((remTrashLogs || []).map(t => [t.dateKey, safeTimestamp(t.deletedAt)]));

  const gtGravesMap = new Map();
  const studyLogGravesMap = new Map();
  const subLogGravesMap = new Map();
  const trackerTopicGravesMap = new Map();
  const sessionGravesMap = new Map();
  (unifiedGraves || []).forEach(g => {
    if (!g) return;
    const type = g.entityType || g.type;
    const delTime = safeTimestamp(g.deletedAt || g.timestamp || 0);
    if (type === 'gt') {
      if (g.entityId) gtGravesMap.set(String(g.entityId).toLowerCase(), delTime);
      if (g.metadata?.name) {
        gtGravesMap.set(String(g.metadata.name).trim().toLowerCase(), delTime);
        if (g.parentId) {
          gtGravesMap.set(`${String(g.parentId).trim().toLowerCase()}_${String(g.metadata.name).trim().toLowerCase()}`, delTime);
        }
      }
    } else if (type === 'study_session' || type === 'session') {
      if (g.entityId) sessionGravesMap.set(String(g.entityId).toLowerCase(), delTime);
      if (g.metadata?.id) sessionGravesMap.set(String(g.metadata.id).toLowerCase(), delTime);
    } else if (type === 'study_log') {
      if (g.entityId) {
        studyLogGravesMap.set(String(g.entityId), delTime);
        locTrashMap.set(String(g.entityId), Math.max(delTime, locTrashMap.get(String(g.entityId)) || 0));
        remTrashMap.set(String(g.entityId), Math.max(delTime, remTrashMap.get(String(g.entityId)) || 0));
      }
    } else if (type === 'study_log_entry') {
      if (g.entityId) subLogGravesMap.set(String(g.entityId).toLowerCase(), delTime);
      if (g.metadata?.logId) subLogGravesMap.set(String(g.metadata.logId).toLowerCase(), delTime);
      if (g.metadata?.dateStr && g.metadata?.topicName) {
        subLogGravesMap.set(`${String(g.metadata.dateStr)}_${String(g.metadata.topicName).toLowerCase()}`, delTime);
      }
    } else if (type === 'tracker_topic' || type === 'topic') {
      if (g.entityId) trackerTopicGravesMap.set(String(g.entityId).toLowerCase(), delTime);
      if (g.metadata?.name) trackerTopicGravesMap.set(String(g.metadata.name).trim().toLowerCase(), delTime);
      if (g.metadata?.topicName) trackerTopicGravesMap.set(String(g.metadata.topicName).trim().toLowerCase(), delTime);
    }
  });

  const isFsrsLogTombstoned = (l, dKey) => {
    if (!l || typeof l !== 'object') return true;
    const logTime = safeTimestamp(l.timestamp || l.updatedAt || 0);
    if (l.id) {
      const delTime = subLogGravesMap.get(String(l.id).toLowerCase());
      if (delTime && delTime >= logTime) return true;
    }
    if (l.topicName) {
      const topDelTime = trackerTopicGravesMap.get(String(l.topicName).trim().toLowerCase());
      if (topDelTime && topDelTime >= logTime) return true;
      const targetDate = l.dateStr || dKey;
      if (targetDate) {
        const comboKey = `${String(targetDate)}_${String(l.topicName).trim().toLowerCase()}`;
        const comboDelTime = subLogGravesMap.get(comboKey);
        if (comboDelTime && comboDelTime >= logTime) return true;
      }
    }
    return false;
  };

  const isSessionTombstoned = (s) => {
    if (!s || typeof s !== 'object') return true;
    if (s.isDeleted || s.deletedAt) return true;
    if (s.id) {
      const delTime = sessionGravesMap.get(String(s.id).toLowerCase());
      const sTime = safeTimestamp(s.updatedAt || s.startedAt || s.createdAt || 0);
      if (delTime && delTime >= sTime) return true;
    }
    return false;
  };

  // 1. Prune local logs if remote or unified graves deleted them after their last update
  for (const [dateKey, log] of Object.entries(mergedLogs)) {
    const remDeletedAt = remTrashMap.get(dateKey) || studyLogGravesMap.get(dateKey);
    if (remDeletedAt) {
      const logTime = safeTimestamp(log?.updatedAt || log?.lastReviewDate || 0);
      if (remDeletedAt > logTime) {
        delete mergedLogs[dateKey];
        continue;
      }
    }
    // Prune any tombstoned sub-logs inside local dayLog
    if (log && Array.isArray(log.fsrsLogs)) {
      const filtered = log.fsrsLogs.filter(l => !isFsrsLogTombstoned(l, dateKey));
      if (filtered.length !== log.fsrsLogs.length) {
        mergedLogs[dateKey] = {
          ...log,
          cards: Math.max(0, (log.cards || 0) - (log.fsrsLogs.length - filtered.length)),
          fsrsLogs: filtered
        };
      }
    }
  }

  // 2. Process incoming remote logs
  for (const [dateKey, incLog] of Object.entries(remLogs || {})) {
    const locDeletedAt = locTrashMap.get(dateKey) || studyLogGravesMap.get(dateKey);
    const remDeletedAt = remTrashMap.get(dateKey) || studyLogGravesMap.get(dateKey);
    const incTime = safeTimestamp(incLog?.updatedAt || incLog?.lastReviewDate || 0);

    // If local deleted this log after incoming update, do NOT resurrect
    if (locDeletedAt && locDeletedAt > incTime) {
      continue;
    }
    // If remote itself deleted this log after incoming update, do NOT resurrect
    if (remDeletedAt && remDeletedAt > incTime) {
      continue;
    }

    if (!mergedLogs[dateKey]) {
      const incFsrs = Array.isArray(incLog?.fsrsLogs) ? incLog.fsrsLogs.filter(l => !isFsrsLogTombstoned(l, dateKey)) : [];
      const incSessions = Array.isArray(incLog?.sessions) ? incLog.sessions.filter(s => !isSessionTombstoned(s)) : [];
      mergedLogs[dateKey] = {
        ...incLog,
        fsrsLogs: incFsrs,
        sessions: incSessions
      };
    } else {
      const cur = mergedLogs[dateKey];
      const curTime = safeTimestamp(cur.updatedAt || cur.lastReviewDate || 0);

      // Merge FSRS logs by ID/hash with deduplication and tombstone pruning
      const existingFsrs = Array.isArray(cur.fsrsLogs) ? cur.fsrsLogs.filter(l => !isFsrsLogTombstoned(l, dateKey)) : [];
      const incomingFsrs = Array.isArray(incLog?.fsrsLogs) ? incLog.fsrsLogs.filter(l => !isFsrsLogTombstoned(l, dateKey)) : [];
      const fsrsMap = new Map();
      const getFsrsKey = (l) => l.id ? String(l.id).toLowerCase() :
        (l.cardId && l.timestamp ? `${l.cardId}_${l.rating || 'r'}_${l.timestamp}` :
          (l.topicName && (l.timestamp || l.dateStr) ? `${l.topicName}_${l.rating || 'r'}_${l.timestamp || l.dateStr}` :
            computeHash(canonicalStringify(l))));

      existingFsrs.forEach(l => {
        if (l && !isFsrsLogTombstoned(l, dateKey)) {
          fsrsMap.set(getFsrsKey(l), l);
        }
      });

      incomingFsrs.forEach(l => {
        if (l && !isFsrsLogTombstoned(l, dateKey)) {
          const k = getFsrsKey(l);
          if (!fsrsMap.has(k)) {
            fsrsMap.set(k, l);
          } else {
            const locL = fsrsMap.get(k);
            const locLTime = safeTimestamp(locL.timestamp || locL.updatedAt || 0);
            const remLTime = safeTimestamp(l.timestamp || l.updatedAt || 0);
            fsrsMap.set(k, remLTime >= locLTime ? l : locL);
          }
        }
      });

      const allFsrsLogs = Array.from(fsrsMap.values());

      // Merge individual study sessions with deduplication and tombstone pruning
      const existingSessions = Array.isArray(cur.sessions) ? cur.sessions : [];
      const incomingSessions = Array.isArray(incLog?.sessions) ? incLog.sessions : [];
      const sessionMap = new Map();
      const getSessionKey = (s) => s.id ? String(s.id).toLowerCase() : (s.subject && s.startedAt ? `${s.subject}_${s.startedAt}_${s.duration || 0}` : computeHash(canonicalStringify(s)));

      existingSessions.forEach(s => {
        if (s && !isSessionTombstoned(s)) {
          sessionMap.set(getSessionKey(s), s);
        }
      });

      incomingSessions.forEach(s => {
        if (s && !isSessionTombstoned(s)) {
          const k = getSessionKey(s);
          if (!sessionMap.has(k)) {
            sessionMap.set(k, s);
          } else {
            const locS = sessionMap.get(k);
            const locSTime = safeTimestamp(locS.updatedAt || locS.startedAt || locS.createdAt || 0);
            const remSTime = safeTimestamp(s.updatedAt || s.startedAt || s.createdAt || 0);
            sessionMap.set(k, remSTime >= locSTime ? s : locS);
          }
        }
      });

      const allSessions = Array.from(sessionMap.values()).filter(s => !isSessionTombstoned(s));

      const existingGts = Array.isArray(cur.gts) ? cur.gts : [];
      const incomingGts = Array.isArray(incLog?.gts) ? incLog.gts : [];

      const isGtTombstonedInGraves = (g) => {
        if (!g) return false;
        const gId = g.id ? String(g.id).toLowerCase() : '';
        const gName = (g.name || g.testName || '').trim().toLowerCase();
        const gDateName = `${dateKey.toLowerCase()}_${gName}`;
        const gModTime = safeTimestamp(g.updatedAt || g.createdAt || 0);

        if (gId && gtGravesMap.has(gId) && gtGravesMap.get(gId) >= gModTime) return true;
        if (gName && gtGravesMap.has(gName) && gtGravesMap.get(gName) >= gModTime) return true;
        if (gName && gtGravesMap.has(gDateName) && gtGravesMap.get(gDateName) >= gModTime) return true;
        return false;
      };

      const reconciledGts = [];
      const findMatchingGtIndex = (target) => {
        if (!target) return -1;
        const targetId = target.id ? String(target.id).toLowerCase() : '';
        const targetName = (target.name || target.testName || '').trim().toLowerCase();

        return reconciledGts.findIndex(item => {
          if (!item) return false;
          const itemId = item.id ? String(item.id).toLowerCase() : '';
          const itemName = (item.name || item.testName || '').trim().toLowerCase();

          // 1. Exact ID match (primary identifier)
          if (targetId && itemId && targetId === itemId) return true;

          // 2. Exact Name match (fallback for legacy records or un-identified entries)
          if (targetName && itemName && targetName === itemName) return true;

          return false;
        });
      };

      // 1. Seed with local GTs
      existingGts.forEach(g => {
        if (g) {
          if (isGtTombstonedInGraves(g)) {
            reconciledGts.push({ ...g, isDeleted: true, deletedAt: new Date(gtGravesMap.get(g.id) || Date.now()).toISOString() });
          } else {
            reconciledGts.push({ ...g });
          }
        }
      });

      // 2. Merge remote incoming GTs
      incomingGts.forEach(remGt => {
        if (!remGt) return;
        if (isGtTombstonedInGraves(remGt)) {
          return;
        }

        const matchIdx = findMatchingGtIndex(remGt);
        if (matchIdx === -1) {
          // No local match, append remote GT
          reconciledGts.push(remGt);
        } else {
          // Existing match found: resolve conflict with LWW
          const locGt = reconciledGts[matchIdx];
          const locIsDel = locGt.isDeleted || locGt.deletedAt;
          const remIsDel = remGt.isDeleted || remGt.deletedAt;

          const locGtTime = safeTimestamp(locGt.updatedAt || locGt.createdAt || curTime || 0);
          const remGtTime = safeTimestamp(remGt.updatedAt || remGt.createdAt || incTime || 0);

          if (remIsDel && !locIsDel) {
            if (remGtTime >= locGtTime) {
              reconciledGts[matchIdx] = { ...locGt, ...remGt, isDeleted: true };
            }
          } else if (locIsDel && !remIsDel) {
            if (remGtTime > locGtTime) {
              reconciledGts[matchIdx] = { ...locGt, ...remGt, isDeleted: false, deletedAt: undefined };
            }
          } else {
            // Both active or both deleted: LWW determines winner, preserving valid ID
            if (remGtTime >= locGtTime) {
              reconciledGts[matchIdx] = { ...locGt, ...remGt, id: remGt.id || locGt.id };
            } else {
              reconciledGts[matchIdx] = { ...remGt, ...locGt, id: locGt.id || remGt.id };
            }
          }
        }
      });

      // 3. Prune deleted GTs and tombstoned GTs
      const activeGts = reconciledGts.filter(g => g && !g.isDeleted && !g.deletedAt && !isGtTombstonedInGraves(g));

      // Determine winner and loser based on Last-Write-Wins (LWW)
      const isRemoteFresher = incTime > curTime;
      const winner = isRemoteFresher ? incLog : cur;
      const loser = isRemoteFresher ? cur : incLog;

      // Calculate aggregated daily totals non-destructively across both devices
      const sessionHours = allSessions.reduce((sum, s) => sum + (Number(s.duration || s.minutes || 0) / 60 || Number(s.hours || 0)), 0);
      const sessionQuestions = allSessions.reduce((sum, s) => sum + Number(s.questions || 0), 0);
      const sessionCards = allSessions.reduce((sum, s) => sum + Number(s.cards || 0), 0);
      const sessionPages = allSessions.reduce((sum, s) => sum + Number(s.pages || 0), 0);

      // Determine values strictly using LWW from winner
      const winnerHours = Number(winner.hours !== undefined && winner.hours !== null && winner.hours !== '' ? winner.hours : (winner.studyHours ?? 0));
      const winnerQs = Number(winner.questions !== undefined && winner.questions !== null && winner.questions !== '' ? winner.questions : (winner.totalQuestionsAttempted ?? 0));
      const winnerCards = Number(winner.cards !== undefined && winner.cards !== null && winner.cards !== '' ? winner.cards : (winner.totalCardsReviewed ?? 0));
      const winnerPages = Number(winner.pages !== undefined && winner.pages !== null && winner.pages !== '' ? winner.pages : 0);

      // If active sessions are present from either device, combine session metrics non-destructively.
      // If no sub-sessions are present (e.g. manual report entry), strictly use winner's values (LWW).
      const totalHours = allSessions.length > 0
        ? Number(Math.max(sessionHours, winnerHours).toFixed(3))
        : Number(winnerHours.toFixed(3));

      const totalQuestions = allSessions.length > 0
        ? Math.max(sessionQuestions, winnerQs)
        : winnerQs;

      const totalCards = Math.max(winnerCards, allFsrsLogs.length, sessionCards);
      const totalPages = allSessions.length > 0
        ? Math.max(sessionPages, winnerPages)
        : winnerPages;

      const latestUpdatedAt = winner.updatedAt || new Date(Math.max(curTime, incTime, Date.now())).toISOString();
      // FIX-12: Explicit spread order so winner's values cleanly overwrite loser's
      const baseLog = { ...loser, ...winner };

      mergedLogs[dateKey] = {
        ...baseLog,
        cards: totalCards,
        totalCardsReviewed: totalCards,
        questions: totalQuestions,
        totalQuestionsAttempted: totalQuestions,
        hours: totalHours,
        studyHours: totalHours,
        pages: totalPages,
        fsrsLogs: allFsrsLogs,
        sessions: allSessions,
        gts: activeGts,
        updatedAt: latestUpdatedAt
      };
    }
  }

  return mergedLogs;
}

/**
 * Merges study schedule objects across dates with task-level LWW conflict resolution and tombstone pruning.
 */
export function mergeStudyScheduleObjects(locSched = {}, remSched = {}, unifiedGraves = []) {
  const loc = (locSched && typeof locSched === 'object' && !Array.isArray(locSched)) ? locSched : {};
  const rem = (remSched && typeof remSched === 'object' && !Array.isArray(remSched)) ? remSched : {};
  const graves = Array.isArray(unifiedGraves) ? unifiedGraves : [];

  const deadTasksMap = new Map();
  const deadScheduleDatesMap = new Map();

  graves.forEach(g => {
    if (!g) return;
    const type = g.entityType || g.type;
    const delTime = safeTimestamp(g.deletedAt || g.timestamp || 0);
    if (type === 'schedule_task') {
      if (g.entityId) deadTasksMap.set(String(g.entityId).toLowerCase(), delTime);
      if (g.metadata?.taskId) deadTasksMap.set(String(g.metadata.taskId).toLowerCase(), delTime);
      if (g.metadata?.dateStr && g.metadata?.topic) {
        deadTasksMap.set(`${String(g.metadata.dateStr)}_${String(g.metadata.topic).toLowerCase()}`, delTime);
      }
    } else if (type === 'study_schedule' || type === 'schedule_date') {
      if (g.entityId) deadScheduleDatesMap.set(String(g.entityId), delTime);
      if (g.metadata?.dateStr) deadScheduleDatesMap.set(String(g.metadata.dateStr), delTime);
    }
  });

  const isTaskTombstoned = (t, dKey) => {
    if (!t || typeof t !== 'object') return true;
    const tTime = safeTimestamp(t.updatedAt || 0);
    if (t.id) {
      const delTime = deadTasksMap.get(String(t.id).toLowerCase());
      if (delTime && delTime >= tTime) return true;
    }
    if (t.topic) {
      const targetDate = t.date || dKey;
      if (targetDate) {
        const comboKey = `${String(targetDate)}_${String(t.topic).trim().toLowerCase()}`;
        const comboDelTime = deadTasksMap.get(comboKey);
        if (comboDelTime && comboDelTime >= tTime) return true;
      }
    }
    return false;
  };

  const isScheduleDateTombstoned = (dKey, dObj) => {
    const delTime = deadScheduleDatesMap.get(String(dKey));
    if (!delTime) return false;
    const dTime = safeTimestamp(dObj?.updatedAt || 0);
    return delTime >= dTime;
  };

  const allDates = new Set([...Object.keys(loc), ...Object.keys(rem)]);
  const merged = {};

  for (const dateStr of allDates) {
    const locDay = loc[dateStr];
    const remDay = rem[dateStr];

    // Check if entire date was tombstoned
    if (!locDay && remDay && isScheduleDateTombstoned(dateStr, remDay)) continue;
    if (locDay && !remDay && isScheduleDateTombstoned(dateStr, locDay)) continue;
    if (locDay && remDay && isScheduleDateTombstoned(dateStr, locDay) && isScheduleDateTombstoned(dateStr, remDay)) continue;

    // Date only in local
    if (locDay && !remDay) {
      const filteredTasks = (Array.isArray(locDay.tasks) ? locDay.tasks : []).filter(t => !isTaskTombstoned(t, dateStr));
      const hasContent = filteredTasks.length > 0 || (locDay.notes && locDay.notes.trim()) || locDay.examTitle;
      if (hasContent) {
        merged[dateStr] = {
          ...locDay,
          tasks: filteredTasks
        };
      }
      continue;
    }

    // Date only in remote
    if (!locDay && remDay) {
      const filteredTasks = (Array.isArray(remDay.tasks) ? remDay.tasks : []).filter(t => !isTaskTombstoned(t, dateStr));
      const hasContent = filteredTasks.length > 0 || (remDay.notes && remDay.notes.trim()) || remDay.examTitle;
      if (hasContent) {
        merged[dateStr] = {
          ...remDay,
          tasks: filteredTasks
        };
      }
      continue;
    }

    // Date in both local and remote: deep merge tasks & LWW day-level fields
    const locDayTime = safeTimestamp(locDay.updatedAt || 0);
    const remDayTime = safeTimestamp(remDay.updatedAt || 0);
    const baseDay = remDayTime > locDayTime ? remDay : locDay;

    const locTasks = (Array.isArray(locDay.tasks) ? locDay.tasks : []).filter(t => !isTaskTombstoned(t, dateStr));
    const remTasks = (Array.isArray(remDay.tasks) ? remDay.tasks : []).filter(t => !isTaskTombstoned(t, dateStr));

    const taskMap = new Map();
    const getTaskKey = (t) => t.id ? String(t.id).toLowerCase() : `${t.startTime || ''}_${t.endTime || ''}_${String(t.topic || '').trim().toLowerCase()}`;

    // Index local tasks
    locTasks.forEach(t => {
      taskMap.set(getTaskKey(t), t);
    });

    // Merge remote tasks with LWW
    remTasks.forEach(remT => {
      const k = getTaskKey(remT);
      const locT = taskMap.get(k);
      if (!locT) {
        taskMap.set(k, remT);
      } else {
        // Task exists in both local and remote: resolve LWW strictly on task updatedAt
        const locTaskTime = safeTimestamp(locT.updatedAt || 0);
        const remTaskTime = safeTimestamp(remT.updatedAt || 0);

        let winningTask = remTaskTime >= locTaskTime ? remT : locT;
        taskMap.set(k, {
          ...locT,
          ...remT,
          ...winningTask,
          updatedAt: new Date(Math.max(locTaskTime, remTaskTime, Date.now())).toISOString()
        });
      }
    });

    const finalTaskList = Array.from(taskMap.values());
    const hasContent = finalTaskList.length > 0 || (baseDay.notes && baseDay.notes.trim()) || baseDay.examTitle;

    if (hasContent) {
      merged[dateStr] = {
        ...locDay,
        ...remDay,
        ...baseDay,
        tasks: finalTaskList,
        updatedAt: new Date(Math.max(locDayTime, remDayTime, Date.now())).toISOString()
      };
    }
  }

  return merged;
}

/**
 * Merges schedule templates arrays by ID with LWW conflict resolution and tombstone pruning.
 */
export function mergeScheduleTemplatesArrays(locTemplates = [], remTemplates = [], unifiedGraves = []) {
  const locList = Array.isArray(locTemplates) ? locTemplates : [];
  const remList = Array.isArray(remTemplates) ? remTemplates : [];
  const graves = Array.isArray(unifiedGraves) ? unifiedGraves : [];

  const deadTemplatesMap = new Map();
  graves.forEach(g => {
    if (!g) return;
    const type = g.entityType || g.type;
    const delTime = safeTimestamp(g.deletedAt || g.timestamp || 0);
    if (type === 'schedule_template') {
      if (g.entityId) deadTemplatesMap.set(String(g.entityId).toLowerCase(), Math.max(delTime, deadTemplatesMap.get(String(g.entityId).toLowerCase()) || 0));
    }
  });

  const isTemplateTombstoned = (t) => {
    if (!t || !t.id) return false;
    const delTime = deadTemplatesMap.get(String(t.id).toLowerCase());
    const tTime = safeTimestamp(t.updatedAt || 0);
    return Boolean(delTime && delTime >= tTime);
  };

  const map = new Map();
  locList.filter(t => !isTemplateTombstoned(t)).forEach(t => {
    if (t && t.id) map.set(String(t.id), { ...t });
  });

  remList.filter(t => !isTemplateTombstoned(t)).forEach(remT => {
    if (!remT || !remT.id) return;
    const k = String(remT.id);
    const locT = map.get(k);
    if (!locT) {
      map.set(k, { ...remT });
    } else {
      const locTime = safeTimestamp(locT.updatedAt || 0);
      const remTime = safeTimestamp(remT.updatedAt || 0);
      const winningT = remTime >= locTime ? remT : locT;
      map.set(k, {
        ...locT,
        ...remT,
        ...winningT,
        updatedAt: new Date(Math.max(locTime, remTime, Date.now())).toISOString()
      });
    }
  });

  return Array.from(map.values());
}

/**
 * Normalizes CAMP daily log sessions into { preLunch: [], midDay: [], postDinner: [] }
 */
export function normalizeCampSessions(data) {
  const cats = ['preLunch', 'midDay', 'postDinner'];
  const norm = {};
  cats.forEach(c => {
    if (!data || !data[c]) {
      norm[c] = [];
    } else if (Array.isArray(data[c])) {
      norm[c] = data[c];
    } else {
      const old = data[c];
      const oldHrs = parseFloat(old.hours) || 0;
      if (oldHrs > 0) {
        norm[c] = [{
          id: 'migrated_1',
          hours: oldHrs.toString(),
          concentration: Number(old.concentration) || 7,
          type: 'notes',
          isManual: false
        }];
      } else {
        norm[c] = [];
      }
    }
  });
  return norm;
}

/**
 * Merges CAMP Daily Logs (STORES.CAMP_DAILY_LOGS / campDailyLogs array) with session-level LWW,
 * tombstone pruning, and bidirectional conflict resolution.
 */
export function mergeCampDailyLogs(locLogs = [], remLogs = [], unifiedGraves = []) {
  const deadSessionsMap = new Map();
  (unifiedGraves || []).forEach(g => {
    if (g && (g.entityType === 'camp_session' || g.type === 'camp_session')) {
      const delTime = safeTimestamp(g.deletedAt || g.timestamp || 0);
      if (g.entityId) deadSessionsMap.set(String(g.entityId).toLowerCase(), Math.max(delTime, deadSessionsMap.get(String(g.entityId).toLowerCase()) || 0));
    }
  });

  const isSessionTombstoned = (s) => {
    if (!s) return false;
    const k = String(s.id || '').toLowerCase();
    if (!k) return false;
    const delTime = deadSessionsMap.get(k);
    const sTime = safeTimestamp(s.updatedAt || 0);
    return Boolean(delTime && delTime >= sTime);
  };

  const locArray = Array.isArray(locLogs) ? locLogs : Object.values(locLogs || {});
  const remArray = Array.isArray(remLogs) ? remLogs : Object.values(remLogs || {});

  const dailyMap = new Map();
  locArray.forEach(l => { if (l && l.dateStr) dailyMap.set(l.dateStr, l); });

  remArray.forEach(remLog => {
    if (!remLog || !remLog.dateStr) return;
    const locLog = dailyMap.get(remLog.dateStr);
    if (!locLog) {
      const normRem = normalizeCampSessions(remLog.sessions);
      const filteredNorm = {};
      Object.keys(normRem).forEach(cat => {
        filteredNorm[cat] = normRem[cat].filter(s => !isSessionTombstoned(s));
      });
      dailyMap.set(remLog.dateStr, { ...remLog, sessions: filteredNorm });
    } else {
      const locTime = safeTimestamp(locLog.updatedAt || 0);
      const remTime = safeTimestamp(remLog.updatedAt || 0);
      const winningLog = remTime >= locTime ? remLog : locLog;

      const locSessions = normalizeCampSessions(locLog.sessions);
      const remSessions = normalizeCampSessions(remLog.sessions);
      const mergedSessions = {};

      const cats = ['preLunch', 'midDay', 'postDinner'];
      cats.forEach(cat => {
        const catMap = new Map();
        const getSessKey = (s) => s.id ? String(s.id).toLowerCase() : `${s.type || 'notes'}_${s.hours || ''}_${s.concentration || ''}`;

        (locSessions[cat] || []).filter(s => !isSessionTombstoned(s)).forEach(s => {
          catMap.set(getSessKey(s), s);
        });

        (remSessions[cat] || []).filter(s => !isSessionTombstoned(s)).forEach(remS => {
          const k = getSessKey(remS);
          const locS = catMap.get(k);
          if (!locS) {
            catMap.set(k, remS);
          } else {
            const locSTime = safeTimestamp(locS.updatedAt || locTime);
            const remSTime = safeTimestamp(remS.updatedAt || remTime);
            const winningS = remSTime >= locSTime ? remS : locS;
            catMap.set(k, {
              ...locS,
              ...remS,
              ...winningS,
              updatedAt: new Date(Math.max(locSTime, remSTime, Date.now())).toISOString()
            });
          }
        });

        mergedSessions[cat] = Array.from(catMap.values());
      });

      dailyMap.set(remLog.dateStr, {
        ...locLog,
        ...remLog,
        ...winningLog,
        sessions: mergedSessions,
        bedToBook: winningLog.bedToBook || locLog.bedToBook || remLog.bedToBook,
        updatedAt: new Date(Math.max(locTime, remTime, Date.now())).toISOString()
      });
    }
  });

  return Array.from(dailyMap.values());
}

/**
 * Merges CAMP Data stores (STORES.CAMP_DATA / campData array: history, timer_history, student_info)
 */
export function mergeCampData(locData = [], remData = [], unifiedGraves = []) {
  const deadHistoryMap = new Map();
  (unifiedGraves || []).forEach(g => {
    if (g && (g.entityType === 'camp_history_entry' || g.type === 'camp_history_entry')) {
      const delTime = safeTimestamp(g.deletedAt || g.timestamp || 0);
      if (g.entityId) deadHistoryMap.set(String(g.entityId).toLowerCase(), Math.max(delTime, deadHistoryMap.get(String(g.entityId).toLowerCase()) || 0));
    }
  });

  const isHistoryTombstoned = (h) => {
    if (!h) return false;
    const k = String(h.fullDate || h.date || h.timestamp || '').toLowerCase();
    if (!k) return false;
    const delTime = deadHistoryMap.get(k);
    const hTime = safeTimestamp(h.updatedAt || 0);
    return Boolean(delTime && delTime >= hTime);
  };

  const datMap = new Map();
  (locData || []).forEach(d => { if (d && d.key) datMap.set(d.key, d); });

  (remData || []).forEach(remD => {
    if (!remD || !remD.key) return;
    const locD = datMap.get(remD.key);
    if (!locD) {
      if (remD.key === 'history') {
        const remHist = (Array.isArray(remD.data) ? remD.data : []).filter(h => !isHistoryTombstoned(h));
        datMap.set('history', { ...remD, data: remHist });
      } else {
        datMap.set(remD.key, remD);
      }
    } else {
      const locTime = safeTimestamp(locD.updatedAt || 0);
      const remTime = safeTimestamp(remD.updatedAt || 0);

      if (remD.key === 'history') {
        const locHist = (Array.isArray(locD.data) ? locD.data : []).filter(h => !isHistoryTombstoned(h));
        const remHist = (Array.isArray(remD.data) ? remD.data : []).filter(h => !isHistoryTombstoned(h));
        const histMap = new Map();
        const getHistKey = (h) => h.fullDate || h.date || String(h.timestamp);

        locHist.forEach(h => { if (h) histMap.set(getHistKey(h), h); });
        remHist.forEach(h => {
          if (!h) return;
          const k = getHistKey(h);
          const exist = histMap.get(k);
          if (!exist) {
            histMap.set(k, h);
          } else {
            // Compare item-level updatedAt timestamps; if remote is strictly newer, remote wins, otherwise local is preserved
            const existTime = safeTimestamp(exist.updatedAt || locTime);
            const incomingTime = safeTimestamp(h.updatedAt || remTime);
            const winningItem = incomingTime > existTime ? h : exist;
            histMap.set(k, {
              ...exist,
              ...h,
              ...winningItem,
              score: winningItem.score !== undefined ? winningItem.score : (exist.score !== undefined ? exist.score : h.score),
              updatedAt: new Date(Math.max(existTime, incomingTime, Date.now())).toISOString()
            });
          }
        });

        const mergedHistoryList = Array.from(histMap.values()).sort((a, b) => {
          const timeA = a.timestamp || (a.fullDate ? new Date(a.fullDate).getTime() : 0);
          const timeB = b.timestamp || (b.fullDate ? new Date(b.fullDate).getTime() : 0);
          if (timeA && timeB) return timeA - timeB;
          if (a.fullDate && b.fullDate) return a.fullDate.localeCompare(b.fullDate);
          return 0;
        });

        datMap.set('history', {
          key: 'history',
          data: mergedHistoryList,
          updatedAt: new Date(Math.max(locTime, remTime, Date.now())).toISOString()
        });
      } else if (remD.key === 'timer_history') {
        const locTH = Array.isArray(locD.data) ? locD.data : [];
        const remTH = Array.isArray(remD.data) ? remD.data : [];
        const thMap = new Map();
        const getThKey = (t) => t.id || `${t.date}_${t.period}_${t.hours}_${t.type || 'notes'}_${t.concentration || 7}`;

        locTH.forEach(t => { if (t) thMap.set(getThKey(t), t); });
        remTH.forEach(t => {
          if (!t) return;
          const k = getThKey(t);
          const exist = thMap.get(k);
          if (!exist) {
            thMap.set(k, t);
          } else {
            const locSTime = safeTimestamp(exist.updatedAt || locTime);
            const remSTime = safeTimestamp(t.updatedAt || remTime);
            const winningT = remSTime > locSTime ? t : exist;
            thMap.set(k, {
              ...exist,
              ...t,
              ...winningT,
              updatedAt: new Date(Math.max(locSTime, remSTime, Date.now())).toISOString()
            });
          }
        });

        datMap.set('timer_history', {
          key: 'timer_history',
          data: Array.from(thMap.values()),
          updatedAt: new Date(Math.max(locTime, remTime, Date.now())).toISOString()
        });
      } else if (remD.key === 'student_info') {
        const winningData = remTime >= locTime ? remD.data : locD.data;
        datMap.set('student_info', {
          key: 'student_info',
          data: { ...(locD.data || {}), ...(remD.data || {}), ...(winningData || {}) },
          updatedAt: new Date(Math.max(locTime, remTime, Date.now())).toISOString()
        });
      } else {
        const winningObj = remTime >= locTime ? remD : locD;
        datMap.set(remD.key, {
          ...locD,
          ...remD,
          ...winningObj,
          updatedAt: new Date(Math.max(locTime, remTime, Date.now())).toISOString()
        });
      }
    }
  });

  return Array.from(datMap.values());
}

/**
 * Merges CAMP Tracker tasks (STORES.CAMP_TRACKER / campTracker array) with tombstone pruning.
 */
export function mergeCampTrackers(locTracker = [], remTracker = [], trashCamp = [], unifiedGraves = []) {
  const deadCampMap = new Map();
  (trashCamp || []).forEach(tc => {
    if (tc && tc.id) deadCampMap.set(String(tc.id).toLowerCase(), safeTimestamp(tc.deletedAt));
  });
  (unifiedGraves || []).forEach(g => {
    if (g && (g.entityType === 'camp_task' || g.type === 'camp_task')) {
      const delTime = safeTimestamp(g.deletedAt || g.timestamp || 0);
      if (g.entityId) deadCampMap.set(String(g.entityId).toLowerCase(), Math.max(delTime, deadCampMap.get(String(g.entityId).toLowerCase()) || 0));
    }
  });

  const isCampTombstoned = (t) => {
    if (!t || !t.id) return false;
    const k = String(t.id).toLowerCase();
    const delTime = deadCampMap.get(k);
    const tTime = safeTimestamp(t.updatedAt || t.createdAt || 0);
    return Boolean(delTime && delTime >= tTime);
  };

  const trkMap = new Map();
  (locTracker || []).filter(t => !isCampTombstoned(t)).forEach(t => {
    if (t && t.id) trkMap.set(String(t.id).toLowerCase(), t);
  });

  (remTracker || []).filter(t => !isCampTombstoned(t)).forEach(remT => {
    if (!remT || !remT.id) return;
    const k = String(remT.id).toLowerCase();
    const locT = trkMap.get(k);
    if (!locT) {
      trkMap.set(k, remT);
    } else {
      const locTime = safeTimestamp(locT.updatedAt || locT.createdAt || 0);
      const remTime = safeTimestamp(remT.updatedAt || remT.createdAt || 0);
      const winningT = remTime >= locTime ? remT : locT;
      trkMap.set(k, {
        ...locT,
        ...remT,
        ...winningT,
        updatedAt: new Date(Math.max(locTime, remTime, Date.now())).toISOString()
      });
    }
  });

  return Array.from(trkMap.values());
}

/**
 * Merges local bundles with downloaded remote bundles completely in-memory,
 * producing a new staged bundle set and manifest without mutating IndexedDB.
 */
export function mergeBundlesInMemory(localData = {}, downloadedBundles = {}) {
  const localBundles = localData.bundles || localData || {};
  const merged = { ...localBundles };

  // Aggregate all unified graves from local and remote bundles
  const rawGraves = [
    ...(downloadedBundles['pages_bundle.json']?.unifiedGraves || []),
    ...(downloadedBundles['curriculum_topics.json']?.unifiedGraves || []),
    ...(downloadedBundles['study_logs.json']?.unifiedGraves || []),
    ...(localBundles['pages_bundle.json']?.unifiedGraves || []),
    ...(localBundles['curriculum_topics.json']?.unifiedGraves || []),
    ...(localBundles['study_logs.json']?.unifiedGraves || [])
  ];
  const gravesAggregateMap = new Map();
  rawGraves.forEach(g => {
    if (g && g.entityType && g.entityId) {
      const k = `${g.entityType}::${g.entityId}`;
      const exist = gravesAggregateMap.get(k);
      if (!exist || safeTimestamp(g.deletedAt) > safeTimestamp(exist.deletedAt)) {
        gravesAggregateMap.set(k, g);
      }
    }
  });
  const canonicalUnifiedGraves = Array.from(gravesAggregateMap.values());

  // 1. Cards Bundle (Timestamp-aware, Tie-breaking & Tombstone Pruning with Unified Graves)
  if (downloadedBundles['cards_bundle.json']) {
    const locCardsB = localBundles['cards_bundle.json'] || {};
    const remCardsB = downloadedBundles['cards_bundle.json'] || {};
    const locCards = deserializeBinaryValues(locCardsB.flashcards || []);
    const locTrash = deserializeBinaryValues(locCardsB.trashCards || []);
    const remCards = deserializeBinaryValues(remCardsB.flashcards || []);
    const remTrash = deserializeBinaryValues(remCardsB.trashCards || []);

    const locTrashMap = new Map(locTrash.map(c => [c.id, safeTimestamp(c.deletedAt)]));
    const remTrashMap = new Map(remTrash.map(c => [c.id, safeTimestamp(c.deletedAt)]));
    const cardGraveMap = new Map();
    canonicalUnifiedGraves.forEach(g => {
      if (g && (g.entityType === 'card' || g.type === 'card') && g.entityId) {
        cardGraveMap.set(String(g.entityId), Math.max(safeTimestamp(g.deletedAt), cardGraveMap.get(String(g.entityId)) || 0));
      }
    });

    const cardMap = new Map(locCards.map(c => [c.id, c]));

    remCards.forEach(inc => {
      if (inc && inc.id) {
        const localDeletedAt = locTrashMap.get(inc.id);
        const graveDeletedAt = cardGraveMap.get(String(inc.id));
        const maxDeletedAt = Math.max(localDeletedAt || 0, graveDeletedAt || 0);
        const incTime = safeTimestamp(inc.updatedAt || inc.lastReviewDate || inc.createdAt);
        if (maxDeletedAt && maxDeletedAt > incTime) {
          return;
        }

        const localCard = cardMap.get(inc.id);
        if (!localCard) {
          cardMap.set(inc.id, inc);
        } else {
          const localModTime = safeTimestamp(localCard.updatedAt || localCard.createdAt);
          const incModTime = safeTimestamp(inc.updatedAt || inc.createdAt);
          const latestContent = incModTime > localModTime ? inc : localCard;

          const localRevTime = safeTimestamp(localCard.lastReviewDate || 0);
          const incRevTime = safeTimestamp(inc.lastReviewDate || 0);

          let latestRev = localCard;
          if (incModTime > localModTime) {
            latestRev = inc;
          } else if (localModTime > incModTime) {
            latestRev = localCard;
          } else if (incRevTime > localRevTime) {
            latestRev = inc;
          } else {
            latestRev = localCard;
          }

          const mergedCard = {
            ...localCard,
            ...inc,
            ...latestContent,
            front: latestContent.front,
            back: latestContent.back,
            note: latestContent.note,
            notes: latestContent.notes,
            hint: latestContent.hint,
            tags: Array.isArray(latestContent.tags) ? latestContent.tags : (localCard.tags || []),
            rects: latestContent.rects || latestContent.occlusions || localCard.rects || inc.rects || [],
            due: latestRev.due,
            stability: latestRev.stability,
            difficulty: latestRev.difficulty,
            elapsed_days: latestRev.elapsed_days,
            scheduled_days: latestRev.scheduled_days,
            reps: latestRev.reps !== undefined ? latestRev.reps : (incModTime > localModTime ? (inc.reps || 0) : (localCard.reps || 0)),
            lapses: latestRev.lapses !== undefined ? latestRev.lapses : (incModTime > localModTime ? (inc.lapses || 0) : (localCard.lapses || 0)),
            state: latestRev.state,
            lastReviewDate: latestRev.lastReviewDate,
            lastRating: latestRev.lastRating,
            retrievability: latestRev.retrievability,
            history: latestRev.history || (incModTime > localModTime ? (inc.history || localCard.history || []) : (localCard.history || inc.history || [])),
            updatedAt: new Date(Math.max(localModTime, incModTime, safeTimestamp(latestRev.updatedAt || 0))).toISOString()
          };

          cardMap.set(inc.id, mergedCard);
        }
      }
    });

    for (const [id, card] of cardMap.entries()) {
      const remoteDeletedAt = remTrashMap.get(id);
      const graveDeletedAt = cardGraveMap.get(String(id));
      const maxDeletedAt = Math.max(remoteDeletedAt || 0, graveDeletedAt || 0);
      if (maxDeletedAt) {
        const localCardTime = safeTimestamp(card.updatedAt || card.lastReviewDate || card.createdAt);
        if (maxDeletedAt > localCardTime) {
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

    // Also populate mergedTrashMap from unified graves for cards
    cardGraveMap.forEach((delTime, cId) => {
      if (!mergedTrashMap.has(cId)) {
        mergedTrashMap.set(cId, { id: cId, deletedAt: new Date(delTime).toISOString() });
      }
    });

    merged['cards_bundle.json'] = {
      flashcards: serializeBinaryValues(Array.from(cardMap.values())),
      trashCards: serializeBinaryValues(Array.from(mergedTrashMap.values()))
    };
  }

  // 2. Curriculum Topics (Non-destructive Topic & PYT Merging with Global Graves)
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
    const pytGraveMap = new Map();
    canonicalUnifiedGraves.forEach(g => {
      if (!g) return;
      const type = g.entityType || g.type;
      if (type === 'pyt_topic') {
        const delTime = safeTimestamp(g.deletedAt || g.timestamp || 0);
        if (g.entityId) pytGraveMap.set(String(g.entityId).toLowerCase(), Math.max(delTime, pytGraveMap.get(String(g.entityId).toLowerCase()) || 0));
        if (g.metadata?.subject) pytGraveMap.set(String(g.metadata.subject).toLowerCase(), Math.max(delTime, pytGraveMap.get(String(g.metadata.subject).toLowerCase()) || 0));
      }
    });

    const pytProgGraveMap = new Map();
    canonicalUnifiedGraves.forEach(g => {
      if (!g) return;
      const type = g.entityType || g.type;
      if (type === 'pyt_progress') {
        const delTime = safeTimestamp(g.deletedAt || g.timestamp || 0);
        if (g.entityId) pytProgGraveMap.set(String(g.entityId).toLowerCase(), Math.max(delTime, pytProgGraveMap.get(String(g.entityId).toLowerCase()) || 0));
        if (g.metadata?.subject) pytProgGraveMap.set(String(g.metadata.subject).toLowerCase(), Math.max(delTime, pytProgGraveMap.get(String(g.metadata.subject).toLowerCase()) || 0));
      }
    });

    const trackerGraveMap = new Map();
    canonicalUnifiedGraves.forEach(g => {
      if (!g) return;
      const type = g.entityType || g.type;
      if (type === 'tracker_topic') {
        const delTime = safeTimestamp(g.deletedAt || g.timestamp || 0);
        if (g.entityId) trackerGraveMap.set(String(g.entityId).toLowerCase(), Math.max(delTime, trackerGraveMap.get(String(g.entityId).toLowerCase()) || 0));
        if (g.parentId && g.metadata?.topicName) trackerGraveMap.set(`${String(g.parentId).toLowerCase()}_${String(g.metadata.topicName).toLowerCase()}`, Math.max(delTime, trackerGraveMap.get(`${String(g.parentId).toLowerCase()}_${String(g.metadata.topicName).toLowerCase()}`) || 0));
      }
    });

    const pytMap = new Map();
    locPyt.forEach(doc => {
      if (!doc) return;
      const docId = String(doc.id || doc.subject || '').trim().toLowerCase();
      if (!docId) return;
      const graveTime = pytGraveMap.get(docId) || pytGraveMap.get(String(doc.subject || '').toLowerCase()) || pytProgGraveMap.get(docId) || pytProgGraveMap.get(String(doc.subject || '').toLowerCase());
      if (graveTime) {
        const docTime = safeTimestamp(doc.updatedAt || doc.createdAt || 0);
        if (graveTime > docTime) return;
      }
      pytMap.set(docId, doc);
    });

    remPyt.forEach(incDoc => {
      if (!incDoc) return;
      const docId = String(incDoc.id || incDoc.subject || '').trim().toLowerCase();
      if (!docId) return;
      const graveTime = pytGraveMap.get(docId) || pytGraveMap.get(String(incDoc.subject || '').toLowerCase()) || pytProgGraveMap.get(docId) || pytProgGraveMap.get(String(incDoc.subject || '').toLowerCase());
      const incTime = safeTimestamp(incDoc.updatedAt || incDoc.createdAt || 0);
      if (graveTime && graveTime > incTime) return;

      const locDoc = pytMap.get(docId);
      if (!locDoc) {
        pytMap.set(docId, incDoc);
      } else {
        const locTime = safeTimestamp(locDoc.updatedAt || locDoc.createdAt || 0);
        pytMap.set(docId, incTime >= locTime ? { ...locDoc, ...incDoc } : { ...incDoc, ...locDoc });
      }
    });

    const mergedSubjectTracker = mergeSubjectTrackerArrays(
      locCur.subjectTracker || [],
      remCur.subjectTracker || [],
      locTrashTopics,
      remTrashTopics,
      canonicalUnifiedGraves
    );

    const mergedPytUserProgress = mergePytUserProgress(
      locCur.pytUserProgress || [],
      remCur.pytUserProgress || [],
      canonicalUnifiedGraves
    );

    const mergedTextbooks = mergeTextbooksMetadata(
      locCur.textbooksMetadata || [],
      remCur.textbooksMetadata || []
    );

    merged['curriculum_topics.json'] = {
      topics: serializeBinaryValues(Array.from(topicMap.values())),
      trashTopics: serializeBinaryValues(Array.from(mergedTrashTopics.values())),
      pytData: serializeBinaryValues(Array.from(pytMap.values())),
      subjectTracker: mergedSubjectTracker,
      pytUserProgress: mergedPytUserProgress,
      textbooksMetadata: mergedTextbooks,
      unifiedGraves: canonicalUnifiedGraves
    };
  }

  // 3. Study Logs (Daily Sessions, GTs, FSRS Reviews & Tombstone Pruning)
  if (downloadedBundles['study_logs.json']) {
    const locLogsB = localBundles['study_logs.json'] || {};
    const remLogsB = downloadedBundles['study_logs.json'] || {};
    const locLogs = locLogsB.studyLogs || {};
    const locTrash = locLogsB.trashStudyLogs || [];
    const remLogs = remLogsB.studyLogs || {};
    const remTrash = remLogsB.trashStudyLogs || [];

    const mergedStudyLogs = mergeStudyLogsObjects(locLogs, remLogs, locTrash, remTrash, canonicalUnifiedGraves);

    const mergedTrashLogsMap = new Map(locTrash.map(t => [t.id, t]));
    remTrash.forEach(t => {
      if (t && t.id) {
        const exist = mergedTrashLogsMap.get(t.id);
        if (!exist || safeTimestamp(t.deletedAt) > safeTimestamp(exist.deletedAt)) {
          mergedTrashLogsMap.set(t.id, t);
        }
      }
    });

    const mergedSchedule = mergeStudyScheduleObjects(locLogsB.studySchedule || {}, remLogsB.studySchedule || {}, canonicalUnifiedGraves);
    const mergedTemplates = mergeScheduleTemplatesArrays(locLogsB.scheduleTemplates || [], remLogsB.scheduleTemplates || [], canonicalUnifiedGraves);
    const mergedCampDaily = mergeCampDailyLogs(locLogsB.campDailyLogs || [], remLogsB.campDailyLogs || [], canonicalUnifiedGraves);
    const mergedTimerState = { ...(remLogsB.timerState || {}), ...(locLogsB.timerState || {}) };

    // Merge activeNewTopicsRecords (all records starting with active_new_topics_)
    const activeNewRecordsMap = new Map();
    (locLogsB.activeNewTopicsRecords || []).forEach(r => { if (r && r.key) activeNewRecordsMap.set(r.key, r); });
    (remLogsB.activeNewTopicsRecords || []).forEach(remR => {
      if (!remR || !remR.key) return;
      const locR = activeNewRecordsMap.get(remR.key);
      if (!locR) {
        activeNewRecordsMap.set(remR.key, remR);
      } else {
        const locTime = safeTimestamp(locR.updatedAt);
        const remTime = safeTimestamp(remR.updatedAt);
        activeNewRecordsMap.set(remR.key, remTime >= locTime ? remR : locR);
      }
    });

    const mergedActiveNewToday = Array.from(new Set([
      ...(Array.isArray(locLogsB.activeNewTopicsToday) ? locLogsB.activeNewTopicsToday : []),
      ...(Array.isArray(remLogsB.activeNewTopicsToday) ? remLogsB.activeNewTopicsToday : [])
    ]));

    merged['study_logs.json'] = {
      studyLogs: mergedStudyLogs,
      trashStudyLogs: Array.from(mergedTrashLogsMap.values()),
      studySchedule: mergedSchedule,
      scheduleTemplates: mergedTemplates,
      campDailyLogs: mergedCampDaily,
      timerState: mergedTimerState,
      activeNewTopicsToday: mergedActiveNewToday,
      activeNewTopicsRecords: Array.from(activeNewRecordsMap.values()),
      unifiedGraves: canonicalUnifiedGraves
    };
  }

  // 4. FSRS Config & Settings (Deep Non-Destructive Merge Across All 7 Categories & Settings)
  if (downloadedBundles['fsrs_config.json']) {
    const locFsrs = localBundles['fsrs_config.json'] || {};
    const remFsrs = downloadedBundles['fsrs_config.json'] || {};

    const promptMap = new Map();
    (locFsrs.customPrompts || []).forEach(p => { if (p && p.id) promptMap.set(p.id, p); });
    (remFsrs.customPrompts || []).forEach(p => {
      if (p && p.id) {
        const locP = promptMap.get(p.id);
        if (!locP) {
          promptMap.set(p.id, p);
        } else {
          const locTime = safeTimestamp(locP.updatedAt || locP.createdAt);
          const remTime = safeTimestamp(p.updatedAt || p.createdAt);
          promptMap.set(p.id, remTime >= locTime ? p : locP);
        }
      }
    });

    // Prune deleted prompts
    for (const [id, p] of promptMap.entries()) {
      if (p.isDeleted || p.deletedAt) {
        promptMap.delete(id);
      }
    }

    // FIX-10: Clean, scrubbed localStorage merge with FSRS timestamp awareness
    const locFsrsTime = safeTimestamp(locFsrs.fsrsConfig?.updatedAt || locFsrs.fsrsConfig?.lastModified);
    const remFsrsTime = safeTimestamp(remFsrs.fsrsConfig?.updatedAt || remFsrs.fsrsConfig?.lastModified);
    const localSettingsAreFresher = locFsrsTime >= remFsrsTime;

    const mergedLs = {};
    const allLsKeys = new Set([
      ...Object.keys(remFsrs.localStorageSnapshot || {}),
      ...Object.keys(locFsrs.localStorageSnapshot || {})
    ]);
    Array.from(allLsKeys).sort().forEach(k => {
      if (isCleanLsKey(k)) {
        const locVal = locFsrs.localStorageSnapshot?.[k];
        const remVal = remFsrs.localStorageSnapshot?.[k];
        let v;
        if (locVal !== undefined && locVal !== null && locVal !== '' &&
            remVal !== undefined && remVal !== null && remVal !== '') {
          v = localSettingsAreFresher ? locVal : remVal;
        } else {
          v = (locVal !== undefined && locVal !== null && locVal !== '') ? locVal : remVal;
        }
        if (v !== undefined && v !== null && v !== '') {
          mergedLs[k] = v;
        }
      }
    });

    const mergedFsrsConfig = mergeFsrsConfigs(locFsrs.fsrsConfig, remFsrs.fsrsConfig);
    const mergedSettings = mergeSettingsArrays(locFsrs.settings, remFsrs.settings);
    const mergedTopicHints = mergeTopicHintsArrays(locFsrs.topicHints, remFsrs.topicHints);
    const mergedHintQuota = mergeHintQuotaArrays(locFsrs.hintQuota, remFsrs.hintQuota);
    const mergedUserProfile = { ...(remFsrs.localUserProfile || {}), ...(locFsrs.localUserProfile || {}) };
    if (mergedUserProfile) delete mergedUserProfile.deviceId;
    const mergedAiRecs = locFsrs.aiRecommendations || remFsrs.aiRecommendations || null;

    merged['fsrs_config.json'] = {
      fsrsConfig: mergedFsrsConfig,
      settings: mergedSettings,
      topicHints: mergedTopicHints,
      hintQuota: mergedHintQuota,
      customPrompts: Array.from(promptMap.values()).sort((a, b) => (a.id || '').localeCompare(b.id || '')),
      localUserProfile: mergedUserProfile,
      aiRecommendations: mergedAiRecs,
      localStorageSnapshot: mergedLs
    };
  }

  // 5. CAMP Tracker
  if (downloadedBundles['camp_tracker.json']) {
    const locCamp = localBundles['camp_tracker.json'] || {};
    const remCamp = downloadedBundles['camp_tracker.json'] || {};
    const locTrashCamp = Array.isArray(locCamp.trashCamp) ? locCamp.trashCamp : [];
    const remTrashCamp = Array.isArray(remCamp.trashCamp) ? remCamp.trashCamp : [];
    const trashCampMap = new Map(locTrashCamp.map(t => [t.id, t]));
    remTrashCamp.forEach(t => {
      if (t && t.id) {
        const exist = trashCampMap.get(t.id);
        if (!exist || safeTimestamp(t.deletedAt) > safeTimestamp(exist.deletedAt)) {
          trashCampMap.set(t.id, t);
        }
      }
    });
    const mergedTrashCamp = Array.from(trashCampMap.values());

    const mergedCampTracker = mergeCampTrackers(locCamp.campTracker, remCamp.campTracker, mergedTrashCamp, canonicalUnifiedGraves);
    const mergedCampData = mergeCampData(locCamp.campData, remCamp.campData, canonicalUnifiedGraves);

    merged['camp_tracker.json'] = {
      campTracker: mergedCampTracker,
      campData: mergedCampData,
      trashCamp: mergedTrashCamp
    };
  }

  // 6. Pages & Occlusions (Timestamp-aware & Unified Graves Pruning)
  if (downloadedBundles['pages_bundle.json']) {
    const locPagesB = localBundles['pages_bundle.json'] || {};
    const remPagesB = downloadedBundles['pages_bundle.json'] || {};
    const locPages = deserializeBinaryValues(locPagesB.pages || []);
    const locTrash = deserializeBinaryValues(locPagesB.trashPages || []);
    const remPages = deserializeBinaryValues(remPagesB.pages || []);
    const remTrash = deserializeBinaryValues(remPagesB.trashPages || []);

    const locTrashMap = new Map(locTrash.map(p => [p.id, safeTimestamp(p.deletedAt)]));
    const remTrashMap = new Map(remTrash.map(p => [p.id, safeTimestamp(p.deletedAt)]));
    const pageGraveMap = new Map();
    canonicalUnifiedGraves.forEach(g => {
      if (g && (g.entityType === 'page' || g.type === 'page') && g.entityId) {
        pageGraveMap.set(String(g.entityId), Math.max(safeTimestamp(g.deletedAt), pageGraveMap.get(String(g.entityId)) || 0));
      }
    });

    const pageMap = new Map(locPages.map(p => [p.id, p]));

    remPages.forEach(p => {
      if (p && p.id) {
        const localDeletedAt = locTrashMap.get(p.id);
        const graveDeletedAt = pageGraveMap.get(String(p.id));
        const maxDeletedAt = Math.max(localDeletedAt || 0, graveDeletedAt || 0);
        const incTime = safeTimestamp(p.updatedAt || p.createdAt);
        if (maxDeletedAt && maxDeletedAt > incTime) return;

        const locP = pageMap.get(p.id);
        if (!locP) {
          pageMap.set(p.id, p);
        } else {
          const locTime = safeTimestamp(locP.updatedAt || locP.createdAt);
          const winner = incTime >= locTime ? p : locP;
          const loser = incTime >= locTime ? locP : p;
          // FIX-09: Always preserve binary image data and media flags from whichever side has media
          pageMap.set(p.id, {
            ...loser,
            ...winner,
            data: winner.data || loser.data,
            imageUrl: winner.imageUrl || loser.imageUrl,
            originalImage: winner.originalImage || loser.originalImage,
            base64: winner.base64 || loser.base64,
            hasMedia: winner.hasMedia || loser.hasMedia || false
          });
        }
      }
    });

    for (const [id, page] of pageMap.entries()) {
      const remoteDeletedAt = remTrashMap.get(id);
      const graveDeletedAt = pageGraveMap.get(String(id));
      const maxDeletedAt = Math.max(remoteDeletedAt || 0, graveDeletedAt || 0);
      if (maxDeletedAt) {
        const localPageTime = safeTimestamp(page.updatedAt || page.createdAt);
        if (maxDeletedAt > localPageTime) {
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

    // Also populate mergedTrashMap from unified graves for pages
    pageGraveMap.forEach((delTime, pId) => {
      if (!mergedTrashMap.has(pId)) {
        mergedTrashMap.set(pId, { id: pId, deletedAt: new Date(delTime).toISOString() });
      }
    });

    // Merge unified graves (take latest deletedAt per entityType::entityId)
    const locGraves = Array.isArray(locPagesB.unifiedGraves) ? locPagesB.unifiedGraves : [];
    const remGraves = Array.isArray(remPagesB.unifiedGraves) ? remPagesB.unifiedGraves : [];
    const gravesMap = new Map(locGraves.map(g => [`${g.entityType}::${g.entityId}`, g]));
    remGraves.forEach(g => {
      if (g && g.entityType && g.entityId) {
        const k = `${g.entityType}::${g.entityId}`;
        const exist = gravesMap.get(k);
        if (!exist || safeTimestamp(g.deletedAt) > safeTimestamp(exist.deletedAt)) {
          gravesMap.set(k, g);
        }
      }
    });
    const mergedUnifiedGraves = Array.from(gravesMap.values());

    // Merge trashPrompts
    const locTrashPrompts = Array.isArray(locPagesB.trashPrompts) ? locPagesB.trashPrompts : [];
    const remTrashPrompts = Array.isArray(remPagesB.trashPrompts) ? remPagesB.trashPrompts : [];
    const trashPromptMap = new Map(locTrashPrompts.map(p => [p.id, p]));
    remTrashPrompts.forEach(p => {
      if (p && p.id) {
        const exist = trashPromptMap.get(p.id);
        if (!exist || safeTimestamp(p.deletedAt) > safeTimestamp(exist.deletedAt)) {
          trashPromptMap.set(p.id, p);
        }
      }
    });
    const mergedTrashPrompts = Array.from(trashPromptMap.values());

    merged['pages_bundle.json'] = {
      pages: serializeBinaryValues(Array.from(pageMap.values())),
      trashPages: serializeBinaryValues(Array.from(mergedTrashMap.values())),
      unifiedGraves: mergedUnifiedGraves,
      trashPrompts: mergedTrashPrompts
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
  const curBundle = merged['curriculum_topics.json'] || {};

  let totalCurriculumTopicsCount = topics.length;
  if (Array.isArray(curBundle.subjectTracker)) {
    curBundle.subjectTracker.forEach(doc => {
      if (doc && doc.topics && typeof doc.topics === 'object') {
        totalCurriculumTopicsCount += Object.keys(doc.topics).length;
      }
    });
  }
  const pytItems = deserializeBinaryValues(curBundle.pytData || []);
  totalCurriculumTopicsCount += pytItems.length;

  // FIX-06: Compute lastModifiedTimestamp across all merged entities so the conflict dialog shows accurate timing
  let mergedMaxEntityTs = 0;
  const _trackMergedTs = (v) => { const t = safeTimestamp(v); if (t > mergedMaxEntityTs) mergedMaxEntityTs = t; };
  flashcards.forEach(c => { if (c) _trackMergedTs(c.updatedAt || c.lastReviewDate || c.createdAt); });
  topics.forEach(t => { if (t) _trackMergedTs(t.updatedAt || t.lastReviewDate || t.createdAt); });
  Object.values(studyLogs).forEach(l => { if (l) _trackMergedTs(l.updatedAt); });
  pages.forEach(p => { if (p) _trackMergedTs(p.updatedAt || p.createdAt); });

  const manifest = {
    version: '2.1',
    engine: 'AutoAnki Google Drive Sync',
    deviceId: getDeviceId(),
    timestamp: new Date().toISOString(),
    lastModifiedTimestamp: mergedMaxEntityTs > 0 ? new Date(mergedMaxEntityTs).toISOString() : null,
    syncVersion: Date.now(),
    schemaVersion: 4,
    hashes,
    stats: {
      cardsCount: flashcards.length,
      topicsCount: totalCurriculumTopicsCount,
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
  if (!authState || (!authState.accessToken && !authState.user?.email)) {
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
          syncVersion: remoteManifest?.syncVersion,
          stats: remoteManifest?.stats,
          deviceId: remoteManifest?.deviceId
        });
      } catch (e) {
        logger.warn('MANIFEST-READ-FAIL', 'Could not read remote manifest:', e);
      }
    }
    const initialRemoteSyncVersion = remoteManifest?.syncVersion || null;

    // Extract local data
    const syncStartTime = Date.now();
    emit(3, 10, 'Calculating local entity checksums…');
    const localData = await extractLocalBundles();
    const localManifest = localData.manifest;
    logger.sync('LOCAL-EXTRACTED', 'Calculated local entity checksums & manifest stats.', {
      stats: localManifest.stats,
      hashes: localManifest.hashes,
      syncVersion: localManifest.syncVersion
    });

    // Check if cloud vault is completely empty (first-time push)
    if (!remoteManifest) {
      logger.sync('INITIAL-PUSH', 'Uploading initial collection to Google Drive...');
      emit(4, 10, 'Uploading initial collection to Google Drive…');
      const res = await executeOneWayPush(accessToken, vaultFolderId, mediaFolderId, localData, remoteFileMap, emit);
      if (res.success) {
        await saveLastSyncedHashes(localData.manifest.hashes);
        logger.sync('INITIAL-PUSH-SUCCESS', 'Initial collection upload complete.');
      }
      return res;
    }

    // Compare hashes against both local and last-synced ancestor hashes
    const localHashes = localManifest.hashes || {};
    const remoteHashes = remoteManifest.hashes || {};
    const lastSyncedHashes = await getLastSyncedHashes();

    const ALL_BUNDLES = ['cards_bundle', 'curriculum_topics', 'study_logs', 'fsrs_config', 'camp_tracker', 'pages_bundle'];
    const allHashesMatch = ALL_BUNDLES.every(k => localHashes[k] && remoteHashes[k] && localHashes[k] === remoteHashes[k]);

    if (allHashesMatch) {
      await saveLastSyncedHashes(localHashes);
      const msg = force
        ? 'Manual sync verified: all 6 bundles match cloud state.'
        : 'All 6 bundles match remote cloud manifest.';
      logger.sync('IN-SYNC', `[NO-OP] ${msg}`, { hashes: localHashes });
      emit(10, 10, msg);
      emitSyncEvent('synced', { message: msg });
      scheduleThrottledIntegrityCheck();
      return { success: true, action: force ? 'synced' : 'noop', message: msg };
    }

    // Scenario 0: Fresh/empty local device auto fast-forward
    const isLocalEmpty = (!localManifest.stats?.cardsCount && !localManifest.stats?.topicsCount && !localManifest.stats?.pagesCount && !localManifest.stats?.logsDaysCount);
    const hasRemoteData = remoteManifest.stats && ((remoteManifest.stats.cardsCount || 0) > 0 || (remoteManifest.stats.topicsCount || 0) > 0 || (remoteManifest.stats.pagesCount || 0) > 0);

    if (isLocalEmpty && hasRemoteData && !force) {
      logger.sync('FAST-FORWARD-DOWNLOAD', 'Local device is uninitialized. Downloading complete collection from cloud...');
      emit(3, 10, 'Downloading your collection from Google Drive…');
      const res = await executeOneWayDownload(accessToken, vaultFolderId, mediaFolderId, remoteFileMap, emit, {
        localHashes,
        remoteHashes,
        syncStartTime
      });
      if (res.success) {
        const postData = await extractLocalBundles();
        await saveLastSyncedHashes(postData.manifest.hashes);
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

    // Scenario 1: Clean Fast-Forward Download (only if remote is actually newer)
    if (isLocalClean && !isRemoteClean && !force) {
      logger.sync('FAST-FORWARD-DOWNLOAD', 'Local had zero edits since last sync. Fast-forwarding local database to newer cloud version...');
      emit(3, 10, 'Fast-forwarding to newer cloud version…');
      const res = await executeOneWayDownload(accessToken, vaultFolderId, mediaFolderId, remoteFileMap, emit, {
        localHashes,
        remoteHashes,
        syncStartTime
      });
      if (res.success) {
        const postData = await extractLocalBundles();
        await saveLastSyncedHashes(postData.manifest.hashes);
        logger.sync('FAST-FORWARD-DOWNLOAD-SUCCESS', 'Local database updated to cloud state.');
      }
      return res;
    }

    // Scenario 2: Clean Fast-Forward Push (with Optimistic Concurrency Protection)
    if (isRemoteClean && !force) {
      logger.sync('FAST-FORWARD-PUSH', 'Remote had zero edits since last sync. Pushing local changes to cloud...');
      emit(3, 10, 'Pushing local changes to cloud…');
      const pushRes = await executeOneWayPush(accessToken, vaultFolderId, mediaFolderId, localData, remoteFileMap, emit, {
        expectedRemoteSyncVersion: initialRemoteSyncVersion,
        remoteHashes: remoteManifest?.hashes
      });

      if (pushRes.success) {
        await saveLastSyncedHashes(localData.manifest.hashes);
        logger.sync('FAST-FORWARD-PUSH-SUCCESS', 'Cloud updated to fresh local state.');
        return pushRes;
      } else if (pushRes.action === 'concurrency_conflict') {
        logger.sync('CONCURRENCY-FALLBACK', 'Fast-forward push aborted due to concurrent cloud modification. Falling back to Scenario 3 (Two-Way Delta Merge)...');
        // Fall through to Scenario 3
      } else {
        return pushRes;
      }
    }

    // Scenario 3: Divergence (Both devices edited data or concurrent push fell back)
    const isSameDevice = remoteManifest.deviceId === localManifest.deviceId;

    // Refresh remote files and manifest if concurrent updates happened
    const freshRemoteFiles = await listFilesInFolder(accessToken, vaultFolderId);
    const freshRemoteFileMap = new Map(freshRemoteFiles.map(f => [f.name, f]));
    let freshRemoteManifest = remoteManifest;
    const freshManifestFile = freshRemoteFileMap.get('manifest.json');
    if (freshManifestFile) {
      try {
        freshRemoteManifest = await downloadDriveFile(accessToken, freshManifestFile.id, true);
      } catch (e) {
        logger.warn('FRESH-MANIFEST-READ-FAIL', 'Could not refresh remote manifest:', e);
      }
    }
    const currentRemoteHashes = freshRemoteManifest?.hashes || remoteHashes || {};

    const modifiedBundleNames = Object.keys(localData.bundles).filter(name => {
      const bundleKey = name.replace('.json', '');
      return localHashes[bundleKey] !== currentRemoteHashes[bundleKey];
    });

    if (modifiedBundleNames.length === 0) {
      await saveLastSyncedHashes(localHashes);
      const msg = force
        ? 'Manual sync verified: all 6 bundles match cloud state.'
        : 'All 6 bundles match remote cloud manifest.';
      logger.sync('IN-SYNC', `[NO-OP] ${msg}`, { hashes: localHashes });
      emit(10, 10, msg);
      emitSyncEvent('synced', { message: msg });
      scheduleThrottledIntegrityCheck();
      if (mediaFolderId) {
        setTimeout(() => {
          syncMediaFromDrive(accessToken, mediaFolderId).catch(e => {
            logger.warn('MEDIA-SYNC-WARN', 'Background media check error:', e);
          });
        }, 300);
      }
      return { success: true, action: force ? 'synced' : 'noop', message: msg };
    }

    const hashDiff = {};
    ['cards_bundle', 'curriculum_topics', 'study_logs', 'fsrs_config', 'camp_tracker', 'pages_bundle'].forEach(k => {
      hashDiff[k] = {
        local: localHashes[k] || 'missing',
        remote: currentRemoteHashes[k] || 'missing',
        ancestor: lastSyncedHashes?.[k] || 'none',
        localChanged: localHashes[k] !== lastSyncedHashes?.[k],
        remoteChanged: currentRemoteHashes[k] !== lastSyncedHashes?.[k],
        inSync: localHashes[k] === currentRemoteHashes[k]
      };
    });

    logger.sync('DIVERGENCE', 'Divergent bundles detected across devices:', {
      modifiedBundleNames,
      isLocalClean,
      isRemoteClean,
      hashDiff
    });
    console.log('[GDriveSync] Detailed 6-bundle hash divergence audit:', JSON.stringify(hashDiff, null, 2));

    if (modifiedBundleNames.includes('fsrs_config.json')) {
      const remoteFsrsFile = freshRemoteFileMap.get('fsrs_config.json');
      if (remoteFsrsFile) {
        downloadDriveFile(accessToken, remoteFsrsFile.id, true).then(remoteFsrs => {
          debugAuditBundleDiff('fsrs_config', localData.bundles['fsrs_config.json'], remoteFsrs);
        }).catch(() => { });
      }
    }

    if (modifiedBundleNames.length > 0) {
      const cardsConflict = localHashes.cards_bundle !== currentRemoteHashes.cards_bundle;
      const topicsConflict = localHashes.curriculum_topics !== currentRemoteHashes.curriculum_topics;
      const pagesConflict = localHashes.pages_bundle !== currentRemoteHashes.pages_bundle;

      const diffDetails = buildConflictDiffDetails(localManifest, freshRemoteManifest || remoteManifest, modifiedBundleNames, localHashes, currentRemoteHashes);

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
              timestamp: localManifest.lastModifiedTimestamp || localManifest.timestamp,
              lastModified: localManifest.lastModifiedTimestamp,
              deviceId: localManifest.deviceId
            },
            remote: {
              cardsCount: freshRemoteManifest?.stats?.cardsCount || remoteManifest.stats?.cardsCount || 0,
              topicsCount: freshRemoteManifest?.stats?.topicsCount || remoteManifest.stats?.topicsCount || 0,
              logsDaysCount: freshRemoteManifest?.stats?.logsDaysCount || remoteManifest.stats?.logsDaysCount || 0,
              pagesCount: freshRemoteManifest?.stats?.pagesCount || remoteManifest.stats?.pagesCount || 0,
              timestamp: freshRemoteManifest?.lastModifiedTimestamp || remoteManifest.lastModifiedTimestamp || freshRemoteManifest?.timestamp || remoteManifest.timestamp,
              lastModified: freshRemoteManifest?.lastModifiedTimestamp || remoteManifest.lastModifiedTimestamp,
              deviceId: freshRemoteManifest?.deviceId || remoteManifest.deviceId
            },
            diffDetails,
            onResolve: resolve
          });
        });

        logger.sync('CONFLICT-RESOLVED', `User chose resolution: ${conflictResolution}`);

        if (conflictResolution === 'upload') {
          const res = await executeOneWayPush(accessToken, vaultFolderId, mediaFolderId, localData, freshRemoteFileMap, emit, {
            remoteHashes: currentRemoteHashes
          });
          if (res.success) {
            await saveLastSyncedHashes(localData.manifest.hashes);
          }
          return res;
        } else if (conflictResolution === 'download') {
          const res = await executeOneWayDownload(accessToken, vaultFolderId, mediaFolderId, freshRemoteFileMap, emit, {
            localHashes,
            remoteHashes: currentRemoteHashes
          });
          if (res.success) {
            const postData = await extractLocalBundles();
            await saveLastSyncedHashes(postData.manifest.hashes);
          }
          return res;
        } else if (conflictResolution === 'merge') {
          logger.sync('MERGE-OPTED', 'User selected smart non-destructive merge.');
        } else {
          emitSyncEvent('cancelled', { message: 'Sync cancelled by user.' });
          return { success: false, action: 'cancelled', message: 'Sync cancelled by user.' };
        }
      }

      // Download remote modified bundles
      emit(5, 10, 'Downloading modified cloud bundles (Phase 1)…');
      const downloadedBundles = {};
      for (const bName of modifiedBundleNames) {
        const rFile = freshRemoteFileMap.get(bName);
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

      // Phase 2: Push Merged Bundles to Google Drive First (Two-Phase Commit with selective upload)
      logger.sync('TWO-PHASE-COMMIT-2', 'Pushing merged collection to Google Drive first...');
      emit(8, 10, 'Pushing merged collection to Google Drive…');
      const pushRes = await executeOneWayPush(accessToken, vaultFolderId, mediaFolderId, stagedMergedData, freshRemoteFileMap, emit, {
        remoteHashes: currentRemoteHashes
      });

      if (!pushRes.success) {
        throw new Error(`Cloud upload failed: ${pushRes.message || 'Unknown network error'}`);
      }

      // Phase 3: Hydrate Local IndexedDB only after confirmed Google Drive receipt
      logger.sync('TWO-PHASE-COMMIT-3', 'Committing merged collection to local IndexedDB...');
      emit(9, 10, 'Committing merged collection to local storage…');
      setMutationNotificationSuppressed(true);
      let hydrateRes = null;
      try {
        hydrateRes = await hydrateLocalBundles(stagedMergedData.bundles, 'replace', (s, t, m) => emit(9, 10, m), { deferUnsuppress: true, syncStartTime });
        const postHydrationLocal = await extractLocalBundles();
        await saveLastSyncedHashes(postHydrationLocal.manifest.hashes);
      } finally {
        setMutationNotificationSuppressed(false);
      }

      if (autoSyncDebounceTimer) {
        clearTimeout(autoSyncDebounceTimer);
        autoSyncDebounceTimer = null;
      }
      lastAutoPushTimestamp = Date.now();
      emitDataHydratedEvent({ strategy: 'replace', bundleKeys: Object.keys(stagedMergedData.bundles) });

      if (hydrateRes?.hasInFlightEdits) {
        logger.sync('INFLIGHT-PRESERVED', 'Preserved in-flight local modifications made during sync.');
        // FIX-14: Schedule immediate re-push so preserved local in-flight edits reach the cloud
        logger.sync('INFLIGHT-REPUSH', 'Scheduling immediate re-push to sync in-flight edits to cloud...');
        setTimeout(async () => {
          try {
            const freshLocal = await extractLocalBundles();
            const freshFiles = await listFilesInFolder(accessToken, vaultFolderId);
            const freshFileMap = new Map(freshFiles.map(f => [f.name, f]));
            await executeOneWayPush(accessToken, vaultFolderId, mediaFolderId, freshLocal, freshFileMap, () => {});
            const postRepushLocal = await extractLocalBundles();
            await saveLastSyncedHashes(postRepushLocal.manifest.hashes);
            logger.sync('INFLIGHT-REPUSH-SUCCESS', 'In-flight edits successfully pushed to cloud.');
          } catch (repushErr) {
            logger.warn('INFLIGHT-REPUSH-FAIL', 'Could not re-push in-flight edits:', repushErr);
          }
        }, 1000);
      }

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
      scheduleThrottledIntegrityCheck();
      return { success: true, action: 'merged', message: 'Merged and synchronized successfully with Google Drive.' };
    }

    logger.sync('SUCCESS', 'Synchronization complete.');
    emit(10, 10, 'Synchronization complete.');
    emitSyncEvent('synced', { message: 'Sync finished successfully.' });
    scheduleThrottledIntegrityCheck();
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
 * Executes a safe one-way push from LocalDB to Google Drive with optimistic concurrency and per-bundle selective uploads.
 */
async function executeOneWayPush(accessToken, vaultFolderId, mediaFolderId, localData, remoteFileMap, emit, { expectedRemoteSyncVersion = null, remoteHashes = null } = {}) {
  // Pre-flight Optimistic Concurrency Check
  if (expectedRemoteSyncVersion !== null && remoteFileMap.has('manifest.json')) {
    const manifestFile = remoteFileMap.get('manifest.json');
    if (manifestFile) {
      try {
        const latestRemoteManifest = await downloadDriveFile(accessToken, manifestFile.id, true);
        const latestVersion = latestRemoteManifest?.syncVersion || null;
        if (latestVersion !== null && latestVersion !== expectedRemoteSyncVersion) {
          logger.sync('CONCURRENCY-CONFLICT', 'Remote syncVersion mismatch before push: concurrent upload detected.', {
            expected: expectedRemoteSyncVersion,
            actual: latestVersion
          });
          return {
            success: false,
            action: 'concurrency_conflict',
            message: 'Cloud vault was updated concurrently by another device. Aborting push to perform delta merge.'
          };
        }
      } catch (err) {
        logger.warn('CONCURRENCY-CHECK-WARN', 'Could not verify remote manifest syncVersion:', err);
      }
    }
  }

  let step = 4;
  const total = 4 + Object.keys(localData.bundles).length + 2;

  const localHashes = localData.manifest?.hashes || {};
  const remHashes = remoteHashes || {};
  let uploadedCount = 0;
  let skippedCount = 0;

  // 1. Upload only modified or new bundles (Note-shelf selective delta upload)
  for (const [fileName, bundleObj] of Object.entries(localData.bundles)) {
    const bundleKey = fileName.replace('.json', '');
    const existingFile = remoteFileMap.get(fileName);

    const isUntouched = existingFile && remHashes[bundleKey] && (localHashes[bundleKey] === remHashes[bundleKey]);
    if (isUntouched) {
      logger.sync('BUNDLE-SKIPPED', `Skipping upload for untouched bundle: ${fileName} (hash match: ${localHashes[bundleKey]})`);
      skippedCount++;
      continue;
    }

    emit(++step, total, `Uploading ${fileName}…`);
    await uploadDriveFile(accessToken, vaultFolderId, fileName, bundleObj, existingFile?.id);
    uploadedCount++;
  }
  logger.sync('SELECTIVE-UPLOAD-SUMMARY', `Push uploaded ${uploadedCount} modified bundle(s), skipped ${skippedCount} unchanged bundle(s).`);

  // 2. Upload manifest.json (always upload updated manifest)
  emit(++step, total, 'Writing manifest.json…');
  const existingManifest = remoteFileMap.get('manifest.json');
  await uploadDriveFile(accessToken, vaultFolderId, 'manifest.json', localData.manifest, existingManifest?.id);

  // Anchor to the exact hashes that were uploaded, not re-extracted (prevents race-condition anchor poisoning)
  await saveLastSyncedHashes(localData.manifest.hashes);

  // 3. Queue Phase 2: Non-blocking media uploads (reads directly from DB to prevent heap closures)
  emit(++step, total, 'Sync complete! Media queued in background.');
  emitSyncEvent('synced', {
    lastSynced: localData.manifest.timestamp,
    stats: localData.manifest.stats
  });

  setTimeout(async () => {
    try {
      const activePages = (await getLocalPages()) || [];
      const trashPages = (await getLocalKV('trash_pages')) || [];
      const allMediaPages = [...activePages, ...trashPages];
      await syncMediaToDrive(accessToken, mediaFolderId, allMediaPages);
    } catch (e) {
      console.warn('[GDriveSync] Background media upload error:', e);
    }
  }, 100);

  return { success: true, action: 'uploaded', message: 'Collection uploaded successfully to Google Drive.' };
}

/**
 * Executes a safe one-way download from Google Drive with completeness validation & selective bundle downloads.
 */
async function executeOneWayDownload(accessToken, vaultFolderId, mediaFolderId, remoteFileMap, emit, { localHashes = null, remoteHashes = null, syncStartTime = 0 } = {}) {
  emit(1, 6, 'Checking cloud bundles for delta download…');
  const downloadedBundles = {};
  const ALL_BUNDLE_NAMES = new Set(['cards_bundle.json', 'curriculum_topics.json', 'study_logs.json', 'fsrs_config.json', 'camp_tracker.json', 'pages_bundle.json']);
  const filesToDownload = Array.from(remoteFileMap.entries()).filter(([name]) => ALL_BUNDLE_NAMES.has(name));

  const locHashes = localHashes || {};
  const remHashes = remoteHashes || {};
  let downloadedCount = 0;
  let skippedCount = 0;

  for (const [name, file] of filesToDownload) {
    const bundleKey = name.replace('.json', '');
    const isUntouched = locHashes[bundleKey] && remHashes[bundleKey] && (locHashes[bundleKey] === remHashes[bundleKey]);

    if (isUntouched) {
      logger.sync('BUNDLE-DOWNLOAD-SKIPPED', `Skipping download for untouched bundle: ${name} (hash match: ${locHashes[bundleKey]})`);
      skippedCount++;
      continue;
    }

    emit(2, 6, `Downloading ${name}…`);
    downloadedBundles[name] = await downloadDriveFile(accessToken, file.id, true);
    downloadedCount++;
  }

  logger.sync('SELECTIVE-DOWNLOAD-SUMMARY', `Download fetched ${downloadedCount} modified bundle(s), skipped ${skippedCount} unchanged bundle(s) (total ${filesToDownload.length}).`);

  // If no bundles actually changed, we're up to date
  if (downloadedCount === 0 && filesToDownload.length > 0) {
    const postHydrationLocal = await extractLocalBundles();
    await saveLastSyncedHashes(postHydrationLocal.manifest.hashes);
    emit(6, 6, 'Everything is up to date.');
    emitSyncEvent('synced', { message: 'Cloud collection already in sync.' });
    return { success: true, action: 'noop', message: 'Collection is already up to date.' };
  }

  emit(4, 6, 'Applying cloud updates to local database…');
  setMutationNotificationSuppressed(true);
  let postHydrationLocal = null;
  let hydrateRes = null;
  try {
    hydrateRes = await hydrateLocalBundles(downloadedBundles, 'replace', (s, t, m) => emit(5, 6, m), { deferUnsuppress: true, syncStartTime });
    postHydrationLocal = await extractLocalBundles();
    await saveLastSyncedHashes(postHydrationLocal.manifest.hashes);
  } finally {
    setMutationNotificationSuppressed(false);
  }

  // Post-Download Cloud Re-Baseline:
  // If local sanitization scrubbed legacy dirty keys from incoming bundles (e.g. fsrs_config),
  // immediately update the cloud bundle and manifest so the cloud vault matches the sanitized baseline and breaks download loops.
  if (postHydrationLocal && postHydrationLocal.manifest && postHydrationLocal.manifest.hashes) {
    const cleanLocalHashes = postHydrationLocal.manifest.hashes;
    const divergentSanitizedBundles = [];

    for (const [fileName, bundleObj] of Object.entries(postHydrationLocal.bundles)) {
      const bundleKey = fileName.replace('.json', '');
      if (remHashes[bundleKey] && cleanLocalHashes[bundleKey] && remHashes[bundleKey] !== cleanLocalHashes[bundleKey]) {
        divergentSanitizedBundles.push(fileName);
      }
    }

    if (divergentSanitizedBundles.length > 0) {
      logger.sync('RE-BASELINE-CLOUD', `Sanitization produced cleaner hash than legacy cloud manifest for [${divergentSanitizedBundles.join(', ')}]. Re-baselining cloud vault to eliminate download loop...`, {
        cleanLocalHashes,
        remHashes
      });
      emit(5, 6, 'Re-baselining cloud vault with sanitized configuration…');
      for (const bName of divergentSanitizedBundles) {
        const existingFile = remoteFileMap.get(bName);
        await uploadDriveFile(accessToken, vaultFolderId, bName, postHydrationLocal.bundles[bName], existingFile?.id);
      }
      const existingManifest = remoteFileMap.get('manifest.json');
      await uploadDriveFile(accessToken, vaultFolderId, 'manifest.json', postHydrationLocal.manifest, existingManifest?.id);

      // Re-anchor lastSyncedHashes to the clean baseline
      await saveLastSyncedHashes(cleanLocalHashes);
      logger.sync('RE-BASELINE-COMPLETE', 'Cloud vault successfully re-baselined to sanitized hashes.');
    }
  }

  // Clear any auto-sync debounce timer and reset cooldown
  if (autoSyncDebounceTimer) {
    clearTimeout(autoSyncDebounceTimer);
    autoSyncDebounceTimer = null;
  }
  lastAutoPushTimestamp = Date.now();

  emit(6, 6, 'Cloud download complete. Queueing media downloads…');
  emitSyncEvent('synced', { message: 'Cloud collection restored.' });
  emitDataHydratedEvent({ strategy: 'replace', bundleKeys: Object.keys(downloadedBundles) });

  if (hydrateRes?.hasInFlightEdits) {
    logger.sync('INFLIGHT-PRESERVED', 'Preserved in-flight local modifications made during download.');
    // FIX-14: Schedule smart push to upload preserved in-flight edits after download
    logger.sync('INFLIGHT-REPUSH-QUEUED', 'Queuing re-push to upload in-flight edits after download...');
    setTimeout(() => {
      triggerDebouncedSmartPush(2000, true);
    }, 1500);
  }

  // Phase 2: Non-blocking background media download if pages_bundle was among downloaded bundles
  if (downloadedBundles['pages_bundle.json']) {
    setTimeout(() => {
      syncMediaFromDrive(accessToken, mediaFolderId).catch(e => {
        console.warn('[GDriveSync] Background media download error:', e);
      });
    }, 100);
  }

  return { success: true, action: 'downloaded', message: 'Collection successfully downloaded from Google Drive.' };
}

/**
 * Phase 2: Uploads local scanned page images and card attachments to the Drive /media folder in the background.
 */
export async function syncMediaToDrive(accessToken, mediaFolderId, pages = [], cards = null) {
  let currentToken = (await getValidAccessToken(false)) || accessToken;
  if (!currentToken || !mediaFolderId) return;

  const localPages = Array.isArray(pages) && pages.length > 0 ? pages : ((await getLocalPages()) || []);
  const localCards = Array.isArray(cards) ? cards : ((await getLocalKV('flashcards')) || []);

  const remoteMediaFiles = await listFilesInFolder(currentToken, mediaFolderId);
  const existingNames = new Set(remoteMediaFiles.map(f => f.name));

  const itemsToUpload = [];

  // 1. Pages to upload
  for (const p of localPages) {
    if (!p || !p.id) continue;
    const mediaName = `page_${p.id}.webp`;
    if (!existingNames.has(mediaName)) {
      const candidate = p.data || p.originalImage || p.imageUrl || p.base64;
      if (candidate) itemsToUpload.push({ type: 'page', id: p.id, name: mediaName, candidate });
    }
  }

  // 2. Flashcard custom images to upload
  for (const c of localCards) {
    if (!c || !c.id) continue;
    const mediaName = `card_${c.id}.webp`;
    if (!existingNames.has(mediaName)) {
      const candidate = c.customImage || (typeof c.imageUrl === 'string' && c.imageUrl.startsWith('data:') ? c.imageUrl : null) || c.base64;
      if (candidate) itemsToUpload.push({ type: 'card', id: c.id, name: mediaName, candidate });
    }
  }

  const totalMedia = itemsToUpload.length;
  if (totalMedia === 0) return;

  logger.sync('MEDIA-UPLOAD-START', `Found ${totalMedia} media files pending upload to Google Drive...`);
  console.log(`[GDriveSync] [MEDIA-UPLOAD-START] Uploading ${totalMedia} media file(s) to Google Drive /media folder...`);

  emitSyncEvent('syncing', {
    message: `Uploading media 0/${totalMedia} (0%)`,
    step: 0,
    total: totalMedia,
    mediaProgress: { current: 0, total: totalMedia, percent: 0, type: 'upload' }
  });

  let uploadedCount = 0;
  for (const item of itemsToUpload) {
    let buffer = null;
    let mimeType = 'image/webp';

    const candidate = item.candidate;
    if (candidate instanceof ArrayBuffer) {
      buffer = candidate;
    } else if (typeof candidate === 'string' && candidate.startsWith('data:')) {
      const parts = candidate.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      mimeType = mimeMatch ? mimeMatch[1] : 'image/webp';
      buffer = base64ToArrayBuffer(parts[1]);
    } else if (candidate?.__type === 'ArrayBuffer' && candidate.base64) {
      buffer = base64ToArrayBuffer(candidate.base64);
    } else if (typeof candidate === 'string' && candidate.length > 100 && !candidate.startsWith('http')) {
      buffer = base64ToArrayBuffer(candidate);
    }

    if (buffer && buffer.byteLength > 0) {
      try {
        const freshToken = (await getValidAccessToken(false)) || currentToken;
        if (freshToken) currentToken = freshToken;
        await uploadDriveMediaFile(currentToken, mediaFolderId, item.name, mimeType, buffer);
      } catch (err) {
        console.warn(`[GDriveSync] Failed to upload media ${item.name}:`, err);
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

  logger.sync('MEDIA-UPLOADED', `Uploaded ${uploadedCount}/${totalMedia} media items to cloud vault.`);
  console.log(`[GDriveSync] [MEDIA-UPLOADED] ${uploadedCount}/${totalMedia} media item(s) uploaded successfully.`);
  emitSyncEvent('synced', {
    message: `All media synchronized (${totalMedia}/${totalMedia})`
  });
}

/**
 * Phase 2: Downloads missing images and card attachments from the Drive /media folder in chunked batches.
 */
export async function syncMediaFromDrive(accessToken, mediaFolderId) {
  let currentToken = (await getValidAccessToken(false)) || accessToken;
  if (!currentToken || !mediaFolderId) return;

  const localPages = (await getLocalPages()) || [];
  const localCards = (await getLocalKV('flashcards')) || [];

  const localPageMap = new Map(localPages.map(p => [String(p.id), p]));
  const localCardMap = new Map(localCards.map(c => [String(c.id), c]));

  const remoteFiles = await listFilesInFolder(currentToken, mediaFolderId);
  if (remoteFiles.length === 0) return;

  const missingFiles = [];

  for (const f of remoteFiles) {
    const pageMatch = f.name.match(/^page_(.+)\.webp$/);
    if (pageMatch) {
      const pageId = pageMatch[1];
      const localPage = localPageMap.get(pageId);
      if (localPage && !localPage.data && !localPage.imageUrl && !localPage.originalImage && !localPage.base64) {
        missingFiles.push({ type: 'page', file: f, id: pageId });
      }
      continue;
    }

    const cardMatch = f.name.match(/^card_(.+)\.webp$/);
    if (cardMatch) {
      const cardId = cardMatch[1];
      const localCard = localCardMap.get(cardId);
      if (localCard && !localCard.customImage && !localCard.imageUrl && !localCard.base64) {
        missingFiles.push({ type: 'card', file: f, id: cardId });
      }
    }
  }

  const totalToDownload = missingFiles.length;
  if (totalToDownload === 0) return;

  logger.sync('MEDIA-DOWNLOAD-START', `Found ${totalToDownload} missing media files in Drive vault. Downloading in chunked batches...`);
  console.log(`[GDriveSync] [MEDIA-DOWNLOAD-START] Downloading ${totalToDownload} missing media item(s)...`);

  emitSyncEvent('syncing', {
    message: `Downloading media 0/${totalToDownload} (0%)`,
    step: 0,
    total: totalToDownload,
    mediaProgress: { current: 0, total: totalToDownload, percent: 0, type: 'download' }
  });

  // Download in throttled batches of 4 to protect mobile memory
  const BATCH_SIZE = 4;
  let downloadedCount = 0;
  let hasPageUpdates = false;
  let hasCardUpdates = false;

  for (let i = 0; i < missingFiles.length; i += BATCH_SIZE) {
    const chunk = missingFiles.slice(i, i + BATCH_SIZE);
    const freshToken = (await getValidAccessToken(false)) || currentToken;
    if (freshToken) currentToken = freshToken;

    await Promise.all(chunk.map(async ({ type, file, id }) => {
      try {
        const arrayBuf = await downloadDriveFile(currentToken, file.id, false);
        const base64Str = arrayBufferToBase64(arrayBuf);
        const mimeType = file.mimeType || 'image/webp';
        const dataUrl = `data:${mimeType};base64,${base64Str}`;

        if (type === 'page') {
          const localPage = localPageMap.get(String(id));
          if (localPage) {
            localPage.data = arrayBuf;
            localPage.imageUrl = dataUrl;
            localPage.originalImage = dataUrl;
            localPage.base64 = dataUrl;
            localPage.hasMedia = true;
            hasPageUpdates = true;
          }
        } else if (type === 'card') {
          const localCard = localCardMap.get(String(id));
          if (localCard) {
            localCard.customImage = dataUrl;
            localCard.imageUrl = dataUrl;
            localCard.base64 = dataUrl;
            hasCardUpdates = true;
          }
        }
      } catch (e) {
        console.warn(`[GDriveSync] Could not download media for ${type} ${id}:`, e);
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

  // Persist hydrated media back into IndexedDB
  if (hasPageUpdates || hasCardUpdates) {
    setMutationNotificationSuppressed(true);
    try {
      if (hasPageUpdates) {
        // FIX-16: Re-read fresh pages from IndexedDB AFTER downloads to avoid overwriting concurrent user edits
        const currentPages = (await getLocalPages()) || [];
        const currentMap = new Map(currentPages.map(p => [String(p.id), p]));
        for (const [id, updatedP] of localPageMap.entries()) {
          if (currentMap.has(id)) {
            const freshCurrent = currentMap.get(id);
            if (!freshCurrent.data && updatedP.data) freshCurrent.data = updatedP.data;
            if (!freshCurrent.imageUrl && updatedP.imageUrl) freshCurrent.imageUrl = updatedP.imageUrl;
            if (!freshCurrent.originalImage && updatedP.originalImage) freshCurrent.originalImage = updatedP.originalImage;
            if (!freshCurrent.base64 && updatedP.base64) freshCurrent.base64 = updatedP.base64;
            if (updatedP.data || updatedP.imageUrl || updatedP.originalImage || updatedP.base64) {
              freshCurrent.hasMedia = true;
            }
          }
        }
        await saveLocalPages(Array.from(currentMap.values()));
      }

      if (hasCardUpdates) {
        const currentCards = (await getLocalKV('flashcards')) || [];
        const currentMap = new Map(currentCards.map(c => [String(c.id), c]));
        for (const [id, updatedC] of localCardMap.entries()) {
          if (currentMap.has(id)) {
            const freshCurrent = currentMap.get(id);
            if (!freshCurrent.customImage && updatedC.customImage) freshCurrent.customImage = updatedC.customImage;
            if (!freshCurrent.imageUrl && updatedC.imageUrl) freshCurrent.imageUrl = updatedC.imageUrl;
            if (!freshCurrent.base64 && updatedC.base64) freshCurrent.base64 = updatedC.base64;
          }
        }
        await setLocalKV('flashcards', Array.from(currentMap.values()));
      }

      const postMediaLocal = await extractLocalBundles();
      await saveLastSyncedHashes(postMediaLocal.manifest.hashes);
    } finally {
      setMutationNotificationSuppressed(false);
    }

    logger.sync('MEDIA-PERSISTED', `Successfully persisted ${downloadedCount}/${totalToDownload} media items to local storage.`);
    console.log(`[GDriveSync] [MEDIA-DOWNLOADED] ${downloadedCount} / ${totalToDownload}`);
    console.log(`[GDriveSync] [MEDIA-PERSISTED] Successfully persisted ${downloadedCount} media item(s) to IndexedDB.`);
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
 * Enforces a 5s debounce with a 30s cooldown and trailing timer guarantees.
 */
export function triggerDebouncedSmartPush(customDelay = 5000, bypassCooldown = false) {
  if (isSyncInProgress) return;
  if (autoSyncDebounceTimer) clearTimeout(autoSyncDebounceTimer);

  autoSyncDebounceTimer = setTimeout(async () => {
    const now = Date.now();
    const elapsed = now - lastAutoPushTimestamp;
    if (!bypassCooldown && elapsed < AUTO_PUSH_COOLDOWN_MS) {
      const remaining = AUTO_PUSH_COOLDOWN_MS - elapsed;
      console.log(`[GDriveSync] Auto-push deferred for remaining cooldown (${Math.round(remaining / 1000)}s)`);
      if (autoSyncDebounceTimer) clearTimeout(autoSyncDebounceTimer);
      autoSyncDebounceTimer = setTimeout(() => triggerDebouncedSmartPush(5000, false), remaining + 500);
      return;
    }

    const auth = await getGoogleDriveAuthState();
    if (!auth?.accessToken) return;

    lastAutoPushTimestamp = Date.now();
    console.log('[GDriveSync] Triggering debounced smart push to Google Drive…');
    syncWithGoogleDrive({ force: false, interactive: false }).catch(err => {
      console.warn('[GDriveSync] Smart push error:', err);
    });
  }, customDelay);
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
 * FIX-17: Checks for pending sync flag set during previous session exit and initiates background sync.
 */
export async function checkAndResumePendingSync() {
  try {
    if (typeof localStorage === 'undefined') return;
    const pending = localStorage.getItem('autoanki_pending_sync_launch');
    if (pending === 'true') {
      localStorage.removeItem('autoanki_pending_sync_launch');
      const auth = await getGoogleDriveAuthState();
      if (auth?.accessToken) {
        logger.sync('PENDING-SYNC-RESUME', 'Resuming pending sync from previous session exit...');
        setTimeout(() => {
          syncWithGoogleDrive({ force: false, interactive: false }).catch(err => {
            logger.warn('PENDING-SYNC-FAIL', 'Pending sync on resume failed:', err);
          });
        }, 3000);
      }
    }
  } catch (e) {
    console.warn('[GDriveSync] checkAndResumePendingSync error:', e);
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
  } catch (e) { }
  return { lastPushed: 0, lastKnownRemoteModified: null };
}

function saveStoredTimerMeta(lastPushed, lastKnownRemoteModified) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TIMER_META_KEY, JSON.stringify({ lastPushed, lastKnownRemoteModified }));
    }
  } catch (e) { }
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

    // FIX-15: Use numeric epoch comparison for robust RFC3339 timestamp handling
    if (lastKnownRemoteTimerModified) {
      const remoteMs = new Date(remoteFile.modifiedTime).getTime();
      const knownMs = new Date(lastKnownRemoteTimerModified).getTime();
      if (!isNaN(remoteMs) && !isNaN(knownMs) && remoteMs <= knownMs) {
        return false;
      }
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



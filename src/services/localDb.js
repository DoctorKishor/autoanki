/**
 * localDb.js - Robust Offline-First IndexedDB Database Engine for AutoAnki
 * 
 * Provides native, promise-based local persistence across browser sessions,
 * web workers, and offline desktop/mobile environments without any external dependencies.
 */

import logger from './logger.js';

const DB_NAME = 'AutoAnkiLocalDB';
const DB_VERSION = 3;

export const STORES = {
  TOPICS: 'topics',
  SETTINGS: 'settings',
  CAMP_TRACKER: 'camp_tracker',
  CAMP_DATA: 'camp_data',
  CAMP_DAILY_LOGS: 'camp_daily_logs',
  PYT_DATA: 'pyt_data',
  KV_STORE: 'kv_store',
  TOPIC_HINTS: 'topic_hints',
  HINT_QUOTA: 'hint_quota',
  SNAPSHOTS: 'snapshots'
};

let dbPromise = null;

/**
 * Initializes and upgrades the IndexedDB database instance.
 * @returns {Promise<IDBDatabase>}
 */
export function initDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.error('[LocalDB] IndexedDB is not supported in this environment.');
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log(`[LocalDB] Upgrading schema to version ${DB_VERSION}...`);

      // 1. Topics store (keyPath: 'id')
      if (!db.objectStoreNames.contains(STORES.TOPICS)) {
        const topicStore = db.createObjectStore(STORES.TOPICS, { keyPath: 'id' });
        topicStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        topicStore.createIndex('name', 'name', { unique: false });
      }

      // 2. Settings store (keyPath: 'key')
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }

      // 3. CAMP Tracker store (keyPath: 'id')
      if (!db.objectStoreNames.contains(STORES.CAMP_TRACKER)) {
        const campStore = db.createObjectStore(STORES.CAMP_TRACKER, { keyPath: 'id' });
        campStore.createIndex('date', 'date', { unique: false });
      }

      // 4. CAMP Data store (keyPath: 'key')
      if (!db.objectStoreNames.contains(STORES.CAMP_DATA)) {
        db.createObjectStore(STORES.CAMP_DATA, { keyPath: 'key' });
      }

      // 5. CAMP Daily Logs store (keyPath: 'dateStr')
      if (!db.objectStoreNames.contains(STORES.CAMP_DAILY_LOGS)) {
        db.createObjectStore(STORES.CAMP_DAILY_LOGS, { keyPath: 'dateStr' });
      }

      // 6. PYT Data store (keyPath: 'key')
      if (!db.objectStoreNames.contains(STORES.PYT_DATA)) {
        db.createObjectStore(STORES.PYT_DATA, { keyPath: 'key' });
      }

      // 7. Generic Key-Value Store (keyPath: 'key')
      if (!db.objectStoreNames.contains(STORES.KV_STORE)) {
        db.createObjectStore(STORES.KV_STORE, { keyPath: 'key' });
      }

      // 8. Topic Hints Store (keyPath: 'topicId')
      if (!db.objectStoreNames.contains(STORES.TOPIC_HINTS)) {
        db.createObjectStore(STORES.TOPIC_HINTS, { keyPath: 'topicId' });
      }

      // 9. Hint Quota Store (keyPath: 'dateStr')
      if (!db.objectStoreNames.contains(STORES.HINT_QUOTA)) {
        db.createObjectStore(STORES.HINT_QUOTA, { keyPath: 'dateStr' });
      }

      // 10. [v3] Internal Snapshot Vault (keyPath: 'id', indexed by createdAt)
      if (!db.objectStoreNames.contains(STORES.SNAPSHOTS)) {
        const snapshotStore = db.createObjectStore(STORES.SNAPSHOTS, { keyPath: 'id' });
        snapshotStore.createIndex('createdAt', 'createdAt', { unique: false });
        snapshotStore.createIndex('label', 'label', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      // Handle connection unexpected closure
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        console.warn('[LocalDB] Database connection closed due to version change.');
      };

      // Proactively request storage persistence against browser disk eviction
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        navigator.storage.persist().catch(() => {});
      }

      console.log('[LocalDB] IndexedDB connected successfully.');
      resolve(db);
    };

    request.onerror = (event) => {
      console.error('[LocalDB] Failed to open IndexedDB:', request.error);
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Execute a transaction on a specific store with promise handling.
 * @param {string} storeName 
 * @param {'readonly'|'readwrite'} mode 
 * @param {function(IDBObjectStore): IDBRequest} operation 
 * @returns {Promise<any>}
 */
async function runTx(storeName, mode, operation) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);

    tx.onerror = () => reject(tx.error || new Error('IndexedDB Transaction Failed'));
    tx.onabort = () => reject(new Error('IndexedDB Transaction Aborted'));

    try {
      const req = operation(store);
      if (req && 'onsuccess' in req) {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } else {
        tx.oncomplete = () => resolve(true);
      }
    } catch (err) {
      reject(err);
    }
  });
}

// ==========================================
// CORE GENERIC DB OPERATIONS
// ==========================================

export async function getLocalItem(storeName, key) {
  return runTx(storeName, 'readonly', store => store.get(key));
}

export async function putLocalItem(storeName, value) {
  return runTx(storeName, 'readwrite', store => store.put(value));
}

export async function deleteLocalItem(storeName, key) {
  return runTx(storeName, 'readwrite', store => store.delete(key));
}

export async function getAllLocalItems(storeName) {
  return runTx(storeName, 'readonly', store => store.getAll());
}

export async function clearLocalStore(storeName) {
  return runTx(storeName, 'readwrite', store => store.clear());
}

// ==========================================
// UNIFIED GRAVES TOMBSTONE REGISTRY
// ==========================================
// Central immutable deletion log keyed by entityType + entityId.
// Schema: { entityType: string, entityId: string, parentId?: string, deletedAt: string }
// entityType values: 'card', 'topic', 'tracker_topic', 'study_log', 'page', 'prompt', 'camp_task'

const GRAVES_KV_KEY = 'unified_graves';

export async function getUnifiedGraves() {
  const list = await getLocalKV(GRAVES_KV_KEY);
  return Array.isArray(list) ? list : [];
}

export async function saveUnifiedGraves(gravesList) {
  if (!Array.isArray(gravesList)) return;
  await setLocalKV(GRAVES_KV_KEY, gravesList);
}

/**
 * Records an immutable deletion tombstone into the unified graves registry.
 * @param {string} entityType - One of: 'card','topic','tracker_topic','study_log','page','prompt','camp_task'
 * @param {string} entityId   - The unique ID of the deleted entity
 * @param {{ parentId?: string, metadata?: object, deletedAt?: string }} opts
 */
export async function recordTombstone(entityType, entityId, opts = {}) {
  if (!entityType || !entityId) return;
  try {
    const graves = await getUnifiedGraves();
    const compositeKey = `${entityType}::${entityId}`;
    const existing = graves.findIndex(g => `${g.entityType}::${g.entityId}` === compositeKey);
    const nowIso = opts.deletedAt || new Date().toISOString();
    const grave = {
      entityType,
      entityId: String(entityId),
      parentId: opts.parentId || null,
      deletedAt: nowIso,
      ...(opts.metadata ? { metadata: opts.metadata } : {})
    };
    if (existing >= 0) {
      // Only update if the new deletion is more recent
      if (new Date(nowIso) >= new Date(graves[existing].deletedAt)) {
        graves[existing] = grave;
      }
    } else {
      graves.push(grave);
    }
    await saveUnifiedGraves(graves);
    logger.db('GRAVES-RECORD', `[${entityType}] Tombstone recorded for ID: ${entityId}`);
  } catch (e) {
    logger.warn('GRAVES-ERROR', `Failed to record tombstone for ${entityType}:${entityId}:`, e);
  }
}

/**
 * Revokes (removes) a tombstone from the unified graves registry.
 * Must be called when a user UNDOES a deletion to prevent ghost eviction on sync.
 * @param {string} entityType
 * @param {string} entityId
 */
export async function revokeTombstone(entityType, entityId) {
  if (!entityType || !entityId) return;
  try {
    const graves = await getUnifiedGraves();
    const compositeKey = `${entityType}::${entityId}`;
    const filtered = graves.filter(g => `${g.entityType}::${g.entityId}` !== compositeKey);
    if (filtered.length !== graves.length) {
      await saveUnifiedGraves(filtered);
      logger.db('GRAVES-REVOKE', `[${entityType}] Tombstone revoked for ID: ${entityId} (Undo action)`);
    }
  } catch (e) {
    logger.warn('GRAVES-ERROR', `Failed to revoke tombstone for ${entityType}:${entityId}:`, e);
  }
}

/**
 * Checks if an entity is tombstoned with a deletion timestamp >= its last modification time.
 * @param {string} entityType
 * @param {string} entityId
 * @param {string|number} modifiedAt - ISO string or epoch of the entity's last modification
 * @returns {boolean}
 */
export async function isEntityTombstoned(entityType, entityId, modifiedAt) {
  if (!entityType || !entityId) return false;
  try {
    const graves = await getUnifiedGraves();
    const compositeKey = `${entityType}::${entityId}`;
    const grave = graves.find(g => `${g.entityType}::${g.entityId}` === compositeKey);
    if (!grave) return false;
    const delTime = new Date(grave.deletedAt).getTime();
    const modTime = modifiedAt ? new Date(modifiedAt).getTime() : 0;
    return delTime >= modTime;
  } catch (e) {
    return false;
  }
}

// ==========================================
// DOMAIN-SPECIFIC CONVENIENCE API
// ==========================================

// --- TOPICS & FLASHCARDS ---
export async function saveLocalTopic(topic) {
  if (!topic || !topic.id) throw new Error('Topic object must contain an id property.');
  const record = {
    ...topic,
    updatedAt: topic.updatedAt || new Date().toISOString()
  };
  await putLocalItem(STORES.TOPICS, record);
  revokeTombstone('topic', String(topic.id)).catch(() => {});
  notifyLocalMutation('topics');
  return record;
}

export async function getLocalTopic(id) {
  return getLocalItem(STORES.TOPICS, id);
}

export async function getAllLocalTopics() {
  const topics = await getAllLocalItems(STORES.TOPICS);
  return Array.isArray(topics) ? topics : [];
}

export async function getLocalTrashTopics() {
  const list = await getLocalKV('trash_topics');
  return Array.isArray(list) ? list : [];
}

export async function saveLocalTrashTopics(trashList) {
  if (!Array.isArray(trashList)) return;
  await setLocalKV('trash_topics', trashList);
}

export async function deleteLocalTopic(id, topicObj = null) {
  logger.db('DELETE-TOPIC', `Deleting topic ID: ${id} ("${topicObj?.name || ''}")`);
  const nowIso = new Date().toISOString();
  const res = await deleteLocalItem(STORES.TOPICS, id);
  try {
    const trash = (await getLocalKV('trash_topics')) || [];
    const filtered = trash.filter(t => t?.id !== id);
    filtered.push({
      id,
      name: topicObj?.name || '',
      subject: topicObj?.subject || '',
      deletedAt: nowIso
    });
    await setLocalKV('trash_topics', filtered);
    logger.db('TOMBSTONE-RECORDED', `Recorded topic tombstone in trash_topics (Total trash: ${filtered.length})`);
  } catch (e) {
    logger.warn('TOMBSTONE-ERROR', 'Error recording topic tombstone:', e);
  }
  // Also record to unified graves registry
  await recordTombstone('topic', String(id), {
    parentId: topicObj?.subject || null,
    deletedAt: nowIso,
    metadata: { name: topicObj?.name || '' }
  });
  notifyLocalMutation('topics');
  return res;
}

// --- TOPICS STORAGE (MUTEX PROTECTED) ---
let topicsWriteMutex = Promise.resolve();

export async function saveAllLocalTopics(topicsArray) {
  if (!Array.isArray(topicsArray)) return;
  logger.db('WRITE-TOPICS', `Writing ${topicsArray.length} topic(s) to IndexedDB...`);
  topicsWriteMutex = topicsWriteMutex.then(async () => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.TOPICS, 'readwrite');
      const store = tx.objectStore(STORES.TOPICS);
      tx.oncomplete = () => {
        logger.db('WRITE-TOPICS-SUCCESS', `Committed ${topicsArray.length} topic(s) to IndexedDB.`);
        resolve(true);
      };
      tx.onerror = () => {
        logger.error('WRITE-TOPICS-FAIL', 'Failed to commit topics to IndexedDB:', tx.error);
        reject(tx.error);
      };
      for (const item of topicsArray) {
        if (item && item.id) {
          store.put({
            ...item,
            updatedAt: item.updatedAt || new Date().toISOString()
          });
          revokeTombstone('topic', String(item.id)).catch(() => {});
        }
      }
    });
  }).catch(err => {
    logger.error('TOPICS-MUTEX-FAIL', 'saveAllLocalTopics mutex error:', err);
  });
  notifyLocalMutation('topics');
  return topicsWriteMutex;
}

let mutationSuppressDepth = 0;

export function setMutationNotificationSuppressed(suppressed) {
  if (suppressed) {
    mutationSuppressDepth++;
  } else {
    mutationSuppressDepth = Math.max(0, mutationSuppressDepth - 1);
  }
}

export function isMutationNotificationSuppressed() {
  return mutationSuppressDepth > 0;
}

// Cross-tab broadcast channel for multi-tab synchronization
let crossTabMutationChannel = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    crossTabMutationChannel = new BroadcastChannel('auto_anki_localdb_channel');
  }
} catch (e) {}

/**
 * Dispatches a global event when local database records are modified,
 * allowing background sync engines to trigger debounced cloud pushes
 * and broadcasting to other open tabs.
 */
export function notifyLocalMutation(mutationType = 'mutation') {
  if (mutationSuppressDepth > 0) return;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('localdb-mutation', {
      detail: { type: mutationType, timestamp: Date.now() }
    }));
  }
  if (crossTabMutationChannel) {
    try {
      crossTabMutationChannel.postMessage({ type: mutationType, timestamp: Date.now() });
    } catch (e) {}
  }
}

// --- SETTINGS & PREFERENCES ---
export async function saveLocalSetting(key, value) {
  await putLocalItem(STORES.SETTINGS, { key, value, updatedAt: new Date().toISOString() });
  const internalKeys = new Set([
    'google_drive_auth',
    'google_drive_sync_state',
    'autoanki_last_synced_hashes',
    'last_synced_hashes'
  ]);
  if (!internalKeys.has(key)) {
    notifyLocalMutation('setting:' + key);
  }
  return value;
}

export async function getLocalSetting(key, defaultValue = null) {
  const res = await getLocalItem(STORES.SETTINGS, key);
  return res ? res.value : defaultValue;
}

export async function getAllLocalSettings() {
  const settings = await getAllLocalItems(STORES.SETTINGS);
  const result = {};
  if (Array.isArray(settings)) {
    settings.forEach(item => {
      if (item && item.key) result[item.key] = item.value;
    });
  }
  return result;
}

export async function saveLocalCampRecord(id, data) {
  const nowIso = new Date().toISOString();
  await putLocalItem(STORES.CAMP_TRACKER, { id, ...data, isDeleted: false, updatedAt: nowIso });
  try {
    const trash = (await getLocalKV('trash_camp')) || [];
    const fTrash = trash.filter(t => t?.id !== id);
    if (fTrash.length !== trash.length) {
      await setLocalKV('trash_camp', fTrash);
    }
  } catch (e) {
    logger.warn('TOMBSTONE-ERROR', 'Error cleaning trash_camp on recreation:', e);
  }
  await revokeTombstone('camp_task', String(id));
}

export async function getLocalCampRecord(id) {
  return getLocalItem(STORES.CAMP_TRACKER, id);
}

export async function getAllLocalCampRecords() {
  return getAllLocalItems(STORES.CAMP_TRACKER);
}

export async function deleteLocalCampTask(taskId, taskObj = null) {
  const nowIso = new Date().toISOString();
  try {
    const existing = taskObj || (await getLocalCampRecord(taskId));
    // Soft-delete: keep record with isDeleted + deletedAt for merge engine
    const deletedRecord = {
      ...(existing || { id: taskId }),
      id: taskId,
      isDeleted: true,
      deletedAt: nowIso,
      updatedAt: nowIso
    };
    await putLocalItem(STORES.CAMP_TRACKER, deletedRecord);

    // Record tombstone in trash_camp
    try {
      const trash = (await getLocalKV('trash_camp')) || [];
      const fTrash = trash.filter(t => t?.id !== taskId);
      fTrash.push({ id: taskId, deletedAt: nowIso });
      await setLocalKV('trash_camp', fTrash);
      logger.db('TOMBSTONE-RECORDED', `Recorded camp task tombstone in trash_camp (Total: ${fTrash.length})`);
    } catch (e) {
      logger.warn('TOMBSTONE-ERROR', 'Error recording camp task tombstone:', e);
    }

    // Also record to unified graves registry
    await recordTombstone('camp_task', String(taskId), { deletedAt: nowIso });
    notifyLocalMutation('camp:delete');
    return true;
  } catch (err) {
    console.error(`[LocalDB] deleteLocalCampTask error for ID ${taskId}:`, err);
    return false;
  }
}


export async function getLocalCampData(key, defaultValue = null) {
  if (!key) return defaultValue;
  try {
    const res = await getLocalItem(STORES.CAMP_DATA, key);
    return res ? res.data : defaultValue;
  } catch (err) {
    console.error(`[LocalDB] Error reading camp_data for key ${key}:`, err);
    return defaultValue;
  }
}

export async function saveLocalCampData(key, data) {
  if (!key) return null;
  try {
    if (key === 'history' && Array.isArray(data)) {
      data.forEach(h => {
        const hKey = h?.fullDate || h?.date || String(h?.timestamp || '');
        if (hKey) revokeTombstone('camp_history_entry', hKey.toLowerCase()).catch(() => {});
      });
    }
    await putLocalItem(STORES.CAMP_DATA, {
      key,
      data,
      updatedAt: new Date().toISOString()
    });
    return data;
  } catch (err) {
    console.error(`[LocalDB] Error saving camp_data for key ${key}:`, err);
    return null;
  }
}

export async function getLocalCampDailyLogs(dateStr) {
  if (!dateStr) return null;
  try {
    return await getLocalItem(STORES.CAMP_DAILY_LOGS, dateStr);
  } catch (err) {
    console.error(`[LocalDB] Error reading camp_daily_logs for date ${dateStr}:`, err);
    return null;
  }
}

export async function saveLocalCampDailyLogs(dateStr, logData) {
  if (!dateStr || !logData) return null;
  try {
    const existing = (await getLocalCampDailyLogs(dateStr)) || { dateStr };
    const merged = {
      ...existing,
      ...logData,
      dateStr,
      updatedAt: new Date().toISOString()
    };
    if (logData.sessions && typeof logData.sessions === 'object') {
      Object.values(logData.sessions).flat().forEach(s => {
        if (s?.id) revokeTombstone('camp_session', String(s.id).toLowerCase()).catch(() => {});
      });
    }
    await putLocalItem(STORES.CAMP_DAILY_LOGS, merged);
    return merged;
  } catch (err) {
    console.error(`[LocalDB] Error saving camp_daily_logs for date ${dateStr}:`, err);
    return null;
  }
}

export async function getAllLocalCampDailyLogs() {
  try {
    return await getAllLocalItems(STORES.CAMP_DAILY_LOGS);
  } catch (err) {
    console.error('[LocalDB] Error reading all camp_daily_logs:', err);
    return [];
  }
}

// --- USER PROFILE ---
export async function getLocalUserProfile() {
  return getLocalKV('local_user_profile', {
    uid: 'local_user',
    email: 'scholar@autoanki.local',
    displayName: 'Offline Scholar',
    photoURL: null,
    isLocalOffline: true
  });
}

export async function saveLocalUserProfile(profile) {
  const existing = await getLocalUserProfile();
  const merged = { ...existing, ...profile, updatedAt: new Date().toISOString() };
  await setLocalKV('local_user_profile', merged);
  return merged;
}


// --- GENERIC KEY-VALUE STORE ---
export async function setLocalKV(key, value) {
  await putLocalItem(STORES.KV_STORE, { key, value, updatedAt: new Date().toISOString() });
}

export async function getLocalKV(key, defaultValue = null) {
  const res = await getLocalItem(STORES.KV_STORE, key);
  return res ? res.value : defaultValue;
}

// --- FLASHCARDS STORAGE ---
// --- FLASHCARDS STORAGE (MUTEX PROTECTED) ---
let cardsWriteMutex = Promise.resolve();

export async function getLocalCards() {
  const cards = await getLocalKV('flashcards', []);
  return cards || [];
}

export async function replaceAllLocalCards(cardsArray) {
  const finalArray = Array.isArray(cardsArray) ? cardsArray : [];
  const nowIso = new Date().toISOString();
  cardsWriteMutex = cardsWriteMutex.then(async () => {
    const existing = await getLocalCards();
    const incomingIds = new Set(finalArray.map(c => c && c.id).filter(Boolean));
    const omittedCards = (existing || []).filter(c => c && c.id && !incomingIds.has(c.id));

    if (omittedCards.length > 0) {
      try {
        const trash = (await getLocalKV('trash_cards')) || [];
        const existingTrashIds = new Set(trash.map(tc => tc && tc.id));
        omittedCards.forEach(c => {
          if (!existingTrashIds.has(c.id)) {
            trash.push({ ...c, deletedAt: nowIso });
          }
        });
        await setLocalKV('trash_cards', trash);
        for (const c of omittedCards) {
          await recordTombstone('card', String(c.id), { deletedAt: nowIso });
        }
        logger.db('BATCH-CARDS-TOMBSTONED', `Recorded tombstones for ${omittedCards.length} omitted flashcards`);
      } catch (e) {
        logger.warn('BATCH-CARDS-TOMBSTONE-ERROR', 'Error recording card tombstones on replaceAll:', e);
      }
    }

    await setLocalKV('flashcards', finalArray);
    notifyLocalMutation('cards:replace');
    return finalArray;
  }).catch(err => {
    console.error("[LocalDB] replaceAllLocalCards mutex error:", err);
    return finalArray;
  });
  return cardsWriteMutex;
}

export async function saveLocalCards(cardsInput) {
  if (!Array.isArray(cardsInput) || cardsInput.length === 0) return getLocalCards();
  logger.db('WRITE-CARDS', `Saving ${cardsInput.length} flashcard(s) to IndexedDB...`);
  cardsWriteMutex = cardsWriteMutex.then(async () => {
    const existing = await getLocalCards();
    const map = new Map(existing.map(c => [c.id, c]));
    cardsInput.forEach(c => {
      if (c && c.id) {
        map.set(c.id, { ...map.get(c.id), ...c, updatedAt: c.updatedAt || new Date().toISOString() });
        revokeTombstone('card', String(c.id)).catch(() => {});
      }
    });
    const merged = Array.from(map.values());
    await setLocalKV('flashcards', merged);
    logger.db('WRITE-CARDS-SUCCESS', `Committed flashcards to IndexedDB (Total cards: ${merged.length})`);
    notifyLocalMutation('cards:save');
    return merged;
  }).catch(err => {
    logger.error('CARDS-MUTEX-FAIL', 'saveLocalCards mutex error:', err);
    return getLocalCards();
  });
  return cardsWriteMutex;
}

export async function saveLocalCard(card) {
  if (!card || !card.id) return null;
  logger.db('SAVE-CARD', `Saving card ID: ${card.id} ("${(card.front || card.question || '').substring(0, 30)}...")`);
  return saveLocalCards([card]);
}

export async function deleteLocalCard(cardId, cardObj = null) {
  logger.db('DELETE-CARD', `Deleting card ID: ${cardId}`);
  const nowIso = new Date().toISOString();
  cardsWriteMutex = cardsWriteMutex.then(async () => {
    const cards = await getLocalCards();
    const target = cardObj || cards.find(c => c.id === cardId) || { id: cardId };
    const filtered = cards.filter(c => c.id !== cardId);
    await setLocalKV('flashcards', filtered);

    // Record tombstone in trash_cards
    try {
      const trash = (await getLocalKV('trash_cards')) || [];
      const fTrash = trash.filter(c => c?.id !== cardId);
      fTrash.push({
        ...target,
        id: cardId,
        deletedAt: nowIso
      });
      await setLocalKV('trash_cards', fTrash);
      logger.db('TOMBSTONE-RECORDED', `Recorded card tombstone in trash_cards (Total trash: ${fTrash.length})`);
    } catch (e) {
      logger.warn('TOMBSTONE-ERROR', 'Error recording card tombstone:', e);
    }

    // Also record to unified graves registry
    await recordTombstone('card', String(cardId), { deletedAt: nowIso });

    logger.db('DELETE-CARD-SUCCESS', `Card removed from active store (Remaining: ${filtered.length})`);
    notifyLocalMutation('cards:delete');
    return filtered;
  }).catch(err => {
    logger.error('CARD-DELETE-FAIL', 'deleteLocalCard mutex error:', err);
    return getLocalCards();
  });
  return cardsWriteMutex;
}

// --- PAGES / SCANS STORAGE (MUTEX PROTECTED) ---
let pagesWriteMutex = Promise.resolve();

export async function getLocalPages() {
  const pages = await getLocalKV('pages', []);
  return pages || [];
}

export function deduplicatePageMedia(p) {
  if (!p || typeof p !== 'object') return p;
  const copy = { ...p };
  if (copy.originalImage && typeof copy.originalImage === 'string') {
    if (copy.imageUrl === copy.originalImage) delete copy.imageUrl;
    if (copy.base64 === copy.originalImage) delete copy.base64;
    if (copy.compressedImage === copy.originalImage) delete copy.compressedImage;
  } else if (copy.imageUrl && typeof copy.imageUrl === 'string') {
    if (copy.base64 === copy.imageUrl) delete copy.base64;
  }
  return copy;
}

export async function getLocalPageById(pageId) {
  if (!pageId) return null;
  const pages = await getLocalPages();
  return pages.find(p => p && p.id === pageId) || null;
}

export async function replaceAllLocalPages(pagesArray) {
  const finalArray = Array.isArray(pagesArray) ? pagesArray.map(deduplicatePageMedia) : [];
  const nowIso = new Date().toISOString();
  pagesWriteMutex = pagesWriteMutex.then(async () => {
    const existing = await getLocalPages();
    const incomingIds = new Set(finalArray.map(p => p && p.id).filter(Boolean));
    const omittedPages = (existing || []).filter(p => p && p.id && !incomingIds.has(p.id));

    if (omittedPages.length > 0) {
      try {
        const trash = (await getLocalKV('trash_pages')) || [];
        const existingTrashIds = new Set(trash.map(tp => tp && tp.id));
        omittedPages.forEach(p => {
          if (!existingTrashIds.has(p.id)) {
            trash.push({ ...p, deletedAt: nowIso });
          }
        });
        await setLocalKV('trash_pages', trash);
        for (const p of omittedPages) {
          await recordTombstone('page', String(p.id), { deletedAt: nowIso });
        }
        logger.db('BATCH-PAGES-TOMBSTONED', `Recorded tombstones for ${omittedPages.length} omitted pages`);
      } catch (e) {
        logger.warn('BATCH-PAGES-TOMBSTONE-ERROR', 'Error recording page tombstones on replaceAll:', e);
      }
    }

    await setLocalKV('pages', finalArray);
    notifyLocalMutation('pages:replace');
    return finalArray;
  }).catch(err => {
    console.error("[LocalDB] replaceAllLocalPages mutex error:", err);
    return finalArray;
  });
  return pagesWriteMutex;
}

export async function saveLocalPages(pagesInput) {
  if (!Array.isArray(pagesInput) || pagesInput.length === 0) return getLocalPages();
  pagesWriteMutex = pagesWriteMutex.then(async () => {
    const existing = await getLocalPages();
    const map = new Map(existing.map(p => [p.id, p]));
    pagesInput.forEach(p => {
      if (p && p.id) {
        const cleaned = deduplicatePageMedia(p);
        map.set(p.id, { ...map.get(p.id), ...cleaned, updatedAt: cleaned.updatedAt || Date.now() });
        revokeTombstone('page', String(p.id)).catch(() => {});
      }
    });
    const merged = Array.from(map.values());
    await setLocalKV('pages', merged);
    notifyLocalMutation('pages:save');
    return merged;
  }).catch(err => {
    console.error("[LocalDB] saveLocalPages mutex error:", err);
    return getLocalPages();
  });
  return pagesWriteMutex;
}

export async function saveLocalPage(pageObj) {
  if (!pageObj || !pageObj.id) return null;
  return saveLocalPages([pageObj]);
}

export async function deleteLocalPage(pageId, pageObj = null) {
  const nowIso = new Date().toISOString();
  pagesWriteMutex = pagesWriteMutex.then(async () => {
    const pages = await getLocalPages();
    const target = pageObj || pages.find(p => p.id === pageId) || { id: pageId };
    const filtered = pages.filter(p => p.id !== pageId);
    await setLocalKV('pages', filtered);

    // Record tombstone in trash_pages
    try {
      const trash = (await getLocalKV('trash_pages')) || [];
      const fTrash = trash.filter(p => p?.id !== pageId);
      fTrash.push({
        ...target,
        id: pageId,
        deletedAt: nowIso
      });
      await setLocalKV('trash_pages', fTrash);
      logger.db('TOMBSTONE-RECORDED', `Recorded page tombstone in trash_pages (Total trash: ${fTrash.length})`);
    } catch (e) {
      logger.warn('TOMBSTONE-ERROR', 'Error recording page tombstone:', e);
    }

    // Also record to unified graves registry
    await recordTombstone('page', String(pageId), { deletedAt: nowIso });

    notifyLocalMutation('pages:delete');
    return filtered;
  }).catch(err => {
    console.error("[LocalDB] deleteLocalPage mutex error:", err);
    return getLocalPages();
  });
  return pagesWriteMutex;
}

// --- CUSTOM PROMPTS STORAGE ---
export async function getLocalPrompts() {
  const prompts = await getLocalKV('custom_prompts', []);
  return prompts || [];
}

export async function replaceAllLocalPrompts(promptsArray) {
  const finalArray = Array.isArray(promptsArray) ? promptsArray : [];
  await setLocalKV('custom_prompts', finalArray);
  return finalArray;
}

export async function saveLocalPrompts(promptsInput) {
  if (!Array.isArray(promptsInput) || promptsInput.length === 0) return getLocalPrompts();
  const existing = await getLocalPrompts();
  const merged = [...existing];

  promptsInput.forEach(p => {
    if (!p || !p.id) return;
    const idx = merged.findIndex(item => item.id === p.id);
    if (idx !== -1) {
      merged[idx] = { ...merged[idx], ...p };
    } else {
      merged.push(p);
    }
    revokeTombstone('prompt', String(p.id)).catch(() => {});
  });

  await setLocalKV('custom_prompts', merged);
  return merged;
}

export async function saveLocalPrompt(promptObj) {
  if (!promptObj || !promptObj.id) return null;
  return saveLocalPrompts([promptObj]);
}

export async function deleteLocalPrompt(promptId) {
  const nowIso = new Date().toISOString();
  const prompts = await getLocalPrompts();
  const target = prompts.find(p => p.id === promptId) || { id: promptId };
  const filtered = prompts.filter(p => p.id !== promptId);
  await replaceAllLocalPrompts(filtered);

  // Record tombstone in trash_prompts
  try {
    const trash = (await getLocalKV('trash_prompts')) || [];
    const fTrash = trash.filter(t => t?.id !== promptId);
    fTrash.push({ ...target, id: promptId, deletedAt: nowIso });
    await setLocalKV('trash_prompts', fTrash);
    logger.db('TOMBSTONE-RECORDED', `Recorded prompt tombstone in trash_prompts (Total: ${fTrash.length})`);
  } catch (e) {
    logger.warn('TOMBSTONE-ERROR', 'Error recording prompt tombstone:', e);
  }

  // Also record to unified graves registry
  await recordTombstone('prompt', String(promptId), { deletedAt: nowIso });
  notifyLocalMutation('prompts:delete');
  return filtered;
}

// --- PYT TOPICS HELPERS ---
export async function saveLocalPytTopic(subjectName, topicsText) {
  if (!subjectName) return null;
  const key = subjectName.trim().toLowerCase();
  const isPdfKey = key.startsWith('pyt_pdf_') || key.startsWith('pyt_topic_pdf_') || key.includes('_topic_');

  const item = {
    key,
    id: key,
    updatedAt: new Date().toISOString()
  };

  if (!isPdfKey) {
    item.subject = subjectName.trim();
  }

  if (typeof topicsText === 'object' && topicsText !== null) {
    Object.assign(item, topicsText);
  } else {
    item.topics = topicsText || '';
  }

  revokeTombstone('pyt_topic', key).catch(() => {});
  return putLocalItem(STORES.PYT_DATA, item);
}

export async function getLocalPytTopic(subjectName) {
  if (!subjectName) return null;
  const key = subjectName.trim().toLowerCase();
  return getLocalItem(STORES.PYT_DATA, key);
}

export async function getAllLocalPytTopics() {
  const allItems = (await getAllLocalItems(STORES.PYT_DATA)) || [];
  return allItems.filter(item => {
    if (!item) return false;
    const key = (item.key || item.id || '').toLowerCase();
    // Exclude PDF attachment keys
    if (key.startsWith('pyt_pdf_') || key.startsWith('pyt_topic_pdf_') || key.includes('_topic_')) return false;
    // Exclude records that are PDF binary containers
    if (item.data instanceof ArrayBuffer || item.data?.__type === 'ArrayBuffer') return false;
    if (item.pdfFileName || item.fileSize || item.isPdfPayload) return false;
    // Exclude records whose subject name is a PDF key or contains '_topic_'
    if (typeof item.subject === 'string' && (item.subject.toLowerCase().startsWith('pyt_pdf_') || item.subject.toLowerCase().startsWith('pyt_topic_') || item.subject.toLowerCase().includes('_topic_'))) return false;
    // Must have a valid subject name
    if (!item.subject || typeof item.subject !== 'string' || !item.subject.trim()) return false;
    return true;
  });
}

export async function deleteLocalPytTopic(subjectName) {
  if (!subjectName) return false;
  const key = subjectName.trim().toLowerCase();
  const nowIso = new Date().toISOString();
  await recordTombstone('pyt_topic', key, {
    deletedAt: nowIso,
    metadata: { subject: subjectName.trim() }
  });
  return deleteLocalItem(STORES.PYT_DATA, key);
}

// --- PYT LOGGER & PROGRESS HELPERS ---
export async function getAllLocalPytProgress() {
  const data = await getLocalKV('pyt_user_progress');
  return Array.isArray(data) ? data : [];
}

export async function saveLocalPytProgressDoc(docId, docData) {
  if (!docId) return null;
  const currentList = await getAllLocalPytProgress();
  const key = docId.trim().toLowerCase();
  const existingIdx = currentList.findIndex(d => d.id === key || d.id === docId);
  const nowIso = new Date().toISOString();
  let updatedList;
  if (existingIdx >= 0) {
    updatedList = [...currentList];
    updatedList[existingIdx] = {
      ...updatedList[existingIdx],
      ...docData,
      id: key,
      updatedAt: docData.updatedAt || nowIso
    };
  } else {
    updatedList = [...currentList, { id: key, ...docData, updatedAt: docData.updatedAt || nowIso }];
  }
  revokeTombstone('pyt_user_progress', key).catch(() => {});
  revokeTombstone('pyt_progress', key).catch(() => {});
  await setLocalKV('pyt_user_progress', updatedList);
  return updatedList;
}

export async function deleteLocalPytProgressDoc(docId) {
  if (!docId) return null;
  const currentList = await getAllLocalPytProgress();
  const key = docId.trim().toLowerCase();
  const filtered = currentList.filter(d => d.id !== key && d.subject?.toLowerCase() !== key);
  await setLocalKV('pyt_user_progress', filtered);
  const nowIso = new Date().toISOString();
  await recordTombstone('pyt_user_progress', key, {
    deletedAt: nowIso,
    metadata: { docId: key }
  });
  return filtered;
}

export async function getLocalTextbooksMetadata() {
  const data = await getLocalKV('textbooks_metadata');
  return Array.isArray(data) ? data : [];
}

export async function saveLocalTextbooksMetadata(metadataArray) {
  await setLocalKV('textbooks_metadata', metadataArray || []);
  return metadataArray || [];
}

// --- STUDY LOGS HELPERS (MUTEX PROTECTED) ---
let studyLogsWriteMutex = Promise.resolve();

export async function getLocalStudyLogs() {
  const data = await getLocalKV('study_logs');
  return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
}

export async function getTrashStudyLogs() {
  const list = await getLocalKV('trash_study_logs');
  return Array.isArray(list) ? list : [];
}

export async function saveTrashStudyLogs(trashList) {
  if (!Array.isArray(trashList)) return;
  await setLocalKV('trash_study_logs', trashList);
}

export async function saveLocalStudyLog(dateStr, logData) {
  if (!dateStr) return await getLocalStudyLogs();
  studyLogsWriteMutex = studyLogsWriteMutex.then(async () => {
    const current = await getLocalStudyLogs();
    const existingDay = current[dateStr] || {};
    const updatedDay = {
      ...existingDay,
      ...logData,
      updatedAt: logData?.updatedAt || new Date().toISOString()
    };
    const updated = { ...current, [dateStr]: updatedDay };
    await setLocalKV('study_logs', updated);

    // Revoke any tombstone in trash_study_logs
    try {
      const trash = (await getLocalKV('trash_study_logs')) || [];
      if (Array.isArray(trash) && trash.some(t => t?.dateKey === dateStr)) {
        const filtered = trash.filter(t => t?.dateKey !== dateStr);
        await setLocalKV('trash_study_logs', filtered);
      }
    } catch (e) {
      console.warn('[LocalDB] Error pruning trash_study_logs on save:', e);
    }

    // Revoke from unified graves registry
    await revokeTombstone('study_log', String(dateStr));

    return updated;
  }).catch(err => {
    console.error("[LocalDB] saveLocalStudyLog mutex error:", err);
    return getLocalStudyLogs();
  });
  return studyLogsWriteMutex;
}

export async function deleteLocalStudyLog(dateKey) {
  if (!dateKey) return await getLocalStudyLogs();
  const nowIso = new Date().toISOString();
  studyLogsWriteMutex = studyLogsWriteMutex.then(async () => {
    const current = await getLocalStudyLogs();
    const updated = { ...current };
    delete updated[dateKey];
    await setLocalKV('study_logs', updated);

    try {
      const trash = (await getLocalKV('trash_study_logs')) || [];
      const filtered = Array.isArray(trash) ? trash.filter(t => t?.dateKey !== dateKey) : [];
      filtered.push({
        dateKey,
        deletedAt: nowIso
      });
      await setLocalKV('trash_study_logs', filtered);
      logger.db('TOMBSTONE-RECORDED', `Recorded study log tombstone in trash_study_logs for ${dateKey} (Total: ${filtered.length})`);
    } catch (e) {
      console.warn('[LocalDB] Error recording study log tombstone:', e);
    }

    // Also record to unified graves registry
    await recordTombstone('study_log', String(dateKey), { deletedAt: nowIso });

    notifyLocalMutation('study_logs:delete');
    return updated;
  }).catch(err => {
    console.error("[LocalDB] deleteLocalStudyLog mutex error:", err);
    return getLocalStudyLogs();
  });
  return studyLogsWriteMutex;
}

export async function deleteLocalStudyLogEntry(dateStr, logId, topicName = null, deletedLogObj = null) {
  if (!dateStr || !logId) return await getLocalStudyLogs();
  const nowIso = new Date().toISOString();
  studyLogsWriteMutex = studyLogsWriteMutex.then(async () => {
    const current = await getLocalStudyLogs();
    const existingDay = current[dateStr];
    if (!existingDay || !Array.isArray(existingDay.fsrsLogs)) return current;

    const filtered = existingDay.fsrsLogs.filter(l => l && l.id !== logId);
    const removedLog = deletedLogObj || existingDay.fsrsLogs.find(l => l && l.id === logId);
    const removedPages = removedLog?.pageWeight || 1;

    const updatedDay = {
      ...existingDay,
      cards: Math.max(0, (existingDay.cards || 0) - 1),
      pages: Math.max(0, (existingDay.pages || 0) - removedPages),
      fsrsLogs: filtered,
      updatedAt: nowIso
    };

    const updated = { ...current, [dateStr]: updatedDay };
    await setLocalKV('study_logs', updated);

    // Record granular tombstone for this specific study log entry
    const cleanTopicName = topicName || removedLog?.topicName || null;
    const cleanSubject = removedLog?.subject || null;
    await recordTombstone('study_log_entry', String(logId), {
      parentId: dateStr,
      deletedAt: nowIso,
      metadata: {
        dateStr,
        logId,
        topicName: cleanTopicName,
        subject: cleanSubject,
        rating: removedLog?.rating
      }
    });

    notifyLocalMutation('study_logs:entry_delete');
    return updated;
  }).catch(err => {
    console.error("[LocalDB] deleteLocalStudyLogEntry mutex error:", err);
    return getLocalStudyLogs();
  });
  return studyLogsWriteMutex;
}

export async function replaceAllLocalStudyLogs(logsObj) {
  studyLogsWriteMutex = studyLogsWriteMutex.then(async () => {
    const updated = logsObj || {};
    await setLocalKV('study_logs', updated);
    return updated;
  }).catch(err => {
    console.error("[LocalDB] replaceAllLocalStudyLogs mutex error:", err);
    return logsObj || {};
  });
  return studyLogsWriteMutex;
}

// --- TIMER STATE HELPERS ---
export async function getLocalTimerState() {
  const data = await getLocalKV('timerState');
  return (data && typeof data === 'object' && !Array.isArray(data)) ? data : null;
}

let timerStateWritePromise = Promise.resolve();

export async function saveLocalTimerState(updates) {
  timerStateWritePromise = timerStateWritePromise.then(async () => {
    const current = (await getLocalTimerState()) || {};
    const updated = { ...current, ...updates };
    await setLocalKV('timerState', updated);
    return updated;
  }).catch(err => {
    console.error("[LocalDB] saveLocalTimerState mutex error:", err);
    return getLocalTimerState();
  });
  return timerStateWritePromise;
}

// --- SUBJECT TRACKER HELPERS (MUTEX PROTECTED & TIMESTAMP-AWARE) ---
let subjectTrackerWriteMutex = Promise.resolve();

export async function getLocalSubjectTrackerData() {
  const data = await getLocalKV('subject_tracker_data');
  return Array.isArray(data) ? data : [];
}

export async function saveLocalSubjectTrackerDoc(docId, docData) {
  if (!docId) return await getLocalSubjectTrackerData();
  let normalizedDocId = docId;
  let normalizedDocData = docData;
  if (typeof docId === 'object' && docId !== null) {
    normalizedDocId = docId.id || (docId.subject ? docId.subject.trim().toLowerCase() : null);
    normalizedDocData = docId;
  }
  if (!normalizedDocId) return await getLocalSubjectTrackerData();

  subjectTrackerWriteMutex = subjectTrackerWriteMutex.then(async () => {
    const current = await getLocalSubjectTrackerData();
    const idx = current.findIndex(d => d.id === normalizedDocId);
    const existing = idx >= 0 ? current[idx] : null;

    const existingTopics = existing?.topics && typeof existing.topics === 'object' ? existing.topics : {};
    const incomingTopics = normalizedDocData?.topics && typeof normalizedDocData.topics === 'object' ? normalizedDocData.topics : {};

    // Detect deleted topics when incomingTopics is provided as a complete replacement dictionary
    const deletedTopicKeys = Object.keys(existingTopics).filter(k => !Object.prototype.hasOwnProperty.call(incomingTopics, k));
    if (deletedTopicKeys.length > 0) {
      try {
        const trash = (await getLocalKV('trash_topics')) || [];
        const nowIso = new Date().toISOString();
        for (const tKey of deletedTopicKeys) {
          const oldT = existingTopics[tKey];
          const topicId = oldT?.id || `${normalizedDocId}_${tKey}`;
          if (!trash.some(t => t.id === topicId || (t.docId === normalizedDocId && t.topicName === tKey))) {
            trash.push({
              id: topicId,
              docId: normalizedDocId,
              topicName: tKey,
              name: oldT?.name || tKey,
              subject: normalizedDocData.subject || existing?.subject || normalizedDocId,
              deletedAt: nowIso
            });
          }
          // Also record to unified graves registry
          await recordTombstone('tracker_topic', String(topicId), {
            parentId: normalizedDocId,
            deletedAt: nowIso,
            metadata: { topicName: tKey, docId: normalizedDocId, name: oldT?.name || tKey }
          });
        }
        await setLocalKV('trash_topics', trash);
      } catch (e) {
        console.warn("[LocalDB] Error recording subject tracker topic tombstone:", e);
      }
    }

    const topicsToSave = {};
    let hasAnyTopicModified = false;
    Object.entries(incomingTopics).forEach(([tName, tObj]) => {
      const prevTopic = existingTopics[tName];
      const isNew = !prevTopic;
      // Compare topic properties excluding volatile timestamps
      let isModified = isNew;
      if (!isNew && prevTopic && tObj) {
        const pCopy = { ...prevTopic }; delete pCopy.updatedAt;
        const tCopy = { ...tObj }; delete tCopy.updatedAt;
        isModified = JSON.stringify(pCopy) !== JSON.stringify(tCopy);
      }
      if (isModified) hasAnyTopicModified = true;

      const topicId = tObj?.id || `${normalizedDocId}_${tName}`;
      revokeTombstone('tracker_topic', String(topicId)).catch(() => {});
      revokeTombstone('topic', String(topicId)).catch(() => {});

      topicsToSave[tName] = {
        ...(prevTopic || {}),
        ...(tObj || {}),
        updatedAt: tObj?.updatedAt || (isModified ? new Date().toISOString() : (prevTopic?.updatedAt || undefined))
      };
    });

    const docToSave = {
      ...existing,
      ...normalizedDocData,
      id: normalizedDocId,
      subject: normalizedDocData.subject || existing?.subject || normalizedDocId,
      topics: topicsToSave,
      updatedAt: normalizedDocData.updatedAt || (hasAnyTopicModified || deletedTopicKeys.length > 0 ? new Date().toISOString() : (existing?.updatedAt || new Date().toISOString()))
    };

    revokeTombstone('tracker_subject', normalizedDocId).catch(() => {});
    revokeTombstone('subject', normalizedDocId).catch(() => {});

    const updated = idx >= 0
      ? current.map(d => d.id === normalizedDocId ? docToSave : d)
      : [...current, docToSave];

    await setLocalKV('subject_tracker_data', updated);
    notifyLocalMutation('subject_tracker');
    logger.db('SAVE-SUBJECT-TRACKER', `Saved subject tracker doc "${normalizedDocId}" with ${Object.keys(topicsToSave).length} topics (Pruned ${deletedTopicKeys.length} deleted)`);
    return updated;
  }).catch(err => {
    console.error("[LocalDB] saveLocalSubjectTrackerDoc mutex error:", err);
    return getLocalSubjectTrackerData();
  });

  return subjectTrackerWriteMutex;
}

export async function deleteLocalSubjectTrackerDoc(docId, subjectName = null) {
  if (!docId) return await getLocalSubjectTrackerData();
  const normalizedDocId = String(docId).trim().toLowerCase();
  const nowIso = new Date().toISOString();

  subjectTrackerWriteMutex = subjectTrackerWriteMutex.then(async () => {
    const current = await getLocalSubjectTrackerData();
    const target = current.find(d => d.id === normalizedDocId || d.subject?.trim().toLowerCase() === normalizedDocId);
    const filtered = current.filter(d => d.id !== normalizedDocId && d.subject?.trim().toLowerCase() !== normalizedDocId);

    await setLocalKV('subject_tracker_data', filtered);

    const displayName = subjectName || target?.subject || normalizedDocId;

    // Record tombstone in trash_subjects
    try {
      const trash = (await getLocalKV('trash_subjects')) || [];
      const fTrash = trash.filter(t => t?.id !== normalizedDocId);
      fTrash.push({
        ...(target || {}),
        id: normalizedDocId,
        subject: displayName,
        deletedAt: nowIso
      });
      await setLocalKV('trash_subjects', fTrash);
      logger.db('TOMBSTONE-RECORDED', `Recorded subject tombstone in trash_subjects for "${normalizedDocId}"`);
    } catch (e) {
      console.warn('[LocalDB] Error recording subject tombstone in trash_subjects:', e);
    }

    // Record tombstone in unified graves for the subject
    await recordTombstone('tracker_subject', normalizedDocId, {
      deletedAt: nowIso,
      metadata: { subject: displayName, docId: normalizedDocId }
    });

    // Also tombstone all child topics in unified graves
    if (target?.topics && typeof target.topics === 'object') {
      for (const [tName, tObj] of Object.entries(target.topics)) {
        const topicId = tObj?.id || `${normalizedDocId}_${tName}`;
        await recordTombstone('tracker_topic', String(topicId), {
          parentId: normalizedDocId,
          deletedAt: nowIso,
          metadata: { topicName: tName, docId: normalizedDocId, name: tObj?.name || tName }
        });
      }
    }

    notifyLocalMutation('subject_tracker:delete');
    return filtered;
  }).catch(err => {
    console.error("[LocalDB] deleteLocalSubjectTrackerDoc mutex error:", err);
    return getLocalSubjectTrackerData();
  });

  return subjectTrackerWriteMutex;
}

export async function replaceAllLocalSubjectTrackerData(dataArray) {
  subjectTrackerWriteMutex = subjectTrackerWriteMutex.then(async () => {
    const finalArray = Array.isArray(dataArray) ? dataArray : [];
    await setLocalKV('subject_tracker_data', finalArray);
    return finalArray;
  }).catch(err => {
    console.error("[LocalDB] replaceAllLocalSubjectTrackerData mutex error:", err);
    return dataArray || [];
  });
  return subjectTrackerWriteMutex;
}

// --- STUDY SCHEDULE HELPERS ---
export async function getLocalStudySchedule() {
  const data = await getLocalKV('study_schedule');
  return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
}

export async function saveLocalScheduleEntry(dateStr, entryData) {
  if (!dateStr) return await getLocalStudySchedule();
  const current = await getLocalStudySchedule();
  const nowIso = new Date().toISOString();

  // Ensure entryData has an updatedAt timestamp and tasks have individual updatedAt
  const processedTasks = Array.isArray(entryData?.tasks)
    ? entryData.tasks.map(t => ({
        ...t,
        updatedAt: t.updatedAt || nowIso
      }))
    : (entryData?.tasks !== undefined ? entryData.tasks : (current[dateStr]?.tasks || []));

  const mergedEntry = {
    ...(current[dateStr] || {}),
    ...entryData,
    tasks: processedTasks,
    updatedAt: entryData?.updatedAt || nowIso
  };

  const hasTasks = Array.isArray(mergedEntry.tasks) && mergedEntry.tasks.length > 0;
  const hasNotes = typeof mergedEntry.notes === 'string' && mergedEntry.notes.trim().length > 0;
  const hasExamTitle = Boolean(mergedEntry.examTitle || mergedEntry.title || mergedEntry.subject);

  const updated = { ...current };
  if (!hasTasks && !hasNotes && !hasExamTitle) {
    delete updated[dateStr];
    await recordTombstone('study_schedule', String(dateStr), { deletedAt: nowIso, metadata: { dateStr } });
  } else {
    updated[dateStr] = mergedEntry;
    await revokeTombstone('study_schedule', String(dateStr));
  }

  await setLocalKV('study_schedule', updated);
  return updated;
}

export async function deleteLocalScheduleEntry(dateStr) {
  if (!dateStr) return await getLocalStudySchedule();
  const current = await getLocalStudySchedule();
  const updated = { ...current };
  delete updated[dateStr];
  const nowIso = new Date().toISOString();
  await recordTombstone('study_schedule', String(dateStr), { deletedAt: nowIso, metadata: { dateStr } });
  await setLocalKV('study_schedule', updated);
  return updated;
}

export async function replaceAllLocalStudySchedule(scheduleObj) {
  await setLocalKV('study_schedule', scheduleObj || {});
  return scheduleObj || {};
}

// --- SCHEDULE TEMPLATE HELPERS ---
export async function getLocalScheduleTemplates() {
  const list = await getLocalKV('schedule_templates');
  return Array.isArray(list) ? list : [];
}

export async function saveLocalScheduleTemplate(templateObj) {
  if (!templateObj || !templateObj.id) return await getLocalScheduleTemplates();
  const current = await getLocalScheduleTemplates();
  const nowIso = new Date().toISOString();
  const stamped = { ...templateObj, updatedAt: templateObj.updatedAt || nowIso };
  const index = current.findIndex(t => t.id === stamped.id);
  let updated;
  if (index >= 0) {
    updated = [...current];
    updated[index] = { ...updated[index], ...stamped };
  } else {
    updated = [...current, stamped];
  }
  await setLocalKV('schedule_templates', updated);
  try {
    const trash = (await getLocalKV('trash_schedule_templates')) || [];
    const fTrash = trash.filter(t => t?.id !== stamped.id);
    if (fTrash.length !== trash.length) {
      await setLocalKV('trash_schedule_templates', fTrash);
    }
  } catch (e) {}
  await revokeTombstone('schedule_template', String(stamped.id));
  return updated;
}

export async function deleteLocalScheduleTemplate(templateId) {
  if (!templateId) return await getLocalScheduleTemplates();
  const current = await getLocalScheduleTemplates();
  const target = current.find(t => t.id === templateId) || { id: templateId };
  const updated = current.filter(t => t.id !== templateId);
  await setLocalKV('schedule_templates', updated);
  const nowIso = new Date().toISOString();
  try {
    const trash = (await getLocalKV('trash_schedule_templates')) || [];
    const fTrash = trash.filter(t => t?.id !== templateId);
    fTrash.push({ ...target, id: templateId, deletedAt: nowIso });
    await setLocalKV('trash_schedule_templates', fTrash);
  } catch (e) {
    logger.warn('TOMBSTONE-ERROR', 'Error recording schedule template tombstone:', e);
  }
  await recordTombstone('schedule_template', String(templateId), { deletedAt: nowIso, metadata: { name: target.name || '' } });
  return updated;
}

export async function replaceAllLocalScheduleTemplates(templatesArray) {
  const finalArray = Array.isArray(templatesArray) ? templatesArray : [];
  await setLocalKV('schedule_templates', finalArray);
  return finalArray;
}

export const DEFAULT_FSRS_CONFIG = {
  enabled: true,
  weights: [
    0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0589, 1.5330,
    0.1544, 1.0071, 1.9395, 0.1100, 0.2900, 2.2700, 0.1500, 2.9898, 0.5100,
    0.3400, 0.0000, 0.2345
  ],
  retentionMode: 'global',
  globalDesiredRetention: 0.90,
  perSubjectRetention: {
    Anatomy: 0.90,
    Physiology: 0.90,
    Biochemistry: 0.90,
    Pathology: 0.90,
    Microbiology: 0.90,
    Pharmacology: 0.90,
    "Forensic Medicine": 0.90,
    "Social and Preventive Medicine": 0.90,
    Ophthalmology: 0.90,
    ENT: 0.90,
    "General Medicine": 0.90,
    "General Surgery": 0.90,
    "Obstetrics and Gynecology": 0.90,
    Pediatrics: 0.90,
    Psychiatry: 0.90,
    Dermatology: 0.90,
    Anesthesia: 0.90,
    Radiology: 0.90,
    Orthopedics: 0.90
  },
  dailyLimits: {
    newPagesPerDay: 15,
    maxReviewPagesPerDay: 30,
    newIgnoreReviewLimit: false,
    limitsStartFromTop: false
  },
  newTopics: {
    learningSteps: '1d',
    insertionOrder: 'sequential'
  },
  lapses: {
    relearningSteps: '1d',
    leechThreshold: 8,
    leechAction: 'tag'
  },
  displayOrder: {
    gatherOrder: 'curriculum',
    sortOrder: 'subject',
    newReviewOrder: 'reviewsFirst',
    interdayOrder: 'mix',
    reviewSortOrder: 'urgency'
  },
  easyDays: {
    mon: 'normal',
    tue: 'normal',
    wed: 'normal',
    thu: 'normal',
    fri: 'normal',
    sat: 'normal',
    sun: 'normal'
  },
  advancedRules: {
    maxInterval: 365,
    historicalRetention: 0.90,
    ignoreReviewsBefore: null,
    customRules: ''
  }
};

export async function getFSRSConfig() {
  const saved = await getLocalSetting('fsrs_config');
  if (!saved || typeof saved !== 'object') {
    return DEFAULT_FSRS_CONFIG;
  }
  return {
    ...DEFAULT_FSRS_CONFIG,
    ...saved,
    dailyLimits: { ...DEFAULT_FSRS_CONFIG.dailyLimits, ...(saved.dailyLimits || {}) },
    newTopics: { ...DEFAULT_FSRS_CONFIG.newTopics, ...(saved.newTopics || {}) },
    lapses: { ...DEFAULT_FSRS_CONFIG.lapses, ...(saved.lapses || {}) },
    displayOrder: { ...DEFAULT_FSRS_CONFIG.displayOrder, ...(saved.displayOrder || {}) },
    easyDays: { ...DEFAULT_FSRS_CONFIG.easyDays, ...(saved.easyDays || {}) },
    advancedRules: { ...DEFAULT_FSRS_CONFIG.advancedRules, ...(saved.advancedRules || {}) },
    perSubjectRetention: { ...DEFAULT_FSRS_CONFIG.perSubjectRetention, ...(saved.perSubjectRetention || {}) }
  };
}

export async function saveFSRSConfig(config) {
  const existing = await getFSRSConfig();
  const merged = { ...existing, ...config };
  await saveLocalSetting('fsrs_config', merged);
  return merged;
}

/**
 * Retrieves cached AI topic recommendations for a given date string (YYYY-MM-DD).
 */
export async function getAiTopicRecommendations(dateStr) {
  if (!dateStr) return null;
  return await getLocalKV(`ai_recommendations_${dateStr}`);
}

/**
 * Saves AI topic recommendations for a given date string (YYYY-MM-DD).
 */
export async function saveAiTopicRecommendations(dateStr, recommendations) {
  if (!dateStr) return;
  return await setLocalKV(`ai_recommendations_${dateStr}`, recommendations);
}

/**
 * Retrieves active user-picked new topic IDs for a given date string (YYYY-MM-DD).
 */
export async function getActiveNewTopicIds(dateStr) {
  if (!dateStr) return [];
  const list = await getLocalKV(`active_new_topics_${dateStr}`);
  return Array.isArray(list) ? list : [];
}

/**
 * Saves active user-picked new topic IDs for a given date string (YYYY-MM-DD).
 */
export async function saveActiveNewTopicIds(dateStr, topicIds) {
  if (!dateStr) return;
  return await setLocalKV(`active_new_topics_${dateStr}`, Array.isArray(topicIds) ? topicIds : []);
}

/**
 * Saves generated AI hints for a specific topic to LocalDB.
 * @param {string} topicId 
 * @param {object} payload { topicId, hints: [], generatedAt, pdfFileName, startPage, endPage }
 */
export async function saveTopicHintsLocal(topicId, payload) {
  if (!topicId) return null;
  const item = {
    ...payload,
    topicId,
    hints: Array.isArray(payload?.hints) ? payload.hints : [],
    tree: payload?.tree || null,
    structure: payload?.structure || null,
    chapterTitle: payload?.chapterTitle || '',
    usedModel: payload?.usedModel || '',
    generatedAt: payload?.generatedAt || new Date().toISOString(),
    pdfFileName: payload?.pdfFileName || '',
    startPage: payload?.startPage || 1,
    endPage: payload?.endPage || 1
  };
  await setLocalKV(`topic_hints_${topicId}`, item);
  try {
    await runTx(STORES.TOPIC_HINTS, 'readwrite', store => store.put(item));
  } catch (e) {
    // Graceful fallback to KV store if store not initialized
  }
  await revokeTombstone('topic_hints', String(topicId));
  return item;
}

/**
 * Gets cached AI hints for a topic from LocalDB.
 * @param {string} topicId 
 * @returns {Promise<object|null>}
 */
export async function getTopicHintsLocal(topicId) {
  if (!topicId) return null;
  try {
    const res = await runTx(STORES.TOPIC_HINTS, 'readonly', store => store.get(topicId));
    if (res && (res.tree || res.structure || (Array.isArray(res.hints) && res.hints.length > 0))) return res;
  } catch (e) {
    // Fallback to KV store
  }
  const kv = await getLocalKV(`topic_hints_${topicId}`);
  return kv || null;
}

/**
 * Deletes cached AI hints for a topic from LocalDB.
 * @param {string} topicId 
 */
export async function deleteTopicHintsLocal(topicId) {
  if (!topicId) return;
  const nowIso = new Date().toISOString();
  try {
    await runTx(STORES.TOPIC_HINTS, 'readwrite', store => store.delete(topicId));
  } catch (e) { }
  await setLocalKV(`topic_hints_${topicId}`, null);
  await recordTombstone('topic_hints', String(topicId), { deletedAt: nowIso });
}

/**
 * Checks the student's daily Free Tier AI hint request quota (500 RPD budget).
 * Auto-resets count to 0 if a new day has started.
 * @param {number} maxQuota Default 500
 * @returns {Promise<{ dateStr: string, count: number, remaining: number, isExceeded: boolean }>}
 */
export async function checkDailyHintQuotaLocal(maxQuota = 500) {
  const todayStr = new Date().toLocaleDateString('en-CA');
  let record = null;
  try {
    record = await runTx(STORES.HINT_QUOTA, 'readonly', store => store.get(todayStr));
  } catch (e) { }
  if (!record) {
    record = await getLocalKV(`hint_quota_${todayStr}`);
  }

  const currentCount = record?.count || 0;
  return {
    dateStr: todayStr,
    count: currentCount,
    remaining: Math.max(0, maxQuota - currentCount),
    isExceeded: currentCount >= maxQuota
  };
}

/**
 * Increments today's AI hint request counter by 1.
 * @returns {Promise<number>} New count
 */
export async function incrementDailyHintQuotaLocal() {
  const todayStr = new Date().toLocaleDateString('en-CA');
  const status = await checkDailyHintQuotaLocal();
  const newCount = status.count + 1;
  const record = { dateStr: todayStr, count: newCount, updatedAt: new Date().toISOString() };

  await setLocalKV(`hint_quota_${todayStr}`, record);
  try {
    await runTx(STORES.HINT_QUOTA, 'readwrite', store => store.put(record));
  } catch (e) { }

  return newCount;
}

/**
 * Calculates a comprehensive breakdown of storage usage across all IndexedDB stores,
 * KV collections, LocalStorage, and navigator.storage estimate.
 */
export async function calculateDetailedStorageBreakdown() {
  let browserUsage = 0;
  let browserQuota = 0;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      browserUsage = est.usage || 0;
      browserQuota = est.quota || 0;
    }
  } catch (e) {
    console.warn('[LocalDB] navigator.storage.estimate unavailable:', e);
  }

  const getByteSize = (obj) => {
    if (!obj) return 0;
    if (obj instanceof ArrayBuffer) return obj.byteLength;
    if (ArrayBuffer.isView(obj)) return obj.byteLength;
    if (typeof obj === 'object') {
      if (obj.__type === 'ArrayBuffer' && typeof obj.byteLength === 'number') return obj.byteLength;
      if (obj.data instanceof ArrayBuffer) return obj.data.byteLength + 200;
      if (obj.data?.__type === 'ArrayBuffer' && typeof obj.data.byteLength === 'number') return obj.data.byteLength + 200;
      if (Array.isArray(obj)) {
        let sum = 0;
        for (const item of obj) {
          if (item?.data instanceof ArrayBuffer) sum += item.data.byteLength;
          else if (item?.data?.__type === 'ArrayBuffer') sum += item.data.byteLength || 0;
          else if (item instanceof ArrayBuffer) sum += item.byteLength;
          else if (ArrayBuffer.isView(item)) sum += item.byteLength;
        }
        if (sum > 0) {
          try {
            const stripped = obj.map(i => (i?.data instanceof ArrayBuffer || i?.data?.__type === 'ArrayBuffer' ? { ...i, data: undefined } : i));
            return sum + new Blob([JSON.stringify(stripped)]).size;
          } catch {
            return sum;
          }
        }
      }
    }
    try {
      const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
      return new Blob([str]).size;
    } catch (e) {
      try {
        return (typeof obj === 'string' ? obj : JSON.stringify(obj)).length * 2;
      } catch (err) {
        return 0;
      }
    }
  };

  // 1. Pages & Scans (LocalDB & Trash pages)
  const pages = (await getLocalPages()) || [];
  const trashPages = (await getLocalKV('trash_pages')) || [];
  const pagesBytes = getByteSize(pages) + getByteSize(trashPages);

  // 2. Flashcards & Topics (including trash cards)
  const cards = (await getLocalCards()) || [];
  const topics = (await getAllLocalTopics()) || [];
  const trashCards = (await getLocalKV('trash_cards')) || [];
  const cardsTopicsBytes = getByteSize(cards) + getByteSize(topics) + getByteSize(trashCards);

  // 3. Study Logs, FSRS History & CAMP Timetable
  const studyLogs = (await getLocalStudyLogs()) || {};
  const studySchedule = (await getLocalStudySchedule()) || {};
  const scheduleTemplates = (await getLocalScheduleTemplates()) || [];
  const campTracker = (await getAllLocalCampRecords()) || [];
  const campDailyLogs = (await getAllLocalCampDailyLogs()) || [];
  let campData = null;
  try {
    campData = await getLocalCampData('camp_data');
  } catch (e) { }
  const timerState = (await getLocalTimerState()) || null;
  const studyLogsBytes =
    getByteSize(studyLogs) +
    getByteSize(studySchedule) +
    getByteSize(scheduleTemplates) +
    getByteSize(campTracker) +
    getByteSize(campDailyLogs) +
    getByteSize(campData) +
    getByteSize(timerState);

  // 4. Textbook PDFs & Master Materials (stored in PYT_DATA and textbooksMetadata)
  const allPytItems = (await getAllLocalItems(STORES.PYT_DATA)) || [];
  const textbooksMetadata = (await getLocalTextbooksMetadata()) || [];
  const pdfItems = [];
  const curriculumTopics = [];
  const processedKeys = new Set();

  // Helper to extract clean subject from key or subject field
  const extractSubject = (keyStr, rawSub) => {
    if (rawSub && !rawSub.toLowerCase().startsWith('pyt_pdf_')) return rawSub;
    const cleanKey = (keyStr || '').toLowerCase().replace(/^pyt_pdf_/, '');
    if (cleanKey.includes('_topic_')) {
      const parts = cleanKey.split('_topic_');
      return parts[0].replace(/_/g, ' ').toUpperCase();
    }
    return cleanKey.replace(/_/g, ' ').toUpperCase() || 'General';
  };

  // Helper to calculate exact byte size of any PDF item or binary field
  const extractPdfBytes = (item, meta) => {
    // 1. Check ArrayBuffer on item.data or item.topics
    if (item?.data instanceof ArrayBuffer && item.data.byteLength > 0) return item.data.byteLength;
    if (ArrayBuffer.isView(item?.data) && item.data.byteLength > 0) return item.data.byteLength;
    if (item?.topics instanceof ArrayBuffer && item.topics.byteLength > 0) return item.topics.byteLength;
    if (ArrayBuffer.isView(item?.topics) && item.topics.byteLength > 0) return item.topics.byteLength;

    // 2. Check serialized Base64 payload
    if (item?.data?.__type === 'ArrayBuffer' && typeof item.data.byteLength === 'number' && item.data.byteLength > 0) {
      return item.data.byteLength;
    }
    if (typeof item?.data?.base64 === 'string' && item.data.base64.length > 0) {
      return Math.round(item.data.base64.length * 0.75);
    }
    if (typeof item?.data === 'string' && item.data.startsWith('data:application/pdf;base64,')) {
      return Math.round((item.data.length - 28) * 0.75);
    }
    if (typeof item?.data === 'string' && item.data.length > 100) {
      return Math.round(item.data.length * 0.75);
    }

    // 3. Check Blob
    if (typeof Blob !== 'undefined' && item?.data instanceof Blob && item.data.size > 0) {
      return item.data.size;
    }

    // 4. Check explicit numeric size properties on item
    if (typeof item?.size === 'number' && item.size > 0) return item.size;
    if (typeof item?.fileSize === 'number' && item.fileSize > 0) return item.fileSize;
    if (typeof item?.bytes === 'number' && item.bytes > 0) return item.bytes;

    // 5. Check metadata fields
    if (typeof meta?.size === 'number' && meta.size > 0) return meta.size;
    if (typeof meta?.fileSize === 'number' && meta.fileSize > 0) return meta.fileSize;
    if (typeof meta?.bytes === 'number' && meta.bytes > 0) return meta.bytes;

    return 0;
  };

  // Process items in pyt_data
  for (const item of allPytItems) {
    const itemKey = (item?.id || item?.key || '').toLowerCase();
    const isPdf = itemKey.startsWith('pyt_pdf_') ||
      item?.data instanceof ArrayBuffer ||
      (item?.data && typeof item.data === 'object' && item.data.__type === 'ArrayBuffer') ||
      item?.fileName ||
      item?.pdfFileName ||
      item?.fileSize;

    if (isPdf) {
      processedKeys.add(itemKey);

      // Find matching metadata
      const cleanSub = (item.subject || '').toLowerCase().replace(/^pyt_pdf_/, '').replace(/\s+/g, '_');
      const meta = textbooksMetadata.find(m => {
        const mId = (m.id || '').toLowerCase();
        const mSub = (m.subject || '').toLowerCase().replace(/\s+/g, '_');
        return mId === itemKey || mSub === cleanSub || `pyt_pdf_${mSub}` === itemKey;
      });

      const bytes = extractPdfBytes(item, meta);
      const subjectName = extractSubject(itemKey, item.subject || meta?.subject);
      const fileName = item.fileName || item.pdfFileName || meta?.fileName || meta?.pdfFileName || meta?.name || item.name || `${subjectName}_Master.pdf`;

      pdfItems.push({
        id: item.id || item.key || `pyt_pdf_${cleanSub}`,
        key: item.key || item.id || `pyt_pdf_${cleanSub}`,
        name: fileName,
        subject: subjectName,
        fileName,
        bytes,
        hasBinary: (item?.data instanceof ArrayBuffer && item.data.byteLength > 0) || (item?.data?.__type === 'ArrayBuffer') || (typeof item?.data === 'string' && item.data.length > 100),
        pageOffset: meta?.pageOffset || item?.pageOffset || 0,
        updatedAt: item.updatedAt || item.uploadedAt || meta?.updatedAt
      });
    } else {
      curriculumTopics.push(item);
    }
  }

  // Also check textbooksMetadata for any registered textbooks that were not in allPytItems
  for (const meta of textbooksMetadata) {
    const metaSub = (meta.subject || '').toLowerCase().replace(/\s+/g, '_');
    const metaKey = (meta.id || `pyt_pdf_${metaSub}`).toLowerCase();

    if (!processedKeys.has(metaKey) && !processedKeys.has(`pyt_pdf_${metaSub}`)) {
      processedKeys.add(metaKey);
      const bytes = extractPdfBytes(null, meta);
      const subjectName = meta.subject || extractSubject(metaKey, '');
      const fileName = meta.fileName || meta.pdfFileName || meta.name || `${subjectName}_Master.pdf`;

      pdfItems.push({
        id: meta.id || metaKey,
        key: metaKey,
        name: fileName,
        subject: subjectName,
        fileName,
        bytes,
        hasBinary: false,
        pageOffset: meta.pageOffset || 0,
        updatedAt: meta.updatedAt
      });
    }
  }

  const textbooksBytes = pdfItems.reduce((sum, f) => sum + f.bytes, 0);

  // 5. PYT & Subject Tracker (Curriculum text, user progress, tracker docs)
  const pytProgress = (await getAllLocalPytProgress()) || [];
  const subjectTracker = (await getLocalSubjectTrackerData()) || [];
  const pytTrackerBytes =
    getByteSize(curriculumTopics) +
    getByteSize(pytProgress) +
    getByteSize(subjectTracker) +
    getByteSize(textbooksMetadata);

  // 6. AI Hints & Custom Prompts
  let topicHints = [];
  try {
    topicHints = (await getAllLocalItems(STORES.TOPIC_HINTS)) || [];
  } catch (e) { }
  const prompts = (await getLocalPrompts()) || [];
  let hintQuotas = [];
  try {
    hintQuotas = (await getAllLocalItems(STORES.HINT_QUOTA)) || [];
  } catch (e) { }
  const aiHintsBytes = getByteSize(topicHints) + getByteSize(prompts) + getByteSize(hintQuotas);

  // 7. Settings & Local Storage
  const settings = (await getAllLocalSettings()) || {};
  let localStorageBytes = 0;
  let localStorageItemCount = 0;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        const val = window.localStorage.getItem(key);
        localStorageBytes += (key ? key.length : 0) + (val ? val.length : 0);
        localStorageItemCount++;
      }
    }
  } catch (e) { }
  const settingsBytes = getByteSize(settings) + localStorageBytes;

  const totalCalculatedBytes =
    textbooksBytes +
    pagesBytes +
    cardsTopicsBytes +
    studyLogsBytes +
    pytTrackerBytes +
    aiHintsBytes +
    settingsBytes;

  const effectiveTotalBytes = Math.max(browserUsage, totalCalculatedBytes);

  return {
    browserUsage,
    browserQuota,
    totalCalculatedBytes,
    effectiveTotalBytes,
    categories: {
      textbooks: {
        id: 'textbooks',
        name: 'Textbook PDFs & Master Materials',
        shortName: 'Textbooks & PDFs',
        color: '#f43f5e', // Rose
        badgeBg: 'bg-rose-500/15',
        badgeText: 'text-rose-500',
        strokeColor: '#f43f5e',
        bytes: textbooksBytes,
        count: pdfItems.length,
        label: `${pdfItems.length} Master & Topic PDFs`,
        clearable: true,
        clearActionType: 'textbooks',
        files: pdfItems
      },
      pages: {
        id: 'pages',
        name: 'Scanned Pages & Images',
        shortName: 'Scans & Images',
        color: '#22c55e', // Emerald
        badgeBg: 'bg-emerald-500/15',
        badgeText: 'text-emerald-500',
        strokeColor: '#22c55e',
        bytes: pagesBytes,
        count: pages.length + trashPages.length,
        label: `${pages.length} Pages (${trashPages.length} in trash)`,
        clearable: false
      },
      cardsTopics: {
        id: 'cardsTopics',
        name: 'Flashcards & Topics',
        shortName: 'Cards & Topics',
        color: '#0ea5e9', // Sky Blue
        badgeBg: 'bg-sky-500/15',
        badgeText: 'text-sky-500',
        strokeColor: '#0ea5e9',
        bytes: cardsTopicsBytes,
        count: cards.length + topics.length + trashCards.length,
        label: `${cards.length} Cards ┬╖ ${topics.length} Topics`,
        clearable: false
      },
      studyLogs: {
        id: 'studyLogs',
        name: 'Study Logs & FSRS History',
        shortName: 'Logs & Timetable',
        color: '#6366f1', // Indigo
        badgeBg: 'bg-indigo-500/15',
        badgeText: 'text-indigo-500',
        strokeColor: '#6366f1',
        bytes: studyLogsBytes,
        count: Object.keys(studyLogs).length + campTracker.length + campDailyLogs.length,
        label: `${Object.keys(studyLogs).length} Review Days ┬╖ CAMP Logs`,
        clearable: false
      },
      pytTracker: {
        id: 'pytTracker',
        name: 'PYT Curriculum & Progress',
        shortName: 'PYT & Curriculum',
        color: '#f59e0b', // Amber
        badgeBg: 'bg-amber-500/15',
        badgeText: 'text-amber-500',
        strokeColor: '#f59e0b',
        bytes: pytTrackerBytes,
        count: curriculumTopics.length + subjectTracker.length,
        label: `${curriculumTopics.length} PYT Subjects ┬╖ ${subjectTracker.length} Tracker Docs`,
        clearable: false
      },
      aiHints: {
        id: 'aiHints',
        name: 'AI Hints & Concept Cache',
        shortName: 'AI Hints & Cache',
        color: '#14b8a6', // Teal
        badgeBg: 'bg-teal-500/15',
        badgeText: 'text-teal-500',
        strokeColor: '#14b8a6',
        bytes: aiHintsBytes,
        count: topicHints.length + prompts.length,
        label: `${topicHints.length} Cached Hints ┬╖ ${prompts.length} Prompts`,
        clearable: true,
        clearActionType: 'aiHints'
      },
      settings: {
        id: 'settings',
        name: 'App Settings & Local Storage',
        shortName: 'Settings & Cache',
        color: '#a855f7', // Purple
        badgeBg: 'bg-purple-500/15',
        badgeText: 'text-purple-500',
        strokeColor: '#a855f7',
        bytes: settingsBytes,
        count: Object.keys(settings).length + localStorageItemCount,
        label: `${Object.keys(settings).length} Config Keys ┬╖ ${localStorageItemCount} Local Items`,
        clearable: false
      }
    }
  };
}

/**
 * Safely purges an individual textbook PDF from IndexedDB and updates metadata.
 */
export async function deleteLocalTextbookPdf(keyOrId) {
  if (!keyOrId) return false;
  const cleanKey = keyOrId.trim().toLowerCase();
  const nowIso = new Date().toISOString();
  await deleteLocalPytTopic(cleanKey);
  await recordTombstone('textbook_metadata', cleanKey, { deletedAt: nowIso });
  const meta = (await getLocalTextbooksMetadata()) || [];
  const filtered = meta.filter(m =>
    (m.id || '').toLowerCase() !== cleanKey &&
    `pyt_pdf_${(m.subject || '').toLowerCase().replace(/\s+/g, '_')}` !== cleanKey
  );
  await saveLocalTextbooksMetadata(filtered);
  return true;
}

/**
 * Purges all textbook PDF files from IndexedDB while preserving curriculum topics and progress.
 */
export async function clearAllTextbookPdfsLocal() {
  try {
    const allPytItems = (await getAllLocalItems(STORES.PYT_DATA)) || [];
    for (const item of allPytItems) {
      const key = item?.id || item?.key || '';
      if (key.startsWith('pyt_pdf_') || key.startsWith('pyt_topic_pdf_') || item?.data instanceof ArrayBuffer || item?.data?.__type === 'ArrayBuffer') {
        await deleteLocalPytTopic(key);
      }
    }
    await saveLocalTextbooksMetadata([]);
    return true;
  } catch (e) {
    console.error('[LocalDB] Failed to clear textbook PDFs:', e);
    return false;
  }
}

/**
 * Safely purges cached AI topic hints to reclaim storage space without touching user cards or logs.
 */
export async function clearAiHintsCacheLocal() {
  try {
    await clearLocalStore(STORES.TOPIC_HINTS);
  } catch (e) {
    console.warn('[LocalDB] Could not clear TOPIC_HINTS store directly:', e);
  }
  // Also clear cached recommendations from KV store
  try {
    const allKv = (await getAllLocalItems(STORES.KV_STORE)) || [];
    for (const item of allKv) {
      if (item && item.key && (item.key.startsWith('topic_hints_') || item.key.startsWith('ai_recommendations_'))) {
        await deleteLocalItem(STORES.KV_STORE, item.key);
      }
    }
  } catch (e) {
    console.warn('[LocalDB] Error purging KV topic hint keys:', e);
  }
  return true;
}

/**
 * Permanently clears all soft-deleted pages and cards from the Recycle Bin.
 */
export async function purgeRecycleBinLocal() {
  await setLocalKV('trash_pages', []);
  await setLocalKV('trash_cards', []);
  await setLocalKV('trash_topics', []);
  await setLocalKV('trash_study_logs', []);
  await setLocalKV('trash_camp', []);
  await setLocalKV('trash_prompts', []);
  await setLocalKV('trash_schedule_templates', []);

  // Prune unified_graves: retain tombstones from recent 90 days to keep database lean
  try {
    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const graves = (await getUnifiedGraves()) || [];
    const prunedGraves = graves.filter(g => {
      if (!g || !g.deletedAt) return false;
      const delTime = new Date(g.deletedAt).getTime();
      return !isNaN(delTime) && (now - delTime) < ninetyDaysMs;
    });
    await saveUnifiedGraves(prunedGraves);
  } catch (e) {
    console.warn('[LocalDB] Could not prune unified_graves on recycle bin purge:', e);
  }

  return true;
}

// ==========================================
// UNIVERSAL SNAPSHOT ENGINE (v2.0)
// ==========================================

/**
 * SNAPSHOT BUNDLE IDENTIFIERS
 * Maps logical bundle names to their store/key sources for granular export/import.
 */
export const SNAPSHOT_BUNDLES = {
  cards_fsrs: 'cards_fsrs',
  topics_curriculum: 'topics_curriculum',
  study_logs_velocity: 'study_logs_velocity',
  scans_media: 'scans_media',
  settings_prompts: 'settings_prompts',
  recycle_bin: 'recycle_bin',
};

export const LS_KEYS_TO_SNAPSHOT = [
  'pyt_gemini_api_key',
  'pyt_imgbb_api_key',
  'pyt_github_username',
  'pyt_github_repo',
  'pyt_github_pat',
  'pyt_auto_backup_enabled',
  'pyt_auto_backup_freq',
  'pyt_auto_backup_ret',
  'pyt_settings_theme_mode',
  'pyt_image_storage_mode',
  'pyt_ai_feature_models',
  'local_device_id',
  'obs_device_id',
  'obs_paired_uid',
  'auto_anki_exam_profiles',
  'study_room_layout_prefs',
  'fs_quick_notes',
  'stopwatch_show_milliseconds',
  'dashboard_daily_card_target',
  'dashboard_daily_hours_target',
  'camp_student_info',
  'camp_history',
  'camp_timer_history',
];

/**
 * Computes a fast FNV-1a 32-bit checksum from a JSON string.
 * Used for snapshot integrity validation.
 * @param {string} str
 * @returns {string} Hex checksum string
 */
function computeChecksum(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Efficiently converts an ArrayBuffer/TypedArray to a Base64 string in chunks to avoid call stack limits.
 */
export function arrayBufferToBase64(buffer) {
  if (!buffer) return '';
  const bytes = buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : ArrayBuffer.isView(buffer)
      ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : null;
  if (!bytes) return '';
  let binary = '';
  const len = bytes.byteLength;
  const CHUNK_SIZE = 0x8000; // 32KB chunks
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * Converts a Base64 string back to a native ArrayBuffer.
 */
export function base64ToArrayBuffer(base64) {
  if (!base64 || typeof base64 !== 'string') return new ArrayBuffer(0);
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (e) {
    console.warn('[LocalDB] Failed to decode base64 buffer:', e);
    return new ArrayBuffer(0);
  }
}

/**
 * Recursively scans and serializes any ArrayBuffer / TypedArray into JSON-safe Base64 objects.
 */
export function serializeBinaryValues(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (obj instanceof ArrayBuffer) {
    return {
      __type: 'ArrayBuffer',
      base64: arrayBufferToBase64(obj),
      byteLength: obj.byteLength
    };
  }

  if (ArrayBuffer.isView(obj)) {
    return {
      __type: 'TypedArray',
      viewType: obj.constructor.name,
      base64: arrayBufferToBase64(obj),
      byteLength: obj.byteLength
    };
  }

  if (Array.isArray(obj)) {
    return obj.map(item => serializeBinaryValues(item));
  }

  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = serializeBinaryValues(v);
  }
  return result;
}

/**
 * Recursively scans and reconstructs any serialized Base64 objects back into native ArrayBuffers.
 */
export function deserializeBinaryValues(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (obj.__type === 'ArrayBuffer' && typeof obj.base64 === 'string') {
    return base64ToArrayBuffer(obj.base64);
  }

  if (obj.__type === 'TypedArray' && typeof obj.base64 === 'string') {
    const ab = base64ToArrayBuffer(obj.base64);
    if (obj.viewType === 'Uint8Array') return new Uint8Array(ab);
    return ab;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deserializeBinaryValues(item));
  }

  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = deserializeBinaryValues(v);
  }
  return result;
}

/**
 * Reads ALL entries from a given object store into a plain array with binary data safely serialized.
 */
async function dumpStore(storeName, options = {}) {
  try {
    const items = (await getAllLocalItems(storeName)) || [];
    if (storeName === STORES.KV_STORE && !options.includeMedia) {
      const sanitized = items.map(item => {
        if (item && (item.key === 'pages' || item.key === 'trash_pages') && Array.isArray(item.value)) {
          return {
            ...item,
            value: item.value.map(p => {
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
            })
          };
        }
        return item;
      });
      return serializeBinaryValues(sanitized);
    }
    return serializeBinaryValues(items);
  } catch (e) {
    console.warn(`[LocalDB] dumpStore(${storeName}) failed:`, e);
    return [];
  }
}

/**
 * Exports a COMPLETE zero-loss universal snapshot of all 9 IndexedDB stores
 * and all synchronized localStorage keys into a single structured payload.
 *
 * @param {object} [options] - Export options
 * @param {boolean} [options.includeMedia=false] - Whether to embed heavy image assets directly in the JSON snapshot
 * @returns {Promise<object>} Full snapshot object ready for JSON.stringify
 */
export async function exportFullUniversalSnapshot(options = {}) {
  const includeMedia = options.includeMedia === true;
  // 1. Dump all 10 IndexedDB object stores (binary-safe)
  const [
    topicsRaw,
    settingsRaw,
    campTrackerRaw,
    campDataRaw,
    campDailyLogsRaw,
    pytDataRaw,
    kvStoreRaw,
    topicHintsRaw,
    hintQuotaRaw,
    snapshotsRaw,
  ] = await Promise.all([
    dumpStore(STORES.TOPICS, { includeMedia }),
    dumpStore(STORES.SETTINGS, { includeMedia }),
    dumpStore(STORES.CAMP_TRACKER, { includeMedia }),
    dumpStore(STORES.CAMP_DATA, { includeMedia }),
    dumpStore(STORES.CAMP_DAILY_LOGS, { includeMedia }),
    dumpStore(STORES.PYT_DATA, { includeMedia }),
    dumpStore(STORES.KV_STORE, { includeMedia }),
    dumpStore(STORES.TOPIC_HINTS, { includeMedia }),
    dumpStore(STORES.HINT_QUOTA, { includeMedia }),
    dumpStore(STORES.SNAPSHOTS, { includeMedia }),
  ]);

  // 2. Capture all 27 synchronized localStorage keys
  const localStorageSnapshot = {};
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      LS_KEYS_TO_SNAPSHOT.forEach(key => {
        const val = localStorage.getItem(key);
        if (val !== null) localStorageSnapshot[key] = val;
      });
      // Also capture all camp_sessions_* and camp_bedToBook_* dynamic keys
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && (k.startsWith('camp_sessions_') || k.startsWith('camp_bedToBook_'))) {
          localStorageSnapshot[k] = window.localStorage.getItem(k);
        }
      }
    }
  } catch (e) {
    console.warn('[LocalDB] Could not read localStorage for snapshot:', e);
  }

  const payload = {
    meta: {
      version: '2.0',
      engine: 'AutoAnki FSRS-6 Unified Vault',
      timestamp: new Date().toISOString(),
      schemaVersion: DB_VERSION,
    },
    stores: {
      topics: topicsRaw,
      settings: settingsRaw,
      camp_tracker: campTrackerRaw,
      camp_data: campDataRaw,
      camp_daily_logs: campDailyLogsRaw,
      pyt_data: pytDataRaw,
      kv_store: kvStoreRaw,
      topic_hints: topicHintsRaw,
      hint_quota: hintQuotaRaw,
      snapshots: snapshotsRaw,
    },
    localStorageSnapshot,
  };

  // 3. Compute FNV-1a checksum over the stores payload
  try {
    const checksumInput = JSON.stringify(payload.stores);
    payload.meta.checksum = computeChecksum(checksumInput);
  } catch (e) {
    payload.meta.checksum = 'unavailable';
  }

  return payload;
}

/**
 * Verifies a snapshot payload's integrity checksum.
 * @param {object} payload
 * @returns {{ valid: boolean, reason: string }}
 */
export function verifySnapshotChecksum(payload) {
  if (!payload?.meta?.checksum || !payload?.stores) {
    return { valid: false, reason: 'Missing checksum or stores.' };
  }
  if (payload.meta.checksum === 'unavailable') {
    return { valid: true, reason: 'Checksum unavailable (legacy snapshot).' };
  }
  try {
    const computed = computeChecksum(JSON.stringify(payload.stores));
    return computed === payload.meta.checksum
      ? { valid: true, reason: 'Checksum verified.' }
      : { valid: false, reason: `Checksum mismatch. Expected ${payload.meta.checksum}, got ${computed}.` };
  } catch (e) {
    return { valid: false, reason: 'Checksum computation error: ' + e.message };
  }
}

/**
 * Imports a universal snapshot payload into IndexedDB and localStorage.
 *
 * @param {object} payload     - Full snapshot exported by exportFullUniversalSnapshot
 * @param {'merge'|'replace'}  strategy     - 'merge' (non-destructive) | 'replace' (atomic clear + hydrate)
 * @param {string[]|'all'}     selectedBundles - Bundle IDs to restore, or 'all'
 * @param {Function}           [onProgress]  - Optional progress callback (step, total, message)
 * @returns {Promise<{success: boolean, restored: string[], errors: string[]}>}
 */
export async function importUniversalSnapshot(payload, strategy = 'merge', selectedBundles = 'all', onProgress = null) {
  const report = { success: false, restored: [], errors: [] };
  const emit = (step, total, msg) => { if (onProgress) onProgress(step, total, msg); };
  const bundles = selectedBundles === 'all' ? Object.keys(SNAPSHOT_BUNDLES) : selectedBundles;

  // Helper: bulk put an array of records into a store
  const bulkPut = async (storeName, records) => {
    if (!Array.isArray(records) || records.length === 0) return;
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      records.forEach(r => { if (r) store.put(r); });
    });
  };

  // Helper: single-transaction atomic clear then put
  const atomicClearAndPut = async (storeName, records) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        if (Array.isArray(records) && records.length > 0) {
          records.forEach(r => { if (r) store.put(r); });
        }
      };
      clearReq.onerror = () => reject(clearReq.error);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error(`Atomic transaction aborted on store: ${storeName}`));
    });
  };

  // Helper: merge KV entries by key (put each one ΓÇö IDB put is upsert)
  const mergeKV = async (records) => {
    if (!Array.isArray(records) || records.length === 0) return;
    for (const r of records) { if (r && r.key) await putLocalItem(STORES.KV_STORE, r); }
  };

  // Deserialize any binary Base64 payloads into native ArrayBuffers
  const rawStores = payload?.stores || {};
  const stores = deserializeBinaryValues(rawStores);
  const kv = stores.kv_store || [];

  // Helper: get KV entries for given keys
  const kvSubset = (keys) => kv.filter(r => r && keys.includes(r.key));

  const totalSteps = bundles.length + 2; // bundles + settings + localStorage
  let step = 0;
  // FIX-01C: Inline safe timestamp parser to prevent circular imports
  const _sts = (v) => {
    if (!v) return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const p = new Date(v).getTime();
    return isNaN(p) ? 0 : p;
  };

  try {
    // ── Bundle: cards_fsrs ─────────────────────────────────────────────
    if (bundles.includes('cards_fsrs')) {
      emit(++step, totalSteps, 'Restoring Flashcards & FSRS States…');
      const cardKv = kvSubset(['flashcards']);
      if (strategy === 'replace') {
        // Remove flashcards KV entry then put incoming
        await deleteLocalItem(STORES.KV_STORE, 'flashcards');
        for (const r of cardKv) await putLocalItem(STORES.KV_STORE, r);
      } else {
        // Merge: union by card.id with timestamp & trash awareness
        const existing = await getLocalCards();
        const incoming = cardKv.find(r => r.key === 'flashcards')?.value || [];
        const localTrashCards = (await getLocalKV('trash_cards')) || [];
        // FIX-01: Use _sts on deletedAt to prevent string-vs-number comparison bug
        const trashMap = new Map((localTrashCards || []).filter(tc => tc && tc.id).map(tc => [tc.id, _sts(tc.deletedAt)]));
        const map = new Map((existing || []).filter(c => c && c.id).map(c => [c.id, c]));

        incoming.forEach(c => {
          if (!c || !c.id) return;
          const localDeletedAt = trashMap.get(c.id);
          const incomingCardTime = _sts(c.updatedAt || c.lastReviewDate || c.createdAt);
          if (localDeletedAt && localDeletedAt > incomingCardTime) return;

          if (!map.has(c.id)) {
            map.set(c.id, c);
          } else {
            const current = map.get(c.id);
            const currentTs = _sts(current.updatedAt || current.lastReviewDate || current.createdAt);
            const incomingTs = incomingCardTime;
            if (incomingTs >= currentTs) {
              map.set(c.id, { ...current, ...c });
            }
          }
        });
        await setLocalKV('flashcards', Array.from(map.values()));
      }
      report.restored.push('cards_fsrs');
    }

    // ── Bundle: topics_curriculum ─────────────────────────────────────
    if (bundles.includes('topics_curriculum')) {
      emit(++step, totalSteps, 'Restoring Curriculum Topics & PYT Progress…');
      if (strategy === 'replace') {
        if (stores.topics) await atomicClearAndPut(STORES.TOPICS, stores.topics);
        if (stores.pyt_data) await atomicClearAndPut(STORES.PYT_DATA, stores.pyt_data);
        // subject_tracker_data, pyt_user_progress are KV keys
        const trackerKvs = kvSubset(['subject_tracker_data', 'pyt_user_progress', 'textbooks_metadata']);
        for (const r of trackerKvs) await putLocalItem(STORES.KV_STORE, r);
      } else {
        // Merge topics by id with timestamp/reviewCount awareness
        if (Array.isArray(stores.topics)) {
          const existingTopics = (await getAllLocalItems(STORES.TOPICS)) || [];
          const topicMap = new Map((existingTopics || []).filter(t => t && t.id).map(t => [t.id, t]));
          stores.topics.forEach(t => {
            if (!t || !t.id) return;
            if (!topicMap.has(t.id)) {
              topicMap.set(t.id, t);
            } else {
              const current = topicMap.get(t.id);
              const currentTs = _sts(current.updatedAt || current.lastReviewDate || current.createdAt);
              const incomingTs = _sts(t.updatedAt || t.lastReviewDate || t.createdAt);
              if (incomingTs >= currentTs) {
                topicMap.set(t.id, { ...current, ...t });
              }
            }
          });
          await bulkPut(STORES.TOPICS, Array.from(topicMap.values()));
        }
        if (Array.isArray(stores.pyt_data)) await bulkPut(STORES.PYT_DATA, stores.pyt_data);
        await mergeKV(kvSubset(['subject_tracker_data', 'pyt_user_progress', 'textbooks_metadata']));
      }
      report.restored.push('topics_curriculum');
    }

    // ── Bundle: study_logs_velocity ───────────────────────────────────
    if (bundles.includes('study_logs_velocity')) {
      emit(++step, totalSteps, 'Restoring Study Logs & Velocity Telemetry…');
      if (strategy === 'replace') {
        if (stores.camp_tracker) await atomicClearAndPut(STORES.CAMP_TRACKER, stores.camp_tracker);
        if (stores.camp_data) await atomicClearAndPut(STORES.CAMP_DATA, stores.camp_data);
        if (stores.camp_daily_logs) await atomicClearAndPut(STORES.CAMP_DAILY_LOGS, stores.camp_daily_logs);
        const logKvs = kvSubset(['study_logs', 'study_schedule', 'schedule_templates', 'timerState', 'active_new_topics_today']);
        for (const r of logKvs) await putLocalItem(STORES.KV_STORE, r);
        // Also restore dynamic KV keys (active_new_topics_ and ai_recommendations_)
        const campDynamic = kv.filter(r => r && (r.key?.startsWith('active_new_topics_') || r.key?.startsWith('ai_recommendations_')));
        for (const r of campDynamic) await putLocalItem(STORES.KV_STORE, r);
      } else {
        // Merge: deep-merge daily logs with fsrsLogs combination & unified property naming
        if (Array.isArray(stores.camp_tracker)) await bulkPut(STORES.CAMP_TRACKER, stores.camp_tracker);
        if (Array.isArray(stores.camp_data)) await bulkPut(STORES.CAMP_DATA, stores.camp_data);
        if (Array.isArray(stores.camp_daily_logs)) await bulkPut(STORES.CAMP_DAILY_LOGS, stores.camp_daily_logs);
        const studyLogsKv = kv.find(r => r?.key === 'study_logs');
        if (studyLogsKv) {
          const existing = await getLocalStudyLogs();
          const incoming = (typeof studyLogsKv.value === 'object' && studyLogsKv.value) ? studyLogsKv.value : {};
          const mergedLogs = { ...existing };
          for (const [dateKey, incDay] of Object.entries(incoming)) {
            if (!mergedLogs[dateKey]) {
              mergedLogs[dateKey] = incDay;
            } else {
              const curDay = mergedLogs[dateKey];
              // FIX-02: Use LWW based on updatedAt for scalar values instead of Math.max
              const curTime = _sts(curDay.updatedAt);
              const incTime = _sts(incDay.updatedAt);
              const isIncFresher = incTime > curTime;
              const fresherDay = isIncFresher ? incDay : curDay;
              const olderDay = isIncFresher ? curDay : incDay;

              const combinedFsrs = [...(curDay.fsrsLogs || []), ...(incDay.fsrsLogs || [])];
              const seenLogKeys = new Set();
              const dedupedFsrs = combinedFsrs.filter(log => {
                const k = `${log.cardId || log.topicName || ''}_${log.timestamp || log.dateStr || ''}`;
                if (seenLogKeys.has(k)) return false;
                seenLogKeys.add(k);
                return true;
              });

              const totalCards = fresherDay.totalCardsReviewed ?? fresherDay.cards ?? (olderDay.totalCardsReviewed ?? olderDay.cards ?? dedupedFsrs.length);
              const totalQuestions = fresherDay.totalQuestionsAttempted ?? fresherDay.questions ?? (olderDay.totalQuestionsAttempted ?? olderDay.questions ?? 0);
              const totalHours = fresherDay.studyHours ?? fresherDay.hours ?? (olderDay.studyHours ?? olderDay.hours ?? 0);

              mergedLogs[dateKey] = {
                ...olderDay,
                ...fresherDay,
                totalCardsReviewed: totalCards,
                cards: totalCards,
                totalQuestionsAttempted: totalQuestions,
                questions: totalQuestions,
                studyHours: totalHours,
                hours: totalHours,
                fsrsLogs: dedupedFsrs,
                updatedAt: new Date(Math.max(curTime, incTime) || Date.now()).toISOString()
              };
            }
          }
          await setLocalKV('study_logs', mergedLogs);
        }
        // Also merge dynamic KV keys (active_new_topics_ and ai_recommendations_)
        const campDynamic = kv.filter(r => r && (r.key?.startsWith('active_new_topics_') || r.key?.startsWith('ai_recommendations_')));
        for (const r of campDynamic) {
          const loc = await getLocalItem(STORES.KV_STORE, r.key);
          if (!loc || _sts(r.updatedAt) >= _sts(loc.updatedAt)) {
            await putLocalItem(STORES.KV_STORE, r);
          }
        }
        await mergeKV(kvSubset(['study_schedule', 'schedule_templates', 'timerState']));
      }
      report.restored.push('study_logs_velocity');
    }

    // ── Bundle: scans_media ───────────────────────────────────────────
    if (bundles.includes('scans_media')) {
      emit(++step, totalSteps, 'Restoring Scanned Pages & Textbook Metadata…');
      const pagesKvs = kvSubset(['pages', 'textbooks_metadata']);
      if (strategy === 'replace') {
        await deleteLocalItem(STORES.KV_STORE, 'pages');
        for (const r of pagesKvs) await putLocalItem(STORES.KV_STORE, r);
      } else {
        // Merge pages by id with trash awareness
        const existing = (await getLocalPages()) || [];
        const incoming = pagesKvs.find(r => r.key === 'pages')?.value || [];
        const localTrashPages = (await getLocalKV('trash_pages')) || [];
        // FIX-01B: Use _sts on deletedAt
        const trashMap = new Map((localTrashPages || []).filter(tp => tp && tp.id).map(tp => [tp.id, _sts(tp.deletedAt)]));
        const map = new Map((existing || []).filter(p => p && p.id).map(p => [p.id, p]));
        incoming.forEach(p => {
          if (!p || !p.id) return;
          const localDeletedAt = trashMap.get(p.id);
          const incomingPageTime = _sts(p.updatedAt || p.createdAt);
          if (localDeletedAt && localDeletedAt > incomingPageTime) return;
          if (!map.has(p.id)) {
            map.set(p.id, p);
          } else {
            // FIX-01B: Preserve media assets on merge
            const currentP = map.get(p.id);
            const currentPTime = _sts(currentP.updatedAt || currentP.createdAt);
            const winner = incomingPageTime >= currentPTime ? p : currentP;
            map.set(p.id, {
              ...currentP,
              ...p,
              ...winner,
              data: winner.data || currentP.data || p.data,
              imageUrl: winner.imageUrl || currentP.imageUrl || p.imageUrl,
              originalImage: winner.originalImage || currentP.originalImage || p.originalImage,
              base64: winner.base64 || currentP.base64 || p.base64,
              hasMedia: winner.hasMedia || currentP.hasMedia || p.hasMedia || false
            });
          }
        });
        await setLocalKV('pages', Array.from(map.values()));
        await mergeKV(kvSubset(['textbooks_metadata']));
      }
      report.restored.push('scans_media');
    }

    // ── Bundle: settings_prompts ──────────────────────────────────────
    if (bundles.includes('settings_prompts')) {
      emit(++step, totalSteps, 'Restoring FSRS-6 Config, API Keys & Prompts…');
      if (strategy === 'replace') {
        if (stores.settings) await atomicClearAndPut(STORES.SETTINGS, stores.settings);
        if (stores.hint_quota) await atomicClearAndPut(STORES.HINT_QUOTA, stores.hint_quota);
        if (stores.topic_hints) await atomicClearAndPut(STORES.TOPIC_HINTS, stores.topic_hints);
        if (stores.snapshots) await atomicClearAndPut(STORES.SNAPSHOTS, stores.snapshots);
        const aiRecs = kv.filter(r => r && r.key?.startsWith('ai_recommendations_'));
        for (const r of aiRecs) await putLocalItem(STORES.KV_STORE, r);
        await mergeKV(kvSubset(['custom_prompts', 'local_user_profile']));
      } else {
        // Merge: put all settings (upsert by key — non-destructive)
        if (Array.isArray(stores.settings)) await bulkPut(STORES.SETTINGS, stores.settings);
        if (Array.isArray(stores.topic_hints)) await bulkPut(STORES.TOPIC_HINTS, stores.topic_hints);
        if (Array.isArray(stores.hint_quota)) await bulkPut(STORES.HINT_QUOTA, stores.hint_quota);
        if (Array.isArray(stores.snapshots) && stores.snapshots.length > 0) {
          const existingSnapshots = (await getAllLocalItems(STORES.SNAPSHOTS)) || [];
          const snapMap = new Map((existingSnapshots || []).filter(s => s && s.id).map(s => [s.id, s]));
          stores.snapshots.forEach(s => {
            if (s && s.id && !snapMap.has(s.id)) snapMap.set(s.id, s);
          });
          await bulkPut(STORES.SNAPSHOTS, Array.from(snapMap.values()));
        }
        const aiRecs = kv.filter(r => r && r.key?.startsWith('ai_recommendations_'));
        for (const r of aiRecs) {
          const loc = await getLocalItem(STORES.KV_STORE, r.key);
          if (!loc || _sts(r.updatedAt) >= _sts(loc.updatedAt)) {
            await putLocalItem(STORES.KV_STORE, r);
          }
        }
        await mergeKV(kvSubset(['custom_prompts', 'local_user_profile']));
      }
      report.restored.push('settings_prompts');
    }

    // ── Bundle: recycle_bin ───────────────────────────────────────────
    if (bundles.includes('recycle_bin')) {
      emit(++step, totalSteps, 'Restoring Recycle Bin…');
      // FIX-04: Include trash_camp, trash_prompts, and unified_graves in restore
      const trashKvs = kvSubset(['trash_pages', 'trash_cards', 'trash_topics', 'trash_study_logs', 'trash_camp', 'trash_prompts', 'unified_graves']);
      if (strategy === 'replace') {
        for (const r of trashKvs) {
          if (r.key === 'unified_graves') {
            await saveUnifiedGraves(r.value || []);
          } else {
            await putLocalItem(STORES.KV_STORE, r);
          }
        }
      } else {
        // Merge trash: union by id or dateKey
        for (const r of trashKvs) {
          if (r.key === 'unified_graves') {
            const existingGraves = (await getUnifiedGraves()) || [];
            const gravesMap = new Map((existingGraves || []).filter(g => g && g.entityType && g.entityId).map(g => [`${g.entityType}::${g.entityId}`, g]));
            (r.value || []).forEach(g => {
              if (g && g.entityType && g.entityId) {
                const k = `${g.entityType}::${g.entityId}`;
                const ex = gravesMap.get(k);
                if (!ex || _sts(g.deletedAt) > _sts(ex.deletedAt)) {
                  gravesMap.set(k, g);
                }
              }
            });
            await saveUnifiedGraves(Array.from(gravesMap.values()));
          } else {
            const existing = (await getLocalKV(r.key)) || [];
            const incoming = r.value || [];
            const map = new Map((existing || []).filter(x => x && (x.id || x.dateKey)).map(x => [x.id || x.dateKey, x]));
            incoming.forEach(x => {
              const k = x?.id || x?.dateKey;
              if (x && k && !map.has(k)) map.set(k, x);
            });
            await setLocalKV(r.key, Array.from(map.values()));
          }
        }
      }
      report.restored.push('recycle_bin');
    }

    // ── Restore localStorage snapshot ────────────────────────────────
    emit(++step, totalSteps, 'Restoring LocalStorage preferences…');
    const lsSnap = payload.localStorageSnapshot;
    if (lsSnap && typeof lsSnap === 'object') {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          Object.entries(lsSnap).forEach(([k, v]) => {
            if (strategy === 'replace' || localStorage.getItem(k) === null || k.startsWith('camp_')) {
              if (v !== null && v !== undefined) localStorage.setItem(k, v);
            }
          });
        }
      } catch (e) {
        report.errors.push('localStorage restore failed: ' + e.message);
      }
    }

    // Hydrate CAMP data directly from restored stores into browser storage
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (Array.isArray(stores.camp_data)) {
          const hist = stores.camp_data.find(d => d && d.key === 'history');
          if (hist && hist.data) localStorage.setItem('camp_history', JSON.stringify(hist.data));
          const th = stores.camp_data.find(d => d && d.key === 'timer_history');
          if (th && th.data) localStorage.setItem('camp_timer_history', JSON.stringify(th.data));
          const si = stores.camp_data.find(d => d && d.key === 'student_info');
          if (si && si.data) localStorage.setItem('camp_student_info', JSON.stringify(si.data));
        }
        if (Array.isArray(stores.camp_daily_logs)) {
          stores.camp_daily_logs.forEach(log => {
            if (log && log.dateStr) {
              if (log.sessions) localStorage.setItem(`camp_sessions_${log.dateStr}`, JSON.stringify(log.sessions));
              if (log.bedToBook) localStorage.setItem(`camp_bedToBook_${log.dateStr}`, log.bedToBook);
            }
          });
        }
        window.dispatchEvent(new CustomEvent('gdrive-data-hydrated'));
      }
    } catch (e) {
      console.warn('[LocalDB] Error hydrating CAMP cache after import:', e);
    }

    // Check if any restored pages require media asset download from Google Drive
    try {
      const restoredPages = (await getLocalPages()) || [];
      const hasMissingMedia = restoredPages.some(p => p && p.hasMedia && !p.imageUrl && !p.base64 && !p.data);
      if (hasMissingMedia) {
        report.mediaSyncRequired = true;
      }
    } catch (e) {}

    emit(++step, totalSteps, 'Done!');
    report.success = true;
  } catch (err) {
    console.error('[LocalDB] importUniversalSnapshot error:', err);
    report.errors.push(err.message || String(err));
  }

  return report;
}

// ==========================================
// INTERNAL SNAPSHOT VAULT HELPERS
// ==========================================

/**
 * Saves a full snapshot into the internal IDB vault.
 *
 * @param {string} label - Snapshot label: 'auto', 'manual', or custom string
 * @param {object} [customPayload] - If provided, uses this instead of generating a fresh snapshot
 * @returns {Promise<object>} Saved snapshot manifest
 */
export async function saveInternalSnapshot(label = 'auto', customPayload = null) {
  // FIX-05: Exclude heavy media from internal automatic snapshots to prevent IndexedDB storage bloat
  const payload = customPayload || (await exportFullUniversalSnapshot({ includeMedia: false }));
  const id = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let byteSize = 0;
  try {
    byteSize = new Blob([JSON.stringify(payload)]).size;
  } catch (e) {
    byteSize = JSON.stringify(payload).length * 2;
  }

  const manifest = {
    id,
    label,
    createdAt: new Date().toISOString(),
    byteSize,
    meta: payload.meta,
    payload,
  };

  await putLocalItem(STORES.SNAPSHOTS, manifest);
  try {
    await pruneOldSnapshots(3);
  } catch (err) {
    console.warn('[LocalDB] Automatic snapshot pruning warning:', err);
  }
  return manifest;
}

/**
 * Retrieves all internal snapshots sorted by createdAt descending (newest first).
 * @returns {Promise<object[]>}
 */
export async function getAllInternalSnapshots() {
  try {
    const all = (await getAllLocalItems(STORES.SNAPSHOTS)) || [];
    return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (e) {
    console.error('[LocalDB] getAllInternalSnapshots error:', e);
    return [];
  }
}

/**
 * Deletes a single internal snapshot by its id.
 * @param {string} id
 */
export async function deleteInternalSnapshot(id) {
  return deleteLocalItem(STORES.SNAPSHOTS, id);
}

/**
 * Prunes old internal snapshots to enforce a retention policy.
 * Keeps the `maxCount` most recent snapshots and deletes the rest.
 * @param {number} maxCount
 */
export async function pruneOldSnapshots(maxCount = 3) {
  const all = await getAllInternalSnapshots();
  if (all.length <= maxCount) return;
  const toDelete = all.slice(maxCount);
  for (const snap of toDelete) {
    await deleteInternalSnapshot(snap.id);
  }
}

export default {
  initDB,
  STORES,
  SNAPSHOT_BUNDLES,
  getLocalItem,
  putLocalItem,
  deleteLocalItem,
  getAllLocalItems,
  clearLocalStore,
  saveLocalSetting,
  getLocalSetting,
  getAllLocalSettings,
  saveLocalCampRecord,
  getLocalCampRecord,
  getAllLocalCampRecords,
  getLocalCampData,
  saveLocalCampData,
  getLocalCampDailyLogs,
  saveLocalCampDailyLogs,
  getAllLocalCampDailyLogs,
  getLocalUserProfile,
  saveLocalUserProfile,
  setLocalKV,
  getLocalKV,
  getLocalCards,
  saveLocalCards,
  replaceAllLocalCards,
  saveLocalCard,
  deleteLocalCard,
  getLocalPages,
  getLocalPageById,
  deduplicatePageMedia,
  saveLocalPages,
  replaceAllLocalPages,
  saveLocalPage,
  deleteLocalPage,
  getLocalPrompts,
  replaceAllLocalPrompts,
  saveLocalPrompts,
  saveLocalPrompt,
  deleteLocalPrompt,
  saveLocalPytTopic,
  getLocalPytTopic,
  getAllLocalPytTopics,
  deleteLocalPytTopic,
  getAllLocalPytProgress,
  saveLocalPytProgressDoc,
  deleteLocalPytProgressDoc,
  getLocalTextbooksMetadata,
  saveLocalTextbooksMetadata,
  getLocalStudyLogs,
  getTrashStudyLogs,
  saveTrashStudyLogs,
  deleteLocalStudyLog,
  deleteLocalStudyLogEntry,
  saveLocalStudyLog,
  replaceAllLocalStudyLogs,
  getLocalSubjectTrackerData,
  saveLocalSubjectTrackerDoc,
  replaceAllLocalSubjectTrackerData,
  getLocalStudySchedule,
  saveLocalScheduleEntry,
  deleteLocalScheduleEntry,
  replaceAllLocalStudySchedule,
  DEFAULT_FSRS_CONFIG,
  getFSRSConfig,
  saveFSRSConfig,
  getAiTopicRecommendations,
  saveAiTopicRecommendations,
  getActiveNewTopicIds,
  saveActiveNewTopicIds,
  getLocalTimerState,
  saveLocalTimerState,
  saveTopicHintsLocal,
  getTopicHintsLocal,
  deleteTopicHintsLocal,
  checkDailyHintQuotaLocal,
  incrementDailyHintQuotaLocal,
  calculateDetailedStorageBreakdown,
  clearAiHintsCacheLocal,
  deleteLocalTextbookPdf,
  clearAllTextbookPdfsLocal,
  purgeRecycleBinLocal,
  exportFullUniversalSnapshot,
  verifySnapshotChecksum,
  importUniversalSnapshot,
  saveInternalSnapshot,
  getAllInternalSnapshots,
  deleteInternalSnapshot,
  pruneOldSnapshots,
};


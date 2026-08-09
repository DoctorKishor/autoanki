/**
 * localDb.js - Robust Offline-First IndexedDB Database Engine for AutoAnki
 * 
 * Provides native, promise-based local persistence across browser sessions,
 * web workers, and offline desktop/mobile environments without any external dependencies.
 */

const DB_NAME = 'AutoAnkiLocalDB';
const DB_VERSION = 1;

export const STORES = {
  TOPICS: 'topics',
  SETTINGS: 'settings',
  CAMP_TRACKER: 'camp_tracker',
  HEALTH_METRICS: 'health_metrics',
  PYT_DATA: 'pyt_data',
  KV_STORE: 'kv_store'
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

      // 4. Health Metrics store (keyPath: 'id')
      if (!db.objectStoreNames.contains(STORES.HEALTH_METRICS)) {
        const healthStore = db.createObjectStore(STORES.HEALTH_METRICS, { keyPath: 'id' });
        healthStore.createIndex('date', 'date', { unique: false });
      }

      // 5. PYT Data store (keyPath: 'key')
      if (!db.objectStoreNames.contains(STORES.PYT_DATA)) {
        db.createObjectStore(STORES.PYT_DATA, { keyPath: 'key' });
      }

      // 6. Generic Key-Value Store (keyPath: 'key')
      if (!db.objectStoreNames.contains(STORES.KV_STORE)) {
        db.createObjectStore(STORES.KV_STORE, { keyPath: 'key' });
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
  return record;
}

export async function getLocalTopic(id) {
  return getLocalItem(STORES.TOPICS, id);
}

export async function getAllLocalTopics() {
  const topics = await getAllLocalItems(STORES.TOPICS);
  return Array.isArray(topics) ? topics : [];
}

export async function deleteLocalTopic(id) {
  return deleteLocalItem(STORES.TOPICS, id);
}

export async function saveAllLocalTopics(topicsArray) {
  if (!Array.isArray(topicsArray)) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.TOPICS, 'readwrite');
    const store = tx.objectStore(STORES.TOPICS);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    for (const item of topicsArray) {
      if (item && item.id) {
        store.put({
          ...item,
          updatedAt: item.updatedAt || new Date().toISOString()
        });
      }
    }
  });
}

// --- SETTINGS & PREFERENCES ---
export async function saveLocalSetting(key, value) {
  await putLocalItem(STORES.SETTINGS, { key, value, updatedAt: new Date().toISOString() });
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

// --- CAMP TRACKER ---
export async function saveLocalCampRecord(id, data) {
  await putLocalItem(STORES.CAMP_TRACKER, { id, ...data, updatedAt: new Date().toISOString() });
}

export async function getLocalCampRecord(id) {
  return getLocalItem(STORES.CAMP_TRACKER, id);
}

export async function getAllLocalCampRecords() {
  return getAllLocalItems(STORES.CAMP_TRACKER);
}

// --- HEALTH METRICS ---
export async function saveLocalHealthMetric(id, data) {
  await putLocalItem(STORES.HEALTH_METRICS, { id, ...data, updatedAt: new Date().toISOString() });
}

export async function getLocalHealthMetric(id) {
  return getLocalItem(STORES.HEALTH_METRICS, id);
}

export async function getAllLocalHealthMetrics() {
  return getAllLocalItems(STORES.HEALTH_METRICS);
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
export async function getLocalCards() {
  const cards = await getLocalKV('flashcards', []);
  return cards || [];
}

export async function replaceAllLocalCards(cardsArray) {
  const finalArray = Array.isArray(cardsArray) ? cardsArray : [];
  await setLocalKV('flashcards', finalArray);
  return finalArray;
}

export async function saveLocalCards(cardsInput) {
  if (!Array.isArray(cardsInput) || cardsInput.length === 0) return getLocalCards();
  const existing = await getLocalCards();
  const map = new Map(existing.map(c => [c.id, c]));
  cardsInput.forEach(c => {
    if (c && c.id) {
      map.set(c.id, { ...map.get(c.id), ...c });
    }
  });
  const merged = Array.from(map.values());
  await setLocalKV('flashcards', merged);
  return merged;
}

export async function saveLocalCard(card) {
  if (!card || !card.id) return null;
  return saveLocalCards([card]);
}

export async function deleteLocalCard(cardId) {
  const cards = await getLocalCards();
  const filtered = cards.filter(c => c.id !== cardId);
  await replaceAllLocalCards(filtered);
  return filtered;
}

// --- PAGES / SCANS STORAGE ---
export async function getLocalPages() {
  const pages = await getLocalKV('pages', []);
  return pages || [];
}

export async function replaceAllLocalPages(pagesArray) {
  const finalArray = Array.isArray(pagesArray) ? pagesArray : [];
  await setLocalKV('pages', finalArray);
  return finalArray;
}

export async function saveLocalPages(pagesInput) {
  if (!Array.isArray(pagesInput) || pagesInput.length === 0) return getLocalPages();
  const existing = await getLocalPages();
  const map = new Map(existing.map(p => [p.id, p]));
  pagesInput.forEach(p => {
    if (p && p.id) {
      map.set(p.id, { ...map.get(p.id), ...p });
    }
  });
  const merged = Array.from(map.values());
  await setLocalKV('pages', merged);
  return merged;
}

export async function saveLocalPage(pageObj) {
  if (!pageObj || !pageObj.id) return null;
  return saveLocalPages([pageObj]);
}

export async function deleteLocalPage(pageId) {
  const pages = await getLocalPages();
  const filtered = pages.filter(p => p.id !== pageId);
  await replaceAllLocalPages(filtered);
  return filtered;
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
    const idx = merged.findIndex(item => item.id === p.id);
    if (idx !== -1) {
      merged[idx] = { ...merged[idx], ...p };
    } else {
      merged.push(p);
    }
  });
  
  await setLocalKV('custom_prompts', merged);
  return merged;
}

export async function saveLocalPrompt(promptObj) {
  if (!promptObj || !promptObj.id) return null;
  return saveLocalPrompts([promptObj]);
}

export async function deleteLocalPrompt(promptId) {
  const prompts = await getLocalPrompts();
  const filtered = prompts.filter(p => p.id !== promptId);
  await replaceAllLocalPrompts(filtered);
  return filtered;
}

export default {
  initDB,
  STORES,
  getLocalItem,
  putLocalItem,
  deleteLocalItem,
  getAllLocalItems,
  clearLocalStore,
  saveLocalTopic,
  getLocalTopic,
  getAllLocalTopics,
  deleteLocalTopic,
  saveAllLocalTopics,
  saveLocalSetting,
  getLocalSetting,
  getAllLocalSettings,
  saveLocalCampRecord,
  getLocalCampRecord,
  getAllLocalCampRecords,
  saveLocalHealthMetric,
  getLocalHealthMetric,
  getAllLocalHealthMetrics,
  setLocalKV,
  getLocalKV,
  getLocalCards,
  saveLocalCards,
  replaceAllLocalCards,
  saveLocalCard,
  deleteLocalCard,
  getLocalPages,
  saveLocalPages,
  replaceAllLocalPages,
  saveLocalPage,
  deleteLocalPage,
  getLocalPrompts,
  replaceAllLocalPrompts,
  saveLocalPrompts,
  saveLocalPrompt,
  deleteLocalPrompt
};

/**
 * localDb.js - Robust Offline-First IndexedDB Database Engine for AutoAnki
 * 
 * Provides native, promise-based local persistence across browser sessions,
 * web workers, and offline desktop/mobile environments without any external dependencies.
 */

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

// --- TOPICS STORAGE (MUTEX PROTECTED) ---
let topicsWriteMutex = Promise.resolve();

export async function saveAllLocalTopics(topicsArray) {
  if (!Array.isArray(topicsArray)) return;
  topicsWriteMutex = topicsWriteMutex.then(async () => {
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
  }).catch(err => {
    console.error("[LocalDB] saveAllLocalTopics mutex error:", err);
  });
  return topicsWriteMutex;
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
  cardsWriteMutex = cardsWriteMutex.then(async () => {
    await setLocalKV('flashcards', finalArray);
    return finalArray;
  }).catch(err => {
    console.error("[LocalDB] replaceAllLocalCards mutex error:", err);
    return finalArray;
  });
  return cardsWriteMutex;
}

export async function saveLocalCards(cardsInput) {
  if (!Array.isArray(cardsInput) || cardsInput.length === 0) return getLocalCards();
  cardsWriteMutex = cardsWriteMutex.then(async () => {
    const existing = await getLocalCards();
    const map = new Map(existing.map(c => [c.id, c]));
    cardsInput.forEach(c => {
      if (c && c.id) {
        map.set(c.id, { ...map.get(c.id), ...c, updatedAt: c.updatedAt || Date.now() });
      }
    });
    const merged = Array.from(map.values());
    await setLocalKV('flashcards', merged);
    return merged;
  }).catch(err => {
    console.error("[LocalDB] saveLocalCards mutex error:", err);
    return getLocalCards();
  });
  return cardsWriteMutex;
}

export async function saveLocalCard(card) {
  if (!card || !card.id) return null;
  return saveLocalCards([card]);
}

export async function deleteLocalCard(cardId) {
  cardsWriteMutex = cardsWriteMutex.then(async () => {
    const cards = await getLocalCards();
    const filtered = cards.filter(c => c.id !== cardId);
    await setLocalKV('flashcards', filtered);
    return filtered;
  }).catch(err => {
    console.error("[LocalDB] deleteLocalCard mutex error:", err);
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

export async function replaceAllLocalPages(pagesArray) {
  const finalArray = Array.isArray(pagesArray) ? pagesArray : [];
  pagesWriteMutex = pagesWriteMutex.then(async () => {
    await setLocalKV('pages', finalArray);
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
        map.set(p.id, { ...map.get(p.id), ...p, updatedAt: p.updatedAt || Date.now() });
      }
    });
    const merged = Array.from(map.values());
    await setLocalKV('pages', merged);
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

export async function deleteLocalPage(pageId) {
  pagesWriteMutex = pagesWriteMutex.then(async () => {
    const pages = await getLocalPages();
    const filtered = pages.filter(p => p.id !== pageId);
    await setLocalKV('pages', filtered);
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
  const existingIdx = currentList.findIndex(d => d.id === docId);
  let updatedList;
  if (existingIdx >= 0) {
    updatedList = [...currentList];
    updatedList[existingIdx] = {
      ...updatedList[existingIdx],
      ...docData,
      id: docId
    };
  } else {
    updatedList = [...currentList, { id: docId, ...docData }];
  }
  await setLocalKV('pyt_user_progress', updatedList);
  return updatedList;
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

export async function saveLocalStudyLog(dateStr, logData) {
  if (!dateStr) return await getLocalStudyLogs();
  studyLogsWriteMutex = studyLogsWriteMutex.then(async () => {
    const current = await getLocalStudyLogs();
    const updated = { ...current, [dateStr]: { ...(current[dateStr] || {}), ...logData } };
    await setLocalKV('study_logs', updated);
    return updated;
  }).catch(err => {
    console.error("[LocalDB] saveLocalStudyLog mutex error:", err);
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

// --- SUBJECT TRACKER HELPERS ---
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

  const current = await getLocalSubjectTrackerData();
  const idx = current.findIndex(d => d.id === normalizedDocId);
  const updated = idx >= 0
    ? current.map(d => d.id === normalizedDocId ? { ...d, ...normalizedDocData, id: normalizedDocId } : d)
    : [...current, { id: normalizedDocId, ...normalizedDocData }];
  await setLocalKV('subject_tracker_data', updated);
  return updated;
}

export async function replaceAllLocalSubjectTrackerData(dataArray) {
  const finalArray = Array.isArray(dataArray) ? dataArray : [];
  await setLocalKV('subject_tracker_data', finalArray);
  return finalArray;
}

// --- STUDY SCHEDULE HELPERS ---
export async function getLocalStudySchedule() {
  const data = await getLocalKV('study_schedule');
  return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
}

export async function saveLocalScheduleEntry(dateStr, entryData) {
  if (!dateStr) return await getLocalStudySchedule();
  const current = await getLocalStudySchedule();
  const mergedEntry = { ...(current[dateStr] || {}), ...entryData };

  const hasTasks = Array.isArray(mergedEntry.tasks) && mergedEntry.tasks.length > 0;
  const hasNotes = typeof mergedEntry.notes === 'string' && mergedEntry.notes.trim().length > 0;
  const hasExamTitle = Boolean(mergedEntry.examTitle || mergedEntry.title || mergedEntry.subject);

  const updated = { ...current };
  if (!hasTasks && !hasNotes && !hasExamTitle) {
    delete updated[dateStr];
  } else {
    updated[dateStr] = mergedEntry;
  }

  await setLocalKV('study_schedule', updated);
  return updated;
}

export async function deleteLocalScheduleEntry(dateStr) {
  if (!dateStr) return await getLocalStudySchedule();
  const current = await getLocalStudySchedule();
  const updated = { ...current };
  delete updated[dateStr];
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
  const index = current.findIndex(t => t.id === templateObj.id);
  let updated;
  if (index >= 0) {
    updated = [...current];
    updated[index] = { ...updated[index], ...templateObj };
  } else {
    updated = [...current, templateObj];
  }
  await setLocalKV('schedule_templates', updated);
  return updated;
}

export async function deleteLocalScheduleTemplate(templateId) {
  const current = await getLocalScheduleTemplates();
  const updated = current.filter(t => t.id !== templateId);
  await setLocalKV('schedule_templates', updated);
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
  try {
    await runTx(STORES.TOPIC_HINTS, 'readwrite', store => store.delete(topicId));
  } catch (e) {}
  await setLocalKV(`topic_hints_${topicId}`, null);
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
  } catch (e) {}
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
  } catch (e) {}

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
  } catch (e) {}
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
  } catch (e) {}
  const prompts = (await getLocalPrompts()) || [];
  let hintQuotas = [];
  try {
    hintQuotas = (await getAllLocalItems(STORES.HINT_QUOTA)) || [];
  } catch (e) {}
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
  } catch (e) {}
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
        label: `${cards.length} Cards · ${topics.length} Topics`,
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
        label: `${Object.keys(studyLogs).length} Review Days · CAMP Logs`,
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
        label: `${curriculumTopics.length} PYT Subjects · ${subjectTracker.length} Tracker Docs`,
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
        label: `${topicHints.length} Cached Hints · ${prompts.length} Prompts`,
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
        label: `${Object.keys(settings).length} Config Keys · ${localStorageItemCount} Local Items`,
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
  await deleteLocalPytTopic(cleanKey);
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
  cards_fsrs:          'cards_fsrs',
  topics_curriculum:   'topics_curriculum',
  study_logs_velocity: 'study_logs_velocity',
  scans_media:         'scans_media',
  settings_prompts:    'settings_prompts',
  recycle_bin:         'recycle_bin',
};

const LS_KEYS_TO_SNAPSHOT = [
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
  'auto_anki_expanded_nav_category',
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
async function dumpStore(storeName) {
  try {
    const items = (await getAllLocalItems(storeName)) || [];
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
 * @returns {Promise<object>} Full snapshot object ready for JSON.stringify
 */
export async function exportFullUniversalSnapshot() {
  // 1. Dump all 9 IndexedDB object stores (binary-safe)
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
  ] = await Promise.all([
    dumpStore(STORES.TOPICS),
    dumpStore(STORES.SETTINGS),
    dumpStore(STORES.CAMP_TRACKER),
    dumpStore(STORES.CAMP_DATA),
    dumpStore(STORES.CAMP_DAILY_LOGS),
    dumpStore(STORES.PYT_DATA),
    dumpStore(STORES.KV_STORE),
    dumpStore(STORES.TOPIC_HINTS),
    dumpStore(STORES.HINT_QUOTA),
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
      topics:          topicsRaw,
      settings:        settingsRaw,
      camp_tracker:    campTrackerRaw,
      camp_data:       campDataRaw,
      camp_daily_logs: campDailyLogsRaw,
      pyt_data:        pytDataRaw,
      kv_store:        kvStoreRaw,
      topic_hints:     topicHintsRaw,
      hint_quota:      hintQuotaRaw,
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

  // Helper: merge KV entries by key (put each one — IDB put is upsert)
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

  try {
    // ── Bundle: cards_fsrs ──────────────────────────────────────────────
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
        const trashMap = new Map(localTrashCards.map(tc => [tc.id, tc.deletedAt || 0]));
        const map = new Map(existing.map(c => [c.id, c]));
        
        incoming.forEach(c => {
          if (!c || !c.id) return;
          const localDeletedAt = trashMap.get(c.id);
          if (localDeletedAt && localDeletedAt > (c.updatedAt || 0)) return;
          
          if (!map.has(c.id)) {
            map.set(c.id, c);
          } else {
            const current = map.get(c.id);
            const currentTs = current.updatedAt || current.lastReviewDate || 0;
            const incomingTs = c.updatedAt || c.lastReviewDate || 0;
            if (incomingTs >= currentTs) {
              map.set(c.id, { ...current, ...c });
            }
          }
        });
        await setLocalKV('flashcards', Array.from(map.values()));
      }
      report.restored.push('cards_fsrs');
    }

    // ── Bundle: topics_curriculum ────────────────────────────────────────
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
          const topicMap = new Map(existingTopics.map(t => [t.id, t]));
          stores.topics.forEach(t => {
            if (!t || !t.id) return;
            if (!topicMap.has(t.id)) {
              topicMap.set(t.id, t);
            } else {
              const current = topicMap.get(t.id);
              const currentTs = current.updatedAt || current.lastReviewDate || 0;
              const incomingTs = t.updatedAt || t.lastReviewDate || 0;
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

    // ── Bundle: study_logs_velocity ──────────────────────────────────────
    if (bundles.includes('study_logs_velocity')) {
      emit(++step, totalSteps, 'Restoring Study Logs & Velocity Telemetry…');
      if (strategy === 'replace') {
        if (stores.camp_tracker) await atomicClearAndPut(STORES.CAMP_TRACKER, stores.camp_tracker);
        if (stores.camp_data) await atomicClearAndPut(STORES.CAMP_DATA, stores.camp_data);
        if (stores.camp_daily_logs) await atomicClearAndPut(STORES.CAMP_DAILY_LOGS, stores.camp_daily_logs);
        const logKvs = kvSubset(['study_logs', 'study_schedule', 'schedule_templates', 'timerState', 'active_new_topics_today']);
        for (const r of logKvs) await putLocalItem(STORES.KV_STORE, r);
        // Also restore camp dynamic KV keys
        const campDynamic = kv.filter(r => r && (r.key?.startsWith('active_new_topics_')));
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
              const combinedFsrs = [...(curDay.fsrsLogs || []), ...(incDay.fsrsLogs || [])];
              const seenLogKeys = new Set();
              const dedupedFsrs = combinedFsrs.filter(log => {
                const k = `${log.cardId || log.topicName || ''}_${log.timestamp || log.dateStr || ''}`;
                if (seenLogKeys.has(k)) return false;
                seenLogKeys.add(k);
                return true;
              });
              const totalCards = Math.max(curDay.totalCardsReviewed || curDay.cards || 0, incDay.totalCardsReviewed || incDay.cards || 0, dedupedFsrs.length);
              const totalQuestions = Math.max(curDay.totalQuestionsAttempted || curDay.questions || 0, incDay.totalQuestionsAttempted || incDay.questions || 0);
              const totalHours = Math.max(curDay.studyHours || curDay.hours || 0, incDay.studyHours || incDay.hours || 0);

              mergedLogs[dateKey] = {
                ...curDay,
                ...incDay,
                totalCardsReviewed: totalCards,
                cards: totalCards,
                totalQuestionsAttempted: totalQuestions,
                questions: totalQuestions,
                studyHours: totalHours,
                hours: totalHours,
                fsrsLogs: dedupedFsrs
              };
            }
          }
          await setLocalKV('study_logs', mergedLogs);
        }
        await mergeKV(kvSubset(['study_schedule', 'schedule_templates', 'timerState']));
      }
      report.restored.push('study_logs_velocity');
    }

    // ── Bundle: scans_media ──────────────────────────────────────────────
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
        const trashMap = new Map(localTrashPages.map(tp => [tp.id, tp.deletedAt || 0]));
        const map = new Map(existing.map(p => [p.id, p]));
        incoming.forEach(p => {
          if (!p || !p.id) return;
          const localDeletedAt = trashMap.get(p.id);
          if (localDeletedAt && localDeletedAt > (p.updatedAt || 0)) return;
          if (!map.has(p.id)) map.set(p.id, p);
        });
        await setLocalKV('pages', Array.from(map.values()));
        await mergeKV(kvSubset(['textbooks_metadata']));
      }
      report.restored.push('scans_media');
    }

    // ── Bundle: settings_prompts ─────────────────────────────────────────
    if (bundles.includes('settings_prompts')) {
      emit(++step, totalSteps, 'Restoring FSRS-6 Config, API Keys & Prompts…');
      if (strategy === 'replace') {
        if (stores.settings) await atomicClearAndPut(STORES.SETTINGS, stores.settings);
        if (stores.hint_quota) await atomicClearAndPut(STORES.HINT_QUOTA, stores.hint_quota);
        if (stores.topic_hints) await atomicClearAndPut(STORES.TOPIC_HINTS, stores.topic_hints);
        await mergeKV(kvSubset(['custom_prompts', 'local_user_profile']));
      } else {
        // Merge: put all settings (upsert by key — non-destructive)
        if (Array.isArray(stores.settings)) await bulkPut(STORES.SETTINGS, stores.settings);
        await mergeKV(kvSubset(['custom_prompts']));
      }
      report.restored.push('settings_prompts');
    }

    // ── Bundle: recycle_bin ───────────────────────────────────────────────
    if (bundles.includes('recycle_bin')) {
      emit(++step, totalSteps, 'Restoring Recycle Bin…');
      const trashKvs = kvSubset(['trash_pages', 'trash_cards']);
      if (strategy === 'replace') {
        for (const r of trashKvs) await putLocalItem(STORES.KV_STORE, r);
      } else {
        // Merge trash: union by id
        for (const r of trashKvs) {
          const existing = (await getLocalKV(r.key)) || [];
          const incoming = r.value || [];
          const map = new Map(existing.map(x => [x.id, x]));
          incoming.forEach(x => { if (x && x.id && !map.has(x.id)) map.set(x.id, x); });
          await setLocalKV(r.key, Array.from(map.values()));
        }
      }
      report.restored.push('recycle_bin');
    }

    // ── Restore localStorage snapshot ─────────────────────────────────────
    emit(++step, totalSteps, 'Restoring LocalStorage preferences…');
    const lsSnap = payload.localStorageSnapshot;
    if (lsSnap && typeof lsSnap === 'object') {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          Object.entries(lsSnap).forEach(([k, v]) => {
            if (strategy === 'replace' || localStorage.getItem(k) === null) {
              if (v !== null && v !== undefined) localStorage.setItem(k, v);
            }
          });
        }
      } catch (e) {
        report.errors.push('localStorage restore failed: ' + e.message);
      }
    }

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
  const payload = customPayload || (await exportFullUniversalSnapshot());
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
export async function pruneOldSnapshots(maxCount = 5) {
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
  getLocalTextbooksMetadata,
  saveLocalTextbooksMetadata,
  getLocalStudyLogs,
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


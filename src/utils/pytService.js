import { getLocalPytTopic, saveLocalPytTopic } from '../services/localDb';

/**
 * Normalizes the subject name to be case-insensitive for document ID.
 * Trims whitespace and converts to lowercase.
 * @param {string} name
 * @returns {string}
 */
export const normalizeSubjectName = (name) => {
  return name ? name.trim().toLowerCase() : '';
};

/**
 * Fetches the PYT topics for a specific subject name from local IndexedDB.
 * Supports both getPytTopics(subjectName) and legacy getPytTopics(db, appId, userId, subjectName).
 */
export const getPytTopics = async (subjectNameOrDb, ...rest) => {
  const subjectName = rest.length >= 3 ? rest[2] : subjectNameOrDb;
  const docId = normalizeSubjectName(subjectName);
  if (!docId) return null;
  return getLocalPytTopic(docId);
};

/**
 * Sets/updates the PYT topics for a specific subject name in local IndexedDB.
 * Supports both upsertPytTopics(subjectName, topicsText) and legacy upsertPytTopics(db, appId, userId, subjectName, topicsText).
 */
export const upsertPytTopics = async (subjectNameOrDb, topicsTextOrAppId, ...rest) => {
  let subjectName = subjectNameOrDb;
  let topicsText = topicsTextOrAppId;
  if (rest.length >= 2) {
    subjectName = rest[1];
    topicsText = rest[2];
  }
  const docId = normalizeSubjectName(subjectName);
  if (!docId) throw new Error("Invalid subject name");
  await saveLocalPytTopic(subjectName, topicsText);
};

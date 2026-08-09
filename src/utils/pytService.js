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
 * @param {any} db (deprecated parameter kept for signature compatibility)
 * @param {string} appId
 * @param {string} userId
 * @param {string} subjectName
 * @returns {Promise<{subject: string, topics: string}|null>}
 */
export const getPytTopics = async (db, appId, userId, subjectName) => {
  const docId = normalizeSubjectName(subjectName);
  if (!docId) return null;
  return getLocalPytTopic(docId);
};

/**
 * Sets/updates the PYT topics for a specific subject name in local IndexedDB.
 * @param {any} db (deprecated parameter kept for signature compatibility)
 * @param {string} appId
 * @param {string} userId
 * @param {string} subjectName
 * @param {string} topicsText
 * @returns {Promise<void>}
 */
export const upsertPytTopics = async (db, appId, userId, subjectName, topicsText) => {
  const docId = normalizeSubjectName(subjectName);
  if (!docId) throw new Error("Invalid subject name");
  await saveLocalPytTopic(subjectName, topicsText);
};

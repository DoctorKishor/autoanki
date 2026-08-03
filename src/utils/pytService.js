import { doc, getDoc, setDoc } from 'firebase/firestore';

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
 * Fetches the PYT topics for a specific subject name.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} appId
 * @param {string} userId
 * @param {string} subjectName
 * @returns {Promise<{subject: string, topics: string}|null>}
 */
export const getPytTopics = async (db, appId, userId, subjectName) => {
  const docId = normalizeSubjectName(subjectName);
  if (!docId) return null;
  const docRef = doc(db, 'artifacts', appId, 'users', userId, 'pyt_topics', docId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data();
  }
  return null;
};

/**
 * Sets/updates the PYT topics for a specific subject name.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} appId
 * @param {string} userId
 * @param {string} subjectName
 * @param {string} topicsText
 * @returns {Promise<void>}
 */
export const upsertPytTopics = async (db, appId, userId, subjectName, topicsText) => {
  const docId = normalizeSubjectName(subjectName);
  if (!docId) throw new Error("Invalid subject name");
  const docRef = doc(db, 'artifacts', appId, 'users', userId, 'pyt_topics', docId);
  await setDoc(docRef, {
    subject: subjectName.trim(),
    topics: topicsText || ''
  }, { merge: true });
};

/**
 * Utility functions for robust page range parsing, average topic length calculations,
 * and subject document lookups across AutoAnki.
 */

/**
 * Parses raw page strings (including text prefixes like "p. 10-25", "pg 5 - 12", "10 to 20")
 * into normalized startPage, endPage, pageCount, and pageLabel.
 */
export function parsePageNumbers(topic) {
  if (!topic) return { startPage: null, endPage: null, pageCount: 1, pageLabel: 'No pgs' };

  let startPg = null;
  let endPg = null;

  const rawVal = String(typeof topic === 'string' ? topic : (topic.page || topic.pages || topic.pageLabel || '')).trim();

  // Try matching range with hyphen/dash or 'to'
  if (rawVal) {
    const rangeMatch = rawVal.match(/(?:p\.?|pg\.?)?\s*(\d+)\s*(?:[-–—]|to)\s*(\d+)/i);
    if (rangeMatch) {
      const p1 = parseInt(rangeMatch[1], 10);
      const p2 = parseInt(rangeMatch[2], 10);
      if (!isNaN(p1) && !isNaN(p2) && p2 >= p1) {
        startPg = p1;
        endPg = p2;
      }
    } else {
      // Try single number match
      const singleMatch = rawVal.match(/(\d+)/);
      if (singleMatch) {
        startPg = parseInt(singleMatch[1], 10);
      }
    }
  }

  // Fallbacks if object has explicit startPage / endPage props
  if (typeof topic === 'object' && topic !== null) {
    if (startPg === null) {
      const s = parseInt(topic.startPage || topic.pageStart, 10);
      if (!isNaN(s)) startPg = s;
    }
    if (endPg === null) {
      const e = parseInt(topic.endPage || topic.pageEnd, 10);
      if (!isNaN(e)) endPg = e;
    }
  }

  let pageCount = 1;
  if (startPg !== null && endPg !== null && endPg >= startPg) {
    pageCount = (endPg - startPg) + 1;
  } else if (typeof topic === 'object' && topic !== null) {
    if (topic.pageCount && !isNaN(parseInt(topic.pageCount, 10))) {
      pageCount = parseInt(topic.pageCount, 10);
    } else if (topic.pages && !isNaN(parseInt(topic.pages, 10))) {
      pageCount = parseInt(topic.pages, 10);
    }
  }

  let pageLabel = 'No pgs';
  if (startPg !== null && endPg !== null) {
    pageLabel = `p. ${startPg}–${endPg}`;
  } else if (startPg !== null) {
    pageLabel = `p. ${startPg}`;
  } else if (typeof topic === 'object' && topic?.pages) {
    pageLabel = `p. ${topic.pages}`;
  }

  return { startPage: startPg, endPage: endPg, pageCount, pageLabel };
}

/**
 * Computes accurate page weight/length for a topic.
 * If single start page and is last/only topic in list, uses average chapter length of that subject!
 */
export function getTopicPageWeight(topic, topicsList = []) {
  if (!topic) return 1;

  const { startPage, endPage, pageCount } = parsePageNumbers(topic);

  // 1. Explicit Range (e.g. 10-25 => 16 pages)
  if (startPage !== null && endPage !== null && endPage >= startPage) {
    return (endPage - startPage) + 1;
  }

  // 2. Explicit numeric property on object
  if (topic.pageCount && !isNaN(parseInt(topic.pageCount, 10))) {
    return parseInt(topic.pageCount, 10);
  }

  const list = Array.isArray(topicsList)
    ? topicsList
    : typeof topicsList === 'object' && topicsList !== null
      ? Object.values(topicsList)
      : [];

  if (list.length === 0 || startPage === null) {
    return pageCount || 1;
  }

  // 3. Dynamic calculation by sorting topics by start page ascending
  const sorted = [...list]
    .map(t => ({ ...t, parsedStart: parsePageNumbers(t).startPage }))
    .filter(t => t.parsedStart !== null)
    .sort((a, b) => a.parsedStart - b.parsedStart);

  const currentIndex = sorted.findIndex(t => t.name === topic.name || (topic.id && t.id === topic.id));

  // If topic is found and has a next topic, return difference to next topic start page
  if (currentIndex !== -1 && currentIndex < sorted.length - 1) {
    const nextStart = sorted[currentIndex + 1].parsedStart;
    if (nextStart > startPage) {
      return nextStart - startPage;
    }
  }

  // 4. Last / Only topic in subject checklist:
  // Calculate average pages per chapter of all topics in this subject that have known lengths!
  const knownLengths = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i === currentIndex) continue;
    const item = sorted[i];
    const itemInfo = parsePageNumbers(item);
    if (itemInfo.startPage !== null && itemInfo.endPage !== null && itemInfo.endPage >= itemInfo.startPage) {
      knownLengths.push((itemInfo.endPage - itemInfo.startPage) + 1);
    } else if (i < sorted.length - 1) {
      const nStart = sorted[i + 1].parsedStart;
      if (nStart > itemInfo.parsedStart) {
        knownLengths.push(nStart - itemInfo.parsedStart);
      }
    }
  }

  if (knownLengths.length > 0) {
    const sum = knownLengths.reduce((acc, val) => acc + val, 0);
    const avg = Math.round(sum / knownLengths.length);
    return Math.max(1, avg);
  }

  // Default fallback for single topics without subject average
  return 10;
}

/**
 * Normalizes subject queries and document IDs for safe case-insensitive subject document lookups.
 */
export function findSubjectDoc(subjectTrackerData = [], subjectQuery = '') {
  if (!subjectQuery || !Array.isArray(subjectTrackerData)) return null;
  const clean = subjectQuery.trim().toLowerCase();
  return subjectTrackerData.find(d => (d.id && d.id.toLowerCase() === clean) || (d.subject && d.subject.trim().toLowerCase() === clean)) || null;
}

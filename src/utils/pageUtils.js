/**
 * Utility functions for robust page range parsing, average topic length calculations,
 * and subject document lookups across AutoAnki.
 */

/**
 * Parses raw page strings (including text prefixes like "p. 10-25", "pg 5 - 12", "10 to 20", "10..25", "10:25")
 * and topic objects into normalized startPage, endPage, pageCount, and pageLabel.
 */
export function parsePageNumbers(topic) {
  if (!topic) return { startPage: null, endPage: null, pageCount: 1, pageLabel: 'No pgs' };

  let startPg = null;
  let endPg = null;

  // Extract candidate string from all common page properties
  let rawVal = '';
  if (typeof topic === 'string') {
    rawVal = topic.trim();
  } else if (typeof topic === 'number') {
    rawVal = String(topic).trim();
  } else if (typeof topic === 'object' && topic !== null) {
    rawVal = String(topic.page || topic.pages || topic.pageRange || topic.pageLabel || '').trim();
    // If rawVal is still empty, check if topic title has page notation like "Topic Name (p. 10-25)"
    if (!rawVal && topic.name && typeof topic.name === 'string') {
      const titleMatch = topic.name.match(/(?:\(|\[|\b)(?:pp?\.?|pages?|pg\.?)\s*(\d+\s*(?:[-–—]|to|\.\.|:)\s*\d+|\d+)(?:\)|\]|\b)/i);
      if (titleMatch) {
        rawVal = titleMatch[1].trim();
      }
    }
  }

  // 1. Try matching range with hyphen/dash, 'to', '..', or ':' (e.g. "10-25", "10 to 25", "10..25", "10:25")
  if (rawVal) {
    const rangeMatch = rawVal.match(/(?:pp?\.?|pages?|pg\.?)?\s*(\d+)\s*(?:[-–—]|to|\.\.|:)\s*(\d+)/i);
    if (rangeMatch) {
      const p1 = parseInt(rangeMatch[1], 10);
      const p2 = parseInt(rangeMatch[2], 10);
      if (!isNaN(p1) && !isNaN(p2)) {
        startPg = Math.min(p1, p2);
        endPg = Math.max(p1, p2);
      }
    } else {
      // Try single number match
      const singleMatch = rawVal.match(/(\d+)/);
      if (singleMatch) {
        startPg = parseInt(singleMatch[1], 10);
      }
    }
  }

  // 2. Fallbacks & overrides if object has explicit startPage / endPage / pageStart / pageEnd props
  if (typeof topic === 'object' && topic !== null) {
    const sProp = topic.startPage ?? topic.pageStart ?? topic.start_page;
    const eProp = topic.endPage ?? topic.pageEnd ?? topic.end_page;

    const sVal = sProp != null && sProp !== '' ? parseInt(sProp, 10) : null;
    const eVal = eProp != null && eProp !== '' ? parseInt(eProp, 10) : null;

    if (sVal !== null && !isNaN(sVal) && eVal !== null && !isNaN(eVal)) {
      startPg = Math.min(sVal, eVal);
      endPg = Math.max(sVal, eVal);
    } else if (sVal !== null && !isNaN(sVal)) {
      startPg = sVal;
      if (eVal !== null && !isNaN(eVal)) {
        endPg = Math.max(startPg, eVal);
      }
    } else if (eVal !== null && !isNaN(eVal)) {
      endPg = eVal;
      if (startPg !== null) {
        startPg = Math.min(startPg, endPg);
      }
    }
  }

  // 3. Compute normalized pageCount
  let pageCount = 1;
  if (startPg !== null && endPg !== null && endPg >= startPg) {
    pageCount = Math.max(1, (endPg - startPg) + 1);
  } else if (typeof topic === 'object' && topic !== null) {
    const explicitWeight = topic.pageWeight ?? topic.pageCount ?? topic.pagesCount;
    if (explicitWeight != null && explicitWeight !== '' && !isNaN(parseInt(explicitWeight, 10))) {
      pageCount = Math.max(1, parseInt(explicitWeight, 10));
    } else if (typeof topic.pages === 'number' && !isNaN(topic.pages) && topic.pages > 0) {
      pageCount = Math.max(1, Math.round(topic.pages));
    }
  }

  // Ensure startPg and endPg are synchronized with explicit pageCount/weight on the topic object
  if (startPg !== null && (endPg === null || endPg < startPg) && typeof topic === 'object' && topic !== null) {
    const explicitWeight = topic.pageWeight ?? topic.pageCount ?? topic.pagesCount;
    if (explicitWeight != null && explicitWeight !== '' && !isNaN(parseInt(explicitWeight, 10)) && parseInt(explicitWeight, 10) > 1) {
      endPg = startPg + parseInt(explicitWeight, 10) - 1;
    }
  }

  // 4. Build user-friendly pageLabel
  let pageLabel = 'No pgs';
  if (startPg !== null && endPg !== null) {
    pageLabel = startPg === endPg ? `p. ${startPg}` : `p. ${startPg}–${endPg}`;
  } else if (startPg !== null) {
    if (pageCount > 1) {
      pageLabel = `p. ${startPg}–${startPg + pageCount - 1}`;
    } else {
      pageLabel = `p. ${startPg}`;
    }
  } else if (typeof topic === 'object' && topic !== null) {
    if (topic.pageLabel) {
      pageLabel = String(topic.pageLabel);
    } else if (pageCount > 1) {
      pageLabel = `${pageCount} pgs`;
    }
  }

  return { startPage: startPg, endPage: endPg, pageCount, pageLabel };
}

export const getTopicPageInfo = parsePageNumbers;

/**
 * Computes accurate page weight/length for a topic.
 * Resolves explicit ranges, direct page weights, sibling topics list, or subject average!
 */
export function getTopicPageWeight(topic, topicsList = [], subjectTrackerData = []) {
  if (!topic) return 1;

  const { startPage, endPage, pageCount } = parsePageNumbers(topic);

  // 1. Explicit Range (e.g. 10-25 => 16 pages)
  if (startPage !== null && endPage !== null && endPage >= startPage) {
    return (endPage - startPage) + 1;
  }

  // 2. Explicit numeric pageWeight or pageCount property on object
  if (typeof topic === 'object' && topic !== null) {
    if (topic.pageWeight != null && topic.pageWeight !== '' && !isNaN(parseInt(topic.pageWeight, 10)) && parseInt(topic.pageWeight, 10) > 0) {
      return parseInt(topic.pageWeight, 10);
    }
    if (topic.pageCount != null && topic.pageCount !== '' && !isNaN(parseInt(topic.pageCount, 10)) && parseInt(topic.pageCount, 10) > 0) {
      return parseInt(topic.pageCount, 10);
    }
  }

  // 3. Resolve topics list (from argument or from subjectTrackerData if topic has subject property)
  let list = Array.isArray(topicsList)
    ? topicsList
    : typeof topicsList === 'object' && topicsList !== null
      ? Object.values(topicsList)
      : [];

  if (list.length === 0 && topic.subject && Array.isArray(subjectTrackerData) && subjectTrackerData.length > 0) {
    const subDoc = findSubjectDoc(subjectTrackerData, topic.subject);
    if (subDoc && subDoc.topics) {
      list = Object.values(subDoc.topics);
    }
  }

  if (list.length === 0 || startPage === null) {
    return pageCount || 1;
  }

  // 4. Dynamic calculation by sorting topics by start page ascending
  const sorted = [...list]
    .map(t => ({ ...t, parsedStart: parsePageNumbers(t).startPage }))
    .filter(t => t.parsedStart !== null)
    .sort((a, b) => a.parsedStart - b.parsedStart);

  const cleanTopicName = (topic.name || '').trim().toLowerCase();
  const currentIndex = sorted.findIndex(t =>
    (topic.id && t.id === topic.id) ||
    (t.name && cleanTopicName && t.name.trim().toLowerCase() === cleanTopicName)
  );

  // If topic is found and has a next topic, return difference to next topic start page
  if (currentIndex !== -1 && currentIndex < sorted.length - 1) {
    const nextStart = sorted[currentIndex + 1].parsedStart;
    if (nextStart > startPage) {
      return nextStart - startPage;
    }
  }

  // 5. Last / Only topic in subject checklist:
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
  return pageCount || 10;
}

/**
 * Normalizes subject queries and document IDs for safe case-insensitive subject document lookups.
 */
export function findSubjectDoc(subjectTrackerData = [], subjectQuery = '') {
  if (!subjectQuery || !Array.isArray(subjectTrackerData)) return null;
  const clean = subjectQuery.trim().toLowerCase();
  return subjectTrackerData.find(d => (d.id && d.id.toLowerCase() === clean) || (d.subject && d.subject.trim().toLowerCase() === clean)) || null;
}

/**
 * Robust case-insensitive, whitespace-trimmed, and ID-aware topic finder within a subject doc.
 * Returns { key, topic } or null.
 */
export function findTopicInDoc(subDoc, topicQuery = '') {
  if (!subDoc || !subDoc.topics || !topicQuery) return null;
  const clean = String(topicQuery).trim().toLowerCase();
  const cleanNoColons = clean.replace(/\s*:\s*/g, ':');
  const topicsObj = subDoc.topics;

  // 1. Direct exact key match
  if (topicsObj[topicQuery]) return { key: topicQuery, topic: topicsObj[topicQuery] };
  if (topicsObj[clean]) return { key: clean, topic: topicsObj[clean] };

  // 2. Iterate keys
  for (const [key, t] of Object.entries(topicsObj)) {
    if (!t) continue;
    const kClean = key.trim().toLowerCase();
    const tNameClean = (t.name || '').trim().toLowerCase();
    const tId = (t.id || '').trim().toLowerCase();

    if (kClean === clean || tNameClean === clean || (tId && tId === clean)) {
      return { key, topic: t };
    }
    if (kClean.replace(/\s*:\s*/g, ':') === cleanNoColons || tNameClean.replace(/\s*:\s*/g, ':') === cleanNoColons) {
      return { key, topic: t };
    }
  }

  return null;
}


// Medical Subject Mapping & QBank Accuracy Aggregator

export const STANDARD_MEDICAL_SUBJECT_MAP = [
  { match: /^(anat|anatomy)/i, name: 'Anatomy' },
  { match: /^(physio|physiology)/i, name: 'Physiology' },
  { match: /^(biochem|biochemistry)/i, name: 'Biochemistry' },
  { match: /^(path|pathology)/i, name: 'Pathology' },
  { match: /^(micro|microbio|microbiology)/i, name: 'Microbiology' },
  { match: /^(pharm|pharma|pharmacology)/i, name: 'Pharmacology' },
  { match: /^(fmt|fsm|forensic)/i, name: 'Forensic Medicine' },
  { match: /^(psm|spm|preventive|community)/i, name: 'Social and Preventive Medicine' },
  { match: /^(ophthal|ophthalmology|eye)/i, name: 'Ophthalmology' },
  { match: /^(ent|oto|rhino|laryng)/i, name: 'ENT' },
  { match: /^(peds|pediatric|pediatrics)/i, name: 'Pediatrics' },
  { match: /^(obg|obs|gyn|gynecology|obstetrics)/i, name: 'Obstetrics and Gynecology' },
  { match: /^(derma|dermatology|skin)/i, name: 'Dermatology' },
  { match: /^(psych|psychiatry)/i, name: 'Psychiatry' },
  { match: /^(radio|radiology)/i, name: 'Radiology' },
  { match: /^(anesthesia|anaesthesia)/i, name: 'Anesthesia' },
  { match: /^(ortho|orthopedics|orthopaedics)/i, name: 'Orthopedics' },
  { match: /^(surg|surgery)/i, name: 'General Surgery' },
  { match: /^(med|medicine)/i, name: 'General Medicine' },
  { match: /^(mixed|all subject|full syllabus)/i, name: 'Mixed / All Subjects' }
];

export function normalizeSubjectName(raw) {
  if (!raw || typeof raw !== 'string') return 'Untagged';
  const trimmed = raw.trim();
  if (!trimmed) return 'Untagged';
  for (const entry of STANDARD_MEDICAL_SUBJECT_MAP) {
    if (entry.match.test(trimmed)) {
      return entry.name;
    }
  }
  return trimmed;
}

export function computeSubjectAccuracyData(studyLogs, timeframe = 'all', sortMode = 'weakest') {
  if (!studyLogs || typeof studyLogs !== 'object') {
    return { subjects: [], totalQs: 0, overallAccuracy: null, weakCount: 0, masteryCount: 0 };
  }

  let cutoffDate = null;
  const now = new Date();
  if (timeframe === '7d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    cutoffDate = d.toISOString().split('T')[0];
  } else if (timeframe === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    cutoffDate = d.toISOString().split('T')[0];
  }

  const subjectMap = new Map();
  let totalGrandQs = 0;
  let totalGrandCorrect = 0;
  let totalGrandIncorrect = 0;

  const dates = Object.keys(studyLogs).sort();
  for (const dateStr of dates) {
    if (cutoffDate && dateStr < cutoffDate) continue;
    const log = studyLogs[dateStr];
    if (!log) continue;

    const rawSessions = Array.isArray(log.sessions) ? log.sessions : [];
    const sessions = rawSessions.filter(s => s && !s.isDeleted && (s.questions > 0 || s.type === 'qbank' || s.correct !== undefined));

    for (const sess of sessions) {
      const qCount = Number(sess.questions) || 0;
      const cCount = sess.correct !== undefined && sess.correct !== null ? Number(sess.correct) || 0 : null;
      const iCount = sess.incorrect !== undefined && sess.incorrect !== null ? Number(sess.incorrect) || 0 : null;

      if (cCount !== null) totalGrandCorrect += cCount;
      if (iCount !== null) totalGrandIncorrect += iCount;
      totalGrandQs += qCount > 0 ? qCount : ((cCount || 0) + (iCount || 0));

      let targetSubjects = [];
      if (Array.isArray(sess.subjects) && sess.subjects.length > 0) {
        targetSubjects = sess.subjects;
      } else if (typeof sess.subject === 'string' && sess.subject.trim()) {
        targetSubjects = sess.subject.split(',').map(s => s.trim()).filter(Boolean);
      }

      if (targetSubjects.length === 0) {
        targetSubjects = ['Untagged'];
      }

      const numSubs = targetSubjects.length;
      const qPerSub = qCount > 0 ? qCount / numSubs : 0;
      const cPerSub = cCount !== null ? cCount / numSubs : null;
      const iPerSub = iCount !== null ? iCount / numSubs : null;

      for (const rawSub of targetSubjects) {
        const subName = normalizeSubjectName(rawSub);
        if (!subjectMap.has(subName)) {
          subjectMap.set(subName, {
            name: subName,
            questions: 0,
            correct: 0,
            incorrect: 0,
            hasAccuracy: false,
            sessionsCount: 0
          });
        }
        const entry = subjectMap.get(subName);
        entry.questions += qPerSub;
        if (cPerSub !== null) {
          entry.correct += cPerSub;
          entry.hasAccuracy = true;
        }
        if (iPerSub !== null) {
          entry.incorrect += iPerSub;
          entry.hasAccuracy = true;
        }
        entry.sessionsCount += 1;
      }
    }
  }

  let weakCount = 0;
  let masteryCount = 0;

  const subjects = Array.from(subjectMap.values()).map(sub => {
    const roundedQs = Math.round(sub.questions);
    const roundedC = Math.round(sub.correct);
    const roundedI = Math.round(sub.incorrect);
    const totalRated = roundedC + roundedI;
    const accuracy = (sub.hasAccuracy && totalRated > 0)
      ? Number(((roundedC / totalRated) * 100).toFixed(1))
      : null;

    let status = 'unrated';
    if (accuracy !== null) {
      if (accuracy >= 75) {
        status = 'mastery';
        masteryCount++;
      } else if (accuracy >= 60) {
        status = 'retention';
      } else {
        status = 'weak';
        weakCount++;
      }
    }

    return {
      name: sub.name,
      questions: roundedQs,
      correct: roundedC,
      incorrect: roundedI,
      totalRated,
      accuracy,
      status,
      sessionsCount: sub.sessionsCount
    };
  });

  // Sort subjects
  subjects.sort((a, b) => {
    if (sortMode === 'weakest') {
      if (a.accuracy !== null && b.accuracy !== null) {
        return a.accuracy - b.accuracy;
      }
      if (a.accuracy !== null) return -1;
      if (b.accuracy !== null) return 1;
      return b.questions - a.questions;
    } else if (sortMode === 'highest') {
      if (a.accuracy !== null && b.accuracy !== null) {
        return b.accuracy - a.accuracy;
      }
      if (a.accuracy !== null) return -1;
      if (b.accuracy !== null) return 1;
      return b.questions - a.questions;
    } else {
      // 'volume'
      if (b.questions !== a.questions) return b.questions - a.questions;
      return (b.accuracy || 0) - (a.accuracy || 0);
    }
  });

  const grandRated = totalGrandCorrect + totalGrandIncorrect;
  const overallAccuracy = grandRated > 0 ? Number(((totalGrandCorrect / grandRated) * 100).toFixed(1)) : null;

  return {
    subjects,
    totalQs: totalGrandQs,
    overallAccuracy,
    weakCount,
    masteryCount
  };
}

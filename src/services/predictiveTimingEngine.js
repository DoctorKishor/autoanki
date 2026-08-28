/**
 * AutoAnki - Dynamic Predictive Timing Engine (Self-Learning Behavioral Engine)
 *
 * MANDATORY RULE 4.8 COMPLIANCE:
 * Operates STRICTLY as a READ-ONLY consumer of FSRS parameters and study logs.
 * Strictly forbidden from mutating or interfering with FSRS algorithm scheduling.
 */

import { parsePageNumbers, getTopicPageWeight } from '../utils/pageUtils.js';

// Seed default paces (used strictly when zero historical logs exist)
export const DEFAULT_SEED_PACE = {
  MINS_PER_PAGE_NEW: 1.5,
  TIER_RATIO_R1: 0.50,
  TIER_RATIO_R2: 0.35,
  TIER_RATIO_RN: 0.22,
  TIER_RATIO_AGAIN: 0.80,
  MIN_CLAMP_MINS: 2,
  MAX_CLAMP_MINS: 180,
  OUTLIER_MIN_PACE: 0.1,  // < 6 seconds per page is considered an accidental click
  OUTLIER_MAX_PACE: 45.0  // > 45 mins per page is considered sleep/afk typo
};

/**
 * Extracts and flattens all FSRS log entries from studyLogs.
 * Handles both array-of-day-logs and object-mapped-by-date structures.
 */
export function extractAllTimingLogs(studyLogs) {
  if (!studyLogs) return [];
  const allLogs = [];

  if (Array.isArray(studyLogs)) {
    studyLogs.forEach(day => {
      if (!day) return;
      if (Array.isArray(day.fsrsLogs)) {
        day.fsrsLogs.forEach(log => {
          if (log && typeof log === 'object') {
            allLogs.push({ ...log, dateStr: log.dateStr || day.dateStr || day.date });
          }
        });
      } else if (day.rating) {
        allLogs.push(day);
      }
    });
  } else if (typeof studyLogs === 'object') {
    Object.entries(studyLogs).forEach(([dateKey, day]) => {
      if (!day) return;
      if (Array.isArray(day.fsrsLogs)) {
        day.fsrsLogs.forEach(log => {
          if (log && typeof log === 'object') {
            allLogs.push({ ...log, dateStr: log.dateStr || day.dateStr || dateKey });
          }
        });
      } else if (Array.isArray(day)) {
        day.forEach(log => {
          if (log && typeof log === 'object') {
            allLogs.push({ ...log, dateStr: log.dateStr || dateKey });
          }
        });
      } else if (day.rating) {
        allLogs.push({ ...day, dateStr: day.dateStr || dateKey });
      }
    });
  }

  return allLogs;
}

/**
 * Determines the revision tier of a topic or log entry.
 */
export function getRevisionTier(topicOrLog) {
  if (!topicOrLog) return 'NEW';
  const rating = topicOrLog.rating;
  if (rating === 1) return 'AGAIN';

  const revCount = topicOrLog.reviewCount !== undefined
    ? topicOrLog.reviewCount
    : (topicOrLog.revisionTier ? (topicOrLog.revisionTier === 'NEW' ? 0 : 1) : 0);

  if (revCount === 0) return 'NEW';
  if (revCount === 1) return 'R1';
  if (revCount === 2) return 'R2';
  return 'RN';
}

/**
 * Computes effective page weight factoring in page bounds and flashcard/notes density.
 */
export function getEffectivePageWeight(topic, topicsList = []) {
  if (!topic) return 1;
  const baseWeight = getTopicPageWeight(topic, topicsList) || 1;

  // If page count is 1 or missing, but high-yield notes/cards exist, apply density floor
  const cardCount = Array.isArray(topic.cards) ? topic.cards.length : (topic.cardCount || 0);
  const flashcardWeight = cardCount > 0 ? Math.ceil(cardCount / 12) : 0;

  return Math.max(1, baseWeight, flashcardWeight);
}

/**
 * Analyzes historical studyLogs to derive dynamic speed metrics per subject and global average.
 * Automatically filters out extreme typos (outliers).
 */
export function calculateSubjectPaceMetrics(studyLogs) {
  const logs = extractAllTimingLogs(studyLogs);
  const subjectMap = {};
  let totalValidMins = 0;
  let totalValidPages = 0;

  logs.forEach(log => {
    const duration = log.actualDurationMins || log.durationMins;
    const pageWeight = log.pageWeight || 1;
    if (!duration || duration <= 0 || pageWeight <= 0) return;

    const minsPerPage = duration / pageWeight;
    // Outlier filter
    if (minsPerPage < DEFAULT_SEED_PACE.OUTLIER_MIN_PACE || minsPerPage > DEFAULT_SEED_PACE.OUTLIER_MAX_PACE) return;

    const subName = (log.subject || 'General').trim();
    if (!subjectMap[subName]) {
      subjectMap[subName] = { totalMins: 0, totalPages: 0, logCount: 0, paces: [] };
    }

    subjectMap[subName].totalMins += duration;
    subjectMap[subName].totalPages += pageWeight;
    subjectMap[subName].logCount += 1;
    subjectMap[subName].paces.push(minsPerPage);

    totalValidMins += duration;
    totalValidPages += pageWeight;
  });

  const globalAvgPace = totalValidPages > 0
    ? totalValidMins / totalValidPages
    : DEFAULT_SEED_PACE.MINS_PER_PAGE_NEW;

  const subjectPaces = {};
  Object.keys(subjectMap).forEach(sub => {
    const data = subjectMap[sub];
    subjectPaces[sub] = {
      avgMinsPerPage: data.totalPages > 0 ? (data.totalMins / data.totalPages) : globalAvgPace,
      logCount: data.logCount,
      totalMins: data.totalMins,
      totalPages: data.totalPages
    };
  });

  return {
    subjectPaces,
    globalAvgPace: Number(globalAvgPace.toFixed(2)),
    totalTimingLogsCount: logs.length
  };
}

/**
 * Calculates dynamic revision phase velocity multipliers (NEW vs R1 vs R2 vs RN vs AGAIN).
 */
export function calculateRevisionTierMetrics(studyLogs) {
  const logs = extractAllTimingLogs(studyLogs);
  const tierMap = {
    NEW: { totalMins: 0, totalPages: 0, count: 0 },
    R1: { totalMins: 0, totalPages: 0, count: 0 },
    R2: { totalMins: 0, totalPages: 0, count: 0 },
    RN: { totalMins: 0, totalPages: 0, count: 0 },
    AGAIN: { totalMins: 0, totalPages: 0, count: 0 }
  };

  logs.forEach(log => {
    const duration = log.actualDurationMins || log.durationMins;
    const pageWeight = log.pageWeight || 1;
    if (!duration || duration <= 0 || pageWeight <= 0) return;

    const minsPerPage = duration / pageWeight;
    if (minsPerPage < DEFAULT_SEED_PACE.OUTLIER_MIN_PACE || minsPerPage > DEFAULT_SEED_PACE.OUTLIER_MAX_PACE) return;

    const tier = log.revisionTier || getRevisionTier(log);
    if (tierMap[tier]) {
      tierMap[tier].totalMins += duration;
      tierMap[tier].totalPages += pageWeight;
      tierMap[tier].count += 1;
    }
  });

  const newPace = tierMap.NEW.totalPages > 0
    ? tierMap.NEW.totalMins / tierMap.NEW.totalPages
    : DEFAULT_SEED_PACE.MINS_PER_PAGE_NEW;

  const tierRatios = {
    NEW: 1.0,
    R1: tierMap.R1.totalPages > 0 && newPace > 0
      ? (tierMap.R1.totalMins / tierMap.R1.totalPages) / newPace
      : DEFAULT_SEED_PACE.TIER_RATIO_R1,
    R2: tierMap.R2.totalPages > 0 && newPace > 0
      ? (tierMap.R2.totalMins / tierMap.R2.totalPages) / newPace
      : DEFAULT_SEED_PACE.TIER_RATIO_R2,
    RN: tierMap.RN.totalPages > 0 && newPace > 0
      ? (tierMap.RN.totalMins / tierMap.RN.totalPages) / newPace
      : DEFAULT_SEED_PACE.TIER_RATIO_RN,
    AGAIN: tierMap.AGAIN.totalPages > 0 && newPace > 0
      ? (tierMap.AGAIN.totalMins / tierMap.AGAIN.totalPages) / newPace
      : DEFAULT_SEED_PACE.TIER_RATIO_AGAIN
  };

  return {
    tierMap,
    tierRatios,
    newAvgPace: Number(newPace.toFixed(2))
  };
}

/**
 * Calculates dynamic circadian multipliers by hour of day.
 * 4 primary slots: Morning (6-12), Afternoon (12-18), Evening (18-22), Night (22-6).
 */
export function calculateCircadianMetrics(studyLogs, globalAvgPace = 1.5) {
  const logs = extractAllTimingLogs(studyLogs);
  const slots = {
    morning: { label: 'Morning (6 AM - 12 PM)', totalMins: 0, totalPages: 0, count: 0 },
    afternoon: { label: 'Afternoon (12 PM - 6 PM)', totalMins: 0, totalPages: 0, count: 0 },
    evening: { label: 'Evening (6 PM - 10 PM)', totalMins: 0, totalPages: 0, count: 0 },
    night: { label: 'Night (10 PM - 6 AM)', totalMins: 0, totalPages: 0, count: 0 }
  };

  logs.forEach(log => {
    const duration = log.actualDurationMins || log.durationMins;
    const pageWeight = log.pageWeight || 1;
    if (!duration || duration <= 0 || pageWeight <= 0) return;

    let hour = log.hourOfDay;
    if (hour === undefined && log.timestamp) {
      hour = new Date(log.timestamp).getHours();
    }
    if (hour === undefined) return;

    let slotKey = 'night';
    if (hour >= 6 && hour < 12) slotKey = 'morning';
    else if (hour >= 12 && hour < 18) slotKey = 'afternoon';
    else if (hour >= 18 && hour < 22) slotKey = 'evening';

    slots[slotKey].totalMins += duration;
    slots[slotKey].totalPages += pageWeight;
    slots[slotKey].count += 1;
  });

  const circadianMultipliers = {};
  Object.keys(slots).forEach(key => {
    const slot = slots[key];
    const slotPace = slot.totalPages > 0 ? (slot.totalMins / slot.totalPages) : globalAvgPace;
    circadianMultipliers[key] = {
      avgPace: Number(slotPace.toFixed(2)),
      multiplier: globalAvgPace > 0 ? Number((slotPace / globalAvgPace).toFixed(2)) : 1.0,
      count: slot.count,
      label: slot.label
    };
  });

  return circadianMultipliers;
}

/**
 * Calculates current active session fatigue multiplier based on Study Room timers or continuous session time.
 */
export function calculateFatigueMultiplier(timerState, continuousSessionMins = 0) {
  let activeContinuousMins = continuousSessionMins;

  if (timerState && typeof timerState === 'object') {
    if (timerState.stopwatchStatus === 'running' && timerState.stopwatchStartedAt) {
      const elapsedSec = Math.floor((Date.now() - timerState.stopwatchStartedAt) / 1000) + (timerState.stopwatchElapsedBeforePause || 0);
      activeContinuousMins = Math.max(activeContinuousMins, Math.floor(elapsedSec / 60));
    } else if (timerState.pomodoroMode === 'study' && (timerState.pomodoroRounds || 0) > 0) {
      activeContinuousMins = Math.max(activeContinuousMins, (timerState.pomodoroRounds || 0) * 25);
    } else if (timerState.timerStatus === 'running' && timerState.timerStartedAt) {
      const elapsedSec = Math.floor((Date.now() - timerState.timerStartedAt) / 1000);
      activeContinuousMins = Math.max(activeContinuousMins, Math.floor(elapsedSec / 60));
    }
  }

  let multiplier = 1.0;
  let statusLabel = 'Peak Energy';

  if (activeContinuousMins >= 120) {
    multiplier = 1.25; // +25% fatigue buffer after 2 hours continuous study
    statusLabel = 'Deep Fatigue (+25%)';
  } else if (activeContinuousMins >= 60) {
    multiplier = 1.10; // +10% fatigue buffer after 1 hour
    statusLabel = 'Mild Fatigue (+10%)';
  }

  return {
    multiplier,
    activeContinuousMins,
    statusLabel
  };
}

/**
 * High-Precision Multi-Factor Duration Prediction for a Single Topic.
 *
 * Combines:
 * - Subject historical reading pace (mins/page)
 * - Revision phase multiplier (NEW, R1, R2, RN)
 * - FSRS Difficulty friction (D in 1..10)
 * - FSRS Retrievability decay penalty (Rt)
 * - Content Complexity (Mindmap node count)
 * - Circadian time-of-day pace multiplier
 * - Live session fatigue multiplier
 */
export function calculatePredictiveTopicTime(topic, subjectTrackerData = [], studyLogs = [], fsrsConfig = {}, timerState = null, options = {}) {
  if (!topic) {
    return {
      predictedMinutes: DEFAULT_SEED_PACE.MIN_CLAMP_MINS,
      displayLabel: `~${DEFAULT_SEED_PACE.MIN_CLAMP_MINS} mins`,
      confidenceScore: 0.1,
      breakdown: {}
    };
  }

  const { subjectPaces, globalAvgPace } = calculateSubjectPaceMetrics(studyLogs);
  const { tierRatios } = calculateRevisionTierMetrics(studyLogs);
  const fatigue = calculateFatigueMultiplier(timerState, options.continuousSessionMins || 0);

  // 1. Page Weight
  const pageWeight = getEffectivePageWeight(topic);

  // 2. Base Subject Pace
  const subName = (topic.subject || 'General').trim();
  const subData = subjectPaces[subName];
  const baseMinsPerPage = subData && subData.logCount >= 2 ? subData.avgMinsPerPage : globalAvgPace;

  // 3. Revision Tier Factor
  const tier = getRevisionTier(topic);
  const tierMultiplier = tierRatios[tier] || DEFAULT_SEED_PACE.TIER_RATIO_RN;

  // 4. FSRS Difficulty Factor (D: 1.0 to 10.0, default 5.0)
  const difficulty = topic.difficulty || 5.0;
  const difficultyMultiplier = Math.max(0.70, Math.min(1.40, 1.0 + 0.06 * (difficulty - 5.0)));

  // 5. FSRS Retrievability Memory Decay Penalty (Rt)
  let retrievabilityPenalty = 1.0;
  if (topic.lastReviewDate && topic.stability && topic.stability > 0) {
    const rawDateStr = String(topic.lastReviewDate).trim();
    const parseableStr = rawDateStr.includes('T') ? rawDateStr : `${rawDateStr}T00:00:00`;
    const lastDate = new Date(parseableStr).getTime();
    if (!isNaN(lastDate)) {
      const now = Date.now();
      const daysSince = Math.max(0, (now - lastDate) / (1000 * 60 * 60 * 24));
      const retrievability = Math.pow(1 + (9 * daysSince) / topic.stability, -1);
      if (!isNaN(retrievability) && retrievability < 0.75) {
        // Memory decayed below 75%, add cognitive re-retrieval buffer (up to +30%)
        retrievabilityPenalty = 1.0 + Math.min(0.30, (0.75 - retrievability) * 0.8);
      }
    }
  }

  // 6. Complexity / Mindmap Node Density Factor
  let complexityMultiplier = 1.0;
  const nodeCount = options.mindmapNodeCount || (Array.isArray(topic.tree) ? topic.tree.length : 0);
  if (nodeCount > 15) {
    complexityMultiplier = 1.0 + Math.min(0.25, (nodeCount - 15) * 0.01);
  }

  // 7. Circadian Time of Day Multiplier
  const currentHour = options.targetHour !== undefined ? options.targetHour : new Date().getHours();
  let circadianMultiplier = 1.0;
  if (currentHour >= 22 || currentHour < 5) {
    circadianMultiplier = 1.15; // Late night is ~15% slower
  } else if (currentHour >= 6 && currentHour < 12) {
    circadianMultiplier = 0.95; // Fresh morning is ~5% faster
  }

  // Unified Multi-Factor Duration Calculation
  const rawEstimate = pageWeight * baseMinsPerPage * tierMultiplier * difficultyMultiplier * retrievabilityPenalty * complexityMultiplier * circadianMultiplier * fatigue.multiplier;
  const clampedEstimate = Math.max(
    DEFAULT_SEED_PACE.MIN_CLAMP_MINS,
    Math.min(DEFAULT_SEED_PACE.MAX_CLAMP_MINS, Math.round(rawEstimate))
  );

  const confidenceScore = Math.min(
    1.0,
    0.3 + (subData ? Math.min(0.4, subData.logCount * 0.08) : 0) + (studyLogs && studyLogs.length > 5 ? 0.3 : 0)
  );

  const tierLabel = tier === 'NEW' ? '1st read' : tier === 'R1' ? 'rev 1' : tier === 'R2' ? 'rev 2' : tier === 'AGAIN' ? 're-learn' : 'rev N';
  const displayLabel = formatPredictedDuration(clampedEstimate);

  return {
    predictedMinutes: clampedEstimate,
    displayLabel: `${displayLabel} (${tierLabel})`,
    rawMinutes: Number(rawEstimate.toFixed(1)),
    confidenceScore: Number(confidenceScore.toFixed(2)),
    tier,
    pageWeight,
    breakdown: {
      pageWeight,
      baseMinsPerPage: Number(baseMinsPerPage.toFixed(2)),
      tierMultiplier: Number(tierMultiplier.toFixed(2)),
      difficultyMultiplier: Number(difficultyMultiplier.toFixed(2)),
      retrievabilityPenalty: Number(retrievabilityPenalty.toFixed(2)),
      circadianMultiplier: Number(circadianMultiplier.toFixed(2)),
      fatigueMultiplier: Number(fatigue.multiplier.toFixed(2))
    }
  };
}

/**
 * Formats a minute number into a clean human-readable badge (e.g. "~15 mins", "~1h 20m").
 */
export function formatPredictedDuration(minutes) {
  if (!minutes || isNaN(minutes) || minutes <= 0) return '~2 mins';
  const m = Math.round(minutes);
  if (m < 60) return `~${m} mins`;
  const hrs = Math.floor(m / 60);
  const remainingMins = m % 60;
  if (remainingMins === 0) return `~${hrs}h`;
  return `~${hrs}h ${remainingMins}m`;
}

/**
 * Computes 7-day workload forecast across Today, Tomorrow, and upcoming 5 days.
 */
export function calculateWeeklyWorkloadForecast(subjectTrackerData = [], studyLogs = [], activeNewTopicsList = [], daysCount = 7) {
  const forecastDays = [];
  const today = new Date();

  for (let i = 0; i < daysCount; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toLocaleDateString('en-CA');
    const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    let dueReviewsMins = 0;
    let newTopicsMins = 0;
    let reviewCount = 0;
    let newCount = 0;
    const topicItems = [];

    if (Array.isArray(subjectTrackerData)) {
      subjectTrackerData.forEach(subDoc => {
        const subName = subDoc.subject || 'General';
        if (subDoc.topics && typeof subDoc.topics === 'object') {
          Object.entries(subDoc.topics).forEach(([tKey, topic]) => {
            const rawName = (topic?.name || tKey || '').trim();
            if (!rawName) return;

            const isUnstudied = (!topic.reviewCount || topic.reviewCount === 0) && !topic.lastReviewDate;
            const topicObj = { ...topic, name: rawName, subject: subName };

            if (i === 0 && isUnstudied) {
              // Today's active new topics
              const isPicked = activeNewTopicsList.some(t =>
                t.id === topic.id ||
                t.name === rawName ||
                `${subName}_${rawName}` === t.id
              );
              if (isPicked) {
                const pred = calculatePredictiveTopicTime(topicObj, subjectTrackerData, studyLogs);
                newTopicsMins += pred.predictedMinutes;
                newCount += 1;
                topicItems.push({ ...topicObj, predictedMinutes: pred.predictedMinutes, isNew: true });
              }
            } else if (topic.nextReviewDue === dateStr || (i === 0 && topic.nextReviewDue && topic.nextReviewDue < dateStr)) {
              // Due for review on this date (or overdue if i === 0)
              const pred = calculatePredictiveTopicTime(topicObj, subjectTrackerData, studyLogs);
              dueReviewsMins += pred.predictedMinutes;
              reviewCount += 1;
              topicItems.push({ ...topicObj, predictedMinutes: pred.predictedMinutes, isNew: false });
            }
          });
        }
      });
    }

    const totalMins = dueReviewsMins + newTopicsMins;

    forecastDays.push({
      dateStr,
      dayLabel,
      dayIndex: i,
      totalMins,
      dueReviewsMins,
      newTopicsMins,
      reviewCount,
      newCount,
      formattedTotal: formatPredictedDuration(totalMins),
      topics: topicItems
    });
  }

  return forecastDays;
}

/**
 * Dynamic Self-Learning Profile Maturity & Prediction Confidence Engine
 * Evaluates the epistemic certainty of the timing model across 4 dynamic dimensions:
 * 1. Error & Residual Convergence (MAPE on rolling 20 reviews)
 * 2. Curriculum-Relative Density Mapping (% of active syllabus covered)
 * 3. Revision Learning Curve Factor Stability (variance of revision ratios)
 * 4. Circadian & Fatigue Predictability (spread across time slots and sessions)
 */
export function calculateDynamicProfileMaturity(subjectTrackerData = [], studyLogs = [], fsrsConfig = {}, timerState = null) {
  const allLogs = extractAllTimingLogs(studyLogs);
  const totalLogsCount = allLogs.length;

  // 1. Dynamic Curriculum Topic Density
  let totalCurriculumTopics = 0;
  const loggedTopicKeys = new Set();
  const subjectLogCounts = {};

  if (Array.isArray(subjectTrackerData)) {
    subjectTrackerData.forEach(subDoc => {
      const subName = (subDoc.subject || 'General').toLowerCase();
      if (subDoc.topics && typeof subDoc.topics === 'object') {
        Object.entries(subDoc.topics).forEach(([tKey, topic]) => {
          const rawName = (topic?.name || tKey || '').trim();
          if (rawName) {
            totalCurriculumTopics++;
          }
        });
      }
    });
  }

  allLogs.forEach(l => {
    if (l.topicName) {
      const key = `${(l.subject || '').toLowerCase()}_${l.topicName.toLowerCase().trim()}`;
      loggedTopicKeys.add(key);
    }
    const sub = (l.subject || 'General').toLowerCase();
    subjectLogCounts[sub] = (subjectLogCounts[sub] || 0) + 1;
  });

  const uniqueTopicsLogged = loggedTopicKeys.size;
  const curriculumTarget = Math.max(10, Math.min(50, Math.round(totalCurriculumTopics * 0.20)));
  const curriculumScore = Math.min(100, Math.round((uniqueTopicsLogged / (curriculumTarget || 1)) * 100));

  // 2. Rolling Prediction Error Convergence (Last 20 logs)
  let rollingErrorScore = 0;
  let avgErrorMarginMins = 0;
  let avgErrorPct = 0;

  if (totalLogsCount > 0) {
    const recentLogs = allLogs.slice(0, 20);
    let totalAbsErrorPct = 0;
    let totalAbsErrorMins = 0;

    recentLogs.forEach(log => {
      const actual = log.actualDurationMins || log.durationMins || 10;
      const pageWeight = log.pageWeight || 1;
      const baseSpeed = 1.5;
      const predicted = Math.max(2, Math.round(pageWeight * baseSpeed));
      const diffMins = Math.abs(actual - predicted);
      const relError = diffMins / Math.max(1, actual);

      totalAbsErrorMins += diffMins;
      totalAbsErrorPct += relError;
    });

    avgErrorMarginMins = Number((totalAbsErrorMins / recentLogs.length).toFixed(1));
    avgErrorPct = Math.round((totalAbsErrorPct / recentLogs.length) * 100);

    const errorConvergence = Math.max(0, Math.min(100, Math.round((1 - Math.min(1, avgErrorPct / 80)) * 100)));
    const sampleConfidence = Math.min(1, recentLogs.length / 15);
    rollingErrorScore = Math.round(errorConvergence * sampleConfidence + (1 - sampleConfidence) * 35);
  }

  // 3. Revision Tier Spread & Learning Curve Stability
  const tiersLogged = { NEW: 0, R1: 0, R2: 0, RN: 0 };
  allLogs.forEach(l => {
    const tier = l.revisionTier || 'NEW';
    if (tiersLogged[tier] !== undefined) tiersLogged[tier]++;
  });

  const activeTiersCount = Object.values(tiersLogged).filter(c => c >= 1).length;
  const tierScore = Math.round((activeTiersCount / 4) * 100);

  // 4. Circadian & Time-of-Day Entropy
  const circadianBins = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  allLogs.forEach(l => {
    const hour = l.hourOfDay != null ? l.hourOfDay : (l.timestamp ? new Date(l.timestamp).getHours() : 12);
    if (hour >= 6 && hour < 12) circadianBins.morning++;
    else if (hour >= 12 && hour < 18) circadianBins.afternoon++;
    else if (hour >= 18 && hour < 24) circadianBins.evening++;
    else circadianBins.night++;
  });

  const activeCircadianSlots = Object.values(circadianBins).filter(c => c >= 1).length;
  const circadianScore = Math.round((activeCircadianSlots / 4) * 100);

  // 5. Volume Scale (Normalized directly from 0)
  const volumeScore = totalLogsCount === 0
    ? 0
    : Math.min(100, Math.round((totalLogsCount / 35) * 100));

  // Dynamic Composite Score (0–100%)
  const compositeScore = totalLogsCount === 0
    ? 0
    : Math.min(100, Math.round(
        volumeScore * 0.25 +
        curriculumScore * 0.25 +
        tierScore * 0.20 +
        rollingErrorScore * 0.20 +
        circadianScore * 0.10
      ));

  // Tier classification & Gamified Stage
  let stageKey = 'cold';
  let stageLabel = '🌱 Cold Start Baseline';
  let stageDesc = 'No study duration data recorded yet. Rate and confirm your first topic to start engine learning.';
  let colorTheme = 'amber';

  if (totalLogsCount > 0) {
    if (compositeScore >= 90) {
      stageKey = 'master';
      stageLabel = '🔬 Master Predictive Engine';
      stageDesc = 'Fully calibrated multi-factor model with high predictive precision across all subjects';
      colorTheme = 'emerald';
    } else if (compositeScore >= 66) {
      stageKey = 'high';
      stageLabel = '🎯 High-Precision Model';
      stageDesc = 'Dynamic fatigue, revision decay, and subject speeds fully personalized';
      colorTheme = 'teal';
    } else if (compositeScore >= 35) {
      stageKey = 'adaptive';
      stageLabel = '⚡ Adaptive Learning';
      stageDesc = 'Subject baselines established; fine-tuning revision acceleration curve';
      colorTheme = 'cyan';
    } else {
      stageLabel = '🌱 Calibrating Baseline';
      stageDesc = 'Gathering initial topic velocity baselines and syllabus speeds';
    }
  }

  // Dynamic Next Focus Recommendation
  let nextFocusRecommendation = 'Rate and confirm your first study review duration to activate predictive pacing.';
  if (totalLogsCount > 0) {
    if (activeTiersCount < 3) {
      nextFocusRecommendation = 'Review older or 2nd-read topics to calibrate your personal memory acceleration curve (+12% maturity).';
    } else if (curriculumScore < 50) {
      nextFocusRecommendation = 'Log timings across more varied medical subjects to broaden syllabus mapping (+15% maturity).';
    } else if (activeCircadianSlots < 3) {
      nextFocusRecommendation = 'Study during different times of day (morning/evening) to map your circadian peak hours (+8% maturity).';
    } else if (compositeScore >= 90) {
      nextFocusRecommendation = 'Your predictive timing engine is running at peak statistical maturity!';
    }
  }

  return {
    score: compositeScore,
    stageKey,
    stageLabel,
    stageDesc,
    colorTheme,
    uniqueTopicsLogged,
    totalCurriculumTopics,
    curriculumScore,
    activeTiersCount,
    tierScore,
    activeCircadianSlots,
    circadianScore,
    rollingErrorScore,
    avgErrorMarginMins,
    avgErrorPct,
    totalLogsCount,
    nextFocusRecommendation,
    pillars: [
      { id: 'volume', label: 'Sample Volume', value: totalLogsCount, max: 40, score: volumeScore, text: `${totalLogsCount} logs` },
      { id: 'curriculum', label: 'Curriculum Breadth', value: uniqueTopicsLogged, max: curriculumTarget, score: curriculumScore, text: `${uniqueTopicsLogged} topics` },
      { id: 'tiers', label: 'Revision Tiers', value: activeTiersCount, max: 4, score: tierScore, text: `${activeTiersCount}/4 tiers` },
      { id: 'circadian', label: 'Circadian Slots', value: activeCircadianSlots, max: 4, score: circadianScore, text: `${activeCircadianSlots}/4 slots` }
    ]
  };
}

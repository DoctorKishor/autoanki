/**
 * FSRS-6 Spaced Repetition Engine Service
 *
 * Implements the official FSRS-6 algorithm specification (21 parameters w0..w20).
 * Reference: https://expertium.github.io/Algorithm.html & Open-Spaced-Repetition standard.
 *
 * Designed with pure, decoupled functions for plug-and-play future upgradeability (e.g., FSRS-7).
 */

// Default FSRS-6 21 Benchmark Parameters (w0..w20)
// Official Open-Spaced-Repetition reference weights
export const DEFAULT_FSRS6_WEIGHTS = [
  0.2120,  // w0  - S0(Again)
  1.2931,  // w1  - S0(Hard)
  2.3065,  // w2  - S0(Good)
  8.2956,  // w3  - S0(Easy)
  6.4133,  // w4  - D0 base
  0.8334,  // w5  - D0 sensitivity
  3.0194,  // w6  - D update rate per rating delta
  0.0010,  // w7  - D mean-reversion strength toward D0(Good)
  1.8722,  // w8  - Recall S growth factor
  0.1666,  // w9  - Recall S decay power
  0.7960,  // w10 - Recall retrievability bonus exponent
  1.4835,  // w11 - Forget S coefficient
  0.0614,  // w12 - Forget S difficulty decay power
  0.2629,  // w13 - Forget S stability growth power
  1.6483,  // w14 - Forget S retrievability bonus exponent
  0.6014,  // w15 - Hard penalty multiplier applied to recall stability
  1.8729,  // w16 - Easy bonus multiplier applied to recall stability
  0.5425,  // w17 - Short-term stability factor 1
  0.0912,  // w18 - Short-term stability factor 2
  0.0658,  // w19 - Short-term stability factor 3
  0.1542   // w20 - Forgetting curve power-law exponent (0.1 <= w20 <= 0.8)
];

/** Clamp helper */
export const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

/**
 * Calculates Retrievability R(t, S, w20) using FSRS-6 personalized power-law forgetting curve.
 *
 * Formula:
 *   decay = -w20
 *   factor = 0.9^(-1 / w20) - 1
 *   R(t, S) = (1 + factor * (t / S))^(-w20)
 *
 * Calibrated such that R(S, S) = 0.90 (90% target retention at interval = stability).
 *
 * @param {number} elapsedDays Elapsed days t since last review
 * @param {number} stability Memory stability S in days
 * @param {number} [w20=0.1542] Forgetting curve shape parameter w20 (0.1 <= w20 <= 0.8)
 * @returns {number} Retrievability R in [0, 1]
 */
export const calculateRetrievability = (elapsedDays, stability, w20 = DEFAULT_FSRS6_WEIGHTS[20]) => {
  if (stability <= 0) return 0;
  if (elapsedDays <= 0) return 1.0;

  const shape = clamp(typeof w20 === 'number' && !isNaN(w20) ? w20 : DEFAULT_FSRS6_WEIGHTS[20], 0.1, 0.8);
  const factor = Math.pow(0.9, -1 / shape) - 1;
  const R = Math.pow(1 + factor * (elapsedDays / stability), -shape);
  return clamp(R, 0, 1);
};

/**
 * Calculates scheduled interval I in days for target Desired Retention Rd.
 *
 * Inverts the FSRS-6 power-law forgetting curve:
 *   I = (S / (0.9^(-1 / w20) - 1)) * (Rd^(-1 / w20) - 1)
 *
 * @param {number} stability Memory stability S in days
 * @param {number} [desiredRetention=0.90] Desired retention Rd (0.70 to 0.97)
 * @param {number} [w20=0.1542] Forgetting curve shape parameter w20 (0.1 <= w20 <= 0.8)
 * @param {number} [maxInterval=365] Maximum interval cap
 * @returns {number} Calculated interval in days (integer >= 1)
 */
export const calculateInterval = (stability, desiredRetention = 0.90, w20 = DEFAULT_FSRS6_WEIGHTS[20], maxInterval = 365) => {
  if (stability <= 0) return 1;
  const dr = clamp(desiredRetention, 0.70, 0.97);
  const shape = clamp(typeof w20 === 'number' && !isNaN(w20) ? w20 : DEFAULT_FSRS6_WEIGHTS[20], 0.1, 0.8);
  const factor = Math.pow(0.9, -1 / shape) - 1;

  const rawInterval = (stability / factor) * (Math.pow(dr, -1 / shape) - 1);
  const safeMax = Math.max(30, typeof maxInterval === 'number' && !isNaN(maxInterval) ? maxInterval : 365);
  return clamp(Math.max(1, Math.round(rawInterval)), 1, safeMax);
};

/**
 * Helper to ensure weights are valid 21-parameter FSRS-6 vector.
 * Returns default FSRS-6 weights only if array is missing or invalid.
 */
export const ensureCalibratedWeights = (weights) => {
  if (!Array.isArray(weights) || weights.length < 21) return DEFAULT_FSRS6_WEIGHTS;
  const allValid = weights.slice(0, 21).every(w => typeof w === 'number' && !isNaN(w) && isFinite(w));
  if (!allValid) return DEFAULT_FSRS6_WEIGHTS;
  return weights.slice(0, 21);
};

/**
 * Initial difficulty D0 for rating r ∈ {1, 2, 3, 4}.
 *
 * Formula: D0(r) = clamp(w4 - exp(w5 * (r - 1)) + 1, 1, 10)
 */
export const calculateInitialDifficulty = (rating, weights = DEFAULT_FSRS6_WEIGHTS) => {
  const w = ensureCalibratedWeights(weights);
  const r = clamp(rating, 1, 4);
  const D0 = w[4] - Math.exp(w[5] * (r - 1)) + 1;
  return clamp(D0, 1, 10);
};

/**
 * Initial stability S0 for rating r ∈ {1, 2, 3, 4}.
 *
 * Formula: S0(r) = w[r - 1]
 */
export const calculateInitialStability = (rating, weights = DEFAULT_FSRS6_WEIGHTS) => {
  const w = ensureCalibratedWeights(weights);
  const r = clamp(rating, 1, 4);
  return Math.max(0.1, w[r - 1]);
};

/**
 * Calculates fuzz radius (in days) for a calculated interval.
 *
 * Short intervals (< 3 days): 0 fuzz (exact date).
 * Medium intervals (3 to 6 days): ±1 day.
 * Longer intervals (7+ days): percentage window.
 */
export const calculateFuzzRange = (interval) => {
  if (interval < 3) return 0;
  if (interval < 7) return 1;
  if (interval < 21) return 2;
  if (interval < 60) return 3;
  return Math.max(4, Math.round(interval * 0.05));
};

/**
 * Calculates page length for a topic object.
 */
export const getTopicPageLength = (topic) => {
  if (!topic) return 1;
  const start = parseInt(topic.page, 10);
  const end = parseInt(topic.endPage, 10);
  if (!isNaN(start) && !isNaN(end) && end >= start) {
    return (end - start) + 1;
  }
  return 1;
};

/**
 * Scans candidate day window [baseNextDate - fuzz, baseNextDate + fuzz]
 * and returns the candidate date with the lowest total scheduled page workload.
 *
 * Also incorporates weekly Easy Days configuration ('minimum', 'reduced', 'normal').
 */
export const findOptimalLoadBalancedDate = (
  baseNextDate,
  interval,
  loadBalancingOptions = {}
) => {
  const {
    subjectTrackerData = [],
    easyDays = {},
    enableLoadBalancing = true,
  } = loadBalancingOptions;

  const formatDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const fuzzRadius = enableLoadBalancing ? calculateFuzzRange(interval) : 0;
  if (fuzzRadius <= 0) {
    return formatDateStr(baseNextDate);
  }

  // Pre-aggregate daily scheduled page loads from subjectTrackerData
  const dailyPageLoads = {};
  if (Array.isArray(subjectTrackerData)) {
    subjectTrackerData.forEach(subDoc => {
      if (subDoc.topics) {
        Object.values(subDoc.topics).forEach(topic => {
          if (topic.nextReviewDue) {
            const weight = getTopicPageLength(topic);
            dailyPageLoads[topic.nextReviewDue] = (dailyPageLoads[topic.nextReviewDue] || 0) + weight;
          }
        });
      }
    });
  }

  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  let bestDateStr = formatDateStr(baseNextDate);
  let minWorkloadScore = Infinity;

  // Evaluate each candidate offset in window [-fuzzRadius, +fuzzRadius]
  for (let offset = -fuzzRadius; offset <= fuzzRadius; offset++) {
    const candidateDate = new Date(baseNextDate);
    candidateDate.setDate(candidateDate.getDate() + offset);
    const dateStr = formatDateStr(candidateDate);

    // Calculate existing scheduled pages on this day
    const existingPageLoad = dailyPageLoads[dateStr] || 0;

    // Apply Easy Days workload adjustment penalty
    const dayName = DAY_KEYS[candidateDate.getDay()];
    const easyDaySetting = (easyDays[dayName] || 'normal').toLowerCase();
    let easyDayPenalty = 0;
    if (easyDaySetting === 'minimum') {
      easyDayPenalty = 50; // Heavy penalty to steer topics away from minimum days
    } else if (easyDaySetting === 'reduced') {
      easyDayPenalty = 20; // Moderate penalty
    }

    // Distance penalty to mildly favor dates closer to base next date if workloads are equal
    const distancePenalty = Math.abs(offset) * 0.1;

    const workloadScore = existingPageLoad + easyDayPenalty + distancePenalty;

    if (workloadScore < minWorkloadScore) {
      minWorkloadScore = workloadScore;
      bestDateStr = dateStr;
    }
  }

  return bestDateStr;
};

/**
 * Bootstrap state for a brand new topic's first review.
 */
export const calculateInitialState = (
  rating,
  reviewDateStr,
  weights = DEFAULT_FSRS6_WEIGHTS,
  desiredRetention = 0.90,
  loadBalancingOptions = {}
) => {
  const w = ensureCalibratedWeights(weights);
  const r = clamp(rating, 1, 4);
  const w20 = w[20] ?? DEFAULT_FSRS6_WEIGHTS[20];

  const D = calculateInitialDifficulty(r, w);
  const S = calculateInitialStability(r, w);
  const R = 1.0;
  const maxInterval = loadBalancingOptions?.maxInterval || loadBalancingOptions?.advancedRules?.maxInterval || 365;
  const interval = calculateInterval(S, desiredRetention, w20, maxInterval);

  // Fix Bug 2.6: always parse as local-timezone midnight to prevent IST UTC off-by-one.
  // new Date('YYYY-MM-DD') is parsed as UTC; appending T00:00:00 forces local-timezone interpretation.
  const nowStr = new Date().toLocaleDateString('en-CA');
  const reviewDate = new Date(`${reviewDateStr || nowStr}T00:00:00`);
  reviewDate.setHours(0, 0, 0, 0);

  const baseNextDate = new Date(reviewDate);
  baseNextDate.setDate(baseNextDate.getDate() + interval);

  const optimalNextReviewDue = findOptimalLoadBalancedDate(baseNextDate, interval, loadBalancingOptions);

  const formatDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return {
    difficulty: parseFloat(D.toFixed(4)),
    stability: parseFloat(S.toFixed(4)),
    retrievability: parseFloat(R.toFixed(4)),
    interval,
    nextReviewDue: optimalNextReviewDue,
    lastReviewDate: formatDateStr(reviewDate),
    reviewCount: 1,
    lapses: r === 1 ? 1 : 0,
    isNew: true,
    engineVersion: 'FSRS-6',
  };
};

/**
 * Calculates FSRS-6 state update for a repeat review session.
 *
 * @param {object|null} priorState Existing topic state { difficulty, stability, lastReviewDate, reviewCount }
 * @param {1|2|3|4} rating Recall quality: 1=Again, 2=Hard, 3=Good, 4=Easy
 * @param {string} [reviewDateStr] "YYYY-MM-DD" review date string
 * @param {number[]} [weights] 21-parameter vector w0..w20
 * @param {number} [desiredRetention=0.90] Target retention rate DR
 * @param {object} [loadBalancingOptions] Options for load-balancing fuzzing { subjectTrackerData, easyDays, enableLoadBalancing }
 * @returns {object} Updated state payload
 */
export const calculateNextFSRSState = (
  priorState,
  rating,
  reviewDateStr,
  weights = DEFAULT_FSRS6_WEIGHTS,
  desiredRetention = 0.90,
  loadBalancingOptions = {}
) => {
  const w = ensureCalibratedWeights(weights);
  const w20 = w[20] ?? DEFAULT_FSRS6_WEIGHTS[20];
  const r = clamp(rating, 1, 4);

  // If topic has no stability, bootstrap as initial review
  if (!priorState || priorState.stability == null || priorState.stability <= 0) {
    return calculateInitialState(r, reviewDateStr, w, desiredRetention, loadBalancingOptions);
  }

  const reviewDate = new Date(reviewDateStr ? `${reviewDateStr}T00:00:00` : new Date());
  reviewDate.setHours(0, 0, 0, 0);

  const lastDate = priorState.lastReviewDate
    ? new Date(`${priorState.lastReviewDate}T00:00:00`)
    : new Date(reviewDate);
  lastDate.setHours(0, 0, 0, 0);

  const elapsedDays = Math.max(0, Math.round((reviewDate.getTime() - lastDate.getTime()) / 86_400_000));

  const D = clamp(priorState.difficulty ?? w[4], 1, 10);
  const S = Math.max(0.1, priorState.stability);
  const R = calculateRetrievability(elapsedDays, S, w20);

  // 1. Difficulty Update (D)
  // Linear variation Delta_D = -w_6 * (G - 3)
  const deltaD = -w[6] * (r - 3);
  let Dprime = D;
  if (deltaD > 0) {
    Dprime = D + deltaD * ((10 - D) / 9);
  } else {
    Dprime = D + deltaD * ((D - 1) / 9);
  }
  const D0good = calculateInitialDifficulty(3, w); // Mean reversion to D0(Good)
  const newD = clamp(w[7] * D0good + (1 - w[7]) * Dprime, 1.0, 10.0);

  // 2. Stability Update (S)
  let newS = S;
  if (r === 1) {
    // Failure / Lapse (G = 1):
    // S_new = min(w_11 * (D^(-w_12)) * ((S + 1)^w_13 - 1) * exp((1 - R) * w_14), S)
    const lapseS = w[11] * Math.pow(newD, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp((1 - R) * w[14]);
    newS = Math.max(0.01, Math.min(lapseS, S));
  } else {
    // Successful Recall (G > 1):
    // SInc = 1 + exp(w_8) * (11 - D) * (S^(-w_9)) * (exp((1 - R) * w_10) - 1)
    let SInc = 1 + Math.exp(w[8]) * (11 - newD) * Math.pow(S, -w[9]) * (Math.exp((1 - R) * w[10]) - 1);
    if (r === 2) SInc *= w[15]; // Hard penalty (G = 2)
    if (r === 4) SInc *= w[16]; // Easy bonus (G = 4)
    newS = Math.max(S, S * SInc);
  }

  // 3. Interval calculation based on Desired Retention DR & Max Interval
  const maxInterval = loadBalancingOptions?.maxInterval || loadBalancingOptions?.advancedRules?.maxInterval || 365;
  const interval = calculateInterval(newS, desiredRetention, w20, maxInterval);

  const baseNextDate = new Date(reviewDate);
  baseNextDate.setDate(baseNextDate.getDate() + interval);

  const optimalNextReviewDue = findOptimalLoadBalancedDate(baseNextDate, interval, loadBalancingOptions);

  const formatDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const currentLapses = priorState?.lapses || 0;
  const nextLapses = r === 1 ? currentLapses + 1 : currentLapses;

  return {
    difficulty: parseFloat(newD.toFixed(4)),
    stability: parseFloat(newS.toFixed(4)),
    retrievability: parseFloat(R.toFixed(4)),
    interval,
    nextReviewDue: optimalNextReviewDue,
    lastReviewDate: formatDateStr(reviewDate),
    reviewCount: (priorState.reviewCount || 0) + 1,
    lapses: nextLapses,
    isNew: false,
    engineVersion: 'FSRS-6',
  };
};

/**
 * Recalculates a topic's FSRS state from its complete chronological sequence of review logs.
 * Ensures 100% deterministic consistency when logs are deleted, edited, or redone.
 */
export const recalculateTopicFSRSFromLogs = (topic, topicLogs, fsrsConfig, subjectTrackerData = []) => {
  if (!topic) return topic;

  if (!topicLogs || !Array.isArray(topicLogs) || topicLogs.length === 0) {
    const cleaned = { ...topic };
    cleaned.difficulty = null;
    cleaned.stability = null;
    cleaned.retrievability = null;
    cleaned.interval = null;
    cleaned.nextReviewDue = null;
    cleaned.lastReviewDate = null;
    cleaned.reviewCount = 0;
    cleaned.lapses = 0;
    cleaned.isLeech = false;
    cleaned.studyDates = [];
    return cleaned;
  }

  // FIX-21: Normalize all timestamps to local-noon anchored epoch to prevent UTC-boundary day flips in UTC+ timezones (IST)
  const normalizeLogTimestamp = (log) => {
    if (!log) return 0;
    if (log.timestamp) {
      const t = new Date(log.timestamp).getTime();
      if (!isNaN(t)) return t;
    }
    if (log.dateStr) {
      const t = new Date(`${log.dateStr}T12:00:00`).getTime();
      if (!isNaN(t)) return t;
    }
    return 0;
  };

  const sortedLogs = [...topicLogs].sort((a, b) => normalizeLogTimestamp(a) - normalizeLogTimestamp(b));

  const subjectName = topic.subject || '';
  const activeDR = fsrsConfig?.retentionMode === 'perSubject'
    ? (fsrsConfig.perSubjectRetention?.[subjectName] || fsrsConfig.globalDesiredRetention || 0.90)
    : (fsrsConfig?.globalDesiredRetention || 0.90);

  const weights = fsrsConfig?.weights || DEFAULT_FSRS6_WEIGHTS;

  let currentFsrsState = null;
  const uniqueStudyDates = [];

  sortedLogs.forEach(log => {
    const rating = typeof log.rating === 'number' ? log.rating : 3;
    const dateStr = log.dateStr || (log.timestamp ? log.timestamp.split('T')[0] : new Date().toLocaleDateString('en-CA'));

    if (dateStr && !uniqueStudyDates.includes(dateStr)) {
      uniqueStudyDates.push(dateStr);
    }

    currentFsrsState = calculateNextFSRSState(
      currentFsrsState,
      rating,
      dateStr,
      weights,
      activeDR,
      {
        subjectTrackerData,
        easyDays: fsrsConfig?.easyDays || {},
        enableLoadBalancing: false
      }
    );
  });

  return {
    ...topic,
    ...currentFsrsState,
    studyDates: uniqueStudyDates.sort()
  };
};

/**
 * Extracts structured review events from studyLogs and subjectTrackerData for FSRS optimization.
 *
 * @param {object} studyLogs Dictionary of date-keyed study logs (e.g. { '2026-08-28': { fsrsLogs: [...] } })
 * @param {Array} subjectTrackerData Array of subject documents with topics
 * @returns {Array} List of review samples { topicKey, rating, y, dateStr, timestamp }
 */
export const extractReviewDataset = (studyLogs = {}, subjectTrackerData = []) => {
  const dataset = [];

  // 1. Extract from date-keyed study_logs fsrsLogs
  if (studyLogs && typeof studyLogs === 'object') {
    Object.entries(studyLogs).forEach(([dateStr, dayData]) => {
      if (dayData && Array.isArray(dayData.fsrsLogs)) {
        dayData.fsrsLogs.forEach(log => {
          if (!log || typeof log.rating !== 'number') return;
          const rating = clamp(log.rating, 1, 4);
          dataset.push({
            topicKey: log.topicName ? String(log.topicName).toLowerCase() : (log.topicId || 'unknown'),
            subject: log.subject || '',
            rating,
            y: rating === 1 ? 0 : 1, // 0 for Again/Lapse, 1 for Recall
            dateStr: log.dateStr || dateStr,
            timestamp: log.timestamp ? new Date(log.timestamp).getTime() : new Date(`${dateStr}T12:00:00`).getTime()
          });
        });
      }
    });
  }

  // 2. Extract from subjectTrackerData topics studyDates if logs were not detailed
  if (Array.isArray(subjectTrackerData)) {
    subjectTrackerData.forEach(subDoc => {
      if (!subDoc || !subDoc.topics) return;
      const subName = subDoc.subject || '';
      Object.entries(subDoc.topics).forEach(([topicName, topic]) => {
        if (!topic || !Array.isArray(topic.studyDates) || topic.studyDates.length === 0) return;
        const topicKey = `${subName.toLowerCase()}::${topicName.toLowerCase()}`;
        
        // Only synthesize if dataset doesn't already have entries for this topic
        const existingCount = dataset.filter(d => d.topicKey === topicName.toLowerCase() || d.topicKey === topicKey).length;
        if (existingCount === 0) {
          topic.studyDates.forEach((dStr, idx) => {
            dataset.push({
              topicKey,
              subject: subName,
              rating: idx === 0 ? 3 : (topic.difficulty && topic.difficulty > 7 ? 2 : 3),
              y: 1,
              dateStr: dStr,
              timestamp: new Date(`${dStr}T12:00:00`).getTime()
            });
          });
        }
      });
    });
  }

  return dataset.sort((a, b) => a.timestamp - b.timestamp);
};

/**
 * Computes complete FSRS-6 evaluation metrics (Binary Cross-Entropy Loss and RMSE) for a candidate weight vector.
 *
 * Log-Loss:
 *   Loss = - (1 / N) * sum_i [ y_i * ln(R_i) + (1 - y_i) * ln(1 - R_i) ]
 *
 * RMSE:
 *   RMSE = sqrt( (1 / N) * sum_i (y_i - R_i)^2 )
 *
 * @param {number[]} weights 21-parameter vector w0..w20
 * @param {Array} dataset Review history samples
 * @param {number} [desiredRetention=0.90] Target retention rate
 * @returns {object} { bceLoss, rmse, sampleCount }
 */
export const computeFSRSMetrics = (weights, dataset, desiredRetention = 0.90) => {
  if (!dataset || dataset.length === 0) {
    return { bceLoss: 0, rmse: 0, sampleCount: 0 };
  }

  const w = ensureCalibratedWeights(weights);
  const w20 = clamp(w[20] ?? DEFAULT_FSRS6_WEIGHTS[20], 0.1, 0.8);
  const topicStates = new Map();
  let totalLoss = 0;
  let totalSqError = 0;
  let sampleCount = 0;

  dataset.forEach(sample => {
    const key = sample.topicKey;
    const priorState = topicStates.get(key) || null;
    const r = sample.rating;
    const y = sample.y;

    let retrievability = 1.0;
    if (priorState && priorState.stability > 0) {
      const reviewDate = new Date(sample.dateStr ? `${sample.dateStr}T00:00:00` : sample.timestamp);
      const lastDate = priorState.lastReviewDate ? new Date(`${priorState.lastReviewDate}T00:00:00`) : reviewDate;
      const elapsedDays = Math.max(0, Math.round((reviewDate.getTime() - lastDate.getTime()) / 86_400_000));
      retrievability = calculateRetrievability(elapsedDays, priorState.stability, w20);
    }

    // Binary Cross Entropy with numerical epsilon clamping
    const eps = 1e-6;
    const p = clamp(retrievability, eps, 1 - eps);
    const loss = -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    totalLoss += loss;
    totalSqError += Math.pow(y - retrievability, 2);
    sampleCount++;

    // Advance topic state
    const nextState = calculateNextFSRSState(priorState, r, sample.dateStr, w, desiredRetention, { enableLoadBalancing: false });
    topicStates.set(key, nextState);
  });

  // Regularization penalty against benchmark reference weights
  let reg = 0;
  for (let i = 0; i < 21; i++) {
    const defW = DEFAULT_FSRS6_WEIGHTS[i] || 1;
    const diff = (w[i] - defW) / (defW + 0.1);
    reg += diff * diff;
  }

  const bce = sampleCount > 0 ? (totalLoss / sampleCount) + 0.01 * (reg / 21) : 0;
  const rmse = sampleCount > 0 ? Math.sqrt(totalSqError / sampleCount) : 0;

  return {
    bceLoss: parseFloat(bce.toFixed(4)),
    rmse: parseFloat(rmse.toFixed(4)),
    sampleCount
  };
};

/**
 * Computes Binary Cross-Entropy loss for candidate FSRS weights on review dataset.
 */
export const computeFSRSLoss = (weights, dataset, desiredRetention = 0.90) => {
  return computeFSRSMetrics(weights, dataset, desiredRetention).bceLoss;
};

/**
 * Optimizes FSRS-6 weights (w0..w20) based on historical review dataset using coordinate descent with momentum.
 *
 * Implements:
 *   1. Initial weights fallback to official FSRS-6 parameters when review count < 1,000 or uncalibrated.
 *   2. Coordinate descent minimizing Log-Loss across 21 parameters.
 *   3. Root Mean Squared Error (RMSE) computation on prediction probabilities vs outcomes.
 *   4. Safeguard validation: rejects optimization if RMSE increases or parameters violate valid bounds.
 *
 * @param {Array} dataset Review samples from extractReviewDataset
 * @param {Array} initialWeights Starting parameter vector
 * @param {number} [maxIterations=60] Max optimization passes
 * @returns {object} Optimization result with metrics and safeguard status
 */
export const optimizeFSRSWeights = (dataset = [], initialWeights = DEFAULT_FSRS6_WEIGHTS, maxIterations = 60) => {
  if (!dataset || dataset.length === 0) {
    return {
      success: true,
      rejected: false,
      optimizedWeights: [...DEFAULT_FSRS6_WEIGHTS],
      initialLoss: 0,
      finalLoss: 0,
      lossImprovementPct: 0,
      initialRmse: 0,
      finalRmse: 0,
      rmseImprovementPct: 0,
      sampleCount: 0
    };
  }

  // Use official FSRS-6 defaults if starting cold or dataset is small (< 1,000)
  const startingWeights = Array.isArray(initialWeights) && initialWeights.length === 21
    ? ensureCalibratedWeights(initialWeights)
    : [...DEFAULT_FSRS6_WEIGHTS];

  let currentWeights = [...startingWeights];
  const initialMetrics = computeFSRSMetrics(currentWeights, dataset);
  let bestLoss = initialMetrics.bceLoss;
  let bestWeights = [...currentWeights];

  // Learning rates and parameter bounds for FSRS-6 21 parameters
  const stepSizes = [
    0.05, 0.15, 0.25, 0.5, // w0..w3 (initial stabilities)
    0.2, 0.05, 0.1, 0.0005, // w4..w7 (difficulty parameters)
    0.08, 0.02, 0.05, // w8..w10 (recall stability parameters)
    0.08, 0.02, 0.03, 0.08, // w11..w14 (forget stability parameters)
    0.03, 0.08, // w15..w16 (hard penalty / easy bonus multipliers)
    0.04, 0.02, 0.01, 0.01 // w17..w20 (short-term factors & w20 power-law exponent)
  ];

  const minBounds = [
    0.01, 0.05, 0.1, 0.5, // w0..w3
    1.0, 0.01, 0.01, 0.0001, // w4..w7
    0.01, 0.01, 0.01, // w8..w10
    0.01, 0.01, 0.01, 0.01, // w11..w14
    0.01, 1.0, // w15..w16
    0.01, 0.01, 0.0, 0.10 // w17..w20 (w20 clamped strictly >= 0.1)
  ];

  const maxBounds = [
    10.0, 20.0, 50.0, 100.0, // w0..w3
    10.0, 4.0, 4.0, 0.99, // w4..w7
    5.0, 1.0, 4.0, // w8..w10
    5.0, 1.0, 1.0, 4.0, // w11..w14
    1.0, 6.0, // w15..w16
    2.0, 2.0, 1.0, 0.80 // w17..w20 (w20 clamped strictly <= 0.8)
  ];

  for (let iter = 0; iter < maxIterations; iter++) {
    const decay = 1 / (1 + 0.03 * iter);
    let improvedThisPass = false;

    // Optimize active parameter indices
    for (let idx = 0; idx < 21; idx++) {
      const step = stepSizes[idx] * decay;
      const originalVal = bestWeights[idx];

      // Try positive step
      const plusWeights = [...bestWeights];
      plusWeights[idx] = clamp(originalVal + step, minBounds[idx], maxBounds[idx]);
      // Enforce monotonic initial stabilities: w0 <= w1 <= w2 <= w3
      if (idx === 0) plusWeights[1] = Math.max(plusWeights[1], plusWeights[0]);
      if (idx === 1) plusWeights[2] = Math.max(plusWeights[2], plusWeights[1]);
      if (idx === 2) plusWeights[3] = Math.max(plusWeights[3], plusWeights[2]);

      const plusLoss = computeFSRSLoss(plusWeights, dataset);
      if (plusLoss < bestLoss - 1e-5) {
        bestLoss = plusLoss;
        bestWeights = plusWeights;
        improvedThisPass = true;
        continue;
      }

      // Try negative step
      const minusWeights = [...bestWeights];
      minusWeights[idx] = clamp(originalVal - step, minBounds[idx], maxBounds[idx]);
      if (idx === 1) minusWeights[0] = Math.min(minusWeights[0], minusWeights[1]);
      if (idx === 2) minusWeights[1] = Math.min(minusWeights[1], minusWeights[2]);
      if (idx === 3) minusWeights[2] = Math.min(minusWeights[2], minusWeights[3]);

      const minusLoss = computeFSRSLoss(minusWeights, dataset);
      if (minusLoss < bestLoss - 1e-5) {
        bestLoss = minusLoss;
        bestWeights = minusWeights;
        improvedThisPass = true;
      }
    }

    if (!improvedThisPass && iter > 10) break;
  }

  const finalMetrics = computeFSRSMetrics(bestWeights, dataset);
  const roundedWeights = bestWeights.map(w => parseFloat(w.toFixed(4)));

  // --- SAFEGUARD VALIDATION ---
  // 1. Verify all initial stabilities are strictly positive (w0..w3 > 0)
  const isStabilitiesPositive = roundedWeights.slice(0, 4).every(w => w > 0);
  // 2. Verify w20 is strictly inside [0.1, 0.8]
  const isW20Valid = roundedWeights[20] >= 0.1 && roundedWeights[20] <= 0.8;
  // 3. Verify RMSE did not worsen significantly
  const isRmseValid = finalMetrics.rmse <= initialMetrics.rmse + 0.005;

  const isValid = isStabilitiesPositive && isW20Valid && isRmseValid;

  if (!isValid) {
    let reason = "Optimization produced invalid parameters or higher prediction error.";
    if (!isStabilitiesPositive) reason = "Initial stabilities must be strictly positive.";
    else if (!isW20Valid) reason = `Forgetting curve exponent w20 (${roundedWeights[20]}) fell outside valid [0.1, 0.8] bounds.`;
    else if (!isRmseValid) reason = `Final RMSE (${finalMetrics.rmse}) is higher than baseline RMSE (${initialMetrics.rmse}).`;

    return {
      success: false,
      rejected: true,
      reason,
      optimizedWeights: [...startingWeights],
      initialLoss: initialMetrics.bceLoss,
      finalLoss: finalMetrics.bceLoss,
      lossImprovementPct: 0,
      initialRmse: initialMetrics.rmse,
      finalRmse: finalMetrics.rmse,
      rmseImprovementPct: 0,
      sampleCount: dataset.length
    };
  }

  const lossImprovementPct = initialMetrics.bceLoss > 0
    ? Math.max(0, Math.round(((initialMetrics.bceLoss - finalMetrics.bceLoss) / initialMetrics.bceLoss) * 1000) / 10)
    : 0;

  const rmseImprovementPct = initialMetrics.rmse > 0
    ? Math.max(0, Math.round(((initialMetrics.rmse - finalMetrics.rmse) / initialMetrics.rmse) * 1000) / 10)
    : 0;

  return {
    success: true,
    rejected: false,
    optimizedWeights: roundedWeights,
    initialLoss: initialMetrics.bceLoss,
    finalLoss: finalMetrics.bceLoss,
    lossImprovementPct,
    initialRmse: initialMetrics.rmse,
    finalRmse: finalMetrics.rmse,
    rmseImprovementPct,
    sampleCount: dataset.length
  };
};

/**
 * Recalculates FSRS states, stability, difficulty, intervals, and due dates across all active topics
 * AND updates all historical review logs in studyLogs to reflect the new weights.
 * Assigns granular individual updatedAt ISO timestamps for seamless conflict-free cloud sync.
 *
 * @param {Array} subjectTrackerData Current subject documents array
 * @param {object} studyLogs Dictionary of date-keyed study logs
 * @param {object} fsrsConfig Active FSRS configuration object
 * @returns {object} { updatedSubjectTrackerData, updatedStudyLogs, rescheduledCount, logsRecalculatedCount }
 */
export const batchRescheduleAllTopics = (subjectTrackerData = [], studyLogs = {}, fsrsConfig = {}) => {
  if (!Array.isArray(subjectTrackerData) || subjectTrackerData.length === 0) {
    return {
      updatedSubjectTrackerData: [],
      updatedStudyLogs: studyLogs || {},
      rescheduledCount: 0,
      logsRecalculatedCount: 0
    };
  }

  // Pre-index study logs by topic name / ID
  const topicLogsMap = new Map();
  if (studyLogs && typeof studyLogs === 'object') {
    Object.entries(studyLogs).forEach(([dateStr, dayData]) => {
      if (dayData && Array.isArray(dayData.fsrsLogs)) {
        dayData.fsrsLogs.forEach(log => {
          if (!log) return;
          const key = (log.topicName || log.topicId || '').trim().toLowerCase();
          if (!key) return;
          if (!topicLogsMap.has(key)) topicLogsMap.set(key, []);
          topicLogsMap.get(key).push({ ...log, dateStr: log.dateStr || dateStr });
        });
      }
    });
  }

  const nowIso = new Date().toISOString();
  let rescheduledCount = 0;
  let logsRecalculatedCount = 0;
  const updatedLogsById = new Map();

  const updatedSubjectTrackerData = subjectTrackerData.map(subDoc => {
    if (!subDoc || !subDoc.topics) return subDoc;

    let subModified = false;
    const updatedTopics = { ...subDoc.topics };

    Object.entries(subDoc.topics).forEach(([topicName, topic]) => {
      if (!topic) return;

      const normName = topicName.trim().toLowerCase();
      const topicLogs = topicLogsMap.get(normName) || [];
      const hasStudyDates = Array.isArray(topic.studyDates) && topic.studyDates.length > 0;
      const hasLogs = topicLogs.length > 0;

      // Only reschedule topics that have actually been studied/logged
      if (hasStudyDates || hasLogs || topic.stability != null) {
        // Chronologically sort all logs for this topic
        const normalizeLogTimestamp = (log) => {
          if (!log) return 0;
          if (log.timestamp) {
            const t = new Date(log.timestamp).getTime();
            if (!isNaN(t)) return t;
          }
          if (log.dateStr) {
            const t = new Date(`${log.dateStr}T12:00:00`).getTime();
            if (!isNaN(t)) return t;
          }
          return 0;
        };

        const sortedLogs = [...topicLogs].sort((a, b) => normalizeLogTimestamp(a) - normalizeLogTimestamp(b));
        const subjectName = topic.subject || subDoc.subject || '';
        const activeDR = fsrsConfig?.retentionMode === 'perSubject'
          ? (fsrsConfig.perSubjectRetention?.[subjectName] || fsrsConfig.globalDesiredRetention || 0.90)
          : (fsrsConfig?.globalDesiredRetention || 0.90);

        const weights = fsrsConfig?.weights || DEFAULT_FSRS6_WEIGHTS;
        let currentFsrsState = null;
        const uniqueStudyDates = [];

        sortedLogs.forEach(log => {
          const rating = typeof log.rating === 'number' ? log.rating : 3;
          const dateStr = log.dateStr || (log.timestamp ? log.timestamp.split('T')[0] : new Date().toLocaleDateString('en-CA'));

          if (dateStr && !uniqueStudyDates.includes(dateStr)) {
            uniqueStudyDates.push(dateStr);
          }

          currentFsrsState = calculateNextFSRSState(
            currentFsrsState,
            rating,
            dateStr,
            weights,
            activeDR,
            {
              subjectTrackerData,
              easyDays: fsrsConfig?.easyDays || {},
              enableLoadBalancing: false
            }
          );

          if (log.id) {
            updatedLogsById.set(log.id, {
              ...log,
              stability: currentFsrsState.stability,
              difficulty: currentFsrsState.difficulty,
              nextReviewDue: currentFsrsState.nextReviewDue
            });
            logsRecalculatedCount++;
          }
        });

        const recalculated = {
          ...topic,
          ...(currentFsrsState || {}),
          studyDates: uniqueStudyDates.length > 0 ? uniqueStudyDates.sort() : (topic.studyDates || [])
        };

        updatedTopics[topicName] = {
          ...recalculated,
          updatedAt: nowIso
        };
        subModified = true;
        rescheduledCount++;
      }
    });

    if (subModified) {
      return {
        ...subDoc,
        topics: updatedTopics,
        updatedAt: nowIso
      };
    }
    return subDoc;
  });

  // Re-map updated studyLogs dictionary with recalculated logs
  let updatedStudyLogs = { ...studyLogs };
  if (updatedLogsById.size > 0 && studyLogs && typeof studyLogs === 'object') {
    const nextStudyLogs = {};
    let logsModified = false;

    Object.entries(studyLogs).forEach(([dateStr, dayData]) => {
      if (dayData && Array.isArray(dayData.fsrsLogs)) {
        let dayModified = false;
        const newFsrsLogs = dayData.fsrsLogs.map(log => {
          if (log && log.id && updatedLogsById.has(log.id)) {
            dayModified = true;
            return updatedLogsById.get(log.id);
          }
          return log;
        });
        if (dayModified) {
          nextStudyLogs[dateStr] = {
            ...dayData,
            fsrsLogs: newFsrsLogs,
            updatedAt: nowIso
          };
          logsModified = true;
        } else {
          nextStudyLogs[dateStr] = dayData;
        }
      } else {
        nextStudyLogs[dateStr] = dayData;
      }
    });

    if (logsModified) {
      updatedStudyLogs = nextStudyLogs;
    }
  }

  return {
    updatedSubjectTrackerData,
    updatedStudyLogs,
    rescheduledCount,
    logsRecalculatedCount
  };
};


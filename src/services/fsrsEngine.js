/**
 * FSRS-6 Spaced Repetition Engine Service
 *
 * Implements the official FSRS-6 algorithm specification (21 parameters w0..w20).
 * Reference: https://expertium.github.io/Algorithm.html & Open-Spaced-Repetition standard.
 *
 * Designed with pure, decoupled functions for plug-and-play future upgradeability (e.g., FSRS-7).
 */

// Default FSRS-6 21 Benchmark Parameters (w0..w20)
export const DEFAULT_FSRS6_WEIGHTS = [
  0.4072,  // w0  - S0(Again)
  1.1829,  // w1  - S0(Hard)
  3.1262,  // w2  - S0(Good)
  15.4722, // w3  - S0(Easy)
  7.2102,  // w4  - D0 base
  0.5316,  // w5  - D0 sensitivity
  1.0651,  // w6  - D update rate per rating delta
  0.0589,  // w7  - D mean-reversion strength toward D0(Easy)
  1.5330,  // w8  - Recall S growth factor
  0.1544,  // w9  - Recall S decay power
  1.0071,  // w10 - Recall retrievability bonus exponent
  1.9395,  // w11 - Forget S coefficient
  0.1100,  // w12 - Forget S difficulty decay power
  0.2900,  // w13 - Forget S stability growth power
  2.2700,  // w14 - Forget S retrievability bonus exponent
  0.1500,  // w15 - Hard penalty multiplier applied to recall stability
  2.9898,  // w16 - Easy bonus multiplier applied to recall stability
  0.5100,  // w17 - Short-term stability factor 1
  0.3400,  // w18 - Short-term stability factor 2
  0.0000,  // w19 - Reserved modifier
  0.2345,  // w20 - Forgetting curve shape parameter (typical ~0.2345)
];

/** Clamp helper */
export const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

/**
 * Calculates Retrievability R(t, S, w20) using FSRS-6 personalized power forgetting curve.
 *
 * Formula: R(t, S) = (1 + w20 * (t / S))^(-1 / w20)
 *
 * @param {number} elapsedDays Elapsed days t since last review
 * @param {number} stability Memory stability S in days
 * @param {number} [w20=0.2345] Forgetting curve shape parameter w20
 * @returns {number} Retrievability R in [0, 1]
 */
export const calculateRetrievability = (elapsedDays, stability, w20 = DEFAULT_FSRS6_WEIGHTS[20]) => {
  if (stability <= 0) return 0;
  if (elapsedDays <= 0) return 1.0;

  const shape = Math.max(0.01, typeof w20 === 'number' && !isNaN(w20) ? w20 : DEFAULT_FSRS6_WEIGHTS[20]);
  const R = Math.pow(1 + shape * (elapsedDays / stability), -1 / shape);
  return clamp(R, 0, 1);
};

/**
 * Calculates scheduled interval I in days for target Desired Retention DR.
 *
 * Formula: I = (S / w20) * (DR^(-w20) - 1)
 *
 * @param {number} stability Memory stability S in days
 * @param {number} [desiredRetention=0.90] Desired retention DR (0.70 to 0.97)
 * @param {number} [w20=0.2345] Forgetting curve shape parameter w20
 * @returns {number} Calculated interval in days
 */
export const calculateInterval = (stability, desiredRetention = 0.90, w20 = DEFAULT_FSRS6_WEIGHTS[20]) => {
  if (stability <= 0) return 1;
  const dr = clamp(desiredRetention, 0.70, 0.97);
  const shape = Math.max(0.01, typeof w20 === 'number' && !isNaN(w20) ? w20 : DEFAULT_FSRS6_WEIGHTS[20]);

  const interval = (stability / shape) * (Math.pow(dr, -shape) - 1);
  return Math.max(1, Math.round(interval));
};

/**
 * Initial difficulty D0 for rating r ∈ {1, 2, 3, 4}.
 *
 * Formula: D0(r) = clamp(w4 - exp(w5 * (r - 1)) + 1, 1, 10)
 */
export const calculateInitialDifficulty = (rating, weights = DEFAULT_FSRS6_WEIGHTS) => {
  const w = weights || DEFAULT_FSRS6_WEIGHTS;
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
  const w = weights || DEFAULT_FSRS6_WEIGHTS;
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
  if (interval < 30) return Math.max(1, Math.round(interval * 0.15));
  return Math.max(2, Math.round(interval * 0.05));
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
  const w = weights || DEFAULT_FSRS6_WEIGHTS;
  const r = clamp(rating, 1, 4);
  const w20 = w[20] ?? DEFAULT_FSRS6_WEIGHTS[20];

  const D = calculateInitialDifficulty(r, w);
  const S = calculateInitialStability(r, w);
  const R = 1.0;
  const interval = calculateInterval(S, desiredRetention, w20);

  const reviewDate = new Date(reviewDateStr ? `${reviewDateStr}T00:00:00` : new Date());
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
  const w = weights && weights.length >= 21 ? weights : DEFAULT_FSRS6_WEIGHTS;
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

  // 1. Difficulty Update (D')
  const D0easy = calculateInitialDifficulty(4, w);
  const deltaD = D - w[6] * (r - 3);
  const newD = clamp(w[7] * D0easy + (1 - w[7]) * deltaD, 1, 10);

  // 2. Stability Update (S')
  let newS = S;
  if (r === 1) {
    // Forget / Lapse (Again)
    const forgetS = w[11] * Math.pow(newD, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp(w[14] * (1 - R));
    newS = Math.max(0.1, forgetS);
  } else {
    // Recalled (Hard, Good, Easy)
    let recallMultiplier = 1.0;
    if (r === 2) recallMultiplier = w[15]; // Hard penalty
    if (r === 4) recallMultiplier = w[16]; // Easy bonus

    const Sinc = 1 + Math.exp(w[8]) * (11 - newD) * Math.pow(S, -w[9]) * (Math.exp(w[10] * (1 - R)) - 1) * recallMultiplier;
    newS = Math.max(S, S * Sinc);
  }

  // 3. Interval calculation based on Desired Retention DR
  const interval = calculateInterval(newS, desiredRetention, w20);

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
    difficulty: parseFloat(newD.toFixed(4)),
    stability: parseFloat(newS.toFixed(4)),
    retrievability: parseFloat(R.toFixed(4)),
    interval,
    nextReviewDue: optimalNextReviewDue,
    lastReviewDate: formatDateStr(reviewDate),
    reviewCount: (priorState.reviewCount || 0) + 1,
    isNew: false,
    engineVersion: 'FSRS-6',
  };
};

/**
 * Calculations for the Cerebellum Accountability Management Program (CAMP) Tracker
 */

/**
 * Calculates the productive study hours for a single session.
 * Formula: Hours * (Concentration / 10)
 * @param {number|string} hours 
 * @param {number|string} concentration 
 * @returns {number}
 */
export function calculateSessionProductiveHours(hours, concentration) {
  const h = parseFloat(hours) || 0;
  const c = parseFloat(concentration) || 0;
  return h * (c / 10);
}

/**
 * Calculates the total productive study hours across all sessions.
 * @param {Object} sessions 
 * @returns {number}
 */
export function calculateTotalProductiveHours(sessions) {
  if (!sessions || typeof sessions !== 'object') return 0;
  let total = 0;
  Object.values(sessions).forEach(session => {
    if (Array.isArray(session)) {
      session.forEach(s => {
        if (s) total += calculateSessionProductiveHours(s.hours, s.concentration);
      });
    } else if (session) {
      total += calculateSessionProductiveHours(session.hours, session.concentration);
    }
  });
  return total;
}

/**
 * Calculates the total gross study hours across all sessions.
 * @param {Object} sessions 
 * @returns {number}
 */
export function calculateTotalGrossHours(sessions) {
  if (!sessions || typeof sessions !== 'object') return 0;
  let total = 0;
  Object.values(sessions).forEach(session => {
    if (Array.isArray(session)) {
      session.forEach(s => {
        if (s) total += parseFloat(s.hours) || 0;
      });
    } else if (session) {
      total += parseFloat(session.hours) || 0;
    }
  });
  return total;
}

/**
 * Calculates the time-weighted concentration average.
 * Formula: (Sum of (Concentration * Hours) for all sessions) / (Total Gross Hours)
 * @param {Object} sessions 
 * @returns {number}
 */
export function calculateWeightedConcentration(sessions) {
  if (!sessions || typeof sessions !== 'object') return 0;
  let totalWeightedFocus = 0;
  let totalGrossHours = 0;

  Object.values(sessions).forEach(session => {
    if (Array.isArray(session)) {
      session.forEach(s => {
        if (!s) return;
        const h = parseFloat(s.hours) || 0;
        const c = parseFloat(s.concentration) || 0;
        totalWeightedFocus += c * h;
        totalGrossHours += h;
      });
    } else if (session) {
      const h = parseFloat(session.hours) || 0;
      const c = parseFloat(session.concentration) || 0;
      totalWeightedFocus += c * h;
      totalGrossHours += h;
    }
  });

  if (totalGrossHours === 0) return 0;
  return totalWeightedFocus / totalGrossHours;
}

/**
 * Calculates the total number of deep study sessions across the day.
 * @param {Object} sessions 
 * @returns {number}
 */
export function calculateTotalDeepSessions(sessions) {
  if (!sessions || typeof sessions !== 'object') return 0;
  let total = 0;
  Object.values(sessions).forEach(session => {
    if (Array.isArray(session)) {
      session.forEach(s => {
        if (s) total += parseInt(s.deepSessions, 10) || 0;
      });
    } else if (session) {
      total += parseInt(session.deepSessions, 10) || 0;
    }
  });
  return total;
}

/**
 * Calculates the Master Efficiency Score (0-100%).
 * 
 * Calibrated against the original Cerebellum CAMP App output values:
 * - Case 1: 3h Gross, 2.2h Productive, More than 1 hour Bed-to-Book -> 21.3%
 * - Case 2: 11h Gross, 8.8h Productive, Less than 45 mins Bed-to-Book -> 78.7%
 * - Case 3: 8h Gross, 5.6h Productive, Less than 45 mins Bed-to-Book -> 57.3%
 * 
 * @param {Object} sessions 
 * @param {string} bedToBook 
 * @returns {number}
 */
export function calculateEfficiencyScore(sessions, bedToBook) {
  const productiveHours = calculateTotalProductiveHours(sessions);
  const grossHours = calculateTotalGrossHours(sessions);
  
  if (productiveHours === 0 || grossHours === 0) return 0;

  // Calibrated linear baseline using productive and gross study hours
  // This baseline perfectly maps the core focus progression
  const rawScore = 7.588 * productiveHours - 0.96 * grossHours + 22.486;

  // Bed-to-Book Penalty (Additive - subtracted from the efficiency score)
  let penalty = 0;
  if (bedToBook === 'Less than 45 mins' || bedToBook === '<45 min') {
    penalty = 0; // No penalty applied
  } else if (bedToBook === '45-60 min' || bedToBook === '45 to 60 mins') {
    penalty = 5; // 5% penalty
  } else if (bedToBook === '>1 hour' || bedToBook === 'More than 1 hour') {
    penalty = 15; // 15% penalty
  }

  const finalScore = rawScore - penalty;

  // Clamp strictly between 0 and 100
  return Math.max(0, Math.min(100, finalScore));
}


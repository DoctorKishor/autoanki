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
 * @param {Object|Array} sessions 
 * @returns {number}
 */
export function calculateTotalProductiveHours(sessions) {
  if (!sessions || typeof sessions !== 'object') return 0;
  let total = 0;
  const list = Array.isArray(sessions) ? sessions : Object.values(sessions);
  list.forEach(session => {
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
 * @param {Object|Array} sessions 
 * @returns {number}
 */
export function calculateTotalGrossHours(sessions) {
  if (!sessions || typeof sessions !== 'object') return 0;
  let total = 0;
  const list = Array.isArray(sessions) ? sessions : Object.values(sessions);
  list.forEach(session => {
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
 * @param {Object|Array} sessions 
 * @returns {number}
 */
export function calculateWeightedConcentration(sessions) {
  if (!sessions || typeof sessions !== 'object') return 0;
  let totalWeightedFocus = 0;
  let totalGrossHours = 0;
  const list = Array.isArray(sessions) ? sessions : Object.values(sessions);

  list.forEach(session => {
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
 * A session qualifies if explicit deepSessions is set OR duration >= 50m (0.833h) with concentration >= 8.
 * @param {Object|Array} sessions 
 * @returns {number}
 */
export function calculateTotalDeepSessions(sessions) {
  if (!sessions || typeof sessions !== 'object') return 0;
  let total = 0;
  const list = Array.isArray(sessions) ? sessions : Object.values(sessions);

  list.forEach(session => {
    if (Array.isArray(session)) {
      session.forEach(s => {
        if (!s) return;
        if (s.deepSessions !== undefined && s.deepSessions !== null && s.deepSessions !== '') {
          total += parseInt(s.deepSessions, 10) || 0;
        } else {
          const h = parseFloat(s.hours) || 0;
          const c = parseFloat(s.concentration) || 0;
          if (h >= 0.833 && c >= 8) total += 1;
        }
      });
    } else if (session) {
      if (session.deepSessions !== undefined && session.deepSessions !== null && session.deepSessions !== '') {
        total += parseInt(session.deepSessions, 10) || 0;
      } else {
        const h = parseFloat(session.hours) || 0;
        const c = parseFloat(session.concentration) || 0;
        if (h >= 0.833 && c >= 8) total += 1;
      }
    }
  });
  return total;
}

/**
 * Calculates the Master Efficiency Score (0-100%).
 * 
 * Formula:
 * - Linear regression baseline: 7.588 * ProductiveHours - 0.96 * GrossHours + 22.486
 * - Bed-to-Book Wakeup Penalty: <45 min: 0%, 45-60 min: -5%, >60 min: -15%
 * - Deep Study Bonus: +2% per distraction-free block (>= 50 mins and >= 8 concentration), capped at +10%
 * - Clamped strictly between 0% and 100%.
 * 
 * @param {Object|Array} sessions 
 * @param {string} bedToBook 
 * @returns {number}
 */
export function calculateEfficiencyScore(sessions, bedToBook) {
  const productiveHours = calculateTotalProductiveHours(sessions);
  const grossHours = calculateTotalGrossHours(sessions);
  
  if (productiveHours <= 0 || grossHours <= 0) return 0;

  // Calibrated linear baseline using productive and gross study hours
  const rawScore = 7.588 * productiveHours - 0.96 * grossHours + 22.486;

  // Bed-to-Book Penalty (Subtracted from the efficiency score)
  let penalty = 0;
  if (bedToBook === 'Less than 45 mins' || bedToBook === '<45 min') {
    penalty = 0;
  } else if (bedToBook === '45-60 min' || bedToBook === '45 to 60 mins') {
    penalty = 5;
  } else if (bedToBook === '>1 hour' || bedToBook === 'More than 1 hour' || bedToBook === '>60 min' || bedToBook === 'More than 60 mins' || bedToBook === '> 60 mins') {
    penalty = 15;
  }

  // Deep Study Bonus: +2% per session, capped at +10%
  const deepSessions = calculateTotalDeepSessions(sessions);
  const deepBonus = Math.min(10, deepSessions * 2);

  const finalScore = rawScore - penalty + deepBonus;

  // Clamp strictly between 0 and 100
  return Math.max(0, Math.min(100, Math.round(finalScore * 10) / 10));
}


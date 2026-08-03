export const generateMockHealthData = (daysCount = 180) => {
  const data = [];
  const start = new Date();
  start.setDate(start.getDate() - daysCount);

  for (let i = 0; i < daysCount; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);
    const dateString = currentDate.toISOString().split('T')[0];

    // Determine sleep metrics
    const isBadSleep = Math.random() < 0.25;
    const sleep_hours = isBadSleep
      ? parseFloat((4.5 + Math.random() * 1.4).toFixed(1))
      : parseFloat((6.2 + Math.random() * 2.3).toFixed(1));
    const sleep_score = Math.round(sleep_hours * 10 + (Math.random() * 10 - 5));

    // Determine workout metrics: 40% Rest (None), 30% Lifting, 30% Cardio
    const randWorkout = Math.random();
    let workout_type = 'None';
    let workout_duration = 0;
    if (randWorkout < 0.3) {
      workout_type = 'Lifting';
      workout_duration = Math.round(45 + Math.random() * 30);
    } else if (randWorkout < 0.6) {
      workout_type = 'Cardio';
      workout_duration = Math.round(20 + Math.random() * 25);
    }

    // Correlation: Sleep vs Anki Speed (seconds per card - lower is faster)
    let anki_review_speed = 0;
    if (sleep_hours < 6.0) {
      anki_review_speed = parseFloat((9.5 + Math.random() * 3.5).toFixed(1));
    } else {
      anki_review_speed = parseFloat((5.0 + Math.random() * 3.0).toFixed(1));
    }

    // Correlation: Workout vs Study Duration (minutes)
    let study_duration = 0;
    if (workout_type === 'Lifting') {
      study_duration = Math.round(150 + Math.random() * 80);
    } else if (workout_type === 'Cardio') {
      study_duration = Math.round(180 + Math.random() * 90);
    } else {
      study_duration = Math.round(240 + Math.random() * 120);
    }

    data.push({
      date: dateString,
      sleep_hours,
      sleep_score: Math.min(100, Math.max(0, sleep_score)),
      workout_type,
      workout_duration,
      anki_review_speed,
      study_duration
    });
  }

  return data;
};

export const mockHealthData = generateMockHealthData();

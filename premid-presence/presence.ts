const appOpenTime = Date.now();
let observer: MutationObserver | null = null;

// PreMiD global declaration helper
declare const Presence: any;

const presence = new Presence({
  // Using AnkiWeb's registered Discord Client ID as a temporary working ID for local testing
  clientId: '1050466196220289104'
});

presence.on('UpdateData', () => {
  const bridge = document.getElementById('auto-anki-presence-bridge');

  // If the bridge element is not present (e.g. user is logged out, on landing page, or app loading)
  if (!bridge) {
    presence.setActivity(); // Clears activity
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    return;
  }

  // Setup MutationObserver for real-time reactivity when react state/ bridge attributes change
  if (!observer) {
    observer = new MutationObserver(() => {
      const b = document.getElementById('auto-anki-presence-bridge');
      if (b) updatePresence(b);
    });
    observer.observe(bridge, { attributes: true });
  }

  updatePresence(bridge);
});

function updatePresence(bridge: HTMLElement) {
  // Extract variables from hidden DOM element attributes
  const currentTab = bridge.getAttribute('data-current-tab') || 'dashboard';
  const currentDeck = bridge.getAttribute('data-current-deck') || 'Root';
  const streak = parseInt(bridge.getAttribute('data-streak') || '0', 10) || 0;
  const longestStreak = parseInt(bridge.getAttribute('data-longest-streak') || '0', 10) || 0;
  const dueCardsCount = parseInt(bridge.getAttribute('data-due-cards-count') || '0', 10) || 0;
  const totalCardsCount = parseInt(bridge.getAttribute('data-total-cards-count') || '0', 10) || 0;
  const activeStudyCardIndex = parseInt(bridge.getAttribute('data-active-study-card-index') || '0', 10) || 0;
  const studyActiveTab = bridge.getAttribute('data-study-active-tab') || '';
  const companionSubTab = bridge.getAttribute('data-companion-sub-tab') || '';
  const isAnswerRevealed = bridge.getAttribute('data-is-answer-revealed') === 'true';
  const isTimerFullscreen = bridge.getAttribute('data-is-timer-fullscreen') === 'true';

  // Extract timer states
  const timerType = bridge.getAttribute('data-timer-type') || 'pomodoro';
  const timerStatus = bridge.getAttribute('data-timer-status') || 'idle';
  const timerMode = bridge.getAttribute('data-timer-mode') || 'study';
  const timerTimeLeft = parseInt(bridge.getAttribute('data-timer-time-left') || '0', 10) || 0;
  const timerStopwatchMs = parseInt(bridge.getAttribute('data-timer-stopwatch-ms') || '0', 10) || 0;
  const pomodoroRound = parseInt(bridge.getAttribute('data-timer-pomodoro-round') || '1', 10) || 1;
  const pomodoroTarget = parseInt(bridge.getAttribute('data-timer-pomodoro-target') || '4', 10) || 4;

  // Extract study metrics
  const todayHours = parseFloat(bridge.getAttribute('data-today-hours') || '0');
  const todayQuestions = parseInt(bridge.getAttribute('data-today-questions') || '0', 10) || 0;
  const todayPages = parseInt(bridge.getAttribute('data-today-pages') || '0', 10) || 0;
  const todayCards = parseInt(bridge.getAttribute('data-today-cards') || '0', 10) || 0;
  const activeScheduleTopic = bridge.getAttribute('data-active-schedule-topic') || '';
  const dailyNotes = bridge.getAttribute('data-daily-notes') || '';

  // Clean and truncate daily notes if they exceed Discord character limits
  const cleanedDailyNotes = dailyNotes.trim();
  const friendlyDailyNotes = cleanedDailyNotes.length > 90 
    ? cleanedDailyNotes.slice(0, 87) + '...' 
    : cleanedDailyNotes;

  // Calculate real-time total hours including running stopwatch
  const activeStopwatchHours = (timerType === 'stopwatch' && timerStatus === 'running') 
    ? (timerStopwatchMs / 3600000) 
    : 0;
  const totalHoursStr = (todayHours + activeStopwatchHours).toFixed(1);

  // Formulate today's study progress with all 4 metrics
  const todayProgressSummary = `⏱️${totalHoursStr}h | 📝${todayQuestions}Q | 🎴${todayCards}c | 📖${todayPages}p`;

  // Base presence configuration
  const origin = window.location.origin;
  const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1') || origin.startsWith('http://192.168.');
  
  // Discord's image proxy cannot fetch images from localhost or private IPs.
  // When running locally, we fall back to the public deployed site's assets.
  // Also, Discord does not support SVG images (like favicon.svg), so we use the PNG app_icon.png instead.
  const assetsBaseUrl = isLocal ? 'https://autoanki-d7f3c.web.app' : origin;
  
  const activity: any = {
    largeImageKey: `${assetsBaseUrl}/developer_profile_square.png`,
    largeImageText: 'Auto-Anki Study Companion',
    smallImageKey: `${assetsBaseUrl}/app_icon.png`,
    smallImageText: streak > 0 
      ? `Daily Streak: 🔥 ${streak} days (Record: 🏆 ${longestStreak})` 
      : 'Auto-Anki Study Companion'
  };

  // --- TIMER DISPLAY SYSTEM ---
  if (timerStatus === 'running') {
    if (timerType === 'pomodoro') {
      activity.endTimestamp = Date.now() + timerTimeLeft * 1000;
    } else if (timerType === 'timer') {
      activity.endTimestamp = Date.now() + timerTimeLeft * 1000;
    } else if (timerType === 'stopwatch') {
      activity.startTimestamp = Date.now() - timerStopwatchMs;
    }
  } else {
    // If no running timer, display the entire app open time as the running stopwatch
    activity.startTimestamp = appOpenTime;
  }

  // Define if the user is in one of the primary focus/study dashboard views
  const isFocusView = currentTab === 'dashboard' || currentTab === 'study' || currentTab === 'studyRoom' || isTimerFullscreen;

  // --- DETAILS LINE: SUBJECT & ACTIVE SESSION ---
  if (isFocusView) {
    if (timerStatus === 'running') {
      // Active session details (timer is running)
      if (timerType === 'pomodoro') {
        activity.details = timerMode === 'study'
          ? (activeScheduleTopic ? `Focusing on: ${activeScheduleTopic}` : (friendlyDailyNotes ? `Subject: ${friendlyDailyNotes}` : 'Pomodoro Focus Sprint'))
          : `Pomodoro: Rest Break ☕`;
      } else {
        activity.details = activeScheduleTopic 
          ? `Focusing on: ${activeScheduleTopic}`
          : (friendlyDailyNotes ? `Subject: ${friendlyDailyNotes}` : `Focus Session (${timerType})`);
      }
    } else {
      // Idle state on focus tabs displays the subject notes if set
      if (friendlyDailyNotes) {
        activity.details = `Subject: ${friendlyDailyNotes}`;
      } else if (activeScheduleTopic) {
        activity.details = `Focusing on: ${activeScheduleTopic}`;
      } else {
        // Fallbacks for focus tabs when no subject is set
        if (currentTab === 'study') {
          const studyMode = studyActiveTab ? `${studyActiveTab.charAt(0).toUpperCase() + studyActiveTab.slice(1)}` : 'Record';
          activity.details = `Study Room: ${studyMode}`;
        } else if (currentTab === 'studyRoom') {
          const subMode = companionSubTab ? `${companionSubTab.charAt(0).toUpperCase() + companionSubTab.slice(1)}` : 'Sprints';
          activity.details = `Study Room: Logging ${subMode}`;
        } else {
          activity.details = 'NEET PG / INICET Prep Dashboard';
        }
      }
    }
  } else {
    // Other tabs: Show standard page-specific details line
    switch (currentTab) {
      case 'campTracker':
        activity.details = 'Analyzing CAMP Study Metrics';
        break;

      case 'subjectTracker':
        activity.details = 'Tracking Subject Completion';
        break;

      case 'studyScheduler':
        activity.details = 'Planning Study Calendar';
        break;

      case 'analytics':
        activity.details = 'Analyzing Study Performance';
        break;

      case 'correlation':
        activity.details = 'Analyzing Topic Correlations';
        break;

      case 'cards':
        activity.details = 'Generating Study Materials';
        break;

      case 'library':
        activity.details = currentDeck === 'Root' 
          ? 'Browsing Study Library'
          : `Subject: ${currentDeck.replace(/::/g, ' ➔ ')}`;
        break;

      case 'settings':
        activity.details = 'Configuring Settings';
        break;

      case 'about':
        activity.details = 'Reading App Details';
        break;

      case 'trash':
        activity.details = 'Managing Archive';
        break;

      case 'export':
        activity.details = 'Exporting Study Guides';
        break;

      case 'prompt':
        activity.details = 'Editing Prompts';
        break;

      case 'pytManager':
        activity.details = 'Managing High-Yield Topics (PyT)';
        break;

      case 'pytLogger':
        activity.details = 'Logging PyT Sprints';
        break;

      case 'obsOverlay':
        activity.details = 'Configuring Stream Overlay';
        break;

      default:
        activity.details = 'Preparing with Auto-Anki';
    }
  }

  // --- STATE LINE: TOPIC & METRICS DISPLAY ---
  if (isFocusView) {
    if (timerStatus === 'running') {
      if (timerType === 'pomodoro') {
        const topicText = activeScheduleTopic ? ` • ${activeScheduleTopic}` : (friendlyDailyNotes ? ` • ${friendlyDailyNotes}` : '');
        activity.state = `Round ${pomodoroRound}/${pomodoroTarget}${topicText} • ${todayProgressSummary}`;
      } else {
        const topicText = activeScheduleTopic ? `${activeScheduleTopic} • ` : (friendlyDailyNotes ? `${friendlyDailyNotes} • ` : '');
        activity.state = `${topicText}${todayProgressSummary}`;
      }
    } else {
      const topicText = activeScheduleTopic ? `Active: ${activeScheduleTopic} • ` : '';
      activity.state = `${topicText}${todayProgressSummary}`;
    }
  } else {
    // Other tabs: standard streak and progress summary
    activity.state = `Streak: 🔥 ${streak}d • ${todayProgressSummary}`;
  }

  // Include direct navigation link button
  activity.buttons = [
    {
      label: 'Open Auto-Anki',
      url: window.location.origin
    }
  ];

  presence.setActivity(activity);
}

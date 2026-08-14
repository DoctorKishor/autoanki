import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  User,
  Clock,
  BookOpen,
  Award,
  Activity,
  HelpCircle,
  Mail,
  Phone,
  CheckCircle,
  FileText,
  Trash2,
  History,
  Filter
} from 'lucide-react';
import {
  getLocalCampData,
  saveLocalCampData,
  getLocalCampDailyLogs,
  saveLocalCampDailyLogs
} from '../../services/localDb';
import CollapsibleCard from './CollapsibleCard';
import ProgressChart from './ProgressChart';
import {
  calculateSessionProductiveHours,
  calculateTotalProductiveHours,
  calculateTotalGrossHours,
  calculateWeightedConcentration,
  calculateEfficiencyScore
} from '../../utils/campCalculations';


export default function CampDashboard({ 
  timerState, 
  localStopwatchTime, 
  localCustomTimerTimeLeft, 
  localTimerTimeLeft 
}) {
  const todayDateStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const todayLabel = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).replace(' ', '-'); // e.g. "27-May"

  const [selectedDate, setSelectedDate] = useState(todayDateStr);

  // Migration helper to convert single session objects to arrays
  const normalizeSessions = (data) => {
    const cats = ['preLunch', 'midDay', 'postDinner'];
    const norm = {};
    cats.forEach(c => {
      if (!data || !data[c]) {
        norm[c] = [];
      } else if (Array.isArray(data[c])) {
        norm[c] = data[c];
      } else {
        const old = data[c];
        const oldHrs = parseFloat(old.hours) || 0;
        if (oldHrs > 0) {
          norm[c] = [{
            id: 'migrated_1',
            hours: oldHrs.toString(),
            concentration: Number(old.concentration) || 7,
            type: 'notes',
            isManual: false
          }];
        } else {
          norm[c] = [];
        }
      }
    });
    return norm;
  };

  // 1. Initial State
  const [studentInfo, setStudentInfo] = useState(() => {
    const saved = localStorage.getItem('camp_student_info');
    return saved ? JSON.parse(saved) : {
      name: 'Kishor Anbashagan',
      email: 'kishor.kct2158@gmail.com',
      phone: '+919943360010'
    };
  });

  const [bedToBook, setBedToBook] = useState(() => {
    const saved = localStorage.getItem(`camp_bedToBook_${todayDateStr}`);
    return saved || 'Less than 45 mins';
  });

  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem(`camp_sessions_${todayDateStr}`);
    return saved ? normalizeSessions(JSON.parse(saved)) : {
      preLunch: [],
      midDay: [],
      postDinner: []
    };
  });

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('camp_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [timerHistory, setTimerHistory] = useState(() => {
    const saved = localStorage.getItem('camp_timer_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedCell, setSelectedCell] = useState(null);
  const [showOverviewModal, setShowOverviewModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [hasLoadedLocalDb, setHasLoadedLocalDb] = useState(false);
  const currentSessionsDateRef = useRef(selectedDate);
  const currentB2bDateRef = useRef(selectedDate);

  const isManuallyEditingRef = useRef(false);
  const manualEditTimeoutRef = useRef(null);

  const studentInfoDebounceRef = useRef(null);
  const bedToBookDebounceRef = useRef(null);
  const sessionsDebounceRef = useRef(null);
  const historyDebounceRef = useRef(null);
  const timerHistoryDebounceRef = useRef(null);

  const [showYesterdayPrompt, setShowYesterdayPrompt] = useState(false);
  const [yesterdayLabelText, setYesterdayLabelText] = useState('');
  const [yesterdayDateVal, setYesterdayDateVal] = useState('');
  const [hasPromptedYesterday, setHasPromptedYesterday] = useState(false);

  // Helper mapping functions to prevent broken select bindings with floats
  const getNearestHalfHour = (val) => {
    const num = parseFloat(val) || 0;
    return (Math.round(num * 2) / 2).toString();
  };

  const getNearestInteger = (val) => {
    const num = Math.round(parseFloat(val)) || 7;
    return Math.max(1, Math.min(10, num)).toString();
  };

  useEffect(() => {
    if (hasPromptedYesterday) return;

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yDateStr = yesterdayDate.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const yLabel = yesterdayDate.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).replace(' ', '-'); // e.g. "23-Jun"

    const loggedYesterday = history.some(h => h.date === yLabel);
    if (!loggedYesterday) {
      setYesterdayLabelText(yLabel);
      setYesterdayDateVal(yDateStr);
      setShowYesterdayPrompt(true);
      setHasPromptedYesterday(true);
    }
  }, [history, hasPromptedYesterday]);

  // 1.5. Fetch local CAMP data from IndexedDB on mount to populate state safely
  useEffect(() => {
    let active = true;
    const fetchLocalDbData = async () => {
      try {
        const [histData, thData, infoData] = await Promise.all([
          getLocalCampData('history'),
          getLocalCampData('timer_history'),
          getLocalCampData('student_info')
        ]);

        if (!active) return;

        if (histData && Array.isArray(histData)) {
          setHistory(histData);
          localStorage.setItem('camp_history', JSON.stringify(histData));
        }

        if (thData && Array.isArray(thData)) {
          setTimerHistory(thData);
          localStorage.setItem('camp_timer_history', JSON.stringify(thData));
        }

        if (infoData && typeof infoData === 'object') {
          setStudentInfo(infoData);
          localStorage.setItem('camp_student_info', JSON.stringify(infoData));
        }
      } catch (err) {
        console.error("[LocalDB] Error loading CAMP data:", err);
      } finally {
        if (active) {
          setHasLoadedLocalDb(true);
        }
      }
    };

    fetchLocalDbData();
    return () => { active = false; };
  }, []);

  // 1.6. Reactively load sessions and B2B whenever selectedDate changes
  useEffect(() => {
    let active = true;
    const loadDaily = async () => {
      const log = await getLocalCampDailyLogs(selectedDate);
      if (!active) return;
      if (log) {
        if (log.sessions) {
          const norm = normalizeSessions(log.sessions);
          setSessions(norm);
          localStorage.setItem(`camp_sessions_${selectedDate}`, JSON.stringify(norm));
        }
        if (log.bedToBook) {
          setBedToBook(log.bedToBook);
          localStorage.setItem(`camp_bedToBook_${selectedDate}`, log.bedToBook);
        }
      } else {
        const savedSessions = localStorage.getItem(`camp_sessions_${selectedDate}`);
        const parsedSessions = savedSessions ? normalizeSessions(JSON.parse(savedSessions)) : {
          preLunch: [],
          midDay: [],
          postDinner: []
        };
        const savedB2B = localStorage.getItem(`camp_bedToBook_${selectedDate}`);
        const b2bValue = savedB2B || 'Less than 45 mins';
        setSessions(parsedSessions);
        setBedToBook(b2bValue);
      }
    };

    loadDaily();
    currentSessionsDateRef.current = selectedDate;
    currentB2bDateRef.current = selectedDate;
    return () => { active = false; };
  }, [selectedDate]);

  // 2. Persist Student Info
  useEffect(() => {
    if (!hasLoadedLocalDb) return;
    localStorage.setItem('camp_student_info', JSON.stringify(studentInfo));
    clearTimeout(studentInfoDebounceRef.current);
    studentInfoDebounceRef.current = setTimeout(() => {
      saveLocalCampData('student_info', studentInfo);
    }, 500);
    return () => clearTimeout(studentInfoDebounceRef.current);
  }, [studentInfo, hasLoadedLocalDb]);

  // 3. Persist Daily Inputs based on selectedDate
  useEffect(() => {
    if (!hasLoadedLocalDb || currentB2bDateRef.current !== selectedDate) return;
    localStorage.setItem(`camp_bedToBook_${selectedDate}`, bedToBook);
    clearTimeout(bedToBookDebounceRef.current);
    bedToBookDebounceRef.current = setTimeout(() => {
      saveLocalCampDailyLogs(selectedDate, { bedToBook });
    }, 500);
    return () => clearTimeout(bedToBookDebounceRef.current);
  }, [bedToBook, selectedDate, hasLoadedLocalDb]);

  useEffect(() => {
    if (!hasLoadedLocalDb || currentSessionsDateRef.current !== selectedDate) return;
    localStorage.setItem(`camp_sessions_${selectedDate}`, JSON.stringify(sessions));
    clearTimeout(sessionsDebounceRef.current);
    sessionsDebounceRef.current = setTimeout(() => {
      saveLocalCampDailyLogs(selectedDate, { sessions });
    }, 500);
    return () => clearTimeout(sessionsDebounceRef.current);
  }, [sessions, selectedDate, hasLoadedLocalDb]);

  // 3a. Persist History & Timer History based on state changes
  useEffect(() => {
    if (!hasLoadedLocalDb) return;
    localStorage.setItem('camp_history', JSON.stringify(history));
    clearTimeout(historyDebounceRef.current);
    historyDebounceRef.current = setTimeout(() => {
      saveLocalCampData('history', history);
    }, 500);
    return () => clearTimeout(historyDebounceRef.current);
  }, [history, hasLoadedLocalDb]);

  useEffect(() => {
    if (!hasLoadedLocalDb) return;
    localStorage.setItem('camp_timer_history', JSON.stringify(timerHistory));
    clearTimeout(timerHistoryDebounceRef.current);
    timerHistoryDebounceRef.current = setTimeout(() => {
      saveLocalCampData('timer_history', timerHistory);
    }, 500);
    return () => clearTimeout(timerHistoryDebounceRef.current);
  }, [timerHistory, hasLoadedLocalDb]);

  // 3b. Real-time BroadcastChannel sync for CAMP overlay widgets
  useEffect(() => {
    const channel = new BroadcastChannel('auto_anki_obs_channel');
    channel.postMessage({
      type: 'CAMP_STATE_UPDATE',
      payload: {
        campSessions: JSON.stringify(sessions),
        campB2B: bedToBook,
        campHistory: JSON.stringify(history),
        campTimerHistory: JSON.stringify(timerHistory),
        campStudentInfo: JSON.stringify(studentInfo),
        selectedDate
      }
    });
    return () => channel.close();
  }, [sessions, bedToBook, history, timerHistory, studentInfo, selectedDate]);

  // 3c. Sync inputs and timer history in real time from localStorage (for active timer modal logs)
  useEffect(() => {
    const syncData = () => {
      if (isManuallyEditingRef.current) return;
      const savedSessions = localStorage.getItem(`camp_sessions_${selectedDate}`);
      if (savedSessions) {
        setSessions(prev => {
          const parsed = normalizeSessions(JSON.parse(savedSessions));
          if (JSON.stringify(prev) !== JSON.stringify(parsed)) {
            return parsed;
          }
          return prev;
        });
      }

      const savedB2B = localStorage.getItem(`camp_bedToBook_${selectedDate}`);
      if (savedB2B && savedB2B !== bedToBook) {
        setBedToBook(savedB2B);
      }

      const savedTimerHistory = localStorage.getItem('camp_timer_history');
      if (savedTimerHistory) {
        setTimerHistory(prev => {
          const parsed = JSON.parse(savedTimerHistory);
          if (JSON.stringify(prev) !== JSON.stringify(parsed)) {
            return parsed;
          }
          return prev;
        });
      }

      const savedCampHistory = localStorage.getItem('camp_history');
      if (savedCampHistory) {
        setHistory(prev => {
          const parsed = JSON.parse(savedCampHistory);
          if (JSON.stringify(prev) !== JSON.stringify(parsed)) {
            return parsed;
          }
          return prev;
        });
      }
    };

    syncData();
    const interval = setInterval(syncData, 300000);
    return () => clearInterval(interval);
  }, [selectedDate, bedToBook]);

  // Helper to calculate the running timer's current elapsed hours for a specific date
  const getRunningTimerElapsedHoursForDate = (dateStr) => {
    if (!timerState || timerState.status !== 'running') return 0;
    
    let startedAt = timerState.startedAt;
    if (!startedAt) return 0;

    let totalElapsedMs = 0;
    if (timerState.timerType === 'stopwatch') {
      totalElapsedMs = localStopwatchTime || 0;
    } else if (timerState.timerType === 'timer') {
      const total = (timerState.timerDuration || 600) * 1000;
      totalElapsedMs = Math.max(0, total - (localCustomTimerTimeLeft ?? (total / 1000)) * 1000);
    } else if (timerState.timerType === 'pomodoro' && timerState.pomodoroMode === 'study') {
      const total = (timerState.pomodoroDuration || 1500) * 1000;
      totalElapsedMs = Math.max(0, total - (localTimerTimeLeft ?? (total / 1000)) * 1000);
    }
    
    if (totalElapsedMs <= 0) return 0;

    const startTime = startedAt;
    const endTime = startedAt + totalElapsedMs;

    const [yr, mo, dy] = dateStr.split('-').map(Number);
    const dateStart = new Date(yr, mo - 1, dy, 0, 0, 0, 0).getTime();
    const dateEnd = new Date(yr, mo - 1, dy, 23, 59, 59, 999).getTime();

    const intersectStart = Math.max(startTime, dateStart);
    const intersectEnd = Math.min(endTime, dateEnd);

    if (intersectStart < intersectEnd) {
      return (intersectEnd - intersectStart) / 3600000;
    }
    return 0;
  };

  const getPeriodForTimestamp = (ts) => {
    const hour = new Date(ts).getHours();
    if (hour < 13) return 'preLunch';      // midnight to 1pm
    if (hour < 19) return 'midDay';        // 1pm to 7pm
    return 'postDinner';                    // 7pm to midnight
  };

  // 4. Calculate Values Reactively
  const runningHrs = getRunningTimerElapsedHoursForDate(selectedDate);
  
  let runningPeriod = 'postDinner';
  if (runningHrs > 0.001 && timerState?.startedAt) {
    const [yr, mo, dy] = selectedDate.split('-').map(Number);
    const dateStart = new Date(yr, mo - 1, dy, 0, 0, 0, 0).getTime();
    const intersectStart = Math.max(timerState.startedAt, dateStart);
    runningPeriod = getPeriodForTimestamp(intersectStart);
  }

  // Create a sessions copy that includes the active running timer as a virtual session block
  const sessionsWithRunning = { ...sessions };
  if (runningHrs > 0.001) {
    const runningSessionItem = {
      id: 'running_active_timer',
      hours: runningHrs.toFixed(3),
      concentration: 7, // default focus
      type: timerState.timerType === 'pomodoro' ? 'pomodoro' : 'timer',
      isRunning: true
    };
    sessionsWithRunning[runningPeriod] = [
      ...(sessions[runningPeriod] || []),
      runningSessionItem
    ];
  }

  const getAggregatedSessions = (state) => {
    const agg = {};
    const cats = ['preLunch', 'midDay', 'postDinner'];
    cats.forEach(cat => {
      const list = state[cat] || [];
      const totalHours = list.reduce((sum, s) => sum + (parseFloat(s.hours) || 0), 0);
      let avgFocus = 7;
      if (list.length > 0) {
        const sumFocus = list.reduce((sum, s) => sum + (Number(s.concentration) || 7), 0);
        avgFocus = sumFocus / list.length;
      }
      agg[cat] = {
        hours: totalHours.toString(),
        deepSessions: Math.round(totalHours * 2) / 2,
        concentration: Math.round(avgFocus)
      };
    });
    return agg;
  };

  const aggregatedSessions = getAggregatedSessions(sessionsWithRunning);

  const grossHours = calculateTotalGrossHours(aggregatedSessions);
  const productiveHours = calculateTotalProductiveHours(aggregatedSessions);
  const weightedConcentration = calculateWeightedConcentration(aggregatedSessions);
  const efficiencyScore = calculateEfficiencyScore(aggregatedSessions, bedToBook);

  const preLunchEffective = calculateSessionProductiveHours(aggregatedSessions.preLunch.hours, aggregatedSessions.preLunch.concentration);
  const midDayEffective = calculateSessionProductiveHours(aggregatedSessions.midDay.hours, aggregatedSessions.midDay.concentration);
  const postDinnerEffective = calculateSessionProductiveHours(aggregatedSessions.postDinner.hours, aggregatedSessions.postDinner.concentration);

  // 5. Save/Log Selected Date's Entry
  const handleSaveProgress = () => {
    setSaveStatus('Saving...');

    const [yr, mo, dy] = selectedDate.split('-').map(Number);
    const dateObj = new Date(yr, mo - 1, dy);
    const dateLabel = dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).replace(' ', '-');

    const updatedHistory = [...history];
    const dayIndex = updatedHistory.findIndex(h => h.date === dateLabel);

    if (dayIndex >= 0) {
      updatedHistory[dayIndex].score = efficiencyScore;
    } else {
      updatedHistory.push({ date: dateLabel, score: efficiencyScore });
    }

    // Chronological sorting of entries
    updatedHistory.sort((a, b) => {
      const currentYear = new Date().getFullYear();
      const dateA = new Date(`${a.date}-${currentYear}`);
      const dateB = new Date(`${b.date}-${currentYear}`);
      return dateA - dateB;
    });

    setHistory(updatedHistory);

    setTimeout(() => {
      setSaveStatus('Progress Logged Successfully!');
      setTimeout(() => setSaveStatus(''), 2000);
    }, 600);
  };

  const handleSessionChange = (sessionKey, sessionId, field, value) => {
    isManuallyEditingRef.current = true;
    clearTimeout(manualEditTimeoutRef.current);
    manualEditTimeoutRef.current = setTimeout(() => {
      isManuallyEditingRef.current = false;
    }, 2000);

    setSessions(prev => {
      const list = prev[sessionKey] || [];
      const updatedList = list.map(sess => {
        if (sess.id === sessionId) {
          const updated = { ...sess };
          if (field === 'hours') {
            updated.hours = value;
          } else if (field === 'concentration') {
            updated.concentration = parseInt(value, 10) || 7;
          }
          return updated;
        }
        return sess;
      });
      return {
        ...prev,
        [sessionKey]: updatedList
      };
    });
  };

  const handleAddManualSession = (sessionKey) => {
    isManuallyEditingRef.current = true;
    clearTimeout(manualEditTimeoutRef.current);
    manualEditTimeoutRef.current = setTimeout(() => {
      isManuallyEditingRef.current = false;
    }, 2000);

    setSessions(prev => {
      const list = prev[sessionKey] || [];
      const newSession = {
        id: 'manual_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
        hours: '1.0',
        concentration: 7,
        type: 'notes',
        isManual: true
      };
      return {
        ...prev,
        [sessionKey]: [...list, newSession]
      };
    });
  };

  const handleDeleteSession = (sessionKey, sessionId) => {
    isManuallyEditingRef.current = true;
    clearTimeout(manualEditTimeoutRef.current);
    manualEditTimeoutRef.current = setTimeout(() => {
      isManuallyEditingRef.current = false;
    }, 2000);

    setSessions(prev => {
      const list = prev[sessionKey] || [];
      const updatedList = list.filter(sess => sess.id !== sessionId);
      return {
        ...prev,
        [sessionKey]: updatedList
      };
    });
  };

  // Deletes an entry from history and updates LocalStorage/State
  const handleDeleteHistoryItem = (indexToDelete) => {
    const updatedHistory = history.filter((_, idx) => idx !== indexToDelete);
    setHistory(updatedHistory);
  };

  // State for session history filter
  const [historyFilterDate, setHistoryFilterDate] = useState('');

  // Rebuilds camp_sessions for a given date from remaining timer history after a deletion
  const rebuildCampSessionsForDate = (dateStr, remainingHistory) => {
    const relevantItems = remainingHistory.filter(h => h.date === dateStr);
    const rebuilt = {
      preLunch: [],
      midDay: [],
      postDinner: []
    };
    relevantItems.forEach(item => {
      if (!rebuilt[item.period]) return;
      rebuilt[item.period].push({
        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
        hours: item.hours.toFixed(3),
        concentration: item.concentration,
        type: item.type || 'notes',
        pagesRead: item.pagesRead || 0,
        questionsSolved: item.questionsSolved || 0,
        cardsReviewed: item.cardsReviewed || 0,
        gtDetails: item.gtDetails || null,
        isManual: false
      });
    });
    localStorage.setItem(`camp_sessions_${dateStr}`, JSON.stringify(rebuilt));
    saveLocalCampDailyLogs(dateStr, { sessions: rebuilt });
    // If this is the currently selected date, update UI state too
    if (dateStr === selectedDate) {
      setSessions(rebuilt);
    }
  };

  // Deletes an individual timer session log entry and re-syncs camp_sessions
  const handleDeleteTimerHistoryItem = (indexToDelete) => {
    const itemToDelete = timerHistory[indexToDelete];
    const updatedHistory = timerHistory.filter((_, idx) => idx !== indexToDelete);
    setTimerHistory(updatedHistory);
    // Rebuild camp_sessions for the affected date
    if (itemToDelete?.date) {
      rebuildCampSessionsForDate(itemToDelete.date, updatedHistory);
    }
  };

  // Deep Study Sessions (Hours) Options (Half-Hour Steps: 0 to 12)
  const hoursOptions = Array.from({ length: 25 }, (_, i) => i * 0.5);

  // Concentration (Focus Rating) Options (1 to 10)
  const concentrationOptions = Array.from({ length: 10 }, (_, i) => i + 1);

  // --- FOCUS CORRELATION HEATMAP STATISTICS ---
  const sessionTypes = [
    { id: 'notes', label: 'Study Notes' },
    { id: 'qbank', label: 'Qbank' },
    { id: 'flashcards', label: 'Flashcards' },
    { id: 'gt', label: 'Grand Test' }
  ];

  const periodsList = [
    { id: 'preLunch', label: 'Pre Lunch' },
    { id: 'midDay', label: 'Midday' },
    { id: 'postDinner', label: 'Post Dinner' }
  ];

  const cellStats = {};
  sessionTypes.forEach(t => {
    periodsList.forEach(p => {
      cellStats[`${t.id}_${p.id}`] = {
        sumFocus: 0,
        count: 0,
        sumHours: 0
      };
    });
  });

  timerHistory.forEach(item => {
    const key = `${item.type}_${item.period}`;
    if (cellStats[key]) {
      cellStats[key].sumFocus += item.concentration;
      cellStats[key].count += 1;
      cellStats[key].sumHours += item.hours;
    }
  });

  const getCellData = (typeId, periodId) => {
    const stat = cellStats[`${typeId}_${periodId}`];
    if (!stat || stat.count === 0) return { avgFocus: 0, count: 0, avgHrs: 0 };
    return {
      avgFocus: Math.round((stat.sumFocus / stat.count) * 10) / 10,
      count: stat.count,
      avgHrs: Math.round((stat.sumHours / stat.count) * 10) / 10
    };
  };

  // Derive optimal insights
  const getDerivedInsights = () => {
    // 1. Best period for flashcards
    const flashcardSessions = timerHistory.filter(h => h.type === 'flashcards');
    let bestFlashcardPeriod = 'preLunch';
    let maxFlashcardFocus = 0;
    const flashcardPeriodSums = {};
    flashcardSessions.forEach(s => {
      if (!flashcardPeriodSums[s.period]) flashcardPeriodSums[s.period] = { sum: 0, count: 0 };
      flashcardPeriodSums[s.period].sum += s.concentration;
      flashcardPeriodSums[s.period].count += 1;
    });
    Object.keys(flashcardPeriodSums).forEach(p => {
      const avg = flashcardPeriodSums[p].sum / flashcardPeriodSums[p].count;
      if (avg > maxFlashcardFocus) {
        maxFlashcardFocus = avg;
        bestFlashcardPeriod = p;
      }
    });

    // 2. Best period for qbank
    const qbankSessions = timerHistory.filter(h => h.type === 'qbank');
    let bestQbankPeriod = 'postDinner';
    let maxQbankFocus = 0;
    const qbankPeriodSums = {};
    qbankSessions.forEach(s => {
      if (!qbankPeriodSums[s.period]) qbankPeriodSums[s.period] = { sum: 0, count: 0 };
      qbankPeriodSums[s.period].sum += s.concentration;
      qbankPeriodSums[s.period].count += 1;
    });
    Object.keys(qbankPeriodSums).forEach(p => {
      const avg = qbankPeriodSums[p].sum / qbankPeriodSums[p].count;
      if (avg > maxQbankFocus) {
        maxQbankFocus = avg;
        bestQbankPeriod = p;
      }
    });

    // 3. Optimal study duration
    let bestDurationRange = '1.0h to 2.0h';
    let maxDurationFocus = 0;
    const durationSums = { short: { sum: 0, count: 0 }, medium: { sum: 0, count: 0 }, long: { sum: 0, count: 0 } };
    timerHistory.forEach(s => {
      if (s.hours < 1.0) {
        durationSums.short.sum += s.concentration;
        durationSums.short.count += 1;
      } else if (s.hours >= 1.0 && s.hours <= 2.0) {
        durationSums.medium.sum += s.concentration;
        durationSums.medium.count += 1;
      } else {
        durationSums.long.sum += s.concentration;
        durationSums.long.count += 1;
      }
    });

    const avgShort = durationSums.short.count > 0 ? durationSums.short.sum / durationSums.short.count : 0;
    const avgMedium = durationSums.medium.count > 0 ? durationSums.medium.sum / durationSums.medium.count : 0;
    const avgLong = durationSums.long.count > 0 ? durationSums.long.sum / durationSums.long.count : 0;

    if (avgShort > avgMedium && avgShort > avgLong) {
      bestDurationRange = 'Short Sprints (< 1.0 hour)';
      maxDurationFocus = avgShort;
    } else if (avgMedium > avgShort && avgMedium > avgLong) {
      bestDurationRange = 'Medium Sessions (1.0 to 2.0 hours)';
      maxDurationFocus = avgMedium;
    } else {
      bestDurationRange = 'Deep Grinds (> 2.0 hours)';
      maxDurationFocus = avgLong;
    }

    // 4. Optimal Day of Week
    const daySums = {};
    timerHistory.forEach(s => {
      if (!daySums[s.dayOfWeek]) daySums[s.dayOfWeek] = { sum: 0, count: 0 };
      daySums[s.dayOfWeek].sum += s.concentration;
      daySums[s.dayOfWeek].count += 1;
    });
    let bestDay = 'Wednesday';
    let maxDayFocus = 0;
    Object.keys(daySums).forEach(d => {
      const avg = daySums[d].sum / daySums[d].count;
      if (avg > maxDayFocus) {
        maxDayFocus = avg;
        bestDay = d;
      }
    });

    const formatPeriodLabel = (pId) => {
      if (pId === 'preLunch') return '🌅 Morning (Pre Lunch)';
      if (pId === 'midDay') return '☀️ Afternoon (Midday)';
      return '🌙 Evening (Post Dinner)';
    };

    return {
      flashcardsPeriod: formatPeriodLabel(bestFlashcardPeriod),
      flashcardsFocus: maxFlashcardFocus ? maxFlashcardFocus.toFixed(1) : '9.0',
      qbankPeriod: formatPeriodLabel(bestQbankPeriod),
      qbankFocus: maxQbankFocus ? maxQbankFocus.toFixed(1) : '8.5',
      durationRange: bestDurationRange,
      durationFocus: maxDurationFocus ? maxDurationFocus.toFixed(1) : '8.2',
      bestDay,
      bestDayFocus: maxDayFocus ? maxDayFocus.toFixed(1) : '8.4'
    };
  };

  const insights = getDerivedInsights();

  const renderHeatmap = () => {
    return (
      <div className="space-y-4">
        <div className="text-left border-b border-slate-100 pb-2.5">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest block">
            Focus Correlation Heatmap (Study Block vs Session Type)
          </h3>
          <p className="text-[10px] text-slate-500 font-semibold mt-0.5 leading-relaxed">
            Color intensity indicates average focus (1–10). Click a cell to view tailored duration suggestions.
          </p>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[440px] grid grid-cols-4 gap-2 text-center select-none pt-1">
            {/* Header labels */}
            <div />
            {periodsList.map(p => (
              <div key={p.id} className="text-[9px] font-black text-slate-400 uppercase tracking-wider py-1">
                {p.label}
              </div>
            ))}

            {/* Row by row */}
            {sessionTypes.map(t => (
              <React.Fragment key={t.id}>
                {/* Row label */}
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center justify-start pl-1 text-left">
                  {t.label}
                </div>

                {/* Columns */}
                {periodsList.map(p => {
                  const data = getCellData(t.id, p.id);
                  const isSelected = selectedCell && selectedCell.type === t.id && selectedCell.period === p.id;

                  const bgClass = data.count === 0
                    ? 'bg-slate-50 text-slate-350 border-slate-100'
                    : `border-transparent text-white cursor-pointer hover:scale-[1.03] active:scale-[0.97]`;

                  const cellColorStyle = data.count > 0 ? {
                    backgroundColor: `hsl(199, 85%, ${100 - data.avgFocus * 6.5}%)`,
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.15)'
                  } : {};

                  return (
                    <div
                      key={`${t.id}_${p.id}`}
                      onClick={() => {
                        if (data.count > 0) {
                          setSelectedCell({
                            type: t.id,
                            typeLabel: t.label,
                            period: p.id,
                            periodLabel: p.label,
                            ...data
                          });
                        }
                      }}
                      style={cellColorStyle}
                      className={`p-3.5 rounded-2xl border text-xs font-black transition flex flex-col justify-center items-center h-14 relative group ${bgClass} ${isSelected ? 'ring-2 ring-sky-500 shadow-md' : 'shadow-sm'}`}
                    >
                      {data.count > 0 ? (
                        <>
                          <span>{data.avgFocus.toFixed(1)}</span>
                          <span className="text-[8px] opacity-75 font-bold mt-0.5">{data.count} {data.count === 1 ? 'sess' : 'sesses'}</span>

                          {/* Hover tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block bg-slate-900 text-white text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded shadow-lg whitespace-nowrap z-20 pointer-events-none">
                            Focus: {data.avgFocus}/10 | Length: {data.avgHrs}h
                          </div>
                        </>
                      ) : (
                        <span className="text-[9px] font-bold text-slate-300">-</span>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Selected Cell Insights Detail Box */}
        {selectedCell && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-sky-50/40 border border-sky-100/50 rounded-2xl p-4 text-xs mt-3 flex items-start gap-3.5"
          >
            <div className="w-9 h-9 rounded-xl bg-sky-500 flex items-center justify-center text-white font-black text-sm shadow-md shrink-0">
              💡
            </div>
            <div className="space-y-1 text-left">
              <h4 className="font-black text-sky-800 uppercase tracking-wider text-[10px]">
                Cell Insight: {selectedCell.typeLabel} + {selectedCell.periodLabel}
              </h4>
              <p className="text-slate-650 font-medium leading-relaxed">
                Based on {selectedCell.count} logged sessions, your average focus rating is <span className="text-sky-650 font-bold">{selectedCell.avgFocus}/10</span>.
                The ideal study duration for this type is <span className="text-sky-650 font-bold">{selectedCell.avgHrs} hours</span>.
                {selectedCell.avgFocus >= 8
                  ? " This is a highly efficient combination. Keep scheduling these sessions!"
                  : " Focus is moderate here. Try shorter, distraction-free Pomodoro sprints to elevate focus."}
              </p>
            </div>
          </motion.div>
        )}
      </div>
    );
  };

  const renderCategoryBlock = (catKey, label, timeRange) => {
    const list = sessionsWithRunning[catKey] || [];
    const agg = aggregatedSessions[catKey] || { hours: '0', concentration: 7 };
    const totalHrs = parseFloat(agg.hours) || 0;

    return (
      <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/70 space-y-4 text-left">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-black text-sky-900 uppercase tracking-wide flex items-center gap-1.5">
              {label}
              <span className="text-[9px] font-bold text-slate-400 normal-case">({timeRange})</span>
            </h4>
            <div className="flex items-center gap-2 mt-0.5 text-[9px] font-bold text-slate-500">
              <span>⏱️ {totalHrs.toFixed(2)}h total</span>
              <span>•</span>
              <span>🎯 Avg Focus: {agg.concentration}/10</span>
            </div>
          </div>
          <button
            onClick={() => handleAddManualSession(catKey)}
            className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition active:scale-95 flex items-center gap-1 cursor-pointer font-bold border border-sky-100/20"
          >
            + Add Session
          </button>
        </div>

        <div className="space-y-2">
          {list.length === 0 ? (
            <div className="text-center py-4 text-[10px] text-slate-400 italic font-bold">
              No study sessions logged for this slot.
            </div>
          ) : (
            list.map((sess) => {
              const isRunning = sess.isRunning;
              const isPrecise = sess.hours && Math.abs(parseFloat(sess.hours) - parseFloat(getNearestHalfHour(sess.hours))) > 0.01 && parseFloat(sess.hours) > 0;
              
              // Format labels for timer sessions
              let typeLabel = "Manual";
              if (sess.type === 'notes') typeLabel = "📚 Notes";
              else if (sess.type === 'qbank') typeLabel = "❓ Qbank";
              else if (sess.type === 'flashcards') typeLabel = "🎴 Cards";
              else if (sess.type === 'gt') typeLabel = `🏆 GT: ${sess.gtDetails?.name || 'Test'}`;
              else if (sess.type === 'pomodoro') typeLabel = "⏱️ Pomodoro";
              else if (sess.type === 'timer') typeLabel = "⏱️ Timer";

              return (
                <div 
                  key={sess.id} 
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                    isRunning 
                      ? 'bg-sky-50/70 border-sky-200 ring-2 ring-sky-500/20 shadow-sm animate-pulse' 
                      : 'bg-white border-slate-100 hover:border-slate-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isRunning ? (
                      <span className="flex h-2 w-2 relative shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                      </span>
                    ) : null}
                    <span className={`text-[10px] font-black uppercase tracking-wider ${isRunning ? 'text-sky-700' : 'text-slate-650'}`}>
                      {isRunning ? '⚡ Running Timer' : typeLabel}
                    </span>
                    {isPrecise && (
                      <span className="text-[8px] font-black text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded" title="Precise timer-accumulated duration">
                        Precise
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3.5 justify-end">
                    {/* Hours dropdown */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold text-slate-400">Hours:</span>
                      {isRunning ? (
                        <span className="text-xs font-black text-sky-700 min-w-[50px] text-center">
                          {parseFloat(sess.hours).toFixed(2)}h
                        </span>
                      ) : (
                        <select
                          value={getNearestHalfHour(sess.hours)}
                          onChange={(e) => handleSessionChange(catKey, sess.id, 'hours', e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold cursor-pointer focus:outline-none focus:border-sky-500 focus:bg-white transition"
                        >
                          {hoursOptions.map(h => (
                            <option key={`h-${sess.id}-${h}`} value={h}>{h}h</option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Focus dropdown */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold text-slate-400">Focus:</span>
                      <select
                        value={getNearestInteger(sess.concentration)}
                        disabled={isRunning}
                        onChange={(e) => handleSessionChange(catKey, sess.id, 'concentration', e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold cursor-pointer focus:outline-none focus:border-sky-500 focus:bg-white transition disabled:opacity-75 disabled:cursor-not-allowed"
                      >
                        {concentrationOptions.map(c => (
                          <option key={`c-${sess.id}-${c}`} value={c}>{c}/10</option>
                        ))}
                      </select>
                    </div>

                    {/* Delete button */}
                    {!isRunning && (
                      <button
                        onClick={() => handleDeleteSession(catKey, sess.id)}
                        className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                        title="Delete session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-grow overflow-y-auto bg-slate-50/50 p-4 md:p-6 custom-scrollbar text-slate-800">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header Title */}
        <div className="text-center md:text-left py-2">
          <h1 className="text-2xl font-black text-sky-800 tracking-tight">
            CAMP - Daily Progress Tracker
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-1">
            Cerebellum Accountability Management Program
          </p>
        </div>

        {/* Desktop Optimized Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* LEFT SIDE: Inputs / Charts (Matches layout) */}
          <div className="space-y-6">

            {/* Efficiency Chart Card */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm md:text-base font-black text-sky-800 tracking-tight flex items-center gap-2">
                  <Activity className="w-4 h-4 text-sky-600" />
                  Your Overall efficiency progress
                </h2>
                <button
                  onClick={() => setShowOverviewModal(true)}
                  className="text-slate-400 hover:text-sky-600 transition"
                  title="CAMP Info"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              </div>

              {/* Responsive Progress Line Graph */}
              <ProgressChart data={history} />

              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setShowOverviewModal(true)}
                  className="bg-sky-600 hover:bg-sky-700 text-white rounded-full px-6 py-2.5 text-xs font-black tracking-widest shadow-lg shadow-sky-600/20 active:scale-95 transition-all duration-200"
                >
                  CAMP Overview
                </button>
              </div>
            </div>

            {/* Manage History Card */}
            <CollapsibleCard title="Manage Logged Days" icon={Trash2} defaultOpen={false}>
              <div className="py-2 space-y-2">
                <p className="text-xs text-slate-500 font-medium mb-3">
                  Select and delete any previously logged values to remove them from your progress chart.
                </p>
                {history.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No logged data available.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl bg-slate-50/50 pr-1 custom-scrollbar">
                    {history.map((item, idx) => (
                      <div key={`hist-${item.date}-${idx}`} className="flex items-center justify-between p-3 text-xs font-semibold hover:bg-slate-100/50 transition-colors">
                        <div className="flex flex-col text-left">
                          <span className="text-slate-800 font-bold">{item.date}</span>
                          <span className="text-[10px] text-slate-400 font-medium">Logged Efficiency</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sky-700 font-black">{item.score.toFixed(1)}%</span>
                          <button
                            onClick={() => handleDeleteHistoryItem(idx)}
                            className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg text-slate-400 transition"
                            title={`Delete entry for ${item.date}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-500 hover:text-red-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CollapsibleCard>

            {/* Session History Log Card */}
            <CollapsibleCard title={`Session History Log (${timerHistory.length} entries)`} icon={History} defaultOpen={false}>
              <div className="py-2 space-y-3">
                <p className="text-xs text-slate-500 font-medium">
                  All sessions logged via timers. Delete individual entries to correct mistakes — CAMP session hours will auto-recalculate.
                </p>

                {/* Date filter */}
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="date"
                    value={historyFilterDate}
                    max={todayDateStr}
                    onChange={(e) => setHistoryFilterDate(e.target.value)}
                    placeholder="Filter by date"
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-sky-500 cursor-pointer"
                  />
                  {historyFilterDate && (
                    <button
                      onClick={() => setHistoryFilterDate('')}
                      className="text-[10px] font-black text-slate-400 hover:text-red-500 transition px-2 py-1 rounded-lg hover:bg-red-50"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {timerHistory.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 italic">
                    No sessions logged yet. Start a timer and save a session to see it here.
                  </div>
                ) : (() => {
                  const filtered = timerHistory
                    .map((item, originalIdx) => ({ ...item, originalIdx }))
                    .filter(item => !historyFilterDate || item.date === historyFilterDate)
                    .sort((a, b) => b.date.localeCompare(a.date) || b.originalIdx - a.originalIdx);

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-4 text-xs text-slate-400 italic">
                        No sessions found for {historyFilterDate}.
                      </div>
                    );
                  }

                  const periodLabel = (p) => p === 'preLunch' ? '🌅 Pre Lunch' : p === 'midDay' ? '☀️ Midday' : '🌙 Post Dinner';
                  const typeLabel = (t) => t === 'notes' ? '📚 Notes' : t === 'qbank' ? '❓ Qbank' : t === 'flashcards' ? '🎴 Flashcards' : '🏆 Grand Test';
                  const typeColor = (t) => t === 'notes' ? 'bg-blue-50 text-blue-700 border-blue-100' : t === 'qbank' ? 'bg-amber-50 text-amber-700 border-amber-100' : t === 'flashcards' ? 'bg-violet-50 text-violet-700 border-violet-100' : 'bg-orange-50 text-orange-700 border-orange-100';
                  const metricStr = (item) => {
                    if (item.type === 'notes' && item.pagesRead > 0) return `${item.pagesRead} pages`;
                    if (item.type === 'qbank' && item.questionsSolved > 0) return `${item.questionsSolved} Qs`;
                    if (item.type === 'flashcards' && item.cardsReviewed > 0) return `${item.cardsReviewed} cards`;
                    if (item.type === 'gt' && item.gtDetails) return item.gtDetails.name || 'GT';
                    return null;
                  };

                  return (
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl bg-slate-50/30 custom-scrollbar">
                      {filtered.map((item) => {
                        const metric = metricStr(item);
                        return (
                          <motion.div
                            key={`th-${item.date}-${item.originalIdx}`}
                            layout
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 4 }}
                            className="flex items-start justify-between gap-3 p-3 hover:bg-white transition-colors group"
                          >
                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                              {/* Row 1: Date + Day */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-black text-slate-700">{item.date}</span>
                                <span className="text-[9px] font-bold text-slate-400">{item.dayOfWeek}</span>
                              </div>
                              {/* Row 2: Period + Type chips */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[9px] font-black bg-sky-50 text-sky-700 border border-sky-100 px-2 py-0.5 rounded-full">
                                  {periodLabel(item.period)}
                                </span>
                                <span className={`text-[9px] font-black border px-2 py-0.5 rounded-full ${typeColor(item.type)}`}>
                                  {typeLabel(item.type)}
                                </span>
                              </div>
                              {/* Row 3: Metrics */}
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-[9px] font-bold text-slate-500">
                                  ⏱ {item.hours}h
                                </span>
                                <span className="text-[9px] font-bold text-slate-500">
                                  🎯 Focus {item.concentration}/10
                                </span>
                                {metric && (
                                  <span className="text-[9px] font-bold text-slate-500">
                                    📌 {metric}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Delete button */}
                            <button
                              onClick={() => handleDeleteTimerHistoryItem(item.originalIdx)}
                              title="Delete this session"
                              className="shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </CollapsibleCard>

            {/* Inputs Label & Date Selector */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-center sm:text-left">
              <div>
                <h2 className="text-base font-black text-sky-800 tracking-tight uppercase">
                  Add Day's Progress
                </h2>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                  Select a date to log or modify CAMP tracker values.
                </p>
              </div>
              <div className="flex justify-center sm:justify-end">
                <input
                  type="date"
                  value={selectedDate}
                  max={todayDateStr}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-white border border-slate-250 rounded-xl px-4 py-2 text-xs font-bold text-slate-750 focus:outline-none focus:border-sky-500 shadow-sm cursor-pointer"
                />
              </div>
            </div>



            {/* Bed to Book Time */}
            <CollapsibleCard title="Bed to Book Time" icon={Clock} defaultOpen={true}>
              <div className="py-2 space-y-2">
                <p className="text-xs text-slate-500 font-medium">
                  How quickly did you sit down to study after waking up?
                </p>
                <div className="relative mt-1">
                  <select
                    value={bedToBook}
                    onChange={(e) => setBedToBook(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-3 text-xs font-black text-slate-700 focus:outline-none focus:border-sky-500 focus:bg-white transition appearance-none cursor-pointer"
                  >
                    <option value="Less than 45 mins">Less than 45 mins (No Penalty)</option>
                    <option value="45-60 min">45 to 60 mins (5% Penalty)</option>
                    <option value="More than 1 hour">More than 1 hour (15% Penalty)</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </CollapsibleCard>

            {/* Study Sessions Card */}
            <CollapsibleCard title="Study Sessions & Concentration" icon={BookOpen} defaultOpen={true}>
              <div className="py-2 space-y-4">
                {renderCategoryBlock('preLunch', 'Pre Lunch', 'Midnight to 1:00 PM')}
                {renderCategoryBlock('midDay', 'Midday', '1:00 PM to 7:00 PM')}
                {renderCategoryBlock('postDinner', 'Post Dinner', '7:00 PM to Midnight')}
              </div>
            </CollapsibleCard>
            {/* Productivity Insights Card */}
            <CollapsibleCard title="Productivity Insights & Recommendations" icon={Activity} defaultOpen={true}>
              <div className="space-y-6 py-2">
                {timerHistory.length === 0 ? (
                  <div className="bg-slate-50/50 rounded-2xl p-8 border border-slate-200 border-dashed text-center flex flex-col items-center justify-center space-y-3.5">
                    <div className="w-12 h-12 bg-sky-100 rounded-2xl flex items-center justify-center text-sky-600 font-bold text-lg animate-pulse">
                      📊
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-black text-slate-700 text-xs uppercase tracking-wider text-left md:text-center">Focus Analytics Empty</h4>
                      <p className="text-[10px] text-slate-550 font-semibold leading-relaxed max-w-sm mx-auto text-left md:text-center">
                        Start studying using the active countdown timers, Pomodoro sprints, or stopwatch. Once you log a session, this heatmap and recommendations engine will automatically analyze your peak focus slots!
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Correlation Heatmap */}
                    {renderHeatmap()}

                    {/* Advanced Suggestions Panel */}
                    <div className="space-y-3.5 mt-4">
                      <div className="text-left border-b border-slate-100 pb-2">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest block">
                          AI Recommendations & Learnings
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        {/* Recommendation 1 */}
                        <div className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4 flex flex-col items-start gap-2.5 text-left transition hover:bg-slate-100/50">
                          <span className="text-xl">🎴</span>
                          <h4 className="text-[10px] font-black uppercase text-sky-850 tracking-wider">Flashcard Strategy</h4>
                          <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                            Your peak focus for Flashcards is during <span className="text-sky-600 font-bold">{insights.flashcardsPeriod}</span> with a focus score of <span className="text-sky-600 font-bold">{insights.flashcardsFocus}/10</span>. We recommend doing reviews in this slot.
                          </p>
                        </div>

                        {/* Recommendation 2 */}
                        <div className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4 flex flex-col items-start gap-2.5 text-left transition hover:bg-slate-100/50">
                          <span className="text-xl">❓</span>
                          <h4 className="text-[10px] font-black uppercase text-sky-850 tracking-wider">Qbank Strategy</h4>
                          <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                            For Qbank practicing, you excel during <span className="text-sky-600 font-bold">{insights.qbankPeriod}</span> (rating: <span className="text-sky-600 font-bold">{insights.qbankFocus}/10</span>). Schedule question blocks in this period.
                          </p>
                        </div>

                        {/* Recommendation 3 */}
                        <div className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4 flex flex-col items-start gap-2.5 text-left transition hover:bg-slate-100/50">
                          <span className="text-xl">📅</span>
                          <h4 className="text-[10px] font-black uppercase text-sky-850 tracking-wider">Session & Day Adherence</h4>
                          <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                            Your highest concentration matches <span className="text-sky-600 font-bold">{insights.durationRange}</span> (rating: <span className="text-sky-600 font-bold">{insights.durationFocus}/10</span>). <span className="text-sky-600 font-bold">{insights.bestDay}</span> is your most productive day.
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

              </div>
            </CollapsibleCard>

          </div>

          {/* RIGHT SIDE: Output Dashboard (Performance Score) */}
          <div className="space-y-6 lg:sticky lg:top-4">

            {/* Performance Score Main Container */}
            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-6">

              <div className="text-center border-b border-slate-100 pb-4">
                <h2 className="text-base font-black text-sky-800 tracking-tight uppercase flex items-center justify-center gap-2">
                  <Award className="w-5 h-5 text-sky-600" />
                  Performance Score
                </h2>
              </div>

              {/* 1. Efficiency Score Dial Block */}
              <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100/50 flex flex-col items-center justify-center text-center space-y-1">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Efficiency Score
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  This highlights your study performance.
                </span>
                <span className="text-3xl font-black text-sky-600 pt-2 block tracking-tight">
                  {efficiencyScore.toFixed(1)}%
                </span>
              </div>

              {/* 2. Overall Concentration Average Block */}
              <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100/50 flex flex-col items-center justify-center text-center space-y-1">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Overall Concentration
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  Time-weighted focus across all periods.
                </span>
                <span className="text-xl font-black text-sky-600 pt-2 block">
                  {weightedConcentration.toFixed(1)}/10
                </span>
              </div>

              {/* 3. Effective Study Hours Breakdowns */}
              <div className="space-y-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1.5">
                  Effective Period Breakdown
                </h3>

                {/* Pre Lunch Card */}
                <div className="bg-sky-50/45 border border-sky-100/50 rounded-xl p-4 flex justify-between items-center transition hover:border-sky-200">
                  <span className="text-xs font-bold text-slate-700">Pre Lunch Effective Study</span>
                  <span className="text-sm font-black text-sky-700">{preLunchEffective.toFixed(1)} Hours</span>
                </div>

                {/* Midday Card */}
                <div className="bg-sky-50/45 border border-sky-100/50 rounded-xl p-4 flex justify-between items-center transition hover:border-sky-200">
                  <span className="text-xs font-bold text-slate-700">Midday Effective Study</span>
                  <span className="text-sm font-black text-sky-700">{midDayEffective.toFixed(1)} Hours</span>
                </div>

                {/* Post Dinner Card */}
                <div className="bg-sky-50/45 border border-sky-100/50 rounded-xl p-4 flex justify-between items-center transition hover:border-sky-200">
                  <span className="text-xs font-bold text-slate-700">Post Dinner Effective Study</span>
                  <span className="text-sm font-black text-sky-700">{postDinnerEffective.toFixed(1)} Hours</span>
                </div>
              </div>

              {/* Save Entry CTA */}
              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={handleSaveProgress}
                  disabled={grossHours === 0}
                  className={`w-full py-3.5 rounded-full text-xs font-black tracking-widest uppercase transition-all duration-300 shadow-md active:scale-95 ${grossHours === 0
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/10'
                    }`}
                >
                  Log Today's Progress
                </button>

                {saveStatus && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center gap-2 text-xs font-black text-emerald-600 bg-emerald-50 py-2 rounded-xl mt-1"
                  >
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    {saveStatus}
                  </motion.div>
                )}
              </div>

            </div>

          </div>

        </div>

      </div>

      {/* CAMP OVERVIEW POPUP MODAL */}
      {showOverviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white border border-slate-100 rounded-3xl shadow-xl max-w-lg w-full overflow-hidden"
          >
            <div className="bg-sky-600 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-black text-sm uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-4 h-4" />
                CAMP Method Overview
              </h3>
              <button
                onClick={() => setShowOverviewModal(false)}
                className="text-white hover:text-sky-200 font-bold text-sm focus:outline-none"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs leading-relaxed text-slate-600">
              <p>
                The <strong>Cerebellum Accountability Management Program (CAMP)</strong> tracks medical students' daily study habits using strict mathematical constraints to enforce true focus.
              </p>

              <div className="space-y-2 border-l-2 border-sky-100 pl-4 py-1">
                <p>
                  <strong>1. Bed-to-Book Penalty:</strong> If you wait more than 45 minutes to start studying after waking up, you lose efficiency.
                  <br />• Under 45m: <span className="text-emerald-600 font-bold">0% Penalty</span>
                  <br />• 45–60m: <span className="text-amber-500 font-bold">5% Penalty</span>
                  <br />• Over 1 hour: <span className="text-red-500 font-bold">15% Penalty</span>
                </p>
                <p>
                  <strong>2. Time-Weighted Focus:</strong> Study sessions with longer duration are weighted heavier in calculating concentration ratings.
                </p>
                <p>
                  <strong>3. Deep Study Bonus:</strong> Gain <span className="text-sky-600 font-bold">+2%</span> for each distraction-free 50m block, capped up to <span className="text-sky-600 font-bold">+10%</span>.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowOverviewModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-full font-black uppercase tracking-widest text-[10px] transition"
                >
                  Got it
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* YESTERDAY'S MISSED LOG PROMPT */}
      {showYesterdayPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white border border-slate-100 rounded-3xl shadow-xl max-w-sm w-full p-6 text-center space-y-4"
          >
            <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 mx-auto text-xl animate-pulse">
              📅
            </div>
            <div className="space-y-1.5 text-left">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider text-center">Missed Yesterday's Log</h3>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed text-center">
                You didn't log your CAMP progress for yesterday ({yesterdayLabelText}). Would you like to review and log it now? Your inputs are preserved.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowYesterdayPrompt(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black py-2.5 px-4 rounded-xl transition uppercase tracking-wider"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  setSelectedDate(yesterdayDateVal);
                  setShowYesterdayPrompt(false);
                }}
                className="flex-1 bg-sky-600 hover:bg-sky-700 text-white text-xs font-black py-2.5 px-4 rounded-xl transition shadow-md shadow-sky-600/10 uppercase tracking-wider"
              >
                Log Yesterday
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}


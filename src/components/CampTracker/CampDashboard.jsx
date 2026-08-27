import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Filter,
  Flame,
  Sparkles,
  Zap,
  ChevronDown,
  Plus
} from 'lucide-react';
import {
  getLocalCampData,
  saveLocalCampData,
  getLocalCampDailyLogs,
  saveLocalCampDailyLogs,
  recordTombstone,
  revokeTombstone
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
  localTimerTimeLeft,
  themeMode = 'dark'
}) {
  const isDark = themeMode === 'dark';
  const todayDateStr = (() => {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
  })();
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
      name: '',
      email: '',
      phone: ''
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
  const [activeSessionSlot, setActiveSessionSlot] = useState('preLunch');
  const [showOverviewModal, setShowOverviewModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [hasLoadedLocalDb, setHasLoadedLocalDb] = useState(false);
  const isLoadingDateRef = useRef(false);
  const currentSessionsDateRef = useRef(selectedDate);
  const currentB2bDateRef = useRef(selectedDate);

  const isManuallyEditingRef = useRef(false);
  const manualEditTimeoutRef = useRef(null);

  const studentInfoDebounceRef = useRef(null);
  const bedToBookDebounceRef = useRef(null);
  const sessionsDebounceRef = useRef(null);
  const historyDebounceRef = useRef(null);
  const timerHistoryDebounceRef = useRef(null);
  const obsBroadcastChannelRef = useRef(null);
  const obsBroadcastDebounceRef = useRef(null);

  const lastSavedStudentInfoRef = useRef(null);
  const lastSavedHistoryRef = useRef(null);
  const lastSavedTimerHistoryRef = useRef(null);
  const lastSavedBedToBookRef = useRef({});
  const lastSavedSessionsRef = useRef({});

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

  // 1.5. Fetch local CAMP data from IndexedDB on mount and on cloud sync hydration to populate state safely
  useEffect(() => {
    let active = true;
    const fetchLocalDbData = async () => {
      try {
        const [histData, thData, infoData, dailyLog] = await Promise.all([
          getLocalCampData('history'),
          getLocalCampData('timer_history'),
          getLocalCampData('student_info'),
          getLocalCampDailyLogs(selectedDate)
        ]);

        if (!active) return;

        if (histData && Array.isArray(histData)) {
          setHistory(histData);
          lastSavedHistoryRef.current = JSON.stringify(histData);
          localStorage.setItem('camp_history', JSON.stringify(histData));
        }

        if (thData && Array.isArray(thData)) {
          setTimerHistory(thData);
          lastSavedTimerHistoryRef.current = JSON.stringify(thData);
          localStorage.setItem('camp_timer_history', JSON.stringify(thData));
        }

        if (infoData && typeof infoData === 'object') {
          setStudentInfo(infoData);
          lastSavedStudentInfoRef.current = JSON.stringify(infoData);
          localStorage.setItem('camp_student_info', JSON.stringify(infoData));
        }

        if (dailyLog && dailyLog.sessions) {
          const norm = normalizeSessions(dailyLog.sessions);
          setSessions(norm);
          lastSavedSessionsRef.current[selectedDate] = JSON.stringify(norm);
        }
        if (dailyLog && dailyLog.bedToBook) {
          setBedToBook(dailyLog.bedToBook);
          lastSavedBedToBookRef.current[selectedDate] = dailyLog.bedToBook;
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

    const handleSyncHydration = () => {
      console.log('[CampDashboard] Refreshing CAMP metrics on cloud sync hydration…');
      fetchLocalDbData();
    };

    window.addEventListener('gdrive-data-hydrated', handleSyncHydration);

    return () => {
      active = false;
      window.removeEventListener('gdrive-data-hydrated', handleSyncHydration);
    };
  }, [selectedDate]);

  // 1.6. Reactively load sessions and B2B whenever selectedDate changes
  useEffect(() => {
    let active = true;
    isLoadingDateRef.current = true;

    const loadDaily = async () => {
      try {
        const log = await getLocalCampDailyLogs(selectedDate);
        if (!active) return;
        if (log) {
          if (log.sessions) {
            const norm = normalizeSessions(log.sessions);
            setSessions(norm);
            lastSavedSessionsRef.current[selectedDate] = JSON.stringify(norm);
            localStorage.setItem(`camp_sessions_${selectedDate}`, JSON.stringify(norm));
          } else {
            setSessions({ preLunch: [], midDay: [], postDinner: [] });
            lastSavedSessionsRef.current[selectedDate] = JSON.stringify({ preLunch: [], midDay: [], postDinner: [] });
          }
          if (log.bedToBook) {
            setBedToBook(log.bedToBook);
            lastSavedBedToBookRef.current[selectedDate] = log.bedToBook;
            localStorage.setItem(`camp_bedToBook_${selectedDate}`, log.bedToBook);
          } else {
            setBedToBook('Less than 45 mins');
            lastSavedBedToBookRef.current[selectedDate] = 'Less than 45 mins';
          }
        } else {
          const savedSessions = localStorage.getItem(`camp_sessions_${selectedDate}`);
          let parsedSessions = { preLunch: [], midDay: [], postDinner: [] };
          if (savedSessions) {
            try {
              parsedSessions = normalizeSessions(JSON.parse(savedSessions));
            } catch (err) {
              console.error("Error parsing sessions cache:", err);
            }
          }
          const savedB2B = localStorage.getItem(`camp_bedToBook_${selectedDate}`);
          const b2bValue = savedB2B || 'Less than 45 mins';
          setSessions(parsedSessions);
          setBedToBook(b2bValue);
          lastSavedSessionsRef.current[selectedDate] = JSON.stringify(parsedSessions);
          lastSavedBedToBookRef.current[selectedDate] = b2bValue;
        }
      } catch (err) {
        console.error("[LocalDB] Error loading daily CAMP log:", err);
      } finally {
        if (active) {
          currentSessionsDateRef.current = selectedDate;
          currentB2bDateRef.current = selectedDate;
          isLoadingDateRef.current = false;
        }
      }
    };

    loadDaily();
    return () => { active = false; };
  }, [selectedDate]);

  // 2. Persist Student Info
  useEffect(() => {
    if (!hasLoadedLocalDb) return;
    const serialized = JSON.stringify(studentInfo);
    if (serialized === lastSavedStudentInfoRef.current) return;
    localStorage.setItem('camp_student_info', serialized);
    clearTimeout(studentInfoDebounceRef.current);
    studentInfoDebounceRef.current = setTimeout(() => {
      saveLocalCampData('student_info', studentInfo);
      lastSavedStudentInfoRef.current = serialized;
    }, 500);
    return () => clearTimeout(studentInfoDebounceRef.current);
  }, [studentInfo, hasLoadedLocalDb]);

  // 3. Persist Daily Inputs based on selectedDate
  useEffect(() => {
    if (!hasLoadedLocalDb || isLoadingDateRef.current || currentB2bDateRef.current !== selectedDate) return;
    if (bedToBook === lastSavedBedToBookRef.current[selectedDate]) return;
    localStorage.setItem(`camp_bedToBook_${selectedDate}`, bedToBook);
    clearTimeout(bedToBookDebounceRef.current);
    bedToBookDebounceRef.current = setTimeout(() => {
      saveLocalCampDailyLogs(selectedDate, { bedToBook });
      lastSavedBedToBookRef.current[selectedDate] = bedToBook;
    }, 500);
    return () => clearTimeout(bedToBookDebounceRef.current);
  }, [bedToBook, selectedDate, hasLoadedLocalDb]);

  useEffect(() => {
    if (!hasLoadedLocalDb || isLoadingDateRef.current || currentSessionsDateRef.current !== selectedDate) return;
    const serialized = JSON.stringify(sessions);
    if (serialized === lastSavedSessionsRef.current[selectedDate]) return;
    localStorage.setItem(`camp_sessions_${selectedDate}`, serialized);
    clearTimeout(sessionsDebounceRef.current);
    sessionsDebounceRef.current = setTimeout(() => {
      saveLocalCampDailyLogs(selectedDate, { sessions });
      lastSavedSessionsRef.current[selectedDate] = serialized;
    }, 500);
    return () => clearTimeout(sessionsDebounceRef.current);
  }, [sessions, selectedDate, hasLoadedLocalDb]);

  // 3a. Persist History & Timer History based on state changes
  useEffect(() => {
    if (!hasLoadedLocalDb) return;
    const serialized = JSON.stringify(history);
    if (serialized === lastSavedHistoryRef.current) return;
    localStorage.setItem('camp_history', serialized);
    clearTimeout(historyDebounceRef.current);
    historyDebounceRef.current = setTimeout(() => {
      saveLocalCampData('history', history);
      lastSavedHistoryRef.current = serialized;
    }, 500);
    return () => clearTimeout(historyDebounceRef.current);
  }, [history, hasLoadedLocalDb]);

  useEffect(() => {
    if (!hasLoadedLocalDb) return;
    const serialized = JSON.stringify(timerHistory);
    if (serialized === lastSavedTimerHistoryRef.current) return;
    localStorage.setItem('camp_timer_history', serialized);
    clearTimeout(timerHistoryDebounceRef.current);
    timerHistoryDebounceRef.current = setTimeout(() => {
      saveLocalCampData('timer_history', timerHistory);
      lastSavedTimerHistoryRef.current = serialized;
    }, 500);
    return () => clearTimeout(timerHistoryDebounceRef.current);
  }, [timerHistory, hasLoadedLocalDb]);

  // 3b. Real-time BroadcastChannel sync for CAMP overlay widgets (debounced singleton)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      obsBroadcastChannelRef.current = new BroadcastChannel('auto_anki_obs_channel');
    }
    return () => {
      if (obsBroadcastChannelRef.current) {
        obsBroadcastChannelRef.current.close();
        obsBroadcastChannelRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!obsBroadcastChannelRef.current) return;
    clearTimeout(obsBroadcastDebounceRef.current);
    obsBroadcastDebounceRef.current = setTimeout(() => {
      try {
        if (obsBroadcastChannelRef.current) {
          obsBroadcastChannelRef.current.postMessage({
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
        }
      } catch (err) {
        console.warn("OBS BroadcastChannel postMessage failed:", err);
      }
    }, 150);
    return () => clearTimeout(obsBroadcastDebounceRef.current);
  }, [sessions, bedToBook, history, timerHistory, studentInfo, selectedDate]);

  // 3b-2. Unmount cleanup effect for all debounced timer refs
  useEffect(() => {
    return () => {
      if (studentInfoDebounceRef.current) clearTimeout(studentInfoDebounceRef.current);
      if (bedToBookDebounceRef.current) clearTimeout(bedToBookDebounceRef.current);
      if (sessionsDebounceRef.current) clearTimeout(sessionsDebounceRef.current);
      if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
      if (timerHistoryDebounceRef.current) clearTimeout(timerHistoryDebounceRef.current);
      if (obsBroadcastDebounceRef.current) clearTimeout(obsBroadcastDebounceRef.current);
      if (manualEditTimeoutRef.current) clearTimeout(manualEditTimeoutRef.current);
    };
  }, []);

  // 3c. Sync inputs and timer history in real time from localStorage (for active timer modal logs)
  useEffect(() => {
    const syncData = () => {
      if (isManuallyEditingRef.current) return;
      try {
        const savedSessions = localStorage.getItem(`camp_sessions_${selectedDate}`);
        if (savedSessions) {
          setSessions(prev => {
            try {
              const parsed = normalizeSessions(JSON.parse(savedSessions));
              if (JSON.stringify(prev) !== JSON.stringify(parsed)) {
                return parsed;
              }
            } catch (err) {
              console.warn("[CampDashboard] syncData parse error (sessions):", err);
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
            try {
              const parsed = JSON.parse(savedTimerHistory);
              if (JSON.stringify(prev) !== JSON.stringify(parsed)) {
                return parsed;
              }
            } catch (err) {
              console.warn("[CampDashboard] syncData parse error (timerHistory):", err);
            }
            return prev;
          });
        }

        const savedCampHistory = localStorage.getItem('camp_history');
        if (savedCampHistory) {
          setHistory(prev => {
            try {
              const parsed = JSON.parse(savedCampHistory);
              if (JSON.stringify(prev) !== JSON.stringify(parsed)) {
                return parsed;
              }
            } catch (err) {
              console.warn("[CampDashboard] syncData parse error (history):", err);
            }
            return prev;
          });
        }
      } catch (e) {
        console.warn("[CampDashboard] syncData outer exception:", e);
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
    } else if (
      timerState.timerType === 'pomodoro' &&
      (timerState.mode === 'study' || timerState.pomodoroMode === 'study')
    ) {
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
      let qualifiedDeepSessions = 0;

      if (list.length > 0) {
        const sumFocus = list.reduce((sum, s) => sum + (Number(s.concentration) || 7), 0);
        avgFocus = sumFocus / list.length;

        // Strictly validate each session against duration (>= 50m / 0.833h) AND concentration (>= 8)
        list.forEach(s => {
          if (!s) return;
          if (s.deepSessions !== undefined && s.deepSessions !== null && s.deepSessions !== '') {
            qualifiedDeepSessions += parseInt(s.deepSessions, 10) || 0;
          } else {
            const h = parseFloat(s.hours) || 0;
            const c = parseFloat(s.concentration) || 0;
            if (h >= 0.833 && c >= 8) {
              qualifiedDeepSessions += 1;
            }
          }
        });
      }

      agg[cat] = {
        hours: totalHours.toString(),
        deepSessions: qualifiedDeepSessions,
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

    const targetDateStr = selectedDate || new Date().toLocaleDateString('en-CA');
    const [yr, mo, dy] = targetDateStr.split('-').map(Number);
    const dateObj = new Date(yr, mo - 1, dy);
    const dateLabel = dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).replace(' ', '-');
    const nowIso = new Date().toISOString();

    const updatedHistory = [...history];
    const dayIndex = updatedHistory.findIndex(h => 
      (h.fullDate && h.fullDate === targetDateStr) || h.date === dateLabel
    );

    const historyEntry = {
      date: dateLabel,
      fullDate: targetDateStr,
      timestamp: dateObj.getTime(),
      score: Number(efficiencyScore.toFixed(1)),
      updatedAt: nowIso
    };

    if (dayIndex >= 0) {
      updatedHistory[dayIndex] = { ...updatedHistory[dayIndex], ...historyEntry };
    } else {
      updatedHistory.push(historyEntry);
    }

    // Chronological sorting of entries using reliable timestamp or ISO date
    updatedHistory.sort((a, b) => {
      const timeA = a.timestamp || (a.fullDate ? new Date(a.fullDate).getTime() : 0);
      const timeB = b.timestamp || (b.fullDate ? new Date(b.fullDate).getTime() : 0);
      if (timeA && timeB) return timeA - timeB;
      if (a.fullDate && b.fullDate) return a.fullDate.localeCompare(b.fullDate);
      return 0;
    });

    setHistory(updatedHistory);
    lastSavedHistoryRef.current = JSON.stringify(updatedHistory);
    localStorage.setItem('camp_history', JSON.stringify(updatedHistory));

    // Revoke any prior tombstone for this history entry
    revokeTombstone('camp_history_entry', String(targetDateStr)).catch(() => {});
    revokeTombstone('camp_history_entry', String(dateLabel)).catch(() => {});

    // Save immediately and deterministically to IndexedDB
    saveLocalCampData('history', updatedHistory).catch(e => console.error('[CampDashboard] Error saving history:', e));
    saveLocalCampDailyLogs(targetDateStr, { sessions, bedToBook }).catch(e => console.error('[CampDashboard] Error saving daily logs:', e));

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

    const nowIso = new Date().toISOString();
    setSessions(prev => {
      const list = prev[sessionKey] || [];
      const updatedList = list.map(sess => {
        if (sess.id === sessionId) {
          const updated = { ...sess, updatedAt: nowIso };
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

    const nowIso = new Date().toISOString();
    const newSessionId = 'manual_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5);
    revokeTombstone('camp_session', newSessionId).catch(() => {});

    setSessions(prev => {
      const list = prev[sessionKey] || [];
      const newSession = {
        id: newSessionId,
        hours: '1.0',
        concentration: 7,
        type: 'notes',
        isManual: true,
        updatedAt: nowIso
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

    if (sessionId) {
      recordTombstone('camp_session', String(sessionId), {
        dateStr: selectedDate,
        sessionKey,
        deletedAt: new Date().toISOString()
      }).catch(e => console.warn('[CampDashboard] Error recording session tombstone:', e));
    }

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
    const itemToDelete = history[indexToDelete];
    if (itemToDelete) {
      const entryKey = String(itemToDelete.fullDate || itemToDelete.date || itemToDelete.timestamp);
      recordTombstone('camp_history_entry', entryKey, {
        deletedAt: new Date().toISOString()
      }).catch(e => console.warn('[CampDashboard] Error recording history entry tombstone:', e));
    }
    const updatedHistory = history.filter((_, idx) => idx !== indexToDelete);
    setHistory(updatedHistory);
    lastSavedHistoryRef.current = JSON.stringify(updatedHistory);
    localStorage.setItem('camp_history', JSON.stringify(updatedHistory));
    saveLocalCampData('history', updatedHistory).catch(e => console.error('[CampDashboard] Error saving history on delete:', e));
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
      const numHours = parseFloat(item.hours) || 0;
      rebuilt[item.period].push({
        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
        hours: numHours.toFixed(3),
        concentration: Number(item.concentration) || 7,
        type: item.type || 'notes',
        pagesRead: Number(item.pagesRead) || 0,
        questionsSolved: Number(item.questionsSolved) || 0,
        cardsReviewed: Number(item.cardsReviewed) || 0,
        gtDetails: item.gtDetails || null,
        isManual: false
      });
    });
    localStorage.setItem(`camp_sessions_${dateStr}`, JSON.stringify(rebuilt));
    saveLocalCampDailyLogs(dateStr, { sessions: rebuilt }).catch(err => {
      console.error("[LocalDB] Error saving rebuilt daily sessions:", err);
    });
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
      const count = flashcardPeriodSums[p].count || 0;
      const avg = count > 0 ? flashcardPeriodSums[p].sum / count : 0;
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
      const count = qbankPeriodSums[p].count || 0;
      const avg = count > 0 ? qbankPeriodSums[p].sum / count : 0;
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
      if (!s) return;
      const numHours = parseFloat(s.hours) || 0;
      const numConc = parseFloat(s.concentration) || 0;
      if (numHours <= 0) return;

      if (numHours < 1.0) {
        durationSums.short.sum += numConc;
        durationSums.short.count += 1;
      } else if (numHours >= 1.0 && numHours <= 2.0) {
        durationSums.medium.sum += numConc;
        durationSums.medium.count += 1;
      } else {
        durationSums.long.sum += numConc;
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
    } else if (avgLong > 0) {
      bestDurationRange = 'Deep Grinds (> 2.0 hours)';
      maxDurationFocus = avgLong;
    }

    // 4. Optimal Day of Week
    const daySums = {};
    timerHistory.forEach(s => {
      if (!s || !s.dayOfWeek) return;
      const numConc = parseFloat(s.concentration) || 0;
      if (!daySums[s.dayOfWeek]) daySums[s.dayOfWeek] = { sum: 0, count: 0 };
      daySums[s.dayOfWeek].sum += numConc;
      daySums[s.dayOfWeek].count += 1;
    });
    let bestDay = 'Wednesday';
    let maxDayFocus = 0;
    Object.keys(daySums).forEach(d => {
      const count = daySums[d].count || 0;
      const avg = count > 0 ? daySums[d].sum / count : 0;
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
        <div className={`text-left border-b pb-2.5 ${isDark ? 'border-slate-700/60' : 'border-slate-200/80'}`}>
          <h3 className={`text-xs font-black uppercase tracking-widest block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Focus Correlation Heatmap (Study Block vs Session Type)
          </h3>
          <p className={`text-[10px] font-semibold mt-0.5 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Color intensity indicates average focus (1–10). Click a cell to view tailored duration suggestions.
          </p>
        </div>

        <div className="overflow-x-auto scrollbar-none">
          <div className="min-w-[440px] grid grid-cols-4 gap-2.5 text-center select-none pt-1">
            {/* Header labels */}
            <div />
            {periodsList.map(p => (
              <div key={p.id} className={`text-[9px] font-black uppercase tracking-wider py-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {p.label}
              </div>
            ))}

            {/* Row by row */}
            {sessionTypes.map(t => (
              <React.Fragment key={t.id}>
                {/* Row label */}
                <div className={`text-[10px] font-black uppercase tracking-wider flex items-center justify-start pl-1 text-left ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {t.label}
                </div>

                {/* Columns */}
                {periodsList.map(p => {
                  const data = getCellData(t.id, p.id);
                  const isSelected = selectedCell && selectedCell.type === t.id && selectedCell.period === p.id;

                  const bgClass = data.count === 0
                    ? isDark ? 'neu-pressed-dark text-slate-500 border border-slate-750' : 'neu-pressed-light text-slate-400 border border-slate-200'
                    : `border-transparent text-white cursor-pointer hover:scale-[1.03] active:scale-[0.97]`;

                  const safeFocus = isNaN(data.avgFocus) ? 7 : Math.max(1, Math.min(10, data.avgFocus));
                  const cellColorStyle = data.count > 0 ? {
                    backgroundColor: isDark 
                      ? `hsl(215, 85%, ${20 + safeFocus * 4}%)` 
                      : `hsl(215, 85%, ${100 - safeFocus * 5.5}%)`,
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.4)'
                  } : {};

                  return (
                    <motion.div
                      key={`${t.id}_${p.id}`}
                      whileHover={data.count > 0 ? { scale: 1.03 } : {}}
                      whileTap={data.count > 0 ? { scale: 0.97 } : {}}
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
                      className={`p-3.5 rounded-2xl border text-xs font-black transition flex flex-col justify-center items-center h-14 relative group ${bgClass} ${
                        isSelected 
                          ? (isDark ? 'ring-2 ring-blue-400 shadow-lg shadow-blue-500/20' : 'ring-2 ring-blue-500 shadow-md') 
                          : 'shadow-sm'
                      }`}
                    >
                      {data.count > 0 ? (
                        <>
                          <span>{data.avgFocus.toFixed(1)}</span>
                          <span className="text-[8px] opacity-80 font-bold mt-0.5">{data.count} {data.count === 1 ? 'sess' : 'sesses'}</span>

                          {/* Hover tooltip */}
                          <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block ${
                            isDark ? 'bg-slate-800 text-slate-100 border border-slate-700' : 'bg-slate-900 text-white'
                          } text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-lg shadow-xl whitespace-nowrap z-20 pointer-events-none`}>
                            Focus: {data.avgFocus}/10 | Length: {data.avgHrs}h
                          </div>
                        </>
                      ) : (
                        <span className={`text-[9px] font-bold ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>-</span>
                      )}
                    </motion.div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Selected Cell Insights Detail Box */}
        {selectedCell && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl p-4 text-xs mt-3 flex items-start gap-3.5 ${
              isDark 
                ? 'neu-pressed-dark border border-blue-500/30' 
                : 'neu-pressed-light border border-blue-500/20'
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shadow-md shrink-0 ${
              isDark ? 'neu-btn-accent-dark text-white' : 'neu-btn-accent-light text-white'
            }`}>
              💡
            </div>
            <div className="space-y-1 text-left">
              <h4 className={`font-black uppercase tracking-wider text-[10px] ${
                isDark ? 'text-blue-400' : 'text-blue-700'
              }`}>
                Cell Insight: {selectedCell.typeLabel} + {selectedCell.periodLabel}
              </h4>
              <p className={`font-medium leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Based on {selectedCell.count} logged sessions, your average focus rating is <span className={`font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{selectedCell.avgFocus}/10</span>.
                The ideal study duration for this type is <span className={`font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{selectedCell.avgHrs} hours</span>.
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
      <div className={`rounded-2xl p-3.5 sm:p-4.5 space-y-3.5 text-left border ${
        isDark 
          ? 'neu-pressed-dark border-slate-750' 
          : 'neu-pressed-light border-slate-200/80'
      }`}>
        {/* Header: Title & Action */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/60 dark:border-slate-750">
          <div>
            <h4 className={`text-xs font-black uppercase tracking-wide ${
              isDark ? 'text-blue-400' : 'text-blue-700'
            }`}>
              {label}
            </h4>
            <p className={`text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              ({timeRange})
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleAddManualSession(catKey)}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition active:scale-95 flex items-center gap-1.5 shrink-0 cursor-pointer ${
              isDark ? 'neu-btn-dark text-blue-400 hover:text-white' : 'neu-btn-light text-blue-600 hover:text-blue-800'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Session</span>
          </button>
        </div>

        {/* Stats Row - GUARANTEED SINGLE LINE */}
        <div className={`flex items-center gap-2 text-[10px] font-bold whitespace-nowrap overflow-x-auto custom-scrollbar py-0.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          <span className="flex items-center gap-1">
            <span>⏱️</span>
            <span>{totalHrs.toFixed(2)}h total</span>
          </span>
          <span className="opacity-40">•</span>
          <span className="flex items-center gap-1">
            <span>🎯</span>
            <span>Avg Focus: {agg.concentration}/10</span>
          </span>
        </div>

        <div className="space-y-2.5">
          {list.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-6 text-center space-y-2 rounded-xl ${isDark ? 'bg-white/[0.02]' : 'bg-black/[0.02]'}`}>
              <BookOpen className={`w-5 h-5 opacity-30 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
              <p className={`text-[10px] sm:text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                No study sessions logged for this slot yet.
              </p>
              <button
                type="button"
                onClick={() => handleAddManualSession(catKey)}
                className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-lg transition ${
                  isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
                }`}
              >
                + Log Study Session
              </button>
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
                  className={`p-3 rounded-2xl border transition-all space-y-2.5 ${
                    isRunning 
                      ? (isDark ? 'neu-card-dark border-blue-500/50 ring-2 ring-blue-500/30 animate-pulse' : 'neu-card-light border-blue-400 ring-2 ring-blue-500/20 animate-pulse')
                      : (isDark ? 'neu-card-dark border-slate-750' : 'neu-card-light border-slate-200/60')
                  }`}
                >
                  {/* Top row of session card: Type badge + Delete button */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isRunning ? (
                        <span className="flex h-2 w-2 relative shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                      ) : null}
                      <span className={`text-[10px] font-black uppercase tracking-wider truncate ${
                        isRunning 
                          ? (isDark ? 'text-blue-400' : 'text-blue-600') 
                          : (isDark ? 'text-slate-200' : 'text-slate-800')
                      }`}>
                        {isRunning ? '⚡ Running Timer' : typeLabel}
                      </span>
                      {isPrecise && (
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${
                          isDark ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-600 border border-blue-200'
                        }`} title="Precise timer-accumulated duration">
                          Precise
                        </span>
                      )}
                    </div>

                    {!isRunning && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSession(catKey, sess.id)}
                        className={`p-1.5 rounded-xl transition cursor-pointer shrink-0 ${
                          isDark ? 'text-slate-400 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                        }`}
                        title="Delete session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Bottom row of session card: Hours and Focus inputs */}
                  <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                    {/* Hours */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-[10px] font-bold shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Hours:</span>
                      {isRunning ? (
                        <span className={`text-xs font-black min-w-[40px] text-center ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                          {parseFloat(sess.hours).toFixed(2)}h
                        </span>
                      ) : (
                        <select
                          value={getNearestHalfHour(sess.hours)}
                          onChange={(e) => handleSessionChange(catKey, sess.id, 'hours', e.target.value)}
                          className={`w-full rounded-xl px-2.5 py-1 text-[11px] font-black cursor-pointer focus:outline-none transition ${
                            isDark 
                              ? 'neu-pressed-dark text-slate-150 border-slate-750 bg-[#222730]' 
                              : 'neu-pressed-light text-slate-800 border-slate-200 bg-[#e6ecf5]'
                          }`}
                        >
                          {hoursOptions.map(h => (
                            <option key={`h-${sess.id}-${h}`} value={h} className={isDark ? 'bg-[#222730] text-slate-100' : 'bg-[#e6ecf5] text-slate-800'}>
                              {h}h
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Focus */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-[10px] font-bold shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Focus:</span>
                      <select
                        value={getNearestInteger(sess.concentration)}
                        disabled={isRunning}
                        onChange={(e) => handleSessionChange(catKey, sess.id, 'concentration', e.target.value)}
                        className={`w-full rounded-xl px-2.5 py-1 text-[11px] font-black cursor-pointer focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed ${
                          isDark 
                            ? 'neu-pressed-dark text-slate-150 border-slate-750 bg-[#222730]' 
                            : 'neu-pressed-light text-slate-800 border-slate-200 bg-[#e6ecf5]'
                        }`}
                      >
                        {concentrationOptions.map(c => (
                          <option key={`c-${sess.id}-${c}`} value={c} className={isDark ? 'bg-[#222730] text-slate-100' : 'bg-[#e6ecf5] text-slate-800'}>
                            {c}/10
                          </option>
                        ))}
                      </select>
                    </div>
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
    <div className={`w-full transition-colors duration-300 ${
      isDark ? 'text-slate-100' : 'text-slate-800'
    }`}>
      <div className="w-full space-y-5">

        {/* Header Title */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center md:text-left py-1 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
        >
          <div>
            <h1 className={`text-xl md:text-3xl font-black tracking-tight ${
              isDark ? 'text-slate-100' : 'text-slate-900'
            }`}>
              CAMP <span className={isDark ? 'text-blue-400' : 'text-blue-600'}>• Daily Progress Tracker</span>
            </h1>
            <p className={`text-[10px] md:text-xs font-bold mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Cerebellum Accountability Management Program • High-Yield Focus Engineering
            </p>
          </div>

          <div className="hidden md:flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowOverviewModal(true)}
              className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition active:scale-95 cursor-pointer ${
                isDark ? 'neu-btn-dark text-blue-400 hover:text-white' : 'neu-btn-light text-blue-600 hover:text-blue-800'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              CAMP Info
            </button>
          </div>
        </motion.div>

        {/* Desktop Optimized Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

          {/* LEFT SIDE: Inputs / Charts (Matches layout) */}
          <div className="space-y-5">

            {/* Efficiency Chart Card */}
            <motion.div 
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className={`${isDark ? 'neu-card-dark' : 'neu-card-light'} rounded-3xl p-4 sm:p-5 md:p-6 shadow-sm space-y-4`}
            >
              <div className="flex items-center justify-between">
                <h2 className={`text-sm md:text-base font-black tracking-tight flex items-center gap-2 ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}>
                  <div className={`p-2 rounded-xl ${isDark ? 'neu-pressed-dark text-blue-400' : 'neu-pressed-light text-blue-600'}`}>
                    <Activity className="w-4 h-4" />
                  </div>
                  Your Overall Efficiency Progress
                </h2>
                <button
                  type="button"
                  onClick={() => setShowOverviewModal(true)}
                  className={`p-2 rounded-xl transition ${
                    isDark ? 'neu-pressed-dark text-slate-400 hover:text-blue-400' : 'neu-pressed-light text-slate-400 hover:text-blue-600'
                  }`}
                  title="CAMP Info"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              </div>

              {/* Responsive Progress Line Graph */}
              <ProgressChart data={history} themeMode={themeMode} />

              <div className="flex justify-center pt-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => setShowOverviewModal(true)}
                  className={`rounded-2xl px-6 py-3 text-xs font-black tracking-widest uppercase transition-all duration-200 cursor-pointer ${
                    isDark ? 'neu-btn-accent-dark text-white' : 'neu-btn-accent-light text-white'
                  }`}
                >
                  CAMP Overview
                </motion.button>
              </div>
            </motion.div>

            {/* Manage History Card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <CollapsibleCard title="Manage Logged Days" icon={Trash2} defaultOpen={false} themeMode={themeMode}>
                <div className="py-2 space-y-2">
                  <p className={`text-xs font-medium mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Select and delete any previously logged values to remove them from your progress chart.
                  </p>
                  {history.length === 0 ? (
                    <p className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No logged data available.</p>
                  ) : (
                    <div className={`max-h-48 overflow-y-auto divide-y rounded-2xl pr-1 custom-scrollbar ${
                      isDark 
                        ? 'neu-pressed-dark divide-slate-750 border border-slate-750' 
                        : 'neu-pressed-light divide-slate-200 border border-slate-200'
                    }`}>
                      {history.map((item, idx) => (
                        <div key={`hist-${item.date}-${idx}`} className={`flex items-center justify-between p-3 text-xs font-semibold transition-colors ${
                          isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'
                        }`}>
                          <div className="flex flex-col text-left">
                            <span className={`font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{item.date}</span>
                            <span className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Logged Efficiency</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={`font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{item.score.toFixed(1)}%</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteHistoryItem(idx)}
                              className={`p-1.5 rounded-lg transition ${
                                isDark ? 'hover:bg-red-500/10 text-slate-400 hover:text-red-400' : 'hover:bg-red-50 text-slate-400 hover:text-red-600'
                              }`}
                              title={`Delete entry for ${item.date}`}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleCard>
            </motion.div>

            {/* Session History Log Card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <CollapsibleCard title={`Session History Log (${timerHistory.length} entries)`} icon={History} defaultOpen={false} themeMode={themeMode}>
                <div className="py-2 space-y-3">
                  <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    All sessions logged via timers. Delete individual entries to correct mistakes — CAMP session hours will auto-recalculate.
                  </p>

                  {/* Date filter */}
                  <div className="flex items-center gap-2">
                    <Filter className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                    <input
                      type="date"
                      value={historyFilterDate}
                      max={todayDateStr}
                      onChange={(e) => setHistoryFilterDate(e.target.value)}
                      placeholder="Filter by date"
                      className={`flex-1 rounded-xl px-3.5 py-2 text-xs font-bold focus:outline-none transition cursor-pointer ${
                        isDark 
                          ? 'neu-pressed-dark text-slate-100 border-slate-750 bg-[#222730]' 
                          : 'neu-pressed-light text-slate-800 border-slate-200 bg-[#e6ecf5]'
                      }`}
                    />
                    {historyFilterDate && (
                      <button
                        type="button"
                        onClick={() => setHistoryFilterDate('')}
                        className={`text-[10px] font-black transition px-2.5 py-1.5 rounded-xl cursor-pointer ${
                          isDark ? 'neu-btn-dark text-red-400 hover:text-red-300' : 'neu-btn-light text-red-600 hover:text-red-700'
                        }`}
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {timerHistory.length === 0 ? (
                    <div className={`text-center py-6 text-xs italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      No sessions logged yet. Start a timer and save a session to see it here.
                    </div>
                  ) : (() => {
                    const filtered = timerHistory
                      .map((item, originalIdx) => ({ ...item, originalIdx }))
                      .filter(item => !historyFilterDate || item.date === historyFilterDate)
                      .sort((a, b) => b.date.localeCompare(a.date) || b.originalIdx - a.originalIdx);

                    if (filtered.length === 0) {
                      return (
                        <div className={`text-center py-4 text-xs italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          No sessions found for {historyFilterDate}.
                        </div>
                      );
                    }

                    const periodLabel = (p) => p === 'preLunch' ? '🌅 Pre Lunch' : p === 'midDay' ? '☀️ Midday' : '🌙 Post Dinner';
                    const typeLabel = (t) => t === 'notes' ? '📚 Notes' : t === 'qbank' ? '❓ Qbank' : t === 'flashcards' ? '🎴 Flashcards' : '🏆 Grand Test';
                    const typeColor = (t) => {
                      if (t === 'notes') return isDark ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'bg-blue-50 text-blue-700 border-blue-200';
                      if (t === 'qbank') return isDark ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200';
                      if (t === 'flashcards') return isDark ? 'bg-violet-500/15 text-violet-400 border-violet-500/30' : 'bg-violet-50 text-violet-700 border-violet-200';
                      return isDark ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' : 'bg-orange-50 text-orange-700 border-orange-200';
                    };
                    const metricStr = (item) => {
                      if (item.type === 'notes' && item.pagesRead > 0) return `${item.pagesRead} pages`;
                      if (item.type === 'qbank' && item.questionsSolved > 0) return `${item.questionsSolved} Qs`;
                      if (item.type === 'flashcards' && item.cardsReviewed > 0) return `${item.cardsReviewed} cards`;
                      if (item.type === 'gt' && item.gtDetails) return item.gtDetails.name || 'GT';
                      return null;
                    };

                    return (
                      <div className={`max-h-72 overflow-y-auto divide-y rounded-2xl custom-scrollbar ${
                        isDark 
                          ? 'neu-pressed-dark divide-slate-750 border border-slate-750' 
                          : 'neu-pressed-light divide-slate-200 border border-slate-200'
                      }`}>
                        {filtered.map((item) => {
                          const metric = metricStr(item);
                          return (
                            <motion.div
                              key={`th-${item.date}-${item.originalIdx}`}
                              layout
                              initial={{ opacity: 0, x: -4 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 4 }}
                              className={`flex items-start justify-between gap-3 p-3.5 transition-colors group ${
                                isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'
                              }`}
                            >
                              <div className="flex flex-col gap-1.5 flex-1 min-w-0 text-left">
                                {/* Row 1: Date + Day */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[10px] font-black ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{item.date}</span>
                                  <span className={`text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{item.dayOfWeek}</span>
                                </div>
                                {/* Row 2: Period + Type chips */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-[9px] font-black border px-2 py-0.5 rounded-full ${
                                    isDark ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-sky-50 text-sky-700 border-sky-200'
                                  }`}>
                                    {periodLabel(item.period)}
                                  </span>
                                  <span className={`text-[9px] font-black border px-2 py-0.5 rounded-full ${typeColor(item.type)}`}>
                                    {typeLabel(item.type)}
                                  </span>
                                </div>
                                {/* Row 3: Metrics */}
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className={`text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    ⏱ {item.hours}h
                                  </span>
                                  <span className={`text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    🎯 Focus {item.concentration}/10
                                  </span>
                                  {metric && (
                                    <span className={`text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                      📌 {metric}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Delete button */}
                              <button
                                type="button"
                                onClick={() => handleDeleteTimerHistoryItem(item.originalIdx)}
                                title="Delete this session"
                                className={`shrink-0 p-2 rounded-xl transition cursor-pointer ${
                                  isDark ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                }`}
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
            </motion.div>

            {/* Inputs Label & Date Selector */}
            <motion.div 
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-center sm:text-left"
            >
              <div>
                <h2 className={`text-base font-black tracking-tight uppercase ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}>
                  Add Day's Progress
                </h2>
                <p className={`text-[10px] font-semibold mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Select a date to log or modify CAMP tracker values.
                </p>
              </div>
              <div className="flex justify-center sm:justify-end">
                <input
                  type="date"
                  value={selectedDate}
                  max={todayDateStr}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className={`rounded-2xl px-4 py-2.5 text-xs font-black focus:outline-none transition cursor-pointer ${
                    isDark 
                      ? 'neu-pressed-dark text-slate-100 border-slate-750 bg-[#222730]' 
                      : 'neu-pressed-light text-slate-800 border-slate-200 bg-[#e6ecf5]'
                  }`}
                />
              </div>
            </motion.div>

            {/* Bed to Book Time */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
            >
              <CollapsibleCard title="Bed to Book Time" icon={Clock} defaultOpen={true} themeMode={themeMode}>
                <div className="py-2 space-y-2 text-left">
                  <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    How quickly did you sit down to study after waking up?
                  </p>
                  <div className="relative mt-1">
                    <select
                      value={bedToBook}
                      onChange={(e) => setBedToBook(e.target.value)}
                      className={`w-full rounded-2xl px-4 py-3.5 text-xs font-black focus:outline-none transition appearance-none cursor-pointer ${
                        isDark 
                          ? 'neu-pressed-dark text-slate-100 border-slate-750 bg-[#222730]' 
                          : 'neu-pressed-light text-slate-800 border-slate-200 bg-[#e6ecf5]'
                      }`}
                    >
                      <option value="Less than 45 mins" className={isDark ? 'bg-[#222730] text-slate-100' : 'bg-[#e6ecf5] text-slate-800'}>
                        Less than 45 mins (No Penalty)
                      </option>
                      <option value="45-60 min" className={isDark ? 'bg-[#222730] text-slate-100' : 'bg-[#e6ecf5] text-slate-800'}>
                        45 to 60 mins (5% Penalty)
                      </option>
                      <option value="More than 1 hour" className={isDark ? 'bg-[#222730] text-slate-100' : 'bg-[#e6ecf5] text-slate-800'}>
                        More than 1 hour (15% Penalty)
                      </option>
                    </select>
                    <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <Clock className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </CollapsibleCard>
            </motion.div>

            {/* Study Sessions Card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <CollapsibleCard title="Study Sessions & Concentration" icon={BookOpen} defaultOpen={true} themeMode={themeMode}>
                <div className="py-2 space-y-3.5">
                  {/* Slot Switcher Pill */}
                  <div className={`relative grid grid-cols-3 p-1 rounded-2xl ${isDark ? 'neu-pressed-dark border border-slate-750' : 'neu-pressed-light border border-slate-200'}`}>
                    <div
                      className="absolute top-1 bottom-1 rounded-xl bg-blue-600 shadow-md transition-all"
                      style={{
                        width: 'calc(33.333% - 3px)',
                        left: activeSessionSlot === 'preLunch' ? '2px' : activeSessionSlot === 'midDay' ? 'calc(33.333% + 1px)' : 'calc(66.666%)',
                        transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
                      }}
                    />
                    {[
                      { key: 'preLunch', label: 'Pre Lunch', icon: '🌅' },
                      { key: 'midDay', label: 'Midday', icon: '☀️' },
                      { key: 'postDinner', label: 'Post Dinner', icon: '🌙' },
                    ].map((slot) => {
                      const isActive = activeSessionSlot === slot.key;
                      const agg = aggregatedSessions[slot.key] || { hours: '0' };
                      const hrs = parseFloat(agg.hours) || 0;
                      return (
                        <button
                          key={slot.key}
                          type="button"
                          onClick={() => setActiveSessionSlot(slot.key)}
                          className={`relative z-10 py-1.5 px-0.5 text-[9px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-colors duration-200 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 cursor-pointer ${
                            isActive ? 'text-white' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="text-xs">{slot.icon}</span>
                            <span className="truncate">{slot.label}</span>
                          </span>
                          {hrs > 0 && (
                            <span className={`text-[8px] px-1.5 py-0.2 rounded-full font-black ${
                              isActive ? 'bg-white/20 text-white' : isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {hrs.toFixed(1)}h
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Slot Content */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeSessionSlot}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                    >
                      {activeSessionSlot === 'preLunch' && renderCategoryBlock('preLunch', 'Pre Lunch', 'Midnight to 1:00 PM')}
                      {activeSessionSlot === 'midDay' && renderCategoryBlock('midDay', 'Midday', '1:00 PM to 7:00 PM')}
                      {activeSessionSlot === 'postDinner' && renderCategoryBlock('postDinner', 'Post Dinner', '7:00 PM to Midnight')}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </CollapsibleCard>
            </motion.div>

            {/* Productivity Insights Card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
            >
              <CollapsibleCard title="Productivity Insights & Recommendations" icon={Activity} defaultOpen={true} themeMode={themeMode}>
                <div className="space-y-6 py-2">
                  {timerHistory.length === 0 ? (
                    <div className={`rounded-3xl p-8 border border-dashed text-center flex flex-col items-center justify-center space-y-3.5 ${
                      isDark 
                        ? 'neu-pressed-dark border-slate-750' 
                        : 'neu-pressed-light border-slate-300'
                    }`}>
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg animate-pulse ${
                        isDark ? 'neu-card-dark text-blue-400' : 'neu-card-light text-blue-600'
                      }`}>
                        📊
                      </div>
                      <div className="space-y-1">
                        <h4 className={`font-black text-xs uppercase tracking-wider text-left md:text-center ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                          Focus Analytics Empty
                        </h4>
                        <p className={`text-[10px] font-semibold leading-relaxed max-w-sm mx-auto text-left md:text-center ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
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
                        <div className={`text-left border-b pb-2 ${isDark ? 'border-slate-700/60' : 'border-slate-200/80'}`}>
                          <h3 className={`text-xs font-black uppercase tracking-widest block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            AI Recommendations & Learnings
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                          {/* Recommendation 1 */}
                          <div className={`rounded-2xl p-4 flex flex-col items-start gap-2.5 text-left transition border ${
                            isDark 
                              ? 'neu-item-dark border-slate-750 hover:border-blue-500/40' 
                              : 'neu-item-light border-slate-200/80 hover:border-blue-500/40'
                          }`}>
                            <span className="text-xl">🎴</span>
                            <h4 className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                              Flashcard Strategy
                            </h4>
                            <p className={`text-[10px] font-medium leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              Your peak focus for Flashcards is during <span className={`font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{insights.flashcardsPeriod}</span> with a focus score of <span className={`font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{insights.flashcardsFocus}/10</span>. We recommend doing reviews in this slot.
                            </p>
                          </div>

                          {/* Recommendation 2 */}
                          <div className={`rounded-2xl p-4 flex flex-col items-start gap-2.5 text-left transition border ${
                            isDark 
                              ? 'neu-item-dark border-slate-750 hover:border-blue-500/40' 
                              : 'neu-item-light border-slate-200/80 hover:border-blue-500/40'
                          }`}>
                            <span className="text-xl">❓</span>
                            <h4 className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                              Qbank Strategy
                            </h4>
                            <p className={`text-[10px] font-medium leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              For Qbank practicing, you excel during <span className={`font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{insights.qbankPeriod}</span> (rating: <span className={`font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{insights.qbankFocus}/10</span>). Schedule question blocks in this period.
                            </p>
                          </div>

                          {/* Recommendation 3 */}
                          <div className={`rounded-2xl p-4 flex flex-col items-start gap-2.5 text-left transition border ${
                            isDark 
                              ? 'neu-item-dark border-slate-750 hover:border-blue-500/40' 
                              : 'neu-item-light border-slate-200/80 hover:border-blue-500/40'
                          }`}>
                            <span className="text-xl">📅</span>
                            <h4 className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                              Session & Day Adherence
                            </h4>
                            <p className={`text-[10px] font-medium leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              Your highest concentration matches <span className={`font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{insights.durationRange}</span> (rating: <span className={`font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{insights.durationFocus}/10</span>). <span className={`font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{insights.bestDay}</span> is your most productive day.
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                </div>
              </CollapsibleCard>
            </motion.div>

          </div>

          {/* RIGHT SIDE: Output Dashboard (Performance Score) */}
          <div className="space-y-6 lg:sticky lg:top-4">

            {/* Performance Score Main Container */}
            <motion.div 
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className={`${isDark ? 'neu-card-dark' : 'neu-card-light'} rounded-3xl p-6 md:p-8 space-y-6 shadow-sm`}
            >

              <div className={`text-center border-b pb-4 ${isDark ? 'border-slate-700/60' : 'border-slate-200/80'}`}>
                <h2 className={`text-base font-black tracking-tight uppercase flex items-center justify-center gap-2 ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}>
                  <div className={`p-2 rounded-xl ${isDark ? 'neu-pressed-dark text-blue-400' : 'neu-pressed-light text-blue-600'}`}>
                    <Award className="w-5 h-5" />
                  </div>
                  Performance Score
                </h2>
              </div>

              {/* 1. Efficiency Score Dial Block */}
              <div className={`rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-1.5 border ${
                isDark 
                  ? 'neu-pressed-dark border-slate-750' 
                  : 'neu-pressed-light border-slate-200'
              }`}>
                <span className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Efficiency Score
                </span>
                <span className={`text-[10px] font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  This highlights your overall study performance.
                </span>
                <span className={`text-4xl font-black pt-2 block tracking-tight ${
                  isDark ? 'text-blue-400' : 'text-blue-600'
                }`}>
                  {efficiencyScore.toFixed(1)}%
                </span>
              </div>

              {/* 2. Overall Concentration Average Block */}
              <div className={`rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-1 border ${
                isDark 
                  ? 'neu-pressed-dark border-slate-750' 
                  : 'neu-pressed-light border-slate-200'
              }`}>
                <span className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Overall Concentration
                </span>
                <span className={`text-[10px] font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  Time-weighted focus across all periods.
                </span>
                <span className={`text-2xl font-black pt-2 block ${
                  isDark ? 'text-blue-400' : 'text-blue-600'
                }`}>
                  {weightedConcentration.toFixed(1)}/10
                </span>
              </div>

              {/* 3. Effective Study Hours Breakdowns */}
              <div className="space-y-3">
                <h3 className={`text-[10px] font-black uppercase tracking-widest border-b pb-1.5 ${
                  isDark ? 'text-slate-400 border-slate-700/60' : 'text-slate-500 border-slate-200/80'
                }`}>
                  Effective Period Breakdown
                </h3>

                {/* Pre Lunch Card */}
                <div className={`rounded-2xl p-4 flex justify-between items-center transition border ${
                  isDark 
                    ? 'neu-item-dark border-slate-750 hover:border-blue-500/40' 
                    : 'neu-item-light border-slate-200/80 hover:border-blue-500/40'
                }`}>
                  <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Pre Lunch Effective Study
                  </span>
                  <span className={`text-sm font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                    {preLunchEffective.toFixed(1)} Hours
                  </span>
                </div>

                {/* Midday Card */}
                <div className={`rounded-2xl p-4 flex justify-between items-center transition border ${
                  isDark 
                    ? 'neu-item-dark border-slate-750 hover:border-blue-500/40' 
                    : 'neu-item-light border-slate-200/80 hover:border-blue-500/40'
                }`}>
                  <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Midday Effective Study
                  </span>
                  <span className={`text-sm font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                    {midDayEffective.toFixed(1)} Hours
                  </span>
                </div>

                {/* Post Dinner Card */}
                <div className={`rounded-2xl p-4 flex justify-between items-center transition border ${
                  isDark 
                    ? 'neu-item-dark border-slate-750 hover:border-blue-500/40' 
                    : 'neu-item-light border-slate-200/80 hover:border-blue-500/40'
                }`}>
                  <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Post Dinner Effective Study
                  </span>
                  <span className={`text-sm font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                    {postDinnerEffective.toFixed(1)} Hours
                  </span>
                </div>
              </div>

              {/* Save Entry CTA */}
              <div className="pt-2 flex flex-col gap-2">
                <motion.button
                  whileHover={grossHours > 0 ? { scale: 1.02 } : {}}
                  whileTap={grossHours > 0 ? { scale: 0.98 } : {}}
                  type="button"
                  onClick={handleSaveProgress}
                  disabled={grossHours === 0}
                  className={`w-full py-4 rounded-2xl text-xs font-black tracking-widest uppercase transition-all duration-300 shadow-md cursor-pointer ${
                    grossHours === 0
                      ? isDark ? 'neu-pressed-dark text-slate-500 cursor-not-allowed shadow-none' : 'neu-pressed-light text-slate-400 cursor-not-allowed shadow-none'
                      : isDark ? 'neu-btn-accent-dark text-white' : 'neu-btn-accent-light text-white'
                  }`}
                >
                  Log Today's Progress
                </motion.button>

                {saveStatus && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-center justify-center gap-2 text-xs font-black py-2.5 rounded-2xl mt-1 border ${
                      isDark 
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' 
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    {saveStatus}
                  </motion.div>
                )}
              </div>

            </motion.div>

          </div>

        </div>

      </div>

      {/* CAMP OVERVIEW POPUP MODAL */}
      <AnimatePresence>
        {showOverviewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={`${isDark ? 'neu-card-dark border border-slate-700' : 'neu-card-light border border-white/80'} rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden`}
            >
              <div className={`px-6 py-4.5 flex justify-between items-center ${
                isDark ? 'neu-btn-accent-dark text-white' : 'neu-btn-accent-light text-white'
              }`}>
                <h3 className="font-black text-sm uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  CAMP Method Overview
                </h3>
                <button
                  type="button"
                  onClick={() => setShowOverviewModal(false)}
                  className="text-white/80 hover:text-white font-black text-sm focus:outline-none cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className={`p-6 md:p-8 space-y-4 text-xs leading-relaxed text-left ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}>
                <p>
                  The <strong className={isDark ? 'text-slate-100' : 'text-slate-900'}>Cerebellum Accountability Management Program (CAMP)</strong> tracks medical students' daily study habits using strict mathematical constraints to enforce true focus.
                </p>

                <div className={`space-y-2.5 border-l-2 pl-4 py-1.5 ${
                  isDark ? 'border-blue-500/50' : 'border-blue-500'
                }`}>
                  <p>
                    <strong className={isDark ? 'text-slate-100' : 'text-slate-900'}>1. Bed-to-Book Penalty:</strong> If you wait more than 45 minutes to start studying after waking up, you lose efficiency.
                    <br />• Under 45m: <span className="text-emerald-500 font-bold">0% Penalty</span>
                    <br />• 45–60m: <span className="text-amber-500 font-bold">5% Penalty</span>
                    <br />• Over 1 hour: <span className="text-red-500 font-bold">15% Penalty</span>
                  </p>
                  <p>
                    <strong className={isDark ? 'text-slate-100' : 'text-slate-900'}>2. Time-Weighted Focus:</strong> Study sessions with longer duration are weighted heavier in calculating concentration ratings.
                  </p>
                  <p>
                    <strong className={isDark ? 'text-slate-100' : 'text-slate-900'}>3. Deep Study Bonus:</strong> Gain <span className={isDark ? 'text-blue-400 font-black' : 'text-blue-600 font-black'}>+2%</span> for each distraction-free 50m block, capped up to <span className={isDark ? 'text-blue-400 font-black' : 'text-blue-600 font-black'}>+10%</span>.
                  </p>
                </div>

                <div className={`pt-3 border-t flex justify-end ${
                  isDark ? 'border-slate-700/60' : 'border-slate-200/80'
                }`}>
                  <button
                    type="button"
                    onClick={() => setShowOverviewModal(false)}
                    className={`px-6 py-2.5 rounded-2xl font-black uppercase tracking-widest text-[10px] transition active:scale-95 cursor-pointer ${
                      isDark ? 'neu-btn-dark text-slate-200' : 'neu-btn-light text-slate-800'
                    }`}
                  >
                    Got it
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* YESTERDAY'S MISSED LOG PROMPT */}
      <AnimatePresence>
        {showYesterdayPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={`${isDark ? 'neu-card-dark border border-slate-700' : 'neu-card-light border border-white/80'} rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4`}
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto text-xl animate-pulse ${
                isDark ? 'neu-pressed-dark text-amber-400' : 'neu-pressed-light text-amber-600'
              }`}>
                📅
              </div>
              <div className="space-y-1.5 text-left">
                <h3 className={`text-sm font-black uppercase tracking-wider text-center ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}>
                  Missed Yesterday's Log
                </h3>
                <p className={`text-xs font-semibold leading-relaxed text-center ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  You didn't log your CAMP progress for yesterday ({yesterdayLabelText}). Would you like to review and log it now? Your inputs are preserved.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowYesterdayPrompt(false)}
                  className={`flex-1 text-xs font-black py-3 px-4 rounded-2xl transition uppercase tracking-wider cursor-pointer ${
                    isDark ? 'neu-btn-dark text-slate-300' : 'neu-btn-light text-slate-700'
                  }`}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(yesterdayDateVal);
                    setShowYesterdayPrompt(false);
                  }}
                  className={`flex-1 text-xs font-black py-3 px-4 rounded-2xl transition uppercase tracking-wider cursor-pointer ${
                    isDark ? 'neu-btn-accent-dark text-white' : 'neu-btn-accent-light text-white'
                  }`}
                >
                  Log Yesterday
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

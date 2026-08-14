import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveLocalStudyLog } from '../services/localDb';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  GripVertical, Plus, Edit2, Trash2, Settings, Play, Pause, RotateCcw,
  Flame, CheckCircle, Clock, BookOpen, BarChart2, Activity, Award,
  Calendar, Heart, Shield, RefreshCw, X, ChevronUp, ChevronDown,
  CheckCircle2, AlertCircle, PlusCircle, Maximize2, Check, ExternalLink,
  Hourglass, Timer, TrendingUp, Compass, Layout, Layers, User, Zap,
  Sliders, Sparkles
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line
} from 'recharts';
import { calculateEfficiencyScore, calculateWeightedConcentration } from '../utils/campCalculations';

export default function DashboardGrid({
  widgets = [],
  onLayoutChange,
  resetLayout,
  studySchedule = {},
  todayStr,
  handleSchedulerTaskToggle,
  parseTimeToMinutes,
  formatMinutesToTime,
  formatTime12,
  studyLogs = {},
  setStudyLogs,
  cards = [],
  currentStreak = 0,
  streakLabel = 'Dedicated Rookie',
  setSelectedStreakTag,
  isStreakAlertEnabled = true,
  pytStatus = {},
  user,
  subjectTrackerData = [],
  subjects = [],
  pytTopicsList = [],
  userPytProgress = [],
  timerState = { timerType: 'pomodoro', status: 'idle', duration: 1500, timeLeft: 1500 },
  localTimerTimeLeft = 1500,
  localCustomTimerTimeLeft = 600,
  localStopwatchTime = 0,
  handleResumeActiveTimer,
  handlePauseActiveTimer,
  handleResetActiveTimer,
  handleSwitchTimerType,
  handleStartStopwatchTimer,
  setCurrentTab,
  setIsMobile,
  isMobile,
  isDark = false,
  isWidgetCustomizerOpen,
  setIsWidgetCustomizerOpen,
  showMilliseconds = false,
  setShowMilliseconds = () => { },
  setIsTimerFullscreen = () => { }
}) {
  const timerIsRunning = timerState?.status === 'running';
  const [isEditMode, setIsEditMode] = useState(false);
  const [dailyCardTarget, setDailyCardTarget] = useState(() => {
    try {
      return parseInt(localStorage.getItem('dashboard_daily_card_target') || '50', 10);
    } catch {
      return 50;
    }
  });

  const [dailyHoursTarget, setDailyHoursTarget] = useState(() => {
    try {
      return parseFloat(localStorage.getItem('dashboard_daily_hours_target') || '4.0');
    } catch {
      return 4.0;
    }
  });

  // Quick Logger State
  const [quickCards, setQuickCards] = useState(0);
  const [quickHours, setQuickHours] = useState(0);
  const [quickQuestions, setQuickQuestions] = useState(0);
  const [quickPages, setQuickPages] = useState(0);
  const [isLoggingQuick, setIsLoggingQuick] = useState(false);
  const [hoveredStreakIdx, setHoveredStreakIdx] = useState(null);
  const [hoveredIntensityIdx, setHoveredIntensityIdx] = useState(null);
  const [radarViewType, setRadarViewType] = useState('pyt'); // 'pyt' | 'subject'

  // Sync daily targets to localStorage
  useEffect(() => {
    localStorage.setItem('dashboard_daily_card_target', dailyCardTarget.toString());
  }, [dailyCardTarget]);

  useEffect(() => {
    localStorage.setItem('dashboard_daily_hours_target', dailyHoursTarget.toString());
  }, [dailyHoursTarget]);

  // Format stopwatch time helper (HH:MM:SS or HH:MM:SS.CC)
  const formatStopwatch = (ms) => {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);
    const hStr = String(hours).padStart(2, '0');
    const mStr = String(minutes).padStart(2, '0');
    const sStr = String(seconds).padStart(2, '0');
    if (showMilliseconds) {
      const csStr = String(centiseconds).padStart(2, '0');
      return `${hStr}:${mStr}:${sStr}.${csStr}`;
    }
    return `${hStr}:${mStr}:${sStr}`;
  };

  // Format standard timer time helper (HH:MM:SS or MM:SS)
  const formatTimerTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Format decimal hours to human readable hours and minutes
  const formatHrsMins = (hrs) => {
    const totalMins = Math.round(hrs * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  };

  // Quick logging submission
  const handleQuickLogSubmit = async () => {
    setIsLoggingQuick(true);
    try {
      const todayLog = studyLogs[todayStr] || { questions: 0, cards: 0, hours: 0, pages: 0, gts: [], sessions: [] };
      const newLog = {
        ...todayLog,
        questions: (todayLog.questions || 0) + Number(quickQuestions),
        cards: (todayLog.cards || 0) + Number(quickCards),
        hours: parseFloat(((todayLog.hours || 0) + Number(quickHours)).toFixed(3)),
        pages: (todayLog.pages || 0) + Number(quickPages)
      };

      await saveLocalStudyLog(todayStr, newLog);

      if (setStudyLogs) {
        setStudyLogs(prev => ({
          ...prev,
          [todayStr]: newLog
        }));
      }

      setQuickCards(0);
      setQuickHours(0);
      setQuickQuestions(0);
      setQuickPages(0);
      setIsLoggingQuick(false);
    } catch (err) {
      console.error("Quick log error:", err);
      alert("Failed to save: " + err.message);
      setIsLoggingQuick(false);
    }
  };

  // Drag and Drop handle
  const onDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(widgets);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    onLayoutChange(items);
  };

  // Remove widget
  const removeWidget = (id) => {
    const updated = widgets.map(w => w.id === id ? { ...w, enabled: false } : w);
    onLayoutChange(updated);
  };

  // Change widget size
  const changeWidgetSize = (id, newSize) => {
    const updated = widgets.map(w => w.id === id ? { ...w, size: newSize } : w);
    onLayoutChange(updated);
  };

  // Move widget helper
  const moveWidget = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= widgets.length) return;
    const items = Array.from(widgets);
    const temp = items[index];
    items[index] = items[nextIndex];
    items[nextIndex] = temp;
    onLayoutChange(items);
  };

  // --- STATS COMPUTATION FOR RENDER ---
  const todayLog = studyLogs[todayStr] || { questions: 0, cards: 0, hours: 0, pages: 0, gts: [], sessions: [] };
  const cardsToday = todayLog.cards || 0;
  const hoursToday = todayLog.hours || 0;
  const questionsToday = todayLog.questions || 0;
  const pagesToday = todayLog.pages || 0;

  // Percentage of daily card goal
  const progressPercent = Math.min(100, Math.round((cardsToday / dailyCardTarget) * 100));

  // Streak alert status
  const isStreakSafe = cardsToday > 0 || hoursToday > 0 || questionsToday > 0 || pagesToday > 0 || (todayLog.gts && todayLog.gts.length > 0);

  // Total study stats overall
  const totalReviewsCount = useMemo(() => {
    return Object.values(studyLogs).reduce((sum, log) => sum + (log.cards || 0), 0);
  }, [studyLogs]);

  const totalHoursCount = useMemo(() => {
    return Object.values(studyLogs).reduce((sum, log) => sum + (log.hours || 0), 0);
  }, [studyLogs]);

  const totalQuestionsSolved = useMemo(() => {
    return Object.values(studyLogs).reduce((sum, log) => sum + (log.questions || 0), 0);
  }, [studyLogs]);

  // Grand Tests
  const grandTestsList = useMemo(() => {
    return Object.entries(studyLogs)
      .filter(([_, log]) => log.gts && log.gts.length > 0)
      .flatMap(([dateStr, log]) => log.gts.map((gt, idx) => ({ ...gt, date: dateStr, name: gt.name || `GT ${idx + 1}` })))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [studyLogs]);

  // Scheduled tasks count for today
  const todayTasks = useMemo(() => {
    return studySchedule[todayStr]?.tasks || [];
  }, [studySchedule, todayStr]);

  const activeTask = useMemo(() => {
    if (!todayTasks.length) return null;
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    return todayTasks.find(t => {
      const start = parseTimeToMinutes(t.startTime) || 0;
      const end = parseTimeToMinutes(t.endTime || formatMinutesToTime(start + 60)) || 0;
      return currentMin >= start && currentMin < end;
    });
  }, [todayTasks, parseTimeToMinutes, formatMinutesToTime]);

  const upcomingTask = useMemo(() => {
    if (!todayTasks.length) return null;
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    return todayTasks
      .filter(t => (parseTimeToMinutes(t.startTime) || 0) > currentMin)
      .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime))[0];
  }, [todayTasks, parseTimeToMinutes]);

  // The most recent task whose time window has already passed
  const previousTask = useMemo(() => {
    if (!todayTasks.length) return null;
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    const past = todayTasks
      .filter(t => {
        const start = parseTimeToMinutes(t.startTime) || 0;
        const end = parseTimeToMinutes(t.endTime || formatMinutesToTime(start + 60)) || 0;
        return end <= currentMin;
      })
      .sort((a, b) => {
        const endA = parseTimeToMinutes(a.endTime || formatMinutesToTime((parseTimeToMinutes(a.startTime) || 0) + 60)) || 0;
        const endB = parseTimeToMinutes(b.endTime || formatMinutesToTime((parseTimeToMinutes(b.startTime) || 0) + 60)) || 0;
        return endB - endA;
      });
    return past[0] || null;
  }, [todayTasks, parseTimeToMinutes, formatMinutesToTime]);

  // Deck subject distributions (Hierarchy Sunburst / Pie Chart Data)
  const subjectCardCounts = useMemo(() => {
    const counts = {};
    cards.forEach(card => {
      const sub = card.subject || 'Uncategorized';
      counts[sub] = (counts[sub] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [cards]);

  // Study log history 7 days (Adherence/Progress curves)
  const last7DaysLogs = useMemo(() => {
    const result = [];
    const now = new Date();

    const getCardCreatedTime = (c) => {
      if (!c || !c.createdAt) return 0;
      if (typeof c.createdAt === 'number') return c.createdAt;
      if (typeof c.createdAt.toMillis === 'function') return c.createdAt.toMillis();
      if (typeof c.createdAt.toDate === 'function') return c.createdAt.toDate().getTime();
      if (c.createdAt.seconds) return c.createdAt.seconds * 1000;
      const t = new Date(c.createdAt).getTime();
      return isNaN(t) ? 0 : t;
    };

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(23, 59, 59, 999);
      const dStr = d.toLocaleDateString('en-CA');
      const log = studyLogs[dStr] || { cards: 0, hours: 0, questions: 0 };

      const dayEndMs = d.getTime();
      const cumulativeCards = cards.filter(c => getCardCreatedTime(c) <= dayEndMs).length;

      result.push({
        dateLabel: d.toLocaleDateString(undefined, { weekday: 'short' }),
        dateStr: dStr,
        cards: log.cards || 0,
        hours: log.hours || 0,
        questions: log.questions || 0,
        libraryCards: cumulativeCards
      });
    }
    return result;
  }, [studyLogs, cards]);

  // Mock vs Live data for Grand Test score trends
  const scoreTrendsData = useMemo(() => {
    if (grandTestsList.length > 0) {
      return grandTestsList.map(gt => {
        let pctVal = null;
        if (gt.percentile !== undefined && gt.percentile !== null && gt.percentile !== '') {
          pctVal = Number(gt.percentile);
        }
        if (isNaN(pctVal) || pctVal === null) {
          if (gt.rank && gt.rankTotal) {
            pctVal = Number((((Number(gt.rankTotal) - Number(gt.rank)) / Number(gt.rankTotal)) * 100).toFixed(1));
          } else {
            const tot = gt.maxMarks || gt.total || (gt.type === 'NEETPG' ? 800 : 200);
            const scoreVal = gt.score || gt.correct || 0;
            pctVal = Math.round((scoreVal / tot) * 100);
          }
        }
        pctVal = Math.min(100, Math.max(0, pctVal));
        return {
          name: gt.name,
          score: gt.score || gt.correct || 0,
          total: gt.maxMarks || gt.total || (gt.type === 'NEETPG' ? 800 : 200),
          percent: pctVal
        };
      });
    }
    return [
      { name: 'Mock GT 1', score: 110, total: 200, percent: 55 },
      { name: 'Mock GT 2', score: 125, total: 200, percent: 62 },
      { name: 'Mock GT 3', score: 120, total: 200, percent: 60 },
      { name: 'Mock GT 4', score: 142, total: 200, percent: 71 },
      { name: 'Mock GT 5', score: 155, total: 200, percent: 77 }
    ];
  }, [grandTestsList]);

  const SUBJECTS_LIST = [
    "Anatomy", "Physiology", "Biochemistry", "Pathology", "Microbiology",
    "Pharmacology", "Forensic Medicine", "Social and Preventive Medicine",
    "Ophthalmology", "Otorhinolaryngology (ENT)", "General Medicine",
    "General Surgery", "Obstetrics and Gynecology", "Pediatrics",
    "Orthopedics", "Dermatology", "Anesthesia", "Radiology", "Psychiatry"
  ];

  // Subject mastery progress
  const subjectMasteryData = useMemo(() => {
    return SUBJECTS_LIST.map(sub => {
      const docId = sub.trim().toLowerCase();
      const subjectDoc = pytTopicsList.find(p => p.id === docId);
      const topicsArray = subjectDoc && subjectDoc.topics
        ? subjectDoc.topics.split('\n').map(t => t.trim()).filter(Boolean)
        : [];
      const totalTopics = topicsArray.length;

      const progressDoc = userPytProgress.find(p => p.id === docId);
      const progressMap = progressDoc ? progressDoc.progress_map || {} : {};

      let revisedAtLeastOnce = 0;
      topicsArray.forEach(topic => {
        if ((progressMap[topic] || 0) > 0) {
          revisedAtLeastOnce++;
        }
      });

      const coveragePercent = totalTopics > 0 ? Math.round((revisedAtLeastOnce / totalTopics) * 100) : 0;
      return {
        subject: sub,
        mastery: coveragePercent,
        count: totalTopics
      };
    });
  }, [pytTopicsList, userPytProgress]);

  const subjectTrackerMasteryData = useMemo(() => {
    return SUBJECTS_LIST.map(sub => {
      let docId = sub.trim().toLowerCase();
      if (docId.includes('ent') || docId === 'otorhinolaryngology (ent)') {
        docId = 'ent';
      }
      const trackerDoc = (subjectTrackerData || []).find(p => p.id === docId);
      const topics = trackerDoc && trackerDoc.topics ? Object.values(trackerDoc.topics) : [];
      const subTotal = topics.length;
      const subCovered = topics.filter(t => t.studyDates && t.studyDates.length > 0).length;
      const coveragePercent = subTotal === 0 ? 0 : Math.round((subCovered / subTotal) * 100);
      return {
        subject: sub === 'Otorhinolaryngology (ENT)' ? 'ENT' : sub,
        mastery: coveragePercent,
        count: subTotal
      };
    });
  }, [subjectTrackerData]);

  // Compute 63-day intensity map data
  const intensityMapData = useMemo(() => {
    const days = [];
    const now = new Date();

    for (let i = 62; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dStr = d.toLocaleDateString('en-CA');
      const log = studyLogs[dStr] || { hours: 0, questions: 0, cards: 0, pages: 0 };
      const score = (log.hours || 0) * 2 + (log.questions || 0) / 20 + (log.cards || 0) / 30 + (log.pages || 0) / 10;
      days.push({
        dateStr: dStr,
        dateLabel: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        hours: log.hours || 0,
        questions: log.questions || 0,
        cards: log.cards || 0,
        pages: log.pages || 0,
        score
      });
    }

    const nonZeroScores = days.map(d => d.score).filter(s => s > 0);
    const maxScore = nonZeroScores.length > 0 ? Math.max(...nonZeroScores) : 0;
    const minScore = nonZeroScores.length > 0 ? Math.min(...nonZeroScores) : 0;

    return {
      days,
      minScore,
      maxScore
    };
  }, [studyLogs]);

  // Design system helper styles
  const tooltipStyle = {
    backgroundColor: isDark ? '#222730' : '#ffffff',
    borderColor: isDark ? '#334155' : '#cbd5e1',
    borderRadius: '1rem',
    color: isDark ? '#f1f5f9' : '#1e293b',
    boxShadow: isDark ? '0 10px 25px -5px rgba(0, 0, 0, 0.5)' : '0 10px 25px -5px rgba(0, 0, 0, 0.1)'
  };
  const gridStroke = isDark ? '#334155' : '#e2e8f0';
  const axisStroke = isDark ? '#94a3b8' : '#64748b';

  return (
    <div className={`flex-grow flex flex-col overflow-hidden p-4 md:p-6 select-none transition-colors duration-300 ${
      isDark ? 'neu-bg-dark text-slate-100' : 'neu-bg-light text-slate-800'
    }`}>

      {/* DASHBOARD TOP BAR CONTROL PANEL */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <h1 className={`text-xl md:text-2xl font-black tracking-tight flex items-center gap-2.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/25 shrink-0">
              <Layout className="w-4.5 h-4.5" />
            </div>
            Performance Command Center
          </h1>
          <p className={`text-xs mt-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Organize, customize, and track your high-yield NEET PG medical revision dashboard.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setIsEditMode(!isEditMode)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition duration-200 cursor-pointer ${
              isEditMode
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
                : isDark
                  ? 'neu-btn-dark text-slate-300 hover:text-white border border-slate-750'
                  : 'neu-btn-light text-slate-700 hover:text-slate-900 border border-slate-200/80'
            }`}
          >
            {isEditMode ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Done
              </>
            ) : (
              <>
                <Edit2 className="w-3.5 h-3.5" />
                Arrange Grid
              </>
            )}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setIsWidgetCustomizerOpen(true)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition text-white shadow-md cursor-pointer ${
              isDark ? 'neu-btn-accent-dark' : 'neu-btn-accent-light'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Widgets
          </motion.button>
        </div>
      </motion.div>

      {/* DASHBOARD GRID CONTAINER */}
      <div className="flex-grow overflow-y-auto pr-1 custom-scrollbar">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="dashboard-grid-droppable">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 pb-16"
              >
                {widgets
                  .filter(w => w.enabled)
                  .map((widget, index) => {
                    let spanClass = 'col-span-1';
                    if (!isMobile) {
                      if (widget.size === 'medium') spanClass = 'col-span-2';
                      else if (widget.size === 'large') spanClass = 'col-span-3';
                      else if (widget.size === 'full') spanClass = 'col-span-4';
                    }

                    return (
                      <Draggable
                        key={widget.id}
                        draggableId={widget.id}
                        index={index}
                        isDragDisabled={!isEditMode}
                      >
                        {(dragProvided, dragSnapshot) => (
                          <motion.div
                            initial={{ opacity: 0, y: 16, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.35, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }}
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`rounded-3xl border ${
                              dragSnapshot.isDragging
                                ? isDark
                                  ? 'shadow-2xl ring-2 ring-blue-500 scale-[1.02] z-50 bg-[#2d3440] border-blue-500'
                                  : 'shadow-2xl ring-2 ring-blue-400 scale-[1.02] z-50 bg-white border-blue-400'
                                : isDark
                                  ? 'neu-card-dark border-slate-750/70 hover:border-blue-500/30'
                                  : 'neu-card-light border-slate-200/80 hover:border-blue-400/40'
                            } ${spanClass} flex flex-col overflow-hidden transition-all duration-200 relative group`}
                          >

                            {/* WIDGET CARD HEADER */}
                            <div className={`flex items-center justify-between px-5 py-3 border-b select-none ${
                              isDark ? 'border-slate-800 bg-[#1c212a]/50' : 'border-slate-200/80 bg-slate-100/50'
                            }`}>
                              <div className="flex items-center gap-2">
                                {isEditMode && (
                                  <div
                                    {...dragProvided.dragHandleProps}
                                    className={`cursor-grab active:cursor-grabbing p-1 -ml-1 rounded transition ${
                                      isDark ? 'text-slate-400 hover:text-blue-400' : 'text-slate-500 hover:text-blue-600'
                                    }`}
                                  >
                                    <GripVertical className="w-4 h-4" />
                                  </div>
                                )}
                                <span className={`font-extrabold text-[11px] tracking-widest uppercase ${
                                  isDark ? 'text-slate-200' : 'text-slate-700'
                                }`}>
                                  {widget.label}
                                </span>
                              </div>

                              {/* ACTIONS IN EDIT MODE */}
                              {isEditMode ? (
                                <div className="flex items-center gap-1.5 animate-in fade-in duration-300">
                                  <button
                                    onClick={() => moveWidget(index, -1)}
                                    disabled={index === 0}
                                    className={`p-1 rounded disabled:opacity-30 transition ${
                                      isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-200 text-slate-600'
                                    }`}
                                    title="Move Up"
                                  >
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => moveWidget(index, 1)}
                                    disabled={index === widgets.filter(w => w.enabled).length - 1}
                                    className={`p-1 rounded disabled:opacity-30 transition ${
                                      isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-200 text-slate-600'
                                    }`}
                                    title="Move Down"
                                  >
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  </button>

                                  <select
                                    value={widget.size}
                                    onChange={(e) => changeWidgetSize(widget.id, e.target.value)}
                                    className={`text-[9px] font-bold border rounded-lg px-1.5 py-0.5 outline-none ${
                                      isDark
                                        ? 'neu-pressed-dark text-slate-200 border-slate-700'
                                        : 'neu-pressed-light text-slate-700 border-slate-200'
                                    }`}
                                    title="Resize Widget"
                                  >
                                    <option value="small">Small</option>
                                    <option value="medium">Medium</option>
                                    <option value="large">Large</option>
                                    <option value="full">Full</option>
                                  </select>

                                  <button
                                    onClick={() => removeWidget(widget.id)}
                                    className={`p-1 rounded transition ${
                                      isDark ? 'hover:bg-red-950/50 text-red-400' : 'hover:bg-red-50 text-red-500'
                                    }`}
                                    title="Hide Widget"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="text-[10px] font-medium">
                                  {widget.id === 'liveStudyTracker' && activeTask && (
                                    <span className={`flex items-center gap-1.5 font-bold px-2 py-0.5 rounded-full border ${
                                      isDark
                                        ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400'
                                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    }`}>
                                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                                      Active
                                    </span>
                                  )}
                                  {widget.id === 'focusTimerHub' && timerIsRunning && (
                                    <span className={`flex items-center gap-1.5 font-bold px-2 py-0.5 rounded-full border ${
                                      isDark
                                        ? 'bg-indigo-950/40 border-indigo-800/60 text-indigo-400'
                                        : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                    }`}>
                                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                                      Ticking
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* WIDGET CONTENT RENDERER */}
                            <div className="flex-grow p-5 min-h-[160px] flex flex-col justify-between">
                              {renderWidgetBody(widget.id)}
                            </div>

                          </motion.div>
                        )}
                      </Draggable>
                    );
                  })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {/* --- WIDGET CUSTOMIZER MODAL --- */}
      <AnimatePresence>
        {isWidgetCustomizerOpen && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className={`w-full max-w-2xl rounded-3xl border flex flex-col overflow-hidden max-h-[85vh] shadow-2xl ${
                isDark ? 'neu-card-dark text-slate-100 border-slate-750' : 'neu-card-light text-slate-800 border-slate-200'
              }`}
            >

              {/* Modal Header */}
              <div className="px-6 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-between text-white shadow-md shrink-0">
                <div>
                  <h3 className="font-black text-lg tracking-tight flex items-center gap-2">
                    <Layout className="w-5 h-5" />
                    Customize Dashboard Panels
                  </h3>
                  <p className="text-[11px] text-blue-100 font-medium">Toggle dashboard widgets on or off and set layout dimensions.</p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsWidgetCustomizerOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>

              {/* Modal Body - List of widgets */}
              <div className="p-6 overflow-y-auto space-y-2.5 flex-grow custom-scrollbar">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Available Widgets ({widgets.filter(w => w.enabled).length} of {widgets.length} Active)
                  </span>
                  <button
                    onClick={() => {
                      if (window.confirm("Reset dashboard layout to defaults?")) {
                        resetLayout();
                        setIsWidgetCustomizerOpen(false);
                      }
                    }}
                    className={`text-[10px] font-bold text-red-500 hover:text-red-600 transition flex items-center gap-1 cursor-pointer`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to Default
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {widgets.map(w => (
                    <div
                      key={w.id}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                        w.enabled
                          ? isDark
                            ? 'neu-item-dark border-blue-500/40 text-slate-100'
                            : 'neu-item-light border-blue-400/50 text-slate-800'
                          : isDark
                            ? 'bg-[#1e232b]/60 border-slate-800 text-slate-400 opacity-60'
                            : 'bg-slate-100/60 border-slate-200 text-slate-400 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <input
                          type="checkbox"
                          checked={w.enabled}
                          onChange={() => {
                            const updated = widgets.map(item => item.id === w.id ? { ...item, enabled: !item.enabled } : item);
                            onLayoutChange(updated);
                          }}
                          id={`chk-${w.id}`}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer shrink-0"
                        />
                        <label htmlFor={`chk-${w.id}`} className="text-xs font-black cursor-pointer truncate">
                          {w.label}
                        </label>
                      </div>

                      {w.enabled && (
                        <select
                          value={w.size}
                          onChange={(e) => changeWidgetSize(w.id, e.target.value)}
                          className={`text-[9px] font-bold rounded-lg px-2 py-1 outline-none border cursor-pointer ${
                            isDark
                              ? 'neu-pressed-dark text-slate-200 border-slate-700'
                              : 'neu-pressed-light text-slate-700 border-slate-200'
                          }`}
                        >
                          <option value="small">Small (1x)</option>
                          <option value="medium">Medium (2x)</option>
                          <option value="large">Large (3x)</option>
                          <option value="full">Full (4x)</option>
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Footer */}
              <div className={`p-4 px-6 border-t flex justify-end gap-3 shrink-0 ${
                isDark ? 'border-slate-800 bg-[#1e232b]/40' : 'border-slate-200 bg-slate-100/40'
              }`}>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setIsWidgetCustomizerOpen(false)}
                  className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white shadow-md cursor-pointer ${
                    isDark ? 'neu-btn-accent-dark' : 'neu-btn-accent-light'
                  }`}
                >
                  Apply Layout
                </motion.button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );

  // --- CORE WIDGET BODY RENDER SWITCHER ---
  function renderWidgetBody(id) {
    switch (id) {

      case 'campEfficiencyCard': {
        const todayDate = new Date().toLocaleDateString('en-CA');
        const todayLabelStr = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).replace(' ', '-');

        let sessions = {
          preLunch: { hours: '0', concentration: 7 },
          midDay: { hours: '0', concentration: 7 },
          postDinner: { hours: '0', concentration: 7 }
        };
        let bedToBook = 'Less than 45 mins';

        try {
          const savedSessions = localStorage.getItem(`camp_sessions_${todayDate}`);
          if (savedSessions) sessions = JSON.parse(savedSessions);
          const savedB2B = localStorage.getItem(`camp_bedToBook_${todayDate}`);
          if (savedB2B) bedToBook = savedB2B;
        } catch (e) {
          console.error("Error reading localStorage in Dashboard widget:", e);
        }

        const currentScore = calculateEfficiencyScore(sessions, bedToBook);
        const focusAvg = calculateWeightedConcentration(sessions);

        let history = [];
        try {
          const savedHistory = localStorage.getItem('camp_history');
          if (savedHistory) history = JSON.parse(savedHistory);
        } catch (e) {
          console.error("Error reading history in Dashboard widget:", e);
        }

        let prevScore = 0;
        if (history.length > 0) {
          const lastEntry = history[history.length - 1];
          if (lastEntry.date === todayLabelStr) {
            prevScore = history[history.length - 2]?.score ?? 0;
          } else {
            prevScore = lastEntry.score ?? 0;
          }
        }

        const changeVal = currentScore - prevScore;
        const showChange = history.length > 0 && prevScore > 0;

        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-sky-500/25">
                  <Award className="w-8 h-8" />
                </div>
              </div>
              <div className="text-left">
                <span className={`text-[10px] font-black uppercase tracking-widest block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Efficiency Score
                </span>
                <div className="flex items-baseline gap-2.5 mt-0.5">
                  <span className={`text-2xl font-black ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>
                    {currentScore.toFixed(1)}%
                  </span>

                  {showChange && changeVal !== 0 && (
                    <span className={`text-xs font-black flex items-center gap-0.5 ${changeVal > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {changeVal > 0 ? '▲' : '▼'} {Math.abs(changeVal).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-1">
              <div className={`p-3 rounded-2xl border flex flex-col justify-center ${
                isDark ? 'neu-pressed-dark border-slate-750' : 'neu-pressed-light border-slate-200'
              }`}>
                <span className={`text-[9px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Focus Average
                </span>
                <span className={`text-sm font-black mt-0.5 block ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                  {focusAvg.toFixed(1)}/10
                </span>
              </div>

              <div className={`p-3 rounded-2xl border flex flex-col justify-center ${
                isDark ? 'neu-pressed-dark border-slate-750' : 'neu-pressed-light border-slate-200'
              }`}>
                <span className={`text-[9px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  B2B Penalty
                </span>
                <span className={`text-xs font-black mt-0.5 block ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  {bedToBook === 'Less than 45 mins' || bedToBook === '<45 min' ? 'None' :
                    bedToBook === '45-60 min' || bedToBook === '45 to 60 mins' ? '5%' : '15%'}
                </span>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setCurrentTab('campTracker')}
              className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer border ${
                isDark
                  ? 'neu-btn-dark text-slate-200 hover:text-white border-slate-750'
                  : 'neu-btn-light text-slate-700 hover:text-slate-900 border-slate-200'
              }`}
            >
              Open CAMP Tracker
              <ExternalLink className="w-3.5 h-3.5" />
            </motion.button>
          </div>
        );
      }

      case 'liveStudyTracker':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            {activeTask ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl flex items-center gap-1.5 border ${
                    isDark ? 'bg-blue-950/40 border-blue-800/60 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-700'
                  }`}>
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
                    Now
                  </span>
                  <span className={`text-xs font-mono font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {formatTime12(activeTask.startTime)} – {formatTime12(activeTask.endTime || formatMinutesToTime((parseTimeToMinutes(activeTask.startTime) || 0) + 60))}
                  </span>
                </div>
                <div>
                  <h4 className={`text-sm font-black leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {activeTask.topic}
                  </h4>
                  <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {activeTask.notes || 'No notes'}
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <label className={`flex items-center gap-2 cursor-pointer p-2.5 rounded-xl border transition flex-grow select-none ${
                    isDark
                      ? 'neu-pressed-dark border-slate-750 text-slate-200 hover:border-blue-500/50'
                      : 'neu-pressed-light border-slate-200 text-slate-700 hover:border-blue-400'
                  }`}>
                    <input
                      type="checkbox"
                      checked={activeTask.completed || false}
                      onChange={() => handleSchedulerTaskToggle(todayStr, activeTask.id)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <span className={`text-xs font-bold ${activeTask.completed ? 'line-through opacity-50' : ''}`}>
                      Mark as done
                    </span>
                  </label>
                </div>

                {previousTask && (
                  <label className={`flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl border transition select-none ${
                    previousTask.completed
                      ? isDark ? 'bg-emerald-950/30 border-emerald-800/50' : 'bg-emerald-50 border-emerald-100'
                      : isDark ? 'bg-amber-950/30 border-amber-800/50' : 'bg-amber-50/60 border-amber-100'
                  }`}>
                    <input
                      type="checkbox"
                      checked={previousTask.completed || false}
                      onChange={() => handleSchedulerTaskToggle(todayStr, previousTask.id)}
                      className="w-3.5 h-3.5 text-emerald-600 rounded focus:ring-emerald-500 shrink-0 cursor-pointer"
                    />
                    <div className="min-w-0 flex-grow">
                      <span className={`text-[10px] font-black block truncate ${
                        previousTask.completed ? 'line-through opacity-50' : (isDark ? 'text-slate-200' : 'text-slate-800')
                      }`}>{previousTask.topic}</span>
                      <span className={`text-[9px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {formatTime12(previousTask.startTime)} – {formatTime12(previousTask.endTime || formatMinutesToTime((parseTimeToMinutes(previousTask.startTime) || 0) + 60))}
                      </span>
                    </div>
                    <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-lg shrink-0 ${
                      previousTask.completed ? 'text-emerald-500 bg-emerald-500/10' : 'text-amber-500 bg-amber-500/10'
                    }`}>
                      {previousTask.completed ? 'Done' : 'Pending'}
                    </span>
                  </label>
                )}
              </div>
            ) : previousTask ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl border ${
                    previousTask.completed
                      ? isDark ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : isDark ? 'bg-amber-950/40 border-amber-800/60 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'
                  }`}>
                    Last Session
                  </span>
                  <span className={`text-xs font-mono font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {formatTime12(previousTask.startTime)} – {formatTime12(previousTask.endTime || formatMinutesToTime((parseTimeToMinutes(previousTask.startTime) || 0) + 60))}
                  </span>
                </div>

                <div>
                  <h4 className={`text-sm font-black leading-tight ${
                    previousTask.completed ? 'line-through opacity-50' : (isDark ? 'text-white' : 'text-slate-900')
                  }`}>
                    {previousTask.topic}
                  </h4>
                  {previousTask.notes && (
                    <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{previousTask.notes}</p>
                  )}
                </div>

                <label className={`flex items-center gap-2 cursor-pointer p-3 rounded-xl border transition select-none ${
                  previousTask.completed
                    ? isDark ? 'bg-emerald-950/40 border-emerald-800/60' : 'bg-emerald-50 border-emerald-200'
                    : isDark ? 'bg-amber-950/40 border-amber-800/60' : 'bg-amber-50/80 border-amber-200'
                }`}>
                  <input
                    type="checkbox"
                    checked={previousTask.completed || false}
                    onChange={() => handleSchedulerTaskToggle(todayStr, previousTask.id)}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className={`text-xs font-bold ${
                    previousTask.completed
                      ? 'line-through opacity-50'
                      : isDark ? 'text-amber-300' : 'text-amber-800'
                  }`}>
                    {previousTask.completed ? 'Completed ✓' : 'Mark as completed'}
                  </span>
                </label>

                {upcomingTask && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                    isDark ? 'bg-blue-950/30 border-blue-900/50' : 'bg-blue-50/50 border-blue-100'
                  }`}>
                    <Compass className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[9px] font-black text-blue-500 uppercase tracking-wider block">Up Next</span>
                      <span className={`text-[10px] font-bold truncate block ${isDark ? 'text-blue-200' : 'text-blue-950'}`}>{upcomingTask.topic}</span>
                    </div>
                    <span className="ml-auto text-[9px] font-mono text-blue-500 shrink-0">{formatTime12(upcomingTask.startTime)}</span>
                  </div>
                )}
              </div>
            ) : upcomingTask ? (
              <div className={`space-y-2 p-3.5 rounded-2xl border text-center ${
                isDark ? 'bg-blue-950/20 border-blue-900/40' : 'bg-blue-50/30 border-blue-100'
              }`}>
                <Compass className="w-6 h-6 text-blue-500 mx-auto animate-spin duration-8000" />
                <h5 className={`text-xs font-black ${isDark ? 'text-blue-300' : 'text-blue-900'}`}>Next Scheduled Block</h5>
                <p className={`text-sm font-extrabold truncate ${isDark ? 'text-blue-100' : 'text-blue-950'}`}>{upcomingTask.topic}</p>
                <div className={`text-[10px] font-bold px-2 py-0.5 rounded border inline-block ${
                  isDark ? 'bg-[#222730] border-slate-700 text-blue-400' : 'bg-white border-blue-100 text-blue-600'
                }`}>
                  Starts at {formatTime12(upcomingTask.startTime)}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 space-y-2">
                <Calendar className={`w-8 h-8 mx-auto ${isDark ? 'text-slate-600' : 'text-slate-350'}`} />
                <h5 className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>No active scheduled tasks</h5>
                <p className={`text-[10px] max-w-[200px] mx-auto ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Keep your focus aligned. Plan out tasks to coordinate study intervals.
                </p>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setCurrentTab('studyScheduler')}
              className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer border mt-2 ${
                isDark
                  ? 'neu-btn-dark text-slate-200 hover:text-white border-slate-750'
                  : 'neu-btn-light text-slate-700 hover:text-slate-900 border-slate-200'
              }`}
            >
              Open Study Scheduler
              <ExternalLink className="w-3 h-3" />
            </motion.button>
          </div>
        );

      case 'streakCounter':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-pink-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-500/25">
                  <Flame className="w-8 h-8 fill-current" />
                </div>
                <div className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-slate-900 border-2 border-white rounded-full w-5 h-5 flex items-center justify-center font-black text-[9px]">
                  ✓
                </div>
              </div>
              <div>
                <div className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{currentStreak} Days</div>
                <div className={`text-[10px] font-black uppercase tracking-wider mt-0.5 px-2 py-0.5 rounded-md border inline-block ${
                  isDark ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-orange-50 text-orange-600 border-orange-200'
                }`}>
                  {streakLabel}
                </div>
              </div>
            </div>

            {/* Streak Alert System */}
            <div className={`p-3 rounded-2xl border transition-all duration-300 ${
              isStreakSafe
                ? isDark
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                : isDark
                  ? 'bg-red-950/40 border-red-800/60 text-red-300 animate-pulse'
                  : 'bg-red-50/70 border-red-200 text-red-800 animate-pulse'
            }`}>
              <div className="flex items-start gap-2">
                {isStreakSafe ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-xs font-black">
                    {isStreakSafe ? 'Streak Secured!' : 'Streak At Risk!'}
                  </div>
                  <div className="text-[9px] opacity-85 mt-0.5 leading-normal">
                    {isStreakSafe
                      ? `Studied today (Cards: ${cardsToday}, Qs: ${questionsToday}, Hours: ${hoursToday}, Pages: ${pagesToday}). Consecutive revision maintained!`
                      : 'You haven\'t recorded any study metrics today. Log cards, hours, questions, pages or a test to save your streak.'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'progressGauge': {
        const archetypeGoals = {
          Rookie: { hours: 2, questions: 20, cards: 30 },
          Consistent: { hours: 4, questions: 50, cards: 80 },
          Topper: { hours: 6, questions: 100, cards: 150 },
          Legend: { hours: 8, questions: 150, cards: 250 }
        };
        const activeGoal = archetypeGoals[streakLabel] || archetypeGoals.Topper;

        const hoursProgress = Math.min(1, (Number(todayLog.hours) || 0) / activeGoal.hours);
        const questionsProgress = Math.min(1, (Number(todayLog.questions) || 0) / activeGoal.questions);
        const cardsProgress = Math.min(1, (Number(todayLog.cards) || 0) / activeGoal.cards);
        const totalProgressPercent = Math.round(((hoursProgress + questionsProgress + cardsProgress) / 3) * 100);

        return (
          <div className="flex flex-col h-full justify-between gap-4 text-center items-center">
            {/* Circle SVG progress indicator */}
            <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 144 144">
                <circle cx="72" cy="72" r="58" stroke={isDark ? '#2d3440' : '#e2e8f0'} strokeWidth="8" fill="transparent" />
                <circle cx="72" cy="72" r="58" stroke="url(#orangeGradientDashboard)" strokeWidth="10" fill="transparent"
                  strokeDasharray={2 * Math.PI * 58}
                  strokeDashoffset={2 * Math.PI * 58 * (1 - Math.min(100, Math.max(0, totalProgressPercent)) / 100)}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
                <defs>
                  <linearGradient id="orangeGradientDashboard" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
              </svg>

              <div className={`absolute w-20 h-20 !rounded-full flex flex-col items-center justify-center transition-all duration-300 ${
                totalProgressPercent >= 100
                  ? isDark
                    ? 'bg-orange-500/20 text-orange-400 scale-105 shadow-inner'
                    : 'bg-orange-50 text-orange-500 scale-105 shadow-inner'
                  : isDark ? 'text-slate-400' : 'text-slate-500'
              }`}>
                <Flame className={`w-6 h-6 ${totalProgressPercent >= 100 ? 'animate-bounce fill-current' : ''}`} />
                <span className={`text-lg font-black mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>{totalProgressPercent}%</span>
              </div>
            </div>

            {/* Target Selector Dropdown */}
            <div className={`w-full p-3 rounded-2xl border flex items-center justify-between ${
              isDark ? 'neu-pressed-dark border-slate-750' : 'neu-pressed-light border-slate-200'
            }`}>
              <div className="text-left">
                <span className={`text-[9px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Target Level</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-xs font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{streakLabel}</span>
                  <span className="text-[9px] text-orange-500 font-bold bg-orange-500/15 px-1.5 py-0.5 rounded">Goal</span>
                </div>
              </div>

              {setSelectedStreakTag && (
                <select
                  value={streakLabel}
                  onChange={(e) => setSelectedStreakTag(e.target.value)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-xl outline-none cursor-pointer border ${
                    isDark
                      ? 'bg-[#222730] text-slate-200 border-slate-700'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  <option value="Rookie">Rookie (2h/20q/30c)</option>
                  <option value="Consistent">Consistent (4h/50q/80c)</option>
                  <option value="Topper">Topper (6h/100q/150c)</option>
                  <option value="Legend">Legend (8h/150q/250c)</option>
                </select>
              )}
            </div>

            <p className={`text-[10px] font-bold leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {totalProgressPercent >= 100 ? "🎉 Congratulations! Daily quota unlocked." : "Study, solve, and log daily stats to fill the gauge!"}
            </p>
          </div>
        );
      }

      case 'focusTimerHub': {
        const activeType = timerState?.timerType || 'pomodoro';
        const isRunning = timerState?.status === 'running';

        let timeLeft = 0;
        let totalDuration = 1;
        let displayTime = '00:00';
        let circleColor = '#3B82F6';

        if (activeType === 'pomodoro') {
          timeLeft = localTimerTimeLeft;
          totalDuration = timerState?.duration || 1500;
          displayTime = formatTimerTime(timeLeft);
          circleColor = timerState?.mode === 'break' ? '#10B981' : '#F97316';
        } else if (activeType === 'timer') {
          timeLeft = localCustomTimerTimeLeft;
          totalDuration = timerState?.customTimerDuration || 600;
          displayTime = formatTimerTime(timeLeft);
          circleColor = '#6366F1';
        } else if (activeType === 'stopwatch') {
          timeLeft = localStopwatchTime;
          displayTime = formatStopwatch(localStopwatchTime);
          circleColor = '#10B981';
        }

        const pct = activeType === 'stopwatch'
          ? (isRunning ? (Date.now() % 3000) / 30 : 100)
          : (timeLeft / totalDuration) * 100;

        const timerOptions = [
          { id: 'pomodoro', label: 'Pomodoro' },
          { id: 'timer', label: 'Timer' },
          { id: 'stopwatch', label: 'Stopwatch' }
        ];
        const activeIndex = timerOptions.findIndex(o => o.id === activeType);

        return (
          <div className="flex flex-col h-full justify-between gap-4">
            {/* Sliding Pill Switcher */}
            <div className={`relative flex items-center p-1 rounded-2xl gap-1 shrink-0 select-none ${
              isDark ? 'neu-pressed-dark border border-slate-750' : 'neu-pressed-light border border-slate-200'
            }`}>
              <div
                className={`absolute top-1 bottom-1 w-[32%] rounded-xl shadow-md ${
                  isDark ? 'neu-btn-accent-dark' : 'neu-btn-accent-light'
                }`}
                style={{
                  left: `calc(0.25rem + ${activeIndex} * 33%)`,
                  transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
                }}
              />

              {timerOptions.map(option => (
                <button
                  key={option.id}
                  onClick={() => handleSwitchTimerType(option.id)}
                  className={`relative flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center z-10 transition-colors duration-300 ${
                    activeType === option.id
                      ? 'text-white font-extrabold'
                      : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>

            {/* Time remaining and circle */}
            <div className="flex items-center justify-center gap-6 py-1">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <svg className="absolute w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.915" fill="none" stroke={isDark ? '#2d3440' : '#e2e8f0'} strokeWidth="2.5" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.915"
                    fill="none"
                    stroke={circleColor}
                    strokeWidth="2.5"
                    strokeDasharray={`${pct}, 100`}
                    strokeLinecap="round"
                    className="transition-all duration-300"
                  />
                </svg>
                <div className={`tracking-tight font-black font-mono ${
                  isDark ? 'text-white' : 'text-slate-900'
                } ${activeType === 'stopwatch' ? 'text-[11px]' : 'text-xl'}`}>
                  {displayTime}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    if (isRunning) {
                      handlePauseActiveTimer();
                    } else {
                      if (activeType === 'stopwatch') {
                        handleStartStopwatchTimer();
                      } else {
                        handleResumeActiveTimer();
                      }
                    }
                  }}
                  className={`flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer text-white shadow-md ${
                    isRunning
                      ? 'bg-red-600 hover:bg-red-700'
                      : isDark ? 'neu-btn-accent-dark' : 'neu-btn-accent-light'
                  }`}
                >
                  {isRunning ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Start
                    </>
                  )}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleResetActiveTimer()}
                  className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer border ${
                    isDark
                      ? 'neu-btn-dark text-slate-300 hover:text-white border-slate-750'
                      : 'neu-btn-light text-slate-700 hover:text-slate-900 border-slate-200'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </motion.button>
              </div>
            </div>

            <div className={`text-[9px] text-center font-bold flex items-center justify-center gap-1.5 flex-wrap ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              {activeType === 'pomodoro' && <span>Mode: {timerState?.mode === 'break' ? 'Break' : 'Study Focus'}</span>}
              {activeType === 'timer' && <span>Countdown Timer</span>}
              {activeType === 'stopwatch' && (
                <span className="flex items-center gap-1.5">
                  Stopwatch
                  <button
                    onClick={() => setShowMilliseconds(!showMilliseconds)}
                    className={`px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider transition border ${
                      isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                    }`}
                  >
                    {showMilliseconds ? 'Hide ms' : 'Show ms'}
                  </button>
                </span>
              )}

              <button
                onClick={() => setIsTimerFullscreen(true)}
                className={`ml-1 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider transition flex items-center gap-1 font-black border ${
                  isDark ? 'bg-blue-950/40 hover:bg-blue-900/50 text-blue-400 border-blue-800/60' : 'bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200'
                }`}
              >
                <Maximize2 className="w-2.5 h-2.5" /> Fullscreen
              </button>
            </div>

          </div>
        );
      }

      case 'studySprintsTimeline':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            {todayTasks.length > 0 ? (
              <div className="relative pl-4 space-y-4 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                <div className={`absolute left-1.5 top-2 bottom-2 w-0.5 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />

                {todayTasks.map((t, index) => {
                  const startMin = parseTimeToMinutes(t.startTime) || 0;
                  const endMin = parseTimeToMinutes(t.endTime || formatMinutesToTime(startMin + 60)) || 0;
                  const now = new Date();
                  const currentMin = now.getHours() * 60 + now.getMinutes();
                  const isActive = currentMin >= startMin && currentMin < endMin;

                  return (
                    <div key={t.id || index} className="relative flex items-start gap-3">
                      <div className={`absolute -left-4 w-3.5 h-3.5 rounded-full border-2 mt-0.5 ${
                        isDark ? 'border-[#222730]' : 'border-white'
                      } ${
                        t.completed
                          ? 'bg-emerald-500'
                          : isActive
                            ? 'bg-blue-600 animate-ping'
                            : isDark ? 'bg-slate-700' : 'bg-slate-300'
                      }`} />
                      <div className={`w-2.5 h-2.5 rounded-full mt-1 -ml-[13px] absolute ${
                        t.completed ? 'bg-emerald-500' : isActive ? 'bg-blue-600' : isDark ? 'bg-slate-600' : 'bg-slate-400'
                      }`} />

                      <div className="flex-grow">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-extrabold ${
                            t.completed
                              ? 'line-through opacity-50'
                              : isDark ? 'text-slate-100' : 'text-slate-800'
                          }`}>
                            {t.topic}
                          </span>
                          <span className={`text-[9px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {formatTime12(t.startTime)}
                          </span>
                        </div>
                        <div className={`text-[9px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {t.time || `${formatTime12(t.startTime)} - ${formatTime12(t.endTime)}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`text-center py-6 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                No tasks scheduled for today.
              </div>
            )}
          </div>
        );

      case 'grandTestsHistory':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="h-[130px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={130} minWidth={0} minHeight={0}>
                <AreaChart data={scoreTrendsData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis dataKey="name" stroke={axisStroke} fontSize={9} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke={axisStroke} fontSize={9} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} labelClassName="font-bold" />
                  <Area type="monotone" name="Percentile" dataKey="percent" unit="%" stroke="#3B82F6" strokeWidth={2.5} fillOpacity={1} fill="url(#scoreColor)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className={`flex items-center justify-between text-[9px] font-bold p-2 px-3 rounded-xl border ${
              isDark ? 'neu-pressed-dark border-slate-750 text-slate-300' : 'neu-pressed-light border-slate-200 text-slate-600'
            }`}>
              <span>Overall GT Rank Index</span>
              <span className="text-blue-500 font-extrabold">Accuracy Target: &gt;75%</span>
            </div>
          </div>
        );

      case 'quickLogger':
        return (
          <div className="flex flex-col h-full justify-between gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div className={`p-2 rounded-xl text-center border ${
                isDark ? 'neu-pressed-dark border-slate-750' : 'neu-pressed-light border-slate-200'
              }`}>
                <span className={`text-[8px] font-black uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Cards</span>
                <div className={`text-xs font-black my-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{quickCards}</div>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => setQuickCards(p => Math.max(0, p - 5))} className={`w-5 h-5 rounded text-[9px] font-bold border transition cursor-pointer ${
                    isDark ? 'neu-btn-dark text-slate-200 border-slate-700' : 'neu-btn-light text-slate-700 border-slate-200'
                  }`}>-</button>
                  <button onClick={() => setQuickCards(p => p + 5)} className={`w-5 h-5 rounded text-[9px] font-bold border transition cursor-pointer ${
                    isDark ? 'neu-btn-dark text-slate-200 border-slate-700' : 'neu-btn-light text-slate-700 border-slate-200'
                  }`}>+</button>
                </div>
              </div>

              <div className={`p-2 rounded-xl text-center border ${
                isDark ? 'neu-pressed-dark border-slate-750' : 'neu-pressed-light border-slate-200'
              }`}>
                <span className={`text-[8px] font-black uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Hours</span>
                <div className={`text-xs font-black my-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{quickHours.toFixed(1)}</div>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => setQuickHours(p => Math.max(0, p - 0.5))} className={`w-5 h-5 rounded text-[9px] font-bold border transition cursor-pointer ${
                    isDark ? 'neu-btn-dark text-slate-200 border-slate-700' : 'neu-btn-light text-slate-700 border-slate-200'
                  }`}>-</button>
                  <button onClick={() => setQuickHours(p => p + 0.5)} className={`w-5 h-5 rounded text-[9px] font-bold border transition cursor-pointer ${
                    isDark ? 'neu-btn-dark text-slate-200 border-slate-700' : 'neu-btn-light text-slate-700 border-slate-200'
                  }`}>+</button>
                </div>
              </div>

              <div className={`p-2 rounded-xl text-center border ${
                isDark ? 'neu-pressed-dark border-slate-750' : 'neu-pressed-light border-slate-200'
              }`}>
                <span className={`text-[8px] font-black uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Qbank</span>
                <div className={`text-xs font-black my-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{quickQuestions}</div>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => setQuickQuestions(p => Math.max(0, p - 10))} className={`w-5 h-5 rounded text-[9px] font-bold border transition cursor-pointer ${
                    isDark ? 'neu-btn-dark text-slate-200 border-slate-700' : 'neu-btn-light text-slate-700 border-slate-200'
                  }`}>-</button>
                  <button onClick={() => setQuickQuestions(p => p + 10)} className={`w-5 h-5 rounded text-[9px] font-bold border transition cursor-pointer ${
                    isDark ? 'neu-btn-dark text-slate-200 border-slate-700' : 'neu-btn-light text-slate-700 border-slate-200'
                  }`}>+</button>
                </div>
              </div>

              <div className={`p-2 rounded-xl text-center border ${
                isDark ? 'neu-pressed-dark border-slate-750' : 'neu-pressed-light border-slate-200'
              }`}>
                <span className={`text-[8px] font-black uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Pages</span>
                <div className={`text-xs font-black my-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{quickPages}</div>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => setQuickPages(p => Math.max(0, p - 5))} className={`w-5 h-5 rounded text-[9px] font-bold border transition cursor-pointer ${
                    isDark ? 'neu-btn-dark text-slate-200 border-slate-700' : 'neu-btn-light text-slate-700 border-slate-200'
                  }`}>-</button>
                  <button onClick={() => setQuickPages(p => p + 5)} className={`w-5 h-5 rounded text-[9px] font-bold border transition cursor-pointer ${
                    isDark ? 'neu-btn-dark text-slate-200 border-slate-700' : 'neu-btn-light text-slate-700 border-slate-200'
                  }`}>+</button>
                </div>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleQuickLogSubmit}
              disabled={isLoggingQuick || (!quickCards && !quickHours && !quickQuestions && !quickPages)}
              className={`w-full py-2.5 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition cursor-pointer shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                isDark ? 'neu-btn-accent-dark' : 'neu-btn-accent-light'
              }`}
            >
              {isLoggingQuick ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <PlusCircle className="w-3.5 h-3.5" />
                  Log Stats Now
                </>
              )}
            </motion.button>
          </div>
        );

      case 'streakTracker':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="grid grid-cols-7 gap-1.5 mx-auto">
              {Array.from({ length: 28 }).map((_, idx) => {
                const d = new Date();
                d.setDate(d.getDate() - (27 - idx));
                const dStr = d.toLocaleDateString('en-CA');
                const log = studyLogs[dStr];
                const cardsDone = log?.cards || 0;
                const hoursDone = log?.hours || 0;
                const questionsDone = log?.questions || 0;
                const pagesDone = log?.pages || 0;
                const gtsDone = log?.gts?.length || 0;
                const hasStudied = cardsDone > 0 || hoursDone > 0 || questionsDone > 0 || pagesDone > 0 || gtsDone > 0;

                let colorClass = isDark ? 'bg-slate-800/80 border-slate-750 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500';
                if (hasStudied) {
                  const totalActivities = cardsDone + (questionsDone * 0.5) + (hoursDone * 10) + (pagesDone * 2) + (gtsDone * 50);
                  if (totalActivities < 20) colorClass = isDark ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-emerald-100 border-emerald-200 text-emerald-700';
                  else if (totalActivities < 50) colorClass = isDark ? 'bg-emerald-800/80 border-emerald-600 text-emerald-100' : 'bg-emerald-300 border-emerald-400 text-emerald-900';
                  else colorClass = isDark ? 'bg-emerald-600 border-emerald-400 text-white shadow-sm' : 'bg-emerald-500 border-emerald-600 text-white shadow-sm';
                } else if (dStr < todayStr) {
                  colorClass = isDark ? 'bg-red-950/40 border-red-900/60 text-red-400' : 'bg-red-50 border-red-200 text-red-600';
                }

                return (
                  <div
                    key={idx}
                    className={`w-6 h-6 rounded-lg border flex items-center justify-center text-[8px] font-black transition cursor-pointer relative group ${colorClass}`}
                    onMouseEnter={() => setHoveredStreakIdx(idx)}
                    onMouseLeave={() => setHoveredStreakIdx(null)}
                  >
                    {d.getDate()}

                    {hoveredStreakIdx === idx && (
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-[8px] rounded-lg px-2 py-1 whitespace-nowrap z-50 pointer-events-none mb-1 shadow-xl border border-slate-800 animate-in fade-in duration-100">
                        Cards: {cardsDone} | Qs: {questionsDone} | Hrs: {hoursDone} | Pgs: {pagesDone}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={`text-[8px] font-bold text-center ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Active Streak contribution calendar (Green: studied, Red: missed, Slate: pending).
            </div>
          </div>
        );

      case 'totalCards':
        return (
          <div className="flex flex-col h-full justify-between gap-1 text-center">
            <BookOpen className="w-6 h-6 text-blue-500 mx-auto" />
            <div>
              <div className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{cards.length}</div>
              <div className={`text-[10px] font-extrabold uppercase mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Cards in Library</div>
            </div>
            <button
              onClick={() => setCurrentTab('library')}
              className="text-[9px] font-bold text-blue-500 hover:underline cursor-pointer"
            >
              Browse decks &rarr;
            </button>
          </div>
        );

      case 'hierarchySunburst':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="h-[120px] w-full flex items-center justify-center min-w-0">
              {subjectCardCounts.length > 0 ? (
                <ResponsiveContainer width="100%" height={120} minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie
                      data={subjectCardCounts.slice(0, 5)}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={45}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {subjectCardCounts.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][index % 5]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Add cards to visualize breakdown</span>
              )}
            </div>

            <div className="flex justify-center gap-2 flex-wrap">
              {subjectCardCounts.slice(0, 3).map((item, idx) => (
                <span key={item.name} className={`text-[8px] font-black uppercase flex items-center gap-1 ${
                  isDark ? 'text-slate-300' : 'text-slate-600'
                }`}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ['#3B82F6', '#10B981', '#F59E0B'][idx] }} />
                  {item.name.substring(0, 12)}
                </span>
              ))}
            </div>
          </div>
        );

      case 'contributionActivity':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="h-[120px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={120} minWidth={0} minHeight={0}>
                <BarChart data={last7DaysLogs} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis dataKey="dateLabel" stroke={axisStroke} fontSize={9} tickLine={false} />
                  <YAxis stroke={axisStroke} fontSize={9} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="cards" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className={`text-[9px] text-center font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Cards reviewed daily (7-day distribution).
            </div>
          </div>
        );

      case 'libraryGrowthCurve':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="h-[125px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={125} minWidth={0} minHeight={0}>
                <LineChart data={last7DaysLogs} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis dataKey="dateLabel" stroke={axisStroke} fontSize={9} tickLine={false} />
                  <YAxis stroke={axisStroke} fontSize={9} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" name="Total Cards" dataKey="libraryCards" stroke="#8B5CF6" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className={`text-[9px] text-center font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Cards in library (cumulative growth).
            </div>
          </div>
        );

      case 'hoursStudied':
        return (
          <div className="flex flex-col h-full justify-between gap-2 text-center">
            <Clock className="w-6 h-6 text-indigo-500 mx-auto" />
            <div>
              <div className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{formatHrsMins(hoursToday)}</div>
              <div className={`text-[10px] font-extrabold uppercase mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Study Duration Today</div>
            </div>
            <div className="text-[9px] text-indigo-500 font-black">
              Goal: {formatHrsMins(dailyHoursTarget)}
            </div>
          </div>
        );

      case 'qbankSolved':
        return (
          <div className="flex flex-col h-full justify-between gap-2 text-center">
            <Award className="w-6 h-6 text-amber-500 mx-auto" />
            <div>
              <div className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{questionsToday} Qs</div>
              <div className={`text-[10px] font-extrabold uppercase mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Qbank Questions Today</div>
            </div>
            <div className="text-[9px] text-amber-500 font-black">
              Keep pushing forward!
            </div>
          </div>
        );

      case 'ankiCardsReviewed':
        return (
          <div className="flex flex-col h-full justify-between gap-2 text-center">
            <Zap className="w-6 h-6 text-emerald-500 mx-auto" />
            <div>
              <div className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{cardsToday} Cards</div>
              <div className={`text-[10px] font-extrabold uppercase mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Anki Reviews Today</div>
            </div>
            <div className="text-[9px] text-emerald-500 font-black">
              Streak active &amp; healthy!
            </div>
          </div>
        );

      case 'grandTests':
        return (
          <div className="flex flex-col h-full justify-between gap-2 text-center">
            <TrendingUp className="w-6 h-6 text-purple-500 mx-auto" />
            <div>
              <div className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{grandTestsList.length} GTs</div>
              <div className={`text-[10px] font-extrabold uppercase mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Grand Tests Done</div>
            </div>
          </div>
        );

      case 'dailyPace':
        return (
          <div className="flex flex-col h-full justify-between gap-2 text-center">
            <Activity className="w-6 h-6 text-pink-500 mx-auto" />
            <div>
              <div className={`text-xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {hoursToday > 0 ? (cardsToday / hoursToday).toFixed(1) : 0} cards/hr
              </div>
              <div className={`text-[10px] font-extrabold uppercase mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Daily Study Pace</div>
            </div>
            <div className="text-[9px] text-pink-500 font-black">
              Optimized recall index
            </div>
          </div>
        );

      case 'studyRoomIntensityMap':
        return (
          <div className="flex flex-col h-full justify-between gap-3">
            <div className="flex gap-2 items-center justify-center pt-2">
              <div className={`grid grid-rows-7 gap-1 text-[8px] font-bold h-[98px] justify-between pr-1 select-none leading-none ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}>
                <span>S</span>
                <span>M</span>
                <span>T</span>
                <span>W</span>
                <span>T</span>
                <span>F</span>
                <span>S</span>
              </div>

              <div className="grid grid-rows-7 grid-flow-col gap-1 h-[98px]">
                {intensityMapData.days.map((day, idx) => {
                  const score = day.score;
                  let bgColor = isDark ? '#2d3440' : '#e2e8f0';
                  let level = 0;

                  if (score > 0) {
                    const min = intensityMapData.minScore;
                    const max = intensityMapData.maxScore;
                    level = max > min ? 1 + Math.floor(((score - min) / (max - min)) * 9) : 5;
                    bgColor = `hsla(220, 90%, ${88 - (level - 1) * 6.1}%, 1)`;
                  }

                  return (
                    <div
                      key={idx}
                      style={{ backgroundColor: bgColor }}
                      className="w-3.5 h-3.5 rounded-sm transition-all duration-150 hover:scale-125 cursor-pointer relative group border border-black/5"
                      onMouseEnter={() => setHoveredIntensityIdx(idx)}
                      onMouseLeave={() => setHoveredIntensityIdx(null)}
                    >
                      {hoveredIntensityIdx === idx && (
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-[9px] rounded-lg p-2 whitespace-nowrap z-50 pointer-events-none mb-1.5 shadow-xl border border-slate-800 animate-in fade-in duration-100">
                          <div className="font-extrabold text-[10px] text-blue-400">{day.dateLabel}</div>
                          <div className="mt-0.5 font-bold">Daily Intensity Score: {score.toFixed(1)}</div>
                          <div className="text-[8px] text-slate-300 mt-0.5">
                            ⏱️ {formatHrsMins(day.hours)} | 📝 {day.questions} Qs | 📇 {day.cards} cards | 📖 {day.pages} pgs
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`flex items-center justify-between text-[8px] font-bold mt-1 px-1 ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              <span>Less</span>
              <div className="flex gap-0.5">
                <div className={`w-2.5 h-2.5 rounded-sm border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`} title="0" />
                {Array.from({ length: 10 }).map((_, i) => {
                  const levelColor = `hsla(220, 90%, ${88 - i * 6.1}%, 1)`;
                  return (
                    <div
                      key={i}
                      style={{ backgroundColor: levelColor }}
                      className="w-2.5 h-2.5 rounded-sm border border-black/5"
                      title={`Level ${i + 1}`}
                    />
                  );
                })}
              </div>
              <span>More</span>
            </div>
          </div>
        );

      case 'studyDurationAnalytics':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="h-[120px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={120} minWidth={0} minHeight={0}>
                <BarChart data={last7DaysLogs} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis dataKey="dateLabel" stroke={axisStroke} fontSize={9} />
                  <YAxis stroke={axisStroke} fontSize={9} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [formatHrsMins(value), "Study Duration"]}
                  />
                  <Bar dataKey="hours" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className={`text-[9px] text-center font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Accumulated focus hours over past week.
            </div>
          </div>
        );

      case 'qbankAnkiBalance': {
        const totalActivity = cardsToday + questionsToday;
        let ratioText = "No activity logged today";
        let statusColor = isDark ? "text-slate-300 bg-slate-800/80 border-slate-750" : "text-slate-600 bg-slate-100 border-slate-200";

        if (totalActivity > 0) {
          if (questionsToday === 0) {
            ratioText = "Anki Focus: Add Qbank practice!";
            statusColor = isDark ? "text-blue-300 bg-blue-950/40 border-blue-800/60" : "text-blue-700 bg-blue-50 border-blue-200";
          } else if (cardsToday === 0) {
            ratioText = "Qbank Focus: Add Anki reviews!";
            statusColor = isDark ? "text-amber-300 bg-amber-950/40 border-amber-800/60" : "text-amber-700 bg-amber-50 border-amber-200";
          } else {
            const ratio = cardsToday / questionsToday;
            if (ratio >= 2 && ratio <= 5) {
              ratioText = "Balanced: Optimal Recall & Practice!";
              statusColor = isDark ? "text-emerald-300 bg-emerald-950/40 border-emerald-800/60" : "text-emerald-700 bg-emerald-50 border-emerald-200";
            } else if (ratio > 5) {
              ratioText = "Anki Heavy: Practice more Qbank!";
              statusColor = isDark ? "text-indigo-300 bg-indigo-950/40 border-indigo-800/60" : "text-indigo-700 bg-indigo-50 border-indigo-200";
            } else {
              ratioText = "Qbank Heavy: Do your Anki reviews!";
              statusColor = isDark ? "text-orange-300 bg-orange-950/40 border-orange-800/60" : "text-orange-700 bg-orange-50 border-orange-200";
            }
          }
        }

        const cardsPercent = totalActivity > 0 ? Math.round((cardsToday / totalActivity) * 100) : 80;
        const qbankPercent = totalActivity > 0 ? 100 - cardsPercent : 20;

        return (
          <div className="flex flex-col h-full justify-between gap-3 pt-1">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center select-none">
                <div className={`p-2.5 rounded-2xl border ${
                  isDark ? 'neu-pressed-dark border-slate-750' : 'neu-pressed-light border-slate-200'
                }`}>
                  <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest block">Anki Cards</span>
                  <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{cardsToday}</span>
                </div>
                <div className={`p-2.5 rounded-2xl border ${
                  isDark ? 'neu-pressed-dark border-slate-750' : 'neu-pressed-light border-slate-200'
                }`}>
                  <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest block">Qbank Qs</span>
                  <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{questionsToday}</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className={`flex justify-between text-[9px] font-bold select-none ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  <span>Anki ({cardsPercent}%)</span>
                  <span>Qbank ({qbankPercent}%)</span>
                </div>
                <div className={`w-full h-3.5 rounded-full overflow-hidden flex border shadow-inner ${
                  isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-200 border-slate-300'
                }`}>
                  <div
                    style={{ width: `${cardsPercent}%` }}
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                    title={`Anki Cards: ${cardsToday}`}
                  />
                  <div
                    style={{ width: `${qbankPercent}%` }}
                    className="h-full bg-gradient-to-r from-amber-500 to-yellow-500 transition-all duration-500"
                    title={`Qbank Questions: ${questionsToday}`}
                  />
                </div>
              </div>

              <div className="space-y-0.5 opacity-60">
                <div className={`flex justify-between text-[8px] font-extrabold select-none ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  <span>Ideal Ratio: Anki (80%)</span>
                  <span>Qbank (20%)</span>
                </div>
                <div className={`w-full h-1 rounded-full flex overflow-hidden ${
                  isDark ? 'bg-slate-700' : 'bg-slate-300'
                }`}>
                  <div className="w-[80%] h-full bg-blue-500" />
                  <div className="w-[20%] h-full bg-amber-500" />
                </div>
              </div>
            </div>

            <div className={`p-2 rounded-xl border text-center text-[10px] font-black uppercase tracking-wider transition duration-300 select-none ${statusColor}`}>
              {ratioText}
            </div>
          </div>
        );
      }

      case 'counsellingGTs':
        return (
          <div className="flex flex-col h-full justify-between gap-3 text-center">
            <Shield className="w-6 h-6 text-purple-500 mx-auto" />
            <div>
              <h5 className={`text-xs font-black uppercase tracking-wide ${isDark ? 'text-purple-300' : 'text-purple-900'}`}>NEET PG Index Tracker</h5>
              <p className={`text-[10px] mt-1 max-w-[220px] mx-auto ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Analyzing custom mock exams and grand test performance matrices to gauge seat placement probabilities.
              </p>
            </div>
            <div className={`p-2 rounded-xl text-[10px] font-extrabold border ${
              isDark ? 'bg-purple-950/40 border-purple-800/60 text-purple-300' : 'bg-purple-50 border-purple-200 text-purple-900'
            }`}>
              Accuracy Level: {grandTestsList.length > 0 ? `${(scoreTrendsData[scoreTrendsData.length - 1]?.percent).toFixed(1)}%` : '77% (Simulated)'}
            </div>
          </div>
        );

      case 'pytCoverageAnalytics': {
        const currentRadarData = radarViewType === 'pyt' ? subjectMasteryData : subjectTrackerMasteryData;
        const dataHash = currentRadarData.reduce((acc, item) => acc + (item.mastery || 0), 0);
        const radarOptions = [
          { id: 'pyt', label: 'PYT Coverage' },
          { id: 'subject', label: 'Subject Tracker' }
        ];
        const activeRadarIdx = radarOptions.findIndex(o => o.id === radarViewType);

        return (
          <div className="flex flex-col h-full justify-between gap-4">
            {/* Sliding Pill Switcher */}
            <div className={`relative flex items-center p-1 rounded-2xl gap-1 shrink-0 select-none mx-auto w-fit ${
              isDark ? 'neu-pressed-dark border border-slate-750' : 'neu-pressed-light border border-slate-200'
            }`}>
              <div
                className={`absolute top-1 bottom-1 w-[48%] rounded-xl shadow-md ${
                  isDark ? 'neu-btn-accent-dark' : 'neu-btn-accent-light'
                }`}
                style={{
                  left: `calc(0.25rem + ${activeRadarIdx} * 49%)`,
                  transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
                }}
              />

              {radarOptions.map(option => (
                <button
                  key={option.id}
                  onClick={() => setRadarViewType(option.id)}
                  className={`relative px-4 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center z-10 transition-colors duration-300 ${
                    radarViewType === option.id
                      ? 'text-white font-extrabold'
                      : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>

            <div className="h-[185px] w-full flex items-center justify-center shrink-0 overflow-hidden">
              <RadarChart key={`${radarViewType}_${dataHash}`} cx="50%" cy="50%" outerRadius="65%" data={currentRadarData} width={270} height={185}>
                <PolarGrid stroke={gridStroke} />
                <PolarAngleAxis dataKey="subject" fontSize={6.5} stroke={axisStroke} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Mastery" dataKey="mastery" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.35} />
              </RadarChart>
            </div>
            <div className={`text-[8px] text-center uppercase tracking-wider font-extrabold shrink-0 ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              {radarViewType === 'pyt' ? 'Previous Year Topics Subject Coverage Radar' : 'Subject Tracker Coverage Radar'}
            </div>
          </div>
        );
      }

      case 'revisionDepthDistribution':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <h5 className={`text-[10px] uppercase font-black tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>SuperMemo Box Distribution</h5>
            <div className={`flex items-end justify-around gap-2 h-20 pt-4 px-2 rounded-2xl border ${
              isDark ? 'neu-pressed-dark border-slate-750' : 'neu-pressed-light border-slate-200'
            }`}>
              {[45, 12, 8, 23, 19, 31].map((val, idx) => (
                <div key={idx} className="flex flex-col items-center flex-grow">
                  <div className="w-3.5 bg-blue-500 rounded-t" style={{ height: `${(val / 50) * 100}%` }}></div>
                  <span className={`text-[8px] font-bold mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>B{idx + 1}</span>
                </div>
              ))}
            </div>
            <div className={`text-[8px] text-center ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Active flashcard revision depth mapping.
            </div>
          </div>
        );

      case 'allSubjectsOverview': {
        const activeSubjects = subjectMasteryData.filter(s => s.count > 0).sort((a, b) => b.mastery - a.mastery);
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            {activeSubjects.length > 0 ? (
              <div className="space-y-2.5 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
                {activeSubjects.map(item => (
                  <div key={item.subject} className="space-y-1">
                    <div className="flex justify-between text-[9px] font-bold">
                      <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{item.subject}</span>
                      <span className="text-blue-500 font-extrabold">{item.mastery}%</span>
                    </div>
                    <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-750' : 'bg-slate-200'}`}>
                      <div className="bg-blue-600 h-full transition-all duration-300 rounded-full" style={{ width: `${item.mastery}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`text-center py-6 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                No subjects with topics. Go to Subject Tracker to configure.
              </div>
            )}
            <div className={`text-[8px] text-center ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Subjects revision progress index.
            </div>
          </div>
        );
      }

      case 'adherence':
        return (
          <div className="flex flex-col h-full justify-between gap-2 text-center">
            <CheckCircle2 className="w-6 h-6 text-blue-500 mx-auto" />
            <div>
              <div className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{todayTasks.length > 0 ? `${Math.round((todayTasks.filter(t => t.completed).length / todayTasks.length) * 100)}%` : 'N/A'}</div>
              <div className={`text-[10px] font-extrabold uppercase mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Schedule Adherence</div>
            </div>
            <div className={`text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {todayTasks.filter(t => t.completed).length} of {todayTasks.length} tasks completed
            </div>
          </div>
        );

      case 'detailedScheduleLog':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
              {todayTasks.map((t, idx) => (
                <div key={t.id || idx} className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                  isDark ? 'neu-item-dark border-slate-750' : 'neu-item-light border-slate-200'
                }`}>
                  <div className="truncate flex-grow mr-2 min-w-0">
                    <span className={`font-extrabold truncate block ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{t.topic}</span>
                    <span className={`text-[9px] uppercase tracking-widest font-black mt-0.5 block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {t.time || `${formatTime12(t.startTime)} - ${formatTime12(t.endTime)}`}
                    </span>
                  </div>
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded shrink-0 border ${
                    t.completed
                      ? isDark ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : isDark ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'
                  }`}>
                    {t.completed ? 'Done' : 'Pending'}
                  </span>
                </div>
              ))}
              {todayTasks.length === 0 && (
                <div className={`text-center py-6 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  No scheduled items for today.
                </div>
              )}
            </div>
          </div>
        );

      case 'studyAdherenceHistory7Day':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="h-[120px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={120} minWidth={0} minHeight={0}>
                <BarChart data={last7DaysLogs} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis dataKey="dateLabel" stroke={axisStroke} fontSize={9} />
                  <YAxis stroke={axisStroke} fontSize={9} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [formatHrsMins(value), "Study Hours"]}
                  />
                  <Bar dataKey="hours" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className={`text-[9px] text-center font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Study hours per day (7-day trend).
            </div>
          </div>
        );

      case 'pytLoggerWidget':
        return (
          <div className="flex flex-col h-full justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h5 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>PYT Tracker</h5>
                <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Log topic revisions instantly.</p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setCurrentTab('pytLogger')}
              className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer border ${
                isDark
                  ? 'neu-btn-dark text-slate-200 hover:text-white border-slate-750'
                  : 'neu-btn-light text-slate-700 hover:text-slate-900 border-slate-200'
              }`}
            >
              Go to PYT Logger
            </motion.button>
          </div>
        );

      case 'subjectTrackerWidget':
        return (
          <div className="flex flex-col h-full justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h5 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Subject Tracker</h5>
                <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Monitor NEET PG syllabus completion.</p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setCurrentTab('subjectTracker')}
              className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer border ${
                isDark
                  ? 'neu-btn-dark text-slate-200 hover:text-white border-slate-750'
                  : 'neu-btn-light text-slate-700 hover:text-slate-900 border-slate-200'
              }`}
            >
              Open Subject Tracker
            </motion.button>
          </div>
        );

      case 'studySchedulerWidget':
        return (
          <div className="flex flex-col h-full justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h5 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Study Schedule</h5>
                <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Organize mock attempts and reading sessions.</p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setCurrentTab('studyScheduler')}
              className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer border ${
                isDark
                  ? 'neu-btn-dark text-slate-200 hover:text-white border-slate-750'
                  : 'neu-btn-light text-slate-700 hover:text-slate-900 border-slate-200'
              }`}
            >
              Configure Schedule
            </motion.button>
          </div>
        );

      default:
        return (
          <div className={`text-center py-6 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Widget details unavailable.
          </div>
        );
    }
  }

}

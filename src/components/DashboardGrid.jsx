import React, { useState, useEffect, useRef, useMemo } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { saveLocalStudyLog } from '../services/localDb';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  GripVertical, Plus, Edit2, Trash2, Settings, Play, Pause, RotateCcw,
  Flame, CheckCircle, Clock, BookOpen, BarChart2, Activity, Award,
  Calendar, Heart, Shield, RefreshCw, X, ChevronUp, ChevronDown,
  CheckCircle2, AlertCircle, PlusCircle, Maximize2, Check, ExternalLink,
  Hourglass, Timer, TrendingUp, Compass, Layout, Layers, User, Zap
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line
} from 'recharts';
import { calculateEfficiencyScore, calculateWeightedConcentration } from '../utils/campCalculations';

export default function DashboardGrid({
  widgets,
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
  pytStatus = {},  // unused but kept as safe default
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
  db,
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
    if (!user || !db) return;
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
        return endB - endA; // most recent first
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
        // Clamp to 0-100 for safety
        pctVal = Math.min(100, Math.max(0, pctVal));
        return {
          name: gt.name,
          score: gt.score || gt.correct || 0,
          total: gt.maxMarks || gt.total || (gt.type === 'NEETPG' ? 800 : 200),
          percent: pctVal
        };
      });
    }
    // Return sample mock data if none logged
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

    // Calculate score for each of the last 63 days
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

    // Find min and max of non-zero scores
    const nonZeroScores = days.map(d => d.score).filter(s => s > 0);
    const maxScore = nonZeroScores.length > 0 ? Math.max(...nonZeroScores) : 0;
    const minScore = nonZeroScores.length > 0 ? Math.min(...nonZeroScores) : 0;

    return {
      days,
      minScore,
      maxScore
    };
  }, [studyLogs]);

  return (
    <div className="flex-grow flex flex-col overflow-hidden bg-gray-50/50 p-6">

      {/* DASHBOARD TOP BAR CONTROL PANEL */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Layout className="w-6 h-6 text-blue-600 animate-pulse" />
            Performance Command Center
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Organize, customize, and track your high-yield NEET PG medical revision dashboard.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition duration-200 active:scale-95 border ${isEditMode
                ? 'bg-orange-50 border-orange-200 text-orange-700'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 shadow-sm'
              }`}
          >
            {isEditMode ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Done Customizing
              </>
            ) : (
              <>
                <Edit2 className="w-3.5 h-3.5" />
                Arrange Grid
              </>
            )}
          </button>

          <button
            onClick={() => setIsWidgetCustomizerOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95 shadow-md shadow-blue-500/20"
          >
            <Settings className="w-3.5 h-3.5" />
            Widgets
          </button>
        </div>
      </div>

      {/* DASHBOARD GRID CONTAINER */}
      <div className="flex-grow overflow-y-auto pr-1">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="dashboard-grid-droppable">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6"
              >
                {widgets
                  .filter(w => w.enabled)
                  .map((widget, index) => {
                    // Decide column span class
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
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`bg-white rounded-2xl border ${dragSnapshot.isDragging
                                ? 'border-blue-400 shadow-2xl scale-[1.02] z-50 bg-blue-50/10'
                                : 'border-gray-200/80 hover:border-blue-200 shadow-sm hover:shadow-md'
                              } ${spanClass} flex flex-col overflow-hidden transition-all duration-200 relative group`}
                          >

                            {/* WIDGET CARD HEADER */}
                            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/60 select-none">
                              <div className="flex items-center gap-2">
                                {isEditMode && (
                                  <div
                                    {...dragProvided.dragHandleProps}
                                    className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-gray-400 hover:text-blue-600 rounded transition"
                                  >
                                    <GripVertical className="w-4 h-4" />
                                  </div>
                                )}
                                <span className="font-extrabold text-[11px] text-gray-800 tracking-widest uppercase">
                                  {widget.label}
                                </span>
                              </div>

                              {/* ACTIONS IN EDIT MODE */}
                              {isEditMode ? (
                                <div className="flex items-center gap-1.5 animate-in fade-in duration-300">
                                  {/* Reordering helpers for touch / accessibility */}
                                  <button
                                    onClick={() => moveWidget(index, -1)}
                                    disabled={index === 0}
                                    className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 text-gray-500"
                                    title="Move Up"
                                  >
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => moveWidget(index, 1)}
                                    disabled={index === widgets.filter(w => w.enabled).length - 1}
                                    className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 text-gray-500"
                                    title="Move Down"
                                  >
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Resize Selector */}
                                  <select
                                    value={widget.size}
                                    onChange={(e) => changeWidgetSize(widget.id, e.target.value)}
                                    className="text-[9px] font-bold border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600 focus:outline-none"
                                    title="Resize Widget"
                                  >
                                    <option value="small">Small</option>
                                    <option value="medium">Medium</option>
                                    <option value="large">Large</option>
                                    <option value="full">Full</option>
                                  </select>

                                  {/* Disable / Delete button */}
                                  <button
                                    onClick={() => removeWidget(widget.id)}
                                    className="p-1 hover:bg-red-50 text-red-500 hover:text-red-700 rounded transition"
                                    title="Hide Widget"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                // Static Header Controls if any
                                <div className="text-[10px] text-gray-400 font-medium">
                                  {widget.id === 'liveStudyTracker' && activeTask && (
                                    <span className="flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100/50">
                                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                                      Active
                                    </span>
                                  )}
                                  {widget.id === 'focusTimerHub' && timerIsRunning && (
                                    <span className="flex items-center gap-1 text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100/50">
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

                          </div>
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
      {isWidgetCustomizerOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-gray-150 flex flex-col overflow-hidden max-h-[85vh] animate-in zoom-in-95 duration-200">

            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-between text-white">
              <div>
                <h3 className="font-black text-lg tracking-tight flex items-center gap-2">
                  <Layout className="w-5 h-5" />
                  Customize Dashboard Panels
                </h3>
                <p className="text-[10px] text-blue-100 font-medium">Toggle dashboard widgets on or off and set layouts.</p>
              </div>
              <button
                onClick={() => setIsWidgetCustomizerOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body - Widgets List */}
            <div className="p-6 overflow-y-auto space-y-4 flex-grow">
              <div className="flex items-center justify-between pb-3 border-b border-gray-150">
                <span className="text-xs font-black uppercase text-gray-700 tracking-wider">Widget Display Controls</span>
                <button
                  onClick={() => {
                    if (window.confirm("Reset dashboard layout to defaults?")) {
                      resetLayout();
                    }
                  }}
                  className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-xl transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Defaults
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {widgets.map(w => (
                  <div
                    key={w.id}
                    className={`p-3 rounded-2xl border transition flex items-center justify-between ${w.enabled
                        ? 'border-blue-100 bg-blue-50/10'
                        : 'border-gray-200 bg-gray-50/30 opacity-70'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id={`widget-check-${w.id}`}
                        checked={w.enabled}
                        onChange={() => {
                          const updated = widgets.map(item => item.id === w.id ? { ...item, enabled: !item.enabled } : item);
                          onLayoutChange(updated);
                        }}
                        className="w-4.5 h-4.5 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <label htmlFor={`widget-check-${w.id}`} className="cursor-pointer">
                        <div className="text-xs font-bold text-gray-900">{w.label}</div>
                        <div className="text-[10px] text-gray-500 capitalize">{w.size} width</div>
                      </label>
                    </div>

                    {w.enabled && (
                      <select
                        value={w.size}
                        onChange={(e) => changeWidgetSize(w.id, e.target.value)}
                        className="text-[10px] border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none"
                      >
                        <option value="small">Small</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                        <option value="full">Full</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end">
              <button
                onClick={() => setIsWidgetCustomizerOpen(false)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition uppercase tracking-wider shadow-md shadow-blue-500/10"
              >
                Apply Layout
              </button>
            </div>

          </div>
        </div>
      )}

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
                <div className="w-14 h-14 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-sky-500/25 animate-pulse">
                  <Award className="w-8 h-8" />
                </div>
              </div>
              <div className="text-left">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Efficiency Score
                </span>
                <div className="flex items-baseline gap-2.5 mt-0.5">
                  <span className="text-2xl font-black text-sky-600">
                    {currentScore.toFixed(1)}%
                  </span>

                  {showChange && changeVal !== 0 && (
                    <span className={`text-xs font-black flex items-center gap-0.5 ${changeVal > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {changeVal > 0 ? '▲' : '▼'} {Math.abs(changeVal).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5 mt-2">
              <div className="bg-slate-50/70 border border-slate-100 rounded-2xl p-3 flex flex-col justify-center">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                  Focus Average
                </span>
                <span className="text-sm font-black text-slate-700 mt-1 block">
                  {focusAvg.toFixed(1)}/10
                </span>
              </div>

              <div className="bg-slate-50/70 border border-slate-100 rounded-2xl p-3 flex flex-col justify-center">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                  B2B Penalty
                </span>
                <span className="text-xs font-black text-slate-700 mt-1 block">
                  {bedToBook === 'Less than 45 mins' || bedToBook === '<45 min' ? 'None' :
                    bedToBook === '45-60 min' || bedToBook === '45 to 60 mins' ? '5%' : '15%'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setCurrentTab('campTracker')}
              className="w-full flex items-center justify-center gap-1.5 py-2 hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition active:scale-95 mt-1"
            >
              Open CAMP Tracker
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      }

      case 'liveStudyTracker':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            {activeTask ? (
              <div className="space-y-3">
                {/* Active session header */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase bg-blue-50 border border-blue-100 text-blue-700 px-2.5 py-1 rounded-xl flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
                    Now
                  </span>
                  <span className="text-xs font-mono font-bold text-gray-500">
                    {formatTime12(activeTask.startTime)} – {formatTime12(activeTask.endTime || formatMinutesToTime((parseTimeToMinutes(activeTask.startTime) || 0) + 60))}
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-black text-gray-900 leading-tight">
                    {activeTask.topic}
                  </h4>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {activeTask.notes || 'No notes'}
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer bg-gray-50 hover:bg-blue-50/50 border border-gray-200 hover:border-blue-200 p-2.5 rounded-xl transition duration-150 flex-grow select-none">
                    <input
                      type="checkbox"
                      checked={activeTask.completed || false}
                      onChange={() => handleSchedulerTaskToggle(todayStr, activeTask.id)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className={`text-xs font-bold ${activeTask.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      Mark as done
                    </span>
                  </label>
                </div>

                {/* Previous session compact row */}
                {previousTask && (
                  <label className={`flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl border transition select-none ${previousTask.completed
                      ? 'bg-emerald-50 border-emerald-100'
                      : 'bg-amber-50/60 border-amber-100 hover:bg-amber-50'
                    }`}>
                    <input
                      type="checkbox"
                      checked={previousTask.completed || false}
                      onChange={() => handleSchedulerTaskToggle(todayStr, previousTask.id)}
                      className="w-3.5 h-3.5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 shrink-0"
                    />
                    <div className="min-w-0 flex-grow">
                      <span className={`text-[10px] font-black block truncate ${previousTask.completed ? 'line-through text-gray-400' : 'text-gray-700'
                        }`}>{previousTask.topic}</span>
                      <span className="text-[9px] text-gray-400 font-mono">
                        {formatTime12(previousTask.startTime)} – {formatTime12(previousTask.endTime || formatMinutesToTime((parseTimeToMinutes(previousTask.startTime) || 0) + 60))}
                      </span>
                    </div>
                    <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-lg shrink-0 ${previousTask.completed ? 'text-emerald-600 bg-emerald-100' : 'text-amber-600 bg-amber-100'
                      }`}>
                      {previousTask.completed ? 'Done' : 'Pending'}
                    </span>
                  </label>
                )}
              </div>
            ) : previousTask ? (
              /* No active task — show the previous session prominently */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl border ${previousTask.completed
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                      : 'bg-amber-50 border-amber-100 text-amber-700'
                    }`}>
                    Last Session
                  </span>
                  <span className="text-xs font-mono font-bold text-gray-500">
                    {formatTime12(previousTask.startTime)} – {formatTime12(previousTask.endTime || formatMinutesToTime((parseTimeToMinutes(previousTask.startTime) || 0) + 60))}
                  </span>
                </div>

                <div>
                  <h4 className={`text-sm font-black leading-tight ${previousTask.completed ? 'text-gray-500 line-through' : 'text-gray-900'
                    }`}>
                    {previousTask.topic}
                  </h4>
                  {previousTask.notes && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{previousTask.notes}</p>
                  )}
                </div>

                <label className={`flex items-center gap-2 cursor-pointer p-3 rounded-xl border transition duration-150 select-none ${previousTask.completed
                    ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-amber-50/80 border-amber-200 hover:bg-amber-100'
                  }`}>
                  <input
                    type="checkbox"
                    checked={previousTask.completed || false}
                    onChange={() => handleSchedulerTaskToggle(todayStr, previousTask.id)}
                    className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  <span className={`text-xs font-bold ${previousTask.completed ? 'line-through text-gray-400' : 'text-amber-800'
                    }`}>
                    {previousTask.completed ? 'Completed ✓' : 'Mark as completed'}
                  </span>
                </label>

                {upcomingTask && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50/40 border border-blue-100 rounded-xl">
                    <Compass className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[9px] font-black text-blue-500 uppercase tracking-wider block">Up Next</span>
                      <span className="text-[10px] font-bold text-blue-900 truncate block">{upcomingTask.topic}</span>
                    </div>
                    <span className="ml-auto text-[9px] font-mono text-blue-500 shrink-0">{formatTime12(upcomingTask.startTime)}</span>
                  </div>
                )}
              </div>
            ) : upcomingTask ? (
              <div className="space-y-2 p-3 bg-blue-50/20 border border-blue-100/50 rounded-2xl text-center">
                <Compass className="w-6 h-6 text-blue-500 mx-auto animate-spin duration-8000" />
                <h5 className="text-xs font-black text-blue-900">Next Scheduled Block</h5>
                <p className="text-sm font-extrabold text-blue-950 truncate">{upcomingTask.topic}</p>
                <div className="text-[10px] text-blue-600 font-bold bg-white px-2 py-0.5 rounded border border-blue-100 inline-block">
                  Starts at {formatTime12(upcomingTask.startTime)}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 space-y-2">
                <Calendar className="w-8 h-8 text-gray-350 mx-auto" />
                <h5 className="text-xs font-black text-gray-700">No active scheduled tasks</h5>
                <p className="text-[10px] text-gray-400 max-w-[200px] mx-auto">
                  Keep your focus aligned. Plan out tasks to coordinate study intervals.
                </p>
              </div>
            )}

            <button
              onClick={() => setCurrentTab('studyScheduler')}
              className="w-full flex items-center justify-center gap-1.5 py-2 hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition active:scale-95 mt-2"
            >
              Open Study Scheduler
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        );

      case 'streakCounter':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-pink-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-500/25 animate-pulse">
                  <Flame className="w-8 h-8 fill-current" />
                </div>
                <div className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-slate-900 border-2 border-white rounded-full w-5 h-5 flex items-center justify-center font-black text-[9px]">
                  ✓
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-gray-900">{currentStreak} Days</div>
                <div className="text-[10px] text-orange-600 font-black uppercase tracking-wider mt-0.5 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100 inline-block">
                  {streakLabel}
                </div>
              </div>
            </div>

            {/* Streak Alert System */}
            <div className={`p-3 rounded-2xl border ${isStreakSafe
                ? 'bg-green-50/50 border-green-150 text-green-800'
                : 'bg-red-50/50 border-red-150 text-red-800 animate-bounce'
              } transition-all duration-300`}>
              <div className="flex items-start gap-2">
                {isStreakSafe ? (
                  <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-xs font-black">
                    {isStreakSafe ? 'Streak Secured!' : 'Streak At Risk!'}
                  </div>
                  <div className="text-[9px] opacity-80 mt-0.5 leading-normal">
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
                <circle cx="72" cy="72" r="58" stroke="#f3f4f6" strokeWidth="8" fill="transparent" />
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

              {/* Inner glowing center representing milestone achievements */}
              <div className={`absolute w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all duration-300 ${totalProgressPercent >= 100 ? 'bg-orange-50 text-orange-500 scale-105 shadow-inner' : 'text-gray-400'}`}>
                <Flame className={`w-6 h-6 ${totalProgressPercent >= 100 ? 'animate-bounce fill-current' : ''}`} />
                <span className="text-lg font-black mt-0.5 text-gray-800">{totalProgressPercent}%</span>
              </div>
            </div>

            {/* Target Selector Dropdown */}
            <div className="w-full bg-gray-50 border border-gray-100 p-3 rounded-2xl flex items-center justify-between">
              <div className="text-left">
                <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Target Level</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-xs font-black text-gray-800">{streakLabel}</span>
                  <span className="text-[9px] text-orange-500 font-bold bg-orange-50 px-1 rounded animate-pulse">Goal</span>
                </div>
              </div>

              {setSelectedStreakTag && (
                <select
                  value={streakLabel}
                  onChange={(e) => setSelectedStreakTag(e.target.value)}
                  className="bg-white border border-gray-200 text-[10px] font-bold text-gray-700 px-2 py-1 rounded-xl outline-none cursor-pointer transition"
                >
                  <option value="Rookie">Rookie (2h/20q/30c)</option>
                  <option value="Consistent">Consistent (4h/50q/80c)</option>
                  <option value="Topper">Topper (6h/100q/150c)</option>
                  <option value="Legend">Legend (8h/150q/250c)</option>
                </select>
              )}
            </div>

            <p className="text-[10px] text-gray-400 font-bold leading-tight">
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
        let circleColor = '#3B82F6'; // default blue

        if (activeType === 'pomodoro') {
          timeLeft = localTimerTimeLeft;
          totalDuration = timerState?.duration || 1500;
          displayTime = formatTimerTime(timeLeft);
          circleColor = timerState?.mode === 'break' ? '#10B981' : '#F97316'; // break is green, study is orange
        } else if (activeType === 'timer') {
          timeLeft = localCustomTimerTimeLeft;
          totalDuration = timerState?.customTimerDuration || 600;
          displayTime = formatTimerTime(timeLeft);
          circleColor = '#6366F1'; // indigo
        } else if (activeType === 'stopwatch') {
          timeLeft = localStopwatchTime;
          displayTime = formatStopwatch(localStopwatchTime);
          circleColor = '#10B981'; // emerald
        }

        const pct = activeType === 'stopwatch'
          ? (isRunning ? (Date.now() % 3000) / 30 : 100)
          : (timeLeft / totalDuration) * 100;

        return (
          <div className="flex flex-col h-full justify-between gap-4">

            {/* Mode Selectors */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl">
              {['pomodoro', 'timer', 'stopwatch'].map(mode => (
                <button
                  key={mode}
                  onClick={() => handleSwitchTimerType(mode)}
                  className={`py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition ${activeType === mode
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                    }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Time remaining and circle */}
            <div className="flex items-center justify-center gap-6 py-1">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <svg className="absolute w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.915" fill="none" stroke="#F1F5F9" strokeWidth="2.5" />
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
                <div className={`text-gray-800 tracking-tight font-black font-mono ${activeType === 'stopwatch' ? 'text-[12px]' : 'text-xl'
                  }`}>
                  {displayTime}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <button
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
                  className={`flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition active:scale-95 ${isRunning
                      ? 'bg-red-50 hover:bg-red-100 border border-red-200 text-red-600'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20'
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
                </button>

                <button
                  onClick={() => handleResetActiveTimer()}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-100 border border-gray-200 text-gray-600 rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>
            </div>

            <div className="text-[9px] text-gray-400 text-center font-bold flex items-center justify-center gap-1.5 flex-wrap">
              {activeType === 'pomodoro' && <span>Mode: {timerState?.mode === 'break' ? 'Break' : 'Study Focus'}</span>}
              {activeType === 'timer' && <span>Countdown Timer</span>}
              {activeType === 'stopwatch' && (
                <span className="flex items-center gap-1.5">
                  Stopwatch
                  <button
                    onClick={() => setShowMilliseconds(!showMilliseconds)}
                    className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded text-[8px] uppercase tracking-wider transition active:scale-95 border border-gray-200"
                  >
                    {showMilliseconds ? 'Hide ms' : 'Show ms'}
                  </button>
                </span>
              )}

              <button
                onClick={() => setIsTimerFullscreen(true)}
                className="ml-1 px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded text-[8px] uppercase tracking-wider transition active:scale-95 flex items-center gap-1 border border-blue-150 font-black"
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
              <div className="relative pl-4 space-y-4 max-h-[160px] overflow-y-auto pr-1">
                {/* Timeline vertical bar */}
                <div className="absolute left-1.5 top-2 bottom-2 w-0.5 bg-gray-200" />

                {todayTasks.map((t, index) => {
                  const startMin = parseTimeToMinutes(t.startTime) || 0;
                  const endMin = parseTimeToMinutes(t.endTime || formatMinutesToTime(startMin + 60)) || 0;
                  const now = new Date();
                  const currentMin = now.getHours() * 60 + now.getMinutes();
                  const isActive = currentMin >= startMin && currentMin < endMin;

                  return (
                    <div key={t.id || index} className="relative flex items-start gap-3">
                      {/* Node point */}
                      <div className={`absolute -left-4 w-3.5 h-3.5 rounded-full border-2 border-white mt-0.5 ${t.completed
                          ? 'bg-green-500'
                          : isActive
                            ? 'bg-blue-600 animate-ping'
                            : 'bg-gray-300'
                        }`} />
                      <div className={`w-2.5 h-2.5 rounded-full mt-1 -ml-[13px] absolute ${t.completed ? 'bg-green-500' : isActive ? 'bg-blue-600' : 'bg-gray-350'
                        }`} />

                      <div className="flex-grow">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-extrabold ${t.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {t.topic}
                          </span>
                          <span className="text-[9px] font-mono text-gray-400">
                            {formatTime12(t.startTime)}
                          </span>
                        </div>
                        <div className="text-[9px] text-gray-400">{t.time || `${formatTime12(t.startTime)} - ${formatTime12(t.endTime)}`}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400 text-xs">
                No tasks scheduled for today.
              </div>
            )}
          </div>
        );

      case 'grandTestsHistory':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="h-[130px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart data={scoreTrendsData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" stroke="#94A3B8" fontSize={9} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#94A3B8" fontSize={9} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '10px' }}
                    labelClassName="font-bold"
                  />
                  <Area type="monotone" name="Percentile" dataKey="percent" unit="%" stroke="#3B82F6" strokeWidth={2.5} fillOpacity={1} fill="url(#scoreColor)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between text-[9px] text-gray-400 font-bold bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
              <span>Overall GT Rank Index</span>
              <span className="text-blue-600">Accuracy Target: &gt;75%</span>
            </div>
          </div>
        );

      case 'quickLogger':
        return (
          <div className="flex flex-col h-full justify-between gap-3">

            <div className="grid grid-cols-2 gap-2">
              {/* Cards Counter */}
              <div className="bg-gray-50 border border-gray-100 p-2 rounded-xl text-center">
                <span className="text-[8px] font-black text-gray-400 uppercase">Cards</span>
                <div className="text-xs font-black text-gray-800 my-1">{quickCards}</div>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => setQuickCards(p => Math.max(0, p - 5))} className="w-5 h-5 bg-white border border-gray-200 hover:bg-gray-100 rounded text-[9px] font-bold">-</button>
                  <button onClick={() => setQuickCards(p => p + 5)} className="w-5 h-5 bg-white border border-gray-200 hover:bg-gray-100 rounded text-[9px] font-bold">+</button>
                </div>
              </div>

              {/* Hours Counter */}
              <div className="bg-gray-50 border border-gray-100 p-2 rounded-xl text-center">
                <span className="text-[8px] font-black text-gray-400 uppercase">Hours</span>
                <div className="text-xs font-black text-gray-800 my-1">{quickHours.toFixed(1)}</div>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => setQuickHours(p => Math.max(0, p - 0.5))} className="w-5 h-5 bg-white border border-gray-200 hover:bg-gray-100 rounded text-[9px] font-bold">-</button>
                  <button onClick={() => setQuickHours(p => p + 0.5)} className="w-5 h-5 bg-white border border-gray-200 hover:bg-gray-100 rounded text-[9px] font-bold">+</button>
                </div>
              </div>

              {/* Questions Counter */}
              <div className="bg-gray-50 border border-gray-100 p-2 rounded-xl text-center">
                <span className="text-[8px] font-black text-gray-400 uppercase">Qbank</span>
                <div className="text-xs font-black text-gray-800 my-1">{quickQuestions}</div>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => setQuickQuestions(p => Math.max(0, p - 10))} className="w-5 h-5 bg-white border border-gray-200 hover:bg-gray-100 rounded text-[9px] font-bold">-</button>
                  <button onClick={() => setQuickQuestions(p => p + 10)} className="w-5 h-5 bg-white border border-gray-200 hover:bg-gray-100 rounded text-[9px] font-bold">+</button>
                </div>
              </div>

              {/* Pages Counter */}
              <div className="bg-gray-50 border border-gray-100 p-2 rounded-xl text-center">
                <span className="text-[8px] font-black text-gray-400 uppercase">Pages</span>
                <div className="text-xs font-black text-gray-800 my-1">{quickPages}</div>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => setQuickPages(p => Math.max(0, p - 5))} className="w-5 h-5 bg-white border border-gray-200 hover:bg-gray-100 rounded text-[9px] font-bold">-</button>
                  <button onClick={() => setQuickPages(p => p + 5)} className="w-5 h-5 bg-white border border-gray-200 hover:bg-gray-100 rounded text-[9px] font-bold">+</button>
                </div>
              </div>
            </div>

            <button
              onClick={handleQuickLogSubmit}
              disabled={isLoggingQuick || (!quickCards && !quickHours && !quickQuestions && !quickPages)}
              className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-450 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition active:scale-95 shadow-md shadow-blue-500/10 flex items-center justify-center gap-1.5"
            >
              {isLoggingQuick ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <PlusCircle className="w-3.5 h-3.5" />
                  Log Stats Now
                </>
              )}
            </button>
          </div>
        );

      case 'streakTracker':
        return (
          <div className="flex flex-col h-full justify-between gap-4">

            {/* Grid of past 28 days */}
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

                // Color mapping: green intensity based on studied metrics
                let colorClass = 'bg-gray-100 hover:bg-gray-200 border-gray-100';
                if (hasStudied) {
                  const totalActivities = cardsDone + (questionsDone * 0.5) + (hoursDone * 10) + (pagesDone * 2) + (gtsDone * 50);
                  if (totalActivities < 20) colorClass = 'bg-green-100 border-green-200 text-green-700 hover:bg-green-150';
                  else if (totalActivities < 50) colorClass = 'bg-green-300 border-green-400 text-green-800 hover:bg-green-350';
                  else colorClass = 'bg-green-500 border-green-600 text-white hover:bg-green-650';
                } else if (dStr < todayStr) {
                  colorClass = 'bg-red-50 border-red-100 text-red-600 hover:bg-red-100'; // Missed day
                }

                return (
                  <div
                    key={idx}
                    className={`w-6 h-6 rounded-md border flex items-center justify-center text-[8px] font-black transition cursor-pointer relative group ${colorClass}`}
                    title={`${dStr}: Cards: ${cardsDone}, Qs: ${questionsDone}, Hours: ${hoursDone}, Pages: ${pagesDone}`}
                    onMouseEnter={() => setHoveredStreakIdx(idx)}
                    onMouseLeave={() => setHoveredStreakIdx(null)}
                  >
                    {d.getDate()}

                    {/* Tooltip */}
                    {hoveredStreakIdx === idx && (
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-[8px] rounded px-1.5 py-0.5 whitespace-nowrap z-50 pointer-events-none mb-1 shadow-md border border-slate-800 animate-in fade-in duration-100">
                        Cards: {cardsDone} | Qs: {questionsDone} | Hrs: {hoursDone} | Pgs: {pagesDone}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="text-[8px] text-gray-400 font-bold text-center">
              Active Streak contribution calendar (Green: studied, Red: missed, Gray: pending).
            </div>

          </div>
        );

      case 'totalCards':
        return (
          <div className="flex flex-col h-full justify-between gap-1 text-center">
            <BookOpen className="w-6 h-6 text-blue-500 mx-auto" />
            <div>
              <div className="text-2xl font-black text-gray-900">{cards.length}</div>
              <div className="text-[10px] text-gray-400 font-extrabold uppercase mt-0.5">Cards in Library</div>
            </div>
            <button
              onClick={() => setCurrentTab('library')}
              className="text-[9px] font-bold text-blue-600 hover:underline"
            >
              Browse decks &rarr;
            </button>
          </div>
        );

      case 'hierarchySunburst':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="h-[120px] w-full flex items-center justify-center">
              {subjectCardCounts.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
                    <Tooltip contentStyle={{ fontSize: '9px', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <span className="text-[10px] text-gray-400">Add cards to visualize breakdown</span>
              )}
            </div>

            <div className="flex justify-center gap-2 flex-wrap">
              {subjectCardCounts.slice(0, 3).map((item, idx) => (
                <span key={item.name} className="text-[8px] font-black uppercase text-gray-600 flex items-center gap-1">
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
            <div className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={last7DaysLogs} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="dateLabel" stroke="#94A3B8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={9} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '9px' }} />
                  <Bar dataKey="cards" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[9px] text-gray-400 text-center font-bold">
              Cards reviewed daily (7-day distribution).
            </div>
          </div>
        );

      case 'libraryGrowthCurve':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="h-[125px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={last7DaysLogs} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="dateLabel" stroke="#94A3B8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={9} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '9px' }} />
                  <Line type="monotone" name="Total Cards" dataKey="libraryCards" stroke="#8B5CF6" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[9px] text-gray-400 text-center font-bold">
              Cards in library (cumulative growth).
            </div>
          </div>
        );

      case 'hoursStudied':
        return (
          <div className="flex flex-col h-full justify-between gap-2 text-center">
            <Clock className="w-6 h-6 text-indigo-500 mx-auto" />
            <div>
              <div className="text-2xl font-black text-gray-900">{formatHrsMins(hoursToday)}</div>
              <div className="text-[10px] text-gray-400 font-extrabold uppercase mt-0.5">Study Duration Today</div>
            </div>
            <div className="text-[9px] text-indigo-600 font-black">
              Goal: {formatHrsMins(dailyHoursTarget)}
            </div>
          </div>
        );

      case 'qbankSolved':
        return (
          <div className="flex flex-col h-full justify-between gap-2 text-center">
            <Award className="w-6 h-6 text-yellow-500 mx-auto" />
            <div>
              <div className="text-2xl font-black text-gray-900">{questionsToday} Qs</div>
              <div className="text-[10px] text-gray-400 font-extrabold uppercase mt-0.5">Qbank Questions Today</div>
            </div>
            <div className="text-[9px] text-yellow-600 font-black">
              Keep pushing forward!
            </div>
          </div>
        );

      case 'ankiCardsReviewed':
        return (
          <div className="flex flex-col h-full justify-between gap-2 text-center">
            <Zap className="w-6 h-6 text-emerald-500 mx-auto animate-bounce" />
            <div>
              <div className="text-2xl font-black text-gray-900">{cardsToday} Cards</div>
              <div className="text-[10px] text-gray-400 font-extrabold uppercase mt-0.5">Anki Reviews Today</div>
            </div>
            <div className="text-[9px] text-emerald-600 font-black">
              Streak active &amp; healthy!
            </div>
          </div>
        );

      case 'grandTests':
        return (
          <div className="flex flex-col h-full justify-between gap-2 text-center">
            <TrendingUp className="w-6 h-6 text-purple-500 mx-auto" />
            <div>
              <div className="text-2xl font-black text-gray-900">{grandTestsList.length} GTs</div>
              <div className="text-[10px] text-gray-400 font-extrabold uppercase mt-0.5">Grand Tests Done</div>
            </div>
          </div>
        );

      case 'dailyPace':
        return (
          <div className="flex flex-col h-full justify-between gap-2 text-center">
            <Activity className="w-6 h-6 text-pink-500 mx-auto" />
            <div>
              <div className="text-xl font-black text-gray-900">
                {hoursToday > 0 ? (cardsToday / hoursToday).toFixed(1) : 0} cards/hr
              </div>
              <div className="text-[10px] text-gray-400 font-extrabold uppercase mt-0.5">Daily Study Pace</div>
            </div>
            <div className="text-[9px] text-pink-600 font-black">
              Optimized recall index
            </div>
          </div>
        );

      case 'studyRoomIntensityMap':
        return (
          <div className="flex flex-col h-full justify-between gap-3">
            <div className="flex gap-2 items-center justify-center pt-2">
              {/* Day Labels */}
              <div className="grid grid-rows-7 gap-1 text-[8px] font-bold text-gray-450 h-[98px] justify-between pr-1 select-none leading-none">
                <span>S</span>
                <span>M</span>
                <span>T</span>
                <span>W</span>
                <span>T</span>
                <span>F</span>
                <span>S</span>
              </div>

              {/* Grid of 63 days */}
              <div className="grid grid-rows-7 grid-flow-col gap-1 h-[98px]">
                {intensityMapData.days.map((day, idx) => {
                  const score = day.score;
                  let bgColor = '#f3f4f6'; // level 0 (gray)
                  let level = 0;

                  if (score > 0) {
                    const min = intensityMapData.minScore;
                    const max = intensityMapData.maxScore;
                    level = max > min ? 1 + Math.floor(((score - min) / (max - min)) * 9) : 5;
                    // HSL scale: blue base (hue 220), saturation 90%, lightness ranges from 88% down to 33%
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
                      {/* Tooltip on hover */}
                      {hoveredIntensityIdx === idx && (
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-[9px] rounded-lg p-2 whitespace-nowrap z-50 pointer-events-none mb-1.5 shadow-xl border border-slate-800 animate-in fade-in duration-100">
                          <div className="font-extrabold text-[10px] text-blue-400">{day.dateLabel}</div>
                          <div className="mt-0.5 font-bold">Daily Intensity Score: {score.toFixed(1)}</div>
                          <div className="text-[8px] text-gray-300 mt-0.5">
                            ⏱️ {formatHrsMins(day.hours)} | 📝 {day.questions} Qs | 📇 {day.cards} cards | 📖 {day.pages} pgs
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend at bottom */}
            <div className="flex items-center justify-between text-[8px] font-bold text-gray-450 mt-1 px-1">
              <span>Less</span>
              <div className="flex gap-0.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-gray-100 border border-gray-250" title="0" />
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
            <div className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={last7DaysLogs} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="dateLabel" stroke="#94A3B8" fontSize={9} />
                  <YAxis stroke="#94A3B8" fontSize={9} />
                  <Tooltip
                    contentStyle={{ fontSize: '9px', borderRadius: '12px' }}
                    formatter={(value) => [formatHrsMins(value), "Study Duration"]}
                  />
                  <Bar dataKey="hours" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[9px] text-gray-455 text-center">
              Accumulated focus hours over past week.
            </div>
          </div>
        );

      case 'qbankAnkiBalance': {
        const totalActivity = cardsToday + questionsToday;
        let ratioText = "No activity logged today";
        let statusColor = "text-gray-500 bg-gray-55 border-gray-150";

        if (totalActivity > 0) {
          if (questionsToday === 0) {
            ratioText = "Anki Focus: Add Qbank practice!";
            statusColor = "text-blue-700 bg-blue-50 border-blue-100";
          } else if (cardsToday === 0) {
            ratioText = "Qbank Focus: Add Anki reviews!";
            statusColor = "text-amber-700 bg-amber-50 border-amber-100";
          } else {
            const ratio = cardsToday / questionsToday;
            if (ratio >= 2 && ratio <= 5) {
              ratioText = "Balanced: Optimal Recall & Practice!";
              statusColor = "text-green-700 bg-green-50/50 border-green-150";
            } else if (ratio > 5) {
              ratioText = "Anki Heavy: Practice more Qbank!";
              statusColor = "text-indigo-700 bg-indigo-50 border-indigo-100";
            } else {
              ratioText = "Qbank Heavy: Do your Anki reviews!";
              statusColor = "text-orange-700 bg-orange-50 border-orange-100";
            }
          }
        }

        const cardsPercent = totalActivity > 0 ? Math.round((cardsToday / totalActivity) * 100) : 80;
        const qbankPercent = totalActivity > 0 ? 100 - cardsPercent : 20;

        return (
          <div className="flex flex-col h-full justify-between gap-3 pt-1">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center select-none">
                <div className="bg-blue-50/30 border border-blue-100/50 p-2 rounded-xl">
                  <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest block">Anki Cards</span>
                  <span className="text-sm font-black text-blue-900">{cardsToday}</span>
                </div>
                <div className="bg-amber-50/30 border border-amber-100/50 p-2 rounded-xl">
                  <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest block">Qbank Qs</span>
                  <span className="text-sm font-black text-amber-955">{questionsToday}</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[9px] font-bold text-gray-500 select-none">
                  <span>Anki ({cardsPercent}%)</span>
                  <span>Qbank ({qbankPercent}%)</span>
                </div>
                <div className="w-full h-3.5 bg-gray-100 rounded-full overflow-hidden flex border border-gray-150 shadow-inner">
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
                <div className="flex justify-between text-[8px] font-extrabold text-gray-400 select-none">
                  <span>Ideal Ratio: Anki (80%)</span>
                  <span>Qbank (20%)</span>
                </div>
                <div className="w-full h-1 bg-gray-200 rounded-full flex overflow-hidden">
                  <div className="w-[80%] h-full bg-blue-300" />
                  <div className="w-[20%] h-full bg-amber-300" />
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
            <Shield className="w-6 h-6 text-purple-600 mx-auto" />
            <div>
              <h5 className="text-xs font-black text-purple-950 uppercase tracking-wide">NEET PG Index Tracker</h5>
              <p className="text-[10px] text-gray-400 mt-1 max-w-[220px] mx-auto">
                Analyzing custom mock exams and grand test performance matrices to gauge seat placement probabilities.
              </p>
            </div>
            <div className="bg-purple-50 border border-purple-100 p-2 rounded-xl text-[10px] text-purple-900 font-extrabold">
              Accuracy Level: {grandTestsList.length > 0 ? `${(scoreTrendsData[scoreTrendsData.length - 1]?.percent).toFixed(1)}%` : '77% (Simulated)'}
            </div>
          </div>
        );

      case 'pytCoverageAnalytics': {
        const currentRadarData = radarViewType === 'pyt' ? subjectMasteryData : subjectTrackerMasteryData;
        const dataHash = currentRadarData.reduce((acc, item) => acc + (item.mastery || 0), 0);
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            {/* View Toggle */}
            <div className="flex items-center justify-center bg-gray-100 p-0.5 rounded-xl border border-gray-200/50 shadow-inner w-fit mx-auto select-none shrink-0">
              <button
                onClick={() => setRadarViewType('pyt')}
                className={`px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all duration-150 ${radarViewType === 'pyt'
                  ? 'bg-purple-600 text-white shadow-sm font-extrabold'
                  : 'text-gray-500 hover:text-gray-850'
                  }`}
              >
                PYT Coverage
              </button>
              <button
                onClick={() => setRadarViewType('subject')}
                className={`px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all duration-150 ${radarViewType === 'subject'
                  ? 'bg-purple-600 text-white shadow-sm font-extrabold'
                  : 'text-gray-500 hover:text-gray-850'
                  }`}
              >
                Subject Tracker
              </button>
            </div>

            <div className="h-[185px] w-full flex items-center justify-center shrink-0 overflow-hidden">
              <RadarChart key={`${radarViewType}_${dataHash}`} cx="50%" cy="50%" outerRadius="65%" data={currentRadarData} width={270} height={185}>
                <PolarGrid stroke="#E2E8F0" />
                <PolarAngleAxis dataKey="subject" fontSize={6.5} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Mastery" dataKey="mastery" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.3} />
              </RadarChart>
            </div>
            <div className="text-[8px] text-gray-400 text-center uppercase tracking-wider font-extrabold shrink-0">
              {radarViewType === 'pyt' ? 'Previous Year Topics Subject Coverage Radar' : 'Subject Tracker Coverage Radar'}
            </div>
          </div>
        );
      }

      case 'revisionDepthDistribution':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <h5 className="text-[10px] text-gray-400 uppercase font-black tracking-wider">SuperMemo Box Distribution</h5>
            <div className="flex items-end justify-around gap-2 h-20 pt-4 px-2 bg-gray-50/50 rounded-2xl border border-gray-150">
              {[45, 12, 8, 23, 19, 31].map((val, idx) => (
                <div key={idx} className="flex flex-col items-center flex-grow">
                  <div className="w-3.5 bg-blue-500 rounded-t" style={{ height: `${(val / 50) * 100}%` }}></div>
                  <span className="text-[8px] text-gray-400 font-bold mt-1">B{idx + 1}</span>
                </div>
              ))}
            </div>
            <div className="text-[8px] text-gray-400 text-center">
              Active flashcard revision depth mapping.
            </div>
          </div>
        );

      case 'allSubjectsOverview': {
        const activeSubjects = subjectMasteryData.filter(s => s.count > 0).sort((a, b) => b.mastery - a.mastery);
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            {activeSubjects.length > 0 ? (
              <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                {activeSubjects.map(item => (
                  <div key={item.subject} className="space-y-0.5">
                    <div className="flex justify-between text-[9px] font-bold">
                      <span className="text-gray-700">{item.subject}</span>
                      <span className="text-blue-600">{item.mastery}%</span>
                    </div>
                    <div className="w-full bg-gray-150 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${item.mastery}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-gray-400">
                No subjects with topics. Go to Subject Tracker to configure.
              </div>
            )}
            <div className="text-[8px] text-gray-400 text-center">
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
              <div className="text-2xl font-black text-gray-900">
                {todayTasks.length > 0
                  ? `${Math.round((todayTasks.filter(t => t.completed).length / todayTasks.length) * 100)}%`
                  : 'N/A'
                }
              </div>
              <div className="text-[10px] text-gray-400 font-extrabold uppercase mt-0.5">Schedule Adherence</div>
            </div>
            <div className="text-[9px] text-gray-500 font-bold">
              {todayTasks.filter(t => t.completed).length} of {todayTasks.length} tasks completed
            </div>
          </div>
        );

      case 'detailedScheduleLog':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
              {todayTasks.map((t, idx) => (
                <div key={t.id || idx} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-150 flex items-center justify-between text-xs transition">
                  <div className="truncate flex-grow mr-2 min-w-0">
                    <span className="font-extrabold text-gray-800 truncate block">{t.topic}</span>
                    <span className="text-[9px] text-gray-400 uppercase tracking-widest font-black mt-0.5 block">
                      {t.time || `${formatTime12(t.startTime)} - ${formatTime12(t.endTime)}`}
                    </span>
                  </div>
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded shrink-0 ${t.completed ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                    {t.completed ? 'Done' : 'Pending'}
                  </span>
                </div>
              ))}
              {todayTasks.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-xs">
                  No scheduled items for today.
                </div>
              )}
            </div>
          </div>
        );

      case 'studyAdherenceHistory7Day':
        return (
          <div className="flex flex-col h-full justify-between gap-4">
            <div className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={last7DaysLogs} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="dateLabel" stroke="#94A3B8" fontSize={9} />
                  <YAxis stroke="#94A3B8" fontSize={9} />
                  <Tooltip
                    contentStyle={{ fontSize: '9px', borderRadius: '12px' }}
                    formatter={(value) => [formatHrsMins(value), "Study Hours"]}
                  />
                  <Bar dataKey="hours" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[9px] text-gray-450 text-center font-bold">
              Study hours per day (7-day trend).
            </div>
          </div>
        );


      case 'pytLoggerWidget':
        return (
          <div className="flex flex-col h-full justify-between gap-3">
            <div className="flex items-center gap-3">
              <Compass className="w-6 h-6 text-blue-500 animate-pulse" />
              <div>
                <h5 className="text-xs font-black text-gray-800 uppercase tracking-wider">PYT Tracker</h5>
                <p className="text-[10px] text-gray-400">Log topic revisions instantly.</p>
              </div>
            </div>
            <button
              onClick={() => setCurrentTab('pytLogger')}
              className="w-full py-2 hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition active:scale-95"
            >
              Go to PYT Logger
            </button>
          </div>
        );

      case 'subjectTrackerWidget':
        return (
          <div className="flex flex-col h-full justify-between gap-3">
            <div className="flex items-center gap-3">
              <Layers className="w-6 h-6 text-orange-500" />
              <div>
                <h5 className="text-xs font-black text-gray-800 uppercase tracking-wider">Subject Tracker</h5>
                <p className="text-[10px] text-gray-400">Monitor NEET PG syllabus completion.</p>
              </div>
            </div>
            <button
              onClick={() => setCurrentTab('subjectTracker')}
              className="w-full py-2 hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition active:scale-95"
            >
              Open Subject Tracker
            </button>
          </div>
        );

      case 'studySchedulerWidget':
        return (
          <div className="flex flex-col h-full justify-between gap-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-6 h-6 text-emerald-500" />
              <div>
                <h5 className="text-xs font-black text-gray-800 uppercase tracking-wider">Study Schedule</h5>
                <p className="text-[10px] text-gray-400">Organize mock attempts and reading sessions.</p>
              </div>
            </div>
            <button
              onClick={() => setCurrentTab('studyScheduler')}
              className="w-full py-2 hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition active:scale-95"
            >
              Configure Schedule
            </button>
          </div>
        );

      default:
        return (
          <div className="text-center py-6 text-xs text-gray-400">
            Widget details unavailable.
          </div>
        );
    }
  }

}

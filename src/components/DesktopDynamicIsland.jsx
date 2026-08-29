import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Clock, Layers, Flame, ChevronDown, ChevronLeft, ChevronRight,
  Hourglass, Timer, Play, Pause, RotateCcw, Calendar, Cloud, RefreshCw, Sparkles, HelpCircle, FileText
} from 'lucide-react';

/**
 * DEFAULT ACTIVITY CARDS REGISTRY
 * Each card represents an activity capsule that can be displayed inside the Dynamic Island.
 * New cards can be added here or passed via the `customCards` prop.
 */
export const DEFAULT_ACTIVITY_CARDS = [
  {
    id: 'momentum',
    label: 'Momentum',
    icon: Clock,
    dotColor: 'bg-blue-500',
    getPriorityScore: () => 1,
    renderCompact: (ctx) => (
      <div className="flex items-center justify-between w-full px-2 select-none">
        {/* Study Time */}
        <div className="flex items-center gap-1.5 shrink-0" title="Today's Study Hours">
          <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="text-xs font-black tracking-tight">{ctx.getLiveTodayHours().toFixed(1)}h</span>
        </div>

        <span className="opacity-30 text-xs font-bold">•</span>

        {/* Cards Reviewed */}
        <div className="flex items-center gap-1.5 shrink-0" title="Cards Reviewed Today">
          <Layers className="w-3.5 h-3.5 text-purple-500 shrink-0" />
          <span className="text-xs font-black tracking-tight">{ctx.studyLogs[ctx.todayStr]?.cards || 0} cards</span>
        </div>

        <span className="opacity-30 text-xs font-bold">•</span>

        {/* Current Streak */}
        <div className="flex items-center gap-1.5 shrink-0" title="Current Daily Streak">
          <Flame className="w-3.5 h-3.5 text-orange-500 shrink-0" />
          <span className="text-xs font-black tracking-tight text-orange-500">{ctx.streakStats.currentStreak}d</span>
        </div>

        {/* Chevron */}
        <ChevronDown className="w-3.5 h-3.5 opacity-60 ml-0.5 text-blue-500 shrink-0" />
      </div>
    ),
    renderExpanded: (ctx) => (
      <div className="w-full flex flex-col justify-center select-none py-1">
        {/* Single-Row 4-Metric Grid */}
        <div className="grid grid-cols-4 gap-2">
          {/* Study Time */}
          <div className={`p-2 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
          }`}>
            <div className="flex items-center gap-1 mb-0.5">
              <Clock className="w-3 h-3 text-blue-500 shrink-0" />
              <span className="text-[8px] font-black uppercase tracking-wider opacity-60">Time</span>
            </div>
            <div className="text-xs font-black">{ctx.getLiveTodayHours().toFixed(2)}h</div>
          </div>

          {/* Cards Reviewed */}
          <div className={`p-2 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
          }`}>
            <div className="flex items-center gap-1 mb-0.5">
              <Layers className="w-3 h-3 text-purple-500 shrink-0" />
              <span className="text-[8px] font-black uppercase tracking-wider opacity-60">Cards</span>
            </div>
            <div className="text-xs font-black">{ctx.studyLogs[ctx.todayStr]?.cards || 0}</div>
          </div>

          {/* Questions Solved */}
          <div className={`p-2 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
          }`}>
            <div className="flex items-center gap-1 mb-0.5">
              <HelpCircle className="w-3 h-3 text-indigo-500 shrink-0" />
              <span className="text-[8px] font-black uppercase tracking-wider opacity-60">Qs</span>
            </div>
            <div className="text-xs font-black">{ctx.studyLogs[ctx.todayStr]?.questions || 0}</div>
          </div>

          {/* Pages Read */}
          <div className={`p-2 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
          }`}>
            <div className="flex items-center gap-1 mb-0.5">
              <FileText className="w-3 h-3 text-teal-500 shrink-0" />
              <span className="text-[8px] font-black uppercase tracking-wider opacity-60">Pages</span>
            </div>
            <div className="text-xs font-black">{ctx.studyLogs[ctx.todayStr]?.pages || 0}</div>
          </div>
        </div>
      </div>
    ),
    onClick: (ctx) => {
      ctx.setIsDailyMetricsOpen(true);
    }
  },

  {
    id: 'timer',
    label: 'Focus Timer',
    icon: Hourglass,
    dotColor: 'bg-indigo-400',
    getPriorityScore: (ctx) => {
      if (ctx.activeTimerInfo?.isRunning) return 100;
      if (ctx.timerState?.status && ctx.timerState.status !== 'idle') return 50;
      return 0;
    },
    renderCompact: (ctx) => (
      <div className="flex items-center justify-between w-full px-2 select-none">
        {/* Left: Icon & Label */}
        <div className="flex items-center gap-1.5 shrink-0">
          {ctx.timerState?.timerType === 'stopwatch' ? (
            <Timer className={`w-3.5 h-3.5 text-emerald-400 ${ctx.activeTimerInfo?.isRunning ? 'animate-pulse' : ''}`} />
          ) : (
            <Hourglass className={`w-3.5 h-3.5 text-blue-400 ${ctx.activeTimerInfo?.isRunning ? 'animate-pulse' : ''}`} />
          )}
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-blue-400">
            {ctx.activeTimerInfo?.label === 'Pomodoro' ? 'Focus' : (ctx.activeTimerInfo?.label || 'Timer')}
          </span>
        </div>

        {/* Center: Live Time Display */}
        <span className="font-mono text-xs font-black tracking-tight text-blue-400 shrink-0">
          {ctx.activeTimerInfo?.timeStr || '00:00'}
        </span>

        {/* Right: Quick Play/Pause & Reset Controls */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {ctx.activeTimerInfo?.isRunning ? (
            <button
              type="button"
              onClick={ctx.handlePauseTimer}
              className="p-1 hover:bg-white/10 rounded-lg text-amber-400 hover:text-amber-300 transition cursor-pointer"
              title="Pause Timer"
            >
              <Pause className="w-3 h-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={ctx.handleStartTimer}
              className="p-1 hover:bg-white/10 rounded-lg text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
              title="Start Timer"
            >
              <Play className="w-3 h-3 fill-current ml-0.5" />
            </button>
          )}
          <button
            type="button"
            onClick={ctx.handleResetTimer}
            className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-blue-400 transition cursor-pointer"
            title="Reset Timer"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>
    ),
    renderExpanded: (ctx) => (
      <div className="flex items-center justify-between gap-3 w-full select-none py-1">
        <div className="flex items-center gap-3">
          <div className={`px-3.5 py-2 rounded-xl border flex flex-col items-start justify-center ${
            ctx.settingsThemeMode === 'dark'
              ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]'
              : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
          }`}>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black tracking-tight leading-none text-blue-500 dark:text-blue-400">
                {ctx.activeTimerInfo?.timeStr || '00:00'}
              </span>
              <span className="text-[9px] font-bold opacity-50 uppercase tracking-wider">
                {ctx.activeTimerInfo?.subLabel || ctx.activeTimerInfo?.label}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                ctx.setIsTimerFullscreen(true);
                ctx.setIsDailyMetricsOpen(false);
              }}
              className="text-[9px] font-semibold text-blue-500 dark:text-blue-400/80 mt-1 hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              Open Fullscreen Study Room <ChevronRight className="w-2.5 h-2.5 inline" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              if (ctx.activeTimerInfo?.isRunning) {
                ctx.handlePauseTimer();
              } else {
                ctx.handleStartTimer();
              }
            }}
            className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 hover:from-blue-500 hover:to-indigo-400 active:scale-95 text-white flex items-center justify-center transition shadow-lg shadow-blue-500/25 cursor-pointer shrink-0"
            title={ctx.activeTimerInfo?.isRunning ? "Pause Timer" : "Start Timer"}
          >
            {ctx.activeTimerInfo?.isRunning ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={ctx.handleResetTimer}
            className={`w-11 h-11 rounded-xl active:scale-95 flex items-center justify-center transition border cursor-pointer shrink-0 ${
              ctx.settingsThemeMode === 'dark'
                ? 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
            title="Reset Timer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    ),
    onClick: (ctx) => {
      ctx.setIsDailyMetricsOpen(true);
    }
  },

  {
    id: 'exam',
    label: 'Target Exam',
    icon: Calendar,
    dotColor: 'bg-amber-400',
    getPriorityScore: (ctx) => {
      if (!ctx.headerUpcomingExam) return 0;
      const text = ctx.headerUpcomingExam.countdownText || '';
      if (text.includes('TOMORROW') || text.includes('TODAY') || text === '0d' || text === '1d') return 80;
      return 20;
    },
    renderCompact: (ctx) => (
      <div className="flex items-center justify-between w-full px-2 select-none">
        <div className="flex items-center gap-1.5 truncate max-w-[170px]">
          <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-xs font-black tracking-tight truncate">
            {ctx.headerUpcomingExam ? ctx.headerUpcomingExam.title : 'Target Exam'}
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-extrabold tracking-wider uppercase shrink-0 ${
          ctx.settingsThemeMode === 'dark'
            ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
            : 'bg-amber-500/20 text-amber-800 border border-amber-400/50'
        }`}>
          {ctx.headerUpcomingExam ? ctx.headerUpcomingExam.countdownText : 'Set'}
        </span>
      </div>
    ),
    renderExpanded: (ctx) => (
      <div className="flex items-center justify-between gap-3 w-full select-none py-1">
        <div>
          <h3 className="text-sm font-black tracking-tight text-amber-400">
            {ctx.headerUpcomingExam ? ctx.headerUpcomingExam.title : 'No Exam Profile Scheduled'}
          </h3>
          <p className="text-[10px] opacity-70 mt-0.5">
            {ctx.headerUpcomingExam ? `${ctx.headerUpcomingExam.dateStr} • ${ctx.headerUpcomingExam.countdownText}` : 'Configure target exam dates in Smart Review.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            ctx.setCurrentTab('smartReview');
            ctx.setSmartReviewSubTab('queue');
            ctx.setIsDailyMetricsOpen(false);
          }}
          className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs transition shadow-md shadow-amber-500/20 cursor-pointer shrink-0"
        >
          Open Queue
        </button>
      </div>
    ),
    onClick: (ctx) => {
      ctx.setCurrentTab('smartReview');
      ctx.setSmartReviewSubTab('queue');
    }
  },

  {
    id: 'sync',
    label: 'Drive Vault',
    icon: Cloud,
    dotColor: 'bg-emerald-400',
    getPriorityScore: (ctx) => {
      if (ctx.isSyncing || ctx.gdriveSyncState?.isSyncing) return 90;
      if (ctx.justSynced) return 30;
      return 5;
    },
    renderCompact: (ctx) => (
      <div className="flex items-center justify-between w-full px-2 select-none">
        <div className="flex items-center gap-1.5 truncate">
          {ctx.isSyncing || ctx.gdriveSyncState?.isSyncing ? (
            <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
          ) : ctx.justSynced ? (
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
          ) : (
            <Cloud className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )}
          <span className="text-xs font-black tracking-tight truncate">
            {ctx.justSynced
              ? 'Vault Synced ✨'
              : ctx.gdriveSyncState?.isSyncing
                ? (ctx.gdriveSyncState.mediaProgress
                  ? `Syncing ${ctx.gdriveSyncState.mediaProgress.percent}%`
                  : 'Syncing…')
                : (ctx.isSyncing ? 'Syncing…' : 'Cloud Vault')}
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 ${
          ctx.justSynced ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-400'
        }`}>
          {ctx.isSyncing || ctx.gdriveSyncState?.isSyncing ? 'Syncing' : ctx.justSynced ? 'Up to date' : 'Sync'}
        </span>
      </div>
    ),
    renderExpanded: (ctx) => (
      <div className="flex items-center justify-between gap-3 w-full select-none py-1">
        <div>
          <h3 className="text-sm font-black tracking-tight text-emerald-400">
            {ctx.justSynced ? 'All Local & Cloud Records Synced' : (ctx.gdriveSyncState?.isSyncing ? 'Bi-Directional Sync In Progress' : 'Google Drive Cloud Vault')}
          </h3>
          <p className="text-[10px] opacity-70 mt-0.5">
            100% Offline-First IndexedDB with automatic cloud backups.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            ctx.handleHeaderSync();
          }}
          disabled={ctx.isSyncing || ctx.gdriveSyncState?.isSyncing}
          className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-xs transition shadow-md shadow-emerald-500/20 cursor-pointer shrink-0 disabled:opacity-50"
        >
          {ctx.isSyncing || ctx.gdriveSyncState?.isSyncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>
    ),
    onClick: (ctx) => {
      ctx.handleHeaderSync();
    }
  }
];

/**
 * MODULAR DESKTOP DYNAMIC ISLAND COMPONENT
 */
export default function DesktopDynamicIsland({
  settingsThemeMode,
  studyLogs = {},
  todayStr,
  getLiveTodayHours,
  streakStats = { currentStreak: 0 },
  activeTimerInfo = { timeStr: '00:00', label: 'Focus Session', isRunning: false },
  timerState = {},
  pomodoroTargetRounds = 4,
  handleStartTimer,
  handlePauseTimer,
  handleResetTimer,
  setIsTimerFullscreen,
  headerUpcomingExam,
  isSyncing,
  gdriveSyncState = {},
  justSynced,
  handleHeaderSync,
  setCurrentTab,
  setStudyActiveTab,
  setSmartReviewSubTab,
  isDailyMetricsOpen,
  setIsDailyMetricsOpen,
  customCards = []
}) {
  // Combine default activity cards with any custom registered cards
  const allCards = useMemo(() => {
    if (!customCards || customCards.length === 0) return DEFAULT_ACTIVITY_CARDS;
    const cardMap = new Map();
    DEFAULT_ACTIVITY_CARDS.forEach(c => cardMap.set(c.id, c));
    customCards.forEach(c => cardMap.set(c.id, c));
    return Array.from(cardMap.values());
  }, [customCards]);

  const [activeCardId, setActiveCardId] = useState('momentum');
  const userManualOverrideRef = useRef(0);
  const lastTriggerStateRef = useRef({
    isRunning: false,
    isSyncing: false
  });

  // Bundle context passed to card renderers
  const cardContext = useMemo(() => ({
    settingsThemeMode,
    studyLogs,
    todayStr,
    getLiveTodayHours,
    streakStats,
    activeTimerInfo,
    timerState,
    pomodoroTargetRounds,
    handleStartTimer,
    handlePauseTimer,
    handleResetTimer,
    setIsTimerFullscreen,
    headerUpcomingExam,
    isSyncing,
    gdriveSyncState,
    justSynced,
    handleHeaderSync,
    setCurrentTab,
    setStudyActiveTab,
    setSmartReviewSubTab,
    isDailyMetricsOpen,
    setIsDailyMetricsOpen
  }), [
    settingsThemeMode, studyLogs, todayStr, getLiveTodayHours, streakStats,
    activeTimerInfo, timerState, pomodoroTargetRounds, handleStartTimer,
    handlePauseTimer, handleResetTimer, setIsTimerFullscreen, headerUpcomingExam,
    isSyncing, gdriveSyncState, justSynced, handleHeaderSync, setCurrentTab,
    setStudyActiveTab, setSmartReviewSubTab, isDailyMetricsOpen, setIsDailyMetricsOpen
  ]);

  // SMART PRIORITY AUTO-SWITCHING ENGINE (Apple Event-Driven Paradigm)
  useEffect(() => {
    const isRunning = Boolean(activeTimerInfo?.isRunning);
    const isSyncActive = Boolean(isSyncing || gdriveSyncState?.isSyncing);

    // Check if a new major event just started
    const isNewEvent =
      (!lastTriggerStateRef.current.isRunning && isRunning) ||
      (!lastTriggerStateRef.current.isSyncing && isSyncActive);

    lastTriggerStateRef.current = { isRunning, isSyncing: isSyncActive };

    // If a new event occurred, release user manual override
    if (isNewEvent) {
      userManualOverrideRef.current = 0;
    }

    // Check if user recently manually switched within the last 12 seconds
    const hasManualOverride = Date.now() - userManualOverrideRef.current < 12000;
    if (hasManualOverride) return;

    // Rank cards by priority score
    let topCard = allCards[0];
    let topScore = -1;
    allCards.forEach(card => {
      const score = card.getPriorityScore ? card.getPriorityScore(cardContext) : 0;
      if (score > topScore) {
        topScore = score;
        topCard = card;
      }
    });

    if (topCard && topCard.id !== activeCardId) {
      setActiveCardId(topCard.id);
    }
  }, [
    activeTimerInfo?.isRunning,
    isSyncing,
    gdriveSyncState?.isSyncing,
    headerUpcomingExam?.countdownText,
    allCards,
    cardContext,
    activeCardId
  ]);

  // Active card reference
  const activeCard = useMemo(() => {
    return allCards.find(c => c.id === activeCardId) || allCards[0];
  }, [allCards, activeCardId]);

  // Sequential cycling helpers
  const cycleNext = () => {
    userManualOverrideRef.current = Date.now();
    const idx = allCards.findIndex(c => c.id === activeCardId);
    const nextIdx = (idx + 1) % allCards.length;
    setActiveCardId(allCards[nextIdx].id);
  };

  const cyclePrevious = () => {
    userManualOverrideRef.current = Date.now();
    const idx = allCards.findIndex(c => c.id === activeCardId);
    const prevIdx = (idx - 1 + allCards.length) % allCards.length;
    setActiveCardId(allCards[prevIdx].id);
  };

  // Mouse wheel scroll listener for cycling
  const handleWheel = (e) => {
    if (isDailyMetricsOpen) return;
    userManualOverrideRef.current = Date.now();
    if (e.deltaY > 0) {
      cycleNext();
    } else if (e.deltaY < 0) {
      cyclePrevious();
    }
  };

  return (
    <>
      {/* Backdrop for active expanded drawer */}
      {isDailyMetricsOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsDailyMetricsOpen(false)}
        />
      )}

      {/* Main Dynamic Island Capsule */}
      <div
        onWheel={handleWheel}
        onClick={() => {
          if (!isDailyMetricsOpen && activeCard?.onClick) {
            activeCard.onClick(cardContext);
          }
        }}
        className={`ios-dynamic-island desktop-dynamic-island group ${settingsThemeMode === 'dark' ? 'dark' : 'light'} ${
          isDailyMetricsOpen ? 'active' : ''
        }`}
        title={!isDailyMetricsOpen ? `${activeCard.label} (Scroll or click arrows to cycle activities)` : ''}
      >
        {/* COMPACT VIEW */}
        {!isDailyMetricsOpen && (
          <div className="relative w-full h-full flex items-center justify-between px-1">
            {/* Left Micro-Chevron (Appears on Hover) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cyclePrevious();
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:scale-110 active:scale-95 transition-all duration-200 text-slate-400 hover:text-blue-400 shrink-0 cursor-pointer z-10"
              title="Previous Activity"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {/* Active Card Compact Body */}
            <div className="flex-1 flex items-center justify-center overflow-hidden min-w-0">
              {activeCard.renderCompact(cardContext)}
            </div>

            {/* Right Micro-Chevron (Appears on Hover) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cycleNext();
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:scale-110 active:scale-95 transition-all duration-200 text-slate-400 hover:text-blue-400 shrink-0 cursor-pointer z-10"
              title="Next Activity"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* Micro Breadcrumb Dots (Bottom Center) */}
            <div className="absolute bottom-0.5 left-0 right-0 flex items-center justify-center gap-1 pointer-events-auto">
              {allCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    userManualOverrideRef.current = Date.now();
                    setActiveCardId(card.id);
                  }}
                  className={`transition-all duration-300 rounded-full cursor-pointer ${
                    activeCardId === card.id
                      ? `w-3 h-1 ${card.dotColor || 'bg-blue-500'} shadow-[0_0_6px_rgba(59,130,246,0.6)]`
                      : 'w-1 h-1 bg-slate-400/30 hover:bg-slate-400/60'
                  }`}
                  title={card.label}
                />
              ))}
            </div>
          </div>
        )}

        {/* EXPANDED VIEW DRAWER */}
        {isDailyMetricsOpen && (
          <div className="expanded-content cursor-pointer w-full h-full px-4 py-3 flex flex-col justify-between">
            {/* Top Unified Header: Left = Activity Subtabs, Right = Active Context Badge + Single Close Button */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/10 dark:bg-white/5 border border-white/10">
                {allCards.map(card => {
                  const Icon = card.icon;
                  const isSelected = activeCardId === card.id;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        userManualOverrideRef.current = Date.now();
                        setActiveCardId(card.id);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{card.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Right: Context Badges & Single Close Button */}
              <div className="flex items-center gap-2">
                {activeCardId === 'momentum' && (
                  <>
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 ${
                      settingsThemeMode === 'dark' ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' : 'bg-orange-50 text-orange-700 border-orange-200'
                    }`}>
                      <Flame className="w-2.5 h-2.5" /> {streakStats.currentStreak}d Streak
                    </span>
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                      settingsThemeMode === 'dark' ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      ⚡ Active
                    </span>
                  </>
                )}

                {activeCardId === 'timer' && (
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 ${
                    activeTimerInfo?.isRunning
                      ? (settingsThemeMode === 'dark' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse' : 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse')
                      : (settingsThemeMode === 'dark' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200')
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${activeTimerInfo?.isRunning ? 'bg-blue-500' : 'bg-amber-500'}`} />
                    {activeTimerInfo?.isRunning ? 'Running' : 'Paused'}
                  </span>
                )}

                {activeCardId === 'exam' && (
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                    settingsThemeMode === 'dark' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    📅 {headerUpcomingExam ? headerUpcomingExam.countdownText : 'Set'}
                  </span>
                )}

                {activeCardId === 'sync' && (
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                    justSynced ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  }`}>
                    {isSyncing || gdriveSyncState?.isSyncing ? 'Syncing...' : justSynced ? 'Synced ✨' : 'Cloud Vault'}
                  </span>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDailyMetricsOpen(false);
                  }}
                  className="p-1 hover:bg-white/10 rounded-lg opacity-60 hover:opacity-100 transition cursor-pointer ml-1"
                  title="Close Drawer"
                >
                  <ChevronDown className="w-3.5 h-3.5 rotate-180 text-blue-500" />
                </button>
              </div>
            </div>

            {/* Active Card Body View */}
            <div className="flex-1 flex flex-col justify-center py-1">
              {activeCard.renderExpanded ? activeCard.renderExpanded(cardContext) : activeCard.renderCompact(cardContext)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

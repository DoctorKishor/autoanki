import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Clock, Layers, Flame, ChevronDown, ChevronLeft, ChevronRight,
  Hourglass, Timer, Play, Pause, RotateCcw, Calendar, Cloud, Sparkles, HelpCircle, FileText,
  Target, Maximize2, Brain, Zap, ShieldCheck
} from 'lucide-react';
import { calculateWeeklyWorkloadForecast } from '../services/predictiveTimingEngine';
import { getActiveNewTopicIds } from '../services/localDb';

/**
 * 7 Universal Study Activity Cards for Mobile
 */
export const MOBILE_ACTIVITY_CARDS = [
  // 1. TODAY'S MOMENTUM
  {
    id: 'momentum',
    label: 'Momentum',
    icon: Clock,
    dotColor: 'bg-blue-500',
    cssClass: 'mobile-pill',
    renderCompact: (ctx) => (
      <div className="compact-content flex items-center justify-between w-full px-1 cursor-pointer select-none">
        <div className="flex items-center gap-1 shrink-0">
          <Clock className="w-3 h-3 text-blue-500 shrink-0" />
          <span className="text-[11px] font-black tracking-tight">{ctx.getLiveTodayHours().toFixed(1)}h</span>
        </div>
        <span className="opacity-30 text-[10px] font-bold">•</span>
        <div className="flex items-center gap-1 shrink-0">
          <Layers className="w-3 h-3 text-purple-500 shrink-0" />
          <span className="text-[11px] font-black tracking-tight">{ctx.studyLogs[ctx.todayStr]?.cards || 0}c</span>
        </div>
        <span className="opacity-30 text-[10px] font-bold">•</span>
        <div className="flex items-center gap-1 shrink-0">
          <Flame className="w-3 h-3 text-orange-500 shrink-0" />
          <span className="text-[11px] font-black tracking-tight text-orange-500">{ctx.streakStats.currentStreak}d</span>
        </div>
        <ChevronDown className="w-3 h-3 opacity-60 text-blue-500 shrink-0" />
      </div>
    ),
    renderExpanded: (ctx) => (
      <div className="w-full flex flex-col justify-center select-none py-0.5">
        <div className="grid grid-cols-4 gap-1.5">
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Clock className="w-2.5 h-2.5 text-blue-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Time</span>
            </div>
            <div className="text-[11px] font-black">{ctx.getLiveTodayHours().toFixed(2)}h</div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Layers className="w-2.5 h-2.5 text-purple-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Cards</span>
            </div>
            <div className="text-[11px] font-black">{ctx.studyLogs[ctx.todayStr]?.cards || 0}</div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <HelpCircle className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Qs</span>
            </div>
            <div className="text-[11px] font-black">{ctx.studyLogs[ctx.todayStr]?.questions || 0}</div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <FileText className="w-2.5 h-2.5 text-teal-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Pages</span>
            </div>
            <div className="text-[11px] font-black">{ctx.studyLogs[ctx.todayStr]?.pages || 0}</div>
          </div>
        </div>
      </div>
    )
  },

  // 2. FOCUS TIMER
  {
    id: 'timer',
    label: 'Focus Timer',
    icon: Hourglass,
    dotColor: 'bg-indigo-400',
    cssClass: 'mobile-timer-mini',
    renderCompact: (ctx) => (
      <div className="compact-timer-mini flex items-center justify-between w-full px-2.5 cursor-pointer select-none">
        <div className="flex items-center gap-1.5">
          <Hourglass className={`w-3.5 h-3.5 text-blue-400 shrink-0 ${ctx.activeTimerInfo?.isRunning ? 'animate-pulse' : ''}`} />
          <span className="text-[10px] font-extrabold uppercase text-blue-400 tracking-tight">
            {ctx.activeTimerInfo?.label === 'Pomodoro' ? 'Focus' : (ctx.activeTimerInfo?.label || 'Timer')}
          </span>
        </div>
        <span className="font-mono text-xs font-black text-blue-400 tracking-tight">
          {ctx.activeTimerInfo?.timeStr || '00:00'}
        </span>
      </div>
    ),
    renderExpanded: (ctx) => (
      <div className="w-full flex flex-col justify-center select-none py-0.5">
        <div className="grid grid-cols-4 gap-1.5">
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Hourglass className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Mode</span>
            </div>
            <div className="text-[10px] font-black truncate max-w-full">
              {ctx.timerState?.timerType === 'stopwatch' ? 'Stopwatch' : ctx.timerState?.timerType === 'timer' ? 'Timer' : 'Pomodoro'}
            </div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Clock className="w-2.5 h-2.5 text-blue-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Time</span>
            </div>
            <div className="font-mono text-[11px] font-black text-blue-500 dark:text-blue-400">
              {ctx.activeTimerInfo?.timeStr || '00:00'}
            </div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]' : 'bg-white/70 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Flame className="w-2.5 h-2.5 text-orange-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Round</span>
            </div>
            <div className="text-[10px] font-black">
              {ctx.timerState?.timerType === 'pomodoro' ? `${ctx.timerState?.pomodoroRounds || 1}/${ctx.pomodoroTargetRounds || 4}` : (ctx.activeTimerInfo?.isRunning ? 'Active' : 'Idle')}
            </div>
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            className={`p-1 rounded-xl border flex items-center justify-center gap-1 ${
              ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                if (ctx.activeTimerInfo?.isRunning) {
                  ctx.handlePauseTimer();
                } else {
                  ctx.handleStartTimer();
                }
              }}
              className="p-1 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white transition shadow-sm cursor-pointer"
              title={ctx.activeTimerInfo?.isRunning ? "Pause" : "Start"}
            >
              {ctx.activeTimerInfo?.isRunning ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
            </button>
            <button
              type="button"
              onClick={ctx.handleResetTimer}
              className="p-1 rounded-lg hover:bg-white/10 active:scale-95 text-slate-400 transition cursor-pointer border border-white/10"
              title="Reset"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                ctx.setIsTimerFullscreen(true);
                ctx.setIsDailyMetricsOpen(false);
              }}
              className="p-1 rounded-lg hover:bg-white/10 active:scale-95 text-slate-400 hover:text-indigo-400 transition cursor-pointer border border-white/10"
              title="Fullscreen"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    )
  },

  // 3. FSRS QUEUE
  {
    id: 'fsrsQueue',
    label: 'FSRS Queue',
    icon: Brain,
    dotColor: 'bg-purple-500',
    cssClass: 'mobile-fsrs',
    renderCompact: (ctx) => (
      <div className="compact-fsrs flex items-center justify-between w-full px-2.5 cursor-pointer select-none">
        <div className="flex items-center gap-1.5 truncate">
          <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="text-[11px] font-black tracking-tight text-purple-400 truncate">
            {ctx.fsrsQueueStats?.totalDueCount || 0} Due Reviews
          </span>
        </div>
        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 ${
          ctx.settingsThemeMode === 'dark' ? 'bg-purple-500/25 text-purple-300 border border-purple-500/40' : 'bg-purple-50 text-purple-700 border border-purple-200'
        }`}>
          {ctx.fsrsQueueStats?.newTopicsCount || 0} New
        </span>
      </div>
    ),
    renderExpanded: (ctx) => (
      <div className="w-full flex flex-col justify-center select-none py-0.5">
        <div className="grid grid-cols-4 gap-1.5">
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Brain className="w-2.5 h-2.5 text-purple-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Due Today</span>
            </div>
            <div className="text-[11px] font-black text-purple-400">{ctx.fsrsQueueStats?.dueTodayCount || 0}</div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Flame className="w-2.5 h-2.5 text-rose-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Overdue</span>
            </div>
            <div className="text-[11px] font-black text-rose-400">{ctx.fsrsQueueStats?.overdueCount || 0}</div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Sparkles className="w-2.5 h-2.5 text-teal-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">New</span>
            </div>
            <div className="text-[11px] font-black text-teal-400">{ctx.fsrsQueueStats?.newTopicsCount || 0}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              ctx.setCurrentTab('smartReview');
              ctx.setSmartReviewSubTab('queue');
              ctx.setIsDailyMetricsOpen(false);
            }}
            className="p-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-black text-[10px] transition flex flex-col items-center justify-center cursor-pointer border border-purple-400/40"
          >
            <span className="text-[7.5px] uppercase tracking-wider opacity-80">Review</span>
            <span className="font-black">Start →</span>
          </button>
        </div>
      </div>
    )
  },

  // 4. PREDICTIVE WORKLOAD
  {
    id: 'predictive',
    label: 'AI Forecast',
    icon: Zap,
    dotColor: 'bg-amber-500',
    cssClass: 'mobile-predictive',
    renderCompact: (ctx) => (
      <div className="compact-predictive flex items-center justify-between w-full px-2.5 cursor-pointer select-none">
        <div className="flex items-center gap-1.5 truncate">
          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] font-black tracking-tight text-amber-400 truncate">
            {ctx.predictiveWorkloadStats?.formattedTotal || '0m'} Est. Study
          </span>
        </div>
        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 ${
          ctx.settingsThemeMode === 'dark' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          AI Velocity
        </span>
      </div>
    ),
    renderExpanded: (ctx) => (
      <div className="w-full flex flex-col justify-center select-none py-0.5">
        <div className="grid grid-cols-4 gap-1.5">
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Zap className="w-2.5 h-2.5 text-amber-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Total</span>
            </div>
            <div className="text-[11px] font-black text-amber-400">{ctx.predictiveWorkloadStats?.formattedTotal || '0m'}</div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Clock className="w-2.5 h-2.5 text-purple-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Reviews</span>
            </div>
            <div className="text-[11px] font-black">{Math.round(ctx.predictiveWorkloadStats?.dueReviewsMins || 0)}m</div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <FileText className="w-2.5 h-2.5 text-teal-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">New</span>
            </div>
            <div className="text-[11px] font-black">{Math.round(ctx.predictiveWorkloadStats?.newTopicsMins || 0)}m</div>
          </div>
          <button
            type="button"
            onClick={() => {
              ctx.setCurrentTab('smartReview');
              ctx.setSmartReviewSubTab('velocity');
              ctx.setIsDailyMetricsOpen(false);
            }}
            className="p-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-[10px] transition flex flex-col items-center justify-center cursor-pointer border border-amber-400/50"
          >
            <span className="text-[7.5px] uppercase tracking-wider opacity-80">Insights</span>
            <span className="font-black">View →</span>
          </button>
        </div>
      </div>
    )
  },

  // 5. DAILY TARGET
  {
    id: 'targetProgress',
    label: 'Daily Target',
    icon: Target,
    dotColor: 'bg-emerald-500',
    cssClass: 'mobile-target',
    renderCompact: (ctx) => (
      <div className="compact-target flex items-center justify-between w-full px-2.5 cursor-pointer select-none">
        <div className="flex items-center gap-1.5 truncate">
          <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-black tracking-tight text-emerald-400 truncate">
            {ctx.dailyTargetStats?.percent || 0}% Target
          </span>
        </div>
        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 ${
          ctx.settingsThemeMode === 'dark' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        }`}>
          {ctx.dailyTargetStats?.percent >= 100 ? 'Achieved ✨' : `${ctx.dailyTargetStats?.remainingHours || 0}h Left`}
        </span>
      </div>
    ),
    renderExpanded: (ctx) => (
      <div className="w-full flex flex-col justify-center select-none py-0.5">
        <div className="grid grid-cols-4 gap-1.5">
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Clock className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Done</span>
            </div>
            <div className="text-[11px] font-black text-emerald-400">{ctx.dailyTargetStats?.liveHours || 0}h</div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Target className="w-2.5 h-2.5 text-blue-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Goal</span>
            </div>
            <div className="text-[11px] font-black">{ctx.dailyTargetStats?.targetHours || 6.0}h</div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Flame className="w-2.5 h-2.5 text-orange-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Left</span>
            </div>
            <div className="text-[11px] font-black text-orange-500">{ctx.dailyTargetStats?.remainingHours || 0}h</div>
          </div>
          <button
            type="button"
            onClick={() => {
              ctx.setCurrentTab('campTracker');
              ctx.setIsDailyMetricsOpen(false);
            }}
            className="p-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-[10px] transition flex flex-col items-center justify-center cursor-pointer border border-emerald-400/50"
          >
            <span className="text-[7.5px] uppercase tracking-wider opacity-80">CAMP</span>
            <span className="font-black">Open →</span>
          </button>
        </div>
      </div>
    )
  },

  // 6. TARGET EXAM
  {
    id: 'exam',
    label: 'Target Exam',
    icon: Calendar,
    dotColor: 'bg-amber-400',
    cssClass: 'mobile-exam',
    renderCompact: (ctx) => (
      <div className="compact-exam flex items-center justify-between w-full px-2.5 cursor-pointer select-none">
        <div className="flex items-center gap-1.5 truncate max-w-[120px]">
          <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-[11px] font-black tracking-tight truncate">
            {ctx.headerUpcomingExam ? ctx.headerUpcomingExam.title : 'Target Exam'}
          </span>
        </div>
        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-500 shrink-0">
          {ctx.headerUpcomingExam ? ctx.headerUpcomingExam.countdownText : 'Set'}
        </span>
      </div>
    ),
    renderExpanded: (ctx) => (
      <div className="w-full flex flex-col justify-center select-none py-0.5">
        <div className="grid grid-cols-4 gap-1.5">
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Calendar className="w-2.5 h-2.5 text-amber-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Target</span>
            </div>
            <div className="text-[10px] font-black truncate max-w-full text-amber-500">
              {ctx.headerUpcomingExam ? ctx.headerUpcomingExam.title : 'Not Set'}
            </div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Flame className="w-2.5 h-2.5 text-orange-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Days Left</span>
            </div>
            <div className="text-[10px] font-black text-orange-500">
              {ctx.headerUpcomingExam ? ctx.headerUpcomingExam.countdownText : '--'}
            </div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Target className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Date</span>
            </div>
            <div className="text-[10px] font-black truncate max-w-full">
              {ctx.headerUpcomingExam ? ctx.headerUpcomingExam.dateStr : 'Scheduled'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              ctx.setCurrentTab('smartReview');
              ctx.setSmartReviewSubTab('queue');
              ctx.setIsDailyMetricsOpen(false);
            }}
            className="p-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-[10px] transition flex flex-col items-center justify-center cursor-pointer border border-amber-400/50"
          >
            <span className="text-[7.5px] uppercase tracking-wider opacity-80">Queue</span>
            <span className="font-black">Open →</span>
          </button>
        </div>
      </div>
    )
  },

  // 7. SECURE CLOUD VAULT
  {
    id: 'sync',
    label: 'Cloud Vault',
    icon: ShieldCheck,
    dotColor: 'bg-emerald-400',
    cssClass: 'mobile-sync',
    renderCompact: (ctx) => (
      <div className="compact-sync flex items-center justify-between w-full px-2.5 cursor-pointer select-none">
        <div className="flex items-center gap-1.5 truncate">
          <Cloud className={`w-3.5 h-3.5 ${ctx.justSynced ? 'text-emerald-400' : 'text-blue-400'} shrink-0`} />
          <span className="text-[11px] font-black tracking-tight truncate">
            {ctx.isSyncing || ctx.gdriveSyncState?.isSyncing ? 'Syncing...' : ctx.justSynced ? 'Synced' : 'Cloud Vault'}
          </span>
        </div>
        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 ${
          ctx.justSynced ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
        }`}>
          {ctx.isSyncing || ctx.gdriveSyncState?.isSyncing ? '🔄' : ctx.justSynced ? '✨' : 'Sync'}
        </span>
      </div>
    ),
    renderExpanded: (ctx) => (
      <div className="w-full flex flex-col justify-center select-none py-0.5">
        <div className="grid grid-cols-4 gap-1.5">
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <ShieldCheck className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Status</span>
            </div>
            <div className="text-[10px] font-black text-emerald-400 truncate max-w-full">
              {ctx.isSyncing || ctx.gdriveSyncState?.isSyncing ? 'Syncing' : ctx.justSynced ? 'Synced' : 'Connected'}
            </div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Cloud className="w-2.5 h-2.5 text-blue-400 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Type</span>
            </div>
            <div className="text-[10px] font-black truncate max-w-full">GDrive</div>
          </div>
          <div className={`p-1.5 rounded-xl border text-center flex flex-col items-center justify-center ${
            ctx.settingsThemeMode === 'dark' ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/70 border-white/80'
          }`}>
            <div className="flex items-center gap-0.5 mb-0.5">
              <Sparkles className="w-2.5 h-2.5 text-indigo-400 shrink-0" />
              <span className="text-[7.5px] font-black uppercase tracking-wider opacity-60">Zero-Loss</span>
            </div>
            <div className="text-[10px] font-black text-indigo-400">Active</div>
          </div>
          <button
            type="button"
            onClick={ctx.handleHeaderSync}
            disabled={ctx.isSyncing || ctx.gdriveSyncState?.isSyncing}
            className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-[10px] transition flex flex-col items-center justify-center cursor-pointer border border-emerald-400/40"
          >
            <span className="text-[7.5px] uppercase tracking-wider opacity-80">Drive</span>
            <span className="font-black">{ctx.isSyncing ? 'Syncing...' : 'Sync Now 🔄'}</span>
          </button>
        </div>
      </div>
    )
  }
];

export default function MobileDynamicIsland(props) {
  const {
    settingsThemeMode = 'dark',
    studyLogs = {},
    todayStr = new Date().toISOString().slice(0, 10),
    getLiveTodayHours = () => 0,
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
    islandMobileState,
    setIsIslandMobileState,
    setIsLiveAlertsStackOpen,
    alertsOpenTimestampRef,
    subjectTrackerData = []
  } = props;

  const [activeCardId, setActiveCardId] = useState('momentum');
  const [internalActiveTopicIds, setInternalActiveTopicIds] = useState(new Set());
  const islandTouchRef = useRef({ startX: 0, startY: 0, startTime: 0, isSwiping: false, lastTouchTime: 0 });
  const islandExpandedTimeRef = useRef(0);

  // Load and listen to active new topic IDs
  useEffect(() => {
    const today = todayStr || new Date().toISOString().slice(0, 10);
    if (typeof getActiveNewTopicIds === 'function') {
      getActiveNewTopicIds(today).then(ids => {
        if (Array.isArray(ids)) {
          setInternalActiveTopicIds(new Set(ids));
        }
      }).catch(() => {});
    }

    const handleTopicIdsChanged = (e) => {
      if (e?.detail?.updatedList && Array.isArray(e.detail.updatedList)) {
        setInternalActiveTopicIds(new Set(e.detail.updatedList));
      }
    };
    window.addEventListener('autoanki_topic_ids_changed', handleTopicIdsChanged);
    return () => window.removeEventListener('autoanki_topic_ids_changed', handleTopicIdsChanged);
  }, [todayStr]);

  // Calculate live FSRS Queue counts
  const fsrsQueueStats = useMemo(() => {
    let overdueCount = 0;
    let dueTodayCount = 0;
    let newTopicsCount = 0;

    if (Array.isArray(subjectTrackerData)) {
      subjectTrackerData.forEach(subDoc => {
        const subName = (subDoc.subject || subDoc.id || '').trim();
        if (subDoc.topics && typeof subDoc.topics === 'object') {
          Object.values(subDoc.topics).forEach(topic => {
            if (!topic || !topic.name) return;
            const cleanName = (topic.name || '').trim();
            const isUnstudied = (!topic.reviewCount || topic.reviewCount === 0) && !topic.lastReviewDate;

            const isPickedForToday = Boolean(
              (internalActiveTopicIds && typeof internalActiveTopicIds.has === 'function' && (
                internalActiveTopicIds.has(`${subName}_${topic.name}`) ||
                internalActiveTopicIds.has(`${subName.toLowerCase()}_${cleanName.toLowerCase()}`)
              )) ||
              topic.isPickedForToday ||
              (topic.activatedDate && topic.activatedDate <= todayStr)
            );

            if (isUnstudied && isPickedForToday) {
              newTopicsCount += 1;
            } else if (topic.nextReviewDue) {
              if (topic.nextReviewDue < todayStr) {
                overdueCount += 1;
              } else if (topic.nextReviewDue === todayStr) {
                dueTodayCount += 1;
              }
            } else if (!isUnstudied) {
              dueTodayCount += 1;
            }
          });
        }
      });
    }

    return {
      overdueCount,
      dueTodayCount,
      totalDueCount: overdueCount + dueTodayCount,
      newTopicsCount
    };
  }, [subjectTrackerData, internalActiveTopicIds, todayStr]);

  // Calculate live AI Predictive Workload Forecast
  const predictiveWorkloadStats = useMemo(() => {
    try {
      const forecast = calculateWeeklyWorkloadForecast(subjectTrackerData, studyLogs, [], 1);
      return forecast && forecast[0] ? forecast[0] : { totalMins: 0, dueReviewsMins: 0, newTopicsMins: 0, formattedTotal: '0m' };
    } catch (e) {
      return { totalMins: 0, dueReviewsMins: 0, newTopicsMins: 0, formattedTotal: '0m' };
    }
  }, [subjectTrackerData, studyLogs]);

  // Calculate Daily Study Target Progress
  const dailyTargetStats = useMemo(() => {
    const targetHours = 6.0;
    const liveHours = typeof getLiveTodayHours === 'function' ? getLiveTodayHours() : 0;
    const percent = Math.min(100, Math.round((liveHours / targetHours) * 100));
    const remainingHours = Math.max(0, targetHours - liveHours).toFixed(1);
    return {
      targetHours,
      liveHours: Number(liveHours.toFixed(2)),
      percent,
      remainingHours
    };
  }, [getLiveTodayHours]);

  // Render Context passed to cards
  const ctx = {
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
    setIsDailyMetricsOpen,
    fsrsQueueStats,
    predictiveWorkloadStats,
    dailyTargetStats
  };

  // State sequence for swipe gesture navigation
  const mobileSequence = ['hole', 'momentum', 'timer', 'fsrsQueue', 'predictive', 'targetProgress', 'exam', 'sync'];

  // Map legacy state strings (pill, mini, semi) to canonical keys
  const normalizedState = useMemo(() => {
    if (islandMobileState === 'pill') return 'momentum';
    if (islandMobileState === 'mini' || islandMobileState === 'semi') return 'timer';
    if (islandMobileState === 'fsrs') return 'fsrsQueue';
    if (islandMobileState === 'target') return 'targetProgress';
    return islandMobileState || 'hole';
  }, [islandMobileState]);

  // Sync activeCardId when normalizedState changes to an activity card
  useEffect(() => {
    if (normalizedState !== 'hole') {
      setActiveCardId(normalizedState);
    }
  }, [normalizedState]);

  const activeCard = useMemo(() => {
    return MOBILE_ACTIVITY_CARDS.find(c => c.id === activeCardId) || MOBILE_ACTIVITY_CARDS[0];
  }, [activeCardId]);

  // Determine dynamic CSS class on dynamic island container
  const islandCssClass = useMemo(() => {
    if (isDailyMetricsOpen) return 'active';
    if (normalizedState === 'hole') return 'mobile-hole';
    if (normalizedState === 'momentum') return 'mobile-pill';
    if (normalizedState === 'timer') return 'mobile-timer-mini';
    if (normalizedState === 'fsrsQueue') return 'mobile-fsrs';
    if (normalizedState === 'predictive') return 'mobile-predictive';
    if (normalizedState === 'targetProgress') return 'mobile-target';
    if (normalizedState === 'exam') return 'mobile-exam';
    if (normalizedState === 'sync') return 'mobile-sync';
    return 'mobile-hole';
  }, [isDailyMetricsOpen, normalizedState]);

  return (
    <>
      {/* Backdrop for expanded active drawer - 100% click/touch bleed-through protection */}
      {isDailyMetricsOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] pointer-events-auto cursor-pointer"
          style={{ touchAction: 'none' }}
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDailyMetricsOpen(false);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDailyMetricsOpen(false);
          }}
        />
      )}

      <div
        onTouchStart={(e) => {
          const touch = e.touches[0];
          islandTouchRef.current = {
            startX: touch.clientX,
            startY: touch.clientY,
            startTime: Date.now(),
            isSwiping: false,
            wasAlreadyOpenAtTouchStart: isDailyMetricsOpen,
            lastTouchTime: islandTouchRef.current.lastTouchTime || 0
          };
        }}
        onTouchMove={(e) => {
          if (!islandTouchRef.current.startX) return;
          const touch = e.touches[0];
          const diffX = touch.clientX - islandTouchRef.current.startX;
          const diffY = touch.clientY - islandTouchRef.current.startY;
          if (Math.abs(diffX) > 8 && Math.abs(diffX) > Math.abs(diffY)) {
            islandTouchRef.current.isSwiping = true;
          }
        }}
        onTouchEnd={(e) => {
          const { startX, startY, startTime, isSwiping, wasAlreadyOpenAtTouchStart } = islandTouchRef.current;
          const touch = e.changedTouches ? e.changedTouches[0] : null;
          const now = Date.now();
          islandTouchRef.current.lastTouchTime = now;
          if (!touch || !startX) return;

          const diffX = touch.clientX - startX;
          const diffY = touch.clientY - startY;
          const duration = now - startTime;

          // 1. SWIPE GESTURE (Horizontal swipe with >= 10px movement)
          if (isSwiping || (Math.abs(diffX) >= 10 && Math.abs(diffX) > Math.abs(diffY))) {
            if (isDailyMetricsOpen) {
              // Cycle active card within expanded drawer
              const cardIdx = MOBILE_ACTIVITY_CARDS.findIndex(c => c.id === activeCardId);
              const step = diffX > 0 ? 1 : -1;
              const nextCardIdx = (cardIdx + step + MOBILE_ACTIVITY_CARDS.length) % MOBILE_ACTIVITY_CARDS.length;
              setActiveCardId(MOBILE_ACTIVITY_CARDS[nextCardIdx].id);
            } else {
              // Cycle through compact state sequence
              let currentIdx = mobileSequence.indexOf(normalizedState);
              if (currentIdx === -1) currentIdx = 0;
              const step = diffX > 0 ? 1 : -1;
              const nextIdx = (currentIdx + step + mobileSequence.length) % mobileSequence.length;
              const nextState = mobileSequence[nextIdx];
              setIsIslandMobileState(nextState);
              if (nextState !== 'hole') setActiveCardId(nextState);
            }
            islandTouchRef.current = { startX: 0, startY: 0, startTime: 0, isSwiping: false, lastTouchTime: now };
            return;
          }

          // 2. TAP GESTURE (Quick release)
          if (!isSwiping && Math.abs(diffX) < 10 && Math.abs(diffY) < 10 && duration < 600) {
            if (wasAlreadyOpenAtTouchStart && isDailyMetricsOpen) {
              // Tap while expanded
              return;
            } else if (normalizedState === 'hole') {
              // Tap on Lava Orb opens OxygenOS Live Alerts Stack
              if (e.cancelable) e.preventDefault();
              e.stopPropagation();
              if (alertsOpenTimestampRef) alertsOpenTimestampRef.current = now;
              islandExpandedTimeRef.current = now;
              setIsLiveAlertsStackOpen(true);
            } else {
              // Tap on ANY compact activity pill opens the expanded card
              islandExpandedTimeRef.current = now;
              setActiveCardId(normalizedState);
              setIsDailyMetricsOpen(true);
            }
          }
          islandTouchRef.current = { startX: 0, startY: 0, startTime: 0, isSwiping: false, lastTouchTime: now };
        }}
        onClick={(e) => {
          if (Date.now() - (islandTouchRef.current.lastTouchTime || 0) < 700) return;
          if (isDailyMetricsOpen) {
            return;
          }
          if (normalizedState === 'hole') {
            if (alertsOpenTimestampRef) alertsOpenTimestampRef.current = Date.now();
            islandExpandedTimeRef.current = Date.now();
            setIsLiveAlertsStackOpen(true);
          } else {
            islandExpandedTimeRef.current = Date.now();
            setActiveCardId(normalizedState);
            setIsDailyMetricsOpen(true);
          }
        }}
        className={`ios-dynamic-island pointer-events-auto ${settingsThemeMode === 'dark' ? 'dark' : 'light'} ${islandCssClass}`}
        title={isDailyMetricsOpen ? "Swipe to switch activities, tap [^] to minimize" : "Swipe horizontally to cycle Live Alerts (Orb / Momentum / Timer / FSRS / AI Forecast / Target / Exam / Sync), tap pill to expand"}
      >
        {/* 1. CLOSED HOLE: Glowing Lava Orb */}
        <div className="compact-hole-orb">
          <div className="dynamic-island-orb">
            <svg width="100" height="100" viewBox="0 0 100 100">
              <defs>
                <mask id="island-clipping-mask">
                  <polygon points="0,0 100,0 100,100 0,100" fill="black" />
                  <polygon points="25,25 75,25 50,75" fill="white" />
                  <polygon points="50,25 75,75 25,75" fill="white" />
                  <polygon points="35,35 65,35 50,65" fill="white" />
                  <polygon points="35,35 65,35 50,65" fill="white" />
                  <polygon points="35,35 65,35 50,65" fill="white" />
                  <polygon points="35,35 65,35 50,65" fill="white" />
                </mask>
              </defs>
            </svg>
            <div className="box" />
          </div>
        </div>

        {/* 2. COMPACT ACTIVITY PILLS (Active when not expanded) */}
        {!isDailyMetricsOpen && (
          <>
            {normalizedState === 'momentum' && MOBILE_ACTIVITY_CARDS[0].renderCompact(ctx)}
            {normalizedState === 'timer' && MOBILE_ACTIVITY_CARDS[1].renderCompact(ctx)}
            {normalizedState === 'fsrsQueue' && MOBILE_ACTIVITY_CARDS[2].renderCompact(ctx)}
            {normalizedState === 'predictive' && MOBILE_ACTIVITY_CARDS[3].renderCompact(ctx)}
            {normalizedState === 'targetProgress' && MOBILE_ACTIVITY_CARDS[4].renderCompact(ctx)}
            {normalizedState === 'exam' && MOBILE_ACTIVITY_CARDS[5].renderCompact(ctx)}
            {normalizedState === 'sync' && MOBILE_ACTIVITY_CARDS[6].renderCompact(ctx)}
          </>
        )}

        {/* 3. EXPANDED DRAWER (Unified header row + 4-metric grid) */}
        {isDailyMetricsOpen && (
          <div className="expanded-content flex flex-col justify-between w-full h-full p-2 select-none overflow-hidden">
            {/* Unified Top Header Bar */}
            <div className="flex items-center justify-between pb-1 border-b border-white/10 shrink-0">
              {/* Activity Mini Subtabs */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                {MOBILE_ACTIVITY_CARDS.map(card => {
                  const Icon = card.icon;
                  const isActive = card.id === activeCardId;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveCardId(card.id);
                        setIsIslandMobileState(card.id);
                      }}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition cursor-pointer shrink-0 ${
                        isActive
                          ? (settingsThemeMode === 'dark' ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40' : 'bg-blue-100 text-blue-800 border border-blue-300')
                          : 'opacity-50 hover:opacity-100'
                      }`}
                    >
                      <Icon className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate max-w-[65px]">{card.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Close Chevron */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDailyMetricsOpen(false);
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  setIsDailyMetricsOpen(false);
                }}
                className="p-1 hover:bg-white/10 rounded-lg opacity-70 hover:opacity-100 transition cursor-pointer shrink-0 ml-1"
                title="Minimize Drawer"
              >
                <ChevronDown className="w-3.5 h-3.5 rotate-180 text-blue-500" />
              </button>
            </div>

            {/* Active Card Body Content */}
            <div className="flex-1 flex flex-col justify-center pt-0.5">
              {activeCard.renderExpanded(ctx)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Zap, TrendingUp, Calendar, BookOpen, Brain, Sparkles,
  BarChart3, Moon, Sun, Sunrise, Sunset, Flame, CheckCircle2,
  Sliders, Search, Trash2, ArrowUpRight, ArrowDownRight, Layers,
  ChevronRight, RefreshCw, AlertCircle
} from 'lucide-react';
import {
  calculateSubjectPaceMetrics,
  calculateRevisionTierMetrics,
  calculateCircadianMetrics,
  calculateFatigueMultiplier,
  calculateWeeklyWorkloadForecast,
  calculatePredictiveTopicTime,
  calculateDynamicProfileMaturity,
  extractAllTimingLogs,
  formatPredictedDuration
} from '../services/predictiveTimingEngine';

export default function StudyVelocityTab({
  subjectTrackerData = [],
  studyLogs = [],
  fsrsConfig = {},
  timerState = null,
  themeMode = 'dark',
  activeNewTopicsList = [],
  onDeleteTimingLog = null
}) {
  const isDark = themeMode === 'dark';

  // 1. Dynamic Profile Maturity & Model Confidence
  const profileMaturity = useMemo(() => {
    return calculateDynamicProfileMaturity(subjectTrackerData, studyLogs, fsrsConfig, timerState);
  }, [subjectTrackerData, studyLogs, fsrsConfig, timerState]);

  // 2. Core Speed & Behavioral Metrics
  const { subjectPaces, globalAvgPace, totalTimingLogsCount } = useMemo(() => {
    return calculateSubjectPaceMetrics(studyLogs);
  }, [studyLogs]);

  const { tierMap, tierRatios, newAvgPace } = useMemo(() => {
    return calculateRevisionTierMetrics(studyLogs);
  }, [studyLogs]);

  const circadianMetrics = useMemo(() => {
    return calculateCircadianMetrics(studyLogs, globalAvgPace);
  }, [studyLogs, globalAvgPace]);

  const fatigueData = useMemo(() => {
    return calculateFatigueMultiplier(timerState);
  }, [timerState]);

  // 3. 7-Day Workload Forecast
  const weeklyForecast = useMemo(() => {
    return calculateWeeklyWorkloadForecast(subjectTrackerData, studyLogs, activeNewTopicsList, 7);
  }, [subjectTrackerData, studyLogs, activeNewTopicsList]);

  // 4. Time-Boxed Capacity Slider State
  const [availableStudyMins, setAvailableStudyMins] = useState(45);

  // Time-Boxed Topic Selection
  const timeBoxedSelection = useMemo(() => {
    const todayForecast = weeklyForecast[0];
    if (!todayForecast || !Array.isArray(todayForecast.topics)) return { selected: [], totalMins: 0, remainingMins: availableStudyMins };

    const sortedTopics = [...todayForecast.topics].sort((a, b) => {
      // Prioritize due reviews over new topics
      if (a.isNew !== b.isNew) return a.isNew ? 1 : -1;
      return a.predictedMinutes - b.predictedMinutes;
    });

    let currentTotal = 0;
    const selected = [];
    sortedTopics.forEach(t => {
      if (currentTotal + t.predictedMinutes <= availableStudyMins) {
        selected.push(t);
        currentTotal += t.predictedMinutes;
      }
    });

    return {
      selected,
      totalMins: currentTotal,
      remainingMins: Math.max(0, availableStudyMins - currentTotal)
    };
  }, [weeklyForecast, availableStudyMins]);

  // 5. Session Log History Table & Filter
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('ALL');

  const allLogs = useMemo(() => {
    const raw = extractAllTimingLogs(studyLogs);
    return raw.filter(l => l && (l.topicName || l.subject)).sort((a, b) => {
      const tA = a.timestamp ? new Date(a.timestamp).getTime() : (a.dateStr ? new Date(a.dateStr).getTime() : 0);
      const tB = b.timestamp ? new Date(b.timestamp).getTime() : (b.dateStr ? new Date(b.dateStr).getTime() : 0);
      return tB - tA;
    });
  }, [studyLogs]);

  const filteredLogs = useMemo(() => {
    return allLogs.filter(log => {
      const matchSubject = selectedSubjectFilter === 'ALL' || (log.subject || '').toLowerCase() === selectedSubjectFilter.toLowerCase();
      const matchSearch = !logSearchQuery.trim() ||
        (log.topicName || '').toLowerCase().includes(logSearchQuery.toLowerCase()) ||
        (log.subject || '').toLowerCase().includes(logSearchQuery.toLowerCase());
      return matchSubject && matchSearch;
    });
  }, [allLogs, selectedSubjectFilter, logSearchQuery]);

  const distinctSubjects = useMemo(() => {
    const s = new Set();
    allLogs.forEach(l => { if (l.subject) s.add(l.subject); });
    return Array.from(s);
  }, [allLogs]);

  // Today & Tomorrow Forecast Quick Summaries
  const todayForecast = weeklyForecast[0] || { totalMins: 0, dueReviewsMins: 0, newTopicsMins: 0, formattedTotal: '0 mins' };
  const tomorrowForecast = weeklyForecast[1] || { totalMins: 0, formattedTotal: '0 mins' };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* SECTION 0: DYNAMIC PROFILE MATURITY & SELF-LEARNING CONFIDENCE ENGINE     */}
      {/* ========================================================================= */}
      <motion.div
        initial={{ opacity: 0, y: -16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={`p-5 sm:p-6 rounded-3xl border shadow-xl relative overflow-hidden transition-all duration-300 ${
          isDark
            ? 'bg-gradient-to-br from-[#222730] via-[#1d222b] to-[#171b22] border-slate-700/80 neu-card-dark'
            : 'bg-gradient-to-br from-[#f2f6fc] via-[#e6ecf5] to-[#d9e2ec] border-white neu-card-light'
        }`}
      >
        {/* Subtle Ambient Glow Background */}
        <div
          className={`absolute -top-16 -right-16 w-56 h-56 rounded-full blur-3xl pointer-events-none opacity-20 ${
            profileMaturity.score >= 90
              ? 'bg-emerald-500'
              : profileMaturity.score >= 66
              ? 'bg-teal-500'
              : profileMaturity.score >= 35
              ? 'bg-cyan-500'
              : 'bg-amber-500'
          }`}
        />

        {/* Header Title & Dynamic Stage Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="p-1.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20">
                <Brain className="w-4 h-4" />
              </div>
              <h3 className={`text-sm sm:text-base font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Predictive Profile Maturity
              </h3>
              <span className={`text-[10px] sm:text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border shadow-sm ${
                profileMaturity.score >= 90
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : profileMaturity.score >= 66
                  ? 'bg-teal-500/20 text-teal-400 border-teal-500/40'
                  : profileMaturity.score >= 35
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
              }`}>
                {profileMaturity.stageLabel}
              </span>
            </div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              {profileMaturity.stageDesc}
            </p>
          </div>

          {/* Large Numerical Score Display */}
          <div className="flex items-baseline gap-1.5 self-start sm:self-auto shrink-0">
            <span className={`text-3xl sm:text-4xl font-black font-mono tracking-tight ${
              profileMaturity.score >= 90
                ? 'text-emerald-400'
                : profileMaturity.score >= 66
                ? 'text-teal-400'
                : profileMaturity.score >= 35
                ? 'text-cyan-400'
                : 'text-amber-400'
            }`}>
              {profileMaturity.score}%
            </span>
            <span className={`text-[10px] sm:text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Maturity
            </span>
          </div>
        </div>

        {/* Master Progress Bar (0–100%) */}
        <div className="mt-4 relative z-10">
          <div className={`w-full h-3.5 rounded-full p-0.5 overflow-hidden border shadow-inner ${
            isDark ? 'bg-slate-900/90 border-slate-700/80 neu-pressed-dark' : 'bg-slate-200/80 border-slate-300 neu-pressed-light'
          }`}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${profileMaturity.score}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className={`h-full rounded-full transition-all duration-500 shadow-sm ${
                profileMaturity.score >= 90
                  ? 'bg-gradient-to-r from-teal-500 via-emerald-400 to-emerald-300'
                  : profileMaturity.score >= 66
                  ? 'bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400'
                  : profileMaturity.score >= 35
                  ? 'bg-gradient-to-r from-blue-500 via-cyan-400 to-teal-400'
                  : 'bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-400'
              }`}
            />
          </div>
        </div>

        {/* 4 Dynamic Self-Learning Pillar Sub-Meters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-4 relative z-10">
          {profileMaturity.pillars.map((pillar, idx) => (
            <motion.div
              key={pillar.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * idx, duration: 0.25 }}
              className={`p-3 rounded-2xl border flex flex-col justify-between shadow-sm ${
                isDark ? 'bg-[#1b2028]/80 border-slate-700/60' : 'bg-white/75 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-1 text-[10px] font-black uppercase tracking-wider">
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{pillar.label}</span>
                <span className={`font-mono font-bold ${
                  pillar.score >= 80 ? 'text-emerald-400' : pillar.score >= 40 ? 'text-cyan-400' : 'text-amber-400'
                }`}>
                  {pillar.score}%
                </span>
              </div>
              <div className="mt-2 mb-1.5 flex items-baseline justify-between">
                <span className={`text-xs font-bold font-mono ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  {pillar.text}
                </span>
              </div>
              <div className={`w-full h-1.5 rounded-full overflow-hidden ${
                isDark ? 'bg-slate-800' : 'bg-slate-200'
              }`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    pillar.score >= 80 ? 'bg-emerald-400' : pillar.score >= 40 ? 'bg-cyan-400' : 'bg-amber-400'
                  }`}
                  style={{ width: `${pillar.score}%` }}
                />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Dynamic Telemetry & Next-Step Milestone Banner */}
        <div className={`mt-4 p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 relative z-10 text-xs ${
          isDark ? 'bg-slate-900/60 border-slate-700/50 text-slate-300' : 'bg-white/80 border-slate-200 text-slate-700'
        }`}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <span className="font-semibold">
              <strong className="font-bold text-amber-500">Next Milestone:</strong> {profileMaturity.nextFocusRecommendation}
            </span>
          </div>

          {profileMaturity.avgErrorMarginMins > 0 && (
            <span className="text-[10px] font-mono font-bold opacity-80 px-2 py-0.5 rounded-lg border self-end sm:self-auto shrink-0 bg-slate-800/40 border-slate-700">
              🎯 Rolling Error: ±{profileMaturity.avgErrorMarginMins}m
            </span>
          )}
        </div>
      </motion.div>

      {/* ========================================================================= */}
      {/* SECTION 1: TOP HERO METRIC BANNER                                        */}
      {/* ========================================================================= */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {/* Widget 1: Today's Pending Workload */}
        <div className={`p-5 rounded-3xl border shadow-lg flex flex-col justify-between ${
          isDark ? 'bg-[#222730] border-slate-700/70 neu-card-dark' : 'bg-[#e6ecf5] border-white/80 neu-card-light'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Today's Workload
            </span>
            <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {todayForecast.formattedTotal}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {formatPredictedDuration(todayForecast.newTopicsMins)} New
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                {formatPredictedDuration(todayForecast.dueReviewsMins)} Reviews
              </span>
            </div>
          </div>
          <div className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Based on {todayForecast.reviewCount + todayForecast.newCount} pending topics
          </div>
        </div>

        {/* Widget 2: Tomorrow's Forecast Load */}
        <div className={`p-5 rounded-3xl border shadow-lg flex flex-col justify-between ${
          isDark ? 'bg-[#222730] border-slate-700/70 neu-card-dark' : 'bg-[#e6ecf5] border-white/80 neu-card-light'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Tomorrow's Forecast
            </span>
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className={`text-2xl font-black tracking-tight ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
              {tomorrowForecast.formattedTotal}
            </div>
            <p className={`text-xs font-semibold mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {tomorrowForecast.reviewCount} due spaced reviews
            </p>
          </div>
          <div className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Proactive daily schedule forecast
          </div>
        </div>

        {/* Widget 3: Global Study Velocity */}
        <div className={`p-5 rounded-3xl border shadow-lg flex flex-col justify-between ${
          isDark ? 'bg-[#222730] border-slate-700/70 neu-card-dark' : 'bg-[#e6ecf5] border-white/80 neu-card-light'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Global Study Velocity
            </span>
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className={`text-2xl font-black tracking-tight ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
              {globalAvgPace} <span className="text-xs font-bold opacity-75">mins/pg</span>
            </div>
            <p className={`text-xs font-semibold mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Learned from {totalTimingLogsCount} study logs
            </p>
          </div>
          <div className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Base initial reading pace
          </div>
        </div>

        {/* Widget 4: Live Session Energy & Fatigue Meter */}
        <div className={`p-5 rounded-3xl border shadow-lg flex flex-col justify-between ${
          isDark ? 'bg-[#222730] border-slate-700/70 neu-card-dark' : 'bg-[#e6ecf5] border-white/80 neu-card-light'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Live Session Energy
            </span>
            <div className={`p-2 rounded-xl ${fatigueData.multiplier > 1.0 ? 'bg-rose-500/15 text-rose-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black tracking-tight flex items-baseline gap-2">
              <span className={fatigueData.multiplier > 1.0 ? 'text-amber-400' : 'text-emerald-400'}>
                {fatigueData.activeContinuousMins}m
              </span>
              <span className="text-xs font-bold opacity-75">continuous</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-black border ${
                fatigueData.multiplier > 1.0
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              }`}>
                {fatigueData.statusLabel} ({fatigueData.multiplier}x)
              </span>
            </div>
          </div>
          <div className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Connected to Study Room Timers
          </div>
        </div>
      </motion.div>

      {/* ========================================================================= */}
      {/* SECTION 2: 7-DAY FORECAST & TIME-BOXED PLANNER                           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Widget 5: 7-Day Workload Forecast Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className={`lg:col-span-2 p-6 rounded-3xl border shadow-lg ${
            isDark ? 'bg-[#222730] border-slate-700/70 neu-card-dark' : 'bg-[#e6ecf5] border-white/80 neu-card-light'
          }`}
        >
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div>
              <h3 className={`text-sm font-black tracking-tight flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <BarChart3 className="w-4 h-4 text-blue-500" />
                <span>7-Day Predictive Workload Forecast</span>
              </h3>
              <p className={`text-xs font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                FSRS scheduled workload duration predictions for the upcoming week
              </p>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 pt-2">
            {weeklyForecast.map((day, idx) => {
              const maxMins = Math.max(60, ...weeklyForecast.map(d => d.totalMins));
              const heightPercent = Math.max(12, Math.round((day.totalMins / maxMins) * 100));
              const isToday = idx === 0;

              return (
                <div key={day.dateStr} className="flex flex-col items-center gap-2 group">
                  <span className={`text-[10px] font-bold font-mono ${isToday ? 'text-blue-400 font-black' : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>
                    {day.totalMins > 0 ? `${day.totalMins}m` : '0m'}
                  </span>

                  {/* Vertical Bar Track */}
                  <div className={`w-full h-32 rounded-2xl p-1 flex flex-col justify-end border relative overflow-hidden ${
                    isDark ? 'bg-slate-900/50 border-slate-700/60 neu-pressed-dark' : 'bg-white/70 border-slate-200 neu-pressed-light'
                  }`}>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${heightPercent}%` }}
                      transition={{ duration: 0.5, delay: idx * 0.05, ease: 'easeOut' }}
                      className={`w-full rounded-xl transition-all ${
                        isToday
                          ? 'bg-gradient-to-t from-blue-600 to-indigo-500 shadow-md shadow-blue-500/30'
                          : day.totalMins > 0
                            ? isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-300 hover:bg-slate-400'
                            : 'bg-transparent'
                      }`}
                    />
                  </div>

                  <div className="text-center">
                    <div className={`text-[11px] font-black ${isToday ? 'text-blue-400' : (isDark ? 'text-slate-300' : 'text-slate-700')}`}>
                      {idx === 0 ? 'Today' : idx === 1 ? 'Tmrw' : day.dayLabel.split(',')[0].slice(0, 3)}
                    </div>
                    <div className={`text-[9px] font-semibold opacity-70 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {day.reviewCount + day.newCount} tops
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Widget 6: Time-Boxed Capacity Planner */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
          className={`p-6 rounded-3xl border shadow-lg flex flex-col justify-between ${
            isDark ? 'bg-[#222730] border-slate-700/70 neu-card-dark' : 'bg-[#e6ecf5] border-white/80 neu-card-light'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className={`text-sm font-black tracking-tight flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <Sliders className="w-4 h-4 text-emerald-500" />
                <span>Time-Boxed Planner</span>
              </h3>
              <span className="text-xs font-black font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {availableStudyMins} mins
              </span>
            </div>

            <p className={`text-xs font-medium mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Set your available study time to see how many pending topics you can finish right now:
            </p>

            {/* Slider Control */}
            <input
              type="range"
              min="15"
              max="180"
              step="15"
              value={availableStudyMins}
              onChange={(e) => setAvailableStudyMins(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 my-2"
            />

            {/* Capacity Result */}
            <div className={`p-3 rounded-2xl border text-xs font-semibold mt-3 ${
              isDark ? 'bg-slate-900/40 border-slate-700/60 text-slate-300' : 'bg-white/80 border-slate-200 text-slate-700'
            }`}>
              <div className="flex justify-between items-center text-xs">
                <span>Selected: <strong>{timeBoxedSelection.selected.length} topics</strong></span>
                <span className="text-emerald-400 font-mono font-bold">~{timeBoxedSelection.totalMins}m allocated</span>
              </div>
            </div>

            {/* Selected Topic Items Preview */}
            <div className="mt-3 space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {timeBoxedSelection.selected.length > 0 ? (
                timeBoxedSelection.selected.map((t, i) => (
                  <div key={i} className={`p-2 rounded-xl text-xs flex items-center justify-between border ${
                    isDark ? 'bg-slate-900/60 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-800'
                  }`}>
                    <span className="truncate max-w-[140px] font-bold">{t.name}</span>
                    <span className="text-[10px] font-mono text-indigo-400 font-black">~{t.predictedMinutes}m</span>
                  </div>
                ))
              ) : (
                <div className={`text-[11px] text-center p-3 opacity-75 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  No topics fit into this time slot.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: BEHAVIORAL PATTERN ANALYTICS CARDS                            */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Widget 7: Subject Velocity Rankings */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
          className={`p-6 rounded-3xl border shadow-lg flex flex-col justify-between ${
            isDark ? 'bg-[#222730] border-slate-700/70 neu-card-dark' : 'bg-[#e6ecf5] border-white/80 neu-card-light'
          }`}
        >
          <div>
            <h3 className={`text-sm font-black tracking-tight flex items-center gap-2 mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <BookOpen className="w-4 h-4 text-indigo-500" />
              <span>Subject Velocity Rankings</span>
            </h3>
            <p className={`text-xs font-medium mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Learned reading speed per subject (mins per page)
            </p>

            <div className="space-y-3">
              {Object.keys(subjectPaces).length > 0 ? (
                Object.entries(subjectPaces)
                  .sort(([, a], [, b]) => a.avgMinsPerPage - b.avgMinsPerPage)
                  .map(([sub, data]) => {
                    const pace = Number(data.avgMinsPerPage.toFixed(1));
                    const isFaster = pace < globalAvgPace;

                    return (
                      <div key={sub} className="space-y-1">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="truncate max-w-[160px]">{sub}</span>
                          <span className="font-mono flex items-center gap-1">
                            {pace} m/pg
                            {isFaster ? (
                              <ArrowDownRight className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
                            )}
                          </span>
                        </div>
                        <div className={`w-full h-2 rounded-full overflow-hidden border ${
                          isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-200 border-slate-300'
                        }`}>
                          <div
                            className={`h-full rounded-full ${isFaster ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min(100, (pace / 4.0) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
              ) : (
                <div className={`text-xs text-center py-6 font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  No subject logs yet. Defaulting to 1.5 mins/page.
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Widget 8: Revision Phase Speed Curve */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.25 }}
          className={`p-6 rounded-3xl border shadow-lg flex flex-col justify-between ${
            isDark ? 'bg-[#222730] border-slate-700/70 neu-card-dark' : 'bg-[#e6ecf5] border-white/80 neu-card-light'
          }`}
        >
          <div>
            <h3 className={`text-sm font-black tracking-tight flex items-center gap-2 mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span>Revision Speed Acceleration</span>
            </h3>
            <p className={`text-xs font-medium mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Speed improvement decay curve across revision phases
            </p>

            <div className="space-y-3">
              {[
                { tier: 'NEW', label: '1st Read (New)', ratio: tierRatios.NEW, color: 'bg-blue-500' },
                { tier: 'R1', label: '1st Revision (R1)', ratio: tierRatios.R1, color: 'bg-emerald-500' },
                { tier: 'R2', label: '2nd Revision (R2)', ratio: tierRatios.R2, color: 'bg-indigo-500' },
                { tier: 'RN', label: 'Mature Repetitions (RN)', ratio: tierRatios.RN, color: 'bg-purple-500' }
              ].map(item => {
                const percent = Math.round(item.ratio * 100);
                return (
                  <div key={item.tier} className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span>{item.label}</span>
                      <span className="font-mono text-indigo-400 font-black">{percent}% of read time</span>
                    </div>
                    <div className={`w-full h-2 rounded-full overflow-hidden border ${
                      isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-200 border-slate-300'
                    }`}>
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Widget 9: Circadian Velocity Heatmap */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.3 }}
          className={`p-6 rounded-3xl border shadow-lg flex flex-col justify-between ${
            isDark ? 'bg-[#222730] border-slate-700/70 neu-card-dark' : 'bg-[#e6ecf5] border-white/80 neu-card-light'
          }`}
        >
          <div>
            <h3 className={`text-sm font-black tracking-tight flex items-center gap-2 mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Sun className="w-4 h-4 text-amber-500" />
              <span>Circadian Pace Profile</span>
            </h3>
            <p className={`text-xs font-medium mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Your reading velocity by time of day
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              {Object.entries(circadianMetrics).map(([key, data]) => {
                const isFastest = data.multiplier < 1.0;
                const icon = key === 'morning' ? <Sunrise className="w-4 h-4 text-amber-400" /> :
                             key === 'afternoon' ? <Sun className="w-4 h-4 text-yellow-400" /> :
                             key === 'evening' ? <Sunset className="w-4 h-4 text-orange-400" /> :
                             <Moon className="w-4 h-4 text-indigo-400" />;

                return (
                  <div key={key} className={`p-3 rounded-2xl border flex flex-col justify-between ${
                    isDark ? 'bg-slate-900/50 border-slate-700/60' : 'bg-white/80 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider opacity-75">{key}</span>
                      {icon}
                    </div>
                    <div className="my-1.5">
                      <div className="text-lg font-black font-mono">
                        {data.avgPace} <span className="text-[10px] font-normal opacity-75">m/pg</span>
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${
                        isFastest ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-400'
                      }`}>
                        {data.multiplier}x speed
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 4: FILTERABLE SESSION LOG HISTORY TABLE                          */}
      {/* ========================================================================= */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.35 }}
        className={`p-6 rounded-3xl border shadow-lg space-y-4 ${
          isDark ? 'bg-[#222730] border-slate-700/70 neu-card-dark' : 'bg-[#e6ecf5] border-white/80 neu-card-light'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className={`text-sm font-black tracking-tight flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Clock className="w-4 h-4 text-blue-500" />
              <span>Topic Session Duration Logs ({filteredLogs.length})</span>
            </h3>
            <p className={`text-xs font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Historical recorded study durations and calculated minutes per page
            </p>
          </div>

          {/* Search & Subject Filter Toolbar */}
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            {/* Search Input */}
            <div className="relative">
              <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
              <input
                type="text"
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                placeholder="Search topic or subject..."
                className={`py-1.5 pl-8 pr-3 rounded-xl text-xs font-semibold border focus:outline-none transition-all ${
                  isDark ? 'bg-slate-900/60 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                }`}
              />
            </div>

            {/* Subject Selector */}
            <select
              value={selectedSubjectFilter}
              onChange={(e) => setSelectedSubjectFilter(e.target.value)}
              className={`py-1.5 px-3 rounded-xl text-xs font-semibold border focus:outline-none cursor-pointer ${
                isDark ? 'bg-slate-900/60 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              <option value="ALL">All Subjects</option>
              {distinctSubjects.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Logs Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-700/40">
          <table className="w-full text-left text-xs">
            <thead className={`text-[10px] uppercase font-black tracking-wider border-b ${
              isDark ? 'bg-slate-900/80 border-slate-700/60 text-slate-400' : 'bg-slate-200/80 border-slate-300 text-slate-600'
            }`}>
              <tr>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Topic</th>
                <th className="py-3 px-4 text-center">Rating</th>
                <th className="py-3 px-4 text-center">Pages</th>
                <th className="py-3 px-4 text-center">Actual Time</th>
                <th className="py-3 px-4 text-center">Pace (Mins/Pg)</th>
                <th className="py-3 px-4 text-center">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30 font-medium">
              {filteredLogs.length > 0 ? (
                filteredLogs.slice(0, 25).map((log, idx) => {
                  const rawDuration = log.actualDurationMins || log.durationMins;
                  const duration = rawDuration != null && rawDuration > 0 ? rawDuration : null;
                  const pages = log.pageWeight || 1;
                  const pace = log.minsPerPage || (duration && pages > 0 ? Number((duration / pages).toFixed(1)) : null);
                  const dateDisplay = log.timestamp
                    ? new Date(log.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : (log.dateStr || 'Recent');

                  const ratingLabel = log.rating === 1 ? 'Again (1)' : log.rating === 2 ? 'Hard (2)' : log.rating === 3 ? 'Good (3)' : log.rating === 4 ? 'Easy (4)' : '-';
                  const ratingColor = log.rating === 1 ? 'text-rose-400' : log.rating === 2 ? 'text-amber-400' : log.rating === 3 ? 'text-blue-400' : 'text-emerald-400';

                  return (
                    <tr key={log.id || idx} className={`transition-colors ${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-100/80'}`}>
                      <td className="py-3 px-4 font-mono text-[11px] opacity-75">{dateDisplay}</td>
                      <td className="py-3 px-4 font-bold text-indigo-400">{log.subject || 'General'}</td>
                      <td className="py-3 px-4 font-bold">{log.topicName || 'Topic'}</td>
                      <td className={`py-3 px-4 text-center font-black ${ratingColor}`}>{ratingLabel}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold">{pages}</td>
                      <td className="py-3 px-4 text-center font-mono font-black text-emerald-400">
                        {duration ? `${duration}m` : <span className="text-slate-400 font-normal italic text-[11px]">Untimed</span>}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        {pace != null ? `${pace} m/pg` : <span className="text-slate-500 font-normal">—</span>}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider bg-slate-700/40 border border-slate-600/40">
                          {log.revisionTier || 'R1'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" className={`py-8 text-center text-xs font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    No timing logs recorded yet. Rate topics after study to build your velocity profile!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

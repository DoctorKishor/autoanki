import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Activity,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Flame,
  Plus,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
  BarChart3,
  Layers
} from 'lucide-react';

export default function QBankDetailedModal({
  isOpen,
  onClose,
  studyLogs = {},
  isDark = true,
  onOpenSprint,
  formatAppDate
}) {
  const [timeframe, setTimeframe] = useState('30d'); // '7d' | '14d' | '30d' | '90d' | 'all'
  const [chartMode, setChartMode] = useState('combo'); // 'combo' | 'accuracy' | 'volume'
  const [subjectFilter, setSubjectFilter] = useState('ALL');
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // Extract all daily entries and individual sprint sessions
  const { allDailyLogs, allSessions, availableSubjects, availablePlatforms, globalStats } = useMemo(() => {
    const daily = [];
    const sessions = [];
    const subjectsSet = new Set();
    const platformsSet = new Set();

    let allTimeQs = 0;
    let allTimeCorrect = 0;
    let allTimeIncorrect = 0;
    let totalSprintSessions = 0;

    const sortedDates = Object.keys(studyLogs).sort();

    sortedDates.forEach(dateStr => {
      const log = studyLogs[dateStr] || {};
      const directQs = Number(log.questions) || 0;
      const directCorrect = Number(log.correctQuestions) || 0;
      const directIncorrect = Number(log.incorrectQuestions) || 0;

      const daySessions = Array.isArray(log.sessions) ? log.sessions : [];
      let dayQs = directQs;
      let dayCorrect = directCorrect;
      let dayIncorrect = directIncorrect;

      if (daySessions.length > 0) {
        const sQs = daySessions.reduce((sum, s) => sum + (Number(s.questions) || 0), 0);
        const sC = daySessions.reduce((sum, s) => sum + (Number(s.correct) || 0), 0);
        const sI = daySessions.reduce((sum, s) => sum + (Number(s.incorrect) || 0), 0);
        dayQs = Math.max(directQs, sQs);
        dayCorrect = sC;
        dayIncorrect = sI;

        daySessions.forEach((s, idx) => {
          totalSprintSessions++;
          const qCount = Number(s.questions) || 0;
          const cCount = Number(s.correct) || 0;
          const iCount = Number(s.incorrect) || 0;
          const acc = (cCount + iCount) > 0 ? Number(((cCount / (cCount + iCount)) * 100).toFixed(1)) : null;

          if (s.subject) subjectsSet.add(s.subject);
          if (s.platform) platformsSet.add(s.platform);

          sessions.push({
            id: s.id || `${dateStr}-s-${idx}`,
            dateStr,
            subject: s.subject || 'Mixed / All Subjects',
            platform: s.platform || 'General',
            mode: s.mode || 'Sprint',
            questions: qCount,
            correct: cCount,
            incorrect: iCount,
            accuracy: acc,
            duration: Number(s.duration) || 0,
            timestamp: s.timestamp || dateStr
          });
        });
      } else if (directQs > 0) {
        // Log entry without granular session objects
        totalSprintSessions++;
        const acc = (dayCorrect + dayIncorrect) > 0 ? Number(((dayCorrect / (dayCorrect + dayIncorrect)) * 100).toFixed(1)) : (log.accuracy || null);
        sessions.push({
          id: `${dateStr}-aggregate`,
          dateStr,
          subject: 'Mixed / All Subjects',
          platform: 'General QBank',
          mode: 'Day Sprint',
          questions: directQs,
          correct: dayCorrect,
          incorrect: dayIncorrect,
          accuracy: acc,
          duration: (Number(log.hours) || 0) * 60,
          timestamp: dateStr
        });
      }

      if (dayQs > 0) {
        allTimeQs += dayQs;
        allTimeCorrect += dayCorrect;
        allTimeIncorrect += dayIncorrect;

        const dayAcc = (dayCorrect + dayIncorrect) > 0
          ? Number(((dayCorrect / (dayCorrect + dayIncorrect)) * 100).toFixed(1))
          : (log.accuracy || null);

        daily.push({
          dateStr,
          questions: dayQs,
          correct: dayCorrect,
          incorrect: dayIncorrect,
          accuracy: dayAcc,
          sessionCount: daySessions.length || 1,
          sessions: daySessions
        });
      }
    });

    const allTimeAcc = (allTimeCorrect + allTimeIncorrect) > 0
      ? Number(((allTimeCorrect / (allTimeCorrect + allTimeIncorrect)) * 100).toFixed(1))
      : null;

    return {
      allDailyLogs: daily,
      allSessions: sessions.sort((a, b) => b.dateStr.localeCompare(a.dateStr)),
      availableSubjects: Array.from(subjectsSet).sort(),
      availablePlatforms: Array.from(platformsSet).sort(),
      globalStats: {
        allTimeQs,
        allTimeCorrect,
        allTimeIncorrect,
        allTimeAcc,
        totalActiveDays: daily.length,
        totalSprintSessions
      }
    };
  }, [studyLogs]);

  // Filtered dataset based on timeframe
  const filteredDailyLogs = useMemo(() => {
    if (allDailyLogs.length === 0) return [];
    if (timeframe === 'all') return allDailyLogs;

    const daysCount = timeframe === '7d' ? 7 : timeframe === '14d' ? 14 : timeframe === '30d' ? 30 : 90;
    return allDailyLogs.slice(-daysCount);
  }, [allDailyLogs, timeframe]);

  // Comparative KPIs: Current Filtered Window vs Historical Prior Average
  const windowStats = useMemo(() => {
    if (filteredDailyLogs.length === 0) {
      return {
        totalQs: 0,
        totalCorrect: 0,
        totalIncorrect: 0,
        accuracy: null,
        activeDaysCount: 0,
        avgDailyQs: 0,
        masteryDaysCount: 0,
        masteryPct: 0,
        accDelta: null,
        bestDay: null
      };
    }

    let totalQs = 0;
    let totalCorrect = 0;
    let totalIncorrect = 0;
    let masteryDaysCount = 0;
    let bestDay = null;

    filteredDailyLogs.forEach(d => {
      totalQs += d.questions;
      totalCorrect += d.correct;
      totalIncorrect += d.incorrect;
      if (d.accuracy !== null && d.accuracy >= 75) {
        masteryDaysCount++;
      }
      if (!bestDay || (d.accuracy !== null && (bestDay.accuracy === null || d.accuracy > bestDay.accuracy))) {
        bestDay = d;
      }
    });

    const accuracy = (totalCorrect + totalIncorrect) > 0
      ? Number(((totalCorrect / (totalCorrect + totalIncorrect)) * 100).toFixed(1))
      : null;

    const activeDaysCount = filteredDailyLogs.length;
    const avgDailyQs = activeDaysCount > 0 ? Math.round(totalQs / activeDaysCount) : 0;
    const masteryPct = activeDaysCount > 0 ? Math.round((masteryDaysCount / activeDaysCount) * 100) : 0;

    // Delta vs All-time baseline
    let accDelta = null;
    if (accuracy !== null && globalStats.allTimeAcc !== null) {
      accDelta = Number((accuracy - globalStats.allTimeAcc).toFixed(1));
    }

    return {
      totalQs,
      totalCorrect,
      totalIncorrect,
      accuracy,
      activeDaysCount,
      avgDailyQs,
      masteryDaysCount,
      masteryPct,
      accDelta,
      bestDay
    };
  }, [filteredDailyLogs, globalStats]);

  // Filtered Sessions for the table/logbook
  const filteredSessions = useMemo(() => {
    return allSessions.filter(s => {
      if (subjectFilter !== 'ALL' && s.subject !== subjectFilter) return false;
      if (platformFilter !== 'ALL' && s.platform !== platformFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSubject = s.subject.toLowerCase().includes(q);
        const matchPlatform = s.platform.toLowerCase().includes(q);
        const matchDate = s.dateStr.toLowerCase().includes(q);
        if (!matchSubject && !matchPlatform && !matchDate) return false;
      }
      return true;
    });
  }, [allSessions, subjectFilter, platformFilter, searchQuery]);

  if (!isOpen) return null;

  // Chart computation metrics
  const maxDailyQ = Math.max(...filteredDailyLogs.map(d => d.questions), 25);
  const chartWidth = 720;
  const chartHeight = 220;
  const paddingX = 40;
  const paddingY = 25;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingY * 2;

  const points = filteredDailyLogs.map((d, i) => {
    const x = filteredDailyLogs.length === 1
      ? chartWidth / 2
      : paddingX + (i / (filteredDailyLogs.length - 1)) * plotWidth;
    
    // Accuracy (0% to 100%) maps to y (chartHeight - paddingY to paddingY)
    const accVal = d.accuracy !== null ? d.accuracy : 0;
    const accY = chartHeight - paddingY - (accVal / 100) * plotHeight;
    
    // Volume bar height (0 to maxDailyQ)
    const barHeight = (d.questions / maxDailyQ) * (plotHeight * 0.7);
    const barY = chartHeight - paddingY - barHeight;

    return {
      x,
      accY,
      barY,
      barHeight,
      data: d
    };
  });

  const accuracyLinePath = points.filter(p => p.data.accuracy !== null).map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.accY}`).join(' ');
  const accuracyAreaPath = accuracyLinePath && points.length > 0
    ? `${accuracyLinePath} L ${points[points.length - 1].x} ${chartHeight - paddingY} L ${points[0].x} ${chartHeight - paddingY} Z`
    : '';

  const y75Target = chartHeight - paddingY - (75 / 100) * plotHeight;
  const y60Target = chartHeight - paddingY - (60 / 100) * plotHeight;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", stiffness: 350, damping: 22, mass: 0.8 }}
          className={`relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden border ${
            isDark ? 'neu-card-dark text-white border-gray-800' : 'neu-card-light text-slate-800 border-white/80'
          }`}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isDark ? 'border-gray-800/80 bg-[#1e242d]/80' : 'border-gray-200/80 bg-white/80'
          }`}>
            <div className="flex items-center gap-3 text-left">
              <div className={`p-2.5 rounded-2xl ${isDark ? 'neu-pressed-dark text-amber-400' : 'neu-pressed-light text-amber-500'}`}>
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black uppercase tracking-wider flex items-center gap-2">
                  <span>QBank Accuracy & Solve Velocity Analytics</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30 font-mono">
                    Deep Insights
                  </span>
                </h2>
                <p className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Historical mastery tracking, sprint consistency, and trend benchmarking
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onOpenSprint && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSprint();
                  }}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-xs uppercase tracking-wider shadow-md hover:brightness-110 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log Sprint</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className={`p-2 rounded-xl transition cursor-pointer ${
                  isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-gray-100 text-slate-500 hover:text-slate-900'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-left custom-scrollbar">
            {/* Top KPI Comparison Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {/* Window Accuracy */}
              <div className={`p-4 rounded-2xl border ${isDark ? 'neu-pressed-dark border-gray-800' : 'neu-pressed-light border-white/80'}`}>
                <span className={`text-[9px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
                  {timeframe === 'all' ? 'All-Time Accuracy' : `Accuracy (${timeframe.toUpperCase()})`}
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className={`text-2xl font-black font-mono ${
                    windowStats.accuracy !== null
                      ? windowStats.accuracy >= 75
                        ? 'text-emerald-500'
                        : windowStats.accuracy >= 60
                        ? 'text-amber-500'
                        : 'text-rose-500'
                      : 'text-slate-400'
                  }`}>
                    {windowStats.accuracy !== null ? `${windowStats.accuracy}%` : 'N/A'}
                  </span>
                  {windowStats.accDelta !== null && (
                    <span className={`text-[10px] font-extrabold font-mono flex items-center ${
                      windowStats.accDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {windowStats.accDelta >= 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                      {windowStats.accDelta >= 0 ? `+${windowStats.accDelta}%` : `${windowStats.accDelta}%`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[8.5px] font-mono text-slate-400">
                  <span>🟢 {windowStats.totalCorrect} Right</span>
                  <span>🔴 {windowStats.totalIncorrect} Wrong</span>
                </div>
              </div>

              {/* Questions Solved */}
              <div className={`p-4 rounded-2xl border ${isDark ? 'neu-pressed-dark border-gray-800' : 'neu-pressed-light border-white/80'}`}>
                <span className={`text-[9px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
                  Questions Solved
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black font-mono text-sky-400">
                    {windowStats.totalQs}
                  </span>
                  <span className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    (~{windowStats.avgDailyQs}/day)
                  </span>
                </div>
                <div className="mt-1.5 text-[8.5px] font-bold text-slate-400">
                  Across {windowStats.activeDaysCount} active days
                </div>
              </div>

              {/* Mastery Benchmark Hit Rate */}
              <div className={`p-4 rounded-2xl border ${isDark ? 'neu-pressed-dark border-gray-800' : 'neu-pressed-light border-white/80'}`}>
                <span className={`text-[9px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
                  Mastery Rate (≥75%)
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    {windowStats.masteryPct}%
                  </span>
                  <span className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    ({windowStats.masteryDaysCount} days)
                  </span>
                </div>
                <div className="mt-1.5 text-[8.5px] font-bold text-slate-400">
                  Goal: &ge;75% benchmark standard
                </div>
              </div>

              {/* All-Time Historical Base */}
              <div className={`p-4 rounded-2xl border ${isDark ? 'neu-pressed-dark border-gray-800' : 'neu-pressed-light border-white/80'}`}>
                <span className={`text-[9px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
                  All-Time Total Logged
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black font-mono text-amber-400">
                    {globalStats.allTimeQs}
                  </span>
                  <span className={`text-[10px] font-bold font-mono ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {globalStats.allTimeAcc !== null ? `(${globalStats.allTimeAcc}% avg)` : ''}
                  </span>
                </div>
                <div className="mt-1.5 text-[8.5px] font-bold text-slate-400">
                  {globalStats.totalSprintSessions} total sprint sessions
                </div>
              </div>
            </div>

            {/* Interactive Trend Chart Card */}
            <div className={`p-5 rounded-3xl border ${isDark ? 'neu-card-dark border-gray-800' : 'neu-card-light border-white/80'}`}>
              {/* Chart Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-500" />
                  <h3 className="text-xs font-black uppercase tracking-wider">
                    Accuracy & Volume Historical Trajectory
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Timeframe Switcher */}
                  <div className={`flex items-center p-1 rounded-xl gap-1 select-none ${
                    isDark ? 'neu-pressed-dark border border-gray-800' : 'neu-pressed-light border border-white/80'
                  }`}>
                    {[
                      { id: '7d', label: '7D' },
                      { id: '14d', label: '14D' },
                      { id: '30d', label: '30D' },
                      { id: '90d', label: '90D' },
                      { id: 'all', label: 'ALL' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setTimeframe(tab.id)}
                        className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                          timeframe === tab.id
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm'
                            : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Chart Mode */}
                  <div className={`flex items-center p-1 rounded-xl gap-1 select-none ${
                    isDark ? 'neu-pressed-dark border border-gray-800' : 'neu-pressed-light border border-white/80'
                  }`}>
                    {[
                      { id: 'combo', label: 'Combo' },
                      { id: 'accuracy', label: 'Accuracy' },
                      { id: 'volume', label: 'Volume' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setChartMode(tab.id)}
                        className={`px-2 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                          chartMode === tab.id
                            ? (isDark ? 'bg-slate-700 text-amber-300' : 'bg-white text-orange-600 shadow-sm')
                            : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chart SVG Rendering */}
              {filteredDailyLogs.length === 0 ? (
                <div className={`h-[220px] flex flex-col items-center justify-center text-center p-6 rounded-2xl ${
                  isDark ? 'neu-pressed-dark border border-gray-800' : 'bg-gray-50/50 border border-dashed border-gray-200'
                }`}>
                  <BookOpen className={`w-8 h-8 mb-2 ${isDark ? 'text-slate-600' : 'text-gray-300'}`} />
                  <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
                    No QBank activity found for this timeframe
                  </span>
                </div>
              ) : (
                <div className="relative w-full">
                  <div className={`h-[230px] w-full rounded-2xl border p-2 relative overflow-visible ${
                    isDark ? 'neu-pressed-dark border-gray-800' : 'neu-pressed-light border-white/80'
                  }`}>
                    <svg className="w-full h-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="qbank-accuracy-glow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.30" />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Reference Grid Lines */}
                      <line x1={paddingX} y1={paddingY} x2={chartWidth - paddingX} y2={paddingY} stroke={isDark ? '#2d3440' : '#f1f5f9'} strokeWidth="1" />
                      <line x1={paddingX} y1={y75Target} x2={chartWidth - paddingX} y2={y75Target} stroke="#10b981" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.6" />
                      <line x1={paddingX} y1={y60Target} x2={chartWidth - paddingX} y2={y60Target} stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
                      <line x1={paddingX} y1={chartHeight - paddingY} x2={chartWidth - paddingX} y2={chartHeight - paddingY} stroke={isDark ? '#374151' : '#e2e8f0'} strokeWidth="1.5" />

                      {/* Reference Labels placed cleanly on left with non-overlapping layout */}
                      <text x={paddingX + 4} y={y75Target - 4} fill="#10b981" fontSize="8" fontWeight="bold" fontFamily="monospace">
                        75% Mastery Target
                      </text>
                      <text x={paddingX + 4} y={y60Target - 4} fill="#f59e0b" fontSize="8" fontWeight="bold" fontFamily="monospace" opacity="0.8">
                        60% Baseline
                      </text>

                      {/* Question Volume Stacked Bars (Visible in 'combo' and 'volume' mode) */}
                      {(chartMode === 'combo' || chartMode === 'volume') && points.map((p, idx) => {
                        const total = p.data.questions;
                        const c = p.data.correct;
                        const i = p.data.incorrect;
                        const barW = Math.max(6, Math.min(22, (plotWidth / points.length) * 0.45));
                        const cRatio = (c + i) > 0 ? (c / (c + i)) : 1;
                        const iRatio = (c + i) > 0 ? (i / (c + i)) : 0;

                        const correctBarH = p.barHeight * cRatio;
                        const incorrectBarH = p.barHeight * iRatio;

                        return (
                          <g key={`bar-${idx}`} className="cursor-pointer">
                            {/* Correct Bar (Emerald) */}
                            <rect
                              x={p.x - barW / 2}
                              y={chartHeight - paddingY - correctBarH}
                              width={barW}
                              height={correctBarH}
                              fill="#10b981"
                              opacity={chartMode === 'combo' ? 0.45 : 0.85}
                              rx={1.5}
                            />
                            {/* Incorrect Bar (Rose) */}
                            {incorrectBarH > 0 && (
                              <rect
                                x={p.x - barW / 2}
                                y={chartHeight - paddingY - p.barHeight}
                                width={barW}
                                height={incorrectBarH}
                                fill="#f43f5e"
                                opacity={chartMode === 'combo' ? 0.45 : 0.85}
                                rx={1.5}
                              />
                            )}
                          </g>
                        );
                      })}

                      {/* Accuracy Area & Line Curve (Visible in 'combo' and 'accuracy' mode) */}
                      {(chartMode === 'combo' || chartMode === 'accuracy') && (
                        <>
                          {accuracyAreaPath && <path d={accuracyAreaPath} fill="url(#qbank-accuracy-glow)" />}
                          {accuracyLinePath && (
                            <path
                              d={accuracyLinePath}
                              fill="none"
                              stroke="#f59e0b"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}
                        </>
                      )}

                      {/* Interactive Data Nodes */}
                      {points.map((p, idx) => {
                        const isHovered = hoveredPoint && hoveredPoint.data.dateStr === p.data.dateStr;
                        const acc = p.data.accuracy;
                        const dotColor = acc !== null
                          ? (acc >= 75 ? '#10b981' : acc >= 60 ? '#f59e0b' : '#f43f5e')
                          : '#64748b';

                        return (
                          <g key={`node-${idx}`}>
                            <circle
                              cx={p.x}
                              cy={chartMode === 'volume' ? p.barY : p.accY}
                              r={isHovered ? 6.5 : 4}
                              fill={dotColor}
                              stroke={isDark ? '#1e242d' : '#ffffff'}
                              strokeWidth="2"
                              className="cursor-pointer transition-all duration-150"
                              onMouseEnter={() => setHoveredPoint(p)}
                              onMouseLeave={() => setHoveredPoint(null)}
                            />
                          </g>
                        );
                      })}
                    </svg>

                    {/* Floating Rich Tooltip */}
                    {hoveredPoint && (
                      <div
                        className="absolute bottom-full mb-3 bg-gray-900 text-white text-[9.5px] font-bold p-3 rounded-2xl shadow-2xl pointer-events-none z-50 border border-amber-500/40 min-w-[150px] text-left transform -translate-x-1/2"
                        style={{
                          left: `${Math.max(10, Math.min(90, (hoveredPoint.x / chartWidth) * 100))}%`,
                          top: `${Math.max(10, (hoveredPoint.accY / chartHeight) * 100 - 30)}%`
                        }}
                      >
                        <div className="font-extrabold text-[10.5px] text-amber-400 border-b border-gray-700 pb-1 mb-1 flex items-center justify-between">
                          <span>📅 {formatAppDate ? formatAppDate(hoveredPoint.data.dateStr) : hoveredPoint.data.dateStr}</span>
                          <span className="text-[8px] text-slate-400">{hoveredPoint.data.sessionCount} sprint{hoveredPoint.data.sessionCount === 1 ? '' : 's'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-slate-200 mt-1">
                          <span>Total Qs:</span>
                          <span className="font-mono text-white font-extrabold">{hoveredPoint.data.questions}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-emerald-400 mt-0.5">
                          <span>🟢 Correct:</span>
                          <span className="font-mono font-extrabold">{hoveredPoint.data.correct}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-rose-400 mt-0.5">
                          <span>🔴 Incorrect:</span>
                          <span className="font-mono font-extrabold">{hoveredPoint.data.incorrect}</span>
                        </div>
                        {hoveredPoint.data.accuracy !== null && (
                          <div className="flex items-center justify-between gap-3 border-t border-gray-700/80 mt-1 pt-1 text-amber-300">
                            <span>🎯 Accuracy:</span>
                            <span className="font-mono font-black">{hoveredPoint.data.accuracy}%</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* X-Axis Date Range Footer */}
                  <div className={`flex justify-between items-center px-4 mt-2 text-[9px] font-mono select-none ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
                    <span>{formatAppDate ? formatAppDate(filteredDailyLogs[0]?.dateStr) : filteredDailyLogs[0]?.dateStr}</span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Accuracy % Curve</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500/60" /> Correct Qs</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500/60" /> Incorrect Qs</span>
                    </div>
                    <span>{formatAppDate ? formatAppDate(filteredDailyLogs[filteredDailyLogs.length - 1]?.dateStr) : filteredDailyLogs[filteredDailyLogs.length - 1]?.dateStr}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Historical Sprint Sessions Logbook */}
            <div className={`p-5 rounded-3xl border ${isDark ? 'neu-card-dark border-gray-800' : 'neu-card-light border-white/80'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-orange-500" />
                  <h3 className="text-xs font-black uppercase tracking-wider">
                    Historical Sprint Sessions Logbook ({filteredSessions.length})
                  </h3>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Search */}
                  <div className={`flex items-center px-2.5 py-1 rounded-xl border gap-1.5 ${
                    isDark ? 'bg-slate-900/60 border-gray-800' : 'bg-white border-gray-200'
                  }`}>
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search subject/date..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className={`bg-transparent text-[10px] font-bold focus:outline-none w-28 sm:w-36 ${
                        isDark ? 'text-white' : 'text-slate-800'
                      }`}
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Subject Filter */}
                  {availableSubjects.length > 0 && (
                    <select
                      value={subjectFilter}
                      onChange={e => setSubjectFilter(e.target.value)}
                      className={`text-[9.5px] font-bold px-2 py-1 rounded-xl border focus:outline-none cursor-pointer ${
                        isDark ? 'bg-slate-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-slate-700'
                      }`}
                    >
                      <option value="ALL">All Subjects</option>
                      {availableSubjects.map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  )}

                  {/* Platform Filter */}
                  {availablePlatforms.length > 0 && (
                    <select
                      value={platformFilter}
                      onChange={e => setPlatformFilter(e.target.value)}
                      className={`text-[9.5px] font-bold px-2 py-1 rounded-xl border focus:outline-none cursor-pointer ${
                        isDark ? 'bg-slate-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-slate-700'
                      }`}
                    >
                      <option value="ALL">All Platforms</option>
                      {availablePlatforms.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Sessions List */}
              {filteredSessions.length === 0 ? (
                <div className={`p-6 rounded-2xl text-center text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  No sprint sessions match the current filters.
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                  {filteredSessions.map(session => {
                    const acc = session.accuracy;
                    const accBadgeColor = acc !== null
                      ? acc >= 75
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : acc >= 60
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : 'bg-slate-500/20 text-slate-400 border-slate-500/40';

                    const cPct = session.questions > 0 ? (session.correct / session.questions) * 100 : 0;
                    const iPct = session.questions > 0 ? (session.incorrect / session.questions) * 100 : 0;

                    return (
                      <div
                        key={session.id}
                        className={`p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all hover:scale-[1.005] ${
                          isDark ? 'neu-pressed-dark border-gray-800/80 hover:border-amber-500/30' : 'neu-pressed-light border-white/80 hover:border-amber-300'
                        }`}
                      >
                        {/* Left: Date, Subject & Platform */}
                        <div className="flex items-center gap-3">
                          <div className={`px-2.5 py-1 rounded-xl text-center font-mono text-[9px] font-black shrink-0 ${
                            isDark ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-orange-50 text-orange-700 border border-orange-200'
                          }`}>
                            {formatAppDate ? formatAppDate(session.dateStr) : session.dateStr}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-white">{session.subject}</span>
                              <span className={`text-[8.5px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                                isDark ? 'bg-slate-800/80 text-amber-400' : 'bg-gray-100 text-amber-700'
                              }`}>
                                {session.platform}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[8.5px] text-slate-400 mt-0.5">
                              <span>Mode: {session.mode}</span>
                              {session.duration > 0 && <span>⏱️ {Math.round(session.duration)} mins</span>}
                            </div>
                          </div>
                        </div>

                        {/* Right: Accuracy & Mini Bar */}
                        <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end">
                          {/* Mini Progress Bar */}
                          <div className="w-24 sm:w-32 flex flex-col gap-1">
                            <div className="h-2 rounded-full overflow-hidden flex bg-slate-800/60">
                              <div style={{ width: `${cPct}%` }} className="bg-emerald-500" title={`Correct: ${session.correct}`} />
                              <div style={{ width: `${iPct}%` }} className="bg-rose-500" title={`Incorrect: ${session.incorrect}`} />
                            </div>
                            <div className="flex justify-between text-[8px] font-mono text-slate-400">
                              <span className="text-emerald-400 font-bold">{session.correct} Right</span>
                              <span className="text-rose-400 font-bold">{session.incorrect} Wrong</span>
                            </div>
                          </div>

                          {/* Accuracy Badge */}
                          <div className={`px-3 py-1.5 rounded-xl border text-[11px] font-black font-mono tracking-wider min-w-[65px] text-center ${accBadgeColor}`}>
                            {acc !== null ? `${acc}%` : `${session.questions} Qs`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className={`px-6 py-3 border-t flex items-center justify-between shrink-0 ${
            isDark ? 'border-gray-800/80 bg-[#1e242d]/80' : 'border-gray-200/80 bg-white/80'
          }`}>
            <div className={`text-[9.5px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Showing {filteredDailyLogs.length} active QBank days ({filteredSessions.length} sprint logs)
            </div>
            <div className="flex items-center gap-3">
              {onOpenSprint && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSprint();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] uppercase tracking-wider shadow cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Log Sprint</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer border ${
                  isDark
                    ? 'border-gray-700 text-slate-300 hover:bg-slate-800'
                    : 'border-gray-300 text-slate-700 hover:bg-gray-100'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

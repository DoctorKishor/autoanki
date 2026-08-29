import React from 'react';
import { motion } from 'framer-motion';
import { Target, Award, AlertCircle, CheckCircle2, Plus, Sparkles, ChevronRight, BookOpen, Flame } from 'lucide-react';
import { computeSubjectAccuracyData } from '../utils/subjectAccuracy';

export default function SubjectWiseAccuracyCard({
  isDark,
  studyLogs,
  subjectAccuracyTimeframe = 'all',
  setSubjectAccuracyTimeframe,
  subjectAccuracySort = 'weakest',
  setSubjectAccuracySort,
  onOpenSprint,
  isMobile = false
}) {
  const data = React.useMemo(() => {
    return computeSubjectAccuracyData(studyLogs, subjectAccuracyTimeframe, subjectAccuracySort);
  }, [studyLogs, subjectAccuracyTimeframe, subjectAccuracySort]);

  const { subjects, totalQs, overallAccuracy, weakCount, masteryCount } = data;

  const timeframeOptions = [
    { id: '7d', label: '7D' },
    { id: '30d', label: '30D' },
    { id: 'all', label: 'ALL' }
  ];

  const sortOptions = [
    { id: 'weakest', label: isMobile ? 'Weakest' : 'Weak Spots First' },
    { id: 'volume', label: isMobile ? 'Volume' : 'Most Questions' },
    { id: 'highest', label: isMobile ? 'Top Acc' : 'Highest Accuracy' }
  ];

  const activeTimeframeIndex = timeframeOptions.findIndex(o => o.id === subjectAccuracyTimeframe);
  const activeSortIndex = sortOptions.findIndex(o => o.id === subjectAccuracySort);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
      className={`rounded-3xl ${isMobile ? 'p-4 space-y-4' : 'p-6 space-y-5'} ${
        isDark ? 'neu-card-dark' : 'neu-card-light'
      }`}
    >
      {/* Top Header */}
      <div className={`flex ${isMobile ? 'flex-col gap-3' : 'items-center justify-between gap-4 flex-wrap'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
            isDark ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-amber-50 text-amber-600 border border-amber-200'
          }`}>
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`text-sm font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Subject-Wise Accuracy & Yield Matrix
              </h3>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full font-black bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-500 border border-amber-500/30">
                QBank Analytics
              </span>
            </div>
            <p className={`text-[11px] font-semibold mt-0.5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              High-yield mastery & weak-spot diagnostics across platforms
            </p>
          </div>
        </div>

        {/* Filter & Sort Controls */}
        <div className={`flex items-center gap-2.5 ${isMobile ? 'justify-between w-full flex-wrap' : ''}`}>
          {/* Timeframe Switcher */}
          <div className={`relative flex items-center p-1 rounded-xl gap-0.5 shrink-0 select-none ${
            isDark ? 'neu-pressed-dark border border-gray-800/80' : 'neu-pressed-light border border-white/80'
          }`}>
            <div
              className="absolute top-1 bottom-1 rounded-lg shadow-sm bg-gradient-to-r from-amber-500 to-orange-500"
              style={{
                width: isMobile ? '2.2rem' : '2.5rem',
                left: `calc(0.25rem + ${activeTimeframeIndex * (isMobile ? 2.3 : 2.6)}rem)`,
                transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
              }}
            />
            {timeframeOptions.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSubjectAccuracyTimeframe && setSubjectAccuracyTimeframe(opt.id)}
                style={{ width: isMobile ? '2.2rem' : '2.5rem' }}
                className={`relative py-1 text-[9px] font-black uppercase tracking-wider rounded-lg cursor-pointer select-none flex items-center justify-center z-10 transition-colors ${
                  subjectAccuracyTimeframe === opt.id
                    ? 'text-white font-extrabold'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Sort Switcher */}
          <div className={`relative flex items-center p-1 rounded-xl gap-0.5 shrink-0 select-none ${
            isDark ? 'neu-pressed-dark border border-gray-800/80' : 'neu-pressed-light border border-white/80'
          }`}>
            <div
              className="absolute top-1 bottom-1 rounded-lg shadow-sm bg-gradient-to-r from-blue-500 to-indigo-500"
              style={{
                width: isMobile ? '4.2rem' : '5.8rem',
                left: `calc(0.25rem + ${activeSortIndex * (isMobile ? 4.3 : 5.9)}rem)`,
                transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
              }}
            />
            {sortOptions.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSubjectAccuracySort && setSubjectAccuracySort(opt.id)}
                style={{ width: isMobile ? '4.2rem' : '5.8rem' }}
                className={`relative py-1 text-[8.5px] font-black uppercase tracking-wider rounded-lg cursor-pointer select-none flex items-center justify-center z-10 transition-colors ${
                  subjectAccuracySort === opt.id
                    ? 'text-white font-extrabold'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* New Sprint Quick Action */}
          <button
            type="button"
            onClick={() => onOpenSprint && onOpenSprint()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer shadow-md ${
              isDark
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                : 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/30'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Sprint</span>
          </button>
        </div>
      </div>

      {/* KPI Highlights Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className={`p-3 rounded-2xl ${isDark ? 'neu-pressed-dark border border-gray-800' : 'neu-pressed-light border border-white/60'}`}>
          <span className={`text-[9px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            Subjects Studied
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className={`text-base sm:text-lg font-black font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {subjects.length}
            </span>
            <span className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
              / {totalQs} Qs
            </span>
          </div>
        </div>

        <div className={`p-3 rounded-2xl ${isDark ? 'neu-pressed-dark border border-gray-800' : 'neu-pressed-light border border-white/60'}`}>
          <span className={`text-[9px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            Overall Accuracy
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className={`text-base sm:text-lg font-black font-mono ${
              overallAccuracy === null
                ? isDark ? 'text-slate-400' : 'text-gray-400'
                : overallAccuracy >= 75 ? 'text-emerald-500' : overallAccuracy >= 60 ? 'text-amber-500' : 'text-rose-500'
            }`}>
              {overallAccuracy !== null ? `${overallAccuracy}%` : 'N/A'}
            </span>
            <span className={`text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
              {overallAccuracy !== null ? (overallAccuracy >= 75 ? 'Mastery' : overallAccuracy >= 60 ? 'Retention' : 'Review') : 'No data'}
            </span>
          </div>
        </div>

        <div className={`p-3 rounded-2xl ${isDark ? 'neu-pressed-dark border border-gray-800' : 'neu-pressed-light border border-white/60'}`}>
          <span className={`text-[9px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            Weak Spots (&lt;60%)
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-base sm:text-lg font-black font-mono text-rose-500">
              {weakCount}
            </span>
            <span className="text-[9px] font-bold text-rose-400">
              {weakCount > 0 ? 'Urgent focus' : 'Zero weak spots'}
            </span>
          </div>
        </div>

        <div className={`p-3 rounded-2xl ${isDark ? 'neu-pressed-dark border border-gray-800' : 'neu-pressed-light border border-white/60'}`}>
          <span className={`text-[9px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            Mastered (&ge;75%)
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-base sm:text-lg font-black font-mono text-emerald-500">
              {masteryCount}
            </span>
            <span className="text-[9px] font-bold text-emerald-400">
              High yield
            </span>
          </div>
        </div>
      </div>

      {/* Target Reference Legend */}
      <div className={`flex items-center justify-between text-[9.5px] font-bold px-1 select-none flex-wrap gap-2 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
            <span>&ge; 75% High Mastery</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs shadow-amber-500/50" />
            <span>60 - 74% Retention</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-xs shadow-rose-500/50" />
            <span>&lt; 60% Weak Spot</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-amber-500 font-mono">
          <span className="w-3 h-0.5 border-t-2 border-dashed border-amber-500" />
          <span>75% Exam Benchmark</span>
        </div>
      </div>

      {/* Subject Rows Container */}
      {subjects.length === 0 ? (
        <div className={`py-12 px-4 rounded-2xl flex flex-col items-center justify-center text-center ${
          isDark ? 'neu-pressed-dark border border-gray-800' : 'bg-gray-50/50 border border-dashed border-gray-200'
        }`}>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${
            isDark ? 'bg-slate-800 text-slate-400' : 'bg-gray-100 text-gray-400'
          }`}>
            <BookOpen className="w-6 h-6" />
          </div>
          <h4 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
            No QBank Sprints Recorded for this Timeframe
          </h4>
          <p className={`text-[11px] max-w-sm mt-1 mb-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            Log practice sprints with subject tags and accuracy in the Universal QBank Modal to unlock automated mastery matrix diagnostics.
          </p>
          <button
            type="button"
            onClick={() => onOpenSprint && onOpenSprint()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 cursor-pointer transition"
          >
            <Plus className="w-4 h-4" />
            <span>Log First QBank Sprint</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {subjects.map((sub, idx) => {
            const isMixed = sub.name === 'Mixed / All Subjects';
            const totalBar = sub.totalRated > 0 ? sub.totalRated : (sub.questions > 0 ? sub.questions : 1);
            const correctPct = (sub.correct / totalBar) * 100;
            const incorrectPct = (sub.incorrect / totalBar) * 100;
            const remainderPct = Math.max(0, 100 - correctPct - incorrectPct);

            let statusBadge = null;
            if (sub.accuracy !== null) {
              if (sub.accuracy >= 75) {
                statusBadge = (
                  <span className="flex items-center gap-1 text-[9.5px] font-black px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{sub.accuracy}% Mastery</span>
                  </span>
                );
              } else if (sub.accuracy >= 60) {
                statusBadge = (
                  <span className="flex items-center gap-1 text-[9.5px] font-black px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/30">
                    <Award className="w-3 h-3" />
                    <span>{sub.accuracy}% Retention</span>
                  </span>
                );
              } else {
                statusBadge = (
                  <span className="flex items-center gap-1 text-[9.5px] font-black px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-500 border border-rose-500/30 animate-pulse">
                    <AlertCircle className="w-3 h-3" />
                    <span>{sub.accuracy}% Weak Spot</span>
                  </span>
                );
              }
            } else {
              statusBadge = (
                <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-400 border border-slate-500/20">
                  Unrated
                </span>
              );
            }

            return (
              <motion.div
                key={sub.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.03 }}
                onClick={() => onOpenSprint && onOpenSprint(sub.name)}
                className={`p-3.5 rounded-2xl transition-all cursor-pointer group border ${
                  isMixed
                    ? isDark
                      ? 'neu-card-dark hover:border-amber-500/50 border-amber-500/30'
                      : 'neu-card-light hover:border-amber-400 border-amber-300'
                    : isDark
                      ? 'neu-card-dark hover:border-gray-700 border-gray-800/80'
                      : 'neu-card-light hover:border-gray-300 border-gray-200/80'
                }`}
                title={`Click to log sprint for ${sub.name}`}
              >
                {/* Row Header */}
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    {isMixed ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-xs font-black text-amber-500 truncate">
                          Mixed / All Subjects
                        </span>
                        <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 shrink-0">
                          Full Syllabus Mocks
                        </span>
                      </div>
                    ) : (
                      <span className={`text-xs font-black truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {sub.name}
                      </span>
                    )}

                    <span className={`text-[10px] font-bold font-mono shrink-0 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                      · {sub.questions} Qs ({sub.sessionsCount} sprint{sub.sessionsCount > 1 ? 's' : ''})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {statusBadge}
                    <div className={`p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${
                      isDark ? 'bg-gray-800 text-amber-400' : 'bg-gray-100 text-amber-600'
                    }`}>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                {/* Progress Bar with 75% Target Marker */}
                <div className="relative w-full h-3 rounded-full overflow-hidden bg-black/25 p-0.5">
                  <div className="relative w-full h-full flex rounded-full overflow-hidden">
                    {correctPct > 0 && (
                      <div
                        style={{ width: `${correctPct}%` }}
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                        title={`Correct: ${sub.correct} (${correctPct.toFixed(1)}%)`}
                      />
                    )}
                    {incorrectPct > 0 && (
                      <div
                        style={{ width: `${incorrectPct}%` }}
                        className="h-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-500"
                        title={`Incorrect: ${sub.incorrect} (${incorrectPct.toFixed(1)}%)`}
                      />
                    )}
                    {remainderPct > 0 && (
                      <div
                        style={{ width: `${remainderPct}%` }}
                        className="h-full bg-slate-500/20 transition-all duration-500"
                        title={`Unrated: ${sub.questions - sub.totalRated} Qs`}
                      />
                    )}
                  </div>

                  {/* 75% Mastery Benchmark Line */}
                  <div
                    className="absolute top-0 bottom-0 left-[75%] w-[2px] bg-amber-400 z-10 pointer-events-none shadow-[0_0_4px_rgba(251,191,36,0.8)]"
                    title="75% Target Mastery Line"
                  />
                </div>

                {/* Row Sub-footer Details */}
                <div className="flex items-center justify-between text-[9px] font-bold mt-1.5 px-0.5">
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-500 font-mono">
                      ✓ {sub.correct} Correct
                    </span>
                    <span className="text-rose-500 font-mono">
                      ✗ {sub.incorrect} Incorrect
                    </span>
                  </div>
                  {sub.accuracy !== null && (
                    <span className={`font-mono ${
                      sub.accuracy >= 75 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {sub.accuracy >= 75
                        ? `+${(sub.accuracy - 75).toFixed(1)}% vs target`
                        : `${(sub.accuracy - 75).toFixed(1)}% vs target`}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

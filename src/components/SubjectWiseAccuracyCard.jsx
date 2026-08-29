import React from 'react';
import { motion } from 'framer-motion';
import { Target, Award, AlertCircle, CheckCircle2, Check, Plus, Sparkles, ChevronRight, BookOpen, Flame } from 'lucide-react';
import { computeSubjectAccuracyData } from '../utils/subjectAccuracy';

export default function SubjectWiseAccuracyCard({
  isDark,
  studyLogs,
  subjectAccuracyTimeframe = 'all',
  setSubjectAccuracyTimeframe,
  subjectAccuracySort = 'weakest',
  setSubjectAccuracySort,
  includeGtQuestions: propIncludeGt,
  onToggleIncludeGt: propOnToggleIncludeGt,
  onOpenSprint,
  isMobile = false
}) {
  const [internalIncludeGt, setInternalIncludeGt] = React.useState(() => {
    try {
      return localStorage.getItem('study_include_gt_accuracy') === 'true';
    } catch (e) {
      return false;
    }
  });

  const includeGt = propIncludeGt !== undefined ? propIncludeGt : internalIncludeGt;

  const handleToggleIncludeGt = () => {
    if (propOnToggleIncludeGt) {
      propOnToggleIncludeGt(!includeGt);
    } else {
      const next = !internalIncludeGt;
      setInternalIncludeGt(next);
      try {
        localStorage.setItem('study_include_gt_accuracy', String(next));
      } catch (e) {}
    }
  };

  const data = React.useMemo(() => {
    return computeSubjectAccuracyData(studyLogs, subjectAccuracyTimeframe, subjectAccuracySort, includeGt);
  }, [studyLogs, subjectAccuracyTimeframe, subjectAccuracySort, includeGt]);

  const { subjects, totalQs, overallAccuracy, weakCount, masteryCount, totalAvailableGtQs } = data;

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
        <div className={`flex items-center gap-2.5 ${isMobile ? 'justify-between w-full flex-wrap' : 'flex-wrap'}`}>
          {/* Include GT questions Tick Box */}
          <button
            type="button"
            onClick={handleToggleIncludeGt}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer select-none border shrink-0 ${
              includeGt
                ? isDark
                  ? 'bg-purple-500/15 border-purple-500/40 text-purple-300 shadow-sm'
                  : 'bg-purple-50 border-purple-300 text-purple-700 shadow-sm'
                : isDark
                  ? 'neu-pressed-dark border-gray-800 text-slate-400 hover:text-slate-200'
                  : 'neu-pressed-light border-gray-200 text-gray-500 hover:text-gray-700'
            }`}
            title={includeGt ? 'Grand Test questions included in accuracy matrix' : 'Click to combine Grand Test (GT) question accuracy with QBank sprints'}
          >
            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center transition-colors shrink-0 ${
              includeGt
                ? 'bg-gradient-to-tr from-purple-600 to-indigo-500 text-white shadow-xs'
                : isDark ? 'border border-slate-600 bg-slate-800/60' : 'border border-gray-300 bg-white'
            }`}>
              {includeGt && <Check className="w-2.5 h-2.5 stroke-[3]" />}
            </div>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span>Include GT questions</span>
              {totalAvailableGtQs > 0 && (
                <span className={`text-[8.5px] px-1 py-0.2 rounded font-mono font-bold ${
                  includeGt
                    ? isDark ? 'bg-purple-500/30 text-purple-200' : 'bg-purple-200 text-purple-800'
                    : isDark ? 'bg-slate-800 text-slate-400' : 'bg-gray-200 text-gray-600'
                }`}>
                  +{totalAvailableGtQs}
                </span>
              )}
            </span>
          </button>

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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer shadow-md shrink-0 ${
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
          <div className="flex items-baseline gap-1.5 mt-1 flex-wrap">
            <span className={`text-base sm:text-lg font-black font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {subjects.length}
            </span>
            <span className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
              / {totalQs} Qs
            </span>
            {includeGt && totalAvailableGtQs > 0 && (
              <span className="text-[9px] font-bold text-purple-400 font-mono">
                ({totalAvailableGtQs} in GTs)
              </span>
            )}
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
            High Mastery (≥75%)
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-base sm:text-lg font-black font-mono text-emerald-500">
              {masteryCount}
            </span>
            <span className={`text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
              subject{masteryCount !== 1 ? 's' : ''}
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
            <span className={`text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
              {weakCount > 0 ? 'needs review' : 'none'}
            </span>
          </div>
        </div>
      </div>

      {/* Subject List Matrix */}
      {subjects.length === 0 ? (
        <div className={`p-8 rounded-2xl text-center flex flex-col items-center justify-center space-y-3 ${
          isDark ? 'neu-pressed-dark border border-gray-800' : 'neu-pressed-light border border-white/80'
        }`}>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
            isDark ? 'bg-gray-800/80 text-amber-400' : 'bg-white text-amber-500 shadow-sm'
          }`}>
            <Target className="w-6 h-6" />
          </div>
          <div>
            <h4 className={`text-sm font-black ${isDark ? 'text-white' : 'text-gray-900'}`}>
              No Subject Accuracy Data Yet
            </h4>
            <p className={`text-xs mt-1 max-w-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              Log question bank sprints with subject tags in the QBank Modal{includeGt ? ' or add Grand Tests with subject marks' : ''} to track your subject-wise accuracy and target weak areas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenSprint && onOpenSprint()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-slate-950 transition cursor-pointer shadow-md"
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
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
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
                      · {sub.questions} Qs ({sub.sessionsCount} {sub.gtQuestions > 0 && sub.sessionsCount > 1 ? 'tests/sprints' : 'sprint' + (sub.sessionsCount > 1 ? 's' : '')})
                    </span>

                    {sub.gtQuestions > 0 && (
                      <span className={`text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        isDark ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-purple-50 text-purple-700 border border-purple-200'
                      }`}>
                        +{sub.gtQuestions} GT
                      </span>
                    )}
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

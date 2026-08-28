import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DEFAULT_FSRS6_WEIGHTS,
  extractReviewDataset,
  optimizeFSRSWeights,
  batchRescheduleAllTopics
} from '../services/fsrsEngine';
import { DEFAULT_FSRS_CONFIG } from '../services/localDb';

export { DEFAULT_FSRS_CONFIG };

// Category Definitions
const CATEGORIES = [
  { id: 'dailyLimits', label: 'Daily Limits', icon: '📊' },
  { id: 'newTopics', label: 'New Topics', icon: '🆕' },
  { id: 'lapses', label: 'Lapses & Leeches', icon: '⚠️' },
  { id: 'displayOrder', label: 'Display Order', icon: '🔀' },
  { id: 'fsrsCore', label: 'FSRS Core', icon: '🧠' },
  { id: 'easyDays', label: 'Easy Days', icon: '🏖️' },
  { id: 'advanced', label: 'Advanced', icon: '🛠️' },
];

// Interactive In-App User Manuals (Adapted for Medical Textbook Topics)
const MANUAL_CONTENTS = {
  dailyLimits: {
    title: "Daily Limits Manual",
    sections: [
      {
        heading: "New topic pages/day",
        content: "The maximum number of new topic pages to introduce in a day. Because new material increases short-term review workload, this should typically be at least 5x to 10x smaller than your review limit."
      },
      {
        heading: "Maximum review pages/day",
        content: "The maximum number of review pages to show in a day. Interday learning topics are gathered first, followed by scheduled review topics."
      },
      {
        heading: "New topics ignore review limit",
        content: "By default, the review limit applies to new topics as well, preventing new topics from appearing once the review page limit is reached. Enabling this allows new topics regardless of review page cap."
      },
      {
        heading: "Limits start from top",
        content: "Controls whether top-level subject daily page caps apply when studying individual sub-topics or sub-modules."
      },
      {
        heading: "Preset Scopes",
        content: "Preset: Applies limit to all subjects using this preset.\nThis Subject: Limit applies specifically to the active subject.\nToday Only: Makes a temporary single-day override."
      }
    ]
  },
  newTopics: {
    title: "New Topics / Chapters Manual",
    sections: [
      {
        heading: "Learning steps",
        content: "One or more delays separated by spaces. The first delay will be used when pressing the Again button on a new topic chapter. Passing the step advances the topic to graduate into FSRS. Note for Textbook Chapters: Unlike 1-sentence flashcards where 1-minute steps are used, studying medical textbook chapters requires realistic human timeframes (such as 1 day '1d' or 2 hours '2h')."
      },
      {
        heading: "Insertion order",
        content: "Controls the order new topics are assigned when added from Subject Tracker. Sequential (Book / Page Order) introduces topics in natural page order (Page 1 → Page 50). Random scatters new topics across subjects."
      }
    ]
  },
  lapses: {
    title: "Lapses & Problematic Topics (Leeches) Manual",
    sections: [
      {
        heading: "Relearning steps",
        content: "Delays applied when pressing Again on an existing review topic. Relearning medical textbook chapters requires realistic delays (such as 1 day '1d' or 4 hours '4h')."
      },
      {
        heading: "Leech threshold",
        content: "The number of times Again needs to be pressed on a review topic before it is marked as a Leech. Leeches are difficult topics that consume excessive study time. When flagged, it is recommended to revise notes or create mnemonics."
      },
      {
        heading: "Leech action",
        content: "Tag Only: Adds a Leech tag to the topic in Subject Tracker.\nSuspend Topic: Tags the topic AND temporarily removes it from daily review queues until manually unsuspended."
      }
    ]
  },
  displayOrder: {
    title: "Display Order & Queue Priority Manual",
    sections: [
      {
        heading: "New topic gather order",
        content: "Gathers new textbook topics into today's queue. Subject Curriculum Order gathers subject-by-subject in medical curriculum order. Ascending Page Position gathers from earliest textbook pages."
      },
      {
        heading: "New/review order",
        content: "Controls when new topics appear relative to review topics. Show after reviews completes all due reviews first (recommended to avoid review backlog)."
      },
      {
        heading: "Review sort order",
        content: "Controls how due review topics are prioritized. Due date then random prioritizes topics waiting longest (FSRS urgency order)."
      }
    ]
  },
  fsrsCore: {
    title: "FSRS Core & Parameters Manual",
    sections: [
      {
        heading: "FSRS Master Switch",
        content: "Enables the FSRS-6 algorithm. When turned off, traditional fixed interval scheduling is used."
      },
      {
        heading: "Desired Retention (DR)",
        content: "FSRS schedules topics so you have a target chance (e.g. 90%) of remembering them when due. Higher retention values schedule topics more frequently (boosting retention but increasing workload). Lower retention spaces topics further apart."
      },
      {
        heading: "FSRS Parameters",
        content: "21 parameters (w0..w20) control memory stability and difficulty updates. Can be edited manually, imported via JSON, or optimized automatically from your study history in IndexedDB."
      }
    ]
  },
  easyDays: {
    title: "Easy Days Manual",
    sections: [
      {
        heading: "Weekly Workload Balancer",
        content: "Allows reducing or minimizing review workload on selected days of the week. Setting a day to Minimum or Reduced instructs the load-balancing fuzzing engine to shift candidate review topics to adjacent days with normal capacity."
      }
    ]
  },
  advanced: {
    title: "Advanced Engine Rules Manual",
    sections: [
      {
        heading: "Maximum interval",
        content: "The maximum number of days a review topic will wait. Setting maximum interval less than 180 days is not recommended as it increases daily review workload significantly."
      },
      {
        heading: "Historical retention",
        content: "When review history is incomplete, FSRS fills the gaps assuming past baseline retention was 90%."
      }
    ]
  }
};

export default function FsrsSettingsModal({
  isOpen,
  onClose,
  fsrsConfig,
  onSaveConfig,
  themeMode = 'dark',
  subjectTrackerData = [],
  studyLogs = {},
  onRescheduleAll
}) {
  const isDark = themeMode === 'dark';
  const [activeCategory, setActiveCategory] = useState('dailyLimits');
  const [activeScopeTab, setActiveScopeTab] = useState('preset');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [activeManualSection, setActiveManualSection] = useState(null);
  const [tempConfig, setTempConfig] = useState(fsrsConfig || {});
  const [weightsText, setWeightsText] = useState((fsrsConfig?.weights || DEFAULT_FSRS6_WEIGHTS).join(', '));

  // Optimization & Rescheduling States
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeStats, setOptimizeStats] = useState(null);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleResultToast, setRescheduleResultToast] = useState(null);

  // Extract review dataset for optimization
  const reviewDataset = useMemo(() => {
    return extractReviewDataset(studyLogs, subjectTrackerData);
  }, [studyLogs, subjectTrackerData]);

  const MIN_REVIEWS_FOR_OPTIMIZE = 50;
  const reviewCount = reviewDataset.length;
  const isOptimizeLocked = reviewCount < MIN_REVIEWS_FOR_OPTIMIZE;

  const todayStr = React.useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const initialConfigRef = useRef(null);
  const isResetRef = useRef(false);

  // Update temp state when modal opens or fsrsConfig changes
  React.useEffect(() => {
    if (fsrsConfig && isOpen) {
      initialConfigRef.current = JSON.parse(JSON.stringify(fsrsConfig));
      setTempConfig(JSON.parse(JSON.stringify(fsrsConfig)));
      setWeightsText((fsrsConfig.weights || DEFAULT_FSRS6_WEIGHTS).join(', '));
      isResetRef.current = false;
    }
  }, [fsrsConfig, isOpen]);

  // Set default selected subject when subjectTrackerData changes
  React.useEffect(() => {
    if (subjectTrackerData && subjectTrackerData.length > 0 && !selectedSubject) {
      setSelectedSubject(subjectTrackerData[0]?.subject || '');
    }
  }, [subjectTrackerData, selectedSubject]);

  if (!isOpen) return null;

  const handleSave = () => {
    const nowIso = new Date().toISOString();
    const prev = initialConfigRef.current || {};
    const existingTimestamps = { ...(prev.timestamps || {}), ...(tempConfig.timestamps || {}) };
    const newTimestamps = { ...existingTimestamps };

    // If Reset Defaults was triggered, stamp ALL sections with the new timestamp
    if (isResetRef.current) {
      newTimestamps.dailyLimits = nowIso;
      newTimestamps.newTopics = nowIso;
      newTimestamps.lapses = nowIso;
      newTimestamps.displayOrder = nowIso;
      newTimestamps.easyDays = nowIso;
      newTimestamps.advancedRules = nowIso;
      newTimestamps.perSubjectRetention = nowIso;
      newTimestamps.weights = nowIso;
      newTimestamps.globalDesiredRetention = nowIso;
      newTimestamps.retentionMode = nowIso;
      newTimestamps.enabled = nowIso;
    } else {
      // Granularly detect which section was modified and stamp only the modified sections
      if (JSON.stringify(tempConfig.dailyLimits) !== JSON.stringify(prev.dailyLimits)) {
        newTimestamps.dailyLimits = nowIso;
      }
      if (JSON.stringify(tempConfig.newTopics) !== JSON.stringify(prev.newTopics)) {
        newTimestamps.newTopics = nowIso;
      }
      if (JSON.stringify(tempConfig.lapses) !== JSON.stringify(prev.lapses)) {
        newTimestamps.lapses = nowIso;
      }
      if (JSON.stringify(tempConfig.displayOrder) !== JSON.stringify(prev.displayOrder)) {
        newTimestamps.displayOrder = nowIso;
      }
      if (JSON.stringify(tempConfig.easyDays) !== JSON.stringify(prev.easyDays)) {
        newTimestamps.easyDays = nowIso;
      }
      if (JSON.stringify(tempConfig.advancedRules) !== JSON.stringify(prev.advancedRules)) {
        newTimestamps.advancedRules = nowIso;
      }
      if (JSON.stringify(tempConfig.perSubjectRetention) !== JSON.stringify(prev.perSubjectRetention)) {
        newTimestamps.perSubjectRetention = nowIso;
      }
      if (JSON.stringify(tempConfig.weights) !== JSON.stringify(prev.weights)) {
        newTimestamps.weights = nowIso;
      }
      if (tempConfig.globalDesiredRetention !== prev.globalDesiredRetention) {
        newTimestamps.globalDesiredRetention = nowIso;
      }
      if (tempConfig.retentionMode !== prev.retentionMode) {
        newTimestamps.retentionMode = nowIso;
      }
      if (tempConfig.enabled !== prev.enabled) {
        newTimestamps.enabled = nowIso;
      }
      // If none changed but save was clicked, ensure active category is stamped
      if (Object.keys(newTimestamps).length === 0) {
        newTimestamps[activeCategory] = nowIso;
      }
    }

    onSaveConfig({
      ...tempConfig,
      timestamps: newTimestamps,
      updatedAt: nowIso
    });
    onClose();
  };

  const handleRunOptimizer = () => {
    if (isOptimizeLocked || isOptimizing) return;
    setIsOptimizing(true);
    setOptimizeStats(null);

    // Yield to let UI show spinner
    setTimeout(() => {
      try {
        const res = optimizeFSRSWeights(reviewDataset, tempConfig.weights || DEFAULT_FSRS6_WEIGHTS);
        setTempConfig(prev => ({ ...prev, weights: res.optimizedWeights }));
        setWeightsText(res.optimizedWeights.join(', '));
        setOptimizeStats(res);
      } catch (err) {
        console.error("FSRS Optimization failed:", err);
      } finally {
        setIsOptimizing(false);
      }
    }, 80);
  };

  const handleRunBatchReschedule = async () => {
    if (isRescheduling) return;
    setIsRescheduling(true);
    setRescheduleResultToast(null);

    try {
      if (typeof onRescheduleAll === 'function') {
        const result = await onRescheduleAll(tempConfig);
        const count = result?.rescheduledCount ?? 0;
        setRescheduleResultToast({
          success: true,
          message: `Successfully recalculated intervals & next due dates for ${count} studied topic${count === 1 ? '' : 's'}!`
        });
      } else {
        const res = batchRescheduleAllTopics(subjectTrackerData, studyLogs, tempConfig);
        setRescheduleResultToast({
          success: true,
          message: `Successfully recalculated intervals & next due dates for ${res.rescheduledCount} studied topic${res.rescheduledCount === 1 ? '' : 's'}!`
        });
      }
    } catch (err) {
      console.error("Batch Rescheduling failed:", err);
      setRescheduleResultToast({
        success: false,
        message: "Failed to reschedule topics. Please try again."
      });
    } finally {
      setIsRescheduling(false);
      setTimeout(() => setRescheduleResultToast(null), 5000);
    }
  };

  const getWorkloadLevel = (dr) => {
    if (dr < 0.78) return { label: '🟢 Light Workload', color: 'text-emerald-500', bg: isDark ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200' };
    if (dr <= 0.88) return { label: '🔵 Moderate Workload', color: 'text-sky-500', bg: isDark ? 'bg-sky-500/10 border-sky-500/30' : 'bg-sky-50 border-sky-200' };
    if (dr <= 0.93) return { label: '🟠 Heavy Workload', color: 'text-amber-500', bg: isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200' };
    return { label: '🔴 Extreme / Burnout Risk', color: 'text-rose-500', bg: isDark ? 'bg-rose-500/10 border-rose-500/30' : 'bg-rose-50 border-rose-200' };
  };

  const currentWorkload = getWorkloadLevel(tempConfig.globalDesiredRetention || 0.90);

  // Daily Limits Helpers
  const globalLimits = tempConfig.dailyLimits || {};
  const subjectOverrides = tempConfig.dailyLimits?.subjectOverrides || {};
  const currentSubjectConfig = (selectedSubject && subjectOverrides[selectedSubject]) || {
    enabled: false,
    newPagesPerDay: globalLimits.newPagesPerDay ?? 15,
    maxReviewPagesPerDay: globalLimits.maxReviewPagesPerDay ?? 30
  };

  const todayOverride = tempConfig.dailyLimits?.todayOverride || {
    enabled: false,
    date: todayStr,
    newPagesPerDay: globalLimits.newPagesPerDay ?? 15,
    maxReviewPagesPerDay: globalLimits.maxReviewPagesPerDay ?? 30
  };

  return (
    <AnimatePresence>
      <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 backdrop-blur-md ${isDark ? 'bg-slate-950/80' : 'bg-slate-900/40'}`}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className={`relative w-full max-w-4xl h-[92vh] sm:h-[85vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden border ${
            isDark ? 'bg-[#222730] border-slate-700/60 text-slate-200 neu-card-dark' : 'bg-[#e6ecf5] border-slate-200/80 text-slate-800 neu-card-light'
          }`}
        >
          {/* Header Bar */}
          <div className={`px-4 sm:px-6 py-3 sm:py-4 border-b flex items-center justify-between gap-2 ${isDark ? 'border-slate-700/60 bg-[#222730]' : 'border-slate-200 bg-[#e6ecf5]'}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl sm:text-2xl shrink-0">⚙️</span>
              <div className="min-w-0">
                <h2 className={`text-sm sm:text-xl font-black tracking-wide truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>FSRS Spaced Repetition Settings</h2>
                <p className={`text-[10px] sm:text-xs font-medium truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Configure engine rules, page limits, retention targets & load balancing</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-all shrink-0 cursor-pointer ${isDark ? 'neu-btn-dark text-slate-400 hover:text-white' : 'neu-btn-light text-slate-500 hover:text-slate-900'}`}
            >
              ✕
            </button>
          </div>

          {/* Body Container */}
          <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
            {/* Category Tabs: Horizontal scroll on mobile, vertical sidebar on desktop */}
            <div className={`w-full md:w-56 border-b md:border-b-0 md:border-r p-2 md:p-3 flex md:flex-col gap-1.5 md:space-y-2 overflow-x-auto md:overflow-y-auto no-scrollbar shrink-0 ${
              isDark ? 'border-slate-700/60 bg-[#222730]' : 'border-slate-200 bg-[#e6ecf5]'
            }`}>
              {CATEGORIES.map(cat => {
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex-shrink-0 md:w-full flex items-center gap-2 px-3 py-2 md:px-3.5 md:py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap text-left relative cursor-pointer ${
                      isActive
                        ? isDark ? 'neu-btn-dark text-indigo-400 border border-indigo-500/40 shadow-md' : 'neu-btn-light text-indigo-700 border border-indigo-300/60 shadow-md'
                        : isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 border border-transparent'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span className="flex-1">{cat.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="activeCategoryPill"
                        className={`absolute inset-0 rounded-xl border ${isDark ? 'bg-indigo-500/10 border-indigo-400/30' : 'bg-indigo-500/10 border-indigo-300'}`}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Main Settings Panel */}
            <div className={`flex-1 p-3.5 sm:p-6 overflow-y-auto no-scrollbar space-y-4 sm:space-y-6 ${isDark ? 'bg-[#222730]' : 'bg-[#e6ecf5]'}`}>
              {/* Category Header with Question Mark ? Manual Button */}
              <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-slate-700/40' : 'border-slate-300/60'}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-base sm:text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {CATEGORIES.find(c => c.id === activeCategory)?.icon}{' '}
                    {CATEGORIES.find(c => c.id === activeCategory)?.label}
                  </span>
                </div>
                <button
                  onClick={() => setActiveManualSection(activeCategory)}
                  title="Open In-App User Manual"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    isDark ? 'neu-btn-dark text-indigo-300 border-indigo-500/40' : 'neu-btn-light text-indigo-700 border-indigo-200'
                  }`}
                >
                  <span className="font-black">?</span>
                  <span>User Manual</span>
                </button>
              </div>

              {/* ──────────────── CATEGORY 1: DAILY LIMITS ──────────────── */}
              {activeCategory === 'dailyLimits' && (
                <div className="space-y-5">
                  {/* Scope Selector Pills with Responsive Grid */}
                  <div className={`relative grid grid-cols-3 sm:flex items-center p-1.5 rounded-2xl gap-1 select-none w-full sm:w-fit ${
                    isDark ? 'neu-pressed-dark border border-slate-700/60' : 'neu-pressed-light border border-slate-200/80'
                  }`}>
                    {/* Single Sliding Pill Indicator */}
                    <div
                      className={`absolute top-1.5 bottom-1.5 rounded-xl shadow-md ${
                        isDark ? 'neu-btn-accent-dark' : 'neu-btn-accent-light'
                      }`}
                      style={{
                        width: 'calc((100% - 0.75rem) / 3)',
                        left: `calc(0.375rem + ${Math.max(0, ['preset', 'subject', 'today'].indexOf(activeScopeTab))} * ((100% - 0.75rem) / 3))`,
                        transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
                      }}
                    />

                    {[
                      { id: 'preset', label: 'Preset (Global)', shortLabel: 'Preset' },
                      { id: 'subject', label: 'This Subject', shortLabel: 'Subject' },
                      { id: 'today', label: 'Today Only', shortLabel: 'Today' }
                    ].map(item => (
                      <button
                        key={item.id}
                        onClick={() => setActiveScopeTab(item.id)}
                        className={`relative sm:w-28 py-2 px-1 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center z-10 transition-colors duration-300 ${
                          activeScopeTab === item.id
                            ? 'text-white font-extrabold'
                            : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                        }`}
                      >
                        <span className="hidden sm:inline">{item.label}</span>
                        <span className="sm:hidden">{item.shortLabel}</span>
                      </button>
                    ))}
                  </div>

                  {/* SCOPE 1: GLOBAL PRESET */}
                  {activeScopeTab === 'preset' && (
                    <div className="space-y-5">
                      <div className={`p-3 rounded-xl border text-xs font-bold ${
                        isDark ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20' : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      }`}>
                        🌐 <b>Global Preset:</b> Default page caps applied across all medical subjects unless overridden below.
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className={`p-4 rounded-2xl border space-y-2 ${
                          isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                        }`}>
                          <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>New Topic Pages / Day</label>
                          <input
                            type="number"
                            min="1"
                            max="9999"
                            value={tempConfig.dailyLimits?.newPagesPerDay ?? 15}
                            onChange={e => setTempConfig({
                              ...tempConfig,
                              dailyLimits: { ...tempConfig.dailyLimits, newPagesPerDay: parseInt(e.target.value, 10) || 1 }
                            })}
                            className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-indigo-500 border ${
                              isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                            }`}
                          />
                          <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Max new chapter pages introduced daily.</p>
                          <p className={`text-[10px] font-black mt-1 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>💡 Set to 9999 to remove the cap (unlimited)</p>
                        </div>

                        <div className={`p-4 rounded-2xl border space-y-2 ${
                          isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                        }`}>
                          <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Maximum Review Pages / Day</label>
                          <input
                            type="number"
                            min="1"
                            max="9999"
                            value={tempConfig.dailyLimits?.maxReviewPagesPerDay ?? 30}
                            onChange={e => setTempConfig({
                              ...tempConfig,
                              dailyLimits: { ...tempConfig.dailyLimits, maxReviewPagesPerDay: parseInt(e.target.value, 10) || 1 }
                            })}
                            className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-indigo-500 border ${
                              isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                            }`}
                          />
                          <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Max review page load cap daily.</p>
                          <p className={`text-[10px] font-black mt-1 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>💡 Set to 9999 to remove the cap (unlimited)</p>
                        </div>
                      </div>

                      <div className="space-y-3 pt-2">
                        <label className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer ${
                          isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                        }`}>
                          <div>
                            <div className={`text-xs font-black ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>New topics ignore review limit</div>
                            <div className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Show new topics even when daily review page limit is reached</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={tempConfig.dailyLimits?.newIgnoreReviewLimit ?? false}
                            onChange={e => setTempConfig({
                              ...tempConfig,
                              dailyLimits: { ...tempConfig.dailyLimits, newIgnoreReviewLimit: e.target.checked }
                            })}
                            className="w-4 h-4 rounded text-indigo-600 border-slate-400 focus:ring-indigo-500"
                          />
                        </label>

                        <label className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer ${
                          isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                        }`}>
                          <div>
                            <div className={`text-xs font-black ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Limits start from top</div>
                            <div className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Enforce top-level subject page caps when studying sub-topics</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={tempConfig.dailyLimits?.limitsStartFromTop ?? false}
                            onChange={e => setTempConfig({
                              ...tempConfig,
                              dailyLimits: { ...tempConfig.dailyLimits, limitsStartFromTop: e.target.checked }
                            })}
                            className="w-4 h-4 rounded text-indigo-600 border-slate-400 focus:ring-indigo-500"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* SCOPE 2: THIS SUBJECT */}
                  {activeScopeTab === 'subject' && (
                    <div className="space-y-5">
                      <div className={`p-4 rounded-2xl border space-y-3 ${
                        isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                      }`}>
                        <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Select Subject to Override</label>
                        <select
                          value={selectedSubject}
                          onChange={e => setSelectedSubject(e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-indigo-500 border ${
                            isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                          }`}
                        >
                          {subjectTrackerData && subjectTrackerData.length > 0 ? (
                            subjectTrackerData.map(subDoc => (
                              <option key={subDoc.id || subDoc.subject} value={subDoc.subject}>
                                📚 {subDoc.subject}
                              </option>
                            ))
                          ) : (
                            <option value="">No subjects found</option>
                          )}
                        </select>
                      </div>

                      {selectedSubject ? (
                        <div className="space-y-4">
                          <label className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer ${
                            isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                          }`}>
                            <div>
                              <div className={`text-xs font-black ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                Enable Custom Limits for "{selectedSubject}"
                              </div>
                              <div className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                Overrides the Global Preset specifically when studying {selectedSubject}
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={currentSubjectConfig.enabled}
                              onChange={e => {
                                const isChecked = e.target.checked;
                                setTempConfig({
                                  ...tempConfig,
                                  dailyLimits: {
                                    ...globalLimits,
                                    subjectOverrides: {
                                      ...subjectOverrides,
                                      [selectedSubject]: {
                                        ...currentSubjectConfig,
                                        enabled: isChecked
                                      }
                                    }
                                  }
                                });
                              }}
                              className="w-5 h-5 rounded text-indigo-600 border-slate-400 focus:ring-indigo-500"
                            />
                          </label>

                          {currentSubjectConfig.enabled ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className={`p-4 rounded-2xl border space-y-2 ${
                                isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                              }`}>
                                <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                  {selectedSubject}: New Pages / Day
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  max="9999"
                                  value={currentSubjectConfig.newPagesPerDay}
                                  onChange={e => {
                                    const val = parseInt(e.target.value, 10) || 1;
                                    setTempConfig({
                                      ...tempConfig,
                                      dailyLimits: {
                                        ...globalLimits,
                                        subjectOverrides: {
                                          ...subjectOverrides,
                                          [selectedSubject]: {
                                            ...currentSubjectConfig,
                                            newPagesPerDay: val
                                          }
                                        }
                                      }
                                    });
                                  }}
                                  className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-indigo-500 border ${
                                    isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                                  }`}
                                />
                              </div>

                              <div className={`p-4 rounded-2xl border space-y-2 ${
                                isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                              }`}>
                                <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                  {selectedSubject}: Max Review Pages / Day
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  max="9999"
                                  value={currentSubjectConfig.maxReviewPagesPerDay}
                                  onChange={e => {
                                    const val = parseInt(e.target.value, 10) || 1;
                                    setTempConfig({
                                      ...tempConfig,
                                      dailyLimits: {
                                        ...globalLimits,
                                        subjectOverrides: {
                                          ...subjectOverrides,
                                          [selectedSubject]: {
                                            ...currentSubjectConfig,
                                            maxReviewPagesPerDay: val
                                          }
                                        }
                                      }
                                    });
                                  }}
                                  className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-indigo-500 border ${
                                    isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                                  }`}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className={`p-4 rounded-2xl border text-xs font-bold text-center ${
                              isDark ? 'bg-slate-900/40 border-slate-700/50 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                            }`}>
                              ℹ️ Custom override is disabled for <b>{selectedSubject}</b>. Currently using Global Preset limits ({globalLimits.newPagesPerDay ?? 15} New / {globalLimits.maxReviewPagesPerDay ?? 30} Review pgs).
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 text-center py-4">No subject selected.</div>
                      )}
                    </div>
                  )}

                  {/* SCOPE 3: TODAY ONLY */}
                  {activeScopeTab === 'today' && (
                    <div className="space-y-5">
                      <div className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                        isDark ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-amber-50 text-amber-900 border-amber-200'
                      }`}>
                        <span>⚡ <b>Today Only Override:</b> Temporary cap for {todayStr}. Automatically reverts at midnight.</span>
                      </div>

                      <label className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer ${
                        isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                      }`}>
                        <div>
                          <div className={`text-xs font-black ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            Enable Single-Day Override for Today ({todayStr})
                          </div>
                          <div className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Temporarily changes your daily review or new topic caps for today only
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={todayOverride.enabled && todayOverride.date === todayStr}
                          onChange={e => {
                            const isChecked = e.target.checked;
                            setTempConfig({
                              ...tempConfig,
                              dailyLimits: {
                                ...globalLimits,
                                todayOverride: {
                                  ...todayOverride,
                                  date: todayStr,
                                  enabled: isChecked
                                }
                              }
                            });
                          }}
                          className="w-5 h-5 rounded text-amber-600 border-slate-400 focus:ring-amber-500"
                        />
                      </label>

                      {todayOverride.enabled && todayOverride.date === todayStr ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className={`p-4 rounded-2xl border space-y-2 ${
                            isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                          }`}>
                            <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Today's New Topic Pages / Day</label>
                            <input
                              type="number"
                              min="1"
                              max="9999"
                              value={todayOverride.newPagesPerDay}
                              onChange={e => {
                                const val = parseInt(e.target.value, 10) || 1;
                                setTempConfig({
                                  ...tempConfig,
                                  dailyLimits: {
                                    ...globalLimits,
                                    todayOverride: {
                                      ...todayOverride,
                                      newPagesPerDay: val
                                    }
                                  }
                                });
                              }}
                              className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-amber-500 border ${
                                isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                              }`}
                            />
                            <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Temporary new page limit for today.</p>
                          </div>

                          <div className={`p-4 rounded-2xl border space-y-2 ${
                            isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                          }`}>
                            <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Today's Maximum Review Pages / Day</label>
                            <input
                              type="number"
                              min="1"
                              max="9999"
                              value={todayOverride.maxReviewPagesPerDay}
                              onChange={e => {
                                const val = parseInt(e.target.value, 10) || 1;
                                setTempConfig({
                                  ...tempConfig,
                                  dailyLimits: {
                                    ...globalLimits,
                                    todayOverride: {
                                      ...todayOverride,
                                      maxReviewPagesPerDay: val
                                    }
                                  }
                                });
                              }}
                              className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-amber-500 border ${
                                isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                              }`}
                            />
                            <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Temporary review page limit for today.</p>
                          </div>
                        </div>
                      ) : (
                        <div className={`p-4 rounded-2xl border text-xs font-bold text-center ${
                          isDark ? 'bg-slate-900/40 border-slate-700/50 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                        }`}>
                          ℹ️ Today Only override is inactive. Currently operating under Global Preset limits.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ──────────────── CATEGORY 2: NEW TOPICS ──────────────── */}
              {activeCategory === 'newTopics' && (
                <div className="space-y-4">
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                  }`}>
                    <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Learning steps (Topic Chapter Delays)</label>
                    <input
                      type="text"
                      value={tempConfig.newTopics?.learningSteps ?? '1d'}
                      onChange={e => setTempConfig({
                        ...tempConfig,
                        newTopics: { ...tempConfig.newTopics, learningSteps: e.target.value }
                      })}
                      placeholder="e.g. 1d or 2h 1d"
                      className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-indigo-500 border ${
                        isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                      }`}
                    />
                    <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Initial delays for new textbook chapters (e.g. 1d = 1 day).</p>
                  </div>

                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                  }`}>
                    <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Insertion Order</label>
                    <select
                      value={tempConfig.newTopics?.insertionOrder ?? 'sequential'}
                      onChange={e => setTempConfig({
                        ...tempConfig,
                        newTopics: { ...tempConfig.newTopics, insertionOrder: e.target.value }
                      })}
                      className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-indigo-500 border ${
                        isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                      }`}
                    >
                      <option value="sequential">Sequential (Book / Page Order)</option>
                      <option value="random">Random Order</option>
                    </select>
                    <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Order new topics are introduced from textbook index.</p>
                  </div>
                </div>
              )}

              {/* ──────────────── CATEGORY 3: LAPSES / LEECHES ──────────────── */}
              {activeCategory === 'lapses' && (
                <div className="space-y-4">
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                  }`}>
                    <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Relearning steps</label>
                    <input
                      type="text"
                      value={tempConfig.lapses?.relearningSteps ?? '1d'}
                      onChange={e => setTempConfig({
                        ...tempConfig,
                        lapses: { ...tempConfig.lapses, relearningSteps: e.target.value }
                      })}
                      placeholder="e.g. 1d"
                      className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-indigo-500 border ${
                        isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                      }`}
                    />
                    <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Relearning delay when pressing Again on a review topic.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`p-4 rounded-2xl border space-y-2 ${
                      isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                    }`}>
                      <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Leech Threshold</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={tempConfig.lapses?.leechThreshold ?? 8}
                        onChange={e => setTempConfig({
                          ...tempConfig,
                          lapses: { ...tempConfig.lapses, leechThreshold: parseInt(e.target.value, 10) || 1 }
                        })}
                        className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-indigo-500 border ${
                          isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                        }`}
                      />
                      <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Number of lapses before flagging as a Leech topic.</p>
                    </div>

                    <div className={`p-4 rounded-2xl border space-y-2 ${
                      isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                    }`}>
                      <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Leech Action</label>
                      <select
                        value={tempConfig.lapses?.leechAction ?? 'tag'}
                        onChange={e => setTempConfig({
                          ...tempConfig,
                          lapses: { ...tempConfig.lapses, leechAction: e.target.value }
                        })}
                        className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-indigo-500 border ${
                          isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                        }`}
                      >
                        <option value="tag">Tag Only (🏷️ Leech Tag)</option>
                        <option value="suspend">Suspend Topic (Hide from queue)</option>
                      </select>
                      <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Action taken when a topic reaches leech threshold.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ──────────────── CATEGORY 4: DISPLAY ORDER ──────────────── */}
              {activeCategory === 'displayOrder' && (
                <div className="space-y-4">
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                  }`}>
                    <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>New Topic Gather Order</label>
                    <select
                      value={tempConfig.displayOrder?.gatherOrder ?? 'curriculum'}
                      onChange={e => setTempConfig({
                        ...tempConfig,
                        displayOrder: { ...tempConfig.displayOrder, gatherOrder: e.target.value }
                      })}
                      className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-indigo-500 border ${
                        isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                      }`}
                    >
                      <option value="curriculum">Subject Curriculum Order</option>
                      <option value="ascendingPage">Ascending Page Position</option>
                      <option value="descendingPage">Descending Page Position</option>
                      <option value="random">Random Topics</option>
                    </select>
                  </div>

                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                  }`}>
                    <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>New / Review Queue Sequence</label>
                    <select
                      value={tempConfig.displayOrder?.newReviewOrder ?? 'reviewsFirst'}
                      onChange={e => setTempConfig({
                        ...tempConfig,
                        displayOrder: { ...tempConfig.displayOrder, newReviewOrder: e.target.value }
                      })}
                      className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-indigo-500 border ${
                        isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                      }`}
                    >
                      <option value="reviewsFirst">Show after reviews (Recommended)</option>
                      <option value="newFirst">Show before reviews</option>
                      <option value="mix">Mix new topics with reviews</option>
                    </select>
                  </div>

                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                  }`}>
                    <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Review Sort Order</label>
                    <select
                      value={tempConfig.displayOrder?.reviewSortOrder ?? 'urgency'}
                      onChange={e => setTempConfig({
                        ...tempConfig,
                        displayOrder: { ...tempConfig.displayOrder, reviewSortOrder: e.target.value }
                      })}
                      className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-indigo-500 border ${
                        isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                      }`}
                    >
                      <option value="urgency">Due date then random (FSRS Urgency)</option>
                      <option value="overdueness">Relative Overdueness</option>
                      <option value="page">Textbook Page Order</option>
                    </select>
                  </div>
                </div>
              )}

              {/* ──────────────── CATEGORY 5: FSRS CORE & PARAMETERS ──────────────── */}
              {activeCategory === 'fsrsCore' && (
                <div className="space-y-6">
                  {/* Master Switch */}
                  <label className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer ${
                    isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                  }`}>
                    <div>
                      <div className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>Enable FSRS-6 Algorithm</div>
                      <div className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Uses FSRS-6 mathematical model for optimal memory scheduling</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={tempConfig.enabled ?? true}
                      onChange={e => setTempConfig({ ...tempConfig, enabled: e.target.checked })}
                      className="w-5 h-5 rounded text-indigo-600 border-slate-400 focus:ring-indigo-500"
                    />
                  </label>

                  {/* Desired Retention Mode & Slider */}
                  <div className={`p-4 rounded-2xl border space-y-4 ${
                    isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                  }`}>
                    <div className="flex items-center justify-between">
                      <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Retention Mode</label>
                      <div className={`relative grid grid-cols-2 p-1.5 rounded-2xl gap-1 shrink-0 select-none w-48 sm:w-56 ${
                        isDark ? 'neu-pressed-dark border border-slate-700/60' : 'neu-pressed-light border border-slate-200/80'
                      }`}>
                        {/* Single Sliding Pill Indicator */}
                        <div
                          className={`absolute top-1.5 bottom-1.5 rounded-xl shadow-md ${
                            isDark ? 'neu-btn-accent-dark' : 'neu-btn-accent-light'
                          }`}
                          style={{
                            width: 'calc((100% - 0.75rem) / 2)',
                            left: `calc(0.375rem + ${(tempConfig.retentionMode === 'perSubject' ? 1 : 0)} * ((100% - 0.75rem) / 2))`,
                            transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
                          }}
                        />

                        {[
                          { id: 'global', label: 'Global' },
                          { id: 'perSubject', label: 'Per-Subject' }
                        ].map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setTempConfig({ ...tempConfig, retentionMode: item.id })}
                            className={`relative py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center z-10 transition-colors duration-300 ${
                              (tempConfig.retentionMode || 'global') === item.id || (item.id === 'global' && tempConfig.retentionMode !== 'perSubject')
                                ? 'text-white font-extrabold'
                                : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                            }`}
                          >
                            <span>{item.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {tempConfig.retentionMode !== 'perSubject' ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Desired Retention (DR)</span>
                          <span className={`text-sm font-black ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                            {Math.round((tempConfig.globalDesiredRetention || 0.90) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.70"
                          max="0.97"
                          step="0.01"
                          value={tempConfig.globalDesiredRetention || 0.90}
                          onChange={e => setTempConfig({ ...tempConfig, globalDesiredRetention: parseFloat(e.target.value) })}
                          className="w-full accent-indigo-600 cursor-pointer"
                        />
                        <div className={`p-3 rounded-xl border text-xs font-black flex items-center justify-between ${currentWorkload.bg}`}>
                          <span>Workload Impact:</span>
                          <span className={currentWorkload.color}>{currentWorkload.label}</span>
                        </div>
                      </div>
                    ) : (
                      <div className={`text-xs font-medium p-3 rounded-xl border ${
                        isDark ? 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20' : 'text-indigo-700 bg-indigo-50 border-indigo-200'
                      }`}>
                        Per-Subject Retention Mode active: Each medical subject uses its configured retention target.
                      </div>
                    )}
                  </div>

                  {/* 21 Parameters Editor */}
                  <div className={`p-4 rounded-2xl border space-y-3 ${
                    isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                  }`}>
                    <div className="flex items-center justify-between">
                      <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>FSRS-6 Parameters (w0..w20)</label>
                      <button
                        onClick={() => {
                          const defStr = DEFAULT_FSRS6_WEIGHTS.join(', ');
                          setWeightsText(defStr);
                          setTempConfig({ ...tempConfig, weights: [...DEFAULT_FSRS6_WEIGHTS] });
                        }}
                        className={`text-[11px] font-black hover:underline cursor-pointer ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}
                      >
                        Reset to Defaults
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={weightsText}
                      onChange={e => {
                        const val = e.target.value;
                        setWeightsText(val);
                        const parsed = val.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
                        if (parsed.length === 21) {
                          setTempConfig({ ...tempConfig, weights: parsed });
                        }
                      }}
                      onBlur={() => {
                        const parsed = weightsText.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
                        if (parsed.length === 21) {
                          setTempConfig({ ...tempConfig, weights: parsed });
                          setWeightsText(parsed.join(', '));
                        }
                      }}
                      className={`w-full p-2.5 rounded-xl text-xs font-mono focus:outline-none focus:border-indigo-500 border ${
                        isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-slate-300' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                      }`}
                    />
                    <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Comma-separated 21 parameter vector ($w_0 \dots w_{20}$).</p>
                  </div>

                  {/* Optimization Section (Data-Locked) */}
                  <div className={`p-4 rounded-2xl border space-y-3 ${
                    isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">✨</span>
                        <h4 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          Personalized Weight Optimization
                        </h4>
                      </div>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                        isOptimizeLocked
                          ? isDark ? 'bg-amber-500/10 text-amber-400 border-amber-500/25' : 'bg-amber-50 text-amber-700 border-amber-200'
                          : isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {isOptimizeLocked ? `Locked (${reviewCount}/${MIN_REVIEWS_FOR_OPTIMIZE})` : 'Ready to Optimize'}
                      </span>
                    </div>

                    <p className={`text-[11px] font-medium leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Fine-tunes the 21-parameter FSRS weight vector based on your personal review history using Binary Cross-Entropy loss minimization.
                    </p>

                    {isOptimizeLocked ? (
                      <div className={`p-3 rounded-xl border space-y-2.5 ${
                        isDark ? 'neu-pressed-dark border-slate-700/60 bg-slate-800/20' : 'neu-pressed-light border-slate-200 bg-slate-100/50'
                      }`}>
                        <div className="flex items-center justify-between text-[10px] font-black">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                            🔒 Review Progress Requirement
                          </span>
                          <span className={isDark ? 'text-amber-400' : 'text-amber-600'}>
                            {reviewCount} / {MIN_REVIEWS_FOR_OPTIMIZE} reviews ({Math.round((reviewCount / MIN_REVIEWS_FOR_OPTIMIZE) * 100)}%)
                          </span>
                        </div>
                        <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-indigo-500 transition-all duration-300 rounded-full"
                            style={{ width: `${Math.min(100, (reviewCount / MIN_REVIEWS_FOR_OPTIMIZE) * 100)}%` }}
                          />
                        </div>
                        <p className={`text-[10px] font-semibold leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Log at least <b>{MIN_REVIEWS_FOR_OPTIMIZE - reviewCount} more</b> review sessions in Active Recall Hub or Daily Study Logger to unlock statistically reliable optimization.
                        </p>
                      </div>
                    ) : (
                      <div className={`p-3 rounded-xl border space-y-2 ${
                        isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      }`}>
                        <div className="flex items-center gap-2 text-xs font-black">
                          <span>🎉</span>
                          <span>{reviewCount} review sessions recorded — dataset is ready for training!</span>
                        </div>
                        <p className="text-[10px] opacity-90">
                          Click below to compute personalized parameters calibrated to your exact retention memory decay.
                        </p>
                      </div>
                    )}

                    {optimizeStats && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-3 rounded-xl border space-y-1.5 ${
                          isDark ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200' : 'bg-indigo-50 border-indigo-200 text-indigo-900'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs font-black">
                          <span>🚀</span>
                          <span>Parameters Optimized Successfully!</span>
                        </div>
                        <p className="text-[10px] font-medium leading-relaxed">
                          Loss improved from <b>{optimizeStats.initialLoss}</b> ➔ <b>{optimizeStats.finalLoss}</b> (<b>+{optimizeStats.lossImprovementPct}%</b> model accuracy improvement across {optimizeStats.sampleCount} review samples).
                        </p>
                      </motion.div>
                    )}

                    <button
                      type="button"
                      disabled={isOptimizeLocked || isOptimizing}
                      onClick={handleRunOptimizer}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                        isOptimizeLocked
                          ? 'opacity-50 cursor-not-allowed bg-slate-500/20 text-slate-400 border border-slate-500/30'
                          : isDark
                            ? 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-lg shadow-indigo-500/20 active:scale-[0.99] cursor-pointer'
                            : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-md shadow-indigo-500/20 active:scale-[0.99] cursor-pointer'
                      }`}
                    >
                      {isOptimizing ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Optimizing Parameters...</span>
                        </>
                      ) : isOptimizeLocked ? (
                        <>
                          <span>🔒</span>
                          <span>Optimize Parameters (Locked: {reviewCount}/{MIN_REVIEWS_FOR_OPTIMIZE})</span>
                        </>
                      ) : (
                        <>
                          <span>⚡</span>
                          <span>Optimize Parameters Now</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Batch Rescheduling Section */}
                  <div className={`p-4 rounded-2xl border space-y-3 ${
                    isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🔄</span>
                        <h4 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          Batch Topic Rescheduling
                        </h4>
                      </div>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                        isDark ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`}>
                        All Subjects
                      </span>
                    </div>

                    <p className={`text-[11px] font-medium leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Recalculates review intervals and next due dates across all studied topics using your active Desired Retention (<b>{Math.round((tempConfig.globalDesiredRetention || 0.90) * 100)}%</b>), weights, and Easy Days schedule.
                    </p>

                    {rescheduleResultToast && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-3 rounded-xl border text-xs font-black ${
                          rescheduleResultToast.success
                            ? isDark ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : isDark ? 'bg-rose-500/15 border-rose-500/40 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}
                      >
                        {rescheduleResultToast.message}
                      </motion.div>
                    )}

                    <button
                      type="button"
                      disabled={isRescheduling}
                      onClick={handleRunBatchReschedule}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                        isDark
                          ? 'neu-btn-dark text-indigo-300 border-indigo-500/40 hover:text-white hover:border-indigo-400 active:scale-[0.99]'
                          : 'neu-btn-light text-indigo-700 border-indigo-200 hover:text-indigo-900 active:scale-[0.99]'
                      }`}
                    >
                      {isRescheduling ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                          <span>Recalculating Topic Intervals...</span>
                        </>
                      ) : (
                        <>
                          <span>🔄</span>
                          <span>Reschedule All Active Topics</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ──────────────── CATEGORY 6: EASY DAYS ──────────────── */}
              {activeCategory === 'easyDays' && (
                <div className="space-y-4">
                  <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Adjust target review workload for each day of the week:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => (
                      <div key={day} className={`p-3 rounded-2xl border flex items-center justify-between ${
                        isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                      }`}>
                        <span className={`text-xs font-black uppercase ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{day}</span>
                        <select
                          value={tempConfig.easyDays?.[day] || 'normal'}
                          onChange={e => setTempConfig({
                            ...tempConfig,
                            easyDays: { ...(tempConfig.easyDays || {}), [day]: e.target.value }
                          })}
                          className={`px-2.5 py-1 rounded-xl text-xs font-black focus:outline-none border ${
                            isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                          }`}
                        >
                          <option value="minimum">Minimum (Lightest)</option>
                          <option value="reduced">Reduced</option>
                          <option value="normal">Normal</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ──────────────── CATEGORY 7: ADVANCED ──────────────── */}
              {activeCategory === 'advanced' && (
                <div className="space-y-4">
                  <div className={`p-4 rounded-2xl border space-y-2 ${
                    isDark ? 'neu-card-dark border-slate-700/60' : 'neu-card-light border-slate-200/80'
                  }`}>
                    <label className={`text-xs font-black ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Maximum Interval (Days)</label>
                    <input
                      type="number"
                      min="30"
                      max="36500"
                      value={tempConfig.advancedRules?.maxInterval ?? 365}
                      onChange={e => setTempConfig({
                        ...tempConfig,
                        advancedRules: { ...tempConfig.advancedRules, maxInterval: parseInt(e.target.value, 10) || 30 }
                      })}
                      className={`w-full px-3 py-2 rounded-xl text-sm font-black focus:outline-none focus:border-indigo-500 border ${
                        isDark ? 'neu-pressed-dark bg-[#222730] border-slate-700/60 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-800'
                      }`}
                    />
                    <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Maximum days a review topic can be spaced out (Default: 365 days).</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Action Bar */}
          <div className={`px-4 sm:px-6 py-3 sm:py-4 border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 ${
            isDark ? 'border-slate-700/60 bg-[#222730]' : 'border-slate-200 bg-[#e6ecf5]'
          }`}>
            <button
              onClick={() => {
                if (window.confirm("Reset all FSRS Spaced Repetition settings to factory defaults?")) {
                  isResetRef.current = true;
                  setTempConfig(JSON.parse(JSON.stringify(DEFAULT_FSRS_CONFIG)));
                  setWeightsText((DEFAULT_FSRS_CONFIG.weights || DEFAULT_FSRS6_WEIGHTS).join(', '));
                }
              }}
              className={`px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer border text-center ${
                isDark ? 'neu-btn-dark text-amber-400 border-amber-500/30 hover:text-amber-300' : 'neu-btn-light text-amber-700 border-amber-300 hover:text-amber-800'
              }`}
            >
              ↺ Reset Defaults
            </button>

            <div className="grid grid-cols-2 sm:flex items-center gap-2 sm:gap-3">
              <button
                onClick={onClose}
                className={`px-3.5 py-2 sm:px-4.5 sm:py-2.5 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all text-center cursor-pointer ${
                  isDark ? 'neu-btn-dark text-slate-300 hover:text-white' : 'neu-btn-light text-slate-600 hover:text-slate-900'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className={`px-4 py-2 sm:px-5 sm:py-2.5 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer text-center ${
                  isDark ? 'neu-btn-accent-dark text-white' : 'neu-btn-accent-light text-white'
                }`}
              >
                Save Settings
              </button>
            </div>
          </div>
        </motion.div>

        {/* In-App Interactive User Manual Modal */}
        <AnimatePresence>
          {activeManualSection && MANUAL_CONTENTS[activeManualSection] && (
            <div className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 backdrop-blur-md ${isDark ? 'bg-slate-950/80' : 'bg-slate-900/40'}`}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`relative w-full max-w-lg rounded-3xl shadow-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto no-scrollbar border ${
                  isDark ? 'bg-[#222730] border-indigo-500/40 text-slate-200 neu-card-dark' : 'bg-[#e6ecf5] border-indigo-300 text-slate-800 neu-card-light'
                }`}
              >
                <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-slate-700/60' : 'border-slate-300/60'}`}>
                  <h3 className={`text-base font-black flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    <span>❓</span> {MANUAL_CONTENTS[activeManualSection].title}
                  </h3>
                  <button
                    onClick={() => setActiveManualSection(null)}
                    className={`p-1.5 rounded-xl transition ${isDark ? 'neu-btn-dark text-slate-400 hover:text-white' : 'neu-btn-light text-slate-500 hover:text-slate-900'}`}
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-4">
                  {MANUAL_CONTENTS[activeManualSection].sections.map((sec, idx) => (
                    <div key={idx} className={`space-y-1 p-3.5 rounded-2xl border ${
                      isDark ? 'neu-pressed-dark border-slate-700/50' : 'neu-pressed-light border-slate-200'
                    }`}>
                      <h4 className={`text-xs font-black ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>{sec.heading}</h4>
                      <p className={`text-xs whitespace-pre-line leading-relaxed font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{sec.content}</p>
                    </div>
                  ))}
                </div>
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setActiveManualSection(null)}
                    className={`px-4.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      isDark ? 'neu-btn-accent-dark text-white' : 'neu-btn-accent-light text-white'
                    }`}
                  >
                    Got It
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </AnimatePresence>
  );
}

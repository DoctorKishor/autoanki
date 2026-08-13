import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DEFAULT_FSRS6_WEIGHTS } from '../services/fsrsEngine';

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

export default function FsrsSettingsModal({ isOpen, onClose, fsrsConfig, onSaveConfig }) {
  const [activeCategory, setActiveCategory] = useState('dailyLimits');
  const [activeScopeTab, setActiveScopeTab] = useState('preset');
  const [activeManualSection, setActiveManualSection] = useState(null);
  const [tempConfig, setTempConfig] = useState(fsrsConfig || {});

  // Update temp state when modal opens or fsrsConfig changes
  React.useEffect(() => {
    if (fsrsConfig) {
      setTempConfig(JSON.parse(JSON.stringify(fsrsConfig)));
    }
  }, [fsrsConfig, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveConfig(tempConfig);
    onClose();
  };

  const getWorkloadLevel = (dr) => {
    if (dr < 0.78) return { label: '🟢 Light Workload', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
    if (dr <= 0.88) return { label: '🔵 Moderate Workload', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30' };
    if (dr <= 0.93) return { label: '🟠 Heavy Workload', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' };
    return { label: '🔴 Extreme / Burnout Risk', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' };
  };

  const currentWorkload = getWorkloadLevel(tempConfig.globalDesiredRetention || 0.90);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-4xl h-[85vh] flex flex-col bg-[#222730] border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden text-slate-200"
        >
          {/* Header Bar */}
          <div className="px-6 py-4 border-b border-slate-700/60 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚙️</span>
              <div>
                <h2 className="text-xl font-bold text-white tracking-wide">FSRS Spaced Repetition Settings</h2>
                <p className="text-xs text-slate-400">Configure engine rules, page limits, retention targets & load balancing</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Body Container */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left Sidebar Category Tabs */}
            <div className="w-56 border-r border-slate-700/60 bg-slate-900/30 p-3 space-y-1 overflow-y-auto no-scrollbar">
              {CATEGORIES.map(cat => {
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left relative ${
                      isActive
                        ? 'text-white bg-indigo-600/30 border border-indigo-500/40 shadow-sm font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span className="flex-1">{cat.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="activeCategoryPill"
                        className="absolute inset-0 bg-indigo-500/10 rounded-xl border border-indigo-400/30"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right Main Settings Panel */}
            <div className="flex-1 p-6 overflow-y-auto no-scrollbar space-y-6 bg-[#222730]">
              {/* Category Header with Question Mark ? Manual Button */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-700/40">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white">
                    {CATEGORIES.find(c => c.id === activeCategory)?.icon}{' '}
                    {CATEGORIES.find(c => c.id === activeCategory)?.label}
                  </span>
                </div>
                <button
                  onClick={() => setActiveManualSection(activeCategory)}
                  title="Open In-App User Manual"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-xs font-medium transition-all"
                >
                  <span className="font-bold">?</span>
                  <span>User Manual</span>
                </button>
              </div>

              {/* ──────────────── CATEGORY 1: DAILY LIMITS ──────────────── */}
              {activeCategory === 'dailyLimits' && (
                <div className="space-y-6">
                  {/* Scope Selector Pills */}
                  <div className="flex p-1 bg-slate-900/60 rounded-xl border border-slate-700/50 w-fit">
                    {['preset', 'subject', 'today'].map(scope => (
                      <button
                        key={scope}
                        onClick={() => setActiveScopeTab(scope)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                          activeScopeTab === scope
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {scope === 'preset' ? 'Preset (Global)' : scope === 'subject' ? 'This Subject' : 'Today Only'}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 space-y-2">
                      <label className="text-xs font-semibold text-slate-300">New Topic Pages / Day</label>
                      <input
                        type="number"
                        min="1"
                        max="9999"
                        value={tempConfig.dailyLimits?.newPagesPerDay ?? 15}
                        onChange={e => setTempConfig({
                          ...tempConfig,
                          dailyLimits: { ...tempConfig.dailyLimits, newPagesPerDay: parseInt(e.target.value, 10) || 1 }
                        })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500"
                      />
                      <p className="text-[11px] text-slate-400">Max new chapter pages introduced daily.</p>
                      <p className="text-[10px] text-indigo-300 font-semibold mt-1">💡 Set to 9999 to remove the cap (unlimited)</p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Maximum Review Pages / Day</label>
                      <input
                        type="number"
                        min="1"
                        max="9999"
                        value={tempConfig.dailyLimits?.maxReviewPagesPerDay ?? 30}
                        onChange={e => setTempConfig({
                          ...tempConfig,
                          dailyLimits: { ...tempConfig.dailyLimits, maxReviewPagesPerDay: parseInt(e.target.value, 10) || 1 }
                        })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500"
                      />
                      <p className="text-[11px] text-slate-400">Max review page load cap daily.</p>
                      <p className="text-[10px] text-indigo-300 font-semibold mt-1">💡 Set to 9999 to remove the cap (unlimited)</p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-700/40 cursor-pointer">
                      <div>
                        <div className="text-xs font-semibold text-slate-200">New topics ignore review limit</div>
                        <div className="text-[11px] text-slate-400">Show new topics even when daily review page limit is reached</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={tempConfig.dailyLimits?.newIgnoreReviewLimit ?? false}
                        onChange={e => setTempConfig({
                          ...tempConfig,
                          dailyLimits: { ...tempConfig.dailyLimits, newIgnoreReviewLimit: e.target.checked }
                        })}
                        className="w-4 h-4 rounded text-indigo-600 border-slate-700 focus:ring-indigo-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-700/40 cursor-pointer">
                      <div>
                        <div className="text-xs font-semibold text-slate-200">Limits start from top</div>
                        <div className="text-[11px] text-slate-400">Enforce top-level subject page caps when studying sub-topics</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={tempConfig.dailyLimits?.limitsStartFromTop ?? false}
                        onChange={e => setTempConfig({
                          ...tempConfig,
                          dailyLimits: { ...tempConfig.dailyLimits, limitsStartFromTop: e.target.checked }
                        })}
                        className="w-4 h-4 rounded text-indigo-600 border-slate-700 focus:ring-indigo-500"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* ──────────────── CATEGORY 2: NEW TOPICS ──────────────── */}
              {activeCategory === 'newTopics' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Learning steps (Topic Chapter Delays)</label>
                    <input
                      type="text"
                      value={tempConfig.newTopics?.learningSteps ?? '1d'}
                      onChange={e => setTempConfig({
                        ...tempConfig,
                        newTopics: { ...tempConfig.newTopics, learningSteps: e.target.value }
                      })}
                      placeholder="e.g. 1d or 2h 1d"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[11px] text-slate-400">Initial delays for new textbook chapters (e.g. 1d = 1 day).</p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Insertion Order</label>
                    <select
                      value={tempConfig.newTopics?.insertionOrder ?? 'sequential'}
                      onChange={e => setTempConfig({
                        ...tempConfig,
                        newTopics: { ...tempConfig.newTopics, insertionOrder: e.target.value }
                      })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500"
                    >
                      <option value="sequential">Sequential (Book / Page Order)</option>
                      <option value="random">Random Order</option>
                    </select>
                    <p className="text-[11px] text-slate-400">Order new topics are introduced from textbook index.</p>
                  </div>
                </div>
              )}

              {/* ──────────────── CATEGORY 3: LAPSES / LEECHES ──────────────── */}
              {activeCategory === 'lapses' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Relearning steps</label>
                    <input
                      type="text"
                      value={tempConfig.lapses?.relearningSteps ?? '1d'}
                      onChange={e => setTempConfig({
                        ...tempConfig,
                        lapses: { ...tempConfig.lapses, relearningSteps: e.target.value }
                      })}
                      placeholder="e.g. 1d"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[11px] text-slate-400">Relearning delay when pressing Again on a review topic.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Leech Threshold</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={tempConfig.lapses?.leechThreshold ?? 8}
                        onChange={e => setTempConfig({
                          ...tempConfig,
                          lapses: { ...tempConfig.lapses, leechThreshold: parseInt(e.target.value, 10) || 1 }
                        })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500"
                      />
                      <p className="text-[11px] text-slate-400">Number of lapses before flagging as a Leech topic.</p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Leech Action</label>
                      <select
                        value={tempConfig.lapses?.leechAction ?? 'tag'}
                        onChange={e => setTempConfig({
                          ...tempConfig,
                          lapses: { ...tempConfig.lapses, leechAction: e.target.value }
                        })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500"
                      >
                        <option value="tag">Tag Only (🏷️ Leech Tag)</option>
                        <option value="suspend">Suspend Topic (Hide from queue)</option>
                      </select>
                      <p className="text-[11px] text-slate-400">Action taken when a topic reaches leech threshold.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ──────────────── CATEGORY 4: DISPLAY ORDER ──────────────── */}
              {activeCategory === 'displayOrder' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 space-y-2">
                    <label className="text-xs font-semibold text-slate-300">New Topic Gather Order</label>
                    <select
                      value={tempConfig.displayOrder?.gatherOrder ?? 'curriculum'}
                      onChange={e => setTempConfig({
                        ...tempConfig,
                        displayOrder: { ...tempConfig.displayOrder, gatherOrder: e.target.value }
                      })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500"
                    >
                      <option value="curriculum">Subject Curriculum Order</option>
                      <option value="ascendingPage">Ascending Page Position</option>
                      <option value="descendingPage">Descending Page Position</option>
                      <option value="random">Random Topics</option>
                    </select>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 space-y-2">
                    <label className="text-xs font-semibold text-slate-300">New / Review Queue Sequence</label>
                    <select
                      value={tempConfig.displayOrder?.newReviewOrder ?? 'reviewsFirst'}
                      onChange={e => setTempConfig({
                        ...tempConfig,
                        displayOrder: { ...tempConfig.displayOrder, newReviewOrder: e.target.value }
                      })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500"
                    >
                      <option value="reviewsFirst">Show after reviews (Recommended)</option>
                      <option value="newFirst">Show before reviews</option>
                      <option value="mix">Mix new topics with reviews</option>
                    </select>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Review Sort Order</label>
                    <select
                      value={tempConfig.displayOrder?.reviewSortOrder ?? 'urgency'}
                      onChange={e => setTempConfig({
                        ...tempConfig,
                        displayOrder: { ...tempConfig.displayOrder, reviewSortOrder: e.target.value }
                      })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500"
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
                  <label className="flex items-center justify-between p-4 rounded-xl bg-slate-900/60 border border-slate-700/60 cursor-pointer">
                    <div>
                      <div className="text-sm font-bold text-white">Enable FSRS-6 Algorithm</div>
                      <div className="text-xs text-slate-400">Uses FSRS-6 mathematical model for optimal memory scheduling</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={tempConfig.enabled ?? true}
                      onChange={e => setTempConfig({ ...tempConfig, enabled: e.target.checked })}
                      className="w-5 h-5 rounded text-indigo-600 border-slate-700 focus:ring-indigo-500"
                    />
                  </label>

                  {/* Desired Retention Mode & Slider */}
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">Retention Mode</label>
                      <div className="flex p-0.5 bg-slate-950 rounded-lg border border-slate-700">
                        <button
                          onClick={() => setTempConfig({ ...tempConfig, retentionMode: 'global' })}
                          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                            tempConfig.retentionMode !== 'perSubject' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                          }`}
                        >
                          Global
                        </button>
                        <button
                          onClick={() => setTempConfig({ ...tempConfig, retentionMode: 'perSubject' })}
                          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                            tempConfig.retentionMode === 'perSubject' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                          }`}
                        >
                          Per-Subject
                        </button>
                      </div>
                    </div>

                    {tempConfig.retentionMode !== 'perSubject' ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-400">Desired Retention (DR)</span>
                          <span className="text-sm font-bold text-indigo-400">
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
                          className="w-full accent-indigo-500"
                        />
                        <div className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between ${currentWorkload.bg}`}>
                          <span>Workload Impact:</span>
                          <span className={currentWorkload.color}>{currentWorkload.label}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-indigo-300 bg-indigo-500/10 p-3 rounded-lg border border-indigo-500/20">
                        Per-Subject Retention Mode active: Each medical subject uses its configured retention target.
                      </div>
                    )}
                  </div>

                  {/* 21 Parameters Editor */}
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">FSRS-6 Parameters (w0..w20)</label>
                      <button
                        onClick={() => setTempConfig({ ...tempConfig, weights: [...DEFAULT_FSRS6_WEIGHTS] })}
                        className="text-[11px] text-indigo-400 hover:underline"
                      >
                        Reset to Defaults
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={(tempConfig.weights || DEFAULT_FSRS6_WEIGHTS).join(', ')}
                      onChange={e => {
                        const parsed = e.target.value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
                        if (parsed.length >= 21) {
                          setTempConfig({ ...tempConfig, weights: parsed });
                        }
                      }}
                      className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[11px] text-slate-400">Comma-separated 21 parameter vector ($w_0 \dots w_{20}$).</p>
                  </div>
                </div>
              )}

              {/* ──────────────── CATEGORY 6: EASY DAYS ──────────────── */}
              {activeCategory === 'easyDays' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">Adjust target review workload for each day of the week:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => (
                      <div key={day} className="p-3 rounded-xl bg-slate-900/40 border border-slate-700/40 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase text-slate-200">{day}</span>
                        <select
                          value={tempConfig.easyDays?.[day] || 'normal'}
                          onChange={e => setTempConfig({
                            ...tempConfig,
                            easyDays: { ...(tempConfig.easyDays || {}), [day]: e.target.value }
                          })}
                          className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs font-semibold text-white focus:outline-none"
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
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Maximum Interval (Days)</label>
                    <input
                      type="number"
                      min="30"
                      max="36500"
                      value={tempConfig.advancedRules?.maxInterval ?? 365}
                      onChange={e => setTempConfig({
                        ...tempConfig,
                        advancedRules: { ...tempConfig.advancedRules, maxInterval: parseInt(e.target.value, 10) || 30 }
                      })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[11px] text-slate-400">Maximum days a review topic can be spaced out (Default: 365 days).</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Action Bar */}
          <div className="px-6 py-4 border-t border-slate-700/60 flex items-center justify-end gap-3 bg-slate-900/50">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20 transition-all"
            >
              Save FSRS Settings
            </button>
          </div>
        </motion.div>

        {/* In-App Interactive User Manual Modal */}
        <AnimatePresence>
          {activeManualSection && MANUAL_CONTENTS[activeManualSection] && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-lg bg-[#222730] border border-indigo-500/40 rounded-2xl shadow-2xl p-6 space-y-4 text-slate-200 max-h-[80vh] overflow-y-auto no-scrollbar"
              >
                <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>❓</span> {MANUAL_CONTENTS[activeManualSection].title}
                  </h3>
                  <button
                    onClick={() => setActiveManualSection(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-4">
                  {MANUAL_CONTENTS[activeManualSection].sections.map((sec, idx) => (
                    <div key={idx} className="space-y-1 bg-slate-900/40 p-3 rounded-xl border border-slate-700/40">
                      <h4 className="text-xs font-bold text-indigo-300">{sec.heading}</h4>
                      <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">{sec.content}</p>
                    </div>
                  ))}
                </div>
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setActiveManualSection(null)}
                    className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500"
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

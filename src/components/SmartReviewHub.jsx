import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Calendar, AlertTriangle, CheckCircle, Clock, BookOpen, Layers, Sparkles, RotateCcw, RotateCw, Zap, Undo2, X, FileText } from 'lucide-react';
import FsrsStatsTab from './FsrsStatsTab';
import FsrsSettingsModal from './FsrsSettingsModal';
import SelectNewTopicsModal from './SelectNewTopicsModal';
import { saveLocalSubjectTrackerDoc, getActiveNewTopicIds, saveActiveNewTopicIds } from '../services/localDb';
import { parsePageNumbers, getTopicPageWeight } from '../utils/pageUtils';

export function getLocalDateStr(d = new Date()) {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (!dateObj || isNaN(dateObj.getTime())) return new Date().toLocaleDateString('en-CA');
  return dateObj.toLocaleDateString('en-CA');
}

export function getTopicPageInfo(topic) {
  return parsePageNumbers(topic);
}

export default function SmartReviewHub({
  themeMode = 'dark',
  subjectTrackerData = [],
  studyLogs = [],
  fsrsConfig = {},
  onSaveConfig,
  onRateTopic,
  onUndoRating,
  onRedoRating,
  canUndo = false,
  canRedo = false,
  lastRatedToast = null,
  onClearToast,
  studySchedule = [],
  onUpdateSubjectDoc,
  geminiApiKey = '',
  aiFeatureModels = {},
  onOpenNotesModal
}) {
  const isDark = themeMode === 'dark';
  const [subTab, setSubTab] = useState('queue'); // 'queue', 'analytics', 'leeches'
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPickModalOpen, setIsPickModalOpen] = useState(false);
  const [activeNewTopicIds, setActiveNewTopicIds] = useState(new Set());
  const [mnemonicNotes, setMnemonicNotes] = useState({});
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    const todayStr = getLocalDateStr();
    getActiveNewTopicIds(todayStr).then(ids => {
      if (Array.isArray(ids)) {
        setActiveNewTopicIds(new Set(ids));
      }
    }).catch(err => console.error("Error loading active new topic IDs:", err));
  }, []);

  useEffect(() => {
    if (lastRatedToast && lastRatedToast.message) {
      setToastMessage(lastRatedToast.message);
      const timer = setTimeout(() => {
        setToastMessage('');
        if (typeof onClearToast === 'function') onClearToast();
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [lastRatedToast, onClearToast]);

  // 1. Calculate Daily Limits & Page Counts from subjectTrackerData
  const todayStr = getLocalDateStr();
  const rawLimits = fsrsConfig.dailyLimits || {};
  const todayOverride = rawLimits.todayOverride;

  const dailyLimits = useMemo(() => {
    let newCap = rawLimits.newPagesPerDay ?? 10;
    let reviewCap = rawLimits.maxReviewPagesPerDay ?? 30;

    if (todayOverride && todayOverride.enabled && todayOverride.date === todayStr) {
      newCap = todayOverride.newPagesPerDay ?? newCap;
      reviewCap = todayOverride.maxReviewPagesPerDay ?? reviewCap;
    }

    return {
      newPagesPerDay: newCap,
      maxReviewPagesPerDay: reviewCap,
      newIgnoreReviewLimit: rawLimits.newIgnoreReviewLimit ?? false,
      limitsStartFromTop: rawLimits.limitsStartFromTop ?? false,
      subjectOverrides: rawLimits.subjectOverrides || {}
    };
  }, [fsrsConfig, todayStr]);

  const { overdueTopics, dueTodayTopics, newTopics, totalReviewPagesToday, totalNewPagesToday, leechTopics } = useMemo(() => {
    const overdue = [];
    const dueToday = [];
    const newItems = [];
    const leeches = [];
    let reviewPages = 0;
    let newPages = 0;

    const todayStr = getLocalDateStr();

    subjectTrackerData.forEach(subDoc => {
      const subName = subDoc.subject;
      if (subDoc.topics) {
        const topicsList = Object.values(subDoc.topics);
        topicsList.forEach(topic => {
          if (!topic || !topic.name || topic.name.trim().length === 0) return;

          const { pageLabel, startPage, endPage } = parsePageNumbers(topic);
          const topicWeight = getTopicPageWeight(topic, topicsList);
          const lapses = topic.lapses || topic.lapsesCount || 0;
          const topicId = topic.id || `${subName}_${topic.name}`;
          const topicObj = { ...topic, id: topicId, subject: subName, pageCount: topicWeight, pageLabel, startPage, endPage };

          if (lapses >= (fsrsConfig.lapses?.leechThreshold ?? 8) || topic.isLeech) {
            leeches.push(topicObj);
          }

          // A topic is NEW if it has 0 reviewCount and no lastReviewDate (has never completed a review session)
          const isUnstudied = (!topic.reviewCount || topic.reviewCount === 0) && !topic.lastReviewDate;
          const cleanName = topic.name.trim().toLowerCase();
          const isPickedForToday = activeNewTopicIds.has(topicId) ||
                                   activeNewTopicIds.has(cleanName) ||
                                   activeNewTopicIds.has(`${subName}_${topic.name}`) ||
                                   activeNewTopicIds.has(`${subName.toLowerCase()}_${cleanName}`) ||
                                   topic.isPickedForToday ||
                                   topic.activatedDate === todayStr;

          if (isUnstudied && isPickedForToday) {
            newItems.push(topicObj);
            newPages += topicWeight;
          } else if (topic.nextReviewDue) {
            if (topic.nextReviewDue < todayStr) {
              overdue.push(topicObj);
              reviewPages += topicWeight;
            } else if (topic.nextReviewDue === todayStr) {
              dueToday.push(topicObj);
              reviewPages += topicWeight;
            }
            // If topic.nextReviewDue > todayStr, it is scheduled for a future date and moves OUT of today's review list.
          } else if (!isUnstudied) {
            // Fallback: If topic has review history but no nextReviewDue set, keep in Due Today
            dueToday.push(topicObj);
            reviewPages += topicWeight;
          }
        });
      }
    });

    return {
      overdueTopics: overdue,
      dueTodayTopics: dueToday,
      newTopics: newItems,
      totalReviewPagesToday: reviewPages,
      totalNewPagesToday: newPages,
      leechTopics: leeches
    };
  }, [subjectTrackerData, fsrsConfig, activeNewTopicIds]);

  // Upcoming Exam Countdown from studySchedule
  const nextExam = useMemo(() => {
    if (!studySchedule) return null;
    const scheduleArray = Array.isArray(studySchedule)
      ? studySchedule
      : typeof studySchedule === 'object'
        ? Object.values(studySchedule)
        : [];
    if (scheduleArray.length === 0) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sorted = scheduleArray
      .filter(item => item && (item.date || item.examDate || item.dateStr))
      .map(item => ({ ...item, dateObj: new Date(item.date || item.examDate || item.dateStr) }))
      .filter(item => !isNaN(item.dateObj.getTime()) && item.dateObj >= today)
      .sort((a, b) => a.dateObj - b.dateObj);
    return sorted[0] || null;
  }, [studySchedule]);

  const handleMnemonicChange = (item, text) => {
    if (!item) return;
    const topicKey = item.id || item.name;
    setMnemonicNotes(prev => ({ ...prev, [topicKey]: text }));

    if (!item.subject || !subjectTrackerData) return;

    const subDoc = subjectTrackerData.find(d => d.subject === item.subject || d.subject?.toLowerCase() === item.subject?.toLowerCase());
    if (subDoc && subDoc.topics) {
      const clonedTopics = { ...subDoc.topics };
      let topicEntryKey = Object.keys(clonedTopics).find(k => k === item.name || clonedTopics[k]?.name === item.name || clonedTopics[k]?.id === item.id);
      if (topicEntryKey) {
        clonedTopics[topicEntryKey] = {
          ...clonedTopics[topicEntryKey],
          mnemonicNote: text
        };
        const targetDocId = subDoc.id || subDoc.subject.trim().toLowerCase();
        const updatedDoc = {
          ...subDoc,
          id: targetDocId,
          topics: clonedTopics,
          updatedAt: new Date().toISOString()
        };
        saveLocalSubjectTrackerDoc(targetDocId, updatedDoc).then(() => {
          if (typeof onUpdateSubjectDoc === 'function') {
            onUpdateSubjectDoc(updatedDoc);
          }
          setToastMessage('Note saved successfully');
          setTimeout(() => setToastMessage(''), 2500);
        }).catch(err => {
          console.error("Failed to save mnemonic note to IndexedDB:", err);
        });
      }
    }
  };

  const handleRemoveNewTopic = (topicToRemove) => {
    if (!topicToRemove) return;
    const todayStr = getLocalDateStr();
    const cleanName = topicToRemove.name ? topicToRemove.name.trim().toLowerCase() : '';
    const topicId = topicToRemove.id || `${topicToRemove.subject}_${topicToRemove.name}`;
    const subName = topicToRemove.subject || '';

    setActiveNewTopicIds(prev => {
      const next = new Set(prev);
      next.delete(topicId);
      next.delete(cleanName);
      next.delete(`${subName}_${topicToRemove.name}`);
      next.delete(`${subName.toLowerCase()}_${cleanName}`);

      saveActiveNewTopicIds(todayStr, Array.from(next)).catch(err => console.error("Failed to update active new topics in IndexedDB:", err));
      return next;
    });

    setToastMessage(`Removed "${topicToRemove.name}" from today's study list`);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const isReviewUnlimited = (dailyLimits.maxReviewPagesPerDay || 30) >= 9999;
  const isNewUnlimited = (dailyLimits.newPagesPerDay || 10) >= 9999;
  const isReviewOverCap = !isReviewUnlimited && totalReviewPagesToday > (dailyLimits.maxReviewPagesPerDay || 30);
  const isNewOverCap = !isNewUnlimited && totalNewPagesToday > (dailyLimits.newPagesPerDay || 10);

  return (
    <div className={`w-full space-y-6 relative pb-16 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
      {/* Interactive Visual Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl text-xs font-black shadow-2xl backdrop-blur-md border flex items-center gap-3 ${
              isDark ? 'bg-[#222730] text-white border-slate-700/80 neu-card-dark' : 'bg-white text-slate-800 border-slate-200/80 neu-card-light'
            }`}
          >
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate max-w-xs">{toastMessage}</span>
            {canUndo && (
              <button
                onClick={() => {
                  if (typeof onUndoRating === 'function') onUndoRating();
                  setToastMessage('');
                }}
                className="ml-2 px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 border border-amber-500/40 text-[10px] uppercase font-black tracking-wider transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Undo
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <FsrsSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        fsrsConfig={fsrsConfig}
        onSaveConfig={onSaveConfig}
        themeMode={themeMode}
        subjectTrackerData={subjectTrackerData}
      />

      {/* Header & Controls Bar */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className={`flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-3xl border shadow-lg shrink-0 ${
          isDark ? 'bg-[#222730] border-slate-700/60 neu-card-dark' : 'neu-card-light border-slate-200/80 bg-[#e6ecf5]'
        }`}
      >
        <div>
          <h2 className={`text-xl font-black tracking-tight flex items-center gap-2.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Brain className="w-6 h-6 text-indigo-500 animate-pulse" />
            <span>Smart Repetition Hub</span>
          </h2>
          <p className={`text-xs font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            FSRS-6 Memory Engine • Load-Balanced Queue • Chapter Revision
          </p>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
          {/* Permanent Undo Button */}
          <button
            onClick={onUndoRating}
            disabled={!canUndo}
            title="Undo last rating"
            className={`px-3.5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-1.5 ${
              canUndo
                ? isDark
                  ? 'neu-btn-dark text-amber-300 border border-amber-500/40 shadow-md active:scale-95 cursor-pointer'
                  : 'neu-btn-light text-amber-600 border border-amber-400/50 shadow-md active:scale-95 cursor-pointer'
                : isDark
                  ? 'bg-slate-900/60 text-slate-600 border border-slate-800 cursor-not-allowed'
                  : 'bg-slate-200/60 text-slate-400 border border-slate-300 cursor-not-allowed'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>

          {/* Permanent Redo Button */}
          <button
            onClick={onRedoRating}
            disabled={!canRedo}
            title="Redo rating"
            className={`px-3.5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-1.5 ${
              canRedo
                ? isDark
                  ? 'neu-btn-dark text-sky-300 border border-sky-500/40 shadow-md active:scale-95 cursor-pointer'
                  : 'neu-btn-light text-sky-600 border border-sky-400/50 shadow-md active:scale-95 cursor-pointer'
                : isDark
                  ? 'bg-slate-900/60 text-slate-600 border border-slate-800 cursor-not-allowed'
                  : 'bg-slate-200/60 text-slate-400 border border-slate-300 cursor-not-allowed'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Redo</span>
          </button>

          {/* Auto-Sync Badge */}
          <div className={`px-3.5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm border ${
            isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
            <Zap className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            <span>Auto-Synced</span>
          </div>

          {/* FSRS Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer border active:scale-95 ${
              isDark ? 'neu-btn-dark text-white border-slate-700' : 'neu-btn-light text-slate-800 border-slate-300'
            }`}
          >
            <span>⚙️</span>
            <span>Settings</span>
          </button>
        </div>
      </motion.div>

      {/* Subtab Switcher - Non-Scrollable Single Sliding Pill for Mobile & Desktop */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className={`relative grid grid-cols-3 p-1.5 rounded-2xl border w-full max-w-2xl shrink-0 select-none overflow-hidden ${
          isDark ? 'neu-pressed-dark border border-slate-700/60' : 'neu-pressed-light border border-slate-200/80'
        }`}
      >
        {/* Single Sliding Pill Indicator */}
        <div
          className={`absolute top-1.5 bottom-1.5 rounded-xl shadow-md ${
            isDark ? 'neu-btn-accent-dark' : 'neu-btn-accent-light'
          }`}
          style={{
            left: `calc(0.375rem + ${['queue', 'analytics', 'leeches'].indexOf(subTab)} * ((100% - 0.75rem) / 3))`,
            width: `calc((100% - 0.75rem) / 3)`,
            transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
          }}
        />

        <button
          type="button"
          onClick={() => setSubTab('queue')}
          className={`relative z-10 py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center transition-colors duration-300 px-1 text-center truncate ${
            subTab === 'queue' ? 'text-white font-extrabold' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="hidden sm:inline">⚡ Daily Study Hub ({overdueTopics.length + dueTodayTopics.length})</span>
          <span className="sm:hidden">⚡ Hub ({overdueTopics.length + dueTodayTopics.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('analytics')}
          className={`relative z-10 py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center transition-colors duration-300 px-1 text-center truncate ${
            subTab === 'analytics' ? 'text-white font-extrabold' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="hidden sm:inline">📊 Analytics & Forecast</span>
          <span className="sm:hidden">📊 Analytics</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('leeches')}
          className={`relative z-10 py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center transition-colors duration-300 px-1 text-center truncate ${
            subTab === 'leeches' ? 'text-white font-extrabold' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="hidden sm:inline">⚠️ Leech Revision ({leechTopics.length})</span>
          <span className="sm:hidden">⚠️ Leeches ({leechTopics.length})</span>
        </button>
      </motion.div>

      {/* Subtab 1: Daily Study Hub */}
      {subTab === 'queue' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Daily Page Limit Progress Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Review Pages Gauge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className={`p-5 rounded-2xl border shadow-md space-y-3 ${
                isDark ? 'bg-[#222730] border-slate-700/60 neu-card-dark' : 'bg-white border-slate-200/80 neu-card-light'
              }`}
            >
              <div className={`flex justify-between items-center text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                <span className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-500" /> Review Pages Load
                </span>
                <div className="flex items-center gap-2">
                  {isReviewOverCap && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 text-[10px] font-black uppercase border border-amber-500/40 animate-pulse">
                      ⚠️ Over Cap by {totalReviewPagesToday - dailyLimits.maxReviewPagesPerDay} pgs
                    </span>
                  )}
                  <span className="text-indigo-500 font-bold">
                    {isReviewUnlimited ? `${totalReviewPagesToday} pages (Unlimited)` : `${totalReviewPagesToday} / ${dailyLimits.maxReviewPagesPerDay} pages`}
                  </span>
                </div>
              </div>
              <div className={`w-full h-2.5 rounded-full overflow-hidden border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-200 border-slate-300/60'}`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isReviewOverCap ? 'bg-amber-500' : 'bg-indigo-500'}`}
                  style={{ width: `${isReviewUnlimited ? 100 : Math.min(100, Math.round((totalReviewPagesToday / (dailyLimits.maxReviewPagesPerDay || 1)) * 100))}%` }}
                />
              </div>
            </motion.div>

            {/* New Pages Gauge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className={`p-5 rounded-2xl border shadow-md space-y-3 ${
                isDark ? 'bg-[#222730] border-slate-700/60 neu-card-dark' : 'bg-white border-slate-200/80 neu-card-light'
              }`}
            >
              <div className={`flex justify-between items-center text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-500" /> New Topic Pages
                </span>
                <div className="flex items-center gap-2">
                  {isNewOverCap && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 text-[10px] font-black uppercase border border-amber-500/40 animate-pulse">
                      ⚠️ Over Cap by {totalNewPagesToday - dailyLimits.newPagesPerDay} pgs
                    </span>
                  )}
                  <span className="text-emerald-500 font-bold">
                    {isNewUnlimited ? `${totalNewPagesToday} pages (Unlimited)` : `${totalNewPagesToday} / ${dailyLimits.newPagesPerDay} pages`}
                  </span>
                </div>
              </div>
              <div className={`w-full h-2.5 rounded-full overflow-hidden border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-200 border-slate-300/60'}`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isNewOverCap ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${isNewUnlimited ? 100 : Math.min(100, Math.round((totalNewPagesToday / (dailyLimits.newPagesPerDay || 1)) * 100))}%` }}
                />
              </div>
            </motion.div>
          </div>

          {/* Exam Countdown Banner (If schedule exists) */}
          {nextExam && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm ${
                isDark
                  ? 'bg-gradient-to-r from-amber-500/10 via-slate-900 to-amber-500/10 border-amber-500/30'
                  : 'bg-gradient-to-r from-amber-500/10 via-amber-100/50 to-amber-500/10 border-amber-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-amber-500" />
                <div>
                  <div className="text-xs font-black text-amber-600 uppercase tracking-wider">Upcoming Exam Target</div>
                  <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{nextExam.subject || nextExam.title || 'CAMP Exam Target'}</div>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-600 text-xs font-black">
                {nextExam.date || 'Scheduled'}
              </span>
            </motion.div>
          )}

          {/* Topic Queue Lists */}
          <div className="space-y-6">
            {/* Overdue Queue */}
            {overdueTopics.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-rose-500 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Overdue Topics ({overdueTopics.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <AnimatePresence mode="popLayout">
                    {overdueTopics.map((topic, idx) => (
                      <TopicCard key={topic.id || (topic.subject + '_' + topic.name)} topic={topic} onRate={onRateTopic} onOpenNotes={onOpenNotesModal} isOverdue index={idx} isDark={isDark} />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Due Today Queue */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-indigo-500 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Due Today ({dueTodayTopics.length})
              </h4>
              {dueTodayTopics.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <AnimatePresence mode="popLayout">
                    {dueTodayTopics.map((topic, idx) => (
                      <TopicCard key={topic.id || (topic.subject + '_' + topic.name)} topic={topic} onRate={onRateTopic} onOpenNotes={onOpenNotesModal} index={idx} isDark={isDark} />
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className={`p-5 rounded-2xl border text-xs text-center font-semibold ${
                  isDark ? 'bg-slate-900/50 border-slate-700/40 text-slate-400' : 'bg-white/80 border-slate-200/80 text-slate-600 neu-pressed-light'
                }`}>
                  🎉 All reviews for today are completed! Check out New Topics below or review your analytics.
                </div>
              )}
            </div>

            {/* New Topics Queue */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-500 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> New Topics Available ({newTopics.length})
                </h4>

                <button
                  onClick={() => setIsPickModalOpen(true)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 border ${
                    isDark
                      ? 'neu-btn-dark text-emerald-400 border-emerald-500/40'
                      : 'neu-btn-light text-emerald-700 border-emerald-300'
                  }`}
                >
                  <span>➕ Pick Today's New Topics</span>
                </button>
              </div>

              {newTopics.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <AnimatePresence mode="popLayout">
                    {newTopics.slice(0, 6).map((topic, idx) => (
                      <TopicCard
                        key={topic.id || (topic.subject + '_' + topic.name)}
                        topic={topic}
                        onRate={onRateTopic}
                        onRemove={handleRemoveNewTopic}
                        onOpenNotes={onOpenNotesModal}
                        isNew
                        index={idx}
                        isDark={isDark}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className={`p-6 rounded-2xl border text-center space-y-2 ${
                  isDark ? 'bg-slate-900/40 border-slate-700/40 text-slate-400' : 'bg-white/80 border-slate-200/80 text-slate-600 neu-pressed-light'
                }`}>
                  <div className="text-xs font-bold text-slate-300">No new topics selected for today yet</div>
                  <p className="text-[11px] text-slate-400">Click <strong className="text-emerald-400">"➕ Pick Today's New Topics"</strong> above to manually choose or get AI-recommended topics for today's study session.</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Select New Topics Modal */}
      <SelectNewTopicsModal
        isOpen={isPickModalOpen}
        onClose={() => setIsPickModalOpen(false)}
        subjectTrackerData={subjectTrackerData}
        studyLogs={studyLogs}
        studySchedule={studySchedule}
        dailyLimits={dailyLimits}
        geminiApiKey={geminiApiKey}
        aiFeatureModels={aiFeatureModels}
        themeMode={themeMode}
        onActivateTopics={(selectedTopics) => {
          const todayStr = getLocalDateStr();
          const activatedIds = selectedTopics.flatMap(t => [
            t.id,
            `${t.subject}_${t.name}`,
            t.name ? t.name.trim().toLowerCase() : '',
            t.subject && t.name ? `${t.subject.toLowerCase()}_${t.name.trim().toLowerCase()}` : ''
          ]).filter(Boolean);

          setActiveNewTopicIds(prev => {
            const next = new Set(prev);
            activatedIds.forEach(id => next.add(id));
            saveActiveNewTopicIds(todayStr, Array.from(next)).catch(err => console.error("Failed to save active new topic IDs to IndexedDB:", err));
            return next;
          });
          setToastMessage(`Activated ${selectedTopics.length} new topics for today's study session!`);
          setTimeout(() => setToastMessage(''), 3000);
        }}
      />

      {/* Subtab 2: Analytics & Forecast */}
      {subTab === 'analytics' && (
        <FsrsStatsTab
          subjectTrackerData={subjectTrackerData}
          studyLogs={studyLogs}
          fsrsConfig={fsrsConfig}
          themeMode={themeMode}
        />
      )}

      {/* Subtab 3: Leech Revision */}
      {subTab === 'leeches' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-md ${
            isDark ? 'bg-[#222730] border-slate-700/60 neu-card-dark' : 'bg-white border-slate-200/80 neu-card-light'
          }`}>
            <div>
              <h3 className={`text-sm font-black flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <span>⚠️</span> Leech Topics Focus Workspace ({leechTopics.length})
              </h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Topics with high lapse counts needing mnemonic notes or focused review</p>
            </div>
          </div>

          {leechTopics.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {leechTopics.map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.04 }}
                  className={`p-5 rounded-2xl border shadow-md space-y-3 ${
                    isDark ? 'bg-[#222730] border-amber-500/40 neu-card-dark' : 'bg-white border-amber-300 neu-card-light'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-black text-amber-600">{item.name}</div>
                      <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{item.subject} • <span className="font-mono text-amber-500 font-bold">{getTopicPageInfo(item).pageLabel}</span></div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-600 text-xs font-black uppercase">
                      {item.lapses || item.lapsesCount || 0} Lapses
                    </span>
                  </div>

                  {/* Mnemonic Note Input */}
                  <div className="space-y-1">
                    <label className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Mnemonic Note / Revision Memory Cue</label>
                    <textarea
                      value={mnemonicNotes[item.id || item.name] !== undefined ? mnemonicNotes[item.id || item.name] : (item.mnemonicNote || '')}
                      onChange={(e) => handleMnemonicChange(item, e.target.value)}
                      onBlur={(e) => handleMnemonicChange(item, e.target.value)}
                      placeholder="Write a mnemonic or key memory clue..."
                      className={`w-full p-2.5 rounded-xl text-xs focus:outline-none focus:border-amber-500/60 resize-none h-16 no-scrollbar ${
                        isDark ? 'bg-slate-900/80 border border-slate-700 text-slate-200' : 'bg-slate-50 border border-slate-300 text-slate-800 neu-pressed-light'
                      }`}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className={`p-8 rounded-2xl border text-center space-y-2 ${
              isDark ? 'bg-slate-900/40 border-slate-700/40' : 'bg-white/80 border-slate-200/80 neu-pressed-light'
            }`}>
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
              <div className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>No Problematic Leech Topics Detected</div>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>All textbook chapter topics are within acceptable lapse thresholds!</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// Sub-component: Individual Topic Queue Card
function TopicCard({ topic, onRate, onRemove, onOpenNotes, isOverdue = false, isNew = false, index = 0, isDark = true }) {
  const { pageLabel, pageCount } = getTopicPageInfo(topic);
  const [isNotesExpanded, setIsNotesExpanded] = useState(!!topic.notes);

  // Sync state if topic.notes becomes available
  useEffect(() => {
    if (topic.notes) {
      setIsNotesExpanded(true);
    }
  }, [topic.notes]);

  // A topic is truly reviewed only if reviewCount > 0 AND it has a lastReviewDate AND is not in New queue
  const isReviewed = !isNew && (topic.reviewCount || 0) > 0 && !!topic.lastReviewDate;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, y: 12, transition: { duration: 0.2 } }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      whileHover={{ y: -2 }}
      className={`p-4 rounded-2xl border shadow-md space-y-3 transition-transform ${
        isDark ? 'bg-[#222730] neu-card-dark' : 'bg-white neu-card-light'
      } ${
        isOverdue ? 'border-rose-500/40' : isNew ? 'border-emerald-500/40' : isDark ? 'border-slate-700/60' : 'border-slate-200/80'
      }`}
    >
      <div className="flex justify-between items-start gap-2">
        <div>
          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
            isDark ? 'bg-slate-800 text-indigo-300 border-slate-700' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
          }`}>
            {topic.subject}
          </span>
          <h5 className={`text-sm font-bold mt-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>{topic.name}</h5>
          <p className={`text-[11px] font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <span className={`font-mono font-bold ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>{pageLabel}</span> • {pageCount} {pageCount === 1 ? 'page' : 'pages'}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="text-right mr-1">
            <div className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              S: <span className="text-sky-500 font-bold">{isReviewed && topic.stability != null ? `${topic.stability.toFixed(1)}d` : 'New'}</span>
            </div>
            <div className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              D: <span className="text-amber-500 font-bold">{isReviewed && topic.difficulty != null ? topic.difficulty.toFixed(1) : 'Unstudied'}</span>
            </div>
          </div>

          {/* Toggle Collapsible Topic Notes Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsNotesExpanded(prev => !prev);
            }}
            title={isNotesExpanded ? "Collapse Topic Notes" : topic.notes ? "Expand Topic Notes" : "Add/Expand Topic Notes"}
            className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
              isNotesExpanded || topic.notes
                ? isDark
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30 ring-1 ring-amber-500/20'
                  : 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 ring-1 ring-amber-400/30'
                : isDark
                  ? 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                  : 'bg-slate-100 text-slate-500 hover:text-slate-900 border-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
          </button>

          {/* Remove button for New Topics */}
          {isNew && onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(topic);
              }}
              title="Remove from Today's Queue"
              className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                isDark
                  ? 'bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border-slate-700 hover:border-rose-500/40'
                  : 'bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border-slate-200 hover:border-rose-300'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Rich Text Notes Section */}
      <AnimatePresence>
        {isNotesExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden space-y-1.5 pt-2 border-t border-slate-700/40 dark:border-slate-800/60"
          >
            <div className="flex items-center justify-between">
              <span className={`text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                <FileText className="w-3 h-3" /> High-Yield Notes
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (typeof onOpenNotes === 'function') {
                    onOpenNotes(topic);
                  }
                }}
                className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border transition ${
                  isDark ? 'neu-btn-dark text-blue-400 hover:text-blue-300 border-slate-700' : 'neu-btn-light text-blue-600 border-slate-300'
                }`}
              >
                ✏️ Edit Notes
              </button>
            </div>

            {topic.notes ? (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (typeof onOpenNotes === 'function') {
                    onOpenNotes(topic);
                  }
                }}
                className={`p-3 rounded-xl text-xs leading-relaxed max-h-36 overflow-y-auto cursor-pointer transition border rich-text-notes ${
                  isDark ? 'neu-pressed-dark text-slate-200 border-slate-800 hover:border-amber-500/40' : 'neu-pressed-light text-slate-800 border-slate-200 hover:border-amber-400'
                }`}
                dangerouslySetInnerHTML={{ __html: topic.notes }}
              />
            ) : (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (typeof onOpenNotes === 'function') {
                    onOpenNotes(topic);
                  }
                }}
                className={`p-3 rounded-xl text-[11px] italic border border-dashed cursor-pointer transition ${
                  isDark ? 'text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700' : 'text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
                }`}
              >
                No rich notes added yet. Click here to open editor window and add mnemonics, clinical pearls, or bullet lists...
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4 Rating Buttons */}
      <div className="grid grid-cols-4 gap-1.5 pt-1">
        <button
          onClick={() => onRate && onRate(topic, 1)}
          className="py-1.5 rounded-xl text-[10px] font-black bg-rose-500/20 hover:bg-rose-500/30 text-rose-500 border border-rose-500/30 active:scale-95 transition-all cursor-pointer"
        >
          Again (1)
        </button>
        <button
          onClick={() => onRate && onRate(topic, 2)}
          className="py-1.5 rounded-xl text-[10px] font-black bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 border border-amber-500/30 active:scale-95 transition-all cursor-pointer"
        >
          Hard (2)
        </button>
        <button
          onClick={() => onRate && onRate(topic, 3)}
          className="py-1.5 rounded-xl text-[10px] font-black bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-600 border border-indigo-500/30 active:scale-95 transition-all cursor-pointer"
        >
          Good (3)
        </button>
        <button
          onClick={() => onRate && onRate(topic, 4)}
          className="py-1.5 rounded-xl text-[10px] font-black bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-600 border border-emerald-500/30 active:scale-95 transition-all cursor-pointer"
        >
          Easy (4)
        </button>
      </div>
    </motion.div>
  );
}

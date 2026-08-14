import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Calendar, AlertTriangle, CheckCircle, Clock, BookOpen, Layers, Sparkles, RotateCcw, RotateCw, Zap, Undo2, X, FileText, Plus, Trash2, Edit3, Target, Search } from 'lucide-react';
import FsrsStatsTab from './FsrsStatsTab';
import FsrsSettingsModal from './FsrsSettingsModal';
import SelectNewTopicsModal from './SelectNewTopicsModal';
import { saveLocalSubjectTrackerDoc, getActiveNewTopicIds, saveActiveNewTopicIds, getTopicHintsLocal, deleteTopicHintsLocal, getLocalPytTopic, getLocalTextbooksMetadata } from '../services/localDb';
import { generateTopicActiveRecallHints } from '../services/aiHintEngine';
import { Lightbulb, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { parsePageNumbers, getTopicPageWeight } from '../utils/pageUtils';
import { calculateNextFSRSState, ensureCalibratedWeights } from '../services/fsrsEngine';
import PdfSlicePreviewModal from './PdfSlicePreviewModal';
import { extractTopicPdfSlice } from '../services/pdfSliceService';

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
  examProfiles = [],
  onSaveExamProfiles,
  onUpdateSubjectDoc,
  geminiApiKey = '',
  aiFeatureModels = {},
  onOpenNotesModal
}) {
  const isDark = themeMode === 'dark';
  const [subTab, setSubTab] = useState('queue'); // 'queue', 'analytics', 'leeches'
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPickModalOpen, setIsPickModalOpen] = useState(false);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [isAdHocModalOpen, setIsAdHocModalOpen] = useState(false);
  const [adHocSearch, setAdHocSearch] = useState('');
  const [adHocSelectedSubject, setAdHocSelectedSubject] = useState('all');
  const [adHocActiveTopic, setAdHocActiveTopic] = useState(null);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamDate, setNewExamDate] = useState('');
  const [newExamTentative, setNewExamTentative] = useState(false);
  const [activeNewTopicIds, setActiveNewTopicIds] = useState(new Set());
  const [mnemonicNotes, setMnemonicNotes] = useState({});
  const [toastMessage, setToastMessage] = useState('');

  const handleAddExamTarget = () => {
    if (!newExamTitle.trim() || !newExamDate) return;
    const newEntry = {
      id: Date.now().toString(),
      name: newExamTitle.trim(),
      title: newExamTitle.trim(),
      date: newExamDate,
      examDate: newExamDate,
      isTentative: newExamTentative
    };
    const updated = Array.isArray(examProfiles) ? [...examProfiles, newEntry] : [newEntry];
    if (typeof onSaveExamProfiles === 'function') onSaveExamProfiles(updated);
    setNewExamTitle('');
    setNewExamDate('');
    setNewExamTentative(false);
  };

  const handleDeleteExamTarget = (idOrIndex) => {
    if (!Array.isArray(examProfiles)) return;
    const updated = examProfiles.filter((item, idx) => (item.id ? item.id !== idOrIndex : idx !== idOrIndex));
    if (typeof onSaveExamProfiles === 'function') onSaveExamProfiles(updated);
  };

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
          } else if (!isUnstudied) {
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
      leechTopics: leeches,
      totalReviewPagesToday: reviewPages,
      totalNewPagesToday: newPages
    };
  }, [subjectTrackerData, fsrsConfig, activeNewTopicIds]);

  // Timezone-safe date parser
  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;
    if (typeof dateStr === 'string') {
      const cleanStr = dateStr.split('T')[0];
      if (cleanStr.includes('-')) {
        const [y, m, d] = cleanStr.split('-').map(Number);
        if (y && m && d) return new Date(y, m - 1, d);
      }
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  };

  // Upcoming Exam Countdown from examProfiles or explicitly tagged studySchedule entries
  const nextExam = useMemo(() => {
    const candidates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Check examProfiles if provided
    if (Array.isArray(examProfiles)) {
      examProfiles.forEach(prof => {
        if (!prof) return;
        const dStr = prof.date || prof.examDate || prof.targetDate;
        const dObj = parseLocalDate(dStr);
        if (dObj && dObj >= today) {
          candidates.push({
            title: prof.name || prof.title || prof.examTitle || 'Competitive Exam',
            dateStr: dStr,
            dateObj: dObj,
            isTentative: Boolean(prof.isTentative)
          });
        }
      });
    }

    // 2. Check studySchedule items specifically tagged as exams (isExam, isExamTarget, examTitle, type === 'exam')
    if (studySchedule) {
      const scheduleArray = Array.isArray(studySchedule)
        ? studySchedule
        : typeof studySchedule === 'object'
          ? Object.values(studySchedule)
          : [];

      scheduleArray.forEach(item => {
        if (!item) return;
        const dStr = item.date || item.examDate || item.dateStr;
        const dObj = parseLocalDate(dStr);
        if (!dObj || dObj < today) return;

        // Strictly check if explicitly marked as an exam target (do NOT match ordinary daily revision tasks)
        const isExplicitExam = Boolean(item.isExam || item.isExamTarget || item.examTitle || item.type === 'exam');
        if (isExplicitExam) {
          const title = item.examTitle || item.title || item.subject || 'Competitive Exam Target';
          candidates.push({
            title,
            dateStr: dStr,
            dateObj: dObj,
            isTentative: Boolean(item.isTentative)
          });
        }
      });
    }

    if (candidates.length === 0) return null;

    // Sort by earliest upcoming date
    candidates.sort((a, b) => a.dateObj - b.dateObj);
    const chosen = candidates[0];

    // Compute dynamic countdown
    const diffMs = chosen.dateObj.getTime() - today.getTime();
    const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24));

    let countdownText = '';
    if (daysLeft === 0) {
      countdownText = '🎉 Exam Today!';
    } else if (daysLeft === 1) {
      countdownText = '🔥 Tomorrow!';
    } else if (daysLeft > 1 && daysLeft <= 14) {
      countdownText = `⏳ ${daysLeft} Days Left`;
    } else if (daysLeft > 14) {
      const weeks = Math.floor(daysLeft / 7);
      const remDays = daysLeft % 7;
      countdownText = remDays > 0 ? `⏳ ${weeks}w ${remDays}d Left` : `⏳ ${weeks} Weeks Left`;
    }

    return {
      ...chosen,
      daysLeft,
      countdownText
    };
  }, [studySchedule, examProfiles]);

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

          {/* Ad-Hoc / Early Review Button */}
          <button
            type="button"
            onClick={() => setIsAdHocModalOpen(true)}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider shadow-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer border active:scale-95 ${
              isDark
                ? 'neu-btn-dark text-amber-400 border-amber-500/40 hover:border-amber-500/80'
                : 'neu-btn-light text-amber-700 border-amber-300 hover:border-amber-400'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Ad-hoc Review</span>
          </button>

          {/* FSRS Settings Button */}
          <button
            type="button"
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

          {/* Exam Target Banner */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm ${
              isDark
                ? 'bg-gradient-to-r from-amber-500/10 via-slate-900 to-amber-500/10 border-amber-500/30'
                : 'bg-gradient-to-r from-amber-500/10 via-amber-100/50 to-amber-500/10 border-amber-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-amber-500 shrink-0" />
              <div>
                <div className="text-xs font-black text-amber-600 uppercase tracking-wider flex items-center gap-2">
                  <span>Upcoming Exam Target</span>
                </div>
                <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {nextExam ? nextExam.title : 'No Exam Date Configured'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {nextExam ? (
                <>
                  <span className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-600 text-xs font-black">
                    {nextExam.countdownText}
                  </span>
                  {nextExam.dateStr && (
                    <span className={`text-[11px] font-semibold opacity-75 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      ({nextExam.dateStr})
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsExamModalOpen(true)}
                    className={`ml-1 px-3 py-1 rounded-xl text-xs font-bold border transition-all ${
                      isDark ? 'neu-btn-dark text-amber-400 hover:border-amber-500/50' : 'neu-btn-light text-amber-700 hover:border-amber-400'
                    }`}
                  >
                    Edit / Manage
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsExamModalOpen(true)}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-xs shadow-sm hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Set Exam Target Date
                </button>
              )}
            </div>
          </motion.div>

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
                      <TopicCard key={topic.id || (topic.subject + '_' + topic.name)} topic={topic} onRate={onRateTopic} onOpenNotes={onOpenNotesModal} fsrsConfig={fsrsConfig} isOverdue index={idx} isDark={isDark} geminiApiKey={geminiApiKey} aiFeatureModels={aiFeatureModels} subjectTrackerData={subjectTrackerData} />
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
                      <TopicCard key={topic.id || (topic.subject + '_' + topic.name)} topic={topic} onRate={onRateTopic} onOpenNotes={onOpenNotesModal} fsrsConfig={fsrsConfig} index={idx} isDark={isDark} geminiApiKey={geminiApiKey} aiFeatureModels={aiFeatureModels} subjectTrackerData={subjectTrackerData} />
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
                        fsrsConfig={fsrsConfig}
                        isNew
                        index={idx}
                        isDark={isDark}
                        geminiApiKey={geminiApiKey}
                        aiFeatureModels={aiFeatureModels}
                        subjectTrackerData={subjectTrackerData}
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

      {/* EXAM TARGET MANAGEMENT MODAL */}
      <AnimatePresence>
        {isExamModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className={`w-full max-w-lg p-6 rounded-3xl border shadow-2xl space-y-6 ${
                isDark ? 'bg-[#222730] border-slate-700/80 text-white' : 'bg-[#e6ecf5] border-slate-300 text-slate-900'
              }`}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b pb-3 border-slate-700/40">
                <div className="flex items-center gap-2.5">
                  <Target className="w-5 h-5 text-amber-500" />
                  <h3 className="text-base font-black tracking-wide">Upcoming Exam Targets</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExamModalOpen(false)}
                  className={`p-1.5 rounded-xl border transition-all ${
                    isDark ? 'neu-btn-dark text-slate-400 hover:text-white' : 'neu-btn-light text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Add New Exam Form */}
              <div className="space-y-3 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add Exam Target
                </h4>
                
                {/* Presets */}
                <div className="flex flex-wrap gap-1.5">
                  {['NEET PG 2026', 'INI-CET 2026', 'FMGE 2026', 'USMLE Step 1'].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNewExamTitle(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                        newExamTitle === preset
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold'
                          : isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:border-amber-500/50' : 'bg-white border-slate-300 text-slate-700 hover:border-amber-400'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-amber-600 mb-1">Exam Title / Name</label>
                    <input
                      type="text"
                      placeholder="e.g. NEET PG 2026"
                      value={newExamTitle}
                      onChange={(e) => setNewExamTitle(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-semibold border outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-amber-600 mb-1">Exam Date</label>
                    <input
                      type="date"
                      value={newExamDate}
                      onChange={(e) => setNewExamDate(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-semibold border outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-400">
                    <input
                      type="checkbox"
                      checked={newExamTentative}
                      onChange={(e) => setNewExamTentative(e.target.checked)}
                      className="rounded accent-amber-500"
                    />
                    Tentative Date
                  </label>
                  <button
                    type="button"
                    onClick={handleAddExamTarget}
                    disabled={!newExamTitle.trim() || !newExamDate}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-xs shadow-md disabled:opacity-40 hover:brightness-110 transition-all cursor-pointer"
                  >
                    Save Exam Target
                  </button>
                </div>
              </div>

              {/* Active Exam Targets List */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider opacity-75">Saved Exam Targets ({examProfiles.length})</h4>
                {examProfiles.length === 0 ? (
                  <div className="text-center py-4 text-xs font-semibold text-slate-400 italic">No exam target saved yet. Add one above!</div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {examProfiles.map((exam, idx) => (
                      <div
                        key={exam.id || idx}
                        className={`p-3 rounded-xl border flex items-center justify-between ${
                          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Calendar className="w-4 h-4 text-amber-500" />
                          <div>
                            <div className="text-xs font-bold">{exam.name || exam.title || 'Exam Target'}</div>
                            <div className="text-[10px] text-slate-400">
                              {exam.date || exam.examDate} {exam.isTentative ? '(Tentative)' : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteExamTarget(exam.id || idx)}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
                          title="Delete Exam Target"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsExamModalOpen(false)}
                  className={`px-5 py-2 rounded-xl text-xs font-bold border transition-all ${
                    isDark ? 'neu-btn-dark text-slate-300' : 'neu-btn-light text-slate-700'
                  }`}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AD-HOC / EARLY REVIEW MODAL */}
      <AnimatePresence>
        {isAdHocModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className={`w-full max-w-2xl p-6 rounded-3xl border shadow-2xl space-y-5 max-h-[85vh] flex flex-col ${
                isDark ? 'bg-[#222730] border-slate-700/80 text-white' : 'bg-[#e6ecf5] border-slate-300 text-slate-900'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b pb-3 border-slate-700/40 shrink-0">
                <div className="flex items-center gap-2.5">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <div>
                    <h3 className="text-base font-black tracking-wide">⚡ Ad-hoc / Early Review Workspace</h3>
                    <p className="text-[11px] text-slate-400">Review any topic from your curriculum ahead of schedule. FSRS-6 will automatically update memory retention!</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdHocModalOpen(false);
                    setAdHocActiveTopic(null);
                  }}
                  className={`p-1.5 rounded-xl border transition-all ${
                    isDark ? 'neu-btn-dark text-slate-400 hover:text-white' : 'neu-btn-light text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* If rating a topic inside modal */}
              {adHocActiveTopic ? (
                <div className="space-y-4 overflow-y-auto p-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setAdHocActiveTopic(null)}
                      className="text-xs font-bold text-amber-500 hover:underline flex items-center gap-1"
                    >
                      ← Back to Search
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                      Ad-hoc Review Mode
                    </span>
                  </div>

                  <TopicCard
                    topic={adHocActiveTopic}
                    onRate={(topicToRate, rating) => {
                      if (typeof onRateTopic === 'function') {
                        onRateTopic(topicToRate, rating);
                      }
                      setAdHocActiveTopic(null);
                      setToastMessage(`⚡ Ad-hoc review recorded for "${topicToRate.name}"!`);
                      setTimeout(() => setToastMessage(''), 3500);
                    }}
                    onOpenNotes={onOpenNotesModal}
                    fsrsConfig={fsrsConfig}
                    isDark={isDark}
                    geminiApiKey={geminiApiKey}
                    aiFeatureModels={aiFeatureModels}
                    subjectTrackerData={subjectTrackerData}
                  />
                </div>
              ) : (
                /* Search & Select Topic View */
                <div className="space-y-4 overflow-hidden flex flex-col flex-1">
                  {/* Search Bar & Subject Filter */}
                  <div className="space-y-2 shrink-0">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        placeholder="Search topic or chapter name (e.g., Brachial Plexus, Antihypertensives)..."
                        value={adHocSearch}
                        onChange={(e) => setAdHocSearch(e.target.value)}
                        className={`w-full pl-10 pr-4 py-2.5 rounded-2xl text-xs font-semibold border outline-none ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>

                    {/* Subject Filter Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                      <button
                        type="button"
                        onClick={() => setAdHocSelectedSubject('all')}
                        className={`px-3 py-1 rounded-xl text-[11px] font-bold border transition-all ${
                          adHocSelectedSubject === 'all'
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-300 text-slate-700'
                        }`}
                      >
                        All Subjects
                      </button>
                      {subjectTrackerData.map(subDoc => (
                        <button
                          key={subDoc.subject}
                          type="button"
                          onClick={() => setAdHocSelectedSubject(subDoc.subject)}
                          className={`px-3 py-1 rounded-xl text-[11px] font-bold border transition-all ${
                            adHocSelectedSubject === subDoc.subject
                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                              : isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-300 text-slate-700'
                          }`}
                        >
                          {subDoc.subject}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Topics List */}
                  <div className="space-y-2 overflow-y-auto pr-1 flex-1 min-h-[250px]">
                    {(() => {
                      const allTopics = [];
                      subjectTrackerData.forEach(subDoc => {
                        if (adHocSelectedSubject !== 'all' && subDoc.subject !== adHocSelectedSubject) return;
                        if (subDoc.topics) {
                          Object.values(subDoc.topics).forEach(t => {
                            if (!t || !t.name) return;
                            const matchesSearch = !adHocSearch.trim() ||
                              t.name.toLowerCase().includes(adHocSearch.toLowerCase()) ||
                              subDoc.subject.toLowerCase().includes(adHocSearch.toLowerCase());
                            if (matchesSearch) {
                              allTopics.push({ ...t, subject: subDoc.subject });
                            }
                          });
                        }
                      });

                      if (allTopics.length === 0) {
                        return (
                          <div className="text-center py-10 text-xs font-semibold text-slate-400 italic">
                            No matching topics found. Try typing a different keyword!
                          </div>
                        );
                      }

                      return allTopics.map((topic, idx) => (
                        <div
                          key={topic.id || idx}
                          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                            isDark ? 'bg-slate-900/80 border-slate-800 hover:border-amber-500/40' : 'bg-white border-slate-200 hover:border-amber-400'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-wider text-amber-500 px-2 py-0.5 rounded-md bg-amber-500/10">
                                {topic.subject}
                              </span>
                              <span className="text-xs font-bold">{topic.name}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-3">
                              <span>Due: {topic.nextReviewDue || 'Unscheduled'}</span>
                              <span>Reviews: {topic.reviewCount || 0}</span>
                              {topic.stability && <span>Stability: {topic.stability}d</span>}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setAdHocActiveTopic(topic)}
                            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition-all active:scale-95 cursor-pointer shrink-0"
                          >
                            ⚡ Review Now
                          </button>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Sub-component: Recursive Node for Arbitrary N-Level Tree Outline (Mind Map)
function RecursiveBlueprintNode({ node, depth = 0, recalledMap, onToggleRecall, expandedMap, onToggleExpand, isDark }) {
  if (!node) return null;

  const nodeId = node.id || node.title || Math.random().toString();
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isExpanded = expandedMap[nodeId] !== undefined ? expandedMap[nodeId] : true; // Default open
  const isRecalled = !!recalledMap[nodeId];

  // Dynamic Level Badges & Colors
  const levelColors = [
    { badge: 'L1', bg: 'bg-amber-500/20 text-amber-400', border: 'border-amber-500/30' },
    { badge: 'L2', bg: 'bg-blue-500/20 text-blue-400', border: 'border-blue-500/30' },
    { badge: 'L3', bg: 'bg-emerald-500/20 text-emerald-400', border: 'border-emerald-500/30' },
    { badge: 'L4', bg: 'bg-purple-500/20 text-purple-400', border: 'border-purple-500/30' },
    { badge: 'L5', bg: 'bg-indigo-500/20 text-indigo-400', border: 'border-indigo-500/30' }
  ];
  const styleCfg = levelColors[Math.min(depth, levelColors.length - 1)];

  return (
    <div className="space-y-1">
      <div
        onClick={(e) => {
          e.stopPropagation();
          onToggleRecall(nodeId);
        }}
        style={{ paddingLeft: `${Math.min(depth, 6) * 12 + 8}px` }}
        className={`py-2 px-2.5 rounded-xl text-xs font-medium border flex items-start gap-2 transition-all cursor-pointer select-none active:scale-[0.99] ${
          isRecalled
            ? isDark
              ? 'bg-emerald-950/40 text-emerald-200 border-emerald-500/40'
              : 'bg-emerald-50 text-emerald-900 border-emerald-300'
            : isDark
              ? 'neu-pressed-dark text-slate-300 border-slate-800 hover:border-slate-700'
              : 'neu-pressed-light text-slate-700 border-slate-200 hover:border-slate-300'
        }`}
      >
        {/* Recalled Checkbox */}
        <input
          type="checkbox"
          checked={isRecalled}
          onChange={() => {}}
          className="mt-0.5 w-3.5 h-3.5 rounded accent-emerald-500 cursor-pointer shrink-0"
        />

        {/* Expand/Collapse Toggle Button for Parent Nodes */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(nodeId);
            }}
            className="p-0.5 rounded hover:bg-slate-700/40 text-amber-400 shrink-0 transition mt-0.5"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {/* Node Content */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-1.5 py-0.2 rounded text-[8px] font-black font-mono shrink-0 ${styleCfg.bg}`}>
              {styleCfg.badge}
            </span>
            <span className={`font-bold text-xs tracking-tight ${isRecalled ? 'line-through opacity-85' : isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {node.title}
            </span>
          </div>

          {node.prompt && (
            <p className={`text-[11px] leading-relaxed italic ${isRecalled ? 'line-through opacity-70' : isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              💡 {node.prompt}
            </p>
          )}
        </div>
      </div>

      {/* Recursive Render Children */}
      {hasChildren && isExpanded && (
        <div className="space-y-1 border-l-2 border-slate-800/80 ml-2.5 pl-1">
          {node.children.map((child, cIdx) => (
            <RecursiveBlueprintNode
              key={child.id || child.title || cIdx}
              node={child}
              depth={depth + 1}
              recalledMap={recalledMap}
              onToggleRecall={onToggleRecall}
              expandedMap={expandedMap}
              onToggleExpand={onToggleExpand}
              isDark={isDark}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Sub-component: Individual Topic Queue Card
function TopicCard({ topic, onRate, onRemove, onOpenNotes, fsrsConfig, isOverdue = false, isNew = false, index = 0, isDark = true, geminiApiKey = '', aiFeatureModels = {}, subjectTrackerData = [] }) {
  const { pageLabel, pageCount } = getTopicPageInfo(topic);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);

  // --- ACTIVE-RECALL HINT LADDER STATE ---
  const [topicHints, setTopicHints] = useState(null);
  const [isHintsExpanded, setIsHintsExpanded] = useState(false);
  const [isGeneratingHints, setIsGeneratingHints] = useState(false);
  const [revealedHintCount, setRevealedHintCount] = useState(1);
  const [hintError, setHintError] = useState(null);
  const [recalledPointsMap, setRecalledPointsMap] = useState({});
  const [expandedNodesMap, setExpandedNodesMap] = useState({});

  // Reset checkboxes when topic changes or starts a new review session
  useEffect(() => {
    setRecalledPointsMap({});
  }, [topic?.id, topic?.lastReview, topic?.reviewCount]);

  const handleToggleRecallNode = (targetNodeId) => {
    if (!topicHints?.tree || !Array.isArray(topicHints.tree)) {
      setRecalledPointsMap(prev => ({ ...prev, [targetNodeId]: !prev[targetNodeId] }));
      return;
    }

    const nextMap = { ...recalledPointsMap };
    const targetState = !nextMap[targetNodeId];

    // 1. Top-Down: Set target node and all its descendants to targetState
    function setDescendants(nodeList, targetId, forceState) {
      for (const node of nodeList) {
        const nodeId = node.id || node.title;
        if (nodeId === targetId || forceState !== null) {
          const applyState = forceState !== null ? forceState : targetState;
          nextMap[nodeId] = applyState;
          if (Array.isArray(node.children) && node.children.length > 0) {
            setDescendants(node.children, targetId, applyState);
          }
          if (nodeId === targetId) return true;
        } else if (Array.isArray(node.children) && node.children.length > 0) {
          const found = setDescendants(node.children, targetId, null);
          if (found) return true;
        }
      }
      return false;
    }

    setDescendants(topicHints.tree, targetNodeId, null);

    // 2. Bottom-Up: Sync parents so parent is checked ONLY if ALL children are checked
    function syncParentsBottomUp(nodeList) {
      let allChildrenChecked = true;
      for (const node of nodeList) {
        const nodeId = node.id || node.title;
        if (Array.isArray(node.children) && node.children.length > 0) {
          const childStatus = syncParentsBottomUp(node.children);
          nextMap[nodeId] = childStatus;
        }
        if (!nextMap[nodeId]) {
          allChildrenChecked = false;
        }
      }
      return allChildrenChecked;
    }

    syncParentsBottomUp(topicHints.tree);
    setRecalledPointsMap(nextMap);
  };

  const handleToggleExpandNode = (nodeId) => {
    setExpandedNodesMap(prev => {
      const current = prev[nodeId] !== undefined ? prev[nodeId] : true;
      return { ...prev, [nodeId]: !current };
    });
  };

  const treeMetrics = useMemo(() => {
    if (!topicHints?.tree || !Array.isArray(topicHints.tree)) return null;
    let totalNodes = 0;
    let recalledCount = 0;

    function countNodes(nodeList) {
      if (!Array.isArray(nodeList)) return;
      nodeList.forEach((n) => {
        totalNodes++;
        const nodeId = n.id || n.title;
        if (recalledPointsMap[nodeId]) recalledCount++;
        if (Array.isArray(n.children) && n.children.length > 0) {
          countNodes(n.children);
        }
      });
    }

    countNodes(topicHints.tree);
    const percent = totalNodes > 0 ? Math.round((recalledCount / totalNodes) * 100) : 0;
    return { totalNodes, recalledCount, percent };
  }, [topicHints, recalledPointsMap]);

  const blueprintMetrics = useMemo(() => {
    if (!topicHints?.structure || !Array.isArray(topicHints.structure)) return null;
    let totalTopics = topicHints.structure.length;
    let totalSubtopics = 0;
    let totalPoints = 0;
    let recalledCount = 0;

    topicHints.structure.forEach((topObj, tIdx) => {
      const subList = topObj.subtopics || [];
      totalSubtopics += subList.length;
      subList.forEach((subObj, sIdx) => {
        const pts = subObj.points || [];
        totalPoints += pts.length;
        pts.forEach((_, pIdx) => {
          const key = `${tIdx}_${sIdx}_${pIdx}`;
          if (recalledPointsMap[key]) recalledCount++;
        });
      });
    });

    const percent = totalPoints > 0 ? Math.round((recalledCount / totalPoints) * 100) : 0;
    return { totalTopics, totalSubtopics, totalPoints, recalledCount, percent };
  }, [topicHints, recalledPointsMap]);

  const handleDeleteHints = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!confirm(`Delete generated AI hints/outline for "${topic.name}"?\n(Your uploaded textbook PDF pages will remain preserved).`)) return;

    try {
      const topicId = topic.id || `${topic.subject}_${topic.name}`;
      await deleteTopicHintsLocal(topicId);
      setTopicHints(null);
      setRecalledPointsMap({});
    } catch (err) {
      console.error('Failed deleting hints:', err);
    }
  };

  // Load cached hints on mount or when topic changes
  useEffect(() => {
    let isMounted = true;
    async function loadCachedHints() {
      try {
        const topicId = topic.id || `${topic.subject}_${topic.name}`;
        const cached = await getTopicHintsLocal(topicId);
        const hasData = cached && (
          (Array.isArray(cached.tree) && cached.tree.length > 0) ||
          (Array.isArray(cached.structure) && cached.structure.length > 0) ||
          (Array.isArray(cached.hints) && cached.hints.length > 0)
        );
        if (isMounted && hasData) {
          setTopicHints(cached);
          setRevealedHintCount(1);
        }
      } catch (err) {
        console.warn('Failed loading cached topic hints:', err);
      }
    }
    loadCachedHints();
    return () => { isMounted = false; };
  }, [topic]);

  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewPdfSlice, setPreviewPdfSlice] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const handleOpenPreviewModal = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setIsLoadingPreview(true);
    setIsPreviewModalOpen(true);
    try {
      const subjectName = topic.subject || '';
      const topicName = topic.name || '';
      const cleanSub = subjectName.trim().toLowerCase().replace(/\s+/g, '_');
      const cleanTop = topicName.trim().toLowerCase().replace(/\s+/g, '_');
      const topicPdfKey = `pyt_pdf_${cleanSub}_topic_${cleanTop}`;
      let pdfObj = await getLocalPytTopic(topicPdfKey);
      let isPreSplit = false;

      let pdfArrayBuffer = pdfObj?.data || (pdfObj?.topics && pdfObj.topics.data) || (pdfObj?.topics instanceof ArrayBuffer ? pdfObj.topics : null);

      if (pdfObj && pdfArrayBuffer) {
        isPreSplit = true;
      } else {
        const masterPdfKey = `pyt_pdf_${cleanSub}`;
        pdfObj = await getLocalPytTopic(masterPdfKey);
        pdfArrayBuffer = pdfObj?.data || (pdfObj?.topics && pdfObj.topics.data) || (pdfObj?.topics instanceof ArrayBuffer ? pdfObj.topics : null);
      }

      if (!pdfObj || !pdfArrayBuffer) {
        alert(`No PDF attached for "${topicName}". Please upload a Master PDF or Pre-Split Topic PDF in Subject Tracker.`);
        setIsPreviewModalOpen(false);
        setIsLoadingPreview(false);
        return;
      }

      const metadataList = (await getLocalTextbooksMetadata()) || [];
      const meta = metadataList.find(tb => (tb.subject || '').toLowerCase() === subjectName.toLowerCase());
      const pageOffset = meta?.pageOffset || 0;

      const pageInfo = parsePageNumbers(topic);
      const startPage = pageInfo.startPage || 1;
      let endPage = pageInfo.endPage;

      if (!isPreSplit && !endPage) {
        const subDoc = (subjectTrackerData || []).find(s => (s.id || '').toLowerCase() === (subjectName || '').toLowerCase());
        const allTopics = subDoc?.topics ? Object.values(subDoc.topics) : [];
        const nextStartPages = allTopics
          .map(t => parsePageNumbers(t).startPage)
          .filter(p => p !== null && p > startPage)
          .sort((a, b) => a - b);

        if (nextStartPages.length > 0) {
          endPage = nextStartPages[0] - 1;
        } else {
          endPage = startPage + 10;
        }
      }

      const slice = await extractTopicPdfSlice({
        pdfArrayBuffer,
        startPage,
        endPage,
        pageOffset,
        isPreSplit
      });

      setPreviewPdfSlice(slice);
    } catch (err) {
      console.error('Failed loading preview slice:', err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleGenerateHints = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setHintError(null);

    if (!geminiApiKey) {
      alert('⚠️ Missing Gemini API Key!\nPlease add your Gemini API Key in the Settings page to generate AI Active-Recall hints.');
      return;
    }

    try {
      setIsGeneratingHints(true);
      const subjectName = topic.subject || '';
      const topicName = topic.name || '';

      // 1. Check if a pre-split topic PDF exists in IndexedDB (Scenario 2)
      const cleanSub = subjectName.trim().toLowerCase().replace(/\s+/g, '_');
      const cleanTop = topicName.trim().toLowerCase().replace(/\s+/g, '_');
      const topicPdfKey = `pyt_pdf_${cleanSub}_topic_${cleanTop}`;
      let pdfObj = await getLocalPytTopic(topicPdfKey);
      let isPreSplit = false;

      let pdfArrayBuffer = pdfObj?.data || (pdfObj?.topics && pdfObj.topics.data) || (pdfObj?.topics instanceof ArrayBuffer ? pdfObj.topics : null);

      if (pdfObj && pdfArrayBuffer) {
        isPreSplit = true;
        console.log(`[SmartReviewHub] Found Pre-Split Topic PDF for "${topicName}"!`);
      } else {
        // 2. Fall back to Master Subject PDF (Scenario 1)
        const masterPdfKey = `pyt_pdf_${cleanSub}`;
        pdfObj = await getLocalPytTopic(masterPdfKey);
        pdfArrayBuffer = pdfObj?.data || (pdfObj?.topics && pdfObj.topics.data) || (pdfObj?.topics instanceof ArrayBuffer ? pdfObj.topics : null);
      }

      if (!pdfObj || !pdfArrayBuffer) {
        alert(`⚠️ No PDF attached for "${topicName}" (${subjectName}).\nPlease upload a Master Subject PDF or Pre-Split Topic PDF in the Subject Tracker tab ("📁 Textbook Manager").`);
        setIsGeneratingHints(false);
        return;
      }

      // Fetch Textbook Metadata to get pageOffset
      const metadataList = (await getLocalTextbooksMetadata()) || [];
      const meta = metadataList.find(tb => (tb.subject || '').toLowerCase() === subjectName.toLowerCase());
      const pageOffset = meta?.pageOffset || 0;

      // Extract page range from topic with strict next-topic boundary protection
      const pageInfo = parsePageNumbers(topic);
      const startPage = pageInfo.startPage || 1;
      let endPage = pageInfo.endPage;

      if (!isPreSplit && !endPage) {
        // Look up all topics for this subject to cap endPage before the NEXT topic starts
        const subDoc = (subjectTrackerData || []).find(s => (s.id || '').toLowerCase() === (subjectName || '').toLowerCase());
        const allTopics = subDoc?.topics ? Object.values(subDoc.topics) : [];
        const nextStartPages = allTopics
          .map(t => parsePageNumbers(t).startPage)
          .filter(p => p !== null && p > startPage)
          .sort((a, b) => a - b);

        if (nextStartPages.length > 0) {
          endPage = nextStartPages[0] - 1; // Cap strictly before next topic starts!
        } else {
          endPage = startPage + 10;
        }
      }

      const topicId = topic.id || `${topic.subject}_${topic.name}`;

      const hintPayload = await generateTopicActiveRecallHints({
        topicId,
        topicName: topic.name,
        subject: subjectName,
        pdfArrayBuffer,
        startPage,
        endPage,
        pageOffset,
        isPreSplit,
        geminiApiKey,
        aiFeatureModels
      });

      setTopicHints(hintPayload);
      setRevealedHintCount(1);
      setIsHintsExpanded(true);
    } catch (err) {
      console.error('Failed generating hints:', err);
      setHintError(err.message || 'Failed to generate hints');
    } finally {
      setIsGeneratingHints(false);
    }
  };

  const handleRegenerateHints = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      const topicId = topic.id || `${topic.subject}_${topic.name}`;
      await deleteTopicHintsLocal(topicId);
      setTopicHints(null);
      setRecalledPointsMap({});
      await handleGenerateHints(e);
    } catch (err) {
      console.error('Failed regenerating hints:', err);
    }
  };


  // Calculate upcoming FSRS interval previews in days for Again(1), Hard(2), Good(3), Easy(4)
  const intervalPreviews = useMemo(() => {
    try {
      const todayStr = getLocalDateStr();
      const weights = ensureCalibratedWeights(fsrsConfig?.weights);
      const dr = fsrsConfig?.globalDesiredRetention || 0.90;

      const state1 = calculateNextFSRSState(topic, 1, todayStr, weights, dr);
      const state2 = calculateNextFSRSState(topic, 2, todayStr, weights, dr);
      const state3 = calculateNextFSRSState(topic, 3, todayStr, weights, dr);
      const state4 = calculateNextFSRSState(topic, 4, todayStr, weights, dr);

      const formatDays = (d) => {
        if (!d || d <= 1) return '1d';
        if (d < 30) return `${d}d`;
        if (d < 365) return `${(d / 30).toFixed(1)}m`;
        return `${(d / 365).toFixed(1)}y`;
      };

      return {
        1: formatDays(state1?.interval),
        2: formatDays(state2?.interval),
        3: formatDays(state3?.interval),
        4: formatDays(state4?.interval)
      };
    } catch (e) {
      return { 1: '1d', 2: '2d', 3: '4d', 4: '8d' };
    }
  }, [topic, fsrsConfig]);

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

          {/* Active-Recall Hint Toggle Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsHintsExpanded(prev => !prev);
            }}
            title={topicHints ? "Toggle Active-Recall Hints" : "Generate Active-Recall Hints"}
            className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
              isHintsExpanded || topicHints
                ? isDark
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 ring-1 ring-amber-500/30'
                  : 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200 ring-1 ring-amber-400/40'
                : isDark
                  ? 'bg-slate-800 text-slate-400 hover:text-amber-300 border-slate-700'
                  : 'bg-slate-100 text-slate-500 hover:text-amber-700 border-slate-200'
            }`}
          >
            <Lightbulb className="w-4 h-4" />
          </button>

          {/* Preview PDF Slice Button */}
          <button
            type="button"
            onClick={handleOpenPreviewModal}
            title="Preview PDF Page Slice Text & Images"
            className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
              isDark
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 hover:bg-blue-500/30'
                : 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
            }`}
          >
            <Eye className="w-4 h-4" />
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
                <FileText className="w-3 h-3" /> Notes
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

      {/* Collapsible Progressive Hint Ladder Section */}
      <AnimatePresence>
        {isHintsExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden space-y-2 pt-2 border-t border-slate-700/40 dark:border-slate-800/60"
          >
            <div className="flex items-center justify-between">
              <span className={`text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                <Lightbulb className="w-3 h-3 text-amber-400" /> Active-Recall Clues Ladder
              </span>
              {topicHints && (
                <span className="text-[9px] font-mono font-bold text-slate-400">
                  {revealedHintCount} / {topicHints.hints.length} Clues
                </span>
              )}
            </div>

            {isGeneratingHints ? (
              <div className={`p-4 rounded-xl text-center space-y-1.5 border animate-pulse ${
                isDark ? 'bg-amber-950/20 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <p className="text-xs font-bold">⏳ Slicing PDF Pages & Generating AI Hints...</p>
                <p className="text-[10px] opacity-75">Extracting textbook flow without revealing direct answers...</p>
              </div>
            ) : hintError ? (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold space-y-1">
                <p>⚠️ {hintError}</p>
                <button
                  type="button"
                  onClick={handleGenerateHints}
                  className="text-[10px] font-black uppercase tracking-wider underline hover:text-rose-300"
                >
                  Retry Hint Generation
                </button>
              </div>
            ) : topicHints ? (
              <div className="space-y-3">
                {/* Header Metrics & Top Action Bar */}
                <div className={`p-3 rounded-2xl border space-y-2.5 ${isDark ? 'neu-pressed-dark border-slate-800' : 'neu-pressed-light border-slate-200'}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className={`text-[10px] font-black uppercase tracking-wider block ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                        📚 {topicHints.chapterTitle || topic.name}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400">
                        {treeMetrics
                          ? `${treeMetrics.totalNodes} Outline Nodes`
                          : `${blueprintMetrics?.totalTopics || 0} Topics • ${blueprintMetrics?.totalPoints || 0} Recall Points`
                        }
                      </span>
                    </div>

                    {/* Action Buttons: Delete, Regenerate, Expand/Collapse */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const all = {};
                          if (topicHints.tree) {
                            function expandNodes(list) {
                              list.forEach(n => {
                                const id = n.id || n.title;
                                all[id] = true;
                                if (n.children) expandNodes(n.children);
                              });
                            }
                            expandNodes(topicHints.tree);
                          } else if (topicHints.structure) {
                            topicHints.structure.forEach((_, i) => { all[i] = true; });
                          }
                          setExpandedNodesMap(all);
                        }}
                        className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border transition ${isDark ? 'neu-btn-dark text-slate-300 border-slate-700 hover:text-white' : 'neu-btn-light text-slate-600 border-slate-300'}`}
                      >
                        Expand All
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const all = {};
                          if (topicHints.tree) {
                            function collapseNodes(list) {
                              list.forEach(n => {
                                const id = n.id || n.title;
                                all[id] = false;
                                if (n.children) collapseNodes(n.children);
                              });
                            }
                            collapseNodes(topicHints.tree);
                          } else if (topicHints.structure) {
                            topicHints.structure.forEach((_, i) => { all[i] = false; });
                          }
                          setExpandedNodesMap(all);
                        }}
                        className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border transition ${isDark ? 'neu-btn-dark text-slate-300 border-slate-700 hover:text-white' : 'neu-btn-light text-slate-600 border-slate-300'}`}
                      >
                        Collapse All
                      </button>

                      <button
                        type="button"
                        onClick={handleRegenerateHints}
                        title="Regenerate Outline (Overwrites Old Record)"
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border transition flex items-center gap-1 cursor-pointer active:scale-95 ${
                          isDark ? 'neu-btn-dark text-amber-300 border-amber-500/40 hover:border-amber-400' : 'neu-btn-light text-amber-700 border-amber-400'
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Regenerate</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDeleteHints}
                        title="Delete Hints (PDF Pages Preserved)"
                        className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border transition flex items-center gap-1 cursor-pointer bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30 active:scale-95"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Recall Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider">
                      <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Chapter Recall Progress</span>
                      <span className="text-emerald-400">
                        {treeMetrics?.recalledCount ?? blueprintMetrics?.recalledCount ?? 0} / {treeMetrics?.totalNodes ?? blueprintMetrics?.totalPoints ?? 0} ({treeMetrics?.percent ?? blueprintMetrics?.percent ?? 0}%)
                      </span>
                    </div>
                    <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                        style={{ width: `${treeMetrics?.percent ?? blueprintMetrics?.percent ?? 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Body Content Rendering */}
                {topicHints.tree && Array.isArray(topicHints.tree) && topicHints.tree.length > 0 ? (
                  /* RECURSIVE N-LEVEL MINDMAP OUTLINE TREE */
                  <div className="space-y-1.5 max-h-[440px] overflow-y-auto pr-1 no-scrollbar custom-scrollbar">
                    {topicHints.tree.map((rootNode, rIdx) => (
                      <RecursiveBlueprintNode
                        key={rootNode.id || rootNode.title || rIdx}
                        node={rootNode}
                        depth={0}
                        recalledMap={recalledPointsMap}
                        onToggleRecall={handleToggleRecallNode}
                        expandedMap={expandedNodesMap}
                        onToggleExpand={handleToggleExpandNode}
                        isDark={isDark}
                      />
                    ))}
                  </div>
                ) : topicHints.structure && Array.isArray(topicHints.structure) && topicHints.structure.length > 0 ? (
                  /* 3-LEVEL STRUCTURE FALLBACK */
                  <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 no-scrollbar custom-scrollbar">
                    {topicHints.structure.map((topObj, tIdx) => {
                      const isTopExpanded = expandedNodesMap[tIdx] !== false;
                      const subtopics = topObj.subtopics || [];

                      return (
                        <div
                          key={tIdx}
                          className={`rounded-2xl border transition-all overflow-hidden ${isDark ? 'neu-card-dark border-slate-800' : 'neu-card-light border-slate-200'}`}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedNodesMap(prev => ({ ...prev, [tIdx]: !isTopExpanded }));
                            }}
                            className={`w-full p-3 flex items-center justify-between text-left transition ${isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`}
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 text-[10px] font-black font-mono shrink-0">
                                T{tIdx + 1}
                              </span>
                              <h4 className={`text-xs font-black tracking-tight truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                {topObj.topic}
                              </h4>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-slate-700/40 text-slate-300">
                                {subtopics.length} Subtopics
                              </span>
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isTopExpanded ? 'rotate-180 text-amber-400' : 'text-slate-400'}`} />
                            </div>
                          </button>

                          <AnimatePresence>
                            {isTopExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="border-t border-slate-800/60 p-3 space-y-3 bg-slate-950/20"
                              >
                                {subtopics.map((subObj, sIdx) => {
                                  const points = subObj.points || [];

                                  return (
                                    <div key={sIdx} className="space-y-1.5">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-amber-400 font-bold text-xs">🔹</span>
                                        <h5 className={`text-[11px] font-bold tracking-wide ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>
                                          {subObj.title}
                                        </h5>
                                      </div>

                                      <div className="pl-4 space-y-1 border-l-2 border-slate-800">
                                        {points.map((pt, pIdx) => {
                                          const ptKey = `${tIdx}_${sIdx}_${pIdx}`;
                                          const isRecalled = !!recalledPointsMap[ptKey];

                                          return (
                                            <div
                                              key={pIdx}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setRecalledPointsMap(prev => ({ ...prev, [ptKey]: !prev[ptKey] }));
                                              }}
                                              className={`p-2 rounded-xl text-xs font-medium border flex items-start gap-2.5 transition-all cursor-pointer select-none active:scale-[0.99] ${
                                                isRecalled
                                                  ? isDark
                                                    ? 'bg-emerald-950/40 text-emerald-200 border-emerald-500/40'
                                                    : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                                  : isDark
                                                    ? 'neu-pressed-dark text-slate-300 border-slate-800 hover:border-slate-700'
                                                    : 'neu-pressed-light text-slate-700 border-slate-200 hover:border-slate-300'
                                              }`}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={isRecalled}
                                                onChange={() => {}}
                                                className="mt-0.5 w-3.5 h-3.5 rounded accent-emerald-500 cursor-pointer shrink-0"
                                              />
                                              <span className={`leading-relaxed ${isRecalled ? 'line-through opacity-85' : ''}`}>
                                                {pt}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* LEGACY FALLBACK LIST */
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      {topicHints.hints.slice(0, revealedHintCount).map((hint, hIdx) => (
                        <motion.div
                          key={hIdx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`p-2.5 rounded-xl text-xs font-medium border flex items-start gap-2 ${
                            isDark ? 'neu-pressed-dark text-slate-200 border-slate-700/60' : 'neu-pressed-light text-slate-800 border-slate-200'
                          }`}
                        >
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-black font-mono shrink-0">
                            #{hIdx + 1}
                          </span>
                          <p className="leading-snug">{hint}</p>
                        </motion.div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleRegenerateHints}
                      className="w-full py-1.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 mt-2"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Upgrade to Recursive N-Level Mindmap Outline</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className={`p-3.5 rounded-xl border text-center space-y-2 ${
                isDark ? 'bg-slate-900/40 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
              }`}>
                <p className="text-[11px] font-medium">No progressive hints generated for this topic yet.</p>
                <button
                  type="button"
                  onClick={handleGenerateHints}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 mx-auto"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate AI Recall Hints</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4 Rating Buttons with Calculated FSRS Scheduled Interval Previews */}
      <div className="grid grid-cols-4 gap-1.5 pt-1">
        <button
          type="button"
          onClick={() => {
            setRecalledPointsMap({});
            if (onRate) onRate(topic, 1);
          }}
          title={`Again: Grade 1 (Next review in ${intervalPreviews[1]})`}
          className="py-1.5 px-1 rounded-xl text-[10px] font-black bg-rose-500/20 hover:bg-rose-500/30 text-rose-500 border border-rose-500/30 active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-center"
        >
          <span>Again (1)</span>
          <span className="text-[9px] opacity-75 font-mono font-bold mt-0.5">{intervalPreviews[1]}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setRecalledPointsMap({});
            if (onRate) onRate(topic, 2);
          }}
          title={`Hard: Grade 2 (Next review in ${intervalPreviews[2]})`}
          className="py-1.5 px-1 rounded-xl text-[10px] font-black bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 border border-amber-500/30 active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-center"
        >
          <span>Hard (2)</span>
          <span className="text-[9px] opacity-75 font-mono font-bold mt-0.5">{intervalPreviews[2]}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setRecalledPointsMap({});
            if (onRate) onRate(topic, 3);
          }}
          title={`Good: Grade 3 (Next review in ${intervalPreviews[3]})`}
          className="py-1.5 px-1 rounded-xl text-[10px] font-black bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-600 border border-indigo-500/30 active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-center"
        >
          <span>Good (3)</span>
          <span className="text-[9px] opacity-75 font-mono font-bold mt-0.5">{intervalPreviews[3]}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setRecalledPointsMap({});
            if (onRate) onRate(topic, 4);
          }}
          title={`Easy: Grade 4 (Next review in ${intervalPreviews[4]})`}
          className="py-1.5 px-1 rounded-xl text-[10px] font-black bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-600 border border-emerald-500/30 active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-center"
        >
          <span>Easy (4)</span>
          <span className="text-[9px] opacity-75 font-mono font-bold mt-0.5">{intervalPreviews[4]}</span>
        </button>
      </div>

      {/* PDF Slice Preview Modal Portal: Mounted to document.body to prevent parent grid layout reflows */}
      {isPreviewModalOpen && typeof document !== 'undefined' && ReactDOM.createPortal(
        <PdfSlicePreviewModal
          isOpen={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
          topicName={topic.name}
          subjectName={topic.subject}
          pdfSlice={previewPdfSlice}
          isLoading={isLoadingPreview}
          onConfirmGenerate={(e) => handleGenerateHints(e)}
          isDark={isDark}
        />,
        document.body
      )}
    </motion.div>
  );
}

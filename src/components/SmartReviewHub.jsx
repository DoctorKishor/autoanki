import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, Brain, Calendar, AlertTriangle, CheckCircle, Clock, BookOpen, ChevronRight, Layers, Sparkles } from 'lucide-react';
import FsrsStatsTab from './FsrsStatsTab';
import FsrsSettingsModal from './FsrsSettingsModal';

export function getTopicPageInfo(topic) {
  if (!topic) return { startPage: null, endPage: null, pageCount: 1, pageLabel: 'No pgs' };

  let startPg = (topic.page !== undefined && topic.page !== null && topic.page !== '')
    ? parseInt(topic.page, 10)
    : (topic.startPage !== undefined && topic.startPage !== null && topic.startPage !== '')
      ? parseInt(topic.startPage, 10)
      : (topic.pageStart !== undefined && topic.pageStart !== null && topic.pageStart !== '')
        ? parseInt(topic.pageStart, 10)
        : null;
  if (isNaN(startPg)) startPg = null;

  let endPg = (topic.endPage !== undefined && topic.endPage !== null && topic.endPage !== '')
    ? parseInt(topic.endPage, 10)
    : (topic.pageEnd !== undefined && topic.pageEnd !== null && topic.pageEnd !== '')
      ? parseInt(topic.pageEnd, 10)
      : null;
  if (isNaN(endPg)) endPg = null;

  let pageCount = 1;
  if (startPg !== null && endPg !== null && endPg >= startPg) {
    pageCount = (endPg - startPg) + 1;
  } else if (topic.pageCount !== undefined && topic.pageCount !== null && !isNaN(parseInt(topic.pageCount, 10))) {
    pageCount = parseInt(topic.pageCount, 10);
  } else if (topic.pages !== undefined && topic.pages !== null && !isNaN(parseInt(topic.pages, 10))) {
    pageCount = parseInt(topic.pages, 10);
  }

  let pageLabel = 'No pgs';
  if (startPg !== null && endPg !== null) {
    pageLabel = `p. ${startPg}–${endPg}`;
  } else if (startPg !== null) {
    pageLabel = `p. ${startPg}`;
  } else if (topic.pages) {
    pageLabel = `p. ${topic.pages}`;
  } else if (topic.pageLabel) {
    pageLabel = topic.pageLabel;
  }

  return { startPage: startPg, endPage: endPg, pageCount, pageLabel };
}

export default function SmartReviewHub({
  subjectTrackerData = [],
  studyLogs = [],
  fsrsConfig = {},
  onSaveConfig,
  batchedReviews = [],
  onSyncBatchedReviews,
  isSaving = false,
  onRateTopic,
  studySchedule = []
}) {
  const [subTab, setSubTab] = useState('queue'); // 'queue', 'analytics', 'leeches'
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mnemonicNotes, setMnemonicNotes] = useState({});

  // 1. Calculate Daily Limits & Page Counts from subjectTrackerData
  const dailyLimits = fsrsConfig.dailyLimits || { newPagesPerDay: 10, maxReviewPagesPerDay: 30 };

  const { overdueTopics, dueTodayTopics, newTopics, totalReviewPagesToday, totalNewPagesToday, leechTopics } = useMemo(() => {
    const overdue = [];
    const dueToday = [];
    const newItems = [];
    const leeches = [];
    let reviewPages = 0;
    let newPages = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    subjectTrackerData.forEach(subDoc => {
      const subName = subDoc.subject;
      if (subDoc.topics) {
        Object.values(subDoc.topics).forEach(topic => {
          if (!topic || !topic.name || topic.name.trim().length === 0) return;

          const { pageCount, pageLabel, startPage, endPage } = getTopicPageInfo(topic);
          const lapses = topic.lapses || topic.lapsesCount || 0;
          const topicObj = { ...topic, subject: subName, pageCount, pageLabel, startPage, endPage };

          if (lapses >= (fsrsConfig.lapses?.leechThreshold ?? 8) || topic.isLeech) {
            leeches.push(topicObj);
          }

          if (!topic.lastReviewed && !topic.nextReviewDue) {
            newItems.push(topicObj);
            newPages += pageCount;
          } else if (topic.nextReviewDue) {
            if (topic.nextReviewDue < todayStr) {
              overdue.push(topicObj);
              reviewPages += pageCount;
            } else if (topic.nextReviewDue === todayStr) {
              dueToday.push(topicObj);
              reviewPages += pageCount;
            }
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
  }, [subjectTrackerData, fsrsConfig]);

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

  const handleMnemonicChange = (topicId, text) => {
    setMnemonicNotes(prev => ({ ...prev, [topicId]: text }));
  };

  return (
    <div className="w-full space-y-6 text-slate-200">
      {/* Settings Modal */}
      <FsrsSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        fsrsConfig={fsrsConfig}
        onSaveConfig={onSaveConfig}
      />

      {/* Header & Controls Bar */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#222730] p-5 rounded-3xl border border-slate-700/60 shadow-lg neu-card-dark shrink-0"
      >
        <div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Brain className="w-6 h-6 text-indigo-400 animate-pulse" />
            <span>Smart Repetition Hub</span>
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            FSRS-6 Memory Engine • Load-Balanced Queue • Chapter Revision
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex-1 md:flex-initial px-4 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-white shadow-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer border border-slate-700 active:scale-95"
          >
            <span>⚙️</span>
            <span>FSRS Settings</span>
          </button>

          <button
            onClick={onSyncBatchedReviews}
            disabled={!batchedReviews || batchedReviews.length === 0 || isSaving}
            className={`flex-1 md:flex-initial px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 ${
              batchedReviews && batchedReviews.length > 0
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-600/25 active:scale-95 cursor-pointer'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            {isSaving ? 'Syncing...' : `Save & Sync (${batchedReviews ? batchedReviews.length : 0})`}
          </button>
        </div>
      </motion.div>

      {/* Subtab Switcher - Dynamic Single Sliding Pill */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="relative flex bg-slate-900/90 p-1.5 rounded-2xl border border-slate-700/60 shadow-inner w-full md:w-auto self-start overflow-x-auto no-scrollbar"
      >
        <div
          className="absolute top-1.5 bottom-1.5 bg-indigo-600 rounded-xl shadow-md"
          style={{
            left: subTab === 'queue' ? '6px' : subTab === 'analytics' ? 'calc(33.33% + 2px)' : 'calc(66.66% + 2px)',
            width: 'calc(33.33% - 8px)',
            transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
          }}
        />

        <button
          type="button"
          onClick={() => setSubTab('queue')}
          className={`relative z-10 flex-1 px-4 sm:px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors duration-200 whitespace-nowrap ${
            subTab === 'queue' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          ⚡ Daily Study Hub ({overdueTopics.length + dueTodayTopics.length})
        </button>

        <button
          type="button"
          onClick={() => setSubTab('analytics')}
          className={`relative z-10 flex-1 px-4 sm:px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors duration-200 whitespace-nowrap ${
            subTab === 'analytics' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          📊 Analytics & Forecast
        </button>

        <button
          type="button"
          onClick={() => setSubTab('leeches')}
          className={`relative z-10 flex-1 px-4 sm:px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors duration-200 whitespace-nowrap ${
            subTab === 'leeches' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          ⚠️ Leech Revision ({leechTopics.length})
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
              className="p-5 rounded-2xl bg-[#222730] border border-slate-700/60 shadow-md neu-card-dark space-y-3"
            >
              <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-slate-300">
                <span className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-400" /> Review Pages Load
                </span>
                <span className="text-indigo-400">{totalReviewPagesToday} / {dailyLimits.maxReviewPagesPerDay} pages</span>
              </div>
              <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((totalReviewPagesToday / (dailyLimits.maxReviewPagesPerDay || 1)) * 100))}%` }}
                />
              </div>
            </motion.div>

            {/* New Pages Gauge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="p-5 rounded-2xl bg-[#222730] border border-slate-700/60 shadow-md neu-card-dark space-y-3"
            >
              <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-slate-300">
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" /> New Topic Pages
                </span>
                <span className="text-emerald-400">{totalNewPagesToday} / {dailyLimits.newPagesPerDay} pages</span>
              </div>
              <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((totalNewPagesToday / (dailyLimits.newPagesPerDay || 1)) * 100))}%` }}
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
              className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-amber-500/10 border border-amber-500/30 flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-amber-400" />
                <div>
                  <div className="text-xs font-black text-amber-300 uppercase tracking-wider">Upcoming Exam Target</div>
                  <div className="text-sm font-bold text-white">{nextExam.subject || nextExam.title || 'CAMP Exam Target'}</div>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-black">
                {nextExam.date || 'Scheduled'}
              </span>
            </motion.div>
          )}

          {/* Topic Queue Lists */}
          <div className="space-y-6">
            {/* Overdue Queue */}
            {overdueTopics.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Overdue Topics ({overdueTopics.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {overdueTopics.map((topic, idx) => (
                    <TopicCard key={idx} topic={topic} onRate={onRateTopic} isOverdue />
                  ))}
                </div>
              </div>
            )}

            {/* Due Today Queue */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Due Today ({dueTodayTopics.length})
              </h4>
              {dueTodayTopics.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dueTodayTopics.map((topic, idx) => (
                    <TopicCard key={idx} topic={topic} onRate={onRateTopic} />
                  ))}
                </div>
              ) : (
                <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-700/40 text-xs text-slate-400 text-center font-semibold">
                  🎉 All reviews for today are completed! Check out New Topics below or review your analytics.
                </div>
              )}
            </div>

            {/* New Topics Queue */}
            {newTopics.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> New Topics Available ({newTopics.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {newTopics.slice(0, 6).map((topic, idx) => (
                    <TopicCard key={idx} topic={topic} onRate={onRateTopic} isNew />
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Subtab 2: Analytics & Forecast */}
      {subTab === 'analytics' && (
        <FsrsStatsTab
          subjectTrackerData={subjectTrackerData}
          studyLogs={studyLogs}
          fsrsConfig={fsrsConfig}
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
          <div className="p-4 rounded-2xl bg-[#222730] border border-slate-700/60 flex items-center justify-between shadow-md">
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <span>⚠️</span> Leech Topics Focus Workspace ({leechTopics.length})
              </h3>
              <p className="text-xs text-slate-400">Topics with high lapse counts needing mnemonic notes or focused review</p>
            </div>
          </div>

          {leechTopics.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {leechTopics.map((item, idx) => (
                <div key={idx} className="p-5 rounded-2xl bg-[#222730] border border-amber-500/40 shadow-md neu-card-dark space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-black text-amber-300">{item.name}</div>
                      <div className="text-xs text-slate-400">{item.subject} • <span className="font-mono text-amber-400 font-bold">{getTopicPageInfo(item).pageLabel}</span></div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-black uppercase">
                      {item.lapses || item.lapsesCount || 0} Lapses
                    </span>
                  </div>

                  {/* Mnemonic Note Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Mnemonic Note / Revision Memory Cue</label>
                    <textarea
                      value={mnemonicNotes[item.id] || item.mnemonicNote || ''}
                      onChange={(e) => handleMnemonicChange(item.id, e.target.value)}
                      placeholder="Write a mnemonic or key memory clue..."
                      className="w-full p-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-500/60 resize-none h-16"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-700/40 text-center space-y-2">
              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
              <div className="text-sm font-black text-white">No Problematic Leech Topics Detected</div>
              <p className="text-xs text-slate-400">All textbook chapter topics are within acceptable lapse thresholds!</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// Sub-component: Individual Topic Queue Card
function TopicCard({ topic, onRate, isOverdue = false, isNew = false }) {
  const { pageLabel, pageCount } = getTopicPageInfo(topic);

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={`p-4 rounded-2xl bg-[#222730] border shadow-md neu-card-dark space-y-3 transition-transform ${
        isOverdue ? 'border-rose-500/40' : isNew ? 'border-emerald-500/40' : 'border-slate-700/60'
      }`}
    >
      <div className="flex justify-between items-start gap-2">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-800 text-indigo-300 border border-slate-700">
            {topic.subject}
          </span>
          <h5 className="text-sm font-bold text-white mt-1.5">{topic.name}</h5>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            <span className="font-mono text-indigo-300 font-bold">{pageLabel}</span> • {pageCount} {pageCount === 1 ? 'page' : 'pages'}
          </p>
        </div>

        <div className="text-right">
          <div className="text-[11px] font-mono text-slate-400">S: <span className="text-sky-400 font-bold">{topic.stability != null ? topic.stability.toFixed(1) : 'New'}d</span></div>
          <div className="text-[11px] font-mono text-slate-400">D: <span className="text-amber-400 font-bold">{topic.difficulty != null ? topic.difficulty.toFixed(1) : '5.0'}</span></div>
        </div>
      </div>

      {/* 4 Rating Buttons */}
      <div className="grid grid-cols-4 gap-1.5 pt-1">
        <button
          onClick={() => onRate && onRate(topic, 1)}
          className="py-1.5 rounded-xl text-[10px] font-black bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 active:scale-95 transition-all"
        >
          Again (1)
        </button>
        <button
          onClick={() => onRate && onRate(topic, 2)}
          className="py-1.5 rounded-xl text-[10px] font-black bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 active:scale-95 transition-all"
        >
          Hard (2)
        </button>
        <button
          onClick={() => onRate && onRate(topic, 3)}
          className="py-1.5 rounded-xl text-[10px] font-black bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 active:scale-95 transition-all"
        >
          Good (3)
        </button>
        <button
          onClick={() => onRate && onRate(topic, 4)}
          className="py-1.5 rounded-xl text-[10px] font-black bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 active:scale-95 transition-all"
        >
          Easy (4)
        </button>
      </div>
    </motion.div>
  );
}

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Calendar, AlertTriangle, CheckCircle, Clock, BookOpen, Layers, Sparkles, RotateCcw, RotateCw, Zap, Undo2, X, FileText, Plus, Trash2, Edit3, Target, Search } from 'lucide-react';
import FsrsStatsTab from './FsrsStatsTab';
import StudyVelocityTab from './StudyVelocityTab';
import RatingDurationModal from './RatingDurationModal';
import FsrsSettingsModal from './FsrsSettingsModal';
import SelectNewTopicsModal from './SelectNewTopicsModal';
import { saveLocalSubjectTrackerDoc, getLocalSubjectTrackerData, getActiveNewTopicIds, saveActiveNewTopicIds, getTopicHintsLocal, deleteTopicHintsLocal, getLocalPytTopic, getLocalTextbooksMetadata, saveLocalTextbooksMetadata, saveLocalExamProfiles, deleteLocalExamProfile } from '../services/localDb';
import { generateTopicActiveRecallHints } from '../services/aiHintEngine';
import { Lightbulb, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { parsePageNumbers, getTopicPageWeight } from '../utils/pageUtils';
import { calculateNextFSRSState, ensureCalibratedWeights } from '../services/fsrsEngine';
import { calculatePredictiveTopicTime, formatPredictedDuration } from '../services/predictiveTimingEngine';
import PdfSlicePreviewModal from './PdfSlicePreviewModal';
import DedicatedTopicStudyView from './DedicatedTopicStudyView';
import { extractTopicPdfSlice } from '../services/pdfSliceService';
import { triggerDebouncedSmartPush } from '../services/googleDriveSync';

export function getLocalDateStr(d = new Date()) {
  if (typeof d === 'string') {
    const trimmed = d.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.includes('T')) {
      return trimmed.split('T')[0];
    }
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? new Date().toLocaleDateString('en-CA') : parsed.toLocaleDateString('en-CA');
  }
  if (d instanceof Date && !isNaN(d.getTime())) {
    return d.toLocaleDateString('en-CA');
  }
  return new Date().toLocaleDateString('en-CA');
}

export function getTopicPageInfo(topic) {
  return parsePageNumbers(topic);
}

export default function SmartReviewHub({
  themeMode = 'dark',
  activeSubTab = 'queue',
  onSubTabChange,
  subjectTrackerData = [],
  studyLogs = [],
  fsrsConfig = {},
  timerState = null,
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
  onPushUndoAction,
  onOpenNotesModal,
  onDeleteTimingLog,
  onRescheduleAll
}) {
  const isDark = themeMode === 'dark';
  const [subTab, setSubTab] = useState(activeSubTab || 'queue'); // 'queue', 'analytics', 'velocity', 'leeches'
  const [activeStudyTopic, setActiveStudyTopic] = useState(null);

  useEffect(() => {
    if (activeSubTab && activeSubTab !== subTab) {
      setSubTab(activeSubTab);
    }
  }, [activeSubTab]);

  const handleSetSubTab = (st) => {
    setSubTab(st);
    if (typeof onSubTabChange === 'function') {
      onSubTabChange(st);
    }
  };
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingRatingData, setPendingRatingData] = useState(null);
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

  const handleAddExamTarget = async () => {
    if (!newExamTitle.trim() || !newExamDate) return;
    const nowIso = new Date().toISOString();
    const newEntry = {
      id: `exam_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: newExamTitle.trim(),
      title: newExamTitle.trim(),
      date: newExamDate,
      examDate: newExamDate,
      isTentative: Boolean(newExamTentative),
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const updated = Array.isArray(examProfiles) ? [...examProfiles, newEntry] : [newEntry];
    await saveLocalExamProfiles(updated);
    if (typeof onSaveExamProfiles === 'function') onSaveExamProfiles(updated);
    triggerDebouncedSmartPush();
    setNewExamTitle('');
    setNewExamDate('');
    setNewExamTentative(false);
  };

  const handleDeleteExamTarget = async (idOrIndex) => {
    if (!Array.isArray(examProfiles)) return;
    const itemToDelete = examProfiles.find((item, idx) => (item.id ? item.id === idOrIndex : idx === idOrIndex));
    const targetId = itemToDelete?.id || idOrIndex;
    const updated = examProfiles.filter((item, idx) => (item.id ? item.id !== idOrIndex : idx !== idOrIndex));
    if (targetId) {
      await deleteLocalExamProfile(targetId, itemToDelete);
    } else {
      await saveLocalExamProfiles(updated);
    }
    if (typeof onSaveExamProfiles === 'function') onSaveExamProfiles(updated);
    triggerDebouncedSmartPush();
  };

  useEffect(() => {
    const todayStr = getLocalDateStr();
    getActiveNewTopicIds(todayStr).then(ids => {
      if (Array.isArray(ids)) {
        setActiveNewTopicIds(new Set(ids));
      }
    }).catch(err => console.error("Error loading active new topic IDs:", err));

    const handleTopicIdsChanged = (e) => {
      if (e?.detail?.updatedList && Array.isArray(e.detail.updatedList)) {
        setActiveNewTopicIds(new Set(e.detail.updatedList));
      }
    };
    window.addEventListener('autoanki_topic_ids_changed', handleTopicIdsChanged);
    return () => window.removeEventListener('autoanki_topic_ids_changed', handleTopicIdsChanged);
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

  const handleRequestRateTopic = (topic, rating, predictedMinutes = 0) => {
    setPendingRatingData({
      topic,
      rating,
      predictedMinutes: predictedMinutes || 10
    });
  };

  const handleConfirmRatingDuration = (actualMins) => {
    if (!pendingRatingData) return;
    const { topic, rating } = pendingRatingData;
    if (typeof onRateTopic === 'function') {
      onRateTopic(topic, rating, {
        actualDurationMins: actualMins,
        continuousSessionMins: timerState?.continuousMins || 0
      });
    }
    setPendingRatingData(null);
  };

  const handleSkipRatingDuration = () => {
    if (!pendingRatingData) return;
    const { topic, rating } = pendingRatingData;
    if (typeof onRateTopic === 'function') {
      onRateTopic(topic, rating, null);
    }
    setPendingRatingData(null);
  };

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

  const {
    overdueTopics,
    dueTodayTopics,
    newTopics,
    totalReviewPagesToday,
    totalNewPagesToday,
    completedNewPagesToday,
    remainingNewPagesToday,
    completedReviewPagesToday,
    remainingReviewPagesToday,
    leechTopics
  } = useMemo(() => {
    const overdue = [];
    const dueToday = [];
    const newItems = [];
    const leeches = [];
    let reviewPages = 0;
    let newPages = 0;
    let completedNewPages = 0;
    let completedReviewPages = 0;

    const todayStr = getLocalDateStr();

    subjectTrackerData.forEach(subDoc => {
      const subName = subDoc.subject;
      if (subDoc.topics) {
        const topicsList = Object.values(subDoc.topics);
        topicsList.forEach(topic => {
          if (!topic || !topic.name || topic.name.trim().length === 0) return;

          const { pageLabel, startPage, endPage } = parsePageNumbers(topic);
          const topicWeight = getTopicPageWeight(topic, topicsList, subjectTrackerData);
          const lapses = topic.lapses || topic.lapsesCount || 0;
          const topicId = topic.id || `${subName}_${topic.name}`;
          const topicObj = { ...topic, id: topicId, subject: subName, pageCount: topicWeight, pageWeight: topicWeight, pageLabel, startPage, endPage };

          const leechThreshold = fsrsConfig.lapses?.leechThreshold ?? 8;
          const isLeechTopic = lapses >= leechThreshold || Boolean(topic.isLeech);
          const shouldSuspendLeech = isLeechTopic && fsrsConfig.lapses?.leechAction === 'suspend';

          if (isLeechTopic) {
            leeches.push(topicObj);
          }

          // Check if topic was studied/reviewed today
          const studiedDates = Array.isArray(topic.studyDates) ? topic.studyDates : [];
          const wasStudiedToday = studiedDates.includes(todayStr) || (topic.lastReviewDate && topic.lastReviewDate.startsWith(todayStr));

          if (wasStudiedToday) {
            // A topic is a completed NEW topic if studied for the first time today
            const isFirstStudiedToday = (
              (studiedDates.length === 1 && studiedDates[0] === todayStr) ||
              topic.firstStudiedDate === todayStr ||
              (Number(topic.reviewCount || 0) <= 1 && wasStudiedToday)
            );
            if (isFirstStudiedToday) {
              completedNewPages += topicWeight;
            } else {
              completedReviewPages += topicWeight;
            }
          }

          // If topic is suspended as a leech or manually suspended, exclude from active study queues
          if (shouldSuspendLeech || topic.isSuspended) {
            return;
          }

          // A topic is NEW if it has 0 reviewCount and no lastReviewDate (or has no recorded studyDates)
          const isUnstudied = (
            (!topic.studyDates || topic.studyDates.length === 0) ||
            ((!topic.reviewCount || Number(topic.reviewCount) === 0) && (!topic.lastReviewDate || topic.lastReviewDate === ''))
          );
          const cleanName = (topic.name || '').trim().toLowerCase();
          const isPickedForToday = (
            (topicId && activeNewTopicIds.has(topicId)) ||
            (cleanName.length > 0 && activeNewTopicIds.has(cleanName)) ||
            (subName && topic.name && activeNewTopicIds.has(`${subName}_${topic.name}`)) ||
            (subName && cleanName.length > 0 && activeNewTopicIds.has(`${subName.toLowerCase()}_${cleanName}`)) ||
            Boolean(topic.isPickedForToday) ||
            (topic.activatedDate && topic.activatedDate <= todayStr)
          );

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
            dueToday.push({ ...topicObj, nextReviewDue: topicObj.nextReviewDue || todayStr });
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
      totalNewPagesToday: newPages,
      completedNewPagesToday: completedNewPages,
      remainingNewPagesToday: newPages,
      completedReviewPagesToday: completedReviewPages,
      remainingReviewPagesToday: reviewPages
    };
  }, [subjectTrackerData, fsrsConfig, activeNewTopicIds, studyLogs]);

  // Memoized Ad-Hoc Topic Search Filter for 100% Smooth Keystrokes
  const filteredAdHocTopics = useMemo(() => {
    const allTopics = [];
    const term = adHocSearch.trim().toLowerCase();
    (subjectTrackerData || []).forEach(subDoc => {
      const currentSubject = (subDoc.subject || subDoc.id || '').trim();
      if (
        adHocSelectedSubject !== 'all' &&
        currentSubject.toLowerCase() !== adHocSelectedSubject.toLowerCase()
      ) {
        return;
      }
      if (subDoc.topics && typeof subDoc.topics === 'object') {
        const topicsList = Object.values(subDoc.topics);
        topicsList.forEach(t => {
          if (!t || !t.name) return;
          const matchesSearch = !term ||
            t.name.toLowerCase().includes(term) ||
            currentSubject.toLowerCase().includes(term);
          if (matchesSearch) {
            const { pageLabel, startPage, endPage } = parsePageNumbers(t);
            const topicWeight = getTopicPageWeight(t, topicsList);
            const topicId = t.id || `${currentSubject}_${t.name}`;
            allTopics.push({
              ...t,
              id: topicId,
              subject: currentSubject,
              pageCount: topicWeight,
              pageWeight: topicWeight,
              pageLabel,
              startPage,
              endPage
            });
          }
        });
      }
    });
    return allTopics;
  }, [subjectTrackerData, adHocSelectedSubject, adHocSearch]);

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

  // KEYBOARD SHORTCUTS FOR RAPID TOPIC REVIEW (1: Again, 2: Hard, 3: Good, 4: Easy)
  useEffect(() => {
    const handleGlobalReviewKeys = (e) => {
      // Don't intercept when user is typing in an input, textarea, or contentEditable
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
      // Don't intercept when another modal or duration confirmation is open
      if (isPickModalOpen || isExamModalOpen || isAdHocModalOpen || isSettingsOpen || pendingRatingData) return;

      const firstActiveTopic = (overdueTopics && overdueTopics[0]) || (dueTodayTopics && dueTodayTopics[0]) || (newTopics && newTopics[0]);
      if (!firstActiveTopic) return;

      if (e.key === '1') {
        e.preventDefault();
        handleRequestRateTopic(firstActiveTopic, 1);
      } else if (e.key === '2') {
        e.preventDefault();
        handleRequestRateTopic(firstActiveTopic, 2);
      } else if (e.key === '3') {
        e.preventDefault();
        handleRequestRateTopic(firstActiveTopic, 3);
      } else if (e.key === '4') {
        e.preventDefault();
        handleRequestRateTopic(firstActiveTopic, 4);
      }
    };

    window.addEventListener('keydown', handleGlobalReviewKeys);
    return () => window.removeEventListener('keydown', handleGlobalReviewKeys);
  }, [overdueTopics, dueTodayTopics, newTopics, isPickModalOpen, isExamModalOpen, isAdHocModalOpen, isSettingsOpen, pendingRatingData]);

  const handleMnemonicChange = async (item, text) => {
    if (!item) return;
    const topicKey = item.id || item.name;
    setMnemonicNotes(prev => ({ ...prev, [topicKey]: text }));

    if (!item.subject) return;
    const docId = (item.subject || '').trim().toLowerCase();

    try {
      const allSubjectDocs = (await getLocalSubjectTrackerData()) || subjectTrackerData || [];
      const subDoc = allSubjectDocs.find(d =>
        (d.id && d.id.toLowerCase() === docId) ||
        (d.subject && d.subject.toLowerCase() === docId)
      );

      if (subDoc && subDoc.topics) {
        const clonedTopics = { ...subDoc.topics };
        const cleanTargetName = (item.name || '').trim().toLowerCase();
        let topicEntryKey = Object.keys(clonedTopics).find(k =>
          k.trim().toLowerCase() === cleanTargetName ||
          clonedTopics[k]?.name?.trim().toLowerCase() === cleanTargetName ||
          clonedTopics[k]?.id === item.id
        );

        if (topicEntryKey) {
          if (clonedTopics[topicEntryKey].mnemonicNote === text) return;
          clonedTopics[topicEntryKey] = {
            ...clonedTopics[topicEntryKey],
            mnemonicNote: text
          };
          const targetDocId = (subDoc.id ? String(subDoc.id) : docId).trim().toLowerCase();
          const updatedDoc = {
            ...subDoc,
            id: targetDocId,
            topics: clonedTopics,
            updatedAt: new Date().toISOString()
          };

          if (typeof onUpdateSubjectDoc === 'function') {
            await onUpdateSubjectDoc(targetDocId, { topics: clonedTopics });
          } else {
            await saveLocalSubjectTrackerDoc(targetDocId, updatedDoc);
          }
          setToastMessage('Note saved successfully');
          setTimeout(() => setToastMessage(''), 2000);
        }
      }
    } catch (err) {
      console.error("Failed to save mnemonic note to IndexedDB:", err);
      setToastMessage('⚠️ Failed to save note to storage');
      setTimeout(() => setToastMessage(''), 3000);
    }
  };

  const handleRemoveNewTopic = (topicToRemove) => {
    if (!topicToRemove) return;
    const nowIso = new Date().toISOString();
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

      const updatedList = Array.from(next);
      saveActiveNewTopicIds(todayStr, updatedList).then(() => {
        window.dispatchEvent(new CustomEvent('autoanki_topic_ids_changed', {
          detail: { todayStr, updatedList }
        }));
      }).catch(err => console.error("Failed to update active new topics in IndexedDB:", err));
      return next;
    });

    if (onUpdateSubjectDoc && subName && topicToRemove.name) {
      const docId = subName.trim().toLowerCase();
      const subDoc = subjectTrackerData.find(d =>
        (d.id && d.id.trim().toLowerCase() === docId) ||
        (d.subject && d.subject.trim().toLowerCase() === docId)
      );
      if (subDoc && subDoc.topics) {
        const targetKey = Object.keys(subDoc.topics).find(k =>
          k.trim().toLowerCase() === topicToRemove.name.trim().toLowerCase() ||
          subDoc.topics[k]?.id === topicToRemove.id
        ) || topicToRemove.name;
        if (subDoc.topics[targetKey]) {
          const updatedTopics = { ...subDoc.topics };
          const topicObj = {
            ...updatedTopics[targetKey],
            activatedDate: null,
            isPickedForToday: false,
            updatedAt: nowIso
          };
          updatedTopics[targetKey] = topicObj;
          const targetDocId = subDoc.id || docId;
          onUpdateSubjectDoc(targetDocId, { ...subDoc, topics: updatedTopics, updatedAt: nowIso });
        }
      }
    }

    if (typeof onPushUndoAction === 'function') {
      onPushUndoAction({
        actionType: 'REMOVE_TODAYS_TOPIC',
        topic: topicToRemove,
        topicId,
        cleanName,
        subName,
        previousActivatedDate: topicToRemove.activatedDate || null,
        previousIsPicked: topicToRemove.isPickedForToday || false,
        timestamp: Date.now()
      });
    }

    setToastMessage(`Removed "${topicToRemove.name}" from today's study list`);
    setTimeout(() => setToastMessage(''), 2500);
    triggerDebouncedSmartPush();
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
            className={`fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 px-4 py-3 rounded-2xl text-xs font-black shadow-2xl backdrop-blur-md border flex items-center gap-3 ${isDark ? 'bg-[#222730] text-white border-slate-700/80 neu-card-dark' : 'bg-white text-slate-800 border-slate-200/80 neu-card-light'
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
        studyLogs={studyLogs}
        onRescheduleAll={onRescheduleAll}
      />

      {/* If Dedicated Topic Study View is active, render full-screen workspace without header bar or subtabs */}
      {activeStudyTopic ? (
        <DedicatedTopicStudyView
          topic={activeStudyTopic}
          onClose={() => setActiveStudyTopic(null)}
          onRate={(topicToRate, rating, predictedMinutes) => {
            handleRequestRateTopic(topicToRate, rating, predictedMinutes);
            setActiveStudyTopic(null);
          }}
          fsrsConfig={fsrsConfig}
          themeMode={themeMode}
          geminiApiKey={geminiApiKey}
          aiFeatureModels={aiFeatureModels}
          subjectTrackerData={subjectTrackerData}
          studyLogs={studyLogs}
          timerState={timerState}
          onPushUndoAction={onPushUndoAction}
          onUpdateSubjectDoc={onUpdateSubjectDoc}
          isNew={Boolean(activeStudyTopic.isNew)}
          isOverdue={Boolean(activeStudyTopic.isOverdue)}
        />
      ) : (
        <>
          {/* Header & Controls Bar */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className={`flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-3xl border shadow-lg shrink-0 ${isDark ? 'bg-[#222730] border-slate-700/60 neu-card-dark' : 'neu-card-light border-slate-200/80 bg-[#e6ecf5]'
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
        <div className="grid grid-cols-2 sm:grid-cols-4 md:flex items-center gap-2 w-full md:w-auto">
          {/* Permanent Undo Button */}
          <button
            onClick={onUndoRating}
            disabled={!canUndo}
            title="Undo last rating"
            className={`px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-2xl text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-1.5 h-[42px] ${canUndo
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
            className={`px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-2xl text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-1.5 h-[42px] ${canRedo
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

          {/* Ad-Hoc / Early Review Button */}
          <button
            type="button"
            onClick={() => setIsAdHocModalOpen(true)}
            className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-sm transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer border active:scale-95 h-[42px] ${isDark
                ? 'neu-btn-dark text-amber-400 border-amber-500/40 hover:border-amber-500/80'
                : 'neu-btn-light text-amber-700 border-amber-300 hover:border-amber-400'
              }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="hidden sm:inline truncate">Ad-hoc Review</span>
            <span className="sm:hidden truncate">Ad-hoc</span>
          </button>

          {/* FSRS Settings Button */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl text-[11px] sm:text-xs font-bold uppercase tracking-wider shadow-sm transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer border active:scale-95 h-[42px] ${isDark ? 'neu-btn-dark text-white border-slate-700' : 'neu-btn-light text-slate-800 border-slate-300'
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
        className={`relative grid grid-cols-4 p-1.5 rounded-2xl border w-full max-w-3xl shrink-0 select-none overflow-hidden ${isDark ? 'neu-pressed-dark border border-slate-700/60' : 'neu-pressed-light border border-slate-200/80'
          }`}
      >
        {/* Single Sliding Pill Indicator */}
        <div
          className={`absolute top-1.5 bottom-1.5 rounded-xl shadow-md ${isDark ? 'neu-btn-accent-dark' : 'neu-btn-accent-light'
            }`}
          style={{
            left: `calc(0.375rem + ${Math.max(0, ['queue', 'analytics', 'velocity', 'leeches'].indexOf(subTab))} * ((100% - 0.75rem) / 4))`,
            width: `calc((100% - 0.75rem) / 4)`,
            transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
          }}
        />

        <button
          type="button"
          onClick={() => handleSetSubTab('queue')}
          className={`relative z-10 py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center transition-colors duration-300 px-1 text-center truncate ${subTab === 'queue' ? 'text-white font-extrabold' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
        >
          <span className="hidden sm:inline">⚡ Study Hub ({overdueTopics.length + dueTodayTopics.length})</span>
          <span className="sm:hidden">⚡ Hub ({overdueTopics.length + dueTodayTopics.length})</span>
        </button>

        <button
          type="button"
          onClick={() => handleSetSubTab('analytics')}
          className={`relative z-10 py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center transition-colors duration-300 px-1 text-center truncate ${subTab === 'analytics' ? 'text-white font-extrabold' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
        >
          <span className="hidden sm:inline">📊 Analytics & Forecast</span>
          <span className="sm:hidden">📊 Analytics</span>
        </button>

        <button
          type="button"
          onClick={() => handleSetSubTab('velocity')}
          className={`relative z-10 py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center transition-colors duration-300 px-1 text-center truncate ${subTab === 'velocity' ? 'text-white font-extrabold' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
        >
          <span className="hidden sm:inline">⚡ Study Velocity</span>
          <span className="sm:hidden">⚡ Velocity</span>
        </button>

        <button
          type="button"
          onClick={() => handleSetSubTab('leeches')}
          className={`relative z-10 py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center transition-colors duration-300 px-1 text-center truncate ${subTab === 'leeches' ? 'text-white font-extrabold' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
        >
          <span className="hidden sm:inline">⚠️ Leech Focus ({leechTopics.length})</span>
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
              className={`p-5 rounded-2xl border shadow-md space-y-3 ${isDark ? 'bg-[#222730] border-slate-700/60 neu-card-dark' : 'bg-white border-slate-200/80 neu-card-light'
                }`}
            >
              <div className={`flex justify-between items-center text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                <span className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-500" /> Review Pages Load
                </span>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {isReviewOverCap && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 text-[10px] font-black uppercase border border-amber-500/40 animate-pulse">
                      ⚠️ Over Cap by {(completedReviewPagesToday + remainingReviewPagesToday) - dailyLimits.maxReviewPagesPerDay} pgs
                    </span>
                  )}
                  <span className="text-indigo-500 font-bold">
                    {isReviewUnlimited
                      ? `${completedReviewPagesToday} pages completed (Unlimited)`
                      : `${completedReviewPagesToday} / ${dailyLimits.maxReviewPagesPerDay} pages completed`}
                    {remainingReviewPagesToday > 0 && (
                      <span className={`text-[10px] font-normal ml-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        ({remainingReviewPagesToday} pgs {completedReviewPagesToday > 0 ? 'left' : 'queued'})
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <div className={`relative w-full h-2.5 rounded-full overflow-hidden border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-200 border-slate-300/60'}`}>
                {/* Planned / Queued Workload Segment (Subtle Translucent) */}
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${isReviewOverCap ? 'bg-amber-500/30' : 'bg-indigo-500/30'}`}
                  style={{ width: `${isReviewUnlimited ? 100 : Math.min(100, Math.round(((completedReviewPagesToday + remainingReviewPagesToday) / (dailyLimits.maxReviewPagesPerDay || 1)) * 100))}%` }}
                />
                {/* Completed Today Segment (Solid Vibrant Progress) */}
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${isReviewOverCap ? 'bg-amber-500' : 'bg-indigo-500'}`}
                  style={{ width: `${isReviewUnlimited ? 100 : Math.min(100, Math.round((completedReviewPagesToday / (dailyLimits.maxReviewPagesPerDay || 1)) * 100))}%` }}
                />
              </div>
            </motion.div>

            {/* New Pages Gauge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className={`p-5 rounded-2xl border shadow-md space-y-3 ${isDark ? 'bg-[#222730] border-slate-700/60 neu-card-dark' : 'bg-white border-slate-200/80 neu-card-light'
                }`}
            >
              <div className={`flex justify-between items-center text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-500" /> New Topic Pages
                </span>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {isNewOverCap && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 text-[10px] font-black uppercase border border-amber-500/40 animate-pulse">
                      ⚠️ Over Cap by {(completedNewPagesToday + remainingNewPagesToday) - dailyLimits.newPagesPerDay} pgs
                    </span>
                  )}
                  <span className="text-emerald-500 font-bold">
                    {isNewUnlimited
                      ? `${completedNewPagesToday} pages completed (Unlimited)`
                      : `${completedNewPagesToday} / ${dailyLimits.newPagesPerDay} pages completed`}
                    {remainingNewPagesToday > 0 && (
                      <span className={`text-[10px] font-normal ml-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        ({remainingNewPagesToday} pgs {completedNewPagesToday > 0 ? 'left' : 'queued'})
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <div className={`relative w-full h-2.5 rounded-full overflow-hidden border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-200 border-slate-300/60'}`}>
                {/* Planned / Queued Workload Segment (Subtle Translucent) */}
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${isNewOverCap ? 'bg-amber-500/30' : 'bg-emerald-500/30'}`}
                  style={{ width: `${isNewUnlimited ? 100 : Math.min(100, Math.round(((completedNewPagesToday + remainingNewPagesToday) / (dailyLimits.newPagesPerDay || 1)) * 100))}%` }}
                />
                {/* Completed Today Segment (Solid Vibrant Progress) */}
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${isNewOverCap ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${isNewUnlimited ? 100 : Math.min(100, Math.round((completedNewPagesToday / (dailyLimits.newPagesPerDay || 1)) * 100))}%` }}
                />
              </div>
            </motion.div>
          </div>

          {/* Exam Target Banner */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm ${isDark
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
                    className={`ml-1 px-3 py-1 rounded-xl text-xs font-bold border transition-all ${isDark ? 'neu-btn-dark text-amber-400 hover:border-amber-500/50' : 'neu-btn-light text-amber-700 hover:border-amber-400'
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
                        <TopicCard
                          key={topic.id || (topic.subject + '_' + topic.name)}
                          topic={topic}
                          onOpenTopic={(t) => setActiveStudyTopic({ ...t, isOverdue: true, isNew: false })}
                          fsrsConfig={fsrsConfig}
                          isOverdue
                          index={idx}
                          isDark={isDark}
                          subjectTrackerData={subjectTrackerData}
                          studyLogs={studyLogs}
                          timerState={timerState}
                        />
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
                        <TopicCard
                          key={topic.id || (topic.subject + '_' + topic.name)}
                          topic={topic}
                          onOpenTopic={(t) => setActiveStudyTopic({ ...t, isOverdue: false, isNew: false })}
                          fsrsConfig={fsrsConfig}
                          index={idx}
                          isDark={isDark}
                          subjectTrackerData={subjectTrackerData}
                          studyLogs={studyLogs}
                          timerState={timerState}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className={`p-5 rounded-2xl border text-xs text-center font-semibold ${isDark ? 'bg-slate-900/50 border-slate-700/40 text-slate-400' : 'bg-white/80 border-slate-200/80 text-slate-600 neu-pressed-light'
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
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 border ${isDark
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
                      {newTopics.map((topic, idx) => (
                        <TopicCard
                          key={topic.id || (topic.subject + '_' + topic.name)}
                          topic={topic}
                          onOpenTopic={(t) => setActiveStudyTopic({ ...t, isNew: true, isOverdue: false })}
                          onRemove={handleRemoveNewTopic}
                          fsrsConfig={fsrsConfig}
                          isNew
                          index={idx}
                          isDark={isDark}
                          subjectTrackerData={subjectTrackerData}
                          studyLogs={studyLogs}
                          timerState={timerState}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className={`p-6 rounded-2xl border text-center space-y-2 ${isDark ? 'bg-slate-900/40 border-slate-700/40 text-slate-400' : 'bg-white/80 border-slate-200/80 text-slate-600 neu-pressed-light'
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
        activeNewTopicIds={activeNewTopicIds}
        studyLogs={studyLogs}
        studySchedule={studySchedule}
        dailyLimits={dailyLimits}
        geminiApiKey={geminiApiKey}
        aiFeatureModels={aiFeatureModels}
        themeMode={themeMode}
        onUpdateSubjectDoc={onUpdateSubjectDoc}
        onActivateTopics={async (selectedTopics) => {
          const todayStr = getLocalDateStr();
          const activatedIds = selectedTopics.flatMap(t => [
            t.id,
            `${t.subject}_${t.name}`,
            t.name ? t.name.trim().toLowerCase() : '',
            t.subject && t.name ? `${t.subject.toLowerCase()}_${t.name.trim().toLowerCase()}` : ''
          ]).filter(Boolean);

          const updatedList = Array.from(new Set(activatedIds));
          setActiveNewTopicIds(new Set(updatedList));
          await saveActiveNewTopicIds(todayStr, updatedList).catch(err =>
            console.error("Failed to save active new topic IDs to IndexedDB:", err)
          );
          window.dispatchEvent(new CustomEvent('autoanki_topic_ids_changed', {
            detail: { todayStr, updatedList }
          }));

          // Dual-Persist to Subject Tracker Data for Universal Cross-Device Sync Parity with safe batching
          if (typeof onUpdateSubjectDoc === 'function') {
            const nowIso = new Date().toISOString();
            const selectedTopicIdSet = new Set(selectedTopics.map(t => t.id));
            const selectedTopicNameSet = new Set(selectedTopics.map(t => (t.name || '').trim().toLowerCase()));

            for (const subDoc of subjectTrackerData) {
              if (subDoc && subDoc.topics) {
                let docChanged = false;
                const updatedTopics = { ...subDoc.topics };

                Object.entries(updatedTopics).forEach(([tKey, topicObj]) => {
                  if (!topicObj) return;
                  const isUnstudied = (
                    (!topicObj.studyDates || topicObj.studyDates.length === 0) ||
                    ((!topicObj.reviewCount || Number(topicObj.reviewCount) === 0) && (!topicObj.lastReviewDate || topicObj.lastReviewDate === ''))
                  );
                  if (!isUnstudied) return;

                  const topicId = topicObj.id || `${subDoc.subject || 'General'}_${topicObj.name || tKey}`;
                  const cleanName = (topicObj.name || tKey).trim().toLowerCase();
                  const isNowSelected = selectedTopicIdSet.has(topicId) || selectedTopicNameSet.has(cleanName);

                  const wasPicked = Boolean(topicObj.isPickedForToday) || (topicObj.activatedDate && topicObj.activatedDate <= todayStr);

                  if (isNowSelected && !wasPicked) {
                    docChanged = true;
                    updatedTopics[tKey] = {
                      ...topicObj,
                      activatedDate: todayStr,
                      isPickedForToday: true,
                      updatedAt: nowIso
                    };
                  } else if (!isNowSelected && wasPicked) {
                    docChanged = true;
                    updatedTopics[tKey] = {
                      ...topicObj,
                      activatedDate: null,
                      isPickedForToday: false,
                      updatedAt: nowIso
                    };
                  }
                });

                if (docChanged) {
                  await onUpdateSubjectDoc(subDoc.id, { ...subDoc, topics: updatedTopics, updatedAt: nowIso });
                }
              }
            }
            triggerDebouncedSmartPush();
          }

          setToastMessage(`Updated today's study list (${selectedTopics.length} topics selected)`);
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

      {/* Subtab 3: Study Velocity Hub (Predictive Timing Engine) */}
      {subTab === 'velocity' && (
        <StudyVelocityTab
          subjectTrackerData={subjectTrackerData}
          studyLogs={studyLogs}
          fsrsConfig={fsrsConfig}
          timerState={timerState}
          themeMode={themeMode}
          onDeleteTimingLog={onDeleteTimingLog}
        />
      )}

      {/* Subtab 4: Leech Revision */}
      {subTab === 'leeches' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-md ${isDark ? 'bg-[#222730] border-slate-700/60 neu-card-dark' : 'bg-white border-slate-200/80 neu-card-light'
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
              {leechTopics.map((item) => {
                const topicKey = item.id || `${item.subject}_${item.name}`;
                const currentVal = mnemonicNotes[topicKey] !== undefined ? mnemonicNotes[topicKey] : (item.mnemonicNote || '');

                return (
                  <motion.div
                    key={topicKey}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className={`p-5 rounded-2xl border shadow-md space-y-3 ${isDark ? 'bg-[#222730] border-amber-500/40 neu-card-dark' : 'bg-white border-amber-300 neu-card-light'
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
                        value={currentVal}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMnemonicNotes(prev => ({ ...prev, [topicKey]: val }));
                        }}
                        onBlur={(e) => handleMnemonicChange(item, e.target.value)}
                        placeholder="Write a mnemonic or key memory clue..."
                        className={`w-full p-2.5 rounded-xl text-xs focus:outline-none focus:border-amber-500/60 resize-y min-h-[64px] custom-scrollbar ${isDark ? 'bg-slate-900/80 border border-slate-700 text-slate-200' : 'bg-slate-50 border border-slate-300 text-slate-800 neu-pressed-light'
                          }`}
                      />
                    </div>

                    {/* Open Dedicated Study Action */}
                    <div className="flex items-center justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveStudyTopic(item);
                          handleSetSubTab('queue');
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-wider transition-all duration-200 flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 border ${
                          isDark
                            ? 'neu-btn-dark text-amber-400 border-amber-500/40 hover:text-amber-300'
                            : 'neu-btn-light text-amber-700 border-amber-300 hover:text-amber-900'
                        }`}
                      >
                        <span>⚡ Open Dedicated Study</span>
                        <span className="text-[10px] opacity-75">→</span>
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className={`p-8 rounded-2xl border text-center space-y-2 ${isDark ? 'bg-slate-900/40 border-slate-700/40' : 'bg-white/80 border-slate-200/80 neu-pressed-light'
              }`}>
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
              <div className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>No Problematic Leech Topics Detected</div>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>All textbook chapter topics are within acceptable lapse thresholds!</p>
            </div>
          )}
        </motion.div>
      )}

              </>
      )}

      {/* EXAM TARGET MANAGEMENT MODAL */}
      {isExamModalOpen && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overscroll-contain">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className={`w-full max-w-lg p-6 rounded-3xl border shadow-2xl space-y-6 ${isDark ? 'bg-[#222730] border-slate-700/80 text-white neu-card-dark' : 'bg-[#e6ecf5] border-slate-300 text-slate-900 neu-card-light'
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
                className={`p-1.5 rounded-xl border transition-all cursor-pointer ${isDark ? 'neu-btn-dark text-slate-400 hover:text-white' : 'neu-btn-light text-slate-600 hover:text-slate-900'
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
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all min-h-[36px] cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 ${newExamTitle === preset
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-sm'
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
                    className={`w-full px-3 py-2 rounded-xl text-xs font-semibold border outline-none ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-amber-600 mb-1">Exam Date</label>
                  <input
                    type="date"
                    value={newExamDate}
                    onChange={(e) => setNewExamDate(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-semibold border outline-none ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
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
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 no-scrollbar">
                  {examProfiles.map((exam, idx) => (
                    <div
                      key={exam.id || idx}
                      className={`p-3 rounded-xl border flex items-center justify-between ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
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
                className={`px-5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${isDark ? 'neu-btn-dark text-slate-300' : 'neu-btn-light text-slate-700'
                  }`}
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* AD-HOC / EARLY REVIEW MODAL */}
      {isAdHocModalOpen && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overscroll-contain">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className={`w-full max-w-2xl p-6 rounded-3xl border shadow-2xl space-y-5 max-h-[85vh] flex flex-col ${isDark ? 'bg-[#222730] border-slate-700/80 text-white neu-card-dark' : 'bg-[#e6ecf5] border-slate-300 text-slate-900 neu-card-light'
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
                className={`p-1.5 rounded-xl border transition-all cursor-pointer ${isDark ? 'neu-btn-dark text-slate-400 hover:text-white' : 'neu-btn-light text-slate-600 hover:text-slate-900'
                  }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* If rating a topic inside modal */}
            {adHocActiveTopic ? (
              <div className="space-y-4 overflow-y-auto p-2 no-scrollbar">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setAdHocActiveTopic(null)}
                    className="text-xs font-bold text-amber-500 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    ← Back to Search
                  </button>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                    Ad-hoc Review Mode
                  </span>
                </div>

                <TopicCard
                  topic={adHocActiveTopic}
                  onRate={(topicToRate, rating, predictedMinutes) => {
                    handleRequestRateTopic(topicToRate, rating, predictedMinutes);
                    setAdHocActiveTopic(null);
                    setIsAdHocModalOpen(false);
                  }}
                  onOpenNotes={onOpenNotesModal}
                  fsrsConfig={fsrsConfig}
                  isDark={isDark}
                  geminiApiKey={geminiApiKey}
                  aiFeatureModels={aiFeatureModels}
                  subjectTrackerData={subjectTrackerData}
                  studyLogs={studyLogs}
                  timerState={timerState}
                  onPushUndoAction={onPushUndoAction}
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
                      className={`w-full pl-10 pr-4 py-2.5 rounded-2xl text-xs font-semibold border outline-none ${isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                    />
                  </div>

                  {/* Subject Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                    <button
                      type="button"
                      onClick={() => setAdHocSelectedSubject('all')}
                      className={`px-3 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${adHocSelectedSubject === 'all'
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
                        className={`px-3 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${adHocSelectedSubject === subDoc.subject
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
                <div className="space-y-2 overflow-y-auto pr-1 flex-1 min-h-[250px] no-scrollbar">
                  {filteredAdHocTopics.length === 0 ? (
                    <div className="text-center py-10 text-xs font-semibold text-slate-400 italic">
                      No matching topics found. Try typing a different keyword!
                    </div>
                  ) : (
                    filteredAdHocTopics.map((topic, idx) => (
                      <div
                        key={topic.id || idx}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${isDark ? 'bg-slate-900/80 border-slate-800 hover:border-amber-500/40' : 'bg-white border-slate-200 hover:border-amber-400'
                          }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-500 px-2 py-0.5 rounded-md bg-amber-500/10">
                              {topic.subject}
                            </span>
                            <span className="text-xs font-bold">{topic.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {topic.pageLabel && topic.pageLabel !== 'No pgs' && (
                              <span className="font-mono font-bold text-amber-500/90">{topic.pageLabel} ({topic.pageCount} {topic.pageCount === 1 ? 'pg' : 'pgs'})</span>
                            )}
                            <span>Due: {topic.nextReviewDue || 'Unscheduled'}</span>
                            <span>Reviews: {topic.reviewCount || 0}</span>
                            {topic.stability && <span>Stability: {topic.stability}d</span>}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setIsAdHocModalOpen(false);
                            setAdHocActiveTopic(null);
                            setActiveStudyTopic(topic);
                            handleSetSubTab('queue');
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition-all active:scale-95 cursor-pointer shrink-0"
                        >
                          ⚡ Review Now
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </div>,
        document.body
      )}

      {/* Post-Rating Duration Confirmation Modal */}
      {pendingRatingData && (
        <RatingDurationModal
          isOpen={!!pendingRatingData}
          topic={pendingRatingData.topic}
          rating={pendingRatingData.rating}
          predictedMinutes={pendingRatingData.predictedMinutes}
          suggestedMinutes={pendingRatingData.predictedMinutes}
          elapsedSessionSeconds={pendingRatingData.elapsedSessionSeconds || 0}
          timerState={timerState}
          onSubmit={handleConfirmRatingDuration}
          onConfirm={handleConfirmRatingDuration}
          onClose={handleSkipRatingDuration}
          onSkip={handleSkipRatingDuration}
          themeMode={themeMode}
          isDark={isDark}
        />
      )}
    </div>
  );
}

// Sub-component: Individual Topic Queue Card (Streamlined & Lightweight)
function TopicCard({
  topic,
  onOpenTopic,
  onRemove,
  fsrsConfig,
  isOverdue = false,
  isNew = false,
  index = 0,
  isDark = true,
  subjectTrackerData = [],
  studyLogs = [],
  timerState = null
}) {
  const { pageLabel } = getTopicPageInfo(topic);
  const effectivePageCount = topic.pageWeight || topic.pageCount || getTopicPageWeight(topic, [], subjectTrackerData) || 1;

  const quantizedContinuousMins = timerState?.continuousMins ? Math.floor(timerState.continuousMins) : 0;
  const topicPrediction = useMemo(() => {
    return calculatePredictiveTopicTime(topic, subjectTrackerData, studyLogs, fsrsConfig, timerState);
  }, [topic, subjectTrackerData, studyLogs, fsrsConfig, quantizedContinuousMins]);

  const isReviewed = !isNew && (topic.reviewCount || 0) > 0 && !!topic.lastReviewDate;
  const sLabel = topic.stability ? `${Number(topic.stability).toFixed(1)}d` : 'New';
  const dLabel = topic.difficulty ? Number(topic.difficulty).toFixed(1) : 'Unstudied';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.2) }}
      onClick={() => {
        if (onOpenTopic) onOpenTopic(topic);
      }}
      className={`group relative p-4 rounded-2xl border shadow-md flex flex-col justify-between gap-3 cursor-pointer transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] ${
        isOverdue
          ? isDark ? 'bg-[#222730] border-rose-500/50 hover:border-rose-500/80 neu-card-dark' : 'bg-white border-rose-300 hover:border-rose-400 neu-card-light'
          : isNew
            ? isDark ? 'bg-[#222730] border-emerald-500/40 hover:border-emerald-500/70 neu-card-dark' : 'bg-white border-emerald-300 hover:border-emerald-400 neu-card-light'
            : isDark ? 'bg-[#222730] border-slate-700/60 hover:border-indigo-500/60 neu-card-dark' : 'bg-white border-slate-200/80 hover:border-indigo-400/80 neu-card-light'
      }`}
    >
      {/* Top row: Subject Badge + FSRS Stats & Actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
            isOverdue
              ? 'bg-rose-500/15 text-rose-500 border-rose-500/30'
              : isNew
                ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                : 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30'
          }`}>
            {topic.subject || 'GENERAL'}
          </span>
          {isOverdue && (
            <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-500 text-white animate-pulse">
              Overdue
            </span>
          )}
          {isNew && (
            <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500 text-white">
              New
            </span>
          )}
        </div>

        {/* Top Right: FSRS Metrics & Remove button if new */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              S: <strong className={isReviewed ? 'text-sky-400' : (isDark ? 'text-slate-400' : 'text-slate-600')}>{sLabel}</strong>
            </span>
            <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              D: <strong className={isReviewed ? 'text-amber-400' : (isDark ? 'text-slate-400' : 'text-slate-600')}>{dLabel}</strong>
            </span>
          </div>

          {isNew && onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(topic);
              }}
              title="Remove from today's new topics"
              className={`p-1 rounded-lg transition-colors cursor-pointer ${
                isDark ? 'text-slate-500 hover:text-rose-400 hover:bg-slate-800' : 'text-slate-400 hover:text-rose-600 hover:bg-slate-100'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Middle row: Topic Title */}
      <div>
        <h3 className={`text-sm sm:text-base font-black leading-tight tracking-tight ${
          isDark ? 'text-slate-100 group-hover:text-indigo-300' : 'text-slate-900 group-hover:text-indigo-600'
        } transition-colors line-clamp-2`}>
          {topic.name}
        </h3>
      </div>

      {/* Bottom row: Page range, Estimated Duration, and Open Button */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-700/20 dark:border-slate-700/40">
        <div className="flex items-center gap-2.5 text-xs flex-wrap">
          {pageLabel && (
            <span className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              {pageLabel} <span className="opacity-60">•</span> {effectivePageCount} {effectivePageCount === 1 ? 'page' : 'pages'}
            </span>
          )}
          {topicPrediction?.predictedMinutes > 0 && (
            <span className={`flex items-center gap-1 font-bold text-[11px] ${
              topicPrediction.isWarmupBonusActive
                ? 'text-amber-400'
                : topicPrediction.isFatigueActive
                  ? 'text-orange-400'
                  : 'text-amber-500'
            }`}>
              <Zap className="w-3 h-3 fill-current" />
              <span>~{formatPredictedDuration(topicPrediction.predictedMinutes)}</span>
            </span>
          )}
        </div>

        {/* Tactile Open Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onOpenTopic) onOpenTopic(topic);
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-wider transition-all duration-200 flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 border ${
            isDark
              ? 'neu-btn-dark text-indigo-300 border-indigo-500/40 hover:text-indigo-200 hover:border-indigo-400'
              : 'neu-btn-light text-indigo-700 border-indigo-300 hover:text-indigo-900 hover:border-indigo-400'
          }`}
        >
          <span>Open</span>
          <span className="text-[10px] opacity-75">→</span>
        </button>
      </div>
    </motion.div>
  );
}

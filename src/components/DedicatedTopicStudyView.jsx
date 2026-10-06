import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Brain,
  BookOpen,
  FileText,
  Lightbulb,
  Sparkles,
  CheckCircle,
  RotateCcw,
  Eye,
  Trash2,
  Clock,
  Layers,
  ChevronDown,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Save,
  Zap,
  HelpCircle
} from 'lucide-react';
import { getTopicPageInfo, getTopicPageWeight, parsePageNumbers } from '../utils/pageUtils';
import {
  getTopicHintsLocal,
  saveTopicHintsLocal,
  deleteTopicHintsLocal,
  getLocalPytTopic,
  getLocalTextbooksMetadata,
  saveLocalTextbooksMetadata,
  getLocalSubjectTrackerData,
  saveLocalSubjectTrackerDoc
} from '../services/localDb';
import { generateTopicActiveRecallHints } from '../services/aiHintEngine';
import { extractTopicPdfSlice } from '../services/pdfSliceService';
import { calculatePredictiveTopicTime } from '../services/predictiveTimingEngine';
import { calculateNextFSRSState, ensureCalibratedWeights } from '../services/fsrsEngine';
import { triggerDebouncedSmartPush } from '../services/googleDriveSync';

export default function DedicatedTopicStudyView({
  topic,
  onClose,
  onRate,
  fsrsConfig,
  themeMode = 'dark',
  geminiApiKey = '',
  aiFeatureModels = {},
  subjectTrackerData = [],
  studyLogs = [],
  timerState = null,
  onPushUndoAction,
  onUpdateSubjectDoc,
  isNew = false,
  isOverdue = false
}) {
  const isDark = themeMode === 'dark';
  const [activeTab, setActiveTab] = useState('hints'); // 'hints', 'pdf', 'notes'
  
  // Topic metadata & page weight calculations
  const { pageLabel, startPage, endPage } = getTopicPageInfo(topic);
  const effectivePageCount = topic.pageWeight || topic.pageCount || getTopicPageWeight(topic, [], subjectTrackerData) || 1;
  const isReviewed = !isNew && (topic.reviewCount || 0) > 0 && !!topic.lastReviewDate;

  // Predictive timing calculation
  const quantizedContinuousMins = timerState?.continuousMins ? Math.floor(timerState.continuousMins) : 0;
  const topicPrediction = useMemo(() => {
    return calculatePredictiveTopicTime(topic, subjectTrackerData, studyLogs, fsrsConfig, timerState);
  }, [topic, subjectTrackerData, studyLogs, fsrsConfig, quantizedContinuousMins]);

  // FSRS interval previews
  const intervalPreviews = useMemo(() => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const weights = ensureCalibratedWeights(fsrsConfig?.weights);
      const dr = fsrsConfig?.globalDesiredRetention || 0.90;

      const state1 = calculateNextFSRSState(topic, 1, todayStr, weights, dr);
      const state2 = calculateNextFSRSState(topic, 2, todayStr, weights, dr);
      const state3 = calculateNextFSRSState(topic, 3, todayStr, weights, dr);
      const state4 = calculateNextFSRSState(topic, 4, todayStr, weights, dr);

      const formatDays = (d) => {
        if (!d || d <= 1) return '1d';
        if (d < 30) return `${Math.round(d)}d`;
        if (d < 365) {
          const months = d / 30;
          return months % 1 === 0 ? `${months}m` : `${months.toFixed(1)}m`;
        }
        const years = d / 365;
        return years % 1 === 0 ? `${years}y` : `${years.toFixed(1)}y`;
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

  // --- HINTS STATE & ACTIVE RECALL SCORING ---
  const [topicHints, setTopicHints] = useState(null);
  const [isGeneratingHints, setIsGeneratingHints] = useState(false);
  const [hintError, setHintError] = useState(null);
  const [recalledPointsMap, setRecalledPointsMap] = useState({});
  const [expandedNodesMap, setExpandedNodesMap] = useState({});
  const [revealedHintCount, setRevealedHintCount] = useState(1);

  // Load cached hints on mount
  useEffect(() => {
    let isMounted = true;
    const topicId = topic.id || `${topic.subject}_${topic.name}`;

    async function loadCachedHints() {
      try {
        const cached = await getTopicHintsLocal(topicId);
        const hasData = cached && (
          (Array.isArray(cached.tree) && cached.tree.length > 0) ||
          (Array.isArray(cached.structure) && cached.structure.length > 0) ||
          (Array.isArray(cached.hints) && cached.hints.length > 0)
        );
        if (isMounted) {
          if (hasData) {
            setTopicHints(cached);
            setRevealedHintCount(1);
          } else {
            setTopicHints(null);
          }
        }
      } catch (err) {
        console.warn('Failed loading cached topic hints:', err);
      }
    }
    loadCachedHints();

    return () => {
      isMounted = false;
    };
  }, [topic]);

  // Recall Node Checkbox Handlers
  const handleToggleRecallNode = (targetNodeId) => {
    setRecalledPointsMap(prev => ({
      ...prev,
      [targetNodeId]: !prev[targetNodeId]
    }));
  };

  const handleToggleExpandNode = (nodeId) => {
    setExpandedNodesMap(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  // Tree & Blueprint Active Recall Metrics
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

  const recallPercent = treeMetrics ? treeMetrics.percent : (blueprintMetrics ? blueprintMetrics.percent : null);
  const suggestedRating = recallPercent !== null && ((treeMetrics?.totalNodes || 0) > 0 || (blueprintMetrics?.totalPoints || 0) > 0)
    ? (recallPercent < 35 ? 1 : recallPercent < 60 ? 2 : recallPercent < 85 ? 3 : 4)
    : null;

  // Resilient PDF Retrieval Helper
  const extractValidPdfBuffer = (pdfObj) => {
    if (!pdfObj || typeof pdfObj !== 'object') return null;
    const candidates = [pdfObj.data, pdfObj.topics?.data, pdfObj.topics, pdfObj];
    for (const c of candidates) {
      if (!c) continue;
      if (c instanceof ArrayBuffer && c.byteLength > 0) return c;
      if (ArrayBuffer.isView(c) && c.byteLength > 0) {
        return c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength);
      }
      if (typeof c === 'string' && c.startsWith('data:application/pdf;base64,')) {
        try {
          const base64 = c.split(',')[1];
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return bytes.buffer;
        } catch (e) {
          console.warn('Failed to decode base64 data url:', e);
        }
      }
    }
    return null;
  };

  const resolveTopicPdfBuffer = async (subjectName, topicName) => {
    const cleanSub = (subjectName || '').trim().toLowerCase().replace(/\s+/g, '_');
    const cleanTop = (topicName || '').trim().toLowerCase().replace(/\s+/g, '_');
    const topicPdfKey = `pyt_pdf_${cleanSub}_topic_${cleanTop}`;
    
    // 1. Check pre-split topic PDF
    let pdfObj = await getLocalPytTopic(topicPdfKey);
    let pdfArrayBuffer = extractValidPdfBuffer(pdfObj);
    if (pdfObj && pdfArrayBuffer) {
      return { pdfObj, pdfArrayBuffer, isPreSplit: true };
    }

    // 2. Check master subject PDF key
    const masterPdfKey = `pyt_pdf_${cleanSub}`;
    pdfObj = await getLocalPytTopic(masterPdfKey);
    pdfArrayBuffer = extractValidPdfBuffer(pdfObj);
    if (pdfObj && pdfArrayBuffer) {
      return { pdfObj, pdfArrayBuffer, isPreSplit: false };
    }

    // 3. Check textbooksMetadata registry
    const metadataList = (await getLocalTextbooksMetadata()) || [];
    const meta = metadataList.find(tb => (tb.subject || '').toLowerCase() === (subjectName || '').toLowerCase());
    if (meta && meta.id) {
      pdfObj = await getLocalPytTopic(meta.id);
      pdfArrayBuffer = extractValidPdfBuffer(pdfObj);
      if (pdfObj && pdfArrayBuffer) {
        return { pdfObj, pdfArrayBuffer, isPreSplit: false };
      }
    }

    // 4. Try normalized alphanumeric key
    const altKey = `pyt_pdf_${cleanSub.replace(/[^a-z0-9]/g, '_')}`;
    if (altKey !== masterPdfKey) {
      pdfObj = await getLocalPytTopic(altKey);
      pdfArrayBuffer = extractValidPdfBuffer(pdfObj);
      if (pdfObj && pdfArrayBuffer) {
        return { pdfObj, pdfArrayBuffer, isPreSplit: false };
      }
    }

    return { pdfObj: null, pdfArrayBuffer: null, isPreSplit: false };
  };

  // AI Hint Generation Handlers
  const handleGenerateHints = async () => {
    setHintError(null);
    if (!geminiApiKey) {
      setHintError('Missing Gemini API Key! Please configure your Gemini API Key in Settings to generate AI Active-Recall hints.');
      return;
    }

    try {
      setIsGeneratingHints(true);
      const subjectName = topic.subject || '';
      const topicName = topic.name || '';

      const { pdfObj, pdfArrayBuffer, isPreSplit } = await resolveTopicPdfBuffer(subjectName, topicName);

      if (!pdfObj || !pdfArrayBuffer) {
        setHintError(`No textbook PDF attached for "${topicName}" (${subjectName}). Please upload a Master Subject PDF in Subject Tracker -> "Textbook Manager".`);
        setIsGeneratingHints(false);
        return;
      }

      const metadataList = (await getLocalTextbooksMetadata()) || [];
      const meta = metadataList.find(tb => (tb.subject || '').toLowerCase() === subjectName.toLowerCase());
      const pageOffset = meta?.pageOffset || 0;

      const pageInfo = parsePageNumbers(topic);
      const sPage = pageInfo.startPage || 1;
      let ePage = pageInfo.endPage;

      if (!isPreSplit && !ePage) {
        const subDoc = (subjectTrackerData || []).find(s => (s.id || '').toLowerCase() === (subjectName || '').toLowerCase());
        const allTopics = subDoc?.topics ? Object.values(subDoc.topics) : [];
        const nextStartPages = allTopics
          .map(t => parsePageNumbers(t).startPage)
          .filter(p => p !== null && p > sPage)
          .sort((a, b) => a - b);

        if (nextStartPages.length > 0) {
          ePage = nextStartPages[0] - 1;
        } else {
          const weight = getTopicPageWeight(topic, allTopics, subjectTrackerData);
          ePage = sPage + Math.max(0, weight - 1);
        }
      }

      const topicId = topic.id || `${topic.subject}_${topic.name}`;
      const hintPayload = await generateTopicActiveRecallHints({
        topicId,
        topicName: topic.name,
        subject: subjectName,
        pdfArrayBuffer,
        startPage: sPage,
        endPage: ePage,
        pageOffset,
        isPreSplit,
        geminiApiKey,
        aiFeatureModels
      });

      setTopicHints(hintPayload);
      setRevealedHintCount(1);
    } catch (err) {
      console.error('Failed generating hints:', err);
      setHintError(err.message || 'Failed to generate hints');
    } finally {
      setIsGeneratingHints(false);
    }
  };

  const handleDeleteHints = async () => {
    if (!confirm(`Delete AI hints & outline for "${topic.name}"?`)) return;
    try {
      const topicId = topic.id || `${topic.subject}_${topic.name}`;
      const existingHints = topicHints || (await getTopicHintsLocal(topicId));
      await deleteTopicHintsLocal(topicId);
      setTopicHints(null);
      setRecalledPointsMap({});

      if (typeof onPushUndoAction === 'function') {
        onPushUndoAction({
          actionType: 'DELETE_TOPIC_HINTS',
          topicId,
          topicName: topic.name,
          hintPayload: existingHints,
          timestamp: Date.now()
        });
      }
      window.dispatchEvent(new CustomEvent('autoanki_hints_changed', { detail: { topicId, hintPayload: null } }));
    } catch (err) {
      console.error('Failed deleting hints:', err);
    }
  };

  // --- PDF SLICE READER STATE ---
  const [pdfSlice, setPdfSlice] = useState(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [pdfViewMode, setPdfViewMode] = useState('images'); // 'images', 'text'
  const [zoomScale, setZoomScale] = useState(1);
  const [pdfOffset, setPdfOffset] = useState(0);

  const loadPdfSlice = async () => {
    try {
      setIsLoadingPdf(true);
      setPdfError(null);
      const subjectName = topic.subject || '';
      const topicName = topic.name || '';

      const { pdfObj, pdfArrayBuffer, isPreSplit } = await resolveTopicPdfBuffer(subjectName, topicName);
      if (!pdfObj || !pdfArrayBuffer) {
        setPdfError(`No textbook PDF found for "${topicName}" (${subjectName}). Please upload in Subject Tracker -> Textbook Manager.`);
        setIsLoadingPdf(false);
        return;
      }

      const metadataList = (await getLocalTextbooksMetadata()) || [];
      const meta = metadataList.find(tb => (tb.subject || '').toLowerCase() === subjectName.toLowerCase());
      const offsetVal = meta?.pageOffset || meta?.offset || 0;
      setPdfOffset(offsetVal);

      const pageInfo = parsePageNumbers(topic);
      const sPage = pageInfo.startPage || 1;
      let ePage = pageInfo.endPage;

      if (!isPreSplit && !ePage) {
        const subDoc = (subjectTrackerData || []).find(s => (s.id || '').toLowerCase() === (subjectName || '').toLowerCase());
        const allTopics = subDoc?.topics ? Object.values(subDoc.topics) : [];
        const nextStartPages = allTopics
          .map(t => parsePageNumbers(t).startPage)
          .filter(p => p !== null && p > sPage)
          .sort((a, b) => a - b);

        if (nextStartPages.length > 0) {
          ePage = nextStartPages[0] - 1;
        } else {
          const weight = getTopicPageWeight(topic, allTopics, subjectTrackerData);
          ePage = sPage + Math.max(0, weight - 1);
        }
      }

      const slice = await extractTopicPdfSlice({
        pdfArrayBuffer,
        startPage: sPage,
        endPage: ePage,
        pageOffset: offsetVal,
        isPreSplit
      });

      setPdfSlice(slice);
    } catch (err) {
      console.error('Failed loading PDF slice in study workspace:', err);
      setPdfError(err.message || 'Error extracting textbook pages.');
    } finally {
      setIsLoadingPdf(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'pdf' && !pdfSlice && !isLoadingPdf) {
      loadPdfSlice();
    }
  }, [activeTab]);

  // Clean up PDF image bitmaps on unmount to guarantee zero memory leaks
  useEffect(() => {
    return () => {
      setPdfSlice(null);
    };
  }, []);

  // --- TOPIC NOTES STATE & AUTO-SAVE ---
  const [topicNotes, setTopicNotes] = useState(topic.notes || topic.mnemonicNote || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const handleSaveNotes = async (newText) => {
    setTopicNotes(newText);
    const subName = topic.subject || '';
    const cleanTopic = topic.name || '';
    if (!subName || !cleanTopic) return;

    try {
      setIsSavingNotes(true);
      const docId = subName.trim().toLowerCase();
      const allDocs = (await getLocalSubjectTrackerData()) || subjectTrackerData || [];
      const subDoc = allDocs.find(d => (d.id && d.id.toLowerCase() === docId) || (d.subject && d.subject.toLowerCase() === docId));

      if (subDoc && subDoc.topics) {
        const clonedTopics = { ...subDoc.topics };
        const cleanTargetName = cleanTopic.trim().toLowerCase();
        let topicKey = Object.keys(clonedTopics).find(k =>
          k.trim().toLowerCase() === cleanTargetName ||
          clonedTopics[k]?.name?.trim().toLowerCase() === cleanTargetName ||
          clonedTopics[k]?.id === topic.id
        ) || cleanTopic;

        const nowIso = new Date().toISOString();
        clonedTopics[topicKey] = {
          ...clonedTopics[topicKey],
          notes: newText,
          mnemonicNote: newText,
          updatedAt: nowIso
        };

        const targetDocId = (subDoc.id ? String(subDoc.id) : docId).trim().toLowerCase();
        const updatedDoc = {
          ...subDoc,
          id: targetDocId,
          topics: clonedTopics,
          updatedAt: nowIso
        };

        if (typeof onUpdateSubjectDoc === 'function') {
          await onUpdateSubjectDoc(targetDocId, { topics: clonedTopics });
        } else {
          await saveLocalSubjectTrackerDoc(targetDocId, updatedDoc);
        }
        triggerDebouncedSmartPush();
      }
    } catch (err) {
      console.error('Failed saving topic notes:', err);
    } finally {
      setIsSavingNotes(false);
    }
  };

  // KEYBOARD SHORTCUTS (Esc to close, 1-4 to rate)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === '1') {
        e.preventDefault();
        handlePerformRating(1);
      } else if (e.key === '2') {
        e.preventDefault();
        handlePerformRating(2);
      } else if (e.key === '3') {
        e.preventDefault();
        handlePerformRating(3);
      } else if (e.key === '4') {
        e.preventDefault();
        handlePerformRating(4);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [topic, topicPrediction, onClose]);

  const handlePerformRating = (rating) => {
    if (onRate) {
      onRate(topic, rating, topicPrediction.predictedMinutes);
    }
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.3, ease: [0.175, 0.885, 0.32, 1.275] }}
      className={`w-full min-h-[85vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden ${
        isDark ? 'bg-[#222730] border-slate-700/80 text-slate-100 neu-card-dark' : 'bg-[#e6ecf5] border-slate-300 text-slate-900 neu-card-light'
      }`}
    >
      {/* 1. TOP HEADER & TOPIC DETAILS BAR */}
      <div className={`p-4 sm:p-6 border-b flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
        isDark ? 'border-slate-700/60 bg-slate-900/40' : 'border-slate-200/80 bg-white/60'
      }`}>
        {/* Left: Back Button & Topic Info */}
        <div className="flex items-start sm:items-center gap-3 w-full md:w-auto">
          <button
            type="button"
            onClick={onClose}
            title="Back to Review Queue (Esc)"
            className={`p-2.5 rounded-2xl border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              isDark ? 'neu-btn-dark text-slate-300 hover:text-white border-slate-700' : 'neu-btn-light text-slate-600 hover:text-slate-900 border-slate-300'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-bold hidden sm:inline">Back</span>
          </button>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-lg border ${
                isDark ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' : 'bg-indigo-100 text-indigo-700 border-indigo-200'
              }`}>
                {topic.subject || 'General'}
              </span>
              {isOverdue && (
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 border border-rose-500/40">
                  Overdue
                </span>
              )}
              {isNew && (
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  New Topic
                </span>
              )}
              <span className={`text-[11px] font-mono font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                ⚡ ~{topicPrediction.predictedMinutes}m ({topicPrediction.tierLabel})
              </span>
            </div>

            <h2 className="text-lg sm:text-xl font-black tracking-tight truncate max-w-xl">
              {topic.name}
            </h2>

            <div className={`text-xs font-medium flex items-center gap-3 flex-wrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <span className="font-mono font-bold text-indigo-400">
                {pageLabel} • {effectivePageCount} {effectivePageCount === 1 ? 'page' : 'pages'}
              </span>
              <span>•</span>
              <span className="font-mono">
                S: <strong className="text-sky-400">{isReviewed && topic.stability != null ? `${topic.stability.toFixed(1)}d` : 'New'}</strong>
              </span>
              <span>•</span>
              <span className="font-mono">
                D: <strong className="text-amber-400">{isReviewed && topic.difficulty != null ? topic.difficulty.toFixed(1) : 'Unstudied'}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right: Mode Switcher Sliding Pill Navigation */}
        <div className={`relative p-1 rounded-2xl flex items-center self-stretch md:self-auto shrink-0 ${
          isDark ? 'neu-pressed-dark border border-slate-750' : 'neu-pressed-light border border-slate-200'
        }`}>
          <div
            className="absolute top-1 bottom-1 rounded-xl bg-indigo-600 shadow-md transition-all duration-300"
            style={{
              width: 'calc(33.333% - 4px)',
              left: activeTab === 'hints' ? '2px' : activeTab === 'pdf' ? 'calc(33.333% + 2px)' : 'calc(66.666% + 2px)',
              transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
            }}
          />
          <button
            type="button"
            onClick={() => setActiveTab('hints')}
            className={`relative z-10 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 flex-1 transition-colors ${
              activeTab === 'hints' ? 'text-white' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI Hints & Mindmap</span>
            <span className="sm:hidden">Hints</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pdf')}
            className={`relative z-10 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 flex-1 transition-colors ${
              activeTab === 'pdf' ? 'text-white' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Textbook PDF</span>
            <span className="sm:hidden">Textbook</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`relative z-10 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 flex-1 transition-colors ${
              activeTab === 'notes' ? 'text-white' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Notes</span>
            <span className="sm:hidden">Notes</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE CONTENT AREA */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto no-scrollbar space-y-6">
        {/* TAB 1: AI ACTIVE RECALL HINTS & MINDMAP */}
        {activeTab === 'hints' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-6 max-w-4xl mx-auto"
          >
            {/* Action Bar / Status Header */}
            <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
              isDark ? 'neu-pressed-dark border-slate-700/60' : 'neu-pressed-light border-slate-200'
            }`}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                  <h4 className="text-sm font-black uppercase tracking-wider">
                    Recursive Mindmap & Active-Recall Testing
                  </h4>
                </div>
                <p className="text-xs text-slate-400">
                  Check off the concepts you successfully recalled from memory to calculate your active recall score.
                </p>
              </div>

              <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0 flex-wrap">
                {topicHints ? (
                  <>
                    <button
                      type="button"
                      onClick={handleGenerateHints}
                      disabled={isGeneratingHints}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                        isDark ? 'neu-btn-dark text-slate-300 hover:text-white border-slate-700' : 'neu-btn-light text-slate-700 border-slate-300'
                      }`}
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${isGeneratingHints ? 'animate-spin' : ''}`} />
                      <span>{isGeneratingHints ? 'Regenerating...' : 'Regenerate'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteHints}
                      title="Delete hints"
                      className="p-1.5 rounded-xl text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleGenerateHints}
                    disabled={isGeneratingHints}
                    className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className={`w-4 h-4 ${isGeneratingHints ? 'animate-spin' : ''}`} />
                    <span>{isGeneratingHints ? 'Generating AI Mindmap...' : 'Generate AI Recall Hints'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Error Display */}
            {hintError && (
              <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <div className="space-y-1">
                  <p className="font-bold">Hint Generation Notice</p>
                  <p className="opacity-90">{hintError}</p>
                </div>
              </div>
            )}

            {/* Score & Recommendation Banner */}
            {topicHints && recallPercent !== null && (
              <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                suggestedRating === 4
                  ? isDark ? 'bg-emerald-950/20 border-emerald-500/40' : 'bg-emerald-50 border-emerald-300'
                  : suggestedRating === 3
                    ? isDark ? 'bg-indigo-950/20 border-indigo-500/40' : 'bg-indigo-50 border-indigo-300'
                    : suggestedRating === 2
                      ? isDark ? 'bg-amber-950/20 border-amber-500/40' : 'bg-amber-50 border-amber-300'
                      : isDark ? 'bg-rose-950/20 border-rose-500/40' : 'bg-rose-50 border-rose-300'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`text-xl font-black font-mono px-3 py-1 rounded-xl ${
                    suggestedRating === 4
                      ? 'bg-emerald-500 text-slate-950'
                      : suggestedRating === 3
                        ? 'bg-indigo-500 text-white'
                        : suggestedRating === 2
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-rose-500 text-white'
                  }`}>
                    {recallPercent}%
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Recall Mastery</p>
                    <p className="text-sm font-black">
                      Suggested Grade: {suggestedRating === 4 ? 'Easy (4)' : suggestedRating === 3 ? 'Good (3)' : suggestedRating === 2 ? 'Hard (2)' : 'Again (1)'}
                    </p>
                  </div>
                </div>

                <div className="hidden sm:block text-xs text-right font-mono text-slate-400">
                  {treeMetrics ? `${treeMetrics.recalledCount} / ${treeMetrics.totalNodes} Nodes Checked` : `${blueprintMetrics?.recalledCount || 0} / ${blueprintMetrics?.totalPoints || 0} Points Checked`}
                </div>
              </div>
            )}

            {/* Render Tree / Hints */}
            {topicHints ? (
              <div className="space-y-4">
                {/* 1. Recursive Tree Mindmap View */}
                {Array.isArray(topicHints.tree) && topicHints.tree.length > 0 && (
                  <div className={`p-4 sm:p-6 rounded-2xl border space-y-3 ${
                    isDark ? 'bg-slate-900/50 border-slate-700/60' : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between border-b pb-2 border-slate-700/40">
                      <span className="text-xs font-black uppercase tracking-wider text-indigo-400">Concept Hierarchy</span>
                      <span className="text-[11px] text-slate-400 font-mono">Tap checkbox to mark recalled</span>
                    </div>

                    <div className="space-y-2 pt-2">
                      {topicHints.tree.map((node, nIdx) => (
                        <StudyWorkspaceTreeNode
                          key={node.id || node.title || nIdx}
                          node={node}
                          depth={0}
                          recalledMap={recalledPointsMap}
                          onToggleRecall={handleToggleRecallNode}
                          expandedMap={expandedNodesMap}
                          onToggleExpand={handleToggleExpandNode}
                          isDark={isDark}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Structured Blueprint View */}
                {Array.isArray(topicHints.structure) && topicHints.structure.length > 0 && !topicHints.tree && (
                  <div className="space-y-4">
                    {topicHints.structure.map((topObj, tIdx) => (
                      <div
                        key={tIdx}
                        className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${
                          isDark ? 'bg-slate-900/50 border-slate-700/60' : 'bg-white border-slate-200'
                        }`}
                      >
                        <h5 className="text-sm font-black text-amber-400 uppercase tracking-wide flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          {topObj.topic || `Section ${tIdx + 1}`}
                        </h5>

                        <div className="space-y-3 pl-2">
                          {(topObj.subtopics || []).map((subObj, sIdx) => (
                            <div key={sIdx} className="space-y-2">
                              <h6 className="text-xs font-bold text-slate-300">{subObj.title}</h6>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {(subObj.points || []).map((point, pIdx) => {
                                  const key = `${tIdx}_${sIdx}_${pIdx}`;
                                  const isRecalled = Boolean(recalledPointsMap[key]);
                                  return (
                                    <div
                                      key={pIdx}
                                      onClick={() => handleToggleRecallNode(key)}
                                      className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 transition-all cursor-pointer ${
                                        isRecalled
                                          ? isDark
                                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                                            : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                          : isDark
                                            ? 'bg-slate-800/40 border-slate-700/40 text-slate-300 hover:border-slate-600'
                                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isRecalled}
                                        onChange={() => {}}
                                        className="mt-0.5 rounded text-emerald-500 cursor-pointer"
                                      />
                                      <span className={isRecalled ? 'line-through opacity-80' : ''}>{point}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className={`p-12 rounded-3xl border text-center space-y-4 my-auto ${
                isDark ? 'neu-pressed-dark border-slate-700/60' : 'neu-pressed-light border-slate-200'
              }`}>
                <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto text-2xl">
                  💡
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-black">No AI Hints Generated Yet</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Generate an instant active-recall mindmap from your textbook PDF to test your retention.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateHints}
                  disabled={isGeneratingHints}
                  className="px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-xl hover:brightness-110 active:scale-95 transition-all inline-flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className={`w-4 h-4 ${isGeneratingHints ? 'animate-spin' : ''}`} />
                  <span>{isGeneratingHints ? 'Generating...' : 'Generate AI Recall Hints'}</span>
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 2: TEXTBOOK PDF READER */}
        {activeTab === 'pdf' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-4 max-w-5xl mx-auto"
          >
            {/* PDF Controls Header */}
            <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
              isDark ? 'neu-pressed-dark border-slate-700/60' : 'neu-pressed-light border-slate-200'
            }`}>
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-blue-400" />
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wider">
                    Attached Textbook Pages ({pageLabel})
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Front matter offset: +{pdfOffset} pages • High-resolution offline slice
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setZoomScale(prev => Math.max(0.7, prev - 0.15))}
                  title="Zoom Out"
                  className={`p-2 rounded-xl border transition-all ${
                    isDark ? 'neu-btn-dark text-slate-300 hover:text-white border-slate-700' : 'neu-btn-light text-slate-700 border-slate-300'
                  }`}
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono font-bold px-2">{Math.round(zoomScale * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoomScale(prev => Math.min(2.0, prev + 0.15))}
                  title="Zoom In"
                  className={`p-2 rounded-xl border transition-all ${
                    isDark ? 'neu-btn-dark text-slate-300 hover:text-white border-slate-700' : 'neu-btn-light text-slate-700 border-slate-300'
                  }`}
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={loadPdfSlice}
                  title="Reload Slice"
                  className={`p-2 rounded-xl border transition-all ${
                    isDark ? 'neu-btn-dark text-slate-300 hover:text-white border-slate-700' : 'neu-btn-light text-slate-700 border-slate-300'
                  }`}
                >
                  <RotateCcw className={`w-4 h-4 ${isLoadingPdf ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Error Display */}
            {pdfError && (
              <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{pdfError}</span>
              </div>
            )}

            {/* PDF Rendering Area */}
            {isLoadingPdf ? (
              <div className="p-16 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold text-slate-400">Extracting and rendering textbook slice...</p>
              </div>
            ) : pdfSlice && Array.isArray(pdfSlice.pageImages) && pdfSlice.pageImages.length > 0 ? (
              <div className="space-y-6 flex flex-col items-center">
                {pdfSlice.pageImages.map((page, idx) => (
                  <div
                    key={page.pageNumber || idx}
                    className={`p-3 rounded-2xl border shadow-xl space-y-2 max-w-full ${
                      isDark ? 'bg-slate-900 border-slate-700/80' : 'bg-white border-slate-200'
                    }`}
                    style={{ transform: `scale(${zoomScale})`, transformOrigin: 'top center' }}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-2">
                      <span>Page {page.pageNumber}</span>
                      <span>Textbook Slice</span>
                    </div>
                    <img
                      src={`data:image/jpeg;base64,${page.base64}`}
                      alt={`Textbook Page ${page.pageNumber}`}
                      className="rounded-xl max-w-full h-auto shadow-sm"
                    />
                  </div>
                ))}
              </div>
            ) : pdfSlice?.extractedText ? (
              <div className={`p-6 rounded-2xl border whitespace-pre-wrap font-mono text-xs leading-relaxed ${
                isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
              }`}>
                {pdfSlice.extractedText}
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-slate-400">
                No textbook pages rendered. Click reload to try again.
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 3: TOPIC NOTES & MNEMONICS */}
        {activeTab === 'notes' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-4 max-w-4xl mx-auto"
          >
            <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
              isDark ? 'neu-pressed-dark border-slate-700/60' : 'neu-pressed-light border-slate-200'
            }`}>
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-amber-400" />
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wider">Topic Notes & Mnemonics</h4>
                  <p className="text-[11px] text-slate-400">Auto-saved to local database & cloud sync</p>
                </div>
              </div>

              {isSavingNotes && (
                <span className="text-[11px] font-bold text-amber-400 animate-pulse flex items-center gap-1">
                  <Save className="w-3.5 h-3.5" /> Saving...
                </span>
              )}
            </div>

            <textarea
              value={topicNotes}
              onChange={(e) => handleSaveNotes(e.target.value)}
              placeholder="Type your high-yield notes, key formulas, clinical correlations, and mnemonics here..."
              rows={16}
              className={`w-full p-5 rounded-2xl text-sm leading-relaxed border outline-none font-medium transition-all ${
                isDark
                  ? 'bg-slate-900/70 border-slate-700 text-white placeholder-slate-500 focus:border-amber-400'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-amber-500'
              }`}
            />
          </motion.div>
        )}
      </div>

      {/* 3. BOTTOM RATING & COMPLETION ACTION BAR */}
      <div className={`p-4 sm:p-5 border-t shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 ${
        isDark ? 'border-slate-700/80 bg-slate-900/80 backdrop-blur-md' : 'border-slate-200/80 bg-white/90 backdrop-blur-md'
      }`}>
        <div className="text-xs font-semibold text-slate-400 hidden lg:flex items-center gap-2">
          <span>Keyboard shortcuts: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-white">1</kbd> Again • <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-white">2</kbd> Hard • <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-white">3</kbd> Good • <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-white">4</kbd> Easy</span>
        </div>

        {/* 4 Rating Buttons */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3 w-full lg:w-auto">
          {/* Again (1) */}
          <button
            type="button"
            onClick={() => handlePerformRating(1)}
            title={`Again: Grade 1 (Next review in ${intervalPreviews[1]})${suggestedRating === 1 ? ' • Recommended' : ''}`}
            className={`py-2.5 px-3 sm:px-5 rounded-2xl text-xs font-black transition-all cursor-pointer flex flex-col items-center justify-center relative active:scale-95 shadow-md ${
              suggestedRating === 1
                ? 'bg-rose-500 text-white ring-2 ring-offset-2 ring-rose-500 scale-105'
                : isDark
                  ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30'
                  : 'bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-300'
            }`}
          >
            {suggestedRating === 1 && (
              <span className="absolute -top-2.5 px-2 py-0.2 rounded-full text-[8px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-md animate-pulse">
                Rec
              </span>
            )}
            <span>Again (1)</span>
            <span className="text-[10px] opacity-80 font-mono font-bold mt-0.5">{intervalPreviews[1]}</span>
          </button>

          {/* Hard (2) */}
          <button
            type="button"
            onClick={() => handlePerformRating(2)}
            title={`Hard: Grade 2 (Next review in ${intervalPreviews[2]})${suggestedRating === 2 ? ' • Recommended' : ''}`}
            className={`py-2.5 px-3 sm:px-5 rounded-2xl text-xs font-black transition-all cursor-pointer flex flex-col items-center justify-center relative active:scale-95 shadow-md ${
              suggestedRating === 2
                ? 'bg-amber-500 text-slate-950 ring-2 ring-offset-2 ring-amber-500 scale-105'
                : isDark
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30'
                  : 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300'
            }`}
          >
            {suggestedRating === 2 && (
              <span className="absolute -top-2.5 px-2 py-0.2 rounded-full text-[8px] font-black uppercase tracking-wider bg-amber-500 text-slate-950 shadow-md animate-pulse">
                Rec
              </span>
            )}
            <span>Hard (2)</span>
            <span className="text-[10px] opacity-80 font-mono font-bold mt-0.5">{intervalPreviews[2]}</span>
          </button>

          {/* Good (3) */}
          <button
            type="button"
            onClick={() => handlePerformRating(3)}
            title={`Good: Grade 3 (Next review in ${intervalPreviews[3]})${suggestedRating === 3 ? ' • Recommended' : ''}`}
            className={`py-2.5 px-3 sm:px-5 rounded-2xl text-xs font-black transition-all cursor-pointer flex flex-col items-center justify-center relative active:scale-95 shadow-md ${
              suggestedRating === 3
                ? 'bg-indigo-600 text-white ring-2 ring-offset-2 ring-indigo-500 scale-105'
                : isDark
                  ? 'bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/30'
                  : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border border-indigo-300'
            }`}
          >
            {suggestedRating === 3 && (
              <span className="absolute -top-2.5 px-2 py-0.2 rounded-full text-[8px] font-black uppercase tracking-wider bg-indigo-600 text-white shadow-md animate-pulse">
                Rec
              </span>
            )}
            <span>Good (3)</span>
            <span className="text-[10px] opacity-80 font-mono font-bold mt-0.5">{intervalPreviews[3]}</span>
          </button>

          {/* Easy (4) */}
          <button
            type="button"
            onClick={() => handlePerformRating(4)}
            title={`Easy: Grade 4 (Next review in ${intervalPreviews[4]})${suggestedRating === 4 ? ' • Recommended' : ''}`}
            className={`py-2.5 px-3 sm:px-5 rounded-2xl text-xs font-black transition-all cursor-pointer flex flex-col items-center justify-center relative active:scale-95 shadow-md ${
              suggestedRating === 4
                ? 'bg-emerald-600 text-white ring-2 ring-offset-2 ring-emerald-500 scale-105'
                : isDark
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30'
                  : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300'
            }`}
          >
            {suggestedRating === 4 && (
              <span className="absolute -top-2.5 px-2 py-0.2 rounded-full text-[8px] font-black uppercase tracking-wider bg-emerald-600 text-white shadow-md animate-pulse">
                Rec
              </span>
            )}
            <span>Easy (4)</span>
            <span className="text-[10px] opacity-80 font-mono font-bold mt-0.5">{intervalPreviews[4]}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// Sub-component: Tree Node Item for Study Workspace
function StudyWorkspaceTreeNode({
  node,
  depth = 0,
  recalledMap = {},
  onToggleRecall,
  expandedMap = {},
  onToggleExpand,
  isDark = true
}) {
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const nodeId = node.id || node.title;
  const isRecalled = Boolean(recalledMap[nodeId]);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isExpanded = expandedMap[nodeId] !== undefined ? expandedMap[nodeId] : true;

  return (
    <div className={`space-y-1.5 transition-all ${depth > 0 ? 'ml-3 sm:ml-5 pl-2 border-l-2 border-slate-700/50' : ''}`}>
      <div
        className={`p-3 rounded-xl border flex items-start gap-3 transition-all cursor-pointer ${
          isRecalled
            ? isDark
              ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-200'
              : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : isDark
              ? 'bg-slate-800/40 border-slate-700/50 text-slate-200 hover:border-slate-600'
              : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
        }`}
        onClick={() => onToggleRecall(nodeId)}
      >
        <input
          type="checkbox"
          checked={isRecalled}
          onChange={() => {}}
          className="mt-1 rounded text-emerald-500 cursor-pointer shrink-0"
        />

        <div className="flex-1 space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-xs sm:text-sm">{node.title}</span>
            {hasChildren && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(nodeId);
                }}
                className="text-[10px] text-slate-400 hover:text-white underline font-mono cursor-pointer"
              >
                {isExpanded ? 'Collapse' : `Expand (${node.children.length})`}
              </button>
            )}
          </div>

          {node.prompt && (
            <p className={`text-xs italic ${isRecalled ? 'line-through opacity-70' : 'text-slate-400'}`}>
              💡 {node.prompt}
            </p>
          )}

          {node.answer && (
            <div className="pt-1" onClick={(e) => e.stopPropagation()}>
              {!isAnswerRevealed ? (
                <button
                  type="button"
                  onClick={() => setIsAnswerRevealed(true)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                    isDark ? 'bg-slate-800 text-slate-300 hover:text-emerald-400 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  <Eye className="w-3 h-3 text-emerald-400" />
                  <span>Tap to Reveal Answer</span>
                </button>
              ) : (
                <div
                  onClick={() => setIsAnswerRevealed(false)}
                  className={`p-2.5 rounded-xl border text-xs leading-relaxed cursor-pointer ${
                    isDark ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200' : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  }`}
                >
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block mb-1">
                    ✓ Verified Answer (Click to hide):
                  </span>
                  <div>{node.answer}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="space-y-1.5">
          {node.children.map((child, cIdx) => (
            <StudyWorkspaceTreeNode
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

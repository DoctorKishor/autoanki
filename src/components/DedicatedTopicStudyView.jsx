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
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Save,
  Zap,
  HelpCircle,
  CheckSquare,
  Square,
  Activity
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

  // Strict mutual exclusion for Overdue vs New badges
  const isActualNew = Boolean(topic?.isNew || isNew || (!topic?.lastReviewDate && (topic?.reviewCount || 0) === 0));
  const isActualOverdue = !isActualNew && Boolean(topic?.isOverdue || isOverdue);
  const isReviewed = !isActualNew && (topic.reviewCount || 0) > 0 && Boolean(topic.lastReviewDate);

  // Stability & Difficulty human interpretations with Dynamic Remaining Memory
  const stabilityInterpretation = useMemo(() => {
    if (!isReviewed || topic.stability == null) {
      return {
        label: 'New Memory',
        detail: 'First review will calibrate memory retention duration',
        badge: 'New',
        colorClass: isDark ? 'text-slate-400' : 'text-slate-600'
      };
    }

    const stabilityDays = topic.stability;
    const formattedTotalDays = stabilityDays < 1 ? `${Math.round(stabilityDays * 24)}h` : stabilityDays < 10 ? `${stabilityDays.toFixed(1)}d` : `${Math.round(stabilityDays)}d`;

    // Calculate elapsed days since last review date
    let elapsedDays = 0;
    if (topic.lastReviewDate) {
      const lastRev = new Date(topic.lastReviewDate);
      const now = new Date();
      const diffMs = now.getTime() - lastRev.getTime();
      elapsedDays = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
    }

    const remainingDays = stabilityDays - elapsedDays;
    let label = '';
    let detail = '';
    let colorClass = 'text-sky-400';

    if (remainingDays <= 0) {
      // Overdue / Memory decayed below 90% threshold
      const overdueBy = Math.abs(remainingDays);
      const formattedOverdue = overdueBy < 1 ? `${Math.max(1, Math.round(overdueBy * 24))}h` : overdueBy < 10 ? `${overdueBy.toFixed(1)}d` : `${Math.round(overdueBy)}d`;
      label = `Overdue by ~${formattedOverdue} (Decayed • S: ${formattedTotalDays})`;
      detail = `Memory retention dropped below 90% target ~${formattedOverdue} ago. Last reviewed ${Math.round(elapsedDays)}d ago (Total Stability: ${formattedTotalDays}).`;
      colorClass = 'text-rose-400 font-bold';
    } else if (remainingDays < 1) {
      const remainingHours = Math.max(1, Math.round(remainingDays * 24));
      label = `~${remainingHours}h remaining in memory (S: ${formattedTotalDays})`;
      detail = `~${remainingHours} hours remaining before memory recall drops below 90%. Total memory span: ${formattedTotalDays}.`;
      colorClass = 'text-amber-400 font-bold';
    } else {
      const formattedRemaining = remainingDays < 10 ? `${remainingDays.toFixed(1)}d` : `${Math.round(remainingDays)}d`;
      label = `~${formattedRemaining} remaining in memory (S: ${formattedTotalDays})`;
      detail = `Stays fresh for ~${formattedRemaining} more before review is due. Total memory span: ${formattedTotalDays} (Reviewed ${Math.round(elapsedDays)}d ago).`;
      colorClass = 'text-sky-400 font-bold';
    }

    return {
      label,
      detail,
      badge: formattedTotalDays,
      remainingDays,
      elapsedDays,
      colorClass
    };
  }, [topic.stability, topic.lastReviewDate, isReviewed, isDark]);

  const difficultyInterpretation = useMemo(() => {
    if (!isReviewed || topic.difficulty == null) {
      return {
        label: 'Unstudied',
        detail: 'Difficulty will be computed on review',
        badge: 'Unstudied',
        level: 'Unrated',
        colorClass: 'text-slate-400'
      };
    }
    const d = topic.difficulty;
    let level = 'Moderate';
    let colorClass = 'text-amber-500';
    if (d < 3.5) {
      level = 'Easy';
      colorClass = 'text-emerald-500';
    } else if (d < 6.5) {
      level = 'Moderate';
      colorClass = 'text-amber-500';
    } else if (d < 8.5) {
      level = 'Hard';
      colorClass = 'text-orange-500';
    } else {
      level = 'Very Hard';
      colorClass = 'text-rose-500';
    }
    return {
      label: `${d.toFixed(1)}/10 (${level})`,
      detail: `${level} concept difficulty (${d.toFixed(1)} / 10)`,
      badge: `${d.toFixed(1)}`,
      level,
      colorClass
    };
  }, [topic.difficulty, isReviewed]);

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
      [nodeId]: prev[nodeId] === undefined ? false : !prev[nodeId]
    }));
  };

  // Collect all node IDs from tree
  const allNodeIds = useMemo(() => {
    if (!topicHints?.tree || !Array.isArray(topicHints.tree)) return [];
    const ids = [];
    function recurse(nodes) {
      if (!Array.isArray(nodes)) return;
      nodes.forEach(n => {
        const nid = n.id || n.title;
        if (nid) ids.push(nid);
        if (Array.isArray(n.children) && n.children.length > 0) {
          recurse(n.children);
        }
      });
    }
    recurse(topicHints.tree);
    return ids;
  }, [topicHints]);

  // Check if all nodes are currently expanded
  const areAllNodesExpanded = useMemo(() => {
    if (allNodeIds.length === 0) return true;
    return allNodeIds.every(id => expandedNodesMap[id] !== false);
  }, [allNodeIds, expandedNodesMap]);

  // Toggle Collapse All / Expand All
  const handleToggleExpandAll = () => {
    if (allNodeIds.length === 0) return;
    const nextState = !areAllNodesExpanded;
    const nextMap = {};
    allNodeIds.forEach(id => {
      nextMap[id] = nextState;
    });
    setExpandedNodesMap(nextMap);
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
          const ptKey = `${tIdx}_${sIdx}_${pIdx}`;
          if (recalledPointsMap[ptKey]) recalledCount++;
        });
      });
    });

    const percent = totalPoints > 0 ? Math.round((recalledCount / totalPoints) * 100) : 0;
    return { totalTopics, totalSubtopics, totalPoints, recalledCount, percent };
  }, [topicHints, recalledPointsMap]);

  // Overall Recall Percentage
  const recallPercent = useMemo(() => {
    if (treeMetrics && treeMetrics.totalNodes > 0) return treeMetrics.percent;
    if (blueprintMetrics && blueprintMetrics.totalPoints > 0) return blueprintMetrics.percent;
    return null;
  }, [treeMetrics, blueprintMetrics]);

  // Suggested FSRS Rating based on active recall score
  const suggestedRating = useMemo(() => {
    if (recallPercent === null) return null;
    if (recallPercent >= 85) return 4; // Easy (4)
    if (recallPercent >= 60) return 3; // Good (3)
    if (recallPercent >= 30) return 2; // Hard (2)
    return 1; // Again (1)
  }, [recallPercent]);

  // Continuous Smooth Liquid Color Interpolation & Theme
  const liquidTheme = useMemo(() => {
    const p = Math.max(0, Math.min(100, recallPercent ?? 0));

    // Continuous RGB Color stops: [percentage, [R, G, B]]
    // 0%: Rose Red (#f43f5e), 33%: Warm Amber (#f59e0b), 66%: Indigo (#6366f1), 100%: Emerald Green (#10b981)
    const stops = [
      [0, [244, 63, 94]],     // Rose Red
      [33, [245, 158, 11]],   // Warm Amber
      [66, [99, 102, 241]],   // Indigo / Sky
      [100, [16, 185, 129]]   // Emerald Green
    ];

    let lower = stops[0];
    let upper = stops[stops.length - 1];

    for (let i = 0; i < stops.length - 1; i++) {
      if (p >= stops[i][0] && p <= stops[i + 1][0]) {
        lower = stops[i];
        upper = stops[i + 1];
        break;
      }
    }

    const range = upper[0] - lower[0];
    const factor = range === 0 ? 0 : (p - lower[0]) / range;

    const r = Math.round(lower[1][0] + (upper[1][0] - lower[1][0]) * factor);
    const g = Math.round(lower[1][1] + (upper[1][1] - lower[1][1]) * factor);
    const b = Math.round(lower[1][2] + (upper[1][2] - lower[1][2]) * factor);

    const baseRgb = `${r}, ${g}, ${b}`;
    const opacityStart = isDark ? 0.20 : 0.28;
    const opacityEnd = isDark ? 0.42 : 0.55;

    return {
      rgb: baseRgb,
      solidHex: `rgb(${baseRgb})`,
      bgGradient: `linear-gradient(90deg, rgba(${baseRgb}, ${opacityStart}) 0%, rgba(${baseRgb}, ${opacityEnd}) 100%)`,
      badgeBg: `rgb(${baseRgb})`,
      glowShadow: `0 0 16px rgba(${baseRgb}, 0.35)`
    };
  }, [recallPercent, isDark]);

  // Generate / Regenerate Hints
  const handleGenerateHints = async () => {
    setIsGeneratingHints(true);
    setHintError(null);
    try {
      const topicId = topic.id || `${topic.subject}_${topic.name}`;
      const result = await generateTopicActiveRecallHints(
        topic,
        geminiApiKey,
        aiFeatureModels.hintEngine || 'gemini-2.5-flash',
        subjectPageOffset
      );
      if (result) {
        await saveTopicHintsLocal(topicId, result);
        setTopicHints(result);
        setRecalledPointsMap({});
        setExpandedNodesMap({});
        setRevealedHintCount(1);
        triggerDebouncedSmartPush();
      }
    } catch (err) {
      console.error('Failed generating hints:', err);
      setHintError(err.message || 'Failed generating AI hints');
    } finally {
      setIsGeneratingHints(false);
    }
  };

  // Delete Hints with non-destructive undo
  const handleDeleteHints = async () => {
    if (!window.confirm(`Delete active recall hints and mindmap for "${topic.name}"?`)) return;
    const topicId = topic.id || `${topic.subject}_${topic.name}`;
    const backup = topicHints ? JSON.parse(JSON.stringify(topicHints)) : null;

    try {
      await deleteTopicHintsLocal(topicId);
      setTopicHints(null);
      setRecalledPointsMap({});
      setExpandedNodesMap({});

      if (typeof onPushUndoAction === 'function' && backup) {
        onPushUndoAction({
          description: `Deleted hints for topic "${topic.name}"`,
          undo: async () => {
            await saveTopicHintsLocal(topicId, backup);
            setTopicHints(backup);
          },
          redo: async () => {
            await deleteTopicHintsLocal(topicId);
            setTopicHints(null);
          }
        });
      }
      triggerDebouncedSmartPush();
    } catch (err) {
      console.error('Failed deleting hints:', err);
      setHintError(err.message || 'Failed deleting hints');
    }
  };

  // --- PDF PREVIEW & OFFSET STATE ---
  const [pdfSlice, setPdfSlice] = useState(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [subjectPageOffset, setSubjectPageOffset] = useState(0);
  const [isPreSplitTopic, setIsPreSplitTopic] = useState(false);
  const [pdfZoom, setPdfZoom] = useState(1.0);
  const [isSavingOffset, setIsSavingOffset] = useState(false);
  const [offsetInputValue, setOffsetInputValue] = useState('0');

  // Load subject page offset and pre-split metadata
  useEffect(() => {
    let isMounted = true;
    async function loadOffset() {
      if (!topic?.subject) return;
      try {
        const subjectDoc = (subjectTrackerData || []).find(s => s.subject === topic.subject);
        let offsetVal = 0;
        if (subjectDoc?.pdfSettings?.pageOffset !== undefined) {
          offsetVal = subjectDoc.pdfSettings.pageOffset;
        } else {
          const meta = await getLocalTextbooksMetadata();
          const subMeta = meta?.[topic.subject];
          if (subMeta?.pageOffset !== undefined) {
            offsetVal = subMeta.pageOffset;
          }
        }
        if (isMounted) {
          setSubjectPageOffset(offsetVal);
          setOffsetInputValue(String(offsetVal));
        }

        const pytTopicDoc = await getLocalPytTopic(topic.subject, topic.name);
        if (pytTopicDoc?.pdfPath && isMounted) {
          setIsPreSplitTopic(true);
        }
      } catch (err) {
        console.warn('Failed loading subject page offset:', err);
      }
    }
    loadOffset();
    return () => { isMounted = false; };
  }, [topic?.subject, topic?.name, subjectTrackerData]);

  // Load PDF slice when switching to PDF tab
  useEffect(() => {
    let isMounted = true;
    if (activeTab === 'pdf' && !pdfSlice && !isLoadingPdf) {
      setIsLoadingPdf(true);
      extractTopicPdfSlice(topic, subjectPageOffset)
        .then(res => {
          if (isMounted) {
            setPdfSlice(res);
            setIsLoadingPdf(false);
          }
        })
        .catch(err => {
          console.error('Failed extracting PDF slice:', err);
          if (isMounted) setIsLoadingPdf(false);
        });
    }
    return () => { isMounted = false; };
  }, [activeTab, topic, subjectPageOffset]);

  // Save Page Offset
  const handleSavePageOffset = async (newOffset) => {
    try {
      setIsSavingOffset(true);
      const nowIso = new Date().toISOString();
      setSubjectPageOffset(newOffset);
      setOffsetInputValue(String(newOffset));

      const subjectDoc = (subjectTrackerData || []).find(s => s.subject === topic.subject);
      if (subjectDoc && typeof onUpdateSubjectDoc === 'function') {
        const updatedDoc = {
          ...subjectDoc,
          pdfSettings: {
            ...(subjectDoc.pdfSettings || {}),
            pageOffset: newOffset
          },
          updatedAt: nowIso
        };
        await onUpdateSubjectDoc(subjectDoc.id, updatedDoc);
      } else if (subjectDoc) {
        await saveLocalSubjectTrackerDoc({
          ...subjectDoc,
          pdfSettings: {
            ...(subjectDoc.pdfSettings || {}),
            pageOffset: newOffset
          },
          updatedAt: nowIso
        });
      }

      const meta = (await getLocalTextbooksMetadata()) || {};
      meta[topic.subject] = {
        ...(meta[topic.subject] || {}),
        pageOffset: newOffset,
        updatedAt: nowIso
      };
      await saveLocalTextbooksMetadata(meta);
      triggerDebouncedSmartPush();

      // Refresh PDF slice with new offset
      setIsLoadingPdf(true);
      const newSlice = await extractTopicPdfSlice(topic, newOffset);
      setPdfSlice(newSlice);
    } catch (err) {
      console.error('Failed saving offset:', err);
    } finally {
      setIsLoadingPdf(false);
      setIsSavingOffset(false);
    }
  };

  // --- TOPIC NOTES & MNEMONICS ---
  const [topicNotes, setTopicNotes] = useState(topic.notes || topic.mnemonicNote || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const saveTimeoutRef = useRef(null);

  const handleSaveNotes = (newContent) => {
    setTopicNotes(newContent);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      setIsSavingNotes(true);
      try {
        const subjectDoc = (subjectTrackerData || []).find(s => s.subject === topic.subject);
        if (subjectDoc) {
          const nowIso = new Date().toISOString();
          const updatedTopics = (subjectDoc.topics || []).map(t => {
            if ((t.id && t.id === topic.id) || (t.name === topic.name)) {
              return { ...t, notes: newContent, mnemonicNote: newContent, updatedAt: nowIso };
            }
            return t;
          });

          if (typeof onUpdateSubjectDoc === 'function') {
            await onUpdateSubjectDoc(subjectDoc.id, {
              ...subjectDoc,
              topics: updatedTopics,
              updatedAt: nowIso
            });
          } else {
            await saveLocalSubjectTrackerDoc({
              ...subjectDoc,
              topics: updatedTopics,
              updatedAt: nowIso
            });
          }
          triggerDebouncedSmartPush();
        }
      } catch (err) {
        console.error('Failed auto-saving notes:', err);
      } finally {
        setIsSavingNotes(false);
      }
    }, 800);
  };

  // Keyboard shortcut listener (Esc to exit, 1-4 for ratings)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger rating shortcuts while typing in notes textarea
      if (['TEXTAREA', 'INPUT'].includes(e.target.tagName)) {
        if (e.key === 'Escape') {
          e.target.blur();
        }
        return;
      }

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '1') {
        handlePerformRating(1);
      } else if (e.key === '2') {
        handlePerformRating(2);
      } else if (e.key === '3') {
        handlePerformRating(3);
      } else if (e.key === '4') {
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
        isDark ? 'border-slate-700/60 bg-slate-900/40' : 'border-slate-300/80 bg-[#e6ecf5]'
      }`}>
        {/* Left: Back Button & Topic Info */}
        <div className="flex items-start sm:items-center gap-3 w-full md:w-auto">
          <button
            type="button"
            onClick={onClose}
            title="Back to Review Queue (Esc)"
            className={`p-2.5 rounded-2xl border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 ${
              isDark ? 'neu-btn-dark text-slate-300 hover:text-white border-slate-700' : 'neu-btn-light text-slate-700 hover:text-slate-950 border-slate-300'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-bold hidden sm:inline">Back</span>
          </button>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-lg border ${
                isDark ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' : 'bg-indigo-500/15 text-indigo-700 border-indigo-300'
              }`}>
                {topic.subject || 'General'}
              </span>
              {isActualOverdue && (
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-500 border border-rose-500/40 animate-pulse">
                  Overdue
                </span>
              )}
              {isActualNew && (
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-600 border border-emerald-500/40">
                  New Topic
                </span>
              )}
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1.5 ${
                isDark ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-amber-500/15 text-amber-900 border-amber-300'
              }`}>
                <span>⚡</span>
                <span>~{topicPrediction.predictedMinutes} min study time{topicPrediction.tierLabel ? ` • ${topicPrediction.tierLabel}` : ''}</span>
              </span>
            </div>

            <h2 className="text-lg sm:text-xl font-black tracking-tight truncate max-w-xl">
              {topic.name}
            </h2>

            <div className={`text-xs font-medium flex items-center gap-2.5 flex-wrap ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              <span className="font-mono font-bold text-indigo-500">
                {pageLabel} • {effectivePageCount} {effectivePageCount === 1 ? 'page' : 'pages'}
              </span>
              <span>•</span>
              <span
                className="inline-flex items-center gap-1 font-medium cursor-help"
                title={stabilityInterpretation.detail}
              >
                <span className="opacity-70">Memory:</span>
                <strong className={isReviewed && topic.stability != null ? stabilityInterpretation.colorClass : (isDark ? 'text-slate-400' : 'text-slate-600')}>
                  {stabilityInterpretation.label}
                </strong>
              </span>
              <span>•</span>
              <span
                className="inline-flex items-center gap-1 font-medium cursor-help"
                title={difficultyInterpretation.detail}
              >
                <span className="opacity-70">Difficulty:</span>
                <strong className={isReviewed && topic.difficulty != null ? `${difficultyInterpretation.colorClass} font-bold` : (isDark ? 'text-slate-400' : 'text-slate-600')}>
                  {difficultyInterpretation.label}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right: Subtab Sliding Pill Navigation */}
        <div className={`relative grid grid-cols-3 p-1 rounded-2xl border shrink-0 w-full sm:w-[390px] overflow-hidden ${
          isDark ? 'neu-pressed-dark border-slate-700/60' : 'neu-pressed-light border-slate-300/80 bg-[#e6ecf5]'
        }`}>
          {/* Sliding Pill Indicator */}
          <div
            className={`absolute top-1 bottom-1 rounded-xl shadow-md ${
              isDark ? 'neu-btn-accent-dark' : 'neu-btn-accent-light'
            }`}
            style={{
              left: `calc(0.25rem + ${['hints', 'pdf', 'notes'].indexOf(activeTab)} * ((100% - 0.5rem) / 3))`,
              width: `calc((100% - 0.5rem) / 3)`,
              transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
            }}
          />

          <button
            type="button"
            onClick={() => setActiveTab('hints')}
            className={`relative z-10 px-2 py-2 text-[11px] font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center gap-1.5 transition-colors duration-300 truncate ${
              activeTab === 'hints' ? 'text-white' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="AI Hints & Mindmap"
          >
            <Lightbulb className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">AI Hints</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pdf')}
            className={`relative z-10 px-2 py-2 text-[11px] font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center gap-1.5 transition-colors duration-300 truncate ${
              activeTab === 'pdf' ? 'text-white' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Textbook PDF"
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Textbook PDF</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`relative z-10 px-2 py-2 text-[11px] font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center gap-1.5 transition-colors duration-300 truncate ${
              activeTab === 'notes' ? 'text-white' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Topic Notes"
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Notes</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN ACTIVE TAB WORKSPACE */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto custom-scrollbar">
        {/* TAB 1: AI HINTS & RECURSIVE MINDMAP */}
        {activeTab === 'hints' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto space-y-6"
          >
            {/* Header / Intro Card */}
            <div className={`p-5 rounded-2xl border shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
              isDark ? 'neu-card-dark border-slate-700/60 bg-slate-900/50' : 'neu-card-light border-slate-300/80 bg-[#e6ecf5]'
            }`}>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <h4 className="text-sm font-black uppercase tracking-wide">
                    Recursive Mindmap & Active-Recall Testing
                  </h4>
                </div>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Check off the concepts you successfully recalled from memory to calculate your active recall score.
                </p>
              </div>

              <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0 flex-wrap">
                {topicHints ? (
                  <>
                    {/* Expand All / Collapse All Toggle Button */}
                    {allNodeIds.length > 0 && (
                      <button
                        type="button"
                        onClick={handleToggleExpandAll}
                        title={areAllNodesExpanded ? 'Collapse All Concept Nodes' : 'Expand All Concept Nodes'}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 ${
                          isDark
                            ? 'neu-btn-dark text-slate-300 hover:text-white border-slate-700'
                            : 'neu-btn-light text-slate-700 hover:text-slate-950 border-slate-300'
                        }`}
                      >
                        {areAllNodesExpanded ? (
                          <>
                            <ChevronsUp className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Collapse All</span>
                          </>
                        ) : (
                          <>
                            <ChevronsDown className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Expand All</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleGenerateHints}
                      disabled={isGeneratingHints}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 ${
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
                      className="p-1.5 rounded-xl text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-all cursor-pointer shadow-sm active:scale-95"
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
              <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                <div className="space-y-1">
                  <p className="font-bold">Hint Generation Notice</p>
                  <p className="opacity-90">{hintError}</p>
                </div>
              </div>
            )}

            {/* Score & Recommendation Banner with Fluid Liquid Progress Fill & Wavy Water Edge */}
            {topicHints && recallPercent !== null && (
              <div
                className={`relative overflow-hidden rounded-2xl border shadow-md transition-all ${
                  isDark
                    ? 'bg-slate-900/60 border-slate-700/60 neu-card-dark'
                    : 'bg-[#e6ecf5] border-slate-300 neu-card-light'
                }`}
              >
                {/* 1. Fluid Liquid Background Layer with Continuous Interpolation & Organic Wave Leading Edge */}
                <motion.div
                  className="absolute inset-y-0 left-0 pointer-events-none rounded-2xl overflow-visible"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(2, Math.min(100, recallPercent))}%` }}
                  transition={{ type: 'spring', stiffness: 55, damping: 14, mass: 0.8 }}
                  style={{
                    background: liquidTheme.bgGradient,
                    boxShadow: `inset 0 0 12px rgba(${liquidTheme.rgb}, 0.2)`
                  }}
                >
                  {/* Fluid Surface Ripple / Flow Wave */}
                  <motion.div
                    className="absolute inset-0 opacity-40 pointer-events-none"
                    style={{
                      backgroundImage: `radial-gradient(ellipse at 70% 50%, rgba(255, 255, 255, 0.35) 0%, transparent 65%)`
                    }}
                    animate={{
                      x: ['-15%', '15%', '-15%'],
                      opacity: [0.25, 0.5, 0.25]
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 3,
                      ease: 'easeInOut'
                    }}
                  />

                  {/* Animated Organic Wavy / Water Edge at the Progressing Right End */}
                  {recallPercent > 0 && recallPercent < 100 && (
                    <div className="absolute -right-3 top-0 bottom-0 w-6 h-full overflow-visible pointer-events-none">
                      <svg
                        className="w-full h-full overflow-visible"
                        viewBox="0 0 24 100"
                        preserveAspectRatio="none"
                      >
                        <motion.path
                          d="M 0,0 Q 18,25 0,50 Q 18,75 0,100 L 0,100 L 0,0 Z"
                          fill={`rgb(${liquidTheme.rgb})`}
                          fillOpacity={isDark ? 0.45 : 0.6}
                          animate={{
                            d: [
                              "M 0,0 Q 18,25 0,50 Q 18,75 0,100 L 0,100 L 0,0 Z",
                              "M 0,0 Q -6,25 10,50 Q -6,75 0,100 L 0,100 L 0,0 Z",
                              "M 0,0 Q 18,25 0,50 Q 18,75 0,100 L 0,100 L 0,0 Z"
                            ]
                          }}
                          transition={{
                            repeat: Infinity,
                            duration: 2.2,
                            ease: "easeInOut"
                          }}
                        />
                        <motion.path
                          d="M 0,0 Q 8,20 2,50 Q 8,80 0,100 L 0,100 L 0,0 Z"
                          fill={`rgb(${liquidTheme.rgb})`}
                          fillOpacity={isDark ? 0.25 : 0.4}
                          animate={{
                            d: [
                              "M 0,0 Q -4,20 12,50 Q -4,80 0,100 L 0,100 L 0,0 Z",
                              "M 0,0 Q 14,30 2,50 Q 14,70 0,100 L 0,100 L 0,0 Z",
                              "M 0,0 Q -4,20 12,50 Q -4,80 0,100 L 0,100 L 0,0 Z"
                            ]
                          }}
                          transition={{
                            repeat: Infinity,
                            duration: 1.7,
                            ease: "easeInOut"
                          }}
                        />
                      </svg>
                    </div>
                  )}
                </motion.div>

                {/* 2. Foreground Content Layer */}
                <div className="relative z-10 p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Battery Percentage / Score Pill with Continuous Morphing Color */}
                    <div
                      className="text-xl font-black font-mono px-3.5 py-1.5 rounded-xl shadow-xs shrink-0 flex items-center gap-1.5 transition-colors duration-500 text-white"
                      style={{
                        backgroundColor: liquidTheme.badgeBg,
                        boxShadow: liquidTheme.glowShadow
                      }}
                    >
                      <Activity className="w-4 h-4 shrink-0" />
                      <span>{recallPercent}%</span>
                    </div>

                    <div className="min-w-0">
                      <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Active Recall Mastery
                      </p>
                      <p
                        className="text-sm font-black truncate transition-colors duration-500"
                        style={{ color: isDark ? `rgb(${liquidTheme.rgb})` : `rgb(${liquidTheme.rgb})` }}
                      >
                        Suggested Grade: {suggestedRating === 4 ? 'Easy (4)' : suggestedRating === 3 ? 'Good (3)' : suggestedRating === 2 ? 'Hard (2)' : 'Again (1)'}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className={`text-xs font-mono font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      {treeMetrics
                        ? `${treeMetrics.recalledCount} / ${treeMetrics.totalNodes} Nodes Checked`
                        : `${blueprintMetrics?.recalledCount || 0} / ${blueprintMetrics?.totalPoints || 0} Points Checked`}
                    </div>
                    <div className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {recallPercent >= 85 ? '🌟 Excellent Retention' : recallPercent >= 60 ? '👍 Good Mastery' : recallPercent >= 30 ? '⚡ Needs Review' : '🔴 Needs Practice'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Render Tree / Hints */}
            {topicHints ? (
              <div className="space-y-4">
                {/* 1. Recursive Tree Mindmap View */}
                {Array.isArray(topicHints.tree) && topicHints.tree.length > 0 && (
                  <div className={`p-4 sm:p-6 rounded-2xl border shadow-md space-y-3 ${
                    isDark ? 'bg-slate-900/50 border-slate-700/60 neu-card-dark' : 'bg-[#e6ecf5] border-slate-300/80 neu-card-light'
                  }`}>
                    <div className="flex items-center justify-between border-b pb-2 border-slate-700/40">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-indigo-500">Concept Hierarchy</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-300/60 text-slate-700'}`}>
                          {allNodeIds.length} concepts
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleToggleExpandAll}
                          className="text-[11px] font-bold text-indigo-500 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          {areAllNodesExpanded ? (
                            <>
                              <ChevronsUp className="w-3.5 h-3.5" />
                              <span>Collapse All</span>
                            </>
                          ) : (
                            <>
                              <ChevronsDown className="w-3.5 h-3.5" />
                              <span>Expand All</span>
                            </>
                          )}
                        </button>
                        <span className={`text-[11px] font-mono hidden sm:inline ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Tap checkbox to mark recalled</span>
                      </div>
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
                        className={`p-4 sm:p-5 rounded-2xl border shadow-md space-y-3 ${
                          isDark ? 'bg-slate-900/50 border-slate-700/60 neu-card-dark' : 'bg-[#e6ecf5] border-slate-300/80 neu-card-light'
                        }`}
                      >
                        <h5 className="text-sm font-black text-amber-500 uppercase tracking-wide flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          {topObj.topic || `Section ${tIdx + 1}`}
                        </h5>

                        <div className="space-y-3 pl-2">
                          {(topObj.subtopics || []).map((subObj, sIdx) => (
                            <div key={sIdx} className="space-y-2">
                              <h6 className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{subObj.title}</h6>
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
                                            : 'bg-emerald-500/15 border-emerald-400 text-emerald-950'
                                          : isDark
                                            ? 'bg-slate-800/40 border-slate-700/40 text-slate-300 hover:border-slate-600'
                                            : 'neu-pressed-light bg-[#e6ecf5] border-slate-300/70 text-slate-800 hover:border-slate-400'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isRecalled}
                                        onChange={() => {}}
                                        className="mt-0.5 rounded text-emerald-500 cursor-pointer accent-emerald-500"
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
                isDark ? 'neu-pressed-dark border-slate-700/60' : 'neu-pressed-light border-slate-300 bg-[#e6ecf5]'
              }`}>
                <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto text-2xl">
                  💡
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-black">No Active-Recall Hints Generated Yet</h4>
                  <p className={`text-xs max-w-md mx-auto ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Let AutoAnki analyze textbook pages {pageLabel} to generate an intelligent concept hierarchy and progressive memory cues.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateHints}
                  disabled={isGeneratingHints}
                  className="px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-lg hover:brightness-110 active:scale-95 transition-all inline-flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className={`w-4 h-4 ${isGeneratingHints ? 'animate-spin' : ''}`} />
                  <span>{isGeneratingHints ? 'Generating AI Mindmap...' : 'Generate Active-Recall Hints'}</span>
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 2: TEXTBOOK PDF READER */}
        {activeTab === 'pdf' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl mx-auto space-y-4"
          >
            {/* PDF Controls Bar */}
            <div className={`p-4 rounded-2xl border shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
              isDark ? 'neu-card-dark border-slate-700/60 bg-slate-900/60' : 'neu-card-light border-slate-300/80 bg-[#e6ecf5]'
            }`}>
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-indigo-500" />
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider">
                    Textbook Slice Viewer ({pageLabel})
                  </h4>
                  <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {isPreSplitTopic ? '✓ Pre-split topic PDF source' : 'Main textbook slice with offset calibration'}
                  </p>
                </div>
              </div>

              {/* Offset & Zoom Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Offset calibrator if not pre-split */}
                {!isPreSplitTopic && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Offset:</span>
                    <input
                      type="number"
                      value={offsetInputValue}
                      onChange={(e) => setOffsetInputValue(e.target.value)}
                      onBlur={() => {
                        const parsed = parseInt(offsetInputValue, 10);
                        if (!isNaN(parsed) && parsed !== subjectPageOffset) {
                          handleSavePageOffset(parsed);
                        }
                      }}
                      className={`w-14 px-2 py-1 rounded-lg text-xs font-mono text-center border outline-none ${
                        isDark ? 'bg-slate-800 border-slate-700 text-white' : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-900'
                      }`}
                      title="Adjust textbook PDF page offset"
                    />
                    {isSavingOffset && (
                      <span className="text-[10px] text-amber-500 animate-pulse font-bold">Saving...</span>
                    )}
                  </div>
                )}

                {/* Zoom Buttons */}
                <div className="flex items-center gap-1 border-l pl-2 border-slate-700/40">
                  <button
                    type="button"
                    onClick={() => setPdfZoom(z => Math.max(0.6, z - 0.15))}
                    title="Zoom out"
                    className={`p-1.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                      isDark ? 'neu-btn-dark text-slate-300 hover:text-white border-slate-700' : 'neu-btn-light text-slate-700 border-slate-300'
                    }`}
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className={`text-[10px] font-mono font-bold px-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {Math.round(pdfZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setPdfZoom(z => Math.min(2.0, z + 0.15))}
                    title="Zoom in"
                    className={`p-1.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                      isDark ? 'neu-btn-dark text-slate-300 hover:text-white border-slate-700' : 'neu-btn-light text-slate-700 border-slate-300'
                    }`}
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* PDF View Container */}
            {isLoadingPdf ? (
              <div className={`p-16 rounded-3xl border text-center space-y-3 ${
                isDark ? 'neu-pressed-dark border-slate-700/60' : 'neu-pressed-light border-slate-300 bg-[#e6ecf5]'
              }`}>
                <Sparkles className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
                <p className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Extracting textbook chapter slice for {topic.name}...</p>
              </div>
            ) : pdfSlice?.pages && pdfSlice.pages.length > 0 ? (
              <div className="space-y-4 flex flex-col items-center">
                {pdfSlice.pages.map((pageImg, pIdx) => (
                  <div
                    key={pIdx}
                    style={{ transform: `scale(${pdfZoom})`, transformOrigin: 'top center' }}
                    className={`rounded-2xl border shadow-xl overflow-hidden transition-transform duration-200 ${
                      isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                    }`}
                  >
                    <div className={`px-4 py-1.5 text-[10px] font-mono border-b flex justify-between ${
                      isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      <span>Page {pIdx + 1} of {pdfSlice.pages.length}</span>
                      <span>{topic.subject}</span>
                    </div>
                    <img
                      src={pageImg}
                      alt={`Textbook Page ${pIdx + 1}`}
                      className="max-w-full h-auto object-contain select-none"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className={`p-12 rounded-3xl border text-center space-y-3 ${
                isDark ? 'neu-pressed-dark border-slate-700/60' : 'neu-pressed-light border-slate-300 bg-[#e6ecf5]'
              }`}>
                <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-sm font-black">No Textbook PDF Attached</h4>
                  <p className={`text-xs max-w-md mx-auto ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Attach a textbook PDF in the Subject Tracker or pre-split chapter topics to preview pages directly inside your study workspace.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 3: TOPIC NOTES & MNEMONICS */}
        {activeTab === 'notes' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto space-y-4"
          >
            <div className={`p-4 rounded-2xl border shadow-md flex items-center justify-between ${
              isDark ? 'neu-card-dark border-slate-700/60 bg-slate-900/60' : 'neu-card-light border-slate-300/80 bg-[#e6ecf5]'
            }`}>
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-amber-500" />
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider">Topic Notes & Mnemonics</h4>
                  <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Auto-saved to local database & cloud sync</p>
                </div>
              </div>

              {isSavingNotes && (
                <span className="text-[11px] font-bold text-amber-500 animate-pulse flex items-center gap-1">
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
                  : 'neu-pressed-light bg-[#e6ecf5] border-slate-300 text-slate-900 placeholder-slate-500 focus:border-amber-500'
              }`}
            />
          </motion.div>
        )}
      </div>

      {/* 3. BOTTOM RATING & COMPLETION ACTION BAR */}
      <div className={`p-4 sm:p-5 border-t shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 ${
        isDark ? 'border-slate-700/80 bg-slate-900/80 backdrop-blur-md' : 'border-slate-300/80 bg-[#e6ecf5]/90 backdrop-blur-md'
      }`}>
        <div className={`text-xs font-semibold hidden lg:flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
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

// Sub-component: Tree Node Item for Study Workspace (with Neumorphic Design System Styling)
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
    <div className={`space-y-1.5 transition-all ${depth > 0 ? 'ml-3 sm:ml-5 pl-2 border-l-2 border-slate-400/40 dark:border-slate-700/50' : ''}`}>
      <div
        className={`p-3 rounded-xl border flex items-start gap-3 transition-all cursor-pointer shadow-xs ${
          isRecalled
            ? isDark
              ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-200'
              : 'bg-emerald-500/15 border-emerald-400 text-emerald-950'
            : isDark
              ? 'bg-slate-800/40 border-slate-700/50 text-slate-200 hover:border-slate-600'
              : 'neu-pressed-light bg-[#e6ecf5] border-slate-300/70 text-slate-800 hover:border-slate-400'
        }`}
        onClick={() => onToggleRecall(nodeId)}
      >
        <input
          type="checkbox"
          checked={isRecalled}
          onChange={() => {}}
          className="mt-1 rounded text-emerald-500 cursor-pointer shrink-0 accent-emerald-500"
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
                className="text-[10px] text-indigo-500 hover:underline font-mono cursor-pointer"
              >
                {isExpanded ? 'Collapse' : `Expand (${node.children.length})`}
              </button>
            )}
          </div>

          {node.prompt && (
            <p className={`text-xs italic ${isRecalled ? 'line-through opacity-70' : isDark ? 'text-slate-400' : 'text-slate-600'}`}>
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
                    isDark ? 'bg-slate-800 text-slate-300 hover:text-emerald-400 border-slate-700' : 'neu-btn-light bg-[#e6ecf5] text-slate-700 border-slate-300'
                  }`}
                >
                  <Eye className="w-3 h-3 text-emerald-500" />
                  <span>Tap to Reveal Answer</span>
                </button>
              ) : (
                <div
                  onClick={() => setIsAnswerRevealed(false)}
                  className={`p-2.5 rounded-xl border text-xs leading-relaxed cursor-pointer ${
                    isDark ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200' : 'bg-emerald-500/10 border-emerald-300 text-emerald-950'
                  }`}
                >
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block mb-1">
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

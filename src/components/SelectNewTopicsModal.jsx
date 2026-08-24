import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Sparkles, BookOpen, Clock, Check, Search, Filter, RefreshCw, Send,
  Zap, Brain, AlertCircle, ChevronRight, CheckCircle2, MessageSquare, Layers, Award, HelpCircle
} from 'lucide-react';
import { parsePageNumbers, getTopicPageWeight } from '../utils/pageUtils';
import { getAiTopicRecommendations, saveAiTopicRecommendations } from '../services/localDb';
import { calculatePredictiveTopicTime } from '../services/predictiveTimingEngine';

const DEFAULT_CARD_GEN_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash'
];

export default function SelectNewTopicsModal({
  isOpen,
  onClose,
  subjectTrackerData = [],
  studyLogs = {},
  studySchedule = [],
  dailyLimits = {},
  onActivateTopics,
  geminiApiKey = '',
  aiFeatureModels = {},
  themeMode = 'dark'
}) {
  const isDark = themeMode === 'dark';

  // Active Tab: 'manual' (default primary) or 'ai' (optional)
  const [activeTab, setActiveTab] = useState('manual');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('ALL');
  const [selectedTopicIds, setSelectedTopicIds] = useState(new Set());

  // AI Tab States
  const [aiStrategyMode, setAiStrategyMode] = useState('cross_subject'); // 'cross_subject', 'interleaving', 'exam_sprint'
  const [aiRecommendations, setAiRecommendations] = useState([]);
  const [aiAdvisorNote, setAiAdvisorNote] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [userChatPrompt, setUserChatPrompt] = useState('');
  const [aiError, setAiError] = useState('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const dailyCapPages = dailyLimits.newPagesPerDay ?? 10;
  const isUnlimited = dailyCapPages >= 9999;

  // Extract all unstudied topics from subjectTrackerData
  const unstudiedCatalog = useMemo(() => {
    const catalog = [];
    if (!Array.isArray(subjectTrackerData)) return catalog;

    subjectTrackerData.forEach(subDoc => {
      const subName = subDoc.subject || 'General';
      if (subDoc.topics) {
        const topicsList = Object.values(subDoc.topics);
        topicsList.forEach(topic => {
          if (!topic || !topic.name || topic.name.trim().length === 0) return;

          // A topic is unstudied if reviewCount === 0 and no lastReviewDate
          const isUnstudied = (!topic.reviewCount || topic.reviewCount === 0) && !topic.lastReviewDate;
          if (isUnstudied) {
            const rawWeight = getTopicPageWeight(topic, topicsList);
            const pageWeight = (typeof rawWeight === 'number' && !isNaN(rawWeight) && rawWeight > 0) ? rawWeight : 1;
            const { pageLabel } = parsePageNumbers(topic);
            const pred = calculatePredictiveTopicTime(topic, subjectTrackerData, studyLogs);
            const estMinutes = pred.predictedMinutes;
            const topicId = topic.id || `${subName}_${topic.name}`;

            catalog.push({
              ...topic,
              id: topicId,
              subject: subName,
              pageWeight,
              pageLabel,
              estMinutes,
              tierLabel: pred.tierLabel
            });
          }
        });
      }
    });

    return catalog;
  }, [subjectTrackerData, studyLogs]);

  // List of distinct subjects for manual filtering
  const distinctSubjects = useMemo(() => {
    const subjects = new Set();
    unstudiedCatalog.forEach(t => {
      if (t.subject && String(t.subject).trim().length > 0) {
        subjects.add(String(t.subject).trim());
      }
    });
    return Array.from(subjects).filter(Boolean).sort();
  }, [unstudiedCatalog]);

  // Filtered manual topics
  const filteredManualTopics = useMemo(() => {
    return unstudiedCatalog.filter(t => {
      const matchesSubject = selectedSubjectFilter === 'ALL' || t.subject === selectedSubjectFilter;
      const matchesSearch = !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.subject.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSubject && matchesSearch;
    });
  }, [unstudiedCatalog, selectedSubjectFilter, searchQuery]);

  // Group manual topics by Subject
  const groupedManualTopics = useMemo(() => {
    const groups = {};
    filteredManualTopics.forEach(topic => {
      const sub = topic.subject && String(topic.subject).trim().length > 0 ? String(topic.subject).trim() : 'General';
      if (!groups[sub]) groups[sub] = [];
      groups[sub].push(topic);
    });
    return groups;
  }, [filteredManualTopics]);

  // Selected topics page count sum
  const selectedMetrics = useMemo(() => {
    let pages = 0;
    let count = 0;
    unstudiedCatalog.forEach(t => {
      if (selectedTopicIds.has(t.id)) {
        pages += t.pageWeight;
        count++;
      }
    });
    return { pages, count };
  }, [unstudiedCatalog, selectedTopicIds]);

  // Load cached AI recommendations on open
  useEffect(() => {
    if (isOpen) {
      const todayStr = new Date().toISOString().split('T')[0];
      getAiTopicRecommendations(todayStr).then(cached => {
        if (cached && Array.isArray(cached.recommendations)) {
          setAiRecommendations(cached.recommendations);
          if (cached.advisorNote) setAiAdvisorNote(cached.advisorNote);
        }
      }).catch(err => console.error("Error loading cached AI recommendations:", err));
    }
  }, [isOpen]);

  const toggleTopicSelection = (topicId) => {
    setSelectedTopicIds(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedTopicIds(prev => {
      const next = new Set(prev);
      filteredManualTopics.forEach(t => next.add(t.id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedTopicIds(new Set());
  };

  // AI Recommendation Generator via Gemini API
  const generateAiRecommendations = async (feedbackText = '', overrideMode = null) => {
    if (unstudiedCatalog.length === 0) {
      setAiError("No unstudied textbook topics available to recommend.");
      return;
    }

    const activeStrategyMode = overrideMode || aiStrategyMode;

    setAiLoading(true);
    setAiError('');

    // 1. Gather Recent Review History (Past 15 Logs) with Ratings & Lapses
    const recentHistory = [];
    const ratingLabels = { 1: 'Again (Lapse)', 2: 'Hard', 3: 'Good', 4: 'Easy' };

    const extractLog = (l, dateStr = null) => {
      if (!l || !l.topicName) return;
      recentHistory.push({
        subject: l.subject || 'General',
        topicName: l.topicName,
        date: l.dateStr || dateStr || (l.timestamp ? l.timestamp.split('T')[0] : 'Recent'),
        rating: l.rating || 3,
        ratingLabel: ratingLabels[l.rating] || 'Good'
      });
    };

    if (Array.isArray(studyLogs)) {
      studyLogs.forEach(item => {
        if (item && Array.isArray(item.fsrsLogs)) {
          item.fsrsLogs.forEach(l => extractLog(l, item.dateStr || item.date));
        } else if (item && item.topicName) {
          extractLog(item);
        }
      });
    } else if (studyLogs && typeof studyLogs === 'object') {
      Object.entries(studyLogs).forEach(([dateStr, dayLog]) => {
        if (dayLog && Array.isArray(dayLog.fsrsLogs)) {
          dayLog.fsrsLogs.forEach(l => extractLog(l, dateStr));
        } else if (dayLog && dayLog.topicName) {
          extractLog(dayLog, dateStr);
        }
      });
    }

    // 2. Gather Weak Topics & Memory Lapses from Subject Tracker
    const weakLapsesAndLeeches = [];
    if (Array.isArray(subjectTrackerData)) {
      subjectTrackerData.forEach(subDoc => {
        const subName = subDoc.subject || 'General';
        if (subDoc.topics) {
          Object.values(subDoc.topics).forEach(t => {
            if (t && (t.lapses > 0 || t.isLeech || t.difficulty > 6.5)) {
              weakLapsesAndLeeches.push({
                subject: subName,
                topicName: t.name,
                lapses: t.lapses || 0,
                difficulty: t.difficulty ? parseFloat(t.difficulty.toFixed(1)) : 'Unstudied',
                isLeech: !!t.isLeech
              });
            }
          });
        }
      });
    }

    // 3. Select Model Fallback Sequence
    const modelsList = (aiFeatureModels && aiFeatureModels.cardGeneration) || DEFAULT_CARD_GEN_MODELS;

    // Send ALL unstudied topics in student catalog (no 30-item truncation)
    const payloadCatalog = unstudiedCatalog.map(t => ({
      subject: t.subject,
      topicName: t.name,
      pageCount: t.pageWeight
    }));

    const systemPrompt = `You are an elite medical and academic mentor specializing in competitive exam strategy ("Topper Strategy").
Select 2 to 4 unstudied topics from the student's catalog.

STRICT CONSTRAINTS:
1. The SUM of the page counts of selected topics MUST NOT exceed ${dailyCapPages} pages.
2. ${feedbackText ? `STUDENT FEEDBACK: "${feedbackText}". Strictly satisfy the student's request.` : `Strategy Mode: ${activeStrategyMode}.`}

Format response strictly as JSON with this schema:
{
  "recommendations": [
    {
      "subject": "exact subject string from catalog",
      "topicName": "exact topicName string from catalog",
      "pageCount": number,
      "linkageReason": "1-2 sentence explanation of why this topic connects to recent studies",
      "yieldScore": "High-Yield" | "Clinical Integration" | "Core Concept",
      "mnemonicTeaser": "1 sentence memory anchor tip"
    }
  ],
  "totalPlanPages": number,
  "advisorNote": "Short summary of why this bundle was selected for today."
}`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            { text: systemPrompt },
            { 
              text: JSON.stringify({ 
                recentHistory: recentHistory.slice(-15), 
                weakLapsesAndLeeches: weakLapsesAndLeeches.slice(0, 20),
                unstudiedCatalog: payloadCatalog, 
                dailyCapPages 
              }) 
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    let success = false;
    let apiKeyToUse = geminiApiKey || (typeof window !== 'undefined' ? localStorage.getItem("pyt_gemini_api_key") : '');

    if (!apiKeyToUse) {
      // Heuristic Fallback if no API key
      const fallbackRecs = unstudiedCatalog.slice(0, 2).map(t => ({
        subject: t.subject,
        topicName: t.name,
        pageCount: t.pageWeight,
        linkageReason: `Selected as a foundational core topic in ${t.subject} for today's study session.`,
        yieldScore: "Core Concept",
        mnemonicTeaser: `Focus on main section headers and summary keypoints.`
      }));
      setAiRecommendations(fallbackRecs);
      setAiAdvisorNote("Generated heuristic recommendations. Add your free Gemini API Key in Settings for AI cross-subject correlation!");
      setAiLoading(false);
      return;
    }

    // Model fallback execution loop
    for (const modelName of modelsList) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKeyToUse}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!res.ok) continue;

        const data = await res.json();
        const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) continue;

        const parsed = JSON.parse(jsonText);
        if (parsed && Array.isArray(parsed.recommendations)) {
          setAiRecommendations(parsed.recommendations);
          if (parsed.advisorNote) setAiAdvisorNote(parsed.advisorNote);
          const todayStr = new Date().toISOString().split('T')[0];
          saveAiTopicRecommendations(todayStr, parsed).catch(err => console.error(err));
          success = true;
          break;
        }
      } catch (err) {
        console.warn(`[AI Topper] Model ${modelName} failed, trying fallback...`, err);
      }
    }

    if (!success) {
      setAiError("Failed to connect to AI models. Falling back to core catalog topics.");
      const fallbackRecs = unstudiedCatalog.slice(0, 2).map(t => ({
        subject: t.subject,
        topicName: t.name,
        pageCount: t.pageWeight,
        linkageReason: `Core topic fallback from ${t.subject}.`,
        yieldScore: "Core Concept",
        mnemonicTeaser: "Review section summary first."
      }));
      setAiRecommendations(fallbackRecs);
    }

    setAiLoading(false);
    setUserChatPrompt('');
  };

  const handleActivateManualSelection = () => {
    const selectedTopicsList = unstudiedCatalog.filter(t => selectedTopicIds.has(t.id));
    if (selectedTopicsList.length === 0) return;
    if (typeof onActivateTopics === 'function') {
      onActivateTopics(selectedTopicsList);
    }
    onClose();
  };

  const handleActivateSingleAiTopic = (rec) => {
    if (!rec) return;
    const cleanRName = (rec.topicName || rec.name || '').trim().toLowerCase();
    const cleanRSub = (rec.subject || '').trim().toLowerCase();

    const matchedTopic = unstudiedCatalog.find(t => {
      const cleanTName = t.name.trim().toLowerCase();
      const cleanTSub = t.subject.trim().toLowerCase();
      return cleanTName === cleanRName || (cleanTSub === cleanRSub && cleanTName.includes(cleanRName));
    });

    if (matchedTopic && typeof onActivateTopics === 'function') {
      onActivateTopics([matchedTopic]);
    }
  };

  const handleActivateAiPlan = () => {
    if (aiRecommendations.length === 0) return;
    const aiSelectedTopics = unstudiedCatalog.filter(t => {
      const cleanTName = t.name.trim().toLowerCase();
      const cleanTSub = t.subject.trim().toLowerCase();
      return aiRecommendations.some(r => {
        const cleanRName = (r.topicName || r.name || '').trim().toLowerCase();
        const cleanRSub = (r.subject || '').trim().toLowerCase();
        return cleanTName === cleanRName || (cleanTSub === cleanRSub && (cleanTName.includes(cleanRName) || cleanRName.includes(cleanTName)));
      });
    });

    if (aiSelectedTopics.length > 0 && typeof onActivateTopics === 'function') {
      onActivateTopics(aiSelectedTopics);
    } else if (unstudiedCatalog.length > 0 && typeof onActivateTopics === 'function') {
      // Fallback: activate top unstudied topics matching recommendation count
      onActivateTopics(unstudiedCatalog.slice(0, aiRecommendations.length));
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div key="selectNewTopicsModalOverlay" className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 pt-3 sm:pt-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto no-scrollbar">
        <motion.div
          key="selectNewTopicsModalCard"
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={`w-full max-w-4xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col h-[94vh] sm:h-auto max-h-[94vh] sm:max-h-[90vh] ${
          isDark ? 'bg-[#222730] border-slate-700/80 neu-card-dark text-slate-200' : 'bg-[#e6ecf5] border-slate-200 neu-card-light text-slate-800'
        }`}
      >
          {/* Header Bar */}
          <div className={`p-3.5 sm:p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 shrink-0 ${
            isDark ? 'border-slate-700/60 bg-slate-900/40' : 'border-slate-300/60 bg-white/60'
          }`}>
            <div>
              <h3 className={`text-base sm:text-lg font-black tracking-tight flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <span>➕</span>
                <span>Select New Topics for Today</span>
              </h3>
              <p className={`text-[10px] sm:text-xs font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {unstudiedCatalog.length} unstudied textbook topics available
              </p>
            </div>

            {/* Live Page Cap Gauge & Close */}
            <div className="flex items-center justify-between sm:justify-end gap-2.5 sm:gap-3">
              <div className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl border text-[11px] sm:text-xs font-black flex items-center gap-1.5 ${
                selectedMetrics.pages > dailyCapPages && !isUnlimited
                  ? 'bg-amber-500/20 text-amber-500 border-amber-500/40'
                  : isDark ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}>
                <BookOpen className="w-3.5 h-3.5" />
                <span>
                  {isUnlimited ? `${selectedMetrics.pages} pgs (Unlimited)` : `Selected: ${selectedMetrics.pages} / ${dailyCapPages} pgs`}
                </span>
              </div>

              <button
                onClick={onClose}
                className={`p-1.5 sm:p-2 rounded-xl border transition-all cursor-pointer ${
                  isDark ? 'neu-btn-dark text-slate-400 hover:text-white border-slate-700' : 'neu-btn-light text-slate-600 hover:text-slate-900 border-slate-300'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mode Switcher Tabs - Neumorphic Pill Design */}
          <div className="px-3.5 sm:px-5 pt-3 sm:pt-4 shrink-0">
            <div className={`relative grid grid-cols-2 p-1 sm:p-1.5 rounded-2xl border w-full select-none overflow-hidden ${
              isDark ? 'neu-pressed-dark border-slate-700/60' : 'neu-pressed-light border-slate-300/80'
            }`}>
              <div
                className={`absolute top-1 sm:top-1.5 bottom-1 sm:bottom-1.5 rounded-xl shadow-md ${
                  isDark ? 'neu-btn-accent-dark' : 'neu-btn-accent-light'
                }`}
                style={{
                  left: `calc(0.25rem + ${activeTab === 'manual' ? 0 : 1} * ((100% - 0.5rem) / 2))`,
                  width: `calc((100% - 0.5rem) / 2)`,
                  transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
                }}
              />

              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                className={`relative z-10 py-2 sm:py-2.5 px-1 sm:px-2 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-colors duration-300 ${
                  activeTab === 'manual' ? 'text-white font-extrabold' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">All Unstudied Topics</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('ai');
                  if (aiRecommendations.length === 0) generateAiRecommendations();
                }}
                className={`relative z-10 py-2 sm:py-2.5 px-1 sm:px-2 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-colors duration-300 ${
                  activeTab === 'ai' ? 'text-white font-extrabold' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                <span className="truncate">AI Suggestions</span>
              </button>
            </div>
          </div>

          {/* Body Content Area */}
          <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 no-scrollbar space-y-4">
            {/* ── MODE 1: MANUAL TOPIC PICKER (PRIMARY) ── */}
            {activeTab === 'manual' && (
              <div className="space-y-4">
                {/* Search & Subject Filter Bar */}
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="relative flex-1 w-full">
                    <Search className={`w-4 h-4 absolute left-3.5 top-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search unstudied topics or subjects..."
                      className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs focus:outline-none ${
                        isDark ? 'bg-slate-900/80 border border-slate-700 text-white' : 'bg-white border border-slate-300 text-slate-800 neu-pressed-light'
                      }`}
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                    <button
                      onClick={() => setSelectedSubjectFilter('ALL')}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                        selectedSubjectFilter === 'ALL'
                          ? 'bg-indigo-500 text-white shadow-md'
                          : isDark ? 'neu-btn-dark text-slate-400 border border-slate-700' : 'neu-btn-light text-slate-600 border border-slate-300'
                      }`}
                    >
                      All ({unstudiedCatalog.length})
                    </button>
                    {distinctSubjects.map((sub, idx) => (
                      <button
                        key={`subj_btn_${sub}_${idx}`}
                        onClick={() => setSelectedSubjectFilter(sub)}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                          selectedSubjectFilter === sub
                            ? 'bg-indigo-500 text-white shadow-md'
                            : isDark ? 'neu-btn-dark text-slate-400 border border-slate-700' : 'neu-btn-light text-slate-600 border border-slate-300'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selection Controls */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={selectAllFiltered}
                      className="text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer text-[11px]"
                    >
                      Select All Filtered ({filteredManualTopics.length})
                    </button>
                    <span className="text-slate-600">•</span>
                    <button
                      onClick={clearSelection}
                      className="text-slate-400 hover:text-slate-300 font-medium cursor-pointer text-[11px]"
                    >
                      Clear Selection
                    </button>
                  </div>

                  <span className={`font-bold text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {selectedMetrics.count} selected
                  </span>
                </div>

                {/* Grouped Topics List */}
                {Object.keys(groupedManualTopics).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(groupedManualTopics).map(([subject, topics], gIdx) => (
                      <div key={`group_${subject}_${gIdx}`} className="space-y-2">
                        <div className={`text-xs font-black uppercase tracking-wider px-2 py-1 rounded-lg inline-block border ${
                          isDark ? 'bg-slate-900/60 border-slate-700 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        }`}>
                          {subject} ({topics.length} topics)
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {topics.map((topic, tIdx) => {
                            const isSelected = selectedTopicIds.has(topic.id);
                            return (
                              <motion.div
                                key={topic.id || `topic_${subject}_${topic.name || tIdx}_${tIdx}`}
                                whileHover={{ scale: 1.01 }}
                                onClick={() => toggleTopicSelection(topic.id)}
                                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                  isSelected
                                    ? isDark ? 'bg-indigo-500/20 border-indigo-500/60 neu-card-dark' : 'bg-indigo-50 border-indigo-400 neu-card-light'
                                    : isDark ? 'bg-slate-900/40 border-slate-700/60 hover:border-slate-600' : 'bg-white border-slate-200/80 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors ${
                                    isSelected
                                      ? 'bg-indigo-500 border-indigo-500 text-white'
                                      : isDark ? 'border-slate-600 bg-slate-800' : 'border-slate-300 bg-slate-100'
                                  }`}>
                                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                  </div>

                                  <div>
                                    <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{topic.name}</div>
                                    <div className={`text-[10px] font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                      <span className="font-mono text-indigo-400 font-bold">{topic.pageLabel}</span> • {topic.pageWeight} {topic.pageWeight === 1 ? 'pg' : 'pgs'} • ~{topic.estMinutes} mins
                                    </div>
                                  </div>
                                </div>

                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
                                  isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}>
                                  New
                                </span>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`p-8 rounded-2xl border text-center text-xs space-y-2 ${
                    isDark ? 'bg-slate-900/40 border-slate-700/40 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
                  }`}>
                    <BookOpen className="w-8 h-8 text-indigo-400 mx-auto" />
                    <div>No unstudied topics match your filter.</div>
                  </div>
                )}
              </div>
            )}

            {/* ── MODE 2: AI TOPPER RECOMMENDATIONS (OPTIONAL) ── */}
            {activeTab === 'ai' && (
              <div className="space-y-4">
                {/* AI Strategy Mode Selector */}
                <div className={`p-4 rounded-2xl border space-y-3 ${
                  isDark ? 'bg-slate-900/60 border-slate-700/60' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" /> Choose AI Strategy Mode
                      <button
                        type="button"
                        onClick={() => setIsHelpOpen(true)}
                        title="Learn about AI Strategy Modes"
                        className={`p-1 rounded-full border transition-all cursor-pointer ${
                          isDark
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                            : 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
                        }`}
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </span>
                    <button
                      onClick={() => generateAiRecommendations()}
                      disabled={aiLoading}
                      className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 cursor-pointer ${
                        isDark ? 'neu-btn-dark text-amber-300 border-amber-500/40' : 'neu-btn-light text-amber-600 border-amber-300'
                      }`}
                    >
                      <RefreshCw className={`w-3 h-3 ${aiLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      onClick={() => setAiStrategyMode('cross_subject')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        aiStrategyMode === 'cross_subject'
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-400'
                          : isDark ? 'bg-slate-800/60 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="text-xs font-bold">🔗 Cross-Subject Integration</div>
                      <div className="text-[10px] opacity-80 mt-0.5">Links recent topics to clinical subjects</div>
                    </button>

                    <button
                      onClick={() => setAiStrategyMode('interleaving')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        aiStrategyMode === 'interleaving'
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-400'
                          : isDark ? 'bg-slate-800/60 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="text-xs font-bold">🛠️ Weakness Interleaving</div>
                      <div className="text-[10px] opacity-80 mt-0.5">Pairs new topics with weak revisions</div>
                    </button>

                    <button
                      onClick={() => setAiStrategyMode('pyq_weightage')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        aiStrategyMode === 'pyq_weightage'
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-400'
                          : isDark ? 'bg-slate-800/60 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="text-xs font-bold">🏆 High-Yield PYQ Weightage</div>
                      <div className="text-[10px] opacity-80 mt-0.5">Prioritizes NEET-PG / INI-CET high-yield topics</div>
                    </button>
                  </div>
                </div>

                {/* AI Error Alert */}
                {aiError && (
                  <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{aiError}</span>
                  </div>
                )}

                {/* AI Recommendation Cards */}
                {aiLoading ? (
                  <div className={`p-8 rounded-2xl border text-center space-y-3 ${
                    isDark ? 'bg-slate-900/40 border-slate-700/40' : 'bg-white border-slate-200'
                  }`}>
                    <Brain className="w-8 h-8 text-amber-500 animate-pulse mx-auto" />
                    <div className="text-xs font-bold text-amber-400">Analyzing cross-subject links & page cap constraints...</div>
                    <div className="text-[11px] text-slate-400">Evaluating your past study history against available topics</div>
                  </div>
                ) : aiRecommendations.length > 0 ? (
                  <div className="space-y-3">
                    {/* Advisor Note Banner */}
                    {aiAdvisorNote && (
                      <div className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                        isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}>
                        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>{aiAdvisorNote}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {aiRecommendations.map((rec, idx) => (
                        <motion.div
                          key={`ai_rec_${rec.topicName || rec.name || idx}_${idx}`}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: idx * 0.05 }}
                          className={`p-4 rounded-2xl border shadow-md space-y-2.5 ${
                            isDark ? 'bg-[#222730] border-amber-500/40 neu-card-dark' : 'bg-white border-amber-300 neu-card-light'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-500 border border-amber-500/30">
                                {rec.subject}
                              </span>
                              <h5 className={`text-xs font-bold mt-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>{rec.topicName}</h5>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30">
                                {rec.yieldScore || 'High-Yield'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleActivateSingleAiTopic(rec)}
                                className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-1 ${
                                  isDark ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40' : 'bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-300'
                                }`}
                              >
                                <span>+ Add to Today</span>
                              </button>
                            </div>
                          </div>

                          {/* Linkage Reason */}
                          <div className={`p-2.5 rounded-xl border text-[11px] space-y-1 ${
                            isDark ? 'bg-slate-900/60 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}>
                            <div className="font-bold text-amber-500 flex items-center gap-1">
                              💡 Topper Correlation Rationale:
                            </div>
                            <p className="leading-relaxed">{rec.linkageReason}</p>
                          </div>

                          {/* Mnemonic Teaser */}
                          {rec.mnemonicTeaser && (
                            <div className={`text-[10px] font-medium flex items-center gap-1.5 ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>
                              <span>🧠</span>
                              <span className="italic">{rec.mnemonicTeaser}</span>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>

                    {/* Interactive Conversational Refinement Bar */}
                    <div className={`p-3.5 rounded-2xl border space-y-2 ${
                      isDark ? 'bg-slate-900/60 border-slate-700/60' : 'bg-white border-slate-200'
                    }`}>
                      <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>💬 Refine Plan with AI Advisor</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={userChatPrompt}
                          onChange={(e) => setUserChatPrompt(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && generateAiRecommendations(userChatPrompt)}
                          placeholder="e.g. 'I don't want Orthopedics today, give me Pathology topics'..."
                          className={`w-full px-3 py-2 rounded-xl text-xs focus:outline-none ${
                            isDark ? 'bg-slate-950 border border-slate-700 text-white' : 'bg-slate-50 border border-slate-300 text-slate-800'
                          }`}
                        />
                        <button
                          onClick={() => generateAiRecommendations(userChatPrompt)}
                          disabled={aiLoading || !userChatPrompt.trim()}
                          className={`px-3 py-2 rounded-xl text-xs font-black uppercase border flex items-center gap-1 transition-all cursor-pointer ${
                            userChatPrompt.trim()
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-md active:scale-95'
                              : 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                          }`}
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Update</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={`p-8 rounded-2xl border text-center text-xs space-y-2 ${
                    isDark ? 'bg-slate-900/40 border-slate-700/40 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
                  }`}>
                    <Sparkles className="w-8 h-8 text-amber-500 mx-auto" />
                    <div>Click Refresh to generate cross-subject AI topic suggestions.</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Action Bar */}
          <div className={`p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 ${
            isDark ? 'border-slate-700/60 bg-slate-900/40' : 'border-slate-300/60 bg-white/60'
          }`}>
            <div className="text-xs font-bold text-slate-400">
              {activeTab === 'manual'
                ? `Selected: ${selectedMetrics.count} topics (${selectedMetrics.pages} pgs)`
                : `AI Plan: ${aiRecommendations.length} topics recommended`}
            </div>

            {activeTab === 'manual' ? (
              <button
                onClick={handleActivateManualSelection}
                disabled={selectedMetrics.count === 0}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                  selectedMetrics.count > 0
                    ? isDark
                      ? 'neu-btn-dark text-emerald-400 border border-emerald-500/40 shadow-lg active:scale-95'
                      : 'neu-btn-light text-emerald-600 border border-emerald-400 shadow-lg active:scale-95'
                    : 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>🚀 Activate Selected Topics ({selectedMetrics.count})</span>
              </button>
            ) : (
              <button
                onClick={handleActivateAiPlan}
                disabled={aiRecommendations.length === 0}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                  aiRecommendations.length > 0
                    ? isDark
                      ? 'neu-btn-dark text-amber-400 border border-amber-500/40 shadow-lg active:scale-95'
                      : 'neu-btn-light text-amber-600 border border-amber-400 shadow-lg active:scale-95'
                    : 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>🚀 Enroll Full AI Plan ({aiRecommendations.length} Topics)</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>

      {/* Strategy Guide Help Modal */}
      <AnimatePresence>
        {isHelpOpen && (
          <div key="helpModalOverlay" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto no-scrollbar">
            <motion.div
              key="helpModalCard"
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.25 }}
              className={`w-full max-w-xl p-5 sm:p-6 rounded-3xl border shadow-2xl space-y-5 ${
                isDark ? 'bg-[#222730] border-amber-500/40 text-slate-200 neu-card-dark' : 'bg-white border-amber-300 text-slate-800 neu-card-light'
              }`}
            >
              <div className="flex items-center justify-between border-b pb-3 border-amber-500/20">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <h3 className={`text-base font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    AI Topper Strategy Guide
                  </h3>
                </div>
                <button
                  onClick={() => setIsHelpOpen(false)}
                  className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                    isDark ? 'neu-btn-dark text-slate-400 hover:text-white' : 'neu-btn-light text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 max-h-[65vh] overflow-y-auto no-scrollbar pr-1">
                {/* Mode 1 */}
                <div className={`p-4 rounded-2xl border space-y-2 ${
                  isDark ? 'bg-slate-900/60 border-slate-700/60' : 'bg-amber-50/50 border-amber-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-black">
                      🔗 Mode 1
                    </span>
                    <h4 className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      Cross-Subject Integration (Default)
                    </h4>
                  </div>
                  <p className="text-[11px] font-semibold text-amber-500">What it means: <span className={isDark ? 'text-slate-300 font-normal' : 'text-slate-700 font-normal'}>Links basic medical sciences to clinical application.</span></p>
                  <p className="text-[11px] font-semibold text-amber-500">How it works: <span className={isDark ? 'text-slate-300 font-normal' : 'text-slate-700 font-normal'}>The AI checks what you studied over the past 3–7 days and picks unstudied topics from related subjects that build upon that knowledge.</span></p>
                  <p className="text-[11px] font-semibold text-amber-500">Example: <span className={isDark ? 'text-indigo-300 font-normal italic' : 'text-indigo-700 font-normal italic'}>If you studied Anatomy: Lower Limb Nerves yesterday, the AI will recommend Orthopedics: Lower Limb Fractures & Nerve Injuries today.</span></p>
                  <p className="text-[11px] font-semibold text-amber-500">Best used for: <span className={isDark ? 'text-emerald-400 font-normal' : 'text-emerald-700 font-normal'}>Building strong long-term retention by linking concepts across subjects.</span></p>
                </div>

                {/* Mode 2 */}
                <div className={`p-4 rounded-2xl border space-y-2 ${
                  isDark ? 'bg-slate-900/60 border-slate-700/60' : 'bg-amber-50/50 border-amber-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-black">
                      🛠️ Mode 2
                    </span>
                    <h4 className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      Weakness Interleaving
                    </h4>
                  </div>
                  <p className="text-[11px] font-semibold text-amber-500">What it means: <span className={isDark ? 'text-slate-300 font-normal' : 'text-slate-700 font-normal'}>Pairs new topics with your highest-lapse / lowest-retention subjects.</span></p>
                  <p className="text-[11px] font-semibold text-amber-500">How it works: <span className={isDark ? 'text-slate-300 font-normal' : 'text-slate-700 font-normal'}>Instead of studying easy or favorite subjects back-to-back, the AI identifies subjects where you have recent low ratings or lapses, and selects fresh topics from those weaker areas.</span></p>
                  <p className="text-[11px] font-semibold text-amber-500">Example: <span className={isDark ? 'text-indigo-300 font-normal italic' : 'text-indigo-700 font-normal italic'}>If Pathology has high lapse counts, the AI recommends new Pathology chapters to eliminate memory blindspots.</span></p>
                  <p className="text-[11px] font-semibold text-amber-500">Best used for: <span className={isDark ? 'text-emerald-400 font-normal' : 'text-emerald-700 font-normal'}>Overcoming subject weaknesses and avoiding topic decay.</span></p>
                </div>

                {/* Mode 3 */}
                <div className={`p-4 rounded-2xl border space-y-2 ${
                  isDark ? 'bg-slate-900/60 border-slate-700/60' : 'bg-amber-50/50 border-amber-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-black">
                      🏆 Mode 3
                    </span>
                    <h4 className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      High-Yield PYQ Weightage Optimizer
                    </h4>
                  </div>
                  <p className="text-[11px] font-semibold text-amber-500">What it means: <span className={isDark ? 'text-slate-300 font-normal' : 'text-slate-700 font-normal'}>Prioritizes unstudied topics based on historical NEET-PG & INI-CET Previous Year Question (PYQ) weightage and high-yield blueprints.</span></p>
                  <p className="text-[11px] font-semibold text-amber-500">How it works: <span className={isDark ? 'text-slate-300 font-normal' : 'text-slate-700 font-normal'}>The AI evaluates your unstudied topics catalog and selects chapters from high-weightage subjects (Pathology, Pharmacology, PSM, OBG, Surgery, Medicine, Microbiology) and core high-frequency exam topics.</span></p>
                  <p className="text-[11px] font-semibold text-amber-500">Example: <span className={isDark ? 'text-indigo-300 font-normal italic' : 'text-indigo-700 font-normal italic'}>If you have unstudied topics across multiple subjects, the AI prioritizes Pharmacology: Autonomic Nervous System or Pathology: Renal Disorders over low-yield topics.</span></p>
                  <p className="text-[11px] font-semibold text-amber-500">Best used for: <span className={isDark ? 'text-emerald-400 font-normal' : 'text-emerald-700 font-normal'}>Maximizing mark yield per hour studied for NEET-PG and INI-CET.</span></p>
                </div>
              </div>

              <button
                onClick={() => setIsHelpOpen(false)}
                className={`w-full py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider border cursor-pointer ${
                  isDark ? 'neu-btn-dark text-white border-slate-700' : 'neu-btn-light text-slate-800 border-slate-300'
                }`}
              >
                Got it
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

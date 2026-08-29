import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Award,
  BookOpen,
  Trash2,
  Edit2,
  Calendar,
  Layers,
  Sparkles,
  RotateCcw,
  ChevronDown,
  Check,
  Search,
  Tag
} from 'lucide-react';
import { saveLocalStudySession, deleteLocalStudySession, saveLocalStudyLog } from '../services/localDb';

export const STANDARD_SUBJECTS = [
  "Anatomy",
  "Physiology",
  "Biochemistry",
  "Pathology",
  "Microbiology",
  "Pharmacology",
  "Forensic Medicine",
  "Social and Preventive Medicine",
  "Ophthalmology",
  "ENT",
  "General Medicine",
  "General Surgery",
  "Obstetrics and Gynecology",
  "Pediatrics",
  "Psychiatry",
  "Dermatology",
  "Anesthesia",
  "Radiology",
  "Orthopedics"
];

export const MIXED_SUBJECT_TAG = "Mixed / All Subjects";

export const POPULAR_PLATFORMS = [
  "Marrow",
  "Pre-PG",
  "Cerebellum",
  "PrepLadder",
  "UWorld",
  "Amboss",
  "DAMS"
];

export default function UniversalQBankModal({
  isOpen,
  onClose,
  isDark = false,
  studyLogs = {},
  setStudyLogs,
  targetDate = null,
  initialMode = 'sprint', // 'sprint' | 'dayTotal'
  initialDuration = 0, // optional hours from timer
  initialQuestions = '',
  initialSubject = '',
  initialPlatform = '',
  onSprintSaved,
  onSprintDeleted
}) {
  // Format current local date string (YYYY-MM-DD)
  const activeDate = useMemo(() => {
    if (targetDate) return targetDate;
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
  }, [targetDate]);

  // Mode: 'sprint' or 'dayTotal'
  const [modalMode, setModalMode] = useState(initialMode || 'sprint');

  // Form State: Sprint Mode
  const [totalQs, setTotalQs] = useState(initialQuestions ? String(initialQuestions) : '');
  const [correctQs, setCorrectQs] = useState('');
  const [incorrectQs, setIncorrectQs] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [customSubjectInput, setCustomSubjectInput] = useState('');
  const [platformTag, setPlatformTag] = useState(initialPlatform || '');
  const [timestampStr, setTimestampStr] = useState('');
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const subjectDropdownRef = useRef(null);

  // Form State: Day Total Mode
  const [dayTotalQs, setDayTotalQs] = useState('');
  const [dayCorrectQs, setDayCorrectQs] = useState('');
  const [dayIncorrectQs, setDayIncorrectQs] = useState('');

  // Helper to generate current time with exact seconds
  const getSecondsTimestamp = () => {
    return new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  // Day log data
  const dayLog = useMemo(() => {
    return studyLogs[activeDate] || { questions: 0, correctQuestions: 0, incorrectQuestions: 0, sessions: [] };
  }, [studyLogs, activeDate]);

  const activeSessions = useMemo(() => {
    const rawSessions = Array.isArray(dayLog.sessions) ? dayLog.sessions : [];
    return rawSessions.filter(s => s && (s.questions > 0 || s.type === 'qbank'));
  }, [dayLog]);

  // Reset / initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      setModalMode(initialMode || 'sprint');
      setTimestampStr(getSecondsTimestamp());
      setEditingSessionId(null);
      setTotalQs(initialQuestions ? String(initialQuestions) : '');
      setCorrectQs('');
      setIncorrectQs('');
      
      let initSubs = [];
      if (Array.isArray(initialSubject) && initialSubject.length > 0) {
        initSubs = initialSubject;
      } else if (typeof initialSubject === 'string' && initialSubject.trim()) {
        initSubs = initialSubject.split(',').map(s => s.trim()).filter(Boolean);
      }
      setSelectedSubjects(initSubs);
      setIsSubjectDropdownOpen(false);
      setSubjectSearch('');
      setCustomSubjectInput('');
      setPlatformTag(initialPlatform || '');

      // Populate day total mode inputs
      setDayTotalQs(String(dayLog.questions || ''));
      setDayCorrectQs(String(dayLog.correctQuestions || ''));
      setDayIncorrectQs(String(dayLog.incorrectQuestions || ''));
    }
  }, [isOpen, initialMode, initialQuestions, initialSubject, initialPlatform, dayLog]);

  // Close subject dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (subjectDropdownRef.current && !subjectDropdownRef.current.contains(e.target)) {
        setIsSubjectDropdownOpen(false);
      }
    };
    if (isSubjectDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSubjectDropdownOpen]);

  // Multi-Subject Toggle Handlers
  const handleToggleSubject = (subName) => {
    if (subName === MIXED_SUBJECT_TAG) {
      if (selectedSubjects.includes(MIXED_SUBJECT_TAG)) {
        setSelectedSubjects([]);
      } else {
        setSelectedSubjects([MIXED_SUBJECT_TAG]);
      }
      return;
    }

    // Individual Subject Selected -> Deselect Mixed / All Subjects if active
    setSelectedSubjects(prev => {
      const withoutMixed = prev.filter(s => s !== MIXED_SUBJECT_TAG);
      if (withoutMixed.includes(subName)) {
        return withoutMixed.filter(s => s !== subName);
      } else {
        return [...withoutMixed, subName];
      }
    });
  };

  const handleRemoveSubject = (subName) => {
    setSelectedSubjects(prev => prev.filter(s => s !== subName));
  };

  const handleAddCustomSubject = () => {
    const trimmed = customSubjectInput.trim();
    if (!trimmed) return;
    if (!selectedSubjects.includes(trimmed)) {
      setSelectedSubjects(prev => [...prev.filter(s => s !== MIXED_SUBJECT_TAG), trimmed]);
    }
    setCustomSubjectInput('');
  };

  // Smart Auto-Calculation for Sprint Mode
  const handleTotalChange = (val) => {
    setTotalQs(val);
    if (val === '') return;

    const tNum = Math.max(0, parseInt(val, 10) || 0);

    // If user has already entered Correct:
    if (correctQs !== '') {
      const cNum = Math.max(0, parseInt(correctQs, 10) || 0);
      if (tNum >= cNum) {
        setIncorrectQs(String(tNum - cNum));
      } else {
        setCorrectQs(String(tNum));
        setIncorrectQs('0');
      }
    } else if (incorrectQs !== '') {
      const iNum = Math.max(0, parseInt(incorrectQs, 10) || 0);
      if (tNum >= iNum) {
        setCorrectQs(String(tNum - iNum));
      } else {
        setIncorrectQs(String(tNum));
        setCorrectQs('0');
      }
    }
  };

  const handleCorrectChange = (val) => {
    setCorrectQs(val);
    if (val === '') {
      if (totalQs !== '' && incorrectQs !== '') {
        setIncorrectQs('');
      }
      return;
    }

    const cNum = Math.max(0, parseInt(val, 10) || 0);

    // Case 1: Total is already set by user -> Total remains anchored!
    if (totalQs !== '') {
      const tNum = Math.max(0, parseInt(totalQs, 10) || 0);
      if (cNum > tNum) {
        setTotalQs(String(cNum));
        setIncorrectQs('0');
      } else {
        setIncorrectQs(String(tNum - cNum));
      }
    } else {
      // Case 2: Total is not set yet -> derive from Correct + Incorrect
      if (incorrectQs !== '') {
        const iNum = Math.max(0, parseInt(incorrectQs, 10) || 0);
        setTotalQs(String(cNum + iNum));
      }
    }
  };

  const handleIncorrectChange = (val) => {
    setIncorrectQs(val);
    if (val === '') {
      if (totalQs !== '' && correctQs !== '') {
        setCorrectQs('');
      }
      return;
    }

    const iNum = Math.max(0, parseInt(val, 10) || 0);

    // Case 1: Total is already set by user -> Total remains anchored!
    if (totalQs !== '') {
      const tNum = Math.max(0, parseInt(totalQs, 10) || 0);
      if (iNum > tNum) {
        setTotalQs(String(iNum));
        setCorrectQs('0');
      } else {
        setCorrectQs(String(tNum - iNum));
      }
    } else {
      // Case 2: Total is not set yet -> derive from Correct + Incorrect
      if (correctQs !== '') {
        const cNum = Math.max(0, parseInt(correctQs, 10) || 0);
        setTotalQs(String(cNum + iNum));
      }
    }
  };

  // Smart Auto-Calculation for Day Total Mode
  const handleDayTotalChange = (val) => {
    setDayTotalQs(val);
    if (val === '') return;

    const tNum = Math.max(0, parseInt(val, 10) || 0);
    if (dayCorrectQs !== '') {
      const cNum = Math.max(0, parseInt(dayCorrectQs, 10) || 0);
      if (tNum >= cNum) {
        setDayIncorrectQs(String(tNum - cNum));
      } else {
        setDayCorrectQs(String(tNum));
        setDayIncorrectQs('0');
      }
    } else if (dayIncorrectQs !== '') {
      const iNum = Math.max(0, parseInt(dayIncorrectQs, 10) || 0);
      if (tNum >= iNum) {
        setDayCorrectQs(String(tNum - iNum));
      } else {
        setDayIncorrectQs(String(tNum));
        setDayCorrectQs('0');
      }
    }
  };

  const handleDayCorrectChange = (val) => {
    setDayCorrectQs(val);
    if (val === '') {
      if (dayTotalQs !== '' && dayIncorrectQs !== '') {
        setDayIncorrectQs('');
      }
      return;
    }

    const cNum = Math.max(0, parseInt(val, 10) || 0);
    if (dayTotalQs !== '') {
      const tNum = Math.max(0, parseInt(dayTotalQs, 10) || 0);
      if (cNum > tNum) {
        setDayTotalQs(String(cNum));
        setDayIncorrectQs('0');
      } else {
        setDayIncorrectQs(String(tNum - cNum));
      }
    } else {
      if (dayIncorrectQs !== '') {
        const iNum = Math.max(0, parseInt(dayIncorrectQs, 10) || 0);
        setDayTotalQs(String(cNum + iNum));
      }
    }
  };

  const handleDayIncorrectChange = (val) => {
    setDayIncorrectQs(val);
    if (val === '') {
      if (dayTotalQs !== '' && dayCorrectQs !== '') {
        setDayCorrectQs('');
      }
      return;
    }

    const iNum = Math.max(0, parseInt(val, 10) || 0);
    if (dayTotalQs !== '') {
      const tNum = Math.max(0, parseInt(dayTotalQs, 10) || 0);
      if (iNum > tNum) {
        setDayTotalQs(String(iNum));
        setDayCorrectQs('0');
      } else {
        setDayCorrectQs(String(tNum - iNum));
      }
    } else {
      if (dayCorrectQs !== '') {
        const cNum = Math.max(0, parseInt(dayCorrectQs, 10) || 0);
        setDayTotalQs(String(cNum + iNum));
      }
    }
  };

  // Live Sprint Accuracy Calculation
  const sprintAccuracy = useMemo(() => {
    const c = Number(correctQs) || 0;
    const i = Number(incorrectQs) || 0;
    if (c + i === 0) return null;
    return Number(((c / (c + i)) * 100).toFixed(1));
  }, [correctQs, incorrectQs]);

  // Live Day Total Accuracy Calculation
  const dayAccuracy = useMemo(() => {
    const c = Number(dayCorrectQs) || 0;
    const i = Number(dayIncorrectQs) || 0;
    if (c + i === 0) return null;
    return Number(((c / (c + i)) * 100).toFixed(1));
  }, [dayCorrectQs, dayIncorrectQs]);

  // Load a sprint into editor
  const handleEditSprint = (session) => {
    setEditingSessionId(session.id);
    setTotalQs(String(session.questions || ''));
    setCorrectQs(session.correct !== undefined && session.correct !== null ? String(session.correct) : '');
    setIncorrectQs(session.incorrect !== undefined && session.incorrect !== null ? String(session.incorrect) : '');
    
    // Parse subjects: either array or comma-separated string
    let subs = [];
    if (Array.isArray(session.subjects) && session.subjects.length > 0) {
      subs = session.subjects;
    } else if (typeof session.subject === 'string' && session.subject.trim()) {
      subs = session.subject.split(',').map(s => s.trim()).filter(Boolean);
    }
    setSelectedSubjects(subs);
    setIsSubjectDropdownOpen(false);

    setPlatformTag(session.platform || session.source || '');
    setTimestampStr(session.timestamp || getSecondsTimestamp());
    setModalMode('sprint');
  };

  // Delete a sprint
  const handleDeleteSprint = async (sessionId) => {
    if (!sessionId) return;
    try {
      setIsSaving(true);
      const updatedLogs = await deleteLocalStudySession(activeDate, sessionId);
      if (setStudyLogs) {
        setStudyLogs(updatedLogs);
      }
      if (editingSessionId === sessionId) {
        setEditingSessionId(null);
        setTotalQs('');
        setCorrectQs('');
        setIncorrectQs('');
        setSelectedSubjects([]);
        setPlatformTag('');
      }
      if (onSprintDeleted) {
        onSprintDeleted(activeDate, sessionId);
      }
    } catch (err) {
      console.error("Error deleting session:", err);
      alert("Failed to delete sprint: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Save Sprint Action
  const handleSaveSprint = async () => {
    const qCount = Number(totalQs) || 0;
    if (qCount <= 0 && Number(correctQs) <= 0) {
      alert("Please enter a valid number of questions.");
      return;
    }

    try {
      setIsSaving(true);
      const nowIso = new Date().toISOString();
      const cCount = correctQs !== '' ? Number(correctQs) || 0 : null;
      const iCount = incorrectQs !== '' ? Number(incorrectQs) || 0 : null;
      const finalAccuracy = (cCount !== null && iCount !== null && (cCount + iCount) > 0)
        ? Number(((cCount / (cCount + iCount)) * 100).toFixed(1))
        : null;

      const subjectString = selectedSubjects.length > 0 ? selectedSubjects.join(', ') : undefined;

      const sessionItem = {
        id: editingSessionId || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: timestampStr || getSecondsTimestamp(),
        startedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        hours: Number(initialDuration || 0),
        questions: qCount,
        correct: cCount,
        incorrect: iCount,
        accuracy: finalAccuracy,
        subject: subjectString,
        subjects: selectedSubjects.length > 0 ? selectedSubjects : undefined,
        platform: platformTag.trim() || undefined,
        source: platformTag.trim() || undefined,
        type: 'qbank',
        isManual: true
      };

      const updatedLogs = await saveLocalStudySession(activeDate, sessionItem);
      if (setStudyLogs) {
        setStudyLogs(updatedLogs);
      }

      if (onSprintSaved) {
        onSprintSaved(activeDate, sessionItem);
      }

      // Reset fields
      setEditingSessionId(null);
      setTotalQs('');
      setCorrectQs('');
      setIncorrectQs('');
      setSelectedSubjects([]);
      setIsSubjectDropdownOpen(false);
      setPlatformTag('');
      setTimestampStr(getSecondsTimestamp());
      onClose();
    } catch (err) {
      console.error("Error saving sprint:", err);
      alert("Failed to save sprint: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Save Day Total Action
  const handleSaveDayTotal = async () => {
    const qCount = Number(dayTotalQs) || 0;
    const cCount = dayCorrectQs !== '' ? Number(dayCorrectQs) || 0 : null;
    const iCount = dayIncorrectQs !== '' ? Number(dayIncorrectQs) || 0 : null;
    const nowIso = new Date().toISOString();

    try {
      setIsSaving(true);
      const finalAccuracy = (cCount !== null && iCount !== null && (cCount + iCount) > 0)
        ? Number(((cCount / (cCount + iCount)) * 100).toFixed(1))
        : null;

      // Adjust or create a day-total adjustment session to guarantee multi-device sync parity
      const existingSessions = Array.isArray(dayLog.sessions) ? [...dayLog.sessions] : [];
      let updatedSessions = existingSessions;

      if (existingSessions.length === 0 && qCount > 0) {
        updatedSessions = [{
          id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          timestamp: getSecondsTimestamp(),
          startedAt: nowIso,
          updatedAt: nowIso,
          questions: qCount,
          correct: cCount,
          incorrect: iCount,
          accuracy: finalAccuracy,
          type: 'qbank',
          isManual: true
        }];
      }

      const updatedDayData = {
        ...dayLog,
        questions: qCount,
        totalQuestionsAttempted: qCount,
        correctQuestions: cCount !== null ? cCount : (dayLog.correctQuestions || 0),
        incorrectQuestions: iCount !== null ? iCount : (dayLog.incorrectQuestions || 0),
        accuracy: finalAccuracy !== null ? finalAccuracy : (dayLog.accuracy || null),
        sessions: updatedSessions,
        updatedAt: nowIso
      };

      await saveLocalStudyLog(activeDate, updatedDayData);
      if (setStudyLogs) {
        setStudyLogs(prev => ({
          ...prev,
          [activeDate]: updatedDayData
        }));
      }

      onClose();
    } catch (err) {
      console.error("Error updating day total:", err);
      alert("Failed to update day total: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[350] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
          {/* Modal Container: Bottom Sheet on Mobile, Centered Spring on Desktop */}
          <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 350, damping: 22, mass: 0.8 }}
            className={`w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden transition-all ${
              isDark ? 'neu-card-dark text-white border border-white/10' : 'neu-card-light text-slate-800 border border-slate-200/80'
            }`}
          >
          {/* Header Bar */}
          <div className="p-5 sm:p-6 pb-3 border-b border-slate-200/20 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-2xl ${isDark ? 'neu-pressed-dark text-amber-400' : 'neu-pressed-light text-amber-500'}`}>
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black uppercase tracking-wider flex items-center gap-2">
                  QBank Performance Manager
                </h3>
                <p className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  📅 {activeDate} • Seconds-Precision Logging
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-900'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Pill Switcher */}
          <div className="px-5 sm:px-6 pt-3 shrink-0">
            <div
              className={`relative flex items-center p-1 rounded-2xl w-full select-none transition-colors duration-300 ${
                isDark ? 'neu-pressed-dark border border-white/5 bg-[#181c22]' : 'neu-pressed-light border border-white/70 bg-slate-200/60'
              }`}
            >
              {/* Sliding Pill Indicator */}
              <div
                className="absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 shadow-md shadow-amber-500/20"
                style={{
                  left: modalMode === 'sprint' ? '0.25rem' : 'calc(50% + 0.125rem)',
                  transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
                }}
              />

              <button
                type="button"
                onClick={() => setModalMode('sprint')}
                className={`relative flex-1 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 z-10 transition-colors duration-300 ${
                  modalMode === 'sprint' ? 'text-white' : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>New Session / Sprint</span>
              </button>

              <button
                type="button"
                onClick={() => setModalMode('dayTotal')}
                className={`relative flex-1 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 z-10 transition-colors duration-300 ${
                  modalMode === 'dayTotal' ? 'text-white' : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Edit Day Total</span>
              </button>
            </div>
          </div>

          {/* Scrollable Content Body */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1" style={{ scrollbarWidth: 'none' }}>
            {modalMode === 'sprint' ? (
              <>
                {/* Sprint Time & Metadata Bar */}
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 font-mono font-bold text-[11px] text-amber-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Time: {timestampStr}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTimestampStr(getSecondsTimestamp())}
                    className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition ${
                      isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-200 text-slate-600'
                    }`}
                    title="Update to current second"
                  >
                    <RotateCcw className="w-3 h-3" /> Refresh Time
                  </button>
                </div>

                {/* 3-Field Smart Auto-Calculation Card */}
                <div className={`p-4 rounded-2xl space-y-3.5 border ${
                  isDark ? 'neu-pressed-dark border-white/5' : 'neu-pressed-light border-slate-200'
                }`}>
                  {/* Total Questions */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={`text-[9px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Total Questions Attempted
                      </label>
                      <span className="text-[8px] font-bold uppercase tracking-wider text-amber-500">
                        {correctQs && incorrectQs ? "Auto-Calculated" : "Direct Input / Anchor"}
                      </span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 50"
                      value={totalQs}
                      onChange={(e) => handleTotalChange(e.target.value)}
                      className={`w-full h-[42px] px-3.5 rounded-xl font-mono text-base font-black transition focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                        isDark ? 'bg-[#181c22] text-white border border-white/10' : 'bg-white text-slate-900 border border-slate-300'
                      }`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Correct */}
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1 text-emerald-500 mb-1">
                        <CheckCircle2 className="w-3 h-3" /> Correct (Right)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 38"
                        value={correctQs}
                        onChange={(e) => handleCorrectChange(e.target.value)}
                        className={`w-full h-[42px] px-3.5 rounded-xl font-mono text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                          isDark ? 'bg-[#181c22] text-emerald-400 border border-white/10' : 'bg-white text-emerald-600 border border-emerald-200'
                        }`}
                      />
                    </div>

                    {/* Incorrect */}
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1 text-rose-500 mb-1">
                        <XCircle className="w-3 h-3" /> Incorrect (Wrong)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 12"
                        value={incorrectQs}
                        onChange={(e) => handleIncorrectChange(e.target.value)}
                        className={`w-full h-[42px] px-3.5 rounded-xl font-mono text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-rose-500 ${
                          isDark ? 'bg-[#181c22] text-rose-400 border border-white/10' : 'bg-white text-rose-600 border border-rose-200'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Live Glowing Accuracy Badge */}
                  {sprintAccuracy !== null && (
                    <motion.div
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={`p-2.5 rounded-xl flex items-center justify-between text-xs font-black ${
                        sprintAccuracy >= 75
                          ? (isDark ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-emerald-50 text-emerald-700 border border-emerald-200')
                          : sprintAccuracy >= 60
                          ? (isDark ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-amber-50 text-amber-700 border border-amber-200')
                          : (isDark ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-rose-50 text-rose-700 border border-rose-200')
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Award className="w-4 h-4" />
                        <span>Accuracy: {sprintAccuracy}%</span>
                      </div>
                      <span className="text-[9px] uppercase tracking-wider font-extrabold">
                        {sprintAccuracy >= 75 ? "Target Mastery Zone" : sprintAccuracy >= 60 ? "Retention Zone" : "Weak Spot Alert"}
                      </span>
                    </motion.div>
                  )}
                </div>

                {/* Multi-Select Subject & Platform Selector */}
                <div className="space-y-3">
                  {/* Subject Multi-Select Combobox */}
                  <div className="relative" ref={subjectDropdownRef}>
                    <div className="flex items-center justify-between mb-1">
                      <label className={`text-[9px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Subjects / Topics (Multi-Select)
                      </label>
                      {selectedSubjects.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedSubjects([])}
                          className="text-[8.5px] font-bold text-rose-400 hover:text-rose-500 hover:underline cursor-pointer"
                        >
                          Clear All
                        </button>
                      )}
                    </div>

                    {/* Trigger Button */}
                    <button
                      type="button"
                      onClick={() => setIsSubjectDropdownOpen(prev => !prev)}
                      className={`w-full min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-between gap-2 border text-left cursor-pointer ${
                        isDark ? 'bg-[#181c22] text-white border-white/10 hover:border-amber-500/50' : 'bg-white text-slate-800 border-slate-300 hover:border-amber-500/60'
                      } ${isSubjectDropdownOpen ? 'ring-2 ring-amber-500' : ''}`}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <Tag className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        {selectedSubjects.length === 0 ? (
                          <span className="text-slate-400 text-xs font-medium">Select Subject(s)...</span>
                        ) : selectedSubjects.includes(MIXED_SUBJECT_TAG) ? (
                          <span className="text-amber-400 font-extrabold flex items-center gap-1 text-xs">
                            🌟 Mixed / All Subjects
                          </span>
                        ) : (
                          <span className="text-xs font-black text-amber-500">
                            {selectedSubjects.length} Subject{selectedSubjects.length > 1 ? 's' : ''} Selected
                          </span>
                        )}
                      </div>
                      <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isSubjectDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Removable Subject Chips */}
                    {selectedSubjects.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {selectedSubjects.map(sub => (
                          <span
                            key={sub}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold transition ${
                              sub === MIXED_SUBJECT_TAG
                                ? (isDark ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' : 'bg-amber-100 text-amber-800 border border-amber-300')
                                : (isDark ? 'bg-slate-800 text-slate-200 border border-slate-700 hover:border-amber-500/40' : 'bg-slate-100 text-slate-800 border border-slate-300 hover:border-amber-400')
                            }`}
                          >
                            {sub === MIXED_SUBJECT_TAG && <span>🌟</span>}
                            <span>{sub}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveSubject(sub);
                              }}
                              className="hover:text-rose-400 cursor-pointer ml-0.5"
                              title={`Remove ${sub}`}
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Dropdown Menu Popup */}
                    <AnimatePresence>
                      {isSubjectDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                          className={`absolute left-0 right-0 top-full mt-1.5 z-[100] rounded-2xl shadow-2xl border p-2.5 max-h-64 flex flex-col gap-2 ${
                            isDark ? 'bg-[#181c22] border-white/10 shadow-black/80' : 'bg-white border-slate-200 shadow-slate-400/40'
                          }`}
                        >
                          {/* Search Filter Input */}
                          <div className="relative shrink-0">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Search subjects (e.g. Pharma)..."
                              value={subjectSearch}
                              onChange={(e) => setSubjectSearch(e.target.value)}
                              className={`w-full h-8 pl-8 pr-2.5 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                                isDark ? 'bg-slate-900/80 text-white placeholder-slate-500 border border-white/10' : 'bg-slate-50 text-slate-900 placeholder-slate-400 border border-slate-200'
                              }`}
                            />
                          </div>

                          {/* Scrollable Options List */}
                          <div className="overflow-y-auto space-y-1 pr-1" style={{ scrollbarWidth: 'thin' }}>
                            {/* Pinned: Mixed / All Subjects Option */}
                            {(!subjectSearch || MIXED_SUBJECT_TAG.toLowerCase().includes(subjectSearch.toLowerCase())) && (
                              <div
                                onClick={() => handleToggleSubject(MIXED_SUBJECT_TAG)}
                                className={`px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center justify-between cursor-pointer transition select-none ${
                                  selectedSubjects.includes(MIXED_SUBJECT_TAG)
                                    ? (isDark ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40' : 'bg-amber-100 text-amber-900 border border-amber-300')
                                    : (isDark ? 'hover:bg-slate-800 text-amber-400/90' : 'hover:bg-amber-50 text-amber-700')
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span>🌟</span>
                                  <span>{MIXED_SUBJECT_TAG}</span>
                                </div>
                                {selectedSubjects.includes(MIXED_SUBJECT_TAG) && (
                                  <Check className="w-3.5 h-3.5 text-amber-500 stroke-[3]" />
                                )}
                              </div>
                            )}

                            {/* Standard 19 Medical Subjects */}
                            {STANDARD_SUBJECTS.filter(s =>
                              !subjectSearch || s.toLowerCase().includes(subjectSearch.toLowerCase())
                            ).map((subName) => {
                              const isChecked = selectedSubjects.includes(subName);
                              return (
                                <div
                                  key={subName}
                                  onClick={() => handleToggleSubject(subName)}
                                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer transition select-none ${
                                    isChecked
                                      ? (isDark ? 'bg-amber-500/20 text-white font-extrabold' : 'bg-amber-50 text-slate-900 font-extrabold')
                                      : (isDark ? 'hover:bg-slate-800/80 text-slate-300' : 'hover:bg-slate-100 text-slate-700')
                                  }`}
                                >
                                  <span className="truncate">{subName}</span>
                                  <div className={`w-4 h-4 rounded flex items-center justify-center border transition ${
                                    isChecked
                                      ? 'bg-amber-500 border-amber-500 text-white'
                                      : (isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white')
                                  }`}>
                                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Custom Subject Adder */}
                          <div className="pt-2 border-t border-white/10 shrink-0 flex items-center gap-1.5">
                            <input
                              type="text"
                              placeholder="+ Add Custom Subject..."
                              value={customSubjectInput}
                              onChange={(e) => setCustomSubjectInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddCustomSubject();
                                }
                              }}
                              className={`flex-1 h-7 px-2.5 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                                isDark ? 'bg-slate-900 text-white border border-white/10' : 'bg-slate-50 text-slate-900 border border-slate-200'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={handleAddCustomSubject}
                              disabled={!customSubjectInput.trim()}
                              className="px-2.5 h-7 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-30 text-white text-[10px] font-black uppercase tracking-wider cursor-pointer"
                            >
                              Add
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Platform / Source Tag & Quick-Pills */}
                  <div>
                    <label className={`text-[9px] font-black uppercase tracking-wider block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Platform / Question Bank Source
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Marrow / Pre-PG / UWorld"
                      value={platformTag}
                      onChange={(e) => setPlatformTag(e.target.value)}
                      className={`w-full h-[38px] px-3 rounded-xl text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                        isDark ? 'bg-[#181c22] text-white border border-white/10' : 'bg-white text-slate-800 border border-slate-300'
                      }`}
                    />
                    {/* Quick Platform Select Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className={`text-[8px] font-black uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Quick:</span>
                      {POPULAR_PLATFORMS.map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPlatformTag(p)}
                          className={`px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider transition cursor-pointer ${
                            platformTag === p
                              ? 'bg-amber-500 text-white shadow-xs'
                              : (isDark ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Save Sprint Button */}
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveSprint}
                  className="w-full h-[44px] rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>{editingSessionId ? "Update Sprint" : "Log Sprint (+)"}</span>
                </button>

                {/* Today's Logged Sprints Timeline */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Today's Sprints ({activeSessions.length})
                    </span>
                    <span className="text-[9px] font-bold text-amber-500 font-mono">
                      Sum: {activeSessions.reduce((s, x) => s + (Number(x.questions) || 0), 0)} Qs
                    </span>
                  </div>

                  {activeSessions.length === 0 ? (
                    <div className={`p-4 rounded-2xl text-center text-xs font-bold border border-dashed ${
                      isDark ? 'border-white/10 text-slate-500' : 'border-slate-300 text-slate-400'
                    }`}>
                      No sprints logged for this date yet.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-44 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                      {activeSessions.map((sess) => (
                        <div
                          key={sess.id}
                          className={`p-3 rounded-2xl flex items-center justify-between transition border ${
                            editingSessionId === sess.id
                              ? 'border-amber-500 bg-amber-500/10'
                              : (isDark ? 'bg-[#181c22]/70 border-white/5 hover:border-white/20' : 'bg-white border-slate-200 hover:border-slate-300')
                          }`}
                        >
                          <div className="text-left space-y-1 min-w-0 flex-1 mr-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-black text-amber-500">
                                {sess.questions} Qs
                              </span>
                              <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {sess.timestamp || 'N/A'}
                              </span>
                              {/* Subject Badge */}
                              {((Array.isArray(sess.subjects) && sess.subjects.length > 0) || sess.subject) && (
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-md truncate max-w-[150px] border ${
                                  (sess.subjects?.includes(MIXED_SUBJECT_TAG) || sess.subject?.includes(MIXED_SUBJECT_TAG))
                                    ? (isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-amber-100 text-amber-800 border-amber-300')
                                    : (isDark ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200')
                                }`}>
                                  {(sess.subjects?.includes(MIXED_SUBJECT_TAG) || sess.subject?.includes(MIXED_SUBJECT_TAG)) && "🌟 "}
                                  {Array.isArray(sess.subjects) && sess.subjects.length > 0 ? sess.subjects.join(', ') : sess.subject}
                                </span>
                              )}
                              {sess.platform && (
                                <span className="text-[8.5px] font-extrabold text-slate-400 font-mono">
                                  [{sess.platform}]
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-bold">
                              {sess.correct !== undefined && sess.correct !== null && (
                                <span className="text-emerald-500 font-mono">🟢 {sess.correct}C</span>
                              )}
                              {sess.incorrect !== undefined && sess.incorrect !== null && (
                                <span className="text-rose-500 font-mono">🔴 {sess.incorrect}W</span>
                              )}
                              {sess.accuracy !== undefined && sess.accuracy !== null && (
                                <span className={`font-mono font-black ${
                                  sess.accuracy >= 75 ? 'text-emerald-400' : sess.accuracy >= 60 ? 'text-amber-400' : 'text-rose-400'
                                }`}>
                                  ({sess.accuracy}%)
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditSprint(sess)}
                              className={`p-1.5 rounded-lg transition ${
                                isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-amber-400' : 'hover:bg-slate-100 text-slate-500 hover:text-amber-600'
                              }`}
                              title="Edit sprint"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSprint(sess.id)}
                              className={`p-1.5 rounded-lg transition ${
                                isDark ? 'hover:bg-rose-950/40 text-slate-400 hover:text-rose-400' : 'hover:bg-rose-50 text-slate-500 hover:text-rose-600'
                              }`}
                              title="Delete sprint"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Mode 2: Edit Day Total */
              <div className="space-y-4">
                <div className={`p-4 rounded-2xl border ${
                  isDark ? 'neu-pressed-dark border-white/5' : 'neu-pressed-light border-slate-200'
                }`}>
                  <p className={`text-[11px] font-bold mb-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Directly override or adjust the entire day's question and accuracy totals.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-wider block mb-1 text-amber-500">
                        Total Questions for {activeDate}
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Total questions, e.g. 100"
                        value={dayTotalQs}
                        onChange={(e) => handleDayTotalChange(e.target.value)}
                        className={`w-full h-[42px] px-3.5 rounded-xl font-mono text-base font-black transition focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                          isDark ? 'bg-[#181c22] text-white border border-white/10' : 'bg-white text-slate-900 border border-slate-300'
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1 text-emerald-500 mb-1">
                          <CheckCircle2 className="w-3 h-3" /> Correct (Right)
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="e.g. 80"
                          value={dayCorrectQs}
                          onChange={(e) => handleDayCorrectChange(e.target.value)}
                          className={`w-full h-[42px] px-3.5 rounded-xl font-mono text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                            isDark ? 'bg-[#181c22] text-emerald-400 border border-white/10' : 'bg-white text-emerald-600 border border-emerald-200'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1 text-rose-500 mb-1">
                          <XCircle className="w-3 h-3" /> Incorrect (Wrong)
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="e.g. 20"
                          value={dayIncorrectQs}
                          onChange={(e) => handleDayIncorrectChange(e.target.value)}
                          className={`w-full h-[42px] px-3.5 rounded-xl font-mono text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-rose-500 ${
                            isDark ? 'bg-[#181c22] text-rose-400 border border-white/10' : 'bg-white text-rose-600 border border-rose-200'
                          }`}
                        />
                      </div>
                    </div>

                    {dayAccuracy !== null && (
                      <div className={`p-2.5 rounded-xl flex items-center justify-between text-xs font-black ${
                        dayAccuracy >= 75
                          ? (isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-50 text-emerald-700')
                          : dayAccuracy >= 60
                          ? (isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-50 text-amber-700')
                          : (isDark ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-50 text-rose-700')
                      }`}>
                        <span>Overall Day Accuracy: {dayAccuracy}%</span>
                        <span className="text-[9px] uppercase tracking-wider">
                          {dayAccuracy >= 75 ? "🟢 Mastery" : dayAccuracy >= 60 ? "🟡 Good" : "🔴 Review"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveDayTotal}
                  className="w-full h-[44px] rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Update Day Total</span>
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);
}

import React, { useState, useEffect, useMemo } from 'react';
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
  RotateCcw
} from 'lucide-react';
import { saveLocalStudySession, deleteLocalStudySession, saveLocalStudyLog } from '../services/localDb';

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
  const [subjectTag, setSubjectTag] = useState(initialSubject || '');
  const [platformTag, setPlatformTag] = useState(initialPlatform || '');
  const [timestampStr, setTimestampStr] = useState('');
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

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
      setSubjectTag(initialSubject || '');
      setPlatformTag(initialPlatform || '');

      // Populate day total mode inputs
      setDayTotalQs(String(dayLog.questions || ''));
      setDayCorrectQs(String(dayLog.correctQuestions || ''));
      setDayIncorrectQs(String(dayLog.incorrectQuestions || ''));
    }
  }, [isOpen, initialMode, initialQuestions, initialSubject, initialPlatform, dayLog]);

  // Smart Auto-Calculation for Sprint Mode
  const handleCorrectChange = (val) => {
    setCorrectQs(val);
    const cNum = Number(val) || 0;
    const iNum = Number(incorrectQs) || 0;
    if (val !== '' && incorrectQs !== '') {
      setTotalQs(String(cNum + iNum));
    } else if (val !== '' && totalQs !== '') {
      const tNum = Number(totalQs) || 0;
      if (tNum >= cNum) {
        setIncorrectQs(String(tNum - cNum));
      }
    }
  };

  const handleIncorrectChange = (val) => {
    setIncorrectQs(val);
    const iNum = Number(val) || 0;
    const cNum = Number(correctQs) || 0;
    if (val !== '' && correctQs !== '') {
      setTotalQs(String(cNum + iNum));
    } else if (val !== '' && totalQs !== '') {
      const tNum = Number(totalQs) || 0;
      if (tNum >= iNum) {
        setCorrectQs(String(tNum - iNum));
      }
    }
  };

  const handleTotalChange = (val) => {
    setTotalQs(val);
    const tNum = Number(val) || 0;
    const cNum = Number(correctQs) || 0;
    if (val !== '' && correctQs !== '' && tNum >= cNum) {
      setIncorrectQs(String(tNum - cNum));
    }
  };

  // Smart Auto-Calculation for Day Total Mode
  const handleDayCorrectChange = (val) => {
    setDayCorrectQs(val);
    const cNum = Number(val) || 0;
    const iNum = Number(dayIncorrectQs) || 0;
    if (val !== '' && dayIncorrectQs !== '') {
      setDayTotalQs(String(cNum + iNum));
    } else if (val !== '' && dayTotalQs !== '') {
      const tNum = Number(dayTotalQs) || 0;
      if (tNum >= cNum) {
        setDayIncorrectQs(String(tNum - cNum));
      }
    }
  };

  const handleDayIncorrectChange = (val) => {
    setDayIncorrectQs(val);
    const iNum = Number(val) || 0;
    const cNum = Number(dayCorrectQs) || 0;
    if (val !== '' && dayCorrectQs !== '') {
      setDayTotalQs(String(cNum + iNum));
    } else if (val !== '' && dayTotalQs !== '') {
      const tNum = Number(dayTotalQs) || 0;
      if (tNum >= iNum) {
        setDayCorrectQs(String(tNum - iNum));
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
    setSubjectTag(session.subject || '');
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
        subject: subjectTag.trim() || undefined,
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
      setSubjectTag('');
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

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
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

                  {/* Total Questions */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={`text-[9px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Total Questions Attempted
                      </label>
                      <span className="text-[8px] font-bold uppercase tracking-wider text-amber-500">
                        {correctQs && incorrectQs ? "Auto-Calculated" : "Direct Input"}
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

                {/* Optional Subject & Platform Tags */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`text-[9px] font-black uppercase tracking-wider block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Subject (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Pharmacology"
                      value={subjectTag}
                      onChange={(e) => setSubjectTag(e.target.value)}
                      className={`w-full h-[38px] px-3 rounded-xl text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                        isDark ? 'bg-[#181c22] text-white border border-white/10' : 'bg-white text-slate-800 border border-slate-300'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-[9px] font-black uppercase tracking-wider block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Platform / Source
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Marrow / UWorld"
                      value={platformTag}
                      onChange={(e) => setPlatformTag(e.target.value)}
                      className={`w-full h-[38px] px-3 rounded-xl text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                        isDark ? 'bg-[#181c22] text-white border border-white/10' : 'bg-white text-slate-800 border border-slate-300'
                      }`}
                    />
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
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-black text-amber-500">
                                {sess.questions} Qs
                              </span>
                              <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {sess.timestamp || 'N/A'}
                              </span>
                              {sess.subject && (
                                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded truncate max-w-[90px] ${
                                  isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {sess.subject}
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
                        onChange={(e) => setDayTotalQs(e.target.value)}
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
    </AnimatePresence>
  );
}

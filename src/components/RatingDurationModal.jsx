import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Sparkles, CheckCircle2, X, Timer, Zap } from 'lucide-react';
import { formatPredictedDuration } from '../services/predictiveTimingEngine';

const QUICK_PRESETS = [
  { label: '5m', mins: 5 },
  { label: '10m', mins: 10 },
  { label: '15m', mins: 15 },
  { label: '20m', mins: 20 },
  { label: '30m', mins: 30 },
  { label: '45m', mins: 45 },
  { label: '1h', mins: 60 },
  { label: '1.5h', mins: 90 }
];

export default function RatingDurationModal({
  isOpen,
  onClose,
  onSkip,
  onSubmit,
  onConfirm,
  topic,
  rating,
  predictedMinutes = 15,
  suggestedMinutes = 15,
  elapsedSessionSeconds = 0,
  timerState = null,
  themeMode = 'dark',
  isDark: isDarkProp = undefined
}) {
  if (!isOpen) return null;

  const isDark = isDarkProp !== undefined ? isDarkProp : themeMode === 'dark';
  const effectivePredicted = predictedMinutes || suggestedMinutes || 10;

  // Seed default minutes from elapsed timer or engine prediction
  const initialMins = elapsedSessionSeconds > 60
    ? Math.max(1, Math.round(elapsedSessionSeconds / 60))
    : effectivePredicted;

  const initialHours = Math.floor(initialMins / 60);
  const initialRemainingMins = initialMins % 60;

  const [hours, setHours] = useState(initialHours);
  const [minutes, setMinutes] = useState(initialRemainingMins);
  const [selectedPreset, setSelectedPreset] = useState(null);

  // Sync initial values on open
  useEffect(() => {
    if (isOpen) {
      const mins = elapsedSessionSeconds > 60
        ? Math.max(1, Math.round(elapsedSessionSeconds / 60))
        : effectivePredicted;
      setHours(Math.floor(mins / 60));
      setMinutes(mins % 60);
      setSelectedPreset(null);
    }
  }, [isOpen, effectivePredicted, elapsedSessionSeconds]);

  const totalCalculatedMins = (parseInt(hours, 10) || 0) * 60 + (parseInt(minutes, 10) || 0);

  const handleSelectPreset = (presetMins) => {
    setSelectedPreset(presetMins);
    setHours(Math.floor(presetMins / 60));
    setMinutes(presetMins % 60);
  };

  const handleUseStopwatch = () => {
    if (elapsedSessionSeconds <= 0) return;
    const mins = Math.max(1, Math.round(elapsedSessionSeconds / 60));
    setHours(Math.floor(mins / 60));
    setMinutes(mins % 60);
    setSelectedPreset(null);
  };

  const handleUseSuggested = () => {
    if (!effectivePredicted) return;
    setHours(Math.floor(effectivePredicted / 60));
    setMinutes(effectivePredicted % 60);
    setSelectedPreset(null);
  };

  const handleConfirm = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const finalMins = Math.max(1, totalCalculatedMins || effectivePredicted || 10);
    if (typeof onSubmit === 'function') {
      onSubmit(finalMins);
    } else if (typeof onConfirm === 'function') {
      onConfirm(finalMins);
    }
  };

  const handleSkipOrClose = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (typeof onSkip === 'function') {
      onSkip();
    } else if (typeof onClose === 'function') {
      onClose();
    }
  };

  const ratingBadges = {
    1: { label: 'Again (1)', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
    2: { label: 'Hard (2)', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    3: { label: 'Good (3)', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    4: { label: 'Easy (4)', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' }
  };

  const currentBadge = ratingBadges[rating] || { label: `Rating ${rating || ''}`, color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' };

  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overscroll-contain touch-pan-y"
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={handleSkipOrClose}
        className="absolute inset-0 bg-black/75 transition-opacity"
      />

      {/* Modal Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className={`relative w-full max-w-md rounded-3xl p-6 shadow-2xl border flex flex-col gap-5 ${
          isDark
            ? 'bg-[#222730] text-slate-100 border-slate-700/80 neu-card-dark'
            : 'bg-[#e6ecf5] text-slate-900 border-white/80 neu-card-light'
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${isDark ? 'bg-indigo-500/20 text-indigo-400 neu-pressed-dark' : 'bg-indigo-100 text-indigo-700 neu-pressed-light'}`}>
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight flex items-center gap-2">
                <span>Study Duration</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-black uppercase tracking-wider ${currentBadge.color}`}>
                  {currentBadge.label}
                </span>
              </h3>
              <p className={`text-xs font-semibold truncate max-w-[240px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {topic?.name || 'Topic Session'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSkipOrClose}
            className={`p-2 rounded-xl transition-all active:scale-95 cursor-pointer ${
              isDark ? 'hover:bg-slate-700/50 text-slate-400 hover:text-white' : 'hover:bg-slate-300/60 text-slate-600 hover:text-slate-900'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Question Prompt */}
        <div className={`p-3.5 rounded-2xl border text-xs font-medium ${
          isDark ? 'bg-slate-900/40 border-slate-700/60 text-slate-300' : 'bg-white/80 border-slate-200 text-slate-700 neu-pressed-light'
        }`}>
          How long did this topic take you to study/review?
        </div>

        {/* Suggested & Stopwatch Shortcuts */}
        <div className="flex items-center gap-2 flex-wrap">
          {predictedMinutes > 0 && (
            <button
              type="button"
              onClick={handleUseSuggested}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border active:scale-95 ${
                isDark
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/30 hover:bg-purple-500/25'
                  : 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Suggested: {formatPredictedDuration(predictedMinutes)}</span>
            </button>
          )}

          {elapsedSessionSeconds > 30 && (
            <button
              type="button"
              onClick={handleUseStopwatch}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border active:scale-95 ${
                isDark
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200'
              }`}
            >
              <Timer className="w-3.5 h-3.5 text-emerald-400" />
              <span>Card Timer: {Math.max(1, Math.round(elapsedSessionSeconds / 60))}m</span>
            </button>
          )}
        </div>

        {/* Quick Presets Grid */}
        <div className="space-y-1.5">
          <label className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Quick Presets
          </label>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_PRESETS.map(preset => {
              const isSelected = selectedPreset === preset.mins || totalCalculatedMins === preset.mins;
              return (
                <button
                  key={preset.mins}
                  type="button"
                  onClick={() => handleSelectPreset(preset.mins)}
                  className={`py-2 rounded-xl text-xs font-black transition-all duration-150 active:scale-95 cursor-pointer border ${
                    isSelected
                      ? isDark
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-md scale-105'
                        : 'bg-indigo-600 text-white border-indigo-500 shadow-md scale-105'
                      : isDark
                        ? 'neu-btn-dark text-slate-300 border-slate-700/60 hover:text-white'
                        : 'neu-btn-light text-slate-700 border-white/80 hover:text-slate-900'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Hours & Minutes Inputs */}
        <form onSubmit={handleConfirm} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Hours Input */}
            <div className="space-y-1">
              <label className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Hours
              </label>
              <input
                type="number"
                min="0"
                max="24"
                value={hours === 0 ? '' : hours}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setHours(0);
                  } else {
                    const val = parseInt(raw, 10);
                    setHours(isNaN(val) ? 0 : Math.max(0, Math.min(24, val)));
                  }
                  setSelectedPreset(null);
                }}
                placeholder="0"
                className={`w-full py-2.5 px-3 rounded-2xl text-base font-black text-center border focus:outline-none transition-all ${
                  isDark
                    ? 'neu-pressed-dark bg-[#1c2027] border-slate-700/80 text-white focus:border-indigo-500'
                    : 'neu-pressed-light bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                }`}
              />
            </div>

            {/* Minutes Input */}
            <div className="space-y-1">
              <label className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Minutes
              </label>
              <input
                type="number"
                min="0"
                max="999"
                value={minutes === 0 ? '' : minutes}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setMinutes(0);
                  } else {
                    const val = parseInt(raw, 10);
                    if (isNaN(val) || val < 0) {
                      setMinutes(0);
                    } else if (val >= 60 && hours === 0) {
                      setHours(Math.floor(val / 60));
                      setMinutes(val % 60);
                    } else {
                      setMinutes(val);
                    }
                  }
                  setSelectedPreset(null);
                }}
                placeholder="0"
                className={`w-full py-2.5 px-3 rounded-2xl text-base font-black text-center border focus:outline-none transition-all ${
                  isDark
                    ? 'neu-pressed-dark bg-[#1c2027] border-slate-700/80 text-white focus:border-indigo-500'
                    : 'neu-pressed-light bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                }`}
              />
            </div>
          </div>

          {/* Action Buttons Footer */}
          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleSkipOrClose}
              className={`py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer border ${
                isDark
                  ? 'neu-btn-dark text-slate-400 border-slate-700/60 hover:text-white'
                  : 'neu-btn-light text-slate-600 border-slate-300 hover:text-slate-900'
              }`}
            >
              Skip
            </button>

            <button
              type="submit"
              className="py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-indigo-500/25 border border-indigo-400/40 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>Confirm ({totalCalculatedMins > 0 ? totalCalculatedMins : effectivePredicted}m)</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}

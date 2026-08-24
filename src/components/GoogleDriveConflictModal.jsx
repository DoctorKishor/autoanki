import React, { useEffect } from 'react';
import {
  Cloud, HardDrive, AlertTriangle, ShieldCheck, X, Sparkles,
  GitMerge, Layers, FileText, Clock, BookOpen, Calendar, Activity, Settings, CheckCircle2, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const CATEGORY_ICONS = {
  Layers,
  FileText,
  Clock,
  BookOpen,
  Calendar,
  Activity,
  Settings
};

export default function GoogleDriveConflictModal({
  isOpen,
  conflictData,
  onResolve,
  themeMode = 'light'
}) {
  useEffect(() => {
    if (!isOpen || !conflictData) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onResolve('cancel');
      } else if (e.key === '1' || e.key === 'm') {
        onResolve('merge');
      } else if (e.key === '2' || e.key === 'u') {
        onResolve('upload');
      } else if (e.key === '3' || e.key === 'd') {
        onResolve('download');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, conflictData, onResolve]);

  if (!isOpen || !conflictData) return null;

  const isDark = themeMode === 'dark';
  const { local, remote, diffDetails } = conflictData;

  const formatTimestamp = (ts) => {
    if (!ts) return 'Unknown';
    try {
      const d = new Date(ts);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return String(ts);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onResolve('cancel');
    }
  };

  const localTime = new Date(local?.timestamp || 0).getTime();
  const remoteTime = new Date(remote?.timestamp || 0).getTime();
  const isLocalNewer = localTime > remoteTime;
  const isRemoteNewer = remoteTime > localTime;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md overflow-y-auto"
        onClick={handleBackdropClick}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className={`w-full max-w-2xl rounded-3xl p-5 sm:p-7 shadow-2xl border my-auto ${
            isDark
              ? 'neu-card-dark border-gray-800 text-white'
              : 'neu-card-light border-gray-200/80 text-gray-900'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-gray-500/10 mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 sm:p-3 rounded-2xl ${isDark ? 'neu-pressed-dark text-amber-400' : 'neu-pressed-light text-amber-600'}`}>
                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                  Sync Conflict Detected
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Different Device
                  </span>
                </h3>
                <p className={`text-[11px] sm:text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Changes were saved on another device. Compare the versions below to choose how to proceed.
                </p>
              </div>
            </div>
            <button
              onClick={() => onResolve('cancel')}
              className={`p-2 rounded-xl transition cursor-pointer ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-200 text-gray-600'}`}
              title="Cancel sync"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Actionable Recommendation Banner */}
          {diffDetails?.recommendationText && (
            <div className={`p-3.5 rounded-2xl border mb-4 flex items-start gap-2.5 text-xs leading-relaxed ${
              isDark
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-black text-[11px] uppercase tracking-wider text-emerald-400">
                  {diffDetails.timeDiffText || 'Recommendation'}
                </div>
                <div className="text-[11px] font-medium">
                  {diffDetails.recommendationText}
                </div>
              </div>
            </div>
          )}

          {/* Comparison Cards Grid (Side-by-Side) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {/* Local Version Card */}
            <div className={`p-4 rounded-2xl border transition relative overflow-hidden ${
              isDark ? 'neu-pressed-dark border-blue-500/30' : 'neu-pressed-light border-blue-200'
            }`}>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-black uppercase tracking-wider text-blue-500">Local Device</span>
                </div>
                {isLocalNewer && (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                    Newer Version
                  </span>
                )}
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-500/10">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Flashcards</span>
                  <span className="font-mono font-bold">{local?.cardsCount ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-500/10">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Scanned Pages</span>
                  <span className="font-mono font-bold">{local?.pagesCount ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-500/10">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Curriculum Topics</span>
                  <span className="font-mono font-bold">{local?.topicsCount ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-500/10">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Study Log Days</span>
                  <span className="font-mono font-bold">{local?.logsDaysCount ?? 0}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Last Modified</span>
                  <span className="font-mono font-bold text-[10px]">{formatTimestamp(local?.timestamp)}</span>
                </div>
              </div>
            </div>

            {/* Cloud Version Card */}
            <div className={`p-4 rounded-2xl border transition relative overflow-hidden ${
              isDark ? 'neu-pressed-dark border-purple-500/30' : 'neu-pressed-light border-purple-200'
            }`}>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-black uppercase tracking-wider text-purple-500">Google Drive Cloud</span>
                </div>
                {isRemoteNewer && (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">
                    Newer Version
                  </span>
                )}
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-500/10">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Flashcards</span>
                  <span className="font-mono font-bold">{remote?.cardsCount ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-500/10">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Scanned Pages</span>
                  <span className="font-mono font-bold">{remote?.pagesCount ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-500/10">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Curriculum Topics</span>
                  <span className="font-mono font-bold">{remote?.topicsCount ?? 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-500/10">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Study Log Days</span>
                  <span className="font-mono font-bold">{remote?.logsDaysCount ?? 0}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Last Modified</span>
                  <span className="font-mono font-bold text-[10px]">{formatTimestamp(remote?.timestamp)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Granular What Changed List */}
          {diffDetails?.bundleDifferences && diffDetails.bundleDifferences.length > 0 && (
            <div className={`p-4 rounded-2xl border mb-4 ${
              isDark ? 'neu-pressed-dark border-gray-800' : 'neu-pressed-light border-gray-200'
            }`}>
              <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-500" /> Specific Changes Between Devices
              </div>
              <div className="space-y-2">
                {diffDetails.bundleDifferences.map((item, idx) => {
                  const IconComponent = CATEGORY_ICONS[item.icon] || Layers;
                  return (
                    <div key={idx} className="flex items-start gap-2.5 text-xs py-1 border-b border-gray-500/10 last:border-0">
                      <div className="p-1 rounded-lg bg-blue-500/10 text-blue-400 shrink-0 mt-0.5">
                        <IconComponent className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold">{item.title}</span>
                          {item.badge && (
                            <span className={`text-[9px] font-bold px-2 py-0.2 rounded-md ${
                              item.badgeType === 'warning'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }`}>
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className={`text-[11px] leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                          {item.diffSummary}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Safety Notice */}
          <div className={`flex items-start gap-2 p-3 rounded-xl mb-4 text-[11px] ${
            isDark ? 'bg-blue-950/30 text-blue-300 border border-blue-800/30' : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}>
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
            <span>
              <strong>Zero-Loss Protection:</strong> Resolving will automatically create a local snapshot in your internal vault before applying changes.
            </span>
          </div>

          {/* Action Buttons (3 Choices + Cancel) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* 1. Smart Merge (Recommended) */}
            <button
              onClick={() => onResolve('merge')}
              className="py-3 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/25 hover:opacity-95 cursor-pointer"
            >
              <GitMerge className="w-4 h-4" />
              <span>Smart Merge</span>
            </button>

            {/* 2. Upload Local */}
            <button
              onClick={() => onResolve('upload')}
              className={`py-3 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${
                isDark ? 'neu-btn-dark text-blue-400 hover:text-white' : 'neu-btn-light text-blue-700 hover:text-blue-900'
              }`}
              title="Overwrite Google Drive Cloud with this device's collection"
            >
              <HardDrive className="w-4 h-4" />
              <span>Upload Local</span>
            </button>

            {/* 3. Download Cloud */}
            <button
              onClick={() => onResolve('download')}
              className={`py-3 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${
                isDark ? 'neu-btn-dark text-purple-400 hover:text-white' : 'neu-btn-light text-purple-700 hover:text-purple-900'
              }`}
              title="Overwrite this device's collection with Google Drive Cloud version"
            >
              <Cloud className="w-4 h-4" />
              <span>Download Cloud</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

import React, { useEffect } from 'react';
import { Cloud, HardDrive, AlertTriangle, ArrowRight, ShieldCheck, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
      } else if (e.key === '1') {
        onResolve('upload');
      } else if (e.key === '2') {
        onResolve('download');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, conflictData, onResolve]);

  if (!isOpen || !conflictData) return null;

  const isDark = themeMode === 'dark';
  const { local, remote } = conflictData;

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

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
        onClick={handleBackdropClick}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className={`w-full max-w-2xl rounded-3xl p-6 sm:p-8 shadow-2xl border ${
            isDark
              ? 'neu-card-dark border-gray-800 text-white'
              : 'neu-card-light border-gray-200/80 text-gray-900'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-500/10 mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl ${isDark ? 'neu-pressed-dark text-amber-400' : 'neu-pressed-light text-amber-600'}`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight">Sync Conflict Detected</h3>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Changes were made on another device that cannot be merged automatically.
                </p>
              </div>
            </div>
            <button
              onClick={() => onResolve('cancel')}
              className={`p-2 rounded-xl transition ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-200 text-gray-600'}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Comparison Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Local Version Card */}
            <div className={`p-5 rounded-2xl border transition ${
              isDark ? 'neu-pressed-dark border-blue-500/20' : 'neu-pressed-light border-blue-200'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <HardDrive className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-black uppercase tracking-wider text-blue-500">Local Device</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-500/10">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Flashcards</span>
                  <span className="font-mono font-bold">{local?.cardsCount ?? 0}</span>
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
            <div className={`p-5 rounded-2xl border transition ${
              isDark ? 'neu-pressed-dark border-purple-500/20' : 'neu-pressed-light border-purple-200'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <Cloud className="w-4 h-4 text-purple-500" />
                <span className="text-xs font-black uppercase tracking-wider text-purple-500">Google Drive Cloud</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-500/10">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Flashcards</span>
                  <span className="font-mono font-bold">{remote?.cardsCount ?? 0}</span>
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

          {/* Safety Notice */}
          <div className={`flex items-start gap-2.5 p-3.5 rounded-xl mb-6 text-xs ${
            isDark ? 'bg-blue-950/40 text-blue-300 border border-blue-800/40' : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}>
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
            <span>
              <strong>Zero-Loss Protection:</strong> Downloading the cloud version automatically creates a pre-sync local snapshot in your internal vault before replacing records.
            </span>
          </div>

          {/* Action Buttons (Anki-Style) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => onResolve('upload')}
              className={`py-3 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 ${
                isDark ? 'neu-btn-dark text-blue-400 hover:text-white' : 'neu-btn-light text-blue-700 hover:text-blue-900'
              }`}
            >
              <HardDrive className="w-4 h-4" />
              Upload Local
            </button>

            <button
              onClick={() => onResolve('download')}
              className={`py-3 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20 hover:opacity-95`}
            >
              <Cloud className="w-4 h-4" />
              Download Cloud
            </button>

            <button
              onClick={() => onResolve('cancel')}
              className={`py-3 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 ${
                isDark ? 'neu-pressed-dark text-gray-400 hover:text-white' : 'neu-pressed-light text-gray-600 hover:text-gray-900'
              }`}
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

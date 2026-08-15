import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HardDrive,
  RefreshCw,
  Trash2,
  Sparkles,
  Layers,
  FileText,
  BookOpen,
  Calendar,
  Settings,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Download,
  ShieldCheck,
  Check,
  Circle
} from 'lucide-react';
import {
  calculateDetailedStorageBreakdown,
  clearAiHintsCacheLocal,
  purgeRecycleBinLocal
} from '../services/localDb';

// Utility to format bytes into readable KB / MB / GB
function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function parseSizeParts(bytes) {
  if (!bytes || bytes <= 0) return { value: '0', unit: 'KB' };
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const clampedIdx = Math.min(i, sizes.length - 1);
  return {
    value: (bytes / Math.pow(k, clampedIdx)).toFixed(1),
    unit: sizes[clampedIdx]
  };
}

export default function StorageUsageSection({
  isDark = true,
  themeMode = 'dark',
  onExportBackup = null,
  onRefreshParent = null
}) {
  const isThemeDark = themeMode === 'dark' || isDark;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [storageData, setStorageData] = useState(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(new Set(['aiHints', 'pages', 'cardsTopics', 'studyLogs', 'pytTracker', 'settings']));
  const [hoveredCategoryId, setHoveredCategoryId] = useState(null);
  const [expandedCategoryId, setExpandedCategoryId] = useState(null);
  const [cleanModalOpen, setCleanModalOpen] = useState(false);
  const [cleanProgress, setCleanProgress] = useState(null); // 'cleaning' | 'done' | null
  const [cleanToast, setCleanToast] = useState('');
  const [isPersisted, setIsPersisted] = useState(false);
  const [requestingPersist, setRequestingPersist] = useState(false);

  // Check persistent storage status
  const checkPersistence = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
        const persisted = await navigator.storage.persisted();
        setIsPersisted(persisted);
      }
    } catch (e) {
      console.warn('[StorageUsageSection] Persistence check failed:', e);
    }
  }, []);

  // Fetch storage breakdown from IndexedDB and browser storage
  const loadStorageMetrics = useCallback(async () => {
    try {
      const data = await calculateDetailedStorageBreakdown();
      setStorageData(data);
      await checkPersistence();
    } catch (err) {
      console.error('[StorageUsageSection] Error calculating storage:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [checkPersistence]);

  const handleRequestPersistence = async () => {
    if (!navigator.storage || !navigator.storage.persist) return;
    setRequestingPersist(true);
    try {
      const granted = await navigator.storage.persist();
      setIsPersisted(granted);
      if (granted) {
        setCleanToast('✓ Persistent Storage Granted! Quota expanded & locked.');
        await loadStorageMetrics();
      } else {
        setCleanToast('ℹ️ Standard Sandbox Active (Auto-grows with usage. Install as App or bookmark to grant persistent status).');
      }
    } catch (e) {
      console.error(e);
      setCleanToast('Storage running under standard browser quota.');
    } finally {
      setRequestingPersist(false);
      setTimeout(() => setCleanToast(''), 5000);
    }
  };

  useEffect(() => {
    loadStorageMetrics();
  }, [loadStorageMetrics]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStorageMetrics();
    if (onRefreshParent) onRefreshParent();
  };

  // Category list array
  const categoriesList = useMemo(() => {
    if (!storageData || !storageData.categories) return [];
    return Object.values(storageData.categories);
  }, [storageData]);

  // Total bytes
  const totalBytes = useMemo(() => {
    if (!storageData) return 0;
    return storageData.totalCalculatedBytes || 0;
  }, [storageData]);

  // Calculate percentages and SVG Donut segments
  const donutSegments = useMemo(() => {
    if (totalBytes === 0 || categoriesList.length === 0) {
      return [{
        id: 'empty',
        color: isThemeDark ? '#334155' : '#cbd5e1',
        percentage: 100,
        dashArray: '502.65 502.65',
        dashOffset: 0,
        name: 'Empty'
      }];
    }

    const RADIUS = 80;
    const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ~502.6548
    let currentOffset = 0;

    return categoriesList.map(cat => {
      const proportion = cat.bytes / totalBytes;
      const percentage = Math.round(proportion * 100) || (cat.bytes > 0 ? 1 : 0);
      const arcLength = proportion * CIRCUMFERENCE;
      const gap = categoriesList.filter(c => c.bytes > 0).length > 1 ? 2.5 : 0;
      const effectiveArcLength = Math.max(0, arcLength - gap);

      const segment = {
        id: cat.id,
        name: cat.name,
        color: cat.color,
        bytes: cat.bytes,
        percentage,
        dashArray: `${effectiveArcLength} ${CIRCUMFERENCE - effectiveArcLength}`,
        dashOffset: -currentOffset
      };

      currentOffset += arcLength;
      return segment;
    });
  }, [categoriesList, totalBytes, isThemeDark]);

  // Selected cleanup bytes calculation (for clear cache action)
  const selectedBytes = useMemo(() => {
    let sum = 0;
    categoriesList.forEach(cat => {
      if (selectedCategoryIds.has(cat.id)) {
        sum += cat.bytes;
      }
    });
    return sum;
  }, [categoriesList, selectedCategoryIds]);

  // Quota percentage
  const quotaPercentage = useMemo(() => {
    if (!storageData || !storageData.browserQuota || storageData.browserQuota <= 0) return 1;
    const pct = ((storageData.browserUsage || totalBytes) / storageData.browserQuota) * 100;
    return pct < 0.1 ? '< 0.1' : pct.toFixed(1);
  }, [storageData, totalBytes]);

  const toggleCategorySelection = (catId) => {
    setSelectedCategoryIds(prev => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };

  // Safe cache cleaning handlers
  const handlePurgeAiHints = async () => {
    setCleanProgress('cleaning');
    try {
      await clearAiHintsCacheLocal();
      await loadStorageMetrics();
      setCleanToast('AI Hints cache purged successfully!');
      setTimeout(() => setCleanToast(''), 3000);
    } catch (e) {
      console.error(e);
      alert('Failed to clear hints cache: ' + e.message);
    } finally {
      setCleanProgress(null);
      setCleanModalOpen(false);
    }
  };

  const handlePurgeRecycleBin = async () => {
    setCleanProgress('cleaning');
    try {
      await purgeRecycleBinLocal();
      await loadStorageMetrics();
      if (onRefreshParent) onRefreshParent();
      setCleanToast('Recycle Bin emptied completely!');
      setTimeout(() => setCleanToast(''), 3000);
    } catch (e) {
      console.error(e);
      alert('Failed to empty recycle bin: ' + e.message);
    } finally {
      setCleanProgress(null);
      setCleanModalOpen(false);
    }
  };

  const sizeParsed = parseSizeParts(totalBytes);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className={`rounded-3xl p-5 sm:p-7 md:p-8 space-y-6 overflow-hidden ${
        isThemeDark ? 'neu-card-dark text-slate-100' : 'neu-card-light text-slate-800'
      }`}
    >
      {/* Toast Notification */}
      <AnimatePresence>
        {cleanToast && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-black flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{cleanToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setCleanToast('')}
              className="text-[10px] uppercase tracking-wider opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`p-3 rounded-2xl shrink-0 ${
              isThemeDark ? 'neu-pressed-dark text-emerald-400' : 'neu-pressed-light text-emerald-600'
            }`}
          >
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black uppercase tracking-wider">
                Storage Usage & Cache Manager
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                100% Offline
              </span>
            </div>
            <p className={`text-xs font-medium ${isThemeDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Detailed breakdown of IndexedDB datasets, scanned media, and local cache
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className={`px-3.5 py-2 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition active:scale-95 shrink-0 ${
            isThemeDark
              ? 'neu-btn-dark text-slate-300 hover:text-white'
              : 'neu-btn-light text-slate-700 hover:text-slate-900'
          }`}
          title="Recalculate Storage"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-500' : ''}`} />
          <span>{refreshing ? 'Analyzing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Main Telegram Donut Visualizer Area */}
      <div className="flex flex-col items-center justify-center pt-2 pb-4 space-y-4 text-center">
        {/* Animated Circular SVG Donut Chart */}
        <div className="relative w-52 h-52 sm:w-56 sm:h-56 flex items-center justify-center">
          {/* Subtle Outer Glow */}
          <div className="absolute inset-2 rounded-full bg-emerald-500/5 blur-xl pointer-events-none" />

          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 200 200">
            {/* Background Track Circle */}
            <circle
              cx="100"
              cy="100"
              r="80"
              fill="transparent"
              stroke={isThemeDark ? '#1e232b' : '#d8e1ed'}
              strokeWidth="20"
              className="transition-colors duration-500"
            />

            {/* Segment Arcs */}
            {donutSegments.map((segment) => {
              const isHovered = hoveredCategoryId === segment.id;
              return (
                <circle
                  key={segment.id}
                  cx="100"
                  cy="100"
                  r="80"
                  fill="transparent"
                  stroke={segment.color}
                  strokeWidth={isHovered ? '24' : '20'}
                  strokeDasharray={segment.dashArray}
                  strokeDashoffset={segment.dashOffset}
                  strokeLinecap="round"
                  className="transition-all duration-500 ease-out cursor-pointer"
                  onMouseEnter={() => setHoveredCategoryId(segment.id)}
                  onMouseLeave={() => setHoveredCategoryId(null)}
                  style={{
                    filter: isHovered ? `drop-shadow(0 0 8px ${segment.color}80)` : 'none'
                  }}
                />
              );
            })}
          </svg>

          {/* Center Text Readout */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="absolute inset-0 flex flex-col items-center justify-center select-none pointer-events-none"
          >
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-black tracking-tight">
                {sizeParsed.value}
              </span>
              <span className="text-sm sm:text-base font-extrabold uppercase text-slate-400">
                {sizeParsed.unit}
              </span>
            </div>
            <span
              className={`text-[10px] font-black uppercase tracking-widest mt-0.5 ${
                isThemeDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Storage Used
            </span>
          </motion.div>
        </div>

        {/* Telegram-style Subtitle & Mini Progress Bar */}
        <div className="max-w-md w-full px-2 space-y-2">
          <p className={`text-xs font-bold ${isThemeDark ? 'text-slate-300' : 'text-slate-600'}`}>
            AutoAnki uses {quotaPercentage}% of your browser storage allocation.
          </p>

          {/* Slim Dual-Tone Quota Progress Bar */}
          <div
            className={`w-full h-2 rounded-full overflow-hidden p-0.5 flex ${
              isThemeDark ? 'neu-pressed-dark' : 'neu-pressed-light'
            }`}
          >
            {categoriesList.map((cat) => {
              const proportion = totalBytes > 0 ? (cat.bytes / totalBytes) * 100 : 0;
              if (proportion <= 0) return null;
              return (
                <div
                  key={cat.id}
                  className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-500"
                  style={{
                    width: `${proportion}%`,
                    backgroundColor: cat.color
                  }}
                  title={`${cat.name}: ${formatBytes(cat.bytes)}`}
                />
              );
            })}
          </div>

          <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 px-1">
            <span>App: {formatBytes(totalBytes)}</span>
            <span>
              Browser Pool: {storageData?.browserQuota ? formatBytes(storageData.browserQuota) : 'Dynamic'}
            </span>
          </div>

          {/* Persistent Storage Status & Unlock Action */}
          <div className={`p-2.5 rounded-2xl flex items-center justify-between gap-2 text-[10px] ${
            isThemeDark ? 'bg-slate-800/60 border border-slate-700/50' : 'bg-slate-100 border border-slate-200'
          }`}>
            <div className="flex items-center gap-1.5 text-left">
              <ShieldCheck className={`w-3.5 h-3.5 ${isPersisted ? 'text-emerald-400' : 'text-amber-400'} shrink-0`} />
              <div>
                <span className="font-bold">
                  {isPersisted ? 'Persistent Storage: Active' : 'Standard Browser Sandbox'}
                </span>
                <p className="text-[9px] text-slate-400">
                  {isPersisted
                    ? 'Storage is protected against browser auto-eviction.'
                    : 'Initial 2 GB safety pool assigned by browser. Click to unlock full device quota.'}
                </p>
              </div>
            </div>

            {!isPersisted && (
              <button
                type="button"
                onClick={handleRequestPersistence}
                disabled={requestingPersist}
                className="px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white shrink-0 shadow-sm transition active:scale-95"
              >
                {requestingPersist ? 'Requesting...' : 'Unlock'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Category Breakdown Rows (Telegram Style) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between px-1">
          <span
            className={`text-[11px] font-black uppercase tracking-widest ${
              isThemeDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Storage Categories ({categoriesList.length})
          </span>
          <button
            type="button"
            onClick={() => {
              if (selectedCategoryIds.size === categoriesList.length) {
                setSelectedCategoryIds(new Set());
              } else {
                setSelectedCategoryIds(new Set(categoriesList.map(c => c.id)));
              }
            }}
            className="text-[10px] font-black uppercase tracking-wider text-emerald-500 hover:text-emerald-400 transition"
          >
            {selectedCategoryIds.size === categoriesList.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="space-y-2.5">
          {categoriesList.map((cat, idx) => {
            const isSelected = selectedCategoryIds.has(cat.id);
            const isHovered = hoveredCategoryId === cat.id;
            const isExpanded = expandedCategoryId === cat.id;
            const percentage = totalBytes > 0 ? Math.round((cat.bytes / totalBytes) * 100) : 0;

            const CategoryIcon =
              cat.id === 'pages'
                ? FileText
                : cat.id === 'cardsTopics'
                ? Layers
                : cat.id === 'studyLogs'
                ? Calendar
                : cat.id === 'pytTracker'
                ? BookOpen
                : cat.id === 'aiHints'
                ? Sparkles
                : Settings;

            return (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 * idx }}
                onMouseEnter={() => setHoveredCategoryId(cat.id)}
                onMouseLeave={() => setHoveredCategoryId(null)}
                className={`rounded-2xl transition-all border ${
                  isHovered
                    ? isThemeDark
                      ? 'border-slate-600'
                      : 'border-slate-300'
                    : isThemeDark
                    ? 'border-slate-800/80'
                    : 'border-white/80'
                } ${
                  isThemeDark ? 'neu-item-dark' : 'neu-item-light'
                } overflow-hidden`}
              >
                {/* Main Row */}
                <div
                  onClick={() => toggleCategorySelection(cat.id)}
                  className="p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer select-none"
                >
                  {/* Left: Checkbox & Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Telegram-style Circular Checkbox Indicator */}
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all shrink-0 ${
                        isSelected
                          ? 'shadow-md scale-105'
                          : isThemeDark
                          ? 'neu-pressed-dark text-slate-500'
                          : 'neu-pressed-light text-slate-400'
                      }`}
                      style={{
                        backgroundColor: isSelected ? cat.color : undefined,
                        color: isSelected ? '#ffffff' : undefined
                      }}
                    >
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 opacity-40" />
                      )}
                    </div>

                    {/* Category Title & Subtitle */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-bold truncate">
                          {cat.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold ${
                            isThemeDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {percentage}%
                        </span>
                      </div>
                      <p
                        className={`text-[10px] font-medium truncate ${
                          isThemeDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {cat.label}
                      </p>
                    </div>
                  </div>

                  {/* Right: Formatted Size & Expand Toggle */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs sm:text-sm font-mono font-bold text-blue-500">
                      {formatBytes(cat.bytes)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedCategoryId(isExpanded ? null : cat.id);
                      }}
                      className={`p-1.5 rounded-xl transition ${
                        isThemeDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-200 text-slate-600'
                      }`}
                      title="View Details"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Details Drawer */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`px-4 pb-3 pt-1 border-t text-xs space-y-2 ${
                        isThemeDark
                          ? 'border-slate-800 text-slate-300 bg-slate-900/30'
                          : 'border-slate-100 text-slate-600 bg-slate-50/50'
                      }`}
                    >
                      <div className="flex justify-between items-center py-1">
                        <span className="text-[11px] font-medium">Data Storage Engine:</span>
                        <span className="font-mono text-[11px] font-bold text-emerald-500">
                          IndexedDB (Offline)
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-[11px] font-medium">Record Count:</span>
                        <span className="font-mono text-[11px] font-bold">
                          {cat.count} items
                        </span>
                      </div>
                      {cat.id === 'aiHints' && (
                        <div className="pt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={handlePurgeAiHints}
                            className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 transition flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> Purge AI Hint Cache
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Main Telegram-style Clear Cache Button */}
      <div className="pt-3 flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={() => setCleanModalOpen(true)}
          className={`w-full py-3.5 px-6 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-98 shadow-lg ${
            isThemeDark
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/20'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/20'
          }`}
        >
          <Trash2 className="w-4 h-4" />
          <span>Clear Cache & Clean Storage ({formatBytes(selectedBytes)})</span>
        </button>
      </div>

      {/* Informative Footer Banner */}
      <div
        className={`p-3.5 rounded-2xl flex items-center gap-2.5 text-[11px] font-medium ${
          isThemeDark
            ? 'neu-pressed-dark text-slate-400 border border-slate-800'
            : 'neu-pressed-light text-slate-500 border border-white'
        }`}
      >
        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
        <span>
          All study materials and flashcards remain securely stored in your local browser database.
        </span>
      </div>

      {/* Safe Storage Cleanup Modal */}
      <AnimatePresence>
        {cleanModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className={`max-w-md w-full rounded-3xl p-6 md:p-7 space-y-5 shadow-2xl border ${
                isThemeDark
                  ? 'neu-card-dark border-slate-700 text-white'
                  : 'neu-card-light border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black uppercase tracking-wider">
                      Storage Optimization
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      Select safe cleanup actions
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCleanModalOpen(false)}
                  className={`p-2 rounded-xl text-xs font-bold ${
                    isThemeDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  ✕
                </button>
              </div>

              {/* Action Options */}
              <div className="space-y-3">
                {/* 1. Purge AI Hints Cache */}
                <div
                  className={`p-4 rounded-2xl flex items-center justify-between gap-3 border ${
                    isThemeDark ? 'neu-pressed-dark border-slate-800' : 'neu-pressed-light border-slate-200'
                  }`}
                >
                  <div>
                    <h4 className="text-xs font-bold flex items-center gap-1.5 text-teal-400">
                      <Sparkles className="w-3.5 h-3.5" />
                      Clear AI Hints Cache
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Clears cached active-recall hints and temporary AI prompt caches.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handlePurgeAiHints}
                    disabled={cleanProgress === 'cleaning'}
                    className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-teal-600 hover:bg-teal-500 text-white shrink-0 shadow-md transition active:scale-95"
                  >
                    Clear
                  </button>
                </div>

                {/* 2. Empty Recycle Bin */}
                <div
                  className={`p-4 rounded-2xl flex items-center justify-between gap-3 border ${
                    isThemeDark ? 'neu-pressed-dark border-slate-800' : 'neu-pressed-light border-slate-200'
                  }`}
                >
                  <div>
                    <h4 className="text-xs font-bold flex items-center gap-1.5 text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                      Empty Recycle Bin
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Permanently purges all deleted scans and discarded cards.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handlePurgeRecycleBin}
                    disabled={cleanProgress === 'cleaning'}
                    className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white shrink-0 shadow-md transition active:scale-95"
                  >
                    Purge
                  </button>
                </div>

                {/* 3. Export Backup First */}
                {onExportBackup && (
                  <div
                    className={`p-4 rounded-2xl flex items-center justify-between gap-3 border ${
                      isThemeDark ? 'neu-pressed-dark border-slate-800' : 'neu-pressed-light border-slate-200'
                    }`}
                  >
                    <div>
                      <h4 className="text-xs font-bold flex items-center gap-1.5 text-blue-400">
                        <Download className="w-3.5 h-3.5" />
                        Export Backup File (.json)
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Download a complete snapshot of your flashcards and progress.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onExportBackup();
                        setCleanModalOpen(false);
                      }}
                      className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white shrink-0 shadow-md transition active:scale-95"
                    >
                      Export
                    </button>
                  </div>
                )}
              </div>

              {/* Close Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setCleanModalOpen(false)}
                  className={`w-full py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition ${
                    isThemeDark ? 'neu-btn-dark text-slate-300' : 'neu-btn-light text-slate-700'
                  }`}
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

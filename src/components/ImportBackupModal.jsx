import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Upload, ChevronDown, ChevronUp, Shield, AlertTriangle, CheckCircle2,
  Layers, BookOpen, Activity, Image as ImageIcon, Settings as SettingsIcon,
  Trash2, Info, Loader2, ArrowRight, Check
} from 'lucide-react';
import {
  importUniversalSnapshot,
  verifySnapshotChecksum,
  getLocalCards,
  getLocalPages,
  getLocalStudyLogs,
  getAllLocalPytTopics,
  getAllLocalItems,
  STORES
} from '../services/localDb';

const BUNDLES = [
  {
    id: 'cards_fsrs',
    icon: Layers,
    color: 'blue',
    title: 'Flashcards & FSRS States',
    desc: 'All flashcards with their memory stability, difficulty, intervals, and review history.',
    getSnapshot: (stores) => {
      const cards = stores?.kv_store?.find(r => r.key === 'flashcards')?.value || [];
      const fsrsItems = cards.filter(c => c?.stability != null || c?.difficulty != null);
      return { count: cards.length, fsrsCount: fsrsItems.length };
    },
    format: (s) => `${s.count} cards, ${s.fsrsCount} with FSRS state`,
  },
  {
    id: 'topics_curriculum',
    icon: BookOpen,
    color: 'violet',
    title: 'Curriculum Topics & PYT Progress',
    desc: 'All topics, subject structures, past-year-test data, and study schedule templates.',
    getSnapshot: (stores) => {
      const topics = stores?.topics || [];
      const pyt = stores?.pyt_data || [];
      return { topicCount: topics.length, pytCount: pyt.length };
    },
    format: (s) => `${s.topicCount} topics, ${s.pytCount} PYT entries`,
  },
  {
    id: 'study_logs_velocity',
    icon: Activity,
    color: 'emerald',
    title: 'Study Velocity, Logs & CAMP Telemetry',
    desc: 'FSRS review logs, daily study sessions, CAMP tracker data, and performance metrics.',
    getSnapshot: (stores) => {
      const campLogs = stores?.camp_daily_logs || [];
      const studyLogs = stores?.kv_store?.find(r => r.key === 'study_logs')?.value || {};
      const logDays = Object.keys(studyLogs).length;
      return { campDays: campLogs.length, logDays };
    },
    format: (s) => `${s.campDays} CAMP sessions, ${s.logDays} study log days`,
  },
  {
    id: 'scans_media',
    icon: ImageIcon,
    color: 'amber',
    title: 'Scanned Pages & Textbooks',
    desc: 'All scanned library pages, PDF metadata, and textbook index records.',
    getSnapshot: (stores) => {
      const pages = stores?.kv_store?.find(r => r.key === 'pages')?.value || [];
      const books = stores?.kv_store?.find(r => r.key === 'textbooks_metadata')?.value || [];
      return { pageCount: pages.length, bookCount: books.length };
    },
    format: (s) => `${s.pageCount} pages, ${s.bookCount} textbooks`,
  },
  {
    id: 'settings_prompts',
    icon: SettingsIcon,
    color: 'rose',
    title: 'FSRS-6 Config, API Keys & Prompts',
    desc: 'FSRS-6 21-weight array, request retention, workspace settings, and custom AI prompts.',
    getSnapshot: (stores) => {
      const settings = stores?.settings || [];
      const fsrs = settings.find(s => s.key === 'fsrs_config');
      const prompts = stores?.kv_store?.find(r => r.key === 'custom_prompts')?.value || [];
      return { settingsCount: settings.length, hasFsrs: !!fsrs, promptCount: prompts.length };
    },
    format: (s) => `${s.settingsCount} settings, FSRS-6: ${s.hasFsrs ? 'Yes' : 'No'}, ${s.promptCount} prompts`,
  },
  {
    id: 'recycle_bin',
    icon: Trash2,
    color: 'gray',
    title: 'Recycle Bin',
    desc: 'Soft-deleted pages and cards awaiting permanent removal.',
    getSnapshot: (stores) => {
      const tp = stores?.kv_store?.find(r => r.key === 'trash_pages')?.value || [];
      const tc = stores?.kv_store?.find(r => r.key === 'trash_cards')?.value || [];
      return { pages: tp.length, cards: tc.length };
    },
    format: (s) => `${s.pages} deleted pages, ${s.cards} deleted cards`,
  },
];

const STRATEGIES = [
  { id: 'merge', label: 'Merge (Safe)', desc: 'Add new data from snapshot without overwriting existing records.', badge: 'Recommended' },
  { id: 'replace', label: 'Replace (Destructive)', desc: 'Completely wipe selected stores and replace with snapshot contents.', badge: 'Caution' },
];

const colorMap = {
  blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/30',    badge: 'bg-blue-500/20 text-blue-300'    },
  violet:  { bg: 'bg-violet-500/10',  text: 'text-violet-400',  border: 'border-violet-500/30',  badge: 'bg-violet-500/20 text-violet-300' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', badge: 'bg-emerald-500/20 text-emerald-300'},
  amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30',   badge: 'bg-amber-500/20 text-amber-300'  },
  rose:    { bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/30',    badge: 'bg-rose-500/20 text-rose-300'    },
  gray:    { bg: 'bg-gray-500/10',    text: 'text-gray-400',    border: 'border-gray-500/30',    badge: 'bg-gray-500/20 text-gray-300'    },
};

function formatDate(iso) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

function BundleAccordionCard({ bundle, index, selected, onToggleSelect, incomingStores, currentStats, themeMode }) {
  const [open, setOpen] = useState(false);
  const isDark = themeMode === 'dark';
  const c = colorMap[bundle.color] || colorMap.gray;
  const Icon = bundle.icon;

  const incoming = bundle.getSnapshot(incomingStores || {});
  const current  = bundle.getSnapshot(currentStats  || {});
  const incomingStr = bundle.format(incoming);
  const currentStr  = bundle.format(current);
  const hasChange = incomingStr !== currentStr;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.28 }}
      className={`rounded-2xl border overflow-hidden ${c.border} ${isDark ? 'bg-white/[0.03]' : 'bg-black/[0.03]'}`}
    >
      <div className="flex items-center gap-3 p-3.5">
        <button
          type="button"
          onClick={() => onToggleSelect(bundle.id)}
          className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            selected ? `${c.bg} border-current ${c.text}` : isDark ? 'border-gray-600 bg-transparent' : 'border-gray-300 bg-transparent'
          }`}
        >
          {selected && <Check className="w-3 h-3" />}
        </button>
        <div className={`p-2 rounded-xl ${c.bg} flex-shrink-0`}>
          <Icon className={`w-4 h-4 ${c.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{bundle.title}</p>
          <p className={`text-[11px] font-medium truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{incomingStr}</p>
        </div>
        {hasChange && (
          <span className={`hidden sm:inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex-shrink-0 ${c.badge}`}>
            Changed
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`p-1.5 rounded-xl transition flex-shrink-0 ${isDark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-black/5 text-gray-500'}`}
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className={`px-4 pb-4 pt-2 border-t ${isDark ? 'border-white/10' : 'border-black/10'}`}>
              <p className={`text-[11px] mb-3 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{bundle.desc}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Current DB</p>
                  <p className={`text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{currentStr}</p>
                </div>
                <div className={`p-3 rounded-xl ${c.bg}`}>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${c.text}`}>In Snapshot</p>
                  <p className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{incomingStr}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function ImportBackupModal({ isOpen, onClose, themeMode = 'dark', onImportComplete }) {
  const isDark = themeMode === 'dark';
  const fileInputRef = useRef(null);

  const [step, setStep] = useState('idle');
  const [payload, setPayload] = useState(null);
  const [checksumResult, setChecksumResult] = useState(null);
  const [strategy, setStrategy] = useState('merge');
  const [selectedBundles, setSelectedBundles] = useState(BUNDLES.map(b => b.id));
  const [currentStats, setCurrentStats] = useState({});
  const [importProgress, setImportProgress] = useState({ step: 0, total: 0, message: '' });
  const [importResult, setImportResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isLoadingCurrent, setIsLoadingCurrent] = useState(false);

  const loadCurrentStats = useCallback(async () => {
    setIsLoadingCurrent(true);
    try {
      const [cards, pages, studyLogs, topics, pytTopics, settings, kvStore, campDailyLogs] = await Promise.all([
        getLocalCards().catch(() => []),
        getLocalPages().catch(() => []),
        getLocalStudyLogs().catch(() => ({})),
        getAllLocalItems(STORES.TOPICS).catch(() => []),
        getAllLocalPytTopics().catch(() => []),
        getAllLocalItems(STORES.SETTINGS).catch(() => []),
        getAllLocalItems(STORES.KV_STORE).catch(() => []),
        getAllLocalItems(STORES.CAMP_DAILY_LOGS).catch(() => []),
      ]);
      const composed = {
        topics,
        settings,
        camp_daily_logs: campDailyLogs,
        pyt_data: pytTopics,
        kv_store: [
          { key: 'flashcards', value: cards },
          { key: 'pages', value: pages },
          { key: 'study_logs', value: studyLogs },
          ...kvStore.filter(r => !['flashcards', 'pages', 'study_logs'].includes(r?.key)),
        ],
      };
      setCurrentStats(composed);
    } catch (e) {
      console.warn('[ImportBackupModal] Could not load current stats:', e);
    } finally {
      setIsLoadingCurrent(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setStep('idle'); setPayload(null); setChecksumResult(null);
      setStrategy('merge'); setSelectedBundles(BUNDLES.map(b => b.id));
      setImportProgress({ step: 0, total: 0, message: '' });
      setImportResult(null); setErrorMsg(''); setConfirmText('');
    } else {
      loadCurrentStats();
    }
  }, [isOpen, loadCurrentStats]);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStep('parsing'); setErrorMsg('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed?.meta?.version || !parsed?.stores) throw new Error('Not a valid AutoAnki Universal Backup (missing meta.version or stores).');
      if (parsed.meta.version !== '2.0') throw new Error(`Unsupported snapshot version: ${parsed.meta.version}. Only v2.0 is supported.`);
      const checkResult = verifySnapshotChecksum(parsed);
      setChecksumResult(checkResult);
      setPayload(parsed);
      setStep('diff');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to parse backup file.');
      setStep('error');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleToggleBundle = useCallback((id) => {
    setSelectedBundles(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
  }, []);

  const handleStartImport = useCallback(async () => {
    if (!payload) return;
    setStep('importing');
    setImportProgress({ step: 0, total: 0, message: 'Starting import...' });
    const result = await importUniversalSnapshot(
      payload, strategy,
      selectedBundles.length === BUNDLES.length ? 'all' : selectedBundles,
      (s, t, msg) => setImportProgress({ step: s, total: t, message: msg })
    );
    setImportResult(result);
    setStep(result.success ? 'done' : 'error');
    if (result.success && onImportComplete) onImportComplete(result);
  }, [payload, strategy, selectedBundles, onImportComplete]);

  const canProceed = selectedBundles.length > 0 && (strategy !== 'replace' || confirmText.trim().toUpperCase() === 'REPLACE');

  const handleBackdropClick = (e) => { if (e.target === e.currentTarget && step !== 'importing') onClose(); };

  const card = isDark ? 'bg-[#222730] border border-white/10' : 'bg-[#e6ecf5] border border-black/10';
  const tp = isDark ? 'text-white' : 'text-gray-900';
  const ts = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backdropFilter: 'blur(14px)', backgroundColor: 'rgba(0,0,0,0.65)' }}
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className={`${card} w-full max-w-2xl flex flex-col rounded-t-3xl sm:rounded-3xl shadow-2xl`}
            style={{ maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-5 border-b ${isDark ? 'border-white/10' : 'border-black/10'} flex-shrink-0`}>
              <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 }} className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${isDark ? 'bg-emerald-500/15' : 'bg-emerald-50'}`}>
                  <Upload className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h2 className={`text-base font-black tracking-tight ${tp}`}>Import Backup</h2>
                  <p className={`text-[11px] font-medium ${ts}`}>AutoAnki FSRS-6 Unified Vault v2.0</p>
                </div>
              </motion.div>
              {step !== 'importing' && (
                <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                  onClick={onClose}
                  className={`p-2 rounded-xl transition ${isDark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-black/8 text-gray-500'}`}
                >
                  <X className="w-5 h-5" />
                </motion.button>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5" style={{ scrollbarWidth: 'none' }}>

              {/* idle/parsing */}
              {(step === 'idle' || step === 'parsing') && (
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center py-10 space-y-5">
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center ${isDark ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-emerald-50 border border-emerald-200'}`}
                  >
                    {step === 'parsing'
                      ? <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                      : <Upload className="w-8 h-8 text-emerald-500" />
                    }
                  </motion.div>
                  <div>
                    <p className={`text-lg font-black ${tp}`}>{step === 'parsing' ? 'Validating Backup...' : 'Select Backup File'}</p>
                    <p className={`text-sm mt-1.5 ${ts}`}>
                      {step === 'parsing' ? 'Parsing JSON and verifying checksum...' : 'Choose an AutoAnki_Vault_Backup_*.json file to inspect and restore.'}
                    </p>
                  </div>
                  {step !== 'parsing' && (
                    <button onClick={() => fileInputRef.current?.click()}
                      className="mx-auto px-7 py-3 rounded-2xl font-bold text-sm text-white shadow-lg transition-all hover:scale-105 active:scale-95"
                      style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                    >Browse Files</button>
                  )}
                  <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
                </motion.div>
              )}

              {/* error */}
              {step === 'error' && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center py-10 space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center">
                    <AlertTriangle className="w-7 h-7 text-red-400" />
                  </div>
                  <div>
                    <p className={`text-base font-black ${tp}`}>Import Failed</p>
                    <p className="text-sm mt-1 text-red-400">{errorMsg || importResult?.errors?.join(', ') || 'Unknown error'}</p>
                  </div>
                  <button onClick={() => { setStep('idle'); setErrorMsg(''); }}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm transition ${isDark ? 'bg-white/10 hover:bg-white/18 text-white' : 'bg-black/8 hover:bg-black/14 text-gray-800'}`}
                  >Try Again</button>
                </motion.div>
              )}

              {/* done */}
              {step === 'done' && importResult && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center py-10 space-y-4">
                  <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                    className="w-20 h-20 mx-auto rounded-3xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center"
                  >
                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  </motion.div>
                  <div>
                    <p className={`text-lg font-black ${tp}`}>Import Complete</p>
                    <p className={`text-sm mt-1.5 ${ts}`}>
                      Restored {importResult.restored.length} bundle{importResult.restored.length !== 1 ? 's' : ''} successfully. Reload to apply all changes.
                    </p>
                    {importResult.errors.length > 0 && (
                      <p className="text-xs text-amber-400 mt-2">Warnings: {importResult.errors.join('; ')}</p>
                    )}
                  </div>
                  <div className="flex gap-3 justify-center">
                    <button onClick={() => window.location.reload()}
                      className="px-6 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:scale-105"
                      style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                    >Reload App</button>
                    <button onClick={onClose}
                      className={`px-5 py-2.5 rounded-xl font-bold text-sm transition ${isDark ? 'bg-white/10 hover:bg-white/18 text-white' : 'bg-black/8 hover:bg-black/14 text-gray-800'}`}
                    >Close</button>
                  </div>
                </motion.div>
              )}

              {/* importing */}
              {step === 'importing' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12 space-y-6 text-center">
                  <Loader2 className="w-12 h-12 mx-auto text-emerald-500 animate-spin" />
                  <div>
                    <p className={`text-base font-black ${tp}`}>Importing Data...</p>
                    <p className={`text-sm mt-1 ${ts}`}>{importProgress.message}</p>
                  </div>
                  {importProgress.total > 0 && (
                    <div className={`h-2 rounded-full overflow-hidden max-w-sm mx-auto ${isDark ? 'bg-white/10' : 'bg-black/8'}`}>
                      <motion.div className="h-full bg-emerald-500 rounded-full" animate={{ width: `${(importProgress.step / importProgress.total) * 100}%` }} transition={{ duration: 0.3 }} />
                    </div>
                  )}
                  <p className={`text-xs ${ts}`}>Do not close this window.</p>
                </motion.div>
              )}

              {/* diff */}
              {step === 'diff' && payload && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                  {/* Meta header */}
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                    className={`p-4 rounded-2xl border ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/4 border-black/10'}`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className={`text-sm font-black ${tp}`}>Snapshot Details</p>
                        <p className={`text-[11px] mt-0.5 ${ts}`}>{formatDate(payload.meta?.timestamp)}</p>
                        <p className={`text-[11px] ${ts}`}>{payload.meta?.engine}</p>
                      </div>
                      {checksumResult && (
                        <span className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${checksumResult.valid ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>
                          {checksumResult.valid ? <><Shield className="w-3 h-3" />Verified</> : <><AlertTriangle className="w-3 h-3" />Checksum Mismatch</>}
                        </span>
                      )}
                    </div>
                    {checksumResult && !checksumResult.valid && (
                      <p className="text-[11px] text-amber-400 mt-2 flex items-center gap-1"><Info className="w-3 h-3 flex-shrink-0" />{checksumResult.reason}</p>
                    )}
                  </motion.div>

                  {/* Strategy */}
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${ts}`}>Import Strategy</p>
                    <div className="grid grid-cols-2 gap-2">
                      {STRATEGIES.map(s => (
                        <button key={s.id} onClick={() => setStrategy(s.id)}
                          className={`p-3.5 rounded-2xl text-left border transition-all ${strategy === s.id ? (s.id === 'replace' ? 'border-red-500/40 bg-red-500/10' : 'border-emerald-500/40 bg-emerald-500/10') : isDark ? 'border-white/10 bg-white/[0.03] hover:bg-white/8' : 'border-black/10 bg-black/[0.03] hover:bg-black/6'}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-bold ${tp}`}>{s.label}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${s.id === 'replace' ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{s.badge}</span>
                          </div>
                          <p className={`text-[11px] leading-relaxed ${ts}`}>{s.desc}</p>
                        </button>
                      ))}
                    </div>
                  </motion.div>

                  {/* Bundle selection */}
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-[10px] font-black uppercase tracking-widest ${ts}`}>{selectedBundles.length} of {BUNDLES.length} bundles selected</p>
                      <div className="flex gap-2 items-center">
                        <button onClick={() => setSelectedBundles(BUNDLES.map(b => b.id))} className={`text-[10px] font-black uppercase hover:underline ${ts}`}>All</button>
                        <span className={ts}>·</span>
                        <button onClick={() => setSelectedBundles([])} className={`text-[10px] font-black uppercase hover:underline ${ts}`}>None</button>
                      </div>
                    </div>
                    {isLoadingCurrent ? (
                      <div className={`flex items-center justify-center py-6 gap-2 ${ts}`}>
                        <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Loading current database stats...</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {BUNDLES.map((bundle, i) => (
                          <BundleAccordionCard key={bundle.id} bundle={bundle} index={i}
                            selected={selectedBundles.includes(bundle.id)} onToggleSelect={handleToggleBundle}
                            incomingStores={payload?.stores} currentStats={currentStats} themeMode={themeMode}
                          />
                        ))}
                      </div>
                    )}
                  </motion.div>

                  {/* Replace confirm gate */}
                  {strategy === 'replace' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
                      <div className="p-4 rounded-2xl border border-red-500/25 bg-red-500/8 space-y-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-red-300 leading-relaxed">
                            <strong>Destructive operation.</strong> All selected bundles will be permanently wiped and replaced. This cannot be undone.
                          </p>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest text-red-400 mb-1.5">Type REPLACE to confirm</label>
                          <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="REPLACE"
                            className={`w-full px-3 py-2 rounded-xl text-sm font-mono border focus:outline-none transition ${isDark ? 'bg-white/8 border-red-500/25 text-white placeholder-gray-600 focus:border-red-400' : 'bg-black/5 border-red-300 text-gray-900 placeholder-gray-400 focus:border-red-500'}`}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </div>

            {/* Footer */}
            {step === 'diff' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={`px-6 py-4 border-t flex items-center justify-between gap-3 flex-shrink-0 ${isDark ? 'border-white/10' : 'border-black/10'}`}
              >
                <button
                  onClick={() => { setStep('idle'); setPayload(null); setConfirmText(''); }}
                  className={`px-4 py-2.5 rounded-xl font-bold text-sm transition ${isDark ? 'bg-white/8 hover:bg-white/14 text-gray-300' : 'bg-black/6 hover:bg-black/12 text-gray-700'}`}
                >
                  Choose Different File
                </button>
                <div className="flex items-center gap-2">
                  {selectedBundles.length === 0 && <span className="text-xs text-amber-400">Select at least one bundle</span>}
                  <button onClick={handleStartImport} disabled={!canProceed}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm text-white flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 ${
                      strategy === 'replace' ? 'bg-gradient-to-r from-red-600 to-red-500' : 'bg-gradient-to-r from-emerald-600 to-emerald-500'
                    }`}
                  >
                    <ArrowRight className="w-4 h-4" />
                    {strategy === 'replace' ? 'Replace Data' : 'Merge Import'}
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

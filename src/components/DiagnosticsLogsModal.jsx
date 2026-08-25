import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, 
  X, 
  Trash2, 
  Copy, 
  Check, 
  Download, 
  Search, 
  AlertCircle, 
  RefreshCw, 
  Database, 
  Brain, 
  ChevronDown, 
  ChevronRight,
  Filter,
  ShieldCheck,
  Activity,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import logger from '../services/logger';
import { runSystemIntegrityCheck, getLatestHealthReport } from '../services/healthChecker';

export default function DiagnosticsLogsModal({
  isOpen,
  onClose,
  themeMode = 'dark'
}) {
  const isDark = themeMode === 'dark';
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all', 'errors', 'anomalies', 'sync', 'db', 'fsrs'
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const [isRunningHealthCheck, setIsRunningHealthCheck] = useState(false);
  const [healthReport, setHealthReport] = useState(null);
  const logsContainerRef = useRef(null);

  // Subscribe to logger real-time updates
  useEffect(() => {
    if (!isOpen) return;

    setLogs(logger.getLogs('all'));
    setHealthReport(getLatestHealthReport());

    const unsubscribe = logger.subscribe((newEntry, allLogs) => {
      setLogs(allLogs ? [...allLogs] : logger.getLogs('all'));
      const latest = getLatestHealthReport();
      if (latest) setHealthReport(latest);
    });

    return () => unsubscribe();
  }, [isOpen]);

  // Auto scroll down when new logs arrive if autoScroll is enabled
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll, filter, searchQuery]);

  const handleRunHealthCheck = async () => {
    setIsRunningHealthCheck(true);
    try {
      const res = await runSystemIntegrityCheck({ silent: false });
      setHealthReport(res);
    } catch (e) {
      console.warn('Health check execution error:', e);
    } finally {
      setIsRunningHealthCheck(false);
    }
  };

  const counts = useMemo(() => {
    const total = logs.length;
    const errors = logs.filter(l => l.level === 'error').length;
    const anomalies = logs.filter(l => l.level === 'anomaly').length;
    const sync = logs.filter(l => l.level === 'sync').length;
    const db = logs.filter(l => l.level === 'db').length;
    const fsrs = logs.filter(l => l.level === 'fsrs').length;
    return { all: total, errors, anomalies, sync, db, fsrs };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      // Filter category
      if (filter === 'errors' && l.level !== 'error') return false;
      if (filter === 'anomalies' && l.level !== 'anomaly') return false;
      if (filter === 'sync' && l.level !== 'sync') return false;
      if (filter === 'db' && l.level !== 'db') return false;
      if (filter === 'fsrs' && l.level !== 'fsrs') return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const msgMatch = (l.message || '').toLowerCase().includes(q);
        const tagMatch = (l.tag || '').toLowerCase().includes(q);
        const dataMatch = l.data ? JSON.stringify(l.data).toLowerCase().includes(q) : false;
        return msgMatch || tagMatch || dataMatch;
      }
      return true;
    });
  }, [logs, filter, searchQuery]);

  const toggleExpand = (id) => {
    setExpandedLogIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyAll = async () => {
    try {
      const text = logger.exportLogsAsText();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Clipboard copy failed:', err);
    }
  };

  const handleDownload = () => {
    const text = logger.exportLogsAsText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autoanki_diagnostics_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    logger.clearLogs();
    setLogs([]);
    setExpandedLogIds(new Set());
    setHealthReport(null);
  };

  if (!isOpen) return null;

  const getLevelBadge = (level) => {
    switch (level) {
      case 'error':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30">ERROR</span>;
      case 'anomaly':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-amber-500/25 text-amber-300 border border-amber-500/40">ANOMALY</span>;
      case 'warn':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">WARN</span>;
      case 'sync':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-sky-500/20 text-sky-400 border border-sky-500/30">SYNC</span>;
      case 'db':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">DB</span>;
      case 'fsrs':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-purple-500/20 text-purple-400 border border-purple-500/30">FSRS</span>;
      case 'init':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">INIT</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-slate-500/20 text-slate-400 border border-slate-500/30">INFO</span>;
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className={`w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl border ${
          isDark 
            ? 'bg-[#222730] border-slate-700/60 text-slate-100' 
            : 'bg-[#e6ecf5] border-slate-300 text-slate-800'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          isDark ? 'border-slate-800 bg-[#1e232b]' : 'border-slate-300/80 bg-[#dde3ed]'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-wide flex items-center gap-2">
                System Diagnostics & Activity Logs
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-mono">
                  {logs.length} entries
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Live internal telemetry for LocalDB, Google Drive Sync, and FSRS Engine
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-all ${
              isDark 
                ? 'hover:bg-slate-700/60 text-slate-400 hover:text-slate-200' 
                : 'hover:bg-slate-300 text-slate-600 hover:text-slate-900'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className={`p-4 border-b space-y-3 ${
          isDark ? 'border-slate-800 bg-[#222730]' : 'border-slate-300/80 bg-[#e6ecf5]'
        }`}>
          {/* Top Row: Search & Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search logs by message, tag, or payload..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border outline-none transition-all ${
                  isDark
                    ? 'bg-[#1a1e24] border-slate-700 focus:border-cyan-500 text-slate-200 placeholder:text-slate-500'
                    : 'bg-white/80 border-slate-300 focus:border-cyan-500 text-slate-800 placeholder:text-slate-400'
                }`}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleRunHealthCheck}
                disabled={isRunningHealthCheck}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                  isRunningHealthCheck
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                    : isDark
                    ? 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 text-cyan-400'
                    : 'bg-cyan-50 hover:bg-cyan-100 border-cyan-300 text-cyan-700'
                }`}
              >
                {isRunningHealthCheck ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                )}
                {isRunningHealthCheck ? 'Checking…' : 'Run Health Check'}
              </button>

              <button
                onClick={handleCopyAll}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                  copied
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : isDark
                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                    : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy Logs'}
              </button>

              <button
                onClick={handleDownload}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                    : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                Export .txt
              </button>

              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <span className="text-xs text-slate-400 flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" /> Filter:
            </span>

            {[
              { id: 'all', label: 'All', count: counts.all, color: 'cyan' },
              { id: 'anomalies', label: 'Anomalies', count: counts.anomalies, color: 'amber' },
              { id: 'errors', label: 'Errors', count: counts.errors, color: 'rose' },
              { id: 'sync', label: 'Sync', count: counts.sync, color: 'sky' },
              { id: 'db', label: 'LocalDB', count: counts.db, color: 'emerald' },
              { id: 'fsrs', label: 'FSRS', count: counts.fsrs, color: 'purple' }
            ].map(tab => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                    active
                      ? isDark
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
                        : 'bg-cyan-600 text-white shadow-sm'
                      : isDark
                      ? 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 border border-slate-700/50'
                      : 'bg-white/60 hover:bg-white text-slate-600 border border-slate-300/80'
                  }`}
                >
                  {tab.label}
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    active
                      ? isDark ? 'bg-cyan-500/30 text-cyan-200' : 'bg-white/30 text-white'
                      : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}

            <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-slate-700 accent-cyan-500"
                />
                Auto-scroll
              </label>
            </div>
          </div>
        </div>

        {/* Health Check Status Banner */}
        {healthReport && (
          <div className={`px-4 py-2.5 border-b flex items-center justify-between gap-3 text-xs ${
            healthReport.isHealthy
              ? isDark ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : isDark ? 'bg-amber-950/30 border-amber-800/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <div className="flex items-center gap-2">
              {healthReport.isHealthy ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span className="font-medium">
                {healthReport.summary}
              </span>
            </div>
            <span className="text-[11px] opacity-75 font-mono">
              {new Date(healthReport.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        )}

        {/* Log Viewer Terminal Body */}
        <div
          ref={logsContainerRef}
          className={`flex-1 overflow-y-auto p-4 font-mono text-xs space-y-2 min-h-[350px] max-h-[500px] select-text ${
            isDark ? 'bg-[#181c22] text-slate-200' : 'bg-[#f4f7fa] text-slate-800'
          }`}
          style={{ scrollbarWidth: 'none' }}
        >
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Terminal className="w-10 h-10 mb-2 stroke-[1.5] opacity-40" />
              <p className="text-sm font-sans font-medium">No diagnostics logs matching criteria</p>
              <p className="text-xs font-sans text-slate-500 mt-1">Actions performed in the app will stream here live</p>
            </div>
          ) : (
            filteredLogs.map((entry) => {
              const isExpanded = expandedLogIds.has(entry.id);
              const hasData = entry.data !== null && entry.data !== undefined;

              return (
                <div
                  key={entry.id}
                  className={`p-2.5 rounded-xl border transition-all ${
                    entry.level === 'error'
                      ? isDark 
                        ? 'bg-rose-950/20 border-rose-900/40 text-rose-200' 
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                      : isDark
                      ? 'bg-[#1f242c]/90 border-slate-800/80 hover:border-slate-700'
                      : 'bg-white/90 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-400 font-sans text-[11px] select-none">
                        {entry.timeFormatted}
                      </span>
                      {getLevelBadge(entry.level)}
                      <span className="font-semibold text-cyan-400">
                        [{entry.tag}]
                      </span>
                      <span className="break-all font-sans font-medium">
                        {entry.message}
                      </span>
                    </div>

                    {hasData && (
                      <button
                        onClick={() => toggleExpand(entry.id)}
                        className={`p-1 rounded-lg transition-all flex items-center gap-1 text-[11px] font-sans ${
                          isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {isExpanded ? 'Hide Payload' : 'Payload'}
                      </button>
                    )}
                  </div>

                  {/* Expandable JSON payload */}
                  {hasData && isExpanded && (
                    <div className={`mt-2 p-3 rounded-lg overflow-x-auto text-[11px] border ${
                      isDark ? 'bg-[#121519] border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-900'
                    }`}>
                      <pre>{JSON.stringify(entry.data, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className={`px-6 py-2.5 border-t flex items-center justify-between text-xs text-slate-400 ${
          isDark ? 'border-slate-800 bg-[#1e232b]' : 'border-slate-300/80 bg-[#dde3ed]'
        }`}>
          <span>Buffer: {logs.length} / 300 entries</span>
          <span>Rolling in-memory telemetry mirror</span>
        </div>
      </motion.div>
    </div>
  );

  return typeof document !== 'undefined' ? ReactDOM.createPortal(modalContent, document.body) : null;
}

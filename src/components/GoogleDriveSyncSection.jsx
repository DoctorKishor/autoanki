import React, { useState, useEffect, useCallback } from 'react';
import {
  Cloud, RefreshCw, LogOut, CheckCircle2, AlertCircle, HardDrive,
  Settings as SettingsIcon, ShieldCheck, ChevronDown, ChevronUp, Loader2, Sparkles,
  Layers, Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getGoogleDriveAuthState,
  requestGoogleDriveToken,
  disconnectGoogleDrive,
  getGoogleDriveStorageQuota,
  getActiveGoogleClientId,
  saveCustomGoogleClientId,
  DEFAULT_GOOGLE_CLIENT_ID
} from '../services/googleDriveAuth';
import { syncWithGoogleDrive, getGoogleDriveVaultStorageSize } from '../services/googleDriveSync';
import { calculateDetailedStorageBreakdown } from '../services/localDb';

export default function GoogleDriveSyncSection({
  isDark,
  themeMode = 'light',
  isOpen,
  onToggle,
  onMouseEnter,
  onMouseLeave,
  onConflict
}) {
  const [authState, setAuthState] = useState(null);
  const [quota, setQuota] = useState(null);
  const [vaultStorage, setVaultStorage] = useState(null); // { totalBytes, vaultFileCount, mediaFileCount }
  const [localAppBytes, setLocalAppBytes] = useState(null);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showClientSettings, setShowClientSettings] = useState(false);
  const [clientIdInput, setClientIdInput] = useState('');
  const [activeClientId, setActiveClientId] = useState(DEFAULT_GOOGLE_CLIENT_ID);
  const [isSavingClientId, setIsSavingClientId] = useState(false);

  // Compute local and cloud storage metrics
  const refreshStorageMetrics = useCallback(async (token) => {
    try {
      // 1. Calculate local app IndexedDB storage
      const breakdown = await calculateDetailedStorageBreakdown();
      if (breakdown) {
        setLocalAppBytes(breakdown.grandTotalBytes || breakdown.browserUsage || 0);
      }

      // 2. Calculate Google Drive vault size if token is available
      if (token) {
        setLoadingStorage(true);
        const vaultData = await getGoogleDriveVaultStorageSize(token);
        setVaultStorage(vaultData);
      } else {
        setVaultStorage(null);
      }
    } catch (err) {
      console.warn('[GDriveSection] Error calculating storage metrics:', err);
    } finally {
      setLoadingStorage(false);
    }
  }, []);

  // Load persistent auth state and client ID on mount
  const refreshAuthState = useCallback(async () => {
    try {
      const state = await getGoogleDriveAuthState();
      setAuthState(state);
      const cId = await getActiveGoogleClientId();
      setActiveClientId(cId);
      setClientIdInput(cId);

      if (state?.accessToken) {
        const q = await getGoogleDriveStorageQuota(state.accessToken);
        setQuota(q);
        refreshStorageMetrics(state.accessToken);
      } else {
        refreshStorageMetrics(null);
      }
    } catch (e) {
      console.warn('[GDriveSection] Error loading auth state:', e);
    }
  }, [refreshStorageMetrics]);

  useEffect(() => {
    refreshAuthState();

    const handleAuthChanged = (e) => {
      const freshState = e.detail;
      setAuthState(freshState);
      if (freshState?.accessToken) {
        getGoogleDriveStorageQuota(freshState.accessToken).then(setQuota);
        refreshStorageMetrics(freshState.accessToken);
      } else {
        setQuota(null);
        setVaultStorage(null);
        refreshStorageMetrics(null);
      }
    };

    const handleSyncStatus = (e) => {
      const { status, message, step, total } = e.detail || {};
      if (status === 'syncing') {
        setIsSyncing(true);
        setSyncStatusMsg(message || `Syncing step ${step}/${total}…`);
      } else if (status === 'synced') {
        setIsSyncing(false);
        setSyncStatusMsg(message || 'In sync with Google Drive');
        setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        setErrorMsg('');
        // Refresh vault size after sync
        getGoogleDriveAuthState().then(state => {
          if (state?.accessToken) {
            refreshStorageMetrics(state.accessToken);
          }
        });
      } else if (status === 'error') {
        setIsSyncing(false);
        setErrorMsg(e.detail.error || 'Sync failed.');
      } else if (status === 'cancelled') {
        setIsSyncing(false);
      }
    };

    window.addEventListener('gdrive-auth-changed', handleAuthChanged);
    window.addEventListener('gdrive-sync-status', handleSyncStatus);

    return () => {
      window.removeEventListener('gdrive-auth-changed', handleAuthChanged);
      window.removeEventListener('gdrive-sync-status', handleSyncStatus);
    };
  }, [refreshAuthState, refreshStorageMetrics]);

  // Sign in with Google
  const handleSignIn = async () => {
    setErrorMsg('');
    setIsAuthenticating(true);
    try {
      const state = await requestGoogleDriveToken({ prompt: 'consent' });
      setAuthState(state);
      if (state?.accessToken) {
        const q = await getGoogleDriveStorageQuota(state.accessToken);
        setQuota(q);
      }
      // Immediately run initial sync check
      syncWithGoogleDrive({ force: false, onConflict });
    } catch (err) {
      console.error('[GDriveSection] Sign in error:', err);
      setErrorMsg(err.message || 'Failed to authenticate with Google.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Disconnect Google Drive
  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Google Drive? Your local flashcards and study history will remain completely safe on this device.')) {
      return;
    }
    try {
      await disconnectGoogleDrive();
      setAuthState(null);
      setQuota(null);
    } catch (err) {
      setErrorMsg(err.message || 'Error disconnecting account.');
    }
  };

  // Trigger Manual Sync
  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setErrorMsg('');
    try {
      const result = await syncWithGoogleDrive({ force: true, onConflict });
      if (!result.success && result.action === 'error') {
        setErrorMsg(result.message);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Sync encountered an error.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Save Custom Client ID
  const handleSaveCustomClientId = async () => {
    setIsSavingClientId(true);
    try {
      await saveCustomGoogleClientId(clientIdInput);
      setActiveClientId(clientIdInput.trim() || DEFAULT_GOOGLE_CLIENT_ID);
      setShowClientSettings(false);
    } catch (e) {
      setErrorMsg('Failed to save Client ID.');
    } finally {
      setIsSavingClientId(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const quotaPercent = quota?.limit && quota.limit > 0
    ? Math.min(100, Math.round((quota.usage / quota.limit) * 100))
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.12 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={isDark ? 'neu-card-dark p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl overflow-hidden' : 'neu-card-light p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl overflow-hidden'}
    >
      {/* Section Header Accordion Trigger */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 cursor-pointer text-left select-none"
      >
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${isDark ? 'neu-pressed-dark text-blue-400' : 'neu-pressed-light text-blue-600'}`}>
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-base font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Google Drive Cloud Sync
              </h2>
              {authState ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-green-500/15 text-green-400 border border-green-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Connected
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-gray-500/15 text-gray-400 border border-gray-500/30">
                  Offline Only
                </span>
              )}
            </div>
            <p className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Manifest-hashed delta synchronization directly to your personal Google Drive vault.
            </p>
          </div>
        </div>

        <div className={`p-2 rounded-xl transition ${isDark ? 'neu-btn-dark text-gray-300' : 'neu-btn-light text-gray-600'}`}>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Accordion Content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden pt-6 mt-6 border-t border-gray-500/10 space-y-6"
          >
            {/* Error Notification */}
            {errorMsg && (
              <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <div className="flex-1">
                  <strong>Sync Error:</strong> {errorMsg}
                </div>
              </div>
            )}

            {!authState ? (
              /* ── DISCONNECTED STATE ────────────────────────────── */
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-5"
              >
                <div className={`p-6 rounded-2xl border text-center flex flex-col items-center justify-center gap-4 ${
                  isDark ? 'neu-pressed-dark border-gray-800' : 'neu-pressed-light border-gray-200'
                }`}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-blue-600/10 text-blue-500 shadow-inner">
                    <Cloud className="w-6 h-6" />
                  </div>
                  <div className="max-w-md">
                    <h3 className={`text-sm font-black ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Sync Across All Your Devices
                    </h3>
                    <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Connect your Google account to automatically synchronize flashcards, study schedules, and textbook scans to a dedicated <span className="font-mono font-bold">AutoAnki_Sync_Vault</span> folder in your Google Drive.
                    </p>
                  </div>

                  {/* Google Sign In Button */}
                  <button
                    type="button"
                    onClick={handleSignIn}
                    disabled={isAuthenticating}
                    className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-bold text-xs shadow-lg active:scale-95 transition cursor-pointer ${
                      isDark
                        ? 'neu-btn-dark text-white border border-white/10 hover:border-white/20'
                        : 'neu-btn-light text-gray-800 border border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Google 'G' SVG Logo */}
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>{isAuthenticating ? 'Connecting to Google…' : 'Sign in with Google'}</span>
                  </button>

                  {/* Local App Storage Metric in Disconnected Mode */}
                  {localAppBytes != null && (
                    <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-[11px] font-mono ${
                      isDark ? 'neu-pressed-dark border-gray-800 text-gray-400' : 'neu-pressed-light border-gray-200 text-gray-600'
                    }`}>
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Local App Storage: <strong className={isDark ? 'text-gray-200' : 'text-gray-900'}>{formatBytes(localAppBytes)}</strong></span>
                    </div>
                  )}
                </div>

                {/* Client ID Configuration Collapsible */}
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setShowClientSettings(!showClientSettings)}
                    className={`text-[10px] font-bold uppercase tracking-wider transition ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    {showClientSettings ? 'Hide OAuth Settings' : 'Custom OAuth Client ID'}
                  </button>
                </div>

                {showClientSettings && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`p-4 rounded-2xl border space-y-3 ${isDark ? 'neu-pressed-dark border-gray-800' : 'neu-pressed-light border-gray-200'}`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-wider block text-blue-500">
                      Google OAuth 2.0 Client ID Configuration
                    </span>
                    <input
                      type="text"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      placeholder={DEFAULT_GOOGLE_CLIENT_ID}
                      className={`w-full p-2.5 rounded-xl text-xs font-mono border ${
                        isDark ? 'bg-slate-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setClientIdInput(DEFAULT_GOOGLE_CLIENT_ID)}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold ${isDark ? 'neu-btn-dark' : 'neu-btn-light'}`}
                      >
                        Reset Default
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveCustomClientId}
                        disabled={isSavingClientId}
                        className="px-4 py-1.5 rounded-xl text-[10px] font-bold bg-blue-600 text-white active:scale-95"
                      >
                        {isSavingClientId ? 'Saving…' : 'Save Client ID'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              /* ── CONNECTED STATE ──────────────────────────────── */
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Account Profile Card */}
                <div className={`p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  isDark ? 'neu-pressed-dark border-green-500/20' : 'neu-pressed-light border-green-200'
                }`}>
                  <div className="flex items-center gap-3.5">
                    {authState.user?.picture ? (
                      <img
                        src={authState.user.picture}
                        alt="User Avatar"
                        className="w-12 h-12 rounded-2xl object-cover border-2 border-green-500/40 shadow-md"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg bg-green-600 text-white shadow-md">
                        {authState.user?.name ? authState.user.name[0].toUpperCase() : 'G'}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {authState.user?.name || 'Google Account'}
                        </span>
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      </div>
                      <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {authState.user?.email || 'Authenticated'}
                      </span>
                    </div>
                  </div>

                  {/* Disconnect Button */}
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition active:scale-95 cursor-pointer ${
                      isDark ? 'neu-btn-dark text-red-400 hover:text-red-300' : 'neu-btn-light text-red-600 hover:text-red-700'
                    }`}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Disconnect
                  </button>
                </div>

                {/* Storage Quota & App Space Bar */}
                {quota ? (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 sm:p-5 rounded-2xl border space-y-3.5 ${
                      isDark ? 'neu-pressed-dark border-gray-800' : 'neu-pressed-light border-gray-200'
                    }`}
                  >
                    {/* Google Drive Account Total Usage */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="flex items-center gap-1.5">
                          <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                          Google Drive Storage Usage
                        </span>
                        <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
                          {formatBytes(quota.usage)} / {formatBytes(quota.limit)} ({quotaPercent}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-gray-500/20 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 rounded-full"
                          style={{ width: `${quotaPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* App Storage Breakdown Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      {/* Cloud Vault Storage */}
                      <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                        isDark ? 'neu-card-dark border-gray-800' : 'neu-card-light border-gray-200/80'
                      }`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 shrink-0">
                            <Cloud className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 truncate">
                              App Drive Vault
                            </div>
                            <div className={`text-xs font-black font-mono truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {vaultStorage ? formatBytes(vaultStorage.totalBytes) : (loadingStorage ? 'Calculating…' : '0 B')}
                            </div>
                          </div>
                        </div>
                        {vaultStorage && (vaultStorage.vaultFileCount > 0 || vaultStorage.mediaFileCount > 0) ? (
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                            {vaultStorage.vaultFileCount + vaultStorage.mediaFileCount} files
                          </span>
                        ) : null}
                      </div>

                      {/* Device Local Storage */}
                      <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                        isDark ? 'neu-card-dark border-gray-800' : 'neu-card-light border-gray-200/80'
                      }`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                            <Layers className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 truncate">
                              Local App Storage
                            </div>
                            <div className={`text-xs font-black font-mono truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {localAppBytes != null ? formatBytes(localAppBytes) : 'Calculating…'}
                            </div>
                          </div>
                        </div>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                          IndexedDB
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                    isDark ? 'neu-pressed-dark border-gray-800 text-gray-400' : 'neu-pressed-light border-gray-200 text-gray-500'
                  }`}>
                    <span className="text-xs font-bold flex items-center gap-2">
                      <HardDrive className="w-3.5 h-3.5 text-blue-400" /> Storage metrics ready
                    </span>
                    <span className="text-[10px] font-mono">
                      Local: {localAppBytes != null ? formatBytes(localAppBytes) : 'Ready'}
                    </span>
                  </div>
                )}

                {/* Sync Actions & Metrics */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                  <div className="text-xs space-y-0.5 text-left w-full sm:w-auto">
                    <span className={`block font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {syncStatusMsg || (lastSyncTime ? `Last synced at ${lastSyncTime}` : 'Cloud Vault ready')}
                    </span>
                    <span className="text-[10px] font-mono text-gray-500">
                      Vault: AutoAnki_Sync_Vault (Delta Hash Verified)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20 active:scale-95 transition cursor-pointer hover:opacity-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Synchronizing…' : 'Sync Now'}
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

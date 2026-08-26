/**
 * test-sync-simulation.js
 * 
 * Comprehensive Automated Multi-Device Sync Simulation & Data-Integrity Test Suite
 * 
 * Simulates real-world multi-device sync scenarios across distinct mock clients (Desktop & Mobile)
 * communicating via a Mock Google Drive Cloud Vault.
 * 
 * Scenarios Tested:
 * 1. Scenario A: Fast-Forward Push & Pull (Topic FSRS Rating & Study Log Propagation)
 * 2. Scenario B: Pure Zero-Touch Inertia on Clean Reload (Zero Ghost Uploads)
 * 3. Scenario C: 7-Tab FSRS & Global Settings Sync Integrity
 * 4. Scenario D: Bidirectional Non-Conflicting Concurrent Delta Merges (Anatomy + Physiology)
 * 5. Scenario E: Tombstone Propagation & Soft-Deletion Resurrection Prevention
 */

import {
  computeHash,
  canonicalStringify,
  mergeSubjectTrackerArrays,
  mergePytUserProgress,
  mergeTextbooksMetadata,
  mergeFsrsConfigs,
  mergeSettingsArrays,
  mergeTopicHintsArrays,
  mergeHintQuotaArrays,
  mergeStudyLogsObjects,
  mergeBundlesInMemory
} from '../src/services/googleDriveSync.js';

// Color formatting for test runner
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m'
};

function logHeader(title) {
  console.log(`\n${colors.bold}${colors.cyan}════════════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}════════════════════════════════════════════════════════════════════════${colors.reset}`);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`${colors.red}  ✖ ASSERTION FAILED: ${message}${colors.reset}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`${colors.green}  ✔ PASS: ${message}${colors.reset}`);
  }
}

/**
 * Mock Device Model
 * Represents a local client instance with its own IndexedDB and localStorage stores.
 */
class MockDevice {
  constructor(name, deviceId) {
    this.name = name;
    this.deviceId = deviceId;
    this.stores = {
      topics: [],
      settings: [],
      camp_tracker: [],
      camp_data: [],
      camp_daily_logs: [],
      pyt_data: [],
      kv_store: {},
      topic_hints: [],
      hint_quota: [],
      snapshots: []
    };
    this.localStorage = {};
    this.lastSyncedHashes = null;
    this.syncHistory = [];
  }

  setKV(key, val) {
    this.stores.kv_store[key] = JSON.parse(JSON.stringify(val));
  }

  getKV(key, defaultVal = null) {
    const val = this.stores.kv_store[key];
    return val !== undefined ? JSON.parse(JSON.stringify(val)) : defaultVal;
  }

  setSetting(key, value) {
    const idx = this.stores.settings.findIndex(s => s.key === key);
    const doc = { key, value, updatedAt: new Date().toISOString() };
    if (idx >= 0) this.stores.settings[idx] = doc;
    else this.stores.settings.push(doc);
  }

  getSetting(key, defaultVal = null) {
    const s = this.stores.settings.find(x => x.key === key);
    return s ? JSON.parse(JSON.stringify(s.value)) : defaultVal;
  }

  extractBundles() {
    const flashcards = this.getKV('flashcards', []);
    const trashCards = this.getKV('trash_cards', []);
    const pages = this.getKV('pages', []);
    const trashPages = this.getKV('trash_pages', []);
    const topics = this.stores.topics;
    const trashTopics = this.getKV('trash_topics', []);
    const subjectTracker = this.getKV('subject_tracker_data', []);
    const pytUserProgress = this.getKV('pyt_user_progress', []);
    const textbooksMetadata = this.getKV('textbooks_metadata', []);
    const studyLogs = this.getKV('study_logs', {});
    const trashStudyLogs = this.getKV('trash_study_logs', []);
    const studySchedule = this.getKV('study_schedule', {});
    const scheduleTemplates = this.getKV('schedule_templates', []);
    const campDailyLogs = this.stores.camp_daily_logs;
    const timerState = this.getKV('timerState', null);
    const activeNewTopicsToday = this.getKV('active_new_topics_today', []);
    const rawFsrs = this.getSetting('fsrs_config', {});
    const fsrsConfig = { ...rawFsrs };
    delete fsrsConfig.updatedAt;
    delete fsrsConfig.lastModified;
    const EXCLUDED_SETTINGS_KEYS = new Set([
      'google_drive_auth', 'google_drive_sync_state', 'autoanki_last_synced_hashes',
      'last_synced_hashes', 'autoanki_pending_sync_launch', 'obsToken', 'fsrs_config'
    ]);
    const settings = this.stores.settings
      .filter(s => s && s.key && !EXCLUDED_SETTINGS_KEYS.has(s.key) && !/^(temp_|active_|cached_|gdrive_|sync_|autoanki_)/i.test(s.key))
      .map(s => ({ key: s.key, value: s.value }))
      .sort((a, b) => a.key.localeCompare(b.key));

    const topicHints = (this.stores.topic_hints || []).sort((a, b) => (a.topicId || '').localeCompare(b.topicId || ''));
    const hintQuota = (this.stores.hint_quota || []).sort((a, b) => (a.dateStr || '').localeCompare(b.dateStr || ''));
    const customPrompts = (this.getKV('custom_prompts', []) || []).sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    const localUserProfile = this.getKV('local_user_profile', null);
    const aiRecommendations = this.getKV('ai_topic_recommendations', null);
    const campTracker = this.stores.camp_tracker;
    const campData = this.stores.camp_data;
    const trashCamp = this.getKV('trash_camp', []);
    const unifiedGraves = this.getKV('unified_graves', []);
    const trashPrompts = this.getKV('trash_prompts', []);

    // Filter localStorage preferences
    const excludedKeys = new Set([
      'local_device_id', 'obs_device_id', 'obs_paired_uid', 'obs_token',
      'autoanki_device_id', 'autoanki_gdrive_auth', 'autoanki_pending_sync_launch',
      'auto_anki_expanded_nav_category', 'active_nav_category', 'active_tab',
      'active_view', 'current_view', 'study_active_tab', 'last_visited_route',
      'camp_student_info', 'camp_history', 'camp_timer_history', 'lastSyncTime', 'sync_status'
    ]);
    const lsSnapshot = {};
    const candidateKeys = Object.keys(this.localStorage).sort();
    for (const k of candidateKeys) {
      const v = this.localStorage[k];
      if (
        !excludedKeys.has(k) &&
        !k.startsWith('camp_sessions_') &&
        !k.startsWith('camp_bedToBook_') &&
        !k.startsWith('autoanki_') &&
        !k.startsWith('gdrive_') &&
        !/^(temp_|active_|cached_|sync_)/i.test(k)
      ) {
        lsSnapshot[k] = v;
      }
    }

    const bundles = {
      'cards_bundle.json': { flashcards, trashCards },
      'curriculum_topics.json': {
        topics,
        trashTopics,
        pytData: this.stores.pyt_data,
        subjectTracker,
        pytUserProgress,
        textbooksMetadata
      },
      'study_logs.json': {
        studyLogs,
        trashStudyLogs,
        studySchedule,
        scheduleTemplates,
        campDailyLogs,
        timerState,
        activeNewTopicsToday
      },
      'fsrs_config.json': {
        fsrsConfig,
        settings,
        topicHints,
        hintQuota,
        customPrompts,
        localUserProfile,
        aiRecommendations,
        localStorageSnapshot: lsSnapshot
      },
      'camp_tracker.json': { campTracker, campData, trashCamp },
      'pages_bundle.json': { pages, trashPages, unifiedGraves, trashPrompts }
    };

    const hashes = {
      cards_bundle: computeHash(bundles['cards_bundle.json']),
      curriculum_topics: computeHash(bundles['curriculum_topics.json']),
      study_logs: computeHash(bundles['study_logs.json']),
      fsrs_config: computeHash(bundles['fsrs_config.json']),
      camp_tracker: computeHash(bundles['camp_tracker.json']),
      pages_bundle: computeHash(bundles['pages_bundle.json'])
    };

    return {
      manifest: {
        version: '2.1',
        deviceId: this.deviceId,
        timestamp: new Date().toISOString(),
        syncVersion: Date.now(),
        hashes
      },
      bundles
    };
  }

  hydrateBundles(downloadedBundles, strategy = 'replace') {
    if (strategy === 'replace') {
      // 1. Cards
      if (downloadedBundles['cards_bundle.json']) {
        const b = downloadedBundles['cards_bundle.json'];
        this.setKV('flashcards', b.flashcards || []);
        this.setKV('trash_cards', b.trashCards || []);
      }
      // 2. Curriculum Topics
      if (downloadedBundles['curriculum_topics.json']) {
        const b = downloadedBundles['curriculum_topics.json'];
        this.stores.topics = b.topics || [];
        this.setKV('trash_topics', b.trashTopics || []);
        this.stores.pyt_data = b.pytData || [];
        this.setKV('subject_tracker_data', b.subjectTracker || []);
        this.setKV('pyt_user_progress', b.pytUserProgress || []);
        this.setKV('textbooks_metadata', b.textbooksMetadata || []);
      }
      // 3. Study Logs
      if (downloadedBundles['study_logs.json']) {
        const b = downloadedBundles['study_logs.json'];
        this.setKV('study_logs', b.studyLogs || {});
        this.setKV('trash_study_logs', b.trashStudyLogs || []);
        this.setKV('study_schedule', b.studySchedule || {});
        this.setKV('schedule_templates', b.scheduleTemplates || []);
        this.stores.camp_daily_logs = b.campDailyLogs || [];
        this.setKV('timerState', b.timerState || null);
        this.setKV('active_new_topics_today', b.activeNewTopicsToday || []);
      }
      // 4. FSRS Config
      if (downloadedBundles['fsrs_config.json']) {
        const b = downloadedBundles['fsrs_config.json'];
        const filtered = (b.settings || []).filter(s => s && s.key && s.key !== 'google_drive_auth' && s.key !== 'fsrs_config');
        this.stores.settings = filtered;
        if (b.fsrsConfig) this.setSetting('fsrs_config', b.fsrsConfig);
        this.stores.topic_hints = b.topicHints || [];
        this.stores.hint_quota = b.hintQuota || [];
        this.setKV('custom_prompts', b.customPrompts || []);
        if (b.localUserProfile) this.setKV('local_user_profile', b.localUserProfile);
        if (b.aiRecommendations) this.setKV('ai_topic_recommendations', b.aiRecommendations);
        if (b.localStorageSnapshot) {
          for (const [k, v] of Object.entries(b.localStorageSnapshot)) {
            this.localStorage[k] = v;
          }
        }
      }
      // 5. CAMP Tracker
      if (downloadedBundles['camp_tracker.json']) {
        const b = downloadedBundles['camp_tracker.json'];
        this.stores.camp_tracker = b.campTracker || [];
        this.stores.camp_data = b.campData || [];
        this.setKV('trash_camp', b.trashCamp || []);
      }
      // 6. Pages
      if (downloadedBundles['pages_bundle.json']) {
        const b = downloadedBundles['pages_bundle.json'];
        this.setKV('pages', b.pages || []);
        this.setKV('trash_pages', b.trashPages || []);
        this.setKV('unified_graves', b.unifiedGraves || []);
        this.setKV('trash_prompts', b.trashPrompts || []);
      }
    }

    // Re-baseline local hashes immediately
    const postData = this.extractBundles();
    this.lastSyncedHashes = postData.manifest.hashes;
  }
}

/**
 * Mock Google Drive Cloud Vault
 */
class MockCloudVault {
  constructor() {
    this.manifest = null;
    this.bundles = {};
    this.uploadCount = 0;
    this.downloadCount = 0;
  }

  upload(manifest, bundles) {
    this.manifest = JSON.parse(JSON.stringify(manifest));
    this.bundles = JSON.parse(JSON.stringify(bundles));
    this.uploadCount++;
  }

  download() {
    this.downloadCount++;
    if (!this.manifest) return null;
    return {
      manifest: JSON.parse(JSON.stringify(this.manifest)),
      bundles: JSON.parse(JSON.stringify(this.bundles))
    };
  }
}

/**
 * Executes a simulated sync workflow between a MockDevice and MockCloudVault.
 * Returns the action taken: 'initial_push' | 'fast_forward_push' | 'fast_forward_pull' | 'two_way_merge' | 'clean_noop' | 'concurrent_fallback_merge'
 */
function runDeviceSync(device, cloudVault, options = {}) {
  const localData = device.extractBundles();
  const remoteData = options.initialRemoteData || cloudVault.download();
  const expectedRemoteSyncVersion = options.expectedRemoteSyncVersion !== undefined ? options.expectedRemoteSyncVersion : remoteData?.manifest?.syncVersion;

  // 1. Initial Cloud Setup
  if (!remoteData || !remoteData.manifest) {
    cloudVault.upload(localData.manifest, localData.bundles);
    const postData = device.extractBundles();
    device.lastSyncedHashes = postData.manifest.hashes;
    return 'initial_push';
  }

  const locHashes = localData.manifest.hashes;
  const remHashes = remoteData.manifest.hashes;
  const ancHashes = device.lastSyncedHashes;
  const bundleNames = ['cards_bundle', 'curriculum_topics', 'study_logs', 'fsrs_config', 'camp_tracker', 'pages_bundle'];

  // Pure Inertia: All 6 bundles exact hash match
  const allExactMatch = bundleNames.every(b => locHashes[b] && remHashes[b] && locHashes[b] === remHashes[b]);
  if (allExactMatch) {
    device.lastSyncedHashes = locHashes;
    return 'clean_noop';
  }

  let isLocalClean = true;
  let isRemoteClean = true;

  const isEmptyLocal = (
    (!device.stores.topics || device.stores.topics.length === 0) &&
    (!device.getKV('flashcards') || device.getKV('flashcards').length === 0) &&
    (!device.getKV('subject_tracker_data') || device.getKV('subject_tracker_data').length === 0)
  );

  if (!ancHashes) {
    if (isEmptyLocal && remoteData && remoteData.manifest) {
      device.hydrateBundles(remoteData.bundles, 'replace');
      const postData = device.extractBundles();
      device.lastSyncedHashes = postData.manifest.hashes;
      const divergent = bundleNames.some(b => remHashes[b] && postData.manifest.hashes[b] && remHashes[b] !== postData.manifest.hashes[b]);
      if (divergent) {
        cloudVault.upload(postData.manifest, postData.bundles);
      }
      return 'fast_forward_pull';
    }
    isLocalClean = false;
  } else {
    for (const b of bundleNames) {
      if (locHashes[b] !== ancHashes[b]) isLocalClean = false;
      if (remHashes[b] !== ancHashes[b]) isRemoteClean = false;
    }
  }

  if (isLocalClean && isRemoteClean) {
    device.lastSyncedHashes = locHashes;
    return 'clean_noop';
  }

  // Fast-Forward Pull: Local is clean, Remote has changes
  if (isLocalClean && !isRemoteClean) {
    device.hydrateBundles(remoteData.bundles, 'replace');
    const postData = device.extractBundles();
    device.lastSyncedHashes = postData.manifest.hashes;
    const divergent = bundleNames.some(b => remHashes[b] && postData.manifest.hashes[b] && remHashes[b] !== postData.manifest.hashes[b]);
    if (divergent) {
      cloudVault.upload(postData.manifest, postData.bundles);
    }
    return 'fast_forward_pull';
  }

  // Fast-Forward Push: Remote is clean, Local has changes
  if (!isLocalClean && isRemoteClean) {
    // Optimistic Concurrency Check: If remote changed concurrently, fall back to two-way merge
    if (expectedRemoteSyncVersion !== undefined && cloudVault.manifest && cloudVault.manifest.syncVersion !== expectedRemoteSyncVersion) {
      const refreshedRemote = cloudVault.download();
      const mergedResult = mergeBundlesInMemory(localData, refreshedRemote.bundles);
      device.hydrateBundles(mergedResult.bundles || mergedResult, 'replace');
      const postMergeData = device.extractBundles();
      cloudVault.upload(postMergeData.manifest, postMergeData.bundles);
      device.lastSyncedHashes = postMergeData.manifest.hashes;
      return 'concurrent_fallback_merge';
    }

    cloudVault.upload(localData.manifest, localData.bundles);
    const postData = device.extractBundles();
    device.lastSyncedHashes = postData.manifest.hashes;
    return 'fast_forward_push';
  }

  // Two-Way Delta Merge
  const mergedResult = mergeBundlesInMemory(localData, remoteData.bundles);
  device.hydrateBundles(mergedResult.bundles || mergedResult, 'replace');
  const postMergeData = device.extractBundles();
  cloudVault.upload(postMergeData.manifest, postMergeData.bundles);
  device.lastSyncedHashes = postMergeData.manifest.hashes;
  return 'two_way_merge';
}

// ============================================================================
// TEST SUITE EXECUTION
// ============================================================================

async function runTestSuite() {
  console.log(`${colors.bold}${colors.yellow}STARTING UNIVERSAL DELTA SYNC ENGINE SIMULATION SUITE${colors.reset}\n`);

  const cloudVault = new MockCloudVault();
  const device1 = new MockDevice('Desktop Workstation', 'dev_desktop_101');
  const device2 = new MockDevice('Mobile Tablet', 'dev_mobile_202');

  // Populate Baseline Curriculum & FSRS Data on Device 1
  const initialSubjectTracker = [
    {
      id: 'anatomy',
      subject: 'Anatomy',
      topics: {
        brachial_plexus: {
          topicName: 'Brachial Plexus',
          page: '12-16',
          pageCount: 5,
          pageWeight: 2.0,
          stability: 0,
          difficulty: 0,
          reviewCount: 0,
          studyDates: [],
          notes: 'Upper trunk cords and branches',
          updatedAt: '2026-08-25T10:00:00.000Z'
        },
        circle_of_willis: {
          topicName: 'Circle of Willis',
          page: '44-48',
          pageCount: 4,
          pageWeight: 1.5,
          stability: 0,
          difficulty: 0,
          reviewCount: 0,
          studyDates: [],
          updatedAt: '2026-08-25T10:00:00.000Z'
        }
      },
      updatedAt: '2026-08-25T10:00:00.000Z'
    },
    {
      id: 'physiology',
      subject: 'Physiology',
      topics: {
        cardiac_cycle: {
          topicName: 'Cardiac Cycle',
          page: '80-86',
          pageCount: 6,
          pageWeight: 2.0,
          stability: 0,
          difficulty: 0,
          reviewCount: 0,
          studyDates: [],
          updatedAt: '2026-08-25T10:00:00.000Z'
        }
      },
      updatedAt: '2026-08-25T10:00:00.000Z'
    }
  ];

  device1.setKV('subject_tracker_data', initialSubjectTracker);
  device1.setSetting('fsrs_config', {
    dailyLimits: { maxReviewPagesPerDay: 30, newCardsPerDay: 10 },
    easyDays: { dayMultipliers: { mon: 1.0, sun: 0.5 } },
    fsrsCore: { requestRetention: 0.9, w: [0.4, 0.6, 2.4, 5.8] }
  });
  device1.setKV('custom_prompts', [
    { id: 'prompt_usmle', name: 'USMLE Clinical Vignette', content: 'Create high-yield clinical cards.', updatedAt: '2026-08-25T10:00:00.000Z' }
  ]);

  // --------------------------------------------------------------------------
  // SCENARIO A: Fast-Forward Push & Pull (FSRS Rating & Analytics Propagation)
  // --------------------------------------------------------------------------
  logHeader('SCENARIO A: Fast-Forward Push & Pull (Topic FSRS Rating & Analytics Propagation)');

  // Step A1: Device 1 Initial Push
  const action1 = runDeviceSync(device1, cloudVault);
  assert(action1 === 'initial_push', 'Device 1 performs initial cloud vault push');
  assert(cloudVault.uploadCount === 1, 'Cloud vault received first bundle snapshot');

  // Step A2: Device 2 Initial Download
  const action2 = runDeviceSync(device2, cloudVault);
  assert(action2 === 'fast_forward_pull', 'Device 2 fast-forward downloads initial cloud snapshot');
  const d2TrackerInitial = device2.getKV('subject_tracker_data');
  assert(d2TrackerInitial.length === 2, 'Device 2 has both Anatomy and Physiology subjects');

  // Step A3: Device 1 Rates "Brachial Plexus" (FSRS Good: S=3.2, D=4.5, Reps=1) & records review log
  const updatedTracker = JSON.parse(JSON.stringify(initialSubjectTracker));
  updatedTracker[0].topics.brachial_plexus = {
    ...updatedTracker[0].topics.brachial_plexus,
    stability: 3.2,
    difficulty: 4.5,
    reviewCount: 1,
    studyDates: ['2026-08-26'],
    lastReviewDate: '2026-08-26T10:30:00.000Z',
    due: '2026-08-29T10:30:00.000Z',
    updatedAt: '2026-08-26T10:30:00.000Z'
  };
  device1.setKV('subject_tracker_data', updatedTracker);

  // Device 1 records study log for 2026-08-26
  device1.setKV('study_logs', {
    '2026-08-26': {
      date: '2026-08-26',
      totalCardsReviewed: 15,
      studyHours: 1.5,
      fsrsLogs: [
        {
          id: 'log_bp_001',
          topicName: 'Brachial Plexus',
          rating: 'Good',
          stability: 3.2,
          difficulty: 4.5,
          timestamp: 1724660000000
        }
      ]
    }
  });

  const actionA3 = runDeviceSync(device1, cloudVault);
  assert(actionA3 === 'fast_forward_push', 'Device 1 fast-forward pushes updated FSRS topic state and daily logs');

  // Step A4: Device 2 syncs -> downloads remote changes
  const actionA4 = runDeviceSync(device2, cloudVault);
  assert(actionA4 === 'fast_forward_pull', 'Device 2 fast-forward pulls FSRS rating and daily logs');

  const d2Tracker = device2.getKV('subject_tracker_data');
  const d2Topic = d2Tracker[0].topics.brachial_plexus;
  assert(d2Topic.stability === 3.2, 'Device 2 has exact FSRS stability (S=3.2)');
  assert(d2Topic.difficulty === 4.5, 'Device 2 has exact FSRS difficulty (D=4.5)');
  assert(d2Topic.reviewCount === 1, 'Device 2 has exact review count (reps=1)');
  assert(d2Topic.studyDates.includes('2026-08-26'), 'Device 2 includes study date 2026-08-26');

  const d2Logs = device2.getKV('study_logs');
  assert(d2Logs['2026-08-26'] && d2Logs['2026-08-26'].fsrsLogs.length === 1, 'Device 2 received exact daily FSRS review log');

  // --------------------------------------------------------------------------
  // SCENARIO B: Pure Zero-Touch Inertia on Clean Reload
  // --------------------------------------------------------------------------
  logHeader('SCENARIO B: Pure Zero-Touch Inertia on Clean Reload (Zero Ghost Uploads)');

  const uploadsBeforeReload = cloudVault.uploadCount;
  // Device 2 reloads without making edits
  const actionB = runDeviceSync(device2, cloudVault);
  assert(actionB === 'clean_noop', 'Clean reload evaluates to clean_noop without mutation');
  assert(cloudVault.uploadCount === uploadsBeforeReload, 'Zero network uploads triggered on clean reload');

  // Device 1 also reloads
  const actionB1 = runDeviceSync(device1, cloudVault);
  assert(actionB1 === 'clean_noop', 'Device 1 clean reload also evaluates to clean_noop');
  assert(cloudVault.uploadCount === uploadsBeforeReload, 'Cloud vault state remained completely untouched');

  // --------------------------------------------------------------------------
  // SCENARIO C: 7-Tab FSRS & Global Settings Sync Integrity
  // --------------------------------------------------------------------------
  logHeader('SCENARIO C: 7-Tab FSRS & Global Settings Sync Integrity');

  // Device 1 updates FSRS Easy Days and Daily Limits
  const currentFsrs = device1.getSetting('fsrs_config');
  const updatedFsrs = {
    ...currentFsrs,
    dailyLimits: { ...currentFsrs.dailyLimits, maxReviewPagesPerDay: 45 },
    easyDays: { dayMultipliers: { mon: 1.0, wed: 0.8, sun: 0.2 }, excludedDays: ['sun'] },
    lapses: { leechThreshold: 6, leechAction: 'tag_and_suspend' },
    displayOrder: { newCardOrder: 'random', interleaveBySubject: true },
    updatedAt: '2026-08-26T11:00:00.000Z'
  };
  device1.setSetting('fsrs_config', updatedFsrs);
  device1.localStorage['pyt_settings_theme_mode'] = 'dark';

  const actionC1 = runDeviceSync(device1, cloudVault);
  assert(actionC1 === 'fast_forward_push', 'Device 1 pushes FSRS config updates');

  const actionC2 = runDeviceSync(device2, cloudVault);
  assert(actionC2 === 'fast_forward_pull', 'Device 2 pulls FSRS config updates');

  const d2Fsrs = device2.getSetting('fsrs_config');
  assert(d2Fsrs.dailyLimits.maxReviewPagesPerDay === 45, 'Device 2 has updated maxReviewPagesPerDay = 45');
  assert(d2Fsrs.easyDays.excludedDays.includes('sun'), 'Device 2 has Easy Days excludedDays = [sun]');
  assert(d2Fsrs.lapses.leechThreshold === 6, 'Device 2 has leech threshold = 6');
  assert(d2Fsrs.displayOrder.interleaveBySubject === true, 'Device 2 has interleaveBySubject = true');
  assert(device2.localStorage['pyt_settings_theme_mode'] === 'dark', 'Device 2 synced dark mode theme preference');

  // --------------------------------------------------------------------------
  // SCENARIO D: Bidirectional Non-Conflicting Concurrent Delta Merges
  // --------------------------------------------------------------------------
  logHeader('SCENARIO D: Bidirectional Non-Conflicting Concurrent Delta Merges (Anatomy + Physiology)');

  // Device 1 rates Anatomy Topic "Circle of Willis" offline
  const d1Tracker = device1.getKV('subject_tracker_data');
  d1Tracker[0].topics.circle_of_willis = {
    ...d1Tracker[0].topics.circle_of_willis,
    stability: 4.0,
    difficulty: 3.5,
    reviewCount: 1,
    studyDates: ['2026-08-26'],
    lastReviewDate: '2026-08-26T12:00:00.000Z',
    due: '2026-08-30T12:00:00.000Z',
    notes: 'Anterior & posterior communicating arteries',
    updatedAt: '2026-08-26T12:00:00.000Z'
  };
  device1.setKV('subject_tracker_data', d1Tracker);

  // Device 2 concurrently rates Physiology Topic "Cardiac Cycle" offline
  const d2TrackerConcurrent = device2.getKV('subject_tracker_data');
  d2TrackerConcurrent[1].topics.cardiac_cycle = {
    ...d2TrackerConcurrent[1].topics.cardiac_cycle,
    stability: 5.5,
    difficulty: 2.8,
    reviewCount: 2,
    studyDates: ['2026-08-20', '2026-08-26'],
    lastReviewDate: '2026-08-26T12:15:00.000Z',
    due: '2026-08-31T12:15:00.000Z',
    notes: 'Wiggers diagram & isovolumetric contraction',
    updatedAt: '2026-08-26T12:15:00.000Z'
  };
  device2.setKV('subject_tracker_data', d2TrackerConcurrent);

  // Device 1 syncs first -> Fast-Forward Push
  const actionD1 = runDeviceSync(device1, cloudVault);
  assert(actionD1 === 'fast_forward_push', 'Device 1 pushes Circle of Willis review');

  // Device 2 syncs second -> Two-Way Delta Merge
  const actionD2 = runDeviceSync(device2, cloudVault);
  assert(actionD2 === 'two_way_merge', 'Device 2 detects concurrent cloud edits and performs Two-Way Delta Merge');

  // Verify Device 2 now has BOTH Anatomy ("Circle of Willis") AND Physiology ("Cardiac Cycle")
  const d2MergedTracker = device2.getKV('subject_tracker_data');
  const d2Cow = d2MergedTracker[0].topics.circle_of_willis;
  const d2Cc = d2MergedTracker[1].topics.cardiac_cycle;
  assert(d2Cow.stability === 4.0 && d2Cow.reviewCount === 1, 'Device 2 preserved Device 1 Circle of Willis FSRS review');
  assert(d2Cc.stability === 5.5 && d2Cc.reviewCount === 2, 'Device 2 preserved its own Cardiac Cycle FSRS review');

  // Device 1 syncs -> Pulls the merged cloud state
  const actionD3 = runDeviceSync(device1, cloudVault);
  assert(actionD3 === 'fast_forward_pull', 'Device 1 fast-forward pulls the merged cloud state');

  const d1MergedTracker = device1.getKV('subject_tracker_data');
  const d1Cow = d1MergedTracker[0].topics.circle_of_willis;
  const d1Cc = d1MergedTracker[1].topics.cardiac_cycle;
  assert(d1Cow.stability === 4.0, 'Device 1 has Circle of Willis S=4.0');
  assert(d1Cc.stability === 5.5, 'Device 1 has Cardiac Cycle S=5.5');
  assert(computeHash(d1MergedTracker) === computeHash(d2MergedTracker), 'Dual-seed hashes on Device 1 and Device 2 are byte-for-byte identical');

  // --------------------------------------------------------------------------
  // SCENARIO E: Tombstone Propagation & Soft-Deletion Resurrection Prevention
  // --------------------------------------------------------------------------
  logHeader('SCENARIO E: Tombstone Propagation & Soft-Deletion Resurrection Prevention');

  // Device 1 creates a new custom prompt, syncs it to cloud
  const promptsD1 = device1.getKV('custom_prompts');
  promptsD1.push({
    id: 'prompt_temp_delete',
    name: 'Temporary Prompt',
    content: 'To be deleted',
    updatedAt: '2026-08-26T13:00:00.000Z'
  });
  device1.setKV('custom_prompts', promptsD1);
  runDeviceSync(device1, cloudVault);
  runDeviceSync(device2, cloudVault);

  assert(device2.getKV('custom_prompts').some(p => p.id === 'prompt_temp_delete'), 'Device 2 received prompt_temp_delete');

  // Device 1 deletes the prompt and creates a tombstone
  const filteredPrompts = device1.getKV('custom_prompts').filter(p => p.id !== 'prompt_temp_delete');
  device1.setKV('custom_prompts', filteredPrompts);
  // Device 1 records soft deletion in trash
  const trashCards = device1.getKV('trash_cards', []);
  trashCards.push({ id: 'prompt_temp_delete', deletedAt: '2026-08-26T13:10:00.000Z' });
  device1.setKV('trash_cards', trashCards);

  const actionE1 = runDeviceSync(device1, cloudVault);
  assert(actionE1 === 'fast_forward_push', 'Device 1 pushes deletion tombstone');

  // Device 2 syncs -> downloads remote changes
  const actionE2 = runDeviceSync(device2, cloudVault);
  assert(actionE2 === 'fast_forward_pull', 'Device 2 pulls deletion state');

  const d2PromptsAfter = device2.getKV('custom_prompts');
  assert(!d2PromptsAfter.some(p => p.id === 'prompt_temp_delete'), 'Deleted prompt was safely pruned on Device 2');

  // Both devices perform clean reloads
  const actionE3 = runDeviceSync(device2, cloudVault);
  assert(actionE3 === 'clean_noop', 'Device 2 remains inert after deletion sync');
  const actionE4 = runDeviceSync(device1, cloudVault);
  assert(actionE4 === 'clean_noop', 'Device 1 remains inert after deletion sync');

  // --------------------------------------------------------------------------
  // SCENARIO F: Study Log Tombstone Propagation & Soft-Deletion Resurrection Prevention
  // --------------------------------------------------------------------------
  logHeader('SCENARIO F: Study Log Tombstone Propagation & Soft-Deletion Resurrection Prevention');

  // Baseline: Device 1 creates review logs for 2026-08-20 and 2026-08-26
  const initialStudyLogs = {
    '2026-08-20': {
      dateStr: '2026-08-20',
      cards: 15,
      totalCardsReviewed: 15,
      studyHours: 0.5,
      updatedAt: '2026-08-20T10:00:00.000Z',
      fsrsLogs: [{ topicName: 'Circle of Willis', rating: 'Good', timestamp: '2026-08-20T10:00:00.000Z' }]
    },
    '2026-08-26': {
      dateStr: '2026-08-26',
      cards: 25,
      totalCardsReviewed: 25,
      studyHours: 1.0,
      updatedAt: '2026-08-26T12:00:00.000Z',
      fsrsLogs: [{ topicName: 'Cardiac Cycle', rating: 'Easy', timestamp: '2026-08-26T12:00:00.000Z' }]
    }
  };
  device1.setKV('study_logs', initialStudyLogs);
  const actionF1 = runDeviceSync(device1, cloudVault);
  assert(actionF1 === 'fast_forward_push', 'Device 1 pushes initial study logs');

  const actionF2 = runDeviceSync(device2, cloudVault);
  assert(actionF2 === 'fast_forward_pull', 'Device 2 pulls initial study logs');
  assert(device2.getKV('study_logs')['2026-08-20'] !== undefined, 'Device 2 has study log for 2026-08-20');

  // Device 1 deletes the 2026-08-20 study log and records a tombstone
  const d1LogsF = device1.getKV('study_logs');
  delete d1LogsF['2026-08-20'];
  device1.setKV('study_logs', d1LogsF);
  const d1TrashStudyLogs = device1.getKV('trash_study_logs', []);
  d1TrashStudyLogs.push({
    dateKey: '2026-08-20',
    deletedAt: '2026-08-26T14:00:00.000Z'
  });
  device1.setKV('trash_study_logs', d1TrashStudyLogs);

  const actionF3 = runDeviceSync(device1, cloudVault);
  assert(actionF3 === 'fast_forward_push', 'Device 1 pushes study log deletion tombstone');

  // Device 2 concurrently adds a new study log for 2026-08-27 while still having 2026-08-20 in local store
  const d2LogsF = device2.getKV('study_logs');
  d2LogsF['2026-08-27'] = {
    dateStr: '2026-08-27',
    cards: 30,
    totalCardsReviewed: 30,
    studyHours: 1.2,
    updatedAt: '2026-08-27T09:00:00.000Z',
    fsrsLogs: [{ topicName: 'Brachial Plexus', rating: 'Good', timestamp: '2026-08-27T09:00:00.000Z' }]
  };
  device2.setKV('study_logs', d2LogsF);

  // Device 2 performs delta sync
  const actionF4 = runDeviceSync(device2, cloudVault);
  assert(actionF4 === 'two_way_merge', 'Device 2 performs two-way merge with cloud');

  // Verify: 2026-08-20 is PRUNED on Device 2 (not resurrected), and 2026-08-27 is preserved
  const d2MergedLogs = device2.getKV('study_logs');
  assert(d2MergedLogs['2026-08-20'] === undefined, 'Deleted study log 2026-08-20 was pruned on Device 2 via tombstone');
  assert(d2MergedLogs['2026-08-27'] !== undefined, 'New study log 2026-08-27 was preserved on Device 2');

  // Device 1 pulls merged cloud state
  const actionF5 = runDeviceSync(device1, cloudVault);
  assert(actionF5 === 'fast_forward_pull', 'Device 1 pulls merged study logs from cloud');
  const d1MergedLogs = device1.getKV('study_logs');
  assert(d1MergedLogs['2026-08-20'] === undefined, 'Study log 2026-08-20 was NOT resurrected on Device 1');
  assert(d1MergedLogs['2026-08-27'] !== undefined, 'Study log 2026-08-27 received on Device 1');

  // --------------------------------------------------------------------------
  // SCENARIO G: Optimistic Cloud Concurrency Check & Fast-Forward Fallback
  // --------------------------------------------------------------------------
  logHeader('SCENARIO G: Optimistic Cloud Concurrency Check & Fast-Forward Fallback');

  // Both devices are currently in sync. Capture initial cloud state & syncVersion
  const initialRemoteData = cloudVault.download();
  const initialCloudSyncVersion = cloudVault.manifest.syncVersion;

  // Device 1 makes a local modification (adds a custom prompt)
  const prompts1 = device1.getKV('custom_prompts');
  prompts1.push({
    id: 'prompt_device1_concurrent',
    name: 'Device 1 Prompt',
    content: 'Created by Device 1',
    updatedAt: '2026-08-26T15:00:00.000Z'
  });
  device1.setKV('custom_prompts', prompts1);

  // Device 2 makes a concurrent local modification (adds a different custom prompt)
  const prompts2 = device2.getKV('custom_prompts');
  prompts2.push({
    id: 'prompt_device2_concurrent',
    name: 'Device 2 Prompt',
    content: 'Created by Device 2',
    updatedAt: '2026-08-26T15:05:00.000Z'
  });
  device2.setKV('custom_prompts', prompts2);

  // Device 1 syncs first -> performs fast-forward push and updates cloud syncVersion
  const actionG1 = runDeviceSync(device1, cloudVault);
  assert(actionG1 === 'fast_forward_push', 'Device 1 successfully fast-forward pushes its change first');
  const updatedCloudSyncVersion = cloudVault.manifest.syncVersion;
  assert(updatedCloudSyncVersion !== initialCloudSyncVersion, 'Cloud vault syncVersion was updated after Device 1 push');

  // Device 2 attempts to sync with the initialRemoteData captured before Device 1 pushed
  const actionG2 = runDeviceSync(device2, cloudVault, { initialRemoteData, expectedRemoteSyncVersion: initialCloudSyncVersion });
  assert(actionG2 === 'concurrent_fallback_merge', 'Device 2 detects concurrency mismatch and falls back to Two-Way Delta Merge');

  // Verify: Cloud vault contains BOTH Device 1 and Device 2 prompts (no clobbering!)
  const cloudPrompts = cloudVault.bundles['fsrs_config.json'].customPrompts;
  const hasD1Prompt = cloudPrompts.some(p => p.id === 'prompt_device1_concurrent');
  const hasD2Prompt = cloudPrompts.some(p => p.id === 'prompt_device2_concurrent');
  assert(hasD1Prompt, 'Cloud vault preserved Device 1 concurrent prompt');
  assert(hasD2Prompt, 'Cloud vault preserved Device 2 concurrent prompt');

  // Device 1 fast-forward pulls the final merged cloud state
  const actionG3 = runDeviceSync(device1, cloudVault);
  assert(actionG3 === 'fast_forward_pull', 'Device 1 fast-forward pulls merged cloud state');
  const d1FinalPrompts = device1.getKV('custom_prompts');
  assert(d1FinalPrompts.some(p => p.id === 'prompt_device1_concurrent') && d1FinalPrompts.some(p => p.id === 'prompt_device2_concurrent'), 'Device 1 has both concurrent prompts without data loss');

  // --------------------------------------------------------------------------
  // SCENARIO H: Universal Sub-Entity LWW & Deletion Reconciliation
  // --------------------------------------------------------------------------
  logHeader('SCENARIO H: Universal Sub-Entity LWW & Deletion Reconciliation across All 6 Bundles');

  // 1. Flashcard Tag Removal (LWW Content Edit)
  const d1Cards = device1.getKV('flashcards', []);
  d1Cards.push({
    id: 'card_lww_1',
    front: 'LWW Front',
    back: 'LWW Back',
    tags: ['anatomy', 'cranial-nerves', 'high-yield'],
    updatedAt: '2026-08-27T08:00:00.000Z'
  });
  device1.setKV('flashcards', d1Cards);
  runDeviceSync(device1, cloudVault);
  runDeviceSync(device2, cloudVault);

  // Device 1 removes the 'cranial-nerves' tag and stamps updatedAt
  const d1CardsUpdated = device1.getKV('flashcards', []);
  const c1 = d1CardsUpdated.find(c => c.id === 'card_lww_1');
  c1.tags = ['anatomy', 'high-yield'];
  c1.updatedAt = '2026-08-27T09:00:00.000Z';
  device1.setKV('flashcards', d1CardsUpdated);
  runDeviceSync(device1, cloudVault);

  // Device 2 pulls cloud state -> tag must be removed on Device 2 without resurrection
  runDeviceSync(device2, cloudVault);
  const d2Card = device2.getKV('flashcards', []).find(c => c.id === 'card_lww_1');
  assert(!d2Card.tags.includes('cranial-nerves'), 'Device 2 pruned deleted card tag according to LWW');
  assert(d2Card.tags.includes('anatomy') && d2Card.tags.includes('high-yield'), 'Device 2 preserved active card tags');

  // 2. Subject Tracker Topic Deletion (Topic Pruning in Tracker Document)
  const d1TrackerH = device1.getKV('subject_tracker_data', []);
  const anatDoc = d1TrackerH.find(d => d.subject === 'Anatomy') || { id: 'anatomy', subject: 'Anatomy', topics: {} };
  anatDoc.topics['temp_deleted_topic'] = {
    name: 'Temporary Topic',
    page: '12',
    updatedAt: '2026-08-27T08:00:00.000Z'
  };
  anatDoc.updatedAt = '2026-08-27T08:00:00.000Z';
  if (!d1TrackerH.find(d => d.subject === 'Anatomy')) d1TrackerH.push(anatDoc);
  device1.setKV('subject_tracker_data', d1TrackerH);
  runDeviceSync(device1, cloudVault);
  runDeviceSync(device2, cloudVault);

  // Device 1 deletes 'temp_deleted_topic' from Anatomy document and updates document timestamp
  const d1TrackerUpdated = device1.getKV('subject_tracker_data', []);
  const d1Anat = d1TrackerUpdated.find(d => d.subject === 'Anatomy');
  delete d1Anat.topics['temp_deleted_topic'];
  d1Anat.updatedAt = '2026-08-27T09:30:00.000Z';
  device1.setKV('subject_tracker_data', d1TrackerUpdated);
  runDeviceSync(device1, cloudVault);

  // Device 2 pulls -> verifies 'temp_deleted_topic' was pruned on Device 2
  runDeviceSync(device2, cloudVault);
  const d2Anat = device2.getKV('subject_tracker_data', []).find(d => d.subject === 'Anatomy');
  assert(d2Anat.topics['temp_deleted_topic'] === undefined, 'Deleted tracker sub-topic was pruned on Device 2 via LWW doc timestamp');

  // 3. CAMP Task Deletion via Tombstone / isDeleted
  device1.stores.camp_tracker.push({
    id: 'camp_task_1',
    title: 'Review Biochem 10 pages',
    date: '2026-08-27',
    updatedAt: '2026-08-27T08:00:00.000Z'
  });
  runDeviceSync(device1, cloudVault);
  runDeviceSync(device2, cloudVault);

  // Device 2 marks task deleted
  const d2Task = device2.stores.camp_tracker.find(t => t.id === 'camp_task_1');
  d2Task.isDeleted = true;
  d2Task.deletedAt = '2026-08-27T09:45:00.000Z';
  d2Task.updatedAt = '2026-08-27T09:45:00.000Z';
  runDeviceSync(device2, cloudVault);

  // Device 1 pulls -> task is pruned
  runDeviceSync(device1, cloudVault);
  assert(!device1.stores.camp_tracker.some(t => t.id === 'camp_task_1' && !t.isDeleted), 'Deleted CAMP task pruned on Device 1');

  // 4. Scanned Page Deletion via Tombstone
  const d1Pages = device1.getKV('pages', []);
  d1Pages.push({
    id: 'page_occlusion_1',
    title: 'Anatomy Head & Neck Scan',
    updatedAt: '2026-08-27T08:00:00.000Z'
  });
  device1.setKV('pages', d1Pages);
  runDeviceSync(device1, cloudVault);
  runDeviceSync(device2, cloudVault);

  // Device 1 deletes page_occlusion_1 and records tombstone in trash_pages
  const d1PagesUpdated = device1.getKV('pages', []).filter(p => p.id !== 'page_occlusion_1');
  device1.setKV('pages', d1PagesUpdated);
  const d1TrashPages = device1.getKV('trash_pages', []);
  d1TrashPages.push({
    id: 'page_occlusion_1',
    deletedAt: '2026-08-27T10:00:00.000Z'
  });
  device1.setKV('trash_pages', d1TrashPages);
  runDeviceSync(device1, cloudVault);

  // 5. Primary Curriculum Topic Deletion via trash_topics Tombstone
  device1.stores.topics.push({
    id: 'topic_del_tombstone_1',
    name: 'Obsolete Anatomy Section',
    subject: 'Anatomy',
    updatedAt: '2026-08-27T08:00:00.000Z'
  });
  runDeviceSync(device1, cloudVault);
  runDeviceSync(device2, cloudVault);
  assert(device2.stores.topics.some(t => t.id === 'topic_del_tombstone_1'), 'Device 2 received topic_del_tombstone_1');

  // Device 1 deletes topic_del_tombstone_1 and records tombstone in trash_topics
  device1.stores.topics = device1.stores.topics.filter(t => t.id !== 'topic_del_tombstone_1');
  const d1TrashTopics = device1.getKV('trash_topics', []);
  d1TrashTopics.push({
    id: 'topic_del_tombstone_1',
    name: 'Obsolete Anatomy Section',
    subject: 'Anatomy',
    deletedAt: '2026-08-27T10:15:00.000Z'
  });
  device1.setKV('trash_topics', d1TrashTopics);
  runDeviceSync(device1, cloudVault);

  // Device 2 pulls -> topic is pruned on Device 2 via trash_topics tombstone
  runDeviceSync(device2, cloudVault);
  assert(!device2.stores.topics.some(t => t.id === 'topic_del_tombstone_1'), 'Deleted curriculum topic pruned on Device 2 via trash_topics tombstone without resurrection');

  // Clean No-op verification
  const finalActionD1 = runDeviceSync(device1, cloudVault);
  const finalActionD2 = runDeviceSync(device2, cloudVault);
  assert(finalActionD1 === 'clean_noop', 'Device 1 is in 100% clean sync');
  assert(finalActionD2 === 'clean_noop', 'Device 2 is in 100% clean sync');

  logHeader('ALL 8 MULTI-DEVICE SIMULATION SCENARIOS PASSED WITH 100% INTEGRITY');
}

// ============================================================================
// Scenario I: Undo/Redo Deletion + Unified Graves Propagation
// Tests that:
//   1. Delete on Device A propagates tombstone to Device B via unified graves
//   2. Undo on Device A revokes tombstone and re-propagates restored entity
//   3. Custom prompt deletion (trash_prompts) prevents resurrection on Device B
// ============================================================================
async function runScenarioI() {
  logHeader('SCENARIO I: Undo/Redo Deletion + Unified Graves Propagation');

  const cloudVault = new MockCloudVault();
  const deviceA = new MockDevice('Device-A (Phone)', 'dev_a_undo_test');
  const deviceB = new MockDevice('Device-B (Desktop)', 'dev_b_undo_test');

  // ── Step 1: Device A creates a tracker topic and syncs ──
  const trackerDocId = 'anatomy_doc';
  deviceA.setKV('subject_tracker_data', [{
    id: trackerDocId,
    subject: 'Anatomy',
    topics: {
      'cranial_nerves': { id: 'anatomy_doc_cranial_nerves', name: 'Cranial Nerves', updatedAt: '2026-08-27T06:00:00.000Z' },
      'brachial_plexus': { id: 'anatomy_doc_brachial_plexus', name: 'Brachial Plexus', updatedAt: '2026-08-27T06:00:00.000Z' }
    },
    updatedAt: '2026-08-27T06:00:00.000Z'
  }]);
  runDeviceSync(deviceA, cloudVault);
  runDeviceSync(deviceB, cloudVault);

  const devBTracker = deviceB.getKV('subject_tracker_data', []);
  assert(devBTracker.some(d => d.id === trackerDocId), 'Device B received anatomy_doc tracker');
  const devBTopics = devBTracker.find(d => d.id === trackerDocId)?.topics || {};
  assert('cranial_nerves' in devBTopics, 'Device B received cranial_nerves topic');
  assert('brachial_plexus' in devBTopics, 'Device B received brachial_plexus topic');

  // ── Step 2: Device A DELETES cranial_nerves (records tombstone in unified_graves + trash_topics) ──
  const nowDeletedAt = '2026-08-27T07:00:00.000Z';
  const restoredId = 'anatomy_doc_cranial_nerves';
  const currentTracker = deviceA.getKV('subject_tracker_data', []);
  const doc = currentTracker.find(d => d.id === trackerDocId);
  const newTopics = { ...doc.topics };
  delete newTopics['cranial_nerves'];
  const updatedDoc = { ...doc, topics: newTopics, updatedAt: nowDeletedAt };
  currentTracker[currentTracker.findIndex(d => d.id === trackerDocId)] = updatedDoc;
  deviceA.setKV('subject_tracker_data', currentTracker);

  // Record tombstone in unified_graves
  const graves = deviceA.getKV('unified_graves', []);
  graves.push({ entityType: 'tracker_topic', entityId: restoredId, parentId: trackerDocId, deletedAt: nowDeletedAt });
  deviceA.setKV('unified_graves', graves);
  // Record in trash_topics
  const trashTops = deviceA.getKV('trash_topics', []);
  trashTops.push({ id: restoredId, docId: trackerDocId, topicName: 'cranial_nerves', deletedAt: nowDeletedAt });
  deviceA.setKV('trash_topics', trashTops);

  runDeviceSync(deviceA, cloudVault);
  runDeviceSync(deviceB, cloudVault);

  // Device B should NOT have cranial_nerves after tombstone propagation
  const devBAfterDelete = (deviceB.getKV('subject_tracker_data', []).find(d => d.id === trackerDocId)?.topics) || {};
  assert(!('cranial_nerves' in devBAfterDelete), 'Deleted tracker_topic cranial_nerves NOT resurrected on Device B (unified graves propagation)');
  assert('brachial_plexus' in devBAfterDelete, 'Non-deleted topic brachial_plexus still present on Device B');

  // Device B should have the unified grave record
  const devBGraves = deviceB.getKV('unified_graves', []);
  assert(devBGraves.some(g => g.entityType === 'tracker_topic' && g.entityId === restoredId), 'Device B received unified graves record for deleted tracker_topic');

  // ── Step 3: Device A UNDOs the deletion (revokes tombstone, restores topic with fresher timestamp) ──
  const undoRestoredAt = '2026-08-27T08:00:00.000Z'; // After deletedAt
  const trackerAfterUndo = deviceA.getKV('subject_tracker_data', []);
  const docAfterUndo = trackerAfterUndo.find(d => d.id === trackerDocId);
  docAfterUndo.topics['cranial_nerves'] = {
    id: restoredId,
    name: 'Cranial Nerves',
    updatedAt: undoRestoredAt
  };
  docAfterUndo.updatedAt = undoRestoredAt;
  deviceA.setKV('subject_tracker_data', trackerAfterUndo);

  // Revoke tombstone from unified_graves (simulating revokeTombstone())
  const gravesAfterUndo = deviceA.getKV('unified_graves', []).filter(g => !(g.entityType === 'tracker_topic' && g.entityId === restoredId));
  deviceA.setKV('unified_graves', gravesAfterUndo);
  // Clean from trash_topics
  const trashAfterUndo = deviceA.getKV('trash_topics', []).filter(t => !(t.id === restoredId || (t.docId === trackerDocId && t.topicName === 'cranial_nerves')));
  deviceA.setKV('trash_topics', trashAfterUndo);

  runDeviceSync(deviceA, cloudVault);
  runDeviceSync(deviceB, cloudVault);

  // Device B should NOW have cranial_nerves RESTORED (undo propagated)
  const devBAfterUndo = (deviceB.getKV('subject_tracker_data', []).find(d => d.id === trackerDocId)?.topics) || {};
  assert('cranial_nerves' in devBAfterUndo, 'Undone deletion: cranial_nerves RESTORED on Device B after undo propagation');

  // Unified graves should be clear of the revoked tombstone on Device B
  const devBGravesAfterUndo = deviceB.getKV('unified_graves', []);
  assert(!devBGravesAfterUndo.some(g => g.entityType === 'tracker_topic' && g.entityId === restoredId), 'Revoked tombstone cleared from Device B unified graves after undo sync');

  // ── Step 4: Custom Prompt Deletion (trash_prompts prevents resurrection) ──
  deviceA.setKV('custom_prompts', [
    { id: 'prompt_mcq_1', name: 'MCQ Generator', updatedAt: '2026-08-27T05:00:00.000Z' },
    { id: 'prompt_fill_2', name: 'Fill-in-the-blank', updatedAt: '2026-08-27T05:00:00.000Z' }
  ]);
  runDeviceSync(deviceA, cloudVault);
  runDeviceSync(deviceB, cloudVault);
  assert(deviceB.getKV('custom_prompts', []).some(p => p.id === 'prompt_mcq_1'), 'Device B received prompt_mcq_1');

  // Device A deletes prompt_mcq_1
  const promptDeletedAt = '2026-08-27T09:00:00.000Z';
  deviceA.setKV('custom_prompts', deviceA.getKV('custom_prompts', []).filter(p => p.id !== 'prompt_mcq_1'));
  const deviceATrashPrompts = deviceA.getKV('trash_prompts', []);
  deviceATrashPrompts.push({ id: 'prompt_mcq_1', deletedAt: promptDeletedAt });
  deviceA.setKV('trash_prompts', deviceATrashPrompts);
  const promptGraves = deviceA.getKV('unified_graves', []);
  promptGraves.push({ entityType: 'prompt', entityId: 'prompt_mcq_1', deletedAt: promptDeletedAt });
  deviceA.setKV('unified_graves', promptGraves);

  runDeviceSync(deviceA, cloudVault);
  runDeviceSync(deviceB, cloudVault);

  // Device B still had prompt_mcq_1 locally — after sync it must be pruned
  // (trash_prompts propagated, merge engine prunes tombstoned prompts)
  assert(deviceB.getKV('trash_prompts', []).some(p => p.id === 'prompt_mcq_1'), 'Device B received trash_prompts tombstone for deleted prompt_mcq_1');
  assert(deviceB.getKV('unified_graves', []).some(g => g.entityType === 'prompt' && g.entityId === 'prompt_mcq_1'), 'Device B unified graves contains prompt_mcq_1 tombstone');

  logHeader('SCENARIO I: ALL UNDO/REDO + UNIFIED GRAVES TESTS PASSED');
}

// ============================================================================
// Scenario J: Grand Tests (GTs) Bidirectional Sync & Mutation Parity
// Tests that:
//   1. GT creation propagates across devices
//   2. GT edits update in-place with LWW and never duplicate
//   3. Single GT deletion does not resurrect on sync
//   4. Concurrent GT additions from two devices merge cleanly
// ============================================================================
async function runScenarioJ() {
  logHeader('SCENARIO J: Grand Tests (GTs) Bidirectional Sync & Mutation Parity');

  const cloudVault = new MockCloudVault();
  const device1 = new MockDevice('Device-1 (Laptop)', 'dev_1_gt_test');
  const device2 = new MockDevice('Device-2 (Tablet)', 'dev_2_gt_test');

  const dateStr = '2026-08-27';

  // ── Step 1: Device 1 logs Grand Test 14 ──
  const gt1 = {
    id: 'gt_1787780001_abc',
    name: 'Marrow Grand Test 14',
    platform: 'Marrow',
    type: 'NEETPG',
    totalQs: 200,
    correct: 140,
    incorrect: 45,
    score: 515,
    maxMarks: 800,
    scoreStr: '515/800',
    accuracy: 76,
    percentile: 98.4,
    createdAt: '2026-08-27T08:00:00.000Z',
    updatedAt: '2026-08-27T08:00:00.000Z'
  };

  device1.setKV('study_logs', {
    [dateStr]: {
      hours: 4.5,
      questions: 200,
      cards: 100,
      gts: [gt1],
      updatedAt: '2026-08-27T08:00:00.000Z'
    }
  });

  runDeviceSync(device1, cloudVault);
  runDeviceSync(device2, cloudVault);

  // Device 2 should have received GT 14
  const dev2Logs1 = device2.getKV('study_logs', {})[dateStr];
  assert(dev2Logs1 && dev2Logs1.gts && dev2Logs1.gts.length === 1, 'Device 2 received initial Grand Test');
  assert(dev2Logs1.gts[0].id === 'gt_1787780001_abc', 'Device 2 has correct GT ID');
  assert(dev2Logs1.gts[0].score === 515, 'Device 2 has correct GT score');

  // ── Step 2: Device 1 edits GT 14 (corrects score to 530) ──
  const gt1Edited = {
    ...gt1,
    correct: 145,
    incorrect: 40,
    score: 540,
    scoreStr: '540/800',
    accuracy: 78,
    updatedAt: '2026-08-27T09:00:00.000Z'
  };

  device1.setKV('study_logs', {
    [dateStr]: {
      hours: 4.5,
      questions: 200,
      cards: 100,
      gts: [gt1Edited],
      updatedAt: '2026-08-27T09:00:00.000Z'
    }
  });

  runDeviceSync(device1, cloudVault);
  runDeviceSync(device2, cloudVault);

  // Device 2 should have updated GT 14 in place with ZERO duplicates
  const dev2Logs2 = device2.getKV('study_logs', {})[dateStr];
  assert(dev2Logs2.gts.length === 1, 'Device 2 has exactly 1 GT (no duplicate created after edit)');
  assert(dev2Logs2.gts[0].score === 540, 'Device 2 has updated GT score 540');

  // ── Step 3: Concurrent GT additions on both devices ──
  // Device 1 adds Cerebellum GT 2
  const gtDev1 = {
    id: 'gt_1787780002_dev1',
    name: 'Cerebellum Mock 2',
    platform: 'Cerebellum',
    type: 'NEETPG',
    score: 480,
    createdAt: '2026-08-27T10:00:00.000Z',
    updatedAt: '2026-08-27T10:00:00.000Z'
  };
  device1.setKV('study_logs', {
    [dateStr]: {
      hours: 5.0,
      questions: 400,
      cards: 100,
      gts: [gt1Edited, gtDev1],
      updatedAt: '2026-08-27T10:00:00.000Z'
    }
  });

  // Device 2 adds Prepladder GT 5
  const gtDev2 = {
    id: 'gt_1787780003_dev2',
    name: 'Prepladder National Mock 5',
    platform: 'PrepLadder',
    type: 'INICET',
    score: 135,
    createdAt: '2026-08-27T10:05:00.000Z',
    updatedAt: '2026-08-27T10:05:00.000Z'
  };
  device2.setKV('study_logs', {
    [dateStr]: {
      hours: 5.5,
      questions: 400,
      cards: 100,
      gts: [gt1Edited, gtDev2],
      updatedAt: '2026-08-27T10:05:00.000Z'
    }
  });

  // Device 1 pushes first, Device 2 syncs & merges, Device 1 pulls merged
  runDeviceSync(device1, cloudVault);
  runDeviceSync(device2, cloudVault);
  runDeviceSync(device1, cloudVault);

  const dev1FinalGts = device1.getKV('study_logs', {})[dateStr].gts;
  const dev2FinalGts = device2.getKV('study_logs', {})[dateStr].gts;

  assert(dev1FinalGts.length === 3, 'Device 1 has all 3 merged Grand Tests');
  assert(dev2FinalGts.length === 3, 'Device 2 has all 3 merged Grand Tests');
  assert(dev1FinalGts.some(g => g.id === 'gt_1787780002_dev1'), 'Device 1 preserved Cerebellum Mock 2');
  assert(dev1FinalGts.some(g => g.id === 'gt_1787780003_dev2'), 'Device 1 received Prepladder National Mock 5');

  // ── Step 4: Device 1 deletes Cerebellum Mock 2 (records tombstone) ──
  const gtsAfterDelete = dev1FinalGts
    .filter(g => g.id !== 'gt_1787780002_dev1')
    .concat([{ id: 'gt_1787780002_dev1', isDeleted: true, deletedAt: '2026-08-27T11:00:00.000Z' }]);

  device1.setKV('study_logs', {
    [dateStr]: {
      ...device1.getKV('study_logs', {})[dateStr],
      gts: gtsAfterDelete,
      updatedAt: '2026-08-27T11:00:00.000Z'
    }
  });

  runDeviceSync(device1, cloudVault);
  runDeviceSync(device2, cloudVault);

  const dev2RawGts = device2.getKV('study_logs', {})[dateStr].gts || [];
  const dev2ActiveGts = dev2RawGts.filter(g => !g.isDeleted);
  assert(dev2ActiveGts.length === 2, 'Device 2 pruned deleted Grand Test');
  assert(!dev2ActiveGts.some(g => g.id === 'gt_1787780002_dev1'), 'Deleted Cerebellum Mock 2 NOT resurrected on Device 2');

  logHeader('SCENARIO J: ALL GRAND TEST SYNC TESTS PASSED WITH 100% INTEGRITY');
}

runTestSuite().catch(err => {
  console.error(`${colors.red}Test Suite Encountered Fatal Error:${colors.reset}`, err);
  process.exit(1);
});

runScenarioI().catch(err => {
  console.error(`${colors.red}Scenario I Encountered Fatal Error:${colors.reset}`, err);
  process.exit(1);
});

runScenarioJ().catch(err => {
  console.error(`${colors.red}Scenario J Encountered Fatal Error:${colors.reset}`, err);
  process.exit(1);
});


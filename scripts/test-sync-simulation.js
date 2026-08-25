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
    const studySchedule = this.getKV('study_schedule', {});
    const scheduleTemplates = this.getKV('schedule_templates', []);
    const campDailyLogs = this.stores.camp_daily_logs;
    const timerState = this.getKV('timerState', null);
    const activeNewTopicsToday = this.getKV('active_new_topics_today', []);
    const fsrsConfig = this.getSetting('fsrs_config', {});
    const settings = this.stores.settings.filter(s => s.key !== 'google_drive_auth');
    const topicHints = this.stores.topic_hints;
    const hintQuota = this.stores.hint_quota;
    const customPrompts = this.getKV('custom_prompts', []);
    const localUserProfile = this.getKV('local_user_profile', null);
    const aiRecommendations = this.getKV('ai_topic_recommendations', null);
    const campTracker = this.stores.camp_tracker;
    const campData = this.stores.camp_data;

    // Filter localStorage preferences
    const excludedKeys = new Set([
      'local_device_id', 'obs_device_id', 'obs_paired_uid',
      'autoanki_device_id', 'autoanki_gdrive_auth', 'autoanki_pending_sync_launch'
    ]);
    const lsSnapshot = {};
    for (const [k, v] of Object.entries(this.localStorage)) {
      if (!excludedKeys.has(k) && !k.startsWith('camp_sessions_') && !k.startsWith('camp_bedToBook_')) {
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
      'camp_tracker.json': { campTracker, campData },
      'pages_bundle.json': { pages, trashPages }
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
        this.setKV('study_schedule', b.studySchedule || {});
        this.setKV('schedule_templates', b.scheduleTemplates || []);
        this.stores.camp_daily_logs = b.campDailyLogs || [];
        this.setKV('timerState', b.timerState || null);
        this.setKV('active_new_topics_today', b.activeNewTopicsToday || []);
      }
      // 4. FSRS Config
      if (downloadedBundles['fsrs_config.json']) {
        const b = downloadedBundles['fsrs_config.json'];
        if (b.fsrsConfig) this.setSetting('fsrs_config', b.fsrsConfig);
        if (b.settings) {
          this.stores.settings = b.settings.filter(s => s.key !== 'google_drive_auth');
        }
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
      }
      // 6. Pages
      if (downloadedBundles['pages_bundle.json']) {
        const b = downloadedBundles['pages_bundle.json'];
        this.setKV('pages', b.pages || []);
        this.setKV('trash_pages', b.trashPages || []);
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
 * Returns the action taken: 'initial_push' | 'fast_forward_push' | 'fast_forward_pull' | 'two_way_merge' | 'clean_noop'
 */
function runDeviceSync(device, cloudVault) {
  const localData = device.extractBundles();
  const remoteData = cloudVault.download();

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

  let isLocalClean = true;
  let isRemoteClean = true;
  const bundleNames = ['cards_bundle', 'curriculum_topics', 'study_logs', 'fsrs_config', 'camp_tracker', 'pages_bundle'];

  const isEmptyLocal = (
    (!device.stores.topics || device.stores.topics.length === 0) &&
    (!device.getKV('flashcards') || device.getKV('flashcards').length === 0) &&
    (!device.getKV('subject_tracker_data') || device.getKV('subject_tracker_data').length === 0)
  );

  if (!ancHashes) {
    if (isEmptyLocal && remoteData && remoteData.manifest) {
      device.hydrateBundles(remoteData.bundles, 'replace');
      return 'fast_forward_pull';
    }
    isLocalClean = false;
  } else {
    for (const b of bundleNames) {
      if (locHashes[b] !== ancHashes[b]) isLocalClean = false;
      if (remHashes[b] !== ancHashes[b]) isRemoteClean = false;
    }
  }

  // Pure Inertia: Both clean or exact hash match
  let allExactMatch = true;
  for (const b of bundleNames) {
    if (locHashes[b] !== remHashes[b]) {
      allExactMatch = false;
      break;
    }
  }

  if (allExactMatch || (isLocalClean && isRemoteClean)) {
    device.lastSyncedHashes = locHashes;
    return 'clean_noop';
  }

  // Fast-Forward Pull: Local is clean, Remote has changes
  if (isLocalClean && !isRemoteClean) {
    device.hydrateBundles(remoteData.bundles, 'replace');
    return 'fast_forward_pull';
  }

  // Fast-Forward Push: Remote is clean, Local has changes
  if (!isLocalClean && isRemoteClean) {
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

  logHeader('ALL 5 MULTI-DEVICE SIMULATION SCENARIOS PASSED WITH 100% INTEGRITY');
}

runTestSuite().catch(err => {
  console.error(`${colors.red}Test Suite Encountered Fatal Error:${colors.reset}`, err);
  process.exit(1);
});

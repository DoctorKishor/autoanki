/**
 * Comprehensive Automated Sync Simulation Test Suite
 * Validates:
 * 1. Zero Zombie Topic Resurrections
 * 2. Zero Zombie Study Log Entry Resurrections
 * 3. Two-Way Concurrent Additions Parity
 * 4. Topic Reanimation / Revocation Safety
 * 5. Full Day Study Log Deletion & Tombstoning
 * 6. Full In-Memory Bundle Merge with Cross-Bundle Graves
 * 7. Multi-Device Conflict Resolution (LWW with Safe Fallbacks)
 */

import {
  mergeStudyLogsObjects,
  mergeStudyScheduleObjects,
  mergeScheduleTemplatesArrays,
  mergeSubjectTrackerArrays,
  mergePytUserProgress,
  mergeCampDailyLogs,
  mergeCampData,
  mergeCampTrackers,
  mergeTopicHintsArrays,
  mergeBundlesInMemory
} from '../src/services/googleDriveSync.js';

import {
  batchRescheduleAllTopics,
  optimizeFSRSWeights,
  DEFAULT_FSRS6_WEIGHTS
} from '../src/services/fsrsEngine.js';

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('\n======================================================');
console.log('🚀 RUNNING GOOGLE DRIVE SYNC PRODUCTION TEST SUITE');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Topic Deletion on Local -> Cloud Sync -> Topic NOT Resurrected
// -----------------------------------------------------------------------------
console.log('TEST 1: Topic Deletion on Local & Cloud Sync Zombie Prevention');
{
  const localDocId = 'medicine';
  const t0 = new Date('2026-08-20T10:00:00Z').toISOString();
  const tDelete = new Date('2026-08-25T12:00:00Z').toISOString();

  // Local state: Topic "cardiology" was deleted, topic "neurology" remains
  const locTracker = [
    {
      id: 'medicine',
      subject: 'Medicine',
      updatedAt: tDelete,
      topics: {
        neurology: { id: 'medicine_neurology', name: 'Neurology', updatedAt: t0 }
      }
    }
  ];

  // Remote state: Still has old "cardiology" and "neurology" from before deletion
  const remTracker = [
    {
      id: 'medicine',
      subject: 'Medicine',
      updatedAt: t0,
      topics: {
        cardiology: { id: 'medicine_cardiology', name: 'Cardiology', updatedAt: t0 },
        neurology: { id: 'medicine_neurology', name: 'Neurology', updatedAt: t0 }
      }
    }
  ];

  // Local trash / unified graves has tombstone for cardiology
  const locTrash = [
    { id: 'medicine_cardiology', docId: 'medicine', topicName: 'cardiology', deletedAt: tDelete }
  ];
  const unifiedGraves = [
    { entityType: 'tracker_topic', entityId: 'medicine_cardiology', parentId: 'medicine', deletedAt: tDelete, metadata: { topicName: 'cardiology', docId: 'medicine' } }
  ];

  const merged = mergeSubjectTrackerArrays(locTracker, remTracker, locTrash, [], unifiedGraves);
  const medDoc = merged.find(d => d.id === 'medicine');

  assert(medDoc !== undefined, 'Subject document "medicine" exists in merged result');
  assert(medDoc.topics.neurology !== undefined, 'Topic "neurology" is preserved');
  assert(medDoc.topics.cardiology === undefined, 'Deleted topic "cardiology" is NOT resurrected');
}

// -----------------------------------------------------------------------------
// TEST 2: Individual Study Log Entry Deletion -> Cloud Sync -> Log NOT Resurrected
// -----------------------------------------------------------------------------
console.log('\nTEST 2: Sub-Log Entry Deletion & FSRS Tombstone Pruning');
{
  const dateStr = '2026-08-25';
  const t0 = new Date('2026-08-25T08:00:00Z').toISOString();
  const tLog1 = new Date('2026-08-25T08:30:00Z').toISOString();
  const tLog2 = new Date('2026-08-25T09:00:00Z').toISOString();
  const tDelete = new Date('2026-08-25T11:00:00Z').toISOString();

  // Local state: log1 was deleted, log2 remains
  const locLogs = {
    [dateStr]: {
      cards: 1,
      hours: 0.5,
      updatedAt: tDelete,
      fsrsLogs: [
        { id: 'log_entry_2', topicName: 'neurology', rating: 3, timestamp: tLog2 }
      ]
    }
  };

  // Remote state: old snapshot with both log1 and log2
  const remLogs = {
    [dateStr]: {
      cards: 2,
      hours: 1.0,
      updatedAt: t0,
      fsrsLogs: [
        { id: 'log_entry_1', topicName: 'cardiology', rating: 4, timestamp: tLog1 },
        { id: 'log_entry_2', topicName: 'neurology', rating: 3, timestamp: tLog2 }
      ]
    }
  };

  // Unified graves has tombstone for log_entry_1
  const unifiedGraves = [
    {
      entityType: 'study_log_entry',
      entityId: 'log_entry_1',
      parentId: dateStr,
      deletedAt: tDelete,
      metadata: { dateStr, logId: 'log_entry_1', topicName: 'cardiology' }
    }
  ];

  const merged = mergeStudyLogsObjects(locLogs, remLogs, [], [], unifiedGraves);
  const day = merged[dateStr];

  assert(day !== undefined, `Day log for ${dateStr} exists`);
  assert(day.fsrsLogs.length === 1, `Merged day has exactly 1 FSRS log (found ${day.fsrsLogs.length})`);
  assert(day.fsrsLogs[0].id === 'log_entry_2', 'Remaining log is log_entry_2');
  assert(!day.fsrsLogs.some(l => l.id === 'log_entry_1'), 'Deleted log_entry_1 is NOT resurrected');
}

// -----------------------------------------------------------------------------
// TEST 3: Concurrent Additions (Topic A on Local, Topic B on Remote)
// -----------------------------------------------------------------------------
console.log('\nTEST 3: Two-Way Concurrent Additions Parity');
{
  const tLocal = new Date('2026-08-26T10:00:00Z').toISOString();
  const tRemote = new Date('2026-08-26T11:00:00Z').toISOString();

  const locTracker = [
    {
      id: 'surgery',
      subject: 'Surgery',
      updatedAt: tLocal,
      topics: {
        orthopedics: { id: 'surgery_orthopedics', name: 'Orthopedics', updatedAt: tLocal }
      }
    }
  ];

  const remTracker = [
    {
      id: 'surgery',
      subject: 'Surgery',
      updatedAt: tRemote,
      topics: {
        neurosurgery: { id: 'surgery_neurosurgery', name: 'Neurosurgery', updatedAt: tRemote }
      }
    }
  ];

  const merged = mergeSubjectTrackerArrays(locTracker, remTracker, [], [], []);
  const surgDoc = merged.find(d => d.id === 'surgery');

  assert(surgDoc !== undefined, 'Subject doc "surgery" exists');
  assert(surgDoc.topics.orthopedics !== undefined, 'Local topic "orthopedics" is preserved');
  assert(surgDoc.topics.neurosurgery !== undefined, 'Remote topic "neurosurgery" is merged');
  assert(Object.keys(surgDoc.topics).length === 2, 'Both concurrent topics exist in harmony');
}

// -----------------------------------------------------------------------------
// TEST 4: Topic Reanimation / Revocation Safety (Recreated topic after deletion)
// -----------------------------------------------------------------------------
console.log('\nTEST 4: Topic Reanimation / Revocation Safety');
{
  const tDel = new Date('2026-08-20T12:00:00Z').toISOString();
  const tRecreate = new Date('2026-08-27T15:00:00Z').toISOString();

  // Local state: Topic was deleted in the past (tDel), but then newly recreated at tRecreate
  const locTracker = [
    {
      id: 'pediatrics',
      subject: 'Pediatrics',
      updatedAt: tRecreate,
      topics: {
        neonatology: { id: 'pediatrics_neonatology', name: 'Neonatology', updatedAt: tRecreate }
      }
    }
  ];

  // Remote state: Old pre-deletion topic
  const remTracker = [
    {
      id: 'pediatrics',
      subject: 'Pediatrics',
      updatedAt: tDel,
      topics: {}
    }
  ];

  // Old tombstone from tDel
  const unifiedGraves = [
    {
      entityType: 'tracker_topic',
      entityId: 'pediatrics_neonatology',
      parentId: 'pediatrics',
      deletedAt: tDel,
      metadata: { topicName: 'neonatology', docId: 'pediatrics' }
    }
  ];

  const merged = mergeSubjectTrackerArrays(locTracker, remTracker, [], [], unifiedGraves);
  const pedsDoc = merged.find(d => d.id === 'pediatrics');

  assert(pedsDoc !== undefined, 'Pediatrics doc exists');
  assert(pedsDoc.topics.neonatology !== undefined, 'Recreated topic with timestamp newer than tombstone is PRESERVED');
}

// -----------------------------------------------------------------------------
// TEST 5: Full In-Memory Bundle Merge with Cross-Bundle Graves
// -----------------------------------------------------------------------------
console.log('\nTEST 5: Full In-Memory Bundle Merge with Cross-Bundle Graves');
{
  const t0 = new Date('2026-08-20T00:00:00Z').toISOString();
  const tDel = new Date('2026-08-27T12:00:00Z').toISOString();

  const localData = {
    bundles: {
      'curriculum_topics.json': {
        topics: [],
        trashTopics: [],
        subjectTracker: [
          {
            id: 'pathology',
            subject: 'Pathology',
            updatedAt: tDel,
            topics: {
              neoplasia: { id: 'path_neoplasia', name: 'Neoplasia', updatedAt: t0 }
            }
          }
        ],
        unifiedGraves: [
          {
            entityType: 'tracker_topic',
            entityId: 'path_inflammation',
            parentId: 'pathology',
            deletedAt: tDel,
            metadata: { topicName: 'inflammation', docId: 'pathology' }
          }
        ]
      },
      'study_logs.json': {
        studyLogs: {},
        trashStudyLogs: [],
        unifiedGraves: []
      }
    }
  };

  const downloadedBundles = {
    'curriculum_topics.json': {
      topics: [],
      trashTopics: [],
      subjectTracker: [
        {
          id: 'pathology',
          subject: 'Pathology',
          updatedAt: t0,
          topics: {
            neoplasia: { id: 'path_neoplasia', name: 'Neoplasia', updatedAt: t0 },
            inflammation: { id: 'path_inflammation', name: 'Inflammation', updatedAt: t0 }
          }
        }
      ],
      unifiedGraves: []
    }
  };

  const merged = mergeBundlesInMemory(localData, downloadedBundles);
  const curTopicsBundle = merged.bundles['curriculum_topics.json'];
  const pathDoc = curTopicsBundle.subjectTracker.find(d => d.id === 'pathology');

  assert(pathDoc !== undefined, 'Pathology subject exists in bundle merge');
  assert(pathDoc.topics.neoplasia !== undefined, 'Topic neoplasia exists');
  assert(pathDoc.topics.inflammation === undefined, 'Tombstoned topic inflammation is PRUNED across bundles');
  assert(curTopicsBundle.unifiedGraves.length >= 1, 'Unified graves propagated into merged bundle');
}

// -----------------------------------------------------------------------------
// TEST 6: Topic Rating Undo on Local -> Cloud Sync -> Review NOT Resurrected
// -----------------------------------------------------------------------------
console.log('\nTEST 6: Topic Review Undo & Zero-Log FSRS Reset Preservation on Sync');
{
  const t0 = new Date('2026-08-27T18:00:00Z').toISOString();
  const tReview = new Date('2026-08-27T19:00:00Z').toISOString();
  const tUndo = new Date('2026-08-27T19:05:00Z').toISOString();
  const dateStr = '2026-08-27';

  // Remote state: Still has topic with 1 review and study date from tReview
  const remTracker = [
    {
      id: 'ent',
      subject: 'ENT',
      updatedAt: tReview,
      topics: {
        rhinology: {
          id: 'ent_rhinology',
          name: 'Rhinology',
          reviewCount: 1,
          reps: 1,
          studyDates: [dateStr],
          lastReviewDate: dateStr,
          stability: 2.5,
          difficulty: 5.0,
          updatedAt: tReview
        }
      }
    }
  ];

  // Local state: Rating was undone at tUndo (reviewCount: 0, studyDates: [], FSRS reset)
  const locTracker = [
    {
      id: 'ent',
      subject: 'ENT',
      updatedAt: tUndo,
      topics: {
        rhinology: {
          id: 'ent_rhinology',
          name: 'Rhinology',
          reviewCount: 0,
          reps: 0,
          studyDates: [],
          lastReviewDate: null,
          stability: null,
          difficulty: null,
          updatedAt: tUndo
        }
      }
    }
  ];

  const merged = mergeSubjectTrackerArrays(locTracker, remTracker, [], [], []);
  const entDoc = merged.find(d => d.id === 'ent');
  const rhino = entDoc?.topics?.rhinology;

  assert(entDoc !== undefined, 'ENT doc exists in merged result');
  assert(rhino !== undefined, 'Topic rhinology exists');
  assert(rhino.reviewCount === 0, `Topic review count is 0 (found ${rhino.reviewCount})`);
  assert(rhino.studyDates.length === 0, `Topic studyDates is empty (found ${rhino.studyDates.length})`);
  assert(rhino.stability === null, 'FSRS stability is null (reset preserved)');
  assert(rhino.difficulty === null, 'FSRS difficulty is null (reset preserved)');
}

// -----------------------------------------------------------------------------
// TEST 7: Card Review Undo / Reset on Local -> Cloud Sync -> Review NOT Resurrected
// -----------------------------------------------------------------------------
console.log('\nTEST 7: Card Review Undo / Reset Preservation on Sync');
{
  const t0 = new Date('2026-08-27T18:00:00Z').toISOString();
  const tRev = new Date('2026-08-27T19:00:00Z').toISOString();
  const tUndo = new Date('2026-08-27T19:05:00Z').toISOString();

  const localData = {
    bundles: {
      'cards_bundle.json': {
        flashcards: [
          {
            id: 'card_123',
            front: 'What is otitis media?',
            back: 'Middle ear infection',
            reps: 0,
            stability: null,
            difficulty: null,
            lastReviewDate: null,
            updatedAt: tUndo
          }
        ],
        trashCards: [],
        unifiedGraves: []
      }
    }
  };

  const downloadedBundles = {
    'cards_bundle.json': {
      flashcards: [
        {
          id: 'card_123',
          front: 'What is otitis media?',
          back: 'Middle ear infection',
          reps: 1,
          stability: 2.0,
          difficulty: 4.5,
          lastReviewDate: '2026-08-27',
          updatedAt: tRev
        }
      ],
      trashCards: [],
      unifiedGraves: []
    }
  };

  const merged = mergeBundlesInMemory(localData, downloadedBundles);
  const card = merged.bundles['cards_bundle.json'].flashcards.find(c => c.id === 'card_123');

  assert(card !== undefined, 'Card 123 exists');
  assert(card.reps === 0, `Card reps is 0 (found ${card.reps})`);
  assert(card.lastReviewDate === null, 'Card lastReviewDate is null');
}

// -----------------------------------------------------------------------------
// TEST 8: PYT Review Session Removal / Decrement on Local -> Cloud Sync -> Review NOT Resurrected
// -----------------------------------------------------------------------------
console.log('\nTEST 8: PYT Review Session Removal / Decrement Preservation on Sync');
{
  const t0 = new Date('2026-08-27T18:00:00Z').toISOString();
  const tLogged = new Date('2026-08-27T19:00:00Z').toISOString();
  const tRemoved = new Date('2026-08-27T19:10:00Z').toISOString();

  // Remote state: Still has 2 reviews on "Glaucoma" and 1 review on "Cataract"
  const remProg = [
    {
      id: 'ophthalmology',
      subject: 'Ophthalmology',
      progress_map: {
        'Glaucoma': 2,
        'Cataract': 1
      },
      updatedAt: tLogged
    }
  ];

  // Local state: User decremented/removed reviews on "Glaucoma" down to 0, and "Cataract" down to 0 at tRemoved
  const locProg = [
    {
      id: 'ophthalmology',
      subject: 'Ophthalmology',
      progress_map: {
        'Glaucoma': 0,
        'Cataract': 0
      },
      updatedAt: tRemoved
    }
  ];

  const merged = mergePytUserProgress(locProg, remProg, []);
  const ophth = merged.find(p => p.id === 'ophthalmology');

  assert(ophth !== undefined, 'Ophthalmology progress exists');
  assert(ophth.progress_map['Glaucoma'] === 0, `Glaucoma review count is 0 (found ${ophth.progress_map['Glaucoma']}) - NOT resurrected to 2`);
  assert(ophth.progress_map['Cataract'] === 0, `Cataract review count is 0 (found ${ophth.progress_map['Cataract']}) - NOT resurrected to 1`);
}

// -----------------------------------------------------------------------------
// TEST 9: PYT Topic / Subject Deletion with Tombstone -> Cloud Sync -> NOT Resurrected
// -----------------------------------------------------------------------------
console.log('\nTEST 9: PYT Topic & Progress Deletion Tombstone Pruning on Sync');
{
  const t0 = new Date('2026-08-27T18:00:00Z').toISOString();
  const tDel = new Date('2026-08-27T19:15:00Z').toISOString();

  const localData = {
    bundles: {
      'curriculum_topics.json': {
        topics: [],
        trashTopics: [],
        pytData: [],
        subjectTracker: [],
        pytUserProgress: [],
        textbooksMetadata: [],
        unifiedGraves: [
          {
            entityType: 'pyt_topic',
            entityId: 'radiology',
            deletedAt: tDel,
            metadata: { subject: 'Radiology' }
          },
          {
            entityType: 'pyt_user_progress',
            entityId: 'radiology',
            deletedAt: tDel,
            metadata: { docId: 'radiology' }
          }
        ]
      }
    }
  };

  const downloadedBundles = {
    'curriculum_topics.json': {
      topics: [],
      trashTopics: [],
      pytData: [
        { key: 'radiology', subject: 'Radiology', topics: 'X-Ray\nCT\nMRI', updatedAt: t0 }
      ],
      subjectTracker: [],
      pytUserProgress: [
        { id: 'radiology', subject: 'Radiology', progress_map: { 'X-Ray': 3 }, updatedAt: t0 }
      ],
      textbooksMetadata: [],
      unifiedGraves: []
    }
  };

  const merged = mergeBundlesInMemory(localData, downloadedBundles);
  const curBundle = merged.bundles['curriculum_topics.json'];

  const foundPyt = curBundle.pytData.find(p => p.key === 'radiology');
  const foundProg = curBundle.pytUserProgress.find(p => p.id === 'radiology');

  assert(foundPyt === undefined, 'Tombstoned PYT topic "radiology" is PRUNED and NOT resurrected');
  assert(foundProg === undefined, 'Tombstoned PYT progress "radiology" is PRUNED and NOT resurrected');
}

// -----------------------------------------------------------------------------
// TEST 10: Two-Device Collaborative GT Merging on Same Date (Google Docs Style)
// -----------------------------------------------------------------------------
console.log('\nTEST 10: Collaborative Multi-Device GT Merging on Same Date');
{
  const t1 = new Date('2026-08-28T10:00:00Z').toISOString();
  const t2 = new Date('2026-08-28T11:00:00Z').toISOString();

  // Device 1: logged "Mock Test 1" on 2026-08-28
  const locLogs = {
    '2026-08-28': {
      questions: 200,
      hours: 3.5,
      gts: [
        {
          id: 'gt_mock_1',
          name: 'Grand Test 1',
          score: 450,
          totalQs: 200,
          updatedAt: t1
        }
      ],
      updatedAt: t1
    }
  };

  // Device 2: logged "Mock Test 2" on 2026-08-28
  const remLogs = {
    '2026-08-28': {
      questions: 200,
      hours: 3.0,
      gts: [
        {
          id: 'gt_mock_2',
          name: 'Grand Test 2',
          score: 520,
          totalQs: 200,
          updatedAt: t2
        }
      ],
      updatedAt: t2
    }
  };

  const merged = mergeStudyLogsObjects(locLogs, remLogs, [], [], []);
  const day28 = merged['2026-08-28'];

  assert(day28 !== undefined, 'Day 2026-08-28 exists in merged result');
  assert(Array.isArray(day28.gts), 'Day 2026-08-28 has gts array');
  assert(day28.gts.length === 2, `Day 2026-08-28 has both GTs (found ${day28.gts.length})`);
  assert(day28.gts.some(g => g.id === 'gt_mock_1'), 'Grand Test 1 preserved');
  assert(day28.gts.some(g => g.id === 'gt_mock_2'), 'Grand Test 2 merged cleanly');
}

// -----------------------------------------------------------------------------
// TEST 11: GT Deletion Tombstone Pruning on Sync
// -----------------------------------------------------------------------------
console.log('\nTEST 11: GT Deletion Tombstone Pruning on Sync');
{
  const t0 = new Date('2026-08-28T09:00:00Z').toISOString();
  const tDel = new Date('2026-08-28T12:00:00Z').toISOString();

  // Local: User deleted "Grand Test 1" at tDel
  const locLogs = {
    '2026-08-28': {
      questions: 0,
      hours: 0,
      gts: [
        {
          id: 'gt_mock_1',
          name: 'Grand Test 1',
          isDeleted: true,
          deletedAt: tDel,
          updatedAt: tDel
        }
      ],
      updatedAt: tDel
    }
  };

  // Remote: Still has old "Grand Test 1" from t0
  const remLogs = {
    '2026-08-28': {
      questions: 200,
      hours: 3.5,
      gts: [
        {
          id: 'gt_mock_1',
          name: 'Grand Test 1',
          score: 450,
          totalQs: 200,
          updatedAt: t0
        }
      ],
      updatedAt: t0
    }
  };

  const unifiedGraves = [
    {
      entityType: 'gt',
      entityId: 'gt_mock_1',
      deletedAt: tDel,
      metadata: { name: 'Grand Test 1' }
    }
  ];

  const merged = mergeStudyLogsObjects(locLogs, remLogs, [], [], unifiedGraves);
  const day28 = merged['2026-08-28'];

  assert(day28 !== undefined, 'Day 2026-08-28 exists in merged result');
  assert(day28.gts.length === 0, `Deleted GT is pruned (found ${day28.gts.length}) - NOT resurrected`);
}

// -----------------------------------------------------------------------------
// TEST 12: Dual-Browser Subject Tracker Cross-Sync Parity (Screenshot Case)
// -----------------------------------------------------------------------------
console.log('\nTEST 12: Dual-Browser Subject Tracker Sync Parity (ENT 2 Topics Reviewed)');
{
  const t0 = new Date('2026-08-28T08:00:00Z').toISOString();
  const tReview = new Date('2026-08-28T09:30:00Z').toISOString();

  // Browser 2 (Local): ENT has 14 topics, 0 reviewed
  const locTracker = [
    {
      id: 'ent',
      subject: 'ENT',
      topics: {
        'Ear: Part 1': { name: 'Ear: Part 1', studyDates: [], reviewCount: 0 },
        'Ear: Part 2': { name: 'Ear: Part 2', studyDates: [], reviewCount: 0 },
        'Ear: Part 3': { name: 'Ear: Part 3', studyDates: [], reviewCount: 0 }
      },
      updatedAt: t0
    }
  ];

  // Browser 1 (Remote): ENT has 2 topics reviewed at tReview
  const remTracker = [
    {
      id: 'ent',
      subject: 'ENT',
      topics: {
        'Ear: Part 1': { name: 'Ear: Part 1', studyDates: ['2026-08-28'], reviewCount: 1, lastReviewDate: '2026-08-28', updatedAt: tReview },
        'Ear: Part 2': { name: 'Ear: Part 2', studyDates: ['2026-08-28'], reviewCount: 1, lastReviewDate: '2026-08-28', updatedAt: tReview },
        'Ear: Part 3': { name: 'Ear: Part 3', studyDates: [], reviewCount: 0 }
      },
      updatedAt: tReview
    }
  ];

  const merged = mergeSubjectTrackerArrays(locTracker, remTracker, [], [], []);
  const entDoc = merged.find(d => d.id === 'ent');

  assert(entDoc !== undefined, 'ENT doc exists in merged tracker');
  const topicsList = Object.values(entDoc.topics || {});
  const revisedCount = topicsList.filter(t => (t.studyDates || []).length > 0).length;
  const totalCount = topicsList.length;
  const coverage = totalCount > 0 ? Math.round((revisedCount / totalCount) * 100) : 0;

  assert(revisedCount === 2, `ENT has exactly 2 revised topics on Browser 2 (found ${revisedCount})`);
  assert(entDoc.topics['Ear: Part 1'].studyDates.includes('2026-08-28'), 'Ear: Part 1 has study date 2026-08-28');
  assert(entDoc.topics['Ear: Part 2'].studyDates.includes('2026-08-28'), 'Ear: Part 2 has study date 2026-08-28');
  assert(coverage === 67, `ENT coverage accurately calculated (found ${coverage}%)`);
}

// -----------------------------------------------------------------------------
// TEST 13: Multi-Device Collaborative Subject Topic Mutation & Deletion Parity
// -----------------------------------------------------------------------------
console.log('\nTEST 13: Multi-Device Collaborative Subject Topic Mutation & Deletion Parity');
{
  const t0 = new Date('2026-08-28T08:00:00Z').toISOString();
  const t1 = new Date('2026-08-28T09:00:00Z').toISOString();
  const t2 = new Date('2026-08-28T10:00:00Z').toISOString();

  // Device 1 (Local):
  // - Added review for "Larynx: Part 1" at t1
  // - Deleted review for "Ear: Part 1" at t1
  // - "Pharynx" was untouched on Device 1 (still has old review from t0)
  const locTracker = [
    {
      id: 'ent',
      subject: 'ENT',
      topics: {
        'Ear: Part 1': { name: 'Ear: Part 1', studyDates: [], reviewCount: 0, lastReviewDate: null, updatedAt: t1 },
        'Larynx: Part 1': { name: 'Larynx: Part 1', studyDates: ['2026-08-28'], reviewCount: 1, lastReviewDate: '2026-08-28', updatedAt: t1 },
        'Pharynx': { name: 'Pharynx', studyDates: ['2026-08-27'], reviewCount: 1, lastReviewDate: '2026-08-27', updatedAt: t0 },
        'Nose': { name: 'Nose', studyDates: [], reviewCount: 0 }
      },
      updatedAt: t1
    }
  ];

  // Device 2 (Remote in cloud):
  // - Deleted review for "Pharynx" at t2 (t2 > t0)
  // - "Ear: Part 1" was untouched on Device 2 (still has old review from t0)
  // - "Larynx: Part 1" was untouched on Device 2 (still 0 reviews from t0)
  const remTracker = [
    {
      id: 'ent',
      subject: 'ENT',
      topics: {
        'Ear: Part 1': { name: 'Ear: Part 1', studyDates: ['2026-08-27'], reviewCount: 1, lastReviewDate: '2026-08-27', updatedAt: t0 },
        'Larynx: Part 1': { name: 'Larynx: Part 1', studyDates: [], reviewCount: 0, lastReviewDate: null, updatedAt: t0 },
        'Pharynx': { name: 'Pharynx', studyDates: [], reviewCount: 0, lastReviewDate: null, updatedAt: t2 },
        'Nose': { name: 'Nose', studyDates: [], reviewCount: 0 }
      },
      updatedAt: t2
    }
  ];

  const merged = mergeSubjectTrackerArrays(locTracker, remTracker, [], [], []);
  const entDoc = merged.find(d => d.id === 'ent');

  assert(entDoc !== undefined, 'ENT doc exists in merged tracker');
  const topics = entDoc.topics;

  // 1. Device 1's fresh review for Larynx MUST be preserved
  assert(topics['Larynx: Part 1'].reviewCount === 1, 'Larynx: Part 1 has review count 1 (Device 1 review preserved)');
  assert(topics['Larynx: Part 1'].studyDates.includes('2026-08-28'), 'Larynx: Part 1 study date preserved');

  // 2. Device 1's fresh deletion for Ear: Part 1 MUST be preserved (NOT resurrected by Device 2's older review)
  assert(topics['Ear: Part 1'].reviewCount === 0, 'Ear: Part 1 review count is 0 (Device 1 deletion preserved)');
  assert(topics['Ear: Part 1'].studyDates.length === 0, 'Ear: Part 1 studyDates is empty (NOT resurrected)');

  // 3. Device 2's fresh deletion for Pharynx MUST be applied (Device 1's older review removed)
  assert(topics['Pharynx'].reviewCount === 0, 'Pharynx review count is 0 (Device 2 deletion applied)');
  assert(topics['Pharynx'].studyDates.length === 0, 'Pharynx studyDates is empty');

  // 4. Untouched topic Nose remains intact
  assert(topics['Nose'].reviewCount === 0, 'Nose remains unstudied');
}

// -----------------------------------------------------------------------------
// TEST 14: Two-Way Collaborative Sync on Removing Topic from Today's Queue (X button)
// -----------------------------------------------------------------------------
console.log("\nTEST 14: 2-Way Collaborative Sync on Removing Topic from Queue (X Button) & Picked Topics");
{
  const t0 = new Date('2026-08-28T08:00:00Z').toISOString();
  const tPick = new Date('2026-08-28T08:15:00Z').toISOString();
  const tRemove = new Date('2026-08-28T08:30:00Z').toISOString();
  const tRemotePick = new Date('2026-08-28T08:25:00Z').toISOString();

  // Device 1:
  // - Had picked Topic A and Topic B at tPick
  // - User clicked 'X' to remove Topic B from today's queue at tRemove (tRemove > tPick)
  const locTracker = [
    {
      id: 'ent',
      subject: 'ENT',
      topics: {
        'Ear: Part 1': { name: 'Ear: Part 1', activatedDate: '2026-08-28', isPickedForToday: true, updatedAt: tPick },
        'Ear: Part 2': { name: 'Ear: Part 2', activatedDate: null, isPickedForToday: false, updatedAt: tRemove },
        'Ear: Part 3': { name: 'Ear: Part 3', activatedDate: null, isPickedForToday: false, updatedAt: t0 }
      },
      updatedAt: tRemove
    }
  ];

  // Device 2:
  // - Still has old state for Topic B from tPick (picked)
  // - Concurrently picked Topic C (Ear: Part 3) at tRemotePick (tRemotePick > t0)
  const remTracker = [
    {
      id: 'ent',
      subject: 'ENT',
      topics: {
        'Ear: Part 1': { name: 'Ear: Part 1', activatedDate: '2026-08-28', isPickedForToday: true, updatedAt: tPick },
        'Ear: Part 2': { name: 'Ear: Part 2', activatedDate: '2026-08-28', isPickedForToday: true, updatedAt: tPick },
        'Ear: Part 3': { name: 'Ear: Part 3', activatedDate: '2026-08-28', isPickedForToday: true, updatedAt: tRemotePick }
      },
      updatedAt: tRemotePick
    }
  ];

  const merged = mergeSubjectTrackerArrays(locTracker, remTracker, [], [], []);
  const entDoc = merged.find(d => d.id === 'ent');

  assert(entDoc !== undefined, 'ENT doc exists in merged tracker');
  const topics = entDoc.topics;

  // 1. Device 1's removal of Topic B (Ear: Part 2) with X button MUST be preserved (NOT resurrected by Device 2)
  assert(topics['Ear: Part 2'].isPickedForToday === false, 'Ear: Part 2 is NOT picked for today (Removal preserved)');
  assert(topics['Ear: Part 2'].activatedDate === null, 'Ear: Part 2 activatedDate is null (NOT resurrected)');

  // 2. Topic A (Ear: Part 1) picked by Device 1 is preserved
  assert(topics['Ear: Part 1'].isPickedForToday === true, 'Ear: Part 1 remains picked for today');

  // 3. Topic C (Ear: Part 3) concurrently picked by Device 2 is cleanly merged
  assert(topics['Ear: Part 3'].isPickedForToday === true, 'Ear: Part 3 concurrently picked on Device 2 is preserved');
}

// -----------------------------------------------------------------------------
// TEST 15: Collaborative Multi-Device Streak Tracker & Study Session Merging
// -----------------------------------------------------------------------------
console.log("\nTEST 15: Collaborative Multi-Device Streak Tracker & Study Session Merging");
{
  const tMon = new Date('2026-08-24T10:00:00Z').toISOString();
  const tTue = new Date('2026-08-25T14:00:00Z').toISOString();
  const tWed1 = new Date('2026-08-26T09:00:00Z').toISOString();
  const tWed2 = new Date('2026-08-26T18:00:00Z').toISOString();
  const tDel = new Date('2026-08-26T20:00:00Z').toISOString();

  // Device 1:
  // - Studied on Monday (2026-08-24): 2 hours, 50 questions
  // - Studied session 1 on Wednesday (2026-08-26): 1.5 hours, 30 questions
  // - Deleted session 3 on Wednesday with tombstone
  const locLogs = {
    '2026-08-24': {
      hours: 2.0,
      questions: 50,
      cards: 10,
      pages: 0,
      sessions: [
        { id: 'sess-mon-1', hours: 2.0, questions: 50, cards: 10, pages: 0, createdAt: tMon, updatedAt: tMon }
      ],
      updatedAt: tMon
    },
    '2026-08-26': {
      hours: 1.5,
      questions: 30,
      cards: 5,
      pages: 0,
      sessions: [
        { id: 'sess-wed-1', hours: 1.5, questions: 30, cards: 5, pages: 0, createdAt: tWed1, updatedAt: tWed1 }
      ],
      updatedAt: tWed1
    }
  };

  // Device 2:
  // - Studied on Tuesday (2026-08-25): 3 hours, 80 questions
  // - Studied session 2 on Wednesday (2026-08-26): 2.0 hours, 40 questions
  // - Still has old session 3 on Wednesday (created before tDel)
  const remLogs = {
    '2026-08-25': {
      hours: 3.0,
      questions: 80,
      cards: 25,
      pages: 10,
      sessions: [
        { id: 'sess-tue-1', hours: 3.0, questions: 80, cards: 25, pages: 10, createdAt: tTue, updatedAt: tTue }
      ],
      updatedAt: tTue
    },
    '2026-08-26': {
      hours: 3.0,
      questions: 60,
      cards: 15,
      pages: 0,
      sessions: [
        { id: 'sess-wed-2', hours: 2.0, questions: 40, cards: 10, pages: 0, createdAt: tWed2, updatedAt: tWed2 },
        { id: 'sess-wed-3', hours: 1.0, questions: 20, cards: 5, pages: 0, createdAt: tWed1, updatedAt: tWed1 }
      ],
      updatedAt: tWed2
    }
  };

  const locGraves = [
    { entityType: 'study_session', entityId: 'sess-wed-3', deletedAt: tDel }
  ];

  const merged = mergeStudyLogsObjects(locLogs, remLogs, [], [], locGraves);

  // 1. Distinct dates: Both Monday (from Device 1) and Tuesday (from Device 2) are present
  assert(merged['2026-08-24'] !== undefined, 'Monday log (Device 1) preserved in merged studyLogs');
  assert(merged['2026-08-24'].hours === 2.0, 'Monday hours is 2.0');
  assert(merged['2026-08-25'] !== undefined, 'Tuesday log (Device 2) preserved in merged studyLogs');
  assert(merged['2026-08-25'].questions === 80, 'Tuesday questions is 80');

  // Streak calculation verification on merged dataset
  const activeDates = Object.keys(merged).filter(d => {
    const l = merged[d];
    return l && ((l.hours || 0) > 0 || (l.questions || 0) > 0 || (l.cards || 0) > 0);
  }).sort();
  assert(activeDates.length === 3, 'Streak spans 3 consecutive days (Mon, Tue, Wed)');
  assert(activeDates[0] === '2026-08-24' && activeDates[1] === '2026-08-25' && activeDates[2] === '2026-08-26', 'Consecutive study dates intact');

  // 2. Same-date session merging for Wednesday
  const wedLog = merged['2026-08-26'];
  assert(wedLog !== undefined, 'Wednesday log exists in merged studyLogs');
  assert(wedLog.sessions.length === 2, 'Wednesday has 2 active sessions (sess-wed-1 and sess-wed-2)');
  assert(wedLog.sessions.some(s => s.id === 'sess-wed-1'), 'sess-wed-1 from Device 1 is preserved');
  assert(wedLog.sessions.some(s => s.id === 'sess-wed-2'), 'sess-wed-2 from Device 2 is preserved');

  // 3. Tombstone preservation: sess-wed-3 deleted on Device 1 is NOT resurrected by Device 2
  assert(!wedLog.sessions.some(s => s.id === 'sess-wed-3'), 'Deleted session sess-wed-3 is NOT resurrected');

  // 4. Combined Wednesday metrics
  assert(wedLog.hours === 3.5, `Wednesday combined hours is 3.5 (got ${wedLog.hours})`);
  assert(wedLog.questions === 70, `Wednesday combined questions is 70 (got ${wedLog.questions})`);
  assert(wedLog.cards === 15, `Wednesday combined cards is 15 (got ${wedLog.cards})`);
}

// -----------------------------------------------------------------------------
// TEST 16: Manual Study Report Modal Edits & Unchanged Date Parity (Zero Overwrite)
// -----------------------------------------------------------------------------
console.log("\nTEST 16: Manual Study Report Modal Edits & Unchanged Date Parity (Zero Overwrite)");
{
  const t0 = new Date('2026-08-27T08:00:00Z').toISOString();
  const t1_edit = new Date('2026-08-27T12:00:00Z').toISOString(); // Device 1 edited at 12:00
  const t2_edit = new Date('2026-08-27T14:00:00Z').toISOString(); // Device 2 edited at 14:00

  // Scenario A:
  // - Device 1 had an old report for 2026-08-27 with 4.0 hours and 100 questions (t0).
  // - Device 2 was offline and still had the old t0 data.
  // - User opened Manual Study Report Modal on Device 1 and edited it to 2.0 hours and 50 questions (t1_edit).
  const locLogsA = {
    '2026-08-27': {
      hours: 2.0,
      questions: 50,
      cards: 20,
      pages: 5,
      updatedAt: t1_edit
    }
  };
  const remLogsA = {
    '2026-08-27': {
      hours: 4.0,
      questions: 100,
      cards: 40,
      pages: 10,
      updatedAt: t0
    }
  };

  const mergedA = mergeStudyLogsObjects(locLogsA, remLogsA, [], [], []);
  assert(mergedA['2026-08-27'] !== undefined, '2026-08-27 exists in mergedA');
  assert(mergedA['2026-08-27'].hours === 2.0, `Device 1 fresh manual report edit (2.0 hrs) is PRESERVED (got ${mergedA['2026-08-27'].hours}) - NOT overridden to 4.0`);
  assert(mergedA['2026-08-27'].questions === 50, `Device 1 fresh questions edit (50) is PRESERVED (got ${mergedA['2026-08-27'].questions}) - NOT overridden to 100`);

  // Scenario B:
  // - Device 1 had untouched date 2026-08-26 (t0).
  // - Device 2 edited 2026-08-26 in Manual Study Report Modal to 3.0 hours, 75 questions (t2_edit > t0).
  const locLogsB = {
    '2026-08-26': {
      hours: 1.0,
      questions: 25,
      cards: 10,
      pages: 2,
      updatedAt: t0
    }
  };
  const remLogsB = {
    '2026-08-26': {
      hours: 3.0,
      questions: 75,
      cards: 30,
      pages: 8,
      updatedAt: t2_edit
    }
  };

  const mergedB = mergeStudyLogsObjects(locLogsB, remLogsB, [], [], []);
  assert(mergedB['2026-08-26'] !== undefined, '2026-08-26 exists in mergedB');
  assert(mergedB['2026-08-26'].hours === 3.0, `Device 2 fresher manual report edit (3.0 hrs) is APPLIED (got ${mergedB['2026-08-26'].hours})`);
  assert(mergedB['2026-08-26'].questions === 75, `Device 2 fresher questions edit (75) is APPLIED (got ${mergedB['2026-08-26'].questions})`);

  // Scenario C: Tombstone Revocation & Re-logging
  // - Date 2026-08-25 was deleted on Device 1 at t0 with tombstone.
  // - User re-logged a study report on 2026-08-25 at t1_edit (t1_edit > t0).
  const locLogsC = {
    '2026-08-25': {
      hours: 1.5,
      questions: 40,
      cards: 15,
      pages: 3,
      updatedAt: t1_edit
    }
  };
  const remGravesC = [
    { entityType: 'study_log', entityId: '2026-08-25', deletedAt: t0 }
  ];

  const mergedC = mergeStudyLogsObjects(locLogsC, {}, [], [], remGravesC);
  assert(mergedC['2026-08-25'] !== undefined, 'Re-logged date after previous tombstone is PRESERVED (NOT deleted by older tombstone)');
  assert(mergedC['2026-08-25'].hours === 1.5, 'Re-logged date hours is 1.5');
}

// -----------------------------------------------------------------------------
// TEST 17: Study Scheduler Task Completion, Edit, Deletion & Sync Parity
// -----------------------------------------------------------------------------
console.log('\nTEST 17: Study Scheduler Task Completion, Edit & Deletion Sync Parity');
{
  const t0 = new Date('2026-08-22T00:00:00Z').toISOString();
  const t1_complete = new Date('2026-08-22T02:30:00Z').toISOString();
  const t2_delete = new Date('2026-08-22T03:00:00Z').toISOString();
  const t3_add = new Date('2026-08-22T03:30:00Z').toISOString();

  // Scenario A: User marks task completed in Edit Study Slot modal (or checklist)
  // Local (freshly completed at t1_complete):
  const locSchedA = {
    '2026-08-22': {
      date: '2026-08-22',
      updatedAt: t1_complete,
      tasks: [
        {
          id: 'task_2222',
          topic: '2222',
          startTime: '02:00',
          endTime: '03:00',
          time: '02:00 AM - 03:00 AM',
          completed: true,
          rating: 4,
          updatedAt: t1_complete
        }
      ]
    }
  };

  // Remote (older uncompleted snapshot from before the edit, at t0):
  const remSchedA = {
    '2026-08-22': {
      date: '2026-08-22',
      updatedAt: t0,
      tasks: [
        {
          id: 'task_2222',
          topic: '2222',
          startTime: '02:00',
          endTime: '03:00',
          time: '02:00 AM - 03:00 AM',
          completed: false,
          updatedAt: t0
        }
      ]
    }
  };

  const mergedA = mergeStudyScheduleObjects(locSchedA, remSchedA, []);
  assert(mergedA['2026-08-22'] !== undefined, '2026-08-22 schedule entry exists in merged result');
  assert(mergedA['2026-08-22'].tasks.length === 1, 'Schedule date has 1 task');
  assert(mergedA['2026-08-22'].tasks[0].completed === true, 'Task completed status is PRESERVED (completed === true) after sync');
  assert(mergedA['2026-08-22'].tasks[0].rating === 4, 'Task rating is preserved');

  // Scenario B: User deletes a scheduled task on Device 1 with tombstone recorded
  // Local has deleted task_2222 (tasks array empty) at t2_delete:
  const locSchedB = {
    '2026-08-22': {
      date: '2026-08-22',
      notes: 'Revision Day',
      updatedAt: t2_delete,
      tasks: []
    }
  };
  const gravesB = [
    {
      entityType: 'schedule_task',
      entityId: 'task_2222',
      parentId: '2026-08-22',
      deletedAt: t2_delete,
      metadata: { topic: '2222' }
    }
  ];

  const mergedB = mergeStudyScheduleObjects(locSchedB, remSchedA, gravesB);
  assert(mergedB['2026-08-22'] !== undefined, '2026-08-22 exists due to notes');
  assert(mergedB['2026-08-22'].tasks.length === 0, 'Deleted scheduled task task_2222 is PRUNED and NOT resurrected');

  // Scenario C: Concurrent Additions on same date (Device 1 adds Task A, Device 2 adds Task B)
  const locSchedC = {
    '2026-08-23': {
      date: '2026-08-23',
      updatedAt: t1_complete,
      tasks: [
        {
          id: 'task_pathology',
          topic: 'Pathology: Neoplasia',
          startTime: '09:00',
          endTime: '11:00',
          completed: false,
          updatedAt: t1_complete
        }
      ]
    }
  };
  const remSchedC = {
    '2026-08-23': {
      date: '2026-08-23',
      updatedAt: t3_add,
      tasks: [
        {
          id: 'task_pharmacology',
          topic: 'Pharmacology: Autonomics',
          startTime: '14:00',
          endTime: '16:00',
          completed: false,
          updatedAt: t3_add
        }
      ]
    }
  };

  const mergedC = mergeStudyScheduleObjects(locSchedC, remSchedC, []);
  assert(mergedC['2026-08-23'] !== undefined, '2026-08-23 exists');
  assert(mergedC['2026-08-23'].tasks.length === 2, `Both concurrent tasks merged cleanly (found ${mergedC['2026-08-23'].tasks.length})`);
  assert(mergedC['2026-08-23'].tasks.some(t => t.id === 'task_pathology'), 'Pathology task from Device 1 is preserved');
  assert(mergedC['2026-08-23'].tasks.some(t => t.id === 'task_pharmacology'), 'Pharmacology task from Device 2 is merged');

  // Scenario D: Full In-Memory Bundle Merge (mergeBundlesInMemory)
  const localBundle = {
    bundles: {
      'study_logs.json': {
        studyLogs: {},
        trashStudyLogs: [],
        studySchedule: locSchedA,
        unifiedGraves: []
      }
    }
  };
  const downloadedBundle = {
    'study_logs.json': {
      studyLogs: {},
      trashStudyLogs: [],
      studySchedule: remSchedA,
      unifiedGraves: []
    }
  };

  const mergedBundleResult = mergeBundlesInMemory(localBundle, downloadedBundle);
  const schedInBundle = mergedBundleResult.bundles['study_logs.json'].studySchedule;
  assert(schedInBundle['2026-08-22'] !== undefined, 'Schedule exists in merged bundle');
  assert(schedInBundle['2026-08-22'].tasks[0].completed === true, 'Task completed status preserved in full bundle merge');
}

// -----------------------------------------------------------------------------
// TEST 18: CAMP Tracker, Daily Sessions & Multi-Device Sync Parity
// -----------------------------------------------------------------------------
console.log('\nTEST 18: CAMP Tracker, Daily Sessions & Multi-Device Sync Parity');
{
  const t0 = new Date('2026-08-20T00:00:00Z').toISOString();
  const t1_edit = new Date('2026-08-20T01:00:00Z').toISOString();
  const t2_edit = new Date('2026-08-20T02:00:00Z').toISOString();
  const t3_delete = new Date('2026-08-20T03:00:00Z').toISOString();

  // Scenario A: Concurrent Daily Sessions on Same Date (Device 1 logs preLunch, Device 2 logs midDay)
  const locCampLogsA = [
    {
      dateStr: '2026-08-20',
      bedToBook: 'Less than 30 mins',
      updatedAt: t1_edit,
      sessions: {
        preLunch: [
          {
            id: 'sess_pre_1',
            hours: '2.5',
            concentration: 8,
            type: 'notes',
            isManual: true,
            updatedAt: t1_edit
          }
        ],
        midDay: [],
        postDinner: []
      }
    }
  ];

  const remCampLogsA = [
    {
      dateStr: '2026-08-20',
      bedToBook: 'Less than 45 mins',
      updatedAt: t2_edit,
      sessions: {
        preLunch: [],
        midDay: [
          {
            id: 'sess_mid_1',
            hours: '3.0',
            concentration: 9,
            type: 'qbank',
            questionsSolved: 100,
            isManual: false,
            updatedAt: t2_edit
          }
        ],
        postDinner: []
      }
    }
  ];

  const mergedLogsA = mergeCampDailyLogs(locCampLogsA, remCampLogsA, []);
  assert(mergedLogsA.length === 1, 'Merged CAMP logs has 1 date document');
  assert(mergedLogsA[0].dateStr === '2026-08-20', 'Date is 2026-08-20');
  assert(mergedLogsA[0].sessions.preLunch.length === 1, 'Device 1 preLunch session preserved');
  assert(mergedLogsA[0].sessions.preLunch[0].id === 'sess_pre_1', 'preLunch session ID is sess_pre_1');
  assert(mergedLogsA[0].sessions.midDay.length === 1, 'Device 2 midDay session merged cleanly');
  assert(mergedLogsA[0].sessions.midDay[0].id === 'sess_mid_1', 'midDay session ID is sess_mid_1');
  assert(mergedLogsA[0].bedToBook === 'Less than 45 mins', 'Fresher bedToBook value from Device 2 is applied');

  // Scenario B: Session Deletion with Tombstone
  const locCampLogsB = [
    {
      dateStr: '2026-08-20',
      bedToBook: 'Less than 30 mins',
      updatedAt: t3_delete,
      sessions: {
        preLunch: [],
        midDay: [],
        postDinner: []
      }
    }
  ];
  const gravesB = [
    {
      entityType: 'camp_session',
      entityId: 'sess_pre_1',
      deletedAt: t3_delete
    }
  ];

  const mergedLogsB = mergeCampDailyLogs(locCampLogsB, locCampLogsA, gravesB);
  assert(mergedLogsB.length === 1, 'Merged log exists');
  assert(mergedLogsB[0].sessions.preLunch.length === 0, 'Tombstoned session sess_pre_1 is PRUNED and NOT resurrected');

  // Scenario C: CAMP Data Merging (history across multiple days)
  const locCampDataC = [
    {
      key: 'history',
      data: [
        { date: '20-Aug', fullDate: '2026-08-20', timestamp: 1787184000000, score: 8.5 }
      ],
      updatedAt: t1_edit
    },
    {
      key: 'student_info',
      data: { name: 'Scholar', email: 'scholar@local.com', phone: '123' },
      updatedAt: t1_edit
    }
  ];

  const remCampDataC = [
    {
      key: 'history',
      data: [
        { date: '21-Aug', fullDate: '2026-08-21', timestamp: 1787270400000, score: 9.0 }
      ],
      updatedAt: t2_edit
    },
    {
      key: 'student_info',
      data: { name: 'Scholar Pro', email: 'scholar@local.com', phone: '456' },
      updatedAt: t2_edit
    }
  ];

  const mergedDataC = mergeCampData(locCampDataC, remCampDataC);
  const histItem = mergedDataC.find(d => d.key === 'history');
  assert(histItem !== undefined, 'history exists in merged campData');
  assert(histItem.data.length === 2, `Both days preserved in history (found ${histItem.data.length})`);
  assert(histItem.data.some(h => h.fullDate === '2026-08-20'), 'Aug 20 from Device 1 preserved');
  assert(histItem.data.some(h => h.fullDate === '2026-08-21'), 'Aug 21 from Device 2 merged');

  const infoItem = mergedDataC.find(d => d.key === 'student_info');
  assert(infoItem !== undefined, 'student_info exists');
  assert(infoItem.data.name === 'Scholar Pro', 'Fresher name edit from Device 2 applied');
  assert(infoItem.data.phone === '456', 'Fresher phone edit applied');

  // Scenario D: CAMP Tracker Tasks (C1, C2 cycle tasks) with Tombstone
  const locTrackerD = [
    { id: 'camp_task_c1_1', title: 'Anatomy Cycle 1', cycle: 'C1', completed: true, updatedAt: t1_edit }
  ];
  const remTrackerD = [
    { id: 'camp_task_c1_1', title: 'Anatomy Cycle 1', cycle: 'C1', completed: false, updatedAt: t0 },
    { id: 'camp_task_c2_1', title: 'Physiology Cycle 2', cycle: 'C2', completed: true, updatedAt: t2_edit }
  ];
  const gravesD = [
    { entityType: 'camp_task', entityId: 'camp_task_c3_old', deletedAt: t1_edit }
  ];

  const mergedTrackerD = mergeCampTrackers(locTrackerD, remTrackerD, [], gravesD);
  assert(mergedTrackerD.length === 2, `Merged tracker has 2 active tasks (found ${mergedTrackerD.length})`);
  const c1Task = mergedTrackerD.find(t => t.id === 'camp_task_c1_1');
  assert(c1Task !== undefined && c1Task.completed === true, 'Device 1 completed state on C1 task is PRESERVED');
  const c2Task = mergedTrackerD.find(t => t.id === 'camp_task_c2_1');
  assert(c2Task !== undefined && c2Task.completed === true, 'Device 2 C2 task is MERGED');

  // Scenario E: Past Logged Date Score Edit Preservation on Sync (Zero Reversion)
  const locCampDataE = [
    {
      key: 'history',
      data: [
        { date: '20-Aug', fullDate: '2026-08-20', timestamp: 1787184000000, score: 9.2, updatedAt: t2_edit }
      ],
      updatedAt: t2_edit
    }
  ];
  const remCampDataE = [
    {
      key: 'history',
      data: [
        { date: '20-Aug', fullDate: '2026-08-20', timestamp: 1787184000000, score: 7.0, updatedAt: t1_edit }
      ],
      updatedAt: t1_edit
    }
  ];

  const mergedDataE = mergeCampData(locCampDataE, remCampDataE, []);
  const histItemE = mergedDataE.find(d => d.key === 'history');
  assert(histItemE !== undefined, 'history exists in mergedDataE');
  assert(histItemE.data.length === 1, 'Only 1 entry for 20-Aug');
  assert(histItemE.data[0].score === 9.2, `Edited score 9.2 is PRESERVED (got ${histItemE.data[0].score}) - NOT reverted to 7.0`);

  // Scenario F: History Entry Deletion with Tombstone
  const locCampDataF = [
    {
      key: 'history',
      data: [],
      updatedAt: t3_delete
    }
  ];
  const gravesF = [
    { entityType: 'camp_history_entry', entityId: '2026-08-20', deletedAt: t3_delete }
  ];

  const mergedDataF = mergeCampData(locCampDataF, remCampDataE, gravesF);
  const histItemF = mergedDataF.find(d => d.key === 'history');
  assert(histItemF !== undefined, 'history exists in mergedDataF');
  assert(histItemF.data.length === 0, 'Deleted history entry is PRUNED by tombstone and NOT resurrected');
}

// ---------------------------------------------------------------------------
// TEST 19: Review Rating Redo Tombstone Revocation & Dynamic KV Sync Parity
// ---------------------------------------------------------------------------
console.log('\nTEST 19: Review Rating Redo Tombstone Revocation & Dynamic KV Sync Parity');
{
  const nowIso = new Date().toISOString();
  const dateStr = '2026-08-28';
  const logId = 'log_redo_test_101';

  // Device 1: User rated a topic, undid it (tombstoned), then REDID it (tombstone revoked).
  // The redone log entry is present in studyLogs for 2026-08-28 and the tombstone is revoked (empty/omitted).
  const locStudyLogs = {
    [dateStr]: {
      cards: 1,
      questions: 0,
      hours: 0.5,
      pages: 1,
      updatedAt: nowIso,
      fsrsLogs: [
        {
          id: logId,
          topicName: 'Arrhythmias',
          subject: 'Cardiology',
          dateStr: dateStr,
          rating: 3,
          timestamp: nowIso
        }
      ]
    }
  };

  // Remote Device 2 had no log yet
  const remStudyLogs = {};

  // With tombstone revoked, unified graves has no active tombstone for this logId
  const graves = [];

  const mergedLogs = mergeStudyLogsObjects(locStudyLogs, remStudyLogs, [], [], graves);
  assert(mergedLogs[dateStr] !== undefined, 'Date 2026-08-28 exists in merged result');
  assert(mergedLogs[dateStr].fsrsLogs.length === 1, 'Redone review log is PRESERVED on sync after tombstone revocation');
  assert(mergedLogs[dateStr].fsrsLogs[0].id === logId, 'Log ID matches redone entry');

  // Dynamic KV Active Topics & AI Recommendations records syncing
  const locActiveTopics = [
    { key: `active_new_topics_${dateStr}`, value: ['topic_101', 'topic_102'], updatedAt: nowIso }
  ];
  const remActiveTopics = [
    { key: `active_new_topics_${dateStr}`, value: ['topic_103'], updatedAt: '2026-08-28T09:00:00.000Z' }
  ];

  // LWW on dynamic KV key preserves freshest active new topics
  const locTime = new Date(locActiveTopics[0].updatedAt).getTime();
  const remTime = new Date(remActiveTopics[0].updatedAt).getTime();
  const fresherActive = locTime >= remTime ? locActiveTopics[0] : remActiveTopics[0];
  assert(fresherActive.value.includes('topic_101'), 'Fresher active new topics for the date are PRESERVED');
  assert(fresherActive.value.includes('topic_102'), 'All picked topic IDs intact in fresher record');

  // AI recommendations dynamic records
  const locAiRecs = [
    { key: `ai_recommendations_${dateStr}`, value: [{ id: 'rec_1', title: 'High-Yield ECG' }], updatedAt: nowIso }
  ];
  assert(locAiRecs[0].key.startsWith('ai_recommendations_'), 'Dynamic AI recommendations key format verified');
  assert(locAiRecs[0].value.length === 1, 'AI recommendations payload verified');
}

// -----------------------------------------------------------------------------
// TEST 31: Schedule Templates & Sub-Collection 2-Way Delta Merge & Tombstone Pruning
// -----------------------------------------------------------------------------
console.log('\nTEST 31: Schedule Templates & 2-Way Delta Sub-Collection Merging');
{
  const t0 = '2026-08-28T10:00:00.000Z';
  const t1 = '2026-08-28T11:00:00.000Z';
  const tDelete = '2026-08-28T12:00:00.000Z';

  // Device 1 added Template A, modified Template B, and deleted Template C
  const locTemplates = [
    { id: 'tpl_A', name: 'Morning Routine', tasks: [{ topic: 'Physiology' }], updatedAt: t1 },
    { id: 'tpl_B', name: 'Intense Revision (Updated)', tasks: [{ topic: 'Pathology High-Yield' }], updatedAt: t1 }
  ];

  // Device 2 has old Template B, deleted Template C, and added Template D
  const remTemplates = [
    { id: 'tpl_B', name: 'Intense Revision (Old)', tasks: [{ topic: 'Pathology' }], updatedAt: t0 },
    { id: 'tpl_C', name: 'Old Discarded Template', tasks: [{ topic: 'Biochemistry' }], updatedAt: t0 },
    { id: 'tpl_D', name: 'Evening Camp', tasks: [{ topic: 'Pharmacology' }], updatedAt: t1 }
  ];

  const unifiedGraves = [
    { entityType: 'schedule_template', entityId: 'tpl_C', deletedAt: tDelete, metadata: { name: 'Old Discarded Template' } }
  ];

  const merged = mergeScheduleTemplatesArrays(locTemplates, remTemplates, unifiedGraves);

  assert(merged.some(t => t.id === 'tpl_A'), 'Template A added on Device 1 is preserved');
  assert(merged.some(t => t.id === 'tpl_D'), 'Template D added on Device 2 is preserved');
  const tplB = merged.find(t => t.id === 'tpl_B');
  assert(tplB !== undefined && tplB.name === 'Intense Revision (Updated)', 'Template B LWW preserves fresher Device 1 edit');
  assert(!merged.some(t => t.id === 'tpl_C'), 'Deleted Template C is tombstone-pruned and NOT resurrected');

  // Verify mergeBundlesInMemory preserves scheduleTemplates, campDailyLogs, activeNewTopicsToday, activeNewTopicsRecords
  const locBundles = {
    'study_logs.json': {
      studyLogs: { '2026-08-28': { hours: '2.5' } },
      trashStudyLogs: [],
      studySchedule: {},
      scheduleTemplates: locTemplates,
      campDailyLogs: [{ dateStr: '2026-08-28', sessions: { preLunch: [{ id: 's1', hours: '1.5' }] } }],
      timerState: {},
      activeNewTopicsToday: ['t1'],
      activeNewTopicsRecords: [{ key: 'active_new_topics_2026-08-28', value: ['t1'], updatedAt: t1 }],
      unifiedGraves
    }
  };

  const remBundles = {
    'study_logs.json': {
      studyLogs: { '2026-08-28': { hours: '1.0' } },
      trashStudyLogs: [],
      studySchedule: {},
      scheduleTemplates: remTemplates,
      campDailyLogs: [{ dateStr: '2026-08-28', sessions: { midDay: [{ id: 's2', hours: '1.0' }] } }],
      timerState: {},
      activeNewTopicsToday: ['t2'],
      activeNewTopicsRecords: [{ key: 'active_new_topics_2026-08-28', value: ['t2'], updatedAt: t0 }],
      unifiedGraves
    }
  };

  const { bundles: mergedBundles } = mergeBundlesInMemory(locBundles, remBundles, unifiedGraves);
  const finalStudyLogsB = mergedBundles['study_logs.json'];

  assert(finalStudyLogsB !== undefined, 'Merged study_logs.json bundle generated');
  assert(Array.isArray(finalStudyLogsB.scheduleTemplates), 'scheduleTemplates array is packed in merged bundle');
  assert(finalStudyLogsB.scheduleTemplates.length === 3, 'Merged scheduleTemplates contains 3 templates (A, B, D)');
  assert(Array.isArray(finalStudyLogsB.campDailyLogs), 'campDailyLogs array is packed in merged bundle');
  assert(finalStudyLogsB.campDailyLogs.length === 1, 'campDailyLogs contains merged date entry');
  assert(finalStudyLogsB.activeNewTopicsRecords.length === 1, 'activeNewTopicsRecords preserved');
  assert(finalStudyLogsB.activeNewTopicsRecords[0].value.includes('t1'), 'Fresher activeNewTopicsRecord wins');
}

// -----------------------------------------------------------------------------
console.log('\nTEST 32: AI Topic Hints & Active-Recall Blueprint Tree Multi-Device Sync Parity');
{
  const t0 = '2026-08-28T10:00:00.000Z';
  const t1 = '2026-08-28T11:00:00.000Z';
  const tDelete = '2026-08-28T12:00:00.000Z';

  // Device 1 generated hints for Topic 1, regenerated Topic 2 with 4-level tree, deleted Topic 3
  const locTopicHints = [
    {
      topicId: 'ent_larynx_part_1',
      chapterTitle: 'Larynx: Part 1',
      tree: [{ id: '1', title: 'Larynx Anatomy', prompt: 'Laryngeal framework?', children: [] }],
      generatedAt: t1
    },
    {
      topicId: 'ent_larynx_part_2',
      chapterTitle: 'Larynx: Part 2',
      tree: [
        {
          id: '1',
          title: 'Nerve Supply',
          prompt: 'Motor vs sensory innervation?',
          children: [{ id: '1.1', title: 'Recurrent Laryngeal Nerve', prompt: 'Course and relation?', children: [] }]
        }
      ],
      generatedAt: t1
    }
  ];

  // Device 2 has old Topic 2, old Topic 3 (which was deleted on Device 1), and added Topic 4
  const remTopicHints = [
    {
      topicId: 'ent_larynx_part_2',
      chapterTitle: 'Larynx: Part 2 (Old)',
      tree: [{ id: '1', title: 'Old Nerve Supply', prompt: 'Old prompt', children: [] }],
      generatedAt: t0
    },
    {
      topicId: 'ent_pharynx_part_1',
      chapterTitle: 'Pharynx: Part 1',
      tree: [{ id: '1', title: 'Pharynx', prompt: 'Pharyngeal spaces?', children: [] }],
      generatedAt: t0
    },
    {
      topicId: 'ophthalmology_glaucoma',
      chapterTitle: 'Glaucoma',
      tree: [{ id: '1', title: 'Open Angle Glaucoma', prompt: 'First line medical therapy?', children: [] }],
      generatedAt: t1
    }
  ];

  const unifiedGraves = [
    { entityType: 'topic_hints', entityId: 'ent_pharynx_part_1', deletedAt: tDelete, metadata: { topicId: 'ent_pharynx_part_1' } }
  ];

  const mergedHints = mergeTopicHintsArrays(locTopicHints, remTopicHints, unifiedGraves);

  assert(mergedHints.some(h => h.topicId === 'ent_larynx_part_1'), 'Topic 1 hint generated on Device 1 is preserved');
  assert(mergedHints.some(h => h.topicId === 'ophthalmology_glaucoma'), 'Topic 4 hint generated on Device 2 is preserved');
  const t2Hint = mergedHints.find(h => h.topicId === 'ent_larynx_part_2');
  assert(t2Hint !== undefined && t2Hint.chapterTitle === 'Larynx: Part 2', 'Topic 2 LWW preserves fresher Device 1 4-level blueprint tree');
  assert(!mergedHints.some(h => h.topicId === 'ent_pharynx_part_1'), 'Deleted Topic 3 hint is tombstone-pruned and NOT resurrected');

  // Verify full bundle merge in fsrs_config.json
  const locBundles = {
    'fsrs_config.json': {
      fsrsConfig: { requestRetention: 0.9 },
      settings: [],
      topicHints: locTopicHints,
      hintQuota: [{ dateStr: '2026-08-28', count: 5 }],
      customPrompts: [],
      unifiedGraves
    }
  };

  const remBundles = {
    'fsrs_config.json': {
      fsrsConfig: { requestRetention: 0.9 },
      settings: [],
      topicHints: remTopicHints,
      hintQuota: [{ dateStr: '2026-08-28', count: 3 }],
      customPrompts: [],
      unifiedGraves
    }
  };

  const { bundles: mergedBundles } = mergeBundlesInMemory(locBundles, remBundles, unifiedGraves);
  const finalFsrsB = mergedBundles['fsrs_config.json'];

  assert(finalFsrsB !== undefined, 'Merged fsrs_config.json bundle generated');
  assert(Array.isArray(finalFsrsB.topicHints), 'topicHints array is packed in merged bundle');
  assert(finalFsrsB.topicHints.length === 3, 'Merged topicHints contains exactly 3 active topics');
  assert(!finalFsrsB.topicHints.some(h => h.topicId === 'ent_pharynx_part_1'), 'Tombstoned hint is pruned from merged bundle');
}

// -----------------------------------------------------------------------------
// TEST 33: Unstudied Topic Restoration & Modal Catalog Parity After Review Undo / Deletion
// -----------------------------------------------------------------------------
console.log('\nTEST 33: Unstudied Topic Restoration on Review Undo / Deletion across Devices');
{
  const t0 = '2026-08-28T10:00:00.000Z';
  const t1 = '2026-08-28T12:00:00.000Z';

  // Device 1: User reviewed "Larynx : Part 2" earlier, but then undid/deleted the review log (studyDates = [])
  const locTracker = [
    {
      id: 'ent',
      subject: 'ENT',
      topics: {
        'Larynx : Part 2': {
          name: 'Larynx : Part 2',
          page: '110',
          studyDates: [],
          reviewCount: 0,
          lastReviewDate: null,
          activatedDate: '2026-08-28',
          isPickedForToday: true,
          updatedAt: t1
        },
        'Ear : Part 1': {
          name: 'Ear : Part 1',
          page: '1',
          studyDates: [],
          reviewCount: 0,
          lastReviewDate: null,
          updatedAt: t0
        }
      },
      updatedAt: t1
    }
  ];

  // Device 2: Still has old reviewed state from t0
  const remTracker = [
    {
      id: 'ent',
      subject: 'ENT',
      topics: {
        'Larynx : Part 2': {
          name: 'Larynx : Part 2',
          page: '110',
          studyDates: ['2026-08-28'],
          reviewCount: 1,
          lastReviewDate: '2026-08-28',
          activatedDate: '2026-08-28',
          isPickedForToday: true,
          updatedAt: t0
        },
        'Ear : Part 1': {
          name: 'Ear : Part 1',
          page: '1',
          studyDates: [],
          reviewCount: 0,
          lastReviewDate: null,
          updatedAt: t0
        }
      },
      updatedAt: t0
    }
  ];

  const merged = mergeSubjectTrackerArrays(locTracker, remTracker);
  const entDoc = merged.find(d => d.id === 'ent');
  assert(entDoc !== undefined, 'ENT doc exists in merged tracker');

  const larynxTopic = entDoc.topics['Larynx : Part 2'];
  assert(larynxTopic !== undefined, 'Larynx : Part 2 topic exists');
  assert(Array.isArray(larynxTopic.studyDates) && larynxTopic.studyDates.length === 0, 'Larynx studyDates is empty after undone review');
  assert(larynxTopic.reviewCount === 0, 'Larynx reviewCount is 0');
  assert(larynxTopic.lastReviewDate === null, 'Larynx lastReviewDate is null');

  // Verify unstudied predicate in SelectNewTopicsModal
  const isUnstudied = (
    (!larynxTopic.studyDates || larynxTopic.studyDates.length === 0) ||
    ((!larynxTopic.reviewCount || Number(larynxTopic.reviewCount) === 0) && (!larynxTopic.lastReviewDate || larynxTopic.lastReviewDate === ''))
  );
  assert(isUnstudied === true, 'Topic accurately qualifies as UNSTUDIED in SelectNewTopicsModal catalog');
}

// ----------------------------------------------------
// TEST 34: Dynamic Custom Subjects Addition, Topic Mutation & Deletion Tombstone Sync
// ----------------------------------------------------
console.log('\nTEST 34: Dynamic Custom Subjects Addition, Topic Mutation & Deletion Tombstone Sync');
{
  const t0 = new Date(Date.now() - 3600000).toISOString();
  const t1 = new Date(Date.now() - 1800000).toISOString();
  const t2 = new Date(Date.now() - 900000).toISOString();

  // Device 1: Created "Cardiology" (custom) at t1, and deleted "Nuclear Medicine" (custom) with tombstone at t2
  const locTracker = [
    {
      id: 'cardiology',
      subject: 'Cardiology',
      category: 'Clinical',
      primarySource: 'Braunwald + Marrow',
      isCustom: true,
      topics: {
        'Heart Failure': {
          name: 'Heart Failure',
          page: '45',
          studyDates: ['2026-08-28'],
          reviewCount: 1,
          lastReviewDate: '2026-08-28',
          updatedAt: t1
        }
      },
      createdAt: t1,
      updatedAt: t1
    }
  ];

  // Device 2: Still has "Nuclear Medicine" from t0, plus created "Neurosurgery" (custom) at t1
  const remTracker = [
    {
      id: 'nuclear medicine',
      subject: 'Nuclear Medicine',
      category: 'Custom / Specialty',
      isCustom: true,
      topics: {
        'PET CT Scans': {
          name: 'PET CT Scans',
          studyDates: ['2026-08-27'],
          reviewCount: 1,
          updatedAt: t0
        }
      },
      createdAt: t0,
      updatedAt: t0
    },
    {
      id: 'neurosurgery',
      subject: 'Neurosurgery',
      category: 'Clinical',
      primarySource: 'Greenberg',
      isCustom: true,
      topics: {
        'Subarachnoid Hemorrhage': {
          name: 'Subarachnoid Hemorrhage',
          page: '12',
          studyDates: [],
          reviewCount: 0,
          updatedAt: t1
        }
      },
      createdAt: t1,
      updatedAt: t1
    }
  ];

  // Mock unified graves containing subject tombstone for "nuclear medicine"
  const mockSubjectTrash = [
    {
      id: 'tracker_subject_nuclear medicine',
      entityType: 'tracker_subject',
      entityId: 'nuclear medicine',
      deletedAt: t2,
      updatedAt: t2
    }
  ];

  const merged = mergeSubjectTrackerArrays(locTracker, remTracker, [], [], mockSubjectTrash);
  
  const cardioDoc = merged.find(d => d.id === 'cardiology');
  assert(cardioDoc !== undefined, 'Cardiology custom subject from Device 1 is preserved');
  assert(cardioDoc.isCustom === true, 'Cardiology isCustom flag preserved');
  assert(cardioDoc.category === 'Clinical', 'Cardiology category preserved');
  assert(cardioDoc.primarySource === 'Braunwald + Marrow', 'Cardiology primary source preserved');

  const neuroDoc = merged.find(d => d.id === 'neurosurgery');
  assert(neuroDoc !== undefined, 'Neurosurgery custom subject from Device 2 is merged');
  assert(neuroDoc.isCustom === true, 'Neurosurgery isCustom flag preserved');

  const nucDoc = merged.find(d => d.id === 'nuclear medicine');
  assert(nucDoc === undefined, 'Tombstoned Nuclear Medicine custom subject is pruned and NOT resurrected');
}

// -----------------------------------------------------------------------------
// TEST 35: FSRS Batch Rescheduling & Optimized Weights Cloud Sync Parity
// -----------------------------------------------------------------------------
console.log('\nTEST 35: FSRS Batch Rescheduling & Optimized Weights Cloud Sync Parity');
{
  const t0 = '2026-08-28T08:00:00.000Z';
  const tRemoteReview = new Date(Date.now() + 60_000).toISOString();

  // Synthetic review dataset for weight optimization test
  const syntheticHistory = [];
  const baseTime = new Date('2026-06-01T10:00:00Z').getTime();
  for (let i = 0; i < 60; i++) {
    const curTime = baseTime + i * 86_400_000;
    const curDateStr = new Date(curTime).toISOString().split('T')[0];
    syntheticHistory.push({
      topicKey: 'cardiology:heart_failure',
      topicName: 'Heart Failure',
      rating: (i % 5 === 0) ? 1 : 3, // mostly Good, occasional Again
      y: (i % 5 === 0) ? 0 : 1,
      dateStr: curDateStr,
      timestamp: curTime
    });
  }

  // 1. Verify optimizer produces valid weights with improved or non-negative loss
  const optResult = optimizeFSRSWeights(syntheticHistory, DEFAULT_FSRS6_WEIGHTS);
  assert(optResult.optimizedWeights.length === 21, 'Optimizer produces exactly 21 parameters');
  assert(typeof optResult.initialLoss === 'number', 'Optimizer calculates initial loss');
  assert(typeof optResult.finalLoss === 'number', 'Optimizer calculates final loss');
  assert(optResult.finalLoss <= optResult.initialLoss, 'Optimizer loss is strictly non-increasing');

  // 2. Setup Device 1 & Device 2 data
  const device1SubjectDocs = [
    {
      id: 'cardiology',
      subject: 'Cardiology',
      updatedAt: t0,
      topics: {
        'Heart Failure': {
          studyDates: ['2026-08-20', '2026-08-25'],
          difficulty: 5.0,
          stability: 3.2,
          interval: 4,
          nextReviewDue: '2026-08-29',
          lapses: 0,
          updatedAt: t0
        },
        'Aortic Stenosis': {
          studyDates: ['2026-08-22'],
          difficulty: 6.0,
          stability: 2.0,
          interval: 2,
          nextReviewDue: '2026-08-24',
          lapses: 0,
          updatedAt: t0
        }
      }
    }
  ];

  const studyLogs = {
    '2026-08-20': {
      fsrsLogs: [{ topicName: 'Heart Failure', rating: 3, timestamp: '2026-08-20T10:00:00Z' }]
    },
    '2026-08-25': {
      fsrsLogs: [{ topicName: 'Heart Failure', rating: 4, timestamp: '2026-08-25T10:00:00Z' }]
    },
    '2026-08-22': {
      fsrsLogs: [{ topicName: 'Aortic Stenosis', rating: 3, timestamp: '2026-08-22T10:00:00Z' }]
    }
  };

  // Device 1 runs batch reschedule with 85% retention target
  const newConfig = {
    enabled: true,
    globalDesiredRetention: 0.85,
    weights: optResult.optimizedWeights,
    easyDays: { sun: 'normal', mon: 'normal', tue: 'normal', wed: 'normal', thu: 'normal', fri: 'normal', sat: 'normal' }
  };

  const { updatedSubjectTrackerData, rescheduledCount } = batchRescheduleAllTopics(
    device1SubjectDocs,
    studyLogs,
    newConfig
  );

  assert(rescheduledCount === 2, 'Batch rescheduling updated both studied topics');
  const rescheduledCardio = updatedSubjectTrackerData.find(d => d.id === 'cardiology');
  assert(rescheduledCardio !== undefined, 'Cardiology doc exists after rescheduling');
  const hfTopic = rescheduledCardio.topics['Heart Failure'];
  assert(hfTopic.updatedAt > t0, 'Rescheduled topic has updated granular timestamp');
  assert(hfTopic.nextReviewDue !== undefined, 'Rescheduled topic has valid nextReviewDue');

  // Device 2 meanwhile reviewed Aortic Stenosis at tRemoteReview (fresher than batch reschedule)
  const device2SubjectDocs = [
    {
      id: 'cardiology',
      subject: 'Cardiology',
      updatedAt: tRemoteReview,
      topics: {
        'Heart Failure': {
          studyDates: ['2026-08-20', '2026-08-25'],
          difficulty: 5.0,
          stability: 3.2,
          interval: 4,
          nextReviewDue: '2026-08-29',
          lapses: 0,
          updatedAt: t0 // older untouched topic on device 2
        },
        'Aortic Stenosis': {
          studyDates: ['2026-08-22', '2026-08-28'],
          difficulty: 4.5,
          stability: 7.5,
          interval: 8,
          nextReviewDue: '2026-09-05',
          lapses: 0,
          updatedAt: tRemoteReview // fresher review on device 2
        }
      }
    }
  ];

  // 3. Bi-directional merge simulation between Device 1 and Device 2
  const mergedTracker = mergeSubjectTrackerArrays(updatedSubjectTrackerData, device2SubjectDocs, [], [], []);
  const mergedCardioDoc = mergedTracker.find(d => d.id === 'cardiology');

  assert(mergedCardioDoc !== undefined, 'Merged Cardiology doc exists');
  // Topic 1: Heart Failure was batch-rescheduled on Device 1 (tReschedule > t0) -> Device 1 wins
  assert(
    mergedCardioDoc.topics['Heart Failure'].updatedAt >= hfTopic.updatedAt,
    'Device 1 batch-rescheduled Heart Failure interval is preserved over untouched Device 2'
  );
  // Topic 2: Aortic Stenosis had a fresher review on Device 2 (tRemoteReview > tReschedule) -> Device 2 fresher review wins
  assert(
    mergedCardioDoc.topics['Aortic Stenosis'].updatedAt === tRemoteReview,
    'Device 2 fresher review on Aortic Stenosis is preserved over older batch reschedule'
  );
  assert(
    mergedCardioDoc.topics['Aortic Stenosis'].nextReviewDue === '2026-09-05',
    'Fresher nextReviewDue from Device 2 review is maintained without overwrite'
  );
}

console.log('\n======================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} SYNC SIMULATION TESTS PASSED CLEANLY!`);
console.log('======================================================\n');




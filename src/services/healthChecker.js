/**
 * healthChecker.js - Automated System Health & Logical Invariant Checker for AutoAnki
 * 
 * Proactively audits IndexedDB, FSRS memory parameters, foreign key relationships,
 * and sync integrity to detect silent data corruption and state discrepancies.
 */

import {
  getLocalCards,
  getAllLocalTopics,
  getLocalPages,
  getLocalStudyLogs,
  getFSRSConfig,
  getLocalKV
} from './localDb.js';
import { extractLocalBundles, getLastSyncedHashes } from './googleDriveSync.js';
import logger from './logger.js';

let latestHealthReport = null;

export function getLatestHealthReport() {
  return latestHealthReport;
}

/**
 * Runs a 360-degree System Integrity Check across IndexedDB, FSRS, and Sync layers.
 * @param {Object} options
 * @param {boolean} options.silent - If true, does not log info message on complete success
 * @returns {Promise<Object>} Detailed diagnostic health report
 */
export async function runSystemIntegrityCheck(options = {}) {
  const { silent = false } = options;
  const startTime = Date.now();
  const anomalies = [];

  logger.info('HEALTH-CHECK-START', 'Initiating automated system integrity and invariant audit...');

  try {
    // 1. Fetch all primary entities in parallel from LocalDB
    const [
      cards,
      topics,
      pages,
      studyLogs,
      fsrsConfig,
      subjectTrackerData,
      lastSyncedHashes
    ] = await Promise.all([
      getLocalCards().catch(e => { anomalies.push({ type: 'DB_READ_ERROR', entity: 'cards', error: e.message }); return []; }),
      getAllLocalTopics().catch(e => { anomalies.push({ type: 'DB_READ_ERROR', entity: 'topics', error: e.message }); return []; }),
      getLocalPages().catch(e => { anomalies.push({ type: 'DB_READ_ERROR', entity: 'pages', error: e.message }); return []; }),
      getLocalStudyLogs().catch(e => { anomalies.push({ type: 'DB_READ_ERROR', entity: 'studyLogs', error: e.message }); return {}; }),
      getFSRSConfig().catch(() => null),
      getLocalKV('subject_tracker_data', []).catch(() => []),
      getLastSyncedHashes().catch(() => null)
    ]);

    const totalCards = Array.isArray(cards) ? cards.length : 0;
    const totalTopics = Array.isArray(topics) ? topics.length : 0;
    const totalPages = Array.isArray(pages) ? pages.length : 0;
    const totalStudyLogDays = studyLogs && typeof studyLogs === 'object' ? Object.keys(studyLogs).length : 0;

    // Build lookup maps
    const topicIdSet = new Set((topics || []).map(t => t?.id).filter(Boolean));
    const topicNameSet = new Set((topics || []).map(t => t?.name?.toLowerCase().trim()).filter(Boolean));
    
    // Also include topics from subject tracker docs
    if (Array.isArray(subjectTrackerData)) {
      subjectTrackerData.forEach(sub => {
        if (sub?.topics && typeof sub.topics === 'object') {
          Object.values(sub.topics).forEach(t => {
            if (t?.id) topicIdSet.add(t.id);
            if (t?.name) topicNameSet.add(t.name.toLowerCase().trim());
          });
        }
      });
    }

    // ── Invariant 1: [DB & Storage Invariant] ─────────────────────────────────
    if (!Array.isArray(cards)) {
      anomalies.push({
        type: 'STORAGE_CORRUPTION',
        field: 'flashcards',
        message: 'Flashcards store did not return an array.'
      });
    }

    if (!Array.isArray(topics)) {
      anomalies.push({
        type: 'STORAGE_CORRUPTION',
        field: 'topics',
        message: 'Topics store did not return an array.'
      });
    }

    // Check manifest extraction consistency
    let localManifest = null;
    try {
      const extracted = await extractLocalBundles();
      localManifest = extracted?.manifest;
      if (!localManifest || !localManifest.hashes) {
        anomalies.push({
          type: 'MANIFEST_CORRUPTION',
          message: 'Failed to compute checksums for local bundle manifest.'
        });
      }
    } catch (manifestErr) {
      anomalies.push({
        type: 'MANIFEST_ERROR',
        message: manifestErr.message
      });
    }

    // ── Invariant 2: [Orphan Reference Invariant] ──────────────────────────────
    let orphanCardsCount = 0;
    (cards || []).forEach(card => {
      if (!card || !card.id) return;
      const topicRef = card.topicId || card.topic || card.topicName;
      if (topicRef && typeof topicRef === 'string') {
        const cleanRef = topicRef.toLowerCase().trim();
        const hasMatch = topicIdSet.has(topicRef) || topicNameSet.has(cleanRef);
        // If topics exist in DB but this card's topic reference is not found
        if (totalTopics > 0 && !hasMatch && cleanRef !== 'general' && cleanRef !== 'uncategorized' && cleanRef !== 'default') {
          orphanCardsCount++;
          if (orphanCardsCount <= 5) {
            anomalies.push({
              type: 'ORPHAN_CARD_REFERENCE',
              cardId: card.id,
              referencedTopic: topicRef,
              message: `Card "${card.front?.substring(0, 25) || card.id}" references missing topic "${topicRef}".`
            });
          }
        }
      }
    });

    if (orphanCardsCount > 5) {
      anomalies.push({
        type: 'ORPHAN_CARD_SUMMARY',
        count: orphanCardsCount,
        message: `Total ${orphanCardsCount} card(s) reference non-existent topics.`
      });
    }

    // ── Invariant 3: [FSRS Algorithm Sanity Invariant] ────────────────────────
    let fsrsGlitchesCount = 0;
    const checkFsrsSanity = (entity, entityType) => {
      if (!entity) return;
      const { stability, difficulty, interval, scheduledDays, reps, lapses, state, nextReviewDue, due } = entity;

      const isStudied = (reps && reps > 0) || (state !== undefined && state !== 0 && state !== '0');
      
      if (isStudied) {
        // Stability check: must be positive number
        if (stability !== undefined && (typeof stability !== 'number' || isNaN(stability) || stability < 0)) {
          fsrsGlitchesCount++;
          anomalies.push({
            type: 'FSRS_INVALID_STABILITY',
            entityType,
            id: entity.id || entity.name,
            value: stability,
            message: `${entityType} has invalid stability value: ${stability}`
          });
        }

        // Difficulty check: 0 <= D <= 10
        if (difficulty !== undefined && (typeof difficulty !== 'number' || isNaN(difficulty) || difficulty < 0 || difficulty > 10.5)) {
          fsrsGlitchesCount++;
          anomalies.push({
            type: 'FSRS_INVALID_DIFFICULTY',
            entityType,
            id: entity.id || entity.name,
            value: difficulty,
            message: `${entityType} has out-of-bounds difficulty: ${difficulty}`
          });
        }

        // Interval check: 0 <= interval <= 36500 (100 years)
        const checkInterval = interval !== undefined ? interval : scheduledDays;
        if (checkInterval !== undefined && (typeof checkInterval !== 'number' || isNaN(checkInterval) || checkInterval < 0 || checkInterval > 36500)) {
          fsrsGlitchesCount++;
          anomalies.push({
            type: 'FSRS_INVALID_INTERVAL',
            entityType,
            id: entity.id || entity.name,
            value: checkInterval,
            message: `${entityType} has invalid interval: ${checkInterval}`
          });
        }

        // Lapses check: must be >= 0
        if (lapses !== undefined && (typeof lapses !== 'number' || isNaN(lapses) || lapses < 0)) {
          fsrsGlitchesCount++;
          anomalies.push({
            type: 'FSRS_INVALID_LAPSES',
            entityType,
            id: entity.id || entity.name,
            value: lapses,
            message: `${entityType} has negative or NaN lapses: ${lapses}`
          });
        }

        // Due date format check
        const dueDate = nextReviewDue || due;
        if (dueDate && typeof dueDate === 'string') {
          if (dueDate.length < 10 || isNaN(Date.parse(dueDate))) {
            fsrsGlitchesCount++;
            anomalies.push({
              type: 'FSRS_INVALID_DUE_DATE',
              entityType,
              id: entity.id || entity.name,
              value: dueDate,
              message: `${entityType} has corrupted due date format: ${dueDate}`
            });
          }
        }
      }
    };

    (cards || []).forEach(c => checkFsrsSanity(c, 'Card'));
    (topics || []).forEach(t => checkFsrsSanity(t, 'Topic'));

    // ── Invariant 4: [Sync Consistency Invariant] ─────────────────────────────
    if (localManifest && lastSyncedHashes && typeof lastSyncedHashes === 'object') {
      const hashes = localManifest.hashes || {};
      // Verify hash format: 16 hex characters
      Object.entries(hashes).forEach(([bundle, hash]) => {
        if (typeof hash !== 'string' || !/^[0-9a-f]{16}$/i.test(hash)) {
          anomalies.push({
            type: 'SYNC_HASH_FORMAT_INVALID',
            bundle,
            hash,
            message: `Bundle ${bundle} has invalid 64-bit checksum format: "${hash}"`
          });
        }
      });
    }

    // ── Invariant 5: [Media Reference Invariant] ──────────────────────────────
    let emptyMediaPagesCount = 0;
    (pages || []).forEach(p => {
      if (p && p.id) {
        const hasData = p.data || p.imageUrl || p.originalImage;
        if (!hasData) {
          emptyMediaPagesCount++;
          if (emptyMediaPagesCount <= 3) {
            anomalies.push({
              type: 'EMPTY_MEDIA_REFERENCE',
              pageId: p.id,
              pageNumber: p.pageNumber,
              message: `Scanned page ${p.pageNumber || p.id} exists without image binary or data URL.`
            });
          }
        }
      }
    });

    // ── Compile Diagnostic Health Report ─────────────────────────────────────
    const durationMs = Date.now() - startTime;
    const isHealthy = anomalies.length === 0;
    const summary = isHealthy
      ? `${totalCards} Cards Verified • ${totalTopics} Topics • 0 Orphans • 0 FSRS Glitches • Healthy (${durationMs}ms)`
      : `${totalCards} Cards • ${anomalies.length} Anomaly(s) Detected • Needs Review (${durationMs}ms)`;

    const report = {
      timestamp: new Date().toISOString(),
      durationMs,
      isHealthy,
      summary,
      stats: {
        totalCards,
        totalTopics,
        totalPages,
        totalStudyLogDays,
        orphanCardsCount,
        fsrsGlitchesCount,
        emptyMediaPagesCount
      },
      anomalies
    };

    latestHealthReport = report;

    // Log findings via unified logger
    if (isHealthy) {
      if (!silent) {
        logger.info('HEALTH-CHECK-PASS', `System invariants 100% verified: ${summary}`, report.stats);
      }
    } else {
      anomalies.forEach((a, idx) => {
        logger.anomaly(a.type || `ANOMALY_${idx + 1}`, a.message, a);
      });
      logger.warn('HEALTH-CHECK-ANOMALIES', `Health check detected ${anomalies.length} logical issue(s).`, report);
    }

    return report;
  } catch (globalErr) {
    const errorReport = {
      timestamp: new Date().toISOString(),
      isHealthy: false,
      summary: `System integrity check failed: ${globalErr.message}`,
      anomalies: [{ type: 'HEALTH_CHECK_CRASH', message: globalErr.message, stack: globalErr.stack }]
    };
    latestHealthReport = errorReport;
    logger.error('HEALTH-CHECK-CRASH', 'Fatal error during system integrity check:', globalErr);
    return errorReport;
  }
}

import fs from 'fs';
import path from 'path';

console.log('====================================================');
console.log('🔍 RUNNING DEEP COMPREHENSIVE CODEBASE AUDIT');
console.log('====================================================\n');

const srcDir = './src';
const allFiles = [];

function collectFiles(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full);
    else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js') || entry.name.endsWith('.css')) {
      allFiles.push(full);
    }
  });
}
collectFiles(srcDir);

// 1. Check Universal Snapshot stores vs localDb stores
console.log('--- AUDIT 1: Universal Snapshot & IndexedDB Stores Parity ---');
const localDbCode = fs.readFileSync('./src/services/localDb.js', 'utf8');
const syncCode = fs.readFileSync('./src/services/googleDriveSync.js', 'utf8');

const storeMatches = [...localDbCode.matchAll(/const\s+([A-Z_]+_STORE)\s*=\s*'([^']+)'/g)];
console.log('IndexedDB Stores defined in localDb.js:', storeMatches.map(m => `${m[1]}: ${m[2]}`));

// Check exportFullUniversalSnapshot
const exportSnapshotSection = localDbCode.slice(localDbCode.indexOf('exportFullUniversalSnapshot'), localDbCode.indexOf('importUniversalSnapshot'));
const importSnapshotSection = localDbCode.slice(localDbCode.indexOf('importUniversalSnapshot'), localDbCode.indexOf('importUniversalSnapshot') + 5000);

storeMatches.forEach(m => {
  const storeName = m[2];
  const inExport = exportSnapshotSection.includes(storeName);
  const inImport = importSnapshotSection.includes(storeName);
  console.log(`Store "${storeName}" -> Exported: ${inExport ? '✅' : '❌'}, Imported: ${inImport ? '✅' : '❌'}`);
});

// 2. Check Date Parsing & Timezone Handling
console.log('\n--- AUDIT 2: Date Parsing & Timezone Inconsistencies ---');
allFiles.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const isoSplitMatches = [...content.matchAll(/toISOString\(\)\.split\('T'\)\[0\]/g)];
  if (isoSplitMatches.length > 0) {
    console.log(`⚠️  ${path.relative('.', f)} has ${isoSplitMatches.length} raw toISOString().split('T')[0] calls (Risk of UTC date rollover around midnight!)`);
  }
});

// 3. Check Deletions & Tombstoning Coverage
console.log('\n--- AUDIT 3: Deletion Handlers & Tombstoning In App.jsx & Components ---');
allFiles.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const deleteLines = [];
  const lines = content.split('\n');
  lines.forEach((l, idx) => {
    if (l.match(/filter\(\s*(card|topic|item|doc|log|task|gt|session)\s*=>/i) && (l.includes('set') || l.includes('State'))) {
      deleteLines.push({ line: idx + 1, content: l.trim() });
    }
  });
  if (deleteLines.length > 0 && !f.includes('test') && !f.includes('node_modules')) {
    // console.log(`${path.relative('.', f)}: ${deleteLines.length} state-filtering patterns found.`);
  }
});

// 4. Check Pill Switcher Transitions across JSX
console.log('\n--- AUDIT 4: Pill Switcher & Motion Deceleration Standard ---');
let nonCompliantTransitions = 0;
allFiles.forEach(f => {
  if (f.endsWith('.jsx')) {
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n');
    lines.forEach((l, idx) => {
      if (l.includes('transition:') && l.includes('cubic-bezier') && !l.includes('cubic-bezier(0, 0, 0, 1)')) {
        console.log(`⚠️  Non-standard cubic-bezier in ${path.relative('.', f)}:${idx+1} -> ${l.trim()}`);
        nonCompliantTransitions++;
      }
    });
  }
});
if (nonCompliantTransitions === 0) console.log('✅ All cubic-bezier transitions follow standard or design tokens.');

// 5. Check Dead Click Handlers / Missing onClick in JSX
console.log('\n--- AUDIT 5: Potential Dead Buttons or Incomplete Handlers ---');
allFiles.forEach(f => {
  if (f.endsWith('.jsx')) {
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n');
    lines.forEach((l, idx) => {
      if (l.match(/onClick=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/) || l.match(/onClick=\{\s*\(\)\s*=>\s*console\.log/) || l.match(/onClick=\{\s*undefined\s*\}/)) {
        console.log(`⚠️  Dead/Dummy onClick found in ${path.relative('.', f)}:${idx+1} -> ${l.trim()}`);
      }
    });
  }
});

// 6. Check Multi-Tab BroadcastChannel Events
console.log('\n--- AUDIT 6: Multi-Tab BroadcastChannel Events Tracing ---');
const bcSenders = [];
const bcReceivers = [];
allFiles.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((l, idx) => {
    if (l.includes('postMessage(') && (l.includes('broadcast') || l.includes('channel') || l.includes('syncChannel') || l.includes('storageChannel') || l.includes('tabChannel'))) {
      bcSenders.push({ file: path.relative('.', f), line: idx + 1, text: l.trim() });
    }
    if (l.includes('.onmessage') || l.includes('addEventListener(\'message\'')) {
      bcReceivers.push({ file: path.relative('.', f), line: idx + 1, text: l.trim() });
    }
  });
});
console.log(`Found ${bcSenders.length} BroadcastChannel message emitters and ${bcReceivers.length} receivers.`);

// 7. Check FSRS Engine Mutation Boundary
console.log('\n--- AUDIT 7: FSRS Engine & Predictive Timing Isolation ---');
const predTimingCode = fs.readFileSync('./src/services/predictiveTimingEngine.js', 'utf8');
const mutatesFsrsDirectly = predTimingCode.includes('saveLocalCard') || predTimingCode.includes('saveLocalTopic') || predTimingCode.includes('fsrs.calculate') || predTimingCode.includes('fsrs.rating');
console.log(`Predictive Timing Engine mutates LocalDB cards/topics: ${mutatesFsrsDirectly ? '❌ VIOLATION' : '✅ Strictly Read-Only Clean'}`);

console.log('\nAudit scan completed.');

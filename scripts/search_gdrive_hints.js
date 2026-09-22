import fs from 'fs';

const code = fs.readFileSync('./src/services/googleDriveSync.js', 'utf8');
const lines = code.split('\n');

console.log('=== TOPIC HINTS & QUOTA IN GDRIVE SYNC ===');
lines.forEach((l, i) => {
  if (l.includes('topicHints') || l.includes('hintQuota') || l.includes('TOPIC_HINTS') || l.includes('HINT_QUOTA')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});

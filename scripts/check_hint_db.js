import fs from 'fs';

const code = fs.readFileSync('./src/services/localDb.js', 'utf8');
const lines = code.split('\n');

console.log('=== TOPIC HINTS & QUOTA LOCALDB METHODS ===');
lines.forEach((l, i) => {
  if (l.includes('TopicHint') || l.includes('topic_hints') || l.includes('topicHints') || l.includes('HintQuota') || l.includes('hint_quota')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});

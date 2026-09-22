import fs from 'fs';

const code = fs.readFileSync('./src/components/SmartReviewHub.jsx', 'utf8');
const lines = code.split('\n');

console.log('=== SEARCHING RECALL / GAUGE / RATING LOGIC IN SMARTREVIEWTHUB ===');
lines.forEach((l, i) => {
  if (l.includes('recall') || l.includes('Recall') || l.includes('gauge') || l.includes('Gauge') || l.includes('percent') || l.includes('recommended') || l.includes('Progress') || l.includes('points') || l.includes('leaf') || l.includes('checked')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});

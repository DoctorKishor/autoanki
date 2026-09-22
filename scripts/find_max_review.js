import fs from 'fs';

const code = fs.readFileSync('./src/App.jsx', 'utf8');
const lines = code.split('\n');

console.log('--- setMaxDailyReviewCap DECLARATIONS & USAGES ---');
lines.forEach((l, i) => {
  if (l.includes('setMaxDailyReviewCap') || l.includes('maxDailyReviewCap')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});

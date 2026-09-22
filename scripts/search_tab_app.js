import fs from 'fs';

const code = fs.readFileSync('./src/App.jsx', 'utf8');
const lines = code.split('\n');

console.log('=== SEARCHING SMART REVIEW IN APP.JSX ===');
lines.forEach((l, i) => {
  if (l.includes('renderSmartReviewTab') || l.includes('smart_review') || (l.includes('SmartReview') && !l.includes('import'))) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});

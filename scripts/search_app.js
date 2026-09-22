import fs from 'fs';

const code = fs.readFileSync('./src/App.jsx', 'utf8');
const lines = code.split('\n');

lines.forEach((l, i) => {
  if (l.includes('SmartReviewHub') || l.includes('handleTopicRate') || l.includes('handleRateTopic')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});

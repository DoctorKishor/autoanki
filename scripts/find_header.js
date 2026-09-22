import fs from 'fs';

const content = fs.readFileSync('src/App.jsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('headerUpcomingExam') || l.includes('countdownText')) {
    console.log(i + 1, l.trim());
  }
});

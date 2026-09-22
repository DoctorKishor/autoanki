import fs from 'fs';

const content = fs.readFileSync('src/App.jsx', 'utf8');
const matches = [...content.matchAll(/currentTab === ['"](\w+)['"]/g)].map(m => m[1]);
console.log('Unique Tabs:', [...new Set(matches)]);

const examMatches = [...content.matchAll(/.*(?:exam|Exam|smartReview|SmartReview).*/g)].slice(0, 30);
examMatches.forEach(m => console.log('Line:', m[0].trim().substring(0, 100)));

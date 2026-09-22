import fs from 'fs';

const code = fs.readFileSync('./src/App.jsx', 'utf8');
const lines = code.split('\n');

lines.forEach((l, i) => {
  if (l.includes('AutoAnki') && l.includes('<') && (l.includes('h1') || l.includes('span') || l.includes('div') || l.includes('nav'))) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});

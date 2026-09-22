import fs from 'fs';

const code = fs.readFileSync('./src/App.jsx', 'utf8');
const lines = code.split('\n');

console.log('--- MODAL STATES IN APP.JSX ---');
lines.forEach((l, i) => {
  if (l.match(/const\s+\[\s*is[A-Za-z0-9]*(Modal|Dialog|Open)/) || l.match(/const\s+\[\s*show[A-Za-z0-9]*(Modal|Dialog)/)) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});

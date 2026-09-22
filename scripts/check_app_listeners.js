import fs from 'fs';

const appCode = fs.readFileSync('./src/App.jsx', 'utf8');
const lines = appCode.split('\n');

console.log('--- APP.JSX EVENT LISTENERS SCAN ---');
lines.forEach((line, idx) => {
  if (line.includes('addEventListener') || line.includes('BroadcastChannel') || line.includes('gdrive-data-hydrated') || line.includes('localdb-mutation')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});

import fs from 'fs';

const logPath = 'C:\\Users\\ṬŚ\\.gemini\\antigravity-ide\\brain\\a6b29de5-246f-496b-a131-362297b95ae7\\.system_generated\\tasks\\task-339.log';
const log = fs.readFileSync(logPath, 'utf8');
const lines = log.split('\n');

console.log('=== UNDEFINED SYMBOLS (no-undef) & TDZ (no-use-before-define) AUDIT ===');
let currentFile = '';
let undefCount = 0;
let tdzCount = 0;

lines.forEach(l => {
  if (l.startsWith('D:\\') || l.startsWith('d:\\') || l.startsWith('/')) {
    currentFile = l.trim();
  }
  if (l.includes('no-undef')) {
    console.log(`[UNDEFINED SYMBOL] ${currentFile} -> ${l.trim()}`);
    undefCount++;
  }
  if (l.includes('no-use-before-define') || l.includes('before-define')) {
    console.log(`[TDZ / USE-BEFORE-DEFINE] ${currentFile} -> ${l.trim()}`);
    tdzCount++;
  }
});

console.log(`\nTotal 'no-undef' errors: ${undefCount}`);
console.log(`Total 'no-use-before-define' errors: ${tdzCount}`);

import fs from 'fs';

const appCode = fs.readFileSync('./src/App.jsx', 'utf8');

console.log('--- KEYBOARD SHORTCUTS & CONFIRMATIONS SCAN ---');
const lines = appCode.split('\n');

lines.forEach((l, idx) => {
  if (l.includes('e.key') || l.includes('event.key') || l.includes('handleKeyDown') || l.includes('window.confirm') || l.includes('confirm(')) {
    // console.log(`Line ${idx+1}: ${l.trim()}`);
  }
});

// Check ESC key handlers
const escHandlers = lines.filter(l => (l.includes('Escape') || l.includes('Esc')) && (l.includes('key') || l.includes('Code')));
console.log(`Found ${escHandlers.length} Escape key event handlers.`);

// Check Spacebar handlers
const spaceHandlers = lines.filter(l => (l.includes('Space') || l.includes('\' \'')) && (l.includes('key') || l.includes('Code')));
console.log(`Found ${spaceHandlers.length} Spacebar key event handlers.`);

// Check 1,2,3,4 rating hotkey handlers
const numHotkeys = lines.filter(l => (l.includes('\'1\'') || l.includes('\'2\'') || l.includes('\'3\'') || l.includes('\'4\'')) && (l.includes('key') || l.includes('Code')));
console.log(`Found ${numHotkeys.length} numeric hotkey handlers.`);

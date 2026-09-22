import fs from 'fs';
import path from 'path';

console.log('--- DESIGN SYSTEM & UI/UX AUDIT ---');

const files = [];
function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith('.jsx')) files.push(full);
  });
}
walk('./src');

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');

  // Check transitions
  lines.forEach((l, idx) => {
    if (l.includes('cubic-bezier') && !l.includes('cubic-bezier(0, 0, 0, 1)') && !l.includes('cubic-bezier(0,0,0,1)')) {
      console.log(`[Pill Transition Mismatch] ${path.relative('.', f)}:${idx + 1} -> ${l.trim()}`);
    }
  });

  // Check empty state placeholders without actionable buttons
  if (content.includes('No cards found') || content.includes('No topics found') || content.includes('No items found') || content.includes('No data')) {
    // console.log(`[Empty State Component] ${path.relative('.', f)}`);
  }
});

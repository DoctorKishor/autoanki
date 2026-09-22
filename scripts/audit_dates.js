import fs from 'fs';
import path from 'path';

const files = [];
function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith('.js') || e.name.endsWith('.jsx')) files.push(full);
  });
}
walk('./src');

console.log('--- DATE & TIMEZONE AUDIT ---');
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((l, idx) => {
    // Look for toISOString().split('T')[0] or toISOString().slice(0, 10)
    if (l.includes('.toISOString().split(\'T\')[0]') || l.includes('.toISOString().slice(0, 10)')) {
      console.log(`[UTC Date Risk] ${path.relative('.', f)}:${idx + 1} -> ${l.trim()}`);
    }
  });
});
console.log('Done date audit.');

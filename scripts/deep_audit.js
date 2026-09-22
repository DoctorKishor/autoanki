import fs from 'fs';
import path from 'path';

console.log('--- TIMER / INTERVAL / EVENT LISTENER CLEANUP AUDIT ---');

const srcFiles = [];
function findJsxFiles(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findJsxFiles(full);
    else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) srcFiles.push(full);
  });
}
findJsxFiles('./src');

srcFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('setInterval(') && !content.includes('clearInterval(')) {
      console.log(`[Timer Leak Risk] setInterval without clearInterval in ${file}:${idx + 1}`);
    }
    if (line.includes('addEventListener(') && !content.includes('removeEventListener(')) {
      console.log(`[Listener Leak Risk] addEventListener without removeEventListener in ${file}:${idx + 1}`);
    }
  });
});

console.log('Audit completed.');

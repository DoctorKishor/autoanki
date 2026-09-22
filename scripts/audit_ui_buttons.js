import fs from 'fs';
import path from 'path';

console.log('--- UI/UX & CLICK PATH AUDIT ---');

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

  // Check empty / dummy onClick
  lines.forEach((l, idx) => {
    if (l.match(/onClick=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/)) {
      console.log(`[Dead Button] ${path.relative('.', f)}:${idx + 1} has empty onClick: ${l.trim()}`);
    }
    if (l.match(/onClick=\{\s*undefined\s*\}/) || l.match(/onClick=\{\s*null\s*\}/)) {
      console.log(`[Null Handler] ${path.relative('.', f)}:${idx + 1} has null/undefined onClick: ${l.trim()}`);
    }
    if (l.includes('<button') && !l.includes('onClick') && !l.includes('type="submit"') && !l.includes('type="reset"') && !l.includes('disabled')) {
      // Check if button tag is multi-line
      let multiLine = '';
      for (let i = idx; i < Math.min(idx + 10, lines.length); i++) {
        multiLine += lines[i] + ' ';
        if (lines[i].includes('>')) break;
      }
      if (!multiLine.includes('onClick') && !multiLine.includes('type="submit"') && !multiLine.includes('type=\'submit\'') && !multiLine.includes('form=') && !multiLine.includes('type="file"')) {
        console.log(`[Button without onClick] ${path.relative('.', f)}:${idx + 1} -> ${l.trim()}`);
      }
    }
  });
});
console.log('UI/UX Click Path Audit completed.');

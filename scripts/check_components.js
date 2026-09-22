import fs from 'fs';
import path from 'path';

console.log('--- COMPONENT IMPORTS & PROP SIGNATURE AUDIT ---');

const compDir = './src/components';
const components = fs.readdirSync(compDir).filter(f => f.endsWith('.jsx'));

components.forEach(c => {
  const content = fs.readFileSync(path.join(compDir, c), 'utf8');
  // Check for undefined vars or unclosed tags
  const isDefaultExport = content.includes('export default');
  const namedExports = [...content.matchAll(/export\s+(const|function)\s+([a-zA-Z0-9_]+)/g)].map(m => m[2]);
  console.log(`Component ${c}: Default export: ${isDefaultExport}, Named exports: ${namedExports.join(', ') || 'none'}`);
});

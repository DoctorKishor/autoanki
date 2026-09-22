import fs from 'fs';
import path from 'path';

const srcDir = './src';
const allFiles = [];
function collectFiles(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full);
    else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) {
      allFiles.push(full);
    }
  });
}
collectFiles(srcDir);

const hooks = ['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'useContext', 'useReducer', 'useLayoutEffect', 'useDeferredValue', 'useTransition'];

allFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  hooks.forEach(hook => {
    // Check if hook is used (not as React.hook or hook declaration)
    const regex = new RegExp(`(?<![a-zA-Z0-9_.])${hook}\\(`, 'g');
    if (regex.test(content)) {
      // Check if hook is imported or defined
      const isImported = content.includes(hook) && (content.includes(`import`) || content.includes(`from 'react'`));
      // Check if import line actually has the hook
      const importLines = content.split('\n').filter(l => l.includes('from \'react\'') || l.includes('from "react"'));
      const importedInReact = importLines.some(l => l.includes(hook));
      if (!importedInReact && !content.includes(`React.${hook}`) && !content.includes(`const ${hook} =`)) {
        console.log(`⚠️  ${path.relative('.', file)}: uses "${hook}" but does not import it from 'react'!`);
      }
    }
  });
});
console.log('Hook audit complete.');

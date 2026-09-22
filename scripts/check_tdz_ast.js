import fs from 'fs';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

const files = [
  './src/App.jsx',
  './src/components/ManualCardModal.jsx',
  './src/components/TopicNotesModal.jsx',
  './src/components/SmartReviewHub.jsx',
  './src/components/RatingDurationModal.jsx'
];

console.log('=== CHECKING POTENTIAL RUNTIME TDZ ERRORS IN TOP-LEVEL COMPONENT RENDERS ===');

files.forEach(file => {
  const code = fs.readFileSync(file, 'utf8');
  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx']
    });

    const declared = new Map(); // name -> line
    const references = []; // { name, line, scope }

    // First collect declarations and references inside function components
    traverse.default(ast, {
      VariableDeclarator(path) {
        if (path.node.id && path.node.id.type === 'Identifier') {
          declared.set(path.node.id.name, path.node.loc.start.line);
        }
      },
      CallExpression(path) {
        // Check hooks like useEffect, useMemo, useCallback
        const callee = path.node.callee;
        if (callee && (callee.name === 'useEffect' || callee.name === 'useMemo' || callee.name === 'useCallback')) {
          // Check deps array
          const deps = path.node.arguments[1];
          if (deps && deps.type === 'ArrayExpression') {
            deps.elements.forEach(el => {
              if (el && el.type === 'Identifier') {
                const decLine = declared.get(el.name);
                const hookLine = path.node.loc.start.line;
                if (!decLine || decLine > hookLine) {
                  console.log(`[POTENTIAL TDZ IN HOOK DEPS] ${file} Line ${hookLine}: hook depends on '${el.name}' which is defined on Line ${decLine || 'UNDEFINED'}`);
                }
              }
            });
          }
        }
      }
    });
  } catch (err) {
    console.error(`Error parsing ${file}:`, err.message);
  }
});

console.log('TDZ Check Complete.');

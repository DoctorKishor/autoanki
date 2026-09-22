import { ESLint } from 'eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

async function runStrictUndefinedAudit() {
  console.log('--- STRICT NO-UNDEF & NO-USE-BEFORE-DEFINE AUDIT ---');

  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['src/**/*.{js,jsx}'],
        languageOptions: {
          globals: {
            ...globals.browser,
            ...globals.node,
            ...globals.es2021,
            // App-specific globals
            google: 'readonly',
            PDFLib: 'readonly',
            pdfjsLib: 'readonly',
            Html5QrcodeScanner: 'readonly',
            JSZip: 'readonly',
            MathJax: 'readonly'
          },
          parserOptions: {
            ecmaFeatures: { jsx: true },
            ecmaVersion: 'latest',
            sourceType: 'module'
          }
        },
        plugins: {
          'react-hooks': reactHooks
        },
        rules: {
          'no-undef': 'error',
          'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
          'react-hooks/rules-of-hooks': 'error'
        }
      }
    ]
  });

  const results = await eslint.lintFiles(['src/**/*.{js,jsx}']);

  let totalErrors = 0;
  results.forEach(result => {
    const errorMessages = result.messages.filter(m => m.ruleId === 'no-undef' || m.ruleId === 'no-use-before-define' || m.ruleId?.includes('react-hooks'));
    if (errorMessages.length > 0) {
      console.log(`\n📄 ${result.filePath}:`);
      errorMessages.forEach(msg => {
        console.log(`   Line ${msg.line}:${msg.column} [${msg.ruleId}] -> ${msg.message}`);
        totalErrors++;
      });
    }
  });

  console.log(`\n======================================================`);
  console.log(`Total Critical Runtime Crash Errors Found: ${totalErrors}`);
  console.log(`======================================================`);
}

runStrictUndefinedAudit().catch(console.error);

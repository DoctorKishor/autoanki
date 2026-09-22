import fs from 'fs';

const code = fs.readFileSync('./src/App.jsx', 'utf8');
const lines = code.split('\n');

console.log('=== APP.JSX COMPONENT & FUNCTION MAP ===');
lines.forEach((l, i) => {
  if (l.match(/^export default function App\s*\(/) || l.match(/^function App\s*\(/) || l.match(/^const App\s*=\s*\(/) || l.match(/^function [A-Z]/) || l.match(/^const [A-Z][A-Za-z0-9_]*\s*=\s*(React\.)?(memo\()?(\(|function)/)) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});

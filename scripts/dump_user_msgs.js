import fs from 'fs';

const text = fs.readFileSync('C:\\Users\\ṬŚ\\.gemini\\antigravity-ide\\brain\\10fdbd62-d6d8-4bc8-a0a6-dba73e87788e\\.system_generated\\logs\\transcript.jsonl', 'utf8');
const lines = text.split('\n');
lines.forEach(l => {
  if (l.includes('"type":"USER_INPUT"')) {
    try {
      const p = JSON.parse(l);
      let content = p.content || '';
      const metaIdx = content.indexOf('<ADDITIONAL_METADATA>');
      if (metaIdx !== -1) content = content.substring(0, metaIdx);
      console.log('=== TIME:', p.created_at, '===');
      console.log(content.trim());
    } catch(e) {}
  }
});

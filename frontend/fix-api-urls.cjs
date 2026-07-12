const fs = require('fs');
const files = ['src/App.tsx','src/components/Editor.tsx','src/components/Environment.tsx','src/components/Terminal.tsx'];
let changed = 0;
for (const rel of files) {
  const p = process.cwd() + '/' + rel;
  let t = fs.readFileSync(p, 'utf8');
  const b = t;
  t = t.replace(/fetch\('nchat'/g, 'fetch("/api/chat"');
  t = t.replace(/fetch\('ncoding\//g, 'fetch("/api/coding/');
  if (t !== b) { fs.writeFileSync(p, t, 'utf8'); changed++; console.log('fixed', rel); }
}
console.log('changed', changed);
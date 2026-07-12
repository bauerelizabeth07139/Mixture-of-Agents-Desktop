const fs = require('fs');
const p = process.cwd() + '/src/App.tsx';
let t = fs.readFileSync(p, 'utf8');
const before = t;

// Line 476: fix badge-warning -> badge-purple for 视觉
t = t.replace(/badge-warning" style=\{\{ fontSize: 9 \}\}>🖼️ 视觉/g, 'badge-purple" style={{fontSize:9}}>🖼️ 视觉');
// Line 477: fix remaining broken badge-accent (no closing quote) for 语音
t = t.replace(/badge-accent style=\{\{ fontSize: 9 \}\}>🗣️ 语音/g, 'badge-accent" style={{fontSize:9}}>🗣️ 语音');
// Line 477: fix remaining broken badge-accent (no closing quote) for 音频
t = t.replace(/badge-accent style=\{\{ fontSize: 9 \}\}>🔊 音频/g, 'badge-orange" style={{fontSize:9}}>🔊 音频');

console.log('changed:', t !== before);
fs.writeFileSync(p, t, 'utf8');
console.log('written');
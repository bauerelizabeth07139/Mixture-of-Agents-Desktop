const fs = require('fs');
const p = process.cwd() + '/src/App.tsx';
let t = fs.readFileSync(p, 'utf8');
const before = t;

// Fix broken className: badge-accent style={{fontSize:9}}> -> badge-accent" style={{fontSize:9}}>
t = t.replace(/badge-accent style=\{\{fontSize:9\}\}>/g, 'badge-accent" style={{fontSize:9}}>');
// Fix broken className: badge-accent>🗣️ -> badge-accent" style={{fontSize:9}}>🗣️
t = t.replace(/badge-accent>🗣️ 语音模型<\/span>/g, 'badge-accent" style={{fontSize:9}}>🗣️ 语音</span>');
t = t.replace(/badge-accent>🔊 音频/g, 'badge-accent" style={{fontSize:9}}>🔊 音频');

// Now change badge colors: 视觉/音频 = test-based (purple/orange), 语音 = name-based (cyan)
// 视觉: keep badge-warning (yellow/orange-ish) -> change to custom purple
t = t.replace(/badge-warning" style=\{\{fontSize:9\}\}>🖼️ 视觉/g, 'badge-purple" style={{fontSize:9}}>🖼️ 视觉');
t = t.replace(/badge-warning" style=\{\{ marginLeft: 4 \}\}>🖼️ 视觉/g, 'badge-purple" style={{marginLeft:4}}>🖼️ 视觉');
t = t.replace(/badge-warning">🖼️ 视觉/g, 'badge-purple">🖼️ 视觉');
// 音频: keep badge-accent (currently same as 语音) -> change to custom orange
t = t.replace(/badge-accent" style=\{\{fontSize:9\}\}>🔊 音频/g, 'badge-orange" style={{fontSize:9}}>🔊 音频');
// 语音: keep badge-accent (cyan) as-is for name-based

console.log('changed:', t !== before);
fs.writeFileSync(p, t, 'utf8');
console.log('written');
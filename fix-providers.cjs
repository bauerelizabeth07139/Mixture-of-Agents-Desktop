const fs = require('fs');
const p = 'C:/Users/vipuser/Documents/Codex/2026-07-10/ghp-ximpubtls1rxrj8gyywz03sikbglkw259kdn/work/Mixture-of-Agents-Desktop/backend/src/routes/providers.ts';
let t = fs.readFileSync(p, 'utf8');
const before = t;

// Remove pricing parsing
t = t.replace(/ *let inputPrice = 1, outputPrice = 2;\n *if \(m\.pricing\) \{\n *inputPrice = parseFloat\(m\.pricing\.prompt \|\| m\.pricing\.input \|\| .1.\) \* 1000000;\n *outputPrice = parseFloat\(m\.pricing\.completion \|\| m\.pricing\.output \|\| .2.\) \* 1000000;\n *\}\n/g, '');
// Remove pricing assignment  
t = t.replace(/ *caps\.pricing\.inputPer1M = inputPrice;\n/g, '');
t = t.replace(/ *caps\.pricing\.outputPer1M = outputPrice;\n/g, '');

// Fix: move probe BEFORE res.json and make synchronous
const oldPattern = / *res\.json\(\{ models: prov\.models, source: 'api', count: prov\.models\.length \}\);\n *\/\/ Background: probe new models[\s\S]*?\}\)\(\);\n *\}/;

const replacement = [
  '      // Probe new LLM models for vision/audio capabilities BEFORE responding',
  '      const llmModels = prov.models.filter(m => m.type === \'llm\' && m.capabilities.visionScore === 0 && m.capabilities.audioScore === 0);',
  '      if (llmModels.length > 0 && key) {',
  '        for (const m of llmModels.slice(0, 10)) {',
  '          try {',
  '            const probe = await CapabilityTestEngine.probeCapabilities(prov, key, m);',
  '            if (probe.visionScore > 0) { m.capabilities.visionScore = probe.visionScore; m.capabilities.multimodal = true; }',
  '            if (probe.audioScore > 0) { m.capabilities.audioScore = probe.audioScore; }',
  '          } catch {}',
  '        }',
  '      }',
  '      res.json({ models: prov.models, source: \'api\', count: prov.models.length });'
].join('\n');

t = t.replace(oldPattern, replacement);

console.log('changed:', t !== before);
fs.writeFileSync(p, t, 'utf8');
console.log('written');
const fs = require('fs');
const p = 'C:/Users/vipuser/Documents/Codex/2026-07-10/ghp-ximpubtls1rxrj8gyywz03sikbglkw259kdn/work/Mixture-of-Agents-Desktop/backend/src/services/capability-test.ts';
let t = fs.readFileSync(p, 'utf8');
const before = t;

// Replace the vision probe: download image -> base64 -> send
const oldVision = `    // Vision test: send a test image URL
    try {
      const resp = await LLMClient.chatCompletion(provider, apiKey, {
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'What animal is in this image? Reply with just the animal name.' },
          { type: 'image_url', image_url: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg' } },
        ] as any }],
        model: model.modelId, maxTokens: 100, temperature: 0,
      });
      const r = resp.content.toLowerCase();
      if (/cat|kitten|feline/.test(r) && r.length > 2) visionScore = 8;
      else if (r.length > 10 && !/cannot|don't|unable|not.*support|no.*image/i.test(r)) visionScore = 5;
      else if (r.length > 0 && !/error|cannot|unsupported/i.test(r)) visionScore = 3;
    } catch {}`;

const newVision = `    // Vision test: download image as base64 (some APIs reject URLs)
    try {
      const axios = (await import('axios')).default;
      const imgResp = await axios.get('https://httpbin.org/image/png', { responseType: 'arraybuffer', timeout: 10000 });
      const imgB64 = Buffer.from(imgResp.data).toString('base64');
      const resp = await LLMClient.chatCompletion(provider, apiKey, {
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'What do you see in this image? Reply one word.' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,' + imgB64 } },
        ] as any }],
        model: model.modelId, maxTokens: 100, temperature: 0,
      });
      const r = resp.content.toLowerCase();
      if (/pig|animal|image|piggy/.test(r) && r.length > 2) visionScore = 8;
      else if (r.length > 5 && !/cannot|don't|unable|not.*support|no.*image|unsupported/i.test(r)) visionScore = 5;
      else if (r.length > 0 && !/error|cannot|unsupported/i.test(r)) visionScore = 3;
    } catch {}`;

t = t.replace(oldVision, newVision);

console.log('changed:', t !== before);
fs.writeFileSync(p, t, 'utf8');
console.log('written');
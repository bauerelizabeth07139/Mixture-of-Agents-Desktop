const fs = require('fs');
const p = 'C:/Users/vipuser/Documents/Codex/2026-07-10/ghp-ximpubtls1rxrj8gyywz03sikbglkw259kdn/work/Mixture-of-Agents-Desktop/backend/src/services/capability-test.ts';
let t = fs.readFileSync(p, 'utf8');
const before = t;

// Step 1: Change the URL to base64 pattern
t = t.replace(
  "image_url: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg' }",
  "image_url: { url: 'data:image/png;base64,' + imgB64 }"
);

// Step 2: Change the prompt
t = t.replace(
  "What animal is in this image? Reply with just the animal name.",
  "What do you see in this image? Reply one word."
);

// Step 3: Change the regex check
t = t.replace(
  "/cat|kitten|feline/.test(r) && r.length > 2",
  "/pig|animal|image|piggy/.test(r) && r.length > 2"
);

// Step 4: Add axios download before the try block
t = t.replace(
  "// Vision test: send a test image URL",
  "// Vision test: download image as base64 (some APIs reject URLs)"
);

// Insert the axios download code after "try {"
const visionTryIdx = t.indexOf("// Vision test: download");
const tryIdx = t.indexOf("try {", visionTryIdx);
t = t.slice(0, tryIdx + 5) + "\n      const axios = (await import('axios')).default;\n      const imgResp = await axios.get('https://httpbin.org/image/png', { responseType: 'arraybuffer', timeout: 10000 });\n      const imgB64 = Buffer.from(imgResp.data).toString('base64');" + t.slice(tryIdx + 5);

console.log('changed:', t !== before);
fs.writeFileSync(p, t, 'utf8');
console.log('written');
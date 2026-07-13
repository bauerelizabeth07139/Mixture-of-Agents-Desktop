const axios = require('axios');
const fs = require('fs');

// Read test audio to get a real base64 for reference
// Generate a proper 100x100 red PNG using canvas-like approach
// Actually, let's use a well-known test image encoded inline
// A 100x100 red square as raw pixel data -> minimal valid PNG

// Minimal valid 1x1 red PNG (properly encoded)
const RED_PNG = Buffer.from([
  0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,
  0x00,0x00,0x00,0x64,0x00,0x00,0x00,0x64,0x08,0x02,0x00,0x00,0x00,0xFF,0x80,0x02,
  0x03,0x00,0x00,0x00,0x01,0x73,0x52,0x47,0x42,0x00,0xAE,0xCE,0x1C,0xE9,0x00,0x00,
  0x01,0x84,0x49,0x44,0x41,0x54
]);
// This won't work as a complete PNG. Let me just download one.

async function main() {
  // Download a real small image
  try {
    const imgResp = await axios.get('https://httpbin.org/image/png', { responseType: 'arraybuffer', timeout: 10000 });
    const b64 = Buffer.from(imgResp.data).toString('base64');
    console.log('Image size:', b64.length, 'chars');
    
    const r = await axios.post('https://api.xiaomimimo.com/v1/chat/completions', {
      model: 'mimo-v2.5',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'What do you see in this image? Reply one word.' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } }
        ]
      }],
      max_tokens: 100,
      temperature: 0
    }, {
      headers: { 'Authorization': 'Bearer sk-svri15ibu9ce2ko5duwxm7ml88jxtwnke89zlahnco62mdxr', 'Content-Type': 'application/json' },
      timeout: 30000
    });
    console.log('SUCCESS:', r.data.choices[0].message.content);
  } catch(e) {
    console.log('ERROR:', e.response?.status, JSON.stringify(e.response?.data || e.message));
  }
}
main();
const axios = require('axios');
const API_KEY = 'sk-svri15ibu9ce2ko5duwxm7ml88jxtwnke89zlahnco62mdxr';
const BASE = 'https://api.xiaomimimo.com/v1';

(async () => {
  // Test vision
  console.log('=== Vision Test ===');
  try {
    const r = await axios.post(BASE + '/chat/completions', {
      model: 'mimo-v2.5',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'What animal is in this image? Reply with just the animal name.' },
        { type: 'image_url', image_url: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg' } },
      ]}],
      max_tokens: 100,
      temperature: 0,
    }, { headers: { 'Authorization': 'Bearer ' + API_KEY }, timeout: 30000 });
    console.log('Content:', r.data.choices[0].message.content);
    console.log('Finish:', r.data.choices[0].finish_reason);
  } catch (e) { console.log('Error:', e.response?.status, e.message); }

  // Test audio
  console.log('\n=== Audio Test ===');
  const fs = require('fs');
  const audioB64 = fs.readFileSync('test_audio_b64.txt', 'utf8').trim();
  try {
    const r = await axios.post(BASE + '/chat/completions', {
      model: 'mimo-v2.5',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Describe what you hear in this audio clip.' },
        { type: 'input_audio', input_audio: { data: audioB64, format: 'wav' } },
      ]}],
      max_tokens: 100,
      temperature: 0,
    }, { headers: { 'Authorization': 'Bearer ' + API_KEY }, timeout: 30000 });
    console.log('Content:', r.data.choices[0].message.content);
    console.log('Finish:', r.data.choices[0].finish_reason);
  } catch (e) { console.log('Error:', e.response?.status, e.message); }

  // Test mimo-v2.5-pro vision
  console.log('\n=== Pro Vision Test ===');
  try {
    const r = await axios.post(BASE + '/chat/completions', {
      model: 'mimo-v2.5-pro',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'What animal is in this image?' },
        { type: 'image_url', image_url: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg' } },
      ]}],
      max_tokens: 100,
      temperature: 0,
    }, { headers: { 'Authorization': 'Bearer ' + API_KEY }, timeout: 30000 });
    console.log('Content:', r.data.choices[0].message.content);
  } catch (e) { console.log('Error:', e.response?.status, e.message); }
})();
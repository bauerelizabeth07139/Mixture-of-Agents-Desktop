const axios = require("axios");
const API_KEY = "sk-svri15ibu9ce2ko5duwxm7ml88jxtwnke89zlahnco62mdxr";

async function test() {
  // Simulate what probeCapabilities does for audio
  console.log("=== Simulating audio probe for mimo-v2.5 ===");
  try {
    const resp = await axios.post(
      "https://api.xiaomimimo.com/v1/chat/completions",
      {
        model: "mimo-v2.5",
        messages: [{ role: "user", content: [
          { type: "input_audio", input_audio: { data: "https://example-files.cnbj1.mi-fds.com/example-files/audio/audio_example.wav" } },
          { type: "text", text: "Describe what you hear in this audio." },
        ] }],
        max_tokens: 200, temperature: 0,
      },
      { headers: { Authorization: "Bearer "+API_KEY, "Content-Type": "application/json" }, timeout: 60000 }
    );
    const r = (resp.data.choices?.[0]?.message?.content || "").toLowerCase();
    const usage = resp.data.usage;
    const hasAudioTokens = usage?.prompt_tokens_details?.audio_tokens > 0;
    
    console.log("content:", r.substring(0, 200));
    console.log("audio_tokens:", usage?.prompt_tokens_details?.audio_tokens);
    console.log("hasAudioTokens:", hasAudioTokens);
    
    // Check the logic
    if (hasAudioTokens) {
      console.log("=> audioScore = 7 (via audio_tokens)");
    } else {
      const admitsCantHear = /can.t (actually )?hear|unable to hear|text.based.*can.t|don.t have.*audio/i.test(r);
      const hasAudioContent = /hear|sound|audio|voice|speech|music|weather|morning/i.test(r);
      console.log("admitsCantHear:", admitsCantHear);
      console.log("hasAudioContent:", hasAudioContent);
      console.log("r.length:", r.length);
      if (!admitsCantHear && r.length > 20 && hasAudioContent) {
        console.log("=> audioScore = 6 (via content analysis)");
      } else {
        console.log("=> audioScore = 0 (no audio capability)");
      }
    }
  } catch(e) {
    console.log("Error:", e.response?.status, e.message);
  }
}
test();

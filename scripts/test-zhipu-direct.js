// Direct Zhipu API call to measure latency
require('dotenv').config({ path: '.env.local' });
const key = process.env.ZHIPU_API_KEY;
const model = process.env.ZHIPU_MODEL || 'glm-4.6';

const body = {
  model,
  messages: [
    { role: 'system', content: 'You output JSON only.' },
    { role: 'user', content: 'Output the JSON {"ok": true} and nothing else.' }
  ],
  temperature: 0.1,
  max_tokens: 50,
  response_format: { type: 'json_object' }
};

const start = Date.now();
fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
  body: JSON.stringify(body)
}).then(async r => {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`status=${r.status} elapsed=${elapsed}s`);
  console.log(await r.text());
});

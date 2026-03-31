'use strict';

const OpenAI = require('openai').default;
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function callLLM(config, prompt) {
  const { provider, api_key, base_url, model } = config;

  if (provider === 'openai') {
    const client = new OpenAI({ apiKey: api_key, baseURL: base_url || undefined });
    const response = await client.chat.completions.create({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content;
  }

  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(api_key);
    const geminiModel = genAI.getGenerativeModel({ model: model || 'gemini-pro' });
    const result = await geminiModel.generateContent(prompt);
    return result.response.text();
  }

  if (provider === 'custom') {
    const url = base_url;
    if (!url) throw new Error('base_url is required for custom provider');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${api_key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Custom LLM returned ${response.status}: ${text}`);
    }
    const data = await response.json();
    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }
    const raw = JSON.stringify(data);
    return raw.length > 2000 ? raw.slice(0, 2000) + '…' : raw;
  }

  throw new Error(`Unknown provider: ${provider}`);
}

module.exports = { callLLM };

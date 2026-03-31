'use strict';

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const router = Router();

router.get('/', (req, res) => {
  const configs = getDb().prepare('SELECT id, name, provider, base_url, model, created_at FROM llm_configs ORDER BY created_at DESC').all();
  res.json(configs);
});

router.post('/', (req, res) => {
  const { name, provider, api_key, base_url, model } = req.body;
  if (!name || !provider || !api_key || !model) {
    return res.status(400).json({ error: 'name, provider, api_key, and model are required' });
  }
  if (!['openai', 'gemini', 'custom'].includes(provider)) {
    return res.status(400).json({ error: 'provider must be openai, gemini, or custom' });
  }
  if (provider === 'custom' && !base_url) {
    return res.status(400).json({ error: 'base_url is required for custom provider' });
  }
  const id = uuidv4();
  getDb().prepare(
    'INSERT INTO llm_configs (id, name, provider, api_key, base_url, model) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, provider, api_key, base_url || null, model);
  const config = getDb().prepare('SELECT id, name, provider, base_url, model, created_at FROM llm_configs WHERE id = ?').get(id);
  res.status(201).json(config);
});

router.put('/:id', (req, res) => {
  const { name, provider, api_key, base_url, model } = req.body;
  const existing = getDb().prepare('SELECT * FROM llm_configs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (provider && !['openai', 'gemini', 'custom'].includes(provider)) {
    return res.status(400).json({ error: 'provider must be openai, gemini, or custom' });
  }

  const newProvider = provider || existing.provider;
  const newBaseUrl = base_url !== undefined ? base_url : existing.base_url;
  if (newProvider === 'custom' && !newBaseUrl) {
    return res.status(400).json({ error: 'base_url is required for custom provider' });
  }

  getDb().prepare(`
    UPDATE llm_configs SET
      name = ?, provider = ?, api_key = ?, base_url = ?, model = ?
    WHERE id = ?
  `).run(
    name !== undefined ? name : existing.name,
    newProvider,
    api_key !== undefined ? api_key : existing.api_key,
    newBaseUrl,
    model !== undefined ? model : existing.model,
    req.params.id
  );
  const updated = getDb().prepare('SELECT id, name, provider, base_url, model, created_at FROM llm_configs WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const existing = getDb().prepare('SELECT id FROM llm_configs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  try {
    getDb().prepare('DELETE FROM llm_configs WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(409).json({ error: 'Config is used by one or more jobs' });
  }
});

module.exports = router;

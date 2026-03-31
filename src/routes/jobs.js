'use strict';

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { schedule, unschedule, runJob, validateCron } = require('../scheduler');

const router = Router();

router.get('/', (req, res) => {
  const jobs = getDb().prepare(`
    SELECT j.*, c.name AS config_name, c.provider
    FROM jobs j
    LEFT JOIN llm_configs c ON j.llm_config_id = c.id
    ORDER BY j.created_at DESC
  `).all();
  res.json(jobs);
});

router.post('/', (req, res) => {
  const { name, description, prompt, cron_expression, llm_config_id } = req.body;
  if (!name || !prompt || !cron_expression || !llm_config_id) {
    return res.status(400).json({ error: 'name, prompt, cron_expression, and llm_config_id are required' });
  }

  if (!cron_expression || !validateCron(cron_expression)) {
    return res.status(400).json({ error: 'Invalid cron expression' });
  }

  const config = getDb().prepare('SELECT id FROM llm_configs WHERE id = ?').get(llm_config_id);
  if (!config) return res.status(400).json({ error: 'llm_config_id not found' });

  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO jobs (id, name, description, prompt, cron_expression, llm_config_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, description || null, prompt, cron_expression, llm_config_id);

  const job = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (job.enabled) schedule(job);
  res.status(201).json(job);
});

router.put('/:id', (req, res) => {
  const existing = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, description, prompt, cron_expression, llm_config_id, enabled } = req.body;

  if (cron_expression) {
    if (!validateCron(cron_expression)) {
      return res.status(400).json({ error: 'Invalid cron expression' });
    }
  }

  if (llm_config_id) {
    const config = getDb().prepare('SELECT id FROM llm_configs WHERE id = ?').get(llm_config_id);
    if (!config) return res.status(400).json({ error: 'llm_config_id not found' });
  }

  const now = new Date().toISOString();
  getDb().prepare(`
    UPDATE jobs SET
      name = ?, description = ?, prompt = ?, cron_expression = ?,
      llm_config_id = ?, enabled = ?, updated_at = ?
    WHERE id = ?
  `).run(
    name !== undefined ? name : existing.name,
    description !== undefined ? description : existing.description,
    prompt !== undefined ? prompt : existing.prompt,
    cron_expression || existing.cron_expression,
    llm_config_id || existing.llm_config_id,
    enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
    now,
    req.params.id
  );

  const job = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (job.enabled) {
    schedule(job);
  } else {
    unschedule(job.id);
  }
  res.json(job);
});

router.delete('/:id', (req, res) => {
  const existing = getDb().prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  unschedule(req.params.id);
  getDb().prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

router.post('/:id/run', async (req, res) => {
  const existing = getDb().prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const runId = await runJob(req.params.id);
  const run = getDb().prepare('SELECT * FROM job_runs WHERE id = ?').get(runId);
  res.status(202).json(run);
});

module.exports = router;

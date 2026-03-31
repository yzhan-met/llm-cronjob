'use strict';

const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

router.get('/', (req, res) => {
  const { job_id, limit = 50 } = req.query;
  let query = `
    SELECT r.*, j.name AS job_name
    FROM job_runs r
    JOIN jobs j ON r.job_id = j.id
  `;
  const params = [];
  if (job_id) {
    query += ' WHERE r.job_id = ?';
    params.push(job_id);
  }
  query += ' ORDER BY r.started_at DESC LIMIT ?';
  params.push(Math.min(Number(limit) || 50, 1000));
  const runs = getDb().prepare(query).all(...params);
  res.json(runs);
});

router.get('/:id', (req, res) => {
  const run = getDb().prepare(`
    SELECT r.*, j.name AS job_name
    FROM job_runs r
    JOIN jobs j ON r.job_id = j.id
    WHERE r.id = ?
  `).get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Not found' });
  res.json(run);
});

module.exports = router;

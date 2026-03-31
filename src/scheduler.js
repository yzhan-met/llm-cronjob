'use strict';

const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./db');
const { callLLM } = require('./llm');

const activeTasks = new Map();

function validateCron(expression) {
  return cron.validate(expression);
}

function loadAndScheduleAll() {
  const db = getDb();
  const jobs = db.prepare('SELECT * FROM jobs WHERE enabled = 1').all();
  for (const job of jobs) {
    schedule(job);
  }
}

function schedule(job) {
  if (activeTasks.has(job.id)) {
    activeTasks.get(job.id).stop();
  }

  if (!cron.validate(job.cron_expression)) {
    console.error(`Invalid cron expression for job ${job.id}: ${job.cron_expression}`);
    return;
  }

  const task = cron.schedule(job.cron_expression, () => runJob(job.id), { scheduled: true });
  activeTasks.set(job.id, task);
}

function unschedule(jobId) {
  if (activeTasks.has(jobId)) {
    activeTasks.get(jobId).stop();
    activeTasks.delete(jobId);
  }
}

async function runJob(jobId) {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) return;

  const config = db.prepare('SELECT * FROM llm_configs WHERE id = ?').get(job.llm_config_id);
  if (!config) {
    console.error(`LLM config not found for job ${jobId}`);
    return;
  }

  const runId = uuidv4();
  const startedAt = new Date().toISOString();

  db.prepare(
    'INSERT INTO job_runs (id, job_id, started_at, status) VALUES (?, ?, ?, ?)'
  ).run(runId, jobId, startedAt, 'running');

  try {
    const result = await callLLM(config, job.prompt);
    const completedAt = new Date().toISOString();
    db.prepare(
      'UPDATE job_runs SET completed_at = ?, status = ?, result = ? WHERE id = ?'
    ).run(completedAt, 'success', result, runId);
    console.log(`Job ${job.name} completed successfully`);
  } catch (err) {
    const completedAt = new Date().toISOString();
    db.prepare(
      'UPDATE job_runs SET completed_at = ?, status = ?, error = ? WHERE id = ?'
    ).run(completedAt, 'failed', err.message, runId);
    console.error(`Job ${job.name} failed: ${err.message}`);
  }

  return runId;
}

module.exports = { loadAndScheduleAll, schedule, unschedule, runJob, validateCron };

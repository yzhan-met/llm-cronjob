'use strict';

const express = require('express');
const path = require('path');
const { getDb } = require('./src/db');
const { loadAndScheduleAll } = require('./src/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/configs', require('./src/routes/configs'));
app.use('/api/jobs', require('./src/routes/jobs'));
app.use('/api/runs', require('./src/routes/runs'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

getDb();
loadAndScheduleAll();

const server = app.listen(PORT, () => {
  console.log(`LLM CronJob portal running at http://localhost:${PORT}`);
});

module.exports = { app, server };

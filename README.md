# llm-cronjob

A simple portal to manage LLM cron jobs.

## Features

- **Multiple LLM providers**: OpenAI, Google Gemini, or any custom OpenAI-compatible endpoint
- **Cron job management**: Create, edit, enable/disable, and delete scheduled jobs
- **Manual trigger**: Run any job immediately with "Run Now"
- **Run history**: View past job runs, their status, and the LLM's response
- **Persistent storage**: SQLite via the Node.js built-in `node:sqlite` module (requires Node ≥ 22)

## Quick Start

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Set a custom port with the `PORT` environment variable (default: `3000`).

## Usage

### 1. Add an LLM Config

Go to the **LLM Configs** tab and click **+ New Config**:

| Field | Description |
|---|---|
| Name | A friendly label (e.g. "My GPT-4o") |
| Provider | `openai`, `gemini`, or `custom` |
| API Key | Your API key |
| Base URL | Required only for `custom` provider (OpenAI-compatible endpoint) |
| Model | Model name (e.g. `gpt-4o-mini`, `gemini-pro`) |

### 2. Create a Cron Job

Go to the **Jobs** tab and click **+ New Job**:

| Field | Description |
|---|---|
| Name | Job label |
| Description | Optional notes |
| Prompt | The text prompt sent to the LLM on each run |
| Cron Expression | Standard 5-field cron (e.g. `0 9 * * 1-5` = weekdays at 9 AM) |
| LLM Config | Which config to use |
| Enabled | Toggle on/off |

Use [crontab.guru](https://crontab.guru) to build cron expressions.

### 3. View History

Go to the **Run History** tab to see all past runs with duration, status, and the LLM's response.

## Stack

- **Backend**: Node.js + Express + node-cron + node:sqlite
- **Frontend**: Vanilla HTML/CSS/JavaScript (no framework)
- **LLM SDKs**: `openai`, `@google/generative-ai`, native `fetch` for custom endpoints

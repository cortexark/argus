/**
 * AI Tool Usage Tracker
 *
 * Reads local session/usage data from AI coding tools and aggregates
 * token usage, model breakdowns, cost estimates, and session metadata.
 *
 * Inspired by TermTracker — but implemented as a polling monitor that
 * reads local files/databases rather than intercepting API calls.
 *
 * Supported tools:
 *   - OpenAI Codex CLI: ~/.codex/state_5.sqlite (threads table)
 *   - Claude Code CLI:  ~/.claude/metrics/costs.jsonl
 *   - Cursor:           ~/.cursor/ai-tracking/ai-code-tracking.db (if present)
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import Database from 'better-sqlite3';
import { warn } from '../lib/logger.js';

const HOME = homedir();

// ── Data source paths ──────────────────────────────────────────────

const CODEX_STATE_DB = join(HOME, '.codex', 'state_5.sqlite');
const CLAUDE_COSTS_JSONL = join(HOME, '.claude', 'metrics', 'costs.jsonl');
const CURSOR_TRACKING_DB = join(HOME, '.cursor', 'ai-tracking', 'ai-code-tracking.db');

// ── API pricing (USD per 1M tokens) — used for cost equivalency ───

const MODEL_PRICING = Object.freeze({
  // OpenAI
  'gpt-5.3-codex':  { input: 2.00, output: 8.00 },
  'gpt-5.4-mini':   { input: 0.40, output: 1.60 },
  'gpt-4o':         { input: 2.50, output: 10.00 },
  'gpt-4o-mini':    { input: 0.15, output: 0.60 },
  'gpt-4-turbo':    { input: 10.00, output: 30.00 },
  'o3':             { input: 2.00, output: 8.00 },
  'o3-mini':        { input: 1.10, output: 4.40 },
  'o4-mini':        { input: 1.10, output: 4.40 },
  // Anthropic
  'claude-opus-4':    { input: 15.00, output: 75.00 },
  'claude-sonnet-4':  { input: 3.00, output: 15.00 },
  'claude-haiku-3.5': { input: 0.80, output: 4.00 },
  // Fallback
  '_default':         { input: 3.00, output: 12.00 },
});

/**
 * Get the pricing for a model name (fuzzy match).
 * @param {string} model
 * @returns {{ input: number, output: number }}
 */
function getPricing(model) {
  if (!model) return MODEL_PRICING['_default'];
  const lower = model.toLowerCase();
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (key === '_default') continue;
    if (lower.includes(key.toLowerCase())) return pricing;
  }
  return MODEL_PRICING['_default'];
}

/**
 * Estimate cost from total tokens (assumes ~30% input, ~70% output for coding).
 * @param {number} totalTokens
 * @param {{ input: number, output: number }} pricing - per 1M tokens
 * @returns {number} estimated USD
 */
function estimateCost(totalTokens, pricing) {
  const inputTokens = Math.round(totalTokens * 0.3);
  const outputTokens = totalTokens - inputTokens;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

// ── Codex reader ──────────────────────────────────────────────────

/** @type {Database.Database | null} */
let codexDb = null;

/**
 * Open (or reuse) a read-only connection to the Codex state database.
 * @returns {Database.Database | null}
 */
function openCodexDb() {
  if (!existsSync(CODEX_STATE_DB)) return null;
  if (codexDb) {
    try {
      // Quick liveness check
      codexDb.prepare('SELECT 1').get();
      return codexDb;
    } catch {
      codexDb = null;
    }
  }
  try {
    codexDb = new Database(CODEX_STATE_DB, { readonly: true, fileMustExist: true });
    return codexDb;
  } catch (err) {
    warn(`Cannot open Codex DB: ${err.message}`);
    return null;
  }
}

/**
 * Read Codex thread usage from the local SQLite database.
 * @returns {{ sessions: object[], totals: object } | null}
 */
export function readCodexUsage() {
  const db = openCodexDb();
  if (!db) return null;

  try {
    const sessions = db.prepare(`
      SELECT
        id,
        title,
        model_provider AS modelProvider,
        model,
        tokens_used AS tokensUsed,
        source,
        cwd,
        datetime(created_at / 1000, 'unixepoch') AS createdAt,
        datetime(updated_at / 1000, 'unixepoch') AS updatedAt,
        cli_version AS cliVersion,
        approval_mode AS approvalMode,
        archived
      FROM threads
      WHERE tokens_used > 0
      ORDER BY updated_at DESC
      LIMIT 200
    `).all();

    // Aggregate by model
    const byModel = {};
    let totalTokens = 0;
    let totalCost = 0;

    for (const s of sessions) {
      const model = s.model || 'unknown';
      const pricing = getPricing(model);
      const cost = estimateCost(s.tokensUsed, pricing);

      if (!byModel[model]) {
        byModel[model] = { model, tokens: 0, sessions: 0, estimatedCostUsd: 0 };
      }
      byModel[model] = {
        ...byModel[model],
        tokens: byModel[model].tokens + s.tokensUsed,
        sessions: byModel[model].sessions + 1,
        estimatedCostUsd: byModel[model].estimatedCostUsd + cost,
      };
      totalTokens += s.tokensUsed;
      totalCost += cost;
    }

    return {
      app: 'OpenAI Codex',
      provider: 'openai',
      sessions: sessions.map(s => ({
        ...s,
        estimatedCostUsd: estimateCost(s.tokensUsed, getPricing(s.model)),
      })),
      byModel: Object.values(byModel),
      totalTokens,
      totalSessions: sessions.length,
      estimatedCostUsd: Math.round(totalCost * 100) / 100,
    };
  } catch (err) {
    warn(`Codex usage read error: ${err.message}`);
    return null;
  }
}

// ── Claude Code reader ────────────────────────────────────────────

/** Track last read position to avoid re-reading the entire JSONL file */
let claudeLastSize = 0;
let claudeEntries = [];

/**
 * Read Claude Code cost metrics from the local JSONL file.
 * Incrementally reads new lines since last check.
 * @returns {{ sessions: object[], totals: object } | null}
 */
export function readClaudeUsage() {
  if (!existsSync(CLAUDE_COSTS_JSONL)) return null;

  try {
    const stat = statSync(CLAUDE_COSTS_JSONL);
    const currentSize = stat.size;

    if (currentSize !== claudeLastSize) {
      // Re-read full file (JSONL files are typically small)
      const raw = readFileSync(CLAUDE_COSTS_JSONL, 'utf8');
      const lines = raw.trim().split('\n').filter(Boolean);
      claudeEntries = [];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          claudeEntries = [...claudeEntries, entry];
        } catch {
          // Skip malformed lines
        }
      }
      claudeLastSize = currentSize;
    }

    // Filter to entries with actual usage
    const withUsage = claudeEntries.filter(
      e => (e.input_tokens > 0 || e.output_tokens > 0 || e.estimated_cost_usd > 0)
    );

    // Aggregate by model
    const byModel = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    for (const e of withUsage) {
      const model = e.model || 'unknown';
      if (!byModel[model]) {
        byModel[model] = { model, inputTokens: 0, outputTokens: 0, sessions: 0, estimatedCostUsd: 0 };
      }
      byModel[model] = {
        ...byModel[model],
        inputTokens: byModel[model].inputTokens + (e.input_tokens || 0),
        outputTokens: byModel[model].outputTokens + (e.output_tokens || 0),
        sessions: byModel[model].sessions + 1,
        estimatedCostUsd: byModel[model].estimatedCostUsd + (e.estimated_cost_usd || 0),
      };
      totalInputTokens += e.input_tokens || 0;
      totalOutputTokens += e.output_tokens || 0;
      totalCost += e.estimated_cost_usd || 0;
    }

    return {
      app: 'Claude Code',
      provider: 'anthropic',
      entries: withUsage.slice(-100), // last 100 entries
      byModel: Object.values(byModel),
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalSessions: withUsage.length,
      estimatedCostUsd: Math.round(totalCost * 100) / 100,
    };
  } catch (err) {
    warn(`Claude usage read error: ${err.message}`);
    return null;
  }
}

// ── Cursor reader ─────────────────────────────────────────────────

/** @type {Database.Database | null} */
let cursorDb = null;

/**
 * Read Cursor AI tracking data from the local SQLite database.
 * @returns {{ totals: object } | null}
 */
export function readCursorUsage() {
  if (!existsSync(CURSOR_TRACKING_DB)) return null;

  if (!cursorDb) {
    try {
      cursorDb = new Database(CURSOR_TRACKING_DB, { readonly: true, fileMustExist: true });
    } catch (err) {
      warn(`Cannot open Cursor DB: ${err.message}`);
      return null;
    }
  }

  try {
    // Cursor's schema varies by version — try common table names
    const tables = cursorDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all().map(r => r.name);

    if (tables.length === 0) return null;

    // Try to read whatever tables exist
    let totalCompletions = 0;
    let totalChats = 0;

    for (const table of tables) {
      try {
        const count = cursorDb.prepare(`SELECT COUNT(*) as cnt FROM "${table}"`).get();
        if (table.includes('completion')) totalCompletions += count?.cnt || 0;
        if (table.includes('chat')) totalChats += count?.cnt || 0;
      } catch {
        // Skip inaccessible tables
      }
    }

    return {
      app: 'Cursor',
      provider: 'cursor',
      tables,
      totalCompletions,
      totalChats,
      totalSessions: totalCompletions + totalChats,
    };
  } catch (err) {
    warn(`Cursor usage read error: ${err.message}`);
    return null;
  }
}

// ── Aggregator ────────────────────────────────────────────────────

/**
 * Collect usage data from all available AI tools.
 * Returns a unified snapshot suitable for the dashboard.
 * @returns {{ timestamp: string, tools: object[], summary: object }}
 */
export function collectAllUsage() {
  const timestamp = new Date().toISOString();
  const tools = [];

  const codex = readCodexUsage();
  if (codex) tools.push(codex);

  const claude = readClaudeUsage();
  if (claude) tools.push(claude);

  const cursor = readCursorUsage();
  if (cursor) tools.push(cursor);

  // Build summary
  let totalTokens = 0;
  let totalCost = 0;
  let totalSessions = 0;

  for (const tool of tools) {
    totalTokens += tool.totalTokens || 0;
    totalCost += tool.estimatedCostUsd || 0;
    totalSessions += tool.totalSessions || 0;
  }

  return {
    timestamp,
    tools,
    summary: {
      totalTokens,
      estimatedCostUsd: Math.round(totalCost * 100) / 100,
      totalSessions,
      toolCount: tools.length,
    },
  };
}

/**
 * Clean up open database connections.
 */
export function closeUsageTrackerDbs() {
  if (codexDb) {
    try { codexDb.close(); } catch { /* ignore */ }
    codexDb = null;
  }
  if (cursorDb) {
    try { cursorDb.close(); } catch { /* ignore */ }
    cursorDb = null;
  }
}

export default { collectAllUsage, readCodexUsage, readClaudeUsage, readCursorUsage, closeUsageTrackerDbs };

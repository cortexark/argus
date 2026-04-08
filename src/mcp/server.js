#!/usr/bin/env node

/**
 * Argus MCP Server — Claude Desktop Extension
 *
 * Exposes Argus monitoring data as MCP tools so Claude can answer
 * questions like "what AI agents are running?" or "show file accesses".
 *
 * Transport: STDIO (launched by Claude Desktop via claude_desktop_config.json)
 * Database:  reads the same SQLite DB that Argus writes to (~/.argus/data.db)
 *
 * Most tools are read-only — they query the local database.
 * The kill_ai_process tool can terminate a running AI process.
 * No data leaves the machine.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import { initializeDatabase } from '../db/schema.js';
import { config } from '../lib/config.js';
import {
  getActiveProcesses,
  getRecentAlerts,
  getNetworkEvents,
  getRecentSessions,
  getOpenSessions,
  getDailySummary,
  getInjectionAlerts,
  getRecentUsageSnapshots,
  getApprovalDecisions,
} from '../db/store.js';

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const db = initializeDatabase(config.DB_PATH);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hoursAgoISO(hours) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function formatRows(rows) {
  if (!rows || rows.length === 0) return 'No results found.';
  return JSON.stringify(rows, null, 2);
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function safeTool(fn) {
  return async (args) => {
    try {
      return await fn(args);
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  };
}

// ---------------------------------------------------------------------------
// Read-only annotations shared by all tools
// ---------------------------------------------------------------------------

const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
});

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'argus',
  version: '1.0.0',
});

// -- get_active_ai_processes ------------------------------------------------

server.registerTool(
  'get_active_ai_processes',
  {
    title: 'Active AI Processes',
    description: 'List AI agents and LLM apps detected on this machine in the last N hours. Returns process name, app label, and category for each detected AI application.',
    inputSchema: z.object({
      hours: z.number().min(1).max(168).default(24)
        .describe('How far back to look (hours, max 168 = 7 days)'),
    }),
    annotations: READ_ONLY,
  },
  safeTool(({ hours }) => ({
    content: [{ type: 'text', text: formatRows(getActiveProcesses(db, hoursAgoISO(hours))) }],
  })),
);

// -- get_file_accesses ------------------------------------------------------

server.registerTool(
  'get_file_accesses',
  {
    title: 'Sensitive File Accesses',
    description: 'Show sensitive file accesses by AI agents — credentials (.ssh, .aws, Keychain), browser data (Chrome, Safari passwords), documents, and system files. Returns up to 100 alerts with timestamps, file paths, app names, and severity.',
    inputSchema: z.object({
      hours: z.number().min(1).max(168).default(24)
        .describe('How far back to look (hours)'),
    }),
    annotations: READ_ONLY,
  },
  safeTool(({ hours }) => ({
    content: [{ type: 'text', text: formatRows(getRecentAlerts(db, hoursAgoISO(hours))) }],
  })),
);

// -- get_network_activity ---------------------------------------------------

server.registerTool(
  'get_network_activity',
  {
    title: 'AI Network Activity',
    description: 'Show network connections made by AI agents — remote hosts, ports, protocols, and identified AI services (Anthropic, OpenAI, Google, etc.). Returns up to 200 events with byte counts.',
    inputSchema: z.object({
      hours: z.number().min(1).max(168).default(24)
        .describe('How far back to look (hours)'),
    }),
    annotations: READ_ONLY,
  },
  safeTool(({ hours }) => ({
    content: [{ type: 'text', text: formatRows(getNetworkEvents(db, hoursAgoISO(hours))) }],
  })),
);

// -- get_sessions -----------------------------------------------------------

server.registerTool(
  'get_sessions',
  {
    title: 'AI Session History',
    description: 'Show AI agent session history — when each app started, stopped, and how long it ran. Use active_only=true to see only currently running sessions.',
    inputSchema: z.object({
      active_only: z.boolean().default(false)
        .describe('If true, only show currently running sessions'),
    }),
    annotations: READ_ONLY,
  },
  safeTool(({ active_only }) => ({
    content: [{ type: 'text', text: formatRows(active_only ? getOpenSessions(db) : getRecentSessions(db)) }],
  })),
);

// -- get_daily_summary ------------------------------------------------------

server.registerTool(
  'get_daily_summary',
  {
    title: 'Daily Summary',
    description: 'Get a summary for a specific day — unique AI process count, file access alert count, network event count, top ports used, and AI services contacted.',
    inputSchema: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(todayDateStr())
        .describe('Date in YYYY-MM-DD format (defaults to today)'),
    }),
    annotations: READ_ONLY,
  },
  safeTool(({ date }) => ({
    content: [{ type: 'text', text: JSON.stringify(getDailySummary(db, date), null, 2) }],
  })),
);

// -- get_injection_alerts ---------------------------------------------------

server.registerTool(
  'get_injection_alerts',
  {
    title: 'Prompt Injection Alerts',
    description: 'Show prompt injection attempts detected in files accessed by AI agents. Returns severity, matched patterns, file path, and a snippet of the suspicious content.',
    inputSchema: z.object({
      hours: z.number().min(1).max(168).default(24)
        .describe('How far back to look (hours)'),
    }),
    annotations: READ_ONLY,
  },
  safeTool(({ hours }) => ({
    content: [{ type: 'text', text: formatRows(getInjectionAlerts(db, hoursAgoISO(hours))) }],
  })),
);

// -- get_ai_usage -----------------------------------------------------------

server.registerTool(
  'get_ai_usage',
  {
    title: 'AI Token Usage',
    description: 'Show AI tool token usage and estimated API costs for Claude, GPT, Codex, and other tools. Returns provider, model, token count, estimated cost in USD, and session count.',
    inputSchema: z.object({}),
    annotations: READ_ONLY,
  },
  safeTool(() => ({
    content: [{ type: 'text', text: formatRows(getRecentUsageSnapshots(db)) }],
  })),
);

// -- get_monitoring_status --------------------------------------------------

server.registerTool(
  'get_monitoring_status',
  {
    title: 'Monitoring Status',
    description: 'Check if Argus monitoring is active and get overall stats — today\'s summary, active session count, privacy mode, and database path.',
    inputSchema: z.object({}),
    annotations: READ_ONLY,
  },
  safeTool(() => {
    const today = new Date().toISOString().slice(0, 10);
    const summary = getDailySummary(db, today);
    const activeSessions = getOpenSessions(db);
    const decisions = getApprovalDecisions(db);

    const status = {
      monitoring_active: activeSessions.length > 0,
      today_summary: summary,
      active_sessions: activeSessions.length,
      total_approval_decisions: decisions.size,
      privacy_mode: config.PRIVACY_MODE,
      db_path: config.DB_PATH,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
    };
  }),
);

// -- kill_ai_process --------------------------------------------------------

server.registerTool(
  'kill_ai_process',
  {
    title: 'Kill AI Process',
    description: 'Terminate a running AI agent process by PID. Use get_sessions with active_only=true first to find the PID. Sends SIGTERM for graceful shutdown, or SIGKILL if force=true.',
    inputSchema: z.object({
      pid: z.number().int().positive()
        .describe('Process ID to terminate (from get_sessions)'),
      force: z.boolean().default(false)
        .describe('If true, send SIGKILL instead of SIGTERM'),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  safeTool(({ pid, force }) => {
    const sessions = getOpenSessions(db);
    const match = sessions.find((s) => s.pid === pid);
    if (!match) {
      return {
        content: [{ type: 'text', text: `Refused: PID ${pid} is not a known AI process tracked by Argus. Only monitored AI processes can be killed.` }],
      };
    }

    const signal = force ? 'SIGKILL' : 'SIGTERM';
    try {
      process.kill(pid, signal);
      return {
        content: [{ type: 'text', text: `Sent ${signal} to PID ${pid} (${match.app_label} — ${match.process_name}). Process should terminate shortly.` }],
      };
    } catch (err) {
      if (err.code === 'ESRCH') {
        return {
          content: [{ type: 'text', text: `PID ${pid} (${match.app_label}) is no longer running.` }],
        };
      }
      throw err;
    }
  }),
);

// -- send_notification ------------------------------------------------------

server.registerTool(
  'send_notification',
  {
    title: 'Send Notification',
    description: 'Send a macOS system notification from Argus. Useful for alerting the user about findings or actions taken.',
    inputSchema: z.object({
      title: z.string().max(100)
        .describe('Notification title'),
      message: z.string().max(500)
        .describe('Notification body text'),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  safeTool(({ title, message }) => {
    execFileSync('osascript', [
      '-e',
      `display notification "${message}" with title "Argus — ${title}"`,
    ]);
    return {
      content: [{ type: 'text', text: `Notification sent: "${title}" — ${message}` }],
    };
  }),
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);

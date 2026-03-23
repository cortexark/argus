/**
 * Process scanner — finds AI agent/LLM processes running on the system.
 * Uses ps-list to enumerate processes, then matches against AI_APPS registry
 * and AI_KEYWORDS for runtime processes (node, python).
 * Runtime processes (node/python) are further enriched via the 6-signal
 * confidence scorer from process-classifier.js.
 */

import psList from 'ps-list';
import { AI_APPS } from '../ai-apps.js';
import { config } from '../lib/config.js';
import { classifyProcess as classifyProcessSignals, VERDICT } from './process-classifier.js';
import { getProcessAncestry, formatAncestryChain } from '../lib/process-ancestry.js';

/**
 * Classify a single process object.
 * Pure function — no external I/O.
 * @param {{ pid: number, name: string, cmd?: string }} proc
 * @returns {{ pid: number, name: string, appLabel: string, category: string, cmd: string } | null}
 */
// Runtime process names that require AI keyword confirmation in cmd
const RUNTIME_NAMES = new Set(['node', 'python', 'python3']);

export function classifyProcess(proc) {
  const { pid, name, cmd = '' } = proc;

  const nameLower = name.toLowerCase();

  // Runtime processes (node/python) must match an AI keyword in cmd
  if (RUNTIME_NAMES.has(nameLower)) {
    if (!cmd) return null;
    const cmdLower = cmd.toLowerCase();
    const matched = config.AI_KEYWORDS.some(kw => cmdLower.includes(kw));
    if (!matched) return null;

    const info = AI_APPS[name] || AI_APPS[nameLower];
    return {
      pid,
      name,
      appLabel: info ? info.name : `${name} (AI agent)`,
      category: info ? info.category : 'Runtime',
      cmd,
    };
  }

  // Direct name match in AI_APPS registry for non-runtime processes
  if (AI_APPS[name]) {
    const info = AI_APPS[name];
    return {
      pid,
      name,
      appLabel: info.name,
      category: info.category,
      cmd,
    };
  }

  return null;
}

/**
 * Scan all running processes and return those that appear to be AI apps.
 * Runtime processes (node/python) are enriched with signal-based scoring.
 * @returns {Promise<Array<{pid, name, appLabel, category, cmd, score?, verdict?, signals?}>>}
 */
export async function scanProcesses() {
  const processes = await psList();
  const results = [];

  for (const proc of processes) {
    const classified = classifyProcess(proc);
    if (classified === null) continue;

    // Resolve process ancestry chain
    let ancestry = [];
    let ancestryChain = '';
    try {
      ancestry = await getProcessAncestry(proc.pid);
      ancestryChain = formatAncestryChain(ancestry);
    } catch {
      // Ancestry lookup failed — continue without it
    }

    // Enrich runtime processes with the 6-signal classifier for higher fidelity
    if (RUNTIME_NAMES.has(proc.name.toLowerCase())) {
      try {
        const enriched = await classifyProcessSignals(proc.pid, proc.name, proc.cmd || '');
        // Only include if the scorer also thinks it's AI, or if basic matching already confirmed it
        if (enriched.verdict === VERDICT.NOT_AI) {
          // Skip processes the scorer considers definitely not AI
          // But keep CONFIRMED/LIKELY matches from name-based detection
          results.push({ ...classified, score: enriched.score, verdict: enriched.verdict, signals: enriched.signals, ancestry, ancestryChain });
        } else {
          results.push({ ...classified, score: enriched.score, verdict: enriched.verdict, signals: enriched.signals, ancestry, ancestryChain });
        }
      } catch {
        // Classifier failed — fall back to basic result
        results.push({ ...classified, ancestry, ancestryChain });
      }
    } else {
      results.push({ ...classified, ancestry, ancestryChain });
    }
  }

  return results;
}

export default { scanProcesses, classifyProcess };

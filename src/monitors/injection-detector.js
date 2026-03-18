/**
 * Prompt injection detection module for Argus.
 * Scans file content for adversarial prompt injection patterns before an AI
 * app acts on them.
 *
 * All public functions are pure (scanContent) or handle I/O errors gracefully
 * (scanFile). Inputs are never mutated.
 */

import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max file size to attempt scanning (512 KB). Files larger are skipped. */
export const MAX_SCAN_SIZE_BYTES = 512 * 1024;

/** We only read the first 50 KB of text for scanning. */
const SCAN_READ_BYTES = 50 * 1024;

/** Binary file extensions that are always skipped. */
const BINARY_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.ico', '.svg',
  '.mp4', '.mp3', '.wav', '.avi', '.mov', '.mkv',
  '.zip', '.gz', '.tar', '.bz2', '.xz', '.rar', '.7z',
  '.db', '.sqlite', '.sqlite3',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.exe', '.dll', '.so', '.dylib',
]);

// ---------------------------------------------------------------------------
// Detection patterns
// ---------------------------------------------------------------------------

/** Layer 1 — Direct instruction override patterns → CRITICAL */
const OVERRIDE_PATTERNS = [
  { name: 'ignore_previous_instructions',    re: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i },
  { name: 'disregard_system_prompt',         re: /disregard\s+(your\s+)?(previous|prior|system)\s+(prompt|instructions?)/i },
  { name: 'forget_everything',               re: /forget\s+(everything|all)\s+(you\s+)?(know|were\s+told)/i },
  { name: 'you_are_now_override',            re: /you\s+are\s+now\s+(a\s+)?(?!claude|an?\s+AI)/i },
  { name: 'act_as_override',                 re: /act\s+as\s+(if\s+you\s+are\s+)?(?!an?\s+AI|claude)/i },
  { name: 'new_instructions',                re: /new\s+instructions?:/i },
  { name: 'system_prompt_marker',            re: /system\s+prompt:/i },
  { name: 'SYSTEM_bracket',                  re: /\[SYSTEM\]/i },
  { name: 'INST_bracket',                    re: /\[INST\]/i },
  { name: 'system_pipe_token',               re: /<\|system\|>/i },
  { name: 'markdown_instruction_header',     re: /###\s*instruction/i },
];

/** Layer 2 — Jailbreak / persona override patterns → HIGH */
const JAILBREAK_PATTERNS = [
  { name: 'DAN_mode',              re: /DAN\s*mode/i },
  { name: 'jailbreak',             re: /jailbreak/i },
  { name: 'do_anything_now',       re: /do\s+anything\s+now/i },
  { name: 'developer_mode',        re: /developer\s+mode\s+enabled/i },
  { name: 'unrestricted_mode',     re: /unrestricted\s+mode/i },
  { name: 'pretend_no_restrict',   re: /pretend\s+(you\s+have\s+no\s+restrictions|you\s+are\s+free)/i },
];

/** Layer 3 — Data exfiltration commands → CRITICAL */
const EXFIL_PATTERNS = [
  { name: 'send_contents_to_url',  re: /send\s+(the\s+)?(contents?|data|files?)\s+to\s+https?:\/\//i },
  { name: 'upload_files_to',       re: /upload\s+(all\s+)?(files?|data|contents?)\s+to/i },
  { name: 'curl_pipe_bash',        re: /curl\s+.+\|\s*bash/i },
  { name: 'wget_pipe_sh',          re: /wget\s+.+\|\s*sh/i },
  { name: 'base64_pipe_bash',      re: /base64\s+.+\|\s*bash/i },
  { name: 'POST_credentials',      re: /POST\s+(all\s+)?(files?|credentials?|passwords?)/i },
];

/** Layer 4 — Zero-width / hidden text characters */
const HIDDEN_TEXT_CHARS = [
  '\u200B', // zero-width space
  '\u200C', // zero-width non-joiner
  '\u200D', // zero-width joiner
  '\uFEFF', // zero-width no-break space (BOM)
  '\u2060', // word joiner
];

/** Structural anomaly trigger: data file extensions */
const DATA_EXTENSIONS = new Set(['.json', '.csv', '.yaml', '.yml', '.env', '.toml', '.ini', '.conf']);

/** Imperative-sentence markers indicating instruction injection in data files */
const STRUCTURAL_ANOMALY_PATTERNS = [
  /^#\s+[Ii]nstructions?\s*:/m,
  /^#{1,3}\s+[Ii]nstructions?\s*[:.]?/m,
  /\bsend\s+all\b/i,
  /\bexecute\s+the\s+following\b/i,
  /\bdo\s+not\s+reveal\b/i,
  /\bignore\s+the\s+above\b/i,
];

// ---------------------------------------------------------------------------
// Layer helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Run a set of named regex patterns against content.
 * Returns matched pattern names and their snippets.
 */
function matchPatterns(content, patterns) {
  const names = [];
  const snippets = [];
  for (const { name, re } of patterns) {
    const match = re.exec(content);
    if (match) {
      names.push(name);
      snippets.push(sanitiseSnippet(match[0], 100));
    }
  }
  return { names, snippets };
}

/**
 * Check whether content contains hidden zero-width characters.
 */
function detectHiddenText(content) {
  return HIDDEN_TEXT_CHARS.some(ch => content.includes(ch));
}

/**
 * Check for structural anomalies in data files.
 */
function detectStructuralAnomaly(content, filePath) {
  const ext = extname(filePath).toLowerCase();
  const isDataFile = DATA_EXTENSIONS.has(ext)
    || filePath.endsWith('.env')
    || filePath.includes('config.json')
    || filePath.includes('config.yaml');

  if (!isDataFile) return false;

  return STRUCTURAL_ANOMALY_PATTERNS.some(re => re.test(content));
}

// ---------------------------------------------------------------------------
// Severity ranking helper
// ---------------------------------------------------------------------------

const SEVERITY_RANK = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0, NONE: -1 };

function higherSeverity(a, b) {
  return (SEVERITY_RANK[a] ?? -1) >= (SEVERITY_RANK[b] ?? -1) ? a : b;
}

// ---------------------------------------------------------------------------
// ANSI escape code regex (declared once)
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

// ---------------------------------------------------------------------------
// Exported pure function: sanitiseSnippet
// ---------------------------------------------------------------------------

/**
 * Sanitise a snippet for safe display in notifications.
 * Strips ANSI codes, replaces zero-width chars with [ZWC], limits length.
 *
 * @param {string} text
 * @param {number} [maxLen=100]
 * @returns {string}
 */
export function sanitiseSnippet(text, maxLen = 100) {
  if (typeof text !== 'string') return '';

  let result = text.replace(ANSI_RE, '');

  for (const ch of HIDDEN_TEXT_CHARS) {
    result = result.split(ch).join('[ZWC]');
  }

  if (result.length > maxLen) {
    result = result.slice(0, maxLen);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Exported pure function: scanContent
// ---------------------------------------------------------------------------

/**
 * Scan file content for prompt injection attempts.
 * Pure function — no I/O, no side effects, inputs not mutated.
 *
 * @param {string} content  - file content (string)
 * @param {string} filePath - path hint for structural analysis
 * @returns {InjectionResult}
 */
export function scanContent(content, filePath) {
  if (typeof content !== 'string') {
    return { detected: false, severity: 'NONE', patterns: [], snippets: [], layer: 'none' };
  }

  const sample = content.length > SCAN_READ_BYTES
    ? content.slice(0, SCAN_READ_BYTES)
    : content;

  const allPatterns = [];
  const allSnippets = [];
  let severity = 'NONE';
  let layer = 'none';

  // Layer 1: Override patterns → CRITICAL
  const layer1 = matchPatterns(sample, OVERRIDE_PATTERNS);
  if (layer1.names.length > 0) {
    allPatterns.push(...layer1.names);
    allSnippets.push(...layer1.snippets);
    severity = higherSeverity(severity, 'CRITICAL');
    layer = 'layer1';
  }

  // Layer 3: Exfiltration patterns → CRITICAL (checked early so CRITICAL wins)
  const layer3 = matchPatterns(sample, EXFIL_PATTERNS);
  if (layer3.names.length > 0) {
    allPatterns.push(...layer3.names);
    allSnippets.push(...layer3.snippets);
    severity = higherSeverity(severity, 'CRITICAL');
    if (layer === 'none') layer = 'layer3';
  }

  // Layer 2: Jailbreak patterns → HIGH
  const layer2 = matchPatterns(sample, JAILBREAK_PATTERNS);
  if (layer2.names.length > 0) {
    allPatterns.push(...layer2.names);
    allSnippets.push(...layer2.snippets);
    severity = higherSeverity(severity, 'HIGH');
    if (layer === 'none') layer = 'layer2';
  }

  // Layer 4: Hidden text → HIGH
  if (detectHiddenText(sample)) {
    allPatterns.push('hidden_text_characters');
    const idx = HIDDEN_TEXT_CHARS.map(ch => sample.indexOf(ch)).find(i => i >= 0) ?? 0;
    const ctxStart = Math.max(0, idx - 20);
    allSnippets.push(sanitiseSnippet(sample.slice(ctxStart, idx + 40), 100));
    severity = higherSeverity(severity, 'HIGH');
    if (layer === 'none') layer = 'layer4';
  }

  // Layer 5: Structural anomaly → MEDIUM
  if (detectStructuralAnomaly(sample, filePath)) {
    allPatterns.push('structural_anomaly');
    allSnippets.push(sanitiseSnippet(sample.slice(0, 100), 100));
    severity = higherSeverity(severity, 'MEDIUM');
    if (layer === 'none') layer = 'layer5';
  }

  const detected = allPatterns.length > 0;
  const dedupedSnippets = [...new Set(allSnippets)].map(s => sanitiseSnippet(s, 100));

  return {
    detected,
    severity: detected ? severity : 'NONE',
    patterns: [...new Set(allPatterns)],
    snippets: dedupedSnippets,
    layer: detected ? layer : 'none',
  };
}

// ---------------------------------------------------------------------------
// Exported async function: scanFile
// ---------------------------------------------------------------------------

/**
 * Read a file and scan it for prompt injection.
 * Skips binary files, large files, and binary-extension files.
 *
 * @param {string} filePath
 * @returns {Promise<InjectionResult>}
 */
export async function scanFile(filePath) {
  const SAFE = { detected: false, severity: 'NONE', patterns: [], snippets: [], layer: 'skipped' };

  const ext = extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return { ...SAFE };
  }

  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch {
    return { ...SAFE, layer: 'none' };
  }

  if (fileStats.size > MAX_SCAN_SIZE_BYTES) {
    return { ...SAFE };
  }

  let buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    return { ...SAFE, layer: 'none' };
  }

  // Check for binary content via null bytes in first 512 bytes
  const probe = buffer.slice(0, 512);
  for (let i = 0; i < probe.length; i++) {
    if (probe[i] === 0) {
      return { ...SAFE };
    }
  }

  const content = buffer.toString('utf8', 0, Math.min(buffer.length, SCAN_READ_BYTES));
  return scanContent(content, filePath);
}

export default { scanContent, scanFile, sanitiseSnippet, MAX_SCAN_SIZE_BYTES };

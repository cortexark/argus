/**
 * CI/CD security check command.
 * Scans a project directory for AI agent security risks.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Patterns that indicate hardcoded API keys.
 * Each entry has a regex and a label describing the key type.
 */
const API_KEY_PATTERNS = [
  { regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g, label: 'Anthropic API key' },
  { regex: /sk-proj-[a-zA-Z0-9_-]{20,}/g, label: 'OpenAI project API key' },
  { regex: /sk-or-[a-zA-Z0-9_-]{20,}/g, label: 'OpenRouter API key' },
  { regex: /AKIA[A-Z0-9]{16}/g, label: 'AWS access key' },
  { regex: /ghp_[a-zA-Z0-9]{36,}/g, label: 'GitHub personal access token' },
  { regex: /ghu_[a-zA-Z0-9]{36,}/g, label: 'GitHub user token' },
];

/**
 * Suspicious npm lifecycle scripts that may indicate supply-chain attacks.
 */
const SUSPICIOUS_SCRIPTS = ['postinstall', 'preinstall', 'install', 'preuninstall', 'postuninstall'];

/**
 * MCP config file paths to check for (relative to project root).
 */
const MCP_CONFIG_FILES = [
  'claude_desktop_config.json',
  '.cursor/mcp.json',
  '.claude/mcp.json',
];

/**
 * File extensions to scan for API keys.
 */
const SCANNABLE_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs',
  '.java', '.sh', '.bash', '.zsh', '.yml', '.yaml', '.toml',
  '.json', '.env', '.cfg', '.conf', '.ini', '.properties',
]);

/**
 * Walk a directory recursively, yielding file paths.
 * Skips node_modules, .git, and other common non-source directories.
 * @param {string} dir
 * @param {number} [depth=0]
 * @param {number} [maxDepth=5]
 * @returns {string[]}
 */
function walkDir(dir, depth = 0, maxDepth = 5) {
  if (depth > maxDepth) return [];

  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__']);
  const files = [];

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) {
        files.push(...walkDir(fullPath, depth + 1, maxDepth));
      }
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Check package.json for suspicious lifecycle scripts.
 * @param {string} projectDir
 * @returns {object[]}
 */
function checkPackageScripts(projectDir) {
  const findings = [];
  const pkgPath = join(projectDir, 'package.json');

  if (!existsSync(pkgPath)) return findings;

  try {
    const raw = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    const scripts = pkg.scripts || {};

    for (const scriptName of SUSPICIOUS_SCRIPTS) {
      if (scripts[scriptName]) {
        findings.push({
          type: 'suspicious_script',
          severity: 'high',
          file: 'package.json',
          detail: `Suspicious lifecycle script "${scriptName}": ${scripts[scriptName]}`,
        });
      }
    }
  } catch {
    // Malformed package.json is itself a finding
    findings.push({
      type: 'parse_error',
      severity: 'medium',
      file: 'package.json',
      detail: 'Could not parse package.json',
    });
  }

  return findings;
}

/**
 * Scan files for hardcoded API keys.
 * @param {string} projectDir
 * @returns {object[]}
 */
function checkHardcodedKeys(projectDir) {
  const findings = [];
  const files = walkDir(projectDir);

  for (const filePath of files) {
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    if (!SCANNABLE_EXTENSIONS.has(ext)) continue;

    // Skip large files (> 1MB)
    try {
      const stat = statSync(filePath);
      if (stat.size > 1_048_576) continue;
    } catch {
      continue;
    }

    let content;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    for (const { regex, label } of API_KEY_PATTERNS) {
      // Reset regex state for each file
      regex.lastIndex = 0;
      const match = regex.exec(content);
      if (match) {
        const relPath = relative(projectDir, filePath);
        findings.push({
          type: 'hardcoded_key',
          severity: 'critical',
          file: relPath,
          detail: `Found ${label} pattern in file`,
        });
      }
    }
  }

  return findings;
}

/**
 * Check if .env files exist and whether they are listed in .gitignore.
 * @param {string} projectDir
 * @returns {object[]}
 */
function checkEnvFiles(projectDir) {
  const findings = [];
  const gitignorePath = join(projectDir, '.gitignore');

  let gitignoreContent = '';
  if (existsSync(gitignorePath)) {
    try {
      gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    } catch {
      // proceed with empty
    }
  }

  const gitignoreLines = gitignoreContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  const envPatterns = ['.env', '.env.local', '.env.production', '.env.development'];

  for (const envFile of envPatterns) {
    if (existsSync(join(projectDir, envFile))) {
      const isIgnored = gitignoreLines.some(
        (line) => line === envFile || line === '.env*' || line === '.env.*' || line === '*.env'
      );

      if (!isIgnored) {
        findings.push({
          type: 'env_not_gitignored',
          severity: 'high',
          file: envFile,
          detail: `${envFile} exists but is not in .gitignore`,
        });
      }
    }
  }

  return findings;
}

/**
 * Check for MCP (Model Context Protocol) config files.
 * @param {string} projectDir
 * @returns {object[]}
 */
function checkMCPConfigs(projectDir) {
  const findings = [];

  for (const configFile of MCP_CONFIG_FILES) {
    const fullPath = join(projectDir, configFile);
    if (existsSync(fullPath)) {
      findings.push({
        type: 'mcp_config',
        severity: 'medium',
        file: configFile,
        detail: `MCP config file found: ${configFile} — review for sensitive tool access`,
      });
    }
  }

  return findings;
}

/**
 * Calculate a risk score from findings.
 * @param {object[]} findings
 * @returns {number}
 */
function calculateRiskScore(findings) {
  const weights = { critical: 10, high: 5, medium: 2, low: 1 };
  let score = 0;

  for (const finding of findings) {
    score += weights[finding.severity] || 1;
  }

  return score;
}

/**
 * Generate a human-readable summary from findings.
 * @param {object[]} findings
 * @param {number} riskScore
 * @returns {string}
 */
function generateSummary(findings, riskScore) {
  if (findings.length === 0) {
    return 'No security risks detected. Project is clean.';
  }

  const counts = {};
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
  }

  const parts = [];
  if (counts.critical) parts.push(`${counts.critical} critical`);
  if (counts.high) parts.push(`${counts.high} high`);
  if (counts.medium) parts.push(`${counts.medium} medium`);
  if (counts.low) parts.push(`${counts.low} low`);

  return `Found ${findings.length} issue(s) (${parts.join(', ')}). Risk score: ${riskScore}.`;
}

/**
 * Run a full CI security check on a project directory.
 * @param {string} projectDir — absolute path to the project root
 * @returns {{ findings: object[], riskScore: number, summary: string }}
 */
export function runCICheck(projectDir) {
  if (!projectDir || typeof projectDir !== 'string') {
    return {
      findings: [{ type: 'error', severity: 'critical', file: '', detail: 'Invalid project directory' }],
      riskScore: 10,
      summary: 'Error: Invalid project directory provided.',
    };
  }

  if (!existsSync(projectDir)) {
    return {
      findings: [{ type: 'error', severity: 'critical', file: '', detail: 'Project directory does not exist' }],
      riskScore: 10,
      summary: 'Error: Project directory does not exist.',
    };
  }

  const findings = [
    ...checkPackageScripts(projectDir),
    ...checkHardcodedKeys(projectDir),
    ...checkEnvFiles(projectDir),
    ...checkMCPConfigs(projectDir),
  ];

  const riskScore = calculateRiskScore(findings);
  const summary = generateSummary(findings, riskScore);

  return { findings, riskScore, summary };
}

export default { runCICheck };

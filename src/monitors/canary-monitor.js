/**
 * Canary/Honeypot File Monitor
 *
 * Creates fake credential files that should NEVER be read by legitimate tools.
 * Any access to these canary files is an immediate high-severity alert.
 *
 * Canary files contain clearly fake but realistic-looking content.
 * They are placed in paths that AI agents commonly scan.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

const HOME = homedir();

/**
 * Default canary file definitions.
 * Each has a path, fake content, and description.
 */
export const CANARY_FILES = Object.freeze([
  {
    path: join(HOME, '.argus', 'canary', '.env.production'),
    content: () => `# ARGUS CANARY — This file is a honeypot. Any access triggers an alert.
DATABASE_URL=postgres://admin:${randomBytes(12).toString('hex')}@canary-db.internal:5432/prod
STRIPE_SECRET_KEY=sk_live_argus_canary_${randomBytes(16).toString('hex')}
AWS_SECRET_ACCESS_KEY=${randomBytes(20).toString('base64')}
JWT_SECRET=${randomBytes(32).toString('hex')}
`,
    description: 'Fake production environment file with realistic-looking secrets',
  },
  {
    path: join(HOME, '.argus', 'canary', 'id_rsa'),
    content: () => `-----BEGIN OPENSSH PRIVATE KEY-----
ARGUS-CANARY-FILE-DO-NOT-USE-${randomBytes(24).toString('base64')}
This is a honeypot SSH key placed by Argus AI Monitor.
Any application reading this file is scanning credential directories.
${randomBytes(48).toString('base64')}
-----END OPENSSH PRIVATE KEY-----
`,
    description: 'Fake SSH private key in canary directory',
  },
  {
    path: join(HOME, '.argus', 'canary', 'credentials.json'),
    content: () => JSON.stringify({
      _argus_canary: true,
      _warning: 'This is a honeypot file. Any access triggers a security alert.',
      aws_access_key_id: `AKIA${randomBytes(8).toString('hex').toUpperCase()}`,
      aws_secret_access_key: randomBytes(30).toString('base64'),
      gcp_service_account: `canary-${randomBytes(4).toString('hex')}@project.iam.gserviceaccount.com`,
      api_token: `argus_canary_${randomBytes(16).toString('hex')}`,
    }, null, 2),
    description: 'Fake cloud credentials JSON',
  },
]);

/**
 * Deploy canary files to the filesystem.
 * Creates them if they don't exist. Idempotent.
 * @returns {string[]} paths of deployed canary files
 */
export function deployCanaryFiles() {
  const deployed = [];

  for (const canary of CANARY_FILES) {
    try {
      const dir = join(canary.path, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
      }

      if (!existsSync(canary.path)) {
        const content = typeof canary.content === 'function' ? canary.content() : canary.content;
        writeFileSync(canary.path, content, { mode: 0o600 });
        deployed.push(canary.path);
      }
    } catch {
      // Non-fatal — canary deployment is best-effort
    }
  }

  return deployed;
}

/**
 * Check if a file path is a known canary file.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isCanaryFile(filePath) {
  if (!filePath) return false;
  const canaryDir = join(HOME, '.argus', 'canary');
  return filePath.startsWith(canaryDir);
}

/**
 * Get all canary file paths for monitoring.
 * @returns {string[]}
 */
export function getCanaryPaths() {
  return CANARY_FILES.map(c => c.path);
}

export default { deployCanaryFiles, isCanaryFile, getCanaryPaths, CANARY_FILES };

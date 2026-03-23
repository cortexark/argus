/**
 * Platform detection and OS-specific paths.
 * Centralizes all platform differences so monitors stay cross-platform.
 */

import { platform, homedir } from 'node:os';
import { existsSync } from 'node:fs';

export const IS_MAC = platform() === 'darwin';
export const IS_LINUX = platform() === 'linux';
export const HOME = homedir();

/**
 * Resolve lsof path — differs between macOS and Linux.
 * Falls back to 'lsof' in PATH if neither standard path exists.
 */
function resolveLsofPath() {
  if (IS_MAC && existsSync('/usr/sbin/lsof')) return '/usr/sbin/lsof';
  if (IS_LINUX && existsSync('/usr/bin/lsof')) return '/usr/bin/lsof';
  return 'lsof'; // fallback to PATH
}

export const LSOF_PATH = resolveLsofPath();

/**
 * ss binary path (Linux iproute2 tool for socket statistics).
 * On Linux this replaces lsof for network monitoring — faster, no root needed.
 * null on macOS.
 */
export const SS_PATH = IS_LINUX
  ? (existsSync('/usr/bin/ss') ? '/usr/bin/ss' : 'ss')
  : null;

/**
 * OS-specific sensitive paths.
 * Merged with the base paths from ai-apps.js at runtime.
 */
export const PLATFORM_SENSITIVE_PATHS = IS_LINUX
  ? {
      credentials: [
        '.ssh', '.aws', '.gnupg', '.netrc',
        '.local/share/keyrings',    // GNOME keyring
        '.password-store',          // pass manager
        '.config/gcloud',           // Google Cloud
        '.azure',                   // Azure CLI
        '.kube',                    // Kubernetes
      ],
      browserData: [
        '.config/google-chrome',
        '.config/chromium',
        '.mozilla/firefox',
        '.config/BraveSoftware',
        '.config/microsoft-edge',
        '.config/vivaldi',
      ],
      documents: [
        `${HOME}/Documents`,
        `${HOME}/Downloads`,
        `${HOME}/Desktop`,
      ],
      system: [
        '/etc/passwd', '/etc/shadow', '/etc/hosts',
        '.env', '.env.local', '.env.production',
      ],
    }
  : {
      // macOS paths (supplement ai-apps.js defaults)
      credentials: [
        '.ssh', '.aws', '.gnupg', '.netrc',
        'Library/Keychains',
        'Library/Application Support/1Password',
        'Library/Application Support/Bitwarden',
        '.kube',
        '.azure',
      ],
      browserData: [
        'Library/Application Support/Google/Chrome',
        'Library/Application Support/BraveSoftware/Brave-Browser',
        'Library/Application Support/Firefox',
        'Library/Safari',
        'Library/Application Support/Microsoft Edge',
        'Library/Application Support/Arc',
      ],
      documents: [
        `${HOME}/Documents`,
        `${HOME}/Downloads`,
        `${HOME}/Desktop`,
      ],
      system: [
        '/etc/passwd', '/etc/hosts',
        '.env', '.env.local', '.env.production',
      ],
    };

/**
 * Cloud sync directory paths by provider.
 * Used to detect when AI agents access cloud-synced folders,
 * which means data may silently leave the machine.
 */
export const CLOUD_SYNC_PATHS = IS_MAC
  ? [
      { path: `${HOME}/Library/Mobile Documents/com~apple~CloudDocs`, provider: 'iCloud' },
      { path: `${HOME}/Library/Mobile Documents`, provider: 'iCloud' },
      { path: `${HOME}/Library/CloudStorage`, provider: 'CloudStorage' },
      { path: `${HOME}/Dropbox`, provider: 'Dropbox' },
      { path: `${HOME}/Google Drive`, provider: 'Google Drive' },
      { path: `${HOME}/OneDrive`, provider: 'OneDrive' },
    ]
  : IS_LINUX
    ? [
        { path: `${HOME}/Dropbox`, provider: 'Dropbox' },
        { path: `${HOME}/Google Drive`, provider: 'Google Drive' },
        { path: `${HOME}/OneDrive`, provider: 'OneDrive' },
        { path: `${HOME}/.local/share/dropbox`, provider: 'Dropbox' },
      ]
    : [];

/**
 * Platform label for display/reporting.
 */
export const PLATFORM_LABEL = IS_MAC ? 'macOS' : IS_LINUX ? 'Linux' : 'Unknown';

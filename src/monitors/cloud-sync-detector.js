/**
 * Cloud sync path detector.
 * Detects when file paths fall inside cloud-synced directories
 * (iCloud, Dropbox, Google Drive, OneDrive, etc.), which means
 * data accessed by AI agents may silently leave the machine.
 */

import { CLOUD_SYNC_PATHS } from '../lib/platform.js';

/**
 * Check whether a file path is inside a cloud-synced directory.
 * @param {string} filePath - Absolute path to check
 * @returns {{ synced: boolean, provider: string | null }}
 */
export function isCloudSyncedPath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { synced: false, provider: null };
  }

  for (const { path, provider } of CLOUD_SYNC_PATHS) {
    if (filePath === path || filePath.startsWith(path + '/')) {
      return { synced: true, provider };
    }
  }

  return { synced: false, provider: null };
}

export default { isCloudSyncedPath };

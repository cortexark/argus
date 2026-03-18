/**
 * Electron preload script.
 * Runs in an isolated context before the renderer page loads.
 * Keeps the renderer sandboxed — no direct Node.js access.
 */

import pkg from 'electron';
const { contextBridge, ipcRenderer } = pkg;

contextBridge.exposeInMainWorld('argusApp', {
  /** Platform string for platform-specific UI tweaks */
  platform: process.platform,

  /** Open a URL in the default browser */
  openExternal: (url) => ipcRenderer.send('open-external', url),
});

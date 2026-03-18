/**
 * Parsers for lsof -F flag (machine-readable) output.
 *
 * The -F format produces one field per line, where the first character
 * is the field type:
 *   p = pid
 *   c = command name
 *   f = file descriptor
 *   t = type
 *   n = name (file path or network address)
 *   s = connection state (network, e.g. ESTABLISHED)
 *   t = file/socket type (e.g. IPv4, IPv6)
 *
 * Each new record starts with a 'p' line.
 */

/**
 * Parse output of `lsof -F pcftn -c <name>` into file access records.
 * @param {string} lsofString - Raw lsof -F output
 * @returns {Array<{pid: number, command: string, fd: string, type: string, filePath: string}>}
 */
export function parseFileOutput(lsofString) {
  if (!lsofString || typeof lsofString !== 'string') return [];

  const lines = lsofString.split('\n');
  const results = [];

  let currentPid = null;
  let currentCommand = null;
  let currentFd = null;
  let currentType = null;

  for (const line of lines) {
    if (!line) continue;
    const code = line[0];
    const value = line.slice(1);

    switch (code) {
      case 'p': {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) {
          currentPid = parsed;
          currentCommand = null;
          currentFd = null;
          currentType = null;
        }
        break;
      }
      case 'c':
        currentCommand = value;
        break;
      case 'f':
        currentFd = value;
        break;
      case 't':
        currentType = value;
        break;
      case 'n':
        // 'n' line gives us the file path; emit a record if we have a pid
        if (currentPid !== null && value) {
          results.push({
            pid: currentPid,
            command: currentCommand || '',
            fd: currentFd || '',
            type: currentType || '',
            filePath: value,
          });
        }
        // Reset per-fd fields to allow multiple files per process
        currentFd = null;
        currentType = null;
        break;
      default:
        // Unknown field code; skip
        break;
    }
  }

  return results;
}

/**
 * Parse output of `lsof -i -n -P -F pcnst` into network connection records.
 * @param {string} lsofString - Raw lsof -F output
 * @returns {Array<{pid: number, command: string, protocol: string, localAddress: string, remoteAddress: string, state: string}>}
 */
export function parseNetworkOutput(lsofString) {
  if (!lsofString || typeof lsofString !== 'string') return [];

  const lines = lsofString.split('\n');
  const results = [];

  let currentPid = null;
  let currentCommand = null;
  let currentProtocol = null;
  let currentName = null;
  let currentState = null;

  function emitRecord() {
    if (currentPid !== null && currentName) {
      // Parse "LOCAL->REMOTE" or "LOCAL" from the name field
      const { localAddress, remoteAddress } = parseAddresses(currentName);
      results.push({
        pid: currentPid,
        command: currentCommand || '',
        protocol: currentProtocol || '',
        localAddress,
        remoteAddress,
        state: currentState || '',
      });
    }
  }

  for (const line of lines) {
    if (!line) continue;
    const code = line[0];
    const value = line.slice(1);

    switch (code) {
      case 'p': {
        // New process starts — emit pending network record first
        if (currentName) emitRecord();

        const parsed = parseInt(value, 10);
        // Always reset per-process state when a new 'p' line is seen, even
        // if the pid is malformed — prevents stale PID contaminating future records.
        currentCommand = null;
        currentProtocol = null;
        currentName = null;
        currentState = null;
        if (!isNaN(parsed)) {
          currentPid = parsed;
        }
        break;
      }
      case 'c':
        currentCommand = value;
        break;
      case 's':
        // 's' in lsof -F output for network connections is the TCP/UDP connection
        // state (e.g. ESTABLISHED, LISTEN, CLOSE_WAIT). Verified against macOS lsof man page.
        currentState = value;
        break;
      case 't':
        // 't' is the socket type/protocol family (e.g. IPv4, IPv6, TCP, UDP).
        currentProtocol = value;
        break;
      case 'n':
        // Emit any previous network record for the same process
        if (currentName) emitRecord();
        currentName = value;
        currentState = null;
        break;
      case 'f':
        // File descriptor marker in network mode - ignore
        break;
      default:
        break;
    }
  }

  // Emit final record
  if (currentName) emitRecord();

  return results;
}

/**
 * Parse a network address string into local and remote components.
 * Handles formats:
 *   "LOCAL_IP:PORT->REMOTE_IP:PORT"
 *   "LOCAL_IP:PORT" (no remote)
 * @param {string} addressStr
 * @returns {{ localAddress: string, remoteAddress: string }}
 */
function parseAddresses(addressStr) {
  if (!addressStr) return { localAddress: '', remoteAddress: '' };

  const arrowIdx = addressStr.indexOf('->');
  if (arrowIdx !== -1) {
    return {
      localAddress: addressStr.slice(0, arrowIdx),
      remoteAddress: addressStr.slice(arrowIdx + 2),
    };
  }

  return {
    localAddress: addressStr,
    remoteAddress: '',
  };
}

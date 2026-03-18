/**
 * Parser for `netstat -anv` output (macOS).
 * The `-v` flag adds PID information to the output on macOS.
 *
 * Example macOS netstat -anv output:
 *   tcp4  0  0  192.168.1.5.43210  142.250.80.46.443  ESTABLISHED  131072  131072  12345  0
 *   tcp6  0  0  *.443              *.*                 LISTEN       0       0       0      0
 *
 * Note: macOS netstat uses dots (.) not colons (:) as port separators.
 * The PID is in column index 8 (0-based) when -v is used.
 */

/**
 * Convert a macOS netstat address token (dots as separators) to host:port.
 * e.g. "192.168.1.5.443" → "192.168.1.5:443"
 *      "*.443"           → "*:443"
 *      "*.*"             → ""
 * @param {string} token
 * @returns {string}
 */
function normaliseMacNetstatAddr(token) {
  if (!token || token === '*.*') return '';

  // IPv6 addresses appear as "fe80::1%lo0.80" — split on last dot
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return token;

  const host = token.slice(0, lastDot);
  const port = token.slice(lastDot + 1);
  return `${host}:${port}`;
}

/**
 * Parse `netstat -anv` stdout (macOS) into connection objects.
 * Returns objects with the same shape as parseSsOutput:
 *   { pid, command, protocol, localAddress, remoteAddress, state }
 *
 * command is set to '' because netstat -anv does not include the process name.
 * Callers should cross-reference PID with the process list to get the name.
 *
 * @param {string} raw - Raw stdout from `netstat -anv`
 * @returns {Array<{ pid: number, command: string, protocol: string, localAddress: string, remoteAddress: string, state: string }>}
 */
export function parseNetstatOutput(raw) {
  if (!raw) return [];

  const results = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip header lines
    if (trimmed.startsWith('Active') || trimmed.startsWith('Proto')) continue;

    const parts = trimmed.split(/\s+/);
    // Without -v: proto, recv-q, send-q, local, foreign, state (6 cols)
    // With    -v: proto, recv-q, send-q, local, foreign, state, rxwin, txwin, pid, epid (10 cols)
    if (parts.length < 6) continue;

    const proto = parts[0].toLowerCase(); // tcp4, tcp6, udp4, udp6
    const localRaw = parts[3];
    const remoteRaw = parts[4];
    const state = parts[5] || '';

    const localAddress = normaliseMacNetstatAddr(localRaw);
    const remoteAddress = normaliseMacNetstatAddr(remoteRaw);

    // Skip wildcard/unconnected entries
    if (!remoteAddress || remoteAddress === '*:*') continue;

    // PID is in column 8 when -v is present (0-indexed)
    let pid = 0;
    if (parts.length >= 9) {
      const pidStr = parts[8];
      const parsed = parseInt(pidStr, 10);
      if (!isNaN(parsed) && parsed > 0) pid = parsed;
    }

    const protocol = proto.includes('6') ? 'IPv6' : 'IPv4';

    results.push({
      pid,
      command: '', // netstat -anv does not include command name
      protocol,
      localAddress,
      remoteAddress,
      state: state === 'ESTABLISHED' ? 'ESTABLISHED' : state,
    });
  }

  return results;
}

export default { parseNetstatOutput };

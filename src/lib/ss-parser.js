/**
 * Parser for `ss -tunap` output (Linux).
 * Converts ss socket table output into the same shape used by lsof-parser.js.
 *
 * Example ss output line:
 *   tcp   ESTAB  0  0  192.168.1.5:43210  142.250.80.46:443  users:(("node",pid=12345,fd=22))
 */

/**
 * Extract PID and command name from ss users field.
 * Field format: users:(("cmdname",pid=NNN,fd=N),...)
 * @param {string} usersField
 * @returns {{ pid: number, command: string } | null}
 */
function parseUsers(usersField) {
  if (!usersField) return null;
  const m = usersField.match(/users:\(\("([^"]+)",pid=(\d+)/);
  if (!m) return null;
  return { command: m[1], pid: parseInt(m[2], 10) };
}

/**
 * Normalise an address token from ss output.
 * ss uses "addr:port" with IPv6 addresses like "[::1]:443".
 * Returns the raw token — callers use extractPort/extractHost.
 * @param {string} token
 * @returns {string}
 */
function normaliseAddr(token) {
  return token === '*:*' ? '' : token;
}

/**
 * Parse `ss -tunap` stdout into an array of connection objects.
 * Returns objects with the same shape as parseNetworkOutput from lsof-parser.js:
 *   { pid, command, protocol, localAddress, remoteAddress, state }
 *
 * @param {string} raw - Raw stdout from `ss -tunap`
 * @returns {Array<{ pid: number, command: string, protocol: string, localAddress: string, remoteAddress: string, state: string }>}
 */
export function parseSsOutput(raw) {
  if (!raw) return [];

  const results = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Netid') || trimmed.startsWith('State')) continue;

    // ss -tunap columns (space-separated, variable whitespace):
    // Netid  State  Recv-Q  Send-Q  LocalAddress:Port  PeerAddress:Port  [users:...]
    const parts = trimmed.split(/\s+/);
    if (parts.length < 6) continue;

    const netid = parts[0].toLowerCase(); // tcp, udp, tcp6, udp6
    const state = parts[1];
    // parts[2] = Recv-Q, parts[3] = Send-Q
    const localAddr = normaliseAddr(parts[4]);
    const remoteAddr = normaliseAddr(parts[5]);
    const usersField = parts.slice(6).join(' ');

    // Skip unconnected UDP with wildcard remote
    if (!remoteAddr) continue;

    const userInfo = parseUsers(usersField);
    if (!userInfo) continue;

    const protocol = netid.includes('6') ? 'IPv6' : 'IPv4';

    results.push({
      pid: userInfo.pid,
      command: userInfo.command,
      protocol,
      localAddress: localAddr,
      remoteAddress: remoteAddr,
      state: state === 'ESTAB' ? 'ESTABLISHED' : state,
    });
  }

  return results;
}

export default { parseSsOutput };

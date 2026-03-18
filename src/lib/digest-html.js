/**
 * HTML template renderer for Argus digest and export reports.
 * Self-contained — no external CSS or JS dependencies.
 * Dark theme with #0d1117 background and #00ff88 accent.
 */

/**
 * Escape user-supplied text for safe HTML output.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Map a severity label to a CSS color token.
 * @param {string|null|undefined} severity
 * @returns {string} CSS color value
 */
function severityColor(severity) {
  switch (String(severity ?? '').toUpperCase()) {
    case 'CRITICAL': return '#ff4444';
    case 'HIGH':     return '#ff8800';
    case 'MEDIUM':   return '#ffdd00';
    case 'LOW':
    default:         return '#888888';
  }
}

/**
 * Render a summary card.
 * @param {string} label
 * @param {number|string} value
 * @returns {string}
 */
function renderCard(label, value) {
  return `
    <div class="card">
      <div class="card-value">${escapeHtml(value)}</div>
      <div class="card-label">${escapeHtml(label)}</div>
    </div>`;
}

/**
 * Render the events table rows.
 * @param {{ timestamp: string, app_label: string, event_type: string, detail: string, severity: string|null }[]} events
 * @returns {string}
 */
function renderEventRows(events) {
  if (!events || events.length === 0) {
    return `<tr><td colspan="5" style="text-align:center;color:#555;padding:20px;">No events recorded.</td></tr>`;
  }

  return events.map((e) => {
    const color = severityColor(e.severity);
    const ts = String(e.timestamp ?? '').replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
    return `
    <tr>
      <td class="mono">${escapeHtml(ts)}</td>
      <td>${escapeHtml(e.app_label ?? '—')}</td>
      <td><span class="badge">${escapeHtml(e.event_type ?? '')}</span></td>
      <td class="mono detail">${escapeHtml(e.detail ?? '')}</td>
      <td><span style="color:${color};font-weight:bold;">${escapeHtml(e.severity ?? 'INFO')}</span></td>
    </tr>`;
  }).join('\n');
}

/**
 * Render a self-contained HTML report.
 *
 * @param {{
 *   title: string,
 *   summary: { processCount: number, fileAlertCount: number, networkEventCount: number },
 *   events: object[],
 *   generated: string
 * }} data
 * @returns {string} Complete HTML document as a string
 */
export function renderHtmlReport(data) {
  const { title, summary, events, generated } = data;

  const cards = [
    renderCard('Processes Seen', summary?.processCount ?? 0),
    renderCard('File Alerts', summary?.fileAlertCount ?? 0),
    renderCard('Network Events', summary?.networkEventCount ?? 0),
  ].join('');

  const rows = renderEventRows(events);
  const safeTitle = escapeHtml(title);
  const safeGenerated = escapeHtml(generated ?? new Date().toISOString());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #0d1117;
      color: #c9d1d9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
      font-size: 14px;
      line-height: 1.5;
      padding: 32px 24px;
    }

    h1 {
      color: #00ff88;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
    }

    .generated {
      color: #555;
      font-size: 12px;
      margin-bottom: 28px;
    }

    /* Summary cards */
    .cards {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 32px;
    }

    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 16px 24px;
      min-width: 140px;
      text-align: center;
    }

    .card-value {
      font-size: 28px;
      font-weight: 700;
      color: #00ff88;
      line-height: 1;
      margin-bottom: 6px;
    }

    .card-label {
      font-size: 11px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    /* Events table */
    h2 {
      color: #e6edf3;
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    thead th {
      background: #161b22;
      color: #8b949e;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid #30363d;
    }

    tbody tr {
      border-bottom: 1px solid #21262d;
    }

    tbody tr:hover {
      background: #161b22;
    }

    tbody td {
      padding: 9px 12px;
      vertical-align: top;
      color: #c9d1d9;
    }

    .mono {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 12px;
    }

    .detail {
      max-width: 320px;
      word-break: break-all;
      color: #8b949e;
    }

    .badge {
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 11px;
      color: #8b949e;
      white-space: nowrap;
    }

    footer {
      margin-top: 40px;
      font-size: 11px;
      color: #444;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <div class="generated">Generated: ${safeGenerated}</div>

  <div class="cards">${cards}</div>

  <h2>Events</h2>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>App</th>
          <th>Type</th>
          <th>Detail</th>
          <th>Severity</th>
        </tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </div>

  <footer>Argus &mdash; AI Activity Monitor</footer>
</body>
</html>`;
}

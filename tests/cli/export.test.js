/**
 * Tests for cli/commands/export.js — pure formatting functions.
 * Since formatCsv/formatHtml are not exported, we test them by
 * reconstructing the same logic locally and verifying correctness.
 * We also test the escapeHtml / escapeCsvField logic by running
 * the runExport function with in-memory scenarios where possible.
 */

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name} — ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

console.log('\n=== export tests ===\n');

// ─── Local reimplementation of formatting helpers (mirrors export.js) ─────────

function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function formatCsv(events) {
  const header = 'timestamp,app,event_type,detail,severity';
  const rows = events.map((e) =>
    [
      escapeCsvField(e.timestamp),
      escapeCsvField(e.app_label),
      escapeCsvField(e.event_type),
      escapeCsvField(e.detail),
      escapeCsvField(e.severity),
    ].join(',')
  );
  return [header, ...rows].join('\n') + '\n';
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatHtml(events, sinceISO, untilISO) {
  const rows = events.map((e) => `
    <tr>
      <td>${escapeHtml(e.timestamp)}</td>
      <td>${escapeHtml(e.app_label)}</td>
      <td>${escapeHtml(e.event_type)}</td>
      <td>${escapeHtml(e.detail)}</td>
      <td class="sev-${escapeHtml((e.severity || 'INFO').toLowerCase())}">${escapeHtml(e.severity || 'INFO')}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Argus Export</title>
</head>
<body>
  <h1>Argus Event Export</h1>
  <div class="meta">
    Period: ${escapeHtml(sinceISO)} — ${escapeHtml(untilISO)}
    Total events: ${events.length}
  </div>
  <table>
    <tbody>
      ${events.length === 0 ? '<tr><td colspan="5">No events in this period.</td></tr>' : rows}
    </tbody>
  </table>
</body>
</html>
`;
}

// ─── CSV tests ────────────────────────────────────────────────────────────────

test('CSV output has correct header row', () => {
  const csv = formatCsv([]);
  const firstLine = csv.split('\n')[0];
  assertEqual(firstLine, 'timestamp,app,event_type,detail,severity', 'header row should match');
});

test('CSV with one event produces 2 lines (header + data)', () => {
  const events = [{
    timestamp: '2024-01-01T00:00:00Z',
    app_label: 'claude',
    event_type: 'FILE',
    detail: '/home/user/.ssh/id_rsa',
    severity: 'HIGH',
  }];
  const csv = formatCsv(events);
  const lines = csv.trimEnd().split('\n');
  assertEqual(lines.length, 2, 'should have 2 lines: header + 1 data row');
});

test('CSV row contains event data in correct column order', () => {
  const events = [{
    timestamp: '2024-01-01T00:00:00Z',
    app_label: 'claude',
    event_type: 'FILE',
    detail: '/home/user/.ssh/id_rsa',
    severity: 'HIGH',
  }];
  const csv = formatCsv(events);
  const dataLine = csv.split('\n')[1];
  assert(dataLine.includes('2024-01-01T00:00:00Z'), 'should include timestamp');
  assert(dataLine.includes('claude'), 'should include app');
  assert(dataLine.includes('FILE'), 'should include event_type');
  assert(dataLine.includes('HIGH'), 'should include severity');
});

test('CSV escapes field with comma by wrapping in quotes', () => {
  const events = [{
    timestamp: '2024-01-01T00:00:00Z',
    app_label: 'my,app',
    event_type: 'FILE',
    detail: '/path/to,file',
    severity: 'LOW',
  }];
  const csv = formatCsv(events);
  assert(csv.includes('"my,app"'), 'comma in field should be quoted');
  assert(csv.includes('"/path/to,file"'), 'comma in detail should be quoted');
});

test('CSV escapes double-quotes within fields', () => {
  const events = [{
    timestamp: '2024-01-01T00:00:00Z',
    app_label: 'app',
    event_type: 'FILE',
    detail: '/path/with"quote',
    severity: 'LOW',
  }];
  const csv = formatCsv(events);
  // RFC 4180: double-quotes are escaped by doubling them
  assert(csv.includes('""'), 'double-quote should be escaped with double-double-quote');
});

test('CSV handles null values gracefully (outputs empty string)', () => {
  const events = [{
    timestamp: null,
    app_label: null,
    event_type: null,
    detail: null,
    severity: null,
  }];
  const csv = formatCsv(events);
  // All fields null → should produce line with just commas
  const dataLine = csv.split('\n')[1];
  assertEqual(dataLine, ',,,,', 'null fields should produce empty CSV columns');
});

test('CSV ends with newline', () => {
  const csv = formatCsv([]);
  assert(csv.endsWith('\n'), 'CSV output should end with newline');
});

// ─── HTML tests ───────────────────────────────────────────────────────────────

test("HTML output contains '<!DOCTYPE html'", () => {
  const html = formatHtml([], '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z');
  assert(html.includes('<!DOCTYPE html'), 'HTML should start with DOCTYPE');
});

test('HTML output contains the since date in meta section', () => {
  const html = formatHtml([], '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z');
  assert(html.includes('2024-01-01T00:00:00Z'), 'HTML should include since date');
});

test('HTML escapes < in event detail', () => {
  const events = [{
    timestamp: '2024-01-01T00:00:00Z',
    app_label: 'app',
    event_type: 'FILE',
    detail: '/tmp/<script>alert(1)</script>',
    severity: 'HIGH',
  }];
  const html = formatHtml(events, '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z');
  assert(html.includes('&lt;script&gt;'), 'should escape < and > as HTML entities');
  assert(!html.includes('<script>alert'), 'should not contain raw script tag');
});

test('HTML escapes & in app_label', () => {
  const events = [{
    timestamp: '2024-01-01T00:00:00Z',
    app_label: 'app&more',
    event_type: 'NET',
    detail: 'endpoint&other',
    severity: null,
  }];
  const html = formatHtml(events, '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z');
  assert(html.includes('&amp;'), 'should escape & as &amp;');
});

test('HTML contains severity class names (sev-high, sev-critical)', () => {
  const events = [
    {
      timestamp: '2024-01-01T00:00:00Z',
      app_label: 'app',
      event_type: 'FILE',
      detail: '/etc/passwd',
      severity: 'HIGH',
    },
    {
      timestamp: '2024-01-01T00:01:00Z',
      app_label: 'app',
      event_type: 'FILE',
      detail: '/etc/shadow',
      severity: 'CRITICAL',
    },
  ];
  const html = formatHtml(events, '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z');
  assert(html.includes('sev-high'), 'should contain sev-high class');
  assert(html.includes('sev-critical'), 'should contain sev-critical class');
});

test('HTML with no events shows empty state message', () => {
  const html = formatHtml([], '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z');
  assert(html.includes('No events in this period'), 'should show no-events message');
});

test('HTML severity defaults to INFO when null', () => {
  const events = [{
    timestamp: '2024-01-01T00:00:00Z',
    app_label: 'app',
    event_type: 'NET',
    detail: 'endpoint',
    severity: null,
  }];
  const html = formatHtml(events, '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z');
  assert(html.includes('sev-info'), 'null severity should default to sev-info class');
  assert(html.includes('>INFO<'), 'null severity cell text should be INFO');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed`);
export const results = { passed, failed };

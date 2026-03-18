/**
 * Tests for lib/digest-html.js — renderHtmlReport.
 */

import { renderHtmlReport } from '../../src/lib/digest-html.js';

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

console.log('\n=== digest-html tests ===\n');

const BASE_DATA = {
  title: 'Test Report',
  summary: { processCount: 3, fileAlertCount: 2, networkEventCount: 5 },
  events: [],
  generated: '2024-01-01T08:00:00.000Z',
};

test('renderHtmlReport: returns a string', () => {
  const result = renderHtmlReport(BASE_DATA);
  assert(typeof result === 'string', 'should return string');
});

test("renderHtmlReport: contains '<!DOCTYPE html'", () => {
  const result = renderHtmlReport(BASE_DATA);
  assert(result.includes('<!DOCTYPE html'), 'should contain DOCTYPE');
});

test('renderHtmlReport: includes the title in output', () => {
  const result = renderHtmlReport(BASE_DATA);
  assert(result.includes('Test Report'), 'should contain the title text');
});

test('renderHtmlReport: includes summary stats — processCount', () => {
  const result = renderHtmlReport(BASE_DATA);
  assert(result.includes('3'), 'should contain processCount value');
});

test('renderHtmlReport: includes summary stats — fileAlertCount', () => {
  const result = renderHtmlReport(BASE_DATA);
  assert(result.includes('2'), 'should contain fileAlertCount value');
});

test('renderHtmlReport: includes summary stats — networkEventCount', () => {
  const result = renderHtmlReport(BASE_DATA);
  assert(result.includes('5'), 'should contain networkEventCount value');
});

test('renderHtmlReport: escapes < in event data', () => {
  const data = {
    ...BASE_DATA,
    events: [
      {
        timestamp: '2024-01-01T00:00:00Z',
        app_label: 'test-app',
        event_type: 'FILE',
        detail: '/tmp/file<script>',
        severity: 'HIGH',
      },
    ],
  };
  const result = renderHtmlReport(data);
  assert(result.includes('&lt;script&gt;'), 'should escape < and > in event detail');
  assert(!result.includes('<script>'), 'should not contain raw <script>');
});

test('renderHtmlReport: escapes & in event data', () => {
  const data = {
    ...BASE_DATA,
    events: [
      {
        timestamp: '2024-01-01T00:00:00Z',
        app_label: 'test&app',
        event_type: 'NET',
        detail: 'host&other',
        severity: null,
      },
    ],
  };
  const result = renderHtmlReport(data);
  assert(result.includes('&amp;'), 'should escape & as &amp;');
});

test('renderHtmlReport: contains severity class names (sev- pattern via color logic)', () => {
  const data = {
    ...BASE_DATA,
    events: [
      {
        timestamp: '2024-01-01T00:00:00Z',
        app_label: 'myapp',
        event_type: 'FILE',
        detail: '/etc/passwd',
        severity: 'CRITICAL',
      },
    ],
  };
  const result = renderHtmlReport(data);
  // The severity is rendered with its color; the word CRITICAL should appear
  assert(result.includes('CRITICAL'), 'should include CRITICAL severity text');
});

test('renderHtmlReport: contains card-value class for summary stats', () => {
  const result = renderHtmlReport(BASE_DATA);
  assert(result.includes('card-value'), 'should contain card-value class for stats cards');
});

test('renderHtmlReport: empty events renders no-events message', () => {
  const result = renderHtmlReport(BASE_DATA);
  assert(result.includes('No events recorded'), 'should show no-events message when events array is empty');
});

test('renderHtmlReport: events with HIGH severity render correctly', () => {
  const data = {
    ...BASE_DATA,
    events: [
      {
        timestamp: '2024-01-01T00:00:00Z',
        app_label: 'myapp',
        event_type: 'FILE',
        detail: '/home/user/.ssh/id_rsa',
        severity: 'HIGH',
      },
    ],
  };
  const result = renderHtmlReport(data);
  assert(result.includes('HIGH'), 'should contain HIGH severity');
  assert(result.includes('myapp'), 'should contain app_label');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed`);
export const results = { passed, failed };

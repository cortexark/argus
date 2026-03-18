# Contributing to Argus

Thank you for your interest in contributing to Argus! This guide explains how to add features, fix bugs, and maintain code quality.

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- macOS 12+ or Linux (for development)

### Setup

```bash
git clone https://github.com/yourusername/argus.git
cd argus
npm install
npm test
```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
node tests/lib/config.test.js

# Follow test output with details
node tests/run.js
```

Tests must pass before submitting a PR. Target: **80%+ code coverage**.

### Code Style

- Use ES modules (`import`/`export`)
- Keep functions small and focused (<50 lines)
- Use immutable patterns (don't mutate input objects)
- Handle errors explicitly (never silently fail)
- Document complex logic with comments

Example:

```javascript
/**
 * Classify a process by AI detection signals.
 * @param {number} pid - Process ID
 * @param {string} name - Process name
 * @returns {Promise<{ score: number, verdict: string }>}
 */
export async function classifyProcess(pid, name) {
  const signals = await collectSignals(pid);
  return scoreSignals(signals);
}
```

## Adding a New AI App

To monitor a new AI application:

### 1. Register in `src/ai-apps.js`

```javascript
export const AI_APPS = {
  // ... existing apps ...
  'myapp': {
    name: 'My AI Application',
    category: 'AI Code Editor',  // or 'LLM Desktop', 'Local LLM', etc.
  },
};
```

### 2. Add Keywords (if needed)

If your app uses specific command-line keywords, add them to `CMD_KEYWORDS` in `src/monitors/process-classifier.js`:

```javascript
const CMD_KEYWORDS = Object.freeze([
  // ... existing keywords ...
  'myapp',
  'my-ai-service',
]);
```

### 3. Add API Endpoints (if needed)

If your app connects to a unique API endpoint, add it to `AI_ENDPOINTS` in `src/ai-apps.js`:

```javascript
export const AI_ENDPOINTS = [
  // ... existing endpoints ...
  { pattern: 'api.myapp.com', service: 'My AI App API' },
];
```

### 4. Write Tests

Add tests to `tests/monitors/process-classifier.test.js`:

```javascript
test('detects MyApp process by ancestry', async () => {
  const processTree = new Map([
    [100, { pid: 100, ppid: 1, name: 'myapp', cmd: 'myapp' }],
    [101, { pid: 101, ppid: 100, name: 'node', cmd: 'node agent.js' }],
  ]);

  const result = await classifyProcess(101, 'node', 'node agent.js');
  assert(result.verdict === 'CONFIRMED_AI', 'Should detect as AI by ancestry');
});
```

### 5. Create a PR

Include:
- Changed files
- Test output showing new tests passing
- Example notification that will be sent

## Adding a New Injection Pattern

To monitor a new sensitive file type:

### Edit `src/ai-apps.js`

```javascript
export const SENSITIVE_PATHS = {
  credentials: [
    // ... existing paths ...
    '.myapprc',           // Add your new pattern
  ],
  documents: [
    // ... existing paths ...
  ],
  // ...
};
```

### Test It

Add a test to `tests/monitors/file-monitor.test.js` to verify the path is detected.

## Adding a New Notification Type

To alert users about a new type of AI behavior:

### Edit `src/notifications/notifier.js`

```javascript
export const notify = {
  // ... existing notifications ...

  /**
   * AI app accessed a new suspicious pattern.
   * "Claude accessed unrecognized API endpoint"
   */
  suspiciousPattern(appName, pattern, detail) {
    return sendAlert(
      appName,
      'suspicious_pattern',
      `Accessed unknown pattern: ${pattern}\n${detail}`,
      { urgency: 'critical' },
    );
  },
};
```

### Use It in Code

In your monitor (e.g., `src/monitors/file-monitor.js`):

```javascript
notify.suspiciousPattern(
  appName,
  filePath,
  'Not a known AI working directory'
);
```

### Test It

Add tests to `tests/notifications/notifier.test.js` to verify:
- Notification is sent
- Message contains expected details
- Throttling works

## Debugging

### Enable Verbose Logging

```bash
LOGLEVEL=debug npm start
```

### Inspect the Database

```bash
sqlite3 ~/.argus/data.db
sqlite> SELECT * FROM file_events LIMIT 5;
sqlite> SELECT COUNT(*) FROM network_events;
```

### Check Running Process

```bash
argus status
argus logs -f
```

## Code Review

All PRs require:

- [ ] Tests pass (`npm test`)
- [ ] No hardcoded secrets (API keys, credentials)
- [ ] New tests for new features
- [ ] Updated documentation if behavior changed
- [ ] Commit message follows format: `feat:`, `fix:`, `docs:`, `refactor:`

### PR Template

```markdown
## What does this PR do?

Brief description of the change.

## How to test it?

1. Run `npm install`
2. Run `npm test`
3. Run `argus [command]` to verify behavior

## Related issues

Closes #123
```

## Security Considerations

Before submitting, verify:

- No API keys or credentials in code
- No network calls to external services (except AI APIs when necessary)
- No shell injection vulnerabilities in `exec.js`
- All file paths validated before use
- Database queries use parameterized statements (never string concatenation)

## Release Process

(Maintainers only)

```bash
npm version patch     # or minor/major
git push origin main --tags
npm publish
```

This will:
1. Update `package.json` version
2. Create a git tag
3. Publish to npm registry
4. CI runs tests automatically

## Questions?

Open an issue for questions or discussion before starting work on large changes.

---

**Thank you for making Argus better!**

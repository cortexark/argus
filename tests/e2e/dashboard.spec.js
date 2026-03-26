// @ts-check
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS = path.join(__dirname, 'screenshots');

const BASE = 'http://localhost:3131';

// ── helpers ──────────────────────────────────────────────────────────────────

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOTS, name + '.png'), fullPage: false });
}

async function waitForTabActive(page, tabName) {
  const section = page.locator(`#tab-${tabName}`);
  await expect(section).toHaveClass(/active/, { timeout: 5000 });
}

async function goToOverview(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  // Wait for KPI values from both /api/status (statProcesses) and /api/network (statNetwork)
  await page.waitForFunction(() => {
    const procs = document.getElementById('statProcesses');
    const net   = document.getElementById('statNetwork');
    return procs && procs.textContent !== '\u2014' && procs.textContent !== ''
        && net   && net.textContent   !== '\u2014' && net.textContent   !== '';
  }, { timeout: 10000 });
}

// ── Suite 1: Smoke test — all tabs load without JS errors ─────────────────────

test.describe('Smoke test — all tabs load', () => {

  test('page loads and header is visible', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await screenshot(page, '01-overview-loaded');

    // Header elements
    await expect(page.locator('.logo')).toContainText('Argus');
    await expect(page.locator('nav')).toBeVisible();

    // All 5 tabs present
    const tabs = ['overview', 'processes', 'files', 'network', 'ports'];
    for (const tab of tabs) {
      await expect(page.locator(`.tab[data-tab="${tab}"]`)).toBeVisible();
    }

    if (jsErrors.length > 0) {
      console.error('JS errors on load:', jsErrors);
    }
    expect(jsErrors, `JS errors found: ${jsErrors.join('; ')}`).toHaveLength(0);
  });

  test('Overview tab is active by default', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.tab[data-tab="overview"]')).toHaveClass(/active/);
    await expect(page.locator('#tab-overview')).toHaveClass(/active/);
  });

  test('Processes tab loads without errors', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('.tab[data-tab="processes"]').click();
    await waitForTabActive(page, 'processes');
    // Wait for table to be populated (not showing "Loading...")
    await page.waitForFunction(() => {
      const tbody = document.getElementById('processTable');
      return tbody && !tbody.textContent.includes('Loading');
    }, { timeout: 10000 });
    await screenshot(page, '02-processes-tab');

    expect(jsErrors, `JS errors on Processes tab: ${jsErrors.join('; ')}`).toHaveLength(0);
  });

  test('File Alerts tab loads without errors', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('.tab[data-tab="files"]').click();
    await waitForTabActive(page, 'files');
    await page.waitForFunction(() => {
      const tbody = document.getElementById('fileTable');
      return tbody && !tbody.textContent.includes('Loading');
    }, { timeout: 10000 });
    await screenshot(page, '03-file-alerts-tab');

    expect(jsErrors, `JS errors on File Alerts tab: ${jsErrors.join('; ')}`).toHaveLength(0);
  });

  test('Network tab loads without errors', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('.tab[data-tab="network"]').click();
    await waitForTabActive(page, 'network');
    await page.waitForFunction(() => {
      const tbody = document.getElementById('networkTable');
      return tbody && !tbody.textContent.includes('Loading');
    }, { timeout: 10000 });
    await screenshot(page, '04-network-tab');

    expect(jsErrors, `JS errors on Network tab: ${jsErrors.join('; ')}`).toHaveLength(0);
  });

  test('Ports tab loads without errors', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('.tab[data-tab="ports"]').click();
    await waitForTabActive(page, 'ports');
    await page.waitForFunction(() => {
      const tbody = document.getElementById('portTable');
      return tbody && !tbody.textContent.includes('Loading');
    }, { timeout: 10000 });
    await screenshot(page, '05-ports-tab');

    expect(jsErrors, `JS errors on Ports tab: ${jsErrors.join('; ')}`).toHaveLength(0);
  });

});

// ── Suite 2: KPI card navigation ──────────────────────────────────────────────

test.describe('KPI card navigation', () => {

  test('Active AI Apps card navigates to Processes tab', async ({ page }) => {
    await goToOverview(page);

    // Verify we start on overview
    await expect(page.locator('#tab-overview')).toHaveClass(/active/);

    // Click the "Active AI Apps" KPI card (first card, onclick=switchTab('processes'))
    const card = page.locator('.kpi-card', { has: page.locator('#statProcesses') });
    await expect(card).toBeVisible();
    await card.click();

    // Processes tab should now be active
    await waitForTabActive(page, 'processes');
    await expect(page.locator('.tab[data-tab="processes"]')).toHaveClass(/active/);
    await screenshot(page, '06-kpi-active-apps-nav');
  });

  test('File Alerts KPI card navigates to File Alerts tab', async ({ page }) => {
    await goToOverview(page);

    const card = page.locator('.kpi-card', { has: page.locator('#statAlerts') });
    await expect(card).toBeVisible();
    await card.click();

    await waitForTabActive(page, 'files');
    await expect(page.locator('.tab[data-tab="files"]')).toHaveClass(/active/);
    await screenshot(page, '07-kpi-file-alerts-nav');
  });

  test('Network Events KPI card navigates to Network tab', async ({ page }) => {
    await goToOverview(page);

    const card = page.locator('.kpi-card', { has: page.locator('#statNetwork') });
    await expect(card).toBeVisible();
    await card.click();

    await waitForTabActive(page, 'network');
    await expect(page.locator('.tab[data-tab="network"]')).toHaveClass(/active/);
    await screenshot(page, '08-kpi-network-nav');
  });

  test('KPI cards have cursor:pointer style (are clickable)', async ({ page }) => {
    await goToOverview(page);

    // Verify all KPI cards that link to tabs have pointer cursor
    const cards = page.locator('.kpi-card[onclick]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const cursor = await cards.nth(i).evaluate(el => window.getComputedStyle(el).cursor);
      expect(cursor).toBe('pointer');
    }
  });

});

// ── Suite 3: Activity overview ────────────────────────────────────────────────

test.describe('Activity overview section', () => {

  test('AI App Activity section is visible on Overview tab', async ({ page }) => {
    await goToOverview(page);

    // Section title should be visible
    await expect(page.locator('.section-title').filter({ hasText: 'AI App Activity' })).toBeVisible();

    // Activity grid should be rendered (not stuck on "Loading...")
    const grid = page.locator('#activityGrid');
    await expect(grid).toBeVisible();
    await page.waitForFunction(() => {
      const g = document.getElementById('activityGrid');
      return g && !g.textContent.includes('Loading');
    }, { timeout: 10000 });

    await screenshot(page, '09-activity-overview');
  });

  test('Activity grid shows AI app cards when apps are detected', async ({ page }) => {
    // First check the API to know what to expect
    const apiResponse = await page.request.get(`${BASE}/api/activity`);
    const apps = await apiResponse.json();

    await goToOverview(page);

    const grid = page.locator('#activityGrid');
    await page.waitForFunction(() => {
      const g = document.getElementById('activityGrid');
      return g && !g.textContent.includes('Loading');
    }, { timeout: 10000 });

    if (apps.length > 0) {
      // Should have activity cards, not the "no apps" message
      const cards = grid.locator('.activity-card');
      await expect(cards).toHaveCount(apps.length);

      // First card should show the app name
      const firstName = apps[0].label;
      await expect(cards.first().locator('.activity-card-name')).toContainText(firstName);

      // Each card should show app name and category
      for (let i = 0; i < apps.length; i++) {
        const card = cards.nth(i);
        await expect(card.locator('.activity-card-name')).toContainText(apps[i].label);
        await expect(card.locator('.activity-card-cat')).toBeVisible();
      }

      await screenshot(page, '10-activity-cards-populated');
    } else {
      // No apps: should show the "no AI apps detected" message
      await expect(grid.locator('.activity-none')).toContainText('No AI apps detected');
      await screenshot(page, '10-activity-empty');
    }
  });

  test('Activity cards show file access info (files section present)', async ({ page }) => {
    const apiResponse = await page.request.get(`${BASE}/api/activity`);
    const apps = await apiResponse.json();

    if (apps.length === 0) {
      test.skip();
      return;
    }

    await goToOverview(page);
    await page.waitForFunction(() => {
      const g = document.getElementById('activityGrid');
      return g && g.querySelectorAll('.activity-card').length > 0;
    }, { timeout: 10000 });

    const cards = page.locator('.activity-card');
    const firstCard = cards.first();

    // Each card should have "Files Accessed" label
    await expect(firstCard.locator('.activity-block-label').filter({ hasText: 'Files Accessed' })).toBeVisible();

    // Files section should exist (either file rows or "no file accesses recorded")
    const filesSection = firstCard.locator('.activity-files');
    await expect(filesSection).toBeVisible();
  });

});

// ── Suite 4: Approve/Deny persistence ─────────────────────────────────────────

test.describe('Approve/Deny persistence', () => {

  test('Approvals panel is visible on Overview tab', async ({ page }) => {
    await goToOverview(page);
    await expect(page.locator('#approvalPanel')).toBeVisible();
    await screenshot(page, '11-approvals-panel');
  });

  test('Approvals render from API data', async ({ page }) => {
    const apiResponse = await page.request.get(`${BASE}/api/approvals`);
    const approvals = await apiResponse.json();

    await goToOverview(page);
    await page.waitForFunction(() => {
      const list = document.getElementById('approvalList');
      return list && !list.textContent.includes('No pending approvals') || list.querySelectorAll('.approval-item').length > 0;
    }, { timeout: 10000 }).catch(() => {}); // might legitimately be empty

    const list = page.locator('#approvalList');

    if (approvals.length > 0) {
      const items = list.locator('.approval-item');
      const renderedCount = await items.count();
      expect(renderedCount).toBe(approvals.length);
    } else {
      // Should show empty state
      await expect(list).toContainText(/No (pending approvals|sensitive access)/i);
    }
  });

  test('Clicking Approve on a pending item sends decision and updates UI', async ({ page }) => {
    // Find a pending item from the API
    const apiResponse = await page.request.get(`${BASE}/api/approvals`);
    const approvals = await apiResponse.json();
    const pending = approvals.filter(a => a.decision === 'pending');

    if (pending.length === 0) {
      test.skip();
      return;
    }

    await goToOverview(page);

    // Wait for approval items to render
    await page.waitForSelector('.approval-item', { timeout: 10000 });

    // Find and click the first Approve button
    const firstApproveBtn = page.locator('.btn-approve').first();
    await expect(firstApproveBtn).toBeVisible();
    await screenshot(page, '12-before-approve');

    await firstApproveBtn.click();

    // After clicking, the item should now show a decision chip (approved/denied)
    // and the approve/deny buttons should be gone for that item
    await page.waitForFunction(() => {
      const chips = document.querySelectorAll('.decision-chip.approved');
      return chips.length > 0;
    }, { timeout: 8000 });

    await screenshot(page, '13-after-approve');

    // The decided item should have the 'decided' class (visual dimming)
    const decidedItems = page.locator('.approval-item.decided');
    await expect(decidedItems.first()).toBeVisible();
  });

  test('Approval decision persists after navigating away and back', async ({ page }) => {
    // Find a pending item from the API first
    const apiResponse = await page.request.get(`${BASE}/api/approvals`);
    const approvals = await apiResponse.json();
    const pending = approvals.filter(a => a.decision === 'pending');

    if (pending.length === 0) {
      test.skip();
      return;
    }

    await goToOverview(page);
    await page.waitForSelector('.approval-item', { timeout: 10000 });

    // Click Deny on first pending item
    const firstDenyBtn = page.locator('.btn-deny').first();

    // Record which item ID we're acting on (read from the first pending in API)
    const targetId = pending[0].id;

    await firstDenyBtn.click();

    // Wait for UI update
    await page.waitForFunction(() => {
      return document.querySelectorAll('.decision-chip.denied').length > 0;
    }, { timeout: 8000 });

    await screenshot(page, '14-after-deny');

    // Navigate away to Processes tab
    await page.locator('.tab[data-tab="processes"]').click();
    await waitForTabActive(page, 'processes');

    // Navigate back to Overview
    await page.locator('.tab[data-tab="overview"]').click();
    await waitForTabActive(page, 'overview');

    // Wait for refresh cycle to complete
    await page.waitForFunction(() => {
      const list = document.getElementById('approvalList');
      return list && !list.textContent.includes('Loading');
    }, { timeout: 10000 });

    // Verify the decision is still shown
    await page.waitForFunction((id) => {
      const items = document.querySelectorAll('.approval-item');
      for (const item of items) {
        const chip = item.querySelector('.decision-chip');
        if (chip && chip.classList.contains('denied')) return true;
      }
      return false;
    }, targetId, { timeout: 8000 });

    await screenshot(page, '15-persistence-verified');

    // Also verify via API that decision was persisted to backend
    const recheck = await page.request.get(`${BASE}/api/approvals`);
    const recheckData = await recheck.json();
    const found = recheckData.find(a => a.id === targetId);
    expect(found).toBeDefined();
    expect(found.decision).toBe('denied');
  });

  test('Approval count badge reflects pending count', async ({ page }) => {
    const apiResponse = await page.request.get(`${BASE}/api/approvals`);
    const approvals = await apiResponse.json();
    const pendingCount = approvals.filter(a => a.decision === 'pending').length;

    await goToOverview(page);
    await page.waitForFunction(() => {
      return document.getElementById('approvalList') &&
             !document.getElementById('approvalList').textContent.includes('Loading');
    }, { timeout: 10000 }).catch(() => {});

    const badge = page.locator('#approvalCount');
    await expect(badge).toHaveText(String(pendingCount));
  });

});

// ── Suite 5: Network tab content ──────────────────────────────────────────────

test.describe('Network tab', () => {

  test('Network tab loads events from API', async ({ page }) => {
    const apiResponse = await page.request.get(`${BASE}/api/network`);
    const events = await apiResponse.json();

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('.tab[data-tab="network"]').click();
    await waitForTabActive(page, 'network');

    await page.waitForFunction(() => {
      const tbody = document.getElementById('networkTable');
      return tbody && !tbody.textContent.includes('Loading');
    }, { timeout: 10000 });

    await screenshot(page, '16-network-tab-loaded');

    if (events.length > 0) {
      const rows = page.locator('#networkTable tr').filter({ hasNot: page.locator('.empty-row') });
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
    } else {
      await expect(page.locator('#networkTable')).toContainText('No network events');
    }
  });

  test('Network events show app_label (not blank) for known AI apps', async ({ page }) => {
    const apiResponse = await page.request.get(`${BASE}/api/network`);
    const events = await apiResponse.json();

    // Check if any events have app_label set
    const labeledEvents = events.filter(e => e.app_label && e.app_label !== '');
    if (labeledEvents.length === 0) {
      test.skip();
      return;
    }

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('.tab[data-tab="network"]').click();
    await waitForTabActive(page, 'network');

    await page.waitForFunction(() => {
      const tbody = document.getElementById('networkTable');
      return tbody && !tbody.textContent.includes('Loading');
    }, { timeout: 10000 });

    // At least one row should contain a known app label
    const rows = page.locator('#networkTable tr');
    const count = await rows.count();
    let foundLabel = false;
    for (let i = 0; i < Math.min(count, 20); i++) {
      const rowText = await rows.nth(i).textContent();
      if (labeledEvents.some(e => rowText && rowText.includes(e.app_label))) {
        foundLabel = true;
        break;
      }
    }
    expect(foundLabel, 'Expected to find at least one app_label in rendered network rows').toBe(true);
  });

  test('Network events with ai_service show service name (not blank)', async ({ page }) => {
    const apiResponse = await page.request.get(`${BASE}/api/network`);
    const events = await apiResponse.json();
    const serviceEvents = events.filter(e => e.ai_service && e.ai_service !== '');

    if (serviceEvents.length === 0) {
      // No events with ai_service — report this as informational
      console.log('INFO: No network events have ai_service populated. Service name column will show "--".');
      test.skip();
      return;
    }

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('.tab[data-tab="network"]').click();
    await waitForTabActive(page, 'network');

    await page.waitForFunction(() => {
      const tbody = document.getElementById('networkTable');
      return tbody && !tbody.textContent.includes('Loading');
    }, { timeout: 10000 });

    const rows = page.locator('#networkTable tr');
    const count = await rows.count();
    let foundService = false;
    for (let i = 0; i < Math.min(count, 20); i++) {
      const rowText = await rows.nth(i).textContent();
      if (serviceEvents.some(e => rowText && rowText.includes(e.ai_service))) {
        foundService = true;
        break;
      }
    }
    expect(foundService, 'Expected to find ai_service name in rendered network rows').toBe(true);
  });

  test('Unknown network destinations get visual warning (row-unknown-net class)', async ({ page }) => {
    const apiResponse = await page.request.get(`${BASE}/api/network`);
    const events = await apiResponse.json();
    const unknownEvents = events.filter(e => !e.ai_service);

    if (unknownEvents.length === 0) {
      test.skip();
      return;
    }

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('.tab[data-tab="network"]').click();
    await waitForTabActive(page, 'network');

    await page.waitForFunction(() => {
      const tbody = document.getElementById('networkTable');
      return tbody && !tbody.textContent.includes('Loading');
    }, { timeout: 10000 });

    const warningRows = page.locator('#networkTable tr.row-unknown-net');
    const count = await warningRows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('KPI statNetwork count matches API response length', async ({ page }) => {
    const apiResponse = await page.request.get(`${BASE}/api/network`);
    const events = await apiResponse.json();

    await goToOverview(page);

    const kpiText = await page.locator('#statNetwork').textContent();
    const kpiNum = parseInt(kpiText || '0', 10);
    expect(kpiNum).toBe(events.length);
  });

});

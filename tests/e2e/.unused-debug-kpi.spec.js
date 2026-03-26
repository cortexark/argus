// @ts-check
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3131';

test('debug KPI card click behavior', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Check the KPI card's onclick attribute
  const cardOnclick = await page.locator('.kpi-card').first().getAttribute('onclick');
  console.log('First kpi-card onclick:', cardOnclick);

  // Check all kpi-cards with onclick
  const cards = page.locator('.kpi-card[onclick]');
  const count = await cards.count();
  console.log('KPI cards with onclick:', count);

  for (let i = 0; i < count; i++) {
    const onclick = await cards.nth(i).getAttribute('onclick');
    const id = await cards.nth(i).locator('.kpi-value').getAttribute('id');
    console.log(`Card ${i}: id=${id}, onclick=${onclick}`);
  }

  // Verify overview tab is active
  const overviewClass = await page.locator('#tab-overview').getAttribute('class');
  console.log('Overview section class before click:', overviewClass);

  // Click the first KPI card (processes)
  const processCard = page.locator('.kpi-card[onclick="switchTab(\'processes\')"]');
  const processCardCount = await processCard.count();
  console.log('Process KPI card count:', processCardCount);

  if (processCardCount > 0) {
    await processCard.click();
    await page.waitForTimeout(500);
    const afterClass = await page.locator('#tab-processes').getAttribute('class');
    console.log('Processes section class after click:', afterClass);
  }

  // Also test by evaluating switchTab directly
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    // @ts-ignore
    window.switchTab('processes');
  });
  await page.waitForTimeout(200);
  const evalClass = await page.locator('#tab-processes').getAttribute('class');
  console.log('Processes section class after JS switchTab:', evalClass);

  // Test clicking by title attribute
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('[title="Click to view processes"]').click();
  await page.waitForTimeout(500);
  const titleClickClass = await page.locator('#tab-processes').getAttribute('class');
  console.log('Processes section class after title click:', titleClickClass);
});

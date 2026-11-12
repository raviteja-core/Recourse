import puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  const screenshotsDir = path.resolve(process.cwd(), 'docs/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log('Launching headless browser at 1920x1080...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[${page.url()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err: any) => {
    consoleErrors.push(`[${page.url()}] ${err.message || String(err)}`);
  });

  // 1. Demo Console Screenshot
  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1500));

  const consolePath = path.join(screenshotsDir, 'demo-console-1920x1080.png');
  await page.screenshot({ path: consolePath });
  console.log(`✓ Saved Demo Console screenshot to: ${consolePath}`);

  // 2. Human Approval Modal Screenshot
  console.log('Triggering Human Approval modal...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const packBtn = buttons.find((b) => b.textContent?.includes('Human approval') || b.textContent?.includes('Expedition Pack'));
    if (packBtn) packBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  const modalPath = path.join(screenshotsDir, 'human-approval-modal.png');
  await page.screenshot({ path: modalPath });
  console.log(`✓ Saved Human Approval Modal screenshot to: ${modalPath}`);

  // 3. Dashboard Screenshot
  console.log('Navigating to http://localhost:3000/dashboard...');
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2000));

  const dashboardPath = path.join(screenshotsDir, 'dashboard-1920x1080.png');
  await page.screenshot({ path: dashboardPath });
  console.log(`✓ Saved AG Studio Dashboard screenshot to: ${dashboardPath}`);

  await browser.close();

  console.log('\n================================================================');
  console.log('BROWSER CONSOLE REPORT:');
  if (consoleErrors.length === 0) {
    console.log('✓ Zero console errors detected across all pages!');
  } else {
    console.warn(`Encountered ${consoleErrors.length} console error(s):`, consoleErrors);
  }
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('Error taking screenshots:', err);
  process.exit(1);
});

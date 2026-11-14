import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const noWebGL = process.argv.includes('--no-webgl');
const browser = await chromium.launch({args: noWebGL
  ? ['--disable-webgl', '--disable-webgl2']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext(mobile
      ? {viewport: {width: 412, height: 915}, isMobile: true, hasTouch: true}
      : {viewport: {width: 1100, height: 760}});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8766/');
    await page.getByText('Drop: Gold', {exact: true}).waitFor();
    await page.getByText('Riverina Gold', {exact: true}).waitFor();
    if (noWebGL) await page.getByText('Map unavailable in this browser', {exact: true}).waitFor();
    await page.getByText('Drop: Gold', {exact: true}).click();
    await page.getByText(/Session pins: 1/).waitFor();
    await page.getByText('Offline Tiles', {exact: true}).click();
    await page.getByText('Offline Tiles (Mapbox Scaffold)', {exact: true}).waitFor();
    await page.getByText('Close', {exact: true}).click();
    await page.getByText('Geology', {exact: true}).waitFor();
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log(`PASS ${mobile ? 'phone emulation' : 'desktop'}${noWebGL ? ' without WebGL' : ''}: session pin count, offline dialog and return; no uncaught errors`);
    await context.close();
  }
} finally {
  await browser.close();
}

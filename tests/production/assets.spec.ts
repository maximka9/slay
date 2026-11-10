import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { awards } from '../../src/data/awards';

test('production: 18 активных обложек, маршруты и локальные шрифты', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const requests: string[] = [];
  page.on('request', r => requests.push(r.url()));
  const media = awards.categories.flatMap(c => c.nominees.flatMap(n => n.media ? [n.media.src] : []));
  expect(media).toHaveLength(18);
  for (const src of media) {
    const response = await request.get(encodeURI(src));
    expect(response.ok(), src).toBe(true);
    expect(response.headers()['content-type'], src).toMatch(/^image\//);
    expect((await response.body()).equals(await readFile(`public${src}`)), src).toBe(true);
  }
  for (const route of ['/', '/awards', '/present?scene=5', '/present?scene=7', '/results']) {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForFunction(() => [...document.images].every(img => img.complete));
    expect(await page.locator('img').evaluateAll(imgs => imgs.every(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
  }
  expect(errors).toEqual([]);
  expect(requests.every(url => url.startsWith('http://127.0.0.1:4173/'))).toBe(true);
  expect(requests.some(url => url.endsWith('.woff2'))).toBe(true);
});

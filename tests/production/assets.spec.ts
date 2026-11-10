import { test, expect } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';
import { awards } from '../../src/data/awards';

test('production: 38 превью, 47 видео, маршруты и локальные шрифты', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const requests: string[] = [];
  page.on('request', r => requests.push(r.url()));
  const media = awards.categories.flatMap(c => c.nominees.flatMap(n => n.media ? [n.media.src] : []));
  expect(media).toHaveLength(38);
  for (const src of media) {
    const response = await request.get(encodeURI(src));
    expect(response.ok(), src).toBe(true);
    expect(response.headers()['content-type'], src).toMatch(/^image\//);
    expect((await response.body()).equals(await readFile(`public${src}`)), src).toBe(true);
  }
  const videos = awards.categories.flatMap(c => c.nominees.flatMap(n => n.videos ?? []));
  expect(videos).toHaveLength(47);
  for (const item of videos) {
    const response = await request.head(encodeURI(item.src));
    expect(response.ok(), item.src).toBe(true);
    expect(response.headers()['content-type'], item.src).toMatch(/^video\/mp4/);
    expect(Number(response.headers()['content-length']), item.src).toBe((await stat(`public${item.src}`)).size);
  }
  for (const route of ['/', '/awards', '/present?scene=3', '/present?scene=5', '/present?scene=7', '/present?scene=9', '/present?scene=13', '/present?scene=15', '/present?scene=19', '/present?scene=21', '/results']) {
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

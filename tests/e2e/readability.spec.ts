import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { awards } from '../../src/data/awards';
import { createScenes } from '../../src/data/scenes';
import { measureRenderedContrast } from '../contrast';

test('контраст WCAG AA на всех сценах, обзоре, архиве и в пульте', async ({ page }) => {
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const report: { page: string; violations: unknown; incomplete: unknown; renderedText: { text: string; ratio: number }[] }[] = [];
  async function audit(label: string) {
    await page.evaluate(() => document.fonts.ready);
    const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    const renderedText = await measureRenderedContrast(page);
    report.push({ page: label, violations: result.violations, incomplete: result.incomplete, renderedText });
    expect.soft(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), label).toEqual([]);
    expect.soft(renderedText.filter(item => item.ratio < 4.5), `${label}: контраст текста на фактическом фоне`).toEqual([]);
  }
  for (const path of ['/', '/results', ...createScenes(awards).map((_, i) => `/present?scene=${i + 1}`)]) {
    await page.goto(path); await audit(path);
  }
  await page.getByRole('button', { name: 'Настройки церемонии' }).click();
  await audit('Пульт');
  await page.getByRole('button', { name: 'Сбросить раскрытия' }).click();
  await audit('Подтверждение сброса');
  // Browser-only fixture: never writes winners or published state into the config.
  await page.route('**/src/data/awards.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('winner: null', 'winner: { id: "chatter-winner", name: "test_chatter", media: { src: "/assets/avatars/vip/alikgafuroff.png", alt: "Тестовая аватарка" } }').replace('ceremonyPublished: false', 'ceremonyPublished: true') });
  });
  await page.goto('/present?scene=18');
  await page.getByRole('button', { name: /Объявить победителя/ }).click();
  await expect(page.getByTestId('winner-result')).toBeVisible();
  await audit('Раскрытый победитель (тест)');
  await page.goto('/results'); await audit('Открытый архив (тест)');
  await page.screenshot({ path: 'artifacts/screenshots-v5/08-results-TEST-ONLY.png', fullPage: true });
  await page.goto('/');
  await page.locator('.hero-actions .primary').hover();
  await page.waitForTimeout(250);
  await audit('Обзор: кнопка при наведении');
  await page.locator('.category-tile').first().hover();
  await page.waitForTimeout(300);
  await audit('Обзор: карточка при наведении');
  await page.goto('/present?scene=5');
  await page.getByRole('button', { name: 'Смотреть видео: Red Dead Redemption 2' }).click();
  await audit('Модальный видеоплеер');
  await page.keyboard.press('Escape');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/contrast-audit.json', JSON.stringify(report, null, 2));
});

test('размеры текста и сетки заполненных номинаций без обрезки', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1920, 1366, 1280]) {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : width === 1366 ? 768 : 720 });
    await page.goto('/');
    for (const selector of ['.hero-description', '.category-tile p', '.site-header nav', '.hero-note', '.category-label']) {
      const sizes = await page.locator(selector).evaluateAll(els => els.map(el => parseFloat(getComputedStyle(el).fontSize)));
      expect(Math.min(...sizes), selector).toBeGreaterThanOrEqual(selector === '.hero-description' ? 18 : selector === '.category-tile p' ? 16 : 14);
    }
    for (const scene of [3, 5]) {
      await page.goto(`/present?scene=${scene}`);
      await expect(page.getByTestId('nominee-card')).toHaveCount(scene === 3 ? 8 : 10);
      const layout = await page.locator('.nominee-card').evaluateAll(cards => cards.map(card => {
        const image = card.querySelector('img')!, title = card.querySelector('h3')!;
        const c = card.getBoundingClientRect(), i = image.getBoundingClientRect(), t = title.getBoundingClientRect();
        return { cardTop: c.top, cardBottom: c.bottom, imageTop: i.top, imageBottom: i.bottom, titleTop: t.top, titleBottom: t.bottom, font: parseFloat(getComputedStyle(title).fontSize), fit: getComputedStyle(image).objectFit };
      }));
      expect(new Set(layout.map(c => Math.round(c.cardTop))).size).toBe(2);
      for (const card of layout) {
        expect(card.fit).toBe('contain');
        expect(card.imageTop).toBeGreaterThanOrEqual(card.cardTop);
        expect(card.imageBottom).toBeLessThanOrEqual(card.titleTop);
        expect(card.titleBottom).toBeLessThanOrEqual(card.cardBottom);
        expect(card.font).toBeGreaterThanOrEqual(14);
      }
    }
    for (const [scene, count] of [[7, 6], [9, 6], [11, 7], [13, 7], [15, 8]] as const) {
      await page.goto(`/present?scene=${scene}`);
      await expect(page.getByTestId('nominee-card')).toHaveCount(count);
      const overflow = await page.locator('.nominee-card').evaluateAll(cards => cards.filter(card => card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1).length);
      expect(overflow, `scene ${scene}`).toBe(0);
    }
  }
});

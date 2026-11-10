import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { awards } from '../../src/data/awards';
import { createScenes } from '../../src/data/scenes';
const sceneCount = createScenes(awards).length;

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1050);
}
async function fixture(page: Page, publish = false) {
  // Only the browser response is modified. Production config always retains null winners.
  await page.route('**/src/data/awards.ts*', async route => {
    const response = await route.fetch();
    let body = (await response.text()).replace('winner: null', 'winner: { id: "chatter-winner", name: "test_chatter", media: { src: "/assets/avatars/vip/alikgafuroff.png", alt: "Тестовая аватарка" } }');
    if (publish) body = body.replace('ceremonyPublished: false', 'ceremonyPublished: true');
    await route.fulfill({ response, body });
  });
}
test('обзор, чаттер, 8 инди-игр, 10 игр и закрытый архив', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await ready(page);
  await expect(page.locator('.category-tile')).toHaveCount(8);
  await expect(page.getByText('8 НОМИНАЦИЙ', { exact: true })).toBeVisible();
  await mkdir('artifacts/screenshots-v3', { recursive: true });
  await page.screenshot({ path: 'artifacts/screenshots-v3/01-overview.png', fullPage: true });
  await page.getByRole('link', { name: 'Итоги', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Архив церемонии пока недоступен' })).toBeVisible();
  await expect(page.locator('.result-winner')).toHaveCount(0);
  await page.goto('/present'); await ready(page);
  await page.screenshot({ path: 'artifacts/screenshots-v3/00-ceremony-cover.png' });
  await page.goto('/present?scene=3'); await ready(page);
  await expect(page.getByRole('heading', { name: 'ЧАТТЕР ГОДА' })).toBeVisible();
  await expect(page.getByTestId('nominee-card')).toHaveCount(0);
  await expect(page.getByText(/номинантов/i)).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/screenshots-v3/02-chatter.png' });
  await page.goto('/present?scene=5'); await ready(page);
  await expect(page.getByTestId('nominee-card')).toHaveCount(8);
  await expect(page.getByRole('heading', { name: 'Meccha Chameleon' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots-v3/03-indie.png' });
  await page.goto('/present?scene=7'); await ready(page);
  await expect(page.getByTestId('nominee-card')).toHaveCount(10);
  await expect(page.getByRole('heading', { name: 'Clair Obscur: Expedition 33' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots-v3/04-games.png' });
  expect(errors).toEqual([]);
});

test('ручное раскрытие, защита от пролистывания, сохранение и сброс', async ({ page }) => {
  await fixture(page);
  await page.goto('/present?scene=4'); await ready(page);
  await expect(page.getByText('test_chatter', { exact: true })).toHaveCount(0);
  await expect(page.locator('.winner-photo img')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/scene=4/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /Момент триумфа/ })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/scene=4/);
  await expect(page.getByTestId('winner-result')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'test_chatter' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await ready(page);
  await page.screenshot({ path: 'artifacts/screenshots-v3/05-winner-TEST-ONLY.png' });
  await page.reload();
  await expect(page.getByTestId('winner-result')).toBeVisible();
  await page.keyboard.press('ArrowRight'); await expect(page).toHaveURL(/scene=5/);
  await page.waitForTimeout(450); await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('winner-result')).toBeVisible();
  await page.getByRole('button', { name: 'Настройки церемонии' }).click();
  await page.getByRole('button', { name: 'Сбросить раскрытия' }).click();
  await page.getByRole('button', { name: 'Да, сбросить' }).click();
  await expect(page).toHaveURL(/scene=1/);
  await page.goto('/present?scene=4');
  await expect(page.getByTestId('winner-result')).toHaveCount(0);
});

test('пустой победитель, клавиатура, полноэкранный режим и настройки', async ({ page }) => {
  await page.goto('/present?scene=4'); await ready(page);
  await page.getByRole('button', { name: /Объявить победителя/ }).click();
  await expect(page.getByRole('status')).toContainText('Победитель не задан');
  await expect(page.getByTestId('winner-result')).toHaveCount(0);
  await page.getByRole('button', { name: 'Пропустить сцену' }).click();
  await expect(page).toHaveURL(/scene=5/);
  await page.waitForTimeout(450); await page.keyboard.press('End');
  await expect(page).toHaveURL(new RegExp(`scene=${sceneCount}`));
  await page.waitForTimeout(450); await page.keyboard.press('Home');
  await expect(page).toHaveURL(/scene=1/);
  await page.waitForTimeout(450); await page.keyboard.press('Space');
  await expect(page).toHaveURL(/scene=2/);
  await page.getByRole('button', { name: 'На весь экран', exact: false }).click();
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole('button', { name: /Выйти из полноэкранного/ }).click();
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await page.getByRole('button', { name: 'Настройки церемонии' }).click();
  await page.getByRole('checkbox').check();
  await expect(page.locator('.presentation')).toHaveClass(/low-effects/);
  await page.keyboard.press('ArrowRight'); await expect(page).toHaveURL(/scene=2/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Скрыть управление' }).click();
  await expect(page.locator('.present-footer')).toBeHidden();
  await page.getByRole('button', { name: 'Показать управление' }).click();
  await expect(page.locator('.present-footer')).toBeVisible();
});

for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1366, height: 768 }]) {
  test(`все ${sceneCount} сцен помещаются в ${size.width}×${size.height}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(size);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (let scene = 1; scene <= sceneCount; scene++) {
      await page.goto(`/present?scene=${scene}`); await ready(page);
      const metrics = await page.evaluate(() => {
        const footer = document.querySelector('.present-footer')!.getBoundingClientRect();
        const content = [...document.querySelectorAll('.scene h1, .scene h2, .scene h3, .scene p, .nominee-card, .scene .button, .program-grid')].map(el => ({ tag: el.className, bottom: el.getBoundingClientRect().bottom, right: el.getBoundingClientRect().right, left: el.getBoundingClientRect().left }));
        const grid = document.querySelector('.nominee-grid');
        return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, footerTop: footer.top, content, gridOverflow: grid ? grid.scrollHeight - grid.clientHeight : 0 };
      });
      expect(metrics.width, `scene ${scene}: горизонтальная прокрутка`).toBeLessThanOrEqual(size.width);
      expect(metrics.height, `scene ${scene}: вертикальная прокрутка`).toBeLessThanOrEqual(size.height);
      expect(metrics.gridOverflow, `scene ${scene}: внутренняя прокрутка сетки`).toBeLessThanOrEqual(1);
      for (const item of metrics.content) {
        expect(item.bottom, `scene ${scene}: ${item.tag} перекрывает футер`).toBeLessThanOrEqual(metrics.footerTop + 1);
        expect(item.right, `scene ${scene}: ${item.tag}`).toBeLessThanOrEqual(size.width);
        expect(item.left).toBeGreaterThanOrEqual(0);
      }
      expect(await page.locator('img').evaluateAll(imgs => imgs.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
      if ([5, 7].includes(scene)) {
        const cards = await page.locator('.nominee-card').evaluateAll(cards => cards.map(card => {
          const title = card.querySelector('h3')!;
          const box = card.getBoundingClientRect(), text = title.getBoundingClientRect();
          return { cardBottom: box.bottom, titleBottom: text.bottom, overflows: title.scrollWidth > title.clientWidth || title.scrollHeight > title.clientHeight, fontSize: parseFloat(getComputedStyle(title).fontSize) };
        }));
        for (const card of cards) { expect(card.overflows).toBe(false); expect(card.titleBottom).toBeLessThanOrEqual(card.cardBottom); expect(card.fontSize).toBeGreaterThanOrEqual(14); }
        await page.screenshot({ path: `artifacts/screenshots-v3/scene-${scene}-${size.width}.png` });
      }
    }
    expect(errors).toEqual([]);
  });
}

test('мобильные страницы, медиа fallback и открытый архив', async ({ page }) => {
  await fixture(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/results', '/present?scene=3', '/present?scene=5', '/present?scene=7']) {
    await page.goto(path); await ready(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    if (path.startsWith('/present')) {
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844);
      const bounds = await page.locator('.nominee-card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().bottom));
      for (const bottom of bounds) expect(bottom).toBeLessThanOrEqual(784);
    }
    if (path === '/results') await expect(page.locator('.result-winner')).toHaveCount(1);
  }
  await page.goto('/'); await ready(page);
  await page.screenshot({ path: 'artifacts/screenshots-v3/06-mobile.png', fullPage: true });
  await page.route('**/assets/nominees/game/heavyrain.webp', route => route.abort());
  await page.goto('/present?scene=7');
  await expect(page.getByRole('img', { name: 'Изображение Heavy Rain отсутствует' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Heavy Rain', exact: true })).toBeVisible();
});

test('reduced motion, повреждённое состояние, ввод в полях и история браузера', async ({ page }) => {
  await fixture(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => sessionStorage.setItem('camca63-reveals-2026', '{invalid'));
  await page.goto('/present?scene=4');
  await expect(page.getByTestId('winner-result')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('winner-result')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/scene=5/);
  await page.goBack(); await expect(page).toHaveURL(/scene=4/);
  await expect(page.getByTestId('winner-result')).toBeVisible();
  await page.evaluate(() => { const input = document.createElement('input'); input.id = 'test-editor'; document.body.append(input); input.focus(); });
  await page.keyboard.press('End');
  await expect(page).toHaveURL(/scene=4/);
});

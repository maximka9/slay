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
test('обзор, девять номинаций в новом порядке, объединённый ИРЛ и закрытый архив', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await ready(page);
  await expect(page.locator('.category-tile')).toHaveCount(9);
  await expect(page.getByText('9 НОМИНАЦИЙ', { exact: true })).toBeVisible();
  await expect(page.locator('.category-tile h3')).toHaveText(['Инди-игра года', 'Игра года', 'Ивент года', 'Лучший ИРЛ с друзьями', 'DOTA 2 — Клип года', 'Завоз от комьюнити', 'Фейл года', 'Чаттер года', 'Ваша номинация']);
  await mkdir('artifacts/screenshots-v5', { recursive: true });
  await page.screenshot({ path: 'artifacts/screenshots-v5/01-overview.png', fullPage: true });
  await page.getByRole('link', { name: 'Итоги', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Итоги CAMCA63 AWARDS 2026.*будут опубликованы после церемонии награждения/ })).toBeVisible();
  await expect(page.locator('.result-winner')).toHaveCount(0);
  await page.goto('/present'); await ready(page);
  await page.screenshot({ path: 'artifacts/screenshots-v5/00-ceremony-cover.png' });
  await page.goto('/present?scene=3'); await ready(page);
  await expect(page.getByRole('heading', { name: 'ИНДИ-ИГРА ГОДА' })).toBeVisible();
  await expect(page.getByTestId('nominee-card')).toHaveCount(8);
  await expect(page.getByRole('heading', { name: 'meccha' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots-v5/03-indie.png' });
  await page.goto('/present?scene=5'); await ready(page);
  await expect(page.getByTestId('nominee-card')).toHaveCount(10);
  await expect(page.getByRole('heading', { name: 'Clair Obscur: Expedition 33' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots-v5/04-games.png' });
  for (const [scene, count, title] of [[7, 6, 'Ивент года'], [9, 6, 'Лучший ИРЛ с друзьями'], [11, 7, 'DOTA 2 — Клип года'], [13, 7, 'Завоз от комьюнити'], [15, 8, 'Фейл года']] as const) {
    await page.goto(`/present?scene=${scene}`); await ready(page);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByTestId('nominee-card')).toHaveCount(count);
    await page.screenshot({ path: `artifacts/screenshots-v5/scene-${scene}.png` });
  }
  await page.goto('/present?scene=7'); await ready(page);
  await expect(page.getByRole('heading', { name: 'Что? Где? Когда? №1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Что? Где? Когда? №2' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Смотреть видео: Что? Где? Когда? №1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Смотреть видео: Что? Где? Когда? №2' })).toHaveCount(0);
  await page.goto('/present?scene=17'); await ready(page);
  await expect(page.getByRole('heading', { name: 'ЧАТТЕР ГОДА' })).toBeVisible();
  await expect(page.getByTestId('nominee-card')).toHaveCount(0);
  await expect(page.getByText(/номинантов/i)).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/screenshots-v5/02-chatter.png' });
  await page.goto('/present?scene=19'); await ready(page);
  await expect(page.getByRole('heading', { name: 'ВАША НОМИНАЦИЯ' })).toBeVisible();
  await expect(page.getByText('НАГРАДА, ПРИДУМАННАЯ ЗРИТЕЛЕМ')).toBeVisible();
  expect(errors).toEqual([]);
});

test('плеер показывает полный кадр и автоматически переключает только ролики номинанта', async ({ page }) => {
  await page.goto('/present?scene=5'); await ready(page);
  await page.getByRole('button', { name: 'Смотреть видео: Red Dead Redemption 2' }).click();
  const dialog = page.getByRole('dialog', { name: 'Red Dead Redemption 2' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('video')).toHaveAttribute('src', /rdr-1\.mp4$/);
  await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('video')).toHaveAttribute('src', /rdr-2\.mp4$/);
  await expect(page).toHaveURL(/scene=5/);
  await expect(page.getByRole('checkbox', { name: 'Автопереключение' })).toHaveCount(0);
  await expect(page.getByText('Пауза между роликами')).toHaveCount(0);
  await expect(page.getByText(/P авто/)).toHaveCount(0);
  await expect(dialog.locator('video')).toHaveCSS('object-fit', 'contain');
  await expect(dialog.locator('.video-stage')).toHaveAttribute('data-video-width', /\d+/);
  const fit = await dialog.evaluate(element => {
    const stage = element.querySelector('.video-stage')!.getBoundingClientRect();
    const frame = element.querySelector('.video-frame')!.getBoundingClientRect();
    const video = element.querySelector('video') as HTMLVideoElement;
    return { stage, frame, intrinsicRatio: video.videoWidth / video.videoHeight };
  });
  expect(fit.frame.left).toBeGreaterThanOrEqual(fit.stage.left - 1);
  expect(fit.frame.top).toBeGreaterThanOrEqual(fit.stage.top - 1);
  expect(fit.frame.right).toBeLessThanOrEqual(fit.stage.right + 1);
  expect(fit.frame.bottom).toBeLessThanOrEqual(fit.stage.bottom + 1);
  expect(fit.frame.width / fit.frame.height).toBeCloseTo(fit.intrinsicRatio, 2);
  await dialog.locator('video').dispatchEvent('ended');
  await expect(dialog.getByRole('status')).toContainText('СЛЕДУЮЩИЙ РОЛИК');
  await page.keyboard.press('Space');
  await page.waitForTimeout(2200);
  await expect(dialog.getByRole('status')).toContainText('СЛЕДУЮЩИЙ РОЛИК');
  await page.keyboard.press('Space');
  await expect(dialog.locator('video')).toHaveAttribute('src', /rdr-3\.mp4$/);
  await page.screenshot({ path: 'artifacts/screenshots-v5/05-video-player.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/scene=5/);
  await expect(page.getByRole('button', { name: 'Увеличить изображение: Heavy Rain' })).toHaveCount(0);
  await page.getByRole('heading', { name: 'Heavy Rain', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Heavy Rain' })).toHaveCount(0);
});

test('полный видеокадр помещается для материалов всех медиакатегорий', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const samples = [
    [3, "No, I'm Not a Human"],
    [5, 'Red Dead Redemption 2'],
    [7, 'Что? Где? Когда? №1'],
    [9, 'Монстры на каникулах в Москве'],
    [13, 'Завоз №1'],
    [11, 'Dota 2 — клип №1'],
    [15, 'Фейл №1'],
  ] as const;
  for (const [scene, name] of samples) {
    await page.goto(`/present?scene=${scene}`); await ready(page);
    await page.getByRole('button', { name: `Смотреть видео: ${name}` }).click();
    const dialog = page.getByRole('dialog', { name });
    await expect(dialog.locator('.video-stage')).toHaveAttribute('data-video-width', /\d+/);
    const geometry = await dialog.evaluate(element => {
      const header = element.querySelector('.media-dialog-header')!.getBoundingClientRect();
      const stage = element.querySelector('.video-stage')!.getBoundingClientRect();
      const frame = element.querySelector('.video-frame')!.getBoundingClientRect();
      const controls = element.querySelector('.video-controls-row')!.getBoundingClientRect();
      const video = element.querySelector('video') as HTMLVideoElement;
      return { header, stage, frame, controls, intrinsicRatio: video.videoWidth / video.videoHeight };
    });
    expect(geometry.stage.top).toBeGreaterThanOrEqual(geometry.header.bottom - 1);
    expect(geometry.stage.bottom).toBeLessThanOrEqual(geometry.controls.top + 1);
    expect(geometry.frame.left).toBeGreaterThanOrEqual(geometry.stage.left - 1);
    expect(geometry.frame.top).toBeGreaterThanOrEqual(geometry.stage.top - 1);
    expect(geometry.frame.right).toBeLessThanOrEqual(geometry.stage.right + 1);
    expect(geometry.frame.bottom).toBeLessThanOrEqual(geometry.stage.bottom + 1);
    expect(geometry.frame.width / geometry.frame.height).toBeCloseTo(geometry.intrinsicRatio, 2);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});

test('ручное раскрытие, защита от пролистывания, сохранение и сброс', async ({ page }) => {
  await fixture(page);
  await page.goto('/present?scene=18'); await ready(page);
  await expect(page.getByText('test_chatter', { exact: true })).toHaveCount(0);
  await expect(page.locator('.winner-photo img')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/scene=18/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /Момент триумфа/ })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/scene=18/);
  await expect(page.getByTestId('winner-result')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'test_chatter' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await ready(page);
  await page.screenshot({ path: 'artifacts/screenshots-v5/06-winner-TEST-ONLY.png' });
  await page.reload();
  await expect(page.getByTestId('winner-result')).toBeVisible();
  await page.keyboard.press('ArrowRight'); await expect(page).toHaveURL(/scene=19/);
  await page.waitForTimeout(450); await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('winner-result')).toBeVisible();
  await page.getByRole('button', { name: 'Настройки церемонии' }).click();
  await page.getByRole('button', { name: 'Сбросить раскрытия' }).click();
  await page.getByRole('button', { name: 'Да, сбросить' }).click();
  await expect(page).toHaveURL(/scene=1/);
  await page.goto('/present?scene=18');
  await expect(page.getByTestId('winner-result')).toHaveCount(0);
});

test('пустой победитель, клавиатура, полноэкранный режим и настройки', async ({ page }) => {
  await page.goto('/present?scene=4'); await ready(page);
  await page.getByRole('button', { name: /Объявить победителя/ }).click();
  await expect(page.getByRole('status')).toContainText('Победитель не определён');
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
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole('button', { name: /Выйти из полноэкранного/ }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
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
      if ([3, 5].includes(scene)) {
        const cards = await page.locator('.nominee-card').evaluateAll(cards => cards.map(card => {
          const title = card.querySelector('h3')!;
          const box = card.getBoundingClientRect(), text = title.getBoundingClientRect();
          return { cardBottom: box.bottom, titleBottom: text.bottom, overflows: title.scrollWidth > title.clientWidth || title.scrollHeight > title.clientHeight, fontSize: parseFloat(getComputedStyle(title).fontSize) };
        }));
        for (const card of cards) { expect(card.overflows).toBe(false); expect(card.titleBottom).toBeLessThanOrEqual(card.cardBottom); expect(card.fontSize).toBeGreaterThanOrEqual(14); }
        await page.screenshot({ path: `artifacts/screenshots-v5/scene-${scene}-${size.width}.png` });
      }
    }
    expect(errors).toEqual([]);
  });
}

test('мобильные страницы, медиа fallback и открытый архив', async ({ page }) => {
  await fixture(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/results', '/present?scene=3', '/present?scene=5', '/present?scene=9']) {
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
  await page.screenshot({ path: 'artifacts/screenshots-v5/07-mobile.png', fullPage: true });
  await page.route('**/assets/nominees/game/heavyrain.webp', route => route.abort());
  await page.goto('/present?scene=5');
  await expect(page.getByRole('img', { name: 'Изображение Heavy Rain отсутствует' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Heavy Rain', exact: true })).toBeVisible();
});

test('reduced motion, повреждённое состояние, ввод в полях и история браузера', async ({ page }) => {
  await fixture(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => sessionStorage.setItem('camca63-reveals-2026', '{invalid'));
  await page.goto('/present?scene=18');
  await expect(page.getByTestId('winner-result')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('winner-result')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/scene=19/);
  await page.goBack(); await expect(page).toHaveURL(/scene=18/);
  await expect(page.getByTestId('winner-result')).toBeVisible();
  await page.evaluate(() => { const input = document.createElement('input'); input.id = 'test-editor'; document.body.append(input); input.focus(); });
  await page.keyboard.press('End');
  await expect(page).toHaveURL(/scene=18/);
});

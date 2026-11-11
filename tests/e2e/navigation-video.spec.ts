import { expect, test, type Locator, type Page } from '@playwright/test';
import { awards } from '../../src/data/awards';

const game = awards.categories.find(category => category.id === 'game')!;
const votingData = {
  voting: { status: 'open', chatterFreeInput: false },
  nominations: [{
    id: game.id, title: game.title, description: game.intro, sortOrder: 2,
    enabled: true, canVote: true, unavailableReason: null,
    candidates: game.nominees.map((nominee, index) => ({ id: nominee.id, name: nominee.name, imageUrl: nominee.media?.src ?? null, twitchLogin: null, sortOrder: index + 1 })),
  }],
};

async function mockPublicApi(page: Page) {
  await page.route('**/api/me', route => route.fulfill({ json: { authenticated: false, isAdmin: false, user: null } }));
  await page.route('**/api/nominations', route => route.fulfill({ json: votingData }));
}

async function expectIndicatorAt(indicator: Locator, link: Locator) {
  await expect(indicator).toHaveClass(/ready/);
  await expect.poll(async () => {
    const [line, item] = await Promise.all([indicator.boundingBox(), link.boundingBox()]);
    if (!line || !item) return 999;
    return Math.max(Math.abs(line.x - item.x), Math.abs(line.width - item.width));
  }).toBeLessThanOrEqual(1);
}

async function expectCentered(dialog: Locator, viewport: { width: number; height: number }) {
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs((box!.x + box!.width / 2) - viewport.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs((box!.y + box!.height / 2) - viewport.height / 2)).toBeLessThanOrEqual(1);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
}

test('единый индикатор перемещается Главная → Голосование → Номинации → Главная', async ({ page }) => {
  await mockPublicApi(page);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });
  const indicator = nav.locator('.nav-indicator');
  await expectIndicatorAt(indicator, nav.getByRole('link', { name: 'Главная', exact: true }));

  await nav.getByRole('link', { name: 'Голосование', exact: true }).click();
  await expect(page).toHaveURL(/\/vote$/);
  await expectIndicatorAt(indicator, nav.getByRole('link', { name: 'Голосование', exact: true }));

  await nav.getByRole('link', { name: 'Номинации', exact: true }).click();
  await expect(page).toHaveURL(/\/#nominations$/);
  await expectIndicatorAt(indicator, nav.getByRole('link', { name: 'Номинации', exact: true }));
  await expect(page.locator('#nominations')).toBeInViewport();

  await nav.getByRole('link', { name: 'Главная', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expectIndicatorAt(indicator, nav.getByRole('link', { name: 'Главная', exact: true }));
});

test('видеоплеер остаётся в центре viewport и восстанавливает прокрутку и фокус', async ({ page }) => {
  await mockPublicApi(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/vote');
  const watch = page.getByRole('article').filter({ hasText: 'Resident Evil 2' }).getByRole('button', { name: 'Смотреть клип' });
  await expect(watch).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 0));
  await watch.evaluate((button: HTMLButtonElement) => button.click());
  let dialog = page.getByRole('dialog', { name: 'Resident Evil 2' });
  await expect(page.locator('body > .media-modal')).toHaveCount(1);
  await expectCentered(dialog, { width: 1920, height: 1080 });
  await dialog.getByRole('button', { name: 'Закрыть просмотр' }).click();
  await expect(dialog).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 720 });
  await watch.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  expect(scrollBefore).toBeGreaterThan(0);
  await watch.click();
  dialog = page.getByRole('dialog', { name: 'Resident Evil 2' });
  await expectCentered(dialog, { width: 1280, height: 720 });
  await expect(dialog.locator('video')).toHaveCSS('object-fit', 'contain');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await expect(watch).toBeFocused();
});

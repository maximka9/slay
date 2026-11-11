import { expect, test } from '@playwright/test';

const nomination = {
  id: 'game', title: 'Игра года', description: 'Главное игровое впечатление', sortOrder: 1,
  enabled: true, canVote: true, unavailableReason: null,
  candidates: [
    { id: 'game-1', name: 'Heavy Rain', imageUrl: '/assets/nominees/game/heavyrain.webp', twitchLogin: null, sortOrder: 1 },
    { id: 'game-3', name: 'Resident Evil 4', imageUrl: '/assets/nominees/game/re 4.jpg', twitchLogin: null, sortOrder: 2 },
  ],
};

test('авторизованный зритель выбирает и меняет голос без перезагрузки', async ({ page }) => {
  const choices: string[] = [];
  await page.route('**/api/me', route => route.fulfill({ json: { authenticated: true, isAdmin: false, csrfToken: 'csrf-test', user: { twitchUserId: '42', login: 'viewer', displayName: 'Viewer', avatarUrl: '', twitchCreatedAt: '2020-01-01T00:00:00Z', firstSeenAt: '2026-11-11T00:00:00Z' } } }));
  await page.route('**/api/nominations', route => route.fulfill({ json: { voting: { status: 'open', chatterFreeInput: false }, nominations: [nomination] } }));
  await page.route('**/api/my-votes', route => route.fulfill({ json: { votes: [] } }));
  await page.route('**/api/my-custom-award', route => route.fulfill({ json: { proposal: null } }));
  await page.route('**/api/votes/game', async route => {
    const body = route.request().postDataJSON() as { candidateId: string };
    choices.push(body.candidateId);
    expect(route.request().headers()['x-csrf-token']).toBe('csrf-test');
    await route.fulfill({ json: { vote: { nominationId: 'game', candidateId: body.candidateId, candidateName: '', updatedAt: '2026-11-11T00:00:00Z', status: 'valid' } } });
  });

  await page.goto('/vote');
  await expect(page.getByText('ГОЛОСОВАНИЕ ОТКРЫТО')).toBeVisible();
  await expect(page.getByRole('button', { name: /Heavy Rain/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Смотреть клип' })).toHaveCount(1);
  await page.getByRole('article').filter({ hasText: 'Heavy Rain' }).getByRole('button', { name: 'Выбрать' }).click();
  await expect(page.getByText('Голос в номинации «Игра года» сохранён.')).toBeVisible();
  await page.getByRole('article').filter({ hasText: 'Resident Evil 4' }).getByRole('button', { name: 'Выбрать' }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Resident Evil 4' }).getByRole('button', { name: 'Мой голос' })).toBeVisible();
  expect(choices).toEqual(['game-1', 'game-3']);
});

test('прогресс учитывает только действительные голоса в активных номинациях', async ({ page }) => {
  await page.route('**/api/me', route => route.fulfill({ json: { authenticated: true, isAdmin: false, csrfToken: 'csrf-test', user: { twitchUserId: '42', login: 'viewer', displayName: 'Viewer', avatarUrl: '', twitchCreatedAt: '2020-01-01T00:00:00Z', firstSeenAt: '2026-11-11T00:00:00Z' } } }));
  await page.route('**/api/nominations', route => route.fulfill({ json: {
    voting: { status: 'open', chatterFreeInput: false },
    nominations: [nomination, { id: 'custom-award', title: 'Ваша номинация', description: 'Придумайте награду', sortOrder: 9, enabled: true, canVote: true, unavailableReason: null, candidates: [] }],
  } }));
  await page.route('**/api/my-votes', route => route.fulfill({ json: { votes: [
    { nominationId: 'game', candidateId: 'game-1', candidateName: 'Heavy Rain', updatedAt: '2026-11-11T00:00:00Z', status: 'excluded' },
    { nominationId: 'meme', candidateId: 'meme-1', candidateName: 'Архивный мем', updatedAt: '2026-11-11T00:00:00Z', status: 'valid' },
  ] } }));
  await page.route('**/api/my-custom-award', route => route.fulfill({ json: { proposal: { awardTitle: 'Исключённая награда', recipient: 'viewer', status: 'excluded', updatedAt: '2026-11-11T00:00:00Z' } } }));

  await page.goto('/vote');
  await expect(page.getByText('Заполнено 0 из 2 номинаций')).toBeVisible();
});

test('ошибка необязательного обновления не отменяет подтверждение сохранённого голоса', async ({ page }) => {
  let refreshShouldFail = false;
  await page.route('**/api/me', route => route.fulfill({ json: { authenticated: true, isAdmin: false, csrfToken: 'csrf-test', user: { twitchUserId: '42', login: 'viewer', displayName: 'Viewer', avatarUrl: '', twitchCreatedAt: '2020-01-01T00:00:00Z', firstSeenAt: '2026-11-11T00:00:00Z' } } }));
  await page.route('**/api/nominations', route => {
    return refreshShouldFail
      ? route.fulfill({ status: 503, json: { error: 'refresh_failed', message: 'Не удалось обновить список.' } })
      : route.fulfill({ json: { voting: { status: 'open', chatterFreeInput: false }, nominations: [nomination] } });
  });
  await page.route('**/api/my-votes', route => route.fulfill({ json: { votes: [] } }));
  await page.route('**/api/my-custom-award', route => route.fulfill({ json: { proposal: null } }));
  await page.route('**/api/votes/game', route => route.fulfill({ json: { vote: { nominationId: 'game', candidateId: 'game-1', candidateName: 'Heavy Rain', updatedAt: '2026-11-11T00:00:00Z', status: 'valid' } } }));

  await page.goto('/vote');
  await expect(page.getByText('ГОЛОСОВАНИЕ ОТКРЫТО')).toBeVisible();
  refreshShouldFail = true;
  await page.getByRole('article').filter({ hasText: 'Heavy Rain' }).getByRole('button', { name: 'Выбрать' }).click();
  await expect(page.getByText('Голос в номинации «Игра года» сохранён.')).toBeVisible();
  await expect(page.locator('.vote-message.error')).toHaveCount(0);
  await expect(page.getByRole('article').filter({ hasText: 'Heavy Rain' }).getByRole('button', { name: 'Мой голос' })).toBeVisible();
});

test('после ошибки загрузки номинации можно запросить повторно', async ({ page }) => {
  let allowSuccess = false;
  let nominationRequests = 0;
  await page.route('**/api/me', route => route.fulfill({ json: { authenticated: false, isAdmin: false, user: null } }));
  await page.route('**/api/nominations', route => {
    nominationRequests += 1;
    return allowSuccess
      ? route.fulfill({ json: { voting: { status: 'open', chatterFreeInput: false }, nominations: [nomination] } })
      : route.fulfill({ status: 503, json: { error: 'temporarily_unavailable', message: 'Номинации временно недоступны.' } });
  });

  await page.goto('/vote');
  await expect(page.getByRole('heading', { name: 'НЕ УДАЛОСЬ ЗАГРУЗИТЬ' })).toBeVisible();
  allowSuccess = true;
  await page.getByRole('button', { name: 'ПОВТОРИТЬ ЗАГРУЗКУ' }).click();
  await expect(page.getByText('ГОЛОСОВАНИЕ ОТКРЫТО')).toBeVisible();
  expect(nominationRequests).toBeGreaterThanOrEqual(2);
});

test('плеер показывает актуальное имя кандидата из API', async ({ page }) => {
  const renamed = { ...nomination, candidates: [{ ...nomination.candidates[1], name: 'Resident Evil 4 — новое имя' }] };
  await page.route('**/api/me', route => route.fulfill({ json: { authenticated: false, isAdmin: false, user: null } }));
  await page.route('**/api/nominations', route => route.fulfill({ json: { voting: { status: 'open', chatterFreeInput: false }, nominations: [renamed] } }));

  await page.goto('/vote');
  const card = page.getByRole('article').filter({ hasText: 'Resident Evil 4 — новое имя' });
  await card.getByRole('button', { name: 'Смотреть клип' }).click();
  await expect(page.getByRole('dialog', { name: 'Resident Evil 4 — новое имя' })).toBeVisible();
});

test('серверная причина блокирует категорию независимо от часов браузера', async ({ page }) => {
  await page.route('**/api/me', route => route.fulfill({ json: { authenticated: true, isAdmin: false, csrfToken: 'csrf-test', user: { twitchUserId: '42', login: 'viewer', displayName: 'Viewer', avatarUrl: '', twitchCreatedAt: '2020-01-01T00:00:00Z', firstSeenAt: '2026-11-11T00:00:00Z' } } }));
  await page.route('**/api/nominations', route => route.fulfill({ json: {
    voting: { status: 'open', chatterFreeInput: false },
    nominations: [{ ...nomination, canVote: false, unavailableReason: 'Номинация ещё не готова к голосованию.' }],
  } }));
  await page.route('**/api/my-votes', route => route.fulfill({ json: { votes: [] } }));
  await page.route('**/api/my-custom-award', route => route.fulfill({ json: { proposal: null } }));

  await page.goto('/vote');
  await expect(page.getByText('Номинация ещё не готова к голосованию.')).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: 'Heavy Rain' }).getByRole('button', { name: 'Выбрать' })).toBeDisabled();
});

test('зритель сохраняет и обновляет собственную номинацию', async ({ page }) => {
  const saved: Array<{ awardTitle: string; recipient: string }> = [];
  await page.route('**/api/me', route => route.fulfill({ json: { authenticated: true, isAdmin: false, csrfToken: 'csrf-test', user: { twitchUserId: '42', login: 'viewer', displayName: 'Viewer', avatarUrl: '', twitchCreatedAt: '2020-01-01T00:00:00Z', firstSeenAt: '2026-11-11T00:00:00Z' } } }));
  await page.route('**/api/nominations', route => route.fulfill({ json: { voting: { status: 'open', chatterFreeInput: false }, nominations: [{ id: 'custom-award', title: 'Ваша номинация', description: 'Придумайте награду', sortOrder: 9, enabled: true, canVote: true, unavailableReason: null, candidates: [] }] } }));
  await page.route('**/api/my-votes', route => route.fulfill({ json: { votes: [] } }));
  await page.route('**/api/my-custom-award', route => route.fulfill({ json: { proposal: null } }));
  await page.route('**/api/custom-award', async route => {
    saved.push(route.request().postDataJSON() as { awardTitle: string; recipient: string });
    expect(route.request().headers()['x-csrf-token']).toBe('csrf-test');
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto('/vote');
  await page.getByLabel('Название награды').fill('Легендарный камбэк года');
  await page.getByLabel('Кому вручить').fill('viewer');
  await page.getByRole('button', { name: 'СОХРАНИТЬ ПРЕДЛОЖЕНИЕ' }).click();
  await expect(page.getByText('Предложение сохранено. До закрытия голосования его можно изменить.')).toBeVisible();
  await page.getByLabel('Кому вручить').fill('viewer_2');
  await page.getByRole('button', { name: 'ОБНОВИТЬ ПРЕДЛОЖЕНИЕ' }).click();
  expect(saved).toEqual([
    { awardTitle: 'Легендарный камбэк года', recipient: 'viewer' },
    { awardTitle: 'Легендарный камбэк года', recipient: 'viewer_2' },
  ]);
});

test('обычному Twitch-пользователю закрыта админ-панель', async ({ page }) => {
  await page.route('**/api/me', route => route.fulfill({ json: { authenticated: true, isAdmin: false, csrfToken: 'csrf-test', user: { twitchUserId: '42', login: 'viewer', displayName: 'Viewer', avatarUrl: '', twitchCreatedAt: '2020-01-01T00:00:00Z', firstSeenAt: '2026-11-11T00:00:00Z' } } }));
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /ДОСТУП ЗАКРЫТ/ })).toBeVisible();
  await expect(page.getByText('Этот Twitch ID не входит в список администраторов.')).toBeVisible();
});

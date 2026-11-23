import { expect, test } from '@playwright/test';

const candidates = Array.from({ length: 5 }, (_, index) => ({
  nominationId: 'game', nominationTitle: 'Игра года', candidateId: `game-${index + 1}`,
  candidateName: `Игра ${index + 1}`, imageUrl: '', voteCount: index === 0 ? 1 : 0,
}));

test('админ запускает репетицию, видит причины блокировки и раскрывает компактные таблицы', async ({ page }) => {
  let ceremonyReady = false;
  let overviewRequests = 0;
  let voteRequests = 0;
  await page.route('**/api/me', route => route.fulfill({ json: {
    authenticated: true, isAdmin: true, csrfToken: 'csrf-admin',
    user: { twitchUserId: '1', login: 'camca63', displayName: 'camca63', avatarUrl: '', twitchCreatedAt: '2020-01-01T00:00:00Z', firstSeenAt: '2026-01-01T00:00:00Z' },
  } }));
  await page.route('**/api/admin/overview', route => { overviewRequests += 1; return route.fulfill({ json: {
    counts: { users: 5, validVotes: 40, excludedVotes: 1 }, recent: { recentUsers: 2 }, lastVote: { lastVoteAt: '2026-11-11T15:00:00Z' },
    nominations: [{ id: 'game', title: 'Игра года', votes: 5, validVotes: 5 }], settings: { voting_status: 'closed' },
  } }); });
  await page.route('**/api/admin/votes?*', route => { voteRequests += 1; return route.fulfill({ json: { votes: [], pagination: { page: 1, limit: 100, total: 0, pages: 1 } } }); });
  await page.route('**/api/admin/results', route => route.fulfill({ json: {
    snapshot: { id: 'snapshot-test', revision: 1, status: 'final', created_at: '2026-11-11T00:00:00Z' }, dirty: true,
    entries: candidates.map((item, index) => ({ ...item, rank: index === 0 ? 1 : 2, isWinner: index === 0 ? 1 : 0, isTie: 0, published: 0 })),
    liveEntries: candidates.map((item, index) => ({ ...item, percent: 30 - index * 3 })), customAward: null,
    readiness: ceremonyReady
      ? { ready: true, problems: [] }
      : { ready: false, problems: [{ nominationId: 'custom-award', nominationTitle: 'Ваша номинация', code: 'custom_award_selection_missing', message: 'Ваша номинация: выберите предложение для вручения.' }] },
  } }));
  await page.route('**/api/nominations', route => route.fulfill({ json: { voting: { status: 'closed', chatterFreeInput: true }, nominations: [{ id: 'game', title: 'Игра года', description: '', sortOrder: 1, enabled: true, canVote: false, unavailableReason: 'Голосование закрыто.', candidates: [] }] } }));
  await page.route('**/api/admin/candidates', route => route.fulfill({ json: { candidates: [
    { id: 'chatter-9', nominationId: 'chatter', name: 'Troll', twitchLogin: 'troll', enabled: 1, validVotes: 1, totalVotes: 1 },
  ] } }));
  let hideRequests = 0;
  await page.route('**/api/admin/candidates/chatter-9', route => { hideRequests++; return route.fulfill({ status: 500, json: { error: 'Ник не снят' } }); });
  await page.route('**/api/admin/custom-awards?*', route => route.fulfill({ json: { proposals: [], customAwardPublished: false, pagination: { page: 1, limit: 200, total: 0, pages: 1 } } }));
  await page.route('**/api/admin/actions?*', route => {
    const url = new URL(route.request().url());
    const limit = Number(url.searchParams.get('limit'));
    const pageNumber = Number(url.searchParams.get('page'));
    const count = pageNumber === 2 ? 5 : limit;
    const actions = Array.from({ length: count }, (_, index) => ({
      id: (pageNumber - 1) * limit + index + 1, action: index === 0 ? 'results_no_winner' : 'voting_closed', target_user_id: null, reason: null, comment: null,
      details: '{}', created_at: `2026-11-11T${String(15 - index).padStart(2, '0')}:00:00Z`, admin_twitch_user_id: '1', adminLogin: 'camca63', adminDisplayName: 'camca63',
    }));
    return route.fulfill({ json: { actions, pagination: { page: pageNumber, limit, total: 30, pages: Math.ceil(30 / limit) } } });
  });

  await page.goto('/admin');
  await expect(page.getByRole('link', { name: /Начать репетицию/ }).first()).toHaveAttribute('href', '/present?rehearsal=1');
  await expect(page.getByRole('button', { name: /Начать церемонию — недоступно/ })).toBeDisabled();
  await expect(page.getByText('Ваша номинация: выберите предложение для вручения.').first()).toBeVisible();
  await expect(page.getByText('УСТАРЕВШИЙ СНИМОК — НЕ ИСПОЛЬЗОВАТЬ ДЛЯ ЦЕРЕМОНИИ')).toBeVisible();
  await expect(page.getByText(/АРХИВНЫЙ ЛИДЕР/)).toBeVisible();
  await expect(page.getByText(/ПОБЕДИТЕЛЬ/)).toHaveCount(0);
  await expect(page.getByText(/Последний учтённый голос:/)).toBeVisible();

  const finalResults = page.locator('#final-results');
  await expect(finalResults.locator('.result-bar')).toHaveCount(3);
  await finalResults.getByRole('button', { name: 'Показать всех 5' }).click();
  await expect(finalResults.locator('.result-bar')).toHaveCount(5);
  await finalResults.getByRole('button', { name: 'Свернуть' }).click();
  await expect(finalResults.locator('.result-bar')).toHaveCount(3);

  const liveResults = page.locator('#live-results');
  await expect(liveResults.locator('.result-bar')).toHaveCount(3);
  await liveResults.getByRole('button', { name: 'Показать всех 5' }).click();
  await expect(liveResults.locator('.result-bar')).toHaveCount(5);
  await expect(page.locator('.admin-section').last().getByRole('heading', { name: 'ПРОМЕЖУТОЧНЫЕ РЕЗУЛЬТАТЫ' })).toBeVisible();

  const overviewBeforeSearch = overviewRequests;
  const votesBeforeSearch = voteRequests;
  await page.getByPlaceholder('Ник или Twitch ID').fill('viewer');
  await expect.poll(() => voteRequests).toBeGreaterThan(votesBeforeSearch);
  expect(overviewRequests).toBe(overviewBeforeSearch);

  await page.locator('.chatter-admin-list').getByRole('button', { name: 'Снять' }).click();
  const confirmDialog = page.getByRole('dialog', { name: 'Снять @troll с номинации?' });
  await expect(confirmDialog).toContainText('Результаты будут помечены неактуальными.');
  await confirmDialog.getByRole('button', { name: 'Снять' }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect.poll(() => hideRequests).toBe(1);

  const audit = page.locator('.admin-section').filter({ has: page.getByRole('heading', { name: 'ЖУРНАЛ ДЕЙСТВИЙ' }) });
  await expect(audit.locator('.audit-list article')).toHaveCount(3);
  await expect(audit.getByText('Для номинации выбран статус «Без победителя»').first()).toBeVisible();
  await audit.getByRole('button', { name: 'Показать все события' }).click();
  await expect(audit.locator('.audit-list article')).toHaveCount(25);
  await audit.getByRole('button', { name: 'Следующая →' }).click();
  await expect(audit.getByText(/Страница 2 из 2/)).toBeVisible();

  ceremonyReady = true;
  await page.reload();
  await expect(page.getByRole('link', { name: /Начать церемонию/ }).first()).toHaveAttribute('href', '/present');
});

test('исключение голоса: модальное окно с причиной и тёмные кнопки модерации', async ({ page }) => {
  const sent: Array<{ url: string; body: unknown }> = [];
  const vote = {
    id: 7, nominationId: 'game', nominationTitle: 'Игра года', candidateId: 'game-1', candidateName: 'Игра 1',
    twitchUserId: '555', login: 'viewer', displayName: 'Viewer', avatarUrl: '', twitchCreatedAt: '2020-01-01T00:00:00Z',
    firstSeenAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-11T00:00:00Z', status: 'valid',
  };
  await page.route('**/api/me', route => route.fulfill({ json: {
    authenticated: true, isAdmin: true, csrfToken: 'csrf-admin',
    user: { twitchUserId: '1', login: 'camca63', displayName: 'camca63', avatarUrl: '', twitchCreatedAt: '2020-01-01T00:00:00Z', firstSeenAt: '2026-01-01T00:00:00Z' },
  } }));
  await page.route('**/api/admin/overview', route => route.fulfill({ json: {
    counts: { users: 1, validVotes: 1, excludedVotes: 0 }, recent: { recentUsers: 1 }, lastVote: { lastVoteAt: null },
    nominations: [{ id: 'game', title: 'Игра года', votes: 1, validVotes: 1 }], settings: { voting_status: 'open' },
  } }));
  await page.route('**/api/admin/votes?*', route => route.fulfill({ json: { votes: [vote], pagination: { page: 1, limit: 100, total: 1, pages: 1 } } }));
  await page.route('**/api/admin/results', route => route.fulfill({ status: 500, json: { error: 'Сбой результатов' } }));
  await page.route('**/api/nominations', route => route.fulfill({ json: { voting: { status: 'open', chatterFreeInput: true }, nominations: [] } }));
  await page.route('**/api/admin/candidates', route => route.fulfill({ json: { candidates: [
    { id: 'chatter-2', nominationId: 'chatter', name: 'Second', twitchLogin: 'second', enabled: 1, validVotes: 2, totalVotes: 2 },
    { id: 'chatter-1', nominationId: 'chatter', name: 'First', twitchLogin: 'first', enabled: 1, validVotes: 5, totalVotes: 5 },
    { id: 'chatter-3', nominationId: 'chatter', name: 'Banned', twitchLogin: 'banned', enabled: 0, validVotes: 0, totalVotes: 0 },
    // Ник, за который никто сейчас не голосует (зритель передумал), в списке не показывается.
    { id: 'chatter-4', nominationId: 'chatter', name: 'Empty', twitchLogin: 'empty_nick', enabled: 1, validVotes: 0, totalVotes: 0 },
  ] } }));
  await page.route('**/api/admin/custom-awards?*', route => route.fulfill({ json: { proposals: [], customAwardPublished: false } }));
  await page.route('**/api/admin/actions?*', route => route.fulfill({ json: { actions: [], pagination: { page: 1, limit: 3, total: 0, pages: 1 } } }));
  await page.route('**/api/admin/votes/7/exclude', async route => {
    sent.push({ url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({ json: { ok: true, status: 'excluded' } });
  });

  await page.goto('/admin');
  // Падение одного блока не роняет всю панель
  await expect(page.locator('.admin-load-failure')).toContainText('результаты');
  // «Чаттер года»: ники по убыванию голосов, переключателя свободного ввода больше нет
  await expect(page.getByRole('button', { name: /Свободный ввод ника/ })).toHaveCount(0);
  await expect(page.locator('.chatter-admin-list article')).toHaveCount(3);
  await expect(page.locator('.chatter-admin-list article').first()).toContainText('@first');
  await expect(page.locator('.chatter-admin-list article').first()).toContainText('5 голосов');
  await expect(page.locator('.chatter-admin-list article').nth(1)).toContainText('2 голоса');
  await expect(page.locator('.chatter-admin-list article').nth(2)).toContainText('снят');
  await expect(page.locator('.chatter-admin-list')).not.toContainText('@empty_nick');

  const exclude = page.getByRole('button', { name: 'Один: исключить' });
  await expect(exclude).toBeVisible();
  const background = await exclude.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(background).toBe('rgb(24, 27, 38)');

  await exclude.click();
  const dialog = page.getByRole('dialog', { name: 'Исключить голос Viewer?' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Причина').selectOption('Твинк / новый аккаунт');
  await dialog.getByLabel('Комментарий (необязательно)').fill('аккаунт создан вчера');
  await dialog.getByRole('button', { name: 'Исключить' }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].body).toEqual({ reason: 'Твинк / новый аккаунт', comment: 'аккаунт создан вчера' });

  // Esc закрывает окно без запроса
  await page.getByRole('button', { name: 'Все: исключить' }).click();
  const allDialog = page.getByRole('dialog', { name: 'Исключить все голоса Viewer?' });
  await expect(allDialog.getByLabel('Также исключить его предложение в «Вашей номинации»')).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(allDialog).toHaveCount(0);
  expect(sent).toHaveLength(1);
});

import { expect, test } from '@playwright/test';

const candidates = Array.from({ length: 5 }, (_, index) => ({
  nominationId: 'game', nominationTitle: 'Игра года', candidateId: `game-${index + 1}`,
  candidateName: `Игра ${index + 1}`, imageUrl: '', voteCount: 10 - index,
}));

test('админ запускает репетицию, видит причины блокировки и раскрывает компактные таблицы', async ({ page }) => {
  let ceremonyReady = false;
  await page.route('**/api/me', route => route.fulfill({ json: {
    authenticated: true, isAdmin: true, csrfToken: 'csrf-admin',
    user: { twitchUserId: '1', login: 'camca63', displayName: 'camca63', avatarUrl: '', twitchCreatedAt: '2020-01-01T00:00:00Z', firstSeenAt: '2026-01-01T00:00:00Z' },
  } }));
  await page.route('**/api/admin/overview', route => route.fulfill({ json: {
    counts: { users: 5, validVotes: 40, excludedVotes: 1 }, recent: { recentUsers: 2 }, lastVote: { lastVoteAt: null },
    nominations: [{ id: 'game', title: 'Игра года', votes: 5, validVotes: 5 }], settings: { voting_status: 'closed' },
  } }));
  await page.route('**/api/admin/votes?*', route => route.fulfill({ json: { votes: [], pagination: { page: 1, limit: 100, total: 0, pages: 1 } } }));
  await page.route('**/api/admin/results', route => route.fulfill({ json: {
    snapshot: { id: 'snapshot-test', revision: 1, status: 'final', created_at: '2026-11-11T00:00:00Z' }, dirty: false,
    entries: candidates.map((item, index) => ({ ...item, rank: index + 1, isWinner: index === 0 ? 1 : 0, isTie: 0, published: 0 })),
    liveEntries: candidates.map((item, index) => ({ ...item, percent: 30 - index * 3 })), customAward: null,
    readiness: ceremonyReady
      ? { ready: true, problems: [] }
      : { ready: false, problems: [{ nominationId: 'custom-award', nominationTitle: 'Ваша номинация', code: 'custom_award_selection_missing', message: 'Ваша номинация: выберите предложение для вручения.' }] },
  } }));
  await page.route('**/api/nominations', route => route.fulfill({ json: { voting: { status: 'closed', chatterFreeInput: false }, nominations: [{ id: 'game', title: 'Игра года', description: '', sortOrder: 1, enabled: true, canVote: false, unavailableReason: 'Голосование закрыто.', candidates: [] }] } }));
  await page.route('**/api/admin/candidates', route => route.fulfill({ json: { candidates: [] } }));
  await page.route('**/api/admin/custom-awards?*', route => route.fulfill({ json: { proposals: [], customAwardPublished: false, pagination: { page: 1, limit: 200, total: 0, pages: 1 } } }));
  await page.route('**/api/admin/actions?*', route => {
    const url = new URL(route.request().url());
    const limit = Number(url.searchParams.get('limit'));
    const pageNumber = Number(url.searchParams.get('page'));
    const count = pageNumber === 2 ? 5 : limit;
    const actions = Array.from({ length: count }, (_, index) => ({
      id: (pageNumber - 1) * limit + index + 1, action: 'voting_closed', target_user_id: null, reason: null, comment: null,
      details: '{}', created_at: `2026-11-11T${String(15 - index).padStart(2, '0')}:00:00Z`, admin_twitch_user_id: '1', adminLogin: 'camca63', adminDisplayName: 'camca63',
    }));
    return route.fulfill({ json: { actions, pagination: { page: pageNumber, limit, total: 30, pages: Math.ceil(30 / limit) } } });
  });

  await page.goto('/admin');
  await expect(page.getByRole('link', { name: /Начать репетицию/ }).first()).toHaveAttribute('href', '/present?rehearsal=1');
  await expect(page.getByRole('button', { name: /Начать церемонию — недоступно/ })).toBeDisabled();
  await expect(page.getByText('Ваша номинация: выберите предложение для вручения.').first()).toBeVisible();

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

  const audit = page.locator('.admin-section').filter({ has: page.getByRole('heading', { name: 'ЖУРНАЛ ДЕЙСТВИЙ' }) });
  await expect(audit.locator('.audit-list article')).toHaveCount(3);
  await audit.getByRole('button', { name: 'Показать все события' }).click();
  await expect(audit.locator('.audit-list article')).toHaveCount(25);
  await audit.getByRole('button', { name: 'Следующая →' }).click();
  await expect(audit.getByText(/Страница 2 из 2/)).toBeVisible();

  ceremonyReady = true;
  await page.reload();
  await expect(page.getByRole('link', { name: /Начать церемонию/ }).first()).toHaveAttribute('href', '/present');
});

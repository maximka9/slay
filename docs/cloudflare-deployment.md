# Развёртывание CAMCA63 AWARDS 2026

Проект рассчитан на Cloudflare Pages, Pages Functions и D1. Исходный код не содержит рабочих Twitch-секретов, а `wrangler.jsonc` содержит нулевой заполнитель `database_id`. Публичный сайт появится только после настройки аккаунтов и развёртывания.

## 1. Twitch-приложение

1. Войдите в [Twitch Developer Console](https://dev.twitch.tv/console/apps) под владельцем канала.
2. Создайте приложение типа **Website Integration**.
3. Для локальной разработки добавьте OAuth Redirect URL `http://127.0.0.1:8788/api/auth/callback`.
4. После создания Pages-проекта добавьте второй URL: `https://<домен-сайта>/api/auth/callback`.
5. Сохраните Client ID и создайте Client Secret. Secret нельзя добавлять в Git или во фронтенд.
6. Узнайте постоянный Twitch User ID аккаунта `camca63`, например авторизовавшись через API Users. Именно числовой ID, а не изменяемый логин, задаётся как `ADMIN_TWITCH_USER_ID`.

OAuth использует Authorization Code Flow. Callback проверяет одноразовый `state`, обменивает код на сервере, валидирует токен и читает профиль через Twitch Helix. Токен Twitch после входа в D1 не сохраняется.

## 2. D1

После `npm ci` авторизуйте Wrangler и создайте базу:

```powershell
npx wrangler login
npx wrangler d1 create camca63-awards-2026
```

Скопируйте выданный `database_id` вместо `00000000-0000-0000-0000-000000000000` в `wrangler.jsonc`, затем примените миграции:

```powershell
npm run db:migrate:remote
```

Миграции создают таблицы пользователей, номинаций, кандидатов, голосов, истории изменений, сессий, OAuth state, rate limit, аудита и снимков результатов. Вторая миграция архивирует прежние категории 05 и 07 вместе с их голосами, не переносит эти голоса в новые номинации и добавляет активные «DOTA 2 — Клип года» и «Фейл года». После применения проверьте отчёт:

```powershell
npx wrangler d1 execute camca63-awards-2026 --remote --command "SELECT * FROM migration_reports WHERE id='0002-dota-fail'"
```

Поля `old_clip_votes` и `old_rage_votes` показывают число сохранённых исторических голосов. В публичном списке остаются ровно 9 активных номинаций и 51 кандидат.

## 3. Видео в R2

[Cloudflare Pages принимает отдельный статический файл размером не более 25 MiB](https://developers.cloudflare.com/pages/platform/limits/). В текущем наборе 12 из 60 MP4 превышают этот предел, поэтому production-сборка должна получать видео с R2.

Создайте bucket и загрузите подготовленные файлы с сохранением путей `assets/...`:

```powershell
npx wrangler r2 bucket create camca63-awards-media
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/upload-media-r2.ps1 -Bucket camca63-awards-media
```

Подключите к bucket пользовательский домен, например `media.example.com`, и [разрешите методы `GET` и `HEAD` в CORS](https://developers.cloudflare.com/r2/buckets/cors/) для точного домена сайта. Для [кэширования R2 используйте пользовательский домен](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/). Затем добавьте в build variables Pages:

```text
VITE_MEDIA_BASE_URL=https://media.example.com
```

При заданной переменной ссылки на ролики получают этот префикс, а Vite исключает все MP4 из `dist`. Локальная сборка без переменной продолжает включать ролики для автономной проверки. Отчёт `artifacts/media-preparation-v7.json` фиксирует кодеки, длительность, размер и совместимость каждого файла с Pages.

## 4. Cloudflare Pages из GitHub

1. Убедитесь, что репозиторий `maximka9/slay` содержит актуальную ветку `main`.
2. В Cloudflare Dashboard откройте **Workers & Pages → Create → Pages → Connect to Git** и выберите репозиторий.
3. Укажите production branch `main`, build command `npm run build`, output directory `dist`.
4. В настройках Pages откройте **Settings → Bindings → D1 database bindings**. Добавьте binding с именем `DB` и выберите `camca63-awards-2026` для Preview и Production.
5. В **Settings → Variables and Secrets** добавьте зашифрованные Production secrets и build variable R2:

| Имя | Значение |
|---|---|
| `TWITCH_CLIENT_ID` | Client ID Twitch-приложения |
| `TWITCH_CLIENT_SECRET` | Client Secret Twitch-приложения |
| `TWITCH_REDIRECT_URI` | `https://<домен>/api/auth/callback` |
| `SESSION_SECRET` | случайная строка не короче 32 байт |
| `ADMIN_TWITCH_USER_ID` | постоянный числовой Twitch ID `camca63` |
| `ENVIRONMENT` | `production` |
| `VITE_MEDIA_BASE_URL` | публичный HTTPS-домен R2 без завершающего `/` |

Сгенерировать подходящий session secret локально можно командой `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Его вывод не следует сохранять в истории репозитория.

6. Запустите deployment. После выдачи HTTPS-адреса добавьте точный callback URL в Twitch Developer Console и обновите `TWITCH_REDIRECT_URI`, если домен изменился.
7. Проверьте вход обычным аккаунтом, голос и изменение голоса. Затем войдите `camca63`, проверьте `/admin`, закройте голосование и выполните тестовую фиксацию. Не публикуйте тестовый снимок в рабочей базе.

При необходимости прямой выпуск без Git integration выполняется командой `npx wrangler pages deploy dist --project-name camca63-awards-2026` после `npm run build`, но постоянный проект удобнее связать с GitHub.

## 5. Локальная разработка

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev:cloudflare
```

Заполните `.dev.vars` локальными значениями. Этот файл исключён из Git. D1 хранится в `.wrangler/state`, которая также исключена.

Полная проверка:

```powershell
npm test
npm run test:api
npm run typecheck:functions
npm run build
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run test:e2e
npm run test:production
```

## 6. Эксплуатация

Статусы **Подготовка**, **Открыто** и **Закрыто** меняются в `/admin`. Глобальный статус и статусы отдельных категорий независимы: повторное глобальное открытие не переоткрывает закрытую категорию. Для массового изменения есть отдельные кнопки «Открыть все номинации» и «Закрыть все». API рассчитывает `canVote` по глобальному статусу, статусу категории, обоим UTC-расписаниям и серверному времени; браузер только показывает готовый результат и причину блокировки. Время в форме вводится в выбранном часовом поясе и сохраняется как UTC ISO 8601.

Перед закрытием и перед публикацией создайте экспорт D1:

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
npm run db:backup
```

Папка `backups/` исключена из Git. Храните файл в закрытом месте. CSV по номинации, всем действительным голосам, исключённым голосам и итогам доступен только в `/admin`.

Схема публикации: закрыть голосование → проверить и при необходимости исключить голоса → зафиксировать снимок → разрешить все ничьи с основанием → для пустых номинаций явно выбрать «Без победителя» → убедиться, что блок готовности зелёный → провести церемонию через `/present` → публиковать отдельные категории или все результаты. Любое последующее изменение голосов или кандидатов помечает снимок устаревшим, скрывает старые публичные результаты и требует повторной фиксации. Репетиция запускается через `/present?rehearsal=1` и не загружает реальные результаты.

## 7. Персональные данные и удаление

Хранятся Twitch User ID, логин, отображаемое имя, аватар, дата создания Twitch-аккаунта, даты участия и выборы. Email и полный IP не собираются. Сессионные cookie имеют `HttpOnly`, `SameSite=Lax` и `Secure` на HTTPS; в D1 находится только хеш идентификатора сессии.

После премии сначала создайте резервную копию и убедитесь, что финальный снимок опубликован. Скрипт `scripts/anonymize-after-awards.sql` удаляет сессии, OAuth state, rate-limit записи, индивидуальные голоса и пользователей, очищает персональные поля аудита, но сохраняет агрегированные снимки и опубликованные результаты:

```powershell
npx wrangler d1 execute camca63-awards-2026 --remote --file scripts/anonymize-after-awards.sql
```

Команда необратима для рабочей базы, поэтому её запускают вручную только после проверки резервной копии.

Голоса ограничиваются по хешу постоянного Twitch User ID, поэтому смена сессии не обходит лимит. OAuth endpoints ограничиваются по необратимому солёному хешу сетевого сигнала; исходный IP в D1 не записывается. Старые rate-limit окна удаляются пакетно.

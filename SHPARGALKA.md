# Шпаргалка по проекту donation-race

## Ссылки

- **Игра (продакшн):** https://donation-race-production.up.railway.app/
- **Arena 2:** https://donation-race-production.up.railway.app/arena2?username=utilizator11123
- **Railway dashboard:** https://railway.app/project/a87349d5-68ab-4c54-bc54-2610b8fa18a0

---

## Env переменные на Railway

| Переменная | Что это | Как обновить |
|---|---|---|
| `TIKTOK_USERNAME` | Никнейм TikTok стримера (без @) | Railway → Variables |
| `TIKTOK_SESSION_ID` | Cookie `sessionid` из браузера TikTok | см. ниже |
| `TIKTOK_MS_TOKEN` | Cookie `msToken` из браузера TikTok | см. ниже |
| `DATABASE_URL` | PostgreSQL (автоподключается Railway) | не трогать |

---

## Как получить TIKTOK_SESSION_ID

1. Зайди на **tiktok.com** в браузере (компьютер), войди в аккаунт `utilizator11123`
2. F12 → Application → Cookies → `https://www.tiktok.com`
3. Найди cookie **`sessionid`** → скопируй значение
4. Railway → Variables → `TIKTOK_SESSION_ID` → вставить → Save → Redeploy

Срок действия: **~60-90 дней**. Когда сломается — повторить.

---

## Как получить TIKTOK_MS_TOKEN

> Нужен если перестало работать подключение к TikTok (знак: логи показывают `❌ FAIL` для eulerstream/zerody.one)

1. Зайди на **tiktok.com** в браузере, войди в аккаунт `utilizator11123`
2. F12 → Application → Cookies → `https://www.tiktok.com`
3. Найди cookie **`msToken`** → скопируй значение (~150+ символов)
4. Railway → Variables → `TIKTOK_MS_TOKEN` → вставить → Save → Redeploy

Срок действия: **несколько дней/недель**.

---

## Как деплоить

```bash
git add .
git commit -m "описание"
git push origin master
```
Railway автоматически подхватит и задеплоит (~2-3 минуты).

---

## Как смотреть логи

**Railway dashboard** → проект → Deployments → последний → Logs

Или через API (уже настроено в этом чате).

Ключевые строки в логах:
```
[TikTok][utilizator11123] ✅ Подключён!          ← всё хорошо
[TikTok][utilizator11123] ❌ Stream not live...   ← стрим не запущен или нет msToken
[TikTok-sign] ✅ OK                               ← signing работает (eulerstream)
[TikTok-sign] ❌ FAIL                             ← signing сломан → нужен msToken вручную
[WarGift] Donator_Pro → cavalry for blue          ← демо-режим (нет TikTok)
[TikTok] 🎁 username gift=...                     ← реальный TikTok работает
```

---

## Как работает TikTok подключение

```
Зритель делает действие (подарок/лайк/вход)
        ↓
TikTok → сервер на Railway → браузер игрока
```

1. Сервер подключается к стриму `utilizator11123` через библиотеку `tiktok-live-connector`
2. Для подключения нужен `msToken` cookie — его получает сервис eulerstream.com
3. **Если eulerstream сломан** → нужно вставить `msToken` вручную (см. выше)
4. **Если стрим не запущен** → игра работает в **демо-режиме** (фейковые юзеры)
5. Как только стрим запускается → демо-режим выключается, реальные зрители появляются

---

## Демо-режим

Когда TikTok не подключён — автоматически запускаются фейковые пользователи:
`SuperFan_Anya`, `TikTokKing99`, `Donator_Pro`, `StreamQueen` и др.

Это НЕ баг — так задумано. Игра всегда выглядит живой.

---

## Статус внешних сервисов (июнь 2026)

| Сервис | Статус | Что делает |
|---|---|---|
| eulerstream.com | ⚠️ нестабильный (требует API ключ) | подписывает запросы к TikTok |
| zerody.one | ❌ мёртвый (404) | то же |
| TikTok sessionId | ✅ работает | авторизация полинга |
| msToken вручную | ✅ работает | замена eulerstream |

---

## Структура проекта

```
server/
  server.js          — Express + WebSocket сервер
  tiktokConnector.js — подключение к TikTok Live
  db.js              — PostgreSQL (килл-статистика)
client/
  arena2.html        — Arena 2 (основная игра)
  launcher.html      — лаунчер игр
scripts/
  patch-tiktok.js    — патч библиотеки tiktok-live-connector
```

---

## Railway API (для диагностики через Claude)

```
Token:          c857a516-a6f7-438f-a89f-aa9a70287316
Project ID:     a87349d5-68ab-4c54-bc54-2610b8fa18a0
Service ID:     4f086ff8-a10e-40e9-b4a6-ddf69c1f432a
Environment ID: 52a776b9-f55c-4405-8c57-5ae9842f8599
```

Получить логи:
```bash
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer c857a516-a6f7-438f-a89f-aa9a70287316" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { deployments(first:1, input:{serviceId:\"4f086ff8-a10e-40e9-b4a6-ddf69c1f432a\"}) { edges { node { id status } } } }"}'
```

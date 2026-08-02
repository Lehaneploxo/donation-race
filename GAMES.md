# Список игр проекта

Полный реестр всех игр, чтобы не забывать про те, что временно убраны со стартовой страницы (`client/launcher.html`).

## Активные (кнопки видны на launcher.html)

| Игра | Роут | Файл | Заметки |
|---|---|---|---|
| 🥊 Boxing Arena | `/boxing` | `client/boxing_arena.html` | Battle royale боксёров, лайки/донаты, чат-команда "rating" |
| 📊 Boxing Arena — база данных | `/boxing-db` | `client/boxing_db.html` | |
| 🥊 Boxing Arena (EN) | `/boxing-en` | `client/boxing_arena_en.html` | Английская версия, отдельный топ-лист |
| 📊 Boxing Arena (EN) — база данных | `/boxing-db-en` | `client/boxing_db_en.html` | |
| 🥋 Street Fighters | `/streetfighter` | `client/streetfighter_arena.html` | Текущая активная игра, чат-команда "rating" |
| 📊 Street Fighters — база данных | `/streetfighter-db` | `client/streetfighter_db.html` | |
| 🏛️ Цивилизация | `/civilization` | `client/civilization.html` | Перемещена в самый низ списка (02.08.2026) — редко используется, но актуальна |

## Скрытые (убраны со старта 02.08.2026, файлы НЕ удалены — можно вернуть в любой момент)

| Игра | Роут | Файл | Заметки |
|---|---|---|---|
| 🏁 Street Race | `/game` | `client/index.html` | Лайки/подарки, команда "GO" в чате |
| ⚔️ Blue vs Red War | `/war` | `client/war.html` | Команды "blue"/"red" в чате |
| ⚔️ Arena Battle | `/arena` | `client/arena.html` | Донаты/лайки, команда "help" |
| ⚔️ Arena Battle 2 — Колизей | `/arena2` | `client/arena2.html` | Копьеносец vs Конан, донаты, армагеддон |
| ⚔️ Arena Battle 3 | `/arena3` | `client/arena3.html` | Донаты/лайки, команда "help" |

Чтобы вернуть игру на стартовую страницу — вернуть соответствующую панель в `client/launcher.html` (была удалена оттуда, разметку можно восстановить из git-истории коммита с этим изменением).

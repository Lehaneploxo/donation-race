# Список игр проекта

Полный реестр всех игр, чтобы не забывать про те, что временно убраны со стартовой страницы (`client/launcher.html`).

## Активные (кнопки видны на launcher.html)

| Игра | Роут | Файл | Заметки |
|---|---|---|---|
| 🥊 Boxing Arena | `/boxing` | `client/boxing_arena.html` | Battle royale боксёров, лайки/донаты, чат-команда "rating" |
| 📊 Boxing Arena — база данных | `/boxing-db` | `client/boxing_db.html` | |
| 🥋 Street Fighters | `/streetfighter` | `client/streetfighter_arena.html` | Текущая активная игра, чат-команда "rating" |
| 📊 Street Fighters — база данных | `/streetfighter-db` | `client/streetfighter_db.html` | |
| 🥋 Street Fighters II | `/streetfighter2` | `client/streetfighter_arena2.html` | 29.08.2026. Копия Street Fighters для запуска на втором TikTok-аккаунте параллельно с оригиналом. Комнаты (бой, состояние) независимые — изоляция по `?username=` как обычно, но использует ТЕ ЖЕ таблицы БД, что и `/streetfighter` (общий топ, общий рейтинг, общий пояс/KO на двоих аккаунтах). Своей отдельной БД-страницы нет — статистика видна на `/streetfighter-db`. Отличия от оригинала: название в титуле/HUD — "STREET FIGHTERS II" (римская цифра), время бездействия до затухания Силы — 5 минут (в оригинале 15), добавлена VS-карточка из Fantasy Arena (баннер, когда дерутся двое сильнейших реальных зрителей) + debug-панель `?debug=1`, убрана плашка личного рейтинга по команде "rating" (перекрывала VS-карточку). "Портал" (29.08.2026): каждые 5 минут бой на 1 минуту переносится на фон одной из 8 карт Fantasy Arena по очереди (декорация только, бойцы/боевая логика те же), на это время бойцы дерутся на одной линии как в Fantasy Arena, а обычная ротация комнат Street Fighters ставится на паузу — после портала игра возвращается на ту же карту, где остановилась. Отсчёт до портала/конца портала всегда виден на экране |
| 🏰 Fantasy Arena | `/fantasyarena` | `client/fantasy_arena.html` | 9-я игра (18.08.2026). Крауд-арена 1-в-1 логика Street Fighter: лайки/донаты растят Энергию/Силу бойца-зрителя, уровень (1-50) от lifetime-очков, ежедневный сброс дневного топа/короны в полночь по Киеву. 4 героя (Рыцарь/Самурай/Маг/Охотница) × 7 цветов каждый (`scripts/recolor_fantasy_arena.js`), чат-команда "hero1"-"hero4" закрепляет героя навсегда. 8 фонов (ansimuz), автосмена каждые 5 мин. Чат-команда "rating" |
| 📊 Fantasy Arena — база данных | `/fantasyarena-db` | `client/fantasy_arena_db.html` | |
| 🔫 NEPLOXO STREET WARS | `/streetwars` | `client/streetwars/streetwars.html` | 06.10.2026. Логика боя Street Fighters 1 один в один (Энергия/Сила, серии 1-3 удара, после серии расходятся, нокаут обнуляет бойца, топ = отнятая энергия за день, чемпион прошлого дня, боты, Team, rating, диктор), но картинка — 3D-город Neploxo City и люди из GTA-шки (копия файлов игры в `client/streetwars/nb/`). Места города вместо комнат, смена раз в 5 мин. Оружие растёт с Силой (кулаки → бита 50 → нож 150 → пистолет 400 → дробовик 1000), урон всё равно = Сила. Сила тает через 5 мин без лайков/донатов (Энергия — нет). Своя база `streetwars_*`. Без `?username=` — черновой режим с имитацией эфира |
| 📊 NEPLOXO STREET WARS — база данных | `/streetwars-db` | `client/streetwars/streetwars_db.html` | |
## Скрытые (убраны со старта 02.08.2026, файлы НЕ удалены — можно вернуть в любой момент)

| Игра | Роут | Файл | Заметки |
|---|---|---|---|
| 🏁 Street Race | `/game` | `client/index.html` | Лайки/подарки, команда "GO" в чате |
| ⚔️ Arena Battle | `/arena` | `client/arena.html` | Донаты/лайки, команда "help" |
| ⚔️ Arena Battle 2 — Колизей | `/arena2` | `client/arena2.html` | Копьеносец vs Конан, донаты, армагеддон |

Чтобы вернуть игру на стартовую страницу — вернуть соответствующую панель в `client/launcher.html` (была удалена оттуда, разметку можно восстановить из git-истории коммита с этим изменением).


## Архив (убраны с сайта 06.10.2026)

Файлы перенесены в `archive/` (вне `client/`, сервер их не раздаёт), маршруты и обработчики удалены из `server.js`. Базы Boxing Arena EN, Рыбалки и Fantasy Arena TV стёрты (DROP TABLE в `db.init`); у Цивилизации и Взаимок своих таблиц рейтинга не было.

| Игра | Был роут | Файл |
|---|---|---|
| 🥊 Boxing Arena (EN) | `/boxing-en` | `archive/boxing_arena_en.html` |
| 📊 Boxing Arena (EN) — база данных | `/boxing-db-en` | `archive/boxing_db_en.html` |
| 🎣 Рыбалка | `/fishing` | `archive/fishing.html` |
| 📊 Рыбалка — база данных | `/fishing-db` | `archive/fishing_db.html` |
| 📺 Fantasy Arena TV | `/fantasyarenatv` | `archive/fantasy_arena_tv.html` |
| 📊 Fantasy Arena TV — база данных | `/fantasyarenatv-db` | `archive/fantasy_arena_tv_db.html` |
| 🏛️ Цивилизация | `/civilization` | `archive/civilization.html` |
| 🤝 Взаимки | `/vzaimki` | `archive/vzaimki.html` |
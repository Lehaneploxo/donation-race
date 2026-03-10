const INACTIVE_TIMEOUT_MS = 30 * 60 * 1000;
const COINS_PER_POINT = 1;   // 1 coin  = 2 pts  (coins * 2)
const LIKES_PER_POINT = 100; // 100 likes = 1 pt

class PlayersManager {
  constructor() {
    this.players = new Map();
  }

  _ensurePlayer(userId, username, avatarUrl) {
    if (!this.players.has(userId)) {
      this.players.set(userId, {
        playerId:    userId,
        username:    username || 'Unknown',
        avatarUrl:   avatarUrl || '',
        totalCoins:  0,
        totalLikes:  0,
        totalPoints: 0,
        distance:    0,
        joinTime:    Date.now(),
        active:      true,
        lastSeen:    Date.now()
      });
    }
    return this.players.get(userId);
  }

  _calcPoints(coins, likes) {
    return coins * 2 + Math.floor(likes / LIKES_PER_POINT);
  }

  addCoins(userId, username, avatarUrl, coins) {
    const p = this._ensurePlayer(userId, username, avatarUrl);
    p.totalCoins += (Number(coins) || 0);
    p.username    = username || p.username;
    p.active      = true;
    p.lastSeen    = Date.now();
    p.totalPoints = this._calcPoints(p.totalCoins, p.totalLikes);
    p.distance    = p.totalPoints;
    return p;
  }

  addLikes(userId, username, avatarUrl, likes) {
    const p = this._ensurePlayer(userId, username, avatarUrl);
    p.totalLikes += (Number(likes) || 0);
    p.username    = username || p.username;
    p.active      = true;
    p.lastSeen    = Date.now();
    p.totalPoints = this._calcPoints(p.totalCoins, p.totalLikes);
    p.distance    = p.totalPoints;
    return p;
  }

  // Обновить присутствие без монет (когда зритель заходит в стрим)
  // Возвращает true если игрок был неактивен и вернулся
  updatePresence(userId, username, avatarUrl) {
    if (!this.players.has(userId)) return false;
    const p = this.players.get(userId);
    const cameBack = !p.active;
    p.active   = true;
    p.lastSeen = Date.now();
    if (username) p.username = username;
    return cameBack;
  }

  // Пометить неактивными тех, кто давно не появлялся.
  // Возвращает количество изменённых игроков.
  checkInactive() {
    const now = Date.now();
    let changed = 0;
    this.players.forEach(p => {
      if (p.active && now - p.lastSeen > INACTIVE_TIMEOUT_MS) {
        p.active = false;
        changed++;
      }
    });
    return changed;
  }

  getTop10() {
    const now      = Date.now();
    const active   = Array.from(this.players.values()).filter(p => p.active);
    active.sort((a, b) => b.totalPoints - a.totalPoints);

    // Always include top-10 by score
    const top10    = active.slice(0, 10);
    const top10Ids = new Set(top10.map(p => p.playerId));

    // Also include players who joined in the last 90 seconds (newcomers)
    const newbies  = active.filter(p => now - p.joinTime < 90_000 && !top10Ids.has(p.playerId));

    // Return top-10 (sorted) + newcomers, cap at 20 total
    return [...top10, ...newbies].slice(0, 20);
  }

  getTotalCount() {
    return Array.from(this.players.values()).filter(p => p.active).length;
  }
}

module.exports = PlayersManager;

const INACTIVE_TIMEOUT_MS = 30 * 60 * 1000; // 30 минут без активности → скрыть

class PlayersManager {
  constructor() {
    this.players = new Map();
  }

  addCoins(userId, username, avatarUrl, coins) {
    if (this.players.has(userId)) {
      const p = this.players.get(userId);
      p.totalCoins += coins;
      p.distance   += coins;
      p.username    = username;
      p.active      = true;
      p.lastSeen    = Date.now();
    } else {
      this.players.set(userId, {
        playerId:   userId,
        username,
        avatarUrl:  avatarUrl || '',
        totalCoins: coins,
        distance:   coins,
        joinTime:   Date.now(),
        active:     true,
        lastSeen:   Date.now()
      });
    }
    return this.players.get(userId);
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
    return Array.from(this.players.values())
      .filter(p => p.active)
      .sort((a, b) => b.distance - a.distance)
      .slice(0, 10);
  }

  getTotalCount() {
    return Array.from(this.players.values()).filter(p => p.active).length;
  }
}

module.exports = PlayersManager;

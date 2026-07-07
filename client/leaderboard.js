// Топ донатеров за всё время (из Postgres) — рендерится каждый раз, когда
// сервер присылает topDonations (после гифта или при подключении).
const Leaderboard = {
  update(topDonations) {
    const list = document.getElementById('leaderboardList');
    if (!list) return;
    list.innerHTML = '';

    (topDonations || []).slice(0, 10).forEach((row, index) => {
      const rank = index + 1;
      const coins = row.total_coins !== undefined ? row.total_coins : row.totalCoins;
      const item = document.createElement('div');
      item.className = 'lb-item';

      let medal;
      if      (rank === 1) medal = '🥇';
      else if (rank === 2) medal = '🥈';
      else if (rank === 3) medal = '🥉';
      else                 medal = `${rank}`;

      item.innerHTML = `
        <span class="lb-rank rank-${rank <= 3 ? rank : 'other'}">${medal}</span>
        <span class="lb-name">${escapeHtml(row.username)}</span>
        <span class="lb-pts">${coins}</span>
        <span class="lb-icon">🎁</span>
      `;
      list.appendChild(item);
    });
  }
};

function escapeHtml(t) {
  return (t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

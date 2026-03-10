const Leaderboard = {
  players: [],

  update(players, totalPlayers) {
    this.players = players;
    document.getElementById('playerCountNum').textContent = totalPlayers;

    const list = document.getElementById('leaderboardList');
    list.innerHTML = '';

    players.forEach((player, index) => {
      const rank   = index + 1;
      const pts    = player.totalPoints !== undefined ? player.totalPoints : player.totalCoins;
      const item   = document.createElement('div');
      item.className = 'lb-item';

      let medal;
      if      (rank === 1) medal = '🥇';
      else if (rank === 2) medal = '🥈';
      else if (rank === 3) medal = '🥉';
      else                 medal = `${rank}`;

      const color = NAME_TAG_COLORS[index % NAME_TAG_COLORS.length];

      item.innerHTML = `
        <span class="lb-rank rank-${rank <= 3 ? rank : 'other'}">${medal}</span>
        <span class="lb-name" style="color:${color}">${escapeHtml(player.username)}</span>
        <span class="lb-pts">${pts}<span class="lb-pts-label"> pts</span></span>
      `;
      list.appendChild(item);
    });
  }
};

function escapeHtml(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

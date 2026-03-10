const Leaderboard = {
  players: [],

  update(players, totalPlayers) {
    this.players = players;

    document.getElementById('playerCountNum').textContent = totalPlayers;

    const list = document.getElementById('leaderboardList');
    list.innerHTML = '';

    players.forEach((player, index) => {
      const rank = index + 1;
      const item = document.createElement('div');
      item.className = 'lb-item';

      let rankDisplay;
      if (rank === 1) rankDisplay = '🥇';
      else if (rank === 2) rankDisplay = '🥈';
      else if (rank === 3) rankDisplay = '🥉';
      else rankDisplay = `${rank}.`;

      const rankClass = rank <= 3 ? `rank-${rank}` : '';

      const nameColor = NAME_TAG_COLORS[index % NAME_TAG_COLORS.length];
      item.innerHTML = `
        <span class="lb-rank ${rankClass}">${rankDisplay}</span>
        <span class="lb-name" style="color:${nameColor}">${escapeHtml(player.username)}</span>
        <span class="lb-coins">${player.totalCoins} pts</span>
      `;

      list.appendChild(item);
    });
  }
};

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

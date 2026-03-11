// Mini SVG car icons per type (COLOR replaced dynamically)
const _CAR_SVG = {
  sedan:  (c) => `<svg width="52" height="28" viewBox="0 0 52 28"><rect x="2" y="15" width="48" height="10" rx="3" fill="${c}"/><path d="M11,15 L16,6 L36,6 L41,15 Z" fill="${c}"/><circle cx="13" cy="25" r="4" fill="#111"/><circle cx="39" cy="25" r="4" fill="#111"/><rect x="16" y="7" width="20" height="7" rx="1" fill="rgba(136,204,255,0.55)"/></svg>`,
  jeep:   (c) => `<svg width="52" height="28" viewBox="0 0 52 28"><rect x="3" y="10" width="46" height="14" rx="3" fill="${c}"/><rect x="6" y="3" width="40" height="9" rx="2" fill="${c}"/><circle cx="13" cy="25" r="4" fill="#111"/><circle cx="39" cy="25" r="4" fill="#111"/><rect x="8" y="4" width="36" height="7" rx="1" fill="rgba(136,204,255,0.45)"/></svg>`,
  truck:  (c) => `<svg width="60" height="28" viewBox="0 0 60 28"><rect x="2" y="14" width="56" height="10" rx="2" fill="${c}"/><rect x="2" y="5" width="22" height="11" rx="2" fill="${c}"/><circle cx="10" cy="25" r="4" fill="#111"/><circle cx="28" cy="25" r="4" fill="#111"/><circle cx="48" cy="25" r="4" fill="#111"/><rect x="4" y="6" width="18" height="8" rx="1" fill="rgba(136,204,255,0.45)"/></svg>`,
  tank:   (c) => `<svg width="54" height="28" viewBox="0 0 54 28"><rect x="2" y="15" width="50" height="10" rx="2" fill="${c}"/><rect x="7" y="8" width="40" height="9" rx="2" fill="${c}"/><rect x="18" y="3" width="18" height="7" rx="3" fill="${c}"/><rect x="34" y="5" width="16" height="3" rx="1" fill="${c}"/></svg>`,
  sports: (c) => `<svg width="54" height="26" viewBox="0 0 54 26"><rect x="2" y="13" width="50" height="9" rx="2" fill="${c}"/><path d="M10,13 L16,5 L38,5 L44,13 Z" fill="${c}"/><circle cx="13" cy="23" r="3.5" fill="#111"/><circle cx="41" cy="23" r="3.5" fill="#111"/><rect x="16" y="6" width="22" height="6" rx="1" fill="rgba(136,204,255,0.6)"/></svg>`,
};

const Leaderboard = {
  players: [],

  update(players, totalPlayers) {
    this.players = players;
    document.getElementById('playerCountNum').textContent = totalPlayers;

    const list = document.getElementById('leaderboardList');
    list.innerHTML = '';

    const _carBodyColors = [
      0xFF2222, 0x2266FF, 0xFFCC00, 0x22BB44,
      0xFF6600, 0xCC22FF, 0xFF2288, 0x00CCCC,
      0xFFFFFF, 0x111111, 0xBB8833, 0x44AA88
    ];
    const _carTypes = ['sedan', 'jeep', 'truck', 'tank', 'sports'];

    players.slice(0, 10).forEach((player, index) => {
      const rank = index + 1;
      const pts  = player.totalPoints !== undefined ? player.totalPoints : player.totalCoins;
      const item = document.createElement('div');
      item.className = 'lb-item';

      let medal;
      if      (rank === 1) medal = '🥇';
      else if (rank === 2) medal = '🥈';
      else if (rank === 3) medal = '🥉';
      else                 medal = `${rank}`;

      const char = window.characters?.get(player.playerId);
      let colorHex, carType;
      if (char) {
        const ci = char.colorIndex % _carBodyColors.length;
        colorHex = '#' + _carBodyColors[ci].toString(16).padStart(6, '0');
        carType  = char._carType || 'sedan';
      } else {
        const ci  = index % _carBodyColors.length;
        const pid = parseInt(player.playerId, 10) || index;
        colorHex = '#' + _carBodyColors[ci].toString(16).padStart(6, '0');
        carType  = _carTypes[pid % _carTypes.length];
      }

      const iconFn  = _CAR_SVG[carType] || _CAR_SVG.sedan;
      const iconSvg = iconFn(colorHex);

      item.innerHTML = `
        <span class="lb-rank rank-${rank <= 3 ? rank : 'other'}">${medal}</span>
        <span class="lb-name" style="color:${colorHex}">${escapeHtml(player.username)}</span>
        <span class="lb-pts">${pts}</span>
        <span class="lb-icon">${iconSvg}</span>
      `;
      list.appendChild(item);
    });
  }
};

function escapeHtml(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

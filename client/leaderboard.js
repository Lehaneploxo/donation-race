const Leaderboard = {
  players: [],

  update(players, totalPlayers) {
    this.players = players;
    document.getElementById('playerCountNum').textContent = totalPlayers;

    const list = document.getElementById('leaderboardList');
    list.innerHTML = '';

    // Color names in Russian
    const _colorNames = {
      0xFF2222: 'Красный', 0x2266FF: 'Синий',   0xFFCC00: 'Жёлтый',
      0x22BB44: 'Зелёный', 0xFF6600: 'Оранжевый', 0xCC22FF: 'Фиолетовый',
      0xFF2288: 'Розовый', 0x00CCCC: 'Голубой',  0xFFFFFF: 'Белый',
      0x111111: 'Чёрный',  0xBB8833: 'Золотой',  0x44AA88: 'Бирюзовый'
    };
    const _typeNames = {
      sedan: 'Седан', jeep: 'Джип', truck: 'Грузовик', tank: 'Танк', sports: 'Болид'
    };
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

      // Get car info from characters map (exposed as window.characters in game.js)
      const char = window.characters?.get(player.playerId);
      let colorHex, typeName, colorName;
      if (char) {
        const ci = char.colorIndex % _carBodyColors.length;
        const colorNum = _carBodyColors[ci];
        colorHex  = '#' + colorNum.toString(16).padStart(6, '0');
        typeName  = _typeNames[char._carType] || char._carType || '?';
        colorName = _colorNames[colorNum] || '?';
      } else {
        const ci  = index % _carBodyColors.length;
        const colorNum = _carBodyColors[ci];
        const pid = parseInt(player.playerId, 10) || index;
        colorHex  = '#' + colorNum.toString(16).padStart(6, '0');
        typeName  = _typeNames[_carTypes[pid % _carTypes.length]] || '?';
        colorName = _colorNames[colorNum] || '?';
      }

      item.innerHTML = `
        <span class="lb-rank rank-${rank <= 3 ? rank : 'other'}">${medal}</span>
        <span class="lb-name"><span style="color:${colorHex};font-size:1.1em;">■</span> ${colorName} ${typeName}</span>
        <span class="lb-pts">${pts}<span class="lb-pts-label"> pts</span></span>
      `;
      list.appendChild(item);
    });
  }
};

function escapeHtml(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

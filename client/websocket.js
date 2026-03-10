const GameWebSocket = {
  socket:   null,
  handlers: {},
  username: null,

  connect(forceUsername) {
    const params = new URLSearchParams(window.location.search);
    this.username = forceUsername || params.get('username') || '';

    // Show overlay if no username provided
    if (!this.username) {
      _showUsernameOverlay();
      return;
    }

    _hideUsernameOverlay();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(
      `${protocol}//${window.location.host}?username=${encodeURIComponent(this.username)}`
    );

    this.socket.onopen = () => {
      console.log(`[WS] Connected — watching @${this.username}`);
      _setStatus('connecting', `⏳ @${this.username}…`);
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Update status from init message
        if (data.type === 'init') {
          const mode = data.tiktokMode;
          if (mode === 'tiktok')     _setStatus('live',  `🔴 LIVE @${data.username}`);
          else if (mode === 'demo')  _setStatus('demo',  `🟡 DEMO @${data.username}`);
          else                       _setStatus('connecting', `⏳ @${this.username}…`);
        }
        if (data.type === 'status') {
          if (data.mode === 'tiktok') _setStatus('live', `🔴 LIVE @${this.username}`);
          else if (data.mode === 'demo') _setStatus('demo', `🟡 DEMO — TikTok unavailable`);
          else _setStatus('error', `❌ ${data.message}`);
        }
        if (this.handlers[data.type]) this.handlers[data.type](data);
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    this.socket.onclose = () => {
      console.log('[WS] Disconnected. Reconnecting in 3s…');
      _setStatus('error', '❌ No connection — reconnecting…');
      setTimeout(() => this.connect(this.username), 3000);
    };

    this.socket.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
  },

  on(type, handler) {
    this.handlers[type] = handler;
  }
};

// ── Username overlay helpers ─────────────────────────────────────────────────
function _showUsernameOverlay() {
  const overlay = document.getElementById('usernameOverlay');
  if (overlay) overlay.style.display = 'flex';
}

function _hideUsernameOverlay() {
  const overlay = document.getElementById('usernameOverlay');
  if (overlay) overlay.style.display = 'none';
}

function _setStatus(cls, text) {
  const el = document.getElementById('statusBadge');
  if (!el) return;
  el.className = cls;
  el.textContent = text;
}

// ── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Username button
  const btn = document.getElementById('usernameBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      const val = (document.getElementById('usernameInput').value || '').replace(/^@/, '').trim();
      if (!val) return;
      // Update URL so refresh keeps the username
      const url = new URL(window.location.href);
      url.searchParams.set('username', val);
      window.history.replaceState({}, '', url);
      GameWebSocket.connect(val);
    });
  }

  // Enter key in input
  const inp = document.getElementById('usernameInput');
  if (inp) {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') btn && btn.click();
    });
  }

  // Demo button
  const demoBtn = document.getElementById('demoBtn');
  if (demoBtn) {
    demoBtn.addEventListener('click', () => {
      const url = new URL(window.location.href);
      url.searchParams.set('username', 'demo');
      window.history.replaceState({}, '', url);
      GameWebSocket.connect('demo');
    });
  }
});

GameWebSocket.connect();

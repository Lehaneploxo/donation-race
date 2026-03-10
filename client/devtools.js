/**
 * UI Visual Editor — press backtick (`) to toggle
 * Drag any panel, see live coordinates, copy CSS when done.
 */
(function () {
  'use strict';

  const PANELS = [
    '#leaderboard',
    '#infoPanel',
    '#tornadoHint',
    '#playerCount',
    '#title',
    '#statusBadge',
    '#progressWrap',
    '#timeOfDay',
    '#timeSpeedBadge',
  ];

  let editMode = false;
  let tooltip  = null;
  let cssPanel = null;
  let badge    = null;

  // ── helpers ──────────────────────────────────────────────────────────────────

  function getWrapper() { return document.getElementById('scaleWrapper'); }

  /** Returns the CSS scale currently applied to #scaleWrapper */
  function getScale() {
    const t = getWrapper().style.transform || '';
    const m = t.match(/scale\(([\d.]+)\)/);
    return m ? parseFloat(m[1]) : 1;
  }

  /** Wrapper bounding rect in screen pixels */
  function wrapperRect() { return getWrapper().getBoundingClientRect(); }

  /** Convert screen px → scaleWrapper local px */
  function toLocal(screenX, screenY) {
    const r = wrapperRect();
    const s = getScale();
    return { x: (screenX - r.left) / s, y: (screenY - r.top) / s };
  }

  /** Gather computed position for a panel */
  function readPos(el) {
    const style = el.style;
    return {
      top:    style.top    || getComputedStyle(el).top,
      left:   style.left   || '',
      right:  style.right  || getComputedStyle(el).right,
      bottom: style.bottom || '',
    };
  }

  /** Human-readable position string */
  function posLabel(el) {
    const s = el.style;
    const cs = getComputedStyle(el);
    const parts = [];
    if (s.top    || cs.top    !== 'auto') parts.push(`top: ${s.top    || cs.top}`);
    if (s.left   || cs.left   !== 'auto') parts.push(`left: ${s.left  || cs.left}`);
    if (s.right  || cs.right  !== 'auto') parts.push(`right: ${s.right || cs.right}`);
    if (s.bottom || cs.bottom !== 'auto') parts.push(`bottom: ${s.bottom || cs.bottom}`);
    return parts.join(', ');
  }

  // ── tooltip ───────────────────────────────────────────────────────────────

  function createTooltip() {
    tooltip = document.createElement('div');
    Object.assign(tooltip.style, {
      position:        'fixed',
      top:             '8px',
      left:            '50%',
      transform:       'translateX(-50%)',
      background:      'rgba(0,0,0,0.85)',
      color:           '#0ff',
      fontSize:        '13px',
      fontFamily:      'monospace',
      padding:         '4px 12px',
      borderRadius:    '6px',
      zIndex:          '999999',
      pointerEvents:   'none',
      whiteSpace:      'nowrap',
      border:          '1px solid #0ff',
    });
    document.body.appendChild(tooltip);
  }

  function setTooltip(text) { if (tooltip) tooltip.textContent = text; }

  // ── badge (edit mode indicator) ───────────────────────────────────────────

  function createBadge() {
    badge = document.createElement('div');
    badge.textContent = '✏️ EDIT MODE — ` to exit | drag panels | see CSS below';
    Object.assign(badge.style, {
      position:      'fixed',
      bottom:        '8px',
      left:          '50%',
      transform:     'translateX(-50%)',
      background:    'rgba(255,140,0,0.9)',
      color:         '#000',
      fontWeight:    'bold',
      fontSize:      '13px',
      fontFamily:    'monospace',
      padding:       '5px 16px',
      borderRadius:  '8px',
      zIndex:        '999999',
      pointerEvents: 'none',
    });
    document.body.appendChild(badge);
  }

  // ── CSS panel ─────────────────────────────────────────────────────────────

  function createCssPanel() {
    cssPanel = document.createElement('div');
    Object.assign(cssPanel.style, {
      position:     'fixed',
      bottom:       '40px',
      right:        '8px',
      background:   'rgba(0,0,0,0.92)',
      color:        '#aaffaa',
      fontSize:     '11px',
      fontFamily:   'monospace',
      padding:      '10px 14px',
      borderRadius: '8px',
      zIndex:       '999999',
      border:       '1px solid #0f0',
      minWidth:     '260px',
      maxWidth:     '400px',
      lineHeight:   '1.7',
      userSelect:   'text',
    });
    document.body.appendChild(cssPanel);
  }

  function updateCssPanel() {
    if (!cssPanel) return;
    const lines = PANELS.map(sel => {
      const el = document.querySelector(sel);
      if (!el) return '';
      const s = el.style;
      const rows = [];
      if (s.top)    rows.push(`  top: ${s.top};`);
      if (s.left)   rows.push(`  left: ${s.left};`);
      if (s.right)  rows.push(`  right: ${s.right};`);
      if (s.bottom) rows.push(`  bottom: ${s.bottom};`);
      if (!rows.length) return '';
      return `${sel} {\n${rows.join('\n')}\n}`;
    }).filter(Boolean);
    cssPanel.innerHTML = '<b style="color:#ff0">// current positions — copy to CSS</b><br>' +
      lines.join('<br>').replace(/\n/g, '<br>');
  }

  // ── make an element draggable within #scaleWrapper ─────────────────────────

  function makeDraggable(el) {
    el.dataset.devDraggable = '1';

    // visual cue
    el.style.outline = '2px dashed #ff0';
    el.style.cursor  = 'grab';

    const down = (e) => {
      if (!editMode) return;
      e.preventDefault();
      e.stopPropagation();

      const startScreen = { x: e.clientX, y: e.clientY };
      const startLocal  = toLocal(startScreen.x, startScreen.y);

      const rect  = el.getBoundingClientRect();
      const wRect = wrapperRect();
      const scale = getScale();

      // element top-left in local space
      const startElX = (rect.left - wRect.left) / scale;
      const startElY = (rect.top  - wRect.top ) / scale;

      el.style.cursor = 'grabbing';

      const move = (me) => {
        const local = toLocal(me.clientX, me.clientY);
        const dx = local.x - startLocal.x;
        const dy = local.y - startLocal.y;

        const newTop  = Math.round(startElY + dy);
        const newLeft = Math.round(startElX + dx);

        // Prefer right-anchor if the element originally had right set
        const hasRight = el.style.right && el.style.right !== '' && el.style.right !== 'auto';
        if (hasRight) {
          const wrapW = 1080;
          const elW   = Math.round(el.getBoundingClientRect().width / scale);
          el.style.right = (wrapW - newLeft - elW) + 'px';
        } else {
          el.style.left = newLeft + 'px';
        }
        el.style.top = newTop + 'px';
        // Clear transform so position is absolute
        if (el.style.transform && el.style.transform.includes('translateX')) {
          el.style.transform = 'none';
        }

        setTooltip(`${el.id || el.className}  top: ${newTop}px  ${hasRight ? 'right' : 'left'}: ${hasRight ? el.style.right : newLeft + 'px'}`);
        updateCssPanel();
      };

      const up = () => {
        el.style.cursor = 'grab';
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup',   up);
        updateCssPanel();
      };

      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup',   up);
    };

    el.addEventListener('mousedown', down);
    el._devDown = down;
  }

  function unmakeDraggable(el) {
    el.style.outline = '';
    el.style.cursor  = '';
    if (el._devDown) {
      el.removeEventListener('mousedown', el._devDown);
      delete el._devDown;
    }
    delete el.dataset.devDraggable;
  }

  // ── toggle edit mode ──────────────────────────────────────────────────────

  function enableEditMode() {
    editMode = true;

    // Make the #ui layer interactive
    const ui = document.getElementById('ui');
    if (ui) { ui._oldPointerEvents = ui.style.pointerEvents; ui.style.pointerEvents = 'all'; }

    createTooltip();
    createBadge();
    createCssPanel();

    PANELS.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) makeDraggable(el);
    });

    updateCssPanel();
    setTooltip('Drag any panel to reposition it');
  }

  function disableEditMode() {
    editMode = false;

    const ui = document.getElementById('ui');
    if (ui && ui._oldPointerEvents !== undefined) {
      ui.style.pointerEvents = ui._oldPointerEvents;
    }

    PANELS.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) unmakeDraggable(el);
    });

    if (tooltip)  { tooltip.remove();  tooltip  = null; }
    if (badge)    { badge.remove();    badge    = null; }
    if (cssPanel) { cssPanel.remove(); cssPanel = null; }
  }

  // ── keyboard toggle ───────────────────────────────────────────────────────

  window.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~') {
      if (editMode) disableEditMode(); else enableEditMode();
    }
  });

  console.log('[DevTools] UI Editor loaded — press ` (backtick) to toggle edit mode');
})();

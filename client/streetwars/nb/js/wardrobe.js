// The hero's clothes, piece by piece: a top, trousers or shorts, shoes, a hat, glasses, a chain and a watch,
// each bought separately at the Neon Fashion boutique and worn in any combination. The old whole outfits
// (NB.OUTFITS in player.js) live on as tops. The women's line is here too, ready for when there are
// heroines to wear it; the boutique shows it on mannequins.
(function (NB) {
  'use strict';
  const { U } = NB;
  const T = draw => () => U.canvasTex(128, 128, draw, true, 4);
  const fill = c => (g, s) => { g.fillStyle = c; g.fillRect(0, 0, s, s); };
  // a plain tee with a darker collar; a print over it
  const tee = (c, collar, extra) => T((g, s) => { fill(c)(g, s); g.fillStyle = collar; g.fillRect(s * .36, 0, s * .28, 6); if (extra) extra(g, s); });
  const text = (t, c, size, y = .55) => (g, s) => { g.fillStyle = c; g.font = 'bold ' + size + 'px Rubik, Arial, sans-serif'; g.textAlign = 'center'; g.fillText(t, s / 2, s * y); };
  const spots = (base, cols, n, r0, r1) => T((g, s) => { fill(base)(g, s); for (let k = 0; k < n; k++) { g.fillStyle = cols[k % cols.length]; g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, U.rand(r0, r1), U.rand(r0 * .6, r1 * .7), Math.random() * 3, 0, 7); g.fill(); } });
  const jacket = (coat, shirt, extra) => T((g, s) => { fill(coat)(g, s); g.fillStyle = shirt; g.fillRect(s * .38, 0, s * .24, s); if (extra) extra(g, s); });
  const sparkle = (a, b, n) => (g, s) => { for (let k = 0; k < n; k++) { g.fillStyle = Math.random() < .5 ? a : b; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); } };

  /* ---------- men's line ---------- */
  const top = {}, pants = {}, shoes = {}, hat = {}, glasses = {}, chain = {}, watch = {};
  // the old outfits become tops; suits and jackets have long sleeves
  const LONG = { vice: '#f4f1ea', sport: '#1a1a22', mechanic: '#c86a1e', denim: '#4a6fa0', leather: '#1a1a1e', neon: '#9b5cff', miami: '#a9d8f5', tuxedo: '#141418', redsuit: '#b0203a', gold: '#c9a227', cop: '#23407a' };
  for (const k in NB.OUTFITS) {
    const o = NB.OUTFITS[k];
    top[k] = { name: o.name, price: o.price || 0, tex: o.tex, sleeves: k === 'tank' ? 'tank' : LONG[k] ? 'long' : 'short', sleeve: LONG[k], hidden: k === 'cop' };
  }
  Object.assign(top, {
    tee_white: { name: 'Белая футболка', price: 40, tex: tee('#f5f5f0', '#d8d8d0') },
    tee_black: { name: 'Чёрная футболка', price: 50, tex: tee('#18181c', '#2a2a30') },
    tee_pink: { name: 'Розовая футболка', price: 50, tex: tee('#ff7eb6', '#e0508a') },
    tee_cyan: { name: 'Бирюзовая футболка', price: 50, tex: tee('#3fe6e0', '#20b0aa') },
    tee_neon: { name: 'Футболка NEPLOXO CITY', price: 90, tex: tee('#18181c', '#2a2a30', text('NEPLOXO', '#ff4fa3', 19)) },
    tee_notbad: { name: 'Футболка NOT BAD (логотип)', price: 210, tex: tee('#141418', '#2a2a30', (g, s) => { if (NB.drawLogo) NB.drawLogo(g, s / 2, s * .52, s * .3); }) },
    tee_leha: { name: 'Футболка LEHA NEPLOXO', price: 150, tex: tee('#ff2d7a', '#d01a5a', (g, s) => { text('LEHA', '#ffffff', 22, .42)(g, s); text('NEPLOXO', '#ffffff', 17, .62)(g, s); text('21', '#ffe98a', 20, .85)(g, s); }) },
    tee_21: { name: 'Футболка NEPLOXO 21', price: 120, tex: tee('#f5f5f0', '#d8d8d0', (g, s) => { text('NEPLOXO', '#ff2d7a', 18, .42)(g, s); text('21', '#20b0aa', 34, .78)(g, s); }) },
    jersey: { name: 'Футбольная майка №21', price: 180, tex: tee('#1f4fb0', '#f5f5f0', (g, s) => { g.fillStyle = '#f5f5f0'; g.fillRect(0, s * .82, s, 6); text('21', '#f5f5f0', 52, .72)(g, s); }) },
    tank_black: { name: 'Чёрная майка', price: 60, sleeves: 'tank', tex: T(fill('#18181c')) },
    mesh: { name: 'Сетчатая майка', price: 90, sleeves: 'tank', tex: T((g, s) => { fill('#c98f65')(g, s); g.strokeStyle = '#141418'; g.lineWidth = 2; for (let x = -s; x < s * 2; x += 9) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + s, s); g.stroke(); g.beginPath(); g.moveTo(x + s, 0); g.lineTo(x, s); g.stroke(); } }) },
    flamingo: { name: 'Рубашка с фламинго', price: 220, tex: T((g, s) => { fill('#3fc9c0')(g, s); for (let k = 0; k < 8; k++) { const x = Math.random() * s, y = Math.random() * s; g.fillStyle = '#ff7eb6'; g.beginPath(); g.ellipse(x, y, 9, 6, -.4, 0, 7); g.fill(); g.strokeStyle = '#ff7eb6'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 6, y); g.quadraticCurveTo(x - 12, y - 14, x - 4, y - 18); g.stroke(); } }) },
    palms: { name: 'Рубашка с пальмами', price: 200, tex: T((g, s) => { fill('#f5e6c8')(g, s); for (let k = 0; k < 9; k++) { const x = Math.random() * s, y = Math.random() * s; g.strokeStyle = '#6a4a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2, y + 16); g.stroke(); g.fillStyle = '#2f8a44'; for (let a = 0; a < 5; a++) { g.save(); g.translate(x, y); g.rotate(a * 1.25); g.fillRect(0, -2, 11, 4); g.restore(); } } }) },
    leopard: { name: 'Леопардовая рубашка', price: 650, tex: spots('#d9a54a', ['#3a2410', '#6a4420'], 46, 4, 8) },
    zebra: { name: 'Рубашка-зебра', price: 550, tex: T((g, s) => { fill('#f5f5f0')(g, s); g.strokeStyle = '#141418'; g.lineWidth = 5; for (let y = 0; y < s; y += 14) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * .3, y + 10, s * .6, y - 8, s, y + 4); g.stroke(); } }) },
    silk: { name: 'Шёлковая рубашка', price: 800, sleeves: 'long', sleeve: '#7a3ad8', tex: T((g, s) => { const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#5a2ab0'); gr.addColorStop(.5, '#b07aff'); gr.addColorStop(1, '#5a2ab0'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }) },
    linen: { name: 'Льняная рубашка', price: 350, sleeves: 'long', sleeve: '#efe6d4', tex: T((g, s) => { fill('#efe6d4')(g, s); for (let y = 10; y < s; y += 18) { g.fillStyle = '#d8ccb4'; g.fillRect(s * .5 - 2, y, 4, 4); } }) },
    hoodie: { name: 'Серое худи', price: 260, sleeves: 'long', sleeve: '#8a8a94', tex: T((g, s) => { fill('#8a8a94')(g, s); g.fillStyle = '#76767f'; g.fillRect(s * .25, s * .62, s * .5, s * .22); g.fillStyle = '#f5f5f0'; g.fillRect(s * .44, 0, 2, s * .3); g.fillRect(s * .54, 0, 2, s * .3); }) },
    bomber: { name: 'Бомбер хаки', price: 480, sleeves: 'long', sleeve: '#4a5a3a', tex: jacket('#4a5a3a', '#ff8a1e', (g, s) => { g.fillStyle = '#2a2a24'; g.fillRect(0, s - 10, s, 10); }) },
    varsity: { name: 'Бейсбольная куртка', price: 520, sleeves: 'long', sleeve: '#f5f5f0', tex: T((g, s) => { fill('#b0203a')(g, s); g.fillStyle = '#f5f5f0'; g.fillRect(s * .49, 0, 3, s); text('N', '#f5f5f0', 30, .45)(g, s); }) },
    turtleneck: { name: 'Чёрная водолазка', price: 700, sleeves: 'long', sleeve: '#141418', tex: T((g, s) => { fill('#141418')(g, s); g.fillStyle = '#222228'; g.fillRect(0, 0, s, 10); }) },
    snake: { name: 'Куртка из змеиной кожи', price: 3500, sleeves: 'long', sleeve: '#8a8a5a', tex: T((g, s) => { fill('#7a7a4a')(g, s); for (let y = 0; y < s; y += 6) for (let x = (y / 6 % 2) * 4; x < s; x += 8) { g.fillStyle = (x + y) % 3 ? '#a8a870' : '#4a4a2a'; g.fillRect(x, y, 6, 4); } }) },
    croc: { name: 'Крокодиловый пиджак', price: 8000, sleeves: 'long', sleeve: '#2f5a2a', tex: jacket('#2f5a2a', '#141418', (g, s) => { for (let y = 0; y < s; y += 10) for (let x = 0; x < s; x += 10) { g.strokeStyle = '#1f3a1a'; g.strokeRect(x, y, 10, 10); } g.fillStyle = '#e8c547'; for (let y = 30; y < s; y += 22) g.fillRect(s * .5 - 3, y, 6, 6); }) },
    diamond: { name: 'Пиджак со стразами', price: 15000, sleeves: 'long', sleeve: '#c9ccd8', tex: jacket('#b8bcc8', '#141418', sparkle('#ffffff', '#8a8ea0', 260)) }
  });
  // trousers: a colour (or a pattern), shorts leave the shins bare
  const P = (name, price, color, o) => Object.assign({ name, price, color }, o || {});
  Object.assign(pants, {
    jeans: P('Синие джинсы', 0, 0x3b5a8a), black: P('Чёрные брюки', 0, 0x1a1a22), white: P('Белые брюки', 0, 0xf2efe6), beige: P('Бежевые чиносы', 0, 0xe8dcc0),
    darkjeans: P('Тёмные джинсы', 80, 0x2b3d6b), grey: P('Серые брюки', 120, 0x6a6a74), navy: P('Тёмно-синие брюки', 150, 0x18223c), olive: P('Брюки хаки', 180, 0x4a5a3a),
    track: P('Спортивные штаны', 140, 0x24242c), orange: P('Оранжевые штаны', 120, 0xc86a1e), red: P('Красные брюки', 260, 0x8a1f2a), pink: P('Розовые брюки', 280, 0xff9fc3),
    camo: P('Камуфляжные штаны', 350, 0xffffff, { tex: spots('#5a6a3a', ['#3a4a2a', '#7a7a4a', '#2a2a1e'], 30, 6, 12) }),
    plaid: P('Клетчатые брюки', 450, 0xffffff, { tex: T((g, s) => { fill('#8a1f2a')(g, s); g.fillStyle = 'rgba(20,20,30,.45)'; for (let x = 0; x < s; x += 16) g.fillRect(x, 0, 6, s); for (let y = 0; y < s; y += 16) g.fillRect(0, y, s, 6); }) }),
    leather: P('Кожаные штаны', 900, 0x141418), gold: P('Золотые брюки', 5000, 0xc9a227),
    sh_denim: P('Джинсовые шорты', 70, 0x4a6fa0, { shorts: true }), sh_white: P('Белые шорты', 60, 0xf2efe6, { shorts: true }), sh_khaki: P('Шорты хаки', 80, 0xb8a878, { shorts: true }),
    sh_board: P('Пляжные шорты', 90, 0xff4fa3, { shorts: true }),
    sh_hawaii: P('Гавайские шорты', 110, 0xffffff, { shorts: true, tex: T((g, s) => { fill('#2a6fe8')(g, s); for (let k = 0; k < 10; k++) { g.fillStyle = k % 2 ? '#ffffff' : '#ffd23d'; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 7, 0, 7); g.fill(); } }) })
  });
  Object.assign(shoes, {
    white: P('Белые кроссовки', 0, 0xf2f2f2), flip: P('Шлёпанцы', 20, 0xff7eb6), black: P('Чёрные туфли', 150, 0x141414), brown: P('Коричневые ботинки', 180, 0x5a3a22),
    red: P('Красные кроссовки', 220, 0xd0202a), cyan: P('Неоновые кроссовки', 300, 0x3fe6e0), whiteleather: P('Белые кожаные туфли', 600, 0xfaf6ee),
    croc: P('Крокодиловые туфли', 2500, 0x3a5a2a), gold: P('Золотые туфли', 4000, 0xd4af37)
  });
  // hats and glasses are small models built on the hero's head (see build() below)
  Object.assign(hat, {
    none: P('Без шляпы', 0), cap_red: P('Кепка, красная', 60, 0xc81e2a, { kind: 'cap' }), cap_black: P('Кепка, чёрная', 60, 0x1a1a1e, { kind: 'cap' }),
    cap_neon: P('Кепка NEPLOXO', 80, 0xff4fa3, { kind: 'cap' }), cap_notbad: P('Кепка NOT BAD', 150, 0x0a0a0c, { kind: 'cap' }), bandana: P('Бандана', 70, 0xc81e1e, { kind: 'bandana' }), beanie: P('Шапка-бини', 90, 0x2a6fe8, { kind: 'beanie' }),
    bucket: P('Панамка', 120, 0xf5e6a8, { kind: 'bucket' }), panama: P('Панама', 350, 0xf5f0e0, { kind: 'fedora', band: 0x141418 }),
    cowboy: P('Ковбойская шляпа', 450, 0x8a5a2a, { kind: 'cowboy' }), fedora: P('Федора', 600, 0x2a2a30, { kind: 'fedora', band: 0xb0203a }),
    tophat: P('Цилиндр', 1500, 0x141418, { kind: 'tophat' }), crown: P('Золотая корона', 25000, 0xe8c547, { kind: 'crown' }),
    police: P('Фуражка', 0, 0x18223c, { kind: 'police', hidden: true }),
    medcap: P('Кепка медика', 0, 0xf5f7f8, { kind: 'cap', hidden: true }),
    helmet: P('Каска пожарного', 0, 0xc81e1e, { kind: 'helmet', hidden: true })
  });
  // the service uniforms (handed out at the hospital and the fire station, never sold)
  Object.assign(top, {
    medic: { name: 'Форма медика', price: 0, hidden: true, sleeves: 'short', tex: tee('#f5f7f8', '#d8dde0', (g, s) => { g.fillStyle = '#d42a2a'; g.fillRect(s * .62, s * .3, s * .2, s * .07); g.fillRect(s * .685, s * .235, s * .07, s * .2); g.fillStyle = '#2a8a9a'; g.fillRect(0, s * .9, s, s * .1); }) },
    fire: { name: 'Боёвка пожарного', price: 0, hidden: true, sleeves: 'long', sleeve: '#4a4232', tex: jacket('#4a4232', '#3a3428', (g, s) => { for (const y of [.55, .8]) { g.fillStyle = '#e8e2c0'; g.fillRect(0, s * y, s, s * .06); g.fillStyle = '#e8c547'; g.fillRect(0, s * y + s * .06, s, s * .03); } }) }
  });
  Object.assign(glasses, {
    none: P('Без очков', 0), nerd: P('Очки ботаника', 90, 0x141418, { kind: 'nerd' }), shutter: P('Неоновые «жалюзи»', 120, 0x3fe6e0, { kind: 'shutter' }),
    star: P('Очки-звёзды', 180, 0xff4fa3, { kind: 'big' }), big: P('Огромные чёрные очки', 220, 0x141418, { kind: 'big' }), round: P('Круглые очки', 250, 0xc9a227, { kind: 'round' }),
    aviator: P('Авиаторы', 300, 0xc9a227, { kind: 'aviator' }), sport: P('Спортивные очки', 400, 0xff8a1e, { kind: 'sport' }), gold: P('Золотые очки', 2000, 0xe8c547, { kind: 'aviator', lens: 0xe8c547 })
  });
  Object.assign(chain, {
    none: P('Без цепи', 0), silver: P('Серебряная цепь', 500, 0xd8dce4), gold: P('Золотая цепь', 1200, 0xe8c547),
    dollar: P('Цепь с долларом', 3000, 0xe8c547, { pendant: '$' }), diamond: P('Бриллиантовое колье', 12000, 0xeaf6ff, { pendant: '◆' })
  });
  Object.assign(watch, {
    none: P('Без часов', 0), neon: P('Часы Neon', 400, 0x3fe6e0), gold: P('Золотые часы', 2500, 0xe8c547), diamond: P('Часы с бриллиантами', 9000, 0xeaf6ff)
  });
  NB.CLOTHES = { top, pants, shoes, hat, glasses, chain, watch };
  NB.SLOTS = [
    { id: 'top', name: 'Рубашки, футболки, куртки' }, { id: 'pants', name: 'Брюки и шорты' }, { id: 'shoes', name: 'Обувь' },
    { id: 'hat', name: 'Шляпы и кепки' }, { id: 'glasses', name: 'Очки' }, { id: 'chain', name: 'Цепи' }, { id: 'watch', name: 'Часы' }
  ];
  NB.DEFAULT_LOOK = { top: 'hawaii', pants: 'jeans', shoes: 'white', hat: 'none', glasses: 'none', chain: 'none', watch: 'none' };
  // what everyone starts with: the old four starter outfits and the plain basics
  NB.STARTER_WEAR = ['top:hawaii', 'top:vice', 'top:pink', 'top:sport', 'pants:jeans', 'pants:black', 'pants:white', 'pants:beige', 'shoes:white',
    'hat:none', 'glasses:none', 'chain:none', 'watch:none'];

  /* ---------- the women's line (for heroines to come) ---------- */
  NB.CLOTHES_F = {
    top: { crop_pink: P('Розовый кроп-топ', 60, 0xff7eb6), crop_white: P('Белый кроп-топ', 60, 0xf5f5f0), tube: P('Топ-бандо', 90, 0x3fe6e0), bikini: P('Верх бикини', 80, 0xffd23d),
      blouse: P('Шёлковая блузка', 450, 0xf5e6d4), corset: P('Корсет', 900, 0x141418), leopard_f: P('Леопардовый топ', 700, 0xd9a54a) },
    bottom: { mini_black: P('Чёрная мини-юбка', 120, 0x141418), mini_pink: P('Розовая мини-юбка', 120, 0xff4fa3), hotpants: P('Джинсовые шортики', 90, 0x4a6fa0),
      leggings: P('Леггинсы', 80, 0x24242c), skinny: P('Узкие джинсы', 150, 0x2b3d6b), pencil: P('Юбка-карандаш', 380, 0x8a1f2a) },
    dress: { red_dress: P('Красное платье', 900, 0xd0102a), gold_dress: P('Золотое вечернее платье', 6000, 0xe8c547), sun_dress: P('Летний сарафан', 240, 0xffd6e4),
      sequin: P('Платье с пайетками', 3500, 0xc9ccd8), neon_dress: P('Неоновое мини-платье', 700, 0x39ff6a) },
    shoes: { heels_red: P('Красные каблуки', 400, 0xd0202a), heels_black: P('Чёрные лодочки', 350, 0x141414), boots_white: P('Белые ботфорты', 900, 0xf5f5f0), sandals: P('Сандалии', 60, 0xc9a27a) },
    hat: { sunhat: P('Широкополая шляпа', 300, 0xf5e6a8), beret: P('Берет', 180, 0xb0203a), tiara: P('Диадема', 18000, 0xeaf6ff) },
    glasses: { cateye: P('Очки «кошачий глаз»', 350, 0xff4fa3), diva: P('Очки дивы', 800, 0x141418) }
  };

  /* ---------- putting it on the hero ---------- */
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const box = (parent, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b; };
  // hats and glasses, each a small group on the head; colour set per item
  function build(m) {
    const H = m.head, A = {}, add = (kind, fn) => { const g = new THREE.Group(); g.visible = false; H.add(g); const c = mat(0xffffff), c2 = mat(0x141418); fn(g, c, c2); A[kind] = { g, c, c2 }; };
    add('cap', (g, c) => { box(g, .25, .09, .26, c, 0, .38, -.005); box(g, .25, .03, .16, c, 0, .345, .1); });
    add('police', (g, c, c2) => { box(g, .25, .09, .26, c, 0, .38, -.005); box(g, .25, .03, .16, c2, 0, .34, .1); box(g, .06, .05, .02, mat(0xe8c547), 0, .39, .13); });
    add('helmet', (g, c) => { box(g, .27, .12, .28, c, 0, .4, -.005); box(g, .3, .025, .36, c, 0, .345, -.03); box(g, .06, .05, .02, mat(0xe8c547), 0, .42, .14); });
    add('bandana', (g, c) => { box(g, .245, .08, .255, c, 0, .33, -.005); box(g, .08, .06, .08, c, 0, .3, -.15); });
    add('beanie', (g, c) => { box(g, .255, .14, .265, c, 0, .38, -.005); box(g, .26, .04, .27, c, 0, .31, -.005); });
    add('bucket', (g, c) => { box(g, .25, .1, .26, c, 0, .4, -.005); box(g, .34, .035, .35, c, 0, .35, -.005); });
    add('fedora', (g, c, c2) => { box(g, .38, .025, .38, c, 0, .365, -.005); box(g, .24, .14, .25, c, 0, .44, -.005); box(g, .245, .035, .255, c2, 0, .39, -.005); });
    add('cowboy', (g, c) => { box(g, .5, .025, .44, c, 0, .365, -.005); box(g, .08, .03, .44, c, -.23, .385, -.005); box(g, .08, .03, .44, c, .23, .385, -.005); box(g, .24, .16, .26, c, 0, .45, -.005); });
    add('tophat', (g, c, c2) => { box(g, .34, .025, .34, c, 0, .365, -.005); box(g, .22, .3, .22, c, 0, .52, -.005); box(g, .225, .04, .225, mat(0xb0203a), 0, .4, -.005); });
    add('crown', (g, c) => { box(g, .25, .06, .26, c, 0, .38, -.005); for (const [x, z] of [[-.1, .11], [0, .11], [.1, .11], [-.1, -.12], [0, -.12], [.1, -.12], [-.11, 0], [.11, 0]]) box(g, .04, .08, .04, c, x, .44, z); box(g, .04, .04, .02, mat(0xff2d7a), 0, .38, .135); });
    add('aviator', (g, c, c2) => { for (const s of [-1, 1]) box(g, .075, .055, .02, c2, s * .055, .205, .13); box(g, .2, .012, .02, c, 0, .235, .13); for (const s of [-1, 1]) box(g, .012, .012, .16, c, s * .112, .22, .06); });
    add('round', (g, c, c2) => { for (const s of [-1, 1]) { box(g, .065, .065, .015, c2, s * .055, .2, .132); box(g, .075, .012, .02, c, s * .055, .237, .13); } for (const s of [-1, 1]) box(g, .012, .012, .16, c, s * .112, .22, .06); });
    add('nerd', (g, c, c2) => { for (const s of [-1, 1]) { box(g, .08, .06, .015, mat(0xbfd8e8), s * .055, .205, .132); box(g, .085, .018, .02, c, s * .055, .24, .133); } for (const s of [-1, 1]) box(g, .014, .014, .16, c, s * .112, .22, .06); });
    add('big', (g, c) => { for (const s of [-1, 1]) box(g, .11, .09, .02, c, s * .06, .205, .132); for (const s of [-1, 1]) box(g, .014, .014, .16, c, s * .118, .22, .06); });
    add('shutter', (g, c) => { for (let k = 0; k < 4; k++) box(g, .22, .01, .02, c, 0, .185 + k * .015, .132); for (const s of [-1, 1]) box(g, .014, .014, .16, c, s * .112, .21, .06); });
    add('sport', (g, c) => { box(g, .24, .05, .025, c, 0, .205, .13); for (const s of [-1, 1]) box(g, .014, .03, .16, c, s * .118, .21, .06); });
    // a chain round the neck (front of the collar), a pendant; a watch on the left wrist
    const ch = new THREE.Group(); ch.visible = false; m.torso.add(ch); const chM = mat(0xe8c547);
    box(ch, .16, .02, .02, chM, 0, .48, .118); for (const s of [-1, 1]) box(ch, .02, .08, .02, chM, s * .075, .44, .118); box(ch, .1, .02, .02, chM, 0, .4, .118);
    const pend = box(ch, .05, .06, .015, chM, 0, .36, .122);
    const wa = new THREE.Group(); wa.visible = false; m.aL.el.add(wa); const waM = mat(0xe8c547);
    box(wa, .1, .05, .1, waM, 0, -.22, 0); box(wa, .04, .03, .02, mat(0x141418), 0, -.22, .052);
    return { A, ch, chM, pend, wa, waM };
  }
  const skinHex = 0xc98f65;
  // look: { top, pants, shoes, hat, glasses, chain, watch } of item keys
  NB.dressHero = function (m, look) {
    if (!m.acc) m.acc = build(m);
    const C = NB.CLOTHES, L = Object.assign({}, NB.DEFAULT_LOOK, look);
    const tp = C.top[L.top] || C.top.hawaii;
    if (!tp.map) tp.map = tp.tex();
    m.shirt.map = tp.map; m.shirt.needsUpdate = true;
    // sleeves: none (bare upper arm), short, long (down to the wrist in the jacket's colour)
    const sleeve = tp.sleeves === 'long' ? (m.sleeveMat || (m.sleeveMat = mat(0xffffff))) : null;
    if (sleeve) sleeve.color.set(tp.sleeve || '#ffffff');
    for (const a of [m.aL, m.aR]) { a.up.material = tp.sleeves === 'tank' ? m.skin : m.shirt; a.elb.material = sleeve || m.skin; a.fore.material = sleeve || m.skin; }
    const pn = C.pants[L.pants] || C.pants.jeans;
    if (pn.tex && !pn.map) pn.map = pn.tex();
    const hadMap = !!m.jeans.map; m.jeans.map = pn.map || null; if (hadMap !== !!m.jeans.map) m.jeans.needsUpdate = true;
    m.jeans.color.setHex(pn.map ? 0xffffff : pn.color);
    for (const l of [m.lL, m.lR]) l.shin.material = pn.shorts ? m.skin : m.jeans;
    m.shoe.color.setHex((C.shoes[L.shoes] || C.shoes.white).color);
    const h = C.hat[L.hat] || C.hat.none, gl = C.glasses[L.glasses] || C.glasses.none;
    for (const k in m.acc.A) m.acc.A[k].g.visible = false;
    if (h.kind) { const a = m.acc.A[h.kind]; a.g.visible = true; a.c.color.setHex(h.color); if (h.band != null) a.c2.color.setHex(h.band); }
    if (gl.kind) { const a = m.acc.A[gl.kind]; a.g.visible = true; a.c.color.setHex(gl.color); a.c2.color.setHex(gl.lens != null ? gl.lens : 0x141418); }
    m.hairTop.visible = !(h.kind === 'beanie' || h.kind === 'tophat');   // a tall hat hides the hair
    m.cap.visible = false;
    const cn = C.chain[L.chain] || C.chain.none, wt = C.watch[L.watch] || C.watch.none;
    m.acc.ch.visible = cn.color != null; if (cn.color != null) m.acc.chM.color.setHex(cn.color);
    m.acc.pend.visible = !!cn.pendant;
    m.acc.wa.visible = wt.color != null; if (wt.color != null) m.acc.waM.color.setHex(wt.color);
    return L;
  };
  NB.skinHex = skinHex;
})(window.NB);

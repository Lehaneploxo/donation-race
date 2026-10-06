// LEHA NEPLOXO WORLD: the brand. The round "NOT BAD" logo (drawn, not an image) and the giant billboards
// round Neploxo City with the president's photo: "ПРЕЗИДЕНТ МИРА LEHA NEPLOXO".
(function (NB) {
  'use strict';

  // the logo: a black disc, two white rings, NOT / BAD in heavy white letters
  NB.drawLogo = function (g, cx, cy, r) {
    g.save();
    g.fillStyle = '#000000'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = r * .055;
    g.beginPath(); g.arc(cx, cy, r * .9, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, r * .78, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 ' + Math.round(r * .5) + 'px Rubik, "Arial Black", Arial, sans-serif';
    g.fillText('NOT', cx, cy - r * .24); g.fillText('BAD', cx, cy + r * .3);
    g.restore();
  };

  // one billboard picture: the photo on the left, the title, the name and the logo on the right
  function billboardTexture() {
    const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 1024;
    const g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
    const draw = img => {
      const W = cv.width, H = cv.height;
      const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#1a0a2e'); bg.addColorStop(.55, '#3a0f4a'); bg.addColorStop(1, '#ff2d7a');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // a sunset and a grid, the 80s way
      const sun = g.createLinearGradient(0, H * .2, 0, H * .8); sun.addColorStop(0, '#ffd84f'); sun.addColorStop(1, '#ff4fa3');
      g.fillStyle = sun; g.globalAlpha = .35; g.beginPath(); g.arc(W * .7, H * .62, H * .42, Math.PI, 0); g.fill(); g.globalAlpha = 1;
      g.strokeStyle = 'rgba(63,230,224,.35)'; g.lineWidth = 3; for (let x = 0; x <= W; x += 128) { g.beginPath(); g.moveTo(x, H * .78); g.lineTo(W * .5 + (x - W * .5) * 2.2, H); g.stroke(); } for (let y = H * .78; y < H; y += 44) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      // the photo in a gold frame
      const px = 70, py = 70, ph = H - 140, pw = ph * (img ? img.width / img.height : .82);
      g.fillStyle = '#e8c547'; g.fillRect(px - 16, py - 16, pw + 32, ph + 32);
      if (img) g.drawImage(img, px, py, pw, ph); else { g.fillStyle = '#2a2a30'; g.fillRect(px, py, pw, ph); }
      // the words
      const tx = px + pw + 60 + (W - (px + pw + 60)) / 2 - 90;
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.shadowColor = '#ff2d7a'; g.shadowBlur = 30; g.fillStyle = '#ffffff';
      g.font = '900 118px Rubik, "Arial Black", Arial, sans-serif'; g.fillText('ПРЕЗИДЕНТ', tx, 240);
      g.font = '900 150px Rubik, "Arial Black", Arial, sans-serif'; g.fillText('МИРА', tx, 400);
      g.shadowColor = '#3fe6e0'; g.fillStyle = '#ffe98a';
      g.font = '900 150px Rubik, "Arial Black", Arial, sans-serif'; g.fillText('LEHA', tx, 600);
      g.fillText('NEPLOXO', tx, 760);
      g.shadowBlur = 0;
      g.font = '700 58px Rubik, Arial, sans-serif'; g.fillStyle = '#ffffff'; g.fillText('Лёха Неплохо · Неплохо Сити', tx, 860);
      NB.drawLogo(g, W - 175, H - 175, 130);
      g.font = '900 120px Rubik, "Arial Black", Arial, sans-serif'; g.fillStyle = '#3fe6e0'; g.shadowColor = '#3fe6e0'; g.shadowBlur = 24; g.fillText('21', W - 175, 190); g.shadowBlur = 0;
      tex.needsUpdate = true;
    };
    draw(null);
    const img = new Image();
    img.onload = () => { const redraw = () => draw(img); redraw(); if (document.fonts && document.fonts.load) document.fonts.load('900 100px Rubik').then(redraw).catch(() => {}); };
    img.src = 'img/leha.jpg';
    return tex;
  }

  // billboards: [x, z, facing (radians, the side with the picture), width]; both sides carry the picture
  NB.buildBillboards = function ({ scene, col, spots }) {
    const tex = billboardTexture();
    const face = new THREE.MeshBasicMaterial({ map: tex, fog: false });
    const steel = new THREE.MeshLambertMaterial({ color: 0x3a3a44 }), neon = new THREE.MeshBasicMaterial({ color: 0xff4fa3 });
    const out = [];
    for (const [x, z, h, W, y0, gy] of spots) {
      const H = W / 2, g = new THREE.Group(); g.position.set(x, gy || 0, z); g.rotation.y = h; scene.add(g);
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(W, H), face); p.position.set(0, y0 + H / 2, s * .16); if (s < 0) p.rotation.y = Math.PI; g.add(p);
      }
      const back = new THREE.Mesh(new THREE.BoxGeometry(W + .6, H + .6, .28), steel); back.position.y = y0 + H / 2; g.add(back);
      for (const [yy, hh] of [[y0 - .3, .16], [y0 + H + .3, .16]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(W + .8, hh, .36), neon); b.position.y = yy; g.add(b); }
      for (const s of [-1, 1]) {
        const px = s * W * .3, post = new THREE.Mesh(new THREE.BoxGeometry(.6, y0, .6), steel); post.position.set(px, y0 / 2, 0); g.add(post);
        const wx = x + Math.cos(h) * px, wz = z - Math.sin(h) * px;
        col.add(wx - .35, -4, wz - .35, wx + .35, (gy || 0) + y0, wz + .35);
      }
      out.push(g);
    }
    return out;
  };
})(window.NB);

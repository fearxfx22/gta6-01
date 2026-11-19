// HUD for Solmar Bay: the on-screen readouts (health, cash, wanted stars,
// ammo, objective), the minimap (a top-down canvas: roads, the player
// arrow, mission and police blips), the dialogue/message feed, and the
// menus (title, pause, mission complete, busted, game over). All DOM —
// the 3D canvas stays clean for the game itself.

import { clamp, WORLD, districtAt } from './util.js';

export function buildHud() {
  const hud = {};
  hud.root = document.getElementById('hud');
  hud.healthFill = document.getElementById('health-fill');
  hud.healthText = document.getElementById('health-text');
  hud.cashText = document.getElementById('cash');
  hud.stars = document.getElementById('stars');
  hud.ammoText = document.getElementById('ammo');
  hud.objectiveText = document.getElementById('objective');
  hud.locationText = document.getElementById('location');
  hud.messageFeed = document.getElementById('messages');
  hud.minimap = document.getElementById('minimap');
  hud.mapCtx = hud.minimap.getContext('2d');
  hud.prompt = document.getElementById('prompt');
  hud.title = document.getElementById('title-screen');
  hud.pause = document.getElementById('pause-screen');
  hud.complete = document.getElementById('complete-screen');
  hud.completeTitle = document.getElementById('complete-title');
  hud.completeText = document.getElementById('complete-text');
  hud.busted = document.getElementById('busted-screen');
  hud.gameover = document.getElementById('gameover-screen');
  hud.dialogue = document.getElementById('dialogue');
  hud.dialogueName = document.getElementById('dialogue-name');
  hud.dialogueText = document.getElementById('dialogue-text');
  hud.dialogueTimer = 0;
  return hud;
}

export function setHealth(hud, hp, max) {
  const pct = clamp((hp / max) * 100, 0, 100);
  hud.healthFill.style.width = pct + '%';
  hud.healthFill.style.background = pct > 50 ? '#7dc86a' : pct > 25 ? '#e8a83a' : '#c23a2e';
  hud.healthText.textContent = Math.ceil(hp) + '';
}

export function setCash(hud, cash) {
  hud.cashText.textContent = '$' + cash.toLocaleString('en-US');
}

export function setWantedStars(hud, level) {
  let s = '';
  for (let i = 0; i < 5; i++) s += i < level ? '★' : '☆';
  hud.stars.textContent = s;
  hud.stars.style.color = level >= 3 ? '#ff5040' : '#ffd76a';
}

export function setAmmo(hud, ammo, reserve) {
  hud.ammoText.textContent = `◉ ${ammo} / ${reserve}`;
}

export function setObjective(hud, text) {
  hud.objectiveText.textContent = text;
}

export function setLocation(hud, x, z) {
  hud.locationText.textContent = districtAt(x, z);
}

export function setPrompt(hud, text) {
  if (text) {
    hud.prompt.textContent = text;
    hud.prompt.style.display = 'block';
  } else {
    hud.prompt.style.display = 'none';
  }
}

export function showMessage(hud, text, ms = 4200) {
  const div = document.createElement('div');
  div.className = 'message';
  div.textContent = text;
  hud.messageFeed.appendChild(div);
  while (hud.messageFeed.children.length > 4) {
    hud.messageFeed.removeChild(hud.messageFeed.firstChild);
  }
  setTimeout(() => div.remove(), ms);
}

export function showDialogue(hud, name, text, ms = 6500) {
  hud.dialogueName.textContent = name;
  hud.dialogueText.textContent = text;
  hud.dialogue.style.display = 'block';
  hud.dialogueTimer = ms / 1000;
}

export function updateDialogue(hud, dt) {
  if (hud.dialogueTimer > 0) {
    hud.dialogueTimer -= dt;
    if (hud.dialogueTimer <= 0) hud.dialogue.style.display = 'none';
  }
}

// --- Minimap ---------------------------------------------------------------
// Top-down 2D canvas. World (-190..190) maps to the canvas; roads are drawn
// as a grid, the sea/beach as a band at the bottom, and blips mark the
// player (white arrow), the mission target (gold diamond), police (blue)
// and the lighthouse (gold star).
export function drawMinimap(hud, state) {
  const ctx = hud.mapCtx;
  const S = hud.minimap.width;
  const toMap = (x, z) => [(x + 190) / 380 * S, (z + 190) / 380 * S];
  ctx.clearRect(0, 0, S, S);
  // Land.
  ctx.fillStyle = '#20242a';
  ctx.fillRect(0, 0, S, S);
  // Sea (south) and marina water (east).
  ctx.fillStyle = '#2e6f8e';
  const [, seaY] = toMap(0, 152);
  ctx.fillRect(0, seaY, S, S - seaY);
  const [marX] = toMap(126, 0);
  ctx.fillRect(marX, 0, S - marX, S);
  // Beach strip.
  ctx.fillStyle = '#c8a86a';
  const [, beachY] = toMap(0, 126);
  ctx.fillRect(0, beachY, S, seaY - beachY);
  // Roads.
  ctx.strokeStyle = '#4a4f58';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 7; i++) {
    const c = -126 + i * 36;
    const [x] = toMap(c, 0);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
    const [, z] = toMap(0, c);
    ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(S, z); ctx.stroke();
  }
  // Mission target.
  if (state.target) {
    const [tx, tz] = toMap(state.target.x, state.target.z);
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.moveTo(tx, tz - 6); ctx.lineTo(tx + 5, tz); ctx.lineTo(tx, tz + 6); ctx.lineTo(tx - 5, tz);
    ctx.closePath(); ctx.fill();
  }
  // Police blips.
  ctx.fillStyle = '#5a8aff';
  for (const p of state.police) {
    const [px, pz] = toMap(p.x, p.z);
    ctx.beginPath(); ctx.arc(px, pz, 3, 0, Math.PI * 2); ctx.fill();
  }
  // Lighthouse.
  const [lx, lz] = toMap(-142, 140);
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('✦', lx, lz + 3);
  // Player arrow (rotates with heading).
  const [px, pz] = toMap(state.player.x, state.player.z);
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(state.player.heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // View cone (faint, shows where the camera looks).
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(state.player.heading);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 26, -0.5, 0.5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// --- Menus -------------------------------------------------------------------
export function showTitle(hud) {
  hud.title.style.display = 'flex';
  hud.root.style.display = 'none';
}

export function hideTitle(hud) {
  hud.title.style.display = 'none';
  hud.root.style.display = 'block';
}

export function showPause(hud, show) {
  hud.pause.style.display = show ? 'flex' : 'none';
}

export function showComplete(hud, title, text) {
  hud.completeTitle.textContent = title;
  hud.completeText.textContent = text;
  hud.complete.style.display = 'flex';
  setTimeout(() => { hud.complete.style.display = 'none'; }, 4200);
}

export function showBusted(hud) {
  hud.busted.style.display = 'flex';
}

export function hideBusted(hud) {
  hud.busted.style.display = 'none';
}

export function showGameOver(hud) {
  hud.gameover.style.display = 'flex';
}

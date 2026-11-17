// HUD: stars, health, cash, objective, speedometer, crosshair, toasts, banners,
// Vera's dialogue, and the 2D minimap (roads, blips, mission marker).
//
// DOM writes are cached — a value is only written when it changes, so the
// objective panel does not touch the DOM every frame. The minimap is the one
// thing redrawn every frame (it is a canvas, and the blips move).
import { MISSION_REWARDS, WORLD } from './config.js';

const MAP_SIZE = 190;
const MAP_SPAN = 560; // world -280..280 -> canvas

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const starsEl = $('stars');
  const healthFill = $('healthfill');
  const cashEl = $('cash');
  const missionNameEl = $('missionname');
  const objectiveEl = $('objective');
  const distEl = $('objdist');
  const speedEl = $('speed');
  const crossEl = $('crosshair');
  const hitEl = $('hitmarker');
  const toastEl = $('toast');
  const bannerEl = $('banner');
  const dialogueEl = $('dialogue');
  const vignetteEl = $('vignette');
  const flashEl = $('wantedflash');
  const map = $('minimap').getContext('2d');

  const cache = { stars: -1, health: -1, cash: -1, objective: '', objText: '', dist: '', speed: -1 };
  let toastTimer = 0;
  let bannerTimer = 0;
  let dialogueTimer = 0;
  let hitTimer = 0;
  let hurtTimer = 0;
  let flashPhase = 0;

  // --- minimap layers -------------------------------------------------------
  const scale = MAP_SIZE / MAP_SPAN;
  const toX = (x) => MAP_SIZE / 2 + x * scale;
  const toZ = (z) => MAP_SIZE / 2 + z * scale;

  function drawMapTerrain() {
    map.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    map.fillStyle = '#0a1220';
    map.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Ocean (east) + beach strip.
    map.fillStyle = '#1a6f92';
    map.fillRect(toX(WORLD.oceanX), 0, MAP_SIZE - toX(WORLD.oceanX), MAP_SIZE);
    map.fillStyle = '#8a7a55';
    map.fillRect(toX(WORLD.beachX), 0, toX(WORLD.oceanX) - toX(WORLD.beachX), MAP_SIZE);
  }

  function drawMapRoads() {
    map.strokeStyle = '#5a6068';
    map.lineWidth = 4;
    const nodes = G.world.nodes;
    const seen = new Set();
    for (let i = 0; i < nodes.length; i += 1) {
      for (const j of nodes[i].links) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        map.beginPath();
        map.moveTo(toX(nodes[i].x), toZ(nodes[i].z));
        map.lineTo(toX(nodes[j].x), toZ(nodes[j].z));
        map.stroke();
      }
    }
    // Blocks.
    map.fillStyle = '#2a3138';
    for (const bx of [-150, -90, -30, 30, 90, 150]) {
      for (const bz of [-150, -90, -30, 30, 90, 150]) {
        map.fillRect(toX(bx - 20), toZ(bz - 20), 40 * scale, 40 * scale);
      }
    }
  }

  function drawMapMarker() {
    const target = G.missions ? G.missions.target() : null;
    if (!target) return;
    // Mission marker: pulsing gold diamond.
    const pulse = 6 + Math.sin(G.time * 5) * 2;
    map.strokeStyle = '#ffc24b';
    map.lineWidth = 2;
    map.beginPath();
    map.arc(toX(target.x), toZ(target.z), pulse, 0, Math.PI * 2);
    map.stroke();
    map.fillStyle = '#ffc24b';
    map.beginPath();
    map.moveTo(toX(target.x), toZ(target.z) - 6);
    map.lineTo(toX(target.x) + 5, toZ(target.z));
    map.lineTo(toX(target.x), toZ(target.z) + 6);
    map.lineTo(toX(target.x) - 5, toZ(target.z));
    map.fill();
  }

  function drawMapBlips() {
    const dot = (x, z, r, color) => {
      map.fillStyle = color;
      map.beginPath();
      map.arc(toX(x), toZ(z), r, 0, Math.PI * 2);
      map.fill();
    };
    // Enemies, police, traffic.
    if (G.combat) {
      for (const e of G.combat.enemies) if (!e.dead) dot(e.x, e.z, 3, '#ff3b30');
    }
    if (G.police) {
      const blue = Math.floor(G.time * 4) % 2 === 0;
      for (const c of G.police.cruisers) {
        dot(c.car.pos.x, c.car.pos.z, 3.5, blue ? '#3b82ff' : '#ff3b30');
      }
      for (const c of G.police.cops) dot(c.x, c.z, 2.5, '#3b82ff');
    }
    if (G.vehicles) {
      for (const c of G.vehicles.cars) {
        if (c.driver === 'player' || c.parked) continue;
        dot(c.pos.x, c.pos.z, 2, '#cfd6dd');
      }
    }
  }

  function drawMapPlayer() {
    const px = G.player.pos.x;
    const pz = G.player.pos.z;
    const h = G.driving ? G.driving.heading : G.player.heading;
    map.save();
    map.translate(toX(px), toZ(pz));
    map.rotate(Math.PI - h); // map x = east, y = south; arrow drawn pointing up
    map.fillStyle = '#fff';
    map.beginPath();
    map.moveTo(0, -7);
    map.lineTo(5, 6);
    map.lineTo(0, 3);
    map.lineTo(-5, 6);
    map.closePath();
    map.fill();
    map.restore();
    // North tick.
    map.fillStyle = '#d8c9a8';
    map.font = 'bold 11px sans-serif';
    map.fillText('N', MAP_SIZE - 14, 14);
  }

  function drawMinimap() {
    drawMapTerrain();
    drawMapRoads();
    drawMapMarker();
    drawMapBlips();
    drawMapPlayer();
  }

  // --- HUD ------------------------------------------------------------------
  return {
    toast(text, ms = 2600) {
      toastEl.textContent = text;
      toastEl.classList.remove('hidden');
      toastTimer = ms / 1000;
    },
    banner(big, sub, ms = 2800) {
      bannerEl.querySelector('.big').textContent = big;
      bannerEl.querySelector('.sub').textContent = sub;
      bannerEl.classList.remove('hidden');
      bannerTimer = ms / 1000;
    },
    dialogue(speaker, text, ms = 4200) {
      dialogueEl.innerHTML = `<b>${speaker}:</b> ${text}`;
      dialogueEl.classList.remove('hidden');
      dialogueTimer = ms / 1000;
    },
    hitmarker() {
      hitEl.classList.add('show');
      hitTimer = 0.12;
    },
    hurt() {
      hurtTimer = 0.7;
    },
    update(dt) {
      // Stars (five stars pulse when the whole bay is after you).
      if (G.wanted !== cache.stars) {
        cache.stars = G.wanted;
        let s = '';
        for (let i = 0; i < 5; i += 1) {
          s += i < G.wanted ? '★' : '<span class="off">★</span>';
        }
        starsEl.innerHTML = s;
        starsEl.classList.toggle('max', G.wanted >= 5);
      }
      // Health.
      const hp = Math.round(G.player.health);
      if (hp !== cache.health) {
        cache.health = hp;
        healthFill.style.width = `${hp}%`;
        healthFill.classList.toggle('low', hp < 35);
      }
      if (G.cash !== cache.cash) {
        cache.cash = G.cash;
        cashEl.innerHTML = `$${G.cash.toLocaleString('en-US')} <small>cash</small>`;
      }
      // Objective (name + reward) and the objective text itself: both cached,
      // so the DOM is only touched when something actually changes.
      const m = G.missions;
      const active = m && m.activeMission();
      const name = active
        ? `${active.name} — $${MISSION_REWARDS[m.currentIndex].toLocaleString('en-US')}`
        : 'Free roam';
      const obj = m
        ? m.objectiveText()
        : 'Explore Solmar Bay. Steal a car with E, lose the cops, find work.';
      if (name !== cache.objective) {
        cache.objective = name;
        missionNameEl.textContent = name;
      }
      if (obj !== cache.objText) {
        cache.objText = obj;
        objectiveEl.textContent = obj;
      }
      const t = m ? m.target() : null;
      const distText = t
        ? `${Math.round(Math.hypot(t.x - G.player.pos.x, t.z - G.player.pos.z))} m`
        : '';
      if (distText !== cache.dist) {
        cache.dist = distText;
        distEl.textContent = distText;
      }
      // Speed + crosshair.
      const kmh = G.driving ? Math.round(Math.abs(G.driving.speed) * 3.6) : -1;
      if (kmh !== cache.speed) {
        cache.speed = kmh;
        if (kmh < 0) speedEl.classList.add('hidden');
        else {
          speedEl.classList.remove('hidden');
          speedEl.innerHTML = `${kmh} <small>km/h</small>`;
        }
      }
      crossEl.classList.toggle('hidden', !!G.driving || G.screen !== 'play');
      // Timers.
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) toastEl.classList.add('hidden');
      }
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) bannerEl.classList.add('hidden');
      }
      if (dialogueTimer > 0) {
        dialogueTimer -= dt;
        if (dialogueTimer <= 0) dialogueEl.classList.add('hidden');
      }
      if (hitTimer > 0) {
        hitTimer -= dt;
        if (hitTimer <= 0) hitEl.classList.remove('show');
      }
      // Hurt vignette + police light wash.
      if (hurtTimer > 0) {
        hurtTimer -= dt;
        vignetteEl.classList.toggle('hurt', hurtTimer > 0.25);
      } else vignetteEl.classList.remove('hurt');
      if (G.wanted > 0 && G.police && G.police.nearestDist < 90) {
        flashPhase += dt;
        flashEl.style.opacity = Math.floor(flashPhase * 3) % 2 === 0 ? 1 : 0;
      } else flashEl.style.opacity = 0;
      drawMinimap();
    },
  };
}

// City builder for Solmar Bay: the 7x7 road grid, buildings, beach and sea,
// the north docks, the east marina, the lighthouse, street props. Every
// placement comes from one seeded RNG, so the layout is identical on every
// load. Returns the colliders (building AABBs) and the road network the
// traffic and pedestrians drive and walk on.

import * as THREE from 'three';
import {
  makeRng, pick, range, rangeInt, clamp,
  WORLD, roadCoord, blockCoord, PALETTE,
} from './util.js';

function windowTexture() {
  // One shared canvas texture: a lit window grid. Buildings tint it with
  // their own material colour, so one texture serves the whole city.
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 22) {
    for (let x = 8; x < 120; x += 20) {
      const lit = Math.random() < 0.42;
      g.fillStyle = lit ? '#ffd98a' : '#33414f';
      g.fillRect(x, y, 12, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadTexture() {
  // Asphalt with a dashed centre line, tiled along each road strip.
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#333338';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#c8b45a';
  g.fillRect(30, 6, 4, 22);
  g.fillStyle = '#2a2a2e';
  for (let i = 0; i < 40; i++) {
    g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const winTex = windowTexture();
  const roadTex = roadTexture();

  // --- Ground ------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshStandardMaterial({ color: 0x7d8a6a, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 40);
  ground.receiveShadow = true;
  group.add(ground);

  // City base slab (concrete) under the grid.
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(WORLD.halfCity * 2 + 12, 0.4, WORLD.halfCity * 2 + 12),
    new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 1 }),
  );
  slab.position.set(0, 0.05, 0);
  slab.receiveShadow = true;
  group.add(slab);

  // --- Roads ---------------------------------------------------------------
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
  for (let i = 0; i <= WORLD.grid; i++) {
    const c = roadCoord(i);
    // North-south road.
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadWidth, WORLD.halfCity * 2 + 4), roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.rotation.z = Math.PI / 2;
    ns.position.set(c, 0.28, 0);
    ns.receiveShadow = true;
    group.add(ns);
    // East-west road.
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadWidth, WORLD.halfCity * 2 + 4), roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.28, c);
    ew.receiveShadow = true;
    group.add(ew);
  }

  // --- Buildings -----------------------------------------------------------
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 1 });
  const buildingGeos = [];
  for (let bx = 0; bx < WORLD.grid; bx++) {
    for (let bz = 0; bz < WORLD.grid; bz++) {
      const cx = blockCoord(bx);
      const cz = blockCoord(bz);
      // The garage plot and the cafe plot stay open (mission landmarks).
      if (Math.abs(cx - -96) < 20 && Math.abs(cz - 96) < 20) continue;
      if (Math.abs(cx - 102) < 20 && Math.abs(cz - 42) < 20) continue;
      const distCenter = Math.abs(cx) + Math.abs(cz);
      const tall = distCenter < 60;
      const count = rangeInt(rng, 1, tall ? 2 : 3);
      for (let k = 0; k < count; k++) {
        const w = range(rng, 10, 18);
        const d = range(rng, 10, 18);
        const h = tall ? range(rng, 18, 46) : range(rng, 8, 20);
        const ox = cx + range(rng, -6, 6);
        const oz = cz + range(rng, -6, 6);
        const color = pick(rng, PALETTE.building);
        const sideMat = new THREE.MeshStandardMaterial({
          map: winTex, color, roughness: 0.85, metalness: 0.05,
        });
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat],
        );
        mesh.position.set(ox, h / 2 + 0.25, oz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        colliders.push({ minX: ox - w / 2, maxX: ox + w / 2, minZ: oz - d / 2, maxZ: oz + d / 2 });
        buildingGeos.push(mesh);
      }
    }
  }

  // --- Vera's Garage (mission landmark, southwest) -------------------------
  const garage = new THREE.Group();
  garage.position.set(-96, 0, 96);
  const gBase = new THREE.Mesh(
    new THREE.BoxGeometry(20, 7, 14),
    new THREE.MeshStandardMaterial({ color: 0xb8503c, roughness: 0.8 }),
  );
  gBase.position.y = 3.5;
  gBase.castShadow = true;
  garage.add(gBase);
  const gDoor = new THREE.Mesh(
    new THREE.BoxGeometry(12, 5, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.4, metalness: 0.6 }),
  );
  gDoor.position.set(0, 2.5, 7.1);
  garage.add(gDoor);
  const gSign = makeSign('VERA\'S GARAGE', 0xffd98a);
  gSign.position.set(0, 8.6, 0);
  garage.add(gSign);
  group.add(garage);
  colliders.push({ minX: -106, maxX: -86, minZ: 89, maxZ: 103 });

  // --- Marina Cafe (mission landmark, east) --------------------------------
  const cafe = new THREE.Group();
  cafe.position.set(102, 0, 42);
  const cBase = new THREE.Mesh(
    new THREE.BoxGeometry(16, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0x4a90a8, roughness: 0.8 }),
  );
  cBase.position.y = 3;
  cBase.castShadow = true;
  cafe.add(cBase);
  const cAwning = new THREE.Mesh(
    new THREE.BoxGeometry(17, 0.4, 6),
    new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.9 }),
  );
  cAwning.position.set(0, 5.2, 7);
  cafe.add(cAwning);
  const cSign = makeSign('MARINA CAFE', 0x9fd8e8);
  cSign.position.set(0, 7.6, 0);
  cafe.add(cSign);
  group.add(cafe);
  colliders.push({ minX: 94, maxX: 110, minZ: 36, maxZ: 48 });

  // --- Beach and sea (south) ------------------------------------------------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 30),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.22, WORLD.beachStart + 13);
  sand.receiveShadow = true;
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 260),
    new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.25, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.1, WORLD.seaStart + 128);
  group.add(sea);
  // Boardwalk along the beach edge.
  const boardwalk = new THREE.Mesh(
    new THREE.BoxGeometry(300, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 }),
  );
  boardwalk.position.set(0, 0.4, WORLD.beachStart + 2);
  boardwalk.receiveShadow = true;
  group.add(boardwalk);

  // --- North docks: container yard ------------------------------------------
  const dockSlab = new THREE.Mesh(
    new THREE.BoxGeometry(280, 0.4, 44),
    new THREE.MeshStandardMaterial({ color: 0x6a6a66, roughness: 1 }),
  );
  dockSlab.position.set(0, 0.15, -147);
  dockSlab.receiveShadow = true;
  group.add(dockSlab);
  const containerColors = [0xc8542e, 0x2e7d8a, 0x8a9a3a, 0xb83a4a, 0x3a6ab8];
  for (let i = 0; i < 26; i++) {
    const w = 12;
    const h = range(rng, 2.6, 5.2);
    const d = 2.6;
    const x = range(rng, -120, 120);
    const z = range(rng, -164, -132);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: pick(rng, containerColors), roughness: 0.7, metalness: 0.3 }),
    );
    mesh.position.set(x, h / 2 + 0.3, z);
    mesh.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
    mesh.castShadow = true;
    group.add(mesh);
    colliders.push({ minX: x - 6, maxX: x + 6, minZ: z - 6, maxZ: z + 6 });
  }
  // Two gantry cranes over the yard.
  for (const cx of [-60, 60]) {
    const crane = new THREE.Group();
    crane.position.set(cx, 0, -150);
    const legMat = new THREE.MeshStandardMaterial({ color: 0xd8a03a, roughness: 0.6, metalness: 0.4 });
    for (const [lx, lz] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 1.2), legMat);
      leg.position.set(lx, 11, lz);
      leg.castShadow = true;
      crane.add(leg);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(30, 1.6, 2), legMat);
    beam.position.set(0, 22, 0);
    beam.castShadow = true;
    crane.add(beam);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), legMat);
    hook.position.set(8, 18, 0);
    crane.add(hook);
    group.add(crane);
  }

  // --- East marina: piers and boats ------------------------------------------
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(26, 0.6, 4), pierMat);
    pier.position.set(152, 0.4, 20 + i * 34);
    pier.castShadow = true;
    group.add(pier);
    const boat = new THREE.Group();
    boat.position.set(160, 0.6, 26 + i * 34);
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(10, 2, 3.4),
      new THREE.MeshStandardMaterial({ color: pick(rng, [0xe8e8e8, 0x3a6ab8, 0xc8542e]), roughness: 0.4 }),
    );
    hull.position.y = 1;
    boat.add(hull);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(4, 1.8, 2.6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    );
    cabin.position.set(-1, 2.6, 0);
    boat.add(cabin);
    group.add(boat);
  }
  const marinaWater = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 130),
    new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.25, metalness: 0.1 }),
  );
  marinaWater.rotation.x = -Math.PI / 2;
  marinaWater.position.set(158, 0.1, 54);
  group.add(marinaWater);

  // --- Lighthouse (southwest point) ------------------------------------------
  const light = new THREE.Group();
  light.position.set(-142, 0, 140);
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 4.4, 26, 12),
    new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.8 }),
  );
  tower.position.y = 13;
  tower.castShadow = true;
  light.add(tower);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(3.3, 3.6, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0xc23a2e, roughness: 0.8 }),
  );
  band.position.y = 18;
  light.add(band);
  const lamp = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 3, 12),
    new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd76a, emissiveIntensity: 1.6 }),
  );
  lamp.position.y = 27;
  light.add(lamp);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(9, 42, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.set(21, 27, 0);
  light.add(beam);
  const spot = new THREE.PointLight(0xffd76a, 60, 90, 1.6);
  spot.position.set(0, 27, 0);
  light.add(spot);
  group.add(light);
  colliders.push({ minX: -147, maxX: -137, minZ: 135, maxZ: 145 });
  const lighthouse = { group: light, beam, spot };

  // --- Palm trees along the beach and the Strip -------------------------------
  const palmTrunk = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
  const palmLeaf = new THREE.MeshStandardMaterial({ color: 0x3a7d4a, roughness: 0.9 });
  for (let i = 0; i < 34; i++) {
    const x = range(rng, -160, 160);
    const z = rng() < 0.6 ? range(rng, 128, 148) : range(rng, 96, 120);
    const palm = new THREE.Group();
    palm.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), palmTrunk);
    trunk.position.y = 3.5;
    trunk.rotation.z = range(rng, -0.12, 0.12);
    trunk.castShadow = true;
    palm.add(trunk);
    for (let f = 0; f < 5; f++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.2, 4), palmLeaf);
      leaf.position.y = 7.4;
      leaf.rotation.z = 1.1;
      leaf.rotation.y = (f / 5) * Math.PI * 2;
      leaf.position.x = Math.cos((f / 5) * Math.PI * 2) * 1.2;
      leaf.position.z = Math.sin((f / 5) * Math.PI * 2) * 1.2;
      palm.add(leaf);
    }
    group.add(palm);
  }

  // --- Streetlights on the main avenues ---------------------------------------
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.5 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc86a, emissiveIntensity: 0.9 });
  for (let i = 0; i <= WORLD.grid; i++) {
    for (const z of [-108, -36, 36, 108]) {
      const pole = new THREE.Group();
      pole.position.set(roadCoord(i) + 6, 0, z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6, 6), poleMat);
      post.position.y = 3;
      pole.add(post);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.5), lampMat);
      head.position.set(-0.6, 6, 0);
      pole.add(head);
      group.add(pole);
    }
  }

  return { group, colliders, lighthouse, sea };
}

// A floating text sign built from a canvas (no font files, no network).
function makeSign(text, glow) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1a20';
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = '#ffd98a';
  g.lineWidth = 4;
  g.strokeRect(4, 4, 504, 88);
  g.fillStyle = '#ffd98a';
  g.font = 'bold 44px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 2.6),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  mesh.userData.glow = glow;
  return mesh;
}

// Push a circle (x, z, radius) out of every building AABB it overlaps.
// Returns the corrected position as [x, z].
export function resolveCircle(colliders, x, z, radius) {
  for (const b of colliders) {
    const nx = clamp(x, b.minX, b.maxX);
    const nz = clamp(z, b.minZ, b.maxZ);
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 < 0.0001) {
        // Centre inside the box: push out along the smallest penetration.
        const px = Math.min(x - b.minX, b.maxX - x);
        const pz = Math.min(z - b.minZ, b.maxZ - z);
        if (px < pz) x = x - b.minX < b.maxX - x ? b.minX - radius : b.maxX + radius;
        else z = z - b.minZ < b.maxZ - z ? b.minZ - radius : b.maxZ + radius;
      } else {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * radius;
        z = nz + (dz / d) * radius;
      }
    }
  }
  return [x, z];
}

export function pointInCollider(colliders, x, z) {
  for (const b of colliders) {
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
  }
  return false;
}

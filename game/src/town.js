// Solmar Bay's city: a 7x7-block coastal town at sunset, built from
// procedural geometry. North is the harbor (docks), south is the beach and
// the sea. Exports the colliders, the road graph, landmark positions and a
// flat minimap model the HUD draws from.

import * as THREE from 'three';
import { rand, randInt, pick, clamp } from './seed.js';

export const PITCH = 32; // road center to road center
export const BLOCK = 24; // block side
export const ROAD = 8; // road width
export const HALF = 116; // city edge (outer road center 112 + half road)
export const ROAD_LINES = [-112, -80, -48, -16, 16, 48, 80, 112];
export const BLOCK_CENTERS = [-96, -64, -32, 0, 32, 64, 96];

// Landmark positions (x, z). North is -z, south is +z.
export const LANDMARKS = {
  garage: { x: -96, z: 32, label: "Vera's Garage" },
  cafe: { x: 64, z: -64, label: 'Marina Cafe' },
  docks: { x: 0, z: -128, label: 'North Docks' },
  palmCourt: { x: 64, z: 32, label: 'Palm Court' },
  lighthouse: { x: 96, z: 152, label: 'Lighthouse' },
  start: { x: -88, z: 48, label: 'Start' },
};

function districtFor(bx, bz) {
  if (bz === 0) return bx <= 2 ? 'Dockside' : bx === 3 ? 'Harbor Gate' : 'Marina';
  if (bz === 1) return bx <= 2 ? 'Dockside' : bx === 3 ? 'Old Town' : 'Marina';
  if (bz === 6) return 'Beachfront';
  if (bx <= 2) return 'Old Town';
  if (bx <= 4) return 'The Strip';
  return 'Palm Court';
}

function facadeTexture(rng, lit) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  // Light base: the building's color tints this, so the walls stay bright
  // in the sunset and only the windows read dark.
  g.fillStyle = '#e8e8e8';
  g.fillRect(0, 0, 128, 256);
  for (let y = 12; y < 244; y += 24) {
    for (let x = 10; x < 118; x += 22) {
      const warm = rng() < lit;
      g.fillStyle = warm ? '#ffca6a' : '#5a6a84';
      g.fillRect(x, y, 14, 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roadTexture(horizontal) {
  const c = document.createElement('canvas');
  c.width = horizontal ? 256 : 64;
  c.height = horizontal ? 64 : 256;
  const g = c.getContext('2d');
  g.fillStyle = '#33363d';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#d8d2c4';
  if (horizontal) {
    for (let x = 0; x < 256; x += 64) g.fillRect(x + 8, 30, 32, 4);
    g.fillStyle = '#4a4d55';
    g.fillRect(0, 0, 256, 3);
    g.fillRect(0, 61, 256, 3);
  } else {
    for (let y = 0; y < 256; y += 64) g.fillRect(30, y + 8, 4, 32);
    g.fillStyle = '#4a4d55';
    g.fillRect(0, 0, 3, 256);
    g.fillRect(61, 0, 3, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTown(scene, rng) {
  const colliders = []; // {x0, z0, x1, z1}
  const mapBuildings = []; // {x, z, w, d, color}
  const group = new THREE.Group();
  group.name = 'town';
  scene.add(group);

  const facadeShort = facadeTexture(rng, 0.35);
  const facadeMid = facadeTexture(rng, 0.3);
  const facadeTall = facadeTexture(rng, 0.45);

  // Land: one big warm slab, then beach sand south and harbor water north.
  const land = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshStandardMaterial({ color: 0x8a7f6a, roughness: 1 }),
  );
  land.rotation.x = -Math.PI / 2;
  land.position.set(0, -0.05, 0);
  land.receiveShadow = true;
  group.add(land);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 60),
    new THREE.MeshStandardMaterial({ color: 0xe8c98f, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.0, 146);
  sand.receiveShadow = true;
  group.add(sand);

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2a6f8e, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92,
  });
  for (const z of [-160, 210]) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(560, 90), waterMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.05, z);
    group.add(sea);
  }

  // Roads: long planes with a dashed center line texture. Vertical roads
  // use the vertical texture; horizontal roads get the horizontal one, so
  // the dashes run along the road instead of across it.
  const roadTexV = roadTexture(false);
  const roadTexH = roadTexture(true);
  for (const c of ROAD_LINES) {
    const texV = roadTexV.clone();
    texV.needsUpdate = true;
    texV.repeat.set(1, 8);
    const mv = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 240),
      new THREE.MeshStandardMaterial({ map: texV, roughness: 0.95 }),
    );
    mv.rotation.x = -Math.PI / 2;
    mv.position.set(c, 0.02, 0);
    mv.receiveShadow = true;
    group.add(mv);
    const texH = roadTexH.clone();
    texH.needsUpdate = true;
    texH.repeat.set(8, 1);
    const mh = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 8),
      new THREE.MeshStandardMaterial({ map: texH, roughness: 0.95 }),
    );
    mh.rotation.x = -Math.PI / 2;
    mh.position.set(0, 0.02, c);
    mh.receiveShadow = true;
    group.add(mh);
  }

  // Sidewalk slabs under each block.
  const walkMat = new THREE.MeshStandardMaterial({ color: 0xb9b2a2, roughness: 1 });
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK + 4, BLOCK + 4), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(bx, 0.01, bz);
      walk.receiveShadow = true;
      group.add(walk);
    }
  }

  // Buildings, one to three per block, heights by district.
  const palette = [0xe8dcc0, 0xd98f5f, 0x7fa8a0, 0xc96f5a, 0x9a7fb0, 0xe0b45a, 0x8fa3b8];
  const heights = {
    'Old Town': [6, 12], 'The Strip': [12, 30], Marina: [8, 18],
    'Palm Court': [8, 16], Dockside: [5, 10], 'Harbor Gate': [8, 14], Beachfront: [6, 10],
  };
  for (let ix = 0; ix < 7; ix++) {
    for (let iz = 0; iz < 7; iz++) {
      const cx = BLOCK_CENTERS[ix];
      const cz = BLOCK_CENTERS[iz];
      const district = districtFor(ix, iz);
      // The garage, cafe and plaza blocks keep their landmark clear: a
      // random building there would overlap the landmark and block the
      // mission approach, so these blocks get no random buildings at all.
      if (district === 'Beachfront') continue;
      const isLandmarkBlock =
        (cx === LANDMARKS.garage.x && cz === LANDMARKS.garage.z) ||
        (cx === LANDMARKS.cafe.x && cz === LANDMARKS.cafe.z) ||
        (cx === LANDMARKS.palmCourt.x && cz === LANDMARKS.palmCourt.z);
      if (isLandmarkBlock) continue;
      const count = randInt(rng, 1, 3);
      const spots = [
        [-5, -5], [5, -5], [-5, 5], [5, 5], [0, 0],
      ];
      for (let n = 0; n < count; n++) {
        const [ox, oz] = spots[(ix * 3 + iz * 5 + n * 2) % spots.length];
        const w = rand(rng, 7, 11);
        const d = rand(rng, 7, 11);
        const h = rand(rng, heights[district][0], heights[district][1]);
        const color = pick(rng, palette);
        const tex = h < 12 ? facadeShort : h < 20 ? facadeMid : facadeTall;
        const mat = new THREE.MeshStandardMaterial({ color, map: tex, roughness: 0.85 });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(cx + ox, h / 2, cz + oz);
        b.castShadow = true;
        b.receiveShadow = true;
        group.add(b);
        // A rooftop box so skylines are not flat slabs.
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.4, 1.2, d * 0.4),
          new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 1 }),
        );
        roof.position.set(cx + ox, h + 0.6, cz + oz);
        roof.castShadow = true;
        group.add(roof);
        colliders.push({ x0: cx + ox - w / 2, z0: cz + oz - d / 2, x1: cx + ox + w / 2, z1: cz + oz + d / 2 });
        mapBuildings.push({ x: cx + ox, z: cz + oz, w, d, color });
      }
    }
  }

  // Vera's Garage: low wide shed with a big door facing the road.
  const garageMat = new THREE.MeshStandardMaterial({ color: 0x4a6b8a, roughness: 0.8 });
  const garage = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 12), garageMat);
  garage.position.set(LANDMARKS.garage.x, 3, LANDMARKS.garage.z);
  garage.castShadow = true;
  garage.receiveShadow = true;
  group.add(garage);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 4.4, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.6, metalness: 0.4 }),
  );
  door.position.set(LANDMARKS.garage.x + 8.1, 2.2, LANDMARKS.garage.z);
  group.add(door);
  colliders.push({ x0: -104, z0: 26, x1: -88, z1: 38 });
  mapBuildings.push({ x: -96, z: 32, w: 16, d: 12, color: 0x4a6b8a });

  // Marina Cafe: small white cafe with a striped awning.
  const cafe = new THREE.Mesh(
    new THREE.BoxGeometry(12, 5, 9),
    new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.9 }),
  );
  cafe.position.set(LANDMARKS.cafe.x, 2.5, LANDMARKS.cafe.z);
  cafe.castShadow = true;
  cafe.receiveShadow = true;
  group.add(cafe);
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(13, 0.4, 4),
    new THREE.MeshStandardMaterial({ color: 0xc96f5a, roughness: 0.9 }),
  );
  awning.position.set(LANDMARKS.cafe.x, 4.4, LANDMARKS.cafe.z + 5.5);
  group.add(awning);
  colliders.push({ x0: 58, z0: -68.5, x1: 70, z1: -59.5 });
  mapBuildings.push({ x: 64, z: -64, w: 12, d: 9, color: 0xf2ead8 });

  // Palm Court plaza: pale stone circle with palms.
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 10, 0.3, 24),
    new THREE.MeshStandardMaterial({ color: 0xd8cdb4, roughness: 1 }),
  );
  plaza.position.set(LANDMARKS.palmCourt.x, 0.15, LANDMARKS.palmCourt.z);
  plaza.receiveShadow = true;
  group.add(plaza);

  // North docks: wooden piers into the harbor, crates, two moored boats.
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6b48, roughness: 1 });
  for (const px of [-32, 0, 32]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 26), wood);
    pier.position.set(px, 0.4, -130);
    pier.castShadow = true;
    pier.receiveShadow = true;
    group.add(pier);
  }
  for (let i = 0; i < 10; i++) {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(rand(rng, 1.5, 2.5), rand(rng, 1.5, 2.5), rand(rng, 1.5, 2.5)),
      new THREE.MeshStandardMaterial({ color: pick(rng, [0xa08a5a, 0x7a6a4a, 0x9a8a6a]), roughness: 1 }),
    );
    crate.position.set(rand(rng, -40, 40), 1, rand(rng, -140, -118));
    crate.rotation.y = rand(rng, 0, Math.PI);
    crate.castShadow = true;
    group.add(crate);
    colliders.push({ x0: crate.position.x - 1.2, z0: crate.position.z - 1.2, x1: crate.position.x + 1.2, z1: crate.position.z + 1.2 });
  }

  // Lighthouse on the south beach: striped tower, glowing lamp, rock base.
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(7, 0),
    new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 1 }),
  );
  rock.scale.set(1.4, 0.6, 1.4);
  rock.position.set(LANDMARKS.lighthouse.x, 0.5, LANDMARKS.lighthouse.z);
  rock.castShadow = true;
  group.add(rock);
  const stripeTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const g = c.getContext('2d');
    for (let y = 0; y < 128; y += 32) {
      g.fillStyle = y % 64 === 0 ? '#f2ead8' : '#c94f3d';
      g.fillRect(0, y, 64, 32);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3, 18, 16),
    new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.8 }),
  );
  tower.position.set(LANDMARKS.lighthouse.x, 10, LANDMARKS.lighthouse.z);
  tower.castShadow = true;
  group.add(tower);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc94d, emissiveIntensity: 2.2 }),
  );
  lamp.position.set(LANDMARKS.lighthouse.x, 19.6, LANDMARKS.lighthouse.z);
  group.add(lamp);
  colliders.push({ x0: 89, z0: 145, x1: 103, z1: 159 });

  // Palms along the beach promenade and the marina.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5c3e, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 1 });
  const palmSpots = [];
  for (let x = -104; x <= 104; x += 16) palmSpots.push([x, 122]);
  for (let x = -96; x <= 96; x += 32) palmSpots.push([x, -104]);
  for (const [px, pz] of palmSpots) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 6, 6), trunkMat);
    trunk.position.set(px + rand(rng, -1, 1), 3, pz + rand(rng, -1, 1));
    trunk.rotation.z = rand(rng, -0.08, 0.08);
    trunk.castShadow = true;
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.2, 7), frondMat);
    crown.position.set(trunk.position.x, 6.8, trunk.position.z);
    crown.castShadow = true;
    group.add(crown);
  }

  // Street props: a few benches and hydrants for scale (no colliders).
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.8), benchMat);
    bench.position.set(pick(rng, BLOCK_CENTERS) + rand(rng, -8, 8), 0.4, pick(rng, BLOCK_CENTERS) + rand(rng, -8, 8));
    bench.rotation.y = rand(rng, 0, Math.PI);
    group.add(bench);
  }

  return {
    colliders,
    map: { buildings: mapBuildings, roads: ROAD_LINES.slice(), half: HALF },
    // Push a circle (x, z, radius) out of every building AABB it overlaps.
    collideCircle(x, z, r) {
      let nx = x;
      let nz = z;
      for (const c of colliders) {
        const cx = clamp(nx, c.x0, c.x1);
        const cz = clamp(nz, c.z0, c.z1);
        const dx = nx - cx;
        const dz = nz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            nx = cx + (dx / d) * r;
            nz = cz + (dz / d) * r;
          } else {
            // Center inside the box: push out along the smallest axis.
            const pushL = nx - c.x0 + r;
            const pushR = c.x1 - nx + r;
            const pushT = nz - c.z0 + r;
            const pushB = c.z1 - nz + r;
            const m = Math.min(pushL, pushR, pushT, pushB);
            if (m === pushL) nx = c.x0 - r;
            else if (m === pushR) nx = c.x1 + r;
            else if (m === pushT) nz = c.z0 - r;
            else nz = c.z1 + r;
          }
        }
      }
      return { x: clamp(nx, -HALF - 4, HALF + 4), z: clamp(nz, -HALF - 44, HALF + 44) };
    },
    pointInside(x, z) {
      return colliders.some((c) => x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1);
    },
  };
}

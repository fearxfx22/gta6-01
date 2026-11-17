// Solmar Bay itself: a seeded 7x7 grid city, beach and ocean to the east,
// container docks to the north, marina and lighthouse to the south.
//
// The builder runs in fixed sections (streets, buildings, park, palms, lamps,
// beach, docks, marina, named places, sky, road graph) and hands back the
// road graph, colliders and landmarks the other systems drive on. Section
// order matters: the seeded RNG is consumed in the same order as the city is
// built, so ?seed=N always lays out the same streets and towers.
//
// Every mesh is built once here. Nothing in this file moves at runtime except
// the ocean (gentle bob), the lighthouse beam (slow sweep) and the clouds
// (slow drift) — those three are what update() touches.
import * as THREE from 'three';
import { WORLD } from './config.js';
import { clamp } from './random.js';

const ROAD_COORDS = [-180, -120, -60, 0, 60, 120, 180];
const BLOCK_CENTERS = [-150, -90, -30, 30, 90, 150];

// ---------------------------------------------------------------------------
// Canvas textures — all signage and facades are painted, never loaded.
// ---------------------------------------------------------------------------

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Building facade: pale render with a grid of lit and dark windows. */
function facadeTexture(rng) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#b8b0a4';
    g.fillRect(0, 0, w, h);
    for (let y = 8; y < h - 12; y += 18) {
      for (let x = 8; x < w - 12; x += 18) {
        const lit = rng.next() < 0.28;
        g.fillStyle = lit ? '#ffd98a' : '#2c3a4a';
        g.fillRect(x, y, 11, 13);
      }
    }
  });
}

/** A shop sign: big name, optional smaller line underneath. */
function signTexture(text, bg, fg, sub) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = 'bold 56px Trebuchet MS, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, sub ? h / 2 - 16 : h / 2);
    if (sub) {
      g.font = 'bold 30px Trebuchet MS, sans-serif';
      g.fillText(sub, w / 2, h / 2 + 34);
    }
  });
}

/** Dark asphalt with one yellow centre dash (tiled along the road). */
function roadDashTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#2e3238';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8c96a';
    g.fillRect(w / 2 - 2, 6, 4, 26);
  });
}

/** Soft radial glow for the low sun. */
function sunGlowTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,240,200,1)');
    grad.addColorStop(0.35, 'rgba(255,190,110,0.85)');
    grad.addColorStop(1, 'rgba(255,150,80,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/** A puffy four-lobed cloud, warm white against the sunset sky. */
function cloudTexture() {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = 'rgba(255,235,220,0.85)';
    for (const [x, y, r] of [
      [70, 70, 34],
      [120, 60, 42],
      [180, 72, 36],
      [140, 84, 30],
    ]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// ---------------------------------------------------------------------------
// Build context: the shared group, RNG, colliders and instanced-mesh scratch.
// ---------------------------------------------------------------------------

function makeBuildContext(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  return {
    scene,
    group,
    rng,
    colliders,
    addCollider(x, z, hw, hd) {
      colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
    },
    // Scratch objects reused by every instanced mesh (no per-instance allocs).
    m4: new THREE.Matrix4(),
    quat: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    pos: new THREE.Vector3(),
    tint: new THREE.Color(),
  };
}

function flatMesh(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// Streets: ground plane, dashed roads, sidewalks, block slabs.
// ---------------------------------------------------------------------------

function buildStreets(B) {
  const ground = flatMesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshStandardMaterial({ color: 0x51565c, roughness: 0.95 }),
    20,
    0,
    0,
  );
  B.group.add(ground);

  const dashTex = roadDashTexture();
  dashTex.wrapS = dashTex.wrapT = THREE.RepeatWrapping;
  for (const c of ROAD_COORDS) {
    for (const horiz of [true, false]) {
      const tex = dashTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(horiz ? 430 / 14 : 1, horiz ? 1 : 430 / 14);
      const road = flatMesh(
        new THREE.PlaneGeometry(horiz ? 430 : WORLD.road, horiz ? WORLD.road : 430),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
        horiz ? 0 : c,
        0.02,
        horiz ? c : 0,
      );
      B.group.add(road);
    }
  }

  // Sidewalks: lighter strips hugging every road.
  const walkMat = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.95 });
  for (const c of ROAD_COORDS) {
    for (const off of [-8.5, 8.5]) {
      for (const horiz of [true, false]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(3, 420), walkMat);
        walk.rotation.x = -Math.PI / 2;
        if (horiz) walk.rotation.z = Math.PI / 2;
        // Horizontal strip runs along x at z = c + off; vertical along z at x = c + off.
        walk.position.set(horiz ? 0 : c + off, 0.05, horiz ? c + off : 0);
        walk.receiveShadow = true;
        B.group.add(walk);
      }
    }
  }

  // Block slabs: light concrete under the buildings so the city reads bright.
  // Block centres step by 60 m, so the colour index mixes both axes.
  const slabCols = [0x8a8578, 0x7e7a6e, 0x93897a, 0x857d70];
  const slabGeo = new THREE.PlaneGeometry(WORLD.block, WORLD.block);
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      if (bx === 0 && bz === 0) continue; // central park has grass, not concrete
      const idx = (((bx + 150) / 60) + ((bz + 150) / 60) * 2) % 4;
      const slab = flatMesh(
        slabGeo,
        new THREE.MeshStandardMaterial({ color: slabCols[idx], roughness: 1 }),
        bx,
        0.03,
        bz,
      );
      B.group.add(slab);
    }
  }
}

// ---------------------------------------------------------------------------
// Buildings: one instanced mesh with a window texture and per-instance tint.
// ---------------------------------------------------------------------------

function buildBuildings(B) {
  const facade = facadeTexture(B.rng);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshStandardMaterial({
    map: facade,
    emissiveMap: facade,
    emissive: 0xffffff,
    emissiveIntensity: 0.15,
    roughness: 0.85,
  });
  const spots = [];
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      if (bx === 0 && bz === 0) continue; // central park
      if (bx === -150 && bz === 150) continue; // Vera's garage
      if (bx === 150 && bz === -150) continue; // hospital
      const n = B.rng.int(1, 3);
      for (let k = 0; k < n; k += 1) {
        const w = B.rng.range(16, 26);
        const d = B.rng.range(16, 26);
        const h = B.rng.range(12, 58);
        const x = bx + B.rng.range(-11, 11);
        const z = bz + B.rng.range(-11, 11);
        spots.push({ x, z, w, d, h });
        B.addCollider(x, z, w / 2, d / 2);
      }
    }
  }
  const buildings = new THREE.InstancedMesh(boxGeo, boxMat, spots.length);
  const palette = [0xd8c9b0, 0xc9b8a8, 0xb8c4cc, 0xd8a88a, 0xa8b8a0, 0xc4a8b8, 0x9fb4c4];
  spots.forEach((b, i) => {
    B.pos.set(b.x, b.h / 2, b.z);
    B.scale.set(b.w, b.h, b.d);
    B.m4.compose(B.pos, B.quat, B.scale);
    buildings.setMatrixAt(i, B.m4);
    B.tint.setHex(palette[i % palette.length]);
    buildings.setColorAt(i, B.tint);
  });
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  B.group.add(buildings);

  // Rooftop boxes on a few towers.
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.9 });
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, 40);
  let ri = 0;
  for (const b of spots) {
    if (ri >= 40 || B.rng.next() > 0.35) continue;
    B.pos.set(b.x, b.h + 1.2, b.z);
    B.scale.set(4, 2.4, 4);
    B.m4.compose(B.pos, B.quat, B.scale);
    roofs.setMatrixAt(ri, B.m4);
    ri += 1;
  }
  roofs.count = ri;
  B.group.add(roofs);
}

// ---------------------------------------------------------------------------
// Central park, palms, street lamps.
// ---------------------------------------------------------------------------

function buildPark(B) {
  const park = flatMesh(
    new THREE.PlaneGeometry(46, 46),
    new THREE.MeshStandardMaterial({ color: 0x4a7a3a, roughness: 1 }),
    0,
    0.04,
    0,
  );
  B.group.add(park);
  const pond = flatMesh(
    new THREE.CircleGeometry(7, 24),
    new THREE.MeshStandardMaterial({ color: 0x2a7a9a, roughness: 0.25, metalness: 0.1 }),
    6,
    0.06,
    -4,
  );
  B.group.add(pond);
}

function buildPalms(B) {
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 7, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  const leafGeo = new THREE.ConeGeometry(1.6, 5.5, 4);
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x3f8a3a,
    roughness: 0.9,
    flatShading: true,
  });
  const palmSpots = [];
  // Beachfront row.
  for (let x = 240; x <= 252; x += 9) {
    for (let z = -200; z <= 220; z += 34) {
      palmSpots.push([x + B.rng.range(-2, 2), z + B.rng.range(-4, 4)]);
    }
  }
  // Park cluster.
  for (let i = 0; i < 12; i += 1) {
    palmSpots.push([B.rng.range(-18, 18), B.rng.range(-18, 18)]);
  }
  // A pair flanking two avenues.
  for (const c of ROAD_COORDS) {
    palmSpots.push([c + 10.5, -90]);
    palmSpots.push([c - 10.5, 90]);
  }
  for (const [x, z] of palmSpots) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5;
    trunk.castShadow = true;
    palm.add(trunk);
    for (let l = 0; l < 6; l += 1) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.y = 7.2;
      leaf.rotation.z = Math.PI / 2.6;
      leaf.rotation.y = (l / 6) * Math.PI * 2;
      leaf.position.x = Math.cos((l / 6) * Math.PI * 2) * 1.6;
      leaf.position.z = Math.sin((l / 6) * Math.PI * 2) * 1.6;
      palm.add(leaf);
    }
    palm.position.set(x, 0, z);
    palm.rotation.y = B.rng.range(0, Math.PI * 2);
    B.group.add(palm);
  }
}

function buildLamps(B) {
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.6 });
  const headGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffe9b0,
    emissive: 0xffc24b,
    emissiveIntensity: 0.9,
  });
  for (const c of ROAD_COORDS) {
    for (const z of [-150, -30, 90]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(c + 7.6, 3, z);
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(c + 7.6, 6.1, z);
      B.group.add(pole, head);
    }
  }
}

// ---------------------------------------------------------------------------
// Beach + ocean, docks (north), marina + lighthouse (south).
// ---------------------------------------------------------------------------

function buildBeach(B) {
  const sand = flatMesh(
    new THREE.PlaneGeometry(90, 560),
    new THREE.MeshStandardMaterial({ color: 0xd9b380, roughness: 1 }),
    272,
    0.03,
    20,
  );
  B.group.add(sand);
  const oceanMat = new THREE.MeshStandardMaterial({
    color: 0x1a6f92,
    roughness: 0.22,
    metalness: 0.15,
  });
  const ocean = flatMesh(new THREE.PlaneGeometry(420, 760), oceanMat, 520, 0.01, 0);
  B.group.add(ocean);
  return ocean;
}

function buildDocks(B) {
  const dockGround = flatMesh(
    new THREE.PlaneGeometry(460, 90),
    new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 1 }),
    0,
    0.02,
    -272,
  );
  B.group.add(dockGround);
  const contGeo = new THREE.BoxGeometry(12, 2.6, 2.6);
  const contCols = [0xc23b2e, 0x2e6fc2, 0x3a9a4a, 0xd8a02e, 0x7a4a9a];
  const containers = new THREE.InstancedMesh(
    contGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.3 }),
    42,
  );
  let ci = 0;
  for (let gx = -180; gx <= 180 && ci < 42; gx += 30) {
    for (let gz = -258; gz >= -292 && ci < 42; gz -= 14) {
      if (B.rng.next() < 0.3) continue;
      const stack = B.rng.int(1, 3);
      for (let s2 = 0; s2 < stack && ci < 42; s2 += 1) {
        B.pos.set(gx + B.rng.range(-4, 4), 1.3 + s2 * 2.6, gz + B.rng.range(-2, 2));
        B.scale.set(1, 1, 1);
        B.m4.compose(B.pos, B.quat, B.scale);
        containers.setMatrixAt(ci, B.m4);
        B.tint.setHex(contCols[ci % contCols.length]);
        containers.setColorAt(ci, B.tint);
        if (s2 === 0) B.addCollider(gx, gz, 6.5, 2);
        ci += 1;
      }
    }
  }
  containers.count = ci;
  containers.castShadow = true;
  B.group.add(containers);
  // Gantry crane: two legs and the crossbeam.
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xd8a02e, roughness: 0.6, metalness: 0.4 });
  for (const [x, z, w, h, d] of [
    [-90, -262, 2, 26, 2],
    [-60, -262, 2, 26, 2],
    [-75, -262, 32, 2, 2],
  ]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), craneMat);
    beam.position.set(x, h / 2 + (h === 2 ? 24 : 0), z);
    beam.castShadow = true;
    B.group.add(beam);
  }
}

function buildMarina(B) {
  const marina = flatMesh(
    new THREE.PlaneGeometry(460, 90),
    new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 1 }),
    0,
    0.02,
    272,
  );
  B.group.add(marina);
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1, 60),
    new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 }),
  );
  pier.position.set(120, 0.5, 258);
  B.group.add(pier);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.7 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.7 });
  const lighthouse = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 26, 12), lightMat);
  tower.position.y = 13;
  tower.castShadow = true;
  lighthouse.add(tower);
  for (const y of [7, 15, 23]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.55, 3.85, 3, 12), bandMat);
    band.position.y = y;
    lighthouse.add(band);
  }
  const lampHead = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe27a, emissiveIntensity: 2.2 }),
  );
  lampHead.position.y = 27.5;
  lighthouse.add(lampHead);
  const beamGeo = new THREE.ConeGeometry(7, 42, 12, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe27a,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.set(21, 27.5, 0);
  lighthouse.add(beam);
  lighthouse.position.set(-120, 0, 268);
  B.group.add(lighthouse);
  B.addCollider(-120, 268, 5, 5);
  return beam;
}

// ---------------------------------------------------------------------------
// Named places: garage, hospital, safehouse, cafe.
// ---------------------------------------------------------------------------

function buildNamedPlaces(B) {
  function namedPlace(x, z, w, d, h, sign, bg, fg, sub) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.85 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    B.group.add(b);
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(w * 0.9, 22), 5.5),
      new THREE.MeshBasicMaterial({ map: signTexture(sign, bg, fg, sub) }),
    );
    signMesh.position.set(x, h + 0.4, z + d / 2 + 0.15);
    B.group.add(signMesh);
    B.addCollider(x, z, w / 2 + 0.5, d / 2 + 0.5);
    return { x, z };
  }
  const garage = namedPlace(-150, 150, 30, 20, 9, "VERA'S GARAGE", '#1a2a3a', '#ffc24b', 'repairs · no questions');
  const hospital = namedPlace(150, -150, 30, 22, 16, 'SOLMAR GENERAL', '#f2ede2', '#c23b2e', 'emergency');
  const safehouse = namedPlace(150, 150, 18, 14, 8, 'PALM COURT', '#2a4a3a', '#f2ede2', 'rooms · cash only');
  const cafe = namedPlace(120, 252, 20, 12, 7, 'MARINA CAFE', '#3a2a4a', '#19c2b8', 'coffee · sunrise view');
  return { garage, hospital, safehouse, cafe };
}

// ---------------------------------------------------------------------------
// Sky dome, low sun, drifting clouds.
// ---------------------------------------------------------------------------

function buildSky(B) {
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2e5f8a) },
      mid: { value: new THREE.Color(0xe88a5a) },
      bot: { value: new THREE.Color(0xffc27a) },
    },
    vertexShader:
      'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h = normalize(vP).y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(bot, mid, smoothstep(-0.08, 0.12, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(880, 24, 16), skyMat);
  B.scene.add(sky);
  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(190, 190),
    new THREE.MeshBasicMaterial({ map: sunGlowTexture(), transparent: true, depthWrite: false, fog: false }),
  );
  sun.position.set(-620, 150, -180);
  sun.lookAt(0, 40, 0);
  B.scene.add(sun);
  const cloudTex = cloudTexture();
  const clouds = [];
  for (let i = 0; i < 9; i += 1) {
    const cl = new THREE.Mesh(
      new THREE.PlaneGeometry(B.rng.range(90, 170), B.rng.range(36, 60)),
      new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.75, fog: false }),
    );
    cl.position.set(B.rng.range(-500, 500), B.rng.range(150, 260), B.rng.range(-500, 300));
    cl.lookAt(0, cl.position.y, 0);
    B.scene.add(cl);
    clouds.push(cl);
  }
  return clouds;
}

// ---------------------------------------------------------------------------
// Road graph, parked-car spots, collision, sidewalk points.
// ---------------------------------------------------------------------------

function buildRoadGraph() {
  const nodes = [];
  const nodeIndex = new Map();
  for (let i = 0; i < ROAD_COORDS.length; i += 1) {
    for (let j = 0; j < ROAD_COORDS.length; j += 1) {
      const id = nodes.length;
      nodes.push({ x: ROAD_COORDS[i], z: ROAD_COORDS[j], links: [] });
      nodeIndex.set(`${i},${j}`, id);
    }
  }
  const N = ROAD_COORDS.length;
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const id = nodeIndex.get(`${i},${j}`);
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni >= 0 && ni < N && nj >= 0 && nj < N) {
          nodes[id].links.push(nodeIndex.get(`${ni},${nj}`));
        }
      }
    }
  }
  return nodes;
}

function makeParkedSpots(rng) {
  const spots = [];
  const N = ROAD_COORDS.length;
  for (let k = 0; k < 16; k += 1) {
    const c = ROAD_COORDS[rng.int(0, N - 1)];
    const along = rng.range(-170, 170);
    const horiz = rng.next() < 0.5;
    const off = rng.next() < 0.5 ? 5.2 : -5.2;
    spots.push({
      x: horiz ? along : c + off,
      z: horiz ? c + off : along,
      heading: horiz ? (off > 0 ? Math.PI / 2 : -Math.PI / 2) : off > 0 ? 0 : Math.PI,
    });
  }
  return spots;
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

export function buildWorld(scene, rng) {
  const B = makeBuildContext(scene, rng);
  buildStreets(B);
  buildBuildings(B);
  buildPark(B);
  buildPalms(B);
  buildLamps(B);
  const ocean = buildBeach(B);
  buildDocks(B);
  const beam = buildMarina(B);
  const places = buildNamedPlaces(B);
  const clouds = buildSky(B);
  const nodes = buildRoadGraph();
  const parkedSpots = makeParkedSpots(rng);
  const { colliders } = B;

  // Push a circle out of every building/container box it overlaps. Returns
  // the corrected position plus whether anything was hit.
  function resolveCircle(x, z, r) {
    let hit = false;
    for (const c of colliders) {
      const cx = clamp(x, c.minX, c.maxX);
      const cz = clamp(z, c.minZ, c.maxZ);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // Dead centre inside a box: leave through the nearest face.
        const pushL = x - c.minX;
        const pushR = c.maxX - x;
        const pushT = z - c.minZ;
        const pushB = c.maxZ - z;
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) x = c.minX - r;
        else if (m === pushR) x = c.maxX + r;
        else if (m === pushT) z = c.minZ - r;
        else z = c.maxZ + r;
      }
    }
    return { x, z, hit };
  }

  /** A random point on a sidewalk, for spawning pedestrians. */
  function sidewalkPoint() {
    const c = ROAD_COORDS[rng.int(0, ROAD_COORDS.length - 1)];
    const along = rng.range(-190, 190);
    const off = rng.next() < 0.5 ? 8.5 : -8.5;
    return rng.next() < 0.5 ? { x: along, z: c + off } : { x: c + off, z: along };
  }

  let time = 0;
  return {
    colliders,
    nodes,
    parkedSpots,
    ...places,
    landmarks: {
      ...places,
      docks: { x: 60, z: -262 },
      lighthouse: { x: -120, z: 268 },
      marina: { x: 120, z: 252 },
      park: { x: 0, z: 0 },
    },
    resolveCircle,
    sidewalkPoint,
    nearestNode(x, z) {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < nodes.length; i += 1) {
        const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    },
    update(dt) {
      time += dt;
      ocean.position.y = 0.01 + Math.sin(time * 0.5) * 0.06;
      beam.rotation.y = time * 0.7;
      for (const cl of clouds) {
        cl.position.x += dt * 1.2;
        if (cl.position.x > 560) cl.position.x = -560;
      }
    },
  };
}

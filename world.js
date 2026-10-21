/* Hawaiʻi Preparatory Academy, Waimea — the walkable campus.
   Builds terrain, track and fields, buildings, trees, roads, distant mountains, sky and light.
   Exposes window.HPA.createWorld(canvas). Needs three.js r128 on the page first.

   Map frame: world metres, x = east, z = south, y = up. Positions come from a north-up
   satellite view of the campus (about 0.37 m per pixel) with the track centre as origin,
   so every RAW_* table below is in image pixels and converted with P(). */
(function () {
'use strict';

function createWorld(canvas) {
  const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const R = rng(1949); // HPA's founding year
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const RAD = Math.PI / 180;
  const C = (h) => new THREE.Color(h).convertSRGBToLinear();

  // ---------- renderer, camera, light ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 350, 6500);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.25, 30000);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 85, bottom: -85, near: 1, far: 800 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(0, 1, 0), lightDir = new THREE.Vector3(0, 1, 0);

  // ---------- map frame ----------
  const S = 0.37, OX = 525, OY = 767;
  const P = (px, py) => [(px - OX) * S, (py - OY) * S];
  const PP = (a) => a.map(([x, y]) => P(x, y));
  function poly(pts) {
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const [x, z] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
    return { pts, minx, maxx, minz, maxz };
  }
  function segDist(x, z, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / L2; t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
  }
  function polyDist(x, z, pl, limit) {
    if (limit !== undefined && (x < pl.minx - limit || x > pl.maxx + limit || z < pl.minz - limit || z > pl.maxz + limit)) return Infinity;
    let m = Infinity; const p = pl.pts;
    for (let i = 0; i < p.length - 1; i++) { const d = segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]); if (d < m) m = d; }
    return m;
  }
  // rotation convention matches three.js rotation.y = rot
  const toLocal = (o, x, z) => { const c = Math.cos(o.rot), s = Math.sin(o.rot), dx = x - o.x, dz = z - o.z; return [dx * c - dz * s, dx * s + dz * c]; };
  const toWorld = (o, lx, lz) => { const c = Math.cos(o.rot), s = Math.sin(o.rot); return [o.x + lx * c + lz * s, o.z - lx * s + lz * c]; };

  // ---------- campus data (image pixels) ----------
  // track: oval centred at the origin, long axis running NNW–SSE
  const TRACK = { x: 0, z: 0, rot: -56 * RAD };
  const LANES = 8, LANE = 1.22, R_OUT = 40.7, R_IN = R_OUT - LANES * LANE, TL = 49.6;
  const FIELD_L = 110, FIELD_W = 50;

  // phi = long-axis angle in the image (degrees, clockwise from east)
  // wall: dark board-and-batten 'wood' or lava-rock 'stone'; ends: material of the short walls
  // roof: 'shed' (low mono-pitch, clerestory on the high side), 'hip', 'gable' or 'flat'; lanai: raised wooden deck along the front
  const RAW_BUILDINGS = [
    // solar-roofed classrooms on the north-west slope
    { at: [440, 255], w: 60, d: 40, phi: 0, h: 3.3, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.22, solar: 2 },
    { at: [537, 265], w: 105, d: 40, phi: 14, h: 3.3, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.22, solar: 2, lanai: 1 },
    { at: [340, 302], w: 105, d: 44, phi: -35, h: 3.3, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.22, solar: 2 },
    { at: [525, 336], w: 125, d: 54, phi: 18, h: 3.5, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.22, solar: 2, lanai: 1 },
    // classrooms along the walk above the field: shed roofs with clerestories and raised lanai
    { at: [648, 350], w: 86, d: 38, phi: 24, h: 3.1, wall: 'wood', ends: 'stone', roof: 'shed', lanai: 1 },
    { at: [651, 437], w: 90, d: 42, phi: 22, h: 3.1, wall: 'wood', ends: 'stone', roof: 'shed', lanai: 1 },
    { at: [742, 412], w: 70, d: 38, phi: 30, h: 3.1, wall: 'wood', ends: 'stone', roof: 'shed', lanai: 1 },
    { at: [776, 487], w: 115, d: 40, phi: 46, h: 3.1, wall: 'wood', ends: 'stone', roof: 'shed', lanai: 1 },
    { at: [884, 437], w: 96, d: 54, phi: 20, h: 3.4, wall: 'wood', ends: 'stone', roof: 'shed', lanai: 1 },
    { at: [915, 572], w: 96, d: 32, phi: 22, h: 3.2, wall: 'wood', ends: 'stone', roof: 'shed', rise: 0.32, lanai: 1, name: 'ml' }, // Modern Languages
    { at: [1015, 468], w: 72, d: 66, phi: 8, h: 3.4, wall: 'wood', ends: 'stone', roof: 'shed', lanai: 1 },
    { at: [1065, 555], w: 66, d: 54, phi: 3, h: 3.3, wall: 'stone', ends: 'stone', roof: 'shed', rise: 0.2, name: 'tech' }, // Technology Center
    // main academic cluster (two storeys)
    { at: [1150, 452], w: 122, d: 36, phi: 5, h: 6.4, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.24 },
    { at: [1150, 532], w: 100, d: 66, phi: 2, h: 6.4, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.2, solar: 1 },
    { at: [1258, 497], w: 74, d: 46, phi: 3, h: 6.0, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.24 },
    // north edge
    { at: [515, 112], w: 82, d: 36, phi: 32, h: 4.2, wall: 'wood', ends: 'stone', roof: 'gable', rise: 0.7, roofColor: '#5f5852', name: 'chapel' },
    { at: [916, 186], w: 76, d: 40, phi: -15, h: 3.3, wall: 'wood', ends: 'stone', roof: 'shed', lanai: 1 },
    { at: [1215, 150], w: 210, d: 34, phi: 2, h: 6.2, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.24 },
    { at: [1160, 112], w: 44, d: 34, phi: 2, h: 6.2, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.24 },
    { at: [1282, 112], w: 44, d: 34, phi: 2, h: 6.2, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.24 },
    { at: [1706, 136], w: 110, d: 82, phi: 0, h: 6.2, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.2, solar: 1 },
    { at: [1415, 262], w: 200, d: 34, phi: 43, h: 6.2, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.24 },
    { at: [1412, 436], w: 190, d: 40, phi: 37, h: 6.2, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.24 },
    // athletics complex
    { at: [1352, 673], w: 104, d: 82, phi: 33, h: 8, wall: 'gym', ends: 'stone', roof: 'gable', rise: 0.14, roofColor: '#5d6cab', name: 'blue' },
    { at: [1225, 707], w: 80, d: 26, phi: 0, h: 3.4, wall: 'wood', ends: 'stone', roof: 'shed', lanai: 1 },
    { at: [1237, 792], w: 120, d: 96, phi: 0, h: 9, wall: 'gym', roof: 'gable', rise: 0.12, solar: 1 },
    { at: [1352, 798], w: 104, d: 110, phi: 0, h: 10, wall: 'gym', ends: 'stone', roof: 'gable', rise: 0.12, roofColor: '#a9a9a6' },
    { at: [1258, 915], w: 196, d: 120, phi: 0, h: 12, wall: 'gym', roof: 'gable', rise: 0.1, roofColor: '#efefec' },
    { at: [1636, 668], w: 150, d: 116, phi: 30, h: 10, wall: 'gym', ends: 'stone', roof: 'hip', rise: 0.28, roofColor: '#e9e9e6' },
    { at: [1658, 780], w: 56, d: 46, phi: 25, h: 3.6, wall: 'wood', ends: 'stone', roof: 'hip' },
    // little sheds by the track and baseball field
    { at: [742, 842], w: 30, d: 16, phi: 56, h: 2.8, wall: 'white', roof: 'gable', rise: 0.3 },
    { at: [727, 905], w: 18, d: 30, phi: 56, h: 2.6, wall: 'white', roof: 'gable', rise: 0.3 },
    { at: [658, 665], w: 16, d: 11, phi: 56, h: 2.5, wall: 'white', roof: 'gable', rise: 0.3 },
    { at: [593, 1028], w: 26, d: 18, phi: 56, h: 2.8, wall: 'white', roof: 'gable', rise: 0.3 },
    { at: [800, 850], w: 26, d: 12, phi: 15, h: 2.6, wall: 'white', roof: 'gable', rise: 0.3 },
    // faculty cottages
    ...[[1630, 342], [1697, 353], [1765, 366], [1572, 426], [1755, 426], [1676, 462], [1752, 476], [1572, 490]].map((at, i) => (
      { at, w: 36, d: 24, phi: 3, h: 3.0, wall: 'wood', roof: 'hip', rise: 0.3, roofColor: i % 2 ? '#6d7f6c' : '#8c6a5c', lanai: i % 2 })),
  ];

  const UPPER_FIELD = { at: [862, 694], w: 107, d: 54, phi: 16 };
  const BASEBALL = { home: [779, 897], phi: 44 };
  const PARKING = { at: [1096, 976], w: 110, d: 190, phi: 0 };

  const ROADS = [
    { kind: 'hwy', w: 10.5, pts: [[-900, 300], [-400, 470], [0, 655], [100, 700], [180, 752], [240, 830], [310, 930], [390, 1040], [470, 1150], [545, 1276], [760, 1560], [1000, 1900]] },
    { kind: 'campus', w: 6.5, pts: [[205, 790], [222, 700], [229, 560], [235, 420], [245, 305], [268, 250], [312, 224], [420, 206], [530, 232], [640, 272], [760, 316], [870, 350], [1000, 386], [1100, 410], [1200, 428], [1290, 458], [1360, 505], [1420, 522]] },
    { kind: 'campus', w: 6.5, pts: [[548, 1262], [650, 1212], [760, 1182], [870, 1165], [960, 1150], [1010, 1112], [1030, 1040], [1030, 900], [1032, 780], [1052, 718], [1100, 668], [1170, 638], [1240, 610], [1300, 582], [1350, 560], [1420, 522], [1490, 522], [1545, 560], [1585, 625], [1603, 700], [1612, 745]] },
    { kind: 'campus', w: 5.5, pts: [[1420, 522], [1470, 460], [1510, 400], [1560, 350], [1620, 300], [1700, 250], [1800, 220]] },
    { kind: 'old', w: 4.5, pts: [[300, -60], [260, 40], [190, 160], [152, 260], [140, 380], [148, 520], [178, 650], [205, 790]] },
    { kind: 'path', w: 2.6, pts: [[690, 520], [780, 548], [860, 566], [960, 590], [1100, 578], [1220, 575], [1310, 575]] },
    { kind: 'path', w: 2.4, pts: [[600, 480], [690, 520], [760, 600], [790, 650]] },
    { kind: 'path', w: 2.4, pts: [[845, 612], [900, 610], [960, 590]] },
    { kind: 'path', w: 2.2, pts: [[1060, 610], [1060, 700], [1052, 718]] },
  ];

  // tree lines: cook = tall Norfolk/Cook pines, broad = canopy trees
  const TREE_LINES = [
    { kind: 'cook', rows: 2, gap: 3.2, pts: [[240, 508], [300, 482], [370, 466], [450, 463], [520, 480], [578, 518], [618, 568], [643, 618], [655, 660]] },
    { kind: 'cook', rows: 2, gap: 3.0, pts: [[712, 736], [800, 768], [900, 800], [1000, 830], [1022, 842]] },
    { kind: 'hedge', rows: 1, gap: 4.2, pts: [[268, 604], [330, 690], [410, 800], [490, 915], [560, 1015], [625, 1108]] },
    { kind: 'cook', rows: 2, gap: 3.6, pts: [[540, 228], [620, 250], [700, 296], [790, 328]] },
    { kind: 'cook', rows: 3, gap: 3.8, pts: [[880, 40], [950, 130], [1010, 240], [1055, 320], [1090, 380]] },
    { kind: 'broad', rows: 2, gap: 6, pts: [[1100, 200], [1180, 230], [1260, 252], [1335, 300]] },
    { kind: 'cook', rows: 2, gap: 3.6, pts: [[1250, 225], [1290, 320], [1325, 400], [1340, 470]] },
    { kind: 'cook', rows: 3, gap: 3.8, pts: [[1330, 250], [1420, 310], [1495, 385], [1535, 470], [1545, 560]] },
    { kind: 'cook', rows: 2, gap: 3.8, pts: [[1620, 205], [1700, 238], [1790, 268], [1880, 300]] },
    { kind: 'broad', rows: 2, gap: 7, pts: [[1420, 620], [1445, 700], [1420, 790], [1395, 860]] },
    { kind: 'broad', rows: 1, gap: 6, pts: [[1030, 640], [1046, 760], [1060, 880]] },
    { kind: 'cook', rows: 1, gap: 4, pts: [[1060, 780], [1070, 860], [1075, 960]] },
    { kind: 'broad', rows: 3, gap: 7, pts: [[150, 440], [175, 540], [205, 640]] },
    { kind: 'broad', rows: 4, gap: 8, pts: [[40, 60], [90, 160], [140, 250], [100, 360], [60, 470]] },
    { kind: 'broad', rows: 3, gap: 8, pts: [[1290, 1010], [1390, 1000], [1500, 1010], [1600, 1040], [1720, 1020], [1880, 1000]] },
    { kind: 'broad', rows: 2, gap: 8, pts: [[1080, 1280], [1180, 1170], [1290, 1080]] },
    { kind: 'broad', rows: 1, gap: 9, pts: [[620, 160], [720, 200], [820, 240]] },
  ];
  // campus shade trees (single)
  const RAW_TREES = [[880, 520], [905, 505], [700, 470], [610, 395], [960, 520], [1110, 600], [1200, 470], [1320, 420], [1010, 610],
    [430, 300], [600, 300], [760, 360], [1240, 720], [1150, 760], [990, 1150], [1110, 1110], [300, 330], [380, 400], [1480, 700], [1500, 880], [1560, 820]];

  // ---------- terrain ----------
  const GULCHES = [
    { pl: poly(PP([[60, 30], [300, 90], [520, 130], [800, 170], [1050, 240], [1300, 330], [1520, 340], [1900, 300]])), depth: 6, w: 16 },
    { pl: poly(PP([[960, 1320], [1120, 1180], [1300, 1062], [1480, 984], [1650, 924], [1950, 860]])), depth: 4.5, w: 12 },
  ];
  function baseH(x, z) {
    let h = -0.03 * z + 1.4 * Math.sin(x * 0.011 + 0.5) * Math.cos(z * 0.009) + 0.5 * Math.sin(x * 0.037 + z * 0.029);
    // the campus sits at the foot of steep grassy slopes that climb toward the Kohala side (north and west)
    const nUp = Math.max(0, -z - 140), wUp = Math.max(0, -x - 170);
    // steep right behind the buildings, levelling off into the Kohala foothills
    h += 130 * (1 - Math.exp(-Math.pow(nUp / 330, 1.25))) + 90 * (1 - Math.exp(-Math.pow(wUp / 380, 1.25))) * smooth(250, -100, z);
    h += 14 * Math.exp(-((x + 40) * (x + 40) + (z + 330) * (z + 330)) / 9000) + 10 * Math.exp(-((x - 160) * (x - 160) + (z + 300) * (z + 300)) / 7000);
    const far = smooth(700, 2200, Math.hypot(x - 150, z + 40));
    if (far > 0) h += far * (90 * Math.sin(x * 0.0011 + 1) * Math.cos(z * 0.0009) + 45 * Math.sin(x * 0.0031 - z * 0.0027));
    for (const g of GULCHES) { const d = polyDist(x, z, g.pl, g.w * 3); if (d < g.w * 3) h -= g.depth * Math.exp(-(d * d) / (g.w * g.w)); }
    return h;
  }
  const pads = [];
  function addPad(x, z, hw, hd, rot, blend, h) {
    pads.push({ x, z, hw, hd, rot, blend, h: h === undefined ? baseH(x, z) : h, rad: Math.hypot(hw, hd) + blend });
  }
  function groundH(x, z) {
    let h = baseH(x, z);
    for (const p of pads) {
      const dx = x - p.x, dz = z - p.z;
      if (dx > p.rad || dx < -p.rad || dz > p.rad || dz < -p.rad) continue;
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const d = Math.hypot(Math.max(Math.abs(lx) - p.hw, 0), Math.max(Math.abs(lz) - p.hd, 0));
      if (d < p.blend) h += (p.h - h) * (1 - smooth(0, p.blend, d));
    }
    return h;
  }

  // convert data
  const BUILDINGS = RAW_BUILDINGS.map((b) => {
    const [x, z] = P(b.at[0], b.at[1]);
    let w = b.w * S, d = b.d * S, rot = -b.phi * RAD;
    if (d > w) { const t = w; w = d; d = t; rot += Math.PI / 2; } // ridge always along local x
    return Object.assign({}, b, { x, z, w, d, rot });
  });
  const uf = (() => { const [x, z] = P(...UPPER_FIELD.at); return { x, z, rot: -UPPER_FIELD.phi * RAD, hw: UPPER_FIELD.w / 2, hd: UPPER_FIELD.d / 2 }; })();
  const bb = (() => { const [x, z] = P(...BASEBALL.home); return { x, z, rot: -BASEBALL.phi * RAD }; })();
  const pk = (() => { const [x, z] = P(...PARKING.at); return { x, z, rot: -PARKING.phi * RAD, hw: PARKING.w * S / 2, hd: PARKING.d * S / 2 }; })();

  addPad(0, 0, TL + R_OUT + 6, R_OUT + 8, TRACK.rot, 22, baseH(0, 0));
  addPad(uf.x, uf.z, uf.hw + 4, uf.hd + 4, uf.rot, 16);
  { const [cx, cz] = toWorld(bb, 45, 0); addPad(cx, cz, 55, 50, bb.rot, 14); }
  addPad(pk.x, pk.z, pk.hw + 2, pk.hd + 2, pk.rot, 8);
  for (const b of BUILDINGS) addPad(b.x, b.z, b.w / 2 + 2.5, b.d / 2 + 2.5, b.rot, 7);

  const roads = ROADS.map((r) => Object.assign({}, r, { pl: poly(PP(r.pts)) }));
  const treeLines = TREE_LINES.map((t) => Object.assign({}, t, { pl: poly(PP(t.pts)) }));

  const colliders = { circles: [], boxes: [] };
  const box = (x, z, hw, hd, rot) => colliders.boxes.push({ x, z, hw, hd, rot });

  // ---------- helpers ----------
  function canvasTex(w, h, draw, linear) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
    if (!linear) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function mergeGeoms(parts) {
    let n = 0;
    const list = parts.map(({ g, c }) => { const ng = g.index ? g.toNonIndexed() : g; if (!ng.attributes.normal) ng.computeVertexNormals(); n += ng.attributes.position.count; return { ng, c }; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const { ng, c } of list) {
      const cnt = ng.attributes.position.count;
      pos.set(ng.attributes.position.array, o * 3); nor.set(ng.attributes.normal.array, o * 3);
      for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
      o += cnt;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  }
  const dummy = new THREE.Object3D();
  function instanced(geo, mat, items, set, colorFn, cast) {
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); set(dummy, it); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); if (colorFn) m.setColorAt(i, colorFn(it)); });
    m.castShadow = !!cast; m.receiveShadow = true;
    m.frustumCulled = false; // r128 culls by the base geometry, not the instances
    scene.add(m); return m;
  }
  function drape(geo, ox, oz, rot, lift) {
    const p = geo.attributes.position, c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), lz = p.getZ(i), x = ox + lx * c + lz * s, z = oz - lx * s + lz * c;
      p.setXYZ(i, x, groundH(x, z) + lift, z);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const overlayMat = (map, extra) => new THREE.MeshStandardMaterial(Object.assign({ map, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }, extra || {}));

  // ---------- ground ----------
  const grassTex = canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#d9e3c6'; g.fillRect(0, 0, W, H);
    const r = rng(11);
    for (let i = 0; i < 9000; i++) {
      const x = r() * W, y = r() * H, l = 3 + r() * 7, a = -Math.PI / 2 + (r() - 0.5) * 1.2;
      const v = r();
      g.strokeStyle = v < 0.45 ? 'rgba(70,95,40,0.30)' : v < 0.8 ? 'rgba(250,255,225,0.30)' : 'rgba(150,130,70,0.25)';
      g.lineWidth = 1 + r();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  });
  const treeShadeBands = treeLines.filter((t) => t.kind !== 'hedge');
  (function ground() {
    const W = 1500, H = 1300, cx = 160, cz = -30;
    const geo = new THREE.PlaneGeometry(W, H, 440, 380);
    geo.rotateX(-Math.PI / 2); geo.translate(cx, 0, cz);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const lush = C('#5b8a34'), lush2 = C('#74a043'), dry = C('#a69a5a'), dark = C('#3c6129'), c = new THREE.Color();
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, groundH(x, z));
      const n = Math.sin(x * 0.021) * Math.cos(z * 0.017) + Math.sin(x * 0.06 + z * 0.045) * 0.5 + Math.sin(x * 0.13 - z * 0.11) * 0.25;
      c.copy(lush).lerp(lush2, 0.5 + 0.5 * Math.sin(x * 0.043 + z * 0.031));
      c.lerp(dry, smooth(0.35, 1.3, n) * 0.6);
      let sh = 0;
      for (const t of treeShadeBands) { const d = polyDist(x, z, t.pl, 14); if (d < 14) sh = Math.max(sh, 1 - smooth(2, 14, d)); }
      for (const g2 of GULCHES) { const d = polyDist(x, z, g2.pl, 25); if (d < 25) sh = Math.max(sh, (1 - smooth(0, 25, d)) * 0.7); }
      c.lerp(dark, sh * 0.55);
      const j = (R() - 0.5) * 0.025;
      col[i * 3] = c.r + j; col[i * 3 + 1] = c.g + j; col[i * 3 + 2] = c.b + j * 0.5;
      uv.setXY(i, x / 4, z / 4);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTex, roughness: 1 }));
    m.receiveShadow = true;
    scene.add(m);
  })();
  (function farGround() {
    const geo = new THREE.PlaneGeometry(26000, 26000, 130, 130);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const a = C('#5f8a3a'), b = C('#9c9858'), d = C('#4c6e33'), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + 160, z = pos.getZ(i) - 30;
      pos.setX(i, x); pos.setZ(i, z);
      // under the detailed ground the coarse plane must stay out of sight
      const inside = Math.abs(x - 160) < 470 && Math.abs(z + 30) < 370; // one coarse cell inside the detailed edge
      pos.setY(i, inside ? baseH(x, z) - 60 : baseH(x, z) - 3);
      const n = Math.sin(x * 0.0021) * Math.cos(z * 0.0017) + 0.5 * Math.sin(x * 0.0063 + z * 0.0051);
      c.copy(a).lerp(b, smooth(-0.2, 1.1, n) * 0.7).lerp(d, smooth(0.6, 1.4, -n) * 0.5);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  })();

  // ---------- track & infield ----------
  const trackG = new THREE.Group();
  trackG.position.set(TRACK.x, groundH(0, 0), TRACK.z); trackG.rotation.y = TRACK.rot;
  scene.add(trackG);
  (function trackSurface() {
    const L = 2 * (TL + R_OUT) + 4, Wd = 2 * R_OUT + 4, px = Math.floor(4090 / L);
    const tex = canvasTex(Math.round(L * px), Math.round(Wd * px), (g, W, H) => {
      g.translate(W / 2, H / 2); g.scale(px, px);
      const stadium = (r) => { g.beginPath(); g.moveTo(-TL, -r); g.lineTo(TL, -r); g.arc(TL, 0, r, -Math.PI / 2, Math.PI / 2); g.lineTo(-TL, r); g.arc(-TL, 0, r, Math.PI / 2, Math.PI * 1.5); g.closePath(); };
      const rr = rng(5);
      // synthetic surface, including the D-zones at both ends
      stadium(R_OUT + 0.25); g.fillStyle = '#b4493b'; g.fill();
      g.save(); g.clip();
      for (let i = 0; i < 60000; i++) { g.fillStyle = rr() < 0.5 ? 'rgba(80,20,15,0.10)' : 'rgba(240,150,130,0.08)'; g.fillRect((rr() - 0.5) * L, (rr() - 0.5) * Wd, 0.15 + rr() * 0.35, 0.15 + rr() * 0.35); }
      for (let k = 0; k < LANES; k++) { if (k < 3) { g.lineWidth = LANE * 0.7; g.strokeStyle = 'rgba(255,190,170,0.06)'; stadium(R_IN + LANE * (k + 0.5)); g.stroke(); } }
      g.restore();
      // grass field with mowing stripes
      const fx = FIELD_L / 2 + 3, fz = FIELD_W / 2 + 2.5;
      g.save(); g.beginPath(); g.rect(-fx, -fz, fx * 2, fz * 2); g.clip();
      for (let x = -fx, i = 0; x < fx; x += 7.5, i++) { g.fillStyle = i % 2 ? '#5d913a' : '#6ea445'; g.fillRect(x, -fz, 7.5, fz * 2); }
      for (let i = 0; i < 40000; i++) { g.fillStyle = rr() < 0.5 ? 'rgba(40,70,20,0.12)' : 'rgba(220,240,170,0.10)'; g.fillRect((rr() - 0.5) * fx * 2, (rr() - 0.5) * fz * 2, 0.12 + rr() * 0.3, 0.12 + rr() * 0.3); }
      // worn goalmouths
      [-1, 1].forEach((s) => { const gr = g.createRadialGradient(s * FIELD_L / 2 * 0.95, 0, 0, s * FIELD_L / 2 * 0.95, 0, 9); gr.addColorStop(0, 'rgba(150,140,90,0.45)'); gr.addColorStop(1, 'rgba(150,140,90,0)'); g.fillStyle = gr; g.fillRect(s * FIELD_L / 2 - 12, -10, 24, 20); });
      g.restore();
      // lane lines and kerb
      g.strokeStyle = '#f5f2ec'; g.lineWidth = 0.06;
      for (let k = 0; k <= LANES; k++) { stadium(R_IN + k * LANE); g.stroke(); }
      g.lineWidth = 0.14; stadium(R_IN); g.stroke();
      // finish line, lane numbers, staggered starts
      g.lineWidth = 0.1; g.beginPath(); g.moveTo(TL, -R_IN); g.lineTo(TL, -R_OUT); g.stroke();
      g.fillStyle = '#f5f2ec'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 0.85px Arial, sans-serif';
      for (let k = 0; k < LANES; k++) { g.save(); g.translate(TL - 2.2, -(R_IN + LANE * (k + 0.5))); g.rotate(Math.PI / 2); g.fillText(String(k + 1), 0, 0); g.restore(); }
      for (let k = 0; k < LANES; k++) { const a = -Math.PI / 2 - (k * 0.035); const r0 = R_IN + LANE * k, r1 = r0 + LANE; g.beginPath(); g.moveTo(-TL + Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(-TL + Math.cos(a) * r1, Math.sin(a) * r1); g.stroke(); }
      // soccer markings
      g.lineWidth = 0.12; g.strokeStyle = 'rgba(250,250,245,0.95)';
      const hl = FIELD_L / 2, hw = FIELD_W / 2;
      g.strokeRect(-hl, -hw, FIELD_L, FIELD_W);
      g.beginPath(); g.moveTo(0, -hw); g.lineTo(0, hw); g.stroke();
      g.beginPath(); g.arc(0, 0, 9.15, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(0, 0, 0.25, 0, Math.PI * 2); g.fill();
      [-1, 1].forEach((s) => {
        g.strokeRect(s > 0 ? hl - 16.5 : -hl, -Math.min(20.15, hw - 1), 16.5, Math.min(40.3, FIELD_W - 2));
        g.strokeRect(s > 0 ? hl - 5.5 : -hl, -9.16, 5.5, 18.32);
        g.beginPath(); g.arc(s * (hl - 11), 0, 0.22, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(s * (hl - 11), 0, 9.15, s > 0 ? Math.PI - 0.93 : -0.93, s > 0 ? Math.PI + 0.93 : 0.93); g.stroke();
        [-1, 1].forEach((t) => { g.beginPath(); g.arc(s * hl, t * hw, 1, 0, Math.PI * 2); g.stroke(); });
      });
    });
    const geo = new THREE.PlaneGeometry(L, Wd).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, overlayMat(tex, { alphaTest: 0.5, transparent: false }));
    m.position.y = 0.04; m.receiveShadow = true; trackG.add(m);
  })();
  (function trackFurniture() {
    const white = new THREE.MeshStandardMaterial({ color: C('#f4f4f2'), roughness: 0.5 });
    const alu = new THREE.MeshStandardMaterial({ color: C('#b8bcbf'), roughness: 0.45, metalness: 0.5 });
    const netTex = canvasTex(64, 64, (g) => { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; for (let i = 0; i <= 64; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); } });
    netTex.repeat.set(8, 3);
    const netMat = new THREE.MeshStandardMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
    // soccer goals
    [-1, 1].forEach((s) => {
      const gx = s * (FIELD_L / 2);
      const goal = new THREE.Group(); goal.position.set(gx, 0, 0); goal.rotation.y = s > 0 ? 0 : Math.PI; trackG.add(goal);
      [-3.66, 3.66].forEach((z) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.44, 8), white); p.position.set(0, 1.22, z); p.castShadow = true; goal.add(p); });
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.32, 8), white); bar.rotation.x = Math.PI / 2; bar.position.set(0, 2.44, 0); bar.castShadow = true; goal.add(bar);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(7.32, 2.6), netMat); back.rotation.y = Math.PI / 2; back.position.set(1.8, 1.25, 0); back.rotation.z = 0; goal.add(back);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 7.32), netMat); top.rotation.x = -Math.PI / 2; top.rotation.z = Math.PI / 2; top.position.set(0.9, 2.44, 0); goal.add(top);
      [-3.66, 3.66].forEach((z) => { const sd = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.44), netMat); sd.position.set(0.9, 1.22, z); goal.add(sd); });
      for (const z of [-3.66, 3.66]) { const [wx, wz] = toWorld(TRACK, gx, z); colliders.circles.push({ x: wx, z: wz, r: 0.25 }); }
    });
    // bleachers and press box on the north-east straight
    const len = 54, rows = 8, depth = 0.82, rise = 0.42, z0 = -(R_OUT + 2.4);
    for (let i = 0; i < rows; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, depth * 0.55), alu);
      s.position.set(0, rise * (i + 1), z0 - i * depth); s.castShadow = true; s.receiveShadow = true; trackG.add(s);
      const riser = new THREE.Mesh(new THREE.BoxGeometry(len, rise, 0.04), alu); riser.position.set(0, rise * (i + 0.5), z0 - i * depth + depth * 0.25); riser.castShadow = true; trackG.add(riser);
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(len, rise * rows, 0.1), alu); frame.position.set(0, rise * rows / 2, z0 - rows * depth); frame.castShadow = true; trackG.add(frame);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), alu); rail.position.set(0, rise * rows + 1.0, z0 - rows * depth + 0.2); trackG.add(rail);
    const press = new THREE.Group(); press.position.set(0, rise * rows + 0.2, z0 - rows * depth - 1.9); trackG.add(press);
    const pb = new THREE.Mesh(new THREE.BoxGeometry(9, 2.6, 3.4), new THREE.MeshStandardMaterial({ color: C('#f1efe9'), roughness: 0.8 })); pb.position.y = 1.3; pb.castShadow = true; press.add(pb);
    const pw = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.9, 0.05), new THREE.MeshStandardMaterial({ color: C('#2e3a46'), roughness: 0.2, metalness: 0.3 })); pw.position.set(0, 1.55, 1.71); press.add(pw);
    const pr = new THREE.Mesh(new THREE.BoxGeometry(10, 0.25, 4.4), new THREE.MeshStandardMaterial({ color: C('#b23a32'), roughness: 0.6 })); pr.position.y = 2.75; pr.castShadow = true; press.add(pr);
    { const [wx, wz] = toWorld(TRACK, 0, z0 - rows * depth / 2 - 1); box(wx, wz, len / 2 + 0.3, rows * depth / 2 + 2.2, TRACK.rot); }
    // scoreboard beyond the south curve
    const sb = new THREE.Group(); sb.position.set(TL + R_OUT + 9, 0, 0); sb.rotation.y = -Math.PI / 2; trackG.add(sb);
    const sbTex = canvasTex(512, 256, (g, W, H) => {
      g.fillStyle = '#1b2026'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#b8352e'; g.fillRect(0, 0, W, 64);
      g.fillStyle = '#ffffff'; g.font = 'bold 44px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('HPA  KA MAKANI', W / 2, 34);
      g.font = 'bold 26px Arial, sans-serif'; g.fillStyle = '#e9e4da'; g.fillText('HOME', W * 0.25, 100); g.fillText('GUEST', W * 0.75, 100);
      g.font = 'bold 84px "Courier New", monospace'; g.fillStyle = '#ffb347'; g.fillText('00', W * 0.25, 175); g.fillText('00', W * 0.75, 175);
      g.font = 'bold 30px "Courier New", monospace'; g.fillStyle = '#ff5a4a'; g.fillText('12:00', W / 2, 175);
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(7, 3.5, 0.3), [white, white, white, white, new THREE.MeshStandardMaterial({ map: sbTex, roughness: 0.6, emissive: C('#222222') }), white]);
    board.position.y = 5; board.castShadow = true; sb.add(board);
    [-2.6, 2.6].forEach((x) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 5, 8), alu); p.position.set(x, 2.5, -0.2); p.castShadow = true; sb.add(p); });
    { const [wx, wz] = toWorld(TRACK, TL + R_OUT + 9, 0); box(wx, wz, 0.6, 3.8, TRACK.rot); }
    // pink high-jump mat in the north D-zone
    const mat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 5), new THREE.MeshStandardMaterial({ color: C('#e45b8a'), roughness: 0.8 }));
    mat.position.set(-(TL + 16), 0.3, 6); mat.castShadow = true; trackG.add(mat);
  })();

  // ---------- upper practice field ----------
  (function upperField() {
    const L = uf.hw * 2 + 6, Wd = uf.hd * 2 + 6, px = 14;
    const tex = canvasTex(Math.round(L * px), Math.round(Wd * px), (g, W, H) => {
      g.translate(W / 2, H / 2); g.scale(px, px);
      for (let x = -L / 2, i = 0; x < L / 2; x += 7, i++) { g.fillStyle = i % 2 ? 'rgba(30,60,15,0.10)' : 'rgba(230,255,190,0.08)'; g.fillRect(x, -Wd / 2 + 3, 7, Wd - 6); }
      g.strokeStyle = 'rgba(250,250,245,0.8)'; g.lineWidth = 0.12;
      const hl = uf.hw - 2, hw = uf.hd - 2;
      g.strokeRect(-hl, -hw, hl * 2, hw * 2); g.beginPath(); g.moveTo(0, -hw); g.lineTo(0, hw); g.stroke();
      g.beginPath(); g.arc(0, 0, 9.15, 0, Math.PI * 2); g.stroke();
      [-1, 1].forEach((s) => { g.strokeRect(s > 0 ? hl - 16.5 : -hl, -18, 16.5, 36); g.strokeRect(s > 0 ? hl - 5.5 : -hl, -9.16, 5.5, 18.32); });
    });
    const geo = drape(new THREE.PlaneGeometry(L, Wd, 30, 16).rotateX(-Math.PI / 2), uf.x, uf.z, uf.rot, 0.03);
    const m = new THREE.Mesh(geo, overlayMat(tex, { transparent: true, depthWrite: false }));
    m.receiveShadow = true; scene.add(m);
    const white = new THREE.MeshStandardMaterial({ color: C('#f4f4f2'), roughness: 0.5 });
    [-1, 1].forEach((s) => {
      const [gx, gz] = toWorld(uf, s * (uf.hw - 2), 0);
      const goal = new THREE.Group(); goal.position.set(gx, groundH(gx, gz), gz); goal.rotation.y = uf.rot + (s > 0 ? 0 : Math.PI); scene.add(goal);
      [-3, 3].forEach((z) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), white); p.position.set(0, 1, z); p.castShadow = true; goal.add(p); });
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 6), white); bar.rotation.x = Math.PI / 2; bar.position.y = 2; bar.castShadow = true; goal.add(bar);
    });
  })();

  // ---------- baseball diamond ----------
  (function baseball() {
    const x0 = -14, x1 = 106, z0 = -62, z1 = 62, px = 14;
    const tex = canvasTex((x1 - x0) * px, (z1 - z0) * px, (g) => {
      g.scale(px, px); g.translate(-x0, -z0);
      const A = 45 * RAD;
      // infield dirt
      g.fillStyle = '#8d5c3e';
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 29, -A - 0.07, A + 0.07); g.closePath(); g.fill();
      g.beginPath(); g.arc(0, 0, 4.2, 0, Math.PI * 2); g.fill();
      // infield grass
      g.fillStyle = '#679c3e';
      g.beginPath(); g.moveTo(3.2, 0); g.lineTo(19.4, -16.3); g.lineTo(35.6, 0); g.lineTo(19.4, 16.3); g.closePath(); g.fill();
      g.fillStyle = '#8d5c3e'; g.beginPath(); g.arc(18.4, 0, 2.7, 0, Math.PI * 2); g.fill();
      const rr = rng(9);
      g.save(); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 29, -A - 0.07, A + 0.07); g.closePath(); g.clip();
      for (let i = 0; i < 6000; i++) { g.fillStyle = rr() < 0.5 ? 'rgba(60,30,15,0.12)' : 'rgba(230,180,140,0.10)'; g.fillRect(rr() * 30, (rr() - 0.5) * 50, 0.2, 0.2); }
      g.restore();
      // chalk
      g.strokeStyle = 'rgba(250,250,245,0.95)'; g.lineWidth = 0.1;
      [-A, A].forEach((a) => { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 98, Math.sin(a) * 98); g.stroke(); });
      g.fillStyle = '#f5f5f0';
      [[19.4, 19.4], [38.8, 0], [19.4, -19.4]].forEach(([x, z]) => { g.save(); g.translate(x, z); g.rotate(A); g.fillRect(-0.2, -0.2, 0.4, 0.4); g.restore(); });
      g.beginPath(); g.moveTo(-0.2, -0.22); g.lineTo(0.05, -0.22); g.lineTo(0.25, 0); g.lineTo(0.05, 0.22); g.lineTo(-0.2, 0.22); g.closePath(); g.fill();
      g.fillRect(18.3, -0.3, 0.15, 0.6);
      // outfield mowing pattern
      g.save(); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 100, -A, A); g.closePath(); g.clip();
      for (let i = -12; i < 12; i++) for (let j = 0; j < 14; j++) { if ((i + j) % 2) continue; g.fillStyle = 'rgba(30,60,15,0.08)'; g.save(); g.rotate(A); g.fillRect(i * 8, j * 8 - 50, 8, 8); g.restore(); }
      g.restore();
    });
    const [cx, cz] = toWorld(bb, (x0 + x1) / 2, (z0 + z1) / 2);
    const geo = drape(new THREE.PlaneGeometry(x1 - x0, z1 - z0, 30, 30).rotateX(-Math.PI / 2), cx, cz, bb.rot, 0.035);
    const m = new THREE.Mesh(geo, overlayMat(tex, { transparent: true, depthWrite: false }));
    m.receiveShadow = true; scene.add(m);
    // backstop
    const fenceTex = canvasTex(64, 64, (g) => { g.strokeStyle = 'rgba(200,205,210,0.75)'; g.lineWidth = 1.5; for (let i = -64; i < 128; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); } });
    fenceTex.repeat.set(10, 2);
    const fenceMat = new THREE.MeshStandardMaterial({ map: fenceTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, metalness: 0.4, roughness: 0.5 });
    // three.js cylinders start theta at +z; the arc is centred on local -x, behind home plate
    const arc = new THREE.CylinderGeometry(9, 9, 6, 24, 1, true, Math.PI + 0.6, Math.PI - 1.2);
    const bs = new THREE.Mesh(arc, fenceMat);
    const [hx, hz] = toWorld(bb, -2, 0);
    bs.position.set(hx, groundH(hx, hz) + 3, hz); bs.rotation.y = bb.rot; scene.add(bs);
    // dugouts along the baselines
    const dugMat = new THREE.MeshStandardMaterial({ color: C('#d9d6cf'), roughness: 0.8 });
    [-1, 1].forEach((s) => {
      const a = s * 45 * RAD, along = 14, off = 9;
      const lx = Math.cos(a) * along - Math.sin(a) * off * s, lz = Math.sin(a) * along + Math.cos(a) * off * s;
      const [wx, wz] = toWorld(bb, lx, lz);
      const dg = new THREE.Mesh(new THREE.BoxGeometry(10, 2.3, 2.6), dugMat);
      dg.position.set(wx, groundH(wx, wz) + 1.15, wz); dg.rotation.y = bb.rot - a; dg.castShadow = true; dg.receiveShadow = true; scene.add(dg);
      box(wx, wz, 5.2, 1.5, bb.rot - a);
    });
  })();

  // ---------- roads, paths, parking ----------
  const roadTex = {
    hwy: canvasTex(256, 512, (g, W, H) => {
      g.fillStyle = '#4a4a4f'; g.fillRect(0, 0, W, H);
      const r = rng(3); for (let i = 0; i < 9000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)'; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
      g.fillStyle = '#f2f0ea'; g.fillRect(8, 0, 5, H); g.fillRect(W - 13, 0, 5, H);
      g.fillStyle = '#e8b931'; g.fillRect(W / 2 - 7, 0, 4, H); g.fillRect(W / 2 + 3, 0, 4, H);
    }),
    campus: canvasTex(128, 512, (g, W, H) => {
      g.fillStyle = '#56565a'; g.fillRect(0, 0, W, H);
      const r = rng(4); for (let i = 0; i < 4000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.07)'; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
      g.fillStyle = 'rgba(240,238,230,0.7)'; g.fillRect(3, 0, 3, H); g.fillRect(W - 6, 0, 3, H);
      for (let y = 0; y < H; y += 128) { g.fillStyle = 'rgba(30,30,30,0.35)'; g.fillRect(0, y + r() * 100, W, 2); }
    }),
    old: canvasTex(128, 512, (g, W, H) => {
      g.fillStyle = '#7d7a72'; g.fillRect(0, 0, W, H);
      const r = rng(6); for (let i = 0; i < 5000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.09)'; g.fillRect(r() * W, r() * H, 2, 2); }
    }),
    path: canvasTex(128, 256, (g, W, H) => {
      g.fillStyle = '#c9c4b8'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(80,75,65,0.35)'; for (let y = 0; y < H; y += 64) g.fillRect(0, y, W, 2);
      const r = rng(8); for (let i = 0; i < 1500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
    }),
  };
  const roadSpan = { hwy: 24, campus: 20, old: 20, path: 6 };
  function ribbon(pts, w, mat, lift, span) {
    const samples = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 2.5));
      for (let k = 0; k < n; k++) samples.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
    }
    samples.push(pts[pts.length - 1]);
    const pos = [], uv = [], idx = [];
    let dist = 0;
    samples.forEach(([x, z], i) => {
      if (i > 0) dist += Math.hypot(x - samples[i - 1][0], z - samples[i - 1][1]);
      const [px, pz] = samples[Math.max(0, i - 1)], [nx, nz] = samples[Math.min(samples.length - 1, i + 1)];
      let dx = nx - px, dz = nz - pz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const ox = -dz * w / 2, oz = dx * w / 2;
      pos.push(x + ox, groundH(x + ox, z + oz) + lift, z + oz, x - ox, groundH(x - ox, z - oz) + lift, z - oz);
      uv.push(0, dist / span, 1, dist / span);
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m);
    return m;
  }
  const roadMats = {};
  for (const k of Object.keys(roadTex)) roadMats[k] = overlayMat(roadTex[k], { roughness: k === 'path' ? 0.9 : 0.85, side: THREE.DoubleSide });
  for (const r of roads) ribbon(r.pl.pts, r.w, roadMats[r.kind], r.kind === 'path' ? 0.06 : 0.08, roadSpan[r.kind]);
  (function parking() {
    const W = pk.hw * 2, D = pk.hd * 2;
    const tex = canvasTex(512, 880, (g, w, h) => {
      g.fillStyle = '#4f4f53'; g.fillRect(0, 0, w, h);
      const r = rng(12); for (let i = 0; i < 9000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)'; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
      const sx = w / W, sz = h / D; g.fillStyle = 'rgba(245,243,235,0.85)';
      for (const cxm of [5.5, 17.5, 23, 35]) for (let z = 3; z < D - 3; z += 2.6) g.fillRect((cxm - 2.6) * sx, z * sz, 5.2 * sx, 2);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const geo = drape(new THREE.PlaneGeometry(W, D, 12, 20).rotateX(-Math.PI / 2), pk.x, pk.z, pk.rot, 0.09);
    const m = new THREE.Mesh(geo, overlayMat(tex)); m.receiveShadow = true; scene.add(m);
  })();

  // ---------- buildings ----------
  // HPA's campus is mid-century Hawaiian modern: dark-stained board-and-batten walls, lava-rock
  // end walls, low shed or hip roofs with deep eaves and dark fascia, and raised wooden lanai.
  const WOOD_DARK = '#35281f';
  const wallCache = {};
  function wallTex(kind) {
    if (wallCache[kind]) return wallCache[kind];
    const H0 = kind === 'gym' ? 512 : kind === 'glass' ? 128 : 256;
    const t = canvasTex(512, H0, (g, W, H) => {
      const m = 64, Y = (y) => H - y * m, r = rng(kind.length * 97 + 5);
      const win = (x0, x1, y0, y1, frame, mull, top, bot) => {
        g.fillStyle = frame; g.fillRect(x0 * m - 6, Y(y1) - 6, (x1 - x0) * m + 12, (y1 - y0) * m + 12);
        const gr = g.createLinearGradient(0, Y(y1), 0, Y(y0)); gr.addColorStop(0, top || '#222c35'); gr.addColorStop(1, bot || '#566a7c');
        g.fillStyle = gr; g.fillRect(x0 * m, Y(y1), (x1 - x0) * m, (y1 - y0) * m);
        g.fillStyle = 'rgba(255,255,255,0.10)';
        g.beginPath(); g.moveTo(x0 * m, Y(y1)); g.lineTo(x0 * m + (x1 - x0) * m * 0.3, Y(y1)); g.lineTo(x0 * m, Y(y0) - 8); g.fill();
        g.fillStyle = frame;
        for (let i = 1; i < mull; i++) g.fillRect((x0 + (x1 - x0) * i / mull) * m - 3, Y(y1), 6, (y1 - y0) * m);
        g.fillRect(x0 * m, Y(y0 + (y1 - y0) * 0.72) - 2, (x1 - x0) * m, 4);
      };
      const boards = (base, step) => {
        g.fillStyle = base; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 1400; i++) { g.fillStyle = r() < 0.5 ? 'rgba(20,10,5,0.10)' : 'rgba(255,220,180,0.05)'; g.fillRect(r() * W, r() * H, 1, 6 + r() * 26); }
        for (let x = 0; x < W; x += step) { g.fillStyle = 'rgba(15,8,4,0.55)'; g.fillRect(x, 0, 3, H); g.fillStyle = 'rgba(255,215,170,0.07)'; g.fillRect(x + 3, 0, 1, H); }
      };
      if (kind === 'wood') {
        boards('#4f3b2c', 12);
        win(0.3, 3.5, 0.85, 2.7, '#2b2018', 3);
        // solid wood door with a lite
        g.fillStyle = '#2b2018'; g.fillRect(3.85 * m - 5, Y(2.35) - 5, 1.1 * m + 10, 2.35 * m + 5);
        g.fillStyle = '#5b4433'; g.fillRect(3.85 * m, Y(2.35), 1.1 * m, 2.35 * m);
        for (let x = 3.85 * m; x < 4.95 * m; x += 9) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, Y(2.35), 2, 2.35 * m); }
        g.fillStyle = '#c9b48a'; g.fillRect(4.75 * m, Y(1.05), 4, 10);
        win(5.3, 7.7, 0.85, 2.7, '#2b2018', 2);
      } else if (kind === 'stone') {
        g.fillStyle = '#2a2420'; g.fillRect(0, 0, W, H);
        const pal = ['#5e4d41', '#6f5b4b', '#4b3e35', '#7c6757', '#40362f', '#665447', '#8a7461'];
        for (let i = 0; i < 1100; i++) {
          const x = r() * W, y = r() * H, rad = 7 + r() * 11, n = 5 + ((r() * 3) | 0);
          g.fillStyle = pal[(r() * pal.length) | 0];
          g.beginPath();
          for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + r() * 0.5, rr = rad * (0.7 + r() * 0.35); g.lineTo(x + Math.cos(a) * rr * 1.25, y + Math.sin(a) * rr * 0.85); }
          g.closePath(); g.fill();
          g.fillStyle = 'rgba(255,240,220,0.10)'; g.beginPath(); g.ellipse(x - 3, y - 3, rad * 0.45, rad * 0.3, 0, 0, 7); g.fill();
        }
      } else if (kind === 'glass') {
        // clerestory band: 8 m × 2 m
        g.fillStyle = '#2b2018'; g.fillRect(0, 0, W, H);
        for (let x = 0; x < W; x += 64) {
          const gr = g.createLinearGradient(0, 8, 0, H - 8); gr.addColorStop(0, '#3d4f60'); gr.addColorStop(1, '#1f2933');
          g.fillStyle = gr; g.fillRect(x + 6, 8, 52, H - 16);
          g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(x + 6, 8); g.lineTo(x + 30, 8); g.lineTo(x + 6, H * 0.6); g.fill();
        }
      } else if (kind === 'gym') {
        boards('#7b6450', 16);
        g.fillStyle = '#2b2018'; g.fillRect(0, H * 0.08, W, H * 0.14);
        for (let x = 0; x < W; x += 64) { const gr = g.createLinearGradient(0, H * 0.09, 0, H * 0.21); gr.addColorStop(0, '#3a4b5c'); gr.addColorStop(1, '#5e7386'); g.fillStyle = gr; g.fillRect(x + 6, H * 0.09, 52, H * 0.12); }
        g.fillStyle = '#5a4535'; g.fillRect(W * 0.38, H * 0.74, W * 0.24, H * 0.26);
      } else if (kind === 'white') {
        g.fillStyle = '#ebe8e0'; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 3000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(120,110,90,0.06)' : 'rgba(255,255,255,0.12)'; g.fillRect(r() * W, r() * H, 2, 2); }
        win(0.8, 2.6, 1.0, 2.5, '#f8f7f3', 2); win(5.4, 7.2, 1.0, 2.5, '#f8f7f3', 2);
        g.fillStyle = '#8a7a66'; g.fillRect(3.5 * m, Y(2.2), 1 * m, 2.2 * m);
      }
      g.fillStyle = 'rgba(0,0,0,0.22)'; if (kind !== 'glass') g.fillRect(0, Y(0.15), W, 0.15 * m);
    });
    return (wallCache[kind] = t);
  }
  const wallMats = {};
  const wallMat = (kind) => wallMats[kind] || (wallMats[kind] = new THREE.MeshStandardMaterial({ map: wallTex(kind), roughness: kind === 'glass' ? 0.25 : kind === 'stone' ? 0.95 : 0.85, metalness: kind === 'glass' ? 0.3 : 0 }));
  // standing-seam metal: ribs every 0.5 m running down the slope
  const seamTex = canvasTex(128, 128, (g, W, H) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 32) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 3, H); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(x + 3, 0, 2, H); }
    const r = rng(19); for (let i = 0; i < 600; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'; g.fillRect(r() * W, r() * H, 2, 6); }
  });
  const roofMats = {};
  const roofMat = (col) => roofMats[col] || (roofMats[col] = new THREE.MeshStandardMaterial({ color: C(col), map: seamTex, roughness: 0.5, metalness: 0.35 }));
  const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const postMat = new THREE.MeshStandardMaterial({ color: C('#3a2c22'), roughness: 0.8 });
  const footMat = new THREE.MeshStandardMaterial({ color: C('#3a312b'), roughness: 0.95 });
  const deckTex = canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = '#6b513d'; g.fillRect(0, 0, W, H);
    const r = rng(41);
    for (let y = 0; y < H; y += 16) { g.fillStyle = 'rgba(20,10,5,0.5)'; g.fillRect(0, y, W, 2); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,220,180,0.06)'; g.fillRect(r() * W, y + 3 + r() * 10, 30 + r() * 60, 1); } }
  });
  deckTex.repeat.set(2, 2);
  const deckMat = new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.85 });
  const panelTex = canvasTex(256, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#1d2c4a'); gr.addColorStop(1, '#14203a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#6f84a8'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, H); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(W, i * 64); g.stroke(); }
    g.strokeStyle = 'rgba(120,140,180,0.35)'; g.lineWidth = 1; for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, H); g.stroke(); }
  });
  const panelMatFor = (pw, pd) => { const t = panelTex.clone(); t.needsUpdate = true; t.repeat.set(pw / 4, pd / 4); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.25, metalness: 0.55 }); };

  // walls with material groups: 0 = long walls, 1 = end walls (follow the roof line), 2 = clerestory band
  function wallsGeo(w, d, hF, hB, vSpan, gableRise) {
    const hw = w / 2, hd = d / 2, G = [{ p: [], u: [] }, { p: [], u: [] }, { p: [], u: [] }];
    const quad = (gi, a, b, c, e, ua, ub, uc, ue) => { G[gi].p.push(...a, ...b, ...c, ...a, ...c, ...e); G[gi].u.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ue); };
    const tri = (gi, a, b, c, ua, ub, uc) => { G[gi].p.push(...a, ...b, ...c); G[gi].u.push(...ua, ...ub, ...uc); };
    const vf = hF / vSpan, vb = hB / vSpan;
    quad(0, [-hw, 0, hd], [hw, 0, hd], [hw, hF, hd], [-hw, hF, hd], [0, 0], [w / 8, 0], [w / 8, vf], [0, vf]);
    quad(0, [hw, 0, -hd], [-hw, 0, -hd], [-hw, hF, -hd], [hw, hF, -hd], [0, 0], [w / 8, 0], [w / 8, vf], [0, vf]);
    quad(1, [hw, 0, hd], [hw, 0, -hd], [hw, hB, -hd], [hw, hF, hd], [0, 0], [d / 8, 0], [d / 8, vb], [0, vf]);
    quad(1, [-hw, 0, -hd], [-hw, 0, hd], [-hw, hF, hd], [-hw, hB, -hd], [0, 0], [d / 8, 0], [d / 8, vf], [0, vb]);
    if (gableRise) {
      const vg = (hF + gableRise) / vSpan;
      tri(1, [hw, hF, hd], [hw, hF, -hd], [hw, hF + gableRise, 0], [0, vf], [d / 8, vf], [d / 16, vg]);
      tri(1, [-hw, hF, -hd], [-hw, hF, hd], [-hw, hF + gableRise, 0], [0, vf], [d / 8, vf], [d / 16, vg]);
    }
    if (hB > hF + 0.05) { const vc = (hB - hF) / 2; quad(2, [hw, hF, -hd], [-hw, hF, -hd], [-hw, hB, -hd], [hw, hB, -hd], [0, 0], [w / 8, 0], [w / 8, vc], [0, vc]); }
    const pos = [], uv = [], geo = new THREE.BufferGeometry();
    let start = 0;
    G.forEach((gr, i) => { pos.push(...gr.p); uv.push(...gr.u); const n = gr.p.length / 3; if (n) geo.addGroup(start, n, i); start += n; });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  }
  function triGeo(list, uvScale) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(list.flat(), 3));
    if (uvScale) geo.setAttribute('uv', new THREE.Float32BufferAttribute(list.flatMap((p) => [p[0] * uvScale, p[2] * uvScale]), 2));
    geo.computeVertexNormals();
    return geo;
  }
  // roof: metal top plus dark trim (fascia, soffit, exposed rafters). y = 0 is the low wall plate.
  function roofParts(type, w, d, rise, eave, rafters) {
    const hw = w / 2, hd = d / 2, W = hw + eave, D = hd + eave, f = type === 'shed' ? 0.45 : 0.35;
    const top = [], trim = [];
    const quad = (arr, a, b, c, e) => arr.push(a, b, c, a, c, e);
    let yF = 0, yB = 0, k = 0;
    if (type === 'shed') {
      k = rise / d; yF = -k * eave; yB = rise + k * eave;
      quad(top, [-W, yF, D], [W, yF, D], [W, yB, -D], [-W, yB, -D]);
      quad(trim, [-W, yF - f, D], [W, yF - f, D], [W, yF, D], [-W, yF, D]);
      quad(trim, [W, yB - f, -D], [-W, yB - f, -D], [-W, yB, -D], [W, yB, -D]);
      quad(trim, [W, yF - f, D], [W, yB - f, -D], [W, yB, -D], [W, yF, D]);
      quad(trim, [-W, yB - f, -D], [-W, yF - f, D], [-W, yF, D], [-W, yB, -D]);
      trim.push([-W, yF - f, D], [-W, yB - f, -D], [W, yB - f, -D], [-W, yF - f, D], [W, yB - f, -D], [W, yF - f, D]);
    } else if (type === 'hip') {
      const rl = Math.max(W - D, 0.05);
      quad(top, [-W, 0, D], [W, 0, D], [rl, rise, 0], [-rl, rise, 0]);
      quad(top, [W, 0, -D], [-W, 0, -D], [-rl, rise, 0], [rl, rise, 0]);
      top.push([W, 0, D], [W, 0, -D], [rl, rise, 0], [-W, 0, -D], [-W, 0, D], [-rl, rise, 0]);
    } else if (type === 'gable') {
      quad(top, [-W, 0, D], [W, 0, D], [W, rise, 0], [-W, rise, 0]);
      quad(top, [W, 0, -D], [-W, 0, -D], [-W, rise, 0], [W, rise, 0]);
      top.push([W, 0, D], [W, 0, -D], [W, rise, 0], [-W, 0, -D], [-W, 0, D], [-W, rise, 0]);
    } else {
      quad(top, [-W, 0.3, D], [W, 0.3, D], [W, 0.3, -D], [-W, 0.3, -D]);
    }
    if (type !== 'shed') {
      const y1 = type === 'flat' ? 0.3 : 0, y0 = y1 - f - (type === 'flat' ? 0.2 : 0);
      quad(trim, [-W, y0, D], [W, y0, D], [W, y1, D], [-W, y1, D]);
      quad(trim, [W, y0, -D], [-W, y0, -D], [-W, y1, -D], [W, y1, -D]);
      quad(trim, [W, y0, D], [W, y0, -D], [W, y1, -D], [W, y1, D]);
      quad(trim, [-W, y0, -D], [-W, y0, D], [-W, y1, D], [-W, y1, -D]);
      trim.push([-W, y0, -D], [W, y0, -D], [W, y0, D], [-W, y0, -D], [W, y0, D], [-W, y0, D]);
    }
    const parts = [{ g: triGeo(trim), c: C(WOOD_DARK) }];
    if (rafters) {
      // exposed rafter tails under the front eave
      const under = (z) => (type === 'shed' ? -k * (z - hd) : 0) - f;
      for (let x = -hw + 0.4; x <= hw; x += 1.25) {
        const zc = hd + eave / 2, bx = new THREE.BoxGeometry(0.12, 0.22, eave - 0.1);
        if (type === 'shed') bx.rotateX(Math.atan(k));
        bx.translate(x, under(zc) - 0.11, zc);
        parts.push({ g: bx, c: C('#3f3025') });
      }
    }
    return { top: triGeo(top, 0.5), trim: mergeGeoms(parts), yF, yB, k, f };
  }

  function building(b) {
    const g = new THREE.Group();
    const y0 = groundH(b.x, b.z);
    g.position.set(b.x, y0, b.z); g.rotation.y = b.rot;
    const woodish = b.wall === 'wood' || b.wall === 'stone';
    const floor = woodish && b.h < 5 ? 0.6 : 0.15;
    const eave = b.roof === 'shed' ? 2.6 : b.wall === 'gym' ? 0.9 : woodish ? 1.9 : 1.2;
    const hd = b.d / 2, D = hd + eave;
    let hF = b.h, hB = b.h, rise = 0, gableRise = 0;
    if (b.roof === 'shed') { rise = b.d * (b.rise || 0.15); hB = b.h + rise; }
    else if (b.roof === 'gable') { rise = D * (b.rise || 0.18) * 2; gableRise = rise * hd / D; }
    else if (b.roof === 'hip') rise = D * (b.rise || 0.3);
    const body = new THREE.Group(); body.position.y = floor; g.add(body);
    const vSpan = b.wall === 'gym' ? b.h : 4;
    const walls = new THREE.Mesh(wallsGeo(b.w, b.d, hF, hB, vSpan, gableRise), [wallMat(b.wall), wallMat(b.ends || b.wall), wallMat('glass')]);
    walls.castShadow = true; walls.receiveShadow = true; body.add(walls);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 3 + floor, b.d + 0.3), footMat); foot.position.y = (floor - 3) / 2; foot.receiveShadow = true; g.add(foot);
    const roofColor = b.roofColor || (b.wall === 'gym' ? '#d9d9d5' : '#a9a9a4');
    const rp = roofParts(b.roof, b.w, b.d, rise, eave, woodish && b.roof !== 'flat');
    const top = new THREE.Mesh(rp.top, roofMat(roofColor)); top.position.y = hF; top.castShadow = true; top.receiveShadow = true; body.add(top);
    const trim = new THREE.Mesh(rp.trim, trimMat); trim.position.y = hF; trim.castShadow = true; trim.receiveShadow = true; body.add(trim);
    if (b.solar && (b.roof === 'hip' || b.roof === 'gable')) {
      const slope = Math.atan2(rise, D), slen = Math.hypot(D, rise);
      const rl = b.roof === 'hip' ? Math.max(b.w / 2 + eave - D, 0) : b.w / 2 + eave;
      const pw = (b.roof === 'hip' ? (b.w / 2 + eave + rl) : (b.w + 2 * eave)) * 0.82, pd = slen * 0.7;
      const south = Math.cos(b.rot) >= 0 ? 1 : -1;
      const pm = panelMatFor(pw, pd);
      for (const s of (b.solar === 2 ? [1, -1] : [south])) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.08, pd), pm);
        p.position.set(0, hF + rise / 2 + 0.12, s * D / 2); p.rotation.x = s * slope;
        p.castShadow = true; body.add(p);
      }
    }
    let deckDepth = 0;
    if (b.lanai) {
      // raised wooden lanai along the front, under the eave, with posts, railing and steps
      deckDepth = eave - 0.45;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.18, deckDepth), deckMat);
      deck.position.set(0, floor - 0.09, hd + deckDepth / 2); deck.receiveShadow = true; deck.castShadow = true; g.add(deck);
      const parts = [], dark = C(WOOD_DARK), mid = C('#4a382a');
      parts.push({ g: new THREE.BoxGeometry(b.w + 0.6, floor + 3, 0.12).translate(0, (floor - 3) / 2, hd + deckDepth), c: C('#2f2620') });
      const zp = hd + deckDepth - 0.12;
      const underAt = (z) => (b.roof === 'shed' ? -rp.k * (z - hd) : 0) - rp.f;
      const postH = hF + underAt(zp);
      for (let x = -b.w / 2; x <= b.w / 2 + 0.01; x += 3.2) parts.push({ g: new THREE.BoxGeometry(0.24, postH, 0.24).translate(x, floor + postH / 2, zp), c: dark });
      const rail = (x0, x1) => {
        if (x1 - x0 < 0.3) return;
        for (const hh of [0.95, 0.5]) parts.push({ g: new THREE.BoxGeometry(x1 - x0, 0.08, 0.08).translate((x0 + x1) / 2, floor + hh, zp + 0.05), c: mid });
        for (let x = x0; x <= x1; x += 1.6) parts.push({ g: new THREE.BoxGeometry(0.08, 0.95, 0.08).translate(x, floor + 0.475, zp + 0.05), c: mid });
      };
      rail(-b.w / 2 - 0.3, -1.2); rail(1.2, b.w / 2 + 0.3);
      for (let i = 0; i < 3; i++) parts.push({ g: new THREE.BoxGeometry(2.2, floor * (3 - i) / 3, 0.35).translate(0, floor * (3 - i) / 6, hd + deckDepth + 0.17 + i * 0.35), c: C('#5c4635') });
      const m = new THREE.Mesh(mergeGeoms(parts), trimMat); m.castShadow = true; m.receiveShadow = true; g.add(m);
    }
    if (b.name === 'chapel') {
      const st = new THREE.Group(); st.position.set(b.w / 2 - 1.8, floor + b.h + gableRise * 0.5, 0); g.add(st);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.2, 2.4), wallMat('wood')); tower.position.y = 2.1; tower.castShadow = true; st.add(tower);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.9, 4.5, 4), roofMat('#5f5852')); spire.position.y = 6.45; spire.rotation.y = Math.PI / 4; spire.castShadow = true; st.add(spire);
      const cr = new THREE.MeshStandardMaterial({ color: C('#efe9dc'), roughness: 0.6 });
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), cr); cross1.position.y = 9.2; st.add(cross1);
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), cr); cross2.position.y = 9.4; st.add(cross2);
    }
    if (b.name === 'ml' || b.name === 'tech') {
      // building name plaque on the lava-rock end wall
      const label = b.name === 'ml' ? 'Modern Languages' : 'Technology Center';
      const tx = canvasTex(256, 32, (c2, W2, H2) => { c2.fillStyle = '#2a2420'; c2.fillRect(0, 0, W2, H2); c2.fillStyle = '#f1ece2'; c2.font = 'bold 19px Arial, sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText(label, W2 / 2, H2 / 2 + 1); });
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.3), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.6 }));
      plaque.position.set(b.w / 2 + 0.02, floor + 2.6, hd * 0.4); plaque.rotation.y = Math.PI / 2; g.add(plaque);
    }
    scene.add(g);
    const [cx, cz] = toWorld(b, 0, deckDepth / 2);
    box(cx, cz, b.w / 2 + 0.35, b.d / 2 + deckDepth / 2 + 0.35, b.rot);
    return g;
  }
  BUILDINGS.forEach(building);

  // pool deck and pool east of the main buildings, courtyard deck
  (function pool() {
    const [px, pz] = P(1205, 492);
    const deck = drape(new THREE.PlaneGeometry(22, 14, 6, 4).rotateX(-Math.PI / 2), px, pz, 0, 0.1);
    scene.add(Object.assign(new THREE.Mesh(deck, overlayMat(null, { color: C('#8c6b52') })), { receiveShadow: true }));
  })();


  // ---------- benches, bleacher seats, golf carts ----------
  // every seat: world position, seat height and the heading of someone sitting on it
  const seats = [];
  const benchWood = new THREE.MeshStandardMaterial({ color: C('#7a5a3e'), roughness: 0.8 });
  const benchLeg = new THREE.MeshStandardMaterial({ color: C('#3a2c22'), roughness: 0.8 });
  function bench(x, z, rot) {
    const y = groundH(x, z), o = { x, z, rot };
    const bg = new THREE.Group(); bg.position.set(x, y, z); bg.rotation.y = rot; scene.add(bg);
    for (let i = 0; i < 3; i++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.13), benchWood); sl.position.set(0, 0.45, -0.16 + i * 0.16); sl.castShadow = true; sl.receiveShadow = true; bg.add(sl); }
    for (let i = 0; i < 2; i++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.04), benchWood); sl.position.set(0, 0.68 + i * 0.17, -0.25); sl.rotation.x = -0.12; sl.castShadow = true; bg.add(sl); }
    [-0.78, 0.78].forEach((bx) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.9, 0.48), benchLeg); l.position.set(bx, 0.43, -0.03); l.castShadow = true; bg.add(l); });
    box(x, z, 0.95, 0.3, rot);
    [-0.45, 0.45].forEach((sx) => { const [px, pz] = toWorld(o, sx, 0.02); seats.push({ id: 's' + seats.length, x: px, z: pz, y: y + 0.47, ry: rot }); });
  }

  // ---------- flags and benches by Modern Languages ----------
  const flags = [];
  (function flagsAndBenches() {
    const ml = BUILDINGS.find((b) => b.name === 'ml');
    const flagTex = {
      hi: canvasTex(200, 100, (g) => {
        ['#ffffff', '#c8102e', '#012169', '#ffffff', '#c8102e', '#012169', '#ffffff', '#c8102e'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * 12.5, 200, 13); });
        g.save(); g.beginPath(); g.rect(0, 0, 100, 50); g.clip();
        g.fillStyle = '#012169'; g.fillRect(0, 0, 100, 50);
        g.strokeStyle = '#fff'; g.lineWidth = 10; g.beginPath(); g.moveTo(0, 0); g.lineTo(100, 50); g.moveTo(100, 0); g.lineTo(0, 50); g.stroke();
        g.strokeStyle = '#c8102e'; g.lineWidth = 3.5; g.stroke();
        g.strokeStyle = '#fff'; g.lineWidth = 16; g.beginPath(); g.moveTo(50, 0); g.lineTo(50, 50); g.moveTo(0, 25); g.lineTo(100, 25); g.stroke();
        g.strokeStyle = '#c8102e'; g.lineWidth = 9; g.stroke(); g.restore();
      }),
      us: canvasTex(190, 100, (g) => {
        for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#b22234'; g.fillRect(0, i * 100 / 13, 190, 100 / 13 + 1); }
        g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, 76, 54);
        g.fillStyle = '#fff';
        for (let r = 0; r < 9; r++) for (let k = 0; k < (r % 2 ? 5 : 6); k++) { g.beginPath(); g.arc(6.3 + k * 12.6 + (r % 2 ? 6.3 : 0), 4 + r * 5.8, 1.6, 0, 7); g.fill(); }
      }),
    };
    const poleMat = new THREE.MeshStandardMaterial({ color: C('#f4f4f2'), roughness: 0.35, metalness: 0.6 });
    const pole = (lx, lz, h, tex) => {
      const [x, z] = toWorld(ml, lx, lz), y0 = groundH(x, z);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, h, 10), poleMat); p.position.set(x, y0 + h / 2, z); p.castShadow = true; scene.add(p);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: C('#d9b54a'), metalness: 0.8, roughness: 0.3 })); ball.position.set(x, y0 + h + 0.12, z); scene.add(ball);
      const geo = new THREE.PlaneGeometry(3.4, 1.75, 24, 10).translate(1.7, 0, 0);
      const base = Float32Array.from(geo.attributes.position.array);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
      m.position.set(x, y0 + h - 1.05, z); m.rotation.y = 0.9; m.castShadow = true; scene.add(m);
      flags.push({ geo, base, ph: R() * 6 });
      colliders.circles.push({ x, z, r: 0.3 });
    };
    pole(-14, ml.d / 2 + 15, 13, flagTex.hi);
    pole(-5, ml.d / 2 + 15.5, 11.5, flagTex.us);
    // flag lawn paving
    const [fx, fz] = toWorld(ml, -9.5, ml.d / 2 + 15);
    const pave = drape(new THREE.CircleGeometry(4.2, 28).rotateX(-Math.PI / 2), fx, fz, ml.rot, 0.07);
    scene.add(Object.assign(new THREE.Mesh(pave, overlayMat(roadTex.path)), { receiveShadow: true }));
    [[2, ml.d / 2 + 6], [10, ml.d / 2 + 6], [-22, ml.d / 2 + 10]].forEach(([lx, lz]) => { const [x, z] = toWorld(ml, lx, lz); bench(x, z, ml.rot); });
  })();


  // more benches around the fields and lawns
  (function moreBenches() {
    [[-34, -(R_OUT + 2.6)], [34, -(R_OUT + 2.6)]].forEach(([lx, lz]) => { const [x, z] = toWorld(TRACK, lx, lz); bench(x, z, TRACK.rot); });
    [[-22, uf.hd + 3.5], [22, uf.hd + 3.5]].forEach(([lx, lz]) => { const [x, z] = toWorld(uf, lx, lz); bench(x, z, uf.rot + Math.PI); });
    [[1100, 612, 0], [1180, 605, 0], [600, 402, -0.4], [565, 160, 0.6], [985, 640, -0.3]].forEach(([px, py, r]) => { const [x, z] = P(px, py); bench(x, z, r); });
    // bleacher rows 2, 4 and 6, facing the track
    const depth = 0.82, rise = 0.42, z0 = -(R_OUT + 2.4), y0 = groundH(0, 0);
    for (const row of [1, 3, 5]) for (let lx = -22; lx <= 22; lx += 4.4) {
      const [x, z] = toWorld(TRACK, lx, z0 - row * depth);
      seats.push({ id: 'b' + row + '_' + Math.round(lx), x, z, y: y0 + rise * (row + 1) + 0.06, ry: TRACK.rot });
    }
  })();

  const carts = [];
  function placeCart(c, x, z, ry) {
    c.x = x; c.z = z; c.ry = ry;
    const y = groundH(x, z), f = 0.9, fx = Math.sin(ry) * f, fz = Math.cos(ry) * f;
    c.mesh.position.set(x, y, z); c.mesh.rotation.set(0, ry, 0);
    c.mesh.rotateX(-Math.atan2(groundH(x + fx, z + fz) - groundH(x - fx, z - fz), 2 * f));
  }
  // seat 0 = driver (left side), seat 1 = passenger; world x, z and seat height
  function cartSeat(c, seat) { const [x, z] = toWorld({ x: c.x, z: c.z, rot: c.ry }, seat === 0 ? 0.27 : -0.27, -0.1); return { x, z, y: groundH(c.x, c.z) + 0.78 }; }
  (function golfCarts() {
    const m = (c, r, mt) => new THREE.MeshStandardMaterial({ color: C(c), roughness: r, metalness: mt || 0 });
    const white = m('#f2f1ec', 0.35, 0.15), seatM = m('#d8c4a0', 0.8), dark = m('#1d1e21', 0.6), roofM = m('#2b2c30', 0.5), chrome = m('#c9ccd0', 0.3, 0.8);
    const add = (g, geo, mat, x, y, z) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };
    function cartMesh() {
      const g = new THREE.Group();
      add(g, new THREE.BoxGeometry(1.2, 0.32, 2.3), white, 0, 0.42, 0);
      add(g, new THREE.BoxGeometry(1.16, 0.42, 0.55), white, 0, 0.78, 0.92);
      add(g, new THREE.BoxGeometry(1.05, 0.14, 0.52), seatM, 0, 0.7, -0.12);
      add(g, new THREE.BoxGeometry(1.05, 0.45, 0.1), seatM, 0, 0.98, -0.4);
      add(g, new THREE.BoxGeometry(1.12, 0.22, 0.62), white, 0, 0.66, -0.86);
      for (const [x, z] of [[0.55, 0.78], [-0.55, 0.78], [0.55, -0.78], [-0.55, -0.78]]) { const w = add(g, new THREE.CylinderGeometry(0.22, 0.22, 0.18, 16), dark, x, 0.22, z); w.rotation.z = Math.PI / 2; }
      for (const [x, z] of [[0.52, 0.62], [-0.52, 0.62], [0.52, -0.62], [-0.52, -0.62]]) add(g, new THREE.BoxGeometry(0.05, 1.3, 0.05), chrome, x, 1.25, z);
      add(g, new THREE.BoxGeometry(1.3, 0.07, 1.95), roofM, 0, 1.92, 0);
      const wheel = add(g, new THREE.TorusGeometry(0.15, 0.025, 6, 18), dark, 0.27, 1.08, 0.42); wheel.rotation.x = -1.0;
      const col = add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), dark, 0.27, 0.92, 0.52); col.rotation.x = 0.55;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.75), new THREE.MeshStandardMaterial({ color: C('#cfe3ee'), transparent: true, opacity: 0.25, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
      glass.position.set(0, 1.5, 0.62); glass.rotation.x = -0.1; g.add(glass);
      scene.add(g);
      return g;
    }
    const ml = BUILDINGS.find((b) => b.name === 'ml');
    const spots = [
      [...P(1235, 602), 0.3], [...P(1092, 700), 1.2],
      [...toWorld(TRACK, 12, -(R_OUT + 13)), TRACK.rot + Math.PI / 2],
      [...toWorld(ml, 14, ml.d / 2 + 22), ml.rot + 2.4],
    ];
    spots.forEach(([x, z, ry], i) => { const c = { id: 'cart' + i, mesh: cartMesh(), home: { x, z, ry } }; placeCart(c, x, z, ry); carts.push(c); });
  })();

  // ---------- trees ----------
  function cookPineGeo(H, seed, coarse) {
    const r = rng(seed), parts = [];
    const lean = (r() - 0.5) * 0.025;
    parts.push({ g: new THREE.CylinderGeometry(0.12, 0.42, H, coarse ? 4 : 6).translate(0, H / 2, 0), c: C('#584536') });
    // Cook pines: a straight column of short, irregular branch whorls that droop at the tips
    const step = coarse ? 3 : 1.15, tiers = Math.floor((H - 2.4) / step);
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers, y = 2.4 + i * step + (r() - 0.5) * 0.3;
      if (!coarse && r() < 0.12) continue; // the odd gap where a whorl has died back
      const rad = (0.5 + 1.35 * Math.pow(1 - t, 0.7)) * (0.6 + r() * 0.55);
      const segs = coarse ? 5 : 7;
      const g = new THREE.CylinderGeometry(rad * 0.15, rad, step * 0.95, segs, 1);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        if (p.getY(k) < 0) { const s = 0.5 + r() * 0.8; p.setX(k, p.getX(k) * s); p.setZ(k, p.getZ(k) * s); p.setY(k, p.getY(k) - s * rad * 0.18); }
      }
      g.computeVertexNormals();
      g.rotateY(r() * 6.28); g.translate(lean * y + (r() - 0.5) * 0.15, y, lean * y + (r() - 0.5) * 0.15);
      const shade = C('#1d3622').lerp(C('#365a2f'), Math.min(1, t * 0.6 + r() * 0.35));
      parts.push({ g, c: shade });
    }
    parts.push({ g: new THREE.ConeGeometry(0.4, 2.2, 6).translate(lean * H, H + 0.4, lean * H), c: C('#3a5f33') });
    return mergeGeoms(parts);
  }
  function blob(radius, seed, detail) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.attributes.position, n = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.16 * Math.sin(x * 4.1 + seed) * Math.cos(y * 3.3 + seed * 2) + 0.1 * Math.sin(z * 5.7 + seed * 3);
      p.setXYZ(i, x * radius * k, y * radius * k * 0.8, z * radius * k);
      n[i * 3] = x; n[i * 3 + 1] = y * 0.8 + 0.25; n[i * 3 + 2] = z;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    g.normalizeNormals();
    return g;
  }
  function broadGeo(size, seed, form, coarse) {
    const r = rng(seed), parts = [];
    const trunkH = form === 'bush' ? 0.3 : size * (form === 'tall' ? 1.4 : 0.85);
    if (form !== 'bush') parts.push({ g: new THREE.CylinderGeometry(size * 0.06, size * 0.11, trunkH + size * 0.5, coarse ? 4 : 6).translate(0, (trunkH + size * 0.5) / 2, 0), c: C('#5a4636') });
    const nb = form === 'bush' ? 4 : (coarse ? 4 : 6 + Math.floor(r() * 3));
    for (let i = 0; i < nb; i++) {
      const a = r() * Math.PI * 2, d = (form === 'wide' ? 0.75 : 0.5) * size * r();
      const rad = size * (0.45 + r() * 0.3) * (coarse ? 1.15 : 1);
      const g = blob(rad, seed + i * 7, coarse ? 0 : 1);
      g.scale(form === 'wide' ? 1.25 : 1, form === 'wide' ? 0.7 : (form === 'tall' ? 1.25 : 1), form === 'wide' ? 1.25 : 1);
      g.translate(Math.cos(a) * d, trunkH + size * (0.35 + r() * 0.5) + (form === 'tall' ? size * 0.4 * r() : 0), Math.sin(a) * d);
      const col = C('#3b6a2c').lerp(C('#5d8a38'), r()).lerp(C('#2f5426'), r() * 0.5);
      parts.push({ g, c: col });
    }
    return mergeGeoms(parts);
  }
  const foliageMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const PINE_SPECS = [15, 18, 20, 23, 26];
  const BROAD_SPECS = [[4.5, 3, 'round', 0.6], [5.5, 5, 'wide', 0.7], [4.0, 8, 'tall', 0.5], [6.5, 13, 'wide', 0.8], [3.5, 21, 'round', 0.5]];
  const PINE_VARIANTS = PINE_SPECS.map((H, i) => ({ geo: cookPineGeo(H, 100 + i * 13), items: [] }));
  const BROAD_VARIANTS = BROAD_SPECS.map(([s, seed, form, r]) => ({ geo: broadGeo(s, seed, form), r, items: [] }));
  const FAR_PINES = PINE_SPECS.map((H, i) => ({ geo: cookPineGeo(H, 100 + i * 13, true), items: [] }));
  const FAR_BROAD = BROAD_SPECS.map(([s, seed, form]) => ({ geo: broadGeo(s, seed, form, true), items: [] }));
  const BUSH = { geo: broadGeo(2.4, 34, 'bush'), r: 1.2, items: [] };

  function isInBuilding(x, z, pad) {
    for (const b of colliders.boxes) {
      const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z;
      if (Math.abs(dx * c - dz * s) < b.hw + pad && Math.abs(dx * s + dz * c) < b.hd + pad) return true;
    }
    return false;
  }
  function onRoad(x, z, pad) { for (const r of roads) { if (polyDist(x, z, r.pl, r.w) < r.w / 2 + pad) return true; } return false; }
  function onTrack(x, z, pad) { const [lx, lz] = toLocal(TRACK, x, z); return Math.hypot(Math.max(Math.abs(lx) - TL, 0), lz) < R_OUT + pad; }
  function blocked(x, z, pad) { return onTrack(x, z, pad) || isInBuilding(x, z, pad) || onRoad(x, z, pad); }

  for (const tl of treeLines) {
    const pts = tl.pl.pts, curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const len = curve.getLength(), n = Math.max(2, Math.round(len / tl.gap));
    for (let row = 0; row < tl.rows; row++) {
      const off = (row - (tl.rows - 1) / 2) * (tl.kind === 'cook' ? 2.8 : 6);
      for (let i = 0; i <= n; i++) {
        const u = Math.min(1, (i + (row % 2) * 0.5) / n), p = curve.getPointAt(u), tg = curve.getTangentAt(u);
        const x = p.x - tg.z * off + (R() - 0.5) * (tl.kind === 'cook' ? 0.8 : 4), z = p.z + tg.x * off + (R() - 0.5) * (tl.kind === 'cook' ? 0.8 : 4);
        if (blocked(x, z, 1.5)) continue;
        if (tl.kind === 'cook') PINE_VARIANTS[(R() * PINE_VARIANTS.length) | 0].items.push({ x, z, s: 0.9 + R() * 0.2 });
        else if (tl.kind === 'hedge') BUSH.items.push({ x, z, s: 0.9 + R() * 0.4 });
        else BROAD_VARIANTS[(R() * BROAD_VARIANTS.length) | 0].items.push({ x, z, s: 0.8 + R() * 0.5 });
      }
    }
  }
  for (const [px, py] of RAW_TREES) { const [x, z] = P(px, py); if (!blocked(x, z, 2)) BROAD_VARIANTS[(R() * BROAD_VARIANTS.length) | 0].items.push({ x, z, s: 0.9 + R() * 0.5 }); }
  // windbreak rows and scattered trees out in the Waimea pastures
  // trees out in the pastures grow in clumps along gullies and around ranch houses
  for (let c = 0; c < 70; c++) {
    const cx = -1600 + R() * 3600, cz = -1500 + R() * 3000;
    if (Math.abs(cx - 160) < 480 && Math.abs(cz + 30) < 380) continue;
    const n = 4 + ((R() * 14) | 0), spread = 15 + R() * 35;
    for (let i = 0; i < n; i++) FAR_BROAD[(R() * FAR_BROAD.length) | 0].items.push({ x: cx + (R() - 0.5) * spread, z: cz + (R() - 0.5) * spread, s: 0.8 + R() * 0.9 });
  }
  for (const row of [[-900, -700, 600, -820], [-1200, 300, -500, 800], [700, -900, 1500, -600], [900, 400, 1400, 1100], [-300, 500, 300, 900]]) {
    const [ax, az, bx, bz] = row, n = Math.round(Math.hypot(bx - ax, bz - az) / 8);
    for (let i = 0; i <= n; i++) FAR_PINES[(R() * 5) | 0].items.push({ x: ax + (bx - ax) * i / n + (R() - 0.5) * 2, z: az + (bz - az) * i / n + (R() - 0.5) * 2, s: 0.8 + R() * 0.3 });
  }
  const treeColor = new THREE.Color();
  for (const v of [...FAR_PINES, ...FAR_BROAD]) {
    instanced(v.geo, foliageMat, v.items, (d, it) => { d.position.set(it.x, groundH(it.x, it.z) - 0.3, it.z); d.scale.setScalar(it.s); d.rotation.y = R() * 6.28; },
      () => treeColor.setRGB(0.85 + R() * 0.25, 0.88 + R() * 0.2, 0.85 + R() * 0.2), false);
  }
  for (const v of PINE_VARIANTS) {
    instanced(v.geo, foliageMat, v.items, (d, it) => { d.position.set(it.x, groundH(it.x, it.z) - 0.3, it.z); d.scale.setScalar(it.s); d.rotation.y = R() * 6.28; },
      () => treeColor.setRGB(0.88 + R() * 0.2, 0.9 + R() * 0.2, 0.88 + R() * 0.2), true);
    v.items.forEach((it) => { if (Math.abs(it.x) < 900 && Math.abs(it.z) < 900) colliders.circles.push({ x: it.x, z: it.z, r: 0.9 }); });
  }
  for (const v of [...BROAD_VARIANTS, BUSH]) {
    instanced(v.geo, foliageMat, v.items, (d, it) => { d.position.set(it.x, groundH(it.x, it.z) - 0.2, it.z); d.scale.setScalar(it.s); d.rotation.y = R() * 6.28; },
      () => treeColor.setRGB(0.85 + R() * 0.3, 0.88 + R() * 0.25, 0.85 + R() * 0.2), true);
    v.items.forEach((it) => { if (Math.abs(it.x) < 900 && Math.abs(it.z) < 900) colliders.circles.push({ x: it.x, z: it.z, r: v.r * it.s }); });
  }

  // grass tufts across the central lawns
  (function tufts() {
    const parts = [];
    for (let k = 0; k < 4; k++) {
      const a = k * 0.8, l = 0.12 + k * 0.03, w = 0.035;
      const g = new THREE.BufferGeometry();
      const ca = Math.cos(a), sa = Math.sin(a), tilt = 0.08 * (k % 2 ? 1 : -1);
      g.setAttribute('position', new THREE.Float32BufferAttribute([-w * ca, 0, -w * sa, w * ca, 0, w * sa, tilt * sa, l, -tilt * ca], 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      parts.push({ g, c: C(k % 2 ? '#7ea94a' : '#93b85a') });
    }
    const geo = mergeGeoms(parts);
    const items = [];
    for (let i = 0; i < 90000 && items.length < 26000; i++) {
      const x = -150 + R() * 380, z = -150 + R() * 260;
      if (blocked(x, z, 0.4)) continue;
      items.push({ x, z });
    }
    const m = instanced(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), items,
      (d, it) => { d.position.set(it.x, groundH(it.x, it.z) - 0.02, it.z); d.rotation.y = R() * 6.28; d.scale.setScalar(0.6 + R() * 0.7); },
      () => treeColor.setRGB(0.85 + R() * 0.2, 0.88 + R() * 0.17, 0.8 + R() * 0.2), false);
    m.receiveShadow = true;
    tuftMesh = m;
  })();
  var tuftMesh;

  // ---------- cars, bus ----------
  (function cars() {
    const parts = [
      { g: new THREE.BoxGeometry(1.8, 0.62, 4.4).translate(0, 0.56, 0), c: C('#ffffff') },
      { g: new THREE.BoxGeometry(1.6, 0.6, 2.3).translate(0, 1.16, -0.25), c: C('#ffffff') },
      { g: new THREE.BoxGeometry(1.66, 0.36, 2.36).translate(0, 1.12, -0.25), c: C('#2a3138') },
    ];
    for (const [x, z] of [[-0.8, 1.4], [0.8, 1.4], [-0.8, -1.4], [0.8, -1.4]]) parts.push({ g: new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10).rotateZ(Math.PI / 2).translate(x, 0.33, z), c: C('#1c1c1e') });
    const geo = mergeGeoms(parts);
    const paints = ['#f2f2f0', '#1f2328', '#b23a33', '#8b95a3', '#d8d3c6', '#2f5a8c', '#5b6b4c', '#c9c9c4', '#9a9fa6'];
    const items = [];
    // event parking on the baseball outfield
    for (let row = 0; row < 7; row++) for (let i = 0; i < 17; i++) {
      if (R() < 0.18) continue;
      const [x, z] = P(884 + i * 7.6 + row * 2, 905 + row * 23);
      items.push({ x, z, rot: -8 * RAD + (R() - 0.5) * 0.12 });
    }
    // paved lot
    for (const lxm of [5.5, 17.5, 23, 35]) for (let z = 4; z < pk.hd * 2 - 3; z += 2.6) {
      if (R() < 0.25) continue;
      const [x, zz] = toWorld(pk, lxm - pk.hw, z - pk.hd);
      items.push({ x, z: zz, rot: pk.rot + Math.PI / 2 + (lxm % 2 ? 0 : Math.PI) });
    }
    // a few by the buildings
    for (const [px, py] of [[760, 300], [780, 305], [1240, 600], [1260, 598], [1275, 540], [1530, 880], [1550, 885], [1570, 890], [1590, 892], [1200, 190], [1220, 190]]) { const [x, z] = P(px, py); items.push({ x, z, rot: R() * 6.28 }); }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45 });
    instanced(geo, mat, items, (d, it) => { d.position.set(it.x, groundH(it.x, it.z) + 0.05, it.z); d.rotation.y = it.rot; }, () => C(paints[(R() * paints.length) | 0]), true);
    items.forEach((it) => colliders.circles.push({ x: it.x, z: it.z, r: 1.5 }));
    // yellow school bus on Hpa Rd
    const [bx, bz] = P(1050, 728);
    const bus = new THREE.Group(); bus.position.set(bx, groundH(bx, bz), bz); bus.rotation.y = 1.25; scene.add(bus);
    const yellow = new THREE.MeshStandardMaterial({ color: C('#f2b51c'), roughness: 0.5, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.4, 10), yellow); body.position.y = 1.6; body.castShadow = true; bus.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.7, 8.6), new THREE.MeshStandardMaterial({ color: C('#2a3440'), roughness: 0.2 })); glass.position.set(0, 2.15, -0.4); bus.add(glass);
    box(bx, bz, 1.4, 5.2, 1.25);
  })();

  // ---------- fences and power poles ----------
  (function fences() {
    const fenceLine = (pts, color) => {
      const parts = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 2.5);
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
          const y0 = groundH(x0, z0), y1 = groundH(x1, z1), seg = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(-(z1 - z0), x1 - x0);
          parts.push({ g: new THREE.BoxGeometry(0.12, 1.25, 0.12).translate(x0, y0 + 0.62, z0), c: color });
          for (const hh of [0.55, 1.1]) {
            const r = new THREE.BoxGeometry(seg, 0.1, 0.05); r.rotateZ(Math.atan2(y1 - y0, seg)); r.rotateY(ang); r.translate((x0 + x1) / 2, (y0 + y1) / 2 + hh, (z0 + z1) / 2);
            parts.push({ g: r, c: color });
          }
        }
      }
      const m = new THREE.Mesh(mergeGeoms(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
      m.castShadow = true; m.receiveShadow = true; scene.add(m);
    };
    fenceLine(PP([[600, 1224], [700, 1196], [800, 1172], [880, 1158], [960, 1140], [998, 1112]]), C('#f4f3ef'));
    fenceLine(PP([[262, 842], [330, 938], [410, 1050], [490, 1162], [540, 1236]]), C('#f4f3ef'));
    // power poles and lines along Kawaihae Road (Hwy 250)
    const hwy = roads.find((r) => r.kind === 'hwy');
    const curve = new THREE.CatmullRomCurve3(hwy.pl.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const len = curve.getLength(), n = Math.floor(len / 42);
    const parts = [], tops = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = curve.getPointAt(u), tg = curve.getTangentAt(u);
      const x = p.x - tg.z * 9, z = p.z + tg.x * 9;
      if (Math.hypot(x - 150, z + 30) > 900) continue;
      const y = groundH(x, z);
      parts.push({ g: new THREE.CylinderGeometry(0.13, 0.17, 10, 6).translate(x, y + 5, z), c: C('#6d5a48') });
      const arm = new THREE.BoxGeometry(2.4, 0.14, 0.14); arm.rotateY(Math.atan2(-tg.z, tg.x) + Math.PI / 2); arm.translate(x, y + 9.4, z); parts.push({ g: arm, c: C('#6d5a48') });
      tops.push(new THREE.Vector3(x, y + 9.4, z));
      colliders.circles.push({ x, z, r: 0.3 });
    }
    const pm = new THREE.Mesh(mergeGeoms(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })); pm.castShadow = true; scene.add(pm);
    const wire = [];
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i], b = tops[i + 1];
      if (a.distanceTo(b) > 80) continue;
      for (let k = 0; k < 8; k++) { const t0 = k / 8, t1 = (k + 1) / 8, sag = (t) => -Math.sin(t * Math.PI) * 0.9; wire.push(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0 + sag(t0), a.z + (b.z - a.z) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1 + sag(t1), a.z + (b.z - a.z) * t1); }
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: C('#2a2a2a') })));
  })();

  // ---------- neighbourhood houses and Waimea town ----------
  (function houses() {
    const hwyY = (px) => { const pts = ROADS[0].pts; for (let i = 0; i < pts.length - 1; i++) { if (px >= pts[i][0] && px <= pts[i + 1][0]) { const t = (px - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return pts[i][1] + t * (pts[i + 1][1] - pts[i][1]); } } return 2000; };
    const items = [];
    const tryAdd = (x, z, w, d) => {
      if (blocked(x, z, Math.max(w, d) * 0.7 + 2)) return;
      for (const h of items) if (Math.hypot(h.x - x, h.z - z) < Math.max(w, d) + 6) return;
      items.push({ x, z, w, d, h: 3 + R() * 1.4, rot: R() < 0.6 ? -40 * RAD + (R() - 0.5) * 0.3 : R() * 6.28 });
    };
    for (let i = 0; i < 2500 && items.length < 60; i++) { const px = R() * 560, py = 700 + R() * 600; if (py < hwyY(px) + 45) continue; const [x, z] = P(px, py); tryAdd(x, z, 10 + R() * 6, 8 + R() * 5); }
    for (let i = 0; i < 1500 && items.length < 85; i++) { const px = 600 + R() * 450, py = 1235 + R() * 120; const [x, z] = P(px, py); tryAdd(x, z, 10 + R() * 6, 8 + R() * 5); }
    for (let i = 0; i < 1500 && items.length < 105; i++) { const px = 1100 + R() * 450, py = 1100 + R() * 250; const [x, z] = P(px, py); if (polyDist(x, z, GULCHES[1].pl) < 15) continue; tryAdd(x, z, 12 + R() * 8, 9 + R() * 6); }
    // Waimea town to the east and south-east
    for (let i = 0; i < 8000 && items.length < 460; i++) {
      const x = 450 + R() * 1300, z = -500 + R() * 1500;
      if (x < 650 && z < 250 && z > -280) continue;
      tryAdd(x, z, 9 + R() * 8, 8 + R() * 6);
    }
    const wallsM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), wallsM, items,
      (d, h) => { d.position.set(h.x, groundH(h.x, h.z) - 1, h.z); d.scale.set(h.w, h.h + 1, h.d); d.rotation.y = h.rot; },
      () => C(['#efebe2', '#e4dccb', '#d8cbb4', '#f3f1ea', '#c9d1c4'][(R() * 5) | 0]), true);
    instanced(new THREE.CylinderGeometry(0.01, 0.7072, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.2 }), items,
      (d, h) => { d.position.set(h.x, groundH(h.x, h.z) + h.h, h.z); d.scale.set(h.w + 1.4, Math.min(h.w, h.d) * 0.35, h.d + 1.4); d.rotation.y = h.rot; },
      () => C(['#a5493b', '#7f868e', '#e3e1db', '#4f6a87', '#b4683f', '#6b7c62'][(R() * 6) | 0]), true);
    items.forEach((h) => { if (Math.hypot(h.x - 150, h.z + 30) < 700) box(h.x, h.z, h.w / 2 + 0.3, h.d / 2 + 0.3, h.rot); });
  })();

  // ---------- distant landmarks ----------
  const hazeUniforms = { uSun: { value: sunDir }, uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uHazeAmt: { value: 0.45 } };
  const farMat = new THREE.ShaderMaterial({
    vertexColors: true, fog: false, uniforms: hazeUniforms,
    vertexShader: 'varying vec3 vC; varying vec3 vN; void main(){ vC = color; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uSun, uSunCol, uAmb, uHaze; uniform float uHazeAmt; varying vec3 vC; varying vec3 vN;
      void main(){ float l = max(dot(normalize(vN), uSun), 0.0); vec3 c = vC * (0.35 + uAmb + uSunCol * l * 1.4); c = mix(c, uHaze, uHazeAmt);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
      }`,
  });
  // Mauna Kea, 1/5 scale so it keeps its true angular size from Waimea (bearing ~120°)
  (function maunaKea() {
    // broad shield that steepens toward a summit dotted with cinder cones
    const prof = []; for (let i = 0; i <= 60; i++) { const t = i / 60; prof.push(new THREE.Vector2(5200 * (1 - t), 700 * Math.pow(Math.sin(t * Math.PI / 2), 1.6))); }
    const geo = new THREE.LatheGeometry(prof, 128);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const low = C('#4f5a3c'), mid = C('#5a4a4a'), high = C('#6a5150'), snow = C('#f6f5f6');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i); let y = p.getY(i); const a = Math.atan2(z, x);
      if (y > 520) y += (Math.sin(a * 9) * 14 + Math.sin(a * 23 + 1) * 9 + Math.sin(a * 41) * 5) * smooth(520, 700, y);
      p.setY(i, y);
      c.copy(low).lerp(mid, smooth(120, 420, y)).lerp(high, smooth(420, 600, y));
      if (y > 590 + Math.sin(a * 7) * 22 + Math.sin(a * 19) * 12) c.copy(snow);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, farMat);
    const b = 122 * RAD; m.position.set(Math.sin(b) * 8000, -60, -Math.cos(b) * 8000); scene.add(m);
  })();
  // green cinder cones (puʻu) to the north-west
  (function cones() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    [[330, 1250, 140, 430], [303, 1850, 115, 380], [350, 2250, 170, 500], [287, 2700, 120, 420], [15, 2400, 90, 380]].forEach(([brg, dist, H, Rr], k) => {
      const prof = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24, r = Rr * (1 - t); let h = H * Math.pow(1 - Math.pow(1 - t, 1.6), 1.15); if (t > 0.9) h -= H * 0.05 * (t - 0.9) / 0.1; prof.push(new THREE.Vector2(r, h)); }
      const geo = new THREE.LatheGeometry(prof, 64);
      const p = geo.attributes.position, col = new Float32Array(p.count * 3), cc = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), y = p.getY(i);
        const s = 1 + 0.06 * Math.sin(a * 3 + k) + 0.03 * Math.sin(a * 7);
        p.setX(i, x * s); p.setZ(i, z * s);
        cc.copy(C('#6a9a3e')).lerp(C('#8ea24f'), 0.5 + 0.5 * Math.sin(a * 5 + y * 0.03)).lerp(C('#4f7a33'), smooth(0.3, 1, Math.sin(a * 2 + k)) * 0.4);
        col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      const b = brg * RAD, x = Math.sin(b) * dist, z = -Math.cos(b) * dist;
      m.position.set(x, baseH(x, z) - 10, z); m.receiveShadow = false; scene.add(m);
    });
  })();

  // ---------- sky ----------
  const skyUniforms = {
    uSun: { value: sunDir }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
    uCloud: { value: new THREE.Color() }, uTime: { value: 0 }, uCover: { value: 0.45 }, uRainbow: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(15000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir;
      uniform vec3 uSun, uZenith, uHorizon, uSunCol, uCloud; uniform float uTime, uCover, uRainbow;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
      vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.6, y), 0.55));
        float sd = max(dot(d, uSun), 0.0);
        col += uSunCol * (pow(sd, 5.0) * 0.16 + pow(sd, 40.0) * 0.35);
        col += uSunCol * smoothstep(0.99955, 0.99985, sd) * 14.0;
        float ang = degrees(acos(clamp(dot(d, -uSun), -1.0, 1.0)));
        float rb = (ang - 40.4) / 2.3;
        float above = smoothstep(0.0, 0.05, y);
        if (rb > 0.0 && rb < 1.0) col += hue(0.78 * (1.0 - rb)) * sin(rb * 3.14159) * uRainbow * 0.2 * above;
        float rb2 = (ang - 50.5) / 3.2;
        if (rb2 > 0.0 && rb2 < 1.0) col += hue(0.78 * rb2) * sin(rb2 * 3.14159) * uRainbow * 0.06 * above;
        if (ang < 40.4) col += vec3(0.02) * uRainbow * above;
        if (y > 0.0) {
          vec2 uv = d.xz / (y + 0.1) * 1.5 + vec2(uTime * 0.005, uTime * 0.0025);
          float n = fbm(uv);
          float cov = smoothstep(1.0 - uCover, 1.0 - uCover + 0.25, n);
          float lit = fbm(uv * 1.9 + 4.0);
          vec3 cc = uCloud * mix(0.6, 1.12, lit) + uSunCol * pow(sd, 3.0) * 0.45;
          col = mix(col, cc, cov * smoothstep(0.0, 0.1, y) * 0.93);
        } else {
          col = mix(uHorizon, uHorizon * 0.92, smoothstep(0.0, -0.2, y));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  }));
  sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);

  // soft cloud band hanging at Mauna Kea's waist
  const cloudTex = canvasTex(256, 128, (g, W, H) => {
    const r = rng(77);
    for (let i = 0; i < 40; i++) { const x = W * 0.15 + r() * W * 0.7, y = H * 0.35 + r() * H * 0.35, rad = 20 + r() * 35; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  });
  const bandSprites = [];
  for (let i = 0; i < 16; i++) {
    const b = (88 + i * 4.5 + (R() - 0.5) * 3) * RAD, dist = 5200 + R() * 1200;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, fog: false, depthWrite: false, opacity: 0.85 }));
    s.position.set(Math.sin(b) * dist, 170 + R() * 70, -Math.cos(b) * dist); s.scale.set(1500 + R() * 900, 260 + R() * 120, 1);
    scene.add(s); bandSprites.push(s);
  }

  // ---------- time of day ----------
  const TIMES = {
    morning: { label: 'Morning', az: 98, el: 17, sun: '#ffe3c4', sunI: 2.5, sky: '#c4daf2', ground: '#4e5a33', hemiI: 0.8, zenith: '#2f68c6', horizon: '#c9dcee', fog: '#c4d6e6', haze: '#b6cbe0', hazeAmt: 0.32, cloud: '#ffffff', cover: 0.44, rainbow: 0, exposure: 0.95 },
    afternoon: { label: 'Afternoon', az: 225, el: 42, sun: '#fff4e4', sunI: 3.0, sky: '#c6dcf4', ground: '#56683a', hemiI: 0.9, zenith: '#2a63c9', horizon: '#bfd7ee', fog: '#c2d6e8', haze: '#b2c8de', hazeAmt: 0.3, cloud: '#ffffff', cover: 0.5, rainbow: 0.6, exposure: 0.9 },
    golden: { label: 'Golden hour', az: 252, el: 9, sun: '#ffc48c', sunI: 2.8, sky: '#ccd5ea', ground: '#5c5a36', hemiI: 0.72, zenith: '#3b67b6', horizon: '#f2d4b8', fog: '#e4d3c2', haze: '#d8c6bc', hazeAmt: 0.3, cloud: '#ffe8d2', cover: 0.42, rainbow: 0.75, exposure: 1.0 },
    sunset: { label: 'Sunset', az: 258, el: 1.5, sun: '#ff9466', sunI: 1.5, sky: '#b9a6c6', ground: '#4b4232', hemiI: 0.62, zenith: '#3a4a8c', horizon: '#ffb194', fog: '#e4b2a6', haze: '#d6a6a6', hazeAmt: 0.28, cloud: '#ffc0ae', cover: 0.4, rainbow: 0, exposure: 1.1 },
  };
  let timeKey = 'golden';
  function setTime(key) {
    const T = TIMES[key] || TIMES.golden; timeKey = TIMES[key] ? key : 'golden';
    const az = T.az * RAD, el = T.el * RAD;
    sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
    const le = Math.max(el, 7 * RAD);
    lightDir.set(Math.cos(le) * Math.sin(az), Math.sin(le), -Math.cos(le) * Math.cos(az)).normalize();
    sun.color.copy(C(T.sun)); sun.intensity = T.sunI;
    hemi.color.copy(C(T.sky)); hemi.groundColor.copy(C(T.ground)); hemi.intensity = T.hemiI;
    scene.fog.color.copy(C(T.fog));
    renderer.toneMappingExposure = T.exposure;
    skyUniforms.uZenith.value.copy(C(T.zenith)); skyUniforms.uHorizon.value.copy(C(T.horizon));
    skyUniforms.uSunCol.value.copy(C(T.sun)).multiplyScalar(0.9 + T.sunI * 0.15);
    skyUniforms.uCloud.value.copy(C(T.cloud)); skyUniforms.uCover.value = T.cover; skyUniforms.uRainbow.value = T.rainbow;
    hazeUniforms.uSunCol.value.copy(C(T.sun)).multiplyScalar(T.sunI * 0.45);
    hazeUniforms.uAmb.value.copy(C(T.sky)).multiplyScalar(T.hemiI * 0.55);
    hazeUniforms.uHaze.value.copy(C(T.haze)); hazeUniforms.uHazeAmt.value = T.hazeAmt;
    const bandCol = C(T.cloud).lerp(C(T.horizon), 0.25);
    bandSprites.forEach((s) => s.material.color.copy(bandCol));
    return T;
  }
  setTime(timeKey);

  // ---------- quality ----------
  let quality = 2;
  function setQuality(q) {
    quality = Math.max(0, Math.min(2, q));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 2 ? 1.5 : 1));
    const size = quality === 0 ? 1024 : 2048 + (quality === 2 ? 2048 : 0);
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    if (tuftMesh) tuftMesh.visible = quality > 0;
    return quality;
  }

  // ---------- per frame ----------
  function update(dt, t, focus) {
    const gust = 0.5 + 0.35 * Math.sin(t * 0.37) + 0.15 * Math.sin(t * 1.1 + 2);
    for (const f of flags) {
      const p = f.geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = f.base[i * 3], y = f.base[i * 3 + 1];
        p.setZ(i, Math.sin(x * 1.8 - t * (4 + gust * 2) + f.ph + y * 0.6) * 0.22 * (x / 3.4) * (0.6 + gust));
      }
      p.needsUpdate = true; f.geo.computeVertexNormals();
    }
    const snap = 170 / sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    sun.target.position.set(fx, focus.y, fz);
    sun.position.set(fx + lightDir.x * 400, focus.y + lightDir.y * 400, fz + lightDir.z * 400);
    sky.position.copy(camera.position);
    skyUniforms.uTime.value = t;
    return gust;
  }

  // spawn on the north-east straight in front of the bleachers, facing down the track
  const [sx, sz] = toWorld(TRACK, -20, -(R_IN + 3.6));
  const fwd = [Math.cos(TRACK.rot), -Math.sin(TRACK.rot)];
  const spawn = { x: sx, z: sz, ry: Math.atan2(fwd[0], fwd[1]), camYaw: Math.atan2(-fwd[0], -fwd[1]) };
  const bounds = { minX: -260, maxX: 640, minZ: -340, maxZ: 260 };

  const field = { x: TRACK.x, z: TRACK.z, rot: TRACK.rot, halfL: FIELD_L / 2, halfW: FIELD_W / 2, rIn: R_IN, TL, y: groundH(0, 0) };
  return { scene, renderer, camera, groundH, colliders, flags, C, spawn, bounds, update, setTime, setQuality, times: TIMES, get timeKey() { return timeKey; },
    seats, carts, placeCart, cartSeat, field, toLocal, toWorld };
}

window.HPA = { createWorld };
})();

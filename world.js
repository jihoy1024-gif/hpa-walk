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
  const nightLights = [], nightGlows = []; // { light, I } and { mat, I }: switched on by the Night setting
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
  // names follow the HPA Upper Campus building key; styles follow the HABS records, the school's photos and the drone footage
  const RAW_BUILDINGS = [
    // west classroom row (Ossipoff): shed roofs high to the north light, lanai on the leeward side, lava-rock ends
    { at: [340, 302], w: 105, d: 44, phi: -35, h: 3.3, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.22, solar: 2, label: 'Gerry Clark Art Center' },
    { at: [440, 255], w: 60, d: 40, phi: 0, h: 3.3, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.22, solar: 2, label: 'Castle Lecture Hall' },
    { at: [537, 265], w: 105, d: 40, phi: 14, h: 3.3, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.22, solar: 2, lanai: 1, label: 'English Building' },
    { at: [525, 336], w: 125, d: 54, phi: 18, h: 3.5, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.22, solar: 2, lanai: 1, label: 'Technology & Learning Center' },
    { at: [648, 350], w: 86, d: 38, phi: 24, h: 3.1, wall: 'wood', ends: 'stone', roof: 'shed', lanai: 1, cls: 1, label: 'Social Studies Building' },
    { at: [651, 437], w: 90, d: 42, phi: 22, h: 3.2, wall: 'wood', ends: 'stone', roof: 'shed', lanai: 1, cls: 1, name: 'ml', label: 'Modern Language Building' },
    { at: [742, 412], w: 70, d: 38, phi: 30, h: 3.1, wall: 'wood', ends: 'stone', roof: 'shed', lanai: 1, cls: 1, lockers: 1 },
    { at: [776, 487], w: 115, d: 40, phi: 46, h: 3.1, wall: 'wood', ends: 'stone', roof: 'shed', lanai: 1, cls: 1, lockers: 1, label: 'Atherton Science Building' },
    { at: [884, 437], w: 96, d: 54, phi: 20, h: 3.3, wall: 'wood', ends: 'stone', roof: 'gable', rise: 0.2, eave: 2.2, lanai: 1, name: 'wishard', label: 'Wishard Administration' },
    { at: [941, 486], w: 52, d: 22, phi: 20, h: 3.0, wall: 'open', roof: 'shed', rise: 0.12, eave: 0.6, open: 1 }, // Becky Carter Student Pavilion
    { at: [915, 572], w: 96, d: 32, phi: 22, h: 3.2, wall: 'wood', ends: 'stone', roof: 'shed', rise: 0.2, lanai: 1, cls: 1, lockers: 1, label: 'Math Building' },
    // Dyer Memorial Library (HABS HI-601-G): T-shaped, a north-south main block with an east wing, multi-gable roof
    { at: [1005.5, 470.5], w: 81, d: 51, phi: 90, h: 3.6, wall: 'wood', ends: 'stone', roof: 'gable', rise: 0.24, eave: 0.3, eaveEnd: 1.4, logEnds: 1, name: 'library', label: 'Dyer Memorial Library' },
    { at: [1039.5, 473.5], w: 35, d: 35, phi: 0, h: 3.6, wall: 'wood', ends: 'stone', roof: 'gable', rise: 0.24, eave: 0.3, eaveEnd: 1.4, logEnds: 1 },
    // Upper Taylor Commons (two storeys on the north side of Kennedy Square), a flat-roofed link and the east wing;
    // the dining hall and the Ko Kākou Student Union are walk-in buildings of their own further down
    { at: [1124, 453], w: 70, d: 36, phi: 0, h: 6.2, wall: 'wood', ends: 'stone', roof: 'gable', rise: 0.16 },
    { at: [1195, 478], w: 72, d: 26, phi: 0, h: 3.6, wall: 'wood', ends: 'stone', roof: 'flat', roofColor: '#a9a9a4' },
    { at: [1266, 501], w: 68, d: 48, phi: 3, h: 6.0, wall: 'wood', ends: 'stone', roof: 'hip', rise: 0.24 },
    // north edge
    { at: [505, 110], w: 78, d: 33, phi: 38, h: 4.6, wall: 'darkwood', ends: 'darkwood', roof: 'gable', rise: 0.16, eave: 2.0, roofColor: '#b9b8b2', name: 'chapel', label: 'Davies Memorial Chapel' },
    { at: [916, 186], w: 76, d: 40, phi: -15, h: 3.3, wall: 'wood', ends: 'stone', roof: 'shed', lanai: 1, label: 'Atherton House' },
    // residence halls: two storeys of dark vertical boards under low gables
    { at: [1215, 150], w: 210, d: 34, phi: 2, h: 6.2, wall: 'wood', ends: 'stone', roof: 'gable', rise: 0.14, label: 'Perry-Fiske Hall', dorm: 1 },
    { at: [1160, 112], w: 44, d: 34, phi: 2, h: 6.2, wall: 'wood', ends: 'stone', roof: 'gable', rise: 0.14 },
    { at: [1282, 112], w: 44, d: 34, phi: 2, h: 6.2, wall: 'wood', ends: 'stone', roof: 'gable', rise: 0.14 },
    { at: [1415, 262], w: 200, d: 34, phi: 43, h: 6.2, wall: 'wood', ends: 'stone', roof: 'gable', rise: 0.14, label: 'Robertson Hall', dorm: 1, name: 'robertson' },
    { at: [1412, 436], w: 190, d: 40, phi: 37, h: 6.2, wall: 'wood', ends: 'stone', roof: 'gable', rise: 0.14, label: 'Carter Hall', dorm: 1, balc: 1 },
    // Saalfeld Energy Lab: steep shed roof on log columns over a concrete terrace
    { at: [1706, 136], w: 110, d: 82, phi: 0, h: 7.4, wall: 'wood', ends: 'stone', roof: 'shed', rise: -0.1, lanai: 1, eave: 4.6, logs: 1, deck: 'concrete', label: 'Saalfeld Energy Lab' }, // roof soars up over the terrace
    // athletics: Nakamaru Fitness, Castle Gymnasium (arched glulam roof with a monitor, lava-rock locker wing)
    { at: [1225, 707], w: 80, d: 26, phi: 0, h: 3.4, wall: 'wood', ends: 'stone', roof: 'shed', lanai: 1, label: 'Nakamaru Fitness Center' },
    { at: [1330, 795], w: 84, d: 73, phi: 0, h: 6.1, wall: 'gym', roof: 'arch', rise: 0.12, roofColor: '#c4c4bf', name: 'castle', walk: 1, label: 'Castle Gymnasium' },
    { at: [1219, 800], w: 138, d: 34, phi: 0, h: 3.6, wall: 'stone', ends: 'stone', roof: 'flat', roofColor: '#9d9d98' },
    { at: [1636, 668], w: 150, d: 116, phi: 30, h: 10, wall: 'gym', roof: 'gable', rise: 0.3, roofColor: '#e9e9e6', name: 'gpac', label: 'Gates Performing Arts Center' },
    { at: [1658, 780], w: 56, d: 46, phi: 25, h: 3.6, wall: 'wood', ends: 'stone', roof: 'hip', label: 'Davenport Music Center' },
    { at: [1438, 902], w: 40, d: 28, phi: 0, h: 4.0, wall: 'white', roof: 'gable', rise: 0.25, roofColor: '#9c9fa3', label: 'Engineering Garage' },
    // little sheds by the track and baseball field
    { at: [742, 842], w: 30, d: 16, phi: 56, h: 2.8, wall: 'white', roof: 'gable', rise: 0.3 },
    { at: [727, 905], w: 18, d: 30, phi: 56, h: 2.6, wall: 'white', roof: 'gable', rise: 0.3 },
    { at: [658, 665], w: 16, d: 11, phi: 56, h: 2.5, wall: 'white', roof: 'gable', rise: 0.3 },
    { at: [593, 1028], w: 26, d: 18, phi: 56, h: 2.8, wall: 'white', roof: 'gable', rise: 0.3 },
    { at: [800, 850], w: 26, d: 12, phi: 15, h: 2.6, wall: 'white', roof: 'gable', rise: 0.3 },
    // faculty cottages
    ...[[1630, 342], [1697, 353], [1765, 366], [1572, 426], [1755, 426], [1676, 462], [1752, 476], [1572, 490]].map((at, i) => (
      { at, w: 36, d: 24, phi: 3, h: 3.0, wall: 'wood', roof: 'hip', rise: 0.3, roofColor: i % 2 ? '#6d7f6c' : '#8c6a5c', lanai: i % 2, label: i === 3 ? 'Faculty Cottages' : undefined })),
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
    { kind: 'path', w: 2.6, pts: [[690, 520], [780, 548], [860, 566], [960, 590], [1040, 597], [1100, 594], [1160, 602], [1230, 592], [1310, 575]] },
    { kind: 'path', w: 2.2, pts: [[1020, 533], [1004, 562], [960, 590]] },
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
  const RAW_TREES = [[880, 520], [905, 505], [700, 470], [610, 395], [945, 532], [1320, 420], [1010, 610],
    [430, 300], [600, 300], [760, 360], [1240, 720], [1150, 760], [990, 1150], [1110, 1110], [300, 330], [380, 400], [1480, 700], [1500, 880], [1560, 820]];

  // ---------- terrain ----------
  const GULCHES = [
    { pl: poly(PP([[60, 30], [300, 90], [520, 130], [800, 170], [1050, 240], [1300, 330], [1520, 340], [1900, 300]])), depth: 6, w: 16 },
    { pl: poly(PP([[960, 1320], [1120, 1180], [1300, 1062], [1480, 984], [1650, 924], [1950, 860]])), depth: 4.5, w: 12 },
  ];
  function naturalH(x, z) {
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

  // Ossipoff graded the campus in tiers (HABS HI-601): the track and the upper soccer field at the bottom, a long lawn
  // slope up to the classroom terrace, and a storey above that the middle plateau (Wishard, Dyer Library, Kennedy
  // Square, Taylor Commons). The Ko Kākou Student Union bridges the step: its store opens onto the lawn, the union onto the square.
  const UF0 = (() => { const [x, z] = P(UPPER_FIELD.at[0], UPPER_FIELD.at[1]); return { x, z, rot: -UPPER_FIELD.phi * RAD }; })();
  const TERRACE_H = 3.0, STOREY = 3.4;
  function terraceH(x, z) {
    const [lx, lz] = toLocal(UF0, x, z);
    return naturalH(x, z) + TERRACE_H * smooth(-UPPER_FIELD.d / 2 - 2, -UPPER_FIELD.d / 2 - 17 - 26 * smooth(-110, -200, lx), lz) * smooth(185, 160, lx);
  }
  // plateau outline in world metres: 1 = falls away as a grassy bank, 0 = stops at a retaining wall or a building
  const PLATEAU = [[112, -150, 1], [112, -108, 1], [150, -100, 1], [164, -91.5, 0], [186.4, -91.5, 0], [186.4, -67.4, 0], [209.6, -67.4, 0],
    [209.6, -80, 0], [215, -80, 0], [215, -73.2, 0], [250.2, -73.2, 1], [262, -80, 1], [290, -100, 1], [290, -150, 1]];
  const Y_LOW = terraceH(198, -64.5), PLATEAU_Y = Y_LOW + STOREY;
  function plateauW(x, z) {
    if (x < 90 || x > 312 || z < -172 || z > -50) return 0;
    let inside = false, best = 1e9, soft = 1;
    for (let i = 0, j = PLATEAU.length - 1; i < PLATEAU.length; j = i++) {
      const [ax, az] = PLATEAU[j], [bx, bz] = PLATEAU[i];
      if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
      const ex = bx - ax, ez = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
      const d = Math.hypot(x - ax - ex * t, z - az - ez * t);
      if (d < best) { best = d; soft = PLATEAU[j][2]; }
    }
    return inside ? 1 : 1 - smooth(0, soft ? 16 : 0.6, best);
  }
  function baseH(x, z) { const h = terraceH(x, z), w = plateauW(x, z); return w > 0 ? h + (PLATEAU_Y - h) * w : h; }
  const pads = [];
  function addPad(x, z, hw, hd, rot, blend, h) {
    pads.push({ x, z, hw, hd, rot, blend, h: h === undefined ? baseH(x, z) : h, rad: Math.hypot(hw, hd) + blend });
  }

  // floors, stairs and ramps the terrain alone can't make: inside the rectangle the height runs from h0 at local
  // z = -hd to h1 at +hd; the ground mesh drops out of sight under them
  const ramps = [], sinks = [], noVeg = [], rooms = [], boards = [], fans = [];
  const inRect = (r, x, z, pad) => { const [lx, lz] = toLocal(r, x, z), p = pad || 0; return Math.abs(lx) < r.hw + p && Math.abs(lz) < r.hd + p; };
  function addRamp(x, z, rot, hw, hd, h0, h1) {
    ramps.push({ x, z, rot, hw, hd, h0, h1: h1 === undefined ? h0 : h1, rad: Math.hypot(hw, hd) + 0.5 });
    sinks.push({ x, z, rot, hw: hw + 0.3, hd: hd + 0.3 });
  }
  // the track sits a little lower; four concrete seating tiers step up the bank on the north-east straight
  const TRACK_Y = baseH(0, 0) - 0.7;
  const TIER_Z = -(R_OUT + 1.6), TIER_D0 = 1.4, TIER_W = 1.6, TIER_H = 0.45, TIERS = 4, TIER_L = 22;
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
    const [tx, tz] = toLocal(TRACK, x, z);
    if (tz < TIER_Z && tz > TIER_Z - 20) {
      const d = Math.hypot(Math.max(Math.abs(tx) - TIER_L, 0), tz - TIER_Z), top = TIER_D0 + TIERS * TIER_W;
      if (d < top + 4) {
        const ht = TRACK_Y + TIER_H * Math.min(TIERS, Math.max(0, Math.floor((d - TIER_D0) / TIER_W) + 1));
        h = d < top ? ht : ht + (h - ht) * smooth(top, top + 4, d);
      }
    }
    for (const r of ramps) {
      const dx = x - r.x, dz = z - r.z;
      if (dx > r.rad || dx < -r.rad || dz > r.rad || dz < -r.rad) continue;
      const [lx, lz] = toLocal(r, x, z);
      if (Math.abs(lx) <= r.hw && Math.abs(lz) <= r.hd) h = r.h0 + (r.h1 - r.h0) * (lz + r.hd) / (2 * r.hd);
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

  addPad(0, 0, TL + R_OUT + 6, R_OUT + 3, TRACK.rot, 7, TRACK_Y);
  addPad(uf.x, uf.z, uf.hw + 4, uf.hd + 4, uf.rot, 16);
  { const [cx, cz] = toWorld(bb, 45, 0); addPad(cx, cz, 55, 50, bb.rot, 14); }
  addPad(pk.x, pk.z, pk.hw + 2, pk.hd + 2, pk.rot, 8);
  for (const b of BUILDINGS) addPad(b.x, b.z, b.w / 2 + 2.5 + (b.name === 'robertson' ? 15 : 0), b.d / 2 + 2.5, b.rot, 7);
  const POOL = (() => { const [x, z] = P(1352, 673); return { x, z, rot: -33 * RAD, WL: 25, WW: 18, DL: 38, DW: 31, depth: 1.9 }; })();
  addPad(POOL.x, POOL.z, 21, 17, POOL.rot, 8);
  const TENNIS = (() => { const [x, z] = P(1258, 915); return { x, z, rot: 0, hw: 36.2, hd: 22.2, eave: 7, ridge: 14, ridgeZ: 6 }; })();
  addPad(TENNIS.x - 3, TENNIS.z, TENNIS.hw + 9, TENNIS.hd + 4, TENNIS.rot, 8);
  const SOLAR_FIELD = (() => { const [x, z] = P(1890, 175); return { x, z, rot: 0 }; })();
  const FARM = (() => { const [x, z] = P(2050, 545); return { x, z, rot: 0.35 }; })();
  const KSQ = { x: 205.5, z: -101.3, rot: 0, hw: 8.75, hd: 8.1 }; // Kennedy Square, on the plateau
  addPad(FARM.x, FARM.z, 22, 14, FARM.rot, 10);

  const roads = ROADS.map((r) => Object.assign({}, r, { pl: poly(PP(r.pts)) }));
  const treeLines = TREE_LINES.map((t) => Object.assign({}, t, { pl: poly(PP(t.pts)) }));

  const colliders = { circles: [], boxes: [] };
  const box = (x, z, hw, hd, rot) => colliders.boxes.push({ x, z, hw, hd, rot });

  // ---------- the middle plateau's edges: union, dining hall, library approach (layout only; meshes come later) ----------
  const UNION = { x: 201.8, z: -78.0, rot: 0, hw: 7.8, hd: 10.6 };   // main block; its west wing runs on to x = 186.4
  const DINING = { x: 232.5, z: -87.5, rot: 0, hw: 17.2, hd: 14.3 };
  const LIB_DECK = { x: 174.3, z: -93.1, rot: 0, hw: 12.9, hd: 1.6 }; // south deck of Dyer Library on its lava retaining wall
  const Y_DECK = PLATEAU_Y + 0.6;
  const railC = (x0, z0, x1, z1) => box((x0 + x1) / 2, (z0 + z1) / 2, Math.max(Math.abs(x1 - x0) / 2, 0.12), Math.max(Math.abs(z1 - z0) / 2, 0.12), 0);
  // union: store porch on the lawn, exterior stair on the east side down from the square
  addRamp(197.9, -65.7, 0, 11.5, 1.7, Y_LOW + 0.12);
  addRamp(214.1, -74.25, 0, 1.1, 5.75, PLATEAU_Y, Y_LOW);
  railC(212.9, -80, 212.9, -70.6); railC(215.3, -80, 215.3, -68.5);
  // a paved nook at store level between the store's east wall and the stair, with two grey picnic tables
  const NOOK = { x: 211.2, z: -73.7, hw: 1.6, hd: 6.3, tables: [[211.2, -76.0], [211.2, -71.6]] };
  addRamp(NOOK.x, NOOK.z, 0, NOOK.hw, NOOK.hd, Y_LOW + 0.06);
  railC(209.6, -80.1, 212.9, -80.1);
  noVeg.push({ x: 212.4, z: -74, rot: 0, hw: 3.2, hd: 7 });
  // dining hall: deck over the lawn on its downhill side, with a stair down at the east end
  addRamp(232.5, -71.7, 0, 17.2, 1.5, PLATEAU_Y);
  const DSTAIR = (() => { const g0 = groundH(243.75, -63.5), L = Math.max(3, (PLATEAU_Y - g0) / 0.6); return { x: 243.75, z0: -70.2, L, g0 }; })();
  addRamp(DSTAIR.x, DSTAIR.z0 + DSTAIR.L / 2, 0, 1.25, DSTAIR.L / 2, PLATEAU_Y, DSTAIR.g0);
  railC(215.3, -70.2, 242.5, -70.2); railC(245.0, -70.2, 249.7, -70.2); railC(215.3, -73.2, 215.3, -70.2); railC(249.7, -73.2, 249.7, -70.2);
  railC(242.4, -70.2, 242.4, -70.2 + DSTAIR.L); railC(245.1, -70.2, 245.1, -70.2 + DSTAIR.L);
  // library: the deck, a switchback ramp with lava cheekwalls along the retaining wall, and a concrete stair (HABS)
  const ZZ = (() => { const yg = groundH(185, -86.5); return { yg, ym: (yg + Y_DECK) / 2 }; })();
  addRamp(LIB_DECK.x, LIB_DECK.z, 0, LIB_DECK.hw, LIB_DECK.hd, Y_DECK);
  addRamp(175.8, -88.2, Math.PI / 2, 0.8, 7.8, ZZ.ym, ZZ.yg);          // lower run, climbing west
  addRamp(184.95, -88.2, Math.PI / 2, 0.8, 1.35, ZZ.yg);               // its entry
  addRamp(166.7, -89.45, Math.PI / 2, 2.0, 1.3, ZZ.ym);                // landing
  addRamp(175.8, -90.5, Math.PI / 2, 0.95, 7.8, ZZ.ym, Y_DECK);        // upper run, climbing east to the deck
  addRamp(184.95, -90.55, Math.PI / 2, 1.0, 1.35, Y_DECK);             // top landing
  const LSTAIR = (() => { const g0 = groundH(163, -84), L = Math.max(4, (Y_DECK - g0) / 0.62); return { x: 163.0, L, g0 }; })();
  addRamp(LSTAIR.x, -91.5 + LSTAIR.L / 2, 0, 1.4, LSTAIR.L / 2, Y_DECK, LSTAIR.g0);
  railC(168.0, -89.3, 186.3, -89.3); railC(165.2, -87.2, 183.6, -87.2); railC(165.2, -91.5, 165.2, -87.0);
  railC(161.5, -91.5, 161.5, -91.5 + LSTAIR.L); railC(164.5, -91.5, 164.5, -91.5 + LSTAIR.L);
  railC(164.4, -91.45, 183.6, -91.45); railC(161.4, -94.7, 161.4, -91.5);
  // no trees or tufts on floors, decks and stairs
  noVeg.push({ x: 198, z: -76, rot: 0, hw: 12.5, hd: 13.5 }, { x: 232.5, z: -82, rot: 0, hw: 18, hd: 21 }, { x: 174, z: -88, rot: 0, hw: 14, hd: 8 },
    { x: 200.5, z: -99, rot: 0, hw: 14.5, hd: 11.5 });
  sinks.push({ x: 198, z: -78, rot: 0, hw: 11.6, hd: 10.6 }, { x: 232.5, z: -87.5, rot: 0, hw: 17.2, hd: 14.3 });
  rooms.push({ x: UNION.x, z: UNION.z, rot: 0, hw: UNION.hw - 0.3, hd: UNION.hd - 0.3, y0: PLATEAU_Y, top: 3.3 },
    { x: DINING.x, z: DINING.z, rot: 0, hw: DINING.hw - 0.3, hd: DINING.hd - 0.3, y0: PLATEAU_Y, top: 3.5 });

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
  const grassTex = canvasTex(1024, 1024, (g, W, H) => {
    g.fillStyle = '#d6e2c0'; g.fillRect(0, 0, W, H);
    const r = rng(11);
    // soft clumps of lighter and darker growth
    for (let i = 0; i < 260; i++) {
      const x = r() * W, y = r() * H, rad = 18 + r() * 60, gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, r() < 0.55 ? 'rgba(80,110,45,0.16)' : 'rgba(255,255,230,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // blades, short and long, in two greens with sunlit tips
    for (let i = 0; i < 26000; i++) {
      const x = r() * W, y = r() * H, l = 4 + r() * 11, a = -Math.PI / 2 + (r() - 0.5) * 1.1, v = r();
      g.strokeStyle = v < 0.42 ? 'rgba(62,92,34,0.32)' : v < 0.8 ? 'rgba(246,255,218,0.30)' : v < 0.93 ? 'rgba(120,150,60,0.30)' : 'rgba(160,140,80,0.26)';
      g.lineWidth = 0.8 + r() * 1.1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 90; i++) { g.fillStyle = r() < 0.7 ? 'rgba(255,255,240,0.75)' : 'rgba(250,220,90,0.75)'; g.beginPath(); g.arc(r() * W, r() * H, 1.4 + r() * 1.2, 0, 7); g.fill(); }
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
      let gy = groundH(x, z);
      { const [plx, plz] = toLocal(POOL, x, z); if (Math.abs(plx) < POOL.WL / 2 + 1.2 && Math.abs(plz) < POOL.WW / 2 + 1.2) gy -= POOL.depth + 0.4; } // the pool basin
      for (const sk of sinks) if (inRect(sk, x, z)) { gy -= 1.6; break; }
      pos.setY(i, gy);
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
    // start/finish gantry over the line on the home straight (the race starts here)
    {
      const bannerTex = canvasTex(512, 64, (c, W2, H2) => { c.fillStyle = '#b52a2f'; c.fillRect(0, 0, W2, H2); c.fillStyle = '#f4efe2'; c.font = 'bold 34px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('HPA  ·  START / FINISH', W2 / 2, H2 / 2 + 2); });
      const pole = new THREE.MeshStandardMaterial({ color: C('#e9e7e1'), roughness: 0.5, metalness: 0.3 });
      for (const z of [-R_IN + 0.25, -R_OUT - 0.25]) { const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.4, 10), pole); pm.position.set(TL, 1.7, z); pm.castShadow = true; trackG.add(pm); const [wx, wz] = toWorld(TRACK, TL, z); colliders.circles.push({ x: wx, z: wz, r: 0.15 }); }
      const ban = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, R_OUT - R_IN + 0.5), [new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.7 }), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.7 }), pole, pole, pole, pole]);
      ban.position.set(TL, 3.0, -(R_IN + R_OUT) / 2); ban.castShadow = true; trackG.add(ban);
    }
    // concrete seating tiers stepping up the grass bank on the north-east straight, curling round at both ends
    {
      const parts = [], tan = C('#c9bc9e'), cap = C('#d8ccb0');
      for (let k = 1; k <= TIERS; k++) {
        const d = TIER_D0 + (k - 1) * TIER_W, y0 = (k - 1) * TIER_H - 0.15, hgt = TIER_H + 0.2, pts = [];
        for (let a = 0; a <= 10; a++) { const t = Math.PI / 2 * a / 10; pts.push([-TIER_L - d * Math.cos(t), TIER_Z - d * Math.sin(t)]); }
        for (let x = -TIER_L + 2; x < TIER_L; x += 2) pts.push([x, TIER_Z - d]);
        for (let a = 0; a <= 10; a++) { const t = Math.PI / 2 * (1 - a / 10); pts.push([TIER_L + d * Math.cos(t), TIER_Z - d * Math.sin(t)]); }
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), nx = dz / L, nz = -dx / L, ang = -Math.atan2(dz, dx);
          parts.push({ g: new THREE.BoxGeometry(L + 0.04, hgt, 0.42).rotateY(ang).translate((ax + bx) / 2 + nx * 0.2, y0 + hgt / 2, (az + bz) / 2 + nz * 0.2), c: tan });
          parts.push({ g: new THREE.BoxGeometry(L + 0.04, 0.05, 0.46).rotateY(ang).translate((ax + bx) / 2 + nx * 0.2, y0 + hgt + 0.02, (az + bz) / 2 + nz * 0.2), c: cap });
        }
      }
      const tm = new THREE.Mesh(mergeGeoms(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); tm.castShadow = true; tm.receiveShadow = true; tm.position.y = TRACK_Y - groundH(0, 0); trackG.add(tm);
    }
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
    const H0 = kind === 'gym' ? 512 : kind === 'glass' || kind === 'jal' ? 128 : 256;
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
        g.fillStyle = '#d9d7d0'; g.fillRect(0, 0, W, H);
        for (let x = 0; x < W; x += 16) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, 0, 3, H); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 3, 0, 2, H); }
        g.fillStyle = '#4a4d52'; g.fillRect(0, H * 0.07, W, H * 0.15);
        for (let x = 0; x < W; x += 64) { const gr = g.createLinearGradient(0, H * 0.08, 0, H * 0.21); gr.addColorStop(0, '#34485c'); gr.addColorStop(1, '#6a8094'); g.fillStyle = gr; g.fillRect(x + 6, H * 0.08, 52, H * 0.13); }
        g.fillStyle = '#9a9890'; g.fillRect(0, H * 0.9, W, H * 0.1);
        g.fillStyle = '#6d5a48'; g.fillRect(W * 0.4, H * 0.72, W * 0.2, H * 0.28);
      } else if (kind === 'ribbon') {
        // uphill side of the 1963 classrooms: a low painted redwood spandrel, then a ribbon of tall fixed lights
        // between cream mullions with hopper transoms above, under the polycarbonate windscreen
        boards('#4a2c22', 26);
        g.fillStyle = '#e6dcb8'; g.fillRect(0, Y(3.05), W, (3.05 - 0.55) * m);
        for (let x = 0; x < 8; x += 1.6) {
          const gr = g.createLinearGradient(0, Y(2.42), 0, Y(0.62)); gr.addColorStop(0, '#2a3540'); gr.addColorStop(1, '#5c7183');
          g.fillStyle = gr; g.fillRect((x + 0.09) * m, Y(2.42), 1.42 * m, 1.8 * m);
          g.fillStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.moveTo((x + 0.09) * m, Y(2.42)); g.lineTo((x + 0.7) * m, Y(2.42)); g.lineTo((x + 0.09) * m, Y(1.3)); g.fill();
          g.fillStyle = '#3d4d5c'; g.fillRect((x + 0.09) * m, Y(2.98), 1.42 * m, 0.46 * m);
        }
      } else if (kind === 'darkwood') {
        // stained near-black board and batten (Davies Chapel today)
        boards('#2b2522', 14);
      } else if (kind === 'cream') {
        boards('#d8ccab', 16);
        win(1.3, 2.7, 0.9, 2.3, '#f2efe6', 2); win(5.3, 6.7, 0.9, 2.3, '#f2efe6', 2);
      } else if (kind === 'lanai' || kind === 'lanaiL') {
        // lanai side: flush wood doors, lockers (math and science), a transom band of solid-panel jalousies
        boards('#4f3b2c', 12);
        for (const dx of [1.0, 5.0]) { g.fillStyle = '#2b2018'; g.fillRect(dx * m - 5, Y(2.3) - 5, 1.0 * m + 10, 2.3 * m + 5); g.fillStyle = '#7a5636'; g.fillRect(dx * m, Y(2.3), 1.0 * m, 2.3 * m); g.fillStyle = '#c9b48a'; g.fillRect((dx + 0.82) * m, Y(1.05), 4, 10); }
        if (kind === 'lanaiL') {
          for (const x0 of [2.3, 6.3]) { g.fillStyle = '#5d6b5a'; g.fillRect(x0 * m, Y(1.95), 2.4 * m, 1.95 * m); for (let x = x0; x < x0 + 2.4; x += 0.3) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x * m, Y(1.95), 2, 1.95 * m); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect((x + 0.05) * m, Y(1.7), 8, 3); g.fillRect((x + 0.05) * m, Y(1.62), 8, 3); } }
        }
        g.fillStyle = '#2b2018'; g.fillRect(0, Y(3.15), W, 0.75 * m);
        for (let yy = 2.45; yy < 3.1; yy += 0.09) { g.fillStyle = '#6a5240'; g.fillRect(0, Y(yy + 0.07), W, 0.05 * m); }
      } else if (kind === 'chapel') {
        // board-formed concrete with embedded, hammer-struck lava rock
        g.fillStyle = '#a19b91'; g.fillRect(0, 0, W, H);
        for (let yy = 0; yy < H; yy += 9) { g.fillStyle = 'rgba(60,55,48,0.18)'; g.fillRect(0, yy, W, 2); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(r() * W, yy + 3, 30 + r() * 80, 3); } }
        const pal = ['#6e6259', '#5f544c', '#7a6c60', '#665a50'];
        for (let i = 0; i < 220; i++) { const x = r() * W, yy = r() * H, rad = 2.5 + r() * 5; g.fillStyle = pal[(r() * pal.length) | 0]; g.beginPath(); g.ellipse(x, yy, rad * 1.2, rad * 0.8, r() * 3, 0, 7); g.fill(); }
      } else if (kind === 'jal') {
        g.fillStyle = '#2b2018'; g.fillRect(0, 0, W, H);
        for (let yy = 4; yy < H; yy += 14) { g.fillStyle = '#6b5240'; g.fillRect(0, yy, W, 9); g.fillStyle = 'rgba(255,230,190,0.12)'; g.fillRect(0, yy, W, 2); }
        for (let x = 0; x < W; x += 128) { g.fillStyle = '#2b2018'; g.fillRect(x, 0, 6, H); }
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
  const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const postMat = new THREE.MeshStandardMaterial({ color: C('#3a2c22'), roughness: 0.8 });
  const footMat = new THREE.MeshStandardMaterial({ color: C('#3a312b'), roughness: 0.95 });
  const deckTex = canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = '#6b513d'; g.fillRect(0, 0, W, H);
    const r = rng(41);
    for (let y = 0; y < H; y += 16) { g.fillStyle = 'rgba(20,10,5,0.5)'; g.fillRect(0, y, W, 2); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,220,180,0.06)'; g.fillRect(r() * W, y + 3 + r() * 10, 30 + r() * 60, 1); } }
  });
  deckTex.repeat.set(2, 2);
  const deckMat = new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.85 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: C('#c9c5bb'), roughness: 0.95 });
  const panelTex = canvasTex(256, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#1d2c4a'); gr.addColorStop(1, '#14203a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#6f84a8'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, H); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(W, i * 64); g.stroke(); }
    g.strokeStyle = 'rgba(120,140,180,0.35)'; g.lineWidth = 1; for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, H); g.stroke(); }
  });
  const panelMatFor = (pw, pd) => { const t = panelTex.clone(); t.needsUpdate = true; t.repeat.set(pw / 4, pd / 4); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.25, metalness: 0.55 }); };

  // walls with material groups: 0 = long walls, 1 = end walls (follow the roof line), 2 = clerestory band
  function wallsGeo(w, d, hF, hB, vSpan, gableRise) {
    const hw = w / 2, hd = d / 2, G = [{ p: [], u: [] }, { p: [], u: [] }, { p: [], u: [] }, { p: [], u: [] }];
    const quad = (gi, a, b, c, e, ua, ub, uc, ue) => { G[gi].p.push(...a, ...b, ...c, ...a, ...c, ...e); G[gi].u.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ue); };
    const tri = (gi, a, b, c, ua, ub, uc) => { G[gi].p.push(...a, ...b, ...c); G[gi].u.push(...ua, ...ub, ...uc); };
    const vf = hF / vSpan, vb = hB / vSpan;
    quad(0, [-hw, 0, hd], [hw, 0, hd], [hw, hF, hd], [-hw, hF, hd], [0, 0], [w / 8, 0], [w / 8, vf], [0, vf]);
    quad(3, [hw, 0, -hd], [-hw, 0, -hd], [-hw, hF, -hd], [hw, hF, -hd], [0, 0], [w / 8, 0], [w / 8, vf], [0, vf]);
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
  function roofParts(type, w, d, rise, eave, rafters, eaveEnd) {
    const hw = w / 2, hd = d / 2, W = hw + (eaveEnd || eave), D = hd + eave, f = type === 'shed' ? 0.45 : 0.35;
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

  // low segmental arch roof (Castle Gymnasium): glulam arches, 1.5 m eaves, red fascia, ridge monitor
  function archRoof(w, d, rise, eave) {
    const W = w / 2 + eave, D = d / 2 + eave, N = 18, top = [], trim = [], f = 0.4;
    const yAt = (z) => rise * (1 - (z / D) * (z / D)) - rise * 0.06;
    for (let i = 0; i < N; i++) {
      const z0 = -D + 2 * D * i / N, z1 = -D + 2 * D * (i + 1) / N, y0 = yAt(z0), y1 = yAt(z1);
      top.push([W, y0, z0], [-W, y0, z0], [-W, y1, z1], [W, y0, z0], [-W, y1, z1], [W, y1, z1]);
      trim.push([-W, y0 - f, z0], [W, y0 - f, z0], [W, y1 - f, z1], [-W, y0 - f, z0], [W, y1 - f, z1], [-W, y1 - f, z1]);
      for (const sx of [-1, 1]) {
        const x = sx * W, a = [x, y0 - f, z0], b2 = [x, y0, z0], c2 = [x, y1, z1], e = [x, y1 - f, z1];
        if (sx > 0) trim.push(a, e, c2, a, c2, b2); else trim.push(a, c2, e, a, b2, c2);
      }
    }
    for (const sz of [-1, 1]) { const z = sz * D, y = yAt(z); const q = [[-W, y - f, z], [W, y - f, z], [W, y, z], [-W, y, z]]; if (sz > 0) trim.push(q[0], q[1], q[2], q[0], q[2], q[3]); else trim.push(q[1], q[0], q[3], q[1], q[3], q[2]); }
    const parts = [{ g: triGeo(trim), c: C('#7a3d2f') }];
    // monitor along the ridge: glass sides under a small flat roof
    parts.push({ g: new THREE.BoxGeometry(w * 0.86, 0.22, 5.2).translate(0, rise + 1.3, 0), c: C('#c4c4bf') });
    return { top: triGeo(top, 0.5), trim: mergeGeoms(parts), yF: 0, yB: 0, k: 0, f: 0.3, monitor: { w: w * 0.84, y: rise - 0.1, h: 1.35, d: 4.6 } };
  }
  // wall pieces for walk-in buildings: boxes with real openings, textured at 8 m x vSpan per tile, colliders on the solid parts
  function uvBox(geo, dims, uS, vS) {
    const [w, h, d] = dims, uv = geo.attributes.uv, f = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let i = 0; i < 24; i++) { const k = f[(i / 4) | 0]; uv.setXY(i, uv.getX(i) * k[0] / uS, uv.getY(i) * k[1] / vS); }
    return geo;
  }
  // a straight wall in a building's frame, along local x (at z = at) or local z (at x = at); out = which side faces outdoors;
  // openings = [[centre, width, top, sill], ...] along the wall; a sill turns a doorway into a window
  function wallLine(o, parent, along, c0, c1, at, out, y0, h, t, matOut, matIn, openings, vS) {
    const pieces = []; let s0 = c0;
    for (const [c, w, oh, sill] of (openings || []).slice().sort((p, q) => p[0] - q[0])) { const a = c - w / 2, b = c + w / 2; if (a > s0) pieces.push([s0, a, 0, h]); if (sill) pieces.push([a, b, 0, sill]); pieces.push([a, b, oh, h]); s0 = b; }
    if (c1 > s0) pieces.push([s0, c1, 0, h]);
    for (const [a, b, yb, yt] of pieces) {
      if (yt - yb < 0.02 || b - a < 0.02) continue;
      const L = b - a, H = yt - yb, mid = (a + b) / 2, dims = along === 'x' ? [L, H, t] : [t, H, L];
      const mats = [matOut, matOut, matOut, matOut, matOut, matOut];
      if (along === 'x') mats[out > 0 ? 5 : 4] = matIn; else mats[out > 0 ? 1 : 0] = matIn;
      const m = new THREE.Mesh(uvBox(new THREE.BoxGeometry(...dims), dims, 8, vS || 4), mats);
      if (along === 'x') m.position.set(mid, y0 + (yb + yt) / 2, at); else m.position.set(at, y0 + (yb + yt) / 2, mid);
      m.castShadow = true; m.receiveShadow = true; parent.add(m);
      if (yb < 1) { const [wx, wz] = toWorld(o, along === 'x' ? mid : at, along === 'x' ? at : mid); box(wx, wz, dims[0] / 2, dims[2] / 2, o.rot); }
    }
  }
  const _bm = new THREE.Matrix4(), _ba = new THREE.Vector3(), _bb = new THREE.Vector3(), _bu = new THREE.Vector3();
  function beamPart(ax, ay, az, bx, by, bz, w, h, col) {
    const L = Math.hypot(bx - ax, by - ay, bz - az), geo = new THREE.BoxGeometry(w, h, L);
    _ba.set(ax, ay, az); _bb.set(bx, by, bz); if (Math.abs(by - ay) > 0.97 * L) _bu.set(1, 0, 0); else _bu.set(0, 1, 0);
    _bm.lookAt(_ba, _bb, _bu); geo.applyMatrix4(_bm); geo.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    return { g: geo, c: col };
  }
  // small furniture shared by several places
  function adirondackGeo() {
    const p = [], red = C('#c62a2f');
    for (let i = 0; i < 5; i++) p.push({ g: new THREE.BoxGeometry(0.11, 0.025, 0.56).rotateX(-0.16).translate(-0.26 + i * 0.13, 0.36, 0.02), c: red });
    for (let i = 0; i < 5; i++) { const hgt = 0.78 + (2 - Math.abs(i - 2)) * 0.1; p.push({ g: new THREE.BoxGeometry(0.1, hgt, 0.025).translate(0, hgt / 2, 0).rotateX(-0.42).translate(-0.24 + i * 0.12, 0.3, -0.26), c: red }); }
    for (const sx of [-1, 1]) {
      p.push({ g: new THREE.BoxGeometry(0.15, 0.025, 0.72).translate(sx * 0.37, 0.6, 0.02), c: red });
      p.push({ g: new THREE.BoxGeometry(0.05, 0.6, 0.07).translate(sx * 0.33, 0.3, 0.3), c: red });
      p.push({ g: new THREE.BoxGeometry(0.05, 0.07, 0.8).rotateX(0.35).translate(sx * 0.33, 0.24, -0.08), c: red });
    }
    p.push({ g: new THREE.BoxGeometry(0.62, 0.05, 0.03).translate(0, 0.66, -0.43), c: red });
    return mergeGeoms(p);
  }
  // expanded-metal picnic tables: a square one with four seats (store porch) and a long one with two benches (square)
  function squareTableGeo() {
    const p = [], red = C('#c8202c'), blk = C('#1f1f22');
    p.push({ g: new THREE.BoxGeometry(0.95, 0.05, 0.95).translate(0, 0.74, 0), c: red });
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2, sx = Math.sin(a), sz = Math.cos(a);
      p.push({ g: new THREE.BoxGeometry(0.95, 0.05, 0.3).rotateY(a).translate(sx * 0.82, 0.45, sz * 0.82), c: red });
      p.push({ g: new THREE.BoxGeometry(0.05, 0.05, 0.86).rotateY(a).translate(sx * 0.4, 0.4, sz * 0.4), c: blk });
      p.push({ g: new THREE.BoxGeometry(0.05, 0.45, 0.05).translate(sx * 0.82, 0.22, sz * 0.82), c: blk });
    }
    p.push({ g: new THREE.BoxGeometry(0.06, 0.74, 0.06).translate(0, 0.37, 0), c: blk });
    return mergeGeoms(p);
  }
  function longTableGeo() {
    const p = [], red = C('#c8202c'), blk = C('#1f1f22');
    p.push({ g: new THREE.BoxGeometry(1.85, 0.05, 0.78).translate(0, 0.74, 0), c: red });
    for (const sz of [-0.66, 0.66]) p.push({ g: new THREE.BoxGeometry(1.85, 0.05, 0.3).translate(0, 0.45, sz), c: red });
    for (const sx of [-0.72, 0.72]) { p.push({ g: new THREE.BoxGeometry(0.05, 0.05, 1.6).translate(sx, 0.42, 0), c: blk }); p.push({ g: new THREE.BoxGeometry(0.05, 0.74, 0.05).rotateX(0.32).translate(sx, 0.37, -0.12), c: blk }); p.push({ g: new THREE.BoxGeometry(0.05, 0.74, 0.05).rotateX(-0.32).translate(sx, 0.37, 0.12), c: blk }); }
    return mergeGeoms(p);
  }
  // grey picnic table with its long benches built into the frame (the nook beside the Student Store)
  function greyPicnicGeo() {
    const p = [], top = C('#8e9195'), frame = C('#5d6065');
    p.push({ g: new THREE.BoxGeometry(2.2, 0.06, 0.82).translate(0, 0.76, 0), c: top });
    for (const sz of [-0.68, 0.68]) p.push({ g: new THREE.BoxGeometry(2.2, 0.06, 0.3).translate(0, 0.46, sz), c: top });
    for (const sx of [-0.78, 0.78]) {
      p.push({ g: new THREE.BoxGeometry(0.06, 0.06, 1.7).translate(sx, 0.42, 0), c: frame });
      for (const sd of [-1, 1]) p.push(beamPart(sx, 0.73, sd * 0.12, sx, 0.0, sd * 0.62, 0.06, 0.06, frame));
    }
    return mergeGeoms(p);
  }
  // ---------- a classroom behind the middle door of each 1963 classroom building ----------
  // From a school photo: cream walls, a white ceiling with light panels and a fan, wood-framed windows with hopper transoms
  // on the uphill side, a pinboard of student drawings under a yellow clock, a bookshelf, tablet-arm desks in a ring,
  // grey-green carpet, and a whiteboard that everyone in the room can draw on together.
  let classIn = null;
  function classInMat() {
    if (!classIn) classIn = new THREE.MeshStandardMaterial({ map: canvasTex(256, 128, (c, W2, H2) => { c.fillStyle = '#efe7d3'; c.fillRect(0, 0, W2, H2); c.fillStyle = 'rgba(150,130,100,0.12)'; c.fillRect(0, H2 - 10, W2, 10); }), roughness: 0.9 });
    return classIn;
  }
  function classroom(b, g, body, y0, fl, hF, hd, deckDepth) {
    const floor = 0; // heights below are measured from the room floor (the body group already sits at it)
    const RW = 5.2, inn = classInMat(), M = (c, r, ex) => new THREE.MeshStandardMaterial(Object.assign({ color: C(c), roughness: r }, ex || {}));
    const add = (geo, mat, x, y, z, ry) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.receiveShadow = true; body.add(m); return m; };
    // walls: partitions either side, the back wall and the ends closed off for walking
    wallLine(b, body, 'z', -hd, hd, -RW, -1, 0, hF, 0.2, inn, inn, []);
    wallLine(b, body, 'z', -hd, hd, RW, 1, 0, hF, 0.2, inn, inn, []);
    { const [x, z] = toWorld(b, 0, -hd); box(x, z, b.w / 2, 0.2, b.rot); }
    for (const sx of [-1, 1]) { const [x, z] = toWorld(b, sx * b.w / 2, 0); box(x, z, 0.2, hd, b.rot); }
    { const [x, z] = toWorld(b, 0, hd + deckDepth - 0.1); box(x, z, b.w / 2 + 0.3, 0.08, b.rot); }
    // windows on the uphill side: wood frames, hopper transoms tipped open, daylight and a grassy bank outside
    const winTex = canvasTex(512, 160, (c, W2, H2) => {
      const m = W2 / (2 * RW), Y = (y) => H2 - y * (H2 / hF);
      c.fillStyle = '#efe7d3'; c.fillRect(0, 0, W2, H2);
      for (let i = 0; i < 3; i++) {
        const x0 = (0.5 + i * 3.4) * m, w = 3.0 * m;
        c.fillStyle = '#8a6a48'; c.fillRect(x0 - 6, Y(3.0), w + 12, Y(0.8) - Y(3.0) + 6);
        const gr = c.createLinearGradient(0, Y(2.45), 0, Y(0.85)); gr.addColorStop(0, '#f6f8f4'); gr.addColorStop(0.55, '#dfe8d6'); gr.addColorStop(1, '#a9b98f');
        c.fillStyle = gr; c.fillRect(x0, Y(2.45), w, Y(0.85) - Y(2.45));
        c.fillStyle = '#d9dfe6'; c.fillRect(x0, Y(2.95), w, Y(2.55) - Y(2.95));
        c.fillStyle = '#8a6a48'; c.fillRect(x0, Y(2.52), w, 5); c.fillRect(x0 + w / 2 - 3, Y(2.95), 6, Y(0.85) - Y(2.95));
        c.fillStyle = 'rgba(240,236,224,0.85)'; c.fillRect(x0, Y(2.45), w, (Y(2.2) - Y(2.45)));
      }
    });
    add(new THREE.PlaneGeometry(2 * RW - 0.2, hF), M('#ffffff', 0.8, { map: winTex, emissive: C('#30302c') }), 0, floor + hF / 2, -hd + 0.03);
    // floor, ceiling with light panels and a dark beam, the fan
    add(new THREE.PlaneGeometry(2 * RW - 0.2, 2 * hd - 0.2).rotateX(-Math.PI / 2), M('#5b6457', 0.98), 0, floor + 0.02, 0);
    add(new THREE.PlaneGeometry(2 * RW - 0.2, 2 * hd - 0.2).rotateX(Math.PI / 2), M('#f4f1e8', 0.9, { emissive: C('#57554f') }), 0, floor + hF - 0.04, 0);
    for (const z of [-hd * 0.45, hd * 0.35]) add(new THREE.PlaneGeometry(1.2, 1.2).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: C('#fbfbf6') }), -1.6, floor + hF - 0.06, z);
    add(new THREE.BoxGeometry(0.3, 0.3, 2 * hd - 0.2), M('#3b2c22', 0.8), 1.8, floor + hF - 0.2, 0);
    const fan = new THREE.Group(); fan.position.set(0, floor + hF - 0.05, 0); body.add(fan);
    const fanM = M('#f2f0ea', 0.6);
    fan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6).translate(0, -0.18, 0), fanM));
    const hub = new THREE.Group(); hub.position.y = -0.42; fan.add(hub);
    hub.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.16, 12), fanM));
    for (let k = 0; k < 5; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.015, 0.14).translate(0.42, 0, 0), fanM); bl.rotation.y = k / 5 * Math.PI * 2; bl.rotation.x = 0.12; hub.add(bl); }
    fans.push(hub);
    // pinboard of drawings and a yellow clock on the left partition
    const pin = canvasTex(512, 192, (c, W2, H2) => {
      c.fillStyle = '#b8936a'; c.fillRect(0, 0, W2, H2); const r = rng(b.at[0]);
      const cols = ['#f7f4ea', '#fdf6d8', '#eef3fb', '#fbeef0'], ink = ['#3a6fb5', '#c6493f', '#3d8f4f', '#e3a13a', '#7a4ca0', '#333333'];
      for (let y = 6; y < H2 - 30; y += 46) for (let x = 6; x < W2 - 30; x += 40) {
        c.fillStyle = cols[(r() * 4) | 0]; c.fillRect(x, y, 34, 42);
        for (let k = 0; k < 4; k++) { c.strokeStyle = ink[(r() * ink.length) | 0]; c.lineWidth = 2; c.beginPath(); c.arc(x + 8 + r() * 18, y + 10 + r() * 22, 3 + r() * 6, 0, 6.3); c.stroke(); }
      }
    });
    add(new THREE.PlaneGeometry(2 * hd - 3.2, 1.3), M('#ffffff', 0.9, { map: pin }), -RW + 0.12, floor + 1.55, -0.4, Math.PI / 2);
    const clock = canvasTex(128, 128, (c) => { c.fillStyle = '#f2c230'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill(); c.fillStyle = '#fffdf2'; c.beginPath(); c.arc(64, 64, 50, 0, 7); c.fill(); c.strokeStyle = '#222'; c.lineWidth = 4; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 28); c.moveTo(64, 64); c.lineTo(88, 74); c.stroke(); });
    add(new THREE.CircleGeometry(0.2, 24), M('#ffffff', 0.5, { map: clock, transparent: true }), -RW + 0.12, floor + 2.6, -0.4, Math.PI / 2);
    // bookshelf in the back corner, against a green palm-leaf panel
    const parts = [], wood = C('#c9a067'), metal = C('#7f8489'), chairC = C('#454b55');
    parts.push({ g: new THREE.BoxGeometry(1.0, 2.0, 0.34).translate(RW - 0.75, floor + 1.0, -hd + 0.4), c: C('#7a5636') });
    for (let k = 0; k < 4; k++) for (let i = 0; i < 8; i++) parts.push({ g: new THREE.BoxGeometry(0.08, 0.26, 0.24).translate(RW - 1.15 + i * 0.1, floor + 0.32 + k * 0.48, -hd + 0.42), c: C(['#b33a3a', '#3a6fb5', '#e3a13a', '#3d8f4f', '#efe7d3'][(i + k) % 5]) });
    add(new THREE.PlaneGeometry(1.1, 2.3), M('#2f7a45', 0.9), RW - 0.75, floor + 1.15, -hd + 0.2);
    // tablet-arm desks in a ring, facing the middle, and the teacher's table by the board
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2, rr = Math.min(3.4, hd - 1.6), x = Math.cos(a) * rr * 1.15, z = Math.sin(a) * rr, face = Math.atan2(-x, -z);
      const d = [];
      d.push({ g: new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20).scale(1.25, 1, 0.8).translate(0, 0.74, 0.15), c: wood });
      d.push({ g: new THREE.BoxGeometry(0.05, 0.72, 0.05).translate(0.25, 0.37, 0.15), c: metal });
      d.push({ g: new THREE.BoxGeometry(0.42, 0.05, 0.42).translate(-0.15, 0.45, -0.25), c: chairC });
      d.push({ g: new THREE.BoxGeometry(0.42, 0.42, 0.05).translate(-0.15, 0.68, -0.47), c: chairC });
      for (const [lx, lz] of [[-0.33, -0.05], [0.03, -0.05], [-0.33, -0.44], [0.03, -0.44]]) d.push({ g: new THREE.BoxGeometry(0.035, 0.45, 0.035).translate(lx, 0.22, lz), c: metal });
      for (const q of d) { q.g.rotateY(face); q.g.translate(x, floor, z); parts.push(q); }
      const [wx, wz] = toWorld(b, x, z); colliders.circles.push({ x: wx, z: wz, r: 0.45 });
    }
    parts.push({ g: new THREE.BoxGeometry(0.8, 0.05, 1.6).translate(RW - 1.6, floor + 0.75, 1.8), c: wood });
    for (const [lx, lz] of [[-0.35, -0.7], [0.35, -0.7], [-0.35, 0.7], [0.35, 0.7]]) parts.push({ g: new THREE.BoxGeometry(0.05, 0.75, 0.05).translate(RW - 1.6 + lx, floor + 0.37, 1.8 + lz), c: metal });
    { const [wx, wz] = toWorld(b, RW - 1.6, 1.8); box(wx, wz, 0.45, 0.85, b.rot); }
    const pm = new THREE.Mesh(mergeGeoms(parts), trimMat); pm.castShadow = true; pm.receiveShadow = true; body.add(pm);
    // the whiteboard on the right partition, facing into the room
    const W2 = 1024, H2 = 384, cv = document.createElement('canvas'); cv.width = W2; cv.height = H2;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W2, H2);
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
    const BW = 3.6, BH = BW * H2 / W2;
    add(new THREE.BoxGeometry(0.05, BH + 0.1, BW + 0.1), M('#b9bdc2', 0.4, { metalness: 0.5 }), RW - 0.12, floor + 1.6, 0);
    add(new THREE.PlaneGeometry(BW, BH), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 }), RW - 0.15, floor + 1.6, 0, -Math.PI / 2);
    add(new THREE.BoxGeometry(0.1, 0.04, BW * 0.9), M('#b9bdc2', 0.4, { metalness: 0.5 }), RW - 0.17, floor + 1.6 - BH / 2 - 0.04, 0);
    const [bx, bz] = toWorld(b, RW - 0.15, 0), nx = -Math.cos(b.rot), nz = Math.sin(b.rot);
    boards.push({ x: bx, z: bz, nx, nz, canvas: cv, ctx, tex, label: b.label || 'Classroom' });
    // floor of the room, the camera stays inside it, nothing grows indoors
    const [rx, rz] = toWorld(b, 0, 0);
    addRamp(rx, rz, b.rot, RW - 0.1, hd - 0.1, y0 + fl);
    rooms.push({ x: rx, z: rz, rot: b.rot, hw: RW - 0.35, hd: hd - 0.35, y0: y0 + fl, top: hF - 0.3 });
    noVeg.push({ x: b.x, z: b.z, rot: b.rot, hw: b.w / 2 + 0.5, hd: hd + 0.5 });
  }
  function building(b) {
    const g = new THREE.Group();
    const y0 = groundH(b.x, b.z);
    g.position.set(b.x, y0, b.z); g.rotation.y = b.rot;
    const woodish = b.wall === 'wood' || b.wall === 'stone' || b.wall === 'open';
    const floor = b.walk ? 0.03 : woodish && b.h < 5 ? 0.6 : 0.15;
    const eave = b.eave || (b.roof === 'shed' ? 2.6 : b.roof === 'arch' ? 1.5 : b.wall === 'gym' ? 0.9 : woodish ? 1.9 : 1.2);
    const hd = b.d / 2, D = hd + eave;
    let hF = b.h, hB = b.h, rise = 0, gableRise = 0;
    if (b.roof === 'shed') { rise = b.d * (b.rise || 0.15); hB = b.h + rise; }
    else if (b.roof === 'gable') { rise = D * (b.rise || 0.18) * 2; gableRise = rise * hd / D; }
    else if (b.roof === 'hip') rise = D * (b.rise || 0.3);
    else if (b.roof === 'arch') { rise = b.d * (b.rise || 0.12); gableRise = rise * 0.85; }
    const body = new THREE.Group(); body.position.y = floor; g.add(body);
    const vSpan = b.wall === 'gym' ? b.h : 4;
    if (b.walk) {
      // walk-in hall: boxed walls with doorways, light panels outside, painted block and banners inside
      const hw = b.w / 2, gin = canvasTex(512, 512, (c, W2, H2) => {
        const m = H2 / hF, Y = (y) => H2 - y * m;
        c.fillStyle = '#ece6d6'; c.fillRect(0, 0, W2, H2);
        for (let y = 0; y < hF; y += 0.2) { c.fillStyle = 'rgba(120,110,90,0.18)'; c.fillRect(0, Y(y), W2, 1); }
        c.fillStyle = '#b52a2f'; c.fillRect(0, Y(1.15), W2, 0.12 * m);
        for (const x0 of [0.6, 4.6]) {
          c.fillStyle = '#b52a2f'; c.fillRect(x0 * m, Y(4.3), 1.6 * m, 1.7 * m);
          c.fillStyle = '#f4efe2'; c.fillRect((x0 + 0.12) * m, Y(4.1), 1.36 * m, 3); c.font = 'bold 22px Georgia, serif'; c.textAlign = 'center';
          c.fillText(x0 < 1 ? 'KA MAKANI' : 'HPA', (x0 + 0.8) * m, Y(3.55)); for (let k = 0; k < 4; k++) c.fillRect((x0 + 0.25) * m, Y(3.3 - k * 0.22), 1.1 * m, 3);
        }
        for (const x0 of [2.6, 6.6]) { const gr = c.createLinearGradient(0, Y(5.7), 0, Y(4.8)); gr.addColorStop(0, '#e9f2f7'); gr.addColorStop(1, '#a9bccb'); c.fillStyle = '#6b6f74'; c.fillRect(x0 * m - 3, Y(5.7) - 3, 1.2 * m + 6, 0.9 * m + 6); c.fillStyle = gr; c.fillRect(x0 * m, Y(5.7), 1.2 * m, 0.9 * m); }
      });
      const gend = canvasTex(512, 512, (c, W2, H2) => {
        const m = H2 / hF, Y = (y) => H2 - y * m;
        c.fillStyle = '#ece6d6'; c.fillRect(0, 0, W2, H2);
        for (let y = 0; y < hF; y += 0.2) { c.fillStyle = 'rgba(120,110,90,0.18)'; c.fillRect(0, Y(y), W2, 1); }
        c.fillStyle = '#b52a2f'; c.fillRect(0, Y(2.0), W2, 2.0 * m);
        for (let x = 0; x < W2; x += 0.6 * m) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, Y(2.0), 2, 2.0 * m); }
      });
      const gIn = new THREE.MeshStandardMaterial({ map: gin, roughness: 0.85 }), gEnd = new THREE.MeshStandardMaterial({ map: gend, roughness: 0.85 }), gOut = wallMat(b.wall);
      wallLine(b, body, 'x', -hw, hw, hd, 1, 0, hF, 0.3, gOut, gIn, [[0, 3.6, 3.2]], hF);
      wallLine(b, body, 'x', -hw, hw, -hd, -1, 0, hF, 0.3, gOut, gIn, [[-6, 2.4, 2.7]], hF);
      wallLine(b, body, 'z', -hd, hd, hw, 1, 0, hF, 0.3, gOut, gEnd, [[0, 3, 3]], hF);
      wallLine(b, body, 'z', -hd, hd, -hw, -1, 0, hF, 0.3, gOut, gEnd, [], hF);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 3 + floor, b.d + 0.3), footMat); foot.position.y = (floor - 3) / 2; foot.receiveShadow = true; g.add(foot);
    } else if (!b.open) {
      const front = b.cls ? (b.lockers ? 'lanaiL' : 'lanai') : b.wall, back = b.cls ? 'ribbon' : b.wall;
      const walls = new THREE.Mesh(wallsGeo(b.w, b.d, hF, hB, vSpan, gableRise), [b.cls ? new THREE.MeshBasicMaterial({ visible: false }) : wallMat(front), wallMat(b.ends || b.wall), wallMat('glass'), wallMat(back)]);
      if (b.cls) wallLine(b, body, 'x', -b.w / 2, b.w / 2, hd, 1, 0, hF, 0.2, wallMat(front), classInMat(), [[0, 1.2, 2.35]]);
      walls.castShadow = true; walls.receiveShadow = true; body.add(walls);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 3 + floor, b.d + 0.3), b.dorm ? wallMat('stone') : b.name === 'chapel' ? wallMat('chapel') : footMat); foot.position.y = (floor - 3) / 2; foot.receiveShadow = true; g.add(foot);
    } else {
      // open pavilion: log posts round a concrete slab, wood lockers along the back
      const slab = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.2, b.d), concreteMat); slab.position.y = floor - 0.1; slab.receiveShadow = true; g.add(slab);
      const parts = [], under = (z) => hF + (b.roof === 'shed' ? (-(rise / b.d) * (z - b.d / 2)) : 0) - 0.4;
      for (let x = -b.w / 2; x <= b.w / 2 + 0.01; x += b.w / Math.round(b.w / 3.5)) for (const z of [-b.d / 2, b.d / 2]) { const h2 = under(z); parts.push({ g: new THREE.CylinderGeometry(0.16, 0.2, h2, 8).translate(x, floor + h2 / 2, z), c: C('#a39a8c') }); }
      for (let x = -b.w / 2 + 1; x < b.w / 2 - 1; x += 0.45) parts.push({ g: new THREE.BoxGeometry(0.42, 1.8, 0.45).translate(x, floor + 0.9, -b.d / 2 + 0.5), c: C('#7a5636') });
      const pm = new THREE.Mesh(mergeGeoms(parts), trimMat); pm.castShadow = true; pm.receiveShadow = true; body.add(pm);
    }
    const roofColor = b.roofColor || (b.wall === 'gym' ? '#d9d9d5' : '#a9a9a4');
    const rp = b.roof === 'arch' ? archRoof(b.w, b.d, rise, eave) : roofParts(b.roof, b.w, b.d, rise, eave, (woodish || b.name === 'chapel') && b.roof !== 'flat', b.eaveEnd);
    const top = new THREE.Mesh(rp.top, roofMat(roofColor)); top.position.y = hF; top.castShadow = true; top.receiveShadow = true; body.add(top);
    const trim = new THREE.Mesh(rp.trim, trimMat); trim.position.y = hF; trim.castShadow = true; trim.receiveShadow = true; body.add(trim);
    if (rp.monitor) { const mo = rp.monitor; const glassBand = new THREE.Mesh(new THREE.BoxGeometry(mo.w, mo.h, mo.d), wallMat('glass')); glassBand.position.y = hF + mo.y + mo.h / 2; glassBand.castShadow = true; body.add(glassBand); }
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
      const deck = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.18, deckDepth), b.deck === 'concrete' ? concreteMat : deckMat);
      deck.position.set(0, floor - 0.09, hd + deckDepth / 2); deck.receiveShadow = true; deck.castShadow = true; g.add(deck);
      const parts = [], dark = C(WOOD_DARK), mid = C('#4a382a');
      if (b.cls) { for (let x = -b.w / 2 - 0.2; x <= b.w / 2 + 0.3; x += 1.6) parts.push({ g: new THREE.BoxGeometry(0.16, floor + 2, 0.16).translate(x, (floor - 2) / 2, hd + deckDepth - 0.1), c: C('#2f2620') }); }
      else parts.push({ g: new THREE.BoxGeometry(b.w + 0.6, floor + 3, 0.12).translate(0, (floor - 3) / 2, hd + deckDepth), c: C('#2f2620') });
      const zp = hd + deckDepth - 0.12;
      const underAt = (z) => (b.roof === 'shed' ? -rp.k * (z - hd) : 0) - rp.f;
      const postH = hF + underAt(zp);
      if (b.logs) { for (let x = -b.w / 2 + 1; x <= b.w / 2 - 0.9; x += 6) parts.push({ g: new THREE.CylinderGeometry(0.22, 0.27, postH, 10).translate(x, floor + postH / 2, zp), c: C('#a59f95') }); }
      else for (let x = -b.w / 2; x <= b.w / 2 + 0.01; x += 1.6) parts.push({ g: new THREE.BoxGeometry(0.2, postH, 0.2).translate(x, floor + postH / 2, zp), c: dark });
      const rail = (x0, x1) => {
        if (x1 - x0 < 0.3) return;
        for (const hh of [0.95, 0.5]) parts.push({ g: new THREE.BoxGeometry(x1 - x0, 0.08, 0.08).translate((x0 + x1) / 2, floor + hh, zp + 0.05), c: mid });
        for (let x = x0; x <= x1; x += 1.6) parts.push({ g: new THREE.BoxGeometry(0.08, 0.95, 0.08).translate(x, floor + 0.475, zp + 0.05), c: mid });
      };
      if (b.cls) {
        rail(-b.w / 2 - 0.3, b.w / 2 + 0.3);
        const L = 3.4, slope = Math.atan2(floor, L);
        for (const sx of [-1, 1]) {
          const ramp = new THREE.BoxGeometry(Math.hypot(L, floor), 0.14, deckDepth - 0.2); ramp.rotateZ(-sx * slope); ramp.translate(sx * (b.w / 2 + 0.3 + L / 2), floor / 2 - 0.07, hd + deckDepth / 2); parts.push({ g: ramp, c: C('#8a8378') });
          const [rx, rz] = toWorld(b, sx * (b.w / 2 + 0.3 + L / 2), hd + deckDepth / 2);
          addRamp(rx, rz, b.rot + Math.PI / 2, (deckDepth - 0.2) / 2, L / 2, sx > 0 ? y0 + floor : y0, sx > 0 ? y0 : y0 + floor);
        }
        { const [dx, dz] = toWorld(b, 0, hd + deckDepth / 2); addRamp(dx, dz, b.rot, b.w / 2 + 0.3, deckDepth / 2, y0 + floor); }
      } else rail(-b.w / 2 - 0.3, -1.2), rail(1.2, b.w / 2 + 0.3);
      if (!b.cls) for (let i = 0; i < 3; i++) parts.push({ g: new THREE.BoxGeometry(2.2, floor * (3 - i) / 3, 0.35).translate(0, floor * (3 - i) / 6, hd + deckDepth + 0.17 + i * 0.35), c: C('#5c4635') });
      const m = new THREE.Mesh(mergeGeoms(parts), trimMat); m.castShadow = true; m.receiveShadow = true; g.add(m);
    }
    const ohia = C('#a39a8c');
    if (b.cls) classroom(b, g, body, y0, floor, hF, hd, deckDepth);
    if (b.cls) {
      // polycarbonate windscreen hanging from the high uphill eave, and a translucent strip in the roof over the lanai
      const poly = new THREE.MeshStandardMaterial({ color: C('#e4ecee'), transparent: true, opacity: 0.55, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false });
      const ws = new THREE.Mesh(new THREE.PlaneGeometry(b.w + 2 * eave, 0.95), poly); ws.position.set(0, hF + rp.yB - 0.45 - 0.48, -D - 0.02); body.add(ws);
      const zs = hd + 0.7, strip = new THREE.Mesh(new THREE.BoxGeometry(b.w + 2 * eave - 0.4, 0.03, 1.0), poly);
      strip.rotation.x = Math.atan(rp.k); strip.position.set(0, hF - rp.k * (zs - hd) + 0.03, zs); body.add(strip);
    }
    if (b.logEnds) {
      // natural ohia log posts under the deep gable-end eaves
      const parts = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push({ g: new THREE.CylinderGeometry(0.16, 0.2, hF - 0.35, 9).translate(sx * (b.w / 2 + b.eaveEnd - 0.35), floor + (hF - 0.35) / 2, sz * (hd - 0.35)), c: ohia });
      const lm = new THREE.Mesh(mergeGeoms(parts), trimMat); lm.castShadow = true; g.add(lm);
    }
    if (b.dorm) {
      // three-sided cantilevered common-room bay at the centre of the downhill front, upper floor
      const sh = new THREE.Shape(); sh.moveTo(-4.2, 0); sh.lineTo(4.2, 0); sh.lineTo(2.6, -2.6); sh.lineTo(-2.6, -2.6); sh.closePath();
      const bay = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 2.9, bevelEnabled: false }).rotateX(-Math.PI / 2), [wallMat('wood'), wallMat('glass')]);
      bay.position.set(1.5, floor + 3.3, hd); bay.castShadow = true; g.add(bay);
      const bayRoof = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.25, bevelEnabled: false }).rotateX(-Math.PI / 2), roofMat('#a9a9a4'));
      bayRoof.scale.set(1.12, 1, 1.12); bayRoof.position.set(1.5, floor + 6.2, hd); bayRoof.castShadow = true; g.add(bayRoof);
      // full-height lava rubble sections on the front
      for (const x of [-b.w * 0.3, b.w * 0.3, -b.w * 0.05]) { const st = new THREE.Mesh(new THREE.BoxGeometry(3.4, hF + floor, 0.35), wallMat('stone')); st.position.set(x, (hF + floor) / 2, hd + 0.12); st.castShadow = true; st.receiveShadow = true; g.add(st); }
      // open entry lanai beside the bay
      const ent = new THREE.Mesh(new THREE.BoxGeometry(5, 0.15, 2.4), concreteMat); ent.position.set(-4.2, floor + 0.05, hd + 1.2); ent.receiveShadow = true; g.add(ent);
      if (b.balc) {
        // Carter Hall: upper balconies at the two front corners
        const parts = [];
        for (const sx of [-1, 1]) {
          const x = sx * (b.w / 2 - 3);
          parts.push({ g: new THREE.BoxGeometry(5, 0.18, 1.8).translate(x, floor + 3.1, hd + 0.9), c: C('#5c4635') });
          parts.push({ g: new THREE.BoxGeometry(5, 0.08, 0.08).translate(x, floor + 4.05, hd + 1.75), c: C('#4a382a') });
          for (let dx = -2.5; dx <= 2.51; dx += 0.5) parts.push({ g: new THREE.BoxGeometry(0.06, 0.95, 0.06).translate(x + dx, floor + 3.6, hd + 1.75), c: C('#4a382a') });
        }
        const bm = new THREE.Mesh(mergeGeoms(parts), trimMat); bm.castShadow = true; g.add(bm);
      }

      if (b.name === 'robertson') {
        // Robertson Hall (school photos): a lava-rock chimney mass where the two-storey wing meets a single-storey
        // common room with a timber pergola lanai; lattice skirts the raised floor of the long wing
        const ex = -b.w / 2, wing = new THREE.Group(); wing.position.set(ex - 6.6, 0, 1.2); g.add(wing);
        const ww = new THREE.Mesh(wallsGeo(13, 10, 3.2, 3.2, 4, 1.3), [wallMat('wood'), wallMat('stone'), wallMat('glass'), wallMat('wood')]); ww.position.y = floor; ww.castShadow = true; ww.receiveShadow = true; wing.add(ww);
        const wr = roofParts('gable', 13, 10, 1.4, 1.1, true);
        const wt = new THREE.Mesh(wr.top, roofMat('#a9a9a4')); wt.position.y = floor + 3.2; wt.castShadow = true; wing.add(wt);
        const wtr = new THREE.Mesh(wr.trim, trimMat); wtr.position.y = floor + 3.2; wing.add(wtr);
        const wf = new THREE.Mesh(new THREE.BoxGeometry(13.3, 3, 10.3), wallMat('stone')); wf.position.y = floor - 1.5; wing.add(wf);
        const parts = [], timber = C('#5a4636');
        for (const x of [-5.6, -1.9, 1.9, 5.6]) parts.push({ g: new THREE.BoxGeometry(0.24, 2.9, 0.24).translate(x, floor + 1.45, 9.4), c: timber });
        parts.push({ g: new THREE.BoxGeometry(12.2, 0.28, 0.2).translate(0, floor + 2.95, 9.4), c: timber });
        for (let x = -5.8; x <= 5.8; x += 0.9) parts.push({ g: new THREE.BoxGeometry(0.1, 0.22, 4.8).translate(x, floor + 3.2, 7.4), c: timber });
        const pg = new THREE.Mesh(mergeGeoms(parts), trimMat); pg.castShadow = true; wing.add(pg);
        const deckP = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.12, 4.6), concreteMat); deckP.position.set(0, floor + 0.02, 7.4); deckP.receiveShadow = true; wing.add(deckP);
        const chim = new THREE.Mesh(new THREE.BoxGeometry(3.2, hF + floor + 1.6, 3.4), wallMat('stone')); chim.position.set(ex + 1.2, (hF + floor + 1.6) / 2, hd - 1.2); chim.castShadow = true; chim.receiveShadow = true; g.add(chim);
        const lat = canvasTex(128, 64, (c, W2, H2) => { c.fillStyle = '#2a211b'; c.fillRect(0, 0, W2, H2); c.strokeStyle = '#6b5644'; c.lineWidth = 5; for (let x = -H2; x < W2 + H2; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + H2, H2); c.moveTo(x + H2, 0); c.lineTo(x, H2); c.stroke(); } });
        lat.repeat.set(b.w / 1.6, 1);
        const sk = new THREE.Mesh(new THREE.PlaneGeometry(b.w, 0.7), new THREE.MeshStandardMaterial({ map: lat, roughness: 0.9 })); sk.position.set(0, 0.2, hd + 0.17); g.add(sk);
        const [wx2, wz2] = toWorld(b, ex - 6.6, 1.2); box(wx2, wz2, 6.6, 5.2, b.rot);
      }
    }
    if (b.name === 'wishard') {
      // screen walls of narrow, widely spaced vertical boards and log posts at the north entry, lava garden walls
      const parts = [];
      const proj = new THREE.Mesh(new THREE.BoxGeometry(10, hF, 3.2), [wallMat('wood'), wallMat('wood'), wallMat('wood'), wallMat('wood'), wallMat('wood'), wallMat('glass')]);
      proj.rotation.y = Math.PI; proj.position.set(0, floor + hF / 2, -hd - 1.6); proj.castShadow = true; g.add(proj);
      { const [qx, qz] = toWorld(b, 0, -hd - 1.6); box(qx, qz, 5.2, 1.7, b.rot); }
      const projRoof = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.2, 4.4), roofMat('#a9a9a4')); projRoof.position.set(0, floor + hF + 0.1, -hd - 2.0); projRoof.castShadow = true; g.add(projRoof);
      for (const cx of [-8.6, 8.6]) for (let x = cx - 1.6; x <= cx + 1.6; x += 0.28) parts.push({ g: new THREE.BoxGeometry(0.09, 2.6, 0.16).translate(x, floor + 1.3, -hd - 1.6), c: C('#4a382a') });
      for (const x of [-6, 6, -13, 13]) parts.push({ g: new THREE.CylinderGeometry(0.17, 0.21, hF, 9).translate(x, floor + hF / 2, -hd - 2.4), c: ohia });
      const sm = new THREE.Mesh(mergeGeoms(parts), trimMat); sm.castShadow = true; g.add(sm);
      for (const x of [-16, 16]) { const [wx, wz] = toWorld(b, x, -hd - 5); const lw = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 0.45), wallMat('stone')); lw.position.set(x, groundH(wx, wz) - y0 + 0.4, -hd - 5); lw.castShadow = true; g.add(lw); box(wx, wz, 3.1, 0.3, b.rot); }
    }
    if (b.name === 'chapel') {
      // Davies Chapel (HABS HI-601-A and the school's photos): stained dark board walls on a band of board-formed concrete
      // set with lava rock. Along the south front a long low pent roof shelters a screen of natural ʻōhiʻa poles before the
      // coloured window; the tall entry door stands between big ʻōhiʻa posts; wood jalousies run under the eaves; the west
      // gable carries a white cross over a wall of multi-light glass. An open timber bell tower stands on the roof above the entry.
      const hw = b.w / 2, parts = [], beamC = C('#5b4433'), poleC = C('#b3ab9c'), r = rng(31);
      const band = new THREE.Mesh(uvBox(new THREE.BoxGeometry(b.w + 0.2, 1.1, b.d + 0.2), [b.w + 0.2, 1.1, b.d + 0.2], 8, 4), wallMat('chapel'));
      band.position.y = floor + 0.4; band.castShadow = true; band.receiveShadow = true; g.add(band);
      const glassTex = canvasTex(512, 192, (c, W2, H2) => {
        c.fillStyle = '#2b2018'; c.fillRect(0, 0, W2, H2);
        const cols = ['#c8433a', '#e0a33a', '#3d78b8', '#5aa35a', '#9a5bb0', '#e6d38a'], rr = rng(7);
        for (let x = 0; x < W2; x += 32) for (let y = 0; y < H2; y += 32) { c.fillStyle = cols[(rr() * cols.length) | 0]; c.globalAlpha = 0.85; c.fillRect(x + 3, y + 3, 26, 26); }
        c.globalAlpha = 1; c.strokeStyle = '#f2ead6'; c.lineWidth = 6;
        c.beginPath(); c.moveTo(W2 / 2, 30); c.lineTo(W2 / 2, 165); c.moveTo(W2 / 2 - 40, 75); c.lineTo(W2 / 2 + 40, 75); c.stroke();
      });
      const win = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.6), new THREE.MeshStandardMaterial({ map: glassTex, emissive: C('#3a2a1a'), roughness: 0.3 })); win.position.set(5.5, floor + 1.9, hd + 0.03); g.add(win);
      for (let x = -1.6; x <= 12.4; x += 0.23) { const hgt = 3.0 + r() * 0.25; parts.push({ g: new THREE.CylinderGeometry(0.07, 0.085, hgt, 6).translate(x + (r() - 0.5) * 0.05, floor + hgt / 2 - 0.05, hd + 0.75), c: poleC.clone().lerp(C('#8a8275'), r() * 0.6) }); }
      const pent = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.14, 3.2), roofMat('#c4c3bd')); pent.position.set(5.4, floor + 3.25, hd + 1.4); pent.rotation.x = 0.1; pent.castShadow = true; g.add(pent);
      for (let x = -2; x <= 12.8; x += 3.7) parts.push({ g: new THREE.CylinderGeometry(0.13, 0.16, 3.0, 8).translate(x, floor + 1.5, hd + 2.85), c: ohia });
      const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.8), new THREE.MeshStandardMaterial({ color: C('#1c1714'), roughness: 0.7 })); door.position.set(-5.2, floor + 1.9, hd + 0.04); g.add(door);
      for (const x of [-6.9, -3.5]) parts.push({ g: new THREE.CylinderGeometry(0.27, 0.32, hF + 0.3, 10).translate(x, floor + (hF + 0.3) / 2, hd + 0.35), c: ohia });
      parts.push({ g: new THREE.BoxGeometry(4.0, 0.3, 0.5).translate(-5.2, floor + hF - 0.6, hd + 0.35), c: beamC });
      const can = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 1.8), roofMat('#c4c3bd')); can.position.set(-10.2, floor + 2.55, hd + 0.9); can.rotation.x = 0.08; can.castShadow = true; g.add(can);
      for (const sz of [-1, 1]) { const jb = new THREE.Mesh(new THREE.PlaneGeometry(b.w - 1.2, 0.9), wallMat('jal')); jb.position.set(0, floor + hF - 0.6, sz * (hd + 0.03)); if (sz < 0) jb.rotation.y = Math.PI; g.add(jb); }
      const gw = canvasTex(512, 192, (c, W2, H2) => { c.fillStyle = '#121416'; c.fillRect(0, 0, W2, H2); for (let x = 0; x < W2; x += 42) for (let y = 0; y < H2; y += 48) { const gr = c.createLinearGradient(0, y, 0, y + 44); gr.addColorStop(0, '#5d7286'); gr.addColorStop(1, '#2a3642'); c.fillStyle = gr; c.fillRect(x + 4, y + 4, 34, 40); } });
      const gwin = new THREE.Mesh(new THREE.PlaneGeometry(b.d - 3, 2.4), new THREE.MeshStandardMaterial({ map: gw, roughness: 0.25, metalness: 0.3 })); gwin.position.set(-hw - 0.03, floor + 1.5, 0); gwin.rotation.y = -Math.PI / 2; g.add(gwin);
      parts.push({ g: new THREE.BoxGeometry(0.08, 1.9, 0.14).translate(-hw - 0.06, floor + hF + gableRise * 0.42, 0), c: C('#f4f2ec') });
      parts.push({ g: new THREE.BoxGeometry(0.08, 0.14, 0.95).translate(-hw - 0.06, floor + hF + gableRise * 0.42 + 0.35, 0), c: C('#f4f2ec') });
      for (let x = -hw + 1; x <= hw - 0.8; x += 2.8) for (const sz of [-1, 1]) parts.push({ g: new THREE.BoxGeometry(0.3, 0.45, eave + 0.2).translate(x, floor + hF - 0.25, sz * (hd + (eave + 0.2) / 2)), c: beamC });
      const pm = new THREE.Mesh(mergeGeoms(parts), trimMat); pm.castShadow = true; pm.receiveShadow = true; g.add(pm);
      { const [px, pz] = toWorld(b, 5.4, hd + 2.85); box(px, pz, 7.6, 0.25, b.rot); }
      // bell tower: four pale timber posts braced crosswise between two rings, a bronze bell, a low hipped metal cap
      const tw = new THREE.Group(); tw.position.set(-5.2, 0, hd - 1.2); g.add(tw);
      const tp = [], pale = C('#b9a587'), y0t = floor + hF - 0.2, y1t = floor + hF + rise * 0.45 + 0.3, y2t = floor + hF + rise + 2.9, sx = 1.25, sz = 1.25;
      for (const [x, z] of [[-sx, -sz], [sx, -sz], [-sx, sz], [sx, sz]]) tp.push({ g: new THREE.BoxGeometry(0.3, y2t - y0t, 0.3).translate(x, (y0t + y2t) / 2, z), c: pale });
      for (const y of [y1t, y2t - 0.25]) {
        for (const z of [-sz, sz]) tp.push({ g: new THREE.BoxGeometry(2 * sx + 0.3, 0.2, 0.2).translate(0, y, z), c: pale });
        for (const x of [-sx, sx]) tp.push({ g: new THREE.BoxGeometry(0.2, 0.2, 2 * sz + 0.3).translate(x, y, 0), c: pale });
      }
      for (const z of [-sz, sz]) { tp.push(beamPart(-sx, y1t, z, sx, y2t - 0.25, z, 0.14, 0.14, pale)); tp.push(beamPart(sx, y1t, z, -sx, y2t - 0.25, z, 0.14, 0.14, pale)); }
      for (const x of [-sx, sx]) { tp.push(beamPart(x, y1t, -sz, x, y2t - 0.25, sz, 0.14, 0.14, pale)); tp.push(beamPart(x, y1t, sz, x, y2t - 0.25, -sz, 0.14, 0.14, pale)); }
      tp.push({ g: new THREE.BoxGeometry(2 * sx + 0.9, 0.22, 2 * sz + 0.9).translate(0, y2t + 0.05, 0), c: C('#3a2f28') });
      const tm2 = new THREE.Mesh(mergeGeoms(tp), trimMat); tm2.castShadow = true; tm2.receiveShadow = true; tw.add(tm2);
      const capT = new THREE.Mesh(new THREE.ConeGeometry(2.25, 0.75, 4), roofMat('#b9b8b2')); capT.rotation.y = Math.PI / 4; capT.position.y = y2t + 0.53; capT.castShadow = true; tw.add(capT);
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.42, 0.6, 16), new THREE.MeshStandardMaterial({ color: C('#5e4a2c'), metalness: 0.8, roughness: 0.4 })); bell.position.y = y2t - 0.85; bell.castShadow = true; tw.add(bell);
    }
    if (b.walk) {
      // Castle Gymnasium inside (school photos): maple court with red keys, dark glulam arches under a white deck, daylight
      // down the ridge monitor, red wall pads and banners, the HPA crest on the east wall
      const hw = b.w / 2, D2 = hd + eave, yAt = (z) => rise * (1 - (z / D2) * (z / D2)) - rise * 0.06, yc = (z) => hF + yAt(z) - 0.5;
      const court = canvasTex(1024, 896, (c, W2, H2) => {
        const sx = W2 / (b.w - 0.6), sz = H2 / (b.d - 0.6), X = (x) => W2 / 2 + x * sx, Z = (z) => H2 / 2 + z * sz, rr = rng(5);
        c.fillStyle = '#d9a86a'; c.fillRect(0, 0, W2, H2);
        for (let y = 0; y < H2; y += 6) { c.fillStyle = rr() < 0.5 ? 'rgba(120,70,20,0.12)' : 'rgba(255,230,190,0.10)'; c.fillRect(0, y, W2, 3); }
        for (let i = 0; i < 900; i++) { c.fillStyle = 'rgba(110,60,20,0.18)'; c.fillRect(rr() * W2, ((rr() * H2 / 6) | 0) * 6, 2, 6); }
        c.fillStyle = '#b52a2f'; c.fillRect(X(-14), Z(-2.45), 5.8 * sx, 4.9 * sz); c.fillRect(X(8.2), Z(-2.45), 5.8 * sx, 4.9 * sz);
        c.beginPath(); c.arc(X(0), Z(0), 1.8 * sx, 0, 7); c.fill();
        c.strokeStyle = '#ffffff'; c.lineWidth = 4;
        c.strokeRect(X(-14), Z(-7.5), 28 * sx, 15 * sz); c.beginPath(); c.moveTo(X(0), Z(-7.5)); c.lineTo(X(0), Z(7.5)); c.stroke();
        c.beginPath(); c.arc(X(0), Z(0), 1.8 * sx, 0, 7); c.stroke();
        c.beginPath(); c.arc(X(-12.425), Z(0), 6.75 * sx, -Math.PI / 2 + 0.14, Math.PI / 2 - 0.14); c.stroke();
        c.beginPath(); c.arc(X(12.425), Z(0), 6.75 * sx, Math.PI / 2 + 0.14, Math.PI * 1.5 - 0.14); c.stroke();
        c.strokeRect(X(-14), Z(-2.45), 5.8 * sx, 4.9 * sz); c.strokeRect(X(8.2), Z(-2.45), 5.8 * sx, 4.9 * sz);
        c.fillStyle = '#ffffff'; c.font = 'bold 34px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('HPA', X(0), Z(0));
        c.fillStyle = '#b52a2f'; c.font = 'bold 40px Georgia, serif'; c.fillText('KA MAKANI', X(0), Z(-10.2)); c.fillText('KA MAKANI', X(0), Z(10.2));
      });
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(b.w - 0.6, b.d - 0.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: court, roughness: 0.35, metalness: 0.05 }));
      fl.position.y = 0.02; fl.receiveShadow = true; body.add(fl);
      const N = 18, cl = [];
      for (let i = 0; i < N; i++) { const z0 = -hd + b.d * i / N, z1 = -hd + b.d * (i + 1) / N; cl.push([-hw, yc(z0), z0], [hw, yc(z0), z0], [hw, yc(z1), z1], [-hw, yc(z0), z0], [hw, yc(z1), z1], [-hw, yc(z1), z1]); }
      body.add(new THREE.Mesh(triGeo(cl), new THREE.MeshStandardMaterial({ color: C('#f2f0ea'), roughness: 0.9, side: THREE.DoubleSide, emissive: C('#86847e') })));
      const skyStrip = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.84, 3.4).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: C('#eef4f8') })); skyStrip.position.y = yc(0) - 0.03; body.add(skyStrip);
      const parts = [], glu = C('#5c3a24');
      for (let x = -hw + 2.4; x <= hw - 2.3; x += 3.9) for (let i = 0; i < 12; i++) { const z0 = -hd + b.d * i / 12, z1 = -hd + b.d * (i + 1) / 12; parts.push(beamPart(x, yc(z0) - 0.32, z0, x, yc(z1) - 0.32, z1, 0.32, 0.62, glu)); }
      for (const sx of [-1, 1]) { const tri = []; for (let i = 0; i < N; i++) { const z0 = -hd + b.d * i / N, z1 = -hd + b.d * (i + 1) / N; tri.push([sx * hw, hF - 0.05, z0], [sx * hw, hF + yAt(z0) + 0.1, z0], [sx * hw, hF + yAt(z1) + 0.1, z1], [sx * hw, hF - 0.05, z0], [sx * hw, hF + yAt(z1) + 0.1, z1], [sx * hw, hF - 0.05, z1]); } parts.push({ g: triGeo(tri), c: C('#e9e6dd') }); }
      for (let i = 0; i < 5; i++) parts.push({ g: new THREE.BoxGeometry(20, 0.42 * (i + 1), 0.75).translate(-1, 0.21 * (i + 1), -hd + 0.6 + (4 - i) * 0.75), c: i % 2 ? C('#7a2b28') : C('#9a3530') });
      for (const sgn of [-1, 1]) {
        const bx = sgn * 12.8;
        parts.push({ g: new THREE.BoxGeometry(0.06, 1.05, 1.8).translate(bx + sgn * 0.05, 3.4, 0), c: C('#f4f4f2') });
        parts.push({ g: new THREE.BoxGeometry(0.07, 0.45, 0.59).translate(bx, 3.3, 0), c: C('#c03030') });
        parts.push({ g: new THREE.TorusGeometry(0.23, 0.02, 6, 16).rotateX(Math.PI / 2).translate(bx - sgn * 0.38, 3.05, 0), c: C('#e05a1f') });
        parts.push(beamPart(bx + sgn * 0.1, 3.9, 0, bx + sgn * 0.6, yc(0) - 0.6, 0.01, 0.08, 0.08, C('#555555')));
      }
      const pm = new THREE.Mesh(mergeGeoms(parts), trimMat); pm.castShadow = true; pm.receiveShadow = true; body.add(pm);
      const crest = canvasTex(256, 256, (c) => { c.fillStyle = '#b52a2f'; c.beginPath(); c.arc(128, 128, 120, 0, 7); c.fill(); c.fillStyle = '#f4efe2'; c.beginPath(); c.arc(128, 128, 98, 0, 7); c.fill(); c.fillStyle = '#b52a2f'; c.beginPath(); c.moveTo(128, 52); c.lineTo(196, 80); c.lineTo(186, 160); c.lineTo(128, 206); c.lineTo(70, 160); c.lineTo(60, 80); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 44px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('HPA', 128, 128); });
      const cm = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshStandardMaterial({ map: crest, roughness: 0.6, transparent: true })); cm.position.set(hw - 0.2, 4.0, 0); cm.rotation.y = -Math.PI / 2; body.add(cm);
      { const [bx2, bz2] = toWorld(b, -1, -hd + 2.3); box(bx2, bz2, 10, 1.9, b.rot); }
      rooms.push({ x: b.x, z: b.z, rot: b.rot, hw: hw - 0.3, hd: hd - 0.3, y0: y0 + floor, top: hF + 1.2 });
      noVeg.push({ x: b.x, z: b.z, rot: b.rot, hw: hw + 1, hd: hd + 1 });
    }
    if (b.name === 'gpac') {
      // tall stage house behind the hall and a deep entry canopy on posts, as in the drone footage
      const fly = new THREE.Group(); fly.position.set(b.w * 0.18, 0, -b.d * 0.12); g.add(fly);
      const fw = b.w * 0.42, fd = b.d * 0.5, fh = b.h + 6;
      const fwalls = new THREE.Mesh(wallsGeo(fw, fd, fh, fh, fh, fd * 0.3 * 0.5), [wallMat('gym'), wallMat('gym'), wallMat('glass'), wallMat('gym')]); fwalls.castShadow = true; fly.add(fwalls);
      const fr = roofParts('gable', fw, fd, fd * 0.3, 0.8); const ft = new THREE.Mesh(fr.top, roofMat('#efefec')); ft.position.y = fh; ft.castShadow = true; fly.add(ft);
      const ftr = new THREE.Mesh(fr.trim, trimMat); ftr.position.y = fh; fly.add(ftr);
      const can = new THREE.Group(); can.position.set(-b.w * 0.1, 0, b.d / 2); g.add(can);
      const cw = b.w * 0.55, cd = 6;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.35, cd), roofMat('#efefec')); slab.position.set(0, 4.6, cd / 2); slab.castShadow = true; can.add(slab);
      const parts = []; for (let x = -cw / 2 + 0.5; x <= cw / 2; x += 4) parts.push({ g: new THREE.BoxGeometry(0.3, 4.5, 0.3).translate(x, 2.25, cd - 0.4), c: C('#e9e7e1') });
      const pm = new THREE.Mesh(mergeGeoms(parts), trimMat); pm.castShadow = true; can.add(pm);
      const glassFront = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.8, 3.4), wallMat('glass')); glassFront.position.set(0, 1.8, 0.03); can.add(glassFront);
    }
    if (b.label && (b.cls || b.name === 'tech')) {
      // small name plaque on the lava-rock end wall, as on the Modern Language Building by the flags
      const label = b.label;
      const tx = canvasTex(256, 32, (c2, W2, H2) => {
        c2.fillStyle = '#2a2420'; c2.fillRect(0, 0, W2, H2); c2.fillStyle = '#f1ece2'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
        let fs = 19; c2.font = 'bold ' + fs + 'px Arial, sans-serif'; while (fs > 10 && c2.measureText(label).width > W2 - 12) { fs--; c2.font = 'bold ' + fs + 'px Arial, sans-serif'; }
        c2.fillText(label, W2 / 2, H2 / 2 + 1);
      });
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.19), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.6 }));
      plaque.position.set(-b.w / 2 - 0.03, floor + 2.2, -hd * 0.5); plaque.rotation.y = -Math.PI / 2; g.add(plaque);
    }
    scene.add(g);
    const [cx, cz] = toWorld(b, 0, deckDepth / 2);
    if (!b.open && !b.walk && !b.cls) box(cx, cz, b.w / 2 + 0.35, b.d / 2 + deckDepth / 2 + 0.35, b.rot);
    return g;
  }
  BUILDINGS.forEach(building);

  // ---------- Rutgers Tennis Center: walk-in hall with three indoor courts ----------
  // Outside: cream vertical panels, a tall asymmetric gable roof in dark metal with red-brown trim,
  // a lattice screen with the tree emblem up in the gable, and a low covered entry with a lattice band.
  // Inside: white steel trusses, skylight strips and lights, green courts, blue wainscot and dark green curtains.
  const tennis = { x: TENNIS.x, z: TENNIS.z, rot: TENNIS.rot, hw: TENNIS.hw, hd: TENNIS.hd, floorY: 0, courts: [-18.3, 0, 18.3], netH: 0.914 };
  (function tennisCenter() {
    const T = TENNIS, y0 = groundH(T.x, T.z) + 0.06; tennis.floorY = y0;
    const g = new THREE.Group(); g.position.set(T.x, y0, T.z); g.rotation.y = T.rot; scene.add(g);
    const hw = T.hw, hd = T.hd, E = T.eave, RH = T.ridge, RZ = T.ridgeZ;
    const panelTex = canvasTex(256, 256, (c, W2, H2) => {
      c.fillStyle = '#dcd6c2'; c.fillRect(0, 0, W2, H2);
      for (let x = 0; x < W2; x += 16) { c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(x, 0, 2, H2); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(x + 2, 0, 2, H2); }
      c.fillStyle = 'rgba(80,70,50,0.25)'; c.fillRect(0, H2 - 10, W2, 10);
    });
    panelTex.repeat.set(hw / 2, 1.5);
    const wallMatT = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.75 });
    const trimRed = new THREE.MeshStandardMaterial({ color: C('#7a3d2f'), roughness: 0.7 });
    const add = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || g).add(m); return m; };
    const wallBox = (lx, lz, sx, sz, h, mat) => { add(new THREE.BoxGeometry(sx, h, sz), mat || wallMatT, lx, h / 2, lz); const [wx, wz] = toWorld(T, lx, lz); box(wx, wz, sx / 2 + 0.05, sz / 2 + 0.05, T.rot); };
    // long walls (north/south) and end walls with a 3.4 m doorway in each end
    wallBox(0, -hd, hw * 2, 0.3, E); wallBox(0, hd, hw * 2, 0.3, E);
    for (const sx of [-1, 1]) {
      wallBox(sx * hw, -(hd + 1.7) / 2, 0.3, hd - 1.7, E); wallBox(sx * hw, (hd + 1.7) / 2, 0.3, hd - 1.7, E);
      add(new THREE.BoxGeometry(0.3, E - 3, 3.4), wallMatT, sx * hw, 3 + (E - 3) / 2, 0);
    }
    // gable triangles above the end walls (asymmetric ridge)
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape(); sh.moveTo(-hd, 0); sh.lineTo(hd, 0); sh.lineTo(RZ, RH - E); sh.closePath();
      const gm = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.75, side: THREE.DoubleSide }));
      gm.rotation.y = -Math.PI / 2; gm.position.set(sx * hw, E, 0); gm.castShadow = true; g.add(gm);
    }
    // roof: two metal slopes (dark outside), white ceiling with skylight strips inside
    const ov = 0.9, kA = (RH - E) / (RZ + hd), kB = (RH - E) / (hd - RZ);
    const zA = -hd - ov, yA = E - kA * ov, zB = hd + ov, yB = E - kB * ov, Wr = hw + ov;
    const slopes = [[[Wr, yA, zA], [-Wr, yA, zA], [-Wr, RH, RZ], [Wr, RH, RZ]], [[-Wr, yB, zB], [Wr, yB, zB], [Wr, RH, RZ], [-Wr, RH, RZ]]]; // both wound to face up and out
    const roofTop = [], ceiling = [];
    for (const q of slopes) {
      roofTop.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      const d = q.map((v) => [v[0], v[1] - 0.25, v[2]]);
      ceiling.push(d[0], d[1], d[2], d[0], d[2], d[3]);
    }
    const metal = new THREE.MeshStandardMaterial({ color: C('#5c6064'), map: seamTex, roughness: 0.5, metalness: 0.35 });
    add(triGeo(roofTop, 0.5), metal, 0, 0, 0);
    const skyTex = canvasTex(64, 256, (c, W2, H2) => { c.fillStyle = '#e9ebec'; c.fillRect(0, 0, W2, H2); c.fillStyle = 'rgba(0,0,0,0.08)'; for (let y = 0; y < H2; y += 16) c.fillRect(0, y, W2, 2); c.fillStyle = '#f9fbff'; c.fillRect(18, 0, 28, H2); });
    const ceilGeo = triGeo(ceiling); { const pa = ceilGeo.attributes.position, uv = []; for (let i = 0; i < pa.count; i++) uv.push(pa.getX(i) / 6, pa.getZ(i) / 6); ceilGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); }
    add(ceilGeo, new THREE.MeshStandardMaterial({ map: skyTex, side: THREE.BackSide, roughness: 0.8, emissive: C('#8a8d90') }), 0, 0, 0);
    // red-brown fascia along the eaves and rakes
    add(new THREE.BoxGeometry(Wr * 2, 0.4, 0.15), trimRed, 0, yA - 0.2, zA);
    add(new THREE.BoxGeometry(Wr * 2, 0.4, 0.15), trimRed, 0, yB - 0.2, zB);
    for (const sx of [-1, 1]) for (const [za, ya] of [[zA, yA], [zB, yB]]) {
      const L = Math.hypot(RZ - za, RH - ya), r = add(new THREE.BoxGeometry(0.15, 0.4, L), trimRed, sx * Wr, (ya + RH) / 2 - 0.15, (za + RZ) / 2);
      r.rotation.x = -Math.atan2(RH - ya, RZ - za);
    }
    // white steel trusses every 6 m
    const steel = [], white = C('#f1f2f2');
    const beam = (a, b, t) => { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz); const geo = new THREE.BoxGeometry(t, t * 1.6, L); geo.rotateX(-Math.atan2(dy, Math.hypot(dx, dz))); geo.rotateY(Math.atan2(dx, dz)); geo.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); steel.push({ g: geo, c: white }); };
    for (let x = -hw + 3; x <= hw - 2; x += 6) {
      beam([x, E - 0.4, -hd + 0.4], [x, RH - 0.5, RZ], 0.35);
      beam([x, RH - 0.5, RZ], [x, E - 0.4, hd - 0.4], 0.35);
      beam([x, 0, -hd + 0.4], [x, E - 0.4, -hd + 0.4], 0.4);
      beam([x, 0, hd - 0.4], [x, E - 0.4, hd - 0.4], 0.4);
      beam([x, E - 2.2, -hd + 0.4], [x, E + 1.0, -hd + 6], 0.22);
      beam([x, E - 2.2, hd - 0.4], [x, E + 0.6, hd - 6], 0.22);
    }
    for (const z of [-hd + 8, RZ - 1, hd - 7]) beam([-hw + 0.5, z < RZ ? E + (z + hd) * kA - 0.7 : E + (hd - z) * kB - 0.7, z], [hw - 0.5, z < RZ ? E + (z + hd) * kA - 0.7 : E + (hd - z) * kB - 0.7, z], 0.2);
    const sm = new THREE.Mesh(mergeGeoms(steel), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 })); sm.receiveShadow = true; g.add(sm);
    // light fixtures under the roof
    const lights = [];
    for (let x = -hw + 4; x < hw - 3; x += 6) for (const z of [-14, -6, 2, 10, 16]) {
      const y = (z < RZ ? E + (z + hd) * kA : E + (hd - z) * kB) - 0.75;
      lights.push({ g: new THREE.BoxGeometry(2.6, 0.12, 0.45).translate(x, y, z), c: C('#ffffff') });
    }
    g.add(new THREE.Mesh(mergeGeoms(lights), new THREE.MeshBasicMaterial({ vertexColors: true })));
    for (const x of [-20, 0, 20]) { const pl = new THREE.PointLight(0xfff6e8, 0.9, 60, 1.6); pl.position.set(x, RH - 2.5, 0); g.add(pl); }
    // floor: three courts with white lines on a darker green surround
    const fpx = 26;
    const floorTex = canvasTex(Math.round(hw * 2 * fpx), Math.round(hd * 2 * fpx), (c, W2, H2) => {
      c.translate(W2 / 2, H2 / 2); c.scale(fpx, fpx);
      c.fillStyle = '#356b52'; c.fillRect(-hw, -hd, hw * 2, hd * 2);
      for (const cx of tennis.courts) {
        c.fillStyle = '#4c8a63'; c.fillRect(cx - 5.49 - 1.2, -11.885 - 3, 10.97 + 2.4, 23.77 + 6);
        c.strokeStyle = '#f4f4f0'; c.lineWidth = 0.06;
        c.strokeRect(cx - 5.485, -11.885, 10.97, 23.77);
        c.strokeRect(cx - 4.115, -11.885, 8.23, 23.77);
        c.beginPath(); c.moveTo(cx - 4.115, -6.4); c.lineTo(cx + 4.115, -6.4); c.moveTo(cx - 4.115, 6.4); c.lineTo(cx + 4.115, 6.4); c.moveTo(cx, -6.4); c.lineTo(cx, 6.4);
        c.moveTo(cx, -11.885); c.lineTo(cx, -11.6); c.moveTo(cx, 11.885); c.lineTo(cx, 11.6); c.stroke();
      }
      c.fillStyle = '#3b86b6'; c.fillRect(-hw, -hd, hw * 2, 0.6); c.fillRect(-hw, hd - 0.6, hw * 2, 0.6);
    });
    floorTex.wrapS = floorTex.wrapT = THREE.ClampToEdgeWrapping;
    const fl = add(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }), 0, 0.02, 0);
    fl.castShadow = false;
    // blue wainscot inside the walls
    const blue = new THREE.MeshStandardMaterial({ color: C('#3b86b6'), roughness: 0.7, side: THREE.DoubleSide });
    for (const [w, x, z, ry] of [[hw * 2 - 0.6, 0, -hd + 0.2, 0], [hw * 2 - 0.6, 0, hd - 0.2, Math.PI]]) { const m = add(new THREE.PlaneGeometry(w, 1.8), blue, x, 0.9, z); m.rotation.y = ry; m.castShadow = false; }
    // nets
    const netTex = canvasTex(64, 64, (c) => { c.strokeStyle = 'rgba(20,20,20,0.9)'; c.lineWidth = 2; for (let i = 0; i <= 64; i += 6) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 64); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(64, i); c.stroke(); } });
    netTex.repeat.set(30, 3);
    const netMat = new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1 });
    const postMatT = new THREE.MeshStandardMaterial({ color: C('#2c3a33'), roughness: 0.5, metalness: 0.5 });
    for (const cx of tennis.courts) {
      add(new THREE.PlaneGeometry(12.8, 0.9), netMat, cx, 0.5, 0);
      add(new THREE.BoxGeometry(12.8, 0.06, 0.04), new THREE.MeshStandardMaterial({ color: C('#f4f4f0') }), cx, 0.94, 0);
      for (const sx of [-6.4, 6.4]) { add(new THREE.CylinderGeometry(0.05, 0.05, 1.07, 8), postMatT, cx + sx, 0.535, 0); const [wx, wz] = toWorld(T, cx + sx, 0); colliders.circles.push({ x: wx, z: wz, r: 0.2 }); }
      const [nx, nz] = toWorld(T, cx, 0); box(nx, nz, 6.4, 0.08, T.rot);
      // umpire-style bench by each net
      const bn = add(new THREE.BoxGeometry(1.6, 0.45, 0.45), new THREE.MeshStandardMaterial({ color: C('#9a6b45'), roughness: 0.8 }), cx + 7.6, 0.22, 1.2);
    }
    // covered entry along the west end: dark lean-to roof, lattice band with the name
    const ent = new THREE.Group(); ent.position.set(-hw, 0, 0); g.add(ent);
    const roofE = add(new THREE.BoxGeometry(5.4, 0.18, 34), metal, -2.7, 3.7, 0, ent); roofE.rotation.z = 0.12;
    add(new THREE.BoxGeometry(0.15, 0.35, 34), trimRed, -5.4, 3.35, 0, ent);
    for (let z = -16; z <= 16; z += 8) { add(new THREE.BoxGeometry(0.25, 3.2, 0.25), trimRed, -5.2, 1.6, z, ent); const [wx, wz] = toWorld(T, -hw - 5.2, z); colliders.circles.push({ x: wx, z: wz, r: 0.25 }); }
    const latTex = canvasTex(128, 32, (c, W2, H2) => { c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, W2, H2); c.fillStyle = '#6e5b4c'; for (let x = 0; x < W2; x += 8) c.fillRect(x, 0, 3, H2); for (let y = 0; y < H2; y += 8) c.fillRect(0, y, W2, 3); });
    latTex.repeat.set(14, 1);
    const latMat = new THREE.MeshStandardMaterial({ map: latTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
    const band = add(new THREE.PlaneGeometry(34, 1.0), latMat, -5.45, 2.75, 0, ent); band.rotation.y = -Math.PI / 2;
    const nameTex = canvasTex(1024, 96, (c, W2, H2) => { c.clearRect(0, 0, W2, H2); c.fillStyle = '#f4f2ec'; c.font = 'bold 64px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Rutgers Tennis Center', W2 / 2, H2 / 2); });
    const nm = add(new THREE.PlaneGeometry(9, 0.85), new THREE.MeshBasicMaterial({ map: nameTex, transparent: true }), -5.55, 2.75, 8, ent); nm.rotation.y = -Math.PI / 2; nm.castShadow = false;
    // lattice screen with the tree emblem high in the west gable
    const scr = new THREE.Group(); scr.position.set(-hw - 0.35, 0, RZ - 1); scr.rotation.y = -Math.PI / 2; g.add(scr);
    const shp = new THREE.Shape(); shp.moveTo(-2.2, RH - 6.5); shp.lineTo(2.2, RH - 6.5); shp.lineTo(3.4, RH + 1.2); shp.lineTo(-3.4, RH + 1.2); shp.closePath();
    const lt2 = latTex.clone(); lt2.needsUpdate = true; lt2.repeat.set(0.9, 1.6);
    const screenGeo = new THREE.ShapeGeometry(shp); { const pa = screenGeo.attributes.position, uv = []; for (let i = 0; i < pa.count; i++) uv.push(pa.getX(i) / 1.2, pa.getY(i) / 1.2); screenGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); }
    add(screenGeo, new THREE.MeshStandardMaterial({ map: lt2, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }), 0, 0, 0, scr);
    const logoTex = canvasTex(128, 128, (c) => {
      c.clearRect(0, 0, 128, 128); c.fillStyle = '#e9ece9'; c.beginPath(); c.arc(64, 64, 56, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3b4a44'; c.fillRect(60, 64, 8, 40);
      for (let i = 0; i < 14; i++) { const a = -Math.PI + i / 13 * Math.PI; c.beginPath(); c.arc(64 + Math.cos(a) * 30, 56 + Math.sin(a) * 26, 12, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = '#3b4a44'; c.lineWidth = 4; c.beginPath(); c.arc(64, 112, 40, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    });
    const logo = add(new THREE.CircleGeometry(1.5, 32), new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, roughness: 0.6 }), 0, RH - 2.4, 0.05, scr); logo.castShadow = false;
  })();

  // ---------- Dowsett Pool (from the HPA swim video) ----------
  // 9-lane 25 m pool dug 1.9 m deep: white tile with black lane lines, pink-and-black lane ropes,
  // backstroke pennants, white starting blocks and lifeguard tower, a covered seating side with a
  // sky-blue wall, a low white wall round the deck and a curved lava-rock retaining wall below it.
  const pool = { x: POOL.x, z: POOL.z, rot: POOL.rot, hw: POOL.WL / 2, hd: POOL.WW / 2, y: 0, depth: POOL.depth };
  let waterTexRef = null;
  (function dowsettPool() {
    const y = groundH(POOL.x, POOL.z); pool.y = y + 0.06;
    const g = new THREE.Group(); g.position.set(POOL.x, y, POOL.z); g.rotation.y = POOL.rot; scene.add(g);
    const { WL, WW, DL, DW } = POOL, Dp = POOL.depth;
    const add = (geo, mat, x, yy, z, cast) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, yy, z); m.castShadow = !!cast; m.receiveShadow = true; g.add(m); return m; };
    // deck with the pool cut out
    const deckShape = new THREE.Shape(); deckShape.moveTo(-DL / 2, -DW / 2); deckShape.lineTo(DL / 2, -DW / 2); deckShape.lineTo(DL / 2, DW / 2); deckShape.lineTo(-DL / 2, DW / 2); deckShape.closePath();
    const hole = new THREE.Path(); hole.moveTo(-WL / 2, -WW / 2); hole.lineTo(-WL / 2, WW / 2); hole.lineTo(WL / 2, WW / 2); hole.lineTo(WL / 2, -WW / 2); hole.closePath(); deckShape.holes.push(hole);
    add(new THREE.ShapeGeometry(deckShape).rotateX(-Math.PI / 2), overlayMat(roadTex.path, { color: C('#ece8de') }), 0, 0.12, 0);
    // basin: tiled walls and floor with lane lines
    const tile = new THREE.MeshStandardMaterial({ color: C('#d8f1f6'), roughness: 0.4 });
    for (const [w, d, x, z] of [[WL, 0.2, 0, WW / 2 + 0.1], [WL, 0.2, 0, -WW / 2 - 0.1], [0.2, WW, WL / 2 + 0.1, 0], [0.2, WW, -WL / 2 - 0.1, 0]]) add(new THREE.BoxGeometry(w, Dp + 0.15, d), tile, x, 0.13 - (Dp + 0.15) / 2, z);
    const floorTex = canvasTex(1000, 720, (c, W2, H2) => {
      c.fillStyle = '#9fe6f2'; c.fillRect(0, 0, W2, H2);
      c.strokeStyle = 'rgba(120,170,185,0.35)'; c.lineWidth = 1; for (let x = 0; x < W2; x += 10) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H2); c.stroke(); } for (let yy = 0; yy < H2; yy += 10) { c.beginPath(); c.moveTo(0, yy); c.lineTo(W2, yy); c.stroke(); }
      const sx = W2 / WL, sz = H2 / WW; c.fillStyle = '#1b2430';
      for (let i = 0; i < 9; i++) { const zc = (i + 0.5) * 2 * sz; c.fillRect(2 * sx, zc - 0.12 * sz, (WL - 4) * sx, 0.25 * sz); c.fillRect(2 * sx, zc - 0.5 * sz, 0.25 * sx, 1 * sz); c.fillRect((WL - 2.25) * sx, zc - 0.5 * sz, 0.25 * sx, 1 * sz); }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.ClampToEdgeWrapping;
    add(new THREE.PlaneGeometry(WL, WW).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }), 0, 0.12 - Dp, 0);
    // water: clear turquoise with drifting caustic sparkle
    waterTexRef = canvasTex(256, 256, (c, W2, H2) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, W2, H2);
      const r = rng(31); c.lineWidth = 2;
      for (let i = 0; i < 160; i++) { c.strokeStyle = 'rgba(160,230,245,' + (0.25 + r() * 0.4) + ')'; c.beginPath(); const x = r() * W2, yy = r() * H2; c.moveTo(x, yy); c.bezierCurveTo(x + 12, yy - 8, x + 22, yy + 8, x + 36, yy); c.stroke(); }
    });
    waterTexRef.repeat.set(5, 4);
    add(new THREE.PlaneGeometry(WL, WW).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: C('#13c3e0'), map: waterTexRef, roughness: 0.05, metalness: 0.1, emissive: C('#05414d'), transparent: true, opacity: 0.72, depthWrite: false }), 0, 0.05, 0);
    const coping = new THREE.MeshStandardMaterial({ color: C('#f4f2ec'), roughness: 0.6 });
    for (const [w, d, x, z] of [[WL + 0.8, 0.4, 0, WW / 2 + 0.2], [WL + 0.8, 0.4, 0, -WW / 2 - 0.2], [0.4, WW, WL / 2 + 0.2, 0], [0.4, WW, -WL / 2 - 0.2, 0]]) add(new THREE.BoxGeometry(w, 0.12, d), coping, x, 0.16, z);
    // lane ropes: pink floats with black ends
    const pink = new THREE.MeshStandardMaterial({ color: C('#e5417a'), roughness: 0.5 }), black = new THREE.MeshStandardMaterial({ color: C('#1c1c20'), roughness: 0.5 });
    for (let i = 1; i < 9; i++) {
      const zc = -WW / 2 + i * 2;
      const mid = add(new THREE.CylinderGeometry(0.06, 0.06, WL - 6, 8), pink, 0, 0.07, zc); mid.rotation.z = Math.PI / 2;
      for (const sx of [-1, 1]) { const e = add(new THREE.CylinderGeometry(0.06, 0.06, 3, 8), black, sx * (WL / 2 - 1.5), 0.07, zc); e.rotation.z = Math.PI / 2; }
    }
    // starting blocks
    for (let i = 0; i < 9; i++) {
      const zc = -WW / 2 + (i + 0.5) * 2;
      add(new THREE.BoxGeometry(0.7, 0.75, 0.55), coping, WL / 2 + 0.75, 0.5, zc, true).rotation.z = 0.1;
      add(new THREE.BoxGeometry(0.06, 0.5, 0.06), coping, WL / 2 + 1.05, 1.0, zc - 0.22);
    }
    // backstroke pennants 5 m from each wall
    const flagParts = [], cols = [C('#d9262f'), C('#f4f4f2'), C('#2a56b8')];
    for (const sx of [-1, 1]) {
      const fx = sx * (WL / 2 - 5);
      for (const zz of [-WW / 2 - 1.2, WW / 2 + 1.2]) flagParts.push({ g: new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6).translate(fx, 1.1, zz), c: C('#e9e9e6') });
      for (let k = 0; k < 26; k++) {
        const zz = -WW / 2 - 1 + k * (WW + 2) / 26, t = new THREE.BufferGeometry();
        t.setAttribute('position', new THREE.Float32BufferAttribute([fx, 2.1, zz, fx, 2.1, zz + 0.35, fx, 1.85, zz + 0.17], 3)); t.computeVertexNormals();
        flagParts.push({ g: t, c: cols[k % 3] });
      }
    }
    const fm = new THREE.Mesh(mergeGeoms(flagParts), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 })); g.add(fm);
    // white lifeguard tower at a deck corner
    const tw = new THREE.Group(); tw.position.set(-WL / 2 - 2, 0, WW / 2 + 2.2); g.add(tw);
    for (const [x, z] of [[-0.45, -0.4], [0.45, -0.4], [-0.45, 0.4], [0.45, 0.4]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.1), coping); l.position.set(x, 0.9, z); l.castShadow = true; tw.add(l); }
    const seatT = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 1.0), coping); seatT.position.y = 1.8; tw.add(seatT);
    const backT = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.1), coping); backT.position.set(0, 2.25, 0.45); tw.add(backT);
    { const [wx, wz] = toWorld(POOL, -WL / 2 - 2, WW / 2 + 2.2); colliders.circles.push({ x: wx, z: wz, r: 0.7 }); }
    // covered seating along the -z side: sky-blue wall with the flag and the Olympic rings, white awning, benches
    const sky = new THREE.MeshStandardMaterial({ color: C('#a9d7ec'), roughness: 0.8 });
    const zW = -DW / 2 + 0.3;
    add(new THREE.BoxGeometry(DL - 2, 3.2, 0.3), sky, 0, 1.6, zW, true);
    const awn = add(new THREE.BoxGeometry(DL - 2, 0.15, 4.2), new THREE.MeshStandardMaterial({ color: C('#f2f1ec'), roughness: 0.5 }), 0, 3.1, zW + 2.1, true); awn.rotation.x = 0.08;
    for (let x = -DL / 2 + 2; x <= DL / 2 - 2; x += 5) { add(new THREE.BoxGeometry(0.18, 3, 0.18), coping, x, 1.5, zW + 4.0, true); const [wx, wz] = toWorld(POOL, x, zW + 4.0); colliders.circles.push({ x: wx, z: wz, r: 0.2 }); }
    const benchM = new THREE.MeshStandardMaterial({ color: C('#d9d6cc'), roughness: 0.7 });
    for (const zz of [zW + 1.0, zW + 2.2]) add(new THREE.BoxGeometry(DL - 6, 0.45 + (zz - zW) * 0.2, 0.5), benchM, 0, 0.22 + (zz - zW) * 0.1, zz, true);
    const usTex = canvasTex(190, 100, (c) => { for (let i = 0; i < 13; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#b22234'; c.fillRect(0, i * 100 / 13, 190, 100 / 13 + 1); } c.fillStyle = '#3c3b6e'; c.fillRect(0, 0, 76, 54); c.fillStyle = '#fff'; for (let r = 0; r < 9; r++) for (let k = 0; k < (r % 2 ? 5 : 6); k++) { c.beginPath(); c.arc(6.3 + k * 12.6 + (r % 2 ? 6.3 : 0), 4 + r * 5.8, 1.6, 0, 7); c.fill(); } });
    add(new THREE.PlaneGeometry(2.2, 1.16), new THREE.MeshStandardMaterial({ map: usTex, roughness: 0.8 }), -9, 2.2, zW + 0.16);
    const ringTex = canvasTex(256, 128, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 128); c.lineWidth = 7; [['#0081c8', 60, 50], ['#000000', 128, 50], ['#ee334e', 196, 50], ['#fcb131', 94, 80], ['#00a651', 162, 80]].forEach(([col, x, yy]) => { c.strokeStyle = col; c.beginPath(); c.arc(x, yy, 30, 0, Math.PI * 2); c.stroke(); }); });
    add(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.8 }), -5.6, 2.2, zW + 0.16);
    { const [wx, wz] = toWorld(POOL, 0, zW); box(wx, wz, DL / 2 - 1, 0.3, POOL.rot); }
    // low white wall round the deck (opening on the +x end) and a curved lava-rock retaining wall below
    const lowWall = new THREE.MeshStandardMaterial({ color: C('#eef3f4'), roughness: 0.7 });
    const wallSeg = (x, z, w, d) => { add(new THREE.BoxGeometry(w, 1.1, d), lowWall, x, 0.55, z, true); const [wx, wz] = toWorld(POOL, x, z); box(wx, wz, w / 2 + 0.05, d / 2 + 0.05, POOL.rot); };
    wallSeg(0, DW / 2, DL, 0.25); wallSeg(-DL / 2, 0, 0.25, DW);
    wallSeg(DL / 2, -DW / 4 - 1.5, 0.25, DW / 2 - 3); wallSeg(DL / 2, DW / 4 + 1.5, 0.25, DW / 2 - 3);
    const stone = wallMat('stone');
    for (let k = 0; k <= 14; k++) {
      const a = -0.9 + k / 14 * 1.8, R0 = DW / 2 + 9, cx = Math.sin(a) * (DL / 2 + 6), cz = DW / 2 + 1.8 + (1 - Math.cos(a)) * 1.5;
      const sg = add(new THREE.BoxGeometry(3.4, 1.4, 0.6), stone, cx, -0.4, cz, true); sg.rotation.y = -a * 0.25;
      void R0;
    }
    // pump house just outside the deck
    { const [hx, hz] = toWorld(POOL, DL / 2 + 6, -6); building({ x: hx, z: hz, w: 9, d: 6.5, h: 3.2, rot: POOL.rot, wall: 'white', roof: 'hip', rise: 0.25, roofColor: '#9c9fa3' }); }
  })();
  const inPool = (x, z) => { const [lx, lz] = toLocal(pool, x, z); return Math.abs(lx) < pool.hw - 0.25 && Math.abs(lz) < pool.hd - 0.25; };

  // ---------- Kennedy Square: on the plateau between the library, Taylor Commons and the union, at the union's floor ----------
  // red solar-panel trees, red expanded-metal tables (some under blue umbrellas), a yellow shade sail off Upper Taylor
  (function kennedySquare() {
    const y = PLATEAU_Y;
    const pave = canvasTex(256, 256, (c, W2, H2) => {
      c.fillStyle = '#cfcac0'; c.fillRect(0, 0, W2, H2);
      const r = rng(77); for (let i = 0; i < 2500; i++) { c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'; c.fillRect(r() * W2, r() * H2, 2, 2); }
      c.fillStyle = 'rgba(70,64,58,0.55)'; c.fillRect(0, 0, W2, 3); c.fillRect(0, 0, 3, H2);
    });
    const slab = (cx, cz, w, d) => {
      const t = pave.clone(); t.needsUpdate = true; t.repeat.set(w / 1.5, d / 1.5);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), overlayMat(t, { roughness: 0.9 })); m.position.set(cx, y + 0.03, cz); m.receiveShadow = true; scene.add(m);
    };
    slab(205.55, -101.3, 17.5, 16.2);   // the square
    slab(200.35, -90.9, 27.9, 4.6);     // along the union's north front
    slab(212.3, -84.3, 5.4, 8.6);       // passage to the stair down to the store
    slab(192.0, -97.6, 9.6, 8.8);       // past the library's east wing
    const red = C('#c8202c'), pm = panelMatFor(2.4, 1.6);
    const sunTree = (x, z, rr, arms, sc) => {
      const parts = [], t = new THREE.Group(); t.position.set(x, y, z); t.rotation.y = rr; t.scale.setScalar(sc); scene.add(t);
      parts.push({ g: new THREE.CylinderGeometry(0.2, 0.27, 3.5, 12).translate(0, 1.75, 0), c: red });
      parts.push({ g: new THREE.CylinderGeometry(0.32, 0.2, 0.45, 12).translate(0, 3.6, 0), c: red });
      for (let k = 0; k < arms; k++) {
        const a = k / arms * Math.PI * 2 + Math.PI / 4, ex = Math.cos(a), ez = Math.sin(a);
        parts.push(beamPart(ex * 0.15, 3.6, ez * 0.15, ex * 1.35, 4.35, ez * 1.35, 0.17, 0.17, red));
        const pn = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.07, 1.6), pm); pn.position.set(ex * 1.75, 4.5, ez * 1.75); pn.rotation.set(0, -a, 0.16); pn.castShadow = true; t.add(pn);
      }
      const m = new THREE.Mesh(mergeGeoms(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3 })); m.castShadow = true; t.add(m);
      colliders.circles.push({ x, z, r: 0.4 * sc });
    };
    sunTree(202.4, -100.2, 0.2, 4, 1.0); sunTree(209.3, -96.6, 0.9, 4, 1.0); sunTree(205.2, -106.2, 0.5, 3, 0.85);
    const lt = longTableGeo(), umb = new THREE.MeshStandardMaterial({ color: C('#2f64b0'), roughness: 0.7, side: THREE.DoubleSide });
    [[198.8, -104.4, 0.2, 1], [199.3, -96.8, 0, 0], [203.6, -94.9, -0.3, 0], [207.2, -102.8, 0.4, 1], [212.0, -102.2, 0, 0], [212.3, -95.4, 0.3, 1], [206.4, -99.2, 1.4, 0], [201.2, -108.0, 0, 0], [210.6, -107.4, -0.2, 0]].forEach(([x, z, rr, u]) => {
      const m = new THREE.Mesh(lt, trimMat); m.position.set(x, y + 0.03, z); m.rotation.y = rr; m.castShadow = true; m.receiveShadow = true; scene.add(m);
      box(x, z, 1.0, 0.85, rr);
      if (u) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6), new THREE.MeshStandardMaterial({ color: C('#d8d8d8'), metalness: 0.6, roughness: 0.4 })); pole.position.set(x, y + 1.15, z); scene.add(pole);
        const c = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.5, 8, 1, true), umb); c.position.set(x, y + 2.35, z); c.castShadow = true; scene.add(c);
      }
    });
    // shade sail from the wall of Upper Taylor Commons to two poles
    const sp = [[199.0, y + 4.0, -109.6], [213.0, y + 4.2, -109.6], [211.6, y + 3.0, -104.8], [200.4, y + 2.9, -104.2]];
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute([...sp[0], ...sp[1], ...sp[2], ...sp[0], ...sp[2], ...sp[3]], 3)); sg.computeVertexNormals();
    const sail = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: C('#e9c25a'), roughness: 0.8, side: THREE.DoubleSide })); sail.castShadow = true; scene.add(sail);
    for (const q of [sp[2], sp[3]]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, q[1] - y + 0.3, 8), new THREE.MeshStandardMaterial({ color: C('#8c8f93'), metalness: 0.6, roughness: 0.4 })); pl.position.set(q[0], (q[1] + y + 0.3) / 2, q[2]); pl.castShadow = true; scene.add(pl); colliders.circles.push({ x: q[0], z: q[2], r: 0.2 }); }
    // lava-rock planters on the library side
    for (const [x, z, w, d] of [[197.4, -105.5, 0.6, 6], [197.4, -96.8, 0.6, 3.4]]) {
      const lw = new THREE.Mesh(uvBox(new THREE.BoxGeometry(w, 0.65, d), [w, 0.65, d], 8, 4), wallMat('stone')); lw.position.set(x, y + 0.32, z); lw.castShadow = true; scene.add(lw); box(x, z, w / 2, d / 2, 0);
    }
  })();

  // ---------- Taylor Commons dining hall ----------
  // A low hip roof with solar panels on its west slope rises to a long glazed lantern; inside, white beams climb the board
  // ceiling to the skylight over lava-rock walls, a polished concrete floor and wooden serving islands. The hall opens west
  // onto Kennedy Square; on the downhill side its basement storey shows under a deck with cable rails.
  (function diningHall() {
    const Dh = DINING, yU = PLATEAU_Y, hw = Dh.hw, hd = Dh.hd, hW = 3.6, RC = 3.4, lw = 7.2, ld = 2.4, yC = yU + hW + RC;
    const g = new THREE.Group(); g.position.set(Dh.x, 0, Dh.z); scene.add(g);
    const add = (geo, mat, x, y, z, shadow) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; } g.add(m); return m; };
    const lowH = yU - Y_LOW + 1.0;
    add(wallsGeo(2 * hw, 2 * hd, lowH, lowH, 4, 0), [wallMat('wood'), wallMat('stone'), wallMat('glass'), wallMat('stone')], 0, Y_LOW - 1.0, 0);
    const out = wallMat('wood'), inn = wallMat('stone');
    wallLine(Dh, g, 'x', -hw, hw, -hd, -1, yU, hW, 0.35, out, inn, []);
    wallLine(Dh, g, 'x', -hw, hw, hd, 1, yU, hW, 0.35, out, inn, [[-8, 2.4, 2.6]]);
    wallLine(Dh, g, 'z', -hd, hd, -hw, -1, yU, hW, 0.35, out, inn, [[-9.5, 3.4, 2.8], [3, 2.4, 2.6]]);
    wallLine(Dh, g, 'z', -hd, hd, hw, 1, yU, hW, 0.35, out, inn, [[0, 2.4, 2.6]]);
    // polished concrete floor
    const flTex = canvasTex(512, 512, (c, W2, H2) => {
      c.fillStyle = '#8f8c86'; c.fillRect(0, 0, W2, H2); const r = rng(12);
      for (let i = 0; i < 140; i++) { const gr = c.createRadialGradient(r() * W2, r() * H2, 2, r() * W2, r() * H2, 40 + r() * 80); gr.addColorStop(0, r() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(40,36,32,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, W2, H2); }
      c.fillStyle = 'rgba(30,28,26,0.35)'; c.fillRect(0, 0, W2, 2); c.fillRect(0, 0, 2, H2);
    });
    flTex.repeat.set(hw / 3, hd / 3);
    add(new THREE.PlaneGeometry(2 * hw - 0.2, 2 * hd - 0.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: flTex, roughness: 0.22, metalness: 0.15 }), 0, yU + 0.02, 0, false).receiveShadow = true;
    // the hip ceiling (board, white beams) rises to the lantern
    const trap = (X, Z, yb, x, z, yt) => [
      [-X, yb, Z], [X, yb, Z], [x, yt, z], [-X, yb, Z], [x, yt, z], [-x, yt, z],
      [X, yb, -Z], [-X, yb, -Z], [-x, yt, -z], [X, yb, -Z], [-x, yt, -z], [x, yt, -z],
      [X, yb, Z], [X, yb, -Z], [x, yt, -z], [X, yb, Z], [x, yt, -z], [x, yt, z],
      [-X, yb, -Z], [-X, yb, Z], [-x, yt, z], [-X, yb, -Z], [-x, yt, z], [-x, yt, -z]];
    const board = canvasTex(256, 256, (c, W2, H2) => { c.fillStyle = '#a8957c'; c.fillRect(0, 0, W2, H2); const r = rng(9); for (let y2 = 0; y2 < H2; y2 += 16) { c.fillStyle = 'rgba(40,30,20,0.35)'; c.fillRect(0, y2, W2, 2); for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(255,240,220,0.06)'; c.fillRect(r() * W2, y2 + 3 + r() * 10, 40 + r() * 70, 2); } } });
    add(triGeo(trap(hw, hd, yU + hW, lw, ld, yC), 0.25), new THREE.MeshStandardMaterial({ map: board, roughness: 0.85, side: THREE.DoubleSide, emissive: C('#4a4136') }), 0, 0, 0, false);
    const parts = [], whiteC = C('#f1efe8');
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(beamPart(sx * hw, yU + hW - 0.15, sz * hd, sx * lw, yC - 0.15, sz * ld, 0.3, 0.38, whiteC));
    for (let i = 1; i < 9; i++) { const t = i / 9; for (const sz of [1, -1]) parts.push(beamPart(-hw + 2 * hw * t, yU + hW - 0.15, sz * hd, -lw + 2 * lw * t, yC - 0.15, sz * ld, 0.22, 0.3, whiteC)); }
    for (let i = 1; i < 6; i++) { const t = i / 6; for (const sx of [1, -1]) parts.push(beamPart(sx * hw, yU + hW - 0.15, -hd + 2 * hd * t, sx * lw, yC - 0.15, -ld + 2 * ld * t, 0.22, 0.3, whiteC)); }
    for (let x = -lw + 1.2; x < lw; x += 1.2) parts.push({ g: new THREE.BoxGeometry(0.12, 0.16, 2 * ld).translate(x, yC + 1.3, 0), c: whiteC });
    // serving islands, tables and chairs, potted palms
    const wood = C('#6b4e36'), topC = C('#dcd6cb'), chairC = C('#8e9196'), tableC = C('#7a5a3e'), leaf = C('#3f6e2e'), pot = C('#4a4038');
    for (const [x, z] of [[7.5, -5], [7.5, 2], [13, -1.5]]) { parts.push({ g: new THREE.BoxGeometry(4.2, 0.9, 1.3).translate(x, yU + 0.45, z), c: wood }); parts.push({ g: new THREE.BoxGeometry(4.4, 0.06, 1.45).translate(x, yU + 0.93, z), c: topC }); for (let k = 0; k < 4; k++) parts.push({ g: new THREE.BoxGeometry(0.7, 0.08, 0.45).translate(x - 1.5 + k, yU + 1.0, z), c: C('#f4f4f2') }); box(Dh.x + x, Dh.z + z, 2.25, 0.75, 0); }
    for (const x of [-11.5, -6.5, -1.5]) for (const z of [-8, -2.5, 3, 8.5]) {
      parts.push({ g: new THREE.BoxGeometry(1.8, 0.06, 0.9).translate(x, yU + 0.75, z), c: tableC });
      for (const sx of [-0.8, 0.8]) for (const sz of [-0.38, 0.38]) parts.push({ g: new THREE.BoxGeometry(0.05, 0.75, 0.05).translate(x + sx, yU + 0.37, z + sz), c: C('#2a2a2a') });
      for (const cx of [-0.55, 0.55]) for (const sz of [-1, 1]) { parts.push({ g: new THREE.BoxGeometry(0.44, 0.05, 0.42).translate(x + cx, yU + 0.46, z + sz * 0.7), c: chairC }); parts.push({ g: new THREE.BoxGeometry(0.44, 0.45, 0.05).translate(x + cx, yU + 0.7, z + sz * 0.92), c: chairC }); parts.push({ g: new THREE.BoxGeometry(0.4, 0.44, 0.38).translate(x + cx, yU + 0.22, z + sz * 0.7), c: C('#5d6066') }); }
      box(Dh.x + x, Dh.z + z, 1.1, 1.0, 0);
    }
    for (const [x, z] of [[-15.6, -12.6], [-15.6, 12.6], [15.6, 12.6]]) { parts.push({ g: new THREE.CylinderGeometry(0.32, 0.26, 0.6, 10).translate(x, yU + 0.3, z), c: pot }); for (let k = 0; k < 5; k++) parts.push({ g: new THREE.IcosahedronGeometry(0.42, 0).translate(x + Math.cos(k * 1.3) * 0.3, yU + 1.0 + k * 0.1, z + Math.sin(k * 1.3) * 0.3), c: leaf }); }
    const pm = new THREE.Mesh(mergeGeoms(parts), trimMat); pm.castShadow = true; pm.receiveShadow = true; g.add(pm);
    // the lantern: glass sides, a skylight overhead, a flat cap outside
    const glow = new THREE.MeshStandardMaterial({ color: C('#dfe9ef'), emissive: C('#9fb5c4'), emissiveIntensity: 0.55, roughness: 0.2, side: THREE.DoubleSide });
    add(new THREE.BoxGeometry(2 * lw, 1.3, 2 * ld, 1, 1, 1), [glow, glow, new THREE.MeshBasicMaterial({ visible: false }), new THREE.MeshBasicMaterial({ color: C('#f4f8fb') }), glow, glow], 0, yC + 0.65, 0, false);
    add(new THREE.BoxGeometry(2 * lw + 0.8, 0.22, 2 * ld + 0.8), roofMat('#a9aaa6'), 0, yC + 1.41, 0);
    // outside: hip roof, fascia, solar panels on the west slope
    add(triGeo(trap(hw + 1.2, hd + 1.2, yU + hW - 0.25, lw + 0.3, ld + 0.3, yC + 0.15), 0.5), roofMat('#a9aaa6'), 0, 0, 0);
    add(new THREE.BoxGeometry(2 * hw + 2.5, 0.35, 0.12), trimMat, 0, yU + hW - 0.42, hd + 1.22, false);
    const slope = Math.atan2(yC + 0.15 - (yU + hW - 0.25), (hw + 1.2) - (lw + 0.3));
    const pan = add(new THREE.BoxGeometry(6.6, 0.08, 18), panelMatFor(6.6, 18), -(hw + lw + 1.5) / 2, (yU + hW - 0.25 + yC + 0.15) / 2 + 0.14, 0);
    pan.rotation.z = slope;
    // south deck on posts with cable rails, stair down to the lawn at its east end
    add(new THREE.BoxGeometry(2 * hw, 0.16, 3), deckMat, 0, yU - 0.08, hd + 1.5);
    const dp = [], steel = C('#5d6166'), timber = C('#6b5444');
    for (let x = -hw + 0.2; x <= hw; x += 3.4) dp.push({ g: new THREE.BoxGeometry(0.22, yU - Y_LOW + 1, 0.22).translate(x, (yU + Y_LOW - 1) / 2, hd + 2.8), c: timber });
    const railRun = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0); for (let t = 0; t <= L + 0.01; t += 1.5) { const f = L ? t / L : 0; dp.push({ g: new THREE.BoxGeometry(0.06, 1.0, 0.06).translate(x0 + (x1 - x0) * f, yU + 0.5, z0 + (z1 - z0) * f), c: steel }); } dp.push(beamPart(x0, yU + 1.02, z0, x1, yU + 1.02, z1, 0.1, 0.06, timber)); for (let k = 1; k <= 5; k++) dp.push(beamPart(x0, yU + k * 0.17, z0, x1, yU + k * 0.17, z1, 0.015, 0.015, steel)); };
    railRun(-hw, hd + 3, 10, hd + 3); railRun(12.5, hd + 3, hw, hd + 3); railRun(-hw, hd, -hw, hd + 3); railRun(hw, hd, hw, hd + 3);
    const nS = Math.max(4, Math.round((yU - DSTAIR.g0) / 0.18)), tread = DSTAIR.L / nS;
    for (let i = 0; i < nS; i++) { const top = yU - (i + 1) * (yU - DSTAIR.g0) / nS; dp.push({ g: new THREE.BoxGeometry(2.5, top - DSTAIR.g0 + 0.6, tread + 0.02).translate(DSTAIR.x - Dh.x, (top + DSTAIR.g0 - 0.6) / 2, DSTAIR.z0 - Dh.z + (i + 0.5) * tread), c: C('#bdb8ae') }); }
    for (const sx of [-1.25, 1.25]) dp.push(beamPart(DSTAIR.x - Dh.x + sx, yU + 0.95, DSTAIR.z0 - Dh.z, DSTAIR.x - Dh.x + sx, DSTAIR.g0 + 0.95, DSTAIR.z0 - Dh.z + DSTAIR.L, 0.06, 0.06, steel));
    const dm = new THREE.Mesh(mergeGeoms(dp), trimMat); dm.castShadow = true; dm.receiveShadow = true; g.add(dm);
  })();

  // ---------- Ko Kākou Student Union over the Student Store ----------
  // From the school's photos and drone footage: a broad low gable with its ridge running down the slope; the south gable end
  // is a grid of white-framed windows over the cream-walled store storey, whose deep porch on ʻōhiʻa posts shelters square
  // red tables and opens onto the lawn that falls to the upper field. The union floor meets Kennedy Square at grade; inside,
  // red steel portal frames carry the school's banners. A stair on the east side drops to the store.
  (function studentUnion() {
    const U = UNION, yU = PLATEAU_Y, yL = Y_LOW, hw = U.hw, hd = U.hd, wx0 = -15.4, hU = 3.4, rise = 2.3;
    const g = new THREE.Group(); g.position.set(U.x, 0, U.z); scene.add(g);
    const M = (c, r, mt, ex) => new THREE.MeshStandardMaterial(Object.assign({ color: C(c), roughness: r, metalness: mt || 0 }, ex || {}));
    const add = (geo, mat, x, y, z, shadow) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; } g.add(m); return m; };
    // store storey: cream board and batten wherever the ground falls away
    const lowH = yU - yL + 0.8;
    add(wallsGeo(hw - wx0, 2 * hd, lowH, lowH, 4, 0), [wallMat('cream'), wallMat('cream'), wallMat('glass'), wallMat('cream')], (hw + wx0) / 2, yL - 0.8, 0);
    const storeTex = canvasTex(1856, 272, (c, W2, H2) => {
      const m = 80, Y = (y2) => H2 - y2 * m;
      c.fillStyle = '#d9cdae'; c.fillRect(0, 0, W2, H2);
      for (let x = 0; x < W2; x += 14) { c.fillStyle = 'rgba(90,70,40,0.28)'; c.fillRect(x, 0, 3, H2); }
      const win = (x0, w, y0, h) => { c.fillStyle = '#f4f2ea'; c.fillRect(x0 * m - 6, Y(y0 + h) - 6, w * m + 12, h * m + 12); const gr = c.createLinearGradient(0, Y(y0 + h), 0, Y(y0)); gr.addColorStop(0, '#26313b'); gr.addColorStop(1, '#5a6e80'); c.fillStyle = gr; c.fillRect(x0 * m, Y(y0 + h), w * m, h * m); c.fillStyle = '#f4f2ea'; c.fillRect((x0 + w / 2) * m - 3, Y(y0 + h), 6, h * m); c.fillRect(x0 * m, Y(y0 + h * 0.55) - 3, w * m, 6); };
      [1.2, 4.6, 9.0, 18.6].forEach((x) => win(x, 1.6, 0.9, 1.5));
      c.fillStyle = '#4a1411'; c.fillRect(12.4 * m - 8, Y(2.5) - 8, 1.9 * m + 16, 2.5 * m + 8);
      c.fillStyle = '#9b2a24'; c.fillRect(12.4 * m, Y(2.45), 0.92 * m, 2.45 * m); c.fillRect(13.38 * m, Y(2.45), 0.92 * m, 2.45 * m);
      c.fillStyle = '#d9b26a'; c.fillRect(13.2 * m, Y(1.2), 6, 22); c.fillRect(13.48 * m, Y(1.2), 6, 22);
      c.fillStyle = '#1d1d1f'; c.fillRect(15.0 * m, Y(2.45), 1.5 * m, 0.34 * m); c.fillStyle = '#f2f0ea'; c.font = 'bold 18px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Student Store', 15.75 * m, Y(2.28));
      [11.6, 15.0, 6.8].forEach((x) => { c.fillStyle = '#2a2a2a'; c.fillRect(x * m, Y(2.75), 14, 20); });
    });
    add(new THREE.PlaneGeometry(hw - wx0, yU - yL), new THREE.MeshStandardMaterial({ map: storeTex, roughness: 0.85 }), (hw + wx0) / 2, (yU + yL) / 2, hd + 0.03, false);
    // union storey: dark boards outside, warm white inside, door onto the square in the north wall
    const out = wallMat('wood'), inn = M('#ece6d8', 0.9);
    wallLine(U, g, 'x', -hw, hw, -hd, -1, yU, hU, 0.3, out, inn, [[-0.5, 3.4, 2.7]]);
    const eastWin = [-4.5, 0.5, 5.5];
    wallLine(U, g, 'z', -hd, hd, hw, 1, yU, hU, 0.3, out, inn, eastWin.map((c) => [c, 3.0, 2.6, 0.9]));
    wallLine(U, g, 'z', -hd, hd, -hw, -1, yU, hU, 0.3, out, inn, []);
    const gableShape = () => { const sh = new THREE.Shape(); sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(hw, hU); sh.lineTo(0, hU + rise); sh.lineTo(-hw, hU); sh.closePath(); return sh; };
    const facadeTex = canvasTex(1248, 464, (c, W2, H2) => {
      const m = 80, Y = (y2) => H2 - y2 * m, frame = '#f4f2ea';
      c.fillStyle = '#3e2f25'; c.fillRect(0, 0, W2, H2);
      for (let x = 0; x < W2; x += 12) { c.fillStyle = 'rgba(10,5,2,0.5)'; c.fillRect(x, 0, 3, H2); }
      const row = (x0, x1, y0, y1, n) => { c.fillStyle = frame; c.fillRect(x0 * m - 7, Y(y1) - 7, (x1 - x0) * m + 14, (y1 - y0) * m + 14); c.clearRect(x0 * m, Y(y1), (x1 - x0) * m, (y1 - y0) * m); c.fillStyle = frame; for (let i = 1; i < n; i++) c.fillRect((x0 + (x1 - x0) * i / n) * m - 4, Y(y1), 8, (y1 - y0) * m); };
      row(0.7, 14.9, 0.5, 1.75, 6); row(0.7, 14.9, 1.95, 3.0, 6); row(3.6, 12.0, 3.35, 4.35, 4);
      c.fillStyle = frame; c.fillRect(0, Y(0.14), W2, 11);
    });
    const sg = new THREE.ShapeGeometry(gableShape()), sp = sg.attributes.position, suv = sg.attributes.uv;
    for (let i = 0; i < sp.count; i++) suv.setXY(i, (sp.getX(i) + hw) / (2 * hw), sp.getY(i) / 5.8);
    add(sg, new THREE.MeshStandardMaterial({ map: facadeTex, roughness: 0.6, side: THREE.DoubleSide, alphaTest: 0.5 }), 0, yU, hd, false);
    // clear glass in the window wall and the east windows, so the lawn and the field show from inside
    const glass = new THREE.MeshStandardMaterial({ color: C('#cfe1ec'), roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    add(new THREE.ShapeGeometry(gableShape()), glass, 0, yU, hd - 0.03, false);
    for (const c of eastWin) { const gp = add(new THREE.PlaneGeometry(3.0, 1.7), glass, hw, yU + 1.75, c, false); gp.rotation.y = Math.PI / 2; }
    box(U.x, U.z + hd, hw, 0.2, 0);
    const tri = new THREE.Shape(); tri.moveTo(-hw - 0.15, hU); tri.lineTo(hw + 0.15, hU); tri.lineTo(0, hU + rise); tri.closePath();
    add(new THREE.ShapeGeometry(tri), M('#3e2f25', 0.85, 0, { side: THREE.DoubleSide }), 0, yU, -hd, false);
    // roof: broad low gable, deep eaves at the gable ends
    // two open slopes (metal above, white soffit below) so the gable ends stay glazed; dark fascia on the edges
    const ex = hw + 1.0, ez = hd + 1.9, ye = yU + hU - 0.3, yk = yU + hU + rise + 0.05, sl = [];
    sl.push([-ex, ye, ez], [0, yk, ez], [0, yk, -ez], [-ex, ye, ez], [0, yk, -ez], [-ex, ye, -ez]);
    sl.push([ex, ye, -ez], [0, yk, -ez], [0, yk, ez], [ex, ye, -ez], [0, yk, ez], [ex, ye, ez]);
    add(triGeo(sl, 0.5), roofMat('#9fa09c'), 0, 0, 0);
    add(triGeo(sl), M('#f3f1ea', 0.8, 0, { side: THREE.BackSide }), 0, -0.02, 0, false);
    const fas = [], dkC = C('#2f2620');
    for (const sx of [-1, 1]) { fas.push(beamPart(sx * ex, ye - 0.12, -ez, sx * ex, ye - 0.12, ez, 0.12, 0.32, dkC)); for (const sz of [-1, 1]) fas.push(beamPart(sx * ex, ye - 0.12, sz * ez, 0, yk - 0.12, sz * ez, 0.12, 0.32, dkC)); }
    add(mergeGeoms(fas), trimMat, 0, 0, 0);
    // west wing: a lower storey-high block with a shallow shed roof
    add(wallsGeo(hw * 0 + 7.6, 2 * hd, 3.0, 3.0, 4, 0), [out, wallMat('stone'), wallMat('glass'), out], -11.6, yU, 0);
    const wr = add(new THREE.BoxGeometry(8.8, 0.22, 2 * hd + 1.4), roofMat('#9fa09c'), -11.9, yU + 3.25, 0); wr.rotation.z = 0.06;
    box(U.x - 11.6, U.z, 3.8, hd, 0);
    // inside: ceiling under the roof, red portal frames with banners, white ties, furniture
    const yt = yU + hU, yr = yU + hU + rise - 0.25, ceil = [];
    ceil.push([-hw, yt, -hd], [0, yr, -hd], [0, yr, hd], [-hw, yt, -hd], [0, yr, hd], [-hw, yt, hd]);
    ceil.push([hw, yt, hd], [0, yr, hd], [0, yr, -hd], [hw, yt, hd], [0, yr, -hd], [hw, yt, -hd]);
    add(triGeo(ceil), M('#f4f2ec', 0.9, 0, { side: THREE.DoubleSide, emissive: C('#77746e') }), 0, 0, 0, false);
    const parts = [], redC = C('#b8232c'), whiteC = C('#f1efe8');
    for (const fz of [-7, -2, 3, 8]) {
      for (const sx of [-1, 1]) { parts.push({ g: new THREE.BoxGeometry(0.32, hU, 0.5).translate(sx * (hw - 0.32), yU + hU / 2, fz), c: redC }); parts.push(beamPart(sx * (hw - 0.32), yt - 0.1, fz, 0, yr - 0.15, fz, 0.32, 0.5, redC)); }
      parts.push({ g: new THREE.BoxGeometry(2 * hw - 0.6, 0.12, 0.12).translate(0, yt + 0.2, fz), c: whiteC });
    }
    parts.push({ g: new THREE.BoxGeometry(0.3, 0.4, 2 * hd - 0.6).translate(0, yr - 0.3, 0), c: redC });
    const banner = (text, x, z, side) => {
      const tx = canvasTex(96, 352, (c, W2, H2) => { c.fillStyle = '#b8232c'; c.fillRect(0, 0, W2, H2); c.fillStyle = '#ffffff'; c.font = 'bold 38px Georgia, serif'; c.save(); c.translate(W2 / 2 + 13, H2 / 2); c.rotate(Math.PI / 2); c.textAlign = 'center'; c.fillText(text, 0, 0); c.restore(); });
      const bp = add(new THREE.PlaneGeometry(0.62, 2.3), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.8 }), x, yU + 1.9, z, false); bp.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    };
    banner('INTEGRITY', hw - 0.5, -7, 1); banner('EXCELLENCE', hw - 0.5, -2, 1); banner('RESPECT', -hw + 0.5, -7, -1); banner('WONDER', -hw + 0.5, -2, -1);
    const plank = canvasTex(256, 256, (c, W2, H2) => { c.fillStyle = '#b58e62'; c.fillRect(0, 0, W2, H2); const r = rng(21); for (let y2 = 0; y2 < H2; y2 += 22) { c.fillStyle = 'rgba(60,35,15,0.4)'; c.fillRect(0, y2, W2, 2); const off = r() * W2; c.fillRect(off, y2, 2, 22); for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(255,235,200,0.08)'; c.fillRect(r() * W2, y2 + 4 + r() * 14, 50, 2); } } });
    plank.repeat.set(4, 5);
    add(new THREE.PlaneGeometry(2 * hw - 0.3, 2 * hd - 0.3).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: plank, roughness: 0.55 }), 0, yU + 0.02, 0, false).receiveShadow = true;
    add(new THREE.PlaneGeometry(7, 6).rotateX(-Math.PI / 2), M('#47494f', 0.95), -3.2, yU + 0.035, -5.5, false);
    const gray = C('#9a9da3'), dk = C('#6a6d73'), wt = C('#efefec');
    const sofa = (x, z, ry) => { const s2 = [{ g: new THREE.BoxGeometry(2.2, 0.42, 0.9).translate(0, 0.21, 0), c: gray }, { g: new THREE.BoxGeometry(2.2, 0.45, 0.22).translate(0, 0.62, -0.34), c: gray }, { g: new THREE.BoxGeometry(0.2, 0.3, 0.9).translate(-1.0, 0.55, 0), c: dk }, { g: new THREE.BoxGeometry(0.2, 0.3, 0.9).translate(1.0, 0.55, 0), c: dk }]; for (const q of s2) { q.g.rotateY(ry); q.g.translate(x, yU, z); parts.push(q); } const side = Math.abs(Math.sin(ry)) > 0.5; box(U.x + x, U.z + z, side ? 0.5 : 1.15, side ? 1.15 : 0.5, 0); };
    sofa(-4.6, -8.0, 0); sofa(-1.2, -5.2, -Math.PI / 2); sofa(-4.6, -2.9, Math.PI);
    for (const [x, z] of [[-3.4, -5.8], [-5.2, -5.4]]) parts.push({ g: new THREE.BoxGeometry(0.55, 0.42, 0.55).translate(x, yU + 0.21, z), c: dk });
    for (const [x, z] of [[3.0, -6.0], [3.0, -1.0], [-3.4, 2.0], [3.0, 4.0], [-3.4, 6.4]]) {
      parts.push({ g: new THREE.CylinderGeometry(0.48, 0.48, 0.04, 16).translate(x, yU + 0.74, z), c: wt }); parts.push({ g: new THREE.CylinderGeometry(0.05, 0.05, 0.72, 8).translate(x, yU + 0.37, z), c: dk });
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4, cx = x + Math.cos(a) * 0.78, cz = z + Math.sin(a) * 0.78; parts.push({ g: new THREE.BoxGeometry(0.42, 0.05, 0.42).translate(cx, yU + 0.46, cz), c: gray }); parts.push({ g: new THREE.BoxGeometry(0.42, 0.42, 0.05).rotateY(-a + Math.PI / 2).translate(cx + Math.cos(a) * 0.2, yU + 0.7, cz + Math.sin(a) * 0.2), c: gray }); }
      colliders.circles.push({ x: U.x + x, z: U.z + z, r: 0.6 });
    }
    parts.push({ g: new THREE.BoxGeometry(2 * hw - 2.0, 0.06, 0.5).translate(0, yU + 1.05, hd - 0.55), c: wt });
    for (let x = -hw + 1.6; x < hw - 1; x += 1.6) { parts.push({ g: new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12).translate(x, yU + 0.78, hd - 1.15), c: dk }); parts.push({ g: new THREE.CylinderGeometry(0.03, 0.03, 0.76, 6).translate(x, yU + 0.38, hd - 1.15), c: dk }); }
    box(U.x, U.z + hd - 0.55, hw - 1.0, 0.3, 0);
    // porch: concrete slab, white-fasciaed canopy on ʻōhiʻa posts, square red tables
    add(new THREE.BoxGeometry(hw - wx0, 0.24, 3.4), concreteMat, (hw + wx0) / 2, yL, hd + 1.7);
    const can = add(new THREE.BoxGeometry(hw - wx0 + 0.6, 0.16, 3.9), roofMat('#b9b8b2'), (hw + wx0) / 2, yL + 3.05, hd + 1.95); can.rotation.x = 0.05;
    add(new THREE.BoxGeometry(hw - wx0 + 0.6, 0.32, 0.08), M('#f3f1ea', 0.6), (hw + wx0) / 2, yL + 2.92, hd + 3.9);
    for (let x = wx0 + 0.4; x <= hw - 0.2; x += 3.3) { parts.push({ g: new THREE.CylinderGeometry(0.15, 0.19, 3.0, 9).translate(x, yL + 1.5, hd + 3.6), c: C('#a39a8c') }); colliders.circles.push({ x: U.x + x, z: U.z + hd + 3.6, r: 0.22 }); }
    const sqt = squareTableGeo();
    for (const x of [-12.4, -8.0, -3.4, 1.4, 5.4]) { const t = new THREE.Mesh(sqt, trimMat); t.position.set(U.x + x, yL + 0.12, U.z + hd + 1.75); t.rotation.y = 0.12; t.castShadow = true; t.receiveShadow = true; scene.add(t); colliders.circles.push({ x: U.x + x, z: U.z + hd + 1.75, r: 0.95 }); }
    // stair down the east side, from the square to the store
    const nS = Math.round((yU - yL) / 0.18), L = 11.5, tread = L / nS, sx0 = 213.0 - U.x, sx1 = 215.2 - U.x;
    for (let i = 0; i < nS; i++) { const top = yU - (i + 1) * (yU - yL) / nS; parts.push({ g: new THREE.BoxGeometry(sx1 - sx0, top - yL + 0.5, tread + 0.02).translate((sx0 + sx1) / 2, (top + yL - 0.5) / 2, -80 - U.z + (i + 0.5) * tread), c: C('#bdb8ae') }); }
    for (const x of [sx0 + 0.1, sx1 - 0.1]) { parts.push(beamPart(x, yU + 0.95, -80 - U.z, x, yL + 0.95, -68.5 - U.z, 0.06, 0.06, C('#5d6166'))); for (let t = 0; t <= 1.001; t += 0.25) parts.push({ g: new THREE.BoxGeometry(0.05, 0.95, 0.05).translate(x, yU + (yL - yU) * t + 0.47, -80 - U.z + 11.5 * t), c: C('#5d6166') }); }
    // the nook between the store and the stair: paving, a lava retaining wall at its head, two grey picnic tables
    add(new THREE.BoxGeometry(2 * NOOK.hw, 0.2, 2 * NOOK.hd), concreteMat, NOOK.x - U.x, yL - 0.04, NOOK.z - U.z);
    { const w = 2 * NOOK.hw + 0.3, h = yU - yL + 0.6; add(uvBox(new THREE.BoxGeometry(w, h, 0.5), [w, h, 0.5], 8, 4), wallMat('stone'), NOOK.x - U.x + 0.15, yL + h / 2 - 0.5, -80.35 - U.z); }
    parts.push(beamPart(209.6 - U.x, yU + 1.0, -80.1 - U.z, 212.9 - U.x, yU + 1.0, -80.1 - U.z, 0.06, 0.06, C('#5d6166')));
    for (let x = 209.7; x <= 212.95; x += 1.1) parts.push({ g: new THREE.BoxGeometry(0.05, 1.0, 0.05).translate(x - U.x, yU + 0.5, -80.1 - U.z), c: C('#5d6166') });
    const gpt = greyPicnicGeo();
    for (const [tx, tz] of NOOK.tables) { const t = new THREE.Mesh(gpt, trimMat); t.position.set(tx, yL + 0.06, tz); t.rotation.y = Math.PI / 2; t.castShadow = true; t.receiveShadow = true; scene.add(t); box(tx, tz, 0.85, 1.15, 0); }
    // a black iron lantern on the store wall between the two tables, warm after dark
    {
      const lz = (NOOK.tables[0][1] + NOOK.tables[1][1]) / 2, iron = new THREE.MeshStandardMaterial({ color: C('#26262a'), roughness: 0.6, metalness: 0.4 });
      const glow = new THREE.MeshStandardMaterial({ color: C('#efe2c4'), emissive: C('#ffb45e'), emissiveIntensity: 0, roughness: 0.4 });
      const put = (geo, mat, x, y) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, lz); m.castShadow = mat === iron; scene.add(m); };
      put(new THREE.BoxGeometry(0.06, 0.06, 0.06), iron, 209.66, yL + 2.62);
      put(new THREE.BoxGeometry(0.34, 0.03, 0.03), iron, 209.8, yL + 2.62);
      put(new THREE.BoxGeometry(0.2, 0.3, 0.2), glow, 209.95, yL + 2.38);
      put(new THREE.ConeGeometry(0.17, 0.12, 4).rotateY(Math.PI / 4), iron, 209.95, yL + 2.59);
      put(new THREE.BoxGeometry(0.22, 0.03, 0.22), iron, 209.95, yL + 2.22);
      nightGlows.push({ mat: glow, I: 2.6 });
      const pl = new THREE.PointLight(0xffc285, 0, 11, 2); pl.position.set(210.15, yL + 2.3, lz); scene.add(pl);
      nightLights.push({ light: pl, I: 2.4 });
    }
    const pm = new THREE.Mesh(mergeGeoms(parts), trimMat); pm.castShadow = true; pm.receiveShadow = true; g.add(pm);
  })();

  // ---------- Dyer Library approach (HABS HI-601-G) ----------
  // the south deck with cable rails sits on a tall lava-rock retaining wall above the path; a concrete switchback ramp
  // between lava cheekwalls and a concrete stair with metal rails climb to it and to the natural-finish main door
  (function libraryApproach() {
    const lib = BUILDINGS.find((b) => b.name === 'library'), D = LIB_DECK, parts = [], steel = C('#5d6166'), timber = C('#6b5444'), conc = C('#bdb8ae');
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2 * D.hw, 0.18, 2 * D.hd), deckMat); deck.position.set(D.x, Y_DECK - 0.09, D.z); deck.receiveShadow = true; deck.castShadow = true; scene.add(deck);
    const stoneBox = (x0, x1, z0, z1, yb, yt) => { const w = x1 - x0, d = z1 - z0, h = yt - yb; const m = new THREE.Mesh(uvBox(new THREE.BoxGeometry(w, h, d), [w, h, d], 8, 4), wallMat('stone')); m.position.set((x0 + x1) / 2, (yb + yt) / 2, (z0 + z1) / 2); m.castShadow = true; m.receiveShadow = true; scene.add(m); };
    const yb = Math.min(ZZ.yg, LSTAIR.g0) - 1.0;
    stoneBox(164.4, 186.4, -92.1, -91.5, yb, Y_DECK - 0.18);
    // ramps: concrete slabs; cheekwalls of lava rock following the slope
    const slope = (x0, y0, x1, y1, z0, z1, th) => { const sh = new THREE.Shape(); sh.moveTo(x0, y0 - th); sh.lineTo(x1, y1 - th); sh.lineTo(x1, y1); sh.lineTo(x0, y0); sh.closePath(); const geo = new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false }); geo.translate(0, 0, z0); return geo; };
    parts.push({ g: slope(168.0, ZZ.ym, 183.6, ZZ.yg, -89.0, -87.4, 0.3), c: conc }, { g: slope(168.0, ZZ.ym, 183.6, Y_DECK, -91.45, -89.55, 0.3), c: conc });
    parts.push({ g: new THREE.BoxGeometry(2.7, 0.3, 1.6).translate(184.95, ZZ.yg - 0.15, -88.2), c: conc }, { g: new THREE.BoxGeometry(2.6, 0.3, 4.0).translate(166.7, ZZ.ym - 0.15, -89.45), c: conc }, { g: new THREE.BoxGeometry(2.7, 0.3, 2.0).translate(184.95, Y_DECK - 0.15, -90.55), c: conc });
    const cheek = (x0, y0, x1, y1, z0, z1) => { const geo = slope(x0, y0, x1, y1, z0, z1, Math.max(y0, y1) - yb); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 8, uv.getY(i) / 4); const m = new THREE.Mesh(geo, wallMat('stone')); m.castShadow = true; m.receiveShadow = true; scene.add(m); };
    cheek(168.0, Y_DECK + 0.45, 186.3, Y_DECK + 0.45, -89.6, -89.0);
    cheek(168.0, ZZ.ym + 0.45, 183.6, ZZ.yg + 0.45, -87.4, -87.0);
    cheek(165.0, ZZ.ym + 0.5, 165.4, ZZ.ym + 0.5, -91.5, -87.0);
    // stair at the west end of the deck
    const nS = Math.max(4, Math.round((Y_DECK - LSTAIR.g0) / 0.17)), tread = LSTAIR.L / nS;
    for (let i = 0; i < nS; i++) { const top = Y_DECK - (i + 1) * (Y_DECK - LSTAIR.g0) / nS; parts.push({ g: new THREE.BoxGeometry(2.8, top - yb, tread + 0.02).translate(LSTAIR.x, (top + yb) / 2, -91.5 + (i + 0.5) * tread), c: conc }); }
    for (const x of [161.55, 164.45]) { parts.push(beamPart(x, Y_DECK + 0.95, -91.5, x, LSTAIR.g0 + 0.95, -91.5 + LSTAIR.L, 0.06, 0.06, steel)); for (let t = 0; t <= 1.001; t += 0.25) parts.push({ g: new THREE.BoxGeometry(0.05, 0.95, 0.05).translate(x, Y_DECK + (LSTAIR.g0 - Y_DECK) * t + 0.47, -91.5 + LSTAIR.L * t), c: steel }); }
    // cable rails on the deck
    const railRun = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0); for (let t = 0; t <= L + 0.01; t += 1.6) { const f = t / L; parts.push({ g: new THREE.BoxGeometry(0.06, 1.0, 0.06).translate(x0 + (x1 - x0) * f, Y_DECK + 0.5, z0 + (z1 - z0) * f), c: steel }); } parts.push(beamPart(x0, Y_DECK + 1.02, z0, x1, Y_DECK + 1.02, z1, 0.1, 0.06, timber)); for (let k = 1; k <= 5; k++) parts.push(beamPart(x0, Y_DECK + k * 0.17, z0, x1, Y_DECK + k * 0.17, z1, 0.015, 0.015, steel)); };
    railRun(164.4, -91.6, 183.6, -91.6); railRun(161.45, -94.7, 161.45, -91.6);
    const pm = new THREE.Mesh(mergeGeoms(parts), trimMat); pm.castShadow = true; pm.receiveShadow = true; scene.add(pm);
    // the main door: natural wood with concentric lines radiating from a diamond at the height of the knob
    const doorTex = canvasTex(128, 192, (c, W2, H2) => { c.fillStyle = '#9a6b42'; c.fillRect(0, 0, W2, H2); c.strokeStyle = 'rgba(60,35,15,0.55)'; c.lineWidth = 3; for (let k = 1; k < 9; k++) { const r = k * 11; c.beginPath(); c.moveTo(W2 / 2, 100 - r); c.lineTo(W2 / 2 + r * 0.75, 100); c.lineTo(W2 / 2, 100 + r); c.lineTo(W2 / 2 - r * 0.75, 100); c.closePath(); c.stroke(); } c.fillStyle = '#d6b26a'; c.fillRect(W2 - 18, 96, 8, 10); });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.5), new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.7 })); door.position.set(lib.x, Y_DECK + 1.25, lib.z + lib.w / 2 + 0.04); scene.add(door);
    // north gable: fixed windows up to the peak (HABS)
    const lhw = lib.d / 2, D2 = lhw + (lib.eave || 0.3), rise2 = D2 * lib.rise * 2, gRise = rise2 * lhw / D2;
    const sh = new THREE.Shape(); sh.moveTo(-lhw, 0.4); sh.lineTo(lhw, 0.4); sh.lineTo(lhw, lib.h); sh.lineTo(0, lib.h + gRise - 0.15); sh.lineTo(-lhw, lib.h); sh.closePath();
    const gTex = canvasTex(512, 256, (c, W2, H2) => { c.fillStyle = '#3b2c22'; c.fillRect(0, 0, W2, H2); for (let x = 0; x < W2; x += 48) for (let y2 = 0; y2 < H2; y2 += 64) { const gr = c.createLinearGradient(0, y2, 0, y2 + 60); gr.addColorStop(0, '#a7bccb'); gr.addColorStop(1, '#46596a'); c.fillStyle = gr; c.fillRect(x + 5, y2 + 5, 38, 54); } });
    const gg = new THREE.ShapeGeometry(sh), gp = gg.attributes.position, guv = gg.attributes.uv; for (let i = 0; i < gp.count; i++) guv.setXY(i, (gp.getX(i) + lhw) / 6, gp.getY(i) / 3);
    const gm = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.3, metalness: 0.2 })); gm.position.set(lib.x, groundH(lib.x, lib.z) + 0.6, lib.z - lib.w / 2 - 0.04); gm.rotation.y = Math.PI; scene.add(gm);
  })();

  // ---------- around Davies Chapel: the circular drive, a covered walk on heavy ʻōhiʻa posts, paperbark trees ----------
  (function chapelGrounds() {
    const ch = BUILDINGS.find((b) => b.name === 'chapel'), [cx, cz] = P(380, 120), R0 = 13;
    const ring = []; for (let i = 0; i <= 56; i++) { const a = i / 56 * Math.PI * 2; ring.push([cx + Math.cos(a) * R0, cz + Math.sin(a) * R0]); }
    ribbon(ring, 5, roadMats.campus, 0.09, roadSpan.campus);
    ribbon([[cx - 1, cz + R0], [cx - 2, cz + R0 + 10], [-57, -204.5]], 5, roadMats.campus, 0.088, roadSpan.campus);
    noVeg.push({ x: cx, z: cz, rot: 0, hw: R0 + 3, hd: R0 + 3 });
    const [ax, az] = toWorld(ch, -ch.w / 2 + 1.6, ch.d / 2 + 1.2), dx = cx - ax, dz = cz - az, dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl, L = Math.max(6, dl - R0 - 3.5);
    const parts = [], ohiaC = C('#a8a093'), beamC = C('#5b4433'), wg = new THREE.Group(); scene.add(wg);
    const nx = -uz, nz = ux;
    for (let t = 0; t <= L + 0.01; t += 3) for (const sd of [-1.7, 1.7]) {
      const px = ax + ux * t + nx * sd, pz = az + uz * t + nz * sd, gy = groundH(px, pz);
      parts.push({ g: new THREE.BoxGeometry(0.34, 2.9, 0.34).translate(px, gy + 1.45, pz), c: ohiaC });
      colliders.circles.push({ x: px, z: pz, r: 0.25 });
    }
    const gy0 = groundH(ax, az), gy1 = groundH(ax + ux * L, az + uz * L);
    for (const sd of [-1.7, 1.7]) parts.push(beamPart(ax + nx * sd, gy0 + 3.05, az + nz * sd, ax + ux * L + nx * sd, gy1 + 3.05, az + uz * L + nz * sd, 0.3, 0.42, beamC));
    for (let t = 0; t <= L; t += 1.5) parts.push(beamPart(ax + ux * t - nx * 2.1, gy0 + (gy1 - gy0) * t / L + 3.3, az + uz * t - nz * 2.1, ax + ux * t + nx * 2.1, gy0 + (gy1 - gy0) * t / L + 3.3, az + uz * t + nz * 2.1, 0.12, 0.18, beamC));
    const wm = new THREE.Mesh(mergeGeoms(parts), trimMat); wm.castShadow = true; wm.receiveShadow = true; wg.add(wm);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.08, L + 0.8), roofMat('#c4c3bd')); roof.position.set(ax + ux * L / 2, (gy0 + gy1) / 2 + 3.45, az + uz * L / 2); roof.rotation.y = Math.atan2(ux, uz); roof.castShadow = true; scene.add(roof);
    const walk = drape(new THREE.PlaneGeometry(3.2, L, 2, Math.ceil(L / 2)).rotateX(-Math.PI / 2), ax + ux * L / 2, az + uz * L / 2, Math.atan2(ux, uz), 0.06);
    scene.add(Object.assign(new THREE.Mesh(walk, overlayMat(roadTex.path)), { receiveShadow: true }));
    // paperbark trees with pale, peeling, many-stemmed trunks
    const pb = (lx, lz, seed) => {
      const [x, z] = toWorld(ch, lx, lz), y = groundH(x, z), r = rng(seed), pp = [];
      for (let k = 0; k < 4; k++) { const a = k * 1.7 + r(), tilt = 0.18 + r() * 0.2, hgt = 5 + r() * 2.5; pp.push({ g: new THREE.CylinderGeometry(0.1, 0.19, hgt, 7).translate(0, hgt / 2, 0).rotateZ(tilt).rotateY(a), c: C('#e9e4d8') }); }
      for (let k = 0; k < 9; k++) { const a = r() * 6.28, d = 1 + r() * 2.4; pp.push({ g: new THREE.IcosahedronGeometry(1.4 + r() * 1.1, 0).translate(Math.cos(a) * d, 6 + r() * 2.4, Math.sin(a) * d), c: C('#4a6b35').lerp(C('#6b8a45'), r()) }); }
      const m = new THREE.Mesh(mergeGeoms(pp), trimMat); m.position.set(x, y - 0.1, z); m.castShadow = true; scene.add(m);
      colliders.circles.push({ x, z, r: 0.5 });
    };
    pb(-8, ch.d / 2 + 6.5, 3); pb(2, ch.d / 2 + 8, 5); pb(10, ch.d / 2 + 6.5, 8); pb(-ch.w / 2 - 6, -3, 11); pb(ch.w / 2 + 4, ch.d / 2 + 3, 13);
  })();

  // ---------- visitor entrance off Kohala Mountain Road: lava-rock sign wall, rustic ʻōhiʻa rail fence, guard booth ----------
  (function visitorEntrance() {
    const rd = ROADS[1].pts.map(([px, py]) => P(px, py));
    const along = (s0) => { let s1 = s0; for (let i = 0; i < rd.length - 1; i++) { const [ax, az] = rd[i], [bx, bz] = rd[i + 1], L = Math.hypot(bx - ax, bz - az); if (s1 <= L || i === rd.length - 2) { const f = s1 / L, dx = (bx - ax) / L, dz = (bz - az) / L; return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, dx, dz, rx: -dz, rz: dx }; } s1 -= L; } };
    const at = (s0, off) => { const q = along(s0); return [q.x + q.rx * off, q.z + q.rz * off]; };
    // sign wall facing the cars coming in, bronze plaque, a bed of pink ice plant in a grey block planter
    { const q = along(12), [x, z] = at(12, 8.5), y = groundH(x, z), sg = new THREE.Group(); sg.position.set(x, y, z); sg.rotation.y = Math.atan2(-q.dx, -q.dz); scene.add(sg);
      const w = new THREE.Mesh(uvBox(new THREE.BoxGeometry(5.4, 2.5, 1.1), [5.4, 2.5, 1.1], 4, 2), wallMat('stone')); w.position.y = 1.15; w.castShadow = true; w.receiveShadow = true; sg.add(w);
      const pl = canvasTex(512, 180, (c, W2, H2) => { c.fillStyle = '#3a2f22'; c.fillRect(0, 0, W2, H2); c.strokeStyle = '#8a7350'; c.lineWidth = 6; c.strokeRect(6, 6, W2 - 12, H2 - 12); c.fillStyle = '#b49b6c'; c.font = '40px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; ['HAWAII', 'PREPARATORY', 'ACADEMY'].forEach((t, i) => c.fillText(t, W2 / 2, 42 + i * 48)); });
      const plm = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.98), new THREE.MeshStandardMaterial({ map: pl, roughness: 0.45, metalness: 0.5 })); plm.position.set(0, 1.45, 0.56); sg.add(plm);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.45, 1.5), new THREE.MeshStandardMaterial({ color: C('#8d8c88'), roughness: 0.9 })); bed.position.set(0.3, 0.22, 1.35); bed.castShadow = true; sg.add(bed);
      const flowers = canvasTex(128, 128, (c, W2, H2) => { c.fillStyle = '#4c6a33'; c.fillRect(0, 0, W2, H2); const r = rng(4); for (let i = 0; i < 260; i++) { c.fillStyle = r() < 0.75 ? '#d23fb5' : '#e98ad6'; c.beginPath(); c.arc(r() * W2, r() * H2, 2 + r() * 2.5, 0, 7); c.fill(); } });
      const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ map: flowers, roughness: 0.9 })); mound.scale.set(2.5, 0.45, 0.8); mound.position.set(0.3, 0.5, 1.35); sg.add(mound);
      box(x, z, 2.8, 1.6, sg.rotation.y); noVeg.push({ x, z, rot: sg.rotation.y, hw: 3.5, hd: 2.5 });
    }
    // rustic fence of weathered ʻōhiʻa: crooked posts with a single log rail, along both sides of the drive
    const grey = C('#9d9b94'), grey2 = C('#7f7d77'), fp = [], r = rng(17);
    const fence = (s0, s1, off) => {
      let prev = null;
      for (let s2 = s0; s2 <= s1; s2 += 2.6 + r() * 0.4) {
        const [x, z] = at(s2, off + (r() - 0.5) * 0.25), y = groundH(x, z), hgt = 0.65 + r() * 0.35;
        fp.push({ g: new THREE.CylinderGeometry(0.07 + r() * 0.04, 0.1 + r() * 0.04, hgt, 6).rotateZ((r() - 0.5) * 0.15).translate(x, y + hgt / 2 - 0.05, z), c: grey.clone().lerp(grey2, r()) });
        const cur = [x, y + 0.48 + (r() - 0.5) * 0.12, z];
        if (prev) { fp.push(beamPart(prev[0], prev[1], prev[2], cur[0], cur[1], cur[2], 0.1, 0.1, grey)); box((prev[0] + x) / 2, (prev[2] + z) / 2, 0.08, Math.hypot(x - prev[0], z - prev[2]) / 2, Math.atan2(x - prev[0], z - prev[2])); }
        prev = cur;
      }
    };
    fence(15, 95, 4.6); fence(2, 80, -5.2);
    { const [x, z] = at(9, 3.9), y = groundH(x, z); fp.push({ g: new THREE.BoxGeometry(0.24, 0.95, 0.24).translate(x, y + 0.47, z), c: C('#eceae4') }); colliders.circles.push({ x, z, r: 0.2 }); }
    // white three-rail fence running off behind the sign
    { const [x0, z0] = at(16, 11), q = along(16), ex = q.rx, ez = q.rz;
      for (let t = 0; t <= 30; t += 2.4) { const x = x0 + ex * t, z = z0 + ez * t, y = groundH(x, z); fp.push({ g: new THREE.BoxGeometry(0.13, 1.25, 0.13).translate(x, y + 0.62, z), c: C('#f2f1ec') }); }
      for (const hh of [0.35, 0.75, 1.12]) { const ya = groundH(x0, z0), yb2 = groundH(x0 + ex * 30, z0 + ez * 30); fp.push(beamPart(x0, ya + hh, z0, x0 + ex * 30, yb2 + hh, z0 + ez * 30, 0.04, 0.14, C('#f2f1ec'))); }
      box(x0 + ex * 15, z0 + ez * 15, 0.1, 15, Math.atan2(ex, ez)); }
    // guard booth with a striped gate arm across the drive
    { const q = along(125), [x, z] = at(125, 5.0), y = groundH(x, z), bg = new THREE.Group(); bg.position.set(x, y, z); bg.rotation.y = Math.atan2(q.dx, q.dz); scene.add(bg);
      const cream = new THREE.MeshStandardMaterial({ color: C('#efe6cf'), roughness: 0.8 });
      const bx = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.5, 2.0), cream); bx.position.y = 1.25; bx.castShadow = true; bg.add(bx);
      const gl = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.9, 2.04), new THREE.MeshStandardMaterial({ color: C('#33414d'), roughness: 0.2, metalness: 0.4 })); gl.position.y = 1.55; bg.add(gl);
      const rf = new THREE.Mesh(new THREE.ConeGeometry(1.95, 0.75, 4), new THREE.MeshStandardMaterial({ color: C('#6b4e3a'), roughness: 0.8 })); rf.position.y = 2.88; rf.rotation.y = Math.PI / 4; rf.castShadow = true; bg.add(rf);
      const sTex = canvasTex(256, 16, (c, W2, H2) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#c8202c'; c.fillRect(i * 32, 0, 32, H2); } });
      const arm = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.1, 0.1), new THREE.MeshStandardMaterial({ map: sTex, roughness: 0.6 })); arm.position.set(4.7, 1.0, 1.4); bg.add(arm);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.4), cream); post.position.set(1.5, 0.55, 1.4); bg.add(post);
      box(x, z, 1.1, 1.1, bg.rotation.y); noVeg.push({ x, z, rot: bg.rotation.y, hw: 2, hd: 2 });
    }
    const fm = new THREE.Mesh(mergeGeoms(fp), trimMat); fm.castShadow = true; fm.receiveShadow = true; scene.add(fm);
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
    // the Hawaiʻi and US flags stand off the lava-rock west end of the Modern Language Building
    pole(-ml.w / 2 - 10, -4, 13, flagTex.hi);
    pole(-ml.w / 2 - 6, -1.5, 11.5, flagTex.us);
    const [fx, fz] = toWorld(ml, -ml.w / 2 - 8, -2.8);
    const pave = drape(new THREE.CircleGeometry(4.2, 28).rotateX(-Math.PI / 2), fx, fz, ml.rot, 0.07);
    scene.add(Object.assign(new THREE.Mesh(pave, overlayMat(roadTex.path)), { receiveShadow: true }));
    [[2, ml.d / 2 + 6], [10, ml.d / 2 + 6], [-22, ml.d / 2 + 10]].forEach(([lx, lz]) => { const [x, z] = toWorld(ml, lx, lz); bench(x, z, ml.rot); });
    // a row of red Adirondack chairs on a concrete walk beside the lanai, looking out over the lawn to the field
    const ag = adirondackGeo(), zr = ml.d / 2 + 4.2;
    { const [px, pz] = toWorld(ml, -ml.w / 2 + 7.2, zr); const pv = drape(new THREE.PlaneGeometry(13.5, 2.6, 12, 2).rotateX(-Math.PI / 2), px, pz, ml.rot, 0.05); scene.add(Object.assign(new THREE.Mesh(pv, overlayMat(roadTex.path)), { receiveShadow: true })); }
    for (let i = 0; i < 7; i++) {
      const [x, z] = toWorld(ml, -ml.w / 2 + 2 + i * 1.75, zr), y = groundH(x, z);
      const ch = new THREE.Mesh(ag, trimMat); ch.position.set(x, y + 0.04, z); ch.rotation.y = ml.rot + (i % 2 ? 0.06 : -0.05); ch.castShadow = true; scene.add(ch);
      colliders.circles.push({ x, z, r: 0.35 });
      seats.push({ id: 'ad' + i, x, z, y: y + 0.4, ry: ml.rot });
    }
  })();


  // more benches around the fields and lawns
  (function moreBenches() {
    [[-22, uf.hd + 3.5], [22, uf.hd + 3.5]].forEach(([lx, lz]) => { const [x, z] = toWorld(uf, lx, lz); bench(x, z, uf.rot + Math.PI); });
    [[1100, 612, 0], [1180, 605, 0], [600, 402, -0.4], [565, 160, 0.6], [985, 640, -0.3]].forEach(([px, py, r]) => { const [x, z] = P(px, py); bench(x, z, r); });
    // the two grey picnic tables in the nook beside the Student Store, two places on each bench
    for (const [tx, tz] of NOOK.tables) for (const sx of [-1, 1]) for (const dz of [-0.5, 0.5]) seats.push({ id: 'nk' + seats.length, x: tx + sx * 0.68, z: tz + dz, y: Y_LOW + 0.56, ry: -sx * Math.PI / 2 });
    // the concrete tiers by the track, facing the field
    for (let k = 1; k <= TIERS; k++) for (let lx = -19.8; lx <= 19.8; lx += 4.4) {
      const [x, z] = toWorld(TRACK, lx, TIER_Z - TIER_D0 - (k - 1) * TIER_W - 0.2);
      seats.push({ id: 'b' + k + '_' + Math.round(lx), x, z, y: TRACK_Y + TIER_H * k + 0.06, ry: TRACK.rot });
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
    const cartBody = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 });
    const cartGlass = new THREE.MeshStandardMaterial({ color: C('#cfe3ee'), transparent: true, opacity: 0.25, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const cartGeo = (() => {
      const P2 = [], wh = C('#f2f1ec'), dk = C('#1d1e21'), seat = C('#d8c4a0'), seatD = C('#b9a37f'), chrome = C('#c9ccd0'), red = C('#b52a2f'), lamp = C('#fff6d8');
      const box2 = (w, h, d, x, y, z, c, rx) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); P2.push({ g: g.translate(x, y, z), c }); };
      box2(1.2, 0.3, 2.3, 0, 0.42, 0, wh);                                   // tub
      box2(1.22, 0.06, 2.32, 0, 0.3, 0, dk);                                 // rocker strip
      box2(1.23, 0.07, 1.6, 0, 0.5, -0.1, red);                              // HPA red stripe along the sides
      const cowl = new THREE.SphereGeometry(0.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); cowl.scale(1, 0.62, 0.55); P2.push({ g: cowl.translate(0, 0.57, 0.92), c: wh });
      box2(1.18, 0.1, 0.12, 0, 0.36, 1.2, dk);                               // front bumper
      for (const x of [-0.38, 0.38]) { P2.push({ g: new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12).rotateX(Math.PI / 2).translate(x, 0.66, 1.2), c: lamp }); }
      box2(1.12, 0.03, 0.9, 0, 0.58, 0.45, dk);                              // floor mat
      box2(1.06, 0.15, 0.55, 0, 0.72, -0.14, seat);                          // seat cushion
      box2(1.06, 0.48, 0.1, 0, 1.0, -0.43, seat, -0.12);                     // back rest
      box2(0.52, 0.03, 0.5, -0.27, 0.8, -0.14, seatD); box2(0.52, 0.03, 0.5, 0.27, 0.8, -0.14, seatD);
      for (const x of [-0.56, 0.56]) box2(0.06, 0.2, 0.5, x, 0.86, -0.18, wh); // arm rests
      box2(1.12, 0.24, 0.62, 0, 0.67, -0.88, wh);                            // rear deck
      for (const x of [-0.42, 0.42]) box2(0.05, 0.55, 0.05, x, 1.0, -1.12, chrome);
      box2(0.9, 0.05, 0.3, 0, 1.25, -1.12, chrome);                          // bag rack
      for (const [x, z] of [[0.55, 0.78], [-0.55, 0.78], [0.55, -0.78], [-0.55, -0.78]]) {
        P2.push({ g: new THREE.CylinderGeometry(0.22, 0.22, 0.17, 18).rotateZ(Math.PI / 2).translate(x, 0.22, z), c: dk });
        P2.push({ g: new THREE.CylinderGeometry(0.12, 0.12, 0.18, 12).rotateZ(Math.PI / 2).translate(x * 1.01, 0.22, z), c: chrome });
      }
      for (const [x, z] of [[0.52, 0.62], [-0.52, 0.62], [0.52, -0.62], [-0.52, -0.62]]) box2(0.05, 1.3, 0.05, x, 1.25, z, chrome);
      box2(1.3, 0.06, 1.95, 0, 1.93, 0, wh); box2(1.26, 0.03, 1.9, 0, 1.895, 0, dk);  // roof, dark underside
      const wheel = new THREE.TorusGeometry(0.15, 0.025, 6, 18); wheel.rotateX(-1.0); P2.push({ g: wheel.translate(0.27, 1.08, 0.42), c: dk });
      P2.push({ g: new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6).rotateX(0.55).translate(0.27, 0.92, 0.52), c: dk });
      return mergeGeoms(P2);
    })();
    function cartMesh() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(cartGeo, cartBody); body.castShadow = true; body.receiveShadow = true; g.add(body);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.75), cartGlass); glass.position.set(0, 1.5, 0.62); glass.rotation.x = -0.1; g.add(glass);
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
    return shadeFoliage(mergeGeoms(parts), 2.2, seed);
  }
  // light the canopy from inside the tree: darker at the core and underneath, sunlit on the outer tops, speckled like
  // leaves; normals get a little jitter so the foliage glints instead of reading as smooth plastic
  function shadeFoliage(geo, minY, seed) {
    const p = geo.attributes.position, c = geo.attributes.color, n = geo.attributes.normal, r = rng(seed * 31 + 7);
    let cx = 0, cz = 0, k = 0, top = 0;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > minY) { cx += p.getX(i); cz += p.getZ(i); k++; top = Math.max(top, p.getY(i)); }
    cx /= k || 1; cz /= k || 1;
    let maxR = 0.1;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > minY) maxR = Math.max(maxR, Math.hypot(p.getX(i) - cx, p.getZ(i) - cz));
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (y <= minY) continue;
      const out = Math.hypot(p.getX(i) - cx, p.getZ(i) - cz) / maxR, up = n.getY(i), h = (y - minY) / Math.max(0.1, top - minY);
      const f = 0.45 + 0.4 * out + 0.3 * Math.max(0, up) + 0.15 * h + (r() - 0.5) * 0.3, warm = Math.max(0, f - 1) * 0.5;
      c.setXYZ(i, c.getX(i) * (f + warm), c.getY(i) * f * (1 + (r() - 0.5) * 0.1), c.getZ(i) * f * 0.92);
      n.setXYZ(i, n.getX(i) + (r() - 0.5) * 0.35, n.getY(i) + (r() - 0.5) * 0.35, n.getZ(i) + (r() - 0.5) * 0.35);
    }
    n.needsUpdate = true; c.needsUpdate = true; geo.normalizeNormals();
    return geo;
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
    const nb = form === 'bush' ? 5 : (coarse ? 4 : 9 + Math.floor(r() * 3));
    for (let i = 0; i < nb; i++) {
      const a = r() * Math.PI * 2, d = (form === 'wide' ? 0.8 : 0.55) * size * Math.sqrt(r());
      const rad = size * (coarse ? 0.52 + r() * 0.3 : 0.34 + r() * 0.24);
      const g = blob(rad, seed + i * 7, coarse ? 0 : 1);
      g.scale(form === 'wide' ? 1.25 : 1, form === 'wide' ? 0.7 : (form === 'tall' ? 1.25 : 1), form === 'wide' ? 1.25 : 1);
      g.translate(Math.cos(a) * d, trunkH + size * (0.35 + r() * 0.5) + (form === 'tall' ? size * 0.4 * r() : 0), Math.sin(a) * d);
      const col = C('#3b6a2c').lerp(C('#5d8a38'), r()).lerp(C('#2f5426'), r() * 0.5);
      parts.push({ g, c: col });
    }
    return shadeFoliage(mergeGeoms(parts), form === 'bush' ? 0 : trunkH * 0.7, seed);
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
  function inTennis(x, z, pad) { const [lx, lz] = toLocal(TENNIS, x, z); return Math.abs(lx + 3) < TENNIS.hw + 9 + pad && Math.abs(lz) < TENNIS.hd + 2 + pad; }
  function blocked(x, z, pad) { return onTrack(x, z, pad) || isInBuilding(x, z, pad) || onRoad(x, z, pad) || inTennis(x, z, pad) || noVeg.some((r) => inRect(r, x, z, pad)); }

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

  // ---------- roundabout at the Gates Performing Arts Center ----------
  (function roundabout() {
    const [cx, cz] = P(1610, 748), R0 = 10;
    const ring = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; ring.push([cx + Math.cos(a) * R0, cz + Math.sin(a) * R0]); }
    ribbon(ring, 5.5, roadMats.campus, 0.085, roadSpan.campus);
    const island = drape(new THREE.CircleGeometry(R0 - 2.8, 32).rotateX(-Math.PI / 2), cx, cz, 0, 0.1);
    scene.add(Object.assign(new THREE.Mesh(island, overlayMat(null, { color: C('#4f7d33') })), { receiveShadow: true }));
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, rr = i % 3 ? 4 : 1.5; const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr; const b = new THREE.Mesh(BUSH.geo, foliageMat); b.position.set(x, groundH(x, z), z); b.scale.setScalar(0.55 + (i % 3) * 0.15); b.castShadow = true; scene.add(b); }
    colliders.circles.push({ x: cx, z: cz, r: R0 - 3 });
  })();

  // ---------- ground-mounted solar field on the north slope (the Energy Lab's array) ----------
  (function solarField() {
    const items = [];
    for (let row = 0; row < 9; row++) for (let seg = 0; seg < 7; seg++) {
      const [x, z] = toWorld(SOLAR_FIELD, -36 + seg * 12, -24 + row * 6.5);
      items.push({ x, z });
    }
    const pm = panelMatFor(12, 3.2);
    instanced(new THREE.BoxGeometry(11.6, 0.08, 3.2).rotateX(0.42), pm, items, (d, it) => { d.position.set(it.x, groundH(it.x, it.z) + 1.25, it.z); d.rotation.y = SOLAR_FIELD.rot; }, null, true);
    const legs = [];
    for (const it of items) for (const lx of [-5, 0, 5]) { const [x, z] = toWorld({ x: it.x, z: it.z, rot: SOLAR_FIELD.rot }, lx, 0); legs.push({ x, z }); }
    instanced(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ color: C('#9aa0a6'), metalness: 0.6, roughness: 0.4 }), legs, (d, it) => { d.position.set(it.x, groundH(it.x, it.z) - 0.1, it.z); }, null, false);
    items.forEach((it) => box(it.x, it.z, 6, 1.7, SOLAR_FIELD.rot));
  })();

  // ---------- Ulu Mālama outdoor classroom: terrace beds, water tanks and a shed ----------
  (function farm() {
    const tarp = overlayMat(null, { color: C('#2b2b2e'), roughness: 0.6 });
    const soil = overlayMat(null, { color: C('#5a4330'), roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const [x, z] = toWorld(FARM, -15 + (i % 3) * 10, -6 + Math.floor(i / 3) * 8);
      scene.add(Object.assign(new THREE.Mesh(drape(new THREE.PlaneGeometry(8, 4.5, 4, 2).rotateX(-Math.PI / 2), x, z, FARM.rot, 0.08), i % 2 ? tarp : soil), { receiveShadow: true }));
    }
    const tankMat = new THREE.MeshStandardMaterial({ color: C('#3d5a3a'), roughness: 0.7 });
    for (const lx of [12, 16]) { const [x, z] = toWorld(FARM, lx, -5); const t = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.2, 20), tankMat); t.position.set(x, groundH(x, z) + 1.1, z); t.castShadow = true; scene.add(t); colliders.circles.push({ x, z, r: 1.8 }); }
    const [sx, sz] = toWorld(FARM, 14, 5);
    building({ x: sx, z: sz, w: 8, d: 4.5, h: 2.6, rot: FARM.rot, wall: 'wood', ends: 'wood', roof: 'shed', rise: 0.2 });
  })();

  // ---------- name signs: lava-rock base, dark board, cream letters ----------
  function sign(x, z, rot, text, wide) {
    const w = wide ? 2.6 : 1.8, y = groundH(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; scene.add(g);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.4, 0.4), wallMat('stone')); base.position.y = 0.2; base.castShadow = true; g.add(base);
    const tx = canvasTex(512, 96, (c, W2, H2) => {
      c.fillStyle = '#2b2018'; c.fillRect(0, 0, W2, H2); c.strokeStyle = '#c9b48a'; c.lineWidth = 4; c.strokeRect(6, 6, W2 - 12, H2 - 12);
      let fs = 42; c.font = 'bold ' + fs + 'px Georgia, serif'; while (fs > 18 && c.measureText(text).width > W2 - 44) { fs -= 2; c.font = 'bold ' + fs + 'px Georgia, serif'; }
      c.fillStyle = '#f1e9d6'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, W2 / 2, H2 / 2 + 2);
    });
    const face = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.7 }), edge = new THREE.MeshStandardMaterial({ color: C('#2b2018'), roughness: 0.7 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, w * 96 / 512, 0.08), [edge, edge, edge, edge, face, face]);
    board.position.y = 0.4 + w * 48 / 512 + 0.04; board.castShadow = true; g.add(board);
    box(x, z, w / 2 + 0.15, 0.25, rot);
  }
  for (const b of BUILDINGS) {
    if (!b.label || b.cls || b.name === 'tech') continue;
    const [x, z] = toWorld(b, b.name === 'chapel' ? b.w / 2 + 2 : b.name === 'ml' ? b.w / 4 : -b.w / 4, b.d / 2 + 6);
    sign(x, z, b.rot, b.label, b.label.length > 18);
  }
  { const [x, z] = toWorld(POOL, -8, 17); sign(x, z, POOL.rot, 'Dowsett Pool'); }
  sign(198.4, -108.0, Math.PI / 4, 'Kennedy Square');
  sign(192.0, -59.0, 0, 'Ko Kākou Student Union', true);
  sign(226.0, -58.5, 0, 'Taylor Commons');
  { const [x, z] = toWorld(FARM, -20, 12); sign(x, z, FARM.rot, 'Ulu Mālama Terrace Farm', true); }
  { const [x, z] = toWorld(TRACK, -(TL + R_OUT + 6), -8); sign(x, z, TRACK.rot - Math.PI / 2, 'Stanford W. Shutes Track', true); }
  { const [x, z] = P(570, 1203); sign(x, z, -0.45, 'Hawaiʻi Preparatory Academy', true); }

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
    // paved lot: just a few cars
    for (const lxm of [5.5, 17.5, 23, 35]) for (let z = 4; z < pk.hd * 2 - 3; z += 2.6) {
      if (R() < 0.9) continue;
      const [x, zz] = toWorld(pk, lxm - pk.hw, z - pk.hd);
      items.push({ x, z: zz, rot: pk.rot + Math.PI / 2 + (lxm % 2 ? 0 : Math.PI) });
    }
    // a few by the buildings
    for (const [px, py] of [[760, 300], [1240, 600], [1275, 540], [1550, 885], [1200, 190]]) { const [x, z] = P(px, py); items.push({ x, z, rot: R() * 6.28 }); }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45 });
    instanced(geo, mat, items, (d, it) => { d.position.set(it.x, groundH(it.x, it.z) + 0.05, it.z); d.rotation.y = it.rot; }, () => C(paints[(R() * paints.length) | 0]), true);
    items.forEach((it) => colliders.circles.push({ x: it.x, z: it.z, r: 1.5 }));
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
  // distant mountains light themselves and fade into the haze colour, more so low down and the farther they are
  const makeFarMat = (extra) => new THREE.ShaderMaterial({
    vertexColors: true, fog: false, uniforms: Object.assign({ uExtra: { value: extra } }, hazeUniforms),
    vertexShader: 'varying vec3 vC; varying vec3 vN; varying float vY; void main(){ vC = color; vN = normalize(mat3(modelMatrix) * normal); vY = (modelMatrix * vec4(position, 1.0)).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uSun, uSunCol, uAmb, uHaze; uniform float uHazeAmt, uExtra; varying vec3 vC; varying vec3 vN; varying float vY;
      void main(){ float l = max(dot(normalize(vN), uSun), 0.0); vec3 c = vC * (0.35 + uAmb + uSunCol * l * 1.4);
      c = mix(c, uHaze, clamp(uHazeAmt + uExtra + (1.0 - smoothstep(-250.0, 450.0, vY)) * 0.3, 0.0, 0.96));
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
      }`,
  });
  const farMat = makeFarMat(0);
  // Mauna Kea, 1/5 scale so it keeps its true angular size from Waimea (bearing ~120°)
  (function maunaKea() {
    // broad shield that steepens toward a summit dotted with cinder cones
    const prof = []; for (let i = 0; i <= 90; i++) { const t = i / 90; prof.push(new THREE.Vector2(5200 * (1 - t), 700 * Math.pow(Math.sin(t * Math.PI / 2), 1.6))); }
    const geo = new THREE.LatheGeometry(prof, 192);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const low = C('#4f5a3c'), mid = C('#5a4a4a'), high = C('#6a5150'), snow = C('#f6f5f6'), cinder = C('#7d4a3a');
    const r = rng(71), cones = [];
    for (let k = 0; k < 22; k++) { const a = r() * Math.PI * 2, d = 900 + r() * 2300; cones.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, h: 16 + r() * 30, rad: 110 + r() * 90 }); }
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i); let y = p.getY(i); const a = Math.atan2(z, x);
      if (y > 520) y += (Math.sin(a * 9) * 14 + Math.sin(a * 23 + 1) * 9 + Math.sin(a * 41) * 5) * smooth(520, 700, y);
      // gullies cut down the flanks, deepest mid-slope
      const gul = Math.pow(Math.abs(Math.sin(a * 26 + Math.sin(a * 5) * 2.5)), 4) * smooth(120, 380, y) * (1 - smooth(540, 680, y));
      y -= gul * 10;
      let cw = 0;
      for (const cn of cones) { const q = ((x - cn.x) * (x - cn.x) + (z - cn.z) * (z - cn.z)) / (cn.rad * cn.rad); if (q < 4) { const w = Math.exp(-q * 1.6); y += cn.h * w; cw = Math.max(cw, w); } }
      p.setY(i, y);
      c.copy(low).lerp(mid, smooth(120, 420, y)).lerp(high, smooth(420, 600, y)).lerp(cinder, cw * 0.8).multiplyScalar(1 - gul * 0.18);
      if (y > 590 + Math.sin(a * 7) * 22 + Math.sin(a * 19) * 12) c.copy(snow);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, farMat);
    const b = 122 * RAD; m.position.set(Math.sin(b) * 8000, -60, -Math.cos(b) * 8000); scene.add(m);
  })();
  // a shield volcano at its true angular size from Waimea: a broad dome stretched along its rift zones, lava-dark,
  // ragged on the skyline, a few cones near the top; its foot sits below the far ground and fades into the haze
  function shield({ brg, dist, R, top, stretch, axis, cols, bumps, caldera, seed, extra }) {
    const prof = []; for (let i = 0; i <= 64; i++) { const t = i / 64; prof.push(new THREE.Vector2(R * (1 - t), -380 + (top + 380) * (1 - Math.pow(1 - t, 1.8)))); }
    const geo = new THREE.LatheGeometry(prof, 160);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color(), r = rng(seed);
    const cones = []; for (let k = 0; k < bumps; k++) { const a = r() * Math.PI * 2, d = R * (0.05 + r() * 0.4); cones.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, h: 14 + r() * 26, rad: R * (0.03 + r() * 0.025) }); }
    const [lo, mid, hi] = cols.map(C);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), t = 1 - Math.hypot(x, z) / R;
      let y = p.getY(i);
      y += (Math.sin(a * 11 + seed) * 0.5 + Math.sin(a * 29 + seed * 2) * 0.3 + Math.sin(a * 53) * 0.2) * 14 * smooth(0.45, 1, t);
      if (caldera) y -= caldera * smooth(0.9, 0.99, t);
      for (const cn of cones) { const q = ((x - cn.x) * (x - cn.x) + (z - cn.z) * (z - cn.z)) / (cn.rad * cn.rad); if (q < 4) y += cn.h * Math.exp(-q * 1.6); }
      p.setY(i, y);
      const flow = 0.86 + 0.14 * Math.sin(a * 17 + Math.sin(a * 4 + seed) * 3);
      c.copy(lo).lerp(mid, smooth(-150, top * 0.55, y)).lerp(hi, smooth(top * 0.55, top, y)).multiplyScalar(flow);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.scale(stretch, 1, 1); geo.rotateY(axis);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, makeFarMat(extra));
    const b = brg * RAD; m.position.set(Math.sin(b) * dist, 0, -Math.cos(b) * dist); scene.add(m);
  }
  // Mauna Loa, due south past the saddle: the long, low dome with its summit caldera
  shield({ brg: 174, dist: 13000, R: 6400, top: 700, stretch: 1.35, axis: Math.PI / 4, cols: ['#46503a', '#4d4645', '#5c514d'], bumps: 6, caldera: 22, seed: 5, extra: 0.05 });
  // Hualālai to the south-west, nearer and smaller, its top crowded with cones
  shield({ brg: 210, dist: 8800, R: 3200, top: 345, stretch: 1.4, axis: -Math.PI / 4, cols: ['#42513a', '#4a4a3f', '#55504a'], bumps: 14, caldera: 0, seed: 9, extra: 0 });

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
    uCloud: { value: new THREE.Color() }, uTime: { value: 0 }, uCover: { value: 0.45 }, uRainbow: { value: 0 }, uStars: { value: 0 }, uNight: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(15000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir;
      uniform vec3 uSun, uZenith, uHorizon, uSunCol, uCloud; uniform float uTime, uCover, uRainbow, uStars, uNight;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
      vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      float hash3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      // one star at a random spot in some of the cells of a 3D grid the sky dome cuts through; brighter ones are rarer
      float starLayer(vec3 d, float scale, float keep, float rad){
        vec3 p = d * scale, c = floor(p), f = fract(p);
        float h = hash3(c);
        if (h < keep) return 0.0;
        vec3 o = vec3(hash3(c + 17.3), hash3(c + 41.9), hash3(c + 73.1)) * 0.6 + 0.2;
        float b = pow((h - keep) / (1.0 - keep), 2.4);
        float tw = 0.78 + 0.22 * sin(uTime * (1.3 + h * 3.0) + h * 70.0);
        return (0.3 + 2.8 * b) * tw * smoothstep(rad, rad * 0.2, length(f - o));
      }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.6, y), 0.55));
        float sd = max(dot(d, uSun), 0.0);
        col += uSunCol * (pow(sd, 5.0) * 0.16 + pow(sd, 40.0) * 0.35) * (1.0 - 0.75 * uNight);
        // the sun, or at night a smaller mottled moon
        float disc = mix(smoothstep(0.99955, 0.99985, sd), smoothstep(0.99988, 0.99994, sd), uNight);
        col += uSunCol * disc * mix(14.0, 2.6 * (0.78 + 0.3 * noise(d.xz * 700.0 + 3.0)), uNight);
        float ang = degrees(acos(clamp(dot(d, -uSun), -1.0, 1.0)));
        float rb = (ang - 40.4) / 2.3;
        float above = smoothstep(0.0, 0.05, y);
        if (rb > 0.0 && rb < 1.0) col += hue(0.78 * (1.0 - rb)) * sin(rb * 3.14159) * uRainbow * 0.2 * above;
        float rb2 = (ang - 50.5) / 3.2;
        if (rb2 > 0.0 && rb2 < 1.0) col += hue(0.78 * rb2) * sin(rb2 * 3.14159) * uRainbow * 0.06 * above;
        if (ang < 40.4) col += vec3(0.02) * uRainbow * above;
        if (y > 0.0) {
          if (uStars > 0.0) {
            // the Milky Way: a soft band across the sky, thick with faint stars
            vec3 mn = normalize(vec3(0.92, 0.12, -0.3)), e1 = normalize(cross(mn, vec3(0.0, 1.0, 0.0))), e2 = cross(mn, e1);
            float md = dot(d, mn), band = exp(-md * md / 0.028);
            float dust = fbm(vec2(dot(d, e1), dot(d, e2)) * 6.0 + vec2(md * 17.0, -md * 11.0) + 11.0);
            float s = starLayer(d, 150.0, 0.84 - 0.12 * band, 0.17) + 0.45 * starLayer(d.zxy, 290.0, 0.88 - 0.14 * band, 0.26);
            vec3 sc = mix(vec3(0.76, 0.83, 1.0), vec3(1.0, 0.9, 0.76), hash3(floor(d * 150.0) + 5.0));
            col += (sc * s + vec3(0.5, 0.56, 0.82) * band * (0.25 + smoothstep(0.35, 0.8, dust)) * 0.17) * uStars * smoothstep(0.0, 0.16, y);
          }
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

  // ---------- a gray cat that wanders the upper lawn ----------
  // Its route depends only on the clock, so everyone sees it in the same place without sharing anything.
  const cat = (() => {
    const fur = new THREE.MeshStandardMaterial({ color: C('#8a8d93'), roughness: 0.9 }), dark = new THREE.MeshStandardMaterial({ color: C('#5f6268'), roughness: 0.9 });
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body); scene.add(g);
    const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    add(body, new THREE.SphereGeometry(0.13, 14, 10), fur, 0, 0.24, 0).scale.set(0.9, 0.85, 2.0);
    const head = new THREE.Group(); head.position.set(0, 0.36, 0.27); body.add(head);
    add(head, new THREE.SphereGeometry(0.1, 14, 10), fur, 0, 0, 0).scale.set(1.05, 0.95, 0.95);
    for (const sx of [-1, 1]) {
      const ear = add(head, new THREE.ConeGeometry(0.035, 0.07, 4), dark, sx * 0.055, 0.09, -0.01); ear.rotation.z = -sx * 0.25;
      add(head, new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshStandardMaterial({ color: C('#9fd36a'), emissive: C('#2a3a10'), roughness: 0.3 }), sx * 0.04, 0.02, 0.085);
    }
    add(head, new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshStandardMaterial({ color: C('#d48a95') }), 0, -0.015, 0.098);
    const legs = [];
    for (const [x, z] of [[-0.06, 0.15], [0.06, 0.15], [-0.06, -0.15], [0.06, -0.15]]) { const pv = new THREE.Group(); pv.position.set(x, 0.2, z); body.add(pv); add(pv, new THREE.CylinderGeometry(0.022, 0.02, 0.2, 6), fur, 0, -0.1, 0); legs.push(pv); }
    const tail = new THREE.Group(); tail.position.set(0, 0.3, -0.25); body.add(tail);
    const tcurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.08, -0.12), new THREE.Vector3(0, 0.22, -0.18), new THREE.Vector3(0, 0.32, -0.12)]);
    add(tail, new THREE.TubeGeometry(tcurve, 12, 0.02, 6), dark, 0, 0, 0);
    // route on the open lawn around the upper field and in front of Modern Languages
    const ml = BUILDINGS.find((b) => b.name === 'ml');
    const pts = [[-42, -24], [-10, -29], [30, -27], [48, -8], [44, 18], [8, 27], [-30, 24], [-50, 4]].map(([lx, lz]) => toWorld(uf, lx, lz));
    const legsT = []; let total = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const pause = 5 + (i * 7) % 9;
      legsT.push({ a, b, walk: d / 0.75, pause, sit: i % 3 === 1 }); total += d / 0.75 + pause;
    }
    return { g, body, head, legs, tail, legsT, total };
  })();
  function updateCat(t) {
    let tt = (Date.now() / 1000) % cat.total, seg = cat.legsT[0];
    for (const s2 of cat.legsT) { if (tt < s2.walk + s2.pause) { seg = s2; break; } tt -= s2.walk + s2.pause; }
    const walking = tt < seg.walk, u = walking ? tt / seg.walk : 1;
    const x = seg.a[0] + (seg.b[0] - seg.a[0]) * u, z = seg.a[1] + (seg.b[1] - seg.a[1]) * u;
    cat.g.position.set(x, groundH(x, z), z);
    cat.g.rotation.y = Math.atan2(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
    const ph = t * 9;
    cat.legs.forEach((l, i) => { l.rotation.x = walking ? Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.5 : 0; });
    const sitting = !walking && seg.sit;
    cat.body.rotation.x = sitting ? -0.35 : 0; cat.body.position.y = sitting ? -0.05 : 0;
    cat.head.rotation.y = walking ? 0 : Math.sin(t * 0.7) * 0.6;
    cat.tail.rotation.z = Math.sin(t * (walking ? 3 : 1.2)) * 0.35;
  }

  // ---------- time of day ----------
  const TIMES = {
    morning: { label: 'Morning', az: 98, el: 17, sun: '#ffe3c4', sunI: 2.5, sky: '#c4daf2', ground: '#4e5a33', hemiI: 0.8, zenith: '#2f68c6', horizon: '#c9dcee', fog: '#c4d6e6', haze: '#b6cbe0', hazeAmt: 0.32, cloud: '#ffffff', cover: 0.44, rainbow: 0, exposure: 0.95 },
    afternoon: { label: 'Afternoon', az: 225, el: 42, sun: '#fff4e4', sunI: 3.0, sky: '#c6dcf4', ground: '#56683a', hemiI: 0.9, zenith: '#2a63c9', horizon: '#bfd7ee', fog: '#c2d6e8', haze: '#b2c8de', hazeAmt: 0.3, cloud: '#ffffff', cover: 0.5, rainbow: 0.6, exposure: 0.9 },
    golden: { label: 'Golden hour', az: 252, el: 9, sun: '#ffc48c', sunI: 2.8, sky: '#ccd5ea', ground: '#5c5a36', hemiI: 0.72, zenith: '#3b67b6', horizon: '#f2d4b8', fog: '#e4d3c2', haze: '#d8c6bc', hazeAmt: 0.3, cloud: '#ffe8d2', cover: 0.42, rainbow: 0.75, exposure: 1.0 },
    sunset: { label: 'Sunset', az: 258, el: 1.5, sun: '#ff9466', sunI: 1.5, sky: '#b9a6c6', ground: '#4b4232', hemiI: 0.62, zenith: '#3a4a8c', horizon: '#ffb194', fog: '#e4b2a6', haze: '#d6a6a6', hazeAmt: 0.28, cloud: '#ffc0ae', cover: 0.4, rainbow: 0, exposure: 1.1 },
    // a clear upland night: moon over Mauna Kea, stars to the horizon, lamps and windows lit
    night: { label: 'Night', az: 128, el: 38, sun: '#a8bcef', sunI: 0.4, sky: '#41508a', ground: '#161c15', hemiI: 0.44, zenith: '#02061a', horizon: '#17223f', fog: '#10182b', haze: '#17203a', hazeAmt: 0.5, cloud: '#2f3953', cover: 0.16, rainbow: 0, exposure: 1.3, stars: 1, night: 1 },
  };
  // after dark the clerestory glass glows warm: panes lit, frames dark
  const glassGlowTex = canvasTex(512, 128, (g, W, H) => {
    g.fillStyle = '#000000'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 64) { const gr = g.createLinearGradient(0, 8, 0, H - 8); gr.addColorStop(0, '#ffe2b0'); gr.addColorStop(1, '#c98a4a'); g.fillStyle = gr; g.fillRect(x + 6, 8, 52, H - 16); }
  });
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
    skyUniforms.uStars.value = T.stars || 0; skyUniforms.uNight.value = T.night || 0;
    for (const n of nightLights) n.light.intensity = T.night ? n.I : 0;
    for (const n of nightGlows) n.mat.emissiveIntensity = T.night ? n.I : 0;
    const gl = wallMats.glass;
    if (gl) { if (!gl.emissiveMap) { gl.emissiveMap = glassGlowTex; gl.needsUpdate = true; } gl.emissive.set(T.night ? 0x9a7650 : 0x000000); }
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
    updateCat(t);
    for (const f of fans) f.rotation.y = t * 2.6;
    if (waterTexRef) { waterTexRef.offset.x = (t * 0.02) % 1; waterTexRef.offset.y = (t * 0.013) % 1; }
    skyUniforms.uTime.value = t;
    return gust;
  }

  // ---------- batch the static scenery ----------
  // Every mesh that never moves after it is built is merged with the others sharing its material, its shadow settings
  // and its 160 m cell of the map, so the scene draws in a few hundred calls instead of thousands while whole cells can
  // still be culled. Plain single-colour materials are folded into vertex colours, so they merge across colours too.
  // Things that move or change (flags, fans, golf carts, the cat, the sky) are left alone.
  (function staticBatch() {
    const skip = new Set(), flagGeos = new Set(flags.map((f) => f.geo));
    for (const root of [...fans, cat.g, ...carts.map((c) => c.mesh), sky]) root.traverse((o) => skip.add(o));
    scene.updateMatrixWorld(true);
    const buckets = new Map(), done = [], geoOf = new Map(), CELL = 160, v = new THREE.Vector3();
    const usable = (m) => m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshBasicMaterial) && !m.transparent && m.visible !== false;
    scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || skip.has(o) || flagGeos.has(o.geometry) || !o.visible) return;
      const geo = o.geometry, mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!geo.attributes.position || geo.attributes.position.count > 30000 || mats.some((m) => m.transparent)) return;
      let g2 = geo.index ? geo.toNonIndexed() : geo.clone();
      if (!g2.attributes.normal) g2.computeVertexNormals();
      g2.applyMatrix4(o.matrixWorld);
      g2.computeBoundingSphere(); v.copy(g2.boundingSphere.center);
      const cell = Math.floor(v.x / CELL) + ',' + Math.floor(v.z / CELL);
      const ranges = Array.isArray(o.material) ? (geo.groups.length ? g2.groups : [{ start: 0, count: g2.attributes.position.count, materialIndex: 0 }]) : [{ start: 0, count: g2.attributes.position.count, materialIndex: 0 }];
      let used = false;
      for (const rg of ranges) {
        const m = mats[rg.materialIndex];
        if (!usable(m)) continue;
        const plain = m.isMeshStandardMaterial && !m.map && !m.vertexColors && !m.emissiveMap && m.emissive.getHex() === 0 && !m.polygonOffset && m.opacity === 1;
        const sig = plain ? 'c' : (g2.attributes.uv ? 'u' : '') + (m.vertexColors && g2.attributes.color ? 'c' : '');
        const look = plain ? 'plain' + Math.round(m.roughness * 10) + '/' + Math.round(m.metalness * 10) + '/' + m.side : m.uuid;
        const key = look + '|' + cell + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + sig;
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { m: plain ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: m.roughness, metalness: m.metalness, side: m.side }) : m, cast: o.castShadow, receive: o.receiveShadow, sig, parts: [] }));
        b.parts.push({ g: g2, start: rg.start, count: Math.min(rg.count, g2.attributes.position.count - rg.start), color: plain ? m.color : null });
        used = true;
      }
      if (used) { done.push(o); geoOf.set(o, g2); }
    });
    const merged = new Set();
    for (const b of buckets.values()) {
      if (b.parts.length < 2) continue;
      let n = 0; for (const q of b.parts) n += q.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = b.sig.includes('u') ? new Float32Array(n * 2) : null, col = b.sig.includes('c') ? new Float32Array(n * 3) : null;
      let o = 0;
      for (const q of b.parts) {
        const A = q.g.attributes;
        pos.set(A.position.array.subarray(q.start * 3, (q.start + q.count) * 3), o * 3);
        nor.set(A.normal.array.subarray(q.start * 3, (q.start + q.count) * 3), o * 3);
        if (uv) uv.set(A.uv.array.subarray(q.start * 2, (q.start + q.count) * 2), o * 2);
        if (col && q.color) for (let k = 0; k < q.count; k++) { col[(o + k) * 3] = q.color.r; col[(o + k) * 3 + 1] = q.color.g; col[(o + k) * 3 + 2] = q.color.b; }
        else if (col) col.set(A.color.array.subarray(q.start * 3, (q.start + q.count) * 3), o * 3);
        o += q.count;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, b.m); mesh.castShadow = b.cast; mesh.receiveShadow = b.receive; mesh.matrixAutoUpdate = false;
      scene.add(mesh);
      for (const q of b.parts) merged.add(q);
    }
    // drop the originals whose every part went into a merged mesh; the rest stay as they were
    const partsOf = new Map();
    for (const b of buckets.values()) for (const q of b.parts) { if (!partsOf.has(q.g)) partsOf.set(q.g, []); partsOf.get(q.g).push(q); }
    for (const o of done) {
      const qs = partsOf.get(geoOf.get(o)) || [];
      if (qs.length && qs.every((q) => merged.has(q))) o.parent.remove(o);
    }
  })();

  // spawn on the north-east straight in front of the bleachers, facing down the track
  const [sx, sz] = toWorld(TRACK, -20, -(R_IN + 3.6));
  const fwd = [Math.cos(TRACK.rot), -Math.sin(TRACK.rot)];
  const roomAt = (x, z) => rooms.find((r) => inRect(r, x, z)) || null;
  rooms.forEach((r) => { r.contains = (x, z, m) => inRect(r, x, z, -(m || 0)); });
  const spawn = { x: sx, z: sz, ry: Math.atan2(fwd[0], fwd[1]), camYaw: Math.atan2(-fwd[0], -fwd[1]) };
  const bounds = { minX: -260, maxX: 640, minZ: -340, maxZ: 260 };

  const field = { x: TRACK.x, z: TRACK.z, rot: TRACK.rot, halfL: FIELD_L / 2, halfW: FIELD_W / 2, rIn: R_IN, rOut: R_OUT, TL, y: groundH(0, 0) };
  tennis.inside = (x, z) => { const [lx, lz] = toLocal(tennis, x, z); return Math.abs(lx) < tennis.hw - 0.3 && Math.abs(lz) < tennis.hd - 0.3; };
  return { scene, renderer, camera, groundH, colliders, flags, C, spawn, bounds, update, setTime, setQuality, times: TIMES, get timeKey() { return timeKey; },
    seats, carts, placeCart, cartSeat, field, tennis, pool, inPool, cat: cat.g, toLocal, toWorld, roomAt, boards, nook: NOOK,
    setStars: (v) => { skyUniforms.uStars.value = v; } };
}

window.HPA = { createWorld };
})();

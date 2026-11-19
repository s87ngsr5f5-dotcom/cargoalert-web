// CargoAlert v3.5 Studio Commercial Flatbed Truck Model (Top-Down + True-Projection 3D Commercial Truck)
// Authentic Fuso Canter / Hino 300 proportions, curved wheel wells, dual rear tires, LED headlights,
// textured flatbed, wood pallets & strapped cargo, plus zero-overlap perimeter telemetry callouts.

const ISO_OX = 114, ISO_OY = 310;
const UX = 0.84, UY = -0.35;
const VX = 0.78, VY = 0.42;
const ZY = -0.90;

function iso(u, v, z) {
  return [
    +(ISO_OX + u * UX + v * VX).toFixed(1),
    +(ISO_OY + u * UY + v * VY + z * ZY).toFixed(1),
  ];
}
function isoPts(arr) {
  return arr.map(([u, v, z]) => iso(u, v, z).join(',')).join(' ');
}

function isoCircleUZ(u0, v0, z0, r, steps = 32, startDeg = 0, endDeg = 360) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((startDeg + (endDeg - startDeg) * (i / steps)) * Math.PI) / 180;
    pts.push(iso(u0 + r * Math.cos(a), v0, z0 + r * Math.sin(a)));
  }
  return pts;
}

// Well-spaced, zero-collision 3D pin coordinates on cargo shoulders, headboard, tailgate & side hooks
const C_FC = iso(104, 18, 122);  // Left-top of steel headboard
const C_FL = iso(144, 16, 88);   // Front-left cargo shoulder strap
const C_ML = iso(214, 16, 88);   // Mid-left cargo shoulder strap
const C_RL = iso(298, 16, 88);   // Rear-left cargo shoulder strap
const C_FR = iso(144, 124, 62);  // Front-right flatbed rail hook
const C_MR = iso(208, 124, 62);  // Mid-right flatbed rail hook (clear ahead of rear tire!)
const C_RR = iso(298, 124, 62);  // Rear-right flatbed rail hook
const C_RC = iso(336, 62, 65);   // Rear tailgate top center

export const MODEL_SLOTS = [
  { id: 'front-left',   label: '前左', truck: { x: 194, y: 178, strap: 'h-front', side: 'left'   }, cargo: { x: C_FL[0], y: C_FL[1], strap: 'c-front', side: 'top-left'     } },
  { id: 'front-center', label: '前中', truck: { x: 300, y: 152, strap: 'v-front', side: 'top'    }, cargo: { x: C_FC[0], y: C_FC[1], strap: 'c-top-f', side: 'top-left'     } },
  { id: 'front-right',  label: '前右', truck: { x: 406, y: 178, strap: 'h-front', side: 'right'  }, cargo: { x: C_FR[0], y: C_FR[1], strap: 'c-front', side: 'bottom-right' } },
  { id: 'mid-left',     label: '中左', truck: { x: 194, y: 248, strap: 'h-mid',   side: 'left'   }, cargo: { x: C_ML[0], y: C_ML[1], strap: 'c-mid',   side: 'top-left'     } },
  { id: 'mid-right',    label: '中右', truck: { x: 406, y: 248, strap: 'h-mid',   side: 'right'  }, cargo: { x: C_MR[0], y: C_MR[1], strap: 'c-mid',   side: 'bottom-right' } },
  { id: 'rear-left',    label: '後左', truck: { x: 194, y: 318, strap: 'h-rear',  side: 'left'   }, cargo: { x: C_RL[0], y: C_RL[1], strap: 'c-rear',  side: 'top-left'     } },
  { id: 'rear-center',  label: '後尾', truck: { x: 300, y: 348, strap: 'v-rear',  side: 'bottom' }, cargo: { x: C_RC[0], y: C_RC[1], strap: 'c-top-r', side: 'tail'         } },
  { id: 'rear-right',   label: '後右', truck: { x: 406, y: 318, strap: 'h-rear',  side: 'right'  }, cargo: { x: C_RR[0], y: C_RR[1], strap: 'c-rear',  side: 'bottom-right' } },
];

export const PRESETS = {
  diagonal: { name: '對角固定', s1: 'front-left',   s2: 'rear-right'  },
  front:    { name: '前側雙綁', s1: 'front-left',   s2: 'front-right' },
  left:     { name: '左側雙綁', s1: 'front-left',   s2: 'rear-left'   },
  center:   { name: '前後軸向', s1: 'front-center', s2: 'rear-center' },
};

const STORAGE_PREFIX = 'cargoalert.model.layout.v1.';
const THEME_KEY = 'cargoalert.theme.v1';
const SVG_NS = 'http://www.w3.org/2000/svg';
const VB_W = 600, VB_H = 420;

function el(tag, attrs = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== null) node.textContent = text;
  return node;
}

export function initThemeToggle(btnId = 'themeToggle') {
  const apply = theme => {
    document.documentElement.dataset.theme = theme;
    const btn = document.getElementById(btnId);
    if (btn) {
      const dark = theme !== 'light';
      btn.textContent = dark ? '☀️ 淺色' : '🌙 深色';
      btn.setAttribute('aria-pressed', String(!dark));
    }
  };
  let saved = 'dark';
  try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch {}
  apply(saved);
  document.getElementById(btnId)?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    apply(next);
  });
}

export function slotById(id) {
  return MODEL_SLOTS.find(s => s.id === id) || MODEL_SLOTS[0];
}

export function createCargoModel({ containerId, onChange, onSelectSensor } = {}) {
  let deviceKey = 'default';
  let activeSensor = 1;
  let draggingSensor = 0;
  let hoverSlotId = '';
  let config = {
    view: 'truck',
    s1: 'front-left',
    s2: 'rear-right',
    note1: '',
    note2: '',
  };
  let liveSensors = [
    { sensorId: 1, valid: false, calibrated: false, state: 'offline', delta: null, fault: 0 },
    { sensorId: 2, valid: false, calibrated: false, state: 'offline', delta: null, fault: 0 },
  ];
  let liveStale = true;

  function load(devId) {
    deviceKey = devId || 'default';
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + deviceKey) || 'null');
      if (saved && typeof saved === 'object') {
        if (saved.view === 'truck' || saved.view === 'cargo') config.view = saved.view;
        if (MODEL_SLOTS.some(s => s.id === saved.s1)) config.s1 = saved.s1;
        if (MODEL_SLOTS.some(s => s.id === saved.s2) && saved.s2 !== config.s1) config.s2 = saved.s2;
        if (typeof saved.note1 === 'string') config.note1 = saved.note1.slice(0, 20);
        if (typeof saved.note2 === 'string') config.note2 = saved.note2.slice(0, 20);
      }
    } catch {}
    render();
    onChange?.(getPlacementInfo());
  }

  function save() {
    try { localStorage.setItem(STORAGE_PREFIX + deviceKey, JSON.stringify(config)); } catch {}
  }

  function getPlacementInfo() {
    const p1 = slotById(config.s1), p2 = slotById(config.s2);
    return {
      view: config.view,
      activeSensor,
      1: { slotId: p1.id, label: p1.label, note: config.note1.trim() },
      2: { slotId: p2.id, label: p2.label, note: config.note2.trim() },
    };
  }

  function formatLocation(sensorId) {
    const info = getPlacementInfo()[sensorId];
    if (!info) return '';
    return info.note ? `${info.label}·${info.note}` : info.label;
  }

  function placeSensor(sensorId, slotId) {
    if (!MODEL_SLOTS.some(s => s.id === slotId)) return;
    if (sensorId === 1) {
      if (config.s2 === slotId) config.s2 = config.s1;
      config.s1 = slotId;
    } else {
      if (config.s1 === slotId) config.s1 = config.s2;
      config.s2 = slotId;
    }
    save();
    render();
    onChange?.(getPlacementInfo());
  }

  function setView(view) {
    if (view !== 'truck' && view !== 'cargo') return;
    config.view = view;
    save();
    render();
  }

  function setActiveSensor(id) {
    activeSensor = id === 2 ? 2 : 1;
    render();
    onSelectSensor?.(activeSensor);
  }

  function applyPreset(presetKey) {
    const p = PRESETS[presetKey];
    if (!p) return;
    config.s1 = p.s1;
    config.s2 = p.s2;
    save();
    render();
    onChange?.(getPlacementInfo());
  }

  function setNote(sensorId, value) {
    const clean = String(value || '').slice(0, 20);
    if (sensorId === 1) config.note1 = clean;
    else config.note2 = clean;
    save();
    onChange?.(getPlacementInfo());
  }

  function sensorVisualState(s) {
    if (!s || liveStale) return 'offline';
    if (!s.valid || s.fault) return 'sensor_error';
    if (!s.calibrated) return 'uncalibrated';
    return s.state || 'normal';
  }

  function strapStateFor(strapKey) {
    const states = [];
    for (const [idx, slotId] of [[0, config.s1], [1, config.s2]]) {
      const slot = slotById(slotId);
      const key = config.view === 'truck' ? slot.truck.strap : slot.cargo.strap;
      if (key === strapKey) states.push(sensorVisualState(liveSensors[idx]));
    }
    if (!states.length) return 'idle';
    if (states.includes('alarm')) return 'alarm';
    if (states.includes('confirming') || states.includes('warning')) return 'confirming';
    if (states.includes('sensor_error')) return 'sensor_error';
    if (states.includes('normal')) return 'normal';
    return 'standby';
  }

  function clientToSvg(svg, clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * VB_W,
      y: ((clientY - rect.top) / rect.height) * VB_H,
    };
  }

  function nearestSlot(x, y, viewName) {
    let best = null, bestD = 9999;
    for (const s of MODEL_SLOTS) {
      const pt = viewName === 'truck' ? s.truck : s.cargo;
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return bestD <= 68 ? best : null;
  }

  function attachDragHandlers(svg, viewName) {
    const finishDrag = () => {
      if (!draggingSensor) return;
      const sId = draggingSensor;
      const target = hoverSlotId;
      draggingSensor = 0;
      hoverSlotId = '';
      if (target) placeSensor(sId, target);
      else render();
    };
    svg.addEventListener('pointermove', evt => {
      if (!draggingSensor) return;
      const p = clientToSvg(svg, evt.clientX, evt.clientY);
      const near = nearestSlot(p.x, p.y, viewName);
      const nextId = near ? near.id : '';
      if (nextId !== hoverSlotId) {
        hoverSlotId = nextId;
        svg.querySelectorAll('.cm-slot').forEach(g => {
          g.classList.toggle('cm-drop-target', g.dataset.slot === hoverSlotId);
        });
      }
    });
    svg.addEventListener('pointerup', finishDrag);
    svg.addEventListener('pointercancel', finishDrag);
  }

  function appendDefs(svg) {
    const defs = el('defs');

    // Subtle blueprint grid
    const pat = el('pattern', { id: 'cmGrid', width: 24, height: 24, patternUnits: 'userSpaceOnUse' });
    pat.append(el('path', { d: 'M 24 0 L 0 0 0 24', fill: 'none', stroke: 'rgba(130,192,224,0.055)', 'stroke-width': 1 }));
    defs.append(pat);

    // Commercial pearl-white truck cab paint gradients
    const cabRoof = el('linearGradient', { id: 'cabRoof', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    cabRoof.append(
      el('stop', { offset: '0%', 'stop-color': '#ffffff' }),
      el('stop', { offset: '55%', 'stop-color': '#e7f2f9' }),
      el('stop', { offset: '100%', 'stop-color': '#c7dceb' }),
    );
    const cabFront = el('linearGradient', { id: 'cabFront', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    cabFront.append(
      el('stop', { offset: '0%', 'stop-color': '#f2f8fc' }),
      el('stop', { offset: '62%', 'stop-color': '#d3e5f0' }),
      el('stop', { offset: '100%', 'stop-color': '#9eb9cc' }),
    );
    const cabSide = el('linearGradient', { id: 'cabSide', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    cabSide.append(
      el('stop', { offset: '0%', 'stop-color': '#ddebf5' }),
      el('stop', { offset: '62%', 'stop-color': '#b7d0e0' }),
      el('stop', { offset: '100%', 'stop-color': '#87a5ba' }),
    );
    defs.append(cabRoof, cabFront, cabSide);

    // Commercial drop-side flatbed wall paint (classic steel blue)
    const railSide = el('linearGradient', { id: 'railSide', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    railSide.append(
      el('stop', { offset: '0%', 'stop-color': '#387094' }),
      el('stop', { offset: '100%', 'stop-color': '#1e425b' }),
    );
    const railFar = el('linearGradient', { id: 'railFar', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    railFar.append(
      el('stop', { offset: '0%', 'stop-color': '#20455e' }),
      el('stop', { offset: '100%', 'stop-color': '#142d3e' }),
    );
    defs.append(railSide, railFar);

    // Tinted laminated windshield with glossy sky streak
    const glassGrad = el('linearGradient', { id: 'glassGrad', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    glassGrad.append(
      el('stop', { offset: '0%', 'stop-color': '#091b26' }),
      el('stop', { offset: '38%', 'stop-color': '#1a455e' }),
      el('stop', { offset: '48%', 'stop-color': '#7dc7e8' }),
      el('stop', { offset: '57%', 'stop-color': '#173e54' }),
      el('stop', { offset: '100%', 'stop-color': '#071620' }),
    );
    defs.append(glassGrad);

    // Headlight beam glow (top-down)
    const beamGrad = el('linearGradient', { id: 'beamGrad', x1: '0%', y1: '100%', x2: '0%', y2: '0%' });
    beamGrad.append(
      el('stop', { offset: '0%', 'stop-color': '#fff6c7', 'stop-opacity': '0.42' }),
      el('stop', { offset: '100%', 'stop-color': '#fff6c7', 'stop-opacity': '0' }),
    );
    defs.append(beamGrad);

    // Bed deck
    const bedDeck = el('linearGradient', { id: 'bedDeck', x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
    bedDeck.append(
      el('stop', { offset: '0%', 'stop-color': '#243744' }),
      el('stop', { offset: '50%', 'stop-color': '#304859' }),
      el('stop', { offset: '100%', 'stop-color': '#20313d' }),
    );
    defs.append(bedDeck);

    // Warm kraft cardboard crates
    const crateTop = el('linearGradient', { id: 'crateTop', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    crateTop.append(
      el('stop', { offset: '0%', 'stop-color': '#eccb9a' }),
      el('stop', { offset: '100%', 'stop-color': '#cca064' }),
    );
    const crateSideL = el('linearGradient', { id: 'crateSideL', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    crateSideL.append(
      el('stop', { offset: '0%', 'stop-color': '#b8884e' }),
      el('stop', { offset: '100%', 'stop-color': '#906431' }),
    );
    const crateSideR = el('linearGradient', { id: 'crateSideR', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    crateSideR.append(
      el('stop', { offset: '0%', 'stop-color': '#9b6d38' }),
      el('stop', { offset: '100%', 'stop-color': '#714c21' }),
    );
    defs.append(crateTop, crateSideL, crateSideR);

    // Aluminum cylinder & tire rubber
    const metalCyl = el('linearGradient', { id: 'metalCyl', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    metalCyl.append(
      el('stop', { offset: '0%', 'stop-color': '#d7e6f0' }),
      el('stop', { offset: '45%', 'stop-color': '#8ca8ba' }),
      el('stop', { offset: '100%', 'stop-color': '#4d6675' }),
    );
    const tireGrad = el('linearGradient', { id: 'tireGrad', x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
    tireGrad.append(
      el('stop', { offset: '0%', 'stop-color': '#0b1015' }),
      el('stop', { offset: '50%', 'stop-color': '#27343f' }),
      el('stop', { offset: '100%', 'stop-color': '#0b1015' }),
    );
    defs.append(metalCyl, tireGrad);

    svg.append(defs);
  }

  function appendHud(svg) {
    const s1St = sensorVisualState(liveSensors[0]);
    const s2St = sensorVisualState(liveSensors[1]);
    const anyAlarm = s1St === 'alarm' || s2St === 'alarm';
    const anyOnline = !liveStale && (liveSensors[0]?.valid || liveSensors[1]?.valid);
    const hudCls = anyAlarm ? 'cm-hud-alarm' : anyOnline ? 'cm-hud-ok' : 'cm-status-hud';
    const hudTxt = anyAlarm ? '鬆脫警報' : anyOnline ? '監測中' : '待命';
    svg.append(el('rect', { x: 14, y: 12, width: 88, height: 24, rx: 12, class: hudCls }));
    svg.append(el('text', { x: 58, y: 28, class: 'cm-hud-txt', 'text-anchor': 'middle' }, hudTxt));
  }

  // ===== VIEW 1: REALISTIC 3.5T COMMERCIAL FLATBED TRUCK (TOP-DOWN) =====
  function buildTruckSvg() {
    const svg = el('svg', {
      viewBox: `0 0 ${VB_W} ${VB_H}`,
      class: 'cargo-model-svg',
      role: 'img',
      'aria-label': '貨車俯視圖感知器配置模型',
    });

    appendDefs(svg);
    svg.append(el('rect', { x: 0, y: 0, width: VB_W, height: VB_H, rx: 14, fill: 'url(#cmGrid)' }));
    appendHud(svg);

    svg.append(el('text', { x: 300, y: 24, class: 'cm-dir-label', 'text-anchor': 'middle' }, '▲ 車頭方向'));
    svg.append(el('text', { x: 300, y: 406, class: 'cm-dir-label', 'text-anchor': 'middle' }, '車尾'));

    const truck = el('g');

    // Soft parking-bay shadow & road framing
    truck.append(el('rect', { x: 192, y: 50, width: 228, height: 344, rx: 28, fill: 'rgba(0,0,0,0.44)' }));
    truck.append(el('polygon', { points: '216,45 198,10 250,10 242,45', fill: 'url(#beamGrad)' }));
    truck.append(el('polygon', { points: '358,45 350,10 402,10 384,45', fill: 'url(#beamGrad)' }));

    // Tires (Front single steer + Rear dual drive wheels)
    const drawTire = (x, y, w, h) => {
      truck.append(el('rect', { x, y, width: w, height: h, rx: 5, fill: 'url(#tireGrad)', stroke: '#3c5363', 'stroke-width': 1.2 }));
      for (let ty = y + 7; ty < y + h - 5; ty += 7) {
        truck.append(el('line', { x1: x + 2, y1: ty, x2: x + w - 2, y2: ty, stroke: 'rgba(255,255,255,0.16)', 'stroke-width': 1.4 }));
      }
    };
    drawTire(182, 74, 15, 44);
    drawTire(403, 74, 15, 44);
    drawTire(174, 272, 11, 54);
    drawTire(186, 272, 11, 54);
    drawTire(403, 272, 11, 54);
    drawTire(415, 272, 11, 54);

    // Side underrun safety bars & fuel tank
    truck.append(el('rect', { x: 185, y: 170, width: 7, height: 88, rx: 2, fill: '#476578', stroke: '#7ca2b8', 'stroke-width': 0.9 }));
    truck.append(el('rect', { x: 408, y: 170, width: 7, height: 88, rx: 2, fill: '#476578', stroke: '#7ca2b8', 'stroke-width': 0.9 }));
    truck.append(el('rect', { x: 404, y: 190, width: 12, height: 42, rx: 3, fill: 'url(#metalCyl)', stroke: '#233b4a', 'stroke-width': 1 }));

    // Dual-arm commercial side mirrors
    truck.append(el('path', { d: 'M198 66 L172 55 L170 63 L182 70', fill: 'none', stroke: '#55758a', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    truck.append(el('rect', { x: 163, y: 49, width: 11, height: 22, rx: 3, fill: '#1c3140', stroke: '#9bc0d4', 'stroke-width': 1.2 }));
    truck.append(el('path', { d: 'M402 66 L428 55 L430 63 L418 70', fill: 'none', stroke: '#55758a', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    truck.append(el('rect', { x: 426, y: 49, width: 11, height: 22, rx: 3, fill: '#1c3140', stroke: '#9bc0d4', 'stroke-width': 1.2 }));

    // Front Bumper + Grille + Headlamps
    truck.append(el('path', { d: 'M208 42 Q300 32 392 42 L398 54 Q300 47 202 54 Z', fill: '#1e3240', stroke: '#7ca3b8', 'stroke-width': 1.4 }));
    truck.append(el('rect', { x: 256, y: 40, width: 88, height: 7, rx: 3, fill: '#10202b', stroke: '#4c7085', 'stroke-width': 1 }));
    truck.append(el('line', { x1: 264, y1: 43.5, x2: 336, y2: 43.5, stroke: '#8cb4c9', 'stroke-width': 1.2 }));
    truck.append(el('circle', { cx: 300, cy: 43.5, r: 3, fill: '#e8f4fa' }));
    truck.append(el('rect', { x: 214, y: 42, width: 28, height: 8, rx: 3, fill: '#fff5c2', stroke: '#e8c456', 'stroke-width': 1 }));
    truck.append(el('rect', { x: 204, y: 45, width: 9, height: 6, rx: 2, fill: '#ff9e2c' }));
    truck.append(el('rect', { x: 358, y: 42, width: 28, height: 8, rx: 3, fill: '#fff5c2', stroke: '#e8c456', 'stroke-width': 1 }));
    truck.append(el('rect', { x: 387, y: 45, width: 9, height: 6, rx: 2, fill: '#ff9e2c' }));

    // Sculpted Pearl-White Commercial Cab Body
    truck.append(el('path', {
      d: 'M202 56 Q204 45 224 44 L376 44 Q396 45 398 56 L402 124 Q402 132 392 132 L208 132 Q198 132 198 124 Z',
      fill: 'url(#cabRoof)', stroke: '#6c91a8', 'stroke-width': 1.8,
    }));
    // Subtle sun visor & cab roof air fairing detail
    truck.append(el('rect', { x: 222, y: 80, width: 156, height: 42, rx: 10, fill: 'rgba(255,255,255,0.45)', stroke: '#9ab9cc', 'stroke-width': 1.2 }));
    truck.append(el('rect', { x: 244, y: 86, width: 112, height: 28, rx: 6, fill: 'rgba(190,218,236,0.22)', stroke: 'rgba(98,136,160,0.3)', 'stroke-width': 1 }));

    // Panoramic Windshield + Wipers
    truck.append(el('path', { d: 'M216 58 Q300 48 384 58 L376 82 Q300 75 224 82 Z', fill: 'url(#glassGrad)', stroke: '#132a3a', 'stroke-width': 2.2 }));
    truck.append(el('path', { d: 'M234 61 Q264 57 284 60 L276 74 Q256 72 230 74 Z', fill: 'rgba(255,255,255,0.18)' }));
    truck.append(el('line', { x1: 244, y1: 60, x2: 280, y2: 65, stroke: '#0c1821', 'stroke-width': 2, 'stroke-linecap': 'round' }));
    truck.append(el('line', { x1: 312, y1: 60, x2: 348, y2: 65, stroke: '#0c1821', 'stroke-width': 2, 'stroke-linecap': 'round' }));
    truck.append(el('path', { d: 'M203 78 L214 84 L214 114 L203 118 Z', fill: '#18374a', opacity: 0.72 }));
    truck.append(el('path', { d: 'M397 78 L386 84 L386 114 L397 118 Z', fill: '#18374a', opacity: 0.72 }));
    truck.append(el('rect', { x: 246, y: 127, width: 108, height: 4, rx: 2, fill: '#173447' }));

    // Steel Headboard Rack (龍門架)
    truck.append(el('rect', { x: 188, y: 136, width: 224, height: 9, rx: 3, fill: '#35586e', stroke: '#9cc1d6', 'stroke-width': 1.6 }));
    for (const bx of [214, 256, 300, 344, 386]) {
      truck.append(el('rect', { x: bx - 3, y: 135, width: 6, height: 11, rx: 1.5, fill: '#b8d6e6' }));
    }

    // Flatbed Deck & Steel Side Rails
    truck.append(el('rect', { x: 188, y: 145, width: 224, height: 224, rx: 8, fill: 'url(#bedDeck)', stroke: '#7fa8be', 'stroke-width': 2.2 }));
    truck.append(el('rect', { x: 188, y: 145, width: 10, height: 224, rx: 3, fill: '#2c5b7a', stroke: '#8cb5cb', 'stroke-width': 1.2 }));
    truck.append(el('rect', { x: 402, y: 145, width: 10, height: 224, rx: 3, fill: '#2c5b7a', stroke: '#8cb5cb', 'stroke-width': 1.2 }));
    for (let px = 212; px <= 388; px += 16) {
      truck.append(el('line', { x1: px, y1: 149, x2: px, y2: 365, stroke: 'rgba(148,196,222,0.14)', 'stroke-width': 1 }));
    }

    // Cargo Crates on Wooden Pallets
    const drawCrate = (x, y, w, h, label) => {
      truck.append(el('rect', { x: x - 5, y: y - 4, width: w + 10, height: h + 8, rx: 4, fill: '#543c24', stroke: '#7a5a3a', 'stroke-width': 1.1 }));
      truck.append(el('rect', { x, y, width: w, height: h, rx: 5, fill: 'url(#crateTop)', stroke: '#f0d4a8', 'stroke-width': 1.4 }));
      truck.append(el('rect', { x, y: y + h / 2 - 5, width: w, height: 10, fill: 'rgba(255,244,214,0.34)' }));
      truck.append(el('line', { x1: x, y1: y + h / 2, x2: x + w, y2: y + h / 2, stroke: 'rgba(92,62,30,0.45)', 'stroke-width': 1 }));
      truck.append(el('rect', { x: x + 12, y: y + 9, width: 32, height: 15, rx: 2, fill: 'rgba(255,255,255,0.78)' }));
      truck.append(el('line', { x1: x + 16, y1: y + 14, x2: x + 40, y2: y + 14, stroke: '#3a4a55', 'stroke-width': 1.5 }));
      truck.append(el('line', { x1: x + 16, y1: y + 19, x2: x + 32, y2: y + 19, stroke: '#5f707c', 'stroke-width': 1.2 }));
      truck.append(el('text', { x: x + w / 2, y: y + h / 2 + 4, class: 'cm-crate-lbl', 'text-anchor': 'middle' }, label));
    };
    drawCrate(218, 170, 164, 72, '前段貨物');
    drawCrate(218, 256, 164, 76, '後段貨物');

    // Industrial Ratchet Straps
    const straps = [
      { key: 'h-front', x1: 190, y1: 178, x2: 410, y2: 178, rx: 292, ry: 173 },
      { key: 'h-mid',   x1: 190, y1: 248, x2: 410, y2: 248, rx: 292, ry: 243 },
      { key: 'h-rear',  x1: 190, y1: 318, x2: 410, y2: 318, rx: 292, ry: 313 },
      { key: 'v-front', x1: 300, y1: 152, x2: 300, y2: 248, rx: 296, ry: 196 },
      { key: 'v-rear',  x1: 300, y1: 248, x2: 300, y2: 348, rx: 296, ry: 294 },
    ];
    for (const st of straps) {
      const stState = strapStateFor(st.key);
      if (stState === 'idle' && (st.key === 'v-front' || st.key === 'v-rear')) continue;
      truck.append(el('line', { x1: st.x1, y1: st.y1, x2: st.x2, y2: st.y2, class: `cm-strap cm-strap-${stState}` }));
      if (stState !== 'idle') {
        truck.append(el('rect', { x: st.rx, y: st.ry, width: 16, height: 10, rx: 2.5, class: 'cm-ratchet' }));
        truck.append(el('line', { x1: st.rx + 4, y1: st.ry + 5, x2: st.rx + 12, y2: st.ry + 5, stroke: '#102535', 'stroke-width': 1.5 }));
      }
    }

    // Rear Bumper + Tail Light Clusters
    truck.append(el('rect', { x: 188, y: 366, width: 224, height: 15, rx: 4, fill: '#223745', stroke: '#8cb3c7', 'stroke-width': 1.4 }));
    truck.append(el('rect', { x: 194, y: 369, width: 22, height: 7, rx: 2, class: 'cm-taillight' }));
    truck.append(el('rect', { x: 218, y: 369, width: 10, height: 7, rx: 1.5, fill: '#ffad33' }));
    truck.append(el('rect', { x: 230, y: 369, width: 8, height: 7, rx: 1.5, fill: '#e8f4fa' }));
    truck.append(el('rect', { x: 384, y: 369, width: 22, height: 7, rx: 2, class: 'cm-taillight' }));
    truck.append(el('rect', { x: 372, y: 369, width: 10, height: 7, rx: 1.5, fill: '#ffad33' }));
    truck.append(el('rect', { x: 362, y: 369, width: 8, height: 7, rx: 1.5, fill: '#e8f4fa' }));
    truck.append(el('rect', { x: 280, y: 370, width: 40, height: 6, rx: 1.5, fill: '#e8eff4' }));

    svg.append(truck);
    appendSlotMarkers(svg, 'truck');
    attachDragHandlers(svg, 'truck');
    return svg;
  }

  // ===== VIEW 2: AUTHENTIC 3/4 COMMERCIAL FLATBED TRUCK (FUSO CANTER / HINO 300 STYLE) =====
  function buildCargoSvg() {
    const svg = el('svg', {
      viewBox: `0 0 ${VB_W} ${VB_H}`,
      class: 'cargo-model-svg',
      role: 'img',
      'aria-label': '3D 立體貨車感知器配置模型',
    });

    appendDefs(svg);
    svg.append(el('rect', { x: 0, y: 0, width: VB_W, height: VB_H, rx: 14, fill: 'url(#cmGrid)' }));
    appendHud(svg);
    svg.append(el('text', { x: 300, y: 24, class: 'cm-dir-label', 'text-anchor': 'middle' }, '3D 立體貨車視角'));

    const g = el('g');

    // Subtle road ground base band beneath truck
    g.append(el('polygon', {
      points: isoPts([[-45, -18, -1], [415, -18, -1], [415, 148, -1], [-45, 148, -1]]),
      fill: 'rgba(10, 22, 32, 0.45)',
      stroke: 'rgba(110, 170, 200, 0.14)',
      'stroke-width': 1,
    }));

    const drawBox = (u0, u1, v0, v1, z0, z1, fills, stroke = '#52768c', sw = 1.3) => {
      g.append(el('polygon', { points: isoPts([[u0, v0, z0], [u0, v1, z0], [u0, v1, z1], [u0, v0, z1]]), fill: fills.front, stroke, 'stroke-width': sw, 'stroke-linejoin': 'round' }));
      g.append(el('polygon', { points: isoPts([[u0, v1, z0], [u1, v1, z0], [u1, v1, z1], [u0, v1, z1]]), fill: fills.side, stroke, 'stroke-width': sw, 'stroke-linejoin': 'round' }));
      g.append(el('polygon', { points: isoPts([[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]]), fill: fills.top, stroke, 'stroke-width': sw, 'stroke-linejoin': 'round' }));
    };

    const drawWheel3D = (u0, vOuter, width, z0, R, isDual = false) => {
      const tirePoly = (pts) => pts.map(p => p.join(',')).join(' ');
      const vInner = vOuter - width;

      g.append(el('polygon', {
        points: isoPts([[u0 - R * 0.9, vInner - 4, 0], [u0 + R * 0.95, vInner - 4, 0], [u0 + R * 0.95, vOuter + 3, 0], [u0 - R * 0.9, vOuter + 3, 0]]),
        fill: 'rgba(0,0,0,0.52)',
      }));

      const backPts = isoCircleUZ(u0, vInner, z0, R, 30);
      const frontPts = isoCircleUZ(u0, vOuter, z0, R, 30);
      for (let i = 0; i < backPts.length - 1; i++) {
        g.append(el('polygon', {
          points: tirePoly([backPts[i], backPts[i + 1], frontPts[i + 1], frontPts[i]]),
          fill: '#0c1218', stroke: '#101820', 'stroke-width': 0.5,
        }));
      }

      g.append(el('polygon', { points: tirePoly(frontPts), fill: '#18232c', stroke: '#466173', 'stroke-width': 1.4 }));
      g.append(el('polygon', { points: tirePoly(isoCircleUZ(u0, vOuter + 0.2, z0, R * 0.78, 28)), fill: '#1e2c38', stroke: '#2c404f', 'stroke-width': 1 }));
      g.append(el('polygon', { points: tirePoly(isoCircleUZ(u0, vOuter + 0.4, z0, R * 0.58, 24)), fill: '#b8cedb', stroke: '#4d6b7d', 'stroke-width': 1.4 }));
      if (isDual) {
        g.append(el('polygon', { points: tirePoly(isoCircleUZ(u0, vOuter - 2.5, z0, R * 0.40, 20)), fill: '#5b7687', stroke: '#2b414f', 'stroke-width': 1.2 }));
      } else {
        g.append(el('polygon', { points: tirePoly(isoCircleUZ(u0, vOuter + 0.6, z0, R * 0.36, 20)), fill: '#8fa9b8', stroke: '#3a5363', 'stroke-width': 1.1 }));
      }
      g.append(el('polygon', { points: tirePoly(isoCircleUZ(u0, vOuter + 1.2, z0, R * 0.18, 16)), fill: '#223645', stroke: '#dceaf2', 'stroke-width': 1 }));
      for (let k = 0; k < 6; k++) {
        const ang = (k * 60 * Math.PI) / 180;
        const [lx, ly] = iso(u0 + R * 0.28 * Math.cos(ang), vOuter + 1.0, z0 + R * 0.28 * Math.sin(ang));
        g.append(el('circle', { cx: lx, cy: ly, r: 1.3, fill: '#142430' }));
      }
    };

    // 1. Soft Vehicle Ground Cast Shadow
    g.append(el('polygon', {
      points: isoPts([[-4, -5, 0], [344, -5, 0], [344, 134, 0], [-4, 134, 0]]),
      fill: 'rgba(0,0,0,0.48)',
    }));

    // 2. Far-Side Wheels (peeking cleanly beneath front & rear axles)
    drawWheel3D(52, 22, 16, 21, 21, false);
    drawWheel3D(258, 24, 18, 23, 23, true);

    // 3. Far-Side Twin-Arm Mirror
    g.append(el('polyline', { points: isoPts([[18, 4, 80], [18, -11, 80], [20, -11, 102], [20, 6, 102]]), fill: 'none', stroke: '#5f8196', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));
    g.append(el('polygon', { points: isoPts([[16, -13, 83], [22, -13, 83], [22, -13, 101], [16, -13, 101]]), fill: '#1c3242', stroke: '#8fb4c9', 'stroke-width': 1.2 }));

    // 4. Longitudinal Steel Chassis I-Beam + Exhaust Pipe
    drawBox(88, 336, 16, 108, 22, 42, { front: '#111f29', side: '#182c3a', top: '#20384a' }, '#355469', 1.1);
    g.append(el('polyline', { points: isoPts([[210, 102, 20], [285, 114, 18], [295, 122, 16]]), fill: 'none', stroke: '#6d8899', 'stroke-width': 3.5, 'stroke-linecap': 'round' }));

    // 5. Rear Drop-Side Flatbed Assembly
    drawBox(108, 338, 0, 124, 42, 48, { front: '#1b3545', side: '#234357', top: 'url(#bedDeck)' }, '#628ea6', 1.4);
    for (let pv = 16; pv < 118; pv += 18) {
      const p1 = iso(112, pv, 48.2), p2 = iso(334, pv, 48.2);
      g.append(el('line', { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: 'rgba(170,210,232,0.16)', 'stroke-width': 1 }));
    }

    // Far-Side Wall & Rear Tailgate
    drawBox(108, 338, 0, 4, 48, 64, { front: '#19384d', side: 'url(#railFar)', top: '#4d82a3' }, '#7aa7c2', 1.2);
    drawBox(334, 338, 0, 124, 48, 64, { front: '#1d4057', side: '#244d69', top: '#4d82a3' }, '#7aa7c2', 1.2);

    // 6. Industrial Pallets & Strapped Cargo Boxes (label positioned clear between straps!)
    const drawCargoPallet = (u0, u1, labelU, label) => {
      drawBox(u0 - 3, u1 + 3, 18, 106, 48, 54, { front: '#543a20', side: '#664829', top: '#785734' }, '#8f6b45', 1.1);
      g.append(el('polygon', { points: isoPts([[u0 + 12, 106.2, 49], [u0 + 28, 106.2, 49], [u0 + 28, 106.2, 52], [u0 + 12, 106.2, 52]]), fill: '#1f150c' }));
      g.append(el('polygon', { points: isoPts([[u1 - 28, 106.2, 49], [u1 - 12, 106.2, 49], [u1 - 12, 106.2, 52], [u1 - 28, 106.2, 52]]), fill: '#1f150c' }));
      drawBox(u0, u1, 20, 104, 54, 88, { front: 'url(#crateSideL)', side: 'url(#crateSideR)', top: 'url(#crateTop)' }, '#f0d5a8', 1.3);
      g.append(el('polygon', { points: isoPts([[u0, 56, 88.2], [u1, 56, 88.2], [u1, 68, 88.2], [u0, 68, 88.2]]), fill: 'rgba(255,246,220,0.34)' }));
      g.append(el('polygon', { points: isoPts([[u0 + 8, 104.2, 68], [u0 + 28, 104.2, 68], [u0 + 28, 104.2, 79], [u0 + 8, 104.2, 79]]), fill: 'rgba(255,255,255,0.78)' }));
      const [lx, ly] = iso(labelU, 66, 88.5);
      g.append(el('text', { x: lx, y: ly + 4, class: 'cm-crate-lbl', 'text-anchor': 'middle' }, label));
    };
    drawCargoPallet(232, 316, 260, '後段貨物');
    drawCargoPallet(124, 208, 178, '前段貨物');

    // 7. Near-Side Drop-Side Steel Wall + Corrugated Ribs + DOT Safety Stripes
    drawBox(108, 338, 120, 124, 48, 64, { front: '#1b3d54', side: 'url(#railSide)', top: '#639ec2' }, '#8bbad4', 1.3);
    for (let ru = 138; ru <= 318; ru += 36) {
      const p1 = iso(ru, 124.2, 49), p2 = iso(ru, 124.2, 63);
      g.append(el('line', { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: '#558bad', 'stroke-width': 2 }));
    }
    for (let su = 116; su < 332; su += 24) {
      g.append(el('polygon', {
        points: isoPts([[su, 124.3, 43], [su + 11, 124.3, 43], [su + 11, 124.3, 47], [su, 124.3, 47]]),
        fill: ((su / 24) | 0) % 2 === 0 ? '#ff4a54' : '#f2f7fa',
      }));
    }
    g.append(el('polygon', { points: isoPts([[180, 124.4, 43.5], [190, 124.4, 43.5], [190, 124.4, 46.5], [180, 124.4, 46.5]]), fill: '#ffa426' }));
    g.append(el('polygon', { points: isoPts([[320, 124.4, 43], [336, 124.4, 43], [336, 124.4, 47.5], [320, 124.4, 47.5]]), class: 'cm-taillight' }));

    // 8. Under-Bed Rear Fender, Mudflap, Dual Tire, Fuel Tank & Underrun Guard
    g.append(el('polyline', { points: isoPts([[226, 123, 28], [236, 123, 42], [280, 123, 42], [292, 123, 26]]), fill: 'none', stroke: '#101c24', 'stroke-width': 5, 'stroke-linecap': 'round' }));
    g.append(el('polygon', { points: isoPts([[286, 108, 12], [288, 123, 12], [288, 123, 30], [286, 108, 30]]), fill: '#141f28', stroke: '#3a505e', 'stroke-width': 1 }));
    drawWheel3D(258, 121, 20, 23, 23, true);
    drawBox(152, 206, 108, 122, 18, 36, { front: '#7591a3', side: 'url(#metalCyl)', top: '#bad1de' }, '#3d5869', 1.2);
    for (const gz of [20, 29]) {
      const p1 = iso(104, 122.5, gz), p2 = iso(220, 122.5, gz);
      g.append(el('line', { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: '#9ab9cc', 'stroke-width': 3.5, 'stroke-linecap': 'round' }));
    }

    // 9. Tubular Steel Headboard Rack (龍門架 behind Cab)
    g.append(el('polyline', { points: isoPts([[104, 2, 48], [104, 2, 122], [104, 122, 122], [104, 122, 48]]), fill: 'none', stroke: '#a9cce0', 'stroke-width': 4, 'stroke-linejoin': 'round' }));
    g.append(el('polyline', { points: isoPts([[104, 2, 92], [104, 122, 92]]), fill: 'none', stroke: '#7fa4ba', 'stroke-width': 2.2 }));
    g.append(el('polyline', { points: isoPts([[104, 38, 48], [104, 38, 122]]), fill: 'none', stroke: '#7fa4ba', 'stroke-width': 2 }));
    g.append(el('polyline', { points: isoPts([[104, 86, 48], [104, 86, 122]]), fill: 'none', stroke: '#7fa4ba', 'stroke-width': 2 }));

    // 10. SCULPTED COMMERCIAL CAB-OVER BODY (Curved Fuso Canter / Hino Profile)
    g.append(el('polygon', { points: isoPts([[94, 6, 24], [94, 118, 24], [94, 118, 114], [94, 6, 114]]), fill: '#7f9eb3', stroke: '#52748a', 'stroke-width': 1.2 }));

    const cabSpine = [
      [10, 26], [6, 36], [5, 58], [9, 68],
      [27, 112], [32, 118], [40, 120],
      [88, 120], [94, 115],
    ];
    for (let i = 0; i < cabSpine.length - 1; i++) {
      const [uA, zA] = cabSpine[i];
      const [uB, zB] = cabSpine[i + 1];
      const fill = zA >= 115 ? 'url(#cabRoof)' : i < 3 ? 'url(#cabFront)' : '#d2e4f0';
      g.append(el('polygon', {
        points: isoPts([[uA, 6, zA], [uA, 118, zA], [uB, 118, zB], [uB, 6, zB]]),
        fill, stroke: fill, 'stroke-width': 0.8, 'stroke-linejoin': 'round',
      }));
    }
    g.append(el('polyline', { points: isoPts(cabSpine.map(([u, z]) => [u, 6, z])), fill: 'none', stroke: '#6d93ab', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
    g.append(el('polyline', { points: isoPts([[94, 6, 115], [94, 118, 115]]), fill: 'none', stroke: '#7fa4ba', 'stroke-width': 1.4 }));

    // Roof Air Fairing & Amber Cab Roof Clearance Lights
    g.append(el('polygon', { points: isoPts([[44, 16, 120.5], [84, 16, 120.5], [84, 108, 120.5], [44, 108, 120.5]]), fill: 'rgba(255,255,255,0.45)', stroke: '#a0c1d4', 'stroke-width': 1 }));
    for (const rv of [22, 62, 102]) {
      const [lx, ly] = iso(31, rv, 118.2);
      g.append(el('circle', { cx: lx, cy: ly, r: 1.8, fill: '#ffb840' }));
    }

    // Recessed Front Wheel Well Cavity
    const wellPts = isoCircleUZ(52, 118, 21, 24, 18, 0, 180);
    g.append(el('polygon', { points: wellPts.map(p => p.join(',')).join(' '), fill: '#0a141c', stroke: '#2c4657', 'stroke-width': 1.5 }));

    // Sculpted Near-Side Cab Skin + Wheel Arch Cutout
    const cabRightSide = [
      ...cabSpine,
      [94, 24],
      [76, 24],
      ...Array.from({ length: 13 }, (_, k) => {
        const ang = (k / 12) * Math.PI;
        return [+(52 + 24 * Math.cos(ang)).toFixed(1), +(21 + 24 * Math.sin(ang)).toFixed(1)];
      }),
      [28, 24],
      [10, 26],
    ];
    g.append(el('polygon', { points: isoPts(cabRightSide.map(([u, z]) => [u, 118, z])), fill: 'url(#cabSide)', stroke: '#5d839c', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
    g.append(el('polyline', {
      points: isoPts(Array.from({ length: 13 }, (_, k) => {
        const ang = (k / 12) * Math.PI;
        return [+(52 + 24.8 * Math.cos(ang)).toFixed(1), 118.4, +(21 + 24.8 * Math.sin(ang)).toFixed(1)];
      })),
      fill: 'none', stroke: '#1f3240', 'stroke-width': 3.5, 'stroke-linecap': 'round',
    }));

    // Panoramic Windshield + Black Rubber Surround + Dashboard Hint + Wiper Arms
    g.append(el('polygon', { points: isoPts([[11, 13, 71], [11, 111, 71], [27, 111, 110], [27, 13, 110]]), fill: '#0e202e', stroke: '#0c1a24', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));
    g.append(el('polygon', { points: isoPts([[12.5, 16, 73], [12.5, 108, 73], [26, 108, 108], [26, 16, 108]]), fill: 'url(#glassGrad)' }));
    g.append(el('polyline', { points: isoPts([[12.5, 32, 74], [17, 56, 84]]), fill: 'none', stroke: '#0b161f', 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
    g.append(el('polyline', { points: isoPts([[12.5, 76, 74], [17, 100, 84]]), fill: 'none', stroke: '#0b161f', 'stroke-width': 2.2, 'stroke-linecap': 'round' }));

    // Characteristic Stepped Door Window + Intake Vent + Footstep + Handle
    g.append(el('polygon', { points: isoPts([[17, 118.2, 68], [52, 118.2, 68], [56, 118.2, 73], [84, 118.2, 73], [84, 118.2, 109], [31, 118.2, 109]]), fill: '#0f2230', stroke: '#183447', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }));
    g.append(el('polygon', { points: isoPts([[19, 118.4, 70], [51, 118.4, 70], [55, 118.4, 75], [81, 118.4, 75], [81, 118.4, 106], [32, 118.4, 106]]), fill: 'url(#glassGrad)' }));
    g.append(el('polyline', { points: isoPts([[29, 118.3, 25], [29, 118.3, 68], [17, 118.3, 68]]), fill: 'none', stroke: '#52758a', 'stroke-width': 1.2 }));
    g.append(el('polyline', { points: isoPts([[86, 118.3, 25], [86, 118.3, 111]]), fill: 'none', stroke: '#52758a', 'stroke-width': 1.2 }));
    g.append(el('polygon', { points: isoPts([[72, 118.5, 58], [82, 118.5, 58], [82, 118.5, 62], [72, 118.5, 62]]), fill: '#1a2f3d' }));
    g.append(el('polygon', { points: isoPts([[20, 118.4, 25], [32, 118.4, 25], [32, 118.4, 33], [20, 118.4, 33]]), fill: '#223847', stroke: '#4d6f85', 'stroke-width': 1 }));
    g.append(el('polygon', { points: isoPts([[8, 118.4, 48], [86, 118.4, 48], [86, 118.4, 52], [8, 118.4, 52]]), fill: '#258c82' }));

    // Radiator Grille + Chrome Trim + Badge + Multi-Reflector Headlights + LED DRLs
    g.append(el('polygon', { points: isoPts([[5.5, 32, 42], [5.5, 92, 42], [6.5, 92, 57], [6.5, 32, 57]]), fill: '#13222e', stroke: '#4f738a', 'stroke-width': 1.2 }));
    for (const [gz, gu] of [[46, 5.6], [51, 5.9]]) {
      const p1 = iso(gu, 35, gz), p2 = iso(gu, 89, gz);
      g.append(el('line', { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: '#b8d3e3', 'stroke-width': 1.5 }));
    }
    const [emX, emY] = iso(6.1, 62, 54);
    g.append(el('circle', { cx: emX, cy: emY, r: 3.2, fill: '#eef7fc', stroke: '#4f738a', 'stroke-width': 0.8 }));

    // Crystal Headlights with crisp white LED DRL Accent Bar
    g.append(el('polygon', { points: isoPts([[5.5, 10, 41], [5.5, 29, 41], [6.5, 29, 55], [6.5, 10, 55]]), fill: '#fff8cc', stroke: '#a8903c', 'stroke-width': 1.1 }));
    g.append(el('polygon', { points: isoPts([[5.5, 95, 41], [5.5, 114, 41], [6.5, 114, 55], [6.5, 95, 55]]), fill: '#fff8cc', stroke: '#a8903c', 'stroke-width': 1.1 }));
    g.append(el('polyline', { points: isoPts([[5.3, 11, 42], [5.3, 28, 42]]), fill: 'none', stroke: '#ffffff', 'stroke-width': 2 }));
    g.append(el('polyline', { points: isoPts([[5.3, 96, 42], [5.3, 113, 42]]), fill: 'none', stroke: '#ffffff', 'stroke-width': 2 }));
    g.append(el('polygon', { points: isoPts([[5.5, 118.3, 41], [14, 118.3, 41], [14, 118.3, 52], [5.5, 118.3, 52]]), fill: '#ff9d29', stroke: '#b36200', 'stroke-width': 0.9 }));

    // Wraparound Front Bumper + Fog Lamps + License Plate
    drawBox(1, 12, 4, 120, 15, 29, { front: '#1b2d3b', side: '#233b4d', top: '#3a5970' }, '#6c91a8', 1.3);
    g.append(el('polygon', { points: isoPts([[0.7, 36, 17.5], [0.7, 88, 17.5], [0.7, 88, 22], [0.7, 36, 22]]), fill: '#0c161f' }));
    g.append(el('polygon', { points: isoPts([[0.7, 13, 18.5], [0.7, 25, 18.5], [0.7, 25, 24], [0.7, 13, 24]]), fill: '#ffe88c' }));
    g.append(el('polygon', { points: isoPts([[0.7, 99, 18.5], [0.7, 111, 18.5], [0.7, 111, 24], [0.7, 99, 24]]), fill: '#ffe88c' }));
    g.append(el('polygon', { points: isoPts([[0.6, 48, 22.5], [0.6, 76, 22.5], [0.6, 76, 27.5], [0.6, 48, 27.5]]), fill: '#eef5fa', stroke: '#526f82', 'stroke-width': 0.8 }));

    // Near-Side Mirror
    g.append(el('polyline', { points: isoPts([[20, 118, 76], [19, 132, 76], [21, 132, 102], [22, 118, 102]]), fill: 'none', stroke: '#62859c', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));
    g.append(el('polygon', { points: isoPts([[16, 130, 80], [24, 130, 80], [24, 130, 100], [16, 130, 100]]), fill: '#192e3d', stroke: '#a0c4d9', 'stroke-width': 1.2 }));

    // 11. Front Near-Side Steer Tire (tucked inside cab wheel arch)
    drawWheel3D(52, 116, 16, 21, 21, false);

    // 12. Heavy-Duty Ratchet Straps Over Cargo
    const isoStraps = [
      { key: 'c-front', pts: [[144, 0, 58], [144, 16, 88], [144, 20, 88.5], [144, 104, 88.5], [144, 124, 62], [144, 124, 52]] },
      { key: 'c-mid',   pts: [[214, 0, 58], [214, 16, 88], [214, 20, 88.5], [214, 104, 88.5], [208, 124, 62], [208, 124, 52]] },
      { key: 'c-rear',  pts: [[298, 0, 58], [298, 16, 88], [298, 20, 88.5], [298, 104, 88.5], [298, 124, 62], [298, 124, 52]] },
      { key: 'c-top-f', pts: [[104, 18, 122], [124, 58, 89], [208, 58, 89]] },
      { key: 'c-top-r', pts: [[232, 62, 89], [316, 62, 89], [336, 62, 65]] },
    ];
    for (const st of isoStraps) {
      const stState = strapStateFor(st.key);
      if (stState === 'idle' && (st.key === 'c-top-f' || st.key === 'c-top-r')) continue;
      g.append(el('polyline', {
        points: isoPts(st.pts),
        fill: 'none',
        'stroke-linejoin': 'round',
        class: `cm-strap cm-strap-${stState}`,
      }));
    }

    svg.append(g);
    appendSlotMarkers(svg, 'cargo');
    attachDragHandlers(svg, 'cargo');
    return svg;
  }

  // ===== SHARED SLOT PINS + NON-CROSSING PERIMETER CALLOUT HUD CARDS =====
  function appendSlotMarkers(svg, viewName) {
    const occupiedCallouts = [];

    for (const slot of MODEL_SLOTS) {
      const pt = viewName === 'truck' ? slot.truck : slot.cargo;
      const occupant = config.s1 === slot.id ? 1 : config.s2 === slot.id ? 2 : 0;
      const sensor = occupant ? liveSensors[occupant - 1] : null;
      const st = occupant ? sensorVisualState(sensor) : 'empty';

      const g = el('g', {
        class: `cm-slot cm-slot-${st}${occupant ? ` cm-sensor-${occupant}` : ''}${occupant === activeSensor ? ' cm-active-editing' : ''}`,
        'data-slot': slot.id,
        tabindex: '0',
        role: 'button',
        'aria-label': occupant ? `${slot.label} #${occupant}` : `${slot.label} 空位`,
      });

      g.addEventListener('pointerdown', evt => {
        if (occupant) {
          draggingSensor = occupant;
          activeSensor = occupant;
          onSelectSensor?.(occupant);
          evt.preventDefault();
        }
      });
      g.addEventListener('click', () => {
        if (!occupant || occupant !== activeSensor) placeSensor(activeSensor, slot.id);
        else onSelectSensor?.(occupant);
      });
      g.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); placeSensor(activeSensor, slot.id); }
      });

      if (occupant) {
        if (st === 'alarm' || st === 'confirming') {
          g.append(el('circle', { cx: pt.x, cy: pt.y, r: 22, class: `cm-pulse cm-pulse-${st}` }));
        }
        g.append(el('circle', { cx: pt.x, cy: pt.y, r: 14.5, class: 'cm-node-bg' }));
        g.append(el('text', { x: pt.x, y: pt.y + 4.5, class: 'cm-node-num', 'text-anchor': 'middle' }, `#${occupant}`));
        occupiedCallouts.push({ occupant, slot, pt, sensor, st });
      } else {
        g.append(el('circle', { cx: pt.x, cy: pt.y, r: 9, class: 'cm-empty-dot' }));
        g.append(el('text', { x: pt.x, y: pt.y + 3.5, class: 'cm-empty-plus', 'text-anchor': 'middle' }, '+'));

        let lx = pt.x, ly = pt.y + 4;
        if (viewName === 'truck') {
          lx = pt.side === 'left' ? pt.x - 21 : pt.side === 'right' ? pt.x + 21 : pt.side === 'top' ? pt.x + 24 : pt.x + 24;
          ly = pt.y + 4;
        } else {
          if (pt.side === 'top-left') { lx = pt.x - 10; ly = pt.y - 14; }
          else if (pt.side === 'tail') { lx = pt.x + 24; ly = pt.y - 6; }
          else { lx = pt.x + 14; ly = pt.y + 20; }
        }
        g.append(el('text', { x: lx, y: ly, class: 'cm-empty-label', 'text-anchor': 'middle' }, slot.label));
      }

      svg.append(g);
    }

    // Place Callout Cards symmetrically in Open Perimeter Corners so leader lines NEVER cross each other or cards!
    const cardW = 116, cardH = 44;
    const placedBoxes = [];
    const overlaps = (ax, ay) => placedBoxes.some(b =>
      ax < b.x + cardW + 12 && ax + cardW + 12 > b.x &&
      ay < b.y + cardH + 12 && ay + cardH + 12 > b.y,
    );

    if (viewName === 'cargo' && occupiedCallouts.length === 2) {
      // Sort pins strictly left-to-right by pin X: left pin owns left card, right pin owns right card -> ZERO crossed lines!
      const sorted = [...occupiedCallouts].sort((a, b) => a.pt.x - b.pt.x);
      const [leftPin, rightPin] = sorted;

      // Leftmost pin -> open upper-left sky (or upper-left row 2 if right pin is also bottom-right? Wait: always clean!)
      leftPin._pos = leftPin.pt.side === 'bottom-right' ? [18, 356] : [18, 52];
      // Rightmost pin -> open upper-right sky if on upper/tail edge, or open lower-right ground if on lower bed rail
      rightPin._pos = rightPin.pt.side === 'bottom-right' ? [466, 336] : [466, 46];
    }

    occupiedCallouts.sort((a, b) => a.occupant - b.occupant);

    for (const c of occupiedCallouts) {
      const { occupant, slot, pt, sensor, st } = c;
      let bx, by;

      if (c._pos) {
        [bx, by] = c._pos;
      } else if (viewName === 'truck') {
        if (pt.side === 'left') {
          bx = 34; by = Math.max(46, Math.min(VB_H - cardH - 14, pt.y - cardH / 2));
        } else if (pt.side === 'right') {
          bx = VB_W - cardW - 34; by = Math.max(46, Math.min(VB_H - cardH - 14, pt.y - cardH / 2));
        } else if (pt.side === 'top') {
          bx = VB_W - cardW - 34; by = 52;
        } else {
          bx = VB_W - cardW - 34; by = 344;
        }
        if (overlaps(bx, by)) by = by > 200 ? by - 58 : by + 58;
      } else {
        // Single sensor fallback in 3D view
        bx = pt.side === 'bottom-right' ? 466 : pt.x < 300 ? 18 : 466;
        by = pt.side === 'bottom-right' ? 336 : 48;
      }

      bx = Math.max(12, Math.min(VB_W - cardW - 12, bx));
      by = Math.max(38, Math.min(VB_H - cardH - 12, by));
      placedBoxes.push({ x: bx, y: by });

      const anchorX = bx + cardW / 2 < pt.x ? bx + cardW : bx;
      const anchorY = by + cardH / 2;
      svg.append(el('line', {
        x1: anchorX, y1: anchorY,
        x2: pt.x, y2: pt.y,
        class: `cm-leader cm-leader-${st}`,
      }));

      const hasAngle = !liveStale && sensor?.valid && sensor?.calibrated && Number.isFinite(sensor.delta);
      const bigVal = hasAngle ? `${sensor.delta > 0 ? '+' : ''}${sensor.delta.toFixed(1)}°`
                   : st === 'sensor_error' ? '異常'
                   : st === 'uncalibrated' ? '未校正'
                   : '—';
      const sub = st === 'alarm' ? `${slot.label} · 鬆脫` : st === 'confirming' ? `${slot.label} · 確認` : slot.label;

      const cardG = el('g', { class: 'cm-callout-card' });
      cardG.append(el('rect', { x: bx, y: by, width: cardW, height: cardH, rx: 10, class: `cm-callout cm-callout-${st}` }));
      cardG.append(el('text', { x: bx + cardW / 2, y: by + 15, class: 'cm-callout-title', 'text-anchor': 'middle' }, `#${occupant} ${sub}`));
      cardG.append(el('text', { x: bx + cardW / 2, y: by + 35, class: 'cm-callout-big', 'text-anchor': 'middle' }, bigVal));
      svg.append(cardG);
    }
  }

  function render() {
    const root = document.getElementById(containerId);
    if (!root) return;
    const canvas = root.querySelector('#cargoModelCanvas');
    if (canvas) canvas.replaceChildren(config.view === 'truck' ? buildTruckSvg() : buildCargoSvg());

    root.querySelector('#pickSensor1')?.setAttribute('aria-pressed', String(activeSensor === 1));
    root.querySelector('#pickSensor2')?.setAttribute('aria-pressed', String(activeSensor === 2));
    root.querySelector('#viewTruck')?.setAttribute('aria-pressed', String(config.view === 'truck'));
    root.querySelector('#viewCargo')?.setAttribute('aria-pressed', String(config.view === 'cargo'));

    const sel1 = root.querySelector('#slotSelect1'), sel2 = root.querySelector('#slotSelect2');
    if (sel1) sel1.value = config.s1;
    if (sel2) sel2.value = config.s2;

    const note1 = root.querySelector('#noteInput1'), note2 = root.querySelector('#noteInput2');
    if (note1 && document.activeElement !== note1) note1.value = config.note1;
    if (note2 && document.activeElement !== note2) note2.value = config.note2;

    const hint = root.querySelector('#modelPlacementHint');
    if (hint) hint.textContent = '拖曳 #1／#2 或點擊「＋」調整位置';
  }

  function bindControls() {
    const root = document.getElementById(containerId);
    if (!root) return;
    const sel1 = root.querySelector('#slotSelect1'), sel2 = root.querySelector('#slotSelect2');
    if (sel1 && !sel1.options.length) {
      for (const s of MODEL_SLOTS) {
        const o1 = document.createElement('option'); o1.value = s.id; o1.textContent = s.label; sel1.append(o1);
        const o2 = document.createElement('option'); o2.value = s.id; o2.textContent = s.label; sel2.append(o2);
      }
    }
    root.querySelector('#pickSensor1')?.addEventListener('click', () => setActiveSensor(1));
    root.querySelector('#pickSensor2')?.addEventListener('click', () => setActiveSensor(2));
    root.querySelector('#viewTruck')?.addEventListener('click', () => setView('truck'));
    root.querySelector('#viewCargo')?.addEventListener('click', () => setView('cargo'));
    sel1?.addEventListener('change', e => placeSensor(1, e.target.value));
    sel2?.addEventListener('change', e => placeSensor(2, e.target.value));
    root.querySelector('#noteInput1')?.addEventListener('input', e => setNote(1, e.target.value));
    root.querySelector('#noteInput2')?.addEventListener('input', e => setNote(2, e.target.value));
    root.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });
  }

  function updateSensors(sensors, stale) {
    liveSensors = [
      sensors?.[0] || { sensorId: 1, valid: false, calibrated: false, state: 'offline', delta: null, fault: 0 },
      sensors?.[1] || { sensorId: 2, valid: false, calibrated: false, state: 'offline', delta: null, fault: 0 },
    ];
    liveStale = !!stale;
    render();
  }

  bindControls();
  load('default');

  return { load, updateSensors, getPlacementInfo, formatLocation, setActiveSensor, placeSensor, applyPreset };
}

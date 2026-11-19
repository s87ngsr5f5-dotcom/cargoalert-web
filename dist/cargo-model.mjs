// CargoAlert v3.4 Studio Commercial Flatbed Truck Model (Top-Down + Mathematically Exact 3D Isometric Truck)
// Crisp automotive details, zero-overlap badges, drag-and-drop & click placement

const ISO_OX = 126, ISO_OY = 314;
function iso(u, v, z) {
  return [
    +(ISO_OX + u * 0.82 + v * 0.78).toFixed(1),
    +(ISO_OY - u * 0.39 + v * 0.41 - z * 0.90).toFixed(1),
  ];
}
function isoPts(arr) {
  return arr.map(([u, v, z]) => iso(u, v, z).join(',')).join(' ');
}

const C_FL = iso(152, 0, 48);
const C_FC = iso(106, 36, 132);
const C_FR = iso(152, 130, 48);
const C_ML = iso(226, 0, 48);
const C_MR = iso(226, 130, 48);
const C_RL = iso(300, 0, 48);
const C_RC = iso(338, 65, 48);
const C_RR = iso(300, 130, 48);

export const MODEL_SLOTS = [
  { id: 'front-left',   label: '前左', truck: { x: 194, y: 178, strap: 'h-front', side: 'left'   }, cargo: { x: C_FL[0], y: C_FL[1], strap: 'c-front', side: 'left'   } },
  { id: 'front-center', label: '前中', truck: { x: 300, y: 152, strap: 'v-front', side: 'top'    }, cargo: { x: C_FC[0], y: C_FC[1], strap: 'c-top-f', side: 'top'    } },
  { id: 'front-right',  label: '前右', truck: { x: 406, y: 178, strap: 'h-front', side: 'right'  }, cargo: { x: C_FR[0], y: C_FR[1], strap: 'c-front', side: 'right'  } },
  { id: 'mid-left',     label: '中左', truck: { x: 194, y: 248, strap: 'h-mid',   side: 'left'   }, cargo: { x: C_ML[0], y: C_ML[1], strap: 'c-mid',   side: 'left'   } },
  { id: 'mid-right',    label: '中右', truck: { x: 406, y: 248, strap: 'h-mid',   side: 'right'  }, cargo: { x: C_MR[0], y: C_MR[1], strap: 'c-mid',   side: 'right'  } },
  { id: 'rear-left',    label: '後左', truck: { x: 194, y: 318, strap: 'h-rear',  side: 'left'   }, cargo: { x: C_RL[0], y: C_RL[1], strap: 'c-rear',  side: 'left'   } },
  { id: 'rear-center',  label: '後尾', truck: { x: 300, y: 348, strap: 'v-rear',  side: 'bottom' }, cargo: { x: C_RC[0], y: C_RC[1], strap: 'c-top-r', side: 'top'    } },
  { id: 'rear-right',   label: '後右', truck: { x: 406, y: 318, strap: 'h-rear',  side: 'right'  }, cargo: { x: C_RR[0], y: C_RR[1], strap: 'c-rear',  side: 'right'  } },
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

    // Subtle blueprint engineering grid
    const pat = el('pattern', { id: 'cmGrid', width: 24, height: 24, patternUnits: 'userSpaceOnUse' });
    pat.append(el('path', { d: 'M 24 0 L 0 0 0 24', fill: 'none', stroke: 'rgba(130,192,224,0.06)', 'stroke-width': 1 }));
    defs.append(pat);

    // Metallic pearl-white commercial truck paint
    const cabPaint = el('linearGradient', { id: 'cabPaint', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    cabPaint.append(
      el('stop', { offset: '0%', 'stop-color': '#f5fbff' }),
      el('stop', { offset: '48%', 'stop-color': '#d7e8f3' }),
      el('stop', { offset: '100%', 'stop-color': '#9ebbd0' }),
    );
    defs.append(cabPaint);

    // Cab side / front darker metallic planes (for 3D)
    const cabFront = el('linearGradient', { id: 'cabFront', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    cabFront.append(
      el('stop', { offset: '0%', 'stop-color': '#e1eff8' }),
      el('stop', { offset: '100%', 'stop-color': '#b0cadb' }),
    );
    defs.append(cabFront);

    const cabSide = el('linearGradient', { id: 'cabSide', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    cabSide.append(
      el('stop', { offset: '0%', 'stop-color': '#c7deec' }),
      el('stop', { offset: '100%', 'stop-color': '#8aa8bd' }),
    );
    defs.append(cabSide);

    // Tinted automotive windshield glass with sky glare
    const glassGrad = el('linearGradient', { id: 'glassGrad', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    glassGrad.append(
      el('stop', { offset: '0%', 'stop-color': '#0b2232' }),
      el('stop', { offset: '45%', 'stop-color': '#235978' }),
      el('stop', { offset: '55%', 'stop-color': '#6bb7db' }),
      el('stop', { offset: '100%', 'stop-color': '#0e283a' }),
    );
    defs.append(glassGrad);

    // Headlight beam glow
    const beamGrad = el('linearGradient', { id: 'beamGrad', x1: '0%', y1: '100%', x2: '0%', y2: '0%' });
    beamGrad.append(
      el('stop', { offset: '0%', 'stop-color': '#fff6c7', 'stop-opacity': '0.45' }),
      el('stop', { offset: '100%', 'stop-color': '#fff6c7', 'stop-opacity': '0' }),
    );
    defs.append(beamGrad);

    // Dark steel / wooden flatbed deck
    const bedDeck = el('linearGradient', { id: 'bedDeck', x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
    bedDeck.append(
      el('stop', { offset: '0%', 'stop-color': '#183244' }),
      el('stop', { offset: '50%', 'stop-color': '#214258' }),
      el('stop', { offset: '100%', 'stop-color': '#162d3d' }),
    );
    defs.append(bedDeck);

    // Warm kraft cardboard cargo crate gradients
    const crateTop = el('linearGradient', { id: 'crateTop', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    crateTop.append(
      el('stop', { offset: '0%', 'stop-color': '#e7c593' }),
      el('stop', { offset: '100%', 'stop-color': '#c79b61' }),
    );
    const crateSideL = el('linearGradient', { id: 'crateSideL', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    crateSideL.append(
      el('stop', { offset: '0%', 'stop-color': '#b8894f' }),
      el('stop', { offset: '100%', 'stop-color': '#8f6433' }),
    );
    const crateSideR = el('linearGradient', { id: 'crateSideR', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    crateSideR.append(
      el('stop', { offset: '0%', 'stop-color': '#9c6e3a' }),
      el('stop', { offset: '100%', 'stop-color': '#734d23' }),
    );
    defs.append(crateTop, crateSideL, crateSideR);

    // Tire rubber
    const tireGrad = el('linearGradient', { id: 'tireGrad', x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
    tireGrad.append(
      el('stop', { offset: '0%', 'stop-color': '#0b1015' }),
      el('stop', { offset: '50%', 'stop-color': '#27343f' }),
      el('stop', { offset: '100%', 'stop-color': '#0b1015' }),
    );
    defs.append(tireGrad);

    svg.append(defs);
  }

  function appendHud(svg) {
    const s1St = sensorVisualState(liveSensors[0]);
    const s2St = sensorVisualState(liveSensors[1]);
    const anyAlarm = s1St === 'alarm' || s2St === 'alarm';
    const anyOnline = !liveStale && (liveSensors[0]?.valid || liveSensors[1]?.valid);
    const hudCls = anyAlarm ? 'cm-hud-alarm' : anyOnline ? 'cm-hud-ok' : 'cm-status-hud';
    const hudTxt = anyAlarm ? '鬆脫警報' : anyOnline ? '監測中' : '待命';
    svg.append(el('rect', { x: 14, y: 12, width: 92, height: 24, rx: 12, class: hudCls }));
    svg.append(el('text', { x: 60, y: 28, class: 'cm-hud-txt', 'text-anchor': 'middle' }, hudTxt));
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

    // Soft studio ground drop shadow under vehicle
    truck.append(el('rect', { x: 194, y: 50, width: 226, height: 344, rx: 28, fill: 'rgba(0,0,0,0.44)' }));

    // Subtle headlight cones
    truck.append(el('polygon', { points: '216,45 198,10 250,10 242,45', fill: 'url(#beamGrad)' }));
    truck.append(el('polygon', { points: '358,45 350,10 402,10 384,45', fill: 'url(#beamGrad)' }));

    // === TIRES (Front single steer + Rear dual drive wheels) ===
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

    // Side Underrun Safety Guards & Fuel Tank
    truck.append(el('rect', { x: 185, y: 170, width: 7, height: 88, rx: 2, fill: '#476578', stroke: '#7ca2b8', 'stroke-width': 0.9 }));
    truck.append(el('rect', { x: 408, y: 170, width: 7, height: 88, rx: 2, fill: '#476578', stroke: '#7ca2b8', 'stroke-width': 0.9 }));
    truck.append(el('rect', { x: 404, y: 190, width: 12, height: 42, rx: 3, fill: '#7f9eb0', stroke: '#233b4a', 'stroke-width': 1 }));

    // === COMMERCIAL CAB (Sculpted Pearl-White 3.5T Cab) ===
    // Extended Commercial Side Mirrors
    truck.append(el('path', { d: 'M198 66 L174 56 L171 64 L182 70', fill: 'none', stroke: '#55758a', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    truck.append(el('rect', { x: 165, y: 50, width: 10, height: 22, rx: 3, fill: '#263f50', stroke: '#9bc0d4', 'stroke-width': 1.2 }));
    truck.append(el('path', { d: 'M402 66 L426 56 L429 64 L418 70', fill: 'none', stroke: '#55758a', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    truck.append(el('rect', { x: 425, y: 50, width: 10, height: 22, rx: 3, fill: '#263f50', stroke: '#9bc0d4', 'stroke-width': 1.2 }));

    // Sculpted Front Bumper
    truck.append(el('path', {
      d: 'M208 42 Q300 32 392 42 L398 54 Q300 47 202 54 Z',
      fill: '#203645', stroke: '#7ca3b8', 'stroke-width': 1.4,
    }));
    // Front Grille Slats + Silver Emblem
    truck.append(el('rect', { x: 256, y: 40, width: 88, height: 7, rx: 3, fill: '#10202b', stroke: '#4c7085', 'stroke-width': 1 }));
    truck.append(el('line', { x1: 264, y1: 43.5, x2: 336, y2: 43.5, stroke: '#8cb4c9', 'stroke-width': 1.2 }));
    truck.append(el('circle', { cx: 300, cy: 43.5, r: 3, fill: '#e8f4fa' }));

    // Crystal Headlights + Amber Corner Indicators
    truck.append(el('rect', { x: 214, y: 42, width: 28, height: 8, rx: 3, fill: '#fff5c2', stroke: '#e8c456', 'stroke-width': 1 }));
    truck.append(el('rect', { x: 204, y: 45, width: 9, height: 6, rx: 2, fill: '#ff9e2c' }));
    truck.append(el('rect', { x: 358, y: 42, width: 28, height: 8, rx: 3, fill: '#fff5c2', stroke: '#e8c456', 'stroke-width': 1 }));
    truck.append(el('rect', { x: 387, y: 45, width: 9, height: 6, rx: 2, fill: '#ff9e2c' }));

    // Main Metallic Cab Body (tapered aerodynamic front corners)
    truck.append(el('path', {
      d: 'M202 56 Q204 45 224 44 L376 44 Q396 45 398 56 L402 124 Q402 132 392 132 L208 132 Q198 132 198 124 Z',
      fill: 'url(#cabPaint)', stroke: '#6c91a8', 'stroke-width': 1.8,
    }));

    // Sculpted Roof Panel & Aerodynamic Ribs
    truck.append(el('rect', { x: 222, y: 80, width: 156, height: 44, rx: 10, fill: 'rgba(255,255,255,0.42)', stroke: '#9ab9cc', 'stroke-width': 1.2 }));
    for (const rx of [250, 275, 300, 325, 350]) {
      truck.append(el('line', { x1: rx, y1: 86, x2: rx, y2: 118, stroke: 'rgba(72,106,128,0.28)', 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
    }

    // Panoramic Curved Windshield
    truck.append(el('path', {
      d: 'M216 58 Q300 48 384 58 L376 82 Q300 75 224 82 Z',
      fill: 'url(#glassGrad)', stroke: '#132a3a', 'stroke-width': 2.2,
    }));
    // Windshield Specular Reflection & Wipers
    truck.append(el('path', { d: 'M234 61 Q264 57 284 60 L276 74 Q256 72 230 74 Z', fill: 'rgba(255,255,255,0.18)' }));
    truck.append(el('line', { x1: 244, y1: 60, x2: 280, y2: 65, stroke: '#0c1821', 'stroke-width': 2, 'stroke-linecap': 'round' }));
    truck.append(el('line', { x1: 312, y1: 60, x2: 348, y2: 65, stroke: '#0c1821', 'stroke-width': 2, 'stroke-linecap': 'round' }));

    // Subtle Side Door Glass & Cab Rear Window
    truck.append(el('path', { d: 'M203 78 L214 84 L214 114 L203 118 Z', fill: '#18374a', opacity: 0.72 }));
    truck.append(el('path', { d: 'M397 78 L386 84 L386 114 L397 118 Z', fill: '#18374a', opacity: 0.72 }));
    truck.append(el('rect', { x: 246, y: 127, width: 108, height: 4, rx: 2, fill: '#173447' }));

    // === STEEL HEADBOARD RACK (龍門架) ===
    truck.append(el('rect', { x: 188, y: 136, width: 224, height: 9, rx: 3, fill: '#35586e', stroke: '#9cc1d6', 'stroke-width': 1.6 }));
    for (const bx of [214, 256, 300, 344, 386]) {
      truck.append(el('rect', { x: bx - 3, y: 135, width: 6, height: 11, rx: 1.5, fill: '#b8d6e6' }));
    }

    // === FLATBED CHASSIS & DECK ===
    truck.append(el('rect', { x: 188, y: 145, width: 224, height: 224, rx: 8, fill: 'url(#bedDeck)', stroke: '#7fa8be', 'stroke-width': 2.2 }));
    // Side Steel Rails & Tie-down Hooks
    truck.append(el('rect', { x: 188, y: 145, width: 10, height: 224, rx: 3, fill: '#2f5368', stroke: '#8cb5cb', 'stroke-width': 1.2 }));
    truck.append(el('rect', { x: 402, y: 145, width: 10, height: 224, rx: 3, fill: '#2f5368', stroke: '#8cb5cb', 'stroke-width': 1.2 }));
    // Deck Planks
    for (let px = 212; px <= 388; px += 16) {
      truck.append(el('line', { x1: px, y1: 149, x2: px, y2: 365, stroke: 'rgba(148,196,222,0.13)', 'stroke-width': 1 }));
    }

    // === CARGO CRATES ON WOODEN PALLETS ===
    const drawCrate = (x, y, w, h, label) => {
      // Wooden pallet slat base
      truck.append(el('rect', { x: x - 5, y: y - 4, width: w + 10, height: h + 8, rx: 4, fill: '#543c24', stroke: '#7a5a3a', 'stroke-width': 1.1 }));
      // Kraft box body
      truck.append(el('rect', { x, y, width: w, height: h, rx: 5, fill: 'url(#crateTop)', stroke: '#f0d4a8', 'stroke-width': 1.4 }));
      // Packing tape seam
      truck.append(el('rect', { x, y: y + h / 2 - 5, width: w, height: 10, fill: 'rgba(255,244,214,0.34)' }));
      truck.append(el('line', { x1: x, y1: y + h / 2, x2: x + w, y2: y + h / 2, stroke: 'rgba(92,62,30,0.45)', 'stroke-width': 1 }));
      // Shipping label
      truck.append(el('rect', { x: x + 12, y: y + 9, width: 32, height: 15, rx: 2, fill: 'rgba(255,255,255,0.78)' }));
      truck.append(el('line', { x1: x + 16, y1: y + 14, x2: x + 40, y2: y + 14, stroke: '#3a4a55', 'stroke-width': 1.5 }));
      truck.append(el('line', { x1: x + 16, y1: y + 19, x2: x + 32, y2: y + 19, stroke: '#5f707c', 'stroke-width': 1.2 }));
      truck.append(el('text', { x: x + w / 2, y: y + h / 2 + 4, class: 'cm-crate-lbl', 'text-anchor': 'middle' }, label));
    };
    drawCrate(218, 170, 164, 72, '前段貨物');
    drawCrate(218, 256, 164, 76, '後段貨物');

    // === INDUSTRIAL RATCHET STRAPS ===
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

    // === REAR BUMPER + TAIL LIGHT CLUSTERS ===
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

  // ===== VIEW 2: MATHEMATICALLY EXACT 3D ISOMETRIC COMMERCIAL FLATBED TRUCK =====
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

    // 1. Ground shadow underneath entire truck (z = 0)
    g.append(el('polygon', {
      points: isoPts([[-8, -8, 0], [344, -8, 0], [344, 138, 0], [-8, 138, 0]]),
      fill: 'rgba(0,0,0,0.42)',
    }));

    // Helper: 3D Isometric Wheel at (u, v, z)
    const drawWheel3D = (u, v, z, rx = 18, ry = 23) => {
      const [cx, cy] = iso(u, v, z);
      // Inner tire depth
      g.append(el('ellipse', { cx: cx - 8, cy: cy - 4, rx, ry, fill: '#0b1218', stroke: '#2c4150', 'stroke-width': 1.4 }));
      // Outer tire sidewall
      g.append(el('ellipse', { cx, cy, rx, ry, fill: '#18242e', stroke: '#4d6a7d', 'stroke-width': 1.6 }));
      // Metallic alloy wheel rim
      g.append(el('ellipse', { cx, cy, rx: rx * 0.56, ry: ry * 0.56, fill: '#b8d1e0', stroke: '#2c4557', 'stroke-width': 1.5 }));
      // Center hub & lug ring
      g.append(el('ellipse', { cx, cy, rx: rx * 0.22, ry: ry * 0.22, fill: '#2a4152' }));
    };

    // Helper: Axis-aligned 3D Box in iso(u, v, z) (draws Top, Front u0, Right v1)
    const drawIsoBox = (u0, u1, v0, v1, z0, z1, fills, stroke = '#5f849c', sw = 1.4) => {
      // Front face (u = u0, visible bottom-left)
      g.append(el('polygon', {
        points: isoPts([[u0, v0, z0], [u0, v1, z0], [u0, v1, z1], [u0, v0, z1]]),
        fill: fills.front, stroke, 'stroke-width': sw, 'stroke-linejoin': 'round',
      }));
      // Right side face (v = v1, visible bottom-right)
      g.append(el('polygon', {
        points: isoPts([[u0, v1, z0], [u1, v1, z0], [u1, v1, z1], [u0, v1, z1]]),
        fill: fills.side, stroke, 'stroke-width': sw, 'stroke-linejoin': 'round',
      }));
      // Top face (z = z1, visible top)
      g.append(el('polygon', {
        points: isoPts([[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]]),
        fill: fills.top, stroke, 'stroke-width': sw, 'stroke-linejoin': 'round',
      }));
    };

    // 2. Chassis Frame + Fuel Tank + Side Underrun Guard (under flatbed)
    drawIsoBox(102, 330, 14, 118, 22, 42, { front: '#152734', side: '#1e3647', top: '#244154' }, '#46687d', 1.2);
    // Silver Fuel Tank on right side between axles
    drawIsoBox(132, 190, 108, 126, 20, 40, { front: '#678496', side: '#8ca9ba', top: '#a8c4d4' }, '#2d4757', 1.2);

    // 3. Flatbed Deck & Steel Side Rails (u = 104..338, v = 0..130)
    // Main Bed Deck Surface
    drawIsoBox(104, 338, 0, 130, 42, 54, { front: '#1a3648', side: '#294d64', top: 'url(#bedDeck)' }, '#84aec4', 1.7);
    // Subtle deck planks on top surface
    for (let pv = 18; pv < 120; pv += 20) {
      const p1 = iso(108, pv, 54), p2 = iso(334, pv, 54);
      g.append(el('line', { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: 'rgba(150,200,226,0.16)', 'stroke-width': 1 }));
    }
    // Tailgate Red/Amber Rear Light Cluster on right-rear corner
    g.append(el('polygon', {
      points: isoPts([[322, 130, 44], [336, 130, 44], [336, 130, 51], [322, 130, 51]]),
      class: 'cm-taillight',
    }));

    // 4. Steel Headboard Protective Rack (龍門架, u = 104)
    g.append(el('polyline', {
      points: isoPts([[104, 2, 54], [104, 2, 126], [104, 128, 126], [104, 128, 54]]),
      fill: 'none', stroke: '#a8cee0', 'stroke-width': 4, 'stroke-linejoin': 'round',
    }));
    g.append(el('polyline', {
      points: isoPts([[104, 2, 92], [104, 128, 92]]),
      fill: 'none', stroke: '#7fa7bd', 'stroke-width': 2.4,
    }));
    g.append(el('polyline', {
      points: isoPts([[104, 65, 54], [104, 65, 126]]),
      fill: 'none', stroke: '#7fa7bd', 'stroke-width': 2.4,
    }));

    // 5. Rear Cargo Crate & Front Cargo Crate (drawn Back-to-Front!)
    const drawCrate3D = (u0, u1, label) => {
      // Wooden pallet base
      drawIsoBox(u0 - 3, u1 + 3, 10, 120, 54, 60, { front: '#4a331d', side: '#5c4126', top: '#705030' }, '#85623d', 1.1);
      // Kraft Cardboard Crate
      drawIsoBox(u0, u1, 14, 116, 60, 110, { front: 'url(#crateSideL)', side: 'url(#crateSideR)', top: 'url(#crateTop)' }, '#ebd0a2', 1.3);
      // Packing tape strip along top center
      g.append(el('polygon', {
        points: isoPts([[u0, 58, 110.2], [u1, 58, 110.2], [u1, 72, 110.2], [u0, 72, 110.2]]),
        fill: 'rgba(255,244,218,0.34)',
      }));
      const [lx, ly] = iso((u0 + u1) / 2, 65, 110.5);
      g.append(el('text', { x: lx, y: ly + 4, class: 'cm-crate-lbl', 'text-anchor': 'middle' }, label));
    };
    drawCrate3D(228, 320, '後段貨物');
    drawCrate3D(120, 212, '前段貨物');

    // 6. 3D Commercial Cab (u = 0..96, v = 6..124, z = 24..116 with sloped aerodynamic windshield!)
    // Lower Cab Body (z = 24..72)
    drawIsoBox(4, 96, 6, 124, 24, 72, { front: 'url(#cabFront)', side: 'url(#cabSide)', top: '#dcecf6' }, '#698fa6', 1.5);
    // Upper Sloped Cab Cabin (front leans back from u=4 at z=72 to u=22 at z=116)
    // Sloped Front Windshield Plane
    g.append(el('polygon', {
      points: isoPts([[4, 6, 72], [4, 124, 72], [22, 124, 116], [22, 6, 116]]),
      fill: 'url(#cabFront)', stroke: '#698fa6', 'stroke-width': 1.5, 'stroke-linejoin': 'round',
    }));
    // Right Side Upper Door & A-Pillar
    g.append(el('polygon', {
      points: isoPts([[4, 124, 72], [96, 124, 72], [96, 124, 116], [22, 124, 116]]),
      fill: 'url(#cabSide)', stroke: '#698fa6', 'stroke-width': 1.5, 'stroke-linejoin': 'round',
    }));
    // Cab Roof (Top)
    g.append(el('polygon', {
      points: isoPts([[22, 6, 116], [96, 6, 116], [96, 124, 116], [22, 124, 116]]),
      fill: 'url(#cabPaint)', stroke: '#84a9bf', 'stroke-width': 1.5, 'stroke-linejoin': 'round',
    }));
    // Roof Wind Deflector Trim
    g.append(el('polygon', {
      points: isoPts([[32, 18, 117], [86, 18, 117], [86, 112, 117], [32, 112, 117]]),
      fill: 'rgba(255,255,255,0.36)', stroke: '#9ab9cc', 'stroke-width': 1,
    }));

    // Tinted Panoramic Front Windshield Glass (inset on sloped plane)
    g.append(el('polygon', {
      points: isoPts([[6, 14, 76], [6, 116, 76], [21, 116, 111], [21, 14, 111]]),
      fill: 'url(#glassGrad)', stroke: '#122938', 'stroke-width': 1.8, 'stroke-linejoin': 'round',
    }));
    // Side Door Window Glass
    g.append(el('polygon', {
      points: isoPts([[14, 124.2, 75], [84, 124.2, 75], [84, 124.2, 108], [26, 124.2, 108]]),
      fill: 'url(#glassGrad)', stroke: '#122938', 'stroke-width': 1.5, 'stroke-linejoin': 'round',
    }));
    // Door Seam & Handle
    g.append(el('polyline', {
      points: isoPts([[86, 124.4, 34], [86, 124.4, 110]]),
      fill: 'none', stroke: '#52758a', 'stroke-width': 1.2,
    }));
    g.append(el('polygon', {
      points: isoPts([[66, 124.6, 60], [78, 124.6, 60], [78, 124.6, 64], [66, 124.6, 64]]),
      fill: '#233b4a',
    }));

    // Front Grille + Emblem + Headlights + Turn Signals on Front Face (u = 4)
    g.append(el('polygon', {
      points: isoPts([[3.6, 30, 44], [3.6, 100, 44], [3.6, 100, 62], [3.6, 30, 62]]),
      fill: '#182d3b', stroke: '#5e8399', 'stroke-width': 1.3,
    }));
    for (const gz of [49, 55]) {
      const p1 = iso(3.4, 34, gz), p2 = iso(3.4, 96, gz);
      g.append(el('line', { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: '#89b0c4', 'stroke-width': 1.2 }));
    }
    // Left & Right Crystal Headlights
    g.append(el('polygon', {
      points: isoPts([[3.5, 10, 45], [3.5, 26, 45], [3.5, 26, 58], [3.5, 10, 58]]),
      fill: '#fff4bd', stroke: '#d9b54c', 'stroke-width': 1.1,
    }));
    g.append(el('polygon', {
      points: isoPts([[3.5, 104, 45], [3.5, 120, 45], [3.5, 120, 58], [3.5, 104, 58]]),
      fill: '#fff4bd', stroke: '#d9b54c', 'stroke-width': 1.1,
    }));
    // Amber corner turn indicator
    g.append(el('polygon', {
      points: isoPts([[4, 124.3, 46], [14, 124.3, 46], [14, 124.3, 56], [4, 124.3, 56]]),
      fill: '#ff9e2c',
    }));
    // Rugged Dark Front Bumper (protruding slightly to u = -2)
    drawIsoBox(-2, 10, 4, 126, 22, 36, { front: '#1c3140', side: '#253f52', top: '#33546b' }, '#6c91a6', 1.3);

    // Side Mirror (Right near side)
    g.append(el('polygon', {
      points: isoPts([[18, 131, 82], [24, 131, 82], [24, 131, 102], [18, 131, 102]]),
      fill: '#1e3647', stroke: '#93b9ce', 'stroke-width': 1.2,
    }));

    // 7. Near-Side Wheels (Front Steer + Rear Dual Drive Wheels)
    drawWheel3D(52, 125, 22, 16, 22);
    drawWheel3D(258, 125, 23, 18, 24);

    // 8. 3D RATCHET STRAPS WRAPPING CLEANLY OVER THE CARGO CRATES
    const isoStraps = [
      { key: 'c-front', pts: [[152, 0, 48], [152, 14, 111], [152, 116, 111], [152, 130, 48]] },
      { key: 'c-mid',   pts: [[226, 0, 48], [226, 14, 111], [226, 116, 111], [226, 130, 48]] },
      { key: 'c-rear',  pts: [[300, 0, 48], [300, 14, 111], [300, 116, 111], [300, 130, 48]] },
      { key: 'c-top-f', pts: [[106, 36, 132], [120, 65, 111], [212, 65, 111]] },
      { key: 'c-top-r', pts: [[228, 65, 111], [320, 65, 111], [338, 65, 48]] },
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

  function appendSlotMarkers(svg, viewName) {
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
          g.append(el('circle', { cx: pt.x, cy: pt.y, r: 24, class: `cm-pulse cm-pulse-${st}` }));
        }
        g.append(el('circle', { cx: pt.x, cy: pt.y, r: 17, class: 'cm-node-bg' }));
        g.append(el('text', { x: pt.x, y: pt.y + 5, class: 'cm-node-num', 'text-anchor': 'middle' }, `#${occupant}`));

        const w = 112, h = 42;
        let bx = pt.side === 'left' ? Math.max(12, pt.x - w - 26)
               : pt.side === 'right' ? Math.min(VB_W - w - 12, pt.x + 26)
               : Math.min(VB_W - w - 12, Math.max(12, pt.x - w / 2));
        let by = pt.side === 'top' ? Math.max(40, pt.y - h - 22)
               : pt.side === 'bottom' ? Math.min(VB_H - h - 14, pt.y + 22)
               : pt.y - 21;

        const hasAngle = !liveStale && sensor?.valid && sensor?.calibrated && Number.isFinite(sensor.delta);
        const bigVal = hasAngle ? `${sensor.delta > 0 ? '+' : ''}${sensor.delta.toFixed(1)}°`
                     : st === 'sensor_error' ? '異常'
                     : st === 'uncalibrated' ? '未校正'
                     : '—';
        const sub = st === 'alarm' ? `${slot.label} · 鬆脫` : st === 'confirming' ? `${slot.label} · 確認` : slot.label;

        g.append(el('rect', { x: bx, y: by, width: w, height: h, rx: 10, class: `cm-callout cm-callout-${st}` }));
        g.append(el('text', { x: bx + w / 2, y: by + 15, class: 'cm-callout-title', 'text-anchor': 'middle' }, `#${occupant} ${sub}`));
        g.append(el('text', { x: bx + w / 2, y: by + 35, class: 'cm-callout-big', 'text-anchor': 'middle' }, bigVal));
      } else {
        g.append(el('circle', { cx: pt.x, cy: pt.y, r: 10.5, class: 'cm-empty-dot' }));
        g.append(el('text', { x: pt.x, y: pt.y + 4, class: 'cm-empty-plus', 'text-anchor': 'middle' }, '+'));
        const lx = pt.side === 'left' ? pt.x - 24 : pt.side === 'right' ? pt.x + 24 : pt.x;
        const ly = pt.side === 'top' ? pt.y - 16 : pt.side === 'bottom' ? pt.y + 22 : pt.y + 4;
        g.append(el('text', { x: lx, y: ly, class: 'cm-empty-label', 'text-anchor': 'middle' }, slot.label));
      }

      svg.append(g);
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

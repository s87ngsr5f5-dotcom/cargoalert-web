// CargoAlert v3.2 Detailed Commercial Truck & 3D Cargo Model
// Crisp industrial blueprint SVG, zero-overlap labels, drag-and-drop + click placement

export const MODEL_SLOTS = [
  { id: 'front-left',   label: '前左', truck: { x: 184, y: 158, strap: 'h-front', side: 'left'   }, cargo: { x: 156, y: 146, strap: 'c-front', side: 'left'   } },
  { id: 'front-center', label: '前中', truck: { x: 280, y: 134, strap: 'v-front', side: 'top'    }, cargo: { x: 280, y: 92,  strap: 'c-top-f', side: 'top'    } },
  { id: 'front-right',  label: '前右', truck: { x: 376, y: 158, strap: 'h-front', side: 'right'  }, cargo: { x: 404, y: 146, strap: 'c-front', side: 'right'  } },
  { id: 'mid-left',     label: '中左', truck: { x: 184, y: 228, strap: 'h-mid',   side: 'left'   }, cargo: { x: 144, y: 214, strap: 'c-mid',   side: 'left'   } },
  { id: 'mid-right',    label: '中右', truck: { x: 376, y: 228, strap: 'h-mid',   side: 'right'  }, cargo: { x: 416, y: 214, strap: 'c-mid',   side: 'right'  } },
  { id: 'rear-left',    label: '後左', truck: { x: 184, y: 298, strap: 'h-rear',  side: 'left'   }, cargo: { x: 170, y: 280, strap: 'c-rear',  side: 'left'   } },
  { id: 'rear-center',  label: '後尾', truck: { x: 280, y: 326, strap: 'v-rear',  side: 'bottom' }, cargo: { x: 280, y: 314, strap: 'c-top-r', side: 'bottom' } },
  { id: 'rear-right',   label: '後右', truck: { x: 376, y: 298, strap: 'h-rear',  side: 'right'  }, cargo: { x: 390, y: 280, strap: 'c-rear',  side: 'right'  } },
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
    onChange?.(getPlacementInfo());
  }

  function setActiveSensor(id) {
    activeSensor = id === 2 ? 2 : 1;
    render();
    onSelectSensor?.(activeSensor);
  }

  function applyPreset(key) {
    const p = PRESETS[key];
    if (!p) return;
    config.s1 = p.s1;
    config.s2 = p.s2;
    save();
    render();
    onChange?.(getPlacementInfo());
  }

  function setNote(sensorId, text) {
    const cleaned = String(text || '').slice(0, 20);
    if (sensorId === 1) config.note1 = cleaned;
    else config.note2 = cleaned;
    save();
    onChange?.(getPlacementInfo());
  }

  function sensorVisualState(s) {
    if (liveStale || !s || s.state === 'offline') return 'offline';
    if (!s.valid || s.state === 'sensor_error') return 'sensor_error';
    if (!s.calibrated || s.state === 'uncalibrated') return 'uncalibrated';
    return s.state || 'normal';
  }

  function strapStateFor(strapName) {
    const states = [];
    for (const [sid, slotId] of [[1, config.s1], [2, config.s2]]) {
      const sl = slotById(slotId);
      const pos = config.view === 'truck' ? sl.truck : sl.cargo;
      if (pos.strap === strapName) states.push(sensorVisualState(liveSensors[sid - 1]));
    }
    if (!states.length) return 'idle';
    if (states.includes('alarm')) return 'alarm';
    if (states.includes('sensor_error')) return 'sensor_error';
    if (states.includes('confirming') || states.includes('warning')) return 'confirming';
    if (states.includes('normal')) return 'normal';
    return 'uncalibrated';
  }

  function attachDragHandlers(svg, viewName) {
    const pointToSvg = evt => {
      const rect = svg.getBoundingClientRect();
      return {
        x: ((evt.clientX - rect.left) / rect.width) * 560,
        y: ((evt.clientY - rect.top) / rect.height) * 390,
      };
    };
    const nearestSlot = pt => {
      let best = null, minD = 44;
      for (const s of MODEL_SLOTS) {
        const p = viewName === 'truck' ? s.truck : s.cargo;
        const d = Math.hypot(p.x - pt.x, p.y - pt.y);
        if (d < minD) { minD = d; best = s.id; }
      }
      return best;
    };
    svg.addEventListener('pointermove', evt => {
      if (!draggingSensor) return;
      const hit = nearestSlot(pointToSvg(evt));
      if (hit !== hoverSlotId) {
        hoverSlotId = hit || '';
        svg.querySelectorAll('.cm-slot').forEach(node => {
          node.classList.toggle('cm-drop-target', node.dataset.slot === hoverSlotId);
        });
      }
    });
    const finishDrag = evt => {
      if (!draggingSensor) return;
      const target = nearestSlot(pointToSvg(evt));
      const sid = draggingSensor;
      draggingSensor = 0;
      hoverSlotId = '';
      if (target) placeSensor(sid, target);
      else render();
    };
    svg.addEventListener('pointerup', finishDrag);
    svg.addEventListener('pointercancel', () => { draggingSensor = 0; hoverSlotId = ''; render(); });
  }

  function appendDefs(svg) {
    const defs = el('defs');
    // Blueprint Grid
    const pat = el('pattern', { id: 'cmGrid', width: 22, height: 22, patternUnits: 'userSpaceOnUse' });
    pat.append(el('path', { d: 'M 22 0 L 0 0 0 22', fill: 'none', stroke: 'rgba(130,192,214,0.07)', 'stroke-width': 1 }));
    defs.append(pat);

    // Metallic Cab Gradient
    const cabGrad = el('linearGradient', { id: 'cabGrad', x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
    cabGrad.append(
      el('stop', { offset: '0%', 'stop-color': '#1b4760' }),
      el('stop', { offset: '22%', 'stop-color': '#2b6685' }),
      el('stop', { offset: '50%', 'stop-color': '#327496' }),
      el('stop', { offset: '78%', 'stop-color': '#2b6685' }),
      el('stop', { offset: '100%', 'stop-color': '#1b4760' })
    );
    defs.append(cabGrad);

    // Windshield Glass Gradient
    const glassGrad = el('linearGradient', { id: 'glassGrad', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    glassGrad.append(
      el('stop', { offset: '0%', 'stop-color': '#0b1f2e' }),
      el('stop', { offset: '45%', 'stop-color': '#163c54' }),
      el('stop', { offset: '100%', 'stop-color': '#0d2536' })
    );
    defs.append(glassGrad);

    // Headlight Beam Gradient
    const beamGrad = el('linearGradient', { id: 'beamGrad', x1: '0%', y1: '100%', x2: '0%', y2: '0%' });
    beamGrad.append(
      el('stop', { offset: '0%', 'stop-color': 'rgba(255,232,148,0.28)' }),
      el('stop', { offset: '100%', 'stop-color': 'rgba(255,232,148,0)' })
    );
    defs.append(beamGrad);

    // Bed Floor Gradient
    const bedGrad = el('linearGradient', { id: 'bedGrad', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    bedGrad.append(
      el('stop', { offset: '0%', 'stop-color': '#10293a' }),
      el('stop', { offset: '100%', 'stop-color': '#16374d' })
    );
    defs.append(bedGrad);

    // Cargo Box Gradient
    const boxGrad = el('linearGradient', { id: 'boxGrad', x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
    boxGrad.append(
      el('stop', { offset: '0%', 'stop-color': '#2c586e' }),
      el('stop', { offset: '100%', 'stop-color': '#1e4052' })
    );
    defs.append(boxGrad);

    svg.append(defs);
  }

  function appendHud(svg) {
    const s1st = sensorVisualState(liveSensors[0]);
    const s2st = sensorVisualState(liveSensors[1]);
    const alarms = [s1st, s2st].filter(x => x === 'alarm').length;
    const text = alarms ? `鬆脫警報 (${alarms})` : liveStale ? '離線' : (s1st === 'normal' && s2st === 'normal') ? '雙側正常' : '監測中';
    const cls = alarms ? 'cm-hud-alarm' : (s1st === 'normal' && s2st === 'normal' && !liveStale) ? 'cm-hud-ok' : 'cm-status-hud';
    svg.append(el('rect', { x: 14, y: 12, width: 102, height: 24, rx: 12, class: cls }));
    svg.append(el('text', { x: 65, y: 28, class: 'cm-hud-txt', 'text-anchor': 'middle' }, text));
  }

  function buildTruckSvg() {
    const svg = el('svg', {
      viewBox: '0 0 560 390',
      class: 'cargo-model-svg',
      role: 'img',
      'aria-label': '貨車貨斗感知器配置圖',
    });

    appendDefs(svg);
    svg.append(el('rect', { x: 0, y: 0, width: 560, height: 390, rx: 14, fill: 'url(#cmGrid)' }));
    appendHud(svg);

    // Subtle direction labels
    svg.append(el('text', { x: 280, y: 20, class: 'cm-dir-label', 'text-anchor': 'middle' }, '▲ 車頭'));
    svg.append(el('text', { x: 54, y: 232, class: 'cm-side-label', 'text-anchor': 'middle' }, '左'));
    svg.append(el('text', { x: 506, y: 232, class: 'cm-side-label', 'text-anchor': 'middle' }, '右'));
    svg.append(el('text', { x: 280, y: 380, class: 'cm-dir-label', 'text-anchor': 'middle' }, '車尾'));

    // Ground Shadow under Truck
    svg.append(el('rect', { x: 162, y: 38, width: 236, height: 318, rx: 22, fill: 'rgba(0,0,0,0.34)' }));

    // Headlight Glow Cones
    svg.append(el('polygon', { points: '196,42 172,10 226,10 220,42', fill: 'url(#beamGrad)' }));
    svg.append(el('polygon', { points: '340,42 334,10 388,10 364,42', fill: 'url(#beamGrad)' }));

    // Front Single Tires & Rear Twin Tires (with tread lines)
    const drawTire = (x, y, w, h) => {
      svg.append(el('rect', { x, y, width: w, height: h, rx: 4, class: 'cm-wheel' }));
      for (let ty = y + 6; ty < y + h - 4; ty += 7) {
        svg.append(el('line', { x1: x + 2, y1: ty, x2: x + w - 2, y2: ty, stroke: 'rgba(130,175,195,0.22)', 'stroke-width': 1.2 }));
      }
    };
    drawTire(164, 58, 15, 38);
    drawTire(381, 58, 15, 38);
    // Rear Dual Wheels (Commercial Truck style)
    drawTire(158, 256, 13, 46);
    drawTire(172, 256, 11, 46);
    drawTire(377, 256, 11, 46);
    drawTire(389, 256, 13, 46);

    // Side Mirrors with Brackets
    svg.append(el('path', { d: 'M180 62 L154 54 L152 68 L178 72 Z', class: 'cm-mirror' }));
    svg.append(el('path', { d: 'M380 62 L406 54 L408 68 L382 72 Z', class: 'cm-mirror' }));

    // Front Bumper
    svg.append(el('path', { d: 'M188 38 Q280 28 372 38 L376 46 Q280 38 184 46 Z', fill: '#355f78', stroke: '#7db1c9', 'stroke-width': 1.4 }));

    // Truck Cab Body (Rounded commercial cab)
    svg.append(el('path', {
      d: 'M186 44 Q280 36 374 44 L382 62 L382 114 Q382 120 374 120 L186 120 Q178 120 178 114 L178 62 Z',
      fill: 'url(#cabGrad)', stroke: '#7bb3cc', 'stroke-width': 2,
    }));

    // Headlights & Turn Signals
    svg.append(el('rect', { x: 194, y: 40, width: 26, height: 6, rx: 3, class: 'cm-headlight' }));
    svg.append(el('rect', { x: 340, y: 40, width: 26, height: 6, rx: 3, class: 'cm-headlight' }));
    svg.append(el('rect', { x: 244, y: 40, width: 72, height: 4, rx: 2, fill: 'rgba(15,39,56,0.65)' }));

    // Curved Windshield + Reflection + Wipers
    svg.append(el('path', {
      d: 'M192 54 Q280 46 368 54 L373 76 Q280 70 187 76 Z',
      fill: 'url(#glassGrad)', stroke: '#6da5bf', 'stroke-width': 1.5,
    }));
    svg.append(el('path', { d: 'M202 58 L224 56 L216 71 L196 72 Z', fill: 'rgba(255,255,255,0.09)' }));
    svg.append(el('line', { x1: 215, y1: 56, x2: 248, y2: 64, stroke: '#9bc5d6', 'stroke-width': 1.4, 'stroke-linecap': 'round' }));
    svg.append(el('line', { x1: 288, y1: 56, x2: 322, y2: 64, stroke: '#9bc5d6', 'stroke-width': 1.4, 'stroke-linecap': 'round' }));

    // Cab Roof Panel & Air Deflector Line
    svg.append(el('rect', { x: 198, y: 82, width: 164, height: 30, rx: 8, fill: 'rgba(13,37,54,0.38)', stroke: 'rgba(138,195,219,0.35)', 'stroke-width': 1.2 }));
    svg.append(el('line', { x1: 216, y1: 97, x2: 344, y2: 97, stroke: 'rgba(138,195,219,0.22)', 'stroke-width': 1.4 }));

    // Chassis Gap + Headboard Protective Rack (龍門架)
    svg.append(el('rect', { x: 214, y: 120, width: 132, height: 8, fill: '#0b1b26' }));
    svg.append(el('rect', { x: 174, y: 126, width: 212, height: 8, rx: 3, fill: '#3b6c85', stroke: '#8bc0d6', 'stroke-width': 1.5 }));

    // Flatbed Cargo Deck (Outer Rail + Inner Bed Floor)
    svg.append(el('rect', { x: 174, y: 132, width: 212, height: 212, rx: 8, fill: 'url(#bedGrad)', stroke: '#6fa7c2', 'stroke-width': 2.6 }));
    // Side Rail Posts (欄板柱)
    for (const py of [158, 228, 298]) {
      svg.append(el('rect', { x: 171, y: py - 7, width: 6, height: 14, rx: 2, fill: '#8bc0d6' }));
      svg.append(el('rect', { x: 383, y: py - 7, width: 6, height: 14, rx: 2, fill: '#8bc0d6' }));
    }
    // Wooden/Steel Deck Planks
    for (let x = 198; x <= 362; x += 27) {
      svg.append(el('line', { x1: x, y1: 138, x2: x, y2: 338, class: 'cm-bed-rib' }));
    }

    // Two Realistic Cargo Pallets / Boxes
    const drawCrate = (x, y, w, h, title) => {
      svg.append(el('rect', { x: x + 3, y: y + 4, width: w, height: h, rx: 6, fill: 'rgba(0,0,0,0.28)' }));
      svg.append(el('rect', { x, y, width: w, height: h, rx: 6, fill: 'url(#boxGrad)', stroke: '#84b4c9', 'stroke-width': 1.6 }));
      svg.append(el('rect', { x: x + 6, y: y + 6, width: w - 12, height: h - 12, rx: 4, fill: 'none', stroke: 'rgba(180,220,235,0.2)', 'stroke-width': 1 }));
      svg.append(el('line', { x1: x, y1: y + h / 2, x2: x + w, y2: y + h / 2, class: 'cm-cargo-tape' }));
      svg.append(el('text', { x: x + w / 2, y: y + h / 2 + 4, class: 'cm-cargo-text', 'text-anchor': 'middle' }, title));
    };
    drawCrate(202, 148, 156, 72, '前段貨物');
    drawCrate(202, 234, 156, 76, '後段貨物');

    // Straps + Ratchet Tensioners
    const straps = [
      { key: 'h-front', x1: 180, y1: 158, x2: 380, y2: 158, rx: 273, ry: 154 },
      { key: 'h-mid',   x1: 180, y1: 228, x2: 380, y2: 228, rx: 273, ry: 224 },
      { key: 'h-rear',  x1: 180, y1: 298, x2: 380, y2: 298, rx: 273, ry: 294 },
      { key: 'v-front', x1: 280, y1: 134, x2: 280, y2: 228, rx: 276, ry: 178 },
      { key: 'v-rear',  x1: 280, y1: 228, x2: 280, y2: 326, rx: 276, ry: 272 },
    ];
    for (const st of straps) {
      const stState = strapStateFor(st.key);
      if (stState === 'idle' && (st.key === 'v-front' || st.key === 'v-rear')) continue;
      svg.append(el('line', { x1: st.x1, y1: st.y1, x2: st.x2, y2: st.y2, class: `cm-strap cm-strap-${stState}` }));
      if (stState !== 'idle') {
        svg.append(el('rect', { x: st.rx, y: st.ry, width: 14, height: 8, rx: 2, class: 'cm-ratchet' }));
      }
    }

    // Rear Bumper + Tailgate + Taillights + Reverse Lights
    svg.append(el('rect', { x: 178, y: 342, width: 204, height: 10, rx: 4, fill: '#2c5870', stroke: '#7eb2c9', 'stroke-width': 1.5 }));
    svg.append(el('rect', { x: 186, y: 345, width: 24, height: 5, rx: 2, class: 'cm-taillight' }));
    svg.append(el('rect', { x: 350, y: 345, width: 24, height: 5, rx: 2, class: 'cm-taillight' }));
    svg.append(el('rect', { x: 214, y: 345, width: 10, height: 5, rx: 1.5, fill: '#f6d27a' }));
    svg.append(el('rect', { x: 336, y: 345, width: 10, height: 5, rx: 1.5, fill: '#f6d27a' }));

    appendSlotMarkers(svg, 'truck');
    attachDragHandlers(svg, 'truck');
    return svg;
  }

  function buildCargoSvg() {
    const svg = el('svg', {
      viewBox: '0 0 560 390',
      class: 'cargo-model-svg',
      role: 'img',
      'aria-label': '立體貨物模型感知器配置圖',
    });

    appendDefs(svg);
    svg.append(el('rect', { x: 0, y: 0, width: 560, height: 390, rx: 14, fill: 'url(#cmGrid)' }));
    appendHud(svg);
    svg.append(el('text', { x: 280, y: 24, class: 'cm-dir-label', 'text-anchor': 'middle' }, '3D 貨物視角'));

    // Pallet Base
    svg.append(el('polygon', { points: '280,342 126,262 126,244 280,324 434,244 434,262', class: 'cm-pallet-side' }));
    svg.append(el('polygon', { points: '280,324 126,244 280,166 434,244', class: 'cm-pallet-top' }));

    // 3D Crate
    svg.append(el('polygon', { points: '280,308 144,236 144,136 280,208', class: 'cm-iso-left' }));
    svg.append(el('polygon', { points: '280,308 416,236 416,136 280,208', class: 'cm-iso-right' }));
    svg.append(el('polygon', { points: '280,208 144,136 280,66 416,136', class: 'cm-iso-top' }));
    svg.append(el('line', { x1: 212, y1: 101, x2: 348, y2: 172, class: 'cm-cargo-tape' }));
    svg.append(el('text', { x: 280, y: 144, class: 'cm-cargo-text', 'text-anchor': 'middle' }, '固定貨物'));

    const isoStraps = [
      { key: 'c-front', d: 'M156 146 L280 82 L404 146' },
      { key: 'c-mid',   d: 'M144 214 L280 144 L416 214' },
      { key: 'c-rear',  d: 'M170 280 L280 226 L390 280' },
      { key: 'c-top-f', d: 'M280 66 L280 208' },
      { key: 'c-top-r', d: 'M280 208 L280 324' },
    ];
    for (const st of isoStraps) {
      const stState = strapStateFor(st.key);
      if (stState === 'idle' && (st.key === 'c-top-f' || st.key === 'c-top-r')) continue;
      svg.append(el('path', { d: st.d, fill: 'none', class: `cm-strap cm-strap-${stState}` }));
    }

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
          g.append(el('circle', { cx: pt.x, cy: pt.y, r: 23, class: `cm-pulse cm-pulse-${st}` }));
        }
        g.append(el('circle', { cx: pt.x, cy: pt.y, r: 17, class: 'cm-node-bg' }));
        g.append(el('text', { x: pt.x, y: pt.y + 5, class: 'cm-node-num', 'text-anchor': 'middle' }, `#${occupant}`));

        // Crisp big-number callout beside sensor (never overlaps cab or edges)
        const w = 108, h = 40;
        const bx = pt.side === 'left' ? Math.max(12, pt.x - w - 24)
                 : pt.side === 'right' ? Math.min(548 - w, pt.x + 24)
                 : pt.x + 26;
        const by = pt.side === 'top' ? pt.y - 20
                 : pt.side === 'bottom' ? pt.y - 18
                 : pt.y - 20;

        const hasAngle = !liveStale && sensor?.valid && sensor?.calibrated && Number.isFinite(sensor.delta);
        const bigVal = hasAngle ? `${sensor.delta > 0 ? '+' : ''}${sensor.delta.toFixed(1)}°`
                     : st === 'sensor_error' ? '異常'
                     : st === 'uncalibrated' ? '未校正'
                     : '—';
        const sub = st === 'alarm' ? `${slot.label} · 鬆脫` : st === 'confirming' ? `${slot.label} · 確認` : `${slot.label}`;

        g.append(el('rect', { x: bx, y: by, width: w, height: h, rx: 9, class: `cm-callout cm-callout-${st}` }));
        g.append(el('text', { x: bx + w / 2, y: by + 14, class: 'cm-callout-title', 'text-anchor': 'middle' }, `#${occupant} ${sub}`));
        g.append(el('text', { x: bx + w / 2, y: by + 33, class: 'cm-callout-big', 'text-anchor': 'middle' }, bigVal));
      } else {
        g.append(el('circle', { cx: pt.x, cy: pt.y, r: 10.5, class: 'cm-empty-dot' }));
        g.append(el('text', { x: pt.x, y: pt.y + 4, class: 'cm-empty-plus', 'text-anchor': 'middle' }, '+'));
        const lx = pt.side === 'left' ? pt.x - 24 : pt.side === 'right' ? pt.x + 24 : pt.x + 26;
        const ly = pt.side === 'top' || pt.side === 'bottom' ? pt.y + 4 : pt.y + 4;
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
    if (hint) {
      hint.textContent = `拖曳 #1／#2 或點擊「＋」調整位置`;
    }
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

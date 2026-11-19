// CargoAlert v3.1 Interactive Truck Bed & 3D Isometric Cargo Model
// Supports Click-to-Place, Drag-and-Drop between 8 slots, Auto-Swap, Ratchet Details & Real-Time Alarm Radar

export const MODEL_SLOTS = [
  { id: 'front-left',   label: '前左側', short: '前左', truck: { x: 168, y: 122, strap: 'h-front', side: 'left'   }, cargo: { x: 146, y: 128, strap: 'c-front', side: 'left'   } },
  { id: 'front-center', label: '前中央', short: '前中', truck: { x: 260, y: 94,  strap: 'v-left',  side: 'top'    }, cargo: { x: 260, y: 82,  strap: 'c-top-f', side: 'top'    } },
  { id: 'front-right',  label: '前右側', short: '前右', truck: { x: 352, y: 122, strap: 'h-front', side: 'right'  }, cargo: { x: 374, y: 128, strap: 'c-front', side: 'right'  } },
  { id: 'mid-left',     label: '中左側', short: '中左', truck: { x: 168, y: 186, strap: 'h-mid',   side: 'left'   }, cargo: { x: 134, y: 190, strap: 'c-mid',   side: 'left'   } },
  { id: 'mid-right',    label: '中右側', short: '中右', truck: { x: 352, y: 186, strap: 'h-mid',   side: 'right'  }, cargo: { x: 386, y: 190, strap: 'c-mid',   side: 'right'  } },
  { id: 'rear-left',    label: '後左側', short: '後左', truck: { x: 168, y: 252, strap: 'h-rear',  side: 'left'   }, cargo: { x: 160, y: 252, strap: 'c-rear',  side: 'left'   } },
  { id: 'rear-center',  label: '後尾門', short: '後尾', truck: { x: 260, y: 278, strap: 'v-right', side: 'bottom' }, cargo: { x: 260, y: 280, strap: 'c-top-r', side: 'bottom' } },
  { id: 'rear-right',   label: '後右側', short: '後右', truck: { x: 352, y: 252, strap: 'h-rear',  side: 'right'  }, cargo: { x: 360, y: 252, strap: 'c-rear',  side: 'right'  } },
];

export const PRESETS = {
  diagonal: { name: '對角固定（推薦）', s1: 'front-left',   s2: 'rear-right'  },
  front:    { name: '前側左右雙綁',     s1: 'front-left',   s2: 'front-right' },
  left:     { name: '左側前後雙綁',     s1: 'front-left',   s2: 'rear-left'   },
  center:   { name: '前後軸向固定',     s1: 'front-center', s2: 'rear-center' },
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
      btn.textContent = dark ? '☀️ 淺色模式' : '🌙 深色儀表';
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
    note1: '前左主束帶',
    note2: '後右尾門束帶',
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
        if (typeof saved.note1 === 'string') config.note1 = saved.note1.slice(0, 24);
        if (typeof saved.note2 === 'string') config.note2 = saved.note2.slice(0, 24);
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
    return info.note ? `${info.label}（${info.note}）` : info.label;
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
    const cleaned = String(text || '').slice(0, 24);
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
        x: ((evt.clientX - rect.left) / rect.width) * 520,
        y: ((evt.clientY - rect.top) / rect.height) * 340,
      };
    };
    const nearestSlot = pt => {
      let best = null, minD = 42;
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

  function appendHud(svg) {
    const s1st = sensorVisualState(liveSensors[0]);
    const s2st = sensorVisualState(liveSensors[1]);
    const alarmCount = [s1st, s2st].filter(x => x === 'alarm').length;
    const summary = alarmCount ? `🚨 ${alarmCount} 處束帶鬆脫警報` : liveStale ? '離線／等待連線' : (s1st === 'normal' && s2st === 'normal') ? '✅ 雙側固定正常' : '監測中（拖曳或點擊調整位置）';
    svg.append(el('rect', { x: 14, y: 10, width: 174, height: 24, rx: 12, class: 'cm-status-hud' }));
    svg.append(el('text', { x: 101, y: 26, class: 'cm-hud-txt', 'text-anchor': 'middle' }, summary));
  }

  function buildTruckSvg() {
    const svg = el('svg', {
      viewBox: '0 0 520 340',
      class: 'cargo-model-svg',
      role: 'img',
      'aria-label': '貨車貨斗感知器配置互動模型',
    });

    const defs = el('defs');
    const pat = el('pattern', { id: 'cmGrid', width: 20, height: 20, patternUnits: 'userSpaceOnUse' });
    pat.append(el('path', { d: 'M 20 0 L 0 0 0 20', fill: 'none', stroke: 'rgba(148,197,214,0.08)', 'stroke-width': 1 }));
    defs.append(pat);
    svg.append(defs);
    svg.append(el('rect', { x: 0, y: 0, width: 520, height: 340, rx: 14, fill: 'url(#cmGrid)' }));

    appendHud(svg);
    svg.append(el('text', { x: 260, y: 21, class: 'cm-dir-label', 'text-anchor': 'middle' }, '▲ 車頭方向'));
    svg.append(el('text', { x: 76, y: 190, class: 'cm-side-label', 'text-anchor': 'middle' }, '左側 (駕駛)'));
    svg.append(el('text', { x: 444, y: 190, class: 'cm-side-label', 'text-anchor': 'middle' }, '右側 (副駕)'));
    svg.append(el('text', { x: 260, y: 332, class: 'cm-dir-label', 'text-anchor': 'middle' }, '車尾尾門'));

    // Wheels
    for (const [x, y, w, h] of [[146, 44, 15, 36], [359, 44, 15, 36], [144, 224, 17, 46], [359, 224, 17, 46]]) {
      svg.append(el('rect', { x, y, width: w, height: h, rx: 4, class: 'cm-wheel' }));
    }
    // Mirrors
    svg.append(el('path', { d: 'M162 46 L140 39 L140 52 L162 54 Z', class: 'cm-mirror' }));
    svg.append(el('path', { d: 'M358 46 L380 39 L380 52 L358 54 Z', class: 'cm-mirror' }));

    // Cab
    svg.append(el('path', { d: 'M172 32 Q260 23 348 32 L358 49 L358 84 L162 84 L162 49 Z', class: 'cm-cab' }));
    svg.append(el('path', { d: 'M178 41 Q260 35 342 41 L346 58 Q260 54 174 58 Z', class: 'cm-windshield' }));
    svg.append(el('rect', { x: 174, y: 29, width: 24, height: 5, rx: 2, class: 'cm-headlight' }));
    svg.append(el('rect', { x: 322, y: 29, width: 24, height: 5, rx: 2, class: 'cm-headlight' }));
    svg.append(el('text', { x: 260, y: 74, class: 'cm-cab-label', 'text-anchor': 'middle' }, '駕駛室'));

    // Bed Frame & Ribs
    svg.append(el('rect', { x: 158, y: 90, width: 204, height: 200, rx: 8, class: 'cm-bed' }));
    for (let x = 182; x <= 338; x += 26) {
      svg.append(el('line', { x1: x, y1: 96, x2: x, y2: 284, class: 'cm-bed-rib' }));
    }

    // Cargo Crates
    svg.append(el('rect', { x: 184, y: 108, width: 152, height: 70, rx: 6, class: 'cm-cargo-box' }));
    svg.append(el('line', { x1: 184, y1: 143, x2: 336, y2: 143, class: 'cm-cargo-tape' }));
    svg.append(el('text', { x: 260, y: 147, class: 'cm-cargo-text', 'text-anchor': 'middle' }, '前段貨物 / 棧板 A'));

    svg.append(el('rect', { x: 184, y: 192, width: 152, height: 76, rx: 6, class: 'cm-cargo-box' }));
    svg.append(el('line', { x1: 184, y1: 230, x2: 336, y2: 230, class: 'cm-cargo-tape' }));
    svg.append(el('text', { x: 260, y: 234, class: 'cm-cargo-text', 'text-anchor': 'middle' }, '後段貨物 / 棧板 B'));

    // Straps + Ratchet Buckles
    const straps = [
      { key: 'h-front', x1: 162, y1: 122, x2: 358, y2: 122, rx: 254, ry: 118 },
      { key: 'h-mid',   x1: 162, y1: 186, x2: 358, y2: 186, rx: 254, ry: 182 },
      { key: 'h-rear',  x1: 162, y1: 252, x2: 358, y2: 252, rx: 254, ry: 248 },
      { key: 'v-left',  x1: 260, y1: 94,  x2: 260, y2: 186, rx: 256, ry: 136 },
      { key: 'v-right', x1: 260, y1: 186, x2: 260, y2: 278, rx: 256, ry: 228 },
    ];
    for (const st of straps) {
      const stState = strapStateFor(st.key);
      if (stState === 'idle' && (st.key === 'v-left' || st.key === 'v-right')) continue;
      svg.append(el('line', { x1: st.x1, y1: st.y1, x2: st.x2, y2: st.y2, class: `cm-strap cm-strap-${stState}` }));
      if (stState !== 'idle') {
        svg.append(el('rect', { x: st.rx, y: st.ry, width: 12, height: 8, rx: 2, class: 'cm-ratchet' }));
      }
    }

    // Tailgate + Tail Lights
    svg.append(el('rect', { x: 164, y: 288, width: 192, height: 7, rx: 3, class: 'cm-tailgate' }));
    svg.append(el('rect', { x: 166, y: 292, width: 20, height: 4, rx: 1.5, class: 'cm-taillight' }));
    svg.append(el('rect', { x: 334, y: 292, width: 20, height: 4, rx: 1.5, class: 'cm-taillight' }));

    appendSlotMarkers(svg, 'truck');
    attachDragHandlers(svg, 'truck');
    return svg;
  }

  function buildCargoSvg() {
    const svg = el('svg', {
      viewBox: '0 0 520 340',
      class: 'cargo-model-svg',
      role: 'img',
      'aria-label': '立體貨物模型感知器配置互動圖',
    });

    const defs = el('defs');
    const pat = el('pattern', { id: 'cmGridIso', width: 20, height: 20, patternUnits: 'userSpaceOnUse' });
    pat.append(el('path', { d: 'M 20 0 L 0 0 0 20', fill: 'none', stroke: 'rgba(148,197,214,0.08)', 'stroke-width': 1 }));
    defs.append(pat);
    svg.append(defs);
    svg.append(el('rect', { x: 0, y: 0, width: 520, height: 340, rx: 14, fill: 'url(#cmGridIso)' }));
    appendHud(svg);
    svg.append(el('text', { x: 356, y: 26, class: 'cm-dir-label', 'text-anchor': 'middle' }, '3D 立體貨物（可拖曳或點擊）'));

    // Wooden pallet base
    svg.append(el('polygon', { points: '260,300 118,226 118,210 260,284 402,210 402,226', class: 'cm-pallet-side' }));
    svg.append(el('polygon', { points: '260,284 118,210 260,138 402,210', class: 'cm-pallet-top' }));

    // 3D Crate
    svg.append(el('polygon', { points: '260,270 134,204 134,116 260,182', class: 'cm-iso-left' }));
    svg.append(el('polygon', { points: '260,270 386,204 386,116 260,182', class: 'cm-iso-right' }));
    svg.append(el('polygon', { points: '260,182 134,116 260,54 386,116', class: 'cm-iso-top' }));
    svg.append(el('line', { x1: 197, y1: 85, x2: 323, y2: 149, class: 'cm-cargo-tape' }));
    svg.append(el('text', { x: 260, y: 124, class: 'cm-cargo-text', 'text-anchor': 'middle' }, '固定貨物本體'));

    const isoStraps = [
      { key: 'c-front', d: 'M146 128 L260 72 L374 128' },
      { key: 'c-mid',   d: 'M134 190 L260 124 L386 190' },
      { key: 'c-rear',  d: 'M160 252 L260 202 L360 252' },
      { key: 'c-top-f', d: 'M260 54 L260 182' },
      { key: 'c-top-r', d: 'M260 182 L260 284' },
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
        'aria-label': occupant
          ? `${slot.label}：${occupant === 1 ? '一號' : '二號'}感知器，可點擊切換或拖曳至其他位置`
          : `${slot.label}：空位，點擊放置${activeSensor === 1 ? '一號' : '二號'}感知器`,
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
        if (occupant && occupant !== activeSensor) {
          placeSensor(activeSensor, slot.id);
        } else if (!occupant) {
          placeSensor(activeSensor, slot.id);
        } else if (occupant) {
          onSelectSensor?.(occupant);
        }
      });
      g.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); placeSensor(activeSensor, slot.id); }
      });

      if (occupant) {
        if (st === 'alarm' || st === 'confirming') {
          g.append(el('circle', { cx: pt.x, cy: pt.y, r: 22, class: `cm-pulse cm-pulse-${st}` }));
        }
        g.append(el('circle', { cx: pt.x, cy: pt.y, r: 17, class: 'cm-node-bg' }));
        g.append(el('text', { x: pt.x, y: pt.y + 5, class: 'cm-node-num', 'text-anchor': 'middle' }, `#${occupant}`));

        // Safe clamped callout coordinates (never clips outside 0..520 x 0..340)
        const bx = pt.side === 'left' ? Math.max(10, pt.x - 124)
                 : pt.side === 'right' ? Math.min(410, pt.x + 22)
                 : pt.x - 50;
        const by = pt.side === 'top' ? Math.max(38, pt.y - 44)
                 : pt.side === 'bottom' ? Math.min(296, pt.y + 20)
                 : pt.y - 16;

        const angleStr = !liveStale && sensor?.valid && sensor?.calibrated && Number.isFinite(sensor.delta)
          ? `${sensor.delta > 0 ? '+' : ''}${sensor.delta.toFixed(1)}°`
          : st === 'sensor_error' ? '異常' : st === 'uncalibrated' ? '未校正' : '—';
        const stateTag = st === 'alarm' ? '⚠️鬆脫' : st === 'confirming' ? '確認中' : st === 'normal' ? '正常' : st === 'sensor_error' ? '故障' : '待命';

        g.append(el('rect', { x: bx, y: by, width: 100, height: 32, rx: 8, class: `cm-callout cm-callout-${st}` }));
        g.append(el('text', { x: bx + 50, y: by + 13, class: 'cm-callout-title', 'text-anchor': 'middle' }, `${occupant === 1 ? '一號' : '二號'} · ${slot.short}`));
        g.append(el('text', { x: bx + 50, y: by + 26, class: 'cm-callout-val', 'text-anchor': 'middle' }, `${angleStr} ${stateTag}`));
      } else {
        g.append(el('circle', { cx: pt.x, cy: pt.y, r: 11, class: 'cm-empty-dot' }));
        g.append(el('text', { x: pt.x, y: pt.y + 4, class: 'cm-empty-plus', 'text-anchor': 'middle' }, '+'));
        const ty = pt.side === 'top' ? pt.y - 15 : pt.y + 22;
        g.append(el('text', { x: pt.x, y: ty, class: 'cm-empty-label', 'text-anchor': 'middle' }, slot.short));
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
      hint.textContent = `目前選取【${activeSensor === 1 ? '一號感知器（GPIO21/22）' : '二號感知器（GPIO25/26）'}】— 點擊任一「＋」或直接拖曳 #1／#2 節點即可移動位置。`;
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

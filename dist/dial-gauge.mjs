// CargoAlert v3.4 Automotive Cockpit Semicircle Dial Gauge (-12° to +12°, ±4° Limit)
// 100% vector SVG, metallic bezel, live sweep arc, crisp ticks, zero-lag needle

const SVG_NS = 'http://www.w3.org/2000/svg';
const CX = 170, CY = 160, R = 116;
const MAX_DEG = 12; // -12°..+12° -> 1° = 7.5° dial sweep (±4° = wide 60° safe zone)
const ALARM_DEG = 4;
const WARN_DEG = 2.5;

function el(tag, attrs = {}, text = null) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== null) n.textContent = text;
  return n;
}

function polar(degFromTop, radius) {
  const rad = (degFromTop * Math.PI) / 180;
  return {
    x: CX + radius * Math.sin(rad),
    y: CY - radius * Math.cos(rad),
  };
}

function arcPath(degStart, degEnd, radius) {
  const a0 = Math.min(degStart, degEnd);
  const a1 = Math.max(degStart, degEnd);
  if (a1 - a0 < 0.05) return '';
  const s = polar(a0, radius);
  const e = polar(a1, radius);
  const large = (a1 - a0) > 180 ? 1 : 0;
  return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${radius} ${radius} 0 ${large} 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
}

export function buildDialGauge(svgEl, prefix, alarmDeg = ALARM_DEG) {
  if (!svgEl) return;
  const limDeg = Number.isFinite(alarmDeg) && alarmDeg > 0 && alarmDeg < MAX_DEG ? alarmDeg : ALARM_DEG;
  const warnDeg = +(limDeg * 0.65).toFixed(2);
  svgEl.setAttribute('viewBox', '0 0 340 212');
  svgEl.classList.add('crisp-dial-svg');
  svgEl.replaceChildren();

  const defs = el('defs');
  const bezelGrad = el('linearGradient', { id: `${prefix}Bezel`, x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
  bezelGrad.append(
    el('stop', { offset: '0%', 'stop-color': '#557990', 'stop-opacity': '0.9' }),
    el('stop', { offset: '50%', 'stop-color': '#274254', 'stop-opacity': '0.85' }),
    el('stop', { offset: '100%', 'stop-color': '#10202b', 'stop-opacity': '0.95' }),
  );
  const faceGrad = el('radialGradient', { id: `${prefix}Face`, cx: '50%', cy: '86%', r: '78%' });
  faceGrad.append(
    el('stop', { offset: '0%', 'stop-color': '#163143', 'stop-opacity': '0.95' }),
    el('stop', { offset: '68%', 'stop-color': '#0b1b26', 'stop-opacity': '0.98' }),
    el('stop', { offset: '100%', 'stop-color': '#061018', 'stop-opacity': '1' }),
  );
  const hubGrad = el('radialGradient', { id: `${prefix}Hub`, cx: '35%', cy: '30%', r: '70%' });
  hubGrad.append(
    el('stop', { offset: '0%', 'stop-color': '#e2f1f8' }),
    el('stop', { offset: '55%', 'stop-color': '#547387' }),
    el('stop', { offset: '100%', 'stop-color': '#172a36' }),
  );
  defs.append(bezelGrad, faceGrad, hubGrad);
  svgEl.append(defs);

  // Outer metallic semicircle bezel & recessed dark cockpit face
  const pOutL = polar(-90, R + 16), pOutR = polar(90, R + 16);
  svgEl.append(el('path', {
    d: `M ${pOutL.x.toFixed(1)} ${pOutL.y.toFixed(1)} A ${R + 16} ${R + 16} 0 0 1 ${pOutR.x.toFixed(1)} ${pOutR.y.toFixed(1)} L ${pOutR.x.toFixed(1)} ${CY + 6} L ${pOutL.x.toFixed(1)} ${CY + 6} Z`,
    fill: `url(#${prefix}Bezel)`,
    class: 'dial-bezel-outer',
  }));
  const pFaceL = polar(-90, R + 11), pFaceR = polar(90, R + 11);
  svgEl.append(el('path', {
    d: `M ${pFaceL.x.toFixed(1)} ${pFaceL.y.toFixed(1)} A ${R + 11} ${R + 11} 0 0 1 ${pFaceR.x.toFixed(1)} ${pFaceR.y.toFixed(1)} L ${pFaceR.x.toFixed(1)} ${CY + 3} L ${pFaceL.x.toFixed(1)} ${CY + 3} Z`,
    fill: `url(#${prefix}Face)`,
    class: 'dial-face-bg',
  }));

  // Inner concentric instrument ring
  svgEl.append(el('path', { d: arcPath(-90, 90, R - 28), class: 'dial-inner-ring' }));

  // Base recessed track
  svgEl.append(el('path', { d: arcPath(-90, 90, R), class: 'dial-track' }));

  // Static color-coded threshold bands on outer rim
  const alarmAng = (limDeg / MAX_DEG) * 90;
  const warnAng  = (warnDeg / MAX_DEG) * 90;
  svgEl.append(el('path', { d: arcPath(-90, -alarmAng, R), class: 'dial-zone-alarm' }));
  svgEl.append(el('path', { d: arcPath(alarmAng, 90, R), class: 'dial-zone-alarm' }));
  svgEl.append(el('path', { d: arcPath(-alarmAng, -warnAng, R), class: 'dial-zone-warn' }));
  svgEl.append(el('path', { d: arcPath(warnAng, alarmAng, R), class: 'dial-zone-warn' }));
  svgEl.append(el('path', { d: arcPath(-warnAng, warnAng, R), class: 'dial-zone-ok' }));

  // Dynamic glowing active sweep arc (0° -> current angle)
  svgEl.append(el('path', {
    id: `${prefix}Sweep`,
    d: '',
    class: 'dial-live-sweep',
  }));

  // ±threshold boundary rays
  for (const sign of [-1, 1]) {
    const pIn = polar(sign * alarmAng, R - 28);
    const pOut = polar(sign * alarmAng, R + 7);
    svgEl.append(el('line', {
      x1: pIn.x.toFixed(1), y1: pIn.y.toFixed(1),
      x2: pOut.x.toFixed(1), y2: pOut.y.toFixed(1),
      class: 'dial-limit-line',
    }));
  }

  // Crisp precision ticks (1° minor, 2° major, ±threshold limit) & tabular numeric labels
  const limRound = Math.round(limDeg);
  const labels = new Set([-12, -8, -limRound, 0, limRound, 8, 12]);
  for (let d = -MAX_DEG; d <= MAX_DEG; d += 1) {
    const a = (d / MAX_DEG) * 90;
    const isLimit = Math.abs(d) === limRound;
    const isMajor = d % 2 === 0;
    const rOut = R - 8;
    const rIn = isLimit ? R - 24 : isMajor ? R - 19 : R - 13;
    const p1 = polar(a, rIn), p2 = polar(a, rOut);
    svgEl.append(el('line', {
      x1: p1.x.toFixed(1), y1: p1.y.toFixed(1),
      x2: p2.x.toFixed(1), y2: p2.y.toFixed(1),
      class: isLimit ? 'dial-tick-limit' : isMajor ? 'dial-tick-major' : 'dial-tick-minor',
    }));

    if (labels.has(d)) {
      const lp = polar(a, R + 24);
      const txt = d > 0 ? `+${d}°` : d < 0 ? `−${Math.abs(d)}°` : '0°';
      svgEl.append(el('text', {
        x: lp.x.toFixed(1),
        y: (lp.y + 4).toFixed(1),
        'text-anchor': 'middle',
        class: isLimit ? 'dial-lbl-limit' : d === 0 ? 'dial-lbl-zero' : 'dial-lbl',
      }, txt));
    }
  }

  // Automotive tapered pointer needle + counterweight tail + brushed center hub
  const needleGroup = el('g', { id: `${prefix}Needle`, class: 'dial-needle', transform: `rotate(0 ${CX} ${CY})` });
  needleGroup.append(el('polygon', {
    points: `${CX - 3.6},${CY + 14} ${CX - 4.6},${CY} ${CX},${CY - (R - 11)} ${CX + 4.6},${CY} ${CX + 3.6},${CY + 14}`,
    class: 'dial-needle-blade',
  }));
  needleGroup.append(el('line', {
    x1: CX, y1: CY - (R - 16), x2: CX, y2: CY,
    class: 'dial-needle-highlight',
  }));
  needleGroup.append(el('circle', { cx: CX, cy: CY, r: 12, fill: `url(#${prefix}Hub)`, class: 'dial-hub-outer' }));
  needleGroup.append(el('circle', { cx: CX, cy: CY, r: 4.5, class: 'dial-hub-inner' }));
  svgEl.append(needleGroup);

  // Digital cockpit readout pill below hub
  svgEl.append(el('rect', {
    x: CX - 64, y: CY + 16, width: 128, height: 34, rx: 10,
    class: 'dial-readout-box',
  }));
  svgEl.append(el('text', {
    id: `${prefix}Readout`,
    x: CX,
    y: CY + 41,
    'text-anchor': 'middle',
    class: 'dial-readout',
  }, '—'));
}

export function setDialGauge(svgEl, prefix, delta, stateName) {
  if (!svgEl) return;
  const valid = typeof delta === 'number' && Number.isFinite(delta);
  svgEl.dataset.state = valid ? (stateName || 'normal') : 'offline';
  const needle = document.getElementById(`${prefix}Needle`);
  const sweep  = document.getElementById(`${prefix}Sweep`);
  const readout = document.getElementById(`${prefix}Readout`);

  if (!valid) {
    needle?.setAttribute('transform', `rotate(0 ${CX} ${CY})`);
    sweep?.setAttribute('d', '');
    if (readout) readout.textContent = '—';
    return;
  }
  const clamped = Math.max(-MAX_DEG, Math.min(MAX_DEG, delta));
  const rot = (clamped / MAX_DEG) * 90;
  needle?.setAttribute('transform', `rotate(${rot.toFixed(1)} ${CX} ${CY})`);
  sweep?.setAttribute('d', Math.abs(rot) > 0.6 ? arcPath(0, rot, R - 18) : '');
  if (readout) {
    const sign = delta > 0 ? '+' : '';
    readout.textContent = Math.abs(delta) > MAX_DEG ? `${sign}${delta.toFixed(1)}°` : `${sign}${delta.toFixed(1)}°`;
  }
}

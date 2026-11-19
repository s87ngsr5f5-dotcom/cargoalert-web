// CargoAlert v3.3 High-Clarity Automotive Semicircle Dial Gauge (-12° to +12°, ±4° Alarm Threshold)
// 100% vector SVG, crisp major/minor ticks, zero blur, instant needle response

const SVG_NS = 'http://www.w3.org/2000/svg';
const CX = 160, CY = 158, R = 114;
const MAX_DEG = 12; // Semicircle spans -12° to +12° -> 1° = 7.5° on dial (±4° = wide 60° green safe zone!)
const ALARM_DEG = 4;

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
  const s = polar(degStart, radius);
  const e = polar(degEnd, radius);
  const large = Math.abs(degEnd - degStart) > 180 ? 1 : 0;
  return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${radius} ${radius} 0 ${large} 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
}

export function buildDialGauge(svgEl, prefix) {
  if (!svgEl) return;
  svgEl.setAttribute('viewBox', '0 0 320 190');
  svgEl.classList.add('crisp-dial-svg');
  svgEl.replaceChildren();

  // Subtle dial plate background
  const pLeft = polar(-90, R + 12), pRight = polar(90, R + 12);
  svgEl.append(el('path', {
    d: `M ${pLeft.x.toFixed(1)} ${pLeft.y.toFixed(1)} A ${R + 12} ${R + 12} 0 0 1 ${pRight.x.toFixed(1)} ${pRight.y.toFixed(1)} L ${CX} ${CY} Z`,
    class: 'dial-plate',
  }));

  // Outer bezel track
  svgEl.append(el('path', { d: arcPath(-90, 90, R), class: 'dial-track' }));

  // Color zones: -12°..-4° Red, -4°..+4° Green (60° wide!), +4°..+12° Red
  const alarmAngle = (ALARM_DEG / MAX_DEG) * 90; // 30°
  const warnAngle = (2.5 / MAX_DEG) * 90;        // 18.75°
  svgEl.append(el('path', { d: arcPath(-90, -alarmAngle, R), class: 'dial-zone-alarm' }));
  svgEl.append(el('path', { d: arcPath(alarmAngle, 90, R), class: 'dial-zone-alarm' }));
  svgEl.append(el('path', { d: arcPath(-alarmAngle, -warnAngle, R), class: 'dial-zone-warn' }));
  svgEl.append(el('path', { d: arcPath(warnAngle, alarmAngle, R), class: 'dial-zone-warn' }));
  svgEl.append(el('path', { d: arcPath(-warnAngle, warnAngle, R), class: 'dial-zone-ok' }));

  // Threshold radial laser markers at -4° and +4°
  for (const sign of [-1, 1]) {
    const inner = polar(sign * alarmAngle, R - 20);
    const outer = polar(sign * alarmAngle, R + 9);
    svgEl.append(el('line', {
      x1: inner.x.toFixed(1), y1: inner.y.toFixed(1),
      x2: outer.x.toFixed(1), y2: outer.y.toFixed(1),
      class: 'dial-limit-line',
    }));
  }

  // Crisp major (every 2°) & minor (every 1°) tick marks + clear numeric labels
  const labels = new Set([-12, -8, -4, 0, 4, 8, 12]);
  for (let d = -MAX_DEG; d <= MAX_DEG; d += 1) {
    const a = (d / MAX_DEG) * 90;
    const isLimit = Math.abs(d) === ALARM_DEG;
    const isMajor = d % 2 === 0;
    const rOut = R - 8;
    const rIn = isLimit ? R - 24 : isMajor ? R - 20 : R - 14;
    const p1 = polar(a, rIn), p2 = polar(a, rOut);
    svgEl.append(el('line', {
      x1: p1.x.toFixed(1), y1: p1.y.toFixed(1),
      x2: p2.x.toFixed(1), y2: p2.y.toFixed(1),
      class: isLimit ? 'dial-tick-limit' : isMajor ? 'dial-tick-major' : 'dial-tick-minor',
    }));

    if (labels.has(d)) {
      const lp = polar(a, R + 21);
      const txt = d > 0 ? `+${d}°` : d < 0 ? `−${Math.abs(d)}°` : '0°';
      svgEl.append(el('text', {
        x: lp.x.toFixed(1),
        y: (lp.y + 4).toFixed(1),
        'text-anchor': 'middle',
        class: isLimit ? 'dial-lbl-limit' : d === 0 ? 'dial-lbl-zero' : 'dial-lbl',
      }, txt));
    }
  }

  // Tapered automotive needle
  const needleGroup = el('g', { id: `${prefix}Needle`, class: 'dial-needle', transform: `rotate(0 ${CX} ${CY})` });
  needleGroup.append(el('polygon', {
    points: `${CX - 4},${CY} ${CX},${CY - (R - 14)} ${CX + 4},${CY}`,
    class: 'dial-needle-blade',
  }));
  needleGroup.append(el('circle', { cx: CX, cy: CY, r: 10, class: 'dial-hub-outer' }));
  needleGroup.append(el('circle', { cx: CX, cy: CY, r: 4.5, class: 'dial-hub-inner' }));
  svgEl.append(needleGroup);

  // Crisp digital readout pill at bottom center
  svgEl.append(el('text', {
    id: `${prefix}Readout`,
    x: CX,
    y: CY + 27,
    'text-anchor': 'middle',
    class: 'dial-readout',
  }, '—'));
}

export function setDialGauge(svgEl, prefix, delta, stateName) {
  if (!svgEl) return;
  const valid = typeof delta === 'number' && Number.isFinite(delta);
  svgEl.dataset.state = valid ? (stateName || 'normal') : 'offline';
  const needle = document.getElementById(`${prefix}Needle`);
  const readout = document.getElementById(`${prefix}Readout`);

  if (!valid) {
    needle?.setAttribute('transform', `rotate(0 ${CX} ${CY})`);
    if (readout) readout.textContent = '—';
    return;
  }
  const clamped = Math.max(-MAX_DEG, Math.min(MAX_DEG, delta));
  const rot = (clamped / MAX_DEG) * 90;
  needle?.setAttribute('transform', `rotate(${rot.toFixed(1)} ${CX} ${CY})`);
  if (readout) {
    const sign = delta > 0 ? '+' : '';
    readout.textContent = Math.abs(delta) > MAX_DEG ? `${sign}${delta.toFixed(1)}° (滿表)` : `${sign}${delta.toFixed(1)}°`;
  }
}

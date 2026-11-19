import {test} from 'node:test';
import assert from 'node:assert/strict';

test('remote monitor upgrades: angle parsing, event filtering, threshold trend rendering, and device owner label', async () => {
 const previous = Object.fromEntries(['document','window','sessionStorage','fetch','setTimeout','clearTimeout','setInterval'].map(k=>[k,globalThis[k]]));
 const nodes = new Map(), store = new Map(), timers = new Map();
 let timerId = 0, tick;

 const node = id => {
  if (!nodes.has(id)) {
   nodes.set(id, {
    value: '', _textContent: '', dataset: {}, attributes: {}, disabled: false, hidden: false, listeners: {},
    children: [],
    get textContent() {
     return this._textContent + this.children.map(c => typeof c === 'string' ? c : (c?.textContent || '')).join('');
    },
    set textContent(v) {
     this._textContent = String(v ?? '');
     this.children = [];
    },
    addEventListener(k, f) { this.listeners[k] = f; },
    replaceChildren(...c) { this.children = c; this._textContent = ''; },
    append(...c) { this.children.push(...c); },
    setAttribute(k,v) { this.attributes[k] = String(v); },
    close() { this.open = false; }
   });
  }
  return nodes.get(id);
 };

 globalThis.document = {
  getElementById: node,
  createElement: tag => {
   const el = node(Symbol(tag));
   el.tagName = tag.toUpperCase();
   return el;
  },
  createElementNS: (_, tag) => {
   const el = node(Symbol(tag));
   el.tagName = tag.toUpperCase();
   return el;
  },
  createTextNode: text => ({ textContent: String(text ?? ''), children: [] }),
  visibilityState: 'visible',
  addEventListener() {}
 };
 globalThis.window = { addEventListener() {} };
 globalThis.sessionStorage = {
  getItem: k => store.get(k) || null,
  setItem: (k, v) => store.set(k, v),
  removeItem: k => store.delete(k)
 };
 globalThis.setTimeout = f => { timers.set(++timerId, f); return timerId; };
 globalThis.clearTimeout = id => timers.delete(id);
 globalThis.setInterval = f => {tick=f;return 0;};

 let fetchCount = { status: 0, events: 0, trend: 0, metrics: 0, commands: 0 };
 globalThis.fetch = async url => {
  const action = url.split('/').at(-1).split('?')[0];
  if (fetchCount[action] !== undefined) fetchCount[action]++;

  if (action === 'status') {
   return Response.json({
    name: 'CargoAlert-01',
    serverMs: 1730000005000,
    receivedMs: 1730000000000,
    stale: false,
    notificationOwner: 'device',
    snapshot: {
     bootId: 'a'.repeat(32),
     seq: 10,
     firmware: 'v2.3.0',
     valid: true,
     calibrated: true,
     delta: 64.5,
     state: 'alarm',
     networkMode: '4G',
     wan: { state:'connected',lastError:'none',sim:'ready',transport:'4G',registration:1,signalQuality:18,retries:2,uartResponding:true,simReady:true,hasIp:true },
     line: { phase:'accepted',http:200,attempts:1,transportError:0,tlsError:0,tlsFlags:0,socketError:0,configured:true,networkReady:true,clockReady:true,pending:false },
     remoteLineTest: 0,
     notificationOwner: 'device'
    },
    displayState: 'alarm'
   });
  }
  if (action === 'events') {
   return Response.json({
    notificationOwner: 'device',
    events: [
     {
      id: 'e1', seq: 1, type: 'alarm', received_ms: 1730000000000, uptime_ms: 50000,
      line_state: 'device_owned',
      payload: JSON.stringify({ sample: { valid: true, calibrated: true, delta: 64.5, state: 'alarm', fault: 0 } })
     },
     {
      id: 'e2', seq: 2, type: 'sensor_fault', received_ms: 1729999000000, uptime_ms: 40000,
      line_state: null,
      payload: JSON.stringify({ sample: { valid: false, calibrated: true, delta: null, state: 'sensor_error', fault: 2 } })
     },
     {
      id: 'e3', seq: 3, type: 'boot', received_ms: 1729998000000, uptime_ms: 1000,
      line_state: null,
      payload: JSON.stringify({ sample: { valid: true, calibrated: false, delta: null, state: 'uncalibrated', fault: 0 } })
     }
    ]
   });
  }
  if (action === 'trend') {
   return Response.json({
    points: [
     { receivedMs: 1730000000000, valid: true, calibrated: true, delta: 64.5, state: 'alarm', sampleAgeMs: 500 },
     { receivedMs: 1729999900000, valid: true, calibrated: true, delta: 46.2, state: 'warning', sampleAgeMs: 500 },
     { receivedMs: 1729999800000, valid: true, calibrated: true, delta: 12.0, state: 'normal', sampleAgeMs: 500 }
    ]
   });
  }
  if (action === 'metrics') return Response.json({ uniqueReports: 5, notification: [] });
  if (action === 'commands') return Response.json({ commands: [] });
  return Response.json({});
 };

 const settle = async () => { for (let i = 0; i < 25; i++) await new Promise(r => setImmediate(r)); };

 try {
  await import('../dist/remote.mjs?upgrade-test-run');
  node('remoteId').value = 'cargoalert-01';
  node('remoteKey').value = 'v'.repeat(43);
  node('remoteLogin').listeners.submit({ preventDefault() {} });
  await settle();

  // Item 5 verification: v2.3.0 device owner label and alarm state
  assert.equal(node('remoteState').textContent, '鬆脫警報');
  assert.equal(node('remoteAngle').textContent, '+64.5°');
  assert.match(node('remoteFirmware').textContent, /v2\.3\.0/);
  assert.match(node('remoteFirmware').textContent, /裝置直發 LINE/);
  assert.match(node('remoteDiagFreshness').textContent, /裝置最後回報/);
  assert.equal(node('remoteWanState').textContent, '4G 已取得 PPP IP');
  assert.match(node('remoteWanAdvice').textContent, /DNS、TLS 與 LINE API/);
  assert.equal(node('remoteLinePhase').textContent, 'LINE API 已接受');
  assert.equal(node('remoteLineHttp').textContent, 'HTTP 200');
  assert.equal(node('remoteLineTls').textContent, 'error=0 · certFlags=0x0');
  assert.equal(node('remoteLineTls').textContent, 'error=0 · certFlags=0x0');
  assert.equal(node('remoteAngleGauge').dataset.state, 'alarm');
  assert.equal(node('angleGaugeValue').textContent, '+64.5°');
  assert.equal(node('angleNeedle').attributes.transform, 'rotate(90.0 120 122)');

  // Item 3 verification: Alarm banner shown for active alarm
  assert.equal(node('remoteAlarmBanner').hidden, false);
  node('remoteAckAlarm').listeners.click();tick();assert.equal(node('remoteAlarmBanner').hidden,true);

  // Item 2 verification: Trend peak pill
  assert.match(node('trendPeak').textContent, /64\.5°/);
  assert.match(node('trendNote').textContent, /±6°/);
  assert.match(node('trendNote').textContent, /800 ms/);
  assert.doesNotMatch(node('trendNote').textContent, /±15°|±20°/);

  // Item 1 verification: History angle parsed from payload
  const tableRows = node('remoteEvents').children;
  assert.equal(tableRows.length, 3);
  assert.match(node('remoteEventCount').textContent, /3 \/ 3/);

  // First row has parsed angle
  const row1Cells = tableRows[0].children;
  assert.equal(row1Cells.length, 4);
  assert.match(row1Cells[1].textContent, /64\.5°/);
  assert.match(row1Cells[3].textContent, /由 ESP32 負責發送；結果未確認/);

  // Second row has sensor error
  assert.match(tableRows[1].children[1].textContent, /感測異常/);

  // Filter test: filter to 'alarm' only
  node('remoteEventFilter').value = 'alarm';
  node('remoteEventFilter').listeners.change();
  assert.equal(node('remoteEvents').children.length, 1);
  assert.match(node('remoteEventCount').textContent, /1 \/ 3/);

  // Item 4 verification: Smart Polling test (no new data -> does NOT re-fetch events/trend)
  const prevEventsFetchCount = fetchCount.events;
  const [timerId, timerFn] = [...timers].at(-1);
  timers.delete(timerId);
  timerFn();
  await settle();
  // status was called again
  assert.equal(fetchCount.status, 2);
  // events was NOT called again because seq and receivedMs didn't change!
  assert.equal(fetchCount.events, prevEventsFetchCount);

 } finally {
  for (const [k, v] of Object.entries(previous)) {
   if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
  }
 }
});

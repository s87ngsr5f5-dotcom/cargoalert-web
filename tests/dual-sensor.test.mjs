import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { api, hashToken } from '../backend/api.mjs';

function makeDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`
    CREATE TABLE sessions(device_id TEXT, boot_id TEXT, generation INTEGER PRIMARY KEY AUTOINCREMENT, created_ms INTEGER, UNIQUE(device_id,boot_id));
    CREATE TABLE devices(device_id TEXT PRIMARY KEY, active_gen INTEGER, boot_id TEXT, seq INTEGER DEFAULT -1, snapshot TEXT, received_ms INTEGER);
    CREATE TABLE reports(device_id TEXT, boot_id TEXT, seq INTEGER, received_ms INTEGER, payload TEXT, PRIMARY KEY(device_id,boot_id,seq));
    CREATE TABLE events(id TEXT PRIMARY KEY, device_id TEXT, boot_id TEXT, seq INTEGER, type TEXT, occurred_epoch_ms INTEGER, uptime_ms INTEGER, received_ms INTEGER, historical INTEGER, payload TEXT);
    CREATE TABLE outbox(event_id TEXT PRIMARY KEY, device_id TEXT, retry_key TEXT, state TEXT DEFAULT 'pending', http INTEGER, attempts INTEGER DEFAULT 0, next_ms INTEGER DEFAULT 0, lease_ms INTEGER DEFAULT 0, accepted_ms INTEGER, detail TEXT);
    CREATE TABLE remote_commands(id TEXT PRIMARY KEY, device_id TEXT, boot_id TEXT, session_gen INTEGER, requested_ms INTEGER, expires_ms INTEGER, state TEXT DEFAULT 'queued', event_id TEXT);
  `);
  return {
    close: () => raw.close(),
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() { return raw.prepare(sql).run(...args); },
            async first() { return raw.prepare(sql).get(...args) ?? null; },
            async all() { return { results: raw.prepare(sql).all(...args) }; },
          };
        },
      };
    },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
  };
}

test('dual-sensor reports, status, events, and CSV preserve Sensor #1 and #2 identity', async t => {
  const DB = makeDb();
  t.after(() => DB.close());
  const w = 'w'.repeat(40), r = 'r'.repeat(40), boot = 'a'.repeat(32);
  const env = {
    DB,
    CARGO_DEVICES_JSON: JSON.stringify([{
      id: 'cargoalert-01',
      name: '雙感知器測試車',
      notificationOwner: 'device',
      uploadHash: await hashToken(w),
      viewHash: await hashToken(r),
    }]),
  };
  const req = (act, body, tok) => api(new Request('https://x.test/api/v1/devices/cargoalert-01/' + act, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, {}, { now: () => 1760000000000 });

  const sessRes = await req('session', { bootId: boot, firmware: '3.0.0-dual-as5600', notificationOwner: 'device', sensorCount: 2 }, w);
  assert.equal(sessRes.status, 200);
  const sess = await sessRes.json();

  const s1 = { sensorId: 1, sensorName: '一號感知器', uptimeMs: 5000, valid: true, calibrated: true, state: 'normal', fault: 0, delta: 0.4, angle: 120.4, baseline: 120.0, confirmRemainingMs: 0 };
  const s2 = { sensorId: 2, sensorName: '二號感知器', uptimeMs: 5000, valid: true, calibrated: true, state: 'alarm', fault: 0, delta: -7.8, angle: 42.2, baseline: 50.0, confirmRemainingMs: 0 };
  const repRes = await req('reports', {
    v: 1, sensorCount: 2, deviceId: 'cargoalert-01', firmware: '3.0.0-dual-as5600', bootId: boot,
    sessionGeneration: sess.generation, seq: 1, sentUptimeMs: 5100, networkMode: '4G', remoteLineTest: 0,
    notificationOwner: 'device', simulation: false, sample: s2, sensors: [s1, s2],
    events: [{ bootId: boot, seq: 1, sensorId: 2, sensorName: '二號感知器', type: 'alarm', uptimeMs: 5050, epochMs: null, sample: s2 }],
  }, w);
  assert.equal(repRes.status, 200);

  const st = await (await req('status', undefined, r)).json();
  assert.equal(st.snapshot.sensorCount, 2);
  assert.equal(st.snapshot.sensors.length, 2);
  assert.equal(st.snapshot.sensors[0].sensorId, 1);
  assert.equal(st.snapshot.sensors[0].state, 'normal');
  assert.equal(st.snapshot.sensors[1].sensorId, 2);
  assert.equal(st.snapshot.sensors[1].state, 'alarm');
  assert.equal(st.snapshot.sensors[1].delta, -7.8);

  const ev = await (await req('events', undefined, r)).json();
  assert.equal(ev.events.length, 1);
  const evPayload = JSON.parse(ev.events[0].payload);
  assert.equal(evPayload.sensorId, 2);
  assert.equal(evPayload.sensorName, '二號感知器');

  const csv = await (await req('events.csv', undefined, r)).text();
  assert.ok(csv.includes('"sensor_id"'));
  assert.ok(csv.includes('"sensor_name"'));
  assert.ok(csv.includes('"二號感知器"'));

  // Test end-to-end cloud remote recalibrate command flow
  const cmdId = '11111111-2222-4333-8444-555555555555';
  const recalRes = await req('recalibrate', { requestId: cmdId, target: 'all' }, r);
  assert.equal(recalRes.status, 200);
  const rep2Res = await req('reports', {
    v: 1, sensorCount: 2, deviceId: 'cargoalert-01', firmware: '3.0.2-dual-alarm4-webcal', bootId: boot,
    sessionGeneration: sess.generation, seq: 2, sentUptimeMs: 7000, networkMode: '4G', remoteLineTest: 0,
    notificationOwner: 'device', simulation: false, sample: s1, sensors: [s1, s2], events: [],
  }, w);
  assert.equal(rep2Res.status, 200);
  const rep2 = await rep2Res.json();
  assert.equal(rep2.command?.id, cmdId);
  assert.equal(rep2.command?.type, 'recalibrate');
  assert.equal(rep2.command?.target, 'all');

  const ackRes = await req('command-ack', {
    id: cmdId, bootId: boot, sessionGeneration: sess.generation, uptimeMs: 7100, networkMode: '4G', result: 'OK',
  }, w);
  assert.equal(ackRes.status, 200);
  const cmds = await (await req('commands', undefined, r)).json();
  assert.equal(cmds.commands[0].state, 'executed');
  assert.equal(cmds.commands[0].type, 'recalibrate');
  assert.equal(cmds.commands[0].result, 'OK');
});

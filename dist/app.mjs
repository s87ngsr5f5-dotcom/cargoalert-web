import {connectionHelp} from './compatibility.mjs';
import {UUID,STATES,FAULTS,parseStatus,parseReply,isFresh,pruneEvents} from './protocol.mjs';
import {createAlerts} from './alerts.mjs';
import {EVENT_TYPES,eventType,normalizeEvents,eventsCSV} from './experience.mjs';
import {createCargoModel,initThemeToggle} from './cargo-model.mjs';

initThemeToggle('themeToggle');
const $=id=>document.getElementById(id), decoder=new TextDecoder(), encoder=new TextEncoder();
let device=null, statusChar=null, sensor1Char=null, sensor2Char=null, commandChar=null, replyChar=null;
let connected=false, busy=false, control=false, dualSupported=false, demoMode=false;
let statusCombined=null, sensors=[null,null], lastAt=[0,0], lastCombined=0;
let pending=null, session=0, suspended=false, wasStale=false, storageOK=true, events=[];
let lastKeys=['',''], nextCommandId=1, attempted=false;
const key='cargoalert.events.v1';
try { const stored=JSON.parse(localStorage.getItem(key)||'[]'); events=normalizeEvents(stored,Date.now()); }
catch { storageOK=false; }

const cargoModel = createCargoModel({
  containerId: 'cargoModelSection',
  onChange() {
    syncLocationBadges();
    update();
  },
  onSelectSensor(id) {
    $('bleCard1')?.classList.toggle('is-highlighted', id === 1);
    $('bleCard2')?.classList.toggle('is-highlighted', id === 2);
  },
});

function syncLocationBadges() {
  const b1 = $('bleLoc1'), b2 = $('bleLoc2');
  if (b1) b1.textContent = cargoModel.formatLocation(1);
  if (b2) b2.textContent = cargoModel.formatLocation(2);
}
syncLocationBadges();

function message(text, error=false){ $('message').textContent=text; $('message').classList.toggle('error',error); }
function calFeedback(text, error=false){ $('calFeedback').textContent=text; $('calFeedback').classList.toggle('error',error); }

function renderEvents(){
  $('events').replaceChildren();
  const filtered=filteredEvents();
  $('clearEvents').disabled=!events.length;
  $('exportEvents').disabled=!filtered.length;
  $('eventCount').textContent=`顯示 ${filtered.length} / ${events.length} 筆`;
  if(!filtered.length){
    const li=document.createElement('li'); li.className='empty-events';
    li.textContent=events.length?'此分類尚無事件，請切換其他分類。':'尚無事件。連線、狀態變化或重設基準時會產生紀錄。';
    $('events').append(li);
  }
  for(const e of filtered){
    const li=document.createElement('li'), time=document.createElement('time'), text=document.createElement('span'), type=document.createElement('span'), meta=document.createElement('small');
    time.textContent=new Date(e.at).toLocaleString('zh-TW',{hour12:false});
    time.dateTime=new Date(e.at).toISOString();
    text.textContent=e.text;
    type.className='event-type'; type.textContent=EVENT_TYPES[e.type]||e.type;
    meta.textContent=[e.state?`狀態：${STATES[e.state]||e.state}`:'',e.angle!==null?`角度：${e.angle>=0?'+':''}${e.angle.toFixed(1)}°`:''].filter(Boolean).join(' · ');
    li.append(type,time,text);
    if(meta.textContent) li.append(meta);
    $('events').append(li);
  }
}
function filteredEvents(){ const t=$('eventFilter').value; return t==='all'?events:events.filter(e=>e.type===t); }
function record(text, type=eventType(text), sample=null){
  const s = sample || statusCombined;
  events=normalizeEvents([{at:Date.now(),text,type,angle:s&&s.fault===0?s.angle:null,state:s?s.state:null},...events],Date.now());
  try{localStorage.setItem(key,JSON.stringify(events));}catch{storageOK=false;}
  renderEvents();
}
const alerts=createAlerts(record);

function bleToModelSample(id, s, fresh){
  if(!fresh || !s) return { sensorId: id, valid: false, calibrated: false, state: 'offline', delta: null, fault: 0 };
  const map = { N: 'normal', W: 'warning', T: 'confirming', A: 'alarm', E: 'sensor_error', U: 'uncalibrated' };
  return {
    sensorId: id,
    valid: s.fault === 0,
    calibrated: s.calibrated,
    state: s.fault ? 'sensor_error' : (map[s.state] || 'normal'),
    delta: s.angle,
    fault: s.fault,
  };
}

function renderBleSensor(idx, s, fresh){
  const n = idx + 1;
  const card = $(`bleCard${n}`), pill = $(`bleState${n}`), angleEl = $(`bleAngle${n}`);
  const svg = $(`bleGauge${n}`), needle = $(`bleNeedle${n}`), valEl = $(`bleGaugeVal${n}`), subEl = $(`bleStatusText${n}`);
  const riskFill = $(`bleRiskFill${n}`), riskText = $(`bleRiskText${n}`);
  if(!svg) return;

  const setRisk = (deg, active) => {
    if(!riskFill || !riskText) return;
    if(!active || deg === null){ riskFill.setAttribute('width', '0'); riskFill.dataset.level = 'ok'; riskText.textContent = '—'; return; }
    const mag = Math.abs(deg), pct = Math.min(100, (mag / 4) * 100);
    riskFill.setAttribute('width', pct.toFixed(1));
    riskFill.dataset.level = mag >= 4 ? 'alarm' : mag >= 2.5 ? 'warn' : 'ok';
    riskText.textContent = mag >= 4 ? `已超標 (${mag.toFixed(1)}° / 4.0°)` : `安全餘裕 ${(4 - mag).toFixed(1)}°`;
  };

  if(!connected && !demoMode){
    card.dataset.state='offline'; pill.dataset.state='offline'; pill.textContent='尚未連接';
    angleEl.textContent='—'; svg.dataset.state='offline'; needle.setAttribute('transform','rotate(0 120 122)');
    valEl.textContent='—'; subEl.textContent=`等待藍牙連線（${n===1?'GPIO21/22':'GPIO25/26'}）`;
    setRisk(null, false);
    return;
  }
  if(!s){
    card.dataset.state='offline'; pill.dataset.state='offline'; pill.textContent=dualSupported?'讀取中…':'舊版單感測韌體';
    angleEl.textContent='—'; svg.dataset.state='offline'; needle.setAttribute('transform','rotate(0 120 122)');
    valEl.textContent='—'; subEl.textContent=dualSupported?'等待封包…':'請燒錄 v3.0 雙感知器韌體以讀取二號';
    setRisk(null, false);
    return;
  }
  const stMap = { N:'normal', W:'warning', T:'confirming', A:'alarm', E:'sensor_error', U:'uncalibrated' };
  const st = !fresh ? 'stale' : s.fault ? 'sensor_error' : !s.calibrated ? 'uncalibrated' : (stMap[s.state] || 'normal');
  const label = !fresh ? '資料過期' : s.fault ? '感測異常' : !s.calibrated ? '尚未校正' : (STATES[s.state] || s.state);
  const validAngle = fresh && s.fault === 0 && s.calibrated && s.angle !== null;
  const angleText = validAngle ? `${s.angle >= 0 ? '+' : ''}${s.angle.toFixed(1)}°` : '—';

  card.dataset.state = st;
  pill.dataset.state = st;
  pill.textContent = label;
  angleEl.textContent = angleText;
  svg.dataset.state = validAngle ? st : 'offline';
  valEl.textContent = angleText;
  setRisk(s.angle, validAngle);

  if(!validAngle){
    needle.setAttribute('transform','rotate(0 120 122)');
    subEl.textContent = !fresh ? '資料逾時，暫停顯示' : s.fault ? `${FAULTS[s.fault]||'感測異常'}（原基準保留）` : '尚未設定基準，拉緊後按下方「重設基準值」';
    return;
  }
  const bounded = Math.max(-30, Math.min(30, s.angle));
  needle.setAttribute('transform', `rotate(${(bounded*3).toFixed(1)} 120 122)`);
  subEl.textContent = st==='alarm' ? '⚠️ 已達 4° 鬆脫警報！請檢查束帶' : st==='confirming' ? '達到 4° 門檻，持續確認 800 ms 中' : '狀態正常（< 4°）';
}

function update(){
  const now = Date.now();
  const isLive = connected || demoMode;
  const fresh1 = demoMode ? !!sensors[0] : (connected && !suspended && !!sensors[0] && isFresh(lastAt[0], now));
  const fresh2 = demoMode ? !!sensors[1] : (connected && !suspended && !!sensors[1] && isFresh(lastAt[1], now));
  const anyFresh = fresh1 || fresh2 || (connected && !suspended && !!statusCombined && isFresh(lastCombined, now));
  const lastAny = Math.max(lastAt[0], lastAt[1], lastCombined);

  $('connectionText').textContent = demoMode ? '展示模擬模式運作中' : busy ? '正在連接…' : connected ? (dualSupported ? '已連接（雙感知器模式）' : '已連接（單感知器相容）') : '尚未連接';
  $('connect').disabled = demoMode || busy || connected || !navigator.bluetooth || !isSecureContext;
  $('connect').textContent = busy ? '正在連接…' : attempted && !connected ? '重新連接' : '連接裝置';
  $('connection').dataset.connected = String(isLive);
  $('disconnect').disabled = !connected && !busy;

  renderBleSensor(0, sensors[0], fresh1);
  renderBleSensor(1, sensors[1], fresh2);

  cargoModel.updateSensors([
    bleToModelSample(1, sensors[0], fresh1),
    bleToModelSample(2, sensors[1], fresh2),
  ], !anyFresh);

  const s1 = sensors[0], s2 = sensors[1];
  const alarms = [];
  if(fresh1 && s1 && s1.fault===0 && s1.calibrated && s1.state==='A') alarms.push(`一號感知器（${cargoModel.formatLocation(1)}）${s1.angle>=0?'+':''}${s1.angle.toFixed(1)}°`);
  if(fresh2 && s2 && s2.fault===0 && s2.calibrated && s2.state==='A') alarms.push(`二號感知器（${cargoModel.formatLocation(2)}）${s2.angle>=0?'+':''}${s2.angle.toFixed(1)}°`);

  let overallCode = 'offline', overallText = '尚未連接', detailText = '按上方「連接裝置」選擇 CargoAlert，或點「🎮 展示模擬」立即體驗雙感知器與貨車模型。';
  if(isLive){
    if(!anyFresh){ overallCode='E'; overallText='資料過期'; detailText='超過 3.5 秒未收到新封包，請確認裝置電源。'; }
    else if(alarms.length){ overallCode='A'; overallText='鬆脫警報！'; detailText=`請立即檢查：${alarms.join('、')}`; }
    else if((fresh1 && s1?.fault) || (fresh2 && s2?.fault)){
      const bad = [];
      if(fresh1 && s1?.fault) bad.push(`一號：${FAULTS[s1.fault]}`);
      if(fresh2 && s2?.fault) bad.push(`二號：${FAULTS[s2.fault]}`);
      overallCode='E'; overallText='部分感測異常'; detailText=bad.join('；')+'（正常側仍持續監測）';
    } else if((fresh1 && s1?.state==='T') || (fresh2 && s2?.state==='T')){
      overallCode='T'; overallText='超標確認中'; detailText='偵測到角度 ≥ 4°，正在確認 800 ms 持續時間。';
    } else if((fresh1 && !s1?.calibrated) || (fresh2 && !s2?.calibrated)){
      overallCode='U'; overallText='尚未校正'; detailText='請拉緊兩條束帶，勾選下方確認並按「重設基準值」。';
    } else {
      overallCode='N'; overallText='一號與二號皆正常'; detailText=demoMode?'模擬運作中：拖曳上方滑桿或貨車模型節點即可體驗即時聯動。':'雙感知器持續監測中（4° 含邊界警報門檻）。';
    }
  }
  $('state').dataset.state = overallCode;
  $('state').textContent = overallText;
  $('stateDetail').textContent = detailText;
  $('liveBadge').textContent = demoMode ? '模擬展示中' : anyFresh ? '雙感知器即時更新' : connected ? '等待資料' : '未連線';

  const calDesc = [];
  if(s1) calDesc.push(`一號：${s1.calibrated?'已設定':'未設定'}`);
  if(s2) calDesc.push(`二號：${s2.calibrated?'已設定':'未設定'}`);
  $('baseline').textContent = calDesc.length ? calDesc.join(' ／ ') : '未知';
  $('updated').textContent = lastAny ? new Date(lastAny).toLocaleTimeString('zh-TW',{hour12:false}) + (anyFresh?'':'（非即時）') : '尚無資料';

  const bothFault = isLive && (!s1 || s1.fault!==0) && (!s2 || s2.fault!==0);
  let reason = '';
  if(!isLive) reason = '尚未連線，請先按上方「連接裝置」或開啟「🎮 展示模擬」。';
  else if(!demoMode && !control) reason = '此裝置不支援網站校正指令。';
  else if(pending) reason = '等待 ESP32 回覆校正結果…';
  else if(!anyFresh) reason = '等待即時感測資料…';
  else if(bothFault) reason = '一號與二號目前皆為感測異常（如未偵測到磁鐵），請先擺好磁鐵再重設基準。';
  else if(!$('tight').checked) reason = '請先勾選「已確認一號與二號束帶皆拉緊」。';

  $('calibrate').disabled = !!reason;
  $('calibrate').textContent = pending ? '等待裝置校正結果…' : '重設基準值（一號與二號）';
  $('controlNote').textContent = reason || '已就緒，按下「重設基準值」即可直接更新一號與二號基準並存入 NVS。';
  $('controlNote').dataset.tone = reason ? '' : 'ok';

  if(connected && lastAny > 0 && !anyFresh && !wasStale){ alerts.unavailable(); record('感測資料過期：暫停顯示即時狀態。'); wasStale=true; }
  if(anyFresh) wasStale=false;
}

function acceptSensor(idx, value){
  try {
    const parsed = parseStatus(decoder.decode(value));
    sensors[idx] = parsed;
    lastAt[idx] = Date.now();
    suspended = false;
    const sk = `${parsed.state}:${parsed.fault}:${parsed.calibrated}`;
    if(sk !== lastKeys[idx]){
      const name = idx===0 ? `一號感知器（${cargoModel.formatLocation(1)}）` : `二號感知器（${cargoModel.formatLocation(2)}）`;
      record(`[${name}] ${parsed.fault ? '感測異常 · ' + FAULTS[parsed.fault] : STATES[parsed.state]}`, undefined, parsed);
      lastKeys[idx] = sk;
    }
    if(connected && parsed.state === 'A' && parsed.fault === 0) alerts.observe(parsed);
    update();
  } catch(e){
    message(e.message, true);
  }
}

function acceptCombined(value){
  try {
    const parsed = parseStatus(decoder.decode(value));
    statusCombined = parsed;
    lastCombined = Date.now();
    if(!dualSupported){
      sensors[0] = parsed;
      lastAt[0] = lastCombined;
    }
    if(connected) alerts.observe(parsed);
    update();
  } catch(e){
    message(e.message, true);
  }
}

function acceptReply(value){
  const reply = parseReply(decoder.decode(value));
  if(reply && pending && reply.id === pending.id && pending.session === session){
    clearTimeout(pending.timer);
    pending.resolve(reply.result);
  }
}

function cleanup(reason){
  alerts.reset();
  session++; connected=false; busy=false; control=false; dualSupported=false;
  sensors=[null,null]; statusCombined=null; lastAt=[0,0]; lastCombined=0; lastKeys=['',''];
  if(pending){
    clearTimeout(pending.timer);
    pending.reject(new Error('連線已中斷；校正結果未知。'));
    pending=null;
    calFeedback('連線已中斷，校正結果未知。', true);
  }
  statusChar=sensor1Char=sensor2Char=commandChar=replyChar=null;
  $('tight').checked=false;
  update(); message(reason);
}

async function connect(){
  if(busy||connected) return;
  alerts.reset(); attempted=true; busy=true; sensors=[null,null]; statusCombined=null; lastAt=[0,0]; lastCombined=0; lastKeys=['',''];
  $('calFeedback').textContent=''; update();
  message('請在藍牙選單選擇 CargoAlert。');
  const token = ++session;
  try {
    const chosen = await navigator.bluetooth.requestDevice({filters:[{services:[UUID.service]}]});
    if(token!==session) return;
    device = chosen;
    device.addEventListener('gattserverdisconnected',()=>{
      if(device===chosen && token===session){
        record('藍牙連線中斷。');
        cleanup('裝置已斷線；感測、蜂鳴器與 4G LINE 仍由 ESP32 獨立運作。');
      }
    },{once:true});
    const server = await device.gatt.connect();
    if(token!==session){ server.disconnect(); return; }
    const service = await server.getPrimaryService(UUID.service);
    const chars = await service.getCharacteristics();
    const byId = id => chars.find(c => c.uuid.toLowerCase() === id);

    statusChar = byId(UUID.status);
    sensor1Char = byId(UUID.sensor1);
    sensor2Char = byId(UUID.sensor2);
    commandChar = byId(UUID.command);
    replyChar = byId(UUID.reply);
    dualSupported = !!(sensor1Char && sensor2Char);
    control = !!(commandChar && replyChar);

    if(statusChar){
      statusChar.addEventListener('characteristicvaluechanged', e => { if(token===session) acceptCombined(e.target.value); });
      await statusChar.startNotifications();
      const init = await statusChar.readValue();
      if(init.byteLength) acceptCombined(init);
    }
    if(sensor1Char){
      sensor1Char.addEventListener('characteristicvaluechanged', e => { if(token===session) acceptSensor(0, e.target.value); });
      await sensor1Char.startNotifications();
      const v1 = await sensor1Char.readValue();
      if(v1.byteLength) acceptSensor(0, v1);
    }
    if(sensor2Char){
      sensor2Char.addEventListener('characteristicvaluechanged', e => { if(token===session) acceptSensor(1, e.target.value); });
      await sensor2Char.startNotifications();
      const v2 = await sensor2Char.readValue();
      if(v2.byteLength) acceptSensor(1, v2);
    }
    if(control){
      replyChar.addEventListener('characteristicvaluechanged', e => { if(token===session) acceptReply(e.target.value); });
      await replyChar.startNotifications();
    }
    if(token!==session){ server.disconnect(); return; }
    connected = true; busy = false; nextCommandId = 1 + Math.floor(Math.random()*9999);
    $('deviceName').textContent = device.name || 'CargoAlert';
    record(`已連接 ${device.name||'CargoAlert'}（${dualSupported?'雙感知器':'單感知器'}）。`, 'connection');
    message('');
    update();
  } catch(e){
    if(token!==session) return;
    const cancelled = e.name === 'NotFoundError';
    const text = cancelled ? '已取消選擇裝置，可再次按「重新連接」。' : '連線失敗：' + e.message;
    cleanup(text); device?.gatt?.disconnect();
    record(cancelled?'取消選擇裝置。':'連線失敗。', 'connection');
    message(text, !cancelled);
  }
}

async function calibrate(){
  if($('calibrate').disabled) return;
  if(demoMode){
    $('bleDemoS1').value = '0'; $('bleDemoS2').value = '0';
    $('tight').checked = false;
    applyBleDemo();
    record('展示模擬：已將一號與二號基準值重設為 0.0°。', 'calibration');
    calFeedback('✅ 模擬重設基準完成：一號與二號已歸零為 0.0°！');
    return;
  }
  const id = nextCommandId, token = session;
  nextCommandId = nextCommandId % 9999 + 1;
  let resolve, reject;
  const answer = new Promise((r,j)=>{ resolve=r; reject=j; });
  answer.catch(()=>{});
  pending = { id, session: token, resolve, reject, timer: null };
  pending.timer = setTimeout(async()=>{
    if(!pending || pending.id!==id || token!==session) return;
    try { acceptReply(await replyChar.readValue()); } catch {}
    if(pending && pending.id===id) reject(new Error('未確認校正結果，請查看裝置讀值。'));
  }, 8000);
  update();
  calFeedback('正在送出重設基準指令給 ESP32…');
  try {
    const bytes = encoder.encode(`CAL,${id}`);
    const write = commandChar.writeValueWithResponse ? commandChar.writeValueWithResponse(bytes) : commandChar.writeValue(bytes);
    await Promise.race([write, answer]);
    const result = await answer;
    if(token!==session) return;
    if(result === 'OK'){
      $('tight').checked = false;
      record('網站重設基準完成：一號與二號皆已更新並存入 NVS。', 'calibration');
      calFeedback('✅ 重設基準完成：ESP32 已更新一號與二號基準並存入 NVS！');
    } else if(/^S([12])E([1-5])$/.test(result)){
      const [,sn,fc] = /^S([12])E([1-5])$/.exec(result);
      const msg = `部分重設失敗：${sn==='1'?'一號感知器':'二號感知器'}發生「${FAULTS[Number(fc)]||result}」（正常側已更新，異常側保留原基準）。`;
      record(msg, 'calibration');
      calFeedback('⚠️ ' + msg, true);
    } else if(result === 'LOCKED'){
      calFeedback('⚠️ 裝置韌體為舊版鎖定模式，請先長按 GPIO27 或燒錄最新 v3.0.2 韌體。', true);
    } else {
      calFeedback('❌ 重設失敗：' + result, true);
    }
  } catch(e){
    if(token===session){ calFeedback('❌ ' + e.message, true); record('重設基準結果未知：' + e.message, 'calibration'); }
  } finally {
    if(pending?.id===id){ clearTimeout(pending.timer); pending=null; }
    update();
  }
}

function applyBleDemo(){
  const a1 = Number($('bleDemoS1').value), a2 = Number($('bleDemoS2').value);
  $('bleDemoV1').textContent = `${a1>=0?'+':''}${a1.toFixed(1)}°`;
  $('bleDemoV2').textContent = `${a2>=0?'+':''}${a2.toFixed(1)}°`;
  const mk = a => ({ state: Math.abs(a) >= 4 ? 'A' : 'N', angle: a, fault: 0, calibrated: true });
  sensors = [mk(a1), mk(a2)];
  statusCombined = Math.abs(a2) > Math.abs(a1) ? sensors[1] : sensors[0];
  lastAt = [Date.now(), Date.now()]; lastCombined = Date.now();
  alerts.observe(statusCombined);
  update();
}
$('bleDemoToggle')?.addEventListener('click', ()=>{
  demoMode = !demoMode;
  $('bleDemoToggle').setAttribute('aria-pressed', String(demoMode));
  $('bleDemoToggle').textContent = demoMode ? '⏹ 結束模擬' : '🎮 展示模擬';
  $('bleDemoPanel').hidden = !demoMode;
  if(demoMode){
    if(connected){ const c=device; cleanup('已切換為展示模擬模式。'); c?.gatt?.disconnect(); }
    dualSupported = true; applyBleDemo();
    message('已開啟展示模擬模式：拖曳角度滑桿或貨車模型節點即可體驗 4° 警報與重設基準值。');
  } else {
    alerts.reset(); sensors=[null,null]; statusCombined=null; lastAt=[0,0]; lastCombined=0;
    message('已關閉展示模擬模式。按「連接裝置」即可連線實體 ESP32。');
    update();
  }
});
$('bleDemoS1')?.addEventListener('input', ()=> demoMode && applyBleDemo());
$('bleDemoS2')?.addEventListener('input', ()=> demoMode && applyBleDemo());
document.querySelectorAll('[data-bledemo]').forEach(btn => {
  btn.addEventListener('click', ()=>{
    if(!demoMode) return;
    const m = btn.dataset.bledemo;
    if(m==='normal'){ $('bleDemoS1').value='0.4'; $('bleDemoS2').value='-0.3'; }
    else if(m==='alarm1'){ $('bleDemoS1').value='5.8'; $('bleDemoS2').value='-0.3'; }
    else if(m==='alarm2'){ $('bleDemoS1').value='0.4'; $('bleDemoS2').value='-6.4'; }
    else if(m==='both'){ $('bleDemoS1').value='5.8'; $('bleDemoS2').value='-6.4'; }
    applyBleDemo();
  });
});

$('connect').addEventListener('click', connect);
$('disconnect').addEventListener('click', ()=>{ const c=device; cleanup('已中斷連線。'); c?.gatt?.disconnect(); record('使用者中斷藍牙。','connection'); });
$('calibrate').addEventListener('click', calibrate);
$('tight').addEventListener('change', update);
$('eventFilter').addEventListener('change', renderEvents);
$('exportEvents').addEventListener('click', ()=>{
  const list=filteredEvents(); if(!list.length) return;
  const url=URL.createObjectURL(new Blob([eventsCSV(list)],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a'); a.href=url; a.download=`CargoAlert-events-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('eventFeedback').textContent=`已匯出 ${list.length} 筆紀錄。`;
});
function clearEvents(){ events=[]; try{localStorage.removeItem(key);}catch{} renderEvents(); $('eventFeedback').textContent='已清除全部事件紀錄。'; }
$('clearEvents').addEventListener('click', ()=>{ if(!events.length) return; if(typeof $('clearDialog').showModal==='function') $('clearDialog').showModal(); else if(confirm('清除全部事件紀錄？')) clearEvents(); });
$('confirmClear').addEventListener('click', ()=>{ clearEvents(); $('clearDialog').close(); });
$('cancelClear').addEventListener('click', ()=>$('clearDialog').close());
document.addEventListener('visibilitychange', ()=>{ if(document.hidden){ alerts.unavailable(); suspended=true; update(); } else { suspended=false; update(); } });

const help = connectionHelp({secure:isSecureContext,bluetooth:!!navigator.bluetooth,userAgent:navigator.userAgent,platform:navigator.platform,touchPoints:navigator.maxTouchPoints});
$('compatibility').textContent = help.text;
$('iphoneHelp').hidden = !help.iphoneHelp;
$('copySiteAddress')?.addEventListener('click', async()=>{
  try{ await navigator.clipboard.writeText($('siteAddress').value); $('copyAddressResult').textContent='網址已複製。'; }
  catch{ $('copyAddressResult').textContent='請手動複製上方網址。'; }
});
renderEvents(); update();
setInterval(()=>{
  const trimmed=pruneEvents(events,Date.now());
  if(trimmed.length!==events.length){ events=trimmed; try{localStorage.setItem(key,JSON.stringify(events));}catch{} renderEvents(); }
  update();
}, 500);

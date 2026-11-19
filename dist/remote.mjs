import {createRemoteLineControl} from './remote-control.mjs';
import {createCargoModel,initThemeToggle} from './cargo-model.mjs';
import {buildDialGauge,setDialGauge} from './dial-gauge.mjs';

initThemeToggle('themeToggle');
buildDialGauge(document.getElementById('remoteAngleGauge1'), 'remoteDial1');
buildDialGauge(document.getElementById('remoteAngleGauge2'), 'remoteDial2');

const $=id=>document.getElementById(id),
LABELS={stale:'資料過期／暫時失聯',uncalibrated:'未校正',normal:'正常',warning:'注意',confirming:'注意（超標確認中）',alarm:'鬆脫警報',sensor_error:'感測異常',offline:'尚未載入'},
TYPES={boot:'重新開機',calibration:'校正完成',baseline_cleared:'清除基準',sensor_fault:'感測故障',sensor_recovered:'感測恢復',alarm:'鬆脫警報',state_change:'狀態變化',test_notification:'通知測試'},
LINE={pending:'等待後端處理',sending:'後端傳送中',accepted:'LINE API 已接受；手機收訊未知',retry:'等待重試',failed:'API 處理失敗',expired:'舊事件超過通知期限',not_configured:'後端 LINE 設定未完成',simulation_skipped:'模擬裝置：不發 LINE',device_owned:'由 ESP32 直接推播 LINE（雲端僅留紀錄）'};
const ALARM_THRESHOLD_DEG=4;
const WAN_LABELS={idle:'尚未啟動',wifi_connecting:'Wi-Fi 連線中',uart_unconfirmed:'電氣／UART 尚未確認',configuration_error:'連線設定有誤',modem_initializing:'A7670C 初始化中',sim_checking:'檢查 SIM 中',sim_pin_required:'SIM 需要 PIN',sim_puk_required:'SIM 需要 PUK',sim_missing:'未偵測到 SIM',modem_checking:'確認模組型號中',modem_mismatch:'模組型號不符',network_registering:'等待電信網路註冊',not_registered:'尚未註冊行動網路',waiting_ip:'已進入數據模式，等待 PPP IP',connected:'4G 已取得 PPP IP',wifi_fallback:'目前使用 Wi-Fi 備援',retry_wait:'連線失敗，等待重試'};
const WAN_ERRORS={uart_unconfirmed:'需先確認模組供電、共地、TX/RX 與位準設定。',configuration_error:'檢查 CellularConfig.h 的電氣確認旗標及 APN 格式。',uart_no_response:'ESP32 未收到完整 AT 回應；檢查 GPIO16/17、115200 baud、共地與模組供電。',sim_not_ready:'SIM 尚未 READY；檢查 SIM 卡、開通狀態或 PIN。',sim_pin_required:'SIM 要求 PIN；先在手機處理，不要猜 PIN。',sim_puk_required:'SIM 要求 PUK；聯絡電信商處理。',apn_setup_failed:'APN 設定被拒；核對電信商提供的 APN。',pin_policy_failed:'SIM PIN 政策設定失敗。',uart_setup_failed:'UART 腳位或 RX 上拉初始化失敗。',ppp_start_failed:'PPP 啟動失敗；檢查模組韌體及 UART 診斷。',modem_check_failed:'模組型號查詢或註冊檢查失敗。',network_not_registered:'行動網路未註冊；檢查 SIM 開通、涵蓋與天線。',data_call_failed:'數據撥號失敗；核對 APN、資費方案與模組狀態。',ip_timeout:'尚未取得 PPP IP；檢查行動數據方案與撥號結果。',data_path_failed:'已有 IP 但資料通道探測失敗，裝置正在重新撥號。',modem_mismatch:'韌體未確認為 A7670 系列，已停止自動撥號。',network_retry:'連線暫時失敗；查看序列埠 h 診斷和下方狀態。',dns_resolution_failed:'模組已有 IP，但 DNS 名稱解析失敗；查看電信 DNS／資料通道。',tls_handshake_failed:'DNS／TCP 可能已通，但 TLS 交握失敗；檢查時鐘、網路攔截與 ESP-TLS 錯誤碼。',tls_certificate_failed:'TLS 憑證驗證失敗；檢查 NTP 校時、憑證鏈與網路攔截。',https_transport_failed:'HTTPS 傳輸失敗；參考 ESP-TLS、Socket 與 ESP 錯誤碼。'};
const LINE_LABELS={waiting:'LINE 待命',sending:'LINE HTTPS 傳送中',retrying:'LINE 傳送失敗，等待重試',accepted:'LINE API 已接受',failed:'LINE 傳送失敗',waiting_network:'等待行動網路',waiting_clock:'等待網路校時',queued:'警報已排隊',cooling:'LINE 冷卻中',invalid_settings:'LINE 設定未完成或無效',expired:'通知事件已逾期'};
const LINE_HINTS={waiting:'尚無待傳事件。只有確認鬆脫才會排入警報通知。',sending:'裝置正在建立 LINE HTTPS 請求。',retrying:'會依韌體重試政策處理；查看 HTTP 狀態與序列埠 h。',accepted:'LINE Messaging API 接受請求；手機是否收到仍須確認。',failed:'檢查 HTTP 狀態、Token 權限、收件者 ID、網路時間與 TLS 錯誤。',waiting_network:'先確認上方 4G 狀態及 PPP IP。',waiting_clock:'等候 NTP 網路校時；TLS 需正確時間。',queued:'鬆脫已確認，通知已排入裝置佇列。',cooling:'通知受冷卻時間限制，避免重複訊息。',invalid_settings:'裝置端檢查 Token／收件者設定格式；實際有效性需以 API 回應確認。',expired:'此事件超出韌體保留期限，沒有補發。'};

let token='',device='',timer=null,snapshot=null,events=[],generation=0,lastResponseAt=0,lastServerMs=0,connectionFailed=false,polling=false;
let lastReceivedMs=null,lastSeq=null,lastBootId=null,lastFullSyncAt=0,notificationOwner='backend';
let soundEnabled=false,audioContext=null,alarmAudibleActive=false,alarmAcknowledged=false,alarmKey='';
let demoMode=false,demoTrend=[];
let recalPending=null,recalPollTimer=null;
const SESSION_KEY='cargoalert-view-session-v1';

function saveSession(){try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({device,token}));}catch{}}
function forgetSession(){try{sessionStorage.removeItem(SESSION_KEY);}catch{}}
const control=createRemoteLineControl({context:()=>({token,device,snapshot:connectionFailed?null:snapshot,lastResponseAt}),get});
const time=x=>Number.isFinite(x)?new Date(x).toLocaleString('zh-TW',{hour12:false}):'尚無紀錄';
const uptime=x=>Number.isFinite(x)?`開機後 ${(x/1000).toFixed(1)} 秒（非日期）`:'未知';

const cargoModel=createCargoModel({
 containerId:'cargoModelSection',
 onChange(info){
  syncLocationBadges(info);
  if(events.length)renderEvents(events);
  state();
 },
 onSelectSensor(id){
  $('sensorCard1')?.classList.toggle('is-highlighted',id===1);
  $('sensorCard2')?.classList.toggle('is-highlighted',id===2);
 },
});

function syncLocationBadges(info=cargoModel.getPlacementInfo()){
 const b1=$('sensorLocBadge1'),b2=$('sensorLocBadge2');
 if(b1)b1.textContent=cargoModel.formatLocation(1);
 if(b2)b2.textContent=cargoModel.formatLocation(2);
}
syncLocationBadges();

function sensorNameOf(id){
 return id===1?'一號感知器':id===2?'二號感知器':'全部感知器';
}

function extractDualSensors(snap){
 if(!snap)return [null,null];
 if(Array.isArray(snap.sensors)&&snap.sensors.length){
  const s1=snap.sensors.find(x=>x.sensorId===1)||snap.sensors[0]||null;
  const s2=snap.sensors.find(x=>x.sensorId===2)||snap.sensors[1]||null;
  return [s1,s2];
 }
 // Legacy single-sensor firmware compatibility: show as Sensor #1, Sensor #2 marked offline
 return [{...snap,sensorId:snap.sensorId||1,sensorName:snap.sensorName||'一號感知器'},null];
}

function playAlarmBeep(){
 if(!soundEnabled)return;
 try{
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  audioContext??=new AudioCtx();
  if(audioContext.state==='suspended')audioContext.resume();
  for(let i=0;i<3;i++){
   const osc=audioContext.createOscillator(),gain=audioContext.createGain();
   osc.type='triangle';osc.frequency.value=880;
   const start=audioContext.currentTime+i*0.25;
   gain.gain.setValueAtTime(0.2,start);gain.gain.linearRampToValueAtTime(0,start+0.18);
   osc.connect(gain);gain.connect(audioContext.destination);
   osc.start(start);osc.stop(start+0.2);
  }
 }catch{}
}

function updateSingleGauge(idx,sensor,stale){
 const card=$(`sensorCard${idx}`),pill=$(`sensorState${idx}`),angleEl=$(`sensorAngle${idx}`);
 const svg=$(`remoteAngleGauge${idx}`),label=$(`angleGaugeStatus${idx}`);
 const riskFill=$(`remoteRiskFill${idx}`),riskText=$(`remoteRiskText${idx}`);
 const dialPrefix=`remoteDial${idx}`;
 if(!svg)return;

 const setRisk=(deg,active)=>{
  if(!riskFill||!riskText)return;
  if(!active||!Number.isFinite(deg)){riskFill.setAttribute('width','0');riskFill.dataset.level='ok';riskText.textContent='—';return;}
  const mag=Math.abs(deg),pct=Math.min(100,(mag/ALARM_THRESHOLD_DEG)*100);
  riskFill.setAttribute('width',pct.toFixed(1));
  riskFill.dataset.level=mag>=ALARM_THRESHOLD_DEG?'alarm':mag>=ALARM_THRESHOLD_DEG*0.625?'warn':'ok';
  riskText.textContent=`${mag.toFixed(1)}° / ${ALARM_THRESHOLD_DEG}°`;
 };

 if(!sensor){
  if(card)card.dataset.state='offline';
  if(pill){pill.textContent='離線';pill.dataset.state='offline';}
  if(angleEl)angleEl.textContent='—';
  if(label)label.textContent=idx===1?'GPIO21/22':'GPIO25/26';
  setDialGauge(svg,dialPrefix,null,'offline');
  setRisk(null,false);
  return;
 }

 const st=stale?'stale':!sensor.valid?'sensor_error':!sensor.calibrated?'uncalibrated':(sensor.state||'normal');
 const validAngle=!stale&&sensor.valid&&sensor.calibrated&&Number.isFinite(sensor.delta);
 const angleText=validAngle?`${sensor.delta>0?'+':''}${sensor.delta.toFixed(1)}°`:'—';
 const shortLbl={normal:'正常',warning:'注意',confirming:'確認中',alarm:'鬆脫',sensor_error:'異常',uncalibrated:'未校正',stale:'過期'};

 if(card)card.dataset.state=st;
 if(pill){pill.textContent=shortLbl[st]||LABELS[st]||st;pill.dataset.state=st;}
 if(angleEl)angleEl.textContent=angleText;
 setDialGauge(svg,dialPrefix,validAngle?sensor.delta:null,validAngle?st:'offline');
 setRisk(sensor.delta,validAngle);

 if(!validAngle){
  if(label)label.textContent=st==='stale'?'無訊號':st==='sensor_error'?`異常 (F${sensor.fault||1})`:st==='uncalibrated'?'未校正':'—';
  svg.setAttribute('aria-label',`${sensorNameOf(idx)}無角度資料`);
  return;
 }
 const magnitude=Math.abs(sensor.delta);
 if(label)label.textContent=st==='alarm'?'鬆脫警報':magnitude>=ALARM_THRESHOLD_DEG?'確認中 (800ms)':'正常';
 svg.setAttribute('aria-label',`${sensorNameOf(idx)} ${angleText}`);
}

function setRecalStatus(text,tone=''){
 const el=$('recalStatus');
 if(!el)return;
 el.textContent=text;
 el.dataset.tone=tone;
}

function updateRecalButtonState(){
 const btn=$('remoteRecalBtn'),chk=$('recalConfirmCheck');
 if(!btn||!chk)return;
 if(recalPending){
  btn.disabled=true;
  btn.textContent='等待裝置確認中…';
  return;
 }
 btn.textContent='重設基準值';
 const ready=demoMode||(!!snapshot&&!connectionFailed&&!snapshot.stale&&(Date.now()-lastResponseAt)+snapshot.serverMs-snapshot.receivedMs<=(snapshot.staleSeconds||60)*1000);
 btn.disabled=!(ready&&chk.checked);
}

function state(){
 control.render();
 updateRecalButtonState();
 const s=snapshot,age=Date.now()-lastResponseAt;
 if(!s||connectionFailed){
  const banner=$('remoteAlarmBanner');if(banner)banner.hidden=true;
  updateSingleGauge(1,null,true);updateSingleGauge(2,null,true);
  cargoModel.updateSensors([null,null],true);
  return;
 }
 const stale=demoMode?false:(s.stale||age+s.serverMs-s.receivedMs>(s.staleSeconds||60)*1000);
 const name=stale?'stale':s.displayState;
 const [s1,s2]=extractDualSensors(s.snapshot);

 $('remoteState').textContent=LABELS[name]||'狀態未知';
 $('remoteState').dataset.state=name;
 $('remoteFresh').textContent=demoMode?'模擬展示中':stale?'資料非即時':'雙感知器最近回報';

 const angleText=!stale&&s.snapshot?.valid&&s.snapshot?.calibrated&&Number.isFinite(s.snapshot.delta)?`${s.snapshot.delta>0?'+':''}${s.snapshot.delta.toFixed(1)}°`:'—';
 const prioId=s.snapshot?.sensorId;
 $('remoteAngle').textContent=angleText==='—'?'—':prioId?`#${prioId} ${angleText}`:angleText;

 updateSingleGauge(1,s1,stale);
 updateSingleGauge(2,s2,stale);
 cargoModel.updateSensors([s1,s2],stale);

 const alarming=[];
 if(!stale&&s1&&s1.valid&&s1.calibrated&&s1.state==='alarm'){
  alarming.push({id:1,delta:s1.delta,loc:cargoModel.formatLocation(1)});
 }
 if(!stale&&s2&&s2.valid&&s2.calibrated&&s2.state==='alarm'){
  alarming.push({id:2,delta:s2.delta,loc:cargoModel.formatLocation(2)});
 }

 $('remoteDetail').textContent=demoMode
  ?'目前為本機展示模擬模式：拖曳上方滑桿或點擊模型錨點，即可預覽實際裝車後的警示聯動。'
  :stale?'暫未收到有效的新回報；不能據此判定裝置斷電。'
  :alarming.length?`注意！${alarming.map(a=>`${sensorNameOf(a.id)}（${a.loc}）`).join('、')} 回報鬆脫警報！`
  :'雙感知器運作中；顯示最近一次 4G 雲端回報，非每 100 ms 即時資料。';

 const banner=$('remoteAlarmBanner');
 if(banner){
  if(!stale&&(alarming.length||name==='alarm')){
   const key=`${s.snapshot?.bootId||'demo'}:${alarming.map(a=>a.id).join(',')}`;
   if(alarmKey!==key){alarmAcknowledged=false;alarmAudibleActive=false;alarmKey=key;}
   banner.hidden=alarmAcknowledged;
   const desc=alarming.length
    ?alarming.map(a=>`【${sensorNameOf(a.id)} · ${a.loc}】偏移 ${a.delta>0?'+':''}${a.delta.toFixed(1)}°`).join('；')
    :`相對角度偏移 ${angleText}`;
   $('remoteAlarmTitle').textContent=alarming.length>1?'🚨 一號與二號感知器同時鬆脫警報！':alarming.length===1?`⚠️ ${sensorNameOf(alarming[0].id)}（${alarming[0].loc}）鬆脫警報！`:'⚠️ 貨物鬆脫警報！';
   $('remoteAlarmText').textContent=`${desc}，請立即停車檢查對應位置之貨物固定束帶！`;
   if(!alarmAcknowledged&&!alarmAudibleActive){alarmAudibleActive=true;playAlarmBeep();}
  }else{
   banner.hidden=true;if(!stale){alarmAudibleActive=false;alarmAcknowledged=false;alarmKey='';}
  }
 }
}

function renderDiagnostics(data,forceStale=false){
 const snap=data?.snapshot,wan=snap?.wan,line=snap?.line,stale=forceStale||!!data?.stale;
 $('remoteDiagFreshness').textContent=snap?`${stale?'最後狀態可能已過期':'裝置最後回報'} · ${time(data?.receivedMs)}`:'尚無裝置診斷';
 const wanNode=$('remoteWanState'),wanName=wan?WAN_LABELS[wan.state]||'未知的網路狀態':snap?'韌體尚未回報4G診斷':'等待裝置首次回報';
 wanNode.textContent=stale&&wan?`資料過期 · 最後：${wanName}`:wanName;wanNode.dataset.state=stale?'stale':wan?.state==='connected'?'normal':wan?.state==='wifi_fallback'?'warning':wan?.state&&['uart_unconfirmed','configuration_error','sim_pin_required','sim_puk_required','sim_missing','modem_mismatch','not_registered','retry_wait'].includes(wan.state)?'alarm':'warning';
 const advice=wan?(WAN_ERRORS[wan.lastError]||''):snap?'請更新並燒錄支援網路診斷回報的韌體。':'';
 $('remoteWanAdvice').textContent=stale?'雲端目前只能顯示最後一份裝置回報；無法由網站直接探測已離線的模組。 '+advice:wan?.state==='connected'?'已取得行動數據 IP；接著仍需確認 DNS、TLS 與 LINE API。 '+advice:advice||'網站尚未收到行動網路診斷。';
 $('remoteWanTransport').textContent=wan?`${wan.transport}（目前回報路徑：${snap.networkMode||'未知'}）`:'—';
 const simLabels={ready:'已就緒',pin_required:'需要 PIN',puk_required:'需要 PUK',missing:'未偵測到',not_ready:'尚未就緒',unknown:'未知'};$('remoteSimState').textContent=wan?`${simLabels[wan.sim]||wan.sim}（ready=${wan.simReady?'是':'否'}）`:'—';
 const reg=wan?.registration;$('remoteRegistration').textContent=Number.isInteger(reg)?reg===1?'已註冊（本地）':reg===5?'已註冊（漫遊）':reg===2?'搜尋網路中':reg===0?'未註冊':`註冊碼 ${reg}`:'尚未取得';
 $('remoteWanIp').textContent=wan?wan.hasIp?'已取得 PPP IP':'未取得 PPP IP':'—';$('remoteUartSim').textContent=wan?`AT=${wan.uartResponding?'有回應':'未確認'} · SIM=${wan.simReady?'READY':'未 READY'}`:'—';$('remoteSignal').textContent=wan?wan.signalQuality<0||wan.signalQuality===99?'未取得':`${wan.signalQuality}（撥號前快照，非即時）`:'—';$('remoteWanRetries').textContent=wan?String(wan.retries):'—';
 const lineNode=$('remoteLinePhase');lineNode.textContent=stale&&line?`資料過期 · 最後：${LINE_LABELS[line.phase]||line.phase}`:line?LINE_LABELS[line.phase]||'未知 LINE 狀態':snap?'韌體尚未回報 LINE 診斷':'等待裝置首次回報';lineNode.dataset.state=line?.phase==='accepted'?'normal':line?.phase==='failed'||line?.phase==='invalid_settings'?'alarm':line?'warning':'unknown';
 let lineAdvice=line?(LINE_HINTS[line.phase]||'查看 HTTP 狀態及序列埠 h 診斷。'):snap?'請更新並燒錄支援 LINE 診斷回報的韌體。':'';if(line&&line.http===401)lineAdvice='LINE 回覆 401：Channel access token 無效、撤銷或過期。';else if(line&&line.http===403)lineAdvice='LINE 回覆 403：檢查 Messaging API 權限或頻道設定。';else if(line&&line.http===400)lineAdvice='LINE 回覆 400：檢查收件者 ID 與訊息格式。';else if(line&&line.http===429)lineAdvice='LINE 回覆 429：額度或速率限制，依韌體政策等待重試。';else if(line&&line.http>=500)lineAdvice='LINE 伺服器回覆 5xx，韌體會有限次重試。';else if(line&&line.http===0&&line.tlsFlags)lineAdvice='TLS 憑證驗證失敗：檢查網路校時、憑證庫及網路攔截。';else if(line&&line.http===0&&line.tlsError)lineAdvice='TLS 交握失敗：查看 ESP-TLS 錯誤碼及裝置時間。';else if(line&&line.http===0&&line.socketError)lineAdvice='Socket 連線失敗：可能是 DNS／TCP 路徑問題，核對上方4G狀態。';$('remoteLineAdvice').textContent=lineAdvice;$('remoteLineHttp').textContent=line?line.http?`HTTP ${line.http}`:'尚無 HTTP 回應':'—';$('remoteLineTls').textContent=line?`error=${line.tlsError} · certFlags=0x${(line.tlsFlags>>>0).toString(16)}`:'—';$('remoteLineSocket').textContent=line?String(line.socketError):'—';$('remoteLineTransportError').textContent=line?`0x${(line.transportError>>>0).toString(16)}`:'—';$('remoteLineAttempts').textContent=line?`${line.attempts} 次（最後事件）`:'—';$('remoteLineConfigured').textContent=line?line.configured?'格式設定已通過；未證明 Token 有效':'格式缺漏／無效':'—';$('remoteLineReady').textContent=line?`網路=${line.networkReady?'可用':'未就緒'} · 校時=${line.clockReady?'完成':'未完成'}`:'—';$('remoteLinePending').textContent=line?line.pending?'有待處理事件':'目前無待處理事件':'—';
}

function disconnected(message){
 connectionFailed=true;control.render();
 $('remoteState').textContent='雲端暫無法讀取';$('remoteState').dataset.state='stale';
 $('remoteAngle').textContent='—';$('remoteFresh').textContent='連線中斷';
 updateSingleGauge(1,null,true);updateSingleGauge(2,null,true);
 cargoModel.updateSensors([null,null],true);
 renderDiagnostics(snapshot,true);
 $('remoteMessage').textContent=message;
 const banner=$('remoteAlarmBanner');if(banner)banner.hidden=true;
}

async function get(action){
 const response=await fetch(`/api/v1/devices/${encodeURIComponent(device)}/${action}`,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Object.assign(Error(response.status===401?'查看金鑰或裝置識別碼不正確':response.status===503?'後端尚未完成資料庫設定':`雲端讀取失敗（HTTP ${response.status}）`),{status:response.status});
 return response;
}

function eventSensorId(e){
 try{
  const p=typeof e.payload==='string'?JSON.parse(e.payload):e.payload;
  const sid=p?.sensorId??p?.sample?.sensorId;
  return Number.isInteger(sid)?sid:null;
 }catch{return null;}
}

function filterMatches(e,typeFilter,sensorFilter){
 if(sensorFilter!=='all'){
  const sid=eventSensorId(e);
  if(String(sid)!==sensorFilter)return false;
 }
 if(typeFilter==='all')return true;
 if(typeFilter==='alarm')return e.type==='alarm';
 if(typeFilter==='sensor')return e.type==='sensor_fault'||e.type==='sensor_recovered';
 if(typeFilter==='cal')return e.type==='calibration'||e.type==='baseline_cleared';
 if(typeFilter==='state')return e.type==='state_change';
 if(typeFilter==='test')return e.type==='test_notification';
 if(typeFilter==='boot')return e.type==='boot';
 return true;
}

function renderEvents(rows){
 $('remoteEvents').replaceChildren();
 const typeFilter=$('remoteEventFilter')?.value||'all';
 const sensorFilter=$('remoteSensorFilter')?.value||'all';
 const filtered=rows.filter(e=>filterMatches(e,typeFilter,sensorFilter));
 const countBadge=$('remoteEventCount');
 if(countBadge)countBadge.textContent=`${filtered.length} / ${rows.length} 筆`;

 if(!filtered.length){
  const tr=document.createElement('tr'),td=document.createElement('td');
  td.colSpan=4;td.textContent=rows.length?'此篩選條件下尚無事件，請切換篩選。':'尚無事件';
  tr.append(td);$('remoteEvents').append(tr);
  return;
 }

 for(const e of filtered){
  const tr=document.createElement('tr'),
  colType=document.createElement('td'),
  colSample=document.createElement('td'),
  colReceived=document.createElement('td'),
  colLine=document.createElement('td'),
  smallTime=document.createElement('small');

  let parsedPayload=null;
  try{parsedPayload=typeof e.payload==='string'?JSON.parse(e.payload):e.payload;}catch{}
  const sid=parsedPayload?.sensorId??parsedPayload?.sample?.sensorId;

  if(sid===1||sid===2){
   const sTag=document.createElement('span');
   sTag.className=`event-sensor-tag s${sid}`;
   sTag.textContent=`${sensorNameOf(sid)} · ${cargoModel.formatLocation(sid)}`;
   colType.append(sTag);
  }else if(sid===0){
   const sTag=document.createElement('span');
   sTag.className='event-sensor-tag s0';
   sTag.textContent='系統';
   colType.append(sTag);
  }
  colType.append(document.createTextNode(TYPES[e.type]||e.type));
  smallTime.textContent=e.occurred_epoch_ms?time(e.occurred_epoch_ms):uptime(e.uptime_ms);
  colType.append(smallTime);
  if(e.historical){
   const badge=document.createElement('span');badge.className='history-badge';badge.textContent='歷史補傳';
   colType.append(badge);
  }

  let sampleText='—',sampleClass='normal';
  const sm=parsedPayload?.sample;
  if(sm){
   if(!sm.valid){
    sampleText=`感測異常 (代碼 ${sm.fault||1})`;sampleClass='alarm';
   }else if(!sm.calibrated){
    sampleText='未校正';sampleClass='warning';
   }else if(Number.isFinite(sm.delta)){
    sampleText=`${sm.delta>0?'+':''}${sm.delta.toFixed(1)}° (${LABELS[sm.state]||sm.state})`;
    sampleClass=sm.state==='alarm'?'alarm':sm.state==='warning'||sm.state==='confirming'?'warning':'normal';
   }
  }
  colSample.className=`event-angle-cell ${sampleClass}`;
  const strongSample=document.createElement('strong');
  strongSample.textContent=sampleText;
  colSample.append(strongSample);

  colReceived.textContent=time(e.received_ms);

  if(e.line_state==='device_owned'||(!e.line_state&&notificationOwner==='device'&&['alarm','test_notification'].includes(e.type))){
   colLine.textContent='由 ESP32 負責發送；結果未確認';
   const devTag=document.createElement('span');devTag.className='device-owned-tag';devTag.textContent='裝置端通知';
   colLine.append(document.createElement('br'),devTag);
  }else if(e.line_state){
   colLine.textContent=LINE[e.line_state]||e.line_state;
  }else{
   colLine.textContent='一般事件（不觸發 LINE）';
  }
  if(e.http)colLine.append(document.createTextNode(` · HTTP ${e.http}`));

  tr.append(colType,colSample,colReceived,colLine);
  $('remoteEvents').append(tr);
 }

 const n=rows.find(e=>e.line_state);
 if(notificationOwner==='device'){
  $('remoteLine').textContent='由 ESP32 直接推播 LINE（單一通知來源，訊息會註明一號或二號感知器）';
 }else{
  $('remoteLine').textContent=n?LINE[n.line_state]||'處理狀態未知':'尚無需通知的事件';
 }
}

// Dual-line adaptive trend chart
function trend(points){
 const svg=$('remoteTrend');svg.replaceChildren();
 const list=points.filter(p=>Number.isFinite(p.receivedMs));
 const w=600,h=170,padX=38,padY=18,chartW=w-padX*2,chartH=h-padY*2;
 const yMid=padY+chartH/2;

 const getSeriesSample=(p,idx)=>{
  if(Array.isArray(p.sensors)&&p.sensors.length){
   return p.sensors.find(x=>x.sensorId===idx)||p.sensors[idx-1]||null;
  }
  return idx===1?p:null;
 };

 let max1=0,max2=0,validCount=0,outOfRange=false;
 for(const p of list){
  if(p.sampleAgeMs>60000)continue;
  for(const idx of [1,2]){
   const sm=getSeriesSample(p,idx);
   if(!sm||!sm.valid||!sm.calibrated||!Number.isFinite(sm.delta))continue;
   const mag=Math.abs(sm.delta);validCount++;if(mag>90)outOfRange=true;
   if(idx===1&&mag>max1)max1=mag;
   if(idx===2&&mag>max2)max2=mag;
  }
 }
 const maxDelta=Math.max(max1,max2);
 const ySpan=Math.min(90,Math.max(15,Math.ceil((maxDelta||ALARM_THRESHOLD_DEG)*1.25/5)*5));
 const toY=deg=>yMid-Math.max(-ySpan,Math.min(ySpan,deg))/ySpan*(chartH/2);

 const yPos6=toY(ALARM_THRESHOLD_DEG),yNeg6=toY(-ALARM_THRESHOLD_DEG);
 const mkBand=(y1,y2,fill)=>{
  const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
  rect.setAttribute('x',padX);rect.setAttribute('y',Math.min(y1,y2).toFixed(1));
  rect.setAttribute('width',chartW);rect.setAttribute('height',Math.max(0,Math.abs(y2-y1)).toFixed(1));
  rect.setAttribute('fill',fill);svg.append(rect);
 };
 mkBand(padY,yPos6,'rgba(173,48,57,0.06)');
 mkBand(yPos6,yNeg6,'rgba(42,140,135,0.06)');
 mkBand(yNeg6,padY+chartH,'rgba(173,48,57,0.06)');

 const mkLine=(y,color,dash,label,labelY=y+4)=>{
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1',padX);line.setAttribute('x2',w-padX);
  line.setAttribute('y1',y.toFixed(1));line.setAttribute('y2',y.toFixed(1));
  line.setAttribute('stroke',color);line.setAttribute('stroke-width','1');
  if(dash)line.setAttribute('stroke-dasharray',dash);
  svg.append(line);
  if(label){
   const txt=document.createElementNS('http://www.w3.org/2000/svg','text');
   txt.setAttribute('x',padX-6);txt.setAttribute('y',labelY.toFixed(1));
   txt.setAttribute('text-anchor','end');txt.setAttribute('font-size','9.5');
   txt.setAttribute('fill',color);txt.textContent=label;svg.append(txt);
  }
 };
 mkLine(padY,'#9fb2bf','1,3',`+${ySpan}°`,padY+3);
 mkLine(yPos6,'#ad3039','4,3','+4°',Math.min(yPos6+3,yMid-8));
 mkLine(yMid,'#587285','2,2','0°',yMid+3);
 mkLine(yNeg6,'#ad3039','4,3','-4°',Math.max(yNeg6+4,yMid+14));
 mkLine(padY+chartH,'#9fb2bf','1,3',`-${ySpan}°`,padY+chartH+3);

 const drawSeries=(idx,strokeColor)=>{
  let path='',drawing=false,lastPointMs=null;
  list.forEach((p,i)=>{
   const sm=getSeriesSample(p,idx);
   if(!sm||!sm.valid||!sm.calibrated||!Number.isFinite(sm.delta)||p.sampleAgeMs>60000){drawing=false;return;}
   if(lastPointMs!==null&&(p.receivedMs-lastPointMs>60000||p.receivedMs<lastPointMs))drawing=false;lastPointMs=p.receivedMs;
   const x=padX+i/Math.max(1,list.length-1)*chartW,y=toY(sm.delta);
   path+=(drawing?'L':'M')+x.toFixed(1)+','+y.toFixed(1);
   drawing=true;
   if(Math.abs(sm.delta)>=ALARM_THRESHOLD_DEG){
    const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
    dot.setAttribute('cx',x.toFixed(1));dot.setAttribute('cy',y.toFixed(1));
    dot.setAttribute('r','3.8');dot.setAttribute('fill','#ad3039');
    const title=document.createElementNS('http://www.w3.org/2000/svg','title');
    title.textContent=`${sensorNameOf(idx)} ${time(p.receivedMs)}: ${sm.delta>0?'+':''}${sm.delta.toFixed(1)}°`;
    dot.append(title);svg.append(dot);
   }
  });
  if(path){
   const el=document.createElementNS('http://www.w3.org/2000/svg','path');
   el.setAttribute('d',path);el.setAttribute('fill','none');
   el.setAttribute('stroke',strokeColor);el.setAttribute('stroke-width','2.3');
   svg.append(el);
  }
  return !!path;
 };

 const has1=drawSeries(1,'#1e8c87');
 const has2=drawSeries(2,'#e08224');
 svg.setAttribute('aria-label',has1||has2?`最近 ${points.length} 次雙感知器回報角度趨勢`:'尚無有效角度趨勢');
 const peakPill=$('trendPeak');
 if(peakPill)peakPill.textContent=validCount?`峰值 #1:${max1.toFixed(1)}° / #2:${max2.toFixed(1)}°`:'峰值: —';
 $('trendNote').textContent=`最近 ${points.length} 次回報（最多 240 筆，縱軸 ±${ySpan}°）；青綠線＝一號感知器、橘線＝二號感知器。${outOfRange?'超過 ±90° 的點顯示於邊界。':''}`;
}

async function poll(run){
 if(run!==generation||!token||polling||demoMode)return;
 polling=true;
 try{
  let data;
  try{data=await(await get('status')).json();}
  catch(e){
   if(run!==generation)return;
   if(e.status===401){clearProtectedData();token='';forgetSession();$('remoteLogout').disabled=true;disconnected('查看金鑰失效或裝置識別碼不正確，請重新輸入。');return;}
   disconnected('暫時無法讀取雲端，5 秒後自動重試，不必重填金鑰。');return;
  }
  if(run!==generation)return;
  connectionFailed=false;snapshot=data;lastResponseAt=Date.now();lastServerMs=data.serverMs;
  notificationOwner=data.notificationOwner||'backend';

  $('remoteName').textContent=`${data.name}（雙感知器監測）`;
  $('simulationBadge').hidden=!data.simulation;
  $('remoteReceived').textContent=time(data.receivedMs);
  $('remoteUptime').textContent=uptime(data.snapshot?.uptimeMs);
  const netMode=data.snapshot?.networkMode||'網路未知';
  const ownerLabel=notificationOwner==='device'?'裝置直發 LINE':'後端代發 LINE';
  $('remoteFirmware').textContent=data.snapshot?`${data.snapshot.firmware||'版本未知'} · ${data.snapshot.calibrated?'已校正':'未校正'} · ${netMode} · ${ownerLabel}`:'等待首次回報';
  state();
  renderDiagnostics(data);
  $('remoteMessage').textContent=data.stale?'雲端連線正常，但裝置尚未回報新資料；每 5 秒智慧檢查。':'監測中：雙感知器 4G 雲端資料自動更新中。';

  const isDataNew=(data.receivedMs!==lastReceivedMs)||(data.snapshot?.seq!==lastSeq)||(data.snapshot?.bootId!==lastBootId);
  const isTimeForFullSync=(Date.now()-lastFullSyncAt>30000);

  if(isDataNew||isTimeForFullSync||!events.length){
   const results=await Promise.allSettled(['events','trend','metrics'].map(async action=>(await get(action)).json()));
   if(run!==generation)return;
   if(results.every(r=>r.status==='fulfilled')){
    lastFullSyncAt=Date.now();lastReceivedMs=data.receivedMs;lastSeq=data.snapshot?.seq??null;lastBootId=data.snapshot?.bootId??null;
   }else{lastFullSyncAt=0;}

   if(results[0].status==='fulfilled'){
    events=results[0].value.events;
    if(results[0].value.notificationOwner)notificationOwner=results[0].value.notificationOwner;
    renderEvents(events);
    $('remoteCsv').disabled=!events.length;
   }
   if(results[1].status==='fulfilled')trend(results[1].value.points);
   if(results[2].status==='fulfilled'){
    const metrics=results[2].value,stats=data.snapshot?.deviceStats||{},notice=Object.fromEntries(metrics.notification.map(x=>[x.state,x.count]));
    $('remoteMetrics').textContent=`後端唯一回報 ${metrics.uniqueReports} 筆 · 裝置成功 ${stats.uploaded??'未知'}／失敗 ${stats.failed??'未知'}／重連 ${stats.reconnects??'未知'}／佇列捨棄 ${stats.dropped??'未知'} · 通知 API 接受 ${notice.accepted||0}／待重試 ${notice.retry||0}／失敗 ${notice.failed||0}`;
   }
   if(results.some(r=>r.status==='rejected'))$('remoteMessage').textContent+=' 部分歷史資料暫時無法讀取，稍後自動重試。';
  }
  await control.refresh();
 }catch(e){if(run===generation)$('remoteMessage').textContent='部分資料處理失敗，稍後自動重試。';}
 finally{polling=false;if(token&&!demoMode){clearTimeout(timer);const current=generation;const nextMs=connectionFailed?3000:snapshot?.stale?2500:1000;timer=setTimeout(()=>poll(current),nextMs);}}
}

function clearProtectedData(){
 events=[];snapshot=null;connectionFailed=false;lastResponseAt=0;
 lastReceivedMs=null;lastSeq=null;lastBootId=null;lastFullSyncAt=0;
 alarmAudibleActive=false;alarmAcknowledged=false;alarmKey='';
 recalPending=null;clearTimeout(recalPollTimer);
 const chk=$('recalConfirmCheck');if(chk)chk.checked=false;
 setRecalStatus('先讀取裝置狀態（或開啟展示模擬模式），再勾選確認即可重設基準值。');
 const banner=$('remoteAlarmBanner');if(banner)banner.hidden=true;
 control.reset();
 $('remoteName').textContent='雙感知器即時監測';
 for(const id of ['remoteAngle','remoteReceived','remoteUptime','remoteFirmware'])$(id).textContent='—';
 $('remoteLine').textContent='尚無雲端處理結果';$('remoteMetrics').textContent='尚無統計';
 $('remoteCsv').disabled=true;$('simulationBadge').hidden=true;
 renderEvents([]);trend([]);
 updateSingleGauge(1,null,true);updateSingleGauge(2,null,true);
 cargoModel.updateSensors([null,null],true);
}

// Demo Mode Engine (local interactive preview for judges / testing)
function applyDemoState(d1,d2,{fault2=false}={}){
 const now=Date.now();
 const makeS=(id,delta,fault=false)=>{
  if(fault)return {sensorId:id,sensorName:sensorNameOf(id),uptimeMs:120000,valid:false,calibrated:true,state:'sensor_error',fault:2,delta:null};
  const st=Math.abs(delta)>=ALARM_THRESHOLD_DEG?'alarm':'normal';
  return {sensorId:id,sensorName:sensorNameOf(id),uptimeMs:120000,valid:true,calibrated:true,state:st,fault:0,delta};
 };
 const s1=makeS(1,d1,false),s2=makeS(2,d2,fault2);
 const sev=s=>s.state==='alarm'?5:!s.valid?4:0;
 const prio=sev(s2)>sev(s1)?s2:sev(s1)>sev(s2)?s1:(Math.abs(s2.delta||0)>Math.abs(s1.delta||0)?s2:s1);

 const snap={
  ...prio,sensorCount:2,sensors:[s1,s2],seq:demoTrend.length+1,bootId:'demo0000000000000000000000000000',
  firmware:'3.0.0-dual-as5600',sampleAgeMs:120,simulation:true,networkMode:'4G',notificationOwner:'device',
  wan:{state:'connected',lastError:'none',sim:'ready',transport:'4G',registration:1,signalQuality:22,retries:0,uartResponding:true,simReady:true,hasIp:true},
  line:{phase:prio.state==='alarm'?'accepted':'waiting',http:prio.state==='alarm'?200:0,attempts:prio.state==='alarm'?1:0,transportError:0,tlsError:0,tlsFlags:0,socketError:0,configured:true,networkReady:true,clockReady:true,pending:false},
 };
 snapshot={deviceId:'demo-truck',name:'示範貨車 #01',simulation:true,snapshot:snap,receivedMs:now,serverMs:now,staleSeconds:60,stale:false,displayState:prio.state,notificationOwner:'device'};
 lastResponseAt=now;lastServerMs=now;connectionFailed=false;notificationOwner='device';
 $('remoteName').textContent='示範貨車 #01（展示模擬模式）';
 $('simulationBadge').hidden=false;
 $('remoteReceived').textContent=time(now);
 $('remoteUptime').textContent=uptime(120000);
 $('remoteFirmware').textContent='3.0.0-dual-as5600 · 已校正 · 4G · 裝置直發 LINE';

 demoTrend.push({receivedMs:now,sampleAgeMs:120,sensors:[s1,s2],...prio});
 if(demoTrend.length>40)demoTrend.shift();
 trend(demoTrend);

 if(s1.state==='alarm'||s2.state==='alarm'||fault2){
  const evS=s1.state==='alarm'?s1:s2;
  const evType=fault2&&evS===s2?'sensor_fault':'alarm';
  events.unshift({
   id:`demo:${now}`,type:evType,uptime_ms:120000,occurred_epoch_ms:now,received_ms:now,historical:0,
   payload:JSON.stringify({sensorId:evS.sensorId,sensorName:evS.sensorName,sample:evS}),
   line_state:evType==='alarm'?'device_owned':null,
  });
  events=events.slice(0,25);
  renderEvents(events);
 }
 renderDiagnostics(snapshot,false);
 state();
}

function updateDemoFromSliders(opts={}){
 const d1=Number($('demoSlider1').value),d2=Number($('demoSlider2').value);
 $('demoVal1').textContent=`${d1>0?'+':''}${d1.toFixed(1)}°`;
 $('demoVal2').textContent=`${d2>0?'+':''}${d2.toFixed(1)}°`;
 applyDemoState(d1,d2,opts);
}

$('toggleDemoMode')?.addEventListener('click',()=>{
 demoMode=!demoMode;
 const btn=$('toggleDemoMode'),panel=$('demoPanel');
 btn.setAttribute('aria-pressed',String(demoMode));
 btn.textContent=demoMode?'⏹ 結束展示模擬模式':'🎮 開啟展示模擬模式';
 if(panel)panel.hidden=!demoMode;
 if(demoMode){
  clearTimeout(timer);
  demoTrend=[];events=[];
  $('remoteMessage').textContent='展示模擬模式已開啟：可調整角度滑桿或點上方貨車模型選擇一號／二號擺放位置。';
  updateDemoFromSliders();
 }else{
  clearProtectedData();
  $('remoteMessage').textContent='已關閉模擬模式。請輸入裝置識別碼與查看金鑰讀取 4G 雲端資料。';
  if(token)poll(++generation);
 }
});

$('demoSlider1')?.addEventListener('input',()=>demoMode&&updateDemoFromSliders());
$('demoSlider2')?.addEventListener('input',()=>demoMode&&updateDemoFromSliders());
document.querySelectorAll('[data-demo]').forEach(btn=>{
 btn.addEventListener('click',()=>{
  if(!demoMode)return;
  const mode=btn.dataset.demo;
  if(mode==='normal'){$('demoSlider1').value='0.5';$('demoSlider2').value='-0.4';updateDemoFromSliders();}
  else if(mode==='alarm1'){$('demoSlider1').value='8.5';$('demoSlider2').value='-0.4';updateDemoFromSliders();}
  else if(mode==='alarm2'){$('demoSlider1').value='0.5';$('demoSlider2').value='-9.2';updateDemoFromSliders();}
  else if(mode==='alarmBoth'){$('demoSlider1').value='8.5';$('demoSlider2').value='-9.2';updateDemoFromSliders();}
  else if(mode==='fault2'){$('demoSlider1').value='0.5';$('demoSlider2').value='0';updateDemoFromSliders({fault2:true});}
 });
});

$('remoteEventFilter')?.addEventListener('change',()=>renderEvents(events));
$('remoteSensorFilter')?.addEventListener('change',()=>renderEvents(events));
$('recalConfirmCheck')?.addEventListener('change',updateRecalButtonState);

function makeUuidV4(){
 if(crypto?.randomUUID)return crypto.randomUUID();
 const b=new Uint8Array(16);crypto.getRandomValues(b);
 b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;
 const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

async function pollRecalStatus(id,target,startedAt){
 if(!recalPending||recalPending.id!==id)return;
 try{
  const data=await(await get('commands')).json();
  const cmd=(data.commands||[]).find(c=>c.id===id);
  if(cmd&&cmd.state==='executed'){
   recalPending=null;
   if($('recalConfirmCheck'))$('recalConfirmCheck').checked=false;
   const who=target==='1'?'一號感知器':target==='2'?'二號感知器':'一號與二號感知器';
   setRecalStatus(`✅ 校正完成：ESP32 已重設【${who}】基準值並存入 NVS！`,'ok');
   updateRecalButtonState();
   clearTimeout(timer);poll(generation);
   return;
  }
  if(cmd&&(cmd.state==='failed'||cmd.state==='expired'||cmd.state==='cancelled')){
   recalPending=null;
   const detail=cmd.result?`（裝置回覆：${cmd.result}，請檢查磁鐵與接線）`:cmd.state==='expired'?'（逾時未收到裝置確認）':'（裝置端已重開或取消）';
   setRecalStatus(`❌ 基準重設未成功${detail}`,'err');
   updateRecalButtonState();
   return;
  }
 }catch{}
 if(Date.now()-startedAt>65000){
  recalPending=null;
  setRecalStatus('⚠️ 等待裝置確認逾時，請查看裝置 4G 狀態與最新角度。','err');
  updateRecalButtonState();
  return;
 }
 recalPollTimer=setTimeout(()=>pollRecalStatus(id,target,startedAt),2000);
}

$('remoteRecalBtn')?.addEventListener('click',async()=>{
 if($('remoteRecalBtn').disabled)return;
 const target=$('recalTarget')?.value||'all';
 const who=target==='1'?'一號感知器':target==='2'?'二號感知器':'一號與二號感知器';

 // Demo simulation mode: zero immediately for presentation!
 if(demoMode){
  if(target==='all'||target==='1')$('demoSlider1').value='0';
  if(target==='all'||target==='2')$('demoSlider2').value='0';
  if($('recalConfirmCheck'))$('recalConfirmCheck').checked=false;
  updateDemoFromSliders();
  const now=Date.now();
  const sid=target==='1'?1:target==='2'?2:0;
  events.unshift({
   id:`demo-cal:${now}`,type:'calibration',uptime_ms:120000,occurred_epoch_ms:now,received_ms:now,historical:0,
   payload:JSON.stringify({sensorId:sid,sensorName:sensorNameOf(sid),sample:{sensorId:sid,valid:true,calibrated:true,state:'normal',fault:0,delta:0}}),
   line_state:null,
  });
  events=events.slice(0,25);
  renderEvents(events);
  setRecalStatus(`✅ 模擬重設完成：已將【${who}】歸零為 0.0° 新基準！`,'ok');
  updateRecalButtonState();
  return;
 }

 // Live 4G Cloud Mode
 const requestId=makeUuidV4();
 const authKey=($('remoteControlKey')?.value||'').trim()||token;
 recalPending={id:requestId,target};
 updateRecalButtonState();
 setRecalStatus(`⏳ 已送出【${who}】基準重設命令，等待 ESP32 經 4G 接收並寫入 NVS…`,'wait');
 try{
  const r=await fetch(`/api/v1/devices/${encodeURIComponent(device)}/recalibrate`,{
   method:'POST',
   headers:{Authorization:'Bearer '+authKey,'Content-Type':'application/json'},
   body:JSON.stringify({requestId,target}),
   signal:AbortSignal.timeout(8000),
  });
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(body.error||`HTTP ${r.status}`);
  setRecalStatus(`📡 雲端已排隊【${who}】基準重設命令，等待 ESP32 下次 4G 回報執行（約 2～5 秒）…`,'wait');
  pollRecalStatus(requestId,target,Date.now());
 }catch(e){
  recalPending=null;
  setRecalStatus(`❌ 送出重設基準命令失敗：${e.message}`,'err');
  updateRecalButtonState();
 }
});

$('remoteAckAlarm')?.addEventListener('click',()=>{
 const banner=$('remoteAlarmBanner');if(banner)banner.hidden=true;
 alarmAcknowledged=true;
});

$('remoteSoundToggle')?.addEventListener('click',()=>{
 soundEnabled=!soundEnabled;
 const btn=$('remoteSoundToggle');
 if(btn){
  btn.textContent=soundEnabled?'🔔 提示音：開':'🔔 提示音：關';
  btn.setAttribute('aria-pressed',String(soundEnabled));
  if(soundEnabled)playAlarmBeep();
 }
});

const setupToggle=(btnId,inputId)=>{
 const btn=$(btnId),inp=$(inputId);
 if(!btn||!inp)return;
 btn.addEventListener('click',()=>{
  const isPass=inp.type==='password';
  inp.type=isPass?'text':'password';
  btn.textContent=isPass?'🙈':'👁';
  btn.setAttribute('aria-label',isPass?'隱藏金鑰':'顯示金鑰');
 });
};
setupToggle('toggleViewKey','remoteKey');
setupToggle('toggleControlKey','remoteControlKey');

$('remoteLogin').addEventListener('submit',e=>{
 e.preventDefault();
 const id=$('remoteId').value.trim(),key=$('remoteKey').value.trim();
 if(!/^[a-zA-Z0-9_-]{1,48}$/.test(id)||!/^[A-Za-z0-9_-]{32,128}$/.test(key)){
  $('remoteMessage').textContent='請檢查裝置識別碼與查看金鑰格式。';return;
 }
 if(demoMode){demoMode=false;$('demoPanel').hidden=true;$('toggleDemoMode').setAttribute('aria-pressed','false');$('toggleDemoMode').textContent='🎮 開啟展示模擬模式';}
 clearProtectedData();device=id;token=key;saveSession();
 cargoModel.load(device);
 $('remoteKey').value='';$('remoteLogout').disabled=false;
 snapshot=null;$('remoteAngle').textContent='—';$('remoteState').textContent='正在讀取雲端…';
 clearTimeout(timer);poll(++generation);
});

$('remoteLogout').addEventListener('click',()=>{
 generation++;clearProtectedData();token='';forgetSession();device='';
 cargoModel.load('default');
 snapshot=null;events=[];clearTimeout(timer);
 $('remoteLogout').disabled=true;$('remoteCsv').disabled=true;
 $('remoteAngle').textContent='—';$('remoteState').textContent='已清除查看金鑰';
 $('remoteState').dataset.state='offline';$('remoteFresh').textContent='尚未載入';
 $('remoteMessage').textContent='查看金鑰已從本頁記憶體清除。';
 $('simulationBadge').hidden=true;renderEvents([]);
});

$('remoteCsv').addEventListener('click',async()=>{
 try{
  const r=await get('events.csv?limit=1000'),blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='CargoAlert-events.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){$('remoteMessage').textContent=e.message;}
});

setInterval(state,1000);

try{
 const saved=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
 if(saved&&/^[a-zA-Z0-9_-]{1,48}$/.test(saved.device)&&/^[A-Za-z0-9_-]{32,128}$/.test(saved.token)){
  device=saved.device;token=saved.token;$('remoteId').value=device;
  cargoModel.load(device);
  $('remoteLogout').disabled=false;$('remoteMessage').textContent='正在恢復查看，自動讀取雲端…';
  poll(++generation);
 }
}catch{forgetSession();}

function resume(){if(!token||polling||demoMode)return;clearTimeout(timer);poll(generation);}
window.addEventListener('online',resume);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume();});

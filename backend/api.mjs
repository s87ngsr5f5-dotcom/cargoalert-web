// Shared by the local SQLite service and hosted D1 Worker. No device/LINE secrets in source.
// Upgraded for CargoAlert v3.0 dual AS5600 sensors (100% backward-compatible with v1 single-sensor firmware).
export const API_VERSION=1;
const IDENT=/^[a-zA-Z0-9_-]{1,48}$/, BOOT=/^[a-f0-9]{32}$/;
const TYPES=new Set(['boot','calibration','baseline_cleared','sensor_fault','sensor_recovered','alarm','state_change','test_notification']);
const STATES=new Set(['uncalibrated','normal','warning','confirming','alarm','sensor_error']);
const WAN_STATES=new Set(['idle','wifi_connecting','uart_unconfirmed','configuration_error','modem_initializing','sim_checking','sim_pin_required','sim_puk_required','sim_missing','modem_checking','modem_mismatch','network_registering','not_registered','waiting_ip','connected','wifi_fallback','retry_wait']);
const WAN_ERRORS=new Set(['none','uart_unconfirmed','configuration_error','uart_no_response','sim_not_ready','sim_pin_required','sim_puk_required','apn_setup_failed','pin_policy_failed','uart_setup_failed','ppp_start_failed','modem_check_failed','network_not_registered','data_call_failed','ip_timeout','data_path_failed','modem_mismatch','network_retry','dns_resolution_failed','tls_handshake_failed','tls_certificate_failed','https_transport_failed']);
const SIM_STATES=new Set(['unknown','ready','pin_required','puk_required','missing','not_ready']);
const LINE_PHASES=new Set(['waiting','sending','retrying','accepted','failed','waiting_network','waiting_clock','queued','cooling','invalid_settings','expired']);
const ALARM_THRESHOLD_DEG=4;
const MAX_BYTES=24576;
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
const int=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&([...a].reduce((v,c,i)=>v|(c.charCodeAt(0)^b.charCodeAt(i)),0)===0);
export async function hashToken(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function configs(env){try{const a=JSON.parse(env.CARGO_DEVICES_JSON||'[]');return Array.isArray(a)?a:[];}catch{return [];}}
async function auth(req,env,id,kind){
 const cfg=configs(env).find(x=>x.id===id&&IDENT.test(x.id));
 const token=/^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(req.headers.get('Authorization')||'')?.[1];
 if(!cfg||!token)fail('unauthorized',401);
 const hashed=await hashToken(token);
 if(kind==='recalibrate'){
  const ctrl=controlHash(env,id);
  const ok=(ctrl&&same(hashed,ctrl))||same(hashed,cfg.viewHash);
  if(!ok)fail('unauthorized',401);
  return cfg;
 }
 if(!same(hashed,kind==='control'?controlHash(env,id):cfg[kind==='write'?'uploadHash':'viewHash']))fail('unauthorized',401);
 return cfg;
}
async function body(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers.get('Content-Type')||''))fail('JSON required',415);
 const reader=req.body?.getReader();if(!reader)fail('body required');let n=0,parts=[];
 for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>MAX_BYTES){await reader.cancel();fail('body too large',413);}parts.push(value);}
 const all=new Uint8Array(n);let at=0;for(const p of parts){all.set(p,at);at+=p.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}catch{fail('invalid JSON');}
}
function sensorLabel(id){
 return id===1?'一號感知器':id===2?'二號感知器':id===0?'全部感知器':`感知器 #${id}`;
}
function sample(s,maxUptime){
 if(!s||!int(s.uptimeMs,0,maxUptime)||typeof s.valid!=='boolean'||typeof s.calibrated!=='boolean'||!STATES.has(s.state)||!int(s.fault,0,5))fail('invalid sample');
 if(!s.valid){if(s.state!=='sensor_error'||s.delta!==null)fail('invalid sensor must not be normal');}
 else if(!s.calibrated){if(s.state!=='uncalibrated'||s.delta!==null||s.fault!==0)fail('uncalibrated sample inconsistent');}
 else if(!Number.isFinite(s.delta)||Math.abs(s.delta)>180||s.fault!==0||['sensor_error','uncalibrated'].includes(s.state))fail('invalid calibrated angle');
 else if(s.state==='alarm'&&Math.abs(s.delta)<ALARM_THRESHOLD_DEG)fail('alarm angle must be at least 4 degrees');
 const out={uptimeMs:s.uptimeMs,valid:s.valid,calibrated:s.calibrated,state:s.state,fault:s.fault,delta:s.delta};
 if(s.sensorId!==undefined){
  if(!int(s.sensorId,0,4))fail('invalid sensorId');
  out.sensorId=s.sensorId;
  out.sensorName=typeof s.sensorName==='string'&&s.sensorName.length<=32?s.sensorName:sensorLabel(s.sensorId);
 }
 if(typeof s.angle==='number'&&Number.isFinite(s.angle)&&s.angle>=0&&s.angle<=360)out.angle=s.angle;
 if(typeof s.baseline==='number'&&Number.isFinite(s.baseline)&&s.baseline>=0&&s.baseline<=360)out.baseline=s.baseline;
 if(int(s.confirmRemainingMs,0,60000))out.confirmRemainingMs=s.confirmRemainingMs;
 return out;
}
function wanStatus(w){
 if(w===undefined)return null;
 if(!w||!WAN_STATES.has(w.state)||!WAN_ERRORS.has(w.lastError)||!SIM_STATES.has(w.sim)||!['4G','Wi-Fi'].includes(w.transport)||!int(w.registration,-1,11)||!int(w.signalQuality,-1,99)||!int(w.retries,0,100000)||typeof w.uartResponding!=='boolean'||typeof w.simReady!=='boolean'||typeof w.hasIp!=='boolean')fail('invalid WAN diagnostics');
 return {state:w.state,lastError:w.lastError,sim:w.sim,transport:w.transport,registration:w.registration,signalQuality:w.signalQuality,retries:w.retries,uartResponding:w.uartResponding,simReady:w.simReady,hasIp:w.hasIp};
}
function lineStatus(l){
 if(l===undefined)return null;
 if(!l||!LINE_PHASES.has(l.phase)||!int(l.http,0,599)||!int(l.attempts,0,1000)||!int(l.transportError,0,4294967295)||!int(l.tlsError,-2147483648,2147483647)||!int(l.tlsFlags,-2147483648,2147483647)||!int(l.socketError,-2147483648,2147483647)||typeof l.configured!=='boolean'||typeof l.networkReady!=='boolean'||typeof l.clockReady!=='boolean'||typeof l.pending!=='boolean')fail('invalid LINE diagnostics');
 return {phase:l.phase,http:l.http,attempts:l.attempts,transportError:l.transportError,tlsError:l.tlsError,tlsFlags:l.tlsFlags,socketError:l.socketError,configured:l.configured,networkReady:l.networkReady,clockReady:l.clockReady,pending:l.pending};
}
function validateReport(p,id,cfg,now){
 if(!p||(p.v!==1&&p.v!==2)||p.deviceId!==id||!BOOT.test(p.bootId)||!int(p.sessionGeneration,1)||!int(p.seq,1)||!int(p.sentUptimeMs)||typeof p.firmware!=='string'||p.firmware.length>48||p.simulation!==!!cfg.simulation||!Array.isArray(p.events)||p.events.length>8)fail('invalid report envelope');
 p.sample=sample(p.sample,p.sentUptimeMs);
 if(p.sensors!==undefined){
  if(!Array.isArray(p.sensors)||p.sensors.length<1||p.sensors.length>4)fail('invalid sensors array');
  p.sensors=p.sensors.map((x,idx)=>{
   const parsed=sample(x,p.sentUptimeMs);
   if(parsed.sensorId===undefined){parsed.sensorId=idx+1;parsed.sensorName=sensorLabel(idx+1);}
   return parsed;
  });
 }
 p.wan=wanStatus(p.wan);p.line=lineStatus(p.line);
 p.events=p.events.map(e=>{
  if(!e||!BOOT.test(e.bootId)||!int(e.seq,1)||!int(e.uptimeMs)||!TYPES.has(e.type)||!(e.epochMs===null||int(e.epochMs,1735689600000,now+300000)))fail('invalid event');
  if(e.bootId===p.bootId&&e.uptimeMs>p.sentUptimeMs)fail('future uptime');
  e.sample=sample(e.sample,e.uptimeMs);
  if(e.type==='alarm'&&(!e.sample.valid||!e.sample.calibrated||e.sample.state!=='alarm'))fail('invalid alarm');
  if(e.type==='calibration'&&(!e.sample.valid||!e.sample.calibrated))fail('invalid calibration');
  const out={bootId:e.bootId,seq:e.seq,type:e.type,uptimeMs:e.uptimeMs,epochMs:e.epochMs,sample:e.sample};
  const sid=e.sensorId!==undefined?e.sensorId:e.sample.sensorId;
  if(sid!==undefined){
   if(!int(sid,0,4))fail('invalid event sensorId');
   out.sensorId=sid;
   out.sensorName=typeof e.sensorName==='string'&&e.sensorName.length<=32?e.sensorName:sensorLabel(sid);
  }
  return out;
 });
 const unique=new Map();
 for(const e of p.events){const key=eventId(id,e),prior=unique.get(key);if(prior&&JSON.stringify(prior)!==JSON.stringify(e))fail('event identity conflict',409);unique.set(key,e);}
 p.events=[...unique.values()];
 return p;
}
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const all=async(db,sql,...args)=>(await stmt(db,sql,...args).all()).results;
const first=(db,sql,...args)=>stmt(db,sql,...args).first();
function eventId(id,e){return `${id}:${e.bootId}:${e.seq}`;}
function csvCell(v){let s=v===null||v===undefined?'':String(v);if(typeof v==='string'&&/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export async function dispatch(env,{now=()=>Date.now(),fetcher=fetch}={},onlyDevice){
 if(!env.DB)return {processed:0};let processed=0;
 const rows=await all(env.DB,`SELECT o.*,e.type,e.payload,e.historical,e.uptime_ms,e.received_ms FROM outbox o JOIN events e ON e.id=o.event_id WHERE o.state IN ('pending','retry','not_configured','sending') AND o.next_ms<=? AND o.lease_ms<=? ${onlyDevice?'AND o.device_id=?':''} ORDER BY o.next_ms,e.received_ms LIMIT 1`,now(),now(),...(onlyDevice?[onlyDevice]:[]));
 for(const row of rows){
  const cfg=configs(env).find(x=>x.id===row.device_id);
  if(!cfg)continue;
  if(cfg.notificationOwner==='device'){await stmt(env.DB,"UPDATE outbox SET state='device_owned',detail='device owns LINE; phone receipt unknown' WHERE event_id=?",row.event_id).run();continue;}
  if(cfg.simulation){await stmt(env.DB,"UPDATE outbox SET state='simulation_skipped',detail='test device; no LINE call' WHERE event_id=?",row.event_id).run();continue;}
  if(row.attempts>=5){await stmt(env.DB,"UPDATE outbox SET state='failed',detail='maximum notification attempts reached' WHERE event_id=? AND lease_ms<=? AND attempts>=5 AND state IN ('pending','retry','not_configured','sending')",row.event_id,now()).run();continue;}
  if(now()-row.received_ms>600000){await stmt(env.DB,"UPDATE outbox SET state='expired',detail='notification queue TTL exceeded' WHERE event_id=?",row.event_id).run();continue;}
  if(!env.LINE_CHANNEL_ACCESS_TOKEN||!/^U[a-fA-F0-9]{32}$/.test(cfg.lineTo||'')){
   await stmt(env.DB,"UPDATE outbox SET state='not_configured',detail='backend LINE settings required',next_ms=? WHERE event_id=?",now()+15000,row.event_id).run();continue;
  }
  const lease=await stmt(env.DB,"UPDATE outbox SET state='sending',lease_ms=?,attempts=attempts+1 WHERE event_id=? AND lease_ms<=? AND attempts<5 AND state IN ('pending','retry','not_configured','sending') RETURNING attempts",now()+60000,row.event_id,now()).first();
  if(!lease)continue;processed++;
  let code=0,accepted=false,retry=false;
  try{
   const event=JSON.parse(row.payload);
   const sid=event.sensorId??event.sample?.sensorId;
   const sTag=sid?`【${event.sensorName||sensorLabel(sid)}】`:'';
   const text=`CargoAlert ${sTag}${row.type==='test_notification'?'測試通知':'貨物束帶鬆脫警報'}\n裝置：${cfg.name||cfg.id}${sid?`\n感知器：${event.sensorName||sensorLabel(sid)}（Sensor #${sid}）`:''}\n${row.historical||now()-row.received_ms>60000?'歷史／延遲補傳事件，非目前狀態\n':''}相對角度：${event.sample.delta===null?'未知':event.sample.delta+'°'}\n事件：${row.event_id}\n請檢查貨物固定狀態。`;
   const r=await fetcher('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{Authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,'Content-Type':'application/json','X-Line-Retry-Key':row.retry_key},body:JSON.stringify({to:cfg.lineTo,messages:[{type:'text',text}]}),redirect:'error',signal:AbortSignal.timeout(8000)});
   code=r.status;accepted=code===200||(code===409&&!!r.headers.get('x-line-accepted-request-id'));retry=code===429||code>=500;
   await r.body?.cancel();
  }catch{retry=true;}
  const state=accepted?'accepted':retry&&lease.attempts<5?'retry':'failed';
  await stmt(env.DB,'UPDATE outbox SET state=?,http=?,accepted_ms=?,lease_ms=0,next_ms=?,detail=? WHERE event_id=?',state,code,accepted?now():null,now()+Math.min(300000,5000*2**(lease.attempts-1)),accepted?'API accepted; phone receipt unknown':state==='retry'?'transport/server retry scheduled':'request failed; check backend settings',row.event_id).run();
 }
 return {processed};
}
export async function api(request,env,ctx={},deps={}){
 const now=deps.now||(()=>Date.now());
 try{
  const url=new URL(request.url),path=url.pathname;
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)fail('origin forbidden',403);
  if(path==='/api/v1/health'){
   let storageReady=false;try{storageReady=!!env.DB&&!!await first(env.DB,"SELECT name FROM sqlite_master WHERE type='table' AND name='outbox'");}catch{}
   const list=configs(env),owners=[...new Set(list.map(x=>x.notificationOwner||'backend'))];
   return json({service:'CargoAlert',api:1,dualSensor:true,storageReady,deviceConfigurationReady:list.length>0,notificationOwner:owners.length===1?owners[0]:owners.length?owners.join('+'):'backend'},storageReady?200:503);
  }
  if(!env.DB)fail('storage unavailable',503);
  const route=/^\/api\/v1\/devices\/([a-zA-Z0-9_-]{1,48})\/(session|reports|status|events|trend|events\.csv|metrics|dispatch|line-test|recalibrate|commands|command-ack)$/.exec(path);
  if(!route)fail('not found',404);
  const [,id,action]=route,write=['session','reports','dispatch','line-test','recalibrate','command-ack'].includes(action);
  const authKind=action==='line-test'?'control':action==='recalibrate'?'recalibrate':write?'write':'read';
  const cfg=await auth(request,env,id,authKind);
  if((write&&request.method!=='POST')||(!write&&request.method!=='GET'))fail('method not allowed',405);
  if(action==='line-test'||action==='recalibrate'||action==='commands'||action==='command-ack')return await remoteCommand(request,env,cfg,id,action,now,deps,ctx);
  if(action==='session'){
   const p=await body(request);if(!p||!BOOT.test(p.bootId)||typeof p.firmware!=='string'||p.firmware.length>48)fail('invalid boot');
   if(p.notificationOwner && p.notificationOwner!==(cfg.notificationOwner||'backend'))fail('notification owner mismatch',409);
   await stmt(env.DB,'INSERT OR IGNORE INTO sessions(device_id,boot_id,created_ms) VALUES(?,?,?)',id,p.bootId,now()).run();
   const s=await first(env.DB,'SELECT generation FROM sessions WHERE device_id=? AND boot_id=?',id,p.bootId);
   const d=await first(env.DB,'SELECT active_gen FROM devices WHERE device_id=?',id);
   if(d&&d.active_gen>s.generation)fail('stale boot session',409);
   await stmt(env.DB,'INSERT INTO devices(device_id,active_gen,boot_id) VALUES(?,?,?) ON CONFLICT(device_id) DO UPDATE SET active_gen=excluded.active_gen,boot_id=excluded.boot_id,seq=-1,snapshot=NULL,received_ms=NULL WHERE excluded.active_gen>devices.active_gen',id,s.generation,p.bootId).run();
   return json({generation:s.generation,notificationOwner:cfg.notificationOwner||'backend'});
  }
  if(action==='reports'){
   const p=validateReport(await body(request),id,cfg,now());
   if(cfg.notificationOwner==='device'&&p.notificationOwner!=='device')fail('notification owner mismatch',409);
   const d=await first(env.DB,'SELECT active_gen,boot_id FROM devices WHERE device_id=?',id);
   if(!d||d.active_gen!==p.sessionGeneration||d.boot_id!==p.bootId)fail('inactive boot session',409);
   const received=now(),age=p.sentUptimeMs-p.sample.uptimeMs;
   const snapshot={...p.sample,sensorCount:p.sensors?p.sensors.length:1,...(p.sensors?{sensors:p.sensors}:{}),seq:p.seq,bootId:p.bootId,firmware:p.firmware,sampleAgeMs:age,simulation:p.simulation,deviceStats:p.stats||{},networkMode:p.networkMode==='4G'?'4G':p.networkMode==='Wi-Fi'?'Wi-Fi':'unknown',remoteLineTest:p.remoteLineTest===1,notificationOwner:p.notificationOwner||cfg.notificationOwner||'backend',wan:p.wan,line:p.line};
   const identityGuard=p.events.length?'NOT EXISTS (SELECT 1 FROM events WHERE '+p.events.map(()=>'(id=? AND payload<>?)').join(' OR ')+')':'1';
   const guard='EXISTS (SELECT 1 FROM devices WHERE device_id=? AND active_gen=? AND boot_id=?) AND '+identityGuard;
   const guardArgs=[id,p.sessionGeneration,p.bootId,...p.events.flatMap(e=>[eventId(id,e),JSON.stringify(e)])];
   const batch=[stmt(env.DB,'INSERT OR IGNORE INTO reports(device_id,boot_id,seq,received_ms,payload) SELECT ?,?,?,?,? WHERE '+guard,id,p.bootId,p.seq,received,JSON.stringify(snapshot),...guardArgs),stmt(env.DB,'UPDATE devices SET seq=?,snapshot=?,received_ms=? WHERE device_id=? AND active_gen=? AND seq<? AND '+guard,p.seq,JSON.stringify(snapshot),received,id,p.sessionGeneration,p.seq,...guardArgs)];
   for(const e of p.events){
    const key=eventId(id,e),old=await first(env.DB,'SELECT payload FROM events WHERE id=?',key),payload=JSON.stringify(e);
    if(old&&old.payload!==payload)fail('event identity conflict',409);
    const historical=e.bootId!==p.bootId||p.sentUptimeMs-e.uptimeMs>60000;
    batch.push(stmt(env.DB,'INSERT OR IGNORE INTO events(id,device_id,boot_id,seq,type,occurred_epoch_ms,uptime_ms,received_ms,historical,payload) SELECT ?,?,?,?,?,?,?,?,?,? WHERE '+guard,key,id,e.bootId,e.seq,e.type,e.epochMs,e.uptimeMs,received,historical?1:0,payload,...guardArgs));
    if(cfg.notificationOwner!=='device'&&['alarm','test_notification'].includes(e.type)){
     const expired=e.bootId!==p.bootId||p.sentUptimeMs-e.uptimeMs>600000;
     batch.push(stmt(env.DB,'INSERT OR IGNORE INTO outbox(event_id,device_id,retry_key,state,detail) SELECT ?,?,?,?,? FROM events WHERE id=? AND payload=? AND '+guard,key,id,crypto.randomUUID(),expired?'expired':'pending',expired?'historical event older than notification TTL':null,key,payload,...guardArgs));
    }
   }
   await env.DB.batch(batch);
   const active=await first(env.DB,'SELECT active_gen,boot_id FROM devices WHERE device_id=?',id);
   if(!active||active.active_gen!==p.sessionGeneration||active.boot_id!==p.bootId)fail('inactive boot session',409);
   for(const e of p.events){const stored=await first(env.DB,'SELECT payload FROM events WHERE id=?',eventId(id,e));if(!stored||stored.payload!==JSON.stringify(e))fail('event identity conflict',409);}
   const job=dispatch(env,{now,fetcher:deps.fetcher||fetch},id);
   if(ctx.waitUntil)ctx.waitUntil(job);else await job;
   return json({ok:true,ack:p.events.map(e=>({bootId:e.bootId,seq:e.seq})),notificationOwner:cfg.notificationOwner||'backend',command:await pendingCommand(env.DB,id,p.bootId,p.sessionGeneration,now(),cfg.notificationOwner||'backend')});
  }
  if(action==='dispatch')return json(await dispatch(env,{now,fetcher:deps.fetcher||fetch},id));
  if(action==='status'){
   const d=await first(env.DB,'SELECT * FROM devices WHERE device_id=?',id),s=d?.snapshot?JSON.parse(d.snapshot):null;
   const staleSeconds=Number(env.STALE_SECONDS)||60;
   const stale=!s||now()-d.received_ms>staleSeconds*1000||s.sampleAgeMs+now()-d.received_ms>staleSeconds*1000;
   return json({deviceId:id,name:cfg.name||id,simulation:!!cfg.simulation,snapshot:s,receivedMs:d?.received_ms??null,deviceReportedAt:d?.received_ms??null,deviceDataAgeMs:d?.received_ms==null?null:Math.max(0,now()-d.received_ms),serverMs:now(),staleSeconds,stale,displayState:stale?'stale':s.state,phoneDelivery:'unknown',notificationOwner:cfg.notificationOwner||'backend',remoteControlEnabled:cfg.notificationOwner!=='device'&&!!controlHash(env,id)});
  }
  if(action==='events'||action==='events.csv'){
   const limit=Math.min(1000,Math.max(1,Math.trunc(Number(url.searchParams.get('limit')))||100));
   const rows=await all(env.DB,'SELECT e.id,e.boot_id,e.seq,e.type,e.occurred_epoch_ms,e.uptime_ms,e.received_ms,e.historical,e.payload,o.state AS line_state,o.http,o.attempts,o.accepted_ms FROM events e LEFT JOIN outbox o ON o.event_id=e.id WHERE e.device_id=? ORDER BY e.received_ms DESC,e.id DESC LIMIT ?',id,limit);
   if(action==='events')return json({events:rows,limit,phoneDelivery:'unknown',notificationOwner:cfg.notificationOwner||'backend'});
   const cols=['device_id','simulation','id','sensor_id','sensor_name','type','occurred_epoch_ms','uptime_ms','received_ms','historical','delta_deg','sensor_valid','calibrated','state','fault','line_state','http','attempts','accepted_ms'];
   const csvRows=rows.map(r=>{const p=JSON.parse(r.payload),s=p.sample,sid=p.sensorId??s.sensorId??'';return {...r,device_id:id,simulation:!!cfg.simulation,sensor_id:sid,sensor_name:p.sensorName??s.sensorName??(sid!==''?sensorLabel(sid):''),delta_deg:s.delta,sensor_valid:s.valid,calibrated:s.calibrated,state:s.state,fault:s.fault};});
   return new Response('\ufeff'+[cols.map(csvCell).join(','),...csvRows.map(r=>cols.map(c=>csvCell(r[c])).join(','))].join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="CargoAlert-events.csv"','Cache-Control':'no-store'}});
  }
  if(action==='trend'){
   const rows=await all(env.DB,'SELECT received_ms,payload FROM reports WHERE device_id=? ORDER BY received_ms DESC LIMIT 240',id);
   return json({points:rows.reverse().map(r=>({receivedMs:r.received_ms,...JSON.parse(r.payload)})),limit:240});
  }
  if(action==='metrics'){
   const counts=await all(env.DB,'SELECT state,COUNT(*) AS count FROM outbox WHERE device_id=? GROUP BY state',id);
   const reports=await first(env.DB,'SELECT COUNT(*) AS count FROM reports WHERE device_id=?',id);
   return json({notification:counts,uniqueReports:reports.count,phoneDelivery:'unknown'});
  }
 }catch(e){return json({error:e.status?e.message:'internal error'},e.status||500);}
}

const COMMAND_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function controlHash(env,id){try{const x=JSON.parse(env.CARGO_CONTROL_HASHES_JSON||'[]');return Array.isArray(x)?x.find(v=>v.id===id)?.controlHash:undefined;}catch{return undefined;}}
async function expireCommands(db,id,now){
 await stmt(db,"UPDATE remote_commands SET state='expired' WHERE device_id=? AND state='queued' AND expires_ms<=?",id,now).run();
 await stmt(db,"UPDATE remote_commands SET state='cancelled' WHERE device_id=? AND state='queued' AND EXISTS(SELECT 1 FROM devices d WHERE d.device_id=? AND (d.boot_id<>remote_commands.boot_id OR d.active_gen<>remote_commands.session_gen))",id,id).run();
}
async function pendingCommand(db,id,boot,generation,now,notificationOwner='backend'){
 await expireCommands(db,id,now);
 const d=await first(db,'SELECT snapshot FROM devices WHERE device_id=? AND boot_id=? AND active_gen=?',id,boot,generation);
 const s=d?.snapshot?JSON.parse(d.snapshot):null;
 const x=await first(db,"SELECT id,expires_ms,event_id FROM remote_commands WHERE device_id=? AND boot_id=? AND session_gen=? AND state='queued' AND expires_ms>? ORDER BY requested_ms LIMIT 1",id,boot,generation,now);
 if(!x)return null;
 if(typeof x.event_id==='string'&&x.event_id.startsWith('cmd:recalibrate:')){
  const target=x.event_id.slice('cmd:recalibrate:'.length)||'all';
  return {id:x.id,type:'recalibrate',target,expiresMs:x.expires_ms};
 }
 if(notificationOwner==='device'||!s?.remoteLineTest||s.networkMode!=='4G')return null;
 return {id:x.id,type:'line_test',expiresMs:x.expires_ms};
}
async function remoteCommand(request,env,cfg,id,action,now,deps,ctx){
 if(cfg.notificationOwner==='device'&&action==='line-test')fail('device owns notifications; use local t test',409);
 const clock=now();await expireCommands(env.DB,id,clock);
 if(action==='commands'){
  const rows=await all(env.DB,'SELECT c.id,c.requested_ms,c.expires_ms,c.state,c.event_id,o.state AS line_state,o.http FROM remote_commands c LEFT JOIN outbox o ON o.event_id=c.event_id WHERE c.device_id=? ORDER BY c.requested_ms DESC,c.id DESC LIMIT 10',id);
  const commands=rows.map(r=>{
   const isRecal=typeof r.event_id==='string'&&(r.event_id.startsWith('cmd:recalibrate:')||r.event_id.startsWith('res:recalibrate:'));
   let type='line_test',target='all',result=null;
   if(isRecal){
    type='recalibrate';
    const parts=r.event_id.split(':');
    target=parts[2]||'all';
    if(parts[0]==='res')result=parts[3]||null;
   }
   return {...r,type,target,result};
  });
  return json({commands,phoneDelivery:'unknown'});
 }
 const p=await body(request);
 if(action==='recalibrate'){
  const target=p?.target==='1'?'1':p?.target==='2'?'2':'all';
  if(!p||!COMMAND_UUID.test(p.requestId))fail('invalid recalibrate request');
  const old=await first(env.DB,'SELECT * FROM remote_commands WHERE id=? AND device_id=?',p.requestId,id);
  if(old)return json({ok:true,id:old.id,type:'recalibrate',target,state:old.state,expiresMs:old.expires_ms,duplicate:true});
  const d=await first(env.DB,'SELECT * FROM devices WHERE device_id=?',id),s=d?.snapshot?JSON.parse(d.snapshot):null;
  if(!s||clock-d.received_ms>60000||s.sampleAgeMs+clock-d.received_ms>60000)fail('裝置目前離線或資料過期，無法送出遠端重設基準命令',409);
  const marker=`cmd:recalibrate:${target}`;
  await stmt(env.DB,`INSERT OR IGNORE INTO remote_commands(id,device_id,boot_id,session_gen,requested_ms,expires_ms,event_id)
   SELECT ?,d.device_id,d.boot_id,d.active_gen,?,?,? FROM devices d
   WHERE d.device_id=? AND d.boot_id=? AND d.active_gen=? AND d.received_ms>?
   AND NOT EXISTS(SELECT 1 FROM remote_commands WHERE device_id=? AND state='queued' AND expires_ms>? AND event_id LIKE 'cmd:recalibrate:%')`,
   p.requestId,clock,clock+60000,marker,id,d.boot_id,d.active_gen,clock-60000,id,clock).run();
  const row=await first(env.DB,'SELECT * FROM remote_commands WHERE id=? AND device_id=?',p.requestId,id);
  if(!row)fail('已有進行中的基準重設命令，請稍候再試',429);
  return json({ok:true,id:row.id,type:'recalibrate',target,state:row.state,expiresMs:row.expires_ms,simulation:!!cfg.simulation});
 }
 if(action==='line-test'){
  if(!p||!COMMAND_UUID.test(p.requestId)||Object.keys(p).some(k=>k!=='requestId'))fail('only fixed LINE test is supported');
  const old=await first(env.DB,'SELECT * FROM remote_commands WHERE id=? AND device_id=?',p.requestId,id);
  if(old)return json({ok:true,id:old.id,state:old.state,expiresMs:old.expires_ms,duplicate:true});
  const d=await first(env.DB,'SELECT * FROM devices WHERE device_id=?',id),s=d?.snapshot?JSON.parse(d.snapshot):null;
  if(!s||clock-d.received_ms>60000||s.sampleAgeMs+clock-d.received_ms>60000)fail('device offline or stale; no command queued',409);
  if(!s.remoteLineTest)fail('firmware upgrade required for remote LINE test',409);
  if(s.networkMode!=='4G')fail('device must report through 4G',409);
  await stmt(env.DB,`INSERT OR IGNORE INTO remote_commands(id,device_id,boot_id,session_gen,requested_ms,expires_ms)
   SELECT ?,d.device_id,d.boot_id,d.active_gen,?,? FROM devices d
   WHERE d.device_id=? AND d.boot_id=? AND d.active_gen=? AND d.received_ms>?
   AND json_extract(d.snapshot,'$.sampleAgeMs')+?-d.received_ms<=60000
   AND json_extract(d.snapshot,'$.networkMode')='4G' AND json_extract(d.snapshot,'$.remoteLineTest')=1
   AND NOT EXISTS(SELECT 1 FROM remote_commands WHERE device_id=? AND (requested_ms>? OR (state='queued' AND expires_ms>?)))`,p.requestId,clock,clock+120000,id,d.boot_id,d.active_gen,clock-60000,clock,id,clock-60000,clock).run();
  const row=await first(env.DB,'SELECT * FROM remote_commands WHERE id=? AND device_id=?',p.requestId,id);
  if(!row)fail('test cooldown or device state changed; retry later',429);
  return json({ok:true,id:row.id,state:row.state,expiresMs:row.expires_ms,simulation:!!cfg.simulation});
 }
 if(!p||!COMMAND_UUID.test(p.id)||!BOOT.test(p.bootId)||!int(p.sessionGeneration,1)||!int(p.uptimeMs))fail('invalid command acknowledgement');
 const command=await first(env.DB,'SELECT * FROM remote_commands WHERE id=? AND device_id=?',p.id,id);
 if(!command)fail('command not found',404);
 const isRecal=typeof command.event_id==='string'&&(command.event_id.startsWith('cmd:recalibrate:')||command.event_id.startsWith('res:recalibrate:'));
 if(isRecal){
  if(command.state==='executed'||command.state==='failed')return json({ok:true,state:command.state,duplicate:true});
  if(command.state!=='queued'||command.expires_ms<=clock)fail('command expired or cancelled',409);
  const d=await first(env.DB,'SELECT * FROM devices WHERE device_id=?',id);
  if(!d||d.boot_id!==p.bootId||d.active_gen!==p.sessionGeneration||command.boot_id!==p.bootId||command.session_gen!==p.sessionGeneration)fail('inactive boot session',409);
  const target=command.event_id.split(':')[2]||'all';
  const result=typeof p.result==='string'&&/^[A-Za-z0-9_-]{1,16}$/.test(p.result)?p.result:'OK';
  const nextState=result==='OK'?'executed':'failed';
  await stmt(env.DB,'UPDATE remote_commands SET state=?,event_id=? WHERE id=? AND device_id=? AND state=\'queued\'',nextState,`res:recalibrate:${target}:${result}`,p.id,id).run();
  return json({ok:true,type:'recalibrate',target,state:nextState,result});
 }
 if(cfg.notificationOwner==='device')fail('device owns notifications; use local t test',409);
 if(p.networkMode!=='4G')fail('invalid 4G command acknowledgement');
 if(command.state==='executed')return json({ok:true,state:'executed',duplicate:true});
 if(command.state!=='queued'||command.expires_ms<=clock)fail('command expired or cancelled',409);
 const d=await first(env.DB,'SELECT * FROM devices WHERE device_id=?',id),s=d?.snapshot?JSON.parse(d.snapshot):null;
 if(!d||d.boot_id!==p.bootId||d.active_gen!==p.sessionGeneration||command.boot_id!==p.bootId||command.session_gen!==p.sessionGeneration||!s?.remoteLineTest||s.networkMode!=='4G'||p.uptimeMs<s.uptimeMs)fail('inactive boot or non-4G acknowledgement',409);
 const eventId='remote:'+p.id;
 const event={bootId:p.bootId,seq:0,type:'test_notification',uptimeMs:p.uptimeMs,epochMs:null,sample:s,origin:'web-via-4g',commandId:p.id};
 const guard="EXISTS(SELECT 1 FROM remote_commands c JOIN devices d ON d.device_id=c.device_id WHERE c.id=? AND c.device_id=? AND c.state='executed' AND c.expires_ms>? AND d.active_gen=c.session_gen AND d.boot_id=c.boot_id)";
 const args=[p.id,id,clock];
 await env.DB.batch([
  stmt(env.DB,"UPDATE remote_commands SET state='executed',event_id=? WHERE id=? AND device_id=? AND state='queued' AND expires_ms>? AND EXISTS(SELECT 1 FROM devices WHERE device_id=? AND boot_id=? AND active_gen=? AND json_extract(snapshot,'$.networkMode')='4G')",eventId,p.id,id,clock,id,p.bootId,p.sessionGeneration),
  stmt(env.DB,'INSERT OR IGNORE INTO events(id,device_id,boot_id,seq,type,occurred_epoch_ms,uptime_ms,received_ms,historical,payload) SELECT ?,?,?,0,?,NULL,?,?,0,? WHERE '+guard,eventId,id,p.bootId,'test_notification',p.uptimeMs,clock,JSON.stringify(event),...args),
  stmt(env.DB,"INSERT OR IGNORE INTO outbox(event_id,device_id,retry_key) SELECT ?,?,? FROM events WHERE id=? AND "+guard,eventId,id,crypto.randomUUID(),eventId,...args)
 ]);
 const stored=await first(env.DB,'SELECT id FROM events WHERE id=?',eventId);
 if(!stored)fail('command state changed before acknowledgement',409);
 const job=dispatch(env,{now,fetcher:deps.fetcher||fetch},id);if(ctx.waitUntil)ctx.waitUntil(job);else await job;
 return json({ok:true,state:'executed',phoneDelivery:'unknown'});
}

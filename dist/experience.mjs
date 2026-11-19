import {isFresh,STATES,FAULTS,pruneEvents} from './protocol.mjs';
export const EVENT_TYPES=Object.freeze({connection:'連線',calibration:'校正',alarm:'警示',sensor:'感測異常',status:'狀態',notification:'本頁提醒',system:'系統',legacy:'舊紀錄'});
export function eventType(text){
  if(/本頁|系統通知|提示音/.test(text))return 'notification';
  if(/校正/.test(text))return 'calibration';
  if(/感測器錯誤|磁場|磁鐵|無效資料|I²C/.test(text))return 'sensor';
  if(/警報|注意|超標/.test(text))return 'alarm';
  if(/連接|連線|藍牙|取消選擇/.test(text))return 'connection';
  if(/正常|尚未校正|資料過期/.test(text))return 'status';
  return 'system';
}
export function normalizeEvents(events,now){
  return pruneEvents(Array.isArray(events)?events.filter(e=>e&&typeof e==='object'):[],now).map(e=>({
    at:e.at,text:e.text,type:EVENT_TYPES[e.type]?e.type:'legacy',
    angle:typeof e.angle==='number'&&Number.isFinite(e.angle)&&Math.abs(e.angle)<=180?e.angle:null,
    state:STATES[e.state]?e.state:null
  }));
}
export function eventsCSV(events){
  const cell=(value,numeric=false)=>{
    let s=String(value??'');if(!numeric&&/^[\s]*[=+@-]/.test(s))s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  };
  const rows=[['時間（ISO 8601）','類型','角度變化（°）','裝置狀態','事件內容'].map(x=>cell(x)).join(',')];
  for(const e of events)rows.push([cell(new Date(e.at).toISOString()),cell(EVENT_TYPES[e.type]||'舊紀錄'),cell(e.angle===null?'':e.angle,true),cell(STATES[e.state]||''),cell(e.text)].join(','));
  return '\uFEFF'+rows.join('\r\n')+'\r\n';
}
export function monitorView({connected,busy,status,last,now,suspended,invalid}){
  const fresh=connected&&!suspended&&!!status&&isFresh(last,now);
  if(busy)return {label:'正在連接',state:'offline',detail:'請在藍牙選單選擇 CargoAlert。',action:'等待連接完成，請勿重複點擊。',fresh:false};
  if(!connected)return {label:'未連線',state:'offline',detail:'',action:'先開啟裝置電源，再按「連接裝置」。',fresh:false};
  if(invalid)return {label:'感測異常',state:'E',detail:'收到無效資料，暫停顯示角度。',action:'確認裝置韌體與連線；持續異常時重新連接。',fresh:false};
  if(last>0&&!fresh)return {label:'資料過期',state:'offline',detail:'目前無法確認束帶狀態。',action:'保持本頁開啟；仍未更新時請重新連接。',fresh:false};
  if(!fresh)return {label:'等待資料',state:'offline',detail:'尚未收到有效感測資料。',action:'等待裝置回報；確認裝置電源及藍牙連線。',fresh:false};
  if(status.fault)return {label:'感測異常',state:'E',detail:FAULTS[status.fault]+'；角度無效。',action:status.calibrated?'原基準保留。恢復磁鐵與接線後自動繼續，不必重新校正。':'先恢復磁鐵與接線，再拉緊束帶完成首次校正。',fresh:true};
  if(!status.calibrated)return {label:'待校正',state:'U',detail:'',action:'拉緊束帶並長按裝置按鈕 1 秒。',fresh:true};
  const actions={U:'拉緊束帶並長按裝置按鈕 1 秒。',N:'維持固定，持續觀察。',W:'請檢查束帶是否鬆動。',T:'正在確認持續時間，請留意束帶。',A:'請立即檢查束帶與貨物固定狀態。'};
  return {label:status.state==='U'?'待校正':STATES[status.state],state:status.state,detail:'',action:actions[status.state],fresh:true};
}
export function calibrationReason({connected,busy,control,status,fresh,pending,gateUntil,now,checked}){
  if(busy)return '正在連接，請等待完成。';
  if(!connected)return '尚未連線，請先連接裝置。';
  if(!control)return '此韌體不支援網站校正，請使用實體按鈕。';
  if(pending)return '等待裝置回覆，請勿重複送出。';
  if(!fresh||!status)return '沒有有效即時資料，請等待更新或重新連接。';
  if(status.fault)return '感測異常：'+FAULTS[status.fault]+'，請先排除問題。';
  if(gateUntil<=now)return '未取得授權或授權已到期，請長按裝置按鈕。';
  if(!checked)return '請先勾選「已確認束帶拉緊」。';
  return '';
}

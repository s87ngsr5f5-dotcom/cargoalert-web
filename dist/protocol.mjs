export const UUID = Object.freeze({
  service: '9d540001-7a44-4f43-8f39-b3bd42a14001',
  status:  '9d540002-7a44-4f43-8f39-b3bd42a14001',
  command: '9d540003-7a44-4f43-8f39-b3bd42a14001',
  reply:   '9d540004-7a44-4f43-8f39-b3bd42a14001',
  gate:    '9d540005-7a44-4f43-8f39-b3bd42a14001',
  sensor1: '9d540006-7a44-4f43-8f39-b3bd42a14001',
  sensor2: '9d540007-7a44-4f43-8f39-b3bd42a14001',
});
export const STATES = Object.freeze({N:'正常',W:'注意',T:'超標確認中',A:'鬆脫警報',E:'感測異常',U:'尚未校正'});
export const FAULTS = Object.freeze({0:'無感測錯誤',1:'I²C 通訊失敗',2:'未偵測到磁鐵',3:'磁場過弱',4:'磁場過強',5:'磁場狀態異常（過強／過弱同時成立）'});
export function parseStatus(text) {
  const m=/^([NWTAEU]),(NA|[+-]\d{1,3}\.\d),F([0-5]),C([01])$/.exec(text);
  if(!m) throw new Error('無法辨識裝置資料，請核對韌體版本。');
  const angle=m[2]==='NA'?null:Number(m[2]), fault=Number(m[3]), calibrated=m[4]==='1', state=m[1];
  if(angle!==null && (angle < -180 || angle > 180 || fault!==0 || !calibrated)) throw new Error('角度封包不一致。');
  if(['N','W','T'].includes(state) && (!calibrated || fault!==0 || angle===null)) throw new Error('狀態封包不一致。');
  if((state==='U' && calibrated) || (state==='E' && fault===0)) throw new Error('狀態封包不一致。');
  return {state,angle,fault,calibrated};
}
export function parseReply(text) {
  const m=/^(0|[1-9]\d{0,3}),(OK|LOCKED|BAD|OVERRIDE|E[1-5]|S[12]E[1-5])$/.exec(text);
  return m?{id:Number(m[1]),result:m[2]}:null;
}
export function parseGate(text) {
  const m=/^G,(\d{1,2})$/.exec(text);
  return m && Number(m[1])<=30?Number(m[1]):0;
}
export function isFresh(last,now) { return last>0 && now-last<3500; }
export function pruneEvents(events,now) {
  return events.filter(e=>typeof e.at==='number' && now-e.at>=0 && now-e.at<7*86400000 && typeof e.text==='string').slice(0,100);
}
export function canCalibrate({connected,pending,control,status,last,now}) {
  return !!(connected && !pending && control && status && isFresh(last,now));
}

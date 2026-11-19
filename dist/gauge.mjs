export function gaugePosition(angle){
  if(typeof angle!=='number'||!Number.isFinite(angle)||Math.abs(angle)>180)return null;
  return {magnitude:Math.abs(angle),rotation:Math.min(Math.abs(angle),30)*6,overflow:Math.abs(angle)>30};
}
export function renderGauge(status,fresh){
  const $=id=>document.getElementById(id);
  const position=fresh&&status?.fault===0&&status.calibrated?gaugePosition(status.angle):null;
  $('angleGauge').dataset.valid=String(!!position);
  $('gaugeNeedle').hidden=!position;
  // SVG does not consistently apply the HTML hidden property.
  $('gaugeNeedle').setAttribute('visibility',position?'visible':'hidden');
  $('angleGauge').setAttribute('aria-label',position?`角度變化絕對值 ${position.magnitude.toFixed(1)} 度；刻度顯示至 30 度（6 度為警報門檻），數字保留完整角度`:'尚無有效即時角度，指針停用');
  if(position)$('gaugeNeedle').setAttribute('transform',`rotate(${position.rotation} 160 160)`);
  $('magnitude').textContent=position?`${position.magnitude.toFixed(1)}°`:'—';
  $('direction').textContent=position?(status.angle>0?'正方向':status.angle<0?'負方向':'位於基準'):'等待有效角度';
  $('gaugeNote').textContent=position?.overflow?'超過刻度範圍（>30°）；以數字為準':'刻度 0–30° · 達 6° 持續 800 ms 觸發警報';
  const actions={N:'保持固定，持續觀察。',W:'已達 6° 門檻，請檢查束帶是否鬆動。',T:'已達 6° 門檻，正在確認 800 ms 持續時間。',A:'已確認鬆脫警報（≥6°），請立即檢查束帶與貨物固定狀態。',U:'先拉緊束帶，再設定正常基準。',E:'先排除感測錯誤，再進行校正。'};
  $('nextAction').textContent=fresh&&status?actions[status.state]: '連接裝置後，查看即時角度與狀態。';
}

import {AlarmEpisode} from './alert-policy.mjs';
const $=id=>document.getElementById(id);
export function createAlerts(record){
  const episode=new AlarmEpisode();let audio=null,nodes=[],sound=false,system=false,registration=null,enabling=false,enablingSound=false,testing=false;
  const support=()=>isSecureContext&&typeof Notification!=='undefined'&&typeof Notification.requestPermission==='function'&&'serviceWorker' in navigator&&typeof ServiceWorkerRegistration!=='undefined'&&'showNotification' in ServiceWorkerRegistration.prototype;
  function render(){
    $('soundToggle').textContent=sound?'關閉提示音':'啟用提示音';$('soundToggle').setAttribute('aria-pressed',String(sound));
    $('soundStatus').textContent=sound?(audio?.state==='running'?'已啟用 · 本次開啟有效':'聲音暫停 · 請關閉後重新啟用'):'未啟用 · 需先按按鈕允許播放';
    const supported=support(),denied=supported&&Notification.permission==='denied';
    if(supported&&Notification.permission!=='granted')system=false;
    $('notificationToggle').disabled=!supported||denied||enabling;
    $('notificationToggle').textContent=enabling?'正在啟用…':system?'關閉系統通知':'啟用系統通知';$('notificationToggle').setAttribute('aria-pressed',String(system));
    $('notificationStatus').textContent=!supported?'此瀏覽器不支援 · 可使用頁內橫幅':denied?'已被封鎖 · 請到瀏覽器網站設定開啟':system?'已啟用 · 仍需本頁取得 BLE 警報':'未啟用 · 按下後由瀏覽器詢問權限';
    $('soundToggle').disabled=enablingSound||!('AudioContext' in window||'webkitAudioContext' in window);
    if(!('AudioContext' in window||'webkitAudioContext' in window))$('soundStatus').textContent='此瀏覽器不支援提示音';
  }
  function stopSound(){for(const n of nodes){try{n.stop();n.disconnect();}catch{}}nodes=[];}
  function play(){
    if(!sound)return '未啟用，未測試';
    if(!audio||audio.state!=='running'){$('soundStatus').textContent='提示音未播放 · 瀏覽器暫停聲音，請重新啟用';return '未播放：瀏覽器暫停聲音，請重新啟用';}
    stopSound();
    try{for(let i=0;i<3;i++){const start=audio.currentTime+i*.32,o=audio.createOscillator(),gain=audio.createGain();o.type='sine';o.frequency.value=880;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.12,start+.015);gain.gain.setValueAtTime(.12,start+.15);gain.gain.linearRampToValueAtTime(0,start+.18);o.connect(gain);gain.connect(audio.destination);o.onended=()=>{o.disconnect();gain.disconnect();nodes=nodes.filter(n=>n!==o);};nodes.push(o);o.start(start);o.stop(start+.2);}}
    catch{stopSound();$('soundStatus').textContent='提示音播放失敗 · 請確認瀏覽器音訊設定';return '播放失敗，請確認音訊設定';}
    return '已排程 3 聲，請實際確認音量與是否聽見';
  }
  async function enableSound(){
    if(enablingSound)return;
    if(sound){sound=false;stopSound();render();return;}
    enablingSound=true;render();
    try{const Audio=window.AudioContext||window.webkitAudioContext;audio??=new Audio();await audio.resume();sound=audio.state==='running';enablingSound=false;render();if(!sound)$('soundStatus').textContent='無法啟用 · 請確認瀏覽器音訊設定';}
    catch{$('soundStatus').textContent='無法啟用 · 請確認瀏覽器音訊設定';}
    finally{enablingSound=false;$('soundToggle').disabled=!('AudioContext' in window||'webkitAudioContext' in window);}
  }
  async function enableSystem(){
    if(system){system=false;render();return;}
    if(!support()||enabling)return;
    enabling=true;render();
    try{
      // Request directly in the click handler, before awaiting worker setup.
      const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
      if(permission!=='granted'){enabling=false;render();return;}
      await navigator.serviceWorker.register('./sw.js',{scope:'./'});
      let timeout;
      try{registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('worker timeout')),6000);})]);}finally{clearTimeout(timeout);}
      system=true;enabling=false;render();
    }catch{enabling=false;system=false;render();$('notificationStatus').textContent='無法啟用系統通知 · 頁內橫幅仍可使用';}
  }
  function banner(title,text,test=false){$('alarmTitle').textContent=title;$('alarmText').textContent=text;$('alarmBanner').dataset.test=String(test);$('alarmBanner').hidden=false;}
  async function notify(title,body,test){
    if(!support())return '此瀏覽器不支援，未測試';
    if(Notification.permission==='denied'){system=false;render();return '權限已拒絕，未測試';}
    if(!system||!registration)return '未啟用，未測試';
    if(Notification.permission!=='granted'){system=false;render();return '權限未允許，未測試';}
    let timer;
    try{await Promise.race([registration.showNotification(title,{body,tag:test?'cargoalert-test':'cargoalert-alarm',data:{kind:test?'test':'alarm'}}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),6000);})]);$('notificationStatus').textContent='通知請求已交給瀏覽器 · 是否顯示仍受系統設定影響';return '請求已交給瀏覽器，不代表已顯示或已讀';}
    catch(e){const text=e.message==='timeout'?'逾時，尚未確認瀏覽器是否接受':'未能送交瀏覽器';$('notificationStatus').textContent='通知'+text+' · 頁內提醒仍有效';record('本頁系統通知'+text+'；不代表 LINE 發送結果。');return text;}
    finally{clearTimeout(timer);}
  }
  function trigger(status){
    const time=new Date().toLocaleTimeString('zh-TW',{hour12:false});
    banner('鬆脫警報',`${time} 收到 ESP32 警報 · 角度變化 ${status.angle>=0?'+':''}${status.angle.toFixed(1)}°。請檢查束帶與貨物固定狀態。`);
    play();void notify('貨物鬆脫警示器：鬆脫警報',`裝置回報角度變化 ${status.angle.toFixed(1)}°，請檢查束帶。`,false);
    record('本頁鬆脫提醒已觸發；不代表 LINE 或系統通知已送達。');
  }
  function observe(status){
    if(episode.observe(status,performance.now()))trigger(status);
    if((status.state!=='A'||status.fault!==0)&&$('alarmBanner').dataset.test!=='true'){stopSound();$('alarmBanner').hidden=true;}
  }
  function unavailable(){stopSound();$('alarmBanner').hidden=true;episode.healthySince=null;}
  function reset(){episode.reset();unavailable();}
  function acknowledge(){stopSound();$('alarmBanner').hidden=true;}
  async function test(){
    if(testing)return;testing=true;$('testAlerts').disabled=true;
    banner('本頁提醒測試','這是網站提醒測試，不代表裝置警報；不會操作 ESP32 或發送 LINE。',true);
    const soundResult=play();$('alertTestResult').textContent=`橫幅：已顯示。提示音：${soundResult}。系統通知：正在檢查。`;
    try{const notificationResult=await notify('貨物鬆脫警示器：提醒測試','這是網站提醒測試，不是裝置警報，也未發送 LINE。',true);$('alertTestResult').textContent=`橫幅：已顯示。提示音：${soundResult}。系統通知：${notificationResult}。`;record('測試本頁提醒：'+$('alertTestResult').textContent+' 未操作 ESP32 或發送 LINE。');}
    finally{testing=false;$('testAlerts').disabled=false;}
  }
  $('soundToggle').addEventListener('click',enableSound);$('notificationToggle').addEventListener('click',enableSystem);$('testAlerts').addEventListener('click',test);$('ackAlarm').addEventListener('click',acknowledge);
  document.addEventListener('visibilitychange',render);window.addEventListener('pagehide',unavailable);
  navigator.permissions?.query({name:'notifications'}).then(permission=>permission.addEventListener('change',render)).catch(()=>{});
  render();return {observe,unavailable,reset};
}

const $=id=>document.getElementById(id);
const LABEL={queued:'等待 ESP32 經 4G 取得命令',executed:'ESP32 已經 4G 確認；等待 LINE 處理',expired:'命令已逾期，沒有執行',cancelled:'裝置已重啟，命令已取消'};
const LINE={pending:'等待後端發送',sending:'LINE API 請求中',retry:'LINE 傳送待重試',accepted:'LINE API 已接受；手機是否收到仍須確認',failed:'LINE 傳送失敗',not_configured:'後端 LINE 設定未完成',expired:'通知已超過期限',simulation_skipped:'模擬測試：未呼叫 LINE',device_owned:'由裝置直接推播 LINE；手機收訊見裝置端'};
export function createRemoteLineControl({context,get}){
 let busy=false,run=0,commands=[],requestId='',requested=false,cooldown=0,watchId='';
 const key=$('remoteControlKey'),button=$('remoteLineTest'),message=$('remoteControlMessage'),dialog=$('lineTestDialog');
 function reason(){const {token,snapshot:s,lastResponseAt}=context();if(!token||!s)return '先輸入查看金鑰，讀取裝置狀態。';
  if(s.notificationOwner==='device'||s.snapshot?.notificationOwner==='device')return '此裝置由 ESP32 直接發送 LINE，避免重複通知；網站遠端測試停用，請在裝置端使用序列埠 t 測試。';
  if(s.stale||Date.now()-lastResponseAt+s.serverMs-s.receivedMs>60000)return '裝置資料過期／離線；先排除 4G 連線問題。';
  if(!s.snapshot?.remoteLineTest)return '需燒錄支援雲端命令之韌體，並收到首次回報，才能操作。';
  if(s.snapshot.networkMode!=='4G')return '裝置目前不是透過 4G 回報，不能進行此測試。';
  if(!s.remoteControlEnabled)return '這台裝置尚未設定獨立控制金鑰。';
  if(commands.some(c=>c.state==='queued'&&c.expires_ms>Date.now()+(s.serverMs-lastResponseAt)))return '已有命令等待裝置，請勿重複發送。';
  if(Date.now()<cooldown)return '測試冷卻中，至少間隔 60 秒。';
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(key.value.trim()))return '輸入裝置專屬控制金鑰；查看金鑰只有讀取權限。';
  return '';
 }
 function render(){const {snapshot:s}=context(),deviceOwned=s?.notificationOwner==='device'||s?.snapshot?.notificationOwner==='device';const pill=$('remoteControlModePill');if(pill)pill.textContent=deviceOwned?'裝置直發 LINE':'實際發送';const why=reason();button.disabled=busy||!!why;button.textContent=busy?'正在提交…':deviceOwned?'由 ESP32 裝置直接推播 LINE':'透過 4G 發送 LINE 測試';$('remoteControlHint').textContent=why||'可測試；通知會傳給後端已綁定的 LINE 收件人。';}
 function list(){const root=$('remoteCommands');root.replaceChildren();for(const c of commands){const p=document.createElement('p');p.textContent=`${new Date(c.requested_ms).toLocaleString('zh-TW')} · ${c.line_state?LINE[c.line_state]||'LINE 結果未知':LABEL[c.state]||'狀態未知'}${c.http?' · HTTP '+c.http:''}`;root.append(p);}}
 async function refresh(){const mine=run,{snapshot:s}=context();if(s?.notificationOwner==='device'&&!s?.remoteControlEnabled){commands=[];$('remoteCommands').replaceChildren();render();return;}try{const r=await get('commands');const data=await r.json();if(mine!==run)return;commands=data.commands||[];const watched=commands.find(c=>c.id===watchId);if(watched)message.textContent=watched.line_state?(LINE[watched.line_state]||'LINE 結果未知'):(LABEL[watched.state]||'命令狀態未知');list();render();}catch{if(mine===run){commands=[];$('remoteCommands').textContent='命令紀錄暫時無法讀取。';render();}}}
 button.addEventListener('click',()=>{if(reason()||busy)return;dialog.showModal();});
 $('cancelLineTest').addEventListener('click',()=>dialog.close());
 $('confirmLineTest').addEventListener('click',async()=>{
  if(reason()||busy){dialog.close();return;}dialog.close();busy=true;render();const mine=run,{device}=context(),control=key.value.trim();
  if(!requestId||!requested)requestId=crypto.randomUUID();requested=true;watchId='';
  try{const r=await fetch(`/api/v1/devices/${encodeURIComponent(device)}/line-test`,{method:'POST',headers:{Authorization:'Bearer '+control,'Content-Type':'application/json'},body:JSON.stringify({requestId}),cache:'no-store',signal:AbortSignal.timeout(8000)});const data=await r.json();if(mine!==run)return;
   if(!r.ok){if(r.status<500){requested=false;requestId='';}throw Error(r.status===401?'控制金鑰不正確；查看金鑰不能發送通知。':r.status===429?'已有測試命令或仍在 60 秒冷卻期。':r.status===409?'裝置離線、由裝置直發 LINE 或不是 4G 連線，沒有建立命令。':'提交失敗，請稍後檢查命令紀錄。');}
   cooldown=Date.now()+60000;watchId=data.id;message.textContent=data.state==='queued'?'命令已排入；等待 ESP32 經 4G 取得並確認，尚未代表 LINE 已送出。':LABEL[data.state]||'請查看命令紀錄。';requested=false;requestId='';key.value='';await refresh();
  }catch(e){if(mine===run)message.textContent=e.message+' 網路逾時時先查看紀錄，重試會沿用同一命令編號。';}
  finally{if(mine===run){busy=false;render();}}
 });
 key.addEventListener('input',render);
 function reset(){run++;busy=false;commands=[];requestId='';requested=false;cooldown=0;watchId='';key.value='';message.textContent='尚未發送命令。';$('remoteCommands').replaceChildren();if(dialog.open)dialog.close();button.disabled=true;}
 return {render,refresh,reset};
}

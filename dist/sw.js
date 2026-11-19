// Display notifications requested by the open page; no BLE, push or caching.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const client=windows.find(w=>new URL(w.url).origin===self.location.origin);
    if(client){await client.focus();return;}
    await self.clients.openWindow('/#monitor');
  })());
});

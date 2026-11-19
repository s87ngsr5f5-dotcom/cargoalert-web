// Navigation only: never fetch a private HTTP device from the public HTTPS page.
const address=document.getElementById('wifiAddress');
document.getElementById('copyWifiAddress').addEventListener('click',async()=>{
  const result=document.getElementById('wifiCopyResult');
  try {
    await navigator.clipboard.writeText(address.value);
    result.textContent='已複製。連上機器 Wi-Fi 後，貼到 Safari／瀏覽器網址列開啟。';
  } catch {
    address.focus();address.select();
    result.textContent='無法自動複製，請長按上方網址手動複製，或直接輸入 http://192.168.4.1/。';
  }
});

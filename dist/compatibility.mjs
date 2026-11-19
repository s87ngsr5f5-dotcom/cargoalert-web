export function connectionHelp({secure,bluetooth,userAgent='',platform='',touchPoints=0}) {
  const ios=/iPhone|iPad|iPod/.test(userAgent)||(platform==='MacIntel'&&touchPoints>1);
  if(!secure)return {iphoneHelp:false,text:'請使用 HTTPS 網址，才能開啟藍牙連接。'};
  if(bluetooth)return {iphoneHelp:false,text:'本瀏覽器已提供網頁藍牙功能。開啟藍牙後按「連接裝置」，選擇 CargoAlert。'};
  if(ios)return {iphoneHelp:true,text:'此 iPhone／iPad 瀏覽器無法直接連藍牙。藍牙請用 Bluefy；不想安裝 App，可用上方 Wi-Fi 本機監測。'};
  return {iphoneHelp:false,text:'此瀏覽器不支援 Web Bluetooth。Android／電腦請用支援藍牙的 Chrome／Edge；iPhone 請在 Bluefy 開啟本站。'};
}

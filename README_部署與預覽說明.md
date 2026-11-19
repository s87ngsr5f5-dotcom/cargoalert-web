# CargoAlert v3.0 網站更新（雙感知器＋貨車／貨物配置模型）

本資料夾為完整升級版網站，已支援 **一號感知器（Sensor #1）** 與 **二號感知器（Sensor #2）**，並新增互動式**貨車貨斗／立體貨物配置模型**。

## 1. 本機立刻預覽與操作（專題簡報／展示也可用）
- 直接雙擊資料夾內的 **`點我開啟預覽.bat`**（或在終端機執行 `node preview-server.mjs` 後開啟 `http://127.0.0.1:8787/remote.html`）。
- 點擊頁面上方的 **「🎮 開啟展示模擬模式」**：
  1. 可切換 **「貨車貨斗俯視圖」** 與 **「立體貨物模型」**。
  2. 點選 **「放置一號感知器 (#1)」** 或 **「放置二號感知器 (#2)」**，再點模型上的任一個「＋」錨點即可移動位置（點到另一顆會自動對調，並可填自訂位置備註或套用「對角固定／前側雙綁／左側雙綁／前後軸向」快選）。
  3. 拖曳下方模擬角度滑桿，或按「模擬一號鬆脫／二號鬆脫／同時鬆脫」，貨車模型上的束帶、脈衝警報波紋、雙儀表板、雙曲線趨勢圖與頂部橫幅會全部即時聯動！

## 2. 雲端網站部署方式
- 若是 Cloudflare Worker 單檔發布：本資料夾內的 **`dist/server/index.js`** 已經用 `node scripts/build-cloud.mjs` 重建完成（打包了新版 `backend/api.mjs` 與全部 23 個靜態資源含 `cargo-model.mjs`）。
- 若要覆蓋回原本的網站專案（如 `cargoalert-wifi-entry`），請將下列更新後的檔案複製覆蓋，再執行 `node scripts/build-cloud.mjs` 重新部署：
  - `backend/api.mjs`（相容 v1/v2，新增接收 `sensors[]`、`sensorId`、`sensorName` 與 CSV 感知器欄位）
  - `dist/cargo-model.mjs`（互動式貨車／立體貨物模型模組）
  - `dist/remote.html`、`dist/remote.css`、`dist/remote.mjs`
  - `dist/server/index.js`（已打包好的 Worker 檔案）

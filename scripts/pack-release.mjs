import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const desktop = dirname(root);
const files = [
  ['backend/api.mjs', 'javascript'],
  ['dist/cargo-model.mjs', 'javascript'],
  ['dist/dial-gauge.mjs', 'javascript'],
  ['dist/v3-theme.css', 'css'],
  ['dist/protocol.mjs', 'javascript'],
  ['dist/index.html', 'html'],
  ['dist/app.mjs', 'javascript'],
  ['dist/remote.html', 'html'],
  ['dist/remote.css', 'css'],
  ['dist/remote.mjs', 'javascript'],
];

let md = `# CargoAlert v3.3（雙感知器＋互動式貨車配置模型＋4° 警報＋遠端重設基準值）網站更新（合併檔）

請把下列每個檔案依路徑完整覆蓋（或新增）到 Site source（\`cargoalert-wifi-entry\`），再執行 \`node scripts/build-cloud.mjs\` 重建 \`dist/server/index.js\`（務必確認新檔 \`dist/cargo-model.mjs\` 與 \`dist/v3-theme.css\` 也被打包進 \`ASSETS\`）後發布。

更新重點：
- 支援單一 ESP32 雙 AS5600（一號／二號感知器獨立顯示、雙儀表板、雙曲線趨勢、事件感知器篩選與 CSV 欄位）。
- 新增互動式「貨車貨斗俯視圖／3D 立體貨物模型」，支援點擊與拖曳放置一號／二號感知器、4 種綁法快選與即時紅光警報聯動。
- 門檻同步改為 4°（含邊界 800 ms 確認），加入 4° 安全餘裕進度條與深／淺色儀表切換。
- 新增藍牙與 4G 雲端「重設基準值」按鈕（後端 \`POST /api/v1/devices/:id/recalibrate\` 免改資料庫結構）。

`;

for (const [rel, lang] of files) {
  const content = readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
  md += `## 檔案：${rel}\n\n\`\`\`${lang}\n${content}${content.endsWith('\n') ? '' : '\n'}\`\`\`\n\n`;
}

const outMd = join(desktop, 'CargoAlert_v3.3_網站更新_合併.md');
writeFileSync(outMd, md, 'utf8');
console.log(`Created ${outMd} (${statSync(outMd).size} bytes)`);

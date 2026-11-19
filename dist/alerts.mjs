import {AlarmEpisode} from './alert-policy.mjs';

const $=id=>document.getElementById(id);

/**
 * Schedule distinct Web Audio alert tones for Sensor #1 (mask=1: high single beeps),
 * Sensor #2 (mask=2: lower double-beeps), both (mask=3: alternating siren), or preview (mask=4).
 */
export function scheduleAlarmTonePattern(audioCtx, mask = 1, activeNodes = null) {
  if (!audioCtx || audioCtx.state === 'closed') return;
  const now = audioCtx.currentTime;
  const tone = (freq, type, startOffset, dur, peakGain = 0.14) => {
    const start = now + startOffset;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peakGain, start + 0.014);
    gain.gain.setValueAtTime(peakGain, start + Math.max(0.02, dur - 0.025));
    gain.gain.linearRampToValueAtTime(0, start + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      if (activeNodes) {
        const idx = activeNodes.indexOf(osc);
        if (idx >= 0) activeNodes.splice(idx, 1);
      }
    };
    if (activeNodes) activeNodes.push(osc);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  };

  if (mask === 4) {
    // Preview both sounds back-to-back: S1 high single beeps, then S2 lower double-beep
    tone(1046, 'sine', 0.00, 0.17, 0.13);
    tone(1046, 'sine', 0.30, 0.17, 0.13);
    tone(523, 'triangle', 0.72, 0.10, 0.16);
    tone(523, 'triangle', 0.88, 0.10, 0.16);
    tone(523, 'triangle', 1.18, 0.10, 0.16);
    tone(523, 'triangle', 1.34, 0.10, 0.16);
    return;
  }
  if (mask === 3) {
    // Both alarming simultaneously: urgent alternating high-low two-tone siren
    for (let i = 0; i < 3; i++) {
      const base = i * 0.38;
      tone(1046, 'sine', base, 0.15, 0.14);
      tone(523, 'triangle', base + 0.16, 0.15, 0.16);
    }
    return;
  }
  if (mask === 2) {
    // Sensor #2: lower pitch rapid double-beep pairs ("嘟嘟— 嘟嘟—")
    for (let i = 0; i < 3; i++) {
      const base = i * 0.52;
      tone(523, 'triangle', base, 0.10, 0.16);
      tone(523, 'triangle', base + 0.15, 0.10, 0.16);
    }
    return;
  }
  // Sensor #1 (default): crisp high single pulse ("逼—— 逼—— 逼——")
  for (let i = 0; i < 3; i++) {
    tone(1046, 'sine', i * 0.34, 0.18, 0.13);
  }
}

export function createAlerts(record) {
  const episodes = [new AlarmEpisode(), new AlarmEpisode()];
  let audio = null, nodes = [], sound = false, system = false, registration = null, enabling = false, enablingSound = false, testing = false;
  const support = () => isSecureContext && typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function' && 'serviceWorker' in navigator && typeof ServiceWorkerRegistration !== 'undefined' && 'showNotification' in ServiceWorkerRegistration.prototype;

  function render() {
    $('soundToggle').textContent = sound ? '關閉提示音' : '啟用提示音';
    $('soundToggle').setAttribute('aria-pressed', String(sound));
    $('soundStatus').textContent = sound ? (audio?.state === 'running' ? '已啟用 · 一號高單嗶／二號低雙嗶' : '聲音暫停 · 請關閉後重新啟用') : '未啟用 · 需先按按鈕允許播放';
    const supported = support(), denied = supported && Notification.permission === 'denied';
    if (supported && Notification.permission !== 'granted') system = false;
    $('notificationToggle').disabled = !supported || denied || enabling;
    $('notificationToggle').textContent = enabling ? '正在啟用…' : system ? '關閉系統通知' : '啟用系統通知';
    $('notificationToggle').setAttribute('aria-pressed', String(system));
    $('notificationStatus').textContent = !supported ? '此瀏覽器不支援 · 可使用頁內橫幅' : denied ? '已被封鎖 · 請到瀏覽器網站設定開啟' : system ? '已啟用 · 仍需本頁取得 BLE 警報' : '未啟用 · 按下後由瀏覽器詢問權限';
    $('soundToggle').disabled = enablingSound || !('AudioContext' in window || 'webkitAudioContext' in window);
    if (!('AudioContext' in window || 'webkitAudioContext' in window)) $('soundStatus').textContent = '此瀏覽器不支援提示音';
  }

  function stopSound() {
    for (const n of nodes) { try { n.stop(); n.disconnect(); } catch {} }
    nodes = [];
  }

  function play(mask = 1) {
    if (!sound) return '未啟用，未測試';
    if (!audio || audio.state !== 'running') {
      $('soundStatus').textContent = '提示音未播放 · 瀏覽器暫停聲音，請重新啟用';
      return '未播放：瀏覽器暫停聲音，請重新啟用';
    }
    stopSound();
    try {
      scheduleAlarmTonePattern(audio, mask, nodes);
    } catch {
      stopSound();
      $('soundStatus').textContent = '提示音播放失敗 · 請確認瀏覽器音訊設定';
      return '播放失敗，請確認音訊設定';
    }
    return mask === 4 ? '已試聽一號高音單嗶與二號低音雙連嗶' : mask === 3 ? '已播放高低交替警笛' : mask === 2 ? '已播放二號低音雙連嗶' : '已播放一號高音單嗶';
  }

  async function enableSound() {
    if (enablingSound) return;
    if (sound) { sound = false; stopSound(); render(); return; }
    enablingSound = true; render();
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      audio ??= new Audio();
      await audio.resume();
      sound = audio.state === 'running';
      enablingSound = false;
      render();
      if (!sound) $('soundStatus').textContent = '無法啟用 · 請確認瀏覽器音訊設定';
    } catch {
      $('soundStatus').textContent = '無法啟用 · 請確認瀏覽器音訊設定';
    } finally {
      enablingSound = false;
      $('soundToggle').disabled = !('AudioContext' in window || 'webkitAudioContext' in window);
    }
  }

  async function enableSystem() {
    if (system) { system = false; render(); return; }
    if (!support() || enabling) return;
    enabling = true; render();
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') { enabling = false; render(); return; }
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
      let timeout;
      try {
        registration = await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('worker timeout')), 6000); })]);
      } finally { clearTimeout(timeout); }
      system = true; enabling = false; render();
    } catch {
      enabling = false; system = false; render();
      $('notificationStatus').textContent = '無法啟用系統通知 · 頁內橫幅仍可使用';
    }
  }

  function banner(title, text, test = false) {
    $('alarmTitle').textContent = title;
    $('alarmText').textContent = text;
    $('alarmBanner').dataset.test = String(test);
    $('alarmBanner').hidden = false;
  }

  async function notify(title, body, test) {
    if (!support()) return '此瀏覽器不支援，未測試';
    if (Notification.permission === 'denied') { system = false; render(); return '權限已拒絕，未測試'; }
    if (!system || !registration) return '未啟用，未測試';
    if (Notification.permission !== 'granted') { system = false; render(); return '權限未允許，未測試'; }
    let timer;
    try {
      await Promise.race([registration.showNotification(title, { body, tag: test ? 'cargoalert-test' : 'cargoalert-alarm', data: { kind: test ? 'test' : 'alarm' } }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 6000); })]);
      $('notificationStatus').textContent = '通知請求已交給瀏覽器 · 是否顯示仍受系統設定影響';
      return '請求已交給瀏覽器，不代表已顯示或已讀';
    } catch (e) {
      const text = e.message === 'timeout' ? '逾時，尚未確認瀏覽器是否接受' : '未能送交瀏覽器';
      $('notificationStatus').textContent = '通知' + text + ' · 頁內提醒仍有效';
      record('本頁系統通知' + text + '；不代表 LINE 發送結果。');
      return text;
    } finally { clearTimeout(timer); }
  }

  const isAlarming = s => !!(s && s.fault === 0 && s.calibrated && s.state === 'A' && s.angle !== null);

  function triggerDual(s1, s2, label1 = '一號', label2 = '二號') {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    const a1 = isAlarming(s1), a2 = isAlarming(s2);
    const mask = (a1 ? 1 : 0) | (a2 ? 2 : 0) || 1;
    const parts = [];
    if (a1) parts.push(`【一號感知器 · ${label1}】${s1.angle >= 0 ? '+' : ''}${s1.angle.toFixed(1)}°`);
    if (a2) parts.push(`【二號感知器 · ${label2}】${s2.angle >= 0 ? '+' : ''}${s2.angle.toFixed(1)}°`);
    const title = mask === 3 ? '🚨 一號與二號同時鬆脫警報' : mask === 2 ? '⚠️ 二號感知器鬆脫警報' : '⚠️ 一號感知器鬆脫警報';
    const body = `${time} 收到警報 · ${parts.join('；')}。請檢查束帶與貨物固定狀態。`;
    banner(title, body);
    play(mask);
    void notify(`貨物鬆脫警示器：${title}`, body, false);
    record(`本頁鬆脫提醒已觸發（${parts.join('／')}）；不代表 LINE 或系統通知已送達。`);
  }

  function observeDual(s1, s2, label1 = '一號', label2 = '二號') {
    const now = performance.now();
    const f1 = episodes[0].observe(s1, now);
    const f2 = episodes[1].observe(s2, now);
    const a1 = isAlarming(s1), a2 = isAlarming(s2);
    if (!a1 && !a2 && $('alarmBanner').dataset.test !== 'true') {
      stopSound();
      $('alarmBanner').hidden = true;
    }
    if (f1 || f2) triggerDual(s1, s2, label1, label2);
  }

  function observe(status) {
    observeDual(status, null);
  }

  function unavailable() {
    stopSound();
    $('alarmBanner').hidden = true;
    episodes.forEach(ep => { ep.healthySince = null; });
  }

  function reset() {
    episodes.forEach(ep => ep.reset());
    unavailable();
  }

  function acknowledge() {
    stopSound();
    $('alarmBanner').hidden = true;
  }

  async function test() {
    if (testing) return;
    testing = true;
    $('testAlerts').disabled = true;
    banner('本頁提醒測試（一號高單嗶 → 二號低雙嗶）', '這是網站提醒測試，不代表裝置警報；不會操作 ESP32 或發送 LINE。', true);
    const soundResult = play(4);
    $('alertTestResult').textContent = `橫幅：已顯示。提示音：${soundResult}。系統通知：正在檢查。`;
    try {
      const notificationResult = await notify('貨物鬆脫警示器：提醒測試', '這是網站提醒測試，不是裝置警報，也未發送 LINE。', true);
      $('alertTestResult').textContent = `橫幅：已顯示。提示音：${soundResult}。系統通知：${notificationResult}。`;
      record('測試本頁提醒：' + $('alertTestResult').textContent + ' 未操作 ESP32 或發送 LINE。');
    } finally {
      testing = false;
      $('testAlerts').disabled = false;
    }
  }

  $('soundToggle').addEventListener('click', enableSound);
  $('notificationToggle').addEventListener('click', enableSystem);
  $('testAlerts').addEventListener('click', test);
  $('ackAlarm').addEventListener('click', acknowledge);
  document.addEventListener('visibilitychange', render);
  window.addEventListener('pagehide', unavailable);
  navigator.permissions?.query({ name: 'notifications' }).then(permission => permission.addEventListener('change', render)).catch(() => {});
  render();
  return { observe, observeDual, unavailable, reset };
}

import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import net from 'node:net';
const work = process.env.RELAY_TEST_WORKDIR;
assert.ok(work && path.isAbsolute(work), 'Set RELAY_TEST_WORKDIR to an absolute dedicated test directory');
assert.ok(process.env.RELAY_TEST_EXE && path.isAbsolute(process.env.RELAY_TEST_EXE), 'Set RELAY_TEST_EXE to the built executable');
// Refuse to target an existing service. Every run gets a fresh test-only database.
await new Promise((resolve, reject) => {
 const probe = net.createServer();
 probe.once('error', () => reject(new Error('Test port 18475 is busy; no existing service was touched')));
 probe.listen(18475, '127.0.0.1', () => probe.close(resolve));
});
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const stage = path.join(work, 'relay-ui-clean-test-' + Date.now());
const output = process.env.RELAY_TEST_OUTPUT || path.join(work, 'outputs');
await fs.mkdir(output, { recursive: true });
await fs.mkdir(path.join(stage, 'files'), { recursive: true });
await fs.mkdir(path.join(stage, 'data'), { recursive: true });
const config = `http:\n  listen: "127.0.0.1"\n  port: 18475\n  disableWebDAV: true\nserver:\n  sources:\n    - path: "${path.join(stage, 'files').replaceAll('\\', '/')}"\n      name: "Personal"\n      config:\n        defaultEnabled: true\n        private: true\nauth:\n  methods:\n    password:\n      enabled: true\n      signup: false\n`;
await fs.writeFile(path.join(stage, 'data/config.yaml'), config);
const password = randomUUID() + randomUUID(); // Test-only disposable account, never logged or saved.
const proc = spawn(process.env.RELAY_TEST_EXE, ['-c', 'config.yaml'], { cwd: path.join(stage, 'data'), windowsHide: true, env: { ...process.env, FILEBROWSER_ADMIN_PASSWORD: password }, stdio: 'ignore' });
let launchError;
proc.once('error', err => { launchError = err; });
let memoryPhase = 'startup';
const memorySamples = [];
let memoryBuffer = '';
const memoryProbe = spawn('powershell.exe', ['-NoProfile', '-Command', `$ErrorActionPreference='Stop'; try { $relayTestProcess=[Diagnostics.Process]::GetProcessById(${proc.pid}); while (-not $relayTestProcess.HasExited) { $relayTestProcess.Refresh(); Write-Output ($relayTestProcess.WorkingSet64.ToString()+','+$relayTestProcess.PrivateMemorySize64.ToString()); Start-Sleep -Milliseconds 100 } } catch {}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
memoryProbe.on('error', () => {});
memoryProbe.stdout.on('data', chunk => {
 memoryBuffer += chunk.toString();
 const lines = memoryBuffer.split(/\r?\n/); memoryBuffer = lines.pop();
 for (const line of lines) { const [workingSet, privateBytes] = line.split(',').map(Number); if (workingSet > 0) memorySamples.push({ phase: memoryPhase, workingSet, privateBytes }); }
});
let browser;
let nativeProcess, nativeBrowser;
const report = { checks: [], chunks: [] };
try {
 for (let i = 0; i < 60; i++) { if (launchError) throw launchError; if (proc.exitCode !== null) throw new Error('Test server exited before health check'); try { const res = await fetch('http://127.0.0.1:18475/health'); if (res.ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
 browser = await chromium.launch({ channel: 'msedge', headless: true });
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'], locale: 'zh-CN' });
 const login = await context.request.post('http://127.0.0.1:18475/api/auth/login?username=admin', { headers: { 'X-Password': encodeURIComponent(password) } });
 assert.equal(login.status(), 200, 'test account login status');
 const page = await context.newPage(); const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
 page.on('request', req => { const h = req.headers(); if (h['x-file-chunk-offset'] !== undefined) report.chunks.push({ offset: Number(h['x-file-chunk-offset']), size: Number(h['content-length']) || req.postDataBuffer()?.length }); });
 await page.goto('http://127.0.0.1:18475/chat'); await page.locator('.relay').waitFor();
 try { await page.locator('[aria-label=generic-prompt] .card-actions button').click({ timeout: 3000 }); } catch {};
 memoryPhase = 'idle'; await new Promise(r => setTimeout(r, 2000));
 const text = '统一界面测试：点击时间也能复制\n第二行可选择复制😀';
 assert.equal(await page.locator('input:not([type=file]), textarea').count(), 0); await page.evaluate(t => navigator.clipboard.writeText(t), text); await page.getByRole('button', { name: '粘贴并发送', exact: true }).click();
 await page.locator('.message-text').first().waitFor();
 await page.locator('.message-text time').first().click();
 assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'), text);
 assert.ok(!(await page.locator('.message-text').first().innerText()).includes('第二行'));
 assert.ok(await page.evaluate(() => document.querySelector('.relay-header').getBoundingClientRect().bottom < document.querySelector('.compact-actions').getBoundingClientRect().top));

 report.checks.push('message first-line, character count and timestamp hotzone copy');
 await page.locator('.message-actions').first().getByRole('button', { name: '预览', exact: true }).click();
 const preview = page.locator('.relay-preview pre'); assert.equal((await preview.innerText()).replaceAll('\r\n','\n'), text); assert.equal(await preview.evaluate(el => getComputedStyle(el).userSelect), 'text');
 await page.getByRole('button', { name: '关闭', exact: true }).click();
 await page.evaluate(() => navigator.clipboard.writeText('剪贴板合成测试'));
 await page.getByRole('button', { name: '粘贴并发送', exact: true }).click();
 await page.getByRole('button', { name: '复制消息：剪贴板合成测试', exact: true }).waitFor();
 report.checks.push('fullscreen selection and actual browser clipboard paste/send');
 // Actual system clipboard PNG; compare decoded pixels because clipboard encoding may normalize bytes.
 const png = await page.evaluate(async () => {
  const canvas = document.createElement('canvas'); canvas.width=2; canvas.height=2;
  const c=canvas.getContext('2d'); c.fillStyle='#e52b4a'; c.fillRect(0,0,1,1); c.fillStyle='#2189ce'; c.fillRect(1,0,1,1); c.fillStyle='#35c876'; c.fillRect(0,1,1,1); c.fillStyle='#f2d831'; c.fillRect(1,1,1,1);
  return Array.from(new Uint8Array(await (await new Promise(r=>canvas.toBlob(r,'image/png'))).arrayBuffer()));
 });
 const beforePng = new Set(await fs.readdir(path.join(stage,'files')));
 await page.evaluate(async bytes => { const blob = new Blob([new Uint8Array(bytes)], {type:'image/png'}); await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]); }, png);
 await page.getByRole('button',{name:'粘贴并发送',exact:true}).click();
 let imageName;
 for(let i=0;i<100;i++){ imageName=(await fs.readdir(path.join(stage,'files'))).find(n=>!beforePng.has(n) && n.endsWith('.png')); if(imageName) break; await new Promise(r=>setTimeout(r,200)); }
 assert.ok(imageName,'actual clipboard PNG uploaded');
 const uploadedPng=await fs.readFile(path.join(stage,'files',imageName));
 const pixelData=await page.evaluate(async bytes=>{const img=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);return Array.from(x.getImageData(0,0,c.width,c.height).data)},Array.from(uploadedPng));
 assert.deepEqual(pixelData,[229,43,74,255,33,137,206,255,53,200,118,255,242,216,49,255]);
 const imageDownload=await context.request.get('http://127.0.0.1:18475/api/resources/download?source=Personal&file=%2F'+encodeURIComponent(imageName)); assert.equal(imageDownload.status(),200); assert.equal(createHash('sha256').update(await imageDownload.body()).digest('hex'),createHash('sha256').update(uploadedPng).digest('hex'));
 await page.locator('[aria-label=upload-prompt]').waitFor({state:'hidden'});
 const beforeEvent = new Set(await fs.readdir(path.join(stage,'files')));
 await page.evaluate(bytes=>{const d=new DataTransfer();d.items.add(new File([new Uint8Array(bytes)],'paste-event-synthetic.png',{type:'image/png'}));document.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));},png);
 for(let i=0;i<100;i++){if((await fs.readdir(path.join(stage,'files'))).includes('paste-event-synthetic.png'))break;await new Promise(r=>setTimeout(r,200));}
 assert.deepEqual(await fs.readFile(path.join(stage,'files','paste-event-synthetic.png')),Buffer.from(png));
 await page.locator('[aria-label=upload-prompt]').waitFor({state:'hidden'});
 report.checks.push('real clipboard PNG upload pixels and download SHA256; synthetic paste event image bytes');
 const fileName = '统一列表-小文件.bin'; await fs.writeFile(path.join(work, fileName), randomBytes(2 * 1024 * 1024));
 const largeName = '统一列表-200MiB.bin'; const largePath = path.join(work, largeName); const largeHandle = await fs.open(largePath, 'w');
 for (let i = 0; i < 20; i++) await largeHandle.write(randomBytes(10 * 1024 * 1024)); await largeHandle.close();
 for (const name of [fileName, largeName]) {
  memoryPhase = `upload:${name}`;
  await page.locator('.relay input[type=file]').setInputFiles(path.join(work, name));
  for (let i = 0; i < 180; i++) { try { if ((await fs.stat(path.join(stage, 'files', name))).size === (await fs.stat(path.join(work, name))).size) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  const original = await fs.readFile(path.join(work, name)); const uploaded = await fs.readFile(path.join(stage, 'files', name));
  const digest = buf => createHash('sha256').update(buf).digest('hex'); assert.equal(digest(uploaded), digest(original));
  await page.locator('[aria-label=upload-prompt]').waitFor({state:'hidden'});
  await page.reload(); await page.locator('.relay').waitFor();
  const row = page.locator('.transfer').filter({ has: page.locator('.item-title', { hasText: name }) }); await row.waitFor();
  const link = row.getByRole('link', { name: '下载', exact: true });
  memoryPhase = `download:${name}`;
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const downloadPath = await download.path(); assert.equal(digest(await fs.readFile(downloadPath)), digest(original));
  report.checks.push({ name, bytes: original.length, sha256: digest(original), upload: 'equal', browserDownload: 'equal' });
 }
 memoryPhase = 'post-transfer';
 assert.ok(report.chunks.length > 1, 'actual chunk uploads required');
 const manifest = await (await context.request.get('http://127.0.0.1:18475/public/static/site.webmanifest')).json();
 assert.equal(manifest.name, '中转站'); assert.equal(manifest.start_url, '/chat'); assert.equal(manifest.display, 'standalone');
 for (const icon of manifest.icons) assert.equal((await context.request.get('http://127.0.0.1:18475' + icon.src)).status(), 200);
 report.checks.push('manifest standalone launch /chat and all PNG icons HTTP200');
 await page.screenshot({ path: path.join(output, '统一界面-桌面实测.png'), fullPage: true });
 await page.setViewportSize({ width: 390, height: 844 });
 assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile no horizontal overflow');
 const heights = await page.locator('.row-actions button,.row-actions a').evaluateAll(els => els.map(el => el.getBoundingClientRect().height)); assert.ok(heights.every(h => h >= 28), 'desktop pointer actions tap size');
 await page.screenshot({ path: path.join(output, '统一界面-移动实测.png'), fullPage: true });
 report.checks.push('390px narrow layout: no horizontal overflow');
 // Reproduce the long-page background issue with more than one viewport of rows.
 for (let i = 0; i < 9; i++) await context.request.post('http://127.0.0.1:18475/api/resources?source=Personal&path=%2Fscroll-fixture-'+i+'.txt', { data: 'synthetic scroll row' });
 await page.reload(); await page.locator('.relay').waitFor();
 await page.locator('#main').evaluate(el => el.scrollTop = el.scrollHeight);
 const background = await page.locator('#main').evaluate(el => getComputedStyle(el).backgroundColor);
 assert.ok(background !== 'rgb(0, 0, 0)', 'background is not black');
 assert.ok(await page.locator('.relay-list').evaluate(el => el.scrollHeight > el.clientHeight));
 await page.screenshot({ path: path.join(output, '网页底部背景修复.png') });
 report.checks.push('long history scrolls internally with nonblack gradient background');
 const compactPage = await context.newPage();
 await compactPage.goto('http://127.0.0.1:18475/chat?compact=1'); await compactPage.locator('.transfer').first().waitFor();
 assert.equal(await compactPage.locator('#relay-input').count(), 0);
 const visibleRows = await compactPage.locator('.relay-list').evaluate(el => {
  const viewport = el.getBoundingClientRect();
  return [...el.querySelectorAll('.transfer')].filter(row => { const r = row.getBoundingClientRect(); return r.top >= viewport.top-1 && r.bottom <= viewport.bottom+1; }).length;
 });
 assert.equal(visibleRows, 3);
 await compactPage.locator('.relay-list').evaluate(el => el.scrollTop = el.scrollHeight);
 assert.ok(await compactPage.locator('.relay-list').evaluate(el => el.scrollTop > 0));
 const dropName = 'dropped-synthetic.txt';
 await compactPage.locator('.relay').evaluate((el, name) => {
  const transfer = new DataTransfer(); transfer.items.add(new File(['drag upload fixture'], name, { type: 'text/plain' }));
  el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
 }, dropName);
 for (let i = 0; i < 40; i++) { try { if (await fs.readFile(path.join(stage, 'files', dropName), 'utf8') === 'drag upload fixture') break; } catch {} await new Promise(r => setTimeout(r, 250)); }
 assert.equal(await fs.readFile(path.join(stage, 'files', dropName), 'utf8'), 'drag upload fixture');
 report.checks.push('compact shows exactly 3 rows, scrolls history, has no composer, dropped file uploads through queue');
 if (process.env.RELAY_TEST_CLIENT_EXE) {
  nativeProcess = spawn(process.env.RELAY_TEST_CLIENT_EXE, ['--test-mode', '--test-url', 'http://127.0.0.1:18475', '--test-profile', path.join(stage, 'native-profile')], {
   windowsHide: true, stdio: 'ignore', env: { ...process.env, PERSONAL_RELAY_TEST_PASSWORD: password, PERSONAL_RELAY_TEST_DEBUG_PORT: '18478', PERSONAL_RELAY_TEST_HOTKEYS: '1' }
  });
  for (let i = 0; i < 80; i++) { try { nativeBrowser = await chromium.connectOverCDP('http://127.0.0.1:18478', { timeout: 1000 }); break; } catch {} await new Promise(r => setTimeout(r, 300)); }
  assert.ok(nativeBrowser, 'native WebView2 debugging connection');
  const nativeContext = nativeBrowser.contexts()[0];
  let nativePage;
  for (let i = 0; i < 60; i++) { nativePage = nativeContext.pages().find(p => p.url().includes('/chat')); if (nativePage) break; await new Promise(r => setTimeout(r, 300)); }
  assert.ok(nativePage, 'native login and navigation');
  await nativePage.locator('.relay-compact').waitFor();
  await nativePage.locator('.transfer').nth(2).waitFor();
  assert.equal(await nativePage.locator('#relay-input').count(), 0);
  assert.equal(await nativePage.evaluate(() => document.documentElement.classList.contains('relay-native-page')), true);
  assert.ok(await nativePage.locator('.transfer').count() >= 3);
  await nativePage.screenshot({ path: path.join(output, 'Windows窄版客户端实测.png') });
  const nativeSize = await nativePage.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(nativeSize.width >= 330 && nativeSize.height >= 400, 'native DPI dimensions');
  await fs.writeFile(path.join(output, 'native-test-ready.json'), JSON.stringify({ pid: nativeProcess.pid, stage, debugPort: 18478 }));
  report.checks.push('real native WebView2 logged into disposable test account and loaded authenticated compact relay');
  if (process.env.RELAY_TEST_HOLD === '1') {
   console.log('Native UI test ready; waiting for test-finish.flag');
   for (let i = 0; i < 900; i++) { try { await fs.stat(path.join(stage, 'test-finish.flag')); break; } catch {} await new Promise(r => setTimeout(r, 1000)); }
  }
 }
 assert.deepEqual(pageErrors, [], 'browser runtime errors');
 const anon = await browser.newContext();
 for (const [url, method, expected] of [['/api/resources?source=Personal&path=%2F','GET',401],['/api/resources/download?source=Personal&file=%2F'+encodeURIComponent(largeName),'GET',401],['/api/resources?source=Personal&path=%2F.text-relay%2F','GET',401],['/api/resources?source=Personal&path=%2Funauthorized.txt','POST',401],['/api/auth/signup','POST',405]]) {
  assert.equal((await anon.request.fetch('http://127.0.0.1:18475'+url, { method })).status(), expected, 'anonymous '+method+' '+url);
 }
 report.checks.push('anonymous list/download/messages/upload rejected, signup disabled');
 report.memory = [...new Set(memorySamples.map(sample => sample.phase))].map(phase => {
  const samples = memorySamples.filter(sample => sample.phase === phase);
  return { phase, samples: samples.length, maxWorkingSetMiB: Math.round(Math.max(...samples.map(s => s.workingSet)) / 104857.6) / 10, maxPrivateMiB: Math.round(Math.max(...samples.map(s => s.privateBytes)) / 104857.6) / 10 };
 });
 await fs.writeFile(path.join(output, '统一界面测试结果.json'), JSON.stringify(report, null, 2));
 console.log(JSON.stringify(report, null, 2));
} finally { if (nativeBrowser) await nativeBrowser.close(); if (nativeProcess) nativeProcess.kill(); if (browser) await browser.close(); proc.kill(); memoryProbe.kill(); }

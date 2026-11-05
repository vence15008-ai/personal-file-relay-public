<template>
  <section class="relay" :class="{ 'relay-compact': true, 'relay-dragging': dragging }" aria-label="个人中转站" @dragenter="dragEnter" @dragover="dragOver" @dragleave="dragLeave" @drop="dropFiles">
    <div class="relay-header" :class="{ 'native-header': nativeClient }" role="banner"><div class="brand"><span class="brand-icon">⇄</span><h1>中转站</h1></div><div v-if="nativeClient" class="native-window-actions"><button type="button" aria-label="热键设置" @click="nativeAction('settings')">⚙</button><button type="button" aria-label="最小化" @click="nativeAction('minimize')">−</button><button type="button" aria-label="关闭到托盘" @click="nativeAction('hide')">×</button></div><div v-else class="relay-nav"><button type="button" aria-label="登录设备" @click="devicesOpen = true">⚙</button><RouterLink to="/files/Personal/" aria-label="文件管理">▤</RouterLink><button v-if="mobile" type="button" aria-label="安装到桌面" @click="install">↓</button></div></div>
    <input ref="fileInput" type="file" multiple hidden @change="upload">
    <div class="list-header"><span>最近</span><span>{{ filtered.length }} 项</span></div>
    <div class="relay-list" aria-live="polite">
      <p v-if="!filtered.length && !loading" class="empty">暂无内容</p>
      <article v-for="item in filtered" :key="item.path" class="transfer" :class="{ 'relay-message': item.kind === 'message' }">
        <button v-if="item.kind === 'message'" type="button" class="row-main message-text" :aria-label="'复制消息：'+firstLine(item.text)" @click="copyText(item.text)"><span class="item-icon text-icon">文</span><span class="item-body"><span class="item-title">{{ firstLine(item.text) }}</span><span class="item-meta">{{ charCount(item.text).toLocaleString() }} 字符 · <time>{{ formatTime(item.time) }}</time></span></span><span class="copy-mark" aria-hidden="true">⧉</span></button>
        <button v-else type="button" class="row-main" :class="{ 'drag-image': canDragImage(item) }" :title="canDragImage(item) ? '按住拖到其他应用（图片文件）' : undefined" @pointerdown="imagePointerDown($event, item)" @pointermove="imagePointerMove($event, item)" @pointerup="imagePointerUp" @pointercancel="imagePointerUp" @dragstart.prevent @click="imageClick($event, item)"><span class="item-icon">{{ item.type === 'directory' ? '▤' : /\.(png|jpe?g|webp|gif)$/i.test(item.name) ? '▧' : '↥' }}</span><span class="item-body"><span class="item-title">{{ item.name }}</span><span class="item-meta">{{ item.type === 'directory' ? '文件夹' : formatSize(item.size) }} · <time>{{ formatTime(item.time) }}</time></span></span></button>
        <div v-if="item.kind === 'message'" class="row-actions message-actions"><button type="button" @click="preview = item">预览</button><button type="button" class="danger" @click="remove(item)">删除</button></div>
        <div v-else class="row-actions"><a v-if="item.type !== 'directory'" :href="getDownloadURL(source, item.path, false)" :download="item.name">下载</a><button type="button" @click="openFile(item)">{{ item.type === 'directory' ? '打开' : '预览' }}</button><button type="button" class="danger" @click="remove(item)">删除</button></div>
      </article>
    </div>
    <div class="compact-actions"><button type="button" @click="fileInput?.click()">↑ 上传</button><button type="button" class="primary" :disabled="sending" @click="sendOrPaste">{{ sending ? '发送中…' : draft ? '重试发送' : '粘贴并发送' }}</button></div>
    <p v-if="error" class="relay-error" role="alert">{{ error }}</p><p v-else-if="notice" class="relay-notice" role="status">{{ notice }}</p>
    <div v-if="dragging" class="relay-drop-overlay" aria-live="polite">松开上传</div>
    <RememberDevices v-if="devicesOpen" @close="devicesOpen = false" />
    <Teleport to="body"><div v-if="preview" class="relay-preview" role="dialog" aria-modal="true" aria-labelledby="relay-preview-title" @keydown.esc="preview = null"><div class="preview-header"><h2 id="relay-preview-title">消息预览</h2><button type="button" @click="preview = null">关闭</button></div><pre ref="previewText" class="preview-content" tabindex="0">{{ preview.text }}</pre><button type="button" class="primary" @click="copyText(preview.text)">复制全文</button></div>
    <div v-if="installHelp" class="relay-install" role="dialog" aria-modal="true" aria-label="安装到桌面"><div><p>浏览器菜单 → 安装应用 / 添加到桌面</p><button type="button" @click="installHelp = false">知道了</button></div></div></Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { fetchFiles, listDirectoryEntries, post, bulkDelete, moveCopy, getDownloadURL } from '@/api/resources';
import { mutations, state } from '@/store';
import { readRelayClipboard, clipboardImageFile } from '@/utils/relayClipboard';
import { installAvailable, isStandalone, promptInstall } from '@/utils/pwaInstall';
import { renew } from '@/utils/auth';
import RememberDevices from '@/components/RememberDevices.vue';

const source = 'Personal';
const directory = '/.text-relay/';
const compact = true;
const nativeClient = compact && Boolean(window.chrome?.webview);
const mobile = !nativeClient && window.innerWidth < 600;
const router = useRouter();
const items = ref([]), draft = ref(''), error = ref(''), notice = ref('');
const loading = ref(false), sending = ref(false), preview = ref(null), previewText = ref(null), fileInput = ref(null), installHelp = ref(false);
const filtered = computed(() => items.value);
const cache = new Map();
const dragging = ref(false);
const devicesOpen = ref(false);
let dragDepth = 0;
let timer, active = true;
let noticeTimer;
let imagePointer = null, suppressImageClickUntil = 0;
const canDragImage = item => nativeClient && item.type !== 'directory' && item.size <= 32 * 1024 * 1024 && /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(item.name);
function imagePointerDown(event, item) {
  if (!canDragImage(item) || event.button !== 0 || event.pointerType !== 'mouse') return;
  imagePointer = { path: item.path, x: event.clientX, y: event.clientY };
  event.currentTarget.setPointerCapture(event.pointerId);
}
function imagePointerMove(event, item) {
  if (!imagePointer || imagePointer.path !== item.path || !(event.buttons & 1) || Math.hypot(event.clientX - imagePointer.x, event.clientY - imagePointer.y) < 5) return;
  imagePointer = null; suppressImageClickUntil = Date.now() + 1500;
  event.preventDefault();
  window.chrome.webview.postMessage({ action: 'drag-image', url: getDownloadURL(source, item.path, false), name: item.name, version: String(item.modified || item.time) + ':' + item.size });
}
function imagePointerUp() { imagePointer = null; }
function imageClick(event, item) { if (Date.now() < suppressImageClickUntil) { event.preventDefault(); return; } openFile(item); }
watch(notice, value => { window.clearTimeout(noticeTimer); if (value) noticeTimer = window.setTimeout(() => { notice.value = ''; }, 2500); });
watch(() => state.upload?.isUploading, (current, previous) => { if (previous && !current) void refresh(); });
watch(preview, async (value) => { if (value) { await nextTick(); previewText.value?.focus(); } });
const charCount = (text) => Array.from(text).length;
const firstLine = (text) => text.split(/\r?\n/).find(line => line.trim())?.slice(0, 100) || '空白消息';
function formatTime(time) { return time ? new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '时间未知'; }
function formatSize(size) { return size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`; }
function relayFailure(failure, fallback) {
  if (failure?.status === 401) {
    items.value = []; cache.clear(); window.clearInterval(timer);
    error.value = '登录已失效，正在返回登录页，请重新登录后再上传。';
  } else error.value = fallback;
}
async function ensureDirectory() {
  if (await listDirectoryEntries(source, directory)) return;
  try { await post(source, directory, '', false, undefined, {}, true); }
  catch (e) { if (!(await listDirectoryEntries(source, directory))) throw e; }
}
async function refresh() {
  if (loading.value) return;
  loading.value = true;
  try {
    await ensureDirectory();
    const [root, entries] = await Promise.all([fetchFiles(source, '/'), listDirectoryEntries(source, directory)]);
    if (!entries) throw new Error('无法读取消息目录');
    const names = [...entries.entries()].filter(([name, entry]) => /^\d{13}-[a-f0-9-]+\.txt$/.test(name) && entry.type !== 'directory' && entry.size <= 131072).map(([name]) => name).sort().slice(-100);
    await Promise.all(names.filter(name => !cache.has(name)).map(async name => {
      const file = await fetchFiles(source, directory + name, true);
      cache.set(name, file.content === 'empty-file-x6OlSil' ? '' : String(file.content || ''));
    }));
    for (const name of cache.keys()) if (!names.includes(name)) cache.delete(name);
    if (active) {
      items.value = [...(root.items || []).filter(item => item.name !== '.text-relay').map(item => ({ ...item, path: item.path || '/' + item.name, kind: 'file', time: Date.parse(item.modified) || 0 })), ...names.map(name => ({ name, path: directory + name, text: cache.get(name), kind: 'message', time: Number(name.slice(0, 13)) }))].sort((a, b) => b.time - a.time || a.name.localeCompare(b.name));
      error.value = '';
    }
  } catch (failure) { if (active) relayFailure(failure, '无法加载内容，请检查网络或重新登录。'); }
  finally { if (active) loading.value = false; }
}
async function sendOrPaste() {
  if (sending.value) return;
  sending.value = true;
  try {
    if (!draft.value.trim()) {
      try {
        const content = await readRelayClipboard();
        if (content.files.length) { if (await queueUploads(content.files)) notice.value = '图片已加入上传队列'; return; }
        draft.value = content.text;
      } catch { error.value = '无法读取剪贴板。电脑可按 Ctrl+V；图片也可上传或拖入。'; return; }
    }
    const text = draft.value;
    if (!text.trim()) { error.value = '剪贴板中没有可发送的文字。'; return; }
    if (text.length > 32000) { draft.value = ''; error.value = '文字超过 32,000 字符，请缩短后重新复制。'; return; }
    await ensureDirectory();
    const name = `${Date.now()}-${crypto.randomUUID()}.txt`;
    await post(source, directory + name, new Blob([text], { type: 'text/plain;charset=utf-8' }));
    cache.set(name, text);
    if (draft.value === text) draft.value = '';
    notice.value = '已发送'; error.value = '';
    await refresh();
  } catch (failure) { relayFailure(failure, '发送失败，文字已保留；点击「重试发送」。'); }
  finally { sending.value = false; }
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); notice.value = '已复制全文'; error.value = ''; }
  catch { error.value = '无法自动复制，请打开全屏预览并手动选择复制。'; }
}
async function upload(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  await queueUploads(files);
}
async function queueUploads(files) {
  if (!files.length) return;
  if (files.some(file => file.name === '.text-relay')) { error.value = '此名称为消息存储保留，请修改文件名。'; return; }
  try {
    mutations.replaceRequest(await fetchFiles(source, '/'));
    mutations.showPrompt({ name: 'upload', props: { targetPath: '/', targetSource: source, initialItems: files } });
    error.value = ''; return true;
  } catch (failure) { relayFailure(failure, '无法打开上传，请检查网络。'); return false; }
}
function hasFiles(event) { return Array.from(event.dataTransfer?.types || []).includes('Files'); }
function dragEnter(event) { if (!hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); dragDepth++; dragging.value = true; }
function dragOver(event) { if (!hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; dragging.value = true; }
function dragLeave(event) { if (!dragging.value) return; event.preventDefault(); event.stopPropagation(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dragging.value = false; }
async function dropFiles(event) {
  event.preventDefault(); event.stopPropagation(); dragDepth = 0; dragging.value = false;
  if (Array.from(event.dataTransfer?.items || []).some(item => item.webkitGetAsEntry?.()?.isDirectory)) { error.value = '请拖入文件；上传文件夹请使用完整文件管理。'; return; }
  const files = Array.from(event.dataTransfer?.files || []);
  await queueUploads(files);
}
function openFull() {
  if (nativeClient) window.chrome.webview.postMessage({ action: 'open-full' });
  else window.location.assign(new URL('chat', document.baseURI).pathname);
}
function nativeAction(action) { if (nativeClient) window.chrome.webview.postMessage({ action }); }
function nativeCommand(event) {
  if (!nativeClient || event.data?.type !== 'personal-relay-command') return;
  if (event.data.action === 'devices') devicesOpen.value = true;
  if (event.data.action === 'drag-status') { notice.value = event.data.text; error.value = ''; suppressImageClickUntil = Date.now() + 500; }
  if (event.data.action === 'drag-error') error.value = event.data.text;
  if (event.data.action === 'drag-auth-expired') void renew().then(() => { notice.value = '登录已恢复，请再次拖动'; }).catch(failure => relayFailure(failure, '请重新登录后拖动图片'));
  if (event.data.action === 'paste-send' && typeof event.data.text === 'string' && !sending.value) {
    if (draft.value && error.value) { notice.value = '有未发送的文字，请先重试发送。'; return; }
    draft.value = event.data.text;
    if (draft.value.trim()) void sendOrPaste();
    else error.value = '剪贴板中没有可发送的文字。';
  }
  if (event.data.action === 'upload') fileInput.value?.click();
  if (event.data.action === 'paste-image' && typeof event.data.base64 === 'string' && event.data.base64.length <= 46000000) {
    try {
      const bytes = Uint8Array.from(atob(event.data.base64), character => character.charCodeAt(0));
      const file = clipboardImageFile(new Blob([bytes], { type: 'image/png' }));
      void queueUploads([file]);
    } catch { error.value = '无法读取图片，请用文件上传。'; }
  }
}
async function pasteEvent(event) {
  if (sending.value || event.target.closest?.('input,textarea,[contenteditable=true]')) return;
  const files = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'));
  const text = event.clipboardData?.getData('text/plain') || '';
  if (!files.length && !text.trim()) return;
  event.preventDefault();
  if (files.length) { await queueUploads(files); return; }
  if (draft.value && error.value) { notice.value = '请先重试未发送的文字。'; return; }
  draft.value = text; await sendOrPaste();
}
function openFile(item) { void router.push('/files/Personal/' + item.path.split('/').filter(Boolean).map(encodeURIComponent).join('/') + (item.type === 'directory' ? '/' : '')); }
async function remove(item) {
  if (!window.confirm(`永久删除${item.kind === 'message' ? '这条消息' : '「' + item.name + '」'}？此操作无法撤销。`)) return;
  try { await bulkDelete([{ source, path: item.path }]); cache.delete(item.name); notice.value = '已删除'; await refresh(); }
  catch { error.value = '删除失败，请重试。'; }
}
async function rename(item) {
  const name = window.prompt('输入新的文件名', item.name);
  if (name === null || name === item.name) return;
  if (!name.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(name) || name.endsWith('.') || name.endsWith(' ') || name === '..' || name === '.text-relay') { error.value = '文件名无效，请使用普通文件名。'; return; }
  try { await moveCopy([{ from: item.path, fromSource: source, to: '/' + name, toSource: source }], 'move', false, true); notice.value = '已重命名'; await refresh(); }
  catch { error.value = '重命名失败，可能有同名文件。'; }
}
async function install() {
  if (isStandalone()) { notice.value = '已经在桌面应用中打开。'; return; }
  if (!installAvailable.value) { installHelp.value = true; return; }
  try { notice.value = await promptInstall() ? '已确认安装，请查看桌面。' : '已取消安装，可随时重试。'; }
  catch { installHelp.value = true; }
}
onMounted(() => {
  document.documentElement.classList.add('relay-page');
  document.documentElement.classList.toggle('relay-compact-page', compact);
  document.documentElement.classList.toggle('relay-native-page', nativeClient);
  window.chrome?.webview?.addEventListener('message', nativeCommand);
  document.addEventListener('paste', pasteEvent);
  void refresh(); timer = window.setInterval(refresh, 5000);
});
onBeforeUnmount(() => {
  active = false; window.clearInterval(timer);
  window.clearTimeout(noticeTimer);
  document.removeEventListener('paste', pasteEvent);
  document.documentElement.classList.remove('relay-page', 'relay-compact-page', 'relay-native-page');
  window.chrome?.webview?.removeEventListener('message', nativeCommand);
});
</script>

<style scoped>
:global(html.relay-page) { background: #e4eaf0 !important; }
:global(html.relay-page body),:global(html.relay-page #app) { background: transparent !important; padding-top: 0; }
:global(html.relay-page #main.relay-main) { background: radial-gradient(ellipse at 10% 15%,#c0d1df 0%,transparent 55%),radial-gradient(ellipse at 90% 70%,#d0d9e4 0%,transparent 58%),linear-gradient(140deg,#e9edf2,#e0e9e9) !important; padding: 24px 10px !important; }
.relay { color-scheme: light dark; --ink: light-dark(#2c3949,#e4eaf2); --muted: light-dark(#657489,#afbdcc); --line: light-dark(#5b708812,#bdcfe51a); --card: light-dark(#f7faff9c,#34415299); --accent: light-dark(#526f99,#9bb5da); --on-accent: light-dark(#ffffff,#1d2e47); --soft: light-dark(#627e9d10,#b1c6e314); --icon: light-dark(#e6edf5,#3b4c61); --icon-ink: light-dark(#617b9d,#b7c9e1); color: var(--ink); font: 12px/1.4 'Segoe UI','Microsoft YaHei',sans-serif; flex: 0 0 auto; width: min(100%,340px); margin: 0 auto; padding: 12px; border: 1px solid var(--line); border-radius: 15px; background: light-dark(#f1f5f98f,#2633428f); backdrop-filter: blur(32px) saturate(120%); -webkit-backdrop-filter: blur(32px) saturate(120%); box-shadow: 0 12px 40px #293b5012; }
.relay [hidden] { display: none; }.relay button,.relay a,.relay-preview button,.relay-install button { font: inherit; border: 0; color: inherit; cursor: pointer; text-decoration: none; }.relay button:focus-visible,.relay a:focus-visible,.relay-preview button:focus-visible { outline: 2px solid #7898c1; outline-offset: 2px; }.relay button:disabled { opacity: .5; cursor: default; }
.relay-header,.brand,.relay-nav,.list-header,.row-main,.item-meta,.row-actions,.compact-actions,.preview-header { display: flex; align-items: center; }.relay-header { justify-content: space-between; gap: 8px; margin-bottom: 13px; }.brand { gap: 8px; }.brand-icon { width: 27px; height: 27px; display: grid; place-items: center; background: var(--accent); color: var(--on-accent); border-radius: 8px; font-size: 19px; }.relay h1 { font-size: 15px; font-weight: 500; margin: 0; }.relay-nav { gap: 6px; }.relay-nav>* { display: grid; place-items: center; width: 27px; height: 27px; border-radius: 7px; background: var(--soft); font-size: 17px; }
.list-header { justify-content: space-between; color: var(--muted); margin-bottom: 9px; font-size: 11px; }.relay-list { height: 304px; flex: 0 0 304px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #8093aa40 transparent; }
.transfer { height: 96px; min-height: 96px; flex: 0 0 96px; overflow: hidden; background: var(--card); border: 1px solid var(--line); border-radius: 9px; }.relay .row-main { width: 100%; justify-content: flex-start; height: 58px; min-height: 58px; padding: 9px 9px 6px; gap: 8px; background: transparent; text-align: left; }.row-main:hover { background: var(--soft); }.item-icon { display: grid; place-items: center; width: 28px; height: 32px; background: var(--icon); color: var(--icon-ink); border-radius: 7px; flex-shrink: 0; font-size: 17px; }.text-icon { color: var(--icon-ink); background: var(--icon); font-size: 13px; }.item-body { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; }.item-title { font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.item-meta { gap: 3px; color: var(--muted); white-space: nowrap; font-size: 10px; }.copy-mark { color: var(--muted); font-size: 14px; }
.row-actions { gap: 5px; padding: 0 8px 8px; height: 37px; }.row-actions button,.row-actions a { flex: 1; min-width: 0; height: 28px; min-height: 28px; padding: 6px 4px; border-radius: 5px; background: var(--soft); font-size: 11px; text-align: center; white-space: nowrap; }.row-actions .danger { color: light-dark(#906b73,#d2aab3); }.compact-actions { display: grid; grid-template-columns: .85fr 1.25fr; gap: 8px; margin-top: 11px; }.compact-actions button { min-height: 37px; padding: 9px 7px; border-radius: 8px; background: var(--card); font-size: 12px; font-weight: 500; }.relay .primary { color: var(--on-accent); background: var(--accent); }.relay-preview .primary { color: white; background: #526f99; }.relay-error,.relay-notice { margin: 8px 0 0; padding: 6px 8px; border-radius: 6px; font-size: 11px; }.relay-error { background: light-dark(#ffedf0,#57323d); color: light-dark(#a83f54,#f2c5d0); }.relay-notice { color: var(--muted); }.empty { color: var(--muted); text-align: center; padding: 25px 0; }
.relay-drop-overlay { position: fixed; z-index: 11000; inset: 8px; display: grid; place-items: center; color: var(--accent); background: light-dark(#eef3f9d9,#293b50e6); border: 1px dashed #7b94b0; border-radius: 12px; backdrop-filter: blur(16px); pointer-events: none; font-size: 18px; }
.relay-preview { position: fixed; z-index: 10000; inset: 0; display: flex; flex-direction: column; gap: 14px; padding: 18px; color: light-dark(#2c3949,#e4eaf2); background: light-dark(#f4f6f9,#263342); }.preview-header { justify-content: space-between; }.preview-header h2 { margin: 0; font-size: 16px; font-weight: 500; }.relay-preview button,.relay-install button { padding: 9px 14px; border-radius: 7px; background: light-dark(#e7edf4,#3b4c61); }.preview-content { flex: 1; min-height: 0; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; font: 15px/1.8 'Segoe UI','Microsoft YaHei',sans-serif; margin: 0; padding: 8px 0; }.relay-install { position: fixed; z-index: 10001; inset: 0; display: grid; place-items: center; background: #18263d66; padding: 20px; }.relay-install>div { max-width: 320px; padding: 22px; background: light-dark(#f4f6f9,#263342); color: light-dark(#2c3949,#e4eaf2); border-radius: 12px; }.relay-install p { font-size: 13px; margin: 0 0 15px; }
:global(html.relay-native-page),:global(html.relay-native-page body),:global(html.relay-native-page #app),:global(html.relay-native-page #main.relay-main) { background: transparent !important; }
:global(html.relay-native-page #main.relay-main) { padding: 0 !important; }
:global(html.relay-native-page .relay) { width: 100%; margin: 0; border: 0; border-radius: 0; box-shadow: none; background: light-dark(#edf2f748,#2a374748); }
.relay button:hover,.relay a:hover,.relay-preview button:hover,.relay-install button:hover { box-shadow: none !important; transform: none; }
.relay button,.relay a { transition: background-color .12s, color .12s; }
.row-actions button:hover,.row-actions a:hover,.compact-actions button:not(.primary):hover { background: light-dark(#dce5efb3,#4b5c72b3); }
.relay .primary:hover { filter: brightness(.96); }
.drag-image { cursor: grab !important; touch-action: none; user-select: none; }.drag-image:active { cursor: grabbing !important; }
.native-header { app-region: drag; -webkit-app-region: drag; margin-bottom: 9px; }.native-window-actions { display: flex; gap: 1px; app-region: no-drag; -webkit-app-region: no-drag; }.native-window-actions button { width: 24px; height: 26px; padding: 2px; background: transparent; border-radius: 6px; font-size: 15px; app-region: no-drag; -webkit-app-region: no-drag; }.native-window-actions button:hover { background: var(--soft); }
@media (pointer: coarse) { .row-actions button,.row-actions a { height: 44px; min-height: 44px; }.transfer { height: 112px; min-height: 112px; flex-basis: 112px; }.row-actions { height: 53px; }.relay-list { height: 352px; flex-basis: 352px; }.compact-actions button { min-height: 44px; } }
</style>

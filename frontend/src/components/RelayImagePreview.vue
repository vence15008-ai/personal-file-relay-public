<!-- Personal File Relay addition: lightweight single-image preview (2026-11-06). -->
<template>
  <Teleport to="body"><section ref="dialog" class="relay-image-preview" role="dialog" aria-modal="true" aria-labelledby="relay-image-title" tabindex="-1" @keydown.esc.prevent="close" @keydown.tab="trapFocus">
    <header><h2 id="relay-image-title">{{ item.name }}</h2><button type="button" @click="close">关闭</button></header>
    <div class="image-stage" :class="{ 'original-image': original }">
      <img v-if="imageUrl" :key="imageUrl" :src="imageUrl" :alt="item.name" draggable="false" decoding="async" @load="imageLoaded" @error="imageFailed">
      <p v-if="loading" class="image-status" role="status">{{ original ? '正在加载原图…' : '正在加载预览…' }}</p>
      <p v-if="error" class="image-status image-error" role="alert">{{ error }}</p>
    </div>
    <footer><button type="button" @click="load(false)">{{ original ? '适屏预览' : '重试' }}</button><button type="button" :disabled="item.size > MAX_ORIGINAL_IMAGE_BYTES || (original && loading)" @click="load(true)">查看原图</button><a :href="downloadUrl" :download="item.name">下载</a><button v-if="fullscreenAvailable" type="button" @click="fullscreen">全屏</button></footer>
  </section></Teleport>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getDownloadURL } from '@/api/resources';
import { loadRelayImage, MAX_ORIGINAL_IMAGE_BYTES } from '@/utils/relayImagePreview';
const props = defineProps({ source: { type: String, required: true }, item: { type: Object, required: true } });
const emit = defineEmits(['close']);
const dialog = ref(null), imageUrl = ref(''), loading = ref(false), error = ref(''), original = ref(false);
const downloadUrl = computed(() => getDownloadURL(props.source, props.item.path, false));
const fullscreenAvailable = !window.chrome?.webview && document.fullscreenEnabled;
let controller, timer, generation = 0, destroyed = false, previousFocus;
function releaseImage() { if (imageUrl.value) { URL.revokeObjectURL(imageUrl.value); imageUrl.value = ''; } }
function cancel() { controller?.abort(); window.clearTimeout(timer); }
async function load(full) {
  cancel(); releaseImage(); const current = ++generation;
  controller = new AbortController(); loading.value = true; error.value = ''; original.value = full;
  let timedOut = false;
  timer = window.setTimeout(() => {
    if (destroyed || current !== generation) return;
    timedOut = true; controller.abort(); releaseImage(); loading.value = false; error.value = '加载超时，请重试或下载原图。';
  }, 30000);
  try {
    const blob = await loadRelayImage(props.source, props.item, full, controller.signal);
    if (destroyed || timedOut || current !== generation) return;
    imageUrl.value = URL.createObjectURL(blob);
  } catch (failure) {
    if (destroyed || timedOut || current !== generation) return;
    loading.value = false; window.clearTimeout(timer);
    if (failure.status === 401) { emit('close'); return; }
    const statusMessages = { 400: '此格式暂时无法生成预览，可尝试查看原图或下载。', 403: '没有这张图片的预览权限，请检查账号。', 404: '图片已被移动或删除，请返回列表刷新。', 415: '此格式暂时无法生成预览，可尝试查看原图或下载。', 429: '请求过于频繁，请稍后重试。', 501: '此格式暂时无法生成预览，可尝试查看原图或下载。' };
    error.value = failure.status ? statusMessages[failure.status] || '预览服务暂时不可用，请稍后重试或下载原图。' : failure.name === 'AbortError' ? '图片加载已取消，请重试。' : failure.message || '预览失败，请重试或下载原图。';
  }
}
function imageLoaded(event) { if (event.target.getAttribute('src') !== imageUrl.value) return; loading.value = false; window.clearTimeout(timer); }
function imageFailed(event) { if (event.target.getAttribute('src') !== imageUrl.value) return; loading.value = false; window.clearTimeout(timer); releaseImage(); error.value = '当前浏览器无法显示这张图片，请下载后查看。'; }
async function close() { generation++; cancel(); releaseImage(); if (document.fullscreenElement === dialog.value) await document.exitFullscreen().catch(() => {}); emit('close'); }
async function fullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await dialog.value.requestFullscreen(); } catch { /* OS or browser may deny fullscreen; the preview remains usable. */ } }
function trapFocus(event) {
  const controls = [...dialog.value.querySelectorAll('button:not(:disabled),a[href]')];
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
watch(() => JSON.stringify([props.source, props.item.path, props.item.modified, props.item.size]), () => { void load(false); }, { immediate: true });
onMounted(async () => { previousFocus = document.activeElement; await nextTick(); dialog.value?.focus(); });
onBeforeUnmount(() => { destroyed = true; generation++; cancel(); releaseImage(); previousFocus?.focus?.(); });
</script>
<style scoped>
.relay-image-preview { color-scheme: light dark; position:fixed; inset:0; z-index:10000; display:flex; flex-direction:column; gap:10px; padding:12px; box-sizing:border-box; color:light-dark(#2c3949,#e4eaf2); background:light-dark(#eef2f6,#202b39); font:13px/1.4 'Segoe UI','Microsoft YaHei',sans-serif; }
header,footer { display:flex; align-items:center; gap:6px; flex-shrink:0; } header { justify-content:space-between; } h2 { min-width:0; margin:0; font-size:14px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } button,a { flex-shrink:0; font:inherit; text-decoration:none; padding:8px 10px; border:0; border-radius:6px; cursor:pointer; color:inherit; background:light-dark(#dfe7ef,#39495c); } button:disabled { opacity:.45; cursor:default; } button:focus-visible,a:focus-visible { outline:2px solid #7898c1; outline-offset:2px; } footer>* { flex:1; text-align:center; white-space:nowrap; }
.image-stage { position:relative; flex:1; min-height:0; display:flex; align-items:center; justify-content:center; overflow:auto; border-radius:8px; background:light-dark(#e4eaf0,#17212e); } img { display:block; max-width:100%; max-height:100%; object-fit:contain; flex-shrink:0; } .image-status { position:absolute; margin:0; padding:10px 14px; border-radius:7px; background:light-dark(#f3f6f9ed,#263342ed); text-align:center; } .image-error { color:light-dark(#994253,#e8b7c0); } .original-image img { max-width:100%; max-height:100%; }
</style>

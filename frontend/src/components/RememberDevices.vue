<!-- Personal File Relay addition: revocable 90-day browser credentials (2026-11-05). -->
<template>
  <Teleport to="body"><div class="remember-overlay" @keydown.esc="$emit('close')"><section class="remember-panel" role="dialog" aria-modal="true" aria-labelledby="devices-title">
    <header><h2 id="devices-title">登录设备</h2><button type="button" @click="$emit('close')">关闭</button></header>
    <p>记住当前浏览器 / 桌面应用 90 天。清除网站数据后需重新授权。</p>
    <form @submit.prevent="enroll">
      <label>设备名称<input v-model="label" maxlength="60" required autocomplete="off"></label>
      <label>当前密码<input v-model="password" type="password" required autocomplete="current-password"></label>
      <label v-if="state.user?.otpEnabled">验证码<input v-model="otp" inputmode="numeric" autocomplete="one-time-code"></label>
      <button type="submit" :disabled="busy">记住当前设备 90 天</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <ul><li v-for="device in devices" :key="device.id"><div><strong>{{ device.label }}{{ device.current ? ' · 当前' : '' }}</strong><small>授权 {{ date(device.created) }} · 到期 {{ date(device.expires) }}</small><small>最近使用 {{ date(device.lastUsed) }}</small></div><button type="button" :disabled="busy" @click="revoke(device)">撤销</button></li></ul>
    <p v-if="!devices.length">尚无已记住的设备</p>
    <button type="button" :disabled="busy" @click="logout()">退出登录并忘记当前设备</button>
  </section></div></Teleport>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { state } from '@/store';
import { login, beginPasskeyLogin } from '@/api/auth';
import { fetchURL } from '@/api/utils';
import { getApiPath } from '@/utils/url';
import { renew, initAuth, sessionExpired, logout } from '@/utils/auth';
defineEmits(['close']);
const devices = ref([]), label = ref(/Android/i.test(navigator.userAgent) ? '安卓手机' : /Windows/i.test(navigator.userAgent) ? 'Windows 电脑' : /Macintosh/i.test(navigator.userAgent) ? 'Mac 电脑' : '个人浏览器');
const password = ref(''), otp = ref(''), busy = ref(false), error = ref(''), notice = ref('');
const date = seconds => new Date(seconds * 1000).toLocaleString('zh-CN');
async function load() { await renew(); const res = await fetchURL(getApiPath('auth/remember/devices')); devices.value = await res.json(); }
async function enroll() {
  if (busy.value) return; busy.value = true; error.value = ''; notice.value = '';
  try {
    try { await login(state.user.username, password.value, '', otp.value, true, label.value); }
    catch (failure) { if (!failure.message.includes('passkey MFA is required')) throw failure; await beginPasskeyLogin(state.user.username, password.value, true, label.value); }
    await initAuth(); await load(); notice.value = '已记住当前设备，有效期 90 天';
  } catch { error.value = '授权失败，请检查密码和验证码；如需人机验证，请退出后从登录页授权。'; }
  finally { password.value = ''; otp.value = ''; busy.value = false; }
}
async function revoke(device) {
  if (!window.confirm(`撤销「${device.label}」？该设备将需要重新登录。`)) return;
  busy.value = true; error.value = '';
  try { await fetchURL(getApiPath(`auth/remember/devices/${encodeURIComponent(device.id)}`), { method: 'DELETE', headers: { 'X-Relay-Request': '1' } }); if (device.current) sessionExpired(); else { await load(); notice.value = '已撤销，该设备的现有登录也已失效'; } }
  catch { error.value = '撤销失败，请重试'; } finally { busy.value = false; }
}
onMounted(() => { void load().catch(() => { error.value = '无法读取登录设备，请检查网络'; }); });
</script>
<style scoped>
.remember-overlay { position:fixed; inset:0; z-index:10050; background:#17233360; display:flex; align-items:center; justify-content:center; padding:12px; }
.remember-panel { color-scheme: light dark; color:light-dark(#2c3949,#e4eaf2); background:light-dark(#f2f5f9,#263342); width:min(100%,480px); max-height:90dvh; overflow:auto; border-radius:14px; padding:16px; font:13px/1.5 'Segoe UI','Microsoft YaHei',sans-serif; }
header,li { display:flex; align-items:center; justify-content:space-between; gap:12px; } h2 { font-size:16px; margin:0; } p { margin:10px 0; } form { display:grid; gap:8px; } label { display:grid; gap:3px; } input { width:100%; box-sizing:border-box; padding:8px; border:1px solid #71849b40; border-radius:6px; background:transparent; color:inherit; } button { padding:7px 10px; border:0; border-radius:6px; cursor:pointer; color:inherit; background:#71849b20; } button:disabled { opacity:.5; } ul { list-style:none; padding:0; } li { border-top:1px solid #71849b30; padding:10px 0; } small { display:block; opacity:.7; }
</style>

// @vitest-environment jsdom
// Personal File Relay: preview cleanup and interaction regression tests (2026-11-06).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
const mocks=vi.hoisted(()=>({load:vi.fn(),close:vi.fn()}));
vi.mock('@/utils/relayImagePreview',()=>({loadRelayImage:mocks.load,MAX_ORIGINAL_IMAGE_BYTES:32*1024*1024}));
vi.mock('@/api/resources',()=>({getDownloadURL:()=>'/api/resources/download?synthetic'}));
import RelayImagePreview from './RelayImagePreview.vue';
let app,root;
const flush=async()=>{for(let i=0;i<12;i++){await Promise.resolve();await nextTick();}};
const button = text => [...document.querySelectorAll('.relay-image-preview button')].find(b=>b.textContent===text);
function mount(){root=document.createElement('div');document.body.appendChild(root);app=createApp(RelayImagePreview,{source:'Personal',item:{name:'synthetic.png',path:'/synthetic.png',size:100,modified:'2026-11-06'},onClose:mocks.close});app.mount(root);}
beforeEach(()=>{vi.clearAllMocks();mocks.load.mockResolvedValue(new Blob(['synthetic'],{type:'image/png'}));vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:synthetic'),revokeObjectURL:vi.fn()}));});
afterEach(()=>{app?.unmount();root?.remove();vi.useRealTimers();vi.unstubAllGlobals();});
describe('lightweight image dialog',()=>{
  it('displays only requested preview and allows explicit original loading',async()=>{mount();await flush();expect(mocks.load).toHaveBeenCalledTimes(1);expect(mocks.load.mock.calls[0][2]).toBe(false);let img=document.querySelector('.relay-image-preview img');img.dispatchEvent(new Event('load'));await flush();expect(document.querySelector('[role=status]')).toBeNull();button('查看原图').click();await flush();expect(mocks.load.mock.calls[1][2]).toBe(true);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');});
  it('aborts a pending request and prevents creating late object URLs after close',async()=>{let resolve;mocks.load.mockImplementation(()=>new Promise(r=>resolve=r));mount();await flush();const signal=mocks.load.mock.calls[0][3];button('关闭').click();await flush();expect(signal.aborted).toBe(true);expect(mocks.close).toHaveBeenCalledOnce();resolve(new Blob(['late']));await flush();expect(URL.createObjectURL).not.toHaveBeenCalled();});
  it('shows a decode error without token retry loops or automatic original requests',async()=>{mount();await flush();document.querySelector('.relay-image-preview img').dispatchEvent(new Event('error'));await flush();expect(document.querySelector('[role=alert]').textContent).toContain('浏览器无法显示');expect(mocks.load).toHaveBeenCalledOnce();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');});
  it('retries a failed preview and closes after terminal 401',async()=>{mocks.load.mockRejectedValueOnce(new Error('synthetic outage'));mount();await flush();expect(document.querySelector('[role=alert]').textContent).toContain('outage');mocks.load.mockRejectedValueOnce(Object.assign(new Error('unauthorized'),{status:401}));button('重试').click();await flush();expect(mocks.load).toHaveBeenCalledTimes(2);expect(mocks.close).toHaveBeenCalledOnce();});
  it('times out a stalled request and releases its signal',async()=>{vi.useFakeTimers();mocks.load.mockImplementation(()=>new Promise(()=>{}));mount();await flush();await vi.advanceTimersByTimeAsync(30000);await flush();expect(mocks.load.mock.calls[0][3].aborted).toBe(true);expect(document.querySelector('[role=alert]').textContent).toContain('超时');});
  it('revokes the object URL when unmounted',async()=>{mount();await flush();app.unmount();app=null;expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');});
  it('shows a readable status message without exposing a raw server error',async()=>{mocks.load.mockRejectedValueOnce(Object.assign(new Error('{"message":"internal synthetic path"}'),{status:500}));mount();await flush();expect(document.querySelector('[role=alert]').textContent).toContain('暂时不可用');expect(document.querySelector('[role=alert]').textContent).not.toContain('internal synthetic');});
});

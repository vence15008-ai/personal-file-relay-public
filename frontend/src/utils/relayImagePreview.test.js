// @vitest-environment jsdom
// Personal File Relay: preview size, authorization and resource regression tests (2026-11-06).
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), preview: vi.fn(), download: vi.fn() }));
vi.mock('@/api/utils', () => ({ fetchURL: mocks.fetch }));
vi.mock('@/api/resources', () => ({ getPreviewURL: mocks.preview, getDownloadURL: mocks.download }));
import { isRelayImage, loadRelayImage, MAX_ORIGINAL_IMAGE_BYTES, MAX_PREVIEW_IMAGE_BYTES } from './relayImagePreview';
const item = { name: '中文 & photo.png', path: '/中文 & photo.png', size: 6000000, modified: '2026-11-06T00:00:00Z' };
beforeEach(() => { vi.resetAllMocks(); mocks.preview.mockReturnValue('/api/resources/preview?source=Personal&path=synthetic'); mocks.download.mockReturnValue('/api/resources/download?source=Personal&file=synthetic&inline=true'); });
describe('single-image preview requests', () => {
  it('requests only a bounded xlarge preview with cancellation and auth validation', async () => {
    const signal = new AbortController().signal;
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array([1,2,3]), { headers: { 'Content-Type': 'image/png' } }));
    const blob = await loadRelayImage('Personal', item, false, signal);
    expect(blob.size).toBe(3); expect(blob.type).toBe('image/png'); expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledWith('/api/resources/preview?source=Personal&path=synthetic&size=xlarge', expect.objectContaining({ signal, cache: 'no-cache' }));
    expect(mocks.preview).toHaveBeenCalledWith('Personal', item.path, item.modified); expect(mocks.download).not.toHaveBeenCalled();
  });
  it('loads original bytes only after an explicit original request', async () => {
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'image/jpeg' } }));
    await loadRelayImage('Personal', item, true); expect(mocks.download).toHaveBeenCalledWith('Personal', item.path, true); expect(mocks.preview).not.toHaveBeenCalled();
  });
  it('does not automatically download an original when preview or auth fails', async () => {
    const failure = Object.assign(new Error('unauthorized'), { status: 401 }); mocks.fetch.mockRejectedValue(failure);
    await expect(loadRelayImage('Personal', item, false)).rejects.toBe(failure); expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it('rejects oversized originals before requesting them', async () => {
    await expect(loadRelayImage('Personal', { ...item, size: MAX_ORIGINAL_IMAGE_BYTES+1 }, true)).rejects.toThrow('32MB'); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('rejects oversized preview content-length without reading it', async () => {
    const cancel=vi.fn().mockResolvedValue(); mocks.fetch.mockResolvedValue({ status:200, headers:new Headers({'Content-Type':'image/jpeg','Content-Length':String(MAX_PREVIEW_IMAGE_BYTES+1)}),body:{cancel} });
    await expect(loadRelayImage('Personal', item, false)).rejects.toThrow('大小限制'); expect(cancel).toHaveBeenCalledOnce();
  });
  it('cancels streaming content as soon as it exceeds the limit', async () => {
    const cancel=vi.fn().mockResolvedValue(), releaseLock=vi.fn(); let count=0;
    mocks.fetch.mockResolvedValue({status:200,headers:new Headers({'Content-Type':'image/png'}),body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(++count===1?MAX_PREVIEW_IMAGE_BYTES:1)}),cancel,releaseLock})}});
    await expect(loadRelayImage('Personal',item,false)).rejects.toThrow('大小限制'); expect(count).toBe(2); expect(cancel).toHaveBeenCalledOnce(); expect(releaseLock).toHaveBeenCalledOnce();
  });
  it.each(['text/html','application/json','image/svg+xml'])('rejects non-display responses: %s',async type=>{
    mocks.fetch.mockResolvedValue(new Response('synthetic',{headers:{'Content-Type':type}})); await expect(loadRelayImage('Personal',item,false)).rejects.toThrow('可显示的图片');
  });
  it('rejects empty and non-200 image responses',async()=>{
    mocks.fetch.mockResolvedValueOnce(new Response('',{headers:{'Content-Type':'image/png'}})).mockResolvedValueOnce(new Response('synthetic',{status:202,headers:{'Content-Type':'image/png'}}));
    await expect(loadRelayImage('Personal',item,false)).rejects.toThrow('为空'); await expect(loadRelayImage('Personal',item,false)).rejects.toThrow('无法生成');
  });
  it('recognizes supported file names, excluding directories and HTML',()=>{
    for(const name of ['photo.JPG','截图.webp','photo.heic','scan.tiff','image.avif'])expect(isRelayImage({name,type:'image'})).toBe(true);
    expect(isRelayImage({name:'photo.png',type:'directory'})).toBe(false); expect(isRelayImage({name:'page.html'})).toBe(false);
  });
});

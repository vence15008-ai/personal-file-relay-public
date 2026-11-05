// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
const mocks=vi.hoisted(()=>({ api:{listDirectoryEntries:vi.fn(),fetchFiles:vi.fn(),post:vi.fn(),bulkDelete:vi.fn(),moveCopy:vi.fn(),getDownloadURL:vi.fn()}, mutations:{replaceRequest:vi.fn(),showPrompt:vi.fn()},push:vi.fn() }));
vi.mock('@/api/resources',()=>mocks.api);
vi.mock('@/store',()=>({mutations:mocks.mutations,state:{upload:{isUploading:false}}}));
vi.mock('vue-router',()=>({useRouter:()=>({push:mocks.push}),RouterLink:{template:'<a><slot /></a>'}}));
vi.mock('@/utils/pwaInstall',()=>({installAvailable:{value:false},isStandalone:()=>false,promptInstall:vi.fn()}));
import TextRelay from './TextRelay.vue';
const flush=async()=>{for(let i=0;i<20;i++){await Promise.resolve();await nextTick();}};
let app,root,entries,read,copied;
const file={name:'测试.bin',path:'/测试.bin',type:'file',size:2048,modified:'2020-01-01T00:00:00Z'};
beforeEach(()=>{
 vi.clearAllMocks();window.history.replaceState({},'','/chat');
 entries=new Map([['1700000000000-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.txt',{size:20,type:'file'}]]);
 mocks.api.listDirectoryEntries.mockImplementation(async()=>entries);
 mocks.api.fetchFiles.mockImplementation(async(_source,path)=>path==='/'?{source:'Personal',path:'/',items:[file,{name:'.text-relay',type:'directory'}]}:{content:'已有消息 <b>纯文本</b>\n第二行😀'});
 mocks.api.post.mockImplementation(async(_source,path)=>entries.set(path.split('/').pop(),{size:20,type:'file'}));
 mocks.api.getDownloadURL.mockReturnValue('/api/resources/download?file=test');mocks.api.bulkDelete.mockResolvedValue({});
 read=vi.fn().mockResolvedValue('剪贴板文字');copied=vi.fn().mockResolvedValue();
 Object.defineProperty(navigator,'clipboard',{value:{readText:read,writeText:copied},configurable:true});
 Object.defineProperty(globalThis.crypto,'randomUUID',{value:()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',configurable:true});
 vi.spyOn(window,'confirm').mockReturnValue(false);
 root=document.createElement('div');document.body.appendChild(root);app=createApp(TextRelay);app.mount(root);
});
afterEach(()=>{app.unmount();root.remove();vi.restoreAllMocks();});
const paste=()=>[...root.querySelectorAll('.compact-actions button')].find(b=>/粘贴|重试/.test(b.textContent)).click();
describe('minimal relay',()=>{
 it('has no composer on ordinary web, renders safe first lines and copies metadata hotzone',async()=>{
  await flush();expect(root.querySelector('form')).toBeNull();expect(root.querySelector('textarea')).toBeNull();
  const hot=root.querySelector('.message-text');expect(hot.textContent).toContain('已有消息 <b>纯文本</b>');expect(hot.querySelector('b')).toBeNull();expect(hot.textContent).not.toContain('第二行');
  hot.querySelector('time').click();await flush();expect(copied).toHaveBeenCalledWith('已有消息 <b>纯文本</b>\n第二行😀');
  root.querySelector('.message-actions button').click();await flush();const preview=document.querySelector('.preview-content');expect(preview.textContent).toContain('第二行😀');expect(document.querySelector('[role=dialog] textarea')).toBeNull();
 });
 it('pastes text only when clicked, retries retained text and prevents duplicate submits',async()=>{
  await flush();expect(read).not.toHaveBeenCalled();mocks.api.post.mockRejectedValueOnce(new Error('offline'));paste();await flush();expect(root.textContent).toContain('重试发送');paste();paste();await flush();expect(read).toHaveBeenCalledOnce();expect(mocks.api.post).toHaveBeenCalledTimes(2);expect(root.textContent).toContain('粘贴并发送');
 });
 it('handles denied, empty and oversized clipboard without posting, and permits a fresh clipboard afterwards',async()=>{
  await flush();read.mockRejectedValueOnce(new Error('denied'));paste();await flush();expect(root.textContent).toContain('无法读取剪贴板');
  read.mockResolvedValueOnce(' ');paste();await flush();expect(root.textContent).toContain('没有可发送');
  read.mockResolvedValueOnce('a'.repeat(32001));paste();await flush();expect(root.textContent).toContain('超过');expect(mocks.api.post).not.toHaveBeenCalled();
  read.mockResolvedValueOnce('缩短');paste();await flush();expect(mocks.api.post).toHaveBeenCalledOnce();
 });
 it('prioritizes an image clipboard item and queues a PNG file instead of an empty message',async()=>{
  await flush();const blob=new Blob(['synthetic PNG bytes'],{type:'image/png'});
  navigator.clipboard.read=vi.fn().mockResolvedValue([{types:['text/plain','image/png'],getType:vi.fn().mockResolvedValue(blob)}]);
  paste();await flush();expect(read).not.toHaveBeenCalled();expect(mocks.api.post).not.toHaveBeenCalled();
  const prompt=mocks.mutations.showPrompt.mock.calls[0][0];expect(prompt.name).toBe('upload');expect(prompt.props.initialItems[0].type).toBe('image/png');expect(prompt.props.initialItems[0].name).toMatch(/^clipboard-.*\.png$/);
 });
 it('supports explicit Ctrl+V paste events without a persistent input box',async()=>{
  await flush();const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{files:[],getData:()=> '粘贴事件文字'}});document.dispatchEvent(event);await flush();expect(mocks.api.post).toHaveBeenCalledOnce();expect(read).not.toHaveBeenCalled();
 });
 it('queues dropped and selected files, protects message storage names and confirms deletion',async()=>{
  await flush();const event=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{types:['Files'],files:[new File(['synthetic'],'dropped.bin')],items:[]}});root.querySelector('.relay').dispatchEvent(event);await flush();expect(mocks.mutations.showPrompt).toHaveBeenCalledOnce();
  const input=root.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[new File(['x'],'.text-relay')]});input.dispatchEvent(new Event('change'));await flush();expect(mocks.mutations.showPrompt).toHaveBeenCalledOnce();expect(root.textContent).toContain('保留');
  root.querySelector('.message-actions .danger').click();await flush();expect(mocks.api.bulkDelete).not.toHaveBeenCalled();window.confirm.mockReturnValue(true);root.querySelector('.message-actions .danger').click();await flush();expect(mocks.api.bulkDelete).toHaveBeenCalledOnce();
 });
});

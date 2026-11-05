const imageExtensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
export function clipboardImageFile(blob) {
  const extension = imageExtensions[blob.type];
  if (!extension) throw new Error('此图片格式请使用文件上传。');
  return new File([blob], 'clipboard-' + Date.now() + '-' + crypto.randomUUID().slice(0, 8) + '.' + extension, { type: blob.type });
}
export async function readRelayClipboard(clipboard = navigator.clipboard) {
  if (!clipboard) throw new Error('浏览器不支持读取剪贴板，请使用 Ctrl+V 或上传。');
  let readFailure;
  if (typeof clipboard.read === 'function') {
    try {
      const entries = await clipboard.read();
      const files = [];
      for (const entry of entries) {
        const type = Object.keys(imageExtensions).find(type => entry.types.includes(type));
        if (type) files.push(clipboardImageFile(await entry.getType(type)));
      }
      if (files.length) return { files, text: '' };
      const textEntry = entries.find(entry => entry.types.includes('text/plain'));
      if (textEntry) return { files: [], text: await (await textEntry.getType('text/plain')).text() };
      if (entries.some(entry => entry.types.some(type => type.startsWith('image/')))) throw new Error('此图片格式请使用文件上传。');
      return { files: [], text: '' };
    } catch (error) { readFailure = error; }
  }
  if (typeof clipboard.readText === 'function') return { files: [], text: await clipboard.readText() };
  throw readFailure || new Error('浏览器不支持读取剪贴板。');
}

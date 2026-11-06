// Personal File Relay addition: bounded, authenticated single-image previews (2026-11-06).
import { getPreviewURL, getDownloadURL } from '@/api/resources';
import { fetchURL } from '@/api/utils';

export const MAX_ORIGINAL_IMAGE_BYTES = 32 * 1024 * 1024;
export const MAX_PREVIEW_IMAGE_BYTES = 8 * 1024 * 1024;
export const isRelayImage = item => item?.type !== 'directory' && /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif|tiff?)$/i.test(item?.name || '');

async function boundedBlob(response, limit) {
  const type = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!type.startsWith('image/') || type === 'image/svg+xml') {
    await response.body?.cancel();
    throw new Error('服务器没有返回可显示的图片，请重试或下载原图。');
  }
  if (Number(response.headers.get('Content-Length')) > limit) {
    await response.body?.cancel();
    throw new Error('图片超过预览大小限制，请下载后查看。');
  }
  if (!response.body?.getReader) {
    const blob = await response.blob();
    if (blob.size > limit) throw new Error('图片超过预览大小限制，请下载后查看。');
    return blob;
  }
  const reader = response.body.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error('图片超过预览大小限制，请下载后查看。'); }
      chunks.push(value);
    }
    if (!length) throw new Error('图片内容为空，请重试。');
    return new Blob(chunks, { type });
  } finally { reader.releaseLock(); }
}

export async function loadRelayImage(source, item, original, signal) {
  if (original && item.size > MAX_ORIGINAL_IMAGE_BYTES) throw new Error('原图超过32MB，请下载后查看。');
  const url = original ? getDownloadURL(source, item.path, true) : getPreviewURL(source, item.path, item.modified) + '&size=xlarge';
  const response = await fetchURL(url, { signal, cache: 'no-cache', headers: { Accept: 'image/*' } });
  if (response.status !== 200) { await response.body?.cancel(); throw new Error('暂时无法生成图片预览，请重试或下载原图。'); }
  return boundedBlob(response, original ? MAX_ORIGINAL_IMAGE_BYTES : MAX_PREVIEW_IMAGE_BYTES);
}

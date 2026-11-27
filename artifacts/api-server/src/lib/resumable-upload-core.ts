export type ReceivedUploadChunk = { index: number; offset: number; size: number };

export function expectedUploadChunkSize(totalBytes: number, chunkBytes: number, index: number): number {
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 1 || !Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || !Number.isSafeInteger(index) || index < 0) return 0;
  const offset = index * chunkBytes;
  if (!Number.isSafeInteger(offset) || offset >= totalBytes) return 0;
  return Math.min(chunkBytes, totalBytes - offset);
}

export function validateUploadChunk(totalBytes: number, chunkBytes: number, index: number, offset: number, size: number): boolean {
  return Number.isSafeInteger(offset) && Number.isSafeInteger(size) && offset === index * chunkBytes && size === expectedUploadChunkSize(totalBytes, chunkBytes, index) && size > 0;
}

export function contiguousUploadOffset(chunks: ReceivedUploadChunk[]): number {
  let offset = 0;
  for (const chunk of [...chunks].sort((a,b)=>a.index-b.index)) {
    if (chunk.index !== Math.floor(offset / Math.max(1, chunk.size)) && chunk.offset !== offset) {
      if (chunk.offset !== offset) break;
    }
    if (chunk.offset !== offset || chunk.size <= 0) break;
    offset += chunk.size;
  }
  return offset;
}

export function uploadIsComplete(totalBytes: number, chunkBytes: number, chunks: ReceivedUploadChunk[]): boolean {
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 1 || !Number.isSafeInteger(chunkBytes) || chunkBytes < 1) return false;
  const expectedCount = Math.ceil(totalBytes / chunkBytes);
  const ordered = [...chunks].sort((a,b)=>a.index-b.index);
  if (ordered.length !== expectedCount) return false;
  let offset = 0;
  for (let i=0;i<ordered.length;i++) {
    const chunk = ordered[i];
    if (chunk.index !== i || chunk.offset !== offset || chunk.size !== expectedUploadChunkSize(totalBytes,chunkBytes,i)) return false;
    offset += chunk.size;
  }
  return offset === totalBytes;
}

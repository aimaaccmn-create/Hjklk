import JSZip from 'jszip';
import {
  processFileInStreamingChunks,
  getCachedFileSha256,
  opfsScratchDisk,
} from './hardware-optimizer';

export interface BatchRenameConfig {
  prefix: string;
  suffix: string;
  findText: string;
  replaceText: string;
  baseNameOverride: string;
  startIndex: number;
  zeroPadDigits: 0 | 2 | 3 | 4;
  includeDateStamp: boolean;
  lowercaseExtension: boolean;
}

export interface BatchRenamedPreviewItem {
  id: string;
  file: File;
  originalName: string;
  newName: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * FEATURE #25: Smart Batch File Renamer & Pattern Packager (ZIP)
 * Computes live preview filenames and packages renamed files into a zero-overhead STORE ZIP archive
 */
export function computeBatchRenamedList(
  files: File[],
  config: BatchRenameConfig
): BatchRenamedPreviewItem[] {
  const dateTag = config.includeDateStamp
    ? `-${new Date().toISOString().slice(0, 10)}`
    : '';

  return files.map((file, idx) => {
    const dotIdx = file.name.lastIndexOf('.');
    const rawBase =
      dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
    const rawExt =
      dotIdx > 0 ? file.name.slice(dotIdx + 1) : '';

    let base = config.baseNameOverride.trim()
      ? config.baseNameOverride.trim()
      : rawBase;

    if (config.findText) {
      base = base.split(config.findText).join(config.replaceText || '');
    }

    const seqNum = String((config.startIndex || 1) + idx).padStart(
      config.zeroPadDigits || 2,
      '0'
    );
    const extFormatted = config.lowercaseExtension
      ? rawExt.toLowerCase()
      : rawExt;

    const finalBase = `${config.prefix}${base}${dateTag}-${seqNum}${config.suffix}`;
    const safeBase = finalBase.replace(/[\\/:*?"<>|]/g, '-');
    const newName = extFormatted ? `${safeBase}.${extFormatted}` : safeBase;

    return {
      id: `ren-${idx}-${file.name}`,
      file,
      originalName: file.name,
      newName,
      sizeBytes: file.size,
      mimeType: file.type || 'application/octet-stream',
    };
  });
}

export async function packageBatchRenamedFilesToZip(
  items: BatchRenamedPreviewItem[],
  onProgress?: (pct: number) => void
): Promise<{
  zipBlob: Blob;
  zipFilename: string;
  count: number;
  totalBytes: number;
}> {
  if (items.length === 0) {
    throw new Error('حداقل یک فایل برای تغییر نام دسته‌ای انتخاب کنید');
  }

  onProgress?.(12);
  const zip = new JSZip();
  let totalBytes = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const ab = await item.file.arrayBuffer();
    totalBytes += ab.byteLength;
    zip.file(item.newName, ab, { compression: 'STORE' });
    onProgress?.(15 + Math.round(((i + 1) / items.length) * 75));
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
  });
  onProgress?.(100);

  return {
    zipBlob,
    zipFilename: `kronos-batch-renamed-${items.length}-files.zip`,
    count: items.length,
    totalBytes,
  };
}

/**
 * FEATURE #28: AES-256-GCM Client-Side File Vault & SHA-256 Cryptographic Integrity Scanner
 * Binary Header Format for .kronos encrypted vault:
 * [0..7]   Magic ASCII "KRONOSV1" (8 bytes)
 * [8..23]  PBKDF2 Salt (16 bytes)
 * [24..35] AES-GCM IV (12 bytes)
 * [36..37] Metadata JSON byte length uint16 (big-endian)
 * [38..38+metaLen] UTF-8 JSON { name, type, size }
 * [38+metaLen..] AES-256-GCM Ciphertext + 128-bit Auth Tag
 */
const KRONOS_MAGIC = 'KRONOSV1';

async function deriveAes256GcmKey(
  password: string,
  salt: Uint8Array,
  usage: 'encrypt' | 'decrypt'
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer.slice(
        salt.byteOffset,
        salt.byteOffset + salt.byteLength
      ) as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

export async function encryptFileAes256Gcm(
  file: File,
  password: string,
  onProgress?: (pct: number) => void
): Promise<{
  blob: Blob;
  filename: string;
  sha256Hex: string;
  originalSizeBytes: number;
}> {
  if (!password || password.length < 4) {
    throw new Error('رمز عبور باید حداقل ۴ کاراکتر باشد');
  }

  onProgress?.(15);
  // OPTIMIZATION #5: Read file via 4MB Chunked Stream with backpressure
  const chunks: Uint8Array[] = [];
  let totalRead = 0;
  await processFileInStreamingChunks(
    file,
    4 * 1024 * 1024,
    (chunk) => {
      chunks.push(new Uint8Array(chunk));
      totalRead += chunk.byteLength;
    },
    (p) => onProgress?.(15 + Math.round(p * 0.2))
  );

  const rawBytes = new Uint8Array(totalRead);
  let cursor = 0;
  for (const c of chunks) {
    rawBytes.set(c, cursor);
    cursor += c.byteLength;
  }
  const rawBuffer = rawBytes.buffer;

  // OPTIMIZATION #10: Check Speculative Idle Pre-Computed SHA-256 Cache first!
  let sha256Hex = getCachedFileSha256(file) || '';
  if (!sha256Hex) {
    const hashBuf = await window.crypto.subtle.digest('SHA-256', rawBuffer);
    sha256Hex = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  onProgress?.(40);
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAes256GcmKey(password, salt, 'encrypt');

  onProgress?.(65);
  const ciphertextBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    rawBuffer
  );

  const metaJson = JSON.stringify({
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    sha256: sha256Hex,
  });
  const metaBytes = new TextEncoder().encode(metaJson);
  const metaLen = Math.min(65535, metaBytes.byteLength);

  const magicBytes = new TextEncoder().encode(KRONOS_MAGIC);
  const cipherBytes = new Uint8Array(ciphertextBuf);

  const totalLen = 8 + 16 + 12 + 2 + metaLen + cipherBytes.byteLength;
  const outBytes = new Uint8Array(totalLen);

  let offset = 0;
  outBytes.set(magicBytes, offset);
  offset += 8;
  outBytes.set(salt, offset);
  offset += 16;
  outBytes.set(iv, offset);
  offset += 12;
  outBytes[offset] = (metaLen >> 8) & 0xff;
  outBytes[offset + 1] = metaLen & 0xff;
  offset += 2;
  outBytes.set(metaBytes.subarray(0, metaLen), offset);
  offset += metaLen;
  outBytes.set(cipherBytes, offset);

  // OPTIMIZATION #4: Persist encrypted vault copy to OPFS Scratch Disk if available
  opfsScratchDisk
    .writeScratchBuffer(`${file.name}.kronos`, outBytes)
    .catch(() => {});

  onProgress?.(100);
  return {
    blob: new Blob([outBytes], { type: 'application/octet-stream' }),
    filename: `${file.name}.kronos`,
    sha256Hex,
    originalSizeBytes: file.size,
  };
}

export async function decryptFileAes256Gcm(
  vaultFile: File,
  password: string,
  onProgress?: (pct: number) => void
): Promise<{
  blob: Blob;
  filename: string;
  mimeType: string;
  sha256Hex: string;
}> {
  if (!password) {
    throw new Error('لطفاً رمز عبور فایل امنیتی را وارد کنید');
  }

  onProgress?.(15);
  const ab = await vaultFile.arrayBuffer();
  const bytes = new Uint8Array(ab);

  if (bytes.byteLength < 40) {
    throw new Error('فرمت فایل رمزنگاری‌شده معتبر نیست');
  }

  const magic = new TextDecoder().decode(bytes.subarray(0, 8));
  if (magic !== KRONOS_MAGIC) {
    throw new Error('این فایل یک بسته امنیتی استاندارد .kronos نیست');
  }

  const salt = bytes.subarray(8, 24);
  const iv = bytes.subarray(24, 36);
  const metaLen = (bytes[36] << 8) | bytes[37];
  const metaStart = 38;
  const cipherStart = metaStart + metaLen;

  if (cipherStart >= bytes.byteLength) {
    throw new Error('هدر متادیتای فایل رمزنگاری‌شده آسیب دیده است');
  }

  let metaObj: { name?: string; type?: string; sha256?: string } = {};
  try {
    const metaStr = new TextDecoder().decode(
      bytes.subarray(metaStart, cipherStart)
    );
    metaObj = JSON.parse(metaStr);
  } catch {
    metaObj = {};
  }

  onProgress?.(45);
  const key = await deriveAes256GcmKey(password, salt, 'decrypt');
  const cipherSlice = bytes.subarray(cipherStart);

  let decryptedBuf: ArrayBuffer;
  try {
    decryptedBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipherSlice.buffer.slice(
        cipherSlice.byteOffset,
        cipherSlice.byteOffset + cipherSlice.byteLength
      )
    );
  } catch {
    throw new Error(
      'رمز عبور اشتباه است یا اصالت فایل (AES-GCM Auth Tag) تایید نشد!'
    );
  }

  onProgress?.(85);
  const hashBuf = await window.crypto.subtle.digest('SHA-256', decryptedBuf);
  const sha256Hex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const fallbackName = vaultFile.name.replace(/\.kronos$/i, '') || 'decrypted-file';
  const outName = metaObj.name || fallbackName;
  const outMime = metaObj.type || 'application/octet-stream';

  onProgress?.(100);
  return {
    blob: new Blob([decryptedBuf], { type: outMime }),
    filename: outName,
    mimeType: outMime,
    sha256Hex,
  };
}

export interface FileHashAuditItem {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  sha256Hex: string;
  sha1Hex: string;
  magicHexSignature: string;
  isKronosVault: boolean;
}

export async function inspectFilesCryptographicHashes(
  files: File[],
  onProgress?: (pct: number) => void
): Promise<FileHashAuditItem[]> {
  const results: FileHashAuditItem[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ab = await f.arrayBuffer();
    const cachedSha256 = getCachedFileSha256(f);
    const [sha256Buf, sha1Buf] = await Promise.all([
      cachedSha256
        ? Promise.resolve(null)
        : window.crypto.subtle.digest('SHA-256', ab),
      window.crypto.subtle.digest('SHA-1', ab),
    ]);

    const sha256Hex =
      cachedSha256 ||
      Array.from(new Uint8Array(sha256Buf!))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    const sha1Hex = Array.from(new Uint8Array(sha1Buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const headerBytes = new Uint8Array(ab, 0, Math.min(8, ab.byteLength));
    const magicHexSignature = Array.from(headerBytes)
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
    const asciiMagic = new TextDecoder().decode(headerBytes);

    results.push({
      id: `hash-${i}-${Date.now()}`,
      filename: f.name,
      sizeBytes: f.size,
      mimeType: f.type || 'application/octet-stream',
      sha256Hex,
      sha1Hex,
      magicHexSignature,
      isKronosVault: asciiMagic === KRONOS_MAGIC,
    });

    onProgress?.(Math.round(((i + 1) / files.length) * 100));
  }
  return results;
}

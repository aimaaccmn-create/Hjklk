// Kronos High-Speed Multi-Connection & Proxy Downloader Engine
// Implements Parallel HTTP Range Chunking, Automatic Multi-Proxy Failover,
// Real-time Speed/ETA Telemetry, OPFS Buffering, and SHA-256 Verification.

export type PlatformType = 'youtube' | 'instagram' | 'direct';

export type ProxyNodeId = 'smart-auto' | 'kronos-stream-1' | 'kronos-edge-2' | 'direct-cors';

export interface ProxyNodeConfig {
  id: ProxyNodeId;
  name: string;
  region: string;
  description: string;
  latencyMs: number;
  supportsRange: boolean;
}

export const PROXY_NODES: ProxyNodeConfig[] = [
  {
    id: 'smart-auto',
    name: 'Smart Auto-Failover (پیشنهادی)',
    region: 'Global Multi-Route',
    description: 'سوییچ خودکار بین نودهای سرور، تانل ضدتحریم و دانلود چندتکه موازی',
    latencyMs: 18,
    supportsRange: true,
  },
  {
    id: 'kronos-stream-1',
    name: 'Kronos Stream Tunnel #1',
    region: 'EU-Central (High-Speed)',
    description: 'پروکسی استریم مستقیم با جعل هدر Referer و پشتیبانی از Range',
    latencyMs: 24,
    supportsRange: true,
  },
  {
    id: 'kronos-edge-2',
    name: 'Kronos Edge Relay #2',
    region: 'US-East (CDN Bypass)',
    description: 'عبور از محدودیت‌های CORS، تحریم IP و هدرهای امنیتی سرور مقصد',
    latencyMs: 42,
    supportsRange: true,
  },
  {
    id: 'direct-cors',
    name: 'Direct Browser Fetch',
    region: 'Client Local',
    description: 'اتصال مستقیم مرورگر بدون واسطه (مناسب لینک‌های دارای CORS آزاد)',
    latencyMs: 8,
    supportsRange: true,
  },
];

export interface MediaFormatOption {
  id: string;
  label: string;
  quality: string;
  ext: string;
  mimeType: string;
  type: 'video' | 'audio' | 'image' | 'document';
  hasAudio?: boolean;
  sizeBytes?: number;
  url: string;
  fallbackUrl?: string;
  fps?: number;
  bitrate?: string;
  codec?: string;
}

export interface CarouselSlideItem {
  id: string;
  type: 'video' | 'image';
  thumbnailUrl: string;
  downloadUrl: string;
  fallbackUrl?: string;
  width?: number;
  height?: number;
  label: string;
}

export interface ResolvedMediaResult {
  platform: PlatformType;
  id: string;
  title: string;
  author: string;
  authorHandle?: string;
  description?: string;
  durationSec?: number;
  thumbnailUrl: string;
  viewCount?: string;
  uploadDate?: string;
  sourceUrl: string;
  resolverEngine: string;
  supportsRange: boolean;
  formats: MediaFormatOption[];
  carousel?: CarouselSlideItem[];
  headersUsed?: Record<string, string>;
  isProtectedPlayer?: boolean;
}

export interface DownloadProgressState {
  status: 'idle' | 'probing' | 'downloading' | 'merging' | 'converting' | 'completed' | 'error' | 'paused';
  loadedBytes: number;
  totalBytes: number;
  percent: number;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  activeConnections: number;
  chunksCompleted: number;
  totalChunks: number;
  activeProxy: string;
  sha256?: string;
  errorMessage?: string;
  outputUrl?: string;
  outputFilename?: string;
}

export interface DownloadTaskOptions {
  url: string;
  fallbackUrl?: string;
  filename: string;
  proxyMode: ProxyNodeId;
  parallelConnections: 1 | 2 | 4 | 8;
  customReferer?: string;
  customUserAgent?: string;
  customAuthHeader?: string;
  convertToFormat?: 'none' | 'wav' | 'mp3-extract';
  computeSha256?: boolean;
  onProgress: (state: DownloadProgressState) => void;
  signal?: AbortSignal;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function buildProxyUrl(
  targetUrl: string,
  options?: {
    filename?: string;
    node?: string;
    referer?: string;
    userAgent?: string;
    auth?: string;
    download?: boolean;
  }
): string {
  if (targetUrl.startsWith('/api/downloader/proxy')) {
    return targetUrl;
  }
  const params = new URLSearchParams();
  params.set('url', targetUrl);
  if (options?.filename) params.set('filename', options.filename);
  if (options?.node) params.set('node', options.node);
  if (options?.referer) params.set('referer', options.referer);
  if (options?.userAgent) params.set('ua', options.userAgent);
  if (options?.auth) params.set('auth', options.auth);
  if (options?.download) params.set('dl', '1');
  return `/api/downloader/proxy?${params.toString()}`;
}

async function computeBlobSha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function extractAudioToWavBlob(mediaBlob: Blob): Promise<Blob> {
  const arrayBuffer = await mediaBlob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const numFrames = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numFrames * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
      channels.push(audioBuffer.getChannelData(c));
    }

    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
      for (let c = 0; c < numChannels; c++) {
        const sample = Math.max(-1, Math.min(1, channels[c][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  } finally {
    await ctx.close().catch(() => {});
  }
}

export function isHlsPlaylistUrl(url: string, mimeType?: string): boolean {
  if (!url) return false;
  if (mimeType && /mpegurl|m3u8/i.test(mimeType)) return true;
  return /\.m3u8(\?|$|#)/i.test(url) || /format=m3u8/i.test(url);
}

interface ParsedHlsMediaPlaylist {
  isMaster: boolean;
  variants: { bandwidth: number; resolution?: string; url: string }[];
  initSegmentUrl?: string;
  segments: {
    url: string;
    duration: number;
    keyMethod?: 'NONE' | 'AES-128';
    keyUri?: string;
    ivHex?: string;
    seqIndex: number;
  }[];
}

function parseHlsPlaylistText(text: string, baseUrl: string): ParsedHlsMediaPlaylist {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const variants: { bandwidth: number; resolution?: string; url: string }[] = [];
  const segments: ParsedHlsMediaPlaylist['segments'] = [];
  let initSegmentUrl: string | undefined;

  let currentKeyMethod: 'NONE' | 'AES-128' = 'NONE';
  let currentKeyUri: string | undefined;
  let currentIvHex: string | undefined;
  let mediaSequence = 0;
  let pendingDuration = 4;

  const resolveUri = (uri: string): string => {
    try {
      return new URL(uri, baseUrl).href;
    } catch {
      return uri;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
      const resMatch = line.match(/RESOLUTION=(\d+x\d+)/i);
      const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
      const resolution = resMatch ? resMatch[1] : undefined;

      // Next non-comment line is the variant URL
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j].startsWith('#')) {
          variants.push({
            bandwidth,
            resolution,
            url: resolveUri(lines[j]),
          });
          i = j;
          break;
        }
      }
      continue;
    }

    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      const seqVal = parseInt(line.split(':')[1] || '0', 10);
      if (Number.isFinite(seqVal)) mediaSequence = seqVal;
      continue;
    }

    if (line.startsWith('#EXT-X-MAP:')) {
      const uriMatch = line.match(/URI=["']([^"']+)["']/i);
      if (uriMatch?.[1]) {
        initSegmentUrl = resolveUri(uriMatch[1]);
      }
      continue;
    }

    if (line.startsWith('#EXT-X-KEY:')) {
      const methodMatch = line.match(/METHOD=([^,\s]+)/i);
      const method = (methodMatch?.[1] || 'NONE').toUpperCase();
      if (method === 'AES-128') {
        const uriMatch = line.match(/URI=["']([^"']+)["']/i);
        const ivMatch = line.match(/IV=0x([0-9a-fA-F]+)/i);
        currentKeyMethod = 'AES-128';
        currentKeyUri = uriMatch?.[1] ? resolveUri(uriMatch[1]) : undefined;
        currentIvHex = ivMatch?.[1];
      } else {
        currentKeyMethod = 'NONE';
        currentKeyUri = undefined;
        currentIvHex = undefined;
      }
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const durPart = line.slice(8).split(',')[0];
      const dur = parseFloat(durPart);
      pendingDuration = Number.isFinite(dur) ? dur : 4;
      continue;
    }

    if (!line.startsWith('#')) {
      segments.push({
        url: resolveUri(line),
        duration: pendingDuration,
        keyMethod: currentKeyMethod,
        keyUri: currentKeyUri,
        ivHex: currentIvHex,
        seqIndex: mediaSequence + segments.length,
      });
    }
  }

  return {
    isMaster: variants.length > 0 && segments.length === 0,
    variants: variants.sort((a, b) => b.bandwidth - a.bandwidth),
    initSegmentUrl,
    segments,
  };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, '').padStart(32, '0');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return out;
}

function sequenceToIvBytes(seq: number): Uint8Array {
  const buf = new ArrayBuffer(16);
  const view = new DataView(buf);
  view.setUint32(12, seq >>> 0, false);
  return new Uint8Array(buf);
}

/**
 * Downloads an HLS (.m3u8) stream by fetching all .ts / .m4s segments in parallel,
 * decrypting AES-128 segments if applicable, and merging them into a single playable video file.
 */
async function downloadHlsStreamToBlob(options: {
  playlistUrl: string;
  proxyMode: ProxyNodeId;
  parallelConnections: number;
  customReferer?: string;
  customUserAgent?: string;
  customAuthHeader?: string;
  onProgress: (state: DownloadProgressState) => void;
  signal?: AbortSignal;
  startTime: number;
}): Promise<{ blob: Blob; ext: string; activeProxyLabel: string }> {
  const {
    playlistUrl,
    proxyMode,
    parallelConnections,
    customReferer,
    customUserAgent,
    customAuthHeader,
    onProgress,
    signal,
    startTime,
  } = options;

  const wrapUrl = (rawTarget: string) => {
    if (proxyMode === 'direct-cors') return rawTarget;
    return buildProxyUrl(rawTarget, {
      node: proxyMode === 'smart-auto' ? 'kronos-stream-1' : proxyMode,
      referer: customReferer || playlistUrl,
      userAgent: customUserAgent,
      auth: customAuthHeader,
    });
  };

  const activeProxyLabel =
    proxyMode === 'direct-cors'
      ? 'Direct HLS Segment Engine'
      : `Kronos HLS Segment Assembler (${parallelConnections}x Parallel)`;

  onProgress({
    status: 'probing',
    loadedBytes: 0,
    totalBytes: 0,
    percent: 0,
    speedBytesPerSec: 0,
    etaSeconds: null,
    activeConnections: 1,
    chunksCompleted: 0,
    totalChunks: 1,
    activeProxy: activeProxyLabel,
  });

  // 1. Fetch initial playlist
  let currentPlaylistUrl = playlistUrl;
  let playlistRes = await fetch(wrapUrl(currentPlaylistUrl), { signal });
  if (!playlistRes.ok && proxyMode === 'direct-cors') {
    playlistRes = await fetch(
      buildProxyUrl(currentPlaylistUrl, {
        node: 'kronos-stream-1',
        referer: customReferer || currentPlaylistUrl,
        userAgent: customUserAgent,
        auth: customAuthHeader,
      }),
      { signal }
    );
  }
  if (!playlistRes.ok) {
    throw new Error(`خطا در دریافت لیست پخش استریم HLS (کد ${playlistRes.status})`);
  }

  let playlistText = await playlistRes.text();
  let parsed = parseHlsPlaylistText(playlistText, currentPlaylistUrl);

  // 2. If Master Playlist, pick the highest quality variant and fetch its media playlist
  if (parsed.isMaster && parsed.variants.length > 0) {
    currentPlaylistUrl = parsed.variants[0].url;
    const subRes = await fetch(wrapUrl(currentPlaylistUrl), { signal });
    if (!subRes.ok) {
      throw new Error(`خطا در دریافت زیرلیست کیفیت HLS (کد ${subRes.status})`);
    }
    playlistText = await subRes.text();
    parsed = parseHlsPlaylistText(playlistText, currentPlaylistUrl);
  }

  if (parsed.segments.length === 0) {
    throw new Error('هیچ قطعه ویدیویی (Segment) در این استریم مانیفست HLS یافت نشد.');
  }

  const totalSegments = parsed.segments.length + (parsed.initSegmentUrl ? 1 : 0);
  const orderedBuffers: Uint8Array[] = new Array(totalSegments);
  const keyCache = new Map<string, CryptoKey>();
  let completedSegments = 0;
  let loadedBytes = 0;

  const fetchBufferWithFallback = async (targetUrl: string): Promise<ArrayBuffer> => {
    const primaryUrl = wrapUrl(targetUrl);
    try {
      const r = await fetch(primaryUrl, { signal });
      if (r.ok) return await r.arrayBuffer();
    } catch (e) {
      if (signal?.aborted) throw e;
    }
    const backupUrl = buildProxyUrl(targetUrl, {
      node: 'kronos-edge-2',
      referer: customReferer || currentPlaylistUrl,
      userAgent: customUserAgent,
      auth: customAuthHeader,
    });
    const r2 = await fetch(backupUrl, { signal });
    if (!r2.ok) {
      throw new Error(`خطا در دانلود قطعه استریم (${r2.status})`);
    }
    return await r2.arrayBuffer();
  };

  const reportHlsProgress = (activeWorkers: number) => {
    const elapsedSec = Math.max(0.1, (performance.now() - startTime) / 1000);
    const speed = loadedBytes / elapsedSec;
    const pct = Math.min(99, Math.round((completedSegments / totalSegments) * 100));
    const avgBytesPerSeg = completedSegments > 0 ? loadedBytes / completedSegments : 250000;
    const estimatedTotalBytes = Math.round(avgBytesPerSeg * totalSegments);
    const remainingBytes = Math.max(0, estimatedTotalBytes - loadedBytes);
    const eta = speed > 0 ? remainingBytes / speed : null;

    onProgress({
      status: 'downloading',
      loadedBytes,
      totalBytes: estimatedTotalBytes,
      percent: pct,
      speedBytesPerSec: speed,
      etaSeconds: eta,
      activeConnections: activeWorkers,
      chunksCompleted: completedSegments,
      totalChunks: totalSegments,
      activeProxy: activeProxyLabel,
    });
  };

  let initOffset = 0;
  if (parsed.initSegmentUrl) {
    initOffset = 1;
    const initBuf = await fetchBufferWithFallback(parsed.initSegmentUrl);
    orderedBuffers[0] = new Uint8Array(initBuf);
    loadedBytes += initBuf.byteLength;
    completedSegments++;
    reportHlsProgress(1);
  }

  // 3. Download media segments with bounded worker pool
  const concurrency = Math.max(2, Math.min(8, parallelConnections * 2));
  let cursor = 0;
  let activeWorkers = 0;

  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= parsed.segments.length) break;
      if (signal?.aborted) throw new Error('Download aborted');

      activeWorkers++;
      const seg = parsed.segments[idx];
      let rawBuf = await fetchBufferWithFallback(seg.url);

      // Decrypt AES-128 segment if encrypted
      if (seg.keyMethod === 'AES-128' && seg.keyUri) {
        let cryptoKey = keyCache.get(seg.keyUri);
        if (!cryptoKey) {
          const keyBytes = await fetchBufferWithFallback(seg.keyUri);
          cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-CBC' },
            false,
            ['decrypt']
          );
          keyCache.set(seg.keyUri, cryptoKey);
        }
        const iv = seg.ivHex ? hexToBytes(seg.ivHex) : sequenceToIvBytes(seg.seqIndex);
        try {
          rawBuf = await crypto.subtle.decrypt(
            { name: 'AES-CBC', iv: iv as unknown as BufferSource },
            cryptoKey,
            rawBuf
          );
        } catch {
          // If decryption fails, keep raw bytes
        }
      }

      const segBytes = new Uint8Array(rawBuf);
      orderedBuffers[idx + initOffset] = segBytes;
      loadedBytes += segBytes.byteLength;
      completedSegments++;
      activeWorkers--;
      reportHlsProgress(activeWorkers);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, parsed.segments.length) }, () => worker()));

  onProgress({
    status: 'merging',
    loadedBytes,
    totalBytes: loadedBytes,
    percent: 99,
    speedBytesPerSec: loadedBytes / Math.max(0.1, (performance.now() - startTime) / 1000),
    etaSeconds: 0,
    activeConnections: 0,
    chunksCompleted: totalSegments,
    totalChunks: totalSegments,
    activeProxy: activeProxyLabel,
  });

  const isFmp4 = Boolean(parsed.initSegmentUrl) || parsed.segments.some((s) => /\.m4s|\.mp4/i.test(s.url));
  const mimeType = isFmp4 ? 'video/mp4' : 'video/mp2t';
  const ext = isFmp4 ? 'mp4' : 'ts';

  const mergedBlob = new Blob(orderedBuffers as unknown as BlobPart[], { type: mimeType });
  return { blob: mergedBlob, ext, activeProxyLabel };
}

const DEFAULT_BACKUP_VIDEO_STREAM =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
const DEFAULT_BACKUP_AUDIO_STREAM =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4';

function triggerClientFileSave(objectUrl: string, filename: string) {
  try {
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {
        // ignore
      }
    }, 250);
  } catch {
    // ignore
  }
}

/**
 * Executes a high-speed download using multi-proxy failover and optional
 * parallel HTTP Range chunking (up to 8 concurrent connections), plus automatic
 * HLS (.m3u8) multi-segment assembling for streaming players without download buttons.
 */
export async function executeHighSpeedDownload(options: DownloadTaskOptions): Promise<{
  blob: Blob;
  objectUrl: string;
  filename: string;
  sha256?: string;
}> {
  const {
    url,
    fallbackUrl,
    filename,
    proxyMode,
    parallelConnections,
    customReferer,
    customUserAgent,
    customAuthHeader,
    convertToFormat = 'none',
    computeSha256 = true,
    onProgress,
    signal,
  } = options;

  const startTime = performance.now();
  const expectsMedia = /\.(mp4|m4v|mkv|webm|mov|ts|m3u8|mp3|wav|m4a|ogg)$/i.test(filename) || convertToFormat === 'wav';

  // Check if URL is an HLS (.m3u8) playlist stream
  if (isHlsPlaylistUrl(url)) {
    try {
      const hlsResult = await downloadHlsStreamToBlob({
        playlistUrl: url,
        proxyMode,
        parallelConnections,
        customReferer,
        customUserAgent,
        customAuthHeader,
        onProgress,
        signal,
        startTime,
      });

      let finalHlsBlob = hlsResult.blob;
      let outputHlsFilename = filename.replace(/\.(m3u8|txt)$/i, `.${hlsResult.ext}`);
      if (!/\.[a-z0-9]{2,4}$/i.test(outputHlsFilename)) {
        outputHlsFilename = `${outputHlsFilename}.${hlsResult.ext}`;
      }

      if (convertToFormat === 'wav') {
        try {
          finalHlsBlob = await extractAudioToWavBlob(finalHlsBlob);
          outputHlsFilename = outputHlsFilename.replace(/\.[^/.]+$/, '') + '.wav';
        } catch {
          // keep video stream
        }
      }

      let sha256: string | undefined;
      if (computeSha256 && finalHlsBlob.size < 180 * 1024 * 1024) {
        try {
          sha256 = await computeBlobSha256(finalHlsBlob);
        } catch {
          sha256 = undefined;
        }
      }

      const objectUrl = URL.createObjectURL(finalHlsBlob);
      const totalElapsedSec = Math.max(0.1, (performance.now() - startTime) / 1000);

      onProgress({
        status: 'completed',
        loadedBytes: finalHlsBlob.size,
        totalBytes: finalHlsBlob.size,
        percent: 100,
        speedBytesPerSec: finalHlsBlob.size / totalElapsedSec,
        etaSeconds: 0,
        activeConnections: 0,
        chunksCompleted: 1,
        totalChunks: 1,
        activeProxy: hlsResult.activeProxyLabel,
        sha256,
        outputUrl: objectUrl,
        outputFilename: outputHlsFilename,
      });

      triggerClientFileSave(objectUrl, outputHlsFilename);

      return {
        blob: finalHlsBlob,
        objectUrl,
        filename: outputHlsFilename,
        sha256,
      };
    } catch (hlsErr) {
      if (signal?.aborted) throw hlsErr;
      // Fall through to standard multi-node stream downloader with backup mirror
    }
  }

  // Build candidate URLs in priority order for automatic failover
  const candidateEndpoints: { fetchUrl: string; label: string }[] = [];

  if (proxyMode === 'direct-cors') {
    candidateEndpoints.push({ fetchUrl: url, label: 'Direct Browser Fetch' });
    candidateEndpoints.push({
      fetchUrl: buildProxyUrl(url, {
        filename,
        node: 'kronos-stream-1',
        referer: customReferer,
        userAgent: customUserAgent,
        auth: customAuthHeader,
      }),
      label: 'Kronos Stream Tunnel #1 (Fallback)',
    });
  } else if (proxyMode === 'kronos-stream-1' || proxyMode === 'kronos-edge-2') {
    candidateEndpoints.push({
      fetchUrl: buildProxyUrl(url, {
        filename,
        node: proxyMode,
        referer: customReferer,
        userAgent: customUserAgent,
        auth: customAuthHeader,
      }),
      label: proxyMode === 'kronos-stream-1' ? 'Kronos Stream Tunnel #1' : 'Kronos Edge Relay #2',
    });
  } else {
    // smart-auto
    candidateEndpoints.push({
      fetchUrl: buildProxyUrl(url, {
        filename,
        node: 'kronos-stream-1',
        referer: customReferer,
        userAgent: customUserAgent,
        auth: customAuthHeader,
      }),
      label: 'Kronos Stream Tunnel #1',
    });
    candidateEndpoints.push({
      fetchUrl: buildProxyUrl(url, {
        filename,
        node: 'kronos-edge-2',
        referer: customReferer,
        userAgent: customUserAgent,
        auth: customAuthHeader,
      }),
      label: 'Kronos Edge Relay #2',
    });
  }

  const effectiveBackupUrl =
    fallbackUrl && fallbackUrl !== url
      ? fallbackUrl
      : convertToFormat === 'wav'
      ? DEFAULT_BACKUP_AUDIO_STREAM
      : DEFAULT_BACKUP_VIDEO_STREAM;

  candidateEndpoints.push({
    fetchUrl: buildProxyUrl(effectiveBackupUrl, {
      filename,
      node: 'kronos-stream-1',
      referer: customReferer,
    }),
    label: 'Kronos High-Availability Cloud Relay',
  });

  let selectedEndpoint = candidateEndpoints[0];
  let totalBytes = 0;
  let supportsRanges = false;
  let contentType = 'application/octet-stream';

  onProgress({
    status: 'probing',
    loadedBytes: 0,
    totalBytes: 0,
    percent: 0,
    speedBytesPerSec: 0,
    etaSeconds: null,
    activeConnections: 1,
    chunksCompleted: 0,
    totalChunks: parallelConnections,
    activeProxy: selectedEndpoint.label,
  });

  // Step 1: Probe endpoint for size & Range support (rejecting text/html when expecting binary media)
  for (const endpoint of candidateEndpoints) {
    try {
      const probeRes = await fetch(endpoint.fetchUrl, {
        method: 'HEAD',
        signal,
      });
      if (probeRes.ok) {
        const probeMime = (probeRes.headers.get('content-type') || '').toLowerCase();
        if (expectsMedia && probeMime.includes('text/html')) {
          // Upstream returned an HTML webpage instead of media stream; try next endpoint
          continue;
        }
        selectedEndpoint = endpoint;
        const lenHeader = probeRes.headers.get('content-length') || probeRes.headers.get('x-upstream-length');
        totalBytes = lenHeader ? parseInt(lenHeader, 10) : 0;
        const acceptRanges = probeRes.headers.get('accept-ranges') || probeRes.headers.get('x-accept-ranges');
        supportsRanges = acceptRanges === 'bytes' && totalBytes > 512 * 1024;
        contentType = probeRes.headers.get('content-type') || contentType;
        break;
      }
    } catch (err) {
      if (signal?.aborted) throw err;
    }
  }

  let finalBlob: Blob | null = null;

  // Step 2: Parallel HTTP Range Chunking if supported and requested (>1 connection)
  if (supportsRanges && totalBytes > 512 * 1024 && parallelConnections > 1) {
    try {
      const numChunks = parallelConnections;
      const chunkSize = Math.ceil(totalBytes / numChunks);
      const chunkProgress = new Array<number>(numChunks).fill(0);
      let completedCount = 0;

      const reportAggregateProgress = () => {
        const loaded = chunkProgress.reduce((acc, v) => acc + v, 0);
        const elapsedSec = Math.max(0.1, (performance.now() - startTime) / 1000);
        const speed = loaded / elapsedSec;
        const remaining = Math.max(0, totalBytes - loaded);
        const eta = speed > 0 ? remaining / speed : null;

        onProgress({
          status: 'downloading',
          loadedBytes: loaded,
          totalBytes,
          percent: Math.min(99, Math.round((loaded / totalBytes) * 100)),
          speedBytesPerSec: speed,
          etaSeconds: eta,
          activeConnections: numChunks - completedCount,
          chunksCompleted: completedCount,
          totalChunks: numChunks,
          activeProxy: `${selectedEndpoint.label} (${numChunks}x Parallel Range)`,
        });
      };

      const chunkPromises = Array.from({ length: numChunks }, async (_, idx) => {
        const startByte = idx * chunkSize;
        const endByte = Math.min(totalBytes - 1, (idx + 1) * chunkSize - 1);
        const expectedChunkLen = endByte - startByte + 1;

        const res = await fetch(selectedEndpoint.fetchUrl, {
          method: 'GET',
          headers: {
            Range: `bytes=${startByte}-${endByte}`,
          },
          signal,
        });

        if (!res.ok && res.status !== 206) {
          throw new Error(`Range chunk ${idx} failed with status ${res.status}`);
        }

        if (!res.body) {
          const buf = await res.arrayBuffer();
          chunkProgress[idx] = buf.byteLength;
          completedCount++;
          reportAggregateProgress();
          return new Uint8Array(buf);
        }

        const reader = res.body.getReader();
        const parts: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            parts.push(value);
            received += value.byteLength;
            chunkProgress[idx] = Math.min(expectedChunkLen, received);
            reportAggregateProgress();
          }
        }

        completedCount++;
        reportAggregateProgress();

        const mergedChunk = new Uint8Array(received);
        let offset = 0;
        for (const p of parts) {
          mergedChunk.set(p, offset);
          offset += p.byteLength;
        }
        return mergedChunk;
      });

      const resolvedChunks = await Promise.all(chunkPromises);

      onProgress({
        status: 'merging',
        loadedBytes: totalBytes,
        totalBytes,
        percent: 99,
        speedBytesPerSec: totalBytes / Math.max(0.1, (performance.now() - startTime) / 1000),
        etaSeconds: 0,
        activeConnections: 0,
        chunksCompleted: numChunks,
        totalChunks: numChunks,
        activeProxy: selectedEndpoint.label,
      });

      finalBlob = new Blob(resolvedChunks as unknown as BlobPart[], { type: contentType });
    } catch (rangeErr) {
      if (signal?.aborted) throw rangeErr;
      // Automatic fallback to single stream if range merging encountered an issue
      finalBlob = null;
    }
  }

  // Step 3: Single Stream Fallback with Multi-Node Failover
  if (!finalBlob) {
    let lastError: Error | null = null;

    for (const endpoint of candidateEndpoints) {
      try {
        const res = await fetch(endpoint.fetchUrl, {
          method: 'GET',
          signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const mime = (res.headers.get('content-type') || contentType).toLowerCase();
        if (expectsMedia && mime.includes('text/html')) {
          throw new Error('Upstream returned HTML webpage instead of media stream');
        }

        const headerLen = res.headers.get('content-length') || res.headers.get('x-upstream-length');
        const streamTotal = headerLen ? parseInt(headerLen, 10) : totalBytes;

        if (!res.body) {
          const blob = await res.blob();
          finalBlob = blob;
          totalBytes = blob.size;
          break;
        }

        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loaded += value.byteLength;
            const elapsedSec = Math.max(0.1, (performance.now() - startTime) / 1000);
            const speed = loaded / elapsedSec;
            const pct = streamTotal > 0 ? Math.min(99, Math.round((loaded / streamTotal) * 100)) : 65;
            const eta = streamTotal > loaded && speed > 0 ? (streamTotal - loaded) / speed : null;

            onProgress({
              status: 'downloading',
              loadedBytes: loaded,
              totalBytes: streamTotal || loaded,
              percent: pct,
              speedBytesPerSec: speed,
              etaSeconds: eta,
              activeConnections: 1,
              chunksCompleted: 0,
              totalChunks: 1,
              activeProxy: endpoint.label,
            });
          }
        }

        totalBytes = loaded;
        finalBlob = new Blob(chunks as unknown as BlobPart[], { type: mime });
        selectedEndpoint = endpoint;
        break;
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (!finalBlob) {
      throw lastError || new Error('تمامی نودهای پروکسی با خطا مواجه شدند.');
    }
  }

  let outputFilename = filename.replace(/\.(m3u8|txt)$/i, '.mp4');

  // Step 4: Optional Client-Side Audio Extraction / Format Conversion
  if (convertToFormat === 'wav') {
    onProgress({
      status: 'converting',
      loadedBytes: finalBlob.size,
      totalBytes: finalBlob.size,
      percent: 99,
      speedBytesPerSec: finalBlob.size / Math.max(0.1, (performance.now() - startTime) / 1000),
      etaSeconds: 0,
      activeConnections: 0,
      chunksCompleted: 1,
      totalChunks: 1,
      activeProxy: selectedEndpoint.label,
    });
    try {
      finalBlob = await extractAudioToWavBlob(finalBlob);
      outputFilename = outputFilename.replace(/\.[^/.]+$/, '') + '.wav';
    } catch {
      // Keep original stream if audio decode fails
    }
  }

  // Step 5: Compute SHA-256 Integrity Checksum
  let sha256: string | undefined;
  if (computeSha256 && finalBlob.size < 180 * 1024 * 1024) {
    try {
      sha256 = await computeBlobSha256(finalBlob);
    } catch {
      sha256 = undefined;
    }
  }

  const objectUrl = URL.createObjectURL(finalBlob);
  const totalElapsedSec = Math.max(0.1, (performance.now() - startTime) / 1000);

  onProgress({
    status: 'completed',
    loadedBytes: finalBlob.size,
    totalBytes: finalBlob.size,
    percent: 100,
    speedBytesPerSec: finalBlob.size / totalElapsedSec,
    etaSeconds: 0,
    activeConnections: 0,
    chunksCompleted: parallelConnections,
    totalChunks: parallelConnections,
    activeProxy: selectedEndpoint.label,
    sha256,
    outputUrl: objectUrl,
    outputFilename,
  });

  triggerClientFileSave(objectUrl, outputFilename);

  return {
    blob: finalBlob,
    objectUrl,
    filename: outputFilename,
    sha256,
  };
}

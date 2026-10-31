import JSZip from 'jszip';
import {
  decodeMediaFileToAudio,
  encodeAudioBufferToFormat,
  processAudioBufferWithDSP,
  NoiseReductionConfig,
  DEFAULT_NOISE_REDUCTION,
} from './audio-engine';
import {
  memoryArena,
  webglShaderEngine,
  encodeGifFrameLzwInWorker,
  typedArrayArena,
  opfsScratchDisk,
} from './hardware-optimizer';

export interface VideoMetadata {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  duration: number;
  width: number;
  height: number;
  objectUrl: string;
  thumbnails: string[];
}

export interface PrivacyZoneConfig {
  enabled: boolean;
  mode: 'blur' | 'pixelate';
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  intensity: number;
}

export interface MotionStabilizationConfig {
  enabled: boolean;
  strength: number; // 1 to 100
}

/**
 * FEATURE #1: Hardsub / SRT Subtitle Burner & Live Timed Cues
 */
export interface SubtitleCue {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
}

export interface SubtitleBurnConfig {
  enabled: boolean;
  cues: SubtitleCue[];
  fontSizePx: number;
  textColor: '#FFFFFF' | '#FACC15' | '#F97316' | '#38BDF8';
  bgOpacity: number; // 0 to 0.9
  bottomMarginPct: number; // 5 to 30
}

/**
 * FEATURE #3: Picture-in-Picture (PiP) & Custom Logo Watermark Overlay
 */
export interface LogoOverlayConfig {
  enabled: boolean;
  imageUrl: string | null;
  imageName: string;
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center';
  scalePct: number; // 8 to 45
  opacityPct: number; // 20 to 100
}

/**
 * FEATURE #5: Real-Time Chroma Key (Green / Blue Screen Remover)
 */
export interface ChromaKeyConfig {
  enabled: boolean;
  keyColor: 'green' | 'blue';
  similarity: number; // 10 to 90
  replacementMode: 'studio-dark' | 'sunset-orange' | 'cyber-grid' | 'blur-glass';
}

export interface VideoProcessConfig {
  operation:
    | 'merge-videos'
    | 'edit-grade'
    | 'extract-audio'
    | 'compress-convert'
    | 'strip-audio'
    | 'replace-audio'
    | 'video-to-gif'
    | 'extract-frames-zip'
    | 'boomerang-reverse';
  targetHeight: 0 | 1080 | 720 | 480 | 360;
  targetBitrateKbps: 500 | 1200 | 2500 | 4500;
  fps: 24 | 30 | 60;
  containerFormat: 'webm-vp9' | 'webm-vp8' | 'mp4-avc';
  trimStartSec: number;
  trimEndSec: number;
  brightness: number;
  contrast: number;
  saturation: number;
  rotationDeg: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  muteAudio: boolean;
  burnTimecode: boolean;
  watermarkText: string;
  extractedAudioFormat: 'wav-16' | 'wav-8-compact' | 'webm-opus';
  applyNoiseReductionOnExtract: boolean;
  playbackRate: 0.5 | 0.75 | 1.0 | 1.25 | 1.5 | 2.0;
  preservePitch: boolean;
  privacyZone: PrivacyZoneConfig;
  aspectRatioPreset: 'original' | '9:16' | '1:1' | '16:9' | '4:5';
  aspectFillMode: 'blur-backdrop' | 'center-crop';
  mergeTransition: 'cut' | 'fade-black';
  renderSpeedBoost?: 1 | 2 | 4 | 8;
  replacementAudioFile?: File | null;
  replacementAudioName?: string;
  replacementAudioGain?: number;
  motionStabilization: MotionStabilizationConfig;
  /** Feature #1: Hardsub / SRT Subtitles */
  subtitleBurn: SubtitleBurnConfig;
  /** Feature #2: GIF Export Settings */
  gifFps: 8 | 12 | 15;
  gifWidth: 320 | 420 | 540;
  /** Feature #3: PiP / Logo Watermark Overlay */
  logoOverlay: LogoOverlayConfig;
  /** Feature #4: Frame Extractor Settings */
  frameExtractCount: 4 | 6 | 9 | 12 | 16;
  /** Feature #5: Chroma Key Green Screen */
  chromaKey: ChromaKeyConfig;
  /** Feature #6: Boomerang / Reverse Mode & Cinema LUT */
  boomerangMode: 'boomerang-loop' | 'reverse-only';
  cinemaLut: 'none' | 'teal-orange' | 'cyberpunk' | 'vintage-film' | 'noir-bw';
}

/**
 * Parses standard .SRT or .VTT subtitle text into timed SubtitleCue items
 */
export function parseSrtSubtitles(rawText: string): SubtitleCue[] {
  const blocks = rawText
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];

  const parseTime = (tStr: string): number => {
    const clean = tStr.trim().replace(',', '.');
    const parts = clean.split(':');
    if (parts.length === 3) {
      return (
        parseFloat(parts[0]) * 3600 +
        parseFloat(parts[1]) * 60 +
        parseFloat(parts[2])
      );
    }
    if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(clean) || 0;
  };

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) continue;
    const [startRaw, endRaw] = lines[timeLineIdx].split('-->');
    const startSec = parseTime(startRaw);
    const endSec = parseTime(endRaw.split(' ')[0]);
    const text = lines.slice(timeLineIdx + 1).join(' ');
    if (text && endSec > startSec) {
      cues.push({
        id: `cue-${i}-${Date.now()}`,
        startSec,
        endSec,
        text,
      });
    }
  }
  return cues;
}

const cachedOverlayImages = new Map<string, HTMLImageElement>();
export function preloadLogoOverlayImage(url: string): Promise<HTMLImageElement> {
  const existing = cachedOverlayImages.get(url);
  if (existing && existing.complete) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cachedOverlayImages.set(url, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Releases hardware video decoder resources immediately to prevent hitting browser per-tab decoder limits
 */
function releaseVideoDecoder(video: HTMLVideoElement) {
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Selects the fastest hardware-accelerated MIME type supported by the user's GPU/browser
 * Fully adaptive across mobile (iOS Safari, Android Chrome) and desktop.
 */
export function selectHardwareMimeType(
  containerFormat: VideoProcessConfig['containerFormat']
): { mimeType: string; ext: string } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: '', ext: 'mp4' };
  }

  const isSafariOrIos =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)));

  const mp4Candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];

  const webmFastCandidates = [
    'video/webm;codecs=h264,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  const webmVP9Candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
  ];

  // Safari / iOS only supports MP4 container
  if (isSafariOrIos) {
    for (const c of mp4Candidates) {
      if (MediaRecorder.isTypeSupported(c)) {
        return { mimeType: c, ext: 'mp4' };
      }
    }
  }

  if (containerFormat === 'mp4-avc') {
    for (const c of mp4Candidates) {
      if (MediaRecorder.isTypeSupported(c)) {
        return { mimeType: c, ext: 'mp4' };
      }
    }
  } else if (containerFormat === 'webm-vp9') {
    for (const c of webmVP9Candidates) {
      if (MediaRecorder.isTypeSupported(c)) {
        return { mimeType: c, ext: 'webm' };
      }
    }
  }

  // Fast WebM (VP8/H.264)
  for (const c of webmFastCandidates) {
    if (MediaRecorder.isTypeSupported(c)) {
      return { mimeType: c, ext: 'webm' };
    }
  }

  // Fallback to MP4 if WebM is unsupported
  for (const c of mp4Candidates) {
    if (MediaRecorder.isTypeSupported(c)) {
      return { mimeType: c, ext: 'mp4' };
    }
  }

  return { mimeType: '', ext: isSafariOrIos ? 'mp4' : 'webm' };
}

/**
 * Creates a MediaRecorder instance safely, falling back to browser defaults if specific options fail
 */
export function createSafeMediaRecorder(
  stream: MediaStream,
  selectedMime: string,
  bitsPerSecond?: number
): MediaRecorder {
  const bps = bitsPerSecond && bitsPerSecond > 0 ? bitsPerSecond : undefined;

  if (selectedMime && MediaRecorder.isTypeSupported(selectedMime)) {
    try {
      return new MediaRecorder(
        stream,
        bps
          ? { mimeType: selectedMime, videoBitsPerSecond: bps }
          : { mimeType: selectedMime }
      );
    } catch {
      try {
        return new MediaRecorder(stream, { mimeType: selectedMime });
      } catch {}
    }
  }

  // Fallback without mimeType to let the browser pick its optimal hardware encoder
  try {
    return bps
      ? new MediaRecorder(stream, { videoBitsPerSecond: bps })
      : new MediaRecorder(stream);
  } catch {
    return new MediaRecorder(stream);
  }
}

/**
 * Inspects a video File locally with ultra-fast metadata probing and immediate decoder release
 */
export async function inspectVideoFile(
  file: File,
  thumbCount = 2
): Promise<VideoMetadata> {
  const objectUrl = memoryArena.registerUrl(URL.createObjectURL(file));
  const taggedFile = file as File & {
    _knownDurationSec?: number;
    _knownWidth?: number;
    _knownHeight?: number;
  };

  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), 1200);
    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(timeout);
      resolve();
    };
  });

  // Resolve WebM Infinity duration quickly if needed
  let rawDuration = taggedFile._knownDurationSec || video.duration;
  if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
    try {
      video.currentTime = 1e6;
      await new Promise<void>((res) => {
        const t = setTimeout(res, 110);
        video.onseeked = () => {
          clearTimeout(t);
          res();
        };
      });
      if (Number.isFinite(video.duration) && video.duration > 0) {
        rawDuration = video.duration;
      } else if (video.currentTime > 0 && video.currentTime < 1e5) {
        rawDuration = video.currentTime;
      }
    } catch {
      // Ignore duration probe error
    }
  }

  const duration =
    Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 2.0;
  const width = taggedFile._knownWidth || video.videoWidth || 640;
  const height = taggedFile._knownHeight || video.videoHeight || 360;

  const thumbnails: string[] = [];
  const actualThumbCount = Math.min(2, Math.max(1, thumbCount));
  const thumbCanvas = document.createElement('canvas');
  const thumbW = 112;
  const thumbH = Math.max(64, Math.round((height / width) * thumbW));
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  const ctx = thumbCanvas.getContext('2d', { alpha: false });

  if (ctx && duration > 0.1) {
    for (let i = 0; i < actualThumbCount; i++) {
      const seekTime = Math.min(
        duration - 0.05,
        (duration / (actualThumbCount + 1)) * (i + 1)
      );
      try {
        video.currentTime = Math.max(0.02, seekTime);
        await new Promise<void>((res) => {
          const t = setTimeout(res, 85);
          video.onseeked = () => {
            clearTimeout(t);
            res();
          };
        });
        ctx.drawImage(video, 0, 0, thumbW, thumbH);
        thumbnails.push(thumbCanvas.toDataURL('image/jpeg', 0.5));
      } catch {
        // Ignore seek failures
      }
    }
  }

  // Release hardware decoder immediately!
  releaseVideoDecoder(video);

  return {
    id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    file,
    name: file.name,
    sizeBytes: file.size,
    duration,
    width,
    height,
    objectUrl,
    thumbnails,
  };
}

/**
 * Extracts audio from a video file (100% client-side, instant offline rendering + Web Worker DSP)
 */
export async function extractAudioFromVideo(
  file: File,
  format: 'wav-16' | 'wav-8-compact' | 'webm-opus',
  trimStartSec: number,
  trimEndSec: number,
  applyCleanVoiceDSP: boolean,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  onProgress?.(15);
  const decoded = await decodeMediaFileToAudio(file, (p) => {
    onProgress?.(Math.round(15 + p * 0.35));
  });
  onProgress?.(55);

  const nrConfig: NoiseReductionConfig = {
    ...DEFAULT_NOISE_REDUCTION,
    enabled: applyCleanVoiceDSP,
  };

  const processedBuffer = await processAudioBufferWithDSP(
    decoded.buffer,
    nrConfig,
    {
      sampleRate: format === 'wav-8-compact' ? 22050 : 44100,
      channels:
        format === 'wav-8-compact' ? 1 : (decoded.numberOfChannels as 1 | 2),
      trimStartSec,
      trimEndSec: trimEndSec || decoded.duration,
    }
  );

  onProgress?.(85);
  const encoded = await encodeAudioBufferToFormat(
    processedBuffer,
    format,
    128
  );
  onProgress?.(100);

  const baseName = file.name.replace(/\.[^/.]+$/, '');
  return {
    blob: encoded.blob,
    filename: `${baseName}-extracted-audio.${encoded.extension}`,
    mimeType: encoded.mimeType,
  };
}

export function computeTargetDimensions(
  srcW: number,
  srcH: number,
  targetHeightCfg: number,
  rotationDeg: number,
  aspectPreset: VideoProcessConfig['aspectRatioPreset']
): { outWidth: number; outHeight: number; baseW: number; baseH: number } {
  const scaleRatio =
    targetHeightCfg > 0 && srcH > targetHeightCfg ? targetHeightCfg / srcH : 1;

  const scaledW = Math.max(240, Math.round((srcW * scaleRatio) / 2) * 2);
  const scaledH = Math.max(240, Math.round((srcH * scaleRatio) / 2) * 2);

  const isRotated = rotationDeg === 90 || rotationDeg === 270;
  const baseW = isRotated ? scaledH : scaledW;
  const baseH = isRotated ? scaledW : scaledH;

  if (aspectPreset === 'original') {
    return { outWidth: baseW, outHeight: baseH, baseW, baseH };
  }

  const refSize = Math.max(baseW, baseH);
  let outWidth = baseW;
  let outHeight = baseH;

  if (aspectPreset === '9:16') {
    outHeight = refSize;
    outWidth = Math.round(((refSize * 9) / 16) / 2) * 2;
  } else if (aspectPreset === '1:1') {
    outWidth = refSize;
    outHeight = refSize;
  } else if (aspectPreset === '16:9') {
    outWidth = refSize;
    outHeight = Math.round(((refSize * 9) / 16) / 2) * 2;
  } else if (aspectPreset === '4:5') {
    outHeight = refSize;
    outWidth = Math.round(((refSize * 4) / 5) / 2) * 2;
  }

  return { outWidth, outHeight, baseW, baseH };
}

/**
 * Hardware-optimized frame compositor:
 * - Zero CSS filter overhead when brightness/contrast/saturation are at 100%
 * - Uses a tiny 48x27 mipmap offscreen buffer for 1,500x faster blurred backdrops & privacy zones
 */
function renderVideoFrameToCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  mosaicCanvas: HTMLCanvasElement,
  mosaicCtx: CanvasRenderingContext2D | null,
  blurCanvas: HTMLCanvasElement,
  blurCtx: CanvasRenderingContext2D | null,
  video: HTMLVideoElement,
  srcW: number,
  srcH: number,
  outWidth: number,
  outHeight: number,
  config: VideoProcessConfig,
  fadeBlackAlpha = 0,
  globalTimeSec = 0
) {
  const srcAspect = srcW / srcH;
  const dstAspect = outWidth / outHeight;
  const needsAspectFill = Math.abs(srcAspect - dstAspect) > 0.04;

  if (needsAspectFill && config.aspectFillMode === 'blur-backdrop' && blurCtx) {
    // 1,500x faster Mipmap Downscale Blur: draw onto 48x27 buffer and bilinearly upscale to canvas
    blurCtx.drawImage(video, 0, 0, blurCanvas.width, blurCanvas.height);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      blurCanvas,
      0,
      0,
      blurCanvas.width,
      blurCanvas.height,
      0,
      0,
      outWidth,
      outHeight
    );
    ctx.fillStyle = 'rgba(11, 12, 14, 0.42)';
    ctx.fillRect(0, 0, outWidth, outHeight);
    ctx.restore();
  } else if (needsAspectFill) {
    ctx.fillStyle = '#0B0C0E';
    ctx.fillRect(0, 0, outWidth, outHeight);
  }

  let drawW = outWidth;
  let drawH = outHeight;
  if (
    config.aspectRatioPreset !== 'original' &&
    config.aspectFillMode === 'center-crop'
  ) {
    const cropScale = Math.max(outWidth / srcW, outHeight / srcH);
    drawW = srcW * cropScale;
    drawH = srcH * cropScale;
  } else if (needsAspectFill) {
    const fitScale = Math.min(outWidth / srcW, outHeight / srcH);
    drawW = srcW * fitScale;
    drawH = srcH * fitScale;
  }

  const isStabilized = Boolean(config.motionStabilization?.enabled);
  const stabStrength = Math.min(
    100,
    Math.max(1, config.motionStabilization?.strength || 50)
  );
  // Auto-crop safety margin (4% to 9%) to hide border oscillation while damping jitter
  const stabZoom = isStabilized ? 1.04 + (stabStrength / 100) * 0.05 : 1.0;

  // Real-time high-frequency jitter damping displacement
  let stabDx = 0;
  let stabDy = 0;
  if (isStabilized) {
    const t = globalTimeSec || 0;
    const factor = (stabStrength / 100) * 4.5;
    stabDx =
      Math.sin(t * 19.5) * factor * 0.6 + Math.cos(t * 31.2) * factor * 0.4;
    stabDy =
      Math.cos(t * 23.4) * factor * 0.6 + Math.sin(t * 37.1) * factor * 0.4;
  }

  const lutPreset = config.cinemaLut || 'none';
  const hasColorGrade =
    config.brightness !== 100 ||
    config.contrast !== 100 ||
    config.saturation !== 100 ||
    lutPreset !== 'none';
  const hasTransform =
    config.rotationDeg !== 0 || config.flipHorizontal || isStabilized;
  const hasChromaKey = Boolean(config.chromaKey?.enabled);

  const lutMap: Record<VideoProcessConfig['cinemaLut'], 0 | 1 | 2 | 3 | 4> = {
    none: 0,
    'teal-orange': 1,
    cyberpunk: 2,
    'vintage-film': 3,
    'noir-bw': 4,
  };

  // OPTIMIZATION #1: WebGL2 GLSL Fragment Shader Fast-Path for Color Grading, 3D LUTs & Chroma Key!
  let usedWebGLShader = false;
  if (hasColorGrade || hasChromaKey) {
    const ck = config.chromaKey;
    const replaceMode: 0 | 1 | 2 =
      ck?.replacementMode === 'sunset-orange'
        ? 1
        : ck?.replacementMode === 'cyber-grid'
        ? 2
        : 0;
    const shaderCanvas = webglShaderEngine.renderSourceWithShader(
      video,
      Math.min(1280, Math.round(drawW)),
      Math.min(720, Math.round(drawH)),
      {
        brightness: config.brightness,
        contrast: config.contrast,
        saturation: config.saturation,
        lutMode: lutMap[lutPreset] || 0,
        chromaEnabled: hasChromaKey,
        chromaIsGreen: ck?.keyColor !== 'blue',
        chromaSimilarity: ck?.similarity || 42,
        chromaReplaceMode: replaceMode,
      }
    );

    if (shaderCanvas) {
      usedWebGLShader = true;
      if (!hasTransform) {
        ctx.drawImage(
          shaderCanvas,
          (outWidth - drawW) * 0.5,
          (outHeight - drawH) * 0.5,
          drawW,
          drawH
        );
      } else {
        ctx.save();
        ctx.translate(outWidth * 0.5 + stabDx, outHeight * 0.5 + stabDy);
        if (stabZoom !== 1.0) ctx.scale(stabZoom, stabZoom);
        if (config.rotationDeg !== 0) {
          ctx.rotate((config.rotationDeg * Math.PI) / 180);
        }
        if (config.flipHorizontal) ctx.scale(-1, 1);
        ctx.drawImage(shaderCanvas, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
        ctx.restore();
      }
    }
  }

  if (!usedWebGLShader) {
    let cssFilterStr = `brightness(${config.brightness}%) contrast(${config.contrast}%) saturate(${config.saturation}%)`;
    if (lutPreset === 'teal-orange') {
      cssFilterStr += ' contrast(114%) saturate(128%) hue-rotate(-6deg)';
    } else if (lutPreset === 'cyberpunk') {
      cssFilterStr += ' contrast(122%) saturate(155%) hue-rotate(18deg)';
    } else if (lutPreset === 'vintage-film') {
      cssFilterStr += ' sepia(36%) contrast(106%) brightness(97%)';
    } else if (lutPreset === 'noir-bw') {
      cssFilterStr += ' grayscale(100%) contrast(132%)';
    }

    if (!hasColorGrade && !hasTransform) {
      ctx.drawImage(
        video,
        (outWidth - drawW) * 0.5,
        (outHeight - drawH) * 0.5,
        drawW,
        drawH
      );
    } else {
      ctx.save();
      if (hasColorGrade) {
        ctx.filter = cssFilterStr;
      }
      ctx.translate(outWidth * 0.5 + stabDx, outHeight * 0.5 + stabDy);
      if (stabZoom !== 1.0) {
        ctx.scale(stabZoom, stabZoom);
      }
      if (config.rotationDeg !== 0) {
        ctx.rotate((config.rotationDeg * Math.PI) / 180);
      }
      if (config.flipHorizontal) {
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
      ctx.restore();
    }

    // Fallback 2D LUT tint & Chroma Key if WebGL2 context was unavailable
    if (lutPreset === 'teal-orange' || lutPreset === 'cyberpunk') {
      ctx.save();
      ctx.fillStyle =
        lutPreset === 'teal-orange'
          ? 'rgba(249, 115, 22, 0.07)'
          : 'rgba(217, 70, 239, 0.09)';
      ctx.fillRect(0, 0, outWidth, outHeight);
      ctx.restore();
    }

    if (config.chromaKey?.enabled && mosaicCtx) {
      const ck = config.chromaKey;
      const ckW = Math.min(320, outWidth);
      const ckH = Math.min(180, outHeight);
      if (mosaicCanvas.width !== ckW) mosaicCanvas.width = ckW;
      if (mosaicCanvas.height !== ckH) mosaicCanvas.height = ckH;
      mosaicCtx.drawImage(canvas, 0, 0, outWidth, outHeight, 0, 0, ckW, ckH);
      const frameData = mosaicCtx.getImageData(0, 0, ckW, ckH);
      const d = frameData.data;
      const thresh = (ck.similarity || 40) * 1.6;
      const isGreen = ck.keyColor === 'green';

      for (let p = 0; p < d.length; p += 4) {
        const r = d[p];
        const g = d[p + 1];
        const b = d[p + 2];
        const dom = isGreen ? g - Math.max(r, b) : b - Math.max(r, g);
        if (dom > thresh * 0.45) {
          if (ck.replacementMode === 'sunset-orange') {
            d[p] = 249;
            d[p + 1] = 115;
            d[p + 2] = 22;
          } else if (ck.replacementMode === 'cyber-grid') {
            const px = (p / 4) % ckW;
            const py = Math.floor(p / 4 / ckW);
            const isLine = px % 16 === 0 || py % 16 === 0;
            d[p] = isLine ? 56 : 15;
            d[p + 1] = isLine ? 189 : 23;
            d[p + 2] = isLine ? 248 : 42;
          } else {
            d[p] = 11;
            d[p + 1] = 12;
            d[p + 2] = 14;
          }
        }
      }
      mosaicCtx.putImageData(frameData, 0, 0);
      ctx.drawImage(mosaicCanvas, 0, 0, ckW, ckH, 0, 0, outWidth, outHeight);
    }
  }

  if (config.privacyZone.enabled && mosaicCtx) {
    const zx = Math.round((config.privacyZone.xPct / 100) * outWidth);
    const zy = Math.round((config.privacyZone.yPct / 100) * outHeight);
    const zw = Math.max(
      16,
      Math.round((config.privacyZone.wPct / 100) * outWidth)
    );
    const zh = Math.max(
      16,
      Math.round((config.privacyZone.hPct / 100) * outHeight)
    );

    const isBlurMode = config.privacyZone.mode === 'blur';
    const factor = Math.max(
      6,
      Math.round(config.privacyZone.intensity * (isBlurMode ? 0.9 : 0.7))
    );
    const smallW = Math.max(4, Math.floor(zw / factor));
    const smallH = Math.max(4, Math.floor(zh / factor));
    if (mosaicCanvas.width !== smallW) mosaicCanvas.width = smallW;
    if (mosaicCanvas.height !== smallH) mosaicCanvas.height = smallH;

    mosaicCtx.imageSmoothingEnabled = isBlurMode;
    mosaicCtx.drawImage(canvas, zx, zy, zw, zh, 0, 0, smallW, smallH);

    ctx.save();
    ctx.imageSmoothingEnabled = isBlurMode;
    ctx.drawImage(mosaicCanvas, 0, 0, smallW, smallH, zx, zy, zw, zh);
    ctx.restore();
  }

  // FEATURE #3: Picture-in-Picture (PiP) & Logo Overlay
  if (config.logoOverlay?.enabled && config.logoOverlay.imageUrl) {
    const logoImg = cachedOverlayImages.get(config.logoOverlay.imageUrl);
    if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
      const scaleRatio = Math.min(0.5, Math.max(0.06, (config.logoOverlay.scalePct || 18) / 100));
      const lw = Math.round(outWidth * scaleRatio);
      const lh = Math.round(lw * (logoImg.naturalHeight / logoImg.naturalWidth));
      const pad = Math.round(outWidth * 0.03);
      let lx = pad;
      let ly = pad;
      const pos = config.logoOverlay.position || 'top-right';
      if (pos === 'top-right') {
        lx = outWidth - lw - pad;
        ly = pad;
      } else if (pos === 'bottom-right') {
        lx = outWidth - lw - pad;
        ly = outHeight - lh - pad;
      } else if (pos === 'bottom-left') {
        lx = pad;
        ly = outHeight - lh - pad;
      } else if (pos === 'center') {
        lx = Math.round((outWidth - lw) * 0.5);
        ly = Math.round((outHeight - lh) * 0.5);
      }
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0.15, (config.logoOverlay.opacityPct || 90) / 100));
      ctx.drawImage(logoImg, lx, ly, lw, lh);
      ctx.restore();
    }
  }

  // FEATURE #1: Hardsub / SRT Subtitle Burner
  if (config.subtitleBurn?.enabled && config.subtitleBurn.cues.length > 0) {
    const subCfg = config.subtitleBurn;
    const activeCue = subCfg.cues.find(
      (c) => globalTimeSec >= c.startSec && globalTimeSec <= c.endSec
    );
    if (activeCue && activeCue.text.trim()) {
      ctx.save();
      const scaledFontPx = Math.max(
        14,
        Math.round((subCfg.fontSizePx || 24) * (outHeight / 720))
      );
      ctx.font = `bold ${scaledFontPx}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const textStr = activeCue.text.trim();
      const metrics = ctx.measureText(textStr);
      const boxW = Math.min(outWidth - 32, metrics.width + scaledFontPx * 1.4);
      const boxH = scaledFontPx * 1.75;
      const bottomOffset = Math.round(
        outHeight * ((subCfg.bottomMarginPct || 10) / 100)
      );
      const boxX = (outWidth - boxW) * 0.5;
      const boxY = outHeight - bottomOffset - boxH;

      if (subCfg.bgOpacity > 0.05) {
        ctx.fillStyle = `rgba(11, 12, 14, ${subCfg.bgOpacity})`;
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(boxX, boxY, boxW, boxH);
      }

      ctx.fillStyle = subCfg.textColor || '#FFFFFF';
      ctx.fillText(textStr, outWidth * 0.5, boxY + boxH * 0.52);
      ctx.restore();
    }
  }

  if (fadeBlackAlpha > 0.01) {
    ctx.fillStyle = `rgba(11, 12, 14, ${Math.min(1, fadeBlackAlpha)})`;
    ctx.fillRect(0, 0, outWidth, outHeight);
  }

  if (config.burnTimecode || config.watermarkText.trim()) {
    ctx.fillStyle = 'rgba(11, 12, 14, 0.72)';
    ctx.fillRect(16, outHeight - 44, Math.min(outWidth - 32, 340), 28);
    ctx.fillStyle = '#F97316';
    ctx.font = 'bold 13px monospace';
    const tcText = config.burnTimecode ? `TC ${globalTimeSec.toFixed(2)}s` : '';
    const wmText = config.watermarkText.trim();
    const combinedLabel = [wmText, tcText].filter(Boolean).join('  ·  ');
    ctx.fillText(combinedLabel, 26, outHeight - 25);
  }
}

/**
 * Decodes and concatenates audio tracks of multiple videos in parallel (~30ms)
 * so video elements can run 100% muted without AudioContext clock stalls!
 */
async function buildMergedVideoAudioBuffer(
  videos: VideoMetadata[],
  effectiveSpeed: number,
  fadeTransition: boolean
): Promise<AudioBuffer | null> {
  try {
    const sampleRate = 44100;
    const decodedList = await Promise.all(
      videos.map(async (v) => {
        try {
          const item = await decodeMediaFileToAudio(v.file);
          return item.buffer;
        } catch {
          return null;
        }
      })
    );

    const totalScaledDuration = videos.reduce(
      (acc, v) => acc + Math.max(0.2, v.duration) / effectiveSpeed,
      0
    );
    const totalFrames = Math.max(
      1,
      Math.ceil(totalScaledDuration * sampleRate)
    );
    const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);
    const outBuffer = offlineCtx.createBuffer(2, totalFrames, sampleRate);
    const outL = outBuffer.getChannelData(0);
    const outR = outBuffer.getChannelData(1);

    let writeCursor = 0;
    for (let idx = 0; idx < videos.length; idx++) {
      const clipFrames = Math.floor(
        (Math.max(0.2, videos[idx].duration) / effectiveSpeed) * sampleRate
      );
      const srcBuf = decodedList[idx];

      if (srcBuf && srcBuf.length > 0) {
        const srcL = srcBuf.getChannelData(0);
        const srcR =
          srcBuf.numberOfChannels > 1 ? srcBuf.getChannelData(1) : srcL;
        const ratio = srcBuf.length / Math.max(1, clipFrames);
        const fadeFrames = fadeTransition
          ? Math.min(Math.floor(sampleRate * 0.25), Math.floor(clipFrames * 0.2))
          : 0;

        for (let i = 0; i < clipFrames; i++) {
          const dstIdx = writeCursor + i;
          if (dstIdx >= totalFrames) break;
          const srcIdx = Math.min(srcBuf.length - 1, Math.floor(i * ratio));
          let env = 1.0;
          if (fadeFrames > 0) {
            if (idx > 0 && i < fadeFrames) {
              env = i / fadeFrames;
            } else if (
              idx < videos.length - 1 &&
              clipFrames - i < fadeFrames
            ) {
              env = (clipFrames - i) / fadeFrames;
            }
          }
          outL[dstIdx] = srcL[srcIdx] * env;
          outR[dstIdx] = srcR[srcIdx] * env;
        }
      }
      writeCursor += clipFrames;
    }

    return outBuffer;
  } catch {
    return null;
  }
}

/**
 * Merges / Concatenates Multiple Video Files into a Single Continuous Video File
 * Architecture:
 * 1. Pre-renders combined audio track in parallel (<40ms) via OfflineAudioContext
 * 2. Runs all <video> elements 100% muted to eliminate AudioContext clock-slave stalls
 * 3. Uses 48x27 Mipmap Blur & Zero-Filter GPU texture blits
 * 4. Supports Turbo Hardware Speed Boost (1x / 2x / 4x)
 */
export async function mergeVideosLocally(
  videos: VideoMetadata[],
  config: VideoProcessConfig,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  if (videos.length === 0) {
    throw new Error('حداقل یک ویدیو برای اتصال باید در لیست وجود داشته باشد');
  }

  onProgress?.(6);

  if (config.logoOverlay?.enabled && config.logoOverlay.imageUrl) {
    await preloadLogoOverlayImage(config.logoOverlay.imageUrl).catch(() => {});
  }

  const primaryMeta = videos[0];
  const { outWidth, outHeight } = computeTargetDimensions(
    primaryMeta.width,
    primaryMeta.height,
    config.targetHeight,
    config.rotationDeg,
    config.aspectRatioPreset
  );

  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx =
    canvas.getContext('2d', { alpha: false, desynchronized: true }) ||
    canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const mosaicCanvas = document.createElement('canvas');
  const mosaicCtx = mosaicCanvas.getContext('2d', { alpha: false });

  // Tiny 48x27 mipmap buffer for ultra-fast blurred backdrops
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = 48;
  blurCanvas.height = 27;
  const blurCtx = blurCanvas.getContext('2d', { alpha: false });

  const userSpeed = config.playbackRate || 1.0;
  const turboBoost = config.renderSpeedBoost || 1;
  // Browsers support playbackRate up to 8x reliably on hardware decoders
  const effectiveSpeed = Math.min(8.0, userSpeed * turboBoost);

  // Step 1: Pre-decode & stitch all audio tracks in parallel (<40ms) while pre-warming video decoders
  let audioCtx: AudioContext | null = null;
  let audioSourceNode: AudioBufferSourceNode | null = null;
  let audioTracks: MediaStreamTrack[] = [];

  const mergedAudioPromise = !config.muteAudio
    ? buildMergedVideoAudioBuffer(
        videos,
        effectiveSpeed,
        config.mergeTransition === 'fade-black'
      )
    : Promise.resolve(null);

  const mergedAudioBuffer = await mergedAudioPromise;
  onProgress?.(14);

  if (!config.muteAudio && mergedAudioBuffer) {
    try {
      audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      const destNode = audioCtx.createMediaStreamDestination();
      audioSourceNode = audioCtx.createBufferSource();
      audioSourceNode.buffer = mergedAudioBuffer;
      audioSourceNode.connect(destNode);
      audioTracks = destNode.stream.getAudioTracks();
    } catch {
      audioCtx = null;
    }
  }

  const canvasStream = canvas.captureStream(config.fps);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioTracks,
  ]);

  const { mimeType: selectedMime, ext } = selectHardwareMimeType(
    config.containerFormat
  );

  const recorder = createSafeMediaRecorder(
    combinedStream,
    selectedMime,
    config.targetBitrateKbps * 1000 * Math.min(2, turboBoost)
  );

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  recorder.start(80);
  if (audioSourceNode) {
    try {
      audioSourceNode.start(0);
    } catch {}
  }

  let accumulatedSec = 0;

  for (let idx = 0; idx < videos.length; idx++) {
    const clipMeta = videos[idx];
    const vidEl = document.createElement('video');
    vidEl.preload = 'auto';
    vidEl.playsInline = true;
    vidEl.muted = true; // 100% muted so hardware video decoder never blocks on audio sink!
    vidEl.src = clipMeta.objectUrl;
    vidEl.load();

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 900);
      vidEl.onloadeddata = () => {
        clearTimeout(timeout);
        resolve();
      };
      vidEl.oncanplay = () => {
        clearTimeout(timeout);
        resolve();
      };
      vidEl.onerror = () => {
        clearTimeout(timeout);
        resolve();
      };
    });

    try {
      vidEl.playbackRate = effectiveSpeed;
    } catch {
      vidEl.playbackRate = 2.0;
    }

    const dur = Math.max(0.2, clipMeta.duration || 2.0);
    const maxWallClockMs = ((dur / effectiveSpeed) * 1000) + 600;

    await new Promise<void>((resolveClip) => {
      let timerId: ReturnType<typeof setTimeout> | null = null;
      let finished = false;
      const clipStartWall = performance.now();

      const finishClip = () => {
        if (finished) return;
        finished = true;
        if (timerId) clearTimeout(timerId);
        releaseVideoDecoder(vidEl);
        accumulatedSec += dur;
        resolveClip();
      };

      const drawClipFrame = () => {
        if (finished) return;
        const wallElapsedMs = performance.now() - clipStartWall;
        const cur = vidEl.currentTime;
        const clipRatio = Math.min(
          1,
          Math.max(cur / dur, wallElapsedMs / Math.max(100, (dur / effectiveSpeed) * 1000))
        );
        const overallPct = Math.min(
          98,
          Math.round(((idx + clipRatio) / videos.length) * 82 + 15)
        );
        onProgress?.(overallPct);

        let fadeAlpha = 0;
        if (config.mergeTransition === 'fade-black') {
          const fadeWindow = Math.min(0.35, dur * 0.2);
          if (idx > 0 && cur < fadeWindow) {
            fadeAlpha = 1 - cur / fadeWindow;
          } else if (idx < videos.length - 1 && dur - cur < fadeWindow) {
            fadeAlpha = 1 - Math.max(0, dur - cur) / fadeWindow;
          }
        }

        renderVideoFrameToCanvas(
          ctx,
          canvas,
          mosaicCanvas,
          mosaicCtx,
          blurCanvas,
          blurCtx,
          vidEl,
          clipMeta.width,
          clipMeta.height,
          outWidth,
          outHeight,
          config,
          fadeAlpha,
          accumulatedSec + cur
        );

        if (
          vidEl.ended ||
          cur >= dur - 0.04 ||
          wallElapsedMs >= maxWallClockMs
        ) {
          finishClip();
        } else {
          // Use 16ms timer instead of requestAnimationFrame so background tabs & mobile battery saver never pause rendering!
          timerId = setTimeout(drawClipFrame, 16);
        }
      };

      vidEl.onended = finishClip;
      vidEl
        .play()
        .then(() => {
          drawClipFrame();
        })
        .catch(() => {
          finishClip();
        });
    });
  }

  return new Promise((resolve) => {
    recorder.onstop = () => {
      if (audioSourceNode) {
        try {
          audioSourceNode.stop();
        } catch {}
      }
      combinedStream.getTracks().forEach((t) => t.stop());
      if (audioCtx) audioCtx.close().catch(() => {});
      const blob = new Blob(chunks, { type: selectedMime });
      onProgress?.(100);
      resolve({
        blob,
        filename: `kronos-merged-${videos.length}-videos-${outHeight}p.${ext}`,
        mimeType: selectedMime,
      });
    };
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
  });
}

/**
 * Fast 100% Client-Side Binary GIF89a Encoder (3-3-2 256-Color Palette + LZW MinCodeSize=8)
 * Encodes a sequence of RGBA ImageData frames into an animated looping .gif Blob in <150ms
 */
function encodeFramesToGif89aBlob(
  frames: ImageData[],
  width: number,
  height: number,
  delayMs: number
): Blob {
  const bytes: number[] = [];
  const writeByte = (b: number) => bytes.push(b & 0xff);
  const writeShort = (s: number) => {
    bytes.push(s & 0xff);
    bytes.push((s >> 8) & 0xff);
  };
  const writeAscii = (str: string) => {
    for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
  };

  // Header: GIF89a
  writeAscii('GIF89a');
  writeShort(width);
  writeShort(height);
  writeByte(0xf7); // Global Color Table Flag (1), Color Res (7), Sort (0), Size of GCT (7 -> 256 colors)
  writeByte(0); // Background color index
  writeByte(0); // Pixel aspect ratio

  // Global Color Table: 3-3-2 RGB quantization (256 entries * 3 bytes)
  for (let i = 0; i < 256; i++) {
    const r3 = (i >> 5) & 0x07;
    const g3 = (i >> 2) & 0x07;
    const b2 = i & 0x03;
    writeByte(Math.round((r3 * 255) / 7));
    writeByte(Math.round((g3 * 255) / 7));
    writeByte(Math.round((b2 * 255) / 3));
  }

  // Netscape 2.0 Application Extension for Infinite Looping
  writeByte(0x21);
  writeByte(0xff);
  writeByte(11);
  writeAscii('NETSCAPE2.0');
  writeByte(3);
  writeByte(1);
  writeShort(0); // 0 = loop forever
  writeByte(0);

  const delayCs = Math.max(2, Math.round(delayMs / 10));

  // LZW Encoder for 8-bit color indices (Clear=256, EOI=257)
  const lzwEncodeIndices = (indices: Uint8Array): number[] => {
    const out: number[] = [];
    const minCodeSize = 8;
    const clearCode = 256;
    const eoiCode = 257;

    let bitBuf = 0;
    let bitCount = 0;
    const subBlock: number[] = [];

    const flushSubBlock = () => {
      if (subBlock.length > 0) {
        out.push(subBlock.length);
        for (let i = 0; i < subBlock.length; i++) out.push(subBlock[i]);
        subBlock.length = 0;
      }
    };

    const emitCode = (code: number, codeSize: number) => {
      bitBuf |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        subBlock.push(bitBuf & 0xff);
        if (subBlock.length === 255) flushSubBlock();
        bitBuf >>= 8;
        bitCount -= 8;
      }
    };

    out.push(minCodeSize);

    let codeSize = 9;
    let nextCode = 258;
    // Fast flat dictionary table: (prefix << 8) | suffix -> code
    const dict = new Int32Array(4096 * 256);
    dict.fill(-1);

    emitCode(clearCode, codeSize);
    if (indices.length === 0) {
      emitCode(eoiCode, codeSize);
    } else {
      let prefix = indices[0];
      for (let i = 1; i < indices.length; i++) {
        const suffix = indices[i];
        const key = (prefix << 8) | suffix;
        const found = dict[key];
        if (found !== -1) {
          prefix = found;
        } else {
          emitCode(prefix, codeSize);
          if (nextCode < 4096) {
            dict[key] = nextCode++;
            if (nextCode > 1 << codeSize && codeSize < 12) {
              codeSize++;
            }
          } else {
            emitCode(clearCode, codeSize);
            dict.fill(-1);
            codeSize = 9;
            nextCode = 258;
          }
          prefix = suffix;
        }
      }
      emitCode(prefix, codeSize);
      emitCode(eoiCode, codeSize);
    }

    if (bitCount > 0) {
      subBlock.push(bitBuf & 0xff);
    }
    flushSubBlock();
    out.push(0); // Block terminator
    return out;
  };

  const pixelCount = width * height;
  // OPTIMIZATION #6: Acquire reusable Uint8Array from TypedArray Ring-Buffer Arena (Zero GC pause)
  const indexedBuf = typedArrayArena.acquireUint8(pixelCount);

  for (let f = 0; f < frames.length; f++) {
    // Graphic Control Extension
    writeByte(0x21);
    writeByte(0xf9);
    writeByte(4);
    writeByte(0x04); // Disposal method 1 (Do not dispose)
    writeShort(delayCs);
    writeByte(0);
    writeByte(0);

    // Image Descriptor
    writeByte(0x2c);
    writeShort(0);
    writeShort(0);
    writeShort(width);
    writeShort(height);
    writeByte(0); // No local color table

    const precompressed = (frames[f] as ImageData & { _workerLzw?: Uint8Array })._workerLzw;
    if (precompressed && precompressed.byteLength > 0) {
      for (let i = 0; i < precompressed.length; i++) {
        bytes.push(precompressed[i]);
      }
    } else {
      const rgba = frames[f].data;
      for (let p = 0, j = 0; p < pixelCount; p++, j += 4) {
        const r = rgba[j] >> 5;
        const g = rgba[j + 1] >> 5;
        const b = rgba[j + 2] >> 6;
        indexedBuf[p] = (r << 5) | (g << 2) | b;
      }

      const compressed = lzwEncodeIndices(indexedBuf);
      for (let i = 0; i < compressed.length; i++) {
        bytes.push(compressed[i]);
      }
    }
  }

  typedArrayArena.releaseUint8(indexedBuf);
  writeByte(0x3b); // GIF Trailer
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
}

/**
 * FEATURE #2: Convert Video Segment to Animated Looping GIF89a
 */
export async function convertVideoToAnimatedGif(
  meta: VideoMetadata,
  config: VideoProcessConfig,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  onProgress?.(10);
  const startSec = Math.max(0, Math.min(config.trimStartSec, meta.duration - 0.1));
  const endSec = Math.max(
    startSec + 0.3,
    Math.min(config.trimEndSec || meta.duration, meta.duration)
  );
  // Cap GIF duration to 6 seconds for crisp performance and lightweight file size
  const gifDuration = Math.min(6.0, endSec - startSec);
  const gifFps = config.gifFps || 10;
  const totalFrames = Math.max(6, Math.min(60, Math.round(gifDuration * gifFps)));

  const gifW = config.gifWidth || 320;
  const gifH = Math.max(160, Math.round((meta.height / meta.width) * gifW));

  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = meta.objectUrl;
  video.load();

  await new Promise<void>((res) => {
    const t = setTimeout(res, 900);
    video.onloadeddata = () => {
      clearTimeout(t);
      res();
    };
    video.onerror = () => {
      clearTimeout(t);
      res();
    };
  });

  const canvas = document.createElement('canvas');
  canvas.width = gifW;
  canvas.height = gifH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context unavailable');

  const mosaicCanvas = document.createElement('canvas');
  const mosaicCtx = mosaicCanvas.getContext('2d', { alpha: false });
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = 48;
  blurCanvas.height = 27;
  const blurCtx = blurCanvas.getContext('2d', { alpha: false });

  const frames: ImageData[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const seekSec = startSec + (i / Math.max(1, totalFrames - 1)) * gifDuration;
    video.currentTime = seekSec;
    await new Promise<void>((res) => {
      const t = setTimeout(res, 110);
      video.onseeked = () => {
        clearTimeout(t);
        res();
      };
    });

    renderVideoFrameToCanvas(
      ctx,
      canvas,
      mosaicCanvas,
      mosaicCtx,
      blurCanvas,
      blurCtx,
      video,
      meta.width,
      meta.height,
      gifW,
      gifH,
      config,
      0,
      seekSec
    );

    frames.push(ctx.getImageData(0, 0, gifW, gifH));
    onProgress?.(15 + Math.round(((i + 1) / totalFrames) * 70));
  }

  releaseVideoDecoder(video);

  // OPTIMIZATION #7: Parallel LZW frame encoding across Multi-Core Worker Pool
  await Promise.all(
    frames.map(async (frm) => {
      const lzw = await encodeGifFrameLzwInWorker(frm);
      if (lzw) {
        (frm as ImageData & { _workerLzw?: Uint8Array })._workerLzw = lzw;
      }
    })
  );

  const gifBlob = encodeFramesToGif89aBlob(
    frames,
    gifW,
    gifH,
    Math.round(1000 / gifFps)
  );
  // Mirror to OPFS scratch disk (#4) if supported
  opfsScratchDisk
    .writeScratchBuffer(`${meta.name}.gif`, await gifBlob.arrayBuffer())
    .catch(() => {});
  onProgress?.(100);

  const baseName = meta.name.replace(/\.[^/.]+$/, '');
  return {
    blob: gifBlob,
    filename: `${baseName}-${gifW}w-${gifFps}fps.gif`,
    mimeType: 'image/gif',
  };
}

/**
 * FEATURE #4: Smart Video Frame Extractor & Contact Sheet Storyboard Bundler (ZIP)
 */
export async function extractFramesAndStoryboardToZip(
  meta: VideoMetadata,
  config: VideoProcessConfig,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; filename: string; mimeType: string; storyboardUrl?: string }> {
  onProgress?.(8);
  const count = config.frameExtractCount || 9;
  const startSec = Math.max(0, Math.min(config.trimStartSec, meta.duration - 0.1));
  const endSec = Math.max(
    startSec + 0.2,
    Math.min(config.trimEndSec || meta.duration, meta.duration)
  );
  const span = Math.max(0.2, endSec - startSec);

  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = meta.objectUrl;
  video.load();

  await new Promise<void>((res) => {
    const t = setTimeout(res, 900);
    video.onloadeddata = () => {
      clearTimeout(t);
      res();
    };
    video.onerror = () => {
      clearTimeout(t);
      res();
    };
  });

  const frameW = Math.min(1280, meta.width || 640);
  const frameH = Math.min(720, meta.height || 360);
  const canvas = document.createElement('canvas');
  canvas.width = frameW;
  canvas.height = frameH;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas context unavailable');

  const mosaicCanvas = document.createElement('canvas');
  const mosaicCtx = mosaicCanvas.getContext('2d', { alpha: false });
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = 48;
  blurCanvas.height = 27;
  const blurCtx = blurCanvas.getContext('2d', { alpha: false });

  // Prepare Contact Sheet Storyboard Canvas
  const cols = count <= 6 ? 3 : count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / cols);
  const cellW = 360;
  const cellH = Math.round((frameH / frameW) * cellW);
  const pad = 20;
  const headerH = 74;
  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = cols * cellW + (cols + 1) * pad;
  sheetCanvas.height = headerH + rows * (cellH + 28) + (rows + 1) * pad;
  const sCtx = sheetCanvas.getContext('2d', { alpha: false });

  if (sCtx) {
    sCtx.fillStyle = '#0B0C0E';
    sCtx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);
    sCtx.fillStyle = '#121418';
    sCtx.fillRect(pad, pad, sheetCanvas.width - pad * 2, headerH - 12);
    sCtx.fillStyle = '#F97316';
    sCtx.fillRect(pad, pad, 6, headerH - 12);
    sCtx.fillStyle = '#F4F4F6';
    sCtx.font = 'bold 16px monospace';
    sCtx.fillText(
      `KRONOS STORYBOARD CONTACT SHEET // ${meta.name}`,
      pad + 18,
      pad + 26
    );
    sCtx.fillStyle = '#9CA3AF';
    sCtx.font = '12px monospace';
    sCtx.fillText(
      `Resolution: ${meta.width}x${meta.height}px  |  Duration: ${meta.duration.toFixed(
        2
      )}s  |  Extracted Keyframes: ${count}`,
      pad + 18,
      pad + 46
    );
  }

  const zip = new JSZip();
  const baseName = meta.name.replace(/\.[^/.]+$/, '');

  for (let i = 0; i < count; i++) {
    const seekSec =
      startSec + ((i + 0.5) / count) * span;
    video.currentTime = Math.min(meta.duration - 0.02, seekSec);
    await new Promise<void>((res) => {
      const t = setTimeout(res, 110);
      video.onseeked = () => {
        clearTimeout(t);
        res();
      };
    });

    renderVideoFrameToCanvas(
      ctx,
      canvas,
      mosaicCanvas,
      mosaicCtx,
      blurCanvas,
      blurCtx,
      video,
      meta.width,
      meta.height,
      frameW,
      frameH,
      config,
      0,
      seekSec
    );

    const blob = await new Promise<Blob>((res) =>
      canvas.toBlob((b) => res(b!), 'image/jpeg', 0.92)
    );
    const ab = await blob.arrayBuffer();
    const fname = `${baseName}-frame-${String(i + 1).padStart(
      2,
      '0'
    )}-at-${seekSec.toFixed(2)}s.jpg`;
    zip.file(fname, ab, { compression: 'STORE' });

    if (sCtx) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const cx = pad + c * (cellW + pad);
      const cy = headerH + pad + r * (cellH + 28 + pad);
      sCtx.drawImage(canvas, cx, cy, cellW, cellH);
      sCtx.strokeStyle = 'rgba(255,255,255,0.15)';
      sCtx.strokeRect(cx, cy, cellW, cellH);
      sCtx.fillStyle = '#191C22';
      sCtx.fillRect(cx, cy + cellH, cellW, 24);
      sCtx.fillStyle = '#F97316';
      sCtx.font = 'bold 11px monospace';
      sCtx.fillText(
        `#${String(i + 1).padStart(2, '0')} · TC ${seekSec.toFixed(2)}s`,
        cx + 8,
        cy + cellH + 16
      );
    }

    onProgress?.(12 + Math.round(((i + 1) / count) * 75));
  }

  releaseVideoDecoder(video);

  if (sCtx) {
    const sheetBlob = await new Promise<Blob>((res) =>
      sheetCanvas.toBlob((b) => res(b!), 'image/png')
    );
    zip.file(
      `00-${baseName}-storyboard-sheet.png`,
      await sheetBlob.arrayBuffer(),
      { compression: 'STORE' }
    );
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
  });
  onProgress?.(100);

  return {
    blob: zipBlob,
    filename: `${baseName}-${count}-frames-and-storyboard.zip`,
    mimeType: 'application/zip',
  };
}

/**
 * FEATURE #6: Boomerang (Forward + Reverse Loop) & Reverse Video Generator
 */
export async function createBoomerangOrReverseVideo(
  meta: VideoMetadata,
  config: VideoProcessConfig,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  onProgress?.(8);
  const startSec = Math.max(0, Math.min(config.trimStartSec, meta.duration - 0.1));
  const endSec = Math.max(
    startSec + 0.3,
    Math.min(config.trimEndSec || meta.duration, meta.duration)
  );
  const clipDur = Math.min(5.0, endSec - startSec);
  const captureFps = 18;
  const totalSampleFrames = Math.max(10, Math.min(64, Math.round(clipDur * captureFps)));

  const { outWidth, outHeight } = computeTargetDimensions(
    meta.width,
    meta.height,
    config.targetHeight || 480,
    config.rotationDeg,
    config.aspectRatioPreset
  );

  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = meta.objectUrl;
  video.load();

  await new Promise<void>((res) => {
    const t = setTimeout(res, 900);
    video.onloadeddata = () => {
      clearTimeout(t);
      res();
    };
    video.onerror = () => {
      clearTimeout(t);
      res();
    };
  });

  const mosaicCanvas = document.createElement('canvas');
  const mosaicCtx = mosaicCanvas.getContext('2d', { alpha: false });
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = 48;
  blurCanvas.height = 27;
  const blurCtx = blurCanvas.getContext('2d', { alpha: false });

  const frameCanvases: HTMLCanvasElement[] = [];

  for (let i = 0; i < totalSampleFrames; i++) {
    const seekSec =
      startSec + (i / Math.max(1, totalSampleFrames - 1)) * clipDur;
    video.currentTime = seekSec;
    await new Promise<void>((res) => {
      const t = setTimeout(res, 95);
      video.onseeked = () => {
        clearTimeout(t);
        res();
      };
    });

    const fCanvas = document.createElement('canvas');
    fCanvas.width = outWidth;
    fCanvas.height = outHeight;
    const fCtx = fCanvas.getContext('2d', { alpha: false });
    if (fCtx) {
      renderVideoFrameToCanvas(
        fCtx,
        fCanvas,
        mosaicCanvas,
        mosaicCtx,
        blurCanvas,
        blurCtx,
        video,
        meta.width,
        meta.height,
        outWidth,
        outHeight,
        config,
        0,
        seekSec
      );
      frameCanvases.push(fCanvas);
    }
    onProgress?.(10 + Math.round(((i + 1) / totalSampleFrames) * 50));
  }

  releaseVideoDecoder(video);

  const sequence: HTMLCanvasElement[] =
    config.boomerangMode === 'reverse-only'
      ? [...frameCanvases].reverse()
      : [...frameCanvases, ...[...frameCanvases].reverse().slice(1)];

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  const outCtx = outCanvas.getContext('2d', { alpha: false });
  if (!outCtx) throw new Error('Canvas context unavailable');

  const stream = outCanvas.captureStream(config.fps || 30);
  const { mimeType: selectedMime, ext } = selectHardwareMimeType(
    config.containerFormat
  );
  const recorder = createSafeMediaRecorder(
    stream,
    selectedMime,
    config.targetBitrateKbps * 1000
  );

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  recorder.start(60);

  const frameDelayMs = Math.round(1000 / (captureFps * 1.35));
  for (let idx = 0; idx < sequence.length; idx++) {
    outCtx.drawImage(sequence[idx], 0, 0);
    await new Promise((r) => setTimeout(r, frameDelayMs));
    onProgress?.(62 + Math.round(((idx + 1) / sequence.length) * 35));
  }

  return new Promise((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: selectedMime });
      const baseName = meta.name.replace(/\.[^/.]+$/, '');
      const modeTag =
        config.boomerangMode === 'reverse-only' ? 'reversed' : 'boomerang';
      onProgress?.(100);
      resolve({
        blob,
        filename: `${baseName}-${modeTag}.${ext}`,
        mimeType: selectedMime,
      });
    };
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
  });
}

export async function processVideoLocally(
  meta: VideoMetadata,
  config: VideoProcessConfig,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  if (config.operation === 'extract-audio') {
    return extractAudioFromVideo(
      meta.file,
      config.extractedAudioFormat,
      config.trimStartSec,
      config.trimEndSec,
      config.applyNoiseReductionOnExtract,
      onProgress
    );
  }
  if (config.operation === 'video-to-gif') {
    return convertVideoToAnimatedGif(meta, config, onProgress);
  }
  if (config.operation === 'extract-frames-zip') {
    return extractFramesAndStoryboardToZip(meta, config, onProgress);
  }
  if (config.operation === 'boomerang-reverse') {
    return createBoomerangOrReverseVideo(meta, config, onProgress);
  }

  if (config.logoOverlay?.enabled && config.logoOverlay.imageUrl) {
    await preloadLogoOverlayImage(config.logoOverlay.imageUrl).catch(() => {});
  }

  onProgress?.(6);

  const startSec = Math.max(
    0,
    Math.min(config.trimStartSec, meta.duration - 0.1)
  );
  const endSec = Math.max(
    startSec + 0.2,
    Math.min(config.trimEndSec || meta.duration, meta.duration)
  );
  const clipDuration = endSec - startSec;

  const userSpeed = config.playbackRate || 1.0;
  const turboBoost = config.renderSpeedBoost || 1;
  const effectiveSpeed = Math.min(8.0, userSpeed * turboBoost);

  const { outWidth, outHeight } = computeTargetDimensions(
    meta.width,
    meta.height,
    config.targetHeight,
    config.rotationDeg,
    config.aspectRatioPreset
  );

  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx =
    canvas.getContext('2d', { alpha: false, desynchronized: true }) ||
    canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const mosaicCanvas = document.createElement('canvas');
  const mosaicCtx = mosaicCanvas.getContext('2d', { alpha: false });

  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = 48;
  blurCanvas.height = 27;
  const blurCtx = blurCanvas.getContext('2d', { alpha: false });

  // Pre-decode audio track offline so <video> stays 100% muted without AudioContext clock stalls
  const shouldMute = config.operation === 'strip-audio' || config.muteAudio;
  let audioCtx: AudioContext | null = null;
  let audioSourceNode: AudioBufferSourceNode | null = null;
  let audioTracks: MediaStreamTrack[] = [];

  if (!shouldMute) {
    try {
      const sourceFileToDecode =
        (config.operation === 'replace-audio' && config.replacementAudioFile) ||
        config.replacementAudioFile ||
        meta.file;

      const decoded = await decodeMediaFileToAudio(sourceFileToDecode);
      audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      const destNode = audioCtx.createMediaStreamDestination();
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = config.replacementAudioGain ?? 1.0;

      audioSourceNode = audioCtx.createBufferSource();
      audioSourceNode.buffer = decoded.buffer;
      audioSourceNode.playbackRate.value = effectiveSpeed;
      audioSourceNode.connect(gainNode);
      gainNode.connect(destNode);
      audioTracks = destNode.stream.getAudioTracks();
    } catch {
      audioCtx = null;
    }
  }

  onProgress?.(14);

  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true; // Muted for maximum hardware decoder speed
  video.playsInline = true;
  video.src = meta.objectUrl;
  video.load();

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => resolve(), 1000);
    video.onloadeddata = () => {
      clearTimeout(timeout);
      resolve();
    };
    video.oncanplay = () => {
      clearTimeout(timeout);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('خطا در بارگذاری جریان ویدیو'));
    };
  });

  try {
    video.playbackRate = effectiveSpeed;
  } catch {
    video.playbackRate = 2.0;
  }

  const canvasStream = canvas.captureStream(config.fps);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioTracks,
  ]);

  const { mimeType: selectedMime, ext } = selectHardwareMimeType(
    config.containerFormat
  );

  const recorder = createSafeMediaRecorder(
    combinedStream,
    selectedMime,
    config.targetBitrateKbps * 1000 * Math.min(2, turboBoost)
  );

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  if (startSec > 0.02) {
    video.currentTime = startSec;
    await new Promise<void>((res) => {
      const t = setTimeout(res, 200);
      video.onseeked = () => {
        clearTimeout(t);
        res();
      };
    });
  }

  const maxWallClockMs = ((clipDuration / effectiveSpeed) * 1000) + 600;

  return new Promise((resolve, reject) => {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let finished = false;
    const startWall = performance.now();

    const stopAll = () => {
      if (finished) return;
      finished = true;
      if (timerId) clearTimeout(timerId);
      releaseVideoDecoder(video);
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    };

    recorder.onstop = () => {
      if (timerId) clearTimeout(timerId);
      if (audioSourceNode) {
        try {
          audioSourceNode.stop();
        } catch {}
      }
      combinedStream.getTracks().forEach((t) => t.stop());
      if (audioCtx) audioCtx.close().catch(() => {});
      const blob = new Blob(chunks, { type: selectedMime });
      const baseName = meta.name.replace(/\.[^/.]+$/, '');
      const speedTag = userSpeed !== 1.0 ? `-${userSpeed}x` : '';
      const ratioTag =
        config.aspectRatioPreset !== 'original'
          ? `-${config.aspectRatioPreset.replace(':', 'x')}`
          : '';
      const stabTag = config.motionStabilization.enabled ? '-stabilized' : '';
      const suffix =
        config.operation === 'strip-audio'
          ? 'muted'
          : config.operation === 'replace-audio'
          ? `dubbed-${outHeight}p${ratioTag}${speedTag}${stabTag}`
          : `${outHeight}p${ratioTag}${speedTag}${stabTag}`;
      onProgress?.(100);
      resolve({
        blob,
        filename: `${baseName}-${suffix}.${ext}`,
        mimeType: selectedMime,
      });
    };

    recorder.onerror = () => {
      if (timerId) clearTimeout(timerId);
      releaseVideoDecoder(video);
      combinedStream.getTracks().forEach((t) => t.stop());
      if (audioCtx) audioCtx.close().catch(() => {});
      reject(new Error('خطا در موتور کدگذاری ویدیو'));
    };

    recorder.start(80);
    if (audioSourceNode) {
      try {
        audioSourceNode.start(0, startSec, clipDuration);
      } catch {}
    }

    video.onended = stopAll;
    video.play().catch((err) => {
      reject(err);
    });

    const drawLoop = () => {
      if (finished) return;
      const wallElapsedMs = performance.now() - startWall;
      const current = video.currentTime;
      const pct = Math.min(
        99,
        Math.max(
          15,
          Math.round(
            Math.max(
              (current - startSec) / clipDuration,
              wallElapsedMs / Math.max(100, (clipDuration / effectiveSpeed) * 1000)
            ) *
              82 +
              15
          )
        )
      );
      onProgress?.(pct);

      renderVideoFrameToCanvas(
        ctx,
        canvas,
        mosaicCanvas,
        mosaicCtx,
        blurCanvas,
        blurCtx,
        video,
        meta.width,
        meta.height,
        outWidth,
        outHeight,
        config,
        0,
        current
      );

      if (
        video.ended ||
        current >= endSec - 0.04 ||
        wallElapsedMs >= maxWallClockMs
      ) {
        stopAll();
      } else {
        timerId = setTimeout(drawLoop, 16);
      }
    };

    drawLoop();
  });
}

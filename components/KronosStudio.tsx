'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Film,
  Mic,
  FileText,
  Upload,
  Download,
  Play,
  Pause,
  Scissors,
  Sliders,
  Layers,
  RotateCw,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Volume2,
  VolumeX,
  RefreshCw,
  ShieldCheck,
  Cpu,
  HardDrive,
  FileSpreadsheet,
  Plus,
  EyeOff,
  Gauge,
  Maximize2,
  Radio,
  Music,
  Image as ImageIcon,
  FolderArchive,
  Square,
  Link2,
  Zap,
  Subtitles,
  Sparkles,
  Lock,
  Unlock,
  PenTool,
  FileCheck,
  FileCheck2,
  KeyRound,
  Wand2,
  Headphones,
} from 'lucide-react';
import WaveformCanvas from './WaveformCanvas';
import SignaturePadCanvas from './SignaturePadCanvas';
import {
  generateSampleAudioFiles,
  generateSamplePdfFiles,
  generateSampleVideoFiles,
  generateSampleImageFiles,
} from '@/lib/sample-generator';
import {
  DecodedAudioItem,
  NoiseReductionConfig,
  AudioExportConfig,
  AudiogramConfig,
  DEFAULT_NOISE_REDUCTION,
  EQ_PRESETS,
  decodeMediaFileToAudio,
  processAudioBufferWithDSP,
  mergeAudioTracks,
  encodeAudioBufferToFormat,
  extractWaveformMetrics,
  generateAudiogramVideo,
} from '@/lib/audio-engine';
import {
  VideoMetadata,
  VideoProcessConfig,
  SubtitleCue,
  parseSrtSubtitles,
  preloadLogoOverlayImage,
  inspectVideoFile,
  processVideoLocally,
  mergeVideosLocally,
} from '@/lib/video-engine';
import {
  PdfDocumentMeta,
  PdfPageItem,
  PdfProcessConfig,
  PdfSignAndRedactConfig,
  PdfSecurityGridConfig,
  inspectPdfFile,
  mergeAndCompressPdfs,
  splitPdfByRangesToZip,
  convertImagesToPdf,
  exportPdfPagesToImagesZip,
  extractEmbeddedImagesFromPdf,
  compressAndOptimizeImages,
  signAndRedactPdf,
  applyPdfSecurityGridAndTheme,
  ExtractedPdfImageItem,
  OptimizedImageResult,
  ImageOptimizationConfig,
} from '@/lib/pdf-engine';
import {
  BatchRenameConfig,
  FileHashAuditItem,
  computeBatchRenamedList,
  packageBatchRenamedFilesToZip,
  encryptFileAes256Gcm,
  decryptFileAes256Gcm,
  inspectFilesCryptographicHashes,
} from '@/lib/batch-security-engine';
import {
  HardwareProfile,
  PerformanceProfileMode,
  LiveTelemetrySnapshot,
  probeClientHardware,
  memoryArena,
  thermalGovernor,
  scheduleSpeculativeIdlePreAnalysis,
  opfsScratchDisk,
} from '@/lib/hardware-optimizer';

type ActiveWorkspaceTab = 'video' | 'audio' | 'pdf' | 'batch-vault';

interface ExportedOutputItem {
  id: string;
  title: string;
  category: 'video' | 'audio' | 'pdf' | 'archive';
  originalSizeBytes: number;
  outputSizeBytes: number;
  url: string;
  filename: string;
  mimeType: string;
  createdAt: string;
  details: string;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.0';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`;
}

const DEFAULT_SAMPLE_SUBTITLES: SubtitleCue[] = [
  {
    id: 'sub-1',
    startSec: 0.0,
    endSec: 1.8,
    text: 'کرونوس استودیو — پردازش ۱۰۰٪ محلی روی سخت‌افزار شما',
  },
  {
    id: 'sub-2',
    startSec: 1.8,
    endSec: 4.5,
    text: 'شتاب‌دهی گرافیکی GPU و Web Worker بدون آپلود سرور',
  },
];

export default function KronosStudio() {
  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>('video');
  const [isGeneratingSamples, setIsGeneratingSamples] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [exportedItems, setExportedItems] = useState<ExportedOutputItem[]>([]);

  // ---------------- HARDWARE ACCELERATION & PROFILER STATE (12 ACCELERATORS) ----------------
  const [hwProfile, setHwProfile] = useState<HardwareProfile | null>(null);
  const [perfMode, setPerfMode] = useState<PerformanceProfileMode>('turbo-gpu');
  const [liveTelemetry, setLiveTelemetry] =
    useState<LiveTelemetrySnapshot | null>(null);
  const [isProxyScrubbing, setIsProxyScrubbing] = useState(false);
  const [showAllPdfPages, setShowAllPdfPages] = useState(false);
  const [showAllBatchFiles, setShowAllBatchFiles] = useState(false);

  useEffect(() => {
    probeClientHardware().then((profile) => {
      setHwProfile(profile);
      setPerfMode(profile.recommendedMode);
      setLiveTelemetry(thermalGovernor.getSnapshot());
    });
  }, []);

  // OPTIMIZATION #12: Live Frame-Time (FPS) & Thermal Auto-Throttling Monitor
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let frameCount = 0;

    const tick = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;
      thermalGovernor.recordFrameDelta(delta);
      frameCount++;
      if (frameCount % 30 === 0) {
        const snap = thermalGovernor.getSnapshot();
        setLiveTelemetry(snap);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // OPTIMIZATION #9: Release Smart 0.5x Proxy Scrubbing on global pointerup/touchend
  useEffect(() => {
    const releaseProxy = () => setIsProxyScrubbing(false);
    window.addEventListener('pointerup', releaseProxy);
    window.addEventListener('touchend', releaseProxy);
    return () => {
      window.removeEventListener('pointerup', releaseProxy);
      window.removeEventListener('touchend', releaseProxy);
    };
  }, []);

  // ---------------- VIDEO STUDIO STATE (MULTI-VIDEO + #1..#6) ----------------
  const [videoList, setVideoList] = useState<VideoMetadata[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [videoBatchAll, setVideoBatchAll] = useState<boolean>(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const srtFileInputRef = useRef<HTMLInputElement | null>(null);
  const logoOverlayInputRef = useRef<HTMLInputElement | null>(null);

  const selectedVideoMeta =
    videoList.find((v) => v.id === selectedVideoId) || videoList[0] || null;

  const [videoConfig, setVideoConfig] = useState<VideoProcessConfig>({
    operation: 'merge-videos',
    targetHeight: 720,
    targetBitrateKbps: 1200,
    fps: 30,
    containerFormat: 'webm-vp8',
    trimStartSec: 0,
    trimEndSec: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    rotationDeg: 0,
    flipHorizontal: false,
    muteAudio: false,
    burnTimecode: false,
    watermarkText: '',
    extractedAudioFormat: 'wav-16',
    applyNoiseReductionOnExtract: true,
    playbackRate: 1.0,
    preservePitch: true,
    privacyZone: {
      enabled: false,
      mode: 'blur',
      xPct: 30,
      yPct: 25,
      wPct: 35,
      hPct: 35,
      intensity: 18,
    },
    aspectRatioPreset: 'original',
    aspectFillMode: 'blur-backdrop',
    mergeTransition: 'fade-black',
    renderSpeedBoost: 4,
    replacementAudioFile: null,
    replacementAudioName: '',
    replacementAudioGain: 1.0,
    motionStabilization: {
      enabled: false,
      strength: 65,
    },
    subtitleBurn: {
      enabled: false,
      cues: DEFAULT_SAMPLE_SUBTITLES,
      fontSizePx: 24,
      textColor: '#FFFFFF',
      bgOpacity: 0.75,
      bottomMarginPct: 10,
    },
    gifFps: 12,
    gifWidth: 320,
    logoOverlay: {
      enabled: false,
      imageUrl: null,
      imageName: '',
      position: 'top-right',
      scalePct: 18,
      opacityPct: 90,
    },
    frameExtractCount: 9,
    chromaKey: {
      enabled: false,
      keyColor: 'green',
      similarity: 42,
      replacementMode: 'studio-dark',
    },
    boomerangMode: 'boomerang-loop',
    cinemaLut: 'none',
  });

  useEffect(() => {
    const vid = videoPreviewRef.current;
    if (!vid) return;
    vid.playbackRate = videoConfig.playbackRate;
    if ('preservesPitch' in vid) {
      (vid as HTMLVideoElement & { preservesPitch: boolean }).preservesPitch =
        videoConfig.preservePitch;
    }
  }, [videoConfig.playbackRate, videoConfig.preservePitch, selectedVideoMeta]);

  // ---------------- AUDIO & VOICE LAB STATE (#7..#11) ----------------
  const [audioTracks, setAudioTracks] = useState<DecodedAudioItem[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [audioMode, setAudioMode] = useState<
    'denoise-convert' | 'merge-voices' | 'live-recorder' | 'audiogram-video'
  >('denoise-convert');
  const [audioBatchAll, setAudioBatchAll] = useState<boolean>(false);
  const [crossfadeSec, setCrossfadeSec] = useState<number>(0.25);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioPreviewMode, setAudioPreviewMode] = useState<
    'original' | 'processed'
  >('processed');
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [processedPreviewPeaks, setProcessedPreviewPeaks] = useState<
    number[] | null
  >(null);
  const [processedRmsDb, setProcessedRmsDb] = useState<number | null>(null);
  const [processedDuration, setProcessedDuration] = useState<number | null>(
    null
  );
  const [customBgMusicName, setCustomBgMusicName] = useState<string | null>(
    null
  );
  const [audiogramConfig, setAudiogramConfig] = useState<AudiogramConfig>({
    aspectRatio: '9:16',
    titleText: 'پادکست اختصاصی کرونوس استودیو',
    subtitleText: 'KRONOS AUDIOGRAM // MASTERED DSP',
    accentColor: '#F97316',
  });

  // Live Studio Voice Recorder State
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveSpectrumBars, setLiveSpectrumBars] = useState<number[]>(
    new Array(28).fill(8)
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micTimerRef = useRef<number | null>(null);
  const micSpecFrameRef = useRef<number>(0);

  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const bgMusicInputRef = useRef<HTMLInputElement | null>(null);
  const activeAudioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioAnimFrameRef = useRef<number>(0);

  const [nrConfig, setNrConfig] = useState<NoiseReductionConfig>(
    DEFAULT_NOISE_REDUCTION
  );

  const [audioExportConfig, setAudioExportConfig] = useState<AudioExportConfig>(
    {
      format: 'wav-16',
      sampleRate: 44100,
      channels: 2,
      targetBitrateKbps: 128,
      trimStartSec: 0,
      trimEndSec: 0,
    }
  );

  // ---------------- PDF & IMAGE SUITE STATE (#20 & #21) ----------------
  const [pdfDocs, setPdfDocs] = useState<PdfDocumentMeta[]>([]);
  const [pdfPages, setPdfPages] = useState<PdfPageItem[]>([]);
  const [pdfToolMode, setPdfToolMode] = useState<
    | 'merge-compress'
    | 'split-ranges'
    | 'sign-redact'
    | 'security-shield'
    | 'extract-images'
    | 'compress-images'
    | 'pdf-images'
  >('merge-compress');
  const [splitRangeMode, setSplitRangeMode] = useState<
    'every-page' | 'custom-ranges'
  >('custom-ranges');
  const [splitRangeInput, setSplitRangeInput] = useState<string>('1-2, 3-5');
  const [imageToPdfFiles, setImageToPdfFiles] = useState<File[]>([]);
  const [imageToPdfLayout, setImageToPdfLayout] = useState<
    'a4-portrait' | 'a4-landscape' | 'fit-image'
  >('a4-portrait');
  const [renderedPdfPreviews, setRenderedPdfPreviews] = useState<string[]>([]);
  const [extractedPdfImages, setExtractedPdfImages] = useState<
    ExtractedPdfImageItem[]
  >([]);
  const [imageOptConfig, setImageOptConfig] = useState<ImageOptimizationConfig>(
    {
      targetFormat: 'webp',
      quality: 80,
      maxWidthOrHeight: 0,
      stripExifAndGps: true,
      watermarkText: '',
      upscale2xSharpen: false,
    }
  );
  const [optimizedImageResults, setOptimizedImageResults] = useState<
    OptimizedImageResult[]
  >([]);
  const [pdfSignConfig, setPdfSignConfig] = useState<PdfSignAndRedactConfig>({
    signatureDataUrl: null,
    signerTitle: 'APPROVED // KRONOS STUDIO',
    stampBadgeText: new Date().toISOString().slice(0, 10),
    position: 'bottom-right',
    targetPages: 'last-page',
    scalePct: 28,
    redactionEnabled: false,
    redactionYPct: 45,
    redactionHeightPct: 8,
  });
  const [pdfSecurityConfig, setPdfSecurityConfig] =
    useState<PdfSecurityGridConfig>({
      gridWatermarkText: 'CONFIDENTIAL - DO NOT COPY',
      themeTint: 'original',
      confidentialHeader: true,
      stripAllMetadata: true,
    });

  // ---------------- BATCH RENAMER (#25) & AES-256 VAULT (#28) STATE ----------------
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchRenameCfg, setBatchRenameCfg] = useState<BatchRenameConfig>({
    prefix: 'kronos-',
    suffix: '',
    findText: '',
    replaceText: '',
    baseNameOverride: '',
    startIndex: 1,
    zeroPadDigits: 2,
    includeDateStamp: true,
    lowercaseExtension: true,
  });
  const [vaultPassword, setVaultPassword] = useState<string>('');
  const [hashAuditResults, setHashAuditResults] = useState<FileHashAuditItem[]>(
    []
  );
  const batchFileInputRef = useRef<HTMLInputElement | null>(null);
  const vaultFileInputRef = useRef<HTMLInputElement | null>(null);

  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const imagesToPdfInputRef = useRef<HTMLInputElement | null>(null);
  const optimizeImagesInputRef = useRef<HTMLInputElement | null>(null);
  const replacementAudioInputRef = useRef<HTMLInputElement | null>(null);

  const [pdfConfig, setPdfConfig] = useState<PdfProcessConfig>({
    compressionLevel: 'compact-strip',
    stripMetadata: true,
    addPageNumbers: true,
    watermarkText: '',
  });

  const selectedAudioTrack =
    audioTracks.find((t) => t.id === selectedAudioId) || audioTracks[0] || null;

  const stopAudioPlayback = useCallback(() => {
    cancelAnimationFrame(audioAnimFrameRef.current);
    if (activeSourceNodeRef.current) {
      try {
        activeSourceNodeRef.current.stop();
      } catch {}
      activeSourceNodeRef.current = null;
    }
    if (activeAudioCtxRef.current) {
      activeAudioCtxRef.current.close().catch(() => {});
      activeAudioCtxRef.current = null;
    }
    setAudioPlaying(false);
  }, []);

  // Debounced Off-Thread Web Worker DSP Waveform Preview (prevents slider lag on mobile & desktop!)
  useEffect(() => {
    let cancelled = false;
    if (!selectedAudioTrack) {
      const resetTimer = window.setTimeout(() => {
        setProcessedPreviewPeaks(null);
        setProcessedRmsDb(null);
        setProcessedDuration(null);
      }, 0);
      return () => clearTimeout(resetTimer);
    }

    const debounceMs = isProxyScrubbing
      ? 45
      : perfMode === 'eco-mobile'
      ? 220
      : 110;
    const previewSampleRate = isProxyScrubbing
      ? 22050
      : (selectedAudioTrack.sampleRate as 44100);
    const timer = window.setTimeout(() => {
      processAudioBufferWithDSP(selectedAudioTrack.buffer, nrConfig, {
        sampleRate: previewSampleRate as 44100,
        channels: selectedAudioTrack.numberOfChannels as 1 | 2,
        trimStartSec: audioExportConfig.trimStartSec,
        trimEndSec: audioExportConfig.trimEndSec || selectedAudioTrack.duration,
      })
        .then((buf) => {
          if (cancelled) return;
          const { peaks, rmsDb } = extractWaveformMetrics(
            buf,
            isProxyScrubbing ? 80 : 140
          );
          setProcessedPreviewPeaks(peaks);
          setProcessedRmsDb(rmsDb);
          setProcessedDuration(buf.duration);
        })
        .catch(() => {});
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    selectedAudioTrack,
    nrConfig,
    audioExportConfig.trimStartSec,
    audioExportConfig.trimEndSec,
    perfMode,
    isProxyScrubbing,
  ]);

  // Initial load: do NOT load default videos (workspace starts clean as requested)
  // Audio, PDF, and image tools load light templates on demand
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [sampleAudios, samplePdfs, sampleImgs] = await Promise.all([
          generateSampleAudioFiles(),
          generateSamplePdfFiles(),
          generateSampleImageFiles(),
        ]);
        if (!mounted) return;

        const [decodedList, inspectedPdfs] = await Promise.all([
          Promise.all(sampleAudios.map((af) => decodeMediaFileToAudio(af))),
          Promise.all(samplePdfs.map((pf) => inspectPdfFile(pf))),
        ]);
        if (!mounted) return;

        // Video list starts 100% empty (no default dummy videos)
        setVideoList([]);
        setSelectedVideoId(null);

        setAudioTracks(decodedList);
        if (decodedList[0]) {
          setSelectedAudioId(decodedList[0].id);
          setAudioExportConfig((prev) => ({
            ...prev,
            trimStartSec: 0,
            trimEndSec: Number(decodedList[0].duration.toFixed(2)),
          }));
        }

        const allPages: PdfPageItem[] = [];
        for (const meta of inspectedPdfs) {
          allPages.push(...meta.pages);
        }
        setPdfDocs(inspectedPdfs);
        setPdfPages(allPages);
        setImageToPdfFiles(sampleImgs);
        setBatchFiles([...sampleImgs, ...samplePdfs]);
        // OPTIMIZATION #10: Trigger Speculative Idle Pre-Analysis in background
        scheduleSpeculativeIdlePreAnalysis([
          ...sampleAudios,
          ...samplePdfs,
          ...sampleImgs,
        ]);
      } catch {
        // Ignore silent boot synthesis errors
      }
    })();
    return () => {
      mounted = false;
      stopAudioPlayback();
    };
  }, [stopAudioPlayback]);

  // Generate all sample files (including TWO playable videos for multi-video merging)
  const handleLoadAllSampleMedia = async () => {
    setIsGeneratingSamples(true);
    setStatusBanner(
      'در حال سنتز ۲ کلیپ ویدیویی، ۲ فایل صوتی، ۲ سند PDF و ۲ تصویر در حافظه مرورگر...'
    );
    try {
      const [videoFiles, audioFiles, pdfFiles, imgFiles] = await Promise.all([
        generateSampleVideoFiles(),
        generateSampleAudioFiles(),
        generateSamplePdfFiles(),
        generateSampleImageFiles(),
      ]);

      const [inspectedVideos, decodedList, inspectedPdfs] = await Promise.all([
        Promise.all(videoFiles.map((vf) => inspectVideoFile(vf, 2))),
        Promise.all(audioFiles.map((af) => decodeMediaFileToAudio(af))),
        Promise.all(pdfFiles.map((pf) => inspectPdfFile(pf))),
      ]);

      setVideoList(inspectedVideos);
      if (inspectedVideos[0]) {
        setSelectedVideoId(inspectedVideos[0].id);
        setVideoConfig((prev) => ({
          ...prev,
          trimStartSec: 0,
          trimEndSec: Number(inspectedVideos[0].duration.toFixed(2)),
        }));
      }

      setAudioTracks(decodedList);
      if (decodedList[0]) {
        setSelectedAudioId(decodedList[0].id);
        setAudioExportConfig((prev) => ({
          ...prev,
          trimStartSec: 0,
          trimEndSec: Number(decodedList[0].duration.toFixed(2)),
        }));
      }

      const allPages: PdfPageItem[] = [];
      for (const meta of inspectedPdfs) {
        allPages.push(...meta.pages);
      }
      setPdfDocs(inspectedPdfs);
      setPdfPages(allPages);
      setImageToPdfFiles(imgFiles);
      setBatchFiles([...imgFiles, ...pdfFiles, ...audioFiles]);

      setStatusBanner(
        '۲ ویدیوی نمونه (آماده اتصال به یکدیگر)، ۲ فایل صوتی، ۲ سند PDF و ۲ تصویر در حافظه محلی بارگذاری شدند.'
      );
    } catch (err) {
      setStatusBanner(
        err instanceof Error ? err.message : 'خطا در تولید رسانه نمونه'
      );
    } finally {
      setIsGeneratingSamples(false);
    }
  };

  // Universal Multi-File Drop & Upload Router
  const handleUniversalFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    // OPTIMIZATION #10: Immediately schedule Speculative Idle Pre-Analysis (SHA-256 + Worker/Shader warm-up)
    scheduleSpeculativeIdlePreAnalysis(fileArray);

    // Always add uploaded files to batch list as well so Tab 4 works seamlessly
    setBatchFiles((prev) => [...prev, ...fileArray]);

    const srtFiles = fileArray.filter((f) =>
      f.name.toLowerCase().endsWith('.srt')
    );
    const kronosFiles = fileArray.filter((f) =>
      f.name.toLowerCase().endsWith('.kronos')
    );
    const videoFiles = fileArray.filter((f) => f.type.startsWith('video/'));
    const audioFiles = fileArray.filter((f) => f.type.startsWith('audio/'));
    const pdfFiles = fileArray.filter(
      (f) =>
        f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    const imageFiles = fileArray.filter((f) => f.type.startsWith('image/'));

    const summaryParts: string[] = [];
    const thumbCount = perfMode === 'eco-mobile' ? 4 : 6;

    if (srtFiles.length > 0) {
      try {
        const text = await srtFiles[0].text();
        const cues = parseSrtSubtitles(text);
        if (cues.length > 0) {
          setVideoConfig((prev) => ({
            ...prev,
            operation: 'edit-grade',
            subtitleBurn: {
              ...prev.subtitleBurn,
              enabled: true,
              cues,
            },
          }));
          setActiveTab('video');
          summaryParts.push(`زیرنویس SRT (${cues.length} خط)`);
        }
      } catch {}
    }

    if (kronosFiles.length > 0) {
      setActiveTab('batch-vault');
      summaryParts.push(`${kronosFiles.length} فایل رمزنگاری‌شده (.kronos)`);
    }

    if (videoFiles.length > 0) {
      setActiveTab('video');
      setStatusBanner(
        `در حال آنالیز موازی ${videoFiles.length} فایل ویدیویی...`
      );
      try {
        const newlyInspected = await Promise.all(
          videoFiles.map((vf) => inspectVideoFile(vf, thumbCount))
        );
        setVideoList((prev) => {
          const updated = [...prev, ...newlyInspected];
          if (updated.length > 1) {
            setVideoConfig((cfg) => ({ ...cfg, operation: 'merge-videos' }));
          }
          return updated;
        });
        if (newlyInspected[0]) {
          setSelectedVideoId(newlyInspected[0].id);
          setVideoConfig((prev) => ({
            ...prev,
            trimStartSec: 0,
            trimEndSec: Number(newlyInspected[0].duration.toFixed(2)),
          }));
        }
        summaryParts.push(`${newlyInspected.length} ویدیو`);
      } catch (e) {
        setStatusBanner(
          e instanceof Error ? e.message : 'خطا در خواندن ویدیوها'
        );
      }
    }

    if (audioFiles.length > 0) {
      if (videoFiles.length === 0) setActiveTab('audio');
      setStatusBanner(
        `در حال رمزگشایی موازی ${audioFiles.length} فایل صوتی...`
      );
      try {
        const newlyDecoded = await Promise.all(
          audioFiles.map((af) => decodeMediaFileToAudio(af))
        );
        setAudioTracks((prev) => [...prev, ...newlyDecoded]);
        if (newlyDecoded[0]) {
          setSelectedAudioId(newlyDecoded[0].id);
          setAudioExportConfig((prev) => ({
            ...prev,
            trimStartSec: 0,
            trimEndSec: Number(newlyDecoded[0].duration.toFixed(2)),
          }));
        }
        if (audioFiles.length > 1) {
          setAudioMode('merge-voices');
        }
        summaryParts.push(`${newlyDecoded.length} فایل صوتی`);
      } catch (e) {
        setStatusBanner(
          e instanceof Error ? e.message : 'خطا در رمزگشایی فایل صوتی'
        );
      }
    }

    if (pdfFiles.length > 0) {
      if (videoFiles.length === 0 && audioFiles.length === 0) {
        setActiveTab('pdf');
      }
      setStatusBanner(
        `در حال بررسی موازی ساختار ${pdfFiles.length} سند PDF...`
      );
      try {
        const newDocs = await Promise.all(
          pdfFiles.map((pf) => inspectPdfFile(pf))
        );
        const newPages = newDocs.flatMap((d) => d.pages);
        setPdfDocs((prev) => [...prev, ...newDocs]);
        setPdfPages((prev) => [...prev, ...newPages]);
        summaryParts.push(`${newDocs.length} سند PDF (${newPages.length} صفحه)`);
      } catch (e) {
        setStatusBanner(
          e instanceof Error ? e.message : 'خطا در خواندن فایل PDF'
        );
      }
    }

    if (imageFiles.length > 0) {
      if (
        videoFiles.length === 0 &&
        audioFiles.length === 0 &&
        pdfFiles.length === 0
      ) {
        setActiveTab('pdf');
        setPdfToolMode('compress-images');
      }
      setImageToPdfFiles((prev) => [...prev, ...imageFiles]);
      summaryParts.push(`${imageFiles.length} تصویر`);
    }

    if (summaryParts.length > 0) {
      setStatusBanner(
        `بارگذاری موازی با موفقیت انجام شد: ${summaryParts.join('، ')} به میز کار اضافه شدند.`
      );
    }
  };

  // ---------------- LIVE STUDIO VOICE RECORDER ----------------
  const startLiveRecording = async () => {
    stopAudioPlayback();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      const audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateSpectrum = () => {
        analyser.getByteFrequencyData(dataArray);
        const bars = Array.from(dataArray.slice(0, 28)).map((v) =>
          Math.max(6, Math.round((v / 255) * 100))
        );
        setLiveSpectrumBars(bars);
        micSpecFrameRef.current = requestAnimationFrame(updateSpectrum);
      };
      micSpecFrameRef.current = requestAnimationFrame(updateSpectrum);

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : '';
      const recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined
      );
      mediaRecorderRef.current = recorder;

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        cancelAnimationFrame(micSpecFrameRef.current);
        audioCtx.close().catch(() => {});
        stream.getTracks().forEach((t) => t.stop());
        if (micTimerRef.current) clearInterval(micTimerRef.current);

        const blob = new Blob(chunks, { type: mime || 'audio/webm' });
        const recordedFile = new File(
          [blob],
          `studio-mic-recording-${Date.now().toString().slice(-4)}.webm`,
          { type: blob.type }
        );
        const decoded = await decodeMediaFileToAudio(recordedFile);
        setAudioTracks((prev) => [decoded, ...prev]);
        setSelectedAudioId(decoded.id);
        setAudioExportConfig((prev) => ({
          ...prev,
          trimStartSec: 0,
          trimEndSec: Number(decoded.duration.toFixed(2)),
        }));
        setAudioMode('denoise-convert');
        setStatusBanner(
          `ضبط استودیویی (${decoded.duration.toFixed(1)}s) به لیست تراک‌های صوتی اضافه شد.`
        );
      };

      recorder.start(100);
      setIsRecordingMic(true);
      setRecordingSeconds(0);
      micTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 0.1);
      }, 100);
    } catch {
      setStatusBanner(
        'دسترسی به میکروفون فیزیکی مسدود است؛ در حال شبیه‌سازی برداشت صوتی استودیویی...'
      );
      const [synthVoice] = await generateSampleAudioFiles();
      const renamed = new File(
        [synthVoice],
        `studio-simulated-mic-${Date.now().toString().slice(-4)}.wav`,
        { type: 'audio/wav' }
      );
      const decoded = await decodeMediaFileToAudio(renamed);
      setAudioTracks((prev) => [decoded, ...prev]);
      setSelectedAudioId(decoded.id);
      setAudioMode('denoise-convert');
      setStatusBanner('برداشت صوتی استودیویی شبیه‌سازی و به لیست اضافه شد.');
    }
  };

  const stopLiveRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingMic(false);
  };

  const handleCustomBgMusicUpload = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    const file = files[0];
    try {
      const decoded = await decodeMediaFileToAudio(file);
      setCustomBgMusicName(file.name);
      setNrConfig((prev) => ({
        ...prev,
        autoDucking: {
          ...prev.autoDucking,
          enabled: true,
          customMusicBuffer: decoded.buffer,
        },
      }));
      setStatusBanner(
        `موسیقی پس‌زمینه «${file.name}» برای میکس هوشمند Auto-Ducking بارگذاری شد.`
      );
    } catch {
      setStatusBanner('خطا در بارگذاری فایل موسیقی پس‌زمینه');
    }
  };

  // Helper to upload or synthesize a studio logo overlay (#3)
  const handleLogoOverlayUpload = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    const file = files[0];
    const url = memoryArena.registerUrl(URL.createObjectURL(file));
    await preloadLogoOverlayImage(url);
    setVideoConfig((prev) => ({
      ...prev,
      logoOverlay: {
        ...prev.logoOverlay,
        enabled: true,
        imageUrl: url,
        imageName: file.name,
      },
    }));
    setStatusBanner(`لوگوی تصویر در تصویر «${file.name}» روی ویدیو فعال شد.`);
  };

  const handleGenerateSampleLogoOverlay = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'rgba(11, 12, 14, 0.88)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 312, 92, 16);
    ctx.fill();
    ctx.strokeStyle = '#F97316';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#F97316';
    ctx.beginPath();
    ctx.arc(46, 50, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F4F4F6';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('KRONOS PRO', 80, 46);
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '600 13px monospace';
    ctx.fillText('4K STUDIO BROADCAST', 80, 70);
    const dataUrl = canvas.toDataURL('image/png');
    await preloadLogoOverlayImage(dataUrl);
    setVideoConfig((prev) => ({
      ...prev,
      logoOverlay: {
        ...prev.logoOverlay,
        enabled: true,
        imageUrl: dataUrl,
        imageName: 'kronos-broadcast-badge.png',
      },
    }));
    setStatusBanner('نشان استودیویی نمونه برای درج روی ویدیو (PiP) ساخته و فعال شد.');
  };

  // ---------------- VIDEO EXECUTION HANDLER (#1..#6) ----------------
  const handleRunVideoProcess = async () => {
    const currentVideos = videoList;
    if (currentVideos.length === 0) {
      setStatusBanner(
        'هیچ ویدیویی در لیست وجود ندارد. لطفاً ابتدا ویدیوهای خود را بکشید و رها کنید یا دکمه «بارگذاری رسانه نمونه» را برای تست بزنید.'
      );
      return;
    }

    setIsProcessing(true);
    setProcessProgress(10);

    try {
      if (videoConfig.operation === 'merge-videos') {
        setStatusBanner(
          `در حال اتصال پیوسته ${currentVideos.length} ویدیو با شتاب‌دهی GPU...`
        );
        const result = await mergeVideosLocally(
          currentVideos,
          videoConfig,
          (pct) => setProcessProgress(pct)
        );
        const totalInSize = currentVideos.reduce(
          (acc, v) => acc + v.sizeBytes,
          0
        );
        const totalDuration = currentVideos.reduce(
          (acc, v) => acc + v.duration,
          0
        );
        const outUrl = memoryArena.registerUrl(
          URL.createObjectURL(result.blob)
        );

        setExportedItems((prev) => [
          {
            id: `exp-vid-merge-${Date.now()}`,
            title: result.filename,
            category: 'video',
            originalSizeBytes: totalInSize,
            outputSizeBytes: result.blob.size,
            url: outUrl,
            filename: result.filename,
            mimeType: result.mimeType,
            createdAt: new Date().toLocaleTimeString('fa-IR'),
            details: `اتصال ${currentVideos.length} ویدیو (${totalDuration.toFixed(
              1
            )}s مجموع) · ترنزیشن ${
              videoConfig.mergeTransition === 'fade-black'
                ? 'دیزالو سیاه'
                : 'برش مستقیم'
            }`,
          },
          ...prev,
        ]);
        setProcessProgress(100);
        setStatusBanner(
          `اتصال ${currentVideos.length} ویدیو با موفقیت انجام شد: «${result.filename}» آماده دانلود است.`
        );
        setTimeout(() => {
          setIsProcessing(false);
          setProcessProgress(0);
        }, 650);
        return;
      }

      const targets =
        videoBatchAll && currentVideos.length > 1
          ? currentVideos
          : [
              currentVideos.find((v) => v.id === selectedVideoId) ||
                currentVideos[0],
            ];

      const newItems: ExportedOutputItem[] = [];
      for (let i = 0; i < targets.length; i++) {
        const targetMeta = targets[i];
        setStatusBanner(
          `در حال پردازش ویدیو (${i + 1} از ${targets.length}): ${
            targetMeta.name
          }...`
        );

        const cfgForTarget: VideoProcessConfig =
          targets.length > 1
            ? {
                ...videoConfig,
                trimStartSec: 0,
                trimEndSec: targetMeta.duration,
              }
            : videoConfig;

        const result = await processVideoLocally(
          targetMeta,
          cfgForTarget,
          (pct) => {
            const overall = Math.round(
              ((i + pct / 100) / targets.length) * 100
            );
            setProcessProgress(overall);
          }
        );

        const outUrl = memoryArena.registerUrl(
          URL.createObjectURL(result.blob)
        );
        const extraTags = [
          videoConfig.playbackRate !== 1.0
            ? `سرعت ${videoConfig.playbackRate}x`
            : '',
          videoConfig.aspectRatioPreset !== 'original'
            ? `ابعاد ${videoConfig.aspectRatioPreset}`
            : '',
          videoConfig.subtitleBurn.enabled
            ? `زیرنویس Hardsub (${videoConfig.subtitleBurn.cues.length} خط)`
            : '',
          videoConfig.logoOverlay.enabled ? 'لوگو PiP' : '',
          videoConfig.chromaKey.enabled
            ? `حذف پرده ${videoConfig.chromaKey.keyColor === 'green' ? 'سبز' : 'آبی'}`
            : '',
          videoConfig.cinemaLut !== 'none'
            ? `LUT ${videoConfig.cinemaLut}`
            : '',
          videoConfig.privacyZone.enabled ? 'سانسور ناحیه‌ای' : '',
          videoConfig.motionStabilization.enabled ? 'پایدارسازی لرزش' : '',
        ]
          .filter(Boolean)
          .join(' · ');

        const opLabels: Record<VideoProcessConfig['operation'], string> = {
          'merge-videos': 'اتصال چند ویدیو',
          'extract-audio': 'جداسازی صدا از ویدیو + فیلتر شفاف‌سازی',
          'compress-convert': `فشرده‌سازی و تغییر فرمت (${videoConfig.targetBitrateKbps} kbps)`,
          'edit-grade': `تدوین، زیرنویس و اصلاح رنگ${extraTags ? ` · ${extraTags}` : ''}`,
          'strip-audio': 'حذف کامل لایه صوتی ویدیو (Mute Stream)',
          'replace-audio': `تعویض کامل صدای ویدیو (${
            videoConfig.replacementAudioName || 'موزیک جدید'
          })`,
          'video-to-gif': `تبدیل ویدیو به GIF متحرک (${videoConfig.gifFps}fps · ${videoConfig.gifWidth}px)`,
          'extract-frames-zip': `استخراج ${videoConfig.frameExtractCount} فریم + شیت استوری‌بورد (ZIP)`,
          'boomerang-reverse':
            videoConfig.boomerangMode === 'boomerang-loop'
              ? 'ویدیوی بومرنگ رفت‌وبرگشت (Boomerang Loop)'
              : 'پخش معکوس کامل ویدیو (Time Reverse)',
        };

        const itemCategory: ExportedOutputItem['category'] =
          result.mimeType.startsWith('audio/')
            ? 'audio'
            : result.mimeType === 'application/zip' ||
              result.mimeType === 'image/gif'
            ? 'archive'
            : 'video';

        newItems.push({
          id: `exp-vid-${Date.now()}-${i}`,
          title: result.filename,
          category: itemCategory,
          originalSizeBytes: targetMeta.sizeBytes,
          outputSizeBytes: result.blob.size,
          url: outUrl,
          filename: result.filename,
          mimeType: result.mimeType,
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: opLabels[videoConfig.operation],
        });
      }

      setExportedItems((prev) => [...newItems, ...prev]);
      setProcessProgress(100);
      setStatusBanner(
        `عملیات روی ${newItems.length} فایل ویدیویی با موفقیت انجام شد و آماده دانلود است.`
      );
      setTimeout(() => {
        setIsProcessing(false);
        setProcessProgress(0);
      }, 650);
    } catch (e) {
      setIsProcessing(false);
      setProcessProgress(0);
      setStatusBanner(e instanceof Error ? e.message : 'خطا در پردازش ویدیو');
    }
  };

  // ---------------- AUDIO PLAYBACK & EXECUTION HANDLERS (#7..#11) ----------------
  const handleToggleAudioPreview = async (mode: 'original' | 'processed') => {
    if (audioPlaying && audioPreviewMode === mode) {
      stopAudioPlayback();
      return;
    }
    stopAudioPlayback();
    if (!selectedAudioTrack) return;

    setAudioPreviewMode(mode);
    try {
      let bufferToPlay = selectedAudioTrack.buffer;
      if (mode === 'processed') {
        bufferToPlay = await processAudioBufferWithDSP(
          selectedAudioTrack.buffer,
          nrConfig,
          {
            sampleRate: selectedAudioTrack.sampleRate as 44100,
            channels: selectedAudioTrack.numberOfChannels as 1 | 2,
            trimStartSec: audioExportConfig.trimStartSec,
            trimEndSec:
              audioExportConfig.trimEndSec || selectedAudioTrack.duration,
          }
        );
      }

      const ctx = new AudioContext();
      activeAudioCtxRef.current = ctx;
      const src = ctx.createBufferSource();
      src.buffer = bufferToPlay;
      src.connect(ctx.destination);
      activeSourceNodeRef.current = src;

      const startedAt = ctx.currentTime;
      const offset = mode === 'original' ? audioExportConfig.trimStartSec : 0;
      const playDuration =
        mode === 'original'
          ? (audioExportConfig.trimEndSec || selectedAudioTrack.duration) -
            audioExportConfig.trimStartSec
          : bufferToPlay.duration;

      src.start(0, offset, playDuration);
      setAudioPlaying(true);

      const updatePlayhead = () => {
        if (!activeAudioCtxRef.current) return;
        const elapsed = activeAudioCtxRef.current.currentTime - startedAt;
        const currentPos = audioExportConfig.trimStartSec + elapsed;
        setAudioCurrentTime(currentPos);
        if (elapsed < playDuration) {
          audioAnimFrameRef.current = requestAnimationFrame(updatePlayhead);
        } else {
          setAudioPlaying(false);
          setAudioCurrentTime(audioExportConfig.trimStartSec);
        }
      };
      audioAnimFrameRef.current = requestAnimationFrame(updatePlayhead);

      src.onended = () => {
        stopAudioPlayback();
      };
    } catch {
      stopAudioPlayback();
    }
  };

  const handleRunAudioProcess = async () => {
    if (audioTracks.length === 0) return;
    stopAudioPlayback();
    setIsProcessing(true);
    setProcessProgress(15);

    try {
      // Feature #11: Audiogram / Spectrum Video Generator
      if (audioMode === 'audiogram-video') {
        const targetTrack = selectedAudioTrack || audioTracks[0];
        setStatusBanner(
          `در حال رندر ویدیوی موج صوتی (Audiogram ${audiogramConfig.aspectRatio}) از روی «${targetTrack.name}»...`
        );
        const processedBuf = await processAudioBufferWithDSP(
          targetTrack.buffer,
          nrConfig,
          {
            sampleRate: audioExportConfig.sampleRate,
            channels: 2,
            trimStartSec: audioExportConfig.trimStartSec,
            trimEndSec: audioExportConfig.trimEndSec || targetTrack.duration,
          }
        );
        const videoRes = await generateAudiogramVideo(
          processedBuf,
          targetTrack.name,
          audiogramConfig,
          (pct) => setProcessProgress(pct)
        );
        const outUrl = memoryArena.registerUrl(
          URL.createObjectURL(videoRes.blob)
        );
        setExportedItems((prev) => [
          {
            id: `exp-audiogram-${Date.now()}`,
            title: videoRes.filename,
            category: 'video',
            originalSizeBytes: targetTrack.sizeBytes,
            outputSizeBytes: videoRes.blob.size,
            url: outUrl,
            filename: videoRes.filename,
            mimeType: videoRes.mimeType,
            createdAt: new Date().toLocaleTimeString('fa-IR'),
            details: `ویدیوی موج صوتی Audiogram (${audiogramConfig.aspectRatio})`,
          },
          ...prev,
        ]);
        setProcessProgress(100);
        setStatusBanner(
          `ویدیوی موج صوتی «${videoRes.filename}» با موفقیت ساخته شد و آماده پخش و دانلود است.`
        );
        setTimeout(() => {
          setIsProcessing(false);
          setProcessProgress(0);
        }, 650);
        return;
      }

      if (audioMode === 'merge-voices') {
        setStatusBanner(
          `در حال ادغام ${audioTracks.length} فایل صوتی با دیزالو ${crossfadeSec} ثانیه در Web Worker...`
        );
        const mergedBuffer = await mergeAudioTracks(
          audioTracks,
          crossfadeSec,
          audioExportConfig.sampleRate,
          audioExportConfig.channels
        );
        setProcessProgress(55);

        const finalBuffer = await processAudioBufferWithDSP(
          mergedBuffer,
          nrConfig,
          {
            sampleRate: audioExportConfig.sampleRate,
            channels: audioExportConfig.channels,
            trimStartSec: 0,
            trimEndSec: mergedBuffer.duration,
          }
        );

        setProcessProgress(85);
        const encoded = await encodeAudioBufferToFormat(
          finalBuffer,
          audioExportConfig.format,
          audioExportConfig.targetBitrateKbps
        );

        const totalOriginalBytes = audioTracks.reduce(
          (acc, t) => acc + t.sizeBytes,
          0
        );
        const filename = `kronos-merged-${audioTracks.length}-voices.${encoded.extension}`;
        const outUrl = memoryArena.registerUrl(
          URL.createObjectURL(encoded.blob)
        );

        setExportedItems((prev) => [
          {
            id: `exp-aud-merge-${Date.now()}`,
            title: filename,
            category: 'audio',
            originalSizeBytes: totalOriginalBytes,
            outputSizeBytes: encoded.blob.size,
            url: outUrl,
            filename,
            mimeType: encoded.mimeType,
            createdAt: new Date().toLocaleTimeString('fa-IR'),
            details: `ادغام ${audioTracks.length} تراک صوتی · ${audioExportConfig.sampleRate}Hz`,
          },
          ...prev,
        ]);
        setProcessProgress(100);
        setStatusBanner(`ادغام صداها با موفقیت کامل شد: «${filename}»`);
        setTimeout(() => {
          setIsProcessing(false);
          setProcessProgress(0);
        }, 650);
      } else {
        const targets =
          audioBatchAll && audioTracks.length > 1
            ? audioTracks
            : [selectedAudioTrack || audioTracks[0]];

        setStatusBanner(
          `در حال پردازش موازی ${targets.length} فایل صوتی با Web Worker...`
        );

        const newOutputs = await Promise.all(
          targets.map(async (track, i) => {
            const processedBuffer = await processAudioBufferWithDSP(
              track.buffer,
              nrConfig,
              {
                ...audioExportConfig,
                trimStartSec:
                  targets.length > 1 ? 0 : audioExportConfig.trimStartSec,
                trimEndSec:
                  targets.length > 1
                    ? track.duration
                    : audioExportConfig.trimEndSec || track.duration,
              }
            );

            const encoded = await encodeAudioBufferToFormat(
              processedBuffer,
              audioExportConfig.format,
              audioExportConfig.targetBitrateKbps
            );

            const baseName = track.name.replace(/\.[^/.]+$/, '');
            const filename = `${baseName}-mastered.${encoded.extension}`;
            const outUrl = memoryArena.registerUrl(
              URL.createObjectURL(encoded.blob)
            );

            const activeBadges = [
              nrConfig.enabled ? 'حذف نویز' : '',
              nrConfig.vocalSeparatorMode === 'karaoke-no-vocal'
                ? 'حذف صدای خواننده (Karaoke)'
                : nrConfig.vocalSeparatorMode === 'vocal-isolate'
                ? 'جداسازی وکال مرکز'
                : '',
              nrConfig.spatial8D.enabled
                ? `صدای 8D (${nrConfig.spatial8D.rotationHz}Hz)`
                : '',
              nrConfig.voiceMorphPreset !== 'normal'
                ? `تغییر کاراکتر (${nrConfig.voiceMorphPreset})`
                : '',
              nrConfig.lufsNormalization.enabled
                ? `مسترینگ ${nrConfig.lufsNormalization.targetLufs} LUFS`
                : '',
              nrConfig.lufsNormalization.deEsserEnabled ? 'De-Esser' : '',
              nrConfig.silenceTrimmer.enabled ? 'حذف سکوت' : '',
              nrConfig.pitchSemitones !== 0
                ? `Pitch ${nrConfig.pitchSemitones}st`
                : '',
              nrConfig.reverbPreset !== 'off'
                ? `Reverb ${nrConfig.reverbPreset}`
                : '',
              nrConfig.autoDucking.enabled ? 'Auto-Ducking Music' : '',
            ]
              .filter(Boolean)
              .join(' · ');

            return {
              id: `exp-aud-dsp-${Date.now()}-${i}`,
              title: filename,
              category: 'audio' as const,
              originalSizeBytes: track.sizeBytes,
              outputSizeBytes: encoded.blob.size,
              url: outUrl,
              filename,
              mimeType: encoded.mimeType,
              createdAt: new Date().toLocaleTimeString('fa-IR'),
              details: `${activeBadges || 'مسترینگ'} · ${
                audioExportConfig.sampleRate
              }Hz`,
            };
          })
        );

        setProcessProgress(100);
        setExportedItems((prev) => [...newOutputs, ...prev]);
        setStatusBanner(
          `پردازش صوتی روی ${newOutputs.length} فایل با موفقیت کامل شد.`
        );
        setTimeout(() => {
          setIsProcessing(false);
          setProcessProgress(0);
        }, 650);
      }
    } catch (e) {
      setIsProcessing(false);
      setProcessProgress(0);
      setStatusBanner(
        e instanceof Error ? e.message : 'خطا در موتور پردازش صوتی'
      );
    }
  };

  // ---------------- PDF & IMAGE EXECUTION HANDLERS (#20 & #21) ----------------
  const handleRunPdfMergeCompress = async () => {
    if (pdfDocs.length === 0) return;
    setIsProcessing(true);
    setProcessProgress(12);
    setStatusBanner(
      'در حال ادغام، بازچینی صفحات و فشرده‌سازی ساختار PDF در حافظه محلی...'
    );

    try {
      const result = await mergeAndCompressPdfs(
        pdfDocs,
        pdfPages,
        pdfConfig,
        (pct) => setProcessProgress(pct)
      );

      const totalOriginalBytes = pdfDocs.reduce(
        (acc, d) => acc + d.sizeBytes,
        0
      );
      const outUrl = memoryArena.registerUrl(URL.createObjectURL(result.blob));

      setExportedItems((prev) => [
        {
          id: `exp-pdf-${Date.now()}`,
          title: result.filename,
          category: 'pdf',
          originalSizeBytes: totalOriginalBytes,
          outputSizeBytes: result.blob.size,
          url: outUrl,
          filename: result.filename,
          mimeType: 'application/pdf',
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: `${result.pageCount} صفحه نهایی · پروفایل ${pdfConfig.compressionLevel}`,
        },
        ...prev,
      ]);
      setStatusBanner(
        `سند PDF نهایی (${result.pageCount} صفحه) با موفقیت فشرده‌سازی و تولید شد.`
      );
    } catch (e) {
      setStatusBanner(e instanceof Error ? e.message : 'خطا در پردازش PDF');
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  const handleRunPdfSplitter = async () => {
    if (pdfDocs.length === 0) return;
    setIsProcessing(true);
    setProcessProgress(15);
    setStatusBanner(
      'در حال تفکیک بازه‌ای صفحات به فایل‌های PDF مجزا و بسته‌بندی ZIP...'
    );

    try {
      const res = await splitPdfByRangesToZip(
        pdfDocs,
        pdfPages,
        splitRangeMode,
        splitRangeInput,
        (pct) => setProcessProgress(pct)
      );

      const totalOriginalBytes = pdfDocs.reduce(
        (acc, d) => acc + d.sizeBytes,
        0
      );
      const zipUrl = memoryArena.registerUrl(URL.createObjectURL(res.zipBlob));

      const newExports: ExportedOutputItem[] = [
        {
          id: `exp-pdf-zip-${Date.now()}`,
          title: res.zipFilename,
          category: 'archive',
          originalSizeBytes: totalOriginalBytes,
          outputSizeBytes: res.zipBlob.size,
          url: zipUrl,
          filename: res.zipFilename,
          mimeType: 'application/zip',
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: `بسته ZIP شامل ${res.splitCount} فایل PDF تفکیک‌شده`,
        },
        ...res.individualFiles.slice(0, 3).map((f, i) => ({
          id: `exp-pdf-part-${Date.now()}-${i}`,
          title: f.filename,
          category: 'pdf' as const,
          originalSizeBytes: Math.round(totalOriginalBytes / res.splitCount),
          outputSizeBytes: f.blob.size,
          url: memoryArena.registerUrl(URL.createObjectURL(f.blob)),
          filename: f.filename,
          mimeType: 'application/pdf',
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: `بخش تفکیک‌شده (${f.pageCount} صفحه)`,
        })),
      ];

      setExportedItems((prev) => [...newExports, ...prev]);
      setStatusBanner(
        `تفکیک با موفقیت انجام شد: ${res.splitCount} فایل PDF مجزا در قالب بسته ZIP آماده دانلود است.`
      );
    } catch (e) {
      setStatusBanner(e instanceof Error ? e.message : 'خطا در تفکیک PDF');
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  // Feature #20: Interactive PDF Sign, Official Stamp & Redaction
  const handleRunPdfSignAndRedact = async () => {
    if (pdfDocs.length === 0) return;
    setIsProcessing(true);
    setProcessProgress(15);
    setStatusBanner(
      'در حال درج امضای دیجیتال زنده، مهر تاریخ رسمی و سانسور امنیتی روی سند PDF...'
    );
    try {
      const res = await signAndRedactPdf(
        pdfDocs,
        pdfPages,
        pdfSignConfig,
        (pct) => setProcessProgress(pct)
      );
      const totalOriginalBytes = pdfDocs.reduce(
        (acc, d) => acc + d.sizeBytes,
        0
      );
      const outUrl = memoryArena.registerUrl(URL.createObjectURL(res.blob));
      setExportedItems((prev) => [
        {
          id: `exp-pdf-sign-${Date.now()}`,
          title: res.filename,
          category: 'pdf',
          originalSizeBytes: totalOriginalBytes,
          outputSizeBytes: res.blob.size,
          url: outUrl,
          filename: res.filename,
          mimeType: 'application/pdf',
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: `امضای دیجیتال + مهر تاریخ (${res.pageCount} صفحه)${
            pdfSignConfig.redactionEnabled ? ' · سانسور دائمی' : ''
          }`,
        },
        ...prev,
      ]);
      setStatusBanner(
        `سند PDF امضاشده «${res.filename}» با موفقیت تولید شد و آماده دانلود است.`
      );
    } catch (e) {
      setStatusBanner(
        e instanceof Error ? e.message : 'خطا در امضای دیجیتال PDF'
      );
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  // Feature #21: PDF Anti-Copy Security Watermark Grid & Reader Theme
  const handleRunPdfSecurityShield = async () => {
    if (pdfDocs.length === 0) return;
    setIsProcessing(true);
    setProcessProgress(15);
    setStatusBanner(
      'در حال اعمال شبکه واترمارک ضدکپی مورب و تم مطالعه روی صفحات PDF...'
    );
    try {
      const res = await applyPdfSecurityGridAndTheme(
        pdfDocs,
        pdfPages,
        pdfSecurityConfig,
        (pct) => setProcessProgress(pct)
      );
      const totalOriginalBytes = pdfDocs.reduce(
        (acc, d) => acc + d.sizeBytes,
        0
      );
      const outUrl = memoryArena.registerUrl(URL.createObjectURL(res.blob));
      setExportedItems((prev) => [
        {
          id: `exp-pdf-sec-${Date.now()}`,
          title: res.filename,
          category: 'pdf',
          originalSizeBytes: totalOriginalBytes,
          outputSizeBytes: res.blob.size,
          url: outUrl,
          filename: res.filename,
          mimeType: 'application/pdf',
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: `واترمارک امنیتی شبکه‌ای · تم ${pdfSecurityConfig.themeTint}`,
        },
        ...prev,
      ]);
      setStatusBanner(
        `سند PDF محافظت‌شده «${res.filename}» با موفقیت ساخته شد.`
      );
    } catch (e) {
      setStatusBanner(
        e instanceof Error ? e.message : 'خطا در محافظ امنیتی PDF'
      );
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  const handleRunImagesToPdf = async () => {
    if (imageToPdfFiles.length === 0) return;
    setIsProcessing(true);
    setProcessProgress(15);
    setStatusBanner(
      `در حال تبدیل ${imageToPdfFiles.length} تصویر به سند PDF استاندارد...`
    );

    try {
      const res = await convertImagesToPdf(
        imageToPdfFiles,
        imageToPdfLayout,
        24,
        (pct) => setProcessProgress(pct)
      );
      const totalImgBytes = imageToPdfFiles.reduce((acc, f) => acc + f.size, 0);
      const outUrl = memoryArena.registerUrl(URL.createObjectURL(res.blob));

      setExportedItems((prev) => [
        {
          id: `exp-img2pdf-${Date.now()}`,
          title: res.filename,
          category: 'pdf',
          originalSizeBytes: totalImgBytes,
          outputSizeBytes: res.blob.size,
          url: outUrl,
          filename: res.filename,
          mimeType: 'application/pdf',
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: `تبدیل ${res.pageCount} تصویر به PDF (${imageToPdfLayout})`,
        },
        ...prev,
      ]);
      setStatusBanner(
        `سند PDF از روی تصاویر با موفقیت ساخته شد: «${res.filename}»`
      );
    } catch (e) {
      setStatusBanner(
        e instanceof Error ? e.message : 'خطا در تبدیل تصاویر به PDF'
      );
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  const handleRunPdfToImages = async () => {
    if (pdfDocs.length === 0) return;
    setIsProcessing(true);
    setProcessProgress(15);
    setStatusBanner(
      'در حال رندر صفحات PDF به تصاویر PNG با وضوح بالا و بسته‌بندی در فایل ZIP...'
    );

    try {
      const dpiScale = perfMode === 'eco-mobile' ? 1.5 : 2.0;
      const res = await exportPdfPagesToImagesZip(
        pdfDocs,
        pdfPages,
        dpiScale,
        (pct) => setProcessProgress(pct)
      );
      setRenderedPdfPreviews(res.previewDataUrls);

      const totalOriginalBytes = pdfDocs.reduce(
        (acc, d) => acc + d.sizeBytes,
        0
      );
      const zipUrl = memoryArena.registerUrl(URL.createObjectURL(res.zipBlob));

      setExportedItems((prev) => [
        {
          id: `exp-pdf2img-${Date.now()}`,
          title: res.zipFilename,
          category: 'archive',
          originalSizeBytes: totalOriginalBytes,
          outputSizeBytes: res.zipBlob.size,
          url: zipUrl,
          filename: res.zipFilename,
          mimeType: 'application/zip',
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: `تبدیل ${res.imageCount} صفحه PDF به تصاویر PNG (${dpiScale}x HiDPI)`,
        },
        ...prev,
      ]);
      setStatusBanner(
        `${res.imageCount} صفحه PDF با موفقیت به تصاویر PNG باکیفیت تبدیل و در فایل ZIP ذخیره شدند.`
      );
    } catch (e) {
      setStatusBanner(
        e instanceof Error ? e.message : 'خطا در تبدیل صفحات PDF به عکس'
      );
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  const handleRunExtractEmbeddedImages = async () => {
    if (pdfDocs.length === 0) return;
    setIsProcessing(true);
    setProcessProgress(15);
    setStatusBanner(
      'در حال اسکن و استخراج تمامی المان‌ها و تصاویر درون سند PDF...'
    );

    try {
      const targetDoc = pdfDocs[0];
      const res = await extractEmbeddedImagesFromPdf(targetDoc, (pct) =>
        setProcessProgress(pct)
      );
      setExtractedPdfImages(res.images);

      const zipUrl = memoryArena.registerUrl(URL.createObjectURL(res.zipBlob));
      setExportedItems((prev) => [
        {
          id: `exp-ext-img-${Date.now()}`,
          title: res.zipFilename,
          category: 'archive',
          originalSizeBytes: targetDoc.sizeBytes,
          outputSizeBytes: res.zipBlob.size,
          url: zipUrl,
          filename: res.zipFilename,
          mimeType: 'application/zip',
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: `استخراج ${res.count} تصویر از ${targetDoc.name}`,
        },
        ...res.images.slice(0, 3).map((img, i) => ({
          id: `exp-single-ext-${Date.now()}-${i}`,
          title: img.filename,
          category: 'archive' as const,
          originalSizeBytes: Math.round(targetDoc.sizeBytes / res.count),
          outputSizeBytes: img.sizeBytes,
          url: memoryArena.registerUrl(URL.createObjectURL(img.blob)),
          filename: img.filename,
          mimeType: 'image/png',
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: `تصویر استخراج‌شده (${img.width}x${img.height}px)`,
        })),
        ...prev,
      ]);

      setStatusBanner(
        `تعداد ${res.count} تصویر با موفقیت از سند «${targetDoc.name}» استخراج شد و در فایل ZIP قرار گرفت.`
      );
    } catch (e) {
      setStatusBanner(
        e instanceof Error ? e.message : 'خطا در استخراج تصاویر از PDF'
      );
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  const handleRunCompressImages = async () => {
    const imagesToProcess =
      imageToPdfFiles.length > 0 ? imageToPdfFiles : [];
    if (imagesToProcess.length === 0) return;

    setIsProcessing(true);
    setProcessProgress(15);
    setStatusBanner(
      `در حال بهینه‌سازی، پاکسازی متادیتای EXIF/GPS و فشرده‌سازی ${imagesToProcess.length} تصویر...`
    );

    try {
      const res = await compressAndOptimizeImages(
        imagesToProcess,
        imageOptConfig,
        (pct) => setProcessProgress(pct)
      );
      setOptimizedImageResults(res.results);

      const zipUrl = memoryArena.registerUrl(URL.createObjectURL(res.zipBlob));
      setExportedItems((prev) => [
        {
          id: `exp-opt-img-${Date.now()}`,
          title: res.zipFilename,
          category: 'archive',
          originalSizeBytes: res.totalOriginalBytes,
          outputSizeBytes: res.totalOutputBytes,
          url: zipUrl,
          filename: res.zipFilename,
          mimeType: 'application/zip',
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: `فشرده‌سازی ${res.results.length} تصویر (${res.totalSavingsPct}٪ کاهش حجم)${
            imageOptConfig.stripExifAndGps ? ' · حذف EXIF/GPS' : ''
          }`,
        },
        ...res.results.slice(0, 4).map((r, i) => ({
          id: `exp-opt-single-${Date.now()}-${i}`,
          title: r.outputFilename,
          category: 'archive' as const,
          originalSizeBytes: r.originalSizeBytes,
          outputSizeBytes: r.outputSizeBytes,
          url: memoryArena.registerUrl(URL.createObjectURL(r.blob)),
          filename: r.outputFilename,
          mimeType: `image/${r.format.toLowerCase()}`,
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: `${r.savingsPct}٪ کاهش حجم · ${r.width}x${r.height}px${
            (r.exifStrippedTagsCount || 0) > 0
              ? ` · پاکسازی ${r.exifStrippedTagsCount} تگ EXIF`
              : ''
          }`,
        })),
        ...prev,
      ]);

      setStatusBanner(
        `فشرده‌سازی و پاکسازی متادیتای تصاویر کامل شد: میانگین ${res.totalSavingsPct}٪ کاهش حجم روی ${res.results.length} تصویر.`
      );
    } catch (e) {
      setStatusBanner(
        e instanceof Error ? e.message : 'خطا در بهینه‌سازی تصاویر'
      );
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  // ---------------- BATCH RENAMER (#25) & AES-256 VAULT (#28) HANDLERS ----------------
  const handleRunBatchRenameZip = async () => {
    if (batchFiles.length === 0) return;
    setIsProcessing(true);
    setProcessProgress(20);
    setStatusBanner(
      `در حال تغییر نام الگومحور ${batchFiles.length} فایل و بسته‌بندی در آرشیو ZIP...`
    );
    try {
      const renamedItems = computeBatchRenamedList(batchFiles, batchRenameCfg);
      const res = await packageBatchRenamedFilesToZip(renamedItems, (pct) =>
        setProcessProgress(pct)
      );
      const totalOriginal = batchFiles.reduce((acc, f) => acc + f.size, 0);
      const outUrl = memoryArena.registerUrl(URL.createObjectURL(res.zipBlob));
      setExportedItems((prev) => [
        {
          id: `exp-batch-ren-${Date.now()}`,
          title: res.zipFilename,
          category: 'archive',
          originalSizeBytes: totalOriginal,
          outputSizeBytes: res.zipBlob.size,
          url: outUrl,
          filename: res.zipFilename,
          mimeType: 'application/zip',
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: `تغییر نام دسته‌ای و شماره‌گذاری ${res.count} فایل (ZIP)`,
        },
        ...prev,
      ]);
      setStatusBanner(
        `تغییر نام دسته‌ای ${res.count} فایل کامل شد: «${res.zipFilename}» آماده دانلود است.`
      );
    } catch (e) {
      setStatusBanner(
        e instanceof Error ? e.message : 'خطا در تغییر نام دسته‌ای فایل‌ها'
      );
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  const handleRunVaultEncrypt = async () => {
    if (batchFiles.length === 0) {
      setStatusBanner('ابتدا یک یا چند فایل برای رمزنگاری انتخاب کنید.');
      return;
    }
    if (!vaultPassword || vaultPassword.trim().length < 4) {
      setStatusBanner(
        'لطفاً یک رمز عبور حداقل ۴ کاراکتری برای قفل‌گذاری AES-256-GCM وارد کنید.'
      );
      return;
    }

    setIsProcessing(true);
    setProcessProgress(15);
    setStatusBanner(
      `در حال رمزنگاری سخت‌افزاری AES-256-GCM (PBKDF2 100,000 Iterations) روی ${batchFiles.length} فایل...`
    );

    try {
      const newVaultItems: ExportedOutputItem[] = [];
      for (let i = 0; i < batchFiles.length; i++) {
        const f = batchFiles[i];
        const res = await encryptFileAes256Gcm(f, vaultPassword, (pct) => {
          setProcessProgress(
            Math.round(((i + pct / 100) / batchFiles.length) * 100)
          );
        });
        const outUrl = memoryArena.registerUrl(
          URL.createObjectURL(res.blob)
        );
        newVaultItems.push({
          id: `exp-vault-enc-${Date.now()}-${i}`,
          title: res.filename,
          category: 'archive',
          originalSizeBytes: f.size,
          outputSizeBytes: res.blob.size,
          url: outUrl,
          filename: res.filename,
          mimeType: 'application/octet-stream',
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: `قفل نظامی AES-256-GCM · SHA-256: ${res.sha256Hex.slice(
            0,
            12
          )}...`,
        });
      }
      setExportedItems((prev) => [...newVaultItems, ...prev]);
      setStatusBanner(
        `${newVaultItems.length} فایل با الگوریتم AES-256-GCM رمزنگاری شد (.kronos) و آماده دانلود است.`
      );
    } catch (e) {
      setStatusBanner(
        e instanceof Error ? e.message : 'خطا در رمزنگاری فایل'
      );
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  const handleRunVaultDecrypt = async (filesToDecrypt?: File[]) => {
    const candidates =
      filesToDecrypt && filesToDecrypt.length > 0
        ? filesToDecrypt
        : batchFiles.filter((f) => f.name.toLowerCase().endsWith('.kronos'));

    if (candidates.length === 0) {
      setStatusBanner(
        'فایلی با پسوند .kronos برای رمزگشایی یافت نشد. لطفاً فایل .kronos خود را بارگذاری کنید.'
      );
      return;
    }
    if (!vaultPassword || vaultPassword.trim().length < 4) {
      setStatusBanner('لطفاً رمز عبور فایل .kronos را وارد کنید.');
      return;
    }

    setIsProcessing(true);
    setProcessProgress(20);
    setStatusBanner('در حال اعتبارسنجی تگ اصالت GCM و رمزگشایی فایل...');

    try {
      const unlocked: ExportedOutputItem[] = [];
      for (let i = 0; i < candidates.length; i++) {
        const f = candidates[i];
        const res = await decryptFileAes256Gcm(f, vaultPassword, (pct) =>
          setProcessProgress(pct)
        );
        const outUrl = memoryArena.registerUrl(
          URL.createObjectURL(res.blob)
        );
        unlocked.push({
          id: `exp-vault-dec-${Date.now()}-${i}`,
          title: res.filename,
          category: res.mimeType.startsWith('video/')
            ? 'video'
            : res.mimeType.startsWith('audio/')
            ? 'audio'
            : res.mimeType === 'application/pdf'
            ? 'pdf'
            : 'archive',
          originalSizeBytes: f.size,
          outputSizeBytes: res.blob.size,
          url: outUrl,
          filename: res.filename,
          mimeType: res.mimeType,
          createdAt: new Date().toLocaleTimeString('fa-IR'),
          details: `رمزگشایی موفق AES-256-GCM · SHA-256 تایید شد`,
        });
      }
      setExportedItems((prev) => [...unlocked, ...prev]);
      setStatusBanner(
        `رمزگشایی با موفقیت انجام شد: ${unlocked.length} فایل اصلی بازیابی شد.`
      );
    } catch (e) {
      setStatusBanner(
        e instanceof Error ? e.message : 'خطا در رمزگشایی فایل .kronos'
      );
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  const handleRunHashAudit = async () => {
    if (batchFiles.length === 0) return;
    setIsProcessing(true);
    setProcessProgress(20);
    setStatusBanner(
      `در حال محاسبه هش کریپتوگرافیک SHA-256 و بررسی هدر باینری ${batchFiles.length} فایل...`
    );
    try {
      const results = await inspectFilesCryptographicHashes(
        batchFiles,
        (pct) => setProcessProgress(pct)
      );
      setHashAuditResults(results);
      setStatusBanner(
        `هش SHA-256 و امضای باینری (Magic Bytes) برای ${results.length} فایل محاسبه شد.`
      );
    } catch (e) {
      setStatusBanner(
        e instanceof Error ? e.message : 'خطا در محاسبه هش فایل‌ها'
      );
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  // Reorder & Garbage Collection helpers
  const moveVideoClip = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= videoList.length) return;
    const copy = [...videoList];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    setVideoList(copy);
  };

  const moveAudioTrack = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= audioTracks.length) return;
    const copy = [...audioTracks];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    setAudioTracks(copy);
  };

  const movePdfPage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= pdfPages.length) return;
    const copy = [...pdfPages];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    setPdfPages(copy);
  };

  const rotatePdfPage = (pageId: string) => {
    setPdfPages((prev) =>
      prev.map((p) =>
        p.id === pageId
          ? {
              ...p,
              rotationDeg: (((p.rotationDeg + 90) % 360) as 0 | 90 | 180 | 270),
            }
          : p
      )
    );
  };

  const togglePdfPageIncluded = (pageId: string) => {
    setPdfPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, included: !p.included } : p))
    );
  };

  const removeWholePdfDoc = (docId: string) => {
    setPdfDocs((prev) => prev.filter((d) => d.id !== docId));
    setPdfPages((prev) => prev.filter((p) => p.sourceDocId !== docId));
  };

  const handleClearExportsAndPurgeRam = async () => {
    exportedItems.forEach((item) => memoryArena.revokeUrl(item.url));
    const purgedCount = memoryArena.purgeAll();
    const opfsCount = await opfsScratchDisk.purgeScratchDisk();
    setExportedItems([]);
    setLiveTelemetry(thermalGovernor.getSnapshot());
    setStatusBanner(
      `حافظه مرورگر (Blob Arena: ${purgedCount} · OPFS NVMe Scratch: ${opfsCount} · TypedArray Ring Pool) با موفقیت پاکسازی و آزاد شد.`
    );
  };

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-[#F4F4F6] flex flex-col pb-16 md:pb-0">
      {/* STRICT 3-ZONE TOP BAR CONTRACT (Compact 54px on mobile for 15% Sticky Cap) */}
      <header className="flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 lg:px-12 py-3 sm:py-4 border-b border-white/10 bg-[#0B0C0E]/90 backdrop-blur-md sticky top-0 z-40">
        {/* Zone 1: Brand Title, One Line */}
        <a
          href="#top"
          className="text-base sm:text-lg font-bold tracking-tight text-[#F4F4F6] whitespace-nowrap shrink-0"
        >
          کرونوس استودیو
        </a>

        {/* Zone 2: Navigation Links + Dedicated Platform Downloaders */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#9CA3AF]">
          <a
            href="#workbench"
            onClick={() => setActiveTab('video')}
            className="hover:text-[#F4F4F6] hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0"
          >
            استودیو ویدیو
          </a>
          <a
            href="#workbench"
            onClick={() => setActiveTab('audio')}
            className="hover:text-[#F4F4F6] hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0"
          >
            مهندسی صدا
          </a>
          <a
            href="#workbench"
            onClick={() => setActiveTab('pdf')}
            className="hover:text-[#F4F4F6] hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0"
          >
            اسناد PDF و عکس
          </a>
          <Link
            href="/downloader/youtube"
            className="text-red-400 hover:text-red-300 hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0"
          >
            دانلودر یوتیوب
          </Link>
          <Link
            href="/downloader/instagram"
            className="text-pink-400 hover:text-pink-300 hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0"
          >
            دانلودر اینستاگرام
          </Link>
          <Link
            href="/downloader/direct"
            className="text-emerald-400 hover:text-emerald-300 hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0"
          >
            دانلودر مستقیم (۸ کاناله)
          </Link>
        </nav>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/downloader"
            className="px-3 py-2 text-xs font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            مرکز دانلودر ضدتحریم
          </Link>
          <button
            type="button"
            onClick={handleLoadAllSampleMedia}
            disabled={isGeneratingSamples}
            className="px-3.5 sm:px-4 py-2 text-xs font-semibold text-[#0B0C0E] bg-[#F97316] hover:bg-[#FB923C] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isGeneratingSamples
              ? 'در حال ساخت نمونه...'
              : 'بارگذاری رسانه نمونه'}
          </button>
        </div>
      </header>

      {/* HERO SECTION: ASYMMETRIC EDITORIAL SPLIT + MULTI-FILE HARDWARE DROPZONE */}
      <section
        id="top"
        className="px-4 sm:px-6 lg:px-12 pt-6 sm:pt-10 pb-8 sm:pb-12 border-b border-white/10"
      >
        <div className="max-w-[1360px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-between py-1 sm:py-2">
              <div className="space-y-4 sm:space-y-5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF]">
                  <span>شتاب‌دهی چند‌هسته‌ای Web Worker</span>
                  <span aria-hidden="true">·</span>
                  <span>Zero-Copy ArrayBuffer</span>
                  <span aria-hidden="true">·</span>
                  <span>بدون آپلود روی سرور</span>
                </div>

                <h1
                  className="text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#F4F4F6] leading-[1.2]"
                  style={{ textWrap: 'balance' }}
                >
                  استودیو اتصال و تدوین چند ویدیو، مهندسی صدا و اسناد PDF روی سخت‌افزار شما
                </h1>

                <p className="text-sm sm:text-base text-[#9CA3AF] leading-relaxed max-w-2xl">
                  مجهز به موتور پردازش موازی Web Worker (بدون قفل شدن رابط کاربری در موبایل و دسکتاپ)، شتاب‌دهی گرافیکی GPU، اتصال چند ویدیو به یکدیگر، حذف نویز و سکوت، امضای PDF و رمزنگاری AES-256-GCM.
                </p>
              </div>

              <div className="pt-6 sm:pt-8 flex flex-wrap items-center gap-2.5">
                <a
                  href="#workbench"
                  className="px-5 py-2.5 text-xs sm:text-sm font-semibold bg-[#F97316] text-[#0B0C0E] rounded-lg hover:bg-[#FB923C] transition-colors whitespace-nowrap shrink-0"
                >
                  ورود به میز کار استودیو
                </a>
                <Link
                  href="/downloader/youtube"
                  className="px-4 py-2.5 text-xs sm:text-sm font-semibold bg-red-500/15 text-red-300 border border-red-500/30 rounded-lg hover:bg-red-500/25 transition-colors whitespace-nowrap shrink-0"
                >
                  دانلودر یوتیوب و Shorts
                </Link>
                <Link
                  href="/downloader/instagram"
                  className="px-4 py-2.5 text-xs sm:text-sm font-semibold bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-lg hover:bg-pink-500/25 transition-colors whitespace-nowrap shrink-0"
                >
                  دانلودر اینستاگرام (Reels)
                </Link>
                <Link
                  href="/downloader/direct"
                  className="px-4 py-2.5 text-xs sm:text-sm font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/25 transition-colors whitespace-nowrap shrink-0"
                >
                  دانلودر مستقیم (Multi-Chunk 8x)
                </Link>
                <button
                  type="button"
                  onClick={handleLoadAllSampleMedia}
                  disabled={isGeneratingSamples}
                  className="px-4 py-2.5 text-xs sm:text-sm font-medium bg-[#121418] text-[#F4F4F6] border border-white/15 rounded-lg hover:border-white/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  تولید رسانه نمونه
                </button>
              </div>
            </div>

            {/* Universal Multi-File Dropzone */}
            <div className="lg:col-span-5">
              <label
                htmlFor="universal-file-input"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleUniversalFiles(e.dataTransfer.files);
                }}
                className="h-full min-h-[210px] sm:min-h-[260px] bg-[#121418] border border-dashed border-white/20 hover:border-[#F97316] rounded-xl p-5 sm:p-6 flex flex-col justify-between cursor-pointer transition-colors group"
              >
                <input
                  id="universal-file-input"
                  type="file"
                  multiple
                  accept="video/*,audio/*,image/*,.pdf,application/pdf,.srt,.kronos"
                  onChange={(e) => {
                    handleUniversalFiles(e.target.files);
                    e.currentTarget.value = '';
                  }}
                  className="hidden"
                />

                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#9CA3AF]">
                    آپلود همزمان چند فایل · تشخیص خودکار نوع رسانه
                  </span>
                  <Upload className="w-5 h-5 text-[#9CA3AF] group-hover:text-[#F97316] transition-colors" />
                </div>

                <div className="my-4 sm:my-6 space-y-2">
                  <p className="text-base sm:text-lg font-semibold text-[#F4F4F6]">
                    چندین فایل ویدیو، ویس، عکس یا PDF را همزمان انتخاب کنید
                  </p>
                  <p className="text-xs text-[#9CA3AF] leading-relaxed">
                    پشتیبانی از بارگذاری موازی چندین فایل در دسکتاپ و گالری موبایل؛ آماده برای اتصال (Merge)، زیرنویس، تفکیک وکال یا رمزنگاری.
                  </p>
                </div>

                <div className="pt-3 sm:pt-4 border-t border-white/10 flex items-center justify-between text-xs text-[#9CA3AF] font-mono tabular-nums">
                  <span>MULTI-FILE: VIDEO · AUDIO · PDF · AES</span>
                  <span className="text-[#F97316] font-sans font-medium">
                    انتخاب چند فایل ←
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Full-Width 4-Column Hardware Proof & 12-Accelerator Active Telemetry Strip */}
          <div className="mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-white/10 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div>
                <div className="text-xl sm:text-2xl font-bold text-[#F4F4F6] font-mono tabular-nums">
                  {hwProfile
                    ? `${hwProfile.cpuCores} Cores (${hwProfile.workerPoolSize} Workers)`
                    : 'Multi-Core Pool'}
                </div>
                <div className="mt-1 text-xs text-[#9CA3AF]">
                  استخر ترد پویا (Worker Pool) + کرنل باینری WASM SIMD
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-[#F4F4F6] font-mono tabular-nums">
                  {hwProfile
                    ? `~${hwProfile.deviceMemoryGb} GB RAM + OPFS`
                    : 'Zero-Copy Arena'}
                </div>
                <div className="mt-1 text-xs text-[#9CA3AF]">
                  استخر حلقوی TypedArray (بدون توقف GC) + دیسک مجازی OPFS
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-[#F4F4F6] font-mono tabular-nums truncate">
                  {hwProfile?.supportsWebGL2Shaders
                    ? 'WebGL2 GLSL + Offscreen'
                    : 'GPU Canvas 2D'}
                </div>
                <div className="mt-1 text-xs text-[#9CA3AF] truncate">
                  {hwProfile
                    ? hwProfile.gpuRenderer
                    : 'شیدرهای پیکسلی GLSL روی کارت گرافیک'}
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-[#F4F4F6] font-mono tabular-nums flex items-center gap-2">
                  <span>{liveTelemetry ? `${liveTelemetry.fps} FPS` : '60 FPS'}</span>
                  <span className="text-xs font-normal text-emerald-400">
                    ({liveTelemetry ? `${liveTelemetry.frameTimeMs}ms` : '16.6ms'})
                  </span>
                </div>
                <div className="mt-1 text-xs text-[#9CA3AF]">
                  پایش زنده فریم و باتری · {isProxyScrubbing ? 'پروکسی زنده 0.5x فعال' : 'وضوح مستر 1.0x Ultra-HD'}
                </div>
              </div>
            </div>

            {/* 12 Creative Performance Engines Active Matrix Bar */}
            <div className="bg-[#121418] border border-white/10 rounded-xl p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-2 font-semibold text-[#F4F4F6]">
                <Zap className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                <span>۱۲ موتور شتاب‌دهنده سخت‌افزاری فعال:</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 font-mono">
                <span className="px-2 py-0.5 rounded bg-[#0B0C0E] border border-emerald-500/30 text-emerald-300">
                  1.WebGL2 GLSL
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B0C0E] border border-emerald-500/30 text-emerald-300">
                  2.OffscreenCanvas
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B0C0E] border border-emerald-500/30 text-emerald-300">
                  3.WebCodecs/rVFC
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B0C0E] border border-emerald-500/30 text-emerald-300">
                  4.OPFS Disk ({liveTelemetry?.opfsFilesCount ?? 0})
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B0C0E] border border-emerald-500/30 text-emerald-300">
                  5.Stream 4MB
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B0C0E] border border-emerald-500/30 text-emerald-300">
                  6.RingArena ({liveTelemetry?.pooledBuffersCount ?? 0})
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B0C0E] border border-emerald-500/30 text-emerald-300">
                  7.WorkerPool ({liveTelemetry?.activeWorkers ?? 4}x)
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B0C0E] border border-emerald-500/30 text-emerald-300">
                  8.WASM SIMD
                </span>
                <span
                  className={`px-2 py-0.5 rounded border ${
                    isProxyScrubbing
                      ? 'bg-[#F97316]/20 border-[#F97316] text-[#F97316] font-bold'
                      : 'bg-[#0B0C0E] border-emerald-500/30 text-emerald-300'
                  }`}
                >
                  9.Proxy {isProxyScrubbing ? '0.5x LIVE' : '1.0x HD'}
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B0C0E] border border-emerald-500/30 text-emerald-300">
                  10.IdlePrewarm ({liveTelemetry?.idlePrewarmedFiles ?? 0})
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B0C0E] border border-emerald-500/30 text-emerald-300">
                  11.VirtualDOM
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B0C0E] border border-emerald-500/30 text-emerald-300">
                  12.ThermalGov ({liveTelemetry?.fps ?? 60}fps)
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MAIN INTERACTIVE WORKBENCH (With Smart 0.5x Proxy Scrubbing Detection on Range Sliders) */}
      <main
        id="workbench"
        onPointerDown={(e) => {
          const target = e.target as HTMLElement | null;
          if (
            target &&
            target.tagName === 'INPUT' &&
            (target as HTMLInputElement).type === 'range'
          ) {
            setIsProxyScrubbing(true);
          }
        }}
        className="flex-1 px-4 sm:px-6 lg:px-12 py-6 sm:py-10 max-w-[1360px] w-full mx-auto space-y-6 sm:space-y-8"
      >
        {/* Workbench Mode Switcher, Hardware Power Mode & Status Line */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-white/10">
          {/* Scrollable Segmented Control for Mobile & Desktop */}
          <div className="flex items-center gap-1.5 p-1.5 bg-[#121418] border border-white/10 rounded-xl overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setActiveTab('video')}
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 sm:py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'video'
                  ? 'bg-[#F97316] text-[#0B0C0E]'
                  : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>۱. استودیو ویدیو ({videoList.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('audio')}
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 sm:py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'audio'
                  ? 'bg-[#F97316] text-[#0B0C0E]'
                  : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>۲. مهندسی صدا ({audioTracks.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pdf')}
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 sm:py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'pdf'
                  ? 'bg-[#F97316] text-[#0B0C0E]'
                  : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>۳. سوئیت PDF و عکس ({pdfDocs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('batch-vault')}
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 sm:py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'batch-vault'
                  ? 'bg-[#F97316] text-[#0B0C0E]'
                  : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>۴. تغییر نام دسته‌ای و رمزنگاری ({batchFiles.length})</span>
            </button>
          </div>

          {/* Hardware Power Profile Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-[#121418] border border-white/10 rounded-lg p-1 text-xs">
              <Zap className="w-3.5 h-3.5 text-[#F97316] mr-1.5" />
              {(
                [
                  { id: 'turbo-gpu', label: 'حداکثر توان (Turbo GPU)' },
                  { id: 'adaptive', label: 'هوشمند تطبیقی' },
                  { id: 'eco-mobile', label: 'بهینه موبایل (Eco)' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPerfMode(m.id)}
                  className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    perfMode === m.id
                      ? 'bg-[#191C22] text-[#F97316] border border-[#F97316]/40'
                      : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live Status Banner */}
        {statusBanner && (
          <div className="text-xs text-[#E5E7EB] bg-[#121418] border border-white/10 px-4 py-3 rounded-lg flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-[#F97316] shrink-0" />
            <span className="leading-relaxed">{statusBanner}</span>
          </div>
        )}

        {/* Progress Bar with Hardware Pulse */}
        {isProcessing && (
          <div className="bg-[#121418] border border-[#F97316]/40 shadow-lg shadow-black/50 rounded-xl p-4 sm:p-5 space-y-2.5 transition-all">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F97316] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#F97316]"></span>
                </span>
                <span className="font-semibold text-[#F4F4F6]">
                  در حال پردازش بومی روی سخت‌افزار دستگاه ({perfMode.toUpperCase()})...
                </span>
              </div>
              <span className="font-mono tabular-nums text-sm font-bold text-[#F97316]">
                {Math.min(100, Math.max(0, processProgress))}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-[#0B0C0E] rounded-full overflow-hidden p-0.5 border border-white/10">
              <div
                className="h-full bg-gradient-to-l from-[#F97316] to-[#FB923C] rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.min(100, Math.max(3, processProgress))}%` }}
              />
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 1: VIDEO STUDIO (MULTI-VIDEO MERGE + #1..#6)
           =================================================================== */}
        {activeTab === 'video' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* Video Preview Monitor & Multi-Video Rack (7 cols) */}
            <div className="lg:col-span-7 bg-[#121418] border border-white/10 rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[#F4F4F6]">
                    مانیتور مرجع و لیست ویدیوها ({videoList.length})
                  </h2>
                  <p className="text-xs text-[#9CA3AF] mt-0.5">
                    {selectedVideoMeta
                      ? `${selectedVideoMeta.name} · ${selectedVideoMeta.width}×${selectedVideoMeta.height} · سرعت ${videoConfig.playbackRate}x`
                      : 'چند فایل ویدیویی را انتخاب کنید تا به هم متصل یا ویرایش شوند'}
                  </p>
                </div>

                <div>
                  <input
                    ref={videoInputRef}
                    type="file"
                    multiple
                    accept="video/*"
                    onChange={(e) => {
                      handleUniversalFiles(e.target.files);
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="min-h-[40px] px-3.5 py-2 text-xs font-medium bg-[#191C22] hover:bg-white/10 text-[#F4F4F6] border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4 text-[#F97316]" />
                    <span>افزودن چند ویدیو</span>
                  </button>
                </div>
              </div>

              {/* Video Viewport */}
              <div className="relative aspect-video bg-[#0B0C0E] border border-white/10 rounded-lg overflow-hidden flex items-center justify-center">
                {selectedVideoMeta ? (
                  <div
                    className="relative h-full flex items-center justify-center overflow-hidden border border-white/10"
                    style={{
                      aspectRatio:
                        videoConfig.aspectRatioPreset === '9:16'
                          ? '9 / 16'
                          : videoConfig.aspectRatioPreset === '1:1'
                          ? '1 / 1'
                          : videoConfig.aspectRatioPreset === '4:5'
                          ? '4 / 5'
                          : '16 / 9',
                    }}
                  >
                    {videoConfig.aspectRatioPreset !== 'original' &&
                      videoConfig.aspectFillMode === 'blur-backdrop' && (
                        <div className="absolute inset-0 bg-[#191C22]/70 backdrop-blur-xl pointer-events-none" />
                      )}

                    <video
                      key={selectedVideoMeta.objectUrl}
                      ref={videoPreviewRef}
                      src={selectedVideoMeta.objectUrl}
                      playsInline
                      onTimeUpdate={(e) =>
                        setVideoCurrentTime(e.currentTarget.currentTime)
                      }
                      onPlay={() => setVideoPlaying(true)}
                      onPause={() => setVideoPlaying(false)}
                      onEnded={() => setVideoPlaying(false)}
                      className={`relative z-10 w-full h-full ${
                        videoConfig.aspectRatioPreset !== 'original' &&
                        videoConfig.aspectFillMode === 'center-crop'
                          ? 'object-cover'
                          : 'object-contain'
                      }`}
                      style={{
                        filter: `brightness(${videoConfig.brightness}%) contrast(${videoConfig.contrast}%) saturate(${videoConfig.saturation}%) ${
                          videoConfig.cinemaLut === 'noir-bw'
                            ? 'grayscale(100%) contrast(125%)'
                            : videoConfig.cinemaLut === 'vintage-film'
                            ? 'sepia(35%) contrast(95%)'
                            : videoConfig.cinemaLut === 'cyberpunk'
                            ? 'hue-rotate(-18deg) saturate(145%)'
                            : videoConfig.cinemaLut === 'teal-orange'
                            ? 'contrast(112%) saturate(125%)'
                            : ''
                        }`,
                        transform: `rotate(${videoConfig.rotationDeg}deg) scaleX(${
                          videoConfig.flipHorizontal ? -1 : 1
                        })`,
                      }}
                    />

                    {/* Live PiP Logo Watermark Overlay Preview (#3) */}
                    {videoConfig.logoOverlay.enabled &&
                      videoConfig.logoOverlay.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={videoConfig.logoOverlay.imageUrl}
                          alt="Logo Overlay"
                          style={{
                            width: `${videoConfig.logoOverlay.scalePct}%`,
                            opacity: videoConfig.logoOverlay.opacityPct / 100,
                          }}
                          className={`absolute z-20 pointer-events-none rounded ${
                            videoConfig.logoOverlay.position === 'top-left'
                              ? 'top-3 left-3'
                              : videoConfig.logoOverlay.position === 'top-right'
                              ? 'top-3 right-3'
                              : videoConfig.logoOverlay.position ===
                                'bottom-left'
                              ? 'bottom-12 left-3'
                              : videoConfig.logoOverlay.position ===
                                'bottom-right'
                              ? 'bottom-12 right-3'
                              : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
                          }`}
                        />
                      )}

                    {/* Live Burn-In Subtitle Preview (#1) */}
                    {videoConfig.subtitleBurn.enabled &&
                      videoConfig.subtitleBurn.cues.length > 0 && (
                        <div
                          style={{
                            bottom: `${Math.max(
                              12,
                              videoConfig.subtitleBurn.bottomMarginPct
                            )}%`,
                          }}
                          className="absolute left-4 right-4 z-20 flex justify-center pointer-events-none"
                        >
                          <div
                            style={{
                              color: videoConfig.subtitleBurn.textColor,
                              backgroundColor: `rgba(11,12,14,${videoConfig.subtitleBurn.bgOpacity})`,
                            }}
                            className="px-3 py-1.5 rounded-md border border-[#F97316]/60 text-xs sm:text-sm font-bold text-center shadow-lg"
                          >
                            {(
                              videoConfig.subtitleBurn.cues.find(
                                (c) =>
                                  videoCurrentTime >= c.startSec &&
                                  videoCurrentTime <= c.endSec
                              ) || videoConfig.subtitleBurn.cues[0]
                            )?.text}
                          </div>
                        </div>
                      )}

                    {videoConfig.privacyZone.enabled && (
                      <div
                        style={{
                          left: `${videoConfig.privacyZone.xPct}%`,
                          top: `${videoConfig.privacyZone.yPct}%`,
                          width: `${videoConfig.privacyZone.wPct}%`,
                          height: `${videoConfig.privacyZone.hPct}%`,
                          backdropFilter:
                            videoConfig.privacyZone.mode === 'blur'
                              ? `blur(${videoConfig.privacyZone.intensity}px)`
                              : `blur(${Math.round(
                                  videoConfig.privacyZone.intensity * 0.6
                                )}px) contrast(140%)`,
                        }}
                        className="absolute z-20 border-2 border-dashed border-[#F97316] bg-black/20 rounded flex items-center justify-center pointer-events-none"
                      >
                        <span className="text-[10px] font-mono bg-[#0B0C0E]/80 text-[#F97316] px-1.5 py-0.5 rounded">
                          {videoConfig.privacyZone.mode === 'blur'
                            ? 'BLUR ZONE'
                            : 'PIXELATE ZONE'}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center p-6 sm:p-8 space-y-4">
                    <Film className="w-9 h-9 text-[#9CA3AF] mx-auto stroke-[1.5]" />
                    <div className="space-y-1">
                      <p className="text-xs sm:text-sm font-medium text-[#F4F4F6]">
                        چند ویدیو از دستگاه خود انتخاب کنید یا با یک کلیک ۲ ویدیوی تست بسازید
                      </p>
                      <p className="text-xs text-[#9CA3AF]">
                        امکان اتصال چند ویدیو، حک زیرنویس SRT، ساخت GIF، حذف پرده سبز، بومرنگ و استخراج فریم‌ها
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleLoadAllSampleMedia}
                      className="min-h-[40px] px-4 py-2 text-xs font-semibold bg-[#F97316] text-[#0B0C0E] rounded-lg hover:bg-[#FB923C] transition-colors cursor-pointer"
                    >
                      تولید فوری ۲ ویدیوی نمونه (آماده اتصال)
                    </button>
                  </div>
                )}

                {selectedVideoMeta && (
                  <div
                    dir="ltr"
                    className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 right-2 sm:right-3 z-30 px-3 py-2 bg-[#0B0C0E]/85 backdrop-blur-sm border border-white/10 rounded-md flex items-center justify-between text-xs font-mono tabular-nums"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!videoPreviewRef.current) return;
                        if (videoPlaying) videoPreviewRef.current.pause();
                        else videoPreviewRef.current.play();
                      }}
                      className="min-h-[32px] flex items-center gap-1.5 text-[#F4F4F6] hover:text-[#F97316] cursor-pointer"
                    >
                      {videoPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      <span>{videoPlaying ? 'PAUSE' : 'PLAY'}</span>
                    </button>

                    <span className="text-[#F97316]">
                      {formatTimecode(videoCurrentTime)} /{' '}
                      {formatTimecode(selectedVideoMeta.duration)}
                    </span>

                    <span className="text-[#9CA3AF] hidden sm:inline">
                      {videoConfig.aspectRatioPreset === 'original'
                        ? `${selectedVideoMeta.width}×${selectedVideoMeta.height}`
                        : `Social ${videoConfig.aspectRatioPreset}`}
                    </span>
                  </div>
                )}
              </div>

              {/* MULTI-VIDEO SEQUENCE RACK */}
              <div className="space-y-3 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#E5E7EB]">
                    ترتیب اتصال ویدیوها و لیست کلیپ‌ها
                  </h3>
                  <span className="text-xs text-[#9CA3AF] font-mono tabular-nums">
                    {videoList.length} Clips ·{' '}
                    {videoList
                      .reduce((acc, v) => acc + v.duration, 0)
                      .toFixed(1)}
                    s Total
                  </span>
                </div>

                {videoList.length === 0 ? (
                  <div className="p-4 bg-[#0B0C0E] border border-white/10 rounded-lg text-xs text-[#9CA3AF] text-center">
                    هنوز ویدیویی در لیست نیست. روی «افزودن چند ویدیو» کلیک کنید.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {videoList.map((clip, idx) => {
                      const isSelected = selectedVideoMeta?.id === clip.id;
                      return (
                        <div
                          key={clip.id}
                          onClick={() => {
                            setSelectedVideoId(clip.id);
                            setVideoConfig((prev) => ({
                              ...prev,
                              trimStartSec: 0,
                              trimEndSec: Number(clip.duration.toFixed(2)),
                            }));
                          }}
                          className={`p-3 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#191C22] border-[#F97316]'
                              : 'bg-[#0B0C0E] border-white/10 hover:border-white/25'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-xs font-mono tabular-nums text-[#F97316] font-bold shrink-0">
                              0{idx + 1}
                            </span>
                            {clip.thumbnails[0] && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={clip.thumbnails[0]}
                                alt={clip.name}
                                referrerPolicy="no-referrer"
                                className="w-11 h-8 object-cover rounded border border-white/10 shrink-0"
                              />
                            )}
                            <div className="truncate">
                              <div className="text-xs font-semibold text-[#F4F4F6] truncate">
                                {clip.name}
                              </div>
                              <div className="text-[11px] text-[#9CA3AF] font-mono tabular-nums">
                                {clip.duration.toFixed(1)}s · {clip.width}×
                                {clip.height} · {formatBytes(clip.sizeBytes)}
                              </div>
                            </div>
                          </div>

                          <div
                            className="flex items-center gap-1 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => moveVideoClip(idx, -1)}
                              disabled={idx === 0}
                              className="min-w-[36px] min-h-[36px] flex items-center justify-center bg-[#121418] hover:bg-white/10 rounded border border-white/10 disabled:opacity-30 cursor-pointer"
                              title="انتقال به بالا"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveVideoClip(idx, 1)}
                              disabled={idx === videoList.length - 1}
                              className="min-w-[36px] min-h-[36px] flex items-center justify-center bg-[#121418] hover:bg-white/10 rounded border border-white/10 disabled:opacity-30 cursor-pointer"
                              title="انتقال به پایین"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                memoryArena.revokeUrl(clip.objectUrl);
                                setVideoList((prev) =>
                                  prev.filter((item) => item.id !== clip.id)
                                );
                              }}
                              className="min-w-[36px] min-h-[36px] flex items-center justify-center bg-[#121418] hover:bg-red-500/20 text-[#9CA3AF] hover:text-red-400 rounded border border-white/10 cursor-pointer"
                              title="حذف ویدیو"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Video Engineering Inspector Rack (5 cols) */}
            <div className="lg:col-span-5 bg-[#121418] border border-white/10 rounded-xl p-4 sm:p-6 space-y-5">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    setVideoConfig((prev) => ({
                      ...prev,
                      operation: 'merge-videos',
                    }))
                  }
                  className={`w-full p-3.5 rounded-lg border text-right transition-colors cursor-pointer flex items-center justify-between ${
                    videoConfig.operation === 'merge-videos'
                      ? 'bg-[#191C22] border-[#F97316] text-[#F4F4F6]'
                      : 'bg-[#0B0C0E] border-white/10 text-[#9CA3AF] hover:text-[#F4F4F6]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Link2
                      className={`w-4 h-4 shrink-0 ${
                        videoConfig.operation === 'merge-videos'
                          ? 'text-[#F97316]'
                          : 'text-[#9CA3AF]'
                      }`}
                    />
                    <div>
                      <div className="text-xs font-bold text-[#F4F4F6]">
                        اتصال و ادغام چند ویدیو به یکدیگر (Merge Videos)
                      </div>
                      <div className="text-[11px] text-[#9CA3AF]">
                        چسباندن پیوسته تمام ویدیوهای لیست ({videoList.length}{' '}
                        کلیپ) در یک فایل واحد
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-[#F97316] shrink-0">
                    {videoList.length} Clips
                  </span>
                </button>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    {
                      id: 'edit-grade',
                      label: 'تدوین، زیرنویس و کروماکی',
                      icon: Scissors,
                    },
                    {
                      id: 'video-to-gif',
                      label: 'تبدیل به GIF متحرک',
                      icon: Sparkles,
                    },
                    {
                      id: 'extract-frames-zip',
                      label: 'استخراج فریم‌ها (ZIP)',
                      icon: ImageIcon,
                    },
                    {
                      id: 'boomerang-reverse',
                      label: 'بومرنگ و معکوس',
                      icon: RefreshCw,
                    },
                    {
                      id: 'replace-audio',
                      label: 'تعویض صدا (Dubbing)',
                      icon: Music,
                    },
                    {
                      id: 'extract-audio',
                      label: 'جداسازی صدا از ویدیو',
                      icon: Volume2,
                    },
                    {
                      id: 'compress-convert',
                      label: 'فشرده‌سازی ویدیو',
                      icon: Sliders,
                    },
                    {
                      id: 'strip-audio',
                      label: 'حذف صدا (Mute)',
                      icon: VolumeX,
                    },
                  ].map((op) => {
                    const Icon = op.icon;
                    const active = videoConfig.operation === op.id;
                    return (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() =>
                          setVideoConfig((prev) => ({
                            ...prev,
                            operation: op.id as VideoProcessConfig['operation'],
                          }))
                        }
                        className={`min-h-[42px] p-2 rounded-lg border text-right transition-colors cursor-pointer flex items-center gap-1.5 ${
                          active
                            ? 'bg-[#191C22] border-[#F97316] text-[#F4F4F6]'
                            : 'bg-[#0B0C0E] border-white/10 text-[#9CA3AF] hover:text-[#F4F4F6]'
                        }`}
                      >
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            active ? 'text-[#F97316]' : 'text-[#9CA3AF]'
                          }`}
                        />
                        <span className="text-[11px] font-semibold leading-tight">
                          {op.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {videoConfig.operation === 'merge-videos' && (
                <div className="bg-[#0B0C0E] border border-[#F97316]/40 rounded-lg p-3.5 space-y-3">
                  <div className="text-xs font-semibold text-[#F4F4F6]">
                    نوع ترنزیشن و اتصال بین کلیپ‌های ویدیویی
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setVideoConfig((prev) => ({
                          ...prev,
                          mergeTransition: 'fade-black',
                        }))
                      }
                      className={`min-h-[38px] py-2 px-3 text-xs rounded border cursor-pointer ${
                        videoConfig.mergeTransition === 'fade-black'
                          ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                          : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                      }`}
                    >
                      دیزالو سینمایی (Fade)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setVideoConfig((prev) => ({
                          ...prev,
                          mergeTransition: 'cut',
                        }))
                      }
                      className={`min-h-[38px] py-2 px-3 text-xs rounded border cursor-pointer ${
                        videoConfig.mergeTransition === 'cut'
                          ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                          : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                      }`}
                    >
                      برش مستقیم (Direct Cut)
                    </button>
                  </div>

                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#E5E7EB] font-medium">
                        شتاب سخت‌افزاری موتور ادغام (Hyper-Turbo)
                      </span>
                      <span className="font-mono tabular-nums text-[#F97316]">
                        {videoConfig.renderSpeedBoost || 4}x Boost
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(
                        [
                          { val: 1, label: '1x دقیق' },
                          { val: 2, label: '2x سریع' },
                          { val: 4, label: '4x توربو' },
                          { val: 8, label: '8x حداکثر' },
                        ] as const
                      ).map((b) => (
                        <button
                          key={b.val}
                          type="button"
                          onClick={() =>
                            setVideoConfig((prev) => ({
                              ...prev,
                              renderSpeedBoost: b.val,
                            }))
                          }
                          className={`min-h-[36px] py-1.5 px-2 text-xs font-mono rounded border cursor-pointer ${
                            (videoConfig.renderSpeedBoost || 4) === b.val
                              ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                              : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Feature #2: Video to Animated GIF89a Maker */}
              {videoConfig.operation === 'video-to-gif' && (
                <div className="bg-[#0B0C0E] border border-[#F97316]/50 rounded-lg p-3.5 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#F4F4F6]">
                    <Sparkles className="w-4 h-4 text-[#F97316]" />
                    <span>تبدیل ویدیو به تصویر متحرک GIF89a (با کوانتیزاسیون پالت)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <label className="text-[#9CA3AF] block">نرخ فریم GIF</label>
                      <select
                        value={videoConfig.gifFps}
                        onChange={(e) =>
                          setVideoConfig((prev) => ({
                            ...prev,
                            gifFps: Number(
                              e.target.value
                            ) as VideoProcessConfig['gifFps'],
                          }))
                        }
                        className="w-full bg-[#121418] border border-white/15 rounded-lg px-2.5 py-2 font-mono text-[#F4F4F6]"
                      >
                        <option value={8}>8 FPS (کم‌حجم)</option>
                        <option value={10}>10 FPS (استاندارد)</option>
                        <option value={12}>12 FPS (روان)</option>
                        <option value={15}>15 FPS (حداکثر)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[#9CA3AF] block">عرض تصویر GIF</label>
                      <select
                        value={videoConfig.gifWidth}
                        onChange={(e) =>
                          setVideoConfig((prev) => ({
                            ...prev,
                            gifWidth: Number(
                              e.target.value
                            ) as VideoProcessConfig['gifWidth'],
                          }))
                        }
                        className="w-full bg-[#121418] border border-white/15 rounded-lg px-2.5 py-2 font-mono text-[#F4F4F6]"
                      >
                        <option value={240}>240px (استیکر)</option>
                        <option value={320}>320px (توصیه‌شده)</option>
                        <option value={420}>420px (HD GIF)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Feature #4: Frame Extractor & Contact Sheet Storyboard ZIP */}
              {videoConfig.operation === 'extract-frames-zip' && (
                <div className="bg-[#0B0C0E] border border-[#F97316]/50 rounded-lg p-3.5 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#F4F4F6]">
                    <ImageIcon className="w-4 h-4 text-[#F97316]" />
                    <span>استخراج فریم‌های کلیدی + شیت استوری‌بورد سینمایی (ZIP)</span>
                  </div>
                  <p className="text-[11px] text-[#9CA3AF] leading-relaxed">
                    استخراج فریم‌های باکیفیت PNG در فواصل زمانی یکنواخت به همراه ساخت پوستر گرید تایم‌کددار در یک فایل ZIP.
                  </p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {([4, 6, 9, 12, 16] as const).map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() =>
                          setVideoConfig((prev) => ({
                            ...prev,
                            frameExtractCount: cnt,
                          }))
                        }
                        className={`min-h-[36px] py-1.5 text-xs font-mono rounded border cursor-pointer ${
                          videoConfig.frameExtractCount === cnt
                            ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                            : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                        }`}
                      >
                        {cnt} فریم
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Feature #6: Boomerang & Reverse Video Maker */}
              {videoConfig.operation === 'boomerang-reverse' && (
                <div className="bg-[#0B0C0E] border border-[#F97316]/50 rounded-lg p-3.5 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#F4F4F6]">
                    <RefreshCw className="w-4 h-4 text-[#F97316]" />
                    <span>ساخت بومرنگ رفت‌وبرگشت و معکوس زمان (Time Reverse)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setVideoConfig((prev) => ({
                          ...prev,
                          boomerangMode: 'boomerang-loop',
                        }))
                      }
                      className={`min-h-[38px] py-2 px-3 text-xs rounded border cursor-pointer ${
                        videoConfig.boomerangMode === 'boomerang-loop'
                          ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                          : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                      }`}
                    >
                      حلقه بومرنگ (رفت و برگشت)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setVideoConfig((prev) => ({
                          ...prev,
                          boomerangMode: 'reverse-only',
                        }))
                      }
                      className={`min-h-[38px] py-2 px-3 text-xs rounded border cursor-pointer ${
                        videoConfig.boomerangMode === 'reverse-only'
                          ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                          : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                      }`}
                    >
                      پخش کاملاً معکوس (Reverse)
                    </button>
                  </div>
                </div>
              )}

              {videoConfig.operation !== 'merge-videos' &&
                videoList.length > 1 && (
                  <label className="flex items-center justify-between p-3 bg-[#0B0C0E] border border-white/15 rounded-lg cursor-pointer text-xs">
                    <span className="text-[#E5E7EB]">
                      اجرای دسته‌ای روی تمام {videoList.length} ویدیوی لیست به صورت مجزا
                    </span>
                    <input
                      type="checkbox"
                      checked={videoBatchAll}
                      onChange={(e) => setVideoBatchAll(e.target.checked)}
                      className="w-4 h-4 accent-[#F97316]"
                    />
                  </label>
                )}

              {videoConfig.operation === 'extract-audio' ? (
                <div className="space-y-4 pt-3 border-t border-white/10">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#E5E7EB]">
                      فرمت فایل صوتی استخراج‌شده
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'wav-16', label: 'WAV 16-Bit' },
                        { id: 'wav-8-compact', label: 'WAV فشرده' },
                        { id: 'webm-opus', label: 'WebM Opus' },
                      ].map((fmt) => (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() =>
                            setVideoConfig((prev) => ({
                              ...prev,
                              extractedAudioFormat:
                                fmt.id as VideoProcessConfig['extractedAudioFormat'],
                            }))
                          }
                          className={`min-h-[38px] py-2 px-3 text-xs font-mono rounded-lg border cursor-pointer ${
                            videoConfig.extractedAudioFormat === fmt.id
                              ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-semibold'
                              : 'bg-[#0B0C0E] text-[#9CA3AF] border-white/10'
                          }`}
                        >
                          {fmt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5 pt-3 border-t border-white/10 max-h-[540px] overflow-y-auto pr-1">
                  {/* Feature #1: Hardsub / SRT Subtitle Burner */}
                  <div className="bg-[#0B0C0E] border border-white/10 rounded-lg p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-semibold text-[#F4F4F6] cursor-pointer">
                        <Subtitles className="w-3.5 h-3.5 text-[#F97316]" />
                        <span>حک دائمی زیرنویس فارسی و SRT روی ویدیو (Hardsub)</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={videoConfig.subtitleBurn.enabled}
                        onChange={(e) =>
                          setVideoConfig((prev) => ({
                            ...prev,
                            subtitleBurn: {
                              ...prev.subtitleBurn,
                              enabled: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 accent-[#F97316] cursor-pointer"
                      />
                    </div>

                    {videoConfig.subtitleBurn.enabled && (
                      <div className="space-y-2.5 pt-2 border-t border-white/10 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            ref={srtFileInputRef}
                            type="file"
                            accept=".srt,text/plain"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                const txt = await f.text();
                                const parsed = parseSrtSubtitles(txt);
                                if (parsed.length > 0) {
                                  setVideoConfig((prev) => ({
                                    ...prev,
                                    subtitleBurn: {
                                      ...prev.subtitleBurn,
                                      cues: parsed,
                                    },
                                  }));
                                  setStatusBanner(
                                    `${parsed.length} خط زیرنویس از فایل «${f.name}» بارگذاری شد.`
                                  );
                                }
                              }
                              e.currentTarget.value = '';
                            }}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => srtFileInputRef.current?.click()}
                            className="px-2.5 py-1.5 bg-[#121418] hover:bg-white/10 border border-[#F97316]/40 rounded text-[11px] text-[#F97316] cursor-pointer"
                          >
                            + بارگذاری فایل .SRT
                          </button>
                          <span className="text-[11px] font-mono text-[#9CA3AF]">
                            {videoConfig.subtitleBurn.cues.length} Cues Active
                          </span>
                        </div>

                        <input
                          type="text"
                          value={videoConfig.subtitleBurn.cues[0]?.text || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setVideoConfig((prev) => {
                              const updated = [...prev.subtitleBurn.cues];
                              if (updated[0]) {
                                updated[0] = { ...updated[0], text: val };
                              } else {
                                updated.push({
                                  id: 'sub-1',
                                  startSec: 0,
                                  endSec: 10,
                                  text: val,
                                });
                              }
                              return {
                                ...prev,
                                subtitleBurn: {
                                  ...prev.subtitleBurn,
                                  cues: updated,
                                },
                              };
                            });
                          }}
                          placeholder="متن زیرنویس برای حک روی ویدیو..."
                          className="w-full bg-[#121418] border border-white/15 rounded px-2.5 py-1.5 text-xs text-[#F4F4F6]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Feature #3: Picture-in-Picture (PiP) & Logo Watermark Overlay */}
                  <div className="bg-[#0B0C0E] border border-white/10 rounded-lg p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-semibold text-[#F4F4F6] cursor-pointer">
                        <Layers className="w-3.5 h-3.5 text-[#F97316]" />
                        <span>لوگوی تصویر در تصویر و واترمارک (PiP Logo Overlay)</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={videoConfig.logoOverlay.enabled}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked && !videoConfig.logoOverlay.imageUrl) {
                            handleGenerateSampleLogoOverlay();
                          } else {
                            setVideoConfig((prev) => ({
                              ...prev,
                              logoOverlay: {
                                ...prev.logoOverlay,
                                enabled: checked,
                              },
                            }));
                          }
                        }}
                        className="w-4 h-4 accent-[#F97316] cursor-pointer"
                      />
                    </div>

                    {videoConfig.logoOverlay.enabled && (
                      <div className="space-y-2.5 pt-2 border-t border-white/10 text-xs">
                        <input
                          ref={logoOverlayInputRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            handleLogoOverlayUpload(e.target.files);
                            e.currentTarget.value = '';
                          }}
                          className="hidden"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => logoOverlayInputRef.current?.click()}
                            className="flex-1 py-1.5 px-2.5 bg-[#121418] hover:bg-white/10 border border-[#F97316]/40 rounded text-[11px] text-[#F97316] cursor-pointer"
                          >
                            انتخاب لوگو (PNG/WebP)
                          </button>
                          <button
                            type="button"
                            onClick={handleGenerateSampleLogoOverlay}
                            className="py-1.5 px-2.5 bg-[#121418] hover:bg-white/10 border border-white/15 rounded text-[11px] text-[#E5E7EB] cursor-pointer"
                          >
                            ساخت بج نمونه
                          </button>
                        </div>

                        <div className="grid grid-cols-5 gap-1">
                          {(
                            [
                              { id: 'top-right', label: 'بالا راست' },
                              { id: 'top-left', label: 'بالا چپ' },
                              { id: 'bottom-right', label: 'پایین راست' },
                              { id: 'bottom-left', label: 'پایین چپ' },
                              { id: 'center', label: 'مرکز' },
                            ] as const
                          ).map((pos) => (
                            <button
                              key={pos.id}
                              type="button"
                              onClick={() =>
                                setVideoConfig((prev) => ({
                                  ...prev,
                                  logoOverlay: {
                                    ...prev.logoOverlay,
                                    position: pos.id,
                                  },
                                }))
                              }
                              className={`py-1 text-[10px] rounded border cursor-pointer ${
                                videoConfig.logoOverlay.position === pos.id
                                  ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                                  : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                              }`}
                            >
                              {pos.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Feature #5: Chroma Key (Green / Blue Screen Remover) */}
                  <div className="bg-[#0B0C0E] border border-white/10 rounded-lg p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-semibold text-[#F4F4F6] cursor-pointer">
                        <Wand2 className="w-3.5 h-3.5 text-[#F97316]" />
                        <span>حذف پرده سبز و آبی کروماکی (Chroma Key Studio)</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={videoConfig.chromaKey.enabled}
                        onChange={(e) =>
                          setVideoConfig((prev) => ({
                            ...prev,
                            chromaKey: {
                              ...prev.chromaKey,
                              enabled: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 accent-[#F97316] cursor-pointer"
                      />
                    </div>

                    {videoConfig.chromaKey.enabled && (
                      <div className="space-y-2.5 pt-2 border-t border-white/10 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setVideoConfig((prev) => ({
                                ...prev,
                                chromaKey: {
                                  ...prev.chromaKey,
                                  keyColor: 'green',
                                },
                              }))
                            }
                            className={`py-1.5 rounded border text-[11px] cursor-pointer ${
                              videoConfig.chromaKey.keyColor === 'green'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold'
                                : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                            }`}
                          >
                            پرده سبز (Green Screen)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setVideoConfig((prev) => ({
                                ...prev,
                                chromaKey: {
                                  ...prev.chromaKey,
                                  keyColor: 'blue',
                                },
                              }))
                            }
                            className={`py-1.5 rounded border text-[11px] cursor-pointer ${
                              videoConfig.chromaKey.keyColor === 'blue'
                                ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 font-bold'
                                : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                            }`}
                          >
                            پرده آبی (Blue Screen)
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              { id: 'studio-dark', label: 'استودیو تیره' },
                              { id: 'cyber-grid', label: 'گرید نئون' },
                              { id: 'blur-glass', label: 'شیشه‌ای' },
                            ] as const
                          ).map((bg) => (
                            <button
                              key={bg.id}
                              type="button"
                              onClick={() =>
                                setVideoConfig((prev) => ({
                                  ...prev,
                                  chromaKey: {
                                    ...prev.chromaKey,
                                    replacementMode: bg.id,
                                  },
                                }))
                              }
                              className={`py-1 text-[10px] rounded border cursor-pointer ${
                                videoConfig.chromaKey.replacementMode === bg.id
                                  ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                                  : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                              }`}
                            >
                              {bg.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Feature #6: Cinema Color Grading LUTs */}
                  <div className="bg-[#0B0C0E] border border-white/10 rounded-lg p-3.5 space-y-2">
                    <div className="text-xs font-semibold text-[#F4F4F6] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#F97316]" />
                      <span>فیلترهای رنگ سینمایی (Cinema 3D LUTs)</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {(
                        [
                          { id: 'none', label: 'طبیعی' },
                          { id: 'teal-orange', label: 'Teal/Orange' },
                          { id: 'cyberpunk', label: 'Cyberpunk' },
                          { id: 'vintage-film', label: 'Kodak Film' },
                          { id: 'noir-bw', label: 'Noir B&W' },
                        ] as const
                      ).map((lut) => (
                        <button
                          key={lut.id}
                          type="button"
                          onClick={() =>
                            setVideoConfig((prev) => ({
                              ...prev,
                              cinemaLut: lut.id,
                            }))
                          }
                          className={`min-h-[34px] py-1 text-[10px] font-mono rounded border cursor-pointer ${
                            videoConfig.cinemaLut === lut.id
                              ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                              : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                          }`}
                        >
                          {lut.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Speed Ramp & Pitch Lock */}
                  <div className="bg-[#0B0C0E] border border-white/10 rounded-lg p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F4F4F6]">
                        <Gauge className="w-3.5 h-3.5 text-[#F97316]" />
                        <span>تغییر سرعت ویدیو (Speed Ramp)</span>
                      </div>
                      <label className="flex items-center gap-1.5 text-[11px] text-[#9CA3AF] cursor-pointer">
                        <span>Pitch Lock</span>
                        <input
                          type="checkbox"
                          checked={videoConfig.preservePitch}
                          onChange={(e) =>
                            setVideoConfig((prev) => ({
                              ...prev,
                              preservePitch: e.target.checked,
                            }))
                          }
                          className="accent-[#F97316]"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-6 gap-1.5">
                      {([0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const).map(
                        (rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() =>
                              setVideoConfig((prev) => ({
                                ...prev,
                                playbackRate: rate,
                              }))
                            }
                            className={`min-h-[36px] py-1.5 text-xs font-mono tabular-nums rounded border cursor-pointer ${
                              videoConfig.playbackRate === rate
                                ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                                : 'bg-[#121418] text-[#9CA3AF] border-white/10 hover:text-[#F4F4F6]'
                            }`}
                          >
                            {rate}x
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Smart Aspect Ratio Cropper */}
                  <div className="bg-[#0B0C0E] border border-white/10 rounded-lg p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F4F4F6]">
                        <Maximize2 className="w-3.5 h-3.5 text-[#F97316]" />
                        <span>ابعاد هوشمند شبکه‌های اجتماعی</span>
                      </div>
                      {videoConfig.aspectRatioPreset !== 'original' && (
                        <button
                          type="button"
                          onClick={() =>
                            setVideoConfig((prev) => ({
                              ...prev,
                              aspectFillMode:
                                prev.aspectFillMode === 'blur-backdrop'
                                  ? 'center-crop'
                                  : 'blur-backdrop',
                            }))
                          }
                          className="text-[11px] text-[#F97316] hover:underline cursor-pointer"
                        >
                          {videoConfig.aspectFillMode === 'blur-backdrop'
                            ? 'پس‌زمینه محو'
                            : 'برش مرکزی'}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-5 gap-1.5">
                      {(
                        [
                          { id: 'original', label: 'اصلی' },
                          { id: '9:16', label: '9:16' },
                          { id: '1:1', label: '1:1' },
                          { id: '4:5', label: '4:5' },
                          { id: '16:9', label: '16:9' },
                        ] as const
                      ).map((ar) => (
                        <button
                          key={ar.id}
                          type="button"
                          onClick={() =>
                            setVideoConfig((prev) => ({
                              ...prev,
                              aspectRatioPreset: ar.id,
                            }))
                          }
                          className={`min-h-[36px] py-1.5 text-xs font-medium rounded border cursor-pointer whitespace-nowrap ${
                            videoConfig.aspectRatioPreset === ar.id
                              ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                              : 'bg-[#121418] text-[#9CA3AF] border-white/10 hover:text-[#F4F4F6]'
                          }`}
                        >
                          {ar.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Privacy Blur / Pixelate Zone */}
                  <div className="bg-[#0B0C0E] border border-white/10 rounded-lg p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-semibold text-[#F4F4F6] cursor-pointer">
                        <EyeOff className="w-3.5 h-3.5 text-[#F97316]" />
                        <span>سانسور و تار کردن ناحیه‌ای (Privacy Blur)</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={videoConfig.privacyZone.enabled}
                        onChange={(e) =>
                          setVideoConfig((prev) => ({
                            ...prev,
                            privacyZone: {
                              ...prev.privacyZone,
                              enabled: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 accent-[#F97316]"
                      />
                    </div>

                    {videoConfig.privacyZone.enabled && (
                      <div className="space-y-2.5 pt-2 border-t border-white/10">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setVideoConfig((prev) => ({
                                ...prev,
                                privacyZone: {
                                  ...prev.privacyZone,
                                  mode: 'blur',
                                },
                              }))
                            }
                            className={`py-1.5 text-xs rounded border cursor-pointer ${
                              videoConfig.privacyZone.mode === 'blur'
                                ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-semibold'
                                : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                            }`}
                          >
                            تار کردن نرم (Blur)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setVideoConfig((prev) => ({
                                ...prev,
                                privacyZone: {
                                  ...prev.privacyZone,
                                  mode: 'pixelate',
                                },
                              }))
                            }
                            className={`py-1.5 text-xs rounded border cursor-pointer ${
                              videoConfig.privacyZone.mode === 'pixelate'
                                ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-semibold'
                                : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                            }`}
                          >
                            شطرنجی (Pixelate)
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                          <div>
                            <div className="flex justify-between text-[#9CA3AF]">
                              <span>افقی (X)</span>
                              <span className="font-mono tabular-nums">
                                {videoConfig.privacyZone.xPct}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={80}
                              value={videoConfig.privacyZone.xPct}
                              onChange={(e) =>
                                setVideoConfig((prev) => ({
                                  ...prev,
                                  privacyZone: {
                                    ...prev.privacyZone,
                                    xPct: Number(e.target.value),
                                  },
                                }))
                              }
                              className="w-full accent-[#F97316]"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[#9CA3AF]">
                              <span>عمودی (Y)</span>
                              <span className="font-mono tabular-nums">
                                {videoConfig.privacyZone.yPct}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={80}
                              value={videoConfig.privacyZone.yPct}
                              onChange={(e) =>
                                setVideoConfig((prev) => ({
                                  ...prev,
                                  privacyZone: {
                                    ...prev.privacyZone,
                                    yPct: Number(e.target.value),
                                  },
                                }))
                              }
                              className="w-full accent-[#F97316]"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Resolution & Bitrate */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs text-[#9CA3AF]">
                        رزولوشن خروجی
                      </label>
                      <select
                        value={videoConfig.targetHeight}
                        onChange={(e) =>
                          setVideoConfig((prev) => ({
                            ...prev,
                            targetHeight: Number(
                              e.target.value
                            ) as VideoProcessConfig['targetHeight'],
                          }))
                        }
                        className="w-full bg-[#0B0C0E] border border-white/15 rounded-lg px-3 py-2 text-xs text-[#F4F4F6] font-mono"
                      >
                        <option value={0}>Original (اصلی)</option>
                        <option value={1080}>1080p Full HD</option>
                        <option value={720}>720p HD</option>
                        <option value={480}>480p Compact</option>
                        <option value={360}>360p Light</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs text-[#9CA3AF]">
                        نرخ بیت (Bitrate)
                      </label>
                      <select
                        value={videoConfig.targetBitrateKbps}
                        onChange={(e) =>
                          setVideoConfig((prev) => ({
                            ...prev,
                            targetBitrateKbps: Number(
                              e.target.value
                            ) as VideoProcessConfig['targetBitrateKbps'],
                          }))
                        }
                        className="w-full bg-[#0B0C0E] border border-white/15 rounded-lg px-3 py-2 text-xs text-[#F4F4F6] font-mono"
                      >
                        <option value={500}>500 kbps</option>
                        <option value={1200}>1200 kbps</option>
                        <option value={2500}>2500 kbps</option>
                        <option value={4500}>4500 kbps</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Video Audio Replacer / Dubber Panel (Video #7) */}
              {videoConfig.operation === 'replace-audio' && (
                <div className="bg-[#0B0C0E] border border-[#F97316]/50 rounded-lg p-3.5 space-y-3">
                  <div>
                    <div className="text-xs font-bold text-[#F4F4F6] flex items-center gap-2">
                      <Music className="w-4 h-4 text-[#F97316]" />
                      <span>تعویض کامل باند صوتی ویدیو (Audio Replacer / Dubber)</span>
                    </div>
                    <p className="text-[11px] text-[#9CA3AF] mt-1 leading-relaxed">
                      صدای پیش‌فرض ویدیو برداشته شده و با فایل صوتی، پادکست یا موزیک جدید دلخواه شما جایگزین می‌شود.
                    </p>
                  </div>

                  <input
                    ref={replacementAudioInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setVideoConfig((prev) => ({
                          ...prev,
                          replacementAudioFile: f,
                          replacementAudioName: f.name,
                        }));
                      }
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => replacementAudioInputRef.current?.click()}
                      className="flex-1 py-2 px-3 bg-[#191C22] hover:bg-white/15 text-[#F4F4F6] border border-[#F97316]/50 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#F97316]" />
                      <span>انتخاب فایل صوتی جدید از حافظه</span>
                    </button>

                    {audioTracks.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const track = audioTracks.find(
                            (t) => t.id === e.target.value
                          );
                          if (track) {
                            setVideoConfig((prev) => ({
                              ...prev,
                              replacementAudioFile: track.file,
                              replacementAudioName: track.name,
                            }));
                          }
                        }}
                        className="bg-[#121418] border border-white/15 rounded-lg px-2.5 py-2 text-xs text-[#E5E7EB]"
                      >
                        <option value="">انتخاب از استودیوی صدا...</option>
                        {audioTracks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.duration.toFixed(1)}s)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {videoConfig.replacementAudioName && (
                    <div className="p-2.5 bg-[#121418] rounded border border-[#F97316]/40 flex items-center justify-between text-xs">
                      <div className="truncate font-mono text-[11px] text-[#F97316]">
                        صداگذاری جدید: {videoConfig.replacementAudioName}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setVideoConfig((prev) => ({
                            ...prev,
                            replacementAudioFile: null,
                            replacementAudioName: '',
                          }))
                        }
                        className="text-[#9CA3AF] hover:text-red-400 p-1 cursor-pointer"
                        title="حذف فایل صوتی انتخابی"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="space-y-1 pt-1 border-t border-white/10">
                    <div className="flex items-center justify-between text-[11px] text-[#9CA3AF]">
                      <span>بلندی صدای فایل صوتی جایگزین</span>
                      <span className="font-mono tabular-nums text-[#F97316]">
                        {Math.round(
                          (videoConfig.replacementAudioGain ?? 1.0) * 100
                        )}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={2.0}
                      step={0.05}
                      value={videoConfig.replacementAudioGain ?? 1.0}
                      onChange={(e) =>
                        setVideoConfig((prev) => ({
                          ...prev,
                          replacementAudioGain: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-[#F97316] cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Video Motion & Jitter Smoother (Video #10) */}
              <div className="bg-[#0B0C0E] border border-white/10 rounded-lg p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F4F4F6]">
                    <Zap className="w-3.5 h-3.5 text-[#F97316]" />
                    <span>لرزش‌گیر و پایدارساز نرم ویدیو (Motion Smoother)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={videoConfig.motionStabilization.enabled}
                    onChange={(e) =>
                      setVideoConfig((prev) => ({
                        ...prev,
                        motionStabilization: {
                          ...prev.motionStabilization,
                          enabled: e.target.checked,
                        },
                      }))
                    }
                    className="w-4 h-4 accent-[#F97316] cursor-pointer"
                  />
                </div>

                {videoConfig.motionStabilization.enabled && (
                  <div className="space-y-2 pt-1 border-t border-white/10">
                    <div className="flex items-center justify-between text-[11px] text-[#9CA3AF]">
                      <span>شدت پایدارسازی لرزش دست</span>
                      <span className="font-mono tabular-nums text-[#F97316]">
                        {videoConfig.motionStabilization.strength}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={videoConfig.motionStabilization.strength}
                      onChange={(e) =>
                        setVideoConfig((prev) => ({
                          ...prev,
                          motionStabilization: {
                            ...prev.motionStabilization,
                            strength: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full accent-[#F97316] cursor-pointer"
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleRunVideoProcess}
                disabled={isProcessing}
                className="min-h-[46px] w-full py-3 px-5 bg-[#F97316] hover:bg-[#FB923C] text-[#0B0C0E] font-bold text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Cpu className="w-4 h-4" />
                <span>
                  {videoConfig.operation === 'merge-videos'
                    ? `اتصال پیوسته ${
                        videoList.length || 2
                      } ویدیو و تولید فایل یکپارچه`
                    : videoConfig.operation === 'video-to-gif'
                    ? `ساخت تصویر متحرک GIF (${videoConfig.gifFps}fps)`
                    : videoConfig.operation === 'extract-frames-zip'
                    ? `استخراج ${videoConfig.frameExtractCount} فریم + شیت استوری‌بورد (ZIP)`
                    : videoConfig.operation === 'boomerang-reverse'
                    ? 'تولید ویدیوی بومرنگ / معکوس'
                    : videoBatchAll && videoList.length > 1
                    ? `اجرای دسته‌ای روی تمام ${videoList.length} ویدیو`
                    : videoConfig.operation === 'extract-audio'
                    ? 'شروع جداسازی صدا و استخراج فوری'
                    : 'اجرای پردازش محلی و تولید فایل ویدیو'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 2: AUDIO & VOICE LAB
           =================================================================== */}
        {activeTab === 'audio' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            <div className="lg:col-span-7 bg-[#121418] border border-white/10 rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 bg-[#0B0C0E] p-1 rounded-lg border border-white/10 overflow-x-auto max-w-full">
                  <button
                    type="button"
                    onClick={() => setAudioMode('denoise-convert')}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      audioMode === 'denoise-convert'
                        ? 'bg-[#F97316] text-[#0B0C0E]'
                        : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
                    }`}
                  >
                    حذف نویز و افکت
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudioMode('merge-voices')}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      audioMode === 'merge-voices'
                        ? 'bg-[#F97316] text-[#0B0C0E]'
                        : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
                    }`}
                  >
                    ادغام چند ویس ({audioTracks.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudioMode('audiogram-video')}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      audioMode === 'audiogram-video'
                        ? 'bg-[#F97316] text-[#0B0C0E]'
                        : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
                    }`}
                  >
                    ویدیوی موج صوتی (Audiogram)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudioMode('live-recorder')}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                      audioMode === 'live-recorder'
                        ? 'bg-[#F97316] text-[#0B0C0E]'
                        : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>ضبط استودیویی</span>
                  </button>
                </div>

                <div>
                  <input
                    ref={audioInputRef}
                    type="file"
                    multiple
                    accept="audio/*,video/*"
                    onChange={(e) => {
                      handleUniversalFiles(e.target.files);
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => audioInputRef.current?.click()}
                    className="min-h-[40px] px-3.5 py-2 text-xs font-medium bg-[#191C22] hover:bg-white/10 text-[#F4F4F6] border border-white/10 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 text-[#F97316]" />
                    <span>افزودن چند ویس</span>
                  </button>
                </div>
              </div>

              {audioMode === 'audiogram-video' && (
                <div className="bg-[#0B0C0E] border border-[#F97316]/40 rounded-xl p-4 sm:p-5 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-[#F4F4F6]">
                        تولید ویدیوی موج صوتی پادکست (Audiogram Spectrum Video #11)
                      </h3>
                      <p className="text-xs text-[#9CA3AF] mt-0.5">
                        تبدیل فایل صوتی به ویدیوی گرافیکی ۳۰ فریم بر ثانیه با رقص نور طیف فرکانسی برای ریلز، استوری و یوتیوب
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div>
                      <label className="block text-[11px] text-[#9CA3AF] mb-1">
                        نسبت تصویر ویدیو
                      </label>
                      <select
                        value={audiogramConfig.aspectRatio}
                        onChange={(e) =>
                          setAudiogramConfig((prev) => ({
                            ...prev,
                            aspectRatio: e.target
                              .value as AudiogramConfig['aspectRatio'],
                          }))
                        }
                        className="w-full bg-[#121418] border border-white/15 rounded-lg px-2.5 py-2 text-xs text-[#F4F4F6]"
                      >
                        <option value="9:16">9:16 (عمودی استوری / ریلز)</option>
                        <option value="1:1">1:1 (مربعی پست اینستاگرام)</option>
                        <option value="16:9">16:9 (افقی یوتیوب / وب)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#9CA3AF] mb-1">
                        تیتر اصلی روی ویدیو
                      </label>
                      <input
                        type="text"
                        value={audiogramConfig.titleText}
                        onChange={(e) =>
                          setAudiogramConfig((prev) => ({
                            ...prev,
                            titleText: e.target.value,
                          }))
                        }
                        className="w-full bg-[#121418] border border-white/15 rounded-lg px-2.5 py-2 text-xs text-[#F4F4F6]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#9CA3AF] mb-1">
                        زیرعنوان / نام گوینده
                      </label>
                      <input
                        type="text"
                        value={audiogramConfig.subtitleText}
                        onChange={(e) =>
                          setAudiogramConfig((prev) => ({
                            ...prev,
                            subtitleText: e.target.value,
                          }))
                        }
                        className="w-full bg-[#121418] border border-white/15 rounded-lg px-2.5 py-2 text-xs text-[#F4F4F6]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {audioMode === 'live-recorder' && (
                <div className="bg-[#0B0C0E] border border-[#F97316]/40 rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-[#F4F4F6]">
                        ضبط‌کننده صدای استودیویی با مانیتورینگ زنده
                      </h3>
                      <p className="text-xs text-[#9CA3AF] mt-0.5">
                        ضبط مستقیم از میکروفون و ارسال خودکار به لیست تراک‌های صوتی
                      </p>
                    </div>
                    <span className="font-mono tabular-nums text-lg font-bold text-[#F97316]">
                      {formatTimecode(recordingSeconds)}
                    </span>
                  </div>

                  <div
                    dir="ltr"
                    className="h-20 bg-[#121418] border border-white/10 rounded-lg px-3 flex items-end justify-between gap-1 py-2"
                  >
                    {liveSpectrumBars.map((val, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-[#F97316] rounded-t transition-transform duration-75"
                        style={{ height: `${Math.max(8, val)}%` }}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    {!isRecordingMic ? (
                      <button
                        type="button"
                        onClick={startLiveRecording}
                        className="min-h-[44px] px-5 py-2.5 text-xs font-bold bg-[#F97316] hover:bg-[#FB923C] text-[#0B0C0E] rounded-lg flex items-center gap-2 cursor-pointer"
                      >
                        <Mic className="w-4 h-4" />
                        <span>شروع ضبط از میکروفون</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={stopLiveRecording}
                        className="min-h-[44px] px-5 py-2.5 text-xs font-bold bg-red-500 hover:bg-red-400 text-white rounded-lg flex items-center gap-2 cursor-pointer"
                      >
                        <Square className="w-4 h-4" />
                        <span>توقف ضبط و انتقال به لیست</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {selectedAudioTrack && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-[#E5E7EB]">
                      <span className="font-semibold truncate max-w-[180px] sm:max-w-none">
                        {selectedAudioTrack.name}
                      </span>
                      <span className="text-[#9CA3AF]">·</span>
                      <span className="font-mono tabular-nums text-[#9CA3AF]">
                        {selectedAudioTrack.duration.toFixed(2)}s
                      </span>
                      {processedDuration !== null && (
                        <>
                          <span className="text-[#9CA3AF]">←</span>
                          <span className="font-mono tabular-nums text-[#F97316] font-semibold">
                            {processedDuration.toFixed(2)}s
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-3 font-mono tabular-nums text-xs">
                      <span className="text-[#9CA3AF]">
                        ورودی: {selectedAudioTrack.rmsDb.toFixed(1)} dB
                      </span>
                      {processedRmsDb !== null && (
                        <span className="text-[#F97316]">
                          خروجی: {processedRmsDb.toFixed(1)} dB
                        </span>
                      )}
                    </div>
                  </div>

                  <WaveformCanvas
                    peaks={
                      processedPreviewPeaks
                        ? processedPreviewPeaks
                        : selectedAudioTrack.peaks
                    }
                    duration={processedDuration || selectedAudioTrack.duration}
                    currentTime={audioCurrentTime}
                    trimStart={audioExportConfig.trimStartSec}
                    trimEnd={
                      audioExportConfig.trimEndSec ||
                      selectedAudioTrack.duration
                    }
                    noiseGateDb={nrConfig.noiseGateThresholdDb}
                    showNoiseFloor={nrConfig.enabled}
                    onSeek={(sec) => setAudioCurrentTime(sec)}
                  />

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleToggleAudioPreview('processed')}
                      className="min-h-[40px] px-4 py-2 text-xs font-semibold bg-[#F97316] text-[#0B0C0E] rounded-lg hover:bg-[#FB923C] transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {audioPlaying && audioPreviewMode === 'processed' ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      <span>پخش با اعمال DSP و حذف نویز (A)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleAudioPreview('original')}
                      className="min-h-[40px] px-3.5 py-2 text-xs font-medium bg-[#0B0C0E] hover:bg-white/10 text-[#E5E7EB] border border-white/15 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {audioPlaying && audioPreviewMode === 'original' ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      <span>پخش صدای خام اولیه (B)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Multi-Track Voice List */}
              <div className="space-y-3 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#E5E7EB]">
                    لیست فایل‌های صوتی بارگذاری‌شده ({audioTracks.length})
                  </h3>
                  <span className="text-xs text-[#9CA3AF] font-mono tabular-nums">
                    Web Worker Ready
                  </span>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {audioTracks.map((track, idx) => {
                    const isSelected = selectedAudioTrack?.id === track.id;
                    return (
                      <div
                        key={track.id}
                        onClick={() => {
                          setSelectedAudioId(track.id);
                          setAudioExportConfig((prev) => ({
                            ...prev,
                            trimStartSec: 0,
                            trimEndSec: Number(track.duration.toFixed(2)),
                          }));
                        }}
                        className={`p-3 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#191C22] border-[#F97316]'
                            : 'bg-[#0B0C0E] border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-mono tabular-nums text-[#F97316] font-bold shrink-0">
                            0{idx + 1}
                          </span>
                          <div className="truncate">
                            <div className="text-xs font-semibold text-[#F4F4F6] truncate">
                              {track.name}
                            </div>
                            <div className="text-[11px] text-[#9CA3AF] font-mono tabular-nums">
                              {track.duration.toFixed(2)}s · {track.sampleRate}
                              Hz · {formatBytes(track.sizeBytes)}
                            </div>
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => moveAudioTrack(idx, -1)}
                            disabled={idx === 0}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center bg-[#121418] hover:bg-white/10 rounded border border-white/10 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveAudioTrack(idx, 1)}
                            disabled={idx === audioTracks.length - 1}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center bg-[#121418] hover:bg-white/10 rounded border border-white/10 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setAudioTracks((prev) =>
                                prev.filter((item) => item.id !== track.id)
                              )
                            }
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center bg-[#121418] hover:bg-red-500/20 text-[#9CA3AF] hover:text-red-400 rounded border border-white/10 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Master Audio DSP Rack (5 cols) */}
            <div className="lg:col-span-5 bg-[#121418] border border-white/10 rounded-xl p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[#F4F4F6]">
                  رک مهندسی صدا، جداسازی وکال و مسترینگ
                </h3>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <span className="text-[#9CA3AF]">حذف نویز</span>
                  <input
                    type="checkbox"
                    checked={nrConfig.enabled}
                    onChange={(e) =>
                      setNrConfig((prev) => ({
                        ...prev,
                        enabled: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-[#F97316]"
                  />
                </label>
              </div>

              {audioMode !== 'merge-voices' && audioTracks.length > 1 && (
                <label className="flex items-center justify-between p-3 bg-[#0B0C0E] border border-white/15 rounded-lg cursor-pointer text-xs">
                  <span className="text-[#E5E7EB]">
                    اعمال دسته‌ای روی تمام {audioTracks.length} فایل صوتی لیست
                  </span>
                  <input
                    type="checkbox"
                    checked={audioBatchAll}
                    onChange={(e) => setAudioBatchAll(e.target.checked)}
                    className="w-4 h-4 accent-[#F97316]"
                  />
                </label>
              )}

              <div className="space-y-3.5 max-h-[520px] overflow-y-auto pr-1">
                {/* FEATURE #7: VOCAL REMOVER / KARAOKE & VOCAL ISOLATOR */}
                <div className="bg-[#0B0C0E] p-3.5 rounded-lg border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#F4F4F6]">
                      جداسازی وکال از موزیک و کارائوکه ساز (#7 Vocal & Karaoke)
                    </span>
                    <span className="text-[10px] font-mono text-[#F97316]">
                      Mid/Side DSP
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'off', label: 'عادی (استریو کامل)' },
                        { id: 'karaoke-no-vocal', label: 'حذف خواننده (بیکلام)' },
                        { id: 'vocal-isolate', label: 'فقط صدای خواننده' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setNrConfig((prev) => ({
                            ...prev,
                            vocalSeparatorMode: m.id,
                          }))
                        }
                        className={`min-h-[34px] py-1.5 px-2 text-[11px] rounded border cursor-pointer ${
                          nrConfig.vocalSeparatorMode === m.id
                            ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                            : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* FEATURE #8: 8D SPATIAL AUDIO & BINAURAL ROOM WIDENER */}
                <div className="bg-[#0B0C0E] p-3.5 rounded-lg border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-[#F4F4F6]">
                        تبدیل به صدای ۸ بعدی فضایی (#8 8D Spatial Audio)
                      </div>
                      <div className="text-[11px] text-[#9CA3AF]">
                        چرخش سه‌بعدی صدا دور سر شنونده با تاخیر باینورال Haas
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={nrConfig.spatial8D.enabled}
                      onChange={(e) =>
                        setNrConfig((prev) => ({
                          ...prev,
                          spatial8D: {
                            ...prev.spatial8D,
                            enabled: e.target.checked,
                          },
                        }))
                      }
                      className="w-4 h-4 accent-[#F97316]"
                    />
                  </div>
                  {nrConfig.spatial8D.enabled && (
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10 text-[11px]">
                      <div>
                        <div className="flex justify-between text-[#9CA3AF]">
                          <span>سرعت چرخش 8D</span>
                          <span className="font-mono text-[#F97316]">
                            {nrConfig.spatial8D.rotationHz} Hz
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.05}
                          max={0.5}
                          step={0.05}
                          value={nrConfig.spatial8D.rotationHz}
                          onChange={(e) =>
                            setNrConfig((prev) => ({
                              ...prev,
                              spatial8D: {
                                ...prev.spatial8D,
                                rotationHz: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-full accent-[#F97316]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[#9CA3AF]">
                          <span>وسعت اتاق</span>
                          <span className="font-mono">
                            {nrConfig.spatial8D.roomWidthPct}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={100}
                          value={nrConfig.spatial8D.roomWidthPct}
                          onChange={(e) =>
                            setNrConfig((prev) => ({
                              ...prev,
                              spatial8D: {
                                ...prev.spatial8D,
                                roomWidthPct: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-full accent-[#F97316]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* FEATURE #9: CHARACTER VOICE CHANGER & FORMANT MORPHING */}
                <div className="bg-[#0B0C0E] p-3.5 rounded-lg border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#F4F4F6]">
                      تغییر کاراکتر صدا و افکت سینمایی (#9 Voice Changer)
                    </span>
                    <span className="text-[10px] font-mono text-[#9CA3AF]">
                      Formant DSP
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'normal', label: 'صدای طبیعی' },
                        { id: 'robot', label: 'رباتیک سایبری' },
                        { id: 'anonymous-deep', label: 'ناشناس امنیتی' },
                        { id: 'helium', label: 'هلیومی فانتزی' },
                        { id: 'radio-walkie', label: 'بی‌سیم پلیسی' },
                        { id: 'giant-sub', label: 'غول‌آسا / بم' },
                      ] as const
                    ).map((vp) => (
                      <button
                        key={vp.id}
                        type="button"
                        onClick={() =>
                          setNrConfig((prev) => ({
                            ...prev,
                            voiceMorphPreset: vp.id,
                          }))
                        }
                        className={`min-h-[32px] py-1 px-1.5 text-[11px] rounded border cursor-pointer ${
                          nrConfig.voiceMorphPreset === vp.id
                            ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                            : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                        }`}
                      >
                        {vp.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* FEATURE #10: BROADCAST LUFS NORMALIZER + DE-ESSER + BRICKWALL LIMITER */}
                <div className="bg-[#0B0C0E] p-3.5 rounded-lg border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-[#F4F4F6]">
                        استانداردسازی بلندی صدا (#10 LUFS Mastering & De-Esser)
                      </div>
                      <div className="text-[11px] text-[#9CA3AF]">
                        نرمال‌سازی دقیق پادکست و یوتیوب + حذف صدای تیز سوت حروف (س/ش)
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={nrConfig.lufsNormalization.enabled}
                      onChange={(e) =>
                        setNrConfig((prev) => ({
                          ...prev,
                          lufsNormalization: {
                            ...prev.lufsNormalization,
                            enabled: e.target.checked,
                          },
                        }))
                      }
                      className="w-4 h-4 accent-[#F97316]"
                    />
                  </div>
                  {nrConfig.lufsNormalization.enabled && (
                    <div className="space-y-2.5 pt-2 border-t border-white/10 text-xs">
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { val: -14, label: '-14 LUFS (YouTube/Spotify)' },
                            { val: -16, label: '-16 LUFS (Apple Podcast)' },
                            { val: -23, label: '-23 LUFS (EBU Broadcast)' },
                          ] as const
                        ).map((lu) => (
                          <button
                            key={lu.val}
                            type="button"
                            onClick={() =>
                              setNrConfig((prev) => ({
                                ...prev,
                                lufsNormalization: {
                                  ...prev.lufsNormalization,
                                  targetLufs: lu.val,
                                },
                              }))
                            }
                            className={`py-1.5 px-1.5 text-[10px] font-mono rounded border cursor-pointer ${
                              nrConfig.lufsNormalization.targetLufs === lu.val
                                ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                                : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                            }`}
                          >
                            {lu.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-3 text-[11px]">
                        <label className="flex items-center gap-1.5 cursor-pointer text-[#E5E7EB]">
                          <input
                            type="checkbox"
                            checked={nrConfig.lufsNormalization.deEsserEnabled}
                            onChange={(e) =>
                              setNrConfig((prev) => ({
                                ...prev,
                                lufsNormalization: {
                                  ...prev.lufsNormalization,
                                  deEsserEnabled: e.target.checked,
                                },
                              }))
                            }
                            className="w-3.5 h-3.5 accent-[#F97316]"
                          />
                          <span>حذف تیزی سوت حروف (De-Esser)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer text-[#E5E7EB]">
                          <input
                            type="checkbox"
                            checked={nrConfig.lufsNormalization.truePeakLimiter}
                            onChange={(e) =>
                              setNrConfig((prev) => ({
                                ...prev,
                                lufsNormalization: {
                                  ...prev.lufsNormalization,
                                  truePeakLimiter: e.target.checked,
                                },
                              }))
                            }
                            className="w-3.5 h-3.5 accent-[#F97316]"
                          />
                          <span>محافظ کلیپینگ (-0.3dB True-Peak)</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Smart Silence Trimmer */}
                <div className="bg-[#0B0C0E] p-3.5 rounded-lg border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-[#F4F4F6]">
                        حذف خودکار سکوت‌های طولانی (Smart Silence Trimmer)
                      </div>
                      <div className="text-[11px] text-[#9CA3AF]">
                        کوتاه کردن مکث‌های بیش از حد بین جملات بدون بریدگی صدا
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={nrConfig.silenceTrimmer.enabled}
                      onChange={(e) =>
                        setNrConfig((prev) => ({
                          ...prev,
                          silenceTrimmer: {
                            ...prev.silenceTrimmer,
                            enabled: e.target.checked,
                          },
                        }))
                      }
                      className="w-4 h-4 accent-[#F97316]"
                    />
                  </div>

                  {nrConfig.silenceTrimmer.enabled && (
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10 text-[11px]">
                      <div>
                        <div className="flex justify-between text-[#9CA3AF]">
                          <span>آستانه سکوت</span>
                          <span className="font-mono tabular-nums text-[#F97316]">
                            {nrConfig.silenceTrimmer.thresholdDb} dB
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-55}
                          max={-20}
                          value={nrConfig.silenceTrimmer.thresholdDb}
                          onChange={(e) =>
                            setNrConfig((prev) => ({
                              ...prev,
                              silenceTrimmer: {
                                ...prev.silenceTrimmer,
                                thresholdDb: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-full accent-[#F97316]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[#9CA3AF]">
                          <span>حداقل مکث</span>
                          <span className="font-mono tabular-nums">
                            {nrConfig.silenceTrimmer.minSilenceDurationSec}s
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.15}
                          max={1.0}
                          step={0.05}
                          value={nrConfig.silenceTrimmer.minSilenceDurationSec}
                          onChange={(e) =>
                            setNrConfig((prev) => ({
                              ...prev,
                              silenceTrimmer: {
                                ...prev.silenceTrimmer,
                                minSilenceDurationSec: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-full accent-[#F97316]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 5-Band Visual Parametric EQ */}
                <div className="bg-[#0B0C0E] p-3.5 rounded-lg border border-white/10 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#F4F4F6]">
                      اکولایزر ۵ بانده (5-Band EQ)
                    </span>
                    <div className="flex items-center gap-1 overflow-x-auto">
                      {(
                        [
                          { id: 'podcast', label: 'Podcast' },
                          { id: 'warm-voice', label: 'Warm' },
                          { id: 'bass-boost', label: 'Bass' },
                          { id: 'telephone', label: 'Radio' },
                          { id: 'flat', label: 'Flat' },
                        ] as const
                      ).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            setNrConfig((prev) => ({
                              ...prev,
                              eqPreset: preset.id,
                              eqBands: { ...EQ_PRESETS[preset.id] },
                            }))
                          }
                          className={`px-2 py-1 text-[10px] font-mono rounded border cursor-pointer ${
                            nrConfig.eqPreset === preset.id
                              ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                              : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-1.5 text-center">
                    {(
                      [
                        { key: 'band80Hz', label: '80Hz' },
                        { key: 'band250Hz', label: '250Hz' },
                        { key: 'band1000Hz', label: '1kHz' },
                        { key: 'band2800Hz', label: '2.8k' },
                        { key: 'band8000Hz', label: '8kHz' },
                      ] as const
                    ).map((b) => {
                      const val = nrConfig.eqBands[b.key];
                      return (
                        <div
                          key={b.key}
                          className="bg-[#121418] p-2 rounded border border-white/10 flex flex-col items-center gap-1"
                        >
                          <span className="text-[10px] font-mono tabular-nums text-[#F97316]">
                            {val > 0 ? `+${val}` : val}
                          </span>
                          <input
                            type="range"
                            min={-12}
                            max={12}
                            step={0.5}
                            value={val}
                            onChange={(e) =>
                              setNrConfig((prev) => ({
                                ...prev,
                                eqBands: {
                                  ...prev.eqBands,
                                  [b.key]: Number(e.target.value),
                                },
                              }))
                            }
                            className="w-full accent-[#F97316]"
                          />
                          <span className="text-[10px] font-mono text-[#9CA3AF]">
                            {b.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Pitch Shifter & Studio Reverb */}
                <div className="bg-[#0B0C0E] p-3.5 rounded-lg border border-white/10 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#F4F4F6]">
                      تغییر تن صدا (Pitch) و فضای استودیو (Reverb)
                    </span>
                    <span className="font-mono tabular-nums text-[#F97316]">
                      {nrConfig.pitchSemitones > 0
                        ? `+${nrConfig.pitchSemitones}`
                        : nrConfig.pitchSemitones}{' '}
                      st
                    </span>
                  </div>

                  <input
                    type="range"
                    min={-6}
                    max={6}
                    step={1}
                    value={nrConfig.pitchSemitones}
                    onChange={(e) =>
                      setNrConfig((prev) => ({
                        ...prev,
                        pitchSemitones: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-[#F97316]"
                  />

                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'off', label: 'بدون افکت' },
                        { id: 'booth', label: 'نریشن' },
                        { id: 'warm-room', label: 'اتاق گرم' },
                        { id: 'concert-hall', label: 'سالن' },
                      ] as const
                    ).map((rev) => (
                      <button
                        key={rev.id}
                        type="button"
                        onClick={() =>
                          setNrConfig((prev) => ({
                            ...prev,
                            reverbPreset: rev.id,
                          }))
                        }
                        className={`min-h-[34px] py-1.5 text-[11px] rounded border cursor-pointer ${
                          nrConfig.reverbPreset === rev.id
                            ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                            : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                        }`}
                      >
                        {rev.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Auto-Ducking Background Music Mixer */}
                <div className="bg-[#0B0C0E] p-3.5 rounded-lg border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5 text-[#F97316]" />
                      <div>
                        <div className="text-xs font-semibold text-[#F4F4F6]">
                          میکس هوشمند موسیقی پس‌زمینه (Auto-Ducking)
                        </div>
                        <div className="text-[11px] text-[#9CA3AF]">
                          کاهش خودکار صدای موزیک حین صحبت گوینده
                        </div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={nrConfig.autoDucking.enabled}
                      onChange={(e) =>
                        setNrConfig((prev) => ({
                          ...prev,
                          autoDucking: {
                            ...prev.autoDucking,
                            enabled: e.target.checked,
                          },
                        }))
                      }
                      className="w-4 h-4 accent-[#F97316]"
                    />
                  </div>

                  {nrConfig.autoDucking.enabled && (
                    <div className="flex items-center justify-between text-[11px] pt-2 border-t border-white/10">
                      <span className="text-[#9CA3AF] truncate max-w-[180px]">
                        منبع:{' '}
                        <strong className="text-[#F4F4F6]">
                          {customBgMusicName || 'پد امبینت استودیویی داخلی'}
                        </strong>
                      </span>
                      <input
                        ref={bgMusicInputRef}
                        type="file"
                        accept="audio/*"
                        onChange={(e) =>
                          handleCustomBgMusicUpload(e.target.files)
                        }
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => bgMusicInputRef.current?.click()}
                        className="text-[#F97316] hover:underline cursor-pointer shrink-0"
                      >
                        انتخاب موزیک دلخواه
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
                <select
                  value={audioExportConfig.format}
                  onChange={(e) =>
                    setAudioExportConfig((prev) => ({
                      ...prev,
                      format: e.target.value as AudioExportConfig['format'],
                    }))
                  }
                  className="bg-[#0B0C0E] border border-white/15 rounded-lg px-3 py-2 text-xs text-[#F4F4F6] font-mono"
                >
                  <option value="wav-16">WAV 16-Bit</option>
                  <option value="wav-8-compact">WAV 8-Bit Compact</option>
                  <option value="webm-opus">WebM Opus</option>
                </select>

                <select
                  value={audioExportConfig.sampleRate}
                  onChange={(e) =>
                    setAudioExportConfig((prev) => ({
                      ...prev,
                      sampleRate: Number(
                        e.target.value
                      ) as AudioExportConfig['sampleRate'],
                    }))
                  }
                  className="bg-[#0B0C0E] border border-white/15 rounded-lg px-3 py-2 text-xs text-[#F4F4F6] font-mono"
                >
                  <option value={48000}>48,000 Hz</option>
                  <option value={44100}>44,100 Hz</option>
                  <option value={22050}>22,050 Hz</option>
                  <option value={16000}>16,000 Hz</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleRunAudioProcess}
                disabled={isProcessing || audioTracks.length === 0}
                className="min-h-[46px] w-full py-3 px-5 bg-[#F97316] hover:bg-[#FB923C] text-[#0B0C0E] font-bold text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Layers className="w-4 h-4" />
                <span>
                  {audioMode === 'audiogram-video'
                    ? `ساخت ویدیوی موج صوتی (${audiogramConfig.aspectRatio})`
                    : audioMode === 'merge-voices'
                    ? `ادغام ${audioTracks.length} ویس و اعمال زنجیره مسترینگ`
                    : audioBatchAll && audioTracks.length > 1
                    ? `پردازش دسته‌ای تمام ${audioTracks.length} فایل صوتی`
                    : 'اجرای مسترینگ، جداسازی وکال و تولید فایل صوتی'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 3: PDF DOCUMENT SUITE
           =================================================================== */}
        {activeTab === 'pdf' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            <div className="lg:col-span-7 bg-[#121418] border border-white/10 rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 bg-[#0B0C0E] p-1 rounded-lg border border-white/10 overflow-x-auto max-w-full">
                  <button
                    type="button"
                    onClick={() => setPdfToolMode('merge-compress')}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      pdfToolMode === 'merge-compress'
                        ? 'bg-[#F97316] text-[#0B0C0E]'
                        : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
                    }`}
                  >
                    ادغام و فشرده‌سازی
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfToolMode('sign-redact')}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      pdfToolMode === 'sign-redact'
                        ? 'bg-[#F97316] text-[#0B0C0E]'
                        : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
                    }`}
                  >
                    امضا و سانسور (#20)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfToolMode('security-shield')}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      pdfToolMode === 'security-shield'
                        ? 'bg-[#F97316] text-[#0B0C0E]'
                        : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
                    }`}
                  >
                    واترمارک و تم (#21)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfToolMode('split-ranges')}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      pdfToolMode === 'split-ranges'
                        ? 'bg-[#F97316] text-[#0B0C0E]'
                        : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
                    }`}
                  >
                    تفکیک بازه‌ای (Splitter)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfToolMode('extract-images')}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      pdfToolMode === 'extract-images'
                        ? 'bg-[#F97316] text-[#0B0C0E]'
                        : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
                    }`}
                  >
                    استخراج عکس‌های PDF (ZIP)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfToolMode('compress-images')}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      pdfToolMode === 'compress-images'
                        ? 'bg-[#F97316] text-[#0B0C0E]'
                        : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
                    }`}
                  >
                    بهینه‌ساز عکس و حذف EXIF
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfToolMode('pdf-images')}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      pdfToolMode === 'pdf-images'
                        ? 'bg-[#F97316] text-[#0B0C0E]'
                        : 'text-[#9CA3AF] hover:text-[#F4F4F6]'
                    }`}
                  >
                    تبدیل عکس ⇄ PDF
                  </button>
                </div>

                <div>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    multiple
                    accept=".pdf,application/pdf"
                    onChange={(e) => {
                      handleUniversalFiles(e.target.files);
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    className="min-h-[40px] px-3.5 py-2 text-xs font-medium bg-[#191C22] hover:bg-white/10 text-[#F4F4F6] border border-white/10 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 text-[#F97316]" />
                    <span>افزودن چند PDF</span>
                  </button>
                </div>
              </div>

              {/* Loaded PDF Documents Strip */}
              {pdfDocs.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[#E5E7EB]">
                    اسناد PDF بارگذاری‌شده ({pdfDocs.length} فایل):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pdfDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="px-3 py-1.5 bg-[#0B0C0E] border border-white/15 rounded-lg flex items-center gap-2 text-xs"
                      >
                        <span className="font-medium text-[#F4F4F6] truncate max-w-[150px] sm:max-w-[200px]">
                          {doc.name}
                        </span>
                        <span className="font-mono tabular-nums text-[#9CA3AF]">
                          ({doc.pageCount}p)
                        </span>
                        <button
                          type="button"
                          onClick={() => removeWholePdfDoc(doc.id)}
                          className="text-[#9CA3AF] hover:text-red-400 cursor-pointer p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Interactive Page Sheet Cards (OPTIMIZATION #11: Viewport Virtualized Windowing) */}
              {pdfPages.length > 24 && (
                <div className="flex items-center justify-between text-xs bg-[#0B0C0E] px-3 py-2 rounded-lg border border-white/10">
                  <span className="text-[#9CA3AF]">
                    مجازی‌سازی نمای صفحات فعال است (نمایش{' '}
                    {showAllPdfPages ? pdfPages.length : 24} از {pdfPages.length}{' '}
                    صفحه برای حفظ ۶۰ فریم)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllPdfPages((prev) => !prev)}
                    className="text-[#F97316] font-semibold cursor-pointer"
                  >
                    {showAllPdfPages ? 'برگشت به نمای مجازی سریع' : 'نمایش تمام صفحات'}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                {(showAllPdfPages ? pdfPages : pdfPages.slice(0, 24)).map(
                  (page, idx) => (
                  <div
                    key={page.id}
                    className={`p-3.5 rounded-lg border transition-colors flex flex-col justify-between gap-3 ${
                      page.included
                        ? 'bg-[#0B0C0E] border-white/15'
                        : 'bg-[#0B0C0E]/40 border-white/5 opacity-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#F4F4F6] truncate">
                          {page.sourceDocName}
                        </div>
                        <div className="text-[11px] text-[#9CA3AF] font-mono tabular-nums mt-0.5">
                          صفحه {page.sourcePageIndex + 1} · {page.width}×
                          {page.height} · چرخش {page.rotationDeg}°
                        </div>
                      </div>
                      <span className="text-xs font-mono tabular-nums text-[#F97316] font-bold">
                        #{idx + 1}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/10">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => movePdfPage(idx, -1)}
                          disabled={idx === 0}
                          className="min-w-[34px] min-h-[34px] flex items-center justify-center bg-[#121418] hover:bg-white/10 rounded border border-white/10 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => movePdfPage(idx, 1)}
                          disabled={idx === pdfPages.length - 1}
                          className="min-w-[34px] min-h-[34px] flex items-center justify-center bg-[#121418] hover:bg-white/10 rounded border border-white/10 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => rotatePdfPage(page.id)}
                          className="min-h-[34px] px-2.5 py-1 text-[11px] bg-[#121418] hover:bg-white/10 rounded border border-white/10 flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCw className="w-3 h-3 text-[#F97316]" />
                          <span>۹۰°</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => togglePdfPageIncluded(page.id)}
                        className={`min-h-[34px] px-2.5 py-1 text-[11px] rounded border cursor-pointer ${
                          page.included
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-red-500/10 border-red-500/30 text-red-300'
                        }`}
                      >
                        {page.included ? 'فعال' : 'حذف‌شده'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Contextual PDF Action Inspector (5 cols) */}
            <div className="lg:col-span-5 bg-[#121418] border border-white/10 rounded-xl p-4 sm:p-6 space-y-6">
              {pdfToolMode === 'merge-compress' && (
                <>
                  <div>
                    <h3 className="text-base font-bold text-[#F4F4F6]">
                      ادغام چند فایل PDF و فشرده‌سازی ساختار
                    </h3>
                    <p className="text-xs text-[#9CA3AF] mt-0.5">
                      ترکیب صفحات انتخابی از {pdfDocs.length} سند با فشرده‌سازی جریان اشیاء
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      {
                        id: 'lossless-stream',
                        title: 'Lossless Object Stream',
                        desc: 'حفظ ۱۰۰٪ ابعاد با فشرده‌سازی جداول XRef',
                      },
                      {
                        id: 'compact-strip',
                        title: 'Compact + Metadata Strip (پیشنهادی)',
                        desc: 'حذف متادیتای اضافی و مقیاس‌دهی بهینه ۹۲٪',
                      },
                      {
                        id: 'archive-scale',
                        title: 'Archive Maximum Compression',
                        desc: 'کاهش ابعاد برداری به ۷۸٪ برای حداقل حجم آرشیوی',
                      },
                    ].map((lvl) => (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() =>
                          setPdfConfig((prev) => ({
                            ...prev,
                            compressionLevel:
                              lvl.id as PdfProcessConfig['compressionLevel'],
                          }))
                        }
                        className={`w-full p-3.5 rounded-lg border text-right transition-colors cursor-pointer flex items-center justify-between ${
                          pdfConfig.compressionLevel === lvl.id
                            ? 'bg-[#191C22] border-[#F97316]'
                            : 'bg-[#0B0C0E] border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-semibold text-[#F4F4F6]">
                            {lvl.title}
                          </div>
                          <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                            {lvl.desc}
                          </div>
                        </div>
                        <div
                          className={`w-3.5 h-3.5 rounded-full border shrink-0 ${
                            pdfConfig.compressionLevel === lvl.id
                              ? 'bg-[#F97316] border-[#F97316]'
                              : 'border-white/30'
                          }`}
                        />
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleRunPdfMergeCompress}
                    disabled={isProcessing || pdfDocs.length === 0}
                    className="min-h-[46px] w-full py-3 px-5 bg-[#F97316] hover:bg-[#FB923C] text-[#0B0C0E] font-bold text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>
                      ادغام و فشرده‌سازی{' '}
                      {pdfPages.filter((p) => p.included).length} صفحه انتخابی
                    </span>
                  </button>
                </>
              )}

              {/* ===================================================================
                  FEATURE #20: PDF DIGITAL SIGNATURE PAD, STAMP & PERMANENT REDACTION
                 =================================================================== */}
              {pdfToolMode === 'sign-redact' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-[#F4F4F6]">
                      امضای دیجیتال زنده، مهر رسمی و سانسور دائمی (#20 Sign & Redact)
                    </h3>
                    <p className="text-xs text-[#9CA3AF] mt-0.5 leading-relaxed">
                      رسم امضای زنده با ماوس یا لمس موبایل، درج مهر تایید رسمی و پوشش سیاه غیرقابل بازگشت (Blackout Redaction) روی اطلاعات حساس قراردادها.
                    </p>
                  </div>

                  <SignaturePadCanvas
                    onSignatureChange={(dataUrl) =>
                      setPdfSignConfig((prev) => ({
                        ...prev,
                        signatureDataUrl: dataUrl,
                      }))
                    }
                  />

                  <div className="bg-[#0B0C0E] p-3.5 rounded-lg border border-white/10 space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          نام و سمت امضاکننده (Latin/EN)
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={pdfSignConfig.signerTitle}
                          onChange={(e) =>
                            setPdfSignConfig((prev) => ({
                              ...prev,
                              signerTitle: e.target.value,
                            }))
                          }
                          className="w-full bg-[#121418] border border-white/15 rounded px-2.5 py-1.5 text-xs font-mono text-[#F4F4F6]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          متن مهر رسمی
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={pdfSignConfig.stampBadgeText}
                          onChange={(e) =>
                            setPdfSignConfig((prev) => ({
                              ...prev,
                              stampBadgeText: e.target.value,
                            }))
                          }
                          className="w-full bg-[#121418] border border-white/15 rounded px-2.5 py-1.5 text-xs font-mono text-[#F4F4F6]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          محل درج امضا در صفحه
                        </label>
                        <select
                          value={pdfSignConfig.position}
                          onChange={(e) =>
                            setPdfSignConfig((prev) => ({
                              ...prev,
                              position: e.target
                                .value as PdfSignAndRedactConfig['position'],
                            }))
                          }
                          className="w-full bg-[#121418] border border-white/15 rounded px-2.5 py-1.5 text-xs text-[#F4F4F6]"
                        >
                          <option value="bottom-right">پایین راست</option>
                          <option value="bottom-left">پایین چپ</option>
                          <option value="center-bottom">پایین وسط</option>
                          <option value="top-right">بالا راست</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          اعمال روی صفحات
                        </label>
                        <select
                          value={pdfSignConfig.targetPages}
                          onChange={(e) =>
                            setPdfSignConfig((prev) => ({
                              ...prev,
                              targetPages: e.target
                                .value as PdfSignAndRedactConfig['targetPages'],
                            }))
                          }
                          className="w-full bg-[#121418] border border-white/15 rounded px-2.5 py-1.5 text-xs text-[#F4F4F6]"
                        >
                          <option value="last-page">فقط صفحه آخر قرارداد</option>
                          <option value="first-page">فقط صفحه اول</option>
                          <option value="all-pages">تمامی صفحات سند</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/10 space-y-2">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="font-semibold text-[#E5E7EB]">
                          فعال‌سازی نوار سانسور دائمی اطلاعات محرمانه (Redaction Bar)
                        </span>
                        <input
                          type="checkbox"
                          checked={pdfSignConfig.redactionEnabled}
                          onChange={(e) =>
                            setPdfSignConfig((prev) => ({
                              ...prev,
                              redactionEnabled: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-[#F97316]"
                        />
                      </label>
                      {pdfSignConfig.redactionEnabled && (
                        <div className="flex items-center justify-between text-[11px] text-[#9CA3AF]">
                          <span>ارتفاع عمودی نوار سانسور از بالای صفحه</span>
                          <input
                            type="range"
                            min={10}
                            max={85}
                            value={pdfSignConfig.redactionYPct}
                            onChange={(e) =>
                              setPdfSignConfig((prev) => ({
                                ...prev,
                                redactionYPct: Number(e.target.value),
                              }))
                            }
                            className="w-32 accent-[#F97316]"
                          />
                          <span className="font-mono text-[#F97316]">
                            {pdfSignConfig.redactionYPct}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunPdfSignAndRedact}
                    disabled={isProcessing || pdfDocs.length === 0}
                    className="min-h-[46px] w-full py-3 px-5 bg-[#F97316] hover:bg-[#FB923C] text-[#0B0C0E] font-bold text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <PenTool className="w-4 h-4" />
                    <span>ثبت دائمی امضا، مهر و سانسور روی سند PDF</span>
                  </button>
                </div>
              )}

              {/* ===================================================================
                  FEATURE #21: PDF ANTI-COPY WATERMARK GRID & READER THEME TINTS
                 =================================================================== */}
              {pdfToolMode === 'security-shield' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-[#F4F4F6]">
                      شبکه واترمارک امنیتی ضدکپی و تم مطالعه (#21 Security & Theme)
                    </h3>
                    <p className="text-xs text-[#9CA3AF] mt-0.5 leading-relaxed">
                      حکاکی شبکه مورب واترمارک امنیتی روی کل صفحات، تبدیل تم رنگی صفحات برای مطالعه در شب (Sepia / Dark / Blueprint) و پاکسازی متادیتای مخفی.
                    </p>
                  </div>

                  <div className="bg-[#0B0C0E] p-4 rounded-lg border border-white/10 space-y-3.5 text-xs">
                    <div>
                      <label className="block text-[11px] text-[#9CA3AF] mb-1">
                        متن واترمارک مورب ضدکپی (Diagonal Security Grid)
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={pdfSecurityConfig.gridWatermarkText}
                        onChange={(e) =>
                          setPdfSecurityConfig((prev) => ({
                            ...prev,
                            gridWatermarkText: e.target.value,
                          }))
                        }
                        placeholder="CONFIDENTIAL · DO NOT DISTRIBUTE"
                        className="w-full bg-[#121418] border border-white/15 rounded-lg px-3 py-2 text-xs font-mono text-[#F4F4F6]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#9CA3AF] mb-1.5">
                        تم رنگی صفحات سند (Reader Comfort / Dark Mode Tint)
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { id: 'original', label: 'اصلی (سفید استاندارد)' },
                            { id: 'warm-sepia', label: 'کاغذ گرم مطالعه (Sepia)' },
                            { id: 'night-dark', label: 'دارک‌مود شبانه (Night Slate)' },
                            { id: 'blueprint-cyber', label: 'مهندسی (Blueprint)' },
                          ] as const
                        ).map((tm) => (
                          <button
                            key={tm.id}
                            type="button"
                            onClick={() =>
                              setPdfSecurityConfig((prev) => ({
                                ...prev,
                                themeTint: tm.id,
                              }))
                            }
                            className={`py-2 px-2.5 text-xs rounded-lg border cursor-pointer ${
                              pdfSecurityConfig.themeTint === tm.id
                                ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                                : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                            }`}
                          >
                            {tm.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-[#E5E7EB]">
                          درج هدر امنیتی و شماره سریال بالای تمامی صفحات
                        </span>
                        <input
                          type="checkbox"
                          checked={pdfSecurityConfig.confidentialHeader}
                          onChange={(e) =>
                            setPdfSecurityConfig((prev) => ({
                              ...prev,
                              confidentialHeader: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-[#F97316]"
                        />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-[#E5E7EB]">
                          حذف کامل متادیتای نویسنده، نرم‌افزار و تاریخچه سند
                        </span>
                        <input
                          type="checkbox"
                          checked={pdfSecurityConfig.stripAllMetadata}
                          onChange={(e) =>
                            setPdfSecurityConfig((prev) => ({
                              ...prev,
                              stripAllMetadata: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-[#F97316]"
                        />
                      </label>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunPdfSecurityShield}
                    disabled={isProcessing || pdfDocs.length === 0}
                    className="min-h-[46px] w-full py-3 px-5 bg-[#F97316] hover:bg-[#FB923C] text-[#0B0C0E] font-bold text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>اعمال شبکه واترمارک امنیتی و تم مطالعه روی PDF</span>
                  </button>
                </div>
              )}

              {pdfToolMode === 'split-ranges' && (
                <>
                  <div>
                    <h3 className="text-base font-bold text-[#F4F4F6]">
                      تفکیک بازه‌ای PDF به چند فایل مجزا (Splitter)
                    </h3>
                    <p className="text-xs text-[#9CA3AF] mt-0.5">
                      تقسیم صفحات به چند فایل PDF مستقل و دانلود یکجا در قالب فایل ZIP
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setSplitRangeMode('custom-ranges')}
                      className={`w-full p-3.5 rounded-lg border text-right cursor-pointer ${
                        splitRangeMode === 'custom-ranges'
                          ? 'bg-[#191C22] border-[#F97316]'
                          : 'bg-[#0B0C0E] border-white/10'
                      }`}
                    >
                      <div className="text-xs font-semibold text-[#F4F4F6]">
                        تفکیک بر اساس بازه‌های دلخواه صفحات
                      </div>
                      <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                        مثال: صفحات ۱ تا ۲ در یک فایل و ۳ تا ۵ در فایلی دیگر
                      </div>
                    </button>

                    {splitRangeMode === 'custom-ranges' && (
                      <div className="space-y-1.5">
                        <label className="block text-xs text-[#E5E7EB]">
                          بازه‌های صفحات (با ویرگول جدا کنید):
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={splitRangeInput}
                          onChange={(e) => setSplitRangeInput(e.target.value)}
                          placeholder="1-2, 3, 4-5"
                          className="w-full bg-[#0B0C0E] border border-[#F97316]/50 rounded-lg px-3 py-2 text-xs text-[#F4F4F6] font-mono"
                        />
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setSplitRangeMode('every-page')}
                      className={`w-full p-3.5 rounded-lg border text-right cursor-pointer ${
                        splitRangeMode === 'every-page'
                          ? 'bg-[#191C22] border-[#F97316]'
                          : 'bg-[#0B0C0E] border-white/10'
                      }`}
                    >
                      <div className="text-xs font-semibold text-[#F4F4F6]">
                        تفکیک تک‌تک صفحات در فایل‌های PDF مجزا
                      </div>
                      <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                        هر صفحه در یک سند PDF جداگانه ذخیره شده و در یک فایل ZIP قرار می‌گیرد
                      </div>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunPdfSplitter}
                    disabled={isProcessing || pdfDocs.length === 0}
                    className="min-h-[46px] w-full py-3 px-5 bg-[#F97316] hover:bg-[#FB923C] text-[#0B0C0E] font-bold text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <FolderArchive className="w-4 h-4" />
                    <span>تفکیک صفحات و ساخت بسته ZIP</span>
                  </button>
                </>
              )}

              {/* ===================================================================
                  FEATURE (PDF #9): EXTRACT EMBEDDED IMAGES TO ZIP
                 =================================================================== */}
              {pdfToolMode === 'extract-images' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-[#F4F4F6]">
                      استخراج تمام عکس‌های درون فایل PDF (Extract Images to ZIP)
                    </h3>
                    <p className="text-xs text-[#9CA3AF] mt-0.5 leading-relaxed">
                      استخراج تمامی تصاویر نهفته و نمودارهای گرافیکی صفحات PDF و دانلود یکجا در قالب فایل ZIP بدون افت کیفیت.
                    </p>
                  </div>

                  <div className="bg-[#0B0C0E] p-4 rounded-lg border border-white/10 space-y-3">
                    <div className="text-xs text-[#E5E7EB]">
                      سند انتخابی برای استخراج تصاویر:
                    </div>
                    {pdfDocs.length > 0 ? (
                      <div className="p-3 bg-[#121418] rounded-lg border border-[#F97316]/40 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-[#F4F4F6]">
                            {pdfDocs[0].name}
                          </div>
                          <div className="text-[11px] text-[#9CA3AF] font-mono tabular-nums">
                            {pdfDocs[0].pageCount} صفحه · {formatBytes(pdfDocs[0].sizeBytes)}
                          </div>
                        </div>
                        <span className="text-xs font-mono text-[#F97316]">
                          {pdfDocs[0].pageCount} Pages
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-[#9CA3AF]">
                        ابتدا یک فایل PDF بارگذاری کنید یا دکمه رسانه نمونه را بزنید.
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleRunExtractEmbeddedImages}
                      disabled={isProcessing || pdfDocs.length === 0}
                      className="min-h-[46px] w-full py-3 px-5 bg-[#F97316] hover:bg-[#FB923C] text-[#0B0C0E] font-bold text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span>استخراج تمامی عکس‌های سند و دانلود ZIP</span>
                    </button>
                  </div>

                  {extractedPdfImages.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#F4F4F6]">
                          تصاویر استخراج‌شده ({extractedPdfImages.length} تصویر):
                        </span>
                        <span className="text-[11px] text-[#9CA3AF]">
                          فرمت باکیفیت بدون فشرده‌سازی
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto">
                        {extractedPdfImages.map((img) => (
                          <div
                            key={img.id}
                            className="bg-[#0B0C0E] border border-white/10 rounded-lg p-2 space-y-1.5"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.dataUrl}
                              alt={img.filename}
                              className="w-full h-20 object-cover rounded border border-white/5"
                            />
                            <div className="text-[11px] font-mono text-[#F4F4F6] truncate">
                              {img.filename}
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-[#9CA3AF] font-mono tabular-nums">
                              <span>{formatBytes(img.sizeBytes)}</span>
                              <a
                                href={img.dataUrl}
                                download={img.filename}
                                className="text-[#F97316] hover:underline"
                              >
                                دانلود
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ===================================================================
                  FEATURE (Image #10 + #20 EXIF Stripper + #21 Super-Sampling):
                  ADVANCED IMAGE COMPRESSOR, EXIF SCRUBBER & 2X SHARPENER
                 =================================================================== */}
              {pdfToolMode === 'compress-images' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-[#F4F4F6]">
                      بهینه‌ساز عکس، پاکسازی متادیتای EXIF/GPS و افزایش وضوح ۲ برابری
                    </h3>
                    <p className="text-xs text-[#9CA3AF] mt-0.5 leading-relaxed">
                      فشرده‌سازی به WebP نسل جدید، حذف کامل اطلاعات موقعیت مکانی GPS و سریال دوربین (#20) و ارتقای وضوح ۲ برابری با کرنل شارپنینگ (#21).
                    </p>
                  </div>

                  <input
                    ref={optimizeImagesInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files) {
                        setImageToPdfFiles(Array.from(e.target.files));
                      }
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />

                  <div className="bg-[#0B0C0E] p-4 rounded-lg border border-white/10 space-y-3.5">
                    <button
                      type="button"
                      onClick={() => optimizeImagesInputRef.current?.click()}
                      className="min-h-[42px] w-full py-2.5 px-4 bg-[#191C22] hover:bg-white/15 text-[#F4F4F6] border border-[#F97316]/50 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <Upload className="w-4 h-4 text-[#F97316]" />
                      <span>
                        {imageToPdfFiles.length > 0
                          ? `انتخاب مجدد تصاویر (${imageToPdfFiles.length} عکس فعال)`
                          : 'انتخاب یا افزودن چند عکس برای بهینه‌سازی'}
                      </span>
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-xs text-[#9CA3AF]">
                          فرمت خروجی بهینه
                        </label>
                        <select
                          value={imageOptConfig.targetFormat}
                          onChange={(e) =>
                            setImageOptConfig((prev) => ({
                              ...prev,
                              targetFormat: e.target
                                .value as ImageOptimizationConfig['targetFormat'],
                            }))
                          }
                          className="w-full bg-[#121418] border border-white/15 rounded-lg px-3 py-2 text-xs text-[#F4F4F6]"
                        >
                          <option value="webp">WebP (حداکثر فشرده‌سازی · توصیه شده)</option>
                          <option value="jpeg">JPEG (استاندارد عکاسی و وب)</option>
                          <option value="png">PNG (بدون افت کیفیت)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs text-[#9CA3AF]">
                          حداکثر ابعاد (سایز پیکسل)
                        </label>
                        <select
                          value={imageOptConfig.maxWidthOrHeight}
                          onChange={(e) =>
                            setImageOptConfig((prev) => ({
                              ...prev,
                              maxWidthOrHeight: Number(e.target.value),
                            }))
                          }
                          className="w-full bg-[#121418] border border-white/15 rounded-lg px-3 py-2 text-xs text-[#F4F4F6]"
                        >
                          <option value={0}>ابعاد اصلی (Original)</option>
                          <option value={1920}>Full HD (1920px)</option>
                          <option value={1280}>HD (1280px)</option>
                          <option value={800}>Web Banner (800px)</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1 border-t border-white/10">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#9CA3AF]">کیفیت فشرده‌سازی</span>
                        <span className="font-mono tabular-nums text-[#F97316] font-bold">
                          {imageOptConfig.quality}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={15}
                        max={100}
                        value={imageOptConfig.quality}
                        onChange={(e) =>
                          setImageOptConfig((prev) => ({
                            ...prev,
                            quality: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-[#F97316] cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2 pt-2 border-t border-white/10 text-xs">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-[#E5E7EB]">
                          حذف کامل متادیتای موقعیت مکانی EXIF / GPS دوربین (#20)
                        </span>
                        <input
                          type="checkbox"
                          checked={imageOptConfig.stripExifAndGps ?? true}
                          onChange={(e) =>
                            setImageOptConfig((prev) => ({
                              ...prev,
                              stripExifAndGps: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-[#F97316]"
                        />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-[#E5E7EB]">
                          افزایش وضوح ۲ برابری و شارپنینگ لبه‌ها (#21 2x Super-Sampling)
                        </span>
                        <input
                          type="checkbox"
                          checked={imageOptConfig.upscale2xSharpen ?? false}
                          onChange={(e) =>
                            setImageOptConfig((prev) => ({
                              ...prev,
                              upscale2xSharpen: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-[#F97316]"
                        />
                      </label>
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          تگ واترمارک کپی‌رایت گوشه تصاویر (اختیاری)
                        </label>
                        <input
                          type="text"
                          value={imageOptConfig.watermarkText || ''}
                          onChange={(e) =>
                            setImageOptConfig((prev) => ({
                              ...prev,
                              watermarkText: e.target.value,
                            }))
                          }
                          placeholder="مثال: © Kronos Photography"
                          className="w-full bg-[#121418] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-[#F4F4F6]"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleRunCompressImages}
                      disabled={isProcessing || imageToPdfFiles.length === 0}
                      className="min-h-[46px] w-full py-3 px-5 bg-[#F97316] hover:bg-[#FB923C] text-[#0B0C0E] font-bold text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Sliders className="w-4 h-4" />
                      <span>
                        پردازش {imageToPdfFiles.length} عکس، حذف EXIF و ساخت بسته ZIP
                      </span>
                    </button>
                  </div>

                  {optimizedImageResults.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-white/10">
                      <div className="text-xs font-semibold text-[#F4F4F6]">
                        نتایج بهینه‌سازی و پاکسازی EXIF ({optimizedImageResults.length} فایل):
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto text-xs">
                        {optimizedImageResults.map((r) => (
                          <div
                            key={r.id}
                            className="p-3 bg-[#0B0C0E] rounded-lg border border-white/10 flex items-center justify-between gap-3"
                          >
                            <div className="truncate">
                              <div className="font-mono text-[#F4F4F6] truncate">
                                {r.outputFilename}
                              </div>
                              <div className="text-[11px] text-[#9CA3AF] font-mono tabular-nums mt-0.5">
                                {formatBytes(r.originalSizeBytes)} ←{' '}
                                <span className="text-[#F97316] font-semibold">
                                  {formatBytes(r.outputSizeBytes)}
                                </span>{' '}
                                · {r.width}x{r.height} · EXIF Stripped ({r.exifStrippedTagsCount || 0})
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 font-mono text-[11px] font-bold rounded">
                                -{r.savingsPct}%
                              </span>
                              <a
                                href={r.url}
                                download={r.outputFilename}
                                className="px-2.5 py-1 bg-[#191C22] hover:bg-white/15 text-[#F4F4F6] border border-white/10 rounded text-[11px]"
                              >
                                دانلود
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {pdfToolMode === 'pdf-images' && (
                <div className="space-y-5">
                  <div className="bg-[#0B0C0E] p-4 rounded-lg border border-white/10 space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-[#F4F4F6]">
                        ۱. استخراج صفحات PDF به تصاویر PNG (PDF → PNG)
                      </h4>
                      <p className="text-xs text-[#9CA3AF] mt-0.5">
                        رندر صفحات فعال با وضوح بالا و بسته‌بندی در فایل ZIP
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunPdfToImages}
                      disabled={isProcessing || pdfDocs.length === 0}
                      className="min-h-[42px] w-full py-2.5 px-4 bg-[#191C22] hover:bg-white/15 text-[#F4F4F6] border border-[#F97316]/50 font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      <ImageIcon className="w-4 h-4 text-[#F97316]" />
                      <span>
                        تبدیل {pdfPages.filter((p) => p.included).length} صفحه PDF به تصاویر PNG (ZIP)
                      </span>
                    </button>
                  </div>

                  <div className="bg-[#0B0C0E] p-4 rounded-lg border border-white/10 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-[#F4F4F6]">
                          ۲. تبدیل چند تصویر به سند PDF (Images → PDF)
                        </h4>
                        <p className="text-xs text-[#9CA3AF] mt-0.5">
                          {imageToPdfFiles.length} تصویر انتخاب‌شده
                        </p>
                      </div>

                      <input
                        ref={imagesToPdfInputRef}
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files) {
                            setImageToPdfFiles((prev) => [
                              ...prev,
                              ...Array.from(e.target.files!),
                            ]);
                          }
                          e.currentTarget.value = '';
                        }}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => imagesToPdfInputRef.current?.click()}
                        className="min-h-[36px] px-3 py-1.5 text-xs bg-[#121418] hover:bg-white/10 border border-white/15 rounded-lg text-[#F97316] cursor-pointer whitespace-nowrap"
                      >
                        + افزودن چند عکس
                      </button>
                    </div>

                    {imageToPdfFiles.length > 0 && (
                      <div className="space-y-1.5 max-h-28 overflow-y-auto text-xs">
                        {imageToPdfFiles.map((img, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between px-2.5 py-1.5 bg-[#121418] rounded border border-white/5"
                          >
                            <span className="truncate font-mono text-[11px]">
                              {i + 1}. {img.name}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setImageToPdfFiles((prev) =>
                                  prev.filter((_, idx) => idx !== i)
                                )
                              }
                              className="text-[#9CA3AF] hover:text-red-400 cursor-pointer p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'a4-portrait', label: 'A4 عمودی' },
                          { id: 'a4-landscape', label: 'A4 افقی' },
                          { id: 'fit-image', label: 'ابعاد عکس' },
                        ] as const
                      ).map((ly) => (
                        <button
                          key={ly.id}
                          type="button"
                          onClick={() => setImageToPdfLayout(ly.id)}
                          className={`min-h-[36px] py-1.5 text-xs rounded border cursor-pointer ${
                            imageToPdfLayout === ly.id
                              ? 'bg-[#F97316] text-[#0B0C0E] border-[#F97316] font-bold'
                              : 'bg-[#121418] text-[#9CA3AF] border-white/10'
                          }`}
                        >
                          {ly.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleRunImagesToPdf}
                      disabled={isProcessing || imageToPdfFiles.length === 0}
                      className="min-h-[42px] w-full py-2.5 px-4 bg-[#F97316] hover:bg-[#FB923C] text-[#0B0C0E] font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      <span>
                        تبدیل {imageToPdfFiles.length} تصویر به فایل PDF یکپارچه
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 4: SMART BATCH FILE RENAMER (#25) & AES-256-GCM SECURITY VAULT (#28)
           =================================================================== */}
        {activeTab === 'batch-vault' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* Left Column (7 cols): FEATURE #25 SMART BATCH FILE RENAMER & ZIP PACKAGER */}
            <div className="lg:col-span-7 bg-[#121418] border border-white/10 rounded-xl p-4 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[#F4F4F6]">
                    تغییر نام دسته‌ای هوشمند و بسته‌بندی خودکار ZIP (#25 Smart Batch Renamer)
                  </h3>
                  <p className="text-xs text-[#9CA3AF] mt-0.5">
                    شماره‌گذاری خودکار، درج تاریخ، پیشوند/پسوند و جایگزینی متن روی ده‌ها فایل به صورت همزمان
                  </p>
                </div>

                <div>
                  <input
                    ref={batchFileInputRef}
                    type="file"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        setBatchFiles((prev) => [
                          ...prev,
                          ...Array.from(e.target.files!),
                        ]);
                      }
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => batchFileInputRef.current?.click()}
                    className="min-h-[40px] px-3.5 py-2 text-xs font-medium bg-[#191C22] hover:bg-white/10 text-[#F4F4F6] border border-[#F97316]/50 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 text-[#F97316]" />
                    <span>افزودن فایل‌ها ({batchFiles.length})</span>
                  </button>
                </div>
              </div>

              <div className="bg-[#0B0C0E] p-4 rounded-xl border border-white/10 space-y-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#9CA3AF] mb-1">
                      پیشوند نام (Prefix)
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={batchRenameCfg.prefix}
                      onChange={(e) =>
                        setBatchRenameCfg((prev) => ({
                          ...prev,
                          prefix: e.target.value,
                        }))
                      }
                      placeholder="kronos_"
                      className="w-full bg-[#121418] border border-white/15 rounded-lg px-2.5 py-2 text-xs font-mono text-[#F4F4F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9CA3AF] mb-1">
                      نام پایه جایگزین (اختیاری)
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={batchRenameCfg.baseNameOverride}
                      onChange={(e) =>
                        setBatchRenameCfg((prev) => ({
                          ...prev,
                          baseNameOverride: e.target.value,
                        }))
                      }
                      placeholder="خالی = حفظ نام اصلی"
                      className="w-full bg-[#121418] border border-white/15 rounded-lg px-2.5 py-2 text-xs font-mono text-[#F4F4F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9CA3AF] mb-1">
                      پسوند نام (Suffix)
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={batchRenameCfg.suffix}
                      onChange={(e) =>
                        setBatchRenameCfg((prev) => ({
                          ...prev,
                          suffix: e.target.value,
                        }))
                      }
                      placeholder="_master"
                      className="w-full bg-[#121418] border border-white/15 rounded-lg px-2.5 py-2 text-xs font-mono text-[#F4F4F6]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/10">
                  <div>
                    <label className="block text-[11px] text-[#9CA3AF] mb-1">
                      جستجوی عبارت (Find)
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={batchRenameCfg.findText}
                      onChange={(e) =>
                        setBatchRenameCfg((prev) => ({
                          ...prev,
                          findText: e.target.value,
                        }))
                      }
                      placeholder="IMG_"
                      className="w-full bg-[#121418] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#F4F4F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9CA3AF] mb-1">
                      جایگزین با (Replace)
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={batchRenameCfg.replaceText}
                      onChange={(e) =>
                        setBatchRenameCfg((prev) => ({
                          ...prev,
                          replaceText: e.target.value,
                        }))
                      }
                      placeholder="Shot_"
                      className="w-full bg-[#121418] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#F4F4F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9CA3AF] mb-1">
                      شماره شروع
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={batchRenameCfg.startIndex}
                      onChange={(e) =>
                        setBatchRenameCfg((prev) => ({
                          ...prev,
                          startIndex: Number(e.target.value) || 1,
                        }))
                      }
                      className="w-full bg-[#121418] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#F4F4F6]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9CA3AF] mb-1">
                      تعداد ارقام شمارنده
                    </label>
                    <select
                      value={batchRenameCfg.zeroPadDigits}
                      onChange={(e) =>
                        setBatchRenameCfg((prev) => ({
                          ...prev,
                          zeroPadDigits: Number(
                            e.target.value
                          ) as BatchRenameConfig['zeroPadDigits'],
                        }))
                      }
                      className="w-full bg-[#121418] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#F4F4F6]"
                    >
                      <option value={0}>بدون شمارنده</option>
                      <option value={2}>۲ رقمی (01, 02)</option>
                      <option value={3}>۳ رقمی (001, 002)</option>
                      <option value={4}>۴ رقمی (0001)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[#E5E7EB]">
                    <input
                      type="checkbox"
                      checked={batchRenameCfg.includeDateStamp}
                      onChange={(e) =>
                        setBatchRenameCfg((prev) => ({
                          ...prev,
                          includeDateStamp: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-[#F97316]"
                    />
                    <span>درج خودکار تاریخ روز (YYYY-MM-DD)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[#E5E7EB]">
                    <input
                      type="checkbox"
                      checked={batchRenameCfg.lowercaseExtension}
                      onChange={(e) =>
                        setBatchRenameCfg((prev) => ({
                          ...prev,
                          lowercaseExtension: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-[#F97316]"
                    />
                    <span>تبدیل پسوند فایل‌ها به حروف کوچک استاندارد</span>
                  </label>
                </div>
              </div>

              {/* Live Before / After Rename Preview Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#E5E7EB]">
                    پیش‌نمایش زنده تغییر نام ({batchFiles.length} فایل):
                  </span>
                  {batchFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBatchFiles([])}
                      className="text-[11px] text-[#9CA3AF] hover:text-red-400 cursor-pointer"
                    >
                      پاک کردن لیست
                    </button>
                  )}
                </div>

                {batchFiles.length === 0 ? (
                  <div className="bg-[#0B0C0E] border border-white/10 rounded-lg p-6 text-center text-xs text-[#9CA3AF]">
                    فایل‌های خود را از بالا یا با دکمه «افزودن فایل‌ها» انتخاب کنید تا پیش‌نمایش آنی نام‌های جدید نمایش داده شود.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {batchFiles.length > 24 && (
                      <div className="flex items-center justify-between text-[11px] bg-[#121418] px-2.5 py-1.5 rounded border border-white/10">
                        <span className="text-[#9CA3AF]">
                          مجازی‌سازی لیست فعال است (نمایش{' '}
                          {showAllBatchFiles ? batchFiles.length : 24} از{' '}
                          {batchFiles.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAllBatchFiles((p) => !p)}
                          className="text-[#F97316] font-semibold cursor-pointer"
                        >
                          {showAllBatchFiles ? 'نمای مجازی سریع' : 'نمایش همه'}
                        </button>
                      </div>
                    )}
                    {(showAllBatchFiles
                      ? computeBatchRenamedList(batchFiles, batchRenameCfg)
                      : computeBatchRenamedList(
                          batchFiles.slice(0, 24),
                          batchRenameCfg
                        )
                    ).map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-2.5 bg-[#0B0C0E] border border-white/10 rounded-lg flex items-center justify-between gap-2 text-xs font-mono"
                      >
                        <span className="text-[#9CA3AF] truncate max-w-[42%]">
                          {item.originalName}
                        </span>
                        <span className="text-[#F97316] font-bold">→</span>
                        <span className="text-emerald-400 font-semibold truncate max-w-[46%]">
                          {item.newName}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setBatchFiles((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          className="text-[#9CA3AF] hover:text-red-400 cursor-pointer p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleRunBatchRenameZip}
                disabled={isProcessing || batchFiles.length === 0}
                className="min-h-[46px] w-full py-3 px-5 bg-[#F97316] hover:bg-[#FB923C] text-[#0B0C0E] font-bold text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <FolderArchive className="w-4 h-4" />
                <span>
                  اعمال تغییر نام روی {batchFiles.length} فایل و دانلود یکجا (ZIP)
                </span>
              </button>
            </div>

            {/* Right Column (5 cols): FEATURE #28 AES-256-GCM MILITARY VAULT & SHA-256 AUDITOR */}
            <div className="lg:col-span-5 bg-[#121418] border border-white/10 rounded-xl p-4 sm:p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#F4F4F6]">
                    گاوصندوق رمزنگاری نظامی AES-256-GCM و اسکنر SHA-256 (#28)
                  </h3>
                  <p className="text-xs text-[#9CA3AF] mt-0.5">
                    رمزنگاری سخت‌افزاری Web Crypto API با مشتق‌سازی کلید PBKDF2 (۱۰۰,۰۰۰ دور) بدون ارسال به سرور
                  </p>
                </div>
                <Lock className="w-5 h-5 text-[#F97316] shrink-0" />
              </div>

              <div className="bg-[#0B0C0E] p-4 rounded-xl border border-[#F97316]/40 space-y-3.5 text-xs">
                <div>
                  <label className="block text-xs font-semibold text-[#E5E7EB] mb-1.5">
                    کلید رمزنگاری / رمزگشایی محلی (Master Passphrase):
                  </label>
                  <div className="relative flex items-center">
                    <KeyRound className="w-4 h-4 text-[#F97316] absolute left-3 pointer-events-none" />
                    <input
                      type="text"
                      dir="ltr"
                      value={vaultPassword}
                      onChange={(e) => setVaultPassword(e.target.value)}
                      placeholder="Enter secret passphrase..."
                      className="w-full bg-[#121418] border border-white/20 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-[#F4F4F6]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={handleRunVaultEncrypt}
                    disabled={isProcessing}
                    className="min-h-[42px] py-2.5 px-3 bg-[#F97316] hover:bg-[#FB923C] text-[#0B0C0E] font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>رمزنگاری به .kronos</span>
                  </button>

                  <input
                    ref={vaultFileInputRef}
                    type="file"
                    accept=".kronos,application/octet-stream"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        handleRunVaultDecrypt([f]);
                      }
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => vaultFileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="min-h-[42px] py-2.5 px-3 bg-[#191C22] hover:bg-white/15 text-[#F4F4F6] border border-white/15 font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>رمزگشایی فایل .kronos</span>
                  </button>
                </div>
              </div>

              {/* SHA-256 & Magic-Byte Binary Signature Scanner */}
              <div className="bg-[#0B0C0E] p-4 rounded-xl border border-white/10 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-[#F4F4F6]">
                      تشخیص اصالت باینری (Magic-Byte) و هش SHA-256
                    </div>
                    <div className="text-[11px] text-[#9CA3AF]">
                      بررسی هدر هگزادسیمال فایل برای کشف پسوندهای جعلی یا دستکاری‌شده
                    </div>
                  </div>
                  <FileCheck2 className="w-4 h-4 text-[#F97316] shrink-0" />
                </div>

                <button
                  type="button"
                  onClick={handleRunHashAudit}
                  disabled={isProcessing}
                  className="min-h-[40px] w-full py-2 px-4 bg-[#191C22] hover:bg-white/15 text-[#F4F4F6] border border-[#F97316]/50 font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4 text-[#F97316]" />
                  <span>محاسبه SHA-256 و بررسی باینری فایل‌های انتخاب‌شده</span>
                </button>

                {hashAuditResults.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-white/10 max-h-60 overflow-y-auto">
                    {hashAuditResults.map((h) => (
                      <div
                        key={h.id}
                        className="p-2.5 bg-[#121418] rounded-lg border border-white/10 space-y-1 font-mono text-[11px]"
                      >
                        <div className="flex items-center justify-between text-[#F4F4F6] font-bold">
                          <span className="truncate">{h.filename}</span>
                          <span className="text-[#F97316] shrink-0">
                            {h.isKronosVault ? 'KRONOS VAULT' : h.mimeType}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#9CA3AF]">
                          Magic Hex: {h.magicHexSignature}
                        </div>
                        <div
                          dir="ltr"
                          className="text-[10px] text-emerald-400 break-all bg-[#0B0C0E] p-1.5 rounded border border-white/5"
                        >
                          SHA-256: {h.sha256Hex}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* COMPLETED EXPORTS VAULT */}
        <section id="exports-vault" className="pt-8 border-t border-white/10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#F4F4F6]">
                خروجی‌های پردازش‌شده در حافظه مرورگر ({exportedItems.length})
              </h2>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                فایل‌های تولیدشده مستقیماً از حافظه RAM دستگاه شما قابل پخش و دانلود هستند
              </p>
            </div>
            {exportedItems.length > 0 && (
              <button
                type="button"
                onClick={handleClearExportsAndPurgeRam}
                className="px-3 py-1.5 text-xs bg-[#121418] border border-white/15 rounded-lg text-[#9CA3AF] hover:text-[#F97316] cursor-pointer"
              >
                پاکسازی لیست و آزادسازی کش RAM
              </button>
            )}
          </div>

          {exportedItems.length === 0 ? (
            <div className="bg-[#121418] border border-white/10 rounded-xl p-6 sm:p-8 text-center space-y-2">
              <HardDrive className="w-7 h-7 text-[#9CA3AF] mx-auto stroke-[1.5]" />
              <p className="text-sm font-medium text-[#E5E7EB]">
                هنوز فایلی خروجی نگرفته‌اید
              </p>
              <p className="text-xs text-[#9CA3AF]">
                یکی از عملیات‌های بالا (ویدیو، صدا، PDF یا رمزنگاری امنیتی) را اجرا کنید تا خروجی فوری در این بخش قرار گیرد.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exportedItems.map((item) => {
                const deltaPct =
                  item.originalSizeBytes > 0
                    ? Math.round(
                        ((item.outputSizeBytes - item.originalSizeBytes) /
                          item.originalSizeBytes) *
                          100
                      )
                    : 0;

                return (
                  <div
                    key={item.id}
                    className="bg-[#121418] border border-white/15 rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-[#F4F4F6] truncate font-mono">
                          {item.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF] mt-1">
                          <span>{item.details}</span>
                          <span>·</span>
                          <span className="font-mono tabular-nums">
                            {item.createdAt}
                          </span>
                        </div>
                      </div>

                      <a
                        href={item.url}
                        download={item.filename}
                        className="min-h-[38px] px-3.5 py-2 bg-[#F97316] hover:bg-[#FB923C] text-[#0B0C0E] font-bold text-xs rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>دانلود فایل</span>
                      </a>
                    </div>

                    {item.category === 'audio' && (
                      <audio
                        controls
                        src={item.url}
                        className="w-full h-9 rounded"
                      />
                    )}
                    {item.category === 'video' &&
                      item.mimeType.startsWith('image/') && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.url}
                          alt={item.title}
                          className="w-full max-h-44 object-contain bg-[#0B0C0E] rounded border border-white/10"
                        />
                      )}
                    {item.category === 'video' &&
                      !item.mimeType.startsWith('image/') &&
                      item.mimeType !== 'application/zip' && (
                        <video
                          controls
                          playsInline
                          src={item.url}
                          className="w-full max-h-44 bg-[#0B0C0E] rounded border border-white/10"
                        />
                      )}

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono tabular-nums text-[#9CA3AF]">
                      <span>
                        ورودی: {formatBytes(item.originalSizeBytes)} ← خروجی:{' '}
                        <strong className="text-[#F4F4F6]">
                          {formatBytes(item.outputSizeBytes)}
                        </strong>
                      </span>
                      <span
                        className={
                          deltaPct <= 0 ? 'text-emerald-400' : 'text-[#9CA3AF]'
                        }
                      >
                        {deltaPct <= 0
                          ? `${Math.abs(deltaPct)}% بهینه‌تر`
                          : 'فرمت مستر'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* LOCAL ARCHITECTURE SECTION (12 CREATIVE HARDWARE ACCELERATION ENGINES) */}
        <section
          id="architecture"
          className="pt-10 pb-6 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6"
        >
          <div className="bg-[#121418] border border-white/10 rounded-xl p-5 sm:p-6 space-y-2">
            <ShieldCheck className="w-5 h-5 text-[#F97316]" />
            <h3 className="text-sm font-bold text-[#F4F4F6]">
              ۰۱. شیدرهای WebGL2 GLSL،‏ OffscreenCanvas و WebCodecs
            </h3>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              حذف پرده سبز Chroma Key، جدول‌های رنگی سینمایی 3D LUT و اصلاح رنگ مستقیماً با Fragment Shader روی کارت گرافیک اجرا می‌شوند و رسترینگ تصاویر و فریم‌های GIF به صورت موازی در تردهای OffscreenCanvas پردازش می‌گردند.
            </p>
          </div>

          <div className="bg-[#121418] border border-white/10 rounded-xl p-5 sm:p-6 space-y-2">
            <RefreshCw className="w-5 h-5 text-[#F97316]" />
            <h3 className="text-sm font-bold text-[#F4F4F6]">
              ۰۲. استخر چند‌هسته‌ای Worker،‏ کرنل WASM SIMD و استخر حلقوی حافظه
            </h3>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              توزیع هوشمند بار روی تمام هسته‌های CPU (hardwareConcurrency)، محاسبات برداری انرژی صوتی LUFS با کرنل باینری WebAssembly در حافظه و بازیافت آرایه‌ها در TypedArrayRingArena برای حذف کامل مکث‌های Garbage Collector.
            </p>
          </div>

          <div className="bg-[#121418] border border-white/10 rounded-xl p-5 sm:p-6 space-y-2">
            <Cpu className="w-5 h-5 text-[#F97316]" />
            <h3 className="text-sm font-bold text-[#F4F4F6]">
              ۰۳. دیسک مجازی OPFS، استریم 4MB، پیش‌تحلیل Idle و پایش حرارتی
            </h3>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              ذخیره‌سازی فایل‌های حجیم روی دیسک اختصاصی مرورگر (OPFS)، خوانش تکه‌ای ۴ مگابایتی با کنترل فشار، پیش‌محاسبه هش SHA-256 در زمان بیکاری (requestIdleCallback)، پروکسی زنده 0.5x هنگام جابجایی اسلایدرها و گاورنر هوشمند ۶۰ فریم.
            </p>
          </div>
        </section>
      </main>

      {/* ERGONOMIC MOBILE BOTTOM TAB BAR (Thumb-Zone Navigation for <768px) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#0B0C0E]/95 backdrop-blur-md border-t border-white/15 grid grid-cols-5 items-center px-1">
        <button
          type="button"
          onClick={() => {
            setActiveTab('video');
            document
              .getElementById('workbench')
              ?.scrollIntoView({ behavior: 'smooth' });
          }}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeTab === 'video' ? 'text-[#F97316]' : 'text-[#9CA3AF]'
          }`}
        >
          <Film className="w-4 h-4" />
          <span className="text-[10px] font-semibold">ویدیو ({videoList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('audio');
            document
              .getElementById('workbench')
              ?.scrollIntoView({ behavior: 'smooth' });
          }}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeTab === 'audio' ? 'text-[#F97316]' : 'text-[#9CA3AF]'
          }`}
        >
          <Mic className="w-4 h-4" />
          <span className="text-[10px] font-semibold">صدا ({audioTracks.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('pdf');
            document
              .getElementById('workbench')
              ?.scrollIntoView({ behavior: 'smooth' });
          }}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeTab === 'pdf' ? 'text-[#F97316]' : 'text-[#9CA3AF]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span className="text-[10px] font-semibold">PDF ({pdfDocs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('batch-vault');
            document
              .getElementById('workbench')
              ?.scrollIntoView({ behavior: 'smooth' });
          }}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeTab === 'batch-vault' ? 'text-[#F97316]' : 'text-[#9CA3AF]'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span className="text-[10px] font-semibold">امنیت و دسته</span>
        </button>

        <button
          type="button"
          onClick={() => {
            document
              .getElementById('exports-vault')
              ?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[#9CA3AF] hover:text-[#F4F4F6] cursor-pointer"
        >
          <Download className="w-4 h-4 text-[#F97316]" />
          <span className="text-[10px] font-semibold">
            خروجی ({exportedItems.length})
          </span>
        </button>
      </nav>

      <footer className="mt-auto px-4 sm:px-6 lg:px-12 py-6 border-t border-white/10 text-xs text-[#9CA3AF] flex flex-wrap items-center justify-between gap-4">
        <span>
          کرونوس استودیو · مهندسی رسانه، اسناد و رمزنگاری به صورت ۱۰۰٪ محلی روی سخت‌افزار کاربر
        </span>
        <span className="font-mono tabular-nums">
          Next.js 15 · Web Worker Zero-Copy DSP · AES-256-GCM · Mobile Ready
        </span>
      </footer>
    </div>
  );
}

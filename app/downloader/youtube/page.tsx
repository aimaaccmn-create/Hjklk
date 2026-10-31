'use client';

import React, { useState, useRef } from 'react';
import { DownloaderNavbar } from '@/components/DownloaderNavbar';
import {
  PROXY_NODES,
  ProxyNodeId,
  ResolvedMediaResult,
  MediaFormatOption,
  DownloadProgressState,
  executeHighSpeedDownload,
  buildProxyUrl,
  formatBytes,
  formatDuration,
} from '@/lib/downloader-engine';
import {
  Youtube,
  Search,
  Download,
  Music,
  Film,
  Image as ImageIcon,
  Shield,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ClipboardPaste,
  Sparkles,
  Server,
  Clock,
  Eye,
  User,
  ExternalLink,
  RefreshCw,
  Volume2,
  XCircle,
} from 'lucide-react';

const SAMPLE_YOUTUBE_LINKS = [
  {
    label: 'ویدیو مستند طبیعت (4K HDR)',
    url: 'https://www.youtube.com/watch?v=LXb3EKWsInQ',
  },
  {
    label: 'موزیک ویدیو رسمی (Audio + 1080p)',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
  {
    label: 'ویدیو کوتاه (YouTube Shorts)',
    url: 'https://www.youtube.com/shorts/5qap5aO4i9A',
  },
];

export default function YouTubeDownloaderPage() {
  const [urlInput, setUrlInput] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [media, setMedia] = useState<ResolvedMediaResult | null>(null);

  const [proxyMode, setProxyMode] = useState<ProxyNodeId>('smart-auto');
  const [parallelChunks, setParallelChunks] = useState<1 | 2 | 4 | 8>(4);
  const [activeTab, setActiveTab] = useState<'video' | 'audio' | 'image'>('video');
  const [convertAudioToWav, setConvertAudioToWav] = useState(false);

  const [progress, setProgress] = useState<DownloadProgressState | null>(null);
  const [activeFormatId, setActiveFormatId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleResolve = async (targetUrl?: string) => {
    const finalUrl = (targetUrl ?? urlInput).trim();
    if (!finalUrl) {
      setResolveError('لطفاً لینک ویدیو یا Shorts یوتیوب را وارد کنید.');
      return;
    }

    setIsResolving(true);
    setResolveError(null);
    setProgress(null);

    try {
      const res = await fetch('/api/downloader/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: finalUrl,
          platform: 'youtube',
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'خطا در دریافت اطلاعات از سرور یوتیوب.');
      }

      setMedia(data as ResolvedMediaResult);
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'خطای ناشناخته در آنالیز لینک یوتیوب');
    } finally {
      setIsResolving(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput(text);
        handleResolve(text);
      }
    } catch {
      setResolveError('دسترسی به کلیپ‌بورد مرورگر امکان‌پذیر نشد. لینک را دستی جای‌گذاری کنید.');
    }
  };

  const handleStartDownload = async (format: MediaFormatOption, forceWav = false) => {
    if (!media) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setActiveFormatId(format.id);
    const cleanTitle = media.title.replace(/[^\w\u0600-\u06FF\- ]+/g, '').trim().slice(0, 60) || media.id;
    const filename = `${cleanTitle}-${format.quality}.${format.ext}`;

    try {
      await executeHighSpeedDownload({
        url: format.url,
        fallbackUrl: format.fallbackUrl,
        filename,
        proxyMode,
        parallelConnections: format.type === 'image' ? 1 : parallelChunks,
        convertToFormat: forceWav || (format.type === 'audio' && convertAudioToWav) ? 'wav' : 'none',
        computeSha256: true,
        onProgress: (st) => setProgress({ ...st }),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        setProgress((prev) =>
          prev ? { ...prev, status: 'paused', errorMessage: 'دانلود توسط کاربر متوقف شد.' } : null
        );
      } else {
        setProgress({
          status: 'error',
          loadedBytes: 0,
          totalBytes: 0,
          percent: 0,
          speedBytesPerSec: 0,
          etaSeconds: null,
          activeConnections: 0,
          chunksCompleted: 0,
          totalChunks: parallelChunks,
          activeProxy: proxyMode,
          errorMessage: err instanceof Error ? err.message : 'خطا در دانلود فایل',
        });
      }
    }
  };

  const handleCancelDownload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const filteredFormats = media?.formats.filter((f) => f.type === activeTab) || [];

  return (
    <div dir="rtl" className="min-h-screen bg-[#0B0C0E] text-[#F4F4F6]">
      <DownloaderNavbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Hero Header */}
        <section className="relative overflow-hidden rounded-2xl border border-red-500/20 bg-gradient-to-b from-[#151216] to-[#121418] p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
                <Youtube className="h-4 w-4" />
                <span>موتور اختصاصی یوتیوب • Innertube Multi-Client + Piped Relay</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-4xl text-[#F4F4F6]">
                دانلودر فوق‌سریع یوتیوب و Shorts با تانل پروکسی ضدتحریم
              </h1>
              <p className="text-sm leading-relaxed text-[#9CA3AF]">
                استخراج مستقیم ویدیوهای یوتیوب با کیفیت‌های Full HD 1080p60، 720p، جداسازی صدای خالص (M4A/MP3/WAV استودیویی) و دانلود کاور اصلی MaxRes بدون نیاز به تحریم‌شکن.
              </p>
            </div>

            {/* Proxy & Multi-Chunk Quick Config Card */}
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0B0C0E]/90 p-4 min-w-[290px]">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-[#F4F4F6]">
                  <Server className="h-3.5 w-3.5 text-red-400" />
                  نود تانل پروکسی:
                </span>
                <span className="font-mono text-[11px] text-emerald-400">ONLINE • 99.9%</span>
              </div>
              <select
                value={proxyMode}
                onChange={(e) => setProxyMode(e.target.value as ProxyNodeId)}
                className="w-full rounded-lg border border-white/10 bg-[#121418] px-3 py-2 text-xs text-[#F4F4F6] focus:border-red-500 focus:outline-none"
              >
                {PROXY_NODES.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name} ({node.region})
                  </option>
                ))}
              </select>

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-[#9CA3AF]">شتاب‌دهنده چندکاناله (Range):</span>
                <div className="flex items-center gap-1">
                  {([1, 2, 4, 8] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setParallelChunks(n)}
                      className={`rounded px-2 py-0.5 font-mono text-[11px] transition ${
                        parallelChunks === n
                          ? 'bg-red-500 text-white font-semibold'
                          : 'bg-[#191C22] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      {n}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Search / URL Input Bar */}
          <div className="mt-6 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <input
                  type="url"
                  dir="ltr"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleResolve()}
                  placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                  className="w-full rounded-xl border border-white/15 bg-[#0B0C0E] py-3.5 pl-4 pr-28 font-mono text-sm text-[#F4F4F6] placeholder-[#9CA3AF]/50 focus:border-red-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#191C22] px-2.5 py-1.5 text-xs text-[#9CA3AF] hover:border-white/20 hover:text-white transition"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  <span>جای‌گذاری</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleResolve()}
                disabled={isResolving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-red-600/25 transition hover:bg-red-500 disabled:opacity-50 cursor-pointer"
              >
                {isResolving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>در حال استخراج استریم...</span>
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    <span>آنالیز و استخراج لینک</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Sample Links */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-[#9CA3AF] flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                تست سریع با لینک‌های نمونه:
              </span>
              {SAMPLE_YOUTUBE_LINKS.map((sample) => (
                <button
                  key={sample.url}
                  type="button"
                  onClick={() => {
                    setUrlInput(sample.url);
                    handleResolve(sample.url);
                  }}
                  className="rounded-lg border border-white/10 bg-[#191C22]/80 px-2.5 py-1 text-xs text-[#9CA3AF] transition hover:border-red-500/40 hover:text-[#F4F4F6]"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          {resolveError && (
            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{resolveError}</span>
            </div>
          )}
        </section>

        {/* Live Download Telemetry Banner */}
        {progress && (
          <section className="mt-6 rounded-2xl border border-amber-500/30 bg-[#121418] p-5 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {progress.status === 'completed' ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                ) : progress.status === 'error' ? (
                  <AlertCircle className="h-6 w-6 text-red-400" />
                ) : (
                  <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#F4F4F6]">
                      {progress.status === 'probing' && 'در حال بررسی هدرها و ایجاد تانل چندکاناله...'}
                      {progress.status === 'downloading' && 'در حال دانلود پرسرعت از طریق تانل پروکسی...'}
                      {progress.status === 'merging' && 'در حال یکپارچه‌سازی قطعات موازی (Range Chunks)...'}
                      {progress.status === 'converting' && 'در حال تبدیل به فرمت صوتی استودیویی WAV...'}
                      {progress.status === 'completed' && 'دانلود با موفقیت تکمیل و ذخیره شد!'}
                      {progress.status === 'paused' && 'دانلود متوقف شد.'}
                      {progress.status === 'error' && (progress.errorMessage || 'خطا در دانلود')}
                    </h3>
                    <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[11px] text-amber-400">
                      {progress.activeProxy}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-[#9CA3AF]">
                    {formatBytes(progress.loadedBytes)} از {formatBytes(progress.totalBytes)} • سرعت:{' '}
                    <span className="text-emerald-400 font-semibold">
                      {formatBytes(progress.speedBytesPerSec)}/s
                    </span>
                    {progress.etaSeconds !== null && progress.status === 'downloading' && (
                      <> • زمان باقی‌مانده: {Math.ceil(progress.etaSeconds)} ثانیه</>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono text-xl font-bold text-amber-400 tabular-nums">
                  {progress.percent}%
                </span>
                {(progress.status === 'downloading' || progress.status === 'probing') && (
                  <button
                    type="button"
                    onClick={handleCancelDownload}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    لغو
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[#0B0C0E]">
              <div
                className={`h-full transition-all duration-200 ${
                  progress.status === 'completed'
                    ? 'bg-emerald-500'
                    : progress.status === 'error'
                    ? 'bg-red-500'
                    : 'bg-gradient-to-r from-red-500 via-amber-500 to-emerald-400'
                }`}
                style={{ width: `${Math.max(3, progress.percent)}%` }}
              />
            </div>

            {progress.sha256 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#0B0C0E] px-3 py-2 font-mono text-[11px] text-[#9CA3AF]">
                <span>SHA-256 Checksum Verified: {progress.sha256}</span>
                {progress.outputUrl && (
                  <a
                    href={progress.outputUrl}
                    download={progress.outputFilename}
                    className="text-emerald-400 underline hover:text-emerald-300"
                  >
                    ذخیره مجدد فایل ({progress.outputFilename})
                  </a>
                )}
              </div>
            )}
          </section>
        )}

        {/* Resolved Media Content */}
        {media && (
          <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Column: Video Preview & Metadata */}
            <div className="space-y-4 lg:col-span-5">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#121418]">
                <div className="relative aspect-video w-full bg-black">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${media.id}?rel=0`}
                    title={media.title}
                    className="h-full w-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>

                <div className="p-5 space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                    <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
                      {media.resolverEngine}
                    </span>
                    <span className="rounded border border-white/10 bg-[#191C22] px-2 py-0.5 text-[#9CA3AF]">
                      ID: {media.id}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold leading-snug text-[#F4F4F6]">{media.title}</h2>

                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/5 bg-[#0B0C0E] p-3 text-xs">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-red-400 shrink-0" />
                      <div className="truncate">
                        <div className="text-[10px] text-[#9CA3AF]">کانال</div>
                        <div className="font-medium truncate">{media.author}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                      <div>
                        <div className="text-[10px] text-[#9CA3AF]">مدت زمان</div>
                        <div className="font-mono font-medium">{formatDuration(media.durationSec)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-[10px] text-[#9CA3AF]">بازدید</div>
                        <div className="font-mono font-medium">{media.viewCount || 'HD'}</div>
                      </div>
                    </div>
                  </div>

                  {media.description && (
                    <p className="text-xs leading-relaxed text-[#9CA3AF] line-clamp-3">
                      {media.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Quality & Format Matrix */}
            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-white/10 bg-[#121418] p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('video')}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                        activeTab === 'video'
                          ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                          : 'bg-[#191C22] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      <Film className="h-4 w-4" />
                      <span>ویدیو (MP4 / WebM)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('audio')}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                        activeTab === 'audio'
                          ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                          : 'bg-[#191C22] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      <Music className="h-4 w-4" />
                      <span>فقط صدا (MP3 / WAV)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('image')}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                        activeTab === 'image'
                          ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                          : 'bg-[#191C22] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      <ImageIcon className="h-4 w-4" />
                      <span>کاور 4K/HD</span>
                    </button>
                  </div>

                  {activeTab === 'audio' && (
                    <label className="flex items-center gap-2 text-xs text-[#9CA3AF] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={convertAudioToWav}
                        onChange={(e) => setConvertAudioToWav(e.target.checked)}
                        className="rounded border-white/20 bg-[#0B0C0E] text-amber-500 focus:ring-0"
                      />
                      <span>تبدیل خودکار به WAV استودیویی (16-bit PCM)</span>
                    </label>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  {filteredFormats.map((fmt) => {
                    const isDownloadingThis =
                      activeFormatId === fmt.id &&
                      progress &&
                      (progress.status === 'downloading' || progress.status === 'probing');

                    const directProxyHref = buildProxyUrl(fmt.url, {
                      filename: `${media.id}-${fmt.quality}.${fmt.ext}`,
                      node: proxyMode,
                      download: true,
                    });

                    return (
                      <div
                        key={fmt.id}
                        className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0B0C0E] p-4 transition hover:border-white/20 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-red-500/15 px-2.5 py-0.5 font-mono text-xs font-bold text-red-400">
                              {fmt.quality}
                            </span>
                            <span className="text-sm font-semibold text-[#F4F4F6]">{fmt.label}</span>
                            <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#9CA3AF]">
                              {fmt.ext}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-[#9CA3AF]">
                            {fmt.sizeBytes && <span>حجم تقریبی: {formatBytes(fmt.sizeBytes)}</span>}
                            {fmt.bitrate && <span>بیت‌ریت: {fmt.bitrate}</span>}
                            {fmt.fps && <span>نرخ فریم: {fmt.fps} FPS</span>}
                            {fmt.hasAudio && (
                              <span className="inline-flex items-center gap-1 text-emerald-400">
                                <Volume2 className="h-3 w-3" /> دارای صدا
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleStartDownload(fmt, false)}
                            disabled={Boolean(isDownloadingThis)}
                            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-50 cursor-pointer"
                          >
                            {isDownloadingThis ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>در حال دانلود...</span>
                              </>
                            ) : (
                              <>
                                <Zap className="h-3.5 w-3.5" />
                                <span>دانلود شتاب‌دهنده ({parallelChunks}x)</span>
                              </>
                            )}
                          </button>

                          {fmt.type === 'video' && (
                            <button
                              type="button"
                              onClick={() => handleStartDownload(fmt, true)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20 cursor-pointer"
                              title="استخراج مستقیم صدای ویدیو با کیفیت WAV"
                            >
                              <Music className="h-3.5 w-3.5" />
                              <span>استخراج WAV</span>
                            </button>
                          )}

                          <a
                            href={directProxyHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#191C22] px-3 py-2.5 text-xs text-[#9CA3AF] transition hover:border-white/25 hover:text-white"
                            title="دانلود مستقیم از طریق تانل سرور"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>لینک تانل</span>
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Technical Assurance Footer */}
                <div className="mt-6 grid grid-cols-1 gap-3 border-t border-white/10 pt-4 sm:grid-cols-3 text-xs text-[#9CA3AF]">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>عبور خودکار از محدودیت IP و CORS یوتیوب</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-400 shrink-0" />
                    <span>پشتیبانی از دانلود چندتکه موازی (HTTP Range)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-red-400 shrink-0" />
                    <span>سوییچ خودکار بین ۴ نود در صورت افت سرعت</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

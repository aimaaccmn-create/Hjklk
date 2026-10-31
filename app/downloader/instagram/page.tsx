'use client';

import React, { useState, useRef } from 'react';
import { DownloaderNavbar } from '@/components/DownloaderNavbar';
import {
  PROXY_NODES,
  ProxyNodeId,
  ResolvedMediaResult,
  MediaFormatOption,
  CarouselSlideItem,
  DownloadProgressState,
  executeHighSpeedDownload,
  buildProxyUrl,
  formatBytes,
} from '@/lib/downloader-engine';
import {
  Instagram,
  Search,
  Download,
  Music,
  Film,
  Image as ImageIcon,
  Copy,
  Check,
  Sparkles,
  Server,
  Zap,
  Shield,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  Layers,
  XCircle,
} from 'lucide-react';

const SAMPLE_INSTAGRAM_LINKS = [
  {
    label: 'نمونه ویدیو Reels (1080p Full HD)',
    url: 'https://www.instagram.com/reel/C8ReelsKronosHD/',
  },
  {
    label: 'نمونه پست اسلایدی (Carousel چندتایی)',
    url: 'https://www.instagram.com/p/C9CarouselKronosPost/',
  },
  {
    label: 'نمونه استوری و موزیک ریلز',
    url: 'https://www.instagram.com/stories/kronos.studio/3491827361/',
  },
];

export default function InstagramDownloaderPage() {
  const [urlInput, setUrlInput] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [media, setMedia] = useState<ResolvedMediaResult | null>(null);

  const [proxyMode, setProxyMode] = useState<ProxyNodeId>('smart-auto');
  const [parallelChunks, setParallelChunks] = useState<1 | 2 | 4 | 8>(4);
  const [copiedCaption, setCopiedCaption] = useState(false);

  const [progress, setProgress] = useState<DownloadProgressState | null>(null);
  const [activeFormatId, setActiveFormatId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleResolve = async (targetUrl?: string) => {
    const finalUrl = (targetUrl ?? urlInput).trim();
    if (!finalUrl) {
      setResolveError('لطفاً لینک ریلز، پست یا استوری اینستاگرام را وارد کنید.');
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
          platform: 'instagram',
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'خطا در استخراج محتوا از اینستاگرام.');
      }

      setMedia(data as ResolvedMediaResult);
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'خطای ناشناخته در ارتباط با سرور اینستاگرام');
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
      setResolveError('دسترسی به کلیپ‌بورد مرورگر امکان‌پذیر نشد.');
    }
  };

  const handleCopyCaption = async () => {
    if (!media?.description) return;
    try {
      await navigator.clipboard.writeText(media.description);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleDownloadFormat = async (format: MediaFormatOption, forceWav = false) => {
    if (!media) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setActiveFormatId(format.id);
    const filename = `instagram-${media.id}-${format.quality.replace(/\s+/g, '_')}.${format.ext}`;

    try {
      await executeHighSpeedDownload({
        url: format.url,
        fallbackUrl: format.fallbackUrl,
        filename,
        proxyMode,
        parallelConnections: format.type === 'image' ? 1 : parallelChunks,
        customReferer: 'https://www.instagram.com/',
        convertToFormat: forceWav ? 'wav' : 'none',
        computeSha256: true,
        onProgress: (st) => setProgress({ ...st }),
        signal: controller.signal,
      });
    } catch (err) {
      if (!controller.signal.aborted) {
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

  const handleDownloadSlide = async (slide: CarouselSlideItem) => {
    if (!media) return;
    const ext = slide.type === 'video' ? 'mp4' : 'jpg';
    await handleDownloadFormat({
      id: slide.id,
      label: slide.label,
      quality: 'Original',
      ext,
      mimeType: slide.type === 'video' ? 'video/mp4' : 'image/jpeg',
      type: slide.type,
      url: slide.downloadUrl,
      fallbackUrl: slide.fallbackUrl,
    });
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0B0C0E] text-[#F4F4F6]">
      <DownloaderNavbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-2xl border border-pink-500/20 bg-gradient-to-b from-[#171118] to-[#121418] p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-lg border border-pink-500/30 bg-pink-500/10 px-3 py-1 text-xs font-medium text-pink-400">
                <Instagram className="h-4 w-4" />
                <span>دانلودر اختصاصی اینستاگرام • Reels, Carousel, Post & Audio</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-4xl text-[#F4F4F6]">
                دانلود ریلز، پست‌های چنداسلایدی و موزیک اینستاگرام بدون واترمارک
              </h1>
              <p className="text-sm leading-relaxed text-[#9CA3AF]">
                استخراج مستقیم ویدیوهای Reels با کیفیت اصلی 1080p، دانلود تک‌تک اسلایدهای پست‌های آلبومی (Carousel)، جداسازی موزیک و کپی کپشن با تانل ضدتحریم CDN.
              </p>
            </div>

            {/* Proxy & Multi-Chunk Control */}
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0B0C0E]/90 p-4 min-w-[290px]">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-[#F4F4F6]">
                  <Server className="h-3.5 w-3.5 text-pink-400" />
                  تانل پروکسی اینستاگرام:
                </span>
                <span className="font-mono text-[11px] text-emerald-400">CDN BYPASS ACTIVE</span>
              </div>
              <select
                value={proxyMode}
                onChange={(e) => setProxyMode(e.target.value as ProxyNodeId)}
                className="w-full rounded-lg border border-white/10 bg-[#121418] px-3 py-2 text-xs text-[#F4F4F6] focus:border-pink-500 focus:outline-none"
              >
                {PROXY_NODES.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name} ({node.region})
                  </option>
                ))}
              </select>

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-[#9CA3AF]">کانال‌های دانلود موازی:</span>
                <div className="flex items-center gap-1">
                  {([1, 2, 4, 8] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setParallelChunks(n)}
                      className={`rounded px-2 py-0.5 font-mono text-[11px] transition ${
                        parallelChunks === n
                          ? 'bg-pink-600 text-white font-semibold'
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

          {/* URL Input */}
          <div className="mt-6 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <input
                  type="url"
                  dir="ltr"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleResolve()}
                  placeholder="https://www.instagram.com/reel/... or https://www.instagram.com/p/..."
                  className="w-full rounded-xl border border-white/15 bg-[#0B0C0E] py-3.5 pl-4 pr-28 font-mono text-sm text-[#F4F4F6] placeholder-[#9CA3AF]/50 focus:border-pink-500 focus:outline-none"
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
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-pink-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-pink-600/25 transition hover:bg-pink-500 disabled:opacity-50 cursor-pointer"
              >
                {isResolving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>در حال دریافت مدیا...</span>
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    <span>استخراج ریلز / پست</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Sample Links */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-[#9CA3AF] flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-pink-400" />
                تست آنی با لینک‌های نمونه:
              </span>
              {SAMPLE_INSTAGRAM_LINKS.map((sample) => (
                <button
                  key={sample.url}
                  type="button"
                  onClick={() => {
                    setUrlInput(sample.url);
                    handleResolve(sample.url);
                  }}
                  className="rounded-lg border border-white/10 bg-[#191C22]/80 px-2.5 py-1 text-xs text-[#9CA3AF] transition hover:border-pink-500/40 hover:text-[#F4F4F6]"
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

        {/* Live Download Telemetry */}
        {progress && (
          <section className="mt-6 rounded-2xl border border-pink-500/30 bg-[#121418] p-5 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {progress.status === 'completed' ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                ) : progress.status === 'error' ? (
                  <AlertCircle className="h-6 w-6 text-red-400" />
                ) : (
                  <Loader2 className="h-6 w-6 animate-spin text-pink-400" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#F4F4F6]">
                      {progress.status === 'completed'
                        ? 'فایل اینستاگرام با موفقیت دانلود شد!'
                        : progress.status === 'error'
                        ? progress.errorMessage
                        : 'در حال دانلود پرسرعت از CDN اینستاگرام...'}
                    </h3>
                    <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[11px] text-pink-400">
                      {progress.activeProxy}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-[#9CA3AF]">
                    {formatBytes(progress.loadedBytes)} از {formatBytes(progress.totalBytes)} • سرعت:{' '}
                    <span className="text-emerald-400 font-semibold">
                      {formatBytes(progress.speedBytesPerSec)}/s
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono text-xl font-bold text-pink-400 tabular-nums">
                  {progress.percent}%
                </span>
                {(progress.status === 'downloading' || progress.status === 'probing') && (
                  <button
                    type="button"
                    onClick={() => abortControllerRef.current?.abort()}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    لغو
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[#0B0C0E]">
              <div
                className="h-full bg-gradient-to-r from-pink-500 via-amber-500 to-emerald-400 transition-all duration-200"
                style={{ width: `${Math.max(3, progress.percent)}%` }}
              />
            </div>
          </section>
        )}

        {/* Resolved Instagram Result */}
        {media && (
          <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Column: Video/Cover Preview & Caption */}
            <div className="space-y-4 lg:col-span-5">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#121418]">
                <div className="relative aspect-[4/5] max-h-[420px] w-full bg-black flex items-center justify-center overflow-hidden">
                  <video
                    src={buildProxyUrl(media.formats[0]?.url || '', {
                      referer: 'https://www.instagram.com/',
                    })}
                    poster={buildProxyUrl(media.thumbnailUrl, {
                      referer: 'https://www.instagram.com/',
                    })}
                    controls
                    playsInline
                    className="h-full w-full object-contain"
                  />
                </div>

                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-[#F4F4F6]">{media.author}</h2>
                      <p className="font-mono text-xs text-pink-400">{media.authorHandle}</p>
                    </div>
                    <span className="rounded-lg border border-pink-500/30 bg-pink-500/10 px-2.5 py-1 font-mono text-[11px] text-pink-300">
                      {media.resolverEngine}
                    </span>
                  </div>

                  {/* Caption Box with 1-Click Copy */}
                  <div className="rounded-xl border border-white/10 bg-[#0B0C0E] p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
                      <span>کپشن و هشتگ‌های پست:</span>
                      <button
                        type="button"
                        onClick={handleCopyCaption}
                        className="inline-flex items-center gap-1 text-pink-400 hover:text-pink-300 cursor-pointer"
                      >
                        {copiedCaption ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-emerald-400">کپی شد</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>کپی کپشن</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs leading-relaxed text-[#F4F4F6]/90">{media.description}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Download Formats & Carousel Gallery */}
            <div className="space-y-6 lg:col-span-7">
              <div className="rounded-2xl border border-white/10 bg-[#121418] p-5 sm:p-6">
                <h3 className="text-base font-bold text-[#F4F4F6] flex items-center gap-2 border-b border-white/10 pb-3">
                  <Download className="h-4 w-4 text-pink-400" />
                  <span>گزینه‌های دانلود مستقیم (بدون واترمارک)</span>
                </h3>

                <div className="mt-4 space-y-3">
                  {media.formats.map((fmt) => {
                    const isDownloadingThis =
                      activeFormatId === fmt.id &&
                      progress &&
                      (progress.status === 'downloading' || progress.status === 'probing');

                    return (
                      <div
                        key={fmt.id}
                        className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0B0C0E] p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {fmt.type === 'video' ? (
                              <Film className="h-4 w-4 text-pink-400" />
                            ) : fmt.type === 'audio' ? (
                              <Music className="h-4 w-4 text-amber-400" />
                            ) : (
                              <ImageIcon className="h-4 w-4 text-emerald-400" />
                            )}
                            <span className="text-sm font-semibold text-[#F4F4F6]">{fmt.label}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono text-xs text-[#9CA3AF]">
                            <span>کیفیت: {fmt.quality}</span>
                            {fmt.sizeBytes && <span>حجم: {formatBytes(fmt.sizeBytes)}</span>}
                            <span className="uppercase">{fmt.ext}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownloadFormat(fmt, false)}
                            disabled={Boolean(isDownloadingThis)}
                            className="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-pink-500 disabled:opacity-50 cursor-pointer"
                          >
                            {isDownloadingThis ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Zap className="h-3.5 w-3.5" />
                            )}
                            <span>دانلود با پروکسی ({parallelChunks}x)</span>
                          </button>

                          {fmt.type === 'audio' && (
                            <button
                              type="button"
                              onClick={() => handleDownloadFormat(fmt, true)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                            >
                              <Music className="h-3.5 w-3.5" />
                              <span>خروجی WAV</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Multi-Slide Carousel Section */}
              {media.carousel && media.carousel.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-[#121418] p-5 sm:p-6">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="text-base font-bold text-[#F4F4F6] flex items-center gap-2">
                      <Layers className="h-4 w-4 text-amber-400" />
                      <span>اسلایدهای پست آلبومی (Carousel Items)</span>
                    </h3>
                    <span className="font-mono text-xs text-[#9CA3AF]">
                      {media.carousel.length} اسلاید شناسایی شد
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {media.carousel.map((slide) => (
                      <div
                        key={slide.id}
                        className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#0B0C0E] p-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="rounded bg-pink-500/15 px-2 py-0.5 font-mono text-[10px] text-pink-400 uppercase">
                              {slide.type}
                            </span>
                            <span className="font-mono text-[10px] text-[#9CA3AF]">
                              {slide.width}x{slide.height}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-[#F4F4F6]">{slide.label}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDownloadSlide(slide)}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-pink-500/30 bg-pink-500/10 py-2 text-xs font-semibold text-pink-300 transition hover:bg-pink-600 hover:text-white cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>دانلود این اسلاید</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

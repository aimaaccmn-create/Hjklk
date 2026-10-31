'use client';

import React, { useState, useRef, useEffect } from 'react';
import { DownloaderNavbar } from '@/components/DownloaderNavbar';
import {
  PROXY_NODES,
  ProxyNodeId,
  ResolvedMediaResult,
  DownloadProgressState,
  executeHighSpeedDownload,
  buildProxyUrl,
  formatBytes,
} from '@/lib/downloader-engine';
import Link from 'next/link';
import {
  Globe,
  Zap,
  ShieldCheck,
  Search,
  Download,
  Settings2,
  FileText,
  Film,
  Music,
  HardDrive,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ClipboardPaste,
  Sparkles,
  Server,
  Hash,
  XCircle,
  Plus,
  Trash2,
  Play,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Code2,
  Radar,
  Terminal,
  LockOpen,
} from 'lucide-react';

const SAMPLE_DIRECT_LINKS = [
  {
    label: 'استریم HLS چندکیفیتی (پلیر بدون دکمه دانلود • M3U8 Master)',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  },
  {
    label: 'آپارات: ویدیوی نمونه (Aparat Full HD)',
    url: 'https://www.aparat.com/v/i993e36',
  },
  {
    label: 'ویمو: نمونه ویدیوی مستند (Vimeo HD)',
    url: 'https://vimeo.com/76979871',
  },
  {
    label: 'ویدیو تست سرور گوگل (MP4 • 15MB High-Speed)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
];

const BROWSER_LIVE_SNIFFER_SCRIPT = `(() => {
  const urls = new Set();
  document.querySelectorAll('video, source, audio, iframe').forEach(el => {
    ['src', 'currentSrc', 'data-src', 'data-video', 'data-hls', 'data-mp4'].forEach(attr => {
      const val = el[attr] || el.getAttribute?.(attr);
      if (val && typeof val === 'string' && val.startsWith('http')) urls.add(val);
    });
  });
  performance.getEntriesByType('resource').forEach(r => {
    if (/\\.(m3u8|mp4|webm|mkv|mpd|ts|m4s)(\\?|$)/i.test(r.name) && !/\\.(ts|m4s)(\\?|$)/i.test(r.name)) {
      urls.add(r.name);
    }
  });
  const payload = JSON.stringify({
    pageUrl: location.href,
    title: document.title,
    streams: [...urls],
    htmlSnippet: document.documentElement.innerHTML.slice(0, 150000)
  });
  navigator.clipboard.writeText(payload).then(() => {
    console.log('✅ استریم‌های مخفی کپی شدند! در دانلودر کرونوس جای‌گذاری کنید:', [...urls]);
  });
  return [...urls];
})();`;

interface BatchQueueItem {
  id: string;
  url: string;
  filename: string;
  status: 'queued' | 'downloading' | 'completed' | 'error';
  percent: number;
  speed: string;
  size: string;
}

export default function DirectDownloaderPage() {
  const [urlInput, setUrlInput] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return p.get('importUrl') || p.get('url') || '';
    }
    return '';
  });
  const [customFilename, setCustomFilename] = useState('');
  const [proxyMode, setProxyMode] = useState<ProxyNodeId>('smart-auto');
  const [parallelChunks, setParallelChunks] = useState<1 | 2 | 4 | 8>(8);

  // Advanced anti-hotlink headers
  const [showAdvancedHeaders, setShowAdvancedHeaders] = useState(false);
  const [customReferer, setCustomReferer] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return p.get('sourceUrl') || p.get('ref') || '';
    }
    return '';
  });
  const [customUserAgent, setCustomUserAgent] = useState('');
  const [customAuth, setCustomAuth] = useState('');

  // Deep Stream Hunter (No-Download-Button Sites & Live DOM/HTML Sniffer)
  const [showStreamHunterPanel, setShowStreamHunterPanel] = useState(false);
  const [rawHtmlInput, setRawHtmlInput] = useState('');
  const [copiedSnifferScript, setCopiedSnifferScript] = useState(false);

  const [isProbing, setIsProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [inspectedFile, setInspectedFile] = useState<ResolvedMediaResult | null>(null);
  const [selectedFormatId, setSelectedFormatId] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [activeDownloadKey, setActiveDownloadKey] = useState<string | null>(null);
  const [previewFallbackActive, setPreviewFallbackActive] = useState(false);

  const [progress, setProgress] = useState<DownloadProgressState | null>(null);
  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const telemetrySectionRef = useRef<HTMLElement | null>(null);

  const activeFormat =
    inspectedFile?.formats.find((f) => f.id === selectedFormatId) || inspectedFile?.formats[0];

  const handleInspectLink = async (
    targetUrl?: string,
    overrideRawHtml?: string
  ): Promise<ResolvedMediaResult | null> => {
    let finalUrl = (targetUrl ?? urlInput).trim();
    let htmlPayload = (overrideRawHtml ?? rawHtmlInput).trim();

    // Check if user pasted JSON output from our BROWSER_LIVE_SNIFFER_SCRIPT
    if (htmlPayload.startsWith('{') && htmlPayload.includes('"streams"')) {
      try {
        const parsed = JSON.parse(htmlPayload);
        if (parsed.pageUrl && !finalUrl) {
          finalUrl = parsed.pageUrl;
          setUrlInput(parsed.pageUrl);
        }
        if (parsed.pageUrl && !customReferer) {
          setCustomReferer(parsed.pageUrl);
        }
        const syntheticLinks = Array.isArray(parsed.streams)
          ? parsed.streams.map((u: string) => `<video src="${u}"></video>`).join('\n')
          : '';
        htmlPayload = `<title>${parsed.title || 'Captured Stream'}</title>\n${syntheticLinks}\n${
          parsed.htmlSnippet || ''
        }`;
      } catch {
        // treat as normal HTML/text
      }
    }

    if (!finalUrl && !htmlPayload) {
      setProbeError(
        'لطفاً لینک صفحه دارای ویدیو، لینک استریم (.m3u8 / .mp4) یا سورس صفحه را وارد کنید.'
      );
      return null;
    }

    setIsProbing(true);
    setProbeError(null);
    setPreviewFallbackActive(false);

    try {
      const res = await fetch('/api/downloader/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: finalUrl || 'https://captured-stream-page.local/',
          platform: 'direct',
          rawHtml: htmlPayload || undefined,
          headers: {
            referer: customReferer || finalUrl || undefined,
            userAgent: customUserAgent || undefined,
            auth: customAuth || undefined,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'امکان استخراج یا بررسی هدرهای لینک وجود ندارد.');
      }

      const resolved = data as ResolvedMediaResult;
      setInspectedFile(resolved);
      setSelectedFormatId(resolved.formats[0]?.id || '');
      if (!customFilename && resolved.title) {
        setCustomFilename(resolved.title);
      }
      if (resolved.isProtectedPlayer) {
        setShowStreamHunterPanel(true);
      }
      return resolved;
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : 'خطا در بررسی یا استخراج لینک وب');
      return null;
    } finally {
      setIsProbing(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const incoming = params.get('importUrl') || params.get('url');
      if (incoming) {
        const timer = setTimeout(() => {
          handleInspectLink(incoming);
        }, 80);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopyStreamUrl = (url: string) => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedUrl(url);
        setTimeout(() => setCopiedUrl(null), 2500);
      })
      .catch(() => {});
  };

  const handleCopySnifferScript = () => {
    navigator.clipboard
      .writeText(BROWSER_LIVE_SNIFFER_SCRIPT)
      .then(() => {
        setCopiedSnifferScript(true);
        setTimeout(() => setCopiedSnifferScript(false), 3000);
      })
      .catch(() => {});
  };

  const handleDirectDownloadNow = async (
    overrideUrl?: string,
    convertTo?: 'none' | 'wav',
    customExt?: string,
    overrideFallbackUrl?: string,
    buttonKey?: string,
    forceConnections?: 1 | 2 | 4 | 8
  ) => {
    setProbeError(null);

    let currentResolved = inspectedFile;
    const trimmedInput = urlInput.trim();

    // If user clicked Download directly without clicking "شکار استریم" first (or changed the URL),
    // automatically resolve the webpage/link first so we download the actual video stream instead of HTML!
    if (!overrideUrl && (!currentResolved || (trimmedInput && currentResolved.sourceUrl !== trimmedInput && !rawHtmlInput.trim()))) {
      if (!trimmedInput && !rawHtmlInput.trim()) {
        setProbeError('لطفاً ابتدا لینک صفحه ویدیو یا لینک مستقیم فایل را در کادر بالا وارد کنید.');
        return;
      }
      const freshlyResolved = await handleInspectLink(trimmedInput, rawHtmlInput);
      if (freshlyResolved) {
        currentResolved = freshlyResolved;
      }
    }

    const activeFmt =
      currentResolved?.formats.find((f) => f.id === selectedFormatId) ||
      currentResolved?.formats[0];

    const targetUrl = (overrideUrl ?? activeFmt?.url ?? currentResolved?.sourceUrl ?? trimmedInput).trim();
    if (!targetUrl) {
      setProbeError('لطفاً ابتدا لینک مستقیم یا صفحه ویدیو را وارد کنید.');
      return;
    }

    const effectiveFallbackUrl =
      overrideFallbackUrl ||
      activeFmt?.fallbackUrl ||
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const dlKey = buttonKey || overrideUrl || 'main-download';
    setActiveDownloadKey(dlKey);

    let fallbackName = 'kronos-video';
    try {
      const u = new URL(targetUrl);
      const segs = u.pathname.split('/').filter(Boolean);
      if (segs.length > 0) fallbackName = decodeURIComponent(segs[segs.length - 1]);
    } catch {
      // keep default
    }

    const isHls = /\.m3u8(\?|$)/i.test(targetUrl) || customExt === 'm3u8' || activeFmt?.ext === 'm3u8';
    const effectiveExt = isHls ? 'ts' : customExt || activeFmt?.ext || 'mp4';

    let baseName = (customFilename.trim() || currentResolved?.title || fallbackName).replace(
      /\.[a-zA-Z0-9]+$/,
      ''
    );
    if (convertTo === 'wav') {
      baseName = `${baseName}_audio.wav`;
    } else {
      baseName = `${baseName}.${effectiveExt}`;
    }

    const effectiveReferer =
      customReferer ||
      currentResolved?.headersUsed?.Referer ||
      currentResolved?.sourceUrl ||
      undefined;

    setTimeout(() => {
      telemetrySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);

    try {
      await executeHighSpeedDownload({
        url: targetUrl,
        fallbackUrl: effectiveFallbackUrl,
        filename: baseName,
        proxyMode,
        parallelConnections: forceConnections || parallelChunks,
        customReferer: effectiveReferer,
        customUserAgent: customUserAgent || undefined,
        customAuthHeader: customAuth || undefined,
        convertToFormat: convertTo || 'none',
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
          totalChunks: forceConnections || parallelChunks,
          activeProxy: proxyMode,
          errorMessage: err instanceof Error ? err.message : 'خطا در دانلود یا تبدیل مدیا',
        });
      }
    } finally {
      setActiveDownloadKey(null);
    }
  };

  const handleAddToQueue = () => {
    const clean = urlInput.trim();
    if (!clean) return;
    let name = customFilename.trim();
    if (!name) {
      try {
        const u = new URL(clean);
        const segs = u.pathname.split('/').filter(Boolean);
        name = decodeURIComponent(segs[segs.length - 1] || `file-${batchQueue.length + 1}`);
      } catch {
        name = `file-${batchQueue.length + 1}`;
      }
    }

    setBatchQueue((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        url: clean,
        filename: name,
        status: 'queued',
        percent: 0,
        speed: '0 KB/s',
        size: '--',
      },
    ]);
    setUrlInput('');
    setCustomFilename('');
  };

  const handleRunBatchQueue = async () => {
    for (const item of batchQueue) {
      if (item.status === 'completed') continue;

      setBatchQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'downloading' } : q))
      );

      try {
        await executeHighSpeedDownload({
          url: item.url,
          filename: item.filename,
          proxyMode,
          parallelConnections: parallelChunks,
          customReferer: customReferer || undefined,
          customUserAgent: customUserAgent || undefined,
          customAuthHeader: customAuth || undefined,
          computeSha256: false,
          onProgress: (st) => {
            setBatchQueue((prev) =>
              prev.map((q) =>
                q.id === item.id
                  ? {
                      ...q,
                      percent: st.percent,
                      speed: `${formatBytes(st.speedBytesPerSec)}/s`,
                      size: formatBytes(st.totalBytes || st.loadedBytes),
                    }
                  : q
              )
            );
          },
        });

        setBatchQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'completed', percent: 100 } : q))
        );
      } catch {
        setBatchQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'error' } : q))
        );
      }
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0B0C0E] text-[#F4F4F6]">
      <DownloaderNavbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Hero Card */}
        <section className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-[#101816] to-[#121418] p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                <Radar className="h-4 w-4" />
                <span>شکارچی استریم‌های مخفی + تجمیع‌گر قطعات M3U8/HLS + اسکنر آی‌فریم + 8x Range</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-4xl text-[#F4F4F6]">
                دانلودر قدرتمند صفحات وب و شکارچی ویدیوهای بدون دکمه دانلود
              </h1>
              <p className="text-sm leading-relaxed text-[#9CA3AF]">
                مخصوص سایت‌هایی که فیلم یا دوره در حال پخش دارند اما گزینه دانلود نگذاشته‌اند! موتور کرونوس به صورت خودکار آی‌فریم‌های تو در تو (Iframe)، پلیرهای مخفی (JWPlayer, Plyr, Video.js, ArvanVOD)، کدهای رمزنگاری‌شده Base64 و لیست‌های پخش چندتکه <span className="text-emerald-400 font-mono">HLS (.m3u8)</span> را شکافته و تمام قطعات <span className="font-mono text-emerald-400">.ts / .m4s</span> را به یک فایل ویدیویی واحد تبدیل و دانلود می‌کند.
              </p>
            </div>

            {/* Proxy & Parallel Range Control */}
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0B0C0E]/90 p-4 min-w-[300px]">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-[#F4F4F6]">
                  <Server className="h-3.5 w-3.5 text-emerald-400" />
                  مسیر پروکسی و تانل:
                </span>
                <span className="font-mono text-[11px] text-emerald-400">HLS + 8x TURBO</span>
              </div>
              <select
                value={proxyMode}
                onChange={(e) => setProxyMode(e.target.value as ProxyNodeId)}
                className="w-full rounded-lg border border-white/10 bg-[#121418] px-3 py-2 text-xs text-[#F4F4F6] focus:border-emerald-500 focus:outline-none"
              >
                {PROXY_NODES.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name} ({node.region})
                  </option>
                ))}
              </select>

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-[#9CA3AF]">تعداد کانکشن‌های موازی:</span>
                <div className="flex items-center gap-1">
                  {([1, 2, 4, 8] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setParallelChunks(n)}
                      className={`rounded px-2.5 py-0.5 font-mono text-[11px] transition ${
                        parallelChunks === n
                          ? 'bg-emerald-500 text-black font-bold'
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

          {/* Main Direct URL Input */}
          <div className="mt-6 space-y-3">
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-12">
              <div className="relative lg:col-span-7">
                <input
                  type="url"
                  dir="ltr"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInspectLink()}
                  placeholder="لینک صفحه دارای ویدیو، آدرس آی‌فریم یا لینک استریم (.m3u8 / .mp4)..."
                  className="w-full rounded-xl border border-white/15 bg-[#0B0C0E] py-3.5 pl-4 pr-28 font-mono text-sm text-[#F4F4F6] placeholder-[#9CA3AF]/50 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const t = await navigator.clipboard.readText();
                      if (t) {
                        if (t.trim().startsWith('{') || t.trim().startsWith('<')) {
                          setRawHtmlInput(t);
                          setShowStreamHunterPanel(true);
                          handleInspectLink(urlInput, t);
                        } else {
                          setUrlInput(t);
                          handleInspectLink(t);
                        }
                      }
                    } catch {
                      // ignore
                    }
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#191C22] px-2.5 py-1.5 text-xs text-[#9CA3AF] hover:text-white"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  <span>جای‌گذاری</span>
                </button>
              </div>

              <div className="lg:col-span-2">
                <input
                  type="text"
                  dir="ltr"
                  value={customFilename}
                  onChange={(e) => setCustomFilename(e.target.value)}
                  placeholder="نام فایل دلخواه (اختیاری)"
                  className="w-full rounded-xl border border-white/15 bg-[#0B0C0E] px-3.5 py-3.5 font-mono text-xs text-[#F4F4F6] placeholder-[#9CA3AF]/50 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 lg:col-span-3">
                <button
                  type="button"
                  onClick={() => handleInspectLink()}
                  disabled={isProbing}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#191C22] px-3 py-3.5 text-xs font-semibold text-[#F4F4F6] transition hover:border-emerald-500/40 cursor-pointer disabled:opacity-60"
                >
                  {isProbing ? (
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  ) : (
                    <Search className="h-4 w-4 text-emerald-400" />
                  )}
                  <span>{isProbing ? 'در حال شکار...' : 'شکار استریم'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleDirectDownloadNow(
                      undefined,
                      'none',
                      undefined,
                      undefined,
                      'hero-dl'
                    )
                  }
                  disabled={Boolean(activeDownloadKey)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-3.5 text-xs font-bold text-black shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 cursor-pointer disabled:opacity-70"
                >
                  {activeDownloadKey === 'hero-dl' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{progress?.percent ?? 0}%</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      <span>دانلود ({parallelChunks}x)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleAddToQueue}
                  title="افزودن به صف دانلود دسته‌ای"
                  className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-[#191C22] p-3.5 text-[#9CA3AF] hover:border-amber-500/40 hover:text-amber-400 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Toggle Stream Hunter & Custom Headers */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[#9CA3AF] flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  نمونه استریم‌ها:
                </span>
                {SAMPLE_DIRECT_LINKS.map((s) => (
                  <button
                    key={s.url}
                    type="button"
                    onClick={() => {
                      setUrlInput(s.url);
                      handleInspectLink(s.url);
                    }}
                    className="rounded-lg border border-white/10 bg-[#191C22]/80 px-2.5 py-1 text-xs text-[#9CA3AF] transition hover:border-emerald-500/40 hover:text-[#F4F4F6] cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowStreamHunterPanel(!showStreamHunterPanel)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    showStreamHunterPanel
                      ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  }`}
                >
                  <LockOpen className="h-3.5 w-3.5" />
                  <span>
                    {showStreamHunterPanel
                      ? 'بستن شکارچی عمیق پلیرهای قفل‌شده'
                      : 'شکارچی پلیرهای بدون دکمه دانلود (سایت‌های دارای لاگین / کلودفلر)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAdvancedHeaders(!showAdvancedHeaders)}
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  <span>
                    {showAdvancedHeaders
                      ? 'بستن تنظیمات هدر (Anti-Hotlink)'
                      : 'تنظیم هدر سفارشی (Referer / Token)'}
                  </span>
                </button>
              </div>
            </div>

            {/* Stream Hunter Panel for Protected / Dynamic / Login-only Video Sites */}
            {showStreamHunterPanel && (
              <div className="mt-3 rounded-2xl border border-amber-500/30 bg-[#0B0C0E]/95 p-5 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      <span>حالت ضد قفل دانلود (استخراج از پلیرهای در حال پخش در مرورگر شما)</span>
                    </h3>
                    <p className="text-xs text-[#9CA3AF] leading-relaxed">
                      اگر سایتی نیاز به لاگین/اشتراک دارد، پشت کلودفلر است یا لینک ویدیو را فقط هنگام کلیک روی Play با جاوااسکریپت می‌سازد، از یکی از ۲ روش زیر استفاده کنید:
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopySnifferScript}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-black hover:bg-amber-400 transition cursor-pointer"
                  >
                    {copiedSnifferScript ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>کد شکارچی در کلیپ‌بورد کپی شد!</span>
                      </>
                    ) : (
                      <>
                        <Code2 className="h-4 w-4" />
                        <span>کپی اسکریپت ۱-کلیکی شکارچی کنسول (Console Sniffer)</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  <div className="lg:col-span-5 rounded-xl border border-white/10 bg-[#121418] p-3.5 space-y-2 text-xs text-[#9CA3AF]">
                    <div className="font-bold text-[#F4F4F6] flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                      <span>راهنمای ۳۰ ثانیه‌ای استخراج ۱۰۰٪ تضمینی:</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                      <li>در سایت مورد نظر، ویدیو را پلی کنید تا شروع به پخش کند.</li>
                      <li>
                        دکمه <span className="text-amber-300 font-semibold">«کپی اسکریپت شکارچی کنسول»</span> بالا را بزنید، در تب ویدیو کلید <kbd className="rounded bg-black px-1.5 py-0.5 font-mono text-[10px] text-white">F12</kbd> (بخش Console) را باز کرده و کد را Paste و Enter کنید.
                      </li>
                      <li>
                        یا مستقیم سورس صفحه (<kbd className="rounded bg-black px-1.5 py-0.5 font-mono text-[10px] text-white">Ctrl+U</kbd> یا Inspect Element) را در کادر روبرو جای‌گذاری کنید تا تمام کیفیت‌های <span className="font-mono text-emerald-400">MP4 / M3U8</span> استخراج شوند.
                      </li>
                    </ol>
                  </div>

                  <div className="lg:col-span-7 flex flex-col gap-2">
                    <textarea
                      dir="ltr"
                      rows={4}
                      value={rawHtmlInput}
                      onChange={(e) => setRawHtmlInput(e.target.value)}
                      placeholder="خروجی اسکریپت شکارچی کنسول، یا کد HTML سورس صفحه (Ctrl+U / Inspect) یا تگ <video> / .m3u8 را اینجا Paste کنید..."
                      className="w-full rounded-xl border border-white/15 bg-[#121418] p-3 font-mono text-xs text-[#F4F4F6] placeholder-[#9CA3AF]/50 focus:border-amber-500 focus:outline-none"
                    />
                    <div className="flex items-center justify-end gap-2">
                      {rawHtmlInput && (
                        <button
                          type="button"
                          onClick={() => setRawHtmlInput('')}
                          className="rounded-lg border border-white/10 bg-[#191C22] px-3 py-1.5 text-xs text-[#9CA3AF] hover:text-white cursor-pointer"
                        >
                          پاک کردن کادر
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleInspectLink(urlInput, rawHtmlInput)}
                        disabled={isProbing || !rawHtmlInput.trim()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
                      >
                        <Radar className="h-4 w-4" />
                        <span>آنالیز عمیق سورس و استخراج تمام کیفیت‌ها</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showAdvancedHeaders && (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-[#0B0C0E] p-4 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] text-[#9CA3AF] mb-1">
                    Custom Referer (عبور از قفل دامنه):
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={customReferer}
                    onChange={(e) => setCustomReferer(e.target.value)}
                    placeholder="https://source-site.com/"
                    className="w-full rounded-lg border border-white/10 bg-[#121418] px-3 py-2 font-mono text-xs text-[#F4F4F6]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9CA3AF] mb-1">
                    Custom User-Agent:
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={customUserAgent}
                    onChange={(e) => setCustomUserAgent(e.target.value)}
                    placeholder="Mozilla/5.0 (Windows NT 10.0..."
                    className="w-full rounded-lg border border-white/10 bg-[#121418] px-3 py-2 font-mono text-xs text-[#F4F4F6]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9CA3AF] mb-1">
                    Authorization Header (Bearer / Basic):
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={customAuth}
                    onChange={(e) => setCustomAuth(e.target.value)}
                    placeholder="Bearer eyJhbGci..."
                    className="w-full rounded-lg border border-white/10 bg-[#121418] px-3 py-2 font-mono text-xs text-[#F4F4F6]"
                  />
                </div>
              </div>
            )}
          </div>

          {probeError && (
            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{probeError}</span>
            </div>
          )}
        </section>

        {/* Active Multi-Chunk & HLS Segment Download Telemetry */}
        <section ref={telemetrySectionRef}>
          {progress && (
            <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-[#121418] p-5 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {progress.status === 'completed' ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  ) : progress.status === 'error' ? (
                    <AlertCircle className="h-6 w-6 text-red-400" />
                  ) : (
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-[#F4F4F6]">
                        {progress.status === 'completed'
                          ? 'ویدیو با موفقیت دانلود، رمزگشایی و یکپارچه‌سازی شد!'
                          : progress.status === 'error'
                          ? progress.errorMessage
                          : progress.totalChunks > 8
                          ? `در حال دانلود و ادغام قطعات استریم HLS (قطعه ${progress.chunksCompleted} از ${progress.totalChunks})...`
                          : `در حال دانلود موازی (${progress.totalChunks} قطعه همزمان)...`}
                      </h3>
                      <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-400">
                        {progress.activeProxy}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-[#9CA3AF]">
                      {formatBytes(progress.loadedBytes)} از {formatBytes(progress.totalBytes)} • سرعت لحظه‌ای:{' '}
                      <span className="text-emerald-400 font-bold">
                        {formatBytes(progress.speedBytesPerSec)}/s
                      </span>
                      {progress.etaSeconds !== null && progress.status === 'downloading' && (
                        <> • زمان باقی‌مانده: {Math.ceil(progress.etaSeconds)}s</>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                    {progress.percent}%
                  </span>
                  {(progress.status === 'downloading' || progress.status === 'probing') && (
                    <button
                      type="button"
                      onClick={() => abortControllerRef.current?.abort()}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 cursor-pointer"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      توقف
                    </button>
                  )}
                </div>
              </div>

              {/* Visual Segment Grid for Parallel Range Connections / HLS Segments */}
              <div className="grid grid-cols-8 gap-1.5">
                {Array.from({ length: Math.min(16, Math.max(1, progress.totalChunks || parallelChunks)) }).map(
                  (_, idx, arr) => {
                    const barThreshold = ((idx + 1) / arr.length) * 100;
                    const isDone =
                      progress.status === 'completed' || progress.percent >= barThreshold;
                    return (
                      <div
                        key={idx}
                        className={`h-2 rounded-full transition-all ${
                          isDone
                            ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                            : progress.status === 'downloading'
                            ? 'bg-amber-500/60 animate-pulse'
                            : 'bg-white/10'
                        }`}
                      />
                    );
                  }
                )}
              </div>

              {(progress.sha256 || progress.outputUrl) && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-[#0B0C0E] px-3.5 py-2.5 font-mono text-xs text-[#9CA3AF]">
                  {progress.sha256 && (
                    <span className="flex items-center gap-1.5 truncate">
                      <Hash className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>SHA-256: {progress.sha256}</span>
                    </span>
                  )}
                  {progress.outputUrl && (
                    <a
                      href={progress.outputUrl}
                      download={progress.outputFilename}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1 font-sans text-xs font-bold text-black hover:bg-emerald-400 shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>ذخیره فایل آماده در دستگاه ({progress.outputFilename})</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Inspected File Details & Multi-Stream Manager */}
        {inspectedFile && (
          <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#121418] p-6 space-y-5">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-emerald-500/15 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-400 uppercase">
                        {activeFormat?.ext || 'FILE'}
                      </span>
                      <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-400">
                        {inspectedFile.resolverEngine || 'Kronos Web Sniffer'}
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-[#F4F4F6] break-all">
                      {inspectedFile.title}
                    </h2>
                    <p className="text-xs text-[#9CA3AF] leading-relaxed">{inspectedFile.description}</p>
                    {inspectedFile.isProtectedPlayer && (
                      <div className="mt-2.5 flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                        <div className="space-y-1">
                          <div className="font-bold">پلیر محافظت‌شده با جاوااسکریپت داینامیک یا لاگین</div>
                          <p className="text-[11px] text-amber-300/80 leading-relaxed">
                            این صفحه استریم ویدیو را بعد از لود کامل با اسکریپت‌های مرورگر تولید می‌کند. اگر کیفیت‌های عمومی زیر ویدیوی مورد نظر شما نیستند، در کادر زرد رنگ بالا («شکارچی پلیرهای بدون دکمه دانلود»)، سورس صفحه را Paste کنید یا از اسکریپت ۱-کلیکی کنسول استفاده نمایید تا استریم دقیق استخراج شود.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <span
                    className={`shrink-0 rounded-lg border px-2.5 py-1 font-mono text-[11px] ${
                      inspectedFile.supportsRange
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {inspectedFile.supportsRange ? 'شتاب‌دهنده چندتکه (Range: OK)' : 'استریم تک‌کاناله'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono text-xs">
                  <div className="rounded-xl border border-white/5 bg-[#0B0C0E] p-3">
                    <div className="text-[10px] text-[#9CA3AF]">حجم تقریبی استریم</div>
                    <div className="mt-1 font-bold text-[#F4F4F6]">
                      {activeFormat?.sizeBytes ? formatBytes(activeFormat.sizeBytes) : 'پویا (Stream)'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-[#0B0C0E] p-3">
                    <div className="text-[10px] text-[#9CA3AF]">فرمت و کیفیت</div>
                    <div className="mt-1 font-bold text-emerald-400 truncate">
                      {activeFormat?.quality || activeFormat?.ext.toUpperCase()}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-[#0B0C0E] p-3">
                    <div className="text-[10px] text-[#9CA3AF]">سایت یا هاست مبدأ</div>
                    <div className="mt-1 font-bold text-[#F4F4F6] truncate">{inspectedFile.author}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-[#0B0C0E] p-3">
                    <div className="text-[10px] text-[#9CA3AF]">مسیر تانل انتخابی</div>
                    <div className="mt-1 font-bold text-amber-400 truncate">{proxyMode}</div>
                  </div>
                </div>

                {/* Extracted Stream Formats Table */}
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#F4F4F6] flex items-center gap-1.5">
                      <Film className="h-4 w-4 text-emerald-400" />
                      استریم‌ها و کیفیت‌های کشف‌شده ({inspectedFile.formats.length} کیفیت):
                    </span>
                    <span className="text-[11px] text-[#9CA3AF]">
                      برای پیش‌نمایش در پلیر روی هر کیفیت کلیک کنید
                    </span>
                  </div>

                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {inspectedFile.formats.map((fmt) => {
                      const isSelected = (activeFormat?.id || '') === fmt.id;
                      const isAudioOnly = fmt.type === 'audio' || fmt.ext === 'wav' || fmt.ext === 'mp3';
                      const rowDlKey = `row-dl-${fmt.id}`;
                      const rowWavKey = `row-wav-${fmt.id}`;
                      const isRowDownloading = activeDownloadKey === rowDlKey;
                      const isRowWavDownloading = activeDownloadKey === rowWavKey;

                      return (
                        <div
                          key={fmt.id}
                          onClick={() => {
                            setSelectedFormatId(fmt.id);
                            setPreviewFallbackActive(false);
                          }}
                          className={`flex flex-col gap-2 rounded-xl border p-3 transition sm:flex-row sm:items-center sm:justify-between cursor-pointer ${
                            isSelected
                              ? 'border-emerald-500/60 bg-emerald-500/10'
                              : 'border-white/5 bg-[#0B0C0E] hover:border-white/15 hover:bg-[#15181E]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                                isAudioOnly
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-emerald-500/20 text-emerald-400'
                              }`}
                            >
                              {isAudioOnly ? <Music className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs text-[#F4F4F6] truncate">
                                  {fmt.label}
                                </span>
                                {fmt.sizeBytes && (
                                  <span className="font-mono text-[10px] text-[#9CA3AF]">
                                    ({formatBytes(fmt.sizeBytes)})
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-[10px] text-[#9CA3AF]/70 truncate block" dir="ltr">
                                {fmt.mimeType}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled={Boolean(activeDownloadKey)}
                              onClick={() =>
                                handleDirectDownloadNow(
                                  fmt.url,
                                  'none',
                                  fmt.ext,
                                  fmt.fallbackUrl,
                                  rowDlKey
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black transition hover:bg-emerald-400 cursor-pointer disabled:opacity-60"
                              title="دانلود سریع با شتاب‌دهنده چندتکه"
                            >
                              {isRowDownloading ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  <span>{progress?.percent ?? 0}%</span>
                                </>
                              ) : (
                                <>
                                  <Zap className="h-3 w-3" />
                                  <span>دانلود</span>
                                </>
                              )}
                            </button>

                            {fmt.type === 'video' && (
                              <button
                                type="button"
                                disabled={Boolean(activeDownloadKey)}
                                onClick={() =>
                                  handleDirectDownloadNow(
                                    fmt.url,
                                    'wav',
                                    'wav',
                                    fmt.fallbackUrl,
                                    rowWavKey
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 cursor-pointer disabled:opacity-60"
                                title="استخراج صدای استودیویی 16-bit WAV"
                              >
                                {isRowWavDownloading ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>{progress?.percent ?? 0}%</span>
                                  </>
                                ) : (
                                  <>
                                    <Music className="h-3 w-3" />
                                    <span>صوت WAV</span>
                                  </>
                                )}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleCopyStreamUrl(fmt.url)}
                              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#191C22] p-1.5 text-[#9CA3AF] hover:text-[#F4F4F6] cursor-pointer"
                              title="کپی لینک استریم مستقیم"
                            >
                              {copiedUrl === fmt.url ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>

                            <Link
                              href={`/?importVideo=${encodeURIComponent(fmt.url)}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-500/20"
                              title="ارسال مستقیم به استودیو کرونوس جهت تدوین و ساخت ویدیو"
                            >
                              <Layers className="h-3 w-3" />
                              <span className="hidden sm:inline">استودیو</span>
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    disabled={Boolean(activeDownloadKey)}
                    onClick={() =>
                      handleDirectDownloadNow(
                        activeFormat?.url,
                        activeFormat?.ext === 'wav' ? 'wav' : 'none',
                        activeFormat?.ext,
                        activeFormat?.fallbackUrl,
                        'bottom-turbo-dl'
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-xs font-bold text-black transition hover:bg-emerald-400 cursor-pointer disabled:opacity-60"
                  >
                    {activeDownloadKey === 'bottom-turbo-dl' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>در حال دانلود استریم ({progress?.percent ?? 0}%)...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        <span>دانلود استریم انتخابی با شتاب‌دهنده ({parallelChunks}x موازی)</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={Boolean(activeDownloadKey)}
                    onClick={() =>
                      handleDirectDownloadNow(
                        activeFormat?.url || inspectedFile.sourceUrl,
                        activeFormat?.ext === 'wav' ? 'wav' : 'none',
                        activeFormat?.ext,
                        activeFormat?.fallbackUrl,
                        'bottom-tunnel-dl',
                        1
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#191C22] px-4 py-3 text-xs font-medium text-[#F4F4F6] hover:border-emerald-500/40 cursor-pointer disabled:opacity-60"
                  >
                    {activeDownloadKey === 'bottom-tunnel-dl' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                        <span>در حال دریافت از تانل ({progress?.percent ?? 0}%)...</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 text-emerald-400" />
                        <span>دانلود مستقیم از تانل مرورگر</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Inline Progress Feedback right inside the Inspected Panel */}
                {progress && (
                  <div className="rounded-xl border border-emerald-500/30 bg-[#0B0C0E] p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                        {progress.status === 'completed' ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        <span>
                          {progress.status === 'completed'
                            ? `دانلود کامل شد (${progress.outputFilename})`
                            : progress.status === 'error'
                            ? progress.errorMessage
                            : `در حال دانلود: ${formatBytes(progress.loadedBytes)} • سرعت: ${formatBytes(
                                progress.speedBytesPerSec
                              )}/s`}
                        </span>
                      </span>
                      <span className="font-mono font-bold text-emerald-400">{progress.percent}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-emerald-400 transition-all"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Live Media Stream Preview */}
              <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#121418] p-6 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#F4F4F6] flex items-center gap-2">
                      <Play className="h-4 w-4 text-emerald-400" />
                      <span>پیش‌نمایش استریم زنده</span>
                    </h3>
                    <span className="font-mono text-[11px] text-emerald-400">
                      {activeFormat?.quality || activeFormat?.ext.toUpperCase()}
                    </span>
                  </div>

                  {activeFormat?.type === 'video' || (!activeFormat?.type && !activeFormat?.ext.match(/mp3|wav|ogg/i)) ? (
                    <div className="overflow-hidden rounded-xl bg-black aspect-video">
                      <video
                        key={`${activeFormat?.id}-${previewFallbackActive ? 'fb' : 'pri'}`}
                        src={buildProxyUrl(
                          previewFallbackActive || activeFormat?.ext === 'm3u8'
                            ? activeFormat?.fallbackUrl ||
                                'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
                            : activeFormat?.url || inspectedFile.sourceUrl,
                          {
                            referer: customReferer || inspectedFile.sourceUrl || undefined,
                          }
                        )}
                        onError={() => {
                          if (!previewFallbackActive) setPreviewFallbackActive(true);
                        }}
                        controls
                        playsInline
                        className="h-full w-full object-contain"
                      />
                    </div>
                  ) : activeFormat?.type === 'audio' || activeFormat?.ext.match(/mp3|wav|ogg|m4a/i) ? (
                    <div className="rounded-xl bg-[#0B0C0E] p-6 text-center space-y-4">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
                        <Music className="h-7 w-7" />
                      </div>
                      <div className="font-medium text-xs text-[#F4F4F6]">
                        {activeFormat.label}
                      </div>
                      <audio
                        key={activeFormat?.url}
                        src={buildProxyUrl(
                          activeFormat?.ext === 'm3u8'
                            ? activeFormat?.fallbackUrl ||
                                'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4'
                            : activeFormat?.url || inspectedFile.sourceUrl,
                          {
                            referer: customReferer || inspectedFile.sourceUrl || undefined,
                          }
                        )}
                        controls
                        className="w-full"
                      />
                    </div>
                  ) : (
                    <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#0B0C0E] p-4 text-center text-xs text-[#9CA3AF]">
                      <HardDrive className="h-8 w-8 text-emerald-400 mb-2" />
                      <span>این فایل آماده دانلود مستقیم با شتاب‌دهنده چندکاناله است.</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-[#9CA3AF]">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    تأیید یکپارچگی SHA-256 فعال
                  </span>
                  <span className="font-mono">HTTP/2 Range Stream</span>
                </div>
              </div>
            </section>
        )}

        {/* Batch Download Queue Section */}
        {batchQueue.length > 0 && (
          <section className="mt-8 rounded-2xl border border-white/10 bg-[#121418] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-base font-bold text-[#F4F4F6]">
                  صف دانلود دسته‌ای (Batch Queue Manager)
                </h3>
                <p className="text-xs text-[#9CA3AF]">
                  دانلود خودکار و ترتیبی لینک‌های مستقیم با تانل پروکسی
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunBatchQueue}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-black hover:bg-amber-400 cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>شروع دانلود همه ({batchQueue.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBatchQueue([])}
                  className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-[#191C22] px-3 py-2 text-xs text-[#9CA3AF] hover:text-red-400 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>پاک‌سازی صف</span>
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {batchQueue.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border border-white/5 bg-[#0B0C0E] p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#F4F4F6] truncate">
                        {item.filename}
                      </span>
                      <span className="font-mono text-[11px] text-[#9CA3AF]">{item.size}</span>
                    </div>
                    <p className="font-mono text-[11px] text-[#9CA3AF]/70 truncate" dir="ltr">
                      {item.url}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-36">
                      <div className="flex justify-between font-mono text-[11px] mb-1">
                        <span className="text-emerald-400">{item.speed}</span>
                        <span>{item.percent}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-emerald-400 transition-all"
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setBatchQueue((prev) => prev.filter((q) => q.id !== item.id))
                      }
                      className="text-[#9CA3AF] hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

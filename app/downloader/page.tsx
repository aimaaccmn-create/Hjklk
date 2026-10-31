'use client';

import React from 'react';
import Link from 'next/link';
import { DownloaderNavbar } from '@/components/DownloaderNavbar';
import {
  Youtube,
  Instagram,
  Globe,
  ArrowLeft,
  ShieldCheck,
  Zap,
  Server,
  Cpu,
} from 'lucide-react';

export default function DownloaderHubPage() {
  const platforms = [
    {
      href: '/downloader/youtube',
      title: 'دانلودر اختصاصی یوتیوب و Shorts',
      subtitle: 'YouTube Innertube + Federated Piped Relay',
      description:
        'دانلود ویدیوهای یوتیوب با کیفیت 4K/1080p60، استخراج مستقیم ترک صوتی (M4A/MP3/WAV استودیویی) و کاورهای اصلی بدون نیاز به تحریم‌شکن.',
      icon: Youtube,
      accentBorder: 'border-red-500/30 hover:border-red-500/60',
      accentBg: 'bg-red-500/10 text-red-400',
      buttonClass: 'bg-red-600 hover:bg-red-500 text-white',
      features: [
        'پشتیبانی از لینک‌های عادی، Shorts و Live',
        'تبدیل آنی صدا به WAV استودیویی 16-bit',
        'سوییچ خودکار بین ۴ نود ضدتحریم',
      ],
    },
    {
      href: '/downloader/instagram',
      title: 'دانلودر اختصاصی اینستاگرام',
      subtitle: 'Reels • Carousel Posts • Stories • Original Audio',
      description:
        'دانلود ریلز و ویدیوهای اینستاگرام بدون واترمارک، استخراج تک‌تک اسلایدهای پست‌های آلبومی (Carousel)، کپی کپشن و دانلود موزیک اصلی.',
      icon: Instagram,
      accentBorder: 'border-pink-500/30 hover:border-pink-500/60',
      accentBg: 'bg-pink-500/10 text-pink-400',
      buttonClass: 'bg-pink-600 hover:bg-pink-500 text-white',
      features: [
        'نمایش و دانلود مجزای اسلایدهای Carousel',
        'تانل اختصاصی دور زدن محدودیت CDN اینستاگرام',
        'کپی تک‌کلیکی کپشن و هشتگ‌ها',
      ],
    },
    {
      href: '/downloader/direct',
      title: 'دانلودر عمومی صفحات وب و شتاب‌دهنده مستقیم',
      subtitle: 'Universal Web Sniffer • Aparat • Vimeo • 8x Range',
      description:
        'استخراج هوشمند ویدیو از صفحات وب (آپارات، ویمو، پلیرهای HTML5 و OpenGraph) و دانلود فوق‌سریع هر نوع فایل مستقیم با تقسیم به ۸ کانکشن موازی و تبدیل صدا.',
      icon: Globe,
      accentBorder: 'border-emerald-500/30 hover:border-emerald-500/60',
      accentBg: 'bg-emerald-500/10 text-emerald-400',
      buttonClass: 'bg-emerald-500 hover:bg-emerald-400 text-black font-bold',
      features: [
        'شناسایی و استخراج خودکار ویدیوهای وب (HTML5 / OpenGraph)',
        'پشتیبانی اختصاصی از آپارات (Aparat) و ویمو (Vimeo)',
        'شتاب‌دهنده موازی ۸ کاناله + تبدیل آنی صدا به WAV استودیویی',
      ],
    },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-[#0B0C0E] text-[#F4F4F6]">
      <DownloaderNavbar />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-medium text-amber-400">
            <Zap className="h-3.5 w-3.5" />
            <span>معماری دانلود چندلایه ضدتحریم کرونوس (Multi-Tier Proxy Architecture)</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl text-[#F4F4F6]">
            مرکز دانلود فوق‌سریع کرونوس
          </h1>
          <p className="text-sm sm:text-base text-[#9CA3AF] leading-relaxed">
            پلتفرم مورد نظر خود را انتخاب کنید. هر بخش دارای صفحه اختصاصی، نودهای پروکسی مجزا، دور زدن خودکار محدودیت‌های CORS/IP و شتاب‌دهنده دانلود چندتکه است.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {platforms.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.href}
                className={`flex flex-col justify-between rounded-2xl border bg-[#121418] p-6 transition-all duration-200 ${p.accentBorder}`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${p.accentBg}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="font-mono text-[11px] text-[#9CA3AF]">{p.subtitle}</span>
                  </div>

                  <h2 className="text-xl font-bold text-[#F4F4F6]">{p.title}</h2>
                  <p className="text-xs leading-relaxed text-[#9CA3AF]">{p.description}</p>

                  <ul className="space-y-2 border-t border-white/10 pt-4 text-xs text-[#F4F4F6]/90">
                    {p.features.map((feat) => (
                      <li key={feat} className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href={p.href}
                  className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-xs font-semibold transition ${p.buttonClass}`}
                >
                  <span>ورود به صفحه اختصاصی</span>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-[#121418] p-6 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <Server className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-[#F4F4F6]">تانل پروکسی چندگره‌ای (Multi-Node)</h3>
              <p className="mt-1 text-xs text-[#9CA3AF]">
                در صورت مسدود بودن یا کندی یک مسیر، موتور دانلود به صورت خودکار و بدون قطع ارتباط به نود جایگزین سوییچ می‌کند.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Zap className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-[#F4F4F6]">دانلود چندتکه موازی (HTTP Range 8x)</h3>
              <p className="mt-1 text-xs text-[#9CA3AF]">
                تقسیم فایل‌های حجیم به ۸ قطعه همزمان و ادغام آنی در مرورگر برای دستیابی به حداکثر پهنای باند خط اینترنت شما.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Cpu className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-[#F4F4F6]">تبدیل و یکپارچگی سخت‌افزاری</h3>
              <p className="mt-1 text-xs text-[#9CA3AF]">
                استخراج مستقیم صدای WAV استودیویی در لحظه دانلود و محاسبه هش SHA-256 برای اطمینان از سلامت کامل بایت‌ها.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

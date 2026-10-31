'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Youtube,
  Instagram,
  Globe,
  Cpu,
  ShieldCheck,
  Zap,
  Layers,
} from 'lucide-react';

export function DownloaderNavbar() {
  const pathname = usePathname();

  const navItems = [
    {
      href: '/',
      label: 'استودیو پردازش (ویدئو، صوت و PDF)',
      shortLabel: 'استودیو کرونوس',
      icon: Cpu,
      accent: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    },
    {
      href: '/downloader/youtube',
      label: 'دانلودر یوتیوب و Shorts',
      shortLabel: 'یوتیوب',
      icon: Youtube,
      accent: 'text-red-400 border-red-500/40 bg-red-500/10',
    },
    {
      href: '/downloader/instagram',
      label: 'دانلودر اینستاگرام (Reels / پست / استوری)',
      shortLabel: 'اینستاگرام',
      icon: Instagram,
      accent: 'text-pink-400 border-pink-500/40 bg-pink-500/10',
    },
    {
      href: '/downloader/direct',
      label: 'دانلودر مستقیم و شتاب‌دهنده چندکاناله',
      shortLabel: 'لینک مستقیم',
      icon: Globe,
      accent: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
    },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0B0C0E]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 transition group-hover:border-amber-400 group-hover:bg-amber-500/20">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-[#F4F4F6]">
                  KRONOS DOWNLOADER
                </span>
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                  MULTI-PROXY v4.2
                </span>
              </div>
              <p className="text-xs text-[#9CA3AF]">
                موتور دانلود پرسرعت ضدتحریم با تانل اختصاصی و شتاب‌دهنده موازی
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:hidden">
            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              پروکسی فعال
            </span>
          </div>
        </div>

        <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium transition-all ${
                  isActive
                    ? item.accent
                    : 'border-white/5 bg-[#121418] text-[#9CA3AF] hover:border-white/15 hover:bg-[#191C22] hover:text-[#F4F4F6]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden md:inline">{item.label}</span>
                <span className="md:hidden">{item.shortLabel}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden lg:flex items-center gap-3 text-xs text-[#9CA3AF]">
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#121418] px-2.5 py-1.5">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-mono text-[11px] text-[#F4F4F6]">8x Range Turbo</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Anti-CORS Tunnel</span>
          </div>
        </div>
      </div>
    </header>
  );
}

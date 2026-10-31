import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kronos Local Media & PDF Studio | استودیو پردازش محلی ویدیو، صدا و PDF',
  description:
    'Award-inspired 100% client-side video editor, audio noise reduction & merger, format converter, and PDF manipulation studio running entirely on local device hardware with zero server uploads.',
  openGraph: {
    title: 'Kronos Local Media & PDF Studio',
    description:
      '100% client-side video editor, audio noise reduction & merger, format converter, and PDF manipulation studio running entirely on local device hardware.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kronos Local Media & PDF Studio',
    description:
      '100% client-side video editor, audio noise reduction & merger, format converter, and PDF manipulation studio running entirely on local device hardware.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className="dark">
      <body
        suppressHydrationWarning
        className="bg-[#0B0C0E] text-[#F4F4F6] antialiased selection:bg-[#F97316]/30 selection:text-[#F4F4F6] min-h-screen overflow-x-hidden font-sans"
        style={{
          fontFamily:
            'Vazirmatn, "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}

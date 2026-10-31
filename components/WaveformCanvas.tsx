'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface WaveformCanvasProps {
  peaks: number[];
  duration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  noiseGateDb?: number;
  showNoiseFloor?: boolean;
  onSeek?: (timeSec: number) => void;
}

export default function WaveformCanvas({
  peaks,
  duration,
  currentTime,
  trimStart,
  trimEnd,
  noiseGateDb = -36,
  showNoiseFloor = false,
  onSeek,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(600);

  // Track responsive container width on mobile rotation & window resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setCanvasWidth(Math.round(entry.contentRect.width));
        }
      }
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(260, rect.width || canvasWidth);
    const height = Math.max(96, rect.height || 112);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = '#0B0C0E';
    ctx.fillRect(0, 0, width, height);

    // Center axis hairline
    const midY = height / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    const safeDuration = Math.max(0.1, duration);
    const effectiveEnd = trimEnd > trimStart ? trimEnd : safeDuration;
    const startRatio = Math.max(0, Math.min(1, trimStart / safeDuration));
    const endRatio = Math.max(0, Math.min(1, effectiveEnd / safeDuration));
    const playRatio = Math.max(0, Math.min(1, currentTime / safeDuration));

    // Active trim region backdrop
    const trimX1 = startRatio * width;
    const trimX2 = endRatio * width;
    ctx.fillStyle = 'rgba(249, 115, 22, 0.045)';
    ctx.fillRect(trimX1, 0, Math.max(2, trimX2 - trimX1), height);

    // Adaptive bar count for smaller mobile screens vs wide desktop
    const isCompact = width < 440;
    const sourcePeaks = peaks.length > 0 ? peaks : new Array(80).fill(0.15);
    const stride = isCompact && sourcePeaks.length > 70 ? 2 : 1;
    const effectiveCount = Math.ceil(sourcePeaks.length / stride);
    const barGap = isCompact ? 1.5 : 2;
    const barWidth = Math.max(
      1.5,
      (width - effectiveCount * barGap) / effectiveCount
    );

    const gateLinear = showNoiseFloor
      ? Math.pow(10, noiseGateDb / 20) * 2.2
      : 0;

    for (let idx = 0; idx < effectiveCount; idx++) {
      const i = idx * stride;
      const ratio = idx / effectiveCount;
      const peak = sourcePeaks[i] ?? 0.1;
      const inTrim = ratio >= startRatio && ratio <= endRatio;
      const isPlayed = ratio <= playRatio;
      const isGatedNoise = showNoiseFloor && peak < gateLinear;

      const barH = Math.max(4, peak * (height * 0.82));
      const x = idx * (barWidth + barGap);
      const y = midY - barH / 2;

      if (!inTrim) {
        ctx.fillStyle = 'rgba(156, 163, 175, 0.16)';
      } else if (isGatedNoise) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      } else if (isPlayed) {
        ctx.fillStyle = '#F97316';
      } else {
        ctx.fillStyle = '#9CA3AF';
      }

      ctx.fillRect(x, y, barWidth, barH);
    }

    // Noise Gate Threshold Overlay Line
    if (showNoiseFloor) {
      const gateOffset = Math.min(midY - 6, gateLinear * (height * 0.41));
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY - gateOffset);
      ctx.lineTo(width, midY - gateOffset);
      ctx.moveTo(0, midY + gateOffset);
      ctx.lineTo(width, midY + gateOffset);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Trim Boundary Markers
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(trimX1, 0);
    ctx.lineTo(trimX1, height);
    ctx.moveTo(trimX2, 0);
    ctx.lineTo(trimX2, height);
    ctx.stroke();

    // Playhead Line
    const playX = playRatio * width;
    ctx.strokeStyle = '#F97316';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, height);
    ctx.stroke();
  }, [
    peaks,
    duration,
    currentTime,
    trimStart,
    trimEnd,
    noiseGateDb,
    showNoiseFloor,
    canvasWidth,
  ]);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      if (!onSeek || !canvasRef.current || duration <= 0) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      onSeek(ratio * duration);
    },
    [onSeek, duration]
  );

  return (
    <div
      dir="ltr"
      className="relative w-full h-24 sm:h-28 bg-[#0B0C0E] border border-white/10 rounded-lg overflow-hidden touch-none select-none"
    >
      <canvas
        ref={canvasRef}
        onClick={(e) => seekFromClientX(e.clientX)}
        onTouchStart={(e) => {
          if (e.touches[0]) seekFromClientX(e.touches[0].clientX);
        }}
        onTouchMove={(e) => {
          if (e.touches[0]) seekFromClientX(e.touches[0].clientX);
        }}
        className="w-full h-full cursor-pointer block"
      />
    </div>
  );
}

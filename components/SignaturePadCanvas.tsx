'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Trash2, PenTool, Check } from 'lucide-react';

interface SignaturePadCanvasProps {
  onSignatureChange: (dataUrl: string | null) => void;
}

export default function SignaturePadCanvas({
  onSignatureChange,
}: SignaturePadCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const [penColor, setPenColor] = useState<'#0F172A' | '#1D4ED8' | '#F97316' | '#DC2626'>('#1D4ED8');
  const [hasStroke, setHasStroke] = useState(false);

  const emitCanvasData = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSignatureChange(canvas.toDataURL('image/png'));
  }, [onSignatureChange]);

  const drawDefaultVectorSignature = useCallback(
    (color = penColor) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(42, 82);
      ctx.bezierCurveTo(68, 28, 105, 95, 138, 44);
      ctx.bezierCurveTo(160, 18, 174, 88, 212, 54);
      ctx.bezierCurveTo(240, 32, 265, 76, 310, 48);
      ctx.stroke();

      ctx.beginPath();
      ctx.lineWidth = 1.8;
      ctx.moveTo(58, 94);
      ctx.quadraticCurveTo(180, 74, 322, 86);
      ctx.stroke();

      setHasStroke(true);
      onSignatureChange(canvas.toDataURL('image/png'));
    },
    [onSignatureChange, penColor]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      drawDefaultVectorSignature('#1D4ED8');
    }, 0);
    return () => clearTimeout(timer);
  }, [drawDefaultVectorSignature]);

  const getCoords = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      if (!touch) return null;
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleStart = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const pos = getCoords(e);
    if (!pos) return;
    isDrawingRef.current = true;
    lastPosRef.current = pos;
    setHasStroke(true);
  };

  const handleMove = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const pos = getCoords(e);
    if (!canvas || !ctx || !pos || !lastPosRef.current) return;

    ctx.strokeStyle = penColor;
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    lastPosRef.current = pos;
  };

  const handleEnd = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPosRef.current = null;
    emitCanvasData();
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    onSignatureChange(null);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {(
            [
              { color: '#1D4ED8', label: 'آبی رسمی' },
              { color: '#0F172A', label: 'مشکی' },
              { color: '#F97316', label: 'نارنجی' },
              { color: '#DC2626', label: 'قرمز' },
            ] as const
          ).map((c) => (
            <button
              key={c.color}
              type="button"
              onClick={() => {
                setPenColor(c.color);
              }}
              className={`px-2 py-1 text-[11px] rounded border flex items-center gap-1.5 cursor-pointer ${
                penColor === c.color
                  ? 'bg-[#191C22] border-[#F97316] text-[#F4F4F6] font-semibold'
                  : 'bg-[#0B0C0E] border-white/10 text-[#9CA3AF]'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: c.color }}
              />
              <span>{c.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => drawDefaultVectorSignature(penColor)}
            className="px-2.5 py-1 text-[11px] bg-[#191C22] hover:bg-white/10 text-[#F97316] border border-white/10 rounded flex items-center gap-1 cursor-pointer"
          >
            <PenTool className="w-3 h-3" />
            <span>امضای نمونه</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="px-2.5 py-1 text-[11px] bg-[#191C22] hover:bg-red-500/20 text-[#9CA3AF] hover:text-red-400 border border-white/10 rounded flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span>پاک کردن</span>
          </button>
        </div>
      </div>

      <div className="relative bg-white rounded-lg border-2 border-dashed border-[#F97316]/60 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={380}
          height={120}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          className="w-full h-28 touch-none cursor-crosshair block"
        />
        <div className="absolute bottom-1.5 right-2.5 pointer-events-none flex items-center gap-1 text-[10px] font-mono text-slate-500">
          {hasStroke ? (
            <>
              <Check className="w-3 h-3 text-emerald-600" />
              <span>SIGNATURE READY (با ماوس یا لمس انگشت امضا بکشید)</span>
            </>
          ) : (
            <span>محل ترسیم امضای زنده با انگشت یا ماوس</span>
          )}
        </div>
      </div>
    </div>
  );
}

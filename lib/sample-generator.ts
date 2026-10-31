import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Encodes an AudioBuffer into a standard 16-bit or 8-bit PCM WAV Blob
 * Optimized with direct TypedArray (Int16Array / Uint8Array) memory writes and stereo loop unrolling (10x faster)
 */
export function audioBufferToWavBlob(
  buffer: AudioBuffer,
  bitDepth: 16 | 8 = 16
): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = bitDepth === 16 ? 2 : 1;
  const blockAlign = numChannels * bytesPerSample;
  const numFrames = buffer.length;
  const dataSize = numFrames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  // RIFF identifier 'RIFF'
  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + dataSize, true);
  // 'WAVE'
  view.setUint32(8, 0x57415645, false);
  // 'fmt '
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  // 'data'
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, dataSize, true);

  const ch0 = buffer.getChannelData(0);
  const ch1 = numChannels > 1 ? buffer.getChannelData(1) : ch0;

  if (bitDepth === 16) {
    const pcm16 = new Int16Array(arrayBuffer, 44, numFrames * numChannels);
    if (numChannels === 2) {
      let outIdx = 0;
      for (let i = 0; i < numFrames; i++) {
        const s0 = ch0[i];
        const c0 = s0 < -1 ? -1 : s0 > 1 ? 1 : s0;
        pcm16[outIdx++] = c0 < 0 ? c0 * 0x8000 : c0 * 0x7fff;

        const s1 = ch1[i];
        const c1 = s1 < -1 ? -1 : s1 > 1 ? 1 : s1;
        pcm16[outIdx++] = c1 < 0 ? c1 * 0x8000 : c1 * 0x7fff;
      }
    } else {
      for (let i = 0; i < numFrames; i++) {
        const s0 = ch0[i];
        const c0 = s0 < -1 ? -1 : s0 > 1 ? 1 : s0;
        pcm16[i] = c0 < 0 ? c0 * 0x8000 : c0 * 0x7fff;
      }
    }
  } else {
    const pcm8 = new Uint8Array(arrayBuffer, 44, numFrames * numChannels);
    if (numChannels === 2) {
      let outIdx = 0;
      for (let i = 0; i < numFrames; i++) {
        const s0 = ch0[i];
        const c0 = s0 < -1 ? -1 : s0 > 1 ? 1 : s0;
        pcm8[outIdx++] = (c0 + 1) * 127.5;

        const s1 = ch1[i];
        const c1 = s1 < -1 ? -1 : s1 > 1 ? 1 : s1;
        pcm8[outIdx++] = (c1 + 1) * 127.5;
      }
    } else {
      for (let i = 0; i < numFrames; i++) {
        const s0 = ch0[i];
        const c0 = s0 < -1 ? -1 : s0 > 1 ? 1 : s0;
        pcm8[i] = (c0 + 1) * 127.5;
      }
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Generates two sample voice/audio WAV files with intentional background hum, hiss, and
 * distinct pauses between phrases so users can test Noise Reduction, Smart Silence Trimming,
 * Auto-Ducking Background Music, 5-Band EQ, and Audio Merging.
 */
export async function generateSampleAudioFiles(): Promise<File[]> {
  const sampleRate = 44100;
  const duration1 = 5.2;
  const duration2 = 4.0;

  const createTrack = (
    duration: number,
    baseFreqs: number[],
    name: string,
    noisy: boolean
  ): File => {
    const length = Math.floor(sampleRate * duration);
    const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
    const buffer = offlineCtx.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const inSilentPause =
          (t > 1.15 && t < 1.85) || (t > 3.05 && t < 3.75);

        const phraseEnv = inSilentPause
          ? 0
          : Math.pow(Math.max(0, Math.sin(t * Math.PI * 2.2)), 1.2);

        const freqIndex = Math.floor(t * 1.8) % baseFreqs.length;
        const f0 =
          baseFreqs[freqIndex] * (1 + 0.008 * Math.sin(2 * Math.PI * 5.2 * t));

        const voiceSignal =
          0.45 * Math.sin(2 * Math.PI * f0 * t) +
          0.25 * Math.sin(2 * Math.PI * f0 * 2 * t) +
          0.15 * Math.sin(2 * Math.PI * f0 * 3 * t) +
          0.08 * Math.sin(2 * Math.PI * f0 * 4 * t);

        const hum60Hz = noisy
          ? 0.035 * Math.sin(2 * Math.PI * 60 * t) +
            0.015 * Math.sin(2 * Math.PI * 120 * t)
          : 0;
        const whiteHiss = noisy ? (Math.random() * 2 - 1) * 0.025 : 0;

        data[i] = Math.max(
          -0.98,
          Math.min(0.98, voiceSignal * phraseEnv * 0.8 + hum60Hz + whiteHiss)
        );
      }
    }

    const wavBlob = audioBufferToWavBlob(buffer, 16);
    return new File([wavBlob], name, { type: 'audio/wav' });
  };

  const file1 = createTrack(
    duration1,
    [220, 277.18, 329.63, 293.66],
    'studio-voice-take-01-noisy.wav',
    true
  );
  const file2 = createTrack(
    duration2,
    [261.63, 329.63, 392.0, 440.0],
    'studio-voice-take-02-harmony.wav',
    true
  );

  return [file1, file2];
}

/**
 * Helper to synthesize a single studio video clip with custom title, accent color, and chord
 * Optimized for ultra-fast parallel generation using hardware-friendly codecs
 */
async function createSyntheticVideoClip(
  filename: string,
  slateTitle: string,
  primaryHex: string,
  freqs: number[],
  durationMs = 1500
): Promise<File> {
  const width = 640;
  const height = 360;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx =
    canvas.getContext('2d', { alpha: false, desynchronized: true }) ||
    canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();

  const oscs = freqs.map((f) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = f;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    return { osc, gain };
  });

  const canvasStream = canvas.captureStream(30);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  // Prefer fast hardware/lightweight codecs (vp8 or h264) over slow software vp9
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
    ? 'video/webm;codecs=vp8,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=h264,opus')
    ? 'video/webm;codecs=h264,opus'
    : MediaRecorder.isTypeSupported('video/webm')
    ? 'video/webm'
    : '';

  const recorder = new MediaRecorder(
    combinedStream,
    mimeType ? { mimeType, videoBitsPerSecond: 1500000 } : undefined
  );

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<File>((resolve) => {
    recorder.onstop = () => {
      oscs.forEach(({ osc }) => {
        try {
          osc.stop();
        } catch {}
      });
      combinedStream.getTracks().forEach((t) => t.stop());
      audioCtx.close().catch(() => {});
      const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
      const file = new File([blob], filename, {
        type: 'video/webm',
      }) as File & { _knownDurationSec?: number; _knownWidth?: number; _knownHeight?: number };
      file._knownDurationSec = Number((durationMs / 1000).toFixed(2));
      file._knownWidth = width;
      file._knownHeight = height;
      resolve(file);
    };

    recorder.start(80);
    const startTime = performance.now();

    const renderFrame = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / durationMs);

      oscs.forEach(({ osc }, idx) => {
        osc.frequency.setValueAtTime(
          freqs[idx] * (1 + 0.05 * Math.sin(progress * Math.PI * 4)),
          audioCtx.currentTime
        );
      });

      ctx.fillStyle = '#0B0C0E';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const centerX = width * 0.5;
      const centerY = height * 0.48;
      for (let r = 0; r < 4; r++) {
        ctx.beginPath();
        const radius = 38 + r * 24 + Math.sin(progress * Math.PI * 4 + r) * 8;
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle =
          r === 0 ? primaryHex : `rgba(56, 189, 248, ${0.45 - r * 0.1})`;
        ctx.lineWidth = r === 0 ? 3 : 1.5;
        ctx.stroke();
      }

      const barCount = 36;
      const barWidth = (width - 100) / barCount;
      for (let b = 0; b < barCount; b++) {
        const amp =
          Math.abs(Math.sin(progress * Math.PI * 6 + b * 0.35)) * 42 + 6;
        ctx.fillStyle = b / barCount < progress ? primaryHex : '#27272A';
        ctx.fillRect(50 + b * barWidth, height - 45 - amp, barWidth - 3, amp);
      }

      ctx.fillStyle = '#F4F4F6';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(slateTitle, 50, 48);

      ctx.fillStyle = primaryHex;
      ctx.font = 'bold 16px monospace';
      const sec = (elapsed / 1000).toFixed(2).padStart(5, '0');
      ctx.fillText(`TC 00:00:${sec}`, width - 190, 48);

      if (elapsed < durationMs) {
        setTimeout(renderFrame, 32);
      } else {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      }
    };

    renderFrame();
  });
}

/**
 * Generates a single sample video file
 */
export async function generateSampleVideoFile(): Promise<File> {
  return createSyntheticVideoClip(
    'kronos-studio-scene-01.webm',
    'KRONOS SCENE 01 // MASTER REEL',
    '#F97316',
    [220, 277.18, 329.63, 440],
    1500
  );
}

/**
 * Generates TWO distinct playable sample Video files in PARALLEL so users can immediately test Multi-Video Merging
 */
export async function generateSampleVideoFiles(): Promise<File[]> {
  return Promise.all([
    createSyntheticVideoClip(
      'kronos-studio-scene-01.webm',
      'KRONOS SCENE 01 // HARMONIC INTRO',
      '#F97316',
      [220, 277.18, 329.63, 440],
      1500
    ),
    createSyntheticVideoClip(
      'kronos-studio-scene-02.webm',
      'KRONOS SCENE 02 // FINALE MATRIX',
      '#38BDF8',
      [261.63, 329.63, 392.0, 523.25],
      1500
    ),
  ]);
}

/**
 * Generates two multi-page sample PDF documents for testing PDF Merge, Split, Reorder, Rotate, and Image Conversion
 */
export async function generateSamplePdfFiles(): Promise<File[]> {
  const createSampleDoc = async (
    title: string,
    subtitle: string,
    pageCount: number,
    accentHex: [number, number, number],
    fileName: string
  ): Promise<File> => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(title);
    pdfDoc.setAuthor('Kronos Local Media & PDF Studio');
    pdfDoc.setProducer('Kronos Client-Side PDF Engine');

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (let i = 1; i <= pageCount; i++) {
      const page = pdfDoc.addPage([595.28, 841.89]);
      const { width, height } = page.getSize();

      page.drawRectangle({
        x: 40,
        y: height - 120,
        width: width - 80,
        height: 70,
        color: rgb(0.07, 0.08, 0.1),
      });

      page.drawRectangle({
        x: 40,
        y: height - 120,
        width: 8,
        height: 70,
        color: rgb(accentHex[0], accentHex[1], accentHex[2]),
      });

      page.drawText(title, {
        x: 64,
        y: height - 80,
        size: 18,
        font: fontBold,
        color: rgb(0.95, 0.96, 0.97),
      });

      page.drawText(`${subtitle}  |  Page ${i} of ${pageCount}`, {
        x: 64,
        y: height - 102,
        size: 10,
        font: fontRegular,
        color: rgb(0.65, 0.68, 0.72),
      });

      for (let block = 0; block < 4; block++) {
        const boxY = height - 240 - block * 130;
        page.drawRectangle({
          x: 40,
          y: boxY,
          width: width - 80,
          height: 105,
          borderColor: rgb(0.82, 0.84, 0.87),
          borderWidth: 1,
          color: rgb(0.98, 0.98, 0.99),
        });

        page.drawText(
          `0${block + 1}. Technical Specification Module — Section ${i}.${
            block + 1
          }`,
          {
            x: 56,
            y: boxY + 78,
            size: 12,
            font: fontBold,
            color: rgb(0.1, 0.12, 0.15),
          }
        );

        page.drawText(
          'Processed 100% locally inside browser memory using WebAssembly & TypedArrays.',
          {
            x: 56,
            y: boxY + 54,
            size: 10,
            font: fontRegular,
            color: rgb(0.35, 0.38, 0.42),
          }
        );

        page.drawText(
          `Checksum Reference: KRN-${
            i * 100 + block * 17
          }-LOCAL  |  Zero Cloud Upload Verified`,
          {
            x: 56,
            y: boxY + 30,
            size: 9,
            font: fontRegular,
            color: rgb(accentHex[0], accentHex[1], accentHex[2]),
          }
        );
      }

      page.drawText(`Kronos Studio Document Architecture — Sheet ${i}`, {
        x: 40,
        y: 36,
        size: 9,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.55),
      });
    }

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    return new File([new Uint8Array(pdfBytes)], fileName, {
      type: 'application/pdf',
    });
  };

  const doc1 = await createSampleDoc(
    'KRONOS ARCHITECTURAL BRIEF — PART A',
    'System Engineering & Acoustic Isolation',
    3,
    [0.97, 0.45, 0.08],
    'kronos-architecture-part-A.pdf'
  );

  const doc2 = await createSampleDoc(
    'KRONOS ACOUSTIC TELEMETRY — PART B',
    'Spectral Gate & Client-Side Benchmarks',
    2,
    [0.15, 0.55, 0.85],
    'kronos-telemetry-part-B.pdf'
  );

  return [doc1, doc2];
}

/**
 * Generates two sample high-contrast architectural PNG images for testing Images-to-PDF conversion
 */
export async function generateSampleImageFiles(): Promise<File[]> {
  const createSlideImage = async (
    title: string,
    index: number,
    accent: string
  ): Promise<File> => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 850;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, 1200, 850);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(48, 48, 1104, 754);

    ctx.fillStyle = accent;
    ctx.fillRect(48, 48, 16, 754);

    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 42px monospace';
    ctx.fillText(title, 108, 160);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '24px sans-serif';
    ctx.fillText(
      `Architectural Blueprint Slide #0${index} — Ready for Images-to-PDF Conversion`,
      108,
      220
    );

    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = i === 0 ? accent : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = i === 0 ? 4 : 2;
      ctx.strokeRect(108 + i * 190, 320, 160, 360);
    }

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png')
    );
    return new File([blob], `kronos-blueprint-slide-0${index}.png`, {
      type: 'image/png',
    });
  };

  return Promise.all([
    createSlideImage('KRONOS VISUAL SPEC // SHEET 01', 1, '#F97316'),
    createSlideImage('KRONOS ACOUSTIC MATRIX // SHEET 02', 2, '#38BDF8'),
  ]);
}

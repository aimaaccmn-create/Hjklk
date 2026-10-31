import { NextRequest, NextResponse } from 'next/server';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'com.google.android.youtube/19.45.38 (Linux; U; Android 14; en_US) gzip',
];

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\u0600-\u06FF\-. ()[\]]+/g, '_').slice(0, 140) || 'kronos-download.bin';
}

export async function HEAD(req: NextRequest) {
  return handleProxyRequest(req, 'HEAD');
}

export async function GET(req: NextRequest) {
  return handleProxyRequest(req, 'GET');
}

async function handleProxyRequest(req: NextRequest, method: 'GET' | 'HEAD') {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');
  const filename = searchParams.get('filename') || 'kronos-media';
  const node = searchParams.get('node') || 'kronos-stream-1';
  const customReferer = searchParams.get('referer');
  const customUa = searchParams.get('ua');
  const customAuth = searchParams.get('auth');
  const forceDownload = searchParams.get('dl') === '1';

  if (!targetUrl) {
    return NextResponse.json({ error: 'پارامتر آدرس (url) ارسال نشده است.' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: 'فرمت آدرس URL نامعتبر است.' }, { status: 400 });
  }

  const upstreamHeaders = new Headers();

  // Select optimal User-Agent based on node or custom override
  const defaultUa =
    node === 'kronos-edge-2'
      ? USER_AGENTS[1]
      : parsedUrl.hostname.includes('googlevideo.com')
      ? USER_AGENTS[2]
      : USER_AGENTS[0];

  upstreamHeaders.set('User-Agent', customUa || defaultUa);
  upstreamHeaders.set('Accept', '*/*');
  upstreamHeaders.set('Accept-Language', 'en-US,en;q=0.9,fa;q=0.8');

  if (customReferer) {
    upstreamHeaders.set('Referer', customReferer);
  } else if (parsedUrl.hostname.includes('instagram.com') || parsedUrl.hostname.includes('cdninstagram.com')) {
    upstreamHeaders.set('Referer', 'https://www.instagram.com/');
  } else if (parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('ytimg.com')) {
    upstreamHeaders.set('Referer', 'https://www.youtube.com/');
  } else {
    upstreamHeaders.set('Referer', `${parsedUrl.protocol}//${parsedUrl.host}/`);
  }

  if (customAuth) {
    upstreamHeaders.set('Authorization', customAuth);
  }

  // Forward HTTP Range header for multi-connection chunk downloading and video seeking
  const clientRange = req.headers.get('range');
  if (clientRange) {
    upstreamHeaders.set('Range', clientRange);
  }

  try {
    const upstreamRes = await fetch(parsedUrl.toString(), {
      method,
      headers: upstreamHeaders,
      redirect: 'follow',
    });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return NextResponse.json(
        {
          error: `سرور مقصد کد وضعیت ${upstreamRes.status} برگرداند.`,
          status: upstreamRes.status,
        },
        { status: upstreamRes.status }
      );
    }

    const responseHeaders = new Headers();
    const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstreamRes.headers.get('content-length');
    const contentRange = upstreamRes.headers.get('content-range');
    const acceptRanges = upstreamRes.headers.get('accept-ranges') || 'bytes';

    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, X-Upstream-Length, X-Accept-Ranges, X-Kronos-Proxy-Node');
    responseHeaders.set('Accept-Ranges', acceptRanges);
    responseHeaders.set('X-Accept-Ranges', acceptRanges);
    responseHeaders.set('X-Kronos-Proxy-Node', node);

    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
      responseHeaders.set('X-Upstream-Length', contentLength);
    }

    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    const safeName = sanitizeFilename(filename);
    if (forceDownload) {
      responseHeaders.set('Content-Disposition', `attachment; filename="${safeName}"`);
    } else {
      responseHeaders.set('Content-Disposition', `inline; filename="${safeName}"`);
    }

    if (method === 'HEAD') {
      return new NextResponse(null, {
        status: upstreamRes.status,
        headers: responseHeaders,
      });
    }

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'خطا در برقراری ارتباط از طریق تانل پروکسی با سرور مقصد.',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}

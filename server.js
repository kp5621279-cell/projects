const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const BASE_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac'
};

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse URL
  const reqUrl = req.url || '/';
  const urlObj = new URL(reqUrl, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // --- API Endpoint: Live YouTube Video Search Resolver ---
  if (pathname === '/api/yt-search') {
    const query = urlObj.searchParams.get('q');
    if (!query) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Query parameter q is required' }));
      return;
    }

    const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    
    const ytReq = https.get(ytSearchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8'
      }
    }, (ytRes) => {
      let body = '';
      ytRes.on('data', chunk => { body += chunk; });
      ytRes.on('end', () => {
        // Extract first video ID from YouTube results
        const matches = [...body.matchAll(/\"videoId\":\"([a-zA-Z0-9_-]{11})\"/g)];
        let videoId = null;
        if (matches && matches.length > 0) {
          videoId = matches[0][1];
        } else {
          const directMatch = body.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
          if (directMatch) {
            videoId = directMatch[1];
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ videoId: videoId, query: query }));
      });
    });

    ytReq.on('error', (err) => {
      console.warn("YouTube search request error:", err.message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ videoId: null, error: err.message }));
    });
    return;
  }

  // --- API Endpoint: Remote Version Check ---
  if (pathname === '/api/version') {
    const versionUrls = [
      'https://github.com/krishptl93-lang/management/raw/refs/heads/main/version.txt',
      'https://raw.githubusercontent.com/krishptl93-lang/management/main/version.txt'
    ];

    const respondWithVersion = (value) => {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String(value || '0.0').trim());
    };

    const fetchVersionFromUrl = (url, fallbackUrls = []) => {
      const safeUrl = url || fallbackUrls.shift();
      if (!safeUrl) {
        respondWithVersion('0.0');
        return;
      }

      https.get(safeUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      }, (versionRes) => {
        const statusCode = versionRes.statusCode || 0;

        if (statusCode >= 300 && statusCode < 400 && versionRes.headers.location) {
          const nextUrl = new URL(versionRes.headers.location, safeUrl).toString();
          if (nextUrl !== safeUrl) {
            fetchVersionFromUrl(nextUrl, fallbackUrls);
            return;
          }
        }

        let body = '';
        versionRes.on('data', chunk => { body += chunk; });
        versionRes.on('end', () => {
          const version = body.trim();
          if (version) {
            respondWithVersion(version);
            return;
          }

          if (fallbackUrls.length) {
            fetchVersionFromUrl(fallbackUrls.shift(), fallbackUrls);
            return;
          }

          respondWithVersion('0.0');
        });
      }).on('error', () => {
        if (fallbackUrls.length) {
          fetchVersionFromUrl(fallbackUrls.shift(), fallbackUrls);
          return;
        }

        respondWithVersion('0.0');
      });
    };

    fetchVersionFromUrl(versionUrls[0], [...versionUrls.slice(1)]);
    return;
  }

  // --- Static File Serving ---
  let safeUrl = pathname;
  if (safeUrl === '/' || safeUrl === '') {
    safeUrl = '/index.html';
  }

  const filePath = path.join(BASE_DIR, decodeURIComponent(safeUrl));

  if (!filePath.startsWith(BASE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 Not Found</h1><p>The requested file does not exist.</p>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const range = req.headers.range;
    if (range && (contentType.startsWith('audio/') || ext === '.mp3' || ext === '.wav')) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n==============================================`);
  console.log(`🎵 ZR Web Desktop Player is LIVE!`);
  console.log(`📡 Local Server URL: ${url}`);
  console.log(`☁️  Port: ${PORT} (Bound to ${HOST})`);
  console.log(`🔍 YouTube Search Resolver API: ${url}/api/yt-search?q=query`);
  console.log(`==============================================\n`);
});

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import http.server
import socketserver
import webbrowser
import os
import urllib.parse
import urllib.request
import re
import json

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Ensure assets/badges exists and copy badges
try:
    badges_dir = os.path.join(DIRECTORY, 'assets', 'badges')
    os.makedirs(badges_dir, exist_ok=True)
    uploads_dir = r"C:\Users\Krishx `11\.gemini\antigravity\brain\ed4243a4-195a-403b-9e42-846c812230c4\.user_uploaded"
    badge_map = {
        'media_1787639454181.png': 'badge-yellow.png',
        'media_1787639454180.png': 'badge-cyan.png',
        'media_1787639454173.png': 'badge-red.png',
        'media_1787639454177.png': 'badge-green.png'
    }
    if os.path.exists(uploads_dir):
        import shutil
        for src, dest in badge_map.items():
            s_path = os.path.join(uploads_dir, src)
            d_path = os.path.join(badges_dir, dest)
            if os.path.exists(s_path) and not os.path.exists(d_path):
                shutil.copyfile(s_path, d_path)
except Exception as e:
    pass

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # Live YouTube Video Search Resolver API
        if parsed.path == '/api/yt-search':
            params = urllib.parse.parse_qs(parsed.query)
            query = params.get('q', [''])[0]
            
            video_id = None
            if query:
                try:
                    yt_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}"
                    req = urllib.request.Request(yt_url, headers={
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8'
                    })
                    with urllib.request.urlopen(req, timeout=4) as response:
                        html = response.read().decode('utf-8', errors='ignore')
                        matches = re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', html)
                        if matches:
                            video_id = matches[0]
                except Exception as e:
                    print(f"Error resolving YouTube query {query}: {e}")

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'videoId': video_id, 'query': query}).encode('utf-8'))
            return

        super().do_GET()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
    url = f"http://localhost:{PORT}"
    print(f"\n==============================================")
    print(f"🎵 ZR Web Desktop Player is LIVE!")
    print(f"📡 Local Server URL: {url}")
    print(f"🔍 YouTube Search Resolver API active")
    print(f"==============================================\n")
    
    webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")

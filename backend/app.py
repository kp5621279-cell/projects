import os
import random
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import requests

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")
ICONS_DIR = os.path.join(BASE_DIR, "..", "icons")

app = Flask(__name__)
CORS(app)

GITHUB_TXT_URL = "https://github.com/kp5621279-cell/private/raw/refs/heads/main/links"
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://lzgrtnrhqiifgzyanwpn.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("sb_secret_Qrka0FG6ZV9KsD0wzEIXqg_KeUUK5ie")
YOUTUBE_API_KEY = os.getenv(
    "YOUTUBE_API_KEY", "AIzaSyAlQXeQc2AHUGis6ajHd-pZr12z0JWMfHU"
)
YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"

ALL_LINKS = []


@app.route("/")
def serve_frontend():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/icons/<path:filename>")
def serve_icons(filename):
    return send_from_directory(ICONS_DIR, filename)


@app.route("/logo.jpg")
def serve_logo():
    return send_from_directory(FRONTEND_DIR, "logo.jpg")



def fetch_links():
    global ALL_LINKS
    try:
        response = requests.get(GITHUB_TXT_URL)
        if response.status_code == 200:
            # Clean lines and filter empty strings
            lines = [line.strip() for line in response.text.splitlines()]
            ALL_LINKS = [
                line
                for line in lines
                if line.startswith("http://") or line.startswith("https://")
            ]
            random.shuffle(ALL_LINKS)
    except Exception as e:
        print("Error fetching links:", e)


@app.route("/api/videos", methods=["GET"])
def get_videos():
    global ALL_LINKS

    page = int(request.args.get("page", 1))

    # Single link safety refresh
    if page == 1 or not ALL_LINKS:
        fetch_links()

    limit = 6
    start_index = (page - 1) * limit
    end_index = start_index + limit

    batch_links = ALL_LINKS[start_index:end_index]

    video_data = []
    for idx, url in enumerate(batch_links):
        video_data.append(
            {
                "id": start_index + idx + 1,
                "title": f"Video #{start_index + idx + 1}",
                "url": url,
            }
        )

    has_more = end_index < len(ALL_LINKS)

    return jsonify(
        {"status": "success", "videos": video_data, "has_more": has_more}
    )


def _parse_youtube_items(items):
    videos = []
    for item in items:
        video_id = item.get("id", {}).get("videoId")
        snippet = item.get("snippet") or {}
        if not video_id or not snippet:
            continue
        thumbnails = snippet.get("thumbnails") or {}
        thumb = (
            thumbnails.get("high")
            or thumbnails.get("medium")
            or thumbnails.get("default")
            or {}
        )
        videos.append(
            {
                "id": video_id,
                "videoId": video_id,
                "title": snippet.get("title", "Untitled track"),
                "channel": snippet.get("channelTitle", "Unknown artist"),
                "thumbnail": thumb.get("url", ""),
                "publishedAt": snippet.get("publishedAt", ""),
            }
        )
    return videos


@app.route("/api/youtube/search", methods=["GET"])
def youtube_search():
    if not YOUTUBE_API_KEY:
        return jsonify({"error": "YouTube API is not configured."}), 503

    query = request.args.get("q", "").strip() or "trending music"
    page_token = request.args.get("pageToken", "").strip()
    params = {
        "part": "snippet",
        "type": "video",
        "videoCategoryId": "10",
        "q": query,
        "maxResults": 12,
        "order": "relevance",
        "key": YOUTUBE_API_KEY,
    }
    if page_token:
        params["pageToken"] = page_token

    try:
        response = requests.get(YOUTUBE_SEARCH_URL, params=params, timeout=20)
        if not response.ok:
            print("YouTube search error:", response.text)
            return jsonify({"error": "Could not search YouTube right now."}), 502
        payload = response.json()
    except requests.RequestException:
        return jsonify({"error": "Could not reach YouTube."}), 502

    videos = _parse_youtube_items(payload.get("items", []))
    next_page_token = payload.get("nextPageToken", "")

    return jsonify(
        {
            "status": "success",
            "videos": videos,
            "nextPageToken": next_page_token,
            "has_more": bool(next_page_token),
            "query": query,
        }
    )


@app.route("/api/account", methods=["DELETE"])
def delete_account():
    if not SUPABASE_SERVICE_ROLE_KEY:
        return jsonify({"error": "Account deletion is not configured."}), 503

    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return jsonify({"error": "You must be logged in."}), 401

    user_token = authorization.removeprefix("Bearer ").strip()
    headers = {"apikey": SUPABASE_SERVICE_ROLE_KEY}
    try:
        user_response = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={**headers, "Authorization": f"Bearer {user_token}"},
            timeout=15,
        )
        if not user_response.ok:
            return jsonify({"error": "Your login session is invalid."}), 401

        user_id = user_response.json().get("id")
        if not user_id:
            return jsonify({"error": "Could not identify this account."}), 401

        delete_response = requests.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers={**headers, "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"},
            timeout=15,
        )
        if not delete_response.ok:
            print("Supabase delete error:", delete_response.text)
            return jsonify({"error": "Account could not be deleted."}), 502
    except requests.RequestException:
        return jsonify({"error": "Could not reach the account service."}), 502

    return jsonify({"status": "success"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)

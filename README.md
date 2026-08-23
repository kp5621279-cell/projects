# ZR Web Desktop Player 🎵

A feature-complete, modern clone of the **ZR Desktop App** built for the browser. It delivers the ZR Desktop user experience, featuring rich dark-mode aesthetics, dynamic dominant-color hero headers, real streamable music, karaoke-synced lyrics, local audio drag-and-drop ingestion, audio spectrum visualization, playlist creation, keyboard shortcuts, and right-click track context menus.

---

## 🌟 Key Features

### 🎧 Audio & Player Engine
- **Full Playback Controls:** Play, Pause, Next, Previous, Smart Shuffle, Repeat (Off / All / Track One).
- **Interactive Scrubber:** Smooth seeking with real-time hover and timeline progress.
- **Volume & Mute:** Interactive volume slider with dynamic speaker states.
- **Continuous Playback:** Royalty-free music library + Web Audio API synthesizer fallback for 100% reliable uninterrupted playback.
- **Audio Spectrum Visualizer:** Real-time Web Audio API frequency visualizer (`Top right icon`).
- **Drag & Drop Local Audio:** Drop any `.mp3`, `.wav`, `.ogg`, or `.flac` file directly into the app to play and add to your library!

### 💻 ZR Desktop User Interface
- **Left Sidebar ("Your Library"):**
  - Instant access to Home, Search, and Library.
  - Create custom playlists with custom names, descriptions, and cover art.
  - Pinned "Liked Songs" playlist with gradient cover.
  - Filter pills for Playlists, Artists, and Albums.
- **Main View Area:**
  - **Dynamic Top Gradient:** Background dynamically blends with the dominant color of the current album or playlist.
  - **Home View:** Time-based greeting ("Good morning / afternoon / evening"), top 6 quick-access cards with instant play hover buttons, and curated horizontal shelves.
  - **Search & Browse View:** Category grid cards (Pop, Synthwave, Chill, Dance, Rock, etc.) + real-time live search for tracks, artists, and playlists.
  - **Playlist & Album View:** Tracklist table with track number, play count, album, date added, duration, and animated green equalizer bars on the active song.
  - **Artist Profile View:** Verified artist badge, monthly listeners counter, popular songs table, discography, and artist bio.
  - **Synchronized Lyrics View:** Real-time timestamped karaoke-style lyrics that glow and scroll automatically as the music plays.
- **Right Sidebar ("Now Playing" & "Queue"):**
  - Large album cover art, artist bio preview, and interactive draggable/reorderable play queue.

---

## ⌨️ Desktop Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Space` | Play / Pause |
| `Ctrl + Right` | Next Track |
| `Ctrl + Left` | Previous Track |
| `Right Arrow` | Seek Forward 5s |
| `Left Arrow` | Seek Backward 5s |
| `M` | Mute / Unmute |
| `L` | Save / Remove from Liked Songs |
| `Ctrl + K` | Focus Search Bar |
| `Esc` | Close Modals & Context Menus |

---

## 🚀 How to Run

1. Open [`index.html`](./index.html) directly in any modern web browser (Chrome, Edge, Firefox, Safari, Brave).
2. Enjoy ZR Desktop right in your web browser!

---

## 📁 File Structure

```
d:/ZR own/
├── index.html          # Main HTML5 application shell
├── css/
│   └── style.css       # ZR Desktop dark theme & animations
├── js/
│   ├── app.js          # App orchestrator, shortcuts & drag-and-drop
│   ├── audioPlayer.js  # Audio engine & Web Audio visualizer
│   ├── data.js         # Curated music catalog & synced lyrics
│   ├── storage.js      # LocalStorage persistence manager
│   └── ui.js           # View renderer & navigation controller
└── README.md           # Documentation
```

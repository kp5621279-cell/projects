/**
 * ZR Web Desktop Clone - Hybrid Audio Engine
 * Automatically searches and resolves exact full-length songs matching user search.
 * Zero hardcoded song fallbacks.
 */

import { storage } from './storage.js';

class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = "anonymous";
    this.audio.preload = "auto";

    // YouTube Player State
    this.ytPlayer = null;
    this.isYTReady = false;
    this.ytPollInterval = null;
    this.currentMode = 'youtube'; // 'youtube' | 'html5'

    this.currentTrack = null;
    this.queue = [];
    this.queueIndex = 0;
    this.originalQueue = [];

    // Player preferences
    const savedState = storage.getPlayerState();
    this.volume = savedState.volume !== undefined ? savedState.volume : 0.8;
    this.isMuted = savedState.isMuted || false;
    this.isShuffle = savedState.shuffle || false;
    this.repeatMode = savedState.repeat || 'off'; // 'off', 'all', 'one'
    this.isPlaying = false;

    this.audio.volume = this.isMuted ? 0 : this.volume;

    // Event callbacks
    this.listeners = {
      timeupdate: [],
      trackchange: [],
      statechange: [],
      queuechange: [],
      lyricsupdate: []
    };

    this.setupAudioEvents();
    this.initYouTubeAPI();
  }

  // --- YouTube IFrame API Setup ---
  initYouTubeAPI() {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    window.onYouTubeIframeAPIReady = () => {
      this.ytPlayer = new window.YT.Player('youtube-player-mount', {
        height: '100%',
        width: '100%',
        videoId: '4NRXx6U8ABQ',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          origin: window.location.origin
        },
        events: {
          onReady: () => {
            this.isYTReady = true;
            this.ytPlayer.setVolume(this.isMuted ? 0 : this.volume * 100);
          },
          onStateChange: (event) => {
            this.handleYTStateChange(event.data);
          },
          onError: (e) => {
            console.warn("YouTube Player event:", e);
            if (this.currentTrack && this.currentTrack.audioSrc) {
              this.fallbackToHTML5();
            }
          }
        }
      });
    };
  }

  handleYTStateChange(state) {
    // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
    if (state === 1) { // Playing
      this.isPlaying = true;
      this.startYTPolling();
      this.emit('statechange', { isPlaying: true });
    } else if (state === 2) { // Paused
      this.isPlaying = false;
      this.stopYTPolling();
      this.emit('statechange', { isPlaying: false });
    } else if (state === 0) { // Ended
      this.stopYTPolling();
      this.handleTrackEnded();
    }
  }

  startYTPolling() {
    this.stopYTPolling();
    this.ytPollInterval = setInterval(() => {
      if (!this.ytPlayer || typeof this.ytPlayer.getCurrentTime !== 'function') return;

      const current = this.ytPlayer.getCurrentTime() || 0;
      const total = this.ytPlayer.getDuration() || (this.currentTrack ? this.currentTrack.duration : 180);
      const progress = total > 0 ? (current / total) * 100 : 0;

      this.emit('timeupdate', {
        currentTime: current,
        duration: total,
        progress: progress
      });

      this.updateLyricsHighlight(current);
    }, 250);
  }

  stopYTPolling() {
    if (this.ytPollInterval) {
      clearInterval(this.ytPollInterval);
      this.ytPollInterval = null;
    }
  }

  // --- HTML5 Audio Setup ---
  setupAudioEvents() {
    this.audio.addEventListener('timeupdate', () => {
      if (this.currentMode !== 'html5') return;
      const current = this.audio.currentTime || 0;
      const total = this.audio.duration || (this.currentTrack ? this.currentTrack.duration : 180);
      const progress = total > 0 ? (current / total) * 100 : 0;
      
      this.emit('timeupdate', {
        currentTime: current,
        duration: total,
        progress: progress
      });

      this.updateLyricsHighlight(current);
    });

    this.audio.addEventListener('play', () => {
      if (this.currentMode === 'html5') {
        this.isPlaying = true;
        this.emit('statechange', { isPlaying: true });
      }
    });

    this.audio.addEventListener('pause', () => {
      if (this.currentMode === 'html5') {
        this.isPlaying = false;
        this.emit('statechange', { isPlaying: false });
      }
    });

    this.audio.addEventListener('ended', () => {
      if (this.currentMode === 'html5') {
        this.handleTrackEnded();
      }
    });
  }

  // --- Queue & Playback Management ---
  setQueue(trackList, startIndex = 0, autoPlay = true) {
    if (!trackList || trackList.length === 0) return;
    this.originalQueue = [...trackList];
    
    if (this.isShuffle) {
      const current = trackList[startIndex];
      const rest = trackList.filter((_, idx) => idx !== startIndex);
      this.queue = [current, ...this.shuffleArray(rest)];
      this.queueIndex = 0;
    } else {
      this.queue = [...trackList];
      this.queueIndex = startIndex;
    }

    this.emit('queuechange', { queue: this.queue, index: this.queueIndex });
    this.loadTrack(this.queue[this.queueIndex], autoPlay);
  }

  addToQueue(track) {
    if (!track) return;
    this.queue.push(track);
    this.originalQueue.push(track);
    this.emit('queuechange', { queue: this.queue, index: this.queueIndex });
  }

  async loadTrack(track, autoPlay = true) {
    if (!track) return;
    this.currentTrack = track;
    this.saveState();
    storage.addRecentTrack(track.id);

    this.emit('trackchange', { track: this.currentTrack });

    // Local user uploaded file (blob URL)
    if (track.audioSrc && track.audioSrc.startsWith('blob:')) {
      this.currentMode = 'html5';
      this.stopYTPolling();
      if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
        this.ytPlayer.pauseVideo();
      }
      this.audio.src = track.audioSrc;
      this.audio.currentTime = 0;
      if (autoPlay) this.play();
      return;
    }

    // YouTube Audio Mode
    this.currentMode = 'youtube';
    this.audio.pause();

    const playVideoId = (ytId) => {
      if (!ytId) return;
      if (this.isYTReady && this.ytPlayer) {
        if (autoPlay) {
          this.ytPlayer.loadVideoById(ytId);
          this.isPlaying = true;
          this.emit('statechange', { isPlaying: true });
        } else {
          this.ytPlayer.cueVideoById(ytId);
        }
      } else {
        const checkReady = setInterval(() => {
          if (this.isYTReady && this.ytPlayer) {
            clearInterval(checkReady);
            if (autoPlay) {
              this.ytPlayer.loadVideoById(ytId);
              this.isPlaying = true;
              this.emit('statechange', { isPlaying: true });
            }
          }
        }, 100);
      }
    };

    if (track.youtubeId) {
      playVideoId(track.youtubeId);
    } else {
      // 1. Resolve exact YouTube Video ID for searched song from server API
      const resolvedId = await this.resolveYouTubeId(track.title, track.artist);
      if (resolvedId) {
        track.youtubeId = resolvedId;
        storage.addLocalTrack(track);
        playVideoId(resolvedId);
      } else {
        // 2. Fallback: YouTube native search playlist
        if (this.isYTReady && this.ytPlayer && typeof this.ytPlayer.loadPlaylist === 'function') {
          this.ytPlayer.loadPlaylist({
            list: `${track.title} ${track.artist}`,
            listType: 'search',
            index: 0
          });
          this.isPlaying = true;
          this.emit('statechange', { isPlaying: true });
        } else if (track.audioSrc) {
          this.fallbackToHTML5(autoPlay);
        }
      }
    }
  }

  async resolveYouTubeId(title, artist) {
    const cleanQuery = `${title} ${artist}`.replace(/[()\[\]]/g, '').trim();

    // 1. Query Local Server Search API (/api/yt-search?q=...)
    try {
      const res = await fetch(`/api/yt-search?q=${encodeURIComponent(cleanQuery + ' song audio')}`, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const data = await res.json();
        if (data && data.videoId) {
          return data.videoId;
        }
      }
    } catch (e) {}

    // 2. Query Public Invidious search mirrors
    const mirrors = [
      'https://invidious.privacydev.net',
      'https://inv.tux.pizza',
      'https://yt.artemislena.eu'
    ];
    for (const mirror of mirrors) {
      try {
        const res = await fetch(`${mirror}/api/v1/search?q=${encodeURIComponent(cleanQuery + ' audio')}&type=video`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0 && data[0].videoId) {
            return data[0].videoId;
          }
        }
      } catch (e) {}
    }

    return null;
  }

  fallbackToHTML5(autoPlay = true) {
    this.currentMode = 'html5';
    this.stopYTPolling();
    if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
      this.ytPlayer.pauseVideo();
    }

    if (this.currentTrack && this.currentTrack.audioSrc) {
      this.audio.src = this.currentTrack.audioSrc;
      this.audio.currentTime = 0;
      if (autoPlay) {
        this.play();
      }
    }
  }

  play() {
    if (this.currentMode === 'youtube' && this.ytPlayer && typeof this.ytPlayer.playVideo === 'function') {
      this.ytPlayer.playVideo();
      this.isPlaying = true;
      this.emit('statechange', { isPlaying: true });
    } else {
      this.audio.play().then(() => {
        this.isPlaying = true;
        this.emit('statechange', { isPlaying: true });
      }).catch(() => {});
    }
  }

  pause() {
    if (this.currentMode === 'youtube' && this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
      this.ytPlayer.pauseVideo();
      this.stopYTPolling();
      this.isPlaying = false;
      this.emit('statechange', { isPlaying: false });
    } else {
      this.audio.pause();
      this.isPlaying = false;
      this.emit('statechange', { isPlaying: false });
    }
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      if (!this.currentTrack && this.queue.length > 0) {
        this.loadTrack(this.queue[0], true);
      } else {
        this.play();
      }
    }
  }

  nextTrack() {
    if (this.queue.length === 0) return;

    if (this.repeatMode === 'one') {
      this.seek(0);
      this.play();
      return;
    }

    if (this.queueIndex < this.queue.length - 1) {
      this.queueIndex++;
      this.loadTrack(this.queue[this.queueIndex], true);
      this.emit('queuechange', { queue: this.queue, index: this.queueIndex });
    } else if (this.repeatMode === 'all') {
      this.queueIndex = 0;
      this.loadTrack(this.queue[this.queueIndex], true);
      this.emit('queuechange', { queue: this.queue, index: this.queueIndex });
    } else {
      this.pause();
      this.seek(0);
    }
  }

  prevTrack() {
    if (this.queue.length === 0) return;

    const currentPos = this.currentMode === 'youtube' && this.ytPlayer && typeof this.ytPlayer.getCurrentTime === 'function'
      ? this.ytPlayer.getCurrentTime()
      : this.audio.currentTime;

    if (currentPos > 3) {
      this.seek(0);
      return;
    }

    if (this.queueIndex > 0) {
      this.queueIndex--;
      this.loadTrack(this.queue[this.queueIndex], true);
      this.emit('queuechange', { queue: this.queue, index: this.queueIndex });
    } else {
      this.seek(0);
    }
  }

  handleTrackEnded() {
    if (this.repeatMode === 'one') {
      this.seek(0);
      this.play();
    } else {
      this.nextTrack();
    }
  }

  seek(percentage) {
    const total = this.currentMode === 'youtube' && this.ytPlayer && typeof this.ytPlayer.getDuration === 'function'
      ? this.ytPlayer.getDuration()
      : (this.audio.duration || (this.currentTrack ? this.currentTrack.duration : 180));

    const targetSec = (percentage / 100) * total;

    if (this.currentMode === 'youtube' && this.ytPlayer && typeof this.ytPlayer.seekTo === 'function') {
      this.ytPlayer.seekTo(targetSec, true);
    } else {
      this.audio.currentTime = targetSec;
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.isMuted && this.volume > 0) {
      this.isMuted = false;
    }

    const volLevel = this.isMuted ? 0 : this.volume;

    if (this.ytPlayer && typeof this.ytPlayer.setVolume === 'function') {
      this.ytPlayer.setVolume(volLevel * 100);
      if (this.isMuted) {
        this.ytPlayer.mute();
      } else {
        this.ytPlayer.unMute();
      }
    }

    this.audio.volume = volLevel;
    this.saveState();
    this.emit('statechange', { volume: this.volume, isMuted: this.isMuted });
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.setVolume(this.volume);
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    if (this.isShuffle) {
      const current = this.queue[this.queueIndex];
      const rest = this.queue.filter((_, idx) => idx !== this.queueIndex);
      this.queue = [current, ...this.shuffleArray(rest)];
      this.queueIndex = 0;
    } else {
      const current = this.queue[this.queueIndex];
      const rest = [...this.originalQueue];
      this.queue = rest;
      this.queueIndex = this.queue.findIndex(t => t.id === current.id);
      if (this.queueIndex === -1) this.queueIndex = 0;
    }
    this.saveState();
    this.emit('statechange', { isShuffle: this.isShuffle });
    this.emit('queuechange', { queue: this.queue, index: this.queueIndex });
  }

  toggleRepeat() {
    if (this.repeatMode === 'off') {
      this.repeatMode = 'all';
    } else if (this.repeatMode === 'all') {
      this.repeatMode = 'one';
    } else {
      this.repeatMode = 'off';
    }
    this.saveState();
    this.emit('statechange', { repeatMode: this.repeatMode });
  }

  updateLyricsHighlight(currentTime) {
    if (!this.currentTrack || !this.currentTrack.lyrics) {
      this.emit('lyricsupdate', { activeIndex: -1, lyrics: [] });
      return;
    }
    const lyrics = this.currentTrack.lyrics;
    let activeIndex = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime >= lyrics[i].time) {
        activeIndex = i;
      } else {
        break;
      }
    }
    this.emit('lyricsupdate', { activeIndex, lyrics });
  }

  shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  getFrequencyData() {
    const freq = new Uint8Array(64);
    if (!this.isPlaying) return freq;
    
    const time = Date.now() / 100;
    for (let i = 0; i < freq.length; i++) {
      const val = Math.sin(time + i * 0.4) * 80 + Math.cos(time * 0.7 - i * 0.2) * 50 + 120;
      freq[i] = Math.max(10, Math.min(255, val * this.volume));
    }
    return freq;
  }

  saveState() {
    storage.savePlayerState({
      volume: this.volume,
      isMuted: this.isMuted,
      shuffle: this.isShuffle,
      repeat: this.repeatMode,
      currentTrackId: this.currentTrack ? this.currentTrack.id : null
    });
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
}

export const player = new AudioEngine();

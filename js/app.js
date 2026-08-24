/**
 * ZR Web Desktop Clone - Main Application Orchestrator
 * Handles YouTube URL parsing, local drag & drop, player controls,
 * keyboard shortcuts, and view coordination.
 */

import { storage } from './storage.js';
import { player } from './audioPlayer.js';
import { ui } from './ui.js';
import { setupAuth, isUserSignedIn, showAuthDetailsLoader, hideAuthDetailsLoader } from './auth.js';

class ZRApp {
  constructor() {
    this.isScrubbingTimeline = false;
    this.isScrubbingVolume = false;
    this.appVersion = '1.0';
    this.versionCheckTimer = null;
    this.versionStatus = 'checking';
    window.__ZR_VERSION__ = this.appVersion;
  }

  async init() {
    // Show splash screen while loading
    this.showSplash();

    ui.init();
    this.bindDOMEvents();
    setupAuth(ui);
    this.bindKeyboardShortcuts();
    this.bindDragAndDrop();
    this.loadInitialTrack();
    this.checkForAppUpdate();
    this.versionCheckTimer = setInterval(() => this.checkForAppUpdate(), 60000);

    // Hide splash after a short delay (data loaded)
    setTimeout(() => this.hideSplash(), 1200);

    window.ZRApp = this;
  }

  showSplash() {
    const splash = document.getElementById('splash-screen');
    if (splash) splash.classList.remove('fade-out');
  }

  hideSplash() {
    const splash = document.getElementById('splash-screen');
    if (splash) splash.classList.add('fade-out');
    // Remove from DOM after animation
    setTimeout(() => { if (splash) splash.remove(); }, 700);
  }

  async checkForAppUpdate() {
    const versionUrl = '/api/version';
    const storageKey = 'ZR_APP_VERSION';

    try {
      const response = await fetch(versionUrl, { cache: 'no-store' });
      if (!response.ok) return;

      const latestVersion = (await response.text()).trim();
      if (!latestVersion) return;

      const savedVersion = localStorage.getItem(storageKey) || this.appVersion;
      const isMismatch = latestVersion !== this.appVersion;

      this.versionStatus = isMismatch ? 'mismatch' : 'ok';
      window.__ZR_VERSION_STATUS__ = this.versionStatus;

      if (!savedVersion || savedVersion !== latestVersion) {
        localStorage.setItem(storageKey, latestVersion);
      }

      if (isMismatch) {
        ui.showAppUpdateModal();
      }
    } catch (error) {
      console.warn('Version check failed:', error);
      this.versionStatus = 'error';
      window.__ZR_VERSION_STATUS__ = this.versionStatus;
    }
  }

  loadInitialTrack() {
    const savedState = storage.getPlayerState();
    const allTracks = storage.getAllTracks();
    const currentTrackId = savedState.currentTrackId;

    player.currentTrack = null;
    player.queue = [];
    player.queueIndex = 0;
    player.originalQueue = [];
    player.isPlaying = false;

    if (!currentTrackId) {
      ui.updatePlayerBarTrack(null);
      return;
    }

    const initialTrack = allTracks.find(t => t.id === currentTrackId);
    if (initialTrack) {
      player.setQueue(allTracks, allTracks.findIndex(t => t.id === initialTrack.id), false);
      ui.updatePlayerBarTrack(initialTrack);
    } else {
      ui.updatePlayerBarTrack(null);
    }
  }

  async requireSignedInForPlay() {
    if (await isUserSignedIn()) return true;
    ui.showToast('Please sign in to play music.', 3500, 'warning');
    return false;
  }

  bindDOMEvents() {
    // 1. Navigation Topbar Click Events
    document.getElementById('btn-history-back')?.addEventListener('click', () => ui.goBack());
    document.getElementById('btn-history-forward')?.addEventListener('click', () => ui.goForward());

    const brandLogo = document.querySelector('.brand-logo');
    const brandHoverCard = document.getElementById('brand-hover-card');
    if (brandLogo && brandHoverCard) {
      brandLogo.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const shouldShow = brandHoverCard.classList.contains('hidden');
        brandHoverCard.classList.toggle('hidden', !shouldShow);
      });

      document.addEventListener('click', (event) => {
        if (!event.target.closest('.brand-logo-wrap')) {
          brandHoverCard.classList.add('hidden');
        }
      });
    }

    // Search Input
    const searchInput = document.getElementById('topbar-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        ui.searchQuery = val;
        ui.renderSearchHistoryDropdown(val);

        // Check if user pasted a direct YouTube link into search bar
        const ytId = this.extractYouTubeId(val);
        if (ytId) {
          this.handleYouTubeTrack(ytId, "YouTube Stream", "YouTube Audio");
          e.target.value = '';
          ui.navigateTo('home');
          return;
        }
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const val = searchInput.value.trim();
        if (!val) return;
        console.debug('[app] Search Enter pressed, value=', val);
        try { storage.addRecentSearch(val); } catch (err) { console.warn('[app] addRecentSearch error', err); }
        try { ui.renderSearchHistoryDropdown(val); } catch (err) { console.warn('[app] renderSearchHistoryDropdown error', err); }
        try {
          ui.navigateTo('search', val);
          console.debug('[app] navigateTo called for search with', val);
        } catch (err) {
          console.error('[app] navigateTo error', err);
        }
      });

      searchInput.addEventListener('focus', () => {
        ui.renderSearchHistoryDropdown(searchInput.value);
      });

      searchInput.addEventListener('click', () => {
        ui.renderSearchHistoryDropdown(searchInput.value);
      });

      document.addEventListener('click', (event) => {
        const withinSearch = event.target.closest('#topbar-search-container') || event.target.closest('#search-history-dropdown');
        if (!withinSearch && ui.searchHistoryDropdown) {
          ui.searchHistoryDropdown.classList.add('hidden');
        }
      });
    }

    // Top Navigation Links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.getAttribute('data-view');
        const action = link.getAttribute('data-action');
        if (action === 'open-all-playlists') {
          ui.navigateTo('playlists');
          return;
        }
        if (view === 'search') {
          const currentValue = searchInput?.value || ui.searchQuery || '';
          ui.renderSearchHistoryDropdown(currentValue);
          ui.navigateTo('search', '');
          return;
        }
        ui.navigateTo(view || 'home');
      });
    });

    // 2. Playback Controls in Player Bar
    document.getElementById('btn-play-pause')?.addEventListener('click', async () => {
      if (!(await isUserSignedIn())) {
        ui.showToast('Please sign in to play music.', 3500, 'warning');
        return;
      }
      player.togglePlay();
    });

    document.getElementById('btn-next')?.addEventListener('click', () => {
      player.nextTrack();
    });

    document.getElementById('btn-prev')?.addEventListener('click', () => {
      player.prevTrack();
    });

    document.getElementById('btn-shuffle')?.addEventListener('click', () => {
      player.toggleShuffle();
    });

    document.getElementById('btn-repeat')?.addEventListener('click', () => {
      player.toggleRepeat();
    });

    document.getElementById('btn-mute')?.addEventListener('click', () => {
      player.toggleMute();
    });

    // Player Like Button
    document.getElementById('player-like-btn')?.addEventListener('click', (e) => {
      const trackId = e.currentTarget.getAttribute('data-id') || (player.currentTrack && player.currentTrack.id);
      if (trackId) {
        this.handleToggleLike(trackId);
      }
    });

    // The three-dot button uses the same song menu as track rows, so every
    // action (queue, liked songs, playlists and sharing) behaves consistently.
    document.getElementById('player-more-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const track = player.currentTrack;
      if (track) this.openContextMenu(e, track.id);
    });

    // Lyrics & Queue Toggles
    document.getElementById('btn-lyrics-toggle')?.addEventListener('click', () => {
      if (ui.currentView === 'lyrics') {
        ui.goBack();
      } else {
        ui.navigateTo('lyrics');
      }
    });

    document.getElementById('btn-queue-toggle')?.addEventListener('click', () => {
      ui.toggleRightSidebar('queue');
    });

    document.getElementById('btn-now-playing-toggle')?.addEventListener('click', () => {
      ui.toggleRightSidebar('now-playing');
    });

    document.getElementById('btn-visualizer-toggle')?.addEventListener('click', () => {
      ui.openVisualizerModal();
    });

    // 3. Timeline Scrubber (Draggable & Clickable)
    const progressBar = document.getElementById('player-progress-bar');
    if (progressBar) {
      progressBar.addEventListener('mousedown', (e) => {
        this.isScrubbingTimeline = true;
        this.handleTimelineScrub(e);
      });
    }

    // 4. Volume Scrubber
    const volumeBar = document.getElementById('volume-progress-bar');
    if (volumeBar) {
      volumeBar.addEventListener('mousedown', (e) => {
        this.isScrubbingVolume = true;
        this.handleVolumeScrub(e);
      });
    }

    // Global Mouse Move & Up for Smooth Scrubbing
    document.addEventListener('mousemove', (e) => {
      if (this.isScrubbingTimeline) {
        this.handleTimelineScrub(e);
      }
      if (this.isScrubbingVolume) {
        this.handleVolumeScrub(e);
      }
    });

    document.addEventListener('mouseup', () => {
      this.isScrubbingTimeline = false;
      this.isScrubbingVolume = false;
    });

    // 5. Global Action Delegation
    document.addEventListener('click', async (e) => {
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) {
        this.closeContextMenu();
        return;
      }

      const action = actionEl.getAttribute('data-action');
      const id = actionEl.getAttribute('data-id');
      console.debug('[app] click action:', action, 'id:', id, 'el:', actionEl);
      // Show a small visual toast for key navigation actions to aid debugging
      try {
        const debugActions = ['filter-category', 'open-artist', 'play-artist-all', 'open-playlist', 'play-playlist', 'play-track', 'play-liked'];
        if (debugActions.includes(action) && ui && typeof ui.showToast === 'function') {
          const title = actionEl.getAttribute('data-title') || '';
          let idLabel = '';
          if (id) {
            // Prefer human-friendly track title when available
            try {
              const track = storage.getTrackById(id);
              if (track && track.title) {
                idLabel = track.title;
              } else {
                idLabel = id.replace(/^itunes-/, '');
              }
            } catch (e) {
              idLabel = id.replace(/^itunes-/, '');
            }
          }
          ui.showToast(`${action}${title ? ': ' + title : idLabel ? ': ' + idLabel : ''}`, 1200, 'info');
        }
      } catch (e) {
        console.warn('[app] debug toast failed', e);
      }

      switch (action) {
        case 'open-playlist':
          ui.navigateTo('playlist', id);
          break;
        case 'open-liked':
          ui.navigateTo('liked-songs');
          break;
        case 'open-artist':
          ui.navigateTo('artist', id);
          break;
        case 'filter-category': {
          const title = actionEl.getAttribute('data-title');
          console.debug('[app] filter-category clicked, title=', title);
          ui.navigateTo('search', title);
          break;
        }
        case 'play-track': {
          e.stopPropagation();
          if (!(await this.requireSignedInForPlay())) break;
          const track = storage.getTrackById(id);
          if (track) {
            const allTracks = storage.getAllTracks();
            player.setQueue(allTracks, allTracks.findIndex(t => t.id === id), true);
          }
          break;
        }
        case 'play-playlist':
        case 'play-playlist-all': {
          e.stopPropagation();
          if (!(await this.requireSignedInForPlay())) break;
          const playlist = storage.getPlaylistById(id);
          if (playlist && playlist.trackIds.length > 0) {
            const playlistTracks = playlist.trackIds.map(tId => storage.getTrackById(tId)).filter(Boolean);
            player.setQueue(playlistTracks, 0, true);
            ui.showToast(`Playing "${playlist.title}"`, 3000, 'success');
          } else {
            ui.showToast('This playlist is empty. Add some tracks first!', 3500, 'warning');
          }
          break;
        }
        case 'play-artist-all': {
          e.stopPropagation();
          if (!(await this.requireSignedInForPlay())) break;
          const tracks = storage.getTracksByArtist(id);
          if (tracks.length > 0) {
            player.setQueue(tracks, 0, true);
            ui.showToast(`Playing all tracks by "${id}"`, 3000, 'success');
          }
          break;
        }
        case 'play-liked': {
          e.stopPropagation();
          if (!(await this.requireSignedInForPlay())) break;
          const likedIds = storage.getLikedTrackIds();
          const likedTracks = likedIds.map(tId => storage.getTrackById(tId)).filter(Boolean);
          if (likedTracks.length > 0) {
            player.setQueue(likedTracks, 0, true);
            ui.showToast('Playing your Liked Songs', 3000, 'success');
          } else {
            ui.showToast('No Liked Songs yet! Tap the heart icon on any track.', 4000, 'info');
          }
          break;
        }
        case 'play-track-in-context': {
          if (!(await this.requireSignedInForPlay())) break;
          const playlistId = actionEl.getAttribute('data-playlist-id');
          const trackId = actionEl.getAttribute('data-track-id');
          if (playlistId) {
            const pl = storage.getPlaylistById(playlistId);
            if (pl) {
              const tracks = pl.trackIds.map(tId => storage.getTrackById(tId)).filter(Boolean);
              player.setQueue(tracks, tracks.findIndex(t => t.id === trackId), true);
            }
          } else {
            const allTracks = storage.getAllTracks();
            player.setQueue(allTracks, allTracks.findIndex(t => t.id === trackId), true);
          }
          break;
        }
        case 'toggle-like': {
          e.stopPropagation();
          this.handleToggleLike(id);
          break;
        }
        case 'open-create-playlist':
          ui.openCreatePlaylistModal();
          break;
        case 'refresh-playlists': {
          if (!(await isUserSignedIn())) {
            ui.showToast('Please sign in to sync playlists.', 3500, 'warning');
            break;
          }
          ui.showToast('Refreshing playlists...', 2500, 'info');
          await storage.fullSync();
          ui.renderSidebarPlaylists();
          ui.navigateTo(ui.currentView || 'playlists', ui.currentParam || null);
          ui.showToast('Playlists synced successfully!', 3000, 'success');
          break;
        }
        case 'open-file-import':
          ui.openFileImportModal();
          break;
        case 'close-modal': {
          const modalId = actionEl.getAttribute('data-modal');
          ui.closeModal(modalId);
          break;
        }
        case 'switch-right-mode': {
          const mode = actionEl.getAttribute('data-mode');
          ui.toggleRightSidebar(mode);
          break;
        }
        case 'seek-to-lyric': {
          const timeVal = parseFloat(actionEl.getAttribute('data-time-val'));
          if (!isNaN(timeVal)) {
            const total = player.ytPlayer?.getDuration?.() || player.audio.duration || 180;
            if (total > 0) {
              player.seek((timeVal / total) * 100);
            }
          }
          break;
        }
        case 'delete-playlist': {
          if (confirm("Are you sure you want to delete this playlist?")) {
            storage.deletePlaylist(id);
            ui.renderSidebarPlaylists();
            ui.navigateTo('home');
            ui.showToast('Playlist deleted', 3000, 'success');
          }
          break;
        }
        case 'toggle-follow-artist': {
          const isFollowing = actionEl.textContent === 'FOLLOWING';
          actionEl.textContent = isFollowing ? 'FOLLOW' : 'FOLLOWING';
          actionEl.classList.toggle('following', !isFollowing);
          ui.showToast(isFollowing ? 'Unfollowed artist' : 'Now following artist!', 3000, 'success');
          break;
        }
      }

      this.closeContextMenu();
    });

    // 6. Modal Form Submissions & Tab Switchers
    const tabBtnYt = document.getElementById('tab-btn-yt');
    const tabBtnFile = document.getElementById('tab-btn-file');
    const formYt = document.getElementById('yt-import-form');
    const formFile = document.getElementById('file-import-form');

    tabBtnYt?.addEventListener('click', () => {
      tabBtnYt.classList.add('active');
      tabBtnFile.classList.remove('active');
      formYt.classList.remove('hidden');
      formFile.classList.add('hidden');
    });

    tabBtnFile?.addEventListener('click', () => {
      tabBtnFile.classList.add('active');
      tabBtnYt.classList.remove('active');
      formFile.classList.remove('hidden');
      formYt.classList.add('hidden');
    });

    // YouTube Import Form Submit
    formYt?.addEventListener('submit', (e) => {
      e.preventDefault();
      const inputVal = document.getElementById('yt-url-input').value.trim();
      const title = document.getElementById('yt-title-input').value.trim();
      const artist = document.getElementById('yt-artist-input').value.trim();

      const ytId = this.extractYouTubeId(inputVal);
      if (!ytId) {
        ui.showToast('Invalid YouTube URL or Video ID. Please check and try again.', 4000, 'error');
        return;
      }

      this.handleYouTubeTrack(ytId, title, artist);
      ui.closeModal('file-import-modal');
      e.target.reset();
    });

    // Create Playlist Form Submit
    document.getElementById('create-playlist-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('playlist-title-input').value.trim();
      const desc = document.getElementById('playlist-desc-input').value.trim();
      const cover = document.getElementById('playlist-cover-input').value.trim();

      const newPl = storage.createPlaylist(title, desc, cover || null);
      ui.renderSidebarPlaylists();
      ui.closeModal('create-playlist-modal');
      ui.navigateTo('playlist', newPl.id);
      ui.showToast(`Playlist "${newPl.title}" created!`, 3000, 'success');
      e.target.reset();
    });

    // Local File Import Form Submit
    formFile?.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('import-title-input').value.trim();
      const artist = document.getElementById('import-artist-input').value.trim();
      const fileInput = document.getElementById('import-file-input');

      if (fileInput.files && fileInput.files[0]) {
        this.handleLocalAudioFile(fileInput.files[0], title, artist);
        ui.closeModal('file-import-modal');
        e.target.reset();
      } else {
        ui.showToast('Please choose an audio file to import.', 3500, 'warning');
      }
    });
  }

  extractYouTubeId(input) {
    if (!input) return null;
    input = input.trim();

    // Plain 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
      return input;
    }

    // Standard YouTube URL formats
    const match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  handleYouTubeTrack(ytId, customTitle = null, customArtist = null) {
    const title = customTitle || `YouTube Audio (${ytId})`;
    const artist = customArtist || "YouTube Stream";
    const cover = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

    const newTrack = {
      id: `yt-track-${ytId}-${Date.now()}`,
      title: title,
      artist: artist,
      album: "YouTube Music",
      duration: 210,
      cover: cover,
      color: "#c4302b",
      genre: "YouTube",
      youtubeId: ytId,
      lyrics: [
        { time: 0, text: `▶ Streaming from YouTube: ${title}` },
        { time: 10, text: `Video ID: ${ytId}` },
        { time: 20, text: `Enjoy high fidelity audio with ZR Desktop controls.` }
      ]
    };

    storage.addLocalTrack(newTrack);
    player.addToQueue(newTrack);
    player.loadTrack(newTrack, true);
    ui.showToast(`Now playing: "${title}"`, 3000, 'success');

    if (ui.currentView === 'home' || ui.currentView === 'search') {
      ui.navigateTo(ui.currentView, ui.currentParam);
    }
  }

  handleTimelineScrub(e) {
    const progressBar = document.getElementById('player-progress-bar');
    if (!progressBar) return;
    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    player.seek(percent);
  }

  handleVolumeScrub(e) {
    const volumeBar = document.getElementById('volume-progress-bar');
    if (!volumeBar) return;
    const rect = volumeBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const level = Math.max(0, Math.min(1, clickX / rect.width));
    player.setVolume(level);
  }

  handleToggleLike(trackId) {
    const isNowLiked = storage.toggleLike(trackId);
    ui.showToast(isNowLiked ? 'Added to your Liked Songs ♥' : 'Removed from Liked Songs', 3000, isNowLiked ? 'success' : 'info');

    if (player.currentTrack && player.currentTrack.id === trackId) {
      ui.playerLikeBtn.classList.toggle('liked', isNowLiked);
    }

    ui.renderSidebarPlaylists();
    if (ui.currentView === 'liked-songs') {
      ui.renderPlaylist('liked-songs');
    } else if (ui.currentView === 'playlist') {
      ui.renderPlaylist(ui.currentParam);
    }
    ui.renderRightSidebar();
  }

  // --- Drag & Drop Audio Ingestion ---
  bindDragAndDrop() {
    const dropZone = document.body;

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over-active');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over-active');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          if (files[i].type.startsWith('audio/') || files[i].name.match(/\.(mp3|wav|ogg|flac|m4a|aac)$/i)) {
            this.handleLocalAudioFile(files[i]);
          }
        }
      }
    });
  }

  handleLocalAudioFile(file, customTitle = null, customArtist = null) {
    const blobUrl = URL.createObjectURL(file);
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    const title = customTitle || fileName;
    const artist = customArtist || "Local File";

    const newTrack = {
      id: `local-track-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      title: title,
      artist: artist,
      album: "Local Files",
      duration: 180,
      cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
      color: "#1DB954",
      genre: "Local Music",
      audioSrc: blobUrl,
      lyrics: [
        { time: 0, text: `Playing local audio: ${title}` },
        { time: 10, text: `Artist: ${artist}` }
      ]
    };

    storage.addLocalTrack(newTrack);
    player.addToQueue(newTrack);
    player.loadTrack(newTrack, true);
    ui.showToast(`Imported & playing: "${title}"`, 3000, 'success');
    
    if (ui.currentView === 'home' || ui.currentView === 'search') {
      ui.navigateTo(ui.currentView, ui.currentParam);
    }
  }

  // --- Context Menu Management ---
  openContextMenu(e, trackId, playlistId = '') {
    e.preventDefault();
    const track = storage.getTrackById(trackId);
    if (!track) return;

    this.activeContextMenuTrack = track;
    const menu = document.getElementById('context-menu');
    if (!menu) return;

    const playlists = storage.getPlaylists();
    const isLiked = storage.isLiked(track.id);

    menu.innerHTML = `
      <div class="context-item" data-action="context-play" data-id="${track.id}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        <span>Play Song</span>
      </div>
      <div class="context-item" data-action="context-queue" data-id="${track.id}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zm-7-2h2v-4h4V8h-4V4h-2v4H9v2h4z"/></svg>
        <span>Add to Queue</span>
      </div>
      <div class="context-item" data-action="toggle-like" data-id="${track.id}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="m12 21.35-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        <span>${isLiked ? 'Remove from your Liked Songs' : 'Save to your Liked Songs'}</span>
      </div>
      <div class="context-divider"></div>
      
      <!-- Submenu: Add to Playlist -->
      <div class="context-submenu-parent">
        <div class="context-item flex justify-between">
          <div class="flex items-center gap-2">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            <span>Add to Playlist</span>
          </div>
          <span>▶</span>
        </div>
        <div class="context-submenu">
          ${playlists.map(pl => `
            <div class="context-item" data-action="context-add-to-playlist" data-playlist-id="${pl.id}" data-track-id="${track.id}">
              <span>${pl.title}</span>
            </div>
          `).join('')}
        </div>
      </div>

      ${playlistId ? `
        <div class="context-item" data-action="context-remove-from-playlist" data-playlist-id="${playlistId}" data-track-id="${track.id}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          <span>Remove from this playlist</span>
        </div>
      ` : ''}

      <div class="context-divider"></div>
      <div class="context-item" data-action="context-copy-link" data-id="${track.id}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
        <span>Copy Song Link</span>
      </div>
    `;

    // Position menu
    menu.classList.remove('hidden');
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    const menuWidth = 230;
    const menuHeight = 260;

    const posX = mouseX + menuWidth > window.innerWidth ? mouseX - menuWidth : mouseX;
    const posY = mouseY + menuHeight > window.innerHeight ? mouseY - menuHeight : mouseY;

    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;

    menu.querySelectorAll('.context-item').forEach(item => {
      item.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const action = item.getAttribute('data-action');
        if (action === 'context-play') {
          if (!(await this.requireSignedInForPlay())) return this.closeContextMenu();
          player.loadTrack(track, true);
        } else if (action === 'context-queue') {
          player.addToQueue(track);
          ui.showToast(`Added "${track.title}" to queue`);
        } else if (action === 'context-add-to-playlist') {
          const plId = item.getAttribute('data-playlist-id');
          showAuthDetailsLoader('Adding to playlist…');
          const success = storage.addTrackToPlaylist(plId, track.id);
          setTimeout(() => {
            hideAuthDetailsLoader();
            ui.showToast(success ? 'Added to playlist!' : 'Track already in this playlist', 3000, success ? 'success' : 'warning');
          }, 1200);
        } else if (action === 'context-remove-from-playlist') {
          const plId = item.getAttribute('data-playlist-id');
          storage.removeTrackFromPlaylist(plId, track.id);
          ui.renderPlaylist(plId);
          ui.showToast('Removed from playlist', 3000, 'success');
        } else if (action === 'context-copy-link') {
          navigator.clipboard?.writeText(window.location.href);
          ui.showToast('Link copied to clipboard!', 3000, 'success');
        }
        this.closeContextMenu();
      });
    });
  }

  closeContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.classList.add('hidden');
  }

  // --- Keyboard Shortcuts ---
  bindKeyboardShortcuts() {
    document.addEventListener('keydown', async (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        if (e.key === 'Escape') {
          document.activeElement.blur();
        }
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (!(await isUserSignedIn())) {
            ui.showToast('Please sign in to play music.');
            return;
          }
          player.togglePlay();
          break;
        case 'ArrowRight':
          if (e.ctrlKey) {
            player.nextTrack();
          } else {
            const current = player.ytPlayer?.getCurrentTime?.() || player.audio.currentTime || 0;
            const total = player.ytPlayer?.getDuration?.() || player.audio.duration || 180;
            player.seek(Math.min(100, ((current + 5) / total) * 100));
          }
          break;
        case 'ArrowLeft':
          if (e.ctrlKey) {
            player.prevTrack();
          } else {
            const current = player.ytPlayer?.getCurrentTime?.() || player.audio.currentTime || 0;
            const total = player.ytPlayer?.getDuration?.() || player.audio.duration || 180;
            player.seek(Math.max(0, ((current - 5) / total) * 100));
          }
          break;
        case 'KeyM':
          player.toggleMute();
          break;
        case 'KeyL':
          if (player.currentTrack) {
            this.handleToggleLike(player.currentTrack.id);
          }
          break;
        case 'KeyK':
          if (e.ctrlKey) {
            e.preventDefault();
            ui.navigateTo('search');
          }
          break;
        case 'Escape':
          this.closeContextMenu();
          document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
          break;
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new ZRApp();
  app.init();
});

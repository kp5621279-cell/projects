/**
 * ZR Web Desktop Clone - UI Renderer & View Controller
 * Features Instant Local + Live Global Music Search (Any song in the world),
 * ZR Views, Karaoke Lyrics, Audio Visualizer, and Modals.
 */

import { storage } from './storage.js';
import { player } from './audioPlayer.js';
import { CATEGORIES } from './data.js';

class UIManager {
  constructor() {
    this.currentView = 'home';
    this.viewHistory = ['home'];
    this.historyIndex = 0;
    this.activeContextMenuTrack = null;
    this.searchQuery = '';
    this.searchDebounceTimer = null;
    this.lyricsMode = false;
    this.rightSidebarMode = 'now-playing';
    this.isVisualizerOpen = false;
  }

  init() {
    this.cacheDOMElements();
    this.setupPlayerListeners();
    this.renderSidebarPlaylists();
    this.navigateTo('home');
    this.setupVisualizerLoop();
  }

  cacheDOMElements() {
    this.mainContent = document.getElementById('main-content');
    this.dynamicHeader = document.getElementById('dynamic-header-bg');
    this.topbar = document.getElementById('topbar');
    this.searchInput = document.getElementById('topbar-search-input');
    this.searchContainer = document.getElementById('topbar-search-container');
    this.searchHistoryDropdown = document.getElementById('search-history-dropdown');
    this.sidebarPlaylistsList = document.getElementById('sidebar-playlists-list');
    this.rightSidebar = document.getElementById('right-sidebar');
    this.rightSidebarContent = document.getElementById('right-sidebar-content');
    
    // Player bar elements
    this.playerCover = document.getElementById('player-cover');
    this.playerTitle = document.getElementById('player-title');
    this.playerArtist = document.getElementById('player-artist');
    this.playerLikeBtn = document.getElementById('player-like-btn');
    this.playPauseBtn = document.getElementById('btn-play-pause');
    this.btnShuffle = document.getElementById('btn-shuffle');
    this.btnRepeat = document.getElementById('btn-repeat');
    this.btnMute = document.getElementById('btn-mute');
    this.progressCurrentTime = document.getElementById('player-current-time');
    this.progressTotalTime = document.getElementById('player-total-time');
    this.progressBar = document.getElementById('player-progress-bar');
    this.progressFill = document.getElementById('player-progress-fill');
    this.progressHandle = document.getElementById('player-progress-handle');
    this.volumeBar = document.getElementById('volume-progress-bar');
    this.volumeFill = document.getElementById('volume-progress-fill');
    this.btnLyrics = document.getElementById('btn-lyrics-toggle');
    this.btnQueue = document.getElementById('btn-queue-toggle');

    // Context menu & toasts
    this.contextMenu = document.getElementById('context-menu');
    this.toastContainer = document.getElementById('toast-container');
  }

  setupPlayerListeners() {
    player.on('trackchange', ({ track }) => {
      this.updatePlayerBarTrack(track);
      this.updateActiveTrackInLists(track.id);
      if (this.currentView === 'lyrics') {
        this.renderLyrics();
      }
      this.renderRightSidebar();
    });

    player.on('statechange', (state) => {
      if (state.isPlaying !== undefined) {
        this.updatePlayPauseIcon(state.isPlaying);
        this.updatePlayingAnimation(state.isPlaying);
      }
      if (state.isShuffle !== undefined) {
        this.btnShuffle.classList.toggle('active', state.isShuffle);
      }
      if (state.repeatMode !== undefined) {
        this.btnRepeat.classList.toggle('active', state.repeatMode !== 'off');
        this.btnRepeat.setAttribute('title', `Repeat: ${state.repeatMode.toUpperCase()}`);
        const repeatBadge = document.getElementById('repeat-badge');
        if (repeatBadge) {
          repeatBadge.textContent = state.repeatMode === 'one' ? '1' : '';
          repeatBadge.style.display = state.repeatMode === 'one' ? 'block' : 'none';
        }
      }
      if (state.volume !== undefined || state.isMuted !== undefined) {
        this.updateVolumeBar(player.isMuted ? 0 : player.volume);
      }
    });

    player.on('timeupdate', ({ currentTime, duration, progress }) => {
      this.progressCurrentTime.textContent = this.formatTime(currentTime);
      this.progressTotalTime.textContent = this.formatTime(duration);
      this.progressFill.style.width = `${progress}%`;
      this.progressHandle.style.left = `${progress}%`;
    });

    player.on('lyricsupdate', ({ activeIndex }) => {
      this.highlightLyricsLine(activeIndex);
    });

    player.on('queuechange', () => {
      if (this.rightSidebarMode === 'queue') {
        this.renderRightSidebar();
      }
    });
  }

  // --- Navigation & Router ---
  navigateTo(view, param = null) {
    this.currentView = view;
    this.currentParam = param;
    
    if (this.viewHistory[this.historyIndex] !== `${view}:${param}`) {
      this.viewHistory = this.viewHistory.slice(0, this.historyIndex + 1);
      this.viewHistory.push(`${view}:${param}`);
      this.historyIndex = this.viewHistory.length - 1;
    }

    this.updateNavButtons();
    this.updateActiveNavPills();

    if (view === 'search') {
      if (this.searchContainer) this.searchContainer.classList.remove('hidden');
      if (param) {
        if (this.searchInput) this.searchInput.value = param;
        this.searchQuery = param;
      }
      if (this.searchInput) this.searchInput.focus();
    } else {
      if (this.searchContainer) this.searchContainer.classList.remove('hidden'); // Keep visible for fast search anytime!
    }

    this.mainContent.scrollTop = 0;
    this.setDynamicHeaderColor('#121212');

    switch (view) {
      case 'home':
        this.renderHome();
        break;
      case 'search':
      case 'charts':
      case 'radio':
        this.renderSearch(this.searchQuery);
        break;
      case 'artists':
        this.renderArtists();
        break;
      case 'playlists':
        this.renderPlaylists();
        break;
      case 'playlist':
        this.renderPlaylist(param);
        break;
      case 'liked-songs':
        this.renderPlaylist('liked-songs');
        break;
      case 'artist':
        this.renderArtist(param);
        break;
      case 'lyrics':
        this.renderLyrics();
        break;
      default:
        this.renderHome();
    }
  }

  goBack() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const [view, param] = this.viewHistory[this.historyIndex].split(':');
      this.navigateTo(view, param === 'null' ? null : param);
    }
  }

  goForward() {
    if (this.historyIndex < this.viewHistory.length - 1) {
      this.historyIndex++;
      const [view, param] = this.viewHistory[this.historyIndex].split(':');
      this.navigateTo(view, param === 'null' ? null : param);
    }
  }

  updateNavButtons() {
    const btnBack = document.getElementById('btn-history-back');
    const btnForward = document.getElementById('btn-history-forward');
    if (btnBack) btnBack.disabled = this.historyIndex <= 0;
    if (btnForward) btnForward.disabled = this.historyIndex >= this.viewHistory.length - 1;
  }

  updateActiveNavPills() {
    const navItems = document.querySelectorAll('.nav-link');
    navItems.forEach(item => {
      const target = item.getAttribute('data-view');
      item.classList.toggle('active', target === this.currentView);
    });
  }

  renderSearchHistoryDropdown(query = '') {
    const term = String(query || '').trim();
    if (!this.searchHistoryDropdown) return;

    const searches = storage.getRecentSearches();
    const visible = term ? searches.filter(item => item.toLowerCase().includes(term.toLowerCase())) : searches;

    if (!visible.length) {
      this.searchHistoryDropdown.classList.add('hidden');
      this.searchHistoryDropdown.innerHTML = '';
      return;
    }

    this.searchHistoryDropdown.innerHTML = visible.map(item => `
      <button type="button" class="search-history-item" data-search-term="${item}">${item}</button>
    `).join('');

    this.searchHistoryDropdown.classList.remove('hidden');

    this.searchHistoryDropdown.querySelectorAll('.search-history-item').forEach(button => {
      button.addEventListener('click', () => {
        const selected = button.getAttribute('data-search-term');
        if (this.searchInput) {
          this.searchInput.value = selected;
          this.searchQuery = selected;
        }
        this.searchHistoryDropdown.classList.add('hidden');
        this.navigateTo('search', selected);
      });
    });
  }

  getFeaturedSongsForHome() {
    const allTracks = storage.getAllTracks();
    const englishTracks = allTracks.filter(track =>
      !/hindi|bollywood|punjabi|arabic|desi|indian|romantic/i.test(track.genre || '') &&
      !/hindi|singh|dosanjh|arijit|khan|shreya|bhojpuri|bollywood/i.test(track.artist || '')
    );
    const hindiTracks = allTracks.filter(track =>
      /hindi|bollywood|punjabi|romantic|indian/i.test(track.genre || '') ||
      /singh|dosanjh|arijit|bollywood|punjabi/i.test(track.artist || '')
    );

    const mixed = [...englishTracks, ...hindiTracks];
    const shuffled = [...mixed].sort(() => Math.random() - 0.5);
    const featured = shuffled.slice(0, 5);

    if (featured.length < 5) {
      return [...allTracks].sort(() => Math.random() - 0.5).slice(0, 5);
    }

    return featured;
  }

  setDynamicHeaderColor(colorHex) {
    if (!this.dynamicHeader) return;
    this.dynamicHeader.style.background = `linear-gradient(180deg, ${colorHex} 0%, rgba(18, 18, 18, 0) 100%)`;
  }

  // --- Views Rendering ---

  // 1. HOME VIEW
  renderHome() {
    const greeting = this.getTimeGreeting();
    const tracks = storage.getAllTracks();
    const playlists = storage.getPlaylists();
    const artists = storage.getArtists();

    this.setDynamicHeaderColor(playlists[0]?.color || '#1e3264');

    const artistFeed = artists.slice(0, 4).map(artist => {
      const artistTracks = storage.getTracksByArtist(artist.name).slice(0, 3);
      return `
        <div class="artist-popular-feed" data-action="open-artist" data-id="${artist.id}">
          <div class="artist-feed-header">
            <img src="${artist.avatar}" alt="${artist.name}" />
            <div>
              <h3>${artist.name}</h3>
              <span>${artist.monthlyListeners} monthly listeners</span>
            </div>
          </div>
          <div class="artist-feed-tracks">
            ${artistTracks.map(track => `
              <button class="artist-feed-track" type="button" data-action="play-track" data-id="${track.id}">
                <span class="artist-feed-track-index">${track.title}</span>
                <span class="artist-feed-track-meta">${track.genre}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    const featuredSongs = this.getFeaturedSongsForHome();

    this.mainContent.innerHTML = `
      <div class="view-container home-view fade-in">
        <div class="home-greeting-section">
          <h1 class="text-3xl font-bold mb-5 greeting-title">${greeting}</h1>
          <div class="quick-grid">
            <div class="quick-card" data-action="open-liked">
              <div class="quick-card-thumb liked-thumb">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="m12 21.35-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              </div>
              <span class="quick-card-title">Liked Songs</span>
              <button class="quick-play-btn" data-action="play-liked" title="Play Liked Songs">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>

            ${playlists.map(pl => `
              <div class="quick-card" data-action="open-playlist" data-id="${pl.id}">
                <img src="${pl.cover}" class="quick-card-thumb" alt="${pl.title}" />
                <span class="quick-card-title">${pl.title}</span>
                <button class="quick-play-btn" data-action="play-playlist" data-id="${pl.id}" title="Play ${pl.title}">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
              </div>
            `).join('')}
          </div>
        </div>

        <section class="shelf-section">
          <div class="shelf-header">
            <h2 class="shelf-title">Featured Songs</h2>
          </div>
          <div class="shelf-cards-row">
            ${featuredSongs.map(track => this.renderTrackCard(track)).join('')}
          </div>
        </section>

        <section class="shelf-section">
          <div class="shelf-header">
            <h2 class="shelf-title">Popular Artists</h2>
            <span class="shelf-subtitle">Fresh picks from the artists you love</span>
          </div>
          <div class="artist-feed-grid">
            ${artistFeed}
          </div>
        </section>

        <section class="shelf-section">
          <div class="shelf-header">
            <h2 class="shelf-title">Today's Biggest Hits</h2>
            <span class="shelf-subtitle">Trending tracks on ZR & YouTube</span>
          </div>
          <div class="shelf-cards-row">
            ${tracks.slice(0, 6).map(track => this.renderTrackCard(track)).join('')}
          </div>
        </section>
      </div>
    `;
  }

  // 2. SEARCH & BROWSE VIEW (Instant Local + Global Search)
  renderSearch(query = '') {
    console.debug('[ui] renderSearch called with query=', query);
    this.setDynamicHeaderColor('#242424');
    const tracks = storage.getAllTracks();
    const artists = storage.getArtists();
    const playlists = storage.getPlaylists();

    if (!query || query.trim() === '') {
      // Browse All Categories
      this.mainContent.innerHTML = `
        <div class="view-container search-browse-view fade-in">
          <h2 class="text-2xl font-bold mb-6">Browse all</h2>
          <div class="category-grid">
            ${CATEGORIES.map(cat => `
              <div class="category-card" style="background-color: ${cat.color}" data-action="filter-category" data-title="${cat.title}">
                <h3 class="category-card-title">${cat.title}</h3>
                <span class="category-card-icon">${cat.icon}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      return;
    }

    const q = query.toLowerCase().trim();

    // 1. Match local tracks
    const matchingTracks = tracks.filter(t => 
      t.title.toLowerCase().includes(q) || 
      t.artist.toLowerCase().includes(q) || 
      t.album.toLowerCase().includes(q) ||
      t.genre.toLowerCase().includes(q)
    );
    console.debug('[ui] local matchingTracks count=', matchingTracks.length);

    const matchingArtists = artists.filter(a => a.name.toLowerCase().includes(q));
    const matchingPlaylists = playlists.filter(p => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));

    // Render local results immediately
    this.renderSearchResultsHTML(q, matchingTracks, matchingArtists, matchingPlaylists, true);

    // 2. Concurrently Trigger Live Global Online Search (iTunes / Apple Music Free API)
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      console.debug('[ui] scheduling fetchOnlineMusicSearch for', q);
      this.fetchOnlineMusicSearch(q);
    }, 300);
  }

  async fetchOnlineMusicSearch(query) {
    if (!query || query.trim().length < 2) return;

    try {
      const apiUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=25`;
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data && data.results && data.results.length > 0) {
        const onlineTracks = data.results.map((item, idx) => {
          const trackId = `itunes-${item.trackId}`;
          const artworkHq = item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600';
          
          const trackObj = {
            id: trackId,
            title: item.trackName || "Unknown Song",
            artist: item.artistName || "Unknown Artist",
            album: item.collectionName || "Single",
            duration: Math.floor((item.trackTimeMillis || 180000) / 1000),
            cover: artworkHq,
            color: "#1DB954",
            genre: item.primaryGenreName || "Music",
            audioSrc: item.previewUrl,
            plays: "Live Stream"
          };

          // Register in storage so click-to-play / like works seamlessly
          storage.addLocalTrack(trackObj);
          return trackObj;
        });

        // Merge with existing local tracks
        const localTracks = storage.getAllTracks();
        const combined = [...localTracks.filter(t => t.title.toLowerCase().includes(query) || t.artist.toLowerCase().includes(query)), ...onlineTracks];
        const uniqueTracks = Array.from(new Map(combined.map(t => [t.id, t])).values());

        const artists = storage.getArtists().filter(a => a.name.toLowerCase().includes(query));
        const playlists = storage.getPlaylists().filter(p => p.title.toLowerCase().includes(query));

        if (this.currentView === 'search' && this.searchQuery.toLowerCase().trim() === query) {
          this.renderSearchResultsHTML(query, uniqueTracks, artists, playlists, false);
        }
      }
    } catch (err) {
      console.log("Online search fetch fallback:", err);
    }
  }

  renderSearchResultsHTML(query, matchingTracks, matchingArtists, matchingPlaylists, isLoading = false) {
    const topResult = matchingTracks[0] || (matchingArtists[0] ? { type: 'artist', ...matchingArtists[0] } : null);

    this.mainContent.innerHTML = `
      <div class="view-container search-results-view fade-in">
        ${matchingTracks.length === 0 && matchingArtists.length === 0 && matchingPlaylists.length === 0 ? `
          <div class="empty-search-state">
            <h2 class="text-2xl font-bold mb-2">Searching for "${query}"...</h2>
            <p class="text-subdued">Fetching songs from global catalog...</p>
          </div>
        ` : `
          <!-- Top Result & Songs Row -->
          <div class="search-top-row">
            ${topResult ? `
              <div class="top-result-box">
                <h2 class="text-xl font-bold mb-4">Top result</h2>
                <div class="top-result-card" data-action="${topResult.type === 'artist' ? 'open-artist' : 'play-track'}" data-id="${topResult.id}">
                  <img src="${topResult.cover || topResult.avatar}" class="top-result-thumb ${topResult.type === 'artist' ? 'rounded-full' : ''}" alt="${topResult.title || topResult.name}" />
                  <h3 class="top-result-title truncate">${topResult.title || topResult.name}</h3>
                  <div class="top-result-sub">
                    <span class="badge-pill">${topResult.type === 'artist' ? 'Artist' : 'Song'}</span>
                    <span class="truncate">${topResult.artist || 'Verified Artist'}</span>
                  </div>
                  <button class="top-result-play-btn" data-action="${topResult.type === 'artist' ? 'open-artist' : 'play-track'}" data-id="${topResult.id}">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                </div>
              </div>
            ` : ''}

            <div class="search-songs-box">
              <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold">Songs</h2>
                ${isLoading ? '<span class="text-xs text-subdued">Searching live...</span>' : ''}
              </div>
              <div class="search-song-list">
                ${matchingTracks.slice(0, 5).map((track, idx) => this.renderCompactTrackRow(track, idx)).join('')}
              </div>
            </div>
          </div>

          <!-- All Matching Songs Grid / Table -->
          ${matchingTracks.length > 5 ? `
            <section class="shelf-section mt-8">
              <div class="shelf-header"><h2 class="shelf-title">More Songs</h2></div>
              <div class="tracks-table-container">
                <table class="tracks-table">
                  <tbody>
                    ${matchingTracks.slice(5, 20).map((t, idx) => this.renderTrackTableRow(t, idx + 6)).join('')}
                  </tbody>
                </table>
              </div>
            </section>
          ` : ''}

          <!-- Matching Artists -->
          ${matchingArtists.length > 0 ? `
            <section class="shelf-section mt-8">
              <div class="shelf-header"><h2 class="shelf-title">Artists</h2></div>
              <div class="shelf-cards-row">
                ${matchingArtists.map(art => this.renderArtistCard(art)).join('')}
              </div>
            </section>
          ` : ''}

          <!-- Matching Playlists -->
          ${matchingPlaylists.length > 0 ? `
            <section class="shelf-section mt-8">
              <div class="shelf-header"><h2 class="shelf-title">Playlists</h2></div>
              <div class="shelf-cards-row">
                ${matchingPlaylists.map(pl => this.renderPlaylistCard(pl)).join('')}
              </div>
            </section>
          ` : ''}
        `}
      </div>
    `;
  }

  renderPlaylists() {
    const playlists = storage.getPlaylists();
    const likedSongs = storage.getPlaylistById('liked-songs');
    const allCollections = [likedSongs, ...playlists];

    this.setDynamicHeaderColor('#1e3264');
    this.mainContent.innerHTML = `
      <div class="view-container playlist-directory fade-in">
        <div class="playlist-directory-header">
          <div>
            <p class="playlist-badge">Your library</p>
            <h1 class="playlist-directory-title">Playlists</h1>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <button class="btn-icon-action" data-action="refresh-playlists" title="Refresh playlists">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10.5h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.67 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>
            <button class="btn-hero-play" data-action="open-create-playlist" title="Create playlist">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
          </div>
        </div>

        <div class="playlist-directory-grid">
          ${allCollections.map(pl => this.renderPlaylistCard(pl)).join('')}
        </div>
      </div>
    `;
  }

  // 3. PLAYLIST / ALBUM / LIKED SONGS VIEW
  renderPlaylist(playlistId) {
    const isLikedSongs = playlistId === 'liked-songs';
    const playlist = storage.getPlaylistById(playlistId);

    if (!playlist) {
      this.mainContent.innerHTML = `<div class="p-8"><h2>Playlist not found</h2></div>`;
      return;
    }

    this.setDynamicHeaderColor(playlist.color || '#1e3264');

    const tracks = playlist.trackIds.map(id => storage.getTrackById(id)).filter(Boolean);
    const totalDurationSec = tracks.reduce((acc, t) => acc + (t.duration || 180), 0);
    const totalDurationText = this.formatDurationSummary(totalDurationSec);

    this.mainContent.innerHTML = `
      <div class="view-container playlist-view fade-in">
        <!-- Hero Header -->
        <div class="playlist-hero">
          <div class="playlist-cover-wrapper">
            <img src="${playlist.cover}" class="playlist-hero-cover ${isLikedSongs ? 'liked-hero-thumb' : ''}" alt="${playlist.title}" />
          </div>
          <div class="playlist-hero-meta">
            <span class="playlist-badge">${isLikedSongs ? 'Playlist' : 'Public Playlist'}</span>
            <h1 class="playlist-hero-title">${playlist.title}</h1>
            <p class="playlist-hero-desc">${playlist.description || ''}</p>
            <div class="playlist-hero-info">
              <span class="font-bold text-white">${playlist.curator}</span>
              <span class="info-dot">•</span>
              <span>${tracks.length} song${tracks.length === 1 ? '' : 's'}</span>
              <span class="info-dot">•</span>
              <span class="text-subdued">${totalDurationText}</span>
            </div>
          </div>
        </div>

        <!-- Action Bar -->
        <div class="playlist-action-bar">
          <button class="btn-hero-play" data-action="play-playlist-all" data-id="${playlist.id}" title="Play">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          
          ${!isLikedSongs && playlist.curator === 'You' ? `
            <button class="btn-icon-action" data-action="delete-playlist" data-id="${playlist.id}" title="Delete playlist">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          ` : ''}

          <button class="btn-icon-action" data-action="open-file-import" title="Add song from YouTube or File">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          </button>
        </div>

        <!-- Tracks Table -->
        ${tracks.length === 0 ? `
          <div class="empty-playlist-state">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="#b3b3b3"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
            <h3>This playlist is empty</h3>
            <p>Search any song or add tracks from YouTube.</p>
          </div>
        ` : `
          <div class="tracks-table-container">
            <table class="tracks-table">
              <thead>
                <tr>
                  <th class="col-num">#</th>
                  <th class="col-title">Title</th>
                  <th class="col-album">Album</th>
                  <th class="col-date">Date added</th>
                  <th class="col-duration">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                  </th>
                </tr>
              </thead>
              <tbody>
                ${tracks.map((track, idx) => this.renderTrackTableRow(track, idx + 1, playlist.id)).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  // 4. ARTIST PROFILE VIEW
  renderArtist(artistId) {
    const artist = storage.getArtistById(artistId);
    if (!artist) {
      this.mainContent.innerHTML = `<div class="p-8"><h2>Artist not found</h2></div>`;
      return;
    }

    this.setDynamicHeaderColor(artist.color || '#444444');
    const artistTracks = storage.getTracksByArtist(artist.name);

    this.mainContent.innerHTML = `
      <div class="view-container artist-view fade-in">
        <!-- Artist Banner Header -->
        <div class="artist-banner" style="height:180px;padding:20px;background-size:cover;background-position:center;background-image: url('${artist.banner}')">
          <div class="artist-banner-overlay">
            ${artist.verified ? `
              <div class="verified-badge-pill">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="#3d91f4"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7-3.8-3.8 1.4-1.4 2.4 2.4 6.4-6.4 1.4 1.4-7.8 7.8z"/></svg>
                <span>Verified Artist</span>
              </div>
            ` : ''}
            <h1 class="artist-name-title">${artist.name}</h1>
            <p class="artist-monthly-listeners">${artist.monthlyListeners} monthly listeners</p>
          </div>
        </div>

        <!-- Action Bar -->
        <div class="playlist-action-bar">
          <button class="btn-hero-play" data-action="play-artist-all" data-id="${artist.name}" title="Play">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="btn-follow-pill" data-action="toggle-follow-artist">FOLLOW</button>
        </div>

        <!-- Popular Songs Table -->
        <section class="artist-section">
          <h2 class="text-2xl font-bold mb-4">Popular</h2>
          <div class="tracks-table-container">
            <table class="tracks-table">
              <tbody>
                ${artistTracks.map((track, idx) => this.renderTrackTableRow(track, idx + 1, null, true)).join('')}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
  }

  // 6. ARTISTS DIRECTORY VIEW
  renderArtists() {
    const artists = storage.getArtists();
    this.setDynamicHeaderColor('#333333');

    this.mainContent.innerHTML = `
      <div class="view-container artists-directory fade-in">
        <div class="playlist-directory-header">
          <div>
            <p class="playlist-badge">Browse</p>
            <h1 class="playlist-directory-title">Artists</h1>
          </div>
        </div>
        <div class="artist-grid">
          ${artists.map(a => `
            <div class="artist-card shelf-card" data-action="open-artist" data-id="${a.id}">
              <div class="shelf-card-thumb-wrap">
                <img src="${a.avatar}" class="shelf-card-thumb rounded-full" alt="${a.name}" />
                <button class="shelf-play-btn" data-action="play-artist-all" data-id="${a.name}" title="Play ${a.name}">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
              </div>
              <h4 class="shelf-card-title truncate">${a.name}</h4>
              <p class="shelf-card-subtitle">${a.monthlyListeners} listeners</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 5. LYRICS VIEW
  renderLyrics() {
    const track = player.currentTrack;
    if (!track) {
      this.mainContent.innerHTML = `
        <div class="view-container lyrics-view fade-in flex items-center justify-center p-12 text-center">
          <div>
            <h2 class="text-3xl font-bold mb-3">No song playing</h2>
            <p class="text-subdued">Play a track to view synchronized lyrics.</p>
          </div>
        </div>
      `;
      return;
    }

    this.setDynamicHeaderColor(track.color || '#242424');
    const lyrics = track.lyrics || [
      { time: 0, text: `♪ Listening to ${track.title} ♪` },
      { time: 10, text: `Artist: ${track.artist}` },
      { time: 20, text: `♪ Enjoy the music on ZR Web Desktop ♪` }
    ];

    this.mainContent.innerHTML = `
      <div class="view-container lyrics-view fade-in" style="--track-glow-color: ${track.color || '#1DB954'}">
        <div class="lyrics-header">
          <img src="${track.cover}" class="lyrics-header-thumb" alt="${track.title}" />
          <div>
            <h2 class="lyrics-track-title">${track.title}</h2>
            <p class="lyrics-track-artist">${track.artist}</p>
          </div>
        </div>
        <div class="lyrics-content-container" id="lyrics-lines-wrapper">
          ${lyrics.map((line, idx) => `
            <div class="lyrics-line" id="lyric-line-${idx}" data-time="${line.time}" data-action="seek-to-lyric" data-time-val="${line.time}">
              ${line.text}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  highlightLyricsLine(activeIndex) {
    const lines = document.querySelectorAll('.lyrics-line');
    lines.forEach((line, idx) => {
      line.classList.toggle('active', idx === activeIndex);
      line.classList.toggle('past', idx < activeIndex);
    });

    const activeEl = document.getElementById(`lyric-line-${activeIndex}`);
    if (activeEl && this.currentView === 'lyrics') {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // --- Right Sidebar ---
  renderRightSidebar() {
    if (!this.rightSidebar || !this.rightSidebarContent) return;

    if (this.rightSidebarMode === 'now-playing') {
      const track = player.currentTrack;
      if (!track) {
        this.rightSidebarContent.innerHTML = `
          <div class="p-4 text-center text-subdued"><p>No track currently playing.</p></div>
        `;
        return;
      }

      this.rightSidebarContent.innerHTML = `
        <div class="now-playing-panel fade-in">
          <div class="now-playing-header">
            <h3 class="font-bold text-white truncate">${track.album || 'Now Playing'}</h3>
          </div>
          <div class="now-playing-cover-box">
            <img src="${track.cover}" class="now-playing-cover" alt="${track.title}" />
          </div>
          <div class="now-playing-info">
            <div class="now-playing-titles">
              <h2 class="now-playing-song font-bold text-xl truncate">${track.title}</h2>
              <p class="now-playing-artist text-subdued cursor-pointer truncate" data-action="open-artist" data-id="${track.artistId || track.artist}">${track.artist}</p>
            </div>
            <button class="btn-like-icon ${storage.isLiked(track.id) ? 'liked' : ''}" data-action="toggle-like" data-id="${track.id}">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="m12 21.35-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </button>
          </div>
        </div>
      `;
    } else {
      this.rightSidebarContent.innerHTML = `
        <div class="queue-panel fade-in">
          <div class="queue-panel-header">
            <h2 class="text-lg font-bold">Play Queue</h2>
          </div>
          <div class="queue-section">
            <h3 class="queue-section-title">Now playing</h3>
            ${player.currentTrack ? this.renderCompactTrackRow(player.currentTrack, 0, true) : '<p class="text-subdued text-sm">Nothing playing</p>'}
          </div>
          <div class="queue-section mt-5">
            <h3 class="queue-section-title">Next up</h3>
            ${player.queue.slice(player.queueIndex + 1).length === 0 ? `
              <p class="text-subdued text-sm">Queue is empty.</p>
            ` : `
              <div class="queue-track-list">
                ${player.queue.slice(player.queueIndex + 1).map((t, idx) => this.renderCompactTrackRow(t, player.queueIndex + 1 + idx)).join('')}
              </div>
            `}
          </div>
        </div>
      `;
    }
  }

  toggleRightSidebar(mode = null) {
    if (mode && this.rightSidebarMode !== mode) {
      this.rightSidebarMode = mode;
      this.rightSidebar.classList.remove('hidden');
      this.renderRightSidebar();
      this.btnQueue.classList.toggle('active', mode === 'queue');
      return;
    }
    
    this.rightSidebar.classList.toggle('hidden');
    const isHidden = this.rightSidebar.classList.contains('hidden');
    this.btnQueue.classList.toggle('active', !isHidden && this.rightSidebarMode === 'queue');
    if (!isHidden) {
      if (mode) this.rightSidebarMode = mode;
      this.renderRightSidebar();
    }
  }

  // --- Sub-Components ---
  renderTrackCard(track) {
    const isPlayingThis = player.currentTrack && player.currentTrack.id === track.id && player.isPlaying;
    return `
      <div class="shelf-card" data-action="play-track" data-id="${track.id}" data-context="track" data-track-id="${track.id}">
        <div class="shelf-card-thumb-wrap">
          <img src="${track.cover}" class="shelf-card-thumb" alt="${track.title}" loading="lazy" />
          <button class="shelf-play-btn ${isPlayingThis ? 'playing' : ''}" data-action="play-track" data-id="${track.id}">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              ${isPlayingThis ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>' : '<path d="M8 5v14l11-7z"/>'}
            </svg>
          </button>
        </div>
        <h4 class="shelf-card-title truncate" title="${track.title}">${track.title}</h4>
        <p class="shelf-card-subtitle truncate">${track.artist}</p>
      </div>
    `;
  }

  renderPlaylistCard(playlist) {
    return `
      <div class="shelf-card" data-action="open-playlist" data-id="${playlist.id}">
        <div class="shelf-card-thumb-wrap">
          <img src="${playlist.cover}" class="shelf-card-thumb" alt="${playlist.title}" loading="lazy" />
          <button class="shelf-play-btn" data-action="play-playlist" data-id="${playlist.id}" title="Play ${playlist.title}">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        <h4 class="shelf-card-title truncate" title="${playlist.title}">${playlist.title}</h4>
        <p class="shelf-card-subtitle truncate">${playlist.description || `By ${playlist.curator}`}</p>
      </div>
    `;
  }

  renderArtistCard(artist) {
    return `
      <div class="shelf-card artist-card" data-action="open-artist" data-id="${artist.id}">
        <div class="shelf-card-thumb-wrap">
          <img src="${artist.avatar}" class="shelf-card-thumb rounded-full" alt="${artist.name}" loading="lazy" />
          <button class="shelf-play-btn" data-action="play-artist-all" data-id="${artist.name}" title="Play ${artist.name}">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        <h4 class="shelf-card-title truncate text-center">${artist.name}</h4>
        <p class="shelf-card-subtitle text-center">Artist</p>
      </div>
    `;
  }

  renderTrackTableRow(track, indexNumber, playlistId = null, isArtistView = false) {
    const isCurrentTrack = player.currentTrack && player.currentTrack.id === track.id;
    const isLiked = storage.isLiked(track.id);
    const playsFormatted = track.plays || "1,245,119";

    return `
      <tr class="track-row ${isCurrentTrack ? 'active-playing-row' : ''}" 
          data-track-id="${track.id}" 
          data-action="play-track-in-context" 
          data-playlist-id="${playlistId || ''}"
          oncontextmenu="window.ZRApp.openContextMenu(event, '${track.id}', '${playlistId || ''}')">
        
        <td class="col-num text-center">
          <span class="row-index-num ${isCurrentTrack ? 'text-ZR-green font-bold' : ''}">
            ${isCurrentTrack && player.isPlaying ? `
              <div class="equalizer-bars"><span></span><span></span><span></span></div>
            ` : indexNumber}
          </span>
          <button class="row-play-btn" data-action="play-track" data-id="${track.id}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              ${isCurrentTrack && player.isPlaying ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>' : '<path d="M8 5v14l11-7z"/>'}
            </svg>
          </button>
        </td>

        <td class="col-title">
          <div class="track-title-cell">
            <img src="${track.cover}" class="track-cell-thumb" alt="${track.title}" />
            <div class="track-cell-meta">
              <span class="track-cell-name truncate ${isCurrentTrack ? 'text-ZR-green font-semibold' : ''}">${track.title}</span>
              <span class="track-cell-artist truncate cursor-pointer hover:underline" data-action="open-artist" data-id="${track.artistId || track.artist}">${track.artist}</span>
            </div>
          </div>
        </td>

        <td class="col-album truncate">
          ${isArtistView ? `<span class="text-subdued text-sm">${playsFormatted}</span>` : `<span class="text-subdued hover:text-white cursor-pointer">${track.album}</span>`}
        </td>

        <td class="col-date text-subdued text-sm">
          ${isArtistView ? '' : 'Recently'}
        </td>

        <td class="col-duration">
          <div class="col-duration-wrap">
            <button class="btn-like-icon ${isLiked ? 'liked' : ''}" data-action="toggle-like" data-id="${track.id}" title="${isLiked ? 'Remove from Liked' : 'Save to Liked'}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="m12 21.35-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </button>
            <span class="duration-text">${this.formatTime(track.duration || 180)}</span>
            <button class="btn-more-options" data-action="open-track-menu" data-id="${track.id}" data-playlist-id="${playlistId || ''}">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  renderCompactTrackRow(track, index = 0, isPlayingNow = false) {
    const isCurrent = player.currentTrack && player.currentTrack.id === track.id;
    const isLiked = storage.isLiked(track.id);

    return `
      <div class="compact-track-row ${isCurrent ? 'active' : ''}" 
           data-track-id="${track.id}" 
           data-action="play-track" 
           data-id="${track.id}"
           oncontextmenu="window.ZRApp.openContextMenu(event, '${track.id}')">
        <img src="${track.cover}" class="compact-thumb" alt="${track.title}" />
        <div class="compact-meta">
          <span class="compact-title truncate ${isCurrent ? 'text-ZR-green' : ''}">${track.title}</span>
          <span class="compact-artist truncate">${track.artist}</span>
        </div>
        <button class="btn-like-icon ${isLiked ? 'liked' : ''} ml-auto mr-2" data-action="toggle-like" data-id="${track.id}" title="${isLiked ? 'Remove from Liked' : 'Save to Liked'}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="m12 21.35-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
        <span class="text-xs text-subdued mr-2">${this.formatTime(track.duration || 180)}</span>
        <button class="btn-more-options" data-action="open-track-menu" data-id="${track.id}" title="More options for ${track.title}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
        </button>
      </div>
    `;
  }

  renderSidebarPlaylists() {
    if (!this.sidebarPlaylistsList) return;
    const playlists = storage.getPlaylists();
    const likedCount = storage.getLikedTrackIds().length;

    this.sidebarPlaylistsList.innerHTML = `
      <div class="sidebar-item ${this.currentView === 'liked-songs' ? 'active' : ''}" data-action="open-liked">
        <div class="sidebar-thumb liked-thumb">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="white"><path d="m12 21.35-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </div>
        <div class="sidebar-item-meta">
          <span class="sidebar-item-title font-semibold">Liked Songs</span>
          <span class="sidebar-item-sub">📌 Playlist • ${likedCount} songs</span>
        </div>
      </div>

      ${playlists.map(pl => `
        <div class="sidebar-item ${this.currentView === 'playlist' && this.currentParam === pl.id ? 'active' : ''}" data-action="open-playlist" data-id="${pl.id}">
          <img src="${pl.cover}" class="sidebar-thumb" alt="${pl.title}" />
          <div class="sidebar-item-meta">
            <span class="sidebar-item-title">${pl.title}</span>
            <span class="sidebar-item-sub">Playlist • ${pl.curator}</span>
          </div>
        </div>
      `).join('')}
    `;
  }

  updatePlayerBarTrack(track) {
    if (!track) {
      this.playerCover.src = 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600&auto=format&fit=crop&q=80';
      this.playerTitle.textContent = 'Nothing playing';
      this.playerArtist.textContent = 'Play a song to begin';
      this.playerArtist.removeAttribute('data-id');
      this.playerLikeBtn.classList.remove('liked');
      this.playerLikeBtn.setAttribute('data-id', '');
      document.title = 'ZR Web Desktop';
      return;
    }
    this.playerCover.src = track.cover;
    this.playerTitle.textContent = track.title;
    this.playerArtist.textContent = track.artist;
    this.playerArtist.setAttribute('data-id', track.artistId || track.artist);

    const isLiked = storage.isLiked(track.id);
    this.playerLikeBtn.classList.toggle('liked', isLiked);
    this.playerLikeBtn.setAttribute('data-id', track.id);

    document.title = `${track.title} • ${track.artist} - ZR Web Desktop`;
  }

  updatePlayPauseIcon(isPlaying) {
    if (!this.playPauseBtn) return;
    this.playPauseBtn.innerHTML = isPlaying ? `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
    ` : `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    `;
    this.playPauseBtn.setAttribute('title', isPlaying ? 'Pause' : 'Play');
  }

  updatePlayingAnimation(isPlaying) {
    const bars = document.querySelectorAll('.equalizer-bars');
    bars.forEach(bar => {
      bar.style.opacity = isPlaying ? '1' : '0.5';
    });
  }

  updateActiveTrackInLists(trackId) {
    document.querySelectorAll('.track-row').forEach(row => {
      const isMatch = row.getAttribute('data-track-id') === trackId;
      row.classList.toggle('active-playing-row', isMatch);
    });
  }

  updateVolumeBar(level) {
    if (this.volumeFill) {
      this.volumeFill.style.width = `${level * 100}%`;
    }
    if (this.btnMute) {
      if (level === 0) {
        this.btnMute.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
      } else {
        this.btnMute.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
      }
    }
  }

  // --- Modals & Context Menus ---
  openCreatePlaylistModal() {
    const modal = document.getElementById('create-playlist-modal');
    if (modal) modal.classList.remove('hidden');
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
  }

  openVisualizerModal() {
    const modal = document.getElementById('visualizer-modal');
    if (modal) {
      modal.classList.remove('hidden');
      this.isVisualizerOpen = true;
    }
  }

  openFileImportModal() {
    const modal = document.getElementById('file-import-modal');
    if (modal) modal.classList.remove('hidden');
  }

  showToast(message, duration = 3500, type = 'info') {
    if (!this.toastContainer) return;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    const titles = {
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
      info: null
    };

    const toast = document.createElement('div');
    toast.className = `ZR-toast toast-${type} fade-in`;
    toast.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-text">
        ${titles[type] ? `<strong>${titles[type]}</strong>` : ''}
        <span>${message}</span>
      </div>
      <button class="toast-close" aria-label="Close">✕</button>
    `;
    this.toastContainer.appendChild(toast);

    const dismiss = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px) scale(0.95)';
      setTimeout(() => toast.remove(), 350);
    };

    toast.querySelector('.toast-close').addEventListener('click', dismiss);
    setTimeout(dismiss, duration);
  }

  showAppUpdateModal() {
    const modal = document.getElementById('app-update-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const updateBtn = document.getElementById('btn-apply-update');
    if (updateBtn) {
      updateBtn.onclick = () => {
        window.location.reload();
      };
    }
  }

  setupVisualizerLoop() {
    const canvas = document.getElementById('visualizer-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const render = () => {
      requestAnimationFrame(render);
      if (!this.isVisualizerOpen) return;

      const width = canvas.width = canvas.parentElement.clientWidth;
      const height = canvas.height = canvas.parentElement.clientHeight;

      const freqData = player.getFrequencyData();
      ctx.clearRect(0, 0, width, height);

      const barWidth = (width / freqData.length) * 2;
      let x = 0;

      for (let i = 0; i < freqData.length; i++) {
        const barHeight = (freqData[i] / 255) * height * 0.85;
        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, '#1DB954');
        gradient.addColorStop(1, '#1ed760');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
      }
    };

    render();
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds === null) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  formatDurationSummary(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours} hr ${mins} min`;
    return `${mins} min`;
  }

  getTimeGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }
}

export const ui = new UIManager();

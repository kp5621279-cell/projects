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
    if (this.btnDiscoverBack) this.btnDiscoverBack.addEventListener('click', () => this.goBack());
    this.detectAndApplyDevice();
    this.setupDeviceAutoRefresh();
    this.setupDeviceDropdown();
    this.setupMobileTabs();
    this.setupMobileSearchToggle();
    this.setupDevHelper();
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
    this.btnDiscoverBack = document.getElementById('btn-discover-back');
    this.deviceIndicatorSearch = document.getElementById('device-indicator-search');
    this.deviceIndicatorAccount = document.getElementById('device-indicator-account');
    this.deviceDropdown = document.getElementById('device-dropdown');
    this.featuredCarousel = null;
    this.mobileSearchButton = null;
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
      case 'categories':
        this.renderCategories();
        break;
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

  detectAndApplyDevice() {
    try {
      const ua = navigator.userAgent || '';
      // check saved preference
      const saved = (typeof localStorage !== 'undefined') ? localStorage.getItem('ZR_device_mode') : null;
      // additional heuristics: viewport width, pointer coarse
      const widthMobile = window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
      const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      let isMobile = /Mobi|Android|iPhone|iPad|Mobile/i.test(ua) || (navigator.userAgentData && navigator.userAgentData.mobile) || widthMobile || coarsePointer;
      if (saved === 'mobile') isMobile = true;
      if (saved === 'desktop') isMobile = false;
      // expose a class when the user forced desktop via localStorage
      try {
        if (saved === 'desktop') document.documentElement.classList.add('force-desktop-ui');
        else document.documentElement.classList.remove('force-desktop-ui');
      } catch (e) {}
      document.documentElement.classList.toggle('mobile', !!isMobile);
      document.documentElement.classList.toggle('desktop', !isMobile);

      const iconPhone = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm5 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>';
      const iconPc = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 5h18v11H3z"/><path d="M8 20h8v2H8z"/></svg>';

      // Show indicator only in account area to avoid duplicate indicators
      if (this.deviceIndicatorSearch) this.deviceIndicatorSearch.style.display = 'none';
      if (this.deviceIndicatorAccount) {
        this.deviceIndicatorAccount.innerHTML = isMobile ? iconPhone : iconPc;
        this.deviceIndicatorAccount.setAttribute('title', isMobile ? 'Device: Mobile' : 'Device: Desktop');
        this.deviceIndicatorAccount.dataset.mode = isMobile ? 'mobile' : 'desktop';
      }

      // store a friendly device label for later use (toast/message)
      if (/Android/i.test(ua) || /Mobi|Mobile/i.test(ua)) this.deviceLabel = 'Android';
      else if (/iPhone|iPad|iPod/i.test(ua)) this.deviceLabel = 'iOS';
      else if (/Win/i.test(navigator.platform || ua)) this.deviceLabel = 'Windows';
      else if (/Mac/i.test(navigator.platform || ua)) this.deviceLabel = 'macOS';
      else this.deviceLabel = isMobile ? 'Mobile' : 'Desktop';

      if (isMobile) document.documentElement.classList.add('mobile-layout'); else document.documentElement.classList.remove('mobile-layout');
    } catch (err) {
      console.warn('Device detect failed', err);
    }
  }

  setupDeviceAutoRefresh() {
    const deb = (fn, t=250) => { let to=null; return () => { clearTimeout(to); to = setTimeout(fn, t); }; };
    const refresh = deb(() => { try { this.detectAndApplyDevice(); } catch(e){} }, 200);
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
  }

  setupDeviceDropdown() {
    if (!this.deviceIndicatorAccount) return;
    const toggleDropdown = (e) => {
      e && e.stopPropagation();
      if (!this.deviceDropdown) return;
      const isHidden = this.deviceDropdown.classList.contains('hidden');
      if (isHidden) {
        // open: ensure dropdown is attached to body and positioned
        document.body.appendChild(this.deviceDropdown);
        this.deviceDropdown.classList.remove('hidden');
        this.deviceDropdown.setAttribute('aria-hidden', 'false');
        this.deviceIndicatorAccount.setAttribute('aria-expanded', 'true');
        // position
        const rect = this.deviceIndicatorAccount.getBoundingClientRect();
        // allow rendering to compute size
        this.deviceDropdown.style.position = 'fixed';
        this.deviceDropdown.style.left = '0px';
        this.deviceDropdown.style.top = '-9999px';
        // small delay to ensure offsetWidth/Height available
        requestAnimationFrame(() => {
          const ddw = this.deviceDropdown.offsetWidth || 160;
          const ddh = this.deviceDropdown.offsetHeight || 120;
          let left = rect.left + rect.width - ddw;
          if (left < 8) left = 8;
          if (left + ddw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - ddw - 8);
          let top = rect.bottom + 8;
          if (top + ddh > window.innerHeight - 8) top = Math.max(8, rect.top - ddh - 8);
          this.deviceDropdown.style.left = `${left}px`;
          this.deviceDropdown.style.top = `${top}px`;
        });
      } else {
        // close
        this.deviceDropdown.classList.add('hidden');
        this.deviceDropdown.setAttribute('aria-hidden', 'true');
        this.deviceIndicatorAccount.setAttribute('aria-expanded', 'false');
      }
    };

    this.deviceIndicatorAccount.addEventListener('click', toggleDropdown);
    this.deviceIndicatorAccount.addEventListener('touchstart', (e) => { e.preventDefault(); toggleDropdown(e); });

    document.addEventListener('click', () => {
      if (this.deviceDropdown && !this.deviceDropdown.classList.contains('hidden')) {
        this.deviceDropdown.classList.add('hidden');
        this.deviceDropdown.setAttribute('aria-hidden', 'true');
        this.deviceIndicatorAccount.setAttribute('aria-expanded', 'false');
      }
    });

    if (this.deviceDropdown) {
      this.deviceDropdown.querySelectorAll('.device-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const mode = btn.getAttribute('data-mode');
          try { if (typeof localStorage !== 'undefined') localStorage.setItem('ZR_device_mode', mode); } catch (err) {}
          if (mode === 'mobile') {
            document.documentElement.classList.add('mobile-layout');
            this.deviceIndicatorAccount.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm5 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>';
          } else if (mode === 'desktop') {
            document.documentElement.classList.remove('mobile-layout');
            this.deviceIndicatorAccount.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 5h18v11H3z"/><path d="M8 20h8v2H8z"/></svg>';
          } else {
            // auto
            try { if (typeof localStorage !== 'undefined') localStorage.removeItem('ZR_device_mode'); } catch (err) {}
            this.detectAndApplyDevice();
          }
          // hide dropdown
          if (this.deviceDropdown) {
            this.deviceDropdown.classList.add('hidden');
            this.deviceDropdown.setAttribute('aria-hidden', 'true');
            this.deviceIndicatorAccount.setAttribute('aria-expanded', 'false');
          }
        });
      });
    }
  }

  setupMobileTabs() {
    try {
      const place = document.getElementById('btn-discover-back');
      if (!place) return;
      if (document.getElementById('mobile-tabs-btn')) return;

      const btn = document.createElement('button');
      btn.id = 'mobile-tabs-btn';
      btn.className = 'mobile-tabs-btn hidden';
      btn.setAttribute('aria-label', 'Open tabs');
      btn.innerHTML = '<span class="mtb-line"></span><span class="mtb-line"></span><span class="mtb-line"></span>';
      place.parentNode.insertBefore(btn, place.nextSibling);

      const menu = document.createElement('div');
      menu.id = 'mobile-tabs-menu';
      menu.className = 'mobile-tabs-menu hidden';
      const items = [
        { label: 'Discover', view: 'home' },
        { label: 'Playlists', view: 'playlists' },
        { label: 'Categories', view: 'categories' }
      ];
      items.forEach(it => {
        const el = document.createElement('button');
        el.className = 'mobile-tab-item';
        el.textContent = it.label;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.navigateTo(it.view);
          menu.classList.add('hidden');
        });
        menu.appendChild(el);
      });

      place.parentNode.insertBefore(menu, btn.nextSibling);

      const toggle = (e) => {
        e && e.stopPropagation();
        const isHidden = menu.classList.contains('hidden');
        if (isHidden) {
          // position menu near the button using fixed coords to avoid overflow/clipping
          const rect = btn.getBoundingClientRect();
          menu.style.position = 'fixed';
          // default left align to button's left
          let left = rect.left;
          // ensure menu width is available after rendering
          menu.style.left = '-9999px';
          menu.style.top = '-9999px';
          menu.classList.remove('hidden');
          requestAnimationFrame(() => {
            const mw = menu.offsetWidth || 160;
            const mh = menu.offsetHeight || 120;
            if (left + mw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - mw - 8);
            let top = rect.bottom + 6;
            if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 6);
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
          });
        } else {
          menu.classList.add('hidden');
        }
      };
      btn.addEventListener('click', toggle);
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); toggle(e); });

      // show button only in mobile mode
      const observer = new MutationObserver(() => {
        const isMobile = document.documentElement.classList.contains('mobile');
        btn.classList.toggle('hidden', !isMobile);
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

      document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && e.target !== btn) menu.classList.add('hidden');
      });
    } catch (err) { console.warn('mobile tabs init failed', err); }
  }

  setupFeaturedCarousel() {
    const el = document.getElementById('featured-carousel');
    if (!el) return;
    this.featuredCarousel = el;
    const slides = Array.from(el.querySelectorAll('.fc-slide'));
    if (!slides.length) return;
    let idx = slides.findIndex(s => s.classList.contains('active'));
    if (idx < 0) idx = 0;
    let interval = null;
    const show = (i) => {
      slides.forEach(s => s.classList.remove('active'));
      slides[i].classList.add('active');
    };
    const start = () => {
      if (interval) clearInterval(interval);
      interval = setInterval(() => {
        idx = (idx + 1) % slides.length;
        show(idx);
      }, 3500);
      el.dataset.carouselRunning = 'true';
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
      el.dataset.carouselRunning = 'false';
    };
    // Pause on hover/touch
    el.addEventListener('mouseenter', stop);
    el.addEventListener('mouseleave', start);
    el.addEventListener('touchstart', stop);
    el.addEventListener('touchend', start);
    // start
    start();
  }

  setupMobileSearchToggle() {
    // show icon-only search on mobile and toggle full input on tap
    try {
      const container = this.searchContainer;
      if (!container) return;
      if (container.querySelector('#mobile-search-btn')) return;
      const btn = document.createElement('button');
      btn.id = 'mobile-search-btn';
      btn.className = 'mobile-search-btn';
      btn.setAttribute('aria-label', 'Open search');
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10.533 1.27893C5.42321 1.27893 1.27893 5.42321 1.27893 10.533C1.27893 15.6428 5.42321 19.7871 10.533 19.7871C12.8134 19.7871 14.8993 18.9619 16.5126 17.5855L21.4636 22.5365C21.7565 22.8294 22.2314 22.8294 22.5243 22.5365C22.8172 22.2436 22.8172 21.7687 22.5243 21.4758L17.5855 16.5126C18.9619 14.8993 19.7871 12.8134 19.7871 10.533C19.7871 5.42321 15.6428 1.27893 10.533 1.27893ZM2.77893 10.533C2.77893 6.25055 6.25055 2.77893 10.533 2.77893C14.8155 2.77893 18.2871 6.25055 18.2871 10.533C18.2871 14.8155 14.8155 18.2871 10.533 18.2871C6.25055 18.2871 2.77893 14.8155 2.77893 10.533Z"/></svg>';
      container.insertBefore(btn, container.firstChild);
      const toggle = (e) => {
        try { e && e.stopPropagation(); e && e.preventDefault(); } catch(err){}
        container.classList.toggle('search-open');
        const input = this.searchInput;
        if (container.classList.contains('search-open')) {
          setTimeout(() => { try { input && input.focus(); } catch(e){} }, 60);
        } else {
          try { input && input.blur(); } catch(e){}
        }
      };
      btn.addEventListener('click', toggle);
      btn.addEventListener('touchstart', toggle);
      // close when tapping outside
      document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) container.classList.remove('search-open');
      });
    } catch (err) { console.warn('mobile search toggle failed', err); }
  }

  setupDevHelper() {
    try {
      // Only show dev helper when explicitly requested via ?dev=1
      if (!/([?&])dev=1(\b|$)/.test(location.search)) return;
      // remove existing if any
      const existing = document.getElementById('dev-device-helper');
      if (existing) existing.remove();

      const self = this;

      const btn = document.createElement('button');
      btn.id = 'dev-device-helper';
      btn.title = 'Dev: Device helper (show detection + quick actions)';
      btn.textContent = 'Dev:Device';
      Object.assign(btn.style, {
        position: 'fixed',
        right: '12px',
        bottom: '84px',
        zIndex: 99999,
        padding: '6px 10px',
        fontSize: '12px',
        background: '#222',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '6px',
        cursor: 'pointer',
        boxShadow: '0 6px 18px rgba(0,0,0,0.4)'
      });

      const panel = document.createElement('div');
      panel.id = 'dev-device-panel';
      Object.assign(panel.style, {
        position: 'fixed',
        right: '12px',
        bottom: '130px',
        zIndex: 99999,
        width: '320px',
        maxWidth: 'calc(100% - 40px)',
        background: '#0f0f10',
        color: '#eee',
        border: '1px solid rgba(255,255,255,0.06)',
        padding: '10px',
        borderRadius: '8px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
        display: 'none',
        fontSize: '13px'
      });

      const info = document.createElement('div');
      info.id = 'dev-device-info';
      info.style.marginBottom = '8px';

      const makeBtn = (txt, color) => {
        const b = document.createElement('button');
        b.textContent = txt;
        Object.assign(b.style, {
          marginRight: '8px', padding: '6px 8px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', border: 'none'
        });
        if (color) b.style.background = color; else b.style.background = '#222';
        b.style.color = '#fff';
        return b;
      };

      const btnClear = makeBtn('Clear forced mode', '#3a3a3a');
      const btnDesktop = makeBtn('Force Desktop', '#1166cc');
      const btnMobile = makeBtn('Force Mobile', '#cc4411');
      const btnClose = makeBtn('Close', '#666');

      panel.appendChild(info);
      const row = document.createElement('div');
      row.appendChild(btnClear);
      row.appendChild(btnDesktop);
      row.appendChild(btnMobile);
      row.appendChild(btnClose);
      panel.appendChild(row);

      document.body.appendChild(panel);
      document.body.appendChild(btn);

      const refreshInfo = () => {
        const ua = navigator.userAgent || '';
        const platform = navigator.platform || '';
        const saved = (typeof localStorage !== 'undefined') ? localStorage.getItem('ZR_device_mode') : null;
        const mobileClass = document.documentElement.classList.contains('mobile');
        const mobileLayout = document.documentElement.classList.contains('mobile-layout');
        info.innerHTML = `UA: ${ua.split(')')[0]})<br>Platform: ${platform}<br><strong>mobile class:</strong> ${mobileClass} &nbsp; <strong>mobile-layout:</strong> ${mobileLayout}<br><strong>ZR_device_mode:</strong> ${saved}`;
      };

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        refreshInfo();
      });

      btnClear.addEventListener('click', () => {
        try { localStorage.removeItem('ZR_device_mode'); } catch(e){}
        // immediately apply desktop classes to bypass cached styles
        document.documentElement.classList.remove('mobile');
        document.documentElement.classList.remove('mobile-layout');
        document.documentElement.classList.add('desktop');
        if (self.deviceIndicatorAccount) {
          self.deviceIndicatorAccount.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 5h18v11H3z"/><path d="M8 20h8v2H8z"/></svg>';
          self.deviceIndicatorAccount.dataset.mode = 'desktop';
        }
        refreshInfo();
        try { self.detectAndApplyDevice(); } catch(e){}
        try { self.showToast('Cleared forced device mode (auto)', 2500, 'info'); } catch(e){}
      });
      btnDesktop.addEventListener('click', () => {
        try { localStorage.setItem('ZR_device_mode','desktop'); } catch(e){}
        document.documentElement.classList.remove('mobile');
        document.documentElement.classList.remove('mobile-layout');
        document.documentElement.classList.add('desktop');
        if (self.deviceIndicatorAccount) {
          self.deviceIndicatorAccount.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 5h18v11H3z"/><path d="M8 20h8v2H8z"/></svg>';
          self.deviceIndicatorAccount.dataset.mode = 'desktop';
        }
        refreshInfo();
        try { self.detectAndApplyDevice(); } catch(e){}
        try { self.showToast('Forced Desktop mode', 2200, 'info'); } catch(e){}
      });
      btnMobile.addEventListener('click', () => {
        try { localStorage.setItem('ZR_device_mode','mobile'); } catch(e){}
        document.documentElement.classList.add('mobile');
        document.documentElement.classList.add('mobile-layout');
        document.documentElement.classList.remove('desktop');
        if (self.deviceIndicatorAccount) {
          self.deviceIndicatorAccount.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm5 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>';
          self.deviceIndicatorAccount.dataset.mode = 'mobile';
        }
        refreshInfo();
        try { self.detectAndApplyDevice(); } catch(e){}
        try { self.showToast('Forced Mobile mode', 2200, 'info'); } catch(e){}
      });
      btnClose.addEventListener('click', () => { panel.style.display = 'none'; });

      // close when clicking elsewhere
      document.addEventListener('click', (ev) => {
        if (!panel.contains(ev.target) && ev.target !== btn) panel.style.display = 'none';
      });
    } catch (err) { console.warn('dev helper init failed', err); }
  }

  updateNavButtons() {
    const btnBack = document.getElementById('btn-history-back');
    const btnForward = document.getElementById('btn-history-forward');
    if (btnBack) btnBack.disabled = this.historyIndex <= 0;
    if (btnForward) btnForward.disabled = this.historyIndex >= this.viewHistory.length - 1;

    // Show an automatic back button when there is any history (not on first view)
    if (this.btnDiscoverBack) {
      const shouldShow = this.historyIndex > 0 && this.currentView !== 'home';
      this.btnDiscoverBack.style.display = shouldShow ? 'inline-flex' : 'none';
    }
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

        <section class="featured-carousel-section">
          <div id="featured-carousel" class="featured-carousel">
            ${featuredSongs.map((t, i) => `
              <div class="fc-slide ${i===0? 'active':''}" style="background-image: url('${t.cover || 'assets/zr-logo.jpg'}')" data-index="${i}">
                <div class="fc-overlay">
                  <h3 class="fc-title">${t.title}</h3>
                  <p class="fc-sub">${t.artist}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </section>

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

    // 1. Match local tracks (robust against missing fields)
    const matchingTracks = tracks.filter(t => {
      const title = (t.title || '').toLowerCase();
      const artist = (t.artist || '').toLowerCase();
      const album = (t.album || '').toLowerCase();
      const genre = (t.genre || '').toLowerCase();
      return title.includes(q) || artist.includes(q) || album.includes(q) || genre.includes(q);
    });
    // Show quick debug toast for local match counts
    try { this.showToast(`Local:${tracks.length} matches:${matchingTracks.length}`, 2000, 'info'); } catch (e) { console.debug('toast failed', e); }
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

  // 7. CATEGORIES DIRECTORY VIEW
  renderCategories() {
    const cats = CATEGORIES;
    this.setDynamicHeaderColor('#2b2b2b');

    this.mainContent.innerHTML = `
      <div class="view-container categories-directory fade-in">
        <div class="playlist-directory-header">
          <div>
            <p class="playlist-badge">Browse</p>
            <h1 class="playlist-directory-title">Categories</h1>
          </div>
        </div>
        <div class="category-grid">
          ${cats.map(c => `
            <div class="category-card shelf-card" data-action="filter-category" data-title="${c.title}" style="background-color:${c.color};">
              <div class="shelf-card-thumb-wrap category-thumb">
                <div class="category-icon">${c.icon}</div>
              </div>
              <h4 class="shelf-card-title truncate">${c.title}</h4>
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
        <tr class="track-row ${isCurrentTrack ? 'active-playing-row' : ''} ${isCurrentTrack && player.isPlaying ? 'show-hint' : ''}" 
          data-track-id="${track.id}" 
          data-action="play-track-in-context" 
          data-playlist-id="${playlistId || ''}"
          title="Right click for more options"
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
            <span class="track-hover-hint">Right click for more options</span>
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
         title="Right click for more options"
         oncontextmenu="window.ZRApp.openContextMenu(event, '${track.id}')">
        <img src="${track.cover}" class="compact-thumb" alt="${track.title}" />
        <div class="compact-meta">
          <span class="compact-title truncate ${isCurrent ? 'text-ZR-green' : ''}">${track.title}</span>
          <span class="compact-artist truncate">${track.artist}</span>
        </div>
        <span class="track-hover-hint compact-hint">Right click for more options</span>
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

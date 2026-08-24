/**
 * ZR Web Desktop Clone - Storage Manager
 * Pure Firestore cloud storage (no localStorage for user data).
 * In-memory cache for fast synchronous reads, Firestore as single source of truth.
 * Real-time listeners keep everything in sync across devices — Spotify-style.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getFirestore, collection, doc, getDocs, getDoc, setDoc, deleteDoc,
  query, orderBy, onSnapshot, writeBatch
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import { INITIAL_TRACKS, INITIAL_PLAYLISTS, INITIAL_ARTISTS } from './data.js';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDJqqK_XZbaTQqYV-R4dyCdpNSl5Fvaw08",
  authDomain: "zr-data.firebaseapp.com",
  projectId: "zr-data",
  storageBucket: "zr-data.firebasestorage.app",
  messagingSenderId: "874656878499",
  appId: "1:874656878499:web:6f3f9c08498eb62ab49416",
  measurementId: "G-S3XW79DH5F"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);

class StorageManager {
  constructor() {
    this.currentUserId = null;
    this.currentUserEmail = null;

    // In-memory cache — the ONLY source of truth for reads
    this.userPlaylists = [];
    this.userLikedTrackIds = [];
    this.userRecentSearches = [];
    this.userLocalTracks = [];
    this.userRecentTrackIds = [];
    this.userPlayerState = { volume: 0.8, isMuted: false, shuffle: false, repeat: 'off', currentTrackId: null };

    this._unsubscribers = [];
    this._playlistPersistTimers = {};
    this._localPlaylistWrites = {}; // track timestamps of local writes
    this._initialFetchDone = false;

    // Listen to Firebase auth state changes
    onAuthStateChanged(auth, async (user) => {
      try {
        // Unsubscribe from old listeners
        this._unsubscribers.forEach(unsub => unsub());
        this._unsubscribers = [];
        this._initialFetchDone = false;

        this.setCurrentUser(user);
        if (user) {
          // Fetch ALL data from Firestore into memory
          await this._fetchAllFromFirestore();
          // Start real-time listeners
          this._startRealtimeListeners();
        } else {
          // Signed out — reset in-memory state
          this.userPlaylists = [];
          this.userLikedTrackIds = [];
          this.userRecentSearches = [];
          this.userLocalTracks = [];
          this.userRecentTrackIds = [];
          this.userPlayerState = { volume: 0.8, isMuted: false, shuffle: false, repeat: 'off', currentTrackId: null };
          this._initialFetchDone = true;
        }
      } catch (err) {
        console.warn('Error in auth state handler for storage manager', err);
        this._initialFetchDone = true;
      }
    });
  }

  setCurrentUser(user) {
    this.currentUserId = user?.uid || null;
    this.currentUserEmail = user?.email || null;
  }

  // ============================
  // FIRESTORE COLLECTION REFS
  // ============================

  _userPlaylistsRef() {
    return collection(db, 'users', this.currentUserId, 'playlists');
  }

  _userLikedRef() {
    return collection(db, 'users', this.currentUserId, 'likedTracks');
  }

  _userSearchRef() {
    return collection(db, 'users', this.currentUserId, 'searchHistory');
  }

  _userLocalTracksRef() {
    return collection(db, 'users', this.currentUserId, 'localTracks');
  }

  _userSettingsRef() {
    return doc(db, 'users', this.currentUserId, 'settings', 'player');
  }

  _userRecentsRef() {
    return collection(db, 'users', this.currentUserId, 'recentTracks');
  }

  // ============================
  // INITIAL FETCH: Firestore → Memory
  // ============================

  /**
   * Fetch ALL user data from Firestore into in-memory cache.
   * Called once on sign-in. After this, realtime listeners keep cache updated.
   */
  async _fetchAllFromFirestore() {
    if (!this.currentUserId) return;

    try {
      const [playlistsSnap, likedSnap, searchSnap, localTracksSnap, settingsSnap, recentsSnap] = await Promise.all([
        getDocs(query(this._userPlaylistsRef(), orderBy('updated_at', 'desc'))).catch(() => ({ docs: [] })),
        getDocs(this._userLikedRef()).catch(() => ({ docs: [] })),
        getDocs(query(this._userSearchRef(), orderBy('created_at', 'desc'))).catch(() => ({ docs: [] })),
        getDocs(this._userLocalTracksRef()).catch(() => ({ docs: [] })),
        getDoc(this._userSettingsRef()).catch(() => ({ exists: () => false })),
        getDocs(query(this._userRecentsRef(), orderBy('updated_at', 'desc'))).catch(() => ({ docs: [] }))
      ]);

      // Parse and store playlists
      this.userPlaylists = playlistsSnap.docs.map(d => {
        const data = d.data();
        return {
          id: data.playlist_id || d.id,
          title: data.title || 'Untitled',
          description: data.description || '',
          curator: data.curator || 'You',
          cover: data.cover || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
          color: data.color || '#1e3264',
          trackIds: Array.isArray(data.track_ids) ? data.track_ids : [],
          updated_at: data.updated_at || null
        };
      });

      // If user has no playlists in Firestore, seed with defaults
      if (this.userPlaylists.length === 0) {
        await this._seedDefaultPlaylists();
      }

      // Parse and store liked tracks
      this.userLikedTrackIds = likedSnap.docs.map(d => d.data().track_id).filter(Boolean);

      // Parse and store search history
      this.userRecentSearches = searchSnap.docs.slice(0, 5).map(d => d.data().query).filter(Boolean);

      // Parse and store local/custom tracks
      this.userLocalTracks = localTracksSnap.docs.map(d => {
        const data = d.data();
        return {
          id: data.track_id || d.id,
          title: data.title || '',
          artist: data.artist || '',
          album: data.album || '',
          duration: data.duration || 0,
          cover: data.cover || '',
          audioSrc: data.audioSrc || '',
          youtubeId: data.youtubeId || '',
          color: data.color || '#1e3264'
        };
      });

      // Parse player state
      if (settingsSnap.exists()) {
        const s = settingsSnap.data();
        this.userPlayerState = {
          volume: s.volume ?? 0.8,
          isMuted: !!s.isMuted,
          shuffle: !!s.shuffle,
          repeat: s.repeat || 'off',
          currentTrackId: s.currentTrackId || null
        };
      }

      // Parse recent tracks
      this.userRecentTrackIds = recentsSnap.docs.map(d => d.data().track_id).filter(Boolean);

      this._initialFetchDone = true;
    } catch (error) {
      console.warn('Firestore initial fetch failed:', error);
      this._initialFetchDone = true;
    }
  }

  /**
   * Seed default playlists into Firestore for new users
   */
  async _seedDefaultPlaylists() {
    if (!this.currentUserId) return;
    try {
      for (const pl of INITIAL_PLAYLISTS) {
        await setDoc(doc(this._userPlaylistsRef(), pl.id), {
          user_id: this.currentUserId,
          playlist_id: pl.id,
          title: pl.title,
          description: pl.description || '',
          cover: pl.cover || '',
          color: pl.color || '#1e3264',
          curator: pl.curator || 'ZR',
          track_ids: pl.trackIds || [],
          updated_at: new Date().toISOString()
        }, { merge: true });
      }
      // Update in-memory
      this.userPlaylists = INITIAL_PLAYLISTS.map(pl => ({ ...pl }));
    } catch (err) {
      console.warn('Could not seed default playlists:', err);
    }
  }

  // ============================
  // REAL-TIME LISTENERS (onSnapshot)
  // ============================

  _startRealtimeListeners() {
    if (!this.currentUserId) return;

    // Playlists listener
    const unsubPlaylists = onSnapshot(
      query(this._userPlaylistsRef(), orderBy('updated_at', 'desc')),
      (snap) => {
        const remotePlaylists = snap.docs.map(d => {
          const data = d.data();
          return {
            id: data.playlist_id || d.id,
            title: data.title || 'Untitled',
            description: data.description || '',
            curator: data.curator || 'You',
            cover: data.cover || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
            color: data.color || '#1e3264',
            trackIds: Array.isArray(data.track_ids) ? data.track_ids : [],
            updated_at: data.updated_at || null
          };
        });
        // Smart merge: don't let remote overwrite recent local writes
        // For each playlist, if we wrote locally within the last 2 seconds,
        // merge remote trackIds INTO the local version (union) instead of replacing
        const now = Date.now();
        for (const remote of remotePlaylists) {
          const localIdx = this.userPlaylists.findIndex(p => p.id === remote.id);
          const lastLocalWrite = this._localPlaylistWrites[remote.id] || 0;
          const isRecentLocalWrite = (now - lastLocalWrite) < 2000;
          if (localIdx > -1 && isRecentLocalWrite) {
            // Local has recent changes — merge remote into local (union of trackIds)
            const localPl = this.userPlaylists[localIdx];
            const mergedTrackIds = [...new Set([...(localPl.trackIds || []), ...(remote.trackIds || [])])];
            this.userPlaylists[localIdx] = {
              ...localPl,
              trackIds: mergedTrackIds,
              title: remote.title || localPl.title,
              description: remote.description || localPl.description,
              cover: remote.cover || localPl.cover,
              color: remote.color || localPl.color
            };
          } else {
            // No recent local write — safe to replace
            if (localIdx > -1) {
              this.userPlaylists[localIdx] = remote;
            } else {
              this.userPlaylists.push(remote);
            }
          }
        }
        // Remove playlists deleted remotely
        this.userPlaylists = this.userPlaylists.filter(p => remotePlaylists.some(r => r.id === p.id));
        // Refresh UI if viewing a playlist
        try {
          if (window.ui && typeof window.ui.renderPlaylist === 'function' && window.ui.currentView === 'playlist') {
            window.ui.renderPlaylist(window.ui.currentParam);
          }
          if (window.ui && typeof window.ui.renderSidebarPlaylists === 'function') {
            window.ui.renderSidebarPlaylists();
          }
        } catch (e) { console.debug('ui refresh failed after realtime playlists update', e); }
      },
      (error) => console.warn('Playlists listener error:', error)
    );
    this._unsubscribers.push(unsubPlaylists);

    // Liked tracks listener
    const unsubLiked = onSnapshot(
      this._userLikedRef(),
      (snap) => {
        this.userLikedTrackIds = snap.docs.map(d => d.data().track_id).filter(Boolean);
        try {
          if (window.ui && typeof window.ui.renderSidebarPlaylists === 'function') {
            window.ui.renderSidebarPlaylists();
          }
        } catch (e) {}
      },
      (error) => console.warn('Liked tracks listener error:', error)
    );
    this._unsubscribers.push(unsubLiked);

    // Search history listener
    const unsubSearch = onSnapshot(
      query(this._userSearchRef(), orderBy('created_at', 'desc')),
      (snap) => {
        this.userRecentSearches = snap.docs.slice(0, 5).map(d => d.data().query).filter(Boolean);
      },
      (error) => console.warn('Search history listener error:', error)
    );
    this._unsubscribers.push(unsubSearch);

    // Local tracks listener
    const unsubLocalTracks = onSnapshot(
      this._userLocalTracksRef(),
      (snap) => {
        this.userLocalTracks = snap.docs.map(d => {
          const data = d.data();
          return {
            id: data.track_id || d.id,
            title: data.title || '',
            artist: data.artist || '',
            album: data.album || '',
            duration: data.duration || 0,
            cover: data.cover || '',
            audioSrc: data.audioSrc || '',
            youtubeId: data.youtubeId || '',
            color: data.color || '#1e3264'
          };
        });
      },
      (error) => console.warn('Local tracks listener error:', error)
    );
    this._unsubscribers.push(unsubLocalTracks);

    // Player state listener
    const unsubSettings = onSnapshot(
      this._userSettingsRef(),
      (snap) => {
        if (snap.exists()) {
          const s = snap.data();
          this.userPlayerState = {
            volume: s.volume ?? 0.8,
            isMuted: !!s.isMuted,
            shuffle: !!s.shuffle,
            repeat: s.repeat || 'off',
            currentTrackId: s.currentTrackId || null
          };
        }
      },
      (error) => console.warn('Player settings listener error:', error)
    );
    this._unsubscribers.push(unsubSettings);

    // Recent tracks listener
    const unsubRecents = onSnapshot(
      query(this._userRecentsRef(), orderBy('updated_at', 'desc')),
      (snap) => {
        this.userRecentTrackIds = snap.docs.map(d => d.data().track_id).filter(Boolean);
      },
      (error) => console.warn('Recent tracks listener error:', error)
    );
    this._unsubscribers.push(unsubRecents);
  }

  // ============================
  // FIRESTORE WRITE HELPERS
  // ============================

  async _persistPlaylist(playlist) {
    if (!this.currentUserId) return;
    const playlistId = playlist.id;
    try {
      // Always read the LATEST from in-memory to get all tracks
      const latestPl = this.userPlaylists.find(p => p.id === playlistId) || playlist;
      // Track this local write so realtime listener doesn't overwrite it
      this._localPlaylistWrites[playlistId] = Date.now();
      await setDoc(doc(this._userPlaylistsRef(), playlistId), {
        user_id: this.currentUserId,
        playlist_id: latestPl.id,
        title: latestPl.title,
        description: latestPl.description || '',
        cover: latestPl.cover || '',
        color: latestPl.color || '#1e3264',
        curator: latestPl.curator || 'You',
        track_ids: latestPl.trackIds || [],
        updated_at: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.warn('Could not persist playlist to Firestore:', error);
    }
  }

  async _persistLikedTracks(likedIds) {
    if (!this.currentUserId) return;
    try {
      const ids = likedIds || this.userLikedTrackIds;
      // Use batch for efficiency
      const existing = await getDocs(this._userLikedRef());
      const batch = writeBatch(db);
      for (const d of existing.docs) {
        batch.delete(d.ref);
      }
      for (const trackId of ids) {
        batch.set(doc(this._userLikedRef(), trackId), {
          track_id: trackId,
          user_id: this.currentUserId
        });
      }
      await batch.commit();
    } catch (error) {
      console.warn('Could not persist liked tracks to Firestore:', error);
    }
  }

  async _persistSearchHistory(searches) {
    if (!this.currentUserId) return;
    try {
      const items = searches || this.userRecentSearches;
      const existing = await getDocs(this._userSearchRef());
      const batch = writeBatch(db);
      for (const d of existing.docs) {
        batch.delete(d.ref);
      }
      for (let i = items.length - 1; i >= 0; i--) {
        batch.set(doc(this._userSearchRef(), `search-${Date.now()}-${i}`), {
          query: items[i],
          user_id: this.currentUserId,
          created_at: new Date(Date.now() - i * 1000).toISOString()
        });
      }
      await batch.commit();
    } catch (error) {
      console.warn('Could not persist search history to Firestore:', error);
    }
  }

  async _persistLocalTracks(tracks) {
    if (!this.currentUserId) return;
    try {
      const items = tracks || this.userLocalTracks;
      const existing = await getDocs(this._userLocalTracksRef());
      const batch = writeBatch(db);
      for (const d of existing.docs) {
        batch.delete(d.ref);
      }
      for (const track of items) {
        batch.set(doc(this._userLocalTracksRef(), track.id), {
          track_id: track.id,
          title: track.title || '',
          artist: track.artist || '',
          album: track.album || '',
          duration: track.duration || 0,
          cover: track.cover || '',
          audioSrc: track.audioSrc || '',
          youtubeId: track.youtubeId || '',
          color: track.color || '#1e3264',
          user_id: this.currentUserId
        });
      }
      await batch.commit();
    } catch (error) {
      console.warn('Could not persist local tracks to Firestore:', error);
    }
  }

  async _persistPlayerState(state) {
    if (!this.currentUserId) return;
    try {
      await setDoc(this._userSettingsRef(), {
        ...state,
        user_id: this.currentUserId,
        updated_at: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.warn('Could not persist player state to Firestore:', error);
    }
  }

  async _persistRecentTrack(trackId) {
    if (!this.currentUserId) return;
    try {
      // Write as a doc so realtime listener picks it up
      await setDoc(doc(this._userRecentsRef(), trackId), {
        track_id: trackId,
        user_id: this.currentUserId,
        updated_at: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.warn('Could not persist recent track:', error);
    }
  }

  async _deletePlaylistFromFirestore(playlistId) {
    if (!this.currentUserId) return;
    try {
      await deleteDoc(doc(this._userPlaylistsRef(), playlistId));
    } catch (err) {
      console.warn('Could not delete playlist from Firestore:', err);
    }
  }

  // ============================
  // LIKED TRACKS
  // ============================

  getLikedTrackIds() {
    return [...this.userLikedTrackIds];
  }

  isLiked(trackId) {
    return this.userLikedTrackIds.includes(trackId);
  }

  toggleLike(trackId) {
    const index = this.userLikedTrackIds.indexOf(trackId);
    let isNowLiked = false;
    if (index > -1) {
      this.userLikedTrackIds.splice(index, 1);
      isNowLiked = false;
    } else {
      this.userLikedTrackIds.unshift(trackId);
      isNowLiked = true;
    }

    // Persist to Firestore
    this._persistLikedTracks(this.userLikedTrackIds);
    return isNowLiked;
  }

  // ============================
  // ALL TRACKS
  // ============================

  getAllTracks() {
    const trackMap = new Map();
    INITIAL_TRACKS.forEach(t => trackMap.set(t.id, t));
    this.userLocalTracks.forEach(t => trackMap.set(t.id, t));
    return Array.from(trackMap.values());
  }

  getTrackById(id) {
    return this.getAllTracks().find(t => t.id === id) || null;
  }

  addLocalTrack(track) {
    // Update in-memory
    this.userLocalTracks = this.userLocalTracks.filter(t => t.id !== track.id);
    this.userLocalTracks.unshift(track);
    if (this.userLocalTracks.length > 100) {
      this.userLocalTracks = this.userLocalTracks.slice(0, 100);
    }
    // Persist to Firestore
    this._persistLocalTracks(this.userLocalTracks);
    return track;
  }

  // ============================
  // PLAYLISTS
  // ============================

  getPlaylists() {
    return this.userPlaylists.length ? this.userPlaylists : INITIAL_PLAYLISTS;
  }

  getPlaylistById(id) {
    if (id === 'liked-songs') {
      return {
        id: 'liked-songs',
        title: 'Liked Songs',
        description: 'Your favorite tracks in one place.',
        curator: 'You',
        cover: 'https://misc.scdn.co/liked-songs/liked-songs-640.png',
        color: '#491f8f',
        trackIds: [...this.userLikedTrackIds]
      };
    }
    return this.getPlaylists().find(p => p.id === id) || null;
  }

  createPlaylist(title = "My Playlist", description = "", cover = null) {
    const count = this.userPlaylists.length + 1;
    const colors = ["#1e3264", "#ba5d07", "#8400e7", "#056952", "#e91429", "#503750", "#27ae60"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newPlaylist = {
      id: `playlist-user-${Date.now()}`,
      title: title || `My Playlist #${count}`,
      description: description || "Created by you on ZR Web Desktop",
      curator: "You",
      cover: cover || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
      color: randomColor,
      trackIds: []
    };

    // Update in-memory immediately
    this.userPlaylists.unshift(newPlaylist);
    // Persist to Firestore
    this._persistPlaylist(newPlaylist);
    return newPlaylist;
  }

  updatePlaylist(id, updates) {
    const index = this.userPlaylists.findIndex(p => p.id === id);
    if (index > -1) {
      this.userPlaylists[index] = { ...this.userPlaylists[index], ...updates };
      this._persistPlaylist(this.userPlaylists[index]);
      return this.userPlaylists[index];
    }
    return null;
  }

  deletePlaylist(id) {
    this.userPlaylists = this.userPlaylists.filter(p => p.id !== id);
    this._deletePlaylistFromFirestore(id);
  }

  addTrackToPlaylist(playlistId, trackId) {
    const pl = this.userPlaylists.find(p => p.id === playlistId);
    if (!pl) return false;
    pl.trackIds = Array.isArray(pl.trackIds) ? pl.trackIds : [];
    if (!pl.trackIds.includes(trackId)) {
      pl.trackIds.push(trackId);
      pl.trackIds = [...new Set(pl.trackIds)];
      // Persist to Firestore
      this._persistPlaylist(pl);
      // Refresh UI
      try {
        if (window.ui && typeof window.ui.renderPlaylist === 'function' && window.ui.currentView === 'playlist') {
          window.ui.renderPlaylist(playlistId);
        }
      } catch (e) { console.debug('ui renderPlaylist failed after addTrackToPlaylist', e); }
      return true;
    }
    return false;
  }

  removeTrackFromPlaylist(playlistId, trackId) {
    const pl = this.userPlaylists.find(p => p.id === playlistId);
    if (!pl) return false;
    pl.trackIds = (pl.trackIds || []).filter(id => id !== trackId);
    // Persist to Firestore
    this._persistPlaylist(pl);
    // Refresh UI
    try {
      if (window.ui && typeof window.ui.renderPlaylist === 'function' && window.ui.currentView === 'playlist') {
        window.ui.renderPlaylist(playlistId);
      }
    } catch (e) { console.debug('ui renderPlaylist failed after removeTrackFromPlaylist', e); }
    return true;
  }

  // ============================
  // SEARCH HISTORY
  // ============================

  getRecentSearches() {
    return Array.isArray(this.userRecentSearches) ? this.userRecentSearches.slice(0, 5) : [];
  }

  addRecentSearch(queryStr) {
    const clean = String(queryStr || '').trim();
    if (!clean) return;

    const lower = clean.toLowerCase();
    this.userRecentSearches = this.userRecentSearches.filter(item => item.toLowerCase() !== lower);
    this.userRecentSearches.unshift(clean);
    this.userRecentSearches = this.userRecentSearches.slice(0, 5);

    // Persist to Firestore
    this._persistSearchHistory(this.userRecentSearches);
  }

  // ============================
  // ARTISTS
  // ============================

  getArtists() {
    return INITIAL_ARTISTS;
  }

  getArtistById(id) {
    return INITIAL_ARTISTS.find(a => a.id === id || a.name.toLowerCase() === id.toLowerCase()) || null;
  }

  getTracksByArtist(artistName) {
    return this.getAllTracks().filter(t => t.artist.toLowerCase() === artistName.toLowerCase());
  }

  // ============================
  // RECENT HISTORY
  // ============================

  getRecentTrackIds() {
    return [...this.userRecentTrackIds];
  }

  addRecentTrack(trackId) {
    this.userRecentTrackIds = this.userRecentTrackIds.filter(id => id !== trackId);
    this.userRecentTrackIds.unshift(trackId);
    if (this.userRecentTrackIds.length > 20) {
      this.userRecentTrackIds = this.userRecentTrackIds.slice(0, 20);
    }
    // Persist to Firestore
    this._persistRecentTrack(trackId);
  }

  // ============================
  // PLAYER STATE (synced across devices)
  // ============================

  getPlayerState() {
    return { ...this.userPlayerState };
  }

  savePlayerState(state) {
    this.userPlayerState = { ...this.userPlayerState, ...state };
    this._persistPlayerState(this.userPlayerState);
  }
}

export const storage = new StorageManager();

/**
 * ZR Web Desktop Clone - Storage Manager
 * Hybrid localStorage (primary) + Firebase Firestore (cross-device sync).
 * ALL user data is synced: playlists, liked tracks, search history, local tracks.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getFirestore, collection, doc, getDocs, setDoc, deleteDoc,
  query, orderBy, onSnapshot
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

const STORAGE_KEYS = {
  LIKED_TRACKS: 'ZR_liked_tracks',
  CUSTOM_PLAYLISTS: 'ZR_custom_playlists',
  LOCAL_TRACKS: 'ZR_local_tracks',
  RECENT_TRACKS: 'ZR_recent_tracks',
  RECENT_SEARCHES: 'ZR_recent_searches',
  PLAYER_STATE: 'ZR_player_state'
};

class StorageManager {
  constructor() {
    this.currentUserId = null;
    this.currentUserEmail = null;
    this.userRecentSearches = [];
    this.userPlaylists = [];
    this.userLikedTrackIds = [];
    this.userLocalTracks = [];
    this._unsubscribers = [];
    this.init();

    // Listen to Firebase auth state changes
    onAuthStateChanged(auth, async (user) => {
      try {
        // Unsubscribe from old listeners
        this._unsubscribers.forEach(unsub => unsub());
        this._unsubscribers = [];

        this.setCurrentUser(user);
        if (user) {
          // Full sync: fetch FROM Firestore + push local data TO Firestore
          await this.fullSync();
          // Start real-time listeners
          this._startRealtimeListeners();
        } else {
          this.userPlaylists = [];
          this.userLikedTrackIds = [];
          this.userRecentSearches = [];
          this.userLocalTracks = [];
        }
      } catch (err) {
        console.warn('Error in auth state handler for storage manager', err);
      }
    });
  }

  getUserScopedKey(baseKey) {
    const userKey = this.currentUserId || this.currentUserEmail || 'guest';
    return `${baseKey}_${userKey}`;
  }

  readJson(key, fallback = []) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  init() {
    if (!localStorage.getItem(STORAGE_KEYS.LIKED_TRACKS)) {
      localStorage.setItem(STORAGE_KEYS.LIKED_TRACKS, JSON.stringify(["track-1", "track-2", "track-5"]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.CUSTOM_PLAYLISTS)) {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_PLAYLISTS, JSON.stringify(INITIAL_PLAYLISTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.LOCAL_TRACKS)) {
      localStorage.setItem(STORAGE_KEYS.LOCAL_TRACKS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.RECENT_TRACKS)) {
      localStorage.setItem(STORAGE_KEYS.RECENT_TRACKS, JSON.stringify(["track-1", "track-2", "track-3", "track-4", "track-5"]));
    }

    const savedPlayerState = this.getPlayerState();
    if (savedPlayerState.currentTrackId) {
      localStorage.removeItem(STORAGE_KEYS.PLAYER_STATE);
      this.savePlayerState({
        volume: savedPlayerState.volume ?? 0.8,
        isMuted: !!savedPlayerState.isMuted,
        shuffle: false,
        repeat: 'off',
        currentTrackId: null
      });
    }
  }

  setCurrentUser(user) {
    this.currentUserId = user?.uid || null;
    this.currentUserEmail = user?.email || null;

    if (!user) {
      this.userPlaylists = [];
      this.userLikedTrackIds = [];
      this.userLocalTracks = [];
      return;
    }

    // Load from localStorage immediately so UI is never empty
    this.userPlaylists = this.getLocalPlaylists();
    this.userLikedTrackIds = this.readJson(STORAGE_KEYS.LIKED_TRACKS, ["track-1", "track-2", "track-5"]);
    this.userLocalTracks = this.readJson(STORAGE_KEYS.LOCAL_TRACKS, []);
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

  // ============================
  // FULL SYNC: Fetch + Push
  // ============================

  /**
   * Full sync: fetch all data from Firestore, merge with local, then push back.
   * This ensures cross-device sync works in both directions.
   */
  async fullSync() {
    if (!this.currentUserId) return;

    try {
      // 1. Fetch ALL data from Firestore in parallel
      const [playlistsSnap, likedSnap, searchSnap, localTracksSnap] = await Promise.all([
        getDocs(query(this._userPlaylistsRef(), orderBy('updated_at', 'desc'))),
        getDocs(this._userLikedRef()),
        getDocs(query(this._userSearchRef(), orderBy('created_at', 'desc'))),
        getDocs(this._userLocalTracksRef())
      ]);

      // 2. Parse remote playlists
      const remotePlaylists = playlistsSnap.docs.map(d => {
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

      // 3. Parse remote liked tracks
      const remoteLiked = likedSnap.docs.map(d => d.data().track_id).filter(Boolean);

      // 4. Parse remote search history
      const remoteSearches = searchSnap.docs.map(d => d.data().query).filter(Boolean);

      // 5. Parse remote local tracks
      const remoteLocalTracks = localTracksSnap.docs.map(d => {
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

      // 6. MERGE: local + remote (local wins on conflicts)
      const localPlaylists = this.getLocalPlaylists();
      const mergedPlaylists = this._mergePlaylists(localPlaylists, remotePlaylists);

      const localLiked = this.readJson(STORAGE_KEYS.LIKED_TRACKS, []);
      const mergedLiked = [...new Set([...localLiked, ...remoteLiked])];

      const localSearches = this.readJson(STORAGE_KEYS.RECENT_SEARCHES, []);
      const mergedSearches = [...new Set([...remoteSearches, ...localSearches])].slice(0, 5);

      const localTracks = this.readJson(STORAGE_KEYS.LOCAL_TRACKS, []);
      const mergedLocalTracks = this._mergeLocalTracks(localTracks, remoteLocalTracks);

      // 7. Save merged data to localStorage
      this.writeJson(STORAGE_KEYS.CUSTOM_PLAYLISTS, mergedPlaylists);
      this.writeJson(STORAGE_KEYS.LIKED_TRACKS, mergedLiked);
      this.writeJson(STORAGE_KEYS.RECENT_SEARCHES, mergedSearches);
      this.writeJson(STORAGE_KEYS.LOCAL_TRACKS, mergedLocalTracks);

      // 8. Update in-memory state
      this.userPlaylists = mergedPlaylists;
      this.userLikedTrackIds = mergedLiked;
      this.userRecentSearches = mergedSearches;
      this.userLocalTracks = mergedLocalTracks;

      // 9. Push ALL local data TO Firestore (background)
      this._pushAllToFirestore(mergedPlaylists, mergedLiked, mergedSearches, mergedLocalTracks);

    } catch (error) {
      console.warn('Firestore sync failed; using localStorage data.', error);
      if (!this.userPlaylists.length) {
        this.userPlaylists = this.getLocalPlaylists();
      }
    }
  }

  /** Merge playlists: newer updated_at wins, more tracks wins */
  _mergePlaylists(local, remote) {
    const map = new Map();
    remote.forEach(p => map.set(p.id, { ...p, _source: 'remote' }));
    local.forEach(p => map.set(p.id, { ...p, _source: 'local' }));
    
    return Array.from(map.values()).map(p => {
      // Find the other version for comparison
      const localVersion = local.find(lp => lp.id === p.id);
      const remoteVersion = remote.find(rp => rp.id === p.id);
      
      if (!localVersion) return remoteVersion || p; // Remote only
      if (!remoteVersion) return localVersion || p; // Local only
      
      // Both exist - pick the one with MORE tracks (real data)
      const localTrackCount = (localVersion.trackIds || []).length;
      const remoteTrackCount = (remoteVersion.trackIds || []).length;
      
      if (remoteTrackCount > localTrackCount) {
        // Remote has more data - use remote version
        return remoteVersion;
      }
      
      // Same or local has more - merge trackIds from both
      const mergedTrackIds = [...new Set([...localVersion.trackIds, ...remoteVersion.trackIds])];
      return {
        ...remoteVersion,
        ...localVersion,
        trackIds: mergedTrackIds
      };
    });
  }

  /** Merge local tracks: local wins on conflicts */
  _mergeLocalTracks(local, remote) {
    const map = new Map();
    remote.forEach(t => map.set(t.id, t));
    local.forEach(t => map.set(t.id, t));
    return Array.from(map.values());
  }

  // ============================
  // REAL-TIME LISTENERS (onSnapshot)
  // ============================

  /**
   * Start real-time Firestore listeners.
   * When any device updates data, this device gets notified instantly.
   */
  _startRealtimeListeners() {
    if (!this.currentUserId) return;

    // Real-time playlists listener
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
        const localPlaylists = this.getLocalPlaylists();
        const merged = this._mergePlaylists(localPlaylists, remotePlaylists);
        this.writeJson(STORAGE_KEYS.CUSTOM_PLAYLISTS, merged);
        this.userPlaylists = merged;
      },
      (error) => console.warn('Playlists listener error:', error)
    );
    this._unsubscribers.push(unsubPlaylists);

    // Real-time liked tracks listener
    const unsubLiked = onSnapshot(
      this._userLikedRef(),
      (snap) => {
        const remoteLiked = snap.docs.map(d => d.data().track_id).filter(Boolean);
        if (remoteLiked.length) {
          const localLiked = this.readJson(STORAGE_KEYS.LIKED_TRACKS, []);
          const merged = [...new Set([...localLiked, ...remoteLiked])];
          this.writeJson(STORAGE_KEYS.LIKED_TRACKS, merged);
          this.userLikedTrackIds = merged;
        }
      },
      (error) => console.warn('Liked tracks listener error:', error)
    );
    this._unsubscribers.push(unsubLiked);

    // Real-time search history listener
    const unsubSearch = onSnapshot(
      query(this._userSearchRef(), orderBy('created_at', 'desc')),
      (snap) => {
        this.userRecentSearches = snap.docs.slice(0, 5).map(d => d.data().query);
        this.writeJson(STORAGE_KEYS.RECENT_SEARCHES, this.userRecentSearches);
      },
      (error) => console.warn('Search history listener error:', error)
    );
    this._unsubscribers.push(unsubSearch);

    // Real-time local tracks listener
    const unsubLocalTracks = onSnapshot(
      this._userLocalTracksRef(),
      (snap) => {
        const remoteTracks = snap.docs.map(d => {
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
        const localTracks = this.readJson(STORAGE_KEYS.LOCAL_TRACKS, []);
        const merged = this._mergeLocalTracks(localTracks, remoteTracks);
        this.writeJson(STORAGE_KEYS.LOCAL_TRACKS, merged);
        this.userLocalTracks = merged;
      },
      (error) => console.warn('Local tracks listener error:', error)
    );
    this._unsubscribers.push(unsubLocalTracks);
  }

  // ============================
  // PUSH ALL DATA TO FIRESTORE
  // ============================

  async _pushAllToFirestore(playlists, liked, searches, localTracks) {
    if (!this.currentUserId) return;

    try {
      // Push playlists
      for (const pl of playlists) {
        await this._persistPlaylist(pl);
      }

      // Push liked tracks
      await this._persistLikedTracks(liked);

      // Push search history
      await this._persistSearchHistory(searches);

      // Push local tracks
      await this._persistLocalTracks(localTracks);

    } catch (error) {
      console.warn('Background Firestore push failed', error);
    }
  }

  // ============================
  // INDIVIDUAL PERSIST METHODS
  // ============================

  /** Persist a single playlist to Firestore */
  async _persistPlaylist(playlist) {
    if (!this.currentUserId) return;
    try {
      await setDoc(doc(this._userPlaylistsRef(), playlist.id), {
        user_id: this.currentUserId,
        playlist_id: playlist.id,
        title: playlist.title,
        description: playlist.description || '',
        cover: playlist.cover || '',
        color: playlist.color || '#1e3264',
        curator: playlist.curator || 'You',
        track_ids: playlist.trackIds || [],
        updated_at: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.warn('Could not persist playlist to Firestore.', error);
    }
  }

  /** Persist liked tracks to Firestore */
  async _persistLikedTracks(likedIds) {
    if (!this.currentUserId) return;
    try {
      // Delete existing
      const existing = await getDocs(this._userLikedRef());
      for (const d of existing.docs) {
        await deleteDoc(d.ref);
      }
      // Insert current
      const ids = likedIds || this.getLikedTrackIds();
      for (const trackId of ids) {
        await setDoc(doc(this._userLikedRef(), trackId), {
          track_id: trackId,
          user_id: this.currentUserId
        });
      }
    } catch (error) {
      console.warn('Could not persist liked tracks to Firestore.', error);
    }
  }

  /** Persist search history to Firestore */
  async _persistSearchHistory(searches) {
    if (!this.currentUserId) return;
    try {
      // Delete existing
      const existing = await getDocs(this._userSearchRef());
      for (const d of existing.docs) {
        await deleteDoc(d.ref);
      }
      // Insert current (newest first)
      const items = searches || this.userRecentSearches;
      for (let i = items.length - 1; i >= 0; i--) {
        await setDoc(doc(this._userSearchRef(), `search-${Date.now()}-${i}`), {
          query: items[i],
          user_id: this.currentUserId,
          created_at: new Date(Date.now() - i * 1000).toISOString()
        });
      }
    } catch (error) {
      console.warn('Could not persist search history to Firestore.', error);
    }
  }

  /** Persist local tracks to Firestore */
  async _persistLocalTracks(tracks) {
    if (!this.currentUserId) return;
    try {
      // Delete existing
      const existing = await getDocs(this._userLocalTracksRef());
      for (const d of existing.docs) {
        await deleteDoc(d.ref);
      }
      // Insert current
      const items = tracks || this.readJson(STORAGE_KEYS.LOCAL_TRACKS, []);
      for (const track of items) {
        await setDoc(doc(this._userLocalTracksRef(), track.id), {
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
    } catch (error) {
      console.warn('Could not persist local tracks to Firestore.', error);
    }
  }

  /** Delete a playlist from Firestore */
  async _deletePlaylistFromFirestore(playlistId) {
    if (!this.currentUserId) return;
    try {
      await deleteDoc(doc(this._userPlaylistsRef(), playlistId));
    } catch (err) {
      console.warn('Could not delete playlist from Firestore', err);
    }
  }

  // ============================
  // LIKED TRACKS
  // ============================

  getLikedTrackIds() {
    if (this.currentUserId) {
      return this.userLikedTrackIds.length ? this.userLikedTrackIds : this.readJson(STORAGE_KEYS.LIKED_TRACKS, []);
    }
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.LIKED_TRACKS)) || [];
    } catch (e) {
      return [];
    }
  }

  isLiked(trackId) {
    return this.getLikedTrackIds().includes(trackId);
  }

  toggleLike(trackId) {
    const liked = this.getLikedTrackIds();
    const index = liked.indexOf(trackId);
    let isNowLiked = false;
    if (index > -1) {
      liked.splice(index, 1);
      isNowLiked = false;
    } else {
      liked.unshift(trackId);
      isNowLiked = true;
    }

    // Save to localStorage first
    this.writeJson(STORAGE_KEYS.LIKED_TRACKS, liked);
    if (this.currentUserId) {
      this.userLikedTrackIds = liked;
      this._persistLikedTracks(liked);
    }
    return isNowLiked;
  }

  // ============================
  // ALL TRACKS
  // ============================

  getAllTracks() {
    let localTracks = [];
    try {
      localTracks = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_TRACKS)) || [];
    } catch (e) {
      localTracks = [];
    }
    const trackMap = new Map();
    INITIAL_TRACKS.forEach(t => trackMap.set(t.id, t));
    localTracks.forEach(t => trackMap.set(t.id, t));
    return Array.from(trackMap.values());
  }

  getTrackById(id) {
    return this.getAllTracks().find(t => t.id === id) || null;
  }

  addLocalTrack(track) {
    let localTracks = [];
    try {
      localTracks = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_TRACKS)) || [];
    } catch (e) {
      localTracks = [];
    }
    localTracks = localTracks.filter(t => t.id !== track.id);
    localTracks.unshift(track);
    if (localTracks.length > 100) localTracks = localTracks.slice(0, 100);

    // Save to localStorage
    localStorage.setItem(STORAGE_KEYS.LOCAL_TRACKS, JSON.stringify(localTracks));

    // Persist to Firestore
    if (this.currentUserId) {
      this.userLocalTracks = localTracks;
      this._persistLocalTracks(localTracks);
    }

    return track;
  }

  // ============================
  // PLAYLISTS
  // ============================

  getLocalPlaylists() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_PLAYLISTS));
      return (stored && stored.length > 0) ? stored : INITIAL_PLAYLISTS;
    } catch (e) {
      return INITIAL_PLAYLISTS;
    }
  }

  getPlaylists() {
    if (this.currentUserId) {
      return this.userPlaylists.length ? this.userPlaylists : this.getLocalPlaylists();
    }
    return this.getLocalPlaylists();
  }

  getPlaylistById(id) {
    if (id === 'liked-songs') {
      const likedIds = this.getLikedTrackIds();
      return {
        id: 'liked-songs',
        title: 'Liked Songs',
        description: 'Your favorite tracks in one place.',
        curator: 'You',
        cover: 'https://misc.scdn.co/liked-songs/liked-songs-640.png',
        color: '#491f8f',
        trackIds: likedIds
      };
    }
    return this.getPlaylists().find(p => p.id === id) || null;
  }

  createPlaylist(title = "My Playlist", description = "", cover = null) {
    const playlists = this.getPlaylists();
    const count = playlists.length + 1;
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

    playlists.unshift(newPlaylist);

    // Save to localStorage first
    this.writeJson(STORAGE_KEYS.CUSTOM_PLAYLISTS, playlists);
    if (this.currentUserId) {
      this.userPlaylists = playlists;
      this._persistPlaylist(newPlaylist);
    }
    return newPlaylist;
  }

  updatePlaylist(id, updates) {
    const playlists = this.getPlaylists();
    const index = playlists.findIndex(p => p.id === id);
    if (index > -1) {
      playlists[index] = { ...playlists[index], ...updates };
      this.writeJson(STORAGE_KEYS.CUSTOM_PLAYLISTS, playlists);
      if (this.currentUserId) {
        this.userPlaylists = playlists;
        this._persistPlaylist(playlists[index]);
      }
      return playlists[index];
    }
    return null;
  }

  deletePlaylist(id) {
    let playlists = this.getPlaylists();
    playlists = playlists.filter(p => p.id !== id);
    this.writeJson(STORAGE_KEYS.CUSTOM_PLAYLISTS, playlists);
    if (this.currentUserId) {
      this.userPlaylists = playlists;
      this._deletePlaylistFromFirestore(id);
    }
  }

  addTrackToPlaylist(playlistId, trackId) {
    const playlists = this.getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (pl) {
      if (!pl.trackIds.includes(trackId)) {
        pl.trackIds.push(trackId);
        this.writeJson(STORAGE_KEYS.CUSTOM_PLAYLISTS, playlists);
        if (this.currentUserId) {
          this.userPlaylists = playlists;
          this._persistPlaylist(pl);
        }
        return true;
      }
    }
    return false;
  }

  removeTrackFromPlaylist(playlistId, trackId) {
    const playlists = this.getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (pl) {
      pl.trackIds = pl.trackIds.filter(id => id !== trackId);
      this.writeJson(STORAGE_KEYS.CUSTOM_PLAYLISTS, playlists);
      if (this.currentUserId) {
        this.userPlaylists = playlists;
        this._persistPlaylist(pl);
      }
      return true;
    }
    return false;
  }

  // ============================
  // SEARCH HISTORY
  // ============================

  async fetchUserSearchHistory() {
    if (!this.currentUserId) return;
    try {
      const snap = await getDocs(
        query(this._userSearchRef(), orderBy('created_at', 'desc'))
      );
      this.userRecentSearches = snap.docs.slice(0, 5).map(d => d.data().query);
      this.writeJson(STORAGE_KEYS.RECENT_SEARCHES, this.userRecentSearches);
    } catch (err) {
      console.warn('Could not fetch search history from Firestore', err);
      this.userRecentSearches = [];
    }
  }

  getRecentSearches() {
    if (this.currentUserId) {
      return Array.isArray(this.userRecentSearches) ? this.userRecentSearches.slice(0, 5) : [];
    }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECENT_SEARCHES)) || [];
      return Array.isArray(saved) ? saved.map(item => String(item).trim()).filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }

  addRecentSearch(query) {
    const clean = String(query || '').trim();
    if (!clean) return;

    // Update local
    let searches = this.getRecentSearches();
    const lower = clean.toLowerCase();
    searches = searches.filter(item => item.toLowerCase() !== lower);
    searches.unshift(clean);
    searches = searches.slice(0, 5);
    localStorage.setItem(STORAGE_KEYS.RECENT_SEARCHES, JSON.stringify(searches));

    if (this.currentUserId) {
      this.userRecentSearches = searches;
      // Persist to Firestore in background
      this._persistSearchHistory(searches);
    }
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
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.RECENT_TRACKS)) || [];
    } catch (e) {
      return [];
    }
  }

  addRecentTrack(trackId) {
    let recents = this.getRecentTrackIds();
    recents = recents.filter(id => id !== trackId);
    recents.unshift(trackId);
    if (recents.length > 20) recents = recents.slice(0, 20);
    localStorage.setItem(STORAGE_KEYS.RECENT_TRACKS, JSON.stringify(recents));
  }

  // ============================
  // PLAYER STATE
  // ============================

  getPlayerState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAYER_STATE));
      if (saved) {
        return {
          volume: saved.volume ?? 0.8,
          isMuted: !!saved.isMuted,
          shuffle: !!saved.shuffle,
          repeat: saved.repeat || 'off',
          currentTrackId: saved.currentTrackId || null
        };
      }
      return { volume: 0.8, isMuted: false, shuffle: false, repeat: 'off', currentTrackId: null };
    } catch (e) {
      return { volume: 0.8, isMuted: false, shuffle: false, repeat: 'off', currentTrackId: null };
    }
  }

  savePlayerState(state) {
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYER_STATE, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save player state", e);
    }
  }
}

export const storage = new StorageManager();

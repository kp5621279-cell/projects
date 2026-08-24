/**
 * ZR Web Desktop Clone - Storage Manager
 * Hybrid localStorage (primary) + Firebase Firestore (cross-device sync).
 * localStorage = instant reads, Firestore = cross-device sync.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getFirestore, collection, doc, getDocs, setDoc, deleteDoc,
  query, where, orderBy
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
    this.init();

    // Listen to Firebase auth state changes
    onAuthStateChanged(auth, async (user) => {
      try {
        this.setCurrentUser(user);
        if (user) {
          await this.syncFromFirestore();
          await this.fetchUserSearchHistory();
        } else {
          this.userPlaylists = [];
          this.userLikedTrackIds = [];
          this.userRecentSearches = [];
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
      return;
    }

    // load from localStorage immediately so UI is never empty
    this.userPlaylists = this.getLocalPlaylists();
    this.userLikedTrackIds = this.readJson(STORAGE_KEYS.LIKED_TRACKS, ["track-1", "track-2", "track-5"]);
  }

  // ============================
  // FIRESTORE SYNC
  // ============================

  /** Get user's playlists subcollection ref */
  _userPlaylistsRef() {
    return collection(db, 'users', this.currentUserId, 'playlists');
  }

  /** Get user's likedTracks subcollection ref */
  _userLikedRef() {
    return collection(db, 'users', this.currentUserId, 'likedTracks');
  }

  /** Get user's searchHistory subcollection ref */
  _userSearchRef() {
    return collection(db, 'users', this.currentUserId, 'searchHistory');
  }

  /**
   * Fetch playlists from Firestore, merge with local, save to both.
   */
  async syncFromFirestore() {
    if (!this.currentUserId) return;

    try {
      // Fetch playlists and liked tracks in parallel
      const [playlistsSnap, likedSnap] = await Promise.all([
        getDocs(query(this._userPlaylistsRef(), orderBy('updated_at', 'desc'))),
        getDocs(this._userLikedRef())
      ]);

      // Parse Firestore playlists
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

      // Parse liked tracks
      const remoteLiked = likedSnap.docs.map(d => d.data().track_id).filter(Boolean);

      // Merge: local + remote (local wins)
      const localPlaylists = this.getLocalPlaylists();
      const merged = this.mergePlaylists(localPlaylists, remotePlaylists);

      this.writeJson(STORAGE_KEYS.CUSTOM_PLAYLISTS, merged);
      this.userPlaylists = merged;

      // Merge liked tracks
      if (remoteLiked.length) {
        const localLiked = this.readJson(STORAGE_KEYS.LIKED_TRACKS, []);
        const mergedLiked = [...new Set([...localLiked, ...remoteLiked])];
        this.writeJson(STORAGE_KEYS.LIKED_TRACKS, mergedLiked);
        this.userLikedTrackIds = mergedLiked;
      }

      // Push local-only playlists TO Firestore (background)
      this._syncToFirestore(merged);
    } catch (error) {
      console.warn('Firestore sync failed; using localStorage data.', error);
      if (!this.userPlaylists.length) {
        this.userPlaylists = this.getLocalPlaylists();
      }
    }
  }

  /** Merge local and remote playlists. Local wins on conflicts. */
  mergePlaylists(local, remote) {
    const map = new Map();
    remote.forEach(p => map.set(p.id, p));
    local.forEach(p => map.set(p.id, p));
    return Array.from(map.values());
  }

  /** Push all playlists to Firestore (background). */
  async _syncToFirestore(playlists) {
    if (!this.currentUserId || !playlists.length) return;
    try {
      for (const pl of playlists) {
        await this._persistPlaylist(pl);
      }
    } catch (error) {
      console.warn('Background Firestore sync failed', error);
    }
  }

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
  async _persistLikedTracks() {
    if (!this.currentUserId) return;
    try {
      // Delete existing
      const existing = await getDocs(this._userLikedRef());
      for (const d of existing.docs) {
        await deleteDoc(d.ref);
      }
      // Insert current
      const likedIds = this.getLikedTrackIds();
      for (const trackId of likedIds) {
        await setDoc(doc(this._userLikedRef(), trackId), {
          track_id: trackId,
          user_id: this.currentUserId
        });
      }
    } catch (error) {
      console.warn('Could not persist liked tracks to Firestore.', error);
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

  // --- Liked Tracks ---
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
      this._persistLikedTracks();
    }
    return isNowLiked;
  }

  // --- All Tracks ---
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
    localStorage.setItem(STORAGE_KEYS.LOCAL_TRACKS, JSON.stringify(localTracks));
    return track;
  }

  // --- Playlists ---
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

  // --- Search history (Firestore-backed for signed-in users) ---
  async fetchUserSearchHistory() {
    if (!this.currentUserId) return;
    try {
      const snap = await getDocs(
        query(this._userSearchRef(), orderBy('created_at', 'desc'))
      );
      this.userRecentSearches = snap.docs.slice(0, 5).map(d => d.data().query);
    } catch (err) {
      console.warn('Could not fetch user search history from Firestore', err);
      this.userRecentSearches = [];
    }
  }

  // --- Artists ---
  getArtists() {
    return INITIAL_ARTISTS;
  }

  getArtistById(id) {
    return INITIAL_ARTISTS.find(a => a.id === id || a.name.toLowerCase() === id.toLowerCase()) || null;
  }

  getTracksByArtist(artistName) {
    return this.getAllTracks().filter(t => t.artist.toLowerCase() === artistName.toLowerCase());
  }

  // --- Recent History ---
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

    if (this.currentUserId) {
      (async () => {
        try {
          const searchId = `search-${Date.now()}`;
          await setDoc(doc(this._userSearchRef(), searchId), {
            query: clean,
            user_id: this.currentUserId,
            created_at: new Date().toISOString()
          });
          await this.fetchUserSearchHistory();
          // Prune older than 5
          const snap = await getDocs(query(this._userSearchRef(), orderBy('created_at', 'desc')));
          if (snap.docs.length > 5) {
            for (const d of snap.docs.slice(5)) {
              await deleteDoc(d.ref);
            }
          }
        } catch (err) {
          console.warn('Could not add recent search to Firestore', err);
        }
      })();
    } else {
      let searches = this.getRecentSearches();
      const lower = clean.toLowerCase();
      searches = searches.filter(item => item.toLowerCase() !== lower);
      searches.unshift(clean);
      searches = searches.slice(0, 5);
      localStorage.setItem(STORAGE_KEYS.RECENT_SEARCHES, JSON.stringify(searches));
    }
  }

  // --- Player Settings Persistence ---
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

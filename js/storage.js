/**
 * ZR Web Desktop Clone - Storage Manager
 * Hybrid localStorage (primary) + Supabase (background sync) for playlists.
 * localStorage = instant reads, Supabase = cross-device sync.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { INITIAL_TRACKS, INITIAL_PLAYLISTS, INITIAL_ARTISTS } from './data.js';

const supabaseUrl = 'https://cegogwlqwradaljschcu.supabase.co';
const supabaseAnonKey = 'sb_publishable_IBY_CeeCB2nlKnnCHBy28A_iRcadxjq';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

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
    this._syncQueue = [];
    this._isSyncing = false;
    this.init();
    this.loadCurrentSession();

    // react to auth state changes
    supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        this.setCurrentUser(session?.user || null);
        if (session?.user) {
          await this.syncFromSupabase();
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
    this.currentUserId = user?.id || null;
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

  async loadCurrentSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      this.setCurrentUser(session?.user || null);
      if (session?.user) {
        // fire-and-forget: sync from Supabase in background
        this.syncFromSupabase();
      }
    } catch (error) {
      console.warn('Unable to load current Supabase session for storage.', error);
    }
  }

  // ============================
  // HYBRID SYNC: localStorage + Supabase
  // ============================

  /**
   * Fetch playlists from Supabase, merge with local, save to both.
   * Local data wins if both exist (local is the "source of truth" for speed).
   */
  async syncFromSupabase() {
    if (!this.currentUserId) return;

    try {
      const [{ data: playlistsData = [], error: playlistsError }, { data: likedData = [], error: likedDataError }] = await Promise.all([
        supabase.from('playlists').select('*').eq('user_id', this.currentUserId).order('updated_at', { ascending: false }),
        supabase.from('liked_tracks').select('track_id').eq('user_id', this.currentUserId)
      ]);

      if (playlistsError) throw playlistsError;

      // Parse Supabase playlists
      const remotePlaylists = (playlistsData || []).map(p => {
        try {
          const trackIds = Array.isArray(p.track_ids)
            ? p.track_ids
            : JSON.parse(p.track_ids || '[]');
          return {
            id: p.playlist_id || p.id,
            title: p.title,
            description: p.description || '',
            curator: p.curator || 'You',
            cover: p.cover || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
            color: p.color || '#1e3264',
            trackIds: Array.isArray(trackIds) ? trackIds : [],
            updated_at: p.updated_at || null
          };
        } catch (e) {
          return {
            id: p.playlist_id || p.id,
            title: p.title,
            description: p.description || '',
            curator: p.curator || 'You',
            cover: p.cover || '',
            color: p.color || '#1e3264',
            trackIds: [],
            updated_at: p.updated_at || null
          };
        }
      });

      // Merge: local playlists + remote playlists
      const localPlaylists = this.getLocalPlaylists();
      const merged = this.mergePlaylists(localPlaylists, remotePlaylists);

      // Save merged result to localStorage
      this.writeJson(STORAGE_KEYS.CUSTOM_PLAYLISTS, merged);
      this.userPlaylists = merged;

      // Merge liked tracks
      if (!likedDataError) {
        const remoteLiked = (likedData || []).map(item => item.track_id);
        if (remoteLiked.length) {
          const localLiked = this.readJson(STORAGE_KEYS.LIKED_TRACKS, []);
          const mergedLiked = [...new Set([...localLiked, ...remoteLiked])];
          this.writeJson(STORAGE_KEYS.LIKED_TRACKS, mergedLiked);
          this.userLikedTrackIds = mergedLiked;
        }
      }

      // Also push any local-only playlists TO Supabase (background)
      this.syncToSupabase(merged);
    } catch (error) {
      console.warn('Supabase sync failed; using localStorage data.', error);
      // Ensure we at least have local data loaded
      if (!this.userPlaylists.length) {
        this.userPlaylists = this.getLocalPlaylists();
      }
    }
  }

  /**
   * Merge local and remote playlists.
   * - Local playlists take priority (faster edits)
   * - Remote playlists not in local are added
   * - Deduplicates by playlist id
   */
  mergePlaylists(local, remote) {
    const map = new Map();

    // Add remote first (lower priority)
    remote.forEach(p => {
      map.set(p.id, p);
    });

    // Overlay local (higher priority)
    local.forEach(p => {
      map.set(p.id, p);
    });

    return Array.from(map.values());
  }

  /**
   * Push all playlists to Supabase (background, non-blocking).
   */
  async syncToSupabase(playlists) {
    if (!this.currentUserId || !playlists.length) return;

    try {
      for (const pl of playlists) {
        await this.persistPlaylistToSupabase(pl);
      }
    } catch (error) {
      console.warn('Background Supabase sync failed', error);
    }
  }

  async persistPlaylistToSupabase(playlist) {
    if (!this.currentUserId) return;

    try {
      const payload = {
        user_id: this.currentUserId,
        playlist_id: playlist.id,
        title: playlist.title,
        description: playlist.description || '',
        cover: playlist.cover || '',
        color: playlist.color || '#1e3264',
        curator: playlist.curator || 'You',
        track_ids: playlist.trackIds || [],
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase.from('playlists').upsert(payload, { onConflict: 'playlist_id' });
      if (error) throw error;
    } catch (error) {
      console.warn('Could not persist playlist to Supabase.', error);
    }
  }

  async persistLikedTracksToSupabase() {
    if (!this.currentUserId) return;

    try {
      const likedIds = this.getLikedTrackIds();
      await supabase.from('liked_tracks').delete().eq('user_id', this.currentUserId);

      if (likedIds.length) {
        const rows = likedIds.map(trackId => ({ user_id: this.currentUserId, track_id: trackId }));
        const { error } = await supabase.from('liked_tracks').insert(rows);
        if (error) throw error;
      }
    } catch (error) {
      console.warn('Could not persist liked tracks to Supabase.', error);
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

    // Always save to localStorage first (instant)
    this.writeJson(STORAGE_KEYS.LIKED_TRACKS, liked);
    if (this.currentUserId) {
      this.userLikedTrackIds = liked;
      // Background sync to Supabase
      this.persistLikedTracksToSupabase();
    }
    return isNowLiked;
  }

  // --- All Tracks (Default + Local Imports / Online Search Cache) ---
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
    // Always return from in-memory (loaded from localStorage on init)
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

    // Always save to localStorage first
    this.writeJson(STORAGE_KEYS.CUSTOM_PLAYLISTS, playlists);
    if (this.currentUserId) {
      this.userPlaylists = playlists;
      // Background sync to Supabase
      this.persistPlaylistToSupabase(newPlaylist);
    }
    return newPlaylist;
  }

  updatePlaylist(id, updates) {
    const playlists = this.getPlaylists();
    const index = playlists.findIndex(p => p.id === id);
    if (index > -1) {
      playlists[index] = { ...playlists[index], ...updates };
      // Always save to localStorage first
      this.writeJson(STORAGE_KEYS.CUSTOM_PLAYLISTS, playlists);
      if (this.currentUserId) {
        this.userPlaylists = playlists;
        this.persistPlaylistToSupabase(playlists[index]);
      }
      return playlists[index];
    }
    return null;
  }

  deletePlaylist(id) {
    let playlists = this.getPlaylists();
    playlists = playlists.filter(p => p.id !== id);
    // Always save to localStorage first
    this.writeJson(STORAGE_KEYS.CUSTOM_PLAYLISTS, playlists);
    if (this.currentUserId) {
      this.userPlaylists = playlists;
      // Also delete from Supabase
      this.deletePlaylistFromSupabase(id);
    }
  }

  async deletePlaylistFromSupabase(playlistId) {
    if (!this.currentUserId) return;
    try {
      await supabase.from('playlists').delete()
        .eq('user_id', this.currentUserId)
        .eq('playlist_id', playlistId);
    } catch (err) {
      console.warn('Could not delete playlist from Supabase', err);
    }
  }

  addTrackToPlaylist(playlistId, trackId) {
    const playlists = this.getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (pl) {
      if (!pl.trackIds.includes(trackId)) {
        pl.trackIds.push(trackId);
        // Always save to localStorage first
        this.writeJson(STORAGE_KEYS.CUSTOM_PLAYLISTS, playlists);
        if (this.currentUserId) {
          this.userPlaylists = playlists;
          this.persistPlaylistToSupabase(pl);
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
      // Always save to localStorage first
      this.writeJson(STORAGE_KEYS.CUSTOM_PLAYLISTS, playlists);
      if (this.currentUserId) {
        this.userPlaylists = playlists;
        this.persistPlaylistToSupabase(pl);
      }
      return true;
    }
    return false;
  }

  // --- Search history (Supabase-backed for signed-in users) ---
  async fetchUserSearchHistory() {
    if (!this.currentUserId) return;
    try {
      const { data, error } = await supabase.from('search_history').select('query').eq('user_id', this.currentUserId).order('created_at', { ascending: false }).limit(5);
      if (error) throw error;
      this.userRecentSearches = (data || []).map(r => r.query);
    } catch (err) {
      console.warn('Could not fetch user search history from Supabase', err);
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
    // Guests: use localStorage
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
      // Save to Supabase for signed-in users
      (async () => {
        try {
          await supabase.from('search_history').insert({ user_id: this.currentUserId, query: clean });
          await this.fetchUserSearchHistory();
          // prune older rows beyond latest 5
          const { data: all, error: allErr } = await supabase.from('search_history').select('id').eq('user_id', this.currentUserId).order('created_at', { ascending: false });
          if (!allErr && Array.isArray(all) && all.length > 5) {
            const idsToDelete = all.slice(5).map(r => r.id);
            if (idsToDelete.length) await supabase.from('search_history').delete().in('id', idsToDelete);
          }
        } catch (err) {
          console.warn('Could not add recent search to Supabase', err);
        }
      })();
    } else {
      // Guests: localStorage only
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

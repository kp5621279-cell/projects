/**
 * ZR Web Desktop Clone - Storage Manager
 * Handles local storage persistence for playlists, liked songs, history, custom tracks, and player preferences.
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
    this.init();
    this.loadCurrentSession();

    // react to auth state changes and load user-scoped data only when session.user is present
    supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        this.setCurrentUser(session?.user || null);
        if (session?.user) {
          await this.syncUserDataFromSupabase();
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
    // NOTE: playlists are stored in Supabase for signed-in users; do not keep separate CUSTOM_PLAYLISTS in localStorage
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

    this.userPlaylists = [];
    this.userLikedTrackIds = [];
  }

  async loadCurrentSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // set current user now; actual data sync happens in onAuthStateChange listener
      this.setCurrentUser(session?.user || null);
    } catch (error) {
      console.warn('Unable to load current Supabase session for storage.', error);
    }
  }

  async syncUserDataFromSupabase() {
    if (!this.currentUserId) return;

    const fallbackPlaylists = INITIAL_PLAYLISTS;
    const fallbackLiked = ["track-1", "track-2", "track-5"];

    try {
      const [{ data: playlistsData = [], error: playlistsError }, { data: likedData = [], error: likedError }] = await Promise.all([
        supabase.from('playlists').select('*').eq('user_id', this.currentUserId).order('updated_at', { ascending: false }),
        supabase.from('liked_tracks').select('track_id').eq('user_id', this.currentUserId)
      ]);

      if (playlistsError) throw playlistsError;
      if (likedError) throw likedError;

      const syncedPlaylists = (playlistsData || []).map(p => {
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
            trackIds: Array.isArray(trackIds) ? trackIds : []
          };
        } catch (error) {
          return {
            id: p.playlist_id || p.id,
            title: p.title,
            description: p.description || '',
            curator: p.curator || 'You',
            cover: p.cover || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
            color: p.color || '#1e3264',
            trackIds: []
          };
        }
      });

      const nextPlaylists = syncedPlaylists.length ? syncedPlaylists : fallbackPlaylists;
      const nextLiked = (likedData || []).map(item => item.track_id).length ? (likedData || []).map(item => item.track_id) : fallbackLiked;

      this.userPlaylists = nextPlaylists;
      this.userLikedTrackIds = nextLiked;
    } catch (error) {
      console.warn('User playlist sync from Supabase unavailable; using default seeded data.', error);
      this.userPlaylists = fallbackPlaylists;
      this.userLikedTrackIds = fallbackLiked;
      // do not persist playlists to localStorage here (we rely on Supabase for signed-in users)
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
      if (!this.userLikedTrackIds.length) {
        this.syncUserDataFromSupabase();
      }
      return this.userLikedTrackIds.length ? this.userLikedTrackIds : [];
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

    if (this.currentUserId) {
      this.userLikedTrackIds = liked;
      this.writeJson(this.getUserScopedKey(STORAGE_KEYS.LIKED_TRACKS), liked);
      this.persistLikedTracksToSupabase();
      return isNowLiked;
    }

    localStorage.setItem(STORAGE_KEYS.LIKED_TRACKS, JSON.stringify(liked));
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
  getPlaylists() {
    if (this.currentUserId) {
      if (!this.userPlaylists.length) {
        this.syncUserDataFromSupabase();
      }
      return this.userPlaylists.length ? this.userPlaylists : [];
    }
    // for guests, return the initial seeded playlists (no localStorage for custom playlists)
    return INITIAL_PLAYLISTS;
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

    if (this.currentUserId) {
      this.userPlaylists = playlists;
      this.persistPlaylistToSupabase(newPlaylist);
      return newPlaylist;
    }
    return newPlaylist;
  }

  updatePlaylist(id, updates) {
    const playlists = this.getPlaylists();
    const index = playlists.findIndex(p => p.id === id);
    if (index > -1) {
      playlists[index] = { ...playlists[index], ...updates };
      if (this.currentUserId) {
        this.userPlaylists = playlists;
        this.persistPlaylistToSupabase(playlists[index]);
      } else {
        // guest: keep in-memory only; do not persist to localStorage
      }
      return playlists[index];
    }
    return null;
  }

  deletePlaylist(id) {
    let playlists = this.getPlaylists();
    playlists = playlists.filter(p => p.id !== id);
    if (this.currentUserId) {
      this.userPlaylists = playlists;
      // persisted to Supabase; do not store playlists in localStorage
    } else {
      // guest: keep changes in-memory only
    }
  }

  addTrackToPlaylist(playlistId, trackId) {
    const playlists = this.getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (pl) {
      if (!pl.trackIds.includes(trackId)) {
        pl.trackIds.push(trackId);
        if (this.currentUserId) {
          this.userPlaylists = playlists;
          this.persistPlaylistToSupabase(pl);
        } else {
          // guest: keep in-memory only
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
      if (this.currentUserId) {
        this.userPlaylists = playlists;
        this.persistPlaylistToSupabase(pl);
      } else {
        // guest: keep in-memory only
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
    // return supabase-backed recent searches for signed-in users; guests have no persistent search history
    if (this.currentUserId) {
      return Array.isArray(this.userRecentSearches) ? this.userRecentSearches.slice(0, 5) : [];
    }
    return [];
  }

  addRecentSearch(query) {
    const clean = String(query || '').trim();
    if (!clean || !this.currentUserId) return;

    // insert the new search row, then refresh the in-memory recent list and prune older rows
    (async () => {
      try {
        await supabase.from('search_history').insert({ user_id: this.currentUserId, query: clean });
        // reload latest 5
        await this.fetchUserSearchHistory();
        // optionally prune older rows beyond latest 5
        const { data: all, error: allErr } = await supabase.from('search_history').select('id').eq('user_id', this.currentUserId).order('created_at', { ascending: false });
        if (!allErr && Array.isArray(all) && all.length > 5) {
          const idsToDelete = all.slice(5).map(r => r.id);
          if (idsToDelete.length) await supabase.from('search_history').delete().in('id', idsToDelete);
        }
      } catch (err) {
        console.warn('Could not add recent search to Supabase', err);
      }
    })();
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

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
    this.userPlaylists = [];
    this.userLikedTrackIds = [];
    this.init();
    this.loadCurrentSession();
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

    this.userPlaylists = [];
    this.userLikedTrackIds = [];
  }

  async loadCurrentSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      this.setCurrentUser(session?.user || null);
      if (session?.user) {
        await this.syncUserDataFromSupabase();
      }
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

      this.writeJson(this.getUserScopedKey(STORAGE_KEYS.CUSTOM_PLAYLISTS), this.userPlaylists);
      this.writeJson(this.getUserScopedKey(STORAGE_KEYS.LIKED_TRACKS), this.userLikedTrackIds);
    } catch (error) {
      console.warn('User playlist sync from Supabase unavailable; using default seeded data.', error);
      this.userPlaylists = fallbackPlaylists;
      this.userLikedTrackIds = fallbackLiked;
      this.writeJson(this.getUserScopedKey(STORAGE_KEYS.CUSTOM_PLAYLISTS), this.userPlaylists);
      this.writeJson(this.getUserScopedKey(STORAGE_KEYS.LIKED_TRACKS), this.userLikedTrackIds);
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

    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_PLAYLISTS));
      return (stored && stored.length > 0) ? stored : INITIAL_PLAYLISTS;
    } catch (e) {
      return INITIAL_PLAYLISTS;
    }
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
      this.writeJson(this.getUserScopedKey(STORAGE_KEYS.CUSTOM_PLAYLISTS), playlists);
      this.persistPlaylistToSupabase(newPlaylist);
      return newPlaylist;
    }

    localStorage.setItem(STORAGE_KEYS.CUSTOM_PLAYLISTS, JSON.stringify(playlists));
    return newPlaylist;
  }

  updatePlaylist(id, updates) {
    const playlists = this.getPlaylists();
    const index = playlists.findIndex(p => p.id === id);
    if (index > -1) {
      playlists[index] = { ...playlists[index], ...updates };
      if (this.currentUserId) {
        this.userPlaylists = playlists;
        this.writeJson(this.getUserScopedKey(STORAGE_KEYS.CUSTOM_PLAYLISTS), playlists);
        this.persistPlaylistToSupabase(playlists[index]);
      } else {
        localStorage.setItem(STORAGE_KEYS.CUSTOM_PLAYLISTS, JSON.stringify(playlists));
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
      this.writeJson(this.getUserScopedKey(STORAGE_KEYS.CUSTOM_PLAYLISTS), playlists);
    } else {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_PLAYLISTS, JSON.stringify(playlists));
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
          this.writeJson(this.getUserScopedKey(STORAGE_KEYS.CUSTOM_PLAYLISTS), playlists);
          this.persistPlaylistToSupabase(pl);
        } else {
          localStorage.setItem(STORAGE_KEYS.CUSTOM_PLAYLISTS, JSON.stringify(playlists));
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
        this.writeJson(this.getUserScopedKey(STORAGE_KEYS.CUSTOM_PLAYLISTS), playlists);
        this.persistPlaylistToSupabase(pl);
      } else {
        localStorage.setItem(STORAGE_KEYS.CUSTOM_PLAYLISTS, JSON.stringify(playlists));
      }
      return true;
    }
    return false;
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

    let searches = this.getRecentSearches();
    const lower = clean.toLowerCase();
    searches = searches.filter(item => item.toLowerCase() !== lower);
    searches.unshift(clean);
    searches = searches.slice(0, 5);
    localStorage.setItem(STORAGE_KEYS.RECENT_SEARCHES, JSON.stringify(searches));
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

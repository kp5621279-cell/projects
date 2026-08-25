/**
 * Spotify / ZR Beats - Rewards & Stats System
 * Criteria:
 *   5 Songs: Yellow Fruit Badge
 *  50 Songs: Cyan Fruit Badge
 * 1000 Songs: Red Fruit Badge
 * 5000 Songs: Green Mythic Fruit Badge (Rare)
 */

import { storage } from './storage.js';

export const BADGE_TIERS = [
  {
    id: 'yellow',
    name: 'Yellow Fruit Badge',
    tierName: 'Novice Listener',
    requiredSongs: 5,
    color: '#FFB800',
    glowColor: 'rgba(255, 184, 0, 0.65)',
    image: 'assets/badges/badge-yellow.png',
    description: 'Listen to 5 songs on ZR Beats'
  },
  {
    id: 'cyan',
    name: 'Cyan Fruit Badge',
    tierName: 'Pro Melophile',
    requiredSongs: 50,
    color: '#00E5FF',
    glowColor: 'rgba(0, 229, 255, 0.65)',
    image: 'assets/badges/badge-cyan.png',
    description: 'Listen to 50 songs on ZR Beats'
  },
  {
    id: 'red',
    name: 'Red Fruit Badge',
    tierName: 'Master Virtuoso',
    requiredSongs: 1000,
    color: '#FF2E4D',
    glowColor: 'rgba(255, 46, 77, 0.75)',
    image: 'assets/badges/badge-red.png',
    description: 'Listen to 1,000 songs on ZR Beats'
  },
  {
    id: 'green',
    name: 'Mythic Green Fruit Badge',
    tierName: 'Mythic Legend',
    isRare: true,
    requiredSongs: 5000,
    color: '#00FF66',
    glowColor: 'rgba(0, 255, 102, 0.9)',
    image: 'assets/badges/badge-green.png',
    description: 'Listen to 5,000 songs • Ultra Rare Badge'
  }
];

class RewardsManager {
  constructor() {
    this.currentUserId = 'guest';
    this.currentTrackPlayLogged = null;
  }

  setUserId(userId) {
    this.currentUserId = userId || 'guest';
    this.updateTopbarBadge();
  }

  getStats() {
    const key = `zr_stats_${this.currentUserId}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      songsPlayed: 0,
      equippedBadgeId: null, // null = auto highest
      history: []
    };
  }

  saveStats(stats) {
    const key = `zr_stats_${this.currentUserId}`;
    try {
      localStorage.setItem(key, JSON.stringify(stats));
    } catch (e) {}
    this.updateTopbarBadge();
  }

  recordSongPlay(trackId) {
    if (!trackId) return;
    const stats = this.getStats();
    stats.songsPlayed = (stats.songsPlayed || 0) + 1;
    if (!stats.history) stats.history = [];
    stats.history.push({ trackId, timestamp: Date.now() });
    
    // Keep max 100 recent plays in history
    if (stats.history.length > 100) stats.history = stats.history.slice(-100);

    const oldBadge = this.getEquippedBadge();
    this.saveStats(stats);
    const newBadge = this.getEquippedBadge();

    // Check if new badge unlocked
    if (newBadge && (!oldBadge || oldBadge.id !== newBadge.id)) {
      if (window.SpotifyApp?.ui?.showToast) {
        window.SpotifyApp.ui.showToast(`🎉 Congratulations! You unlocked the ${newBadge.name}!`, 5000, 'success');
      }
    }
  }

  getUnlockedBadges() {
    const stats = this.getStats();
    const played = stats.songsPlayed || 0;
    return BADGE_TIERS.filter(b => played >= b.requiredSongs);
  }

  getEquippedBadge() {
    const stats = this.getStats();
    const unlocked = this.getUnlockedBadges();
    if (unlocked.length === 0) return null;

    if (stats.equippedBadgeId) {
      const found = unlocked.find(b => b.id === stats.equippedBadgeId);
      if (found) return found;
    }
    // Default to highest unlocked tier
    return unlocked[unlocked.length - 1];
  }

  equipBadge(badgeId) {
    const stats = this.getStats();
    stats.equippedBadgeId = badgeId;
    this.saveStats(stats);
    this.updateTopbarBadge();
    this.renderModalContent();
  }

  updateTopbarBadge() {
    const badge = this.getEquippedBadge();
    const avatarWraps = document.querySelectorAll('.btn-sign-in.signed-in, .profile-pic-section, .rewards-avatar-wrapper');
    
    avatarWraps.forEach(wrap => {
      let badgeEl = wrap.querySelector('.profile-corner-badge');
      if (badge) {
        if (!badgeEl) {
          badgeEl = document.createElement('img');
          badgeEl.className = 'profile-corner-badge';
          wrap.appendChild(badgeEl);
        }
        badgeEl.src = badge.image;
        badgeEl.alt = badge.name;
        badgeEl.title = `${badge.name} (${badge.tierName})`;
        badgeEl.setAttribute('data-tier', badge.id);
        badgeEl.style.boxShadow = `0 0 10px ${badge.glowColor}`;
      } else if (badgeEl) {
        badgeEl.remove();
      }
    });
  }

  openRewardsModal() {
    let modal = document.getElementById('rewards-stats-modal');
    if (!modal) {
      this.injectModalHTML();
      modal = document.getElementById('rewards-stats-modal');
    }
    this.renderModalContent();
    modal.classList.remove('hidden');
  }

  closeRewardsModal() {
    const modal = document.getElementById('rewards-stats-modal');
    if (modal) modal.classList.add('hidden');
  }

  injectModalHTML() {
    const html = `
      <div class="auth-overlay hidden" id="rewards-stats-modal" role="dialog" aria-modal="true" aria-label="Rewards and Stats">
        <div class="auth-card rewards-modal-card">
          <button class="auth-close rewards-close" type="button" aria-label="Close">×</button>
          <p class="auth-eyebrow">ZR BEATS REWARDS</p>
          <h2 class="rewards-modal-title">🏆 Rewards & Stats</h2>
          <p class="auth-copy">Listen to music to unlock and equip rare fruit badges!</p>
          
          <div id="rewards-modal-body"></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    document.querySelector('.rewards-close')?.addEventListener('click', () => this.closeRewardsModal());
    document.getElementById('rewards-stats-modal')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('rewards-stats-modal')) {
        this.closeRewardsModal();
      }
    });
  }

  renderModalContent() {
    const container = document.getElementById('rewards-modal-body');
    if (!container) return;

    const stats = this.getStats();
    const songsPlayed = stats.songsPlayed || 0;
    const equipped = this.getEquippedBadge();
    const unlocked = this.getUnlockedBadges();

    // Next badge target
    const nextBadge = BADGE_TIERS.find(b => songsPlayed < b.requiredSongs);

    // Profile photo
    const user = window.SpotifyApp?.auth?.currentUser;
    const localPic = user ? localStorage.getItem(`zr_profile_pic_${user.uid}`) : null;
    const defaultAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80';
    const avatarUrl = localPic || user?.photoURL || defaultAvatar;

    container.innerHTML = `
      <!-- User Overview Card -->
      <div class="rewards-user-overview">
        <div class="rewards-avatar-wrapper">
          <img src="${avatarUrl}" class="rewards-user-img" alt="Profile" />
          ${equipped ? `
            <img src="${equipped.image}" class="profile-corner-badge modal-corner-badge" title="${equipped.name}" style="box-shadow: 0 0 12px ${equipped.glowColor}" />
          ` : ''}
        </div>
        <div class="rewards-user-meta">
          <h3 class="rewards-user-name">${user?.displayName || 'Music Listener'}</h3>
          <div class="rewards-equipped-tag" style="color: ${equipped ? equipped.color : '#999'}">
            ${equipped ? `⭐ Active Badge: <strong>${equipped.name}</strong>` : 'No badge equipped yet'}
          </div>
          <div class="rewards-count-pill">
            🎵 Total Songs Played: <strong style="color:#fff; font-size:16px;">${songsPlayed}</strong>
          </div>
        </div>
      </div>

      <!-- Next Tier Progress -->
      ${nextBadge ? `
        <div class="rewards-progress-box">
          <div class="rewards-progress-header">
            <span>Next Goal: <strong>${nextBadge.name}</strong></span>
            <span><strong>${songsPlayed}</strong> / ${nextBadge.requiredSongs} Songs</span>
          </div>
          <div class="rewards-progress-track">
            <div class="rewards-progress-fill" style="width: ${Math.min(100, (songsPlayed / nextBadge.requiredSongs) * 100)}%; background: ${nextBadge.color}; box-shadow: 0 0 10px ${nextBadge.glowColor};"></div>
          </div>
          <div class="rewards-progress-sub">
            Only <strong>${nextBadge.requiredSongs - songsPlayed}</strong> more songs to unlock!
          </div>
        </div>
      ` : `
        <div class="rewards-progress-box maxed">
          🎉 <strong>Max Tier Achieved!</strong> You have unlocked all badges including the Ultra Rare Mythic Green Fruit!
        </div>
      `}

      <!-- Badge Showcase Grid -->
      <div class="rewards-badges-grid">
        ${BADGE_TIERS.map(badge => {
          const isUnlocked = songsPlayed >= badge.requiredSongs;
          const isEquipped = equipped && equipped.id === badge.id;
          const progressPercent = Math.min(100, Math.round((songsPlayed / badge.requiredSongs) * 100));

          return `
            <div class="badge-card ${isUnlocked ? 'unlocked' : 'locked'} ${isEquipped ? 'equipped' : ''} ${badge.isRare ? 'rare-badge' : ''}" style="--badge-color: ${badge.color}; --badge-glow: ${badge.glowColor};">
              ${badge.isRare ? `<span class="badge-rare-ribbon">⭐ ULTRA RARE</span>` : ''}
              <div class="badge-img-box">
                <img src="${badge.image}" alt="${badge.name}" class="badge-display-img ${isUnlocked ? '' : 'locked-img'}" />
                ${!isUnlocked ? `<div class="badge-lock-overlay">🔒</div>` : ''}
              </div>
              <h4 class="badge-card-name">${badge.name}</h4>
              <p class="badge-card-tier">${badge.tierName}</p>
              <div class="badge-card-req">Goal: <strong>${badge.requiredSongs} Songs</strong></div>
              
              ${isUnlocked ? `
                <button type="button" class="btn-badge-action ${isEquipped ? 'btn-equipped' : 'btn-equip'}" data-action="equip-badge" data-badge-id="${badge.id}">
                  ${isEquipped ? '✓ Equipped' : 'Equip Badge'}
                </button>
              ` : `
                <div class="badge-mini-progress">
                  <div class="badge-mini-fill" style="width:${progressPercent}%;"></div>
                  <span>${songsPlayed}/${badge.requiredSongs}</span>
                </div>
              `}
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Bind equip buttons
    container.querySelectorAll('[data-action="equip-badge"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const bId = e.currentTarget.getAttribute('data-badge-id');
        this.equipBadge(bId);
      });
    });
  }
}

export const rewardsManager = new RewardsManager();

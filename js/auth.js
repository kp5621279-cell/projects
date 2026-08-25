/**
 * ZR Web Desktop Clone - Firebase Auth Manager
 * Handles Google sign-in, email/password auth, and UI sync.
 */

import {
  signInWithPopup, GoogleAuthProvider,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut, onAuthStateChanged,
  updateProfile, updateEmail, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import { storage, auth } from './storage.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js';

const AUTH_DETAILS_LOTTIE_URL = 'https://lottie.host/59c8ffb0-475e-4ded-8b67-daf0b4e419c9/v7ZGjorg5f.json';

function injectLoadingOverlay() {
  if (document.getElementById('auth-details-loader')) return;

  document.body.insertAdjacentHTML('beforeend', `
    <div class="auth-details-loader hidden" id="auth-details-loader" aria-live="polite" aria-label="Loading user details">
      <div class="auth-loader-card">
        <div class="auth-loader-animation" id="auth-loader-animation"></div>
        <p>Loading your profile details…</p>
      </div>
    </div>
  `);
}

export function showAuthDetailsLoader(customMessage = 'Loading your profile details…') {
  injectLoadingOverlay();
  const overlay = document.getElementById('auth-details-loader');
  const animationHost = document.getElementById('auth-loader-animation');
  const messageNode = overlay?.querySelector('p');
  if (messageNode) {
    messageNode.textContent = customMessage;
  }
  if (!overlay || !animationHost) return null;

  overlay.classList.remove('hidden');

  if (window.lottie && !animationHost.__zrLottie) {
    animationHost.__zrLottie = window.lottie.loadAnimation({
      container: animationHost,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: AUTH_DETAILS_LOTTIE_URL
    });
  }

  return overlay;
}

export function hideAuthDetailsLoader() {
  const overlay = document.getElementById('auth-details-loader');
  if (!overlay) return;
  overlay.classList.add('hidden');
}

function waitForUserDetailsFetch() {
  return new Promise((resolve) => {
    const overlay = showAuthDetailsLoader();
    setTimeout(() => {
      hideAuthDetailsLoader();
      resolve();
    }, 4000);

    if (overlay) {
      overlay.dataset.timer = String(setTimeout(() => {
        hideAuthDetailsLoader();
        resolve();
      }, 4000));
    }
  });
}

function getUserFacingAuthError(message, fallback = 'Something went wrong. Please try again.') {
  const text = String(message || fallback).trim();
  const lower = text.toLowerCase();

  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return { title: 'Too Many Attempts', msg: 'Too many sign-up attempts. Please wait a moment and try again.' };
  }
  if (lower.includes('invalid-credential') || lower.includes('invalid login credentials') || lower.includes('wrong-password') || lower.includes('user-not-found') || lower.includes('invalid-email')) {
    return { title: 'Incorrect Credentials', msg: 'Email or password is incorrect. Please check and try again.' };
  }
  if (lower.includes('email-already-in-use') || lower.includes('user already registered') || lower.includes('already exists')) {
    return { title: 'Account Already Exists', msg: 'An account with this email already exists. Please sign in instead.' };
  }
  if (lower.includes('email not confirmed') || lower.includes('confirm your email')) {
    return { title: 'Email Not Verified', msg: 'Please verify your email before signing in. Check your inbox.' };
  }
  if (lower.includes('weak-password') || lower.includes('password')) {
    return { title: 'Weak Password', msg: 'Password must be at least 6 characters long.' };
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return { title: 'Network Error', msg: 'Could not connect. Check your internet and try again.' };
  }
  if (lower.includes('popup-closed')) {
    return { title: 'Cancelled', msg: 'Sign-in was cancelled. Try again when ready.' };
  }

  return { title: 'Error', msg: text || fallback };
}

export async function isUserSignedIn() {
  return !!auth.currentUser;
}

export function setupAuth(ui) {
  const signInButton = document.querySelector('.btn-sign-in');
  const getStartedButton = document.getElementById('btn-yt-add-quick');
  if (!signInButton) return;

  const syncAuthUI = (user) => {
    const isSignedIn = !!user;
    if (getStartedButton) {
      getStartedButton.style.display = isSignedIn ? 'none' : '';
    }

    const _defaultAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80';
    const _avatarImg = document.querySelector('.user-avatar-img');

    if (isSignedIn) {
      const displayName = user.displayName || user.email || 'Account';
      const buttonLabel = displayName.includes('@') ? displayName.split('@')[0].trim() : displayName.trim() || 'Account';
      signInButton.textContent = buttonLabel;
      signInButton.title = 'Account';
      signInButton.classList.add('signed-in');
      signInButton.setAttribute('aria-expanded', 'false');
      if (_avatarImg) _avatarImg.src = user.photoURL || _defaultAvatar;
    } else {
      signInButton.textContent = 'Sign In';
      signInButton.title = 'Sign in';
      signInButton.classList.remove('signed-in');
      signInButton.setAttribute('aria-expanded', 'false');
      if (_avatarImg) _avatarImg.src = _defaultAvatar;
    }
  };

  document.body.insertAdjacentHTML('beforeend', `
    <div class="account-menu hidden" id="account-menu" role="menu" aria-label="Account menu">
      <button type="button" id="edit-profile-btn" class="account-menu-item account-menu-item-top">✏️ Edit Profile</button>
      <div class="account-menu-divider"></div>
      <button type="button" id="logout-account-btn" class="account-menu-item">Log out</button>
    </div>
    <div class="auth-overlay hidden" id="auth-modal">
      <div class="auth-card">
        <button class="auth-close" type="button" aria-label="Close">×</button>
        <p class="auth-eyebrow">ZR BEATS</p>
        <h2 id="auth-title">Welcome back</h2>
        <p class="auth-copy" id="auth-copy">Sign in to save your music and playlists.</p>
        <button class="auth-google" id="auth-google" type="button"><span>G</span> Continue with Google</button>
        <div class="auth-divider"><span>or continue with email</span></div>
        <form id="auth-form">
          <label>Email<input id="auth-email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
          <label>Password<input id="auth-password" type="password" autocomplete="current-password" minlength="6" required placeholder="At least 6 characters"></label>
          <button type="button" class="auth-forgot-link" id="auth-forgot-btn">Forgot password?</button>
          <button class="auth-submit" id="auth-submit" type="submit">Sign In</button>
        </form>
        <p class="auth-switch"><span id="auth-switch-copy">New here?</span> <button id="auth-mode-toggle" type="button">Create an account</button></p>
      </div>
    </div>
    <div class="auth-overlay hidden" id="reset-password-modal">
      <div class="auth-card">
        <button class="auth-close reset-close" type="button" aria-label="Close">×</button>
        <p class="auth-eyebrow">ZR BEATS</p>
        <h2>Reset Password</h2>
        <p class="auth-copy">Enter your email and we'll send you a reset link.</p>
        <form id="reset-password-form">
          <label>Email<input id="reset-email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
          <button class="auth-submit" id="reset-submit" type="submit">Send Reset Link</button>
        </form>
        <p class="auth-note" style="font-size:11px;color:#999;text-align:center;margin:12px 0 0;line-height:1.5;"> Didn't receive the email? Check your <strong>Spam/Junk</strong> folder. </p>
        <p class="auth-switch"><button id="reset-back-btn" type="button">← Back to Sign In</button></p>
      </div>
    </div>
    <div class="auth-overlay hidden" id="edit-profile-modal">
      <div class="auth-card edit-profile-card">
        <button class="auth-close edit-profile-close" type="button" aria-label="Close">×</button>
        <p class="auth-eyebrow">ZR BEATS</p>
        <h2>Edit Profile</h2>
        <p class="auth-copy">Update your profile information.</p>
        <form id="edit-profile-form">
          <div class="profile-pic-section">
            <img id="profile-pic-preview" src="" class="profile-pic-preview" alt="Profile" />
            <label class="profile-pic-upload-btn" for="profile-pic-file">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
              Choose Photo
            </label>
            <small class="profile-pic-hint">PNG, JPG, WEBP up to 5MB</small>
            <input type="file" id="profile-pic-file" accept="image/*" style="display:none;" />
            <input id="profile-pic-input" type="hidden" value="" />
          </div>
          <label class="edit-profile-label">Display Name
            <input id="profile-name-input" type="text" class="edit-profile-input" placeholder="Your name" />
          </label>
          <div id="profile-email-section">
            <label class="edit-profile-label">Email
              <input id="profile-email-input" type="email" class="edit-profile-input" placeholder="you@example.com" />
            </label>
          </div>
          <div id="profile-password-section">
            <label class="edit-profile-label">New Password
              <input id="profile-password-input" type="password" class="edit-profile-input" placeholder="Leave blank to keep current" />
            </label>
          </div>
          <div id="profile-reauth-section" style="display:none;">
            <label class="edit-profile-label">Current Password (required for changes)
              <input id="profile-current-password" type="password" class="edit-profile-input" placeholder="Enter current password" />
            </label>
          </div>
          <button class="auth-submit" id="profile-save-btn" type="submit">Save Changes</button>
        </form>
      </div>
    </div>
  `);

  const modal = document.getElementById('auth-modal');
  const form = document.getElementById('auth-form');
  let mode = 'signin';

  const show = (nextMode = 'signin') => {
    mode = nextMode;
    document.getElementById('auth-title').textContent = mode === 'signup' ? 'Create your account' : 'Welcome back';
    document.getElementById('auth-copy').textContent = mode === 'signup'
      ? 'Use your email and password. We will send an email confirmation.'
      : 'Sign in to save your music and playlists.';
    document.getElementById('auth-submit').textContent = mode === 'signup' ? 'Create account' : 'Sign In';
    document.getElementById('auth-switch-copy').textContent = mode === 'signup' ? 'Already have an account?' : 'New here?';
    document.getElementById('auth-mode-toggle').textContent = mode === 'signup' ? 'Sign in' : 'Create an account';
    modal.classList.remove('hidden');
  };

  const accountMenu = document.getElementById('account-menu');
  const toggleAccountMenu = (forceOpen = null) => {
    if (!accountMenu) return;
    const shouldOpen = forceOpen ?? !accountMenu.classList.contains('hidden');
    accountMenu.classList.toggle('hidden', !shouldOpen);
    signInButton.setAttribute('aria-expanded', String(shouldOpen));
  };

  signInButton.addEventListener('click', async () => {
    if (auth.currentUser) {
      const isHidden = accountMenu?.classList.contains('hidden');
      toggleAccountMenu(isHidden);
      return;
    }
    show('signin');
  });

  getStartedButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    if (auth.currentUser) return;
    show('signup');
  });

  modal.querySelector('.auth-close').addEventListener('click', () => {
    modal.classList.add('hidden');
    form.reset();
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.classList.add('hidden');
      form.reset();
    }
  });

  document.getElementById('auth-mode-toggle').addEventListener('click', () => show(mode === 'signup' ? 'signin' : 'signup'));

  // --- Forgot Password ---
  const resetModal = document.getElementById('reset-password-modal');
  const resetForm = document.getElementById('reset-password-form');

  document.getElementById('auth-forgot-btn')?.addEventListener('click', () => {
    modal.classList.add('hidden');
    resetModal.classList.remove('hidden');
    // Pre-fill email if already typed
    const currentEmail = document.getElementById('auth-email')?.value?.trim();
    if (currentEmail) document.getElementById('reset-email').value = currentEmail;
  });

  document.getElementById('reset-back-btn')?.addEventListener('click', () => {
    resetModal.classList.add('hidden');
    modal.classList.remove('hidden');
  });

  resetModal.querySelector('.reset-close')?.addEventListener('click', () => {
    resetModal.classList.add('hidden');
    resetForm.reset();
  });

  resetModal.addEventListener('click', (event) => {
    if (event.target === resetModal) {
      resetModal.classList.add('hidden');
      resetForm.reset();
    }
  });

  resetForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const emailInput = document.getElementById('reset-email');
    const submitBtn = document.getElementById('reset-submit');
    const email = emailInput.value.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ui.showToast('Please enter a valid email address.', 3500, 'warning');
      emailInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      await sendPasswordResetEmail(auth, email);
      resetModal.classList.add('hidden');
      resetForm.reset();
      ui.showToast('Reset link sent! Check your Inbox — if not there, check Spam/Junk folder.', 6000, 'success');
    } catch (error) {
      let msg = 'Could not send reset link.';
      const code = error.code || '';
      if (code.includes('user-not-found')) {
        msg = 'No account found with this email. Please check your email address.';
      } else if (code.includes('invalid-email')) {
        msg = 'Invalid email address. Please enter a valid email.';
      } else if (code.includes('too-many-requests')) {
        msg = 'Too many attempts. Please wait a few minutes and try again.';
      } else if (code.includes('network') || code.includes('fetch')) {
        msg = 'Network error. Please check your internet connection.';
      } else {
        msg = 'Error: ' + (error.message || 'Could not send reset link.');
      }
      ui.showToast(msg, 5000, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Reset Link';
    }
  });

  document.getElementById('logout-account-btn')?.addEventListener('click', async () => {
    try {
      await signOut(auth);
      toggleAccountMenu(false);
      ui.showToast('Signed out successfully.', 3000, 'success');
    } catch (error) {
      ui.showToast(error.message, 4000, 'error');
    }
  });

  // --- Edit Profile ---
  const _epDefaultAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80';
  const _epPreview = document.getElementById('profile-pic-preview');
  const _epPicInput = document.getElementById('profile-pic-input');
  if (_epPreview) {
    _epPreview.addEventListener('error', () => { _epPreview.src = _epDefaultAvatar; });
  }
  if (_epPicInput && _epPreview) {
    _epPicInput.addEventListener('input', () => {
      _epPreview.src = _epPicInput.value.trim() || _epDefaultAvatar;
    });
  }

  function _resizeImage(file, maxW, maxH) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > h) { if (w > maxW) { h *= maxW / w; w = maxW; } }
          else { if (h > maxH) { w *= maxH / h; h = maxH; } }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const _epFileInput = document.getElementById('profile-pic-file');
  if (_epFileInput) {
    _epFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { ui.showToast('Please select an image file.', 3000, 'warning'); return; }
      if (file.size > 5 * 1024 * 1024) { ui.showToast('Image must be under 5MB.', 3000, 'warning'); return; }

      const uploadBtn = document.querySelector('.profile-pic-upload-btn');
      const preview = document.getElementById('profile-pic-preview');
      const picInput = document.getElementById('profile-pic-input');

      // Instantly show a local blob preview — no waiting
      const blobUrl = URL.createObjectURL(file);
      if (preview) preview.src = blobUrl;

      // Show "Processing..." briefly
      if (uploadBtn) { uploadBtn.innerHTML = '<span style="opacity:0.7">Processing...</span>'; uploadBtn.style.pointerEvents = 'none'; }

      try {
        const resizedDataURL = await _resizeImage(file, 200, 200);
        // Swap preview from blob to final resized data URL
        if (preview) preview.src = resizedDataURL;
        if (picInput) picInput.value = resizedDataURL;
        ui.showToast('Profile picture ready! Click Save Changes.', 3000, 'success');
      } catch (err) {
        console.warn('Image processing failed:', err);
        // Use blob URL as fallback — still works locally
        if (picInput) picInput.value = blobUrl;
        ui.showToast('Image loaded (original size). Click Save Changes.', 3000, 'info');
      } finally {
        if (uploadBtn) {
          uploadBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg> Change Photo';
          uploadBtn.style.pointerEvents = '';
        }
        _epFileInput.value = '';
      }
    });
  }

  const _reauthCheck = () => {
    const user = auth.currentUser;
    if (!user) return;
    const eInput = document.getElementById('profile-email-input');
    const pInput = document.getElementById('profile-password-input');
    if (!eInput || !pInput) return;
    const emailChanged = eInput.value.trim() !== user.email;
    const passwordChanged = pInput.value.length > 0;
    const sec = document.getElementById('profile-reauth-section');
    if (sec) sec.style.display = (emailChanged || passwordChanged) ? '' : 'none';
  };
  document.getElementById('profile-email-input')?.addEventListener('input', _reauthCheck);
  document.getElementById('profile-password-input')?.addEventListener('input', _reauthCheck);

  function _openEditProfile() {
    const user = auth.currentUser;
    if (!user) return;
    const modal = document.getElementById('edit-profile-modal');
    const preview = document.getElementById('profile-pic-preview');
    const picInput = document.getElementById('profile-pic-input');
    const nameInput = document.getElementById('profile-name-input');
    const emailInput = document.getElementById('profile-email-input');
    const passwordInput = document.getElementById('profile-password-input');
    const currentPasswordInput = document.getElementById('profile-current-password');

    preview.src = user.photoURL || _epDefaultAvatar;
    picInput.value = user.photoURL || '';
    nameInput.value = user.displayName || '';
    emailInput.value = user.email || '';
    passwordInput.value = '';
    currentPasswordInput.value = '';

    document.getElementById('profile-email-section').style.display = '';
    document.getElementById('profile-password-section').style.display = '';
    document.getElementById('profile-reauth-section').style.display = 'none';

    const passwordField = document.getElementById('profile-password-input');
    if (passwordField) {
      passwordField.setAttribute('placeholder', 'Enter new password');
    }

    modal.classList.remove('hidden');
  }

  async function _saveProfile() {
    const user = auth.currentUser;
    if (!user) return;
    const saveBtn = document.getElementById('profile-save-btn');
    const newPhotoInput = document.getElementById('profile-pic-input');
    const newPhotoURL = newPhotoInput ? newPhotoInput.value.trim() : '';
    const newName = document.getElementById('profile-name-input').value.trim();
    const newEmail = document.getElementById('profile-email-input').value.trim();
    const newPassword = document.getElementById('profile-password-input').value;
    const currentPassword = document.getElementById('profile-current-password').value;
    const emailChanged = newEmail !== user.email;
    const passwordChanged = newPassword.length > 0;
    const finalPhotoURL = newPhotoURL || user.photoURL || null;

    if (!newName) { ui.showToast('Display name cannot be empty.', 3000, 'warning'); document.getElementById('profile-name-input').focus(); return; }
    if ((emailChanged || passwordChanged) && !currentPassword) { ui.showToast('Current password is required for email/password changes.', 4000, 'warning'); document.getElementById('profile-current-password').focus(); return; }
    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { ui.showToast('Please enter a valid email address.', 3500, 'warning'); return; }
    if (newPassword && newPassword.length < 6) { ui.showToast('Password must be at least 6 characters.', 3500, 'warning'); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      if (emailChanged || passwordChanged) {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
      }
      await updateProfile(user, { displayName: newName, photoURL: finalPhotoURL });
      if (emailChanged) await updateEmail(user, newEmail);
      if (passwordChanged) await updatePassword(user, newPassword);
      syncAuthUI(auth.currentUser);
      document.getElementById('edit-profile-modal').classList.add('hidden');
      ui.showToast('Profile updated successfully!', 3000, 'success');
    } catch (error) {
      let msg = error.message || 'Could not update profile.';
      const code = error.code || '';
      if (code.includes('wrong-password') || code.includes('invalid-credential')) msg = 'Current password is incorrect.';
      else if (code.includes('email-already-in-use')) msg = 'This email is already in use.';
      else if (code.includes('invalid-email')) msg = 'Invalid email address.';
      else if (code.includes('weak-password')) msg = 'Password must be at least 6 characters.';
      else if (code.includes('requires-recent-login')) msg = 'Please sign out and sign in again first.';
      ui.showToast(msg, 4500, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  }

  document.getElementById('edit-profile-btn')?.addEventListener('click', () => {
    toggleAccountMenu(false);
    _openEditProfile();
  });
  document.getElementById('edit-profile-form')?.addEventListener('submit', (e) => { e.preventDefault(); _saveProfile(); });
  document.querySelector('.edit-profile-close')?.addEventListener('click', () => { document.getElementById('edit-profile-modal').classList.add('hidden'); });
  document.getElementById('edit-profile-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('edit-profile-modal')) document.getElementById('edit-profile-modal').classList.add('hidden');
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.btn-sign-in') && !event.target.closest('#account-menu')) {
      toggleAccountMenu(false);
    }
  });

  // Google Sign-In
  document.getElementById('auth-google').addEventListener('click', async () => {
    showAuthDetailsLoader();
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      modal.classList.add('hidden');
      await waitForUserDetailsFetch();
      ui.showToast('Signed in with Google! Welcome.', 4000, 'success');
    } catch (error) {
      hideAuthDetailsLoader();
      if (error.code !== 'auth/popup-closed-by-user') {
        const err = getUserFacingAuthError(error.message, 'Google sign-in failed.');
        ui.showToast(err.msg, 4500, 'error');
      }
    }
  });

  // Email/Password Form
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const submitButton = document.getElementById('auth-submit');
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ui.showToast('Please enter a valid email address.', 3500, 'warning');
      emailInput.focus();
      return;
    }

    if (password.length < 6) {
      ui.showToast('Password must be at least 6 characters long.', 3500, 'warning');
      passwordInput.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = mode === 'signup' ? 'Creating account...' : 'Signing in...';

    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password);
        modal.classList.add('hidden');
        await waitForUserDetailsFetch();
        ui.showToast('Account created successfully! Welcome to ZR Beats.', 4000, 'success');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        modal.classList.add('hidden');
        await waitForUserDetailsFetch();
        ui.showToast('Signed in successfully! Welcome back.', 4000, 'success');
      }
    } catch (error) {
      const err = getUserFacingAuthError(error.message, 'Unable to complete authentication.');
      ui.showToast(err.msg, 4500, 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = mode === 'signup' ? 'Create account' : 'Sign In';
    }
  });

  // Listen to auth state changes (Firebase handles this)
  onAuthStateChanged(auth, (user) => {
    syncAuthUI(user);
  });
}

import { storage, supabase } from './storage.js';

const getRedirectUrl = () => {
  const currentOrigin = window.location.origin;
  return currentOrigin && currentOrigin !== 'null' ? currentOrigin : 'http://localhost:8000';
};

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

  if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('email rate limit')) {
    return 'Too many sign-up attempts. Please wait a moment and try again.';
  }

  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return 'Incorrect email or password.';
  }

  if (lower.includes('user already registered') || lower.includes('already exists')) {
    return 'An account with this email already exists.';
  }

  if (lower.includes('email not confirmed') || lower.includes('confirm your email')) {
    return 'Please confirm your email before signing in.';
  }

  return text || fallback;
}

export async function isUserSignedIn() {
  const { data } = await supabase.auth.getSession();
  return !!data.session?.user?.email;
}

export function setupAuth(ui) {
  const signInButton = document.querySelector('.btn-sign-in');
  const getStartedButton = document.getElementById('btn-yt-add-quick');
  if (!signInButton) return;

  const syncAuthUI = (session) => {
    const isSignedIn = !!session?.user?.email;
    if (getStartedButton) {
      getStartedButton.style.display = isSignedIn ? 'none' : '';
    }

    if (isSignedIn) {
      const user = session.user;
      const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Account';
      const buttonLabel = displayName.includes('@') ? displayName.split('@')[0].trim() : displayName.trim() || 'Account';
      signInButton.textContent = buttonLabel;
      signInButton.title = 'Account';
      signInButton.classList.add('signed-in');
      signInButton.setAttribute('aria-expanded', 'false');
    } else {
      signInButton.textContent = 'Sign In';
      signInButton.title = 'Sign in';
      signInButton.classList.remove('signed-in');
      signInButton.setAttribute('aria-expanded', 'false');
    }
  };

  document.body.insertAdjacentHTML('beforeend', `
    <div class="account-menu hidden" id="account-menu" role="menu" aria-label="Account menu">
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
          <button class="auth-submit" id="auth-submit" type="submit">Sign In</button>
        </form>
        <button class="auth-otp-link" id="auth-otp-request" type="button">Use an email verification code instead</button>
        <form id="otp-form" class="hidden">
          <label>Verification code<input id="auth-otp" inputmode="numeric" maxlength="8" placeholder="Enter email code" required></label>
          <button class="auth-submit" type="submit">Verify code</button>
        </form>
        <p class="auth-switch"><span id="auth-switch-copy">New here?</span> <button id="auth-mode-toggle" type="button">Create an account</button></p>
      </div>
    </div>
  `);

  const modal = document.getElementById('auth-modal');
  const form = document.getElementById('auth-form');
  const otpForm = document.getElementById('otp-form');
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
    otpForm.classList.add('hidden');
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
    const session = (await supabase.auth.getSession()).data.session;
    if (session?.user?.email) {
      const isHidden = accountMenu?.classList.contains('hidden');
      toggleAccountMenu(isHidden);
      return;
    }
    show('signin');
  });
  getStartedButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    const session = (await supabase.auth.getSession()).data.session;
    if (session?.user?.email) return;
    show('signup');
  });
  modal.querySelector('.auth-close').addEventListener('click', () => {
    modal.classList.add('hidden');
    otpForm.classList.add('hidden');
    form.reset();
  });
  modal.addEventListener('click', (event) => { if (event.target === modal) {
    modal.classList.add('hidden');
    otpForm.classList.add('hidden');
    form.reset();
  } });
  document.getElementById('auth-mode-toggle').addEventListener('click', () => show(mode === 'signup' ? 'signin' : 'signup'));
  document.getElementById('logout-account-btn')?.addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    toggleAccountMenu(false);
    if (error) {
      ui.showToast(error.message);
      return;
    }
    ui.showToast('Signed out successfully.');
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.btn-sign-in') && !event.target.closest('#account-menu')) {
      toggleAccountMenu(false);
    }
  });

  document.getElementById('auth-google').addEventListener('click', async () => {
    const redirectTo = getRedirectUrl();
    showAuthDetailsLoader();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });

    if (error) {
      hideAuthDetailsLoader();
      ui.showToast(error.message);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const submitButton = document.getElementById('auth-submit');
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ui.showToast('Please enter a valid email address.');
      emailInput.focus();
      return;
    }

    if (password.length < 6) {
      ui.showToast('Password must be at least 6 characters long.');
      passwordInput.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = mode === 'signup' ? 'Creating account...' : 'Signing in...';

    try {
      const redirectTo = getRedirectUrl();
      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
        : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) {
        ui.showToast(getUserFacingAuthError(result.error.message, 'Unable to complete authentication.'));
        return;
      }

      if (mode === 'signup' && !result.data.session) {
        ui.showToast('Check your email to confirm your account.');
        form.reset();
        return;
      }

      modal.classList.add('hidden');
      await waitForUserDetailsFetch();
      ui.showToast('Signed in successfully.');
    } catch (error) {
      ui.showToast(getUserFacingAuthError(error?.message, 'Something went wrong. Please try again.'));
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = mode === 'signup' ? 'Create account' : 'Sign In';
    }
  });

  document.getElementById('auth-otp-request').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    if (!email) return ui.showToast('Enter your email address first.');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: getRedirectUrl()
      }
    });
    if (error) return ui.showToast(error.message);
    otpForm.classList.remove('hidden');
    ui.showToast('Verification code sent. Check your email.');
  });

  otpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const token = document.getElementById('auth-otp').value.trim();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) return ui.showToast(error.message);
    modal.classList.add('hidden');
    await waitForUserDetailsFetch();
    ui.showToast('Email verified and signed in.');
  });

  supabase.auth.onAuthStateChange(async (_event, session) => {
    storage.setCurrentUser(session?.user || null);
    if (session?.user) {
      await storage.syncUserDataFromSupabase();
    }
    syncAuthUI(session);
  });

  supabase.auth.getSession().then(async ({ data }) => {
    const session = data.session;
    storage.setCurrentUser(session?.user || null);
    if (session?.user) {
      await storage.syncUserDataFromSupabase();
    }
    syncAuthUI(session);
  });
}


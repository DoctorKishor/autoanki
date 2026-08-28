/**
 * googleDriveAuth.js - Google Identity Services (GIS) OAuth 2.0 Client & Session Manager
 *
 * Implements client-side OAuth 2.0 authentication for Google Drive API v3.
 * Stores auth session and tokens in IndexedDB (STORES.SETTINGS) without touching user data.
 */

import { getLocalSetting, saveLocalSetting } from './localDb.js';

export const DEFAULT_GOOGLE_CLIENT_ID = '373065987778-o11hmpkgtf3bncdvhcjiaq0qb66d11q6.apps.googleusercontent.com';

export const GOOGLE_DRIVE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file'
].join(' ');

export const GOOGLE_DRIVE_AUTH_KEY = 'google_drive_auth';

let gisScriptPromise = null;
let tokenClientInstance = null;
let currentClientId = null;

/**
 * Dynamically loads the Google Identity Services client script (https://accounts.google.com/gsi/client).
 * @returns {Promise<typeof google>}
 */
export function loadGoogleIdentityServices() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window is undefined'));
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve(window.google);
  }
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google);
        return;
      }
      existing.addEventListener('load', () => resolve(window.google));
      existing.addEventListener('error', (err) => reject(new Error('Failed to load Google Identity Services: ' + err.message)));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google);
      } else {
        reject(new Error('Google Identity Services SDK loaded but accounts.oauth2 not found.'));
      }
    };
    script.onerror = () => reject(new Error('Network error loading Google Identity Services SDK'));
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

/**
 * Resolves the active Google Client ID with hierarchical fallback:
 * 1. Custom client ID saved in settings
 * 2. VITE_GOOGLE_CLIENT_ID env variable
 * 3. Default embedded Client ID
 * @returns {Promise<string>}
 */
export async function getActiveGoogleClientId() {
  try {
    const customId = await getLocalSetting('custom_google_client_id');
    if (customId && typeof customId === 'string' && customId.trim().length > 0) {
      return customId.trim();
    }
  } catch (e) {
    console.warn('[GoogleAuth] Failed to read custom client ID from LocalDB:', e);
  }

  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) {
    return import.meta.env.VITE_GOOGLE_CLIENT_ID;
  }

  return DEFAULT_GOOGLE_CLIENT_ID;
}

/**
 * Saves a user-defined custom Google Client ID to LocalDB.
 * @param {string} clientId 
 */
export async function saveCustomGoogleClientId(clientId) {
  const cleanId = (clientId || '').trim();
  await saveLocalSetting('custom_google_client_id', cleanId);
  tokenClientInstance = null; // Invalidate cached token client
  currentClientId = null;
  return cleanId;
}

/**
 * Retrieves the currently persisted Google Drive authentication session.
 * Checks IndexedDB settings first, falling back to localStorage cache to guarantee persistence across sessions.
 * @returns {Promise<object|null>}
 */
export async function getGoogleDriveAuthState() {
  try {
    const authState = await getLocalSetting(GOOGLE_DRIVE_AUTH_KEY, null);
    if (!authState || typeof authState !== 'object') return null;
    return authState;
  } catch (err) {
    console.warn('[GoogleAuth] Error reading auth state from IndexedDB:', err);
    return null;
  }
}

/**
 * Saves Google Drive auth state to LocalDB and non-sensitive status marker to localStorage.
 * @param {object} authState 
 */
export async function saveGoogleDriveAuthState(authState) {
  try {
    await saveLocalSetting(GOOGLE_DRIVE_AUTH_KEY, authState);
    // FIX-19: Store only a non-sensitive marker in localStorage without exposing OAuth access tokens
    if (typeof localStorage !== 'undefined') {
      if (authState && authState.accessToken) {
        const safeMarker = {
          connected: true,
          email: authState.user?.email || '',
          name: authState.user?.name || '',
          connectedAt: authState.connectedAt || new Date().toISOString()
        };
        localStorage.setItem('autoanki_gdrive_auth', JSON.stringify(safeMarker));
      } else {
        localStorage.removeItem('autoanki_gdrive_auth');
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gdrive-auth-changed', { detail: authState }));
    }
    return authState;
  } catch (err) {
    console.error('[GoogleAuth] Error saving auth state to LocalDB:', err);
    throw err;
  }
}

/**
 * Fetches basic user profile info from Google OAuth2 userinfo endpoint.
 * @param {string} accessToken 
 * @returns {Promise<{ id: string, name: string, email: string, picture: string }>}
 */
export async function fetchGoogleUserProfile(accessToken) {
  if (!accessToken) throw new Error('Access token is required to fetch user profile.');
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Google user profile: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return {
    id: data.sub || data.id,
    name: data.name || data.given_name || 'Google User',
    email: data.email || '',
    picture: data.picture || ''
  };
}

/**
 * Fetches Google Drive storage quota and user about info.
 * @param {string} accessToken 
 * @returns {Promise<{ limit: number, usage: number, usageInDrive: number, usageInDriveTrash: number }>}
 */
export async function getGoogleDriveStorageQuota(accessToken) {
  if (!accessToken) return null;
  try {
    const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      console.warn('[GoogleAuth] Could not fetch storage quota:', response.status);
      return null;
    }
    const data = await response.json();
    const quota = data.storageQuota || {};
    return {
      limit: quota.limit ? Number(quota.limit) : 0,
      usage: quota.usage ? Number(quota.usage) : 0,
      usageInDrive: quota.usageInDrive ? Number(quota.usageInDrive) : 0,
      usageInDriveTrash: quota.usageInDriveTrash ? Number(quota.usageInDriveTrash) : 0
    };
  } catch (err) {
    console.error('[GoogleAuth] Error fetching Drive storage quota:', err);
    return null;
  }
}

/**
 * Initializes or reuses the Google Identity Services OAuth 2.0 token client.
 * @param {string} [customClientId]
 * @returns {Promise<object>}
 */
export async function initGoogleTokenClient(customClientId = null) {
  const google = await loadGoogleIdentityServices();
  const clientId = customClientId || (await getActiveGoogleClientId());

  if (tokenClientInstance && currentClientId === clientId) {
    return tokenClientInstance;
  }

  currentClientId = clientId;
  return new Promise((resolve) => {
    tokenClientInstance = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPES,
      callback: () => {} // Callback is overridden per request in requestGoogleDriveToken
    });
    resolve(tokenClientInstance);
  });
}

/**
 * Initiates the Google OAuth 2.0 token flow. Uses email hint and empty prompt where possible
 * to reuse existing authorization without prompting the user repeatedly.
 * @param {object} [options]
 * @param {string} [options.prompt] '' | 'select_account' | 'consent'
 * @param {string} [options.hint] User's email to bypass account selector
 * @param {number} [options.timeoutMs] Optional timeout in milliseconds
 * @returns {Promise<object>} Fresh auth state { accessToken, expiresAt, user }
 */
export async function requestGoogleDriveToken({ prompt = '', hint = '', timeoutMs = 15000 } = {}) {
  const tokenClient = await initGoogleTokenClient();
  const existingState = await getGoogleDriveAuthState();
  const userHint = hint || existingState?.user?.email || '';

  return new Promise((resolve, reject) => {
    let timer = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        reject(new Error('Google OAuth token request timed out.'));
      }, timeoutMs);
    }

    tokenClient.callback = async (resp) => {
      if (timer) clearTimeout(timer);

      if (resp.error) {
        console.debug('[GoogleAuth] OAuth response error:', resp.error, resp.error_description);
        reject(new Error(resp.error_description || resp.error || 'Google authentication was cancelled or failed.'));
        return;
      }

      try {
        const accessToken = resp.access_token;
        const expiresInSec = Number(resp.expires_in) || 3599;
        const expiresAt = Date.now() + (expiresInSec * 1000);

        // Fetch basic profile info if not already cached
        let userProfile = existingState?.user || { name: 'Google User', email: userHint, picture: '' };
        try {
          const freshProfile = await fetchGoogleUserProfile(accessToken);
          if (freshProfile?.name) userProfile = freshProfile;
        } catch (profileErr) {
          console.warn('[GoogleAuth] Could not fetch profile, keeping existing profile:', profileErr);
        }

        const authState = {
          accessToken,
          expiresAt,
          scope: resp.scope || GOOGLE_DRIVE_SCOPES,
          tokenType: resp.token_type || 'Bearer',
          user: userProfile,
          connectedAt: existingState?.connectedAt || new Date().toISOString(),
          clientId: currentClientId
        };

        await saveGoogleDriveAuthState(authState);
        resolve(authState);
      } catch (err) {
        reject(err);
      }
    };

    const requestConfig = {
      prompt: prompt !== undefined ? prompt : ''
    };
    if (userHint) requestConfig.hint = userHint;

    try {
      tokenClient.requestAccessToken(requestConfig);
    } catch (reqErr) {
      if (timer) clearTimeout(timer);
      reject(reqErr);
    }
  });
}

let tokenRefreshPromise = null;

/**
 * Checks if the Google Drive access token is expired or expiring within 5 minutes.
 * @param {object} state
 * @returns {boolean}
 */
export function isGoogleDriveTokenExpired(state) {
  if (!state || !state.accessToken) return true;
  if (!state.expiresAt) return false;
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // 5 minute proactive renewal buffer
  return state.expiresAt - now < bufferMs;
}

/**
 * Returns a valid, unexpired access token for Google Drive API requests.
 * Automatically performs silent background renewal using tokenClient.requestAccessToken({ prompt: '' })
 * without disturbing the user or opening popups.
 * Only triggers an interactive prompt if interactive=true and silent background renewal fails.
 * @param {boolean} [interactive=false]
 * @returns {Promise<string|null>}
 */
export async function getValidAccessToken(interactive = false) {
  const state = await getGoogleDriveAuthState();
  if (!state || (!state.accessToken && !state.user?.email)) return null;

  const isExpiring = isGoogleDriveTokenExpired(state);

  // 1. If token is completely valid and not expiring, return immediately
  if (!isExpiring && state.accessToken) {
    return state.accessToken;
  }

  // 2. Attempt silent background renewal first (no popups, prompt: '')
  try {
    const silentToken = await renewGoogleDriveToken('', 8000);
    if (silentToken) {
      return silentToken;
    }
  } catch (e) {
    console.debug('[GoogleAuth] Silent background token renewal unavailable:', e?.message || e);
  }

  // 3. If silent renewal failed and interactive prompt is permitted (e.g. user clicked Sync button)
  if (interactive) {
    try {
      const interactiveToken = await renewGoogleDriveToken('select_account', 60000);
      if (interactiveToken) {
        return interactiveToken;
      }
    } catch (interactiveErr) {
      console.warn('[GoogleAuth] Interactive token renewal failed:', interactiveErr);
    }
  }

  // 4. Fallback: If not strictly expired, still allow existing token
  const isStrictlyExpired = state.expiresAt ? Date.now() >= state.expiresAt : !state.accessToken;
  if (!isStrictlyExpired && state.accessToken) {
    return state.accessToken;
  }

  return null;
}

/**
 * Renews the Google Drive OAuth 2.0 access token using GIS with user email hint.
 * Reuses concurrent in-flight promises to eliminate duplicate token requests.
 * @param {string} [prompt='']
 * @param {number} [timeoutMs=15000]
 * @returns {Promise<string|null>} Fresh access token or null
 */
export async function renewGoogleDriveToken(prompt = '', timeoutMs = 15000) {
  const state = await getGoogleDriveAuthState();
  if (!state) return null;

  if (tokenRefreshPromise) {
    const refreshed = await tokenRefreshPromise;
    return refreshed?.accessToken || null;
  }

  const p = requestGoogleDriveToken({ prompt, hint: state.user?.email || '', timeoutMs })
    .catch((err) => {
      console.debug('[GoogleAuth] Token renewal attempt result:', err?.message || err);
      return null;
    })
    .finally(() => {
      tokenRefreshPromise = null;
    });

  tokenRefreshPromise = p;
  const freshState = await p;
  return freshState?.accessToken || null;
}

// Pre-warm Google Identity Services script on module evaluation (non-blocking)
if (typeof window !== 'undefined') {
  setTimeout(() => {
    loadGoogleIdentityServices()
      .then(() => initGoogleTokenClient().catch(() => {}))
      .catch(() => {});
  }, 1000);
}

/**
 * Safely disconnects Google Drive by revoking tokens locally and from Google,
 * clearing the stored auth session in LocalDB and localStorage without modifying any user data or flashcards.
 * @returns {Promise<boolean>}
 */
export async function disconnectGoogleDrive() {
  try {
    const authState = await getGoogleDriveAuthState();
    if (authState?.accessToken) {
      // Revoke token with Google
      try {
        if (window.google?.accounts?.oauth2?.revoke) {
          window.google.accounts.oauth2.revoke(authState.accessToken, () => {});
        } else {
          fetch(`https://oauth2.googleapis.com/revoke?token=${authState.accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('[GoogleAuth] Error revoking token with Google:', e);
      }
    }

    // Remove auth state from settings and localStorage
    await saveLocalSetting(GOOGLE_DRIVE_AUTH_KEY, null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('autoanki_gdrive_auth');
    }
    tokenClientInstance = null;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gdrive-auth-changed', { detail: null }));
    }

    return true;
  } catch (err) {
    console.error('[GoogleAuth] Error disconnecting Google Drive:', err);
    throw err;
  }
}


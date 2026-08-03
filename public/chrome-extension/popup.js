import { initializeApp } from './lib/firebase-app.js';
import { getFirestore, doc, setDoc, deleteDoc, onSnapshot, getDoc } from './lib/firebase-firestore.js';

// AutoAnki Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCFWeDv8ClwT5LZ6-xEhM1mehNBmgLKNkM",
  authDomain: "autoanki-d7f3c.firebaseapp.com",
  projectId: "autoanki-d7f3c",
  storageBucket: "autoanki-d7f3c.firebasestorage.app",
  messagingSenderId: "373065987778",
  appId: "1:373065987778:web:b9e9c5239b22e9c8a6ad5b",
  measurementId: "G-488M1J14TX"
};

// Initialize Firebase & Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// UI Views
const loadingState = document.getElementById('loading-state');
const loggedOutState = document.getElementById('logged-out-state');
const qrWaitingState = document.getElementById('qr-waiting-state');
const pairingWaitingState = document.getElementById('pairing-waiting-state');
const loggedInState = document.getElementById('logged-in-state');

// Buttons & Outputs
const loginGoogleBtn = document.getElementById('login-google-btn');
const loginQrBtn = document.getElementById('login-qr-btn');
const loginCodeBtn = document.getElementById('login-code-btn');
const cancelQrBtn = document.getElementById('cancel-qr-btn');
const cancelCodeBtn = document.getElementById('cancel-code-btn');
const logoutBtn = document.getElementById('logout-btn');

const qrCodeImg = document.getElementById('qr-code-img');
const pairingCodeVal = document.getElementById('pairing-code-val');

const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');

// Active Session Trackers
let activeUnsubscribe = null;
let activeSessionId = null;

// Initial state check
chrome.storage.local.get(['user'], (result) => {
  hideAllViews();
  if (result.user) {
    showLoggedInState(result.user);
  } else {
    loggedOutState.classList.remove('hidden');
  }
});

// Main Action Listeners
loginGoogleBtn.addEventListener('click', handleGoogleLogin);
loginQrBtn.addEventListener('click', handleQrLoginInit);
loginCodeBtn.addEventListener('click', handlePairingCodeLoginInit);
cancelQrBtn.addEventListener('click', cancelActiveSession);
cancelCodeBtn.addEventListener('click', cancelActiveSession);
logoutBtn.addEventListener('click', handleLogout);

function hideAllViews() {
  loadingState.classList.add('hidden');
  loggedOutState.classList.add('hidden');
  qrWaitingState.classList.add('hidden');
  pairingWaitingState.classList.add('hidden');
  loggedInState.classList.add('hidden');
}

function showLoggedInState(user) {
  userName.textContent = user.displayName || 'AutoAnki User';
  userEmail.textContent = user.email || '';
  if (user.photoURL) {
    userAvatar.style.backgroundImage = `url('${user.photoURL}')`;
    userAvatar.textContent = '';
  } else {
    userAvatar.style.backgroundImage = 'none';
    userAvatar.style.backgroundColor = '#3b82f6';
    userAvatar.textContent = (user.displayName || 'U').charAt(0).toUpperCase();
    userAvatar.style.display = 'flex';
    userAvatar.style.alignItems = 'center';
    userAvatar.style.justifyContent = 'center';
    userAvatar.style.fontWeight = 'bold';
    userAvatar.style.fontSize = '1.5rem';
    userAvatar.style.color = 'white';
  }
  
  hideAllViews();
  loggedInState.classList.remove('hidden');
}

function showLoggedOutState() {
  hideAllViews();
  loggedOutState.classList.remove('hidden');
}

// 1. Google OAuth Flow
async function handleGoogleLogin() {
  loginGoogleBtn.disabled = true;
  loginGoogleBtn.textContent = 'Connecting...';
  
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_SCRAPING'],
      justification: 'Firebase Auth requires an offscreen document window context to run signInWithPopup'
    }).catch(err => {
      if (!err.message.includes('Only one offscreen document')) throw err;
    });

    chrome.runtime.sendMessage({ target: 'offscreen', type: 'sign-in' }, (response) => {
      chrome.offscreen.closeDocument();
      resetGoogleBtn();

      if (response && response.success) {
        const user = response.user;
        chrome.storage.local.set({ user }, () => {
          showLoggedInState(user);
        });
      } else {
        const errMsg = response ? response.error : 'Unknown authentication error';
        alert('Authentication failed: ' + errMsg);
      }
    });
  } catch (error) {
    console.error('Error during Google OAuth:', error);
    alert('An error occurred during Google Login.');
    resetGoogleBtn();
  }
}

function resetGoogleBtn() {
  loginGoogleBtn.disabled = false;
  loginGoogleBtn.innerHTML = `
    <svg class="google-icon" viewBox="0 0 24 24">
      <path fill="#EA4335" d="M12 5.04c1.62 0 3.08.56 4.22 1.64l3.15-3.15C17.45 1.68 14.9 1 12 1 7.35 1 3.37 3.68 1.44 7.6l3.77 2.92c.9-2.7 3.42-4.48 6.79-4.48z"/>
      <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.47h6.44c-.28 1.47-1.11 2.71-2.36 3.55l3.66 2.84c2.14-1.97 3.75-4.88 3.75-8.5z"/>
      <path fill="#FBBC05" d="M5.21 14.78a6.96 6.96 0 0 1 0-4.22L1.44 7.64a11.96 11.96 0 0 0 0 10.04l3.77-2.9z"/>
      <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.66-2.84c-1.01.68-2.31 1.09-4.3 1.09-3.37 0-5.89-1.78-6.79-4.48L1.44 16.8A11.96 11.96 0 0 0 12 23z"/>
    </svg>
    Sign in with Google
  `;
}

// 2. QR Code Login Flow
async function handleQrLoginInit() {
  hideAllViews();
  loadingState.classList.remove('hidden');

  const sessionId = 'qr_session_' + Math.random().toString(36).substring(2, 12).toUpperCase();
  activeSessionId = sessionId;

  try {
    const docRef = doc(db, 'qr_logins', sessionId);
    await setDoc(docRef, {
      id: sessionId,
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    // Populate QR Image URL (Points user device to our webapp with login_session query parameter)
    const webAppUrl = `https://autoanki-d7f3c.web.app/?login_session=${sessionId}`;
    qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(webAppUrl)}`;

    hideAllViews();
    qrWaitingState.classList.remove('hidden');

    // Subscribe to session doc updates
    listenToSessionDoc(docRef);
  } catch (error) {
    console.error("Failed to generate QR session:", error);
    alert("Error creating QR login session. Please check your internet connection.");
    showLoggedOutState();
  }
}

// 3. Pairing Code Login Flow
async function handlePairingCodeLoginInit() {
  hideAllViews();
  loadingState.classList.remove('hidden');

  try {
    // Generate a unique 6 digit numeric code
    let code = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      code = Math.floor(100000 + Math.random() * 900000).toString();
      const testRef = doc(db, 'qr_logins', code);
      const snap = await getDoc(testRef);
      if (!snap.exists()) {
        isUnique = true;
      }
      attempts++;
    }

    activeSessionId = code;
    const docRef = doc(db, 'qr_logins', code);
    await setDoc(docRef, {
      id: code,
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    pairingCodeVal.textContent = `${code.slice(0, 3)} ${code.slice(3)}`;

    hideAllViews();
    pairingWaitingState.classList.remove('hidden');

    // Subscribe to code doc updates
    listenToSessionDoc(docRef);
  } catch (error) {
    console.error("Failed to generate pairing code:", error);
    alert("Error generating pairing code. Please try again.");
    showLoggedOutState();
  }
}

// Session Document Listener (Shared between QR & Pairing Code)
function listenToSessionDoc(docRef) {
  if (activeUnsubscribe) activeUnsubscribe();

  activeUnsubscribe = onSnapshot(docRef, async (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      if (data.status === 'authorized' && data.uid) {
        // Stop listener
        if (activeUnsubscribe) {
          activeUnsubscribe();
          activeUnsubscribe = null;
        }

        const user = {
          uid: data.uid,
          email: data.email || 'paired-extension@autoanki.cloud',
          displayName: data.displayName || 'Paired Extension User',
          photoURL: '',
          isQRLogin: true
        };

        // Persist session locally
        chrome.storage.local.set({ user }, () => {
          showLoggedInState(user);
        });

        // Clean up session document from database
        await deleteDoc(docRef).catch(console.error);
        activeSessionId = null;
      }
    }
  }, (err) => {
    console.error("Session document listener error:", err);
  });
}

// Cancel Active QR or Pairing Session
async function cancelActiveSession() {
  if (activeUnsubscribe) {
    activeUnsubscribe();
    activeUnsubscribe = null;
  }

  if (activeSessionId) {
    const docRef = doc(db, 'qr_logins', activeSessionId);
    await deleteDoc(docRef).catch(console.error);
    activeSessionId = null;
  }

  showLoggedOutState();
}

// Sign Out
function handleLogout() {
  chrome.storage.local.remove(['user'], () => {
    showLoggedOutState();
  });
}

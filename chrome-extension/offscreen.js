import { initializeApp } from './lib/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signInWithCredential } from './lib/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from './lib/firebase-firestore.js';

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "auto-anki-app";
const provider = new GoogleAuthProvider();

// Helper to ensure Firebase Auth currentUser is initialized & authenticated
async function ensureAuthenticated(targetUser) {
  if (!targetUser || !targetUser.uid) {
    throw new Error("User session expired. Please click the AutoAnki extension icon and sign in.");
  }

  // 1. If auth.currentUser is already active and matches targetUser.uid
  if (auth.currentUser && auth.currentUser.uid === targetUser.uid) {
    return auth.currentUser;
  }

  // 2. Try signing in with stored accessToken / ID token credential if available
  if (targetUser.accessToken) {
    try {
      const credential = GoogleAuthProvider.credential(targetUser.accessToken);
      const credRes = await signInWithCredential(auth, credential);
      if (credRes && credRes.user) return credRes.user;
    } catch (e) {
      console.warn("Credential sign-in warning:", e);
    }
  }

  // 3. Wait up to 1000ms for Firebase Auth SDK to restore session state from IndexedDB
  await new Promise((resolve) => {
    let resolved = false;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (resolved) return;
      if (u && u.uid === targetUser.uid) {
        resolved = true;
        unsubscribe();
        resolve(u);
      }
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsubscribe();
        resolve(auth.currentUser);
      }
    }, 1000);
  });

  if (auth.currentUser) {
    return auth.currentUser;
  }

  // 4. Ensure request.auth != null for Cloud Firestore Security Rules by signing in anonymously
  try {
    const anonRes = await signInAnonymously(auth);
    return anonRes.user;
  } catch (err) {
    console.warn("Anonymous auth initialization note:", err.message);
  }

  return auth.currentUser;
}

// Listen for messages from the popup or background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'sign-in') {
    signInWithPopup(auth, provider)
      .then((result) => {
        const user = result.user;
        sendResponse({
          success: true,
          user: {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            accessToken: user.accessToken || result._tokenResponse?.idToken
          }
        });
      })
      .catch((error) => {
        console.error("Offscreen authentication error:", error);
        sendResponse({
          success: false,
          error: error.message
        });
      });
    return true; // Keep channel open for async response
  } 
  
  else if (message.type === 'GET_FOLDERS') {
    (async () => {
      try {
        const user = message.user;
        await ensureAuthenticated(user);
        const settingsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'hierarchy');
        const snap = await getDoc(settingsRef);
        let paths = [];
        if (snap.exists()) {
          paths = snap.data().paths || [];
        }
        sendResponse({ success: true, folders: paths });
      } catch (error) {
        console.error("Error in GET_FOLDERS offscreen:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async response
  } 
  
  else if (message.type === 'SAVE_IMGBB_KEY') {
    (async () => {
      try {
        const user = message.user;
        await ensureAuthenticated(user);
        const { apiKey } = message;
        if (!apiKey || !apiKey.trim()) {
          throw new Error("API Key cannot be empty.");
        }
        const keysRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'keys');
        await setDoc(keysRef, { imgbbApiKey: apiKey.trim() }, { merge: true });
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error in SAVE_IMGBB_KEY offscreen:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async response
  }

  else if (message.type === 'UPLOAD_SNIP') {
    (async () => {
      try {
        const user = message.user;
        await ensureAuthenticated(user);
        const { deck, dataUrl } = message;

        if (!dataUrl) {
          throw new Error("Snip image data is missing. Please try snipping again.");
        }

        // 1. Fetch ImgBB API Key from message payload, local storage, or Firestore settings
        let imgbbApiKey = message.imgbbApiKey || '';
        if (!imgbbApiKey) {
          try {
            const keysRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'keys');
            const keysSnap = await getDoc(keysRef);
            if (keysSnap && keysSnap.exists()) {
              imgbbApiKey = keysSnap.data().imgbbApiKey || '';
            }
          } catch (e) {
            console.warn("Could not fetch ImgBB key from Firestore setting document:", e.message);
          }
        }

        if (!imgbbApiKey) {
          sendResponse({
            success: false,
            code: 'MISSING_IMGBB_KEY',
            error: 'ImgBB API Key is required to upload snips.'
          });
          return;
        }

        // 2. Upload to ImgBB
        const cleanBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        const formData = new FormData();
        formData.append('image', cleanBase64);

        const response = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbApiKey}`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error?.message || `HTTP ${response.status} upload error`;
          const isKeyErr = response.status === 400 || response.status === 403;
          sendResponse({
            success: false,
            code: isKeyErr ? 'INVALID_IMGBB_KEY' : 'IMGBB_ERROR',
            error: `ImgBB upload failed: ${errorMsg}`
          });
          return;
        }

        const result = await response.json();
        if (!result.success || !result.data || !result.data.url) {
          throw new Error("ImgBB upload failed: Invalid response structure");
        }

        const downloadUrl = result.data.url;
        const fileName = `Snip_${Date.now()}.png`;

        // 3. Create the Firestore Page Document with downloadUrl
        const pageId = 'page_' + Math.random().toString(36).substring(2, 12);
        const pageDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'pages', pageId);
        
        const pageData = {
          fileName: fileName,
          deck: deck || 'Inbox/Triage',
          imageUrl: downloadUrl,
          isPending: true,
          isCompanionScan: true, // Flag as triage item
          createdAt: Date.now(),
          updatedAt: Date.now(), // Enable DeltaSync detection
          label: "Windows Snips"
        };

        try {
          await setDoc(pageDocRef, pageData);
        } catch (setErr) {
          console.warn("User pages path write warning, executing companion session fallback:", setErr.message);
          const cleanUid = String(user.uid).replace(/[^a-zA-Z0-9_-]/g, '_');
          const fallbackRef = doc(db, 'qr_logins', `snip_${cleanUid}_${pageId}`);
          await setDoc(fallbackRef, {
            ...pageData,
            targetUid: user.uid,
            status: 'pending_snip'
          });
        }

        sendResponse({ success: true, downloadUrl });
      } catch (error) {
        console.error("Error in UPLOAD_SNIP offscreen:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async response
  } 
  
  else if (message.type === 'CREATE_FOLDER') {
    (async () => {
      try {
        const user = message.user;
        await ensureAuthenticated(user);
        const { path } = message;
        if (!path) {
          throw new Error("Invalid folder path.");
        }

        const settingsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'hierarchy');
        const snap = await getDoc(settingsRef);
        let paths = [];
        if (snap.exists()) {
          paths = snap.data().paths || [];
        }

        if (!paths.includes(path)) {
          paths.push(path);
          // Update hierarchy document
          await setDoc(settingsRef, { paths }, { merge: true });
        }

        sendResponse({ success: true, folders: paths });
      } catch (error) {
        console.error("Error in CREATE_FOLDER offscreen:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async response
  }
});

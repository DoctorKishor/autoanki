import { initializeApp } from './lib/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider } from './lib/firebase-auth.js';
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
        if (!user) {
          throw new Error("User session expired. Please log in again.");
        }
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
  
  else if (message.type === 'UPLOAD_SNIP') {
    (async () => {
      try {
        const user = message.user;
        if (!user) {
          throw new Error("User session expired. Please log in again.");
        }
        const { dataUrl, deck } = message;

        // 1. Fetch ImgBB API Key from Firestore settings
        const keysRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'keys');
        const keysSnap = await getDoc(keysRef);
        let imgbbApiKey = '';
        if (keysSnap.exists()) {
          imgbbApiKey = keysSnap.data().imgbbApiKey || '';
        }

        if (!imgbbApiKey) {
          throw new Error("ImgBB API Key is not configured. Please open AutoAnki, go to the Setup / Settings tab, paste your ImgBB API Key, and save it to the cloud first!");
        }

        // 2. Upload the base64 image directly to ImgBB
        const cleanBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        const formData = new FormData();
        formData.append('image', cleanBase64);

        const response = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbApiKey}`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error?.message || `HTTP error ${response.status}`;
          throw new Error(`ImgBB upload failed: ${errorMsg}`);
        }

        const result = await response.json();
        if (!result.success || !result.data || !result.data.url) {
          throw new Error("ImgBB upload failed: Invalid response structure");
        }

        const downloadUrl = result.data.url;
        const fileName = `Snip_${Date.now()}.png`;

        // 3. Create the Firestore Page Document
        const pageId = 'page_' + Math.random().toString(36).substring(2, 12);
        const pageDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'pages', pageId);
        
        await setDoc(pageDocRef, {
          imageUrl: downloadUrl,
          deck: deck || 'Inbox/Triage',
          fileName: fileName,
          isPending: true,
          isCompanionScan: true, // Flag as triage item
          createdAt: Date.now(),
          updatedAt: Date.now(), // Enable DeltaSync detection
          label: "Windows Snips"
        });

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
        if (!user) {
          throw new Error("User session expired. Please log in again.");
        }
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

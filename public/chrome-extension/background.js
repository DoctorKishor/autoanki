// AutoAnki Background Service Worker

// Register right-click context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "snip_to_autoanki",
    title: "Screenshot and sent to Autoanki",
    contexts: ["all"]
  });
});

// Helper to get authenticated user from local storage
function getAuthenticatedUser() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['user'], (result) => {
      resolve(result.user || null);
    });
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "snip_to_autoanki") {
    // 1. Verify user is logged in before starting
    const user = await getAuthenticatedUser();
    if (!user) {
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'favicon.svg',
        title: 'AutoAnki: Login Required',
        message: 'Please click the AutoAnki Extension icon and sign in with Google first.'
      });
      // Fallback alert using chrome scripting if notification is blocked
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => alert("AutoAnki: Please click the extension icon in the toolbar and log in with Google first!")
      }).catch(() => {});
      return;
    }

    try {
      // 2. Capture a screenshot of the visible area of the tab
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

      // 3. Inject CSS and content script into the page
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      }).catch(err => console.log("CSS already injected or ignored:", err));

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });

      // 4. Send the screenshot URL to start the crop tool
      chrome.tabs.sendMessage(tab.id, {
        action: "START_SNIP",
        screenshotUrl: dataUrl
      });
    } catch (error) {
      console.error("Failed to initialize snipping tool:", error);
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (errStr) => alert("Could not open snipping tool on this page. Extension context scripts are restricted on chrome://, file://, and Chrome Web Store pages.\n\nError: " + errStr),
        args: [error.message]
      }).catch(() => {});
    }
  }
});

// Manage offscreen document
let creatingOffscreen;
async function setupOffscreenDocument(path = 'offscreen.html') {
  // Check if one already exists
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (contexts.length > 0) {
    return;
  }

  // Realize the promise-based locking
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: path,
    reasons: ['DOM_SCRAPING'],
    justification: 'Firebase operations require offscreen document window context to run Storage/Firestore/Auth APIs'
  });
  await creatingOffscreen;
  creatingOffscreen = null;
}

// Handle messages from the content script and offscreen auth document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'background') {
    handleAsyncMessage(message, sendResponse);
    return true; // Keep message channel open for async response
  }
});

async function sendToOffscreenWithRetry(message, maxRetries = 6, delay = 150) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await setupOffscreenDocument();
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          ...message,
          target: 'offscreen',
          type: message.action
        }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res);
          }
        });
      });
      return response;
    } catch (err) {
      const isConnectionError = err.message.includes("Could not establish connection") || 
                              err.message.includes("Receiving end does not exist");
      if (isConnectionError && i < maxRetries - 1) {
        console.warn(`Offscreen document not ready, retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

async function handleAsyncMessage(message, sendResponse) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new Error("User session expired. Please log in again from the extension popup.");
    }

    const response = await sendToOffscreenWithRetry({ ...message, user });
    sendResponse(response);
  } catch (error) {
    console.error("Background operation error:", error);
    sendResponse({ success: false, error: error.message });
  }
}

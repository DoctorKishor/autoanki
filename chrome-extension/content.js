// Listen for messages from the background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_SNIP") {
    startSnipping(message.screenshotUrl);
  }
});

function startSnipping(screenshotUrl) {
  // Prevent duplicate canvases
  if (document.querySelector('.autoanki-canvas-overlay')) return;

  // 1. Freeze page scrolling
  document.body.classList.add('autoanki-snip-active');

  // 2. Create the fullscreen overlay canvas
  const canvas = document.createElement('canvas');
  canvas.className = 'autoanki-canvas-overlay';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  // 3. Load the screenshot image
  const img = new Image();
  img.src = screenshotUrl;
  img.onload = () => {
    // Draw base screenshot and semi-transparent dim overlay
    ctx.drawImage(img, 0, 0, width, height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, width, height);

    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    // Canvas Events
    const onMouseDown = (e) => {
      isDrawing = true;
      startX = e.clientX;
      startY = e.clientY;
    };

    const onMouseMove = (e) => {
      if (!isDrawing) return;
      currentX = e.clientX;
      currentY = e.clientY;

      // Clear and redraw background
      ctx.drawImage(img, 0, 0, width, height);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, width, height);

      // Draw highlighted crop area
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);

      if (w > 0 && h > 0) {
        const dpr = window.devicePixelRatio || 1;
        // Redraw undimmed screenshot in crop box with physical coordinate mapping
        ctx.drawImage(img, x * dpr, y * dpr, w * dpr, h * dpr, x, y, w, h);
        
        // Draw dotted selection border
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x, y, w, h);
      }
    };

    const onMouseUp = (e) => {
      if (!isDrawing) return;
      isDrawing = false;

      const endX = e.clientX;
      const endY = e.clientY;

      // Clean up event listeners and canvas
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.remove();
      document.body.classList.remove('autoanki-snip-active');

      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);
      const w = Math.abs(endX - startX);
      const h = Math.abs(endY - startY);

      // Minimum snip dimensions
      if (w > 10 && h > 10) {
        cropAndProcess(img, x, y, w, h);
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
  };
}

function cropAndProcess(img, x, y, w, h) {
  const dpr = window.devicePixelRatio || 1;
  // Create an offscreen canvas to perform the crop at physical resolution (for high quality)
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = w * dpr;
  cropCanvas.height = h * dpr;
  const cropCtx = cropCanvas.getContext('2d');
  
  // Draw the cropped portion mapping from physical coordinates
  cropCtx.drawImage(img, x * dpr, y * dpr, w * dpr, h * dpr, 0, 0, w * dpr, h * dpr);
  
  // Convert crop to base64 Data URL
  const croppedDataUrl = cropCanvas.toDataURL('image/png');

  // Trigger folder destination popup
  showFolderModal(croppedDataUrl);
}

function showFolderModal(croppedDataUrl) {
  // Prevent duplicate modals
  const existing = document.getElementById('autoanki-modal-container');
  if (existing) existing.remove();

  // Create modal container
  const container = document.createElement('div');
  container.id = 'autoanki-modal-container';
  document.body.appendChild(container);

  // Attach Shadow DOM to avoid parent page style pollution
  const shadow = container.attachShadow({ mode: 'open' });

  // shadow stylesheet
  const style = document.createElement('style');
  style.textContent = `
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(11, 15, 25, 0.4);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      animation: fadeIn 0.2s ease-out;
    }

    .modal-card {
      background: rgba(17, 24, 39, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      padding: 24px;
      width: 380px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      color: #f3f4f6;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      transform: scale(0.95);
      animation: scaleUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }

    .modal-header {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .modal-title {
      font-size: 1.15rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      background: linear-gradient(to right, #60a5fa, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .modal-subtitle {
      font-size: 0.78rem;
      color: #9ca3af;
    }

    .preview-box {
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      overflow: hidden;
      max-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.2);
    }

    .preview-img {
      max-width: 100%;
      max-height: 120px;
      object-fit: contain;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    label {
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #9ca3af;
    }

    /* High contrast select and options for absolute visibility */
    select {
      background: #ffffff !important;
      border: 2px solid #3b82f6 !important;
      border-radius: 12px;
      padding: 12px 16px;
      color: #0f172a !important;
      font-size: 0.88rem !important;
      font-weight: 700 !important;
      outline: none;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230f172a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
      background-repeat: no-repeat;
      background-position: right 16px center;
      background-size: 14px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    select:focus {
      border-color: #2563eb !important;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.3) !important;
    }

    select:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    option {
      background: #ffffff !important;
      color: #0f172a !important;
      font-weight: 600 !important;
    }

    /* Inline folder creator stylesheet */
    .new-folder-panel {
      background: rgba(255, 255, 255, 0.04);
      border: 1px dashed rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .hidden-panel {
      display: none !important;
    }

    .new-folder-panel input[type="text"] {
      background: #ffffff !important;
      border: 2px solid #e2e8f0 !important;
      border-radius: 12px;
      padding: 10px 14px;
      color: #0f172a !important;
      font-size: 0.85rem;
      font-weight: 600;
      outline: none;
      transition: border-color 0.2s;
    }

    .new-folder-panel input[type="text"]:focus {
      border-color: #3b82f6 !important;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2) !important;
    }

    .new-folder-panel select {
      padding: 8px 12px !important;
      font-size: 0.8rem !important;
    }

    .new-folder-panel label {
      font-size: 0.65rem;
      font-weight: 800;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .btn-row {
      display: flex;
      gap: 10px;
      margin-top: 4px;
    }

    .btn {
      flex: 1;
      padding: 12px;
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 600;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s ease;
    }

    .btn-sm {
      padding: 8px 12px !important;
      font-size: 0.78rem !important;
      border-radius: 8px !important;
    }

    .btn-primary {
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      color: white;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }

    .btn-primary:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
    }

    .btn-primary:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      color: #f3f4f6;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .btn-secondary:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.1);
    }

    .text-btn {
      transition: color 0.2s;
    }

    .text-btn:hover {
      color: #93c5fd !important;
      text-decoration: underline;
    }

    .status-msg {
      font-size: 0.8rem;
      font-weight: 600;
      text-align: center;
      padding: 8px;
      border-radius: 10px;
      display: none;
    }

    .status-msg.error {
      display: block;
      background: rgba(239, 68, 68, 0.1);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.2);
    }

    .status-msg.success {
      display: block;
      background: rgba(16, 185, 129, 0.1);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .loading-spinner {
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-top: 2px solid white;
      border-radius: 50%;
      width: 16px;
      height: 16px;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes scaleUp {
      to { transform: scale(1); }
    }
  `;
  shadow.appendChild(style);

  // Create Modal element
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">Save to AutoAnki</div>
        <div class="modal-subtitle">Choose a folder to categorize your snip</div>
      </div>
      
      <div class="preview-box">
        <img class="preview-img" src="${croppedDataUrl}" />
      </div>

      <div class="form-group">
        <label for="folder-select">Destination Folder</label>
        <div style="position: relative; display: flex; flex-direction: column; gap: 6px;">
          <select id="folder-select" disabled>
            <option value="loading">Loading folders...</option>
          </select>
          <button id="toggle-new-folder-btn" class="text-btn" style="align-self: flex-end; font-size: 0.75rem; color: #60a5fa; background: none; border: none; cursor: pointer; font-weight: 600; padding: 4px 0; display: flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
            Create New Folder
          </button>
        </div>
      </div>

      <!-- Inline Folder Creator Panel -->
      <div id="new-folder-panel" class="new-folder-panel hidden-panel">
        <div class="form-group">
          <label for="new-folder-name">New Folder Name</label>
          <input type="text" id="new-folder-name" placeholder="Enter folder name..." />
        </div>
        <div class="form-group">
          <label for="new-folder-parent">Parent Folder (Optional)</label>
          <select id="new-folder-parent">
            <option value="">None (Root)</option>
          </select>
        </div>
        <div class="btn-row">
          <button id="cancel-new-folder-btn" class="btn btn-secondary btn-sm">Cancel</button>
          <button id="save-new-folder-btn" class="btn btn-primary btn-sm">Create</button>
        </div>
      </div>

      <div id="status-display" class="status-msg"></div>

      <div class="btn-row">
        <button id="cancel-btn" class="btn btn-secondary">Cancel</button>
        <button id="send-btn" class="btn btn-primary" disabled>Send to AutoAnki</button>
      </div>
    </div>
  `;
  shadow.appendChild(modalOverlay);

  // References
  const folderSelect = shadow.getElementById('folder-select');
  const sendBtn = shadow.getElementById('send-btn');
  const cancelBtn = shadow.getElementById('cancel-btn');
  const statusDisplay = shadow.getElementById('status-display');

  // Folder Creator References
  const toggleNewFolderBtn = shadow.getElementById('toggle-new-folder-btn');
  const newFolderPanel = shadow.getElementById('new-folder-panel');
  const newFolderNameInput = shadow.getElementById('new-folder-name');
  const newFolderParentSelect = shadow.getElementById('new-folder-parent');
  const cancelNewFolderBtn = shadow.getElementById('cancel-new-folder-btn');
  const saveNewFolderBtn = shadow.getElementById('save-new-folder-btn');

  let currentFoldersList = [];

  // Cancel callback
  cancelBtn.addEventListener('click', () => {
    container.remove();
  });

  // Fetch folders from background service worker
  chrome.runtime.sendMessage({ target: 'background', action: 'GET_FOLDERS' }, (response) => {
    if (chrome.runtime.lastError) {
      showStatus('Error communicating with background worker. Ensure extension is loaded.', 'error');
      setupFallbackFolderList();
      return;
    }

    if (response && response.success) {
      currentFoldersList = response.folders || [];
      populateFolders(currentFoldersList);
    } else {
      const err = response ? response.error : 'Failed to fetch folders.';
      showStatus(err, 'error');
      setupFallbackFolderList();
    }
  });

  // Helper to format flat folder list as a tree with indentation
  function formatPathsAsTree(paths) {
    const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
    // Sort paths alphabetically to ensure parent nodes precede child nodes
    const sortedPaths = uniquePaths.sort((a, b) => {
      return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
    });

    const treeOptions = [];
    sortedPaths.forEach(path => {
      const parts = path.split('::');
      const depth = parts.length - 1;
      const leafName = parts[parts.length - 1];
      
      // Use non-breaking spaces (\u00A0) for nesting indent
      let prefix = '';
      if (depth > 0) {
        prefix = '\u00A0\u00A0'.repeat(depth) + '└─ ';
      }
      
      treeOptions.push({
        value: path,
        text: prefix + leafName
      });
    });
    return treeOptions;
  }

  function populateFolders(folders) {
    folderSelect.innerHTML = '';
    
    // Add default Inbox/Triage option
    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'Inbox/Triage';
    defaultOpt.textContent = 'Inbox/Triage (Default)';
    folderSelect.appendChild(defaultOpt);

    // Format folders into tree hierarchy options
    const treeOptions = formatPathsAsTree(folders);
    treeOptions.forEach(optData => {
      if (optData.value !== 'Inbox/Triage') {
        const opt = document.createElement('option');
        opt.value = optData.value;
        opt.textContent = optData.text;
        folderSelect.appendChild(opt);
      }
    });

    folderSelect.disabled = false;
    sendBtn.disabled = false;
  }

  function setupFallbackFolderList() {
    folderSelect.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'Inbox/Triage';
    defaultOpt.textContent = 'Inbox/Triage (Default)';
    folderSelect.appendChild(defaultOpt);
    
    folderSelect.disabled = false;
    sendBtn.disabled = false;
  }

  function showStatus(msg, type) {
    statusDisplay.textContent = msg;
    statusDisplay.className = `status-msg ${type}`;
  }

  // Folder Creator Interactive Logic
  toggleNewFolderBtn.addEventListener('click', () => {
    newFolderPanel.classList.remove('hidden-panel');
    toggleNewFolderBtn.style.display = 'none';

    // Populate parent dropdown list
    newFolderParentSelect.innerHTML = '';
    const rootOpt = document.createElement('option');
    rootOpt.value = '';
    rootOpt.textContent = 'None (Root)';
    newFolderParentSelect.appendChild(rootOpt);

    const treeOptions = formatPathsAsTree(currentFoldersList);
    treeOptions.forEach(optData => {
      const opt = document.createElement('option');
      opt.value = optData.value;
      opt.textContent = optData.text;
      newFolderParentSelect.appendChild(opt);
    });

    // Default parent to the currently selected folder in main list (if valid)
    const currentVal = folderSelect.value;
    if (currentVal && currentVal !== 'loading' && currentVal !== 'Inbox/Triage') {
      newFolderParentSelect.value = currentVal;
    } else {
      newFolderParentSelect.value = '';
    }

    newFolderNameInput.value = '';
    newFolderNameInput.focus();
  });

  const closeNewFolderPanel = () => {
    newFolderPanel.classList.add('hidden-panel');
    toggleNewFolderBtn.style.display = 'flex';
  };

  cancelNewFolderBtn.addEventListener('click', closeNewFolderPanel);

  saveNewFolderBtn.addEventListener('click', () => {
    const folderName = newFolderNameInput.value.trim();
    if (!folderName) {
      alert('Please enter a folder name.');
      newFolderNameInput.focus();
      return;
    }

    if (folderName.includes('::')) {
      alert('Folder name cannot contain double colons "::".');
      return;
    }

    const parentPath = newFolderParentSelect.value;
    const newPath = parentPath ? `${parentPath}::${folderName}` : folderName;

    // Validate path uniqueness
    if (currentFoldersList.includes(newPath) || newPath === 'Inbox/Triage') {
      alert('This folder path already exists.');
      return;
    }

    // Disable new folder buttons during operation
    saveNewFolderBtn.disabled = true;
    cancelNewFolderBtn.disabled = true;
    saveNewFolderBtn.textContent = 'Creating...';

    chrome.runtime.sendMessage({
      target: 'background',
      action: 'CREATE_FOLDER',
      path: newPath
    }, (response) => {
      saveNewFolderBtn.disabled = false;
      cancelNewFolderBtn.disabled = false;
      saveNewFolderBtn.textContent = 'Create';

      if (chrome.runtime.lastError) {
        alert('Error: ' + chrome.runtime.lastError.message);
        return;
      }

      if (response && response.success) {
        // Update local list, repopulate, select the new folder and hide form
        currentFoldersList = response.folders || [];
        populateFolders(currentFoldersList);
        folderSelect.value = newPath;
        closeNewFolderPanel();
      } else {
        const err = response ? response.error : 'Failed to create folder.';
        alert('Error creating folder: ' + err);
      }
    });
  });

  // Handle Send button click
  sendBtn.addEventListener('click', async () => {
    const selectedFolder = folderSelect.value;
    
    // UI Loading State
    sendBtn.disabled = true;
    cancelBtn.disabled = true;
    folderSelect.disabled = true;
    toggleNewFolderBtn.style.display = 'none';
    sendBtn.innerHTML = '<div class="loading-spinner"></div> Sending...';
    statusDisplay.style.display = 'none';

    // Send snippet details to background script for Firebase uploads
    chrome.runtime.sendMessage({
      target: 'background',
      action: 'UPLOAD_SNIP',
      dataUrl: croppedDataUrl,
      deck: selectedFolder
    }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus('Communication error: ' + chrome.runtime.lastError.message, 'error');
        resetSendingState();
        return;
      }

      if (response && response.success) {
        showStatus('✨ Uploaded successfully!', 'success');
        setTimeout(() => {
          container.remove();
        }, 1200);
      } else {
        const err = response ? response.error : 'Upload failed.';
        showStatus('❌ ' + err, 'error');
        resetSendingState();
      }
    });
  });

  function resetSendingState() {
    sendBtn.disabled = false;
    cancelBtn.disabled = false;
    folderSelect.disabled = false;
    toggleNewFolderBtn.style.display = 'flex';
    sendBtn.innerHTML = 'Send to AutoAnki';
  }
}

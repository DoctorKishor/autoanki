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

    /* Collapsible Folder Tree Selector Styles */
    .folder-trigger {
      background: #ffffff !important;
      border: 2px solid #3b82f6 !important;
      border-radius: 12px;
      padding: 10px 14px;
      color: #0f172a !important;
      font-size: 0.88rem !important;
      font-weight: 700 !important;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      user-select: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .folder-trigger:hover {
      border-color: #2563eb !important;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2) !important;
    }

    .folder-tree-dropdown {
      max-height: 200px;
      overflow-y: auto;
      background: #ffffff !important;
      border: 2px solid #3b82f6 !important;
      border-radius: 12px;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
      margin-top: 4px;
    }

    .tree-node {
      display: flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 600;
      color: #0f172a;
      cursor: pointer;
      user-select: none;
      transition: background-color 0.15s ease;
    }

    .tree-node:hover {
      background-color: #f1f5f9;
    }

    .tree-node.selected {
      background-color: #eff6ff;
      color: #1d4ed8;
      font-weight: 800;
    }

    .tree-toggle-btn {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      margin-right: 4px;
      cursor: pointer;
      font-size: 10px;
      color: #64748b;
      flex-shrink: 0;
    }

    .tree-toggle-btn:hover {
      background-color: #cbd5e1;
      color: #0f172a;
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
        <label>Destination Folder</label>
        <div style="position: relative; display: flex; flex-direction: column; gap: 6px;">
          <div id="folder-trigger" class="folder-trigger">
            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; max-width: 90%;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              <span id="selected-folder-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Inbox/Triage (Default)</span>
            </div>
            <svg id="folder-trigger-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>

          <div id="folder-tree-dropdown" class="folder-tree-dropdown hidden-panel">
            <!-- Dynamic Collapsible Folder Tree -->
          </div>

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

      <!-- Inline ImgBB Key Creator Panel -->
      <div id="imgbb-key-panel" class="new-folder-panel hidden-panel" style="border-color: #3b82f6; background: rgba(59, 130, 246, 0.08);">
        <div style="font-size: 0.85rem; font-weight: 800; color: #60a5fa; display: flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3M15.5 7.5L19 4"/></svg>
          ImgBB API Key Required
        </div>
        <p style="font-size: 0.75rem; color: #d1d5db; line-height: 1.4;">
          To save screenshots to AutoAnki, please enter your ImgBB API Key below. It will be saved securely to your cloud settings.
        </p>
        <div class="form-group">
          <label for="imgbb-key-input">ImgBB API Key</label>
          <input type="text" id="imgbb-key-input" placeholder="Paste ImgBB API key here..." />
        </div>
        <div style="font-size: 0.7rem; color: #9ca3af;">
          Need a free key? <a href="https://api.imgbb.com/" target="_blank" style="color: #60a5fa; text-decoration: underline;">Get a free API key at ImgBB.com</a>
        </div>
        <div class="btn-row">
          <button id="cancel-imgbb-key-btn" class="btn btn-secondary btn-sm">Cancel</button>
          <button id="save-imgbb-key-btn" class="btn btn-primary btn-sm">Save & Continue</button>
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
  const folderTrigger = shadow.getElementById('folder-trigger');
  const selectedFolderText = shadow.getElementById('selected-folder-text');
  const folderTreeDropdown = shadow.getElementById('folder-tree-dropdown');
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

  // ImgBB Key Creator References
  const imgbbKeyPanel = shadow.getElementById('imgbb-key-panel');
  const imgbbKeyInput = shadow.getElementById('imgbb-key-input');
  const cancelImgbbKeyBtn = shadow.getElementById('cancel-imgbb-key-btn');
  const saveImgbbKeyBtn = shadow.getElementById('save-imgbb-key-btn');

  let currentFoldersList = [];
  let selectedFolder = 'Inbox/Triage';
  const expandedPaths = new Set(); // Empty by default => ALL subfolders collapsed by default!

  // Cancel callback
  cancelBtn.addEventListener('click', () => {
    container.remove();
  });

  // ImgBB Key Panel Handlers
  cancelImgbbKeyBtn.addEventListener('click', () => {
    imgbbKeyPanel.classList.add('hidden-panel');
  });

  saveImgbbKeyBtn.addEventListener('click', () => {
    const key = imgbbKeyInput.value.trim();
    if (!key) {
      alert('Please enter your ImgBB API Key.');
      imgbbKeyInput.focus();
      return;
    }

    saveImgbbKeyBtn.disabled = true;
    cancelImgbbKeyBtn.disabled = true;
    saveImgbbKeyBtn.textContent = 'Saving...';

    chrome.storage.local.set({ imgbbApiKey: key }, () => {
      chrome.runtime.sendMessage({
        target: 'background',
        action: 'SAVE_IMGBB_KEY',
        apiKey: key
      }, (res) => {
        saveImgbbKeyBtn.disabled = false;
        cancelImgbbKeyBtn.disabled = false;
        saveImgbbKeyBtn.textContent = 'Save & Continue';

        if (chrome.runtime.lastError) {
          console.warn('Background key save note:', chrome.runtime.lastError.message);
        }

        imgbbKeyPanel.classList.add('hidden-panel');
        showStatus('🔑 Key saved! Retrying upload...', 'success');
        // Automatically retry upload
        sendBtn.click();
      });
    });
  });

  // Toggle folder tree dropdown
  folderTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    folderTreeDropdown.classList.toggle('hidden-panel');
  });

  // Close dropdown on click outside
  modalOverlay.addEventListener('click', (e) => {
    if (!e.target.closest('#folder-trigger') && !e.target.closest('#folder-tree-dropdown')) {
      folderTreeDropdown.classList.add('hidden-panel');
    }
  });

  function updateTriggerDisplay() {
    if (selectedFolder === 'Inbox/Triage') {
      selectedFolderText.textContent = 'Inbox/Triage (Default)';
    } else {
      selectedFolderText.textContent = selectedFolder.replace(/::/g, ' / ');
    }
  }

  function buildTreeStructure(paths) {
    const root = {};
    paths.forEach(path => {
      if (!path || path === 'Inbox/Triage') return;
      const parts = path.split('::');
      let current = root;
      let currPath = '';
      parts.forEach(part => {
        currPath = currPath ? `${currPath}::${part}` : part;
        if (!current[part]) {
          current[part] = {
            name: part,
            path: currPath,
            children: {}
          };
        }
        current = current[part].children;
      });
    });
    return root;
  }

  function renderNodesRecursive(nodeMap, depth, containerEl) {
    Object.values(nodeMap).forEach(node => {
      const hasChildren = Object.keys(node.children).length > 0;
      const isExpanded = expandedPaths.has(node.path);

      const nodeEl = document.createElement('div');
      nodeEl.className = `tree-node ${selectedFolder === node.path ? 'selected' : ''}`;
      nodeEl.style.paddingLeft = `${depth * 14 + 10}px`;

      const toggleBtn = document.createElement('span');
      toggleBtn.className = 'tree-toggle-btn';
      if (hasChildren) {
        toggleBtn.textContent = isExpanded ? '▼' : '▶';
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isExpanded) {
            expandedPaths.delete(node.path);
          } else {
            expandedPaths.add(node.path);
          }
          renderFolderTree();
        });
      } else {
        toggleBtn.textContent = '';
      }
      nodeEl.appendChild(toggleBtn);

      const labelSpan = document.createElement('span');
      labelSpan.style.display = 'flex';
      labelSpan.style.alignItems = 'center';
      labelSpan.style.gap = '6px';
      labelSpan.style.overflow = 'hidden';
      labelSpan.style.textOverflow = 'ellipsis';
      labelSpan.style.whiteSpace = 'nowrap';
      labelSpan.innerHTML = `<span>📁</span><span>${node.name}</span>`;
      nodeEl.appendChild(labelSpan);

      nodeEl.addEventListener('click', () => {
        selectedFolder = node.path;
        updateTriggerDisplay();
        folderTreeDropdown.classList.add('hidden-panel');
        renderFolderTree();
      });

      containerEl.appendChild(nodeEl);

      // Render children recursively ONLY if node is expanded!
      if (hasChildren && isExpanded) {
        renderNodesRecursive(node.children, depth + 1, containerEl);
      }
    });
  }

  function renderFolderTree() {
    folderTreeDropdown.innerHTML = '';

    // 1. Default Inbox/Triage option
    const defaultNode = document.createElement('div');
    defaultNode.className = `tree-node ${selectedFolder === 'Inbox/Triage' ? 'selected' : ''}`;
    defaultNode.innerHTML = `
      <span class="tree-toggle-btn"></span>
      <span style="display:flex; align-items:center; gap:6px;">
        <span style="color: #2563eb;">📥</span>
        <span>Inbox/Triage (Default)</span>
      </span>
    `;
    defaultNode.addEventListener('click', () => {
      selectedFolder = 'Inbox/Triage';
      updateTriggerDisplay();
      folderTreeDropdown.classList.add('hidden-panel');
      renderFolderTree();
    });
    folderTreeDropdown.appendChild(defaultNode);

    // 2. Build tree structure from currentFoldersList
    const treeRoot = buildTreeStructure(currentFoldersList);

    // 3. Render nodes (subfolders collapsed by default)
    renderNodesRecursive(treeRoot, 0, folderTreeDropdown);
  }

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

  // Helper for parent select dropdown in folder creator
  function formatPathsAsTree(paths) {
    const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
    const sortedPaths = uniquePaths.sort((a, b) => {
      return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
    });

    const treeOptions = [];
    sortedPaths.forEach(path => {
      const parts = path.split('::');
      const depth = parts.length - 1;
      const leafName = parts[parts.length - 1];
      
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
    renderFolderTree();
    sendBtn.disabled = false;
  }

  function setupFallbackFolderList() {
    renderFolderTree();
    sendBtn.disabled = false;
  }

  function showStatus(msg, type) {
    statusDisplay.textContent = msg;
    if (type) {
      statusDisplay.style.display = 'block';
      statusDisplay.className = `status-msg ${type}`;
    } else {
      statusDisplay.style.display = 'none';
      statusDisplay.className = 'status-msg';
    }
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
    if (selectedFolder && selectedFolder !== 'Inbox/Triage') {
      newFolderParentSelect.value = selectedFolder;
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
        selectedFolder = newPath;
        updateTriggerDisplay();
        populateFolders(currentFoldersList);
        closeNewFolderPanel();
      } else {
        const err = response ? response.error : 'Failed to create folder.';
        alert('Error creating folder: ' + err);
      }
    });
  });

  // Handle Send button click
  sendBtn.addEventListener('click', async () => {
    // UI Loading State
    sendBtn.disabled = true;
    cancelBtn.disabled = true;
    folderTrigger.style.pointerEvents = 'none';
    folderTrigger.style.opacity = '0.6';
    folderTreeDropdown.classList.add('hidden-panel');
    toggleNewFolderBtn.style.display = 'none';
    sendBtn.innerHTML = '<div class="loading-spinner"></div> Sending...';
    statusDisplay.style.display = 'none';

    try {
      // 1. Store cropped base64 in chrome.storage.local to avoid Chrome IPC message size limits
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ pendingSnipDataUrl: croppedDataUrl }, () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      });

      // 2. Send lightweight upload request to background service worker with 20s safety timeout
      let hasResponded = false;
      const timeoutTimer = setTimeout(() => {
        if (!hasResponded) {
          hasResponded = true;
          showStatus('❌ Upload timed out. Please check extension background connection.', 'error');
          resetSendingState();
        }
      }, 20000);

      chrome.runtime.sendMessage({
        target: 'background',
        action: 'UPLOAD_SNIP',
        deck: selectedFolder
      }, (response) => {
        if (hasResponded) return;
        hasResponded = true;
        clearTimeout(timeoutTimer);

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
        } else if (response && (response.code === 'MISSING_IMGBB_KEY' || response.code === 'INVALID_IMGBB_KEY')) {
          showStatus(response.code === 'MISSING_IMGBB_KEY' 
            ? '🔑 ImgBB API Key is required to upload snips.' 
            : '❌ Invalid ImgBB API Key. Please re-enter your key.', 'error');
          imgbbKeyPanel.classList.remove('hidden-panel');
          imgbbKeyInput.value = '';
          imgbbKeyInput.focus();
          resetSendingState();
        } else {
          const err = response ? response.error : 'Upload failed.';
          showStatus('❌ ' + err, 'error');
          resetSendingState();
        }
      });
    } catch (err) {
      showStatus('❌ Error: ' + (err.message || 'Failed to save snip'), 'error');
      resetSendingState();
    }
  });

  function resetSendingState() {
    sendBtn.disabled = false;
    cancelBtn.disabled = false;
    folderTrigger.style.pointerEvents = 'auto';
    folderTrigger.style.opacity = '1';
    toggleNewFolderBtn.style.display = 'flex';
    sendBtn.innerHTML = 'Send to AutoAnki';
  }
}

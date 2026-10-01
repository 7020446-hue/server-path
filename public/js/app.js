// Main Application Logic for ServerPath Explorer
const App = {
  currentPath: '/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/',
  history: [],
  historyIndex: -1,
  items: [],
  filteredItems: [],
  viewMode: 'table', // 'table' | 'grid'
  sortField: 'name',
  sortAsc: true,
  bookmarks: [],
  systemInfo: null,
  autocompleteTimeout: null,

  theme: 'light',

  async init() {
    this.initTheme();
    Editor.init();
    this.loadBookmarks();
    this.setupEventListeners();
    await this.fetchSystemInfo();

    // Check if initial path is in URL hash or default
    const hashPath = window.location.hash.slice(1);
    const initialPath = hashPath ? decodeURIComponent(hashPath) : this.currentPath;
    await this.navigateTo(initialPath);
  },

  setupEventListeners() {
    const pathInput = document.getElementById('pathInput');
    const pathGoBtn = document.getElementById('pathGoBtn');
    const pathClearBtn = document.getElementById('pathClearBtn');
    const backBtn = document.getElementById('btnNavBack');
    const forwardBtn = document.getElementById('btnNavForward');
    const upBtn = document.getElementById('btnNavUp');
    const refreshBtn = document.getElementById('btnRefresh');
    const filterInput = document.getElementById('searchFilterInput');
    const newFolderBtn = document.getElementById('btnNewFolder');
    const newFileBtn = document.getElementById('btnNewFile');
    const uploadBtn = document.getElementById('btnUpload');
    const uploadInput = document.getElementById('fileUploadInput');
    const downloadZipBtn = document.getElementById('btnDownloadZip');
    const terminalToggleBtn = document.getElementById('btnToggleTerminal');
    const terminalCloseBtn = document.getElementById('terminalCloseBtn');
    const terminalInput = document.getElementById('terminalInput');
    const bookmarkBtn = document.getElementById('btnBookmark');
    const copyPathBtn = document.getElementById('btnCopyPath');

    // Navigation buttons
    pathGoBtn.addEventListener('click', () => this.navigateTo(pathInput.value));
    pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.hideAutocomplete();
        this.navigateTo(pathInput.value);
      }
    });

    pathInput.addEventListener('input', () => {
      pathClearBtn.style.display = pathInput.value ? 'flex' : 'none';
      this.handlePathAutocomplete(pathInput.value);
    });

    pathClearBtn.addEventListener('click', () => {
      pathInput.value = '';
      pathClearBtn.style.display = 'none';
      pathInput.focus();
    });

    // Close autocomplete on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.path-input-group')) {
        this.hideAutocomplete();
      }
    });

    backBtn.addEventListener('click', () => this.navBack());
    forwardBtn.addEventListener('click', () => this.navForward());
    upBtn.addEventListener('click', () => this.navUp());
    refreshBtn.addEventListener('click', () => this.navigateTo(this.currentPath, false));

    // Copy current path
    copyPathBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(this.currentPath);
      this.toast('Path copied to clipboard!', 'info');
    });

    // Bookmark toggle
    bookmarkBtn.addEventListener('click', () => this.toggleBookmark(this.currentPath));

    // Live search filter
    filterInput.addEventListener('input', (e) => {
      this.filterItems(e.target.value);
    });

    // View mode toggle
    document.getElementById('viewTableBtn').addEventListener('click', () => this.setViewMode('table'));
    document.getElementById('viewGridBtn').addEventListener('click', () => this.setViewMode('grid'));

    // New Folder / File modals
    newFolderBtn.addEventListener('click', () => this.openCreateModal('folder'));
    newFileBtn.addEventListener('click', () => this.openCreateModal('file'));

    // Upload files
    uploadBtn.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', (e) => this.handleFileUpload(e.target.files));

    // Drag and Drop
    this.setupDragAndDrop();

    // Download ZIP
    downloadZipBtn.addEventListener('click', () => {
      window.location.href = `/api/download-zip?path=${encodeURIComponent(this.currentPath)}`;
      this.toast('Preparing ZIP archive download...', 'info');
    });

    // Terminal Drawer
    terminalToggleBtn.addEventListener('click', () => this.toggleTerminal());
    terminalCloseBtn.addEventListener('click', () => this.toggleTerminal(false));
    terminalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = terminalInput.value.trim();
        if (cmd) {
          terminalInput.value = '';
          this.runTerminalCommand(cmd);
        }
      }
    });

    // Theme toggle
    const themeBtn = document.getElementById('btnThemeToggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Table sorting headers
    document.querySelectorAll('.file-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (this.sortField === field) {
          this.sortAsc = !this.sortAsc;
        } else {
          this.sortField = field;
          this.sortAsc = true;
        }
        this.applySort();
        this.renderItems();
      });
    });
  },

  initTheme() {
    const saved = localStorage.getItem('server_path_theme') || 'light';
    this.setTheme(saved);
  },

  setTheme(theme) {
    this.theme = theme;
    localStorage.setItem('server_path_theme', theme);

    const sunIcon = document.getElementById('themeIconSun');
    const moonIcon = document.getElementById('themeIconMoon');
    const textEl = document.getElementById('themeToggleText');

    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      if (sunIcon) sunIcon.style.display = 'none';
      if (moonIcon) moonIcon.style.display = 'inline-block';
      if (textEl) textEl.textContent = 'Dark';
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (sunIcon) sunIcon.style.display = 'inline-block';
      if (moonIcon) moonIcon.style.display = 'none';
      if (textEl) textEl.textContent = 'Light';
    }
  },

  toggleTheme() {
    const nextTheme = this.theme === 'light' ? 'dark' : 'light';
    this.setTheme(nextTheme);
    this.toast(`Switched to ${nextTheme} mode`, 'info');
  },

  async fetchSystemInfo() {
    try {
      const res = await fetch('/api/system');
      if (res.ok) {
        this.systemInfo = await res.json();
        this.renderPresets(this.systemInfo.presets || []);
        document.getElementById('headerServerBadge').textContent = `${this.systemInfo.platform} • Node ${this.systemInfo.nodeVersion}`;
      }
    } catch (e) {
      console.warn('System info error:', e);
    }
  },

  renderPresets(presets) {
    const container = document.getElementById('quickPresetsRow');
    if (!container) return;

    let html = `<span class="breadcrumb-label" style="margin-left:4px;">Quick Paths:</span>`;
    presets.forEach(p => {
      const isSubdomain = p.path.includes('[subdomain]');
      html += `
        <button class="preset-chip ${isSubdomain ? 'highlight' : ''}" onclick="App.navigateTo('${p.path.replace(/\\/g, '\\\\')}')">
          <span>${isSubdomain ? '⚡' : '📂'}</span>
          <span>${p.name}</span>
        </button>
      `;
    });
    container.innerHTML = html;
  },

  async navigateTo(newPath, addToHistory = true) {
    const pathInput = document.getElementById('pathInput');
    const loadingState = document.getElementById('loadingState');
    const contentArea = document.getElementById('explorerContent');

    pathInput.value = newPath;
    document.getElementById('pathClearBtn').style.display = newPath ? 'flex' : 'none';

    try {
      loadingState.style.display = 'flex';
      contentArea.style.display = 'none';

      const res = await fetch(`/api/browse?path=${encodeURIComponent(newPath)}`);
      const data = await res.json();

      if (!res.ok) {
        if (data.canCreate) {
          this.renderNotFoundState(newPath, data.error);
        } else {
          this.toast(data.error || 'Failed to browse path', 'error');
        }
        loadingState.style.display = 'none';
        return;
      }

      if (data.type === 'file') {
        // Direct file opened
        Editor.open(data.displayPath);
        if (data.parentPath) {
          await this.navigateTo(data.parentPath, addToHistory);
        }
        return;
      }

      // Successful directory browsing
      this.currentPath = data.displayPath;
      window.location.hash = encodeURIComponent(this.currentPath);

      if (addToHistory) {
        if (this.historyIndex < this.history.length - 1) {
          this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(this.currentPath);
        this.historyIndex = this.history.length - 1;
      }

      this.updateNavButtons();
      this.renderBreadcrumbs(data.breadcrumbs || []);
      this.items = data.items || [];
      this.applySort();
      this.filterItems(document.getElementById('searchFilterInput').value);
      this.updateBookmarkButton();

      // Update terminal prompt dir
      document.getElementById('terminalPromptDir').textContent = this.currentPath;

      loadingState.style.display = 'none';
      contentArea.style.display = 'block';
    } catch (err) {
      loadingState.style.display = 'none';
      this.toast('Error: ' + err.message, 'error');
    }
  },

  renderNotFoundState(targetPath, errorMsg) {
    const contentArea = document.getElementById('explorerContent');
    contentArea.style.display = 'block';
    contentArea.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" style="color:#f43f5e;border-color:rgba(244,63,94,0.3);">⚠️</div>
        <div class="empty-title">Path Not Found</div>
        <div class="empty-desc">The path <code>${targetPath}</code> does not exist on this server.</div>
        <div style="display:flex;gap:12px;margin-top:8px;">
          <button class="btn btn-primary" onclick="App.createPathStructure('${targetPath}')">
            ✨ Create Folder at this Path
          </button>
          <button class="btn btn-secondary" onclick="App.navigateTo('/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/')">
            Go to Subdomain Example
          </button>
        </div>
      </div>
    `;
  },

  async createPathStructure(folderPath) {
    try {
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentPath: pathDirname(folderPath),
          name: pathBasename(folderPath),
          type: 'folder'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      this.toast('Created directory successfully!', 'success');
      this.navigateTo(folderPath);
    } catch (err) {
      this.toast('Could not create path: ' + err.message, 'error');
    }
  },

  renderBreadcrumbs(breadcrumbs) {
    const container = document.getElementById('breadcrumbsBar');
    if (!container) return;

    let html = `<span class="breadcrumb-label">Path:</span>`;
    breadcrumbs.forEach((crumb, index) => {
      const isLast = index === breadcrumbs.length - 1;
      html += `
        <span class="breadcrumb-chip ${isLast ? 'active' : ''}" onclick="App.navigateTo('${crumb.path.replace(/\\/g, '\\\\')}')">
          ${crumb.name}
        </span>
      `;
      if (!isLast) {
        html += `<span class="breadcrumb-sep">/</span>`;
      }
    });
    container.innerHTML = html;
  },

  filterItems(query) {
    const cleanQuery = (query || '').toLowerCase().trim();
    if (!cleanQuery) {
      this.filteredItems = [...this.items];
    } else {
      this.filteredItems = this.items.filter(item => 
        item.name.toLowerCase().includes(cleanQuery) ||
        (item.extension && item.extension.toLowerCase().includes(cleanQuery))
      );
    }

    const counter = document.getElementById('itemsCounter');
    const folderCount = this.filteredItems.filter(i => i.isDirectory).length;
    const fileCount = this.filteredItems.filter(i => i.isFile).length;
    counter.textContent = `${folderCount} folders, ${fileCount} files`;

    this.renderItems();
  },

  applySort() {
    this.items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      let valA = a[this.sortField];
      let valB = b[this.sortField];

      if (this.sortField === 'name') {
        return this.sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      if (this.sortField === 'size') {
        return this.sortAsc ? (a.size - b.size) : (b.size - a.size);
      }
      if (this.sortField === 'mtime') {
        const timeA = new Date(a.mtime).getTime() || 0;
        const timeB = new Date(b.mtime).getTime() || 0;
        return this.sortAsc ? (timeA - timeB) : (timeB - timeA);
      }
      return 0;
    });
  },

  renderItems() {
    const tableView = document.getElementById('tableView');
    const gridView = document.getElementById('gridView');
    const emptyState = document.getElementById('emptyState');

    if (this.filteredItems.length === 0) {
      tableView.style.display = 'none';
      gridView.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    if (this.viewMode === 'table') {
      tableView.style.display = 'block';
      gridView.style.display = 'none';
      this.renderTable();
    } else {
      tableView.style.display = 'none';
      gridView.style.display = 'grid';
      this.renderGrid();
    }
  },

  renderTable() {
    const tbody = document.getElementById('fileTableBody');
    let html = '';

    this.filteredItems.forEach(item => {
      const iconSvg = getFileIcon(item);
      const isSubdomain = item.name.includes('[subdomain]');

      html += `
        <tr class="file-row" onclick="App.handleItemClick('${item.displayPath.replace(/\\/g, '\\\\')}', ${item.isDirectory})">
          <td>
            <div class="file-name-cell">
              <div class="file-icon-box ${item.isDirectory ? 'folder-icon-box' : ''}">
                ${iconSvg}
              </div>
              <span style="${isSubdomain ? 'color:#818cf8;font-weight:700;' : ''}">${item.name}</span>
            </div>
          </td>
          <td>${item.formattedSize}</td>
          <td>${item.formattedDate}</td>
          <td style="font-family:var(--font-mono);font-size:0.8rem;color:var(--text-muted);">${item.permissions || '-'}</td>
          <td class="file-actions-cell" onclick="event.stopPropagation()">
            <div class="file-quick-actions">
              ${!item.isDirectory ? `
                <button class="action-btn-mini" title="Preview / Edit" onclick="Editor.open('${item.displayPath.replace(/\\/g, '\\\\')}')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
                <button class="action-btn-mini" title="Download" onclick="window.location.href='/api/file?path=${encodeURIComponent(item.displayPath)}&download=1'">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </button>
              ` : `
                <button class="action-btn-mini" title="Download as ZIP" onclick="window.location.href='/api/download-zip?path=${encodeURIComponent(item.displayPath)}'">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </button>
              `}
              <button class="action-btn-mini" title="Copy Path" onclick="App.copyItemPath('${item.displayPath.replace(/\\/g, '\\\\')}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
              </button>
              <button class="action-btn-mini" title="Rename" onclick="App.openRenameModal('${item.displayPath.replace(/\\/g, '\\\\')}', '${item.name}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>
              </button>
              <button class="action-btn-mini danger" title="Delete" onclick="App.openDeleteModal('${item.displayPath.replace(/\\/g, '\\\\')}', '${item.name}', ${item.isDirectory})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  renderGrid() {
    const gridView = document.getElementById('gridView');
    let html = '';

    this.filteredItems.forEach(item => {
      const iconSvg = getFileIcon(item);
      const isSubdomain = item.name.includes('[subdomain]');

      html += `
        <div class="grid-card" onclick="App.handleItemClick('${item.displayPath.replace(/\\/g, '\\\\')}', ${item.isDirectory})">
          <div class="grid-card-icon-area">
            <div style="transform: scale(2);">
              ${iconSvg}
            </div>
          </div>
          <div class="grid-card-info">
            <div class="grid-card-name" style="${isSubdomain ? 'color:#818cf8;font-weight:700;' : ''}">${item.name}</div>
            <div class="grid-card-meta">
              <span>${item.formattedSize}</span>
              <span>${item.isDirectory ? 'Folder' : (item.extension || 'File')}</span>
            </div>
          </div>
        </div>
      `;
    });

    gridView.innerHTML = html;
  },

  handleItemClick(itemPath, isDirectory) {
    if (isDirectory) {
      this.navigateTo(itemPath);
    } else {
      Editor.open(itemPath);
    }
  },

  setViewMode(mode) {
    this.viewMode = mode;
    document.getElementById('viewTableBtn').classList.toggle('active', mode === 'table');
    document.getElementById('viewGridBtn').classList.toggle('active', mode === 'grid');
    this.renderItems();
  },

  navBack() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.navigateTo(this.history[this.historyIndex], false);
    }
  },

  navForward() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.navigateTo(this.history[this.historyIndex], false);
    }
  },

  navUp() {
    const parts = this.currentPath.replace(/\/$/, '').split(/[\/\\]/);
    if (parts.length > 1) {
      parts.pop();
      let parent = parts.join('/');
      if (this.currentPath.startsWith('/') && !parent.startsWith('/')) {
        parent = '/' + parent;
      }
      if (!parent) parent = '/';
      this.navigateTo(parent);
    }
  },

  updateNavButtons() {
    document.getElementById('btnNavBack').disabled = this.historyIndex <= 0;
    document.getElementById('btnNavForward').disabled = this.historyIndex >= this.history.length - 1;
  },

  // Autocomplete
  handlePathAutocomplete(query) {
    clearTimeout(this.autocompleteTimeout);
    if (!query || query.length < 2) {
      this.hideAutocomplete();
      return;
    }

    this.autocompleteTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/autocomplete?query=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = await res.json();
        this.renderAutocomplete(data.suggestions || []);
      } catch (e) {}
    }, 150);
  },

  renderAutocomplete(suggestions) {
    const dropdown = document.getElementById('autocompleteDropdown');
    if (!suggestions || suggestions.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    let html = '';
    suggestions.forEach(item => {
      html += `
        <div class="autocomplete-item" onclick="App.selectAutocomplete('${item.fullPath.replace(/\\/g, '\\\\')}')">
          <span class="autocomplete-item-icon">${item.isDirectory ? '📁' : '📄'}</span>
          <span>${item.fullPath}</span>
        </div>
      `;
    });

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
  },

  selectAutocomplete(fullPath) {
    document.getElementById('pathInput').value = fullPath;
    this.hideAutocomplete();
    this.navigateTo(fullPath);
  },

  hideAutocomplete() {
    document.getElementById('autocompleteDropdown').style.display = 'none';
  },

  // Bookmarks
  loadBookmarks() {
    try {
      const saved = localStorage.getItem('server_path_bookmarks');
      this.bookmarks = saved ? JSON.parse(saved) : [
        '/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/'
      ];
    } catch (e) {
      this.bookmarks = ['/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/'];
    }
  },

  saveBookmarks() {
    localStorage.setItem('server_path_bookmarks', JSON.stringify(this.bookmarks));
    this.updateBookmarkButton();
  },

  toggleBookmark(path) {
    const index = this.bookmarks.indexOf(path);
    if (index >= 0) {
      this.bookmarks.splice(index, 1);
      this.toast('Bookmark removed', 'info');
    } else {
      this.bookmarks.push(path);
      this.toast('Added to bookmarks! ⭐', 'success');
    }
    this.saveBookmarks();
  },

  updateBookmarkButton() {
    const isBookmarked = this.bookmarks.includes(this.currentPath);
    const starBtn = document.getElementById('btnBookmark');
    if (starBtn) {
      starBtn.classList.toggle('active', isBookmarked);
      starBtn.title = isBookmarked ? 'Remove Bookmark' : 'Add to Bookmarks';
    }
  },

  copyItemPath(itemPath) {
    navigator.clipboard.writeText(itemPath);
    this.toast('Path copied: ' + itemPath, 'info');
  },

  // File Upload
  setupDragAndDrop() {
    const overlay = document.getElementById('dropOverlay');
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      overlay.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        overlay.classList.remove('active');
      }
    });

    window.addEventListener('dragover', (e) => e.preventDefault());

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      overlay.classList.remove('active');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        this.handleFileUpload(e.dataTransfer.files);
      }
    });
  },

  async handleFileUpload(files) {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    formData.append('targetDir', this.currentPath);

    this.toast(`Uploading ${files.length} file(s)...`, 'info');

    try {
      const res = await fetch(`/api/upload?targetDir=${encodeURIComponent(this.currentPath)}`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      this.toast(data.message, 'success');
      this.navigateTo(this.currentPath, false);
    } catch (err) {
      this.toast('Upload error: ' + err.message, 'error');
    }
  },

  // Create Modal
  openCreateModal(type) {
    const modal = document.getElementById('createModal');
    const title = document.getElementById('createModalTitle');
    const label = document.getElementById('createModalLabel');
    const input = document.getElementById('createModalInput');
    const targetDirEl = document.getElementById('createModalTargetDir');

    title.textContent = type === 'folder' ? 'Create New Folder' : 'Create New File';
    label.textContent = type === 'folder' ? 'Folder Name' : 'File Name (e.g. page.tsx, config.json)';
    input.value = '';
    targetDirEl.textContent = this.currentPath;

    modal.dataset.type = type;
    modal.classList.add('active');
    setTimeout(() => input.focus(), 50);
  },

  async submitCreate() {
    const modal = document.getElementById('createModal');
    const type = modal.dataset.type;
    const input = document.getElementById('createModalInput');
    const name = input.value.trim();

    if (!name) return;

    try {
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentPath: this.currentPath,
          name: name,
          type: type
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      this.toast(data.message, 'success');
      modal.classList.remove('active');
      this.navigateTo(this.currentPath, false);
    } catch (err) {
      this.toast(err.message, 'error');
    }
  },

  // Rename Modal
  openRenameModal(itemPath, currentName) {
    const modal = document.getElementById('renameModal');
    const input = document.getElementById('renameModalInput');

    input.value = currentName;
    modal.dataset.path = itemPath;
    modal.classList.add('active');
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  },

  async submitRename() {
    const modal = document.getElementById('renameModal');
    const itemPath = modal.dataset.path;
    const input = document.getElementById('renameModalInput');
    const newName = input.value.trim();

    if (!newName) return;

    try {
      const res = await fetch('/api/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: itemPath,
          newName: newName
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      this.toast(data.message, 'success');
      modal.classList.remove('active');
      this.navigateTo(this.currentPath, false);
    } catch (err) {
      this.toast(err.message, 'error');
    }
  },

  // Delete Modal
  openDeleteModal(itemPath, itemName, isDirectory) {
    const modal = document.getElementById('deleteModal');
    const desc = document.getElementById('deleteModalDesc');

    desc.innerHTML = `Are you sure you want to permanently delete ${isDirectory ? 'folder' : 'file'} <strong>${itemName}</strong>?`;
    modal.dataset.path = itemPath;
    modal.classList.add('active');
  },

  async submitDelete() {
    const modal = document.getElementById('deleteModal');
    const itemPath = modal.dataset.path;

    try {
      const res = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: itemPath })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      this.toast(data.message, 'success');
      modal.classList.remove('active');
      this.navigateTo(this.currentPath, false);
    } catch (err) {
      this.toast(err.message, 'error');
    }
  },

  // Terminal Drawer
  toggleTerminal(force) {
    const terminal = document.getElementById('terminalDrawer');
    const btn = document.getElementById('btnToggleTerminal');
    const isActive = force !== undefined ? force : !terminal.classList.contains('active');

    terminal.classList.toggle('active', isActive);
    btn.classList.toggle('active', isActive);

    if (isActive) {
      document.getElementById('terminalInput').focus();
    }
  },

  async runTerminalCommand(command) {
    const outputEl = document.getElementById('terminalOutput');
    const currentDir = this.currentPath;

    outputEl.innerHTML += `\n<span class="terminal-cmd">$ ${command}</span>\n`;

    try {
      const res = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: command,
          cwd: currentDir
        })
      });

      const data = await res.json();
      if (data.stdout) outputEl.innerHTML += `<span class="terminal-stdout">${this.escapeHtml(data.stdout)}</span>`;
      if (data.stderr) outputEl.innerHTML += `<span class="terminal-stderr">${this.escapeHtml(data.stderr)}</span>`;
      if (!data.stdout && !data.stderr) outputEl.innerHTML += `<span class="terminal-meta">(command completed with code ${data.exitCode})</span>\n`;
    } catch (err) {
      outputEl.innerHTML += `<span class="terminal-stderr">Execution error: ${err.message}</span>\n`;
    }

    const body = document.getElementById('terminalBody');
    body.scrollTop = body.scrollHeight;
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  },

  escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};

// Global helper functions
function pathDirname(p) {
  const parts = p.replace(/\/$/, '').split(/[\/\\]/);
  parts.pop();
  return parts.join('/') || '/';
}
function pathBasename(p) {
  return p.replace(/\/$/, '').split(/[\/\\]/).pop();
}

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});

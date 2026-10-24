// Global Fetch Interceptor to attach Auth tokens and handle 401s
(function () {
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    let [resource, config] = args;
    config = config || {};
    config.headers = config.headers || {};

    const token = localStorage.getItem('token');
    if (token) {
      if (config.headers instanceof Headers) {
        if (!config.headers.has('Authorization')) {
          config.headers.set('Authorization', `Bearer ${token}`);
        }
      } else if (Array.isArray(config.headers)) {
        if (!config.headers.some(([k]) => k.toLowerCase() === 'authorization')) {
          config.headers.push(['Authorization', `Bearer ${token}`]);
        }
      } else {
        if (!config.headers['Authorization'] && !config.headers['authorization']) {
          config.headers['Authorization'] = `Bearer ${token}`;
        }
      }
    }

    const response = await originalFetch(resource, config);
    if (response.status === 401 && typeof resource === 'string' && resource.startsWith('/api/') && !resource.startsWith('/api/auth/')) {
      if (window.App && typeof window.App.handleUnauthorized === 'function') {
        window.App.handleUnauthorized();
      }
    }
    return response;
  };
})();

// Main Application Logic for ServerPath Explorer
const App = {
  currentPath: '/',
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
  user: null,
  authMode: 'login', // 'login' | 'activate' | 'reset'
  showPassword: false,

  async init() {
    this.initTheme();
    Editor.init();
    this.loadBookmarks();
    this.setupEventListeners();
    await this.initAuth();
  },

  async initAuth() {
    // Check URL parameters for token, errors, or invite/reset
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      localStorage.setItem('token', urlToken);
      document.cookie = `token=${urlToken}; path=/; max-age=2592000; SameSite=Lax`;
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    const invite = urlParams.get('invite');
    if (invite) {
      const inviteInput = document.getElementById('authInviteInput');
      if (inviteInput) inviteInput.value = invite;
      this.setAuthMode('activate');
    }
    const reset = urlParams.get('reset');
    if (reset) {
      this.setAuthMode('reset');
    }
    const errParam = urlParams.get('error');
    if (errParam) {
      this.showAuthError(decodeURIComponent(errParam));
    }

    const authenticated = await this.checkAuth();
    if (authenticated) {
      await this.fetchSystemInfo();
      const hashPath = window.location.hash.slice(1);
      const initialPath = hashPath ? decodeURIComponent(hashPath) : (this.systemInfo?.defaultPath || this.currentPath);
      await this.navigateTo(initialPath);
    }
  },

  async checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          this.user = data.user;
          this.updateAuthUI();
          this.hideAuthGate();
          return true;
        }
      }
    } catch (e) {
      console.warn('Auth check error:', e);
    }
    this.user = null;
    this.updateAuthUI();
    this.showAuthGate();
    return false;
  },

  updateAuthUI() {
    const badge = document.getElementById('userHeaderBadge');
    const headerLoginBtn = document.getElementById('btnHeaderLogin');
    if (this.user) {
      if (badge) badge.style.display = 'flex';
      if (headerLoginBtn) headerLoginBtn.style.display = 'none';
      this.renderUserBadge();
    } else {
      if (badge) badge.style.display = 'none';
      if (headerLoginBtn) headerLoginBtn.style.display = 'inline-flex';
    }
  },

  showAuthGate(errorMsg) {
    const gate = document.getElementById('authGate');
    if (gate) gate.style.display = 'flex';
    this.updateAuthUI();
    if (errorMsg) {
      this.showAuthError(errorMsg);
    }
  },

  hideAuthGate() {
    const gate = document.getElementById('authGate');
    if (gate) gate.style.display = 'none';
    this.clearAuthMessages();
  },

  handleUnauthorized() {
    this.user = null;
    this.updateAuthUI();
    this.showAuthGate('Your session has expired. Please sign in again.');
  },

  toggleUserMenu(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const dropdown = document.getElementById('userMenuDropdown');
    if (!dropdown) return;
    const isShowing = dropdown.style.display === 'block';
    dropdown.style.display = isShowing ? 'none' : 'block';
  },

  closeUserMenu() {
    const dropdown = document.getElementById('userMenuDropdown');
    if (dropdown) dropdown.style.display = 'none';
  },

  renderUserBadge() {
    const container = document.getElementById('userProfileContainer');
    const badge = document.getElementById('userHeaderBadge');
    const avatar = document.getElementById('userAvatarText');
    const emailText = document.getElementById('userEmailText');
    const roleBadge = document.getElementById('userRoleBadge');

    const menuAvatar = document.getElementById('userMenuAvatar');
    const menuEmail = document.getElementById('userMenuEmail');
    const menuRole = document.getElementById('userMenuRole');
    const menuStatus = document.getElementById('userMenuServerStatus');
    const loginBtn = document.getElementById('btnHeaderLogin');

    if (!this.user) {
      if (container) container.style.display = 'none';
      if (loginBtn) loginBtn.style.display = 'inline-flex';
      return;
    }

    if (container) container.style.display = 'flex';
    if (loginBtn) loginBtn.style.display = 'none';

    const email = this.user.email || 'user';
    const initial = (this.user.name ? this.user.name[0] : email[0]).toUpperCase();
    if (avatar) avatar.textContent = initial;
    if (emailText) emailText.textContent = email;
    if (roleBadge) {
      roleBadge.textContent = this.user.role || 'user';
      roleBadge.style.color = (this.user.role === 'admin' || this.user.role === 'super-admin') ? '#2563eb' : '#64748b';
    }

    if (menuAvatar) menuAvatar.textContent = initial;
    if (menuEmail) menuEmail.textContent = email;
    if (menuRole) menuRole.textContent = (this.user.role || 'user').toUpperCase();
    if (menuStatus && this.systemInfo) {
      menuStatus.textContent = `Online • ${this.systemInfo.platform} • Node ${this.systemInfo.nodeVersion}`;
    }
  },

  setAuthMode(mode) {
    this.authMode = mode;
    this.clearAuthMessages();

    const subtitle = document.getElementById('authSubtitle');
    const title = document.getElementById('authTitle');
    const nameGroup = document.getElementById('authNameGroup');
    const pwdGroup = document.getElementById('authPasswordGroup');
    const confirmPwdGroup = document.getElementById('authConfirmPasswordGroup');
    const inviteGroup = document.getElementById('authInviteGroup');
    const rememberRow = document.getElementById('authRememberRow');
    const submitText = document.getElementById('authSubmitText');
    const githubBtn = document.getElementById('authGithubBtn');
    const switchPrompt = document.getElementById('authSwitchPrompt');
    const switchBtn = document.getElementById('authSwitchBtn');

    if (mode === 'login') {
      if (subtitle) subtitle.textContent = 'Please enter your details';
      if (title) title.textContent = 'Welcome back';
      if (nameGroup) nameGroup.style.display = 'none';
      if (pwdGroup) pwdGroup.style.display = 'block';
      if (confirmPwdGroup) confirmPwdGroup.style.display = 'none';
      if (inviteGroup) inviteGroup.style.display = 'none';
      if (rememberRow) rememberRow.style.display = 'flex';
      if (submitText) submitText.textContent = 'Sign in';
      if (githubBtn) githubBtn.style.display = 'flex';
      if (switchPrompt) switchPrompt.textContent = "Don't have an account?";
      if (switchBtn) switchBtn.textContent = 'Sign up';
    } else if (mode === 'activate') {
      if (subtitle) subtitle.textContent = 'Start your journey';
      if (title) title.textContent = 'Create an account';
      if (nameGroup) nameGroup.style.display = 'block';
      if (pwdGroup) pwdGroup.style.display = 'block';
      if (confirmPwdGroup) confirmPwdGroup.style.display = 'block';
      if (inviteGroup) inviteGroup.style.display = 'block';
      if (rememberRow) rememberRow.style.display = 'none';
      if (submitText) submitText.textContent = 'Sign up';
      if (githubBtn) githubBtn.style.display = 'flex';
      if (switchPrompt) switchPrompt.textContent = 'Already have an account?';
      if (switchBtn) switchBtn.textContent = 'Sign in';
    } else if (mode === 'reset') {
      if (subtitle) subtitle.textContent = 'Password recovery';
      if (title) title.textContent = 'Reset password';
      if (nameGroup) nameGroup.style.display = 'none';
      if (pwdGroup) pwdGroup.style.display = 'none';
      if (confirmPwdGroup) confirmPwdGroup.style.display = 'none';
      if (inviteGroup) inviteGroup.style.display = 'none';
      if (rememberRow) rememberRow.style.display = 'none';
      if (submitText) submitText.textContent = 'Send recovery link';
      if (githubBtn) githubBtn.style.display = 'none';
      if (switchPrompt) switchPrompt.textContent = 'Remember your password?';
      if (switchBtn) switchBtn.textContent = 'Sign in';
    }
  },

  toggleAuthMode() {
    if (this.authMode === 'login') {
      this.setAuthMode('activate');
    } else {
      this.setAuthMode('login');
    }
  },

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
    const pwdInput = document.getElementById('authPasswordInput');
    const confirmPwdInput = document.getElementById('authConfirmPasswordInput');
    const eyeIcon = document.getElementById('authEyeIcon');
    const eyeOffIcon = document.getElementById('authEyeOffIcon');

    const type = this.showPassword ? 'text' : 'password';
    if (pwdInput) pwdInput.type = type;
    if (confirmPwdInput) confirmPwdInput.type = type;

    if (eyeIcon) eyeIcon.style.display = this.showPassword ? 'none' : 'block';
    if (eyeOffIcon) eyeOffIcon.style.display = this.showPassword ? 'block' : 'none';
  },

  clearAuthMessages() {
    const successAlert = document.getElementById('authSuccessAlert');
    const errorAlert = document.getElementById('authErrorAlert');
    const lockoutNotice = document.getElementById('authLockoutNotice');
    if (successAlert) successAlert.style.display = 'none';
    if (errorAlert) errorAlert.style.display = 'none';
    if (lockoutNotice) lockoutNotice.style.display = 'none';
  },

  showAuthError(msg, lockoutMins) {
    const errorAlert = document.getElementById('authErrorAlert');
    const errorMsg = document.getElementById('authErrorMsg');
    const lockoutNotice = document.getElementById('authLockoutNotice');
    const lockoutSpan = document.getElementById('authLockoutMins');

    if (errorMsg) errorMsg.textContent = msg;
    if (errorAlert) errorAlert.style.display = 'flex';

    if (lockoutMins && lockoutNotice && lockoutSpan) {
      lockoutSpan.textContent = lockoutMins;
      lockoutNotice.style.display = 'flex';
    } else if (lockoutNotice) {
      lockoutNotice.style.display = 'none';
    }
  },

  showAuthSuccess(msg) {
    const successAlert = document.getElementById('authSuccessAlert');
    const successMsg = document.getElementById('authSuccessMsg');
    if (successMsg) successMsg.textContent = msg;
    if (successAlert) successAlert.style.display = 'flex';
  },

  async handleAuthSubmit(e) {
    e.preventDefault();
    this.clearAuthMessages();

    const email = document.getElementById('authEmailInput')?.value.trim();
    const password = document.getElementById('authPasswordInput')?.value || '';
    const name = document.getElementById('authNameInput')?.value.trim();
    const confirmPassword = document.getElementById('authConfirmPasswordInput')?.value || '';
    const inviteToken = document.getElementById('authInviteInput')?.value.trim();
    const rememberMe = document.getElementById('authRememberMe')?.checked ?? true;

    if (!email) {
      this.showAuthError('Please enter a valid email address.');
      return;
    }

    if (this.authMode === 'activate') {
      if (password.length < 8) {
        this.showAuthError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        this.showAuthError('Passwords do not match.');
        return;
      }
    }

    const submitBtn = document.getElementById('authSubmitBtn');
    const spinner = document.getElementById('authSubmitSpinner');
    const submitText = document.getElementById('authSubmitText');

    if (submitBtn) submitBtn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';

    try {
      if (this.authMode === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, rememberMe })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to sign in.');
        }

        if (data.token) {
          localStorage.setItem('token', data.token);
          const maxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
          document.cookie = `token=${data.token}; path=/; max-age=${maxAge}; SameSite=Lax`;
          if (data.profile?.role) {
            document.cookie = `user_role=${data.profile.role}; path=/; max-age=${maxAge}; SameSite=Lax`;
          }
        }

        this.user = data.profile || { email };
        this.updateAuthUI();
        this.hideAuthGate();
        this.toast('Signed in successfully!', 'success');

        // Initialize application content
        await this.fetchSystemInfo();
        const hashPath = window.location.hash.slice(1);
        const initialPath = hashPath ? decodeURIComponent(hashPath) : this.currentPath;
        await this.navigateTo(initialPath);

      } else if (this.authMode === 'activate') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name, inviteToken })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Registration failed.');
        }

        this.showAuthSuccess('Account created! You can now sign in.');
        this.setAuthMode('login');

      } else if (this.authMode === 'reset') {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Password reset request failed.');
        }

        this.showAuthSuccess(data.message || 'If an account exists with this email, a reset link has been sent.');
        this.setAuthMode('login');
      }
    } catch (err) {
      this.showAuthError(err.message || 'An unexpected error occurred.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  },

  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) { }

    localStorage.removeItem('token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_uid');
    document.cookie = 'token=; max-age=0; path=/';
    document.cookie = 'user_role=; max-age=0; path=/';

    this.user = null;
    this.updateAuthUI();
    this.showAuthGate();
    this.toast('You have signed out.', 'info');
  },

  setupEventListeners() {
    const on = (id, event, fn) => {
      const el = typeof id === 'string' ? document.getElementById(id) : id;
      if (el) el.addEventListener(event, fn);
    };

    const pathInput = document.getElementById('pathInput');
    const pathClearBtn = document.getElementById('pathClearBtn');
    const uploadInput = document.getElementById('fileUploadInput');

    on('pathGoBtn', 'click', () => {
      if (pathInput) this.navigateTo(pathInput.value);
    });

    on(pathInput, 'keydown', (e) => {
      if (e.key === 'Enter') {
        this.hideAutocomplete();
        this.navigateTo(pathInput.value);
      }
    });

    on(pathInput, 'input', () => {
      if (pathClearBtn) pathClearBtn.style.display = pathInput.value ? 'flex' : 'none';
      this.handlePathAutocomplete(pathInput.value);
    });

    on(pathClearBtn, 'click', () => {
      if (pathInput) {
        pathInput.value = '';
        pathInput.focus();
      }
      if (pathClearBtn) pathClearBtn.style.display = 'none';
    });

    // Close autocomplete and user menu on outside click
    document.addEventListener('click', (e) => {
      if (!e.target || !e.target.closest || !e.target.closest('.path-input-group')) {
        this.hideAutocomplete();
      }
      if (!e.target || !e.target.closest || !e.target.closest('#userProfileContainer')) {
        this.closeUserMenu();
      }
    });

    on('btnNavBack', 'click', () => this.navBack());
    on('btnNavForward', 'click', () => this.navForward());
    on('btnNavUp', 'click', () => this.navUp());
    on('btnRefresh', 'click', () => this.navigateTo(this.currentPath, false));

    // Copy current path
    on('btnCopyPath', 'click', () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(this.currentPath);
        this.toast('Path copied to clipboard!', 'info');
      }
    });

    // Bookmark toggle
    on('btnBookmark', 'click', () => this.toggleBookmark(this.currentPath));

    // Live search filter
    on('searchFilterInput', 'input', (e) => {
      this.filterItems(e.target.value);
    });

    // View mode toggle
    on('viewTableBtn', 'click', () => this.setViewMode('table'));
    on('viewGridBtn', 'click', () => this.setViewMode('grid'));

    // New Folder / File modals
    on('btnNewFolder', 'click', () => this.openCreateModal('folder'));
    on('btnNewFile', 'click', () => this.openCreateModal('file'));

    // Upload files
    on('btnUpload', 'click', () => {
      if (uploadInput) uploadInput.click();
    });
    on(uploadInput, 'change', (e) => this.handleFileUpload(e.target.files));

    // Drag and Drop
    this.setupDragAndDrop();

    // Download ZIP
    on('btnDownloadZip', 'click', () => {
      this.downloadFolderAsZip(this.currentPath);
    });

    // Terminal Drawer
    on('btnToggleTerminal', 'click', () => this.toggleTerminal());
    on('terminalCloseBtn', 'click', () => this.toggleTerminal(false));
    const termInput = document.getElementById('terminalInput');
    on(termInput, 'keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = termInput.value.trim();
        if (cmd) {
          termInput.value = '';
          this.runTerminalCommand(cmd);
        }
      }
    });

    // Theme toggle
    on('btnThemeToggle', 'click', () => this.toggleTheme());

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
        if (this.systemInfo.defaultPath && (!this.currentPath || this.currentPath === '/')) {
          this.currentPath = this.systemInfo.defaultPath;
        }
        if (!this.bookmarks || !this.bookmarks.length) {
          this.bookmarks = [this.systemInfo.defaultPath || '/'];
        }
        this.renderPresets(this.systemInfo.presets || []);
        const badge = document.getElementById('headerServerBadge');
        if (badge) badge.textContent = `${this.systemInfo.platform} • Node ${this.systemInfo.nodeVersion}`;
        const menuStatus = document.getElementById('userMenuServerStatus');
        if (menuStatus) menuStatus.textContent = `Online • ${this.systemInfo.platform} • Node ${this.systemInfo.nodeVersion}`;
        const brandDot = document.getElementById('brandStatusDot');
        if (brandDot) brandDot.className = 'brand-status-dot online';
      }
    } catch (e) {
      console.warn('System info error:', e);
    }
  },

  navigateToHome() {
    const homePath = this.systemInfo?.defaultPath || this.systemInfo?.cwd || '/';
    this.navigateTo(homePath);
  },

  downloadFolderAsZip(folderPath) {
    const target = folderPath || this.currentPath;
    const token = localStorage.getItem('token');
    let url = `/api/download-zip?path=${encodeURIComponent(target)}`;
    if (token) {
      url += `&token=${encodeURIComponent(token)}`;
    }
    this.toast('Preparing ZIP archive download...', 'info');
    window.location.href = url;
  },

  downloadFile(filePath) {
    const token = localStorage.getItem('token');
    let url = `/api/file?path=${encodeURIComponent(filePath)}&download=1`;
    if (token) {
      url += `&token=${encodeURIComponent(token)}`;
    }
    window.location.href = url;
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

    if (pathInput) pathInput.value = newPath;
    const pathClearBtn = document.getElementById('pathClearBtn');
    if (pathClearBtn) pathClearBtn.style.display = newPath ? 'flex' : 'none';

    try {
      if (loadingState) loadingState.style.display = 'flex';
      if (contentArea) contentArea.style.display = 'none';

      const res = await fetch(`/api/browse?path=${encodeURIComponent(newPath)}`);
      const data = await res.json();

      if (!res.ok) {
        if (data.canCreate) {
          this.renderNotFoundState(newPath, data.error);
        } else {
          this.toast(data.error || 'Failed to browse path', 'error');
        }
        if (loadingState) loadingState.style.display = 'none';
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
      const filterInput = document.getElementById('searchFilterInput');
      this.filterItems(filterInput ? filterInput.value : '');
      this.updateBookmarkButton();

      // Update terminal prompt dir
      const termPromptDir = document.getElementById('terminalPromptDir');
      if (termPromptDir) termPromptDir.textContent = this.currentPath;

      if (loadingState) loadingState.style.display = 'none';
      if (contentArea) contentArea.style.display = 'block';
    } catch (err) {
      if (loadingState) loadingState.style.display = 'none';
      this.toast('Error: ' + err.message, 'error');
    }
  },

  renderNotFoundState(targetPath, errorMsg) {
    const contentArea = document.getElementById('explorerContent');
    const tableView = document.getElementById('tableView');
    const gridView = document.getElementById('gridView');
    const emptyState = document.getElementById('emptyState');
    const notFoundState = document.getElementById('notFoundState');
    const notFoundDesc = document.getElementById('notFoundDesc');
    const notFoundActions = document.getElementById('notFoundActions');

    if (contentArea) contentArea.style.display = 'block';
    if (tableView) tableView.style.display = 'none';
    if (gridView) gridView.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';

    if (notFoundState) {
      notFoundState.style.display = 'flex';
      if (notFoundDesc) {
        notFoundDesc.innerHTML = `The path <code>${this.escapeHtml(targetPath)}</code> does not exist on this server.`;
      }
      if (notFoundActions) {
        notFoundActions.innerHTML = `
          <button class="btn btn-primary" onclick="App.createPathStructure('${this.escapeHtml(targetPath)}')">
            ✨ Create Folder at this Path
          </button>
          <button class="btn btn-secondary" onclick="App.navigateToHome()">
            Go to Server Root
          </button>
        `;
      }
    }
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
    if (counter) counter.textContent = `${folderCount} folders, ${fileCount} files`;

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
    const notFoundState = document.getElementById('notFoundState');

    if (notFoundState) notFoundState.style.display = 'none';

    if (this.filteredItems.length === 0) {
      if (tableView) tableView.style.display = 'none';
      if (gridView) gridView.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    if (this.viewMode === 'table') {
      if (tableView) tableView.style.display = 'block';
      if (gridView) gridView.style.display = 'none';
      this.renderTable();
    } else {
      if (tableView) tableView.style.display = 'none';
      if (gridView) gridView.style.display = 'grid';
      this.renderGrid();
    }
  },

  renderTable() {
    const tbody = document.getElementById('fileTableBody');
    if (!tbody) return;
    let html = '';

    this.filteredItems.forEach(item => {
      const iconSvg = getFileIcon(item);
      const isSubdomain = item.name.includes('[subdomain]');

      html += `
        <tr class="file-row" onclick="App.handleItemClick('${item.displayPath.replace(/\\/g, '\\\\')}', ${item.isDirectory})">
          <td class="col-name">
            <div class="file-name-cell">
              <div class="file-icon-box ${item.isDirectory ? 'folder-icon-box' : ''}">
                ${iconSvg}
              </div>
              <div class="file-name-content">
                <span class="file-name-text" style="${isSubdomain ? 'color:#818cf8;font-weight:700;' : ''}">${item.name}</span>
                <span class="file-mobile-meta">${item.formattedDate}${item.formattedSize && item.formattedSize !== '-' ? ' • ' + item.formattedSize : ''}</span>
              </div>
            </div>
          </td>
          <td class="col-size">${item.formattedSize}</td>
          <td class="col-mtime">${item.formattedDate}</td>
          <td class="col-perms" style="font-family:var(--font-mono);font-size:0.8rem;color:var(--text-muted);">${item.permissions || '-'}</td>
          <td class="col-actions file-actions-cell" onclick="event.stopPropagation()">
            <div class="file-quick-actions">
              ${!item.isDirectory ? `
                <button class="action-btn-mini" title="Preview / Edit" onclick="Editor.open('${item.displayPath.replace(/\\/g, '\\\\')}')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
                <button class="action-btn-mini" title="Download" onclick="App.downloadFile('${item.displayPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </button>
              ` : `
                <button class="action-btn-mini" title="Download as ZIP" onclick="App.downloadFolderAsZip('${item.displayPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </button>
              `}
              <button class="action-btn-mini action-btn-copy" title="Copy Path" onclick="App.copyItemPath('${item.displayPath.replace(/\\/g, '\\\\')}')">
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
    if (!gridView) return;
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
    const tableBtn = document.getElementById('viewTableBtn');
    const gridBtn = document.getElementById('viewGridBtn');
    if (tableBtn) tableBtn.classList.toggle('active', mode === 'table');
    if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');
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
    const backBtn = document.getElementById('btnNavBack');
    const forwardBtn = document.getElementById('btnNavForward');
    if (backBtn) backBtn.disabled = this.historyIndex <= 0;
    if (forwardBtn) forwardBtn.disabled = this.historyIndex >= this.history.length - 1;
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
      } catch (e) { }
    }, 150);
  },

  renderAutocomplete(suggestions) {
    const dropdown = document.getElementById('autocompleteDropdown');
    if (!dropdown) return;
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
    const input = document.getElementById('pathInput');
    if (input) input.value = fullPath;
    this.hideAutocomplete();
    this.navigateTo(fullPath);
  },

  hideAutocomplete() {
    const dropdown = document.getElementById('autocompleteDropdown');
    if (dropdown) dropdown.style.display = 'none';
  },

  // Bookmarks
  loadBookmarks() {
    try {
      const saved = localStorage.getItem('server_path_bookmarks');
      if (saved) {
        this.bookmarks = JSON.parse(saved);
        return;
      }
    } catch (e) {}
    this.bookmarks = [];
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

      let data = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const rawText = await res.text();
        const cleanMsg = rawText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        throw new Error(cleanMsg || `Upload failed (Status ${res.status})`);
      }

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

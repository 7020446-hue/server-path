// File Editor & Media Viewer Module
const Editor = {
  currentFile: null,
  isMarkdownPreview: true,

  init() {
    this.drawer = document.getElementById('editorDrawer');
    this.titleEl = document.getElementById('editorFileName');
    this.pathEl = document.getElementById('editorFilePath');
    this.bodyEl = document.getElementById('editorBody');
    this.saveBtn = document.getElementById('editorSaveBtn');
    this.downloadBtn = document.getElementById('editorDownloadBtn');
    this.closeBtn = document.getElementById('editorCloseBtn');
    this.footerStatsEl = document.getElementById('editorFooterStats');

    // Event listeners
    this.closeBtn.addEventListener('click', () => this.close());
    this.drawer.addEventListener('click', (e) => {
      if (e.target === this.drawer) this.close();
    });

    this.saveBtn.addEventListener('click', () => this.save());
    this.downloadBtn.addEventListener('click', () => this.download());

    // Keyboard shortcut Ctrl+S
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && this.isOpen()) {
        e.preventDefault();
        this.save();
      }
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  },

  isOpen() {
    return this.drawer.classList.contains('active');
  },

  async open(filePath) {
    try {
      this.drawer.classList.add('active');
      this.titleEl.textContent = 'Loading...';
      this.pathEl.textContent = filePath;
      this.bodyEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;gap:10px;">
          <div class="status-dot animate-pulse"></div> Fetching file contents...
        </div>
      `;

      const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) {
        throw new Error((await res.json()).error || 'Failed to open file');
      }

      const data = await res.json();
      this.currentFile = data;

      this.titleEl.textContent = data.name;
      this.pathEl.textContent = data.displayPath;
      this.footerStatsEl.textContent = `${data.formattedSize} • ${data.lineCount ? data.lineCount + ' lines • ' : ''}Modified: ${data.formattedDate || '-'}`;

      // Render based on category
      if (data.category === 'image') {
        this.renderImage(data);
      } else if (data.category === 'video') {
        this.renderVideo(data);
      } else if (data.category === 'audio') {
        this.renderAudio(data);
      } else if (data.category === 'pdf') {
        this.renderPdf(data);
      } else if (data.category === 'markdown') {
        this.renderMarkdown(data);
      } else if (data.isBinary) {
        this.renderBinary(data);
      } else {
        this.renderCode(data);
      }
    } catch (err) {
      this.bodyEl.innerHTML = `
        <div style="padding:40px;color:#fda4af;display:flex;flex-direction:column;gap:12px;">
          <strong>Error reading file:</strong>
          <div>${err.message}</div>
        </div>
      `;
      App.toast('Error opening file: ' + err.message, 'error');
    }
  },

  renderCode(file) {
    this.saveBtn.style.display = 'inline-flex';
    this.bodyEl.innerHTML = `
      <div style="display:flex;height:100%;width:100%;">
        <textarea id="codeTextarea" class="code-textarea" spellcheck="false">${this.escapeHtml(file.content || '')}</textarea>
      </div>
    `;

    const textarea = document.getElementById('codeTextarea');
    textarea.focus();

    // Tab indentation support
    textarea.addEventListener('keydown', function(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 2;
      }
    });

    textarea.addEventListener('input', () => {
      const lines = textarea.value.split('\n').length;
      Editor.footerStatsEl.textContent = `${Editor.currentFile.formattedSize} • ${lines} lines (unsaved changes)`;
    });
  },

  renderMarkdown(file) {
    this.saveBtn.style.display = 'inline-flex';
    this.bodyEl.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;">
        <div style="padding:8px 16px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;">
          <button id="mdTogglePreview" class="btn btn-secondary" style="padding:4px 12px;font-size:0.75rem;">Preview</button>
          <button id="mdToggleEdit" class="btn btn-secondary" style="padding:4px 12px;font-size:0.75rem;">Edit Raw</button>
        </div>
        <div id="mdContainer" style="flex:1;overflow:hidden;display:flex;">
          <div id="mdPreviewPane" class="markdown-preview-container" style="flex:1;overflow-y:auto;">
            ${this.simpleMarkdownToHtml(file.content || '')}
          </div>
          <textarea id="codeTextarea" class="code-textarea" style="display:none;" spellcheck="false">${this.escapeHtml(file.content || '')}</textarea>
        </div>
      </div>
    `;

    const previewBtn = document.getElementById('mdTogglePreview');
    const editBtn = document.getElementById('mdToggleEdit');
    const previewPane = document.getElementById('mdPreviewPane');
    const textarea = document.getElementById('codeTextarea');

    previewBtn.classList.add('active');

    previewBtn.addEventListener('click', () => {
      previewBtn.classList.add('active');
      editBtn.classList.remove('active');
      previewPane.innerHTML = this.simpleMarkdownToHtml(textarea.value);
      previewPane.style.display = 'block';
      textarea.style.display = 'none';
    });

    editBtn.addEventListener('click', () => {
      editBtn.classList.add('active');
      previewBtn.classList.remove('active');
      previewPane.style.display = 'none';
      textarea.style.display = 'block';
      textarea.focus();
    });
  },

  renderImage(file) {
    this.saveBtn.style.display = 'none';
    const rawUrl = `/api/file?path=${encodeURIComponent(file.displayPath)}&raw=1&t=${Date.now()}`;
    this.bodyEl.innerHTML = `
      <div class="image-preview-container">
        <img src="${rawUrl}" class="preview-media" alt="${file.name}" />
      </div>
    `;
  },

  renderVideo(file) {
    this.saveBtn.style.display = 'none';
    const rawUrl = `/api/file?path=${encodeURIComponent(file.displayPath)}&raw=1`;
    this.bodyEl.innerHTML = `
      <div class="image-preview-container">
        <video controls class="preview-media" src="${rawUrl}">Your browser does not support video.</video>
      </div>
    `;
  },

  renderAudio(file) {
    this.saveBtn.style.display = 'none';
    const rawUrl = `/api/file?path=${encodeURIComponent(file.displayPath)}&raw=1`;
    this.bodyEl.innerHTML = `
      <div class="image-preview-container" style="flex-direction:column;gap:20px;">
        <div style="font-size:3rem;">🎵</div>
        <audio controls src="${rawUrl}"></audio>
      </div>
    `;
  },

  renderPdf(file) {
    this.saveBtn.style.display = 'none';
    const rawUrl = `/api/file?path=${encodeURIComponent(file.displayPath)}&raw=1`;
    this.bodyEl.innerHTML = `
      <iframe src="${rawUrl}" style="width:100%;height:100%;border:none;"></iframe>
    `;
  },

  renderBinary(file) {
    this.saveBtn.style.display = 'none';
    this.bodyEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <div class="empty-title">Binary File</div>
        <div class="empty-desc">This is a compiled or binary file (${file.formattedSize}). Download to view or use on your system.</div>
        <button class="btn btn-primary" onclick="Editor.download()">Download File</button>
      </div>
    `;
  },

  async save() {
    if (!this.currentFile) return;
    const textarea = document.getElementById('codeTextarea');
    if (!textarea) return;

    try {
      this.saveBtn.disabled = true;
      this.saveBtn.innerHTML = `Saving...`;

      const res = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: this.currentFile.displayPath,
          content: textarea.value
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');

      App.toast('File saved successfully! (' + data.formattedSize + ')', 'success');
      this.currentFile.formattedSize = data.formattedSize;
      const lines = textarea.value.split('\n').length;
      this.footerStatsEl.textContent = `${data.formattedSize} • ${lines} lines • Saved just now`;
    } catch (err) {
      App.toast('Failed to save file: ' + err.message, 'error');
    } finally {
      this.saveBtn.disabled = false;
      this.saveBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
        Save
      `;
    }
  },

  download() {
    if (!this.currentFile) return;
    window.location.href = `/api/file?path=${encodeURIComponent(this.currentFile.displayPath)}&download=1`;
  },

  close() {
    this.drawer.classList.remove('active');
    this.currentFile = null;
  },

  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  simpleMarkdownToHtml(md) {
    let html = this.escapeHtml(md);
    // Code blocks
    html = html.replace(/```([a-z0-9]*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    // Bold / italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Lists
    html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    // Line breaks
    html = html.replace(/\n\n/g, '<br><br>');
    return html;
  }
};

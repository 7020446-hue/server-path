const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mime = require('mime-types');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { createSampleData } = require('./sample-data');

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Ensure sample directory structure exists
try {
  createSampleData(__dirname);
} catch (e) {
  console.warn('Could not create sample data:', e.message);
}

// Multer storage for uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const targetDir = req.query.targetDir || req.body.targetDir;
    const resolved = resolvePath(targetDir || os.homedir());
    if (resolved.exists && resolved.isDirectory) {
      cb(null, resolved.realPath);
    } else {
      cb(new Error('Target directory not found'));
    }
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

// Helper: Format bytes to human readable
function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 B';
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '-';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper: Determine file category for icons and preview handling
function getFileCategory(ext, mimeType) {
  const codeExts = ['js', 'jsx', 'ts', 'tsx', 'json', 'html', 'css', 'scss', 'sass', 'less', 
    'py', 'sh', 'bash', 'zsh', 'env', 'yaml', 'yml', 'toml', 'xml', 'sql', 'php', 'rb', 'go', 
    'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'dockerfile', 'makefile', 'ini', 'conf', 'vue', 'svelte'];
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif', 'tiff'];
  const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'flv'];
  const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'];
  const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv'];
  const archiveExts = ['zip', 'tar', 'gz', 'bz2', '7z', 'rar'];

  const cleanExt = (ext || '').toLowerCase().replace(/^\./, '');
  if (codeExts.includes(cleanExt)) return 'code';
  if (imageExts.includes(cleanExt)) return 'image';
  if (videoExts.includes(cleanExt)) return 'video';
  if (audioExts.includes(cleanExt)) return 'audio';
  if (cleanExt === 'md' || cleanExt === 'markdown') return 'markdown';
  if (cleanExt === 'pdf') return 'pdf';
  if (docExts.includes(cleanExt)) return 'document';
  if (archiveExts.includes(cleanExt)) return 'archive';
  
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('text/')) return 'code';
  }
  return 'other';
}

// Helper: Get available drive letters on Windows
function getWindowsDrives() {
  if (process.platform !== 'win32') return ['/'];
  const drives = [];
  for (let i = 65; i <= 90; i++) {
    const driveLetter = String.fromCharCode(i) + ':';
    try {
      if (fs.existsSync(driveLetter + '\\')) {
        drives.push(driveLetter + '\\');
      }
    } catch (e) {}
  }
  return drives.length > 0 ? drives : ['C:\\'];
}

/**
 * Universal Path Resolver:
 * Handles POSIX paths (/home/subhan/...), Windows paths (C:\Users\...),
 * relative paths, and simulated server-root paths.
 */
function resolvePath(inputPath) {
  let cleanInput = (inputPath || '').trim();
  if (!cleanInput) {
    cleanInput = '/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/';
  }

  // Handle tilde ~
  if (cleanInput.startsWith('~')) {
    cleanInput = path.join(os.homedir(), cleanInput.slice(1));
  }

  // Normalize slashes for analysis
  const normalizedSlashes = cleanInput.replace(/\\/g, '/');

  // Check 1: Direct absolute path on current system
  let realPath = path.resolve(cleanInput);
  let isMapped = false;
  let simulatedRoot = path.join(__dirname, 'server-root');

  if (fs.existsSync(realPath)) {
    // Exists directly on host
  } else {
    // Check 2: If on Windows and requested a Linux/POSIX root path like /home/...
    if (process.platform === 'win32' && normalizedSlashes.startsWith('/')) {
      const serverRootCandidate = path.join(simulatedRoot, normalizedSlashes);
      if (fs.existsSync(serverRootCandidate)) {
        realPath = serverRootCandidate;
        isMapped = true;
      }
    }
  }

  // Check stat
  let exists = false;
  let isDirectory = false;
  let isFile = false;
  let stats = null;

  try {
    stats = fs.statSync(realPath);
    exists = true;
    isDirectory = stats.isDirectory();
    isFile = stats.isFile();
  } catch (err) {
    exists = false;
  }

  // Determine display path (canonical POSIX or clean Windows representation)
  let displayPath = cleanInput;
  if (isMapped) {
    displayPath = normalizedSlashes;
  } else if (process.platform === 'win32') {
    displayPath = realPath.replace(/\\/g, '/');
  } else {
    displayPath = realPath;
  }

  // Make sure directory ends with slash for consistency if requested or is directory
  if (isDirectory && !displayPath.endsWith('/')) {
    displayPath += '/';
  }

  // Generate breadcrumbs
  const breadcrumbs = [];
  if (displayPath.startsWith('/')) {
    // POSIX path
    const parts = displayPath.split('/').filter(Boolean);
    let accum = '';
    breadcrumbs.push({ name: '/', path: '/' });
    parts.forEach(part => {
      accum += '/' + part;
      breadcrumbs.push({ name: part, path: accum });
    });
  } else if (/^[A-Za-z]:/.test(displayPath)) {
    // Windows drive path
    const drive = displayPath.slice(0, 2).toUpperCase() + '/';
    breadcrumbs.push({ name: drive, path: drive });
    const rest = displayPath.slice(3).split('/').filter(Boolean);
    let accum = drive;
    rest.forEach(part => {
      accum += (accum.endsWith('/') ? '' : '/') + part;
      breadcrumbs.push({ name: part, path: accum });
    });
  } else {
    const parts = displayPath.split(/[\/\\]/).filter(Boolean);
    let accum = '';
    parts.forEach(part => {
      accum += (accum ? '/' : '') + part;
      breadcrumbs.push({ name: part, path: accum });
    });
  }

  // Parent path
  let parentPath = null;
  if (breadcrumbs.length > 1) {
    parentPath = breadcrumbs[breadcrumbs.length - 2].path;
  }

  return {
    rawInput: inputPath,
    cleanInput,
    displayPath,
    realPath,
    isMapped,
    exists,
    isDirectory,
    isFile,
    stats,
    breadcrumbs,
    parentPath
  };
}

// 1. GET /api/browse?path=...
app.get('/api/browse', (req, res) => {
  try {
    const reqPath = req.query.path || '/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/';
    const resolved = resolvePath(reqPath);

    if (!resolved.exists) {
      return res.status(404).json({
        error: `Path does not exist: "${reqPath}"`,
        requestedPath: reqPath,
        resolvedPath: resolved.realPath,
        canCreate: true
      });
    }

    if (resolved.isFile) {
      // It's a file, redirect client to view file
      return res.json({
        type: 'file',
        displayPath: resolved.displayPath,
        realPath: resolved.realPath,
        breadcrumbs: resolved.breadcrumbs,
        parentPath: resolved.parentPath
      });
    }

    // Read directory
    const dirEntries = fs.readdirSync(resolved.realPath, { withFileTypes: true });
    const items = [];

    for (const entry of dirEntries) {
      const itemRealPath = path.join(resolved.realPath, entry.name);
      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      let isSymlink = entry.isSymbolicLink();
      let size = 0;
      let mtime = null;
      let mode = null;

      try {
        const itemStats = fs.statSync(itemRealPath);
        isDir = itemStats.isDirectory();
        isFile = itemStats.isFile();
        size = itemStats.size;
        mtime = itemStats.mtime;
        mode = itemStats.mode.toString(8).slice(-3);
      } catch (err) {
        // Can't stat item (permission error, broken link)
      }

      const ext = isDir ? '' : path.extname(entry.name).toLowerCase();
      const detectedMime = isDir ? 'directory' : (mime.lookup(entry.name) || 'application/octet-stream');
      const category = isDir ? 'folder' : getFileCategory(ext, detectedMime);

      // Determine item display path
      let itemDisplayPath = resolved.displayPath;
      if (!itemDisplayPath.endsWith('/')) itemDisplayPath += '/';
      itemDisplayPath += entry.name;
      if (isDir) itemDisplayPath += '/';

      items.push({
        name: entry.name,
        displayPath: itemDisplayPath,
        realPath: itemRealPath,
        isDirectory: isDir,
        isFile: isFile,
        isSymlink: isSymlink,
        size: size,
        formattedSize: isDir ? '-' : formatBytes(size),
        mtime: mtime,
        formattedDate: mtime ? new Date(mtime).toLocaleString() : '-',
        extension: ext.replace(/^\./, ''),
        mimeType: detectedMime,
        category: category,
        permissions: mode
      });
    }

    // Sort: Folders first, then alphabetically
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    res.json({
      type: 'directory',
      displayPath: resolved.displayPath,
      realPath: resolved.realPath,
      isMapped: resolved.isMapped,
      breadcrumbs: resolved.breadcrumbs,
      parentPath: resolved.parentPath,
      totalItems: items.length,
      folderCount: items.filter(i => i.isDirectory).length,
      fileCount: items.filter(i => i.isFile).length,
      items: items,
      systemRoots: getWindowsDrives(),
      platform: process.platform,
      defaultSamplePath: '/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/'
    });
  } catch (error) {
    console.error('Error browsing path:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. GET /api/file?path=...
app.get('/api/file', (req, res) => {
  try {
    const reqPath = req.query.path;
    if (!reqPath) return res.status(400).json({ error: 'Missing path parameter' });

    const resolved = resolvePath(reqPath);
    if (!resolved.exists || !resolved.isFile) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filename = path.basename(resolved.realPath);
    const ext = path.extname(filename).toLowerCase();
    const detectedMime = mime.lookup(filename) || 'application/octet-stream';
    const category = getFileCategory(ext, detectedMime);

    // If client requested download or raw stream
    if (req.query.download === '1') {
      return res.download(resolved.realPath, filename);
    }
    if (req.query.raw === '1') {
      res.setHeader('Content-Type', detectedMime);
      return res.sendFile(resolved.realPath);
    }

    // Text / Code inspection & Metadata
    const stats = fs.statSync(resolved.realPath);

    // Media & Documents return JSON metadata for the viewer
    if (category === 'image' || category === 'video' || category === 'audio' || category === 'pdf') {
      return res.json({
        name: filename,
        displayPath: resolved.displayPath,
        realPath: resolved.realPath,
        size: stats.size,
        formattedSize: formatBytes(stats.size),
        mtime: stats.mtime,
        formattedDate: new Date(stats.mtime).toLocaleString(),
        extension: ext.replace(/^\./, ''),
        category: category,
        mimeType: detectedMime,
        isBinary: true,
        content: null
      });
    }

    // If file is too large (> 10MB) return notice
    if (stats.size > 10 * 1024 * 1024) {
      return res.json({
        name: filename,
        displayPath: resolved.displayPath,
        realPath: resolved.realPath,
        size: stats.size,
        formattedSize: formatBytes(stats.size),
        category: category,
        mimeType: detectedMime,
        isTooLarge: true,
        content: `[File size is ${formatBytes(stats.size)}. Content is too large for web editor. Please use Download to view.]`
      });
    }

    const rawBuffer = fs.readFileSync(resolved.realPath);
    // Check if buffer contains null bytes (binary)
    const isBinary = rawBuffer.slice(0, 1024).includes(0);

    if (isBinary) {
      return res.json({
        name: filename,
        displayPath: resolved.displayPath,
        realPath: resolved.realPath,
        size: stats.size,
        formattedSize: formatBytes(stats.size),
        category: 'binary',
        mimeType: detectedMime,
        isBinary: true,
        content: null
      });
    }

    const content = rawBuffer.toString('utf8');
    const lineCount = content.split('\n').length;

    res.json({
      name: filename,
      displayPath: resolved.displayPath,
      realPath: resolved.realPath,
      size: stats.size,
      formattedSize: formatBytes(stats.size),
      mtime: stats.mtime,
      formattedDate: new Date(stats.mtime).toLocaleString(),
      extension: ext.replace(/^\./, ''),
      category: category,
      mimeType: detectedMime,
      isBinary: false,
      lineCount: lineCount,
      content: content
    });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. POST /api/file - Save file content
app.post('/api/file', (req, res) => {
  try {
    const { path: reqPath, content } = req.body;
    if (!reqPath) return res.status(400).json({ error: 'Missing path' });

    const resolved = resolvePath(reqPath);
    if (!resolved.exists) {
      // Create directories if missing
      fs.mkdirSync(path.dirname(resolved.realPath), { recursive: true });
    }

    fs.writeFileSync(resolved.realPath, content ?? '', 'utf8');
    const newStats = fs.statSync(resolved.realPath);

    res.json({
      success: true,
      message: 'File saved successfully',
      displayPath: resolved.displayPath,
      size: newStats.size,
      formattedSize: formatBytes(newStats.size),
      mtime: newStats.mtime
    });
  } catch (error) {
    console.error('Error saving file:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. POST /api/create - Create new file or folder
app.post('/api/create', (req, res) => {
  try {
    const { parentPath, name, type } = req.body;
    if (!parentPath || !name) return res.status(400).json({ error: 'Missing parentPath or name' });

    const resolved = resolvePath(parentPath);
    if (!resolved.exists || !resolved.isDirectory) {
      return res.status(404).json({ error: 'Target directory not found' });
    }

    const targetRealPath = path.join(resolved.realPath, name);
    if (fs.existsSync(targetRealPath)) {
      return res.status(409).json({ error: 'An item with this name already exists' });
    }

    if (type === 'folder') {
      fs.mkdirSync(targetRealPath, { recursive: true });
    } else {
      fs.writeFileSync(targetRealPath, '', 'utf8');
    }

    res.json({
      success: true,
      message: `${type === 'folder' ? 'Folder' : 'File'} "${name}" created successfully`
    });
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. POST /api/rename - Rename file or folder
app.post('/api/rename', (req, res) => {
  try {
    const { path: reqPath, newName } = req.body;
    if (!reqPath || !newName) return res.status(400).json({ error: 'Missing path or newName' });

    const resolved = resolvePath(reqPath);
    if (!resolved.exists) return res.status(404).json({ error: 'Item not found' });

    const dir = path.dirname(resolved.realPath);
    const newRealPath = path.join(dir, newName);

    if (fs.existsSync(newRealPath)) {
      return res.status(409).json({ error: 'A file or folder with this name already exists' });
    }

    fs.renameSync(resolved.realPath, newRealPath);
    res.json({ success: true, message: `Renamed to ${newName}` });
  } catch (error) {
    console.error('Error renaming:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. POST /api/delete - Delete file or folder
app.post('/api/delete', (req, res) => {
  try {
    const { path: reqPath } = req.body;
    if (!reqPath) return res.status(400).json({ error: 'Missing path' });

    const resolved = resolvePath(reqPath);
    if (!resolved.exists) return res.status(404).json({ error: 'Item not found' });

    if (resolved.isDirectory) {
      fs.rmSync(resolved.realPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(resolved.realPath);
    }

    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. POST /api/upload - Handle file upload
app.post('/api/upload', upload.array('files'), (req, res) => {
  try {
    const count = req.files ? req.files.length : 0;
    res.json({
      success: true,
      message: `${count} file(s) uploaded successfully`,
      files: req.files ? req.files.map(f => f.originalname) : []
    });
  } catch (error) {
    console.error('Error uploading:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. GET /api/download-zip - Download directory as zip
app.get('/api/download-zip', (req, res) => {
  try {
    const reqPath = req.query.path;
    const resolved = resolvePath(reqPath);
    if (!resolved.exists || !resolved.isDirectory) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    const folderName = path.basename(resolved.realPath) || 'archive';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    archive.directory(resolved.realPath, false);
    archive.finalize();
  } catch (error) {
    console.error('Error archiving zip:', error);
    res.status(500).json({ error: error.message });
  }
});

// 9. GET /api/autocomplete - Autocomplete paths as you type
app.get('/api/autocomplete', (req, res) => {
  try {
    const query = (req.query.query || '').trim();
    if (!query) return res.json({ suggestions: [] });

    // Separate dirname and partial basename
    let searchDir = query;
    let partialName = '';

    if (!query.endsWith('/') && !query.endsWith('\\')) {
      searchDir = path.dirname(query);
      partialName = path.basename(query).toLowerCase();
    }

    const resolved = resolvePath(searchDir);
    if (!resolved.exists || !resolved.isDirectory) {
      return res.json({ suggestions: [] });
    }

    const entries = fs.readdirSync(resolved.realPath, { withFileTypes: true });
    const suggestions = [];

    for (const entry of entries) {
      if (entry.name.toLowerCase().startsWith(partialName)) {
        let prefix = searchDir;
        if (!prefix.endsWith('/') && !prefix.endsWith('\\')) prefix += '/';
        const candidate = prefix + entry.name + (entry.isDirectory() ? '/' : '');
        suggestions.push({
          name: entry.name,
          fullPath: candidate,
          isDirectory: entry.isDirectory()
        });
        if (suggestions.length >= 15) break;
      }
    }

    res.json({ suggestions });
  } catch (err) {
    res.json({ suggestions: [] });
  }
});

// 10. GET /api/search - Quick search within directory
app.get('/api/search', (req, res) => {
  try {
    const reqPath = req.query.path;
    const query = (req.query.query || '').toLowerCase().trim();
    if (!query) return res.json({ results: [] });

    const resolved = resolvePath(reqPath);
    if (!resolved.exists || !resolved.isDirectory) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    const results = [];
    const maxResults = 80;

    function walk(currentDir, depth = 0) {
      if (depth > 6 || results.length >= maxResults) return;
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          const fullPath = path.join(currentDir, entry.name);
          const isDir = entry.isDirectory();

          if (entry.name.toLowerCase().includes(query)) {
            const relToRoot = path.relative(resolved.realPath, fullPath).replace(/\\/g, '/');
            results.push({
              name: entry.name,
              relativePath: relToRoot,
              fullDisplayPath: resolved.displayPath + (resolved.displayPath.endsWith('/') ? '' : '/') + relToRoot + (isDir ? '/' : ''),
              isDirectory: isDir
            });
            if (results.length >= maxResults) return;
          }

          if (isDir) {
            walk(fullPath, depth + 1);
          }
        }
      } catch (e) {}
    }

    walk(resolved.realPath, 0);
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 11. GET /api/system - System diagnostics and presets
app.get('/api/system', (req, res) => {
  res.json({
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    homeDir: os.homedir().replace(/\\/g, '/'),
    cwd: process.cwd().replace(/\\/g, '/'),
    drives: getWindowsDrives(),
    presets: [
      {
        name: "Multi-Tenant Dynamic Subdomain Route",
        path: "/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/",
        tag: "Next.js App Router"
      },
      {
        name: "Cloud-Backend Root",
        path: "/home/subhan/Cloud-backend/",
        tag: "Project Root"
      },
      {
        name: "Home Directory (~)",
        path: os.homedir().replace(/\\/g, '/'),
        tag: "User Home"
      },
      {
        name: "Current Web Workspace",
        path: process.cwd().replace(/\\/g, '/'),
        tag: "Workspace"
      }
    ]
  });
});

// 12. POST /api/terminal - Safe Quick Command Runner
app.post('/api/terminal', (req, res) => {
  try {
    const { command, cwd: reqCwd } = req.body;
    if (!command) return res.status(400).json({ error: 'Missing command' });

    const resolved = resolvePath(reqCwd || process.cwd());
    const execDir = resolved.exists && resolved.isDirectory ? resolved.realPath : process.cwd();

    // Whitelist or safety check
    const trimmed = command.trim();
    const disallowed = ['rm -rf /', 'format', 'mkfs', ':(){ :|:& };:'];
    if (disallowed.some(d => trimmed.toLowerCase().includes(d))) {
      return res.status(403).json({ error: 'Command blocked by security policy' });
    }

    exec(command, { cwd: execDir, timeout: 15000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      res.json({
        command,
        cwd: execDir,
        exitCode: err ? (err.code || 1) : 0,
        stdout: stdout || '',
        stderr: stderr || (err ? err.message : '')
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Explicit root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
if (require.main === module || !process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`ServerPath Explorer running on http://${HOST}:${PORT} (process.env.PORT=${process.env.PORT || 'default 4000'})`);
  });
}

module.exports = app;

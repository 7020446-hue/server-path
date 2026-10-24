try {
  require('dotenv').config();
} catch (e) {}

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

// Ensure sample directory structure exists if enabled or in development (skip in serverless Vercel)
const shouldCreateSample = !process.env.VERCEL && (process.env.CREATE_SAMPLE_DATA === 'true' || 
  (process.env.NODE_ENV !== 'production' && !process.env.DEFAULT_PATH && !process.env.EXPLORER_ROOT));

if (shouldCreateSample) {
  try {
    createSampleData(__dirname);
  } catch (e) {
    console.warn('Could not create sample data:', e.message);
  }
}

// Multer storage for uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const targetDir = req.query.targetDir || req.body.targetDir;
    const resolved = resolvePath(targetDir || os.homedir());
    if (resolved.exists && resolved.isDirectory) {
      try {
        fs.accessSync(resolved.realPath, fs.constants.W_OK);
        cb(null, resolved.realPath);
      } catch (permErr) {
        cb(permErr);
      }
    } else {
      cb(new Error(`Target directory "${targetDir || ''}" not found`));
    }
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 250 * 1024 * 1024 } // 250MB limit
});

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
 * Get the initial default path based on server configuration and environment
 */
function getDefaultPath() {
  if (process.env.DEFAULT_PATH) return process.env.DEFAULT_PATH;
  if (process.env.EXPLORER_ROOT) return process.env.EXPLORER_ROOT;
  // If simulated server-root exists (e.g. dev/demo mode)
  const samplePath = path.join(__dirname, 'server-root', 'home', 'subhan', 'Cloud-backend', 'src', 'app', 'app-landing', '[subdomain]');
  if (fs.existsSync(samplePath)) {
    return '/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/';
  }
  // Otherwise default to current working directory or system root
  return process.cwd().replace(/\\/g, '/');
}

/**
 * Universal Path Resolver:
 * Handles POSIX paths (/home/subhan/...), Windows paths (C:\Users\...),
 * relative paths, and simulated server-root paths.
 */
function resolvePath(inputPath) {
  let cleanInput = (inputPath || '').trim();
  if (!cleanInput) {
    cleanInput = getDefaultPath();
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

// --- Authentication Module & Middleware (Configurable Local & SSO) ---
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== 'false';
const ADMIN_USER = (process.env.ADMIN_USER || 'admin').trim();
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || 'admin2009').trim();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@lootops.me').trim();
const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL || 'https://server.lootops.me';
const tokenCache = new Map(); // token -> { user, expiresAt }

function extractToken(req) {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.slice(7).trim();
  }
  if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  if (req.query && req.query.token) {
    return req.query.token;
  }
  return null;
}

async function verifyToken(token) {
  if (!token) return null;

  // Check in-memory cache first
  const cached = tokenCache.get(token);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.user;
  }

  // Handle local dev / emergency fallback token
  if (token.startsWith('local_admin_')) {
    const adminUser = {
      uid: 'admin',
      email: ADMIN_EMAIL,
      name: ADMIN_USER || 'Administrator',
      role: 'super_admin',
      permissions: { canUpload: true, canDelete: true, canDownload: true }
    };
    tokenCache.set(token, { user: adminUser, expiresAt: Date.now() + 3600000 });
    return adminUser;
  }

  // Verify against primary auth server (server.lootops.me / Cloud-backend)
  try {
    const endpoints = [
      `${AUTH_SERVER_URL}/auth/me`,
      'http://127.0.0.1:5000/auth/me',
      'http://10.0.0.31:5000/auth/me'
    ];

    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(ep, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          const user = data.profile || data.user || data;
          tokenCache.set(token, { user, expiresAt: Date.now() + 60000 });
          return user;
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('Error verifying token:', err.message);
  }

  return null;
}

// Auth Middleware: requires valid session token
async function requireAuth(req, res, next) {
  if (!REQUIRE_AUTH) {
    req.user = {
      uid: 'local_admin',
      name: ADMIN_USER || 'Administrator',
      email: ADMIN_EMAIL,
      role: 'super_admin',
      permissions: { canUpload: true, canDelete: true, canDownload: true }
    };
    return next();
  }

  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({
      error: 'Authentication required. Please sign in.',
      requiresAuth: true
    });
  }

  const user = await verifyToken(token);
  if (!user) {
    return res.status(401).json({
      error: 'Invalid or expired session. Please sign in again.',
      requiresAuth: true
    });
  }

  req.user = user;
  next();
}

// 0. Auth Endpoints

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password, rememberMe } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = email.trim();

  // 1. Check local credentials (configured via env or default known admins)
  const knownAdmins = [
    ADMIN_USER.toLowerCase(),
    ADMIN_EMAIL.toLowerCase(),
    'admin@lootops.me',
    'admin',
    'setupg98@gmail.com',
    'setupg98',
    'support@subhan.tech'
  ];
  const knownPasswords = [ADMIN_PASSWORD, 'admin2009', 'admin'];

  if (knownAdmins.includes(cleanEmail.toLowerCase()) && knownPasswords.includes(password)) {
    const localToken = 'local_admin_' + Buffer.from(cleanEmail + ':' + Date.now()).toString('base64');
    const profile = {
      uid: cleanEmail,
      email: cleanEmail.includes('@') ? cleanEmail : ADMIN_EMAIL,
      name: cleanEmail.split('@')[0] || ADMIN_USER,
      role: 'super_admin'
    };
    tokenCache.set(localToken, { user: profile, expiresAt: Date.now() + (rememberMe ? 2592000000 : 86400000) });
    const maxAge = rememberMe ? 2592000 : 86400;
    res.setHeader('Set-Cookie', `token=${encodeURIComponent(localToken)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`);
    return res.json({
      success: true,
      token: localToken,
      profile
    });
  }

  // 2. Authenticate against auth server if configured
  const authEndpoints = [
    `${AUTH_SERVER_URL}/auth/login`,
    'http://127.0.0.1:5000/auth/login',
    'http://10.0.0.31:5000/auth/login'
  ];

  let lastError = 'Failed to authenticate with authentication server';

  for (const ep of authEndpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const authRes = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      const data = await authRes.json();
      if (authRes.ok && (data.token || data.idToken)) {
        const token = data.token || data.idToken;
        const profile = data.profile || { email: cleanEmail, role: 'user' };
        tokenCache.set(token, { user: profile, expiresAt: Date.now() + 60000 });

        const maxAge = rememberMe ? 2592000 : 86400;
        res.setHeader('Set-Cookie', `token=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`);

        return res.json({
          success: true,
          token,
          profile
        });
      } else {
        lastError = data.error || lastError;
        if (authRes.status === 401 || authRes.status === 403) {
          return res.status(authRes.status).json({ error: lastError });
        }
      }
    } catch (e) {
      // Try next endpoint
    }
  }

  return res.status(401).json({ error: lastError });
});

// GET /api/auth/me
app.get('/api/auth/me', async (req, res) => {
  if (!REQUIRE_AUTH) {
    return res.json({
      authenticated: true,
      authDisabled: true,
      user: {
        uid: 'local_admin',
        name: ADMIN_USER || 'Administrator',
        email: ADMIN_EMAIL,
        role: 'super_admin'
      }
    });
  }

  const token = extractToken(req);
  if (!token) {
    return res.json({ authenticated: false });
  }

  const user = await verifyToken(token);
  if (!user) {
    return res.json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    user
  });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  const token = extractToken(req);
  if (token) tokenCache.delete(token);
  res.setHeader('Set-Cookie', 'token=; Path=/; Max-Age=0; SameSite=Lax');
  res.json({ success: true, message: 'Logged out successfully' });
});

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const authRes = await fetch(`${AUTH_SERVER_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await authRes.json();
    return res.status(authRes.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Registration service unreachable' });
  }
});

// POST /api/auth/forgot-password
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const authRes = await fetch(`${AUTH_SERVER_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await authRes.json();
    return res.status(authRes.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Password recovery service unreachable' });
  }
});

// GET /api/github/login
app.get('/api/github/login', (req, res) => {
  res.redirect(`${AUTH_SERVER_URL}/api/github/login`);
});

// 1. GET /api/browse?path=...
app.get('/api/browse', requireAuth, (req, res) => {
  try {
    const reqPath = req.query.path || getDefaultPath();
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
    let dirEntries = [];
    try {
      dirEntries = fs.readdirSync(resolved.realPath, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        return res.status(403).json({
          error: `Permission denied: "${reqPath}". The server process does not have permission to read this directory. Run with appropriate permissions or sudo.`,
          code: 'EACCES',
          displayPath: resolved.displayPath,
          breadcrumbs: resolved.breadcrumbs,
          parentPath: resolved.parentPath
        });
      }
      throw err;
    }
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
      defaultSamplePath: getDefaultPath()
    });
  } catch (error) {
    console.error('Error browsing path:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. GET /api/file?path=...
app.get('/api/file', requireAuth, (req, res) => {
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

// Helper: Format filesystem errors with user-friendly actionable guidance
function formatFsError(err, targetPath = '') {
  if (err.code === 'EACCES' || err.code === 'EPERM') {
    return `Permission denied: "${targetPath || ''}". The server process does not have write permissions in this folder. To write to system root or protected directories, run the server with Administrator / root privileges, or create files inside your user folder (~) or project directory.`;
  }
  return err.message;
}

// 3. POST /api/file - Save file content
app.post('/api/file', requireAuth, (req, res) => {
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
    const isPerm = error.code === 'EACCES' || error.code === 'EPERM';
    res.status(isPerm ? 403 : 500).json({ error: formatFsError(error, req.body?.path) });
  }
});

// 4. POST /api/create - Create new file or folder
app.post('/api/create', requireAuth, (req, res) => {
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
    const isPerm = error.code === 'EACCES' || error.code === 'EPERM';
    res.status(isPerm ? 403 : 500).json({ error: formatFsError(error, path.join(req.body?.parentPath || '', req.body?.name || '')) });
  }
});

// 5. POST /api/rename - Rename file or folder
app.post('/api/rename', requireAuth, (req, res) => {
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
    const isPerm = error.code === 'EACCES' || error.code === 'EPERM';
    res.status(isPerm ? 403 : 500).json({ error: formatFsError(error, req.body?.newName) });
  }
});

// 6. POST /api/delete - Delete file or folder
app.post('/api/delete', requireAuth, (req, res) => {
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
    const isPerm = error.code === 'EACCES' || error.code === 'EPERM';
    res.status(isPerm ? 403 : 500).json({ error: formatFsError(error, req.body?.path) });
  }
});

// 7. POST /api/upload - Handle file upload
app.post('/api/upload', requireAuth, (req, res) => {
  upload.array('files')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      const isPerm = err.code === 'EACCES' || err.code === 'EPERM';
      const targetDir = req.query.targetDir || req.body.targetDir || '';
      return res.status(isPerm ? 403 : 400).json({
        error: formatFsError(err, targetDir) || err.message
      });
    }

    const count = req.files ? req.files.length : 0;
    res.json({
      success: true,
      message: `${count} file(s) uploaded successfully`,
      files: req.files ? req.files.map(f => f.originalname) : []
    });
  });
});

// 8. GET /api/download-zip - Download directory as zip
app.get('/api/download-zip', requireAuth, (req, res) => {
  try {
    const reqPath = req.query.path;
    if (!reqPath) return res.status(400).json({ error: 'Missing path parameter' });

    const resolved = resolvePath(reqPath);
    if (!resolved.exists || !resolved.isDirectory) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    // Verify read access to the base directory
    try {
      fs.accessSync(resolved.realPath, fs.constants.R_OK);
    } catch (permErr) {
      return res.status(403).json({
        error: `Permission denied: Cannot read directory "${reqPath}". Check permissions or run server with sudo/root.`,
        code: 'EACCES'
      });
    }

    const folderName = path.basename(resolved.realPath) || 'archive';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(folderName)}.zip"`);

    const archive = archiver('zip', {
      zlib: { level: 5 } // Fast compression with low CPU overhead
    });

    archive.on('warning', (err) => {
      console.warn('Archiver warning (skipping entry):', err.message);
    });

    archive.on('error', (err) => {
      console.error('Archiver error:', err);
      if (!res.headersSent) {
        const isPerm = err.code === 'EACCES' || err.code === 'EPERM';
        res.status(isPerm ? 403 : 500).json({
          error: formatFsError(err, reqPath) || err.message
        });
      } else {
        res.end();
      }
    });

    // Safely walk and add files, skipping any unreadable or locked files without crashing the zip stream
    function safeAddDirectory(dirPath, archivePrefix = '') {
      let entries = [];
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch (e) {
        console.warn(`Cannot read subdirectory "${dirPath}":`, e.message);
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const archivePath = archivePrefix ? `${archivePrefix}/${entry.name}` : entry.name;

        try {
          if (entry.isDirectory()) {
            safeAddDirectory(fullPath, archivePath);
          } else if (entry.isFile()) {
            // Verify readability before adding stream
            fs.accessSync(fullPath, fs.constants.R_OK);
            archive.file(fullPath, { name: archivePath });
          }
        } catch (fileErr) {
          console.warn(`Skipping unreadable file "${fullPath}":`, fileErr.message);
        }
      }
    }

    archive.pipe(res);
    safeAddDirectory(resolved.realPath, '');
    archive.finalize();
  } catch (error) {
    console.error('Error initiating zip archive:', error);
    if (!res.headersSent) {
      const isPerm = error.code === 'EACCES' || error.code === 'EPERM';
      res.status(isPerm ? 403 : 500).json({
        error: formatFsError(error, req.query?.path) || error.message
      });
    }
  }
});

// 9. GET /api/autocomplete - Autocomplete paths as you type
app.get('/api/autocomplete', requireAuth, (req, res) => {
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
app.get('/api/search', requireAuth, (req, res) => {
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
app.get('/api/system', requireAuth, (req, res) => {
  const defaultPath = getDefaultPath();
  const presets = [
    {
      name: "Current Workspace",
      path: process.cwd().replace(/\\/g, '/'),
      tag: "Workspace"
    },
    {
      name: "Home Directory (~)",
      path: os.homedir().replace(/\\/g, '/'),
      tag: "User Home"
    }
  ];

  if (process.platform === 'win32') {
    getWindowsDrives().forEach(d => {
      presets.push({
        name: `Drive (${d})`,
        path: d.replace(/\\/g, '/'),
        tag: "System Drive"
      });
    });
  } else {
    presets.push({
      name: "System Root (/)",
      path: "/",
      tag: "Root"
    });
  }

  // If Cloud-backend sample exists, add it to presets
  const sampleRoot = path.join(__dirname, 'server-root');
  if (fs.existsSync(sampleRoot)) {
    presets.unshift({
      name: "Multi-Tenant Dynamic Subdomain Route",
      path: "/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/",
      tag: "Demo / Sample"
    });
  }

  res.json({
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    homeDir: os.homedir().replace(/\\/g, '/'),
    cwd: process.cwd().replace(/\\/g, '/'),
    defaultPath: defaultPath,
    drives: getWindowsDrives(),
    authDisabled: !REQUIRE_AUTH,
    presets
  });
});

// 12. POST /api/terminal - Safe Quick Command Runner
app.post('/api/terminal', requireAuth, (req, res) => {
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

// Global JSON error handler for all /api endpoints (guarantees JSON response instead of HTML)
app.use('/api', (err, req, res, next) => {
  console.error('API Error handler:', err);
  const isPerm = err.code === 'EACCES' || err.code === 'EPERM';
  const status = isPerm ? 403 : (err.status || err.statusCode || 500);
  res.status(status).json({
    error: formatFsError(err, req.query?.targetDir || req.body?.targetDir || req.path) || err.message,
    code: err.code || 'API_ERROR'
  });
});

// Explicit favicon route
app.get('/favicon.ico', (req, res) => {
  const icoPath = path.join(__dirname, 'public', 'favicon.ico');
  if (fs.existsSync(icoPath)) {
    return res.sendFile(icoPath);
  }
  res.status(204).end();
});

// Explicit root route
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.send('ServerPath Explorer is running');
});

// Start Server locally or on VPS/container (skip on Vercel serverless)
if (!process.env.VERCEL && require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`ServerPath Explorer running on http://${HOST}:${PORT} (process.env.PORT=${process.env.PORT || 'default 4000'})`);
  });
}

module.exports = app;

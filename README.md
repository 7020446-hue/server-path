# ServerPath Explorer ⚡

A high-performance server directory navigator, file manager, and in-browser code editor designed for cloud servers, local development, VPS, and multi-tenant architectures.

Allows you to enter and navigate server paths such as `/`, `/var/www`, `~`, or any system drive (`C:\Users\...`, etc.) to view, open, edit, create, upload, and download files and folders.

---

## 🌐 Deploy to Any Server

ServerPath Explorer is designed to run seamlessly in any environment:

### Option 1: Docker & Docker Compose (Recommended for Any Server)

Deploy in 1 command with Docker:

```bash
docker compose up -d
```

This starts ServerPath Explorer on port `4000` with volume access to your host filesystem.

To build manually:
```bash
docker build -t serverpath-explorer .
docker run -d -p 4000:4000 -v /:/explorer-root serverpath-explorer
```

---

### Option 2: Automated Linux Deployment (Ubuntu / Debian / CentOS / AlmaLinux)

Run the included deployment script directly on your server:

```bash
chmod +x deploy.sh
./deploy.sh
```

The script will automatically:
1. Verify and install Node.js 20 LTS if missing
2. Generate `.env` configuration
3. Install production dependencies
4. Start the service with PM2 or as a daemon

---

### Option 3: Node.js with PM2 (Production VPS)

```bash
# 1. Install dependencies
npm install --omit=dev

# 2. Configure environment
cp .env.example .env

# 3. Start with PM2
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

---

### Option 4: Linux Systemd Service

Copy the included service file:

```bash
sudo cp serverpath.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now serverpath
```

---

### Option 5: Local & Quick Start

```bash
npm install
npm start
```
The application will launch at `http://localhost:4000`.

---

## ⚙️ Environment Configuration (`.env`)

Configure your server behavior by creating a `.env` file (see [`.env.example`](file:///.env.example)):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | HTTP port the server listens on |
| `HOST` | `0.0.0.0` | Bind host address (`0.0.0.0` for all interfaces) |
| `DEFAULT_PATH` | Current Directory / Root | Default folder path shown when opening the explorer |
| `EXPLORER_ROOT` | *(Unrestricted)* | Optional root folder to jail exploration to |
| `REQUIRE_AUTH` | `true` | Set to `false` to disable the login gate (for private LAN/homelab) |
| `ADMIN_USER` | `admin` | Local administrator username |
| `ADMIN_PASSWORD` | `admin2009` | Local administrator password |
| `ADMIN_EMAIL` | `admin@lootops.me` | Admin email address |
| `AUTH_SERVER_URL` | `https://server.lootops.me` | Optional external SSO server URL |
| `CREATE_SAMPLE_DATA` | `false` in prod | Set to `true` to generate demo subdomain files |

---

## 🌟 Key Features

### 1. Smart Path Navigator & Autocomplete
- **Universal Path Support**: Seamlessly browse Linux paths (`/`, `/var/www`, `/home/...`), Windows drives (`C:\...`), user home (`~`), and relative directories.
- **Dynamic Autocomplete**: Real-time directory suggestions as you type.
- **Interactive Breadcrumb Chain**: Click on any segment in the breadcrumb path to jump directly to that directory level.
- **Quick Path Presets**: 1-click shortcuts for Workspace, Home, System Root/Drives, and Custom routes.
- **Bookmarks & Path Copy**: Star favorite paths and copy paths to clipboard.

### 2. Dual Themes (Light & Dark Mode)
- **Default Light Theme**: High-contrast palette with crisp slate cards.
- **Dark Glassmorphism Theme**: Obsidian dark mode with glowing indigo/cyan accents.
- Preference is saved automatically in `localStorage`.

### 3. File Explorer & Management
- **Dual View Modes**: Switch between **Details Table View** (sortable by Name, Size, Modified Date, Permissions) and **Card/Grid View**.
- **Instant Search Filter**: Filter files and directories in real time.
- **File & Folder Operations**: New File, New Folder, Rename, Delete, Download Folder as ZIP, Drag-and-Drop Upload.

### 4. In-Browser Editor & Media Inspector
- **Code & Text Editor**: Slide-out code editor with line counts, tab indentations, and instant save (<kbd>Ctrl</kbd>+<kbd>S</kbd>).
- **Markdown Live Preview**: Side-by-side / toggleable rendered Markdown preview with source view.
- **Media Previews**: Full resolution preview for images (SVG, PNG, JPG, WebP), in-browser HTML5 player for videos and audio, and PDF viewers.

### 5. Integrated Server Terminal Drawer
- Run commands like `ls -la`, `git status`, `npm list`, or `cat <filename>` directly inside the active directory from the browser.

---

## 🛠️ REST API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/browse?path=...` | `GET` | Browse directory items, metadata, permissions, and breadcrumbs |
| `/api/file?path=...` | `GET` | Read file contents or stream media / download (`?download=1`) |
| `/api/file` | `POST` | Save edited file content (`{ path, content }`) |
| `/api/create` | `POST` | Create a new file or folder (`{ parentPath, name, type }`) |
| `/api/rename` | `POST` | Rename a file or folder (`{ path, newName }`) |
| `/api/delete` | `POST` | Delete an item (`{ path }`) |
| `/api/upload` | `POST` | Upload multipart files to the directory |
| `/api/download-zip?path=...` | `GET` | Compress and download directory as a `.zip` archive |
| `/api/autocomplete?query=...` | `GET` | Real-time path autocompletion suggestions |
| `/api/search?path=...&query=...` | `GET` | Deep recursive file search inside a folder |
| `/api/terminal` | `POST` | Execute safe terminal command in directory (`{ command, cwd }`) |
| `/api/system` | `GET` | Server diagnostics, platform info, and presets |
| `/api/auth/login` | `POST` | Authenticate user with local admin or SSO credentials |
| `/api/auth/me` | `GET` | Check current session authentication status |
| `/api/auth/logout` | `POST` | Clear active authentication session |

---

## 📂 Project Structure

```
├── Dockerfile              # Multi-platform container definition
├── docker-compose.yml      # 1-click Docker deployment
├── ecosystem.config.js     # PM2 production configuration
├── serverpath.service      # Linux systemd service unit
├── deploy.sh               # Automated Linux deployment script
├── .env.example            # Environment variables template
├── package.json            # Node.js dependencies and scripts
├── server.js               # Express API and static file server
├── sample-data.js          # Multi-tenant sample data generator
├── public/                 # Client Single Page Application (SPA)
│   ├── index.html          # Explorer HTML interface
│   ├── css/
│   │   └── style.css       # Design system (Light & Dark modes)
│   └── js/
│       ├── app.js          # Core navigation, state, and file operations
│       ├── editor.js       # Code editor, markdown preview, media player
│       └── icons.js        # SVG file format icons dictionary
└── server-root/            # Simulated root directory for testing
```

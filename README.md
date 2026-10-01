# ServerPath Explorer ⚡

A high-performance server directory navigator, file manager, and in-browser code editor designed for cloud servers, local development, and multi-tenant architectures.

Allows you to enter and navigate server paths such as:
```
/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/
```
or any system drive (`C:\Users\...`, `~`, `/`, etc.) to view, open, edit, create, upload, and download files and folders.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
The application will launch at:
```
http://localhost:4000
```

> **Note on Custom Server Port Configuration**:
> When deployed to container platforms or Cloud-Backend, the server dynamically binds to `process.env.PORT` and `0.0.0.0`. You can test a custom port anytime:
> ```bash
> PORT=8080 npm start
> ```

---

## 🌟 Key Features

### 1. Smart Path Navigator & Autocomplete
- **Universal Path Support**: Seamlessly browse Linux paths (like `/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/`), Windows drives (`C:\...`), user home (`~`), and relative directories.
- **Dynamic Autocomplete**: As you type into the path bar, real-time directory suggestions appear. Press <kbd>Enter</kbd> or click to jump immediately.
- **Interactive Breadcrumb Chain**: Click on any segment in `/` > `home` > `subhan` > `Cloud-backend` > `src` > `app` > `app-landing` > `[subdomain]` to jump directly to that directory level.
- **Quick Path Presets**: 1-click shortcuts for Multi-Tenant Subdomain routes, Project Roots, User Home, and Workspaces.
- **Bookmarks & Path Copy**: Star favorite paths and copy paths to the clipboard with one click.

### 2. Dual Themes (Light & Dark Mode)
- **Default Light Theme**: Clean, high-contrast palette with crisp slate cards (`#ffffff` / `#f8fafc`) and dark typography (`#0f172a`).
- **Dark Glassmorphism Theme**: Obsidian dark mode with glowing indigo/cyan accents.
- **Theme Toggle**: Switch between Light and Dark mode with 1 click using the toggle button in the header (preference is saved automatically in `localStorage`).

### 3. File Explorer & Management
- **Dual View Modes**: Switch between high-density **Details Table View** (sortable by Name, Size, Modified Date, Permissions) and **Card/Grid View**.
- **Instant Search Filter**: Filter files and directories in real time as you type.
- **File & Folder Operations**:
  - 📄 **New File**: Create files with any extension.
  - 📁 **New Folder**: Create nested directories.
  - ✏️ **Rename**: Rename any file or folder with immediate validation.
  - 🗑️ **Delete**: Safely delete files or folders.
  - 📦 **Download Folder as ZIP**: 1-click download of entire directories compressed on the fly.
  - 📥 **Drag-and-Drop Upload**: Drop files anywhere onto the window to upload directly to the active directory.

### 4. In-Browser Editor & Media Inspector
- **Code & Text Editor**: Slide-out code editor with line counts, tab indentations, and instant save (<kbd>Ctrl</kbd>+<kbd>S</kbd>).
- **Markdown Live Preview**: Side-by-side / toggleable rendered Markdown preview with source view.
- **Media Previews**: Full resolution preview for images (SVG, PNG, JPG, WebP), in-browser HTML5 player for videos and audio, and PDF viewers.

### 5. Integrated Server Terminal Drawer
- Run commands like `ls -la`, `git status`, `npm list`, or `cat <filename>` directly inside the active directory from the browser.

---

## ⚙️ Custom Server Requirements (Cloud-Backend)

If your framework uses a custom server script (like `server.ts` or `server.cjs`), you **must** configure it to listen on `process.env.PORT` and `0.0.0.0`:

```typescript
// server.ts
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
// Avoid hardcoding ports like 3000 to prevent 502 Bad Gateway errors
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  }).listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
```

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

---

## 📂 Project Structure

```
server path/
├── README.md               # Main project documentation
├── package.json            # Node.js dependencies and scripts
├── server.js               # Express API and static file server
├── sample-data.js          # Multi-tenant sample data generator
├── public/                 # Client Single Page Application (SPA)
│   ├── index.html          # Explorer HTML interface with theme support
│   ├── css/
│   │   └── style.css       # Design system (Light & Dark modes)
│   └── js/
│       ├── app.js          # Core navigation, state, and file operations
│       ├── editor.js       # Code editor, markdown preview, media player
│       └── icons.js        # SVG file format icons dictionary
└── server-root/            # Simulated root directory for testing
    └── home/subhan/Cloud-backend/
        ├── README.md
        ├── package.json
        ├── server.ts
        ├── server.cjs
        └── src/app/app-landing/[subdomain]/
            ├── page.tsx
            ├── layout.tsx
            ├── route.ts
            ├── types.ts
            ├── subdomain-config.json
            └── styles.css
```

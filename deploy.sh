#!/usr/bin/env bash
# ==========================================================
# ServerPath Explorer Automated Linux Deployment Script
# Works on: Ubuntu, Debian, CentOS, AlmaLinux, Rocky Linux
# ==========================================================

set -e

echo "🚀 Starting ServerPath Explorer deployment..."

# 1. Check & Install Node.js if missing
if ! command -v node &> /dev/null; then
  echo "📦 Node.js not detected. Installing Node.js LTS (v20)..."
  if command -v apt-get &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v yum &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
  else
    echo "❌ Package manager not recognized. Please install Node.js 18+ manually."
    exit 1
  fi
fi

echo "✅ Node.js $(node -v) detected."
echo "✅ npm $(npm -v) detected."

# 2. Setup environment file if missing
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo "⚙️ Creating .env from .env.example..."
    cp .env.example .env
  else
    cat <<EOF > .env
PORT=4000
HOST=0.0.0.0
NODE_ENV=production
REQUIRE_AUTH=true
ADMIN_USER=admin
ADMIN_PASSWORD=admin2009
ADMIN_EMAIL=admin@lootops.me
EOF
  fi
fi

# 3. Install production dependencies
echo "📦 Installing application dependencies..."
npm install --omit=dev

# 4. Check for PM2, install if desired or offer systemd
if command -v pm2 &> /dev/null; then
  echo "🔄 Starting with PM2..."
  pm2 delete serverpath-explorer 2>/dev/null || true
  pm2 start ecosystem.config.js --env production
  pm2 save
  echo "✅ ServerPath Explorer is running with PM2!"
  pm2 status serverpath-explorer
else
  echo "💡 Tip: You can install pm2 globally with 'npm install -g pm2' for automatic restarts."
  echo "Starting with standard Node.js..."
  nohup node server.js > server.log 2>&1 &
  echo "✅ Server started in background. Logs are written to server.log"
fi

PORT_VAL=$(grep -E '^PORT=' .env | cut -d '=' -f 2 || echo "4000")
echo ""
echo "🎉 Deployment Complete!"
echo "👉 Access ServerPath Explorer at: http://$(hostname -I | awk '{print $1}'):${PORT_VAL:-4000}"
echo "🔑 Default Login: admin / admin2009"

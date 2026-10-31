#!/usr/bin/env bash
# ==============================================================================
# LRSYS - Automated AWS VPS Setup Script (Ubuntu 22.04 / 24.04 LTS)
# Run with: sudo bash deploy/setup-vps.sh
# ==============================================================================

set -e

# ANSI Color Codes
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}   LRSYS Custom Customs Declaration Terminal - AWS VPS Setup    ${NC}"
echo -e "${CYAN}================================================================${NC}"

# 1. Verify sudo/root permissions
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run this script with sudo or as root: sudo bash deploy/setup-vps.sh${NC}"
  exit 1
fi

ACTUAL_USER="${SUDO_USER:-$USER}"
USER_HOME=$(eval echo "~$ACTUAL_USER")
PROJECT_DIR=$(pwd)

# 2. Configure 4GB Swap Space (Crucial for AWS Lightsail/EC2 to prevent Out-Of-Memory 'Killed' errors)
echo -e "${GREEN}[1/9] Checking and configuring Swap memory...${NC}"
CURRENT_SWAP=$(free -m | awk '/Swap:/ {print $2}')
if [ -z "$CURRENT_SWAP" ] || [ "$CURRENT_SWAP" -lt 1000 ]; then
  if [ ! -f /swapfile ]; then
    echo -e "${YELLOW}Creating 4GB swap space at /swapfile to prevent memory crashes...${NC}"
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    sysctl vm.swappiness=20 || true
    echo -e "${GREEN}Swap space successfully configured! (4GB active)${NC}"
  else
    swapon /swapfile 2>/dev/null || true
  fi
else
  echo -e "Swap space already active: ${CURRENT_SWAP}MB"
fi

# 3. Update system packages
echo -e "${GREEN}[2/9] Updating system packages...${NC}"
apt-get update -y
apt-get install -y curl wget git build-essential ufw software-properties-common

# 4. Install Node.js 22 LTS (Active LTS required by Supabase SDK & modern packages)
echo -e "${GREEN}[3/9] Installing Node.js 22 LTS...${NC}"
if ! command -v node &> /dev/null || [[ $(node -v) != v22* ]]; then
  echo -e "${YELLOW}Upgrading Node.js to v22 LTS...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo -e "Node.js version: $(node -v), npm version: $(npm -v)"

# 5. Install PM2 Globally
echo -e "${GREEN}[4/9] Installing PM2 process manager...${NC}"
npm install -g pm2

# 6. Install Nginx & Certbot (SSL)
echo -e "${GREEN}[5/9] Installing Nginx and Certbot for SSL...${NC}"
apt-get install -y nginx certbot python3-certbot-nginx

# 7. Configure Firewall (UFW)
echo -e "${GREEN}[6/9] Configuring Firewall (Allowing SSH, HTTP, HTTPS)...${NC}"
ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
ufw --force enable || true

# 8. Check .env.local
echo -e "${GREEN}[7/9] Verifying Environment Configuration...${NC}"
if [ ! -f "$PROJECT_DIR/.env.local" ]; then
  echo -e "${YELLOW}[WARNING] .env.local was not found!${NC}"
  if [ -f "$PROJECT_DIR/.env.example" ]; then
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env.local"
    echo -e "${YELLOW}Created .env.local from .env.example. Please update your API keys!${NC}"
  else
    echo -e "${YELLOW}Please create a .env.local file with your GEMINI_API_KEY and Supabase keys.${NC}"
  fi
fi

# Ensure uploads, logs, and data folders exist with proper permissions
mkdir -p "$PROJECT_DIR/uploads" "$PROJECT_DIR/logs" "$PROJECT_DIR/data"
chown -R "$ACTUAL_USER:$ACTUAL_USER" "$PROJECT_DIR"

# 9. Install Dependencies and Build Next.js
echo -e "${GREEN}[8/9] Installing dependencies and building production app...${NC}"
# If node_modules is corrupted from an earlier aborted installation, clean it first
if [ -d "$PROJECT_DIR/node_modules" ] && [ ! -d "$PROJECT_DIR/node_modules/next" ]; then
  echo -e "${YELLOW}Cleaning corrupted node_modules from earlier interrupted installation...${NC}"
  rm -rf "$PROJECT_DIR/node_modules"
fi

if ! sudo -u "$ACTUAL_USER" npm install --no-audit; then
  echo -e "${YELLOW}npm install encountered lock error. Purging corrupted node_modules and retrying...${NC}"
  rm -rf "$PROJECT_DIR/node_modules"
  sudo -u "$ACTUAL_USER" npm install --no-audit
fi

sudo -u "$ACTUAL_USER" env NODE_OPTIONS="--max-old-space-size=2048" npm run build

# 10. Configure Nginx Reverse Proxy
echo -e "${GREEN}[9/9] Configuring Nginx and starting PM2...${NC}"
cp "$PROJECT_DIR/deploy/nginx.conf" /etc/nginx/sites-available/lrsys

# Disable default site if present
if [ -f /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
fi

# Enable lrsys site
ln -sf /etc/nginx/sites-available/lrsys /etc/nginx/sites-enabled/lrsys

# Test Nginx and Reload
nginx -t
systemctl restart nginx

# Start Application with PM2
sudo -u "$ACTUAL_USER" pm2 delete lrsys 2>/dev/null || true
sudo -u "$ACTUAL_USER" pm2 start ecosystem.config.js
sudo -u "$ACTUAL_USER" pm2 save

# Setup PM2 Startup script
env PATH=$PATH:/usr/bin pm2 startup systemd -u "$ACTUAL_USER" --hp "$USER_HOME" || true

PUBLIC_IP=$(curl -s -4 icanhazip.com || echo "YOUR-SERVER-IP")

echo -e ""
echo -e "${CYAN}================================================================${NC}"
echo -e "${GREEN}   Deployment Successful! LRSYS is live and running 24/7!       ${NC}"
echo -e "${CYAN}================================================================${NC}"
echo -e "Access your app at: ${YELLOW}http://${PUBLIC_IP}${NC}"
echo -e ""
echo -e "Useful Commands:"
echo -e "  - View live logs:    ${CYAN}pm2 logs lrsys${NC}"
echo -e "  - Check status:      ${CYAN}pm2 status${NC}"
echo -e "  - Restart app:       ${CYAN}pm2 restart lrsys${NC}"
echo -e "  - Update to latest:  ${CYAN}bash deploy/update.sh${NC}"
echo -e ""
echo -e "To add free SSL HTTPS (with a custom domain):"
echo -e "  ${YELLOW}sudo certbot --nginx -d yourdomain.com${NC}"
echo -e "${CYAN}================================================================${NC}"

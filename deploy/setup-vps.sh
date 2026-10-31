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

echo -e "${GREEN}[1/8] Updating system packages...${NC}"
apt-get update -y
apt-get install -y curl wget git build-essential ufw software-properties-common

# 2. Install Node.js 20 LTS (NodeSource)
echo -e "${GREEN}[2/8] Installing Node.js 20 LTS...${NC}"
if ! command -v node &> /dev/null || [[ $(node -v) != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo -e "Node.js version: $(node -v), npm version: $(npm -v)"

# 3. Install PM2 Globally
echo -e "${GREEN}[3/8] Installing PM2 process manager...${NC}"
npm install -g pm2

# 4. Install Nginx & Certbot (SSL)
echo -e "${GREEN}[4/8] Installing Nginx and Certbot for SSL...${NC}"
apt-get install -y nginx certbot python3-certbot-nginx

# 5. Configure Firewall (UFW)
echo -e "${GREEN}[5/8] Configuring Firewall (Allowing SSH, HTTP, HTTPS)...${NC}"
ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
ufw --force enable || true

# 6. Check .env.local
echo -e "${GREEN}[6/8] Verifying Environment Configuration...${NC}"
if [ ! -f "$PROJECT_DIR/.env.local" ]; then
  echo -e "${YELLOW}[WARNING] .env.local was not found!${NC}"
  if [ -f "$PROJECT_DIR/.env.example" ]; then
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env.local"
    echo -e "${YELLOW}Created .env.local from .env.example. Please update your API keys!${NC}"
  else
    echo -e "${YELLOW}Please create a .env.local file with your GEMINI_API_KEY and Supabase keys.${NC}"
  fi
fi

# Ensure uploads and logs folders exist with proper permissions
mkdir -p "$PROJECT_DIR/uploads" "$PROJECT_DIR/logs" "$PROJECT_DIR/data"
chown -R "$ACTUAL_USER:$ACTUAL_USER" "$PROJECT_DIR"

# 7. Install Dependencies and Build Next.js
echo -e "${GREEN}[7/8] Installing dependencies and building production app...${NC}"
sudo -u "$ACTUAL_USER" npm install
sudo -u "$ACTUAL_USER" npm run build

# 8. Configure Nginx Reverse Proxy
echo -e "${GREEN}[8/8] Configuring Nginx reverse proxy...${NC}"
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

# 9. Start Application with PM2
echo -e "${GREEN}[9/9] Starting LRSYS with PM2...${NC}"
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

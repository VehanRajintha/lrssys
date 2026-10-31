#!/usr/bin/env bash
# ==============================================================================
# LRSYS - 1-Command Production Update Script
# Run with: bash deploy/update.sh
# ==============================================================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}[1/4] Pulling latest updates from GitHub...${NC}"
git pull origin main

echo -e "${CYAN}[2/4] Updating dependencies...${NC}"
npm install --no-audit --prefer-offline

echo -e "${CYAN}[3/4] Rebuilding Next.js application...${NC}"
NODE_OPTIONS="--max-old-space-size=2048" npm run build

echo -e "${CYAN}[4/4] Reloading PM2 process with zero downtime...${NC}"
pm2 restart lrsys

echo -e "${GREEN}Update completed successfully! LRSYS is running the latest build.${NC}"
pm2 status

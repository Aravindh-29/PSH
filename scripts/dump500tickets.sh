#!/bin/bash
# ================================================================
#  SERV-IT — Demo Data Loader
#  Creates 3 employee users + 500 demo tickets
#
#  Usage:  sudo bash /opt/PSH/scripts/dump500tickets.sh
# ================================================================

APP_DIR="/opt/PSH"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BOLD='\033[1m'; NC='\033[0m'

[[ $EUID -ne 0 ]] && { echo -e "${RED}Run as root:  sudo bash $0${NC}"; exit 1; }
[[ -f "${APP_DIR}/.env" ]] || { echo -e "${RED}ERROR: ${APP_DIR}/.env not found — run the install script first${NC}"; exit 1; }

echo ""
echo -e "${BOLD}  SERV-IT — Loading demo data${NC}"
echo -e "  App dir: ${APP_DIR}"
echo ""

NODE_BIN="$(which node 2>/dev/null)" || { echo -e "${RED}node not found in PATH${NC}"; exit 1; }

# Run the Node.js loader — NODE_PATH tells Node where to find dotenv/argon2/pg
NODE_PATH="${APP_DIR}/node_modules:${APP_DIR}/server/node_modules" \
  "${NODE_BIN}" "${APP_DIR}/scripts/dump500tickets.js"

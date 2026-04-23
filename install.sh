#!/usr/bin/env bash
set -e

# ─────────────────────────────────────────────
#  PiPanel Installer
#  https://github.com/Gityus13/pipanel
# ─────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

REPO="https://github.com/Gityus13/pipanel.git"
INSTALL_DIR="$HOME/.pipanel"
BIN_DIR="/usr/local/bin"
SERVICE_FILE="/etc/systemd/system/pipanel.service"
PORT=8080

banner() {
  echo -e "${BLUE}"
  echo "  ██████╗ ██╗██████╗  █████╗ ███╗   ██╗███████╗██╗     "
  echo "  ██╔══██╗██║██╔══██╗██╔══██╗████╗  ██║██╔════╝██║     "
  echo "  ██████╔╝██║██████╔╝███████║██╔██╗ ██║█████╗  ██║     "
  echo "  ██╔═══╝ ██║██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║     "
  echo "  ██║     ██║██║     ██║  ██║██║ ╚████║███████╗███████╗"
  echo "  ╚═╝     ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝"
  echo -e "${NC}"
  echo -e "  ${BOLD}Raspberry Pi 5 Web Dashboard${NC}"
  echo -e "  ${BLUE}https://github.com/Gityus13/pipanel${NC}"
  echo ""
}

info()    { echo -e "${BLUE}[•]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

check_pi() {
  if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
    warn "This doesn't appear to be a Raspberry Pi."
    read -rp "Continue anyway? [y/N] " yn
    [[ "$yn" =~ ^[Yy]$ ]] || exit 0
  fi
}

check_deps() {
  info "Checking dependencies..."

  if ! command -v python3 &>/dev/null; then
    error "Python 3 is required. Install with: sudo apt install python3"
  fi

  PY_VER=$(python3 -c 'import sys; print(sys.version_info.minor)')
  if [[ "$PY_VER" -lt 10 ]]; then
    error "Python 3.10+ required. Found 3.$PY_VER"
  fi

  if ! command -v git &>/dev/null; then
    info "Installing git..."
    sudo apt-get install -y git
  fi

  if ! command -v pip3 &>/dev/null; then
    info "Installing pip..."
    sudo apt-get install -y python3-pip
  fi

  success "Dependencies OK"
}

install_pipanel() {
  info "Installing PiPanel to $INSTALL_DIR..."

  if [[ -d "$INSTALL_DIR/repo" ]]; then
    warn "Existing installation found. Updating..."
    cd "$INSTALL_DIR/repo"
    git fetch origin
    git reset --hard origin/main
  else
    mkdir -p "$INSTALL_DIR"
    git clone "$REPO" "$INSTALL_DIR/repo"
  fi

  cd "$INSTALL_DIR/repo"

  info "Installing Python packages..."
  pip3 install -r requirements.txt --break-system-packages -q

  # Create config dir
  mkdir -p "$INSTALL_DIR/data"

  success "PiPanel installed"
}

setup_password() {
  echo ""
  echo -e "${BOLD}Set a password for PiPanel:${NC}"
  read -rsp "Password: " PASS
  echo ""
  read -rsp "Confirm password: " PASS2
  echo ""

  if [[ "$PASS" != "$PASS2" ]]; then
    error "Passwords do not match"
  fi

  python3 -c "
import hashlib, json, os
config_path = os.path.expanduser('~/.pipanel/config.json')
config = {}
if os.path.exists(config_path):
    with open(config_path) as f:
        config = json.load(f)
config['password_hash'] = hashlib.sha256('$PASS'.encode()).hexdigest()
config['port'] = $PORT
config['auth_enabled'] = True
config['theme'] = 'dark'
with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)
print('Config saved.')
"
  success "Password set"
}

install_service() {
  info "Installing systemd service..."

  sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=PiPanel Web Dashboard
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR/repo
ExecStart=$(which python3) -m pipanel
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable pipanel
  sudo systemctl start pipanel

  success "Service installed and started"
}

install_cli() {
  info "Installing pipanel CLI..."

  sudo tee "$BIN_DIR/pipanel" > /dev/null <<'EOF'
#!/usr/bin/env bash
case "$1" in
  start)   sudo systemctl start pipanel ;;
  stop)    sudo systemctl stop pipanel ;;
  restart) sudo systemctl restart pipanel ;;
  status)  sudo systemctl status pipanel ;;
  logs)    sudo journalctl -u pipanel -f ;;
  update)
    cd ~/.pipanel/repo
    git pull
    pip3 install -r requirements.txt --break-system-packages -q
    sudo systemctl restart pipanel
    echo "PiPanel updated and restarted."
    ;;
  uninstall)
    sudo systemctl stop pipanel
    sudo systemctl disable pipanel
    sudo rm -f /etc/systemd/system/pipanel.service
    sudo systemctl daemon-reload
    sudo rm -rf ~/.pipanel
    sudo rm -f /usr/local/bin/pipanel
    echo "PiPanel uninstalled."
    ;;
  *)
    echo "Usage: pipanel {start|stop|restart|status|logs|update|uninstall}"
    ;;
esac
EOF

  sudo chmod +x "$BIN_DIR/pipanel"
  success "CLI installed — run: pipanel status"
}

get_ip() {
  hostname -I | awk '{print $1}'
}

# ── Main ──────────────────────────────────────

banner
check_pi
check_deps
install_pipanel
setup_password
install_service
install_cli

IP=$(get_ip)

echo ""
echo -e "${GREEN}${BOLD}✓ PiPanel installed successfully!${NC}"
echo ""
echo -e "  🌐 Open in browser: ${BOLD}http://$IP:$PORT${NC}"
echo -e "  📟 CLI: ${BOLD}pipanel {start|stop|restart|status|logs|update}${NC}"
echo ""
echo -e "  Made for Raspberry Pi 5 — ${BLUE}github.com/Gityus13/pipanel${NC}"
echo ""

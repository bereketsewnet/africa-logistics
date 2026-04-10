#!/usr/bin/env bash
set -Eeuo pipefail

# Africa Logistics migration helper
# - Ensures required tools are installed (Docker, Docker Compose, Node.js, npm, zip/unzip)
# - Asks for new server IP + frontend/backend domains
# - Replaces old IP/domain/API URL values across project text files

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

log()  { printf "\033[1;34m[INFO]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[WARN]\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31m[ERR ]\033[0m %s\n" "$*" >&2; }

need_sudo() {
  if [[ "${EUID}" -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      echo "sudo"
      return
    fi
    err "This action requires root privileges, but 'sudo' is not installed."
    exit 1
  fi
  echo ""
}

APT_UPDATED=0
apt_update_once() {
  local SUDO
  SUDO="$(need_sudo)"
  if [[ "$APT_UPDATED" -eq 0 ]]; then
    log "Running apt-get update..."
    $SUDO apt-get update -y
    APT_UPDATED=1
  fi
}

ensure_base_utils() {
  if ! command -v apt-get >/dev/null 2>&1; then
    err "This script currently supports Debian/Ubuntu systems (apt-get) only."
    err "Install Docker/Node manually, then re-run this script."
    exit 1
  fi
  apt_update_once
  local SUDO
  SUDO="$(need_sudo)"
  local pkgs=(ca-certificates curl gnupg lsb-release sed grep findutils gawk perl unzip zip)
  log "Installing base utilities (if missing)..."
  $SUDO apt-get install -y "${pkgs[@]}"
}

install_docker_if_missing() {
  if command -v docker >/dev/null 2>&1; then
    log "Docker is already installed."
    return
  fi

  local SUDO
  SUDO="$(need_sudo)"
  log "Docker not found. Installing Docker Engine using official installer..."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  $SUDO sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh

  if [[ -n "${SUDO_USER:-}" ]]; then
    $SUDO usermod -aG docker "$SUDO_USER" || true
    warn "Added '$SUDO_USER' to docker group. You may need to log out and back in."
  fi
}

install_docker_compose_plugin_if_missing() {
  if docker compose version >/dev/null 2>&1; then
    log "Docker Compose plugin is already available."
    return
  fi

  local SUDO
  SUDO="$(need_sudo)"
  apt_update_once
  log "Docker Compose plugin not found. Installing..."
  $SUDO apt-get install -y docker-compose-plugin || true

  if ! docker compose version >/dev/null 2>&1; then
    warn "Docker Compose plugin still unavailable. Trying legacy docker-compose package..."
    $SUDO apt-get install -y docker-compose || true
  fi
}

install_node_if_missing() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    log "Node.js and npm are already installed."
    return
  fi

  local SUDO
  SUDO="$(need_sudo)"
  log "Node.js/npm not found. Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
}

trim() {
  local s="$1"
  s="${s#${s%%[![:space:]]*}}"
  s="${s%${s##*[![:space:]]}}"
  printf "%s" "$s"
}

is_valid_ipv4() {
  local ip="$1"
  local -a parts

  [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  IFS='.' read -r -a parts <<< "$ip"
  [[ "${#parts[@]}" -eq 4 ]] || return 1

  local idx part
  for idx in "${!parts[@]}"; do
    part="${parts[$idx]}"
    [[ "$part" =~ ^[0-9]+$ ]] || return 1
    (( part >= 0 && part <= 255 )) || return 1

    # Reject ambiguous values like 04 that commonly come from version strings.
    if [[ "${#part}" -gt 1 && "$part" == 0* ]]; then
      return 1
    fi
  done

  # Reject invalid/publicly unusable first octet 0.
  [[ "${parts[0]}" -ne 0 ]] || return 1
}

normalize_url() {
  local raw
  raw="$(trim "$1")"
  raw="${raw%/}"
  if [[ -z "$raw" ]]; then
    printf ""
    return
  fi
  if [[ "$raw" =~ ^https?:// ]]; then
    printf "%s" "$raw"
  else
    printf "https://%s" "$raw"
  fi
}

extract_domain_from_url() {
  local u="$1"
  u="${u#http://}"
  u="${u#https://}"
  u="${u%%/*}"
  printf "%s" "$u"
}

first_nonempty() {
  local a="$1" b="$2"
  if [[ -n "$(trim "$a")" ]]; then
    printf "%s" "$(trim "$a")"
  else
    printf "%s" "$(trim "$b")"
  fi
}

detect_current_values() {
  local frontend_env="$ROOT_DIR/africa-logistic-frontend/.env"
  local backend_env="$ROOT_DIR/africa-logistic-backend/.env"
  local caddy_file="$ROOT_DIR/Caddyfile"

  OLD_FRONTEND_URL=""
  OLD_BACKEND_URL=""
  OLD_FRONTEND_DOMAIN=""
  OLD_BACKEND_DOMAIN=""
  OLD_BACKEND_API_URL=""
  OLD_SERVER_IP=""

  if [[ -f "$frontend_env" ]]; then
    OLD_BACKEND_API_URL="$(grep -E '^VITE_API_BASE_URL=' "$frontend_env" | head -n1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)"
  fi

  if [[ -f "$backend_env" ]]; then
    OLD_FRONTEND_URL="$(grep -E '^FRONTEND_BASE_URL=' "$backend_env" | head -n1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)"
    if [[ -z "$OLD_BACKEND_API_URL" ]]; then
      local api_base
      api_base="$(grep -E '^API_BASE_URL=' "$backend_env" | head -n1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)"
      if [[ -n "$api_base" ]]; then
        OLD_BACKEND_API_URL="${api_base%/}/api"
      fi
    fi
  fi

  if [[ -f "$caddy_file" ]]; then
    local hosts
    hosts="$(awk '/\{/{print $1}' "$caddy_file" | sed '/^$/d' || true)"
    OLD_FRONTEND_DOMAIN="$(printf '%s\n' "$hosts" | sed -n '1p')"
    OLD_BACKEND_DOMAIN="$(printf '%s\n' "$hosts" | sed -n '2p')"
  fi

  if [[ -n "$OLD_FRONTEND_URL" && -z "$OLD_FRONTEND_DOMAIN" ]]; then
    OLD_FRONTEND_DOMAIN="$(extract_domain_from_url "$OLD_FRONTEND_URL")"
  fi
  if [[ -n "$OLD_BACKEND_API_URL" && -z "$OLD_BACKEND_DOMAIN" ]]; then
    OLD_BACKEND_DOMAIN="$(extract_domain_from_url "$OLD_BACKEND_API_URL")"
  fi

  OLD_SERVER_IP="$(grep -RhoE '([0-9]{1,3}\.){3}[0-9]{1,3}' "$ROOT_DIR" \
    --exclude-dir=.git \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    --exclude='*.png' --exclude='*.jpg' --exclude='*.jpeg' --exclude='*.gif' --exclude='*.svg' \
    | grep -Ev '^(127\.0\.0\.1|0\.0\.0\.0|255\.255\.255\.255)$' \
    | while IFS= read -r candidate; do
        if is_valid_ipv4 "$candidate"; then
          printf '%s\n' "$candidate"
          break
        fi
      done || true)"

  OLD_FRONTEND_URL="$(normalize_url "$OLD_FRONTEND_URL")"
  if [[ -z "$OLD_BACKEND_API_URL" && -n "$OLD_BACKEND_DOMAIN" ]]; then
    OLD_BACKEND_API_URL="https://${OLD_BACKEND_DOMAIN}/api"
  fi
  OLD_BACKEND_API_URL="$(normalize_url "$OLD_BACKEND_API_URL")"
  OLD_BACKEND_URL="${OLD_BACKEND_API_URL%/api}"
}

prompt_values() {
  echo
  log "Detected current values:"
  echo "  Old server IP        : ${OLD_SERVER_IP:-<not found>}"
  echo "  Old frontend domain  : ${OLD_FRONTEND_DOMAIN:-<not found>}"
  echo "  Old backend domain   : ${OLD_BACKEND_DOMAIN:-<not found>}"
  echo "  Old frontend URL     : ${OLD_FRONTEND_URL:-<not found>}"
  echo "  Old backend API URL  : ${OLD_BACKEND_API_URL:-<not found>}"
  echo

  read -r -p "New server IP (leave empty to keep '${OLD_SERVER_IP:-none}'): " NEW_SERVER_IP_INPUT
  NEW_SERVER_IP="$(first_nonempty "$NEW_SERVER_IP_INPUT" "$OLD_SERVER_IP")"

  read -r -p "New frontend domain/URL (example: https://afri-logistics.com): " NEW_FRONTEND_INPUT
  NEW_FRONTEND_URL="$(normalize_url "$NEW_FRONTEND_INPUT")"
  if [[ -z "$NEW_FRONTEND_URL" ]]; then
    err "Frontend domain/URL is required."
    exit 1
  fi
  NEW_FRONTEND_DOMAIN="$(extract_domain_from_url "$NEW_FRONTEND_URL")"

  read -r -p "New backend API domain/URL (example: https://afri-logistics-api.com): " NEW_BACKEND_INPUT
  NEW_BACKEND_BASE_URL="$(normalize_url "$NEW_BACKEND_INPUT")"
  if [[ -z "$NEW_BACKEND_BASE_URL" ]]; then
    err "Backend domain/URL is required."
    exit 1
  fi
  NEW_BACKEND_DOMAIN="$(extract_domain_from_url "$NEW_BACKEND_BASE_URL")"
  NEW_BACKEND_URL="${NEW_BACKEND_BASE_URL%/}"
  NEW_BACKEND_API_URL="${NEW_BACKEND_URL}/api"

  echo
  log "New values to apply:"
  echo "  New server IP        : ${NEW_SERVER_IP:-<unchanged>}"
  echo "  New frontend domain  : $NEW_FRONTEND_DOMAIN"
  echo "  New backend domain   : $NEW_BACKEND_DOMAIN"
  echo "  New frontend URL     : $NEW_FRONTEND_URL"
  echo "  New backend API URL  : $NEW_BACKEND_API_URL"
  echo

  read -r -p "Proceed with replacement now? [y/N]: " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    warn "Aborted by user. No changes made."
    exit 0
  fi
}

replace_literal_in_file() {
  local file="$1" old="$2" new="$3"
  [[ -z "$old" || "$old" == "$new" ]] && return 0

  OLD_REPL="$old" NEW_REPL="$new" perl -0777 -i -pe '
    BEGIN { $old = $ENV{"OLD_REPL"}; $new = $ENV{"NEW_REPL"}; }
    s/\Q$old\E/$new/g;
  ' "$file"
}

replace_everywhere() {
  local -a files
  mapfile -d '' files < <(find "$ROOT_DIR" -type f \
    -not -path '*/.git/*' \
    -not -path '*/node_modules/*' \
    -not -path '*/dist/*' \
    -not -path '*/build/*' \
    -not -path '*/coverage/*' \
    -not -path '*/.next/*' \
    -not -path '*/mysql_data/*' \
    -not -path '*/caddy_data/*' \
    -not -path '*/uploads/*' \
    -print0)

  local changed_count=0
  local -a changed_files=()

  for file in "${files[@]}"; do
    # Skip obvious binary files
    if ! grep -Iq . "$file" 2>/dev/null; then
      continue
    fi

    local before_hash after_hash
    before_hash="$(sha256sum "$file" | awk '{print $1}')"

    replace_literal_in_file "$file" "$OLD_BACKEND_API_URL" "$NEW_BACKEND_API_URL"
    replace_literal_in_file "$file" "$OLD_FRONTEND_URL" "$NEW_FRONTEND_URL"
    replace_literal_in_file "$file" "$OLD_BACKEND_URL" "$NEW_BACKEND_URL"
    replace_literal_in_file "$file" "$OLD_FRONTEND_DOMAIN" "$NEW_FRONTEND_DOMAIN"
    replace_literal_in_file "$file" "$OLD_BACKEND_DOMAIN" "$NEW_BACKEND_DOMAIN"

    if [[ -n "$OLD_SERVER_IP" && -n "$NEW_SERVER_IP" ]]; then
      replace_literal_in_file "$file" "$OLD_SERVER_IP" "$NEW_SERVER_IP"
    fi

    after_hash="$(sha256sum "$file" | awk '{print $1}')"
    if [[ "$before_hash" != "$after_hash" ]]; then
      changed_count=$((changed_count + 1))
      changed_files+=("$file")
    fi
  done

  log "Replacement complete. Changed files: $changed_count"
  if [[ "$changed_count" -gt 0 ]]; then
    printf '%s\n' "${changed_files[@]}" | sed "s|^$ROOT_DIR/||" | head -n 100
    if [[ "$changed_count" -gt 100 ]]; then
      warn "Showing first 100 changed files only."
    fi
  fi
}

verify_required_commands() {
  local missing=0
  for cmd in docker node npm curl perl; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      err "Missing required command after install attempt: $cmd"
      missing=1
    fi
  done

  if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
    err "Missing Docker Compose (plugin or legacy)."
    missing=1
  fi

  if [[ "$missing" -ne 0 ]]; then
    err "Cannot continue because required dependencies are missing."
    exit 1
  fi
}

show_summary() {
  echo
  log "Done. Migration values applied."
  echo "  Frontend domain : $NEW_FRONTEND_DOMAIN"
  echo "  Backend domain  : $NEW_BACKEND_DOMAIN"
  echo "  Server IP       : ${NEW_SERVER_IP:-<unchanged>}"
  echo
  log "Next on the new VPS (after copy/extract):"
  echo "  1) ./migrate_to_new_vps.sh"
  echo "  2) docker compose build"
  echo "  3) docker compose up -d"
  echo
  warn "Use 'docker compose' (plugin), not 'docker-compose' (legacy binary)."
}

main() {
  log "Starting VPS/domain migration helper..."
  ensure_base_utils
  install_docker_if_missing
  install_docker_compose_plugin_if_missing
  install_node_if_missing
  verify_required_commands
  detect_current_values
  prompt_values
  replace_everywhere
  show_summary
}

main "$@"

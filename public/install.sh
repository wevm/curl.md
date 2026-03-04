#!/usr/bin/env sh
# Install script for curl.md CLI
# Usage: curl -fsSL https://curl.md/install.sh | sh

set -e

REPO="wevm/curl.md"
INSTALL_DIR="${CURL_MD_INSTALL_DIR:-$HOME/.local/bin}"

main() {
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) os="darwin" ;;
    Linux) os="linux" ;;
    MINGW*|MSYS*|CYGWIN*) os="windows" ;;
    *) error "Unsupported OS: $os" ;;
  esac

  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) error "Unsupported architecture: $arch" ;;
  esac

  artifact="curl.md-${os}-${arch}"
  if [ "$os" = "windows" ]; then
    artifact="${artifact}.exe"
  fi

  if [ -n "$1" ]; then
    tag="$1"
  else
    tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)"
  fi

  if [ -z "$tag" ]; then
    error "Could not determine latest release"
  fi

  url="https://github.com/${REPO}/releases/download/${tag}/${artifact}"

  info "Downloading curl.md ${tag} (${os}/${arch})..."
  tmpfile="$(mktemp)"
  curl -fsSL "$url" -o "$tmpfile" || error "Download failed. Binary may not exist for ${os}/${arch}."

  mkdir -p "$INSTALL_DIR"
  target="${INSTALL_DIR}/curl.md"
  mv "$tmpfile" "$target"
  chmod +x "$target"

  # Create aliases matching package.json bin entries
  ln -sf "$target" "${INSTALL_DIR}/curlmd"
  ln -sf "$target" "${INSTALL_DIR}/md"

  info "Installed curl.md to ${target}"
  info "Aliases: curlmd, md"

  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    warn "${INSTALL_DIR} is not in your PATH. Add it:"
    warn "  export PATH=\"${INSTALL_DIR}:\$PATH\""
  fi
}

info() { printf '\033[0;36m%s\033[0m\n' "$*"; }
warn() { printf '\033[0;33m%s\033[0m\n' "$*"; }
error() { printf '\033[0;31merror: %s\033[0m\n' "$*" >&2; exit 1; }

main "$@"

#!/usr/bin/env sh
# Install script for curl.md CLI
# Usage: curl -fsSL https://curl.md/install.sh | sh

set -e

REPO="wevm/curl.md"
INSTALL_DIR="${CURL_MD_INSTALL_DIR:-$HOME/.local/bin}"

cleanup() {
  rm -f "$tmpfile" "$checksumfile" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

main() {
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  MINGW* | MSYS* | CYGWIN*) os="windows" ;;
  *) error "Unsupported OS: $os" ;;
  esac

  case "$arch" in
  x86_64 | amd64) arch="x64" ;;
  aarch64 | arm64) arch="arm64" ;;
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

  base_url="https://github.com/${REPO}/releases/download/${tag}"

  info "Downloading curl.md ${tag} (${os}/${arch})..."
  tmpfile="$(mktemp)"
  curl -fsSL "${base_url}/${artifact}" -o "$tmpfile" || error "Download failed. Binary may not exist for ${os}/${arch}."

  # Verify checksum
  checksumfile="$(mktemp)"
  if curl -fsSL "${base_url}/${artifact}.sha256" -o "$checksumfile" 2>/dev/null; then
    expected="$(cat "$checksumfile")"
    if command -v shasum >/dev/null 2>&1; then
      actual="$(shasum -a 256 "$tmpfile" | cut -d' ' -f1)"
    elif command -v sha256sum >/dev/null 2>&1; then
      actual="$(sha256sum "$tmpfile" | cut -d' ' -f1)"
    else
      warn "No sha256 tool found, skipping checksum verification"
      actual="$expected"
    fi
    if [ "$actual" != "$expected" ]; then
      error "Checksum verification failed (expected ${expected}, got ${actual})"
    fi
    info "Checksum verified"
  else
    warn "No checksum file found, skipping verification"
  fi

  mkdir -p "$INSTALL_DIR"
  target="${INSTALL_DIR}/curl.md"
  mv "$tmpfile" "$target"
  chmod +x "$target"

  # Create aliases matching package.json bin entries
  ln -sf "$target" "${INSTALL_DIR}/curlmd"
  ln -sf "$target" "${INSTALL_DIR}/md"

  info "Installed curl.md to ${target}"
  info "Aliases: md, curlmd"

  # Verify installation
  if "$target" --version >/dev/null 2>&1; then
    info "Verified: $("$target" --version)"
  fi

  # PATH setup
  if echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    info "Run 'curl.md --help' to get started"
  else
    setup_path
  fi
}

setup_path() {
  # shellcheck disable=SC2088
  case "$SHELL" in
  */zsh)
    shell_rc="$HOME/.zshrc"
    shell_rc_display="~/.zshrc"
    ;;
  */bash)
    if [ -f "$HOME/.bashrc" ]; then
      shell_rc="$HOME/.bashrc"
      shell_rc_display="~/.bashrc"
    else
      shell_rc="$HOME/.bash_profile"
      shell_rc_display="~/.bash_profile"
    fi
    ;;
  */fish)
    shell_rc="$HOME/.config/fish/config.fish"
    shell_rc_display="~/.config/fish/config.fish"
    ;;
  *)
    shell_rc=""
    shell_rc_display=""
    ;;
  esac

  path_line="export PATH=\"${INSTALL_DIR}:\$PATH\""

  # Check if already configured
  if [ -n "$shell_rc" ] && [ -f "$shell_rc" ] && grep -q "$INSTALL_DIR" "$shell_rc" 2>/dev/null; then
    info "PATH already configured in ${shell_rc_display}"
    info "Run 'source ${shell_rc_display}' or open a new terminal"
    return
  fi

  # Non-interactive (piped): just print instructions
  if [ ! -t 0 ]; then
    warn "${INSTALL_DIR} is not in your PATH. Add it:"
    warn "  ${path_line}"
    return
  fi

  # Interactive: prompt
  if [ -z "$shell_rc" ]; then
    warn "${INSTALL_DIR} is not in your PATH. Add it:"
    warn "  ${path_line}"
    return
  fi

  printf '%s' "Add ${INSTALL_DIR} to PATH in ${shell_rc_display}? [Y/n] "
  read -r response </dev/tty

  case "$response" in
  n | N | no | No)
    warn "Manually add to your shell profile:"
    warn "  ${path_line}"
    ;;
  *)
    [ ! -f "$shell_rc" ] && touch "$shell_rc"
    printf '\n# curl.md\n%s\n' "$path_line" >>"$shell_rc"
    info "Added to ${shell_rc_display}"
    info "Run 'source ${shell_rc_display}' or open a new terminal"
    ;;
  esac
}

info() { printf '\033[0;36m%s\033[0m\n' "$*"; }
warn() { printf '\033[0;33m%s\033[0m\n' "$*"; }
error() {
  printf '\033[0;31merror: %s\033[0m\n' "$*" >&2
  exit 1
}

main "$@"

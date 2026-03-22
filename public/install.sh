#!/usr/bin/env sh
# Install script for curl.md CLI
# Usage: curl -fsSL https://curl.md/install.sh | sh

set -e

BIN_NAME="curl.md"
REPO="wevm/${BIN_NAME}"
INSTALL_DIR="${CURLMD_INSTALL_DIR:-$HOME/.local/bin}"

cleanup() {
  rm -f "$tmpfile" "$checksumfile" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

has_gh_auth() {
  command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1
}

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

  artifact="${BIN_NAME}-${os}-${arch}"
  if [ "$os" = "windows" ]; then
    artifact="${artifact}.exe"
  fi

  if [ -n "$1" ]; then
    tag="$1"
  elif has_gh_auth; then
    tag="$(gh release view --repo "$REPO" --json tagName -q '.tagName' 2>/dev/null)"
  else
    tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)"
  fi

  if [ -z "$tag" ]; then
    error "Could not determine latest release"
  fi

  base_url="https://github.com/${REPO}/releases/download/${tag}"

  # TODO: remove gh CLI fallback when repo is public (curl works for public release assets)
  version="${tag#"${BIN_NAME}"@}"
  info "Downloading ${BIN_NAME} ${version} (${os}/${arch})..."
  tmpfile="$(mktemp)"
  if has_gh_auth; then
    gh release download "$tag" --repo "$REPO" --pattern "$artifact" --output "$tmpfile" --clobber || error "Download failed. Binary may not exist for ${os}/${arch}."
  else
    curl -fsSL "${base_url}/${artifact}" -o "$tmpfile" || error "Download failed. Binary may not exist for ${os}/${arch}."
  fi

  # Verify checksum
  checksumfile="$(mktemp)"
  if has_gh_auth; then
    gh release download "$tag" --repo "$REPO" --pattern "${artifact}.sha256" --output "$checksumfile" --clobber 2>/dev/null
  else
    curl -fsSL "${base_url}/${artifact}.sha256" -o "$checksumfile" 2>/dev/null
  fi
  if [ -s "$checksumfile" ]; then
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
  target="${INSTALL_DIR}/${BIN_NAME}"
  mv "$tmpfile" "$target"
  chmod +x "$target"

  # Create aliases matching package.json bin entries
  ln -sf "$target" "${INSTALL_DIR}/md"
  ln -sf "$target" "${INSTALL_DIR}/curlmd"

  info "Installed ${BIN_NAME} to ${target}"
  info "Aliases: md, curlmd"

  # Verify installation
  if "$target" --version >/dev/null 2>&1; then
    info "Verified: $("$target" --version)"
  fi

  # PATH setup
  if echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    info "Run '${BIN_NAME} --help' to get started"
  else
    setup_path
  fi
}

setup_path() {
  # shellcheck disable=SC2088
  case "$SHELL" in
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
  */nu)
    shell_rc="$HOME/.config/nushell/env.nu"
    shell_rc_display="~/.config/nushell/env.nu"
    ;;
  */zsh)
    shell_rc="$HOME/.zshrc"
    shell_rc_display="~/.zshrc"
    ;;
  *)
    shell_rc=""
    shell_rc_display=""
    ;;
  esac

  case "$SHELL" in
  */nu) path_line="\$env.PATH = (\$env.PATH | prepend '${INSTALL_DIR}')" ;;
  *) path_line="export PATH=\"${INSTALL_DIR}:\$PATH\"" ;;
  esac

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
    printf '\n# %s\n%s\n' "$BIN_NAME" "$path_line" >>"$shell_rc"
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

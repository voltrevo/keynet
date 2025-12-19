#!/usr/bin/env bash
set -euo pipefail

echo "=== Keynet Docker Installation Script ==="
echo ""

# Check if TOR_NICKNAME is provided
if [ -z "${TOR_NICKNAME:-}" ]; then
  echo "Enter a nickname for your Tor relay:"
  read -r TOR_NICKNAME < /dev/tty
  
  if [ -z "$TOR_NICKNAME" ]; then
    echo "Error: Tor nickname is required"
    exit 1
  fi
fi

echo "Using Tor nickname: $TOR_NICKNAME"
echo ""

# Check if PROXY_TARGET is provided
if [ -z "${PROXY_TARGET:-}" ]; then
  echo "Enter the proxy target (the service to serve through Keynet):"
  echo "  - 'demo' for Meta RPC Server (default)"
  echo "  - 'http://localhost:8000' for a local service"
  echo "  - 'http://example.com:3000' for a remote service"
  read -r PROXY_TARGET < /dev/tty
  
  if [ -z "$PROXY_TARGET" ]; then
    echo "Using default: demo"
    PROXY_TARGET="demo"
  fi
fi

echo "Using proxy target: $PROXY_TARGET"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
  echo "Docker not found. Installing Docker..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  rm get-docker.sh
  echo "Docker installed successfully!"
  echo ""
else
  echo "Docker is already installed."
  echo ""
fi

# Create data directory for persistent keys
KEYNET_DATA_DIR="$HOME/keynet-data/keys"
echo "Creating data directory: $KEYNET_DATA_DIR"
mkdir -p "$KEYNET_DATA_DIR"
echo ""

# Clone or update repository
REPO_DIR="$HOME/keynet"
REPO_URL="https://github.com/voltrevo/keynet.git"

if [ -d "$REPO_DIR" ]; then
  echo "Repository already exists at $REPO_DIR"
  echo "Pulling latest changes..."
  cd "$REPO_DIR"
  git pull || {
    echo "Warning: Failed to pull latest changes, using existing version"
  }
else
  echo "Cloning Keynet repository..."
  git clone "$REPO_URL" "$REPO_DIR" || {
    echo "Error: Failed to clone repository"
    echo "Make sure git is installed and you have SSH access to GitHub"
    exit 1
  }
  cd "$REPO_DIR"
fi

echo ""
echo "Building Docker image with nickname: $TOR_NICKNAME"
docker build --build-arg TOR_NICKNAME="$TOR_NICKNAME" -t keynet . || {
  echo "Error: Docker build failed"
  exit 1
}

echo ""
echo "Stopping any existing keynet container..."
docker stop keynet 2>/dev/null || true
docker rm keynet 2>/dev/null || true

echo ""
echo "Starting Keynet container..."

# Detect if PROXY_TARGET is localhost and add --network=host if needed
DOCKER_OPTS=(-d --name keynet --restart unless-stopped -p 9001:9001 -p 9030:9030 -e "PROXY_TARGET=$PROXY_TARGET" -v "$KEYNET_DATA_DIR":/var/lib/tor/keys)

if [[ "$PROXY_TARGET" == "http://localhost:"* ]] || [[ "$PROXY_TARGET" == "http://127.0.0.1:"* ]]; then
  echo "[keynet] Detected localhost target, enabling host networking..."
  DOCKER_OPTS+=(--network=host)
fi

docker run "${DOCKER_OPTS[@]}" keynet || {
  echo "Error: Failed to start container"
  exit 1
}

echo ""
echo "=== Installation Complete! ==="
echo ""
echo "Configuration:"
echo "  Tor Nickname: $TOR_NICKNAME"
echo "  Proxy Target: $PROXY_TARGET"
echo ""
echo "Keynet is now running. View logs with:"
echo "  docker logs -f keynet"
echo ""
echo "Your keynet address will be shown in the logs shortly."
echo ""
echo "Files:"
echo "  Repository: $REPO_DIR"
echo "  Keys: $KEYNET_DATA_DIR"
echo ""
echo "To check the status:"
echo "  docker ps | grep keynet"
echo ""

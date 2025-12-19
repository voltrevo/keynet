#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="/var/lib/tor"
CERT_DIR="/etc/keynet"
CADDYFILE="/etc/caddy/Caddyfile"

# 1) Validate PROXY_TARGET is configured
if [ -z "${PROXY_TARGET:-}" ]; then
  echo "[keynet] ERROR: PROXY_TARGET environment variable not configured"
  echo "[keynet]"
  echo "[keynet] Set PROXY_TARGET to one of:"
  echo "[keynet]   - A full URL to proxy: PROXY_TARGET=http://localhost:8000"
  echo "[keynet]   - 'demo' for Meta RPC Server: PROXY_TARGET=demo"
  echo "[keynet]"
  echo "[keynet] Examples:"
  echo "[keynet]   docker run -e PROXY_TARGET=http://localhost:8000 keynet"
  echo "[keynet]   docker run -e PROXY_TARGET=demo keynet"
  exit 1
fi

# 2) Handle demo mode (use Meta RPC Server)
ACTUAL_PROXY_TARGET="$PROXY_TARGET"
if [ "$PROXY_TARGET" = "demo" ]; then
  echo "[keynet] Demo mode: using Meta RPC Server"
  ACTUAL_PROXY_TARGET="http://localhost:3000"
  
  echo "[keynet] starting Meta RPC Server..."
  npx tsx /app/src/meta-rpc-server.ts &
  RPC_SERVER_PID=$!
  sleep 2
  echo "[keynet] Meta RPC Server started (PID $RPC_SERVER_PID)"
fi

# 3) Copy base torrc template and append dynamic exit policy
TORRC="/etc/tor/torrc"
cp /etc/tor/torrc.template "$TORRC"

# 4) Generate or load Ed25519 keys and derive keynet address
#    Also generates RSA keys with fingerprint matching first byte of Ed25519 public key
CERT_KEY="${CERT_DIR}/ed25519-key.pem"
echo "[keynet] generating/loading Ed25519 and matching RSA keys..."
KEYNET_ADDR=$(npx tsx /app/src/keynet-setup.ts "$DATA_DIR/keys" "$CERT_KEY")

# Ensure Tor can read the keys
chown -R debian-tor:debian-tor "$DATA_DIR/keys"

if [ -z "$KEYNET_ADDR" ]; then
  echo "[keynet] ERROR: failed to compute keynet address"
  exit 1
fi

echo "[keynet] keynet address: http://${KEYNET_ADDR}.keynet/"

# 5) Add /etc/hosts entry mapping <addr>.keynet to this container's IP
CONTAINER_IP=$(hostname -I | awk '{print $1}')
echo "${CONTAINER_IP} ${KEYNET_ADDR}.keynet" >> /etc/hosts
echo "[keynet] added /etc/hosts entry: ${CONTAINER_IP} ${KEYNET_ADDR}.keynet"

# 6) Setup DNS to use dnsmasq (config already in image at /etc/dnsmasq.conf)
echo "[keynet] setting up DNS resolver..."
echo "nameserver 127.0.0.1" > /etc/resolv.conf

# Start dnsmasq
echo "[keynet] starting dnsmasq..."
dnsmasq --keep-in-foreground &
DNSMASQ_PID=$!
sleep 1

# 7) Append exit policy now that we know our IP
# Allow both the container's local IP and 127.0.0.1 (for localhost reverse proxies)
cat >> "$TORRC" <<EOF
ExitPolicy accept 127.0.0.1:80
ExitPolicy accept ${CONTAINER_IP}:80
ExitPolicy reject *:*
EOF

echo "[keynet] torrc:"
cat "$TORRC"

# 8) Test PROXY_TARGET connectivity with retries
echo "[keynet] testing connectivity to PROXY_TARGET: $ACTUAL_PROXY_TARGET"
MAX_ATTEMPTS=5
ATTEMPT=0
while true; do
  ATTEMPT=$((ATTEMPT + 1))
  
  # Try to reach /health endpoint first
  if curl -sf "${ACTUAL_PROXY_TARGET}/health" >/dev/null 2>&1; then
    echo "[keynet] ✓ Successfully connected to PROXY_TARGET"
    break
  fi
  
  # Fallback: try basic connectivity (HEAD request)
  if curl -sf -I "${ACTUAL_PROXY_TARGET}/" >/dev/null 2>&1; then
    echo "[keynet] ✓ Successfully connected to PROXY_TARGET (no /health endpoint)"
    break
  fi
  
  if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
    echo "[keynet] ERROR: Cannot reach PROXY_TARGET at $ACTUAL_PROXY_TARGET after $MAX_ATTEMPTS attempts"
    echo "[keynet]"
    echo "[keynet] This could mean:"
    echo "[keynet]   - The target service is not running"
    echo "[keynet]   - The URL is incorrect or unreachable from this container"
    echo "[keynet]   - Network connectivity issue"
    echo "[keynet]"
    echo "[keynet] Configured PROXY_TARGET: $PROXY_TARGET"
    echo "[keynet] Resolved to: $ACTUAL_PROXY_TARGET"
    echo "[keynet]"
    echo "[keynet] Check that:"
    echo "[keynet]   1. The service is running on the correct host/port"
    echo "[keynet]   2. The container can reach that address (check networking)"
    echo "[keynet]   3. If using localhost, ensure --network=host or proper Docker networking"
    echo "[keynet]"
    sleep infinity
  fi
  
  echo "[keynet] Retrying connection to $ACTUAL_PROXY_TARGET... (attempt $ATTEMPT/$MAX_ATTEMPTS)"
  sleep 2
done

# 9) Generate Caddy config to reverse proxy to PROXY_TARGET
cat > "$CADDYFILE" <<EOF
http://${KEYNET_ADDR}.keynet:80 {
    reverse_proxy ${ACTUAL_PROXY_TARGET}
}
EOF

echo "[keynet] Caddyfile:"
cat "$CADDYFILE"

# 10) Start Tor with final exit policy
echo "[keynet] starting Tor with final config..."
su -s /bin/bash -c "tor -f '$TORRC'" debian-tor &
TOR_PID=$!

# 11) Start Caddy in foreground
/usr/bin/caddy run --config "$CADDYFILE" --adapter caddyfile &
CADDY_PID=$!

# Setup cleanup on exit
trap 'echo "[keynet] Cleaning up processes..."; kill ${RPC_SERVER_PID:-} $DNSMASQ_PID $TOR_PID $CADDY_PID 2>/dev/null || true; exit' EXIT

# Monitor all background processes and exit if any of them die
echo "[keynet] All services started. Monitoring processes..."
while true; do
  # Check if Meta RPC Server is still alive (only if demo mode)
  if [ "${PROXY_TARGET:-}" = "demo" ] && ! kill -0 $RPC_SERVER_PID 2>/dev/null; then
    echo "[keynet] $(date '+%Y-%m-%d %H:%M:%S') ERROR: Meta RPC Server process died (PID $RPC_SERVER_PID)"
    wait $RPC_SERVER_PID 2>/dev/null
    exit_code=$?
    echo "[keynet] Exit code: $exit_code"
    exit 1
  fi
  
  # Check if Tor process is still alive
  if ! kill -0 $TOR_PID 2>/dev/null; then
    echo "[keynet] $(date '+%Y-%m-%d %H:%M:%S') ERROR: Tor process died (PID $TOR_PID)"
    wait $TOR_PID 2>/dev/null
    exit_code=$?
    echo "[keynet] Exit code: $exit_code"
    exit 1
  fi
  
  # Check if Caddy process is still alive
  if ! kill -0 $CADDY_PID 2>/dev/null; then
    echo "[keynet] $(date '+%Y-%m-%d %H:%M:%S') ERROR: Caddy process died (PID $CADDY_PID)"
    wait $CADDY_PID 2>/dev/null
    exit_code=$?
    echo "[keynet] Exit code: $exit_code"
    exit 1
  fi
  
  # Check if dnsmasq process is still alive
  if ! kill -0 $DNSMASQ_PID 2>/dev/null; then
    echo "[keynet] $(date '+%Y-%m-%d %H:%M:%S') ERROR: dnsmasq process died (PID $DNSMASQ_PID)"
    wait $DNSMASQ_PID 2>/dev/null
    exit_code=$?
    echo "[keynet] Exit code: $exit_code"
    exit 1
  fi
  
  sleep 5
done

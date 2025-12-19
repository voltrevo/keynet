#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="/var/lib/tor"
CERT_DIR="/etc/keynet"
WWW_DIR="/srv/www"
CADDYFILE="/etc/caddy/Caddyfile"

# 1) Copy base torrc template and append dynamic exit policy
TORRC="/etc/tor/torrc"
cp /etc/tor/torrc.template "$TORRC"

# 2) Generate or load Ed25519 keys and derive keynet address
#    Also generates RSA keys with fingerprint matching first byte of Ed25519 public key
#    This allows clients to find the matching Tor node by filtering on fingerprint prefix
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

# 4) Add /etc/hosts entry mapping <addr>.keynet to this container's IP
CONTAINER_IP=$(hostname -I | awk '{print $1}')
echo "${CONTAINER_IP} ${KEYNET_ADDR}.keynet" >> /etc/hosts
echo "[keynet] added /etc/hosts entry: ${CONTAINER_IP} ${KEYNET_ADDR}.keynet"

# 5) Setup DNS to use dnsmasq (config already in image at /etc/dnsmasq.conf)
echo "[keynet] setting up DNS resolver..."
echo "nameserver 127.0.0.1" > /etc/resolv.conf

# Start dnsmasq
echo "[keynet] starting dnsmasq..."
dnsmasq --keep-in-foreground &
DNSMASQ_PID=$!
sleep 1

# 6) Append exit policy now that we know our IP
cat >> "$TORRC" <<EOF
ExitPolicy accept ${CONTAINER_IP}:80
ExitPolicy reject *:*
EOF

echo "[keynet] torrc:"
cat "$TORRC"

# 7) Start Meta RPC Server on port 3000
echo "[keynet] starting Meta RPC Server..."
cd /app
npx tsx /app/src/meta-rpc-server.ts &
RPC_SERVER_PID=$!
sleep 2
echo "[keynet] Meta RPC Server started (PID $RPC_SERVER_PID)"

# 8) Caddy config: HTTP on 80 proxying to Meta RPC Server on 3000
cat > "$CADDYFILE" <<EOF
http://${KEYNET_ADDR}.keynet:80 {
    reverse_proxy localhost:3000
}
EOF

echo "[keynet] Caddyfile:"
cat "$CADDYFILE"

# 9) Start Tor with final exit policy
echo "[keynet] starting Tor with final config..."
su -s /bin/bash -c "tor -f '$TORRC'" debian-tor &
TOR_PID=$!

# 10) Start Caddy in foreground
/usr/bin/caddy run --config "$CADDYFILE" --adapter caddyfile &
CADDY_PID=$!

# Setup cleanup on exit
trap 'echo "[keynet] Cleaning up processes..."; kill $RPC_SERVER_PID $TOR_PID $CADDY_PID $DNSMASQ_PID 2>/dev/null || true; exit' EXIT

# Monitor all background processes and exit if any of them die
echo "[keynet] All services started. Monitoring processes..."
while true; do
  # Check if Meta RPC Server is still alive
  if ! kill -0 $RPC_SERVER_PID 2>/dev/null; then
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

#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="/var/lib/tor"
CERT_DIR="/etc/keynet"
WWW_DIR="/srv/www"
CADDYFILE="/etc/caddy/Caddyfile"

mkdir -p "$DATA_DIR" "$CERT_DIR" /etc/caddy
# Ensure proper ownership for Tor data directory
chown -R debian-tor:debian-tor "$DATA_DIR"

# 1) Base torrc (we'll append ExitPolicy after we know our IP)
TORRC="/etc/tor/torrc"
cat > "$TORRC" <<'EOF'
RunAsDaemon 0
DataDirectory /var/lib/tor
ORPort 9001
Nickname KeynetTestRelay
SocksPort 0
ClientOnly 0
ExitRelay 1
EOF

# 2) Generate or load Ed25519 keys and derive keynet address
mkdir -p "$DATA_DIR/keys"
chown -R debian-tor:debian-tor "$DATA_DIR/keys"

CERT_KEY="${CERT_DIR}/ed25519-key.pem"
echo "[keynet] generating/loading Ed25519 keys..."
KEYNET_ADDR=$(npx tsx /app/src/keynet-setup.ts "$DATA_DIR/keys" "$CERT_KEY")

if [ -z "$KEYNET_ADDR" ]; then
  echo "[keynet] ERROR: failed to compute keynet address"
  exit 1
fi

echo "[keynet] keynet address: https://${KEYNET_ADDR}.keynet/"

# 4) Add /etc/hosts entry mapping <addr>.keynet to this container's IP
CONTAINER_IP=$(hostname -I | awk '{print $1}')
echo "${CONTAINER_IP} ${KEYNET_ADDR}.keynet" >> /etc/hosts
echo "[keynet] added /etc/hosts entry: ${CONTAINER_IP} ${KEYNET_ADDR}.keynet"

# 5) Append exit policy now that we know our IP
cat >> "$TORRC" <<EOF
ExitPolicy accept ${CONTAINER_IP}:443
ExitPolicy reject *:*
EOF

echo "[keynet] torrc:"
cat "$TORRC"

# 6) Generate self-signed cert using the PEM key derived from Tor identity
CERT_CRT="${CERT_DIR}/ed25519-cert.pem"

# Check if cert exists and is valid for at least 30 days
REGEN_CERT=0
if [ ! -f "$CERT_CRT" ]; then
  REGEN_CERT=1
else
  # Check if cert expires in less than 30 days
  if ! openssl x509 -in "$CERT_CRT" -noout -checkend 2592000 2>/dev/null; then
    REGEN_CERT=1
    echo "[keynet] certificate expiring soon, regenerating..."
  fi
fi

if [ "$REGEN_CERT" -eq 1 ]; then
  echo "[keynet] generating self-signed cert using Tor Ed25519 identity..."
  openssl req -new -x509 -key "$CERT_KEY" -out "$CERT_CRT" \
    -days 365 \
    -subj "/CN=${KEYNET_ADDR}.keynet"
fi

# 7) Start simple HTTP server on 8080
echo "[keynet] starting demo HTTP server on :8080..."
python3 -m http.server 8080 --directory "$WWW_DIR" &
HTTP_PID=$!

# 8) Caddy config: HTTPS on 443 → proxy to http://localhost:8080
cat > "$CADDYFILE" <<EOF
https://${KEYNET_ADDR}.keynet:443 {
    tls ${CERT_CRT} ${CERT_KEY}
    reverse_proxy localhost:8080
}
EOF

echo "[keynet] Caddyfile:"
cat "$CADDYFILE"

# 9) Start Tor with final exit policy
echo "[keynet] starting Tor with final config..."
su -s /bin/bash -c "tor -f '$TORRC'" debian-tor &
TOR_PID=$!

# 10) Start certificate renewal daemon
npx tsx /app/src/cert-renewer.ts "$CERT_KEY" "$CERT_CRT" "$KEYNET_ADDR" &
RENEWER_PID=$!

# 11) Start Caddy in foreground
/usr/bin/caddy run --config "$CADDYFILE" --adapter caddyfile &
CADDY_PID=$!

trap 'kill $TOR_PID $HTTP_PID $RENEWER_PID 2>/dev/null || true' EXIT

wait "$CADDY_PID"

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

# 2) Start Tor once to generate identity keys
echo "[keynet] starting Tor to generate keys..."
su -s /bin/bash -c "tor -f '$TORRC'" debian-tor &
TOR_PID=$!

# Wait for keys to appear
while [ ! -f "$DATA_DIR/keys/ed25519_master_id_public_key" ] || \
      [ ! -f "$DATA_DIR/keys/ed25519_master_id_secret_key" ]; do
  sleep 1
done

sleep 2

# Stop Tor; we'll restart with final exit policy
echo "[keynet] keys generated, stopping Tor..."
kill "$TOR_PID" || true
wait "$TOR_PID" 2>/dev/null || true

# 3) Compute keynet address and export PEM key from Tor identity
CERT_KEY="${CERT_DIR}/ed25519-key.pem"
KEYNET_ADDR=$(python3 /usr/local/bin/keynet_setup.py \
  "$DATA_DIR/keys/ed25519_master_id_public_key" \
  "$DATA_DIR/keys/ed25519_master_id_secret_key" \
  "$CERT_KEY")

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

if [ ! -f "$CERT_CRT" ]; then
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

# 10) Start Caddy in foreground
/usr/bin/caddy run --config "$CADDYFILE" --adapter caddyfile &
CADDY_PID=$!

trap 'kill $TOR_PID $HTTP_PID 2>/dev/null || true' EXIT

wait "$CADDY_PID"

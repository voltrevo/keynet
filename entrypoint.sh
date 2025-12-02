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
echo "${CONTAINER_IP} asdf.com" >> /etc/hosts
echo "[keynet] added /etc/hosts entry: ${CONTAINER_IP} ${KEYNET_ADDR}.keynet"
echo "[keynet] added /etc/hosts entry: ${CONTAINER_IP} asdf.com"

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

# 7) Caddy config: HTTP on 80 serving static files
cat > "$CADDYFILE" <<EOF
http://${KEYNET_ADDR}.keynet:80 {
    root * ${WWW_DIR}
    file_server
}

http://asdf.com:80 {
    root * /srv/asdf.com
    file_server
}
EOF

echo "[keynet] Caddyfile:"
cat "$CADDYFILE"

# 8) Start Tor with final exit policy
echo "[keynet] starting Tor with final config..."
su -s /bin/bash -c "tor -f '$TORRC'" debian-tor &
TOR_PID=$!

# 9) Start Caddy in foreground
/usr/bin/caddy run --config "$CADDYFILE" --adapter caddyfile &
CADDY_PID=$!

trap 'kill $TOR_PID $DNSMASQ_PID 2>/dev/null || true' EXIT

wait "$CADDY_PID"

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
Log notice stderr
ORPort 9001
DirPort 9030
Nickname KeynetTestRelay
SocksPort 0
ClientOnly 0
ExitRelay 1
ServerDNSDetectHijacking 0
ServerDNSAllowBrokenConfig 1
ExitPolicyRejectPrivate 0
EOF

# 2) Generate or load Ed25519 keys and derive keynet address
#    Also generates RSA keys with fingerprint matching first byte of Ed25519 public key
#    This allows clients to find the matching Tor node by filtering on fingerprint prefix
mkdir -p "$DATA_DIR/keys"

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

# 5) Setup dnsmasq to respect /etc/hosts for Tor DNS resolution
echo "[keynet] configuring dnsmasq..."
cat > /etc/dnsmasq.conf <<'DNSMASQ_EOF'
# Don't read /etc/resolv.conf for upstream servers
no-resolv

# Read /etc/hosts for local mappings
addn-hosts=/etc/hosts

# Listen only on localhost
listen-address=127.0.0.1
bind-interfaces

# Upstream DNS servers
server=8.8.8.8
server=8.8.4.4

# Don't use /etc/dnsmasq.d
conf-dir=/etc/dnsmasq.d/,*.conf
DNSMASQ_EOF

# Backup original resolv.conf and point to dnsmasq
cp /etc/resolv.conf /etc/resolv.conf.backup
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

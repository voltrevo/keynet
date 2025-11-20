#!/usr/bin/env bash
# Certificate renewal script - runs periodically to renew cert before expiry

CERT_KEY="$1"
CERT_CRT="$2"
KEYNET_ADDR="$3"

while true; do
  # Check every 24 hours
  sleep 86400
  
  # Check if cert expires in less than 30 days (2592000 seconds)
  if ! openssl x509 -in "$CERT_CRT" -noout -checkend 2592000 2>/dev/null; then
    echo "[keynet] certificate expiring soon, regenerating..."
    openssl req -new -x509 -key "$CERT_KEY" -out "$CERT_CRT" \
      -days 365 \
      -subj "/CN=${KEYNET_ADDR}.keynet"
    
    # Reload Caddy to pick up new certificate
    if command -v caddy >/dev/null 2>&1; then
      caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile 2>/dev/null || true
    fi
    
    echo "[keynet] certificate renewed successfully"
  fi
done

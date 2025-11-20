FROM debian:stable-slim

# Install Tor, Caddy, Python, cryptography, OpenSSL
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        tor caddy python3 python3-cryptography \
        openssl ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

# Create dirs and set proper ownership for Tor
RUN mkdir -p /var/lib/tor /etc/keynet /srv/www && \
    chown -R debian-tor:debian-tor /var/lib/tor

# Simple demo content
RUN bash -lc 'echo "<h1>Keynet test service</h1><p>Hello from inside Docker.</p>" > /srv/www/index.html'

# Keynet helper script: derive keynet address and PEM key from Tor keys
COPY keynet_setup.py /usr/local/bin/keynet_setup.py
RUN chmod +x /usr/local/bin/keynet_setup.py

# Cert renewal script
COPY cert_renewer.sh /usr/local/bin/cert_renewer.sh
RUN chmod +x /usr/local/bin/cert_renewer.sh

# Entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 443 9001

ENTRYPOINT ["/entrypoint.sh"]

FROM debian:stable-slim

# Install Tor, Caddy, Node.js, OpenSSL
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        tor caddy nodejs npm \
        openssl ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

# Create dirs and set proper ownership for Tor
RUN mkdir -p /var/lib/tor /etc/keynet /srv/www && \
    chown -R debian-tor:debian-tor /var/lib/tor

# Simple demo content
RUN bash -lc 'echo "<h1>Keynet test service</h1><p>Hello from inside Docker.</p>" > /srv/www/index.html'

# Keynet TypeScript project
COPY package.json tsconfig.json /app/
COPY src /app/src
WORKDIR /app
RUN npm install

# Entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 443 9001

ENTRYPOINT ["/entrypoint.sh"]

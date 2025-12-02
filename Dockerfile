FROM debian:stable-slim

# Install Tor, Caddy, Node.js, OpenSSL, dnsmasq, procps
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        tor caddy nodejs npm \
        openssl ca-certificates curl \
        dnsmasq procps && \
    rm -rf /var/lib/apt/lists/*

# Create dirs and set proper ownership for Tor
RUN mkdir -p /var/lib/tor /etc/keynet /srv/www /srv/asdf.com && \
    chown -R debian-tor:debian-tor /var/lib/tor

# Simple demo content
RUN bash -lc 'echo "<h1>Keynet test service</h1><p>Hello from inside Docker.</p>" > /srv/www/index.html' && \
    bash -lc 'echo "<h1>Keynet test service</h1><p>Fake asdf.com.</p>" > /srv/asdf.com/index.html'

# Keynet TypeScript project
COPY package.json tsconfig.json /app/
COPY src /app/src
WORKDIR /app
RUN npm install

# Entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 9001 9030

ENTRYPOINT ["/entrypoint.sh"]

FROM debian:stable-slim

# Install Tor, Caddy, Node.js, OpenSSL, dnsmasq, procps
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        tor caddy nodejs npm \
        openssl ca-certificates curl \
        dnsmasq procps && \
    rm -rf /var/lib/apt/lists/*

# Create dirs and set proper ownership for Tor
RUN mkdir -p /var/lib/tor /var/lib/tor/keys /etc/keynet /etc/caddy /srv/www /srv/asdf.com && \
    chown -R debian-tor:debian-tor /var/lib/tor

# Simple demo content
RUN bash -lc 'echo "<h1>Keynet test service</h1><p>Hello from inside Docker.</p>" > /srv/www/index.html' && \
    bash -lc 'echo "<h1>Keynet test service</h1><p>Fake asdf.com.</p>" > /srv/asdf.com/index.html'

# Copy dnsmasq configuration
COPY dnsmasq.conf /etc/dnsmasq.conf

# Keynet TypeScript project
COPY package.json tsconfig.json /app/
COPY src /app/src
WORKDIR /app
RUN npm install

# Build arguments (required)
ARG TOR_NICKNAME

# Create base torrc with static configuration
RUN echo "RunAsDaemon 0" > /etc/tor/torrc.template && \
    echo "DataDirectory /var/lib/tor" >> /etc/tor/torrc.template && \
    echo "Log notice stderr" >> /etc/tor/torrc.template && \
    echo "ORPort 9001" >> /etc/tor/torrc.template && \
    echo "DirPort 9030" >> /etc/tor/torrc.template && \
    echo "Nickname ${TOR_NICKNAME}" >> /etc/tor/torrc.template && \
    echo "SocksPort 0" >> /etc/tor/torrc.template && \
    echo "ClientOnly 0" >> /etc/tor/torrc.template && \
    echo "ExitRelay 1" >> /etc/tor/torrc.template && \
    echo "ServerDNSDetectHijacking 0" >> /etc/tor/torrc.template && \
    echo "ServerDNSAllowBrokenConfig 1" >> /etc/tor/torrc.template && \
    echo "ExitPolicyRejectPrivate 0" >> /etc/tor/torrc.template

# Entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 9001 9030

ENTRYPOINT ["/entrypoint.sh"]

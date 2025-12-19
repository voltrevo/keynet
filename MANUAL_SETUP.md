# Manual Keynet Setup (No Docker)

If you prefer to skip Docker, you can set up Keynet manually. The process is straightforward since Keynet is just:
1. A Tor relay configured as an exit node
2. An HTTP reverse proxy
3. Ed25519 + RSA keypair generation

## Prerequisites

- Linux/Unix system with Tor and a reverse proxy (Caddy, nginx, etc.)
- Node.js 18+ (for key generation scripts)
- Port 9001 (Tor ORPort) and 9030 (Tor DirPort) open to the internet
- Port 80 open locally for your reverse proxy

## Key Generation

The only code you need is in this repository:

```bash
git clone https://github.com/voltrevo/keynet
cd keynet
npm install
```

Generate your Ed25519 master key and matching RSA identity key:

```bash
npx tsx src/keynet-setup.ts /path/to/tor/keys /path/to/ed25519-key.pem
```

This will:
- Generate Ed25519 and RSA keypairs (or load existing ones)
- Output your Keynet address: `http://[base32-encoded-key].keynet/`
- Save keys to the paths you specified

**Output example:**
```
[keynet] Keynet address: http://abcdefghijklmnopqrstuvwxyz.keynet/
[keynet] Ed25519 fingerprint: ...
[keynet] RSA fingerprint: ...
```

## Tor Configuration

Create `/etc/tor/torrc`:

```
# Basic relay config
RunAsDaemon 1
DataDirectory /var/lib/tor
ORPort 9001
DirPort 9030
Nickname MyRelayName
Log notice file /var/log/tor/notices.log

# Key files (from key generation step above)
Ed25519IdentityFile /path/to/tor/keys/ed25519_master_id_secret_key
Ed25519IdentityFile /path/to/tor/keys/ed25519_master_id_public_key

# Exit relay config
ExitRelay 1
SocksPort 0

# Only allow traffic to your reverse proxy
ExitPolicy accept 127.0.0.1:80
ExitPolicy reject *:*
```

Start Tor:

```bash
tor -f /etc/tor/torrc
```

## Reverse Proxy Configuration

### Caddy

Create `Caddyfile`:

```caddy
http://abcdefghijklmnopqrstuvwxyz.keynet:80 {
    reverse_proxy localhost:8000
}
```

Start Caddy:

```bash
caddy run --config Caddyfile
```

### Nginx

Create `/etc/nginx/sites-available/keynet`:

```nginx
server {
    listen 80;
    server_name abcdefghijklmnopqrstuvwxyz.keynet;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable and start:

```bash
ln -s /etc/nginx/sites-available/keynet /etc/nginx/sites-enabled/
nginx -s reload
```

## DNS Resolution

Add to `/etc/hosts` (or configure your system's DNS):

```
127.0.0.1 abcdefghijklmnopqrstuvwxyz.keynet
```

This ensures the Keynet domain resolves locally on the relay itself.

## Running Your Service

With the reverse proxy pointing to `localhost:8000`, run your HTTP service:

```bash
# Example: simple HTTP server
python3 -m http.server 8000

# Or your application
node app.js --port 8000
```

## Verification

From inside your relay server:

```bash
curl http://abcdefghijklmnopqrstuvwxyz.keynet/
```

Should return content from your service running on port 8000.

## Client Access

Clients access your service via Tor by:
1. Configuring Tor to use your relay as an exit node
2. Accessing `http://abcdefghijklmnopqrstuvwxyz.keynet/`

The Keynet domain itself (the Ed25519 public key) proves the server's identity—no TLS or certificates needed.

## Troubleshooting

- **Keys not persisting**: Ensure the path you pass to `keynet-setup.ts` uses persistent storage
- **Reverse proxy can't connect**: Verify your service is listening on `localhost:8000`
- **Tor won't start**: Check `/var/log/tor/notices.log` for errors
- **Domain doesn't resolve**: Verify `/etc/hosts` entry or DNS configuration

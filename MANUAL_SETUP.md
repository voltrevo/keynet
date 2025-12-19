# Manual Keynet Setup (No Docker)

Keynet is straightforward to set up manually. You need:
1. A Tor relay configured as an exit node
2. An HTTP reverse proxy (Caddy, nginx, etc.)
3. Custom Ed25519 + RSA keypair generation (the only code needed)

## Prerequisites

- Linux/Unix system with Tor and a reverse proxy
- Node.js 18+ (for key generation)
- Ports 9001 (Tor ORPort) and 9030 (Tor DirPort) open to the internet
- Port 80 open locally for your reverse proxy

## Key Generation

Tor's auto-generated keys won't work for Keynet because the Ed25519 and RSA fingerprints are independent. Keynet requires the **first byte of the Ed25519 public key to match the first byte of the RSA fingerprint**, enabling efficient relay discovery—otherwise clients must scan all ~9000 Tor relays to find yours.

Clone the repository:

```bash
git clone https://github.com/voltrevo/keynet
cd keynet && npm install
```

Generate matching keypairs:

```bash
npx tsx src/keynet-setup.ts /path/to/tor/keys /path/to/ed25519-key.pem
```

Output example:
```
[keynet] Keynet address: http://abcdefghijklmnopqrstuvwxyz.keynet/
[keynet] RSA fingerprint: 4E73DEEA6AB67C2E01A1D3A81E6F4D9F7F92900F
```

The script generates RSA keys repeatedly until the first byte matches (typically ~10 seconds, ~256 attempts). Keys are reused across restarts.

## Tor Configuration

Create `/etc/tor/torrc`:

```
RunAsDaemon 0
DataDirectory /var/lib/tor
Log notice stderr
ORPort 9001
DirPort 9030
Nickname MyRelayName

ExitRelay 1
SocksPort 0
ClientOnly 0

# CRITICAL: These allow DNS hijacking and private IPs for local proxy
ServerDNSDetectHijacking 0
ServerDNSAllowBrokenConfig 1
ExitPolicyRejectPrivate 0

# Determine YOUR_IP: hostname -I | awk '{print $1}'
ExitPolicy accept YOUR_IP:80
ExitPolicy reject *:*
```

**Why those settings matter:**
- `ServerDNSDetectHijacking 0` — Allows local DNS for the Keynet domain
- `ServerDNSAllowBrokenConfig 1` — Allows DNS config referencing 127.0.0.1
- `ExitPolicyRejectPrivate 0` — Allows private IPs in exit policy

Without these, Tor will reject the configuration. Start Tor:

```bash
tor -f /etc/tor/torrc
```

## DNS Resolution

Add to `/etc/hosts`:

```
127.0.0.1 abcdefghijklmnopqrstuvwxyz.keynet
```

For more complex setups, use dnsmasq (see troubleshooting).

## Reverse Proxy Configuration

### Caddy

Create `Caddyfile`:

```caddy
http://abcdefghijklmnopqrstuvwxyz.keynet:80 {
    reverse_proxy localhost:8000
}
```

Start:
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

## Running Your Service

Your reverse proxy points to `localhost:8000`. Run your service there:

```bash
python3 -m http.server 8000
# or
node app.js --port 8000
```

## Verification

Test from your relay:

```bash
curl http://abcdefghijklmnopqrstuvwxyz.keynet/
```

Should return content from your service.

## Troubleshooting

**Tor won't start: "ExitPolicy rejects private IPs"**
- Add the three critical settings above (`ServerDNSDetectHijacking`, `ServerDNSAllowBrokenConfig`, `ExitPolicyRejectPrivate`)

**Tor won't start: "Address already in use" (9001/9030)**
```bash
lsof -i :9001 -i :9030  # Kill the old process
```

**Domain doesn't resolve**
- Verify `/etc/hosts` entry: `cat /etc/hosts | grep keynet`
- Test: `nslookup abcdefghijklmnopqrstuvwxyz.keynet 127.0.0.1`
- If using dnsmasq, verify it's running and `/etc/resolv.conf` has `nameserver 127.0.0.1`

**Reverse proxy can't connect to backend**
```bash
curl http://localhost:8000/  # Verify service is running
```

**Tor clients can't connect**
- Relay needs to bootstrap (~5 min) and enter Tor consensus
- Check logs: `tail -f /var/log/tor/notices.log | grep Bootstrap`
- Ensure ports 9001/9030 are reachable from the internet (no firewall blocking)

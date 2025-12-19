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
[keynet] RSA fingerprint: 4E73DEEA6AB67C2E01A1D3A81E6F4D9F7F92900F
```

### About RSA Fingerprint Matching

The script generates RSA keys whose SHA-1 fingerprint's **first byte matches** the Ed25519 public key's first byte. This enables efficient relay discovery:

- Tor clients can quickly filter relays by matching the first byte of the Keynet address to the first byte of the RSA fingerprint
- Without this matching, clients would need to scan all relays to find the one hosting your Keynet service

The script will try up to ~256 RSA key generation attempts to find a match. This typically takes 5-10 seconds. The keys are then reused across restarts (persisted in your keys directory).

## Tor Configuration

Create `/etc/tor/torrc`:

```
# Basic relay config
RunAsDaemon 0
DataDirectory /var/lib/tor
Log notice stderr
ORPort 9001
DirPort 9030
Nickname MyRelayName

# Exit relay config
ExitRelay 1
SocksPort 0
ClientOnly 0

# CRITICAL: Allow DNS hijacking and private IPs for local proxy
# Tor normally rejects exit policies allowing private IPs, but your reverse
# proxy will be on 127.0.0.1 or a container IP. These settings allow it:
ServerDNSDetectHijacking 0
ServerDNSAllowBrokenConfig 1
ExitPolicyRejectPrivate 0

# Only allow traffic to your reverse proxy
ExitPolicy accept 127.0.0.1:80
ExitPolicy reject *:*
```

**Critical settings explained:**
- `ServerDNSDetectHijacking 0` — Allows Tor to serve DNS locally for the Keynet domain
- `ServerDNSAllowBrokenConfig 1` — Allows DNS config that references 127.0.0.1
- `ExitPolicyRejectPrivate 0` — Allows exit policy for private IPs (your reverse proxy)

Without these, Tor will reject the configuration because it normally doesn't allow exit policies for private addresses.

Start Tor:

```bash
tor -f /etc/tor/torrc
```

## Exit Policy Configuration

The exit policy must be configured **after** you know your relay's IP address, since it specifies `ExitPolicy accept YOUR_IP:80`.

When setting up, determine your relay's local IP:

```bash
# On Linux
hostname -I | awk '{print $1}'

# Or
ip addr show | grep "inet " | grep -v 127.0.0.1
```

If your reverse proxy is on a container or VM with a non-public IP (like 172.17.0.2), use that IP in the exit policy:

```
ExitPolicy accept 172.17.0.2:80
ExitPolicy reject *:*
```

This ensures Tor:
1. Allows exit connections to your reverse proxy on port 80
2. Rejects all other exit traffic

**Why this matters:** Without the specific exit policy, Tor could forward traffic to other destinations, defeating the purpose of a Keynet relay (which should only proxy traffic to your service).

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

The Keynet domain must resolve locally on your relay. Without proper DNS setup, Tor clients will get NXDOMAIN errors.

### Option 1: /etc/hosts (Simple)

Add to `/etc/hosts`:

```
127.0.0.1 abcdefghijklmnopqrstuvwxyz.keynet
```

This works if your reverse proxy is on localhost.

### Option 2: dnsmasq (Recommended)

If you have multiple domains or complex networking, use dnsmasq as a local resolver:

**Install dnsmasq:**
```bash
apt install dnsmasq
```

**Create `/etc/dnsmasq.conf`:**
```
# Use /etc/hosts for local domain mappings
addn-hosts=/etc/hosts

# Listen only on localhost (not 0.0.0.0)
listen-address=127.0.0.1
bind-interfaces

# Upstream DNS
server=8.8.8.8
server=8.8.4.4
```

**Point system resolver to dnsmasq:**
```bash
echo "nameserver 127.0.0.1" > /etc/resolv.conf
```

**Start dnsmasq:**
```bash
systemctl start dnsmasq
# or
dnsmasq --keep-in-foreground &
```

**Then add to `/etc/hosts`:**
```
127.0.0.1 abcdefghijklmnopqrstuvwxyz.keynet
```

Tor's DNS requests will resolve through dnsmasq → /etc/hosts.

### Why DNS Matters

Without proper DNS resolution:
- Tor will attempt to resolve the `.keynet` domain
- It will fail (NXDOMAIN)
- Clients will get connection errors
- The service won't be accessible

The Keynet address itself proves identity, but DNS resolution must work for the circuit to function.

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

**If this fails:**

1. **DNS resolution error**: Check that `/etc/hosts` or dnsmasq is configured correctly
   ```bash
   # Test DNS resolution
   nslookup abcdefghijklmnopqrstuvwxyz.keynet
   ```

2. **Connection refused**: Verify your reverse proxy is running and listening
   ```bash
   # For Caddy
   curl http://localhost:80/
   # For nginx
   sudo systemctl status nginx
   ```

3. **Reverse proxy can't reach backend**: Ensure your service is running on port 8000
   ```bash
   curl http://localhost:8000/
   ```

4. **Tor issues**: Check Tor logs (if not using journalctl)
   ```bash
   # From your torrc, check the Log file path
   tail -f /var/log/tor/notices.log
   ```

## Client Access

Clients access your service via Tor by:
1. Configuring Tor to use your relay as an exit node
2. Accessing `http://abcdefghijklmnopqrstuvwxyz.keynet/`

The Keynet domain itself (the Ed25519 public key) proves the server's identity—no TLS or certificates needed.

## Troubleshooting

### Keys not persisting
Ensure the path you pass to `keynet-setup.ts` uses persistent storage and that Tor can read the keys:
```bash
chmod 700 /path/to/tor/keys
```

### Tor won't start
Common issues:

1. **"Address already in use" on port 9001 or 9030**
   ```bash
   lsof -i :9001 -i :9030
   # Kill the process if needed
   ```

2. **"ExitPolicy rejects private IPs"**
   - You forgot the critical Tor config options
   - Ensure you have all three:
     - `ServerDNSDetectHijacking 0`
     - `ServerDNSAllowBrokenConfig 1`
     - `ExitPolicyRejectPrivate 0`

3. **"Cannot bind to ORPort"**
   - Check that ports 9001 and 9030 are not firewalled
   - Ensure you have permission to bind to these ports (may need sudo)

### Reverse proxy can't connect to backend
- Verify your service is listening: `curl http://localhost:8000/`
- Check your reverse proxy logs (Caddy or nginx)
- Ensure the service is actually running

### Domain doesn't resolve
- Verify `/etc/hosts` entry: `cat /etc/hosts | grep keynet`
- If using dnsmasq, verify it's running: `systemctl status dnsmasq`
- Check that `/etc/resolv.conf` points to 127.0.0.1: `cat /etc/resolv.conf`
- Test DNS: `nslookup abcdefghijklmnopqrstuvwxyz.keynet 127.0.0.1`

### Tor clients can't connect
- The relay needs to bootstrap and get into the Tor consensus (takes a few minutes)
- Check Tor logs for bootstrap progress: `tail -f /var/log/tor/notices.log | grep Bootstrap`
- Ensure ports 9001/9030 are reachable from the internet (not firewalled or NATed without forwarding)

### RSA fingerprint doesn't match
This is rare and suggests the key generation failed. Re-run `keynet-setup.ts`:
```bash
# Remove existing keys to force regeneration
rm -rf /path/to/tor/keys/*
npx tsx src/keynet-setup.ts /path/to/tor/keys /path/to/ed25519-key.pem
```

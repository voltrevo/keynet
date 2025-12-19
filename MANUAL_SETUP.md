# Manual Keynet Setup (No Docker)

Keynet is straightforward to set up manually. You need:
1. A set of Ed25519 + RSA keys such that the RSA fingerprint and Ed25519 pubkey have the same first byte
2. A Tor relay configured with those keys, and some special config
3. A HTTP service to target

## Key Generation

Tor's auto-generated keys won't work for Keynet because the Ed25519 and RSA fingerprints are independent. Keynet requires the **first byte of the Ed25519 public key to match the first byte of the RSA fingerprint**, enabling efficient relay discovery—otherwise clients must scan all ~9000 Tor relays to find yours.

Clone the repository:

```bash
git clone https://github.com/voltrevo/keynet
cd keynet && npm install
```

Generate matching keypairs:

```bash
npx tsx src/keynet-setup.ts /path/to/tor/keys
```

This writes the generated keys to `/path/to/tor/keys/` in Tor's standard format (the script creates or loads keys from this directory).

Output example:
```
[keynet] Keynet address: http://abcdefghijklmnopqrstuvwxyz.keynet/
[keynet] RSA fingerprint: 4E73DEEA6AB67C2E01A1D3A81E6F4D9F7F92900F
```

The script generates RSA keys repeatedly until the first byte matches (typically ~10 seconds, ~256 attempts).

If you need the Ed25519 private key in PEM format (for external use like TLS certificates), you can export it:

```bash
npx tsx src/export-ed25519-pem.ts /path/to/tor/keys /path/to/ed25519-key.pem
```

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

# CRITICAL: These settings allow Tor to exit to private/local addresses
# By default, Tor blocks exiting to RFC1918 private addresses and localhost
ServerDNSDetectHijacking 0
ServerDNSAllowBrokenConfig 1
ExitPolicyRejectPrivate 0

# Exit policy: must match where your HTTP service is reachable
ExitPolicy accept 127.0.0.1:80 # or the IP you need (tor doesn't allow hostname here)
ExitPolicy reject *:*
```

**Important:** The `DataDirectory` in torrc must point to the same directory you passed to `keynet-setup.ts`. For example, if you ran:
```bash
npx tsx src/keynet-setup.ts /var/lib/tor
```

Then your torrc must have:
```
DataDirectory /var/lib/tor
```

Tor reads the generated keys (`ed25519_master_id_secret_key` and `ed25519_master_id_public_key`) from the `DataDirectory`.

## DNS Resolution

Tor needs to resolve your Keynet domain when processing DNS queries and validating exit policies. The resolver configured in `/etc/resolv.conf` must return the correct IP for your Keynet domain.

**Important:** `/etc/hosts` alone is not sufficient—Tor makes DNS queries to the resolver specified in `/etc/resolv.conf`, not by reading `/etc/hosts` directly.

Configure your DNS resolver to return the correct mapping. One way to do this is with dnsmasq:

**Install and configure dnsmasq:**

```bash
apt install dnsmasq
```

Create `/etc/dnsmasq.conf`:
```
addn-hosts=/etc/hosts
listen-address=127.0.0.1
bind-interfaces
server=8.8.8.8
server=8.8.4.4
```

Point system resolver to dnsmasq:
```bash
echo "nameserver 127.0.0.1" > /etc/resolv.conf
```

Start dnsmasq:
```bash
dnsmasq --keep-in-foreground &
# or
systemctl start dnsmasq
```

Then add to `/etc/hosts`:
```
127.0.0.1 abcdefghijklmnopqrstuvwxyz.keynet
```

Tor will now query dnsmasq on 127.0.0.1, which will read from `/etc/hosts` and return the correct mapping.

**Alternative:** Configure your DNS resolver directly (without dnsmasq) to return the correct IP for your Keynet domain.

## Verification

**NOTE**: It takes a while (hours unfortunately) for new Tor nodes to become visible in the network, and your keynet service won't work until this happens. You can check visibility by searching your node's nickname or IP at https://onionoo.torproject.org/summary.

To verify your Keynet relay is working correctly, you need to make an HTTP request through Tor to your Keynet address. You can do this using:

**Option 1: Tor JS (Web-based)**

Visit https://voltrevo.github.io/tor-js/ and use the web interface to make requests to `http://[encoded-key].keynet/`

**Option 2: curlTor CLI**

Install the tor-js npm package and use the curlTor CLI:

```bash
npm install -g tor-js
curlTor http://[encoded-key].keynet/
```

Both tools will route your request through Tor, specify your relay as the exit node, and display the response from your Keynet service.

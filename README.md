# Keynet Test Service (Docker)

This is a small test harness for experimenting with the **Keynet** idea:

> A public-IP HTTPS service whose identity is bound to a Tor relay's Ed25519
> identity key, reachable via a `https://[encoded-key].keynet/` style address.

The container does the following on startup:

1. **Generates or loads Ed25519 relay identity** and matching RSA keys:
   - Creates an Ed25519 keypair for Tor relay identity.
   - Generates an RSA keypair whose SHA-1 fingerprint's **first byte matches** the Ed25519 public key's first byte.
   - This fingerprint matching allows clients to efficiently find the corresponding Tor relay by filtering on fingerprint prefix.
2. Reads the public + secret identity key files and:
   - Derives a `keynet` label using the **onion v3 encoding** of the public key.
   - Exports the same Ed25519 **private key** as a PKCS#8 PEM file for TLS.
3. Prints the resulting address:

   ```text
   https://[encoded-key].keynet/
   ```

4. Maps `[encoded-key].keynet` to the container's IP via `/etc/hosts`.
5. Appends a strict Tor **ExitPolicy**:

   ```text
   ExitPolicy accept <container-ip>:443
   ExitPolicy reject *:*
   ```

   This makes the relay an exit that can **only** reach its own HTTPS port.

6. Configures Caddy to serve static files from `/srv/www/` directly.
7. Generates a **self-signed Ed25519 certificate** using the Tor identity key.
8. Runs **Caddy** on port 443:

   - TLS key = Tor Ed25519 identity key (via PEM).
   - TLS cert = self-signed for `<encoded-key>.keynet`.
   - Serves static files directly from `/srv/www/`.

In other words:

- Tor relay identity key == TLS key
- `https://<encoded-key>.keynet/` is both the **Keynet address** and the CN.
- The relay is an exit, but only for its **own** HTTPS service.

## Files

- `Dockerfile` – builds a Debian-based image with Tor, Caddy, OpenSSL, and Node.js/TypeScript.
- `entrypoint.sh` – orchestrates Tor, key extraction, hosts entry, HTTP server, and Caddy.
- `src/keynet-setup.ts` – parses/generates Tor Ed25519 and matching RSA keys, produces the Keynet label, and writes PEM keys.
- `src/cert-renewer.ts` – daemon that automatically renews the TLS certificate before expiration.
- `test-rsa-matching.ts` – test script to verify RSA fingerprint matches Ed25519 public key prefix.
- `README.md` – this file.

## Building and Running

From this directory:

```bash
docker build -t keynet-test .
docker run --rm -p 443:443 -p 9001:9001 \
  -v ~/keynet-data/tor-keys/keys:/var/lib/tor/keys \
  keynet-test
```

The volume mount persists the Tor relay identity across container restarts. If the keys directory is empty, new keys will be generated on first run.

On startup you'll see output similar to:

```text
[keynet] keynet address: https://abcdefghijklmnopqrstuvwx.keynet/
```

Inside the container, that hostname resolves via `/etc/hosts` to the container's IP, and Caddy serves your Ed25519-backed HTTPS endpoint at that URL.

## RSA Fingerprint Matching

The setup automatically generates an RSA keypair whose SHA-1 fingerprint matches the first byte of the Ed25519 public key. This enables efficient relay discovery:

1. **Ed25519 public key** → encoded as `https://[encoded-key].keynet/`
2. **RSA fingerprint** → first byte matches Ed25519 public key's first byte
3. **Tor relay lookup** → clients can query for relays with matching fingerprint prefix

Since only ~1 in 256 random RSA keys will match a given 1-byte prefix, this reduces the search space when finding the corresponding Tor relay for a given Keynet address.

To verify the match after generating keys:

```bash
npx tsx test-rsa-matching.ts /var/lib/tor/keys
```

The generation process typically requires a few hundred RSA key generations to find a match (average: ~128 attempts for 1-byte match).

**Note:** On first run, Tor regenerates the Ed25519 public key file from the secret key we provide, which may result in a slightly different public key than we calculated. The RSA key matching works correctly on subsequent runs when we load the Tor-generated Ed25519 public key.

## Notes

- This is a **test harness**, not production-hardened code.
- The Tor exit is extremely constrained: it can only exit to `<container-ip>:443`.
- No attempt is made here to implement the full "Keynet" client logic; this is just the **server side** for experimentation.
- RSA key generation with fingerprint matching typically takes 1-5 seconds on first run.

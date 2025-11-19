# Keynet Test Service (Docker)

This is a small test harness for experimenting with the **Keynet** idea:

> A public-IP HTTPS service whose identity is bound to a Tor relay's Ed25519
> identity key, reachable via a `https://[encoded-key].keynet/` style address.

The container does the following on startup:

1. Starts Tor once to **generate an Ed25519 relay identity**.
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

6. Runs a simple Python HTTP server on `localhost:8080` serving `/srv/www/index.html`.
7. Generates a **self-signed Ed25519 certificate** using the Tor identity key.
8. Runs **Caddy** on port 443:

   - TLS key = Tor Ed25519 identity key (via PEM).
   - TLS cert = self-signed for `<encoded-key>.keynet`.
   - Reverse proxy: `https://<encoded-key>.keynet/` → `http://localhost:8080`.

In other words:

- Tor relay identity key == TLS key
- `https://<encoded-key>.keynet/` is both the **Keynet address** and the CN.
- The relay is an exit, but only for its **own** HTTPS service.

## Files

- `Dockerfile` – builds a Debian-based image with Tor, Caddy, Python, OpenSSL, and cryptography.
- `entrypoint.sh` – orchestrates Tor, key extraction, hosts entry, HTTP server, and Caddy.
- `keynet_setup.py` – parses Tor Ed25519 keys, produces the Keynet label, and writes a PEM key.
- `README.md` – this file.

## Building and Running

From this directory:

```bash
docker build -t keynet-test .
docker run --rm -p 443:443 -p 9001:9001 keynet-test
```

On startup you'll see output similar to:

```text
[keynet] keynet address: https://abcdefghijklmnopqrstuvwx.keynet/
```

Inside the container, that hostname resolves via `/etc/hosts` to the container's IP, and Caddy serves your Ed25519-backed HTTPS endpoint at that URL.

## Notes

- This is a **test harness**, not production-hardened code.
- The Tor exit is extremely constrained: it can only exit to `<container-ip>:443`.
- No attempt is made here to implement the full "Keynet" client logic; this is just the **server side** for experimentation.

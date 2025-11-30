# Keynet

Keynet is a special TLD for securely serving http over Tor, keeping clients anonymous but not
requiring anonymity for the server.

Keynet services have URLs like this:

`http://[encoded-key].keynet/`

Where `[encoded-key]` is the Tor relay's Ed25519 identity key.

To access the service, the Tor client needs identify the Tor relay with this key and specify
it as the exit node of the circuit. Within that node, this domain will point back to itself
(using `/etc/hosts`) so it can fulfil the request locally.

Keynet services do not use TLS because similar protection is provided via the Tor protocol - adding
TLS would be redundant. This avoids any need for key signing because the keynet domain represents
the Tor node's public key, so the ownership of that key is naturally secured by the cryptography
and does not require attestation by certificate authorities.

## Building and Running

From this directory:

```bash
docker build -t keynet .
docker run -d -p 9001:9001 -p 9030:9030 \
  -v ~/keynet-data/tor-keys/keys:/var/lib/tor/keys \
  keynet
```

The volume mount persists the Tor relay identity across container restarts. If the keys directory is empty, new keys will be generated on first run.

On startup you'll see output similar to:

```text
[keynet] keynet address: http://abcdefghijklmnopqrstuvwx.keynet/
```

Inside the container, that hostname resolves via `/etc/hosts` to the container's IP, and Caddy serves your Ed25519-backed HTTP endpoint at that URL.

## RSA Fingerprint Matching

The setup automatically generates an RSA keypair whose SHA-1 fingerprint matches the first byte of the Ed25519 public key. This enables efficient discovery of the relay hosting the keynet service.

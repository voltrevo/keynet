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

## Quick Install

This will prompt for your relay's nickname (used in tor consensus):

```bash
curl -fsSL https://raw.githubusercontent.com/voltrevo/keynet/main/install.sh | bash'
```

You can also specify it in the command like this:

```bash
curl -fsSL https://raw.githubusercontent.com/voltrevo/keynet/main/install.sh | TOR_NICKNAME=MyRelayName bash
```

This script will:
- Install Docker if not already installed
- Clone the Keynet repository
- Build the Docker image with your chosen nickname
- Start the container with persistent key storage

## Building and Running Manually

From this directory:

```bash
# Build the image with a unique relay nickname (required)
docker build --build-arg TOR_NICKNAME=MyRelayName -t keynet .

# Run the container
docker run -d -p 9001:9001 -p 9030:9030 \
  -v ~/keynet-data/keys:/var/lib/tor/keys \
  keynet
```

The volume mount persists the Tor relay identity across container restarts. If the keys directory is empty, new keys will be generated on first run.

On startup you'll see output similar to:

```text
[keynet] keynet address: http://abcdefghijklmnopqrstuvwx.keynet/
```

Inside the container, that hostname resolves via `/etc/hosts` to the container's IP, and Caddy serves your Ed25519-backed HTTP endpoint at that URL.

## Meta RPC Server

Keynet includes a built-in **Meta RPC Server** that provides random load-balanced JSON-RPC access to multiple blockchain networks. This allows you to run a public RPC endpoint with no TLS or certificate management required.

### Supported Networks

The Meta RPC Server provides endpoints for:
- **Ethereum** (Chain ID: 1) — 5 public endpoints
- **Arbitrum** (Chain ID: 42161) — 5 public endpoints
- **Optimism** (Chain ID: 10) — 5 public endpoints
- **Base** (Chain ID: 8453) — 5 public endpoints
- **Polygon** (Chain ID: 137) — 5 public endpoints

### Usage Examples

Route requests by network name, chain ID, or alias:

```bash
# By network name
curl -X POST http://[keynet-addr].keynet/ethereum \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1}'

# By chain ID
curl -X POST http://[keynet-addr].keynet/1 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1}'

# By alias (eth, arb, op, poly, matic)
curl -X POST http://[keynet-addr].keynet/eth \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1}'
```

### API Endpoints

- `GET /` — HTML help page with full documentation
- `GET /info` — JSON metadata about supported networks and endpoints
- `GET /health` — Health check endpoint (returns `{"status": "ok", "uptime": "..."}`); useful for container health probes
- `POST /<network>` — JSON-RPC proxy to the selected network

Request bodies must be valid JSON-RPC 2.0 format. The server randomly selects from the available endpoints for each network to distribute load.

**Request size limit**: Maximum 1MB per request to prevent abuse.

## RSA Fingerprint Matching

The setup automatically generates an RSA keypair whose SHA-1 fingerprint matches the first byte of the Ed25519 public key. This enables efficient discovery of the relay hosting the keynet service.

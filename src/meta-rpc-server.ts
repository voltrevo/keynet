import https from 'https';
import http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';

// RPC Endpoints - Top 5 fastest per network
const RPC_ENDPOINTS = {
  ethereum: [
    'https://ethereum-rpc.publicnode.com',
    'https://eth.drpc.org',
    'https://ethereum.publicnode.com',
    'https://endpoints.omniatech.io/v1/eth/mainnet/public',
    'https://1rpc.io/eth',
  ],
  arbitrum: [
    'https://arb1.arbitrum.io/rpc',
    'https://arbitrum.drpc.org',
    'https://arbitrum-one.public.blastapi.io',
    'https://arbitrum.meowrpc.com',
    'https://arbitrum.public.blockpi.network/v1/rpc/public',
  ],
  optimism: [
    'https://optimism.public.blockpi.network/v1/rpc/public',
    'https://api.zan.top/opt-mainnet',
    'https://optimism-public.nodies.app',
    'https://optimism-rpc.publicnode.com',
    'https://1rpc.io/op',
  ],
  base: [
    'https://1rpc.io/base',
    'https://mainnet.base.org',
    'https://developer-access-mainnet.base.org',
    'https://base-public.nodies.app',
    'https://base.public.blockpi.network/v1/rpc/public',
  ],
  polygon: [
    'https://1rpc.io/matic',
    'https://polygon.drpc.org',
    'https://polygon-public.nodies.app',
    'https://api.zan.top/polygon-mainnet',
    'https://polygon-bor-rpc.publicnode.com',
  ],
};

// Chain ID to network name mapping
const CHAIN_ID_TO_NETWORK: { [key: string]: string } = {
  '1': 'ethereum',
  '42161': 'arbitrum',
  '10': 'optimism',
  '8453': 'base',
  '137': 'polygon',
};

// Network name aliases
const NETWORK_ALIASES: { [key: string]: string } = {
  eth: 'ethereum',
  arb: 'arbitrum',
  op: 'optimism',
  poly: 'polygon',
  matic: 'polygon',
};

type NetworkName = keyof typeof RPC_ENDPOINTS;

// Chain ID metadata
const CHAIN_ID_METADATA: { [key in NetworkName]: number } = {
  ethereum: 1,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  polygon: 137,
};

// Network aliases metadata
const NETWORK_ALIASES_MAP: { [key in NetworkName]: string[] } = {
  ethereum: ['eth'],
  arbitrum: ['arb'],
  optimism: ['op'],
  base: [],
  polygon: ['poly', 'matic'],
};

const SERVER_START_TIME = Date.now();

function formatUptime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function getUptime(): string {
  return formatUptime(Date.now() - SERVER_START_TIME);
}

function renderHelpPage(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meta RPC Server</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 900px;
      width: 100%;
      padding: 40px;
    }
    
    h1 {
      color: #667eea;
      margin-bottom: 10px;
      font-size: 2.5em;
    }
    
    .subtitle {
      color: #666;
      margin-bottom: 30px;
      font-size: 1.1em;
    }
    
    h2 {
      color: #333;
      margin-top: 30px;
      margin-bottom: 15px;
      font-size: 1.5em;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
    }
    
    .network-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    
    .network-badge {
      background: #f5f5f5;
      border: 2px solid #667eea;
      border-radius: 8px;
      padding: 15px;
      text-align: center;
      cursor: default;
      transition: all 0.3s ease;
    }
    
    .network-badge:hover {
      background: #667eea;
      color: white;
      transform: translateY(-2px);
    }
    
    .network-name {
      font-weight: bold;
      margin-bottom: 5px;
      font-size: 1.1em;
    }
    
    .chain-id {
      font-size: 0.9em;
      opacity: 0.7;
    }
    
    .code-block {
      background: #f5f5f5;
      border-left: 4px solid #667eea;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
      overflow-x: auto;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.95em;
      line-height: 1.5;
    }
    
    .endpoint-list {
      background: #f9f9f9;
      border-radius: 8px;
      padding: 20px;
      margin: 15px 0;
    }
    
    .endpoint-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #eee;
      align-items: center;
    }
    
    .endpoint-item:last-child {
      border-bottom: none;
    }
    
    .endpoint-name {
      font-weight: 500;
      color: #333;
    }
    
    .endpoint-count {
      background: #667eea;
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.9em;
    }
    
    ul {
      margin-left: 20px;
      margin-top: 10px;
      line-height: 1.8;
    }
    
    li {
      margin: 5px 0;
      color: #555;
    }
    
    .highlight {
      background: #fff3cd;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: monospace;
      font-weight: 500;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      color: #999;
      font-size: 0.9em;
    }
    
    .status {
      display: inline-block;
      width: 10px;
      height: 10px;
      background: #4caf50;
      border-radius: 50%;
      margin-right: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Meta RPC Server</h1>
    <p class="subtitle">Random load-balanced JSON-RPC proxy for Ethereum and major L2s</p>
    
    <h2>📡 Supported Networks</h2>
    <div class="network-grid">
      <div class="network-badge">
        <div class="network-name">Ethereum</div>
        <div class="chain-id">Chain: 1</div>
        <div class="chain-id">5 endpoints</div>
      </div>
      <div class="network-badge">
        <div class="network-name">Arbitrum</div>
        <div class="chain-id">Chain: 42161</div>
        <div class="chain-id">5 endpoints</div>
      </div>
      <div class="network-badge">
        <div class="network-name">Optimism</div>
        <div class="chain-id">Chain: 10</div>
        <div class="chain-id">5 endpoints</div>
      </div>
      <div class="network-badge">
        <div class="network-name">Base</div>
        <div class="chain-id">Chain: 8453</div>
        <div class="chain-id">5 endpoints</div>
      </div>
      <div class="network-badge">
        <div class="network-name">Polygon</div>
        <div class="chain-id">Chain: 137</div>
        <div class="chain-id">5 endpoints</div>
      </div>
    </div>
    
    <h2>🔗 How to Use</h2>
    <p>Route requests by <span class="highlight">network name</span>, <span class="highlight">chain ID</span>, or <span class="highlight">alias</span>:</p>
    
    <div class="endpoint-list">
      <div class="endpoint-item">
        <span class="endpoint-name">By Network Name</span>
        <code class="highlight">POST /ethereum</code>
      </div>
      <div class="endpoint-item">
        <span class="endpoint-name">By Chain ID</span>
        <code class="highlight">POST /1</code>
      </div>
      <div class="endpoint-item">
        <span class="endpoint-name">By Alias</span>
        <code class="highlight">POST /eth</code>
      </div>
    </div>
    
    <h2>📝 Example Request</h2>
    <div class="code-block">
curl -X POST http://localhost:3000/ethereum \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_blockNumber",
    "params": [],
    "id": 1
  }'
    </div>
    
    <h2>✨ Features</h2>
    <ul>
      <li><span class="status"></span><strong>Random Load Balancing:</strong> Each request randomly selects from the fastest 5 endpoints</li>
      <li><span class="status"></span><strong>Transparent Proxying:</strong> Forwards JSON-RPC calls directly to selected endpoint</li>
      <li><span class="status"></span><strong>Multiple Routing Methods:</strong> Use network names, chain IDs, or aliases</li>
      <li><span class="status"></span><strong>Error Handling:</strong> Proper JSON-RPC error responses</li>
      <li><span class="status"></span><strong>High Availability:</strong> Distributes load across multiple public endpoints</li>
    </ul>
    
    <h2>📚 Available Aliases</h2>
    <div class="endpoint-list">
      <div class="endpoint-item">
        <span class="endpoint-name"><code class="highlight">eth</code></span>
        <span>→ Ethereum</span>
      </div>
      <div class="endpoint-item">
        <span class="endpoint-name"><code class="highlight">arb</code></span>
        <span>→ Arbitrum</span>
      </div>
      <div class="endpoint-item">
        <span class="endpoint-name"><code class="highlight">op</code></span>
        <span>→ Optimism</span>
      </div>
      <div class="endpoint-item">
        <span class="endpoint-name"><code class="highlight">poly</code></span>
        <span>→ Polygon</span>
      </div>
      <div class="endpoint-item">
        <span class="endpoint-name"><code class="highlight">matic</code></span>
        <span>→ Polygon</span>
      </div>
    </div>
    
     <div class="footer">
       <p><strong>Note:</strong> All endpoints are tested free public RPC providers. Response times vary based on network conditions and geographic location.</p>
       <p style="margin-top: 10px;"><strong>API:</strong> Get server info at <code class="highlight">GET /info</code> or health status at <code class="highlight">GET /health</code></p>
     </div>
  </div>
</body>
</html>
  `.trim();
}

function buildInfoResponse(): object {
  const networks: { [key in NetworkName]: object } = {
    ethereum: {
      chainId: CHAIN_ID_METADATA.ethereum,
      endpointCount: RPC_ENDPOINTS.ethereum.length,
      aliases: NETWORK_ALIASES_MAP.ethereum,
    },
    arbitrum: {
      chainId: CHAIN_ID_METADATA.arbitrum,
      endpointCount: RPC_ENDPOINTS.arbitrum.length,
      aliases: NETWORK_ALIASES_MAP.arbitrum,
    },
    optimism: {
      chainId: CHAIN_ID_METADATA.optimism,
      endpointCount: RPC_ENDPOINTS.optimism.length,
      aliases: NETWORK_ALIASES_MAP.optimism,
    },
    base: {
      chainId: CHAIN_ID_METADATA.base,
      endpointCount: RPC_ENDPOINTS.base.length,
      aliases: NETWORK_ALIASES_MAP.base,
    },
    polygon: {
      chainId: CHAIN_ID_METADATA.polygon,
      endpointCount: RPC_ENDPOINTS.polygon.length,
      aliases: NETWORK_ALIASES_MAP.polygon,
    },
  };

  const totalEndpoints = Object.values(RPC_ENDPOINTS).reduce((sum, endpoints) => sum + endpoints.length, 0);

  return {
    name: 'Meta RPC Server',
    version: '1.0.0',
    description: 'Random load-balanced JSON-RPC proxy for Ethereum and major L2s',
    uptime: getUptime(),
    networks: networks,
    totalEndpoints: totalEndpoints,
    usage: {
      description: 'Route RPC calls by network name, chain ID, or alias',
      rpcEndpoints: [
        'POST /ethereum',
        'POST /1',
        'POST /eth',
        'POST /arbitrum',
        'POST /42161',
        'POST /arb',
      ],
    },
  };
}

function getNetworkName(input: string): NetworkName | null {
  const lower = input.toLowerCase();

  // Check direct network name
  if (lower in RPC_ENDPOINTS) {
    return lower as NetworkName;
  }

  // Check aliases
  if (lower in NETWORK_ALIASES) {
    return NETWORK_ALIASES[lower] as NetworkName;
  }

  // Check chain ID mapping
  if (lower in CHAIN_ID_TO_NETWORK) {
    return CHAIN_ID_TO_NETWORK[lower] as NetworkName;
  }

  return null;
}

function getRandomEndpoint(network: NetworkName): string {
  const endpoints = RPC_ENDPOINTS[network];
  return endpoints[Math.floor(Math.random() * endpoints.length)];
}

function proxyRequest(
  targetUrl: string,
  method: string,
  body: string,
): Promise<{ status: number; data: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'Meta-RPC-Server/1.0',
      },
      timeout: 10000,
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 200,
          data: data,
          headers: {
            'Content-Type': res.headers['content-type'] || 'application/json',
          },
        });
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Proxy request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Proxy request timeout'));
    });

    req.write(body);
    req.end();
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Handle GET / for help page
  if (req.method === 'GET' && (req.url === '/' || req.url === '')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderHelpPage());
    return;
  }

  // Handle GET /info for JSON API
  if (req.method === 'GET' && req.url === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(buildInfoResponse(), null, 2));
    return;
  }

  // Handle GET /health for health checks
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: getUptime() }));
    return;
  }

  // Only allow POST requests for RPC calls
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Method not allowed. Only POST is supported for RPC calls. Use GET / for help or GET /info for server info.',
      }),
    );
    return;
  }

  // Parse the path
  const path = req.url || '/';
  const pathSegments = path.split('/').filter(Boolean);

  if (pathSegments.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Missing network identifier. Usage: /<network-name> or /<chain-id>',
        examples: ['POST /ethereum', 'POST /1', 'POST /arbitrum', 'POST /42161'],
      }),
    );
    return;
  }

  const networkInput = pathSegments[0];
  const networkName = getNetworkName(networkInput);

  if (!networkName) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: `Unknown network: ${networkInput}`,
        supportedNetworks: Object.keys(RPC_ENDPOINTS),
        supportedChainIds: Object.keys(CHAIN_ID_TO_NETWORK),
        aliases: NETWORK_ALIASES,
      }),
    );
    return;
  }

  // Read request body with size limit (1MB)
  const MAX_BODY_SIZE = 1024 * 1024; // 1MB
  let body = '';
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error(`Request body exceeds maximum size of ${MAX_BODY_SIZE} bytes`));
      }
    });
    req.on('end', () => resolve());
    req.on('error', reject);
  });

  // Validate JSON-RPC format
  let rpcRequest: any;
  try {
    rpcRequest = JSON.parse(body);
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error',
        },
        id: null,
      }),
    );
    return;
  }

  // Select random endpoint
  const selectedEndpoint = getRandomEndpoint(networkName);

  // Proxy the request
  try {
    const proxyResponse = await proxyRequest(
      selectedEndpoint,
      'POST',
      body,
    );

    res.writeHead(proxyResponse.status, proxyResponse.headers);
    res.end(proxyResponse.data);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: errorMessage,
        },
        id: rpcRequest?.id || null,
      }),
    );
  }
}

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error('Unhandled error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Meta RPC Server running on port ${PORT}`);
  console.log(`\nSupported networks:`);
  Object.entries(RPC_ENDPOINTS).forEach(([name, endpoints]) => {
    console.log(`  ${name}: ${endpoints.length} endpoints`);
  });
  console.log(`\nUsage examples:`);
  console.log(`  POST /ethereum`);
  console.log(`  POST /1`);
  console.log(`  POST /arbitrum`);
  console.log(`  POST /42161`);
   console.log(`\nAPI endpoints:`);
   console.log(`  GET / - HTML help page`);
   console.log(`  GET /info - JSON server info`);
   console.log(`  GET /health - Health check`);
   console.log(`\nWith request body (standard JSON-RPC):`);
   console.log(`  { "jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1 }`);
});

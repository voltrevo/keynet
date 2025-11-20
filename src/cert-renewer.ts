#!/usr/bin/env node
/**
 * Certificate renewal daemon - periodically checks and renews certificate before expiry
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { createPublicKey, createPrivateKey } from 'crypto';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = MS_PER_DAY; // Check every 24 hours
const RENEW_THRESHOLD_DAYS = 30; // Renew if less than 30 days until expiry

interface RenewerConfig {
  certKeyPath: string;
  certCrtPath: string;
  keynetAddress: string;
}

/**
 * Parse X.509 certificate and get expiry date
 */
function getCertificateExpiry(certPath: string): Date | null {
  try {
    const certPem = readFileSync(certPath, 'utf-8');
    const cert = createPublicKey({
      key: certPem,
      format: 'pem',
      type: 'spki'
    });
    
    // Use openssl command to get expiry since Node crypto doesn't expose it directly
    const output = execSync(`openssl x509 -in "${certPath}" -noout -enddate`, {
      encoding: 'utf-8'
    });
    
    // Parse "notAfter=Nov 20 12:34:56 2026 GMT"
    const match = output.match(/notAfter=(.+)/);
    if (match) {
      return new Date(match[1]);
    }
    return null;
  } catch (error) {
    console.error('[cert-renewer] Error reading certificate:', error);
    return null;
  }
}

/**
 * Check if certificate needs renewal
 */
function needsRenewal(certPath: string, thresholdDays: number): boolean {
  if (!existsSync(certPath)) {
    console.error('[cert-renewer] Certificate not found:', certPath);
    return true;
  }

  const expiry = getCertificateExpiry(certPath);
  if (!expiry) {
    return true;
  }

  const now = Date.now();
  const expiryTime = expiry.getTime();
  const daysUntilExpiry = (expiryTime - now) / MS_PER_DAY;

  console.error(`[cert-renewer] Certificate expires in ${daysUntilExpiry.toFixed(1)} days`);
  
  return daysUntilExpiry < thresholdDays;
}

/**
 * Regenerate certificate
 */
function regenerateCertificate(config: RenewerConfig): boolean {
  try {
    console.error('[cert-renewer] Regenerating certificate...');
    
    execSync(
      `openssl req -new -x509 -key "${config.certKeyPath}" -out "${config.certCrtPath}" ` +
      `-days 365 -subj "/CN=${config.keynetAddress}.keynet"`,
      { encoding: 'utf-8' }
    );
    
    console.error('[cert-renewer] Certificate regenerated successfully');
    return true;
  } catch (error) {
    console.error('[cert-renewer] Error regenerating certificate:', error);
    return false;
  }
}

/**
 * Reload Caddy server to pick up new certificate
 */
function reloadCaddy(): void {
  try {
    // Check if caddy command exists
    execSync('command -v caddy', { encoding: 'utf-8', stdio: 'ignore' });
    
    console.error('[cert-renewer] Reloading Caddy...');
    execSync('caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile', {
      encoding: 'utf-8',
      stdio: 'ignore'
    });
    
    console.error('[cert-renewer] Caddy reloaded successfully');
  } catch (error) {
    // Caddy not available or reload failed - not critical
    console.error('[cert-renewer] Could not reload Caddy (may not be running)');
  }
}

/**
 * Main renewal check loop
 */
async function renewalLoop(config: RenewerConfig): Promise<void> {
  console.error('[cert-renewer] Starting certificate renewal daemon');
  console.error(`[cert-renewer] Checking every ${CHECK_INTERVAL_MS / MS_PER_DAY} days`);
  console.error(`[cert-renewer] Renewing if less than ${RENEW_THRESHOLD_DAYS} days until expiry`);
  
  while (true) {
    try {
      if (needsRenewal(config.certCrtPath, RENEW_THRESHOLD_DAYS)) {
        console.error('[cert-renewer] Certificate needs renewal');
        
        if (regenerateCertificate(config)) {
          reloadCaddy();
        }
      } else {
        console.error('[cert-renewer] Certificate is still valid');
      }
    } catch (error) {
      console.error('[cert-renewer] Error in renewal check:', error);
    }
    
    // Sleep for CHECK_INTERVAL_MS
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: cert-renewer <cert-key-path> <cert-crt-path> <keynet-address>');
    console.error('Example: cert-renewer /etc/keynet/ed25519-key.pem /etc/keynet/ed25519-cert.pem klefuj...');
    process.exit(1);
  }
  
  const [certKeyPath, certCrtPath, keynetAddress] = args;
  
  const config: RenewerConfig = {
    certKeyPath,
    certCrtPath,
    keynetAddress
  };
  
  // Validate paths exist
  if (!existsSync(certKeyPath)) {
    console.error(`[cert-renewer] ERROR: Private key not found: ${certKeyPath}`);
    process.exit(1);
  }
  
  renewalLoop(config).catch(error => {
    console.error('[cert-renewer] Fatal error:', error);
    process.exit(1);
  });
}

export { renewalLoop, needsRenewal, regenerateCertificate };

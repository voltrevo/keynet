#!/usr/bin/env node
/**
 * Export Ed25519 private key from Tor keystore to PEM format
 * 
 * Usage: export-ed25519-pem <tor-keys-dir> <output-pem-path>
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { readTorSecretKey } from './util.js';

function writePemPrivateKey(path: string, privateKey: Uint8Array): void {
  // PKCS#8 format for Ed25519
  const pkcs8Header = Buffer.from([
    0x30, 0x2e, // SEQUENCE, 46 bytes
    0x02, 0x01, 0x00, // INTEGER 0 (version)
    0x30, 0x05, // SEQUENCE, 5 bytes (algorithm)
    0x06, 0x03, 0x2b, 0x65, 0x70, // OID 1.3.101.112 (Ed25519)
    0x04, 0x22, // OCTET STRING, 34 bytes
    0x04, 0x20, // OCTET STRING, 32 bytes (private key)
  ]);
  
  const derData = Buffer.concat([pkcs8Header, Buffer.from(privateKey)]);
  const base64 = derData.toString('base64').match(/.{1,64}/g)?.join('\n') || '';
  const pem = `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----\n`;
  
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pem, { mode: 0o600 });
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: export-ed25519-pem <tor-keys-dir> <output-pem-path>');
    process.exit(1);
  }
  
  const [torKeysDir, pemKeyPath] = args;
  
  try {
    const secretKeyPath = `${torKeysDir}/ed25519_master_id_secret_key`;
    const privateKey = readTorSecretKey(secretKeyPath);
    
    writePemPrivateKey(pemKeyPath, privateKey);
    
    console.error(`[keynet] Ed25519 private key exported to ${pemKeyPath}`);
  } catch (error) {
    console.error('[keynet] ERROR:', error);
    process.exit(1);
  }
}

#!/usr/bin/env node
/**
 * CLI tool to generate Tor Ed25519 key pairs
 * 
 * Usage:
 *   test-generateTorKeyPair.ts <tor-keys-dir>
 * 
 * Generates new ed25519_master_id_secret_key and ed25519_master_id_public_key
 * in the specified directory using the Tor format.
 */

import { existsSync } from 'fs';
import {
  generateKeyPair,
  writeTorPublicKey,
  writeTorSecretKey,
  checkTorKeyPair
} from './src/util.js';

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: test-generateTorKeyPair <tor-keys-dir> [--force]');
    console.error('');
    console.error('Example:');
    console.error('  test-generateTorKeyPair ./test-keys');
    console.error('');
    console.error('Options:');
    console.error('  --force    Overwrite existing keys');
    process.exit(1);
  }
  
  const torKeysDir = args[0];
  const forceOverwrite = args.includes('--force');
  const secretKeyPath = `${torKeysDir}/ed25519_master_id_secret_key`;
  const publicKeyPath = `${torKeysDir}/ed25519_master_id_public_key`;
  
  // Check if files already exist
  if (!forceOverwrite && (existsSync(secretKeyPath) || existsSync(publicKeyPath))) {
    console.error('[test-generateTorKeyPair] ERROR: Keys already exist. Use --force to overwrite.');
    console.error(`[test-generateTorKeyPair] Secret key: ${secretKeyPath}`);
    console.error(`[test-generateTorKeyPair] Public key: ${publicKeyPath}`);
    process.exit(1);
  }
  
  try {
    console.error(`[test-generateTorKeyPair] Generating new Ed25519 keypair...`);
    
    // Generate new key pair
    const { privateKey, publicKey } = generateKeyPair();
    
    console.error(`[test-generateTorKeyPair] Private key (hex): ${Buffer.from(privateKey).toString('hex')}`);
    console.error(`[test-generateTorKeyPair] Public key (hex):  ${Buffer.from(publicKey).toString('hex')}`);
    console.error('');
    
    // Write keys in Tor format
    console.error(`[test-generateTorKeyPair] Writing keys to: ${torKeysDir}`);
    writeTorPublicKey(publicKeyPath, publicKey);
    writeTorSecretKey(secretKeyPath, privateKey, publicKey);
    
    console.error(`[test-generateTorKeyPair] Secret key: ${secretKeyPath}`);
    console.error(`[test-generateTorKeyPair] Public key: ${publicKeyPath}`);
    console.error('');
    
    // Verify the written keys
    console.error(`[test-generateTorKeyPair] Verifying key pair...`);
    const isValid = checkTorKeyPair(privateKey, publicKey);
    
    if (isValid) {
      console.error('[test-generateTorKeyPair] ✓ Key pair generation successful');
      console.log('SUCCESS');
      process.exit(0);
    } else {
      console.error('[test-generateTorKeyPair] ✗ Key pair validation failed');
      console.log('FAILED');
      process.exit(1);
    }
  } catch (error) {
    console.error('[test-generateTorKeyPair] ERROR:', error);
    process.exit(1);
  }
}

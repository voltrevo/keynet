#!/usr/bin/env node
/**
 * CLI tool to test checkTorKeyPair function
 * 
 * Usage:
 *   test-checkTorKeyPair.ts <tor-keys-dir>
 * 
 * Reads ed25519_master_id_secret_key and ed25519_master_id_public_key
 * from the specified directory and validates that they form a valid key pair.
 */

import { existsSync } from 'fs';
import {
  readTorSecretKey,
  readTorPublicKey,
  checkTorKeyPair
} from './src/util.js';

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: test-checkTorKeyPair <tor-keys-dir>');
    console.error('');
    console.error('Example:');
    console.error('  test-checkTorKeyPair /var/lib/tor/keys');
    process.exit(1);
  }
  
  const torKeysDir = args[0];
  const secretKeyPath = `${torKeysDir}/ed25519_master_id_secret_key`;
  const publicKeyPath = `${torKeysDir}/ed25519_master_id_public_key`;
  
  // Check if files exist
  if (!existsSync(secretKeyPath)) {
    console.error(`[test-checkTorKeyPair] Secret key not found: ${secretKeyPath}`);
    process.exit(1);
  }
  
  if (!existsSync(publicKeyPath)) {
    console.error(`[test-checkTorKeyPair] Public key not found: ${publicKeyPath}`);
    process.exit(1);
  }
  
  try {
    console.error(`[test-checkTorKeyPair] Reading keys from: ${torKeysDir}`);
    console.error(`[test-checkTorKeyPair] Secret key: ${secretKeyPath}`);
    console.error(`[test-checkTorKeyPair] Public key: ${publicKeyPath}`);
    console.error('');
    
    // Read the keys
    const privateKey = readTorSecretKey(secretKeyPath);
    const publicKey = readTorPublicKey(publicKeyPath);
    
    console.error(`[test-checkTorKeyPair] Private key (hex): ${Buffer.from(privateKey).toString('hex')}`);
    console.error(`[test-checkTorKeyPair] Public key (hex):  ${Buffer.from(publicKey).toString('hex')}`);
    console.error('');
    
    // Check if they're a valid pair
    const isValid = checkTorKeyPair(privateKey, publicKey);
    
    if (isValid) {
      console.log('VALID');
      process.exit(0);
    } else {
      console.log('INVALID');
      process.exit(1);
    }
  } catch (error) {
    console.error('[test-checkTorKeyPair] ERROR:', error);
    process.exit(1);
  }
}

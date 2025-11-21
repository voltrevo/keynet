#!/usr/bin/env node
/**
 * Tests for keynet-setup functions
 */

import { generateMatchingRsaKey, calculateRsaFingerprint, extractRsaPublicKeyDer } from './keynet-setup.js';

function testGenerateMatchingRsaKey() {
  console.log('\n=== Testing generateMatchingRsaKey ===\n');
  
  // Create a target with known first byte
  const targetBytes = new Uint8Array([0xAB, 0xCD, 0x12, 0x34, 0x56, 0x78]);
  console.log(`Target byte (first): ${Buffer.from(targetBytes.slice(0, 1)).toString('hex').toUpperCase()}`);
  
  console.log('\nGenerating matching RSA key (this may take a few seconds)...');
  const result = generateMatchingRsaKey(targetBytes);
  
  console.log(`\nAttempts required: ${result.attempts}`);
  console.log(`RSA fingerprint: ${result.fingerprint.toString('hex').toUpperCase()}`);
  
  // Verify the match
  const match = result.fingerprint[0] === targetBytes[0];
  console.log(`\nFirst byte matches: ${match ? 'YES' : 'NO'}`);
  
  if (!match) {
    console.error('ERROR: Fingerprint does not match target!');
    process.exit(1);
  }
  
  // Verify we can re-extract and calculate fingerprint
  const publicKeyDer = extractRsaPublicKeyDer(result.publicKey);
  const recalculatedFingerprint = calculateRsaFingerprint(publicKeyDer);
  
  const fingerprintsMatch = result.fingerprint.equals(recalculatedFingerprint);
  console.log(`Recalculated fingerprint matches: ${fingerprintsMatch ? 'YES' : 'NO'}`);
  
  if (!fingerprintsMatch) {
    console.error('ERROR: Recalculated fingerprint does not match!');
    process.exit(1);
  }
  
  // Verify the private and public keys are valid PEM format
  const hasPrivateKeyHeaders = result.privateKey.includes('-----BEGIN RSA PRIVATE KEY-----') &&
                                 result.privateKey.includes('-----END RSA PRIVATE KEY-----');
  const hasPublicKeyHeaders = result.publicKey.includes('-----BEGIN RSA PUBLIC KEY-----') &&
                               result.publicKey.includes('-----END RSA PUBLIC KEY-----');
  
  console.log(`Private key has valid PEM format: ${hasPrivateKeyHeaders ? 'YES' : 'NO'}`);
  console.log(`Public key has valid PEM format: ${hasPublicKeyHeaders ? 'YES' : 'NO'}`);
  
  if (!hasPrivateKeyHeaders || !hasPublicKeyHeaders) {
    console.error('ERROR: Keys do not have valid PEM format!');
    process.exit(1);
  }
  
  console.log('\nAll tests passed!');
}

function testMultipleTargets() {
  console.log('\n=== Testing with multiple target prefixes ===\n');
  console.log('Note: Each test should take only a few seconds\n');
  
  const targets = [
    new Uint8Array([0x00, 0x01]),
    new Uint8Array([0x10, 0x20]),
    new Uint8Array([0xFF, 0xEE]),
  ];
  
  for (const target of targets) {
    const prefix = Buffer.from(target.slice(0, 1)).toString('hex').toUpperCase();
    console.log(`\nTesting prefix: ${prefix}`);
    
    const result = generateMatchingRsaKey(target);
    const match = result.fingerprint[0] === target[0];
    
    console.log(`  Attempts: ${result.attempts}`);
    console.log(`  Fingerprint: ${result.fingerprint.toString('hex').toUpperCase()}`);
    console.log(`  Match: ${match ? 'YES' : 'NO'}`);
    
    if (!match) {
      console.error(`ERROR: Failed to match prefix ${prefix}`);
      process.exit(1);
    }
  }
  
  console.log('\nAll prefix tests passed!');
}

// Run tests
try {
  testGenerateMatchingRsaKey();
  testMultipleTargets();
  
  console.log('\nAll tests completed successfully!\n');
} catch (error) {
  console.error('\nTest failed:', error);
  process.exit(1);
}

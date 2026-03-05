// dayly/lib/security.ts

/**
 * Creates a simple SHA-256 hash of a string using the Web Crypto API.
 * This is used to store the PIN and Security Answer securely in localStorage,
 * preventing plain-text exposure if another script accesses localStorage.
 */
export async function hashString(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

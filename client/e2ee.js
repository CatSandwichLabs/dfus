// E2EE Engine for DFUS (AES-256-GCM)
const E2EE = {
  key: null,
  
  async generateKey() {
    this.key = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const exported = await window.crypto.subtle.exportKey("raw", this.key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  },
  
  async importKey(base64Key) {
    const binary = atob(base64Key);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    this.key = await window.crypto.subtle.importKey(
      "raw",
      bytes,
      "AES-GCM",
      true,
      ["encrypt", "decrypt"]
    );
  },
  
  async encryptChunk(arrayBuffer) {
    if (!this.key) throw new Error("E2EE key not initialized");
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      this.key,
      arrayBuffer
    );
    // Prepend IV to the encrypted chunk
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.length);
    return result.buffer;
  },
  
  async decryptChunk(arrayBuffer) {
    if (!this.key) throw new Error("E2EE key not initialized");
    const data = new Uint8Array(arrayBuffer);
    const iv = data.slice(0, 12);
    const encrypted = data.slice(12);
    return await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      this.key,
      encrypted
    );
  }
};

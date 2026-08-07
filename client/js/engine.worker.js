// engine.worker.js

const CHUNK_SIZE_5MB = 5 * 1024 * 1024;
const CHUNK_SIZE_2MB = 2 * 1024 * 1024;
const CHUNK_SIZE_10MB = 10 * 1024 * 1024;

function getChunkSize(fileSize) {
  const MB = 1024 * 1024;
  if (fileSize < 50 * MB) return CHUNK_SIZE_2MB;
  if (fileSize <= 1024 * MB) return CHUNK_SIZE_5MB;
  return CHUNK_SIZE_10MB;
}

async function bufferToHex(buffer) {
  const hashArray = Array.from(new Uint8Array(buffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashChunk(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return bufferToHex(hashBuffer);
}

self.onmessage = async (e) => {
  const { type, file } = e.data;

  if (type === 'PROCESS_FILE') {
    try {
      const fileSize = file.size;
      const chunkSize = getChunkSize(fileSize);
      const totalChunks = Math.ceil(fileSize / chunkSize);
      
      const chunks = [];
      const chunkHashes = [];

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const chunkBlob = file.slice(start, end);
        
        const hash = await hashChunk(chunkBlob);
        
        chunks.push({
          index: i,
          blob: chunkBlob,
          hash: hash,
          size: chunkBlob.size
        });
        
        chunkHashes.push(hash);

        // Report progress back
        self.postMessage({
          type: 'PROGRESS',
          progress: Math.round(((i + 1) / totalChunks) * 100)
        });
      }

      // Calculate Merkle Root (or just overall file hash for simplicity)
      // Since we just need an overall hash to verify the full file, we hash the concatenation of chunk hashes
      const encoder = new TextEncoder();
      const combinedHashes = chunkHashes.join('');
      const combinedBuffer = encoder.encode(combinedHashes);
      const fileHashBuffer = await crypto.subtle.digest('SHA-256', combinedBuffer);
      const fileHash = await bufferToHex(fileHashBuffer);

      self.postMessage({
        type: 'COMPLETE',
        fileSize,
        chunkSize,
        totalChunks,
        chunks,
        chunkHashes,
        merkleRoot: fileHash
      });
    } catch (error) {
      self.postMessage({ type: 'ERROR', error: error.message });
    }
  }
};

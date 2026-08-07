// dfus-client.js

class DFUSClient {
  constructor(masterUrl = 'http://localhost:3000') {
    this.masterUrl = masterUrl;
    this.accessToken = null;
  }

  setToken(token) {
    this.accessToken = token;
  }

  async _request(endpoint, options = {}) {
    const headers = {
      ...options.headers,
    };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    if (!(options.body instanceof FormData) && options.body) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const response = await fetch(`${this.masterUrl}/api/v1${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP Error ${response.status}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  async uploadFile(file, onProgress) {
    return new Promise((resolve, reject) => {
      const worker = new Worker('/js/engine.worker.js');
      
      worker.onmessage = async (e) => {
        const data = e.data;
        if (data.type === 'ERROR') {
          reject(new Error(data.error));
          worker.terminate();
        } else if (data.type === 'PROGRESS') {
          if (onProgress) onProgress('hashing', data.progress);
        } else if (data.type === 'COMPLETE') {
          try {
            await this._executeUpload(data, onProgress);
            resolve();
          } catch (err) {
            reject(err);
          } finally {
            worker.terminate();
          }
        }
      };

      worker.postMessage({ type: 'PROCESS_FILE', file });
    });
  }

  async _executeUpload(fileData, onProgress) {
    const { chunks, chunkHashes, fileSize, merkleRoot } = fileData;
    const fileName = chunks[0].blob.name || 'uploaded_file';
    
    // 1. Init Upload Session
    const initRes = await this._request('/uploads/init', {
      method: 'POST',
      body: {
        fileName,
        fileSize,
        mimeType: chunks[0].blob.type,
        chunkHashes
      }
    });

    const { sessionId, assignments, dedupedChunks, totalChunks } = initRes;

    let uploadedCount = dedupedChunks.length;
    
    if (onProgress) onProgress('uploading', Math.round((uploadedCount / totalChunks) * 100));

    // 2. Upload chunks in parallel with concurrency limit (e.g. 4)
    const MAX_CONCURRENCY = 4;
    let assignmentIndex = 0;

    const uploadWorkerChunk = async (assignment) => {
      const { chunkIndex, chunkHash, workerUrl, token } = assignment;
      const chunkData = chunks[chunkIndex].blob;
      
      // Retry logic
      let attempt = 0;
      while (attempt < 3) {
        try {
          const response = await fetch(`${workerUrl}/${chunkHash}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/octet-stream'
            },
            body: chunkData
          });
          
          if (!response.ok) throw new Error('Worker upload failed');
          return;
        } catch (err) {
          attempt++;
          if (attempt >= 3) throw err;
          await new Promise(r => setTimeout(r, 1000 * attempt)); // exponential backoff
        }
      }
    };

    const workerTasks = [];
    const runTask = async () => {
      while (assignmentIndex < assignments.length) {
        const assignment = assignments[assignmentIndex++];
        await uploadWorkerChunk(assignment);
        uploadedCount++;
        if (onProgress) onProgress('uploading', Math.round((uploadedCount / totalChunks) * 100));
      }
    };

    for (let i = 0; i < MAX_CONCURRENCY; i++) {
      workerTasks.push(runTask());
    }

    await Promise.all(workerTasks);

    // 3. Finalize Upload
    await this._request(`/uploads/${sessionId}/finalize`, {
      method: 'POST',
      body: { merkleRoot }
    });
  }

  async downloadFile(fileId, fileName, onProgress) {
    // 1. Get Manifest
    const manifest = await this._request(`/files/${fileId}/manifest`);
    
    const { chunks, fileSize } = manifest;
    
    let downloadedCount = 0;
    const downloadedBlobs = new Array(chunks.length);

    // 2. Download chunks in parallel
    const MAX_CONCURRENCY = 4;
    let chunkIndex = 0;

    const downloadChunk = async (chunkDesc) => {
      let attempt = 0;
      while (attempt < 3) {
        try {
          const response = await fetch(chunkDesc.url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${chunkDesc.token}`
            }
          });
          
          if (!response.ok) throw new Error('Worker download failed');
          const blob = await response.blob();
          downloadedBlobs[chunkDesc.index] = blob;
          return;
        } catch (err) {
          attempt++;
          if (attempt >= 3) throw err;
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    };

    const workerTasks = [];
    const runTask = async () => {
      while (chunkIndex < chunks.length) {
        const chunk = chunks[chunkIndex++];
        await downloadChunk(chunk);
        downloadedCount++;
        if (onProgress) onProgress('downloading', Math.round((downloadedCount / chunks.length) * 100));
      }
    };

    for (let i = 0; i < MAX_CONCURRENCY; i++) {
      workerTasks.push(runTask());
    }

    await Promise.all(workerTasks);

    // 3. Assemble and trigger browser download
    const finalBlob = new Blob(downloadedBlobs);
    const downloadUrl = URL.createObjectURL(finalBlob);
    
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName || manifest.fileName || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  }

  // --- Auth & Account wrappers ---
  async login(email, password) {
    const res = await this._request('/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    if (res.accessToken) this.setToken(res.accessToken);
    return res;
  }

  async verify2FA(code, token) {
    const res = await this._request('/auth/2fa/verify', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: { code }
    });
    if (res.accessToken) this.setToken(res.accessToken);
    return res;
  }

  async register(email, password, username) {
    return await this._request('/auth/register', {
      method: 'POST',
      body: { email, password, username }
    });
  }

  async listFiles(parentId = null) {
    const url = parentId ? `/files?parentId=${parentId}` : '/files';
    return await this._request(url);
  }

  async deleteFile(fileId) {
    return await this._request(`/files/${fileId}`, { method: 'DELETE' });
  }
}

// Attach to window if running in browser
if (typeof window !== 'undefined') {
  window.DFUSClient = DFUSClient;
}

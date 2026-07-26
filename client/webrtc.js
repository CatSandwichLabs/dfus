// WebRTC P2P Logic via PeerJS
const WebRTC = {
  peer: null,
  conn: null,
  
  async startHost(file, onProgress, onComplete, onError, onLinkReady) {
    if (typeof Peer === 'undefined') {
      onError(new Error("PeerJS not loaded."));
      return;
    }
    
    this.peer = new Peer(); // Auto-generates ID using PeerJS cloud
    
    this.peer.on('open', (id) => {
      console.log('WebRTC Host ID: ' + id);
      onLinkReady(id);
    });
    
    this.peer.on('connection', (connection) => {
      console.log('Peer connected! Starting transmission...');
      this.conn = connection;
      
      this.conn.on('open', async () => {
        try {
          const CHUNK_SIZE = 256 * 1024; // 256KB for WebRTC stability
          const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
          
          for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const blob = file.slice(start, end);
            const arrayBuffer = await blob.arrayBuffer();
            
            // Send chunk
            this.conn.send({
              type: 'chunk',
              index: i,
              data: arrayBuffer
            });
            
            onProgress(end);
            
            // Wait slightly to prevent buffer overflow
            await new Promise(r => setTimeout(r, 5));
          }
          
          this.conn.send({ type: 'done' });
          onComplete();
        } catch (err) {
          onError(err);
        }
      });
      
      this.conn.on('error', onError);
    });
    
    this.peer.on('error', onError);
  },
  
  async startClient(hostId, fileInfo, writable, onProgress, onComplete, onError) {
    if (typeof Peer === 'undefined') {
      onError(new Error("PeerJS not loaded."));
      return;
    }
    
    this.peer = new Peer();
    
    this.peer.on('open', () => {
      console.log('Connecting to WebRTC host: ' + hostId);
      this.conn = this.peer.connect(hostId, { reliable: true });
      
      this.conn.on('open', () => {
        console.log('Connected to host! Waiting for data...');
      });
      
      this.conn.on('data', async (payload) => {
        if (payload.type === 'chunk') {
          const chunkData = payload.data;
          const CHUNK_SIZE = 256 * 1024;
          const position = payload.index * CHUNK_SIZE;
          
          try {
            await writable.write({ type: 'write', position: position, data: chunkData });
            onProgress(chunkData.byteLength);
          } catch (e) {
            onError(e);
          }
        } else if (payload.type === 'done') {
          console.log('Transmission complete.');
          onComplete();
        }
      });
      
      this.conn.on('error', onError);
    });
    
    this.peer.on('error', onError);
  }
};

// IPFS Web3 Storage Logic
const IPFSStorage = {
  client: null,
  
  init() {
    if (typeof window.IpfsHttpClient === 'undefined') {
      throw new Error("IPFS HTTP Client library not loaded.");
    }
    // Connect to a local IPFS daemon or a public gateway
    // NOTE: Public gateways usually require authentication. We assume a local IPFS desktop node is running.
    this.client = window.IpfsHttpClient.create({ host: '127.0.0.1', port: '5001', protocol: 'http' });
  },
  
  async pinFile(file, onProgress) {
    if (!this.client) this.init();
    
    try {
      const added = await this.client.add(
        { path: file.name, content: file },
        {
          progress: (prog) => onProgress(prog)
        }
      );
      
      const cid = added.cid.toString();
      console.log('Successfully pinned to IPFS! CID:', cid);
      return cid;
    } catch (err) {
      console.error('IPFS Upload Error:', err);
      throw new Error('Failed to pin to IPFS. Ensure IPFS Desktop is running locally on port 5001.');
    }
  }
};

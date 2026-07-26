'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;
const STORAGE_DIR = path.join(__dirname, '../../tmp/nodes', `node_${PORT}`);

// Ensure storage dir exists
fs.mkdirSync(STORAGE_DIR, { recursive: true });

app.use(cors());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

// Upload a chunk
app.post('/chunk/:sessionId/:chunkIndex', express.raw({ type: 'application/octet-stream', limit: '10mb' }), (req, res) => {
  const { sessionId, chunkIndex } = req.params;
  const chunkPath = path.join(STORAGE_DIR, `${sessionId}_${chunkIndex}.part`);
  
  try {
    fs.writeFileSync(chunkPath, req.body);
    res.json({ message: 'Chunk saved to node', nodePort: PORT });
  } catch (err) {
    console.error(`[Node ${PORT}] Error saving chunk:`, err);
    res.status(500).json({ error: 'Failed to save chunk' });
  }
});

// Retrieve a chunk stream
app.get('/chunk/:sessionId/:chunkIndex', (req, res) => {
  const { sessionId, chunkIndex } = req.params;
  const chunkPath = path.join(STORAGE_DIR, `${sessionId}_${chunkIndex}.part`);
  
  if (!fs.existsSync(chunkPath)) {
    return res.status(404).json({ error: 'Chunk not found on this node' });
  }
  
  res.setHeader('Content-Type', 'application/octet-stream');
  const readStream = fs.createReadStream(chunkPath);
  readStream.pipe(res);
});

// Delete a chunk
app.delete('/chunk/:sessionId/:chunkIndex', (req, res) => {
  const { sessionId, chunkIndex } = req.params;
  const chunkPath = path.join(STORAGE_DIR, `${sessionId}_${chunkIndex}.part`);
  
  if (fs.existsSync(chunkPath)) {
    fs.unlinkSync(chunkPath);
  }
  res.json({ message: 'Chunk deleted' });
});

app.listen(PORT, () => {
  console.log(`[STORAGE NODE] Node active on port ${PORT}`);
});

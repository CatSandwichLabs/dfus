import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UploadCloud, File as FileIcon, CheckCircle2, AlertCircle, Loader2, Server } from 'lucide-react';

export default function UploadModal({ isOpen, onClose, token, currentFolderId, onUploadComplete }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, hashing, requesting, uploading, finalizing, complete, error
  const [progress, setProgress] = useState(0);
  const [chunksStatus, setChunksStatus] = useState([]); // array of 'pending', 'uploading', 'done', 'error'
  const [errorMsg, setErrorMsg] = useState('');
  
  const [uploadSpeed, setUploadSpeed] = useState(0); // MB/s
  const [eta, setEta] = useState('');
  const startTimeRef = useRef(null);
  const uploadedBytesRef = useRef(0);

  
  const fileInputRef = useRef(null);
  
  // Clean up when closed
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setFile(null);
        setStatus('idle');
        setProgress(0);
        setChunksStatus([]);
        setErrorMsg('');
        setUploadSpeed(0);
        setEta('');
      }, 300);
    }
  }, [isOpen]);

  const formatEta = (seconds) => {
    if (seconds === Infinity || isNaN(seconds)) return 'Calculating...';
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  const calculateChunkSize = (fileSize) => {
    const MB = 1024 * 1024;
    if (fileSize < 50 * MB) return 2 * MB;
    if (fileSize <= 1024 * MB) return 5 * MB;
    return 10 * MB;
  };

  const computeHash = async (buffer) => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus('idle');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setStatus('idle');
    }
  };

  const startUpload = async () => {
    if (!file) return;
    
    try {
      setStatus('hashing');
      const chunkSize = calculateChunkSize(file.size);
      const totalChunks = Math.ceil(file.size / chunkSize);
      
      setChunksStatus(new Array(totalChunks).fill('pending'));
      
      const chunkHashes = [];
      const chunkBuffers = [];
      
      // Read and hash chunks locally
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const blob = file.slice(start, end);
        
        const arrayBuffer = await blob.arrayBuffer();
        chunkBuffers.push(arrayBuffer);
        
        const hash = await computeHash(arrayBuffer);
        chunkHashes.push(hash);
        
        setProgress(Math.round(((i + 1) / totalChunks) * 20)); // First 20% is hashing
      }

      setStatus('requesting');
      const apiUrl = import.meta.env.VITE_API_URL || '';
      
      // 1. Init Upload Session on Master
      const initRes = await fetch(`${apiUrl}/api/v1/uploads/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          chunkHashes,
          folderId: currentFolderId
        })
      });
      
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || 'Failed to initialize upload');
      
      const { sessionId, assignments, dedupedChunks } = initData;
      
      // Mark deduped chunks as done
      setChunksStatus(prev => {
        const next = [...prev];
        for (const idx of dedupedChunks) {
          next[idx] = 'done';
        }
        return next;
      });

      setStatus('uploading');
      startTimeRef.current = Date.now();
      uploadedBytesRef.current = 0;
      
      // 2. Upload missing chunks to Workers directly
      const uploadPromises = assignments.map(async (assignment) => {
        const { chunkIndex, workerUrl, token: chunkToken } = assignment;
        
        setChunksStatus(prev => {
          const next = [...prev];
          next[chunkIndex] = 'uploading';
          return next;
        });
        
        const buffer = chunkBuffers[chunkIndex];
        
        const workerRes = await fetch(`${workerUrl}/${chunkHashes[chunkIndex]}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${chunkToken}`,
            'Content-Type': 'application/octet-stream'
          },
          body: buffer
        });
        
        uploadedBytesRef.current += buffer.byteLength;
        const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
        if (elapsedSeconds > 0) {
          const speed = (uploadedBytesRef.current / (1024 * 1024)) / elapsedSeconds;
          setUploadSpeed(speed.toFixed(2));
          const remainingBytes = file.size - (dedupedChunks.length * chunkSize) - uploadedBytesRef.current;
          const remainingSeconds = remainingBytes / (1024 * 1024) / speed;
          setEta(formatEta(remainingSeconds));
        }
        
        if (!workerRes.ok) {
          const errData = await workerRes.json().catch(() => ({}));
          throw new Error(`Worker failed chunk ${chunkIndex}: ${errData.error || workerRes.status}`);
        }
        
        setChunksStatus(prev => {
          const next = [...prev];
          next[chunkIndex] = 'done';
          return next;
        });
        
        // Update progress (20% to 90%)
        setProgress(prev => {
          const completed = dedupedChunks.length + assignments.filter(a => chunksStatus[a.chunkIndex] === 'done').length + 1;
          return 20 + Math.round((completed / totalChunks) * 70);
        });
      });
      
      await Promise.all(uploadPromises);
      
      setStatus('finalizing');
      setProgress(95);
      
      // 3. Finalize on Master
      const merkleRoot = chunkHashes.length > 0 ? chunkHashes[0] : 'empty'; 
      
      const finalizeRes = await fetch(`${apiUrl}/api/v1/uploads/${sessionId}/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ merkleRoot })
      });
      
      const finalizeData = await finalizeRes.json();
      if (!finalizeRes.ok) throw new Error(finalizeData.error || 'Failed to finalize upload');
      
      setStatus('complete');
      setProgress(100);
      
      setTimeout(() => {
        if (onUploadComplete) onUploadComplete();
        onClose();
      }, 1500);
      
    } catch (err) {
      console.error('Upload Error:', err);
      setStatus('error');
      setErrorMsg(err.message);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-white/10">
              <h3 className="text-xl font-bold">Upload File</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" disabled={status === 'uploading' || status === 'requesting'}>
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              {status === 'idle' && (
                <div 
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-colors cursor-pointer ${file ? 'border-cyan-500 bg-cyan-500/5' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800'}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                  
                  {file ? (
                    <>
                      <FileIcon size={48} className="text-cyan-400 mb-4" />
                      <p className="font-semibold text-center truncate w-full px-4">{file.name}</p>
                      <p className="text-sm text-slate-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={48} className="text-slate-400 mb-4" />
                      <p className="font-semibold text-center mb-1">Click or drag file to this area to upload</p>
                      <p className="text-sm text-slate-500 text-center">Supports any file type. Direct-to-worker upload.</p>
                    </>
                  )}
                </div>
              )}

              {/* Progress UI */}
              {status !== 'idle' && status !== 'error' && (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-cyan-500/10 rounded-xl">
                      {status === 'complete' ? <CheckCircle2 className="text-cyan-400" size={24} /> : <Loader2 className="text-cyan-400 animate-spin" size={24} />}
                    </div>
                    <div>
                      <p className="font-semibold capitalize">{status}...</p>
                      <p className="text-sm text-slate-400">{file?.name}</p>
                    </div>
                    <div className="ml-auto flex flex-col items-end">
                      <div className="font-bold text-xl">{progress}%</div>
                      {status === 'uploading' && (
                        <div className="text-xs text-slate-400 mt-1 flex flex-col items-end gap-0.5">
                          <div>Speed: <span className="text-cyan-400 font-mono">{uploadSpeed} MB/s</span></div>
                          <div>ETA: <span className="text-cyan-400 font-mono">{eta}</span></div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-cyan-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                    />
                  </div>

                  {/* Flow Visualizer */}
                  {chunksStatus.length > 0 && (
                    <div className="mt-4 p-4 bg-slate-950 rounded-xl border border-white/5 relative overflow-hidden">
                      <p className="text-xs text-slate-500 mb-4 uppercase tracking-wider font-semibold">Data Flow Pipeline</p>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col items-center z-10 w-16">
                           <FileIcon size={32} className="text-slate-400 mb-2" />
                           <span className="text-xs text-slate-500 text-center">Client</span>
                        </div>
                        
                        <div className="flex-grow h-24 relative mx-4 border-y border-white/5 bg-slate-900/50 flex items-center">
                           {/* Render chunks flowing */}
                           {chunksStatus.map((s, i) => {
                             if (s === 'pending') return null;
                             
                             return (
                               <motion.div
                                 key={i}
                                 initial={{ opacity: 0, left: "0%", y: (i % 5 - 2) * 10 }}
                                 animate={{ 
                                   opacity: s === 'done' ? 0 : 1, 
                                   left: s === 'done' ? "100%" : "50%",
                                   scale: s === 'done' ? 0.5 : 1
                                 }}
                                 transition={{ 
                                   duration: 1.5, 
                                   repeat: s === 'uploading' ? Infinity : 0,
                                   ease: "linear"
                                 }}
                                 className={`absolute top-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full ${
                                   s === 'done' ? 'bg-green-500' :
                                   s === 'uploading' ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]' :
                                   s === 'error' ? 'bg-red-500' : 'bg-slate-700'
                                 }`}
                               />
                             );
                           })}
                        </div>
                        
                        <div className="flex flex-col items-center z-10 w-16">
                           <Server size={32} className="text-cyan-400 mb-2" />
                           <span className="text-xs text-slate-500 text-center">Nodes</span>
                        </div>
                      </div>
                      
                      {/* Sub-status of chunks */}
                      <div className="mt-4 flex gap-4 text-[10px] text-slate-500 justify-center font-mono">
                         <div className="flex items-center gap-1"><div className="w-2 h-2 bg-slate-700 rounded-full"></div> PEND {chunksStatus.filter(c => c==='pending').length}</div>
                         <div className="flex items-center gap-1"><div className="w-2 h-2 bg-cyan-500 rounded-full shadow-[0_0_8px_rgba(6,182,212,0.6)]"></div> SYNC {chunksStatus.filter(c => c==='uploading').length}</div>
                         <div className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 rounded-full"></div> DONE {chunksStatus.filter(c => c==='done').length}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error state */}
              {status === 'error' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col items-center">
                  <AlertCircle size={48} className="text-red-500 mb-4" />
                  <p className="font-bold text-red-500 mb-1">Upload Failed</p>
                  <p className="text-sm text-red-400 text-center mb-6">{errorMsg}</p>
                  <button onClick={() => setStatus('idle')} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-semibold transition-colors">
                    Try Again
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            {status === 'idle' && (
              <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-slate-900/50">
                <button onClick={onClose} className="px-4 py-2 hover:bg-slate-800 rounded-lg font-semibold transition-colors">
                  Cancel
                </button>
                <button 
                  onClick={startUpload} 
                  disabled={!file}
                  className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors ${file ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                >
                  Start Upload
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

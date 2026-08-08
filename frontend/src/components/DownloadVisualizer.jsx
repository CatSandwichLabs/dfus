import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Loader2, File as FileIcon, Server } from 'lucide-react';

export default function DownloadVisualizer({ isOpen, onClose, file, token, onComplete }) {
  const [status, setStatus] = useState('idle'); // idle, downloading, complete, error
  const [progress, setProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0); // MB/s
  const [eta, setEta] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const startTimeRef = useRef(null);
  const downloadedBytesRef = useRef(0);

  useEffect(() => {
    if (isOpen && file) {
      startDownload();
    } else {
      setStatus('idle');
      setProgress(0);
      setDownloadSpeed(0);
      setEta('');
      setErrorMsg('');
    }
  }, [isOpen, file]);

  const formatEta = (seconds) => {
    if (seconds === Infinity || isNaN(seconds)) return 'Calculating...';
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  const startDownload = async () => {
    try {
      setStatus('downloading');
      setProgress(0);
      startTimeRef.current = Date.now();
      downloadedBytesRef.current = 0;

      const apiUrl = import.meta.env.VITE_API_URL || '';
      
      const res = await fetch(`${apiUrl}/api/v1/files/${file._id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          throw new Error(data.error || 'Download failed');
        } else {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
      }

      // Read the stream
      const reader = res.body.getReader();
      const contentLength = +res.headers.get('Content-Length') || file.size || 0;
      let chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        downloadedBytesRef.current += value.length;
        
        // Progress and speed calculations
        if (contentLength > 0) {
          setProgress(Math.round((downloadedBytesRef.current / contentLength) * 100));
        } else if (file.size > 0) {
          setProgress(Math.round((downloadedBytesRef.current / file.size) * 100));
        }
        
        const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
        if (elapsedSeconds > 0) {
          const speed = (downloadedBytesRef.current / (1024 * 1024)) / elapsedSeconds;
          setDownloadSpeed(speed.toFixed(2));
          
          const totalSize = contentLength || file.size;
          if (totalSize > 0) {
            const remainingBytes = totalSize - downloadedBytesRef.current;
            const remainingSeconds = remainingBytes / (1024 * 1024) / speed;
            setEta(formatEta(remainingSeconds));
          }
        }
      }

      // Combine chunks into a single Blob
      const blob = new Blob(chunks, { type: file.mimeType || 'application/octet-stream' });
      
      // Trigger native download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.originalName || file.name || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setStatus('complete');
      setProgress(100);
      
      setTimeout(() => {
        if (onComplete) onComplete();
        onClose();
      }, 2000);
      
    } catch (err) {
      console.error('Download Error:', err);
      setStatus('error');
      setErrorMsg(err.message);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-white/10">
              <h3 className="text-xl font-bold">Downloading File</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" disabled={status === 'downloading'}>
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">
              {status !== 'error' ? (
                <>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-cyan-500/10 rounded-xl">
                      {status === 'complete' ? <CheckCircle2 className="text-cyan-400" size={24} /> : <Loader2 className="text-cyan-400 animate-spin" size={24} />}
                    </div>
                    <div>
                      <p className="font-semibold capitalize">{status}...</p>
                      <p className="text-sm text-slate-400">{file?.originalName || file?.name}</p>
                    </div>
                    <div className="ml-auto flex flex-col items-end">
                      <div className="font-bold text-xl">{progress}%</div>
                      {status === 'downloading' && (
                        <div className="text-xs text-slate-400 mt-1 flex flex-col items-end gap-0.5">
                          <div>Speed: <span className="text-cyan-400 font-mono">{downloadSpeed} MB/s</span></div>
                          {eta && <div>ETA: <span className="text-cyan-400 font-mono">{eta}</span></div>}
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

                  {/* Flow Visualizer (Reverse of Upload) */}
                  <div className="mt-4 p-4 bg-slate-950 rounded-xl border border-white/5 relative overflow-hidden">
                    <p className="text-xs text-slate-500 mb-4 uppercase tracking-wider font-semibold">Data Flow Pipeline</p>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col items-center z-10 w-16">
                         <Server size={32} className="text-cyan-400 mb-2" />
                         <span className="text-xs text-slate-500 text-center">Nodes</span>
                      </div>
                      
                      <div className="flex-grow h-24 relative mx-4 border-y border-white/5 bg-slate-900/50 flex items-center">
                         {/* Render chunks flowing right to left */}
                         {status === 'downloading' && Array.from({ length: 5 }).map((_, i) => (
                           <motion.div
                             key={i}
                             initial={{ opacity: 0, left: "100%", y: (i % 3 - 1) * 10 }}
                             animate={{ 
                               opacity: [0, 1, 1, 0], 
                               left: ["100%", "50%", "0%"]
                             }}
                             transition={{ 
                               duration: 1.5, 
                               repeat: Infinity,
                               delay: i * 0.3,
                               ease: "linear"
                             }}
                             className="absolute top-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]"
                           />
                         ))}
                         {status === 'complete' && (
                           <motion.div
                             initial={{ opacity: 0, left: "100%", scale: 0.5 }}
                             animate={{ opacity: 1, left: "0%", scale: 1 }}
                             transition={{ duration: 0.5 }}
                             className="absolute top-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full bg-green-500"
                           />
                         )}
                      </div>
                      
                      <div className="flex flex-col items-center z-10 w-16">
                         <FileIcon size={32} className="text-slate-400 mb-2" />
                         <span className="text-xs text-slate-500 text-center">Client</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col items-center">
                  <AlertCircle size={48} className="text-red-500 mb-4" />
                  <p className="font-bold text-red-500 mb-1">Download Failed</p>
                  <p className="text-sm text-red-400 text-center mb-6">{errorMsg}</p>
                  <button onClick={startDownload} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-semibold transition-colors">
                    Try Again
                  </button>
                </div>
              )}
            </div>
            
            {/* Footer */}
            {status === 'error' && (
              <div className="p-6 border-t border-white/10 flex justify-end bg-slate-900/50">
                <button onClick={onClose} className="px-4 py-2 hover:bg-slate-800 rounded-lg font-semibold transition-colors">
                  Close
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, File as FileIcon, Share2, Download, Trash2, Tag, Server, History, ShieldCheck } from 'lucide-react';
import DownloadVisualizer from './DownloadVisualizer';

export default function FileDetailsModal({ isOpen, onClose, file, token, onActionComplete }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview, chunks, versions, share
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (isOpen && file) {
      fetchFileDetails();
    } else {
      setDetails(null);
      setLoading(true);
      setActiveTab('overview');
    }
  }, [isOpen, file]);

  const fetchFileDetails = async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/v1/files/${file._id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setDetails(data.file || file);
      } else {
        setDetails(file); // Fallback to basic file info
      }
    } catch (err) {
      console.error(err);
      setDetails(file);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    setIsDownloading(true);
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to move this file to trash?')) return;
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/v1/files/${file._id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete');
      onClose();
      if (onActionComplete) onActionComplete();
    } catch (err) {
      alert(err.message);
    }
  };

  if (!file) return null;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-3xl overflow-hidden flex flex-col h-[80vh]"
          >
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-white/10 bg-slate-800/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-cyan-500/10 rounded-xl">
                  <FileIcon className="text-cyan-400" size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-bold truncate max-w-sm">{file.originalName}</h3>
                  <p className="text-sm text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB • {file.status}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleDownload} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors" title="Download">
                  <Download size={20} />
                </button>
                <button onClick={handleDelete} className="p-2 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 rounded-lg text-slate-300 transition-colors" title="Delete">
                  <Trash2 size={20} />
                </button>
                <button onClick={() => setActiveTab('share')} className="p-2 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-slate-950 rounded-lg transition-colors ml-2" title="Share">
                  <Share2 size={20} />
                </button>
                <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors ml-4">
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/5 bg-slate-900 px-6">
              {['overview', 'chunks', 'versions', 'share'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-3 text-sm font-semibold capitalize border-b-2 transition-colors ${
                    activeTab === tab ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="p-6 flex-grow overflow-y-auto">
              {loading ? (
                <div className="flex justify-center items-center h-full text-slate-400">Loading details...</div>
              ) : (
                <>
                  {activeTab === 'overview' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5">
                          <p className="text-sm text-slate-500 mb-1">Uploaded</p>
                          <p className="font-semibold">{new Date(file.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5">
                          <p className="text-sm text-slate-500 mb-1">MIME Type</p>
                          <p className="font-semibold font-mono text-sm">{file.mimeType}</p>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-bold flex items-center gap-2 mb-3"><Tag size={16} /> Tags</h4>
                        <div className="flex gap-2 flex-wrap">
                          {file.tags && file.tags.length > 0 ? (
                            file.tags.map(tag => (
                              <span key={tag} className="bg-slate-800 text-slate-300 px-3 py-1 rounded-full text-sm border border-white/10">
                                {tag}
                              </span>
                            ))
                          ) : (
                            <p className="text-sm text-slate-500">No tags added.</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-bold flex items-center gap-2 mb-3"><ShieldCheck size={16} className="text-emerald-400"/> Integrity</h4>
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5 space-y-3">
                          <div>
                            <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Merkle Root</p>
                            <p className="font-mono text-xs text-slate-300 break-all bg-slate-900 p-2 rounded">{details?.merkleRoot || 'Not available'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'chunks' && (
                    <div>
                      <h4 className="font-bold flex items-center gap-2 mb-4"><Server size={18} /> Chunk Map Topology</h4>
                      <p className="text-sm text-slate-400 mb-4">Visual representation of data blocks distributed across the worker cluster.</p>
                      
                      <div className="bg-slate-900 border border-white/5 rounded-xl p-4">
                        <div className="flex flex-wrap gap-2">
                          {/* Mocking a chunk map if not present */}
                          {Array.from({ length: details?.totalChunks || Math.ceil(file.size / (5*1024*1024)) || 1 }).map((_, i) => (
                            <div 
                              key={i} 
                              className="w-6 h-6 rounded bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center cursor-pointer hover:bg-emerald-500/40 transition-colors"
                              title={`Chunk ${i} - Replicated`}
                            >
                              <span className="text-[10px] text-emerald-400 font-mono">{i}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 flex gap-4 text-xs text-slate-400">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500/20 border border-emerald-500/50 rounded"></div> Fully Replicated</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-amber-500/20 border border-amber-500/50 rounded"></div> Under-replicated</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-cyan-500/20 border border-cyan-500/50 rounded"></div> Deduplicated</div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'versions' && (
                    <div>
                      <h4 className="font-bold flex items-center gap-2 mb-4"><History size={18} /> Version History</h4>
                      <div className="space-y-3">
                        <div className="bg-slate-800/80 p-4 rounded-xl border border-cyan-500/30 flex justify-between items-center">
                          <div>
                            <p className="font-bold text-cyan-400">Current Version</p>
                            <p className="text-xs text-slate-400">{new Date(file.createdAt).toLocaleString()}</p>
                          </div>
                          <span className="text-sm font-mono bg-slate-900 px-2 py-1 rounded">v1</span>
                        </div>
                        <p className="text-sm text-slate-500 mt-4 text-center">No previous versions exist for this file.</p>
                      </div>
                    </div>
                  )}

                  {activeTab === 'share' && (
                    <div className="flex flex-col items-center justify-center py-8">
                      <div className="w-24 h-24 bg-cyan-500/10 text-cyan-400 rounded-full flex items-center justify-center mb-6">
                        <Share2 size={48} />
                      </div>
                      <h3 className="text-xl font-bold mb-2">Share this file</h3>
                      <p className="text-slate-400 text-center max-w-md mb-8">Generate a public link or QR code to share this file securely. You can optionally set a password and expiry date.</p>
                      
                      {file.shareToken ? (
                        <div className="flex flex-col items-center w-full max-w-md space-y-4">
                          <div className="w-full flex items-center bg-slate-900 border border-white/10 rounded-lg overflow-hidden">
                            <input 
                              type="text" 
                              readOnly 
                              value={`${window.location.origin}/share/${file.shareToken}`} 
                              className="bg-transparent flex-grow px-4 py-2 outline-none text-sm font-mono text-cyan-400"
                            />
                            <button 
                              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/share/${file.shareToken}`)}
                              className="bg-slate-800 hover:bg-slate-700 px-4 py-2 font-bold transition-colors"
                            >
                              Copy
                            </button>
                          </div>
                          
                          <div className="bg-white p-2 rounded-xl mt-4">
                            <img src={`${import.meta.env.VITE_API_URL || ''}/api/v1/shares/qr/${file.shareToken}`} alt="Share QR Code" className="w-48 h-48" />
                          </div>
                        </div>
                      ) : (
                        <button 
                          onClick={async () => {
                            try {
                              const apiUrl = import.meta.env.VITE_API_URL || '';
                              const res = await fetch(`${apiUrl}/api/v1/shares/${file._id}`, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${token}` }
                              });
                              if (!res.ok) throw new Error('Failed to generate share link');
                              fetchFileDetails(); // Refresh to get the shareToken
                            } catch(err) {
                              alert(err.message);
                            }
                          }}
                          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-6 py-3 rounded-lg font-bold transition-colors"
                        >
                          Generate Share Link
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      <DownloadVisualizer 
        isOpen={isDownloading} 
        onClose={() => setIsDownloading(false)} 
        file={file} 
        token={token} 
      />
    </>
  );
}

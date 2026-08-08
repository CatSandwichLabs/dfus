import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, FileIcon, Shield, Lock } from 'lucide-react';

export default function SharePage() {
  const { shareToken } = useParams();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [password, setPassword] = useState('');
  const [isProtected, setIsProtected] = useState(false);

  useEffect(() => {
    fetchSharedFile();
  }, [shareToken]);

  const fetchSharedFile = async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/v1/shares/access/${shareToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      const data = await res.json();
      
      if (res.status === 401 && data.error === 'Password required') {
        setIsProtected(true);
        setLoading(false);
        return;
      }
      
      if (!res.ok) throw new Error(data.error || 'Failed to access file');
      
      setFile(data.file);
      setIsProtected(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      window.location.href = `${apiUrl}/api/v1/shares/download/${shareToken}?password=${encodeURIComponent(password)}`;
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>;
  }

  if (error && !isProtected) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
          <Shield size={48} className="text-rose-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  if (isProtected && !file) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
          <Lock size={48} className="text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Password Protected</h2>
          <p className="text-slate-400 mb-6">This file requires a password to access.</p>
          
          <input 
            type="password" 
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-3 mb-4 focus:outline-none focus:border-cyan-500"
          />
          <button 
            onClick={fetchSharedFile}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3 rounded-lg transition-colors"
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 pt-20">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl max-w-lg w-full overflow-hidden"
      >
        <div className="bg-cyan-500/10 p-8 flex justify-center border-b border-white/5">
          <FileIcon size={64} className="text-cyan-400" />
        </div>
        
        <div className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-2 break-words">{file.originalName}</h2>
          <p className="text-slate-400 mb-8">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          
          <button 
            onClick={handleDownload}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-lg"
          >
            <Download size={24} />
            Download File
          </button>
          
          <p className="text-xs text-slate-500 mt-6">
            Shared securely via DFUS Distributed Storage
          </p>
        </div>
      </motion.div>
    </div>
  );
}

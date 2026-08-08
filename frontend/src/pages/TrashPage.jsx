import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trash2, RefreshCw, X, Folder, File as FileIcon } from 'lucide-react';

export default function TrashPage({ token }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrash();
  }, []);

  const fetchTrash = async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/v1/trash`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setItems(data.items || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (id, type) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const endpoint = type === 'folder' ? 'folders' : 'files';
      const res = await fetch(`${apiUrl}/api/v1/trash/${endpoint}/${id}/restore`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchTrash();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to restore');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handlePermanentDelete = async (id, type) => {
    if (!confirm('Are you sure? This cannot be undone.')) return;
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const endpoint = type === 'folder' ? 'folders' : 'files';
      const res = await fetch(`${apiUrl}/api/v1/trash/${endpoint}/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchTrash();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="flex-grow p-6 pt-24 max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold flex items-center gap-3">
          <Trash2 size={32} className="text-rose-500" />
          Trash
        </h2>
      </div>

      <div className="glass rounded-xl p-6 min-h-[400px]">
        {loading ? (
          <div className="flex justify-center items-center h-64 text-slate-400">Loading...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-64 text-slate-400">
            <Trash2 size={48} className="mb-4 opacity-30" />
            <p>Trash is empty.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {items.map((item, i) => (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                key={item._id}
                className="bg-slate-800/50 hover:bg-slate-800 border border-white/5 rounded-lg p-4 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-slate-900 rounded-lg">
                    {item.type === 'folder' ? <Folder className="text-slate-400" /> : <FileIcon className="text-slate-400" />}
                  </div>
                  <div>
                    <h4 className="font-semibold">{item.name || item.originalName}</h4>
                    <p className="text-xs text-slate-500">
                      Deleted: {new Date(item.deletedAt || item.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleRestore(item._id, item.type)}
                    className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors"
                    title="Restore"
                  >
                    <RefreshCw size={20} />
                  </button>
                  <button 
                    onClick={() => handlePermanentDelete(item._id, item.type)}
                    className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors"
                    title="Delete Permanently"
                  >
                    <X size={20} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { File as FileIcon, Folder, UploadCloud, Search } from 'lucide-react';

export default function Dashboard({ token }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/v1/files`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setItems(data.files || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadClick = () => {
    // We would implement chunked uploading logic here to the worker APIs
    alert('Upload feature requires Worker node integration UI logic.');
  };

  return (
    <div className="flex-grow p-6 pt-24 max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold">My Storage</h2>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search files..."
              className="bg-slate-900 border border-white/10 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-cyan-500 w-64 text-sm"
            />
          </div>
          <button 
            onClick={handleUploadClick}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
          >
            <UploadCloud size={20} />
            Upload File
          </button>
        </div>
      </div>

      <div className="glass rounded-xl p-6 min-h-[400px]">
        {loading ? (
          <div className="flex justify-center items-center h-64 text-slate-400">Loading...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-64 text-slate-400">
            <Folder size={48} className="mb-4 opacity-50" />
            <p>Your storage is empty.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((file, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                key={file._id}
                className="bg-slate-800/50 hover:bg-slate-800 border border-white/5 rounded-lg p-4 flex flex-col gap-3 transition-colors cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 bg-cyan-500/10 rounded-lg">
                    <FileIcon className="text-cyan-400" size={24} />
                  </div>
                  <span className="text-xs text-slate-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
                <h4 className="font-semibold truncate" title={file.originalName}>
                  {file.originalName}
                </h4>
                <p className="text-xs text-slate-400">
                  {new Date(file.createdAt).toLocaleDateString()}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

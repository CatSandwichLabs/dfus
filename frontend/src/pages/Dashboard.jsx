import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { File as FileIcon, Folder, UploadCloud, Search, FolderPlus } from 'lucide-react';
import UploadModal from '../components/UploadModal';
import FileDetailsModal from '../components/FileDetailsModal';
import FolderBreadcrumb from '../components/FolderBreadcrumb';

export default function Dashboard({ token }) {
  const [items, setItems] = useState([]); // files
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([{ id: null, name: 'Root' }]);
  const [searchQuery, setSearchQuery] = useState('');

  // Debounced Search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchItems();
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, currentFolderId]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || '';
      
      let fileEndpoint = `${apiUrl}/api/v1/files`;
      let folderEndpoint = `${apiUrl}/api/v1/folders`;
      
      if (searchQuery.trim().length > 0) {
        // Use search endpoints if there's a query
        fileEndpoint = `${apiUrl}/api/v1/search/files?q=${encodeURIComponent(searchQuery)}`;
        folderEndpoint = `${apiUrl}/api/v1/search/folders?q=${encodeURIComponent(searchQuery)}`;
      } else {
        // Normal directory browsing
        fileEndpoint += currentFolderId ? `?folderId=${currentFolderId}` : '';
        folderEndpoint += currentFolderId ? `?parentId=${currentFolderId}` : '';
      }

      // Fetch files
      const resFiles = await fetch(fileEndpoint, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataFiles = await resFiles.json();
      if (resFiles.ok) {
        setItems(dataFiles.files || []);
      }

      // Fetch folders
      const resFolders = await fetch(folderEndpoint, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataFolders = await resFolders.json();
      if (resFolders.ok) {
        setFolders(dataFolders.folders || []);
      }

      // Fetch breadcrumb if we are in a folder
      if (currentFolderId) {
        const resPath = await fetch(`${apiUrl}/api/v1/folders/${currentFolderId}/path`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const dataPath = await resPath.json();
        if (resPath.ok) {
          setBreadcrumb([{ id: null, name: 'Root' }, ...(dataPath.path || [])]);
        }
      } else {
        setBreadcrumb([{ id: null, name: 'Root' }]);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    const name = prompt('Folder name:');
    if (!name) return;
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/v1/folders`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, parentId: currentFolderId })
      });
      if (res.ok) {
        fetchItems();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create folder');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUploadClick = () => {
    setIsUploadOpen(true);
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-900 border border-white/10 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-cyan-500 w-64 text-sm"
            />
          </div>
          <button 
            onClick={handleCreateFolder}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors border border-white/10"
          >
            <FolderPlus size={20} />
            New Folder
          </button>
          <button 
            onClick={handleUploadClick}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
          >
            <UploadCloud size={20} />
            Upload File
          </button>
        </div>
      </div>

      <FolderBreadcrumb path={breadcrumb} onNavigate={setCurrentFolderId} />

      <div className="glass rounded-xl p-6 min-h-[400px]">
        {loading ? (
          <div className="flex justify-center items-center h-64 text-slate-400">Loading...</div>
        ) : items.length === 0 && folders.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-64 text-slate-400">
            <Folder size={48} className="mb-4 opacity-50" />
            <p>This folder is empty.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {folders.map((folder, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                key={`folder-${folder._id}`}
                onClick={() => setCurrentFolderId(folder._id)}
                className="bg-slate-800/80 hover:bg-slate-700 border border-white/5 rounded-lg p-4 flex flex-col gap-3 transition-colors cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 bg-slate-700/50 rounded-lg">
                    <Folder className="text-slate-300" size={24} fill="currentColor" fillOpacity={0.2} />
                  </div>
                </div>
                <h4 className="font-semibold truncate" title={folder.name}>
                  {folder.name}
                </h4>
                <p className="text-xs text-slate-400">
                  Folder
                </p>
              </motion.div>
            ))}

            {items.map((file, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (folders.length + i) * 0.05 }}
                key={`file-${file._id}`}
                onClick={() => setSelectedFile(file)}
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

      <FileDetailsModal 
        isOpen={selectedFile !== null}
        onClose={() => setSelectedFile(null)}
        file={selectedFile}
        token={token}
        onActionComplete={fetchItems}
      />

      <UploadModal 
        isOpen={isUploadOpen} 
        onClose={() => setIsUploadOpen(false)} 
        token={token} 
        currentFolderId={currentFolderId}
        onUploadComplete={fetchItems}
      />
    </div>
  );
}

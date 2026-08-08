import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Server, HardDrive, Activity, ShieldCheck, AlertCircle } from 'lucide-react';

export default function StorageDashboard({ token }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStorageStats();
  }, []);

  const fetchStorageStats = async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || '';
      // We will fetch user info to get quota, and maybe a system endpoint for workers
      // If system endpoint doesn't exist, we will gracefully degrade.
      const res = await fetch(`${apiUrl}/api/v1/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch storage stats');
      
      setStats({
        storageUsed: data.user.storageUsed || 0,
        storageQuota: data.user.storageQuota || 10737418240, // 10GB default
        activeWorkers: 3, // Mocked for UI since there is no public endpoint to list workers
        health: 'Healthy'
      });
      
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-grow flex justify-center items-center h-full">
        <div className="text-cyan-500 animate-pulse flex flex-col items-center gap-4">
          <Activity size={48} />
          <p className="font-semibold tracking-wider uppercase text-sm">Querying Cluster...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-grow p-6 pt-24 max-w-7xl mx-auto w-full">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 flex items-start gap-4">
          <AlertCircle className="text-red-500 mt-1" size={24} />
          <div>
            <h3 className="text-lg font-bold text-red-500 mb-1">Telemetry Error</h3>
            <p className="text-red-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const usagePercent = Math.min(100, Math.round((stats.storageUsed / stats.storageQuota) * 100));
  const isNearLimit = usagePercent > 85;

  return (
    <div className="flex-grow p-6 pt-24 max-w-7xl mx-auto w-full">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Storage Cluster</h2>
        <p className="text-slate-400">Monitor your quota and the distributed worker nodes</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Storage Quota Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-6 lg:col-span-2 flex flex-col justify-between relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <HardDrive size={120} />
          </div>
          
          <div>
            <div className="flex items-center gap-3 mb-6 text-cyan-400">
              <HardDrive size={24} />
              <h3 className="font-bold text-lg text-white">Storage Quota</h3>
            </div>
            
            <div className="flex items-end gap-2 mb-2">
              <span className="text-4xl font-bold">{(stats.storageUsed / 1024 / 1024).toFixed(2)}</span>
              <span className="text-slate-400 mb-1 font-medium">MB used</span>
              <span className="text-slate-600 mx-2 mb-1">/</span>
              <span className="text-slate-400 mb-1">{(stats.storageQuota / 1024 / 1024 / 1024).toFixed(2)} GB total</span>
            </div>
          </div>
          
          <div className="mt-8">
            <div className="flex justify-between text-xs font-semibold mb-2 text-slate-400">
              <span>Usage</span>
              <span className={isNearLimit ? 'text-red-400' : 'text-cyan-400'}>{usagePercent}%</span>
            </div>
            <div className="h-4 bg-slate-900 rounded-full overflow-hidden border border-white/5 shadow-inner">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${usagePercent}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className={`h-full ${isNearLimit ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.5)]'}`}
              />
            </div>
          </div>
        </motion.div>

        {/* System Health Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-xl p-6 flex flex-col"
        >
          <div className="flex items-center gap-3 mb-6 text-emerald-400">
            <ShieldCheck size={24} />
            <h3 className="font-bold text-lg text-white">Cluster Health</h3>
          </div>
          
          <div className="flex-grow flex flex-col justify-center items-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full animate-pulse" />
              <div className="w-24 h-24 bg-slate-900 border border-emerald-500/30 rounded-full flex items-center justify-center relative z-10 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                <span className="text-emerald-400 font-bold text-xl uppercase tracking-wider">{stats.health}</span>
              </div>
            </div>
            <div className="w-full bg-slate-900/50 rounded-lg p-4 flex justify-between items-center border border-white/5">
              <span className="text-sm text-slate-400 flex items-center gap-2">
                <Server size={16} /> Active Nodes
              </span>
              <span className="font-mono font-bold text-lg text-cyan-400">{stats.activeWorkers}</span>
            </div>
          </div>
        </motion.div>
      </div>
      
      {/* Worker List (Mocked) */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-xl p-6"
      >
        <h3 className="font-bold text-lg mb-6 flex items-center gap-3">
          <Server size={20} className="text-cyan-400" />
          Worker Nodes Map
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-900/50 border border-white/5 hover:border-white/10 rounded-lg p-4 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,1)]" />
                    <span className="font-mono text-sm font-bold">worker-eu-west-{i}</span>
                  </div>
                  <p className="text-xs text-slate-500">us-east-1a • r2-storage</p>
                </div>
                <div className="text-xs font-mono bg-slate-800 px-2 py-1 rounded text-cyan-400">
                  Online
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Load</span>
                  <span className="text-slate-300 font-mono">{Math.floor(Math.random() * 30 + 10)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Uptime</span>
                  <span className="text-slate-300 font-mono">14d 2h 45m</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

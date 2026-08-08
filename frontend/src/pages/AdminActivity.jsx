import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, User, File, LogIn, Share2, AlertCircle } from 'lucide-react';

export default function AdminActivity({ token }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || '';
      // Assumes we have an endpoint for this, we will add it to admin.routes.js if not
      const res = await fetch(`${apiUrl}/api/v1/admin/activity`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setActivities(data.activities || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getIconForAction = (action) => {
    if (action.includes('login')) return <LogIn className="text-emerald-400" size={18} />;
    if (action.includes('file')) return <File className="text-cyan-400" size={18} />;
    if (action.includes('share')) return <Share2 className="text-indigo-400" size={18} />;
    if (action.includes('delete') || action.includes('trash')) return <AlertCircle className="text-rose-400" size={18} />;
    return <Activity className="text-slate-400" size={18} />;
  };

  return (
    <div className="flex-grow p-6 pt-24 max-w-5xl mx-auto w-full">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold flex items-center gap-3">
          <Activity size={32} className="text-cyan-500" />
          System Activity Log
        </h2>
      </div>

      <div className="glass rounded-xl overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="flex justify-center items-center h-64 text-slate-400">Loading activity...</div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-64 text-slate-400">
            <Activity size={48} className="mb-4 opacity-30" />
            <p>No activity recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-white/10">
                  <th className="p-4 text-sm font-semibold text-slate-400">Time</th>
                  <th className="p-4 text-sm font-semibold text-slate-400">Action</th>
                  <th className="p-4 text-sm font-semibold text-slate-400">User</th>
                  <th className="p-4 text-sm font-semibold text-slate-400">Target</th>
                  <th className="p-4 text-sm font-semibold text-slate-400">IP & UA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {activities.map((act, i) => (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    key={act._id} 
                    className="hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="p-4 text-sm text-slate-400 whitespace-nowrap">
                      {new Date(act.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4 text-sm font-semibold flex items-center gap-2">
                      {getIconForAction(act.action)}
                      {act.action}
                    </td>
                    <td className="p-4 text-sm text-slate-300">
                      <div className="flex items-center gap-2">
                        <User size={14} className="opacity-50" />
                        {act.userEmail || act.userId || 'System'}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-300">
                      {act.targetType} {act.targetId ? `(${act.targetId})` : ''}
                    </td>
                    <td className="p-4 text-xs text-slate-500 max-w-[200px] truncate" title={act.userAgent}>
                      {act.ipAddress} <br /> {act.userAgent}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Shield, Zap, Globe } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex-grow flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-[128px] -z-10" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[128px] -z-10" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl text-center space-y-8"
      >
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">
          Limitless Storage.<br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
            Zero Boundaries.
          </span>
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto">
          DFUS is a next-generation distributed file upload system. Secure, ridiculously fast, and built to scale globally across a decentralized master-worker architecture.
        </p>

        <div className="flex gap-4 justify-center pt-4">
          <Link to="/register">
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-8 py-3 rounded-xl font-bold text-lg transition-colors shadow-[0_0_20px_rgba(6,182,212,0.4)]"
            >
              Start Uploading Free
            </motion.button>
          </Link>
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="grid md:grid-cols-3 gap-8 max-w-5xl mt-24 w-full"
      >
        {[
          { icon: <Zap className="text-amber-400" size={32}/>, title: "Blazing Fast", desc: "Chunked uploads directly to edge workers." },
          { icon: <Shield className="text-emerald-400" size={32}/>, title: "AES-256 Secured", desc: "Military-grade encryption before data even leaves your device." },
          { icon: <Globe className="text-blue-400" size={32}/>, title: "Globally Distributed", desc: "Consistent hash ring architecture guarantees high availability." }
        ].map((feature, i) => (
          <div key={i} className="glass p-6 rounded-2xl flex flex-col items-center text-center space-y-4">
            <div className="p-4 bg-slate-800 rounded-xl">{feature.icon}</div>
            <h3 className="text-xl font-bold">{feature.title}</h3>
            <p className="text-slate-400">{feature.desc}</p>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

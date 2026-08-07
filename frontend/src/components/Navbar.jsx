import { Link, useNavigate } from 'react-router-dom';
import { Cloud, LogOut, User as UserIcon } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Navbar({ token, setToken }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    setToken(null);
    navigate('/');
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10 px-6 py-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-white">
          <Cloud className="text-cyan-400" />
          <span>DFUS<span className="text-cyan-400">Cloud</span></span>
        </Link>
        
        <div className="flex items-center gap-6">
          {!token ? (
            <>
              <Link to="/login" className="text-sm text-slate-300 hover:text-white transition-colors">Sign In</Link>
              <Link to="/register">
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
                >
                  Get Started
                </motion.button>
              </Link>
            </>
          ) : (
            <>
              <Link to="/dashboard" className="text-sm text-slate-300 hover:text-white transition-colors flex items-center gap-2">
                <UserIcon size={16} />
                Dashboard
              </Link>
              <button 
                onClick={handleLogout}
                className="text-sm text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-2"
              >
                <LogOut size={16} />
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

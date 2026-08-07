import { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, User, Phone, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInAnonymously,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from 'firebase/auth';

export default function Register({ setToken }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [mode, setMode] = useState('email'); // email, phone
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Helper to sync firebase user + recaptcha token with our backend
  const syncWithBackend = async (firebaseUser) => {
    try {
      const idToken = await firebaseUser.getIdToken();
      
      let recaptchaToken = 'mock-token';
      if (window.grecaptcha && window.grecaptcha.enterprise) {
        recaptchaToken = await window.grecaptcha.enterprise.execute('6LcM3HktAAAAAG0xPeThBWs6WLh2B8KywYtV8fam', {action: 'LOGIN'});
      }

      const res = await fetch(import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api/v1/auth/sync` : '/api/v1/auth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, recaptchaToken })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setToken(data.token);
        navigate('/dashboard');
      } else {
        const errMsg = typeof data.error === 'object' ? data.error.message : data.error;
        setError(errMsg || 'Failed to sync with backend');
      }
    } catch (err) {
      setError('Network error syncing with backend.');
    }
  };

  const handleEmailRegister = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await syncWithBackend(userCredential.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(''); setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      await syncWithBackend(userCredential.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymousLogin = async () => {
    setError(''); setLoading(true);
    try {
      const userCredential = await signInAnonymously(auth);
      await syncWithBackend(userCredential.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible'
      });
    }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      setupRecaptcha();
      const appVerifier = window.recaptchaVerifier;
      const confirmationResult = await signInWithPhoneNumber(auth, phone, appVerifier);
      window.confirmationResult = confirmationResult;
      setShowOtp(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const userCredential = await window.confirmationResult.confirm(otp);
      await syncWithBackend(userCredential.user);
    } catch (err) {
      setError('Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-grow flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass p-8 rounded-2xl w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="bg-cyan-500/10 p-4 rounded-full mb-4">
            <UserPlus className="text-cyan-400" size={32} />
          </div>
          <h2 className="text-2xl font-bold">Create Account</h2>
          <p className="text-slate-400 text-sm">Join DFUS today</p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/50 text-rose-400 p-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        <div className="flex bg-slate-900 rounded-lg p-1 mb-6">
          <button 
            onClick={() => setMode('email')} 
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'email' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
          >
            Email
          </button>
          <button 
            onClick={() => setMode('phone')} 
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'phone' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
          >
            Phone
          </button>
        </div>

        {mode === 'email' ? (
          <form onSubmit={handleEmailRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input 
                type="email" required
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-cyan-500 transition-colors"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input 
                type="password" required minLength="6"
                value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-cyan-500 transition-colors"
                placeholder="••••••••"
              />
            </div>
            <button 
              type="submit" disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2 rounded-lg transition-colors mt-4 disabled:opacity-50"
            >
              {loading ? 'Creating Account...' : 'Sign Up with Email'}
            </button>
          </form>
        ) : (
          <form onSubmit={showOtp ? handleVerifyOtp : handleSendOtp} className="space-y-4">
            {!showOtp ? (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Phone Number</label>
                <input 
                  type="tel" required
                  value={phone} onChange={e => setPhone(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder="+1234567890"
                />
                <button 
                  type="submit" disabled={loading}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2 rounded-lg transition-colors mt-4 disabled:opacity-50"
                >
                  {loading ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Enter OTP</label>
                <input 
                  type="text" required
                  value={otp} onChange={e => setOtp(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder="123456"
                />
                <button 
                  type="submit" disabled={loading}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2 rounded-lg transition-colors mt-4 disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify & Sign Up'}
                </button>
              </div>
            )}
            <div id="recaptcha-container"></div>
          </form>
        )}

        <div className="mt-6 border-t border-white/10 pt-6 space-y-3">
          <button 
            onClick={handleGoogleLogin} disabled={loading}
            className="w-full bg-white hover:bg-slate-200 text-slate-900 font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Mail size={18} /> Sign Up with Google
          </button>
          
          <button 
            onClick={handleAnonymousLogin} disabled={loading}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <User size={18} /> Continue Anonymously
          </button>
        </div>
      </motion.div>
    </div>
  );
}

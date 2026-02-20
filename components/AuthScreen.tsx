import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  reload,
  signInWithPopup,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { BRAND } from '../constants';
import { UserRole } from '../types';

interface AuthScreenProps {
  isRestricted?: boolean;
  needsVerification?: boolean;
}

const DEFAULT_ADMIN_KEY = 'TIDE-ADMIN-2026-X9FQ';

const AuthScreen: React.FC<AuthScreenProps> = ({ isRestricted, needsVerification }) => {
  const [view, setView] = useState<'SIGN_IN' | 'SIGN_UP' | 'FORGOT_PASSWORD'>('SIGN_IN');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    const savedEmail = localStorage.getItem('tide_remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    let timer: number;
    if (resendCooldown > 0) {
      timer = window.setInterval(() => {
        setResendCooldown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const mapAuthError = (err: any) => {
    switch (err.code) {
      case 'auth/unauthorized-domain':
        return `Domain Error: This domain is not authorized.`;
      case 'auth/invalid-credential':
        return 'Email or password is incorrect';
      case 'auth/email-already-in-use':
        return 'An account already exists with this email.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      case 'auth/user-not-found':
        return 'No account found with this email.';
      default:
        return err.message || 'An error occurred';
    }
  };

  const handleManualCheck = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    setError('');
    setInfo('');
    try {
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        setInfo('Verification confirmed. Synchronizing terminal...');
        window.location.reload();
      } else {
        setError('Verification not detected yet. Please click the link in your email.');
      }
    } catch (err: any) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    
    if (!email.endsWith(BRAND.domain)) {
      setError(`Access restricted to ${BRAND.domain} accounts.`);
      return;
    }

    if (view === 'SIGN_UP' && isAdminMode && !accessCode) {
      setError('Master Access Key is required for Admin registration.');
      return;
    }

    setLoading(true);
    try {
      if (view === 'FORGOT_PASSWORD') {
        await sendPasswordResetEmail(auth, email);
        setInfo('Password reset link sent! Please check your corporate email inbox.');
      } else if (view === 'SIGN_IN') {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await reload(user);
        
        if (rememberMe) localStorage.setItem('tide_remembered_email', email);
        else localStorage.removeItem('tide_remembered_email');

        if (!user.emailVerified) {
          setError('Please verify your email address.');
          setLoading(false);
          return;
        }

        // If trying to sign in as admin, check code
        if (isAdminMode) {
          const codeDoc = await getDoc(doc(db, 'accessCodes', 'master'));
          const masterCode = codeDoc.exists() ? codeDoc.data().code : DEFAULT_ADMIN_KEY;
          if (accessCode === masterCode) {
            await updateDoc(doc(db, 'users', user.uid), { role: UserRole.ADMIN });
          } else {
            setError('Invalid Admin Access Key.');
            setLoading(false);
            return;
          }
        }
      } else if (view === 'SIGN_UP') {
        // Step 1: Preliminary creation to get UID
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const role = isAdminMode ? UserRole.ADMIN : UserRole.STAFF;
        
        if (isAdminMode) {
          // Step 2: Immediate validation of code for Admin Role
          const codeDoc = await getDoc(doc(db, 'accessCodes', 'master'));
          const masterCode = codeDoc.exists() ? codeDoc.data().code : DEFAULT_ADMIN_KEY;
          
          if (accessCode !== masterCode) {
            // Delete the account immediately if they tried to bypass with a wrong code
            await userCredential.user.delete();
            setError('Unauthorized: Invalid Admin Access Key. Account registration aborted.');
            setLoading(false);
            return;
          }
        }

        // Step 3: Persistence of profile
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          role: role,
          displayName: email.split('@')[0],
          createdAt: Date.now(),
          lastActive: Date.now(),
          isOnline: true
        });

        await sendEmailVerification(userCredential.user);
        setInfo('Operator account created! Please verify your email via the link sent.');
        setResendCooldown(60);
        setView('SIGN_IN');
      }
    } catch (err: any) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser || resendCooldown > 0) return;
    setLoading(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setInfo('A new verification link has been sent to your email.');
      setResendCooldown(60);
    } catch (err: any) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (!result.user.email?.endsWith(BRAND.domain)) {
        await signOut(auth);
        setError('Unauthorized domain. Only Tidé Hotel Group accounts permitted.');
      }
    } catch (err: any) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  if (needsVerification) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B1C2D] py-12 px-4 font-inter text-center">
        <div className="w-full max-w-[480px] p-10 rounded-2xl bg-[#13263A]/80 border border-gray-700/40 shadow-2xl backdrop-blur-md space-y-8 mb-8">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-[#C8A862]/10 rounded-full flex items-center justify-center border border-[#C8A862]/30">
              <svg className="w-10 h-10 text-[#C8A862]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white uppercase tracking-tight mb-2">Verify Operator Identity</h2>
            <p className="text-gray-400 text-xs leading-relaxed">
              A verification link was sent to <span className="text-white font-bold">{auth.currentUser?.email}</span>. 
              Please click the link in the email, then return here and click the button below.
            </p>
          </div>
          <div className="bg-[#0B1C2D]/50 border border-[#C8A862]/20 p-4 rounded-xl text-[10px] text-[#C8A862] font-black uppercase tracking-widest leading-relaxed">
            SYSTEM NOTE: Check your <span className="underline">SPAM</span> or <span className="underline">JUNK</span> folder if the link is not in your inbox.
          </div>
          
          <div className="space-y-4">
            <button 
              onClick={handleManualCheck}
              disabled={loading}
              className="w-full py-4 bg-white text-[#0B1C2D] font-black rounded-lg uppercase tracking-[0.2em] text-xs hover:bg-gray-200 transition-all shadow-xl active:scale-[0.98]"
            >
              {loading ? 'Validating Account...' : 'I Have Verified (Check Now)'}
            </button>
            <button 
              onClick={handleResendVerification}
              disabled={loading || resendCooldown > 0}
              className={`w-full py-4 rounded-lg font-black uppercase tracking-[0.2em] text-xs transition-all shadow-xl ${
                resendCooldown > 0 ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-[#C8A862] text-[#0B1C2D] hover:bg-[#B69651]'
              }`}
            >
              {resendCooldown > 0 ? `Resend Link in ${resendCooldown}s` : 'Resend Verification Link'}
            </button>
            <button 
              onClick={() => signOut(auth)}
              className="w-full py-3 border border-gray-700 text-gray-500 font-bold rounded-lg uppercase text-[10px] tracking-widest hover:bg-white/5 transition-all"
            >
              Cancel & Sign Out
            </button>
          </div>

          {error && <p className="text-red-400 text-[11px] font-bold bg-red-900/10 py-2 rounded border border-red-500/20">{error}</p>}
          {info && <p className="text-[#C8A862] text-[11px] font-bold bg-[#C8A862]/10 py-2 rounded border border-[#C8A862]/20">{info}</p>}
        </div>
        <p className="text-[10px] text-gray-600 uppercase tracking-[0.6em] font-bold pb-8">Revenue Terminal v2.9.1</p>
      </div>
    );
  }

  if (isRestricted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B1C2D] py-12 px-4 font-inter text-center">
        <div className="w-full max-w-[480px] p-10 rounded-2xl bg-[#13263A]/80 border border-red-500/20 shadow-2xl backdrop-blur-md space-y-6 mb-8">
          <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Domain Access Denied</h2>
          <p className="text-gray-400 text-xs leading-relaxed">
            The TIDÈ Revenue Terminal is strictly for internal staff. Please sign in with an official <span className="text-[#C8A862]">{BRAND.domain}</span> account.
          </p>
          <button onClick={() => signOut(auth)} className="w-full py-4 bg-[#C8A862] text-[#0B1C2D] font-black rounded-lg uppercase text-xs tracking-widest">Return to Gateway</button>
        </div>
        <p className="text-[10px] text-gray-600 uppercase tracking-[0.6em] font-bold pb-8">Revenue Terminal v2.9.1</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B1C2D] py-12 px-4 font-inter overflow-y-auto">
      <div className="w-full max-w-[480px] p-10 rounded-2xl bg-[#13263A]/80 border border-gray-700/40 shadow-2xl backdrop-blur-md mb-8">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold text-[#C8A862] italic tracking-tight mb-1">TIDÈ</h1>
          <p className="text-[11px] text-gray-500 uppercase tracking-[0.5em] font-medium">Hotels & Resorts</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Corporate Email</label>
            <input 
              type="email" 
              required 
              className="w-full bg-[#0B1C2D]/50 border border-gray-700/50 rounded-lg py-3.5 px-4 text-white focus:outline-none focus:ring-1 focus:ring-[#C8A862]/30 placeholder-gray-600 transition-all font-medium" 
              placeholder="name@tidehotelgroup.com" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
            />
          </div>

          {view !== 'FORGOT_PASSWORD' && (
            <>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Password</label>
                  <button type="button" onClick={() => setView('FORGOT_PASSWORD')} className="text-[10px] text-[#C8A862] hover:underline uppercase font-bold tracking-wider">Forgot Password?</button>
                </div>
                <div className="relative">
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    required 
                    className="w-full bg-[#0B1C2D]/50 border border-gray-700/50 rounded-lg py-3.5 px-4 text-white focus:outline-none focus:ring-1 focus:ring-[#C8A862]/30 transition-all" 
                    placeholder="••••••••" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#C8A862] hover:text-white transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="remember" 
                  className="w-4 h-4 rounded border-gray-700 bg-[#0B1C2D] text-[#C8A862] focus:ring-0 cursor-pointer" 
                  checked={rememberMe} 
                  onChange={(e) => setRememberMe(e.target.checked)} 
                />
                <label htmlFor="remember" className="text-[11px] text-gray-500 uppercase font-bold tracking-widest cursor-pointer select-none">Remember Email</label>
              </div>

              <div className="p-5 bg-[#0B1C2D]/40 border border-gray-700/50 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Request Admin Access</span>
                    <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Master Security Key Required</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setIsAdminMode(!isAdminMode)}
                    className={`w-11 h-6 rounded-full relative transition-colors duration-200 ease-in-out ${isAdminMode ? 'bg-[#C8A862]' : 'bg-gray-700'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200 ${isAdminMode ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                {isAdminMode && (
                  <input 
                    type="password" 
                    required 
                    className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg py-3 px-4 text-white text-center font-mono tracking-[0.3em] focus:outline-none focus:ring-1 focus:ring-[#C8A862]/40" 
                    placeholder="TIDE-XXXX" 
                    value={accessCode} 
                    onChange={(e) => setAccessCode(e.target.value)} 
                  />
                )}
              </div>
            </>
          )}

          {error && <p className="text-red-400 text-[11px] text-center font-bold bg-red-900/10 py-2 rounded border border-red-500/20">{error}</p>}
          {info && <p className="text-[#C8A862] text-[11px] text-center font-bold bg-[#C8A862]/10 py-2 rounded border border-[#C8A862]/20">{info}</p>}

          <button type="submit" disabled={loading} className="w-full py-4 bg-[#C8A862] text-[#0B1C2D] font-black rounded-lg hover:bg-[#B69651] transition-all uppercase tracking-[0.2em] shadow-xl text-xs active:scale-[0.98]">
            {loading ? 'Processing...' : (view === 'SIGN_IN' ? 'Sign In to Terminal' : view === 'SIGN_UP' ? 'Register Operator' : 'Send Reset Link')}
          </button>

          {view === 'FORGOT_PASSWORD' && (
            <button type="button" onClick={() => setView('SIGN_IN')} className="w-full text-center text-gray-400 text-xs font-semibold hover:text-white transition-colors">
              Return to Sign In
            </button>
          )}

          {view !== 'FORGOT_PASSWORD' && (
            <>
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-700/30"></span></div>
                <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest text-gray-500"><span className="bg-[#13263A] px-4">Or continue with</span></div>
              </div>

              <button type="button" onClick={handleGoogleSignIn} disabled={loading} className="w-full py-3.5 flex items-center justify-center gap-3 border border-gray-700 rounded-lg hover:bg-white/5 transition-all text-xs font-bold text-white">
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Corporate Google Sign-In
              </button>

              <div className="text-center pt-4">
                <button type="button" onClick={() => setView(view === 'SIGN_IN' ? 'SIGN_UP' : 'SIGN_IN')} className="text-gray-400 text-xs font-semibold hover:text-[#C8A862] transition-colors tracking-tight">
                  {view === 'SIGN_IN' ? "New terminal operator? Create account" : "Existing operator? Sign in"}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
      <p className="text-[10px] text-gray-600 uppercase tracking-[0.6em] font-bold pb-8">Revenue Terminal v2.9.1</p>
    </div>
  );
};

export default AuthScreen;
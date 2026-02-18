
import React, { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  reload,
  sendPasswordResetEmail,
  signInWithPopup,
  fetchSignInMethodsForEmail
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
    if (needsVerification) {
      setInfo('A verification link has been sent to your email. Please verify your account to continue.');
    }
  }, [needsVerification]);

  useEffect(() => {
    let timer: number;
    if (resendCooldown > 0) {
      timer = window.setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const mapAuthError = (err: any) => {
    console.error("Auth Error Code:", err.code);
    switch (err.code) {
      case 'auth/unauthorized-domain':
        return `Domain Error: This domain (${window.location.hostname}) is not authorized.`;
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Email or password is incorrect';
      case 'auth/email-already-in-use':
        return 'An account already exists with this email. Please login using your original sign-up method.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in popup was closed before completion.';
      default:
        return err.message || 'An error occurred during authentication';
    }
  };

  const verifyAccessKey = async () => {
    try {
      const codeDoc = await getDoc(doc(db, 'accessCodes', 'master'));
      const masterCode = codeDoc.exists() ? codeDoc.data().code : DEFAULT_ADMIN_KEY;
      return accessCode === masterCode;
    } catch (e) {
      return accessCode === DEFAULT_ADMIN_KEY;
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      // Check if user exists with password first
      const providers = await fetchSignInMethodsForEmail(auth, email);
      if (providers.includes('password')) {
        setError('An account already exists with this email. Please login using your original sign-up method.');
        setLoading(false);
        return;
      }

      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      if (!user.email?.endsWith(BRAND.domain)) {
        await signOut(auth);
        setError(`Access denied. Please use your ${BRAND.domain} corporate account.`);
        return;
      }

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          role: UserRole.STAFF,
          displayName: user.displayName || user.email.split('@')[0],
          createdAt: Date.now(),
          isOnline: true,
          lastActive: Date.now()
        });
      }
    } catch (err: any) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const checkVerificationStatus = async () => {
    if (auth.currentUser) {
      setError('');
      setLoading(true);
      try {
        await reload(auth.currentUser);
        if (auth.currentUser.emailVerified) {
          setInfo('Email verified successfully.');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          setError('Email not verified. Please check your inbox and verify your email.');
        }
      } catch (err: any) {
        setError(mapAuthError(err));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setInfo('Password reset link sent! Please check your inbox.');
      setView('SIGN_IN');
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
      setError(`Access restricted. Use an ${BRAND.domain} corporate email.`);
      return;
    }

    setLoading(true);
    try {
      if (isAdminMode) {
        const isValid = await verifyAccessKey();
        if (!isValid) {
          setError('Invalid Admin Access Code. Access Denied.');
          setLoading(false);
          return;
        }
      }

      if (view === 'SIGN_IN') {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await reload(user);
        
        if (rememberMe) {
          localStorage.setItem('tide_remembered_email', email);
        } else {
          localStorage.removeItem('tide_remembered_email');
        }

        if (!user.emailVerified) {
          setError('Please verify your email address before logging in.');
          setLoading(false);
          return;
        }

        if (isAdminMode) {
           const userRef = doc(db, 'users', user.uid);
           const snap = await getDoc(userRef);
           if (snap.exists() && snap.data().role !== UserRole.ADMIN) {
              await updateDoc(userRef, { role: UserRole.ADMIN });
           }
        }
      } else if (view === 'SIGN_UP') {
        // Check if exists with google first
        const providers = await fetchSignInMethodsForEmail(auth, email);
        if (providers.includes('google.com')) {
          setError('An account already exists with this email. Please login using your original sign-up method.');
          setLoading(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          role: isAdminMode ? UserRole.ADMIN : UserRole.STAFF,
          displayName: user.email?.split('@')[0] || 'User',
          createdAt: Date.now(),
          isOnline: true,
          lastActive: Date.now()
        });

        await sendEmailVerification(user);
        setInfo('Account created! A verification email has been sent to ' + email + '.');
        setView('SIGN_IN');
        setIsAdminMode(false);
        setLoading(false);
      }
    } catch (err: any) {
      setError(mapAuthError(err));
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (auth.currentUser) {
      setError('');
      setInfo('');
      setLoading(true);
      try {
        await sendEmailVerification(auth.currentUser);
        setInfo('Verification email resent. Please check your inbox.');
        setResendCooldown(60);
      } catch (err: any) {
        setError(mapAuthError(err));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleLogout = () => {
    setError('');
    setInfo('');
    signOut(auth);
  };

  if (isRestricted) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0B1C2D] px-4">
        <div className="max-w-md w-full p-8 rounded-xl bg-[#13263A] border border-[#C8A862]/20 shadow-2xl text-center">
          <h1 className="text-3xl font-bold mb-4 text-[#C8A862] italic tracking-widest">TIDÈ HOTELS</h1>
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-200">
            Access denied. Domain unauthorized. Please use your <strong>{BRAND.domain}</strong> account.
          </div>
          <button onClick={handleLogout} className="w-full py-3 px-4 bg-gray-600 hover:bg-gray-500 transition-colors rounded-lg font-semibold text-white">Return to Login</button>
        </div>
      </div>
    );
  }

  if (needsVerification && auth.currentUser) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0B1C2D] px-4">
        <div className="max-w-md w-full p-8 rounded-xl bg-[#13263A] border border-[#C8A862]/20 shadow-2xl text-center">
          <h1 className="text-3xl font-bold mb-4 text-[#C8A862] italic tracking-widest">TIDÈ HOTELS</h1>
          <h2 className="text-xl font-bold text-white mb-4">Verify Your Email</h2>
          <p className="text-gray-400 mb-6">{info || 'Please check your inbox for a verification link.'}</p>
          <div className="space-y-4">
            <button 
              onClick={checkVerificationStatus} 
              disabled={loading} 
              className="w-full py-3 px-4 bg-[#C8A862] hover:bg-[#B69651] transition-all rounded-lg font-semibold text-[#0B1C2D] disabled:opacity-50"
            >
              {loading ? 'Checking Status...' : 'I have verified my email'}
            </button>
            <button onClick={handleResend} disabled={resendCooldown > 0} className="w-full py-3 px-4 border border-[#C8A862]/30 text-[#C8A862] hover:bg-[#C8A862]/10 transition-all rounded-lg font-semibold disabled:opacity-50">{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Verification Email'}</button>
            <button onClick={handleLogout} className="w-full py-2 text-gray-500 hover:text-gray-400 text-sm">Sign Out</button>
          </div>
          {error && <p className="mt-4 text-red-400 text-sm bg-red-900/20 p-2 rounded">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#0B1C2D] px-4 overflow-y-auto py-10">
      <div className="max-w-md w-full p-8 rounded-xl bg-[#13263A] border border-[#C8A862]/20 shadow-2xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-[#C8A862] italic tracking-tighter">TIDÈ</h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em]">Hotels & Resorts</p>
        </div>

        {view === 'FORGOT_PASSWORD' ? (
          <form onSubmit={handleForgotPassword} className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-xl font-bold text-white text-center">Reset Password</h2>
            <p className="text-xs text-gray-400 text-center">Enter your corporate email to receive a recovery link.</p>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Corporate Email</label>
              <input type="email" required className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#C8A862]" placeholder={`name${BRAND.domain}`} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button type="submit" disabled={loading} className="w-full py-4 bg-[#C8A862] text-[#0B1C2D] font-bold rounded-lg hover:bg-[#B69651] transition-all uppercase tracking-widest">{loading ? 'Sending...' : 'Send Recovery Link'}</button>
            <button type="button" onClick={() => setView('SIGN_IN')} className="w-full text-center text-gray-400 text-sm hover:underline">Back to Sign In</button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Corporate Email</label>
              <input type="email" required className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#C8A862]" placeholder={`name${BRAND.domain}`} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Password</label>
                {view === 'SIGN_IN' && (
                  <button type="button" onClick={() => setView('FORGOT_PASSWORD')} className="text-[10px] text-[#C8A862] hover:underline uppercase font-bold">Forgot Password?</button>
                )}
              </div>
              <div className="relative">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  required 
                  className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#C8A862]" 
                  placeholder="••••••••" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"></path></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="remember" 
                className="w-4 h-4 rounded border-gray-700 bg-[#0B1C2D] text-[#C8A862] focus:ring-[#C8A862]"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label htmlFor="remember" className="text-xs text-gray-500 uppercase font-bold cursor-pointer select-none">Remember Email</label>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between p-3 bg-[#0B1C2D]/50 border border-gray-700 rounded-lg group cursor-pointer" onClick={() => setIsAdminMode(!isAdminMode)}>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Admin Access Mode</span>
                  <span className="text-[10px] text-gray-500">Master Access Key Required</span>
                </div>
                <div className={`w-10 h-5 rounded-full relative transition-colors ${isAdminMode ? 'bg-[#C8A862]' : 'bg-gray-700'}`}>
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isAdminMode ? 'left-6' : 'left-1'}`} />
                </div>
              </div>

              {isAdminMode && (
                <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Master Admin Key</label>
                  <input 
                    type="password" 
                    required 
                    className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#C8A862] font-mono tracking-widest text-center" 
                    placeholder="TIDE-XXXX-XXXX-XXXX" 
                    value={accessCode} 
                    onChange={(e) => setAccessCode(e.target.value)} 
                  />
                </div>
              )}
            </div>

            {error && <p className="text-red-400 text-xs bg-red-900/10 p-2 rounded border border-red-500/20">{error}</p>}
            {info && <p className="text-blue-400 text-xs bg-blue-900/10 p-2 rounded border border-blue-500/20">{info}</p>}

            <button type="submit" disabled={loading} className="w-full py-4 bg-[#C8A862] text-[#0B1C2D] font-bold rounded-lg hover:bg-[#B69651] transition-all uppercase tracking-widest shadow-lg disabled:opacity-50">
              {loading ? 'Authenticating...' : (view === 'SIGN_IN' ? 'Sign In to Terminal' : 'Register Terminal User')}
            </button>

            {view === 'SIGN_IN' && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-700"></span></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#13263A] px-2 text-gray-500 font-bold">Or continue with</span></div>
                </div>

                <button type="button" onClick={handleGoogleSignIn} disabled={loading} className="w-full py-3 flex items-center justify-center gap-3 border border-gray-700 rounded-lg hover:bg-white/5 transition-all text-sm font-semibold text-white disabled:opacity-50">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Corporate Google Sign-In
                </button>
              </>
            )}
          </form>
        )}

        <div className="mt-8 text-center">
          <button onClick={() => { setView(view === 'SIGN_IN' ? 'SIGN_UP' : 'SIGN_IN'); setError(''); setInfo(''); }} className="text-gray-400 text-sm hover:text-[#C8A862] transition-colors">
            {view === 'SIGN_IN' ? "New terminal operator? Create account" : "Existing operator? Sign In"}
          </button>
        </div>
      </div>
      <p className="mt-10 text-[10px] text-gray-600 uppercase tracking-[0.5em] font-bold">Revenue Terminal v2.9.1</p>
    </div>
  );
};

export default AuthScreen;

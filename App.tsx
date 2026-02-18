
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, setDoc, getDoc, terminate, clearIndexedDbPersistence } from 'firebase/firestore';
import { auth, db } from './firebase';
import AuthScreen from './components/AuthScreen';
import Dashboard from './components/Dashboard';
import Sidebar from './components/Sidebar';
import AdminPanel from './components/AdminPanel';
import { UserProfile, UserRole } from './types';
import { BRAND } from './constants';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeView, setActiveView] = useState<'LEDGER' | 'ADMIN'>('LEDGER');
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  const handleForceReset = useCallback(async () => {
    try {
      setLoading(true);
      await signOut(auth);
      try {
        await terminate(db);
        await clearIndexedDbPersistence(db);
      } catch (e) { console.warn(e); }
      localStorage.clear();
      window.location.reload();
    } catch (err) {
      window.location.href = window.location.origin;
    }
  }, []);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    let isMounted = true;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;
      if (unsubProfile) unsubProfile();
      
      setUser(currentUser);
      setSyncError(null);

      if (currentUser) {
        setLoading(true);
        const userRef = doc(db, 'users', currentUser.uid);

        // Fail-safe: Resolve profile immediately using getDoc
        try {
          const snap = await getDoc(userRef);
          let data: any;

          if (!snap.exists()) {
            data = {
              uid: currentUser.uid,
              email: currentUser.email,
              role: UserRole.STAFF,
              isOnline: true,
              lastActive: Date.now(),
              createdAt: Date.now(),
              displayName: currentUser.email?.split('@')[0] || 'Operator'
            };
            await setDoc(userRef, data);
          } else {
            data = snap.data();
          }

          if (isMounted) {
            setUserProfile({
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: data.displayName || 'Operator',
              role: (data.role as UserRole) || UserRole.STAFF,
              domainVerified: currentUser.email?.endsWith(BRAND.domain) || false,
              isOnline: true,
              lastActive: Date.now()
            });
            setLoading(false);
          }

          // Start Real-time sync in background
          unsubProfile = onSnapshot(userRef, (s) => {
            if (s.exists() && isMounted) {
              const d = s.data();
              setUserProfile(prev => prev ? ({ ...prev, role: d.role as UserRole, displayName: d.displayName }) : null);
            }
          });
        } catch (err: any) {
          console.error("Sync Error:", err);
          if (isMounted) {
            setSyncError(err.message || "Network Error");
            setLoading(false);
          }
        }
      } else {
        if (isMounted) {
          setUserProfile(null);
          setIsAdminAuthorized(false);
          setLoading(false);
        }
      }
    });

    return () => { 
      isMounted = false; 
      unsubscribeAuth(); 
      if (unsubProfile) unsubProfile(); 
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1C2D]">
        <div className="flex flex-col items-center gap-8">
          <div className="text-[#C8A862] animate-pulse text-4xl font-black italic tracking-tighter">TIDÈ HOTELS</div>
          <div className="w-64 h-1 bg-gray-800 rounded-full relative overflow-hidden">
            <div className="absolute top-0 left-0 h-full bg-[#C8A862] animate-progress w-2/3"></div>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[#C8A862] uppercase tracking-[0.5em] font-bold">Initializing Revenue Module</p>
          </div>
          <button onClick={handleForceReset} className="mt-8 text-[9px] text-gray-700 hover:text-white uppercase tracking-widest font-bold border-b border-gray-900 transition-all py-1">System Reset</button>
        </div>
      </div>
    );
  }

  if (!user) return <AuthScreen />;
  if (syncError || (!userProfile && user)) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1C2D]">
        <div className="max-w-md w-full p-10 bg-[#13263A] rounded-3xl border border-red-500/20 text-center space-y-6">
          <h2 className="text-xl font-bold text-white uppercase">Sync Failure</h2>
          <p className="text-gray-400 text-xs">{syncError || "Terminal disconnected"}</p>
          <button onClick={() => window.location.reload()} className="w-full py-4 bg-[#C8A862] text-[#0B1C2D] font-bold rounded-xl uppercase text-xs tracking-widest">Retry Connection</button>
        </div>
      </div>
    );
  }

  if (userProfile && !userProfile.domainVerified) return <AuthScreen isRestricted={true} />;
  if (user && !user.emailVerified) return <AuthScreen needsVerification={true} />;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B1C2D] text-white">
      <Sidebar user={userProfile!} activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        {activeView === 'LEDGER' ? <Dashboard user={userProfile!} /> : <AdminPanel user={userProfile!} isAuthorized={isAdminAuthorized} onAuthorize={() => setIsAdminAuthorized(true)} />}
      </main>
    </div>
  );
};

export default App;

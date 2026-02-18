
import React, { useState, useEffect, useCallback } from 'react';
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
      // Clean up Firestore state if possible
      try {
        await terminate(db);
        await clearIndexedDbPersistence(db);
      } catch (e) {
        console.warn("Firestore cleanup skipped:", e);
      }
      localStorage.clear();
      window.location.reload();
    } catch (err) {
      console.error("Reset failed:", err);
      window.location.href = window.location.origin;
    }
  }, []);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    let isMounted = true;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;
      
      // Cleanup previous listeners
      if (unsubProfile) unsubProfile();
      setSyncError(null);
      setUser(currentUser);
      
      if (currentUser) {
        setLoading(true);
        const userRef = doc(db, 'users', currentUser.uid);
        
        try {
          // 1. FAST TRACK RESOLUTION: Get the document once immediately
          const snap = await getDoc(userRef);
          let profileData: any;

          if (!snap.exists()) {
            // Initial creation if missing
            profileData = {
              uid: currentUser.uid,
              email: currentUser.email,
              role: UserRole.STAFF,
              isOnline: true,
              lastActive: Date.now(),
              createdAt: Date.now(),
              displayName: currentUser.email?.split('@')[0] || 'Operator'
            };
            await setDoc(userRef, profileData);
          } else {
            profileData = snap.data();
            // Update presence
            await updateDoc(userRef, {
              isOnline: true,
              lastActive: Date.now()
            }).catch(e => console.warn("Presence update ignored:", e));
          }

          if (isMounted) {
            const isVerified = currentUser.email?.endsWith(BRAND.domain) || false;
            setUserProfile({
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: profileData.displayName || currentUser.email?.split('@')[0] || 'User',
              role: (profileData.role as UserRole) || UserRole.STAFF,
              domainVerified: isVerified,
              isOnline: true,
              lastActive: Date.now()
            });
            
            // Finish loading early as we have the data
            setLoading(false);
          }

          // 2. BACKGROUND UPDATES: Start the real-time listener
          unsubProfile = onSnapshot(userRef, (snapshot) => {
            if (snapshot.exists() && isMounted) {
              const data = snapshot.data();
              setUserProfile(prev => prev ? ({
                ...prev,
                displayName: data.displayName || prev.displayName,
                role: (data.role as UserRole) || prev.role,
                isOnline: data.isOnline,
                lastActive: data.lastActive
              }) : null);
            }
          }, (err) => {
            // Transient WebChannel errors are common; only kill if catastrophic
            if (err.code === 'permission-denied') {
              console.error("Firestore Permission Denied:", err);
              if (loading) {
                setSyncError("Access Denied: Terminal not authorized.");
                setLoading(false);
              }
            } else {
              console.warn("Firestore Listener Transient Error (retrying...):", err.message);
            }
          });

        } catch (err: any) {
          console.error("Profile resolution failed:", err);
          if (isMounted) {
            setSyncError(err.message || "Unknown synchronization error");
            setLoading(false);
          }
        }
      } else {
        // Logged out state
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

  // 1. Initial Connection Loading
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1C2D]">
        <div className="flex flex-col items-center gap-6">
          <div className="text-[#C8A862] animate-pulse text-3xl font-black italic tracking-tighter">TIDÈ HOTELS</div>
          <div className="w-64 h-1 bg-gray-800 rounded-full relative overflow-hidden">
            <div className="absolute top-0 left-0 h-full bg-[#C8A862] animate-progress w-1/2"></div>
          </div>
          <div className="text-center space-y-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] font-bold">Establishing Secure Terminal Connection</p>
            <p className="text-[8px] text-gray-700 uppercase tracking-widest animate-pulse">Checking Firestore Node Status...</p>
          </div>
          <button 
            onClick={handleForceReset}
            className="mt-12 text-[9px] text-gray-600 hover:text-red-400 uppercase tracking-widest font-bold border-b border-gray-800 hover:border-red-400 transition-all py-1"
          >
            Bypass Connection / Force Reset
          </button>
        </div>
      </div>
    );
  }

  // 2. Auth Screen (No User)
  if (!user) {
    return <AuthScreen />;
  }

  // 3. Sync Failure Screen
  if (syncError || (!userProfile && user)) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1C2D] p-6">
        <div className="max-w-md w-full p-10 bg-[#13263A] rounded-3xl border border-red-500/30 shadow-2xl text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2 uppercase tracking-tight">Terminal Sync Failure</h2>
          <p className="text-gray-400 text-xs mb-8 leading-relaxed">
            The terminal was unable to synchronize your profile data with the central revenue database.
            <br/><br/>
            <span className="text-[10px] text-red-400/70 font-mono bg-black/20 p-2 rounded block">
              Error Code: {syncError || "PROFILE_NOT_INITIALIZED"}
            </span>
          </p>
          <div className="space-y-3">
            <button 
              onClick={() => window.location.reload()} 
              className="w-full py-3 bg-[#C8A862] text-[#0B1C2D] font-black rounded-xl uppercase text-xs tracking-widest hover:bg-[#B69651] transition-all shadow-lg"
            >
              Retry Database Connection
            </button>
            <button 
              onClick={handleForceReset} 
              className="w-full py-3 border border-gray-700 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl uppercase text-[10px] font-bold tracking-widest transition-all"
            >
              Logout & Clear Cache
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Verification & Domain Guards
  if (userProfile && !userProfile.domainVerified) {
    return <AuthScreen isRestricted={true} />;
  }

  if (user && !user.emailVerified) {
    return <AuthScreen needsVerification={true} />;
  }

  // 5. Main Application Logic
  return (
    <div className="flex h-screen overflow-hidden bg-[#0B1C2D] text-white">
      <Sidebar 
        user={userProfile!} 
        activeView={activeView} 
        onViewChange={(view) => setActiveView(view)}
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        {activeView === 'LEDGER' ? (
          <Dashboard user={userProfile!} />
        ) : (
          <AdminPanel 
            user={userProfile!} 
            isAuthorized={isAdminAuthorized}
            onAuthorize={() => setIsAdminAuthorized(true)}
          />
        )}
      </main>
    </div>
  );
};

export default App;

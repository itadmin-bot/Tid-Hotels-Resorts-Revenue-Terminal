
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, setDoc, getDoc } from 'firebase/firestore';
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

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    let loadingTimeout: number;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      // Clear any existing listeners
      if (unsubProfile) unsubProfile();
      clearTimeout(loadingTimeout);

      setUser(currentUser);
      
      if (currentUser) {
        setLoading(true);
        const userRef = doc(db, 'users', currentUser.uid);
        
        // Safety timeout: If profile doesn't resolve in 8s, stop loading
        loadingTimeout = window.setTimeout(() => {
          if (loading) {
            console.warn("Profile resolution timed out.");
            setLoading(false);
          }
        }, 8000);

        try {
          // 1. Ensure document exists (Initial creation if needed)
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
             await setDoc(userRef, {
               uid: currentUser.uid,
               email: currentUser.email,
               role: UserRole.STAFF,
               isOnline: true,
               lastActive: Date.now(),
               createdAt: Date.now(),
               displayName: currentUser.email?.split('@')[0] || 'Operator'
             });
          } else {
             await updateDoc(userRef, {
               isOnline: true,
               lastActive: Date.now()
             }).catch(e => console.error("Presence update failed:", e));
          }

          // 2. Start real-time listener
          unsubProfile = onSnapshot(userRef, (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              const isVerified = currentUser.email?.endsWith(BRAND.domain) || false;
              
              setUserProfile({
                uid: currentUser.uid,
                email: currentUser.email || '',
                displayName: data.displayName || currentUser.email?.split('@')[0] || 'User',
                role: (data.role as UserRole) || UserRole.STAFF,
                domainVerified: isVerified,
                isOnline: data.isOnline,
                lastActive: data.lastActive
              });
            }
            setLoading(false);
          }, (error) => {
            console.error("Profile Subscription Error:", error);
            setLoading(false);
          });
        } catch (e) {
          console.error("Auth initialization error:", e);
          setLoading(false);
        }
      } else {
        // Handle Logout
        setUserProfile(null);
        setIsAdminAuthorized(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubProfile) unsubProfile();
      clearTimeout(loadingTimeout);
    };
  }, []);

  const handleForceReset = () => {
    signOut(auth).then(() => {
      localStorage.clear();
      window.location.reload();
    });
  };

  // 1. Permanent Loading State while resolving
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1C2D]">
        <div className="flex flex-col items-center gap-4">
          <div className="text-[#C8A862] animate-pulse text-2xl font-bold italic tracking-widest uppercase">TIDÈ HOTELS</div>
          <div className="w-48 h-1 bg-gray-800 rounded-full relative overflow-hidden">
            <div className="absolute top-0 left-0 h-full bg-[#C8A862] animate-progress w-1/2"></div>
          </div>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Securing Terminal Connection...</p>
          <button 
            onClick={handleForceReset}
            className="mt-10 text-[9px] text-gray-600 hover:text-red-400 uppercase tracking-widest font-bold border-b border-gray-800 hover:border-red-400 transition-all"
          >
            Force Reset Session
          </button>
        </div>
      </div>
    );
  }

  // 2. Auth Guard
  if (!user) {
    return <AuthScreen />;
  }

  // 3. Profile Guard - Fallback if loading finished but userProfile is still null
  if (!userProfile) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1C2D]">
        <div className="text-center p-8 bg-[#13263A] rounded-2xl border border-red-500/20 shadow-2xl">
          <p className="text-red-400 text-sm font-bold mb-4 uppercase tracking-widest">Session Synchronization Failure</p>
          <p className="text-gray-400 text-xs mb-6 max-w-xs mx-auto">We couldn't retrieve your terminal profile. This may be due to poor connectivity or unauthorized access.</p>
          <div className="flex flex-col gap-3">
            <button onClick={() => window.location.reload()} className="px-6 py-2 bg-[#C8A862] text-[#0B1C2D] font-bold rounded uppercase text-xs">Retry Connection</button>
            <button onClick={handleForceReset} className="text-[10px] text-gray-500 hover:text-white uppercase underline">Logout & Start Fresh</button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Domain Restrictions
  if (!userProfile.domainVerified) {
    return <AuthScreen isRestricted={true} />;
  }

  // 5. Verification Guard
  if (!user.emailVerified) {
    return <AuthScreen needsVerification={true} />;
  }

  // 6. Main Application Shell
  return (
    <div className="flex h-screen overflow-hidden bg-[#0B1C2D] text-white">
      <Sidebar 
        user={userProfile} 
        activeView={activeView} 
        onViewChange={(view) => setActiveView(view)}
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        {activeView === 'LEDGER' ? (
          <Dashboard user={userProfile} />
        ) : (
          <AdminPanel 
            user={userProfile} 
            isAuthorized={isAdminAuthorized}
            onAuthorize={() => setIsAdminAuthorized(true)}
          />
        )}
      </main>
    </div>
  );
};

export default App;

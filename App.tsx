
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
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

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        setLoading(true);
        const userRef = doc(db, 'users', currentUser.uid);
        
        try {
          // Attempt to initialize/mark user as online
          await setDoc(userRef, {
            uid: currentUser.uid,
            email: currentUser.email,
            isOnline: true,
            lastActive: Date.now()
          }, { merge: true });
        } catch (e) {
          console.error("Firestore Init Error:", e);
        }

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
            // Only stop loading once we have the profile data
            setLoading(false);
          } else {
            // Profile doc doesn't exist yet, but we are logged in
            // This can happen briefly during account creation
            setLoading(false);
          }
        }, (error) => {
          console.error("Profile Subscription Error:", error);
          setLoading(false);
        });
      } else {
        // Logged out
        if (userProfile?.uid) {
          updateDoc(doc(db, 'users', userProfile.uid), { isOnline: false }).catch(() => {});
        }
        setUserProfile(null);
        setIsAdminAuthorized(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

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
        </div>
      </div>
    );
  }

  // 2. Auth Guard
  if (!user) {
    return <AuthScreen />;
  }

  // 3. Profile Guard - if we have a user but Firestore hasn't returned a profile yet
  if (!userProfile) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1C2D]">
        <div className="text-center">
          <p className="text-[#C8A862] text-sm animate-pulse mb-4">INITIALIZING PROFILE...</p>
          <button onClick={() => window.location.reload()} className="text-[10px] text-gray-500 hover:text-white uppercase underline">Click here if stuck</button>
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

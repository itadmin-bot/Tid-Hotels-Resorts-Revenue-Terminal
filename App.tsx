
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
        
        // Ensure profile exists and mark as online
        try {
          await updateDoc(userRef, {
            isOnline: true,
            lastActive: Date.now()
          }).catch(async () => {
            // If update fails, document might not exist, create it
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: currentUser.email,
              role: UserRole.STAFF,
              isOnline: true,
              lastActive: Date.now(),
              createdAt: Date.now(),
              displayName: currentUser.email?.split('@')[0] || 'Operator'
            }, { merge: true });
          });
        } catch (e) {
          console.error("Error updating user status:", e);
        }

        unsubProfile = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            const isVerified = currentUser.email?.endsWith(BRAND.domain) || false;
            
            setUserProfile({
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: data.displayName || currentUser.email?.split('@')[0] || 'User',
              role: data.role as UserRole,
              domainVerified: isVerified,
              isOnline: data.isOnline,
              lastActive: data.lastActive
            });
          }
          setLoading(false);
        });
      } else {
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

  // Show loading while auth is resolving OR if user is logged in but profile isn't loaded yet
  if (loading || (user && !userProfile)) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1C2D]">
        <div className="flex flex-col items-center gap-4">
          <div className="text-[#C8A862] animate-pulse text-2xl font-bold italic tracking-widest uppercase">TIDÈ HOTELS</div>
          <div className="w-48 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-[#C8A862] animate-[progress_2s_ease-in-out_infinite]" style={{ width: '30%' }}></div>
          </div>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Establishing Secure Connection...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (userProfile && !userProfile.domainVerified) {
    return <AuthScreen isRestricted={true} />;
  }

  if (user && !user.emailVerified) {
    return <AuthScreen needsVerification={true} />;
  }

  // Safety check to prevent .role error
  if (!userProfile) {
    return <AuthScreen />;
  }

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

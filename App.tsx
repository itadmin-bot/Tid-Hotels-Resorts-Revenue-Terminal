import React, { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, User, signOut, reload } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, setDoc, terminate, clearIndexedDbPersistence } from 'firebase/firestore';
import { auth, db } from '@/firebase';
import AuthScreen from '@/components/AuthScreen';
import Dashboard from '@/components/Dashboard';
import Sidebar from '@/components/Sidebar';
import AdminPanel from '@/components/AdminPanel';
import { UserProfile, UserRole, AppSettings, TaxConfig } from '@/types';
import { BRAND, ZENZA_BANK, WHISPERS_BANK, INVOICE_BANKS } from '@/constants';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeView, setActiveView] = useState<'LEDGER' | 'ADMIN'>('LEDGER');
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  
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

  // Verification Polling
  useEffect(() => {
    let interval: number;
    if (user && !user.emailVerified) {
      interval = window.setInterval(async () => {
        try {
          await reload(user);
          if (user.emailVerified) {
            setIsVerified(true);
            clearInterval(interval);
          }
        } catch (e) {
          console.error("Verification poll error:", e);
        }
      }, 3000);
    } else if (user?.emailVerified) {
      setIsVerified(true);
    }
    return () => clearInterval(interval);
  }, [user]);

  // Real-time Settings Listener
  useEffect(() => {
    if (!user) {
      setSettings(null);
      return;
    }

    let isSubscribed = true;
    const unsubSettings = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (!isSubscribed) return;
      if (snapshot.exists()) {
        const data = snapshot.data();
        const defaultTaxes: TaxConfig[] = [
          { id: 'vat', name: 'VAT', rate: 0.075, type: 'VAT', visibleOnReceipt: true },
          { id: 'sc', name: 'Service Charge', rate: 0.10, type: 'SC', visibleOnReceipt: false }
        ];

        const updatedSettings: AppSettings = {
          hotelName: data.hotelName || BRAND.name,
          hotelSubName: data.hotelSubName || 'Hotels & Resorts',
          hotelAddress: data.hotelAddress || BRAND.address,
          vat: data.vat || 0.075,
          serviceCharge: data.serviceCharge || 0.10,
          isTaxInclusive: data.isTaxInclusive ?? true,
          taxes: data.taxes || defaultTaxes,
          zenzaBanks: data.zenzaBanks || [ZENZA_BANK],
          whispersBanks: data.whispersBanks || [WHISPERS_BANK],
          invoiceBanks: data.invoiceBanks || INVOICE_BANKS
        };
        setSettings(updatedSettings);
        document.title = `${updatedSettings.hotelName} - Revenue Terminal`;
      }
    }, (err) => {
      console.error("Settings snapshot listener error:", err);
      if (err.code === 'permission-denied') {
        console.warn("Settings access restricted for current user role");
      }
    });

    return () => {
      isSubscribed = false;
      unsubSettings();
    };
  }, [user]);

  // Real-time Presence Heartbeat (Immediate Login Timestamp)
  useEffect(() => {
    if (!user || !isVerified || !userProfile?.domainVerified) return;

    const userRef = doc(db, 'users', user.uid);
    const now = Date.now();

    // Ensure session start is captured immediately for the live terminal list
    const sessionData: any = { 
      isOnline: true, 
      lastActive: now
    };
    
    // Set onlineSince if it's missing or from a significantly older session
    if (!userProfile?.onlineSince || (now - userProfile.onlineSince > 12 * 60 * 60 * 1000)) {
      sessionData.onlineSince = now;
    }

    updateDoc(userRef, sessionData).catch(err => {
      console.warn("Presence heartbeat initialization failed:", err);
    });

    // Periodic heartbeat every 30 seconds to maintain "Live Now" status
    const heartbeatInterval = window.setInterval(() => {
      updateDoc(userRef, { isOnline: true, lastActive: Date.now() }).catch(console.warn);
    }, 30000);

    const handleUnload = () => {
      updateDoc(userRef, { isOnline: false, lastActive: Date.now() }).catch(console.warn);
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleUnload);
      handleUnload();
    };
  }, [user, isVerified, userProfile?.uid, userProfile?.domainVerified]);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    let isMounted = true;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;
      
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = undefined;
      }
      
      setUser(currentUser);
      setSyncError(null);

      if (currentUser) {
        setLoading(true);
        const userRef = doc(db, 'users', currentUser.uid);

        try {
          unsubProfile = onSnapshot(userRef, async (snapshot) => {
            if (!isMounted) return;

            if (!snapshot.exists()) {
              const initialData = {
                uid: currentUser.uid,
                email: currentUser.email,
                role: UserRole.STAFF,
                isOnline: true,
                lastActive: Date.now(),
                onlineSince: Date.now(),
                createdAt: Date.now(),
                displayName: currentUser.email?.split('@')[0] || 'Operator'
              };
              try {
                await setDoc(userRef, initialData);
              } catch (err: any) {
                console.error("Profile Creation Error:", err);
                if (isMounted) {
                  setSyncError("Terminal Access Denied");
                  setLoading(false);
                }
              }
            } else {
              const data = snapshot.data();
              if (isMounted) {
                setUserProfile({
                  uid: currentUser.uid,
                  email: currentUser.email || '',
                  displayName: data.displayName || 'Operator',
                  role: (data.role as UserRole) || UserRole.STAFF,
                  domainVerified: currentUser.email?.endsWith(BRAND.domain) || false,
                  isOnline: data.isOnline ?? false,
                  lastActive: data.lastActive || Date.now(),
                  onlineSince: data.onlineSince || data.lastActive || Date.now(),
                  createdAt: data.createdAt || data.lastActive || Date.now()
                } as UserProfile);
                setLoading(false);
              }
            }
          }, (err) => {
            console.error("Profile Listener Error:", err);
            if (isMounted) {
              // If it's a transient error, we might not want to show a hard error screen immediately
              // but for profile, it's critical.
              setSyncError("Terminal Connection Lost - Retrying...");
              // Attempt to recover loading state if it was critical
              setLoading(false);
            }
          });
        } catch (err) {
          console.error("Failed to setup profile listener:", err);
          if (isMounted) {
            setSyncError("Failed to initialize terminal");
            setLoading(false);
          }
        }
      } else {
        if (isMounted) {
          setUserProfile(null);
          setIsAdminAuthorized(false);
          setLoading(false);
          setIsVerified(false);
        }
      }
    }, (err) => {
      console.error("Auth state change error:", err);
      if (isMounted) {
        setSyncError("Authentication Service Error");
        setLoading(false);
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
          <div className="text-center">
            <div className="text-[#C8A862] animate-pulse text-4xl font-black italic tracking-tighter uppercase">{settings?.hotelName || BRAND.name}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-[0.4em] font-bold mt-1">{settings?.hotelSubName || 'Hotels & Resorts'}</div>
          </div>
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
  if (user && !isVerified) return <AuthScreen needsVerification={true} />;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B1C2D] text-white">
      <Sidebar user={userProfile!} settings={settings} activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        {activeView === 'LEDGER' ? <Dashboard user={userProfile!} /> : <AdminPanel user={userProfile!} isAuthorized={isAdminAuthorized} onAuthorize={() => setIsAdminAuthorized(true)} />}
      </main>
    </div>
  );
};

export default App;
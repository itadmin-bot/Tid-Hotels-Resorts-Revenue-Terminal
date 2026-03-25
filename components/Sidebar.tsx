import React from 'react';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/firebase';
import { UserProfile, UserRole, AppSettings } from '@/types';
import { BRAND } from '@/constants';
import { LayoutDashboard, Settings, LogOut, X, Clock, User, Utensils } from 'lucide-react';

interface SidebarProps {
  user: UserProfile;
  settings: AppSettings | null;
  activeView: 'DASHBOARD' | 'ADMIN';
  onViewChange: (view: 'DASHBOARD' | 'ADMIN') => void;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ user, settings, activeView, onViewChange, isOpen, onClose }) => {
  const handleSignOut = async () => {
    try {
      // Explicitly mark operator as offline before session termination
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { 
        isOnline: false, 
        lastActive: Date.now() 
      }).catch(console.warn);
      
      await signOut(auth);
    } catch (err) {
      console.error("Logout Error:", err);
      // Fallback sign out if doc update fails
      await signOut(auth);
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50 no-print"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        flex flex-col w-64 bg-[#13263A] border-r border-gray-700/50 p-6 no-print
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-bold text-[#C8A862] italic tracking-tighter uppercase truncate">
              {settings?.hotelName || BRAND.name}
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">
              {settings?.hotelSubName || 'Hotels & Resorts'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="lg:hidden p-2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

      <nav className="flex-1 space-y-2">
        <button 
          onClick={() => onViewChange('DASHBOARD')}
          className={`w-full flex items-center gap-3 px-4 py-3 font-bold rounded-lg transition-all ${
            activeView === 'DASHBOARD' ? 'bg-[#C8A862] text-[#0B1C2D] shadow-lg scale-[1.02]' : 'text-gray-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          <LayoutDashboard className={`w-5 h-5 ${activeView === 'DASHBOARD' ? 'text-[#0B1C2D]' : 'text-[#C8A862]'}`} />
          Dashboard
        </button>

        <a 
          href="https://tide-hotels-resorts-menu.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-3 px-4 py-3 font-bold rounded-lg text-gray-300 hover:bg-white/5 hover:text-white transition-all"
        >
          <Utensils className="w-5 h-5 text-[#C8A862]" />
          Ordering Menu
        </a>

        {user.role === UserRole.ADMIN && (
          <button 
            onClick={() => onViewChange('ADMIN')}
            className={`w-full flex items-center gap-3 px-4 py-3 font-bold rounded-lg transition-all ${
              activeView === 'ADMIN' ? 'bg-[#C8A862] text-[#0B1C2D] shadow-lg scale-[1.02]' : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Settings className={`w-5 h-5 ${activeView === 'ADMIN' ? 'text-[#0B1C2D]' : 'text-[#C8A862]'}`} />
            Settings
          </button>
        )}
      </nav>

      <div className="pt-6 border-t border-gray-700/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[#C8A862] flex items-center justify-center text-[#0B1C2D] font-bold shadow-inner">
            <User className="w-5 h-5" />
          </div>
          <div className="overflow-hidden">
            <div className="text-sm font-semibold truncate text-white">{user.displayName}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider font-black">{user.role}</div>
          </div>
        </div>
        
        {user.onlineSince && (
          <div className="mb-4 p-3 bg-[#0B1C2D] border border-gray-800 rounded-lg shadow-sm">
            <div className="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Session Initialized
            </div>
            <div className="text-[10px] text-[#C8A862] font-bold">{new Date(user.onlineSince).toLocaleString()}</div>
          </div>
        )}

        <button 
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold rounded transition-all group"
        >
          <LogOut className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          Sign Out
        </button>
      </div>
    </aside>
    </>
  );
};

export default Sidebar;
import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { UserProfile, UserRole, AppSettings } from '../types';
import { BRAND } from '../constants';

interface SidebarProps {
  user: UserProfile;
  settings: AppSettings | null;
  activeView: 'LEDGER' | 'ADMIN';
  onViewChange: (view: 'LEDGER' | 'ADMIN') => void;
}

const Sidebar: React.FC<SidebarProps> = ({ user, settings, activeView, onViewChange }) => {
  return (
    <aside className="hidden lg:flex flex-col w-64 bg-[#13263A] border-r border-gray-700/50 p-6 no-print">
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-[#C8A862] italic tracking-tighter uppercase truncate">
          {settings?.hotelName || BRAND.name}
        </h1>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest">Hotels & Resorts</p>
      </div>

      <nav className="flex-1 space-y-2">
        <button 
          onClick={() => onViewChange('LEDGER')}
          className={`w-full flex items-center gap-3 px-4 py-3 font-bold rounded-lg transition-all ${
            activeView === 'LEDGER' ? 'bg-[#C8A862] text-[#0B1C2D]' : 'text-gray-400 hover:bg-white/5 hover:text-white'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
          Ledger
        </button>

        {user.role === UserRole.ADMIN && (
          <button 
            onClick={() => onViewChange('ADMIN')}
            className={`w-full flex items-center gap-3 px-4 py-3 font-bold rounded-lg transition-all ${
              activeView === 'ADMIN' ? 'bg-[#C8A862] text-[#0B1C2D]' : 'text-gray-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            Settings
          </button>
        )}
      </nav>

      <div className="pt-6 border-t border-gray-700/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[#C8A862] flex items-center justify-center text-[#0B1C2D] font-bold">
            {user.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <div className="text-sm font-semibold truncate">{user.displayName}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">{user.role}</div>
          </div>
        </div>
        <button 
          onClick={() => signOut(auth)}
          className="w-full px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold rounded transition-all"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
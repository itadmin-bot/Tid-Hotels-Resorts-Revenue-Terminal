
import React, { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  updateDoc, 
  setDoc, 
  addDoc, 
  deleteDoc,
  getDoc,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { Room, AppSettings, UserProfile, UserRole } from '../types';
import { INITIAL_ROOMS, ZENZA_BANK, WHISPERS_BANK, INVOICE_BANKS } from '../constants';

interface AdminPanelProps {
  user: UserProfile;
  isAuthorized: boolean;
  onAuthorize: () => void;
}

const DEFAULT_ADMIN_KEY = 'TIDE-ADMIN-2026-X9FQ';

const AdminPanel: React.FC<AdminPanelProps> = ({ user, isAuthorized, onAuthorize }) => {
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'ROOMS' | 'SETTINGS' | 'ACCOUNTS' | 'SECURITY' | 'USERS'>('ROOMS');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [newAccessCode, setNewAccessCode] = useState('');

  // Subscribe to Rooms
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      if (snapshot.empty) {
        INITIAL_ROOMS.forEach(r => setDoc(doc(db, 'rooms', r.id), r));
      } else {
        const roomData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
        setRooms(roomData);
      }
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to Settings
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as AppSettings);
      } else {
        const defaultSettings: AppSettings = {
          vat: 0.075,
          serviceCharge: 0.10,
          zenzaBank: ZENZA_BANK,
          whispersBank: WHISPERS_BANK,
          invoiceBanks: INVOICE_BANKS
        };
        setDoc(doc(db, 'settings', 'master'), defaultSettings);
      }
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to Users (Admin only)
  useEffect(() => {
    if (!isAuthorized) return;
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setUsers(userData);
    });
    return () => unsubscribe();
  }, [isAuthorized]);

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const codeDoc = await getDoc(doc(db, 'accessCodes', 'master'));
      const masterCode = codeDoc.exists() ? codeDoc.data().code : DEFAULT_ADMIN_KEY;
      
      if (accessCodeInput === masterCode) {
        onAuthorize();
      } else {
        setError('Incorrect Access Code');
      }
    } catch (err) {
      setError('Connection error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCode = async () => {
    if (newAccessCode.length < 4) {
      alert('Code must be at least 4 digits');
      return;
    }
    setLoading(true);
    try {
      await setDoc(doc(db, 'accessCodes', 'master'), { code: newAccessCode, updatedAt: Date.now() });
      alert('Access Code updated successfully');
      setNewAccessCode('');
    } catch (err) {
      alert('Error updating code');
    } finally {
      setLoading(false);
    }
  };

  const updateRoom = async (roomId: string, data: Partial<Room>) => {
    await updateDoc(doc(db, 'rooms', roomId), data);
  };

  const addRoom = async () => {
    const newRoom = {
      name: 'New Room',
      type: 'Standard',
      price: 0,
      updatedAt: Date.now()
    };
    await addDoc(collection(db, 'rooms'), newRoom);
  };

  const deleteRoom = async (roomId: string) => {
    if (confirm('Delete this room?')) {
      await deleteDoc(doc(db, 'rooms', roomId));
    }
  };

  const updateGlobalSettings = async (data: Partial<AppSettings>) => {
    await updateDoc(doc(db, 'settings', 'master'), data);
  };

  if (!isAuthorized) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md w-full p-8 bg-[#13263A] rounded-2xl border border-[#C8A862]/20 shadow-2xl text-center">
          <div className="w-16 h-16 bg-[#C8A862]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-[#C8A862]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Admin Security Check</h2>
          <p className="text-gray-400 text-sm mb-6">Enter the master access code to proceed.</p>
          
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <input 
              type="password"
              placeholder="••••"
              className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg py-4 px-4 text-center text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#C8A862] text-[#C8A862]"
              value={accessCodeInput}
              onChange={(e) => setAccessCodeInput(e.target.value)}
              autoFocus
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button 
              disabled={loading}
              className="w-full py-3 bg-[#C8A862] text-[#0B1C2D] font-bold rounded-lg hover:bg-[#B69651] transition-all disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Authorize Session'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">SYSTEM CONFIGURATION</h1>
          <p className="text-gray-400 text-sm">Master Control Panel • {user.displayName}</p>
        </div>
        <div className="bg-[#13263A] rounded-lg p-1 flex border border-gray-700 overflow-x-auto">
          {['ROOMS', 'SETTINGS', 'ACCOUNTS', 'USERS', 'SECURITY'].map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 text-xs font-bold rounded whitespace-nowrap transition-all ${
                activeTab === tab ? 'bg-[#C8A862] text-[#0B1C2D]' : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#13263A] rounded-2xl border border-gray-700/50 p-6 shadow-xl min-h-[400px]">
        {activeTab === 'ROOMS' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-[#C8A862]">Inventory Management</h3>
              <button onClick={addRoom} className="px-3 py-1 bg-[#C8A862]/10 text-[#C8A862] text-xs font-bold rounded border border-[#C8A862]/30 hover:bg-[#C8A862]/20 transition-all">+ Add Room</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-gray-500 uppercase border-b border-gray-700/50">
                    <th className="pb-4">Room Name</th>
                    <th className="pb-4">Type</th>
                    <th className="pb-4">Rate (₦)</th>
                    <th className="pb-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {rooms.map((room) => (
                    <tr key={room.id}>
                      <td className="py-4">
                        <input 
                          className="bg-transparent border-none text-white focus:outline-none w-full"
                          defaultValue={room.name}
                          onBlur={(e) => updateRoom(room.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="py-4">
                        <input 
                          className="bg-transparent border-none text-gray-400 focus:outline-none w-full text-sm"
                          defaultValue={room.type}
                          onBlur={(e) => updateRoom(room.id, { type: e.target.value })}
                        />
                      </td>
                      <td className="py-4">
                        <input 
                          type="number"
                          className="bg-transparent border-none text-[#C8A862] font-bold focus:outline-none w-24"
                          defaultValue={room.price}
                          onBlur={(e) => updateRoom(room.id, { price: parseFloat(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="py-4 text-right">
                        <button onClick={() => deleteRoom(room.id)} className="text-red-400 text-xs hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'USERS' && (
          <div className="space-y-6">
            <h3 className="font-bold text-[#C8A862]">Terminal Operators & Activity</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-gray-500 uppercase border-b border-gray-700/50">
                    <th className="pb-4">Operator</th>
                    <th className="pb-4">Role</th>
                    <th className="pb-4">Status</th>
                    <th className="pb-4">Last Active</th>
                    <th className="pb-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {users.map((u) => (
                    <tr key={u.uid} className="hover:bg-white/5 transition-colors">
                      <td className="py-4">
                        <div className="font-bold text-sm">{u.displayName}</div>
                        <div className="text-[10px] text-gray-500">{u.email}</div>
                      </td>
                      <td className="py-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${u.role === UserRole.ADMIN ? 'bg-purple-900/40 text-purple-400' : 'bg-blue-900/40 text-blue-400'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${u.isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
                          <span className="text-xs">{u.isOnline ? 'Online' : 'Offline'}</span>
                        </div>
                      </td>
                      <td className="py-4 text-xs text-gray-400">
                        {u.lastActive ? new Date(u.lastActive).toLocaleString() : 'Never'}
                      </td>
                      <td className="py-4 text-right">
                        {u.uid !== user.uid && (
                          <button onClick={async () => {
                            if (confirm(`Change ${u.displayName} role?`)) {
                              await updateDoc(doc(db, 'users', u.uid), { role: u.role === UserRole.ADMIN ? UserRole.STAFF : UserRole.ADMIN });
                            }
                          }} className="text-xs text-[#C8A862] hover:underline">Toggle Role</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'SETTINGS' && settings && (
          <div className="space-y-8 max-w-lg">
            <div>
              <h3 className="font-bold text-[#C8A862] mb-4">Taxation & Service (Inclusive)</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs text-gray-500 uppercase block mb-1">VAT (%)</label>
                  <input 
                    type="number"
                    step="0.01"
                    className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-3 text-white"
                    defaultValue={settings.vat * 100}
                    onBlur={(e) => updateGlobalSettings({ vat: (parseFloat(e.target.value) || 0) / 100 })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase block mb-1">Service Charge (%)</label>
                  <input 
                    type="number"
                    step="0.01"
                    className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-3 text-white"
                    defaultValue={settings.serviceCharge * 100}
                    onBlur={(e) => updateGlobalSettings({ serviceCharge: (parseFloat(e.target.value) || 0) / 100 })}
                  />
                </div>
              </div>
            </div>
            <div className="p-4 bg-blue-900/10 border border-blue-500/20 rounded-lg text-xs text-blue-200">
              Note: Rates are calculated internally from the total amount.
            </div>
          </div>
        )}

        {activeTab === 'ACCOUNTS' && settings && (
          <div className="space-y-8">
            <h3 className="font-bold text-[#C8A862]">Settlement Accounts</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase text-gray-500 border-b border-gray-700 pb-2">Zenza POS</h4>
                <div className="space-y-3">
                  <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm text-white" defaultValue={settings.zenzaBank.bank} onBlur={(e) => updateGlobalSettings({ zenzaBank: { ...settings.zenzaBank, bank: e.target.value } })} />
                  <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm text-white" defaultValue={settings.zenzaBank.accountNumber} onBlur={(e) => updateGlobalSettings({ zenzaBank: { ...settings.zenzaBank, accountNumber: e.target.value } })} />
                  <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm text-white" defaultValue={settings.zenzaBank.accountName} onBlur={(e) => updateGlobalSettings({ zenzaBank: { ...settings.zenzaBank, accountName: e.target.value } })} />
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase text-gray-500 border-b border-gray-700 pb-2">Whispers POS</h4>
                <div className="space-y-3">
                  <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm text-white" defaultValue={settings.whispersBank.bank} onBlur={(e) => updateGlobalSettings({ whispersBank: { ...settings.whispersBank, bank: e.target.value } })} />
                  <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm text-white" defaultValue={settings.whispersBank.accountNumber} onBlur={(e) => updateGlobalSettings({ whispersBank: { ...settings.whispersBank, accountNumber: e.target.value } })} />
                  <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm text-white" defaultValue={settings.whispersBank.accountName} onBlur={(e) => updateGlobalSettings({ whispersBank: { ...settings.whispersBank, accountName: e.target.value } })} />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'SECURITY' && (
          <div className="space-y-6 max-w-md">
            <h3 className="font-bold text-[#C8A862]">Security Control</h3>
            <div>
              <label className="text-xs text-gray-500 uppercase block mb-1">New Master Access Code</label>
              <div className="flex gap-2">
                <input 
                  type="password"
                  placeholder="Enter New Code"
                  className="flex-1 bg-[#0B1C2D] border border-gray-700 rounded p-3 text-white font-mono tracking-widest"
                  value={newAccessCode}
                  onChange={(e) => setNewAccessCode(e.target.value)}
                />
                <button 
                  onClick={handleUpdateCode}
                  className="px-6 py-2 bg-[#C8A862] text-[#0B1C2D] font-bold rounded"
                >
                  Save
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">Update the key required for Admin registration and panel authorization.</p>
            </div>
          </div>
        )}
      </div>
      
      <div className="text-center">
        <button 
          onClick={() => window.location.reload()} 
          className="text-[10px] text-gray-600 hover:text-gray-400 uppercase tracking-widest font-bold"
        >
          Close Session & Lock Settings
        </button>
      </div>
    </div>
  );
};

export default AdminPanel;

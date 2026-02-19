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
import { Room, AppSettings, UserProfile, UserRole, MenuItem, BankAccount, UnitType } from '../types';
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
  const [activeTab, setActiveTab] = useState<'ROOMS' | 'MENU' | 'SETTINGS' | 'ACCOUNTS' | 'USERS' | 'SECURITY'>('ROOMS');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [newAccessCode, setNewAccessCode] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      if (snapshot.empty && user.role === UserRole.ADMIN) {
        INITIAL_ROOMS.forEach(r => setDoc(doc(db, 'rooms', r.id), { ...r, description: '' }));
      } else {
        const roomData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
        setRooms(roomData);
      }
    }, (err) => console.error("Rooms Snapshot Sync Error:", err));
    return () => unsubscribe();
  }, [user.role]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'menu'), (snapshot) => {
      const menuData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
      setMenuItems(menuData);
    }, (err) => console.error("Menu Snapshot Sync Error:", err));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettings({
          vat: data.vat,
          serviceCharge: data.serviceCharge,
          zenzaBanks: Array.isArray(data.zenzaBanks) ? data.zenzaBanks : (data.zenzaBank ? [data.zenzaBank] : [ZENZA_BANK]),
          whispersBanks: Array.isArray(data.whispersBanks) ? data.whispersBanks : (data.whispersBank ? [data.whispersBank] : [WHISPERS_BANK]),
          invoiceBanks: data.invoiceBanks || INVOICE_BANKS
        } as AppSettings);
      } else if (user.role === UserRole.ADMIN) {
        const defaultSettings: AppSettings = {
          vat: 0.075,
          serviceCharge: 0.10,
          zenzaBanks: [ZENZA_BANK],
          whispersBanks: [WHISPERS_BANK],
          invoiceBanks: INVOICE_BANKS
        };
        setDoc(doc(db, 'settings', 'master'), defaultSettings);
      }
    }, (err) => console.error("Settings Snapshot Sync Error:", err));
    return () => unsubscribe();
  }, [user.role]);

  useEffect(() => {
    if (!isAuthorized || user.role !== UserRole.ADMIN) return;
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setUsers(userData);
    }, (err) => console.error("Users Snapshot Sync Error:", err));
    return () => unsubscribe();
  }, [isAuthorized, user.role]);

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
    const newRoom = { name: 'New Room', type: 'Standard', price: 0, description: '' };
    await addDoc(collection(db, 'rooms'), newRoom);
  };

  const deleteRoom = async (roomId: string) => {
    if (confirm('Delete this room?')) await deleteDoc(doc(db, 'rooms', roomId));
  };

  const updateMenuItem = async (id: string, data: Partial<MenuItem>) => {
    await updateDoc(doc(db, 'menu', id), data);
  };

  const addMenuItem = async () => {
    const newItem = { name: 'New Item', description: '', price: 0, category: 'General', unit: 'ALL', imageUrl: '' };
    await addDoc(collection(db, 'menu'), newItem);
  };

  const deleteMenuItem = async (id: string) => {
    if (confirm('Delete this menu item?')) await deleteDoc(doc(db, 'menu', id));
  };

  const updateGlobalSettings = async (data: Partial<AppSettings>) => {
    await updateDoc(doc(db, 'settings', 'master'), data);
  };

  const addAccount = (type: 'zenza' | 'whispers' | 'invoice') => {
    if (!settings) return;
    const key = type === 'zenza' ? 'zenzaBanks' : type === 'whispers' ? 'whispersBanks' : 'invoiceBanks';
    const newBanks = [...(settings[key] as BankAccount[]), { bank: 'New Bank', accountNumber: '0000000000', accountName: 'Account Name' }];
    updateGlobalSettings({ [key]: newBanks });
  };

  const removeAccount = (type: 'zenza' | 'whispers' | 'invoice', index: number) => {
    if (!settings || !confirm('Remove this account?')) return;
    const key = type === 'zenza' ? 'zenzaBanks' : type === 'whispers' ? 'whispersBanks' : 'invoiceBanks';
    const newBanks = (settings[key] as BankAccount[]).filter((_, i) => i !== index);
    updateGlobalSettings({ [key]: newBanks });
  };

  const updateAccount = (type: 'zenza' | 'whispers' | 'invoice', index: number, field: keyof BankAccount, value: string) => {
    if (!settings) return;
    const key = type === 'zenza' ? 'zenzaBanks' : type === 'whispers' ? 'whispersBanks' : 'invoiceBanks';
    const newBanks = [...(settings[key] as BankAccount[])];
    newBanks[index] = { ...newBanks[index], [field]: value };
    updateGlobalSettings({ [key]: newBanks });
  };

  const renderBankSection = (title: string, type: 'zenza' | 'whispers' | 'invoice', banks: BankAccount[]) => (
    <div className="pt-8 border-t border-gray-700/50 space-y-6">
      <div className="flex justify-between items-center">
        <h4 className="text-xs font-bold uppercase text-gray-500 tracking-widest">{title}</h4>
        <button 
          onClick={() => addAccount(type)}
          className="px-3 py-1 bg-[#C8A862]/10 text-[#C8A862] text-[10px] font-black rounded border border-[#C8A862]/30 hover:bg-[#C8A862]/20 transition-all uppercase tracking-widest"
        >
          + Add Account
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {banks.map((bank, idx) => (
          <div key={idx} className="bg-[#0B1C2D]/50 border border-gray-700/30 rounded-xl p-4 space-y-3 relative group transition-all hover:border-[#C8A862]/30">
            <button 
              onClick={() => removeAccount(type, idx)}
              className="absolute top-3 right-3 text-red-500/50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
            <div>
              <label className="text-[8px] text-gray-600 font-black uppercase tracking-widest mb-1 block">Institution</label>
              <input 
                className="w-full bg-transparent border-b border-gray-800 p-1 text-sm text-white font-bold focus:border-[#C8A862] outline-none" 
                defaultValue={bank.bank} 
                onBlur={(e) => updateAccount(type, idx, 'bank', e.target.value)}
              />
            </div>
            <div>
              <label className="text-[8px] text-gray-600 font-black uppercase tracking-widest mb-1 block">Account String</label>
              <input 
                className="w-full bg-transparent border-b border-gray-800 p-1 text-sm text-[#C8A862] font-mono focus:border-[#C8A862] outline-none" 
                defaultValue={bank.accountNumber} 
                onBlur={(e) => updateAccount(type, idx, 'accountNumber', e.target.value)}
              />
            </div>
            <div>
              <label className="text-[8px] text-gray-600 font-black uppercase tracking-widest mb-1 block">Legal Name</label>
              <input 
                className="w-full bg-transparent border-b border-gray-800 p-1 text-[9px] text-gray-400 font-medium uppercase tracking-wider focus:border-[#C8A862] outline-none" 
                defaultValue={bank.accountName} 
                onBlur={(e) => updateAccount(type, idx, 'accountName', e.target.value)}
              />
            </div>
          </div>
        ))}
        {banks.length === 0 && (
          <div className="col-span-full py-10 border-2 border-dashed border-gray-800 rounded-2xl flex items-center justify-center text-gray-600 uppercase text-[10px] font-black tracking-widest">
            No Accounts Registered in this Category
          </div>
        )}
      </div>
    </div>
  );

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
            <button disabled={loading} className="w-full py-3 bg-[#C8A862] text-[#0B1C2D] font-bold rounded-lg hover:bg-[#B69651] transition-all disabled:opacity-50">
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
          <h1 className="text-2xl font-bold text-white uppercase">System Configuration</h1>
          <p className="text-gray-400 text-sm">Master Control Panel • {user.displayName}</p>
        </div>
        <div className="bg-[#13263A] rounded-lg p-1 flex border border-gray-700 overflow-x-auto gap-1">
          {['ROOMS', 'MENU', 'SETTINGS', 'ACCOUNTS', 'USERS', 'SECURITY'].map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-3 py-2 text-xs font-bold rounded whitespace-nowrap transition-all ${
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
                    <th className="pb-4">Name</th>
                    <th className="pb-4">Description</th>
                    <th className="pb-4">Type</th>
                    <th className="pb-4 text-right">Rate (₦)</th>
                    <th className="pb-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {rooms.map((room) => (
                    <tr key={room.id}>
                      <td className="py-4">
                        <input className="bg-transparent border-none text-white font-bold focus:outline-none w-full" defaultValue={room.name} onBlur={(e) => updateRoom(room.id, { name: e.target.value })} />
                      </td>
                      <td className="py-4">
                        <input className="bg-transparent border-none text-gray-400 text-xs focus:outline-none w-full" placeholder="Add description..." defaultValue={room.description} onBlur={(e) => updateRoom(room.id, { description: e.target.value })} />
                      </td>
                      <td className="py-4">
                        <input className="bg-transparent border-none text-gray-400 focus:outline-none w-full text-sm" defaultValue={room.type} onBlur={(e) => updateRoom(room.id, { type: e.target.value })} />
                      </td>
                      <td className="py-4">
                        <input type="number" className="bg-transparent border-none text-[#C8A862] font-bold focus:outline-none w-24 text-right" defaultValue={room.price} onBlur={(e) => updateRoom(room.id, { price: parseFloat(e.target.value) || 0 })} />
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

        {activeTab === 'MENU' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-[#C8A862]">POS Menu Catalog</h3>
              <button onClick={addMenuItem} className="px-3 py-1 bg-[#C8A862]/10 text-[#C8A862] text-xs font-bold rounded border border-[#C8A862]/30 hover:bg-[#C8A862]/20 transition-all">+ Add Item</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-gray-500 uppercase border-b border-gray-700/50">
                    <th className="pb-4">Item Name</th>
                    <th className="pb-4">Unit</th>
                    <th className="pb-4">Category</th>
                    <th className="pb-4 text-right">Price (₦)</th>
                    <th className="pb-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {menuItems.map((item) => (
                    <tr key={item.id}>
                      <td className="py-4">
                        <input className="bg-transparent border-none text-white font-bold focus:outline-none w-full" defaultValue={item.name} onBlur={(e) => updateMenuItem(item.id, { name: e.target.value })} />
                      </td>
                      <td className="py-4">
                        <select 
                          className="bg-transparent border-none text-gray-400 text-xs focus:outline-none w-full" 
                          value={item.unit} 
                          onChange={(e) => updateMenuItem(item.id, { unit: e.target.value as any })}
                        >
                          <option value="ALL">All Units</option>
                          <option value={UnitType.ZENZA}>Zenza</option>
                          <option value={UnitType.WHISPERS}>Whispers</option>
                        </select>
                      </td>
                      <td className="py-4">
                        <input className="bg-transparent border-none text-gray-400 focus:outline-none w-full text-sm" defaultValue={item.category} onBlur={(e) => updateMenuItem(item.id, { category: e.target.value })} />
                      </td>
                      <td className="py-4">
                        <input type="number" className="bg-transparent border-none text-[#C8A862] font-bold focus:outline-none w-24 text-right" defaultValue={item.price} onBlur={(e) => updateMenuItem(item.id, { price: parseFloat(e.target.value) || 0 })} />
                      </td>
                      <td className="py-4 text-right">
                        <button onClick={() => deleteMenuItem(item.id)} className="text-red-400 text-xs hover:underline">Delete</button>
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
                  <input type="number" step="0.01" className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-3 text-white" defaultValue={settings.vat * 100} onBlur={(e) => updateGlobalSettings({ vat: (parseFloat(e.target.value) || 0) / 100 })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase block mb-1">Service Charge (%)</label>
                  <input type="number" step="0.01" className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-3 text-white" defaultValue={settings.serviceCharge * 100} onBlur={(e) => updateGlobalSettings({ serviceCharge: (parseFloat(e.target.value) || 0) / 100 })} />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ACCOUNTS' && settings && (
          <div className="space-y-12">
            <h3 className="font-bold text-[#C8A862]">Settlement Accounts Management</h3>
            {renderBankSection('Zenza POS Accounts', 'zenza', settings.zenzaBanks)}
            {renderBankSection('Whispers POS Accounts', 'whispers', settings.whispersBanks)}
            {renderBankSection('General Invoice Accounts', 'invoice', settings.invoiceBanks)}
          </div>
        )}

        {activeTab === 'SECURITY' && (
          <div className="space-y-6 max-md">
            <h3 className="font-bold text-[#C8A862]">Security Control</h3>
            <div>
              <label className="text-xs text-gray-500 uppercase block mb-1">New Master Access Code</label>
              <div className="flex gap-2">
                <input type="password" placeholder="Enter New Code" className="flex-1 bg-[#0B1C2D] border border-gray-700 rounded p-3 text-white font-mono tracking-widest" value={newAccessCode} onChange={(e) => setNewAccessCode(e.target.value)} />
                <button onClick={handleUpdateCode} className="px-6 py-2 bg-[#C8A862] text-[#0B1C2D] font-bold rounded">Save</button>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">Update the key required for Admin registration and panel authorization.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
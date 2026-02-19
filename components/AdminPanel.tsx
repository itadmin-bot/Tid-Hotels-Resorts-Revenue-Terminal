import React, { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  updateDoc, 
  setDoc, 
  deleteDoc,
  addDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Room, AppSettings, UserProfile, UserRole, MenuItem, BankAccount, UnitType, TaxConfig } from '../types';

interface AdminPanelProps {
  user: UserProfile;
  isAuthorized: boolean;
  onAuthorize: () => void;
}

const DEFAULT_ADMIN_KEY = 'TIDE-ADMIN-2026-X9FQ';

const AdminPanel: React.FC<AdminPanelProps> = ({ user, isAuthorized, onAuthorize }) => {
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [securityTabCode, setSecurityTabCode] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'Rooms' | 'Menu' | 'Settings' | 'Accounts' | 'Users' | 'Security'>('Rooms');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [masterCode, setMasterCode] = useState(DEFAULT_ADMIN_KEY);

  const [showRoomModal, setShowRoomModal] = useState<Partial<Room> | null>(null);
  const [showMenuModal, setShowMenuModal] = useState<Partial<MenuItem> | null>(null);

  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(Date.now()), 15000);

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const allUsers = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          uid: doc.id, 
          ...data,
          onlineSince: data.onlineSince || data.createdAt || data.lastActive || Date.now(),
          lastActive: data.lastActive || data.createdAt || Date.now()
        } as UserProfile;
      });
      
      setUsers(allUsers.sort((a, b) => {
        const aOnline = (a.isOnline !== false) && (a.lastActive || 0) > Date.now() - 65000;
        const bOnline = (b.isOnline !== false) && (b.lastActive || 0) > Date.now() - 65000;
        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;
        return a.displayName.localeCompare(b.displayName);
      }));
    });

    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      setRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room)));
    });

    const unsubMenu = onSnapshot(collection(db, 'menu'), (snapshot) => {
      setMenuItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettings({
          hotelName: data.hotelName || 'TIDE',
          hotelSubName: data.hotelSubName || 'Hotels & Resorts',
          hotelAddress: data.hotelAddress || '',
          vat: data.vat ?? 0.075,
          serviceCharge: data.serviceCharge ?? 0.10,
          isTaxInclusive: data.isTaxInclusive ?? true,
          taxes: data.taxes || [],
          zenzaBanks: Array.isArray(data.zenzaBanks) ? data.zenzaBanks : [],
          whispersBanks: Array.isArray(data.whispersBanks) ? data.whispersBanks : [],
          invoiceBanks: Array.isArray(data.invoiceBanks) ? data.invoiceBanks : []
        } as AppSettings);
      }
    });

    const unsubCode = onSnapshot(doc(db, 'accessCodes', 'master'), (snapshot) => {
      if (snapshot.exists()) setMasterCode(snapshot.data().code);
    });

    return () => { 
      clearInterval(clock);
      unsubUsers(); 
      unsubRooms(); 
      unsubMenu(); 
      unsubSettings(); 
      unsubCode(); 
    };
  }, []);

  const handleUpdateSettings = async (field: keyof AppSettings, value: any) => {
    await updateDoc(doc(db, 'settings', 'master'), { [field]: value });
  };

  const handleUpdateTax = async (index: number, field: keyof TaxConfig, value: any) => {
    if (!settings) return;
    const updatedTaxes = [...settings.taxes];
    updatedTaxes[index] = { ...updatedTaxes[index], [field]: value };
    await handleUpdateSettings('taxes', updatedTaxes);
  };

  const handleAddTax = async () => {
    if (!settings) return;
    const newTax: TaxConfig = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Tax',
      rate: 0.01,
      type: 'OTHER',
      visibleOnReceipt: true
    };
    await handleUpdateSettings('taxes', [...settings.taxes, newTax]);
  };

  const handleRemoveTax = async (index: number) => {
    if (!settings || !confirm('Remove this tax from the property network?')) return;
    const updatedTaxes = settings.taxes.filter((_, i) => i !== index);
    await handleUpdateSettings('taxes', updatedTaxes);
  };

  const handleUpdateBank = async (bankType: 'zenzaBanks' | 'whispersBanks' | 'invoiceBanks', index: number, field: keyof BankAccount, value: string) => {
    if (!settings) return;
    const currentBanks = [...(settings[bankType] || [])];
    if (currentBanks[index]) {
      currentBanks[index] = { ...currentBanks[index], [field]: value };
      await handleUpdateSettings(bankType, currentBanks);
    }
  };

  const handleAddBank = (bankType: 'zenzaBanks' | 'whispersBanks' | 'invoiceBanks') => {
    if (!settings) return;
    const newBank: BankAccount = { bank: 'Institution Name', accountNumber: '0000000000', accountName: settings.hotelName };
    const currentBanks = Array.isArray(settings[bankType]) ? settings[bankType] : [];
    handleUpdateSettings(bankType, [...currentBanks, newBank]);
  };

  const handleRemoveBank = (bankType: 'zenzaBanks' | 'whispersBanks' | 'invoiceBanks', index: number) => {
    if (!settings || !confirm('Permanently remove this bank account?')) return;
    const currentBanks = Array.isArray(settings[bankType]) ? settings[bankType] : [];
    const updatedBanks = currentBanks.filter((_, i) => i !== index);
    handleUpdateSettings(bankType, updatedBanks);
  };

  const handleUpdateMasterCode = async () => {
    if (!securityTabCode) return alert('Enter a valid code');
    setLoading(true);
    try {
      await setDoc(doc(db, 'accessCodes', 'master'), { code: securityTabCode });
      alert('Master Security Key Updated Globally.');
      setSecurityTabCode('');
    } catch (err) {
      alert('Security update failed.');
    } finally {
      setLoading(false);
    }
  };

  const saveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showRoomModal) return;
    const data = {
      name: showRoomModal.name || '',
      type: showRoomModal.type || 'Standard',
      price: Number(showRoomModal.price) || 0,
      totalInventory: Number(showRoomModal.totalInventory) || 1,
      bookedCount: showRoomModal.bookedCount || 0
    };
    if (showRoomModal.id) {
      await updateDoc(doc(db, 'rooms', showRoomModal.id), data);
    } else {
      await addDoc(collection(db, 'rooms'), data);
    }
    setShowRoomModal(null);
  };

  const saveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showMenuModal) return;
    const data = {
      name: showMenuModal.name || '',
      description: showMenuModal.description || '',
      price: Number(showMenuModal.price) || 0,
      category: showMenuModal.category || 'General',
      unit: showMenuModal.unit || 'ALL',
      initialStock: Number(showMenuModal.initialStock) || 0,
      soldCount: showMenuModal.soldCount || 0,
      lowStockThreshold: Number(showMenuModal.lowStockThreshold) || 3
    };
    if (showMenuModal.id) {
      await updateDoc(doc(db, 'menu', showMenuModal.id), data);
    } else {
      await addDoc(collection(db, 'menu'), data);
    }
    setShowMenuModal(null);
  };

  const toggleUserRole = async (targetUser: UserProfile) => {
    const newRole = targetUser.role === UserRole.ADMIN ? UserRole.STAFF : UserRole.ADMIN;
    await updateDoc(doc(db, 'users', targetUser.uid), { role: newRole });
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (accessCodeInput === masterCode) onAuthorize();
    else setError('Incorrect Access Code');
    setLoading(false);
  };

  const isUserLive = (lastActive?: number, isOnline?: boolean) => {
    if (isOnline === false) return false;
    if (!lastActive) return false;
    return lastActive > currentTime - 65000;
  };

  if (!isAuthorized) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md w-full p-10 bg-[#13263A] rounded-2xl border border-gray-700 shadow-2xl text-center space-y-8">
          <div className="w-20 h-20 bg-[#C8A862]/10 rounded-full flex items-center justify-center mx-auto border border-[#C8A862]/30">
            <svg className="w-10 h-10 text-[#C8A862]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">Admin Authorization</h2>
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <input type="password" placeholder="••••" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg py-4 px-4 text-center font-mono tracking-[0.5em] text-[#C8A862] text-xl outline-none" value={accessCodeInput} onChange={(e) => setAccessCodeInput(e.target.value)} />
            {error && <p className="text-red-400 text-[10px] font-bold uppercase">{error}</p>}
            <button disabled={loading} className="w-full py-4 bg-[#C8A862] text-[#0B1C2D] font-black rounded-lg uppercase tracking-widest hover:bg-[#B69651] transition-all">Unlock System</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tight">SYSTEM CONFIGURATION</h1>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Master Control Panel • {user.displayName}</p>
        </div>
        <div className="bg-[#13263A] rounded-xl p-1.5 flex border border-gray-700 overflow-x-auto gap-1">
          {['Rooms', 'Menu', 'Settings', 'Accounts', 'Users', 'Security'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-5 py-2 text-[11px] font-black rounded-lg uppercase tracking-widest transition-all shrink-0 ${activeTab === tab ? 'bg-[#C8A862] text-[#0B1C2D] shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#13263A] rounded-2xl border border-gray-700/50 p-8 shadow-2xl min-h-[500px]">
        {activeTab === 'Rooms' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-black text-[#C8A862] uppercase tracking-widest">Inventory Management</h2>
              <button onClick={() => setShowRoomModal({})} className="px-4 py-2 border border-[#C8A862]/30 text-[#C8A862] rounded-lg text-[10px] font-black uppercase hover:bg-[#C8A862]/10 transition-all">+ Add Room</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-gray-500 uppercase tracking-widest border-b border-gray-700/50 pb-4">
                    <th className="pb-4">Name</th>
                    <th className="pb-4">Type</th>
                    <th className="pb-4">Inventory</th>
                    <th className="pb-4 text-right">Rate (₦)</th>
                    <th className="pb-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {rooms.map(r => (
                    <tr key={r.id} className="hover:bg-white/5 transition-colors group">
                      <td className="py-5 font-bold text-white uppercase">{r.name}</td>
                      <td className="py-5 text-gray-400 text-xs uppercase">{r.type}</td>
                      <td className="py-5 text-gray-400 text-xs font-black">{r.totalInventory - (r.bookedCount || 0)} / {r.totalInventory} Available</td>
                      <td className="py-5 font-black text-right">{r.price.toLocaleString()}</td>
                      <td className="py-5 text-right space-x-3">
                        <button onClick={() => setShowRoomModal(r)} className="text-blue-400 hover:text-white text-[10px] font-black uppercase tracking-widest">Edit</button>
                        <button onClick={() => deleteDoc(doc(db, 'rooms', r.id))} className="text-red-500/50 hover:text-red-500 text-[10px] font-black uppercase tracking-widest">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'Menu' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-black text-[#C8A862] uppercase tracking-widest">POS Menu Catalog</h2>
              <button onClick={() => setShowMenuModal({})} className="px-4 py-2 border border-[#C8A862]/30 text-[#C8A862] rounded-lg text-[10px] font-black uppercase hover:bg-[#C8A862]/10 transition-all">+ Add Item</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-gray-500 uppercase tracking-widest border-b border-gray-700/50">
                    <th className="pb-4">Item Name</th>
                    <th className="pb-4">Unit</th>
                    <th className="pb-4">Stock</th>
                    <th className="pb-4 text-right">Price (₦)</th>
                    <th className="pb-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {menuItems.map(m => (
                    <tr key={m.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-5 font-bold text-white uppercase">{m.name}</td>
                      <td className="py-5 text-gray-400 text-xs">{m.unit}</td>
                      <td className="py-5 text-gray-400 text-xs font-black">{m.initialStock - (m.soldCount || 0)} / {m.initialStock}</td>
                      <td className="py-5 font-black text-right">{m.price.toLocaleString()}</td>
                      <td className="py-5 text-right space-x-3">
                        <button onClick={() => setShowMenuModal(m)} className="text-blue-400 hover:text-white text-[10px] font-black uppercase tracking-widest">Edit</button>
                        <button onClick={() => deleteDoc(doc(db, 'menu', m.id))} className="text-red-500/50 hover:text-red-500 text-[10px] font-black uppercase tracking-widest">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'Accounts' && settings && (
          <div className="space-y-12">
            <h2 className="text-xl font-black text-[#C8A862] uppercase tracking-widest border-b border-gray-700/50 pb-4">Settlement Accounts Management</h2>
            {[
              { label: 'ZENZA POS ACCOUNTS', type: 'zenzaBanks' as const },
              { label: 'WHISPERS POS ACCOUNTS', type: 'whispersBanks' as const },
              { label: 'GENERAL INVOICE ACCOUNTS', type: 'invoiceBanks' as const }
            ].map((acc) => (
              <section key={acc.type} className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">{acc.label}</h3>
                  <button onClick={() => handleAddBank(acc.type)} className="px-3 py-1.5 bg-[#C8A862]/10 border border-[#C8A862]/30 text-[#C8A862] rounded-lg text-[9px] font-black uppercase hover:bg-[#C8A862]/20 transition-all">+ Add Account</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(settings[acc.type] || []).map((bank, i) => (
                    <div key={i} className="bg-[#0B1C2D] border border-gray-700/50 rounded-2xl p-6 space-y-4 relative group hover:border-[#C8A862]/30 transition-all">
                      <button onClick={() => handleRemoveBank(acc.type, i)} className="absolute top-4 right-4 text-red-500/50 hover:text-red-500 text-[9px] font-black uppercase opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-gray-600 uppercase">Institution</label>
                        <input className="w-full bg-transparent text-lg font-black text-white outline-none focus:text-[#C8A862] transition-colors" value={bank.bank} onChange={(e) => handleUpdateBank(acc.type, i, 'bank', e.target.value)} />
                        <div className="h-px bg-gray-800"></div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-gray-600 uppercase">Account String</label>
                        <input className="w-full bg-transparent text-lg font-black text-[#C8A862] outline-none" value={bank.accountNumber} onChange={(e) => handleUpdateBank(acc.type, i, 'accountNumber', e.target.value)} />
                        <div className="h-px bg-gray-800"></div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-gray-600 uppercase">Legal Name</label>
                        <input className="w-full bg-transparent text-[11px] font-bold text-gray-500 uppercase outline-none focus:text-white" value={bank.accountName} onChange={(e) => handleUpdateBank(acc.type, i, 'accountName', e.target.value)} />
                      </div>
                    </div>
                  ))}
                  {(settings[acc.type] || []).length === 0 && (
                    <div className="col-span-full border-2 border-dashed border-gray-700 rounded-2xl p-8 text-center">
                       <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest">No Settlement Accounts Configured for {acc.label}</p>
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}

        {activeTab === 'Settings' && settings && (
          <div className="space-y-12">
            <section className="space-y-6 max-w-2xl">
              <h2 className="text-xs font-black text-[#C8A862] uppercase tracking-[0.2em]">CORPORATE IDENTITY</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Hotel/Brand Name</label>
                  <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white font-bold" value={settings.hotelName} onChange={(e) => handleUpdateSettings('hotelName', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Sub-Brand / Tagline</label>
                  <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white font-bold" value={settings.hotelSubName} onChange={(e) => handleUpdateSettings('hotelSubName', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">Corporate Address</label>
                <textarea className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white h-24" value={settings.hotelAddress} onChange={(e) => handleUpdateSettings('hotelAddress', e.target.value)} />
              </div>
            </section>

            <section className="space-y-8 pt-10 border-t border-gray-700/50">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-black text-[#C8A862] uppercase tracking-[0.1em]">TAXATION SYSTEM</h2>
                <div className="flex items-center gap-3 bg-[#0B1C2D] p-3 rounded-xl border border-gray-700/50">
                   <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Inclusive Pricing</span>
                   <button 
                     onClick={() => handleUpdateSettings('isTaxInclusive', !settings.isTaxInclusive)}
                     className={`w-10 h-5 rounded-full relative transition-all ${settings.isTaxInclusive ? 'bg-[#C8A862]' : 'bg-gray-800'}`}
                   >
                     <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${settings.isTaxInclusive ? 'left-6' : 'left-1'}`}></div>
                   </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Active Property Taxes</p>
                  <button onClick={handleAddTax} className="px-3 py-1.5 border border-[#C8A862]/30 text-[#C8A862] rounded-lg text-[9px] font-black uppercase hover:bg-[#C8A862]/10 transition-all">+ Add New Tax</button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(settings.taxes || []).map((tax, i) => (
                    <div key={tax.id} className="bg-[#0B1C2D] border border-gray-700/50 rounded-2xl p-5 space-y-4 relative group hover:border-[#C8A862]/30 transition-all">
                      <button onClick={() => handleRemoveTax(i)} className="absolute top-4 right-4 text-red-500/50 hover:text-red-500 text-[10px] font-black">&times;</button>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-gray-600 uppercase">Tax Label</label>
                          <input className="w-full bg-transparent text-sm font-bold text-white outline-none border-b border-gray-800 focus:border-[#C8A862]" value={tax.name} onChange={(e) => handleUpdateTax(i, 'name', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-gray-600 uppercase">Rate (%)</label>
                          <input type="number" step="0.1" className="w-full bg-transparent text-sm font-black text-[#C8A862] outline-none border-b border-gray-800 focus:border-[#C8A862]" value={(tax.rate * 100).toFixed(1)} onChange={(e) => handleUpdateTax(i, 'rate', parseFloat(e.target.value) / 100)} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                          <label className="text-[9px] font-black text-gray-600 uppercase">Type:</label>
                          <select className="bg-transparent text-[10px] font-black text-white outline-none" value={tax.type} onChange={(e) => handleUpdateTax(i, 'type', e.target.value)}>
                            <option value="VAT">VAT</option>
                            <option value="SC">Service Charge</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-gray-600 uppercase">Show on Receipt</span>
                          <button 
                            onClick={() => handleUpdateTax(i, 'visibleOnReceipt', !tax.visibleOnReceipt)}
                            className={`w-8 h-4 rounded-full relative transition-all ${tax.visibleOnReceipt ? 'bg-green-600' : 'bg-gray-800'}`}
                          >
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${tax.visibleOnReceipt ? 'left-4.5' : 'left-0.5'}`}></div>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'Users' && (
          <div className="space-y-6">
            <h2 className="text-lg font-black text-[#C8A862] uppercase tracking-widest mb-4">Live Operator Directory ({users.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-gray-500 uppercase tracking-widest border-b border-gray-700/50">
                    <th className="pb-4">Operator</th>
                    <th className="pb-4">Role</th>
                    <th className="pb-4">Session Context</th>
                    <th className="pb-4 text-center">Live Status</th>
                    <th className="pb-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {users.map(u => {
                    const online = isUserLive(u.lastActive, u.isOnline);
                    return (
                      <tr key={u.uid} className="hover:bg-white/5 transition-colors group">
                        <td className="py-5">
                          <div className="font-bold text-white uppercase">{u.displayName}</div>
                          <div className="text-[10px] text-gray-500">{u.email}</div>
                        </td>
                        <td className="py-5">
                          <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${u.role === UserRole.ADMIN ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="py-5">
                          <div className="text-[10px] font-black uppercase text-gray-400">
                             {online ? (
                               <span className="text-[#C8A862]">Login: {u.onlineSince ? new Date(u.onlineSince).toLocaleString() : 'Just Now'}</span>
                             ) : (
                               <span>Exit: {u.lastActive ? new Date(u.lastActive).toLocaleString() : 'N/A'}</span>
                             )}
                          </div>
                        </td>
                        <td className="py-5">
                          <div className="flex items-center justify-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-green-500 animate-pulse shadow-[0_0_12px_rgba(34,197,94,0.6)]' : 'bg-gray-700'}`}></span>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${online ? 'text-green-400' : 'text-gray-500'}`}>
                              {online ? 'Live Now' : 'Disconnected'}
                            </span>
                          </div>
                        </td>
                        <td className="py-5 text-right">
                          <button onClick={() => toggleUserRole(u)} className="text-[#C8A862] hover:text-white text-[10px] font-black uppercase tracking-widest bg-[#C8A862]/10 px-3 py-1.5 rounded-lg border border-[#C8A862]/20">Switch Permissions</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {users.length === 0 && (
                <div className="py-20 text-center text-gray-600 font-black uppercase tracking-[0.5em] italic">No Terminal Operators Registered</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'Security' && (
          <div className="space-y-10 max-md">
            <h2 className="text-xl font-black text-[#C8A862] uppercase tracking-widest border-b border-gray-700/50 pb-4">Master Security Control</h2>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Update Authorization Key</label>
                <div className="flex gap-4">
                  <input type="password" placeholder="TIDE-XXXX" className="flex-1 bg-[#0B1C2D] border border-gray-700 rounded-lg p-4 text-sm text-white font-mono tracking-widest focus:border-[#C8A862] outline-none" value={securityTabCode} onChange={(e) => setSecurityTabCode(e.target.value)} />
                  <button onClick={handleUpdateMasterCode} disabled={loading} className="px-8 py-4 bg-[#C8A862] text-[#0B1C2D] font-black rounded-lg uppercase text-xs tracking-widest hover:bg-[#B69651] transition-all disabled:opacity-50 shadow-xl">Update Key</button>
                </div>
              </div>
              <div className="bg-[#C8A862]/10 border border-[#C8A862]/20 p-5 rounded-2xl">
                 <div className="flex gap-3 items-start">
                   <svg className="w-5 h-5 text-[#C8A862] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                   <p className="text-[10px] text-[#C8A862] font-black uppercase tracking-tight leading-relaxed">
                     Critical: Updating this key will immediately invalidate the previous key for all terminal registration requests and admin panel entry challenges across the property network.
                   </p>
                 </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showRoomModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#13263A] w-full max-w-md rounded-2xl border border-gray-700 p-8 space-y-6">
            <h2 className="text-xl font-black text-[#C8A862] uppercase tracking-tighter">{showRoomModal.id ? 'Modify' : 'Initialize'} Room Inventory</h2>
            <form onSubmit={saveRoom} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase">Display Name</label>
                <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white" value={showRoomModal.name || ''} onChange={(e) => setShowRoomModal({...showRoomModal, name: e.target.value})} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase">Type</label>
                  <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white" value={showRoomModal.type || ''} onChange={(e) => setShowRoomModal({...showRoomModal, type: e.target.value})} required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase">Base Rate (₦)</label>
                  <input type="number" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white" value={showRoomModal.price || ''} onChange={(e) => setShowRoomModal({...showRoomModal, price: Number(e.target.value)})} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase">Total Capacity</label>
                  <input type="number" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white" value={showRoomModal.totalInventory || ''} onChange={(e) => setShowRoomModal({...showRoomModal, totalInventory: Number(e.target.value)})} required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase">Currently Booked</label>
                  <input type="number" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white" value={showRoomModal.bookedCount || 0} onChange={(e) => setShowRoomModal({...showRoomModal, bookedCount: Number(e.target.value)})} />
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowRoomModal(null)} className="flex-1 py-4 border border-gray-700 text-gray-500 rounded-lg uppercase text-[10px] font-black">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-[#C8A862] text-black rounded-lg uppercase text-[10px] font-black">Save Inventory</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMenuModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#13263A] w-full max-w-md rounded-2xl border border-gray-700 p-8 space-y-6">
            <h2 className="text-xl font-black text-[#C8A862] uppercase tracking-tighter">{showMenuModal.id ? 'Update' : 'Register'} Item</h2>
            <form onSubmit={saveMenuItem} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase">Item Name</label>
                <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white font-bold uppercase" value={showMenuModal.name || ''} onChange={(e) => setShowMenuModal({...showMenuModal, name: e.target.value})} required />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase">Kitchen Notes / Description</label>
                <textarea className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white h-20 resize-none outline-none focus:border-[#C8A862]" value={showMenuModal.description || ''} onChange={(e) => setShowMenuModal({...showMenuModal, description: e.target.value})} placeholder="e.g. Served with extra sauce, Spiciness level, etc." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase">Price (₦)</label>
                  <input type="number" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white font-black" value={showMenuModal.price || ''} onChange={(e) => setShowMenuModal({...showMenuModal, price: Number(e.target.value)})} required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase">Initial Stock</label>
                  <input type="number" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white font-black" value={showMenuModal.initialStock || ''} onChange={(e) => setShowMenuModal({...showMenuModal, initialStock: Number(e.target.value)})} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase">Unit Allocation</label>
                  <select className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white font-bold" value={showMenuModal.unit || 'ALL'} onChange={(e) => setShowMenuModal({...showMenuModal, unit: e.target.value as any})}>
                    <option value="ALL">Global (Both Units)</option>
                    <option value={UnitType.ZENZA}>Zenza Only</option>
                    <option value={UnitType.WHISPERS}>Whispers Only</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-[#C8A862] uppercase">Low Stock Alert Threshold</label>
                  <input type="number" className="w-full bg-[#0B1C2D] border border-[#C8A862]/30 rounded-lg p-3 text-sm text-[#C8A862] font-black" placeholder="Default: 3" value={showMenuModal.lowStockThreshold || ''} onChange={(e) => setShowMenuModal({...showMenuModal, lowStockThreshold: Number(e.target.value)})} />
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowMenuModal(null)} className="flex-1 py-4 border border-gray-700 text-gray-500 rounded-lg uppercase text-[10px] font-black">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-[#C8A862] text-black rounded-lg uppercase text-[10px] font-black">Commit Record</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
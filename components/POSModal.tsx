import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  UserProfile, 
  UnitType, 
  SettlementStatus, 
  SettlementMethod, 
  MenuItem, 
  AppSettings, 
  Transaction, 
  TransactionItem,
  TransactionPayment
} from '../types';
import ReceiptPreview from './ReceiptPreview';

interface POSModalProps {
  user: UserProfile;
  onClose: () => void;
}

const POSModal: React.FC<POSModalProps> = ({ user, onClose }) => {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [unit, setUnit] = useState<UnitType | null>(null);
  const [menuFilter, setMenuFilter] = useState<UnitType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<{item: MenuItem, quantity: number}[]>([]);
  const [guest, setGuest] = useState({ name: 'Walk-in Guest', email: '', phone: '' });
  const [payments, setPayments] = useState<Partial<TransactionPayment>[]>([{ method: SettlementMethod.POS, amount: 0 }]);
  const [discount, setDiscount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedTransaction, setSavedTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    const unsubMenu = onSnapshot(collection(db, 'menu'), (snapshot) => {
      setMenu(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    });
    const unsubSettings = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (snapshot.exists()) setSettings(snapshot.data() as AppSettings);
    });
    return () => { unsubMenu(); unsubSettings(); };
  }, []);

  const selectUnit = (u: UnitType) => {
    setUnit(u);
    setMenuFilter(u); // Default filter to selected unit
  };

  const addToCart = (item: MenuItem) => {
    const existing = cart.find(c => c.item.id === item.id);
    if (existing) {
      setCart(cart.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { item, quantity: 1 }]);
    }
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(c => c.item.id !== id));
  };

  const updateQuantity = (id: string, q: number) => {
    if (q <= 0) return removeFromCart(id);
    setCart(cart.map(c => c.item.id === id ? { ...c, quantity: q } : c));
  };

  const subtotal = cart.reduce((acc, c) => acc + (c.item.price * c.quantity), 0);
  const total = Math.max(0, subtotal - discount);
  
  const vatRate = settings?.vat || 0.075;
  const scRate = settings?.serviceCharge || 0.10;
  const divisor = 1 + vatRate + scRate;
  
  const baseValue = total / divisor;
  const taxAmount = baseValue * vatRate;
  const serviceCharge = baseValue * scRate;
  
  const totalPaid = payments.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const balance = total - totalPaid;

  const addPaymentRow = () => setPayments([...payments, { method: SettlementMethod.POS, amount: 0 }]);
  const updatePayment = (idx: number, field: keyof TransactionPayment, value: any) => {
    const newPayments = [...payments];
    (newPayments[idx] as any)[field] = value;
    setPayments(newPayments);
  };

  const handleSubmit = async () => {
    if (!unit) return alert('Revenue unit not selected.');
    if (cart.length === 0) return alert('Cannot process empty cart.');
    setIsSubmitting(true);
    try {
      const items: TransactionItem[] = cart.map(c => ({
        description: c.item.name,
        quantity: c.quantity,
        price: c.item.price,
        total: c.item.price * c.quantity
      }));

      const selectedBank = unit === UnitType.ZENZA ? settings?.zenzaBanks?.[0] : settings?.whispersBanks?.[0];
      
      const finalPayments: TransactionPayment[] = payments
        .filter(p => (p.amount || 0) > 0)
        .map(p => ({
          method: p.method as SettlementMethod,
          amount: p.amount as number,
          timestamp: Date.now()
        }));

      const txData = {
        reference: `POS-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        type: 'POS',
        unit,
        source: 'App',
        guestName: guest.name,
        email: guest.email,
        phone: guest.phone,
        items,
        subtotal: baseValue,
        taxAmount,
        serviceCharge,
        discountAmount: discount,
        totalAmount: total,
        paidAmount: totalPaid,
        payments: finalPayments,
        balance,
        status: balance <= 0 ? SettlementStatus.SETTLED : SettlementStatus.UNPAID,
        settlementMethod: finalPayments.length > 0 ? finalPayments[0].method : SettlementMethod.POS,
        selectedBank: selectedBank || null,
        createdBy: user.uid,
        userId: user.uid,
        cashierName: user.displayName,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const docRef = await addDoc(collection(db, 'transactions'), txData);
      setSavedTransaction({ id: docRef.id, ...txData } as Transaction);
    } catch (err) {
      console.error(err);
      alert('Error: Synchronization failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (savedTransaction) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="bg-[#13263A] w-full max-w-md rounded-2xl border border-gray-700 p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto border border-green-500/30">
             <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">TRANSACTION SYNCED</h2>
          <p className="text-gray-400 text-xs tracking-widest font-bold">REFERENCE: {savedTransaction.reference}</p>
          <div className="flex gap-4">
             <button onClick={onClose} className="flex-1 py-4 bg-[#C8A862] text-black font-bold rounded-xl uppercase text-xs tracking-widest">Done</button>
          </div>
          <ReceiptPreview transaction={savedTransaction} onClose={onClose} />
        </div>
      </div>
    );
  }

  // Mandatory Unit Selection Screen
  if (!unit) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="bg-[#13263A] w-full max-w-md rounded-2xl border border-gray-700 p-8 text-center space-y-8 shadow-2xl">
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-[#C8A862] uppercase tracking-tight">REVENUE UNIT SELECTION</h2>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em]">Initialize POS Terminal Session</p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <button 
              onClick={() => selectUnit(UnitType.ZENZA)}
              className="py-8 bg-purple-600/10 border-2 border-purple-500/30 rounded-2xl text-purple-400 hover:bg-purple-600 hover:text-white transition-all group"
            >
              <span className="text-lg font-black uppercase tracking-widest group-hover:scale-110 block transition-transform">ZENZA UNIT</span>
              <span className="text-[9px] font-bold opacity-60">Revenue Stream A</span>
            </button>
            <button 
              onClick={() => selectUnit(UnitType.WHISPERS)}
              className="py-8 bg-blue-600/10 border-2 border-blue-500/30 rounded-2xl text-blue-400 hover:bg-blue-600 hover:text-white transition-all group"
            >
              <span className="text-lg font-black uppercase tracking-widest group-hover:scale-110 block transition-transform">WHISPERS UNIT</span>
              <span className="text-[9px] font-bold opacity-60">Revenue Stream B</span>
            </button>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xs font-black uppercase tracking-widest">Cancel Session</button>
        </div>
      </div>
    );
  }

  const filteredMenuItems = menu.filter(item => {
    const matchesUnit = menuFilter === 'ALL' || item.unit === menuFilter || item.unit === 'ALL';
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesUnit && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#13263A] w-full max-w-6xl h-[90vh] rounded-2xl border border-gray-700 overflow-hidden flex flex-col md:flex-row shadow-2xl">
        {/* Left: Menu Dispatch */}
        <div className="flex-[3] flex flex-col border-r border-gray-700/50 overflow-hidden">
          <div className="p-6 border-b border-gray-700/50 bg-[#0B1C2D]/30 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black text-[#C8A862] uppercase tracking-tight">WALK-IN POS DISPATCH</h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Active Revenue Source: {unit}</p>
              </div>
              <div className="flex bg-[#0B1C2D] p-1 rounded-lg border border-gray-700 opacity-50">
                 <span className="px-4 py-2 text-[10px] font-black uppercase text-[#C8A862]">Locked: {unit}</span>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-center">
              {/* Search Bar */}
              <div className="relative flex-1 w-full">
                <input 
                  type="text"
                  placeholder="SEARCH MENU..."
                  className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg py-2.5 px-10 text-xs text-white font-bold tracking-widest uppercase focus:outline-none focus:border-[#C8A862] transition-colors"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <svg className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                )}
              </div>

              {/* Quick Unit Filters */}
              <div className="flex bg-[#0B1C2D] p-1 rounded-lg border border-gray-700 shrink-0">
                <button 
                  onClick={() => setMenuFilter(UnitType.ZENZA)}
                  className={`px-3 py-1.5 text-[9px] font-black uppercase rounded transition-all ${menuFilter === UnitType.ZENZA ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                >
                  Zenza
                </button>
                <button 
                  onClick={() => setMenuFilter(UnitType.WHISPERS)}
                  className={`px-3 py-1.5 text-[9px] font-black uppercase rounded transition-all ${menuFilter === UnitType.WHISPERS ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                >
                  Whispers
                </button>
                <button 
                  onClick={() => setMenuFilter('ALL')}
                  className={`px-3 py-1.5 text-[9px] font-black uppercase rounded transition-all ${menuFilter === 'ALL' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}
                >
                  All Items
                </button>
              </div>
            </div>
          </div>

          {/* Menu Items Container - Grid with vertical scrolling */}
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-max">
            {filteredMenuItems.map(item => (
              <button 
                key={item.id} 
                onClick={() => addToCart(item)}
                className="bg-[#0B1C2D]/50 border border-gray-700/30 p-4 rounded-xl text-left hover:border-[#C8A862]/50 transition-all flex flex-col justify-between group active:scale-95 min-h-[140px]"
              >
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-[9px] text-gray-500 font-black uppercase">{item.category}</div>
                    {item.unit !== 'ALL' && (
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${item.unit === UnitType.ZENZA ? 'border-purple-500/30 text-purple-400' : 'border-blue-500/30 text-blue-400'}`}>
                        {item.unit}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold text-white group-hover:text-[#C8A862] line-clamp-2 leading-tight uppercase tracking-tight">{item.name}</div>
                </div>
                <div className="mt-4 text-[#C8A862] font-black">₦{item.price.toLocaleString()}</div>
              </button>
            ))}
            {filteredMenuItems.length === 0 && (
              <div className="col-span-full py-20 text-center">
                <p className="text-gray-600 uppercase text-[10px] font-black tracking-widest italic opacity-50 mb-2">No Matching Items Found</p>
                <button onClick={() => {setSearchQuery(''); setMenuFilter('ALL');}} className="text-[#C8A862] text-[9px] font-black uppercase underline tracking-widest">Clear Filters</button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Order Summary */}
        <div className="flex-[2] bg-[#0B1C2D]/50 flex flex-col overflow-hidden">
          <div className="p-6 border-b border-gray-700/50 flex justify-between items-center">
            <h3 className="text-xs font-black text-white uppercase tracking-widest">MANIFEST SUMMARY</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-xl font-bold">&times;</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="space-y-3">
              {cart.map(c => (
                <div key={c.item.id} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5 group">
                  <div className="flex-1">
                    <div className="text-xs font-bold text-white uppercase truncate pr-4">{c.item.name}</div>
                    <div className="text-[10px] text-gray-500">₦{c.item.price.toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQuantity(c.item.id, c.quantity - 1)} className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center text-white">-</button>
                    <span className="text-xs font-bold w-4 text-center">{c.quantity}</span>
                    <button onClick={() => updateQuantity(c.item.id, c.quantity + 1)} className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center text-white">+</button>
                  </div>
                  <div className="text-xs font-black text-[#C8A862] w-20 text-right">₦{(c.item.price * c.quantity).toLocaleString()}</div>
                  <button 
                    onClick={() => removeFromCart(c.item.id)}
                    className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors ml-1"
                    title="Remove item"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
              ))}
              {cart.length === 0 && (
                <div className="text-center py-20 text-gray-600 text-[10px] font-black uppercase tracking-widest italic opacity-50">Empty Manifest</div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="space-y-4 pt-6 border-t border-gray-700/50">
                <input 
                  className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-xs text-white outline-none focus:border-[#C8A862]" 
                  placeholder="Guest Name (Default: Walk-in)" 
                  value={guest.name} 
                  onChange={(e) => setGuest({...guest, name: e.target.value})} 
                />

                <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                   <div className="flex-1">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1">Apply Discount (₦)</label>
                      <input 
                        type="number"
                        className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm text-[#C8A862] font-black outline-none focus:border-[#C8A862]"
                        value={discount || ''}
                        onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                   </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-500">
                    <span>Split Settlement</span>
                    <button onClick={addPaymentRow} className="text-[#C8A862] hover:underline">+ Split</button>
                  </div>
                  {payments.map((p, idx) => (
                    <div key={idx} className="flex gap-2">
                      <select 
                        className="flex-1 bg-[#0B1C2D] border border-gray-700 rounded-lg p-2 text-[10px] text-white outline-none focus:border-[#C8A862]"
                        value={p.method}
                        onChange={(e) => updatePayment(idx, 'method', e.target.value as SettlementMethod)}
                      >
                        <option value={SettlementMethod.POS}>POS</option>
                        <option value={SettlementMethod.CASH}>Cash</option>
                        <option value={SettlementMethod.TRANSFER}>Transfer</option>
                      </select>
                      <input 
                        type="number" 
                        placeholder="Amount"
                        className="w-24 bg-[#0B1C2D] border border-gray-700 rounded-lg p-2 text-[10px] text-[#C8A862] font-black text-right outline-none focus:border-[#C8A862]"
                        value={p.amount}
                        onChange={(e) => updatePayment(idx, 'amount', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-4 space-y-2">
                  <div className="flex justify-between text-xs text-gray-500 font-bold uppercase tracking-tighter">
                    <span>Gross Ledger Val</span>
                    <span>₦{subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-lg font-black text-white uppercase tracking-tight pt-1">
                    <span>Net Valuation</span>
                    <span>₦{total.toLocaleString()}</span>
                  </div>
                  <div className="pt-2 border-t border-gray-700/30">
                    <div className="flex justify-between text-xs text-green-400 font-bold uppercase">
                      <span>Settled Amount</span>
                      <span>₦{totalPaid.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs text-red-500 font-bold uppercase">
                      <span>Outstanding</span>
                      <span>₦{balance.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 bg-[#0B1C2D] border-t border-gray-700/50">
            <button 
              disabled={isSubmitting || cart.length === 0} 
              onClick={handleSubmit}
              className="w-full py-5 bg-[#C8A862] text-[#0B1C2D] font-black rounded-xl hover:bg-[#B69651] transition-all uppercase tracking-[0.2em] shadow-xl text-xs disabled:opacity-50"
            >
              {isSubmitting ? 'SYCHRONIZING...' : 'COMMIT TRANSACTION'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POSModal;
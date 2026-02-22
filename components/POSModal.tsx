import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, doc, writeBatch, increment, updateDoc } from 'firebase/firestore';
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
  existingTransaction?: Transaction;
}

const POSModal: React.FC<POSModalProps> = ({ user, onClose, existingTransaction }) => {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [unit, setUnit] = useState<UnitType | null>(existingTransaction?.unit || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<{item: MenuItem, quantity: number}[]>([]);
  const [guest, setGuest] = useState({ name: existingTransaction?.guestName || 'Walk-in Guest' });
  const [payments, setPayments] = useState<Partial<TransactionPayment>[]>([{ method: SettlementMethod.POS, amount: 0 }]);
  const [discount, setDiscount] = useState(existingTransaction?.discountAmount || 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedTransaction, setSavedTransaction] = useState<Transaction | null>(null);
  const [menuFilter, setMenuFilter] = useState<'ALL' | UnitType>('ALL');

  const existingItems = existingTransaction?.items || [];
  const previousPaidAmount = existingTransaction?.paidAmount || 0;

  useEffect(() => {
    let isSubscribed = true;
    // Live synchronization for menu catalog and system settings
    const unsubMenu = onSnapshot(collection(db, 'menu'), (snapshot) => {
      if (!isSubscribed) return;
      setMenu(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    }, (err) => {
      console.error("POSModal menu listener error:", err);
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (!isSubscribed) return;
      if (snapshot.exists()) setSettings(snapshot.data() as AppSettings);
    }, (err) => {
      console.error("POSModal settings listener error:", err);
    });

    return () => { 
      isSubscribed = false;
      unsubMenu(); 
      unsubSettings(); 
    };
  }, []);

  const selectUnit = (u: UnitType) => {
    // Locked for security: Unit is chosen once and cannot be changed during the session
    setUnit(u);
  };

  const addToCart = (item: MenuItem) => {
    // Security Block: Items must be stocked before sale is permitted
    const available = (item.initialStock || 0) - (item.soldCount || 0);
    if (!item.initialStock || item.initialStock <= 0) {
      alert(`Access Restricted: ${item.name} has not been stocked yet and cannot be sold.`);
      return;
    }

    const inCart = cart.find(c => c.item.id === item.id)?.quantity || 0;
    if (available <= inCart) {
      alert(`Insufficient Stock: Only ${available} units of ${item.name} available.`);
      return;
    }

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
    const item = menu.find(m => m.id === id);
    if (item) {
      const available = (item.initialStock || 0) - (item.soldCount || 0);
      if (q > available) {
        alert(`Stock limit reached for ${item.name}.`);
        return;
      }
    }
    setCart(cart.map(c => c.item.id === id ? { ...c, quantity: q } : c));
  };

  const subtotalItems = cart.reduce((acc, c) => acc + (c.item.price * c.quantity), 0) + existingItems.reduce((acc, i) => acc + i.total, 0);
  const netAfterDiscount = Math.max(0, subtotalItems - discount);
  
  const taxes = settings?.taxes || [];
  const isInclusive = settings?.isTaxInclusive ?? true;
  const sumTaxRates = taxes.reduce((acc, t) => acc + t.rate, 0);

  let finalTotal = 0;
  let baseVal = 0;
  let vatSum = 0;
  let scSum = 0;

  if (isInclusive) {
    finalTotal = netAfterDiscount;
    baseVal = finalTotal / (1 + sumTaxRates);
    taxes.forEach(t => {
      const amt = baseVal * t.rate;
      if (t.type === 'VAT') vatSum += amt;
      else if (t.type === 'SC') scSum += amt;
      else vatSum += amt;
    });
  } else {
    baseVal = netAfterDiscount;
    taxes.forEach(t => {
      const amt = baseVal * t.rate;
      if (t.type === 'VAT') vatSum += amt;
      else if (t.type === 'SC') scSum += amt;
      else vatSum += amt;
    });
    finalTotal = baseVal + vatSum + scSum;
  }
  
  const totalPaid = payments.reduce((acc, curr) => acc + (curr.amount || 0), 0) + previousPaidAmount;
  const balance = Math.max(0, finalTotal - totalPaid);

  const addPaymentRow = () => setPayments([...payments, { method: SettlementMethod.POS, amount: 0 }]);
  const removePaymentRow = (idx: number) => {
    if (payments.length > 1) setPayments(payments.filter((_, i) => i !== idx));
  };
  const updatePayment = (idx: number, field: keyof TransactionPayment, value: any) => {
    const newPayments = [...payments];
    (newPayments[idx] as any)[field] = value;
    setPayments(newPayments);
  };

  const handleSubmit = async () => {
    if (!unit) return alert('Revenue unit not selected.');
    if (cart.length === 0 && !existingTransaction) return alert('Cannot process empty cart.');
    
    setIsSubmitting(true);
    const batch = writeBatch(db);
    
    try {
      const newItems: TransactionItem[] = cart.map(c => ({
        itemId: c.item.id,
        description: c.item.description ? `${c.item.name} (${c.item.description})` : c.item.name,
        quantity: c.quantity,
        price: c.item.price,
        total: c.item.price * c.quantity
      }));

      const allItems = [...existingItems, ...newItems];

      // Direct stock update via atomic increment for NEW items only
      cart.forEach(c => {
        const itemRef = doc(db, 'menu', c.item.id);
        batch.update(itemRef, { soldCount: increment(c.quantity) });
      });

      const selectedBank = unit === UnitType.ZENZA ? settings?.zenzaBanks?.[0] : settings?.whispersBanks?.[0];
      
      const newPayments: TransactionPayment[] = payments
        .filter(p => (p.amount || 0) > 0)
        .map(p => ({
          method: p.method as SettlementMethod,
          amount: p.amount as number,
          timestamp: Date.now()
        }));

      const allPayments = [...(existingTransaction?.payments || []), ...newPayments];

      const txData: any = {
        reference: existingTransaction?.reference || `POS-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        type: 'POS',
        unit, // This is the locked unit chosen at the start
        source: 'App',
        guestName: guest.name,
        items: allItems,
        subtotal: baseVal,
        taxAmount: vatSum,
        serviceCharge: scSum,
        discountAmount: discount,
        totalAmount: finalTotal,
        paidAmount: totalPaid,
        payments: allPayments,
        balance: balance,
        status: balance <= 0 ? SettlementStatus.SETTLED : SettlementStatus.UNPAID,
        settlementMethod: allPayments.length > 0 ? allPayments[allPayments.length - 1].method : SettlementMethod.POS,
        selectedBank: selectedBank || null,
        createdBy: existingTransaction?.createdBy || user.uid,
        userId: existingTransaction?.userId || user.uid,
        cashierName: user.displayName,
        createdAt: existingTransaction?.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      if (existingTransaction) {
        await updateDoc(doc(db, 'transactions', existingTransaction.id), txData);
        await batch.commit();
        setSavedTransaction({ id: existingTransaction.id, ...txData } as Transaction);
      } else {
        const docRef = await addDoc(collection(db, 'transactions'), txData);
        await batch.commit();
        setSavedTransaction({ id: docRef.id, ...txData } as Transaction);
      }
    } catch (err) {
      console.error(err);
      alert('Sync Failure: Transaction was not recorded. Retrying terminal handshake.');
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
          <button onClick={onClose} className="w-full py-4 bg-[#C8A862] text-[#0B1C2D] font-bold rounded-xl uppercase text-xs tracking-widest">Done</button>
          <ReceiptPreview transaction={savedTransaction} onClose={onClose} />
        </div>
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="bg-[#13263A] w-full max-w-md rounded-2xl border border-gray-700 p-8 text-center space-y-8 shadow-2xl">
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-[#C8A862] uppercase tracking-tight">TERMINAL AUTHENTICATION</h2>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em]">Select Revenue Unit for this session</p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <button onClick={() => selectUnit(UnitType.ZENZA)} className="py-8 bg-purple-600/10 border-2 border-purple-500/30 rounded-2xl text-purple-400 hover:bg-purple-600 hover:text-white transition-all group">
              <span className="text-lg font-black uppercase tracking-widest group-hover:scale-110 block transition-transform">ZENZA UNIT</span>
            </button>
            <button onClick={() => selectUnit(UnitType.WHISPERS)} className="py-8 bg-blue-600/10 border-2 border-blue-500/30 rounded-2xl text-blue-400 hover:bg-blue-600 hover:text-white transition-all group">
              <span className="text-lg font-black uppercase tracking-widest group-hover:scale-110 block transition-transform">WHISPERS UNIT</span>
            </button>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xs font-black uppercase tracking-widest">Close Terminal</button>
        </div>
      </div>
    );
  }

  const filteredMenuItems = menu.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = menuFilter === 'ALL' || item.unit === menuFilter || item.unit === 'ALL';
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm font-inter">
      <div className="bg-[#13263A] w-full max-w-7xl h-[92vh] rounded-3xl border border-white/5 overflow-hidden flex flex-col md:flex-row shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        
        {/* LEFT PANEL: MENU DISPATCH */}
        <div className="flex-[3] flex flex-col border-r border-white/5 overflow-hidden bg-[#0B1C2D]">
          <div className="p-8 border-b border-white/5 bg-white/[0.02] space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter">WALK-IN POS DISPATCH</h2>
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.3em] mt-1">Terminal Session: <span className="text-[#C8A862]">{unit} Unit</span> (LOCKED)</p>
              </div>
              <div className="flex bg-[#13263A] p-1 rounded-xl border border-white/5">
                <button onClick={() => setMenuFilter('ALL')} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${menuFilter === 'ALL' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>Global Menu</button>
                <button onClick={() => setMenuFilter(UnitType.ZENZA)} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${menuFilter === UnitType.ZENZA ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}>Zenza</button>
                <button onClick={() => setMenuFilter(UnitType.WHISPERS)} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${menuFilter === UnitType.WHISPERS ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}>Whispers</button>
              </div>
            </div>

            <div className="relative">
              <input type="text" placeholder="SEARCH MENU CATALOG..." className="w-full bg-[#13263A] border border-white/10 rounded-2xl py-4 px-12 text-sm text-white font-bold tracking-widest uppercase focus:outline-none focus:border-[#C8A862]/50 transition-all placeholder:text-gray-700" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              <svg className="w-5 h-5 text-gray-700 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max">
            {filteredMenuItems.map(item => {
              const inCart = cart.find(c => c.item.id === item.id)?.quantity || 0;
              const hasNotBeenStocked = !item.initialStock || item.initialStock <= 0;
              const available = Math.max(0, (item.initialStock || 0) - (item.soldCount || 0) - inCart);
              const isLow = available > 0 && available <= (item.lowStockThreshold || 3);
              const isOut = available <= 0 || hasNotBeenStocked;
              
              return (
                <button key={item.id} disabled={isOut} onClick={() => addToCart(item)} className={`relative p-6 rounded-3xl text-left border-2 transition-all flex flex-col justify-between group active:scale-[0.97] min-h-[180px] shadow-lg ${
                  isOut ? 'bg-red-900/5 border-red-900/20 opacity-40 grayscale cursor-not-allowed' : isLow ? 'bg-[#13263A] border-red-500/30 hover:border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.1)]' : 'bg-[#13263A]/50 border-white/5 hover:border-[#C8A862]/50 hover:bg-[#13263A]'
                }`}>
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="text-[9px] text-gray-500 font-black uppercase tracking-widest">{item.category}</div>
                      <div className={`px-2 py-1 rounded-lg text-[9px] font-black tracking-tighter uppercase border ${
                        hasNotBeenStocked ? 'bg-red-600 text-white border-red-600' : isOut ? 'bg-red-600 text-white border-red-600 animate-pulse' : isLow ? 'bg-red-500/10 text-red-500 border-red-500/30' : 'bg-green-500/10 text-green-400 border-green-500/30'
                      }`}>
                        {hasNotBeenStocked ? 'UNSTOCKED' : isOut ? 'SOLD OUT' : `${available} LEFT`}
                      </div>
                    </div>
                    <div className="text-[13px] font-black uppercase leading-tight tracking-tight text-white group-hover:text-[#C8A862] transition-colors">{item.name}</div>
                    {item.description && <div className="text-[10px] text-gray-600 font-medium italic line-clamp-2 leading-relaxed">{item.description}</div>}
                  </div>
                  <div className="mt-6 flex items-end justify-between">
                    <div className="text-lg font-black text-white">₦{item.price.toLocaleString()}</div>
                    {!isOut && <div className="w-10 h-10 rounded-2xl bg-[#C8A862]/10 border border-[#C8A862]/20 flex items-center justify-center text-[#C8A862] group-hover:bg-[#C8A862] group-hover:text-[#0B1C2D] transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path></svg></div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANEL: MANIFEST SUMMARY (Matching Design Guidelines) */}
        <div className="flex-[2] bg-[#13263A] flex flex-col overflow-hidden shadow-[-20px_0_40px_rgba(0,0,0,0.3)]">
          <div className="p-8 border-b border-white/5 flex justify-between items-center text-white bg-white/[0.01]">
            <h3 className="text-sm font-black uppercase tracking-[0.3em]">MANIFEST SUMMARY</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-all text-3xl font-light">&times;</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
            {/* Guest Input (Design Match) */}
            <div className="bg-[#0B1C2D] border border-white/10 rounded-2xl p-1 shadow-inner">
               <input className="w-full bg-transparent p-5 text-sm text-white font-black uppercase tracking-widest outline-none placeholder:text-gray-700" placeholder="Walk-in Guest" value={guest.name} onChange={(e) => setGuest({...guest, name: e.target.value})} />
            </div>

            {/* Cart Items List */}
            <div className="space-y-3">
              {existingItems.length > 0 && (
                <div className="space-y-2 mb-4">
                  <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Existing Items</h4>
                  {existingItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4 bg-white/[0.01] p-3 rounded-xl border border-white/5 opacity-60">
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-black text-white uppercase truncate">{item.description}</div>
                        <div className="text-[9px] text-gray-500 font-bold mt-0.5">₦{item.price.toLocaleString()} x {item.quantity}</div>
                      </div>
                      <div className="text-[10px] font-black text-white">₦{item.total.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}

              {cart.length > 0 && <h4 className="text-[10px] font-black text-[#C8A862] uppercase tracking-widest px-1">New Additions</h4>}
              
              {cart.map(c => (
                <div key={c.item.id} className="flex items-center gap-4 bg-white/[0.03] p-4 rounded-2xl border border-white/5 relative group transition-all hover:bg-white/[0.05]">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-black text-white uppercase truncate">{c.item.name}</div>
                    <div className="text-[10px] text-gray-500 font-bold mt-0.5">₦{c.item.price.toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2 bg-[#0B1C2D] rounded-xl p-1 border border-white/5">
                    <button onClick={() => updateQuantity(c.item.id, c.quantity - 1)} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center text-gray-400 transition-colors">-</button>
                    <span className="text-[11px] font-black w-6 text-center text-white">{c.quantity}</span>
                    <button onClick={() => updateQuantity(c.item.id, c.quantity + 1)} className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center text-gray-400 transition-colors">+</button>
                  </div>
                  <button onClick={() => removeFromCart(c.item.id)} className="text-red-500/20 hover:text-red-500 transition-all p-1 text-xl leading-none">&times;</button>
                </div>
              ))}
              {cart.length === 0 && (
                <div className="py-12 text-center text-gray-600 font-black uppercase text-[10px] tracking-[0.5em] italic border-2 border-dashed border-white/5 rounded-3xl">Manifest Empty</div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="space-y-8">
                {/* Apply Discount Block (Design Match) */}
                <div className="bg-[#0B1C2D]/40 border border-white/10 rounded-2xl p-6 space-y-4">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">APPLY DISCOUNT (₦)</label>
                  <div className="border border-white/10 rounded-xl p-1 bg-[#0B1C2D]/80">
                    <input type="number" className="w-full bg-transparent p-4 text-3xl font-black text-white outline-none" value={discount || ''} placeholder="0.00" onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>

                {/* Split Settlement Block (Design Match) */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <h4 className="text-[11px] font-black text-gray-500 uppercase tracking-widest">SPLIT SETTLEMENT</h4>
                    <button onClick={addPaymentRow} className="text-[10px] font-black text-white uppercase tracking-widest hover:text-[#C8A862] transition-colors font-bold">+ Split</button>
                  </div>
                  <div className="space-y-3">
                    {payments.map((p, idx) => (
                      <div key={idx} className="flex gap-3 items-center">
                        <div className="flex-1 bg-[#0B1C2D]/50 border border-white/10 rounded-2xl p-1 overflow-hidden relative">
                          <select className="w-full bg-transparent p-4 text-[11px] text-white font-black uppercase tracking-widest outline-none appearance-none cursor-pointer" value={p.method} onChange={(e) => updatePayment(idx, 'method', e.target.value as SettlementMethod)}>
                            <option value={SettlementMethod.POS}>POS</option>
                            <option value={SettlementMethod.CASH}>CASH</option>
                            <option value={SettlementMethod.TRANSFER}>TRANSFER</option>
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-600">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                          </div>
                        </div>
                        <div className="w-32 bg-[#0B1C2D]/50 border border-white/10 rounded-2xl p-1">
                          <input type="number" className="w-full bg-transparent p-4 text-sm font-black text-white text-right outline-none placeholder:text-gray-700" placeholder="0" value={p.amount || ''} onChange={(e) => updatePayment(idx, 'amount', parseFloat(e.target.value) || 0)} />
                        </div>
                        {payments.length > 1 && (
                          <button onClick={() => removePaymentRow(idx)} className="text-red-500/50 hover:text-red-500 transition-colors text-2xl leading-none px-1">&times;</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial Totals Block (Design Match) */}
                <div className="pt-6 space-y-6 px-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">GROSS LEDGER VAL</span>
                    <span className="text-sm font-black text-gray-400 tracking-tighter uppercase">₦{subtotalItems.toLocaleString()}</span>
                  </div>
                  
                  <div className="flex justify-between items-end border-b border-white/10 pb-6">
                    <span className="text-3xl font-black text-white uppercase tracking-tighter">NET VALUATION</span>
                    <span className="text-3xl font-black text-white tracking-tighter uppercase">₦{finalTotal.toLocaleString()}</span>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-black text-green-500 uppercase tracking-widest">SETTLED AMOUNT</span>
                      <span className="text-sm font-black text-green-500 tracking-tighter uppercase">₦{totalPaid.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-black text-red-500 uppercase tracking-widest">OUTSTANDING</span>
                      <span className="text-sm font-black text-red-500 tracking-tighter uppercase">₦{balance.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="p-8 bg-[#0B1C2D] border-t border-white/5">
            <button disabled={isSubmitting || cart.length === 0} onClick={handleSubmit} className="w-full py-6 bg-[#C8A862] text-[#0B1C2D] font-black rounded-3xl hover:bg-[#B69651] active:scale-[0.98] transition-all uppercase tracking-[0.3em] shadow-2xl text-xs disabled:opacity-50 disabled:grayscale">
              {isSubmitting ? 'AUTHORIZING SYNC...' : 'COMMIT TRANSACTION'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POSModal;
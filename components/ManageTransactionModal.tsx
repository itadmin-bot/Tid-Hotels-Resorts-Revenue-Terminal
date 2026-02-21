import React, { useState, useEffect } from 'react';
import { doc, updateDoc, onSnapshot, collection, writeBatch, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { Calendar, Plus, Trash2, Receipt, Save, X } from 'lucide-react';
import { 
  Transaction, 
  SettlementStatus, 
  SettlementMethod, 
  AppSettings, 
  BankAccount, 
  TransactionPayment, 
  TransactionItem, 
  MenuItem,
  Room
} from '../types';
import ReceiptPreview from './ReceiptPreview';
import { soundService } from '../services/soundService';

interface ManageTransactionModalProps {
  transaction: Transaction;
  onClose: () => void;
}

const ManageTransactionModal: React.FC<ManageTransactionModalProps> = ({ transaction, onClose }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [menuCatalog, setMenuCatalog] = useState<MenuItem[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [guestName, setGuestName] = useState(transaction.guestName);
  const [email, setEmail] = useState(transaction.email || '');
  const [phone, setPhone] = useState(transaction.phone || '');
  const [idType, setIdType] = useState(transaction.identityType || 'National ID');
  const [idNumber, setIdNumber] = useState(transaction.idNumber || '');
  
  // Stay Period Management
  const [stayPeriod, setStayPeriod] = useState({
    checkIn: transaction.roomDetails?.checkIn || '',
    checkOut: transaction.roomDetails?.checkOut || '',
    nights: transaction.roomDetails?.nights || 1
  });

  // Per-room addition dates (defaults to main stay period)
  const [roomAddDates, setRoomAddDates] = useState({
    checkIn: transaction.roomDetails?.checkIn || '',
    checkOut: transaction.roomDetails?.checkOut || ''
  });
  
  // Items Management
  const [items, setItems] = useState<TransactionItem[]>(transaction.items || []);
  
  // Multi-payment / Split Payment Management
  const [newPayments, setNewPayments] = useState<Partial<TransactionPayment>[]>([{ method: SettlementMethod.POS, amount: 0 }]);
  
  const [discount, setDiscount] = useState<number>(transaction.discountAmount || 0);
  const [selectedBank, setSelectedBank] = useState<BankAccount | undefined>(transaction.selectedBank);
  const [isSaving, setIsSaving] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    let isSubscribed = true;

    const unsubSettings = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (!isSubscribed) return;
      if (snapshot.exists()) setSettings(snapshot.data() as AppSettings);
    }, (err) => {
      console.error("ManageTransactionModal settings listener error:", err);
    });
    
    const unsubMenu = onSnapshot(collection(db, 'menu'), (snapshot) => {
      if (!isSubscribed) return;
      setMenuCatalog(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    }, (err) => {
      console.error("ManageTransactionModal menu listener error:", err);
    });

    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      if (!isSubscribed) return;
      setRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room)));
    }, (err) => {
      console.error("ManageTransactionModal rooms listener error:", err);
    });

    return () => {
      isSubscribed = false;
      unsubSettings();
      unsubMenu();
      unsubRooms();
    };
  }, []);

  // Automatic Night Calculation
  useEffect(() => {
    if (stayPeriod.checkIn && stayPeriod.checkOut) {
      const start = new Date(stayPeriod.checkIn);
      const end = new Date(stayPeriod.checkOut);
      start.setHours(12, 0, 0, 0);
      end.setHours(12, 0, 0, 0);
      const diffMs = end.getTime() - start.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      const finalNights = diffDays > 0 ? diffDays : 1;
      if (finalNights !== stayPeriod.nights) {
        setStayPeriod(prev => ({ ...prev, nights: finalNights }));
      }
    }
  }, [stayPeriod.checkIn, stayPeriod.checkOut]);

  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, price: 0, total: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof TransactionItem, value: any) => {
    const newItemsList = [...items];
    (newItemsList[index] as any)[field] = value;
    if (field === 'quantity' || field === 'price') {
      newItemsList[index].total = (newItemsList[index].quantity || 0) * (newItemsList[index].price || 0);
    }
    setItems(newItemsList);
  };

  const handleMenuSelect = (index: number, itemId: string) => {
    const selected = menuCatalog.find(m => m.id === itemId);
    if (selected) {
      // Correctly format the description with kitchen instructions for the receipt
      const fullDescription = selected.description 
        ? `${selected.name} (${selected.description})` 
        : selected.name;
      
      updateItem(index, 'description', fullDescription);
      updateItem(index, 'price', selected.price);
      updateItem(index, 'itemId', selected.id);
    }
  };

  const handleRoomSelect = (roomId: string) => {
    const selected = rooms.find(r => r.id === roomId);
    if (selected) {
      const start = new Date(roomAddDates.checkIn);
      const end = new Date(roomAddDates.checkOut);
      start.setHours(12, 0, 0, 0);
      end.setHours(12, 0, 0, 0);
      const diffMs = end.getTime() - start.getTime();
      const nights = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      
      const desc = `${selected.name} (${selected.type}) • ${roomAddDates.checkIn} to ${roomAddDates.checkOut} (${nights} Nights)`;
      setItems([...items, { 
        itemId: selected.id, 
        description: desc, 
        quantity: 1, 
        price: selected.price * nights, 
        total: selected.price * nights 
      }]);
    }
  };

  // Split Payment Actions
  const addPaymentLine = () => {
    setNewPayments([...newPayments, { method: SettlementMethod.POS, amount: 0 }]);
  };

  const removePaymentLine = (idx: number) => {
    if (newPayments.length > 1) {
      setNewPayments(newPayments.filter((_, i) => i !== idx));
    }
  };

  const updatePaymentLine = (idx: number, field: keyof TransactionPayment, value: any) => {
    const updated = [...newPayments];
    (updated[idx] as any)[field] = value;
    setNewPayments(updated);
  };

  // Financial Calculations
  const grossSubtotal = items.reduce((acc, curr) => acc + curr.total, 0);
  const netTotal = Math.max(0, grossSubtotal - discount);
  
  const vatRate = settings?.vat || 0.075;
  const scRate = settings?.serviceCharge || 0.10;
  const divisor = 1 + vatRate + scRate;
  
  const baseValue = netTotal / divisor;
  const taxAmount = baseValue * vatRate;
  const serviceCharge = baseValue * scRate;
  
  const currentPaid = transaction.paidAmount || 0;
  const totalNewPayment = newPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
  const projectedPaidAmount = currentPaid + totalNewPayment;
  const projectedBalance = Math.max(0, netTotal - projectedPaidAmount);

  const handleUpdate = async () => {
    if (items.some(i => !i.description || i.price < 0)) {
      alert('Error: Ensure all line items have valid descriptions and non-negative prices.');
      return;
    }

    setIsSaving(true);
    const batch = writeBatch(db);
    try {
      const updatedPayments = [...(transaction.payments || [])];
      
      // Process all non-zero new payment lines
      newPayments.forEach(p => {
        if (p.amount && p.amount > 0) {
          updatedPayments.push({
            method: p.method || SettlementMethod.POS,
            amount: p.amount,
            timestamp: Date.now()
          });
        }
      });

      // Track new rooms to update inventory
      const existingItemIds = new Set(transaction.items.map(i => i.itemId));
      items.forEach(item => {
        if (item.itemId && !existingItemIds.has(item.itemId)) {
          // Check if it's a room
          const isRoom = rooms.some(r => r.id === item.itemId);
          if (isRoom) {
            const roomRef = doc(db, 'rooms', item.itemId);
            batch.update(roomRef, { bookedCount: increment(1) });
          } else {
            // Check if it's a menu item
            const isMenu = menuCatalog.some(m => m.id === item.itemId);
            if (isMenu) {
              const menuRef = doc(db, 'menu', item.itemId);
              batch.update(menuRef, { soldCount: increment(item.quantity) });
            }
          }
        }
      });

      const updates: any = {
        guestName,
        email,
        phone,
        identityType: idType,
        idNumber,
        items,
        subtotal: baseValue,
        taxAmount,
        serviceCharge,
        discountAmount: discount,
        totalAmount: netTotal,
        paidAmount: projectedPaidAmount,
        payments: updatedPayments,
        balance: projectedBalance,
        status: projectedBalance <= 0 ? SettlementStatus.SETTLED : SettlementStatus.UNPAID,
        selectedBank: selectedBank || null,
        updatedAt: Date.now()
      };

      // Update roomDetails if stay period changed or multiple rooms present
      const roomItems = items.filter(i => rooms.some(r => r.id === i.itemId));
      if (transaction.type === 'FOLIO') {
        updates.roomDetails = {
          ...transaction.roomDetails,
          checkIn: stayPeriod.checkIn,
          checkOut: stayPeriod.checkOut,
          nights: stayPeriod.nights,
          roomName: roomItems.length > 1 ? 'Multiple Rooms' : (roomItems[0]?.description.split(' (')[0] || transaction.roomDetails?.roomName || 'Room')
        };
      }

      // Set settlementMethod to the last added method if any
      if (totalNewPayment > 0) {
        const lastP = newPayments.filter(p => (p.amount || 0) > 0).pop();
        if (lastP) updates.settlementMethod = lastP.method;
      }

      batch.update(doc(db, 'transactions', transaction.id), updates);
      await batch.commit();
      soundService.play('success');
      onClose();
    } catch (err) {
      console.error(err);
      soundService.play('error');
      alert('Sync Failure: Error updating ledger. Check terminal authorization.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filter out items that have no stock or have not been stocked yet for new additions
  const availableStockCatalog = menuCatalog.filter(m => {
    const isStocked = m.initialStock > (m.soldCount || 0);
    // User requested to show all items (Zenza/Whispers) for Folio management too
    return isStocked;
  });

  const availableRooms = rooms.filter(r => r.totalInventory > r.bookedCount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#13263A] w-full max-w-2xl rounded-2xl border border-gray-700 overflow-hidden shadow-2xl flex flex-col max-h-[90vh] no-print">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-[#0B1C2D]/50">
          <div>
            <h2 className="text-xl font-black text-[#C8A862] uppercase tracking-tight">MANAGE REVENUE RECORD</h2>
            <p className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">{transaction.reference} • LOCKED SOURCE: {transaction.unit || 'HOTEL FOLIO'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-gray-700/50 pb-2">Guest Identity & Stay Period</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-[9px] font-bold text-gray-600 uppercase mb-1 block">Guest Full Name</label>
                <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#C8A862] outline-none font-bold" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
              </div>
              
              {transaction.type === 'FOLIO' && (
                <div className="col-span-2 grid grid-cols-2 gap-4 bg-[#0B1C2D]/30 p-4 rounded-xl border border-gray-700/30">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-gray-500 uppercase flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-[#EAD8B1]" />
                      Check-In Date
                    </label>
                    <input type="date" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-2 text-xs text-white outline-none focus:border-[#C8A862] accent-[#C8A862]" value={stayPeriod.checkIn} onChange={(e) => setStayPeriod({...stayPeriod, checkIn: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-gray-500 uppercase flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-[#EAD8B1]" />
                      Check-Out Date
                    </label>
                    <input type="date" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-2 text-xs text-white outline-none focus:border-[#C8A862] accent-[#C8A862]" value={stayPeriod.checkOut} onChange={(e) => setStayPeriod({...stayPeriod, checkOut: e.target.value})} />
                  </div>
                  <div className="col-span-2 text-center pt-2">
                    <span className="text-[10px] font-black text-[#C8A862] uppercase tracking-widest">{stayPeriod.nights} Nights Calculated</span>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[9px] font-bold text-gray-600 uppercase mb-1 block">Email</label>
                <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#C8A862] outline-none" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-600 uppercase mb-1 block">Phone</label>
                <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#C8A862] outline-none" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-700/50 pb-2">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Inventory Expenditure</h3>
              <div className="flex flex-col gap-2 items-end">
                {transaction.type === 'FOLIO' && (
                  <div className="flex gap-2 items-center bg-[#0B1C2D] p-2 rounded-lg border border-gray-700/50">
                    <div className="flex gap-1 items-center">
                      <Calendar className="w-5 h-5 text-[#EAD8B1]" />
                      <input type="date" className="bg-transparent text-[9px] text-white outline-none" value={roomAddDates.checkIn} onChange={(e) => setRoomAddDates({...roomAddDates, checkIn: e.target.value})} />
                    </div>
                    <span className="text-gray-600 text-[9px]">to</span>
                    <div className="flex gap-1 items-center">
                      <Calendar className="w-5 h-5 text-[#EAD8B1]" />
                      <input type="date" className="bg-transparent text-[9px] text-white outline-none" value={roomAddDates.checkOut} onChange={(e) => setRoomAddDates({...roomAddDates, checkOut: e.target.value})} />
                    </div>
                    <select 
                      className="bg-[#C8A862]/10 border border-[#C8A862]/20 rounded px-2 py-1 text-[9px] font-black text-[#C8A862] outline-none uppercase tracking-widest ml-2"
                      onChange={(e) => handleRoomSelect(e.target.value)}
                      defaultValue=""
                    >
                      <option value="" disabled>+ Add Room</option>
                      {availableRooms.map(r => (
                        <option key={r.id} value={r.id}>{r.name} (₦{r.price.toLocaleString()})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={addItem} className="text-[#C8A862] text-[10px] font-black hover:underline bg-[#C8A862]/10 px-3 py-1 rounded border border-[#C8A862]/20 uppercase tracking-widest flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Manual Entry
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="bg-[#0B1C2D]/50 p-3 rounded-lg border border-gray-700/50 space-y-2 group">
                  <div className="flex gap-2">
                    <select 
                      className="bg-[#0B1C2D] border border-gray-700 rounded p-2 text-[10px] text-gray-400 flex-1 outline-none focus:border-[#C8A862]"
                      onChange={(e) => handleMenuSelect(idx, e.target.value)}
                      defaultValue=""
                    >
                      <option value="" disabled>-- Select Stocked Menu Item --</option>
                      {availableStockCatalog.map(m => (
                        <option key={m.id} value={m.id}>{m.name} (₦{m.price.toLocaleString()}) - {m.initialStock - (m.soldCount || 0)} left</option>
                      ))}
                    </select>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="text-red-500/50 hover:text-red-500 transition-colors px-2">&times;</button>
                    )}
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <input 
                      className="col-span-12 md:col-span-7 bg-[#0B1C2D] border border-gray-800 rounded p-2 text-xs text-white"
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      placeholder="Item Description"
                    />
                    <input 
                      type="number"
                      className="col-span-6 md:col-span-2 bg-[#0B1C2D] border border-gray-800 rounded p-2 text-xs text-white text-center"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                    />
                    <input 
                      type="number"
                      className="col-span-6 md:col-span-3 bg-[#0B1C2D] border border-gray-800 rounded p-2 text-xs text-[#C8A862] font-black text-right"
                      value={item.price}
                      onChange={(e) => updateItem(idx, 'price', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-700/50 pb-2">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Accounting & Split Bill / Payment</h3>
              <div className="text-[10px] font-black text-green-400 tracking-tighter uppercase">Paid History: ₦{currentPaid.toLocaleString()}</div>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-[9px] font-bold text-[#C8A862] uppercase tracking-widest">Add New Payment Rows</label>
                <button 
                  onClick={addPaymentLine} 
                  className="text-[10px] font-black text-[#C8A862] bg-[#C8A862]/10 px-3 py-1 rounded border border-[#C8A862]/20 uppercase tracking-widest hover:bg-[#C8A862]/20"
                >
                  + Split Payment
                </button>
              </div>

              <div className="space-y-2">
                {newPayments.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 bg-[#C8A862]/5 p-3 rounded-xl border border-[#C8A862]/10 items-center">
                    <div className="col-span-6">
                      <select 
                        className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-xs text-white font-bold outline-none focus:border-[#C8A862]" 
                        value={p.method} 
                        onChange={(e) => updatePaymentLine(idx, 'method', e.target.value as SettlementMethod)}
                      >
                        <option value={SettlementMethod.POS}>POS Terminal</option>
                        <option value={SettlementMethod.CASH}>Cash</option>
                        <option value={SettlementMethod.TRANSFER}>Transfer</option>
                      </select>
                    </div>
                    <div className="col-span-5">
                      <input 
                        type="number" 
                        placeholder="Amount" 
                        className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm font-black text-white text-right outline-none focus:border-[#C8A862]" 
                        value={p.amount || ''} 
                        onChange={(e) => updatePaymentLine(idx, 'amount', parseFloat(e.target.value) || 0)} 
                      />
                    </div>
                    <div className="col-span-1 text-center">
                      {newPayments.length > 1 && (
                        <button onClick={() => removePaymentLine(idx)} className="text-red-500/50 hover:text-red-500 transition-colors">&times;</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-[#13263A] rounded-xl border border-gray-800">
                <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest block mb-1">Adjustment (Discount)</label>
                <input type="number" className="w-full bg-transparent text-sm font-black text-[#C8A862] outline-none" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} />
              </div>
              <div className={`p-4 rounded-xl border flex flex-col justify-center ${projectedBalance > 0 ? 'bg-red-500/5 border-red-500/20 text-red-500' : 'bg-green-500/5 border-green-500/20 text-green-400'}`}>
                <span className="text-[9px] font-black uppercase tracking-widest mb-1">Remaining Balance</span>
                <span className="text-lg font-black">₦{projectedBalance.toLocaleString()}</span>
              </div>
            </div>

            {transaction.payments && transaction.payments.length > 0 && (
              <div className="pt-6 space-y-3 border-t border-gray-700/30">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-[#C8A862] uppercase tracking-[0.2em]">Verified Payment History</label>
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{transaction.payments.length} Records Found</span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {[...transaction.payments].sort((a, b) => b.timestamp - a.timestamp).map((p, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 bg-black/20 p-3 rounded-xl border border-gray-800/50 hover:border-gray-700 transition-colors items-center">
                      <div className="col-span-4 flex flex-col">
                        <span className="text-[8px] text-gray-600 font-black uppercase tracking-tighter">Settlement Method</span>
                        <span className="text-[10px] text-white font-black uppercase tracking-tight">{p.method}</span>
                      </div>
                      <div className="col-span-5 flex flex-col">
                        <span className="text-[8px] text-gray-600 font-black uppercase tracking-tighter">Transaction Timestamp</span>
                        <span className="text-[10px] text-gray-400 font-medium">
                          {new Date(p.timestamp).toLocaleString('en-GB', { 
                            day: '2-digit', 
                            month: 'short', 
                            year: 'numeric',
                            hour: '2-digit', 
                            minute: '2-digit',
                            hour12: true 
                          })}
                        </span>
                      </div>
                      <div className="col-span-3 flex flex-col text-right">
                        <span className="text-[8px] text-gray-600 font-black uppercase tracking-tighter">Amount Paid</span>
                        <span className="text-[11px] text-green-400 font-black tracking-tighter">₦{p.amount.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="p-6 bg-[#0B1C2D] border-t border-gray-700 flex gap-4">
          <button onClick={() => setShowReceipt(true)} className="flex-1 py-4 border border-gray-700 text-gray-400 font-black rounded-xl uppercase tracking-widest text-[10px] hover:bg-white/5 transition-all">Preview Document</button>
          <button disabled={isSaving} onClick={handleUpdate} className="flex-[2] py-4 bg-[#C8A862] text-[#0B1C2D] font-black rounded-xl uppercase tracking-widest text-[10px] hover:bg-[#B69651] transition-all">
            {isSaving ? 'SYNCHRONIZING...' : 'AUTHORIZE UPDATES'}
          </button>
        </div>
      </div>
      {showReceipt && <ReceiptPreview transaction={{ ...transaction, items, totalAmount: netTotal, paidAmount: projectedPaidAmount, balance: projectedBalance }} onClose={() => setShowReceipt(false)} />}
    </div>
  );
};

export default ManageTransactionModal;
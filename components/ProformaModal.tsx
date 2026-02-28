import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/firebase';
import { Calendar, Plus, Trash2, Save, X, Download, Printer } from 'lucide-react';
import { BRAND } from '@/constants';
import { formatToLocalDate } from '@/utils/dateUtils';
import { 
  UserProfile, 
  SettlementStatus,
  AppSettings,
  Transaction,
  ProformaRoomItem,
  ProformaFoodItem,
  SettlementMethod,
  TransactionPayment,
  BankAccount,
  UnitType,
  TransactionItem,
  MenuItem,
  Room
} from '@/types';
import ProformaPreview from '@/components/ProformaPreview';

interface ProformaModalProps {
  user: UserProfile;
  onClose: () => void;
  existingTransaction?: Transaction;
}

const ProformaModal: React.FC<ProformaModalProps> = ({ user, onClose, existingTransaction }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [menuCatalog, setMenuCatalog] = useState<MenuItem[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [customer, setCustomer] = useState({ 
    name: existingTransaction?.guestName || '', 
    organisation: existingTransaction?.organisation || '', 
    address: existingTransaction?.address || '', 
    event: existingTransaction?.event || '', 
    eventPeriod: existingTransaction?.eventPeriod || '',
    unit: existingTransaction?.unit || '' as UnitType | '',
    preparedBy: existingTransaction?.preparedBy || ''
  });
  
  const [roomItems, setRoomItems] = useState<ProformaRoomItem[]>(existingTransaction?.proformaRooms || [{
    startDate: formatToLocalDate(Date.now()),
    endDate: formatToLocalDate(Date.now() + 86400000),
    noOfDays: 1,
    description: '',
    qty: 1,
    unitRate: 0,
    discountedRate: 0,
    total: 0,
    comments: ''
  }]);

  const [foodItems, setFoodItems] = useState<ProformaFoodItem[]>(existingTransaction?.proformaFood || [{
    startDate: formatToLocalDate(Date.now()),
    endDate: formatToLocalDate(Date.now()),
    noOfDays: 1,
    description: '',
    qty: 1,
    duration: '',
    unitRate: 0,
    discountedRate: 0,
    total: 0,
    comment: ''
  }]);

  const [payments, setPayments] = useState<Partial<TransactionPayment>[]>([{ method: SettlementMethod.TRANSFER, amount: existingTransaction?.paidAmount || 0 }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedTransaction, setSavedTransaction] = useState<Transaction | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (snapshot.exists()) setSettings(snapshot.data() as AppSettings);
    });

    const unsubMenu = onSnapshot(collection(db, 'menu'), (snapshot) => {
      setMenuCatalog(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    });

    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      setRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room)));
    });

    return () => {
      unsubSettings();
      unsubMenu();
      unsubRooms();
    };
  }, []);

  const calculateNights = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return 1;
    const start = new Date(startStr);
    const end = new Date(endStr);
    start.setHours(12, 0, 0, 0);
    end.setHours(12, 0, 0, 0);
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 1;
  };

  const addRoomRow = () => {
    setRoomItems([...roomItems, {
      startDate: formatToLocalDate(Date.now()),
      endDate: formatToLocalDate(Date.now() + 86400000),
      noOfDays: 1,
      description: '',
      qty: 1,
      unitRate: 0,
      discountedRate: 0,
      total: 0,
      comments: ''
    }]);
  };

  const removeRoomRow = (idx: number) => {
    if (roomItems.length > 1) setRoomItems(roomItems.filter((_, i) => i !== idx));
  };

  const updateRoomItem = (idx: number, field: keyof ProformaRoomItem, value: any) => {
    const newItems = [...roomItems];
    (newItems[idx] as any)[field] = value;
    if (field === 'startDate' || field === 'endDate') {
      newItems[idx].noOfDays = calculateNights(newItems[idx].startDate, newItems[idx].endDate);
    }
    newItems[idx].total = newItems[idx].qty * newItems[idx].noOfDays * (newItems[idx].discountedRate || newItems[idx].unitRate);
    setRoomItems(newItems);
  };

  const handleRoomSelect = (idx: number, roomId: string) => {
    const selected = rooms.find(r => r.id === roomId);
    if (selected) {
      updateRoomItem(idx, 'description', `${selected.name} (${selected.type})`);
      updateRoomItem(idx, 'unitRate', selected.price);
      updateRoomItem(idx, 'discountedRate', selected.price);
    }
  };

  const addFoodRow = () => {
    setFoodItems([...foodItems, {
      startDate: formatToLocalDate(Date.now()),
      endDate: formatToLocalDate(Date.now()),
      noOfDays: 1,
      description: '',
      qty: 1,
      duration: '',
      unitRate: 0,
      discountedRate: 0,
      total: 0,
      comment: ''
    }]);
  };

  const removeFoodRow = (idx: number) => {
    if (foodItems.length > 1) setFoodItems(foodItems.filter((_, i) => i !== idx));
  };

  const updateFoodItem = (idx: number, field: keyof ProformaFoodItem, value: any) => {
    const newItems = [...foodItems];
    (newItems[idx] as any)[field] = value;
    newItems[idx].total = newItems[idx].qty * (newItems[idx].discountedRate || newItems[idx].unitRate);
    setFoodItems(newItems);
  };

  const handleMenuSelect = (idx: number, itemId: string) => {
    const selected = menuCatalog.find(m => m.id === itemId);
    if (selected) {
      updateFoodItem(idx, 'description', selected.name);
      updateFoodItem(idx, 'unitRate', selected.price);
      updateFoodItem(idx, 'discountedRate', selected.price);
    }
  };

  const subtotal = roomItems.reduce((acc, item) => acc + item.total, 0) + foodItems.reduce((acc, item) => acc + item.total, 0);
  
  // DYNAMIC TAX CALCULATION (Matching Folio/POS logic)
  const taxes = settings?.taxes || [];
  const isInclusive = settings?.isTaxInclusive ?? true;
  const sumTaxRates = taxes.reduce((acc, t) => acc + t.rate, 0);

  let grandTotal = 0;
  let baseVal = 0;
  let vatSum = 0;
  let scSum = 0;

  if (isInclusive) {
    grandTotal = subtotal;
    baseVal = grandTotal / (1 + sumTaxRates);
    taxes.forEach(t => {
      const amt = baseVal * t.rate;
      if (t.type === 'VAT') vatSum += amt;
      else if (t.type === 'SC') scSum += amt;
      else vatSum += amt;
    });
  } else {
    baseVal = subtotal;
    taxes.forEach(t => {
      const amt = baseVal * t.rate;
      if (t.type === 'VAT') vatSum += amt;
      else if (t.type === 'SC') scSum += amt;
      else vatSum += amt;
    });
    grandTotal = baseVal + vatSum + scSum;
  }

  const totalPaid = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
  const balance = grandTotal - totalPaid;

  const handleSubmit = async () => {
    if (!customer.name || !customer.organisation) {
      alert('Please fill in Customer Name and Organisation.');
      return;
    }

    setIsSubmitting(true);
    try {
      const transactionItems: TransactionItem[] = [
        ...roomItems.map(item => ({
          description: `${item.description} (${item.noOfDays} Nights)`,
          quantity: item.qty,
          price: item.unitRate * item.noOfDays,
          total: item.total
        })),
        ...foodItems.map(item => ({
          description: item.description,
          quantity: item.qty,
          price: item.unitRate,
          total: item.total
        }))
      ];

      const txData = {
        reference: existingTransaction?.reference || `PRO-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        type: 'PROFORMA',
        unit: customer.unit || null,
        source: 'App',
        guestName: customer.name,
        organisation: customer.organisation,
        address: customer.address,
        event: customer.event,
        eventPeriod: customer.eventPeriod,
        proformaRooms: roomItems,
        proformaFood: foodItems,
        items: transactionItems,
        preparedBy: customer.preparedBy,
        subtotal: baseVal,
        taxAmount: vatSum,
        serviceCharge: scSum,
        discountAmount: 0,
        totalAmount: grandTotal,
        paidAmount: totalPaid,
        balance: Math.max(0, balance),
        status: balance <= 0 ? SettlementStatus.PAID : totalPaid > 0 ? SettlementStatus.PARTIAL : SettlementStatus.UNPAID,
        settlementMethod: payments[0]?.method || SettlementMethod.TRANSFER,
        payments: payments.filter(p => (p.amount || 0) > 0).map(p => ({ ...p, timestamp: Date.now() })),
        createdBy: user.uid,
        userId: user.uid,
        cashierName: user.displayName,
        createdAt: existingTransaction?.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      if (existingTransaction) {
        const batch = writeBatch(db);
        batch.update(doc(db, 'transactions', existingTransaction.id), txData);
        await batch.commit();
        setSavedTransaction({ id: existingTransaction.id, ...txData } as Transaction);
      } else {
        const docRef = await addDoc(collection(db, 'transactions'), txData);
        setSavedTransaction({ id: docRef.id, ...txData } as Transaction);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save Proforma Invoice.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (savedTransaction && !showPreview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="bg-[#13263A] w-full max-w-md rounded-2xl border border-gray-700 p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto border border-green-500/30">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">PROFORMA SAVED</h2>
          <div className="flex flex-col gap-3">
            <button onClick={() => setShowPreview(true)} className="w-full py-4 bg-[#C8A862] text-black font-bold rounded-xl uppercase text-xs tracking-widest flex items-center justify-center gap-2">
              <Printer className="w-4 h-4" /> View & Print Invoice
            </button>
            <button onClick={onClose} className="w-full py-4 bg-gray-700 text-white font-bold rounded-xl uppercase text-xs tracking-widest">
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showPreview && savedTransaction) {
    return <ProformaPreview transaction={savedTransaction} settings={settings} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#13263A] w-full max-w-6xl h-[90vh] rounded-2xl border border-gray-700 overflow-hidden shadow-2xl flex flex-col">
        <div className="p-6 border-b border-gray-700/50 flex justify-between items-center bg-[#13263A]">
          <h2 className="text-xl font-black text-[#C8A862] uppercase tracking-tighter">PROFORMA INVOICE GENERATOR</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-thin scrollbar-thumb-gray-700">
          {/* Customer Details */}
          <section className="space-y-6">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-700/50 pb-2">Customer Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-gray-500 uppercase">Customer Name</label>
                <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-[#C8A862]" value={customer.name} onChange={(e) => setCustomer({...customer, name: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-gray-500 uppercase">Organisation</label>
                <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-[#C8A862]" value={customer.organisation} onChange={(e) => setCustomer({...customer, organisation: e.target.value})} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-[9px] font-bold text-gray-500 uppercase">Address</label>
                <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-[#C8A862]" value={customer.address} onChange={(e) => setCustomer({...customer, address: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-gray-500 uppercase">Event</label>
                <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-[#C8A862]" value={customer.event} onChange={(e) => setCustomer({...customer, event: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-gray-500 uppercase">Event Period</label>
                <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-[#C8A862]" value={customer.eventPeriod} onChange={(e) => setCustomer({...customer, eventPeriod: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-gray-500 uppercase">Revenue Unit (Optional)</label>
                <select 
                  className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#C8A862] outline-none font-bold"
                  value={customer.unit}
                  onChange={(e) => setCustomer({ ...customer, unit: e.target.value as UnitType })}
                >
                  <option value="">Hotel (General)</option>
                  <option value={UnitType.ZENZA}>Zenza Unit</option>
                  <option value={UnitType.WHISPERS}>Whispers Unit</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-gray-500 uppercase">Prepared By</label>
                <input 
                  placeholder="Enter name of person preparing invoice"
                  className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-[#C8A862]" 
                  value={customer.preparedBy} 
                  onChange={(e) => setCustomer({...customer, preparedBy: e.target.value})} 
                />
              </div>
            </div>
          </section>

          {/* Room Booking Table */}
          <section className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-700/50 pb-2">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Room Booking and Meeting Spaces</h3>
              <button onClick={addRoomRow} className="px-3 py-1.5 border border-[#C8A862]/30 text-[#C8A862] rounded text-[9px] font-black uppercase hover:bg-[#C8A862]/10">+ Add Room Row</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-gray-500 uppercase text-[9px] font-black border-b border-gray-700/30">
                    <th className="p-2">Start Date</th>
                    <th className="p-2">End Date</th>
                    <th className="p-2">Days</th>
                    <th className="p-2">Select Room</th>
                    <th className="p-2">Description</th>
                    <th className="p-2">Qty</th>
                    <th className="p-2">Rate</th>
                    <th className="p-2">Disc. Rate</th>
                    <th className="p-2">Total</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {roomItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-1"><input type="date" className="bg-[#0B1C2D] border border-gray-700 rounded p-1 w-full text-[10px]" value={item.startDate} onChange={(e) => updateRoomItem(idx, 'startDate', e.target.value)} /></td>
                      <td className="p-1"><input type="date" className="bg-[#0B1C2D] border border-gray-700 rounded p-1 w-full text-[10px]" value={item.endDate} onChange={(e) => updateRoomItem(idx, 'endDate', e.target.value)} /></td>
                      <td className="p-1 text-center font-bold">{item.noOfDays}</td>
                      <td className="p-1">
                        <select className="bg-[#0B1C2D] border border-gray-700 rounded p-1 w-full text-[10px]" onChange={(e) => handleRoomSelect(idx, e.target.value)}>
                          <option value="">-- Select --</option>
                          {rooms.map(r => <option key={r.id} value={r.id}>{r.name} (₦{r.price.toLocaleString()})</option>)}
                        </select>
                      </td>
                      <td className="p-1"><input className="bg-[#0B1C2D] border border-gray-700 rounded p-1 w-full" value={item.description} onChange={(e) => updateRoomItem(idx, 'description', e.target.value)} /></td>
                      <td className="p-1"><input type="number" className="bg-[#0B1C2D] border border-gray-700 rounded p-1 w-12 text-center" value={item.qty} onChange={(e) => updateRoomItem(idx, 'qty', parseInt(e.target.value) || 0)} /></td>
                      <td className="p-1"><input type="number" className="bg-[#0B1C2D] border border-gray-700 rounded p-1 w-20 text-right" value={item.unitRate} onChange={(e) => updateRoomItem(idx, 'unitRate', parseFloat(e.target.value) || 0)} /></td>
                      <td className="p-1"><input type="number" className="bg-[#0B1C2D] border border-gray-700 rounded p-1 w-20 text-right" value={item.discountedRate} onChange={(e) => updateRoomItem(idx, 'discountedRate', parseFloat(e.target.value) || 0)} /></td>
                      <td className="p-1 text-right font-black">₦{item.total.toLocaleString()}</td>
                      <td className="p-1 text-center"><button onClick={() => removeRoomRow(idx)} className="text-red-500">&times;</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Food & Beverage Table */}
          <section className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-700/50 pb-2">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Food & Beverage Requirement</h3>
              <button onClick={addFoodRow} className="px-3 py-1.5 border border-[#C8A862]/30 text-[#C8A862] rounded text-[9px] font-black uppercase hover:bg-[#C8A862]/10">+ Add Food Row</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-gray-500 uppercase text-[9px] font-black border-b border-gray-700/30">
                    <th className="p-2">Start Date</th>
                    <th className="p-2">Select Item</th>
                    <th className="p-2">Description</th>
                    <th className="p-2">Qty</th>
                    <th className="p-2">Duration</th>
                    <th className="p-2">Rate</th>
                    <th className="p-2">Disc. Rate</th>
                    <th className="p-2">Total</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {foodItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-1"><input type="date" className="bg-[#0B1C2D] border border-gray-700 rounded p-1 w-full text-[10px]" value={item.startDate} onChange={(e) => updateFoodItem(idx, 'startDate', e.target.value)} /></td>
                      <td className="p-1">
                        <select className="bg-[#0B1C2D] border border-gray-700 rounded p-1 w-full text-[10px]" onChange={(e) => handleMenuSelect(idx, e.target.value)}>
                          <option value="">-- Select --</option>
                          {menuCatalog.map(m => <option key={m.id} value={m.id}>{m.name} (₦{m.price.toLocaleString()})</option>)}
                        </select>
                      </td>
                      <td className="p-1"><input className="bg-[#0B1C2D] border border-gray-700 rounded p-1 w-full" value={item.description} onChange={(e) => updateFoodItem(idx, 'description', e.target.value)} /></td>
                      <td className="p-1"><input type="number" className="bg-[#0B1C2D] border border-gray-700 rounded p-1 w-12 text-center" value={item.qty} onChange={(e) => updateFoodItem(idx, 'qty', parseInt(e.target.value) || 0)} /></td>
                      <td className="p-1"><input className="bg-[#0B1C2D] border border-gray-700 rounded p-1 w-20" value={item.duration || ''} onChange={(e) => updateFoodItem(idx, 'duration', e.target.value)} /></td>
                      <td className="p-1"><input type="number" className="bg-[#0B1C2D] border border-gray-700 rounded p-1 w-20 text-right" value={item.unitRate} onChange={(e) => updateFoodItem(idx, 'unitRate', parseFloat(e.target.value) || 0)} /></td>
                      <td className="p-1"><input type="number" className="bg-[#0B1C2D] border border-gray-700 rounded p-1 w-20 text-right" value={item.discountedRate} onChange={(e) => updateFoodItem(idx, 'discountedRate', parseFloat(e.target.value) || 0)} /></td>
                      <td className="p-1 text-right font-black">₦{item.total.toLocaleString()}</td>
                      <td className="p-1 text-center"><button onClick={() => removeFoodRow(idx)} className="text-red-500">&times;</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Settlement Section */}
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-700/50 pb-2">Settlement</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-gray-500 uppercase">Payment Method</label>
                  <select className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white" value={payments[0].method} onChange={(e) => setPayments([{ ...payments[0], method: e.target.value as SettlementMethod }])}>
                    <option value={SettlementMethod.TRANSFER}>Bank Transfer</option>
                    <option value={SettlementMethod.CARD}>Card / POS</option>
                    <option value={SettlementMethod.CASH}>Cash</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-gray-500 uppercase">Amount Paid (₦)</label>
                  <input type="number" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white font-bold" value={payments[0].amount || ''} onChange={(e) => setPayments([{ ...payments[0], amount: parseFloat(e.target.value) || 0 }])} placeholder="0.00" />
                </div>
              </div>
              <div className="bg-[#0B1C2D]/50 p-6 rounded-2xl border border-gray-700/50 space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 uppercase font-bold">Sub Total:</span>
                  <span className="text-white font-black">₦{baseVal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 uppercase font-bold">Service Charge:</span>
                  <span className="text-white font-black">₦{scSum.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 uppercase font-bold">VAT / Taxes:</span>
                  <span className="text-white font-black">₦{vatSum.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-lg border-t border-gray-700 pt-3">
                  <span className="text-[#C8A862] uppercase font-black">Grand Total:</span>
                  <span className="text-[#C8A862] font-black">₦{grandTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs pt-2">
                  <span className="text-red-500 uppercase font-bold">Balance Due:</span>
                  <span className="text-red-500 font-black">₦{balance.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="p-6 bg-[#0B1C2D] border-t border-gray-700">
          <button 
            disabled={isSubmitting || !customer.name || !customer.organisation} 
            onClick={handleSubmit} 
            className="w-full py-5 bg-[#C8A862] text-black font-black rounded-xl uppercase tracking-widest text-xs shadow-xl active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            {isSubmitting ? 'SAVING PROFORMA...' : existingTransaction ? 'UPDATE PROFORMA INVOICE' : 'GENERATE PROFORMA INVOICE'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProformaModal;

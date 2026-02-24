import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, doc, writeBatch, increment } from 'firebase/firestore';
import { db } from '@/firebase';
import { Calendar, Plus, Trash2, Receipt, Save, X } from 'lucide-react';
import { 
  UserProfile, 
  SettlementStatus,
  Room,
  AppSettings,
  Transaction,
  TransactionItem,
  MenuItem,
  SettlementMethod,
  TransactionPayment,
  BankAccount
} from '@/types';
import ReceiptPreview from '@/components/ReceiptPreview';

interface RoomBooking {
  roomId: string;
  quantity: number;
  checkIn: string;
  checkOut: string;
}

interface FolioModalProps {
  user: UserProfile;
  onClose: () => void;
}

const FolioModal: React.FC<FolioModalProps> = ({ user, onClose }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [guest, setGuest] = useState({ name: '', idType: 'National ID', idNumber: '', email: '', phone: '' });
  const [bookings, setBookings] = useState<RoomBooking[]>([{ 
    roomId: '', 
    quantity: 1, 
    checkIn: new Date().toISOString().split('T')[0], 
    checkOut: new Date(Date.now() + 86400000).toISOString().split('T')[0] 
  }]);
  const [additionalCharges, setAdditionalCharges] = useState<TransactionItem[]>([]);
  const [payments, setPayments] = useState<Partial<TransactionPayment>[]>([{ method: SettlementMethod.TRANSFER, amount: 0 }]);
  const [targetBank, setTargetBank] = useState<BankAccount | 'ALL' | null>(null);
  const [discount, setDiscount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedTransaction, setSavedTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    let isSubscribed = true;

    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      if (!isSubscribed) return;
      setRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room)));
    }, (err) => {
      console.error("FolioModal rooms listener error:", err);
    });

    const unsubMenu = onSnapshot(collection(db, 'menu'), (snapshot) => {
      if (!isSubscribed) return;
      setMenuItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    }, (err) => {
      console.error("FolioModal menu listener error:", err);
    });

    const unsubTransactions = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      if (!isSubscribed) return;
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
    }, (err) => {
      console.error("FolioModal transactions listener error:", err);
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (!isSubscribed) return;
      if (snapshot.exists()) {
        const data = snapshot.data() as AppSettings;
        setSettings(data);
        if (!targetBank && data.invoiceBanks && data.invoiceBanks.length > 0) {
          setTargetBank('ALL'); // Default to Consolidated for new folios
        }
      }
    }, (err) => {
      console.error("FolioModal settings listener error:", err);
    });

    return () => { 
      isSubscribed = false;
      unsubRooms(); 
      unsubMenu();
      unsubTransactions();
      unsubSettings(); 
    };
  }, []);

  // Sync room dates with main stay period if they are empty
  const addRoomRow = () => {
    const lastBooking = bookings[bookings.length - 1];
    setBookings([...bookings, { 
      roomId: '', 
      quantity: 1, 
      checkIn: lastBooking?.checkIn || new Date().toISOString().split('T')[0], 
      checkOut: lastBooking?.checkOut || new Date(Date.now() + 86400000).toISOString().split('T')[0] 
    }]);
  };

  const removeRoomRow = (idx: number) => {
    if (bookings.length > 1) {
      setBookings(bookings.filter((_, i) => i !== idx));
    }
  };
  const addPaymentRow = () => setPayments([...payments, { method: SettlementMethod.TRANSFER, amount: 0 }]);
  const removePaymentRow = (idx: number) => {
    if (payments.length > 1) {
      setPayments(payments.filter((_, i) => i !== idx));
    }
  };

  const updateBooking = (idx: number, field: keyof RoomBooking, value: any) => {
    const newBookings = [...bookings];
    (newBookings[idx] as any)[field] = value;
    setBookings(newBookings);
  };

  const updatePayment = (idx: number, field: keyof TransactionPayment, value: any) => {
    const newPayments = [...payments];
    (newPayments[idx] as any)[field] = value;
    setPayments(newPayments);
  };

  const addCharge = (item?: MenuItem) => {
    if (item) {
      setAdditionalCharges([...additionalCharges, {
        itemId: item.id,
        description: item.name,
        quantity: 1,
        price: item.price,
        total: item.price
      }]);
    } else {
      setAdditionalCharges([...additionalCharges, {
        description: '',
        quantity: 1,
        price: 0,
        total: 0
      }]);
    }
  };

  const updateCharge = (idx: number, field: keyof TransactionItem, value: any) => {
    const newCharges = [...additionalCharges];
    (newCharges[idx] as any)[field] = value;
    if (field === 'quantity' || field === 'price') {
      newCharges[idx].total = (newCharges[idx].quantity || 0) * (newCharges[idx].price || 0);
    }
    setAdditionalCharges(newCharges);
  };

  const removeCharge = (idx: number) => {
    setAdditionalCharges(additionalCharges.filter((_, i) => i !== idx));
  };

  const isRoomAvailable = (roomId: string, checkIn: string, checkOut: string) => {
    if (!roomId || !checkIn || !checkOut) return true;
    const start = new Date(checkIn).getTime();
    const end = new Date(checkOut).getTime();
    
    const overlaps = transactions.filter(t => {
      if (t.type !== 'FOLIO' || t.status === SettlementStatus.PAID) return false;
      
      const roomItems = t.items.filter(i => i.itemId === roomId);
      if (roomItems.length === 0) return false;
      
      // Check if any room item in the transaction overlaps
      return roomItems.some(item => {
        // We need to parse the dates from description if they aren't stored separately
        // But for simplicity and based on current structure, we use the main stay period
        const tStart = new Date(t.roomDetails?.checkIn || 0).getTime();
        const tEnd = new Date(t.roomDetails?.checkOut || 0).getTime();
        return (start < tEnd) && (end > tStart);
      });
    });
    
    const room = rooms.find(r => r.id === roomId);
    if (!room) return false;
    
    const currentlyBooked = overlaps.reduce((acc, t) => {
      const item = t.items.find(i => i.itemId === roomId);
      return acc + (item?.quantity || 0);
    }, 0);
    
    return (room.totalInventory - currentlyBooked) > 0;
  };

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

  const subtotalItems = bookings.reduce((acc, b) => {
    const room = rooms.find(r => r.id === b.roomId);
    const nights = calculateNights(b.checkIn, b.checkOut);
    return acc + (room ? room.price * b.quantity * nights : 0);
  }, 0) + additionalCharges.reduce((acc, c) => acc + c.total, 0);

  const netAfterDiscount = Math.max(0, subtotalItems - discount);
  
  // DYNAMIC TAX CALCULATION
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

  const totalPaid = payments.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const balance = finalTotal - totalPaid;

  const handleSubmit = async () => {
    // SECURITY PROTOCOL: Enforce mandatory fields for Corporate Folios
    if (!guest.name || !guest.idNumber || !guest.email) {
      alert('Security Protocol: Full Name, ID Card Number, and Corporate Email are mandatory for all Reservation Folios before authorization.');
      return;
    }

    if (bookings.some(b => !b.roomId || !b.checkIn || !b.checkOut)) {
      alert('Incomplete Manifest: Please finalize room selections and stay dates.');
      return;
    }

    // Overlap Validation
    for (const b of bookings) {
      if (!isRoomAvailable(b.roomId, b.checkIn, b.checkOut)) {
        const room = rooms.find(r => r.id === b.roomId);
        alert(`Room Conflict: ${room?.name} is not available for the selected dates (${b.checkIn} to ${b.checkOut}).`);
        return;
      }
    }

    setIsSubmitting(true);
    const batch = writeBatch(db);

    try {
      const transactionItems: TransactionItem[] = bookings.map(b => {
        const room = rooms.find(r => r.id === b.roomId)!;
        const roomRef = doc(db, 'rooms', b.roomId);
        batch.update(roomRef, { bookedCount: increment(b.quantity) });

        const nights = calculateNights(b.checkIn, b.checkOut);
        return {
          itemId: b.roomId,
          description: `${room.name} (${room.type}) • ${b.checkIn} to ${b.checkOut} (${nights} Nights)`,
          quantity: b.quantity,
          price: room.price * nights,
          total: room.price * b.quantity * nights
        };
      });

      const finalPayments: TransactionPayment[] = payments.filter(p => (p.amount || 0) > 0).map(p => ({
          method: p.method as SettlementMethod,
          amount: p.amount as number,
          timestamp: Date.now()
      }));

      let finalStatus = SettlementStatus.UNPAID;
      if (balance <= 0) {
        finalStatus = SettlementStatus.PAID;
      } else if (totalPaid > 0) {
        finalStatus = SettlementStatus.PARTIAL;
      }

      // If 'ALL' is selected, selectedBank is null so receipt shows all banks
      const selectedBankFinal = targetBank === 'ALL' ? null : targetBank;

      // Derive overall stay period from bookings
      const checkIns = bookings.map(b => new Date(b.checkIn).getTime());
      const checkOuts = bookings.map(b => new Date(b.checkOut).getTime());
      const minCheckIn = new Date(Math.min(...checkIns)).toISOString().split('T')[0];
      const maxCheckOut = new Date(Math.max(...checkOuts)).toISOString().split('T')[0];
      const totalNights = calculateNights(minCheckIn, maxCheckOut);

      const txData = {
        reference: `RES-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        type: 'FOLIO',
        source: 'App',
        guestName: guest.name,
        identityType: guest.idType,
        idNumber: guest.idNumber,
        email: guest.email,
        phone: guest.phone,
        items: [...transactionItems, ...additionalCharges],
        selectedBank: selectedBankFinal,
        roomDetails: {
          roomName: bookings.length === 1 ? rooms.find(r => r.id === bookings[0].roomId)!.name : 'Multiple Rooms',
          checkIn: minCheckIn,
          checkOut: maxCheckOut,
          nights: totalNights,
          rate: subtotalItems / totalNights
        },
        subtotal: baseVal,
        taxAmount: vatSum,
        serviceCharge: scSum,
        discountAmount: discount,
        totalAmount: finalTotal,
        paidAmount: totalPaid,
        payments: finalPayments,
        balance: Math.max(0, balance),
        status: finalStatus,
        settlementMethod: finalPayments.length > 0 ? finalPayments[0].method : SettlementMethod.TRANSFER,
        createdBy: user.uid,
        userId: user.uid,
        cashierName: user.displayName,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const docRef = await addDoc(collection(db, 'transactions'), txData);
      await batch.commit();
      setSavedTransaction({ id: docRef.id, ...txData } as Transaction);
    } catch (err) {
      console.error(err);
      alert('Synchronization Error: Failure communicating with revenue authority.');
    } finally { setIsSubmitting(false); }
  };

  if (savedTransaction) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="bg-[#13263A] w-full max-w-md rounded-2xl border border-gray-700 p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto border border-green-500/30">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">FOLIO CONFIRMED</h2>
          <button onClick={onClose} className="w-full py-4 bg-[#C8A862] text-black font-bold rounded-xl uppercase text-xs tracking-widest">Done</button>
          <ReceiptPreview transaction={savedTransaction} onClose={onClose} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#13263A] w-full max-w-4xl rounded-2xl border border-gray-700 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-700/50 flex justify-between items-center bg-[#13263A]">
          <h2 className="text-xl font-black text-[#C8A862] uppercase tracking-tighter">FOLIO CONTROL HUB</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-2xl">&times;</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-700/50 pb-2">Guest Identity</h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-gray-500 uppercase">Guest Full Name <span className="text-red-500">*</span></label>
                <input placeholder="Enter full legal name" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white outline-none font-bold focus:border-[#C8A862]" value={guest.name} onChange={(e) => setGuest({...guest, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-gray-500 uppercase">Corporate/Personal Email <span className="text-red-500">*</span></label>
                  <input type="email" placeholder="guest@example.com" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-[#C8A862]" value={guest.email} onChange={(e) => setGuest({...guest, email: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-gray-500 uppercase">Mobile Number</label>
                  <input placeholder="+234 ..." className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-[#C8A862]" value={guest.phone} onChange={(e) => setGuest({...guest, phone: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-gray-500 uppercase">ID Protocol</label>
                  <select className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white" value={guest.idType} onChange={(e) => setGuest({...guest, idType: e.target.value})}>
                    <option>National ID</option>
                    <option>International Passport</option>
                    <option>Driver's License</option>
                    <option>Voter's Card</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-gray-500 uppercase">ID Number <span className="text-red-500">*</span></label>
                  <input placeholder="Document Reference" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white outline-none focus:border-[#C8A862]" value={guest.idNumber} onChange={(e) => setGuest({...guest, idNumber: e.target.value})} />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-700/50 pb-2">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Room Inventory</h3>
              <button onClick={addRoomRow} className="px-3 py-1.5 border border-[#C8A862]/30 text-[#C8A862] rounded text-[9px] font-black uppercase hover:bg-[#C8A862]/10 transition-all">+ Add Room</button>
            </div>
            {bookings.map((booking, idx) => (
              <div key={idx} className="space-y-3 bg-[#0B1C2D]/50 p-4 rounded-xl border border-gray-700/30 relative group">
                <div className="grid grid-cols-12 gap-3 items-end">
                  <div className="col-span-8 space-y-1">
                    <label className="text-[9px] font-bold text-gray-500 uppercase">Select Room Type</label>
                    <select className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white" value={booking.roomId} onChange={(e) => updateBooking(idx, 'roomId', e.target.value)}>
                      <option value="" disabled>Select Room Type</option>
                      {rooms.map(r => (
                        <option key={r.id} value={r.id}>{r.name} ({r.type}) - ₦{r.price.toLocaleString()}/night</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3 space-y-1">
                    <label className="text-[9px] font-bold text-gray-500 uppercase">Room Qty</label>
                    <input type="number" min="1" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white text-center" value={booking.quantity} onChange={(e) => updateBooking(idx, 'quantity', parseInt(e.target.value) || 1)} />
                  </div>
                  <div className="col-span-1 text-center">
                    {bookings.length > 1 && (
                      <button onClick={() => removeRoomRow(idx)} className="text-red-500 text-2xl leading-none">&times;</button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-gray-500 uppercase">Room Check-In</label>
                    <input type="date" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-2 text-xs text-white outline-none focus:border-[#C8A862] accent-[#C8A862]" value={booking.checkIn} onChange={(e) => updateBooking(idx, 'checkIn', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-gray-500 uppercase">Room Check-Out</label>
                    <input type="date" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-2 text-xs text-white outline-none focus:border-[#C8A862] accent-[#C8A862]" value={booking.checkOut} onChange={(e) => updateBooking(idx, 'checkOut', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-gray-500 uppercase">Nights</label>
                    <div className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-2 text-xs text-[#C8A862] font-black text-center">
                      {calculateNights(booking.checkIn, booking.checkOut)} Nights
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-700/50 pb-2">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Guest Charges & Extras</h3>
              <div className="flex gap-2">
                <select 
                  className="bg-[#0B1C2D] border border-gray-700 rounded px-2 py-1 text-[9px] font-black text-white uppercase outline-none focus:border-[#C8A862]"
                  onChange={(e) => {
                    const item = menuItems.find(m => m.id === e.target.value);
                    if (item) addCharge(item);
                    e.target.value = '';
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Add from Menu</option>
                  {menuItems.map(m => (
                    <option key={m.id} value={m.id}>{m.name} (₦{m.price.toLocaleString()})</option>
                  ))}
                </select>
                <button onClick={() => addCharge()} className="px-3 py-1.5 border border-[#C8A862] bg-[#C8A862]/10 text-[#C8A862] rounded text-[9px] font-black uppercase hover:bg-[#C8A862]/20 transition-all">+ Add Flexible Charge</button>
              </div>
            </div>
            {additionalCharges.map((charge, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-3 items-end bg-[#0B1C2D]/50 p-4 rounded-xl border border-gray-700/30 relative group">
                <div className="col-span-6 space-y-1">
                  <label className="text-[9px] font-bold text-gray-500 uppercase">Description</label>
                  <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white" value={charge.description} onChange={(e) => updateCharge(idx, 'description', e.target.value)} placeholder="Charge description" />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[9px] font-bold text-gray-500 uppercase">Qty</label>
                  <input type="number" min="1" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white text-center" value={charge.quantity} onChange={(e) => updateCharge(idx, 'quantity', parseInt(e.target.value) || 1)} />
                </div>
                <div className="col-span-3 space-y-1">
                  <label className="text-[9px] font-bold text-gray-500 uppercase">Price (₦)</label>
                  <input type="number" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white text-right" value={charge.price} onChange={(e) => updateCharge(idx, 'price', parseFloat(e.target.value) || 0)} />
                </div>
                <div className="col-span-1 text-center">
                  <button onClick={() => removeCharge(idx)} className="text-red-500 text-2xl leading-none">&times;</button>
                </div>
              </div>
            ))}
            {additionalCharges.length === 0 && (
              <p className="text-[10px] text-gray-600 italic text-center py-2">No additional charges added</p>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-700/50 pb-2">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Accounting & Split Payment</h3>
              <button onClick={addPaymentRow} className="px-3 py-1.5 border border-green-500/30 text-green-400 rounded text-[9px] font-black uppercase hover:bg-green-500/10 transition-all">+ Add Payment Row</button>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-gray-500 uppercase">Target Settlement Account</label>
              <select 
                className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white font-bold" 
                value={targetBank === 'ALL' ? 'ALL' : targetBank?.accountNumber} 
                onChange={(e) => {
                  if (e.target.value === 'ALL') setTargetBank('ALL');
                  else setTargetBank(settings?.invoiceBanks.find(b => b.accountNumber === e.target.value) || null);
                }}
              >
                <option value="ALL">CONSOLIDATED (ALL ACCOUNTS)</option>
                {settings?.invoiceBanks.map((b, i) => (
                  <option key={i} value={b.accountNumber}>{b.bank} - {b.accountNumber}</option>
                ))}
              </select>
            </div>
            {payments.map((p, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-3 bg-[#0B1C2D]/50 p-4 rounded-xl border border-gray-700/30 items-center">
                <div className="col-span-6">
                   <select className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-3 text-sm text-white" value={p.method} onChange={(e) => updatePayment(idx, 'method', e.target.value as SettlementMethod)}>
                    <option value={SettlementMethod.TRANSFER}>Transfer</option>
                    <option value={SettlementMethod.CARD}>Card / POS</option>
                    <option value={SettlementMethod.CASH}>Cash</option>
                  </select>
                </div>
                <div className="col-span-5">
                   <input type="number" placeholder="Amount" className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-3 text-sm text-white text-right" value={p.amount || ''} onChange={(e) => updatePayment(idx, 'amount', parseFloat(e.target.value) || 0)} />
                </div>
                <div className="col-span-1 text-center">
                   {payments.length > 1 && (
                     <button onClick={() => removePaymentRow(idx)} className="text-red-500 text-2xl leading-none">&times;</button>
                   )}
                </div>
              </div>
            ))}
          </section>
        </div>

        <div className="p-6 bg-[#0B1C2D] border-t border-gray-700">
          <div className="grid grid-cols-2 gap-8 mb-6">
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Gross Val</div>
                  <div className="text-sm font-black">₦{subtotalItems.toLocaleString()}</div>
                </div>
                <div className="w-1/2">
                   <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Adjustment/Discount</div>
                   <input className="w-full bg-[#13263A] border border-gray-700 rounded p-2 text-xs font-black text-[#C8A862] outline-none" value={discount || ''} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
              <div>
                <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Total Paid</div>
                <div className={`text-xl font-black ${totalPaid > 0 ? 'text-green-500' : 'text-gray-500'}`}>{totalPaid > 0 ? `₦${totalPaid.toLocaleString()}` : 'NO PAYMENT'}</div>
              </div>
            </div>
            <div className="text-right space-y-4">
              <div>
                <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Net Valuation ({isInclusive ? 'Inc.' : 'Excl.'})</div>
                <div className="text-3xl font-black tracking-tighter text-[#C8A862]">₦{finalTotal.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Folio Outstanding</div>
                <div className={`text-xl font-black ${balance > 0 ? 'text-red-500' : 'text-gray-600'}`}>₦{Math.max(0, balance).toLocaleString()}</div>
              </div>
            </div>
          </div>
          <button 
            disabled={isSubmitting || !guest.name || !guest.idNumber || !guest.email} 
            onClick={handleSubmit} 
            className="w-full py-5 bg-[#C8A862] text-black font-black rounded-xl uppercase tracking-widest text-xs shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:grayscale transition-all"
          >
            {isSubmitting ? 'GENERATING FOLIO...' : 'GENERATE CORPORATE FOLIO'}
          </button>
          {(!guest.name || !guest.idNumber || !guest.email) && (
            <p className="text-[9px] text-red-500/60 font-black uppercase text-center mt-3 tracking-widest">Compulsory: Full Name, ID, & Email required</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FolioModal;
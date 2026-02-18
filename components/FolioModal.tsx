import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  UserProfile, 
  SettlementStatus,
  Room,
  AppSettings,
  Transaction,
  TransactionItem,
  BankAccount,
  SettlementMethod,
  TransactionPayment
} from '../types';
import ReceiptPreview from './ReceiptPreview';

interface RoomBooking {
  roomId: string;
  quantity: number;
}

interface FolioModalProps {
  user: UserProfile;
  onClose: () => void;
}

const FolioModal: React.FC<FolioModalProps> = ({ user, onClose }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [guest, setGuest] = useState({ name: '', idType: 'National ID', idNumber: '', email: '', phone: '' });
  const [stayPeriod, setStayPeriod] = useState({ checkIn: '', checkOut: '', nights: 1 });
  const [bookings, setBookings] = useState<RoomBooking[]>([{ roomId: '', quantity: 1 }]);
  
  // Split Payments
  const [payments, setPayments] = useState<Partial<TransactionPayment>[]>([{ method: SettlementMethod.TRANSFER, amount: 0 }]);
  
  // Default to 0 (Zenith Bank - 1311027935) as requested for prominent display
  const [selectedBankIdx, setSelectedBankIdx] = useState<number>(0); 
  const [discount, setDiscount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedTransaction, setSavedTransaction] = useState<Transaction | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);

  useEffect(() => {
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
      setRooms(data);
      if (data.length > 0 && bookings[0].roomId === '') {
        setBookings([{ roomId: data[0].id, quantity: 1 }]);
      }
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (snapshot.exists()) setSettings(snapshot.data() as AppSettings);
    });

    return () => {
      unsubRooms();
      unsubSettings();
    };
  }, []);

  // Auto-calculate nights when checkIn or checkOut changes
  useEffect(() => {
    if (stayPeriod.checkIn && stayPeriod.checkOut) {
      const start = new Date(stayPeriod.checkIn);
      const end = new Date(stayPeriod.checkOut);
      
      // Calculate difference in time
      const diffTime = end.getTime() - start.getTime();
      // Calculate difference in days
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Update nights if it's a valid positive number
      if (diffDays > 0) {
        setStayPeriod(prev => ({ ...prev, nights: diffDays }));
      } else {
        // Fallback to 1 if dates are same or invalid order
        setStayPeriod(prev => ({ ...prev, nights: 1 }));
      }
    }
  }, [stayPeriod.checkIn, stayPeriod.checkOut]);

  const addBookingRow = () => {
    if (rooms.length > 0) {
      setBookings([...bookings, { roomId: rooms[0].id, quantity: 1 }]);
    }
  };

  const removeBookingRow = (index: number) => {
    if (bookings.length > 1) {
      setBookings(bookings.filter((_, i) => i !== index));
    }
  };

  const updateBooking = (index: number, field: keyof RoomBooking, value: any) => {
    const newBookings = [...bookings];
    (newBookings[index] as any)[field] = value;
    setBookings(newBookings);
  };

  // Calculation Logic
  const subtotal = bookings.reduce((acc, b) => {
    const room = rooms.find(r => r.id === b.roomId);
    if (!room) return acc;
    return acc + (room.price * b.quantity * stayPeriod.nights);
  }, 0);

  const total = Math.max(0, subtotal - discount);
  
  const vatRate = settings?.vat || 0.075;
  const scRate = settings?.serviceCharge || 0.10;
  const divisor = 1 + vatRate + scRate;
  
  const baseValue = total / divisor;
  const taxAmount = baseValue * vatRate;
  const serviceCharge = baseValue * scRate;
  
  const totalPaid = payments.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const balance = total - totalPaid;

  const addPaymentRow = () => setPayments([...payments, { method: SettlementMethod.TRANSFER, amount: 0 }]);
  const removePaymentRow = (idx: number) => setPayments(payments.filter((_, i) => i !== idx));
  const updatePayment = (idx: number, field: keyof TransactionPayment, value: any) => {
    const newPayments = [...payments];
    (newPayments[idx] as any)[field] = value;
    setPayments(newPayments);
  };

  const handleSubmit = async () => {
    if (!guest.name || !stayPeriod.checkIn || !stayPeriod.checkOut || bookings.some(b => !b.roomId)) {
      alert('Please complete all guest and stay fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const transactionItems: TransactionItem[] = bookings.map(b => {
        const room = rooms.find(r => r.id === b.roomId)!;
        return {
          description: `${room.name} (${room.type}) x ${stayPeriod.nights} Nights`,
          quantity: b.quantity,
          price: room.price * stayPeriod.nights,
          total: room.price * b.quantity * stayPeriod.nights
        };
      });

      const selectedBank = selectedBankIdx === -1 ? null : settings?.invoiceBanks[selectedBankIdx];
      
      const finalPayments: TransactionPayment[] = payments
        .filter(p => (p.amount || 0) > 0)
        .map(p => ({
          method: p.method as SettlementMethod,
          amount: p.amount as number,
          timestamp: Date.now()
        }));

      const txData = {
        reference: `RES-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        type: 'FOLIO',
        source: 'App',
        guestName: guest.name,
        identityType: guest.idType,
        idNumber: guest.idNumber,
        email: guest.email,
        phone: guest.phone,
        items: transactionItems,
        selectedBank: selectedBank || null,
        roomDetails: {
          roomName: bookings.length === 1 ? rooms.find(r => r.id === bookings[0].roomId)!.name : 'Multiple Rooms',
          checkIn: stayPeriod.checkIn,
          checkOut: stayPeriod.checkOut,
          nights: stayPeriod.nights,
          rate: subtotal / stayPeriod.nights
        },
        subtotal: baseValue,
        taxAmount,
        serviceCharge,
        discountAmount: discount,
        totalAmount: total,
        paidAmount: totalPaid,
        payments: finalPayments,
        balance,
        status: balance <= 0 ? SettlementStatus.SETTLED : SettlementStatus.UNPAID,
        settlementMethod: finalPayments.length > 0 ? finalPayments[0].method : SettlementMethod.TRANSFER,
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
      alert('Error saving reservation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSettleMore = async () => {
    if (!savedTransaction) return;
    const amountStr = prompt(`Enter payment for ${savedTransaction.guestName} (Bal: ₦${savedTransaction.balance.toLocaleString()}):`, savedTransaction.balance.toString());
    if (!amountStr) return;

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return;

    const method = prompt('Method (POS, CASH, TRANSFER):', 'TRANSFER')?.toUpperCase() as SettlementMethod;
    if (![SettlementMethod.POS, SettlementMethod.CASH, SettlementMethod.TRANSFER].includes(method)) return;

    const newPayment = { method, amount, timestamp: Date.now() };
    const updatedPayments = [...(savedTransaction.payments || []), newPayment];
    const newPaid = savedTransaction.paidAmount + amount;
    const newBalance = Math.max(0, savedTransaction.totalAmount - newPaid);

    try {
      await updateDoc(doc(db, 'transactions', savedTransaction.id), {
        paidAmount: newPaid,
        payments: updatedPayments,
        balance: newBalance,
        status: newBalance <= 0 ? SettlementStatus.SETTLED : SettlementStatus.UNPAID,
        updatedAt: Date.now()
      });
      setSavedTransaction({
        ...savedTransaction,
        paidAmount: newPaid,
        payments: updatedPayments,
        balance: newBalance,
        status: newBalance <= 0 ? SettlementStatus.SETTLED : SettlementStatus.UNPAID
      });
    } catch (err) {
      alert('Folio settlement update failed.');
    }
  };

  if (savedTransaction) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="bg-[#13263A] w-full max-w-md rounded-2xl border border-gray-700 overflow-hidden shadow-2xl flex flex-col p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-[#C8A862]/10 rounded-full flex items-center justify-center mx-auto border border-[#C8A862]/30">
             <svg className="w-10 h-10 text-[#C8A862]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">RESERVATION CONFIRMED</h2>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-2">Folio Ref: {savedTransaction.reference}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
             <button 
              onClick={() => setShowInvoice(true)}
              className="px-6 py-4 bg-[#C8A862] text-[#0B1C2D] font-black rounded-xl uppercase tracking-widest text-xs hover:bg-[#B69651] transition-all"
            >
              Print Invoice
            </button>
            <button 
              onClick={handleSettleMore}
              disabled={savedTransaction.status === SettlementStatus.SETTLED}
              className={`px-6 py-4 font-black rounded-xl uppercase tracking-widest text-xs transition-all ${
                savedTransaction.status === SettlementStatus.SETTLED 
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              Settle Folio
            </button>
          </div>
          
          <button 
            onClick={onClose}
            className="w-full py-4 border border-gray-700 text-gray-400 font-bold rounded-xl uppercase tracking-widest text-xs hover:bg-white/5 transition-all"
          >
            Close Portal
          </button>

          {showInvoice && <ReceiptPreview transaction={savedTransaction} onClose={() => setShowInvoice(false)} />}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#13263A] w-full max-w-4xl rounded-2xl border border-gray-700 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-[#C8A862]">FOLIO CONTROL HUB</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <section className="space-y-4">
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest border-b border-gray-700/50 pb-2">Guest Identity</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-1 md:col-span-2">
                <label className="text-[10px] text-gray-500 block mb-1 font-bold uppercase tracking-wider">Guest Full Name</label>
                <input placeholder="Enter full legal name" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#C8A862] outline-none" value={guest.name} onChange={(e) => setGuest({...guest, name: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 font-bold uppercase tracking-wider">ID Protocol</label>
                <select className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#C8A862] outline-none" value={guest.idType} onChange={(e) => setGuest({...guest, idType: e.target.value})}>
                  <option>National ID</option>
                  <option>Passport</option>
                  <option>Driver License</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 font-bold uppercase tracking-wider">ID Number</label>
                <input placeholder="Document Reference" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#C8A862] outline-none" value={guest.idNumber} onChange={(e) => setGuest({...guest, idNumber: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 font-bold uppercase tracking-wider">Email Communication</label>
                <input placeholder="guest@email.com" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#C8A862] outline-none" value={guest.email} onChange={(e) => setGuest({...guest, email: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 font-bold uppercase tracking-wider">Contact Phone</label>
                <input placeholder="+234..." className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#C8A862] outline-none" value={guest.phone} onChange={(e) => setGuest({...guest, phone: e.target.value})} />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest border-b border-gray-700/50 pb-2">Stay Period</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 font-bold uppercase tracking-wider">Check In</label>
                <input type="date" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#C8A862] outline-none" value={stayPeriod.checkIn} onChange={(e) => setStayPeriod({...stayPeriod, checkIn: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 font-bold uppercase tracking-wider">Check Out</label>
                <input type="date" className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#C8A862] outline-none" value={stayPeriod.checkOut} onChange={(e) => setStayPeriod({...stayPeriod, checkOut: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 font-bold uppercase tracking-wider">Total Duration (Nights)</label>
                <input type="number" readOnly className="w-full bg-[#0B1C2D]/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-400 focus:outline-none cursor-not-allowed" value={stayPeriod.nights} />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-700/50 pb-2">
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Room Inventory</h3>
              <button onClick={addBookingRow} className="px-3 py-1 bg-[#C8A862]/10 text-[#C8A862] text-[10px] font-black rounded border border-[#C8A862]/30 hover:bg-[#C8A862]/20 transition-all uppercase tracking-widest">+ Add Room</button>
            </div>
            
            <div className="space-y-3">
              {bookings.map((booking, idx) => (
                <div key={idx} className="bg-[#0B1C2D]/50 p-4 rounded-xl border border-gray-700/50 grid grid-cols-12 gap-3 items-end group">
                  <div className="col-span-12 md:col-span-7">
                    <label className="text-[9px] text-gray-600 block mb-1 font-black uppercase tracking-widest">Select Room Type</label>
                    <select 
                      className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#C8A862] outline-none" 
                      value={booking.roomId} 
                      onChange={(e) => updateBooking(idx, 'roomId', e.target.value)}
                    >
                      {rooms.map(r => (
                        <option key={r.id} value={r.id}>{r.name} - ₦{r.price.toLocaleString()}/night</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className="text-[9px] text-gray-600 block mb-1 font-black uppercase tracking-widest">Room Quantity</label>
                    <input 
                      type="number" 
                      min="1"
                      className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white text-center focus:border-[#C8A862] outline-none" 
                      value={booking.quantity} 
                      onChange={(e) => updateBooking(idx, 'quantity', parseInt(e.target.value) || 1)} 
                    />
                  </div>
                  <div className="col-span-4 md:col-span-1 flex justify-center pb-3">
                    <button 
                      onClick={() => removeBookingRow(idx)}
                      disabled={bookings.length === 1}
                      className="text-red-500/50 hover:text-red-400 disabled:opacity-0 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  </div>
                  <div className="col-span-2 hidden md:block text-right pb-3 text-[10px] font-black text-gray-600 uppercase">
                    ₦{( (rooms.find(r => r.id === booking.roomId)?.price || 0) * booking.quantity * stayPeriod.nights ).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
             <div className="flex justify-between items-center border-b border-gray-700/50 pb-2">
                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Accounting & Split Payment</h3>
                <button onClick={addPaymentRow} className="text-green-500 text-xs font-bold hover:underline">+ Add Payment Row</button>
             </div>
             <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 block mb-1 font-bold uppercase tracking-wider">Target Settlement Account</label>
                  <select 
                    className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#C8A862] outline-none"
                    value={selectedBankIdx}
                    onChange={(e) => setSelectedBankIdx(parseInt(e.target.value))}
                  >
                    <option value={-1}>ALL CONFIGURED ACCOUNTS</option>
                    {settings?.invoiceBanks.map((bank, i) => (
                      <option key={i} value={i}>{bank.bank} - {bank.accountNumber}</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  {payments.map((p, idx) => (
                    <div key={idx} className="flex gap-2 items-center bg-white/5 p-2 rounded-lg">
                      <select 
                        className="bg-[#0B1C2D] border border-gray-700 rounded p-2 text-xs text-white flex-1"
                        value={p.method}
                        onChange={(e) => updatePayment(idx, 'method', e.target.value as SettlementMethod)}
                      >
                        <option value={SettlementMethod.TRANSFER}>Transfer</option>
                        <option value={SettlementMethod.POS}>POS</option>
                        <option value={SettlementMethod.CASH}>Cash</option>
                      </select>
                      <input 
                        type="number"
                        placeholder="Amount"
                        className="bg-[#0B1C2D] border border-gray-700 rounded p-2 text-xs text-white w-32 text-right"
                        value={p.amount}
                        onChange={(e) => updatePayment(idx, 'amount', parseFloat(e.target.value) || 0)}
                      />
                      {payments.length > 1 && (
                        <button onClick={() => removePaymentRow(idx)} className="text-red-500 font-bold px-2">&times;</button>
                      )}
                    </div>
                  ))}
                </div>
             </div>
          </section>
        </div>

        <div className="p-6 bg-[#0B1C2D] border-t border-gray-700 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1 font-black uppercase tracking-widest">Gross Val</label>
              <div className="text-sm font-bold text-gray-400">₦{subtotal.toLocaleString()}</div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1 font-black uppercase tracking-widest text-[#C8A862]">Discount</label>
              <input 
                type="number" 
                className="w-full bg-[#13263A] border border-[#C8A862]/30 rounded-lg p-2 text-sm text-[#C8A862] font-black focus:border-[#C8A862] outline-none" 
                value={discount} 
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} 
              />
            </div>
            <div className="col-span-2 text-right">
              <div className="text-[10px] uppercase tracking-widest font-black text-gray-500">Net Valuation</div>
              <div className="text-3xl font-black text-white tracking-tighter">₦{total.toLocaleString()}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 bg-white/5 p-4 rounded-xl border border-white/5">
            <div>
              <label className="text-[10px] text-gray-500 uppercase font-black tracking-widest block mb-2">Total Paid</label>
              <div className="text-2xl font-black text-green-400">₦{totalPaid.toLocaleString()}</div>
            </div>
            <div className="text-right flex flex-col justify-end">
              <label className="text-[10px] text-gray-500 uppercase font-black tracking-widest block mb-2">Folio Outstanding</label>
              <div className={`text-2xl font-black ${balance > 0 ? 'text-red-500' : 'text-gray-400'}`}>₦{balance.toLocaleString()}</div>
            </div>
          </div>

          <button 
            disabled={isSubmitting || !guest.name || rooms.length === 0 || total < 0 || !stayPeriod.checkIn || !stayPeriod.checkOut} 
            onClick={handleSubmit} 
            className="w-full py-5 bg-[#C8A862] text-[#0B1C2D] font-black rounded-xl hover:bg-[#B69651] transition-all uppercase tracking-[0.2em] shadow-xl text-xs active:scale-[0.98] disabled:opacity-50"
          >
            {isSubmitting ? 'SYCHRONIZING...' : 'GENERATE CORPORATE FOLIO'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FolioModal;
import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Transaction, SettlementStatus, SettlementMethod } from '../types';
import ReceiptPreview from './ReceiptPreview';

interface ManageTransactionModalProps {
  transaction: Transaction;
  onClose: () => void;
}

const ManageTransactionModal: React.FC<ManageTransactionModalProps> = ({ transaction, onClose }) => {
  const [guestName, setGuestName] = useState(transaction.guestName);
  const [email, setEmail] = useState(transaction.email || '');
  const [phone, setPhone] = useState(transaction.phone || '');
  const [idType, setIdType] = useState(transaction.identityType || 'National ID');
  const [idNumber, setIdNumber] = useState(transaction.idNumber || '');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(transaction.discountAmount || 0);
  const [settlementMethod, setSettlementMethod] = useState<SettlementMethod>(transaction.settlementMethod || SettlementMethod.POS);
  const [isSaving, setIsSaving] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  const handleUpdate = async () => {
    setIsSaving(true);
    try {
      // Recalculate financial summary: subtotal minus current discount
      const subtotalSum = transaction.items.reduce((acc, curr) => acc + curr.total, 0);
      const newTotal = Math.max(0, subtotalSum - discount);
      const newPaidAmount = transaction.paidAmount + paymentAmount;
      const newBalance = Math.max(0, newTotal - newPaidAmount);

      const updates: any = {
        guestName,
        email,
        phone,
        identityType: idType,
        idNumber,
        discountAmount: discount,
        totalAmount: newTotal,
        paidAmount: newPaidAmount,
        balance: newBalance,
        status: newBalance <= 0 ? SettlementStatus.SETTLED : SettlementStatus.UNPAID,
        updatedAt: Date.now()
      };

      if (paymentAmount > 0) {
        updates.settlementMethod = settlementMethod;
      }

      await updateDoc(doc(db, 'transactions', transaction.id), updates);
      alert('Revenue records synchronized successfully.');
      onClose();
    } catch (err) {
      console.error(err);
      alert('Sync Failed: Check terminal authorization and permissions.');
    } finally {
      setIsSaving(false);
    }
  };

  const currentTotal = Math.max(0, transaction.items.reduce((acc, curr) => acc + curr.total, 0) - discount);
  const projectedBalance = Math.max(0, currentTotal - (transaction.paidAmount + paymentAmount));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#13263A] w-full max-w-2xl rounded-2xl border border-gray-700 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-[#0B1C2D]/50">
          <div>
            <h2 className="text-xl font-black text-[#C8A862] uppercase tracking-tight">MANAGE REVENUE RECORD</h2>
            <p className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">{transaction.reference} • {transaction.unit || 'FOLIO'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Guest Metadata Section */}
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-gray-700/50 pb-2">Guest Meta-Data (Edit)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-[9px] font-bold text-gray-600 uppercase mb-1 block tracking-widest">Full Name</label>
                <input 
                  className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3.5 text-sm text-white focus:border-[#C8A862] outline-none transition-all font-bold" 
                  value={guestName} 
                  onChange={(e) => setGuestName(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-600 uppercase mb-1 block tracking-widest">Identity Protocol</label>
                <select 
                  className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3.5 text-sm text-white"
                  value={idType}
                  onChange={(e) => setIdType(e.target.value)}
                >
                  <option>National ID</option>
                  <option>Passport</option>
                  <option>Driver License</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-600 uppercase mb-1 block tracking-widest">ID Number</label>
                <input 
                  className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3.5 text-sm text-white" 
                  value={idNumber} 
                  onChange={(e) => setIdNumber(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-600 uppercase mb-1 block tracking-widest">Corporate Email</label>
                <input 
                  className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3.5 text-sm text-white" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-600 uppercase mb-1 block tracking-widest">Contact String</label>
                <input 
                  className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3.5 text-sm text-white" 
                  value={phone} 
                  onChange={(e) => setPhone(e.target.value)} 
                />
              </div>
            </div>
          </section>

          {/* Financial Control Section */}
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-gray-700/50 pb-2">Financial Control (Settle & Discount)</h3>
            
            <div className="bg-[#0B1C2D]/30 p-5 rounded-xl border border-gray-700/50 space-y-5">
              <div className="grid grid-cols-2 gap-8 items-center">
                <div>
                   <label className="text-[9px] font-bold text-gray-600 uppercase mb-2 block tracking-widest">Apply Discount (Flexible ₦)</label>
                   <input 
                    type="number"
                    className="w-full bg-[#13263A] border border-[#C8A862]/30 rounded-lg p-3 text-lg font-black text-[#C8A862] outline-none"
                    value={discount}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                   />
                </div>
                <div className="text-right">
                   <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-1">Total Billable</p>
                   <p className="text-2xl font-black text-white tracking-tighter">₦{currentTotal.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-end bg-[#C8A862]/5 p-5 rounded-xl border border-[#C8A862]/10">
              <div className="col-span-2 md:col-span-1">
                <label className="text-[9px] font-bold text-[#C8A862] uppercase mb-1 block tracking-widest">Inject Payment (₦)</label>
                <input 
                  type="number"
                  placeholder="0.00"
                  className="w-full bg-[#0B1C2D] border border-[#C8A862]/40 rounded-lg p-4 text-2xl font-black text-white focus:ring-2 focus:ring-[#C8A862]/20 outline-none" 
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)} 
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-[9px] font-bold text-gray-600 uppercase mb-1 block tracking-widest">Settlement Channel</label>
                <select 
                  className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-4 text-sm text-white font-bold"
                  value={settlementMethod}
                  onChange={(e) => setSettlementMethod(e.target.value as SettlementMethod)}
                >
                  <option value={SettlementMethod.POS}>POS Terminal</option>
                  <option value={SettlementMethod.CASH}>Cash Payment</option>
                  <option value={SettlementMethod.TRANSFER}>Bank Transfer</option>
                </select>
              </div>
            </div>
            
            <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${projectedBalance > 0 ? 'bg-red-500/5 border-red-500/20 text-red-500' : 'bg-green-500/5 border-green-500/20 text-green-400'}`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full animate-pulse ${projectedBalance > 0 ? 'bg-red-500' : 'bg-green-500'}`}></div>
                <span className="text-[10px] font-black uppercase tracking-widest">Projected Outstanding</span>
              </div>
              <span className="text-xl font-black">₦{projectedBalance.toLocaleString()}</span>
            </div>
          </section>
        </div>

        <div className="p-6 bg-[#0B1C2D] border-t border-gray-700 grid grid-cols-2 gap-4">
          <button 
            onClick={() => setShowReceipt(true)}
            className="w-full py-4 border border-gray-700 text-gray-400 font-black rounded-xl uppercase tracking-widest text-[10px] hover:bg-white/5 transition-all active:scale-[0.98]"
          >
            Terminal View / Print
          </button>
          <button 
            disabled={isSaving}
            onClick={handleUpdate}
            className="w-full py-4 bg-[#C8A862] text-[#0B1C2D] font-black rounded-xl uppercase tracking-widest text-[10px] hover:bg-[#B69651] active:scale-[0.98] transition-all shadow-lg"
          >
            {isSaving ? 'Processing Protocol...' : 'Confirm Synchronization'}
          </button>
        </div>
      </div>
      {showReceipt && <ReceiptPreview transaction={transaction} onClose={() => setShowReceipt(false)} />}
    </div>
  );
};

export default ManageTransactionModal;
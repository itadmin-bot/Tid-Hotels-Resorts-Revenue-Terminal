import React, { useState, useEffect } from 'react';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Transaction, SettlementStatus, SettlementMethod, AppSettings, BankAccount, TransactionPayment } from '../types';
import ReceiptPreview from './ReceiptPreview';

interface ManageTransactionModalProps {
  transaction: Transaction;
  onClose: () => void;
}

const ManageTransactionModal: React.FC<ManageTransactionModalProps> = ({ transaction, onClose }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [guestName, setGuestName] = useState(transaction.guestName);
  const [email, setEmail] = useState(transaction.email || '');
  const [phone, setPhone] = useState(transaction.phone || '');
  const [idType, setIdType] = useState(transaction.identityType || 'National ID');
  const [idNumber, setIdNumber] = useState(transaction.idNumber || '');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(transaction.discountAmount || 0);
  const [settlementMethod, setSettlementMethod] = useState<SettlementMethod>(transaction.settlementMethod || SettlementMethod.POS);
  const [selectedBank, setSelectedBank] = useState<BankAccount | undefined>(transaction.selectedBank);
  const [isSaving, setIsSaving] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (snapshot.exists()) setSettings(snapshot.data() as AppSettings);
    });
    return () => unsub();
  }, []);

  const handleUpdate = async () => {
    setIsSaving(true);
    try {
      const subtotalSum = transaction.items.reduce((acc, curr) => acc + curr.total, 0);
      const newTotal = Math.max(0, subtotalSum - discount);
      const newPaidAmount = transaction.paidAmount + paymentAmount;
      const newBalance = Math.max(0, newTotal - newPaidAmount);

      const updatedPayments = [...(transaction.payments || [])];
      if (paymentAmount > 0) {
        updatedPayments.push({
          method: settlementMethod,
          amount: paymentAmount,
          timestamp: Date.now()
        });
      }

      const updates: any = {
        guestName,
        email,
        phone,
        identityType: idType,
        idNumber,
        discountAmount: discount,
        totalAmount: newTotal,
        paidAmount: newPaidAmount,
        payments: updatedPayments,
        balance: newBalance,
        status: newBalance <= 0 ? SettlementStatus.SETTLED : SettlementStatus.UNPAID,
        selectedBank: selectedBank || null,
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
      <div className="bg-[#13263A] w-full max-w-2xl rounded-2xl border border-gray-700 overflow-hidden shadow-2xl flex flex-col max-h-[90vh] no-print">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-[#0B1C2D]/50">
          <div>
            <h2 className="text-xl font-black text-[#C8A862] uppercase tracking-tight">MANAGE REVENUE RECORD</h2>
            <p className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">{transaction.reference} • {transaction.unit || 'FOLIO'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-gray-700/50 pb-2">Guest Identity (Edit)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3.5 text-sm text-white focus:border-[#C8A862] outline-none font-bold" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Name" />
              </div>
              <div>
                <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3.5 text-sm text-white" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
              </div>
              <div>
                <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3.5 text-sm text-white" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-gray-700/50 pb-2">Inject Split Payment</h3>
            
            <div className="bg-[#0B1C2D]/30 p-4 rounded-xl flex justify-between items-center text-xs font-bold">
               <span className="text-gray-500 uppercase tracking-widest">Currently Paid:</span>
               <span className="text-green-400">₦{transaction.paidAmount.toLocaleString()}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 items-end bg-[#C8A862]/5 p-5 rounded-xl border border-[#C8A862]/10">
              <div className="col-span-2 md:col-span-1">
                <label className="text-[9px] font-bold text-[#C8A862] uppercase mb-1 block tracking-widest">New Amount (₦)</label>
                <input type="number" placeholder="0.00" className="w-full bg-[#0B1C2D] border border-[#C8A862]/40 rounded-lg p-4 text-2xl font-black text-white outline-none" value={paymentAmount || ''} onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-[9px] font-bold text-gray-600 uppercase mb-1 block tracking-widest">Method</label>
                <select className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-4 text-sm text-white font-bold" value={settlementMethod} onChange={(e) => setSettlementMethod(e.target.value as SettlementMethod)}>
                  <option value={SettlementMethod.POS}>POS Terminal</option>
                  <option value={SettlementMethod.CASH}>Cash</option>
                  <option value={SettlementMethod.TRANSFER}>Transfer</option>
                </select>
              </div>
            </div>

            {transaction.payments && transaction.payments.length > 0 && (
              <div className="space-y-2">
                <label className="text-[9px] font-bold text-gray-600 uppercase tracking-widest block">Payment History</label>
                <div className="space-y-1">
                  {transaction.payments.map((p, i) => (
                    <div key={i} className="flex justify-between text-[10px] text-gray-400 bg-white/5 p-2 rounded">
                      <span>{p.method} • {new Date(p.timestamp).toLocaleDateString()}</span>
                      <span className="font-bold">₦{p.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className={`p-4 rounded-xl border flex items-center justify-between ${projectedBalance > 0 ? 'bg-red-500/5 border-red-500/20 text-red-500' : 'bg-green-500/5 border-green-500/20 text-green-400'}`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${projectedBalance > 0 ? 'bg-red-500' : 'bg-green-500'}`}></div>
                <span className="text-[10px] font-black uppercase tracking-widest">Projected Outstanding</span>
              </div>
              <span className="text-xl font-black">₦{projectedBalance.toLocaleString()}</span>
            </div>
          </section>
        </div>

        <div className="p-6 bg-[#0B1C2D] border-t border-gray-700 grid grid-cols-2 gap-4">
          <button onClick={() => setShowReceipt(true)} className="w-full py-4 border border-gray-700 text-gray-400 font-black rounded-xl uppercase tracking-widest text-[10px]">Print View</button>
          <button disabled={isSaving} onClick={handleUpdate} className="w-full py-4 bg-[#C8A862] text-[#0B1C2D] font-black rounded-xl uppercase tracking-widest text-[10px]">{isSaving ? 'Saving...' : 'Authorize Sync'}</button>
        </div>
      </div>
      {showReceipt && <ReceiptPreview transaction={transaction} onClose={() => setShowReceipt(false)} />}
    </div>
  );
};

export default ManageTransactionModal;
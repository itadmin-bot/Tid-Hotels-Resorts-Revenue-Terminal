import React, { useState } from 'react';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { Transaction, SettlementMethod, SettlementStatus } from '@/types';
import { X, CreditCard, Banknote, Landmark } from 'lucide-react';

interface SettleBillModalProps {
  transaction: Transaction;
  onClose: () => void;
  onSuccess: () => void;
}

const SettleBillModal: React.FC<SettleBillModalProps> = ({ transaction, onClose, onSuccess }) => {
  const [amount, setAmount] = useState<number>(transaction.balance);
  const [method, setMethod] = useState<SettlementMethod>(SettlementMethod.CARD);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSettle = async () => {
    if (amount <= 0) {
      alert('INVALID AMOUNT: Payment amount must be greater than zero.');
      return;
    }

    if (amount > transaction.balance) {
      alert('OVERPAYMENT ERROR: Payment amount cannot exceed the outstanding balance.');
      return;
    }

    setIsProcessing(true);
    try {
      await runTransaction(db, async (transactionRef) => {
        const tDoc = await transactionRef.get(doc(db, 'transactions', transaction.id));
        if (!tDoc.exists()) {
          throw new Error("Transaction record not found.");
        }

        const data = tDoc.data() as Transaction;
        const newPaidAmount = (data.paidAmount || 0) + amount;
        const newBalance = Math.max(0, data.totalAmount - newPaidAmount);
        
        let newStatus = SettlementStatus.UNPAID;
        if (newBalance === 0) {
          newStatus = SettlementStatus.PAID;
        } else if (newPaidAmount > 0) {
          newStatus = SettlementStatus.PARTIAL;
        }

        const newPayment = {
          amount,
          method,
          timestamp: Date.now()
        };

        const updatedPayments = [...(data.payments || []), newPayment];

        transactionRef.update(doc(db, 'transactions', transaction.id), {
          paidAmount: newPaidAmount,
          balance: newBalance,
          status: newStatus,
          payments: updatedPayments,
          updatedAt: Date.now()
        });
      });

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Settlement Transaction Failed:", err);
      alert('SETTLEMENT FAILED: An error occurred while processing the payment. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#13263A] w-full max-w-md rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-[#0B1C2D]">
          <div>
            <h3 className="text-lg font-black text-[#C8A862] uppercase tracking-tighter">SETTLE OUTSTANDING BILL</h3>
            <p className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">{transaction.reference}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest block mb-1">Outstanding Balance</span>
            <span className="text-3xl font-black text-white">₦{transaction.balance.toLocaleString()}</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Settlement Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-black">₦</span>
                <input 
                  type="number" 
                  className="w-full bg-[#0B1C2D] border border-gray-700 rounded-xl p-4 pl-8 text-xl font-black text-white outline-none focus:border-[#C8A862] transition-all"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  max={transaction.balance}
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Payment Method</label>
              <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => setMethod(SettlementMethod.CARD)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${method === SettlementMethod.CARD ? 'bg-[#C8A862] border-[#C8A862] text-[#0B1C2D]' : 'bg-[#0B1C2D] border-gray-700 text-gray-400 hover:border-gray-500'}`}
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="text-[9px] font-black uppercase">Card</span>
                </button>
                <button 
                  onClick={() => setMethod(SettlementMethod.CASH)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${method === SettlementMethod.CASH ? 'bg-[#C8A862] border-[#C8A862] text-[#0B1C2D]' : 'bg-[#0B1C2D] border-gray-700 text-gray-400 hover:border-gray-500'}`}
                >
                  <Banknote className="w-5 h-5" />
                  <span className="text-[9px] font-black uppercase">Cash</span>
                </button>
                <button 
                  onClick={() => setMethod(SettlementMethod.TRANSFER)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${method === SettlementMethod.TRANSFER ? 'bg-[#C8A862] border-[#C8A862] text-[#0B1C2D]' : 'bg-[#0B1C2D] border-gray-700 text-gray-400 hover:border-gray-500'}`}
                >
                  <Landmark className="w-5 h-5" />
                  <span className="text-[9px] font-black uppercase">Transfer</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-[#0B1C2D] border-t border-gray-700">
          <button 
            disabled={isProcessing || amount <= 0}
            onClick={handleSettle}
            className="w-full py-4 bg-green-600 text-white font-black rounded-xl uppercase tracking-[0.2em] text-xs hover:bg-green-700 transition-all shadow-xl disabled:opacity-50"
          >
            {isProcessing ? 'PROCESSING SETTLEMENT...' : 'AUTHORIZE PAYMENT'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettleBillModal;

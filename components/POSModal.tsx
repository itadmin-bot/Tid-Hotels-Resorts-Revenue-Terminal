import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  UnitType, 
  UserProfile, 
  SettlementStatus, 
  SettlementMethod, 
  TransactionItem,
  AppSettings,
  MenuItem,
  Transaction
} from '../types';
import ReceiptPreview from './ReceiptPreview';

interface POSModalProps {
  user: UserProfile;
  onClose: () => void;
}

const POSModal: React.FC<POSModalProps> = ({ user, onClose }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [menuCatalog, setMenuCatalog] = useState<MenuItem[]>([]);
  const [unit, setUnit] = useState<UnitType | ''>('');
  const [items, setItems] = useState<TransactionItem[]>([{ description: '', quantity: 1, price: 0, total: 0 }]);
  const [settlement, setSettlement] = useState<SettlementMethod>(SettlementMethod.POS);
  const [paid, setPaid] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [savedTransaction, setSavedTransaction] = useState<Transaction | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (snapshot.exists()) setSettings(snapshot.data() as AppSettings);
    });
    
    const unsubMenu = onSnapshot(collection(db, 'menu'), (snapshot) => {
      setMenuCatalog(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    });

    return () => {
      unsubSettings();
      unsubMenu();
    };
  }, []);

  const subtotal = items.reduce((acc, curr) => acc + (curr.quantity * curr.price), 0);
  const total = Math.max(0, subtotal - discount);
  
  const vatRate = settings?.vat || 0.075;
  const scRate = settings?.serviceCharge || 0.10;
  const divisor = 1 + vatRate + scRate;
  
  const baseValue = total / divisor;
  const taxAmount = baseValue * vatRate;
  const serviceCharge = baseValue * scRate;
  const balance = total - paid;

  const addItem = () => setItems([...items, { description: '', quantity: 1, price: 0, total: 0 }]);
  
  const handleMenuSelect = (index: number, itemId: string) => {
    const selected = menuCatalog.find(m => m.id === itemId);
    if (selected) {
      updateItem(index, 'description', selected.name);
      updateItem(index, 'price', selected.price);
    }
  };

  const updateItem = (index: number, field: keyof TransactionItem, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    if (field === 'quantity' || field === 'price') {
      newItems[index].total = (newItems[index].quantity || 0) * (newItems[index].price || 0);
    }
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async () => {
    setValidationError('');
    if (!unit) {
      setValidationError('Please select Zenza or Whisper to proceed with walk-in booking.');
      return;
    }
    if (items.some(i => !i.description || i.price <= 0)) {
      alert('Please fill all item details correctly.');
      return;
    }

    setIsSubmitting(true);
    try {
      const txData = {
        reference: `POS-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        type: 'POS',
        unit,
        source: 'Walk-in',
        guestName: 'Walk-In Customer',
        items,
        subtotal: baseValue,
        taxAmount,
        serviceCharge,
        discountAmount: discount,
        totalAmount: total,
        paidAmount: paid,
        balance,
        status: balance <= 0 ? SettlementStatus.SETTLED : SettlementStatus.UNPAID,
        settlementMethod: settlement,
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
      alert('Error saving transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSettleMore = async () => {
    if (!savedTransaction) return;
    const amount = prompt(`Enter additional payment for ${savedTransaction.reference} (Current Balance: ₦${savedTransaction.balance.toLocaleString()}):`, savedTransaction.balance.toString());
    if (!amount) return;

    const paidVal = parseFloat(amount);
    if (isNaN(paidVal) || paidVal <= 0) return;

    const newPaid = savedTransaction.paidAmount + paidVal;
    const newBalance = Math.max(0, savedTransaction.totalAmount - newPaid);

    try {
      await updateDoc(doc(db, 'transactions', savedTransaction.id), {
        paidAmount: newPaid,
        balance: newBalance,
        status: newBalance <= 0 ? SettlementStatus.SETTLED : SettlementStatus.UNPAID,
        updatedAt: Date.now()
      });
      setSavedTransaction({
        ...savedTransaction,
        paidAmount: newPaid,
        balance: newBalance,
        status: newBalance <= 0 ? SettlementStatus.SETTLED : SettlementStatus.UNPAID
      });
    } catch (err) {
      alert('Settlement update failed.');
    }
  };

  if (savedTransaction) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="bg-[#13263A] w-full max-w-md rounded-2xl border border-gray-700 overflow-hidden shadow-2xl flex flex-col p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
          </div>
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">TRANSACTION RECORDED</h2>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-2">{savedTransaction.reference}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
             <button 
              onClick={() => setShowReceipt(true)}
              className="px-6 py-4 bg-[#C8A862] text-[#0B1C2D] font-black rounded-xl uppercase tracking-widest text-xs hover:bg-[#B69651] transition-all"
            >
              Print Receipt
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
              Settle Balance
            </button>
          </div>
          
          <button 
            onClick={onClose}
            className="w-full py-4 border border-gray-700 text-gray-400 font-bold rounded-xl uppercase tracking-widest text-xs hover:bg-white/5 transition-all"
          >
            Done
          </button>

          {showReceipt && <ReceiptPreview transaction={savedTransaction} onClose={() => setShowReceipt(false)} />}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#13263A] w-full max-w-2xl rounded-2xl border border-gray-700 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-[#C8A862]">WALK-IN POINT OF SALE</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {validationError && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg text-sm font-bold animate-pulse">
              {validationError}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Operating Unit <span className="text-red-500">*</span></label>
              <select 
                required
                className={`w-full bg-[#0B1C2D] border rounded p-3 text-white transition-all ${!unit ? 'border-red-500/50 ring-1 ring-red-500/20' : 'border-gray-700'}`}
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value as UnitType);
                  if (e.target.value) setValidationError('');
                }}
              >
                <option value="" disabled>-- Select Unit --</option>
                <option value={UnitType.ZENZA}>Zenza</option>
                <option value={UnitType.WHISPERS}>Whispers</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Settlement Method</label>
              <select 
                className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-3 text-white"
                value={settlement}
                onChange={(e) => setSettlement(e.target.value as SettlementMethod)}
              >
                <option value={SettlementMethod.POS}>POS</option>
                <option value={SettlementMethod.CASH}>Cash</option>
                <option value={SettlementMethod.TRANSFER}>Transfer</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-700 pb-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Line Items</label>
              <button onClick={addItem} className="text-[#C8A862] text-xs font-bold hover:underline bg-[#C8A862]/10 px-3 py-1 rounded">+ New Item</button>
            </div>
            
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="bg-[#0B1C2D]/50 p-3 rounded-lg border border-gray-700/50 space-y-3">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-12 md:col-span-8">
                       <select 
                        className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-xs text-gray-400 mb-2"
                        onChange={(e) => handleMenuSelect(idx, e.target.value)}
                        defaultValue=""
                       >
                         <option value="" disabled>-- Select from Menu --</option>
                         {menuCatalog.map(m => (
                           <option key={m.id} value={m.id}>{m.name} (₦{m.price.toLocaleString()})</option>
                         ))}
                       </select>
                       <input 
                        placeholder="Or custom description..."
                        className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm text-white"
                        value={item.description}
                        onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      />
                    </div>
                    <div className="col-span-4 md:col-span-1">
                      <input 
                        type="number"
                        placeholder="Qty"
                        className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm text-center text-white"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <input 
                        type="number"
                        placeholder="Price"
                        className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm text-right text-white"
                        value={item.price}
                        onChange={(e) => updateItem(idx, 'price', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1 flex items-center justify-center">
                      <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-400">&times;</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 bg-[#0B1C2D] border-t border-gray-700 space-y-4">
          <div className="grid grid-cols-3 gap-4 border-b border-gray-800 pb-4">
            <div>
               <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Subtotal</p>
               <span className="text-sm font-bold text-white">₦{subtotal.toLocaleString()}</span>
            </div>
            <div className="text-center">
               <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Discount (Flexible)</p>
               <input 
                type="number"
                className="w-full bg-[#13263A] border border-[#C8A862]/20 rounded p-1 text-xs text-center text-[#C8A862] font-black focus:outline-none focus:border-[#C8A862]"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
               />
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[#C8A862] font-black uppercase tracking-widest block mb-1">Total Valuation</span>
              <span className="text-2xl font-black text-white">₦{total.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-gray-500 uppercase font-black tracking-widest block mb-2">Paid Amount</label>
              <input 
                type="number"
                className="w-full bg-[#13263A] border border-gray-700 rounded-xl p-3 text-xl font-black text-green-400 focus:ring-2 focus:ring-green-500/50 outline-none"
                value={paid}
                onChange={(e) => setPaid(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase font-black tracking-widest block mb-2">Outstanding Balance</label>
              <div className={`p-3 text-xl font-black rounded-xl border ${balance > 0 ? 'text-red-400 border-red-500/20 bg-red-500/5' : 'text-gray-500 border-gray-700 bg-gray-700/5'}`}>
                ₦{balance.toLocaleString()}
              </div>
            </div>
          </div>

          <button 
            disabled={isSubmitting || total < 0 || subtotal <= 0}
            onClick={handleSubmit}
            className={`w-full py-4 font-black rounded-xl transition-all uppercase tracking-widest shadow-lg ${
              !unit ? 'bg-gray-700 text-gray-500 hover:bg-red-900/40' : 'bg-[#C8A862] text-[#0B1C2D] hover:bg-[#B69651] active:scale-95'
            }`}
          >
            {isSubmitting ? 'Recording Transaction...' : (unit ? 'Complete & Proceed' : 'Select Unit to Proceed')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default POSModal;
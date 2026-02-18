
import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  UnitType, 
  UserProfile, 
  SettlementStatus, 
  SettlementMethod, 
  TransactionItem,
  AppSettings
} from '../types';

interface POSModalProps {
  user: UserProfile;
  onClose: () => void;
}

const POSModal: React.FC<POSModalProps> = ({ user, onClose }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [unit, setUnit] = useState<UnitType>(UnitType.ZENZA);
  const [items, setItems] = useState<TransactionItem[]>([{ description: '', quantity: 1, price: 0, total: 0 }]);
  const [settlement, setSettlement] = useState<SettlementMethod>(SettlementMethod.POS);
  const [paid, setPaid] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (snapshot.exists()) setSettings(snapshot.data() as AppSettings);
    });
    return () => unsubscribe();
  }, []);

  const total = items.reduce((acc, curr) => acc + (curr.quantity * curr.price), 0);
  
  // Inclusive Tax Calculation
  // Total = Base + (Base * VAT) + (Base * SC) = Base * (1 + VAT + SC)
  const vatRate = settings?.vat || 0.075;
  const scRate = settings?.serviceCharge || 0.10;
  const divisor = 1 + vatRate + scRate;
  
  const baseValue = total / divisor;
  const taxAmount = baseValue * vatRate;
  const serviceCharge = baseValue * scRate;
  const balance = total - paid;

  const addItem = () => setItems([...items, { description: '', quantity: 1, price: 0, total: 0 }]);
  const updateItem = (index: number, field: keyof TransactionItem, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    if (field === 'quantity' || field === 'price') {
      newItems[index].total = newItems[index].quantity * newItems[index].price;
    }
    setItems(newItems);
  };

  const handleSubmit = async () => {
    if (items.some(i => !i.description || i.price <= 0)) {
      alert('Please fill all item details correctly.');
      return;
    }

    setIsSubmitting(true);
    try {
      const tx = {
        reference: `POS-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        type: 'POS',
        unit,
        guestName: 'Walk-In Customer',
        items,
        subtotal: baseValue,
        taxAmount,
        serviceCharge,
        totalAmount: total,
        paidAmount: paid,
        balance,
        status: balance <= 0 ? SettlementStatus.SETTLED : SettlementStatus.UNPAID,
        settlementMethod: settlement,
        createdBy: user.uid,
        cashierName: user.displayName,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await addDoc(collection(db, 'transactions'), tx);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Error saving transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#13263A] w-full max-w-2xl rounded-2xl border border-gray-700 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-[#C8A862]">WALK-IN POINT OF SALE</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Unit Selection</label>
              <select 
                disabled={items.length > 1 || items[0].description !== ''}
                className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-3 mt-1 text-white disabled:opacity-50"
                value={unit}
                onChange={(e) => setUnit(e.target.value as UnitType)}
              >
                <option value={UnitType.ZENZA}>Zenza</option>
                <option value={UnitType.WHISPERS}>Whispers</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Settlement Method</label>
              <select 
                className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-3 mt-1 text-white"
                value={settlement}
                onChange={(e) => setSettlement(e.target.value as SettlementMethod)}
              >
                <option value={SettlementMethod.POS}>POS</option>
                <option value={SettlementMethod.CASH}>Cash</option>
                <option value={SettlementMethod.TRANSFER}>Transfer</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-gray-500 uppercase">Line Items</label>
              <button onClick={addItem} className="text-[#C8A862] text-xs font-bold hover:underline">+ Add Item</button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <input 
                  placeholder="Item Description"
                  className="col-span-6 bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm text-white"
                  value={item.description}
                  onChange={(e) => updateItem(idx, 'description', e.target.value)}
                />
                <input 
                  type="number"
                  placeholder="Qty"
                  className="col-span-2 bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm text-center text-white"
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                />
                <input 
                  type="number"
                  placeholder="Price"
                  className="col-span-4 bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm text-right text-white"
                  value={item.price}
                  onChange={(e) => updateItem(idx, 'price', parseFloat(e.target.value) || 0)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 bg-[#0B1C2D] border-t border-gray-700 space-y-4">
          <div className="flex justify-between text-lg font-bold">
            <div className="flex flex-col">
              <span>TOTAL DUE</span>
              <span className="text-[10px] text-gray-500 uppercase">(Inclusive of SC/VAT)</span>
            </div>
            <span className="text-[#C8A862]">₦{total.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-[10px] text-gray-500 uppercase">Paid Amount</label>
              <input 
                type="number"
                className="w-full bg-[#13263A] border border-gray-700 rounded p-3 text-xl font-bold text-green-400"
                value={paid}
                onChange={(e) => setPaid(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-gray-500 uppercase">Balance Due</label>
              <div className={`p-3 text-xl font-bold rounded ${balance > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                ₦{balance.toLocaleString()}
              </div>
            </div>
          </div>
          <button 
            disabled={isSubmitting || total <= 0}
            onClick={handleSubmit}
            className="w-full py-4 bg-[#C8A862] text-[#0B1C2D] font-bold rounded-xl hover:bg-[#B69651] transition-all uppercase tracking-widest disabled:opacity-50"
          >
            {isSubmitting ? 'Processing...' : 'Complete & Record'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default POSModal;

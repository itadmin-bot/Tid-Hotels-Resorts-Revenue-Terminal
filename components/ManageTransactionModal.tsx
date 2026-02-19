import React, { useState, useEffect } from 'react';
import { doc, updateDoc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Transaction, 
  SettlementStatus, 
  SettlementMethod, 
  AppSettings, 
  BankAccount, 
  TransactionPayment, 
  TransactionItem, 
  MenuItem 
} from '../types';
import ReceiptPreview from './ReceiptPreview';

interface ManageTransactionModalProps {
  transaction: Transaction;
  onClose: () => void;
}

const ManageTransactionModal: React.FC<ManageTransactionModalProps> = ({ transaction, onClose }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [menuCatalog, setMenuCatalog] = useState<MenuItem[]>([]);
  const [guestName, setGuestName] = useState(transaction.guestName);
  const [email, setEmail] = useState(transaction.email || '');
  const [phone, setPhone] = useState(transaction.phone || '');
  const [idType, setIdType] = useState(transaction.identityType || 'National ID');
  const [idNumber, setIdNumber] = useState(transaction.idNumber || '');
  
  // Items Management
  const [items, setItems] = useState<TransactionItem[]>(transaction.items || []);
  
  // Multi-payment / Split Payment Management
  const [newPayments, setNewPayments] = useState<Partial<TransactionPayment>[]>([{ method: SettlementMethod.POS, amount: 0 }]);
  
  const [discount, setDiscount] = useState<number>(transaction.discountAmount || 0);
  const [selectedBank, setSelectedBank] = useState<BankAccount | undefined>(transaction.selectedBank);
  const [isSaving, setIsSaving] = useState(false);
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

      // Set settlementMethod to the last added method if any
      if (totalNewPayment > 0) {
        const lastP = newPayments.filter(p => (p.amount || 0) > 0).pop();
        if (lastP) updates.settlementMethod = lastP.method;
      }

      await updateDoc(doc(db, 'transactions', transaction.id), updates);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Sync Failure: Error updating ledger. Check terminal authorization.');
    } finally {
      setIsSaving(false);
    }
  };

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
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-gray-700/50 pb-2">Guest Identity Data</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-[9px] font-bold text-gray-600 uppercase mb-1 block">Guest Full Name</label>
                <input className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#C8A862] outline-none font-bold" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
              </div>
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
              <button onClick={addItem} className="text-[#C8A862] text-[10px] font-black hover:underline bg-[#C8A862]/10 px-3 py-1 rounded border border-[#C8A862]/20 uppercase tracking-widest">+ Add Line Item</button>
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
                      <option value="" disabled>-- Quick Select Menu --</option>
                      {menuCatalog.map(m => (
                        <option key={m.id} value={m.id}>{m.name} (₦{m.price.toLocaleString()})</option>
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
              <div className="pt-4 space-y-2 border-t border-gray-700/30">
                <label className="text-[9px] font-bold text-gray-600 uppercase tracking-widest block">Audit Trail: Recorded Payments</label>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                  {transaction.payments.map((p, i) => (
                    <div key={i} className="flex justify-between text-[10px] text-gray-400 bg-white/5 p-2 rounded">
                      <span className="uppercase">{p.method} • {new Date(p.timestamp).toLocaleDateString()}</span>
                      <span className="font-black text-gray-300">₦{p.amount.toLocaleString()}</span>
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
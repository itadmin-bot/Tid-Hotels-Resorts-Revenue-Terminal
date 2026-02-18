import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, where, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Transaction, UserProfile, UserRole, SettlementStatus, SettlementMethod } from '../types';
import { BRAND } from '../constants';
import POSModal from './POSModal';
import FolioModal from './FolioModal';
import ReceiptPreview from './ReceiptPreview';

interface DashboardProps {
  user: UserProfile;
}

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showPOS, setShowPOS] = useState(false);
  const [showFolio, setShowFolio] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<Transaction | null>(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [sortField, setSortField] = useState<keyof Transaction>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    // Correct Subscription Logic: Match Firestore rules exactly
    // Admin sees everything; Staff sees only their own via where filter
    const isAdminUser = user.role === UserRole.ADMIN && user.email.endsWith(BRAND.domain);
    const transactionsRef = collection(db, 'transactions');
    
    // Ensure the query structure aligns with security rules to avoid "insufficient permissions"
    const q = isAdminUser
      ? query(transactionsRef, orderBy('createdAt', 'desc'))
      : query(transactionsRef, where('createdBy', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(data);
    }, (error) => {
      console.error("Firestore Transaction Subscription Error:", error);
      // Log context for debugging permission issues without breaking UI
      if (error.code === 'permission-denied') {
        console.warn(`Permission Denied for UID: ${user.uid}. Query mismatch or rule violation.`);
      }
    });

    return () => unsubscribe();
  }, [user.uid, user.role, user.email]);

  const handleDelete = async (t: Transaction) => {
    if (user.role !== UserRole.ADMIN) return;
    if (window.confirm('PERMANENT ACTION: Delete this revenue record?')) {
      try {
        await deleteDoc(doc(db, 'transactions', t.id));
      } catch (err) {
        console.error("Delete failed:", err);
        alert('Permission Denied: Only root admins can delete ledger entries.');
      }
    }
  };

  const handleSettle = async (t: Transaction) => {
    const amount = prompt(`Enter payment amount for ${t.reference} (Balance: ₦${t.balance.toLocaleString()}):`, t.balance.toString());
    if (!amount) return;

    const paid = parseFloat(amount);
    if (isNaN(paid) || paid <= 0) {
      alert("Invalid payment amount.");
      return;
    }

    const newPaidAmount = t.paidAmount + paid;
    const newBalance = Math.max(0, t.totalAmount - newPaidAmount);

    try {
      await updateDoc(doc(db, 'transactions', t.id), {
        paidAmount: newPaidAmount,
        balance: newBalance,
        status: newBalance <= 0 ? SettlementStatus.SETTLED : SettlementStatus.UNPAID,
        updatedAt: Date.now(),
        settlementMethod: SettlementMethod.TRANSFER // Default to transfer for partial settlements
      });
      alert("Account updated successfully.");
    } catch (err) {
      console.error("Settlement failed:", err);
      alert("Failed to update settlement. Check your permissions.");
    }
  };

  const downloadReport = () => {
    const headers = ['Reference', 'Date', 'Type', 'Unit', 'Source', 'Guest', 'Items Sold', 'Amount', 'Status', 'Payment Method', 'Cashier'];
    const rows = filteredTransactions.map(t => [
      `"${t.reference}"`,
      new Date(t.createdAt).toLocaleDateString(),
      t.type,
      t.unit || 'Hotel Folio',
      t.source || 'App',
      `"${t.guestName}"`,
      `"${t.items.map(i => `${i.description} (x${i.quantity})`).join('; ')}"`,
      t.totalAmount,
      t.status,
      t.settlementMethod || 'N/A',
      `"${t.cashierName}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TIDE_REPORT_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleSort = (field: keyof Transaction) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const filteredTransactions = transactions
    .filter(t => {
      if (!dateRange.start && !dateRange.end) return true;
      const date = new Date(t.createdAt).toISOString().split('T')[0];
      if (dateRange.start && date < dateRange.start) return false;
      if (dateRange.end && date > dateRange.end) return false;
      return true;
    })
    .sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      return sortOrder === 'asc' 
        ? String(valA).localeCompare(String(valB)) 
        : String(valB).localeCompare(String(valA));
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">LEDGER DASHBOARD</h1>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Revenue Authority Terminal • Online</p>
        </div>
        <div className="flex gap-2">
          {user.role === UserRole.ADMIN && (
            <button onClick={downloadReport} className="px-4 py-2 border border-[#C8A862]/30 text-[#C8A862] text-[10px] font-black uppercase tracking-widest rounded hover:bg-[#C8A862]/10 transition-all mr-2">Download Report</button>
          )}
          <button onClick={() => setShowPOS(true)} className="px-5 py-2.5 bg-[#C8A862] text-[#0B1C2D] font-black rounded-lg hover:bg-[#B69651] transition-all text-xs uppercase tracking-widest shadow-lg">Walk-In POS</button>
          <button onClick={() => setShowFolio(true)} className="px-5 py-2.5 bg-[#C8A862] text-[#0B1C2D] font-black rounded-lg hover:bg-[#B69651] transition-all text-xs uppercase tracking-widest shadow-lg">Reservation Entry</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#13263A] p-6 rounded-2xl border border-gray-700/30">
          <p className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] mb-1">Total Valuation</p>
          <h2 className="text-3xl font-black text-white tracking-tighter">₦{filteredTransactions.reduce((a, b) => a + b.totalAmount, 0).toLocaleString()}</h2>
        </div>
        <div className="bg-[#13263A] p-6 rounded-2xl border border-gray-700/30">
          <p className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] mb-1">Settled Revenue</p>
          <h2 className="text-3xl font-black text-green-400 tracking-tighter">₦{filteredTransactions.filter(t => t.status === SettlementStatus.SETTLED).reduce((a, b) => a + b.totalAmount, 0).toLocaleString()}</h2>
        </div>
        <div className="bg-[#13263A] p-6 rounded-2xl border border-gray-700/30">
          <p className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] mb-1">Outstanding</p>
          <h2 className="text-3xl font-black text-red-500 tracking-tighter">₦{filteredTransactions.filter(t => t.status === SettlementStatus.UNPAID).reduce((a, b) => a + b.balance, 0).toLocaleString()}</h2>
        </div>
      </div>

      <div className="overflow-x-auto bg-[#13263A] rounded-2xl border border-gray-700/50 shadow-2xl">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-700/50 bg-[#0B1C2D]/50 text-[10px] font-black uppercase tracking-widest text-gray-500">
              <th className="px-6 py-5 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('reference')}>Origin/Ref</th>
              <th className="px-6 py-5 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('guestName')}>Guest Identification</th>
              <th className="px-6 py-5 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('source')}>Source Details</th>
              <th className="px-6 py-5 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('status')}>Status</th>
              <th className="px-6 py-5 text-right">Terminal Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/30">
            {filteredTransactions.map((t) => (
              <tr key={t.id} className="hover:bg-white/5 transition-colors group">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${t.unit === 'Zenza' ? 'bg-purple-500' : t.unit === 'Whispers' ? 'bg-blue-400' : 'bg-[#C8A862]'}`}></span>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{t.unit || 'FOLIO'}</span>
                  </div>
                  <div className="text-sm font-black text-white">{t.reference}</div>
                  <div className="text-[10px] text-gray-600 font-bold">{new Date(t.createdAt).toLocaleString()}</div>
                </td>
                <td className="px-6 py-5">
                  <div className="text-sm font-bold text-gray-200">{t.guestName}</div>
                  <div className="text-[10px] text-gray-500 font-medium">Operator: {t.cashierName}</div>
                </td>
                <td className="px-6 py-5">
                  <div className="text-[10px] font-black text-[#C8A862] uppercase tracking-widest">{t.source || 'App Entry'}</div>
                  <div className="text-sm font-black text-white">₦{t.totalAmount.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-600">Method: {t.settlementMethod || 'N/A'}</div>
                </td>
                <td className="px-6 py-5 text-center">
                  <span className={`px-2 py-1 rounded text-[9px] font-black tracking-widest border ${
                    t.status === SettlementStatus.SETTLED ? 'border-green-500/30 text-green-400 bg-green-500/5' : 'border-red-500/30 text-red-400 bg-red-500/5'
                  }`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-6 py-5 text-right space-x-2">
                  <button onClick={() => setViewingReceipt(t)} className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-[#C8A862]/10 text-[#C8A862] hover:bg-[#C8A862] hover:text-black rounded transition-all">Print Receipt</button>
                  {t.status === SettlementStatus.UNPAID && (
                    <button onClick={() => handleSettle(t)} className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-green-900/20 text-green-400 hover:bg-green-600 hover:text-white rounded transition-all">Settle Balance</button>
                  )}
                  {user.role === UserRole.ADMIN && (
                    <button onClick={() => handleDelete(t)} className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-red-900/20 text-red-400 hover:bg-red-900/40 rounded transition-all">Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredTransactions.length === 0 && (
          <div className="p-20 text-center text-gray-600 uppercase text-[11px] font-black tracking-[0.5em] italic">No Transactions Recorded</div>
        )}
      </div>

      {showPOS && <POSModal user={user} onClose={() => setShowPOS(false)} />}
      {showFolio && <FolioModal user={user} onClose={() => setShowFolio(false)} />}
      {viewingReceipt && <ReceiptPreview transaction={viewingReceipt} onClose={() => setViewingReceipt(null)} />}
    </div>
  );
};

export default Dashboard;
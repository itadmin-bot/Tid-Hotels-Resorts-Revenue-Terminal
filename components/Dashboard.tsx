
import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import { Transaction, UserProfile, UserRole, SettlementStatus } from '../types';
import { COLORS } from '../constants';
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

  useEffect(() => {
    // Admin sees everything, Staff sees only their own
    const transactionsRef = collection(db, 'transactions');
    let q = query(transactionsRef, orderBy('createdAt', 'desc'));
    
    if (user.role !== UserRole.ADMIN) {
      q = query(transactionsRef, where('createdBy', '==', user.uid), orderBy('createdAt', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(docs);
    });

    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (id: string) => {
    if (user.role !== UserRole.ADMIN) return;
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      await deleteDoc(doc(db, 'transactions', id));
    }
  };

  const filteredTransactions = transactions.filter(t => {
    if (!dateRange.start && !dateRange.end) return true;
    const date = new Date(t.createdAt).toISOString().split('T')[0];
    if (dateRange.start && date < dateRange.start) return false;
    if (dateRange.end && date > dateRange.end) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">LEDGER – Revenue Authority Terminal</h1>
          <p className="text-gray-400">Total Transactions: {filteredTransactions.length}</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowPOS(true)}
            className="px-4 py-2 bg-[#C8A862] text-[#0B1C2D] font-bold rounded hover:bg-[#B69651] transition-all"
          >
            Walk-In POS
          </button>
          <button 
            onClick={() => setShowFolio(true)}
            className="px-4 py-2 bg-[#C8A862] text-[#0B1C2D] font-bold rounded hover:bg-[#B69651] transition-all"
          >
            Reservation Entry
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#13263A] p-4 rounded-xl border border-gray-700/50">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Start Date</label>
          <input 
            type="date" 
            className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm"
            value={dateRange.start}
            onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">End Date</label>
          <input 
            type="date" 
            className="w-full bg-[#0B1C2D] border border-gray-700 rounded p-2 text-sm"
            value={dateRange.end}
            onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
          />
        </div>
        <div className="flex items-end">
          <button 
            onClick={() => setDateRange({ start: '', end: '' })}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-[#13263A] rounded-xl border border-gray-700/50 shadow-xl">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-700/50 bg-[#0B1C2D]/50">
              <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Reference</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Guest/Identity</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Valuation</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Audit Status</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/30">
            {filteredTransactions.map((t) => (
              <tr key={t.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4">
                  <div className="text-sm font-medium">{t.reference}</div>
                  <div className="text-[10px] text-gray-500">{new Date(t.createdAt).toLocaleString()}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm">{t.guestName}</div>
                  <div className="text-[10px] text-gray-500">{t.unit || t.type}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-bold text-[#C8A862]">₦{t.totalAmount.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-500">{t.cashierName}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                    t.status === SettlementStatus.SETTLED ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
                  }`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-6 py-4 flex gap-2">
                  <button 
                    onClick={() => setViewingReceipt(t)}
                    className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
                  >
                    Print
                  </button>
                  {user.role === UserRole.ADMIN && (
                    <button 
                      onClick={() => handleDelete(t.id)}
                      className="text-xs px-2 py-1 bg-red-900/40 text-red-400 hover:bg-red-800/40 rounded"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredTransactions.length === 0 && (
          <div className="p-20 text-center text-gray-500 italic">
            No transactions found for the selected period.
          </div>
        )}
      </div>

      {showPOS && <POSModal user={user} onClose={() => setShowPOS(false)} />}
      {showFolio && <FolioModal user={user} onClose={() => setShowFolio(false)} />}
      {viewingReceipt && <ReceiptPreview transaction={viewingReceipt} onClose={() => setViewingReceipt(null)} />}
    </div>
  );
};

export default Dashboard;

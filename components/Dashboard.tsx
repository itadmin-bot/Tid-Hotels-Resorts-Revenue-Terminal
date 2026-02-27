import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, where, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Calendar, Plus, Trash2, Receipt, Search, Download, Filter, RefreshCw } from 'lucide-react';
import { Transaction, UserProfile, UserRole, SettlementStatus, SettlementMethod, UnitType, MenuItem, AppSettings } from '../types';
import { BRAND } from '../constants';
import { formatToLocalDate, formatToLocalTime } from '@/utils/dateUtils';
import POSModal from './POSModal';
import FolioModal from './FolioModal';
import ProformaModal from './ProformaModal';
import ReceiptPreview from './ReceiptPreview';
import ProformaPreview from './ProformaPreview';
import ManageTransactionModal from './ManageTransactionModal';

interface DashboardProps {
  user: UserProfile;
  settings: AppSettings | null;
}

const Dashboard: React.FC<DashboardProps> = ({ user, settings }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [showPOS, setShowPOS] = useState(false);
  const [posEditingTransaction, setPosEditingTransaction] = useState<Transaction | null>(null);
  const [showFolio, setShowFolio] = useState(false);
  const [showProforma, setShowProforma] = useState(false);
  const [proformaEditingTransaction, setProformaEditingTransaction] = useState<Transaction | null>(null);
  const [managingTransaction, setManagingTransaction] = useState<Transaction | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<Transaction | null>(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<keyof Transaction>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let isSubscribed = true;
    const isAdminUser = user.role === UserRole.ADMIN && user.email.endsWith(BRAND.domain);
    const transactionsRef = collection(db, 'transactions');
    
    let q;
    if (isAdminUser) {
      q = query(transactionsRef, orderBy('createdAt', 'desc'));
    } else {
      // Non-admin users see transactions for their assigned unit
      if (user.assignedUnit && user.assignedUnit !== 'ALL') {
        q = query(transactionsRef, where('unit', '==', user.assignedUnit));
      } else {
        // Fallback to transactions they created if no unit assigned
        q = query(transactionsRef, where('createdBy', '==', user.uid));
      }
    }

    const unsubscribe = onSnapshot(q as any, (snapshot: any) => {
      if (!isSubscribed) return;
      let data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Transaction));
      
      // Sort by createdAt desc if not already sorted by query (Firestore requires indexes for multi-field sorting)
      data.sort((a, b) => b.createdAt - a.createdAt);
      
      setTransactions(data);
    }, (error: any) => {
      console.error("Firestore Transaction Subscription Error:", error);
    });

    // Subscribe to menu for inventory reporting
    const unsubMenu = onSnapshot(collection(db, 'menu'), (snapshot) => {
      if (!isSubscribed) return;
      setMenuItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    }, (error: any) => {
      console.error("Firestore Menu Subscription Error:", error);
    });

    return () => {
      isSubscribed = false;
      unsubscribe();
      unsubMenu();
    };
  }, [user.uid, user.role, user.email]);

  const handleDelete = async (t: Transaction) => {
    if (user.role !== UserRole.ADMIN) return;
    
    if (window.confirm('PERMANENT ACTION: Delete this revenue record from the central ledger?')) {
      try {
        await deleteDoc(doc(db, 'transactions', t.id));
      } catch (err) {
        console.error("Delete failed:", err);
        alert('Permission Denied: Unauthorized deletion attempt.');
      }
    }
  };

  const filteredTransactions = transactions
    .filter(t => {
      // Unit Filtering
      if (unitFilter !== 'ALL') {
        if (unitFilter === 'FOLIO' && t.type !== 'FOLIO') return false;
        if (unitFilter === 'ZENZA' && t.unit !== UnitType.ZENZA) return false;
        if (unitFilter === 'WHISPERS' && t.unit !== UnitType.WHISPERS) return false;
      }

      // Status Filtering
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;

      // Method Filtering
      if (methodFilter !== 'ALL' && t.settlementMethod !== methodFilter) return false;

      // Date Range Filtering
      if (!dateRange.start && !dateRange.end) return true;
      const tDate = formatToLocalDate(t.createdAt);
      if (dateRange.start && tDate < dateRange.start) return false;
      if (dateRange.end && tDate > dateRange.end) return false;
      
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

  const downloadReport = () => {
    // Adding 'Payment Method' and explicit 'Transaction Date' for enhanced compliance
    const headers = ['Reference', 'Transaction Date', 'Time', 'Type', 'Unit', 'Source', 'Guest', 'Items Sold', 'Total Amount', 'Paid Amount', 'Balance', 'Status', 'Payment Method', 'Cashier'];
    const rows = filteredTransactions.map(t => {
      return [
        `"${t.reference}"`,
        formatToLocalDate(t.createdAt),
        formatToLocalTime(t.createdAt),
        t.type,
        t.unit || 'Hotel Folio',
        t.source || 'App',
        `"${t.guestName}"`,
        `"${t.items.map(i => `${i.description} (x${i.quantity})`).join('; ')}"`,
        t.totalAmount,
        t.paidAmount,
        t.balance,
        t.status,
        t.settlementMethod || 'N/A', // Payment Method correctly mapped
        `"${t.cashierName}"`
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filterSuffix = unitFilter === 'ALL' ? 'COMPLETE' : unitFilter;
    a.download = `TIDE_REVENUE_REPORT_${filterSuffix}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadInventoryReport = () => {
    const headers = ['Item Name', 'Category', 'Revenue Unit', 'Initial Stock', 'Number of Sold Items', 'Current Remaining Stock', 'Reorder Level', 'Par Stock', 'Min Order (Par)', 'Min Order (Total)', 'Audit Status', 'Price (N)', 'Total Item Revenue (N)'];
    
    // Filter items based on the active unit filter
    const itemsToExport = menuItems.filter(m => {
      if (unitFilter === 'ALL') return true;
      if (unitFilter === 'ZENZA' && m.unit === UnitType.ZENZA) return true;
      if (unitFilter === 'WHISPERS' && m.unit === UnitType.WHISPERS) return true;
      if (unitFilter === 'FOLIO') return false; // Inventory doesn't apply to folios
      return m.unit === 'ALL';
    });

    const rows = itemsToExport.map(m => {
      const sold = m.soldCount || 0;
      const remaining = m.initialStock - sold;
      const parStock = m.parStock || 0;
      const auditStatus = remaining <= parStock ? 'ORDER NOW' : 'OK';
      return [
        `"${m.name}"`,
        `"${m.category}"`,
        m.unit,
        m.initialStock,
        sold,
        remaining,
        m.lowStockThreshold || 0,
        parStock,
        m.minOrderLevelPar || 0,
        m.minOrderLevelTotal || 0,
        auditStatus,
        m.price,
        sold * m.price
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filterSuffix = unitFilter === 'ALL' ? 'COMPLETE' : unitFilter;
    a.download = `TIDE_STOCK_INVENTORY_${filterSuffix}_${new Date().toISOString().split('T')[0]}.csv`;
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

  const setQuickFilter = (type: 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'YEAR') => {
    const now = new Date();
    const start = new Date();
    const end = new Date();
    
    if (type === 'TODAY') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (type === 'YESTERDAY') {
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (type === 'WEEK') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (type === 'MONTH') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (type === 'YEAR') {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }
    
    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    });
  };

  return (
    <div className="space-y-6">
      <div className="no-print space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">LEDGER DASHBOARD</h1>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Revenue Authority Terminal • Online</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowPOS(true)} className="px-5 py-2.5 bg-[#C8A862] text-[#0B1C2D] font-black rounded-lg hover:bg-[#B69651] transition-all text-xs uppercase tracking-widest shadow-lg">Walk-In POS</button>
            <button onClick={() => setShowFolio(true)} className="px-5 py-2.5 bg-[#C8A862] text-[#0B1C2D] font-black rounded-lg hover:bg-[#B69651] transition-all text-xs uppercase tracking-widest shadow-lg">Reservation Entry</button>
            <button onClick={() => setShowProforma(true)} className="px-5 py-2.5 bg-[#C8A862] text-[#0B1C2D] font-black rounded-lg hover:bg-[#B69651] transition-all text-xs uppercase tracking-widest shadow-lg">Proforma Invoice</button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-[#13263A] p-4 rounded-2xl border border-gray-700/30 flex flex-wrap items-end gap-4 shadow-xl">
          <div className="flex-1 min-w-[150px] space-y-1">
            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Revenue Unit</label>
            <select 
              className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-2 text-xs text-white outline-none focus:border-[#C8A862] transition-colors"
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
            >
              <option value="ALL">All Streams</option>
              <option value="ZENZA">Zenza Unit</option>
              <option value="WHISPERS">Whispers Unit</option>
              <option value="FOLIO">Folios</option>
            </select>
          </div>
          <div className="flex-1 min-w-[150px] space-y-1">
            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Status</label>
            <select 
              className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-2 text-xs text-white outline-none focus:border-[#C8A862] transition-colors"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Status</option>
              <option value={SettlementStatus.PAID}>Paid</option>
              <option value={SettlementStatus.PARTIAL}>Partial</option>
              <option value={SettlementStatus.UNPAID}>Unpaid</option>
            </select>
          </div>
          <div className="flex-1 min-w-[150px] space-y-1">
            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Method</label>
            <select 
              className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-2 text-xs text-white outline-none focus:border-[#C8A862] transition-colors"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
            >
              <option value="ALL">All Methods</option>
              <option value={SettlementMethod.CARD}>Card / POS</option>
              <option value={SettlementMethod.CASH}>Cash</option>
              <option value={SettlementMethod.TRANSFER}>Bank Transfer</option>
            </select>
          </div>
          <div className="flex-1 min-w-[150px] space-y-1">
            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#EAD8B1]" />
              Start Date
            </label>
            <input 
              type="date"
              className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-2 text-xs text-white outline-none focus:border-[#C8A862] transition-colors accent-[#C8A862]"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            />
          </div>
          <div className="flex-1 min-w-[150px] space-y-1">
            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#EAD8B1]" />
              End Date
            </label>
            <input 
              type="date"
              className="w-full bg-[#0B1C2D] border border-gray-700 rounded-lg p-2 text-xs text-white outline-none focus:border-[#C8A862] transition-colors accent-[#C8A862]"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <div className="flex bg-[#0B1C2D] rounded-lg p-1 border border-gray-700">
              <button onClick={() => setQuickFilter('TODAY')} className="px-3 py-1 text-[9px] font-black uppercase tracking-widest hover:text-[#C8A862] transition-colors">Today</button>
              <button onClick={() => setQuickFilter('YESTERDAY')} className="px-3 py-1 text-[9px] font-black uppercase tracking-widest hover:text-[#C8A862] transition-colors border-l border-gray-700">Yesterday</button>
              <button onClick={() => setQuickFilter('WEEK')} className="px-3 py-1 text-[9px] font-black uppercase tracking-widest hover:text-[#C8A862] transition-colors border-l border-gray-700">Week</button>
              <button onClick={() => setQuickFilter('MONTH')} className="px-3 py-1 text-[9px] font-black uppercase tracking-widest hover:text-[#C8A862] transition-colors border-l border-gray-700">Month</button>
              <button onClick={() => setQuickFilter('YEAR')} className="px-3 py-1 text-[9px] font-black uppercase tracking-widest hover:text-[#C8A862] transition-colors border-l border-gray-700">Year</button>
            </div>
            <button 
              onClick={() => { 
                setDateRange({ start: '', end: '' }); 
                setUnitFilter('ALL'); 
                setStatusFilter('ALL');
                setMethodFilter('ALL');
              }}
              className="px-4 py-2 bg-gray-800 text-gray-400 text-[10px] font-black uppercase rounded-lg hover:bg-gray-700 transition-all border border-gray-700"
            >
              Reset All
            </button>
            <button 
              onClick={downloadReport} 
              className="px-4 py-2 bg-blue-600/10 text-blue-400 text-[10px] font-black uppercase rounded-lg border border-blue-600/20 hover:bg-blue-600 hover:text-white transition-all shadow-lg"
            >
              Export Transactions
            </button>
            <button 
              onClick={downloadInventoryReport} 
              className="px-4 py-2 bg-green-600/10 text-green-500 text-[10px] font-black uppercase rounded-lg border border-green-600/20 hover:bg-green-600 hover:text-white transition-all shadow-lg"
            >
              Export Inventory
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#13263A] p-6 rounded-2xl border border-gray-700/30 shadow-xl">
            <p className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] mb-1">Total Valuation</p>
            <h2 className="text-3xl font-black text-white tracking-tighter">₦{filteredTransactions.reduce((a, b) => a + b.totalAmount, 0).toLocaleString()}</h2>
          </div>
          <div className="bg-[#13263A] p-6 rounded-2xl border border-gray-700/30 shadow-xl">
            <p className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] mb-1">Settled Revenue</p>
            <h2 className="text-3xl font-black text-green-400 tracking-tighter">₦{filteredTransactions.reduce((a, b) => a + b.paidAmount, 0).toLocaleString()}</h2>
          </div>
          <div className="bg-[#13263A] p-6 rounded-2xl border border-gray-700/30 shadow-xl">
            <p className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] mb-1">Outstanding</p>
            <h2 className="text-3xl font-black text-red-500 tracking-tighter">₦{filteredTransactions.reduce((a, b) => a + b.balance, 0).toLocaleString()}</h2>
          </div>
        </div>

        <div className="overflow-x-auto bg-[#13263A] rounded-2xl border border-gray-700/50 shadow-2xl">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-700/50 bg-[#0B1C2D]/50 text-[10px] font-black uppercase tracking-widest text-gray-500">
                <th className="px-6 py-5 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('reference')}>Origin/Ref</th>
                <th className="px-6 py-5 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('guestName')}>Guest & Operator</th>
                <th className="px-6 py-5">Items Sold</th>
                <th className="px-6 py-5 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('totalAmount')}>Financial Summary</th>
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
                    <div className="text-[10px] text-gray-600 font-bold">{formatToLocalDate(t.createdAt)} {formatToLocalTime(t.createdAt)}</div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-sm font-bold text-gray-200">{t.guestName}</div>
                    <div className="text-[10px] text-gray-500 font-medium truncate max-w-[150px] mb-1">{t.email || 'No Email'} • {t.phone || 'No Phone'}</div>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 rounded-full bg-gray-700 flex items-center justify-center text-[8px] font-black text-gray-300">
                        {t.cashierName?.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest">Operator: {t.cashierName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="max-w-[200px]">
                      {t.items.slice(0, 2).map((item, i) => (
                        <div key={i} className="text-[10px] text-gray-400 truncate font-medium">
                          • {item.description} <span className="text-gray-600">(x{item.quantity})</span>
                        </div>
                      ))}
                      {t.items.length > 2 && (
                        <div className="text-[9px] text-[#C8A862] font-black mt-1 italic">+{t.items.length - 2} MORE ITEMS</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span className="text-gray-500 uppercase tracking-tighter">Total:</span>
                        <span className="text-white">₦{t.totalAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-gray-500 uppercase tracking-tighter">Paid:</span>
                        <span className="text-green-400">₦{t.paidAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-gray-500 uppercase tracking-tighter">Bal:</span>
                        <span className={t.balance > 0 ? 'text-red-400' : 'text-gray-600'}>₦{t.balance.toLocaleString()}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <span className={`px-2 py-1 rounded text-[9px] font-black tracking-widest border ${
                      t.status === SettlementStatus.PAID ? 'border-green-500/30 text-green-400 bg-green-500/5' : 
                      t.status === SettlementStatus.PARTIAL ? 'border-yellow-500/30 text-yellow-400 bg-yellow-500/5' :
                      'border-red-500/30 text-red-400 bg-red-500/5'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right space-x-2">
                    {t.status !== SettlementStatus.PAID && (
                      <button 
                        onClick={() => setManagingTransaction(t)} 
                        className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-green-900/20 text-green-400 border border-green-500/20 hover:bg-green-600 hover:text-white rounded transition-all animate-pulse"
                      >
                        Settle
                      </button>
                    )}
                    {t.type === 'POS' && (
                      <button 
                        onClick={() => { setPosEditingTransaction(t); setShowPOS(true); }} 
                        className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-green-900/20 text-green-400 border border-green-500/20 hover:bg-green-600 hover:text-white rounded transition-all"
                      >
                        POS Add
                      </button>
                    )}
                    {t.type === 'PROFORMA' && (
                      <button 
                        onClick={() => { setProformaEditingTransaction(t); setShowProforma(true); }} 
                        className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-[#C8A862]/20 text-[#C8A862] border border-[#C8A862]/20 hover:bg-[#C8A862] hover:text-black rounded transition-all"
                      >
                        Edit Proforma
                      </button>
                    )}
                    <button 
                      onClick={() => setManagingTransaction(t)} 
                      className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-blue-900/20 text-blue-400 border border-blue-500/20 hover:bg-blue-600 hover:text-white rounded transition-all"
                    >
                      Manage
                    </button>
                    <button onClick={() => setViewingReceipt(t)} className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-[#C8A862]/10 text-[#C8A862] border border-[#C8A862]/20 hover:bg-[#C8A862] hover:text-black rounded transition-all">
                      {t.type === 'PROFORMA' ? 'Invoice' : 'Receipt'}
                    </button>
                    {user.role === UserRole.ADMIN && (
                      <button onClick={() => handleDelete(t)} className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-red-900/20 text-red-400 border border-red-500/20 hover:bg-red-900/40 rounded transition-all">Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTransactions.length === 0 && (
            <div className="p-20 text-center text-gray-600 uppercase text-[11px] font-black tracking-[0.5em] italic">No Matching Revenue Records Found</div>
          )}
        </div>
      </div>

      {showPOS && <POSModal user={user} existingTransaction={posEditingTransaction || undefined} onClose={() => { setShowPOS(false); setPosEditingTransaction(null); }} />}
      {showFolio && <FolioModal user={user} onClose={() => setShowFolio(false)} />}
      {showProforma && <ProformaModal user={user} existingTransaction={proformaEditingTransaction || undefined} onClose={() => { setShowProforma(false); setProformaEditingTransaction(null); }} />}
      {managingTransaction && (
        <ManageTransactionModal 
          transaction={managingTransaction} 
          onClose={() => setManagingTransaction(null)} 
        />
      )}
      {viewingReceipt && (
        viewingReceipt.type === 'PROFORMA' ? (
          <ProformaPreview transaction={viewingReceipt} settings={settings} onClose={() => setViewingReceipt(null)} />
        ) : (
          <ReceiptPreview transaction={viewingReceipt} onClose={() => setViewingReceipt(null)} />
        )
      )}
    </div>
  );
};

export default Dashboard;
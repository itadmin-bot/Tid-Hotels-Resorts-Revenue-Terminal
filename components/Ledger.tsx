import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, where } from 'firebase/firestore';
import { db } from '@/firebase';
import { LedgerEntry, LedgerType, UserProfile, AppSettings, Currency } from '@/types';
import { BRAND } from '@/constants';
import { Plus, Minus, TrendingUp, TrendingDown, DollarSign, Tag, FileText, Trash2, PieChart, BarChart3 } from 'lucide-react';
import HorizontalScrollArea from '@/components/HorizontalScrollArea';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart as RePieChart, Pie } from 'recharts';

interface LedgerProps {
  user: UserProfile;
  settings: AppSettings | null;
}

const Ledger: React.FC<LedgerProps> = ({ user, settings }) => {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEntry, setNewEntry] = useState({
    type: LedgerType.INCOME,
    category: '',
    amount: 0,
    description: '',
    date: new Date().toISOString().split('T')[0],
    currency: Currency.NGN
  });

  useEffect(() => {
    const isAdminUser = user.isAdmin === true;
    const ledgerRef = collection(db, 'ledger');
    
    const q = isAdminUser 
      ? query(ledgerRef, orderBy('date', 'desc'))
      : query(ledgerRef, where('recordedById', '==', user.uid), orderBy('date', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LedgerEntry[];
      setEntries(data);
      setLoading(false);
    }, (error) => {
      console.error("Ledger subscription error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user.uid, user.email]);

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newEntry.amount <= 0 || !newEntry.category) return;

    try {
      const entryData = {
        type: newEntry.type,
        category: newEntry.category,
        amount: newEntry.amount,
        description: newEntry.description,
        date: new Date(newEntry.date).getTime(),
        currency: newEntry.currency,
        recordedBy: user.displayName,
        recordedById: user.uid,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await addDoc(collection(db, 'ledger'), entryData);
      setShowAddModal(false);
      setNewEntry({
        type: LedgerType.INCOME,
        category: '',
        amount: 0,
        description: '',
        date: new Date().toISOString().split('T')[0],
        currency: Currency.NGN
      });
    } catch (err) {
      console.error("Error adding ledger entry:", err);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this entry?")) return;
    try {
      await deleteDoc(doc(db, 'ledger', id));
    } catch (err) {
      console.error("Error deleting ledger entry:", err);
    }
  };

  const totalsByCurrency = entries.reduce((acc, e) => {
    const curr = e.currency || Currency.NGN;
    if (!acc[curr]) acc[curr] = { income: 0, expense: 0 };
    if (e.type === LedgerType.INCOME) acc[curr].income += e.amount;
    else acc[curr].expense += e.amount;
    return acc;
  }, {} as Record<string, { income: number, expense: number }>);

  const currencies = Object.keys(totalsByCurrency) as Currency[];

  // Prepare chart data (defaulting to NGN for now to keep it simple, or we could filter)
  const chartData = entries
    .filter(e => (e.currency || Currency.NGN) === Currency.NGN)
    .reduce((acc: any[], entry) => {
    const dateStr = new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const existing = acc.find(item => item.date === dateStr);
    if (existing) {
      if (entry.type === LedgerType.INCOME) existing.income += entry.amount;
      else existing.expense += entry.amount;
    } else {
      acc.push({
        date: dateStr,
        income: entry.type === LedgerType.INCOME ? entry.amount : 0,
        expense: entry.type === LedgerType.EXPENSE ? entry.amount : 0,
        timestamp: entry.date
      });
    }
    return acc;
  }, []).sort((a, b) => a.timestamp - b.timestamp).slice(-7);

  const expenseCategoryData = entries
    .filter(e => e.type === LedgerType.EXPENSE)
    .reduce((acc: any[], entry) => {
      const existing = acc.find(item => item.name === entry.category);
      if (existing) {
        existing.value += entry.amount;
      } else {
        acc.push({ name: entry.category, value: entry.amount });
      }
      return acc;
    }, []);

  const COLORS = ['#C8A862', '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];

  const downloadLedgerReport = () => {
    const headers = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Currency', 'Recorded By'];
    const rows = entries.map(e => [
      new Date(e.date).toLocaleDateString(),
      e.type,
      `"${e.category}"`,
      `"${e.description || ''}"`,
      e.amount,
      e.currency || Currency.NGN,
      `"${e.recordedBy}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TIDE_FINANCIAL_LEDGER_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tighter uppercase text-white">Financial Ledger</h2>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Income, Expenses & Reporting</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={downloadLedgerReport}
            className="px-4 py-3 bg-blue-600/10 text-blue-400 font-black rounded-xl uppercase tracking-widest text-[10px] border border-blue-600/20 hover:bg-blue-600 hover:text-white transition-all shadow-lg flex items-center gap-2"
          >
            <BarChart3 className="w-4 h-4" />
            Export CSV
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="px-6 py-3 bg-[#C8A862] text-[#0B1C2D] font-black rounded-xl uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Record Entry
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#13263A] p-6 rounded-3xl border border-gray-700/50 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <TrendingUp className="w-16 h-16 text-green-500" />
          </div>
          <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Total Income</div>
          <div className="space-y-1">
            {currencies.length > 0 ? currencies.map(curr => (
              <div key={curr} className="text-2xl font-black text-green-500">
                {curr === Currency.USD ? '$' : '₦'}{totalsByCurrency[curr].income.toLocaleString()}
              </div>
            )) : <div className="text-2xl font-black text-green-500">₦0</div>}
          </div>
          <div className="mt-4 flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            Real-time Tracking
          </div>
        </div>

        <div className="bg-[#13263A] p-6 rounded-3xl border border-gray-700/50 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <TrendingDown className="w-16 h-16 text-red-500" />
          </div>
          <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Total Expenses</div>
          <div className="space-y-1">
            {currencies.length > 0 ? currencies.map(curr => (
              <div key={curr} className="text-2xl font-black text-red-500">
                {curr === Currency.USD ? '$' : '₦'}{totalsByCurrency[curr].expense.toLocaleString()}
              </div>
            )) : <div className="text-2xl font-black text-red-500">₦0</div>}
          </div>
          <div className="mt-4 flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
            Operational Costs
          </div>
        </div>

        <div className="bg-[#13263A] p-6 rounded-3xl border border-[#C8A862]/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <DollarSign className="w-16 h-16 text-[#C8A862]" />
          </div>
          <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Net Balance</div>
          <div className="space-y-1">
            {currencies.length > 0 ? currencies.map(curr => {
              const bal = totalsByCurrency[curr].income - totalsByCurrency[curr].expense;
              return (
                <div key={curr} className={`text-2xl font-black ${bal >= 0 ? 'text-[#C8A862]' : 'text-red-500'}`}>
                  {curr === Currency.USD ? '$' : '₦'}{bal.toLocaleString()}
                </div>
              );
            }) : <div className="text-2xl font-black text-[#C8A862]">₦0</div>}
          </div>
          <div className="mt-4 flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase">
            <div className="w-2 h-2 rounded-full bg-[#C8A862] animate-pulse"></div>
            Financial Health
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#13263A] p-6 rounded-3xl border border-gray-700/50">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Weekly Cash Flow
            </h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%" debounce={50}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                <XAxis dataKey="date" stroke="#6B7280" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#6B7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `₦${value / 1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0B1C2D', border: '1px solid #374151', borderRadius: '8px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Bar dataKey="income" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#13263A] p-6 rounded-3xl border border-gray-700/50">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
              <PieChart className="w-4 h-4" />
              Expense Distribution
            </h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%" debounce={50}>
              <RePieChart>
                <Pie
                  data={expenseCategoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {expenseCategoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0B1C2D', border: '1px solid #374151', borderRadius: '8px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
              </RePieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Entries Table */}
      <div className="bg-[#13263A] rounded-3xl border border-gray-700/50 overflow-hidden">
        <div className="p-6 border-b border-gray-700/50 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">Recent Transactions</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Live Feed</span>
            <div className="w-2 h-2 rounded-full bg-[#C8A862] animate-pulse"></div>
          </div>
        </div>
        <HorizontalScrollArea>
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-700/30">
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4">Recorded By</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/30">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="text-xs font-bold text-white">{new Date(entry.date).toLocaleDateString()}</div>
                    <div className="text-[10px] text-gray-500 font-medium">{new Date(entry.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${
                      entry.type === LedgerType.INCOME ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                    }`}>
                      {entry.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Tag className="w-3 h-3 text-gray-500" />
                      <span className="text-xs font-bold text-gray-300">{entry.category}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs text-gray-400 max-w-xs truncate">{entry.description || '-'}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className={`text-sm font-black ${entry.type === LedgerType.INCOME ? 'text-green-500' : 'text-red-500'}`}>
                      {entry.type === LedgerType.INCOME ? '+' : '-'}{entry.currency === Currency.USD ? '$' : '₦'}{entry.amount.toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{entry.recordedBy}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleDeleteEntry(entry.id)}
                      className="p-2 text-gray-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <FileText className="w-12 h-12 text-gray-700" />
                      <div className="text-gray-500 font-bold uppercase text-xs tracking-widest">No ledger entries found</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </HorizontalScrollArea>
      </div>

      {/* Add Entry Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#13263A] rounded-3xl border border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-black uppercase tracking-tighter text-white">Record Ledger Entry</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-500 hover:text-white text-2xl">&times;</button>
            </div>
            <form onSubmit={handleAddEntry} className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <button 
                  type="button"
                  onClick={() => setNewEntry({...newEntry, type: LedgerType.INCOME})}
                  className={`py-4 rounded-xl font-black uppercase text-xs tracking-widest border transition-all flex items-center justify-center gap-2 ${
                    newEntry.type === LedgerType.INCOME ? 'bg-green-500/10 border-green-500 text-green-500' : 'bg-[#0B1C2D] border-gray-700 text-gray-500'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  Income
                </button>
                <button 
                  type="button"
                  onClick={() => setNewEntry({...newEntry, type: LedgerType.EXPENSE})}
                  className={`py-4 rounded-xl font-black uppercase text-xs tracking-widest border transition-all flex items-center justify-center gap-2 ${
                    newEntry.type === LedgerType.EXPENSE ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-[#0B1C2D] border-gray-700 text-gray-500'
                  }`}
                >
                  <Minus className="w-4 h-4" />
                  Expense
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Category</label>
                  <input 
                    required
                    className="w-full bg-[#0B1C2D] border border-gray-700 rounded-xl p-4 text-sm text-white outline-none focus:border-[#C8A862] transition-all"
                    placeholder="e.g. Sales, Maintenance, Salary"
                    value={newEntry.category}
                    onChange={(e) => setNewEntry({...newEntry, category: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Currency</label>
                    <select
                      className="w-full bg-[#0B1C2D] border border-gray-700 rounded-xl p-4 text-sm text-white outline-none focus:border-[#C8A862] transition-all font-bold"
                      value={newEntry.currency}
                      onChange={(e) => setNewEntry({...newEntry, currency: e.target.value as Currency})}
                    >
                      <option value={Currency.NGN}>NGN (₦)</option>
                      <option value={Currency.USD}>USD ($)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Amount</label>
                    <input 
                      required
                      type="number"
                      className="w-full bg-[#0B1C2D] border border-gray-700 rounded-xl p-4 text-sm text-white outline-none focus:border-[#C8A862] transition-all font-bold"
                      placeholder="0.00"
                      value={newEntry.amount || ''}
                      onChange={(e) => setNewEntry({...newEntry, amount: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Date</label>
                  <input 
                    required
                    type="date"
                    className="w-full bg-[#0B1C2D] border border-gray-700 rounded-xl p-4 text-sm text-white outline-none focus:border-[#C8A862] transition-all"
                    value={newEntry.date}
                    onChange={(e) => setNewEntry({...newEntry, date: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Description (Optional)</label>
                  <textarea 
                    className="w-full bg-[#0B1C2D] border border-gray-700 rounded-xl p-4 text-sm text-white outline-none focus:border-[#C8A862] transition-all h-24 resize-none"
                    placeholder="Provide details about this entry..."
                    value={newEntry.description}
                    onChange={(e) => setNewEntry({...newEntry, description: e.target.value})}
                  />
                </div>
              </div>

              <button 
                type="submit"
                className="w-full py-5 bg-[#C8A862] text-[#0B1C2D] font-black rounded-xl uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all"
              >
                Save Entry
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Ledger;

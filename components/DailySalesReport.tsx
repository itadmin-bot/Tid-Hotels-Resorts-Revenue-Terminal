import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { Transaction, SettlementMethod, UnitType } from '@/types';
import { Calendar, Download, TrendingUp, CreditCard, Banknote, Landmark, FileText } from 'lucide-react';

interface DailySalesReportProps {
  onManage?: (transaction: Transaction) => void;
}

const DailySalesReport: React.FC<DailySalesReportProps> = ({ onManage }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'transactions'),
      where('createdAt', '>=', startOfDay.getTime()),
      where('createdAt', '<=', endOfDay.getTime())
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(txs.sort((a, b) => b.createdAt - a.createdAt));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedDate]);

  const stats = {
    gross: transactions.reduce((acc, t) => acc + t.totalAmount, 0),
    settled: transactions.reduce((acc, t) => acc + t.paidAmount, 0),
    outstanding: transactions.reduce((acc, t) => acc + t.balance, 0),
    net: transactions.reduce((acc, t) => acc + t.subtotal, 0),
    tax: transactions.reduce((acc, t) => acc + t.taxAmount, 0),
    sc: transactions.reduce((acc, t) => acc + t.serviceCharge, 0),
    discount: transactions.reduce((acc, t) => acc + t.discountAmount, 0),
    byMethod: {
      [SettlementMethod.CARD]: transactions.reduce((acc, t) => {
        const cardAmount = (t.payments || []).filter(p => p.method === SettlementMethod.CARD).reduce((sum, p) => sum + p.amount, 0);
        return acc + cardAmount;
      }, 0),
      [SettlementMethod.CASH]: transactions.reduce((acc, t) => {
        const cashAmount = (t.payments || []).filter(p => p.method === SettlementMethod.CASH).reduce((sum, p) => sum + p.amount, 0);
        return acc + cashAmount;
      }, 0),
      [SettlementMethod.TRANSFER]: transactions.reduce((acc, t) => {
        const transferAmount = (t.payments || []).filter(p => p.method === SettlementMethod.TRANSFER).reduce((sum, p) => sum + p.amount, 0);
        return acc + transferAmount;
      }, 0),
    },
    byUnit: {
      [UnitType.ZENZA]: transactions.filter(t => t.unit === UnitType.ZENZA).reduce((acc, t) => acc + t.totalAmount, 0),
      [UnitType.WHISPERS]: transactions.filter(t => t.unit === UnitType.WHISPERS).reduce((acc, t) => acc + t.totalAmount, 0),
      'FOLIO': transactions.filter(t => t.type === 'FOLIO').reduce((acc, t) => acc + t.totalAmount, 0),
    }
  };

  const handleExport = () => {
    const headers = ['Reference', 'Time', 'Guest', 'Type', 'Unit', 'Method', 'Total'];
    const rows = transactions.map(t => [
      t.reference,
      new Date(t.createdAt).toLocaleTimeString(),
      t.guestName,
      t.type,
      t.unit || 'N/A',
      t.settlementMethod || 'N/A',
      t.totalAmount
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Daily_Sales_Report_${selectedDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-[#0B1C2D] p-6 rounded-2xl border border-gray-700/50">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#C8A862]/10 rounded-xl border border-[#C8A862]/20">
            <Calendar className="w-6 h-6 text-[#C8A862]" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-tight">Revenue Reporting Hub</h2>
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Select date to generate daily ledger summary</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-[#13263A] border border-gray-700 rounded-lg px-4 py-2 text-white font-bold text-sm outline-none focus:border-[#C8A862] transition-all"
          />
          <button 
            onClick={handleExport}
            disabled={transactions.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#C8A862] text-[#0B1C2D] font-black rounded-lg text-xs uppercase tracking-widest hover:bg-[#B69651] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="animate-spin w-10 h-10 border-4 border-[#C8A862] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-500 font-black uppercase tracking-[0.2em] text-xs">Compiling Ledger Data...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-[#0B1C2D] p-6 rounded-2xl border border-gray-700/50 space-y-4">
              <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Settled Revenue</p>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-3xl font-black text-green-400">₦{stats.settled.toLocaleString()}</p>
              <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 w-full"></div>
              </div>
            </div>

            <div className="bg-[#0B1C2D] p-6 rounded-2xl border border-gray-700/50 space-y-4">
              <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Outstanding Balance</p>
                <Landmark className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-3xl font-black text-red-500">₦{stats.outstanding.toLocaleString()}</p>
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Unpaid Revenue Records</p>
            </div>

            <div className="bg-[#0B1C2D] p-6 rounded-2xl border border-gray-700/50 space-y-4">
              <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Tax Liability</p>
                <Landmark className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-3xl font-black text-white">₦{stats.tax.toLocaleString()}</p>
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">VAT + Other Property Taxes</p>
            </div>

            <div className="bg-[#0B1C2D] p-6 rounded-2xl border border-gray-700/50 space-y-4">
              <div className="flex justify-between items-start">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Total Valuation</p>
                <TrendingUp className="w-4 h-4 text-[#C8A862]" />
              </div>
              <p className="text-3xl font-black text-[#C8A862]">₦{stats.gross.toLocaleString()}</p>
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Gross Revenue (Paid + Unpaid)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-[#0B1C2D] rounded-2xl border border-gray-700/50 overflow-hidden">
              <div className="p-6 border-b border-gray-700/50 flex justify-between items-center">
                <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#C8A862]" />
                  Transaction Log
                </h3>
                <span className="px-3 py-1 bg-gray-800 rounded-full text-[9px] font-black text-gray-400 uppercase">{transactions.length} Records</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] text-gray-500 uppercase tracking-widest border-b border-gray-700/30">
                      <th className="p-4">Reference</th>
                      <th className="p-4">Time</th>
                      <th className="p-4">Guest</th>
                      <th className="p-4">Method</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Amount (₦)</th>
                      <th className="p-4 text-right">Terminal Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/20">
                    {transactions.map(t => (
                      <tr key={t.id} className="hover:bg-white/5 transition-colors">
                        <td className="p-4 font-mono text-[10px] text-gray-400">#{t.reference.split('-').pop()}</td>
                        <td className="p-4 text-[10px] font-bold text-white">{new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="p-4 text-[10px] font-black text-white uppercase truncate max-w-[120px]">{t.guestName}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                            t.settlementMethod === SettlementMethod.CASH ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                            t.settlementMethod === SettlementMethod.CARD ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                            'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          }`}>
                            {t.settlementMethod || 'N/A'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                            t.status === 'PAID' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                            t.status === 'PARTIAL' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                            'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="p-4 text-right font-black text-white text-[11px]">₦{t.totalAmount.toLocaleString()}</td>
                        <td className="p-4 text-right">
                          <button 
                            onClick={() => onManage?.(t)}
                            className="text-[9px] font-black uppercase tracking-widest px-3 py-1 bg-blue-600/10 text-blue-400 border border-blue-600/20 hover:bg-blue-600 hover:text-white rounded transition-all"
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                    {transactions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-gray-600 font-black uppercase tracking-widest italic text-xs">No transactions recorded for this period</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-[#0B1C2D] rounded-2xl border border-gray-700/50 p-6 space-y-6">
                <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-[#C8A862]" />
                  Settlement Breakdown
                </h3>
                <div className="space-y-4">
                  {[
                    { label: 'Bank Transfer', value: stats.byMethod[SettlementMethod.TRANSFER], icon: Landmark, color: 'text-purple-400' },
                    { label: 'Card / POS', value: stats.byMethod[SettlementMethod.CARD], icon: CreditCard, color: 'text-blue-400' },
                    { label: 'Cash Payment', value: stats.byMethod[SettlementMethod.CASH], icon: Banknote, color: 'text-green-400' },
                  ].map((m, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-[#13263A] rounded-xl border border-gray-700/50">
                      <div className="flex items-center gap-3">
                        <m.icon className={`w-4 h-4 ${m.color}`} />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{m.label}</span>
                      </div>
                      <span className="text-xs font-black text-white">₦{m.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#0B1C2D] rounded-2xl border border-gray-700/50 p-6 space-y-6">
                <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#C8A862]" />
                  Unit Performance
                </h3>
                <div className="space-y-4">
                  {[
                    { label: 'Zenza POS', value: stats.byUnit[UnitType.ZENZA] },
                    { label: 'Whispers POS', value: stats.byUnit[UnitType.WHISPERS] },
                    { label: 'Room Folios', value: stats.byUnit['FOLIO'] },
                  ].map((u, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                        <span className="text-gray-500">{u.label}</span>
                        <span className="text-white">₦{u.value.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#C8A862]" 
                          style={{ width: `${stats.gross > 0 ? (u.value / stats.gross) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DailySalesReport;

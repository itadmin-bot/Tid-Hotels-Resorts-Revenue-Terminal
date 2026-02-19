import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Transaction, UnitType, AppSettings } from '../types';
import { BRAND, ZENZA_BANK, WHISPERS_BANK, INVOICE_BANKS } from '../constants';

interface ReceiptPreviewProps {
  transaction: Transaction;
  onClose: () => void;
}

const ReceiptPreview: React.FC<ReceiptPreviewProps> = ({ transaction, onClose }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const isPos = transaction.type === 'POS';

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettings({
          hotelName: data.hotelName || BRAND.name,
          hotelAddress: data.hotelAddress || BRAND.address,
          vat: data.vat,
          serviceCharge: data.serviceCharge,
          zenzaBanks: Array.isArray(data.zenzaBanks) ? data.zenzaBanks : (data.zenzaBank ? [data.zenzaBank] : [ZENZA_BANK]),
          whispersBanks: Array.isArray(data.whispersBanks) ? data.whispersBanks : (data.whispersBank ? [data.whispersBank] : [WHISPERS_BANK]),
          invoiceBanks: data.invoiceBanks || INVOICE_BANKS
        } as AppSettings);
      }
    });
    return () => unsubscribe();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (!settings) return null;

  const bankList = isPos 
    ? (transaction.unit === UnitType.ZENZA ? settings.zenzaBanks : settings.whispersBanks)
    : settings.invoiceBanks;

  const currentBanks = transaction.selectedBank ? [transaction.selectedBank] : bankList;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 overflow-y-auto">
      <div className="flex flex-col h-full w-full max-w-4xl p-4">
        <div className="flex justify-between items-center mb-6 no-print">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-[#C8A862] rounded-full"></div>
            <h3 className="text-white font-bold tracking-widest uppercase text-sm">Revenue Documentation</h3>
          </div>
          <div className="flex gap-4">
            <button onClick={handlePrint} className="px-8 py-2 bg-[#C8A862] text-black font-bold rounded shadow-lg transition-transform hover:scale-105 active:scale-95">Print Document</button>
            <button onClick={onClose} className="px-8 py-2 border border-gray-600 text-white rounded transition-colors hover:bg-gray-800">Close Hub</button>
          </div>
        </div>

        <div className="flex-1 bg-gray-300 p-8 rounded-xl shadow-inner mx-auto overflow-y-auto w-full flex justify-center print:bg-white print:p-0 print:shadow-none">
          {isPos ? (
            <div className="docket-container text-black bg-white p-6 font-mono text-[10px] leading-tight shadow-xl">
              <div className="text-center border-b border-black/10 pb-4 mb-4">
                <h1 className="text-xl font-bold tracking-tighter uppercase">{settings.hotelName}</h1>
                <p className="text-[8px] font-sans opacity-70 uppercase">{settings.hotelAddress}</p>
              </div>

              <div className="mb-4 space-y-0.5 uppercase">
                <p className="font-bold">DOCKET: #{transaction.reference}</p>
                <p>DATE: {new Date(transaction.createdAt).toLocaleDateString()}</p>
                <div className="h-2"></div>
                <p>OUTLET: {transaction.unit}</p>
                <p>CASHIER: {transaction.cashierName}</p>
              </div>

              <div className="border-y border-dashed border-black/20 py-3 mb-3">
                <div className="font-bold flex justify-between mb-2 text-[9px]">
                  <span>ITEM</span>
                  <span>TOTAL</span>
                </div>
                {transaction.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between mb-1">
                    <span className="truncate pr-4">{item.description} (x{item.quantity})</span>
                    <span>₦{item.total.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-[9px] border-b border-dashed border-black/10 pb-2 mb-2">
                <div className="flex justify-between">
                  <span>GROSS:</span>
                  <span>₦{transaction.subtotal.toLocaleString()}</span>
                </div>
                {transaction.discountAmount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>DISCOUNT:</span>
                    <span>-₦{transaction.discountAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>VAT ({((settings?.vat || 0) * 100).toFixed(1)}% Inc):</span>
                  <span>₦{transaction.taxAmount.toLocaleString()}</span>
                </div>
                {/* Note: Service Charge hidden on POS as per instructions */}
              </div>

              <div className="text-right text-sm font-black mb-4 uppercase">Grand Total: ₦{transaction.totalAmount.toLocaleString()}</div>

              <div className="border-t border-black/10 pt-3 space-y-1 mb-6 uppercase">
                <p className="font-bold text-[8px] opacity-60">Payment Breakdown:</p>
                {transaction.payments && transaction.payments.length > 0 ? (
                  transaction.payments.map((p, i) => (
                    <div key={i} className="flex justify-between text-[9px]">
                      <span>{p.method}</span>
                      <span>₦{p.amount.toLocaleString()}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between text-[9px]">
                    <span>{transaction.settlementMethod || 'N/A'}</span>
                    <span>₦{transaction.paidAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-xs border-t border-black/5 pt-1 mt-1">
                  <span>OUTSTANDING:</span>
                  <span>₦{transaction.balance.toLocaleString()}</span>
                </div>
              </div>

              <div className="mb-6">
                <div className="font-bold text-[8px] uppercase tracking-widest opacity-60 mb-1">Settlement Account(s)</div>
                <div className="space-y-1">
                  {currentBanks.map((bank, i) => (
                    <div key={i} className="p-1 border border-dashed border-black/10 text-[8px]">
                      <p className="font-bold">{bank.bank}</p>
                      <p>{bank.accountNumber} • {bank.accountName}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-center italic text-[8px] opacity-50">Revenue Authority Verified • TIDÈ</div>
            </div>
          ) : (
            <div className="invoice-container text-black bg-white p-[20mm] font-sans text-sm shadow-2xl">
              <div className="flex justify-between items-start border-b-2 border-black pb-8 mb-8">
                <div>
                  <h1 className="text-3xl font-black tracking-tighter mb-1 uppercase">{settings.hotelName}</h1>
                  <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{settings.hotelAddress}</p>
                </div>
                <div className="text-right">
                  <h2 className="text-xl font-black text-gray-400 uppercase tracking-tighter mb-1">Reservation Folio</h2>
                  <p className="text-lg font-bold text-[#C8A862]">REF: {transaction.reference}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-20 mb-8">
                <div>
                  <h3 className="font-black uppercase text-[10px] text-gray-400 mb-2 tracking-widest">Guest Info</h3>
                  <p className="text-lg font-black uppercase">{transaction.guestName}</p>
                  <p className="text-gray-600 text-xs">{transaction.email} • {transaction.phone}</p>
                </div>
                <div className="text-right">
                  <h3 className="font-black uppercase text-[10px] text-gray-400 mb-2 tracking-widest">Metadata</h3>
                  <p className="text-xs font-bold">Issued: {new Date(transaction.createdAt).toLocaleString()}</p>
                  <p className="text-xs font-bold text-[#C8A862]">Operator: {transaction.cashierName}</p>
                </div>
              </div>

              <table className="w-full mb-8 border-collapse">
                <thead>
                  <tr className="bg-gray-900 text-white text-[10px] uppercase font-black tracking-widest">
                    <th className="text-left p-4">Description</th>
                    <th className="text-center p-4">Qty</th>
                    <th className="text-right p-4">Amount</th>
                  </tr>
                </thead>
                <tbody className="font-bold">
                  {transaction.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="p-4">{item.description}</td>
                      <td className="text-center p-4">{item.quantity}</td>
                      <td className="text-right p-4">₦{item.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end mb-12">
                <div className="w-80 space-y-2 border-t-2 border-black pt-4">
                  <div className="flex justify-between text-[11px] text-gray-500 uppercase font-black">
                    <span>Gross Value</span>
                    <span>₦{transaction.subtotal.toLocaleString()}</span>
                  </div>
                  {transaction.discountAmount > 0 && (
                    <div className="flex justify-between text-[11px] text-red-600 font-black">
                      <span>Discount Adjustment</span>
                      <span>-₦{transaction.discountAmount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[11px] text-gray-600 font-black">
                    <span>VAT ({( (settings?.vat || 0) * 100).toFixed(1)}%)</span>
                    <span>₦{transaction.taxAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-600 font-black">
                    <span>Service Charge ({( (settings?.serviceCharge || 0) * 100).toFixed(1)}%)</span>
                    <span>₦{transaction.serviceCharge.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-lg text-black font-black border-t border-black/10 pt-2">
                    <span>Folio Total</span>
                    <span>₦{transaction.totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs text-green-600 font-black pt-1">
                    <span>Paid to Date</span>
                    <span>₦{transaction.paidAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm text-red-600 font-black border-t-2 border-dashed border-gray-200 pt-1">
                    <span>Outstanding Balance</span>
                    <span>₦{transaction.balance.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 text-[10px]">
                <div className="bg-gray-50 p-4 rounded border border-black/5">
                  <p className="font-black uppercase tracking-widest mb-2">Settlement Registry</p>
                  <div className="space-y-1 font-bold">
                    {transaction.payments && transaction.payments.length > 0 ? (
                      transaction.payments.map((p, i) => (
                        <div key={i} className="flex justify-between border-b border-dashed border-gray-200 pb-1">
                          <span>{p.method} • {new Date(p.timestamp).toLocaleDateString()}</span>
                          <span>₦{p.amount.toLocaleString()}</span>
                        </div>
                      ))
                    ) : (
                      <div className="flex justify-between border-b border-dashed border-gray-200 pb-1">
                        <span>{transaction.settlementMethod || 'Direct'}</span>
                        <span>₦{transaction.paidAmount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right flex flex-col justify-end">
                  <p className="font-black uppercase tracking-widest mb-1">Corporate Accounts</p>
                  {currentBanks.map((bank, i) => (
                    <p key={i} className="text-[9px] text-gray-600 uppercase font-bold">{bank.bank} • {bank.accountNumber} • {bank.accountName}</p>
                  ))}
                  <div className="h-4"></div>
                  <p className="text-[8px] italic opacity-40 uppercase">This is a verified revenue authority document.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReceiptPreview;
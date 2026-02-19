import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
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
    if (!auth.currentUser) return;

    const unsubscribe = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettings({
          hotelName: data.hotelName || BRAND.name,
          hotelSubName: data.hotelSubName || 'Hotels & Resorts',
          hotelAddress: data.hotelAddress || BRAND.address,
          vat: data.vat,
          serviceCharge: data.serviceCharge,
          zenzaBanks: Array.isArray(data.zenzaBanks) ? data.zenzaBanks : (data.zenzaBank ? [data.zenzaBank] : [ZENZA_BANK]),
          whispersBanks: Array.isArray(data.whispersBanks) ? data.whispersBanks : (data.whispersBank ? [data.whispersBank] : [WHISPERS_BANK]),
          invoiceBanks: data.invoiceBanks || INVOICE_BANKS
        } as AppSettings);
      }
    }, (error) => {
      console.warn("Receipt Settings subscription error:", error);
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

  // Helper to split name and instructions for better kitchen visibility
  const formatItemDescription = (desc: string) => {
    if (!desc.includes(' (')) return { name: desc, notes: '' };
    const parts = desc.split(' (');
    return {
      name: parts[0],
      notes: parts[1].replace(')', '')
    };
  };

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
            <div className="docket-container text-black bg-white p-4 font-mono text-[11px] leading-tight shadow-xl">
              <div className="text-center border-b-2 border-black pb-2 mb-2">
                <h1 className="text-base font-black tracking-tighter uppercase leading-none">{settings.hotelName}</h1>
                <p className="text-[7px] font-sans font-bold opacity-80 uppercase leading-tight mt-1">{settings.hotelAddress}</p>
              </div>

              <div className="grid grid-cols-2 gap-y-0.5 uppercase mb-2 text-[9px]">
                <p className="font-bold">REF: {transaction.reference}</p>
                <p className="text-right">{new Date(transaction.createdAt).toLocaleDateString()}</p>
                <p>UNIT: {transaction.unit}</p>
                <p className="text-right">OPS: {transaction.cashierName.split(' ')[0]}</p>
              </div>

              <div className="border-t border-b border-dashed border-black py-1.5 mb-2">
                <div className="font-black flex justify-between mb-1 text-[10px]">
                  <span>ITEM / DESCRIPTION</span>
                  <span>TOTAL</span>
                </div>
                {transaction.items.map((item, idx) => {
                  const { name, notes } = formatItemDescription(item.description);
                  return (
                    <div key={idx} className="mb-1.5">
                      <div className="flex justify-between items-start">
                        <span className="font-bold uppercase text-[10px] flex-1">{name} x{item.quantity}</span>
                        <span className="shrink-0 ml-2 font-bold">₦{item.total.toLocaleString()}</span>
                      </div>
                      {notes && (
                        <div className="italic text-[9px] font-bold leading-none mt-0.5 pl-1 border-l border-black/30">
                          {notes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-0.5 text-[9px] border-b border-dashed border-black pb-1 mb-1 font-bold">
                <div className="flex justify-between">
                  <span>GROSS:</span>
                  <span>₦{transaction.subtotal.toLocaleString()}</span>
                </div>
                {transaction.discountAmount > 0 && (
                  <div className="flex justify-between">
                    <span>DISC:</span>
                    <span>-₦{transaction.discountAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>VAT ({((settings?.vat || 0) * 100).toFixed(1)}%):</span>
                  <span>₦{transaction.taxAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex justify-between items-center mb-3 py-1 bg-black/5 px-1">
                <span className="text-[10px] font-black uppercase">GRAND TOTAL:</span>
                <span className="text-base font-black">₦{transaction.totalAmount.toLocaleString()}</span>
              </div>

              <div className="space-y-0.5 mb-4 uppercase text-[9px]">
                <p className="font-black text-[8px] opacity-60 border-b border-black/5 mb-1">SETTLEMENT:</p>
                {transaction.payments && transaction.payments.length > 0 ? (
                  transaction.payments.map((p, i) => (
                    <div key={i} className="flex justify-between font-bold">
                      <span>{p.method}</span>
                      <span>₦{p.amount.toLocaleString()}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between font-bold">
                    <span>{transaction.settlementMethod || 'N/A'}</span>
                    <span>₦{transaction.paidAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-xs border-t border-black pt-1 mt-1">
                  <span>BALANCE:</span>
                  <span>₦{transaction.balance.toLocaleString()}</span>
                </div>
              </div>

              {transaction.balance > 0 && (
                <div className="mb-4 bg-black/5 p-1 rounded">
                  <p className="font-black text-[7px] uppercase tracking-widest opacity-60 mb-1">Settlement Details:</p>
                  <div className="space-y-1">
                    {currentBanks.map((bank, i) => (
                      <div key={i} className="text-[8px] font-bold">
                        <p>{bank.bank} • {bank.accountNumber}</p>
                        <p className="text-[7px] opacity-70">{bank.accountName}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-center italic text-[8px] font-bold opacity-60 border-t border-dashed border-black pt-2">
                VERIFIED REVENUE DOCUMENT • TIDÈ
              </div>
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
                      <td className="p-4 leading-relaxed">{item.description}</td>
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
                  {transaction.balance > 0 && (
                    <div className="mb-4">
                      <p className="font-black uppercase tracking-widest mb-1">Corporate Accounts</p>
                      {currentBanks.map((bank, i) => (
                        <p key={i} className="text-[9px] text-gray-600 uppercase font-bold">{bank.bank} • {bank.accountNumber} • {bank.accountName}</p>
                      ))}
                    </div>
                  )}
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
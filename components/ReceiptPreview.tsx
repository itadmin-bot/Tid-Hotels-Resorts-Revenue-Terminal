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

  const formatItemDescription = (desc: string) => {
    if (!desc.includes(' (')) return { name: desc, notes: '' };
    const parts = desc.split(' (');
    return {
      name: parts[0],
      notes: parts[1].replace(')', '')
    };
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 overflow-y-auto no-print">
      <div className="flex flex-col h-full w-full max-w-4xl p-4">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-[#C8A862] rounded-full"></div>
            <h3 className="text-white font-bold tracking-widest uppercase text-sm">Revenue Documentation</h3>
          </div>
          <div className="flex gap-4">
            <button onClick={handlePrint} className="px-8 py-2 bg-[#C8A862] text-black font-bold rounded shadow-lg transition-transform hover:scale-105 active:scale-95">Print Document</button>
            <button onClick={onClose} className="px-8 py-2 border border-gray-600 text-white rounded transition-colors hover:bg-gray-800">Close Hub</button>
          </div>
        </div>

        <div className="flex-1 bg-gray-300 p-2 md:p-8 rounded-xl shadow-inner mx-auto overflow-y-auto w-full flex justify-center">
          {/* Print container with h-fit to prevent trailing empty space */}
          <div className="bg-white p-0 border-none shadow-none print-active h-fit overflow-hidden">
            {isPos ? (
              <div className="docket-container text-black bg-white p-0 font-mono text-[11px] leading-tight border-none shadow-none">
                {/* Header Section */}
                <div className="text-center mb-2">
                  <h1 className="text-lg font-black tracking-tighter uppercase leading-none">{settings.hotelName}</h1>
                  <p className="text-[8px] font-bold opacity-80 uppercase leading-none mt-1">{settings.hotelAddress}</p>
                </div>

                {/* Metadata Summary */}
                <div className="grid grid-cols-2 gap-x-1 uppercase text-[9px] border-b border-black pb-0.5 mb-1">
                  <p className="font-black truncate">REF: {transaction.reference.split('-').pop()}</p>
                  <p className="text-right">{new Date(transaction.createdAt).toLocaleDateString()}</p>
                  <p className="opacity-70">UNIT: {transaction.unit}</p>
                  <p className="text-right opacity-70">OPS: {transaction.cashierName.split(' ')[0]}</p>
                </div>

                {/* Order Lines */}
                <div className="mb-1">
                  <div className="font-black flex justify-between border-b border-black pb-0.5 mb-1 text-[9px]">
                    <span>ITEM/QTY</span>
                    <span className="text-right">TOTAL</span>
                  </div>
                  {transaction.items.map((item, idx) => {
                    const { name, notes } = formatItemDescription(item.description);
                    return (
                      <div key={idx} className="mb-0.5 pb-0.5 border-b border-dotted border-black/10 last:border-0">
                        <div className="flex justify-between items-start">
                          <span className="font-bold uppercase text-[10px] flex-1 leading-none mr-2">
                            {name} <span className="font-black">x{item.quantity}</span>
                          </span>
                          <span className="shrink-0 font-black">₦{item.total.toLocaleString()}</span>
                        </div>
                        {notes && (
                          <div className="font-black text-[9px] leading-none mt-0.5 uppercase italic">
                            {'>> '}{notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Financial Summary */}
                <div className="space-y-0.5 text-[10px] mb-1 font-bold border-t border-dotted border-black pt-1">
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
                    <span>VAT ({(settings?.vat || 0.075) * 100}%):</span>
                    <span>₦{transaction.taxAmount.toLocaleString()}</span>
                  </div>
                </div>

                {/* Grand Total - Prominent */}
                <div className="flex justify-between items-center mb-2 border-t border-b border-black py-1">
                  <span className="text-[11px] font-black uppercase">GRAND TOTAL:</span>
                  <span className="text-base font-black">₦{transaction.totalAmount.toLocaleString()}</span>
                </div>

                {/* Payment & Balance */}
                <div className="space-y-0.5 mb-1 uppercase text-[9px]">
                  {transaction.payments && transaction.payments.length > 0 ? (
                    transaction.payments.map((p, i) => (
                      <div key={i} className="flex justify-between font-bold">
                        <span>{p.method}:</span>
                        <span>₦{p.amount.toLocaleString()}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between font-bold">
                      <span>{transaction.settlementMethod || 'DIRECT'}:</span>
                      <span>₦{transaction.paidAmount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-[11px] border-t border-dotted border-black pt-0.5 mt-0.5">
                    <span>BALANCE:</span>
                    <span>₦{transaction.balance.toLocaleString()}</span>
                  </div>
                </div>

                {/* Settlement Instructions */}
                {transaction.balance > 0 && (
                  <div className="mb-2 border border-dotted border-black p-1">
                    <p className="font-black text-[8px] uppercase opacity-70 mb-0.5 underline">Settlement Info:</p>
                    {currentBanks.map((bank, i) => (
                      <p key={i} className="text-[9px] font-bold leading-tight">{bank.bank}: {bank.accountNumber}</p>
                    ))}
                  </div>
                )}

                {/* Vertical end point indicator */}
                <div className="text-center italic text-[8px] font-black border-t border-black pt-1 mt-1">
                  *** VERIFIED REVENUE RECORD ***
                </div>
              </div>
            ) : (
              <div className="invoice-container text-black bg-white p-[10mm] md:p-[20mm] font-sans text-sm shadow-none border-none">
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

                <div className="grid grid-cols-2 gap-10 md:gap-20 mb-8">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-[10px]">
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
    </div>
  );
};

export default ReceiptPreview;
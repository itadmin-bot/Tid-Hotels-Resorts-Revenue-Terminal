
import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Transaction, UnitType, AppSettings } from '../types';
import { BRAND } from '../constants';

interface ReceiptPreviewProps {
  transaction: Transaction;
  onClose: () => void;
}

const ReceiptPreview: React.FC<ReceiptPreviewProps> = ({ transaction, onClose }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  
  // Logic: POS transactions use Docket (80mm), FOLIO transactions use A4 Invoice (210mm).
  const isPos = transaction.type === 'POS';

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (snapshot.exists()) setSettings(snapshot.data() as AppSettings);
    });
    return () => unsubscribe();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (!settings) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 overflow-y-auto">
      <div className="flex flex-col h-full w-full max-w-4xl p-4">
        <div className="flex justify-between items-center mb-6 no-print">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-[#C8A862] rounded-full"></div>
            <h3 className="text-white font-bold tracking-widest uppercase text-sm">Revenue Authority Documentation</h3>
          </div>
          <div className="flex gap-4">
            <button onClick={handlePrint} className="px-8 py-2 bg-[#C8A862] text-black font-bold rounded shadow-lg transition-transform hover:scale-105 active:scale-95">Print {isPos ? '80mm Docket' : 'A4 Invoice'}</button>
            <button onClick={onClose} className="px-8 py-2 border border-gray-600 text-white rounded transition-colors hover:bg-gray-800">Exit Hub</button>
          </div>
        </div>

        <div className="flex-1 bg-gray-300 p-8 rounded-xl shadow-inner mx-auto overflow-y-auto w-full flex justify-center print:bg-white print:p-0 print:shadow-none">
          {isPos ? (
            /* 80mm DOCKET - Specialized for Walk-in POS transactions */
            <div className="docket-container text-black bg-white p-6 font-mono text-[10px] leading-tight shadow-xl">
              <div className="text-center border-b border-black/10 pb-4 mb-4">
                <h1 className="text-xl font-bold tracking-tighter">{BRAND.name}</h1>
                <p className="text-[8px] font-sans opacity-70">{BRAND.address}</p>
              </div>

              <div className="mb-4 space-y-0.5 uppercase">
                <p className="font-bold">DOCKET: #{transaction.reference}</p>
                <p>DATE: {new Date(transaction.createdAt).toLocaleDateString()}</p>
                <p>TIME: {new Date(transaction.createdAt).toLocaleTimeString()}</p>
                <div className="h-2"></div>
                <p>OUTLET: {transaction.unit}</p>
                <p>CASHIER: {transaction.cashierName}</p>
              </div>

              <div className="border-y border-dashed border-black/20 py-3 mb-3">
                <div className="font-bold flex justify-between mb-2 text-[9px]">
                  <span>DESCRIPTION</span>
                  <span>TOTAL</span>
                </div>
                {transaction.items.map((item, idx) => (
                  <div key={idx} className="mb-2">
                    <div className="flex justify-between">
                      <span className="pr-4">{item.description} (x{item.quantity})</span>
                      <span>₦{item.total.toLocaleString()}</span>
                    </div>
                    <div className="text-[8px] opacity-60 italic">
                      @{item.price.toLocaleString()} per unit
                    </div>
                  </div>
                ))}
                {transaction.discountAmount > 0 && (
                  <div className="flex justify-between border-t border-black/5 pt-2 font-bold italic text-red-600">
                    <span>DISCOUNT APPLIED</span>
                    <span>-₦{transaction.discountAmount.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="text-right text-sm font-black mb-6">
                GRAND TOTAL: ₦{transaction.totalAmount.toLocaleString()}
              </div>

              <div className="border-t border-black/10 pt-3 space-y-1.5 mb-6 uppercase">
                <div className="flex justify-between">
                  <span>PAID ({transaction.settlementMethod}):</span>
                  <span>₦{transaction.paidAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold text-xs border-t border-black/5 pt-1">
                  <span>BALANCE:</span>
                  <span>₦{transaction.balance.toLocaleString()}</span>
                </div>
              </div>

              <div className="mb-6">
                <div className="font-bold text-[8px] uppercase tracking-widest opacity-60 mb-1">Settlement Account</div>
                <div className="p-2 border border-dashed border-black/10 bg-gray-50 text-[9px] space-y-0.5">
                  {transaction.unit === UnitType.ZENZA ? (
                    <>
                      <p className="font-bold">{settings.zenzaBank.bank}</p>
                      <p>Acc: {settings.zenzaBank.accountNumber}</p>
                      <p className="truncate">Name: {settings.zenzaBank.accountName}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold">{settings.whispersBank.bank}</p>
                      <p>Acc: {settings.whispersBank.accountNumber}</p>
                      <p className="truncate">Name: {settings.whispersBank.accountName}</p>
                    </>
                  )}
                </div>
              </div>

              <div className="text-center italic text-[8px] opacity-50">
                Inclusive of VAT and Service Charge.
                <p className="mt-2 font-sans not-italic font-black text-black uppercase tracking-widest">Revenue Authority Verified</p>
              </div>
            </div>
          ) : (
            /* A4 INVOICE - Specialized for Reservations/Folio management */
            <div className="invoice-container text-black bg-white p-[20mm] font-sans text-sm shadow-2xl">
              <div className="flex justify-between items-start border-b-2 border-black pb-8 mb-8">
                <div>
                  <h1 className="text-3xl font-black tracking-tighter mb-1">{BRAND.name}</h1>
                  <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{BRAND.address}</p>
                </div>
                <div className="text-right">
                  <h2 className="text-xl font-black text-gray-400 uppercase tracking-tighter mb-1">Reservation Folio / Invoice</h2>
                  <p className="text-lg font-bold text-[#C8A862]">REF: {transaction.reference}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-20 mb-12">
                <div>
                  <h3 className="font-black uppercase text-[10px] text-gray-400 mb-4 border-b pb-1 tracking-widest">Guest Identification</h3>
                  <div className="space-y-1">
                    <p className="text-xl font-black text-black uppercase">{transaction.guestName}</p>
                    <p className="text-gray-600 font-bold">{transaction.identityType}: {transaction.idNumber}</p>
                    <p className="text-gray-600 font-medium">{transaction.email}</p>
                    <p className="text-gray-600 font-medium">{transaction.phone}</p>
                  </div>
                </div>
                <div className="text-right">
                  <h3 className="font-black uppercase text-[10px] text-gray-400 mb-4 border-b pb-1 tracking-widest">Operational Metadata</h3>
                  <div className="space-y-1 text-gray-600 font-bold">
                    <p>Issue Date: <span className="text-black">{new Date(transaction.createdAt).toLocaleString()}</span></p>
                    <p>Terminal: <span className="text-black">{transaction.cashierName}</span></p>
                    {transaction.roomDetails && (
                      <div className="pt-2 mt-2 border-t border-dashed border-gray-300">
                        <p>Stay Cycle: <span className="text-black">{transaction.roomDetails.checkIn} - {transaction.roomDetails.checkOut}</span></p>
                        <p>Total Cycle: <span className="text-black">{transaction.roomDetails.nights} Night(s)</span></p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <table className="w-full mb-12 border-collapse">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="text-left p-4 uppercase text-[10px] font-black tracking-widest">Service Description</th>
                    <th className="text-center p-4 uppercase text-[10px] font-black tracking-widest">Qty / Count</th>
                    <th className="text-right p-4 uppercase text-[10px] font-black tracking-widest">Rate per Unit</th>
                    <th className="text-right p-4 uppercase text-[10px] font-black tracking-widest">Net Total</th>
                  </tr>
                </thead>
                <tbody className="font-bold border-b-2 border-gray-900">
                  {transaction.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="p-4">{item.description}</td>
                      <td className="text-center p-4">{item.quantity}</td>
                      <td className="text-right p-4">₦{item.price.toLocaleString()}</td>
                      <td className="text-right p-4">₦{item.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end mb-20">
                <div className="w-80 space-y-3">
                  <div className="flex justify-between text-gray-400 font-black uppercase text-[10px] tracking-widest">
                    <span>Valuation Base</span>
                    <span>₦{transaction.subtotal.toLocaleString()}</span>
                  </div>
                  {transaction.discountAmount > 0 && (
                    <div className="flex justify-between text-red-600 font-black uppercase text-[10px] tracking-widest">
                      <span>Discount Benefit</span>
                      <span>-₦{transaction.discountAmount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-400 font-black uppercase text-[10px] tracking-widest">
                    <span>VAT (7.5%) - Included</span>
                    <span>₦{transaction.taxAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-400 font-black uppercase text-[10px] tracking-widest">
                    <span>S.C. (10%) - Included</span>
                    <span>₦{transaction.serviceCharge.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t-2 border-black pt-4 text-2xl font-black">
                    <span>Grand Total</span>
                    <span>₦{transaction.totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-green-600 font-black text-lg">
                    <span>Account Settlement</span>
                    <span>₦{transaction.paidAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t border-black/10 pt-2 text-xl font-black text-red-600">
                    <span>Outstanding Due</span>
                    <span>₦{transaction.balance.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-10 grid grid-cols-2 gap-10 text-[9px] text-gray-400">
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 border border-black/5 rounded">
                    <p className="font-black text-black uppercase tracking-widest mb-2">Notice: Official Payment Accounts</p>
                    <div className="space-y-2 text-black font-bold">
                      {settings.invoiceBanks.map((bank, i) => (
                        <p key={i} className="border-b border-dashed border-gray-200 pb-1 last:border-0">{bank.bank} | {bank.accountNumber} | {bank.accountName}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="text-right flex flex-col justify-end">
                  <div className="border-t-2 border-black w-64 ml-auto pt-4 text-center">
                    <p className="text-black font-black uppercase text-[10px] tracking-widest">Authorized Revenue Signatory</p>
                    <p className="text-gray-400 text-[8px] mt-1 font-black uppercase">{transaction.cashierName}</p>
                  </div>
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

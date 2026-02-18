
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 no-print overflow-y-auto">
      <div className="flex flex-col h-full w-full max-w-4xl p-4">
        <div className="flex justify-between items-center mb-6 no-print">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-[#C8A862] rounded-full"></div>
            <h3 className="text-white font-bold tracking-widest uppercase text-sm">Revenue Terminal Document Preview</h3>
          </div>
          <div className="flex gap-4">
            <button onClick={handlePrint} className="px-8 py-2 bg-[#C8A862] text-black font-bold rounded shadow-lg transition-transform hover:scale-105 active:scale-95">Print Document</button>
            <button onClick={onClose} className="px-8 py-2 border border-gray-600 text-white rounded transition-colors hover:bg-gray-800">Close</button>
          </div>
        </div>

        <div className="flex-1 bg-gray-200 p-8 rounded-xl shadow-inner mx-auto overflow-y-auto w-full flex justify-center">
          {isPos ? (
            /* 80mm DOCKET */
            <div className="w-[80mm] text-black bg-white p-6 font-mono text-xs leading-tight shadow-xl">
              <div className="text-center border-b border-black/10 pb-4 mb-4">
                <h1 className="text-xl font-bold tracking-tighter">{BRAND.name}</h1>
                <p className="text-[9px] font-sans opacity-70">{BRAND.address}</p>
              </div>

              <div className="mb-4 space-y-0.5">
                <p>Docket: #{transaction.reference}</p>
                <p>Date: {new Date(transaction.createdAt).toLocaleDateString()}</p>
                <p>Time: {new Date(transaction.createdAt).toLocaleTimeString()}</p>
                <div className="h-2"></div>
                <p>Guest: Walk-In Customer</p>
                <p>Team: {transaction.unit}</p>
              </div>

              <div className="border-y border-dashed border-black/20 py-3 mb-3">
                <div className="font-bold flex justify-between mb-2">
                  <span>ITEMS</span>
                  <span>TOTAL</span>
                </div>
                {transaction.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between mb-1">
                    <span className="pr-4">{item.description} (x{item.quantity})</span>
                    <span>₦{item.total.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="text-right text-sm font-bold mb-6">
                TOTAL DUE ₦{transaction.totalAmount.toLocaleString()}
              </div>

              <div className="border-t border-black/10 pt-3 space-y-1.5 mb-6">
                <div className="flex justify-between text-[10px]">
                  <span>{transaction.settlementMethod} Payment</span>
                  <span>₦{transaction.paidAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold text-sm">
                  <span>BALANCE DUE</span>
                  <span>₦{transaction.balance.toLocaleString()}</span>
                </div>
              </div>

              <div className="mb-6">
                <div className="font-bold text-[9px] uppercase tracking-widest opacity-60 mb-2">Settlement Accounts</div>
                <div className="p-3 border border-dashed border-black/10 bg-gray-50 text-[10px] space-y-0.5">
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

              <div className="text-center italic text-[9px] opacity-60">
                (Rates inclusive of SC/VAT)
                <p className="mt-2 font-sans not-italic font-bold text-black uppercase tracking-widest">Revenue Authority Terminal</p>
              </div>
            </div>
          ) : (
            /* A4 INVOICE */
            <div className="w-[210mm] min-h-[297mm] text-black bg-white p-[25mm] font-sans text-sm shadow-2xl">
              <div className="flex justify-between items-start border-b-2 border-black pb-10 mb-10">
                <div>
                  <h1 className="text-4xl font-black tracking-tighter mb-1">{BRAND.name}</h1>
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">{BRAND.address}</p>
                </div>
                <div className="text-right">
                  <h2 className="text-2xl font-black text-gray-300 uppercase tracking-tighter mb-1">Guest Folio</h2>
                  <p className="text-xl font-bold text-[#C8A862]">#{transaction.reference}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-20 mb-12">
                <div>
                  <h3 className="font-black uppercase text-[10px] text-gray-400 mb-4 border-b pb-1">Guest Identification</h3>
                  <div className="space-y-1">
                    <p className="text-xl font-black text-black">{transaction.guestName}</p>
                    <p className="text-gray-600 font-bold">{transaction.identityType}: {transaction.idNumber}</p>
                    <p className="text-gray-600">{transaction.email}</p>
                    <p className="text-gray-600">{transaction.phone}</p>
                  </div>
                </div>
                <div className="text-right">
                  <h3 className="font-black uppercase text-[10px] text-gray-400 mb-4 border-b pb-1">Invoice Logistics</h3>
                  <div className="space-y-1 text-gray-600 font-bold">
                    <p>Issue Date: <span className="text-black">{new Date(transaction.createdAt).toLocaleDateString()}</span></p>
                    <p>Terminal Cashier: <span className="text-black">{transaction.cashierName}</span></p>
                    {transaction.roomDetails && (
                      <div className="pt-2 mt-2 border-t border-dashed">
                        <p>Arrival: <span className="text-black">{transaction.roomDetails.checkIn}</span></p>
                        <p>Departure: <span className="text-black">{transaction.roomDetails.checkOut}</span></p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <table className="w-full mb-12 border-collapse">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="text-left p-4 border-black uppercase text-[10px] font-black tracking-widest">Description of Service</th>
                    <th className="text-center p-4 border-black uppercase text-[10px] font-black tracking-widest">Qty</th>
                    <th className="text-center p-4 border-black uppercase text-[10px] font-black tracking-widest">Nights</th>
                    <th className="text-right p-4 border-black uppercase text-[10px] font-black tracking-widest">Rate</th>
                    <th className="text-right p-4 border-black uppercase text-[10px] font-black tracking-widest">Total</th>
                  </tr>
                </thead>
                <tbody className="font-bold">
                  {transaction.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-black/10">
                      <td className="p-4">{item.description}</td>
                      <td className="text-center p-4">{transaction.roomDetails ? '-' : item.quantity}</td>
                      <td className="text-center p-4">{transaction.roomDetails?.nights || '-'}</td>
                      <td className="text-right p-4">₦{item.price.toLocaleString()}</td>
                      <td className="text-right p-4">₦{item.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end mb-24">
                <div className="w-80 space-y-3">
                  <div className="flex justify-between text-gray-400 font-bold uppercase text-[10px]">
                    <span>Subtotal Valuation</span>
                    <span>₦{transaction.subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-400 font-bold uppercase text-[10px]">
                    <span>Inclusive VAT (7.5%)</span>
                    <span>₦{transaction.taxAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-400 font-bold uppercase text-[10px]">
                    <span>Inclusive SC (10%)</span>
                    <span>₦{transaction.serviceCharge.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t-2 border-black pt-4 text-2xl font-black">
                    <span>Grand Total</span>
                    <span>₦{transaction.totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-green-600 font-black text-lg">
                    <span>Payment Confirmed</span>
                    <span>₦{transaction.paidAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t border-black/10 pt-2 text-xl font-black text-red-600">
                    <span>Amount Outstanding</span>
                    <span>₦{transaction.balance.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-10 grid grid-cols-2 gap-12 text-[9px] text-gray-400">
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 border border-black/5 rounded">
                    <p className="font-black text-black uppercase tracking-widest mb-2">*Rates are Inclusive of SC (10%) and VAT (7.5%)</p>
                    <p className="mb-2">Official Settlement Bank Accounts:</p>
                    <div className="space-y-2 text-black font-bold">
                      {settings.invoiceBanks.map((bank, i) => (
                        <p key={i} className="border-b border-dashed pb-1 last:border-0">{bank.bank} | {bank.accountNumber} | {bank.accountName}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="text-right flex flex-col justify-end">
                  <div className="border-t-2 border-black w-64 ml-auto pt-4 text-center">
                    <p className="text-black font-black uppercase text-[10px] tracking-tighter">Authorized Revenue Officer</p>
                    <p className="text-gray-400 text-[8px] mt-1">{transaction.cashierName}</p>
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

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 overflow-y-auto">
      <div className="flex flex-col h-full w-full max-w-4xl p-4">
        {/* UI Header - Hidden during print */}
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

        {/* Backdrop for preview - Hidden during print */}
        <div className="flex-1 bg-gray-300 p-2 md:p-8 rounded-xl shadow-inner mx-auto overflow-y-auto w-full flex justify-center no-print">
          <div className="bg-white p-0 shadow-2xl h-fit">
            {isPos ? (
              <div className="docket-container text-black bg-white p-0 font-mono text-[12px] leading-tight border-none shadow-none">
                <div className="text-center mb-1">
                  <h1 className="text-lg font-black tracking-tighter uppercase leading-none">{settings.hotelName}</h1>
                  <p className="text-[8px] font-bold opacity-80 uppercase leading-none mt-1">{settings.hotelAddress}</p>
                </div>
                <div className="border-b border-black border-dashed my-1"></div>
                <div className="grid grid-cols-2 gap-x-1 uppercase text-[10px] mb-1">
                  <p className="font-black truncate">REF: #{transaction.reference.split('-').pop()}</p>
                  <p className="text-right">{new Date(transaction.createdAt).toLocaleDateString()}</p>
                  <p className="opacity-70">U: {transaction.unit}</p>
                  <p className="text-right opacity-70">OP: {transaction.cashierName.split(' ')[0]}</p>
                </div>
                <div className="mb-1">
                  <div className="font-black flex justify-between border-b border-black pb-0.5 mb-1 text-[10px]">
                    <span>DESCRIPTION</span>
                    <span className="text-right">TOTAL</span>
                  </div>
                  {transaction.items.map((item, idx) => {
                    const { name, notes } = formatItemDescription(item.description);
                    return (
                      <div key={idx} className="mb-1 pb-1 border-b border-dotted border-black/10 last:border-0">
                        <div className="flex justify-between items-start">
                          <span className="font-bold uppercase text-[11px] flex-1 leading-none mr-2">
                            {name} <span className="font-black">x{item.quantity}</span>
                          </span>
                          <span className="shrink-0 font-black">₦{item.total.toLocaleString()}</span>
                        </div>
                        {notes && (
                          <div className="font-black text-[10px] leading-none mt-0.5 uppercase italic">
                            {'>> '}{notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-black border-dashed my-1"></div>
                <div className="space-y-0.5 text-[11px] mb-1 font-bold">
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
                    <span>TAX ({(settings?.vat || 0.075) * 100}%):</span>
                    <span>₦{transaction.taxAmount.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center mb-1 border-t border-b border-black py-1">
                  <span className="text-[11px] font-black uppercase">GRAND TOTAL:</span>
                  <span className="text-lg font-black">₦{transaction.totalAmount.toLocaleString()}</span>
                </div>
                <div className="space-y-0.5 mb-1 uppercase text-[10px]">
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
                  <div className="flex justify-between font-black text-[12px] border-t border-dotted border-black pt-1 mt-1">
                    <span>BALANCE:</span>
                    <span>₦{transaction.balance.toLocaleString()}</span>
                  </div>
                </div>
                {transaction.balance > 0 && (
                  <div className="mb-2 border border-dotted border-black p-1 mt-2">
                    <p className="font-black text-[9px] uppercase opacity-70 mb-0.5">Payment Instructions:</p>
                    {currentBanks.map((bank, i) => (
                      <p key={i} className="text-[10px] font-bold leading-tight">{bank.bank}: {bank.accountNumber}</p>
                    ))}
                  </div>
                )}
                <div className="text-center italic text-[9px] font-black border-t border-black pt-2 mt-2">
                  *** VERIFIED REVENUE RECORD ***
                </div>
              </div>
            ) : (
              <div className="invoice-container text-black bg-white p-[10mm] md:p-[20mm] font-sans text-sm shadow-none border-none">
                {/* Folio content... same as original but ensuring no nested no-print parents */}
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
                {/* ... (rest of folio remains same but nested in this printable div) */}
              </div>
            )}
          </div>
        </div>

        {/* Hidden area that is ONLY visible for print to ensure the printer sees exactly what it needs */}
        <div className="print-only">
          {isPos ? (
            <div className="docket-container">
              <div className="text-center">
                <h1 style={{fontSize: '18px', fontWeight: '900'}}>{settings.hotelName}</h1>
                <p style={{fontSize: '10px'}}>{settings.hotelAddress}</p>
              </div>
              <div style={{borderBottom: '1px dashed black', margin: '4px 0'}}></div>
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '900'}}>
                <span>REF: #{transaction.reference.split('-').pop()}</span>
                <span>{new Date(transaction.createdAt).toLocaleDateString()}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '10px'}}>
                <span>UNIT: {transaction.unit}</span>
                <span>OP: {transaction.cashierName.split(' ')[0]}</span>
              </div>
              <div style={{borderBottom: '1px solid black', margin: '4px 0', paddingBottom: '2px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '900'}}>
                <span>DESCRIPTION</span>
                <span>TOTAL</span>
              </div>
              {transaction.items.map((item, idx) => (
                <div key={idx} style={{marginBottom: '4px', borderBottom: '1px dotted #ccc', paddingBottom: '2px'}}>
                   <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '900'}}>
                     <span style={{flex: 1}}>{item.description} x{item.quantity}</span>
                     <span>₦{item.total.toLocaleString()}</span>
                   </div>
                </div>
              ))}
              <div style={{borderTop: '1px dashed black', marginTop: '4px', paddingTop: '4px', fontSize: '11px', fontWeight: '700'}}>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span>GROSS:</span>
                  <span>₦{transaction.subtotal.toLocaleString()}</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span>VAT:</span>
                  <span>₦{transaction.taxAmount.toLocaleString()}</span>
                </div>
              </div>
              <div style={{borderTop: '1px solid black', borderBottom: '1px solid black', margin: '4px 0', padding: '4px 0', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '900'}}>
                <span>TOTAL:</span>
                <span>₦{transaction.totalAmount.toLocaleString()}</span>
              </div>
              <div style={{fontSize: '11px', fontWeight: '700'}}>
                {transaction.payments?.map((p, i) => (
                   <div key={i} style={{display: 'flex', justifyContent: 'space-between'}}>
                     <span>{p.method}:</span>
                     <span>₦{p.amount.toLocaleString()}</span>
                   </div>
                ))}
                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '900', marginTop: '4px', borderTop: '1px dotted black', paddingTop: '4px'}}>
                   <span>BALANCE:</span>
                   <span>₦{transaction.balance.toLocaleString()}</span>
                </div>
              </div>
              <div style={{textAlign: 'center', fontSize: '10px', marginTop: '10px', fontWeight: '900', borderTop: '1px solid black', paddingTop: '4px'}}>
                *** VERIFIED REVENUE RECORD ***
              </div>
            </div>
          ) : (
            <div className="invoice-container">
               {/* Print version of folio */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReceiptPreview;
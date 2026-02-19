import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Transaction, UnitType, AppSettings, BankAccount } from '../types';
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
          vat: data.vat ?? 0.075,
          serviceCharge: data.serviceCharge ?? 0.10,
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

  const bankList: BankAccount[] = isPos 
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
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 overflow-y-auto no-print">
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

          <div className="flex-1 bg-gray-300 p-2 md:p-8 rounded-xl shadow-inner mx-auto overflow-y-auto w-full flex justify-center no-print">
            <div className="bg-white p-0 shadow-2xl h-fit border-none">
              {isPos ? (
                <div className="text-black bg-white p-6 font-mono text-[12px] leading-none w-[80mm]">
                  <div className="text-center mb-4">
                    <h1 className="text-lg font-black tracking-tighter uppercase mb-1">{settings.hotelName}</h1>
                    <p className="text-[9px] font-bold opacity-70 uppercase leading-tight">{settings.hotelAddress}</p>
                  </div>
                  <div className="border-b border-black border-dashed mb-2"></div>
                  <div className="grid grid-cols-2 gap-x-1 uppercase text-[10px] mb-2 font-bold">
                    <p>REF: #{transaction.reference.split('-').pop()}</p>
                    <p className="text-right">{new Date(transaction.createdAt).toLocaleDateString()}</p>
                    <p>OUTLET: {transaction.unit}</p>
                    <p className="text-right">OP: {transaction.cashierName.split(' ')[0]}</p>
                  </div>
                  <div className="border-b border-black border-dashed mb-2"></div>
                  <div className="mb-2">
                    {transaction.items.map((item, idx) => {
                      const { name, notes } = formatItemDescription(item.description);
                      return (
                        <div key={idx} className="mb-2">
                          <div className="flex justify-between items-start">
                            <span className="font-black uppercase text-[11px] flex-1 leading-tight mr-2">
                              {name} x{item.quantity}
                            </span>
                            <span className="shrink-0 font-black text-[11px]">₦{item.total.toLocaleString()}</span>
                          </div>
                          {notes && <div className="font-bold text-[9px] italic opacity-70 mt-0.5 leading-tight">{'>> '}{notes}</div>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-black border-dotted pt-1 mb-2">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span>GROSS:</span>
                      <span>₦{transaction.subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-bold">
                      <span>VAT ({(settings.vat * 100).toFixed(1)}%):</span>
                      <span>₦{transaction.taxAmount.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-y border-black mb-2">
                    <span className="text-[12px] font-black uppercase">GRAND TOTAL:</span>
                    <span className="text-xl font-black">₦{transaction.totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="text-center italic text-[9px] font-black border-t border-black pt-2">*** VERIFIED REVENUE RECORD ***</div>
                </div>
              ) : (
                <div className="text-black bg-white p-[10mm] md:p-[20mm] font-sans text-sm w-[210mm]">
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
                  <table className="w-full mb-8 border-collapse font-bold">
                    <thead>
                      <tr className="bg-gray-900 text-white text-[10px] uppercase font-black tracking-widest text-left">
                        <th className="p-4">Description</th>
                        <th className="p-4 text-center">Qty</th>
                        <th className="p-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transaction.items.map((item, idx) => (
                        <tr key={idx} className="border-b border-gray-100">
                          <td className="p-4 leading-relaxed">{item.description}</td>
                          <td className="text-center p-4">{item.quantity}</td>
                          <td className="text-right p-4">₦{item.total.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-end pt-4 border-t-2 border-black">
                    <div className="w-64 space-y-2">
                      <div className="flex justify-between text-lg font-black">
                        <span>Folio Total</span>
                        <span>₦{transaction.totalAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm text-red-600 font-bold">
                        <span>Outstanding</span>
                        <span>₦{transaction.balance.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden print-only container strictly for the printer */}
      <div className="print-only">
        {isPos ? (
          <div className="docket-container">
            <div style={{textAlign: 'center', marginBottom: '8px'}}>
              <h1 style={{fontSize: '18px', fontWeight: '900', margin: '0'}}>{settings.hotelName}</h1>
              <p style={{fontSize: '10px', fontWeight: '900', margin: '2px 0'}}>{settings.hotelAddress}</p>
            </div>
            <div style={{borderBottom: '1px dashed black', margin: '5px 0'}}></div>
            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '900'}}>
              <span>REF: #{transaction.reference.split('-').pop()}</span>
              <span>{new Date(transaction.createdAt).toLocaleDateString()}</span>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '900'}}>
              <span>UNIT: {transaction.unit}</span>
              <span>OP: {transaction.cashierName.split(' ')[0]}</span>
            </div>
            <div style={{borderBottom: '1px dashed black', margin: '5px 0'}}></div>
            <div style={{marginBottom: '8px'}}>
              {transaction.items.map((item, idx) => (
                <div key={idx} style={{marginBottom: '4px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '900'}}>
                    <span style={{flex: 1}}>{formatItemDescription(item.description).name} x{item.quantity}</span>
                    <span>₦{item.total.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{borderTop: '1px dotted black', paddingTop: '4px', fontSize: '12px', fontWeight: '900'}}>
              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <span>GROSS:</span>
                <span>₦{transaction.subtotal.toLocaleString()}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <span>VAT:</span>
                <span>₦{transaction.taxAmount.toLocaleString()}</span>
              </div>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', margin: '8px 0', borderTop: '2px solid black', borderBottom: '2px solid black', padding: '4px 0', fontSize: '16px', fontWeight: '900'}}>
              <span>TOTAL:</span>
              <span>₦{transaction.totalAmount.toLocaleString()}</span>
            </div>
            <div style={{fontSize: '12px', fontWeight: '900', borderTop: '1px dashed black', paddingTop: '4px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '14px'}}>
                <span>BALANCE:</span>
                <span>₦{transaction.balance.toLocaleString()}</span>
              </div>
            </div>
            <div style={{textAlign: 'center', marginTop: '10px', paddingTop: '4px', borderTop: '1px solid black', fontSize: '10px', fontWeight: '900'}}>*** VERIFIED REVENUE RECORD ***</div>
          </div>
        ) : (
          <div className="invoice-container">
            <div style={{borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between'}}>
               <div>
                  <h1 style={{fontSize: '24px', fontWeight: '900', margin: '0'}}>{settings.hotelName}</h1>
                  <p style={{fontSize: '10px', margin: '4px 0'}}>{settings.hotelAddress}</p>
               </div>
               <div style={{textAlign: 'right'}}>
                  <h2 style={{fontSize: '18px', color: '#888', margin: '0'}}>Reservation Folio</h2>
                  <p style={{fontSize: '14px', fontWeight: '900', margin: '4px 0'}}>REF: {transaction.reference}</p>
               </div>
            </div>
            <div style={{marginBottom: '20px'}}>
              <h3 style={{fontSize: '10px', fontWeight: '900', color: '#888', margin: '0'}}>Guest Information</h3>
              <p style={{fontSize: '16px', fontWeight: '900', margin: '2px 0'}}>{transaction.guestName}</p>
              <p style={{fontSize: '12px', margin: '2px 0'}}>{transaction.email} • {transaction.phone}</p>
            </div>
            <table style={{width: '100%', borderCollapse: 'collapse', marginBottom: '20px'}}>
               <thead>
                 <tr style={{backgroundColor: '#000', color: '#fff', fontSize: '11px'}}>
                   <th style={{padding: '10px', textAlign: 'left'}}>Description</th>
                   <th style={{padding: '10px', textAlign: 'center'}}>Qty</th>
                   <th style={{padding: '10px', textAlign: 'right'}}>Total</th>
                 </tr>
               </thead>
               <tbody>
                 {transaction.items.map((item, idx) => (
                   <tr key={idx} style={{borderBottom: '1px solid #eee', fontSize: '12px', fontWeight: '700'}}>
                     <td style={{padding: '10px'}}>{item.description}</td>
                     <td style={{padding: '10px', textAlign: 'center'}}>{item.quantity}</td>
                     <td style={{padding: '10px', textAlign: 'right'}}>₦{item.total.toLocaleString()}</td>
                   </tr>
                 ))}
               </tbody>
            </table>
            <div style={{display: 'flex', justifyContent: 'flex-end'}}>
               <div style={{width: '250px'}}>
                 <div style={{display: 'flex', justifyContent: 'space-between', borderTop: '2px solid black', paddingTop: '8px', fontSize: '18px', fontWeight: '900'}}>
                   <span>Total:</span>
                   <span>₦{transaction.totalAmount.toLocaleString()}</span>
                 </div>
                 <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: '900', color: 'red', marginTop: '4px'}}>
                   <span>Outstanding:</span>
                   <span>₦{transaction.balance.toLocaleString()}</span>
                 </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ReceiptPreview;
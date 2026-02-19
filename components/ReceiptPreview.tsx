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
      <div className="flex flex-col h-full w-full max-w-4xl p-4 no-print">
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

        {/* Live Preview for UI */}
        <div className="flex-1 bg-gray-300 p-2 md:p-8 rounded-xl shadow-inner mx-auto overflow-y-auto w-full flex justify-center no-print">
          <div className="bg-white p-0 shadow-2xl h-fit border-none">
            {isPos ? (
              <div className="docket-container text-black bg-white p-6 font-mono text-[12px] leading-none border-none shadow-none w-[80mm]">
                <div className="text-center mb-4">
                  <h1 className="text-lg font-black tracking-tighter uppercase mb-1">{settings.hotelName}</h1>
                  <p className="text-[9px] font-bold opacity-70 uppercase tracking-tighter leading-tight">{settings.hotelAddress}</p>
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
                  <div className="font-black flex justify-between border-b border-black pb-1 mb-1 text-[11px]">
                    <span>ITEM</span>
                    <span className="text-right">TOTAL</span>
                  </div>
                  {transaction.items.map((item, idx) => {
                    const { name, notes } = formatItemDescription(item.description);
                    return (
                      <div key={idx} className="mb-2">
                        <div className="flex justify-between items-start">
                          <span className="font-black uppercase text-[12px] flex-1 leading-tight mr-2">
                            {name} x{item.quantity}
                          </span>
                          <span className="shrink-0 font-black text-[12px]">₦{item.total.toLocaleString()}</span>
                        </div>
                        {notes && (
                          <div className="font-bold text-[10px] italic opacity-70 mt-0.5 leading-tight">
                            >> {notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-black border-dotted pt-1 mb-2">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span>GROSS:</span>
                    <span>₦{transaction.subtotal.toLocaleString()}</span>
                  </div>
                  {transaction.discountAmount > 0 && (
                    <div className="flex justify-between text-[11px] font-bold">
                      <span>DISCOUNT:</span>
                      <span>-₦{transaction.discountAmount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[11px] font-bold">
                    <span>VAT ({(settings?.vat || 0.075) * 100}%):</span>
                    <span>₦{transaction.taxAmount.toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center py-2 border-y border-black mb-2">
                  <span className="text-[12px] font-black uppercase">GRAND TOTAL:</span>
                  <span className="text-xl font-black">₦{transaction.totalAmount.toLocaleString()}</span>
                </div>

                <div className="space-y-1 mb-3 uppercase text-[11px] font-bold">
                  {transaction.payments && transaction.payments.length > 0 ? (
                    transaction.payments.map((p, i) => (
                      <div key={i} className="flex justify-between">
                        <span>{p.method}:</span>
                        <span>₦{p.amount.toLocaleString()}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between">
                      <span>{transaction.settlementMethod || 'DIRECT'}:</span>
                      <span>₦{transaction.paidAmount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-[13px] border-t border-black border-dotted pt-1 mt-1">
                    <span>BALANCE:</span>
                    <span>₦{transaction.balance.toLocaleString()}</span>
                  </div>
                </div>

                {transaction.balance > 0 && (
                  <div className="mb-3 border border-dotted border-black p-2">
                    <p className="font-black text-[9px] uppercase opacity-70 mb-1">Payment Hub:</p>
                    {currentBanks.map((bank, i) => (
                      <p key={i} className="text-[10px] font-black leading-tight">{bank.bank}: {bank.accountNumber}</p>
                    ))}
                  </div>
                )}

                <div className="text-center italic text-[9px] font-black border-t border-black pt-2">
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
                {/* Folio Table ... kept simple */}
                <table className="w-full mb-8 border-collapse font-bold">
                  <thead>
                    <tr className="bg-gray-900 text-white text-[10px] uppercase font-black tracking-widest">
                      <th className="text-left p-4">Description</th>
                      <th className="text-center p-4">Qty</th>
                      <th className="text-right p-4">Amount</th>
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
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden container strictly for printing - 80mm target */}
      <div className="print-only">
        {isPos ? (
          <div className="docket-container">
            <div style={{textAlign: 'center', marginBottom: '10px'}}>
              <h1 style={{fontSize: '18px', fontWeight: '900', margin: '0'}}>{settings.hotelName}</h1>
              <p style={{fontSize: '10px', fontWeight: '900', margin: '4px 0'}}>{settings.hotelAddress}</p>
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

            <div style={{marginBottom: '10px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid black', paddingBottom: '3px', marginBottom: '5px', fontSize: '11px', fontWeight: '900'}}>
                <span>DESC/QTY</span>
                <span>TOTAL</span>
              </div>
              {transaction.items.map((item, idx) => {
                const { name } = formatItemDescription(item.description);
                return (
                  <div key={idx} style={{marginBottom: '5px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '900'}}>
                      <span style={{flex: 1}}>{name} x{item.quantity}</span>
                      <span>₦{item.total.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{borderTop: '1px dotted black', paddingTop: '5px', fontSize: '12px', fontWeight: '900'}}>
              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <span>GROSS:</span>
                <span>₦{transaction.subtotal.toLocaleString()}</span>
              </div>
              {transaction.discountAmount > 0 && (
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span>DISC:</span>
                  <span>-₦{transaction.discountAmount.toLocaleString()}</span>
                </div>
              )}
              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <span>VAT:</span>
                <span>₦{transaction.taxAmount.toLocaleString()}</span>
              </div>
            </div>

            <div style={{display: 'flex', justifyContent: 'space-between', margin: '10px 0', borderTop: '2px solid black', borderBottom: '2px solid black', padding: '5px 0', fontSize: '16px', fontWeight: '900'}}>
              <span>TOTAL:</span>
              <span>₦{transaction.totalAmount.toLocaleString()}</span>
            </div>

            <div style={{fontSize: '12px', fontWeight: '900'}}>
              {transaction.payments?.map((p, i) => (
                <div key={i} style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span>{p.method}:</span>
                  <span>₦{p.amount.toLocaleString()}</span>
                </div>
              ))}
              <div style={{display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed black', marginTop: '5px', paddingTop: '5px', fontSize: '14px', fontWeight: '900'}}>
                <span>BALANCE:</span>
                <span>₦{transaction.balance.toLocaleString()}</span>
              </div>
            </div>

            <div style={{textAlign: 'center', marginTop: '15px', paddingTop: '5px', borderTop: '1px solid black', fontSize: '10px', fontWeight: '900'}}>
              *** VERIFIED REVENUE RECORD ***
            </div>
          </div>
        ) : (
          <div className="invoice-container">
            {/* Standard A4 Folio content mirroring preview but styled for white backgrounds */}
            <div style={{borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between'}}>
               <div>
                  <h1 style={{fontSize: '24px', fontWeight: '900'}}>{settings.hotelName}</h1>
                  <p style={{fontSize: '10px'}}>{settings.hotelAddress}</p>
               </div>
               <div style={{textAlign: 'right'}}>
                  <h2 style={{fontSize: '18px', color: '#888'}}>Reservation Folio</h2>
                  <p style={{fontSize: '14px', fontWeight: '900'}}>REF: {transaction.reference}</p>
               </div>
            </div>
            
            <div style={{marginBottom: '20px'}}>
              <h3 style={{fontSize: '10px', fontWeight: '900', color: '#888'}}>Guest Information</h3>
              <p style={{fontSize: '16px', fontWeight: '900'}}>{transaction.guestName}</p>
              <p style={{fontSize: '12px'}}>{transaction.email} • {transaction.phone}</p>
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
                 <div style={{display: 'flex', justifyContent: 'space-between', borderTop: '2px solid black', paddingTop: '5px'}}>
                   <span>Total:</span>
                   <span>₦{transaction.totalAmount.toLocaleString()}</span>
                 </div>
                 <div style={{display: 'flex', justifyContent: 'space-between', color: 'green'}}>
                   <span>Paid:</span>
                   <span>₦{transaction.paidAmount.toLocaleString()}</span>
                 </div>
                 <div style={{display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed black', fontWeight: '900', color: 'red'}}>
                   <span>Balance:</span>
                   <span>₦{transaction.balance.toLocaleString()}</span>
                 </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceiptPreview;
import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/firebase';
import { Transaction, UnitType, AppSettings, BankAccount, TaxConfig } from '@/types';
import { BRAND, ZENZA_BANK, WHISPERS_BANK, INVOICE_BANKS } from '@/constants';

interface ReceiptPreviewProps {
  transaction: Transaction;
  onClose: () => void;
}

const ReceiptPreview: React.FC<ReceiptPreviewProps> = ({ transaction, onClose }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const isPos = transaction.type === 'POS';

  useEffect(() => {
    if (!auth.currentUser) return;

    let isSubscribed = true;
    const unsubscribe = onSnapshot(doc(db, 'settings', 'master'), (snapshot) => {
      if (!isSubscribed) return;
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettings({
          hotelName: data.hotelName || BRAND.name,
          hotelSubName: data.hotelSubName || 'Hotels & Resorts',
          hotelAddress: data.hotelAddress || BRAND.address,
          vat: data.vat ?? 0.075,
          serviceCharge: data.serviceCharge ?? 0.10,
          isTaxInclusive: data.isTaxInclusive ?? true,
          taxes: data.taxes || [],
          zenzaBanks: Array.isArray(data.zenzaBanks) ? data.zenzaBanks : (data.zenzaBank ? [data.zenzaBank] : [ZENZA_BANK]),
          whispersBanks: Array.isArray(data.whispersBanks) ? data.whispersBanks : (data.whispersBank ? [data.whispersBank] : [WHISPERS_BANK]),
          invoiceBanks: data.invoiceBanks || INVOICE_BANKS
        } as AppSettings);
      }
    }, (error) => {
      console.error("Receipt Settings subscription error:", error);
    });
    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, []);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow || !settings) return;

    const contentId = isPos ? 'thermal-pos-docket' : 'a4-folio-invoice';
    const content = document.getElementById(contentId)?.innerHTML;

    // Use specific styles for 80mm vs A4
    const style = isPos ? `
      @page { size: 80mm auto; margin: 0 !important; }
      html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; background: #ffffff !important; -webkit-print-color-adjust: exact; }
      * { box-sizing: border-box !important; }
      .print-shell { width: 80mm !important; margin: 0 auto !important; padding: 6mm 4mm !important; box-sizing: border-box !important; font-family: 'Courier New', Courier, monospace !important; color: #000 !important; font-size: 12px !important; line-height: 1.2 !important; background: #fff !important; }
      .center { text-align: center !important; width: 100%; }
      .bold { font-weight: 900 !important; }
      .uppercase { text-transform: uppercase !important; }
      .divider { border-top: 1px dashed #000; margin: 3mm 0; width: 100%; }
      .item-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5mm; }
      .item-name { flex: 1; padding-right: 2mm; text-align: left; }
      .item-total { white-space: nowrap; text-align: right; font-weight: bold; }
      .total-box { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 2mm 0; margin: 3mm 0; font-size: 15px; font-weight: 900; display: flex; justify-content: space-between; }
      .bank-info { font-size: 10px; line-height: 1.3; margin-top: 2mm; text-align: left; }
      .cut-spacer { height: 15mm; width: 100%; }
    ` : `
      @page { size: 210mm 297mm; margin: 0 !important; }
      html, body { margin: 0 !important; padding: 0 !important; width: 210mm !important; height: 297mm !important; background: #ffffff !important; -webkit-print-color-adjust: exact; font-family: 'Inter', sans-serif !important; }
      * { box-sizing: border-box !important; }
      .print-shell { width: 210mm !important; min-height: 297mm !important; padding: 15mm !important; box-sizing: border-box !important; color: #000 !important; position: relative; }
      .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 8mm; margin-bottom: 8mm; }
      .hotel-info { flex: 1; }
      .hotel-name { font-size: 28px; font-weight: 900; color: #C8A862; font-style: italic; margin-bottom: 1mm; }
      .hotel-sub { font-size: 9px; font-weight: bold; letter-spacing: 0.3em; margin-bottom: 3mm; text-transform: uppercase; color: #666; }
      .hotel-addr { font-size: 10px; color: #444; max-width: 280px; line-height: 1.4; }
      .invoice-meta { text-align: right; }
      .invoice-title { font-size: 22px; font-weight: 900; letter-spacing: -0.02em; margin-bottom: 1mm; text-transform: uppercase; }
      .meta-row { font-size: 10px; font-weight: bold; margin-bottom: 1mm; }
      .section-title { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #888; border-bottom: 1px solid #eee; padding-bottom: 1mm; margin-bottom: 3mm; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-bottom: 8mm; }
      .guest-box, .stay-box { font-size: 12px; line-height: 1.5; }
      .table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; table-layout: fixed; }
      .table th { text-align: left; font-size: 9px; font-weight: 900; text-transform: uppercase; padding: 3mm; border-bottom: 2px solid #000; background: #f9f9f9; }
      .table td { padding: 3mm; border-bottom: 1px solid #eee; font-size: 11px; word-wrap: break-word; }
      .totals { margin-left: auto; width: 80mm; }
      .total-row { display: flex; justify-content: space-between; padding: 1.5mm 0; font-size: 11px; }
      .grand-total { border-top: 2px solid #000; margin-top: 1.5mm; padding-top: 3mm; font-size: 16px; font-weight: 900; }
      .footer { margin-top: 15mm; border-top: 1px solid #eee; padding-top: 8mm; display: flex; gap: 8mm; }
      .bank-list { flex: 1; font-size: 9px; }
      .signature-box { width: 180px; border-top: 1px solid #000; margin-top: 12mm; text-align: center; font-size: 9px; font-weight: 900; padding-top: 2mm; }
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${settings.hotelName.replace(/\s+/g, '_')}_${transaction.reference}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
          <style>${style}</style>
        </head>
        <body>
          <div class="print-shell">${content}</div>
          <script>window.focus(); setTimeout(() => { window.print(); window.close(); }, 600);</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (!settings) return null;

  const bankList: BankAccount[] = isPos 
    ? (transaction.unit === UnitType.ZENZA ? settings.zenzaBanks : settings.whispersBanks)
    : settings.invoiceBanks;

  const currentBanks = transaction.selectedBank ? [transaction.selectedBank] : bankList;

  const formatItemDescription = (desc: string) => {
    if (!desc.includes(' (')) return { name: desc, notes: '' };
    const parts = desc.split(' (');
    return { name: parts[0], notes: parts[1].replace(')', '') };
  };

  const taxesToDisplay = settings.taxes.filter(t => t.visibleOnReceipt);
  const subtotalForReceipt = transaction.subtotal;

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 overflow-y-auto no-print">
        <div className="flex flex-col h-full w-full max-w-5xl p-4">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-[#C8A862] rounded-full"></div>
              <h3 className="text-white font-bold tracking-widest uppercase text-sm">Revenue Authority Dispatch Hub</h3>
            </div>
            <div className="flex gap-4">
              <button onClick={handlePrint} className="px-8 py-2.5 bg-[#C8A862] text-black font-black rounded-lg shadow-xl transition-all hover:scale-105 active:scale-95 text-xs uppercase tracking-widest">
                Print {isPos ? 'Thermal Docket' : 'Corporate A4 Folio'}
              </button>
              <button onClick={onClose} className="px-8 py-2.5 border border-gray-600 text-white rounded-lg transition-colors hover:bg-gray-800 font-bold text-xs uppercase tracking-widest">Close Hub</button>
            </div>
          </div>

          <div className="flex-1 bg-[#0B1C2D] p-4 md:p-8 rounded-2xl shadow-inner mx-auto overflow-auto w-full flex justify-center border border-white/5">
            {isPos ? (
              /* Thermal Preview (Small) */
              <div className="bg-white p-8 shadow-2xl h-fit w-[80mm] text-black font-mono">
                  <div className="text-center">
                    <h1 className="text-xl font-black uppercase mb-1">{settings.hotelName}</h1>
                    <p className="text-[10px] font-bold uppercase leading-tight">{settings.hotelAddress}</p>
                  </div>
                  <div className="border-b border-black border-dashed my-3"></div>
                  <div className="flex justify-between text-[11px] font-bold uppercase">
                    <span>Ref: #{transaction.reference.split('-').pop()}</span>
                    <span>{new Date(transaction.createdAt).toLocaleDateString()} {new Date(transaction.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="text-[10px] font-black uppercase mt-1">Guest: {transaction.guestName}</div>
                  <div className="text-[10px] font-bold uppercase">Operator: {transaction.cashierName}</div>
                  <div className="border-b border-black border-dashed my-3"></div>
                  <div className="space-y-2 mb-4">
                    {transaction.items.map((item, idx) => {
                      const { name, notes } = formatItemDescription(item.description);
                      return (
                        <div key={idx}>
                          <div className="flex justify-between text-[12px] font-bold uppercase">
                            <span className="flex-1 pr-2">{name} (x{item.quantity})</span>
                            <span>₦{item.total.toLocaleString()}</span>
                          </div>
                          {notes && <div className="text-[9px] text-gray-500 italic">* {notes}</div>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-y border-black py-2 my-3 flex justify-between text-lg font-black uppercase">
                    <span>TOTAL:</span>
                    <span>₦{transaction.totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="text-[10px] space-y-1 mb-4">
                    {currentBanks.map((b, i) => (
                      <div key={i} className="font-bold">{b.bank} • {b.accountNumber} • {b.accountName}</div>
                    ))}
                  </div>
                  <div className="text-center italic text-[9px] font-black border-t border-black pt-4 uppercase">Verified Revenue Record</div>
              </div>
            ) : (
              /* A4 Preview (Large) */
              <div className="bg-white p-[15mm] shadow-2xl h-fit w-[210mm] max-w-full text-black font-inter min-h-[297mm] box-border">
                  <div className="flex justify-between border-b-2 border-black pb-8 mb-8">
                    <div>
                      <h1 className="text-4xl font-black italic text-[#C8A862] uppercase tracking-tighter mb-1">{settings.hotelName}</h1>
                      <p className="text-[10px] font-bold tracking-[0.4em] uppercase text-gray-400 mb-4">{settings.hotelSubName}</p>
                      <p className="text-xs text-gray-600 max-w-[300px] leading-relaxed uppercase">{settings.hotelAddress}</p>
                    </div>
                    <div className="text-right">
                      <h2 className="text-2xl font-black uppercase mb-4 tracking-tight">Reservation Folio</h2>
                      <div className="space-y-1 text-xs font-bold uppercase">
                        <p><span className="text-gray-400">Reference:</span> {transaction.reference}</p>
                        {transaction.orderReference && <p><span className="text-gray-400">Order Ref:</span> {transaction.orderReference}</p>}
                        <p><span className="text-gray-400">Date Issued:</span> {new Date(transaction.createdAt).toLocaleDateString()} {new Date(transaction.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        <p><span className="text-gray-400">Served by:</span> {transaction.cashierName}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-12 mb-10">
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-1 mb-3">Guest Particulars</h3>
                      <div className="space-y-1">
                        <p className="text-lg font-black uppercase">{transaction.guestName}</p>
                        <p className="text-xs text-gray-600 font-medium">{transaction.email || 'NO EMAIL RECORDED'}</p>
                        <p className="text-xs text-gray-600 font-medium">{transaction.phone || 'NO PHONE RECORDED'}</p>
                        <p className="text-[10px] font-bold uppercase text-gray-400 mt-2">{transaction.identityType}: {transaction.idNumber || 'N/A'}</p>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-1 mb-3">Stay Details</h3>
                      {transaction.roomDetails ? (
                        <div className="space-y-1">
                          <p className="text-sm font-black uppercase">{transaction.roomDetails.roomName}</p>
                          <div className="flex justify-between text-xs font-bold py-1">
                            <span className="text-gray-500 uppercase">Check-In:</span>
                            <span>{new Date(transaction.roomDetails.checkIn).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          </div>
                          <div className="flex justify-between text-xs font-bold py-1">
                            <span className="text-gray-500 uppercase">Check-Out:</span>
                            <span>{new Date(transaction.roomDetails.checkOut).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          </div>
                          <div className="flex justify-between text-xs font-black py-1 border-t border-gray-50 mt-1">
                            <span className="text-gray-500 uppercase tracking-widest text-[9px]">Duration:</span>
                            <span>{transaction.roomDetails.nights} NIGHTS</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">No room mapping found for this folio.</p>
                      )}
                    </div>
                  </div>

                  <table className="w-full mb-10">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left py-4 px-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Description of Service</th>
                        <th className="text-center py-4 px-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Qty</th>
                        <th className="text-right py-4 px-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Rate (₦)</th>
                        <th className="text-right py-4 px-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Amount (₦)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {transaction.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-4 px-4 text-xs font-bold uppercase">{item.description}</td>
                          <td className="py-4 px-4 text-xs text-center font-bold">{item.quantity}</td>
                          <td className="py-4 px-4 text-xs text-right font-bold">{(item.price).toLocaleString()}</td>
                          <td className="py-4 px-4 text-xs text-right font-black">{(item.total).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="ml-auto w-72 space-y-2 border-t-2 border-black pt-4">
                    <div className="flex justify-between text-xs font-bold uppercase">
                      <span className="text-gray-400">Subtotal:</span>
                      <span>₦{subtotalForReceipt.toLocaleString()}</span>
                    </div>
                    {taxesToDisplay.map(tax => (
                      <div key={tax.id} className="flex justify-between text-xs font-bold uppercase">
                        <span className="text-gray-400">{tax.name}:</span>
                        <span>₦{(subtotalForReceipt * tax.rate).toLocaleString()}</span>
                      </div>
                    ))}
                    {transaction.discountAmount > 0 && (
                      <div className="flex justify-between text-xs font-bold uppercase text-red-500">
                        <span>Adjustment:</span>
                        <span>-₦{transaction.discountAmount.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xl font-black uppercase pt-4 border-t border-gray-100">
                      <span>Total:</span>
                      <span>₦{transaction.totalAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm font-black uppercase text-green-600 pt-1">
                      <span>Paid:</span>
                      <span>₦{transaction.paidAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-lg font-black uppercase text-red-600 pt-2 border-t border-gray-100">
                      <span>Balance:</span>
                      <span>₦{transaction.balance.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="mt-20 pt-10 border-t border-gray-100 flex gap-8">
                    <div className="flex-1">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-4">Official Settlement Channels</h4>
                      <div className="grid grid-cols-1 gap-2">
                        {currentBanks.map((b, i) => (
                          <div key={i} className="text-[11px] font-black uppercase bg-gray-50 p-2 rounded">
                            {b.bank} • <span className="text-[#C8A862]">{b.accountNumber}</span> • {b.accountName}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="w-64 text-center">
                       <div className="h-16 border-b border-black mb-2"></div>
                       <p className="text-[10px] font-black uppercase tracking-widest">Operator Authorization</p>
                    </div>
                  </div>

                  <div className="mt-auto pt-10 text-center text-[9px] font-bold text-gray-400 uppercase tracking-[0.5em]">
                    This is an official revenue record generated by {settings.hotelName} Central Ledger.
                  </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HIDDEN PRINT ASSETS */}
      <div className="hidden" aria-hidden="true">
        {/* Thermal POS Docket HTML */}
        <div id="thermal-pos-docket">
          <div className="center bold uppercase" style={{fontSize: '16px'}}>{settings.hotelName}</div>
          <div className="center bold uppercase" style={{fontSize: '9px', marginTop: '1mm'}}>{settings.hotelAddress}</div>
          <div className="divider"></div>
          <div className="item-row uppercase bold">
            <span>REF: #{transaction.reference.split('-').pop()}</span>
            <span>{new Date(transaction.createdAt).toLocaleDateString()} {new Date(transaction.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          {transaction.orderReference && (
            <div className="item-row uppercase bold" style={{fontSize: '10px'}}>
              <span>ORDER REF: {transaction.orderReference.toUpperCase()}</span>
            </div>
          )}
          <div className="item-row uppercase bold" style={{fontSize: '10px', marginTop: '1mm'}}>
            <span>GUEST: {transaction.guestName.toUpperCase()}</span>
          </div>
          <div className="item-row uppercase bold">
            <span>UNIT: {transaction.unit?.toUpperCase() || 'GENERAL'}</span>
            <span>OP: {transaction.cashierName.toUpperCase()}</span>
          </div>
          <div className="divider"></div>
          {transaction.items.map((item, idx) => {
            const { name, notes } = formatItemDescription(item.description);
            return (
              <div key={idx} style={{marginBottom: '2mm'}}>
                <div className="item-row">
                  <span className="item-name uppercase bold">{name} x{item.quantity}</span>
                  <span className="item-total">₦{item.total.toLocaleString()}</span>
                </div>
                {notes && <div style={{fontSize: '9px', fontStyle: 'italic', paddingLeft: '2mm'}}>* {notes.toUpperCase()}</div>}
              </div>
            );
          })}
          <div className="divider" style={{borderStyle: 'dotted'}}></div>
          <div className="total-box uppercase">
            <span>TOTAL:</span>
            <span>₦{transaction.totalAmount.toLocaleString()}</span>
          </div>
          <div className="bank-info">
            {currentBanks.map((bank, i) => (
              <div key={i} className="bold uppercase">{bank.bank} • {bank.accountNumber} • {bank.accountName}</div>
            ))}
          </div>
          <div className="divider" style={{marginTop: '4mm'}}></div>
          <div className="center bold uppercase" style={{fontSize: '9px'}}>Official Revenue Record</div>
        </div>

        {/* Professional A4 Folio/Invoice HTML */}
        <div id="a4-folio-invoice">
          <div className="header">
            <div className="hotel-info">
              <div className="hotel-name">{settings.hotelName}</div>
              <div className="hotel-sub">{settings.hotelSubName}</div>
              <div className="hotel-addr uppercase">{settings.hotelAddress}</div>
            </div>
            <div className="invoice-meta">
              <div className="invoice-title">Reservation Folio</div>
              <div className="meta-row uppercase">Ref: {transaction.reference}</div>
              {transaction.orderReference && <div className="meta-row uppercase">Order Ref: {transaction.orderReference}</div>}
              <div className="meta-row uppercase">Date: {new Date(transaction.createdAt).toLocaleDateString()} {new Date(transaction.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              <div className="meta-row uppercase">Served by: {transaction.cashierName}</div>
            </div>
          </div>

          <div className="grid">
            <div className="guest-box">
              <div className="section-title">Guest Details</div>
              <div className="bold uppercase" style={{fontSize: '16px', marginBottom: '2mm'}}>{transaction.guestName}</div>
              <div className="uppercase">{transaction.email || 'No email registered'}</div>
              <div className="uppercase">{transaction.phone || 'No phone registered'}</div>
              <div className="uppercase" style={{marginTop: '2mm', fontSize: '11px', color: '#666'}}>{transaction.identityType}: {transaction.idNumber || 'N/A'}</div>
            </div>
            <div className="stay-box">
              <div className="section-title">Stay Information</div>
              {transaction.roomDetails ? (
                <div className="uppercase">
                  <div className="bold" style={{marginBottom: '2mm'}}>{transaction.roomDetails.roomName}</div>
                  <div className="item-row"><span>Check-In:</span> <span className="bold">{new Date(transaction.roomDetails.checkIn).toLocaleDateString()}</span></div>
                  <div className="item-row"><span>Check-Out:</span> <span className="bold">{new Date(transaction.roomDetails.checkOut).toLocaleDateString()}</span></div>
                  <div className="item-row" style={{marginTop: '2mm', borderTop: '1px solid #eee', paddingTop: '1mm'}}><span>Nights:</span> <span className="bold">{transaction.roomDetails.nights}</span></div>
                </div>
              ) : <div className="bold">Reservation Mapping Data N/A</div>}
            </div>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th style={{width: '50%'}}>Service Description</th>
                <th style={{textAlign: 'center', width: '10%'}}>Qty</th>
                <th style={{textAlign: 'right', width: '20%'}}>Rate (₦)</th>
                <th style={{textAlign: 'right', width: '20%'}}>Amount (₦)</th>
              </tr>
            </thead>
            <tbody>
              {transaction.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="uppercase bold" style={{wordBreak: 'break-all'}}>{item.description}</td>
                  <td className="bold" style={{textAlign: 'center'}}>{item.quantity}</td>
                  <td className="bold" style={{textAlign: 'right'}}>{item.price.toLocaleString()}</td>
                  <td className="bold" style={{textAlign: 'right'}}>{item.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="totals">
            <div className="total-row uppercase"><span>Subtotal:</span> <span className="bold">₦{subtotalForReceipt.toLocaleString()}</span></div>
            {taxesToDisplay.map(tax => (
              <div key={tax.id} className="total-row uppercase"><span>{tax.name}:</span> <span className="bold">₦{(subtotalForReceipt * tax.rate).toLocaleString()}</span></div>
            ))}
            {transaction.discountAmount > 0 && (
              <div className="total-row uppercase" style={{color: 'red'}}><span>Adjustment:</span> <span className="bold">-₦{transaction.discountAmount.toLocaleString()}</span></div>
            )}
            <div className="total-row grand-total uppercase"><span>Total Amount:</span> <span>₦{transaction.totalAmount.toLocaleString()}</span></div>
            <div className="total-row uppercase" style={{fontSize: '14px', color: '#008000'}}><span>Amount Paid:</span> <span className="bold">₦{transaction.paidAmount.toLocaleString()}</span></div>
            <div className="total-row uppercase" style={{fontSize: '16px', color: 'red', borderTop: '1px solid #eee', marginTop: '2mm', paddingTop: '2mm'}}><span>Outstanding:</span> <span>₦{transaction.balance.toLocaleString()}</span></div>
          </div>

          <div className="footer">
            <div className="bank-list">
              <div className="section-title">Settlement Instructions</div>
              {currentBanks.map((bank, i) => (
                <div key={i} className="bold uppercase" style={{marginBottom: '1mm', fontSize: '12px'}}>{bank.bank} • {bank.accountNumber} • {bank.accountName}</div>
              ))}
              <div style={{marginTop: '10mm', fontSize: '9px', color: '#999', textTransform: 'uppercase'}} className="bold italic">
                Verified Corporate Folio Dispatch. Generated by {settings.hotelName} Revenue Authority.
              </div>
            </div>
            <div className="signature-box uppercase">Operator Signature</div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ReceiptPreview;
import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Transaction, UnitType, AppSettings, BankAccount, TaxConfig } from '../types';
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
          isTaxInclusive: data.isTaxInclusive ?? true,
          taxes: data.taxes || [],
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
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow || !settings) return;

    const contentId = isPos ? 'thermal-pos-docket' : 'thermal-folio-docket';
    const content = document.getElementById(contentId)?.innerHTML;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${settings.hotelName.replace(/\s+/g, '_')}_POS_${transaction.reference}</title>
          <style>
            @page { size: 80mm auto; margin: 0 !important; }
            html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; background: #ffffff !important; -webkit-print-color-adjust: exact; }
            .docket-shell { width: 80mm !important; margin: 0 auto !important; padding: 6mm 4mm !important; box-sizing: border-box !important; font-family: 'Courier New', Courier, monospace !important; color: #000 !important; font-size: 12px !important; line-height: 1.2 !important; background: #fff !important; }
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
          </style>
        </head>
        <body>
          <div class="docket-shell">${content}<div class="cut-spacer"></div></div>
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

  // Taxation display logic
  const taxesToDisplay = settings.taxes.filter(t => t.visibleOnReceipt);
  const subtotalForReceipt = transaction.subtotal;

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 overflow-y-auto no-print">
        <div className="flex flex-col h-full w-full max-w-4xl p-4">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-[#C8A862] rounded-full"></div>
              <h3 className="text-white font-bold tracking-widest uppercase text-sm">Revenue Authority Dispatch</h3>
            </div>
            <div className="flex gap-4">
              <button onClick={handlePrint} className="px-8 py-2 bg-[#C8A862] text-black font-bold rounded shadow-lg transition-transform hover:scale-105 active:scale-95">Print 80mm Docket</button>
              <button onClick={onClose} className="px-8 py-2 border border-gray-600 text-white rounded transition-colors hover:bg-gray-800">Close Hub</button>
            </div>
          </div>

          <div className="flex-1 bg-[#0B1C2D] p-2 md:p-8 rounded-xl shadow-inner mx-auto overflow-y-auto w-full flex justify-center border border-white/5">
            <div className="bg-white p-8 shadow-2xl h-fit w-[80mm] text-black font-mono">
                <div className="text-center">
                  <h1 className="text-xl font-black uppercase mb-1">{settings.hotelName}</h1>
                  <p className="text-[10px] font-bold uppercase leading-tight">{settings.hotelAddress}</p>
                </div>
                <div className="border-b border-black border-dashed my-3"></div>
                <div className="flex justify-between text-[11px] font-bold uppercase">
                  <span>Ref: #{transaction.reference.split('-').pop()}</span>
                  <span>{new Date(transaction.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between text-[11px] font-bold uppercase mb-2">
                  <span>Unit: {transaction.unit || 'FOLIO'}</span>
                  <span>Op: {transaction.cashierName.split(' ')[0]}</span>
                </div>
                <div className="border-b border-black border-dashed my-3"></div>
                <div className="space-y-2">
                  {transaction.items.map((item, idx) => {
                    const { name, notes } = formatItemDescription(item.description);
                    return (
                      <div key={idx}>
                        <div className="flex justify-between text-[12px] font-bold uppercase">
                          <span className="flex-1 pr-2">{name} (x{item.quantity})</span>
                          <span>₦{item.total.toLocaleString()}</span>
                        </div>
                        {notes && (
                          <div className="text-[10px] text-gray-600 font-bold uppercase italic pl-2 border-l border-gray-300 ml-1">
                            * {notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-black border-dotted pt-2 mt-3 space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span>SUBTOTAL:</span>
                    <span>₦{subtotalForReceipt.toLocaleString()}</span>
                  </div>
                  {taxesToDisplay.map(tax => {
                    const taxAmount = subtotalForReceipt * tax.rate;
                    return (
                      <div key={tax.id} className="flex justify-between text-[11px] font-bold">
                        <span>{tax.name} ({(tax.rate * 100).toFixed(1)}%):</span>
                        <span>₦{taxAmount.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="border-y border-black py-2 my-3 flex justify-between text-lg font-black uppercase">
                  <span>TOTAL:</span>
                  <span>₦{transaction.totalAmount.toLocaleString()}</span>
                </div>
                <div className="text-center italic text-[10px] font-black border-t border-black pt-4 uppercase">*** Verified Revenue Record ***</div>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden" aria-hidden="true">
        <div id="thermal-pos-docket">
          <div className="center bold uppercase" style={{fontSize: '16px'}}>{settings.hotelName}</div>
          <div className="center bold uppercase" style={{fontSize: '9px', marginTop: '1mm'}}>{settings.hotelAddress}</div>
          <div className="divider"></div>
          <div className="item-row uppercase bold">
            <span>REF: #{transaction.reference.split('-').pop()}</span>
            <span>{new Date(transaction.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="item-row uppercase bold">
            <span>UNIT: {transaction.unit?.toUpperCase() || 'GENERAL'}</span>
            <span>OP: {transaction.cashierName.split(' ')[0].toUpperCase()}</span>
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
          <div className="item-row bold" style={{fontSize: '11px'}}>
            <span>SUBTOTAL:</span>
            <span>₦{subtotalForReceipt.toLocaleString()}</span>
          </div>
          {taxesToDisplay.map(tax => (
            <div key={tax.id} className="item-row bold" style={{fontSize: '11px'}}>
              <span>{tax.name.toUpperCase()} ({(tax.rate * 100).toFixed(1)}%):</span>
              <span>₦{(subtotalForReceipt * tax.rate).toLocaleString()}</span>
            </div>
          ))}
          <div className="total-box uppercase">
            <span>TOTAL:</span>
            <span>₦{transaction.totalAmount.toLocaleString()}</span>
          </div>
          {transaction.balance > 0 && (
            <div className="bank-info">
              <div className="bold uppercase" style={{marginBottom: '1mm', textDecoration: 'underline'}}>Payment Instructions:</div>
              {currentBanks.map((bank, i) => (
                <div key={i} className="bold uppercase">{bank.bank}: {bank.accountNumber}</div>
              ))}
              <div className="item-row uppercase bold" style={{fontSize: '14px', marginTop: '2mm', borderTop: '1px dotted #000', paddingTop: '1mm'}}>
                <span>BALANCE:</span>
                <span>₦{transaction.balance.toLocaleString()}</span>
              </div>
            </div>
          )}
          <div className="divider" style={{marginTop: '4mm'}}></div>
          <div className="center bold uppercase" style={{fontSize: '9px'}}>Verified Revenue Authorization</div>
        </div>

        <div id="thermal-folio-docket">
          <div className="center bold uppercase" style={{fontSize: '16px'}}>{settings.hotelName}</div>
          <div className="center bold uppercase" style={{fontSize: '11px', margin: '2mm 0'}}>RESERVATION FOLIO</div>
          <div className="divider"></div>
          <div className="item-row uppercase bold"><span>REF: {transaction.reference}</span></div>
          <div className="item-row uppercase bold"><span>GUEST: {transaction.guestName.toUpperCase()}</span></div>
          <div className="item-row uppercase bold"><span>DATE: {new Date(transaction.createdAt).toLocaleDateString()}</span></div>
          <div className="divider"></div>
          {transaction.items.map((item, idx) => (
            <div key={idx} style={{marginBottom: '3mm'}}>
              <div className="bold uppercase">{item.description}</div>
              <div className="item-row" style={{fontSize: '11px'}}>
                <span>QTY: {item.quantity}</span>
                <span className="bold">₦{item.total.toLocaleString()}</span>
              </div>
            </div>
          ))}
          <div className="divider"></div>
          <div className="total-box uppercase"><span>VALUATION:</span><span>₦{transaction.totalAmount.toLocaleString()}</span></div>
          <div className="item-row uppercase bold" style={{color: '#000', fontSize: '13px'}}><span>OUTSTANDING:</span><span>₦{transaction.balance.toLocaleString()}</span></div>
          {transaction.balance > 0 && (
            <div className="bank-info" style={{marginTop: '4mm'}}>
              <div className="center bold uppercase" style={{fontSize: '9px', borderBottom: '1px dotted #000', marginBottom: '1mm'}}>Settlement Channels</div>
              {currentBanks.map((bank, i) => (
                <div key={i} className="bold uppercase">{bank.bank}: {bank.accountNumber}</div>
              ))}
            </div>
          )}
          <div className="divider" style={{marginTop: '5mm'}}></div>
          <div className="center bold uppercase" style={{fontSize: '9px'}}>Official Folio Record</div>
        </div>
      </div>
    </>
  );
};

export default ReceiptPreview;
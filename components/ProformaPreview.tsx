import React, { useRef } from 'react';
import { Transaction, AppSettings, BankAccount } from '@/types';
import { BRAND } from '@/constants';
import { Printer, Download, X } from 'lucide-react';

interface ProformaPreviewProps {
  transaction: Transaction;
  settings: AppSettings | null;
  onClose: () => void;
}

const ProformaPreview: React.FC<ProformaPreviewProps> = ({ transaction, settings, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=1000,height=900');
    if (!printWindow || !settings) return;

    const content = document.getElementById('proforma-invoice-print')?.innerHTML;

    const style = `
      @page { size: 210mm 297mm; margin: 0 !important; }
      html, body { margin: 0 !important; padding: 0 !important; width: 210mm !important; height: 297mm !important; background: #ffffff !important; -webkit-print-color-adjust: exact; font-family: 'Inter', sans-serif !important; }
      * { box-sizing: border-box !important; }
      .print-shell { width: 210mm !important; min-height: 297mm !important; padding: 15mm !important; box-sizing: border-box !important; color: #000 !important; position: relative; }
      .header { text-align: center; margin-bottom: 8mm; }
      .hotel-name { font-size: 28px; font-weight: 900; color: #0B1C2D; font-style: italic; margin-bottom: 1mm; }
      .hotel-name span { color: #C8A862; }
      .hotel-addr { font-size: 9px; font-weight: bold; letter-spacing: 0.3em; margin-bottom: 3mm; text-transform: uppercase; color: #666; }
      .invoice-title-box { background: #eee; padding: 2mm 0; font-size: 14px; font-weight: 900; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 6mm; }
      .section-title { background: #f5f5f5; padding: 1mm 2mm; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; border-left: 4px solid #C8A862; margin-bottom: 3mm; }
      .grid { display: grid; grid-template-columns: 120px 1fr; gap: 1mm; margin-bottom: 6mm; font-size: 11px; }
      .grid div:nth-child(odd) { font-weight: bold; text-transform: uppercase; }
      .grid div:nth-child(even) { text-transform: uppercase; }
      .table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; table-layout: fixed; }
      .table th { text-align: center; font-size: 8px; font-weight: 900; text-transform: uppercase; padding: 2mm; border: 1px solid #000; background: #f9f9f9; }
      .table td { padding: 2mm; border: 1px solid #000; font-size: 10px; word-wrap: break-word; text-align: center; }
      .table td.text-left { text-align: left; }
      .table td.text-right { text-align: right; }
      .totals-box { display: flex; justify-content: flex-end; margin-bottom: 6mm; }
      .totals-table { width: 64mm; font-size: 11px; }
      .total-row { display: flex; justify-content: space-between; padding: 1.5mm 0; border-bottom: 1px solid #000; }
      .grand-total { background: #f97316; color: #fff; padding: 2mm; font-weight: 900; border-bottom: none; }
      .notes { font-size: 8px; line-height: 1.4; margin-bottom: 6mm; }
      .notes-title { color: #dc2626; font-weight: bold; margin-bottom: 1mm; }
      .bank-section { border-top: 2px solid #000; padding-top: 4mm; margin-bottom: 6mm; }
      .bank-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; font-size: 8px; }
      .bank-item { border-left: 1px solid #eee; padding-left: 2mm; }
      .footer-msg { font-size: 10px; font-style: italic; color: #666; margin-bottom: 8mm; }
      .signature { font-size: 11px; font-weight: bold; }
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>PROFORMA_${transaction.reference}</title>
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

  const handleDownload = () => {
    // Basic implementation: trigger print which allows save as PDF
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md overflow-y-auto">
      <div className="flex flex-col gap-4 w-full max-w-[210mm]">
        <div className="flex justify-between items-center no-print">
          <div className="flex gap-2">
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-[#C8A862] text-black font-bold rounded-lg text-xs uppercase tracking-widest">
              <Printer className="w-4 h-4" /> Print A4
            </button>
            <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg text-xs uppercase tracking-widest">
              <Download className="w-4 h-4" /> Download PDF
            </button>
          </div>
          <button onClick={onClose} className="p-2 text-white hover:text-[#C8A862] transition-colors">
            <X className="w-8 h-8" />
          </button>
        </div>

        <div 
          ref={printRef}
          className="bg-white text-black p-[15mm] shadow-2xl min-h-[297mm] w-full mx-auto font-sans text-[10pt] leading-tight print:shadow-none print:p-0"
          id="proforma-invoice"
        >
          {/* Header */}
          <div className="text-center mb-6">
            <div className="flex justify-center mb-2">
              <div className="text-2xl font-black italic tracking-tighter uppercase text-[#0B1C2D]">
                <span className="text-[#C8A862]">TIDÉ</span> HOTELS & RESORTS
              </div>
            </div>
            <div className="text-[8pt] font-bold uppercase tracking-widest text-gray-600 mb-1">
              38 S.O Williams Street, Off Anthony Enahoro Street, Abuja
            </div>
            <div className="bg-gray-200 py-1 font-black uppercase tracking-[0.2em] text-[11pt]">
              PROFORMA INVOICE
            </div>
          </div>

          {/* Customer Details */}
          <div className="mb-6">
            <div className="bg-gray-100 px-2 py-1 text-[8pt] font-black uppercase tracking-widest mb-2 border-l-4 border-[#C8A862]">
              CUSTOMER DETAILS
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-y-1 text-[9pt]">
              <div className="font-bold uppercase">NAME:</div>
              <div className="uppercase">{transaction.guestName}</div>
              
              <div className="font-bold uppercase">ORGANISATION:</div>
              <div className="uppercase">{transaction.organisation}</div>
              
              <div className="font-bold uppercase">ADDRESS:</div>
              <div className="uppercase">{transaction.address}</div>
              
              <div className="font-bold uppercase">EVENT:</div>
              <div className="uppercase">{transaction.event}</div>
              
              <div className="font-bold uppercase">EVENT PERIOD:</div>
              <div className="uppercase">{transaction.eventPeriod}</div>
            </div>
          </div>

          {/* Room Booking Table */}
          <div className="mb-6">
            <div className="bg-gray-100 px-2 py-1 text-[8pt] font-black uppercase tracking-widest mb-2 border-l-4 border-[#C8A862]">
              ROOM BOOKING AND MEETING SPACES
            </div>
            <table className="w-full border-collapse text-[8pt]">
              <thead>
                <tr className="bg-gray-50 uppercase font-bold text-center border border-black">
                  <th className="border border-black p-1 w-8">#</th>
                  <th className="border border-black p-1">START DATE</th>
                  <th className="border border-black p-1">END DATE</th>
                  <th className="border border-black p-1">NO. OF DAYS</th>
                  <th className="border border-black p-1">DESCRIPTION B&B</th>
                  <th className="border border-black p-1">QTY</th>
                  <th className="border border-black p-1"># OF DAYS</th>
                  <th className="border border-black p-1">UNIT RATE</th>
                  <th className="border border-black p-1">DISCOUNTED RATE</th>
                  <th className="border border-black p-1">TOTAL</th>
                  <th className="border border-black p-1">Comments</th>
                </tr>
              </thead>
              <tbody>
                {transaction.proformaRooms?.map((item, idx) => (
                  <tr key={idx} className="text-center">
                    <td className="border border-black p-1">{idx + 1}</td>
                    <td className="border border-black p-1">{item.startDate}</td>
                    <td className="border border-black p-1">{item.endDate}</td>
                    <td className="border border-black p-1">{item.noOfDays}</td>
                    <td className="border border-black p-1 text-left">{item.description}</td>
                    <td className="border border-black p-1">{item.qty}</td>
                    <td className="border border-black p-1">{item.noOfDays}</td>
                    <td className="border border-black p-1 text-right">₦{item.unitRate.toLocaleString()}</td>
                    <td className="border border-black p-1 text-right">₦{item.discountedRate.toLocaleString()}</td>
                    <td className="border border-black p-1 text-right font-bold">₦{item.total.toLocaleString()}</td>
                    <td className="border border-black p-1 text-left text-[7pt]">{item.comments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Food & Beverage Table */}
          <div className="mb-6">
            <div className="bg-gray-100 px-2 py-1 text-[8pt] font-black uppercase tracking-widest mb-2 border-l-4 border-[#C8A862]">
              FOOD & BEVERAGE REQUIREMENT
            </div>
            <table className="w-full border-collapse text-[8pt]">
              <thead>
                <tr className="bg-gray-50 uppercase font-bold text-center border border-black">
                  <th className="border border-black p-1 w-8">#</th>
                  <th className="border border-black p-1">START DATE</th>
                  <th className="border border-black p-1">END DATE</th>
                  <th className="border border-black p-1"># DAYS</th>
                  <th className="border border-black p-1">Description</th>
                  <th className="border border-black p-1">QTY</th>
                  <th className="border border-black p-1">DURATION</th>
                  <th className="border border-black p-1">UNIT RATE</th>
                  <th className="border border-black p-1">DISCOUNTED RATE</th>
                  <th className="border border-black p-1">TOTAL</th>
                  <th className="border border-black p-1">COMMENT</th>
                </tr>
              </thead>
              <tbody>
                {transaction.proformaFood?.map((item, idx) => (
                  <tr key={idx} className="text-center">
                    <td className="border border-black p-1">{(transaction.proformaRooms?.length || 0) + idx + 1}</td>
                    <td className="border border-black p-1">{item.startDate}</td>
                    <td className="border border-black p-1">{item.endDate}</td>
                    <td className="border border-black p-1">{item.noOfDays}</td>
                    <td className="border border-black p-1 text-left">{item.description}</td>
                    <td className="border border-black p-1">{item.qty}</td>
                    <td className="border border-black p-1">{item.duration}</td>
                    <td className="border border-black p-1 text-right">₦{item.unitRate.toLocaleString()}</td>
                    <td className="border border-black p-1 text-right">₦{item.discountedRate.toLocaleString()}</td>
                    <td className="border border-black p-1 text-right font-bold">₦{item.total.toLocaleString()}</td>
                    <td className="border border-black p-1 text-left text-[7pt]">{item.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end mb-6">
            <div className="w-64 space-y-1 text-[9pt]">
              <div className="flex justify-between border-b border-black pb-1">
                <span className="font-bold uppercase">SUB TOTAL</span>
                <span className="font-black">₦{transaction.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b border-black pb-1">
                <span className="font-bold uppercase">Service Charge</span>
                <span className="font-black">₦{transaction.serviceCharge.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b border-black pb-1">
                <span className="font-bold uppercase">VAT / Taxes</span>
                <span className="font-black">₦{transaction.taxAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between bg-orange-500 text-white p-1 font-black">
                <span className="uppercase">Grand Total</span>
                <span>₦{transaction.totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mb-6 text-[7pt] leading-snug">
            <div className="text-red-600 font-bold mb-1">Note:</div>
            <div className="space-y-1">
              <p>1. To confirm your booking, the following payments are required:</p>
              <p className="pl-4">A) Reservation Deposit (30%): A non-refundable deposit of 30% of the total estimated invoice is required upon signing this agreement to secure the event date.</p>
              <p className="pl-4">B) Refundable Security Deposit (10%): A separate refundable deposit of 10% of the total estimated invoice is also due upon signing.</p>
              <p className="pl-4 italic text-gray-600">This deposit is held as security against incidental charges, damages to the venue, or guest count overages beyond the final guarantee.</p>
              <p className="pl-4">C) Final Payment: The remaining balance of 60% of the total estimated invoice is due seven (7) business days prior to the event date.</p>
              <p>2. Final Settlement & Security Deposit Refund</p>
              <p>Any final adjustments to the invoice (e.g., for guest count increases agreed upon during the event) must be settled before departure.</p>
              <p>The 10% security deposit (1.B) will be refunded via the original payment method within ten (10) business days following the event, subject to deduction for any documented damages, losses, or incidental charges not covered by the final invoice.</p>
            </div>
          </div>

          {/* Bank Details */}
          <div className="border-t-2 border-black pt-4 mb-6">
            <div className="text-[7pt] font-bold mb-2 uppercase tracking-widest text-blue-800">
              DOLLAR RATE (CBN RATE FOR THE DAY): https://www.cbn.gov.ng/rates/ExchRateByCurrency.html
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-[7pt]">
              {settings?.proformaBanks && settings.proformaBanks.length > 0 ? (
                settings.proformaBanks.map((bank, idx) => (
                  <div key={idx} className="space-y-1 border-l border-gray-200 pl-2">
                    <div className="flex justify-between"><span className="font-bold">BANK NAME:</span> <span>{bank.bank}</span></div>
                    <div className="flex justify-between"><span className="font-bold">ACCOUNT NAME:</span> <span>{bank.accountName}</span></div>
                    <div className="flex justify-between"><span className="font-bold">ACCOUNT NUMBER:</span> <span>{bank.accountNumber}</span></div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-4 text-center text-gray-400 italic">
                  No bank accounts configured for proforma invoices.
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="text-[8pt] italic text-gray-600 mb-8">
            We are truly grateful for your partnership and remain dedicated to providing the exceptional service that defines the Tidé legacy
          </div>

          <div className="text-[9pt] font-bold">
            Best,<br /><br />
            {transaction.preparedBy || 'Lois'}<br />
            For: Tidé Hotels
          </div>
        </div>
      </div>

      <div className="hidden" aria-hidden="true">
        <div id="proforma-invoice-print">
          <div className="header">
            <div className="hotel-name"><span>TIDÉ</span> HOTELS & RESORTS</div>
            <div className="hotel-addr">38 S.O Williams Street, Off Anthony Enahoro Street, Abuja</div>
            <div className="invoice-title-box">PROFORMA INVOICE</div>
          </div>

          <div className="section-title">Customer Details</div>
          <div className="grid">
            <div>Name:</div><div>{transaction.guestName}</div>
            <div>Organisation:</div><div>{transaction.organisation}</div>
            <div>Address:</div><div>{transaction.address}</div>
            <div>Event:</div><div>{transaction.event}</div>
            <div>Event Period:</div><div>{transaction.eventPeriod}</div>
          </div>

          <div className="section-title">Room Booking and Meeting Spaces</div>
          <table className="table">
            <thead>
              <tr>
                <th style={{width: '30px'}}>#</th>
                <th>START DATE</th>
                <th>END DATE</th>
                <th>DAYS</th>
                <th style={{width: '30%'}}>DESCRIPTION</th>
                <th>QTY</th>
                <th>RATE</th>
                <th>DISC. RATE</th>
                <th>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {transaction.proformaRooms?.map((item, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>{item.startDate}</td>
                  <td>{item.endDate}</td>
                  <td>{item.noOfDays}</td>
                  <td className="text-left">{item.description}</td>
                  <td>{item.qty}</td>
                  <td className="text-right">₦{item.unitRate.toLocaleString()}</td>
                  <td className="text-right">₦{item.discountedRate.toLocaleString()}</td>
                  <td className="text-right" style={{fontWeight: 'bold'}}>₦{item.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="section-title">Food & Beverage Requirement</div>
          <table className="table">
            <thead>
              <tr>
                <th style={{width: '30px'}}>#</th>
                <th>START DATE</th>
                <th style={{width: '40%'}}>DESCRIPTION</th>
                <th>QTY</th>
                <th>DURATION</th>
                <th>RATE</th>
                <th>DISC. RATE</th>
                <th>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {transaction.proformaFood?.map((item, idx) => (
                <tr key={idx}>
                  <td>{(transaction.proformaRooms?.length || 0) + idx + 1}</td>
                  <td>{item.startDate}</td>
                  <td className="text-left">{item.description}</td>
                  <td>{item.qty}</td>
                  <td>{item.duration}</td>
                  <td className="text-right">₦{item.unitRate.toLocaleString()}</td>
                  <td className="text-right">₦{item.discountedRate.toLocaleString()}</td>
                  <td className="text-right" style={{fontWeight: 'bold'}}>₦{item.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="totals-box">
            <div className="totals-table">
              <div className="total-row"><span>SUB TOTAL</span><span style={{fontWeight: '900'}}>₦{transaction.subtotal.toLocaleString()}</span></div>
              <div className="total-row"><span>Service Charge</span><span style={{fontWeight: '900'}}>₦{transaction.serviceCharge.toLocaleString()}</span></div>
              <div className="total-row"><span>VAT / Taxes</span><span style={{fontWeight: '900'}}>₦{transaction.taxAmount.toLocaleString()}</span></div>
              <div className="total-row grand-total"><span>GRAND TOTAL</span><span>₦{transaction.totalAmount.toLocaleString()}</span></div>
            </div>
          </div>

          <div className="notes">
            <div className="notes-title">Note:</div>
            <p>1. To confirm your booking, the following payments are required:</p>
            <p style={{paddingLeft: '4mm'}}>A) Reservation Deposit (30%): A non-refundable deposit of 30% of the total estimated invoice is required upon signing this agreement to secure the event date.</p>
            <p style={{paddingLeft: '4mm'}}>B) Refundable Security Deposit (10%): A separate refundable deposit of 10% of the total estimated invoice is also due upon signing.</p>
            <p style={{paddingLeft: '4mm'}}>C) Final Payment: The remaining balance of 60% of the total estimated invoice is due seven (7) business days prior to the event date.</p>
            <p>2. Final Settlement & Security Deposit Refund</p>
            <p>The 10% security deposit will be refunded within ten (10) business days following the event, subject to deductions for any documented damages or incidental charges.</p>
          </div>

          <div className="bank-section">
            <div className="bank-grid">
              {settings?.proformaBanks?.map((bank, idx) => (
                <div key={idx} className="bank-item">
                  <div><strong>BANK NAME:</strong> {bank.bank}</div>
                  <div><strong>ACCOUNT NAME:</strong> {bank.accountName}</div>
                  <div><strong>ACCOUNT NUMBER:</strong> {bank.accountNumber}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="footer-msg">
            We are truly grateful for your partnership and remain dedicated to providing the exceptional service that defines the Tidé legacy
          </div>

          <div className="signature">
            Best,<br /><br />
            {transaction.preparedBy || 'Lois'}<br />
            For: Tidé Hotels
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #proforma-invoice, #proforma-invoice * {
            visibility: visible;
          }
          #proforma-invoice {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 10mm;
            box-shadow: none;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />
    </div>
  );
};

export default ProformaPreview;

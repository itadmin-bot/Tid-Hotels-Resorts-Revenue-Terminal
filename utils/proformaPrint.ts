import { Transaction, AppSettings } from '@/types';

export const printProformaInvoice = (transaction: Transaction, settings: AppSettings | null) => {
  const printWindow = window.open('', '_blank', 'width=1000,height=900');
  if (!printWindow || !settings) return;

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

  const roomRows = transaction.proformaRooms?.map((item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${item.startDate}</td>
      <td>${item.endDate}</td>
      <td>${item.noOfDays}</td>
      <td class="text-left">${item.description}</td>
      <td>${item.qty}</td>
      <td>${item.unitRate.toLocaleString()}</td>
      <td>${item.discountedRate.toLocaleString()}</td>
      <td class="text-right" style="font-weight: bold">₦${item.total.toLocaleString()}</td>
    </tr>
  `).join('') || '';

  const foodRows = transaction.proformaFood?.map((item, idx) => `
    <tr>
      <td>${(transaction.proformaRooms?.length || 0) + idx + 1}</td>
      <td>${item.startDate}</td>
      <td class="text-left">${item.description}</td>
      <td>${item.qty}</td>
      <td>${item.duration || ''}</td>
      <td>${item.unitRate.toLocaleString()}</td>
      <td>${item.discountedRate.toLocaleString()}</td>
      <td class="text-right" style="font-weight: bold">₦${item.total.toLocaleString()}</td>
    </tr>
  `).join('') || '';

  const bankItems = settings.proformaBanks?.map(bank => `
    <div class="bank-item">
      <div><strong>BANK NAME:</strong> ${bank.bank}</div>
      <div><strong>ACCOUNT NAME:</strong> ${bank.accountName}</div>
      <div><strong>ACCOUNT NUMBER:</strong> ${bank.accountNumber}</div>
    </div>
  `).join('') || '<div class="col-span-full py-4 text-center text-gray-400 italic">No bank accounts configured.</div>';

  const taxRows = settings.taxes?.filter(t => t.visibleOnReceipt).map(tax => `
    <div class="total-row">
      <span>${tax.name}</span>
      <span style="font-weight: 900">₦${(transaction.subtotal * tax.rate).toLocaleString()}</span>
    </div>
  `).join('') || '';

  const content = `
    <div class="header">
      <div class="hotel-name"><span>TIDÉ</span> HOTELS & RESORTS</div>
      <div class="hotel-addr">38 S.O Williams Street, Off Anthony Enahoro Street, Abuja</div>
      <div class="invoice-title-box">PROFORMA INVOICE</div>
    </div>

    <div class="section-title">Customer Details</div>
    <div class="grid">
      <div>Name:</div><div>${transaction.guestName}</div>
      <div>Organisation:</div><div>${transaction.organisation}</div>
      <div>Address:</div><div>${transaction.address}</div>
      <div>Event:</div><div>${transaction.event}</div>
      <div>Event Period:</div><div>${transaction.eventPeriod}</div>
    </div>

    <div class="section-title">Room Booking and Meeting Spaces</div>
    <table class="table">
      <thead>
        <tr>
          <th style="width: 30px">#</th>
          <th>START DATE</th>
          <th>END DATE</th>
          <th>DAYS</th>
          <th style="width: 30%">DESCRIPTION</th>
          <th>QTY</th>
          <th>RATE</th>
          <th>DISC. RATE</th>
          <th>TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${roomRows}
      </tbody>
    </table>

    <div class="section-title">Food & Beverage Requirement</div>
    <table class="table">
      <thead>
        <tr>
          <th style="width: 30px">#</th>
          <th>START DATE</th>
          <th style="width: 40%">DESCRIPTION</th>
          <th>QTY</th>
          <th>DURATION</th>
          <th>RATE</th>
          <th>DISC. RATE</th>
          <th>TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${foodRows}
      </tbody>
    </table>

    <div class="totals-box">
      <div class="totals-table">
        <div class="total-row"><span>SUB TOTAL</span><span style="font-weight: 900">₦${transaction.subtotal.toLocaleString()}</span></div>
        ${taxRows}
        <div class="total-row grand-total"><span>GRAND TOTAL</span><span>₦${transaction.totalAmount.toLocaleString()}</span></div>
      </div>
    </div>

    <div class="notes">
      <div class="notes-title">Note:</div>
      <p>1. To confirm your booking, the following payments are required:</p>
      <p style="padding-left: 4mm">A) Reservation Deposit (30%): A non-refundable deposit of 30% of the total estimated invoice is required upon signing this agreement to secure the event date.</p>
      <p style="padding-left: 4mm">B) Refundable Security Deposit (10%): A separate refundable deposit of 10% of the total estimated invoice is also due upon signing.</p>
      <p style="padding-left: 4mm">C) Final Payment: The remaining balance of 60% of the total estimated invoice is due seven (7) business days prior to the event date.</p>
      <p>2. Final Settlement & Security Deposit Refund</p>
      <p>The 10% security deposit will be refunded within ten (10) business days following the event, subject to deductions for any documented damages or incidental charges.</p>
    </div>

    <div class="bank-section">
      <div class="bank-grid">
        ${bankItems}
      </div>
    </div>

    <div class="footer-msg">
      We are truly grateful for your partnership and remain dedicated to providing the exceptional service that defines the Tidé legacy
    </div>

    <div class="signature">
      Best,<br /><br />
      ${transaction.preparedBy || 'Lois'}<br />
      For: Tidé Hotels
    </div>
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

import type { AdditionalCharge, InvoicingTripView } from '../services/invoicing.service';
import type { InvoiceCalcResult } from '../hooks/useInvoiceCalc';

interface InvoicePdfDocumentProps {
  activeClient: string | null;
  selectedTrips: InvoicingTripView[];
  paymentTerms: string;
  notes: string;
  gstRate: number;
  fuelRate: number;
  additionalCharges: AdditionalCharge[];
  calculations: InvoiceCalcResult;
  brandingCompanyName?: string;
  brandingLogoUrl?: string | null;
}

export const renderInvoiceToHtml = ({ 
  activeClient,
  selectedTrips,
  notes,
  fuelRate,
  additionalCharges,
  calculations,
  brandingCompanyName = 'GOGOX',
  brandingLogoUrl = null,
}: InvoicePdfDocumentProps) => {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const formatCurrency = (val: number) => {
    return '₹' + val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getTripDetails = (trip: InvoicingTripView) => {
    if (!trip.date) return 'N/A';
    const d = new Date(trip.date);
    return isNaN(d.getTime()) ? trip.date : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const sanitizedBrandName = escapeHtml((brandingCompanyName || 'GOGOX').trim() || 'GOGOX');
  const sanitizedLogoUrl =
    brandingLogoUrl && /^https?:\/\//i.test(brandingLogoUrl) ? escapeHtml(brandingLogoUrl.trim()) : '';

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 20px;
            color: #333;
            -webkit-print-color-adjust: exact;
          }
          .container {
            width: 100%;
            max-width: 794px; /* A4 width in px at 96 dpi */
            margin: 0 auto;
            background-color: #fff;
            padding: 30px;
            border: 1px solid #eee;
            box-shadow: 0 0 10px rgba(0,0,0,0.05);
            position: relative;
            overflow: hidden;
          }
          .watermark {
            position: absolute;
            top: 48%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-35deg);
            font-size: 110px;
            font-weight: 900;
            letter-spacing: 0.2em;
            color: rgba(15, 23, 42, 0.05);
            text-transform: uppercase;
            pointer-events: none;
            white-space: nowrap;
            user-select: none;
            z-index: 0;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            border-bottom: 1px solid #eee;
            padding-bottom: 20px;
            position: relative;
            z-index: 1;
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            color: #4D3636; /* Theme.primary */
          }
          .logo-image {
            max-height: 34px;
            max-width: 180px;
            object-fit: contain;
            display: block;
          }
          .invoice-title {
            font-size: 28px;
            font-weight: bold;
            color: #333;
          }
          .invoice-meta {
            text-align: right;
            font-size: 12px;
            color: #777;
          }
          .invoice-meta p {
            margin: 2px 0;
          }
          .section-title {
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
            color: #777;
            margin-bottom: 10px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            position: relative;
            z-index: 1;
          }
          .col {
            flex: 1;
            padding-right: 20px;
          }
          .card {
            background-color: #f9f9f9;
            border: 1px solid #eee;
            border-radius: 5px;
            padding: 15px;
            min-height: 80px;
            font-size: 13px;
            line-height: 1.5;
          }
          .card p {
            margin: 0;
          }
          .client-name {
            font-weight: bold;
            color: #333;
            text-transform: uppercase;
            margin-bottom: 5px;
          }
          .tax-details {
            font-size: 13px;
            line-height: 1.5;
          }
          .tax-details span {
            font-weight: bold;
            color: #777;
            text-transform: uppercase;
            margin-right: 5px;
          }
          .line-items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            position: relative;
            z-index: 1;
          }
          .line-items-table th, .line-items-table td {
            border-bottom: 1px solid #eee;
            padding: 10px 0;
            text-align: left;
          }
          .line-items-table th {
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
            color: #777;
          }
          .line-items-table td {
            font-size: 12px;
            color: #333;
          }
          .line-items-table .amount {
            text-align: right;
            font-weight: bold;
          }
          .trip-id {
            color: #4D3636; /* Theme.primary */
            font-weight: bold;
          }
          .trip-date {
            color: #777;
            font-size: 11px;
          }
          .notes-block {
            margin-bottom: 20px;
            position: relative;
            z-index: 1;
          }
          .notes-content {
            background-color: #f9f9f9;
            border: 1px solid #eee;
            border-radius: 5px;
            padding: 15px;
            font-size: 13px;
            line-height: 1.5;
            min-height: 60px;
          }
          .calculations-block {
            border-top: 1px solid #eee;
            padding-top: 20px;
            margin-top: 30px;
            position: relative;
            z-index: 1;
          }
          .calc-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 13px;
          }
          .calc-label {
            color: #555;
          }
          .calc-value {
            font-weight: bold;
            color: #333;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 20px;
            border-top: 1px solid #eee;
            padding-top: 15px;
          }
          .total-label {
            font-size: 18px;
            font-weight: bold;
            color: #4D3636; /* Theme.primary */
            text-transform: uppercase;
          }
          .total-value {
            font-size: 28px;
            font-weight: bold;
            color: #4D3636; /* Theme.primary */
          }
          .footer {
            text-align: center;
            margin-top: 40px;
            font-size: 10px;
            color: #aaa;
            position: relative;
            z-index: 1;
          }
          .annexure-block {
            background-color: #0f172a; /* Dark background */
            border-radius: 8px;
            padding: 15px;
            margin-top: 20px;
            color: #fff;
          }
          .annexure-header {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
          }
          .annexure-title {
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
            color: rgba(255,255,255,0.7);
            margin-left: 5px;
          }
          .annexure-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 11px;
          }
          .annexure-label {
            font-weight: bold;
            text-transform: uppercase;
            color: rgba(255,255,255,0.4);
          }
          .annexure-value {
            color: #fff;
            max-width: 60%;
            text-align: right;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="watermark">${sanitizedBrandName}</div>
          <div class="header">
            <div class="header-left">
              ${
                sanitizedLogoUrl
                  ? `<img class="logo-image" src="${sanitizedLogoUrl}" alt="${sanitizedBrandName} logo" />`
                  : `<div class="logo">${sanitizedBrandName}</div>`
              }
              <p style="font-size:10px; color:#777;">LOGISTICS PLATFORM</p>
            </div>
            <div class="header-right">
              <div class="invoice-title">Invoice Preview</div>
              <div class="invoice-meta">
                <p>#INV-2026-0402</p>
                <p>Issued: Apr 8, 2026</p>
                <p>Due: May 8, 2026</p>
              </div>
            </div>
          </div>

          <div class="row">
            <div class="col">
              <p class="section-title">Billing Entity</p>
              <div class="card">
                ${activeClient ? `
                  <p class="client-name">${activeClient}</p>
                  <p>Corporate House, HQ</p>
                  <p>City Center, State - 000000</p>
                ` : `
                  <p style="color:#aaa; font-style:italic;">Select a client...</p>
                `}
              </div>
            </div>
            <div class="col">
              <p class="section-title">Tax Details</p>
              <div class="card tax-details">
                <p><span>GSTIN</span> 24AAA CA000 1Z1</p>
                <p><span>PAN</span> AAAC0000A</p>
                <p><span>State Code</span> 24</p>
              </div>
            </div>
          </div>

          <p class="section-title" style="margin-top: 20px;">Invoice Details</p>
          <table class="line-items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Route / Context</th>
                <th>Reference Date</th>
                <th style="text-align:right;">Value (INR)</th>
              </tr>
            </thead>
            <tbody>
              ${selectedTrips.length === 0 ? `
                <tr>
                  <td colSpan="4" style="text-align:center; color:#aaa; font-style:italic; padding: 20px;">No trips selected for this invoice.</td>
                </tr>
              ` : selectedTrips.map(trip => `
                <tr key=${trip.id}>
                  <td>
                    <span class="trip-id">${trip.id}</span>
                    <p style="margin:0; font-size:10px; color:#777;">Primary Logistics</p>
                  </td>
                  <td>
                    <p style="margin:0;">${trip.route}</p>
                    <p style="margin:0; font-size:10px; color:#777;">${trip.details || 'Vehicle N/A'}</p>
                  </td>
                  <td><span class="trip-date">${getTripDetails(trip)}</span></td>
                  <td class="amount">${formatCurrency(trip.amount)}</td>
                </tr>
              `).join('')}
              ${additionalCharges.filter(c => !c.tripId).map(charge => `
                <tr key=${charge.id}>
                  <td>
                    <p style="margin:0;">${charge.description || 'Custom Charge'}</p>
                    <p style="margin:0; font-size:10px; color:#777;">Global Adjustment</p>
                  </td>
                  <td></td>
                  <td></td>
                  <td class="amount">${formatCurrency(charge.amount)}</td>
                </tr>
              `).join('')}
              ${additionalCharges.filter(c => c.tripId).map(charge => {
                const trip = selectedTrips.find(t => t.id === charge.tripId);
                return trip ? `
                  <tr key=${charge.id}>
                    <td>
                      <p style="margin:0;">${charge.description || 'Trip Adjustment'}</p>
                      <p style="margin:0; font-size:10px; color:#777;">For Trip ${trip.id}</p>
                    </td>
                    <td></td>
                    <td></td>
                    <td class="amount">${formatCurrency(charge.amount)}</td>
                  </tr>
                ` : '';
              }).join('')}
            </tbody>
          </table>

          <div class="notes-block">
            <p class="section-title">Remarks / Notes</p>
            <div class="card notes-content">
              <p>${notes || 'No special instructions or PO references.'}</p>
            </div>
          </div>

          <div class="calculations-block">
            <div class="calc-row">
              <span class="calc-label">Subtotal</span>
              <span class="calc-value">${formatCurrency(calculations.subtotal)}</span>
            </div>
            ${calculations.fuelSurcharge > 0 ? `
              <div class="calc-row">
                <span class="calc-label">Fuel Surcharge (${fuelRate}%)</span>
                <span class="calc-value">${formatCurrency(calculations.fuelSurcharge)}</span>
              </div>
            ` : ''}
            ${calculations.sgst > 0 ? `
              <div class="calc-row">
                <span class="calc-label">SGST (${calculations.sgstRate}%)</span>
                <span class="calc-value">${formatCurrency(calculations.sgst)}</span>
              </div>
            ` : ''}
            ${calculations.cgst > 0 ? `
              <div class="calc-row">
                <span class="calc-label">CGST (${calculations.cgstRate}%)</span>
                <span class="calc-value">${formatCurrency(calculations.cgst)}</span>
              </div>
            ` : ''}
            <div class="total-row">
              <span class="total-label">Grand Total</span>
              <span class="total-value">${formatCurrency(calculations.totalAmount)}</span>
            </div>
          </div>
          
          ${selectedTrips.length > 0 ? `
            <div class="annexure-block">
              <div class="annexure-header">
                <span style="color:#34d399; font-size: 14px;">&#x2B50;</span> <!-- Placeholder for FontAwesome shield -->
                <h4 class="annexure-title">Annexure Intelligence</h4>
              </div>
              <div class="annexure-row">
                <span class="annexure-label">LR Scope:</span>
                <span class="annexure-value">${selectedTrips.map(t => t.id).join(', ')}</span>
              </div>
              <div class="annexure-row">
                <span class="annexure-label">Asset Fleet:</span>
                <span class="annexure-value">${Array.from(new Set(selectedTrips.map(t => t.details || 'N/A'))).join(', ')}</span>
              </div>
            </div>
          ` : ''}

          <div class="footer">
            This is a system generated document. All transactions are backed by proof of delivery and verified by the match engine.
          </div>
        </div>
      </body>
    </html>
  `;
};
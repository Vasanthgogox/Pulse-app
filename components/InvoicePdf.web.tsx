import React, { useRef, useState } from 'react';
import { jsPDF } from 'jspdf/dist/jspdf.es.min';
import html2canvas from 'html2canvas';
import type { InvoicePdfData } from '@/components/InvoicePdf.types';

function formatCurrency(amount: number): string {
  return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pageStyle(): React.CSSProperties {
  return {
    backgroundColor: '#fff',
    width: '210mm',
    minHeight: '297mm',
    padding: '28px 32px',
    position: 'relative',
    boxShadow: '0 0 16px rgba(0,0,0,0.08)',
    boxSizing: 'border-box',
    color: '#1f2937',
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  };
}

interface InvoicePdfWebProps {
  invoiceData: InvoicePdfData;
  onFinalize?: () => void;
  isFinalizing?: boolean;
}

export default function InvoicePdfWeb({ invoiceData, onFinalize, isFinalizing = false }: InvoicePdfWebProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUrl = logoFailed ? null : invoiceData.brandingLogoUrl;

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    setIsGenerating(true);

    try {
      const element = printRef.current;
      // Capture the element as a high-res canvas
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');

      // Create PDF (A4 size)
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: 'a4',
      });

      // Calculate dimensions to fit the A4 page perfectly
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`invoice_${invoiceData.invoiceNo}.pdf`);
    } catch (error) {
      console.error("Failed to generate PDF", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f5f5f5' }}>
      
      {/* Action Bar */}
      <div style={{ padding: '15px', backgroundColor: '#fff', textAlign: 'center', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'center', gap: 12 }}>
        <button 
          onClick={handleDownloadPdf}
          disabled={isGenerating}
          style={{
            backgroundColor: isGenerating ? '#ccc' : '#007bff',
            color: '#fff',
            padding: '10px 20px',
            border: 'none',
            borderRadius: '5px',
            cursor: isGenerating ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          {isGenerating ? 'Generating PDF...' : 'Download Invoice'}
        </button>
        {onFinalize ? (
          <button
            onClick={onFinalize}
            disabled={isFinalizing}
            style={{
              backgroundColor: isFinalizing ? '#d1d5db' : '#0f766e',
              color: '#fff',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '5px',
              cursor: isFinalizing ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
            }}
          >
            {isFinalizing ? 'Issuing...' : 'Issue Invoice'}
          </button>
        ) : null}
      </div>

      {/* PDF Preview Area (This is what gets converted to PDF) */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', justifyContent: 'center' }}>
        <div ref={printRef} style={pageStyle()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #e5e7eb', paddingBottom: 14 }}>
            <div>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Company logo"
                  style={{ height: 34, objectFit: 'contain', maxWidth: 180 }}
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 0.6 }}>
                  {invoiceData.brandingCompanyName}
                </div>
              )}
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Logistics Platform</div>
              <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700 }}>{invoiceData.clientName}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Commercial Invoice</div>
              <div style={{ marginTop: 6, color: '#2563eb', fontWeight: 700 }}>#{invoiceData.invoiceNo}</div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#4b5563' }}>
                <div><strong>Issued</strong> {invoiceData.issuedOn}</div>
                <div><strong>Due</strong> {invoiceData.dueOn}</div>
              </div>
            </div>
          </div>

          <div
            style={{
              position: 'absolute',
              top: '45%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(-33deg)',
              fontSize: 86,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: 10,
              color: 'rgba(15,23,42,0.05)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {invoiceData.brandingCompanyName}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16, position: 'relative', zIndex: 1 }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Billing Entity</div>
              {invoiceData.billingAddressLines.map((line, idx) => (
                <div key={`billing-${idx}`} style={{ fontSize: 13, marginTop: idx === 0 ? 8 : 4 }}>{line}</div>
              ))}
            </div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Shipment Target</div>
              {invoiceData.shipmentTargetLines.map((line, idx) => (
                <div key={`target-${idx}`} style={{ fontSize: 13, marginTop: idx === 0 ? 8 : 4 }}>{line}</div>
              ))}
            </div>
          </div>

          <table style={{ width: '100%', marginTop: 18, borderCollapse: 'collapse', position: 'relative', zIndex: 1 }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: '10px', borderBottom: '1px solid #d1d5db', fontSize: 12 }}>Description</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #d1d5db', fontSize: 12 }}>Route / Context</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #d1d5db', fontSize: 12 }}>Reference Date</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #d1d5db', textAlign: 'right', fontSize: 12 }}>Value (INR)</th>
              </tr>
            </thead>
            <tbody>
              {invoiceData.items.map((item) => (
                <tr key={item.tripId}>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eef2f7' }}>
                    <div style={{ fontWeight: 700 }}>{item.tripId}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>Primary Logistics</div>
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eef2f7' }}>
                    <div>{item.route}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{item.context}</div>
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eef2f7' }}>{item.date}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eef2f7', textAlign: 'right' }}>{formatCurrency(item.amount)}</td>
                </tr>
              ))}
              {invoiceData.additionalCharges.map((charge, index) => (
                <tr key={`charge-${index}`}>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eef2f7', fontWeight: 600 }}>{charge.description}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eef2f7', color: '#6b7280' }}>Additional charge</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eef2f7' }}>-</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eef2f7', textAlign: 'right' }}>{formatCurrency(charge.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, position: 'relative', zIndex: 1 }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Bank Transfer Details</div>
              {invoiceData.bankDetailsLines.map((line, idx) => (
                <div key={`bank-${idx}`} style={{ fontSize: 12, color: '#4b5563', marginTop: idx === 0 ? 8 : 4 }}>{line}</div>
              ))}
              <div style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
                This is a system generated document. All transactions are backed by proof of delivery and verified by the match engine.
              </div>
            </div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>Subtotal</span>
                <strong>{formatCurrency(invoiceData.subtotal)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>{invoiceData.taxLabel}</span>
                <strong>{formatCurrency(invoiceData.taxAmount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #d1d5db', paddingTop: 10, fontSize: 16 }}>
                <strong>Grand Total</strong>
                <strong>{formatCurrency(invoiceData.grandTotal)}</strong>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 12, position: 'relative', zIndex: 1 }}>
            <div>
              <div><strong>Payment Terms:</strong> {invoiceData.paymentTerms}</div>
              <div style={{ marginTop: 4 }}><strong>LR Scope:</strong> {invoiceData.lrScope}</div>
              <div style={{ marginTop: 4 }}><strong>Asset Fleet:</strong> {invoiceData.assetFleet}</div>
              {invoiceData.notes ? <div style={{ marginTop: 4 }}><strong>Notes:</strong> {invoiceData.notes}</div> : null}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700 }}>Issuer Signature</div>
              <div style={{ color: '#6b7280', marginTop: 4 }}>Autosigned Ledger</div>
              <div style={{ color: '#6b7280', marginTop: 4 }}>PAN: AAACLS9910Q</div>
              <div style={{ color: '#6b7280' }}>GSTIN: 27AAACLS9910Q1ZS</div>
            </div>
          </div>

          <div style={{ marginTop: 20, borderTop: '1px solid #e5e7eb', paddingTop: 10, fontSize: 11, color: '#6b7280', display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
            <span>Sovereign Match Engine</span>
            <span>PAGE 1 OF 1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

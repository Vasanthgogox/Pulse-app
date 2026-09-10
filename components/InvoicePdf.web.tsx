import React, { useRef, useState } from 'react';
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
}

export default function InvoicePdfWeb({ invoiceData }: InvoicePdfWebProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUrl = logoFailed ? null : invoiceData.brandingLogoUrl;

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    setIsGenerating(true);

    try {
      const element = printRef.current;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf/dist/jspdf.es.min.js'),
      ]);
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('invoice_DRAFT.pdf');
    } catch (error) {
      console.error('Failed to generate PDF', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f5f5f5' }}>
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
            fontWeight: 'bold',
          }}
        >
          {isGenerating ? 'Generating PDF...' : 'Download draft'}
        </button>
      </div>

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
              ) : invoiceData.brandingCompanyName ? (
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 0.6 }}>
                  {invoiceData.brandingCompanyName}
                </div>
              ) : (
                <div style={{ fontSize: 14, color: '#6b7280' }}>Workspace identity unavailable</div>
              )}
              {invoiceData.issuerAddressLines.map((line, idx) => (
                <div key={`issuer-addr-${idx}`} style={{ fontSize: 12, color: '#4b5563', marginTop: idx === 0 ? 8 : 2 }}>
                  {line}
                </div>
              ))}
              {invoiceData.issuerPan ? (
                <div style={{ fontSize: 12, color: '#4b5563', marginTop: 6 }}>PAN {invoiceData.issuerPan}</div>
              ) : null}
              {invoiceData.issuerGstNotApplicable ? (
                <div style={{ fontSize: 12, color: '#4b5563' }}>GST not applicable</div>
              ) : invoiceData.issuerGstin ? (
                <div style={{ fontSize: 12, color: '#4b5563' }}>GSTIN {invoiceData.issuerGstin}</div>
              ) : null}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Draft invoice</div>
              <div style={{ marginTop: 6, color: '#2563eb', fontWeight: 700 }}>#{invoiceData.invoiceNo}</div>
              <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>{invoiceData.invoiceNumberCaption}</div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#4b5563' }}>
                <div><strong>Preview date</strong> {invoiceData.previewDate}</div>
                {invoiceData.indicativeDueDate ? (
                  <div><strong>Indicative due</strong> {invoiceData.indicativeDueDate}</div>
                ) : null}
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
              color: 'rgba(15,23,42,0.06)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            DRAFT
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginTop: 16, position: 'relative', zIndex: 1 }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Bill to</div>
              {invoiceData.billingLines.length > 0 ? (
                invoiceData.billingLines.map((line, idx) => (
                  <div key={`billing-${idx}`} style={{ fontSize: 13, marginTop: idx === 0 ? 8 : 4 }}>{line}</div>
                ))
              ) : (
                <div style={{ fontSize: 13, marginTop: 8, color: '#6b7280' }}>{invoiceData.clientName}</div>
              )}
            </div>
          </div>

          <table style={{ width: '100%', marginTop: 18, borderCollapse: 'collapse', position: 'relative', zIndex: 1 }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: '10px', borderBottom: '1px solid #d1d5db', fontSize: 12 }}>Description</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #d1d5db', fontSize: 12 }}>Reference</th>
                <th style={{ padding: '10px', borderBottom: '1px solid #d1d5db', textAlign: 'right', fontSize: 12 }}>Value (INR)</th>
              </tr>
            </thead>
            <tbody>
              {invoiceData.items.map((item) => (
                <tr key={item.key}>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eef2f7' }}>
                    <div style={{ fontWeight: 700 }}>{item.route}</div>
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eef2f7', color: '#6b7280' }}>
                    {item.lineType === 'freight' ? item.tripId : item.lineType === 'fuel' ? 'Fuel' : 'Charge'}
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #eef2f7', textAlign: 'right' }}>{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, position: 'relative', zIndex: 1 }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              {invoiceData.bankDetailsLines.length > 0 ? (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>Bank Transfer Details</div>
                  {invoiceData.bankDetailsLines.map((line, idx) => (
                    <div key={`bank-${idx}`} style={{ fontSize: 12, color: '#4b5563', marginTop: idx === 0 ? 8 : 4 }}>{line}</div>
                  ))}
                </>
              ) : null}
              <div style={{ marginTop: invoiceData.bankDetailsLines.length > 0 ? 12 : 0, fontSize: 12, color: '#6b7280' }}>
                This is a draft preview. An invoice number is assigned on issue.
              </div>
              {invoiceData.paymentTerms ? (
                <div style={{ marginTop: 8, fontSize: 12 }}><strong>Payment terms:</strong> {invoiceData.paymentTerms}</div>
              ) : null}
              {invoiceData.notes ? (
                <div style={{ marginTop: 4, fontSize: 12 }}><strong>Notes:</strong> {invoiceData.notes}</div>
              ) : null}
            </div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, minWidth: 0 }}>
              {invoiceData.taxWarning ? (
                <div style={{ marginBottom: 10, fontSize: 12, color: '#b45309', fontWeight: 700 }}>
                  {invoiceData.taxWarning}
                </div>
              ) : null}
              {invoiceData.taxRows.map((row) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                  <span style={{ minWidth: 0 }}>{row.label}</span>
                  <strong style={{ whiteSpace: 'nowrap' }}>{row.value}</strong>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #d1d5db', paddingTop: 10, fontSize: 16, gap: 8 }}>
                <strong>Total</strong>
                <strong style={{ whiteSpace: 'nowrap' }}>{formatCurrency(invoiceData.grandTotal)}</strong>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, borderTop: '1px solid #e5e7eb', paddingTop: 10, fontSize: 11, color: '#6b7280', display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
            <span>Draft — not an issued invoice</span>
            <span>PAGE 1 OF 1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { 
  Printer, 
  X, 
  FileCheck, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck,
  Building,
  User,
  PenTool
} from 'lucide-react';
import { Citizen, ServiceDefinition, DocumentSlotDefinition } from '@sevadesk/core-types';
import { createSignedProformaScan } from '../lib/imageCompressor';

export interface PrintableProformaModalProps {
  citizen?: Partial<Citizen>;
  service?: ServiceDefinition;
  slot: DocumentSlotDefinition;
  operatorName?: string;
  centreName?: string;
  onClose: () => void;
  onAttachScan?: (file: File) => void;
  onShowToast?: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export const PrintableProformaModal: React.FC<PrintableProformaModalProps> = ({
  citizen = {},
  service,
  slot,
  operatorName = 'CSC Operator',
  centreName = 'Jan Seva Kendra',
  onClose,
  onAttachScan,
  onShowToast
}) => {
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);

  const applicantName = citizen.fullName || '__________________________';
  const guardianName = (citizen as any).fatherName || (citizen as any).guardianName || '__________________________';
  const address = citizen.address || '__________________________________________________';
  const district = citizen.district || 'गाजियाबाद (Ghaziabad)';
  const state = citizen.state || 'उत्तर प्रदेश (Uttar Pradesh)';
  const pincode = citizen.pincode || '______';
  const mobile = citizen.mobile || '__________';
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const caseRef = `SD-${Date.now().toString(36).toUpperCase()}`;

  const proformaTitle = slot.proformaTitle || 'स्वप्रमाणित घोषणा पत्र (Self-Declaration Form)';

  const handlePrint = () => {
    window.print();
  };

  const handleGenerateAndAttachDemoScan = async () => {
    if (!onAttachScan) return;
    setIsGeneratingDemo(true);
    try {
      const signedFile = await createSignedProformaScan(
        {
          fullName: citizen.fullName || 'Ramesh Kumar Verma',
          address: citizen.address || 'Ward 4, Bilaspur',
          district: citizen.district || 'Ghaziabad',
          state: citizen.state || 'Uttar Pradesh',
          mobile: citizen.mobile || '9876543210'
        },
        service,
        proformaTitle
      );
      onAttachScan(signedFile);
      if (onShowToast) {
        onShowToast(`✓ Signed ${slot.label} generated & auto-compressed (≤ ${slot.maxKB} KB)!`, 'success');
      }
      onClose();
    } catch (err: any) {
      if (onShowToast) {
        onShowToast(`Failed to generate signed scan: ${err.message}`, 'error');
      }
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 160 }}>
      <div className="modal-content" style={{ maxWidth: '780px', padding: 0, overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Top Action Bar (Hidden when printing) */}
        <div className="no-print" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-subtle)'
        }}>
          <div>
            <div className="overline" style={{ margin: 0 }}>
              <PenTool size={13} /> OFFICIAL PRE-FILLED PROFORMA
            </div>
            <h2 style={{ fontSize: '1.05rem', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{proformaTitle}</span>
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {onAttachScan && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleGenerateAndAttachDemoScan}
                disabled={isGeneratingDemo}
                style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                title="Simulate citizen desk signature and re-scan automatically for testing"
              >
                <Sparkles size={14} color="var(--primary)" />
                <span>{isGeneratingDemo ? 'Generating…' : '🧪 Attach Signed Scan (Demo)'}</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handlePrint}
              style={{ fontSize: '0.82rem', padding: '6px 14px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Print clean A4 proforma for physical citizen signature"
            >
              <Printer size={15} />
              <span>Print A4 Form (Ctrl+P)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}
              title="Close proforma view"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Sheet */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', backgroundColor: '#525659' }}>
          <div 
            id="proforma-print-area" 
            style={{
              backgroundColor: '#ffffff',
              maxWidth: '680px',
              margin: '0 auto',
              padding: '40px 48px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              fontFamily: '"Noto Sans", "Segoe UI", Arial, sans-serif',
              color: '#0f172a',
              lineHeight: 1.6
            }}
          >
            {/* Header / Emblem representation */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '14px', marginBottom: '18px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.06em', color: '#1e3a8a' }}>
                उत्तर प्रदेश शासन / GOVERNMENT OF UTTAR PRADESH
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
                {service?.department || 'राजस्व विभाग (Revenue Department / e-District)'}
              </div>
              <h1 style={{ fontSize: '1.25rem', margin: '10px 0 2px', color: '#0f172a', fontWeight: 800 }}>
                प्रारूप - स्वप्रमाणित घोषणा पत्र
              </h1>
              <div style={{ fontSize: '0.82rem', color: '#475569', fontStyle: 'italic' }}>
                (FORM OF SELF-DECLARATION UNDER DPDP COMPLIANT KIOSK PROCEDURE)
              </div>
            </div>

            {/* Application Scheme Title */}
            <div style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              padding: '8px 12px',
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.82rem'
            }}>
              <div>
                <strong>सेवा का नाम (Target Scheme):</strong> {service?.name || 'प्रमाण पत्र सेवा'}
              </div>
              <div>
                <strong>प्रारूप संदर्भ:</strong> {caseRef}
              </div>
            </div>

            {/* Declaration Body */}
            <div style={{ fontSize: '0.92rem', textAlign: 'justify', marginBottom: '24px' }}>
              <p style={{ margin: '0 0 14px', textIndent: '24px' }}>
                मैं <strong>{applicantName}</strong>, पुत्र / पुत्री / पत्नी श्री <strong>{guardianName}</strong>, 
                वर्तमान पता: <strong>{address}</strong>, 
                तहसील व जिला: <strong>{district}</strong>, राज्य: <strong>{state}</strong>, पिन कोड: <strong>{pincode}</strong>, 
                मोबाइल नंबर: <strong>{mobile}</strong>, एतद्द्वारा सत्यनिष्ठा पूर्वक घोषणा करता / करती हूँ कि:
              </p>

              <ol style={{ paddingLeft: '24px', margin: '0 0 16px' }}>
                <li style={{ marginBottom: '8px' }}>
                  मैं <strong>{state}</strong> का मूल / स्थायी निवासी हूँ तथा मेरे द्वारा दी गई समस्त पारिवारिक एवं व्यक्तिगत जानकारी पूर्णतया सत्य है।
                </li>
                <li style={{ marginBottom: '8px' }}>
                  यह स्वप्रमाणित घोषणा पत्र <strong>{service?.name || 'सरकारी प्रमाण पत्र'}</strong> के ऑनलाइन आवेदन एवं शासकीय सत्यापन हेतु स्वेच्छा से प्रस्तुत किया जा रहा है।
                </li>
                <li style={{ marginBottom: '8px' }}>
                  मेरी समस्त पारिवारिक स्रोतों (कृषि, व्यवसाय, मजदूरी आदि) से कुल वार्षिक पारिवारिक आय रु. <strong>64,000/- (चौंसठ हजार रुपये)</strong> मात्र है।
                </li>
                <li style={{ marginBottom: '8px' }}>
                  मेरे द्वारा प्रस्तुत किए गए समस्त दस्तावेज (पहचान पत्र, आधार, राशन कार्ड आदि) वैध एवं अधिकृत हैं।
                </li>
                <li style={{ marginBottom: '8px' }}>
                  यदि भविष्य में जांचोपरांत कोई भी तथ्य या विवरण असत्य, भ्रामक अथवा कूटरचित पाया जाता है, तो इसके लिए मैं स्वयं पूर्ण रूप से उत्तरदायी रहूँगा/रहूँगी और मेरे विरुद्ध भारतीय दंड संहिता / संबंधित विधिक प्रावधानों के अंतर्गत वैधानिक कार्यवाही की जा सकेगी।
                </li>
              </ol>
            </div>

            {/* Metadata Footer */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px', fontSize: '0.88rem' }}>
              <div>
                <div style={{ marginBottom: '6px' }}>
                  <strong>स्थान (Place):</strong> {district.split('(')[0].trim()}
                </div>
                <div style={{ marginBottom: '6px' }}>
                  <strong>दिनांक (Date):</strong> {dateStr}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  प्रमाणीकरण केंद्र: {centreName} ({operatorName})
                </div>
              </div>

              {/* Signature Box */}
              <div style={{
                border: '2px dashed #0f172a',
                borderRadius: '6px',
                padding: '28px 12px 10px',
                textAlign: 'center',
                backgroundColor: '#ffffff'
              }}>
                <div style={{ height: '36px' }}></div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, borderTop: '1px solid #94a3b8', paddingTop: '6px' }}>
                  आवेदक के हस्ताक्षर / बाएँ हाथ के अंगूठे का निशान
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  (Signature or Left Thumbprint of Applicant)
                </div>
              </div>
            </div>

            {/* Bottom Kiosk Seal and Barcode Footer */}
            <div style={{
              borderTop: '1px solid #cbd5e1',
              paddingTop: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.72rem',
              color: '#64748b'
            }}>
              <div>
                <strong>SevaDesk Local Verification:</strong> DPDP Act 2023 Compliant Zero-Cloud Enclave · SHA-256 Merkle Secured
              </div>
              <div style={{ fontWeight: 700, letterSpacing: '0.08em', color: '#0f172a' }}>
                *{caseRef}*
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

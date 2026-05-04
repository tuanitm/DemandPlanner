'use client';

import { useState, useRef } from 'react';
import { Upload, Download, FileSpreadsheet, X, CheckCircle, AlertCircle } from 'lucide-react';
import Modal from './Modal';
import { useToast } from './Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ImportExcelProps {
  entityKey: string;
  entityLabel: string;
  onImportComplete: () => void;
}

export default function ImportExcel({ entityKey, entityLabel, onImportComplete }: ImportExcelProps) {
  const { addToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ rows_imported: number; errors: string[] } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('dp_token') : null;

  const handleDownloadTemplate = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/master-data/import/template/${entityKey}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${entityKey}_template.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      addToast('success', 'Template downloaded', `${entityLabel} template saved`);
    } catch (e) {
      addToast('error', 'Download failed', (e as Error).message);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setResult(null);
    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await fetch(`${API_BASE}/api/master-data/import/upload/${entityKey}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(err.detail || 'Upload failed');
      }
      const data = await res.json();
      setResult(data);
      if (data.rows_imported > 0) {
        addToast('success', `Imported ${data.rows_imported} records`, `${entityLabel} data imported successfully`);
        onImportComplete();
      }
    } catch (e) {
      addToast('error', 'Import failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      addToast('error', 'Invalid file', 'Only .xlsx files are supported');
      return;
    }
    setSelectedFile(file);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
  };

  const openModal = () => {
    setShowModal(true);
    setSelectedFile(null);
    setResult(null);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedFile(null);
    setResult(null);
  };

  return (
    <>
      <button className="btn btn-secondary" onClick={openModal}>
        <Upload size={16} /> Import Excel
      </button>

      <Modal isOpen={showModal} onClose={closeModal} title={`Import ${entityLabel}`} size="md"
        footer={
          result ? (
            <button className="btn btn-primary" onClick={closeModal}>Done</button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={!selectedFile || uploading}>
                {uploading && <span className="loading-spinner" />}
                Import
              </button>
            </>
          )
        }
      >
        {/* Step 1: Download Template */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
          padding: 'var(--space-4)', background: 'var(--color-bg-glass)',
          borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-5)',
          border: '1px solid var(--color-border)',
        }}>
          <FileSpreadsheet size={24} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Step 1: Download Template</div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Get the Excel template with correct columns and format
            </div>
          </div>
          <button className="btn btn-secondary" style={{ flexShrink: 0 }} onClick={handleDownloadTemplate}>
            <Download size={14} /> Template
          </button>
        </div>

        {/* Step 2: Upload File */}
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
            Step 2: Upload filled Excel file
          </div>

          {!result && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-8) var(--space-6)',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: dragActive ? 'var(--color-accent-glow)' : 'transparent',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />
              {selectedFile ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)' }}>
                  <FileSpreadsheet size={20} style={{ color: 'var(--color-success)' }} />
                  <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{selectedFile.name}</span>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={32} style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }} />
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                    Drag & drop your Excel file here, or <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>browse</span>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
                    Supports .xlsx files only
                  </div>
                </>
              )}
            </div>
          )}

          {/* Import Result */}
          {result && (
            <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                padding: 'var(--space-4)',
                background: result.rows_imported > 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                borderBottom: result.errors.length > 0 ? '1px solid var(--color-border)' : 'none',
              }}>
                {result.rows_imported > 0
                  ? <CheckCircle size={20} style={{ color: 'var(--color-success)' }} />
                  : <AlertCircle size={20} style={{ color: 'var(--color-danger)' }} />
                }
                <span style={{ fontWeight: 600 }}>
                  {result.rows_imported} records imported successfully
                </span>
              </div>
              {result.errors.length > 0 && (
                <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'rgba(239, 68, 68, 0.05)' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-danger)', marginBottom: 'var(--space-2)' }}>
                    Errors ({result.errors.length}):
                  </div>
                  {result.errors.map((err, i) => (
                    <div key={i} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 2 }}>
                      {err}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

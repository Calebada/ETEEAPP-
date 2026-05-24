import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { documentApi } from '../lib/api';
import { Loader2, Download, ExternalLink, FileText, AlertCircle } from 'lucide-react';

export const DocumentPreviewModal = ({ document: doc, open, onClose, focusSubject = null }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [focusedEvidence, setFocusedEvidence] = useState(null);

  const inferMimeType = () => {
    const mimeType = doc?.mime_type?.trim();
    if (mimeType) return mimeType;

    const source = `${doc?.file_name || ''} ${doc?.file_path || ''}`.toLowerCase();
    if (source.endsWith('.pdf') || source.includes('.pdf')) return 'application/pdf';
    if (source.match(/\.(png|jpe?g|gif|webp|bmp|svg)$/)) return 'image/*';
    return 'application/octet-stream';
  };

  useEffect(() => {
    if (open && doc) {
      loadDocument();
    }
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc?.id]);

  useEffect(() => {
    if (!doc || doc.document_type !== 'tor' || !focusSubject) {
      setFocusedEvidence(null);
      return;
    }

    const normalize = (value) => (value || '').toString().toUpperCase().replace(/\s|-/g, '');
    const targetCode = normalize(focusSubject.code);
    const targetTitle = (focusSubject.title || '').toLowerCase().trim();

    try {
      const parsed = JSON.parse(doc.extracted_text || '[]');
      if (!Array.isArray(parsed)) {
        setFocusedEvidence(null);
        return;
      }

      let best = null;
      for (const row of parsed) {
        const rowCode = normalize(row?.code);
        const rowTitle = (row?.title || '').toLowerCase().trim();
        const codeMatch = !!targetCode && rowCode === targetCode;
        const titleMatch = !!targetTitle && !!rowTitle && (rowTitle.includes(targetTitle) || targetTitle.includes(rowTitle));
        if (codeMatch || titleMatch) {
          best = row;
          if (codeMatch) break;
        }
      }

      setFocusedEvidence(best);
    } catch {
      setFocusedEvidence(null);
    }
  }, [doc, focusSubject]);

  const loadDocument = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await documentApi.preview(doc.id);
      const blob = new Blob([response.data], { type: inferMimeType() });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load document');
    }
    setLoading(false);
  };

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = window.document.createElement('a');
    a.href = blobUrl;
    a.download = doc.file_name;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
  };

  const handleOpenInNewTab = () => {
    if (blobUrl) {
      window.open(blobUrl, '_blank');
    }
  };

  if (!doc) return null;

  const mimeType = inferMimeType();
  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  const hasFocus = !!focusSubject && doc.document_type === 'tor';
  const searchTerm = focusSubject?.code || focusSubject?.title || '';
  const pdfSrc = isPdf && blobUrl && searchTerm
    ? `${blobUrl}#search=${encodeURIComponent(searchTerm)}`
    : blobUrl;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col" data-testid="document-preview-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4 pr-8">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-5 h-5 text-maroon flex-shrink-0" />
              <div className="min-w-0">
                <div className="font-serif truncate">{doc.file_name}</div>
                <div className="text-xs font-normal text-gray-500 capitalize">
                  {doc.document_type?.replace('_', ' ')} · {Math.round((doc.file_size || 0) / 1024)} KB
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {blobUrl && (
                <>
                  <Button size="sm" variant="outline" onClick={handleOpenInNewTab} data-testid="open-new-tab-btn">
                    <ExternalLink className="w-4 h-4 mr-1" />
                    New Tab
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDownload} data-testid="download-doc-btn">
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </Button>
                </>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="relative flex-1 overflow-auto bg-gray-50 rounded-lg min-h-[60vh] flex items-center justify-center">
          {loading && (
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-maroon mx-auto mb-2" />
              <p className="text-sm text-gray-600">Loading document...</p>
            </div>
          )}

          {error && (
            <div className="text-center p-8">
              <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
              <p className="text-sm text-red-700 font-medium mb-1">Failed to load document</p>
              <p className="text-xs text-gray-600">{error}</p>
            </div>
          )}

          {!loading && !error && blobUrl && (
            <>
              {hasFocus && (
                <div className="absolute top-0 left-0 right-0 z-10 p-3">
                  <div className="rounded-md border border-maroon/30 bg-white/95 p-3 shadow-sm">
                    <div className="text-xs font-semibold text-maroon mb-1">Focused TOR Subject</div>
                    <div className="text-xs text-gray-700">
                      {focusSubject.code ? `${focusSubject.code} - ` : ''}
                      {focusSubject.title || 'Subject'}
                      {focusSubject.grade ? ` (Grade: ${focusSubject.grade})` : ''}
                    </div>
                    {focusedEvidence ? (
                      <div className="mt-2 text-[11px] text-gray-700 bg-maroon/5 border border-maroon/20 rounded p-2">
                        Extracted row: {focusedEvidence.code || 'N/A'} - {focusedEvidence.title || 'N/A'} | Grade: {focusedEvidence.grade || 'N/A'} | Units: {focusedEvidence.units ?? 'N/A'}
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                        Exact OCR row was not found, but preview is focused using subject search.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isImage && (
                <img 
                  src={blobUrl} 
                  alt={doc.file_name} 
                  className={`max-w-full max-h-[70vh] object-contain ${hasFocus ? 'mt-20' : ''}`}
                  data-testid="preview-image"
                />
              )}
              {isPdf && (
                <iframe 
                  src={pdfSrc} 
                  title={doc.file_name}
                  className={`w-full h-[70vh] border-0 ${hasFocus ? 'mt-20' : ''}`}
                  data-testid="preview-pdf"
                />
              )}
              {!isImage && !isPdf && (
                <div className="text-center p-8">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-700 mb-3">
                    Preview not available for this file type
                  </p>
                  <Button onClick={handleDownload} className="bg-maroon hover:bg-maroon-dark text-white">
                    <Download className="w-4 h-4 mr-2" />
                    Download to view
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {doc.extracted_text && doc.document_type === 'tor' && (
          <div className="mt-3 p-3 bg-maroon/5 border border-maroon/20 rounded-lg max-h-32 overflow-auto">
            <div className="text-xs font-semibold text-maroon mb-1">AI-Extracted Subjects:</div>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
              {(() => {
                try {
                  const parsed = JSON.parse(doc.extracted_text);
                  return JSON.stringify(parsed, null, 2).slice(0, 500);
                } catch {
                  return doc.extracted_text.slice(0, 500);
                }
              })()}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

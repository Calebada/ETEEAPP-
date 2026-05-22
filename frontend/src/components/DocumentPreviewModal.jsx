import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { documentApi } from '../lib/api';
import { Loader2, Download, ExternalLink, FileText, AlertCircle } from 'lucide-react';

export const DocumentPreviewModal = ({ document: doc, open, onClose }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const loadDocument = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await documentApi.preview(doc.id);
      const blob = new Blob([response.data], { type: doc.mime_type || 'application/octet-stream' });
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

  const isImage = doc.mime_type?.startsWith('image/');
  const isPdf = doc.mime_type === 'application/pdf';

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

        <div className="flex-1 overflow-auto bg-gray-50 rounded-lg min-h-[60vh] flex items-center justify-center">
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
              {isImage && (
                <img 
                  src={blobUrl} 
                  alt={doc.file_name} 
                  className="max-w-full max-h-[70vh] object-contain"
                  data-testid="preview-image"
                />
              )}
              {isPdf && (
                <iframe 
                  src={blobUrl} 
                  title={doc.file_name}
                  className="w-full h-[70vh] border-0"
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

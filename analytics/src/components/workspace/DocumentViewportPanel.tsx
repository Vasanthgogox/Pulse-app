import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  XCircle,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAdmin } from '@/context/AdminDataProvider';
import {
  canInlinePreview,
  createDocumentSignedUrl,
  isImageMime,
  isPdfMime,
} from '@/lib/kycDocuments';
import { formatDateTime } from '@/lib/utils';
import type { BusinessDocument, DocumentStatus } from '@/types/admin';

type StatusCfg = {
  variant: 'success' | 'destructive' | 'warning' | 'secondary' | 'info';
  icon: React.FC<{ className?: string }>;
};

const DOC_STATUS: Record<DocumentStatus, StatusCfg> = {
  Valid: { variant: 'success', icon: CheckCircle },
  Pending: { variant: 'info', icon: Clock },
  Flagged: { variant: 'destructive', icon: AlertTriangle },
  Unreadable: { variant: 'warning', icon: AlertTriangle },
  Missing: { variant: 'secondary', icon: XCircle },
  Expired: { variant: 'destructive', icon: Clock },
};

function formatMimeLabel(mime: string): string {
  if (isPdfMime(mime)) return 'PDF';
  if (mime === 'image/jpeg') return 'JPEG';
  if (mime === 'image/png') return 'PNG';
  if (mime === 'image/webp') return 'WEBP';
  if (mime.includes('heic') || mime.includes('heif')) return 'HEIC';
  return mime || 'File';
}

function DocTabTrigger({ doc }: { doc: BusinessDocument }) {
  const { variant } = DOC_STATUS[doc.status];
  return (
    <span className="flex items-center gap-1.5">
      <span className="truncate max-w-[120px]">{doc.type}</span>
      {doc.required ? (
        <Badge variant="info" appearance="light" size="xs">
          Required
        </Badge>
      ) : doc.required === false ? (
        <Badge variant="secondary" appearance="light" size="xs">
          Optional
        </Badge>
      ) : null}
      <Badge variant={variant} appearance="light" size="xs">
        {doc.status}
      </Badge>
    </span>
  );
}

function DocViewer({ doc }: { doc: BusinessDocument }) {
  const cfg = DOC_STATUS[doc.status];
  const StatusIcon = cfg.icon;

  const [previewUrl, setPreviewUrl] = useState(doc.url);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const mime = doc.mime_type || 'application/octet-stream';
  const isImage = isImageMime(mime);
  const isPdf = isPdfMime(mime);
  const inlineOk = canInlinePreview(mime);
  const hasFile = !!doc.storage_path || !!previewUrl;
  const canPreview = hasFile && doc.status !== 'Missing';

  // Keep preview URL in sync when switching orgs / docs
  useEffect(() => {
    setPreviewUrl(doc.url);
    setLoadError(null);
    setZoom(1);
  }, [doc.id, doc.url]);

  const refreshUrl = useCallback(async () => {
    if (!doc.storage_path) {
      setLoadError('No storage path on this document — cannot refresh preview.');
      return;
    }
    setRefreshing(true);
    setLoadError(null);
    const { url, error } = await createDocumentSignedUrl(doc.storage_path);
    setRefreshing(false);
    if (error || !url) {
      setLoadError(error ?? 'Could not create a signed preview URL.');
      return;
    }
    setPreviewUrl(url);
  }, [doc.storage_path]);

  // Auto-refresh once if we have a path but no URL (signing failed on batch load)
  useEffect(() => {
    if (doc.status === 'Missing') return;
    if (previewUrl || !doc.storage_path) return;
    void refreshUrl();
  }, [doc.status, doc.storage_path, previewUrl, refreshUrl]);

  const openExternal = () => {
    if (previewUrl) window.open(previewUrl, '_blank', 'noopener,noreferrer');
  };

  const downloadFile = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = doc.file_name || `${doc.type}.${isPdf ? 'pdf' : 'bin'}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Metadata + actions */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-foreground">
            {doc.file_name || 'No file'}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-muted-foreground">
            <span className="font-medium uppercase tracking-wide">{formatMimeLabel(mime)}</span>
            {doc.size_kb > 0 ? (
              <span>
                {doc.size_kb >= 1000
                  ? `${(doc.size_kb / 1024).toFixed(1)} MB`
                  : `${doc.size_kb} KB`}
              </span>
            ) : null}
            {doc.page_count ? (
              <span>
                {doc.page_count} page{doc.page_count > 1 ? 's' : ''}
              </span>
            ) : null}
            {doc.uploaded_at ? <span>Uploaded {formatDateTime(doc.uploaded_at)}</span> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isImage && canPreview && previewUrl ? (
            <>
              <Button
                variant="outline"
                size="sm"
                mode="icon"
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                title="Zoom out"
              >
                <ZoomOut className="size-3.5" />
              </Button>
              <span className="min-w-[40px] text-center text-[10px] tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="outline"
                size="sm"
                mode="icon"
                onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                title="Zoom in"
              >
                <ZoomIn className="size-3.5" />
              </Button>
            </>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshUrl()}
            disabled={!doc.storage_path || refreshing}
            title="Refresh signed URL"
          >
            {refreshing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openExternal}
            disabled={!previewUrl}
            title="Open in new tab"
          >
            <ExternalLink className="size-3.5" />
            Open
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadFile}
            disabled={!previewUrl}
            title="Download original file"
          >
            <Download className="size-3.5" />
            Download
          </Button>
        </div>
      </div>

      {/* Flag / status banner */}
      {doc.status !== 'Valid' ? (
        <div
          className={[
            'flex items-start gap-2.5 rounded-lg border px-3 py-2.5',
            doc.status === 'Missing'
              ? 'border-border bg-muted/40 text-muted-foreground'
              : doc.status === 'Unreadable' || doc.status === 'Pending'
                ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400',
          ].join(' ')}
        >
          <StatusIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="text-xs font-semibold">{doc.status}</p>
            {doc.flag_reason ? (
              <p className="mt-0.5 text-[11px] leading-relaxed">{doc.flag_reason}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Preview surface */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-muted/30">
        {doc.status === 'Missing' || !canPreview ? (
          <div className="flex h-full min-h-[360px] items-center justify-center p-6">
            <div className="text-center">
              <XCircle className="mx-auto size-10 text-muted-foreground/30" />
              <p className="mt-2 text-sm font-medium text-muted-foreground">Document not uploaded</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                Applicant has not provided this document
              </p>
            </div>
          </div>
        ) : refreshing && !previewUrl ? (
          <div className="flex h-full min-h-[360px] items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Preparing preview…
          </div>
        ) : loadError && !previewUrl ? (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="size-8 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-foreground">Preview unavailable</p>
              <p className="mt-1 max-w-sm text-[11px] text-muted-foreground">{loadError}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refreshUrl()}>
              <RefreshCw className="size-3.5" />
              Retry signed URL
            </Button>
          </div>
        ) : !inlineOk ? (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 p-8 text-center">
            <FileText className="size-10 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-semibold text-foreground">{doc.file_name}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatMimeLabel(mime)} files keep their original format. Open or download to review
                — browsers cannot render this type inline.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={openExternal} disabled={!previewUrl}>
                <ExternalLink className="size-3.5" />
                Open original
              </Button>
              <Button variant="outline" size="sm" onClick={downloadFile} disabled={!previewUrl}>
                <Download className="size-3.5" />
                Download
              </Button>
            </div>
          </div>
        ) : isImage && previewUrl ? (
          <div className="flex h-full min-h-[360px] items-center justify-center overflow-auto bg-black/[0.03] p-4 dark:bg-black/20">
            <img
              src={previewUrl}
              alt={doc.file_name}
              onError={() => setLoadError('Image failed to load — the signed URL may have expired.')}
              onLoad={() => setLoadError(null)}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              className="max-h-full max-w-full rounded-md object-contain shadow-sm transition-transform"
            />
          </div>
        ) : isPdf && previewUrl ? (
          <iframe
            key={previewUrl}
            title={doc.file_name}
            src={`${previewUrl}#view=FitH`}
            className="absolute inset-0 h-full w-full bg-white"
            onError={() => setLoadError('PDF failed to load — try Refresh or Open.')}
          />
        ) : (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 p-8">
            <FileText className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{doc.file_name}</p>
            <Button variant="outline" size="sm" onClick={() => void refreshUrl()}>
              <RefreshCw className="size-3.5" />
              Load preview
            </Button>
          </div>
        )}

        {loadError && previewUrl ? (
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 shadow-sm dark:bg-amber-950/60 dark:text-amber-300">
            <span className="min-w-0 truncate">{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void refreshUrl()}>
              Refresh
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DocumentViewportPanel() {
  const { selectedApp } = useAdmin();

  const documents = selectedApp?.documents ?? [];
  const defaultId = useMemo(() => {
    const firstReal = documents.find((d) => d.status !== 'Missing');
    return (firstReal ?? documents[0])?.id ?? '';
  }, [documents]);

  if (!selectedApp) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">No application selected</p>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <FileText className="mx-auto size-10 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No documents uploaded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Document Viewport
            </p>
            <p className="text-[11px] text-muted-foreground">
              Preview stays in the original upload format — refresh if the signed link expires.
            </p>
          </div>
          <Badge variant="secondary" appearance="light" size="sm">
            {documents.filter((d) => d.required && d.status !== 'Missing').length} /{' '}
            {Math.max(documents.filter((d) => d.required).length, 1)} required
          </Badge>
        </div>
      </div>

      <Tabs
        key={`${selectedApp.id}-${defaultId}`}
        defaultValue={defaultId}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 px-3">
          <TabsList variant="line" size="sm" className="w-full justify-start overflow-x-auto">
            {documents.map((doc) => (
              <TabsTrigger key={doc.id} value={doc.id}>
                <DocTabTrigger doc={doc} />
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {documents.map((doc) => (
          <TabsContent
            key={doc.id}
            value={doc.id}
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden p-3 data-[state=inactive]:hidden"
          >
            <DocViewer doc={doc} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

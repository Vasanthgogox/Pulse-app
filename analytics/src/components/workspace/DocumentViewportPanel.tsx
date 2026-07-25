/**
 * Verification › Document viewport — in-panel preview of KYC attachments.
 *
 * Preview URLs are short-lived signed storage links. We keep `storage_path` on
 * each document so the operator can re-sign and preview again without leaving
 * the console (and without losing the original upload format).
 */
import { useCallback, useEffect, useState } from 'react';
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
import { formatDateTime } from '@/lib/utils';
import { kycPreviewKind, signKycDocumentUrl } from '@/lib/kycDocuments';
import type { BusinessDocument, DocumentStatus } from '@/types/admin';

type StatusCfg = {
  variant: 'success' | 'destructive' | 'warning' | 'secondary' | 'info';
  icon: React.FC<{ className?: string }>;
};

const DOC_STATUS: Record<DocumentStatus, StatusCfg> = {
  Valid: { variant: 'success', icon: CheckCircle },
  Flagged: { variant: 'destructive', icon: AlertTriangle },
  Unreadable: { variant: 'warning', icon: AlertTriangle },
  Missing: { variant: 'secondary', icon: XCircle },
  Expired: { variant: 'destructive', icon: Clock },
};

function DocTabTrigger({ doc }: { doc: BusinessDocument }) {
  const { variant } = DOC_STATUS[doc.status];
  return (
    <span className="flex items-center gap-1.5">
      <span className="truncate max-w-[140px]">{doc.type}</span>
      <Badge variant={variant} appearance="light" size="xs">
        {doc.status}
      </Badge>
    </span>
  );
}

function DocViewer({ doc }: { doc: BusinessDocument }) {
  const cfg = DOC_STATUS[doc.status];
  const StatusIcon = cfg.icon;
  const kind = kycPreviewKind(doc);

  const [previewUrl, setPreviewUrl] = useState(doc.url);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  // Reset local preview state when the operator switches document / org.
  useEffect(() => {
    setPreviewUrl(doc.url);
    setLoadError(null);
    setZoom(1);
  }, [doc.id, doc.url]);

  const refreshSignedUrl = useCallback(async () => {
    if (!doc.storage_path) {
      setLoadError('This attachment has no storage path — cannot refresh preview.');
      return;
    }
    setRefreshing(true);
    setLoadError(null);
    const { url, error } = await signKycDocumentUrl(doc.storage_path);
    setRefreshing(false);
    if (!url) {
      setLoadError(error ?? 'Could not refresh preview URL.');
      return;
    }
    setPreviewUrl(url);
  }, [doc.storage_path]);

  // Auto-refresh once if the document has a path but no usable URL (signed URL failed at load).
  useEffect(() => {
    if (doc.status === 'Missing') return;
    if (previewUrl) return;
    if (!doc.storage_path) return;
    void refreshSignedUrl();
  }, [doc.status, doc.storage_path, previewUrl, refreshSignedUrl]);

  const canPreview = doc.status !== 'Missing' && (!!previewUrl || !!doc.storage_path);
  const sizeLabel =
    doc.size_kb > 0
      ? doc.size_kb >= 1000
        ? `${(doc.size_kb / 1024).toFixed(1)} MB`
        : `${doc.size_kb} KB`
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Metadata + actions */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-foreground">
            {doc.file_name || 'No file'}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <span className="uppercase tracking-wide">{kind}</span>
            {sizeLabel ? <span>{sizeLabel}</span> : null}
            {doc.page_count ? (
              <span>
                {doc.page_count} page{doc.page_count > 1 ? 's' : ''}
              </span>
            ) : null}
            {doc.uploaded_at ? <span>Uploaded {formatDateTime(doc.uploaded_at)}</span> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {kind === 'image' && canPreview && previewUrl ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                mode="icon"
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                disabled={zoom <= 0.5}
                title="Zoom out"
              >
                <ZoomOut className="size-3.5" />
              </Button>
              <span className="w-10 text-center text-[10px] tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="sm"
                mode="icon"
                onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                disabled={zoom >= 3}
                title="Zoom in"
              >
                <ZoomIn className="size-3.5" />
              </Button>
            </>
          ) : null}

          {doc.storage_path ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshSignedUrl()}
              disabled={refreshing}
              title="Refresh signed preview URL"
            >
              {refreshing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Refresh
            </Button>
          ) : null}

          {previewUrl ? (
            <>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1.25 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-accent-foreground shadow-xs hover:bg-accent"
              >
                <ExternalLink className="size-3.5 opacity-60" />
                Open
              </a>
              <a
                href={previewUrl}
                download={doc.file_name || undefined}
                className="inline-flex h-7 items-center gap-1.25 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-accent-foreground shadow-xs hover:bg-accent"
              >
                <Download className="size-3.5 opacity-60" />
                Download
              </a>
            </>
          ) : null}
        </div>
      </div>

      {/* Status banner */}
      {doc.status !== 'Valid' ? (
        <div
          className={[
            'flex items-start gap-2.5 rounded-lg border px-3 py-2.5',
            doc.status === 'Missing'
              ? 'border-border bg-muted/40 text-muted-foreground'
              : doc.status === 'Unreadable'
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

      {loadError ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{loadError}</p>
            {doc.storage_path ? (
              <button
                type="button"
                onClick={() => void refreshSignedUrl()}
                className="mt-1 font-semibold underline-offset-2 hover:underline"
              >
                Try refreshing the preview link
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Preview surface — original file format rendered in-panel */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-muted/30">
        {doc.status === 'Missing' || !canPreview ? (
          <div className="flex h-full min-h-[320px] items-center justify-center p-6">
            <div className="text-center">
              <XCircle className="mx-auto size-10 text-muted-foreground/30" />
              <p className="mt-2 text-sm font-medium text-muted-foreground">Document not uploaded</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                Applicant has not provided this document
              </p>
            </div>
          </div>
        ) : refreshing && !previewUrl ? (
          <div className="flex h-full min-h-[320px] items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Preparing preview…
          </div>
        ) : !previewUrl ? (
          <div className="flex h-full min-h-[320px] items-center justify-center p-6">
            <div className="text-center">
              <FileText className="mx-auto size-10 text-muted-foreground/40" />
              <p className="mt-2 text-sm font-medium text-muted-foreground">Preview unavailable</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                Refresh the signed link or open the file once a URL is available.
              </p>
            </div>
          </div>
        ) : kind === 'image' ? (
          <div className="flex h-full min-h-[360px] items-center justify-center overflow-auto bg-black/[0.03] p-4 dark:bg-black/20">
            <img
              key={previewUrl}
              src={previewUrl}
              alt={doc.file_name}
              className="max-h-full rounded-md object-contain shadow-sm transition-transform origin-center"
              style={{ transform: `scale(${zoom})`, maxWidth: `${100 / zoom}%` }}
              onError={() => {
                setLoadError('Image failed to load — the signed URL may have expired.');
              }}
            />
          </div>
        ) : kind === 'pdf' ? (
          <iframe
            key={previewUrl}
            title={doc.file_name}
            src={`${previewUrl}#view=FitH`}
            className="h-full w-full min-h-[480px] bg-white"
            onError={() => {
              setLoadError('PDF failed to load — the signed URL may have expired.');
            }}
          />
        ) : (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-8">
            <FileText className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{doc.file_name}</p>
            <p className="text-[11px] text-muted-foreground/70">
              This file type cannot be embedded. Open or download to review the original attachment.
            </p>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Open original file
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function DocumentViewportPanel() {
  const { selectedApp } = useAdmin();

  if (!selectedApp) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">No application selected</p>
      </div>
    );
  }

  const { documents } = selectedApp;
  const uploadedCount = documents.filter((d) => d.status !== 'Missing').length;

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
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Document review
          </p>
          <p className="text-[11px] text-muted-foreground">
            {uploadedCount} of {documents.length} required slots uploaded · preview keeps original format
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <Tabs defaultValue={documents[0].id} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TabsList
            variant="line"
            size="sm"
            className="w-full shrink-0 justify-start overflow-x-auto"
          >
            {documents.map((doc) => (
              <TabsTrigger key={doc.id} value={doc.id}>
                <DocTabTrigger doc={doc} />
              </TabsTrigger>
            ))}
          </TabsList>

          {documents.map((doc) => (
            <TabsContent
              key={doc.id}
              value={doc.id}
              className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden !mt-3"
            >
              <DocViewer doc={doc} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

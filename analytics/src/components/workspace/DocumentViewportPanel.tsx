import { FileText, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useKyc } from '@/context/KycDataProvider';
import { formatDateTime } from '@/lib/utils';
import type { BusinessDocument, DocumentStatus } from '@/types/kyc';

// ─── Status config ────────────────────────────────────────────────────────────

type StatusCfg = { variant: 'success' | 'destructive' | 'warning' | 'secondary' | 'info'; icon: React.FC<{ className?: string }> };

const DOC_STATUS: Record<DocumentStatus, StatusCfg> = {
  Valid:       { variant: 'success',     icon: CheckCircle },
  Flagged:     { variant: 'destructive', icon: AlertTriangle },
  Unreadable:  { variant: 'warning',     icon: AlertTriangle },
  Missing:     { variant: 'secondary',   icon: XCircle },
  Expired:     { variant: 'destructive', icon: Clock },
};

// ─── Document tab label ───────────────────────────────────────────────────────

function DocTabTrigger({ doc }: { doc: BusinessDocument }) {
  const { variant } = DOC_STATUS[doc.status];
  return (
    <span className="flex items-center gap-1.5">
      {doc.type}
      <Badge variant={variant} appearance="light" size="xs">
        {doc.status}
      </Badge>
    </span>
  );
}

// ─── Document viewer ──────────────────────────────────────────────────────────

function DocViewer({ doc }: { doc: BusinessDocument }) {
  const cfg = DOC_STATUS[doc.status];
  const StatusIcon = cfg.icon;
  const isImage = doc.mime_type.startsWith('image/');
  const isPdf = doc.mime_type === 'application/pdf';
  const canPreview = !!doc.url && doc.status !== 'Missing';

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Metadata bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <span className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{doc.file_name || 'No file'}</span>
        </span>
        {doc.size_kb > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {doc.size_kb >= 1000 ? `${(doc.size_kb / 1024).toFixed(1)} MB` : `${doc.size_kb} KB`}
          </span>
        )}
        {doc.page_count && (
          <span className="text-[11px] text-muted-foreground">{doc.page_count} page{doc.page_count > 1 ? 's' : ''}</span>
        )}
        {doc.uploaded_at && (
          <span className="text-[11px] text-muted-foreground ml-auto">
            Uploaded {formatDateTime(doc.uploaded_at)}
          </span>
        )}
      </div>

      {/* Flag/status banner */}
      {doc.status !== 'Valid' && (
        <div className={[
          'flex items-start gap-2.5 rounded-lg border px-3 py-2.5',
          doc.status === 'Missing'
            ? 'border-border bg-muted/40 text-muted-foreground'
            : doc.status === 'Unreadable'
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400'
            : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400',
        ].join(' ')}>
          <StatusIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="text-xs font-semibold">{doc.status}</p>
            {doc.flag_reason && (
              <p className="mt-0.5 text-[11px] leading-relaxed">{doc.flag_reason}</p>
            )}
          </div>
        </div>
      )}

      {/* Document preview */}
      <div className="flex-1 rounded-xl border border-border bg-muted/30 overflow-hidden min-h-[320px]">
        {doc.status === 'Missing' || !canPreview ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <XCircle className="mx-auto size-10 text-muted-foreground/30" />
              <p className="mt-2 text-sm font-medium text-muted-foreground">Document not uploaded</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">Applicant has not provided this document</p>
            </div>
          </div>
        ) : isImage ? (
          <div className="flex h-full items-center justify-center bg-black/5 p-4">
            <img
              src={doc.url}
              alt={doc.file_name}
              className="max-h-full max-w-full rounded-md object-contain shadow-sm"
            />
          </div>
        ) : isPdf ? (
          <iframe
            title={doc.file_name}
            src={doc.url}
            className="h-full w-full min-h-[480px] bg-white"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
            <FileText className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{doc.file_name}</p>
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Open document
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function DocumentViewportPanel() {
  const { selectedApp } = useKyc();

  if (!selectedApp) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">No application selected</p>
      </div>
    );
  }

  const { documents } = selectedApp;

  if (documents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <FileText className="mx-auto size-10 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No documents uploaded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <Tabs defaultValue={documents[0].id} className="flex flex-1 flex-col overflow-hidden">
        <TabsList variant="line" size="sm" className="w-full justify-start overflow-x-auto shrink-0">
          {documents.map(doc => (
            <TabsTrigger key={doc.id} value={doc.id}>
              <DocTabTrigger doc={doc} />
            </TabsTrigger>
          ))}
        </TabsList>

        {documents.map(doc => (
          <TabsContent key={doc.id} value={doc.id} className="flex-1 overflow-hidden !mt-3">
            <DocViewer doc={doc} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

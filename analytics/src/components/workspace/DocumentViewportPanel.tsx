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

      {/* Mock document preview area */}
      <div className="flex-1 rounded-xl border border-border bg-muted/30 overflow-hidden">
        {doc.status === 'Missing' ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <XCircle className="mx-auto size-10 text-muted-foreground/30" />
              <p className="mt-2 text-sm font-medium text-muted-foreground">Document not uploaded</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">Applicant has not provided this document</p>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
            {/* Simulated PDF page stack */}
            <div className="relative">
              {(doc.page_count ?? 1) > 1 && (
                <>
                  <div className="absolute -right-1.5 -top-1.5 h-48 w-36 rounded border border-border bg-card shadow-sm opacity-50" />
                  <div className="absolute -right-0.5 -top-0.5 h-48 w-36 rounded border border-border bg-card shadow-sm opacity-75" />
                </>
              )}
              <div className={[
                'relative flex h-48 w-36 flex-col items-center justify-center gap-2 rounded border bg-white shadow-md',
                doc.status === 'Unreadable' ? 'opacity-40' : '',
                doc.status === 'Expired' ? 'border-red-300' : 'border-border',
              ].join(' ')}>
                <FileText className={[
                  'size-10',
                  doc.status === 'Flagged' ? 'text-red-400' : 'text-muted-foreground/40',
                ].join(' ')} />
                <span className="text-[10px] text-muted-foreground/60 font-mono uppercase tracking-wide">
                  {doc.mime_type.split('/')[1]}
                </span>
                {doc.status === 'Unreadable' && (
                  <div className="absolute inset-0 flex items-center justify-center rounded">
                    <div className="rotate-[-15deg] rounded border border-amber-400 bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">
                      Unreadable
                    </div>
                  </div>
                )}
                {doc.status === 'Expired' && (
                  <div className="absolute inset-0 flex items-center justify-center rounded">
                    <div className="rotate-[-15deg] rounded border border-red-400 bg-red-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-700">
                      Expired
                    </div>
                  </div>
                )}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {doc.file_name}
              {doc.page_count && doc.page_count > 1 && ` · ${doc.page_count} pages`}
            </p>

            <p className="max-w-[200px] text-center text-[10px] text-muted-foreground/60">
              In production, the document renders here via signed URL or embedded PDF viewer.
            </p>
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

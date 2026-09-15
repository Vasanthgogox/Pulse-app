import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import {
  CommerceOpsAllocatePanel,
} from '@/components/commerce/CommerceOpsAllocatePanel';
import {
  CommerceOpsDetailNav,
  CommerceOpsIndentPanel,
  CommerceOpsOverviewPanel,
  CommerceOpsTripPanel,
  type CommerceOpsDetailTab,
} from '@/components/commerce/CommerceOpsDetailPanels';
import { useExecution } from '@/context/ExecutionProvider';
import { useOrganization } from '@/context/OrganizationProvider';
import {
  findCommerceExecutionByIndentId,
  findCommerceExecutionByPlanId,
  findCommerceExecutionByTripId,
} from '@/lib/commerce-ops-hub';
import {
  fetchCommerceIndentQuotes,
  type CommerceIndentQuote,
} from '@/lib/services/commerce-ops-detail.service';
import {
  fetchCommerceExecutionByLookup,
  type CommerceExecution,
} from '@/lib/services/execution-visibility.service';

function DetailFrame({
  exec,
  tab,
  title,
  quotes,
  quotesError,
}: {
  exec: CommerceExecution;
  tab: CommerceOpsDetailTab;
  title: string;
  quotes: CommerceIndentQuote[];
  quotesError: string | null;
}) {
  const backToOps = exec.planStatus === 'published';
  const backHref = backToOps ? '/execution' : '/execution-plans';
  const backLabel = backToOps ? 'Operations' : 'Plan History';
  return (
    <div className="container-fluid pb-8 max-w-3xl">
      <PageToolbar
        title={title}
        breadcrumb={['Pulse Commerce', backToOps ? 'Operations' : 'Plan History', title]}
        description="Same indent, plan, and trip as Pulse Core — viewed in Commerce."
        showDate={false}
        actions={
          <Link to={backHref} className="inline-flex items-center gap-1.5 text-2sm text-primary font-medium min-h-11">
            <ArrowLeft className="size-3.5" /> {backLabel}
          </Link>
        }
      />
      <CommerceOpsDetailNav exec={exec} tab={tab} />
      {tab === 'overview' && <CommerceOpsOverviewPanel exec={exec} />}
      {tab === 'indent' && (
        <CommerceOpsIndentPanel exec={exec} quotes={quotes} quotesError={quotesError} />
      )}
      {tab === 'trip' && <CommerceOpsTripPanel exec={exec} />}
      {tab === 'allocate' && <CommerceOpsAllocatePanel exec={exec} />}
    </div>
  );
}

function LoadingOrMissing({
  loaded,
  error,
  missing,
}: {
  loaded: boolean;
  error: boolean;
  missing: boolean;
}) {
  if (!loaded) {
    return (
      <div className="container-fluid pb-8">
        <p className="text-2sm text-muted-foreground">Loading fulfillment…</p>
      </div>
    );
  }
  if (error && missing) {
    return (
      <div className="container-fluid pb-8">
        <p className="text-2sm text-destructive">Could not load fulfillment from Pulse Core.</p>
        <Link to="/execution" className="text-sm text-primary mt-2 inline-block">← Operations</Link>
      </div>
    );
  }
  if (missing) {
    return (
      <div className="container-fluid pb-8">
        <p className="font-medium">Not found</p>
        <p className="text-2sm text-muted-foreground mt-1">This execution is not in the published Operations list.</p>
        <Link to="/execution" className="text-sm text-primary mt-2 inline-block">← Operations</Link>
      </div>
    );
  }
  return null;
}

function useIndentQuotes(indentId: string | undefined, enabled: boolean) {
  const [quotes, setQuotes] = useState<CommerceIndentQuote[]>([]);
  const [quotesError, setQuotesError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !indentId) {
      setQuotes([]);
      setQuotesError(null);
      return;
    }
    let cancelled = false;
    fetchCommerceIndentQuotes(indentId)
      .then(rows => {
        if (!cancelled) {
          setQuotes(rows);
          setQuotesError(null);
        }
      })
      .catch(err => {
        if (!cancelled) setQuotesError(err instanceof Error ? err.message : 'Could not load bids');
      });
    return () => { cancelled = true; };
  }, [indentId, enabled]);

  return { quotes, quotesError };
}

function usePlanningOrOpsExecution(lookup: { planId?: string; indentId?: string }) {
  const org = useOrganization();
  const { commerceExecutions, commerceExecutionsLoaded, commerceExecutionsError } = useExecution();
  const listed = lookup.indentId
    ? findCommerceExecutionByIndentId(commerceExecutions, lookup.indentId)
    : findCommerceExecutionByPlanId(commerceExecutions, lookup.planId);
  const listedId = listed?.executionPlanId ?? null;
  const [remote, setRemote] = useState<{ ready: boolean; exec: CommerceExecution | null }>({
    ready: false,
    exec: null,
  });

  useEffect(() => {
    if (listed) {
      setRemote({ ready: true, exec: listed });
      return;
    }
    if (!commerceExecutionsLoaded) return;
    const orgId = org.platformOrganization?.id;
    if (!orgId || (!lookup.planId && !lookup.indentId)) {
      setRemote({ ready: true, exec: null });
      return;
    }
    let cancelled = false;
    setRemote({ ready: false, exec: null });
    fetchCommerceExecutionByLookup(orgId, lookup)
      .then(exec => { if (!cancelled) setRemote({ ready: true, exec }); })
      .catch(() => { if (!cancelled) setRemote({ ready: true, exec: null }); });
    return () => { cancelled = true; };
  }, [
    listedId,
    lookup.planId,
    lookup.indentId,
    commerceExecutionsLoaded,
    org.platformOrganization?.id,
  ]);

  return {
    exec: listed ?? remote.exec,
    loaded: Boolean(listed) || remote.ready,
    error: commerceExecutionsError,
  };
}

export function ExecutionPlanStatusPage() {
  const { planId } = useParams<{ planId: string }>();
  const resolved = usePlanningOrOpsExecution({ planId });
  const quotesState = useIndentQuotes(resolved.exec?.indent?.id, Boolean(resolved.exec?.indent));
  const gate = LoadingOrMissing({
    loaded: resolved.loaded,
    error: resolved.error,
    missing: !resolved.exec,
  });
  if (gate || !resolved.exec) return gate;
  return (
    <DetailFrame
      exec={resolved.exec}
      tab="overview"
      title={resolved.exec.planNumber}
      quotes={quotesState.quotes}
      quotesError={quotesState.quotesError}
    />
  );
}

export function CommerceIndentDetailPage() {
  const { indentId } = useParams<{ indentId: string }>();
  const resolved = usePlanningOrOpsExecution({ indentId });
  const quotesState = useIndentQuotes(resolved.exec?.indent?.id, true);
  const gate = LoadingOrMissing({
    loaded: resolved.loaded,
    error: resolved.error,
    missing: !resolved.exec,
  });
  if (gate || !resolved.exec) return gate;
  return (
    <DetailFrame
      exec={resolved.exec}
      tab="indent"
      title={resolved.exec.indent?.indentNumber ?? 'Indent'}
      quotes={quotesState.quotes}
      quotesError={quotesState.quotesError}
    />
  );
}

export function CommerceTripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { commerceExecutions, commerceExecutionsLoaded, commerceExecutionsError } = useExecution();
  const exec = findCommerceExecutionByTripId(commerceExecutions, tripId);
  const quotesState = useIndentQuotes(exec?.indent?.id, false);
  const gate = LoadingOrMissing({
    loaded: commerceExecutionsLoaded,
    error: commerceExecutionsError,
    missing: !exec,
  });
  if (gate || !exec) return gate;
  return (
    <DetailFrame
      exec={exec}
      tab="trip"
      title={exec.trip?.tripNumber ?? 'Trip'}
      quotes={quotesState.quotes}
      quotesError={quotesState.quotesError}
    />
  );
}

export function CommerceAllocatePage() {
  const { indentId } = useParams<{ indentId: string }>();
  const { commerceExecutions, commerceExecutionsLoaded, commerceExecutionsError } = useExecution();
  const exec = findCommerceExecutionByIndentId(commerceExecutions, indentId);
  const quotesState = useIndentQuotes(exec?.indent?.id, false);
  const gate = LoadingOrMissing({
    loaded: commerceExecutionsLoaded,
    error: commerceExecutionsError,
    missing: !exec,
  });
  if (gate || !exec) return gate;
  return (
    <DetailFrame
      exec={exec}
      tab="allocate"
      title={`Allocate ${exec.indent?.indentNumber ?? ''}`}
      quotes={quotesState.quotes}
      quotesError={quotesState.quotesError}
    />
  );
}

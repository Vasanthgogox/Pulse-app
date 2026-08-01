/**
 * Align story / opportunity LOAD visibility with Find Work indent logic.
 *
 * If an org is only my supplier (they carry my loads — I am their client),
 * their freight broadcasts must not appear as bid opportunities for me.
 * Orgs that are also my clients (they give load) still surface.
 * Unrelated / Reach-only authors are unaffected.
 */

/**
 * Should a feed post be shown to the viewing org?
 *
 * Order matters. Sponsored posts are audience-gated server-side by
 * `get_network_feed` (via `reach_campaign_targets`), so they clear every local
 * relationship rule — those rules exist to filter the organic feed, and
 * applying them to paid reach silently discards what the customer bought.
 *
 * `partnerBooksReady` guards the remaining rules: they read the clients and
 * suppliers books, which load in queries separate from the feed. Before those
 * settle, an empty book means "not loaded yet", not "no partners" — treating
 * the two alike is what makes a story appear on first paint and then vanish.
 */
export function shouldShowFeedPostForOrg(opts: {
  authorOrgId: string | null | undefined;
  viewerOrgId: string | null | undefined;
  postType: string | null | undefined;
  isSponsored: boolean | null | undefined;
  /** False while the clients/suppliers books are still in flight. */
  partnerBooksReady: boolean;
  supplierOrgIds: ReadonlySet<string>;
  clientOrgIds: ReadonlySet<string>;
  partnerOrgIds: ReadonlySet<string>;
}): boolean {
  const authorOrgId = (opts.authorOrgId ?? "").trim();
  const viewerOrgId = (opts.viewerOrgId ?? "").trim();
  if (!authorOrgId || !viewerOrgId) return false;
  if (authorOrgId === viewerOrgId) return true;
  if (opts.isSponsored) return true;
  if (!opts.partnerBooksReady) return false;
  if (
    opts.postType === "LOAD" &&
    shouldHideLoadStoryFromAuthor({
      authorOrgId,
      supplierOrgIds: opts.supplierOrgIds,
      clientOrgIds: opts.clientOrgIds,
    })
  ) {
    return false;
  }
  return opts.partnerOrgIds.has(authorOrgId);
}

export function shouldHideLoadStoryFromAuthor(opts: {
  authorOrgId: string | null | undefined;
  /** linked_organization_id values from my integrated suppliers book */
  supplierOrgIds: ReadonlySet<string>;
  /** linked_organization_id values from my integrated clients book */
  clientOrgIds: ReadonlySet<string>;
}): boolean {
  const id = (opts.authorOrgId ?? "").trim();
  if (!id) return true;
  if (!opts.supplierOrgIds.has(id)) return false;
  // Dual-role counterparty: still a shipper I can bid for.
  if (opts.clientOrgIds.has(id)) return false;
  return true;
}

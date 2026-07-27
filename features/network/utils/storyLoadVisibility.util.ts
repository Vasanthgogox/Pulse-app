/**
 * Align story / opportunity LOAD visibility with Find Work indent logic.
 *
 * If an org is only my supplier (they carry my loads — I am their client),
 * their freight broadcasts must not appear as bid opportunities for me.
 * Orgs that are also my clients (they give load) still surface.
 * Unrelated / Reach-only authors are unaffected.
 */

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

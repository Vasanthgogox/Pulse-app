import {
  HUB_GRID_DEFAULT_PAGE_SIZE,
  type HubGridPageSize,
} from "@/components/hub/hubGridCardLayout";
import { useEffect, useMemo, useState } from "react";

export function useHubGridPagination<T>(items: T[], resetKey: string) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] =
    useState<HubGridPageSize>(HUB_GRID_DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [resetKey, pageSize]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageSafe = Math.min(page, Math.max(0, totalPages - 1));

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(0, totalPages - 1)));
  }, [items.length, pageSize, totalPages]);

  const paginatedItems = useMemo(() => {
    const start = pageSafe * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, pageSafe, pageSize]);

  return {
    page: pageSafe,
    pageSize,
    setPage,
    setPageSize,
    pageSafe,
    totalPages,
    paginatedItems,
    totalItems: items.length,
  };
}

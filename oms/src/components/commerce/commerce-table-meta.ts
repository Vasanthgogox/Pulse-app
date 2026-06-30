/** Shared column meta for CommerceDataTable alignment */
export const commerceTableMeta = {
  select: {
    headerClassName: 'w-11 min-w-[2.75rem] max-w-[2.75rem] px-2 text-center [&:has([role=checkbox])]:pe-0',
    cellClassName:   'w-11 min-w-[2.75rem] max-w-[2.75rem] px-2 text-center align-middle [&:has([role=checkbox])]:pe-0',
  },
  primary: {
    headerClassName: 'min-w-[11rem]',
    cellClassName:   'align-middle min-w-[11rem]',
  },
  text: {
    cellClassName: 'align-middle min-w-0',
  },
  status: {
    headerClassName: 'whitespace-nowrap',
    cellClassName:   'align-middle whitespace-nowrap',
  },
  numeric: {
    headerClassName: 'text-right whitespace-nowrap',
    cellClassName:   'text-right align-middle tabular-nums whitespace-nowrap',
  },
  center: {
    headerClassName: 'text-center',
    cellClassName:   'text-center align-middle',
  },
  actions: {
    headerClassName: 'w-12 min-w-12 px-2 text-right',
    cellClassName:   'w-12 min-w-12 px-2 text-right align-middle',
  },
  actionsWide: {
    headerClassName: 'w-[8.5rem] min-w-[8.5rem] px-2 text-right',
    cellClassName:   'w-[8.5rem] min-w-[8.5rem] px-2 text-right align-middle',
  },
} as const;

export const SELECT_COLUMN_SIZE = 44;

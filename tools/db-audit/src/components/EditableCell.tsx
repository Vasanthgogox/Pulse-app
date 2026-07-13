import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuditAction } from '@/types';
import { useAudit } from '@/context/AuditContext';

type EditableField = keyof AuditAction;

interface EditableCellProps {
  actionId: string;
  field: EditableField;
  children: ReactNode;
  className?: string;
}

export function EditableCell({ actionId, field, children, className }: EditableCellProps) {
  const { actions, updateActionField } = useAudit();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const action = actions.find((a) => a.id === actionId);
  const rawVal = action?.[field];

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        try {
          inputRef.current.select();
        } catch {
          /* ignore */
        }
      }
    }
  }, [editing]);

  const commit = async (value: unknown) => {
    setEditing(false);
    try {
      await updateActionField(actionId, field, value);
    } catch {
      /* toast handled in context */
    }
  };

  const onDblClick = () => setEditing(true);

  if (!editing) {
    return (
      <td className={`editable ${className || ''}`} onDoubleClick={onDblClick}>
        {children}
      </td>
    );
  }

  if (field === 'priority') {
    return (
      <td className={`editable ${className || ''}`}>
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          className="cell-edit-input"
          defaultValue={String(rawVal || 'MEDIUM')}
          onBlur={(e) => void commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLSelectElement).blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        >
          {['HIGH', 'MEDIUM', 'LOW'].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </td>
    );
  }

  const isArr = field === 'ins_tables' || field === 'upd_tables' || field === 'del_tables';
  const displayVal = isArr
    ? Array.isArray(rawVal)
      ? rawVal.join(', ')
      : ''
    : String(rawVal ?? '');

  return (
    <td className={`editable ${className || ''}`}>
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        className="cell-edit-input"
        defaultValue={displayVal}
        placeholder={isArr ? 'table1, table2' : undefined}
        onBlur={(e) => {
          const val = e.target.value.trim();
          if (isArr) {
            void commit(val ? val.split(',').map((s) => s.trim()).filter(Boolean) : []);
          } else {
            void commit(val || null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    </td>
  );
}

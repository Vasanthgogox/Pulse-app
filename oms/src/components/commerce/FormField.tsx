export function FormField({
  label, value, onChange, placeholder, type = 'text', className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="text-2sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-input px-3 py-2 text-2sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </label>
  );
}

export function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 min-h-10">
      <span className="text-muted-foreground shrink-0 text-2xs w-24">{label}</span>
      <div className="text-2sm text-right min-w-0 flex-1">{children}</div>
    </div>
  );
}

export const inputClass =
  'w-full rounded-md border border-input px-3 py-2 text-2sm bg-background focus:outline-none focus:ring-1 focus:ring-ring';

export const selectClass = inputClass;

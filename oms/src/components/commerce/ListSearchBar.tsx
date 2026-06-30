import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ListSearchBarProps {
  value:         string;
  onChange:      (value: string) => void;
  placeholder?:  string;
  className?:    string;
  trailing?:     ReactNode;
}

export function ListSearchBar({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  trailing,
}: ListSearchBarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 mb-5', className)}>
      <div className="relative flex-1 min-w-[240px] max-w-xl">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9 pr-16"
        />
        <Badge variant="outline" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2">
          ⌘ K
        </Badge>
      </div>
      {trailing}
    </div>
  );
}

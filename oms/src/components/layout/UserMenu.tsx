import { Link } from 'react-router-dom';
import { ExternalLink, LogOut, Settings, UserRound } from 'lucide-react';
import { UserAvatar } from '@/components/layout/UserAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthProvider';
import { useUserProfile } from '@/hooks/useUserProfile';
import { buildPulseCoreUrl } from '@/lib/suite-auth';

type UserMenuProps = {
  align?: 'start' | 'end';
  showLabel?: boolean;
};

export function UserMenu({ align = 'end', showLabel = false }: UserMenuProps) {
  const { signOut } = useAuth();
  const { displayName, email, organizationName } = useUserProfile();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg p-1 hover:bg-accent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open account menu"
        >
          <UserAvatar size="sm" showRing />
          {showLabel && (
            <span className="hidden xl:block text-left max-w-[9rem]">
              <span className="block text-xs font-semibold truncate">{displayName}</span>
              <span className="block text-[10px] text-muted-foreground truncate">{organizationName}</span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-2.5 py-0.5">
            <UserAvatar size="md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{displayName}</p>
              <p className="text-[11px] text-muted-foreground truncate">{email}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile" className="cursor-pointer">
            <UserRound className="size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings" className="cursor-pointer">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => {
            window.location.assign(buildPulseCoreUrl('/'));
          }}
        >
          <ExternalLink className="size-4" />
          Switch to Pulse Core
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onSelect={() => {
            void signOut();
          }}
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

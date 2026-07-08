import { Link } from 'react-router-dom';
import { UserAvatar } from '@/components/layout/UserAvatar';
import { useUserProfile } from '@/hooks/useUserProfile';

export function SidebarAccount() {
  const { displayName, email } = useUserProfile();

  return (
    <Link
      to="/profile"
      className="flex items-center gap-2.5 overflow-hidden rounded-md px-1 py-1 -mx-1 hover:bg-accent transition-colors"
    >
      <UserAvatar size="sm" />
      <div className="default-logo overflow-hidden min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{displayName}</p>
        <p className="text-[10px] text-muted-foreground truncate">{email}</p>
      </div>
    </Link>
  );
}

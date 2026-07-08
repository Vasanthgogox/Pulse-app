import { cn } from '@/lib/utils';
import { avatarInitialsStyle } from '@/lib/user-avatar';
import { useUserProfile } from '@/hooks/useUserProfile';

type UserAvatarProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showRing?: boolean;
};

const SIZE_CLASS = {
  sm: 'size-8 text-[10px]',
  md: 'size-9 text-[11px]',
  lg: 'size-16 text-base',
} as const;

export function UserAvatar({ size = 'sm', className, showRing = false }: UserAvatarProps) {
  const { avatarUri, initials, colorSeed, isLoading } = useUserProfile();
  const palette = avatarInitialsStyle(colorSeed);

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-full font-bold flex items-center justify-center',
        SIZE_CLASS[size],
        showRing && 'ring-2 ring-background ring-offset-1 ring-offset-transparent',
        className,
      )}
      style={avatarUri ? undefined : palette}
      aria-hidden={isLoading}
    >
      {avatarUri ? (
        <img src={avatarUri} alt="" className="size-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

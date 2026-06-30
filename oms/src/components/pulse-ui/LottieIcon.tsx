import { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import { cn } from '@/lib/utils';
import { LOTTIE_ASSETS, type LottieAssetKey } from '@/lib/pulse-assets';

interface LottieIconProps {
  name:      LottieAssetKey;
  size?:     number;
  className?: string;
  loop?:     boolean;
}

export function LottieIcon({ name, size = 56, className, loop = true }: LottieIconProps) {
  const [data, setData] = useState<object | null>(null);

  useEffect(() => {
    let active = true;
    LOTTIE_ASSETS[name]()
      .then(mod => { if (active) setData((mod as { default: object }).default ?? mod); })
      .catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, [name]);

  if (!data) {
    return (
      <div
        className={cn('rounded-xl bg-muted/60 animate-pulse', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div className={cn('pointer-events-none select-none', className)} style={{ width: size, height: size }}>
      <Lottie animationData={data} loop={loop} style={{ width: size, height: size }} />
    </div>
  );
}

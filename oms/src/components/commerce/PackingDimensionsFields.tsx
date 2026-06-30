import { FormField } from '@/components/commerce/FormField';

interface PackingDimensionsFieldsProps {
  length:     string;
  width:      string;
  height:     string;
  onLength:   (v: string) => void;
  onWidth:    (v: string) => void;
  onHeight:   (v: string) => void;
  className?: string;
}

export function PackingDimensionsFields({
  length, width, height, onLength, onWidth, onHeight, className,
}: PackingDimensionsFieldsProps) {
  return (
    <div className={className}>
      <p className="text-2sm font-medium mb-1.5">Packing dimensions (cm)</p>
      <div className="grid grid-cols-3 gap-2">
        <FormField label="Length" value={length} onChange={onLength} type="number" placeholder="0" />
        <FormField label="Width" value={width} onChange={onWidth} type="number" placeholder="0" />
        <FormField label="Height" value={height} onChange={onHeight} type="number" placeholder="0" />
      </div>
    </div>
  );
}

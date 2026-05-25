import { TouchableOpacity, Text, View } from 'react-native';
import { reassignStyles as s } from './reassign.styles';

type Option<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (id: T) => void;
};

export function ReassignSegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: Props<T>) {
  return (
    <View style={s.segmentRow}>
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <TouchableOpacity
            key={opt.id}
            style={[s.segmentPill, active && s.segmentPillActive]}
            onPress={() => onChange(opt.id)}
            activeOpacity={0.85}
          >
            <Text style={[s.segmentText, active && s.segmentTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

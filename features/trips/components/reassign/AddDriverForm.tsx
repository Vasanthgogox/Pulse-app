import Theme from '@/constants/Theme';
import { createDriver } from '@/features/drivers/services/drivers.service';
import { formatMobileNumber } from '@/lib/format';
import { validatePhone } from '@/lib/phoneValidation';
import { useInvalidateDrivers } from '@/lib/queries/useDriversQuery';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { reassignStyles as s } from './reassign.styles';

type Props = {
  organizationId: string;
  onCreated: (driverId: string) => void;
};

export function AddDriverForm({ organizationId, onCreated }: Props) {
  const invalidateDrivers = useInvalidateDrivers();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName) {
      setError('Enter driver name.');
      return;
    }
    const phoneErr = validatePhone(trimmedPhone);
    if (phoneErr) {
      setError(phoneErr);
      return;
    }
    setSaving(true);
    setError(null);
    const { error: createErr, driver } = await createDriver(organizationId, {
      name: trimmedName,
      phone: trimmedPhone,
    });
    setSaving(false);
    if (createErr || !driver) {
      setError(createErr?.message ?? 'Could not add driver.');
      return;
    }
    invalidateDrivers(organizationId);
    onCreated(driver.id);
  }, [name, phone, organizationId, invalidateDrivers, onCreated]);

  return (
    <View style={s.form}>
      <View>
        <Text style={s.label}>Name</Text>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="Driver name"
          placeholderTextColor={Theme.textMuted}
          autoCapitalize="words"
        />
      </View>
      <View>
        <Text style={s.label}>Phone</Text>
        <TextInput
          style={s.input}
          value={phone}
          onChangeText={(v) => setPhone(formatMobileNumber(v))}
          placeholder="e.g. 98765 43210"
          placeholderTextColor={Theme.textMuted}
          keyboardType="phone-pad"
        />
      </View>
      {error ? <Text style={s.inlineError}>{error}</Text> : null}
      <TouchableOpacity
        style={[s.primaryBtn, saving && s.primaryBtnDisabled]}
        onPress={() => void submit()}
        disabled={saving}
        activeOpacity={0.9}
      >
        {saving ? (
          <ActivityIndicator color={Theme.textOnPrimary} />
        ) : (
          <Text style={s.primaryBtnText}>Add driver</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

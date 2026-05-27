import { LoadingIndicator } from '@/components/LoadingIndicator';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { C, styles } from '../businessSignUp.styles';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';

export function OrgStep({ flow }: { flow: SignUpFlow }) {
  return (
    <>
      <Text style={styles.pageTitle}>Your organization</Text>
      <Text style={styles.pageSub}>Enter your company name. We'll check if it already exists on Pulse.</Text>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, flow.step2Attempted && !flow.orgName.trim() ? styles.labelError : null]}>
          Company / Organization name <Text style={styles.req}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, flow.step2Attempted && !flow.orgName.trim() ? styles.inputError : null]}
          placeholder="e.g. GoGoX Logistics"
          placeholderTextColor={C.placeholder}
          value={flow.orgName}
          onChangeText={flow.setOrgName}
          autoCapitalize="words"
        />
        {flow.step2Attempted && !flow.orgName.trim()
          ? <Text style={styles.fieldError}>Enter your organization name.</Text>
          : null}
        {flow.orgCheck?.loading ? (
          <View style={styles.orgStatusRow}>
            <LoadingIndicator size="small" color={C.muted} />
            <Text style={styles.fieldHint}>Checking availability...</Text>
          </View>
        ) : flow.orgCheck?.taken ? (
          <View style={styles.orgExistsBanner}>
            <FontAwesome name="exclamation-triangle" size={14} color={C.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.orgExistsTitle}>Organization already registered</Text>
              <Text style={styles.orgExistsSub}>
                Ask their admin to invite you as a team member after you create your account.
              </Text>
            </View>
          </View>
        ) : (flow.orgCheck && !flow.orgCheck.taken && flow.orgName.trim()) ? (
          <View style={styles.orgAvailBanner}>
            <FontAwesome name="check-circle" size={14} color={C.accent} />
            <Text style={styles.orgAvailText}>Available — you'll create this organization</Text>
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, (!flow.orgName.trim() || flow.orgCheck?.loading) && styles.primaryBtnDisabled]}
        onPress={flow.continueOrgCheck}
        disabled={!flow.orgName.trim() || !!flow.orgCheck?.loading}
      >
        <Text style={styles.primaryBtnText}>
          {flow.orgCheck?.taken ? 'Continue to create account' : 'Continue'}
        </Text>
      </TouchableOpacity>
    </>
  );
}

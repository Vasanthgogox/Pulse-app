import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { C, styles } from '../businessSignUp.styles';
import { CityPicker } from '../components/CityPicker';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import {
  BUSINESS_TYPES,
  EMPLOYEE_COUNTS,
  FLEET_SIZES,
  MONTHLY_VOLUMES,
  OPERATING_MODELS,
} from '../signUpConstants';

export function CompanyDetailsStep({ flow }: { flow: SignUpFlow }) {
  return (
    <>
      <Text style={styles.pageTitle}>Company details</Text>
      <Text style={styles.pageSub}>
        Tell us about <Text style={styles.orgNameHighlight}>{flow.orgName}</Text>
      </Text>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>How do you operate? <Text style={styles.req}>*</Text></Text>
        <View style={styles.modelRow}>
          {OPERATING_MODELS.map(({ value, label, sub }) => (
            <TouchableOpacity
              key={value}
              style={[styles.modelCard, flow.operatingModel === value && styles.modelCardActive]}
              onPress={() => flow.setOperatingModel(value)}
            >
              <Text style={[styles.modelLabel, flow.operatingModel === value && styles.modelLabelActive]}>
                {label}
              </Text>
              <Text style={styles.modelSub}>{sub}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, flow.step3Attempted && flow.step3Errors.businessType ? styles.labelError : null]}>
          Business structure <Text style={styles.req}>*</Text>
        </Text>
        <View style={[styles.chipWrap, flow.step3Attempted && flow.step3Errors.businessType ? styles.chipGroupError : null]}>
          {BUSINESS_TYPES.map(({ value, label }) => (
            <TouchableOpacity
              key={value}
              style={[styles.chip, flow.businessType === value && styles.chipActive]}
              onPress={() => flow.setBusinessType(value)}
            >
              <Text style={[styles.chipText, flow.businessType === value && styles.chipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {flow.step3Attempted && flow.step3Errors.businessType
          ? <Text style={styles.fieldError}>{flow.step3Errors.businessType}</Text>
          : null}
      </View>

      {(flow.operatingModel === 'ASSET_BASED' || flow.operatingModel === 'HYBRID') ? (
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, flow.step3Attempted && flow.step3Errors.fleetSize ? styles.labelError : null]}>
            {flow.operatingModel === 'HYBRID' ? 'Own fleet size (trucks)' : 'Fleet size (trucks)'}
            {' '}<Text style={styles.req}>*</Text>
          </Text>
          <View style={[styles.chipWrap, flow.step3Attempted && flow.step3Errors.fleetSize ? styles.chipGroupError : null]}>
            {FLEET_SIZES.map(size => (
              <TouchableOpacity
                key={size}
                style={[styles.chip, flow.fleetSize === size && styles.chipActive]}
                onPress={() => flow.setFleetSize(size)}
              >
                <Text style={[styles.chipText, flow.fleetSize === size && styles.chipTextActive]}>{size}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {flow.step3Attempted && flow.step3Errors.fleetSize
            ? <Text style={styles.fieldError}>{flow.step3Errors.fleetSize}</Text>
            : null}
        </View>
      ) : null}

      {(flow.operatingModel === 'NON_ASSET' || flow.operatingModel === 'HYBRID') ? (
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, flow.step3Attempted && flow.step3Errors.monthlyVolume ? styles.labelError : null]}>
            Shipments arranged per month <Text style={styles.req}>*</Text>
          </Text>
          <View style={[styles.chipWrap, flow.step3Attempted && flow.step3Errors.monthlyVolume ? styles.chipGroupError : null]}>
            {MONTHLY_VOLUMES.map(({ value, label }) => (
              <TouchableOpacity
                key={value}
                style={[styles.chip, flow.monthlyVolume === value && styles.chipActive]}
                onPress={() => flow.setMonthlyVolume(value)}
              >
                <Text style={[styles.chipText, flow.monthlyVolume === value && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {flow.step3Attempted && flow.step3Errors.monthlyVolume
            ? <Text style={styles.fieldError}>{flow.step3Errors.monthlyVolume}</Text>
            : null}
        </View>
      ) : null}

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, flow.step3Attempted && flow.step3Errors.employeeCount ? styles.labelError : null]}>
          Number of employees <Text style={styles.req}>*</Text>
        </Text>
        <View style={[styles.chipWrap, flow.step3Attempted && flow.step3Errors.employeeCount ? styles.chipGroupError : null]}>
          {EMPLOYEE_COUNTS.map(count => (
            <TouchableOpacity
              key={count}
              style={[styles.chip, flow.employeeCount === count && styles.chipActive]}
              onPress={() => flow.setEmployeeCount(count)}
            >
              <Text style={[styles.chipText, flow.employeeCount === count && styles.chipTextActive]}>{count}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {flow.step3Attempted && flow.step3Errors.employeeCount
          ? <Text style={styles.fieldError}>{flow.step3Errors.employeeCount}</Text>
          : null}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Office address</Text>
        <TextInput
          style={styles.inputMultiline}
          placeholder="Building, street, area"
          placeholderTextColor={C.placeholder}
          value={flow.addressLine}
          onChangeText={flow.setAddressLine}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          autoCapitalize="sentences"
          returnKeyType="default"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, flow.step3Attempted && flow.step3Errors.city ? styles.labelError : null]}>
          City / District <Text style={styles.req}>*</Text>
        </Text>
        <CityPicker
          value={flow.selectedLocation}
          onChange={flow.setSelectedLocation}
          attempted={flow.step3Attempted}
          error={flow.step3Errors.city}
        />
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={flow.continueCompanyDetails}>
        <Text style={styles.primaryBtnText}>Continue</Text>
      </TouchableOpacity>
    </>
  );
}

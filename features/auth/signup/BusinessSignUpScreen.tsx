import { LoadingIndicator } from '@/components/LoadingIndicator';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { CityPicker } from './components/CityPicker';
import { MockOtpNotice } from './components/MockOtpNotice';
import { OtpInput } from './components/OtpInput';
import { C, styles } from './businessSignUp.styles';
import {
  BUSINESS_TYPES,
  EMPLOYEE_COUNTS,
  FLEET_SIZES,
  MONTHLY_VOLUMES,
  OPERATING_MODELS,
  STEP_LABELS,
  useBusinessSignUpFlow,
} from './hooks/useBusinessSignUpFlow';

export default function BusinessSignUpScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const flow = useBusinessSignUpFlow();

  const pageScrollBottomPad = insets.bottom + 220;

  const pageBody = (pageIndex: number, content: React.ReactNode) => (
    <View style={[styles.page, { width: flow.pageWidth }]}>
      <ScrollView
        ref={(el) => {
          flow.pageVerticalScrollRefs.current[pageIndex] = el;
        }}
        style={styles.pageScroll}
        contentContainerStyle={[
          styles.pageInner,
          { paddingBottom: pageScrollBottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
        {content}
      </ScrollView>
    </View>
  );

  const backLabel = flow.step === 0 ? 'Back' : flow.step === 5 ? '' : 'Previous';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 20 : 0}
    >
      {flow.step < 5 ? (
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={flow.handleBack} hitSlop={12}>
            <FontAwesome name="chevron-left" size={16} color={C.muted} />
            <Text style={styles.backBtnText}>{backLabel}</Text>
          </TouchableOpacity>
          <Text style={styles.brandText}>PULSE.</Text>
          <View style={styles.topBarRight} />
        </View>
      ) : null}

      <View style={flow.isDesktop ? styles.panelShell : styles.mobileShell}>
        {flow.isDesktop ? (
          <View style={styles.leftPanel}>
            <Text style={styles.leftLogo}>PULSE<Text style={styles.logoDot}>.</Text></Text>
            <Text style={styles.leftTag}>Business Onboarding</Text>
            <Text style={styles.leftTitle}>Build your workspace.</Text>
            <Text style={styles.leftSub}>Organize your fleet and logistics with Pulse.</Text>
          </View>
        ) : null}

        <View style={flow.isDesktop ? styles.rightPanel : styles.mobileRight}>
          <ScrollView
            ref={flow.scrollRef}
            horizontal
            pagingEnabled
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            style={[styles.scroller, flow.isDesktop && { width: flow.pageWidth, alignSelf: 'center' }]}
            contentContainerStyle={styles.scrollerContent}
            keyboardShouldPersistTaps="handled"
          >
            {pageBody(0, (
              <>
                <Text style={[styles.pageTitle, styles.pageTitleWelcome]}>Welcome aboard for business</Text>
                <Text style={styles.pageSub}>Enter your Indian mobile number to get started.</Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Mobile number</Text>
                  <View style={[styles.phoneRow, (flow.phoneInlineError || (flow.phoneExistsCheck?.exists && !flow.phoneExistsCheck?.loading)) && styles.phoneRowError]}>
                    <Text style={styles.flag}>🇮🇳</Text>
                    <Text style={styles.dialCode}>+91</Text>
                    <TextInput
                      style={styles.phoneInput}
                      placeholder="000 000 0000"
                      placeholderTextColor={C.placeholder}
                      value={flow.phone}
                      onChangeText={flow.setPhone}
                      keyboardType="phone-pad"
                      maxLength={10}
                      editable={!flow.loading}
                    />
                  </View>
                  {flow.phoneInlineError ? <Text style={styles.fieldError}>{flow.phoneInlineError}</Text> : null}
                  {flow.phoneExistsCheck?.loading ? <Text style={styles.fieldHint}>Checking...</Text> : null}
                  {!flow.phoneExistsCheck?.loading && flow.phoneExistsCheck?.exists ? (
                    <Text style={styles.fieldHint}>This number is already registered.</Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    (!flow.phoneValid || flow.loading || flow.phoneExistsCheck?.loading) && styles.primaryBtnDisabled,
                  ]}
                  onPress={flow.continuePhone}
                  disabled={
                    !flow.phoneValid
                    || flow.loading
                    || flow.googleLoading
                    || !!flow.phoneExistsCheck?.loading
                  }
                >
                  {flow.loading || flow.phoneExistsCheck?.loading ? (
                    <LoadingIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Send OTP</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.altRow}>
                  <Text style={styles.altText}>or</Text>
                </View>

                <TouchableOpacity
                  style={[styles.googleBtn, (flow.loading || flow.googleLoading || !flow.isOnline) && styles.primaryBtnDisabled]}
                  onPress={flow.continueWithGoogleFromWelcome}
                  disabled={flow.loading || flow.googleLoading || !flow.isOnline}
                >
                  {flow.googleLoading ? (
                    <LoadingIndicator color={C.text} />
                  ) : (
                    <>
                      <FontAwesome name="google" size={14} color={C.text} />
                      <Text style={styles.googleBtnText}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.altRow}>
                  <Text style={styles.altText}>Already have an account? </Text>
                  <TouchableOpacity onPress={() => router.replace('/sign-in')}>
                    <Text style={styles.altLink}>Sign in</Text>
                  </TouchableOpacity>
                </View>
              </>
            ))}

            {pageBody(1, (
              <>
                <View style={styles.otpIconWrap}>
                  <FontAwesome name="mobile" size={36} color={C.accent} />
                </View>
                <Text style={styles.pageTitle}>Verify your number</Text>
                <Text style={styles.pageSub}>
                  We would send a code to{'\n'}
                  <Text style={styles.phoneHighlight}>+91 {flow.phone}</Text>
                  {' '}— use mock verification below.
                </Text>

                <MockOtpNotice />

                <OtpInput value={flow.otp} onChange={flow.setOtp} />

                <TouchableOpacity
                  style={[styles.primaryBtn, flow.otp.replace(/\s/g, '').length < 6 && styles.primaryBtnDisabled]}
                  onPress={flow.verifyOtp}
                  disabled={flow.otp.replace(/\s/g, '').length < 6}
                >
                  <Text style={styles.primaryBtnText}>Verify OTP</Text>
                </TouchableOpacity>

                <View style={styles.resendRow}>
                  {flow.otpResendSecs > 0 ? (
                    <Text style={styles.resendCountdown}>Resend in {flow.otpResendSecs}s</Text>
                  ) : (
                    <TouchableOpacity onPress={() => { flow.setOtp(''); flow.startOtpCountdown(); }}>
                      <Text style={styles.altLink}>Resend OTP</Text>
                    </TouchableOpacity>
                  )}
                </View>

              </>
            ))}

            {pageBody(2, (
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
                  {flow.step2Attempted && !flow.orgName.trim() ? (
                    <Text style={styles.fieldError}>Enter your organization name.</Text>
                  ) : null}
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
                  ) : flow.orgCheck && !flow.orgCheck.taken && flow.orgName.trim() ? (
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
            ))}

            {pageBody(3, (
              <>
                <Text style={styles.pageTitle}>Company details</Text>
                <Text style={styles.pageSub}>Tell us about <Text style={styles.orgNameHighlight}>{flow.orgName}</Text></Text>

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
                  {flow.step3Attempted && flow.step3Errors.businessType ? (
                    <Text style={styles.fieldError}>{flow.step3Errors.businessType}</Text>
                  ) : null}
                </View>

                {(flow.operatingModel === 'ASSET_BASED' || flow.operatingModel === 'HYBRID') ? (
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.label, flow.step3Attempted && flow.step3Errors.fleetSize ? styles.labelError : null]}>
                      {flow.operatingModel === 'HYBRID' ? 'Own fleet size (trucks)' : 'Fleet size (trucks)'}
                      {' '}<Text style={styles.req}>*</Text>
                    </Text>
                    <View style={[styles.chipWrap, flow.step3Attempted && flow.step3Errors.fleetSize ? styles.chipGroupError : null]}>
                      {FLEET_SIZES.map((size) => (
                        <TouchableOpacity
                          key={size}
                          style={[styles.chip, flow.fleetSize === size && styles.chipActive]}
                          onPress={() => flow.setFleetSize(size)}
                        >
                          <Text style={[styles.chipText, flow.fleetSize === size && styles.chipTextActive]}>
                            {size}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {flow.step3Attempted && flow.step3Errors.fleetSize ? (
                      <Text style={styles.fieldError}>{flow.step3Errors.fleetSize}</Text>
                    ) : null}
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
                          <Text style={[styles.chipText, flow.monthlyVolume === value && styles.chipTextActive]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {flow.step3Attempted && flow.step3Errors.monthlyVolume ? (
                      <Text style={styles.fieldError}>{flow.step3Errors.monthlyVolume}</Text>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, flow.step3Attempted && flow.step3Errors.employeeCount ? styles.labelError : null]}>
                    Number of employees <Text style={styles.req}>*</Text>
                  </Text>
                  <View style={[styles.chipWrap, flow.step3Attempted && flow.step3Errors.employeeCount ? styles.chipGroupError : null]}>
                    {EMPLOYEE_COUNTS.map((count) => (
                      <TouchableOpacity
                        key={count}
                        style={[styles.chip, flow.employeeCount === count && styles.chipActive]}
                        onPress={() => flow.setEmployeeCount(count)}
                      >
                        <Text style={[styles.chipText, flow.employeeCount === count && styles.chipTextActive]}>
                          {count}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {flow.step3Attempted && flow.step3Errors.employeeCount ? (
                    <Text style={styles.fieldError}>{flow.step3Errors.employeeCount}</Text>
                  ) : null}
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
            ))}

            {pageBody(4, (
              <>
                <Text style={styles.pageTitle}>Create account</Text>
                {flow.orgJoinMode ? (
                  <View style={styles.joinNoticeBanner}>
                    <FontAwesome name="info-circle" size={14} color={C.warning} />
                    <Text style={styles.joinNoticeText}>
                      <Text style={{ fontWeight: '700' }}>{flow.orgName}</Text> already exists.
                      {' '}After signing up, ask their admin to invite you as a team member.
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.pageSub}>Enter your email and password to finish.</Text>
                )}

                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, flow.step4Attempted && flow.step4Errors.fullName ? styles.labelError : null]}>
                    Full name <Text style={styles.req}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, flow.step4Attempted && flow.step4Errors.fullName ? styles.inputError : null]}
                    placeholder="Your name"
                    placeholderTextColor={C.placeholder}
                    value={flow.fullName}
                    onChangeText={flow.setFullName}
                    autoCapitalize="words"
                    editable={!flow.loading}
                  />
                  {flow.step4Attempted && flow.step4Errors.fullName ? (
                    <Text style={styles.fieldError}>{flow.step4Errors.fullName}</Text>
                  ) : null}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, flow.step4Attempted && flow.step4Errors.email ? styles.labelError : null]}>
                    Email address <Text style={styles.req}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, flow.step4Attempted && flow.step4Errors.email ? styles.inputError : null]}
                    placeholder="you@example.com"
                    placeholderTextColor={C.placeholder}
                    value={flow.email}
                    onChangeText={flow.setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!flow.loading}
                  />
                  {flow.step4Attempted && flow.step4Errors.email ? (
                    <Text style={styles.fieldError}>{flow.step4Errors.email}</Text>
                  ) : null}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, flow.step4Attempted && flow.step4Errors.password ? styles.labelError : null]}>
                    Password <Text style={styles.req}>*</Text>
                  </Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.inputPassword, flow.step4Attempted && flow.step4Errors.password ? styles.inputError : null]}
                      placeholder="At least 6 characters"
                      placeholderTextColor={C.placeholder}
                      value={flow.password}
                      onChangeText={flow.setPassword}
                      secureTextEntry={!flow.showPassword}
                      editable={!flow.loading}
                    />
                    <TouchableOpacity onPress={() => flow.setShowPassword((v) => !v)} style={styles.eyeBtn}>
                      <FontAwesome name={flow.showPassword ? 'eye-slash' : 'eye'} size={18} color={C.muted} />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.strengthWrap, { opacity: flow.password.length >= 6 ? 1 : 0 }]}>
                    <View style={styles.strengthBar}>
                      {[1, 2, 3, 4].map((seg) => (
                        <View
                          key={seg}
                          style={[
                            styles.strengthSeg,
                            flow.passwordStrength >= seg && (
                              flow.passwordStrength <= 1 ? styles.strengthWeak :
                              flow.passwordStrength === 2 ? styles.strengthFair :
                              flow.passwordStrength === 3 ? styles.strengthGood :
                              styles.strengthStrong
                            ),
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={[
                      styles.strengthLabel,
                      flow.passwordStrength <= 1 ? { color: C.error } :
                      flow.passwordStrength === 2 ? { color: C.warning } :
                      flow.passwordStrength === 3 ? { color: '#22c55e' } :
                      { color: '#16a34a' },
                    ]}>
                      {flow.passwordStrength <= 1 ? 'Weak' : flow.passwordStrength === 2 ? 'Fair' : flow.passwordStrength === 3 ? 'Good' : 'Strong'}
                    </Text>
                  </View>

                  {flow.step4Attempted && flow.step4Errors.password ? (
                    <Text style={styles.fieldError}>{flow.step4Errors.password}</Text>
                  ) : null}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, (flow.step4Attempted && flow.step4Errors.confirmPassword) || flow.confirmMismatch ? styles.labelError : null]}>
                    Confirm password <Text style={styles.req}>*</Text>
                  </Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[
                        styles.inputPassword,
                        (flow.step4Attempted && flow.step4Errors.confirmPassword) || flow.confirmMismatch
                          ? styles.inputError
                          : flow.confirmPassword.length > 0 && !flow.confirmMismatch && flow.password === flow.confirmPassword
                            ? styles.inputSuccess
                            : null,
                      ]}
                      placeholder="Re-enter password"
                      placeholderTextColor={C.placeholder}
                      value={flow.confirmPassword}
                      onChangeText={flow.setConfirmPassword}
                      secureTextEntry={!flow.showConfirmPassword}
                      editable={!flow.loading}
                      onFocus={() => {
                        setTimeout(() => {
                          flow.pageVerticalScrollRefs.current[4]?.scrollToEnd({ animated: true });
                        }, 150);
                      }}
                    />
                    <TouchableOpacity onPress={() => flow.setShowConfirmPassword((v) => !v)} style={styles.eyeBtn}>
                      <FontAwesome name={flow.showConfirmPassword ? 'eye-slash' : 'eye'} size={18} color={C.muted} />
                    </TouchableOpacity>
                  </View>
                  {flow.confirmMismatch ? (
                    <Text style={styles.fieldError}>Passwords do not match.</Text>
                  ) : flow.confirmPassword.length > 0 && flow.password === flow.confirmPassword ? (
                    <Text style={styles.fieldSuccess}>Passwords match.</Text>
                  ) : flow.step4Attempted && flow.step4Errors.confirmPassword ? (
                    <Text style={styles.fieldError}>{flow.step4Errors.confirmPassword}</Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, flow.loading && styles.primaryBtnDisabled]}
                  onPress={flow.createAccount}
                  disabled={flow.loading || flow.googleLoading}
                >
                  {flow.loading ? <LoadingIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create account</Text>}
                </TouchableOpacity>

                <View style={styles.altRow}>
                  <Text style={styles.altText}>or</Text>
                </View>

                <TouchableOpacity
                  style={[styles.googleBtn, (flow.loading || flow.googleLoading) && styles.primaryBtnDisabled]}
                  onPress={flow.continueWithGoogle}
                  disabled={flow.loading || flow.googleLoading}
                >
                  {flow.googleLoading ? (
                    <LoadingIndicator color={C.text} />
                  ) : (
                    <>
                      <FontAwesome name="google" size={14} color={C.text} />
                      <Text style={styles.googleBtnText}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ))}

            {pageBody(5, (
              <View style={styles.successInner}>
                <View style={styles.successIcon}>
                  <FontAwesome name={flow.emailVerificationRequired ? 'envelope' : 'check'} size={32} color="#fff" />
                </View>
                {flow.emailVerificationRequired ? (
                  <>
                    <Text style={styles.successTitle}>Check your email</Text>
                    <Text style={styles.successSub}>
                      We sent a verification link to{' '}
                      <Text style={{ fontWeight: '700' }}>{flow.email}</Text>.{'\n'}
                      Click the link to activate your account.
                    </Text>
                    <TouchableOpacity
                      style={[styles.primaryBtn, flow.resendingSecs > 0 && { opacity: 0.5 }]}
                      disabled={flow.resendingSecs > 0}
                      onPress={flow.resendVerification}
                    >
                      <Text style={styles.primaryBtnText}>
                        {flow.resendingSecs > 0 ? `Resend in ${flow.resendingSecs}s` : 'Resend verification email'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.altRow} onPress={() => router.replace('/sign-in')}>
                      <Text style={styles.altLink}>Already verified? Sign in</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.successTitle}>
                      {flow.orgJoinMode ? 'Account created!' : "You're in!"}
                    </Text>
                    {flow.orgJoinMode ? (
                      <>
                        <Text style={styles.successSub}>
                          Your account is ready. To join{' '}
                          <Text style={{ fontWeight: '700' }}>{flow.orgName}</Text>, ask their admin
                          to invite you as a team member.
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.successSub}>
                        Your workspace <Text style={{ fontWeight: '700' }}>{flow.orgName}</Text> is ready. Start managing your fleet.
                      </Text>
                    )}
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/')}>
                      <Text style={styles.primaryBtnText}>Go to app</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.altRow} onPress={() => router.replace('/sign-in')}>
                      <Text style={styles.altLink}>Already have an account? Sign in</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ))}
          </ScrollView>

          {flow.step < 5 ? (
            <View style={[styles.dotsRow, { paddingBottom: insets.bottom + 10 }]}>
              {STEP_LABELS.map((label, i) => {
                const done = i < flow.step;
                const active = i === flow.step;
                return (
                  <View key={label} style={styles.dotItem}>
                    <View style={[styles.dot, active && styles.dotActive, done && styles.dotDone]} />
                    <Text style={[styles.dotLabel, active && styles.dotLabelActive]}>{label}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}


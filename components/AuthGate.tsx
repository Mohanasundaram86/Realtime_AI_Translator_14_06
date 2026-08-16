import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LogIn, Languages } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { CountryCodeSelector } from '@/components/CountryCodeSelector';
import { colors, radius, spacing, typography, cardShadow } from '@/lib/theme';

/**
 * Blocks the whole app (every tab, not just Settings) behind sign-in.
 *
 * Previously the sign-in form only lived inside the Settings tab, while Home,
 * History and Dashboard rendered unconditionally regardless of auth state.
 * An unauthenticated or session-expired user could freely open Conversation
 * Mode, record, and tap the mic — every AI call (transcribe/translate/TTS)
 * would then fail client-side with "Not signed in — cannot reach AI
 * services" after starting the recording, with no indication *why* short of
 * digging into Settings. Gating navigation here means that failure mode is
 * now structurally impossible: nothing that needs an idToken is reachable
 * until dynamoService actually has one.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const {
    user, loading,
    signIn, signUp, confirmSignUp, signInWithPhone, confirmOtpCode, cancelPhoneVerification,
    completeNewPassword,
    needsNewPassword, needsConfirmation, pendingEmail, needsOtpVerification, pendingPhone,
    needsForgotPasswordCode, pendingForgotPasswordEmail, forgotPassword, confirmForgotPassword, cancelForgotPassword,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  const [authMode, setAuthMode] = useState<'email' | 'phone'>('email');
  const [dialCode, setDialCode] = useState('+91');
  const [phoneNational, setPhoneNational] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const [showForgotPasswordEntry, setShowForgotPasswordEntry] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');

  const [authError, setAuthError] = useState<string | null>(null);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  const handleAuth = async () => {
    if (!email || !password) {
      setAuthError('Please enter both email and password');
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
        setEmail('');
        setPassword('');
      } else {
        await signUp(email, password);
        setPassword('');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleNewPassword = async () => {
    if (!newPassword || !confirmNewPassword) {
      setAuthError('Please fill in both password fields');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setAuthError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setAuthError('Password must be at least 8 characters');
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      await completeNewPassword(newPassword);
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to set new password');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleConfirmSignUp = async () => {
    const emailToConfirm = pendingEmail || email;
    if (!emailToConfirm || !confirmationCode) {
      setAuthError('Please enter the verification code');
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      await confirmSignUp(emailToConfirm, confirmationCode);
      setConfirmationCode('');
      setIsLogin(true);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Verification failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendOtp = async () => {
    const trimmed = phoneNational.trim();
    const composed = trimmed.startsWith('+')
      ? `+${trimmed.replace(/\D/g, '')}`
      : `${dialCode}${trimmed.replace(/\D/g, '').replace(/^0+/, '')}`;

    if (composed.replace(/\D/g, '').length === 0) {
      setAuthError('Please enter your phone number');
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithPhone(composed);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to send verification code');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode) {
      setAuthError('Please enter the verification code');
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      await confirmOtpCode(otpCode);
      setOtpCode('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Verification failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendResetCode = async () => {
    if (!forgotPasswordEmail.trim()) {
      setAuthError('Please enter your email');
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      await forgotPassword(forgotPasswordEmail.trim());
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to send reset code');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleConfirmResetPassword = async () => {
    if (!resetCode || !newResetPassword || !confirmResetPassword) {
      setAuthError('Please fill in all fields');
      return;
    }
    if (newResetPassword !== confirmResetPassword) {
      setAuthError('Passwords do not match');
      return;
    }
    if (newResetPassword.length < 8) {
      setAuthError('Password must be at least 8 characters');
      return;
    }
    const emailToReset = pendingForgotPasswordEmail || forgotPasswordEmail;
    setAuthError(null);
    setAuthLoading(true);
    try {
      await confirmForgotPassword(emailToReset, resetCode, newResetPassword);
      setShowForgotPasswordEntry(false);
      setForgotPasswordEmail('');
      setResetCode('');
      setNewResetPassword('');
      setConfirmResetPassword('');
      setIsLogin(true);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to reset password');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCancelForgotPassword = () => {
    setAuthError(null);
    setShowForgotPasswordEntry(false);
    setForgotPasswordEmail('');
    setResetCode('');
    setNewResetPassword('');
    setConfirmResetPassword('');
    cancelForgotPassword();
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[colors.primaryTint, colors.background]} style={styles.heroGradient} pointerEvents="none" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.header}>
        <View style={styles.logoBadge}>
          <Languages size={30} color={colors.textOnPrimary} />
        </View>
        <Text style={styles.title}>AI Translator</Text>
        <Text style={styles.subtitle}>Sign in to start translating</Text>
      </View>

      {needsNewPassword ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Set New Password</Text>
          <Text style={styles.sectionDescription}>
            Your account requires a new password. Please set one to continue.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="New Password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />

          <TextInput
            style={styles.input}
            placeholder="Confirm New Password"
            value={confirmNewPassword}
            onChangeText={setConfirmNewPassword}
            secureTextEntry
          />

          {authError && <Text style={styles.authError}>{authError}</Text>}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleNewPassword}
            disabled={authLoading}>
            {authLoading ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>Set Password & Sign In</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : needsConfirmation ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Verify Your Email</Text>
          <Text style={styles.sectionDescription}>
            We sent a verification code to {pendingEmail || email}. Enter it below to complete registration.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Verification Code"
            value={confirmationCode}
            onChangeText={setConfirmationCode}
            keyboardType="number-pad"
            autoCapitalize="none"
          />

          {authError && <Text style={styles.authError}>{authError}</Text>}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleConfirmSignUp}
            disabled={authLoading}>
            {authLoading ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>Verify & Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : needsOtpVerification ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Enter Verification Code</Text>
          <Text style={styles.sectionDescription}>
            We sent a code via SMS to {pendingPhone}. Enter it below to sign in.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="6-digit code"
            value={otpCode}
            onChangeText={setOtpCode}
            keyboardType="number-pad"
            autoCapitalize="none"
          />

          {authError && <Text style={styles.authError}>{authError}</Text>}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleVerifyOtp}
            disabled={authLoading}>
            {authLoading ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>Verify & Continue</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setAuthError(null); setOtpCode(''); cancelPhoneVerification(); }}>
            <Text style={styles.linkText}>Entered the wrong number? Start over</Text>
          </TouchableOpacity>
        </View>
      ) : needsForgotPasswordCode ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Reset Password</Text>
          <Text style={styles.sectionDescription}>
            We emailed a 6-digit verification code to {pendingForgotPasswordEmail}. It&apos;s unrelated
            to your new password below — enter both to finish resetting your account.
          </Text>

          <Text style={styles.fieldGroupLabel}>Verification code from email</Text>
          <TextInput
            style={styles.input}
            placeholder="6-digit code"
            value={resetCode}
            onChangeText={setResetCode}
            keyboardType="number-pad"
            maxLength={6}
            autoCapitalize="none"
          />

          <Text style={styles.fieldGroupLabel}>Choose a new password</Text>
          <TextInput
            style={styles.input}
            placeholder="New password"
            value={newResetPassword}
            onChangeText={setNewResetPassword}
            secureTextEntry
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm new password"
            value={confirmResetPassword}
            onChangeText={setConfirmResetPassword}
            secureTextEntry
          />
          <Text style={styles.passwordHint}>
            At least 8 characters, including uppercase, lowercase, a number, and a special character.
          </Text>

          {authError && <Text style={styles.authError}>{authError}</Text>}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleConfirmResetPassword}
            disabled={authLoading}>
            {authLoading ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>Reset Password</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleCancelForgotPassword}>
            <Text style={styles.linkText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      ) : showForgotPasswordEntry ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Forgot Password</Text>
          <Text style={styles.sectionDescription}>
            Enter your account email and we&apos;ll send you a code to reset your password.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            value={forgotPasswordEmail}
            onChangeText={setForgotPasswordEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {authError && <Text style={styles.authError}>{authError}</Text>}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSendResetCode}
            disabled={authLoading}>
            {authLoading ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>Send Reset Code</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleCancelForgotPassword}>
            <Text style={styles.linkText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            {authMode === 'email' ? (isLogin ? 'Sign In' : 'Create Account') : 'Sign In with Phone'}
          </Text>
          <Text style={styles.sectionDescription}>
            Sign in to save your translation history and settings
          </Text>

          {authMode === 'email' ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              {!isLogin && (
                <Text style={styles.passwordHint}>
                  Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.
                </Text>
              )}
              {authError && <Text style={styles.authError}>{authError}</Text>}

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleAuth}
                disabled={authLoading}>
                {authLoading ? (
                  <ActivityIndicator size="small" color={colors.textOnPrimary} />
                ) : (
                  <>
                    <LogIn size={20} color={colors.textOnPrimary} />
                    <Text style={styles.primaryButtonText}>
                      {isLogin ? 'Sign In' : 'Sign Up'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {isLogin && (
                <TouchableOpacity
                  onPress={() => { setAuthError(null); setForgotPasswordEmail(email); setShowForgotPasswordEntry(true); }}>
                  <Text style={styles.linkText}>Forgot password?</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
                <Text style={styles.linkText}>
                  {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.phoneRow}>
                <CountryCodeSelector selectedDialCode={dialCode} onSelect={setDialCode} />
                <TextInput
                  style={[styles.input, styles.phoneInput]}
                  placeholder="Phone number"
                  value={phoneNational}
                  onChangeText={setPhoneNational}
                  keyboardType="phone-pad"
                />
              </View>
              {authError && <Text style={styles.authError}>{authError}</Text>}

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSendOtp}
                disabled={authLoading}>
                {authLoading ? (
                  <ActivityIndicator size="small" color={colors.textOnPrimary} />
                ) : (
                  <>
                    <LogIn size={20} color={colors.textOnPrimary} />
                    <Text style={styles.primaryButtonText}>Send Code</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={() => { setAuthError(null); setAuthMode(authMode === 'email' ? 'phone' : 'email'); }}>
            <Text style={styles.linkText}>
              {authMode === 'email' ? 'Sign in with phone instead' : 'Sign in with email instead'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  heroGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 360,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: spacing.xxl,
    alignItems: 'center',
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...cardShadow,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
  },
  title: {
    ...typography.displayMedium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
    ...cardShadow,
    shadowOpacity: 0.08,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  passwordHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    marginTop: -8,
    lineHeight: 18,
  },
  fieldGroupLabel: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 4,
  },
  authError: {
    fontSize: 13,
    color: colors.error,
    marginBottom: 10,
    textAlign: 'center',
  },
  linkText: {
    color: colors.primary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
    fontSize: 16,
    color: colors.textPrimary,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  phoneInput: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md + 2,
    borderRadius: radius.sm,
    gap: spacing.sm,
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { Banner, Button, Field, Screen, T, colors, space } from '@/ui';

export default function SignIn() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  async function submitEmail() {
    setError(null);
    setNotice(null);
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setError('Please enter a valid email.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy('email');
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: e, password });
        if (error) throw error;
        if (!data.session) {
          setNotice('Check your inbox and tap the confirmation link, then come back and sign in.');
          setMode('signin');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/invalid login/i.test(msg)) setError('Email or password is incorrect.');
      else if (/already registered/i.test(msg)) setError('That email already has an account. Try signing in.');
      else if (/not confirmed/i.test(msg)) setError('Please confirm your email first (check your inbox).');
      else if (/network|fetch/i.test(msg)) setError('No connection. Check your internet and try again.');
      else setError(msg || 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function signInWithApple() {
    setError(null);
    setBusy('apple');
    try {
      // a one-time random value proves this Apple token was made for this sign-in
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashedNonce,
      });
      if (!cred.identityToken) throw new Error('Apple didn’t return a sign-in token.');
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: rawNonce });
      if (error) throw error;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'ERR_REQUEST_CANCELED') setError('Sign in with Apple didn’t work. Please try again or use email.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Animated.View entering={FadeInDown.duration(400)} style={{ gap: space.md, marginTop: space.xxl }}>
        <T variant="overline" color={colors.accent}>Kitchen AI</T>
        <T variant="display">High-protein meals from what’s already in your fridge.</T>
        <T color={colors.inkSoft}>Snap a photo. Get 3 recipes that fit your macros.</T>
      </Animated.View>

      <View style={{ gap: space.md }}>
        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={28}
            style={{ height: 56, width: '100%', opacity: busy ? 0.5 : 1 }}
            onPress={busy ? () => {} : signInWithApple}
          />
        ) : null}
        {appleAvailable ? (
          <T variant="caption" color={colors.inkFaint} align="center">or use email</T>
        ) : null}
        <Field placeholder="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail} />
        <Field
          placeholder="Password (8+ characters)"
          secureTextEntry
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          textContentType={mode === 'signup' ? 'newPassword' : 'password'}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submitEmail}
          returnKeyType="go"
        />
        {error ? <Banner tone="danger" text={error} /> : null}
        {notice ? <Banner tone="success" text={notice} /> : null}
        <Button title={mode === 'signup' ? 'Create account' : 'Sign in'} onPress={submitEmail} loading={busy === 'email'} disabled={!!busy} />
        <Button
          variant="ghost"
          size="md"
          title={mode === 'signup' ? 'I already have an account' : 'New here? Create an account'}
          onPress={() => {
            setMode(mode === 'signup' ? 'signin' : 'signup');
            setError(null);
          }}
        />
      </View>
      <T variant="caption" color={colors.inkFaint} align="center">
        By continuing you agree to our Terms and Privacy Policy. Kitchen AI gives food ideas, not medical advice.
      </T>
    </Screen>
  );
}

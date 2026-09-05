'use client';
import { useState } from 'react';
import { auth, action } from '@/lib/client';
import { Busy, Field } from './common';
export function AuthScreen({
  onDone,
  needsWorkspace = false,
}: {
  onDone: () => void;
  needsWorkspace?: boolean;
}) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (needsWorkspace) {
        await action('createWorkspace', { name });
        onDone();
        return;
      }
      if (mode === 'reset') {
        const { error } = await auth().auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + '/settings',
        });
        if (error) throw error;
        setMessage('Check your email for a password reset link.');
        return;
      }
      const result =
        mode === 'signin'
          ? await auth().auth.signInWithPassword({ email, password })
          : await auth().auth.signUp({
              email,
              password,
              options: { emailRedirectTo: location.origin },
            });
      if (result.error) throw result.error;
      if (result.data.session) onDone();
      else
        setMessage('Check your email to confirm your account, then sign in.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth">
      <div className="brand">◈ suiroll</div>
      <section className="panel">
        <p className="eyebrow">Your payroll workspace</p>
        <h1>
          {needsWorkspace
            ? 'Make it yours'
            : mode === 'signup'
              ? 'Create your account'
              : mode === 'reset'
                ? 'Reset your password'
                : 'Welcome back'}
        </h1>
        <p className="muted" style={{ margin: '12px 0 25px', fontSize: 14 }}>
          {needsWorkspace
            ? 'Give your organization a name. Your configured treasury will authorize payments.'
            : 'Keep your payroll private, organized, and ready to approve.'}
        </p>
        <form className="fields" onSubmit={submit}>
          {needsWorkspace ? (
            <Field label="Organization name">
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your company"
              />
            </Field>
          ) : (
            <>
              <Field label="Work email">
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </Field>
              {mode !== 'reset' && (
                <Field label="Password">
                  <input
                    type="password"
                    autoComplete={
                      mode === 'signup' ? 'new-password' : 'current-password'
                    }
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
              )}
            </>
          )}
          {message && (
            <output className="notice" aria-live="polite">
              {message}
            </output>
          )}
          <button className="primary" disabled={busy}>
            {busy ? (
              <Busy />
            ) : needsWorkspace ? (
              'Create workspace'
            ) : mode === 'signup' ? (
              'Create account'
            ) : mode === 'reset' ? (
              'Send reset link'
            ) : (
              'Sign in'
            )}
          </button>
        </form>
        {!needsWorkspace && (
          <div className="stack" style={{ marginTop: 24, fontSize: 14 }}>
            <button
              className="text-link"
              onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
            >
              {mode === 'signup'
                ? 'Already have an account? Sign in'
                : 'New to Suiroll? Create an account'}
            </button>
            <button
              className="text-link"
              onClick={() => setMode(mode === 'reset' ? 'signin' : 'reset')}
            >
              {mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

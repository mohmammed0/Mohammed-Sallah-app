'use client';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { z } from 'zod';
const credentials = z.object({ email: z.email(), password: z.string().min(8).max(200) });
export function LoginForm() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(formData: FormData) {
    setPending(true);
    setError('');
    const parsed = credentials.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    });
    if (!parsed.success) {
      setError('تحقق من البريد وكلمة المرور.');
      setPending(false);
      return;
    }
    const client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'local-anon-key',
    );
    const { error: authError } = await client.auth.signInWithPassword(parsed.data);
    if (authError) {
      setError('تعذر تسجيل الدخول. تحقق من البيانات ثم أعد المحاولة.');
      setPending(false);
      return;
    }
    window.location.assign('/admin');
  }
  return (
    <form className="form" action={submit}>
      <label className="field">
        <span>البريد الإلكتروني</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label className="field">
        <span>كلمة المرور</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          required
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="button" disabled={pending} type="submit">
        {pending ? 'جارٍ التحقق…' : 'دخول آمن'}
      </button>
    </form>
  );
}

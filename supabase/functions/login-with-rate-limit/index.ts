/**
 * login-with-rate-limit — Wrapper auth avec lockout brute-force.
 *
 * Lockout : 15 min après 5 tentatives échouées sur le même email.
 *
 * Body : { email, password, totpCode? }
 * Response 200 : { session: { access_token, refresh_token, ... } }
 * Response 429 : Lockout actif
 * Response 401 : Credentials invalides
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCorsOptions } from '../_shared/cors.ts';
import { respondError, respondJson } from '../_shared/response.ts';
import { createServiceClient } from '../_shared/auth.ts';

interface LoginBody {
  email?: string;
  password?: string;
  totpCode?: string;
}

serve(async (req) => {
  const cors = handleCorsOptions(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return respondError(req, 405, 'Method not allowed');
  }

  let body: LoginBody;
  try {
    body = await req.json();
  } catch {
    return respondError(req, 400, 'Invalid JSON');
  }

  const { email, password } = body;
  if (!email || !password) {
    return respondError(req, 400, 'email and password required');
  }

  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = req.headers.get('user-agent') ?? null;
  const service = createServiceClient();

  // Vérifier le lockout
  const { data: lockoutData } = await service.rpc('check_login_lockout', {
    p_email: email.toLowerCase().trim(),
  });

  if (lockoutData === true) {
    return respondError(req, 429, 'Too many failed attempts. Try again in 15 minutes.');
  }

  // Tenter l'authentification
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  });

  // Logger la tentative
  await service.from('login_attempts').insert({
    email: email.toLowerCase().trim(),
    ip_address: ipAddress,
    user_agent: userAgent,
    successful: !error,
    failure_reason: error?.message ?? null,
  });

  if (error || !data.session) {
    return respondError(req, 401, 'Invalid credentials');
  }

  // Note : si MFA activée, le session contient `aal: aal1` (insuffisant).
  // Le client doit ensuite appeler verifyOtp avec le totpCode.

  return respondJson(req, {
    session: data.session,
    user: { id: data.user?.id, email: data.user?.email },
  });
});

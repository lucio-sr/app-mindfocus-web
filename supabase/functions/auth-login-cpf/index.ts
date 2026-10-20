// POST {cpf, password} → sessão do Supabase Auth.
// O cliente usa a resposta em supabase.auth.setSession({access_token, refresh_token}).
// Qualquer falha de credencial devolve a mesma mensagem (não revela se o CPF existe).

import { adminClient, anonClient, rateLimit } from "../_shared/clients.ts";
import { onlyDigits } from "../_shared/br.ts";
import { clientIp, HttpError, json, readJson, serve } from "../_shared/http.ts";

const INVALID = new HttpError(401, "invalid_credentials", "CPF ou senha inválidos.");

serve(async (req) => {
  const body = await readJson(req);
  const cpf = onlyDigits(body.cpf);
  const password = typeof body.password === "string" ? body.password : "";

  await rateLimit(`login:ip:${clientIp(req)}`, 30, 300);
  if (cpf.length !== 11 || !password) throw INVALID;
  await rateLimit(`login:cpf:${cpf}`, 10, 900);

  const { data: profile } = await adminClient().from("profiles").select("email").eq("cpf", cpf).maybeSingle();
  if (!profile) throw INVALID;

  const { data, error } = await anonClient().auth.signInWithPassword({ email: profile.email, password });
  if (error || !data.session) {
    if (error?.status === 429) {
      throw new HttpError(429, "too_many_attempts", "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
    }
    throw INVALID;
  }

  const s = data.session;
  return json(req, 200, {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_in: s.expires_in,
    expires_at: s.expires_at,
    token_type: s.token_type,
    user: { id: s.user.id, email: s.user.email },
  });
});

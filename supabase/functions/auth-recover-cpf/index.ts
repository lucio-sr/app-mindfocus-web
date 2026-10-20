// POST {cpf, redirect_to?} → envia o e-mail de redefinição de senha para o e-mail do cadastro.
// A resposta é sempre a mesma, exista ou não o CPF.

import { adminClient, anonClient, rateLimit } from "../_shared/clients.ts";
import { onlyDigits } from "../_shared/br.ts";
import { safeRedirect } from "../_shared/accounts.ts";
import { clientIp, json, readJson, serve } from "../_shared/http.ts";

const MESSAGE = "Se o CPF estiver cadastrado, enviaremos um link de redefinição para o e-mail do cadastro.";

serve(async (req) => {
  const body = await readJson(req);
  const cpf = onlyDigits(body.cpf);
  const redirectTo = safeRedirect(body.redirect_to, "/redefinir-senha");

  await rateLimit(`recover:ip:${clientIp(req)}`, 10, 3600);
  if (cpf.length === 11) {
    await rateLimit(`recover:cpf:${cpf}`, 3, 3600);

    const { data: profile } = await adminClient().from("profiles").select("email").eq("cpf", cpf).maybeSingle();
    if (profile) {
      const { error } = await anonClient().auth.resetPasswordForEmail(profile.email, { redirectTo });
      if (error) console.error("resetPasswordForEmail:", error.status, error.message);
    }
  }

  return json(req, 200, { message: MESSAGE });
});

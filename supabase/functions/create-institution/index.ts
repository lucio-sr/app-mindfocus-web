// Superadmin cria uma instituição e o primeiro admin dela.
//
// POST {
//   institution: {name, document, legal_name?, email?, phone?, cep?, street?, number?,
//                 complement?, district?, city?, uf?},
//   admin: {full_name, cpf, email},
//   delivery?: "email" | "link" | "none",   // padrão "email"
//   redirect_to?: string                     // padrão SITE_URL/definir-senha
// }
// → 201 {institution_id, admin: {user_id, created, action_link?}}
//
// Se o CPF do admin já tem conta (com o mesmo e-mail), ela é reaproveitada.

import { requireCaller } from "../_shared/clients.ts";
import { isValidCnpj, isValidCpf, onlyDigits } from "../_shared/br.ts";
import { deleteAccount, findOrCreateAccount, parseDelivery, parsePerson, safeRedirect } from "../_shared/accounts.ts";
import { fromPostgrestError, HttpError, json, readJson, serve } from "../_shared/http.ts";

serve(async (req) => {
  const caller = await requireCaller(req);
  if (!caller.isPlatformAdmin) throw new HttpError(403, "forbidden", "Apenas o superadmin cria instituições.");

  const body = await readJson(req);
  const institution = (body.institution ?? {}) as Record<string, unknown>;
  if (typeof institution.name !== "string" || !institution.name.trim()) {
    throw new HttpError(422, "invalid_data", "Informe o nome da instituição.");
  }
  const document = onlyDigits(institution.document);
  if (!(document.length === 11 ? isValidCpf(document) : isValidCnpj(document))) {
    throw new HttpError(422, "invalid_data", "CPF ou CNPJ da instituição inválido.");
  }
  const admin = parsePerson(body.admin, "admin");
  const delivery = parseDelivery(body.delivery, caller.isPlatformAdmin, "email");
  const redirectTo = safeRedirect(body.redirect_to, "/definir-senha");

  // Antes de criar conta ou mandar convite, confere se o documento já está em uso.
  const { data: existing, error: lookupError } = await caller.client
    .from("institutions").select("id").eq("document", document).maybeSingle();
  if (lookupError) throw fromPostgrestError(lookupError);
  if (existing) throw new HttpError(409, "document_in_use", "Já existe uma instituição com este documento.");

  const account = await findOrCreateAccount(admin, delivery, redirectTo);

  const { data: institutionId, error } = await caller.client.rpc("create_institution", {
    p_institution: { ...institution, document },
    p_admin_id: account.userId,
  });
  if (error) {
    if (account.created) await deleteAccount(account.userId);
    throw fromPostgrestError(error);
  }

  return json(req, 201, {
    institution_id: institutionId,
    admin: { user_id: account.userId, created: account.created, action_link: account.actionLink },
  });
});

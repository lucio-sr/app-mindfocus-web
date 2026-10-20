// Admin da instituição (ou superadmin) inclui um colaborador.
//
// POST {
//   institution_id, role: "admin" | "psychologist" | "staff",
//   person: {full_name, cpf, email},
//   delivery?: "email" | "link" | "none",   // padrão "email"; "link" só superadmin
//   redirect_to?: string                     // padrão SITE_URL/definir-senha
// }
// → 200 {user_id, created, status, action_link?}
//   status: "created" | "reactivated" | "updated" | "unchanged"
//
// Quem já tem conta (mesmo CPF e e-mail) só ganha o vínculo; nenhum convite é enviado.

import { requireCaller } from "../_shared/clients.ts";
import { deleteAccount, findOrCreateAccount, parseDelivery, parsePerson, safeRedirect } from "../_shared/accounts.ts";
import { fromPostgrestError, HttpError, json, readJson, serve } from "../_shared/http.ts";

const ROLES = ["admin", "psychologist", "staff"];

serve(async (req) => {
  const caller = await requireCaller(req);
  const body = await readJson(req);

  const institutionId = typeof body.institution_id === "string" ? body.institution_id : "";
  const isAdmin = caller.memberships.some((m) => m.institution_id === institutionId && m.role === "admin");
  if (!institutionId || !(caller.isPlatformAdmin || isAdmin)) {
    throw new HttpError(403, "forbidden", "Apenas admins da instituição incluem colaboradores.");
  }
  if (typeof body.role !== "string" || !ROLES.includes(body.role)) {
    throw new HttpError(422, "invalid_data", "role deve ser 'admin', 'psychologist' ou 'staff'.");
  }
  const person = parsePerson(body.person, "colaborador");
  const delivery = parseDelivery(body.delivery, caller.isPlatformAdmin, "email");
  const redirectTo = safeRedirect(body.redirect_to, "/definir-senha");

  const account = await findOrCreateAccount(person, delivery, redirectTo);

  const { data: status, error } = await caller.client.rpc("add_institution_member", {
    p_institution_id: institutionId,
    p_user_id: account.userId,
    p_role: body.role,
  });
  if (error) {
    if (account.created) await deleteAccount(account.userId);
    throw fromPostgrestError(error);
  }

  return json(req, 200, {
    user_id: account.userId,
    created: account.created,
    status,
    action_link: account.actionLink,
  });
});

// Colaborador da instituição cadastra um responsável e os pacientes dele.
//
// POST {
//   institution_id,
//   guardian: {full_name, cpf, email, phone?, birthdate?, gender?,
//              cep?, street?, number?, complement?, district?, city?, uf?},
//   patients: [
//     {full_name, birthdate, relationship, cpf?, gender?, education?, public_school?,
//      school_dropout?, school_dropout_times?, school_failure?, school_failure_times?,
//      medications?, siblings?, adhd_diagnosis?, autism_diagnosis?, notes?, uf?, income?}
//     | {patient_id, relationship, income?}          // paciente já cadastrado na instituição
//   ],
//   consent_term_version?: string,           // registra o consentimento de cada vínculo
//   delivery?: "email" | "link" | "none",    // padrão "email"; "link" só superadmin
//   redirect_to?: string                     // padrão SITE_URL/definir-senha
// }
// → 201 {guardian: {user_id, created, action_link?}, patient_ids}
//
// Se o responsável já tem conta (outra instituição, outro filho), ela é reaproveitada e os dados
// pessoais dele não são alterados.

import { adminClient, requireCaller } from "../_shared/clients.ts";
import { isValidCpf, onlyDigits } from "../_shared/br.ts";
import {
  deleteAccount,
  findOrCreateAccount,
  parseDelivery,
  parsePerson,
  profileExtras,
  safeRedirect,
} from "../_shared/accounts.ts";
import { fromPostgrestError, HttpError, json, readJson, serve } from "../_shared/http.ts";

function validatePatients(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(422, "invalid_data", "Informe ao menos um paciente.");
  }
  return value.map((item, i) => {
    const p = (item ?? {}) as Record<string, unknown>;
    const label = `paciente ${i + 1}`;
    if (typeof p.relationship !== "string" || !p.relationship.trim()) {
      throw new HttpError(422, "invalid_data", `Informe o parentesco (${label}).`);
    }
    if (p.patient_id === undefined) {
      if (typeof p.full_name !== "string" || !p.full_name.trim()) {
        throw new HttpError(422, "invalid_data", `Informe o nome (${label}).`);
      }
      if (typeof p.birthdate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.birthdate)) {
        throw new HttpError(422, "invalid_data", `Data de nascimento deve estar no formato AAAA-MM-DD (${label}).`);
      }
      if (p.cpf !== undefined && p.cpf !== null && p.cpf !== "" && !isValidCpf(onlyDigits(p.cpf))) {
        throw new HttpError(422, "invalid_data", `CPF inválido (${label}).`);
      }
    }
    return p;
  });
}

serve(async (req) => {
  const caller = await requireCaller(req);
  const body = await readJson(req);

  const institutionId = typeof body.institution_id === "string" ? body.institution_id : "";
  if (!institutionId || !caller.memberships.some((m) => m.institution_id === institutionId)) {
    throw new HttpError(403, "forbidden", "Apenas colaboradores da instituição cadastram responsáveis.");
  }

  const guardianBody = (body.guardian ?? {}) as Record<string, unknown>;
  const guardian = parsePerson(guardianBody, "responsável");
  const patients = validatePatients(body.patients);
  const delivery = parseDelivery(body.delivery, caller.isPlatformAdmin, "email");
  const redirectTo = safeRedirect(body.redirect_to, "/definir-senha");
  const consent = typeof body.consent_term_version === "string" ? body.consent_term_version : null;

  const account = await findOrCreateAccount(guardian, delivery, redirectTo);

  try {
    if (account.created) {
      const extras = profileExtras(guardianBody);
      if (Object.keys(extras).length > 0) {
        const { error } = await adminClient().from("profiles").update(extras).eq("id", account.userId);
        if (error) throw fromPostgrestError(error);
      }
    }

    const { data: patientIds, error } = await caller.client.rpc("register_guardian_patients", {
      p_institution_id: institutionId,
      p_guardian_id: account.userId,
      p_patients: patients,
      p_consent_term_version: consent,
    });
    if (error) throw fromPostgrestError(error);

    return json(req, 201, {
      guardian: { user_id: account.userId, created: account.created, action_link: account.actionLink },
      patient_ids: patientIds,
    });
  } catch (e) {
    if (account.created) await deleteAccount(account.userId);
    throw e;
  }
});

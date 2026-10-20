// Colaborador da instituição cadastra uma criança com um ou mais responsáveis ("criança primeiro").
//
// POST {
//   institution_id,
//   patient: {full_name, birthdate, cpf?, gender?, education?, public_school?, uf?, ...},
//   guardians: [                              // 1 a 3, CPFs diferentes
//     {full_name, cpf, email, phone?, relationship, income?}
//   ],
//   consent_term_version?: string,           // registra o consentimento de cada responsável
//   delivery?: "email" | "link" | "none",    // para contas novas; padrão "email"; "link" só superadmin
//   redirect_to?: string                     // padrão SITE_URL/definir-senha
// }
// → 201 {patient_id, guardians: [{user_id, created, action_link?}]}  (na ordem recebida)
//
// Responsável que já tem conta (mesmo CPF e e-mail) é reaproveitado sem alterar os dados dele.
// Tudo ou nada: se a gravação falha, as contas criadas nesta chamada são apagadas.

import { adminClient, requireCaller } from "../_shared/clients.ts";
import { isValidCpf, onlyDigits } from "../_shared/br.ts";
import {
  type Account,
  deleteAccount,
  findOrCreateAccount,
  parseDelivery,
  parsePerson,
  profileExtras,
  safeRedirect,
} from "../_shared/accounts.ts";
import { fromPostgrestError, HttpError, json, readJson, serve } from "../_shared/http.ts";

const MAX_GUARDIANS = 3;

function validatePatient(value: unknown): Record<string, unknown> {
  const p = (value ?? {}) as Record<string, unknown>;
  if (typeof p.full_name !== "string" || !p.full_name.trim()) {
    throw new HttpError(422, "invalid_data", "Informe o nome do paciente.");
  }
  if (typeof p.birthdate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.birthdate)) {
    throw new HttpError(422, "invalid_data", "Data de nascimento deve estar no formato AAAA-MM-DD.");
  }
  if (p.cpf !== undefined && p.cpf !== null && p.cpf !== "" && !isValidCpf(onlyDigits(p.cpf))) {
    throw new HttpError(422, "invalid_data", "CPF do paciente inválido.");
  }
  return p;
}

serve(async (req) => {
  const caller = await requireCaller(req);
  const body = await readJson(req);

  const institutionId = typeof body.institution_id === "string" ? body.institution_id : "";
  if (!institutionId || !caller.memberships.some((m) => m.institution_id === institutionId)) {
    throw new HttpError(403, "forbidden", "Apenas colaboradores da instituição cadastram pacientes.");
  }

  const patient = validatePatient(body.patient);
  if (!Array.isArray(body.guardians) || body.guardians.length === 0) {
    throw new HttpError(422, "invalid_data", "Informe ao menos um responsável.");
  }
  if (body.guardians.length > MAX_GUARDIANS) {
    throw new HttpError(422, "invalid_data", `No máximo ${MAX_GUARDIANS} responsáveis por cadastro.`);
  }
  const guardians = body.guardians.map((g, i) => {
    const raw = (g ?? {}) as Record<string, unknown>;
    const label = `responsável ${i + 1}`;
    if (typeof raw.relationship !== "string" || !raw.relationship.trim()) {
      throw new HttpError(422, "invalid_data", `Informe o parentesco (${label}).`);
    }
    return { raw, person: parsePerson(raw, label) };
  });
  const cpfs = guardians.map((g) => g.person.cpf);
  if (new Set(cpfs).size !== cpfs.length) throw new HttpError(422, "invalid_data", "Responsável repetido.");
  if (patient.cpf && cpfs.includes(onlyDigits(patient.cpf))) {
    throw new HttpError(422, "invalid_data", "O CPF do paciente não pode ser o de um responsável.");
  }

  const delivery = parseDelivery(body.delivery, caller.isPlatformAdmin, "email");
  const redirectTo = safeRedirect(body.redirect_to, "/definir-senha");
  const consent = typeof body.consent_term_version === "string" ? body.consent_term_version : null;

  const accounts: Account[] = [];
  try {
    for (const g of guardians) {
      const account = await findOrCreateAccount(g.person, delivery, redirectTo);
      accounts.push(account);
      if (account.created) {
        const extras = profileExtras(g.raw);
        if (Object.keys(extras).length > 0) {
          const { error } = await adminClient().from("profiles").update(extras).eq("id", account.userId);
          if (error) throw fromPostgrestError(error);
        }
      }
    }

    const { data: patientId, error } = await caller.client.rpc("register_patient", {
      p_institution_id: institutionId,
      p_patient: patient,
      p_guardians: guardians.map((g, i) => ({
        guardian_id: accounts[i].userId,
        relationship: g.raw.relationship,
        income: g.raw.income,
      })),
      p_consent_term_version: consent,
    });
    if (error) throw fromPostgrestError(error);

    return json(req, 201, {
      patient_id: patientId,
      guardians: accounts.map((a) => ({ user_id: a.userId, created: a.created, action_link: a.actionLink })),
    });
  } catch (e) {
    for (const a of accounts) if (a.created) await deleteAccount(a.userId);
    throw e;
  }
});

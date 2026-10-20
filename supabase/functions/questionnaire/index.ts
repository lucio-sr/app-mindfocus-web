// Questionário (SNAP-IV) respondido pelo responsável via link de uso único, sem login.
//
// POST {action: "open", token}                        → {status, institution_name?}
// POST {action: "verify", token, birthdate}           → {status, institution_name, patient_first_name, guardian_first_name}
// POST {action: "submit", token, birthdate, answers: {items: [0..3 × 18]}, started_at?} → {status}
//
// status: ok | verified | submitted | wrong_birthdate | locked | completed | expired | revoked | invalid
// A data de nascimento da criança (AAAA-MM-DD) é pedida antes de mostrar o nome; 5 erros bloqueiam o link.

import { adminClient, rateLimit } from "../_shared/clients.ts";
import { clientIp, fromPostgrestError, HttpError, json, readJson, serve } from "../_shared/http.ts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

serve(async (req) => {
  const body = await readJson(req);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!/^[0-9a-f]{48}$/.test(token)) return json(req, 200, { status: "invalid" });

  await rateLimit(`questionnaire:ip:${clientIp(req)}`, 60, 600);
  const admin = adminClient();

  if (body.action === "open") {
    const { data, error } = await admin.rpc("questionnaire_by_token", { p_token: token });
    if (error) throw fromPostgrestError(error);
    return json(req, 200, data);
  }

  const birthdate = typeof body.birthdate === "string" ? body.birthdate : "";
  if (!DATE.test(birthdate)) throw new HttpError(422, "invalid_data", "Informe a data de nascimento.");

  if (body.action === "verify") {
    const { data, error } = await admin.rpc("questionnaire_by_token", { p_token: token, p_birthdate: birthdate });
    if (error) throw fromPostgrestError(error);
    return json(req, 200, data);
  }

  if (body.action === "submit") {
    const startedAt = typeof body.started_at === "string" && !Number.isNaN(Date.parse(body.started_at))
      ? body.started_at
      : null;
    const { data, error } = await admin.rpc("submit_questionnaire_by_token", {
      p_token: token,
      p_birthdate: birthdate,
      p_answers: body.answers ?? {},
      p_started_at: startedAt,
    });
    if (error) throw fromPostgrestError(error);
    return json(req, 200, data);
  }

  throw new HttpError(422, "invalid_data", "action deve ser 'open', 'verify' ou 'submit'.");
});

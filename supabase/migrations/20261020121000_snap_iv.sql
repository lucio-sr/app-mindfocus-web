-- SNAP-IV (18 itens: 1–9 desatenção, 10–18 hiperatividade/impulsividade) respondido pelos responsáveis.
--
-- Dois caminhos, mesma pontuação:
--   • link de uso único (sem login): a equipe gera o link; o responsável confirma a data de
--     nascimento da criança e responde. Edge Function `questionnaire` → RPCs só service_role.
--   • presencial: o colaborador aplica no painel (tablet) → submit_questionnaire_in_person.
-- Respostas: {"items": [0..3 × 18]} (0 nem um pouco, 1 só um pouco, 2 bastante, 3 demais).

-- ---------------------------------------------------------------------------
-- Respostas: autoria preservada mesmo se o responsável for desvinculado (como em consents)
-- ---------------------------------------------------------------------------

alter table public.questionnaire_responses drop constraint questionnaire_responses_patient_id_guardian_id_fkey;
alter table public.questionnaire_responses
  add constraint questionnaire_responses_guardian_id_fkey
    foreign key (guardian_id) references public.profiles (id) on delete set null,
  add column scores jsonb,
  add column channel text check (channel in ('link', 'in_person', 'guardian_area', 'legacy'));

create index questionnaire_responses_guardian_id_idx on public.questionnaire_responses (guardian_id);

-- ---------------------------------------------------------------------------
-- Pontuação
-- ---------------------------------------------------------------------------

-- Valida as respostas e calcula, por subescala, itens com "bastante" ou "demais" (ponto de corte
-- usual: 6 de 9) e a média.
create function private.snap_iv_score(p_answers jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_items numeric[];
  v_in numeric[];
  v_hi numeric[];
begin
  if jsonb_typeof(p_answers -> 'items') is distinct from 'array'
     or jsonb_array_length(p_answers -> 'items') <> 18 then
    raise exception 'o SNAP-IV tem 18 respostas' using errcode = 'invalid_parameter_value';
  end if;

  select array_agg(case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end order by n)
    into v_items
  from jsonb_array_elements(p_answers -> 'items') with ordinality as t(v, n);

  if exists (select 1 from unnest(v_items) x where x is null or x not between 0 and 3 or x <> trunc(x)) then
    raise exception 'cada resposta deve ser 0, 1, 2 ou 3' using errcode = 'invalid_parameter_value';
  end if;

  v_in := v_items[1:9];
  v_hi := v_items[10:18];

  return jsonb_build_object(
    'inattention', jsonb_build_object(
      'count', (select count(*) from unnest(v_in) x where x >= 2),
      'mean', round((select avg(x) from unnest(v_in) x), 2)),
    'hyperactivity', jsonb_build_object(
      'count', (select count(*) from unnest(v_hi) x where x >= 2),
      'mean', round((select avg(x) from unnest(v_hi) x), 2)),
    'total_mean', round((select avg(x) from unnest(v_items) x), 2)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Solicitações por link
-- ---------------------------------------------------------------------------

create table public.questionnaire_requests (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null,
  patient_id      uuid not null,
  guardian_id     uuid not null,
  instrument      text not null default 'snap_iv' check (instrument = 'snap_iv'),
  token_hash      text not null unique,
  expires_at      timestamptz not null,
  failed_attempts smallint not null default 0,
  completed_at    timestamptz,
  revoked_at      timestamptz,
  response_id     uuid references public.questionnaire_responses (id) on delete set null,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  foreign key (institution_id, patient_id) references public.patients (institution_id, id) on delete cascade,
  -- pedido pendente some se o responsável for desvinculado
  foreign key (patient_id, guardian_id) references public.patient_guardians (patient_id, guardian_id) on delete cascade
);

create index questionnaire_requests_patient_id_idx on public.questionnaire_requests (patient_id);
create index questionnaire_requests_institution_id_idx on public.questionnaire_requests (institution_id);

alter table public.questionnaire_requests enable row level security;

-- Colaboradores veem os pedidos (sem o hash); criação e uso só pelas RPCs.
create policy questionnaire_requests_select on public.questionnaire_requests
  for select to authenticated
  using (institution_id in (select private.member_institution_ids()));

revoke all on public.questionnaire_requests from authenticated, anon;
grant select (id, institution_id, patient_id, guardian_id, instrument, expires_at, failed_attempts,
              completed_at, revoked_at, response_id, created_by, created_at)
  on public.questionnaire_requests to authenticated;

-- Colaborador gera o link para um responsável do paciente. Revoga pedidos pendentes anteriores
-- do mesmo responsável. O token em texto só existe no retorno.
create function public.create_questionnaire_request(p_patient_id uuid, p_guardian_id uuid, p_valid_days int default 7)
returns table (request_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_institution_id uuid;
  v_token text;
  v_id uuid;
  v_expires timestamptz;
begin
  select g.institution_id into v_institution_id
  from public.patient_guardians g
  where g.patient_id = p_patient_id and g.guardian_id = p_guardian_id
    and g.institution_id in (select private.member_institution_ids());

  if v_institution_id is null then
    raise exception 'responsável não vinculado a este paciente' using errcode = 'insufficient_privilege';
  end if;
  if p_valid_days not between 1 and 30 then
    raise exception 'validade deve ficar entre 1 e 30 dias' using errcode = 'invalid_parameter_value';
  end if;

  update public.questionnaire_requests r
  set revoked_at = now()
  where r.patient_id = p_patient_id and r.guardian_id = p_guardian_id
    and r.completed_at is null and r.revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_expires := now() + make_interval(days => p_valid_days);

  insert into public.questionnaire_requests (institution_id, patient_id, guardian_id, token_hash, expires_at, created_by)
  values (v_institution_id, p_patient_id, p_guardian_id, private.sha256_hex(v_token), v_expires, (select auth.uid()))
  returning id into v_id;

  return query select v_id, v_token, v_expires;
end;
$$;

revoke execute on function public.create_questionnaire_request(uuid, uuid, int) from public, anon;
grant execute on function public.create_questionnaire_request(uuid, uuid, int) to authenticated;

-- Cancelar um pedido pendente (qualquer colaborador da instituição).
create function public.revoke_questionnaire_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.questionnaire_requests r
  set revoked_at = now()
  where r.id = p_request_id and r.completed_at is null and r.revoked_at is null
    and r.institution_id in (select private.member_institution_ids());
  if not found then
    raise exception 'pedido não encontrado ou já encerrado' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke execute on function public.revoke_questionnaire_request(uuid) from public, anon;
grant execute on function public.revoke_questionnaire_request(uuid) to authenticated;

-- Situação de um link (Edge Function). Sem a data de nascimento certa, não revela o nome da criança.
--   p_birthdate null: só abre (status + instituição).
--   p_birthdate informado: confere; após 5 erros o link é bloqueado.
create function public.questionnaire_by_token(p_token text, p_birthdate date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select q.*, i.name as institution_name, i.status as institution_status,
         p.full_name as patient_name, p.birthdate, pr.full_name as guardian_name
    into r
  from public.questionnaire_requests q
  join public.institutions i on i.id = q.institution_id
  join public.patients p on p.id = q.patient_id
  join public.profiles pr on pr.id = q.guardian_id
  where q.token_hash = private.sha256_hex(p_token);

  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if r.completed_at is not null then return jsonb_build_object('status', 'completed'); end if;
  if r.revoked_at is not null or r.institution_status <> 'active' then return jsonb_build_object('status', 'revoked'); end if;
  if r.expires_at < now() then return jsonb_build_object('status', 'expired'); end if;
  if r.failed_attempts >= 5 then return jsonb_build_object('status', 'locked'); end if;

  if p_birthdate is null then
    return jsonb_build_object('status', 'ok', 'institution_name', r.institution_name);
  end if;

  if p_birthdate <> r.birthdate then
    update public.questionnaire_requests set failed_attempts = failed_attempts + 1 where id = r.id;
    return jsonb_build_object('status', case when r.failed_attempts + 1 >= 5 then 'locked' else 'wrong_birthdate' end);
  end if;

  return jsonb_build_object(
    'status', 'verified',
    'institution_name', r.institution_name,
    'patient_first_name', split_part(r.patient_name, ' ', 1),
    'guardian_first_name', split_part(r.guardian_name, ' ', 1)
  );
end;
$$;

-- Envio das respostas pelo link (Edge Function). Confere a data de nascimento de novo.
create function public.submit_questionnaire_by_token(
  p_token text, p_birthdate date, p_answers jsonb, p_started_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
  r public.questionnaire_requests;
  v_response_id uuid;
begin
  v_check := public.questionnaire_by_token(p_token, p_birthdate);
  if v_check ->> 'status' <> 'verified' then return v_check; end if;

  select * into r from public.questionnaire_requests where token_hash = private.sha256_hex(p_token) for update;
  if r.completed_at is not null then return jsonb_build_object('status', 'completed'); end if;

  insert into public.questionnaire_responses
    (institution_id, patient_id, guardian_id, instrument, started_at, ended_at, answers, scores, channel, created_by)
  values
    (r.institution_id, r.patient_id, r.guardian_id, 'snap_iv', p_started_at, now(),
     jsonb_build_object('items', p_answers -> 'items'), private.snap_iv_score(p_answers), 'link', null)
  returning id into v_response_id;

  update public.questionnaire_requests set completed_at = now(), response_id = v_response_id where id = r.id;
  return jsonb_build_object('status', 'submitted');
end;
$$;

revoke execute on function public.questionnaire_by_token(text, date) from public, anon, authenticated;
revoke execute on function public.submit_questionnaire_by_token(text, date, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.questionnaire_by_token(text, date) to service_role;
grant execute on function public.submit_questionnaire_by_token(text, date, jsonb, timestamptz) to service_role;

-- Aplicação presencial (tablet no consultório), por qualquer colaborador da instituição.
create function public.submit_questionnaire_in_person(
  p_patient_id uuid, p_guardian_id uuid, p_answers jsonb, p_started_at timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_institution_id uuid;
  v_id uuid;
begin
  select g.institution_id into v_institution_id
  from public.patient_guardians g
  where g.patient_id = p_patient_id and g.guardian_id = p_guardian_id;

  if v_institution_id is null or v_institution_id not in (select private.member_institution_ids()) then
    raise exception 'responsável não vinculado a este paciente' using errcode = 'insufficient_privilege';
  end if;

  insert into public.questionnaire_responses
    (institution_id, patient_id, guardian_id, instrument, started_at, ended_at, answers, scores, channel)
  values
    (v_institution_id, p_patient_id, p_guardian_id, 'snap_iv', p_started_at, now(),
     jsonb_build_object('items', p_answers -> 'items'), private.snap_iv_score(p_answers), 'in_person')
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.submit_questionnaire_in_person(uuid, uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.submit_questionnaire_in_person(uuid, uuid, jsonb, timestamptz) to authenticated;

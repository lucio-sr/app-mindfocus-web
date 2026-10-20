-- Coleta: PINs, sessões do jogo (Unity), resultados por jogo, logs, questionário (chatbot)
-- e avaliações neuropsicológicas.
--
-- O Unity não tem conta no Auth. Fluxo:
--   1. Colaborador gera um PIN:        rpc issue_access_code(patient_id)      (authenticated)
--   2. Criança digita o PIN no jogo:   Edge Function pin-login
--        -> rpc redeem_game_access_code(code)  -> token opaco + id da sessão  (service_role)
--   3. Jogo envia os dados:            Edge Functions ingest-game / ingest-logs
--        -> rpc ingest_game_session(token, payload) / ingest_game_logs(...)   (service_role)
-- O institution_id sempre vem do token, nunca do payload enviado pelo cliente.

-- ---------------------------------------------------------------------------
-- PINs e sessões de dispositivo
-- ---------------------------------------------------------------------------

create table public.game_access_codes (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  patient_id     uuid not null,
  purpose        public.access_code_purpose not null default 'game',
  code_hash      text not null,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  revoked_at     timestamptz,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  foreign key (institution_id, patient_id)
    references public.patients (institution_id, id) on delete cascade
);

-- Um PIN pendente é único em toda a plataforma (o Unity só envia o PIN).
create unique index game_access_codes_pending_code_idx
  on public.game_access_codes (code_hash)
  where used_at is null and revoked_at is null;

create index game_access_codes_patient_idx on public.game_access_codes (patient_id, purpose);

create table public.game_device_sessions (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  patient_id     uuid not null,
  access_code_id uuid not null references public.game_access_codes (id) on delete cascade,
  purpose        public.access_code_purpose not null,
  token_hash     text not null unique,
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  foreign key (institution_id, patient_id)
    references public.patients (institution_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Sessões e resultados do jogo
-- ---------------------------------------------------------------------------

create table public.game_sessions (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null,
  patient_id        uuid not null,
  device_session_id uuid unique references public.game_device_sessions (id) on delete set null,
  started_at        timestamptz,
  ended_at          timestamptz,
  app_version       text,
  played            text[] not null default '{}',
  raw               jsonb,
  legacy_id         bigint unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (institution_id, patient_id)
    references public.patients (institution_id, id) on delete cascade,
  unique (institution_id, patient_id, id)
);

comment on column public.game_sessions.raw is 'Payload original enviado pelo jogo (GameSessionData).';
comment on column public.game_sessions.legacy_id is 'Data.MobileApp.id na base Flask (migração).';

create index game_sessions_institution_id_idx on public.game_sessions (institution_id);
create index game_sessions_patient_id_idx on public.game_sessions (patient_id);

-- Uma linha por jogo jogado. Substitui a leitura por posição (`data -> 0`, `-> 1`...) da view antiga.
create table public.game_results (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null,
  patient_id         uuid not null,
  session_id         uuid not null,
  test               public.game_test not null,
  attempt            smallint not null default 1 check (attempt >= 1),
  started_at         timestamptz,
  first_touch_at     timestamptz,
  ended_at           timestamptz,
  click_amount       integer,
  purposeless_clicks integer,
  hits               integer,
  total_errors       integer,
  metrics            jsonb not null default '{}',
  created_at         timestamptz not null default now(),
  foreign key (institution_id, patient_id, session_id)
    references public.game_sessions (institution_id, patient_id, id) on delete cascade,
  unique (session_id, test, attempt)
);

comment on column public.game_results.metrics is 'Objeto GameData completo enviado pelo jogo (métricas específicas de cada teste).';

create index game_results_institution_test_idx on public.game_results (institution_id, test);
create index game_results_patient_idx on public.game_results (patient_id);

create table public.game_logs (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  patient_id     uuid not null,
  session_id     uuid not null unique,
  data           jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (institution_id, patient_id, session_id)
    references public.game_sessions (institution_id, patient_id, id) on delete cascade
);

create index game_logs_patient_idx on public.game_logs (patient_id);

-- ---------------------------------------------------------------------------
-- Questionário (chatbot) e avaliações neuropsicológicas
-- ---------------------------------------------------------------------------

create table public.questionnaire_responses (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  patient_id     uuid not null,
  guardian_id    uuid,
  instrument     text not null default 'mindfocus_chatbot',
  started_at     timestamptz,
  ended_at       timestamptz,
  answers        jsonb not null,
  legacy_id      bigint unique,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  foreign key (institution_id, patient_id)
    references public.patients (institution_id, id) on delete cascade,
  -- se informado, o respondente precisa ser responsável por este paciente
  foreign key (patient_id, guardian_id)
    references public.patient_guardians (patient_id, guardian_id) on delete set null (guardian_id)
);

create index questionnaire_responses_institution_id_idx on public.questionnaire_responses (institution_id);
create index questionnaire_responses_patient_id_idx on public.questionnaire_responses (patient_id);

create table public.neuropsych_assessments (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  patient_id     uuid not null,
  instrument     public.neuro_instrument not null,
  applied_at     date,
  applied_by     uuid references public.profiles (id) on delete set null,
  scores         jsonb not null default '{}',
  notes          text,
  legacy_id      bigint,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (institution_id, patient_id)
    references public.patients (institution_id, id) on delete cascade
);

comment on column public.neuropsych_assessments.scores is 'Escores brutos/derivados do instrumento (TAVIS, FDT, Neupsilin...).';

create index neuropsych_assessments_institution_id_idx on public.neuropsych_assessments (institution_id);
create index neuropsych_assessments_patient_id_idx on public.neuropsych_assessments (patient_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger game_sessions_set_updated_at
  before update on public.game_sessions
  for each row execute function private.set_updated_at();

create trigger game_logs_set_updated_at
  before update on public.game_logs
  for each row execute function private.set_updated_at();

create trigger neuropsych_assessments_set_updated_at
  before update on public.neuropsych_assessments
  for each row execute function private.set_updated_at();

create trigger game_sessions_forbid_institution_change
  before update on public.game_sessions
  for each row execute function private.forbid_institution_change();

create trigger questionnaire_responses_forbid_institution_change
  before update on public.questionnaire_responses
  for each row execute function private.forbid_institution_change();

create trigger neuropsych_assessments_forbid_institution_change
  before update on public.neuropsych_assessments
  for each row execute function private.forbid_institution_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.game_access_codes enable row level security;
alter table public.game_device_sessions enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_results enable row level security;
alter table public.game_logs enable row level security;
alter table public.questionnaire_responses enable row level security;
alter table public.neuropsych_assessments enable row level security;

-- PINs: colaboradores veem os metadados (validade, uso), nunca o hash. Criação só pela RPC.
create policy game_access_codes_select on public.game_access_codes
  for select to authenticated
  using (institution_id in (select private.member_institution_ids()));

revoke all on public.game_access_codes from authenticated;
grant select (id, institution_id, patient_id, purpose, expires_at, used_at, revoked_at, created_by, created_at)
  on public.game_access_codes to authenticated;

-- Sessões de dispositivo: só service_role (sem políticas para authenticated).
revoke all on public.game_device_sessions from authenticated;

-- Dados do jogo: leitura pelos colaboradores; escrita só via RPCs de ingestão.
create policy game_sessions_select on public.game_sessions
  for select to authenticated
  using (institution_id in (select private.member_institution_ids()));

create policy game_sessions_delete on public.game_sessions
  for delete to authenticated
  using (institution_id in (select private.member_institution_ids('{admin}')));

revoke insert, update on public.game_sessions from authenticated;

create policy game_results_select on public.game_results
  for select to authenticated
  using (institution_id in (select private.member_institution_ids()));

revoke insert, update, delete on public.game_results from authenticated;

create policy game_logs_select on public.game_logs
  for select to authenticated
  using (institution_id in (select private.member_institution_ids()));

revoke insert, update, delete on public.game_logs from authenticated;

-- Questionário: colaboradores e o próprio responsável (para os seus pacientes).
create policy questionnaire_responses_select on public.questionnaire_responses
  for select to authenticated
  using (
    institution_id in (select private.member_institution_ids())
    or guardian_id = (select auth.uid())
  );

create policy questionnaire_responses_insert on public.questionnaire_responses
  for insert to authenticated
  with check (
    institution_id in (select private.member_institution_ids())
    or (guardian_id = (select auth.uid()) and patient_id in (select private.guarded_patient_ids()))
  );

create policy questionnaire_responses_delete on public.questionnaire_responses
  for delete to authenticated
  using (institution_id in (select private.member_institution_ids('{admin}')));

revoke update on public.questionnaire_responses from authenticated;

-- Avaliações neuropsicológicas: colaboradores.
create policy neuropsych_assessments_select on public.neuropsych_assessments
  for select to authenticated
  using (institution_id in (select private.member_institution_ids()));

create policy neuropsych_assessments_insert on public.neuropsych_assessments
  for insert to authenticated
  with check (institution_id in (select private.member_institution_ids()));

create policy neuropsych_assessments_update on public.neuropsych_assessments
  for update to authenticated
  using (institution_id in (select private.member_institution_ids()))
  with check (institution_id in (select private.member_institution_ids()));

create policy neuropsych_assessments_delete on public.neuropsych_assessments
  for delete to authenticated
  using (institution_id in (select private.member_institution_ids('{admin}')));

-- ---------------------------------------------------------------------------
-- Funções auxiliares da ingestão
-- ---------------------------------------------------------------------------

create function private.sha256_hex(value text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(extensions.digest(value, 'sha256'), 'hex') $$;

-- Converte os identificadores enviados pelo Unity (DataCollector.cs) para public.game_test.
-- Aceita também os nomes novos ('gonogo', 'tmt_a', ...).
create function private.map_game_test(test text, variant text)
returns public.game_test
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text := lower(btrim(coalesce(test, '')));
  v text := upper(btrim(coalesce(variant, '')));
begin
  if t in ('gonotgo', 'gonogo', 'go_no_go') then return 'gonogo'; end if;
  if t = 'tmt' and v = 'A' then return 'tmt_a'; end if;
  if t = 'tmt' and v = 'B' then return 'tmt_b'; end if;
  if t in ('tmt_a', 'tmta') then return 'tmt_a'; end if;
  if t in ('tmt_b', 'tmtb') then return 'tmt_b'; end if;
  if t = 'genius' then return 'genius'; end if;
  if t = 'stroop' then return 'stroop'; end if;
  raise exception 'teste desconhecido: % (variante %)', test, variant
    using errcode = 'invalid_parameter_value';
end;
$$;

-- Datas do jogo vêm como 'yyyy-MM-dd HH:mm:ss.ffffffzz'. DateTime não inicializado no C#
-- vira '0001-01-01 ...' (ex.: criança que nunca tocou na tela) -> null.
create function private.parse_game_timestamp(value text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  ts timestamptz;
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;
  ts := value::timestamptz;
  if ts < '2000-01-01'::timestamptz then
    return null;
  end if;
  return ts;
exception when others then
  return null;
end;
$$;

create function private.jsonb_int(value jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(value) = 'number' then (value #>> '{}')::numeric::integer end
$$;

-- Valida o token do dispositivo e devolve a sessão de dispositivo (com lock).
create function private.device_session_for_token(p_token text, p_purpose public.access_code_purpose)
returns public.game_device_sessions
language plpgsql
set search_path = ''
as $$
declare
  ds public.game_device_sessions;
begin
  select d.* into ds
  from public.game_device_sessions d
  join public.institutions i on i.id = d.institution_id
  where d.token_hash = private.sha256_hex(p_token)
    and d.purpose = p_purpose
    and d.revoked_at is null
    and d.expires_at > now()
    and i.status = 'active'
  for update of d;

  if not found then
    raise exception 'token inválido ou expirado' using errcode = 'invalid_authorization_specification';
  end if;
  return ds;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Gera um PIN de 8 dígitos para o paciente. Revoga PINs pendentes anteriores com a mesma
-- finalidade. O PIN em texto só existe no retorno desta função.
create function public.issue_access_code(
  p_patient_id uuid,
  p_purpose public.access_code_purpose default 'game',
  p_valid_for interval default interval '24 hours'
)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_institution_id uuid;
  v_code text;
  v_expires_at timestamptz;
begin
  select p.institution_id into v_institution_id
  from public.patients p
  where p.id = p_patient_id
    and p.institution_id in (select private.member_institution_ids());

  if v_institution_id is null then
    raise exception 'paciente não encontrado' using errcode = 'insufficient_privilege';
  end if;

  if p_valid_for < interval '5 minutes' or p_valid_for > interval '7 days' then
    raise exception 'validade deve ficar entre 5 minutos e 7 dias' using errcode = 'invalid_parameter_value';
  end if;

  update public.game_access_codes c
  set revoked_at = now()
  where c.patient_id = p_patient_id
    and c.purpose = p_purpose
    and c.used_at is null
    and c.revoked_at is null;

  v_expires_at := now() + p_valid_for;

  loop
    v_code := lpad(
      ((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 100000000)::text,
      8, '0');
    begin
      insert into public.game_access_codes (institution_id, patient_id, purpose, code_hash, expires_at, created_by)
      values (v_institution_id, p_patient_id, p_purpose, private.sha256_hex(v_code), v_expires_at, (select auth.uid()));
      exit;
    exception when unique_violation then
      -- colisão com outro PIN pendente: sorteia de novo
    end;
  end loop;

  return query select v_code, v_expires_at;
end;
$$;

revoke execute on function public.issue_access_code(uuid, public.access_code_purpose, interval) from public, anon;
grant execute on function public.issue_access_code(uuid, public.access_code_purpose, interval) to authenticated;

-- Resgata um PIN de jogo: marca como usado, abre a sessão do jogo e emite o token do dispositivo.
-- Retorna os mesmos dados que POST /v1/auth/login/pin devolvia (token e uuid da sessão).
create function public.redeem_game_access_code(p_code text)
returns table (token text, session_id uuid, patient_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.game_access_codes;
  v_token text;
  v_device_session_id uuid;
  v_session_id uuid;
  v_expires_at timestamptz := now() + interval '12 hours';
begin
  select ac.* into c
  from public.game_access_codes ac
  join public.institutions i on i.id = ac.institution_id
  where ac.code_hash = private.sha256_hex(btrim(p_code))
    and ac.purpose = 'game'
    and ac.used_at is null
    and ac.revoked_at is null
    and ac.expires_at > now()
    and i.status = 'active'
  for update of ac;

  if not found then
    raise exception 'PIN inválido ou expirado' using errcode = 'invalid_authorization_specification';
  end if;

  update public.game_access_codes set used_at = now() where id = c.id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.game_device_sessions (institution_id, patient_id, access_code_id, purpose, token_hash, expires_at)
  values (c.institution_id, c.patient_id, c.id, 'game', private.sha256_hex(v_token), v_expires_at)
  returning id into v_device_session_id;

  insert into public.game_sessions (institution_id, patient_id, device_session_id)
  values (c.institution_id, c.patient_id, v_device_session_id)
  returning id into v_session_id;

  return query select v_token, v_session_id, c.patient_id, v_expires_at;
end;
$$;

-- Resgata um PIN do simulador: devolve os logs de jogo do paciente.
-- Formato compatível com POST /v1/auth/login/logs ({"logs": [...] } ou {"logs": null}).
create function public.redeem_simulator_access_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.game_access_codes;
begin
  select ac.* into c
  from public.game_access_codes ac
  join public.institutions i on i.id = ac.institution_id
  where ac.code_hash = private.sha256_hex(btrim(p_code))
    and ac.purpose = 'simulator'
    and ac.used_at is null
    and ac.revoked_at is null
    and ac.expires_at > now()
    and i.status = 'active'
  for update of ac;

  if not found then
    raise exception 'PIN inválido ou expirado' using errcode = 'invalid_authorization_specification';
  end if;

  update public.game_access_codes set used_at = now() where id = c.id;

  return jsonb_build_object(
    'patient_id', c.patient_id,
    'logs', (
      select jsonb_agg(l.data order by s.started_at nulls last, l.created_at)
      from public.game_logs l
      join public.game_sessions s on s.id = l.session_id
      where l.patient_id = c.patient_id
    )
  );
end;
$$;

-- Grava a sessão enviada pelo jogo (GameSessionData). Idempotente: reenviar o mesmo arquivo
-- substitui os resultados da sessão, como a API Flask fazia.
create function public.ingest_game_session(p_token text, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ds public.game_device_sessions;
  s public.game_sessions;
  v_games jsonb := coalesce(p_payload -> 'data', '[]'::jsonb);
begin
  ds := private.device_session_for_token(p_token, 'game');

  select gs.* into s from public.game_sessions gs where gs.device_session_id = ds.id for update;
  if not found then
    raise exception 'sessão do jogo não encontrada' using errcode = 'no_data_found';
  end if;

  if p_payload ? 'uuid' and p_payload ->> 'uuid' is distinct from s.id::text then
    raise exception 'uuid do payload não corresponde à sessão do token'
      using errcode = 'invalid_parameter_value';
  end if;

  if jsonb_typeof(v_games) <> 'array' then
    raise exception 'campo data deve ser uma lista' using errcode = 'invalid_parameter_value';
  end if;

  update public.game_sessions
  set started_at  = coalesce(started_at, private.parse_game_timestamp(p_payload ->> 'start_time')),
      ended_at    = private.parse_game_timestamp(p_payload ->> 'end_time'),
      app_version = coalesce(p_payload ->> 'game_version', app_version),
      played      = array(
                      select private.map_game_test(g ->> 'test', g ->> 'variante')::text
                      from jsonb_array_elements(v_games) with ordinality as e (g, n)
                      order by n),
      raw         = p_payload
  where id = s.id;

  delete from public.game_results where session_id = s.id;

  insert into public.game_results (
    institution_id, patient_id, session_id, test, attempt,
    started_at, first_touch_at, ended_at,
    click_amount, purposeless_clicks, hits, total_errors, metrics)
  select
    s.institution_id, s.patient_id, s.id, x.test,
    row_number() over (partition by x.test order by x.n)::smallint,
    private.parse_game_timestamp(x.g ->> 'testStartTime'),
    private.parse_game_timestamp(x.g ->> 'firstGameTouchTime'),
    private.parse_game_timestamp(x.g ->> 'testEndTime'),
    private.jsonb_int(x.g -> 'clickAmount'),
    private.jsonb_int(x.g -> 'purposelessClicks'),
    private.jsonb_int(x.g -> 'acertos'),
    private.jsonb_int(x.g -> 'totalErrors'),
    x.g
  from (
    select e.g, e.n, private.map_game_test(e.g ->> 'test', e.g ->> 'variante') as test
    from jsonb_array_elements(v_games) with ordinality as e (g, n)
  ) as x;

  return s.id;
end;
$$;

-- Grava o log da sessão (LogSystem). Um log por sessão; reenvio substitui.
create function public.ingest_game_logs(p_token text, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ds public.game_device_sessions;
  v_session_id uuid;
begin
  ds := private.device_session_for_token(p_token, 'game');

  select gs.id into v_session_id from public.game_sessions gs where gs.device_session_id = ds.id;
  if v_session_id is null then
    raise exception 'sessão do jogo não encontrada' using errcode = 'no_data_found';
  end if;

  insert into public.game_logs (institution_id, patient_id, session_id, data)
  values (ds.institution_id, ds.patient_id, v_session_id, p_payload)
  on conflict (session_id) do update set data = excluded.data;

  return v_session_id;
end;
$$;

-- RPCs chamadas só pelas Edge Functions (service_role).
revoke execute on function public.redeem_game_access_code(text) from public, anon, authenticated;
revoke execute on function public.redeem_simulator_access_code(text) from public, anon, authenticated;
revoke execute on function public.ingest_game_session(text, jsonb) from public, anon, authenticated;
revoke execute on function public.ingest_game_logs(text, jsonb) from public, anon, authenticated;
grant execute on function public.redeem_game_access_code(text) to service_role;
grant execute on function public.redeem_simulator_access_code(text) to service_role;
grant execute on function public.ingest_game_session(text, jsonb) to service_role;
grant execute on function public.ingest_game_logs(text, jsonb) to service_role;

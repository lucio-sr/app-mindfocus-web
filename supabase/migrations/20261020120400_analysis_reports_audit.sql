-- Análises (modelo bayesiano), laudos, auditoria e estatísticas do superadmin.

-- ---------------------------------------------------------------------------
-- Modelos e execuções de análise
-- ---------------------------------------------------------------------------

-- Modelo global: um único padrão para todas as instituições (decisão de 20/10/2026).
create table public.analysis_models (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  version     text not null,
  is_default  boolean not null default false,
  cut_points  jsonb not null default '{}',
  network     jsonb not null default '{}',
  metadata    jsonb not null default '{}',
  trained_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (name, version)
);

create unique index analysis_models_single_default_idx
  on public.analysis_models (is_default) where is_default;

create table public.analysis_runs (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  patient_id     uuid not null,
  model_id       uuid not null references public.analysis_models (id) on delete restrict,
  session_id     uuid,
  inputs         jsonb not null default '{}',
  p_adhd         numeric(5, 4) check (p_adhd between 0 and 1),
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  foreign key (institution_id, patient_id)
    references public.patients (institution_id, id) on delete cascade,
  foreign key (institution_id, patient_id, session_id)
    references public.game_sessions (institution_id, patient_id, id) on delete set null (session_id),
  unique (institution_id, id)
);

create index analysis_runs_patient_id_idx on public.analysis_runs (patient_id);
create index analysis_runs_institution_id_idx on public.analysis_runs (institution_id);

-- ---------------------------------------------------------------------------
-- Laudos (PDF no bucket privado `reports`, caminho `{institution_id}/...`)
-- ---------------------------------------------------------------------------

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null,
  patient_id      uuid not null,
  kind            public.report_kind not null,
  storage_path    text not null unique,
  notes           text,
  analysis_run_id uuid,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  foreign key (institution_id, patient_id)
    references public.patients (institution_id, id) on delete cascade,
  foreign key (institution_id, analysis_run_id)
    references public.analysis_runs (institution_id, id) on delete set null (analysis_run_id),
  check (storage_path like institution_id::text || '/%')
);

create index reports_patient_id_idx on public.reports (patient_id);
create index reports_institution_id_idx on public.reports (institution_id);

create trigger analysis_runs_forbid_institution_change
  before update on public.analysis_runs
  for each row execute function private.forbid_institution_change();

create trigger reports_forbid_institution_change
  before update on public.reports
  for each row execute function private.forbid_institution_change();

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------

-- Registra quem alterou o quê. Guarda só os nomes das colunas alteradas, não os valores,
-- para não duplicar dados pessoais.
create table public.audit_log (
  id              bigint generated always as identity primary key,
  institution_id  uuid,
  actor_id        uuid,
  action          text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name      text not null,
  record_id       text,
  changed_columns text[],
  created_at      timestamptz not null default now()
);

create index audit_log_institution_created_idx on public.audit_log (institution_id, created_at desc);

create function private.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) as k
    where k <> 'updated_at' and v_new -> k is distinct from v_old -> k;
    if v_changed is null then
      return null;
    end if;
  end if;

  insert into public.audit_log (institution_id, actor_id, action, table_name, record_id, changed_columns)
  values (
    case when tg_table_name = 'institutions' then (v_row ->> 'id')::uuid
         else (v_row ->> 'institution_id')::uuid end,
    (select auth.uid()),
    tg_op,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id', v_row ->> 'guardian_id'),
    v_changed
  );
  return null;
end;
$$;

create trigger audit after insert or update or delete on public.institutions
  for each row execute function private.audit_trigger();
create trigger audit after insert or update or delete on public.institution_members
  for each row execute function private.audit_trigger();
create trigger audit after insert or update or delete on public.patients
  for each row execute function private.audit_trigger();
create trigger audit after insert or update or delete on public.patient_guardians
  for each row execute function private.audit_trigger();
create trigger audit after insert or update or delete on public.consents
  for each row execute function private.audit_trigger();
create trigger audit after insert or update or delete on public.neuropsych_assessments
  for each row execute function private.audit_trigger();
create trigger audit after insert or update or delete on public.reports
  for each row execute function private.audit_trigger();
create trigger audit after delete on public.game_sessions
  for each row execute function private.audit_trigger();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.analysis_models enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.reports enable row level security;
alter table public.audit_log enable row level security;

create policy analysis_models_select on public.analysis_models
  for select to authenticated
  using (true);

create policy analysis_models_write on public.analysis_models
  for all to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

create policy analysis_runs_select on public.analysis_runs
  for select to authenticated
  using (institution_id in (select private.member_institution_ids()));

create policy analysis_runs_insert on public.analysis_runs
  for insert to authenticated
  with check (institution_id in (select private.member_institution_ids()));

create policy analysis_runs_delete on public.analysis_runs
  for delete to authenticated
  using (institution_id in (select private.member_institution_ids('{admin}')));

revoke update on public.analysis_runs from authenticated;

create policy reports_select on public.reports
  for select to authenticated
  using (institution_id in (select private.member_institution_ids()));

create policy reports_insert on public.reports
  for insert to authenticated
  with check (institution_id in (select private.member_institution_ids('{admin,psychologist}')));

create policy reports_delete on public.reports
  for delete to authenticated
  using (institution_id in (select private.member_institution_ids('{admin}')));

revoke update on public.reports from authenticated;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    institution_id in (select private.member_institution_ids('{admin}'))
    or (select private.is_platform_admin())
  );

revoke insert, update, delete on public.audit_log from authenticated;

-- ---------------------------------------------------------------------------
-- Superadmin: estatísticas agregadas (sem dados pessoais)
-- ---------------------------------------------------------------------------

create function public.platform_institution_stats()
returns table (
  institution_id uuid,
  name text,
  status public.institution_status,
  members bigint,
  patients bigint,
  game_sessions bigint,
  reports bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'apenas superadmin' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    i.id,
    i.name,
    i.status,
    (select count(*) from public.institution_members m where m.institution_id = i.id and m.active),
    (select count(*) from public.patients p where p.institution_id = i.id),
    (select count(*) from public.game_sessions s where s.institution_id = i.id),
    (select count(*) from public.reports r where r.institution_id = i.id),
    i.created_at
  from public.institutions i
  order by i.name;
end;
$$;

revoke execute on function public.platform_institution_stats() from public, anon;
grant execute on function public.platform_institution_stats() to authenticated;

-- Pacientes (crianças avaliadas), responsáveis e consentimentos.
-- Todo colaborador ativo da instituição vê e cadastra pacientes dela; só admin exclui.

create table public.patients (
  id                   uuid primary key default gen_random_uuid(),
  institution_id       uuid not null references public.institutions (id) on delete restrict,
  full_name            text not null check (btrim(full_name) <> ''),
  cpf                  text check (cpf is null or private.is_valid_cpf(cpf)),
  birthdate            date not null,
  gender               text,
  education            text,
  public_school        boolean,
  school_dropout       boolean not null default false,
  school_dropout_times smallint not null default 0 check (school_dropout_times >= 0),
  school_failure       boolean not null default false,
  school_failure_times smallint not null default 0 check (school_failure_times >= 0),
  medications          text[] not null default '{}',
  siblings             smallint not null default 0 check (siblings >= 0),
  adhd_diagnosis       boolean not null default false,
  autism_diagnosis     boolean not null default false,
  notes                text,
  uf                   text check (uf ~ '^[A-Z]{2}$'),
  legacy_id            bigint unique,
  created_by           uuid references auth.users (id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (institution_id, cpf),
  -- alvo das FKs compostas: garante que registros filhos são da mesma instituição do paciente
  unique (institution_id, id)
);

comment on column public.patients.legacy_id is 'Users.Common.id na base Flask (migração).';

create index patients_institution_id_idx on public.patients (institution_id);

create table public.patient_guardians (
  institution_id uuid not null,
  patient_id     uuid not null,
  guardian_id    uuid not null references public.profiles (id) on delete cascade,
  relationship   text not null,
  income         text,
  created_at     timestamptz not null default now(),
  primary key (patient_id, guardian_id),
  foreign key (institution_id, patient_id)
    references public.patients (institution_id, id) on delete cascade
);

create index patient_guardians_guardian_id_idx on public.patient_guardians (guardian_id);
create index patient_guardians_institution_id_idx on public.patient_guardians (institution_id);

-- LGPD art. 14: consentimento específico de um dos pais ou responsável legal.
create table public.consents (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  patient_id     uuid not null,
  guardian_id    uuid not null,
  term_version   text not null,
  accepted_at    timestamptz not null default now(),
  revoked_at     timestamptz,
  recorded_by    uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (institution_id, patient_id)
    references public.patients (institution_id, id) on delete cascade,
  foreign key (patient_id, guardian_id)
    references public.patient_guardians (patient_id, guardian_id),
  check (revoked_at is null or revoked_at >= accepted_at)
);

create index consents_institution_id_idx on public.consents (institution_id);
create index consents_patient_id_idx on public.consents (patient_id);

-- ---------------------------------------------------------------------------
-- Funções de autorização
-- ---------------------------------------------------------------------------

-- Pacientes dos quais o usuário atual é responsável, em instituições ativas.
create function private.guarded_patient_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.patient_id
  from public.patient_guardians g
  join public.institutions i on i.id = g.institution_id
  where g.guardian_id = (select auth.uid())
    and i.status = 'active';
$$;

create or replace function private.can_view_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target = (select auth.uid())
    or exists (
      select 1 from public.institution_members m
      where m.user_id = target
        and m.institution_id in (select private.member_institution_ids())
    )
    or exists (
      select 1 from public.patient_guardians g
      where g.guardian_id = target
        and g.institution_id in (select private.member_institution_ids())
    )
    or (
      private.is_platform_admin()
      and (
        exists (select 1 from public.institution_members m where m.user_id = target)
        or exists (select 1 from public.platform_admins pa where pa.user_id = target)
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger patients_set_updated_at
  before update on public.patients
  for each row execute function private.set_updated_at();

create trigger patients_forbid_institution_change
  before update on public.patients
  for each row execute function private.forbid_institution_change();

create trigger patient_guardians_forbid_institution_change
  before update on public.patient_guardians
  for each row execute function private.forbid_institution_change();

create trigger consents_forbid_institution_change
  before update on public.consents
  for each row execute function private.forbid_institution_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.patients enable row level security;
alter table public.patient_guardians enable row level security;
alter table public.consents enable row level security;

-- patients
create policy patients_select_members on public.patients
  for select to authenticated
  using (institution_id in (select private.member_institution_ids()));

create policy patients_select_guardians on public.patients
  for select to authenticated
  using (id in (select private.guarded_patient_ids()));

create policy patients_insert on public.patients
  for insert to authenticated
  with check (institution_id in (select private.member_institution_ids()));

create policy patients_update on public.patients
  for update to authenticated
  using (institution_id in (select private.member_institution_ids()))
  with check (institution_id in (select private.member_institution_ids()));

create policy patients_delete on public.patients
  for delete to authenticated
  using (institution_id in (select private.member_institution_ids('{admin}')));

-- patient_guardians
create policy patient_guardians_select on public.patient_guardians
  for select to authenticated
  using (
    institution_id in (select private.member_institution_ids())
    or patient_id in (select private.guarded_patient_ids())
  );

create policy patient_guardians_insert on public.patient_guardians
  for insert to authenticated
  with check (institution_id in (select private.member_institution_ids()));

create policy patient_guardians_update on public.patient_guardians
  for update to authenticated
  using (institution_id in (select private.member_institution_ids()))
  with check (institution_id in (select private.member_institution_ids()));

create policy patient_guardians_delete on public.patient_guardians
  for delete to authenticated
  using (institution_id in (select private.member_institution_ids()));

-- consents: registrados pela instituição ou pelo próprio responsável; só a revogação é editável
create policy consents_select on public.consents
  for select to authenticated
  using (
    institution_id in (select private.member_institution_ids())
    or guardian_id = (select auth.uid())
  );

create policy consents_insert on public.consents
  for insert to authenticated
  with check (
    institution_id in (select private.member_institution_ids())
    or (guardian_id = (select auth.uid()) and patient_id in (select private.guarded_patient_ids()))
  );

create policy consents_update on public.consents
  for update to authenticated
  using (
    institution_id in (select private.member_institution_ids())
    or guardian_id = (select auth.uid())
  )
  with check (
    institution_id in (select private.member_institution_ids())
    or guardian_id = (select auth.uid())
  );

revoke update, delete on public.consents from authenticated;
grant update (revoked_at) on public.consents to authenticated;

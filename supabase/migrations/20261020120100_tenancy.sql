-- Tenancy e identidade: instituições, perfis, colaboradores e superadmins.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.institutions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (btrim(name) <> ''),
  legal_name    text,
  document_type public.document_type not null,
  document      text not null unique,
  email         extensions.citext,
  phone         text,
  cep           text check (cep ~ '^\d{8}$'),
  street        text,
  number        text,
  complement    text,
  district      text,
  city          text,
  uf            text check (uf ~ '^[A-Z]{2}$'),
  logo_path     text,
  status        public.institution_status not null default 'active',
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint institutions_document_valid check (
    (document_type = 'cpf'  and private.is_valid_cpf(document)) or
    (document_type = 'cnpj' and private.is_valid_cnpj(document))
  )
);

comment on table public.institutions is 'Tenants. Cada instituição é dona dos seus pacientes, coletas e laudos.';

-- Pessoas com login (colaboradores e responsáveis). 1:1 com auth.users.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (btrim(full_name) <> ''),
  cpf         text not null unique check (private.is_valid_cpf(cpf)),
  email       extensions.citext not null unique,
  phone       text,
  birthdate   date,
  gender      text,
  crp_number  text,
  crp_uf      text check (crp_uf ~ '^[A-Z]{2}$'),
  cep         text check (cep ~ '^\d{8}$'),
  street      text,
  number      text,
  complement  text,
  district    text,
  city        text,
  uf          text check (uf ~ '^[A-Z]{2}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.profiles.cpf is 'Identificador de login (CPF + senha).';
comment on column public.profiles.email is 'Espelho de auth.users.email; usado para recuperação de senha e convites.';

create table public.institution_members (
  institution_id uuid not null references public.institutions (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  role           public.member_role not null,
  active         boolean not null default true,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (institution_id, user_id)
);

create index institution_members_user_id_idx on public.institution_members (user_id);

-- Equipe MindFocus. Administra instituições; não lê dados clínicos.
create table public.platform_admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Funções de autorização (usadas pelas políticas RLS)
-- ---------------------------------------------------------------------------

create function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = (select auth.uid())
  );
$$;

-- Instituições ativas em que o usuário atual é colaborador ativo (opcionalmente filtrando papéis).
-- Use em políticas como `institution_id in (select private.member_institution_ids())`:
-- a subconsulta não é correlacionada, então roda uma vez por consulta, não por linha.
create function private.member_institution_ids(roles public.member_role[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.institution_id
  from public.institution_members m
  join public.institutions i on i.id = m.institution_id
  where m.user_id = (select auth.uid())
    and m.active
    and i.status = 'active'
    and (roles is null or m.role = any (roles));
$$;

-- ---------------------------------------------------------------------------
-- Sincronização auth.users -> profiles
-- ---------------------------------------------------------------------------

-- Contas são criadas só por Edge Functions (auth.admin.createUser / inviteUserByEmail) com
-- user_metadata = { "full_name": "...", "cpf": "..." }. Sem esses dados a criação falha.
create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    raise exception 'e-mail é obrigatório' using errcode = 'not_null_violation';
  end if;

  insert into public.profiles (id, full_name, cpf, email)
  values (
    new.id,
    btrim(new.raw_user_meta_data ->> 'full_name'),
    private.only_digits(new.raw_user_meta_data ->> 'cpf'),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create function private.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email and new.email is not null)
  execute function private.handle_auth_user_email_change();

-- ---------------------------------------------------------------------------
-- Regras de negócio em triggers
-- ---------------------------------------------------------------------------

-- Só o superadmin muda documento e status de uma instituição. Chamadas sem usuário
-- (service_role, migrações) passam.
create function private.guard_institution_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not private.is_platform_admin() then
    if new.status is distinct from old.status
       or new.document is distinct from old.document
       or new.document_type is distinct from old.document_type then
      raise exception 'apenas o superadmin altera documento ou status da instituição'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

-- Toda instituição precisa manter ao menos um admin ativo.
-- SECURITY DEFINER: a checagem não pode depender do RLS de quem está se desativando.
create function private.ensure_institution_has_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.active
     and exists (select 1 from public.institutions i where i.id = old.institution_id)
     and not exists (
       select 1 from public.institution_members m
       where m.institution_id = old.institution_id and m.role = 'admin' and m.active
     ) then
    raise exception 'a instituição precisa manter ao menos um admin ativo'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create trigger institutions_set_updated_at
  before update on public.institutions
  for each row execute function private.set_updated_at();

create trigger institutions_guard_update
  before update on public.institutions
  for each row execute function private.guard_institution_update();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger institution_members_set_updated_at
  before update on public.institution_members
  for each row execute function private.set_updated_at();

create trigger institution_members_forbid_institution_change
  before update on public.institution_members
  for each row execute function private.forbid_institution_change();

create trigger institution_members_keep_admin
  after update or delete on public.institution_members
  for each row execute function private.ensure_institution_has_admin();

-- ---------------------------------------------------------------------------
-- Visibilidade de perfis
-- ---------------------------------------------------------------------------

-- Redefinida na migração de pacientes para incluir responsáveis. Aqui: o próprio usuário,
-- colegas de instituição e, para o superadmin, contas de colaboradores e superadmins.
create function private.can_view_profile(target uuid)
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
    or (
      private.is_platform_admin()
      and (
        exists (select 1 from public.institution_members m where m.user_id = target)
        or exists (select 1 from public.platform_admins pa where pa.user_id = target)
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.institutions enable row level security;
alter table public.profiles enable row level security;
alter table public.institution_members enable row level security;
alter table public.platform_admins enable row level security;

-- institutions
create policy institutions_select on public.institutions
  for select to authenticated
  using (
    (select private.is_platform_admin())
    or exists (
      select 1 from public.institution_members m
      where m.institution_id = institutions.id and m.user_id = (select auth.uid()) and m.active
    )
  );

create policy institutions_insert on public.institutions
  for insert to authenticated
  with check ((select private.is_platform_admin()));

create policy institutions_update on public.institutions
  for update to authenticated
  using (
    (select private.is_platform_admin())
    or id in (select private.member_institution_ids('{admin}'))
  )
  with check (
    (select private.is_platform_admin())
    or id in (select private.member_institution_ids('{admin}'))
  );

create policy institutions_delete on public.institutions
  for delete to authenticated
  using ((select private.is_platform_admin()));

-- profiles (inserção só pelo trigger; e-mail e CPF não são editáveis pelo cliente)
create policy profiles_select on public.profiles
  for select to authenticated
  using ((select private.can_view_profile(id)));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, phone, birthdate, gender, crp_number, crp_uf,
              cep, street, number, complement, district, city, uf)
  on public.profiles to authenticated;

-- institution_members
create policy institution_members_select on public.institution_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or institution_id in (select private.member_institution_ids())
    or (select private.is_platform_admin())
  );

create policy institution_members_insert on public.institution_members
  for insert to authenticated
  with check (
    (select private.is_platform_admin())
    or institution_id in (select private.member_institution_ids('{admin}'))
  );

create policy institution_members_update on public.institution_members
  for update to authenticated
  using (
    (select private.is_platform_admin())
    or institution_id in (select private.member_institution_ids('{admin}'))
  )
  with check (
    (select private.is_platform_admin())
    or institution_id in (select private.member_institution_ids('{admin}'))
  );

create policy institution_members_delete on public.institution_members
  for delete to authenticated
  using (
    (select private.is_platform_admin())
    or institution_id in (select private.member_institution_ids('{admin}'))
  );

-- platform_admins: gerido só via SQL/service_role
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));

revoke insert, update, delete on public.platform_admins from authenticated;

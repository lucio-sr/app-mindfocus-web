-- Fase 2: apoio às Edge Functions de auth e cadastro.
--
-- As Edge Functions só criam a conta no Auth (o que exige service_role). As gravações no banco
-- passam pelas RPCs abaixo, chamadas com o JWT de quem fez a requisição: são SECURITY INVOKER,
-- então o RLS continua decidindo quem pode o quê, e cada cadastro acontece numa transação só.

-- ---------------------------------------------------------------------------
-- Limite de tentativas (login e recuperação por CPF)
-- ---------------------------------------------------------------------------

-- Janela fixa por chave. A chave guarda só o hash (ex.: sha256 de 'login:cpf:<cpf>'), nunca o CPF.
create table private.rate_limits (
  key_hash     text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key_hash, window_start)
);

-- Conta uma tentativa e devolve true se ainda estiver dentro do limite.
create function public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_hits integer;
begin
  if p_max < 1 or p_window_seconds < 1 then
    raise exception 'limite inválido' using errcode = 'invalid_parameter_value';
  end if;

  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into private.rate_limits as r (key_hash, window_start, hits)
  values (private.sha256_hex(p_key), v_start, 1)
  on conflict (key_hash, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- limpeza oportunista das janelas antigas
  if random() < 0.02 then
    delete from private.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_max;
end;
$$;

revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- O que o usuário logado pode fazer (Edge Functions e frontend)
-- ---------------------------------------------------------------------------

create function public.current_user_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', (select auth.uid()),
    'is_platform_admin', private.is_platform_admin(),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
               'institution_id', i.id,
               'institution_name', i.name,
               'role', m.role
             ) order by i.name)
      from public.institution_members m
      join public.institutions i on i.id = m.institution_id
      where m.user_id = (select auth.uid()) and m.active and i.status = 'active'
    ), '[]'::jsonb),
    'is_guardian', exists (select 1 from private.guarded_patient_ids())
  )
  where (select auth.uid()) is not null;
$$;

revoke execute on function public.current_user_access() from public, anon;
grant execute on function public.current_user_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Cadastro de instituição com o primeiro admin (superadmin)
-- ---------------------------------------------------------------------------

-- p_institution: name, legal_name, document (CPF ou CNPJ, com ou sem máscara), document_type
-- (opcional: deduzido do tamanho), email, phone, cep, street, number, complement, district, city, uf.
create function public.create_institution(p_institution jsonb, p_admin_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.institutions;
  v_document text;
  v_type public.document_type;
  v_id uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'apenas o superadmin cria instituições' using errcode = 'insufficient_privilege';
  end if;

  r := jsonb_populate_record(null::public.institutions, p_institution);
  v_document := private.only_digits(p_institution ->> 'document');
  v_type := coalesce(r.document_type,
                     case length(v_document) when 11 then 'cpf' when 14 then 'cnpj' end::public.document_type);
  if v_type is null then
    raise exception 'documento deve ser CPF (11 dígitos) ou CNPJ (14 dígitos)' using errcode = 'check_violation';
  end if;

  insert into public.institutions (
    name, legal_name, document_type, document, email, phone,
    cep, street, number, complement, district, city, uf, created_by
  ) values (
    btrim(r.name), nullif(btrim(r.legal_name), ''), v_type, v_document, nullif(btrim(r.email), ''),
    nullif(btrim(r.phone), ''), private.only_digits(r.cep), nullif(btrim(r.street), ''),
    nullif(btrim(r.number), ''), nullif(btrim(r.complement), ''), nullif(btrim(r.district), ''),
    nullif(btrim(r.city), ''), upper(nullif(btrim(r.uf), '')), (select auth.uid())
  )
  returning id into v_id;

  insert into public.institution_members (institution_id, user_id, role, created_by)
  values (v_id, p_admin_id, 'admin', (select auth.uid()));

  return v_id;
end;
$$;

revoke execute on function public.create_institution(jsonb, uuid) from public, anon;
grant execute on function public.create_institution(jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Colaboradores (admin da instituição ou superadmin)
-- ---------------------------------------------------------------------------

-- Inclui o usuário na instituição, ou reativa/muda o papel se ele já estava lá.
-- Devolve 'created', 'reactivated', 'updated' ou 'unchanged'.
create function public.add_institution_member(
  p_institution_id uuid,
  p_user_id uuid,
  p_role public.member_role
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.institution_members;
begin
  if not (private.is_platform_admin()
          or p_institution_id in (select private.member_institution_ids('{admin}'))) then
    raise exception 'apenas admins da instituição incluem colaboradores'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_old
  from public.institution_members
  where institution_id = p_institution_id and user_id = p_user_id;

  if not found then
    insert into public.institution_members (institution_id, user_id, role, created_by)
    values (p_institution_id, p_user_id, p_role, (select auth.uid()));
    return 'created';
  end if;

  if v_old.active and v_old.role = p_role then
    return 'unchanged';
  end if;

  update public.institution_members
  set role = p_role, active = true
  where institution_id = p_institution_id and user_id = p_user_id;

  return case when v_old.active then 'updated' else 'reactivated' end;
end;
$$;

revoke execute on function public.add_institution_member(uuid, uuid, public.member_role) from public, anon;
grant execute on function public.add_institution_member(uuid, uuid, public.member_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Responsável + pacientes (qualquer colaborador ativo da instituição)
-- ---------------------------------------------------------------------------

-- p_patients: lista de objetos. Cada item ou referencia um paciente existente da instituição
-- ({"patient_id": ..., "relationship": ...}) ou traz os campos de um paciente novo
-- (full_name, birthdate, cpf, gender, education, public_school, school_dropout(_times),
-- school_failure(_times), medications, siblings, adhd_diagnosis, autism_diagnosis, notes, uf,
-- relationship, income). Com p_consent_term_version, registra o consentimento de cada vínculo.
-- Devolve os ids dos pacientes, na ordem recebida.
create function public.register_guardian_patients(
  p_institution_id uuid,
  p_guardian_id uuid,
  p_patients jsonb,
  p_consent_term_version text default null
)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  r public.patients;
  v_patient_id uuid;
  v_ids uuid[] := '{}';
begin
  if p_institution_id not in (select private.member_institution_ids()) then
    raise exception 'apenas colaboradores da instituição cadastram responsáveis'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(p_patients) is distinct from 'array' or jsonb_array_length(p_patients) = 0 then
    raise exception 'informe ao menos um paciente' using errcode = 'invalid_parameter_value';
  end if;

  for v_item in select value from jsonb_array_elements(p_patients) loop
    if nullif(btrim(v_item ->> 'relationship'), '') is null then
      raise exception 'informe o parentesco (relationship) de cada paciente' using errcode = 'not_null_violation';
    end if;

    if v_item ? 'patient_id' then
      v_patient_id := (v_item ->> 'patient_id')::uuid;
      -- confere pelo RLS: precisa ser um paciente visível desta instituição
      perform 1 from public.patients p where p.id = v_patient_id and p.institution_id = p_institution_id;
      if not found then
        raise exception 'paciente % não encontrado nesta instituição', v_patient_id
          using errcode = 'foreign_key_violation';
      end if;
    else
      r := jsonb_populate_record(null::public.patients, v_item);
      insert into public.patients (
        institution_id, full_name, cpf, birthdate, gender, education, public_school,
        school_dropout, school_dropout_times, school_failure, school_failure_times,
        medications, siblings, adhd_diagnosis, autism_diagnosis, notes, uf
      ) values (
        p_institution_id, btrim(r.full_name), private.only_digits(v_item ->> 'cpf'), r.birthdate,
        nullif(btrim(r.gender), ''), nullif(btrim(r.education), ''), r.public_school,
        coalesce(r.school_dropout, false), coalesce(r.school_dropout_times, 0),
        coalesce(r.school_failure, false), coalesce(r.school_failure_times, 0),
        coalesce(r.medications, '{}'), coalesce(r.siblings, 0),
        coalesce(r.adhd_diagnosis, false), coalesce(r.autism_diagnosis, false),
        nullif(btrim(r.notes), ''), upper(nullif(btrim(r.uf), ''))
      )
      returning id into v_patient_id;
    end if;

    insert into public.patient_guardians (institution_id, patient_id, guardian_id, relationship, income)
    values (p_institution_id, v_patient_id, p_guardian_id, btrim(v_item ->> 'relationship'),
            nullif(btrim(v_item ->> 'income'), ''))
    on conflict (patient_id, guardian_id) do update
      set relationship = excluded.relationship,
          income = coalesce(excluded.income, public.patient_guardians.income);

    if nullif(btrim(p_consent_term_version), '') is not null then
      insert into public.consents (institution_id, patient_id, guardian_id, term_version)
      values (p_institution_id, v_patient_id, p_guardian_id, btrim(p_consent_term_version));
    end if;

    v_ids := v_ids || v_patient_id;
  end loop;

  return v_ids;
end;
$$;

revoke execute on function public.register_guardian_patients(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.register_guardian_patients(uuid, uuid, jsonb, text) to authenticated;

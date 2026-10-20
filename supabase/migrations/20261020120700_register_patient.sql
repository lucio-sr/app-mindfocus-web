-- Cadastro "criança primeiro": um paciente com um ou mais responsáveis numa transação só
-- (Edge Function create-patient). Também extrai a inserção do paciente para um helper comum.

-- Insere um paciente a partir de JSON (mesmos campos aceitos pelas RPCs de cadastro).
-- SECURITY INVOKER: o RLS de patients continua valendo.
create function private.insert_patient(p_institution_id uuid, p_item jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.patients;
  v_id uuid;
begin
  r := jsonb_populate_record(null::public.patients, p_item);
  insert into public.patients (
    institution_id, full_name, cpf, birthdate, gender, education, public_school,
    school_dropout, school_dropout_times, school_failure, school_failure_times,
    medications, siblings, adhd_diagnosis, autism_diagnosis, notes, uf
  ) values (
    p_institution_id, btrim(r.full_name), private.only_digits(p_item ->> 'cpf'), r.birthdate,
    nullif(btrim(r.gender), ''), nullif(btrim(r.education), ''), r.public_school,
    coalesce(r.school_dropout, false), coalesce(r.school_dropout_times, 0),
    coalesce(r.school_failure, false), coalesce(r.school_failure_times, 0),
    coalesce(r.medications, '{}'), coalesce(r.siblings, 0),
    coalesce(r.adhd_diagnosis, false), coalesce(r.autism_diagnosis, false),
    nullif(btrim(r.notes), ''), upper(nullif(btrim(r.uf), ''))
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- register_guardian_patients passa a usar o helper (comportamento igual).
create or replace function public.register_guardian_patients(
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
      perform 1 from public.patients p where p.id = v_patient_id and p.institution_id = p_institution_id;
      if not found then
        raise exception 'paciente % não encontrado nesta instituição', v_patient_id
          using errcode = 'foreign_key_violation';
      end if;
    else
      v_patient_id := private.insert_patient(p_institution_id, v_item);
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

-- p_patient: campos do paciente (full_name, birthdate, cpf, gender, education, public_school, ...).
-- p_guardians: [{guardian_id, relationship, income?}, ...] — ao menos um, sem repetir.
-- Com p_consent_term_version, registra o consentimento de cada responsável.
create function public.register_patient(
  p_institution_id uuid,
  p_patient jsonb,
  p_guardians jsonb,
  p_consent_term_version text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_patient_id uuid;
  v_item jsonb;
begin
  if p_institution_id not in (select private.member_institution_ids()) then
    raise exception 'apenas colaboradores da instituição cadastram pacientes'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(p_guardians) is distinct from 'array' or jsonb_array_length(p_guardians) = 0 then
    raise exception 'informe ao menos um responsável' using errcode = 'invalid_parameter_value';
  end if;

  if (select count(distinct value ->> 'guardian_id') from jsonb_array_elements(p_guardians))
     <> jsonb_array_length(p_guardians) then
    raise exception 'responsável repetido' using errcode = 'invalid_parameter_value';
  end if;

  v_patient_id := private.insert_patient(p_institution_id, p_patient);

  for v_item in select value from jsonb_array_elements(p_guardians) loop
    if nullif(btrim(v_item ->> 'relationship'), '') is null then
      raise exception 'informe o parentesco de cada responsável' using errcode = 'not_null_violation';
    end if;

    insert into public.patient_guardians (institution_id, patient_id, guardian_id, relationship, income)
    values (p_institution_id, v_patient_id, (v_item ->> 'guardian_id')::uuid,
            btrim(v_item ->> 'relationship'), nullif(btrim(v_item ->> 'income'), ''));

    if nullif(btrim(p_consent_term_version), '') is not null then
      insert into public.consents (institution_id, patient_id, guardian_id, term_version)
      values (p_institution_id, v_patient_id, (v_item ->> 'guardian_id')::uuid, btrim(p_consent_term_version));
    end if;
  end loop;

  return v_patient_id;
end;
$$;

revoke execute on function public.register_patient(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.register_patient(uuid, jsonb, jsonb, text) to authenticated;

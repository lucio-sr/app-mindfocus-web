-- Responsáveis vindos do sistema Flask, guardados sem conta de acesso.
--
-- Decisão de 21/10/2026: os responsáveis ainda não terão acesso à plataforma. Os dados de
-- contato e o vínculo com a criança ficam aqui (schema private: fora da API, só o banco lê)
-- até a área do responsável existir; aí as contas são criadas a partir desta tabela e o
-- vínculo vai para patient_guardians.

create table private.legacy_guardians (
  patient_id      uuid not null references public.patients (id) on delete cascade,
  legacy_adult_id bigint not null,
  full_name       text not null,
  cpf             text,
  email           text,
  phones          text[] not null default '{}',
  birthdate       date,
  gender          text,
  income          text,
  relationship    text,
  cep             text,
  address_line    text,
  city            text,
  uf              text,
  legacy_created_at timestamptz,
  imported_at     timestamptz not null default now(),
  primary key (patient_id, legacy_adult_id)
);

create index legacy_guardians_cpf_idx on private.legacy_guardians (cpf);

revoke all on private.legacy_guardians from public, anon, authenticated;

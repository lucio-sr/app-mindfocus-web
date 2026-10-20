-- Base: extensões, schema privado, tipos e funções utilitárias.
--
-- Convenções do projeto:
--   * Toda tabela com dados de uma instituição tem `institution_id uuid NOT NULL` e RLS habilitado.
--   * Funções auxiliares ficam em `private` (não exposto pelo PostgREST).
--   * Funções SECURITY DEFINER sempre fixam `search_path = ''` e qualificam todos os nomes.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Nada é público por padrão: anon não recebe privilégios em tabelas novas.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.document_type as enum ('cpf', 'cnpj');
create type public.institution_status as enum ('pending', 'active', 'suspended');
create type public.member_role as enum ('admin', 'psychologist', 'staff');
create type public.game_test as enum ('gonogo', 'tmt_a', 'tmt_b', 'genius', 'stroop');
create type public.access_code_purpose as enum ('game', 'simulator');
create type public.neuro_instrument as enum ('tavis', 'fdt', 'neupsilin', 'other');
create type public.report_kind as enum ('summary', 'general');

-- ---------------------------------------------------------------------------
-- Validação de documentos (dígitos verificadores)
-- ---------------------------------------------------------------------------

create function private.is_valid_cpf(doc text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d int[];
  s int;
  r int;
begin
  if doc is null or doc !~ '^\d{11}$' or doc ~ '^(\d)\1{10}$' then
    return false;
  end if;
  d := array(select substr(doc, i, 1)::int from generate_series(1, 11) as i);

  s := 0;
  for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
  r := (s * 10) % 11;
  if r = 10 then r := 0; end if;
  if r <> d[10] then return false; end if;

  s := 0;
  for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
  r := (s * 10) % 11;
  if r = 10 then r := 0; end if;
  return r = d[11];
end;
$$;

create function private.is_valid_cnpj(doc text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d int[];
  w1 int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  w2 int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  s int;
  r int;
begin
  if doc is null or doc !~ '^\d{14}$' or doc ~ '^(\d)\1{13}$' then
    return false;
  end if;
  d := array(select substr(doc, i, 1)::int from generate_series(1, 14) as i);

  s := 0;
  for i in 1..12 loop s := s + d[i] * w1[i]; end loop;
  r := s % 11;
  r := case when r < 2 then 0 else 11 - r end;
  if r <> d[13] then return false; end if;

  s := 0;
  for i in 1..13 loop s := s + d[i] * w2[i]; end loop;
  r := s % 11;
  r := case when r < 2 then 0 else 11 - r end;
  return r = d[14];
end;
$$;

-- Remove pontuação: '123.456.789-09' -> '12345678909'
create function private.only_digits(value text)
returns text
language sql
immutable
set search_path = ''
as $$ select nullif(regexp_replace(value, '\D', '', 'g'), '') $$;

-- ---------------------------------------------------------------------------
-- Triggers genéricos
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Um registro nunca muda de instituição (nem por quem é membro das duas).
create function private.forbid_institution_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.institution_id is distinct from old.institution_id then
    raise exception 'institution_id não pode ser alterado'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

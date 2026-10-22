-- Relatório/devolutiva: configurações por instituição e registro dos laudos.
-- Rodar com: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create function tests.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function tests.new_user(uid uuid, name text, cpf text) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (uid, lower(replace(name, ' ', '.')) || '@exemplo.com.br', jsonb_build_object('full_name', name, 'cpf', cpf));
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

select tests.new_user('00000000-0000-0000-0000-0000000000a1', 'Admin A', '52998224725');
select tests.new_user('00000000-0000-0000-0000-0000000000b2', 'Psico A', '18609139034');
select tests.new_user('00000000-0000-0000-0000-0000000000b3', 'Staff A', '99603082430');
select tests.new_user('00000000-0000-0000-0000-0000000000c1', 'Admin B', '62819482112');

insert into public.institutions (id, name, document_type, document) values
  ('11111111-1111-1111-1111-111111111111', 'Clínica A', 'cnpj', '75749118000116'),
  ('22222222-2222-2222-2222-222222222222', 'Escola B',  'cnpj', '89555979000178');
insert into public.institution_members (institution_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b2', 'psychologist'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b3', 'staff'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000c1', 'admin');
insert into public.patients (id, institution_id, full_name, birthdate) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Paciente A1', '2016-03-01');

set local role authenticated;

-- Configurações: só o admin da instituição grava; colaboradores leem; outra instituição não vê.
select tests.login('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$insert into public.institution_report_settings (institution_id, subtitle, references_url)
    values ('11111111-1111-1111-1111-111111111111', 'Pesquisa X', 'https://exemplo.com.br/refs')$$,
  'admin configura os textos dos documentos');
select throws_ok(
  $$update public.institution_report_settings set references_url = 'javascript:alert(1)'
    where institution_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'link de referências precisa ser https');

select tests.login('00000000-0000-0000-0000-0000000000b2');
select is((select subtitle from public.institution_report_settings), 'Pesquisa X', 'psicólogo lê as configurações');
update public.institution_report_settings set subtitle = 'alterado';
select is((select subtitle from public.institution_report_settings), 'Pesquisa X', 'psicólogo não altera as configurações');

select tests.login('00000000-0000-0000-0000-0000000000c1');
select is((select count(*) from public.institution_report_settings)::int, 0, 'outra instituição não vê as configurações');
select throws_ok(
  $$insert into public.institution_report_settings (institution_id) values ('11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'admin de outra instituição não grava');

-- Laudos: psicólogo registra; colaborador sem perfil clínico, não.
select tests.login('00000000-0000-0000-0000-0000000000b2');
select lives_ok(
  $$insert into public.reports (institution_id, patient_id, kind, storage_path, title, ai_model)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'general',
            '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/r1.pdf', 'Devolutiva', 'gpt-4o-mini')$$,
  'psicólogo registra a devolutiva');
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('reports', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/r1.pdf')$$,
  'psicólogo envia o PDF');

select tests.login('00000000-0000-0000-0000-0000000000b3');
select throws_ok(
  $$insert into public.reports (institution_id, patient_id, kind, storage_path)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'summary',
            '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/r2.pdf')$$,
  '42501', null, 'colaborador não gera laudo');
select is((select count(*) from public.reports)::int, 1, 'colaborador vê os laudos da instituição');

select * from finish();
rollback;

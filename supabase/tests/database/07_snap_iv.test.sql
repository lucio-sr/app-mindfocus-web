-- SNAP-IV: pontuação, link de uso único (data de nascimento, bloqueio, expiração) e aplicação presencial.
-- Rodar com: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

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

select tests.new_user('00000000-0000-0000-0000-0000000000b3', 'Staff A', '99603082430');
select tests.new_user('00000000-0000-0000-0000-0000000000c1', 'Admin B', '62819482112');
select tests.new_user('00000000-0000-0000-0000-0000000000d1', 'Mae G', '99351819019');
select tests.new_user('00000000-0000-0000-0000-0000000000d2', 'Outro Adulto', '54323194897');

insert into public.institutions (id, name, document_type, document) values
  ('11111111-1111-1111-1111-111111111111', 'Clínica A', 'cnpj', '75749118000116'),
  ('22222222-2222-2222-2222-222222222222', 'Escola B',  'cnpj', '89555979000178');
insert into public.institution_members (institution_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b3', 'staff'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000c1', 'admin');
insert into public.patients (id, institution_id, full_name, birthdate) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Joana Teste', '2016-03-01');
insert into public.patient_guardians (institution_id, patient_id, guardian_id, relationship) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'Mãe');

-- pontuação
select is(
  private.snap_iv_score('{"items": [3,3,2,2,2,2,1,0,0, 0,0,1,1,2,0,0,0,0]}'),
  '{"inattention": {"count": 6, "mean": 1.67}, "hyperactivity": {"count": 1, "mean": 0.44}, "total_mean": 1.06}'::jsonb,
  'contagem de itens ≥ 2 e médias por subescala');
select throws_ok($$select private.snap_iv_score('{"items": [0,0,0]}')$$, '22023', null, 'exige 18 respostas');
select throws_ok($$select private.snap_iv_score('{"items": [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}')$$, '22023', null, 'resposta fora de 0–3');
select throws_ok($$select private.snap_iv_score('{"items": [1.5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}')$$, '22023', null, 'resposta fracionada');

-- link
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b3');
select lives_ok(
  $$select set_config('tests.token', (select token from public.create_questionnaire_request(
      'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1')), true)$$,
  'colaborador gera link para o responsável');
select throws_ok(
  $$select public.create_questionnaire_request('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d2')$$,
  '42501', null, 'só para responsável vinculado');
select is((select count(*) from public.questionnaire_requests), 1::bigint, 'colaborador vê o pedido');
select throws_ok($$select token_hash from public.questionnaire_requests$$, '42501', null, 'mas não o hash do token');
select throws_ok($$select public.questionnaire_by_token('x')$$, '42501', null, 'usuário logado não consulta link');

select tests.login('00000000-0000-0000-0000-0000000000c1');
select is((select count(*) from public.questionnaire_requests), 0::bigint, 'outra instituição não vê o pedido');
select throws_ok(
  $$select public.create_questionnaire_request('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1')$$,
  '42501', null, 'outra instituição não gera link');
reset role;

-- Edge Function (service_role)
select is(public.questionnaire_by_token(current_setting('tests.token')) ->> 'status', 'ok', 'link abre');
select ok(not (public.questionnaire_by_token(current_setting('tests.token')) ? 'patient_first_name'),
  'sem a data de nascimento, não revela o nome');
select is(public.questionnaire_by_token(current_setting('tests.token'), '2016-03-02') ->> 'status', 'wrong_birthdate',
  'data errada é recusada');
select is(public.questionnaire_by_token(current_setting('tests.token'), '2016-03-01') ->> 'patient_first_name', 'Joana',
  'data certa libera o nome');
select is(
  public.submit_questionnaire_by_token(current_setting('tests.token'), '2016-03-01',
    '{"items": [2,2,2,2,2,2,0,0,0, 0,0,0,0,0,0,0,0,0]}') ->> 'status',
  'submitted', 'respostas enviadas');
select results_eq(
  $$select guardian_id, channel, (scores -> 'inattention' ->> 'count')::int from public.questionnaire_responses$$,
  $$values ('00000000-0000-0000-0000-0000000000d1'::uuid, 'link', 6)$$,
  'resposta com autoria, canal e pontuação');
select is(public.questionnaire_by_token(current_setting('tests.token')) ->> 'status', 'completed', 'link é de uso único');
select is(public.questionnaire_by_token('token-inexistente') ->> 'status', 'invalid', 'token desconhecido');

-- bloqueio após 5 erros
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b3');
do $$ begin
  perform set_config('tests.t2', (select token from public.create_questionnaire_request(
    'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1')), true);
end $$;
reset role;
do $$ begin
  perform public.questionnaire_by_token(current_setting('tests.t2'), '2000-01-01') from generate_series(1, 5);
end $$;
select is(public.questionnaire_by_token(current_setting('tests.t2'), '2016-03-01') ->> 'status', 'locked',
  'após 5 datas erradas o link é bloqueado, mesmo com a data certa');

-- presencial
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000000b3');
select lives_ok(
  $$select public.submit_questionnaire_in_person('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1',
      '{"items": [0,0,0,0,0,0,0,0,0, 3,3,3,3,3,3,0,0,0]}')$$,
  'aplicação presencial');
select is(
  (select (scores -> 'hyperactivity' ->> 'count')::int from public.questionnaire_responses where channel = 'in_person'),
  6, 'pontuação da aplicação presencial');
reset role;

select * from finish();
rollback;

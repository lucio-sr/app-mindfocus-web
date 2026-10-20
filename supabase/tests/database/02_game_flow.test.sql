-- Fluxo do jogo: PIN -> resgate (Edge Function pin-login) -> ingestão dos dados do Unity.
-- Rodar com: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create function tests.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Cenário: instituição A, psicólogo pA, paciente pa1
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b2', 'psico.a@exemplo.com.br', '{"full_name": "Psico A", "cpf": "18609139034"}');
insert into public.institutions (id, name, document_type, document) values
  ('11111111-1111-1111-1111-111111111111', 'Clínica A', 'cnpj', '55597971000152');
insert into public.institution_members (institution_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b2', 'admin');
insert into public.patients (id, institution_id, full_name, birthdate) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Paciente A1', '2016-03-01');

-- Payload no formato gerado por DataCollector.cs (GameSessionData). TMT A aparece duas vezes.
do $do$ begin perform set_config('t.payload', $json$
{
  "uuid": "__SESSION__",
  "start_time": "2026-10-20 10:00:00.000000-03",
  "end_time": "2026-10-20 10:25:00.000000-03",
  "game_version": "1.4.0",
  "data": [
    {"test": "GoNotGo", "testStartTime": "2026-10-20 10:00:05.123456-03",
     "firstGameTouchTime": "2026-10-20 10:00:06.500000-03", "testEndTime": "2026-10-20 10:03:00.000000-03",
     "clickAmount": 40, "purposelessClicks": 2, "acertos": 30, "totalErrors": 3,
     "omissionErrors": 3, "comissionErrors": 0, "ReactionTimeMean": 0.82, "ReactionTimeList": [0.8, 0.84]},
    {"test": "TMT", "variante": "A", "testStartTime": "2026-10-20 10:04:00.000000-03",
     "firstGameTouchTime": "0001-01-01 00:00:00.000000+00", "testEndTime": "2026-10-20 10:05:00.000000-03",
     "clickAmount": 25, "purposelessClicks": 0, "acertos": 25, "totalErrors": 0,
     "timeBetweenElementClicksMean": 1.5, "warmupTimes": [3.2, 2.9], "warmupAttempts": 2},
    {"test": "TMT", "variante": "A", "testStartTime": "2026-10-20 10:06:00.000000-03",
     "firstGameTouchTime": "2026-10-20 10:06:01.000000-03", "testEndTime": "2026-10-20 10:07:00.000000-03",
     "clickAmount": 26, "acertos": 24, "totalErrors": 1},
    {"test": "TMT", "variante": "B", "testStartTime": "2026-10-20 10:08:00.000000-03",
     "testEndTime": "2026-10-20 10:11:00.000000-03", "clickAmount": 30, "acertos": 6, "totalErrors": 20},
    {"test": "Genius", "testStartTime": "2026-10-20 10:12:00.000000-03",
     "testEndTime": "2026-10-20 10:16:00.000000-03", "clickAmount": 50, "acertos": 8, "maxSeq": 8, "totalErrors": 2},
    {"test": "Stroop", "testStartTime": "2026-10-20 10:17:00.000000-03",
     "testEndTime": "2026-10-20 10:24:00.000000-03", "clickAmount": 45, "acertos": 40, "totalErrors": 1,
     "collorErrors": 1, "collorAndNameErrors": 0}
  ]
}
$json$, true); end $do$;

-- ---------------------------------------------------------------------------
-- Emissão do PIN (colaborador)
-- ---------------------------------------------------------------------------

select tests.login('00000000-0000-0000-0000-0000000000b2');
set local role authenticated;

select ok(set_config('t.old_code', code, true) ~ '^\d{8}$', 'PIN tem 8 dígitos')
from public.issue_access_code('aaaaaaaa-0000-0000-0000-000000000001');

select ok(set_config('t.code', code, true) ~ '^\d{8}$', 'novo PIN emitido')
from public.issue_access_code('aaaaaaaa-0000-0000-0000-000000000001');

select is(
  (select count(*) from public.game_access_codes where used_at is null and revoked_at is null and purpose = 'game'),
  1::bigint, 'novo PIN revoga o pendente anterior');

select throws_ok(
  $$select * from public.issue_access_code('aaaaaaaa-0000-0000-0000-000000000001', 'game', interval '30 days')$$,
  '22023', null, 'validade do PIN é limitada a 7 dias');

select throws_ok(
  $$select * from public.redeem_game_access_code('00000000')$$,
  '42501', null, 'cliente autenticado não resgata PIN diretamente (só a Edge Function)');

reset role;

-- ---------------------------------------------------------------------------
-- Resgate e ingestão (service_role, como as Edge Functions)
-- ---------------------------------------------------------------------------

do $do$ begin perform set_config('request.jwt.claims', '', true); end $do$;
set local role service_role;

select throws_ok(
  format('select * from public.redeem_game_access_code(%L)', current_setting('t.old_code')),
  '28000', null, 'PIN revogado não é aceito');

select ok(
  set_config('t.token', r.token, true) ~ '^[0-9a-f]{64}$'
  and set_config('t.session', r.session_id::text, true) is not null,
  'resgate do PIN devolve token do dispositivo e sessão')
from public.redeem_game_access_code(current_setting('t.code')) r;

select throws_ok(
  format('select * from public.redeem_game_access_code(%L)', current_setting('t.code')),
  '28000', null, 'PIN é de uso único');

do $do$ begin perform set_config('t.payload', replace(current_setting('t.payload'), '__SESSION__', current_setting('t.session')), true); end $do$;

select lives_ok(
  format('select public.ingest_game_session(%L, %L::jsonb)', current_setting('t.token'), current_setting('t.payload')),
  'ingestão da sessão do Unity');

select is((select count(*) from public.game_results where session_id = current_setting('t.session')::uuid),
  6::bigint, 'uma linha por jogo jogado');

select is(
  (select played from public.game_sessions where id = current_setting('t.session')::uuid),
  array['gonogo', 'tmt_a', 'tmt_a', 'tmt_b', 'genius', 'stroop'],
  'jogos mapeados pelo campo test/variante, na ordem jogada');

select is(
  (select hits from public.game_results
   where session_id = current_setting('t.session')::uuid and test = 'tmt_a' and attempt = 2),
  24, 'segunda tentativa do TMT A registrada como attempt 2');

select ok(
  (select first_touch_at is null and started_at is not null from public.game_results
   where session_id = current_setting('t.session')::uuid and test = 'tmt_a' and attempt = 1),
  'DateTime não inicializado do C# (0001-01-01) vira null');

select is(
  (select (metrics ->> 'maxSeq')::int from public.game_results
   where session_id = current_setting('t.session')::uuid and test = 'genius'),
  8, 'métricas específicas preservadas em metrics');

select lives_ok(
  format('select public.ingest_game_session(%L, %L::jsonb)', current_setting('t.token'), current_setting('t.payload')),
  'reenvio do mesmo arquivo é aceito');

select is((select count(*) from public.game_results where session_id = current_setting('t.session')::uuid),
  6::bigint, 'reenvio substitui os resultados (idempotente)');

select throws_ok(
  format('select public.ingest_game_session(%L, %L::jsonb)', current_setting('t.token'),
         jsonb_set(current_setting('t.payload')::jsonb, '{uuid}', '"00000000-0000-0000-0000-000000000000"')),
  '22023', null, 'uuid do payload precisa ser a sessão do token');

select throws_ok(
  format('select public.ingest_game_session(%L, %L::jsonb)', current_setting('t.token'),
         jsonb_set(current_setting('t.payload')::jsonb, '{data,0,test}', '"Xadrez"')),
  '22023', null, 'teste desconhecido é rejeitado');

select throws_ok(
  format('select public.ingest_game_session(%L, %L::jsonb)', repeat('0', 64), current_setting('t.payload')),
  '28000', null, 'token inválido é rejeitado');

select lives_ok(
  format('select public.ingest_game_logs(%L, %L::jsonb)', current_setting('t.token'), '{"events": [1, 2]}'),
  'ingestão do log da sessão');

reset role;

-- ---------------------------------------------------------------------------
-- Simulador e suspensão
-- ---------------------------------------------------------------------------

select tests.login('00000000-0000-0000-0000-0000000000b2');
set local role authenticated;
select ok(set_config('t.sim_code', code, true) ~ '^\d{8}$', 'PIN do simulador emitido')
from public.issue_access_code('aaaaaaaa-0000-0000-0000-000000000001', 'simulator');
reset role;

do $do$ begin perform set_config('request.jwt.claims', '', true); end $do$;
set local role service_role;

select is(
  jsonb_array_length(public.redeem_simulator_access_code(current_setting('t.sim_code')) -> 'logs'),
  1, 'PIN do simulador devolve os logs do paciente');

reset role;
update public.institutions set status = 'suspended' where id = '11111111-1111-1111-1111-111111111111';
set local role service_role;

select throws_ok(
  format('select public.ingest_game_session(%L, %L::jsonb)', current_setting('t.token'), current_setting('t.payload')),
  '28000', null, 'token deixa de valer quando a instituição é suspensa');

reset role;

select * from finish();
rollback;

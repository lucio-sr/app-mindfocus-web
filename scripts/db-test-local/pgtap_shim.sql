-- Subconjunto mínimo do pgTAP (plan/ok/is/throws_ok/lives_ok/results_eq/finish) para rodar sem a extensão.
create function extensions.plan(n int) returns text language sql as $$
  select set_config('tap.plan', n::text, false), set_config('tap.n', '0', false), set_config('tap.fail', '0', false);
  select '1..' || n $$;
create function extensions._tap(pass boolean, descr text) returns text language plpgsql as $$
declare n int := current_setting('tap.n')::int + 1;
begin
  perform set_config('tap.n', n::text, false);
  if not coalesce(pass, false) then
    perform set_config('tap.fail', (current_setting('tap.fail')::int + 1)::text, false);
    return 'not ok ' || n || ' - ' || coalesce(descr, '');
  end if;
  return 'ok ' || n || ' - ' || coalesce(descr, '');
end $$;
create function extensions.ok(pass boolean, descr text default null) returns text language sql as $$ select extensions._tap(pass, descr) $$;
create function extensions.is(have anyelement, want anyelement, descr text default null) returns text language plpgsql as $$
begin
  if have is not distinct from want then return extensions._tap(true, descr); end if;
  return extensions._tap(false, descr) || E'\n#   have: ' || coalesce(have::text, 'NULL') || E'\n#   want: ' || coalesce(want::text, 'NULL');
end $$;
create function extensions.throws_ok(query text, errcode text, errmsg text default null, descr text default null) returns text language plpgsql as $$
begin
  execute query;
  return extensions._tap(false, descr) || E'\n#   nenhuma exceção (esperado ' || errcode || ')';
exception when others then
  if sqlstate = errcode and (errmsg is null or sqlerrm = errmsg) then return extensions._tap(true, descr); end if;
  return extensions._tap(false, descr) || E'\n#   recebido ' || sqlstate || ': ' || sqlerrm || E'\n#   esperado ' || errcode;
end $$;
create function extensions.lives_ok(query text, descr text default null) returns text language plpgsql as $$
begin
  execute query;
  return extensions._tap(true, descr);
exception when others then
  return extensions._tap(false, descr) || E'\n#   ' || sqlstate || ': ' || sqlerrm;
end $$;
-- Compara as linhas (como texto, na ordem) das duas consultas.
create function extensions.results_eq(have text, want text, descr text default null) returns text language plpgsql as $$
declare h text[]; w text[];
begin
  execute format('select coalesce(array_agg(t::text), ''{}'') from (%s) t', have) into h;
  execute format('select coalesce(array_agg(t::text), ''{}'') from (%s) t', want) into w;
  if h = w then return extensions._tap(true, descr); end if;
  return extensions._tap(false, descr) || E'\n#   have: ' || h::text || E'\n#   want: ' || w::text;
end $$;
create function extensions.finish() returns setof text language plpgsql as $$
begin
  if current_setting('tap.n')::int <> current_setting('tap.plan')::int then
    return next '# plano ' || current_setting('tap.plan') || ', executados ' || current_setting('tap.n');
  end if;
  if current_setting('tap.fail')::int > 0 then
    return next '# FALHAS: ' || current_setting('tap.fail');
  end if;
end $$;
grant execute on all functions in schema extensions to anon, authenticated, service_role;

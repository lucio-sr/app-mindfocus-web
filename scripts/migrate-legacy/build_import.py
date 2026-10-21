#!/usr/bin/env python3
"""Gera o SQL de importação dos dados do sistema Flask (pg_dump em texto) para a instituição MindFocus.

uso: python3 -I build_import.py <dump.sql> <saida.sql>
     python3 -I build_import.py <dump.sql> <pasta> --partes
       (várias partes de até ~1 MB, para `supabase db query --linked -f`, que limita o tamanho
        da requisição; rode os arquivos em ordem — o último importa e apaga a preparação)

O SQL gerado contém dados pessoais: grave-o FORA do repositório e apague depois de usar.
Este script só imprime contagens, nunca dados.

O que é importado (tudo idempotente: rodar de novo não duplica):
  crianças            -> public.patients (legacy_id = users.common.id)
  responsáveis        -> private.legacy_guardians (sem conta; ver migration 20261021120000)
  sessões do jogo     -> public.game_sessions / game_results (mesma regra do ingest_game_session)
  logs do jogo        -> public.game_logs
  SNAP-IV do chatbot  -> public.questionnaire_responses (channel 'legacy', sem respondente)
  testes (dadosneuropsi) -> public.neuropsych_assessments (TAVIS, FDT, NEUPSILIN-Inf)
Fica de fora: contas e senhas (auth.basic), PINs antigos, papéis, CRP e o que não tem criança vinculada.
"""

import collections
import json
import os
import re
import sys

# --- leitura do dump -------------------------------------------------------------------------

_ESC = {"t": "\t", "n": "\n", "r": "\r", "\\": "\\", "b": "\b", "f": "\f", "v": "\v"}


def _unescape(v):
    if v == r"\N":
        return None
    out, i = [], 0
    while i < len(v):
        c = v[i]
        if c == "\\" and i + 1 < len(v):
            n = v[i + 1]
            if n in _ESC:
                out.append(_ESC[n])
                i += 2
                continue
            m = re.match(r"[0-7]{1,3}", v[i + 1 :])
            if m:
                out.append(chr(int(m.group(), 8)))
                i += 1 + len(m.group())
                continue
            out.append(n)
            i += 2
            continue
        out.append(c)
        i += 1
    return "".join(out)


def load_dump(path):
    tables, cur, cols = {}, None, None
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if cur is None:
                m = re.match(r"^COPY (\S+) \((.*)\) FROM stdin;$", line)
                if m:
                    cur = m.group(1)
                    cols = [c.strip().strip('"') for c in m.group(2).split(",")]
                    tables[cur] = []
                continue
            if line == "\\.":
                cur = None
                continue
            tables[cur].append(dict(zip(cols, (_unescape(x) for x in line.split("\t")))))
    return tables


def pg_array(v):
    if v is None or v.strip() in ("", "{}"):
        return []
    inner, out, buf, quoted, i = v.strip()[1:-1], [], "", False, 0
    while i < len(inner):
        c = inner[i]
        if c == '"':
            quoted = not quoted
        elif c == "\\" and quoted:
            i += 1
            buf += inner[i]
        elif c == "," and not quoted:
            out.append(buf)
            buf = ""
        else:
            buf += c
        i += 1
    out.append(buf)
    return [x for x in out if x != "NULL"]


# --- conversões ------------------------------------------------------------------------------


def clean(v):
    v = (v or "").strip()
    return None if v in ("", "-") else v


def boolean(v):
    return v == "t"


def full_name(c):
    return re.sub(r"\s+", " ", f"{c['name'] or ''} {c['lastname'] or ''}").strip()


def uf(v):
    v = (v or "").strip().upper()
    return v if re.fullmatch(r"[A-Z]{2}", v) else None


NO_MEDICATION = {"não", "nao", "nenhum", "nenhuma", "não toma", "nao toma", "-"}


def medications(v):
    return [m.strip() for m in pg_array(v) if m.strip() and m.strip().lower() not in NO_MEDICATION]


def number(v):
    if v is None:
        return None
    v = v.strip()
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    try:
        f = float(v)
    except ValueError:
        return v or None
    return int(f) if f.is_integer() else round(f, 4)


def norm_name(v):
    import unicodedata

    v = unicodedata.normalize("NFKD", v or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", v).strip()


# SNAP-IV do chatbot: chaves "2".."19" são os 18 itens, respostas "1".."4" (escala nova 0..3).
SNAP_TEXT = {"nem um pouco": 0, "só um pouco": 1, "so um pouco": 1, "bastante": 2, "demais": 3}


def snap_items(data):
    items = []
    for k in range(2, 20):
        v = data.get(str(k))
        v = (v[0] if isinstance(v, list) and v else v) or ""
        v = str(v).strip().lower()
        m = re.match(r"^([1-4])", v)
        if m:
            items.append(int(m.group(1)) - 1)
        elif v in SNAP_TEXT:
            items.append(SNAP_TEXT[v])
        else:
            return None
    return items


# Colunas de dadosneuropsi -> escores do instrumento (chaves de web/src/lib/instruments.ts).
NEURO_RENAME = {
    "fdt_alternância_tempo": "fdt_alternancia_tempo",
    "fdt_alternância_erro": "fdt_alternancia_erros",
    "neupsilin_gonogo_bruto_acerto": "neupsilin_gonogo_bruto",
}


def neuro_scores(row):
    out = {"tavis": {}, "fdt": {}, "neupsilin": {}}
    for col, val in row.items():
        col = NEURO_RENAME.get(col, col)
        for inst in out:
            if col.startswith(inst + "_"):
                key = col[len(inst) + 1 :]
                n = number(val)
                if n is not None and key not in out[inst]:
                    out[inst][key] = n
    return {k: v for k, v in out.items() if v}


# --- SQL -------------------------------------------------------------------------------------


def sql_json(obj):
    s = json.dumps(obj, ensure_ascii=False, default=str)
    tag = "$mf$"
    while tag in s:
        tag = tag[:-1] + "x$"
    return f"{tag}{s}{tag}::jsonb"


STAGING = ["lg_patients", "lg_guardians", "lg_sessions", "lg_logs", "lg_snap", "lg_neuro"]


def inserts(name, rows, max_bytes):
    """Comandos insert de até ~max_bytes cada."""
    out, buf, size = [], [], 0
    for r in rows:
        v = f"({sql_json(r)})"
        if buf and size + len(v.encode()) > max_bytes:
            out.append(f"insert into {name} (d) values\n" + ",\n".join(buf) + ";")
            buf, size = [], 0
        buf.append(v)
        size += len(v.encode())
    if buf:
        out.append(f"insert into {name} (d) values\n" + ",\n".join(buf) + ";")
    return out


IMPORT_SQL = r"""
-- Instituição de destino
create temp table lg_ctx on commit drop as
  select id as institution_id from public.institutions where lower(btrim(name)) = 'mindfocus';
do $$ begin
  if (select count(*) from lg_ctx) <> 1 then
    raise exception 'esperava exatamente 1 instituição chamada MindFocus';
  end if;
end $$;

create temp table lg_summary (item text, n bigint) on commit drop;

-- Pacientes (pula quem já foi importado ou já tem o mesmo CPF na instituição)
insert into lg_summary
select 'pacientes com CPF já cadastrado (não importados)', count(*)
from lg_patients l, lg_ctx c
where not exists (select 1 from public.patients p where p.legacy_id = (l.d ->> 'legacy_id')::bigint)
  and exists (select 1 from public.patients p where p.institution_id = c.institution_id and p.cpf = l.d ->> 'cpf');

with ins as (
  insert into public.patients (
    institution_id, full_name, cpf, birthdate, gender, education, public_school,
    school_dropout, school_dropout_times, school_failure, school_failure_times, medications,
    siblings, adhd_diagnosis, autism_diagnosis, notes, uf, legacy_id, created_by, created_at)
  select c.institution_id, l.d ->> 'full_name', l.d ->> 'cpf', (l.d ->> 'birthdate')::date,
         l.d ->> 'gender', l.d ->> 'education', (l.d ->> 'public_school')::boolean,
         (l.d ->> 'school_dropout')::boolean, (l.d ->> 'school_dropout_times')::smallint,
         (l.d ->> 'school_failure')::boolean, (l.d ->> 'school_failure_times')::smallint,
         array(select jsonb_array_elements_text(l.d -> 'medications')),
         (l.d ->> 'siblings')::smallint, (l.d ->> 'adhd')::boolean, (l.d ->> 'autism')::boolean,
         l.d ->> 'notes', l.d ->> 'uf', (l.d ->> 'legacy_id')::bigint, null,
         (l.d ->> 'created_at')::timestamptz
  from lg_patients l, lg_ctx c
  where not exists (select 1 from public.patients p where p.legacy_id = (l.d ->> 'legacy_id')::bigint)
    and not exists (select 1 from public.patients p where p.institution_id = c.institution_id and p.cpf = l.d ->> 'cpf')
  returning 1)
insert into lg_summary select 'pacientes importados', count(*) from ins;

-- Pacientes da MindFocus vindos do Flask (inclusive de uma execução anterior)
create temp table lg_pmap on commit drop as
  select p.legacy_id, p.id as patient_id, p.institution_id
  from public.patients p join lg_ctx c on c.institution_id = p.institution_id
  where p.legacy_id is not null;

-- Responsáveis (sem conta)
with ins as (
  insert into private.legacy_guardians (
    patient_id, legacy_adult_id, full_name, cpf, email, phones, birthdate, gender, income,
    relationship, cep, address_line, city, uf, legacy_created_at)
  select m.patient_id, (l.d ->> 'legacy_adult_id')::bigint, l.d ->> 'full_name', l.d ->> 'cpf',
         l.d ->> 'email', array(select jsonb_array_elements_text(l.d -> 'phones')),
         (l.d ->> 'birthdate')::date, l.d ->> 'gender', l.d ->> 'income', l.d ->> 'relationship',
         l.d ->> 'cep', l.d ->> 'address_line', l.d ->> 'city', l.d ->> 'uf',
         (l.d ->> 'created_at')::timestamptz
  from lg_guardians l join lg_pmap m on m.legacy_id = (l.d ->> 'child_legacy_id')::bigint
  on conflict (patient_id, legacy_adult_id) do nothing
  returning 1)
insert into lg_summary select 'responsáveis guardados (sem conta)', count(*) from ins;

-- Sessões do jogo
with ins as (
  insert into public.game_sessions (
    institution_id, patient_id, started_at, ended_at, app_version, played, raw, legacy_id, created_at)
  select m.institution_id, m.patient_id, (l.d ->> 'start_time')::timestamptz, (l.d ->> 'end_time')::timestamptz,
         nullif(l.d ->> 'version', '0.0.0'),
         array(select private.map_game_test(g ->> 'test', g ->> 'variante')::text
               from jsonb_array_elements(l.d -> 'data') with ordinality as e (g, n) order by n),
         jsonb_build_object('uuid', l.d ->> 'uuid', 'start_time', l.d ->> 'start_time',
                            'end_time', l.d ->> 'end_time', 'game_version', l.d ->> 'version',
                            'data', l.d -> 'data', 'source', 'flask'),
         (l.d ->> 'legacy_id')::bigint, (l.d ->> 'created_at')::timestamptz
  from lg_sessions l join lg_pmap m on m.legacy_id = (l.d ->> 'child_legacy_id')::bigint
  on conflict (legacy_id) do nothing
  returning 1)
insert into lg_summary select 'sessões de jogo importadas', count(*) from ins;

-- Resultados por teste (mesma regra de public.ingest_game_session)
with ins as (
  insert into public.game_results (
    institution_id, patient_id, session_id, test, attempt, started_at, first_touch_at, ended_at,
    click_amount, purposeless_clicks, hits, total_errors, metrics)
  select s.institution_id, s.patient_id, s.id, x.test,
         row_number() over (partition by s.id, x.test order by x.n)::smallint,
         private.parse_game_timestamp(x.g ->> 'testStartTime'),
         private.parse_game_timestamp(x.g ->> 'firstGameTouchTime'),
         private.parse_game_timestamp(x.g ->> 'testEndTime'),
         private.jsonb_int(x.g -> 'clickAmount'), private.jsonb_int(x.g -> 'purposelessClicks'),
         private.jsonb_int(x.g -> 'acertos'), private.jsonb_int(x.g -> 'totalErrors'), x.g
  from public.game_sessions s
  join lg_pmap m on m.patient_id = s.patient_id
  cross join lateral (
    select e.g, e.n, private.map_game_test(e.g ->> 'test', e.g ->> 'variante') as test
    from jsonb_array_elements(s.raw -> 'data') with ordinality as e (g, n)) as x
  where s.legacy_id is not null
    and not exists (select 1 from public.game_results r where r.session_id = s.id)
  returning 1)
insert into lg_summary select 'resultados de testes do jogo', count(*) from ins;

-- Logs do jogo
with ins as (
  insert into public.game_logs (institution_id, patient_id, session_id, data)
  select s.institution_id, s.patient_id, s.id, l.d -> 'data'
  from lg_logs l join public.game_sessions s on s.legacy_id = (l.d ->> 'session_legacy_id')::bigint
  join lg_pmap m on m.patient_id = s.patient_id
  on conflict (session_id) do nothing
  returning 1)
insert into lg_summary select 'logs de jogo importados', count(*) from ins;

-- SNAP-IV do chatbot
with ins as (
  insert into public.questionnaire_responses (
    institution_id, patient_id, guardian_id, instrument, started_at, ended_at, answers, scores,
    channel, legacy_id, created_by, created_at)
  select m.institution_id, m.patient_id, null, 'snap_iv', (l.d ->> 'start_time')::timestamptz,
         (l.d ->> 'end_time')::timestamptz, jsonb_build_object('items', l.d -> 'items'),
         private.snap_iv_score(jsonb_build_object('items', l.d -> 'items')), 'legacy',
         (l.d ->> 'legacy_id')::bigint, null, (l.d ->> 'created_at')::timestamptz
  from lg_snap l join lg_pmap m on m.legacy_id = (l.d ->> 'child_legacy_id')::bigint
  on conflict (legacy_id) do nothing
  returning 1)
insert into lg_summary select 'respostas do SNAP-IV importadas', count(*) from ins;

-- Testes neuropsicológicos
with ins as (
  insert into public.neuropsych_assessments (
    institution_id, patient_id, instrument, applied_at, scores, notes, legacy_id, created_by)
  select m.institution_id, m.patient_id, (l.d ->> 'instrument')::public.neuro_instrument, null,
         l.d -> 'scores', 'Importado do sistema anterior (sem data de aplicação).',
         (l.d ->> 'legacy_id')::bigint, null
  from lg_neuro l join lg_pmap m on m.legacy_id = (l.d ->> 'child_legacy_id')::bigint
  where not exists (
    select 1 from public.neuropsych_assessments a
    where a.patient_id = m.patient_id and a.legacy_id = (l.d ->> 'legacy_id')::bigint
      and a.instrument = (l.d ->> 'instrument')::public.neuro_instrument)
  returning 1)
insert into lg_summary select 'testes neuropsicológicos importados', count(*) from ins;

select item, n from lg_summary;
"""


def main(dump_path, out_path, chunked=False):
    T = load_dump(dump_path)
    common = {r["id"]: r for r in T["users.common"]}
    children = {r["userid"]: r for r in T["users.children"]}
    adults = {r["userid"]: r for r in T["users.adults"]}
    addresses = {r["id"]: r for r in T["users.addresses"]}
    address_of = {r["userid"]: addresses.get(r["addressid"]) for r in T["users.commonaddresses"]}
    phones = {r["id"]: r["phone_number"] for r in T["users.phonenumbers"]}
    phones_of = collections.defaultdict(list)
    for r in T["users.commonphonenumbers"]:
        if phones.get(r["phoneid"]):
            phones_of[r["userid"]].append(phones[r["phoneid"]])
    report = collections.Counter()

    patients = []
    for cid, ch in children.items():
        c = common[cid]
        patients.append({
            "legacy_id": int(cid),
            "full_name": full_name(c),
            "cpf": c["cpf"],
            "birthdate": ch["birthdate"],
            "gender": clean(c["gender"]),
            "education": clean(ch["education"]),
            "public_school": boolean(ch["public_school"]),
            "school_dropout": boolean(ch["school_dropout"]),
            "school_dropout_times": int(ch["school_dropout_times"] or 0),
            "school_failure": boolean(ch["school_failure"]),
            "school_failure_times": int(ch["school_failure_times"] or 0),
            "medications": medications(ch["medications"]),
            "siblings": int(ch["brothers"] or 0),
            "adhd": boolean(ch["adhd"]),
            "autism": boolean(ch["autism"]),
            "notes": clean(ch["additional_info"]),
            "uf": uf(ch["state"]),
            "created_at": c["created_at"],
        })

    guardians = []
    for r in T["users.adultschildren"]:
        a, c = adults.get(r["adultid"]), common.get(r["adultid"])
        if not a or not c or r["childid"] not in children:
            report["vínculos responsável-criança incompletos (ignorados)"] += 1
            continue
        addr = address_of.get(r["adultid"]) or {}
        guardians.append({
            "child_legacy_id": int(r["childid"]),
            "legacy_adult_id": int(r["adultid"]),
            "full_name": full_name(c),
            "cpf": c["cpf"],
            "email": clean(a["email"]),
            "phones": phones_of.get(r["adultid"], []),
            "birthdate": a["birthdate"],
            "gender": clean(c["gender"]),
            "income": clean(a["income"]),
            "relationship": clean(r["relationship"]),
            "cep": clean(addr.get("cep")),
            "address_line": clean(addr.get("address_line")),
            "city": clean(addr.get("city")),
            "uf": uf(addr.get("state")),
            "created_at": c["created_at"],
        })

    mobile = {r["id"]: r for r in T["data.mobileapp"]}
    sessions, session_ids = [], set()
    for r in T["data.childrenmobileapp"]:
        m = mobile.get(r["mobileid"])
        if not m or r["childid"] not in children:
            continue
        session_ids.add(r["mobileid"])
        sessions.append({
            "legacy_id": int(r["mobileid"]),
            "child_legacy_id": int(r["childid"]),
            "uuid": r["uuid"],
            "version": r["version"],
            "start_time": m["start_time"],
            "end_time": m["end_time"],
            "created_at": r["created_at"],
            "data": json.loads(m["data"]),
        })
    report["sessões de jogo sem criança (ignoradas)"] = len(mobile) - len(session_ids)

    logs = [{"session_legacy_id": int(r["mobileid"]), "data": json.loads(r["data"])}
            for r in T["data.logs"] if r["mobileid"] in session_ids]
    report["logs sem sessão de criança (ignorados)"] = len(T["data.logs"]) - len(logs)

    chatbot = {r["id"]: r for r in T["data.chatbot"]}
    snaps = []
    for r in T["data.adultschatbot"]:
        cb = chatbot.get(r["chatbotid"])
        if not cb or r["childid"] not in children or r["test"] != "SNAP-IV":
            report["SNAP-IV sem criança (ignorados)"] += 1
            continue
        items = snap_items(json.loads(cb["data"]))
        if items is None:
            report["SNAP-IV incompletos (ignorados)"] += 1
            continue
        snaps.append({
            "legacy_id": int(cb["id"]),
            "child_legacy_id": int(r["childid"]),
            "start_time": cb["start_time"],
            "end_time": cb["end_time"],
            "created_at": r["created_at"],
            "items": items,
        })
    report["SNAP-IV sem vínculo com criança (ignorados)"] = len(chatbot) - len(T["data.adultschatbot"])

    # Testes: casa pelo CPF da criança; sem CPF, pelo nome + data de nascimento (só se único).
    child_by_cpf = {common[cid]["cpf"]: cid for cid in children}
    by_name = collections.defaultdict(list)
    for cid, ch in children.items():
        by_name[(norm_name(full_name(common[cid])), ch["birthdate"])].append(cid)
    neuro = []
    for r in T["data.dadosneuropsi"]:
        cid = child_by_cpf.get(r["cpf_participante"])
        if cid is None:
            found = by_name.get((norm_name(r["nome_participante"]), r["data_de_nascimento"]), [])
            cid = found[0] if len(found) == 1 else None
            if cid:
                report["testes casados por nome e nascimento"] += 1
        if cid is None:
            report["testes sem criança identificada (ignorados)"] += 1
            continue
        for inst, scores in neuro_scores(r).items():
            neuro.append({"legacy_id": int(r["id"]), "child_legacy_id": int(cid), "instrument": inst, "scores": scores})

    data = dict(zip(STAGING, [patients, guardians, sessions, logs, snaps, neuro]))
    header = "-- GERADO por scripts/migrate-legacy/build_import.py. CONTÉM DADOS PESSOAIS: não versionar.\n"
    if not chunked:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(header + "begin;\n")
            for name, rows in data.items():
                f.write(f"create temp table {name} (d jsonb not null) on commit drop;\n")
                f.write("\n".join(inserts(name, rows, 200_000)) + "\n")
            f.write(IMPORT_SQL + "commit;\n")
    else:
        # Preparação em tabelas do schema private (persistem entre as chamadas), apagadas no fim.
        os.makedirs(out_path, exist_ok=True)
        files = [header + "".join(f"drop table if exists private.{n};\ncreate table private.{n} (d jsonb not null);\n"
                                  f"revoke all on private.{n} from public, anon, authenticated;\n" for n in STAGING)]
        for name, rows in data.items():
            files += [header + stmt + "\n" for stmt in inserts(f"private.{name}", rows, 900_000)]
        final = IMPORT_SQL
        for n in STAGING:
            final = re.sub(rf"\b{n}\b", f"private.{n}", final)
        files.append(header + "begin;\n" + final + "".join(f"drop table private.{n};\n" for n in STAGING) + "commit;\n")
        for i, content in enumerate(files):
            with open(os.path.join(out_path, f"{i:03d}.sql"), "w", encoding="utf-8") as f:
                f.write(content)
        print(f"{len(files)} partes em {out_path}")

    print("preparados:")
    for label, rows in [("pacientes", patients), ("vínculos com responsáveis", guardians), ("sessões de jogo", sessions),
                        ("logs de jogo", logs), ("SNAP-IV", snaps), ("testes (por instrumento)", neuro)]:
        print(f"  {label}: {len(rows)}")
    print("observações:")
    for k, v in report.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4) or (len(sys.argv) == 4 and sys.argv[3] != "--partes"):
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], chunked=len(sys.argv) == 4)

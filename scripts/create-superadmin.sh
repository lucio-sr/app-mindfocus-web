#!/usr/bin/env bash
# Cria (ou promove) um superadmin no projeto Supabase vinculado.
#
# uso: scripts/create-superadmin.sh "Nome Completo" CPF email
#
# A conta é criada pela API admin do Auth com `full_name` e `cpf` nos metadados (o trigger
# on_auth_user_created exige os dois). Uma senha temporária aleatória é gerada e exibida uma
# única vez; troque-a assim que o fluxo de redefinição de senha estiver no ar.
# A chave secreta é obtida pela CLI (conta já logada) e nunca é impressa.
set -euo pipefail

NAME="${1:?nome completo}"
CPF="$(printf '%s' "${2:?CPF}" | tr -cd '0-9')"
EMAIL="${3:?e-mail}"

cd "$(dirname "$0")/.."
REF="$(cat supabase/.temp/project-ref 2>/dev/null || true)"
[ -n "$REF" ] || { echo "Projeto não vinculado. Rode: supabase link --project-ref <ref>" >&2; exit 1; }
URL="https://$REF.supabase.co"

SECRET="$(supabase projects api-keys --project-ref "$REF" --reveal -o json 2>/dev/null \
  | python3 -c 'import json,sys; print(next(k["api_key"] for k in json.load(sys.stdin) if k["type"] == "secret"))')"

PASSWORD="$(python3 -c 'import secrets; print(secrets.token_urlsafe(18) + "9a")')"

BODY="$(NAME="$NAME" CPF="$CPF" EMAIL="$EMAIL" PASSWORD="$PASSWORD" python3 -c '
import json, os
print(json.dumps({
  "email": os.environ["EMAIL"],
  "password": os.environ["PASSWORD"],
  "email_confirm": True,
  "user_metadata": {"full_name": os.environ["NAME"], "cpf": os.environ["CPF"]},
}))')"

HTTP="$(curl -sS -o /tmp/create-superadmin.$$ -w '%{http_code}' -X POST "$URL/auth/v1/admin/users" \
  -H "apikey: $SECRET" -H "Content-Type: application/json" -d "$BODY")"
RESP="$(cat /tmp/create-superadmin.$$)"; rm -f /tmp/create-superadmin.$$

CREATED=1
if [ "$HTTP" != "200" ] && [ "$HTTP" != "201" ]; then
  if printf '%s' "$RESP" | grep -qiE 'already (been )?registered|email_exists'; then
    echo "Usuário já existe; apenas promovendo a superadmin."
    CREATED=0
  else
    echo "Erro ao criar usuário (HTTP $HTTP): $RESP" >&2
    exit 1
  fi
fi

supabase db query --linked \
  "insert into public.platform_admins (user_id) select id from public.profiles where cpf = '$CPF' on conflict do nothing" \
  >/dev/null

supabase db query --linked \
  "select p.full_name, p.cpf, p.email, (pa.user_id is not null) as superadmin from public.profiles p left join public.platform_admins pa on pa.user_id = p.id where p.cpf = '$CPF'" \
  2>/dev/null | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["rows"], ensure_ascii=False, indent=2))'

if [ "$CREATED" = 1 ]; then
  echo
  echo "Senha temporária (exibida só agora): $PASSWORD"
fi

# Plano de migração — MindFocus: Flask → Supabase (multi-tenant)

Atualizado em 20/10/2026.

## Objetivo

Substituir a API Flask (no repositório antigo: `docker/master/services/backend/api`) e o PostgreSQL próprio por um projeto
Supabase **multi-tenant**: cada **instituição** (clínica, escola, universidade, psicólogo autônomo)
é dona dos seus pacientes, coletas, análises e laudos, e nenhuma instituição enxerga dados de outra.
O isolamento é garantido no banco (Row Level Security), não no código dos clientes.

## Decisões confirmadas

| # | Tema | Decisão |
|---|---|---|
| 1 | Criação de instituições | Por enquanto só o **superadmin** (equipe MindFocus). No futuro, autocadastro com aprovação (o schema já prevê `status = 'pending'`). |
| 2 | Visibilidade de pacientes | **Todos os colaboradores** ativos da instituição veem todos os pacientes dela. |
| 3 | Cadastro de responsáveis | Feito **pela instituição** (colaborador cadastra o responsável e a criança no dashboard). Não há cadastro público. |
| 4 | Login | **CPF + senha**. O **e-mail é obrigatório** no cadastro e é usado para recuperação de senha e convites. |
| 5 | Dados existentes | Criar a instituição **MindFocus** e migrar todos os dados atuais para ela. |
| 6 | Modelo de análise | **Um modelo padrão** para todas as instituições (versionado; personalização por instituição fica para depois). |

### Decisões assumidas (revisar se necessário)

- **Superadmin não acessa dados clínicos.** Administra instituições, colaboradores e vê estatísticas
  agregadas (contagens), mas não lê pacientes, coletas ou laudos — a menos que seja colaborador
  da instituição (é o caso da equipe na instituição MindFocus). Minimiza exposição sob a LGPD.
- **Papéis na instituição:** `admin`, `psychologist`, `staff`. Todos leem e cadastram pacientes,
  responsáveis, avaliações e PINs. Gerar laudo: `admin` e `psychologist`. Excluir paciente e
  gerenciar colaboradores/dados da instituição: `admin`.
- **Paciente é registro por instituição** (`UNIQUE (institution_id, cpf)`): a mesma criança em duas
  instituições tem dois prontuários independentes.
- **Pessoas com login** (colaboradores e responsáveis) têm **uma conta global** (`profiles`, CPF único);
  a mesma pessoa pode ser colaboradora de várias instituições e/ou responsável por pacientes em várias.
- **Criança não tem conta.** Entra no jogo com PIN de 8 dígitos (como hoje), agora gerado com
  aleatoriedade criptográfica, de **uso único** e com **validade** (24 h por padrão).

## Arquitetura alvo

```
Unity (jogo/simulador) ──► Edge Functions (pin-login, ingest-game, ingest-logs, simulator-login)
                                   │  service_role, institution_id vem do token, nunca do payload
Flutter (dashboard, chatbot) ─────►│◄── supabase_flutter: PostgREST + RLS, RPCs, Storage
Login CPF ───────────────────────► Edge Function auth-login-cpf ──► Supabase Auth (e-mail/senha)
Laudos ──► Edge Function generate-report ──► microserviço Python (pdflatex + OpenAI) ──► Storage
                                   ▼
                     Postgres (Supabase, sa-east-1) — RLS em todas as tabelas
```

- **Isolamento:** banco/schema únicos, `institution_id NOT NULL` em toda tabela de dados, RLS em todas.
  FKs compostas `(institution_id, patient_id)` impedem que um registro de uma instituição aponte para
  paciente de outra; trigger impede mudar o `institution_id` de um registro.
- **Funções auxiliares** ficam no schema `private` (não exposto pela API).
- **Clientes nunca recebem a `service_role`.** Escritas do Unity passam por funções que validam o token.

### Login por CPF

O Supabase Auth autentica por e-mail/telefone, não por CPF. Fluxo:

1. Cliente envia `{cpf, password}` para a Edge Function `auth-login-cpf`.
2. A função busca o e-mail em `profiles` (service_role) e chama `signInWithPassword` no Auth.
3. Devolve a sessão (`access_token`, `refresh_token`); o cliente chama `supabase.auth.setSession`.
4. Qualquer falha devolve o mesmo erro genérico ("CPF ou senha inválidos") — sem enumeração.

"Esqueci a senha": o cliente envia o CPF; a função busca o e-mail e chama `resetPasswordForEmail`;
a resposta é sempre genérica. Contas são criadas só por Edge Functions (`auth.admin.createUser` /
`inviteUserByEmail`) com `cpf` e `full_name` nos metadados — o cadastro público do Auth fica
desligado.

**Ponto a validar em uso real:** como todas as tentativas de login partem do IP da Edge Function, o
limite por IP do Auth foi elevado (`sign_in_sign_ups = 1000` por 5 min no `config.toml`). O limite que
vale por pessoa fica na própria função (`public.hit_rate_limit`, por IP de origem e por CPF).

## Modelo de dados

### Tenancy e identidade
| Tabela | Conteúdo |
|---|---|
| `institutions` | nome, razão social, `document_type` (`cpf`/`cnpj`) + `document` validado (dígitos verificadores), e-mail, telefone, endereço, logo, `status` (`pending`/`active`/`suspended`) |
| `profiles` | 1:1 com `auth.users`: nome, **CPF (único, login)**, **e-mail (obrigatório)**, telefone, nascimento, gênero, CRP, endereço (colunas próprias — corrige o bug do CEP único) |
| `institution_members` | (instituição, usuário, papel, ativo) |
| `platform_admins` | superadmins (equipe MindFocus) |

### Pacientes
| Tabela | Conteúdo |
|---|---|
| `patients` | dados de `Users.Children` + `institution_id` |
| `patient_guardians` | vínculo paciente ↔ responsável (`profiles`), parentesco, renda |
| `consents` | consentimento do responsável (LGPD art. 14): versão do termo, data, revogação |

### Coleta
| Tabela | Substitui |
|---|---|
| `game_access_codes` | `Auth.Pin`/`PinLogs` — hash do PIN, finalidade (`game`/`simulator`), validade, uso único |
| `game_device_sessions` | token opaco do Unity (hash) emitido ao resgatar o PIN |
| `game_sessions` | `Data.MobileApp` + `ChildrenMobileApp` |
| `game_results` | **uma linha por jogo** (`gonogo`, `tmt_a`, `tmt_b`, `genius`, `stroop`) com métricas — fim da leitura por posição no array |
| `game_logs` | `Data.Logs` |
| `questionnaire_responses` | `Data.Chatbot` + `AdultsChatbot` |
| `neuropsych_assessments` | `Admin.Tests` + `Data.DadosNeuropsi` (TAVIS, FDT, Neupsilin) |

### Análises e laudos
| Tabela | Conteúdo |
|---|---|
| `analysis_models` | modelo bayesiano versionado (pontos de corte, rede); um `is_default` global |
| `analysis_runs` | inferência por paciente: entradas, `p_adhd`, modelo usado |
| `reports` | laudos gerados; PDF no bucket privado `reports/{institution_id}/...` |
| `audit_log` | alterações em dados sensíveis (quem, o quê, quando) |

## Mapeamento das rotas Flask

| Rota atual | Novo |
|---|---|
| `POST /auth/signup` | Dashboard → Edge Function `create-guardian` (cria conta do responsável + pacientes + vínculo) |
| `POST /auth/login/jwt` | Edge Function `auth-login-cpf` |
| `POST /auth/login/resetpassword`, `POST /user/resetpassword` | Edge Function `auth-recover-cpf` + fluxo nativo do Auth |
| `POST /auth/pin`, `POST /auth/logs` | RPC `issue_access_code(patient_id, purpose)` |
| `POST /auth/login/pin` | Edge Function `pin-login` → RPC `redeem_game_access_code` |
| `POST /auth/login/logs` | Edge Function `simulator-login` → RPC `redeem_simulator_access_code` |
| `POST /data/games` / `POST /data/logs` | Edge Functions `ingest-game` / `ingest-logs` → RPCs `ingest_game_session` / `ingest_game_logs` |
| `GET` / `PUT /user` | tabela `profiles` (RLS) |
| `GET /users/children` | `patients` (RLS por instituição — deixa de ser "por estado") |
| `GET /users/adults/children` | `patients` (política do responsável) |
| `POST /data/chatbot` | `questionnaire_responses` |
| `GET /data/logs` | `game_logs` |
| `POST /admin/tests`, `GET /admin/tests/all` | `neuropsych_assessments` |
| `POST /report/summary`, `POST /report` | Edge Function `generate-report` → microserviço Python → Storage |
| `GET /time` | Edge Function `time` |
| — (novo) | Módulo superadmin: `create-institution`, `invite-member`; RPC `platform_institution_stats` |

## Módulo superadmin

Área no dashboard visível para quem está em `platform_admins`:

- Listar, criar, editar e suspender instituições (suspensa ⇒ colaboradores perdem acesso aos dados).
- Criar o primeiro admin da instituição (Edge Function `create-institution` cria a instituição e
  convida o admin por e-mail para definir a senha).
- Ver colaboradores de cada instituição; ativar/desativar.
- Estatísticas agregadas por instituição (pacientes, sessões, laudos) — sem dados pessoais.
- Futuro: fila de aprovação de instituições autocadastradas (`status = 'pending'`).

O primeiro superadmin é criado manualmente (passo a passo na Fase 1, abaixo).

## Fases

### Fase 0 — Descoberta (≈1 semana)
- [ ] `pg_dump --schema-only` de produção (confirmar `Users.Common`, `Data.DadosNeuropsi`, views `public.*`).
- [ ] Volume de dados; lista de usuários sem e-mail válido (precisarão informar e-mail).
- [ ] Dados da instituição MindFocus: razão social, CNPJ, endereço.
- [ ] Projetos Supabase dev / staging / prod em `sa-east-1`; DPA assinado.

### Fase 1 — Schema, RLS e testes (≈2 semanas) — **em andamento**
- [x] Migrations em `supabase/migrations/` (18 tabelas, 51 políticas RLS, RPCs do PIN e da ingestão do jogo, buckets).
- [x] Testes pgTAP em `supabase/tests/database/`: isolamento entre instituições, papéis, superadmin,
      responsável, suspensão, Storage (49) e fluxo PIN → resgate → ingestão do Unity (23).
- [x] Validação local sem Docker: `scripts/db-test-local/run.sh` (72/72 passando).
- [x] Migrations aplicadas no projeto `mindfocus` (iqjagmjmyxhdtildqtgb) em 20/10/2026; superadmin criado.
- [ ] Rodar `supabase test db` contra o projeto (precisa de Docker para o pg_prove).
- [ ] Revisar o schema contra o `pg_dump` de produção (campos que existam lá e faltem aqui).

**Criar o primeiro superadmin** (uma vez por ambiente). Contas precisam de `cpf` e `full_name` nos
metadados, então use a API admin (não o botão "Add user" do painel):

```bash
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mindfocus.online","password":"<senha forte>","email_confirm":true,
       "user_metadata":{"full_name":"Nome Sobrenome","cpf":"00000000000"}}'
```
```sql
insert into public.platform_admins (user_id)
select id from public.profiles where cpf = '00000000000';
```

### Fase 2 — Auth e tenancy (≈1–2 semanas) — **em andamento**
- [x] Edge Functions em `supabase/functions/` (contrato de cada uma no topo do `index.ts`):
  - `auth-login-cpf` — `{cpf, password}` → sessão; erro sempre genérico; limite de 30 tentativas
    por IP de origem a cada 5 min e 10 por CPF a cada 15 min.
  - `auth-recover-cpf` — `{cpf}` → e-mail de redefinição; resposta sempre igual; 10/h por IP, 3/h por CPF.
  - `create-institution` — superadmin; instituição + primeiro admin.
  - `invite-member` — admin da instituição ou superadmin; reaproveita a conta se o CPF já existe.
  - `create-guardian` — qualquer colaborador; responsável + pacientes (novos ou existentes) + consentimento.
  - `create-patient` — qualquer colaborador; "criança primeiro": paciente + 1 a 3 responsáveis + consentimento
    (RPC `register_patient`, migration `20261020120700`, testes em `04_register_patient.test.sql`).
    É o fluxo usado pelo assistente de cadastro do painel.
- [x] Migration `20261020120600_edge_support.sql`: as funções só criam a conta no Auth (service_role);
  as gravações vão por RPCs `SECURITY INVOKER` chamadas com o JWT de quem pediu (o RLS continua
  valendo, e cada cadastro é uma transação só). Se a gravação falha, a conta recém-criada é apagada.
  Testes em `03_edge_support.test.sql` (31).
- [x] Entrega do acesso a contas novas (`delivery`): `email` (convite do Auth, padrão), `none`
  (conta sem senha; a pessoa usa "esqueci a senha" com o CPF) e `link` (o link do convite volta na
  resposta; só superadmin, útil enquanto não há SMTP).
- [x] Deploy em 20/10/2026 (`supabase functions deploy --use-api` e `supabase config push`): site_url
  `https://mindfocus.online` (trocado em 21/10/2026 por `https://app.mindfocus.com.br`, também secret `SITE_URL`), cadastro público desligado, senha mínima de 8 com letras e números,
  `sign_in_sign_ups = 1000`. Atenção: `supabase config push` aplica sem pedir confirmação; use
  `supabase config diff` para só comparar. E `[auth.email] enable_signup` precisa ficar `true`: ele liga
  o provedor de e-mail inteiro (com ele `false`, nenhum login funciona). O cadastro público é
  desligado só por `[auth] enable_signup = false`.
- [x] Frontend `web/` (Next.js): `/entrar`, `/esqueci-senha`, `/definir-senha`, `/redefinir-senha`, `/inicio`
  e áreas provisórias por perfil; proteção de rotas em `src/proxy.ts`.
- [ ] Templates de e-mail do Auth em português; SMTP do Resend configurado no Auth.

### Fase 3 — Backend restante (≈2 semanas)
- Edge Functions `pin-login`, `simulator-login`, `ingest-game`, `ingest-logs`, `time`.
- Rate limiting de login; validação de payload; testes de paridade com cada rota antiga.

### Fase 4 — Clientes (≈2–3 semanas, em paralelo) — **em andamento** (`web/`)
- [x] Estrutura das áreas logadas (menu, cabeçalho, seletor de instituição).
- [x] Superadmin: lista de instituições, cadastro com primeiro admin, detalhe com equipe e suspensão.
- [x] Painel: pacientes (lista com busca, cadastro em 3 etapas Criança → Responsáveis → Confirmar com
      busca do responsável por CPF e atalho "cadastrar irmão(ã)", ficha com PIN do jogo, edição de dados e
      anamnese, gestão de responsáveis — remover revoga o consentimento e mantém o histórico, migration
      `20261020120800`, testes em `05_patient_edit.test.sql`),
      equipe (convite, papel, desligar) e dados da instituição.
- [x] Testes neuropsicológicos tradicionais na ficha: TAVIS, FDT (índices de inibição e flexibilidade
      calculados), NEUPSILIN-Inf e "outro"; anexo do protocolo no bucket privado `assessments`;
      registro/edição por admin e psicólogo, exclusão por admin (migration `20261020120900`,
      testes em `06_neuropsych.test.sql`). Campos em `web/src/lib/instruments.ts`.
- [x] SNAP-IV (18 itens, só responsáveis) — substitui o chatbot: link de uso único sem login (`/q/<token>`,
      confirma a data de nascimento, 5 erros bloqueiam, validade de 7 dias, envio por WhatsApp) e aplicação
      presencial no painel; pontuação no banco (`private.snap_iv_score`: itens "bastante/demais" por
      subescala, corte 6/9, e médias). Migration `20261020121000`, Edge Function `questionnaire`,
      testes em `07_snap_iv.test.sql`.
- [ ] Telas do mockup do AI Studio (resultados dos jogos, acompanhamento, laudos, área do responsável).
- **dashboard:** seletor de instituição, módulo superadmin, gestão de colaboradores, cadastro de
  responsáveis e pacientes (absorve o app `cadastro`), avaliações neuropsicológicas, laudos.
- **chatbot:** substituído pelo SNAP-IV por link no `web/` (ver Fase 4).
- **password_reset** e **cadastro:** aposentados (Auth + dashboard assumem).
- **landingpage:** apenas links.
- **Unity:** novos endpoints; remover credenciais fixas do `PinGenerator.cs`; corrigir `https://` do `LoginManager`.

### Fase 5 — Laudos e pipeline (≈1–2 semanas)
- Microserviço Python valida o JWT do Supabase e lê com o token do usuário (RLS vale); PDF no Storage; logo da instituição no laudo.
- Pipeline lê de view pseudonimizada (sem CPF/nome); remover CSVs com dados pessoais do repositório.
- Modelo atual registrado como `analysis_models` padrão.

### Fase 6 — Migração de dados — **só pacientes, mais adiante** (decisão de 20/10/2026)
- Não haverá contas migradas do sistema Flask (colaboradores e responsáveis se cadastram de novo).
- [x] Instituição **MindFocus** criada pelo painel (superadmin como admin).
- [ ] Migrar os pacientes e o histórico para a MindFocus (21/10/2026: script pronto e testado
      localmente com o dump de 06/08/2026; falta rodar em produção):
      `python3 -I scripts/migrate-legacy/build_import.py <dump.sql> <fora-do-repo>/import.sql` gera o SQL
      (contém dados pessoais; apagar depois). Importa crianças, sessões/resultados/logs do jogo, SNAP-IV
      do chatbot (canal `legacy`) e testes neuropsicológicos; é idempotente. Para o corte final, gerar de
      novo com um dump recente.
- Responsáveis **sem acesso por enquanto** (decisão de 21/10/2026): os dados ficam em
  `private.legacy_guardians` (fora da API). Mais adiante, junto com a área do responsável, criar as
  contas a partir dessa tabela e mover o vínculo para `patient_guardians`.

### Fase 7 — Cutover (≈1 semana)
- Congelar escrita no Flask, ETL final, publicar clientes, trocar DNS.
- Builds antigos do Unity têm `api.mindfocus.online` fixo: manter compatibilidade temporária ou forçar
  atualização (o `/time` já funciona como "kill switch" da tela de expiração).
- Flask somente leitura por ~30 dias; depois desligar (junto com o Adminer público).

**Estimativa:** 9–13 semanas com 1–2 pessoas (refinar após a Fase 0).

## Riscos

| Risco | Mitigação |
|---|---|
| Vazamento entre instituições por erro de RLS | Testes pgTAP de isolamento obrigatórios no CI; FKs compostas; trigger contra troca de instituição |
| `service_role` exposta | Só em Edge Functions/microserviço; nunca em app |
| Rate limit do Auth no login por CPF | Limite do Auth elevado; limite próprio por CPF/IP na função; acompanhar em produção |
| Builds antigos do Unity enviando para a API velha | Período de compatibilidade ou atualização forçada |
| Usuários sem e-mail válido | Levantar na Fase 0; instituição atualiza o cadastro antes do cutover |

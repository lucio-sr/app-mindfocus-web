-- Relatório e devolutiva (PDFs gerados no app web, guardados no bucket `reports`).
--
--   kind 'summary' → "Relatório": jogo, histórico e SNAP-IV, texto redigido pela IA.
--   kind 'general' → "Devolutiva": testes neuropsicológicos, jogo (análise idiográfica) e textos
--                    da pesquisa/instituição, com trechos interpretativos da IA.
--
-- Textos institucionais (pesquisa, comitê de ética, logos parceiros) são configurados por
-- instituição; a assinatura é sempre do profissional que gera o documento.

create table public.institution_report_settings (
  institution_id     uuid primary key references public.institutions (id) on delete cascade,
  subtitle           text,      -- abaixo do título na capa (ex.: "Pesquisa Clínica em Neuropsicologia Infantil")
  cover_text         text,      -- quadro da capa do Relatório
  intro_text         text,      -- parágrafo de abertura da Devolutiva
  study_description  text,      -- seção "Descrição do estudo" (parágrafos separados por linha em branco)
  procedures_text    text,      -- seção "Procedimentos"
  ethics_statement   text,      -- "Declaração ética e de responsabilidade"
  closing_notes      text[] not null default '{}',  -- itens de "Importante ressaltar que este documento"
  references_url     text check (references_url is null or references_url ~ '^https://'),
  location           text,      -- local da coleta na capa (padrão: cidade - UF da instituição)
  partner_logo_paths text[] not null default '{}',  -- bucket institution-logos, {institution_id}/parceiros/...
  updated_by         uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at         timestamptz not null default now()
);

create trigger institution_report_settings_set_updated_at
  before update on public.institution_report_settings
  for each row execute function private.set_updated_at();

alter table public.institution_report_settings enable row level security;

create policy institution_report_settings_select on public.institution_report_settings
  for select to authenticated
  using (institution_id in (select private.member_institution_ids()) or (select private.is_platform_admin()));

create policy institution_report_settings_insert on public.institution_report_settings
  for insert to authenticated
  with check (institution_id in (select private.member_institution_ids('{admin}')) or (select private.is_platform_admin()));

create policy institution_report_settings_update on public.institution_report_settings
  for update to authenticated
  using (institution_id in (select private.member_institution_ids('{admin}')) or (select private.is_platform_admin()))
  with check (institution_id in (select private.member_institution_ids('{admin}')) or (select private.is_platform_admin()));

-- Laudos: título, modelo de IA usado e sessão de jogo considerada.
alter table public.reports
  add column title text,
  add column ai_model text,
  add column session_id uuid references public.game_sessions (id) on delete set null;

-- Textos atuais da pesquisa MindFocus (vindos dos modelos LaTeX do sistema Flask).
insert into public.institution_report_settings (
  institution_id, subtitle, cover_text, intro_text, study_description, procedures_text,
  ethics_statement, closing_notes, references_url, location, updated_by)
select
  i.id,
  'Pesquisa Clínica em Neuropsicologia Infantil',
  'Relatório de devolutiva referente à participação na pesquisa clínica para desenvolvimento e validação do aplicativo digital gamificado MindFocus.',
  'Relatório multiprofissional de devolutiva de pesquisa clínica, elaborado por profissionais de saúde, em conformidade com os princípios éticos e legais que regem a pesquisa envolvendo seres humanos, nos termos da Resolução CNS nº 466/2012 e da Resolução CNS nº 510/2016, conduzida em ambiente clínico, com garantia de confidencialidade, sigilo e respeito à dignidade dos participantes.',
  'O presente estudo consiste em uma pesquisa clínica de caráter tecnológico, voltada ao desenvolvimento e à validação inicial de um aplicativo digital gamificado para rastreio neuropsicológico infantil. O estudo integra tarefas baseadas em testes neuropsicológicos clássicos e questionários comportamentais, com o objetivo de avaliar aspectos do funcionamento cognitivo, comportamental e socioemocional, especialmente relacionados à atenção e às funções executivas, subsidiando a produção de evidências científicas e o apoio à tomada de decisão clínica.

**Referencial teórico metodológico:** O presente estudo está fundamentado em uma concepção neuropsicológica desenvolvimentista e integrativa, que compreende o funcionamento cognitivo e comportamental como resultado da interação dinâmica entre processos neurobiológicos, trajetórias do desenvolvimento e contextos socioculturais ao longo do ciclo vital. Essa perspectiva dialoga com os modelos contemporâneos do neurodesenvolvimento, segundo os quais funções cognitivas como atenção, controle inibitório, memória de trabalho e autorregulação comportamental emergem de sistemas funcionais complexos, distribuídos e progressivamente organizados, especialmente durante a infância (American Psychiatric Association, 2022; Salles et al., 2011).

No campo da avaliação neuropsicológica, entende-se que o Transtorno de Déficit de Atenção e Hiperatividade (TDAH) constitui um transtorno do neurodesenvolvimento caracterizado por padrões persistentes de desatenção e/ou hiperatividade-impulsividade, associados a prejuízos funcionais em múltiplos contextos, não sendo passível de identificação por meio de um único marcador biológico ou teste isolado (APA, 2022). Assim, a avaliação neuropsicológica deve ser conduzida de forma multimétodo, integrando medidas objetivas de desempenho cognitivo, instrumentos psicométricos e informações contextuais fornecidas por cuidadores e responsáveis (Miotto et al., 2018). Nesse sentido, a avaliação neuropsicológica de rastreio é compreendida como um processo técnico-científico que envolve a seleção criteriosa de instrumentos validados, a análise quantitativa dos desempenhos obtidos e a interpretação qualitativa do comportamento observado durante a execução das tarefas (Campanholo & Serrao, 2018). A análise qualitativa inclui aspectos como estratégias utilizadas, padrão de erros, variabilidade atencional, tempo de resposta, persistência frente à tarefa e autorregulação comportamental, elementos fundamentais para a compreensão do funcionamento executivo infantil, especialmente em quadros de TDAH.',
  'A avaliação de rastreio cognitivo foi conduzida em 1 sessão, com duração média de 60 minutos. A aplicação dos instrumentos foi realizada em ambiente presencial, reservado, silencioso e adequadamente controlado, com a utilização de instrumentos psicológicos adaptados e validados para o contexto brasileiro, com normas padronizadas compatíveis com a faixa etária e nível educacional da avaliada, assegurando condições adequadas de conforto, privacidade e livre expressão da avaliada. A avaliação foi conduzida de forma sistemática, com a aplicação dos procedimentos metodológicos descritos a seguir.',
  'Declaro que o presente documento apresenta os resultados parciais da coleta de dados realizada no âmbito de uma pesquisa clínica, conduzida de acordo com o protocolo aprovado pelo Comitê de Ética em Pesquisa sob número de CAAE: 86772125.6.0000.5324. A coleta envolveu a aplicação de instrumentos neuropsicológicos, procedimentos de observação comportamental e registros padronizados, conforme previsto no delineamento metodológico do estudo.',
  array[
    'A análise isolada deste relatório não possui valor diagnóstico, devendo seus achados ser interpretados exclusivamente no contexto do estudo e em conjunto com outros dados clínicos e científicos.',
    'Assim como todos os dados obtidos no decorrer da pesquisa, será mantido sob a guarda da equipe responsável pelo estudo pelo período mínimo de cinco anos após o encerramento da pesquisa, em conformidade com as normativas éticas vigentes para pesquisas envolvendo seres humanos.'
  ],
  'https://docs.google.com/document/d/1Jj6fyBI96s7JI3pJr52Zs4DOc2QVBBnhXUXbUItjlP8/edit?tab=t.0#heading=h.mjoddr7ijyyg',
  'São Paulo - SP',
  null
from public.institutions i
where lower(btrim(i.name)) = 'mindfocus'
on conflict (institution_id) do nothing;

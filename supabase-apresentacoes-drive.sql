-- ============================================================
-- APRESENTAÇÕES NO DRIVE
-- ============================================================
-- Guarda, do lado do servidor, duas coisas que o navegador não
-- pode ver:
--
--   1. qual pasta do Drive é de quem      (drive_pastas)
--   2. qual arquivo do Drive é cada foto  (trabalho_fotos)
--
-- Por que fora do `trabalhos.dados`: o navegador escreve o
-- `dados`. Se o id do Drive morasse lá, ele chegaria ao
-- navegador — e aí /api/foto viraria um proxy aberto: bastaria
-- pedir um id qualquer. Aqui o navegador pede por
-- trabalho + ambiente + ordem, e QUEM decide se ele pode é a
-- RLS de `trabalhos`, que já existe e já está certa.
--
-- Rode inteiro. É idempotente: pode rodar de novo sem medo.
-- ============================================================


-- ------------------------------------------------------------
-- 1. AS PASTAS
-- ------------------------------------------------------------
-- A árvore é: APRESENTAÇÕES - MATERIAIS > Patrícia > Cliente
--
-- Guardamos o ID, nunca o nome. É isso que faz você poder
-- renomear a Patrícia no painel, ou renomear a pasta dentro do
-- próprio Drive, sem que o sistema crie uma segunda pasta e
-- rache os projetos dela em duas.

create table if not exists public.drive_pastas (
  escopo     text not null check (escopo in ('usuario', 'cliente')),
  chave      text not null,
  pasta      text not null,
  nome_usado text,
  criado_em  timestamptz not null default now(),
  primary key (escopo, chave)
);

comment on table public.drive_pastas is
  'Pastas do Drive já criadas. escopo=usuario: chave é o uuid do perfil. '
  'escopo=cliente: chave é "<uuid do perfil>|<cliente>". '
  'A chave do cliente inclui o dono porque duas pessoas podem atender o '
  'mesmo cliente, e cada uma tem a sua própria pasta.';

comment on column public.drive_pastas.nome_usado is
  'O nome com que a pasta foi criada. Só para você conferir no Drive — '
  'o sistema nunca procura por ele, só pelo id.';


-- ------------------------------------------------------------
-- 2. AS FOTOS
-- ------------------------------------------------------------

create table if not exists public.trabalho_fotos (
  trabalho   uuid not null references public.trabalhos on delete cascade,
  ambiente   text not null,
  ordem      int  not null,
  drive_id   text not null,
  nome       text,
  bytes      bigint,
  criado_em  timestamptz not null default now(),
  primary key (trabalho, ambiente, ordem)
);

comment on table public.trabalho_fotos is
  'Uma linha por foto de apresentação guardada no Drive. O navegador NUNCA '
  'lê esta tabela: ele pede a foto por trabalho+ambiente+ordem e o servidor '
  'resolve o drive_id. Assim o id do arquivo não sai daqui.';

comment on column public.trabalho_fotos.ambiente is
  'O id do ambiente dentro de trabalhos.dados — não o nome. O nome muda '
  'quando o consultor renomeia o ambiente; o id não.';

-- `on delete cascade` acima: apagada a apresentação, as linhas
-- vão com ela. O arquivo no Drive FICA. É de propósito: apagar
-- no app não apaga o acervo do cliente. Quem limpa o Drive é
-- gente, com a mão.

create index if not exists trabalho_fotos_por_trabalho
  on public.trabalho_fotos (trabalho);


-- ------------------------------------------------------------
-- 3. FECHAR AS DUAS PARA O NAVEGADOR
-- ------------------------------------------------------------
-- Ligar a RLS não basta. O Supabase concede select/insert/
-- update/delete a anon e authenticated por padrão, e
-- `revoke from public` NÃO desfaz isso — são concessões
-- nominais, nos dois papéis. Tem de revogar nos dois, pelo
-- nome. Sem isto, o navegador leria o drive_id direto pelo
-- PostgREST e todo o cuidado acima não valeria nada.

alter table public.drive_pastas    enable row level security;
alter table public.trabalho_fotos  enable row level security;

revoke all on public.drive_pastas   from anon, authenticated;
revoke all on public.trabalho_fotos from anon, authenticated;

grant all on public.drive_pastas    to service_role;
grant all on public.trabalho_fotos  to service_role;

-- Sem nenhuma policy: com a RLS ligada e sem policy, ninguém
-- lê — nem com grant. O service_role passa porque ignora RLS.
-- As duas defesas estão de pé, e qualquer uma sozinha já basta.


-- ------------------------------------------------------------
-- 4. RESERVAR A PASTA (sem criar duas)
-- ------------------------------------------------------------
-- O problema: a Patrícia salva duas apresentações ao mesmo
-- tempo, em duas abas. As duas chamadas não acham a pasta dela,
-- as duas criam — e o Drive aceita nome repetido sem reclamar.
-- Ficam duas pastas "Patricia", metade dos projetos em cada.
--
-- A chave primária resolve: quem insere primeiro ganha, o
-- segundo recebe a pasta do primeiro. Uma volta ao banco, sem
-- lock, sem transação longa.

create or replace function public.reservar_pasta_drive(
  p_escopo text,
  p_chave  text,
  p_pasta  text,
  p_nome   text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ja text;
begin
  if not public.eh_servidor() then
    raise exception 'reservar_pasta_drive só pode ser chamada pelo servidor';
  end if;

  /* Sem pasta é consulta, não reserva: é assim que o código
     pergunta "essa pasta já existe?" antes de criar nada no
     Drive. Sem esta saída, o insert estouraria no not null. */
  if p_pasta is null then
    select pasta into ja
      from public.drive_pastas
     where escopo = p_escopo and chave = p_chave;
    return ja;
  end if;

  insert into public.drive_pastas (escopo, chave, pasta, nome_usado)
  values (p_escopo, p_chave, p_pasta, p_nome)
  on conflict (escopo, chave) do nothing;

  select pasta into ja
    from public.drive_pastas
   where escopo = p_escopo and chave = p_chave;

  return ja;
end;
$$;

comment on function public.reservar_pasta_drive is
  'Devolve o id da pasta que vale: a sua, se você chegou primeiro, ou a de '
  'quem chegou antes. Nunca devolve nulo. Só o servidor chama.';

revoke all on function public.reservar_pasta_drive(text, text, text, text)
  from anon, authenticated;
grant execute on function public.reservar_pasta_drive(text, text, text, text)
  to service_role;


-- ------------------------------------------------------------
-- 5. REGISTRAR A FOTO
-- ------------------------------------------------------------
-- Substitui se já houver: trocar a foto de um ambiente é
-- normal, e o lugar dela (ambiente + ordem) é o mesmo.

create or replace function public.registrar_foto_drive(
  p_trabalho uuid,
  p_ambiente text,
  p_ordem    int,
  p_drive_id text,
  p_nome     text default null,
  p_bytes    bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_servidor() then
    raise exception 'registrar_foto_drive só pode ser chamada pelo servidor';
  end if;

  insert into public.trabalho_fotos
         (trabalho, ambiente, ordem, drive_id, nome, bytes)
  values (p_trabalho, p_ambiente, p_ordem, p_drive_id, p_nome, p_bytes)
  on conflict (trabalho, ambiente, ordem) do update
     set drive_id  = excluded.drive_id,
         nome      = excluded.nome,
         bytes     = excluded.bytes,
         criado_em = now();
end;
$$;

revoke all on function public.registrar_foto_drive(uuid, text, int, text, text, bigint)
  from anon, authenticated;
grant execute on function public.registrar_foto_drive(uuid, text, int, text, text, bigint)
  to service_role;


-- ============================================================
-- CONFERÊNCIA — rode e leia o resultado
-- ============================================================

-- 1. As duas tabelas existem?
select 'tabela ' || c.relname as item,
       case when c.relrowsecurity then 'RLS ligada' else '⚠️ RLS DESLIGADA' end as estado
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('drive_pastas', 'trabalho_fotos')
 order by 1;

-- 2. O navegador está trancado fora?
--    O esperado é NENHUMA linha. Qualquer linha aqui é um vazamento.
select grantee, table_name, privilege_type as ainda_pode
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('drive_pastas', 'trabalho_fotos')
   and grantee in ('anon', 'authenticated')
 order by 1, 2, 3;

-- 3. As duas funções existem e só o servidor executa?
--    O esperado é NENHUMA linha.
select r.routine_name, p.grantee as ainda_executa
  from information_schema.routines r
  join information_schema.routine_privileges p
    on p.specific_name = r.specific_name
 where r.routine_schema = 'public'
   and r.routine_name in ('reservar_pasta_drive', 'registrar_foto_drive')
   and p.grantee in ('anon', 'authenticated')
 order by 1, 2;

-- 4. A regra de quem vê o quê — a que você descreveu.
--    Tem de aparecer pode_ver_trabalho, não "autor = auth.uid()".
select polname as politica, pg_get_expr(polqual, polrelid) as regra
  from pg_policy
 where polrelid = 'public.trabalhos'::regclass
   and polname = 'trabalhos_ver';

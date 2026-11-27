-- ============================================================
-- VERSÃO A CADA PDF, SEM REPETIR
-- ============================================================
-- Hoje o Checklist de Eletros não guarda versão nenhuma: ele
-- tem o estado de agora e mais nada. Se o cliente trocar um
-- eletro depois de o projeto executivo já ter sido feito, não
-- há o que mostrar — e é justamente o documento onde a troca
-- acontece. O roteiro do vídeo avisa o cliente duas vezes que
-- uma troca muda as medidas e pode mudar o prazo; sem histórico,
-- esse aviso não tem como ser cobrado.
--
-- ------------------------------------------------------------
-- POR QUE UMA FUNÇÃO NOVA, E NÃO MEXER NA registrar_versao
--
-- A registrar_versao grava SEMPRE. Para a medição isso está
-- certo: o PDF nasce na obra, na frente do cliente, e cada vez
-- que ele nasce é um fato. Aqui não: o consultor baixa o PDF do
-- Checklist para reenviar ao cliente, e baixa de novo na semana
-- seguinte. Gravando sempre, o histórico viraria vinte linhas
-- iguais e a pergunta "o que mudou?" ficaria sem resposta no
-- meio delas.
--
-- Então esta função grava SÓ QUANDO O CONTEÚDO MUDOU. E ela é
-- separada porque a regra é dela: mudar a registrar_versao
-- mudaria o comportamento da medição junto, que ninguém pediu.
--
-- ⚠️ A COMPARAÇÃO É DO `dados`, NÃO DO HASH DO PDF. Dois PDFs
-- do mesmo conteúdo podem ter bytes diferentes — a data de
-- geração entra no arquivo — e o hash sairia diferente dos dois.
-- Comparando pelo hash, a "trava" nunca travaria nada.
--
-- O que se perde: o hash guardado é o do primeiro PDF daquele
-- conteúdo. Se alguém reimprimir, o papel na mão terá outros
-- bytes e outro hash. O conteúdo é o mesmo, e é o conteúdo que
-- o histórico existe para contar.
-- ============================================================

create or replace function public.registrar_versao_pdf(
  alvo  uuid,
  dados jsonb,
  hash  text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  dono     uuid;
  loja     text;
  situacao text;
  ultima   public.formulario_versoes%rowtype;
  proximo  int;
begin
  select f.autor, f.loja, f.status
    into dono, loja, situacao
    from public.formularios f
   where f.id = alvo;

  if dono is null then
    raise exception 'Formulário não encontrado.';
  end if;

  -- A mesma regra do resto do sistema, de propósito: quem pode
  -- gravar versão é quem pode ver o trabalho.
  if not public.pode_ver_trabalho(dono, loja) then
    raise exception 'Você não tem acesso a este formulário.';
  end if;

  -- Duas versões ao mesmo tempo brigariam pelo mesmo número, e
  -- sem o cadeado duas abas abertas furariam a trava de conteúdo
  -- repetido — as duas leriam a última versão antes de qualquer
  -- uma gravar.
  perform pg_advisory_xact_lock(hashtext(alvo::text));

  select * into ultima
    from public.formulario_versoes v
   where v.formulario = alvo
   order by v.numero desc
   limit 1;

  -- Nada mudou desde a última: devolve a que já existe.
  if ultima.id is not null and ultima.dados = dados then
    return ultima.numero;
  end if;

  select coalesce(max(v.numero), 0) + 1
    into proximo
    from public.formulario_versoes v
   where v.formulario = alvo;

  insert into public.formulario_versoes
    (formulario, numero, motivo, dados, status_no_momento, hash, imutavel, criada_por)
  values
    (alvo, proximo, 'pdf', dados, situacao, hash, false, auth.uid());

  return proximo;
end;
$$;

comment on function public.registrar_versao_pdf is
  'Grava uma versão com motivo=pdf, e SÓ quando o dados mudou desde a última. '
  'Devolve o número da versão — a nova, ou a que já existia. '
  'Separada da registrar_versao porque lá gravar sempre está certo: na medição '
  'o PDF nasce na obra, na frente do cliente, e cada vez é um fato.';

revoke all on function public.registrar_versao_pdf(uuid, jsonb, text) from public;
grant execute on function public.registrar_versao_pdf(uuid, jsonb, text) to authenticated;


-- ============================================================
-- CONFERÊNCIA
-- ============================================================

-- 1. A função existe e só quem está logado executa?
--    Esperado: uma linha, com authenticated.
select r.routine_name, p.grantee
  from information_schema.routines r
  join information_schema.routine_privileges p
    on p.specific_name = r.specific_name
 where r.routine_schema = 'public'
   and r.routine_name = 'registrar_versao_pdf'
 order by 2;

-- 2. Quantas versões cada Checklist de Eletros tem hoje?
--    Antes de rodar o código novo, o esperado é NENHUMA LINHA:
--    é exatamente o buraco que estamos fechando. Depois de a
--    equipe baixar alguns PDFs, as linhas começam a aparecer.
select f.cliente,
       f.contrato,
       count(v.id) as versoes,
       max(v.criada_em) as ultima
  from public.formularios f
  left join public.formulario_versoes v on v.formulario = f.id
 where f.tipo = 'itens-extras'
 group by f.id, f.cliente, f.contrato
 order by 4 desc nulls last
 limit 20;

-- 3. Alguma versão repetida escapou?
--    Esperado: NENHUMA LINHA. Cada uma aqui é um conteúdo
--    idêntico gravado duas vezes seguidas — a trava falhando.
select v.formulario, v.numero, v.motivo
  from public.formulario_versoes v
  join public.formulario_versoes anterior
    on anterior.formulario = v.formulario
   and anterior.numero = v.numero - 1
   and anterior.dados = v.dados
 where v.motivo = 'pdf'
 order by 1, 2;

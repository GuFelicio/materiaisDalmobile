-- ============================================================
-- supabase-creative-black.sql
-- A aba da ação de novembro trocou de id na vitrine:
--      aba-blackfriday  ->  aba-creative-black
-- ============================================================
-- POR QUE ESTE ARQUIVO EXISTE
--
-- A matriz de vitrine (cargo_oculta) guarda só EXCEÇÃO: existe
-- linha ali quando o administrador marcou "esconder" para um
-- cargo. O id é texto e é o código que o escreve. Trocar o id no
-- código sem tocar no banco faria a linha antiga apontar para um
-- item que não existe mais — e a aba REAPARECERIA para o cargo
-- que a tinha escondida. Esconder é para dentro: ninguém reporta
-- que viu uma aba que não devia.
--
-- ⚠️ POR QUE ELE COPIA EM VEZ DE ATUALIZAR
--
-- O caminho óbvio seria um UPDATE de aba-blackfriday para
-- aba-creative-black. Ele abre uma janela: entre o commit do
-- UPDATE e o fim do deploy, o código no ar ainda pergunta pelo id
-- ANTIGO, que já não existe — e a aba fica visível por alguns
-- minutos justamente para quem não devia vê-la.
--
-- Então o PASSO 1 acrescenta a linha nova e DEIXA a antiga. Em
-- nenhum instante o item fica sem exceção:
--
--   antes do SQL      código velho + id velho   -> escondido
--   depois do SQL     os dois ids no banco      -> escondido
--   depois do deploy  código novo + id novo     -> escondido
--
-- O PASSO 2 limpa a linha antiga, e só faz sentido DEPOIS de o
-- deploy estar no ar. Ele está separado de propósito, no fim.
--
-- Idempotente: rodar de novo não duplica nada e não estraga nada.
-- Se o id antigo nunca foi escondido para cargo nenhum, este
-- arquivo mexe em ZERO linhas e a conferência diz "certo" —
-- que é o resultado esperado se ninguém usou a caixinha ainda.
--
-- ORDEM: rodar o PASSO 1 ANTES do deploy.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- PASSO 1 · a linha nova entra; a antiga fica
-- ------------------------------------------------------------
-- 'where not exists' em vez de 'on conflict do nothing' porque
-- este arquivo não pode depender de haver uma restrição única em
-- (cargo, item): se não houver, o 'on conflict' falha com erro de
-- sintaxe e o arquivo não roda. Assim ele roda nos dois casos.
insert into public.cargo_oculta (cargo, item)
select velho.cargo, 'aba-creative-black'
  from public.cargo_oculta as velho
 where velho.item = 'aba-blackfriday'
   and not exists (
         select 1
           from public.cargo_oculta as novo
          where novo.cargo = velho.cargo
            and novo.item  = 'aba-creative-black'
       );

commit;


-- ============================================================
-- CONFERÊNCIA
-- Todas as linhas têm de dizer "certo". Se alguma disser
-- "CONFIRA!", pare: a aba vai reaparecer para alguém.
-- ============================================================
select
  'todo cargo que escondia o id antigo esconde o novo' as o_que,
  case when not exists (
         select 1
           from public.cargo_oculta as velho
          where velho.item = 'aba-blackfriday'
            and not exists (
                  select 1 from public.cargo_oculta as novo
                   where novo.cargo = velho.cargo
                     and novo.item  = 'aba-creative-black')
       )
       then 'certo' else 'CONFIRA!' end as situacao

union all

select
  'ninguem ganhou exceção que não tinha' as o_que,
  case when not exists (
         select 1
           from public.cargo_oculta as novo
          where novo.item = 'aba-creative-black'
            and not exists (
                  select 1 from public.cargo_oculta as velho
                   where velho.cargo = novo.cargo
                     and velho.item  = 'aba-blackfriday')
       )
       then 'certo' else 'CONFIRA!' end as situacao

union all

-- Quantas linhas existem de cada lado, para o número aparecer no
-- resultado em vez de precisar de outra consulta. Zero e zero é
-- o esperado se a caixinha nunca foi usada.
select
  'linhas do id antigo' as o_que,
  count(*)::text as situacao
  from public.cargo_oculta where item = 'aba-blackfriday'

union all

select
  'linhas do id novo' as o_que,
  count(*)::text as situacao
  from public.cargo_oculta where item = 'aba-creative-black';


-- ============================================================
-- PASSO 2 · a limpeza — RODAR SÓ DEPOIS DO DEPLOY
-- ------------------------------------------------------------
-- Enquanto o código velho estiver no ar, a linha antiga é o que
-- mantém a aba escondida. Apagá-la antes do deploy é o erro que
-- este arquivo existe para evitar. Depois do deploy ela é lixo
-- invisível: o id não está mais em ABAS_PARA_A_MATRIZ, então a
-- caixinha dele nem aparece no painel.
--
-- Está comentado de propósito. Descomente e rode depois.
-- ============================================================
-- delete from public.cargo_oculta where item = 'aba-blackfriday';
--
-- select 'nenhuma linha do id antigo sobrou' as o_que,
--        case when not exists (select 1 from public.cargo_oculta
--                               where item = 'aba-blackfriday')
--             then 'certo' else 'CONFIRA!' end as situacao;

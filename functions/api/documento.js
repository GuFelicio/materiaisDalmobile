/* ============================================================
   PDF ASSINADO — Dalmóbile · roda no Cloudflare
   ------------------------------------------------------------
   Entrega o documento assinado para quem abre a medição na
   Central.

   ONDE ESTE ARQUIVO MORA
       functions/api/documento.js   →  /api/documento

   VARIÁVEIS: as mesmas de /api/assinatura. Nenhuma nova.

   POR QUE BUSCAR NA HORA, E NÃO GUARDAR NO AVISO
   A primeira versão gravava o endereço do arquivo quando o
   webhook avisava "terminou". É frágil por dois motivos:

     1. A Autentique pode ainda não ter gerado o PDF assinado no
        instante em que avisa. Aí o endereço vem vazio e nunca
        mais é tentado — o documento existe e a Central jura que
        não.
     2. Endereço guardado envelhece. Link que expira vira botão
        quebrado meses depois, exatamente quando alguém precisa
        do documento para resolver uma discussão de prazo.

   Buscando na hora, o que a Central mostra é o que a Autentique
   tem agora. E o arquivo passa POR AQUI, em vez de o navegador
   receber o endereço: assim o link da Autentique não circula, e
   quem não pode ver a medição não vê o documento.

   ONDE ESTÁ O RESTO
   Achar o arquivo, escolher entre PAdES e assinado comum, baixar
   e dar nome: tudo isso mora em lib/assinado.js, porque o
   /api/autentique precisa exatamente do mesmo arquivo para
   anexar nos e-mails. Duas cópias disso envelheceriam em
   direções diferentes.
   ============================================================ */

import { enderecosDoAssinado, baixar, nomeDoArquivo } from '../../lib/assinado.js';


export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return responder({ erro: 'Esta rota só aceita POST.' }, 405);
  }

  const url     = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const secreta = String(env.SUPABASE_SECRET || '').trim();
  const token   = String(env.AUTENTIQUE_TOKEN || '').trim();

  if (!url || !secreta || !token) {
    return responder({ erro: 'Rota fora do ar. Avise o escritório.' }, 500);
  }

  try {
    const sessao = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!sessao) throw falha('Faça login de novo e tente mais uma vez.', 401);

    let corpo;
    try { corpo = await request.json(); } catch (e) { throw falha('Pedido mal formado.', 400); }

    const alvo = String(corpo.formulario || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(alvo)) throw falha('Formulário inválido.', 400);

    /* Lido com o token do USUÁRIO: quem decide se ele alcança
       esta medição é o RLS, não uma segunda cópia da regra aqui.
       Sem acesso, a leitura volta vazia e acaba. */
    /* Rodada anterior, quando pedida. A vistoria pode ser
       reaberta, e aí o documento daquela vez não está mais na
       ficha: está na versão. Sem isto, o PDF que o cliente
       assinou na rodada 1 ficaria inalcançável depois da 2. */
    const rodada = corpo.versao === undefined || corpo.versao === null
      ? null : Number(corpo.versao);

    if (rodada !== null && !(Number.isInteger(rodada) && rodada > 0)) {
      throw falha('Versão inválida.', 400);
    }

    const ficha = await buscarComoUsuario(url, secreta, sessao, alvo);
    if (!ficha) throw falha('Formulário não encontrado.', 404);

    /* A leitura da versão usa o token do USUÁRIO, como a da
       ficha: quem decide o alcance é o RLS, não uma segunda
       cópia da regra aqui. */
    const documento = rodada === null
      ? ficha.autentique_id
      : await documentoDaVersao(url, secreta, sessao, alvo, rodada);

    if (!documento) {
      throw falha(rodada === null
        ? 'Este documento ainda não foi enviado para assinatura.'
        : 'Esta versão não tem documento assinado.', 409);
    }

    const candidatos = await enderecosDoAssinado(token, documento);

    if (!candidatos.length) {
      throw falha(ficha.status === 'assinado' || rodada !== null
        ? 'A Autentique ainda está gerando o documento assinado. Tente de novo em instantes.'
        : 'O documento ainda não foi assinado por todos.', 409);
    }

    /* Baixa aqui e repassa. O endereço da Autentique não chega
       ao navegador — ele é público para quem o tiver. */
    const baixado = await baixar(candidatos, token);

    return new Response(baixado.resposta.body, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'inline; filename="' + nomeDoArquivo(ficha, baixado.tipo) + '"',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      }
    });

  } catch (e) {
    return responder({ erro: e.publico || 'Deu errado aqui. Tente de novo em instantes.' },
                     e.status || 500);
  }
}


/* ------------------------------------------------------------
   Banco
   ------------------------------------------------------------ */

/* O documento de uma rodada encerrada. Devolve null quando a
   versão não existe, não é alcançável ou não teve documento —
   os três casos dão o mesmo recado, de propósito: dizer "existe,
   mas você não vê" já conta alguma coisa. */
async function documentoDaVersao(url, secreta, sessao, formulario, numero) {
  const r = await fetch(url + '/rest/v1/formulario_versoes'
    + '?select=autentique_id&limit=1'
    + '&formulario=eq.' + encodeURIComponent(formulario)
    + '&numero=eq.' + encodeURIComponent(numero), {
    headers: {
      apikey: secreta,
      authorization: 'Bearer ' + sessao,
      accept: 'application/json'
    }
  });

  if (r.status === 401 || r.status === 403) {
    throw falha('Sua sessão expirou. Entre de novo e tente mais uma vez.', 401);
  }
  if (!r.ok) throw falha('Não consegui ler o histórico agora.', 502);

  const linhas = await r.json();
  return (linhas && linhas[0] && linhas[0].autentique_id) || null;
}


async function buscarComoUsuario(url, secreta, sessao, id) {
  const r = await fetch(url + '/rest/v1/formularios'
    + '?select=id,tipo,cliente,contrato,status,autentique_id'
    + '&limit=1&id=eq.' + encodeURIComponent(id), {
    headers: {
      apikey: secreta,
      authorization: 'Bearer ' + sessao,
      accept: 'application/json'
    }
  });

  if (r.status === 401 || r.status === 403) {
    throw falha('Sua sessão expirou. Entre de novo e tente mais uma vez.', 401);
  }
  if (!r.ok) throw falha('Não consegui ler o formulário agora.', 502);

  const linhas = await r.json();
  return (linhas && linhas[0]) || null;
}


/* ------------------------------------------------------------
   Miudezas
   ------------------------------------------------------------ */

function responder(dados, status) {
  return new Response(JSON.stringify(dados), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function falha(publico, status) {
  const e = new Error(publico);
  e.publico = publico;
  e.status = status || 500;
  return e;
}

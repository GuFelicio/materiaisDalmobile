/* ============================================================
   FORMULÁRIO DO CLIENTE — Dalmóbile · roda no Cloudflare
   ------------------------------------------------------------
   O cliente não tem login. A única coisa que ele tem é o token
   do link, e é este arquivo que decide o que aquele token
   alcança. Então ele é a porta inteira: tudo que não estiver
   escrito aqui, não acontece.

   TRÊS REGRAS QUE NÃO SE DOBRAM
   1. O token abre UM formulário, nunca uma lista.
   2. A resposta devolve só o que a tela do cliente precisa —
      nada de autor, nada de token, nada de id interno.
   3. Formulário assinado ou cancelado não recebe mais nada.

   ONDE ESTE ARQUIVO MORA
       functions/api/formulario.js     →  /api/formulario

   As variáveis são as mesmas do /api/usuarios:
       SUPABASE_URL      https://<projeto>.supabase.co
       SUPABASE_SECRET   a secret key (sb_secret_...)
   ============================================================ */

/* Teto do que o cliente pode gravar. Um Doc 102 cheio dá uns
   8 KB; 200 KB é folga de sobra e trava o abuso. */
const TETO = 200 * 1024;

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return responder({ erro: 'Esta rota só aceita POST.' }, 405);
  }

  const url = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const secreta = String(env.SUPABASE_SECRET || '').trim();

  if (!url || !secreta) {
    return responder({ erro: 'Formulário fora do ar. Avise a loja.' }, 500);
  }

  let corpo;
  try {
    corpo = await request.json();
  } catch (e) {
    return responder({ erro: 'Pedido mal formado.' }, 400);
  }

  /* 32 caracteres hexadecimais, exatamente. Qualquer outra coisa
     nem chega a virar consulta no banco. */
  const token = String(corpo.token || '').trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(token)) {
    return responder({ erro: 'Link inválido. Peça um novo para a loja.' }, 400);
  }

  try {
    const ficha = await buscar(url, secreta, token);

    if (!ficha) {
      return responder({ erro: 'Link não encontrado. Peça um novo para a loja.' }, 404);
    }
    if (ficha.status === 'cancelado') {
      return responder({ erro: 'Este link foi cancelado pela loja.' }, 410);
    }

    const acao = String(corpo.acao || '');

    if (acao === 'abrir')     return await abrir(url, secreta, ficha);
    if (acao === 'salvar')    return await salvar(url, secreta, ficha, corpo);
    if (acao === 'finalizar') return await finalizar(url, secreta, ficha, corpo);

    return responder({ erro: 'Ação desconhecida.' }, 400);

  } catch (e) {
    return responder({ erro: e.publico || 'Deu errado aqui. Tente de novo em instantes.' },
                     e.status || 500);
  }
}


/* ------------------------------------------------------------
   Abrir
   ------------------------------------------------------------ */

async function abrir(url, secreta, ficha) {
  /* Marca a primeira abertura. Serve para o consultor saber se o
     cliente ao menos viu o link, que é metade da cobrança. */
  if (!ficha.aberto_em) {
    await gravar(url, secreta, ficha.id, { aberto_em: agora() });
  }

  return responder({ ok: true, formulario: paraOCliente(ficha) });
}


/* ------------------------------------------------------------
   Salvar — pode acontecer muitas vezes, enquanto ele preenche
   ------------------------------------------------------------ */

async function salvar(url, secreta, ficha, corpo) {
  travarSeFechado(ficha);

  const dados = corpo.dados;
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw falha('Nada para salvar.', 400);
  }

  const texto = JSON.stringify(dados);
  if (texto.length > TETO) {
    throw falha('Esse formulário ficou grande demais. Avise a loja.', 413);
  }

  await gravar(url, secreta, ficha.id, { dados: dados });

  return responder({ ok: true, em: agora() });
}


/* ------------------------------------------------------------
   Finalizar — o cliente diz que terminou
   ------------------------------------------------------------ */

async function finalizar(url, secreta, ficha, corpo) {
  travarSeFechado(ficha);

  const campos = { status: 'preenchido', preenchido_em: agora() };

  /* Normalmente a última gravação já veio pelo salvar, mas a
     tela manda junto de novo: se a conexão caiu no meio do
     preenchimento, é esta que vale. */
  if (corpo.dados && typeof corpo.dados === 'object' && !Array.isArray(corpo.dados)) {
    const texto = JSON.stringify(corpo.dados);
    if (texto.length > TETO) throw falha('Formulário grande demais.', 413);
    campos.dados = corpo.dados;
  }

  await gravar(url, secreta, ficha.id, campos);

  return responder({ ok: true });
}


function travarSeFechado(ficha) {
  if (ficha.status === 'assinado') {
    throw falha('Este formulário já foi assinado e não pode mais ser alterado.', 409);
  }
}


/* ------------------------------------------------------------
   Banco
   ------------------------------------------------------------ */

async function buscar(url, secreta, token) {
  const linhas = await sb(url, secreta,
    '/rest/v1/formularios?select=*&limit=1&token=eq.' + encodeURIComponent(token));
  return (linhas && linhas[0]) || null;
}

async function gravar(url, secreta, id, campos) {
  await sb(url, secreta, '/rest/v1/formularios?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify(campos)
  });
}

async function sb(url, secreta, caminho, opcoes) {
  const o = opcoes || {};

  const r = await fetch(url + caminho, {
    method: o.method || 'GET',
    body: o.body,
    headers: Object.assign({
      apikey: secreta,
      authorization: 'Bearer ' + secreta,
      'content-type': 'application/json'
    }, o.headers || {})
  });

  const texto = await r.text();

  let dados = null;
  if (texto) { try { dados = JSON.parse(texto); } catch (e) { dados = { msg: texto }; } }

  if (!r.ok) {
    /* A mensagem crua do Postgres não vai para o cliente: ela
       conta nome de tabela e de coluna para quem não é da casa. */
    const e = falha('Não consegui salvar agora. Tente de novo em instantes.',
                    r.status >= 500 ? 502 : 400);
    e.interno = (dados && (dados.message || dados.msg)) || r.status;
    throw e;
  }

  return dados;
}


/* ------------------------------------------------------------
   O que o cliente pode ver
   ------------------------------------------------------------ */

/* Lista fechada, não lista de exclusão: campo novo na tabela não
   vaza por esquecimento. */
function paraOCliente(ficha) {
  return {
    tipo: ficha.tipo,
    cliente: ficha.cliente,
    contrato: ficha.contrato || '',
    loja: ficha.loja,
    status: ficha.status,
    dados: ficha.dados || {},
    assinado: ficha.status === 'assinado',
    atualizado_em: ficha.atualizado_em
  };
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
      /* Sem cabeçalho de CORS: só página do mesmo endereço fala
         com esta rota pelo navegador. */
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

const agora = () => new Date().toISOString();

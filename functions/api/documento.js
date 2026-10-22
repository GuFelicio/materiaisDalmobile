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

   PREFERÊNCIA PELO PAdES
   A Autentique devolve dois arquivos assinados: 'signed' e
   'pades'. O PAdES é o que carrega a assinatura digital dentro
   do próprio PDF, no padrão que um leitor reconhece sozinho —
   é o melhor para guardar e para discutir. Quando existe, é ele.
   ============================================================ */

const AUTENTIQUE = 'https://api.autentique.com.br/v2/graphql';


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
    const ficha = await buscarComoUsuario(url, secreta, sessao, alvo);
    if (!ficha) throw falha('Formulário não encontrado.', 404);

    if (!ficha.autentique_id) {
      throw falha('Esta medição ainda não foi enviada para assinatura.', 409);
    }

    const candidatos = await enderecosDoAssinado(token, ficha.autentique_id);

    if (!candidatos.length) {
      throw falha(ficha.status === 'assinado'
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
   Onde está o arquivo
   ------------------------------------------------------------ */

async function enderecosDoAssinado(token, docId) {
  const query = `
    query Arquivo($id: UUID!) {
      document(id: $id) {
        id
        name
        files { signed pades }
        signatures { signed { created_at } }
      }
    }`;

  const corpo = new FormData();
  corpo.append('operations', JSON.stringify({ query: query, variables: { id: docId } }));
  corpo.append('map', '{}');

  const r = await fetch(AUTENTIQUE, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token },
    body: corpo
  });

  const texto = await r.text();

  let json = null;
  try { json = JSON.parse(texto); } catch (e) { json = null; }

  if (!r.ok || !json) throw falha('Não consegui falar com a Autentique agora.', 502);

  if (json.errors && json.errors.length) {
    /* Documento apagado — acontece com sandbox, que a Autentique
       remove em poucos dias. Recado claro em vez de erro cru. */
    throw falha('A Autentique não encontrou este documento. '
      + 'Se foi um envio de teste, ela o apaga depois de alguns dias.', 404);
  }

  const doc = json.data && json.data.document;
  if (!doc || !doc.files) return [];

  /* TODOS os endereços, em ordem de preferência — e não só o
     primeiro. Isto já quebrou: a Autentique devolve um endereço
     de PAdES mesmo quando esse arquivo não foi gerado, e ele dá
     404. Escolher um e desistir fazia o documento parecer
     inexistente, enquanto o 'signed' estava lá do lado.

     PAdES primeiro porque é o PDF que carrega a assinatura
     digital dentro dele, que qualquer leitor reconhece sem
     depender da Autentique continuar no ar. Mas se ele não vier,
     o assinado comum serve. */
  const lista = [];
  if (doc.files.pades)    lista.push({ tipo: 'pades',    endereco: doc.files.pades });
  if (doc.files.signed)   lista.push({ tipo: 'signed',   endereco: doc.files.signed });
  if (doc.files.original) lista.push({ tipo: 'original', endereco: doc.files.original });

  return lista.filter(function (c) {
    /* Endereço relativo não dá para buscar daqui, e fetch com
       ele estoura de um jeito que não ajuda ninguém. Melhor
       saber que veio assim. */
    if (!/^https?:\/\//i.test(c.endereco)) {
      console.warn('[documento] endereço não absoluto em ' + c.tipo + ': ' + c.endereco);
      return false;
    }
    return true;
  });
}


/* DUAS TENTATIVAS, NESTA ORDEM, E A ORDEM NÃO É ARBITRÁRIA.

   O endereço que a Autentique devolve pode ser de dois tipos, e
   eles se excluem:

     1. Link assinado de armazenamento (o caso comum). A
        credencial já está na própria URL — e mandar um cabeçalho
        'authorization' junto FAZ a S3 recusar com 400. Por isso
        a primeira tentativa é limpa.

     2. Endereço da própria Autentique, que exige o token. Aí a
        primeira tentativa volta 401/403 e a segunda resolve.

   Se as duas falharem, o recado leva os códigos — sem isso, "não
   consegui baixar" não diz se é permissão, se o arquivo não
   existe, ou se foi um documento de teste já apagado. */
async function baixar(candidatos, token) {
  const tentativas = [];

  for (const c of candidatos) {
    for (const comToken of [false, true]) {
      try {
        const r = await fetch(c.endereco,
          comToken ? { headers: { authorization: 'Bearer ' + token } } : undefined);

        if (r.ok) return { resposta: r, tipo: c.tipo };

        tentativas.push(c.tipo + (comToken ? '+token' : '') + ':' + r.status);
      } catch (e) {
        tentativas.push(c.tipo + (comToken ? '+token' : '') + ':erro');
      }
    }
  }

  /* Tudo 404 em todos os arquivos: o documento realmente não
     está mais lá. Qualquer outra combinação é outra coisa, e o
     recado leva o mapa inteiro das tentativas — sem ele,
     'não consegui baixar' não distingue permissão de arquivo
     inexistente de endereço errado. */
  const soQuatroCentoQuatro = tentativas.every(function (t) { return t.endsWith(':404'); });

  if (soQuatroCentoQuatro) {
    throw falha('O arquivo assinado não está mais disponível na Autentique. '
      + 'Documento de teste é apagado por lá depois de alguns dias.', 404);
  }

  throw falha('Não consegui baixar o documento. Tentativas: '
    + tentativas.join(', ') + '. Me mande isso.', 502);
}


function nomeDoArquivo(ficha, tipo) {
  const pedaco = function (t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  };

  return ['termo-assinado', pedaco(ficha.cliente), pedaco(ficha.contrato)]
    .filter(Boolean).join('-').slice(0, 90) + (tipo === 'pades' ? '-pades' : '') + '.pdf';
}


/* ------------------------------------------------------------
   Banco
   ------------------------------------------------------------ */

async function buscarComoUsuario(url, secreta, sessao, id) {
  const r = await fetch(url + '/rest/v1/formularios'
    + '?select=id,cliente,contrato,status,autentique_id'
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

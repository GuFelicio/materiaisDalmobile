/* ============================================================
   AVISO DA AUTENTIQUE — Dalmóbile · roda no Cloudflare
   ------------------------------------------------------------
   A Autentique bate aqui quando o documento é assinado ou
   recusado. É esta rota que marca 'assinado' no banco — e marcar
   'assinado' DISPARA O PRAZO CONTRATUAL de produção, entrega e
   montagem.

   Por isso ela é a rota mais desconfiada do sistema. Quem chegar
   aqui dizendo "o documento tal foi assinado" não é acreditado:

     1. A assinatura HMAC do pedido é conferida contra o segredo
        combinado. Sem segredo configurado, a rota NÃO processa
        nada — recusa. Processar sem conferir seria deixar o
        prazo contratual na mão de quem souber o endereço.

     2. Mesmo com a assinatura válida, nós PERGUNTAMOS À
        AUTENTIQUE se aquele documento está de fato assinado por
        todos. O aviso só serve para dizer "vá olhar o documento
        X". Assim, se o segredo vazar algum dia, um pedido forjado
        não consegue mentir — a resposta vem da Autentique, não
        de quem bateu na porta.

   ONDE ESTE ARQUIVO MORA
       functions/api/autentique.js   →  /api/autentique

   VARIÁVEIS
       SUPABASE_URL                 https://<projeto>.supabase.co
       SUPABASE_SECRET              a secret key (sb_secret_...)   ⚠️ Secret
       AUTENTIQUE_TOKEN             o token da conta               ⚠️ Secret
       AUTENTIQUE_WEBHOOK_SECRET    o segredo do webhook           ⚠️ Secret

   NO PAINEL DA AUTENTIQUE
       Cadastre o endereço
           https://materiais.luminamkt.co/api/autentique
       e assine DOIS eventos, só esses dois:
           document.finished    — todos assinaram
           signature.rejected   — alguém se recusou a assinar

       Se o painel tiver campo de segredo, use-o e ponha o mesmo
       valor em AUTENTIQUE_WEBHOOK_SECRET. Se NÃO tiver, cadastre
       o endereço com um token que você mesmo inventa:
           https://materiais.luminamkt.co/api/autentique?k=<segredo>
       e ponha esse mesmo <segredo> na variável.

   SOBRE RESPONDER RÁPIDO
   A Autentique repete o aviso em 60s, 120s e 300s se não receber
   2xx, e avisa que pode mandar o mesmo evento mais de uma vez e
   fora de ordem. Então: repetição não pode virar dois registros
   (o banco trata, devolvendo false na segunda vez), e evento que
   não nos interessa recebe 200 na hora, senão ela tenta de novo
   por 14 dias à toa.
   ============================================================ */

const AUTENTIQUE = 'https://api.autentique.com.br/v2/graphql';


export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('método não permitido', { status: 405 });
  }

  /* UMA VARIÁVEL, VÁRIOS SEGREDOS.
     A Autentique gera um segredo POR ENDPOINT, e aqui são dois
     (um para os eventos de documento, outro para os de
     assinatura). Com um valor só, no máximo um dos dois poderia
     conferir por HMAC — e o outro dependeria do token na URL.

     Então a variável aceita lista: separe por vírgula, ponto e
     vírgula ou quebra de linha. Cabem os dois segredos da
     Autentique e o token que você pôs no ?k=, todos juntos.
     Qualquer um que bata serve.

     Não cria variável nova para cada endpoint: só esta é lida, e
     segredo guardado em variável que ninguém lê é pegadinha
     esperando daqui a seis meses. */
  const segredos = separarSegredos(env.AUTENTIQUE_WEBHOOK_SECRET);
  const token   = String(env.AUTENTIQUE_TOKEN || '').trim();
  const url     = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const secreta = String(env.SUPABASE_SECRET || '').trim();

  /* Falta configuração: recusa, e recusa com 503 de propósito.
     503 faz a Autentique tentar de novo mais tarde, então o aviso
     não se perde enquanto a variável não estiver no lugar. Um 200
     aqui jogaria a assinatura do cliente no lixo em silêncio. */
  if (!segredos.length || !token || !url || !secreta) {
    return new Response('rota ainda não configurada', { status: 503 });
  }

  /* O corpo CRU, antes de qualquer parse. A conta do HMAC é sobre
     exatamente estes bytes: reconstruir o JSON a partir do objeto
     já lido muda espaços e ordem de chaves, e a conta não fecha
     mais. */
  let cru;
  try {
    cru = await request.text();
  } catch (e) {
    return new Response('corpo ilegível', { status: 400 });
  }

  /* DUAS PORTAS, E A RAZÃO DISSO
     A documentação da Autentique descreve a conferência HMAC mas
     NÃO diz de onde sai o segredo — e o painel pode não ter campo
     para ele. Então vale também um token no próprio endereço, que
     você mesmo inventa:

         https://.../api/autentique?k=<o mesmo valor da variável>

     O token na URL é mais fraco que o HMAC: ele fica guardado na
     lista de webhooks da Autentique e aparece em log de servidor.
     Use HMAC se o painel oferecer.

     O que torna as duas aceitáveis é a trava seguinte, não esta:
     mesmo quem passe por aqui não consegue marcar nada como
     assinado, porque quem responde se o documento está assinado é
     a Autentique, não o pedido. */
  const cabecalho = (request.headers.get('x-autentique-signature') || '').trim();
  const naUrl = new URL(request.url).searchParams.get('k') || '';

  /* As duas portas usam O MESMO segredo, e por isso qualquer uma
     delas serve sozinha.

     Eu tinha escrito 'o cabeçalho manda quando existe', achando
     que impedia alguém de rebaixar o HMAC para o token. Não
     impedia nada — as duas conferem contra o mesmo valor, então
     quem passa por uma já sabe o segredo. E criava uma falha
     silenciosa de verdade: se a Autentique mandar um cabeçalho
     de assinatura que não bate (conta Free, com Authentication
     desligado), TODO aviso seria recusado apesar do token certo
     no endereço, e o prazo contratual nunca começaria. */
  let porHmac = false;
  if (cabecalho) {
    for (const s of segredos) {
      if (await assinaturaConfere(s, cru, cabecalho)) { porHmac = true; break; }
    }
  }

  let porToken = false;
  if (naUrl) {
    for (const s of segredos) {
      if (igualNoTempo(naUrl, s)) { porToken = true; break; }
    }
  }

  if (!porHmac && !porToken) {
    /* Fica no log para você saber QUAL porta falhou: cabeçalho
       presente e errado é segredo trocado; cabeçalho e token
       ausentes é webhook cadastrado sem nenhum dos dois. */
    console.warn('[autentique] recusado — cabeçalho: '
      + (cabecalho ? 'presente e inválido' : 'ausente')
      + ' · token na url: ' + (naUrl ? 'presente e inválido' : 'ausente')
      + ' · segredos configurados: ' + segredos.length);
    return new Response('assinatura inválida', { status: 401 });
  }

  let aviso;
  try {
    aviso = JSON.parse(cru);
  } catch (e) {
    return new Response('json inválido', { status: 400 });
  }

  const evento = (aviso && aviso.event) || {};
  const tipo   = String(evento.type || '');

  try {
    if (tipo === 'document.finished') {
      await documentoTerminou(env, evento);
      return new Response('ok', { status: 200 });
    }

    if (tipo === 'signature.rejected') {
      await alguemRecusou(env, evento);
      return new Response('ok', { status: 200 });
    }

    /* Qualquer outro: 200 na hora. Não assinamos esses eventos no
       painel, mas se um chegar não vale fazer a Autentique repetir
       por 14 dias um aviso que a gente ignora de propósito. */
    return new Response('ignorado', { status: 200 });

  } catch (e) {
    /* 500 faz ela tentar de novo, que é o certo quando o erro é
       nosso (Supabase fora do ar, por exemplo). A mensagem fica
       no log do Cloudflare, não na resposta. */
    console.error('[autentique] ' + tipo + ': ' + (e && e.message));
    return new Response('erro ao processar', { status: 500 });
  }
}


/* ------------------------------------------------------------
   1. A assinatura do pedido
   ------------------------------------------------------------ */

async function assinaturaConfere(segredo, cru, veio) {
  if (!veio) return false;

  const chave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  const bytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(cru)));

  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');

  /* O cabeçalho pode vir com prefixo, do tipo 'sha256=...'. */
  const limpo = veio.replace(/^sha256=/i, '').trim().toLowerCase();

  return igualNoTempo(hex, limpo);
}

/* A variável pode trazer vários segredos. Separadores: vírgula,
   ponto e vírgula, espaço ou quebra de linha — nenhum deles
   aparece dentro de um segredo hexadecimal, que é o formato que
   a Autentique gera e o que o 'openssl rand -hex' produz. */
function separarSegredos(bruto) {
  return String(bruto || '')
    .split(/[,;\s]+/)
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

/* Comparação de tempo constante. Comparar com === vaza, pelo
   tempo de resposta, quantos caracteres do começo acertaram — e
   com isso se descobre a assinatura certa um caractere por vez. */
function igualNoTempo(a, b) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}


/* ------------------------------------------------------------
   2. Documento terminou
   ------------------------------------------------------------ */

async function documentoTerminou(env, evento) {
  const id = idDoDocumento(evento);
  if (!id) return;   // sem id não há o que olhar

  /* ⚠️ AQUI ESTÁ A TRAVA QUE IMPORTA.
     Não acreditamos no aviso: perguntamos. Se a Autentique não
     disser que todos assinaram, não marcamos nada. */
  const doc = await olharDocumento(env.AUTENTIQUE_TOKEN, id);
  if (!doc) return;

  const estado = lerEstado(doc);

  if (!estado.todosAssinaram) {
    console.warn('[autentique] aviso de terminado, mas a Autentique diz que falta assinar: ' + id);
    return;
  }

  const marcou = await chamarBanco(env, 'marcar_assinado', {
    doc_id: id,
    quando: estado.ultimaAssinatura || new Date().toISOString(),
    hash_do_pdf: null
  });

  /* null = o documento não aponta para formulário nenhum daqui
     (criado à mão no painel, ou sandbox já apagado). Não há onde
     guardar endereço, e tentar seria uma leitura e um PATCH à
     toa em cada aviso. */
  if (marcou === null) return;

  /* O PDF assinado fica hospedado na Autentique. Guardar o
     endereço dá acesso imediato pela Central, sem precisar de
     Storage nem bucket nem política nova. Se um dia a Dalmóbile
     quiser cópia própria, é só baixar por aqui. */
  if (doc.files && doc.files.signed) {
    await guardarRecado(env, id, { pdfAssinado: doc.files.signed });
  }
}


/* ------------------------------------------------------------
   3. Alguém recusou
   ------------------------------------------------------------
   Recusa não é silêncio: cliente que se nega a assinar o termo é
   exatamente o que a loja precisa saber ANTES de produzir.
   ------------------------------------------------------------ */

async function alguemRecusou(env, evento) {
  const id = idDoDocumento(evento);
  if (!id) return;

  const doc = await olharDocumento(env.AUTENTIQUE_TOKEN, id);
  if (!doc) return;

  const estado = lerEstado(doc);
  if (!estado.recusa) return;   // a Autentique não confirma recusa

  await chamarBanco(env, 'marcar_recusa', {
    doc_id: id,
    quando: estado.recusa.em || new Date().toISOString(),
    quem: estado.recusa.quem || null,
    motivo: estado.recusa.motivo || null
  });
}


/* ------------------------------------------------------------
   4. Perguntar à Autentique
   ------------------------------------------------------------ */

async function olharDocumento(token, id) {
  const query = `
    query Olhar($id: UUID!) {
      document(id: $id) {
        id
        name
        files { signed }
        signatures {
          public_id
          name
          email
          signed   { created_at }
          rejected { created_at reason }
        }
      }
    }`;

  const corpo = new FormData();
  corpo.append('operations', JSON.stringify({ query: query, variables: { id: id } }));
  corpo.append('map', '{}');

  const r = await fetch(AUTENTIQUE, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token },
    body: corpo
  });

  const texto = await r.text();

  let json = null;
  try { json = JSON.parse(texto); } catch (e) { json = null; }

  if (!r.ok || !json) throw new Error('Autentique respondeu ' + r.status);

  if (json.errors && json.errors.length) {
    /* Documento apagado ou de outra conta: não é erro nosso e
       repetir não vai melhorar. Devolve nulo e o aviso morre
       com 200. */
    console.warn('[autentique] consulta recusada: '
      + json.errors.map(function (e) { return e.message; }).join(' | '));
    return null;
  }

  return (json.data && json.data.document) || null;
}


/* Quem assinou, quem recusou, e quando — a partir da resposta da
   Autentique, nunca do corpo do aviso.

   Não existe campo "terminado" na consulta de documento: a
   conclusão sai de ter data de assinatura em TODOS os
   signatários. É mais chato e é mais confiável. */
function lerEstado(doc) {
  const assinaturas = doc.signatures || [];

  if (!assinaturas.length) {
    return { todosAssinaram: false, recusa: null, ultimaAssinatura: null };
  }

  let todos = true;
  let ultima = null;
  let recusa = null;

  for (const s of assinaturas) {
    const quando = s.signed && s.signed.created_at;

    if (quando) {
      if (!ultima || quando > ultima) ultima = quando;
    } else {
      todos = false;
    }

    if (s.rejected && s.rejected.created_at && !recusa) {
      recusa = {
        em: s.rejected.created_at,
        motivo: s.rejected.reason || null,
        quem: s.name || s.email || null
      };
    }
  }

  /* Recusa manda: documento com um recusante não está terminado,
     mesmo que todos os outros tenham assinado. */
  if (recusa) todos = false;

  return { todosAssinaram: todos, recusa: recusa, ultimaAssinatura: ultima };
}


/* O id do documento, aonde quer que o aviso o tenha posto.
   Evento de documento traz o recurso em data.object; evento de
   assinatura põe os campos direto em data e o documento ao lado.
   Em vez de depender de um formato só, procura nos lugares
   plausíveis e desiste em silêncio se não achar. */
function idDoDocumento(evento) {
  const d = evento.data || {};

  const candidatos = [
    d.object && d.object.id,
    d.document && d.document.id,
    d.document_id,
    d.object && d.object.document && d.object.document.id,
    d.id
  ];

  for (const c of candidatos) {
    if (typeof c === 'string' && /^[0-9a-f-]{36}$/i.test(c)) return c;
  }

  console.warn('[autentique] não achei o id do documento no aviso');
  return null;
}


/* ------------------------------------------------------------
   5. Banco
   ------------------------------------------------------------ */

/* Vai com a chave SECRETA, que entra no Postgres como
   service_role. É assim que eh_servidor() devolve true e o
   marcar_assinado deixa passar — nenhum navegador chega aqui. */
async function chamarBanco(env, funcao, args) {
  const r = await fetch(String(env.SUPABASE_URL).replace(/\/+$/, '') + '/rest/v1/rpc/' + funcao, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SECRET,
      authorization: 'Bearer ' + env.SUPABASE_SECRET,
      'content-type': 'application/json'
    },
    body: JSON.stringify(args)
  });

  const texto = await r.text();

  if (!r.ok) {
    /* Documento que não aponta para formulário nenhum acontece
       de verdade: documento criado à mão no painel da Autentique,
       ou sandbox que já foi apagado. Não é erro para repetir. */
    if (/Nenhum formulário aponta/i.test(texto)) {
      console.warn('[autentique] ' + funcao + ': documento sem formulário aqui');
      return null;
    }
    throw new Error(funcao + ' devolveu ' + r.status + ': ' + texto.slice(0, 200));
  }

  try { return JSON.parse(texto); } catch (e) { return null; }
}


/* Acrescenta informação ao 'dados' do formulário sem reescrever o
   resto. Lê, mescla e grava — com a chave secreta, porque aqui
   não há pessoa nenhuma logada. */
async function guardarRecado(env, docId, acrescimo) {
  const base = String(env.SUPABASE_URL).replace(/\/+$/, '');
  const cab = {
    apikey: env.SUPABASE_SECRET,
    authorization: 'Bearer ' + env.SUPABASE_SECRET,
    'content-type': 'application/json'
  };

  const r = await fetch(base + '/rest/v1/formularios?select=id,dados&limit=1'
    + '&autentique_id=eq.' + encodeURIComponent(docId), { headers: cab });

  if (!r.ok) return;

  const linhas = await r.json();
  const ficha = linhas && linhas[0];
  if (!ficha) return;

  const dados = ficha.dados || {};
  dados.assinatura = Object.assign({}, dados.assinatura || {}, acrescimo);

  await fetch(base + '/rest/v1/formularios?id=eq.' + encodeURIComponent(ficha.id), {
    method: 'PATCH',
    headers: Object.assign({ prefer: 'return=minimal' }, cab),
    body: JSON.stringify({ dados: dados })
  });
}

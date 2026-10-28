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
       RESEND_API_KEY               a chave do Resend              ⚠️ Secret
       EMAIL_REMETENTE              opcional. Enquanto o domínio da Dalmóbile
                                    não estiver verificado, deixe de fora: o
                                    padrão é 'onboarding@resend.dev', que o
                                    Resend aceita sem DNS — mas que SÓ entrega
                                    no e-mail da conta Resend.
       EMAIL_TESTE_PARA             opcional. Com ela, TODO aviso vai para este
                                    endereço em vez dos destinatários de
                                    verdade — inclusive o do cliente — e o corpo
                                    diz para quem teria ido. É o que torna o
                                    teste possível antes do DNS.
       EMAIL_RESPONDER_PARA         opcional, e só para o e-mail do CLIENTE. O
                                    endereço da loja, para onde a resposta dele
                                    vai. Sem ela o corpo não convida a
                                    responder, porque a resposta iria para o
                                    remetente automático e ninguém leria.

   DOIS E-MAILS SAEM DAQUI, E ELES NÃO SE PARECEM
       equipe   — quem o banco listar em destinatarios_do_aviso. É uma TAREFA:
                  tem o botão da Central, para ver fotos, histórico e reabrir.
                  O PDF assinado vai anexo, para resolver no celular.
       cliente  — o e-mail que ele mesmo deu na ficha. É um RECIBO: o documento
                  assinado e o que ele significa, nada mais. Sem link da
                  Central, que ele não tem login para abrir.

       Cada um tem a SUA reserva no banco (avisado_em e avisado_cliente_em).
       Com uma reserva só, uma falha no segundo e-mail faria a Autentique
       repetir o aviso e o primeiro sair duas vezes.

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

import { anexoAssinado, CAMPOS_DE_ARQUIVO } from '../../lib/assinado.js';

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
     (criado à mão no painel, ou sandbox já apagado). */
  if (marcou === null) return;

  const ficha = await lerFichaPorDocumento(env, id);
  if (!ficha) return;

  /* O PDF assinado fica hospedado na Autentique. Guardar o
     endereço dá acesso imediato pela Central, sem precisar de
     Storage nem bucket nem política nova. */
  if (doc.files && doc.files.signed) {
    await guardarRecado(env, ficha, { pdfAssinado: doc.files.signed });
  }

  /* UMA BUSCA, DOIS E-MAILS. Baixar o mesmo PDF duas vezes
     gastaria o dobro do tempo de CPU da invocação — que no
     Cloudflare é contado e é curto — para entregar bytes
     idênticos.

     anexoAssinado() NUNCA ESTOURA: devolve null quando a
     Autentique ainda não gerou o arquivo, quando ele é grande
     demais, ou quando o download falha. Isto é de propósito, e é
     a decisão que importa neste trecho: a assinatura já está
     marcada no banco e o prazo contratual já começou. Derrubar o
     aviso por causa do anexo trocaria um e-mail sem PDF por
     nenhum e-mail. */
  const anexo = await anexoAssinado(env.AUTENTIQUE_TOKEN, doc, ficha);

  await avisarAEquipe(env, ficha, estado.ultimaAssinatura, anexo);
  await avisarOCliente(env, ficha, estado.ultimaAssinatura, anexo);
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
        # Os dois arquivos, não só o 'signed': o PAdES é o que vai
        # anexo quando existe. A lista de campos vem do módulo para
        # não descolar de quem a lê. (Comentário em GraphQL é '#';
        # /* */ aqui dentro é erro de sintaxe, não comentário.)
        ${CAMPOS_DE_ARQUIVO}
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

  /* A ORDEM IMPORTA: do mais específico para o mais genérico.
     'd.id' fica por último porque, em evento de assinatura, ele
     pode ser o id do EVENTO e não o do documento. */
  const candidatos = [
    d.object && d.object.id,
    d.document && d.document.id,
    d.document_id,
    d.object && d.object.document && d.object.document.id,
    d.id
  ];

  for (const c of candidatos) {
    if (pareceId(c)) return c;
  }

  console.warn('[autentique] não achei o id do documento no aviso; '
    + 'chaves em data: ' + Object.keys(d).join(', '));
  return null;
}

/* ⚠️ DE PROPÓSITO FROUXO — e isto já custou caro uma vez.
   A API tipa o id como 'UUID!', e eu li isso como UUID com
   traços, 36 caracteres. Não é: a Autentique devolve uma string
   hexadecimal longa e SEM traços
   (0f3a7a1c3493c0dbf04a10716dc7fbbe73f06922eaff42e58).

   Com a conferência estrita, todo aviso era descartado em
   silêncio: a rota devolvia 200, o painel marcava 100% de
   entrega, o Error Logs ficava limpo — e nenhuma assinatura
   chegava ao banco. Falha invisível dos dois lados.

   Rigor aqui não comprava nada, porque o id não é usado para
   decidir coisa alguma: ele serve só para PERGUNTAR à Autentique.
   Id errado devolve documento nulo e o aviso morre com 200. Quem
   valida de verdade é a resposta dela, não este teste. */
function pareceId(c) {
  return typeof c === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(c);
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


function cabecalhoDoBanco(env) {
  return {
    apikey: env.SUPABASE_SECRET,
    authorization: 'Bearer ' + env.SUPABASE_SECRET,
    'content-type': 'application/json'
  };
}

async function lerFichaPorDocumento(env, docId) {
  const base = String(env.SUPABASE_URL).replace(/\/+$/, '');

  const r = await fetch(base + '/rest/v1/formularios'
    /* 'tipo' decide o que o e-mail diz. Sem ele, uma vistoria
       assinada avisava que os prazos de produção começaram e
       mandava o link da medição. */
    + '?select=id,tipo,cliente,contrato,loja,status,dados&limit=1'
    + '&autentique_id=eq.' + encodeURIComponent(docId),
    { headers: cabecalhoDoBanco(env) });

  if (!r.ok) return null;

  const linhas = await r.json();
  return (linhas && linhas[0]) || null;
}

/* Acrescenta informação ao 'dados' do formulário sem reescrever o
   resto. Lê, mescla e grava — com a chave secreta, porque aqui
   não há pessoa nenhuma logada. */
async function guardarRecado(env, ficha, acrescimo) {
  const base = String(env.SUPABASE_URL).replace(/\/+$/, '');

  const dados = ficha.dados || {};
  dados.assinatura = Object.assign({}, dados.assinatura || {}, acrescimo);

  await fetch(base + '/rest/v1/formularios?id=eq.' + encodeURIComponent(ficha.id), {
    method: 'PATCH',
    headers: Object.assign({ prefer: 'return=minimal' }, cabecalhoDoBanco(env)),
    body: JSON.stringify({ dados: dados })
  });
}


/* ------------------------------------------------------------
   O aviso para a equipe
   ------------------------------------------------------------
   Quem recebe sai do BANCO, não daqui: a regra mora no
   destinatarios_do_aviso e é a mesma para qualquer coisa que um
   dia precise avisar. Este arquivo só escreve e manda.

   A ORDEM É PENSADA PARA NÃO MANDAR DUAS VEZES NEM NENHUMA:

     1. Pergunta quem recebe. Lista vazia (medição inapta para
        corrigir, por exemplo) e acabou — sem marcar nada, senão
        a ficha ficaria "avisada" sem ter avisado ninguém.
     2. RESERVA o aviso no banco. Se a Autentique repetir o
        evento, a segunda chamada devolve false e para aqui.
     3. Manda. Se falhar, DEVOLVE a reserva e estoura — assim a
        Autentique tenta de novo (ela repete em 60s, 120s e 300s)
        em vez de a assinatura virar silêncio.
   ------------------------------------------------------------ */

async function avisarAEquipe(env, ficha, assinadoEm, anexo) {
  const chave = String(env.RESEND_API_KEY || '').trim();

  if (!chave) {
    console.warn('[autentique] sem RESEND_API_KEY: ninguém foi avisado');
    return;
  }

  const gente = await chamarBanco(env, 'destinatarios_do_aviso', { alvo: ficha.id });
  if (!gente || !gente.length) return;

  const reservou = await chamarBanco(env, 'marcar_avisado', { alvo: ficha.id });
  if (reservou !== true) return;   // já avisado antes

  try {
    await mandarEmail(env, chave, ficha, gente, assinadoEm, anexo);
  } catch (e) {
    await liberarAviso(env, ficha.id, 'avisado_em');
    throw e;
  }
}


/* ------------------------------------------------------------
   O e-mail do cliente
   ------------------------------------------------------------
   A Autentique já manda a via assinada para quem assinou. Este
   e-mail existe porque ela manda do domínio dela, com o texto
   dela, e porque na vistoria REPROVADA o cliente não assina — ele
   entra como cópia, e depender de um 'cc' para entregar o
   documento que diz que a obra não foi aprovada é pouco.

   ⚠️ SEM ANEXO, NÃO MANDA — e aqui a decisão é o contrário da do
   aviso da equipe. A equipe tem a Central: um e-mail sem PDF
   ainda serve, porque diz o que aconteceu e tem o botão. O
   cliente não tem Central nenhuma; o e-mail É o anexo. Sem o
   arquivo ele seria um aviso de que existe um documento que ele
   não pode ver — e o cliente perderia a reserva por um e-mail que
   não entregou nada.

   Então: sem anexo, não reserva e não manda. A Autentique repete
   o aviso em 60s, 120s e 300s, e nessas repetições o PDF
   normalmente já existe. Se nem assim, o cliente ainda tem a via
   que a Autentique mandou — nada se perdeu, só este reforço.
   ------------------------------------------------------------ */
async function avisarOCliente(env, ficha, assinadoEm, anexo) {
  const chave = String(env.RESEND_API_KEY || '').trim();
  if (!chave) return;   // o aviso da equipe já reclamou no log

  const email = String(((ficha.dados || {}).email) || '').trim().toLowerCase();

  /* Cliente que assinou por WhatsApp e não deu e-mail: não é erro
     nenhum, é o caminho normal. Fica no log sem alarme. */
  if (!emailDeGente(email)) {
    console.log('[autentique] a ficha não tem e-mail do cliente: ' + ficha.id);
    return;
  }

  if (!anexo) {
    console.warn('[autentique] sem PDF assinado ainda; o cliente não foi avisado '
      + 'nesta tentativa: ' + ficha.id);
    return;
  }

  const reservou = await chamarBanco(env, 'marcar_cliente_avisado', { alvo: ficha.id });
  if (reservou !== true) return;   // o cliente já recebeu

  try {
    await mandarEmailDoCliente(env, chave, ficha, email, assinadoEm, anexo);
  } catch (e) {
    await liberarAviso(env, ficha.id, 'avisado_cliente_em');
    throw e;
  }
}


/* Devolve a reserva, para a próxima tentativa poder avisar. A
   coluna vai por parâmetro porque são duas reservas
   independentes, e liberar a errada mandaria o e-mail que já
   chegou de novo. */
async function liberarAviso(env, id, coluna) {
  try {
    const corpo = {};
    corpo[coluna] = null;

    await fetch(String(env.SUPABASE_URL).replace(/\/+$/, '')
      + '/rest/v1/formularios?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: Object.assign({ prefer: 'return=minimal' }, cabecalhoDoBanco(env)),
      body: JSON.stringify(corpo)
    });
  } catch (e) {
    console.error('[autentique] não consegui liberar ' + coluna + ' de ' + id);
  }
}

/* O mesmo teste do /api/assinatura. Frouxo de propósito: validar
   e-mail a rigor é folclore, e recusar um endereço estranho mas
   verdadeiro custa mais que tentar e falhar. */
function emailDeGente(bruto) {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(String(bruto || '').trim());
}


async function mandarEmail(env, chave, ficha, gente, assinadoEm, anexo) {
  const remetente = String(env.EMAIL_REMETENTE || '').trim()
                 || 'Central de Peças <onboarding@resend.dev>';

  /* Enquanto o domínio da Dalmóbile não estiver verificado, o
     remetente de teste do Resend só entrega no e-mail da conta.
     Com EMAIL_TESTE_PARA, tudo vai para lá e o corpo conta para
     quem teria ido — dá para conferir o roteamento inteiro sem
     mexer nos e-mails de verdade das pessoas. */
  const teste = String(env.EMAIL_TESTE_PARA || '').trim();
  const para = teste ? [teste] : gente.map(function (p) { return p.email; });

  const carta = {
    from: remetente,
    to: para,
    subject: assunto(ficha),
    html: corpoDoEmail(ficha, gente, assinadoEm, teste, anexo),
    /* A versão em texto não é enfeite de acessibilidade: e-mail
       só-HTML é sinal de spam para a maioria dos filtros, e estes
       avisos já saem de um domínio compartilhado. Mandar as duas
       partes é o jeito barato de não cair na lixeira. */
    text: corpoEmTexto(ficha, gente, assinadoEm, teste, anexo)
  };

  if (anexo) carta.attachments = [anexoParaOResend(anexo)];

  await postarNoResend(chave, carta);
}


/* O Resend recebe anexo como base64 dentro do próprio JSON. O
   campo 'tipo' que o módulo devolve (pades ou signed) serve ao
   corpo do e-mail e não vai no pedido — campo a mais ali é 422. */
function anexoParaOResend(anexo) {
  return {
    filename: anexo.filename,
    content: anexo.content,
    content_type: 'application/pdf'
  };
}


async function postarNoResend(chave, carta) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + chave,
      'content-type': 'application/json'
    },
    body: JSON.stringify(carta)
  });

  if (!r.ok) {
    const texto = await r.text();
    throw new Error('Resend devolveu ' + r.status + ': ' + texto.slice(0, 200));
  }
}


function assunto(ficha) {
  const quem = (ficha.cliente || 'cliente')
             + (ficha.contrato ? ' · ' + ficha.contrato : '');

  if (ficha.tipo === 'vistoria') {
    return (pendenciasDa(ficha) ? 'Vistoria com pendências · ' : 'Obra liberada · ') + quem;
  }
  return 'Prazo iniciado · ' + quem;
}

/* Conta as não conformidades a partir das respostas, como o banco
   faz. Um campo gravado pela tela poderia estar errado; as
   respostas são o que o cliente assinou. */
function pendenciasDa(ficha) {
  const itens = ((ficha.dados || {}).itens) || {};
  return Object.keys(itens).filter(function (k) {
    return (itens[k] || {}).resposta === 'nao';
  }).length;
}

/* O que o e-mail diz, por tipo de documento: a faixa de cima, a
   frase do meio e a tela para onde o botão leva. Era tudo fixo na
   medição, inclusive o link. */
function recadoDoDocumento(ficha, quando) {
  if (ficha.tipo === 'vistoria') {
    const n = pendenciasDa(ficha);
    const reprovada = String((ficha.dados || {}).parecer || '') === 'reprovada';

    if (!n) {
      return {
        tela: 'vistoria', fundo: '#eef3ee', borda: '#cfe0d2',
        destaque: 'A obra foi liberada pelo cliente em ' + quando + '.',
        frase: 'A vistoria não encontrou nenhuma não conformidade, e o cliente '
             + 'assinou a liberação.'
      };
    }

    return {
      tela: 'vistoria', fundo: '#fdf1e7', borda: '#f0cfae',
      destaque: reprovada
        ? 'A obra foi REPROVADA na vistoria de ' + quando + '.'
        : 'Obra aprovada COM ASSISTÊNCIA em ' + quando + '.',
      frase: (n === 1 ? '1 pendência segue' : n + ' pendências seguem')
           + ' para assistência técnica, em até <b>20 dias úteis</b>, conforme contrato.'
    };
  }

  const apto = (ficha.dados || {}).parecerFinal === 'aptos';
  return {
    tela: 'medicao', fundo: '#eef3ee', borda: '#cfe0d2',
    destaque: 'Os prazos de produção, entrega e montagem começaram a contar em ' + quando + '.',
    frase: apto
      ? 'Os ambientes foram considerados <b>aptos</b> e o cliente assinou o termo de ciência.'
      : 'Os ambientes foram considerados <b>não aptos</b>, e o cliente assinou o termo '
        + 'de responsabilidade para <b>prosseguir assumindo os riscos</b>.'
  };
}


/* O e-mail é uma TAREFA, não um recibo. Quem abre precisa saber,
   sem clicar em nada: de quem é, que o prazo começou, em que dia,
   e o que o cliente decidiu. O link é para conferir, não para
   descobrir. */
function corpoDoEmail(ficha, gente, assinadoEm, teste, anexo) {
  const quando = assinadoEm
    ? new Date(assinadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'hoje';

  const loja = ficha.loja === 'cgt' ? 'Caraguatatuba' : 'São José dos Campos';
  const r = recadoDoDocumento(ficha, quando);

  const aviso = teste
    ? '<p style="background:#fdf1e7;border:1px solid #f0cfae;padding:10px 12px;'
      + 'border-radius:8px;font-size:13px;color:#8a4b12"><b>ENVIO DE TESTE.</b> '
      + 'Na produção este e-mail iria para: '
      + escapar(gente.map(function (p) { return p.nome + ' (' + p.email + ')'; }).join(', '))
      + '.</p>'
    : '';

  return '<div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;'
    + 'max-width:520px;color:#141618">'
    + aviso
    + '<p style="font-size:18px;margin:0 0 4px"><b>' + escapar(ficha.cliente || 'Cliente') + '</b></p>'
    + '<p style="margin:0 0 18px;color:#4a5054">'
    + escapar(ficha.contrato || 'sem contrato') + ' · ' + loja + '</p>'
    + '<p style="background:' + r.fundo + ';border:1px solid ' + r.borda + ';'
    + 'padding:12px 14px;border-radius:8px;margin:0 0 18px">'
    + '<b>' + escapar(r.destaque) + '</b></p>'
    + '<p>' + r.frase + '</p>'
    + '<p style="font-size:13.5px;color:#4a5054">' + escapar(sobreOAnexo(anexo)) + '</p>'
    /* O link FICA, junto do anexo, porque não é a mesma coisa: o
       anexo resolve agora, no celular; a Central é onde estão as
       fotos, o histórico das rodadas e o botão de reabrir. */
    + '<p style="margin:22px 0 0"><a href="https://materiais.luminamkt.co/' + r.tela + '" '
    + 'style="background:#141618;color:#fff;text-decoration:none;padding:12px 18px;'
    + 'border-radius:8px;display:inline-block">Abrir na Central de Peças</a></p>'
    + '<p style="margin-top:22px;font-size:12.5px;color:#4a5054">'
    + 'Você recebeu porque é ' + escapar((gente[0] || {}).papel || 'da equipe')
    + ' na Central de Peças. Este aviso é automático.</p>'
    + '</div>';
}

/* O mesmo conteúdo, sem marcação. Quem lê em texto tem de
   receber a informação inteira, não um "abra no navegador". */
/* O que dizer do anexo, nas duas versões do corpo. Quando o PDF
   não veio, o e-mail CONTA ISSO em vez de ficar calado: um anexo
   que a pessoa procura e não acha vira "o sistema está quebrado",
   e a frase transforma isso em "está na Central". */
function sobreOAnexo(anexo) {
  if (anexo) {
    return 'O documento assinado vai em anexo'
      + (anexo.tipo === 'pades' ? ' (PDF com assinatura digital).' : '.');
  }
  return 'A Autentique ainda estava gerando o PDF assinado quando este aviso saiu. '
    + 'Ele está disponível na Central de Peças.';
}

function corpoEmTexto(ficha, gente, assinadoEm, teste, anexo) {
  const quando = assinadoEm
    ? new Date(assinadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'hoje';

  const linhas = [];

  if (teste) {
    linhas.push('*** ENVIO DE TESTE ***');
    linhas.push('Na produção este aviso iria para: '
      + gente.map(function (p) { return p.nome + ' (' + p.email + ')'; }).join(', '));
    linhas.push('');
  }

  linhas.push((ficha.cliente || 'Cliente')
    + ' — ' + (ficha.contrato || 'sem contrato')
    + ' — ' + (ficha.loja === 'cgt' ? 'Caraguatatuba' : 'São José dos Campos'));
  /* Mesma fonte do e-mail em HTML: duas versões do texto
     divergem no dia em que alguém corrige só uma. */
  const r = recadoDoDocumento(ficha, quando);
  const semMarcacao = function (t) { return String(t).replace(/<\/?b>/g, ''); };

  linhas.push('');
  linhas.push(semMarcacao(r.destaque));
  linhas.push('');
  linhas.push(semMarcacao(r.frase));
  linhas.push('');
  linhas.push(sobreOAnexo(anexo));
  linhas.push('');
  linhas.push('Abrir na Central de Peças: https://materiais.luminamkt.co/' + r.tela);
  linhas.push('');
  linhas.push('Aviso automático da Central de Peças.');

  return linhas.join('\n');
}

/* ------------------------------------------------------------
   O CORPO DO E-MAIL DO CLIENTE
   ------------------------------------------------------------
   Escrito para quem não trabalha aqui. Três regras, e cada uma
   responde a um jeito de errar:

     1. Nenhuma palavra de dentro. 'Ficha', 'parecer', 'pendência
        de item', 'rodada', 'reaberta' são nossas. O cliente tem
        móveis, uma montagem e uma loja.
     2. Nenhum link da Central. Ele não tem login, e um botão que
        pede senha a quem não tem conta é pior que nenhum botão.
     3. O documento é o assunto, não um detalhe no fim. A primeira
        coisa que o e-mail diz é o que foi decidido; a segunda é
        que está anexado.
   ------------------------------------------------------------ */

function recadoParaOCliente(ficha, quando) {
  const dados = ficha.dados || {};

  if (ficha.tipo === 'vistoria') {
    const n = pendenciasDa(ficha);
    const reprovada = String(dados.parecer || '') === 'reprovada';

    if (!n) {
      return {
        assunto: 'Vistoria da sua montagem — obra liberada',
        destaque: 'A vistoria da montagem foi concluída e a obra está liberada.',
        frase: 'Conferimos item por item com você em ' + quando
             + ', e nada ficou pendente. O documento assinado segue em anexo.'
      };
    }

    if (reprovada) {
      return {
        assunto: 'Vistoria da sua montagem',
        destaque: 'A montagem não foi aprovada na vistoria de ' + quando + '.',
        frase: (n === 1 ? 'Ficou 1 ponto a resolver' : 'Ficaram ' + n + ' pontos a resolver')
             + ', e todos estão descritos no documento em anexo. '
             + 'A obra não é considerada finalizada até que eles sejam resolvidos, '
             + 'e a loja entra em contato para combinar o atendimento.'
      };
    }

    return {
      assunto: 'Vistoria da sua montagem — com assistência técnica',
      destaque: 'A vistoria da montagem foi concluída em ' + quando + '.',
      frase: (n === 1 ? '1 ponto ficou' : n + ' pontos ficaram')
           + ' para a assistência técnica, com prazo de atendimento de até '
           + '20 dias úteis, conforme contrato. O documento em anexo tem a lista '
           + 'completa do que foi conferido e do que ficou para a assistência.'
    };
  }

  /* Medição. O caminho 'corrigir' é o único em que o cliente não
     assinou nada: ele recebe o parecer da loja. Dizer "você
     assinou" ali seria falso, e falso num documento. */
  const parecer = String(dados.parecerFinal || '');
  const caminho = String(dados.caminhoInapto || '');

  if (parecer === 'nao-aptos' && caminho === 'corrigir') {
    return {
      assunto: 'Parecer da medição do seu projeto',
      destaque: 'A medição foi feita em ' + quando + ' e os ambientes ainda não '
              + 'estão prontos para receber os móveis.',
      frase: 'O documento em anexo descreve o que precisa ser ajustado e a nova '
           + 'data combinada para a medição.'
    };
  }

  if (parecer === 'nao-aptos') {
    return {
      assunto: 'Termo da medição do seu projeto',
      destaque: 'O termo da medição foi assinado em ' + quando + '.',
      frase: 'Os ambientes foram considerados não aptos e você optou por seguir '
           + 'assim mesmo, assumindo os riscos descritos no documento. A partir da '
           + 'assinatura começam a contar os prazos de produção, entrega e montagem. '
           + 'O termo assinado segue em anexo.'
    };
  }

  return {
    assunto: 'Termo da medição do seu projeto',
    destaque: 'O termo da medição foi assinado em ' + quando + '.',
    frase: 'Os ambientes foram conferidos e estão aptos a receber os móveis. '
         + 'A partir da assinatura começam a contar os prazos de produção, entrega '
         + 'e montagem. O termo assinado segue em anexo.'
  };
}


async function mandarEmailDoCliente(env, chave, ficha, email, assinadoEm, anexo) {
  const remetente = String(env.EMAIL_REMETENTE || '').trim()
                 || 'Central de Peças <onboarding@resend.dev>';

  const teste = String(env.EMAIL_TESTE_PARA || '').trim();
  const responder = String(env.EMAIL_RESPONDER_PARA || '').trim();

  const loja = ficha.loja === 'cgt' ? 'Caraguatatuba' : 'São José dos Campos';
  const quando = assinadoEm
    ? new Date(assinadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'hoje';

  const r = recadoParaOCliente(ficha, quando);

  const carta = {
    from: remetente,
    to: [teste || email],
    subject: r.assunto + ' · Dalmóbile ' + loja,
    html: corpoDoCliente(ficha, r, loja, responder, teste, email),
    text: corpoDoClienteEmTexto(ficha, r, loja, responder, teste, email),
    attachments: [anexoParaOResend(anexo)]
  };

  if (emailDeGente(responder)) carta.reply_to = responder;

  await postarNoResend(chave, carta);
}


function corpoDoCliente(ficha, r, loja, responder, teste, email) {
  const aviso = teste
    ? '<p style="background:#fdf1e7;border:1px solid #f0cfae;padding:10px 12px;'
      + 'border-radius:8px;font-size:13px;color:#8a4b12"><b>ENVIO DE TESTE.</b> '
      + 'Na produção este e-mail iria para o cliente: ' + escapar(email) + '.</p>'
    : '';

  return '<div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;'
    + 'max-width:520px;color:#141618">'
    + aviso
    + '<p style="margin:0 0 18px">Olá, ' + escapar(ficha.cliente || 'tudo bem') + '!</p>'
    + '<p style="background:#f4f2ee;border:1px solid #e2ded6;padding:12px 14px;'
    + 'border-radius:8px;margin:0 0 18px"><b>' + escapar(r.destaque) + '</b></p>'
    + '<p style="margin:0 0 18px">' + escapar(r.frase) + '</p>'
    + '<p style="margin:0 0 18px;font-size:13.5px;color:#4a5054">'
    + 'Guarde o arquivo: ele é o seu comprovante'
    + (ficha.contrato ? ' do contrato ' + escapar(ficha.contrato) : '') + '.</p>'
    + '<p style="margin:26px 0 0;font-size:13.5px;color:#4a5054">'
    + 'Dalmóbile ' + escapar(loja)
    /* Convida a responder SÓ quando a resposta chega em algum
       lugar. Sem a variável, o remetente é automático e um
       "responda este e-mail" mandaria o cliente falar com
       ninguém. */
    + (emailDeGente(responder)
        ? '<br>Qualquer dúvida, responda este e-mail e a loja recebe.'
        : '<br>Qualquer dúvida, fale com a sua loja.')
    + '</p></div>';
}


function corpoDoClienteEmTexto(ficha, r, loja, responder, teste, email) {
  const linhas = [];

  if (teste) {
    linhas.push('*** ENVIO DE TESTE ***');
    linhas.push('Na produção este e-mail iria para o cliente: ' + email);
    linhas.push('');
  }

  linhas.push('Olá, ' + (ficha.cliente || 'tudo bem') + '!');
  linhas.push('');
  linhas.push(r.destaque);
  linhas.push('');
  linhas.push(r.frase);
  linhas.push('');
  linhas.push('Guarde o arquivo: ele é o seu comprovante'
    + (ficha.contrato ? ' do contrato ' + ficha.contrato : '') + '.');
  linhas.push('');
  linhas.push('Dalmóbile ' + loja);
  linhas.push(emailDeGente(responder)
    ? 'Qualquer dúvida, responda este e-mail e a loja recebe.'
    : 'Qualquer dúvida, fale com a sua loja.');

  return linhas.join('\n');
}


function escapar(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

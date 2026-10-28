/* ============================================================
   ASSINATURA ELETRÔNICA — Dalmóbile · roda no Cloudflare
   ------------------------------------------------------------
   Pega o PDF que o medidor acabou de gerar no celular, cria o
   documento na Autentique já assinado pela Dalmóbile, e manda o
   pedido de assinatura para o cliente.

   ONDE ESTE ARQUIVO MORA
       functions/api/assinatura.js     →  /api/assinatura

   VARIÁVEIS (Settings › Variables and Secrets, no Cloudflare)
       SUPABASE_URL        https://<projeto>.supabase.co
       SUPABASE_SECRET     a secret key (sb_secret_...)
       AUTENTIQUE_TOKEN    o token da conta da Autentique   ⚠️ Secret
       AUTENTIQUE_TETO_MB  opcional: 5 no plano grátis (padrão), 20 no pago
       AUTENTIQUE_SANDBOX  '1' para criar documento de teste, que NÃO gasta
                           crédito. Apague a variável para valer de verdade.

   ⚠️ Variável nova só vale para deploy NOVO. Depois de salvar,
   refaça o deploy, senão a rota continua sem ver o token.

   QUATRO DECISÕES QUE EXPLICAM O ARQUIVO

   1. O formulário é lido com o token DO USUÁRIO, não com a
      chave secreta. Assim quem decide se aquele medidor alcança
      aquele formulário é o RLS do banco, que já está provado —
      e não uma segunda cópia da regra aqui, que envelheceria
      diferente. Sem acesso, a leitura volta vazia e acaba.

   2. Quem assina o quê sai do que está GRAVADO no banco, nunca
      do que o navegador mandou. O corpo do pedido diz o PDF e
      os contatos; o parecer, que decide se o cliente precisa
      assinar, vem da tabela.

   3. Grava no banco ANTES de assinar pela Dalmóbile. Se duas
      requisições correrem juntas, a segunda descobre na hora da
      gravação e o documento duplicado é jogado fora ainda sem
      assinatura nenhuma — o deleteDocument só manda para a
      lixeira, então é bom que ele aconteça antes.
      E se o signDocument falhar, o documento continua válido e
      registrado: falta só a nossa assinatura, que a Dalmóbile
      põe no painel da Autentique. É um estrago bem menor que o
      contrário.

   4. A resposta devolve o NOME DA CONTA que assinou. Isso não é
      enfeite: a assinatura carrega a identidade do dono do
      token, e se o token for o da Lumina é a Lumina que aparece
      assinando o documento do cliente da Dalmóbile. Melhor
      descobrir na primeira tela do que no primeiro contrato.
   ============================================================ */

const AUTENTIQUE = 'https://api.autentique.com.br/v2/graphql';

/* Limite da Autentique, não meu: 5 MB no plano grátis, 20 MB no
   Professional. Passar disso é erro de lá, e erro de lá chega
   como mensagem crua — melhor barrar aqui com recado útil. */
const TETO_PADRAO_MB = 5;


export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return responder({ erro: 'Esta rota só aceita POST.' }, 405);
  }

  const url      = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const secreta  = String(env.SUPABASE_SECRET || '').trim();
  const token    = String(env.AUTENTIQUE_TOKEN || '').trim();
  const tetoMB   = Number(env.AUTENTIQUE_TETO_MB || TETO_PADRAO_MB) || TETO_PADRAO_MB;

  /* Documento de teste: não gasta crédito do plano e a Autentique
     o apaga em alguns dias. Vai ADIANTE em toda resposta, e a tela
     mostra isso em letra grande — um termo de sandbox não pode ser
     confundido com um termo de verdade meses depois. */
  const sandbox = querSandbox(env.AUTENTIQUE_SANDBOX);

  if (!url || !secreta) {
    return responder({ erro: 'Assinatura fora do ar. Avise o escritório.' }, 500);
  }
  if (!token) {
    return responder({
      erro: 'A assinatura digital ainda não foi configurada. Avise o escritório.',
      pista: 'falta AUTENTIQUE_TOKEN — e variável nova só vale para deploy novo'
    }, 503);
  }

  try {
    /* O JWT da sessão do medidor. É ele que vai mandar na
       leitura e na gravação. */
    const sessao = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!sessao) throw falha('Faça login de novo e tente mais uma vez.', 401);

    const pedido = await lerPedido(request, tetoMB);
    const ficha  = await buscarComoUsuario(url, secreta, sessao, pedido.formulario);

    if (!ficha) {
      /* Não existe e não tenho acesso dão a MESMA resposta, de
         propósito: a diferença entre as duas conta se aquele
         contrato existe para quem não deveria saber. */
      throw falha('Formulário não encontrado.', 404);
    }
    if (pedido.cancelar) {
      return await cancelar(url, secreta, sessao, token, ficha);
    }

    if (ficha.autentique_id) {
      /* O id vai junto de propósito: quando a tela e o servidor
         discordam — envio que chegou ao fim mas cuja resposta não
         voltou — é com ele que a tela se acerta, em vez de ficar
         oferecendo um botão que o banco vai recusar para sempre. */
      throw falha('Este formulário já foi enviado para assinatura.', 409,
                  { jaEnviado: true, documento: ficha.autentique_id });
    }
    if (ficha.status === 'apagado' || ficha.status === 'cancelado') {
      throw falha('Este formulário não está mais ativo.', 409);
    }

    const plano = planoDeAssinatura(ficha, pedido);

    /* Quem é a conta do token. Vai no documento como signatário
       da Dalmóbile e volta na resposta para a tela mostrar. */
    const conta = await contaDaAutentique(token);

    const signatarios = montarSignatarios(conta, plano);

    const documento = await criarDocumento(token, {
      nome: (sandbox ? '[TESTE] ' : '') + plano.nome,
      recado: plano.recado,
      pdf: pedido.pdf,
      signatarios: signatarios,
      copiaPara: plano.copiaPara,
      sandbox: sandbox
    });

    /* Gravar primeiro. Se outra requisição chegou antes, é aqui
       que se descobre — e o documento recém-criado vai para a
       lixeira antes de receber assinatura. */
    try {
      await registrarNoBanco(url, secreta, sessao, ficha.id, documento.id, plano.canal);
    } catch (e) {
      await descartar(token, documento.id);
      throw e;
    }

    /* A assinatura da Dalmóbile. Falhar aqui não desfaz nada: o
       documento está criado e registrado, só falta esta parte, e
       ela pode ser feita à mão no painel. */
    let assinamos = false;
    let avisoDaAssinatura = null;
    try {
      assinamos = await assinarPelaDalmobile(token, documento.id);
    } catch (e) {
      avisoDaAssinatura = e.publico || 'Não consegui assinar automaticamente.';
    }

    return responder({
      ok: true,
      documento: documento.id,
      assinadoPor: assinamos ? (conta.nome || conta.email) : null,
      contaDaAssinatura: { nome: conta.nome, email: conta.email },
      clienteAssina: plano.clienteAssina,
      canal: plano.canal,
      sandbox: sandbox,
      linkDoCliente: documento.linkDoCliente || null,
      aviso: avisoDaAssinatura
    });

  } catch (e) {
    return responder(
      Object.assign(
        { erro: e.publico || 'Deu errado aqui. Tente de novo em instantes.' },
        e.extra || {}
      ),
      e.status || 500
    );
  }
}


/* ------------------------------------------------------------
   O pedido que vem da tela
   ------------------------------------------------------------
   multipart, não JSON: o PDF com fotos passa de 1 MB fácil, e
   base64 em JSON inflaria um terço à toa.
   ------------------------------------------------------------ */

async function lerPedido(request, tetoMB) {
  let form;
  try {
    form = await request.formData();
  } catch (e) {
    throw falha('Pedido mal formado.', 400);
  }

  const id = String(form.get('formulario') || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw falha('Formulário inválido.', 400);

  /* Cancelar não manda PDF: é o contrário de mandar. Sai aqui,
     antes de toda a conferência de arquivo. */
  if (String(form.get('acao') || '').trim() === 'cancelar') {
    return { formulario: id, cancelar: true };
  }

  const arquivo = form.get('pdf');
  if (!arquivo || typeof arquivo.arrayBuffer !== 'function') {
    throw falha('O PDF não chegou. Gere o PDF e tente de novo.', 400);
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());

  if (!bytes.length) throw falha('O PDF chegou vazio.', 400);

  /* %PDF- nos primeiros cinco bytes. Barra arquivo trocado por
     engano antes de gastar chamada na Autentique. */
  const cabeca = String.fromCharCode.apply(null, bytes.subarray(0, 5));
  if (cabeca !== '%PDF-') throw falha('O arquivo enviado não é um PDF.', 400);

  const teto = tetoMB * 1024 * 1024;
  if (bytes.length > teto) {
    throw falha(
      'O PDF ficou com ' + (bytes.length / 1048576).toFixed(1) + ' MB e o limite da ' +
      'assinatura é ' + tetoMB + ' MB. Tire algumas fotos do termo e gere de novo.', 413);
  }

  return {
    formulario: id,
    pdf: bytes,
    whatsapp: String(form.get('whatsapp') || '').trim(),
    email:    String(form.get('email') || '').trim().toLowerCase()
  };
}


/* ------------------------------------------------------------
   Quem assina o quê
   ------------------------------------------------------------
   Sai do que está gravado. O navegador não escolhe isto: se
   escolhesse, bastaria mexer no pedido para transformar um termo
   de responsabilidade num aviso sem assinatura.
   ------------------------------------------------------------ */

function planoDeAssinatura(ficha, pedido) {
  if (ficha.tipo === 'vistoria') return planoDaVistoria(ficha, pedido);
  return planoDaMedicao(ficha, pedido);
}


/* ------------------------------------------------------------
   Vistoria de montagem
   ------------------------------------------------------------
   Quem assina sai do parecer:

     aprovada sem restrição  → o cliente assina
     aprovada com assistência→ o cliente assina
     reprovada               → a Dalmóbile assina e o cliente recebe

   Tudo é recontado AQUI, a partir das respostas gravadas, em vez
   de acreditar no que o navegador mandou. O corpo do pedido pode
   ser escrito à mão por qualquer um com a sessão aberta; as
   respostas não, porque vêm do banco.
   ------------------------------------------------------------ */
function planoDaVistoria(ficha, pedido) {
  const dados = ficha.dados || {};
  const itens = dados.itens || {};

  let pendentes = 0;
  let embranco = 0;
  Object.keys(itens).forEach(function (k) {
    const r = (itens[k] || {}).resposta;
    if (r === 'nao') pendentes += 1;
    else if (!r) embranco += 1;
  });

  if (embranco) {
    throw falha('Responda todos os itens antes de enviar para assinatura.', 422);
  }

  const escolhido = String(dados.parecer || '');
  if (pendentes && escolhido !== 'assistencia' && escolhido !== 'reprovada') {
    throw falha('Escolha entre aprovar com assistência e reprovar antes de enviar para assinatura.', 422);
  }

  const cliente  = ficha.cliente || 'Cliente';
  const contrato = ficha.contrato ? ' · ' + ficha.contrato : '';

  /* Reprovada: o cliente NÃO assina. O documento é o parecer da
     Dalmóbile, assinado por nós, e o e-mail é obrigatório porque
     sem ele o documento nasce assinado e não chega a ninguém —
     custou e não registrou nada. */
  if (pendentes && escolhido === 'reprovada') {
    if (!emailValido(pedido.email)) {
      throw falha('Informe o e-mail do cliente: é por ele que a vistoria reprovada é entregue.', 422);
    }
    return {
      clienteAssina: false,
      canal: 'email',
      nome: 'Vistoria de montagem — obra reprovada · ' + cliente + contrato,
      recado: 'Segue a vistoria da montagem, com as pendências apontadas e o prazo de atendimento.',
      copiaPara: pedido.email
    };
  }

  const fone = normalizarWhatsapp(pedido.whatsapp);
  if (!fone) {
    throw falha('Informe o WhatsApp do cliente com DDD para pedir a assinatura.', 422);
  }

  return {
    clienteAssina: true,
    canal: 'whatsapp',
    nome: (pendentes ? 'Vistoria de montagem — aprovada com assistência'
                     : 'Vistoria de montagem — obra liberada') + ' · ' + cliente + contrato,
    recado: pendentes
      ? 'Olá! Segue a vistoria da sua montagem. Ela registra o que está conforme e o '
        + 'que ficou para a assistência técnica.'
      : 'Olá! Segue a vistoria da sua montagem, com a liberação da obra.',
    cliente: { nome: cliente, telefone: fone },
    copiaPara: emailValido(pedido.email) ? pedido.email : null
  };
}


function planoDaMedicao(ficha, pedido) {
  const dados   = ficha.dados || {};
  const parecer = dados.parecerFinal || '';
  const caminho = dados.caminhoInapto || '';
  const cliente = ficha.cliente || 'Cliente';
  const contrato = ficha.contrato ? ' · ' + ficha.contrato : '';

  if (!parecer) {
    throw falha('Preencha o parecer final antes de enviar para assinatura.', 422);
  }

  /* Apto, e também inapto com o cliente assumindo o risco: nos
     dois o cliente assina, porque nos dois é a assinatura dele
     que faz o prazo começar a contar. */
  if (parecer === 'aptos' || (parecer === 'nao-aptos' && caminho === 'prosseguir')) {
    const fone = normalizarWhatsapp(pedido.whatsapp);
    if (!fone) {
      throw falha('Informe o WhatsApp do cliente com DDD para pedir a assinatura.', 422);
    }
    return {
      clienteAssina: true,
      canal: 'whatsapp',
      nome: (parecer === 'aptos' ? 'Termo de ciência — medição' : 'Termo de responsabilidade — medição')
            + ' · ' + cliente + contrato,
      recado: 'Olá! Segue o termo da medição do seu projeto Dalmóbile. '
            + 'A assinatura é o que dá início aos prazos de produção, entrega e montagem.',
      cliente: { nome: cliente, telefone: fone },
      /* Opcional aqui: o cliente assina pelo WhatsApp, e o
         e-mail serve só para ele receber a via assinada depois.
         Se não deu e-mail, ele ainda assina normalmente. */
      copiaPara: emailValido(pedido.email) ? pedido.email : null
    };
  }

  /* Inapto com nova data marcada: aqui o cliente NÃO assina. O
     documento é um parecer da Dalmóbile, assinado por nós, que
     vai por e-mail para registrar a conversa e a nova data.

     O e-mail é obrigatório justamente por isso: sem ele o
     parecer nasce assinado e não chega a ninguém, que é o pior
     dos mundos — custou e não documentou nada. */
  if (parecer === 'nao-aptos' && caminho === 'corrigir') {
    if (!emailValido(pedido.email)) {
      throw falha('Informe o e-mail do cliente: é por ele que o parecer é entregue.', 422);
    }
    return {
      clienteAssina: false,
      canal: 'email',
      nome: 'Parecer de suspensão — medição · ' + cliente + contrato,
      recado: 'Segue o parecer da medição, com os pontos a corrigir e a nova data.',
      copiaPara: pedido.email
    };
  }

  throw falha('Escolha o caminho do parecer antes de enviar para assinatura.', 422);
}


/* O WhatsApp precisa chegar em E.164, senão a Autentique manda
   para o vazio e a cobrança acontece do mesmo jeito.

   Celular brasileiro tem 11 dígitos com DDD. Fixo tem 10 e não
   serve: não existe WhatsApp em fixo para este uso. */
function normalizarWhatsapp(bruto) {
  const so = String(bruto || '').replace(/\D+/g, '');
  if (!so) return null;

  /* Já veio com o 55 na frente. */
  if (so.length === 13 && so.slice(0, 2) === '55') return '+' + so;

  /* 11 dígitos: DDD + 9 + oito. O que a pessoa digita. */
  if (so.length === 11) return '+55' + so;

  return null;
}


function emailValido(bruto) {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(String(bruto || '').trim());
}


/* ⚠️ TOLERANTE DE PROPÓSITO, E SÓ ESTA.
   Errar para "ligado" custa um documento de teste. Errar para
   "desligado" custa dinheiro de verdade, um dos dez documentos do
   plano grátis, e um termo real indo para um cliente real. Os dois
   erros não têm o mesmo preço, então a leitura não pode ser
   literal demais.

   Aconteceu: a variável foi salva como '=1', porque no Cloudflare
   o campo é só o valor e é natural digitar o formato NOME=valor.
   Com a comparação estrita, isso desligava o sandbox em silêncio.

   Valor presente que não dá para entender vira aviso no log, não
   suposição: nesse caso fica DESLIGADO, porque adivinhar "ligado"
   a partir de lixo seria pior. */
function querSandbox(bruto) {
  const v = String(bruto == null ? '' : bruto).trim().replace(/^=+/, '').toLowerCase();
  if (!v) return false;
  if (['1', 'true', 'sim', 'on', 'yes', 'y', 's'].indexOf(v) !== -1) return true;
  if (['0', 'false', 'nao', 'não', 'off', 'no', 'n'].indexOf(v) !== -1) return false;

  console.warn('[assinatura] AUTENTIQUE_SANDBOX com valor que não entendi ('
    + v + '); tratando como DESLIGADO — os documentos vão valer de verdade.');
  return false;
}


function montarSignatarios(conta, plano) {
  /* A Dalmóbile entra como signatário por e-mail porque é o que
     permite o signDocument: a Autentique só assina em nome da
     conta do token se essa conta estiver entre os signatários.
     O e-mail custa US$ 0,002 e serve de recibo para a loja. */
  const lista = [{ email: conta.email, action: 'SIGN' }];

  if (plano.clienteAssina) {
    lista.push({
      name: plano.cliente.nome,
      phone: plano.cliente.telefone,
      delivery_method: 'DELIVERY_METHOD_WHATSAPP',
      action: 'SIGN'
    });
  }

  return lista;
}


/* ------------------------------------------------------------
   Autentique
   ------------------------------------------------------------ */

async function contaDaAutentique(token) {
  const d = await graphql(token, '{ me { id name email } }');
  const me = d && d.me;
  if (!me || !me.email) {
    throw falha('Não consegui falar com a Autentique. Confira o token.', 502);
  }
  return { nome: me.name || '', email: me.email };
}


async function criarDocumento(token, p) {
  const query = `
    mutation Criar($document: DocumentInput!, $signers: [SignerInput!]!,
                   $file: Upload!, $sandbox: Boolean) {
      createDocument(document: $document, signers: $signers, file: $file,
                     sandbox: $sandbox) {
        id
        name
        signatures { public_id name email link { short_link } }
      }
    }`;

  const variables = {
    document: {
      name: p.nome.slice(0, 180),
      message: p.recado,
      /* Lembrete semanal: medição inapta costuma ficar parada
         esperando o cliente, e cobrar sozinho poupa ligação. */
      reminder: 'WEEKLY',
      /* Recusar é informação, não problema: cliente que se nega
         a assinar o termo é exatamente o que a loja precisa
         saber antes de produzir. */
      refusable: true,
      /* Sem ordem: a Dalmóbile assina na hora e o cliente não
         fica esperando a vez. */
      sortable: false
    },
    signers: p.signatarios,
    file: null,
    sandbox: !!p.sandbox
  };

  /* Cópia: recebe o documento pronto sem precisar assinar. É
     como o parecer de suspensão chega ao cliente — e, nos outros
     dois casos, como ele recebe a via assinada depois. */
  if (p.copiaPara) variables.document.cc = [{ email: p.copiaPara }];

  const corpo = new FormData();
  corpo.append('operations', JSON.stringify({ query: query, variables: variables }));
  corpo.append('map', JSON.stringify({ file: ['variables.file'] }));
  corpo.append('file',
    new Blob([p.pdf], { type: 'application/pdf' }),
    'termo-de-medicao.pdf');

  const d = await enviar(token, corpo);
  const doc = d && d.createDocument;

  if (!doc || !doc.id) {
    throw falha('A Autentique não devolveu o documento. Tente de novo.', 502);
  }

  /* O link curto do cliente, quando a Autentique devolve. Serve
     para o medidor reenviar por onde quiser se o WhatsApp não
     chegar. */
  let linkDoCliente = null;
  for (const s of (doc.signatures || [])) {
    if (s && s.link && s.link.short_link && !s.email) linkDoCliente = s.link.short_link;
  }

  return { id: doc.id, linkDoCliente: linkDoCliente };
}


async function assinarPelaDalmobile(token, id) {
  const d = await graphql(token,
    'mutation Assinar($id: UUID!) { signDocument(id: $id) }', { id: id });
  return !!(d && d.signDocument);
}


/* Para a lixeira da conta. Não bloqueia documento já assinado —
   por isso só é chamado antes de assinarmos. */
async function descartar(token, id) {
  try {
    await graphql(token, 'mutation Apagar($id: UUID!) { deleteDocument(id: $id) }', { id: id });
  } catch (e) {
    /* Não estoura: o erro que trouxe até aqui é mais importante
       de contar que a falha em limpar. */
  }
}


async function graphql(token, query, variables) {
  const corpo = new FormData();
  corpo.append('operations', JSON.stringify({
    query: query, variables: variables || {}
  }));
  corpo.append('map', '{}');
  return await enviar(token, corpo);
}


async function enviar(token, corpo) {
  let r;
  try {
    r = await fetch(AUTENTIQUE, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token },
      body: corpo
    });
  } catch (e) {
    throw falha('Não consegui falar com a Autentique agora. Tente de novo.', 502);
  }

  const texto = await r.text();

  let json = null;
  if (texto) { try { json = JSON.parse(texto); } catch (e) { json = null; } }

  if (!r.ok || !json) {
    throw falha('A assinatura digital recusou o pedido. Avise o escritório.', 502);
  }

  if (json.errors && json.errors.length) {
    throw falha(recadoDoErro(json.errors), 502);
  }

  return json.data;
}


/* A Autentique devolve erro de máquina. Vira recado de gente
   quando dá — e os três abaixo são os que de fato acontecem. */
function recadoDoErro(erros) {
  const texto = erros.map(function (e) { return (e && e.message) || ''; }).join(' | ');

  if (/unauthenticated|unauthorized|token/i.test(texto)) {
    return 'O token da Autentique foi recusado. Avise o escritório.';
  }
  if (/signature_not_found/i.test(texto)) {
    return 'A conta da Autentique não está entre os signatários do documento.';
  }
  if (/limit|quota|plan|excedid/i.test(texto)) {
    return 'A conta da Autentique atingiu o limite do plano. Avise o escritório.';
  }
  return 'A assinatura digital recusou: ' + texto.slice(0, 160);
}


/* ------------------------------------------------------------
   Banco
   ------------------------------------------------------------ */

/* Lido com o token do usuário: o RLS devolve a linha só para
   quem pode ver aquele trabalho. A chave secreta entra apenas
   como apikey, que o PostgREST exige, sem virar a autorização. */
async function buscarComoUsuario(url, secreta, sessao, id) {
  const r = await fetch(url + '/rest/v1/formularios'
    /* 'tipo' é o que escolhe o plano de assinatura. Faltava
       aqui, então ficha.tipo chegava vazio e TODA vistoria caía
       no caminho da medição, pedindo um parecer final que ela
       não tem. */
    + '?select=id,tipo,cliente,contrato,loja,status,dados,autentique_id'
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

/* Gravado TAMBÉM com o token do usuário, e não com a chave
   secreta. É de propósito: assim a função no banco cobra a
   permissão de quem está pedindo, em vez de confiar que este
   arquivo já cobrou. Uma regra, um lugar. */
async function registrarNoBanco(url, secreta, sessao, id, docId, canal) {
  const r = await fetch(url + '/rest/v1/rpc/registrar_pedido_assinatura', {
    method: 'POST',
    headers: {
      apikey: secreta,
      authorization: 'Bearer ' + sessao,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ alvo: id, doc_id: docId, canal: canal })
  });

  if (r.ok) return;

  const texto = await r.text();

  if (/já foi enviado/i.test(texto)) {
    throw falha('Este formulário já foi enviado para assinatura.', 409);
  }
  if (/não tem acesso/i.test(texto)) {
    throw falha('Você não tem acesso a este formulário.', 403);
  }
  throw falha('Criei o documento mas não consegui registrar aqui. Avise o escritório.', 502);
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

/* ------------------------------------------------------------
   Cancelar um pedido ainda não assinado
   ------------------------------------------------------------
   ⚠️ A ORDEM: joga fora na Autentique PRIMEIRO, limpa o banco
   depois. Ao contrário, um erro no meio deixaria o cliente com
   um link vivo para assinar uma versão abandonada — e um
   documento assinado de algo que ninguém mais considera válido
   é pior que documento nenhum.
   ------------------------------------------------------------ */
async function cancelar(url, secreta, sessao, token, ficha) {
  if (ficha.status === 'assinado') {
    throw falha('Esta ficha já foi assinada. Para uma nova rodada, use reabrir.', 409);
  }
  if (!ficha.autentique_id) {
    throw falha('Esta ficha não tem pedido de assinatura em aberto.', 409);
  }

  await descartar(token, ficha.autentique_id);

  const r = await fetch(url + '/rest/v1/rpc/cancelar_pedido_assinatura', {
    method: 'POST',
    headers: {
      apikey: secreta,
      authorization: 'Bearer ' + sessao,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ alvo: ficha.id, doc_id: ficha.autentique_id })
  });

  if (!r.ok) {
    const texto = await r.text();
    if (/não tem acesso/i.test(texto)) {
      throw falha('Você não tem acesso a este formulário.', 403);
    }
    /* O documento já foi para a lixeira; é o banco que ficou
       para trás. Tentar de novo resolve, e dizer isso evita que
       alguém conclua que o cancelamento não aconteceu. */
    throw falha('Joguei o documento fora na Autentique, mas não consegui '
              + 'registrar aqui. Tente cancelar de novo.', 502);
  }

  return responder({ ok: true, cancelado: ficha.autentique_id });
}


function falha(publico, status, extra) {
  const e = new Error(publico);
  if (extra) e.extra = extra;
  e.publico = publico;
  e.status = status || 500;
  return e;
}

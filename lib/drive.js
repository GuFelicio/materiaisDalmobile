/* ============================================================
   O DRIVE DA DALMÓBILE — Dalmóbile · roda no Cloudflare
   ------------------------------------------------------------
   Guarda cada documento assinado numa pasta do Drive da
   Dalmóbile, organizada por contrato.

   POR QUE O DRIVE E NÃO UM BUCKET NOSSO
   A conta da Dalmóbile tem 5 TB já pagos; o plano grátis do
   Supabase tem 1 GB e, acima dele, não cobra centavos — restringe
   o projeto. A 500 KB por documento, um enche e o outro não.
   A conta é de aritmética, não de preferência.

   ⚠️ ESTE ARQUIVO NÃO GUARDA SEGREDO NENHUM, e não pode passar a
   guardar. Ele vive fora de functions/, então o Cloudflare o
   publica como arquivo estático. As três credenciais entram por
   argumento, em tempo de execução.

   VARIÁVEIS (as três como Secret, no painel do Cloudflare)
       GOOGLE_CLIENT_ID
       GOOGLE_CLIENT_SECRET
       GOOGLE_REFRESH_TOKEN
       GOOGLE_PASTA_RAIZ    opcional. O id de uma pasta que já
                            exista, para o app guardar dentro
                            dela em vez de criar a raiz dele.

   SEM AS TRÊS, TUDO AQUI DEVOLVE null E O SISTEMA SEGUE IGUAL.
   É assim que este arquivo pode subir antes de o cadastro no
   Google existir.

   O ESCOPO É 'drive.file', E ISSO É DUAS COISAS AO MESMO TEMPO:
   o app só alcança o que ele mesmo criou — nunca enxerga o resto
   do Drive da Dalmóbile — e é o escopo que o Google classifica
   como não sensível, o único que dispensa verificação. A pasta
   raiz é criada por aqui justamente por isso: pasta criada pelo
   app é pasta que o app alcança.
   ============================================================ */

/* A chave de um nome mora num arquivo só, porque a tela precisa
   da MESMA regra para montar a lista de clientes conhecidos. Duas
   cópias envelheceriam em direções diferentes: a lista mostraria
   um cliente e o Drive criaria outra pasta. Ver lib/chave.js. */
import { chaveDe } from './chave.js';

const TOKEN   = 'https://oauth2.googleapis.com/token';
const ARQUIVOS = 'https://www.googleapis.com/drive/v3/files';
const SUBIR    = 'https://www.googleapis.com/upload/drive/v3/files';

const PASTA = 'application/vnd.google-apps.folder';

const NOME_DA_RAIZ = 'Documentos assinados — Central de Peças';

/* A segunda árvore, separada da primeira de propósito: documento
   assinado é prova, apresentação é trabalho em andamento. Quem
   precisa achar um contrato assinado não quer tropeçar em 400
   fotos de cozinha, e quem compartilha a pasta de apresentações
   com um arquiteto não quer compartilhar os termos assinados. */
const NOME_DA_RAIZ_APRES = 'APRESENTAÇÕES - MATERIAIS';


/* ------------------------------------------------------------
   Está configurado?
   ------------------------------------------------------------ */
export function temDrive(env) {
  return !!(String(env.GOOGLE_CLIENT_ID || '').trim()
         && String(env.GOOGLE_CLIENT_SECRET || '').trim()
         && String(env.GOOGLE_REFRESH_TOKEN || '').trim());
}


/* ------------------------------------------------------------
   1. O token de acesso
   ------------------------------------------------------------
   O refresh token é de longa duração; o de acesso vale uma hora.
   Trocar a cada invocação é o certo aqui: Function do Cloudflare
   não tem memória entre chamadas, e guardar o de acesso em algum
   lugar seria inventar um cache para economizar 200ms numa rota
   que roda uma vez por assinatura.

   ⚠️ SE O REFRESH TOKEN FOR RECUSADO, o recado tem de dizer o que
   fazer. 'invalid_grant' quer dizer uma de três: o consentimento
   foi revogado, a senha da conta mudou, ou — a mais provável — a
   tela de consentimento ficou em "Testing" e o Google expirou o
   token em 7 dias. Sem esta explicação no log, esse erro vira
   meia hora de procura.
   ------------------------------------------------------------ */
export async function tokenDeAcesso(env) {
  const r = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     String(env.GOOGLE_CLIENT_ID).trim(),
      client_secret: String(env.GOOGLE_CLIENT_SECRET).trim(),
      refresh_token: String(env.GOOGLE_REFRESH_TOKEN).trim(),
      grant_type:    'refresh_token'
    })
  });

  const dados = await r.json().catch(function () { return null; });

  if (!r.ok || !dados || !dados.access_token) {
    const qual = (dados && dados.error) || ('http ' + r.status);

    if (qual === 'invalid_grant') {
      throw new Error('[drive] o Google recusou o refresh token (invalid_grant). '
        + 'Três causas, em ordem de probabilidade: a tela de consentimento está '
        + 'em "Testing" e o Google expira o token em 7 dias — publique-a; o acesso '
        + 'foi revogado; a senha da conta mudou. Em todos os casos, rode o '
        + 'pegar-token-drive.mjs de novo e troque GOOGLE_REFRESH_TOKEN.');
    }

    throw new Error('[drive] não consegui o token de acesso: ' + qual);
  }

  return dados.access_token;
}


/* ------------------------------------------------------------
   2. A pasta do contrato
   ------------------------------------------------------------
   Acha-ou-cria, e a busca vem antes de propósito: a Autentique
   repete o aviso, e duas criações seguidas fariam duas pastas
   com o mesmo nome — o Drive permite, ele identifica por id.

   A reserva no banco já evita a repetição no caminho normal.
   Esta busca é a segunda cerca, para o caso de duas assinaturas
   de contratos iguais caírem ao mesmo tempo.

   ⚠️ 'trashed = false' NÃO É DETALHE. Sem ele, uma pasta que
   alguém mandou para a lixeira continua sendo encontrada, e os
   documentos novos iriam para dentro dela — na lixeira, contando
   os 30 dias para o Drive apagar tudo. Em silêncio.
   ------------------------------------------------------------ */
async function acharPasta(acesso, nome, dentroDe) {
  const condicoes = [
    "mimeType = '" + PASTA + "'",
    "name = '" + String(nome).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'",
    'trashed = false'
  ];
  if (dentroDe) condicoes.push("'" + dentroDe + "' in parents");

  const url = ARQUIVOS + '?q=' + encodeURIComponent(condicoes.join(' and '))
            + '&fields=files(id,name)&pageSize=2';

  const r = await fetch(url, { headers: { authorization: 'Bearer ' + acesso } });
  if (!r.ok) throw new Error('[drive] busca de pasta devolveu ' + r.status);

  const dados = await r.json();
  const achadas = (dados && dados.files) || [];
  return achadas.length ? achadas[0].id : null;
}

async function criarPasta(acesso, nome, dentroDe) {
  const corpo = { name: nome, mimeType: PASTA };
  if (dentroDe) corpo.parents = [dentroDe];

  const r = await fetch(ARQUIVOS + '?fields=id', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + acesso,
      'content-type': 'application/json'
    },
    body: JSON.stringify(corpo)
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error('[drive] não criei a pasta "' + nome + '": '
      + r.status + ' ' + t.slice(0, 160));
  }

  return (await r.json()).id;
}

/* O nome da gaveta de uma ficha. O tipo e quando ela nasceu —
   sem isso a pasta do contrato fica com três gavetas que ninguém
   sabe distinguir ao abrir o Drive. */
const ROTULOS = {
  medicao:  'Medição',
  montagem: 'Montagem',
  vistoria: 'Vistoria'
};

function nomeDaGaveta(ficha) {
  const rotulo = ROTULOS[String((ficha && ficha.tipo) || '').toLowerCase()]
              || 'Documento';

  const q = new Date((ficha && ficha.criado_em) || Date.now());
  const dia = isNaN(q.getTime())
    ? 'sem data'
    : q.getUTCFullYear()
      + '-' + String(q.getUTCMonth() + 1).padStart(2, '0')
      + '-' + String(q.getUTCDate()).padStart(2, '0');

  return rotulo + ' ' + dia;
}


export async function pastaDoDocumento(acesso, env, reservar, ficha) {
  /* A raiz: ou uma que você indicou na variável, ou uma que o app
     cria — e RESERVADA, não procurada pelo nome.

     ⚠️ O guia prometia que você podia renomear esta pasta à
     vontade "porque o sistema guarda o id". Era falso: sem a
     reserva ela era reencontrada pelo NOME a cada assinatura, e
     renomeá-la fazia o app criar uma segunda raiz ao lado, com
     metade dos contratos em cada. Agora a promessa é verdade. */
  let raiz = String(env.GOOGLE_PASTA_RAIZ || '').trim();

  if (!raiz) {
    raiz = await pastaFirmada(
      acesso, reservar, 'raiz', 'assinados', NOME_DA_RAIZ, null);
  }

  /* Ficha sem contrato existe, e mandar para a raiz misturaria
     com as pastas. Uma pasta nomeada é mais honesta que um
     arquivo solto. */
  const nome = String((ficha && ficha.contrato) || '').trim() || 'Sem contrato';

  /* O nome é como foi digitado; a chave ignora caixa, acento e
     pontuação. Ver `chaveDe`. */
  const doContrato = await pastaFirmada(acesso, reservar,
    'contrato', chaveDe(nome), nome, raiz);

  /* ⚠️ A GAVETA DA FICHA, e ela existe por uma falha que trocava
     documento assinado por documento assinado.

     O nome do arquivo é termo-assinado-<cliente>-<contrato>.pdf —
     nada ali diz de QUAL FICHA ele é. Duas medições do mesmo
     contrato geravam nome idêntico, na mesma pasta, e o "procurar
     antes de subir" encontrava o documento da primeira. A segunda
     assinatura passava a apontar para o documento da outra: um
     documento com validade jurídica substituído por outro, sem
     erro em lugar nenhum.

     O nome do arquivo fica como está de propósito — ele vai no
     anexo do e-mail, e é por ele que a pessoa procura seis meses
     depois. Quem separa é a pasta, não o nome. */
  if (!ficha || !ficha.id) return doContrato;

  return await pastaFirmada(acesso, reservar,
    'ficha', String(ficha.id),
    nomeDaGaveta(ficha), doContrato,
    false);                 /* nunca adotar pelo nome */
}


/* ------------------------------------------------------------
   2b. A pasta da apresentação — três níveis
   ------------------------------------------------------------
       APRESENTAÇÕES - MATERIAIS
       └── Patricia                 ← o login do app
           └── Carlos e Bia         ← o cliente

   ⚠️ A PASTA É AMARRADA PELO ID, NUNCA PELO NOME. É o que faz
   você poder corrigir "Patricia" para "Patrícia" no painel, ou
   renomear a pasta dentro do próprio Drive, sem o sistema deixar
   de achá-la e criar uma segunda — rachando os projetos dela em
   duas pastas, sem erro nenhum, e você só descobrindo quando for
   procurar um projeto antigo. Por isso o `reservar`.

   `reservar(escopo, chave, pasta, nome)` é de quem chama: este
   arquivo não sabe o que é Supabase e não vai aprender. Devolve o
   id que vale — o meu, se cheguei primeiro, ou o de quem chegou
   antes.

   ⚠️ A PASTA É ORGANIZAÇÃO, NÃO CERCA. Todos estes arquivos são
   de uma conta Google só, a da Dalmóbile. Quem abrir aquele Drive
   vê a pasta de todo mundo. Quem cerca é a RLS de `trabalhos`, no
   endpoint, com o token da própria pessoa.
   ------------------------------------------------------------ */
async function pastaFirmada(acesso, reservar, escopo, chave, nome, dentroDe,
                            adotarPorNome) {
  /* 1. Já reservada? Então é ela, qualquer que seja o nome que
        ela tenha hoje no Drive. */
  const reservada = await reservar(escopo, chave, null, null);
  if (reservada) return reservada;

  /* 2. Existe no Drive com esse nome? Adota — é o caso de quem
        já tinha a pasta antes desta reserva existir.

     ⚠️ MENOS PARA A PASTA DO PROJETO, e a diferença é toda. A
     raiz, a pessoa e o cliente SÃO o nome deles: achar "Carlos e
     Bia" e adotar é o certo. Um projeto não — dois projetos do
     mesmo cliente criados no mesmo dia teriam o mesmo nome, e
     adotar pelo nome faria o segundo entrar na pasta do
     primeiro. A identidade de um projeto é o id dele, e só. */
  if (adotarPorNome !== false) {
    const achada = await acharPasta(acesso, nome, dentroDe);
    if (achada) return await reservar(escopo, chave, achada, nome) || achada;
  }

  /* 3. Cria e reserva. Se eu perdi a corrida para outra aba, a
        reserva devolve a pasta da outra e a minha fica sobrando
        vazia — então eu a descarto, senão apareceriam duas
        "Patricia" lado a lado, que é exatamente a confusão que
        esta função existe para evitar. */
  const minha  = await criarPasta(acesso, nome, dentroDe);
  const quevem = await reservar(escopo, chave, minha, nome);

  if (quevem && quevem !== minha) {
    await descartarPasta(acesso, minha);
    return quevem;
  }

  return minha;
}

/* O nome da pasta do projeto. A apresentação não tem campo de
   nome — só cliente e arquiteto —, então o que resta para
   distinguir dois projetos do mesmo cliente é quando cada um
   nasceu. Com data e hora, dois criados no mesmo dia não ficam
   com nome idêntico lado a lado. */
function nomeDoProjeto(projeto) {
  const q = new Date((projeto && projeto.criado_em) || Date.now());

  if (isNaN(q.getTime())) return 'Projeto';

  const dd = String(q.getUTCDate()).padStart(2, '0');
  const mm = String(q.getUTCMonth() + 1).padStart(2, '0');
  const aa = q.getUTCFullYear();
  const hh = String(q.getUTCHours()).padStart(2, '0');
  const mi = String(q.getUTCMinutes()).padStart(2, '0');

  return 'Projeto ' + aa + '-' + mm + '-' + dd + ' ' + hh + 'h' + mi;
}

export async function pastaDaApresentacao(acesso, env, reservar, pessoa, cliente,
                                          projeto) {
  let raiz = String(env.GOOGLE_PASTA_APRESENTACOES || '').trim();

  /* ⚠️ A RAIZ TAMBÉM É RESERVADA, pelos dois motivos de sempre.

     Correção: sem reserva, a raiz é reencontrada pelo NOME a cada
     foto — e o dia em que alguém renomear "APRESENTAÇÕES -
     MATERIAIS" para algo mais bonito dentro do próprio Drive, o
     app não a acha e cria uma segunda, ao lado. Metade das
     apresentações em cada.

     Custo: sem reserva são duas buscas no Google por foto. Numa
     apresentação de 20 fotos, 40 chamadas por salvamento. */
  if (!raiz) {
    raiz = await pastaFirmada(
      acesso, reservar, 'raiz', 'apresentacoes', NOME_DA_RAIZ_APRES, null);
  }

  /* `perfis.nome` aceita nulo, e o app já cai para o e-mail em
     todo lugar. Sem esta queda, todo mundo sem nome preenchido
     cairia numa pasta "sem nome" comum — os projetos de três
     pessoas misturados numa gaveta. */
  const nomeDaPessoa = String((pessoa && pessoa.nome) || '').trim()
                    || String((pessoa && pessoa.email) || '').trim()
                    || 'sem nome';

  const daPessoa = await pastaFirmada(
    acesso, reservar, 'usuario', String(pessoa.id), nomeDaPessoa, raiz);

  const nomeDoCliente = String(cliente || '').trim() || 'Sem cliente';

  /* A chave normalizada aqui também: "Carlos e Bia" e "carlos e
     bia" são o mesmo cliente, e duas pastas dele seria o mesmo
     defeito do contrato. Ver `chaveDe`. */
  const doCliente = await pastaFirmada(
    acesso, reservar, 'cliente',
    String(pessoa.id) + '|' + chaveDe(nomeDoCliente),
    nomeDoCliente, daPessoa);

  /* ⚠️ A PASTA DO PROJETO, e ela existe por um defeito real que
     só apareceu quando o Gu perguntou se dois projetos do mesmo
     cliente dividiriam a pasta.

     Dividiam — era o pedido —, e aí: as duas apresentações têm
     uma cozinha, as duas fotos se chamam "cozinha.jpg", e o
     "procurar antes de subir" encontrava a foto da PRIMEIRA. A
     reforma de um ano depois abriria com as fotos do projeto
     antigo. Sem erro nenhum, e descoberto na frente do cliente.

     Todos os projetos do cliente continuam sob uma pasta só dele
     — é o que foi pedido. O que cada um tem é a sua gaveta. */
  if (!projeto || !projeto.id) return doCliente;

  return await pastaFirmada(
    acesso, reservar, 'projeto', String(projeto.id),
    nomeDoProjeto(projeto), doCliente,
    false);                 /* nunca adotar pelo nome: ver acima */
}


/* Descartar é mandar para a lixeira, não apagar: o Drive guarda
   30 dias, então um engano aqui é reversível pela mão de quem
   quiser. E nunca estoura — sobrar uma pasta vazia é feio, mas
   derrubar o salvamento da apresentação por causa dela seria
   trocar o feio pelo grave. */
async function descartarPasta(acesso, id) {
  try {
    await fetch(ARQUIVOS + '/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer ' + acesso,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ trashed: true })
    });
  } catch (e) {
    console.warn('[drive] sobrou uma pasta vazia (' + id + '): '
      + (e && e.message));
  }
}


/* ------------------------------------------------------------
   3. Subir o arquivo
   ------------------------------------------------------------
   Multipart, e não base64 em JSON: os bytes vão crus, sem inflar
   um terço e sem a passada de CPU da conversão — que no
   Cloudflare é contada por invocação.

   OS METADADOS VÃO JUNTO, e eles são o que faz este arquivo
   servir a outro sistema depois. 'description' é o que a equipe
   lê na tela do Drive; 'properties' é chave-valor que qualquer
   um com acesso ao arquivo consegue ler por API.

   ⚠️ O ESTADO VAI COMO ELE É, com o nosso vocabulário, e NUNCA
   colapsado em aprovado/reprovado. O parecer tem três desfechos
   que chegam a assinatura, e o do meio — aprovada COM
   ASSISTÊNCIA — é aprovação sem obra liberada. Virar "Aprovado"
   faria o outro lado acreditar que a obra acabou com pendência
   aberta, que é a contradição que o parecer existe para impedir.
   Por isso vão os dois: o estado e o booleano que não dá para
   interpretar errado.
   ------------------------------------------------------------ */
/* ------------------------------------------------------------
   O arquivo já está lá?
   ------------------------------------------------------------
   Fecha uma janela real: o envio dá certo e o registro do id
   falha logo depois. O arquivo está no Drive, o banco não sabe, e
   uma segunda tentativa subiria o MESMO arquivo outra vez — o
   Drive aceita nome repetido sem reclamar.

   Procurando antes, tentar de novo é seguro: acha o que subiu,
   devolve o id, e o registro acontece. Vale a chamada extra.
   ------------------------------------------------------------ */
export async function acharArquivo(acesso, pasta, nome) {
  const q = [
    "name = '" + String(nome).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'",
    "'" + pasta + "' in parents",
    'trashed = false'
  ].join(' and ');

  const r = await fetch(ARQUIVOS + '?q=' + encodeURIComponent(q)
                        + '&fields=files(id,name)&pageSize=2',
    { headers: { authorization: 'Bearer ' + acesso } });

  if (!r.ok) throw new Error('[drive] busca de arquivo devolveu ' + r.status);

  const achados = ((await r.json()) || {}).files || [];
  return achados.length ? achados[0].id : null;
}


export async function subirPdf(acesso, pasta, anexo, marcas) {
  return await subirArquivo(acesso, pasta, anexo, 'application/pdf', marcas);
}

export async function subirArquivo(acesso, pasta, anexo, mime, marcas) {
  const meta = {
    name: anexo.nome,
    parents: [pasta],
    description: (marcas && marcas.descricao) || '',
    properties: (marcas && marcas.propriedades) || {}
  };

  const forma = new FormData();
  forma.append('metadata',
    new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  forma.append('file',
    new Blob([anexo.bytes], { type: mime || 'application/octet-stream' }),
    anexo.nome);

  const r = await fetch(SUBIR + '?uploadType=multipart&fields=id,name', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + acesso },
    body: forma
  });

  if (!r.ok) {
    const t = await r.text();

    /* Cota é o erro que mais confunde, porque o dono do arquivo é
       quem autorizou — não quem rodou o código. */
    if (/storageQuotaExceeded/i.test(t)) {
      throw new Error('[drive] a conta que autorizou está sem espaço. '
        + 'Confira a cota do Google One da conta usada no consentimento.');
    }

    throw new Error('[drive] o envio devolveu ' + r.status + ': ' + t.slice(0, 200));
  }

  return (await r.json()).id;
}


/* ------------------------------------------------------------
   4. O caminho inteiro
   ------------------------------------------------------------
   NUNCA ESTOURA: devolve null quando não dá, igual ao
   anexoAssinado. E aqui a decisão é a mesma, pelo mesmo motivo:
   quem chama isto está no meio de processar uma assinatura. A
   assinatura já foi registrada e o prazo contratual já começou.
   Derrubar o webhook por causa do arquivamento trocaria "o
   documento não foi para o Drive" por "a assinatura não foi
   processada" — e a segunda é incomparavelmente pior.

   Quem chamou decide o que fazer com o null. No webhook, é
   devolver a reserva para a repetição da Autentique tentar de
   novo, e deixar o botão de reenvio para quando ela desistir.
   ------------------------------------------------------------ */
export async function arquivarNoDrive(env, anexo, ficha, marcas, reservar) {
  if (!temDrive(env)) return null;
  if (!anexo || !anexo.bytes) return null;

  try {
    /* Sem o `reservar` as pastas não têm identidade, e esta
       função engole toda exceção — então a falta dele arquivaria
       nada, calado, para sempre. Melhor estourar aqui e aparecer
       no log com o nome do problema. */
    if (typeof reservar !== 'function') {
      throw new Error('[drive] arquivarNoDrive foi chamada sem o `reservar`. '
        + 'Quem chama tem de passar a função que fala com o '
        + 'reservar_pasta_drive — ver functions/api/autentique.js.');
    }

    const acesso = await tokenDeAcesso(env);
    const pasta  = await pastaDoDocumento(acesso, env, reservar, ficha);

    /* Já subiu numa tentativa anterior que morreu antes de
       registrar? Então o trabalho está feito: devolve o id e
       deixa quem chamou gravar. */
    const anterior = await acharArquivo(acesso, pasta, anexo.nome);
    if (anterior) {
      console.log('[drive] já estava lá: ' + anexo.nome + ' (' + anterior + ')');
      return { id: anterior, pasta: pasta, nome: anexo.nome, jaEstava: true };
    }

    const id = await subirPdf(acesso, pasta, anexo, marcas);

    console.log('[drive] guardado: ' + anexo.nome + ' (' + id + ')');
    return { id: id, pasta: pasta, nome: anexo.nome };

  } catch (e) {
    console.error((e && e.message) || '[drive] falhou sem mensagem');
    return null;
  }
}


/* ------------------------------------------------------------
   5. Buscar de volta
   ------------------------------------------------------------
   A rede de segurança: se a Autentique não tiver mais o
   documento, a Central busca no Drive pelo id guardado. Com
   'drive.file' isto funciona porque o arquivo foi criado por
   este app.

   Devolve os BYTES para quem chamou conferir o hash. Conferir
   aqui dentro seria tentador e errado: o módulo não sabe qual
   hash era o esperado, e quem sabe é o banco.
   ------------------------------------------------------------ */
export async function baixarDoDrive(env, fileId) {
  const r = await baixarComTipo(env, fileId);
  return r ? r.bytes : null;
}

/* A foto precisa do content-type para o navegador exibir, e o
   Drive já o devolve. Deduzir da extensão seria uma segunda
   fonte de verdade para a mesma coisa. */
export async function baixarComTipo(env, fileId) {
  if (!temDrive(env) || !fileId) return null;

  try {
    const acesso = await tokenDeAcesso(env);

    const r = await fetch(ARQUIVOS + '/' + encodeURIComponent(fileId) + '?alt=media',
      { headers: { authorization: 'Bearer ' + acesso } });

    if (!r.ok) {
      /* 404 aqui quer dizer que alguém apagou o arquivo no Drive.
         Não é erro de código, e vale aparecer como tal no log —
         é a única pista de que a cópia foi perdida. */
      console.warn('[drive] o arquivo ' + fileId + ' devolveu ' + r.status
        + (r.status === 404 ? ' — alguém apagou do Drive?' : ''));
      return null;
    }

    return {
      bytes: new Uint8Array(await r.arrayBuffer()),
      tipo:  r.headers.get('content-type') || 'application/octet-stream'
    };

  } catch (e) {
    console.warn('[drive] não consegui baixar: ' + (e && e.message));
    return null;
  }
}

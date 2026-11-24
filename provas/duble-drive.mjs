/* ============================================================
   O DUBLÊ DO DRIVE — usado por TODAS as suítes
   ------------------------------------------------------------
   Um só, de propósito. Dois dublês do mesmo serviço envelhecem em
   direções diferentes, e o que sobra é uma suíte que concorda com
   código errado — foi assim que 102 provas deste projeto passaram
   com o anexo sempre nulo, porque o dublê não conhecia o
   download.

   ------------------------------------------------------------
   ELE É DE PROPÓSITO MESQUINHO

   Dublê mais generoso que o serviço real é pior que dublê
   nenhum: ele dá verde para o que o Google recusaria. Então:

     · a busca só filtra lixeira se a consulta pedir
       `trashed = false`. Sem isso devolve o que está na lixeira,
       exatamente como o Drive — e é o que faz uma prova pegar a
       falta desse filtro;
     · nome repetido na mesma pasta é ACEITO, porque o Drive
       aceita: ele identifica por id. É daí que vem a colisão
       entre dois projetos do mesmo cliente;
     · a cota estourada volta com o corpo de erro real, para o
       código ter de reconhecer `storageQuotaExceeded`.
   ============================================================ */

const PASTA = 'application/vnd.google-apps.folder';


export function criarDrive() {
  const d = {
    arquivos: new Map(),   /* id -> {id,name,parents,mime,trashed,bytes,meta} */
    chamadas: [],
    proximo: 1,

    /* Ganchos para a prova armar situações que acontecem de
       verdade e são difíceis de reproduzir à mão. */
    aoCriarPasta: null,    /* a corrida entre duas abas          */
    falharUpload: null     /* o corpo de erro que o Google daria  */
  };

  d.novoId = (p) => p + '-' + (d.proximo++);

  d.criar = function (nome, dentroDe, mime) {
    const id = d.novoId(mime === PASTA ? 'pasta' : 'arq');
    d.arquivos.set(id, {
      id: id, name: nome, parents: dentroDe ? [dentroDe] : [],
      mime: mime, trashed: false, bytes: new Uint8Array(0), meta: {}
    });
    return id;
  };

  d.pastas = function () {
    return Array.from(d.arquivos.values())
      .filter((a) => a.mime === PASTA && !a.trashed);
  };

  d.pastaPorNome = function (nome) {
    return d.pastas().filter((a) => a.name === nome);
  };

  d.filhasDe = function (paiId) {
    return d.pastas().filter((a) => (a.parents || []).includes(paiId));
  };

  /* A única filha. Erra alto quando não é uma: "achei 2" diz o
     que está errado; `[0]` em cima de uma lista vazia diria
     "undefined" três linhas depois, longe da causa. */
  d.filhaUnica = function (paiId, oque) {
    const f = d.filhasDe(paiId);
    if (f.length !== 1) {
      throw new Error('esperava UMA pasta dentro de ' + (oque || paiId)
        + ', achei ' + f.length
        + (f.length ? ' (' + f.map((x) => x.name).join(', ') + ')' : ''));
    }
    return f[0];
  };

  d.arquivosDe = function (pastaId) {
    return Array.from(d.arquivos.values())
      .filter((a) => !a.trashed && a.mime !== PASTA
                  && (a.parents || []).includes(pastaId));
  };

  /* Quantas pastas foram CRIADAS, e quantas buscas de pasta
     foram feitas. As duas contas existem porque a reserva no
     banco se paga nelas: sem ela o resultado continua certo e o
     custo explode. */
  d.pastasCriadas = function () {
    return d.chamadas.filter((c) => c.metodo === 'POST'
      && c.caminho === '/drive/v3/files').length;
  };

  d.buscasDePasta = function () {
    return d.chamadas.filter((c) => c.metodo === 'GET'
      && c.caminho === '/drive/v3/files'
      && /google-apps\.folder/.test(c.q || '')).length;
  };

  d.descartes = function () {
    return d.chamadas.filter((c) => c.metodo === 'PATCH'
      && c.caminho.startsWith('/drive/v3/files/')).length;
  };

  d.esquecer = function () { d.chamadas.length = 0; };

  d.atender = atender.bind(null, d);
  return d;
}


/* ------------------------------------------------------------
   A busca, com a mesquinhez que importa
   ------------------------------------------------------------ */
function buscar(d, q) {
  const pedeNaoLixeira = /trashed\s*=\s*false/.test(q);
  const nome = (/name\s*=\s*'((?:\\.|[^'])*)'/.exec(q) || [])[1];
  const pai  = (/'([^']+)'\s+in\s+parents/.exec(q) || [])[1];
  const soPasta = new RegExp("mimeType\\s*=\\s*'" + PASTA.replace(/[/.]/g, '\\$&') + "'").test(q);

  const limpo = (s) => String(s || '').replace(/\\'/g, "'").replace(/\\\\/g, '\\');

  return Array.from(d.arquivos.values()).filter(function (a) {
    /* ⚠️ Sem `trashed = false` na consulta, a pasta na lixeira
       VOLTA — e os arquivos novos entrariam nela, contando os 30
       dias para o Drive apagar tudo. Em silêncio. */
    if (pedeNaoLixeira && a.trashed) return false;
    if (nome !== undefined && a.name !== limpo(nome)) return false;
    if (pai && !(a.parents || []).includes(pai)) return false;
    if (soPasta && a.mime !== PASTA) return false;
    return true;
  });
}

function json(corpo, status) {
  return new Response(JSON.stringify(corpo), {
    status: status || 200,
    headers: { 'content-type': 'application/json' }
  });
}


/* ------------------------------------------------------------
   Devolve uma Response, ou null quando o endereço não é do
   Google — aí quem chamou segue para o próprio dublê.
   ------------------------------------------------------------ */
async function atender(d, endereco, opcoes) {
  const o = opcoes || {};
  const metodo = (o.method || 'GET').toUpperCase();
  const u = new URL(String(endereco));

  const doGoogle = u.host === 'oauth2.googleapis.com'
                || u.host === 'www.googleapis.com';
  if (!doGoogle) return null;

  d.chamadas.push({
    metodo: metodo, caminho: u.pathname, url: String(endereco),
    q: u.searchParams.get('q'), headers: o.headers || {}
  });

  if (u.host === 'oauth2.googleapis.com') {
    return json({ access_token: 'acesso-ok', expires_in: 3600 });
  }

  /* baixar */
  if (u.pathname.startsWith('/drive/v3/files/') && u.searchParams.get('alt') === 'media') {
    const id = decodeURIComponent(u.pathname.split('/').pop());
    const a = d.arquivos.get(id);
    if (!a || a.trashed) return new Response('não achei', { status: 404 });
    return new Response(a.bytes, { status: 200, headers: { 'content-type': a.mime } });
  }

  /* lixeira */
  if (metodo === 'PATCH' && u.pathname.startsWith('/drive/v3/files/')) {
    const id = decodeURIComponent(u.pathname.split('/').pop());
    const corpo = JSON.parse(o.body || '{}');
    const a = d.arquivos.get(id);
    if (a && corpo.trashed === true) a.trashed = true;
    return json({ id: id });
  }

  /* buscar */
  if (metodo === 'GET' && u.pathname === '/drive/v3/files') {
    const achados = buscar(d, u.searchParams.get('q') || '');
    return json({ files: achados.map((a) => ({ id: a.id, name: a.name })) });
  }

  /* criar pasta */
  if (metodo === 'POST' && u.pathname === '/drive/v3/files') {
    const corpo = JSON.parse(o.body || '{}');
    const id = d.criar(corpo.name, (corpo.parents || [])[0], corpo.mimeType);
    if (d.aoCriarPasta) await d.aoCriarPasta(corpo, id);
    return json({ id: id });
  }

  /* subir arquivo */
  if (metodo === 'POST' && u.pathname === '/upload/drive/v3/files') {
    const forma = o.body;
    const meta = JSON.parse(await forma.get('metadata').text());
    const arq = forma.get('file');
    const bytes = new Uint8Array(await arq.arrayBuffer());

    if (d.falharUpload) return new Response(d.falharUpload, { status: 403 });

    /* Nome repetido é ACEITO. O Drive aceita. */
    const id = d.criar(meta.name, (meta.parents || [])[0], arq.type);
    const a = d.arquivos.get(id);
    a.bytes = bytes;
    a.meta = { description: meta.description, properties: meta.properties };

    return json({ id: id, name: meta.name });
  }

  throw new Error('o dublê do Drive não conhece: ' + metodo + ' ' + u.pathname);
}

export const COTA_ESTOURADA =
  '{"error":{"errors":[{"reason":"storageQuotaExceeded"}],"code":403}}';

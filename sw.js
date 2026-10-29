/* ============================================================
   SERVICE WORKER — Central de Peças · Dalmóbile
   ------------------------------------------------------------
   Existe por um motivo só: o medidor precisa abrir a tela do
   Documento 101 dentro de um apartamento em obra, sem sinal.

   Sem isto, o rascunho salvo no aparelho não adianta nada —
   a página nem carrega para mostrá-lo.

   DUAS REGRAS QUE NÃO SE DOBRAM

   1. Este arquivo só responde pelo que está na lista abaixo.
      Ele fica na raiz, então o navegador o coloca no caminho de
      TODAS as páginas do site. Qualquer pedido fora da lista
      passa direto, sem ele encostar. É o que garante que um
      erro aqui não derrube a Central inteira.

   2. Dado do Supabase nunca é guardado.
      Resposta de API e de login envelhece e, pior, pertence a
      uma pessoa. Guardar isso no cache do aparelho é vazamento
      esperando para acontecer. Só entra aqui arquivo estático,
      igual para todo mundo.

   PARA ATUALIZAR
   Mexeu em medicao.html, pdf-101.js ou auth.js? Mude a VERSÃO
   abaixo. É isso que faz o celular do medidor largar a cópia
   velha. Sem trocar a versão, ele continua abrindo o que
   baixou da primeira vez.
   ============================================================ */

const VERSAO = 'dalmobile-campo-v13';

/* O que precisa existir no aparelho para a tela funcionar
   sozinha. Se algum destes faltar, falta função: sem as fontes
   o PDF sai em Helvetica, sem as logos sai sem marca — mas sem
   pdf-lib não sai PDF nenhum. */
/* O Cloudflare Pages serve a página sem a extensão: um pedido a
   /medicao.html volta 308 para /medicao. Isso tem duas
   consequências que já custaram um bug aqui:

     1. cache.add() REJEITA resposta redirecionada. Guardar
        'medicao.html' contra o Cloudflare falha calado.
     2. A navegação real acontece em /medicao, sem .html, então
        procurar por "medicao.html" no endereço não acha nada.

   Por isso os dois endereços entram na lista e os dois são
   reconhecidos na hora de servir. Em servidor local vale o
   com .html; no Cloudflare, o sem. Um dos dois sempre pega, e
   a falha do outro é esperada. */
const PAGINAS = {
  medicao:  ['medicao', 'medicao.html'],
  montagem: ['montagem', 'montagem.html'],
  vistoria: ['vistoria', 'vistoria.html']
};

const TODAS_AS_PAGINAS = Object.keys(PAGINAS).reduce(function (lista, k) {
  return lista.concat(PAGINAS[k]);
}, []);

const ESSENCIAIS = TODAS_AS_PAGINAS.concat([
  'auth.js',
  'campo.js',
  'pdf-101.js',
  'pdf-doc.js',
  'tela-itens.js',
  'tela-doc.js',
  'pdf-montagem.js',
  'pdf-vistoria.js',
  'vendor/pdf-lib.min.js',
  'vendor/fontkit.umd.min.js',
  'Krub-Medium.ttf',
  'Krub-Bold.ttf',
  'imgs/dalmoSJC_preto_1.png',
  'imgs/logoDalmo_caraguaPreto.png'
]);

/* O supabase-js vem de CDN. Ele é guardado junto porque, sem
   ele, o auth.js desiste antes de chegar à tela. */
const DE_FORA = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];


/* ------------------------------------------------------------
   Instalação
   ------------------------------------------------------------
   Um arquivo que não baixa não pode derrubar a instalação
   inteira: cada um é guardado por conta própria e o que falhar
   fica registrado no console, para aparecer no teste e não na
   obra.
   ------------------------------------------------------------ */

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(VERSAO).then(function (cache) {
      const tudo = ESSENCIAIS.concat(DE_FORA);

      return Promise.all(tudo.map(function (caminho) {
        return guardar(cache, caminho).catch(function (erro) {
          console.warn('[sw] não guardei ' + caminho, erro);
        });
      }));
    }).then(function (cache) {
      return avisarSeFaltouAPagina();
    }).then(function () {
      return self.skipWaiting();
    })
  );
});


/* Busca e guarda, reconstruindo a resposta.

   O caminho óbvio, cache.add(), não serve aqui: ele REJEITA
   resposta que veio de redirect, e o Cloudflare redireciona
   /medicao.html para /medicao. Era assim que a página sumia do
   cache sem ninguém notar.

   Refazendo a Response a partir do corpo, o redirect deixa de
   existir para o cache e a cópia fica guardada no endereço que
   foi pedido. */
async function guardar(cache, caminho) {
  const resposta = await fetch(caminho, { cache: 'reload' });
  if (!resposta.ok) throw new Error('resposta ' + resposta.status);

  await cache.put(caminho, new Response(await resposta.blob(), {
    status: 200,
    headers: resposta.headers
  }));
}

/* A tela precisa estar guardada, senão o service worker inteiro
   não serviu para nada: é só ela que não pode faltar na obra. */
async function avisarSeFaltouAPagina() {
  const cache = await caches.open(VERSAO);

  const faltando = [];

  for (const chave of Object.keys(PAGINAS)) {
    let achou = false;
    for (const p of PAGINAS[chave]) {
      if (await cache.match(p, { ignoreSearch: true })) { achou = true; break; }
    }
    if (!achou) faltando.push(chave);
  }

  if (faltando.length) {
    console.error('[sw] NÃO GUARDEI: ' + faltando.join(', ') +
                  '. Essas telas não vão abrir offline.');
    return false;
  }

  return true;
}


/* ------------------------------------------------------------
   Ativação — joga fora as versões antigas
   ------------------------------------------------------------ */

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.map(function (n) {
        return n === VERSAO ? null : caches.delete(n);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});


/* ------------------------------------------------------------
   Busca
   ------------------------------------------------------------ */

self.addEventListener('fetch', function (evento) {
  const pedido = evento.request;

  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);

  /* Supabase: nunca. Nem API, nem login, nem storage. */
  if (url.hostname.indexOf('supabase.co') !== -1) return;

  /* Nossa própria porta do cliente, no Cloudflare: nunca. */
  if (url.pathname.indexOf('/api/') === 0) return;

  /* Abrir a tela de medição sem sinal: tenta a rede e, se ela
     não vier, serve a cópia guardada. O inverso — servir o
     cache primeiro — faria o medidor rodar uma versão velha
     por dias sem perceber. */
  if (pedido.mode === 'navigate') {
    const qual = qualPagina(url);
    if (!qual) return;

    evento.respondWith(
      fetch(pedido)
        .then(function (resposta) {
          guardarCopia(pedido, resposta);
          return resposta;
        })
        .catch(function () { return paginaGuardada(qual); })
    );
    return;
  }

  if (!eEssencial(url, pedido)) return;

  /* Arquivo da lista: entrega o do aparelho na hora — é o que
     faz a tela abrir instantânea e offline — e busca a versão
     nova em segundo plano para a próxima abertura. */
  evento.respondWith(
    caches.match(pedido, { ignoreSearch: true }).then(function (guardado) {
      const daRede = fetch(pedido)
        .then(function (resposta) {
          guardarCopia(pedido, resposta);
          return resposta;
        })
        .catch(function () { return guardado; });

      return guardado || daRede;
    })
  );
});


/* ------------------------------------------------------------
   Apoio
   ------------------------------------------------------------ */

/* Qual das telas de campo está sendo aberta — e devolve a chave,
   não só sim/não: offline, uma navegação para /montagem não pode
   receber a tela de medição guardada. Reconhece os dois endereços
   de cada uma, /x (como o Cloudflare serve) e /x.html (como o
   arquivo se chama e como um servidor local entrega). */
function qualPagina(url) {
  const caminho = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');

  return Object.keys(PAGINAS).find(function (chave) {
    return PAGINAS[chave].some(function (p) {
      return caminho === p || caminho.endsWith('/' + p);
    });
  }) || null;
}

/* Entrega a cópia guardada daquela página, venha ela de qual dos
   dois endereços tiver funcionado na instalação. */
function paginaGuardada(chave) {
  return caches.open(VERSAO).then(function (cache) {
    return PAGINAS[chave].reduce(function (antes, p) {
      return antes.then(function (achado) {
        return achado || cache.match(p, { ignoreSearch: true });
      });
    }, Promise.resolve(null));
  }).then(function (achado) {
    return achado || semRede();
  });
}

function eEssencial(url, pedido) {
  if (DE_FORA.some(function (d) { return pedido.url.indexOf(d) === 0; })) return true;
  if (url.origin !== self.location.origin) return false;

  const caminho = url.pathname.replace(/^\/+/, '');
  return ESSENCIAIS.some(function (e) {
    return caminho === e || caminho.endsWith('/' + e);
  });
}

function guardarCopia(pedido, resposta) {
  /* 'opaque' é resposta de outro domínio sem CORS: não dá para
     saber se deu certo, e guardar um erro disfarçado de arquivo
     é como o cache estraga sozinho. */
  if (!resposta || !resposta.ok || resposta.type === 'opaque') return;

  const copia = resposta.clone();
  caches.open(VERSAO).then(function (cache) {
    cache.put(pedido, copia).catch(function () {});
  });
}

function semRede() {
  return new Response(
    '<!doctype html><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;' +
    'max-width:380px;margin:80px auto;padding:0 20px;color:#4a5054">' +
    '<h1 style="font-size:19px;color:#141618">Tela ainda não guardada</h1>' +
    '<p>Esta página precisa ser aberta uma vez <b>com internet</b> antes de ' +
    'funcionar offline. Abra a Central de Peças na loja, entre em Termo de ' +
    'medição e depois pode ir para a obra.</p></div>',
    { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 503 }
  );
}

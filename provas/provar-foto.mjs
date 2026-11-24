/* ============================================================
   PROVAS DAS FOTOS NO DRIVE — Dalmóbile
   ------------------------------------------------------------
   Roda sem instalar nada:

       node provas/provar-foto.mjs

   E, o que importa mais, roda a si mesmo ao contrário:

       node provas/provar-foto.mjs --defeitos

   Esse segundo modo reintroduz cada defeito, um a um, e exige
   que a prova correspondente FIQUE VERMELHA. Prova que passa
   com o defeito de volta não prova nada — e é assim que uma
   suíte inteira fica verde protegendo coisa nenhuma. Já
   aconteceu neste projeto duas vezes: um stub que não conhecia
   o download deixou 102 provas passarem com o anexo sempre
   nulo, e três telas abriam o IndexedDB na versão errada,
   matando 99 provas em silêncio.

   ------------------------------------------------------------
   OS DUBLÊS SÃO DE PROPÓSITO MESQUINHOS

   Um stub mais generoso que o serviço real CONCORDA COM CÓDIGO
   ERRADO. Então aqui:

     · a busca do Drive só filtra lixeira se o código pedir
       `trashed = false` — sem isso ela devolve o que está na
       lixeira, igual ao Drive;
     · o PostgREST devolve `[]` com status 200 quando a RLS
       barra um PATCH, não 403, porque é o que ele faz;
     · o `select=` é respeitado: coluna que o código não pediu
       não volta;
     · `reservar_pasta_drive` com pasta nula só LÊ, e com pasta
       usa `on conflict do nothing` — quem chega primeiro ganha.
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');

/* ⚠️ Com forma de uuid, não 't-patricia': a rota valida o id do
   trabalho antes de qualquer coisa, e com id fora do formato TODA
   prova pararia no 400 da validação sem chegar a provar o que diz
   provar. A primeira rodada desta suíte foi exatamente isso: 23
   vermelhas, todas por 400. */
const T_PATRICIA = '11111111-1111-4111-8111-111111111111';
const T_MARCIA   = '22222222-2222-4222-8222-222222222222';

const SECRETA = 'secreta-de-servico';
const URL_SB  = 'https://exemplo.supabase.co';

/* Os logins do nosso app. */
const PERFIS = {
  'u-patricia': { id: 'u-patricia', nome: 'Patricia', email: 'patricia@dalmobile.com.br', loja: 'sjc', admin: false, gerente: false },
  'u-joao':     { id: 'u-joao',     nome: 'João',     email: 'joao@dalmobile.com.br',     loja: 'sjc', admin: false, gerente: false },
  'u-marcia':   { id: 'u-marcia',   nome: null,       email: 'marcia@dalmobile.com.br',   loja: 'cgt', admin: false, gerente: false },
  'u-gerente':  { id: 'u-gerente',  nome: 'Gerente',  email: 'ger@dalmobile.com.br',      loja: 'sjc', admin: false, gerente: true  },
  'u-admin':    { id: 'u-admin',    nome: 'Admin',    email: 'adm@dalmobile.com.br',      loja: null,  admin: true,  gerente: false }
};


/* ============================================================
   O MUNDO FALSO
   ============================================================ */
function novoMundo() {
  const m = {
    trabalhos: {
      [T_PATRICIA]: { id: T_PATRICIA, autor: 'u-patricia', loja: 'sjc',
                      cliente: 'Carlos e Bia', tipo: 'apresentacao',
                      atualizado_em: '2026-01-01T00:00:00Z' },
      [T_MARCIA]:   { id: T_MARCIA,   autor: 'u-marcia',   loja: 'cgt',
                      cliente: 'Ana', tipo: 'apresentacao',
                      atualizado_em: '2026-01-01T00:00:00Z' }
    },
    drive_pastas: new Map(),      /* "escopo|chave" -> pasta        */
    trabalho_fotos: new Map(),    /* "trab|amb|ordem" -> linha      */
    arquivos: new Map(),          /* id -> {id,name,parents,mime,trashed,bytes,meta} */
    chamadas: [],                 /* tudo que o código pediu        */
    proximo: 1
  };
  m.novoId = (p) => p + '-' + (m.proximo++);

  /* O fetch falso acha o mundo por aqui. Uma variável de módulo
     em vez de passar o mundo por dez camadas: a prova é
     sequencial, nunca há dois mundos ao mesmo tempo. */
  MUNDO_ATUAL = m;
  return m;
}

let MUNDO_ATUAL = null;

function env(mundo, extra) {
  return Object.assign({
    SUPABASE_URL: URL_SB,
    SUPABASE_SECRET: SECRETA,
    GOOGLE_CLIENT_ID: 'cid',
    GOOGLE_CLIENT_SECRET: 'csec',
    GOOGLE_REFRESH_TOKEN: 'rtok'
  }, extra || {});
}

/* ---------- a busca do Drive, com a mesquinhez certa ---------- */
function buscarNoDrive(mundo, q) {
  const pedeNaoLixeira = /trashed\s*=\s*false/.test(q);
  const nome   = (/name\s*=\s*'((?:\\.|[^'])*)'/.exec(q) || [])[1];
  const pai    = (/'([^']+)'\s+in\s+parents/.exec(q) || [])[1];
  const sóPasta = /mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q);

  const limpo = (s) => String(s || '').replace(/\\'/g, "'").replace(/\\\\/g, '\\');

  return Array.from(mundo.arquivos.values()).filter(function (a) {
    /* ⚠️ AQUI MORA UMA PROVA: se o código não pedir
       `trashed = false`, a pasta na lixeira VOLTA — e os
       arquivos novos iriam para dentro dela, contando os 30 dias
       para o Drive apagar tudo, em silêncio. */
    if (pedeNaoLixeira && a.trashed) return false;
    if (nome !== undefined && a.name !== limpo(nome)) return false;
    if (pai && !(a.parents || []).includes(pai)) return false;
    if (sóPasta && a.mime !== 'application/vnd.google-apps.folder') return false;
    return true;
  });
}

/* ---------- o PostgREST, com o papel vindo do bearer ---------- */
function quemE(headers) {
  const b = String((headers && (headers.authorization || headers.Authorization)) || '')
    .replace(/^Bearer\s+/i, '');
  if (b === SECRETA) return { papel: 'service_role', uid: null };
  if (PERFIS[b]) return { papel: 'authenticated', uid: b };
  return { papel: 'anon', uid: null };
}

/* A regra do banco, copiada aqui de propósito: é o oráculo
   independente. Se o endpoint e esta função discordarem, uma das
   duas está errada — e é isso que a prova detecta. */
function podeVerTrabalho(uid, t) {
  if (!uid) return false;
  const p = PERFIS[uid];
  if (!p) return false;
  if (t.autor === uid) return true;
  if (p.admin) return true;
  if (p.gerente && p.loja && p.loja === t.loja) return true;
  return false;
}

function podeAlterarTrabalho(uid, t) {
  if (!uid) return false;
  const p = PERFIS[uid];
  if (!p) return false;
  return t.autor === uid || p.admin === true;
}

function recortar(linha, select) {
  if (!select || select === '*') return Object.assign({}, linha);
  const fora = {};
  String(select).split(',').map((s) => s.trim()).forEach(function (c) {
    /* ⚠️ Respeitar o select= é o que pegou a coluna `tipo` que
       faltava em /api/documento: o stub antigo devolvia tudo, e
       o código parecia funcionar. */
    if (c) fora[c] = linha[c];
  });
  return fora;
}

function json(corpo, status) {
  return new Response(JSON.stringify(corpo), {
    status: status || 200,
    headers: { 'content-type': 'application/json' }
  });
}


/* ============================================================
   O fetch falso
   ============================================================ */
async function despachar(mundo, endereco, opcoes) {
  {
    const o = opcoes || {};
    const metodo = (o.method || 'GET').toUpperCase();
    const h = o.headers || {};
    const u = new URL(String(endereco));

    mundo.chamadas.push({ metodo: metodo, url: String(endereco), headers: h, body: o.body });

    /* ---- token do Google ---- */
    if (u.host === 'oauth2.googleapis.com') {
      return json({ access_token: 'acesso-ok', expires_in: 3600 });
    }

    /* ---- Drive: baixar ---- */
    if (u.pathname.startsWith('/drive/v3/files/') && u.searchParams.get('alt') === 'media') {
      const id = decodeURIComponent(u.pathname.split('/').pop());
      const a = mundo.arquivos.get(id);
      if (!a || a.trashed) return new Response('não achei', { status: 404 });
      return new Response(a.bytes, {
        status: 200, headers: { 'content-type': a.mime }
      });
    }

    /* ---- Drive: lixeira ---- */
    if (metodo === 'PATCH' && u.pathname.startsWith('/drive/v3/files/')) {
      const id = decodeURIComponent(u.pathname.split('/').pop());
      const corpo = JSON.parse(o.body || '{}');
      const a = mundo.arquivos.get(id);
      if (a && corpo.trashed === true) a.trashed = true;
      return json({ id: id });
    }

    /* ---- Drive: buscar ---- */
    if (metodo === 'GET' && u.pathname === '/drive/v3/files') {
      const achados = buscarNoDrive(mundo, u.searchParams.get('q') || '');
      return json({ files: achados.map((a) => ({ id: a.id, name: a.name })) });
    }

    /* ---- Drive: criar pasta ---- */
    if (metodo === 'POST' && u.pathname === '/drive/v3/files') {
      const corpo = JSON.parse(o.body || '{}');
      const id = mundo.novoId('pasta');
      mundo.arquivos.set(id, {
        id: id, name: corpo.name, parents: corpo.parents || [],
        mime: corpo.mimeType, trashed: false, bytes: new Uint8Array(0), meta: {}
      });
      if (mundo.aoCriarPasta) await mundo.aoCriarPasta(corpo, id);
      return json({ id: id });
    }

    /* ---- Drive: subir arquivo ---- */
    if (metodo === 'POST' && u.pathname === '/upload/drive/v3/files') {
      const forma = o.body;                      /* FormData real */
      const metaTexto = await forma.get('metadata').text();
      const meta = JSON.parse(metaTexto);
      const arq = forma.get('file');
      const bytes = new Uint8Array(await arq.arrayBuffer());

      if (mundo.falharUpload) {
        return new Response(mundo.falharUpload, { status: 403 });
      }

      const id = mundo.novoId('arq');
      mundo.arquivos.set(id, {
        id: id, name: meta.name, parents: meta.parents || [],
        mime: arq.type, trashed: false, bytes: bytes,
        meta: { description: meta.description, properties: meta.properties }
      });
      return json({ id: id, name: meta.name });
    }

    /* ---- Supabase ---- */
    if (u.host === new URL(URL_SB).host) return await supabase(mundo, u, metodo, h, o);

    throw new Error('o código chamou um endereço que a prova não conhece: ' + endereco);
  }
}


function instalarFetch() {
  const original = globalThis.fetch;
  globalThis.fetch = async function (endereco, opcoes) {
    if (!MUNDO_ATUAL) {
      throw new Error('a prova chamou fetch sem ter criado o mundo com novoMundo()');
    }
    return await despachar(MUNDO_ATUAL, endereco, opcoes);
  };
  return function () { globalThis.fetch = original; MUNDO_ATUAL = null; };
}


async function supabase(mundo, u, metodo, h, o) {
  const eu = quemE(h);
  const p = u.pathname;

  const apikey = String(h.apikey || h.apiKey || '');
  if (apikey !== SECRETA) return json({ message: 'No API key found' }, 401);
  if (eu.papel === 'anon') return json({ message: 'JWT inválido' }, 401);

  const soId = (chave) => {
    const v = u.searchParams.get(chave) || '';
    return v.startsWith('eq.') ? decodeURIComponent(v.slice(3)) : null;
  };

  /* ---------- trabalhos: ler ---------- */
  if (p === '/rest/v1/trabalhos' && metodo === 'GET') {
    const id = soId('id');
    const t = mundo.trabalhos[id];
    if (!t) return json([]);
    if (eu.papel !== 'service_role' && !podeVerTrabalho(eu.uid, t)) return json([]);
    return json([recortar(t, u.searchParams.get('select'))]);
  }

  /* ---------- trabalhos: tocar ---------- */
  if (p === '/rest/v1/trabalhos' && metodo === 'PATCH') {
    const id = soId('id');
    const t = mundo.trabalhos[id];

    /* ⚠️ O PostgREST devolve LISTA VAZIA com 200 quando a RLS
       barra — não 403. Um dublê que respondesse 403 aqui faria a
       prova concordar com um endpoint que trata o caso errado. */
    if (!t) return json([]);
    if (eu.papel !== 'service_role' && !podeAlterarTrabalho(eu.uid, t)) return json([]);

    Object.assign(t, JSON.parse(o.body || '{}'));
    const quer = String(h.prefer || h.Prefer || '');
    if (!/return=representation/.test(quer)) return new Response(null, { status: 204 });
    return json([recortar(t, u.searchParams.get('select'))]);
  }

  /* ---------- perfis ---------- */
  if (p === '/rest/v1/perfis' && metodo === 'GET') {
    const id = soId('id');
    const perfil = PERFIS[id];
    if (!perfil) return json([]);
    return json([recortar(perfil, u.searchParams.get('select'))]);
  }

  /* ---------- rpc: reservar pasta ---------- */
  if (p === '/rest/v1/rpc/reservar_pasta_drive' && metodo === 'POST') {
    if (eu.papel !== 'service_role') {
      return json({ message: 'reservar_pasta_drive só pode ser chamada pelo servidor' }, 403);
    }
    const a = JSON.parse(o.body || '{}');
    const chave = a.p_escopo + '|' + a.p_chave;

    /* Pasta nula = consulta, não reserva. */
    if (a.p_pasta === null || a.p_pasta === undefined) {
      return json(mundo.drive_pastas.has(chave) ? mundo.drive_pastas.get(chave) : null);
    }
    /* on conflict do nothing: quem chegou primeiro ganha. */
    if (!mundo.drive_pastas.has(chave)) mundo.drive_pastas.set(chave, a.p_pasta);
    return json(mundo.drive_pastas.get(chave));
  }

  /* ---------- rpc: registrar foto ---------- */
  if (p === '/rest/v1/rpc/registrar_foto_drive' && metodo === 'POST') {
    if (eu.papel !== 'service_role') {
      return json({ message: 'só o servidor' }, 403);
    }
    if (mundo.falharRegistro) return json({ message: 'caiu' }, 500);

    const a = JSON.parse(o.body || '{}');
    mundo.trabalho_fotos.set(a.p_trabalho + '|' + a.p_ambiente + '|' + a.p_ordem, {
      trabalho: a.p_trabalho, ambiente: a.p_ambiente, ordem: a.p_ordem,
      drive_id: a.p_drive_id, nome: a.p_nome, bytes: a.p_bytes
    });
    return new Response(null, { status: 204 });
  }

  /* ---------- trabalho_fotos ---------- */
  if (p === '/rest/v1/trabalho_fotos' && metodo === 'GET') {
    if (eu.papel !== 'service_role') {
      /* As duas tabelas são fechadas para anon e authenticated.
         Se o endpoint tentar ler com o token da pessoa, ele
         descobre aqui. */
      return json({ message: 'permission denied for table trabalho_fotos' }, 401);
    }
    const chave = soId('trabalho') + '|' + soId('ambiente') + '|' + soId('ordem');
    const linha = mundo.trabalho_fotos.get(chave);
    if (!linha) return json([]);
    return json([recortar(linha, u.searchParams.get('select'))]);
  }

  throw new Error('a prova não conhece esta rota do Supabase: ' + metodo + ' ' + p);
}


/* ============================================================
   Atalhos para pedir à rota
   ============================================================ */
function pedido(metodo, corpo, token, consulta) {
  const q = consulta ? '?' + new URLSearchParams(consulta).toString() : '';
  const h = {};
  if (token) h.authorization = 'Bearer ' + token;
  return new Request('https://materiais.luminamkt.co/api/foto' + q, {
    method: metodo, headers: h, body: corpo
  });
}

function fotoFalsa(nome, tamanho, tipo) {
  const bytes = new Uint8Array(tamanho || 1024);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  return new File([bytes], nome || 'cozinha.jpg', { type: tipo || 'image/jpeg' });
}

function formaDeSubida(trabalho, ambiente, ordem, arquivo) {
  const f = new FormData();
  if (trabalho !== undefined) f.append('trabalho', trabalho);
  if (ambiente !== undefined) f.append('ambiente', ambiente);
  if (ordem !== undefined) f.append('ordem', String(ordem));
  if (arquivo) f.append('arquivo', arquivo, arquivo.name);
  return f;
}

/* Todo texto que a rota devolveu, junto, para procurar
   vazamento de id. */
async function corpoInteiro(r) {
  const cópia = r.clone();
  let texto = '';
  try { texto = await cópia.text(); } catch (e) { texto = ''; }
  const cabeçalhos = Array.from(r.headers.entries()).map((e) => e.join(': ')).join('\n');
  return texto + '\n' + cabeçalhos;
}


/* ============================================================
   O arreio
   ============================================================ */
const PROVAS = [];
function prova(nome, corpo) { PROVAS.push({ nome, corpo }); }

function igual(a, b, oque) {
  if (a !== b) throw new Error((oque || 'valor') + ': esperava ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a));
}
function certo(v, oque) { if (!v) throw new Error('esperava verdadeiro: ' + (oque || '')); }
function errado(v, oque) { if (v) throw new Error('esperava falso: ' + (oque || '')); }

/* Nomes de pasta no mundo, para conferir a árvore. */
function pastas(mundo) {
  return Array.from(mundo.arquivos.values())
    .filter((a) => a.mime === 'application/vnd.google-apps.folder' && !a.trashed);
}
function pastaPorNome(mundo, nome) {
  return pastas(mundo).filter((a) => a.name === nome);
}
function arquivosDe(mundo, pastaId) {
  return Array.from(mundo.arquivos.values())
    .filter((a) => !a.trashed && a.mime !== 'application/vnd.google-apps.folder'
                && (a.parents || []).includes(pastaId));
}


/* ============================================================
   AS PROVAS DA ROTA
   ============================================================ */

prova('1. a árvore é raiz > pessoa > cliente, nessa ordem', async (rota) => {
  const m = novoMundo();
  const r = await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  igual(r.status, 200, 'status');

  const raiz = pastaPorNome(m, 'APRESENTAÇÕES - MATERIAIS');
  igual(raiz.length, 1, 'uma raiz');

  const pessoa = pastaPorNome(m, 'Patricia');
  igual(pessoa.length, 1, 'uma pasta da pessoa');
  certo(pessoa[0].parents.includes(raiz[0].id), 'pessoa dentro da raiz');

  const cliente = pastaPorNome(m, 'Carlos e Bia');
  igual(cliente.length, 1, 'uma pasta do cliente');
  certo(cliente[0].parents.includes(pessoa[0].id), 'cliente dentro da pessoa');

  igual(arquivosDe(m, cliente[0].id).length, 1, 'a foto na pasta do cliente');
});


prova('2. o id do arquivo no Drive não sai na resposta', async (rota) => {
  const m = novoMundo();

  const sub = await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  const ids = Array.from(m.arquivos.keys());
  certo(ids.length > 0, 'algo foi criado no Drive');

  const textoSub = await corpoInteiro(sub);
  for (const id of ids) {
    errado(textoSub.includes(id), 'o POST vazou o id ' + id);
  }

  const bai = await rota.onRequest({ request: pedido('GET', null, 'u-patricia',
    { trabalho: T_PATRICIA, ambiente: 'amb-aaa', ordem: '0' }), env: env(m) });

  igual(bai.status, 200, 'status do GET');
  const textoBai = await corpoInteiro(bai);
  for (const id of ids) {
    errado(textoBai.includes(id), 'o GET vazou o id ' + id);
  }
});


prova('3. o gerente VÊ a apresentação do consultor da loja dele', async (rota) => {
  const m = novoMundo();
  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  const r = await rota.onRequest({ request: pedido('GET', null, 'u-gerente',
    { trabalho: T_PATRICIA, ambiente: 'amb-aaa', ordem: '0' }), env: env(m) });

  igual(r.status, 200, 'o gerente devia ver');
});


prova('4. o gerente NÃO escreve na apresentação do consultor', async (rota) => {
  const m = novoMundo();
  const antes = m.arquivos.size;

  const r = await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-gerente'), env: env(m) });

  igual(r.status, 403, 'devia barrar');
  igual(m.trabalho_fotos.size, 0, 'nada registrado');
  /* E não é só a resposta: nada pode ter ido para o Drive. */
  igual(m.arquivos.size, antes, 'nada criado no Drive');
});


prova('5. quem não vê o trabalho recebe 404 e o Drive nem é tocado', async (rota) => {
  const m = novoMundo();
  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_MARCIA, 'amb-zzz', 0, fotoFalsa()), 'u-marcia'), env: env(m) });

  m.chamadas.length = 0;

  const r = await rota.onRequest({ request: pedido('GET', null, 'u-patricia',
    { trabalho: T_MARCIA, ambiente: 'amb-zzz', ordem: '0' }), env: env(m) });

  igual(r.status, 404, 'devia ser 404');

  const tocouGoogle = m.chamadas.some((c) => /googleapis\.com/.test(c.url));
  errado(tocouGoogle, 'não devia ter chamado o Google');
});


prova('6. o administrador alcança tudo, e a pasta é a do AUTOR', async (rota) => {
  const m = novoMundo();
  const r = await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-admin'), env: env(m) });

  igual(r.status, 200, 'o admin devia conseguir');
  igual(pastaPorNome(m, 'Patricia').length, 1, 'a pasta é da Patricia');
  igual(pastaPorNome(m, 'Admin').length, 0, 'e não do admin');
});


prova('7. perfil sem nome usa o e-mail, não cai numa pasta comum', async (rota) => {
  const m = novoMundo();
  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_MARCIA, 'amb-zzz', 0, fotoFalsa()), 'u-marcia'), env: env(m) });

  igual(pastaPorNome(m, 'marcia@dalmobile.com.br').length, 1, 'pasta pelo e-mail');
  igual(pastaPorNome(m, 'sem nome').length, 0, 'ninguém na pasta "sem nome"');
});


prova('8. renomear a pessoa não cria uma segunda pasta', async (rota) => {
  const m = novoMundo();
  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  /* A correção no painel: "Patricia" -> "Patrícia". */
  const guardado = PERFIS['u-patricia'].nome;
  PERFIS['u-patricia'].nome = 'Patrícia';
  try {
    await rota.onRequest({ request: pedido('POST',
      formaDeSubida(T_PATRICIA, 'amb-aaa', 1, fotoFalsa('sala.jpg')), 'u-patricia'), env: env(m) });
  } finally {
    PERFIS['u-patricia'].nome = guardado;
  }

  igual(pastas(m).filter((p) => /Patr[ií]cia/.test(p.name)).length, 1,
    'uma pasta só, apesar do nome novo');
  igual(pastaPorNome(m, 'Patrícia').length, 0, 'nenhuma pasta nova com o nome corrigido');

  const cliente = pastaPorNome(m, 'Carlos e Bia')[0];
  igual(arquivosDe(m, cliente.id).length, 2, 'as duas fotos na mesma pasta');
});


prova('9. renomear a pasta DENTRO do Drive também não racha nada', async (rota) => {
  const m = novoMundo();
  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  /* Alguém arruma o Drive na mão. */
  pastaPorNome(m, 'Patricia')[0].name = 'Patricia (consultora)';

  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 1, fotoFalsa('sala.jpg')), 'u-patricia'), env: env(m) });

  igual(pastaPorNome(m, 'Patricia').length, 0, 'não recriou a antiga');
  igual(arquivosDe(m, pastaPorNome(m, 'Carlos e Bia')[0].id).length, 2,
    'as duas fotos continuam juntas');
});


prova('10. pasta na lixeira não é reaproveitada', async (rota) => {
  const m = novoMundo();

  /* Uma raiz que alguém mandou para a lixeira. */
  const velha = m.novoId('pasta');
  m.arquivos.set(velha, {
    id: velha, name: 'APRESENTAÇÕES - MATERIAIS', parents: [],
    mime: 'application/vnd.google-apps.folder', trashed: true,
    bytes: new Uint8Array(0), meta: {}
  });

  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  const foto = Array.from(m.arquivos.values()).find((a) => a.name.startsWith('foto-'));
  certo(foto, 'a foto existe');

  /* Sobe a cadeia de pais: nenhum pode estar na lixeira. */
  let atual = foto;
  const vistos = new Set();
  while (atual && (atual.parents || []).length) {
    const pai = m.arquivos.get(atual.parents[0]);
    if (!pai || vistos.has(pai.id)) break;
    vistos.add(pai.id);
    errado(pai.trashed, 'o pai "' + pai.name + '" está na lixeira');
    atual = pai;
  }
});


prova('11. duas abas ao mesmo tempo: uma pasta, e a perdida vai para a lixeira', async (rota) => {
  const m = novoMundo();

  /* A corrida de verdade: no instante em que esta subida cria a
     pasta da Patricia, outra aba já reservou a dela. */
  let armado = false;
  m.aoCriarPasta = async function (corpo, id) {
    if (armado || corpo.name !== 'Patricia') return;
    armado = true;
    const outra = m.novoId('pasta');
    m.arquivos.set(outra, {
      id: outra, name: 'Patricia', parents: corpo.parents || [],
      mime: 'application/vnd.google-apps.folder', trashed: false,
      bytes: new Uint8Array(0), meta: {}
    });
    m.drive_pastas.set('usuario|u-patricia', outra);   /* ela ganhou */
  };

  const r = await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  igual(r.status, 200, 'status');
  igual(pastaPorNome(m, 'Patricia').length, 1,
    'tem de sobrar UMA "Patricia" viva — duas lado a lado é a confusão que isto evita');

  const vencedora = m.drive_pastas.get('usuario|u-patricia');
  igual(pastaPorNome(m, 'Patricia')[0].id, vencedora, 'a que sobrou é a reservada');
});


prova('12. subir a mesma foto duas vezes não cria duas cópias', async (rota) => {
  const m = novoMundo();
  const faz = () => rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  await faz();
  await faz();

  const cliente = pastaPorNome(m, 'Carlos e Bia')[0];
  igual(arquivosDe(m, cliente.id).length, 1, 'uma cópia só');
  igual(m.trabalho_fotos.size, 1, 'um registro só');
});


prova('13. o nome não acumula "foto-NN-" a cada volta', async (rota) => {
  const m = novoMundo();

  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa('cozinha.jpg')), 'u-patricia'), env: env(m) });

  const nome1 = m.trabalho_fotos.get(T_PATRICIA + '|amb-aaa|0').nome;
  igual(nome1, 'foto-01-cozinha.jpg', 'o nome da primeira volta');

  /* A foto desce do Drive e sobe de novo noutra posição, que é o
     que acontece quando o consultor reordena os ambientes. */
  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 4, fotoFalsa(nome1)), 'u-patricia'), env: env(m) });

  const nome2 = m.trabalho_fotos.get(T_PATRICIA + '|amb-aaa|4').nome;
  igual(nome2, 'foto-05-cozinha.jpg', 'o prefixo foi trocado, não empilhado');
  errado(/foto-\d+-foto-/.test(nome2), 'prefixo empilhado em ' + nome2);
});


prova('14. sem as variáveis do Google: 503, e nada escrito', async (rota) => {
  const m = novoMundo();
  const e = env(m, { GOOGLE_REFRESH_TOKEN: '' });

  const r = await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: e });

  igual(r.status, 503, 'devia avisar que o Drive está desligado');
  igual(m.trabalho_fotos.size, 0, 'nada registrado');
  igual(m.arquivos.size, 0, 'nada no Drive');

  /* E o 503 tem de ser antes de mexer no banco: tocar o
     `atualizado_em` de um trabalho para depois não fazer nada
     seria mentir sobre a hora da última alteração. */
  const tocou = m.chamadas.some((c) => c.metodo === 'PATCH');
  errado(tocou, 'não devia ter tocado o trabalho');
});


prova('15. SVG não entra, mesmo se chamarem de imagem', async (rota) => {
  const m = novoMundo();
  const svg = new File(['<svg onload="alert(1)"></svg>'], 'x.svg', { type: 'image/svg+xml' });

  const r = await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, svg), 'u-patricia'), env: env(m) });

  igual(r.status, 415, 'devia recusar o tipo');
  igual(m.arquivos.size, 0, 'nada subiu');
});


prova('16. foto gigante é recusada antes de subir', async (rota) => {
  const m = novoMundo();
  const grande = fotoFalsa('enorme.jpg', 7 * 1024 * 1024);

  const r = await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, grande), 'u-patricia'), env: env(m) });

  igual(r.status, 413, 'devia recusar pelo tamanho');
  igual(m.arquivos.size, 0, 'nada subiu');
});


prova('17. ambiente e ordem são validados', async (rota) => {
  const m = novoMundo();

  const casos = [
    ['../../etc/passwd', 0, 'caminho'],
    ['amb aaa',          0, 'espaço'],
    ['a'.repeat(65),     0, 'longo demais'],
    ['',                 0, 'vazio'],
    ['amb-aaa',         -1, 'ordem negativa'],
    ['amb-aaa',        500, 'ordem absurda'],
    ['amb-aaa',    'muitas', 'ordem não numérica']
  ];

  for (const [amb, ordem, porque] of casos) {
    const r = await rota.onRequest({ request: pedido('POST',
      formaDeSubida(T_PATRICIA, amb, ordem, fotoFalsa()), 'u-patricia'), env: env(m) });
    igual(r.status, 400, 'devia recusar (' + porque + ')');
  }

  igual(m.arquivos.size, 0, 'nada subiu');
});


prova('18. sem sessão não passa', async (rota) => {
  const m = novoMundo();
  const r = await rota.onRequest({ request: pedido('GET', null, null,
    { trabalho: T_PATRICIA, ambiente: 'amb-aaa', ordem: '0' }), env: env(m) });
  igual(r.status, 401, 'devia pedir login');
});


prova('19. foto que não subiu é 404; apagada do Drive é 410', async (rota) => {
  const m = novoMundo();

  const r404 = await rota.onRequest({ request: pedido('GET', null, 'u-patricia',
    { trabalho: T_PATRICIA, ambiente: 'amb-aaa', ordem: '0' }), env: env(m) });
  igual(r404.status, 404, 'nunca subiu');

  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  /* Alguém apagou no Drive. O registro continua. */
  const id = m.trabalho_fotos.get(T_PATRICIA + '|amb-aaa|0').drive_id;
  m.arquivos.get(id).trashed = true;

  const r410 = await rota.onRequest({ request: pedido('GET', null, 'u-patricia',
    { trabalho: T_PATRICIA, ambiente: 'amb-aaa', ordem: '0' }), env: env(m) });

  igual(r410.status, 410, 'distinguir "apagado" de "nunca subiu" é a única pista de perda');
});


prova('20. a foto volta com os bytes e o tipo certos, e com o nome', async (rota) => {
  const m = novoMundo();
  const original = fotoFalsa('cozinha.jpg', 2048);

  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, original), 'u-patricia'), env: env(m) });

  const r = await rota.onRequest({ request: pedido('GET', null, 'u-patricia',
    { trabalho: T_PATRICIA, ambiente: 'amb-aaa', ordem: '0' }), env: env(m) });

  igual(r.status, 200, 'status');
  igual(r.headers.get('content-type'), 'image/jpeg', 'tipo');
  igual(r.headers.get('x-content-type-options'), 'nosniff', 'nosniff');

  /* O nome tem de voltar: é por ele que o navegador remonta o
     File e o salvamento seguinte reconhece que já subiu. */
  const disp = r.headers.get('content-disposition') || '';
  certo(/filename="foto-01-cozinha\.jpg"/.test(disp), 'nome no cabeçalho: ' + disp);

  const voltou = new Uint8Array(await r.arrayBuffer());
  igual(voltou.length, 2048, 'tamanho');
  const esperado = new Uint8Array(await original.arrayBuffer());
  for (let i = 0; i < voltou.length; i++) {
    if (voltou[i] !== esperado[i]) throw new Error('byte ' + i + ' diferente');
  }
});


prova('21. o registro no banco não é um proxy: trabalho_fotos é lido como servidor', async (rota) => {
  const m = novoMundo();
  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  m.chamadas.length = 0;
  await rota.onRequest({ request: pedido('GET', null, 'u-patricia',
    { trabalho: T_PATRICIA, ambiente: 'amb-aaa', ordem: '0' }), env: env(m) });

  const leituras = m.chamadas.filter((c) => /trabalho_fotos/.test(c.url));
  igual(leituras.length, 1, 'uma leitura de trabalho_fotos');

  const bearer = String(leituras[0].headers.authorization || '').replace(/^Bearer\s+/, '');
  igual(bearer, SECRETA, 'tem de ler como servidor — a tabela é fechada para o usuário');

  /* E a permissão foi perguntada antes, com o token da pessoa. */
  const comoPessoa = m.chamadas.filter((c) =>
    /\/trabalhos\?/.test(c.url)
    && String(c.headers.authorization || '').includes('u-patricia'));
  certo(comoPessoa.length >= 1, 'a cerca foi consultada com o token da pessoa');
});


prova('22. os metadados do arquivo dizem a que apresentação ele pertence', async (rota) => {
  const m = novoMundo();
  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 2, fotoFalsa()), 'u-patricia'), env: env(m) });

  const arq = Array.from(m.arquivos.values()).find((a) => a.name.startsWith('foto-'));
  const p = arq.meta.properties || {};
  igual(p.trabalho, T_PATRICIA, 'trabalho');
  igual(p.ambiente, 'amb-aaa', 'ambiente');
  igual(p.ordem, '2', 'ordem');
  certo(/Carlos e Bia/.test(arq.meta.description || ''), 'o cliente na descrição');
});


prova('23. se o registro no banco falhar, a rota avisa — não diz que deu certo', async (rota) => {
  const m = novoMundo();
  m.falharRegistro = true;

  const r = await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  certo(r.status >= 500, 'tinha de falhar em voz alta, veio ' + r.status);
  igual(m.trabalho_fotos.size, 0, 'nada registrado');

  /* E a próxima tentativa reencontra o arquivo pelo nome, em vez
     de subir uma segunda cópia. */
  m.falharRegistro = false;
  const r2 = await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  igual(r2.status, 200, 'a repetição devia funcionar');
  igual(arquivosDe(m, pastaPorNome(m, 'Carlos e Bia')[0].id).length, 1,
    'uma cópia só, apesar das duas tentativas');
});


prova('24. cota cheia no Drive dá recado que diz o que fazer', async (rota) => {
  const m = novoMundo();
  m.falharUpload = '{"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}';

  const r = await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  certo(r.status >= 400, 'devia falhar');
  igual(m.trabalho_fotos.size, 0, 'nada registrado');
});


prova('25. apresentação sem cliente ainda tem onde morar', async (rota) => {
  const m = novoMundo();
  m.trabalhos[T_PATRICIA].cliente = '';

  const r = await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  igual(r.status, 200, 'status');
  igual(pastaPorNome(m, 'Sem cliente').length, 1, 'pasta nomeada, não arquivo solto na raiz');
});


prova('26. duas pessoas com o mesmo cliente não compartilham pasta', async (rota) => {
  const m = novoMundo();
  m.trabalhos[T_MARCIA].cliente = 'Carlos e Bia';   /* o mesmo nome */

  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });
  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_MARCIA, 'amb-zzz', 0, fotoFalsa()), 'u-marcia'), env: env(m) });

  const iguais = pastaPorNome(m, 'Carlos e Bia');
  igual(iguais.length, 2, 'uma pasta para cada pessoa');
  const pais = new Set(iguais.map((p) => p.parents[0]));
  igual(pais.size, 2, 'e em pastas de pessoas diferentes');
});


prova('27. GOOGLE_PASTA_APRESENTACOES manda, quando existe', async (rota) => {
  const m = novoMundo();

  const minha = m.novoId('pasta');
  m.arquivos.set(minha, {
    id: minha, name: 'A pasta que eu escolhi', parents: [],
    mime: 'application/vnd.google-apps.folder', trashed: false,
    bytes: new Uint8Array(0), meta: {}
  });

  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'),
    env: env(m, { GOOGLE_PASTA_APRESENTACOES: minha }) });

  igual(pastaPorNome(m, 'APRESENTAÇÕES - MATERIAIS').length, 0, 'não criou raiz própria');
  certo(pastaPorNome(m, 'Patricia')[0].parents.includes(minha), 'usou a pasta indicada');
});


prova('28. método errado é recusado', async (rota) => {
  const m = novoMundo();
  const r = await rota.onRequest({ request: pedido('DELETE', null, 'u-patricia',
    { trabalho: T_PATRICIA, ambiente: 'amb-aaa', ordem: '0' }), env: env(m) });
  igual(r.status, 405, 'devia recusar o método');
});


prova('29. a reserva poupa o Drive: 20 fotos não viram 20 pastas criadas e jogadas fora', async (rota) => {
  const m = novoMundo();

  await rota.onRequest({ request: pedido('POST',
    formaDeSubida(T_PATRICIA, 'amb-aaa', 0, fotoFalsa()), 'u-patricia'), env: env(m) });

  /* A primeira subida cria raiz, pessoa e cliente: três. */
  const criadasNaPrimeira = m.chamadas.filter((c) =>
    c.metodo === 'POST' && new URL(c.url).pathname === '/drive/v3/files').length;
  igual(criadasNaPrimeira, 3, 'raiz + pessoa + cliente');

  m.chamadas.length = 0;

  /* Da segunda em diante, NENHUMA pasta nova. Sem a leitura da
     reserva o resultado final continua certo — a escrita da
     reserva salva —, mas cada foto criaria duas pastas para
     depois mandá-las para a lixeira: 40 chamadas à API do Google
     por apresentação, e 40 pastas na lixeira do cliente. */
  for (let o = 1; o <= 4; o++) {
    await rota.onRequest({ request: pedido('POST',
      formaDeSubida(T_PATRICIA, 'amb-aaa', o, fotoFalsa('f' + o + '.jpg')), 'u-patricia'), env: env(m) });
  }

  const criadasDepois = m.chamadas.filter((c) =>
    c.metodo === 'POST' && new URL(c.url).pathname === '/drive/v3/files').length;
  igual(criadasDepois, 0, 'nenhuma pasta criada nas fotos seguintes');

  const descartes = m.chamadas.filter((c) => c.metodo === 'PATCH'
    && /\/drive\/v3\/files\//.test(new URL(c.url).pathname)).length;
  igual(descartes, 0, 'nenhuma pasta jogada na lixeira');

  /* E nem PROCURA pasta. Aqui está o que a leitura da reserva
     realmente garante, e vale registrar porque eu descobri ao
     contrário: tirando a leitura, o resultado final continua
     CERTO — a escrita da reserva é que é a cerca. O que se perde
     é isto: sem ela, cada foto refaz duas buscas de pasta no
     Google. Numa apresentação de 20 fotos são 40 chamadas à API
     por salvamento, repetidas a cada vez que o consultor salva. */
  const buscasDePasta = m.chamadas.filter(function (c) {
    if (c.metodo !== 'GET') return false;
    const u = new URL(c.url);
    if (u.pathname !== '/drive/v3/files') return false;
    return /google-apps\.folder/.test(u.searchParams.get('q') || '');
  }).length;

  igual(buscasDePasta, 0,
    'a pasta já reservada não é procurada de novo a cada foto');
});


/* ============================================================
   OS DEFEITOS — cada um tem de deixar uma prova vermelha
   ============================================================
   Isto é a metade que importa. Prova verde não diz nada sobre o
   que ela pega; o que diz é a prova ficar vermelha quando o
   defeito volta. Um defeito que não deixa nada vermelho é um
   buraco no desenho, não uma prova a mais — foi exatamente
   assim que apareceu a janela do "subiu no Drive e o banco não
   soube". */
/* ⚠️ NÃO ESTÁ AQUI, e é bom dizer em voz alta: o
   `arquivarNoDrive` do DOCUMENTO ASSINADO. Esta suíte cobre
   /api/foto, e aquele caminho passa pelo /api/autentique. As
   provas dele existiram — 102 — e morreram com o container da
   sessão em que foram escritas, porque nunca foram para o repo.
   Pôr um defeito daquele caminho aqui daria falsa cobertura: ele
   ficaria impune por não ser exercitado, não por faltar prova.
   Aquela suíte precisa ser reescrita, num arquivo seu. */
const DEFEITOS = [
  { nome: 'a árvore perde o nível da pessoa',
    arquivo: 'lib/drive.js',
    de: `  const daPessoa = await pastaFirmada(
    acesso, reservar, 'usuario', String(pessoa.id), nomeDaPessoa, raiz);`,
    para: `  const daPessoa = raiz;` },

  { nome: 'a raiz volta a ser achada pelo nome, sem reserva',
    arquivo: 'lib/drive.js',
    de: `    raiz = await pastaFirmada(
      acesso, reservar, 'raiz', 'apresentacoes', NOME_DA_RAIZ_APRES, null);`,
    para: `    raiz = await acharPasta(acesso, NOME_DA_RAIZ_APRES, null)
        || await criarPasta(acesso, NOME_DA_RAIZ_APRES, null);` },

  /* Este não quebra o resultado — a escrita da reserva segura. O
     que ele quebra é o custo: duas buscas no Google por foto, a
     cada salvamento. Por isso quem o pega é a prova 29 e não a 8. */
  { nome: 'a reserva deixa de ser lida: cada foto refaz as buscas de pasta',
    arquivo: 'lib/drive.js',
    de: `  const reservada = await reservar(escopo, chave, null, null);
  if (reservada) return reservada;`,
    para: `  const reservada = null;` },

  { nome: 'a pasta perdida na corrida não vai para a lixeira',
    arquivo: 'lib/drive.js',
    de: `  if (quevem && quevem !== minha) {
    await descartarPasta(acesso, minha);
    return quevem;
  }`,
    para: `  if (quevem && quevem !== minha) {
    return quevem;
  }` },

  { nome: 'a busca de pasta esquece a lixeira',
    arquivo: 'lib/drive.js',
    de: `    "mimeType = '" + PASTA + "'",
    "name = '" + String(nome).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'") + "'",
    'trashed = false'`,
    para: `    "mimeType = '" + PASTA + "'",
    "name = '" + String(nome).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'") + "'"` },

  { nome: 'subir passa a exigir só quem PODE VER (gerente escreveria)',
    arquivo: 'functions/api/foto.js',
    de: `  const dono = await podeAlterar(url, secreta, sessao, lugar.trabalho);`,
    para: `  const dono = await (async function () {
    const r = await fetch(url + '/rest/v1/trabalhos'
      + '?select=autor,cliente&limit=1&id=eq.' + encodeURIComponent(lugar.trabalho),
      { headers: cabecalhos(secreta, sessao) });
    const l = await r.json();
    if (!l || !l[0]) throw falha('Essa apresentação não é sua.', 403);
    return l[0];
  })();` },

  { nome: 'baixar deixa de perguntar se a pessoa pode ver',
    arquivo: 'functions/api/foto.js',
    de: `  const visivel = await podeVer(url, secreta, sessao, lugar.trabalho);
  if (!visivel) throw falha('Apresentação não encontrada.', 404);`,
    para: `  const visivel = true;` },

  { nome: 'a resposta passa a devolver o id do Drive',
    arquivo: 'functions/api/foto.js',
    de: `  return responder({
    ok: true,
    ambiente: lugar.ambiente,
    ordem: lugar.ordem,
    nome: nome
  });`,
    para: `  return responder({
    ok: true,
    ambiente: lugar.ambiente,
    ordem: lugar.ordem,
    nome: nome,
    drive: id
  });` },

  { nome: 'a lista de tipos vira "qualquer image/"',
    arquivo: 'functions/api/foto.js',
    de: `  if (!TIPOS[tipo]) {`,
    para: `  if (!/^image\\//.test(tipo)) {` },

  { nome: 'o teto de tamanho cai',
    arquivo: 'functions/api/foto.js',
    de: `  if (arquivo.size > TETO) {`,
    para: `  if (false) {` },

  { nome: 'o ambiente deixa de ser validado',
    arquivo: 'functions/api/foto.js',
    de: `  if (!/^[A-Za-z0-9_-]{1,64}$/.test(a)) throw falha('Ambiente inválido.', 400);`,
    para: `  if (false) throw falha('Ambiente inválido.', 400);` },

  { nome: 'o prefixo foto-NN passa a empilhar',
    arquivo: 'functions/api/foto.js',
    de: `    .replace(/^foto-\\d{2,3}-?/, '')`,
    para: `` },

  { nome: 'a pasta usa o nome de quem subiu, não do autor',
    arquivo: 'functions/api/foto.js',
    de: `  const pessoa = await perfilDoAutor(url, secreta, dono.autor);`,
    para: `  const pessoa = await perfilDoAutor(url, secreta,
    (function () {
      const b = (request.headers.get('authorization') || '')
        .replace(/^Bearer\\s+/i, '').trim();
      return b;
    })());` },

  { nome: 'perfil sem nome cai em "sem nome"',
    arquivo: 'lib/drive.js',
    de: `  const nomeDaPessoa = String((pessoa && pessoa.nome) || '').trim()
                    || String((pessoa && pessoa.email) || '').trim()
                    || 'sem nome';`,
    para: `  const nomeDaPessoa = String((pessoa && pessoa.nome) || '').trim()
                    || 'sem nome';` },

  { nome: 'trabalho_fotos passa a ser lido com o token da pessoa',
    arquivo: 'functions/api/foto.js',
    de: `    { headers: cabecalhos(secreta, secreta) });

  if (!r.ok) throw falha('Não consegui achar a foto agora.', 502);`,
    para: `    { headers: cabecalhos(secreta, arguments[2]) });

  if (!r.ok) throw falha('Não consegui achar a foto agora.', 502);` },

  { nome: 'o 503 do Drive desligado vem depois de tocar o banco',
    arquivo: 'functions/api/foto.js',
    de: `  if (!temDrive(env)) {`,
    para: `  if (false) {` },

  { nome: 'o registro que falha passa a ser engolido',
    arquivo: 'functions/api/foto.js',
    de: `  await registrarFoto(url, secreta, lugar, id, nome, bytes.length);`,
    para: `  try { await registrarFoto(url, secreta, lugar, id, nome, bytes.length); }
  catch (e) { console.warn('deixa passar'); }` },

  { nome: 'o nome deixa de voltar no cabeçalho',
    arquivo: 'functions/api/foto.js',
    de: `      'content-disposition': 'inline; filename="'
        + String(foto.nome || 'foto.jpg').replace(/[^A-Za-z0-9._-]/g, '_') + '"'`,
    para: `      'content-disposition': 'inline'` },

  { nome: 'apagado do Drive volta a ser indistinguível de "nunca subiu"',
    arquivo: 'functions/api/foto.js',
    de: `    throw falha('A foto estava guardada mas não está mais no Drive.', 410);`,
    para: `    throw falha('Essa foto não está guardada.', 404);` },

  { nome: 'a foto deixa de ser procurada antes de subir',
    arquivo: 'functions/api/foto.js',
    de: `  const anterior = await acharArquivo(acesso, pasta, nome);`,
    para: `  const anterior = null;` },

  { nome: 'a chave do cliente perde o dono: duas pessoas, uma pasta',
    arquivo: 'lib/drive.js',
    de: `    String(pessoa.id) + '|' + nomeDoCliente,`,
    para: `    nomeDoCliente,` }
];


/* ============================================================
   RODAR
   ============================================================ */
async function carregarRota(base) {
  const caminho = join(base, 'functions/api/foto.js');
  /* `?v=` a cada carga: sem isso o Node devolve o módulo do
     cache e o defeito aplicado não teria efeito nenhum — a suíte
     ficaria verde provando a versão sã, vinte vezes seguidas. */
  return await import('file://' + caminho + '?v=' + Math.random());
}

async function rodarSuite(base, silencioso) {
  const rota = await carregarRota(base);
  const vermelhas = [];

  for (const p of PROVAS) {
    const desinstalar = instalarFetch();
    try {
      await p.corpo(rota);
      if (!silencioso) console.log('  \u2713 ' + p.nome);
    } catch (e) {
      /* Capturar aqui, uma prova por vez, é o que impede uma
         prova que estoura de matar as que vêm depois — foi assim
         que um defeito pareceu "passar" neste projeto. */
      vermelhas.push({ nome: p.nome, erro: (e && e.message) || String(e) });
      if (!silencioso) console.log('  \u2717 ' + p.nome + '\n      ' + ((e && e.message) || e));
    } finally {
      desinstalar();
    }
  }

  return vermelhas;
}


/* Limpar é cortesia, nunca requisito: um ambiente que proíbe
   apagar não pode derrubar a suíte. Era o que acontecia. */
function limpar(pasta) {
  try { rmSync(pasta, { recursive: true, force: true }); }
  catch (e) { /* fica na pasta temporária do sistema; o SO cuida */ }
}


async function principal() {
  const querDefeitos = process.argv.includes('--defeitos');


  console.log('\nPROVAS DAS FOTOS NO DRIVE\n' + '-'.repeat(62));
  const vermelhas = await rodarSuite(RAIZ, false);

  console.log('-'.repeat(62));
  console.log(vermelhas.length
    ? '\u2717 ' + vermelhas.length + ' de ' + PROVAS.length + ' vermelhas'
    : '\u2713 as ' + PROVAS.length + ' provas passaram');

  if (vermelhas.length) process.exit(1);

  if (!querDefeitos) {
    console.log('\nProva verde não diz o que ela pega. Rode também:');
    console.log('    node provas/provar-foto.mjs --defeitos\n');
    return;
  }

  console.log('\n\nREINTRODUZINDO OS DEFEITOS\n' + '-'.repeat(62));
  console.log('Cada um tem de deixar alguma prova VERMELHA.\n');

  let impunes = 0;
  let i = 0;

  /* ⚠️ UMA PASTA NOVA POR DEFEITO, E O NOME TEM DE SER ÚNICO.
     O Node guarda módulo em cache PELO CAMINHO. Com uma pasta só
     — `.provas-tmp` — o `lib/drive.js` do primeiro defeito ficava
     cacheado e os 21 testes seguintes rodavam todos contra ele:
     21 "pegos" que não provavam nada. Foi o que aconteceu na
     primeira rodada desta suíte, e só apareceu porque todos os
     defeitos acusavam a MESMA primeira vermelha.

     O `?v=` do import da rota não resolvia: ele quebra o cache de
     `foto.js`, não o do `drive.js` que ela importa. */
  for (const d of DEFEITOS) {
    i++;
    /* ⚠️ FORA DO REPO. As cópias iam para dentro dele, e isso
       tinha dois problemas: `.provas-tmp*` aparecendo no
       `git status` à espera de ser commitado por engano, e — o
       que fez isto aparecer — ambiente que proíbe apagar arquivo
       na pasta do projeto derrubava a suíte inteira no primeiro
       defeito. A pasta temporária do sistema não tem nenhum dos
       dois, e o nome sorteado já garante o caminho único que o
       cache de módulo do Node exige. */
    const sao    = mkdtempSync(join(tmpdir(), 'provas-foto-sao-'));
    const doente = mkdtempSync(join(tmpdir(), 'provas-foto-doente-'));

    for (const base of [sao, doente]) {
      cpSync(join(RAIZ, 'lib'), join(base, 'lib'), { recursive: true });
      cpSync(join(RAIZ, 'functions'), join(base, 'functions'), { recursive: true });
    }

    const alvo = join(doente, d.arquivo);
    const texto = readFileSync(alvo, 'utf8');

    if (!texto.includes(d.de)) {
      /* Nem pego nem impune: um defeito que não fala mais do
         código de hoje. Vale gritar, porque defeito que não
         aplica dá falsa impressão de cobertura. */
      console.log('  ! DESATUALIZADO: ' + d.nome);
      console.log('      o trecho não existe mais em ' + d.arquivo);
      impunes++;
      limpar(sao); limpar(doente);
      continue;
    }

    writeFileSync(alvo, texto.replace(d.de, d.para));

    /* A cópia SÃ primeiro. Se ela já vier vermelha, o vermelho da
       doente não diz nada sobre o defeito — e é a única forma de
       saber que o arreio não está mentindo. */
    const baseVerde = await rodarSuite(sao, true);
    const quebrou   = await rodarSuite(doente, true);

    limpar(sao); limpar(doente);

    if (baseVerde.length) {
      console.log('  ! ARREIO QUEBRADO em "' + d.nome + '"');
      console.log('      a cópia SEM defeito já deu ' + baseVerde.length
        + ' vermelhas (' + baseVerde[0].nome + ')');
      console.log('      logo o vermelho da cópia doente não prova nada.');
      impunes++;
      continue;
    }

    if (quebrou.length) {
      console.log('  \u2713 ' + d.nome);
      console.log('      ' + quebrou.length + ' vermelha(s) — ' + quebrou[0].nome);
    } else {
      console.log('  \u2717 IMPUNE: ' + d.nome);
      console.log('      nenhuma prova viu. Falta uma prova, não sobra um defeito.');
      impunes++;
    }
  }

  console.log('-'.repeat(62));
  if (impunes) {
    console.log('\u2717 ' + impunes + ' de ' + DEFEITOS.length + ' defeitos não foram pegos');
    process.exit(1);
  }
  console.log('\u2713 os ' + DEFEITOS.length + ' defeitos foram pegos\n');
}


principal().catch(function (e) {
  console.error('\nA SUÍTE CAIU: ' + ((e && e.stack) || e));
  console.error('\nProva que estoura esconde todas as que vêm depois.\n');
  process.exit(1);
});

/* ============================================================
   PROVAS DO dados.js — Dalmóbile
   ------------------------------------------------------------
       node provas/provar-dados.mjs
       node provas/provar-dados.mjs --defeitos

   O dados.js é a camada entre a tela e o banco, e até agora não
   tinha prova nenhuma. O que mora aqui e importa:

     · a deduplicação dos clientes conhecidos, que TEM de usar a
       mesma regra do lib/drive.js — senão a lista agrupa por uma
       e o Drive por outra, a pessoa escolhe um cliente e aparece
       outra pasta;
     · o TUDO OU NADA POR AMBIENTE ao trazer as fotos do Drive,
       que é a regra mais fácil de quebrar sem ninguém notar: o
       sintoma é a apresentação sair com as fotos de um ambiente
       em outra ordem, que não parece defeito, só uma
       apresentação pior.

   ------------------------------------------------------------
   COMO O ARQUIVO É CARREGADO AQUI

   `dados.js` é script CLÁSSICO: ele declara `const DADOS` e
   conta com `window`, `fetch`, `File` e um `import()` dinâmico do
   lib/chave.js. A prova monta esse mundo e avalia o texto do
   arquivo.

   ⚠️ O especificador do `import()` é reescrito para um endereço
   absoluto antes de avaliar. Dentro de um `new Function` o Node
   não tem como resolver './lib/chave.js' — ele resolveria contra
   o diretório de trabalho, e a prova passaria ou falharia
   dependendo de onde ela foi chamada.
   ============================================================ */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');


/* ============================================================
   O MUNDO FALSO
   ============================================================ */

/* O cliente do Supabase, só com o que o dados.js usa: a cadeia
   .from().select().order().limit().eq() e o await no fim. */
function fakeSupabase(linhasPorTabela) {
  const pedidos = [];

  function consulta(tabela) {
    const estado = { tabela: tabela, filtros: {}, select: null, limite: null, ordem: null };

    const q = {
      select: function (c) { estado.select = c; return q; },
      order:  function (c, o) { estado.ordem = [c, o]; return q; },
      limit:  function (n) { estado.limite = n; return q; },
      eq:     function (c, v) { estado.filtros[c] = v; return q; },
      ilike:  function (c, v) { estado.filtros[c + '~'] = v; return q; },
      single: function () { estado.single = true; return q; },

      /* `await q` entra aqui. */
      then: function (ok, erro) {
        pedidos.push(estado);

        let linhas = (linhasPorTabela[tabela] || []).slice();

        Object.keys(estado.filtros).forEach(function (c) {
          if (c.endsWith('~')) return;
          linhas = linhas.filter((l) => l[c] === estado.filtros[c]);
        });

        if (estado.ordem) {
          const [col, o] = estado.ordem;
          const asc = o && o.ascending;
          linhas.sort(function (a, b) {
            const x = String(a[col] || ''), y = String(b[col] || '');
            return asc ? (x < y ? -1 : x > y ? 1 : 0) : (x > y ? -1 : x < y ? 1 : 0);
          });
        }

        if (estado.limite) linhas = linhas.slice(0, estado.limite);

        /* ⚠️ Respeita o `select=`: coluna que o código não pediu
           NÃO volta. Dublê generoso aqui já custou caro neste
           projeto — a coluna `tipo` que faltava em
           /api/documento passou por isso. */
        if (estado.select && estado.select !== '*') {
          const cols = estado.select.split(',').map((x) => x.trim()).filter(Boolean);
          linhas = linhas.map(function (l) {
            const fora = {};
            cols.forEach((c) => { fora[c] = l[c]; });
            return fora;
          });
        }

        const r = estado.single
          ? { data: linhas[0] || null, error: linhas.length ? null : { message: 'nada' } }
          : { data: linhas, error: null };

        return Promise.resolve(r).then(ok, erro);
      }
    };
    return q;
  }

  return {
    pedidos: pedidos,
    from: consulta,
    auth: {
      getSession: async function () {
        return { data: { session: { access_token: 'tok-de-teste', user: { id: 'u-1' } } } };
      }
    }
  };
}


/* Carrega o dados.js num mundo montado. */
function carregarDados(base, mundo) {
  const caminho = join(base, 'dados.js');
  let texto = readFileSync(caminho, 'utf8');

  /* Ver o cabeçalho: dentro de `new Function` o Node não resolve
     um caminho relativo. */
  const urlChave = pathToFileURL(join(base, 'lib/chave.js')).href;
  const antes = texto;
  texto = texto.replace("'./lib/chave.js'", JSON.stringify(urlChave));

  if (texto === antes && antes.includes('./lib/chave.js')) {
    throw new Error('não reescrevi o caminho do chave.js — a prova rodaria '
      + 'contra o diretório de trabalho');
  }

  const fn = new Function(
    'window', 'fetch', 'File', 'Blob', 'FormData', 'console', 'localStorage',
    texto + '\n;return DADOS;');

  return fn(mundo.window, mundo.fetch, File, Blob, FormData,
            mundo.console || console, mundo.localStorage || {});
}


function mundoCom(linhasPorTabela, aoChamarApi) {
  const sb = fakeSupabase(linhasPorTabela || {});
  const chamadas = [];

  return {
    sb: sb,
    chamadas: chamadas,
    window: { dalmobileAuth: { cliente: sb, usuario: { id: 'u-1' } } },
    console: { warn: function () {}, error: function () {}, log: function () {} },
    fetch: async function (endereco, opcoes) {
      chamadas.push({ url: String(endereco), opcoes: opcoes || {} });
      if (aoChamarApi) return await aoChamarApi(String(endereco), opcoes || {});
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
  };
}


/* ============================================================
   O arreio
   ============================================================ */
const PROVAS = [];
function prova(nome, corpo) { PROVAS.push({ nome, corpo }); }

function igual(a, b, oque) {
  if (a !== b) throw new Error((oque || 'valor') + ': esperava '
    + JSON.stringify(b) + ', veio ' + JSON.stringify(a));
}
function certo(v, oque) { if (!v) throw new Error('esperava verdadeiro: ' + (oque || '')); }
function iguais(a, b, oque) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error((oque || 'lista') + ':\n      esperava ' + y + '\n      veio     ' + x);
}

function foto(nome, tamanho) {
  const bytes = new Uint8Array(tamanho || 256);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  return new File([bytes], nome || 'cozinha.jpg', { type: 'image/jpeg' });
}


/* ============================================================
   CLIENTES CONHECIDOS
   ============================================================ */

prova('1. o mesmo cliente digitado de formas diferentes aparece UMA vez', async (base) => {
  const m = mundoCom({ trabalhos: [
    { cliente: 'Carlos e Bia', atualizado_em: '2026-03-01', tipo: 'apresentacao' },
    { cliente: 'carlos e bia', atualizado_em: '2026-02-01', tipo: 'apresentacao' },
    { cliente: 'CARLOS E BIA', atualizado_em: '2026-01-01', tipo: 'apresentacao' },
    { cliente: 'Cárlos e Bia', atualizado_em: '2025-12-01', tipo: 'apresentacao' },
    { cliente: 'Ana e Rui',    atualizado_em: '2026-04-01', tipo: 'apresentacao' }
  ]});

  const DADOS = carregarDados(base, m);
  const lista = await DADOS.clientesConhecidos('apresentacao');

  /* Quatro grafias do mesmo casal e uma de outro: dois clientes.
     Sem a deduplicação a lista teria cinco linhas, e quem
     escolhesse a "errada" criaria uma segunda pasta no Drive. */
  iguais(lista, ['Ana e Rui', 'Carlos e Bia'], 'os clientes');
});


prova('2. a grafia que fica é a MAIS RECENTE', async (base) => {
  const m = mundoCom({ trabalhos: [
    { cliente: 'carlos e bia', atualizado_em: '2026-09-01', tipo: 'apresentacao' },
    { cliente: 'Carlos e Bia', atualizado_em: '2026-01-01', tipo: 'apresentacao' }
  ]});

  const DADOS = carregarDados(base, m);
  const lista = await DADOS.clientesConhecidos('apresentacao');

  /* A que a pessoa acabou de usar é a que ela reconhece. A pasta
     no Drive pode ter o nome de uma grafia antiga, e tanto faz:
     lá a identidade é o id, não o nome. */
  iguais(lista, ['carlos e bia'], 'a grafia mais recente');
});


prova('3. nomes vazios não entram na lista', async (base) => {
  const m = mundoCom({ trabalhos: [
    { cliente: '',    atualizado_em: '2026-03-01', tipo: 'apresentacao' },
    { cliente: '   ', atualizado_em: '2026-02-01', tipo: 'apresentacao' },
    { cliente: null,  atualizado_em: '2026-01-01', tipo: 'apresentacao' },
    { cliente: '---', atualizado_em: '2026-01-01', tipo: 'apresentacao' },
    { cliente: 'Ana', atualizado_em: '2026-04-01', tipo: 'apresentacao' }
  ]});

  const DADOS = carregarDados(base, m);

  /* '---' tem texto mas chave vazia: não distingue nada, e viraria
     uma opção em branco na lista. */
  iguais(await DADOS.clientesConhecidos('apresentacao'), ['Ana'], 'só o que é nome');
});


prova('4. a lista sai em ordem alfabética de gente, não de byte', async (base) => {
  const m = mundoCom({ trabalhos: [
    { cliente: 'Zuleica',  atualizado_em: '2026-01-01', tipo: 'apresentacao' },
    { cliente: 'Álvaro',   atualizado_em: '2026-01-02', tipo: 'apresentacao' },
    { cliente: 'Beatriz',  atualizado_em: '2026-01-03', tipo: 'apresentacao' }
  ]});

  const DADOS = carregarDados(base, m);

  /* Á antes de B. Ordenando por byte, "Álvaro" cairia depois de
     "Zuleica" e a pessoa não acharia na lista. */
  iguais(await DADOS.clientesConhecidos('apresentacao'),
    ['Álvaro', 'Beatriz', 'Zuleica'], 'ordem');
});


prova('5. pergunta só o tipo pedido, e espera a sessão antes', async (base) => {
  const m = mundoCom({ trabalhos: [
    { cliente: 'Ana', atualizado_em: '2026-01-01', tipo: 'apresentacao' },
    { cliente: 'Rui', atualizado_em: '2026-01-02', tipo: 'orcamento' }
  ]});

  const DADOS = carregarDados(base, m);
  iguais(await DADOS.clientesConhecidos('apresentacao'), ['Ana'], 'só apresentações');

  const p = m.sb.pedidos[0];
  igual(p.tabela, 'trabalhos', 'a tabela');
  igual(p.filtros.tipo, 'apresentacao', 'o filtro de tipo');

  /* ⚠️ Não pede coluna que não usa. `dados` é jsonb e numa
     apresentação de 20 fotos ele é grande: trazer 500 deles para
     montar uma lista de nomes seria megabytes por abertura de
     tela, na internet da loja. */
  certo(p.select && p.select !== '*',
    'o select é explícito, não "*": ' + p.select);
  certo(!/\bdados\b/.test(p.select),
    'e não pede a coluna dados: ' + p.select);
});


/* ============================================================
   TRAZER AS FOTOS — TUDO OU NADA POR AMBIENTE
   ============================================================ */

prova('6. ambiente COMPLETO vem do Drive e não pede reposição', async (base) => {
  const m = mundoCom({}, async function () {
    return new Response(new Uint8Array(100), {
      status: 200,
      headers: { 'content-type': 'image/jpeg',
                 'content-disposition': 'inline; filename="foto-01-x.jpg"' }
    });
  });

  const DADOS = carregarDados(base, m);

  const ambientes = [{ uid: 'a1', nome: 'Cozinha', imagens: [],
                       marcas: [{ nome: 'c1.jpg', tamanho: 1 },
                                { nome: 'c2.jpg', tamanho: 2 }] }];

  const conta = await DADOS.trazerFotos('t-1', ambientes);

  igual(conta.trazidas, 2, 'as duas vieram');
  igual(ambientes[0].imagens.length, 2, 'as duas no lugar');
  iguais(ambientes[0].marcas, [], 'nada a repor');
});


prova('7. ambiente INCOMPLETO cai INTEIRO na reposição', async (base) => {
  /* A segunda foto não está no Drive. */
  let n = 0;
  const m = mundoCom({}, async function () {
    n++;
    if (n === 2) return new Response('não achei', { status: 404 });
    return new Response(new Uint8Array(100), {
      status: 200, headers: { 'content-type': 'image/jpeg' }
    });
  });

  const DADOS = carregarDados(base, m);

  const marcas = [{ nome: 'c1.jpg', tamanho: 1 },
                  { nome: 'c2.jpg', tamanho: 2 },
                  { nome: 'c3.jpg', tamanho: 3 }];
  const ambientes = [{ uid: 'a1', nome: 'Cozinha', imagens: [], marcas: marcas.slice() }];

  const conta = await DADOS.trazerFotos('t-1', ambientes);

  /* ⚠️ A REGRA. Aceitar as duas que vieram e pedir a que falta
     parece melhor, e não é: a que falta pode ser a PRIMEIRA, e a
     reposição acrescenta no fim. A apresentação sairia com as
     fotos daquele ambiente em outra ordem — a de detalhe
     abrindo, a geral no fim — e ninguém veria erro nenhum, só
     uma apresentação pior. */
  igual(conta.trazidas, 0, 'não aproveita pela metade');
  igual(ambientes[0].imagens.length, 0, 'nenhuma foto meia-boca entrou');
  igual(ambientes[0].marcas.length, 3, 'a reposição pede o ambiente inteiro');
});


prova('8. um ambiente completo e outro não: cada um no seu caminho', async (base) => {
  const m = mundoCom({}, async function (url) {
    /* O ambiente a2 não tem nada no Drive. */
    if (/a2/.test(url)) return new Response('não achei', { status: 404 });
    return new Response(new Uint8Array(100), {
      status: 200, headers: { 'content-type': 'image/jpeg' }
    });
  });

  const DADOS = carregarDados(base, m);

  const ambientes = [
    { uid: 'a1', nome: 'Cozinha', imagens: [], marcas: [{ nome: 'c.jpg', tamanho: 1 }] },
    { uid: 'a2', nome: 'Suíte',   imagens: [], marcas: [{ nome: 's.jpg', tamanho: 2 }] }
  ];

  await DADOS.trazerFotos('t-1', ambientes);

  igual(ambientes[0].imagens.length, 1, 'cozinha veio do Drive');
  iguais(ambientes[0].marcas, [], 'cozinha não pede nada');

  igual(ambientes[1].imagens.length, 0, 'suíte não veio');
  igual(ambientes[1].marcas.length, 1, 'suíte vai para a reposição');
});


prova('9. Drive desligado (503): nada vem e a tela segue como antes', async (base) => {
  const m = mundoCom({}, async function () {
    return new Response('{"erro":"desligado"}', { status: 503 });
  });

  const DADOS = carregarDados(base, m);
  const ambientes = [{ uid: 'a1', imagens: [], marcas: [{ nome: 'c.jpg', tamanho: 1 }] }];

  const conta = await DADOS.trazerFotos('t-1', ambientes);

  certo(conta.desligado, 'avisou que está desligado');
  igual(ambientes[0].marcas.length, 1, 'a reposição pelo nome assume');
});


prova('10. o ambiente sem uid é ignorado, não estoura', async (base) => {
  const m = mundoCom({});
  const DADOS = carregarDados(base, m);

  /* Apresentação salva antes do uid existir, reaberta antes de a
     tela ter posto um. Pedir foto sem saber o ambiente pediria
     qualquer coisa. */
  const ambientes = [{ nome: 'Cozinha', imagens: [], marcas: [{ nome: 'c.jpg', tamanho: 1 }] }];
  const conta = await DADOS.trazerFotos('t-1', ambientes);

  igual(conta.trazidas, 0, 'nada trazido');
  igual(m.chamadas.length, 0, 'nem chamou o servidor');
});


/* ============================================================
   GUARDAR AS FOTOS
   ============================================================ */

prova('11. a foto sobe REDUZIDA, pela função que a tela passa', async (base) => {
  const subiram = [];
  const m = mundoCom({}, async function (url, opcoes) {
    const f = opcoes.body;
    const arq = f.get('arquivo');
    subiram.push({ nome: arq.name, tamanho: arq.size });
    return new Response('{"ok":true}', { status: 200 });
  });

  const DADOS = carregarDados(base, m);

  const ambientes = [{ uid: 'a1', imagens: [foto('render4k.png', 9000)] }];

  /* ⚠️ `a.imagens` guarda os ORIGINAIS escolhidos no disco: render
     de 4K pesa vários MB, e 20 deles passariam de 150 MB de
     subida pela internet da loja, no meio do atendimento. */
  const conta = await DADOS.guardarFotos('t-1', ambientes, null,
    async function (arquivo) { return new Blob([new Uint8Array(300)], { type: 'image/jpeg' }); });

  igual(conta.guardadas, 1, 'subiu');
  igual(subiram.length, 1, 'uma subida');
  igual(subiram[0].tamanho, 300, 'o tamanho REDUZIDO, não os 9000 do original');
  igual(subiram[0].nome, 'render4k.jpg', 'e com extensão .jpg, porque o que sobe é JPEG');
});


prova('12. salvar duas vezes não sobe a mesma foto de novo', async (base) => {
  let subidas = 0;
  const m = mundoCom({}, async function () {
    subidas++;
    return new Response('{"ok":true}', { status: 200 });
  });

  const DADOS = carregarDados(base, m);
  const ambientes = [{ uid: 'a1', imagens: [foto('c.jpg', 500)] }];
  const reduzir = async () => new Blob([new Uint8Array(100)], { type: 'image/jpeg' });

  await DADOS.guardarFotos('t-1', ambientes, null, reduzir);
  const segunda = await DADOS.guardarFotos('t-1', ambientes, null, reduzir);

  igual(subidas, 1, 'uma subida só');
  igual(segunda.guardadas, 0, 'o segundo salvamento não tinha nada a fazer');
});


prova('13. endpoint caindo NÃO derruba o salvamento: conta e segue', async (base) => {
  const m = mundoCom({}, async function () {
    return new Response('{"erro":"ops"}', { status: 500 });
  });

  const DADOS = carregarDados(base, m);
  const ambientes = [{ uid: 'a1', imagens: [foto('c.jpg'), foto('d.jpg')] }];

  /* Quem chama isto acabou de salvar a apresentação com sucesso.
     Estourar aqui trocaria "as fotos não subiram" por "o
     salvamento falhou", e o consultor refaria o trabalho. */
  const conta = await DADOS.guardarFotos('t-1', ambientes, null,
    async () => new Blob([new Uint8Array(10)], { type: 'image/jpeg' }));

  igual(conta.falharam, 2, 'contou as duas falhas');
  igual(conta.guardadas, 0, 'nenhuma guardada');
});


prova('14. redução que estoura não leva o salvamento com ela', async (base) => {
  const m = mundoCom({}, async function () {
    return new Response('{"ok":true}', { status: 200 });
  });

  const DADOS = carregarDados(base, m);
  const ambientes = [{ uid: 'a1', imagens: [foto('quebrada.jpg'), foto('boa.jpg')] }];

  /* O catch externo de `subirUma` já evitaria o estouro, então o
     RESULTADO é o mesmo com ou sem o catch da redução. O que o
     catch específico entrega é o NOME DO ARQUIVO no aviso — e com
     20 fotos numa apresentação, saber qual delas quebrou é a
     diferença entre consertar e procurar no escuro. Por isso a
     prova olha o aviso, não só a contagem. */
  const dito = [];
  m.console.warn = function (x) { dito.push(String(x)); };

  let vez = 0;
  const conta = await DADOS.guardarFotos('t-1', ambientes, null, async function () {
    vez++;
    if (vez === 1) throw new Error('imagem corrompida');
    return new Blob([new Uint8Array(10)], { type: 'image/jpeg' });
  });

  igual(conta.falharam, 1, 'a quebrada contou como falha');
  igual(conta.guardadas, 1, 'e a boa subiu do mesmo jeito');

  const junto = dito.join(' | ');
  certo(/quebrada\.jpg/.test(junto),
    'o aviso nomeia o arquivo que quebrou: ' + junto);
});


prova('15. sem trabalho salvo não sobe nada', async (base) => {
  const m = mundoCom({});
  const DADOS = carregarDados(base, m);

  const conta = await DADOS.guardarFotos(null, [{ uid: 'a1', imagens: [foto('c.jpg')] }]);
  igual(conta.guardadas, 0, 'nada');
  igual(m.chamadas.length, 0, 'nem chamou');
});


/* ============================================================
   OS DEFEITOS
   ============================================================ */
const DEFEITOS = [
  { nome: 'a deduplicação dos clientes cai: o mesmo cliente várias vezes',
    arquivo: 'dados.js',
    de: `      const k = chaveDe(nome);`,
    para: `      const k = nome;` },

  { nome: 'a lista passa a guardar a grafia mais ANTIGA',
    arquivo: 'dados.js',
    de: `      .order('atualizado_em', { ascending: false })
      .limit(500);`,
    para: `      .order('atualizado_em', { ascending: true })
      .limit(500);` },

  { nome: 'a lista sai ordenada por byte: nome com acento vai para o fim',
    arquivo: 'dados.js',
    de: `      .sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });`,
    para: `      .sort();` },

  { nome: 'a lista passa a trazer o jsonb inteiro de 500 trabalhos',
    arquivo: 'dados.js',
    de: `      .select('cliente, atualizado_em')
      .order('atualizado_em', { ascending: false })`,
    para: `      .select('*')
      .order('atualizado_em', { ascending: false })` },

  { nome: 'o tudo-ou-nada cai: ambiente pela metade embaralha a ordem',
    arquivo: 'dados.js',
    de: `      if (completo) {
        a.imagens = baixadas.slice(0, quantas);
        a.marcas  = [];                 /* nada a repor */`,
    para: `      if (true) {
        a.imagens = baixadas.filter(Boolean);
        a.marcas  = [];                 /* nada a repor */` },

  { nome: 'a foto sobe o ORIGINAL: 150 MB por apresentação',
    arquivo: 'dados.js',
    de: `        let corpo = item.arquivo;
        if (reduzir) {`,
    para: `        let corpo = item.arquivo;
        if (false) {` },

  { nome: 'a marca do que já está no Drive sai: tudo sobe a cada salvamento',
    arquivo: 'dados.js',
    de: `        if (f.__doDrive === ordem) return;`,
    para: `        if (false) return;` },

  { nome: 'o ambiente sem uid passa a ser pedido ao servidor',
    arquivo: 'dados.js',
    de: `      if (!a || !a.uid) return;
      const quantas = (a.marcas && a.marcas.length) || 0;`,
    para: `      if (!a) return;
      const quantas = (a.marcas && a.marcas.length) || 0;` },

  { nome: 'a redução que estoura passa a derrubar o salvamento',
    arquivo: 'dados.js',
    de: `          try { corpo = await reduzir(item.arquivo); }
          catch (e) {`,
    para: `          try { corpo = await reduzir(item.arquivo); }
          catch (e) { throw e; }
          if (false) {` },

  { nome: 'a extensão não vira .jpg: um .png contendo JPEG',
    arquivo: 'dados.js',
    de: `        forma.append('arquivo', corpo, nomeJpeg(item.arquivo.name));`,
    para: `        forma.append('arquivo', corpo, item.arquivo.name);` }
];


/* ============================================================
   RODAR
   ============================================================ */
async function rodarSuite(base, silencioso) {
  const vermelhas = [];

  for (const p of PROVAS) {
    try {
      await p.corpo(base);
      if (!silencioso) console.log('  ✓ ' + p.nome);
    } catch (e) {
      vermelhas.push({ nome: p.nome, erro: (e && e.message) || String(e) });
      if (!silencioso) console.log('  ✗ ' + p.nome + '\n      ' + ((e && e.message) || e));
    }
  }
  return vermelhas;
}

function limpar(p) { try { rmSync(p, { recursive: true, force: true }); } catch (e) {} }

async function principal() {
  console.log('\nPROVAS DO dados.js\n' + '-'.repeat(62));
  const vermelhas = await rodarSuite(RAIZ, false);

  console.log('-'.repeat(62));
  console.log(vermelhas.length
    ? '✗ ' + vermelhas.length + ' de ' + PROVAS.length + ' vermelhas'
    : '✓ as ' + PROVAS.length + ' provas passaram');

  if (vermelhas.length) process.exit(1);

  if (!process.argv.includes('--defeitos')) {
    console.log('\nProva verde não diz o que ela pega. Rode também:');
    console.log('    node provas/provar-dados.mjs --defeitos\n');
    return;
  }

  console.log('\n\nREINTRODUZINDO OS DEFEITOS\n' + '-'.repeat(62));
  let impunes = 0;

  for (const d of DEFEITOS) {
    const sao    = mkdtempSync(join(tmpdir(), 'provas-dados-sao-'));
    const doente = mkdtempSync(join(tmpdir(), 'provas-dados-doente-'));

    for (const b of [sao, doente]) {
      cpSync(join(RAIZ, 'dados.js'), join(b, 'dados.js'));
      cpSync(join(RAIZ, 'lib'), join(b, 'lib'), { recursive: true });
    }

    const alvo = join(doente, d.arquivo);
    const texto = readFileSync(alvo, 'utf8');

    if (!texto.includes(d.de)) {
      console.log('  ! DESATUALIZADO: ' + d.nome);
      console.log('      o trecho não existe mais em ' + d.arquivo);
      impunes++;
      limpar(sao); limpar(doente);
      continue;
    }
    writeFileSync(alvo, texto.replace(d.de, d.para));

    const baseVerde = await rodarSuite(sao, true);
    const quebrou   = await rodarSuite(doente, true);
    limpar(sao); limpar(doente);

    if (baseVerde.length) {
      console.log('  ! ARREIO QUEBRADO em "' + d.nome + '"');
      console.log('      a cópia SEM defeito já deu ' + baseVerde.length
        + ' vermelhas (' + baseVerde[0].nome + ')');
      impunes++;
      continue;
    }

    if (quebrou.length) {
      console.log('  ✓ ' + d.nome);
      console.log('      ' + quebrou.length + ' vermelha(s) — ' + quebrou[0].nome);
    } else {
      console.log('  ✗ IMPUNE: ' + d.nome);
      console.log('      nenhuma prova viu. Falta uma prova, não sobra um defeito.');
      impunes++;
    }
  }

  console.log('-'.repeat(62));
  if (impunes) {
    console.log('✗ ' + impunes + ' de ' + DEFEITOS.length + ' defeitos não foram pegos');
    process.exit(1);
  }
  console.log('✓ os ' + DEFEITOS.length + ' defeitos foram pegos\n');
}

principal().catch(function (e) {
  console.error('\nA SUÍTE CAIU: ' + ((e && e.stack) || e));
  process.exit(1);
});

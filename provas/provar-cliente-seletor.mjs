/* ============================================================
   PROVAS DO SELETOR DE CLIENTE — Dalmóbile
   ------------------------------------------------------------
       node provas/provar-cliente-seletor.mjs
       node provas/provar-cliente-seletor.mjs --defeitos

   Abre o projeto.html num navegador de verdade (Playwright) e
   mexe na tela. Lógica de interface com quatro estados não se
   confere lendo: se eu só lesse, entregaria o estado em que o
   botão desaparece e a pessoa fica presa no campo livre.

   ⚠️ A REDE DO SUPABASE É BLOQUEADA DE PROPÓSITO. A prova não
   tem banco, e não precisa: o que ela verifica é a tela. A lista
   é injetada por cima do `DADOS.clientesConhecidos`, e o
   bloqueio garante que nenhuma prova dependa de um servidor que
   não existe aqui — se dependesse, ela passaria na minha máquina
   e falharia na sua.
   ============================================================ */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm, cp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, extname } from 'node:path';
/* ⚠️ O PLAYWRIGHT PODE NÃO EXISTIR AQUI, e esta suíte é a única
   que depende dele — as outras duas rodam com Node puro.

   Quando ele falta, esta suíte AVISA ALTO e sai com código 0.
   Sair com erro faria o CI vermelho por falta de ferramenta, e
   sair calado seria pior: alguém leria "0 vermelhas" e acharia
   que a tela foi conferida. Ela não foi.

       npm i -D playwright && npx playwright install chromium   */
async function pegarChromium() {
  const tentativas = [
    'playwright',
    '/opt/npm-tools/node_modules/playwright/index.js',
    'playwright-core'
  ];

  for (const q of tentativas) {
    try {
      const m = await import(q);
      if (m && (m.chromium || (m.default && m.default.chromium))) {
        return m.chromium || m.default.chromium;
      }
    } catch (e) { /* tenta o próximo */ }
  }
  return null;
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf'
};


function servir(raiz) {
  return new Promise(function (ok) {
    const s = createServer(async function (req, res) {
      try {
        const caminho = decodeURIComponent(req.url.split('?')[0]);
        const arq = join(raiz, caminho === '/' ? '/projeto.html' : caminho);

        /* Não sair da raiz: a prova serve o repo, não o disco. */
        if (!resolve(arq).startsWith(resolve(raiz))) {
          res.writeHead(403).end('fora'); return;
        }

        const corpo = await readFile(arq);
        res.writeHead(200, { 'content-type': TIPOS[extname(arq)] || 'application/octet-stream' });
        res.end(corpo);
      } catch (e) {
        res.writeHead(404).end('não achei');
      }
    });
    s.listen(0, '127.0.0.1', function () { ok(s); });
  });
}


const PROVAS = [];
function prova(nome, corpo) { PROVAS.push({ nome, corpo }); }

function igual(a, b, oque) {
  if (a !== b) throw new Error((oque || 'valor') + ': esperava '
    + JSON.stringify(b) + ', veio ' + JSON.stringify(a));
}
function certo(v, oque) { if (!v) throw new Error('esperava verdadeiro: ' + (oque || '')); }
function errado(v, oque) { if (v) throw new Error('esperava falso: ' + (oque || '')); }


/* Abre a tela e devolve um punhado de atalhos. */
async function abrirTela(navegador, endereco) {
  const pagina = await navegador.newPage();

  /* Sem banco e sem CDN que a prova não precise: a tela tem de
     se montar de qualquer forma. */
  await pagina.route('**://*.supabase.co/**', (r) => r.abort());

  const avisos = [];
  pagina.on('console', (m) => avisos.push(m.text()));

  await pagina.goto(endereco, { waitUntil: 'domcontentloaded' });

  await pagina.waitForSelector('#cliente-lista', { state: 'attached' });

  /* A tela de entrada e a trava cobrem a página até o auth
     decidir, e com o Supabase bloqueado ele nunca decide: todo
     clique da prova bateria nelas em vez de no botão.

     Tirá-las é legítimo porque NÃO É O QUE ESTÁ SOB TESTE — o
     login tem o auth.js e a vida real para responder por ele.
     Deixá-las faria a prova medir o overlay. */
  await pagina.evaluate(function () {
    ['tela-entrada', 'trava-entrada'].forEach(function (id) {
      const e = document.getElementById(id);
      if (e) e.remove();
    });
  });

  const t = {
    pagina: pagina,
    avisos: avisos,

    /* Injeta a lista por cima do banco e remonta o seletor.

       `DADOS` e não `window.DADOS`: ele é `const` num script
       clássico, então vive no escopo do script e NÃO é
       propriedade de window. O nome nu alcança daqui; o
       `window.` não — e o erro sai como "Cannot set properties
       of undefined", que não aponta para nada. */
    comLista: (nomes) => pagina.evaluate(async function (ns) {
      DADOS.clientesConhecidos = async function () { return ns; };
      await montarClientes();
    }, nomes),

    comFalha: () => pagina.evaluate(async function () {
      DADOS.clientesConhecidos = async function () {
        throw new Error('sem internet');
      };
      await montarClientes();
    }),

    estado: () => pagina.evaluate(function () {
      const sel = document.getElementById('cliente-lista');
      const inp = document.getElementById('cliente');
      const bot = document.getElementById('cliente-trocar');
      const rot = document.querySelector('label[for="cliente-lista"], label[for="cliente"]');
      return {
        listaAMostra: !sel.hidden,
        campoAMostra: !inp.hidden,
        botaoAMostra: !bot.hidden,
        botaoDiz: bot.textContent.trim(),
        opcoes: Array.from(sel.options).map((o) => o.value).filter(Boolean),
        selecionado: sel.value,
        valor: inp.value,
        nota: (document.getElementById('cliente-nota') || {}).textContent || '',
        rotuloAponta: rot ? rot.getAttribute('for') : null
      };
    }),

    clicarTrocar: () => pagina.click('#cliente-trocar'),

    escolher: (nome) => pagina.selectOption('#cliente-lista', nome),

    digitar: (texto) => pagina.fill('#cliente', texto),

    /* O que o resto do arquivo lê. É a fonte da verdade, e a
       prova tem de olhar ELA, não o que está na tela. */
    valorQueSalva: () => pagina.evaluate(function () {
      return document.getElementById('cliente').value;
    }),

    fechar: () => pagina.close()
  };

  return t;
}


/* ============================================================
   AS PROVAS
   ============================================================ */

prova('1. com clientes conhecidos, a lista manda e o campo se esconde', async (t) => {
  await t.comLista(['Ana e Rui', 'Carlos e Bia']);
  const e = await t.estado();

  certo(e.listaAMostra, 'a lista aparece');
  errado(e.campoAMostra, 'o campo livre fica escondido');
  igual(e.botaoDiz, '+ novo', 'o botão oferece cadastrar');
  igual(e.opcoes.length, 2, 'as duas opções');
  igual(e.rotuloAponta, 'cliente-lista', 'o rótulo aponta para o que está à mostra');
});


prova('2. escolher da lista escreve no campo que o salvamento lê', async (t) => {
  await t.comLista(['Ana e Rui', 'Carlos e Bia']);
  await t.escolher('Carlos e Bia');

  igual(await t.valorQueSalva(), 'Carlos e Bia',
    'o #cliente é a fonte da verdade do resto do arquivo');
});


prova('3. "+ novo" abre o campo LIMPO', async (t) => {
  await t.comLista(['Ana e Rui', 'Carlos e Bia']);
  await t.escolher('Carlos e Bia');
  await t.clicarTrocar();

  const e = await t.estado();
  certo(e.campoAMostra, 'o campo aparece');
  errado(e.listaAMostra, 'a lista se esconde');

  /* ⚠️ LIMPO, e isto é a prova que importa aqui: sobrando o nome
     escolhido antes, a pessoa digitaria em cima dele e sairia um
     cliente quase igual — "Carlos e Bia Reforma" —, que é
     exatamente o cliente repetido que o seletor veio impedir. */
  igual(e.valor, '', 'o campo vem vazio');
  igual(await t.valorQueSalva(), '', 'e o valor que salva também');

  igual(e.botaoDiz, 'escolher da lista', 'o botão oferece voltar');
  igual(e.rotuloAponta, 'cliente', 'o rótulo acompanha');
});


prova('4. dá para voltar da lista: ninguém fica preso no campo livre', async (t) => {
  await t.comLista(['Ana e Rui']);
  await t.clicarTrocar();
  certo((await t.estado()).campoAMostra, 'está no campo');

  await t.clicarTrocar();
  const e = await t.estado();
  certo(e.listaAMostra, 'voltou para a lista');
  igual(e.botaoDiz, '+ novo', 'e o botão voltou a oferecer cadastro');
});


prova('5. digitar um nome novo chega ao valor que salva', async (t) => {
  await t.comLista(['Ana e Rui']);
  await t.clicarTrocar();
  await t.digitar('Joana e Pedro');

  igual(await t.valorQueSalva(), 'Joana e Pedro', 'o nome digitado');
});


prova('6. sem nenhum cliente ainda, começa no campo e sem botão para lugar nenhum',
  async (t) => {
    await t.comLista([]);
    const e = await t.estado();

    certo(e.campoAMostra, 'o campo aparece');
    errado(e.listaAMostra, 'a lista não');

    /* Com a lista vazia, "escolher da lista" levaria a uma lista
       sem nada. Botão que não faz nada é pior que botão nenhum:
       a pessoa clica, não acontece, e ela deixa de confiar no
       resto da tela. */
    errado(e.botaoAMostra, 'o botão se esconde');
    certo(/[Nn]enhum cliente/.test(e.nota), 'a nota explica: ' + e.nota);
  });


prova('7. lista que não carrega CAI NO CAMPO LIVRE, não trava a tela', async (t) => {
  await t.comFalha();
  const e = await t.estado();

  /* Falhar para frente. Sem internet, sessão expirada, o que for:
     a tela volta a ser a de antes do seletor existir. Um seletor
     que impede salvar porque não conseguiu listar seria pior que
     seletor nenhum — o consultor está com o cliente na frente. */
  certo(e.campoAMostra, 'o campo livre assume');
  certo(/grafia|não consegui/i.test(e.nota), 'e a nota avisa: ' + e.nota);

  await t.digitar('Cliente Novo');
  igual(await t.valorQueSalva(), 'Cliente Novo', 'e dá para trabalhar');
});


prova('8. abrir um trabalho salvo ajusta a tela ao cliente dele', async (t) => {
  await t.comLista(['Ana e Rui', 'Carlos e Bia']);

  /* Cliente que ESTÁ na lista: a lista mostra ele. */
  await t.pagina.evaluate(function () {
    document.getElementById('cliente').value = 'Carlos e Bia';
    sincronizarCliente();
  });

  let e = await t.estado();
  certo(e.listaAMostra, 'mostra na lista');
  igual(e.selecionado, 'Carlos e Bia', 'selecionado');

  /* Cliente que NÃO está — renomeado, ou de antes do seletor.
     O campo livre mostra o que há, em vez de perder o nome. */
  await t.pagina.evaluate(function () {
    document.getElementById('cliente').value = 'Gente Antiga Ltda';
    sincronizarCliente();
  });

  e = await t.estado();
  certo(e.campoAMostra, 'cai no campo livre');
  igual(e.valor, 'Gente Antiga Ltda', 'e NÃO perde o nome que estava salvo');
});


prova('9. a lista não some ao trocar de modo e voltar', async (t) => {
  await t.comLista(['Ana e Rui', 'Carlos e Bia']);
  await t.clicarTrocar();
  await t.clicarTrocar();

  const e = await t.estado();
  igual(e.opcoes.length, 2, 'as opções continuam lá');
});


/* ============================================================
   OS DEFEITOS
   ============================================================ */
const DEFEITOS = [
  { nome: 'o "+ novo" deixa de limpar: sai cliente quase igual',
    arquivo: 'projeto.html',
    de: `    inpCliente.value = '';
    selCliente.value = '';
    modoCliente('novo');`,
    para: `    modoCliente('novo');` },

  { nome: 'escolher da lista não escreve no campo que salva',
    arquivo: 'projeto.html',
    de: `  inpCliente.value = selCliente.value;`,
    para: `  /* nada */` },

  { nome: 'a lista vazia mantém o botão que não leva a lugar nenhum',
    arquivo: 'projeto.html',
    de: `  btnCliente.hidden = novo && !clientesNaLista.length;   /* nada a voltar para */`,
    para: `  btnCliente.hidden = false;` },

  { nome: 'a falha ao listar deixa a tela na lista vazia em vez do campo',
    arquivo: 'projeto.html',
    de: `    modoCliente('novo');
  }
}

selCliente.addEventListener('change'`,
    para: `    modoCliente('lista');
  }
}

selCliente.addEventListener('change'` },

  { nome: 'abrir trabalho com cliente fora da lista perde o nome',
    arquivo: 'projeto.html',
    de: `  const igual = clientesNaLista.indexOf(valor);
  if (igual >= 0) {`,
    para: `  const igual = -1;
  if (igual >= 0) {` },

  { nome: 'o rótulo passa a apontar para um campo invisível',
    arquivo: 'projeto.html',
    de: `  if (rotulo) rotulo.setAttribute('for', novo ? 'cliente' : 'cliente-lista');`,
    para: `  if (rotulo) rotulo.setAttribute('for', 'cliente');` }
];

/* ⚠️ A DEDUPLICAÇÃO NÃO ESTÁ AQUI, de propósito: esta suíte troca
   o `DADOS.clientesConhecidos` por um dublê, então a regra de
   verdade nunca roda — o defeito ficaria impune por não ser
   exercitado, não por faltar prova. O lugar dele é o
   provar-dados.mjs, e é lá que ele está. */


/* ============================================================
   RODAR
   ============================================================ */
async function rodarSuite(base, silencioso, chromium) {
  const servidor = await servir(base);
  const porta = servidor.address().port;
  const endereco = 'http://127.0.0.1:' + porta + '/projeto.html';

  const navegador = await chromium.launch();
  const vermelhas = [];

  try {
    for (const p of PROVAS) {
      let t = null;
      try {
        t = await abrirTela(navegador, endereco);
        await p.corpo(t);
        if (!silencioso) console.log('  ✓ ' + p.nome);
      } catch (e) {
        vermelhas.push({ nome: p.nome, erro: (e && e.message) || String(e) });
        if (!silencioso) console.log('  ✗ ' + p.nome + '\n      ' + ((e && e.message) || e));
      } finally {
        if (t) { try { await t.fechar(); } catch (e) {} }
      }
    }
  } finally {
    await navegador.close();
    servidor.close();
  }

  return vermelhas;
}


async function principal() {
  console.log('\nPROVAS DO SELETOR DE CLIENTE\n' + '-'.repeat(62));

  const chromium = await pegarChromium();
  if (!chromium) {
    console.log('');
    console.log('  !! NÃO RODEI: falta o Playwright nesta máquina.');
    console.log('');
    console.log('     Esta suíte abre o projeto.html num navegador de verdade e');
    console.log('     mexe na tela — é a única forma de conferir a lógica do');
    console.log('     seletor, que tem quatro estados. Sem ela, o SELETOR DE');
    console.log('     CLIENTE ESTÁ SEM PROVA nesta máquina.');
    console.log('');
    console.log('     Para rodar:  npm i -D playwright');
    console.log('                  npx playwright install chromium');
    console.log('');
    console.log('     As outras duas suítes não dependem de nada e seguem valendo.');
    console.log('');
    return;
  }

  const vermelhas = await rodarSuite(RAIZ, false, chromium);

  console.log('-'.repeat(62));
  console.log(vermelhas.length
    ? '✗ ' + vermelhas.length + ' de ' + PROVAS.length + ' vermelhas'
    : '✓ as ' + PROVAS.length + ' provas passaram');

  if (vermelhas.length) process.exit(1);

  if (!process.argv.includes('--defeitos')) {
    console.log('\nProva verde não diz o que ela pega. Rode também:');
    console.log('    node provas/provar-cliente-seletor.mjs --defeitos\n');
    return;
  }

  console.log('\n\nREINTRODUZINDO OS DEFEITOS\n' + '-'.repeat(62));
  let impunes = 0;

  for (const d of DEFEITOS) {
    const sao    = await mkdtemp(join(tmpdir(), 'provas-seletor-sao-'));
    const doente = await mkdtemp(join(tmpdir(), 'provas-seletor-doente-'));

    /* A tela precisa do que ela carrega: os dois .js, o lib/ e o
       próprio html. */
    for (const base of [sao, doente]) {
      for (const q of ['projeto.html', 'dados.js', 'auth.js']) {
        await cp(join(RAIZ, q), join(base, q));
      }
      await cp(join(RAIZ, 'lib'), join(base, 'lib'), { recursive: true });
    }

    const alvo = join(doente, d.arquivo);
    const texto = readFileSync(alvo, 'utf8');

    if (!texto.includes(d.de)) {
      console.log('  ! DESATUALIZADO: ' + d.nome);
      console.log('      o trecho não existe mais em ' + d.arquivo);
      impunes++;
      await rm(sao, { recursive: true, force: true });
      await rm(doente, { recursive: true, force: true });
      continue;
    }
    await writeFile(alvo, texto.replace(d.de, d.para));

    const baseVerde = await rodarSuite(sao, true, chromium);
    const quebrou   = await rodarSuite(doente, true, chromium);

    await rm(sao, { recursive: true, force: true });
    await rm(doente, { recursive: true, force: true });

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

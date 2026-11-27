/* ============================================================
   PROVAS DO "O QUE MUDOU" — Dalmóbile
   ------------------------------------------------------------
       node provas/provar-mudancas.mjs
       node provas/provar-mudancas.mjs --defeitos

   O Checklist de Eletros é o documento em que a troca acontece:
   o cliente informa a geladeira, o projeto executivo é feito em
   cima daquela medida, e semanas depois ele compra outra. Até
   agora o documento não guardava versão nenhuma — tinha o
   estado de hoje e mais nada.

   Guardar, sozinho, não resolve: uma lista de "versão 1, versão
   2, versão 3" responde a mesma coisa que não guardar. A
   pergunta real é "o cliente mudou O QUÊ, e quando?", e quem
   responde é esta função. Por isso ela é a parte provada.
   ============================================================ */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');


/* ------------------------------------------------------------ */
const PROVAS = [];
function prova(nome, corpo) { PROVAS.push({ nome, corpo }); }

function igual(a, b, oque) {
  if (a !== b) throw new Error((oque || 'valor') + ': esperava '
    + JSON.stringify(b) + ', veio ' + JSON.stringify(a));
}
function certo(v, oque) { if (!v) throw new Error('esperava verdadeiro: ' + (oque || '')); }

/* Acha a mudança cujo `onde` contém o texto. Procurar por
   pedaço, e não pela string inteira, porque o `onde` junta
   ambiente, item e campo — e a prova não deve depender da
   pontuação entre eles. */
function achar(lista, pedaco) {
  const fora = lista.filter(function (m) { return m.onde.indexOf(pedaco) >= 0; });
  if (!fora.length) {
    throw new Error('não achei mudança em "' + pedaco + '". Veio: '
      + (lista.map(function (m) { return m.onde; }).join(' | ') || '(nada)'));
  }
  return fora[0];
}

function semMudancaEm(lista, pedaco) {
  const fora = lista.filter(function (m) { return m.onde.indexOf(pedaco) >= 0; });
  if (fora.length) {
    throw new Error('não devia haver mudança em "' + pedaco + '", mas veio: '
      + JSON.stringify(fora));
  }
}

/* Uma ficha de Checklist como o cliente preenche. */
function ficha(itens, extra) {
  return Object.assign({
    ambientes: [{ nome: 'Cozinha', itens: itens || [] }]
  }, extra || {});
}

function item(nome, campos) {
  return Object.assign({ item: nome }, campos || {});
}


/* ============================================================
   AS PROVAS
   ============================================================ */

prova('1. a troca de geladeira aparece, com o de e o para', (M) => {
  /* O caso que motivou tudo isto. */
  const antes  = ficha([item('Geladeira', { marca: 'Brastemp 420L', largura: '70' })]);
  const depois = ficha([item('Geladeira', { marca: 'Electrolux 390L', largura: '70' })]);

  const m = M.oQueMudou(antes, depois);
  const g = achar(m, 'Geladeira');

  igual(g.de, 'Brastemp 420L', 'o que era');
  igual(g.para, 'Electrolux 390L', 'o que passou a ser');
  certo(/modelo ou marca/.test(g.onde), 'diz qual campo: ' + g.onde);
});


prova('2. a medida que muda aparece sozinha, sem arrastar o resto', (M) => {
  const antes  = ficha([item('Geladeira', { marca: 'Brastemp', largura: '70', altura: '180' })]);
  const depois = ficha([item('Geladeira', { marca: 'Brastemp', largura: '76', altura: '180' })]);

  const m = M.oQueMudou(antes, depois);
  igual(m.length, 1, 'uma mudança só');
  certo(/largura/.test(m[0].onde), 'a largura');
  igual(m[0].de, '70', 'de');
  igual(m[0].para, '76', 'para');
});


prova('3. nada mudou: lista vazia', (M) => {
  const d = ficha([item('Geladeira', { marca: 'Brastemp', largura: '70' }),
                   item('Cooktop',   { marca: 'Fischer' })]);

  /* Cópia funda, para a prova não comparar o objeto consigo
     mesmo e passar por acidente. */
  igual(M.oQueMudou(d, JSON.parse(JSON.stringify(d))).length, 0, 'nenhuma mudança');
});


prova('4. espaço a mais não é mudança', (M) => {
  const antes  = ficha([item('Geladeira', { marca: 'Brastemp' })]);
  const depois = ficha([item('Geladeira', { marca: '  Brastemp  ' })]);

  /* Senão o histórico acusaria mudança toda vez que alguém
     tocasse no campo e saísse. */
  igual(M.oQueMudou(antes, depois).length, 0, 'espaço não conta');
});


prova('5. campo vazio que passa a ter valor, e o contrário', (M) => {
  const antes  = ficha([item('Geladeira', { marca: '' })]);
  const depois = ficha([item('Geladeira', { marca: 'Brastemp' })]);

  const a = achar(M.oQueMudou(antes, depois), 'Geladeira');
  igual(a.de, '', 'não havia nada antes');
  igual(a.para, 'Brastemp', 'passou a ter');

  const b = achar(M.oQueMudou(depois, antes), 'Geladeira');
  igual(b.de, 'Brastemp', 'tinha');
  igual(b.para, '', 'deixou de ter');
});


prova('6. ausente e vazio são a mesma coisa', (M) => {
  const antes  = ficha([item('Geladeira', {})]);
  const depois = ficha([item('Geladeira', { marca: '' })]);

  /* A tela grava o campo em branco às vezes e não grava outras.
     Acusar isso como mudança encheria o histórico de linhas que
     não aconteceram. */
  igual(M.oQueMudou(antes, depois).length, 0, 'sem mudança');
});


prova('7. item acrescentado e item retirado aparecem nomeados', (M) => {
  const antes  = ficha([item('Geladeira', { marca: 'Brastemp' })]);
  const depois = ficha([item('Geladeira', { marca: 'Brastemp' }),
                        item('Micro-ondas', { marca: 'Panasonic' })]);

  const a = achar(M.oQueMudou(antes, depois), 'Micro-ondas');
  igual(a.para, 'item acrescentado', 'acrescentado');

  const b = achar(M.oQueMudou(depois, antes), 'Micro-ondas');
  igual(b.de, 'item retirado', 'retirado');
});


prova('8. item inserido no MEIO não acusa o documento inteiro', (M) => {
  const antes = ficha([
    item('Geladeira', { marca: 'Brastemp' }),
    item('Cooktop',   { marca: 'Fischer' }),
    item('Forno',     { marca: 'Electrolux' })
  ]);
  const depois = ficha([
    item('Geladeira',   { marca: 'Brastemp' }),
    item('Micro-ondas', { marca: 'Panasonic' }),   /* entrou no meio */
    item('Cooktop',     { marca: 'Fischer' }),
    item('Forno',       { marca: 'Electrolux' })
  ]);

  /* ⚠️ A PROVA QUE PEGA O DEFEITO MAIS CARO. Comparando por
     POSIÇÃO, o item novo empurra todos os de baixo e a tela
     acusa o documento inteiro como mudado — trinta linhas
     vermelhas para uma linha que mudou de verdade. Quem lesse
     isso uma vez não leria de novo. */
  const m = M.oQueMudou(antes, depois);

  igual(m.length, 1, 'uma mudança só: ' + JSON.stringify(m));
  certo(/Micro-ondas/.test(m[0].onde), 'e é o item novo');

  semMudancaEm(m, 'Cooktop');
  semMudancaEm(m, 'Forno');
});


prova('9. "não tenho" marcado e desmarcado aparece', (M) => {
  const antes  = ficha([item('Lava-louças', { naoTenho: true })]);
  const depois = ficha([item('Lava-louças', { naoTenho: false, marca: 'Bosch' })]);

  const m = M.oQueMudou(antes, depois);
  const estado = achar(m, 'Lava-louças');
  igual(estado.de, 'não tem', 'era não tem');
  igual(estado.para, 'tem', 'passou a ter');
});


prova('10. item "não tem" dos dois lados não lista campo nenhum', (M) => {
  const antes  = ficha([item('Lava-louças', { naoTenho: true, largura: '60' })]);
  const depois = ficha([item('Lava-louças', { naoTenho: true, largura: '' })]);

  /* O cliente já disse que não existe. Listar "largura: 60 → "
     é ruído sobre um item que não vai ser instalado. */
  igual(M.oQueMudou(antes, depois).length, 0, 'nada a dizer');
});


prova('11. a declaração de "não tenho itens extras" vem em primeiro', (M) => {
  const antes  = ficha([item('Geladeira', { marca: 'Brastemp' })]);
  const depois = ficha([], { semItensExtras: true });

  const m = M.oQueMudou(antes, depois);

  /* É a mudança mais grave que existe aqui: esvazia o documento
     inteiro. Perdida no meio de uma lista, passaria batida. */
  certo(m.length >= 1, 'alguma mudança');
  igual(m[0].onde, 'Declaração', 'a declaração é a primeira');
  igual(m[0].para, 'não tem itens extras', 'o novo estado');
});


prova('12. o mesmo item em ambientes diferentes não se confunde', (M) => {
  const antes = { ambientes: [
    { nome: 'Cozinha',    itens: [item('Geladeira', { marca: 'Brastemp' })] },
    { nome: 'Área gourmet', itens: [item('Geladeira', { marca: 'Consul' })] }
  ]};
  const depois = { ambientes: [
    { nome: 'Cozinha',    itens: [item('Geladeira', { marca: 'Brastemp' })] },
    { nome: 'Área gourmet', itens: [item('Geladeira', { marca: 'Electrolux' })] }
  ]};

  const m = M.oQueMudou(antes, depois);
  igual(m.length, 1, 'uma mudança: ' + JSON.stringify(m));
  certo(/Área gourmet/.test(m[0].onde), 'e é a da área gourmet: ' + m[0].onde);
});


prova('13. os seis campos do item são todos comparados', (M) => {
  const cheio = { marca: 'a', link: 'b', largura: '1', altura: '2', prof: '3', obs: 'c' };
  const antes  = ficha([item('Geladeira', cheio)]);
  const depois = ficha([item('Geladeira',
    { marca: 'z', link: 'y', largura: '9', altura: '8', prof: '7', obs: 'x' })]);

  /* Um campo esquecido na lista é uma mudança que nunca
     aparece: o cliente troca o link do produto e o histórico
     jura que nada mudou. */
  igual(M.oQueMudou(antes, depois).length, 6, 'seis campos');

  M.CAMPOS_DO_ITEM.forEach(function (c) {
    certo(c.chave && c.rotulo, 'campo com chave e rótulo');
  });
  igual(M.CAMPOS_DO_ITEM.length, 6, 'a lista tem os seis');
});


prova('14. documento vazio dos dois lados não estoura', (M) => {
  igual(M.oQueMudou(null, null).length, 0, 'nulos');
  igual(M.oQueMudou({}, {}).length, 0, 'vazios');
  igual(M.oQueMudou(undefined, ficha([])).length, 0, 'um lado só');
  igual(M.oQueMudou({ ambientes: [null] }, { ambientes: [{ itens: [null] }] }).length, 0,
    'lixo dentro do jsonb');
});


prova('15. a ordem da lista é a da tela', (M) => {
  const antes  = ficha([item('Geladeira', { marca: 'a', largura: '1', obs: 'x' })]);
  const depois = ficha([item('Geladeira', { marca: 'z', largura: '9', obs: 'y' })]);

  const m = M.oQueMudou(antes, depois);
  const ordem = m.map(function (x) { return x.onde.split(' · ').pop(); });

  /* Os campos saem na ordem em que o cliente os viu. Em ordem
     alfabética, "largura" viria antes de "modelo ou marca" e a
     leitura deixaria de acompanhar a tela. */
  igual(ordem.join(','), 'modelo ou marca,largura,observação', 'a ordem');
});


/* ============================================================
   OS DEFEITOS
   ============================================================ */
const DEFEITOS = [
  { nome: 'a comparação volta a ser por POSIÇÃO',
    arquivo: 'lib/mudancas.js',
    de: `      m.set(((a.nome || '?') + ' · ' + (i.item || '?')), i);`,
    para: `      m.set(String(m.size), i);` },

  { nome: 'o ambiente sai da chave: o mesmo item em dois lugares se confunde',
    arquivo: 'lib/mudancas.js',
    de: `      m.set(((a.nome || '?') + ' · ' + (i.item || '?')), i);`,
    para: `      m.set(String(i.item || '?'), i);` },

  { nome: 'o espaço em branco volta a contar como mudança',
    arquivo: 'lib/mudancas.js',
    de: `  return String(v === undefined || v === null ? '' : v).trim();`,
    para: `  return String(v === undefined || v === null ? '' : v);` },

  { nome: 'ausente deixa de valer como vazio',
    arquivo: 'lib/mudancas.js',
    de: `  return String(v === undefined || v === null ? '' : v).trim();`,
    para: `  return String(v).trim();` },

  { nome: 'o item retirado deixa de aparecer',
    arquivo: 'lib/mudancas.js',
    de: `  antesItens.forEach(function (velho, chave) {
    if (!depoisItens.has(chave)) {
      fora.push({ onde: chave, de: 'item retirado', para: '' });
    }
  });`,
    para: `  /* nada */` },

  { nome: 'um campo some da lista comparada',
    arquivo: 'lib/mudancas.js',
    de: `  { chave: 'link',    rotulo: 'link' },`,
    para: `` },

  { nome: 'a declaração de "não tenho itens extras" deixa de ser olhada',
    arquivo: 'lib/mudancas.js',
    de: `  if (!!a.semItensExtras !== !!b.semItensExtras) {`,
    para: `  if (false) {` },

  { nome: 'a declaração para de vir em primeiro',
    arquivo: 'lib/mudancas.js',
    de: `  const antesItens  = porItem(a);
  const depoisItens = porItem(b);`,
    para: `  const antesItens  = porItem(a);
  const depoisItens = porItem(b);
  const guardada = fora.splice(0, fora.length);` },

  { nome: 'o "não tenho" para de ser comparado',
    arquivo: 'lib/mudancas.js',
    de: `    if (!!velho.naoTenho !== !!novo.naoTenho) {`,
    para: `    if (false) {` },

  { nome: 'item "não tem" dos dois lados volta a listar os campos',
    arquivo: 'lib/mudancas.js',
    de: `    if (velho.naoTenho && novo.naoTenho) return;`,
    para: `` },

  { nome: 'a ordem dos campos vira alfabética',
    arquivo: 'lib/mudancas.js',
    de: `    CAMPOS_DO_ITEM.forEach(function (c) {`,
    para: `    CAMPOS_DO_ITEM.slice().sort(function (x, y) {
      return x.rotulo.localeCompare(y.rotulo, 'pt-BR');
    }).forEach(function (c) {` },

  { nome: 'o ambiente nulo dentro do jsonb volta a estourar',
    arquivo: 'lib/mudancas.js',
    de: `    ((a && a.itens) || []).forEach(function (i) {
      if (!i) return;`,
    para: `    a.itens.forEach(function (i) {` }
];


/* ============================================================
   RODAR
   ============================================================ */
async function carregar(base) {
  /* `?v=` por carga e pasta nova por defeito: o Node guarda
     módulo em cache pelo caminho. */
  return await import(pathToFileURL(join(base, 'lib/mudancas.js')).href + '?v=' + Math.random());
}

async function rodarSuite(base, silencioso) {
  let M;
  try { M = await carregar(base); }
  catch (e) { return [{ nome: 'o módulo nem carrega', erro: (e && e.message) || String(e) }]; }

  const vermelhas = [];
  for (const p of PROVAS) {
    try {
      p.corpo(M);
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
  console.log('\nPROVAS DO "O QUE MUDOU"\n' + '-'.repeat(62));
  const vermelhas = await rodarSuite(RAIZ, false);

  console.log('-'.repeat(62));
  console.log(vermelhas.length
    ? '✗ ' + vermelhas.length + ' de ' + PROVAS.length + ' vermelhas'
    : '✓ as ' + PROVAS.length + ' provas passaram');

  if (vermelhas.length) process.exit(1);

  if (!process.argv.includes('--defeitos')) {
    console.log('\nProva verde não diz o que ela pega. Rode também:');
    console.log('    node provas/provar-mudancas.mjs --defeitos\n');
    return;
  }

  console.log('\n\nREINTRODUZINDO OS DEFEITOS\n' + '-'.repeat(62));
  let impunes = 0;

  for (const d of DEFEITOS) {
    const sao    = mkdtempSync(join(tmpdir(), 'provas-mudancas-sao-'));
    const doente = mkdtempSync(join(tmpdir(), 'provas-mudancas-doente-'));

    for (const b of [sao, doente]) {
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

/* ============================================================
   PROVAS DO DOCUMENTO ASSINADO NO DRIVE — Dalmóbile
   ------------------------------------------------------------
       node provas/provar-assinado-drive.mjs
       node provas/provar-assinado-drive.mjs --defeitos

   O que esta suíte cobre: o arquivamento do documento assinado
   no Drive — a árvore de pastas, o nome do arquivo, a procura
   antes de subir e a promessa de nunca estourar.

   O QUE ELA NÃO COBRE, e é bom dizer em voz alta: a lógica do
   /api/autentique em volta disto — os três estados da reserva,
   os dois e-mails, a recusa, a reabertura. Aquelas provas
   existiram (102) e morreram com o container da sessão onde
   foram escritas, porque nunca foram para o repo. Esta suíte não
   as substitui; ela cobre a parte onde estava a falha.

   ------------------------------------------------------------
   A FALHA QUE ELA NASCEU PARA PEGAR

   O nome do documento é
       termo-assinado-<cliente>-<contrato>[-rodada-N].pdf
   e nada ali diz de QUAL FICHA ele é. Duas medições do mesmo
   contrato geram nome idêntico, caem na mesma pasta do contrato,
   e o "procurar antes de subir" encontra o documento da
   primeira. A segunda assinatura passaria a apontar para o
   documento da outra — um documento assinado, com validade
   jurídica, trocado por outro. Sem erro em lugar nenhum.
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { criarDrive, COTA_ESTOURADA } from './duble-drive.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');


/* ============================================================
   O MUNDO
   ============================================================ */
function env(extra) {
  return Object.assign({
    GOOGLE_CLIENT_ID: 'cid',
    GOOGLE_CLIENT_SECRET: 'csec',
    GOOGLE_REFRESH_TOKEN: 'rtok'
  }, extra || {});
}

let DRIVE = null;

function novoMundo() {
  DRIVE = criarDrive();
  DRIVE.pastasReservadas = new Map();   /* "escopo|chave" -> pasta */
  return DRIVE;
}

/* O `reservar` que o código recebe. Copia fiel do
   `reservar_pasta_drive`:

     · pasta nula  → só LÊ, devolve null se não houver;
     · pasta dada  → insere SE NÃO HOUVER (on conflict do
                     nothing) e devolve sempre quem está lá.

   Se este dublê inserisse por cima, a corrida entre duas abas
   daria sempre certo nas provas e sempre errado na vida. */
function reservar(escopo, chave, pasta, nome) {
  const k = escopo + '|' + chave;
  if (pasta === null || pasta === undefined) {
    return DRIVE.pastasReservadas.has(k) ? DRIVE.pastasReservadas.get(k) : null;
  }
  if (!DRIVE.pastasReservadas.has(k)) DRIVE.pastasReservadas.set(k, pasta);
  return DRIVE.pastasReservadas.get(k);
}

function instalarFetch() {
  const original = globalThis.fetch;
  globalThis.fetch = async function (endereco, opcoes) {
    if (!DRIVE) throw new Error('a prova chamou fetch sem criar o mundo');
    const r = await DRIVE.atender(endereco, opcoes);
    if (r) return r;
    throw new Error('o código chamou um endereço fora do Google: ' + endereco);
  };
  return function () { globalThis.fetch = original; DRIVE = null; };
}


/* Uma ficha como o webhook a entrega. */
function ficha(mudanca) {
  return Object.assign({
    id: '11111111-1111-4111-8111-111111111111',
    tipo: 'medicao',
    cliente: 'Carlos e Bia',
    contrato: 'OR-7',
    criado_em: '2026-03-10T13:45:00Z'
  }, mudanca || {});
}

function anexo(nome, tamanho) {
  const bytes = new Uint8Array(tamanho || 512);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  return { nome: nome, bytes: bytes, tipo: 'pades', hash: 'abc123' };
}

const MARCAS = {
  descricao: 'Medição assinada · Carlos e Bia · OR-7 · obra liberada: sim',
  propriedades: { estado: 'aprovado', obra_liberada: 'sim', hash_sha256: 'abc123' }
};


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
function errado(v, oque) { if (v) throw new Error('esperava falso: ' + (oque || '')); }

const NOME_RAIZ = 'Documentos assinados — Central de Peças';


/* ============================================================
   AS PROVAS
   ============================================================ */

prova('1. a árvore é raiz > contrato > gaveta da ficha', async (lib) => {
  const d = novoMundo();

  const r = await lib.arquivarNoDrive(env(), anexo('termo-assinado-carlos-e-bia-or-7.pdf'),
    ficha(), MARCAS, reservar);

  certo(r && r.id, 'devolveu o id do arquivo');

  const raiz = d.pastaPorNome(NOME_RAIZ);
  igual(raiz.length, 1, 'uma raiz');

  const contrato = d.pastaPorNome('OR-7');
  igual(contrato.length, 1, 'uma pasta do contrato');
  certo(contrato[0].parents.includes(raiz[0].id), 'contrato dentro da raiz');

  const gaveta = d.filhaUnica(contrato[0].id, 'OR-7');
  igual(d.arquivosDe(gaveta.id).length, 1, 'o documento na gaveta da ficha');
  igual(d.arquivosDe(contrato[0].id).length, 0,
    'e nenhum documento solto na pasta do contrato');
});


prova('2. DUAS MEDIÇÕES DO MESMO CONTRATO não apontam para o mesmo arquivo', async (lib) => {
  const d = novoMundo();

  /* A remedição, meses depois: outra ficha, mesmo contrato, mesmo
     cliente, mesmo tipo. O nome do arquivo sai IDÊNTICO — é só
     cliente, contrato e rodada. Antes da gaveta por ficha, a
     segunda assinatura passava a apontar para o documento da
     primeira: um documento com validade jurídica trocado por
     outro, sem erro em lugar nenhum. */
  const nome = 'termo-assinado-carlos-e-bia-or-7.pdf';

  const a = await lib.arquivarNoDrive(env(), anexo(nome, 512),
    ficha({ id: 'aaaaaaaa-1111-4111-8111-111111111111' }), MARCAS, reservar);

  const b = await lib.arquivarNoDrive(env(), anexo(nome, 1024),
    ficha({ id: 'bbbbbbbb-2222-4222-8222-222222222222' }), MARCAS, reservar);

  certo(a && b, 'as duas foram arquivadas');

  if (a.id === b.id) {
    throw new Error('as duas fichas apontam para O MESMO documento (' + a.id
      + '): a segunda assinatura entregaria o documento da primeira');
  }

  /* E o conteúdo tem de ser o de cada uma. */
  const bytesB = await lib.baixarDoDrive(env(), b.id);
  igual(bytesB.length, 1024, 'o documento da SEGUNDA ficha, não o da primeira');

  const bytesA = await lib.baixarDoDrive(env(), a.id);
  igual(bytesA.length, 512, 'o da primeira continua sendo o dela');
});


prova('3. "OR-7", "or-7" e "OR 7" são UM contrato, não três pastas', async (lib) => {
  const d = novoMundo();

  /* Ninguém digita igual duas vezes. Se a pasta for achada pela
     palavra exata, o mesmo contrato racha em três — e as três
     parecem certas para quem olha o Drive. */
  const comoDigitaram = ['OR-7', 'or-7', 'OR 7'];

  for (let i = 0; i < comoDigitaram.length; i++) {
    await lib.arquivarNoDrive(env(),
      anexo('termo-assinado-carlos-e-bia-or-7-' + i + '.pdf'),
      ficha({ id: 'cccccccc-' + i + '111-4111-8111-111111111111',
              contrato: comoDigitaram[i] }),
      MARCAS, reservar);
  }

  const raiz = d.pastaPorNome(NOME_RAIZ)[0];
  const doContrato = d.filhasDe(raiz.id);

  igual(doContrato.length, 1,
    'uma pasta de contrato, não ' + doContrato.length
    + ' (' + doContrato.map((p) => p.name).join(', ') + ')');

  /* O nome fica como foi digitado da primeira vez — é o que a
     equipe reconhece. A identidade é a chave normalizada. */
  igual(doContrato[0].name, 'OR-7', 'o nome é o da primeira vez');

  igual(d.filhasDe(doContrato[0].id).length, 3, 'três gavetas, uma por ficha');
});


prova('4. renomear a raiz dentro do Drive não cria uma segunda', async (lib) => {
  const d = novoMundo();

  await lib.arquivarNoDrive(env(), anexo('a.pdf'), ficha(), MARCAS, reservar);

  /* É o que o guia promete que pode ser feito. Antes da reserva
     da raiz, a promessa era falsa. */
  d.pastaPorNome(NOME_RAIZ)[0].name = 'Documentos assinados (Dalmóbile)';

  await lib.arquivarNoDrive(env(), anexo('b.pdf'),
    ficha({ id: 'dddddddd-1111-4111-8111-111111111111' }), MARCAS, reservar);

  igual(d.pastaPorNome(NOME_RAIZ).length, 0, 'não recriou a raiz antiga');
  igual(d.pastaPorNome('Documentos assinados (Dalmóbile)').length, 1, 'uma raiz só');
});


prova('5. raiz na lixeira não é reaproveitada', async (lib) => {
  const d = novoMundo();

  d.criar(NOME_RAIZ, null, 'application/vnd.google-apps.folder');
  Array.from(d.arquivos.values())[0].trashed = true;

  const r = await lib.arquivarNoDrive(env(), anexo('a.pdf'), ficha(), MARCAS, reservar);
  certo(r && r.id, 'arquivou');

  /* Nenhum pai pode estar na lixeira: lá dentro, o Drive apaga
     tudo em 30 dias e o sistema jura que o documento existe. */
  let atual = d.arquivos.get(r.id);
  const vistos = new Set();
  while (atual && (atual.parents || []).length) {
    const pai = d.arquivos.get(atual.parents[0]);
    if (!pai || vistos.has(pai.id)) break;
    vistos.add(pai.id);
    errado(pai.trashed, 'o pai "' + pai.name + '" está na lixeira');
    atual = pai;
  }
});


prova('6. repetir o arquivamento não sobe uma segunda cópia', async (lib) => {
  const d = novoMundo();
  const f = ficha();
  const faz = () => lib.arquivarNoDrive(env(),
    anexo('termo-assinado-carlos-e-bia-or-7.pdf'), f, MARCAS, reservar);

  const a = await faz();
  const b = await faz();

  igual(a.id, b.id, 'o mesmo arquivo');
  certo(b.jaEstava, 'a segunda vez sabe que já estava lá');

  const gaveta = d.filhaUnica(d.pastaPorNome('OR-7')[0].id, 'OR-7');
  igual(d.arquivosDe(gaveta.id).length, 1, 'uma cópia só');
});


prova('7. as rodadas da vistoria convivem na gaveta da MESMA ficha', async (lib) => {
  const d = novoMundo();

  /* A vistoria reaberta: a mesma ficha, duas rodadas. A reprovada
     e a liberada têm de conviver, e a rodada no nome é o que
     impede duas iguais. */
  const f = ficha({ tipo: 'vistoria', id: 'eeeeeeee-1111-4111-8111-111111111111' });

  await lib.arquivarNoDrive(env(),
    anexo('vistoria-assinada-carlos-e-bia-or-7-rodada-1-pades.pdf'), f, MARCAS, reservar);
  await lib.arquivarNoDrive(env(),
    anexo('vistoria-assinada-carlos-e-bia-or-7-rodada-2-pades.pdf'), f, MARCAS, reservar);

  const gaveta = d.filhaUnica(d.pastaPorNome('OR-7')[0].id, 'OR-7');
  igual(d.arquivosDe(gaveta.id).length, 2, 'as duas rodadas, lado a lado');
  igual(d.filhasDe(d.pastaPorNome('OR-7')[0].id).length, 1,
    'uma gaveta só: é a mesma ficha');
});


prova('8. ficha sem contrato ainda tem onde morar', async (lib) => {
  const d = novoMundo();

  const r = await lib.arquivarNoDrive(env(), anexo('a.pdf'),
    ficha({ contrato: '' }), MARCAS, reservar);

  certo(r && r.id, 'arquivou');
  igual(d.pastaPorNome('Sem contrato').length, 1,
    'pasta nomeada, não documento solto na raiz');
});


prova('9. NUNCA ESTOURA: devolve null quando o Drive falha', async (lib) => {
  const d = novoMundo();
  d.falharUpload = COTA_ESTOURADA;

  /* Quem chama isto está processando uma assinatura: ela já está
     registrada e o prazo contratual já começou. Estourar aqui
     trocaria "o documento não foi para o Drive" por "a assinatura
     não foi processada", e a segunda é incomparavelmente pior. */
  const r = await lib.arquivarNoDrive(env(), anexo('a.pdf'), ficha(), MARCAS, reservar);
  igual(r, null, 'devolve null, não exceção');
});


prova('10. sem as variáveis do Google: null, e nada tocado', async (lib) => {
  const d = novoMundo();

  const r = await lib.arquivarNoDrive(env({ GOOGLE_REFRESH_TOKEN: '' }),
    anexo('a.pdf'), ficha(), MARCAS, reservar);

  igual(r, null, 'null');
  igual(d.arquivos.size, 0, 'nada no Drive');
  igual(d.chamadas.length, 0, 'nem uma chamada ao Google');
});


prova('11. sem PDF não inventa arquivo', async (lib) => {
  const d = novoMundo();
  igual(await lib.arquivarNoDrive(env(), null, ficha(), MARCAS, reservar), null, 'sem anexo');
  igual(await lib.arquivarNoDrive(env(), { nome: 'a.pdf' }, ficha(), MARCAS, reservar),
    null, 'anexo sem bytes');
  igual(d.arquivos.size, 0, 'nada no Drive');
});


prova('12. os metadados chegam no arquivo, sem colapsar o estado', async (lib) => {
  const d = novoMundo();
  const r = await lib.arquivarNoDrive(env(), anexo('a.pdf'), ficha(), MARCAS, reservar);

  const a = d.arquivos.get(r.id);
  igual(a.meta.description, MARCAS.descricao, 'descrição');
  igual(a.meta.properties.estado, 'aprovado', 'estado');
  igual(a.meta.properties.obra_liberada, 'sim', 'obra liberada');
  igual(a.meta.properties.hash_sha256, 'abc123', 'o hash do assinado');

  /* O parecer tem três desfechos. Dois booleanos de "aprovado/
     reprovado" fariam o outro sistema acreditar que a obra acabou
     com pendência aberta. */
  certo(a.meta.properties.estado && a.meta.properties.obra_liberada,
    'o estado e a liberação vão separados, não fundidos');
});


prova('13. GOOGLE_PASTA_RAIZ manda, quando existe', async (lib) => {
  const d = novoMundo();
  const minha = d.criar('A pasta que eu escolhi', null,
    'application/vnd.google-apps.folder');

  await lib.arquivarNoDrive(env({ GOOGLE_PASTA_RAIZ: minha }),
    anexo('a.pdf'), ficha(), MARCAS, reservar);

  igual(d.pastaPorNome(NOME_RAIZ).length, 0, 'não criou raiz própria');
  certo(d.pastaPorNome('OR-7')[0].parents.includes(minha), 'usou a indicada');
});


prova('14. contratos diferentes, pastas diferentes', async (lib) => {
  const d = novoMundo();

  await lib.arquivarNoDrive(env(), anexo('a.pdf'),
    ficha({ contrato: 'OR-7' }), MARCAS, reservar);
  await lib.arquivarNoDrive(env(), anexo('b.pdf'),
    ficha({ id: 'ffffffff-1111-4111-8111-111111111111', contrato: 'OR-91' }),
    MARCAS, reservar);

  igual(d.pastaPorNome('OR-7').length, 1, 'OR-7');
  igual(d.pastaPorNome('OR-91').length, 1, 'OR-91');
  igual(d.filhasDe(d.pastaPorNome(NOME_RAIZ)[0].id).length, 2, 'duas, não uma');
});


prova('15. o documento volta inteiro do Drive', async (lib) => {
  const d = novoMundo();
  const meu = anexo('a.pdf', 3000);

  const r = await lib.arquivarNoDrive(env(), meu, ficha(), MARCAS, reservar);
  const voltou = await lib.baixarDoDrive(env(), r.id);

  igual(voltou.length, 3000, 'tamanho');
  for (let i = 0; i < voltou.length; i++) {
    if (voltou[i] !== meu.bytes[i]) throw new Error('byte ' + i + ' diferente');
  }
});


prova('16. documento apagado do Drive devolve null, não bytes vazios', async (lib) => {
  const d = novoMundo();
  const r = await lib.arquivarNoDrive(env(), anexo('a.pdf'), ficha(), MARCAS, reservar);

  d.arquivos.get(r.id).trashed = true;

  igual(await lib.baixarDoDrive(env(), r.id), null,
    'null é distinguível; Uint8Array vazio viraria um PDF de 0 byte');
});


prova('17. a gaveta diz de que ficha é, para quem abre o Drive', async (lib) => {
  const d = novoMundo();

  await lib.arquivarNoDrive(env(), anexo('a.pdf'),
    ficha({ tipo: 'medicao', criado_em: '2026-03-10T13:45:00Z' }), MARCAS, reservar);

  const gaveta = d.filhaUnica(d.pastaPorNome('OR-7')[0].id, 'OR-7');

  /* O tipo e quando a ficha nasceu. Sem isto a gaveta é um nome
     opaco e a pasta do contrato fica com três gavetas que ninguém
     sabe distinguir. */
  certo(/medi/i.test(gaveta.nome || gaveta.name),
    'o tipo da ficha no nome da gaveta: ' + gaveta.name);
  certo(/2026-03-10/.test(gaveta.name),
    'quando a ficha nasceu: ' + gaveta.name);
});


prova('18. a reserva poupa o Drive: a segunda assinatura não refaz as buscas', async (lib) => {
  const d = novoMundo();
  const f = ficha({ tipo: 'vistoria' });

  await lib.arquivarNoDrive(env(),
    anexo('vistoria-assinada-carlos-e-bia-or-7-rodada-1-pades.pdf'), f, MARCAS, reservar);

  igual(d.pastasCriadas(), 3, 'raiz + contrato + gaveta');
  d.esquecer();

  await lib.arquivarNoDrive(env(),
    anexo('vistoria-assinada-carlos-e-bia-or-7-rodada-2-pades.pdf'), f, MARCAS, reservar);

  igual(d.pastasCriadas(), 0, 'nenhuma pasta nova');
  igual(d.descartes(), 0, 'nenhuma pasta na lixeira');
  igual(d.buscasDePasta(), 0, 'nenhuma busca de pasta refeita');
});


prova('19. chamada sem o `reservar` falha em voz alta, não arquiva nada', async (lib) => {
  const d = novoMundo();

  /* Esta função engole toda exceção de propósito, então o
     RESULTADO é o mesmo com guarda ou sem: null, nada no Drive.
     O que o guarda entrega é a MENSAGEM — e é ela que vale, por
     isso é ela que a prova olha. Sem o guarda o sintoma seria "o
     Drive parou de receber documentos" e o log diria apenas
     "reservar is not a function", que não aponta para quem
     esqueceu de passá-la. */
  const dito = [];
  const antes = console.error;
  console.error = function (m) { dito.push(String(m)); };

  let r;
  try { r = await lib.arquivarNoDrive(env(), anexo('a.pdf'), ficha(), MARCAS); }
  finally { console.error = antes; }

  igual(r, null, 'null');
  igual(d.arquivos.size, 0, 'nada no Drive');

  const junto = dito.join(' | ');
  certo(/reservar/.test(junto), 'o log nomeia o `reservar`: ' + junto);
  certo(/autentique/i.test(junto),
    'e diz onde consertar, senão a pista morre no meio do caminho: ' + junto);
});


/* ============================================================
   OS DEFEITOS
   ============================================================
   Cada um tem de deixar alguma prova VERMELHA, e antes de cada
   um o arreio roda a cópia SEM defeito: se ela não vier verde, o
   vermelho da doente não prova nada. */
const DEFEITOS = [
  { nome: 'a gaveta da ficha desaparece: duas medições dividem a pasta',
    arquivo: 'lib/drive.js',
    de: `  if (!ficha || !ficha.id) return doContrato;`,
    para: `  return doContrato;` },

  { nome: 'a gaveta da ficha passa a ser adotada pelo nome',
    arquivo: 'lib/drive.js',
    de: `    nomeDaGaveta(ficha), doContrato,
    false);                 /* nunca adotar pelo nome */`,
    para: `    nomeDaGaveta(ficha), doContrato,
    true);` },

  { nome: 'a chave do contrato deixa de ser normalizada',
    arquivo: 'lib/drive.js',
    de: `    'contrato', chaveDe(nome), nome, raiz);`,
    para: `    'contrato', nome, nome, raiz);` },

  { nome: 'a raiz dos assinados volta a ser achada pelo nome',
    arquivo: 'lib/drive.js',
    de: `    raiz = await pastaFirmada(
      acesso, reservar, 'raiz', 'assinados', NOME_DA_RAIZ, null);`,
    para: `    raiz = await acharPasta(acesso, NOME_DA_RAIZ, null)
        || await criarPasta(acesso, NOME_DA_RAIZ, null);` },

  { nome: 'o arquivo deixa de ser procurado antes de subir',
    arquivo: 'lib/drive.js',
    de: `    const anterior = await acharArquivo(acesso, pasta, anexo.nome);`,
    para: `    const anterior = null;` },

  { nome: 'o try/catch sai: o arquivamento passa a derrubar a assinatura',
    arquivo: 'lib/drive.js',
    de: `  } catch (e) {
    console.error((e && e.message) || '[drive] falhou sem mensagem');
    return null;
  }`,
    para: `  } finally {
    /* sem rede */
  }` },

  { nome: 'o anexo sem bytes passa a ser aceito',
    arquivo: 'lib/drive.js',
    de: `  if (!anexo || !anexo.bytes) return null;`,
    para: `  if (!anexo) return null;` },

  { nome: 'baixarDoDrive devolve bytes vazios em vez de null',
    arquivo: 'lib/drive.js',
    de: `      console.warn('[drive] o arquivo ' + fileId + ' devolveu ' + r.status
        + (r.status === 404 ? ' — alguém apagou do Drive?' : ''));
      return null;`,
    para: `      console.warn('[drive] o arquivo ' + fileId + ' devolveu ' + r.status);
      return { bytes: new Uint8Array(0), tipo: 'application/pdf' };` },

  { nome: 'o guarda do `reservar` sai: arquivaria nada, calado',
    arquivo: 'lib/drive.js',
    de: `    if (typeof reservar !== 'function') {`,
    para: `    if (false) {` },

  { nome: 'a gaveta perde o tipo e a data: nome opaco',
    arquivo: 'lib/drive.js',
    de: `  return rotulo + ' ' + dia;`,
    para: `  return 'Ficha';` }
];


/* ============================================================
   RODAR
   ============================================================ */
async function carregarLib(base) {
  /* `?v=` por carga, e PASTA NOVA por defeito: o Node guarda
     módulo em cache pelo caminho, e com uma pasta só o
     lib/drive.js do primeiro defeito ficaria cacheado para todos
     os seguintes — 9 "pegos" que não provariam nada. */
  return await import('file://' + join(base, 'lib/drive.js') + '?v=' + Math.random());
}

async function rodarSuite(base, silencioso) {
  const lib = await carregarLib(base);
  const vermelhas = [];

  for (const p of PROVAS) {
    const desinstalar = instalarFetch();
    try {
      await p.corpo(lib);
      if (!silencioso) console.log('  ✓ ' + p.nome);
    } catch (e) {
      vermelhas.push({ nome: p.nome, erro: (e && e.message) || String(e) });
      if (!silencioso) console.log('  ✗ ' + p.nome + '\n      ' + ((e && e.message) || e));
    } finally {
      desinstalar();
    }
  }
  return vermelhas;
}

function limpar(pasta) {
  try { rmSync(pasta, { recursive: true, force: true }); } catch (e) {}
}

async function principal() {
  console.log('\nPROVAS DO DOCUMENTO ASSINADO NO DRIVE\n' + '-'.repeat(62));
  const vermelhas = await rodarSuite(RAIZ, false);

  console.log('-'.repeat(62));
  console.log(vermelhas.length
    ? '✗ ' + vermelhas.length + ' de ' + PROVAS.length + ' vermelhas'
    : '✓ as ' + PROVAS.length + ' provas passaram');

  if (vermelhas.length) process.exit(1);

  if (!process.argv.includes('--defeitos')) {
    console.log('\nProva verde não diz o que ela pega. Rode também:');
    console.log('    node provas/provar-assinado-drive.mjs --defeitos\n');
    return;
  }

  console.log('\n\nREINTRODUZINDO OS DEFEITOS\n' + '-'.repeat(62));
  let impunes = 0;

  for (const d of DEFEITOS) {
    const sao    = mkdtempSync(join(tmpdir(), 'provas-assinado-sao-'));
    const doente = mkdtempSync(join(tmpdir(), 'provas-assinado-doente-'));

    for (const base of [sao, doente]) {
      cpSync(join(RAIZ, 'lib'), join(base, 'lib'), { recursive: true });
      cpSync(join(RAIZ, 'functions'), join(base, 'functions'), { recursive: true });
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
  console.error('\nProva que estoura esconde todas as que vêm depois.\n');
  process.exit(1);
});

/* ============================================================
   PROVAS DA JORNADA DALMÓBILE
   ------------------------------------------------------------
       node provas/provar-jornada.mjs
       node provas/provar-jornada.mjs --defeitos

   O jornada.js é DADO, não código: ele vai ser editado toda vez
   que a loja mudar um passo, uma fala ou um material. É por isso
   que ele precisa de prova — e é por isso que as provas aqui
   olham a INTEGRIDADE dos dados, não o desenho da tela.

   O que cala sem prova:

     · um id de material com erro de digitação. A tela mostra
       um chip pendente e ninguém nota que era para ser um link;
     · um trecho do vídeo mandado pelo cargo errado. O quadro do
       Miro e o roteiro já divergiram uma vez nisso;
     · uma fala minha passando por fala aprovada;
     · um passo órfão, numa fase que não existe.
   ============================================================ */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');


/* ------------------------------------------------------------
   Carregar os dados e as três fontes de material
   ------------------------------------------------------------
   `jornada.js` é script clássico: declara `const JORNADA` no
   escopo do script. Avaliamos o texto e devolvemos o objeto.

   Os ids de material vêm do index.html, de três listas
   diferentes (CATALOGO, BIBLIOTECA, LINKS). Extraí-los por
   regex é feio, e a alternativa seria repetir a lista aqui —
   que é a cópia que envelhece em direção diferente e deixa a
   prova concordar com um id que não existe mais.
   ------------------------------------------------------------ */
function carregarJornada(base) {
  const texto = readFileSync(join(base, 'jornada.js'), 'utf8');
  return new Function(texto + '\n;return JORNADA;')();
}

function idsDaCentral(base) {
  const html = readFileSync(join(base, 'index.html'), 'utf8');
  const ids = new Set();
  const re = /\bid:\s*'([a-z0-9-]+)'/g;
  let m;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return ids;
}


/* ------------------------------------------------------------ */
const PROVAS = [];
function prova(nome, corpo) { PROVAS.push({ nome, corpo }); }

function igual(a, b, oque) {
  if (a !== b) throw new Error((oque || 'valor') + ': esperava '
    + JSON.stringify(b) + ', veio ' + JSON.stringify(a));
}
function certo(v, oque) { if (!v) throw new Error('esperava verdadeiro: ' + (oque || '')); }
function vazio(lista, oque) {
  if (lista.length) throw new Error((oque || 'esperava lista vazia') + ': ' + lista.join(' · '));
}

/* Todos os materiais citados, achatados. */
function materiaisCitados(J) {
  const fora = [];
  J.PASSOS.forEach(function (p) {
    (p.materiais || []).forEach(function (m) { fora.push({ passo: p.id, m: m }); });
  });
  return fora;
}


/* ============================================================
   AS PROVAS
   ============================================================ */

prova('1. todo id de material aponta para algo que existe na Central', (J, base) => {
  const existem = idsDaCentral(base);

  /* ⚠️ O defeito que esta prova pega não aparece na tela: um id
     com erro de digitação vira um chip pendente, igual ao de um
     material que ainda não foi feito. Ninguém descobre olhando. */
  const perdidos = materiaisCitados(J)
    .filter(function (x) { return typeof x.m === 'string' && !existem.has(x.m); })
    .map(function (x) { return x.passo + ' → ' + x.m; });

  vazio(perdidos, 'ids que não existem na Central');
});


prova('2. todo material pendente diz o que é e qual arquivo vai ser', (J) => {
  const mancos = materiaisCitados(J)
    .filter(function (x) { return x.m && typeof x.m === 'object'; })
    .filter(function (x) { return !x.m.pendente || !x.m.oque; })
    .map(function (x) { return x.passo; });

  /* Pendência sem explicação é um chip cinza que ninguém sabe o
     que é nem quem faz. */
  vazio(mancos, 'pendências sem nome ou sem explicação');
});


prova('3. todo passo tem fase e cargo que existem', (J) => {
  const fases = new Set(J.FASES.map(function (f) { return f.id; }));

  vazio(J.PASSOS.filter(function (p) { return !fases.has(p.fase); })
                .map(function (p) { return p.id + ' → ' + p.fase; }),
        'passos numa fase que não existe');

  vazio(J.PASSOS.filter(function (p) { return !J.CARGOS[p.cargo]; })
                .map(function (p) { return p.id + ' → ' + p.cargo; }),
        'passos num cargo que não existe');
});


prova('4. os ids dos passos não se repetem', (J) => {
  const vistos = new Set();
  const repetidos = [];
  J.PASSOS.forEach(function (p) {
    if (vistos.has(p.id)) repetidos.push(p.id);
    vistos.add(p.id);
  });
  /* Id repetido é o que quebra a migração para o banco: a chave
     primária recusa o segundo, e o passo some sem erro na tela. */
  vazio(repetidos, 'ids repetidos');
});


prova('5. a ordem não se repete e anda de 10 em 10', (J) => {
  const ordens = J.PASSOS.map(function (p) { return p.ordem; });
  igual(new Set(ordens).size, ordens.length, 'ordens distintas');

  /* O espaço entre os números é o que deixa inserir um passo
     entre dois existentes sem renumerar o resto — que no banco
     seria uma migração por causa de um passo novo. */
  const colados = [];
  J.FASES.forEach(function (f) {
    const ps = J.passosDaFase(f.id);
    for (let i = 1; i < ps.length; i++) {
      if (ps[i].ordem - ps[i - 1].ordem < 10) {
        colados.push(ps[i - 1].id + ' → ' + ps[i].id);
      }
    }
  });
  vazio(colados, 'passos sem espaço de ordem entre eles');
});


prova('6. os nove trechos do vídeo estão todos colocados, uma vez cada', (J) => {
  const usados = J.PASSOS.filter(function (p) { return p.trecho; })
                         .map(function (p) { return p.trecho; });

  vazio(usados.filter(function (t) { return !J.TRECHOS[t]; }),
        'passos apontando para trecho que não existe');

  igual(new Set(usados).size, usados.length, 'cada trecho usado uma vez só');

  vazio(Object.keys(J.TRECHOS).filter(function (t) { return usados.indexOf(t) < 0; }),
        'trechos do vídeo sem passo na jornada');
});


prova('7. quem manda o trecho é o cargo que o roteiro diz', (J) => {
  /* ⚠️ Esta é a prova que mais importa deste arquivo. O
     Fluxograma Marketing e o roteiro v2 JÁ DIVERGIRAM nisso: o
     quadro diz "Projeto aprovado · Vendedor manda", o roteiro diz
     Consultor(a); o quadro diz "Medição aprovada", o roteiro
     separou em Avaliação do ambiente e Medição técnica.

     Se a tela mandar o trecho errado para o cargo errado, a
     pessoa manda ao cliente um vídeo que fala de outra fase. */
  const erradas = [];
  Object.keys(J.TRECHOS).forEach(function (k) {
    const t = J.TRECHOS[k];
    const p = J.PASSOS.filter(function (x) { return x.trecho === k; })[0];
    if (!p) { erradas.push(t.nome + ': sem passo'); return; }
    if (p.cargo !== t.quem) {
      erradas.push(t.nome + ': passo é de ' + p.cargo + ', roteiro diz ' + t.quem);
    }
  });
  vazio(erradas, 'trechos com o cargo errado');
});


prova('8. toda fala declara de onde veio', (J) => {
  const mudas = J.PASSOS
    .filter(function (p) { return p.fala && !p.falaFonte; })
    .map(function (p) { return p.id; });

  /* Fala sem procedência aparece na tela sem selo, do mesmo
     jeito que uma fala aprovada. A aba vai ser usada na frente
     do cliente: rascunho meu passando por fala da loja é alguém
     lendo em voz alta uma frase que ninguém aprovou. */
  vazio(mudas, 'falas sem falaFonte');

  const validas = ['roteiro', 'manual', 'rascunho'];
  vazio(J.PASSOS.filter(function (p) { return p.falaFonte && validas.indexOf(p.falaFonte) < 0; })
                .map(function (p) { return p.id + ' → ' + p.falaFonte; }),
        'falaFonte com valor desconhecido');
});


prova('9. falaFonte não aparece em passo sem fala', (J) => {
  vazio(J.PASSOS.filter(function (p) { return p.falaFonte && !p.fala; })
                .map(function (p) { return p.id; }),
        'passos com procedência e sem fala');
});


prova('10. a contagem de rascunhos e pendências bate com os dados', (J) => {
  const rascunhos = J.PASSOS.filter(function (p) { return p.falaFonte === 'rascunho'; }).length;
  igual(J.contarRascunhos(), rascunhos, 'rascunhos');

  let pend = 0;
  materiaisCitados(J).forEach(function (x) { if (x.m && x.m.pendente) pend++; });
  igual(J.contarPendencias(), pend, 'pendências');

  /* O número aparece no topo da aba. Número errado ali é pior
     que número nenhum: alguém lê "0 rascunhos" e confia. */
  certo(J.contarRascunhos() >= 0 && J.contarPendencias() >= 0, 'contagens não negativas');
});


prova('11. as nove fases estão em ordem e nenhuma fica vazia', (J) => {
  igual(J.FASES.length, 9, 'nove fases');

  const nums = J.FASES.map(function (f) { return Number(f.numero); });
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] <= nums[i - 1]) throw new Error('fases fora de ordem em ' + J.FASES[i].numero);
  }

  vazio(J.FASES.filter(function (f) { return !J.passosDaFase(f.id).length; })
               .map(function (f) { return f.numero; }),
        'fases sem nenhum passo');
});


prova('12. passosDaFase devolve na ordem, sempre', (J) => {
  J.FASES.forEach(function (f) {
    const ps = J.passosDaFase(f.id);
    for (let i = 1; i < ps.length; i++) {
      if (ps[i].ordem < ps[i - 1].ordem) {
        throw new Error('fase ' + f.numero + ' fora de ordem: ' + ps[i].id);
      }
    }
  });
});


prova('13. o passo do grupo do WhatsApp é do GERENTE', (J) => {
  const p = J.PASSOS.filter(function (x) { return x.id === 'p-grupo'; })[0];
  certo(p, 'o passo existe');

  /* Três fontes discordavam, e a decisão foi gerente, pelo
     celular da loja. A caixa azul do Fluxograma Dalmobile ainda
     diz Consultor. Esta prova é o que impede alguém "corrigir" o
     jornada.js pelo quadro antigo. */
  igual(p.cargo, 'gerente', 'cargo do passo do grupo');
  certo(/celular da loja/i.test(p.oque + ' ' + (p.cuidado || '')),
    'o passo diz que é pelo celular da loja');
});


prova('14. o passo do ambiente aprovado avisa da armadilha do nome', (J) => {
  const p = J.PASSOS.filter(function (x) { return x.id === 'p-ambiente-ok'; })[0];
  certo(p, 'o passo existe');

  /* "Medição Aprovada" no Kanban quer dizer que o AMBIENTE foi
     aprovado para medir. Sem este aviso na tela, a aba conserta
     o nome e a pessoa não acha o status no sistema. */
  certo(/Medição Aprovada/.test(p.sistema || ''), 'mostra o status como ele é no sistema');
  certo(/ambiente/i.test(p.cuidado || ''), 'e explica o que ele realmente quer dizer');
});


prova('15. a avaliação do ambiente vem ANTES da medição técnica', (J) => {
  const avaliacao = J.PASSOS.filter(function (x) { return x.id === 'p-avaliacao'; })[0];
  const medicao  = J.PASSOS.filter(function (x) { return x.id === 'p-medicao-tecnica'; })[0];

  certo(avaliacao && medicao, 'os dois passos existem');

  /* É a mudança de estrutura do roteiro v2, com essas palavras:
     "a avaliação do ambiente pelo Supervisor vem antes da
     medição técnica do Executivo". */
  certo(avaliacao.ordem < medicao.ordem, 'a avaliação vem primeiro');
  igual(avaliacao.cargo, 'montagem', 'a avaliação é do Supervisor');
  igual(medicao.cargo, 'executivo', 'a medição técnica é do Executivo');
});


prova('16. os três níveis de captação existem e explicam o que muda', (J) => {
  igual(J.NIVEIS.length, 3, 'três níveis');
  J.NIVEIS.forEach(function (n, i) {
    igual(n.n, i + 1, 'nível ' + (i + 1));
    certo(n.oque && n.oque.length > 20, 'o nível ' + n.n + ' explica o que muda');
  });
});


prova('17. todo cargo da legenda tem cor própria e legível', (J) => {
  const vistos = {};
  Object.keys(J.CARGOS).forEach(function (id) {
    const c = J.CARGOS[id];
    certo(c.nome && c.fundo && c.borda && c.texto, 'cargo ' + id + ' completo');
    certo(/^#[0-9a-f]{6}$/i.test(c.fundo), 'fundo de ' + id + ' é cor: ' + c.fundo);

    /* Duas faixas com a mesma cor é o fluxograma deixando de
       distinguir quem faz o quê — que é a única coisa que a cor
       está ali para fazer. */
    if (vistos[c.fundo]) throw new Error('cor repetida: ' + id + ' e ' + vistos[c.fundo]);
    vistos[c.fundo] = id;
  });
});


prova('18. todo passo tem título e descrição', (J) => {
  vazio(J.PASSOS.filter(function (p) { return !p.titulo || !p.titulo.trim(); })
                .map(function (p) { return p.id; }), 'passos sem título');

  vazio(J.PASSOS.filter(function (p) { return !p.oque || p.oque.length < 10; })
                .map(function (p) { return p.id; }), 'passos sem descrição útil');
});


/* ------------------------------------------------------------
   Os nove links do vídeo foram colados UM A UM, à mão, de uma
   lista do Drive. É o tipo de dado em que o erro não aparece:
   o chip abre, o vídeo toca, e só quem conhece o corte percebe
   que a etapa 6 está mostrando a etapa 7. As três provas abaixo
   existem por causa disso.
   ------------------------------------------------------------ */
prova('19. todo trecho tem vídeo, e o vídeo é um arquivo do Drive', (J) => {
  const ruins = [];
  Object.keys(J.TRECHOS).forEach(function (k) {
    const t = J.TRECHOS[k];
    if (!t.url) { ruins.push(k + ' (sem vídeo)'); return; }
    if (!/^https:\/\/drive\.google\.com\/file\/d\/[\w-]{20,}\/view$/.test(t.url)) {
      ruins.push(k + ' → ' + t.url);
    }
  });
  vazio(ruins, 'trechos sem link de vídeo válido');
});

prova('20. dois trechos nunca apontam para o mesmo vídeo', (J) => {
  const vistos = new Map();
  const repetidos = [];
  Object.keys(J.TRECHOS).forEach(function (k) {
    const u = J.TRECHOS[k].url;
    if (!u) return;
    if (vistos.has(u)) repetidos.push(vistos.get(u) + ' e ' + k);
    else vistos.set(u, k);
  });
  vazio(repetidos, 'trechos apontando para o mesmo arquivo');
});

prova('21. todo vídeo de prévia está declarado como prévia', (J) => {
  /* Os renders de hoje são prévias. Um link sem esse aviso vira
     uma prévia mandada para o cliente — e a tela só escreve
     "prévia" porque este campo diz que é. */
  const calados = Object.keys(J.TRECHOS).filter(function (k) {
    const t = J.TRECHOS[k];
    return t.url && t.previa !== true && t.previa !== false;
  });
  vazio(calados, 'trechos com vídeo que não dizem se é prévia ou corte final');
});

prova('23. dois materiais do mesmo passo nunca aparecem com o mesmo rótulo', (J, base) => {
  /* Na Central cada item aparece dentro da grade da sua loja, e
     dois "WhatsApp da loja" não se confundem. Aqui os dois ficam
     lado a lado no mesmo passo: rótulos iguais = o consultor
     manda o número da outra loja. A tela resolve acrescentando a
     loja ao rótulo; esta prova é quem garante que resolveu. */
  const html = readFileSync(join(base, 'index.html'), 'utf8');

  const rotulo = new Map();
  const re = /nome:\s*'([^']+)'([\s\S]{0,400}?)\bid:\s*'([a-z0-9-]+)'/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const lojas = (m[2].match(/lojas:\s*\[([^\]]*)\]/) || [, ''])[1]
                    .split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    rotulo.set(m[3], lojas.length === 1 ? (m[1] + ' · ' + lojas[0]) : m[1]);
  }

  const ruins = [];
  J.PASSOS.forEach(function (p) {
    const vistos = new Map();
    (p.materiais || []).forEach(function (mat) {
      if (!mat || typeof mat !== 'string') return;
      const r = rotulo.get(mat);
      if (!r) return;
      if (vistos.has(r)) ruins.push(p.id + ': ' + vistos.get(r) + ' e ' + mat + ' → "' + r + '"');
      else vistos.set(r, mat);
    });
  });
  vazio(ruins, 'passos com dois materiais de rótulo igual');
});

prova('22. nenhum passo declara o mesmo campo duas vezes', (J, base) => {
  /* Em objeto literal a última chave ganha calada. Um `materiais`
     repetido apaga o de cima sem erro nenhum — foi assim que uma
     lista de materiais sumiu neste arquivo. Só o texto pega. */
  const texto = readFileSync(join(base, 'jornada.js'), 'utf8');
  const blocos = texto.split(/\n    \{ id: '/).slice(1);
  const CHAVES = ['fase', 'ordem', 'cargo', 'titulo', 'oque', 'fala',
                  'falaFonte', 'sistema', 'materiais', 'cuidado', 'trecho'];
  const ruins = [];
  blocos.forEach(function (b) {
    const quem = (b.match(/^[a-z0-9-]+/) || ['?'])[0];
    CHAVES.forEach(function (c) {
      /* Exatamente seis espaços: é a coluna dos campos do passo.
         Objeto aninhado dentro de `materiais` fica muito mais à
         direita, e o `oque:` de dentro dele não é este `oque:`. */
      const n = (b.match(new RegExp('\\n {6}' + c + ':', 'g')) || []).length;
      if (n > 1) ruins.push(quem + ' · ' + c + ' ×' + n);
    });
  });
  vazio(ruins, 'passos com campo repetido');
});


/* ============================================================
   OS DEFEITOS
   ============================================================ */
const DEFEITOS = [
  { nome: 'um id de material com erro de digitação',
    arquivo: 'jornada.js',
    de: `      materiais: ['acompanhe-pedido'],`,
    para: `      materiais: ['acompanhe-pedidos'],` },

  { nome: 'uma pendência sem explicação',
    arquivo: 'jornada.js',
    de: `[{ pendente: 'Termo de Autorização de Uso de Imagem',
                    oque: 'Ficha 18. Texto ainda a validar com o jurídico.' }]`,
    para: `[{ pendente: 'Termo de Autorização de Uso de Imagem' }]` },

  { nome: 'o trecho da aprovação passa para o Executivo (o erro do quadro antigo)',
    arquivo: 'jornada.js',
    de: `dura: '22 s', quem: 'consultor',`,
    para: `dura: '22 s', quem: 'executivo',` },

  { nome: 'dois trechos ficam com o mesmo vídeo (um id colado duas vezes)',
    arquivo: 'jornada.js',
    de: `previa: true, url: noDrive('1d8DS0CbmW8Fzpknkjmcwne7EOqi35lth') },`,
    para: `previa: true, url: noDrive('1Hv0ufbe-2vE1OMKRqqS5Mj94VmLAO_Dk') },` },

  { nome: 'um link do Drive volta com um caractere a menos',
    arquivo: 'jornada.js',
    de: `url: noDrive('1usoJK9Ltzb6WTOUklMhHTrPW-XVvfa5t')`,
    para: `url: 'https://drive.google.com/file/d/1usoJK9Ltzb6WTOUklMhHTrPW-XVvfa5t'` },

  { nome: 'uma prévia perde o aviso de que é prévia',
    arquivo: 'jornada.js',
    de: `    t0: { n: '0', nome: 'Versão completa',       arquivo: 'jornada_00_completo.mp4',  dura: '~3 min 30 s', quem: 'gerente',
          previa: true,`,
    para: `    t0: { n: '0', nome: 'Versão completa',       arquivo: 'jornada_00_completo.mp4',  dura: '~3 min 30 s', quem: 'gerente',` },

  { nome: 'o WhatsApp de Caraguá sai com a loja de SJC (erro de copiar e colar)',
    arquivo: 'index.html',
    de: `        url: 'https://wa.me/5512996021234', tipo: 'ZAP', lojas: ['cgt'], id: 'zap-loja-cgt' }`,
    para: `        url: 'https://wa.me/5512996021234', tipo: 'ZAP', lojas: ['sjc'], id: 'zap-loja-cgt' }` },

  { nome: 'um passo ganha um `materiais` repetido e o de cima some',
    arquivo: 'jornada.js',
    de: `      materiais: ['agendamento', 'montagem'],`,
    para: `      materiais: ['agendamento', 'montagem'],\n      materiais: [],` },

  { nome: 'uma fala perde a procedência',
    arquivo: 'jornada.js',
    de: `      falaFonte: 'manual',`,
    para: `      falaFonte: null,` },

  { nome: 'o grupo do WhatsApp volta para o Consultor',
    arquivo: 'jornada.js',
    de: `    { id: 'p-grupo', fase: 'f02', ordem: 160, cargo: 'gerente',`,
    para: `    { id: 'p-grupo', fase: 'f02', ordem: 160, cargo: 'consultor',` },

  { nome: 'o aviso da armadilha do nome some',
    arquivo: 'jornada.js',
    de: `      cuidado: '⚠️ O NOME NO SISTEMA ENGANA.`,
    para: `      cuidado: 'x'.slice(0,0) || ('` },

  { nome: 'a medição técnica passa na frente da avaliação do ambiente',
    arquivo: 'jornada.js',
    de: `    { id: 'p-medicao-tecnica', fase: 'f04', ordem: 300, cargo: 'executivo',`,
    para: `    { id: 'p-medicao-tecnica', fase: 'f04', ordem: 205, cargo: 'executivo',` },

  { nome: 'um trecho do vídeo fica sem passo',
    arquivo: 'jornada.js',
    de: `      trecho: 't7' },`,
    para: `      trecho: null },` },

  { nome: 'dois cargos ficam com a mesma cor',
    arquivo: 'jornada.js',
    de: `    financeiro: { nome: 'Financeiro',            fundo: '#e3f2e5', borda: '#438850', texto: '#285331' },`,
    para: `    financeiro: { nome: 'Financeiro',            fundo: '#ddf3f1', borda: '#438850', texto: '#285331' },` },

  { nome: 'um nível de captação vira só o número',
    arquivo: 'jornada.js',
    de: `    { n: 2, oque: 'O Marketing acompanha a obra para gravar.' },`,
    para: `    { n: 2, oque: 'Nível 2' },` },

  { nome: 'dois passos ficam com a mesma ordem',
    arquivo: 'jornada.js',
    de: `    { id: 'p-pasta-neg', fase: 'f01', ordem: 30, cargo: 'consultor',`,
    para: `    { id: 'p-pasta-neg', fase: 'f01', ordem: 20, cargo: 'consultor',` },

  { nome: 'a contagem de rascunhos passa a contar outra coisa',
    arquivo: 'jornada.js',
    de: `    return PASSOS.filter(function (p) { return p.falaFonte === 'rascunho'; }).length;`,
    para: `    return 0;` }
];


/* ============================================================
   RODAR
   ============================================================ */
function rodarSuite(base, silencioso) {
  const J = carregarJornada(base);
  const vermelhas = [];

  for (const p of PROVAS) {
    try {
      p.corpo(J, base);
      if (!silencioso) console.log('  ✓ ' + p.nome);
    } catch (e) {
      vermelhas.push({ nome: p.nome, erro: (e && e.message) || String(e) });
      if (!silencioso) console.log('  ✗ ' + p.nome + '\n      ' + ((e && e.message) || e));
    }
  }
  return vermelhas;
}

function limpar(p) { try { rmSync(p, { recursive: true, force: true }); } catch (e) {} }

function principal() {
  console.log('\nPROVAS DA JORNADA DALMÓBILE\n' + '-'.repeat(62));
  const vermelhas = rodarSuite(RAIZ, false);

  console.log('-'.repeat(62));
  console.log(vermelhas.length
    ? '✗ ' + vermelhas.length + ' de ' + PROVAS.length + ' vermelhas'
    : '✓ as ' + PROVAS.length + ' provas passaram');

  if (vermelhas.length) process.exit(1);

  if (!process.argv.includes('--defeitos')) {
    console.log('\nProva verde não diz o que ela pega. Rode também:');
    console.log('    node provas/provar-jornada.mjs --defeitos\n');
    return;
  }

  console.log('\n\nREINTRODUZINDO OS DEFEITOS\n' + '-'.repeat(62));
  let impunes = 0;

  for (const d of DEFEITOS) {
    const sao    = mkdtempSync(join(tmpdir(), 'provas-jornada-sao-'));
    const doente = mkdtempSync(join(tmpdir(), 'provas-jornada-doente-'));

    for (const b of [sao, doente]) {
      cpSync(join(RAIZ, 'jornada.js'), join(b, 'jornada.js'));
      cpSync(join(RAIZ, 'index.html'), join(b, 'index.html'));
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

    let baseVerde, quebrou;
    try { baseVerde = rodarSuite(sao, true); }
    catch (e) { baseVerde = [{ nome: 'a cópia sã nem carregou', erro: e.message }]; }

    try { quebrou = rodarSuite(doente, true); }
    catch (e) {
      /* Defeito que impede o arquivo de carregar é pego — e com
         folga: nada funciona. Conta como pego. */
      quebrou = [{ nome: 'o arquivo nem carrega', erro: (e && e.message) || String(e) }];
    }

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

try { principal(); }
catch (e) {
  console.error('\nA SUÍTE CAIU: ' + ((e && e.stack) || e));
  process.exit(1);
}

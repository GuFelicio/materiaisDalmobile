/* ============================================================
   O QUE MUDOU ENTRE DUAS VERSÕES — Dalmóbile
   ------------------------------------------------------------
   Compara dois estados do Checklist de Eletros e devolve a
   lista do que mudou, em palavras que a equipe lê.

   ⚠️ ESTA É A RAZÃO DE O HISTÓRICO EXISTIR. Guardar versões e
   mostrar "versão 1, versão 2, versão 3" responde a mesma coisa
   que não guardar nada. A pergunta real é uma só — "o cliente
   mudou o quê, e quando?" — e é ela que a obra precisa quando o
   projeto executivo foi feito em cima de uma geladeira que não
   é mais a geladeira.

   ------------------------------------------------------------
   POR QUE EM lib/, E NÃO DENTRO DA PÁGINA

   Porque é função pura e é a parte que mais merece prova. No
   meio do HTML, prová-la exigiria arrancar o texto da função
   por regex — que quebra calado assim que alguém renomeia algo.
   Aqui a prova importa o módulo, igual ao código.

   lib/ fica fora de functions/, então o Cloudflare publica como
   arquivo estático e o navegador alcança. ⚠️ Por isso mesmo ele
   NÃO pode guardar segredo — e não guarda: entra dado, sai
   dado, sem rede e sem estado.
   ============================================================ */

/* Os campos que o cliente preenche por item, na ordem da tela —
   para a lista de mudanças sair na ordem em que ele os viu. */
export const CAMPOS_DO_ITEM = [
  { chave: 'marca',   rotulo: 'modelo ou marca' },
  { chave: 'link',    rotulo: 'link' },
  { chave: 'largura', rotulo: 'largura' },
  { chave: 'altura',  rotulo: 'altura' },
  { chave: 'prof',    rotulo: 'profundidade' },
  { chave: 'obs',     rotulo: 'observação' }
];


/* Indexa os itens por ambiente + nome do item.

   ⚠️ NÃO POR POSIÇÃO. Um item acrescentado no meio empurra
   todos os de baixo, e a comparação por posição acusaria o
   documento inteiro como mudado — uma tela de trinta linhas
   vermelhas para uma linha que mudou de verdade. Quem lesse
   isso uma vez não leria de novo. */
function porItem(d) {
  const m = new Map();
  ((d && d.ambientes) || []).forEach(function (a) {
    ((a && a.itens) || []).forEach(function (i) {
      if (!i) return;
      m.set(((a.nome || '?') + ' · ' + (i.item || '?')), i);
    });
  });
  return m;
}

function texto(v) {
  return String(v === undefined || v === null ? '' : v).trim();
}


/**
 * Devolve [{ onde, de, para }], na ordem em que a equipe lê.
 * `de` vazio = passou a existir. `para` vazio = deixou de existir.
 */
export function oQueMudou(antes, depois) {
  const a = antes || {};
  const b = depois || {};
  const fora = [];

  /* A declaração de "não tenho itens extras" é a mudança mais
     grave que existe aqui: ela esvazia o documento inteiro. Vai
     em primeiro de propósito. */
  if (!!a.semItensExtras !== !!b.semItensExtras) {
    fora.push({
      onde: 'Declaração',
      de:   a.semItensExtras ? 'não tem itens extras' : 'tem itens extras',
      para: b.semItensExtras ? 'não tem itens extras' : 'tem itens extras'
    });
  }

  const antesItens  = porItem(a);
  const depoisItens = porItem(b);

  depoisItens.forEach(function (novo, chave) {
    const velho = antesItens.get(chave);

    if (!velho) {
      fora.push({ onde: chave, de: '', para: 'item acrescentado' });
      return;
    }

    if (!!velho.naoTenho !== !!novo.naoTenho) {
      fora.push({
        onde: chave,
        de:   velho.naoTenho ? 'não tem' : 'tem',
        para: novo.naoTenho  ? 'não tem' : 'tem'
      });
    }

    /* Item marcado "não tem" dos dois lados: os campos dele não
       valem nada, e listar "largura: 60 → " seria ruído sobre um
       item que o cliente já disse que não existe. */
    if (velho.naoTenho && novo.naoTenho) return;

    CAMPOS_DO_ITEM.forEach(function (c) {
      const x = texto(velho[c.chave]);
      const y = texto(novo[c.chave]);
      if (x === y) return;
      fora.push({ onde: chave + ' · ' + c.rotulo, de: x, para: y });
    });
  });

  antesItens.forEach(function (velho, chave) {
    if (!depoisItens.has(chave)) {
      fora.push({ onde: chave, de: 'item retirado', para: '' });
    }
  });

  return fora;
}

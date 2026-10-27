/* ============================================================
   DOCUMENTO 102 — Checklist de Eletros
   ------------------------------------------------------------
   Monta o PDF a partir da ficha que o cliente preencheu.

   Este arquivo é a peça inteira: quem chamar só precisa do
   registro do formulário. A etapa da assinatura vai usar esta
   mesma função — ela devolve os bytes, e quem pediu decide se
   baixa, imprime ou manda para assinar.

       const bytes = await PDF102.montar(documento);

   DEPENDE, na página que o carregar:
     pdf-lib 1.17.1   e   @pdf-lib/fontkit 1.1.1
     Krub-Medium.ttf  e   Krub-Bold.ttf  (já estão no repositório)

   A fonte é buscada do servidor. Se ela não vier, o PDF sai em
   Helvetica em vez de não sair — documento feio é problema; não
   conseguir imprimir na frente do cliente é problema maior.
   ============================================================ */

const PDF102 = (function () {
  'use strict';

  /* A4 em pontos */
  const PAGINA = { largura: 595.28, altura: 841.89 };
  const MARGEM = { esq: 42, dir: 42, topo: 48, baixo: 54 };

  const UTIL = PAGINA.largura - MARGEM.esq - MARGEM.dir;   // 511.28

  /* Somam a largura útil. Mexer aqui é mexer na tabela inteira. */
  const COLUNAS = [
    { chave: 'item',    titulo: 'ITEM',          largura: 108 },
    { chave: 'marca',   titulo: 'MODELO / MARCA', largura: 152 },
    { chave: 'largura', titulo: 'LARG.',         largura: 46, centro: true },
    { chave: 'altura',  titulo: 'ALT.',          largura: 46, centro: true },
    { chave: 'prof',    titulo: 'PROF.',         largura: 46, centro: true },
    { chave: 'obs',     titulo: 'OBS.',          largura: 113.28 }
  ];

  const COR = {
    tinta:   [0.08, 0.09, 0.09],
    suave:   [0.45, 0.47, 0.48],
    apagado: [0.62, 0.64, 0.65],
    linha:   [0.80, 0.81, 0.80],
    falta:   [0.54, 0.29, 0.07],
    regua:   [0.08, 0.09, 0.09],
    fundo:   [0.95, 0.95, 0.94]
  };

  const CORPO = 9;
  const ENTRELINHA = 1.32;

  /* A marca de cada unidade. Os arquivos ficam em imgs/, com os
     nomes que já estavam lá — se um dia forem renomeados, é aqui
     que se corrige, e em nenhum outro lugar.

     Encaixe pela ALTURA: as duas artes têm proporção diferente
     ("São José dos Campos" é mais curto que "Caraguatatuba"), e
     fixar a largura deixaria uma maior que a outra na página. */
  const LOJAS = {
    sjc: { nome: 'São José dos Campos', logo: 'imgs/dalmoSJC_preto_1.png' },
    cgt: { nome: 'Caraguatatuba',       logo: 'imgs/logoDalmo_caraguaPreto.png' }
  };

  const ALTURA_LOGO = 26;

  /* --------------------------------------------------------
     Entrada
     -------------------------------------------------------- */

  /**
   * @param {object} doc  o registro do formulário:
   *   { cliente, contrato, loja, dados, preenchido_em, assinatura }
   * @returns {Promise<Uint8Array>}
   */
  async function montar(doc) {
    const { PDFDocument, rgb } = window.PDFLib;

    const pdf = await PDFDocument.create();
    pdf.setTitle('Checklist de Eletros — ' + (doc.cliente || ''));
    pdf.setSubject('Documento 102');
    pdf.setProducer('Dalmóbile · Central de Peças');

    const fontes = await carregarFontes(pdf);
    const logo = await carregarLogo(pdf, doc.loja);

    const estado = {
      pdf, rgb, fontes, logo,
      pagina: null,
      y: 0,
      numero: 0,
      paginas: []
    };

    novaPagina(estado);
    cabecalho(estado, doc);

    const dados = doc.dados || {};

    if (dados.semItensExtras === true) {
      declaracaoSemItens(estado);
    } else {
      const ambientes = (dados.ambientes || []).filter((a) => (a.itens || []).length);

      if (!ambientes.length) {
        texto(estado, 'Nenhum ambiente foi informado.', CORPO, 'media', COR.suave);
        estado.y -= 18;
      } else {
        ambientes.forEach((amb) => tabelaDoAmbiente(estado, amb));
      }

      if (dados.observacao) observacao(estado, dados.observacao);
    }

    assinatura(estado, doc);
    rodapes(estado, doc);

    return await pdf.save();
  }

  /* --------------------------------------------------------
     Fontes
     -------------------------------------------------------- */

  async function carregarFontes(pdf) {
    const { StandardFonts } = window.PDFLib;

    try {
      pdf.registerFontkit(window.fontkit);

      const [m, n] = await Promise.all([
        baixar('Krub-Medium.ttf'),
        baixar('Krub-Bold.ttf')
      ]);

      return {
        media:   await pdf.embedFont(m, { subset: true }),
        negrito: await pdf.embedFont(n, { subset: true }),
        propria: true
      };
    } catch (e) {
      console.warn('Krub não carregou; o PDF sai em Helvetica.', e);
      return {
        media:   await pdf.embedFont(StandardFonts.Helvetica),
        negrito: await pdf.embedFont(StandardFonts.HelveticaBold),
        propria: false
      };
    }
  }

  /* Sem logo o documento ainda vale; sem documento, não. Então
     falha de imagem é anotada no console e seguimos — nunca
     impede o consultor de imprimir na frente do cliente. */
  async function carregarLogo(pdf, loja) {
    const conf = LOJAS[loja];
    if (!conf) return null;

    try {
      const png = await pdf.embedPng(await baixar(conf.logo));
      const escala = ALTURA_LOGO / png.height;

      return { png, largura: png.width * escala, altura: ALTURA_LOGO };
    } catch (e) {
      console.warn('Logo de ' + loja + ' não carregou (' + conf.logo + ').', e);
      return null;
    }
  }

  async function baixar(caminho) {
    const r = await fetch(caminho, { cache: 'force-cache' });
    if (!r.ok) throw new Error('não achei ' + caminho);
    return new Uint8Array(await r.arrayBuffer());
  }

  /* --------------------------------------------------------
     Páginas
     -------------------------------------------------------- */

  function novaPagina(e) {
    e.pagina = e.pdf.addPage([PAGINA.largura, PAGINA.altura]);
    e.numero += 1;
    e.paginas.push(e.pagina);
    e.y = PAGINA.altura - MARGEM.topo;
  }

  /** Garante espaço; se não houver, vira a página. */
  function caber(e, altura) {
    if (e.y - altura < MARGEM.baixo) {
      novaPagina(e);
      return true;
    }
    return false;
  }

  /* --------------------------------------------------------
     Cabeçalho
     -------------------------------------------------------- */

  function cabecalho(e, doc) {
    if (e.logo) {
      e.y -= e.logo.altura;
      e.pagina.drawImage(e.logo.png, {
        x: MARGEM.esq, y: e.y,
        width: e.logo.largura, height: e.logo.altura
      });
      e.y -= 26;
    }

    texto(e, 'CHECKLIST DE ELETROS', 15, 'negrito', COR.tinta, { espacamento: 0.4 });
    e.y -= 8;

    texto(e,
      'Este documento informa as medidas e dimensões dos eletros que ' +
      'compatibilizam com o mobiliário.',
      CORPO, 'media', COR.suave, { largura: UTIL });

    e.y -= 14;

    /* régua */
    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y, width: UTIL, height: 1.1,
      color: e.rgb.apply(null, COR.regua)
    });
    e.y -= 18;

    campo(e, 'CLIENTE', doc.cliente || '—', UTIL);
    e.y -= 6;

    const meio = UTIL / 2;
    const yAntes = e.y;
    campo(e, 'Nº DO CONTRATO', doc.contrato || '—', meio - 10);
    const yDepois = e.y;

    e.y = yAntes;
    campoEm(e, MARGEM.esq + meio, 'DATA DO PREENCHIMENTO',
            dataCurta(doc.preenchido_em || doc.atualizado_em), meio - 10);

    e.y = Math.min(yDepois, e.y);
    e.y -= 20;
  }

  function campo(e, rotulo, valor, largura) {
    campoEm(e, MARGEM.esq, rotulo, valor, largura);
  }

  function campoEm(e, x, rotulo, valor, largura) {
    e.pagina.drawText(rotulo, {
      x: x, y: e.y, size: 6.6, font: e.fontes.negrito,
      color: e.rgb.apply(null, COR.apagado), characterSpacing: 0.7
    });
    e.y -= 12;

    const linhas = quebrar(valor || '—', e.fontes.media, 10.5, largura);
    linhas.forEach((l) => {
      e.pagina.drawText(l, {
        x: x, y: e.y, size: 10.5, font: e.fontes.media,
        color: e.rgb.apply(null, COR.tinta)
      });
      e.y -= 10.5 * ENTRELINHA;
    });

    /* fiozinho sob o campo, no lugar da linha de preencher à mão */
    e.pagina.drawRectangle({
      x: x, y: e.y + 6, width: largura, height: 0.5,
      color: e.rgb.apply(null, COR.linha)
    });
  }

  /* --------------------------------------------------------
     Declaração de que não há itens
     -------------------------------------------------------- */

  function declaracaoSemItens(e) {
    caber(e, 76);

    const altura = 58;
    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y - altura, width: UTIL, height: altura,
      color: e.rgb.apply(null, COR.fundo),
      borderColor: e.rgb.apply(null, COR.linha), borderWidth: 0.6
    });

    e.y -= 20;
    e.pagina.drawText('NÃO HÁ ELETROS A COMPATIBILIZAR', {
      x: MARGEM.esq + 14, y: e.y, size: 10, font: e.fontes.negrito,
      color: e.rgb.apply(null, COR.tinta), characterSpacing: 0.3
    });

    e.y -= 15;
    e.pagina.drawText(
      'O cliente declarou que nenhum aparelho conviverá com o mobiliário deste projeto.', {
      x: MARGEM.esq + 14, y: e.y, size: 8.4, font: e.fontes.media,
      color: e.rgb.apply(null, COR.suave)
    });

    e.y -= 32;
  }

  /* --------------------------------------------------------
     Tabela de um ambiente
     -------------------------------------------------------- */

  function tabelaDoAmbiente(e, amb) {
    /* Título e cabeçalho juntos: título sozinho no pé da página
       é órfão, e a primeira linha precisa caber junto. */
    caber(e, 74);

    e.pagina.drawText(String(amb.nome || '').toUpperCase(), {
      x: MARGEM.esq, y: e.y, size: 10, font: e.fontes.negrito,
      color: e.rgb.apply(null, COR.tinta), characterSpacing: 1.1
    });
    e.y -= 14;

    linhaDeTitulos(e);

    (amb.itens || []).forEach((item) => {
      const altura = alturaDaLinha(e, item);

      if (caber(e, altura + 4)) {
        /* virou a página: repete o ambiente e os títulos, senão
           a tabela da página 2 não diz de onde é */
        e.pagina.drawText(String(amb.nome || '').toUpperCase() + ' (continuação)', {
          x: MARGEM.esq, y: e.y, size: 10, font: e.fontes.negrito,
          color: e.rgb.apply(null, COR.tinta), characterSpacing: 1.1
        });
        e.y -= 14;
        linhaDeTitulos(e);
      }

      desenharLinha(e, item, altura);
    });

    e.y -= 14;
  }

  function linhaDeTitulos(e) {
    let x = MARGEM.esq;

    COLUNAS.forEach((c) => {
      const largura = e.fontes.negrito.widthOfTextAtSize(c.titulo, 6.6);
      e.pagina.drawText(c.titulo, {
        x: c.centro ? x + (c.largura - largura) / 2 : x,
        y: e.y, size: 6.6, font: e.fontes.negrito,
        color: e.rgb.apply(null, COR.apagado), characterSpacing: 0.7
      });
      x += c.largura;
    });

    e.y -= 6;
    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y, width: UTIL, height: 0.7,
      color: e.rgb.apply(null, COR.linha)
    });
    e.y -= 11;
  }

  /** As células de um item, já quebradas em linhas. */
  const CAMPOS = ['marca', 'link', 'largura', 'altura', 'prof', 'obs'];
  const intocado = (item) =>
    !item.naoTenho && CAMPOS.every((c) => !String(item[c] || '').trim());

  /* Mesma regra das duas telas: link de loja fecha o item, e as
     medidas saem da ficha do fabricante. Aqui o PDF precisa DIZER
     isso — senão o técnico mede de novo o que já está resolvido,
     ou pior, trata a linha sem número como pendência do cliente. */
  function pareceLink(valor) {
    const v = String(valor || '').trim();
    if (!v || /\s/.test(v)) return false;
    return /^https?:\/\//i.test(v) || /^[\w-]+(\.[\w-]+)+(\/|$)/.test(v);
  }

  const temMedidas = (item) =>
    ['largura', 'altura', 'prof'].every((c) => String(item[c] || '').trim());

  function celulas(e, item) {
    /* Duas linhas de aviso, não uma. "não possui" é resposta do
       cliente; "não informado" é ausência de resposta. Sair com
       travessão nas quatro colunas fazia as duas parecerem a
       mesma coisa — justamente o que o formulário separa. */
    if (item.naoTenho || intocado(item)) {
      return {
        aviso: item.naoTenho ? 'não possui' : 'não informado',
        falta: !item.naoTenho,
        item: quebrar(item.item || '', e.fontes.media, CORPO, COLUNAS[0].largura - 6)
      };
    }

    const valor = (c) => {
      const v = String(item[c] || '').trim();
      return v || '—';
    };

    const comLink = pareceLink(item.link);

    /* O link entra na mesma célula da marca, nas linhas de baixo,
       em tom mais claro. Coluna própria para ele deixaria a
       tabela estreita demais para o resto. */
    let marca = quebrar(valor('marca'), e.fontes.media, CORPO, COLUNAS[1].largura - 6);
    let linkDesde = -1;

    const temMarca = !!String(item.marca || '').trim();

    if (comLink) {
      if (!temMarca) marca = [];
      linkDesde = marca.length;
      marca = marca.concat(
        quebrar(limparLink(item.link), e.fontes.media, CORPO - 0.9, COLUNAS[1].largura - 6));

    } else if (String(item.link || '').trim()) {
      /* Escreveu no campo do link, mas não é link — "procurar no
         google", o nome da loja, um recado. É palavra do cliente:
         some daqui e ninguém mais vê. Entra junto da marca. */
      if (!temMarca) marca = [];
      marca = marca.concat(
        quebrar(String(item.link).trim(), e.fontes.media, CORPO, COLUNAS[1].largura - 6));
    }

    return {
      aviso: null,
      verLink: comLink && !temMedidas(item),
      linkDesde: linkDesde,
      item:    quebrar(item.item || '', e.fontes.media, CORPO, COLUNAS[0].largura - 6),
      marca:   marca,
      largura: [valor('largura')],
      altura:  [valor('altura')],
      prof:    [valor('prof')],
      obs:     quebrar(valor('obs'),    e.fontes.media, CORPO, COLUNAS[5].largura - 6)
    };
  }

  /** Tira o http:// e o www., que só ocupam linha. */
  function limparLink(url) {
    return String(url || '').trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '');
  }

  function alturaDaLinha(e, item) {
    const c = celulas(e, item);
    const linhas = c.aviso
      ? Math.max(1, c.item.length)
      : Math.max(c.item.length, c.marca.length, c.obs.length, 1);
    return linhas * CORPO * ENTRELINHA + 7;
  }

  function desenharLinha(e, item, altura) {
    const c = celulas(e, item);
    const topo = e.y;

    if (c.aviso) {
      escreverCelula(e, MARGEM.esq, topo, c.item, c.falta ? COR.tinta : COR.suave);
      e.pagina.drawText(c.aviso, {
        x: MARGEM.esq + COLUNAS[0].largura, y: topo,
        size: CORPO, font: c.falta ? e.fontes.negrito : e.fontes.media,
        color: e.rgb.apply(null, c.falta ? COR.falta : COR.apagado)
      });
    } else {
      let x = MARGEM.esq;

      COLUNAS.forEach((col) => {
        /* Resolvido por link e sem medida: as três colunas de
           medida viram um recado só, atravessando o espaço delas.
           Três travessões ali leriam como pendência. */
        if (c.verLink && ['largura', 'altura', 'prof'].includes(col.chave)) {
          if (col.chave === 'largura') {
            e.pagina.drawText('conferir pelo link', {
              x: x, y: topo, size: CORPO - 0.6, font: e.fontes.media,
              color: e.rgb.apply(null, COR.falta)
            });
          }
          x += col.largura;
          return;
        }

        const linhas = c[col.chave] || ['—'];
        escreverCelula(e, x, topo, linhas, COR.tinta, col,
                       col.chave === 'marca' ? c.linkDesde : -1);
        x += col.largura;
      });
    }

    e.y = topo - altura + 7;

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y + 2, width: UTIL, height: 0.4,
      color: e.rgb.apply(null, COR.linha)
    });

    e.y -= 7;
  }

  /** linkDesde: desta linha em diante o texto é endereço, e sai
      menor e mais claro, para a marca continuar sendo o que salta. */
  function escreverCelula(e, x, topo, linhas, cor, col, linkDesde) {
    const corte = (typeof linkDesde === 'number') ? linkDesde : -1;

    linhas.forEach((linha, i) => {
      const ehLink = corte >= 0 && i >= corte;
      const tamanho = ehLink ? CORPO - 0.9 : CORPO;
      const largura = e.fontes.media.widthOfTextAtSize(linha, tamanho);

      e.pagina.drawText(linha, {
        x: (col && col.centro) ? x + (col.largura - largura) / 2 : x,
        y: topo - i * CORPO * ENTRELINHA,
        size: tamanho, font: e.fontes.media,
        color: e.rgb.apply(null, ehLink ? COR.suave : cor)
      });
    });
  }

  /* --------------------------------------------------------
     Observação do cliente
     -------------------------------------------------------- */

  function observacao(e, textoObs) {
    const linhas = quebrar(textoObs, e.fontes.media, CORPO, UTIL - 20);
    caber(e, linhas.length * CORPO * ENTRELINHA + 40);

    e.pagina.drawText('OBSERVAÇÃO DO CLIENTE', {
      x: MARGEM.esq, y: e.y, size: 6.6, font: e.fontes.negrito,
      color: e.rgb.apply(null, COR.apagado), characterSpacing: 0.7
    });
    e.y -= 14;

    linhas.forEach((l) => {
      e.pagina.drawText(l, {
        x: MARGEM.esq, y: e.y, size: CORPO, font: e.fontes.media,
        color: e.rgb.apply(null, COR.tinta)
      });
      e.y -= CORPO * ENTRELINHA;
    });

    e.y -= 14;
  }

  /* --------------------------------------------------------
     Assinatura
     -------------------------------------------------------- */

  function assinatura(e, doc) {
    caber(e, 96);
    e.y -= 14;

    const assinado = doc.assinatura && doc.assinatura.modo;

    if (assinado) {
      /* Já assinado: em vez da linha em branco, o registro de
         quem assinou, quando e por qual caminho. */
      e.pagina.drawText('ASSINADO ELETRONICAMENTE', {
        x: MARGEM.esq, y: e.y, size: 6.6, font: e.fontes.negrito,
        color: e.rgb.apply(null, COR.apagado), characterSpacing: 0.7
      });
      e.y -= 14;

      e.pagina.drawText(doc.cliente || '', {
        x: MARGEM.esq, y: e.y, size: 10.5, font: e.fontes.negrito,
        color: e.rgb.apply(null, COR.tinta)
      });
      e.y -= 13;

      e.pagina.drawText(
        'em ' + dataLonga(doc.assinado_em) +
        (doc.assinatura.modo === 'presencial'
          ? ' · presencialmente, no aparelho da loja'
          : ' · por link enviado ao cliente'), {
        x: MARGEM.esq, y: e.y, size: 8, font: e.fontes.media,
        color: e.rgb.apply(null, COR.suave)
      });
      e.y -= 20;
      return;
    }

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y, width: 280, height: 0.7,
      color: e.rgb.apply(null, COR.regua)
    });
    e.y -= 12;

    e.pagina.drawText('Assinatura do cliente · ' + (doc.cliente || ''), {
      x: MARGEM.esq, y: e.y, size: 8, font: e.fontes.media,
      color: e.rgb.apply(null, COR.suave)
    });

    e.pagina.drawText('Data: ____ / ____ / ________', {
      x: MARGEM.esq + 300, y: e.y + 12, size: 9, font: e.fontes.media,
      color: e.rgb.apply(null, COR.suave)
    });

    e.y -= 20;
  }

  /* --------------------------------------------------------
     Rodapé — em todas as páginas, no fim
     -------------------------------------------------------- */

  function rodapes(e, doc) {
    const total = e.paginas.length;

    e.paginas.forEach((pagina, i) => {
      /* A loja volta no rodapé porque o logo só existe na página 1.
         Da segunda em diante, é esta linha que diz de onde veio. */
      const loja = LOJAS[doc.loja];

      const esquerda = 'Documento 102 · Dalmóbile' +
        (loja ? ' ' + loja.nome : '') + ' · ' +
        (doc.cliente || '') + (doc.contrato ? ' · ' + doc.contrato : '');

      pagina.drawText(cortar(esquerda, e.fontes.media, 7, UTIL - 60), {
        x: MARGEM.esq, y: 30, size: 7, font: e.fontes.media,
        color: e.rgb.apply(null, COR.apagado)
      });

      const nums = (i + 1) + ' / ' + total;
      const largura = e.fontes.media.widthOfTextAtSize(nums, 7);
      pagina.drawText(nums, {
        x: PAGINA.largura - MARGEM.dir - largura, y: 30,
        size: 7, font: e.fontes.media,
        color: e.rgb.apply(null, COR.apagado)
      });

      /* A procedência do papel: preenchido pelo cliente, online,
         em tal dia. Sem isto, impresso vira papel sem origem. */
      pagina.drawText(
        'Preenchido pelo cliente em ' + dataLonga(doc.preenchido_em || doc.atualizado_em) +
        ' · materiais.luminamkt.co', {
        x: MARGEM.esq, y: 20, size: 6.4, font: e.fontes.media,
        color: e.rgb.apply(null, COR.apagado)
      });
    });
  }

  /* --------------------------------------------------------
     Texto
     -------------------------------------------------------- */

  function texto(e, conteudo, tamanho, peso, cor, extra) {
    const o = extra || {};
    const fonte = e.fontes[peso] || e.fontes.media;
    const linhas = o.largura
      ? quebrar(conteudo, fonte, tamanho, o.largura)
      : [conteudo];

    linhas.forEach((l) => {
      e.pagina.drawText(l, {
        x: MARGEM.esq, y: e.y, size: tamanho, font: fonte,
        color: e.rgb.apply(null, cor),
        characterSpacing: o.espacamento || 0
      });
      e.y -= tamanho * ENTRELINHA;
    });
  }

  /** Quebra por palavra, e parte a palavra que sozinha não cabe. */
  function quebrar(conteudo, fonte, tamanho, largura) {
    const limpo = String(conteudo == null ? '' : conteudo).trim();
    if (!limpo) return [''];

    const linhas = [];

    limpo.split(/\n/).forEach((paragrafo) => {
      let atual = '';

      paragrafo.split(/\s+/).forEach((palavra) => {
        const tentativa = atual ? atual + ' ' + palavra : palavra;

        if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) {
          atual = tentativa;
          return;
        }

        if (atual) { linhas.push(atual); atual = ''; }

        /* Palavra maior que a coluna inteira: corta no meio, que
           é melhor do que deixar vazar por cima da coluna vizinha. */
        let resto = palavra;
        while (fonte.widthOfTextAtSize(resto, tamanho) > largura && resto.length > 1) {
          let corte = resto.length;
          while (corte > 1 &&
                 fonte.widthOfTextAtSize(resto.slice(0, corte), tamanho) > largura) corte--;
          linhas.push(resto.slice(0, corte));
          resto = resto.slice(corte);
        }
        atual = resto;
      });

      linhas.push(atual);
    });

    return linhas.length ? linhas : [''];
  }

  function cortar(conteudo, fonte, tamanho, largura) {
    let t = String(conteudo || '');
    if (fonte.widthOfTextAtSize(t, tamanho) <= largura) return t;
    while (t.length > 1 && fonte.widthOfTextAtSize(t + '…', tamanho) > largura) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  /* --------------------------------------------------------
     Datas
     -------------------------------------------------------- */

  function dataCurta(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return '—';
    return d.toLocaleDateString('pt-BR');
  }

  function dataLonga(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return 'data não registrada';
    return d.toLocaleDateString('pt-BR') + ' às ' +
           d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  /* --------------------------------------------------------
     Nome do arquivo
     -------------------------------------------------------- */

  function nomeDoArquivo(doc) {
    const limpo = String(doc.cliente || 'cliente')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    return 'checklist-eletros-' + limpo + (doc.contrato ? '-' + doc.contrato : '') + '.pdf';
  }

  return { montar, nomeDoArquivo };
})();

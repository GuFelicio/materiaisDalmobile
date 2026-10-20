/* ============================================================
   CHECKLIST DE MONTAGEM — Dalmóbile
   ------------------------------------------------------------
   Controle interno de qualidade da montagem. Quem preenche é o
   responsável pela obra, conferindo o trabalho da equipe. O
   cliente não vê nem assina: este documento é prova de processo
   para a loja, não contrato com o comprador.

   É por isso que ele NÃO tem termo de responsabilidade nem
   linha de assinatura do cliente, ao contrário do Documento 101.
   Se um dia virar documento de aceite, isso muda — e aí muda
   junto a conversa sobre assinatura eletrônica.

   QUATRO BLOCOS, 36 ITENS, DOIS VOCABULÁRIOS
   Os três primeiros blocos respondem Sim / Não; a vistoria final
   responde Conforme / Não conforme. É assim no papel que a
   equipe já usa, e uniformizar na tela afastaria o documento
   digital do impresso sem ganhar nada.

   DUAS TROCAS DELIBERADAS EM RELAÇÃO AO ORIGINAL
   O papel diz "plástico Todeschini" e "Emblema Todeschini".
   Todeschini é concorrente; o documento é da Dalmóbile. Ambos
   passaram a dizer Dalmóbile. Se a loja usar outro termo, é
   aqui que se corrige, e em nenhum outro lugar.

   USO
       const bytes = await PDFMontagem.montar(doc);
       PDFMontagem.nomeDoArquivo(doc);
       PDFMontagem.BLOCOS        // fonte única dos itens
   ============================================================ */

const PDFMontagem = (function () {
  'use strict';

  const PAGINA = { largura: 595.28, altura: 841.89 };
  const MARGEM = { esq: 42, dir: 42, topo: 48, baixo: 54 };

  const UTIL = PAGINA.largura - MARGEM.esq - MARGEM.dir;   // 511.28

  /* Somam a largura útil. Mexer aqui é mexer na tabela inteira. */
  const COLUNAS = { item: 236, resposta: 95, obs: 180.28 };

  const COR = {
    tinta:   [0.08, 0.09, 0.09],
    suave:   [0.45, 0.47, 0.48],
    apagado: [0.62, 0.64, 0.65],
    linha:   [0.80, 0.81, 0.80],
    falta:   [0.54, 0.29, 0.07],
    reprova: [0.60, 0.15, 0.13],
    aprova:  [0.13, 0.40, 0.22],
    regua:   [0.08, 0.09, 0.09],
    fundo:   [0.95, 0.95, 0.94],
    campo:   [0.97, 0.97, 0.96]
  };

  const CORPO = 8.6;
  const ENTRELINHA = 1.34;

  const LOJAS = {
    sjc: { nome: 'São José dos Campos', logo: 'imgs/dalmoSJC_preto_1.png' },
    cgt: { nome: 'Caraguatatuba',       logo: 'imgs/logoDalmo_caraguaPreto.png' }
  };

  const ALTURA_LOGO = 26;


  /* --------------------------------------------------------
     Os itens
     --------------------------------------------------------
     Fonte única: a tela lê daqui, o PDF escreve daqui. Os
     códigos (p1, c1, l1, v1) são a chave das respostas e não
     podem mudar depois que houver documento gravado — mudar um
     código é perder a resposta que estava nele.
     -------------------------------------------------------- */

  const BLOCOS = [
    {
      id: 'preparacao',
      titulo: 'PREPARAÇÃO E ORGANIZAÇÃO INICIAL',
      vocabulario: 'simNao',
      itens: [
        { id: 'p1', texto: 'Equipe uniformizada e boa apresentação' },
        { id: 'p2', texto: 'Móveis existentes devidamente isolados/protegidos' },
        { id: 'p3', texto: 'Cantoneiras colocadas nas áreas de circulação' },
        { id: 'p4', texto: 'Piso totalmente forrado antes do início da montagem' },
        { id: 'p5', texto: 'Tapete ou forração para apoiar ferramentas' },
        { id: 'p6', texto: 'Bancada de trabalho (não utilizar móveis como bancada)' },
        { id: 'p7', texto: 'Equipamentos de segurança sendo utilizados pela equipe (EPIs)' },
        /* Era "plástico Todeschini" no papel. */
        { id: 'p8', texto: 'Isolamento do ambiente finalizado com plástico Dalmóbile' }
      ]
    },
    {
      id: 'cuidados',
      titulo: 'CUIDADOS DURANTE A MONTAGEM',
      vocabulario: 'simNao',
      itens: [
        { id: 'c1', texto: 'Peças apoiadas nas paredes' },
        { id: 'c2', texto: 'Área de montagem organizada e livre de obstáculos' },
        { id: 'c3', texto: 'Utilização adequada de tapa-furos (havia a necessidade?)' },
        { id: 'c4', texto: 'Padrão simétrico de tapa-furos' },
        { id: 'c5', texto: 'Colocação de capinha nas dobradiças' },
        { id: 'c6', texto: 'Colocação do acabamento no VB' },
        { id: 'c7', texto: 'Regulagens de portas e gavetas' },
        { id: 'c8', texto: 'Acabamentos' },
        { id: 'c9', texto: 'Projeto montado conforme o Caderno de Montagem' }
      ]
    },
    {
      id: 'limpeza',
      titulo: 'LIMPEZA E MANUTENÇÃO DA ÁREA',
      vocabulario: 'simNao',
      itens: [
        { id: 'l1', texto: 'Lixo removido periodicamente' },
        { id: 'l2', texto: 'Separação de resíduos recicláveis e não recicláveis' },
        { id: 'l3', texto: 'Proteções de piso, paredes e móveis mantidas durante a montagem' },
        { id: 'l4', texto: 'Área entregue limpa ao final do dia' }
      ]
    },
    {
      id: 'vistoria',
      titulo: 'VISTORIA FINAL',
      vocabulario: 'conforme',
      itens: [
        { id: 'v1',  texto: 'Acabamento interno' },
        { id: 'v2',  texto: 'Acabamento externo' },
        { id: 'v3',  texto: 'Regulagem de portas e gavetas' },
        { id: 'v4',  texto: 'Regulagem de corrediças e dobradiças' },
        { id: 'v5',  texto: 'Acabamentos gerais' },
        { id: 'v6',  texto: 'Aplicação de tapa-furo' },
        { id: 'v7',  texto: 'Acesso aos pontos de elétrica, gás e água' },
        { id: 'v8',  texto: 'Recolhimento total de sobras e resíduos' },
        { id: 'v9',  texto: 'Alinhamento de puxadores' },
        { id: 'v10', texto: 'Aplicação de amortecedores' },
        { id: 'v11', texto: 'Remoção de riscos de lápis' },
        { id: 'v12', texto: 'Funcionalidade de acessórios' },
        { id: 'v13', texto: 'Nivelamento dos móveis' },
        /* Era "Emblema Todeschini" no papel. */
        { id: 'v14', texto: 'Emblema Dalmóbile' },
        { id: 'v15', texto: 'Limpeza do ambiente e dos móveis' }
      ]
    }
  ];

  /* Duas palavras para a mesma coisa, porque é assim no papel.
     A chave interna ('ok' / 'nao' / 'na') é única — só o rótulo
     muda. Assim a contagem funciona nos quatro blocos sem
     exceção e sem cada bloco inventar o seu próprio estado. */
  const VOCABULARIO = {
    simNao:   { ok: 'Sim',      nao: 'Não',          na: 'Não se aplica', curto: 'SIM / NÃO' },
    conforme: { ok: 'Conforme', nao: 'Não conforme', na: 'Não se aplica', curto: 'C / NC' }
  };

  function rotulo(bloco, resposta) {
    const v = VOCABULARIO[bloco.vocabulario] || VOCABULARIO.simNao;
    return v[resposta] || null;
  }

  /** Todos os itens dos quatro blocos, em ordem, com o bloco junto. */
  function todosOsItens() {
    const saida = [];
    BLOCOS.forEach(function (b) {
      b.itens.forEach(function (i) { saida.push({ bloco: b, item: i }); });
    });
    return saida;
  }

  /** Conta respostas. Serve ao PDF e à barra da tela. */
  function contar(dados) {
    const r = (dados && dados.itens) || {};
    const c = { total: 0, ok: 0, nao: 0, na: 0, faltam: 0 };

    todosOsItens().forEach(function (par) {
      c.total += 1;
      const v = (r[par.item.id] || {}).resposta;
      if (v === 'ok') c.ok += 1;
      else if (v === 'nao') c.nao += 1;
      else if (v === 'na') c.na += 1;
      else c.faltam += 1;
    });

    return c;
  }


  /* --------------------------------------------------------
     Entrada
     -------------------------------------------------------- */

  async function montar(doc) {
    const { PDFDocument, rgb } = window.PDFLib;

    const pdf = await PDFDocument.create();
    pdf.setTitle('Checklist de montagem — ' + (doc.cliente || ''));
    pdf.setSubject('Controle interno de montagem');
    pdf.setProducer('Dalmóbile · Central de Peças');

    const fontes = await carregarFontes(pdf);
    const logo = await carregarLogo(pdf, doc.loja);
    const fotos = await embutirFotos(pdf, doc.fotos);

    const e = { pdf, rgb, fontes, logo, fotos, pagina: null, y: 0, numero: 0, paginas: [] };
    const dados = doc.dados || {};

    novaPagina(e);
    cabecalho(e, doc, dados);

    BLOCOS.forEach(function (b) { desenharBloco(e, b, dados); });

    if (String(dados.observacoes || '').trim()) {
      blocoDeTexto(e, 'OBSERVAÇÕES GERAIS E NÃO CONFORMIDADES',
                   String(dados.observacoes).trim());
    }

    assinaturaDoResponsavel(e, dados);
    rodapes(e, doc);

    return await pdf.save();
  }


  /* --------------------------------------------------------
     Fontes, logo e fotos
     -------------------------------------------------------- */

  async function carregarFontes(pdf) {
    const { StandardFonts } = window.PDFLib;

    try {
      pdf.registerFontkit(window.fontkit);
      const [m, n] = await Promise.all([baixar('Krub-Medium.ttf'), baixar('Krub-Bold.ttf')]);
      return {
        media:   await pdf.embedFont(m, { subset: true }),
        negrito: await pdf.embedFont(n, { subset: true })
      };
    } catch (err) {
      console.warn('Krub não carregou; o PDF sai em Helvetica.', err);
      return {
        media:   await pdf.embedFont(StandardFonts.Helvetica),
        negrito: await pdf.embedFont(StandardFonts.HelveticaBold)
      };
    }
  }

  async function carregarLogo(pdf, loja) {
    const conf = LOJAS[loja];
    if (!conf) return null;

    try {
      const png = await pdf.embedPng(await baixar(conf.logo));
      const escala = ALTURA_LOGO / png.height;
      return { png, largura: png.width * escala, altura: ALTURA_LOGO };
    } catch (err) {
      console.warn('Logo de ' + loja + ' não carregou.', err);
      return null;
    }
  }

  async function embutirFotos(pdf, mapa) {
    const saida = {};
    if (!mapa) return saida;

    for (const id of Object.keys(mapa)) {
      try {
        saida[id] = await pdf.embedJpg(mapa[id]);
      } catch (err) {
        console.warn('Foto ' + id + ' não entrou no PDF.', err);
      }
    }
    return saida;
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

  function caber(e, altura) {
    if (e.y - altura < MARGEM.baixo) { novaPagina(e); return true; }
    return false;
  }


  /* --------------------------------------------------------
     Cabeçalho
     -------------------------------------------------------- */

  function cabecalho(e, doc, dados) {
    if (e.logo) {
      e.y -= e.logo.altura;
      e.pagina.drawImage(e.logo.png, {
        x: MARGEM.esq, y: e.y, width: e.logo.largura, height: e.logo.altura
      });
      e.y -= 26;
    }

    texto(e, 'CHECKLIST DE MONTAGEM', 15, 'negrito', COR.tinta, { espacamento: 0.4 });
    e.y -= 8;

    texto(e,
      'Controle interno de qualidade. Preenchido pelo responsável durante e ao ' +
      'final da montagem.',
      CORPO, 'media', COR.suave, { largura: UTIL });
    e.y -= 14;

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y, width: UTIL, height: 1.1, color: e.rgb.apply(null, COR.regua)
    });
    e.y -= 18;

    campoEm(e, MARGEM.esq, 'CLIENTE', doc.cliente || '—', UTIL);
    e.y -= 6;

    const terco = UTIL / 3;
    const yAntes = e.y;
    campoEm(e, MARGEM.esq, 'Nº DO CONTRATO', doc.contrato || '—', terco - 10);
    const yDepois = e.y;

    e.y = yAntes;
    campoEm(e, MARGEM.esq + terco, 'AMBIENTE', dados.ambiente || '—', terco - 10);

    e.y = yAntes;
    campoEm(e, MARGEM.esq + terco * 2, 'DATA',
            dataCurta(doc.preenchido_em || doc.atualizado_em), terco - 10);

    e.y = Math.min(yDepois, e.y);
    e.y -= 22;

    resumo(e, dados);
  }

  /* O número que o supervisor quer ver primeiro: quantas não
     conformidades saíram daquela montagem. Enterrar isso no meio
     de 36 linhas é desperdiçar o documento. */
  function resumo(e, dados) {
    const c = contar(dados);

    const partes = [
      { texto: c.total + ' itens', cor: COR.suave, peso: 'media' },
      { texto: c.ok + ' conformes', cor: COR.aprova, peso: 'negrito' }
    ];

    if (c.nao)    partes.push({ texto: c.nao + ' não conformes', cor: COR.reprova, peso: 'negrito' });
    if (c.na)     partes.push({ texto: c.na + ' não se aplica',  cor: COR.suave,   peso: 'media' });
    if (c.faltam) partes.push({ texto: c.faltam + ' sem resposta', cor: COR.falta, peso: 'negrito' });

    const altura = 26;
    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y - altura + 8, width: UTIL, height: altura,
      color: e.rgb.apply(null, COR.fundo)
    });

    let x = MARGEM.esq + 12;
    partes.forEach(function (p, i) {
      if (i) {
        e.pagina.drawText('·', {
          x: x, y: e.y - 9, size: 9, font: e.fontes.media,
          color: e.rgb.apply(null, COR.apagado)
        });
        x += 9;
      }

      e.pagina.drawText(p.texto, {
        x: x, y: e.y - 9, size: 9, font: e.fontes[p.peso],
        color: e.rgb.apply(null, p.cor)
      });
      x += e.fontes[p.peso].widthOfTextAtSize(p.texto, 9) + 7;
    });

    e.y -= altura + 14;
  }

  function campoEm(e, x, nome, valor, largura) {
    e.pagina.drawText(nome, {
      x: x, y: e.y, size: 6.6, font: e.fontes.negrito,
      color: e.rgb.apply(null, COR.apagado), characterSpacing: 0.5
    });
    e.y -= 11;

    quebrar(valor, e.fontes.media, 10.5, largura).forEach(function (l) {
      e.pagina.drawText(l, {
        x: x, y: e.y, size: 10.5, font: e.fontes.media, color: e.rgb.apply(null, COR.tinta)
      });
      e.y -= 10.5 * ENTRELINHA;
    });

    e.y -= 2;
    e.pagina.drawRectangle({
      x: x, y: e.y + 4, width: largura, height: 0.6, color: e.rgb.apply(null, COR.linha)
    });
  }


  /* --------------------------------------------------------
     Os blocos
     -------------------------------------------------------- */

  function desenharBloco(e, bloco, dados) {
    /* Título e cabeçalho da tabela precisam de pelo menos uma
       linha abaixo deles, senão sobra um título órfão no pé da
       página. */
    caber(e, 70);

    titulo(e, bloco.titulo);
    linhaDeTitulos(e, bloco);

    bloco.itens.forEach(function (item) {
      desenharItem(e, bloco, item, (dados.itens || {})[item.id] || {});
    });

    e.y -= 14;
  }

  function linhaDeTitulos(e, bloco) {
    const v = VOCABULARIO[bloco.vocabulario] || VOCABULARIO.simNao;

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y - 14, width: UTIL, height: 14,
      color: e.rgb.apply(null, COR.fundo)
    });

    /* "CONFORME / NÃO CONFORME" não cabe em 95pt e saía cortado.
       O próprio documento já abrevia: C e NC. */
    const titulos = ['ITEM', v.curto, 'OBSERVAÇÃO'];
    const larguras = [COLUNAS.item, COLUNAS.resposta, COLUNAS.obs];

    let x = MARGEM.esq;
    titulos.forEach(function (t, i) {
      e.pagina.drawText(cortar(t, e.fontes.negrito, 6.6, larguras[i] - 8), {
        x: x + 4, y: e.y - 10, size: 6.6, font: e.fontes.negrito,
        color: e.rgb.apply(null, COR.suave), characterSpacing: 0.5
      });
      x += larguras[i];
    });

    e.y -= 14;
    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y, width: UTIL, height: 0.6, color: e.rgb.apply(null, COR.regua)
    });
  }

  function desenharItem(e, bloco, item, resposta) {
    const fotos = (resposta.fotos || []).filter(function (f) { return e.fotos[f.id || f]; });

    const linhasItem = quebrar(item.texto, e.fontes.media, CORPO, COLUNAS.item - 10);
    const linhasObs  = quebrar(String(resposta.obs || ''), e.fontes.media, CORPO, COLUNAS.obs - 10);

    const altura = Math.max(linhasItem.length, linhasObs.length || 1) * (CORPO * ENTRELINHA) + 9;
    const alturaFotos = fotos.length ? alturaDasFotos(e, fotos) : 0;

    /* Linha e fotos andam juntas: a foto é a prova da não
       conformidade e não pode cair longe do item que a gerou. */
    if (e.y - (altura + alturaFotos) < MARGEM.baixo &&
        (altura + alturaFotos) <= PAGINA.altura - MARGEM.topo - MARGEM.baixo) {
      novaPagina(e);
      linhaDeTitulos(e, bloco);
    }

    const naoConforme = resposta.resposta === 'nao';

    /* Não conformidade ganha fundo: num documento de 36 linhas,
       é o que o supervisor procura ao abrir. */
    if (naoConforme) {
      e.pagina.drawRectangle({
        x: MARGEM.esq, y: e.y - altura, width: UTIL, height: altura,
        color: e.rgb(0.99, 0.95, 0.94)
      });
    }

    let yy = e.y - 4;
    linhasItem.forEach(function (l) {
      e.pagina.drawText(l, {
        x: MARGEM.esq + 4, y: yy - CORPO, size: CORPO,
        font: naoConforme ? e.fontes.negrito : e.fontes.media,
        color: e.rgb.apply(null, COR.tinta)
      });
      yy -= CORPO * ENTRELINHA;
    });

    /* Resposta */
    const marcado = rotulo(bloco, resposta.resposta);
    const cor = resposta.resposta === 'ok'  ? COR.aprova
              : resposta.resposta === 'nao' ? COR.reprova
              : resposta.resposta === 'na'  ? COR.suave
                                            : COR.falta;

    e.pagina.drawText(marcado || 'não respondido', {
      x: MARGEM.esq + COLUNAS.item + 4, y: e.y - 4 - CORPO, size: CORPO,
      font: (resposta.resposta === 'ok' || resposta.resposta === 'na')
              ? e.fontes.media : e.fontes.negrito,
      color: e.rgb.apply(null, cor)
    });

    /* Observação */
    if (linhasObs.length && linhasObs[0]) {
      let yo = e.y - 4;
      linhasObs.forEach(function (l) {
        e.pagina.drawText(l, {
          x: MARGEM.esq + COLUNAS.item + COLUNAS.resposta + 4, y: yo - CORPO,
          size: CORPO, font: e.fontes.media, color: e.rgb.apply(null, COR.tinta)
        });
        yo -= CORPO * ENTRELINHA;
      });
    }

    e.y -= altura;
    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y, width: UTIL, height: 0.5, color: e.rgb.apply(null, COR.linha)
    });

    if (fotos.length) desenharFotos(e, fotos);
  }


  /* --------------------------------------------------------
     Fotos
     -------------------------------------------------------- */

  const FOTO = { largura: (UTIL - 16 - 10) / 2, teto: 130, vao: 10 };

  function linhasDeFotos(e, fotos) {
    const linhas = [];

    for (let i = 0; i < fotos.length; i += 2) {
      const medidas = fotos.slice(i, i + 2).map(function (f) {
        const img = e.fotos[f.id || f];
        const escala = Math.min(FOTO.largura / img.width, FOTO.teto / img.height);
        return {
          img: img,
          largura: img.width * escala,
          altura: img.height * escala,
          legenda: String(f.legenda || '').trim()
        };
      });

      const altura = Math.max.apply(null, medidas.map(function (m) { return m.altura; }));
      const temLegenda = medidas.some(function (m) { return m.legenda; });

      linhas.push({ medidas: medidas, altura: altura, total: altura + (temLegenda ? 16 : 6) });
    }

    return linhas;
  }

  function alturaDasFotos(e, fotos) {
    return linhasDeFotos(e, fotos).reduce(function (s, l) { return s + l.total; }, 0) + 10;
  }

  function desenharFotos(e, fotos) {
    e.y -= 8;

    linhasDeFotos(e, fotos).forEach(function (linha) {
      caber(e, linha.total + 6);

      let x = MARGEM.esq + 16;
      linha.medidas.forEach(function (m) {
        e.pagina.drawImage(m.img, { x: x, y: e.y - m.altura, width: m.largura, height: m.altura });

        if (m.legenda) {
          e.pagina.drawText(cortar(m.legenda, e.fontes.media, 7, FOTO.largura), {
            x: x, y: e.y - linha.altura - 10, size: 7, font: e.fontes.media,
            color: e.rgb.apply(null, COR.suave)
          });
        }

        x += FOTO.largura + FOTO.vao;
      });

      e.y -= linha.total;
    });

    e.y -= 4;
  }


  /* --------------------------------------------------------
     Fecho
     -------------------------------------------------------- */

  function assinaturaDoResponsavel(e, dados) {
    caber(e, 76);
    e.y -= 14;

    const nome = String(dados.responsavel || '').trim();

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y, width: 280, height: 0.8, color: e.rgb.apply(null, COR.regua)
    });
    e.y -= 12;

    e.pagina.drawText(nome || 'nome não informado', {
      x: MARGEM.esq, y: e.y, size: 10, font: e.fontes.negrito,
      color: e.rgb.apply(null, nome ? COR.tinta : COR.falta)
    });
    e.y -= 12;

    e.pagina.drawText('Responsável pelo preenchimento', {
      x: MARGEM.esq, y: e.y, size: 7.4, font: e.fontes.media,
      color: e.rgb.apply(null, COR.suave)
    });
    e.y -= 20;
  }

  function rodapes(e, doc) {
    const total = e.paginas.length;

    e.paginas.forEach(function (pagina, i) {
      const loja = LOJAS[doc.loja];

      const esquerda = 'Checklist de montagem · Dalmóbile' +
        (loja ? ' ' + loja.nome : '') + ' · ' +
        (doc.cliente || '') + (doc.contrato ? ' · ' + doc.contrato : '');

      pagina.drawText(cortar(esquerda, e.fontes.media, 7, UTIL - 60), {
        x: MARGEM.esq, y: 30, size: 7, font: e.fontes.media,
        color: e.rgb.apply(null, COR.apagado)
      });

      const nums = (i + 1) + ' / ' + total;
      pagina.drawText(nums, {
        x: PAGINA.largura - MARGEM.dir - e.fontes.media.widthOfTextAtSize(nums, 7),
        y: 30, size: 7, font: e.fontes.media, color: e.rgb.apply(null, COR.apagado)
      });

      const resp = String((doc.dados || {}).responsavel || '').trim();
      pagina.drawText(
        'Documento interno de qualidade' + (resp ? ' · ' + resp : '') + ' · ' +
        dataLonga(doc.preenchido_em || doc.atualizado_em), {
        x: MARGEM.esq, y: 20, size: 6.4, font: e.fontes.media,
        color: e.rgb.apply(null, COR.apagado)
      });
    });
  }


  /* --------------------------------------------------------
     Peças comuns
     -------------------------------------------------------- */

  function titulo(e, rot) {
    e.pagina.drawText(rot, {
      x: MARGEM.esq, y: e.y - 10, size: 9.4, font: e.fontes.negrito,
      color: e.rgb.apply(null, COR.tinta), characterSpacing: 0.5
    });
    e.y -= 18;

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y, width: UTIL, height: 0.9, color: e.rgb.apply(null, COR.regua)
    });
    e.y -= 12;
  }

  function blocoDeTexto(e, rot, valor) {
    const linhas = quebrar(valor, e.fontes.media, 8.8, UTIL - 24);
    caber(e, linhas.length * (8.8 * 1.4) + 40);

    titulo(e, rot);

    linhas.forEach(function (l) {
      caber(e, 12);
      e.pagina.drawText(l, {
        x: MARGEM.esq, y: e.y, size: 8.8, font: e.fontes.media,
        color: e.rgb.apply(null, COR.tinta)
      });
      e.y -= 8.8 * 1.4;
    });

    e.y -= 14;
  }

  function texto(e, conteudo, tamanho, peso, cor, extra) {
    const o = extra || {};
    const fonte = e.fontes[peso] || e.fontes.media;
    const linhas = o.largura ? quebrar(conteudo, fonte, tamanho, o.largura) : [conteudo];

    linhas.forEach(function (l) {
      caber(e, tamanho * ENTRELINHA + 4);
      e.pagina.drawText(l, {
        x: MARGEM.esq, y: e.y, size: tamanho, font: fonte,
        color: e.rgb.apply(null, cor), characterSpacing: o.espacamento || 0
      });
      e.y -= tamanho * ENTRELINHA;
    });
  }

  function quebrar(conteudo, fonte, tamanho, largura) {
    const limpo = String(conteudo == null ? '' : conteudo).trim();
    if (!limpo) return [''];

    const linhas = [];

    limpo.split(/\n/).forEach(function (paragrafo) {
      let atual = '';

      paragrafo.split(/\s+/).forEach(function (palavra) {
        const tentativa = atual ? atual + ' ' + palavra : palavra;

        if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) {
          atual = tentativa;
          return;
        }

        if (atual) { linhas.push(atual); atual = ''; }

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
    while (t.length > 1 && fonte.widthOfTextAtSize(t + '…', tamanho) > largura) t = t.slice(0, -1);
    return t + '…';
  }

  function dataCurta(iso) {
    const d = new Date(iso);
    return (!iso || isNaN(d)) ? '—' : d.toLocaleDateString('pt-BR');
  }

  function dataLonga(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return 'data não registrada';
    return d.toLocaleDateString('pt-BR') + ' às ' +
           d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function nomeDoArquivo(doc) {
    const limpo = String(doc.cliente || 'cliente')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

    return 'checklist-montagem-' + limpo + (doc.contrato ? '-' + doc.contrato : '') + '.pdf';
  }

  return {
    montar: montar,
    nomeDoArquivo: nomeDoArquivo,
    BLOCOS: BLOCOS,
    VOCABULARIO: VOCABULARIO,
    rotulo: rotulo,
    contar: contar,
    todosOsItens: todosOsItens
  };
})();

/* const no topo de um script não vira propriedade de window.
   Sem esta linha, window.PDFMontagem é undefined e a tela
   conclui, errado, que o gerador não carregou. */
window.PDFMontagem = PDFMontagem;

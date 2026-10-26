/* ============================================================
   PEÇAS DESENHADAS AQUI — Central de Peças · Dalmóbile
   ------------------------------------------------------------
   Substitui o Apps Script: a peça é montada no próprio
   navegador, sem rede, sem cota do Google e sem espera.

   POR QUE NÃO USAR IMAGEM DE FUNDO
   A arte dessas peças é um fundo chapado, meia dúzia de riscos
   finos e texto. Tudo isso é vetor. Desenhando em código, o PDF
   sai nítido em qualquer ampliação — hoje ele é um raster de
   96 DPI, e é isso que faz o cartão impresso parecer mole.
   Um fundo em imagem jogaria essa qualidade fora de novo.

   COMO AS MEDIDAS FORAM OBTIDAS
   Não foram estimadas no olho: saíram da análise pixel a pixel
   do PDF que o Apps Script gerava. Cada bloco abaixo traz a
   medida em milímetros sobre a folha A4.

   AO AJUSTAR
   Mexa só no bloco MEDIDAS. Nada mais no arquivo depende de
   número cravado.
   ============================================================ */

window.Pecas = (function () {
  'use strict';

  const MM = 72 / 25.4;            /* milímetro → ponto PostScript */
  const A4 = { largura: 210, altura: 297 };


  /* ========================================================
     MEDIDAS — mexer SÓ AQUI
     --------------------------------------------------------
     Tudo em milímetros, contados a partir do CANTO SUPERIOR
     ESQUERDO da folha. O PDF conta de baixo para cima; a
     conversão acontece num lugar só, na função ponto().
     ======================================================== */

  const BOAS_VINDAS = {
    /* O cartão A6, encostado no canto da folha. As marcas de
       corte caem exatamente nestas bordas. */
    cartao: { largura: 105.4, altura: 147.84 },

    /* O bloco cinza não é o cartão inteiro: o rodapé com a logo
       fica na faixa branca abaixo dele. */
    bloco: { x: 5.3, y: 6.4, largura: 94.0, altura: 122.1 },

    /* As três linhas do topo são alinhadas à DIREITA, todas
       terminando na mesma coluna. */
    colunaDireita: 89.9,
    linhas: [
      { base: 26.00, peso: 'medium' },   /* SEJA / SEJAM        */
      { base: 36.86, peso: 'medium' },   /* BEM-VINDO / -A / -S */
      { base: 47.96, peso: 'bold'   }    /* À DALMÓBILE!        */
    ],
    /* Os corpos NÃO foram estimados no olho. A mancha de cada
       linha foi medida no PDF antigo e resolvida contra as
       métricas da Krub: a caixa alta vale 0,700 em, e a mancha
       de '{{SEJA}}' vale 0,907 em. Daí sai 22 pt.

       E as bases abaixo são a LINHA DE BASE, não o pé da
       mancha: as chaves do modelo desciam 0,76 mm abaixo dela,
       e usar o pé da mancha deixaria tudo baixo por essa
       diferença. */
    corpoTopo: 22.0,

    /* O nome do cliente encolhe se não couber — era o que o
       Apps Script fazia, e sem isso nome comprido estoura a
       largura do cartão. */
    nome: { x: 9.0, base: 102.69, corpo: 25.8, corpoMinimo: 19, larguraMaxima: 86,
            /* Nome comprido QUEBRA antes de encolher: ler
               "Maximiliano Wenceslau de / Albuquerque" em dois
               tempos é melhor que ler tudo miúdo numa linha só.
               A quebra acontece só em espaço — cortar sobrenome
               ao meio seria pior que qualquer das duas coisas.

               A ÚLTIMA linha fica na base original e as outras
               sobem: acima do nome o bloco está vazio, abaixo
               dele vem o filete. Crescer para baixo bateria
               nele. */
            linhas: 2, entrelinha: 1.15 },

    filete: { y: 109.2, x1: 43.6, x2: 99.3, espessura: 0.3 },

    /* Os riscos do canto. Medidos um a um no PDF antigo; são a
       assinatura visual da marca e some-los deixaria o cartão
       com cara de rascunho. Espessura e cor vieram da arte em
       tamanho original, não desta peça — aqui eles estão
       reduzidos e o JPEG os clareia. */
    riscos: [
      { x: 16.42, y:  7.42, largura: 0.30, altura: 4.24 },
      { x:  6.36, y: 11.39, largura: 5.03, altura: 0.30 },
      { x: 26.75, y: 11.66, largura: 0.30, altura: 4.50 },
      { x: 16.68, y: 16.16, largura: 5.03, altura: 0.30 },
      { x: 11.12, y: 16.43, largura: 0.30, altura: 4.50 },
      { x: 27.01, y: 20.67, largura: 5.03, altura: 0.30 }
    ],

    rodape: { x: 6.4, base1: 137.64, base2: 141.44, corpo: 9.3, texto: ['CRIE O', 'SEU MUNDO'] },

    /* A logo é ancorada pela BASE e pela largura: cada loja tem
       uma proporção um pouco diferente, e ancorar pelo topo
       faria uma delas descer. */
    logo: { x: 69.9, baixo: 141.7, largura: 25.7 },

    cores: {
      bloco:  '#e6e5e3',
      texto:  '#52514f',
      rodape: '#a4a4a4',
      filete: '#c2c1c0',
      risco:  '#a09f9d',
      corte:  '#d4d3d2'
    }
  };

  /* As palavras que mudam com o gênero. Vieram do Apps Script,
     sem alteração: trocar aqui muda a peça inteira. */
  const FLEXOES = {
    ele:  { seja: 'SEJA',  bemVindo: 'BEM-VINDO'  },
    ela:  { seja: 'SEJA',  bemVindo: 'BEM-VINDA'  },
    eles: { seja: 'SEJAM', bemVindo: 'BEM-VINDOS' },
    elas: { seja: 'SEJAM', bemVindo: 'BEM-VINDAS' }
  };

  const LOGOS = {
    sjc: 'imgs/dalmoSJC_preto_1.png',
    cgt: 'imgs/logoDalmo_caraguaPreto.png'
  };


  /* ------------------------------------------------------------
     Apoio
     ------------------------------------------------------------ */

  /* Um cache por carregamento da página: a fonte tem 80 KB e não
     faz sentido buscá-la de novo a cada peça gerada. */
  const guardados = {};

  async function bytesDe(caminho) {
    if (guardados[caminho]) return guardados[caminho];
    const r = await fetch(caminho);
    if (!r.ok) throw new Error('Não encontrei ' + caminho);
    guardados[caminho] = new Uint8Array(await r.arrayBuffer());
    return guardados[caminho];
  }

  function cor(hex) {
    const n = parseInt(hex.slice(1), 16);
    return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  /* A medida vem de cima; o PDF conta de baixo. A inversão mora
     só aqui — em qualquer outro lugar seria fonte de erro. */
  function ponto(mmDeCima) {
    return (A4.altura - mmDeCima) * MM;
  }

  /* Encolhe até caber.
     ------------------------------------------------------------
     O 'mínimo' é estético: abaixo dele o nome fica miúdo demais
     para um cartão impresso. Mas VAZAR PARA FORA DO CARTÃO é
     pior que ficar miúdo — e era o que acontecia, porque o
     código antigo parava no mínimo e desenhava assim mesmo.

     Então são dois limites: o mínimo bonito e um piso absoluto.
     Entre os dois, o nome encolhe. Abaixo do piso, ele é cortado
     com reticências — um nome de 60 letras não cabe em cartão
     nenhum, e cortar avisa que foi cortado. */
  const PISO = 11;

  /* Corta pelo fim, preservando o começo: num nome, é o começo
     que identifica. Último recurso — só para palavra única
     maior que o cartão. */
  function cortado(texto, fonte, corpo, larguraMm) {
    const limite = larguraMm * MM;
    if (fonte.widthOfTextAtSize(texto, corpo) <= limite) return texto;

    let t = texto;
    while (t.length > 1 && fonte.widthOfTextAtSize(t + '…', corpo) > limite) {
      t = t.slice(0, -1);
    }
    return t.replace(/\s+$/, '') + '…';
  }

  /* Reparte em linhas, quebrando só em espaço. Devolve null se
     não couber no número de linhas pedido — quem chama então
     tenta um corpo menor. */
  function repartir(texto, fonte, corpo, larguraMm, maxLinhas) {
    const limite = larguraMm * MM;
    const palavras = String(texto).trim().split(/\s+/);
    const linhas = [];
    let atual = '';

    for (const palavra of palavras) {
      /* Palavra que sozinha não cabe: nenhuma quebra resolve, e
         insistir devolveria uma linha estourada disfarçada de
         sucesso. */
      if (fonte.widthOfTextAtSize(palavra, corpo) > limite) return null;

      const tentativa = atual ? atual + ' ' + palavra : palavra;
      if (fonte.widthOfTextAtSize(tentativa, corpo) <= limite) {
        atual = tentativa;
      } else {
        linhas.push(atual);
        atual = palavra;
        if (linhas.length >= maxLinhas) return null;
      }
    }
    if (atual) linhas.push(atual);

    return linhas.length <= maxLinhas ? linhas : null;
  }

  /* Acha o maior corpo em que o nome cabe nas linhas
     disponíveis. Prefere UMA linha grande: o cartão foi
     desenhado assim. Só reparte quando a linha única não cabe
     mais no corpo cheio. */
  function arrumarNome(texto, fonte, M) {
    for (let corpo = M.corpo; corpo >= PISO; corpo -= 0.25) {
      const linhas = repartir(texto, fonte, corpo, M.larguraMaxima, M.linhas);
      if (linhas) return { linhas: linhas, corpo: corpo };
    }
    /* Nem repartido coube: é palavra única gigante. */
    return { linhas: [cortado(texto, fonte, PISO, M.larguraMaxima)], corpo: PISO };
  }

  function semAcento(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  }


  /* ============================================================
     BOAS-VINDAS — ATENDIMENTO NA LOJA
     ------------------------------------------------------------
     Uma folha A4 com o cartão A6 no canto superior esquerdo,
     pronto para recortar. É assim que a loja usa hoje, e não
     muda.
     ============================================================ */

  async function boasVindasImpresso(dados) {
    const M = BOAS_VINDAS;
    const loja = dados.loja === 'cgt' ? 'cgt' : 'sjc';
    const flex = FLEXOES[dados.genero] || FLEXOES.eles;

    const doc = await PDFLib.PDFDocument.create();
    doc.registerFontkit(fontkit);

    const [medium, bold, logoBytes] = await Promise.all([
      bytesDe('Krub-Medium.ttf'),
      bytesDe('Krub-Bold.ttf'),
      bytesDe(LOGOS[loja])
    ]);

    const fMedium = await doc.embedFont(medium, { subset: true });
    const fBold   = await doc.embedFont(bold,   { subset: true });
    const logo    = await doc.embedPng(logoBytes);

    const pag = doc.addPage([A4.largura * MM, A4.altura * MM]);

    /* ---------- o bloco cinza ---------- */
    pag.drawRectangle({
      x: M.bloco.x * MM,
      y: ponto(M.bloco.y + M.bloco.altura),
      width: M.bloco.largura * MM,
      height: M.bloco.altura * MM,
      color: cor(M.cores.bloco)
    });

    /* ---------- as três linhas do topo ---------- */
    const topo = [
      { texto: flex.seja,      fonte: fMedium },
      { texto: flex.bemVindo,  fonte: fMedium },
      { texto: 'À DALMÓBILE!', fonte: fBold }
    ];

    topo.forEach(function (linha, i) {
      const f = M.linhas[i].peso === 'bold' ? fBold : fMedium;
      const largura = f.widthOfTextAtSize(linha.texto, M.corpoTopo);
      pag.drawText(linha.texto, {
        x: M.colunaDireita * MM - largura,
        y: ponto(M.linhas[i].base),
        size: M.corpoTopo,
        font: f,
        color: cor(M.cores.texto)
      });
    });

    /* ---------- o nome do cliente ---------- */
    const nome = String(dados.cliente || '').trim();
    if (nome) {
      const arranjo = arrumarNome(nome, fMedium, M.nome);
      const altura = arranjo.corpo * M.nome.entrelinha / MM;   /* em mm */

      arranjo.linhas.forEach(function (linha, i) {
        /* A última linha na base original; as anteriores sobem. */
        const deTras = arranjo.linhas.length - 1 - i;
        pag.drawText(linha, {
          x: M.nome.x * MM,
          y: ponto(M.nome.base - deTras * altura),
          size: arranjo.corpo,
          font: fMedium,
          color: cor(M.cores.texto)
        });
      });
    }

    /* ---------- os riscos do canto ---------- */
    M.riscos.forEach(function (r) {
      pag.drawRectangle({
        x: r.x * MM,
        y: ponto(r.y + r.altura),
        width: r.largura * MM,
        height: r.altura * MM,
        color: cor(M.cores.risco)
      });
    });

    /* ---------- o filete ---------- */
    pag.drawLine({
      start: { x: M.filete.x1 * MM, y: ponto(M.filete.y) },
      end:   { x: M.filete.x2 * MM, y: ponto(M.filete.y) },
      thickness: M.filete.espessura * MM,
      color: cor(M.cores.filete)
    });

    /* ---------- o rodapé ---------- */
    pag.drawText(M.rodape.texto[0], {
      x: M.rodape.x * MM, y: ponto(M.rodape.base1),
      size: M.rodape.corpo, font: fMedium, color: cor(M.cores.rodape)
    });
    pag.drawText(M.rodape.texto[1], {
      x: M.rodape.x * MM, y: ponto(M.rodape.base2),
      size: M.rodape.corpo, font: fMedium, color: cor(M.cores.rodape)
    });

    /* ---------- a logo ---------- */
    const alturaLogo = M.logo.largura * (logo.height / logo.width);
    pag.drawImage(logo, {
      x: M.logo.x * MM,
      y: ponto(M.logo.baixo),
      width: M.logo.largura * MM,
      height: alturaLogo * MM
    });

    /* ---------- as marcas de corte ---------- */
    pag.drawLine({
      start: { x: M.cartao.largura * MM, y: ponto(0) },
      end:   { x: M.cartao.largura * MM, y: ponto(M.cartao.altura) },
      thickness: 0.25, color: cor(M.cores.corte)
    });
    pag.drawLine({
      start: { x: 0, y: ponto(M.cartao.altura) },
      end:   { x: M.cartao.largura * MM, y: ponto(M.cartao.altura) },
      thickness: 0.25, color: cor(M.cores.corte)
    });

    const b64 = await doc.saveAsBase64();

    return {
      ok: true,
      b64: b64,
      tipo: 'application/pdf',
      nome: 'boas-vindas-' + (semAcento(nome) || 'cliente') + '.pdf'
    };
  }


  /* O índice é por ID do material. O que estiver aqui é gerado
     no aparelho; o que não estiver continua indo para o Apps
     Script, sem precisar mexer em nada. */
  return {
    'boas-vindas-impresso': boasVindasImpresso,

    /* exposto para a tela de conferência */
    _medidas: { 'boas-vindas-impresso': BOAS_VINDAS }
  };
})();

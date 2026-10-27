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



  /* ========================================================
     PÓS-VISITA — card 1080x1350 para o WhatsApp
     --------------------------------------------------------
     Medido no PNG original, em PIXELS da peça final. Aqui não
     há milímetro: a peça nasce e morre em tela.

     O título NÃO pôde ficar na arte de fundo: a palavra
     você/vocês mora dentro dele, e a última linha é o nome da
     cidade. Então as quatro linhas são desenhadas, com os pesos
     alternando.
     ======================================================== */

  const POS_VISITA = {
    largura: 1080, altura: 1350,

    /* Desenha em 2x e reduz. Texto desenhado direto em 1080 fica
       com a borda mais dura; passar por 2160 e reduzir com
       suavização dá o contorno limpo que a peça do Slides tinha
       por acidente de escala. */
    escala: 2,

    nome:   { x: 95, base: 153.5, corpo: 45.6, peso: 'bold' },

    titulo: {
      x: 99.5, base: 381.3, entrelinha: 80.7, corpo: 67.2,
      /* cada linha é uma lista de pedaços com peso próprio */
      linhas: [
        [ { t: 'FOI UM ', peso: 'medium' }, { t: 'PRAZER', peso: 'bold' } ],
        [ { t: 'RECEBER ', peso: 'medium' }, { t: '{voce}', peso: 'medium' },
          { t: ' NA', peso: 'medium' } ],
        [ { t: 'DALMÓBILE', peso: 'bold' } ],
        [ { t: '{cidade}.', peso: 'bold' } ]
      ]
    },

    corpo: {
      x: 88, base: 751.4, entrelinha: 45.2, corpo: 37.5, peso: 'medium',
      /* o salto entre um parágrafo e o seguinte, em linhas
         VAZIAS — uma, não duas: medido entre a última linha do
         primeiro parágrafo e a primeira do segundo. */
      saltoEntreParagrafos: 1
    },

    logo: { centro: 540, baixo: 1245, largura: 245 },

    /* ⚠️ MEDIDOS NA PEÇA FINAL, não no fundo exportado.
       A primeira versão veio do PNG de 810x1012 escalado por
       4/3 — e todos saíram 25 px fora, porque aquele arquivo
       tem recorte diferente. Escalar de um recorte para outro
       carrega o deslocamento junto, em silêncio.

       Os dois últimos passam da borda de baixo de propósito:
       é assim no original, e o canvas corta sozinho. */
    riscos: [
      { x:  725, y:   48, l:  4, a: 63 },
      { x:  848, y:   48, l:  4, a: 63 },
      { x:  971, y:  108, l: 63, a:  4 },
      { x:  909, y:  109, l:  4, a: 63 },
      { x:  726, y:  169, l: 63, a:  4 },
      { x:  910, y:  230, l: 63, a:  4 },
      { x:  848, y:  231, l:  4, a: 63 },
      { x: 1031, y:  231, l:  4, a: 63 },
      { x:   62, y: 1103, l:  4, a: 63 },
      { x:  185, y: 1163, l: 63, a:  4 },
      { x:  123, y: 1164, l:  4, a: 63 },
      { x:  306, y: 1225, l:  4, a: 63 },
      { x:  124, y: 1285, l: 63, a:  4 },
      { x:   62, y: 1286, l:  4, a: 63 },
      { x:  245, y: 1286, l:  4, a: 63 }
    ],

    cores: { fundo: '#e5e4e2', texto: '#545351', risco: '#a09f9d' }
  };

  /* ⚠️ O TEXTO DO CORPO MORA AQUI, e isto é uma mudança.
     Antes ele estava dentro da arte do Slides; qualquer correção
     pedia reexportar tudo. Agora é texto.

     O ORIGINAL TINHA UM DEFEITO: o segundo parágrafo repetia a
     última frase do primeiro, e repetia sem a crase ("Seguimos a
     disposição"). O padrão é o texto limpo; comRepeticao ficou
     guardado caso alguém precise reproduzir a peça antiga. */
  const POS_VISITA_TEXTO = {
    /* o que o Slides fazia, só com a crase corrigida */
    comRepeticao: [
      ['agradecemos sua visita e a oportunidade de',
       'apresentar de perto tudo o que podemos construir',
       'juntos. Seguimos à disposição para dar vida ao seu',
       'projeto.'],
      ['Seguimos à disposição para dar vida ao',
       'seu projeto.']
    ],
    /* sem a repetição */
    limpo: [
      ['agradecemos sua visita e a oportunidade de',
       'apresentar de perto tudo o que podemos construir',
       'juntos. Seguimos à disposição para dar vida ao seu',
       'projeto.']
    ]
  };

  const CIDADES = { sjc: 'SÃO JOSÉ DOS CAMPOS', cgt: 'CARAGUATATUBA' };
  const VOCE    = { ele: 'VOCÊ', ela: 'VOCÊ', eles: 'VOCÊS', elas: 'VOCÊS' };


  /* ------------------------------------------------------------
     Texto em canvas
     ------------------------------------------------------------ */

  /* Carrega a Krub de verdade no canvas. Sem isto o navegador
     desenha com a fonte que achar, e a peça sai com outra cara
     sem avisar. */
  let fontesProntas = null;
  function carregarFontes() {
    if (fontesProntas) return fontesProntas;
    fontesProntas = Promise.all([
      new FontFace('KrubPeca', 'url(Krub-Medium.ttf)', { weight: '500' }).load(),
      new FontFace('KrubPeca', 'url(Krub-Bold.ttf)',   { weight: '700' }).load()
    ]).then(function (fs) {
      fs.forEach(function (f) { document.fonts.add(f); });
    });
    return fontesProntas;
  }

  function fonteDe(peso, corpo) {
    return (peso === 'bold' ? '700 ' : '500 ') + corpo + 'px KrubPeca';
  }

  /* Escreve ancorando a MANCHA, não a caneta.
     A caneta do canvas começa antes da tinta — cada letra tem a
     sua folga à esquerda. Medi a mancha no original, então aqui
     a folga é descontada; senão cada linha começaria num lugar
     um pouco diferente, conforme a letra inicial. */
  function escreverNaMancha(ctx, texto, mancha, base) {
    const m = ctx.measureText(texto);
    ctx.fillText(texto, mancha + m.actualBoundingBoxLeft, base);
    return m.width;
  }


  /* ========================================================
     CARD DE APRESENTAÇÃO NO WHATSAPP — 1080x1080
     --------------------------------------------------------
     A peça mais densa das três: parágrafos JUSTIFICADOS e uma
     lista que muda de tamanho conforme o projeto tenha ou não
     arquiteto.

     As quebras de linha dos parágrafos são fixas, copiadas do
     original. Poderia calcular as quebras, mas aí elas cairiam
     em pontos diferentes dos de hoje — e o pedido foi qualidade
     e fidelidade, não liberdade de composição. Mudou o texto?
     Reescreva as linhas aqui.
     ======================================================== */

  const CARD_WPP = {
    largura: 1080, altura: 1080, escala: 2,

    /* Os corpos abaixo não foram chutados nem convertidos de pt:
       cada um foi resolvido por busca binária dentro do próprio
       canvas, até a mancha de tinta bater com a largura medida no
       card original. Por isso os quatro itens caem todos em 23,7
       e os dois parágrafos em 19,6 — é a mesma fonte do Slides,
       reencontrada pela largura. */
    cliente: { x: 151, base: 240.5, corpo: 25.88, peso: 'medium', cor: '#565554' },

    saudacao: { x: 148, base: 309.5, corpo: 20.58, peso: 'bold', cor: '#1a1a1a' },

    /* Blocos justificados: todas as linhas esticam até a margem
       direita, menos a última de cada parágrafo. */
    texto: {
      x: 149, direita: 1016, base: 358.5, entrelinha: 50,
      corpo: 19.64, peso: 'medium', cor: '#484846'
    },

    itens: {
      marcador: { x: 166.5, raio: 5 },
      x: 200, base: 620.5, entrelinha: 57.8, corpo: 23.71,
      peso: 'medium', cor: '#555452'
    },

    fecho: {
      x: 115, direita: 983, base: 844.5, entrelinha: 50,
      corpo: 19.79, peso: 'medium', cor: '#474745'
    },

    assinatura: { x: 40, base: 996.5, entrelinha: 37, corpo: 26.83,
                  peso: 'medium', cor: '#6f6e6c', texto: ['CRIE SEU', 'MUNDO'] },

    logo: { direita: 1013, topo: 65, largura: 222 },

    /* Medidos no fundo que o Gu exportou — e aquele arquivo já
       está em 1080x1080, o mesmo tamanho da peça, então aqui
       não há escala nem o deslocamento que isso causou no
       pós-visita. */
    riscos: [
      { x: 134, y:   0, l: 3, a: 58 },
      { x: 269, y:  55, l: 3, a: 60 },
      { x:   0, y:  56, l: 67, a: 3 },
      { x: 135, y: 115, l: 68, a: 3 },
      { x:  65, y: 118, l: 3, a: 60 },
      { x: 272, y: 176, l: 68, a: 3 }
    ],

    cores: { fundo: '#e6e5e3', risco: '#9c9b99' }
  };

  /* O texto fixo. Saiu da arte do Slides para cá — com a
     correção de "Caraguatauba" para "Caraguatatuba", que estava
     errado no original e ia para o cliente assim. */
  /* As palavras que mudam com quem recebe o card. O cartão A6 já
     fazia isso; aqui o texto estava travado no plural masculino,
     então "Seja bem-vinda" no título convivia com "recebê-los"
     duas linhas abaixo. Concordar só a saudação deixaria a peça
     pela metade, que é pior que não concordar nada. */
  const FLEXOES_CARD = {
    ele:  { seja: 'Seja',  bemvindo: 'bem-vindo',  recebelo: 'recebê-lo',  voce: 'você'  },
    ela:  { seja: 'Seja',  bemvindo: 'bem-vinda',  recebelo: 'recebê-la',  voce: 'você'  },
    eles: { seja: 'Sejam', bemvindo: 'bem-vindos', recebelo: 'recebê-los', voce: 'vocês' },
    elas: { seja: 'Sejam', bemvindo: 'bem-vindas', recebelo: 'recebê-las', voce: 'vocês' }
  };

  const CARD_TEXTO = {
    saudacao: '{seja} {bemvindo} à Dalmóbile {cidade}!',
    /* As linhas continuam quebradas à mão porque são justificadas
       e o desenho depende desses cortes. As trocas mudam uma ou
       duas letras por linha — a justificação absorve sozinha. */
    paragrafos: [
      ['É uma satisfação {recebelo} e agradecer pela confiança em nos permitir fazer parte da',
       'realização do seu novo lar.'],
      ['A partir de agora, compartilhamos com {voce} as próximas etapas do processo até a entrega',
       'e execução do seu mobiliário, bem como os profissionais que estarão ao seu lado em cada',
       'fase dessa jornada:']
    ],
    fecho: ['Nossa equipe está à disposição para oferecer um atendimento próximo, transparente e',
            'dedicado em cada etapa do projeto.'],
    /* Último item da lista, sempre presente. Está aqui, e não na
       arte, justamente para o dia em que mudar de pessoa. */
    fixo: 'Rômullo Goulart – Supervisor de Montagem'
  };

  const CIDADES_CARD = { sjc: 'São José dos Campos', cgt: 'Caraguatatuba' };


  /* Escreve uma linha esticada até a margem direita.
     ------------------------------------------------------------
     O canvas não justifica: distribui-se a sobra pelos espaços,
     um a um. Com dois decimais de precisão isso é invisível, e é
     o que faz a mancha de texto ter a borda reta que a peça
     original tinha.

     Linha de um palavrão só não estica — não há onde pôr a
     sobra, e esticar letra a letra deformaria a palavra. */
  function escreverJustificado(ctx, texto, esquerda, direita, base) {
    const palavras = String(texto).trim().split(/\s+/);
    if (palavras.length < 2) { escreverNaMancha(ctx, texto, esquerda, base); return; }

    /* A margem é de tinta, não de avanço. Se eu alinhasse pelo
       width da primeira e da última palavra, as duas pontas
       ficariam para dentro pela lateral do glifo — foi exatamente
       o que deixou minhas linhas justificadas 2 px curtas. Então
       ancoro a primeira pela borda esquerda da tinta e a última
       pela direita, e distribuo o espaço entre essas duas âncoras. */
    const pri = ctx.measureText(palavras[0]);
    const ult = ctx.measureText(palavras[palavras.length - 1]);

    const xPrimeira = esquerda + pri.actualBoundingBoxLeft;
    const xUltima = direita - ult.actualBoundingBoxRight;

    let avancos = 0;
    for (let i = 0; i < palavras.length - 1; i++) {
      avancos += ctx.measureText(palavras[i]).width;
    }

    const espaco = (xUltima - xPrimeira - avancos) / (palavras.length - 1);

    let x = xPrimeira;
    palavras.forEach(function (p) {
      ctx.fillText(p, x, base);
      x += ctx.measureText(p).width + espaco;
    });
  }

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

  const imagens = {};
  function imagemDe(caminho) {
    if (imagens[caminho]) return imagens[caminho];
    imagens[caminho] = new Promise(function (ok, erro) {
      const im = new Image();
      im.onload = function () { ok(im); };
      im.onerror = function () { erro(new Error('Não carreguei ' + caminho)); };
      im.src = caminho;
    });
    return imagens[caminho];
  }

  /* ⚠️ OS DOIS ARQUIVOS DE LOGO NÃO SÃO IGUAIS.
     O de Caraguá tem 85 px vazios embaixo; o de SJC não tem
     nenhum. Ancorando pelo arquivo, a mesma peça põe uma loja
     mais alta que a outra — e ninguém desconfia, porque cada
     uma parece certa sozinha.

     Então a tinta é recortada aqui: o desenho passa a depender
     do que se VÊ, não das bordas do arquivo. Um logo novo com
     outra sobra entra sem ajuste. */
  const recortes = {};
  function logoRecortada(caminho) {
    if (recortes[caminho]) return recortes[caminho];

    recortes[caminho] = imagemDe(caminho).then(function (im) {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);

      const d = x.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;

      for (let i = 0, px = 0; i < d.length; i += 4, px++) {
        /* Tinta = opaco e escuro. Logo em PNG costuma vir com
           fundo transparente, mas um exportado com fundo branco
           também precisa funcionar. */
        const opaco = d[i + 3] > 20;
        const escuro = (d[i] + d[i + 1] + d[i + 2]) < 700;
        if (!opaco || !escuro) continue;
        const cx = px % c.width, cy = (px / c.width) | 0;
        if (cx < x0) x0 = cx;
        if (cy < y0) y0 = cy;
        if (cx > x1) x1 = cx;
        if (cy > y1) y1 = cy;
      }

      if (x1 < 0) return { img: im, sx: 0, sy: 0, sl: im.naturalWidth, sa: im.naturalHeight };
      return { img: im, sx: x0, sy: y0, sl: x1 - x0 + 1, sa: y1 - y0 + 1 };
    });

    return recortes[caminho];
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
  /* "Alexandre e Mariana Cavalcanti" não pode quebrar antes do
     "e": linha começando com conjunção fica com cara de erro.
     Então colo cada conectivo na palavra ANTERIOR, formando um
     pedaço que a quebra não separa — o "e" desce junto com o
     primeiro nome, nunca sozinho na frente do segundo.

     Casos de união ("Maria de Souza", "Ana dos Santos") ficam de
     fora de propósito: ali a quebra antes da preposição é comum e
     natural, e grudar tudo só roubaria lugares de quebra num nome
     que já está apertado. */
  const CONECTIVOS = ['e', 'E', '&', 'y', 'Y'];

  function grudarConectivos(palavras) {
    const saida = [];
    palavras.forEach(function (p) {
      if (saida.length && CONECTIVOS.indexOf(p) !== -1) {
        saida[saida.length - 1] += ' ' + p;
      } else {
        saida.push(p);
      }
    });
    return saida;
  }

  function repartir(texto, fonte, corpo, larguraMm, maxLinhas) {
    const limite = larguraMm * MM;
    const palavras = grudarConectivos(String(texto).trim().split(/\s+/));
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




  /* ============================================================
     PÓS-VISITA
     ------------------------------------------------------------
     Card de agradecimento para mandar no WhatsApp depois da
     visita do cliente à loja.
     ============================================================ */

  async function posVisita(dados) {
    const M = POS_VISITA;
    const loja = dados.loja === 'cgt' ? 'cgt' : 'sjc';
    const e = M.escala;

    await carregarFontes();

    const tela = document.createElement('canvas');
    tela.width  = M.largura * e;
    tela.height = M.altura  * e;
    const ctx = tela.getContext('2d');
    ctx.scale(e, e);
    ctx.textBaseline = 'alphabetic';

    /* ---------- fundo e riscos ---------- */
    ctx.fillStyle = M.cores.fundo;
    ctx.fillRect(0, 0, M.largura, M.altura);

    ctx.fillStyle = M.cores.risco;
    M.riscos.forEach(function (r) { ctx.fillRect(r.x, r.y, r.l, r.a); });

    ctx.fillStyle = M.cores.texto;

    /* ---------- o nome ---------- */
    const nome = String(dados.cliente || '').trim();
    if (nome) {
      ctx.font = fonteDe(M.nome.peso, M.nome.corpo);
      escreverNaMancha(ctx, nome + ',', M.nome.x, M.nome.base);
    }

    /* ---------- o título ---------- */
    const trocas = {
      '{voce}':   VOCE[dados.genero] || VOCE.eles,
      '{cidade}': CIDADES[loja]
    };

    M.titulo.linhas.forEach(function (linha, i) {
      const base = M.titulo.base + i * M.titulo.entrelinha;
      let x = M.titulo.x;
      let primeiro = true;

      linha.forEach(function (pedaco) {
        const texto = pedaco.t.replace(/\{voce\}|\{cidade\}/g, function (m) {
          return trocas[m];
        });
        ctx.font = fonteDe(pedaco.peso, M.titulo.corpo);

        /* Só o primeiro pedaço da linha é ancorado pela mancha;
           os seguintes continuam de onde o anterior parou, senão
           apareceria um vão entre as palavras. */
        if (primeiro) {
          x += ctx.measureText(texto).actualBoundingBoxLeft;
          primeiro = false;
        }
        ctx.fillText(texto, x, base);
        x += ctx.measureText(texto).width;
      });
    });

    /* ---------- o corpo ---------- */
    /* O padrão agora é o texto sem a repetição. Quem quiser a peça
       como o Slides fazia passa comRepeticao: true. */
    const paragrafos = dados.comRepeticao
      ? POS_VISITA_TEXTO.comRepeticao
      : POS_VISITA_TEXTO.limpo;

    ctx.font = fonteDe(M.corpo.peso, M.corpo.corpo);
    let linha = 0;
    paragrafos.forEach(function (par, iPar) {
      if (iPar) linha += M.corpo.saltoEntreParagrafos;
      par.forEach(function (t) {
        escreverNaMancha(ctx, t, M.corpo.x, M.corpo.base + linha * M.corpo.entrelinha);
        linha++;
      });
    });

    /* ---------- a logo ---------- */
    const logo = await imagemDe(LOGOS[loja]);
    const altura = M.logo.largura * (logo.naturalHeight / logo.naturalWidth);
    ctx.drawImage(logo, M.logo.centro - M.logo.largura / 2,
                        M.logo.baixo - altura, M.logo.largura, altura);

    /* ---------- reduz para o tamanho final ---------- */
    const final = document.createElement('canvas');
    final.width = M.largura; final.height = M.altura;
    const fx = final.getContext('2d');
    fx.imageSmoothingEnabled = true;
    fx.imageSmoothingQuality = 'high';
    fx.drawImage(tela, 0, 0, M.largura, M.altura);

    const b64 = final.toDataURL('image/png').split(',')[1];

    return {
      ok: true,
      b64: b64,
      tipo: 'image/png',
      nome: 'pos-visita-' + (semAcento(nome) || 'cliente') + '.png'
    };
  }



  /* ============================================================
     CARD DE APRESENTAÇÃO NO WHATSAPP
     ============================================================ */

  /* Põe "Nome – Cargo" na lista. Se o nome vier vazio, não entra
     linha nenhuma; se já vier com travessão, quer dizer que a
     pessoa escreveu o cargo na mão — e aí respeito o que ela
     escreveu em vez de carimbar o cargo duas vezes. */
  function juntar(lista, nome, cargo) {
    const t = String(nome || '').trim();
    if (!t) return;
    const c = String(cargo || '').trim();
    if (!c || /[–—-]/.test(t)) { lista.push(t); return; }
    lista.push(t + ' – ' + c);
  }

  async function cardWhatsApp(dados) {
    const M = CARD_WPP;
    const loja = dados.loja === 'cgt' ? 'cgt' : 'sjc';
    const e = M.escala;

    await carregarFontes();

    const tela = document.createElement('canvas');
    tela.width = M.largura * e; tela.height = M.altura * e;
    const ctx = tela.getContext('2d');
    ctx.scale(e, e);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = M.cores.fundo;
    ctx.fillRect(0, 0, M.largura, M.altura);

    ctx.fillStyle = M.cores.risco;
    M.riscos.forEach(function (r) { ctx.fillRect(r.x, r.y, r.l, r.a); });

    /* ---------- cliente ---------- */
    const nome = String(dados.cliente || '').trim();
    if (nome) {
      ctx.fillStyle = M.cliente.cor;
      ctx.font = fonteDe(M.cliente.peso, M.cliente.corpo);
      escreverNaMancha(ctx, nome, M.cliente.x, M.cliente.base);
    }

    /* ---------- as trocas de concordância ---------- */
    const flex = FLEXOES_CARD[dados.genero] || FLEXOES_CARD.eles;
    const trocas = {
      '{seja}': flex.seja,
      '{bemvindo}': flex.bemvindo,
      '{recebelo}': flex.recebelo,
      '{voce}': flex.voce,
      '{cidade}': CIDADES_CARD[loja]
    };
    const flexionar = function (t) {
      return String(t).replace(/\{[a-zA-Z]+\}/g, function (m) {
        return m in trocas ? trocas[m] : m;
      });
    };

    /* ---------- saudação ---------- */
    ctx.fillStyle = M.saudacao.cor;
    ctx.font = fonteDe(M.saudacao.peso, M.saudacao.corpo);
    escreverNaMancha(ctx, flexionar(CARD_TEXTO.saudacao),
                     M.saudacao.x, M.saudacao.base);

    /* ---------- parágrafos justificados ---------- */
    ctx.fillStyle = M.texto.cor;
    ctx.font = fonteDe(M.texto.peso, M.texto.corpo);

    let linha = 0;
    CARD_TEXTO.paragrafos.forEach(function (par) {
      par.forEach(function (t, i) {
        const base = M.texto.base + linha * M.texto.entrelinha;
        /* A última linha do parágrafo não estica: esticá-la
           abriria vãos enormes entre poucas palavras. */
        if (i === par.length - 1) {
          escreverNaMancha(ctx, flexionar(t), M.texto.x, base);
        } else {
          escreverJustificado(ctx, flexionar(t), M.texto.x, M.texto.direita, base);
        }
        linha++;
      });
    });

    /* ---------- a lista ---------- */
    /* O cargo vem do formulário já escrito por extenso, com o
       gênero escolhido ali. Antes o card imprimia só o que fosse
       digitado, e como na prática se digita o primeiro nome, a
       lista saía sem cargo nenhum. */
    const lista = [];
    juntar(lista, dados.consultor, dados.cargoConsultor);
    if (dados.temArquiteto) juntar(lista, dados.arquiteto, dados.cargoArquiteto);
    juntar(lista, dados.executivo, dados.cargoExecutivo);
    lista.push(CARD_TEXTO.fixo);

    ctx.fillStyle = M.itens.cor;
    ctx.font = fonteDe(M.itens.peso, M.itens.corpo);

    lista.forEach(function (item, i) {
      const base = M.itens.base + i * M.itens.entrelinha;

      ctx.beginPath();
      ctx.arc(M.itens.marcador.x, base - M.itens.corpo * 0.28,
              M.itens.marcador.raio, 0, Math.PI * 2);
      ctx.fill();

      escreverNaMancha(ctx, item, M.itens.x, base);
    });

    /* ---------- fecho ----------
       Ancorado pela ÚLTIMA linha, não pela primeira: sem
       arquiteto a lista encurta, e o fecho sobe junto em vez de
       deixar o buraco que a peça do Slides deixava. */
    const ultimoItem = M.itens.base + (lista.length - 1) * M.itens.entrelinha;
    const folga = M.fecho.base - (M.itens.base + 3 * M.itens.entrelinha);
    const fechoBase = ultimoItem + folga;

    ctx.fillStyle = M.fecho.cor;
    ctx.font = fonteDe(M.fecho.peso, M.fecho.corpo);
    CARD_TEXTO.fecho.forEach(function (t, i) {
      const base = fechoBase + i * M.fecho.entrelinha;
      if (i === CARD_TEXTO.fecho.length - 1) {
        escreverNaMancha(ctx, t, M.fecho.x, base);
      } else {
        escreverJustificado(ctx, t, M.fecho.x, M.fecho.direita, base);
      }
    });

    /* ---------- assinatura ---------- */
    ctx.fillStyle = M.assinatura.cor;
    ctx.font = fonteDe(M.assinatura.peso, M.assinatura.corpo);
    M.assinatura.texto.forEach(function (t, i) {
      escreverNaMancha(ctx, t, M.assinatura.x,
                       M.assinatura.base + i * M.assinatura.entrelinha);
    });

    /* ---------- logo ---------- */
    const lg = await logoRecortada(LOGOS[loja]);
    const alturaLogo = M.logo.largura * (lg.sa / lg.sl);
    ctx.drawImage(lg.img, lg.sx, lg.sy, lg.sl, lg.sa,
                  M.logo.direita - M.logo.largura, M.logo.topo,
                  M.logo.largura, alturaLogo);

    /* ---------- reduz ---------- */
    const final = document.createElement('canvas');
    final.width = M.largura; final.height = M.altura;
    const fx = final.getContext('2d');
    fx.imageSmoothingEnabled = true;
    fx.imageSmoothingQuality = 'high';
    fx.drawImage(tela, 0, 0, M.largura, M.altura);

    return {
      ok: true,
      b64: final.toDataURL('image/png').split(',')[1],
      tipo: 'image/png',
      nome: 'apresentacao-' + (semAcento(nome) || 'cliente') + '.png'
    };
  }

  /* ============================================================
     AVISOS DE ETAPA — agendamento e entrega

     O catálogo tinha três vagas aqui: "Confirmação de
     agendamento", "Lembrete de agendamento" e "Entrega
     concluída". As duas primeiras eram a MESMA mensagem, com os
     mesmos campos — construir as duas criaria, dentro do próprio
     catálogo, a redundância que era para evitar. Viraram uma peça
     só, com um campo que troca a frase de abertura.

     A moldura é a do pós-visita, de propósito: mesmo fundo,
     mesmos riscos, mesma escala tipográfica. Assim as peças
     continuam parecendo da mesma família sem eu inventar um
     segundo sistema visual para manter.
     ============================================================ */

  const AVISO = {
    largura: 1080, altura: 1350, escala: 2,

    nome: { x: 95, base: 153.5, corpo: 45.6, peso: 'bold' },

    /* O título cresce PARA CIMA a partir da última linha. No
       pós-visita as quatro linhas terminam em 623,4 e o corpo
       começa em 751,4 — se eu ancorasse pelo topo, um título de
       três linhas abriria um vão nesse meio e o de cinco encostaria
       no texto. Ancorado embaixo, o respiro é sempre o mesmo. */
    titulo: {
      x: 99.5, baseUltima: 623.4, corpo: 67.2, corpoMinimo: 42,
      proporcaoEntrelinha: 80.7 / 67.2, larguraMaxima: 880, linhas: 5
    },

    corpo: {
      x: 88, base: 751.4, entrelinha: 45.2, corpo: 37.5,
      corpoMinimo: 28, larguraMaxima: 905, linhas: 7, peso: 'medium'
    },

    logo: { centro: 540, baixo: 1245, largura: 245 },

    riscos: POS_VISITA.riscos,
    cores: POS_VISITA.cores
  };

  /* O asterisco marca o trecho em negrito, como no título do
     pós-visita. Os {marcadores} são trocados antes de quebrar as
     linhas, então a quebra já leva em conta o nome e a data reais
     — não o tamanho do marcador. */
  const AVISO_TEXTO = {
    agendamento: {
      confirmacao: {
        titulo: 'SUA *{ETAPA}* ESTÁ AGENDADA.',
        corpo: 'está tudo certo para a sua {etapa}: ficou marcada para ' +
               '{data}, às {hora}. {responsavel} estará com {voce}. ' +
               'Se precisar remarcar, é só nos avisar.'
      },
      lembrete: {
        titulo: 'LEMBRANDO DA SUA *{ETAPA}*.',
        corpo: 'passando para lembrar da sua {etapa}, marcada para ' +
               '{data}, às {hora}. {responsavel} estará com {voce}. ' +
               'Se precisar remarcar, é só nos avisar.'
      }
    },
    entrega: {
      titulo: 'SEU NOVO LAR ESTÁ *PRONTO*.',
      corpo: 'obrigado por confiar à Dalmóbile a realização do seu ' +
             'projeto. Foi um prazer acompanhar cada etapa ao lado de ' +
             '{voce}, e seguimos à disposição sempre que {precisar}.'
    }
  };

  const PRECISAR = { ele: 'precisar', ela: 'precisar',
                     eles: 'precisarem', elas: 'precisarem' };

  /* Quebra uma lista de palavras com peso próprio. Devolve null
     se não couber no número de linhas — é assim que o autoajuste
     sabe que precisa diminuir, em vez de entregar uma linha
     estourada disfarçada de sucesso. */
  function repartirPedacos(ctx, palavras, corpo, limite, maxLinhas) {
    /* Uma "palavra" é uma lista de pedaços colados: "*MONTAGEM*."
       é um pedaço em negrito seguido do ponto em medium, SEM
       espaço entre eles. Medir e desenhar por pedaço solto punha
       um espaço ali e a peça saía com "MONTAGEM ." */
    const larg = function (palavra) {
      let w = 0;
      palavra.forEach(function (p) {
        ctx.font = fonteDe(p.peso, corpo);
        w += ctx.measureText(p.t).width;
      });
      return w;
    };
    ctx.font = fonteDe('medium', corpo);
    const espaco = ctx.measureText(' ').width;

    const linhas = [];
    let atual = [], largura = 0;

    for (const palavra of palavras) {
      const w = larg(palavra);
      if (w > limite) return null;           /* palavra sozinha não cabe */

      const soma = atual.length ? largura + espaco + w : w;
      if (soma <= limite) {
        atual.push(palavra); largura = soma;
      } else {
        linhas.push(atual);
        if (linhas.length >= maxLinhas) return null;
        atual = [palavra]; largura = w;
      }
    }
    if (atual.length) linhas.push(atual);
    return linhas.length <= maxLinhas ? linhas : null;
  }

  function arrumarBloco(ctx, palavras, M) {
    for (let corpo = M.corpo; corpo >= M.corpoMinimo; corpo -= 0.5) {
      const linhas = repartirPedacos(ctx, palavras, corpo,
                                     M.larguraMaxima, M.linhas);
      if (linhas) return { linhas: linhas, corpo: corpo };
    }
    /* Chegou no piso: desenha assim mesmo, porque uma peça
       apertada ainda serve e uma peça que não sai, não. */
    return {
      linhas: repartirPedacos(ctx, palavras, M.corpoMinimo,
                              M.larguraMaxima, 99) || [palavras],
      corpo: M.corpoMinimo
    };
  }

  /* 'SUA *MEDIÇÃO* ESTÁ.' → uma lista de palavras, e cada palavra
     é a lista dos seus pedaços colados. O corte é SEMPRE no
     espaço do texto: o asterisco só troca o peso, nunca separa.
     Por isso o ponto final de '*PRONTO*.' continua grudado. */
  function emPedacos(texto) {
    const palavras = [];
    let negrito = false;

    String(texto).trim().split(/\s+/).forEach(function (bruto) {
      const pedacos = [];
      bruto.split('*').forEach(function (parte, i) {
        if (i) negrito = !negrito;   /* cada asterisco inverte o peso */
        if (parte) pedacos.push({ t: parte, peso: negrito ? 'bold' : 'medium' });
      });
      if (pedacos.length) palavras.push(pedacos);
    });
    return palavras;
  }

  function escreverLinha(ctx, palavras, x, base, corpo) {
    ctx.font = fonteDe('medium', corpo);
    const espaco = ctx.measureText(' ').width;
    let cursor = x, primeiro = true;

    palavras.forEach(function (palavra) {
      palavra.forEach(function (p) {
        ctx.font = fonteDe(p.peso, corpo);
        /* Só o primeiro pedaço da linha é ancorado pela mancha; os
           seguintes continuam de onde o anterior parou, senão
           apareceria um vão entre eles. */
        if (primeiro) {
          cursor += ctx.measureText(p.t).actualBoundingBoxLeft;
          primeiro = false;
        }
        ctx.fillText(p.t, cursor, base);
        cursor += ctx.measureText(p.t).width;
      });
      cursor += espaco;
    });
  }

  function trocarMarcadores(texto, trocas) {
    return String(texto).replace(/\{[a-zA-Z]+\}/g, function (m) {
      return m in trocas ? trocas[m] : m;
    });
  }

  function formatarData(iso) {
    const p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] : String(iso || '');
  }

  function formatarHora(hm) {
    const p = String(hm || '').split(':');
    if (p.length < 2) return String(hm || '');
    return p[1] === '00' ? p[0] + 'h' : p[0] + 'h' + p[1];
  }

  async function montarAviso(dados, receita, prefixo) {
    const M = AVISO;
    const loja = dados.loja === 'cgt' ? 'cgt' : 'sjc';
    const e = M.escala;

    await carregarFontes();

    const tela = document.createElement('canvas');
    tela.width = M.largura * e;
    tela.height = M.altura * e;
    const ctx = tela.getContext('2d');
    ctx.scale(e, e);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = M.cores.fundo;
    ctx.fillRect(0, 0, M.largura, M.altura);
    ctx.fillStyle = M.cores.risco;
    M.riscos.forEach(function (r) { ctx.fillRect(r.x, r.y, r.l, r.a); });
    ctx.fillStyle = M.cores.texto;

    /* ---------- o nome ---------- */
    const nome = String(dados.cliente || '').trim();
    if (nome) {
      ctx.font = fonteDe(M.nome.peso, M.nome.corpo);
      escreverNaMancha(ctx, nome + ',', M.nome.x, M.nome.base);
    }

    /* ---------- as trocas ---------- */
    const etapa = String(dados.etapa || '').trim();
    const voce = (VOCE[dados.genero] || VOCE.eles);
    const trocas = {
      '{ETAPA}': etapa.toUpperCase(),
      '{etapa}': etapa.toLowerCase(),
      '{data}': formatarData(dados.data),
      '{hora}': formatarHora(dados.hora),
      '{responsavel}': String(dados.responsavel || '').trim(),
      '{voce}': voce.toLowerCase(),
      '{VOCE}': voce,
      '{cidade}': CIDADES[loja],
      '{precisar}': PRECISAR[dados.genero] || PRECISAR.eles
    };

    /* ---------- o título ---------- */
    const t = arrumarBloco(ctx, emPedacos(trocarMarcadores(receita.titulo, trocas)),
                           M.titulo);
    const entre = t.corpo * M.titulo.proporcaoEntrelinha;
    t.linhas.forEach(function (linha, i) {
      const base = M.titulo.baseUltima - (t.linhas.length - 1 - i) * entre;
      escreverLinha(ctx, linha, M.titulo.x, base, t.corpo);
    });

    /* ---------- o corpo ---------- */
    const c = arrumarBloco(ctx, emPedacos(trocarMarcadores(receita.corpo, trocas)),
                           M.corpo);
    const entreCorpo = c.corpo * (M.corpo.entrelinha / M.corpo.corpo);
    c.linhas.forEach(function (linha, i) {
      escreverLinha(ctx, linha, M.corpo.x, M.corpo.base + i * entreCorpo, c.corpo);
    });

    /* ---------- a logo ---------- */
    const logo = await imagemDe(LOGOS[loja]);
    const altura = M.logo.largura * (logo.naturalHeight / logo.naturalWidth);
    ctx.drawImage(logo, M.logo.centro - M.logo.largura / 2,
                        M.logo.baixo - altura, M.logo.largura, altura);

    const final = document.createElement('canvas');
    final.width = M.largura; final.height = M.altura;
    const fx = final.getContext('2d');
    fx.imageSmoothingEnabled = true;
    fx.imageSmoothingQuality = 'high';
    fx.drawImage(tela, 0, 0, M.largura, M.altura);

    return {
      ok: true,
      b64: final.toDataURL('image/png').split(',')[1],
      tipo: 'image/png',
      nome: prefixo + '-' + (semAcento(nome) || 'cliente') + '.png'
    };
  }

  function agendamento(dados) {
    /* O campo vem da lista do formulário, com o rótulo que a
       pessoa lê ("Lembrete"), não com um código. Comparar com
       string exata quebraria no dia em que alguém reescrevesse o
       rótulo — e quebraria em silêncio, caindo na confirmação. */
    const ehLembrete = /^lembr/i.test(String(dados.aviso || '').trim());
    const receita = ehLembrete
      ? AVISO_TEXTO.agendamento.lembrete
      : AVISO_TEXTO.agendamento.confirmacao;
    return montarAviso(dados, receita, 'agendamento');
  }

  function entrega(dados) {
    return montarAviso(dados, AVISO_TEXTO.entrega, 'entrega');
  }

  /* O índice é por ID do material. O que estiver aqui é gerado
     no aparelho; o que não estiver continua indo para o Apps
     Script, sem precisar mexer em nada. */
  return {
    'boas-vindas-impresso': boasVindasImpresso,
    'pos-visita': posVisita,
    'boas-vindas': cardWhatsApp,
    'agendamento': agendamento,
    'entrega': entrega,

    /* exposto para a tela de conferência */
    _medidas: { 'boas-vindas-impresso': BOAS_VINDAS }
  };
})();

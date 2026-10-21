/* ============================================================
   DOCUMENTO 101 — Termo de solicitação, compromisso e
   aprovação de medição · Dalmóbile
   ------------------------------------------------------------
   Monta o PDF inteiro DENTRO DO NAVEGADOR. Nada aqui fala com
   servidor: o medidor pode estar num apartamento em obra, sem
   sinal nenhum, e ainda assim gerar e mandar o documento.

   Por que isso importa mais aqui do que no 102: o 102 é um
   formulário que o cliente preenche em casa, com wi-fi. Este
   é preenchido em campo, com o cliente do lado, e o PDF é a
   prova de que a conversa aconteceu.

   O QUE É LEI E O QUE É NOSSO
   O texto jurídico — a advertência sobre prazos, a descrição
   de cada item do checklist e o termo de responsabilidade —
   foi copiado palavra por palavra do Documento 101 Revisão 3,
   de 14/08/2023. Não reescreva para "melhorar". Se precisar
   mudar, muda o documento oficial primeiro.

   O layout é nosso e segue o 102: Krub, logo da loja, mesma
   régua, mesmo rodapé.

   DEPENDÊNCIAS (todas já na página pelo medicao.html)
       pdf-lib        window.PDFLib
       fontkit        window.fontkit
       Krub-Medium.ttf · Krub-Bold.ttf
       imgs/dalmoSJC_preto_1.png · imgs/logoDalmo_caraguaPreto.png

   USO
       const bytes = await PDF101.montar(doc);
       PDF101.nomeDoArquivo(doc);
       PDF101.ITENS           // os 9 itens, fonte única da verdade
   ============================================================ */

const PDF101 = (function () {
  'use strict';

  /* A4 em pontos — igual ao 102, de propósito. */
  const PAGINA = { largura: 595.28, altura: 841.89 };
  const MARGEM = { esq: 42, dir: 42, topo: 48, baixo: 54 };

  const UTIL = PAGINA.largura - MARGEM.esq - MARGEM.dir;   // 511.28

  const COR = {
    tinta:   [0.08, 0.09, 0.09],
    suave:   [0.45, 0.47, 0.48],
    apagado: [0.62, 0.64, 0.65],
    linha:   [0.80, 0.81, 0.80],
    falta:   [0.54, 0.29, 0.07],   // âmbar: "não informado"
    reprova: [0.60, 0.15, 0.13],   // vermelho seco: "não apto"
    aprova:  [0.13, 0.40, 0.22],   // verde seco: "apto"
    regua:   [0.08, 0.09, 0.09],
    fundo:   [0.95, 0.95, 0.94],
    campo:   [0.97, 0.97, 0.96]
  };

  const CORPO = 9;
  const ENTRELINHA = 1.32;

  const LOJAS = {
    sjc: { nome: 'São José dos Campos', logo: 'imgs/dalmoSJC_preto_1.png' },
    cgt: { nome: 'Caraguatatuba',       logo: 'imgs/logoDalmo_caraguaPreto.png' }
  };

  const ALTURA_LOGO = 26;

  /* --------------------------------------------------------
     Os nove itens do checklist
     --------------------------------------------------------
     Texto íntegro do documento oficial. Esta lista é a fonte
     única: a tela do medidor lê daqui, o PDF escreve daqui.
     Duas cópias dessa lista viram, em algum momento, duas
     versões diferentes do mesmo documento.
     -------------------------------------------------------- */

  const ITENS = [
    {
      letra: 'a',
      titulo: 'Rebaixamento de gesso',
      texto: 'a altura e a posição do gesso colocado no teto têm relação direta com o ' +
             'mobiliário, influenciando em medidas de fechamentos e posição relativa de ' +
             'rasgos e iluminação que influencia na volumetria, nas relações de proporção ' +
             'e na proposta visual do projeto.'
    },
    {
      letra: 'b',
      titulo: 'Batentes de portas e janelas',
      texto: 'as posições e dimensões de batentes podem influenciar em afastamentos e ' +
             'posições de mobiliários, criando ou não restrições de espaços para o ' +
             'posicionamento e a montagem dos móveis.'
    },
    {
      letra: 'c',
      titulo: 'Posição e dimensão de pedras e granitos',
      texto: 'as posições e dimensões de pedras e granitos podem influenciar no ' +
             'posicionamento do mobiliário, criando ou não restrições de espaços para o ' +
             'posicionamento e a montagem dos móveis.'
    },
    {
      letra: 'd',
      titulo: 'Revestimento',
      texto: 'a posição, a paginação e a forma dos revestimentos podem ter consequências ' +
             'na proposta conceitual do projeto. Esse tópico é muito particular, sendo ' +
             'muito importante que o cliente analise criteriosamente seu desejo em relação ' +
             'ao projeto, uma vez que a característica estética é individual. Caso existam ' +
             'itens personalizados sugerimos que sejam revisados cuidadosamente com o ' +
             'projetista para plena compreensão da expectativa final do projeto.'
    },
    {
      letra: 'e',
      titulo: 'Pontos elétricos e hidráulicos',
      texto: 'a posição desses pontos tem papel fundamental na sua funcionalidade, sendo ' +
             'muito importante que esses elementos estejam definidos antes da medição para ' +
             'que seja possível a compatibilização dos elementos de projeto, como a ' +
             'transferência de pontos e eventual readequação de posições do mobiliário. ' +
             'A título de exemplo, é recorrente o conflito de um gaveteiro de cozinha com ' +
             'a posição do ponto de gás ou hidráulico. Qual a melhor solução, reposicionar ' +
             'o gaveteiro ou reposicionar o ponto hidráulico ou de gás?'
    },
    {
      letra: 'f',
      titulo: 'Colunas e vigas',
      texto: 'esses elementos frequentemente impõem soluções que implicam em eventuais ' +
             'cortes e mudanças de projeto. Além da sua medição é fundamental atenção ' +
             'especial do cliente para a consequência proposta em projeto, uma vez que ' +
             'haverá sempre uma relação de compromisso entre funcionalidade, ' +
             'compatibilidade e estética.'
    },
    {
      letra: 'g',
      titulo: 'Pontos de iluminação',
      texto: 'considerando o papel fundamental da iluminação na proposta decorativa do ' +
             'projeto, além das posições desses pontos e algumas de suas caraterísticas ' +
             'importantes, é fundamental a análise criteriosa do cliente e/ou seu ' +
             'especificador junto ao projetista de forma que seja compatibilizada a ' +
             'solução de projeto. A título de exemplo podemos mencionar a posição de um ' +
             'pendente em uma sala com pé direito de 6 metros. Esse pendente deve estar ' +
             'alinhado com algum elemento de projeto? Esse pendente deve estar ' +
             'centralizado em relação a algum item do mobiliário?'
    },
    {
      letra: 'h',
      titulo: 'Ar-condicionado, caixas, cortineiros, etc',
      texto: 'a posição desses elementos, assim como diversos outros, podem implicar em ' +
             'restrições ao posicionamento de painéis e móveis. A compatibilização desses ' +
             'elementos exige recuos, ajustes de fechamentos, etc.'
    },
    {
      letra: 'i',
      titulo: 'Eletrodomésticos',
      texto: 'a especificação e a posição de cada um dos eletrodomésticos podem trazer ' +
             'consequências diversas nos projetos. É fundamental ter toda a lista de ' +
             'especificação antes de iniciar a medição de forma que o relatório de medição ' +
             'possa contemplar as possíveis restrições de dimensão, posição do eletro, ' +
             'posição das fontes de alimentação, fiação etc.'
    }
  ];

  /* ========================================================
     TEXTO JURÍDICO — mexer SÓ AQUI
     --------------------------------------------------------
     Tudo que o cliente lê e assina está neste bloco, e em
     nenhum outro lugar do sistema. Ajustar uma cláusula é
     editar aqui; o resto do arquivo é desenho.

     PROCEDÊNCIA DE CADA TEXTO, que é o que importa quando
     alguém for revisar:

       TERMO_RESPONSABILIDADE e NOTA_RISCOS
         Oficiais, do Documento 101 Revisão 3 (14/08/2023),
         palavra por palavra. Não reescrever.

       ADVERTENCIA, TERMO_CIENCIA e PARECER_SUSPENSAO
         Minuta, out/2026, a partir do que a Dalmóbile pediu
         em reunião. Aprovados pelo cliente para entrar em
         uso, com revisão jurídica prevista depois.
     ======================================================== */

  /* Substitui a OBS do documento original. A palavra que faz o
     trabalho aqui é "cumulativo": sem ela, lê-se "ou" e basta
     uma das duas condições. */
  const ADVERTENCIA =
    'O imóvel somente será considerado APTO PARA MEDIÇÃO, e os prazos contratuais de ' +
    'produção, entrega e montagem somente terão início, após o cumprimento cumulativo ' +
    'das seguintes condições: (i) aprovação e assinatura, pelo CLIENTE, do presente ' +
    'termo com parecer de aptidão; e (ii) entrega, pelo CLIENTE, do checklist de ' +
    'eletrodomésticos e demais aparelhos, com as especificações completas.\n' +
    'Enquanto qualquer uma destas condições não for cumprida, o processo permanecerá ' +
    'suspenso, sem contagem de prazo, não respondendo a DALMÓBILE pelos atrasos daí ' +
    'decorrentes. Ambientes com indefinição de cores, modelos ou acabamentos impedem ' +
    'igualmente o andamento do processo, com os mesmos efeitos.\n' +
    'Constatada a inaptidão de qualquer item na visita do técnico, o processo será ' +
    'paralisado e o CLIENTE notificado, para que: (i) promova os ajustes necessários, ' +
    'hipótese em que será agendada nova visita, podendo esta ser cobrada; ou ' +
    '(ii) assine o termo de responsabilidade anexo, assumindo os riscos de prosseguir ' +
    'nas condições verificadas.';

  /* AMBIENTES APTOS — o cliente assina e o prazo começa.
     Não existia no documento original, que nunca previu
     assinatura quando está tudo certo. */
  const TERMO_CIENCIA =
    'Declaro que a medição foi realizada no imóvel na data acima, na minha presença ou ' +
    'com a minha autorização, e que os ambientes relacionados neste documento foram ' +
    'verificados e considerados aptos pelo técnico responsável.\n' +
    'Declaro estar ciente de que, a partir da assinatura deste termo e desde que ' +
    'entregue o checklist de eletrodomésticos e aparelhos, iniciam-se os prazos ' +
    'contratuais de produção, entrega e montagem, na forma do contrato firmado.\n' +
    'Declaro, ainda, estar ciente de que alterações de projeto, acabamento ou ' +
    'especificação solicitadas após esta data poderão implicar readequação de prazos e ' +
    'custos adicionais, que serão submetidos à minha aprovação antes da execução.';

  /* NÃO APTO e o cliente opta por prosseguir — texto oficial,
     íntegro, do Documento 101. */
  const TERMO_RESPONSABILIDADE =
    'Assumo inteira responsabilidade pelos riscos* associados ao projeto em decorrência ' +
    'das condições do local da obra, conforme registro fotográfico realizado pelo técnico ' +
    'responsável pela medição, e afirmo estar ciente das possíveis consequências para ' +
    'qualidade final dos serviços e dos possíveis custos adicionais para eventuais ' +
    'correções solicitadas.';

  const NOTA_RISCOS =
    '*Riscos: problemas de acabamento e possíveis custos adicionais por ocasião de ' +
    'eventuais necessidades de troca de peças, cortes, desmontagens e remontagens, ' +
    'fretes adicionais, etc. Qualquer custo adicional será submetido a aprovação antes ' +
    'de sua execução.';

  /* NÃO APTO e o cliente vai corrigir — aqui o CLIENTE NÃO
     ASSINA. Quem assina é a Dalmóbile, e o documento vale como
     comprovação de que a visita aconteceu e de que o cliente
     foi avisado. É esse aviso que suspende o prazo. */
  const PARECER_SUSPENSAO =
    'Os itens assinalados como não aptos impedem a realização da medição nas condições ' +
    'verificadas na data acima. O processo permanece suspenso e os prazos contratuais ' +
    'não se iniciam até a conclusão dos ajustes e a realização de nova visita técnica.\n' +
    'Este documento é enviado ao CLIENTE como comprovação da visita técnica e das ' +
    'condições encontradas, podendo a nova visita ser agendada e cobrada, conforme ' +
    'contrato.';

  const FECHAMENTO =
    'Considerando todas as possíveis causas e consequências ao projeto e à qualidade ' +
    'final dos serviços, reforçamos nosso compromisso em bem atendê-lo.';

  const SITUACOES = {
    'apto':          { rotulo: 'APTO PARA MEDIÇÃO',     cor: 'aprova'  },
    'nao-apto':      { rotulo: 'NÃO APTO PARA MEDIÇÃO', cor: 'reprova' },
    'nao-se-aplica': { rotulo: 'NÃO SE APLICA',         cor: 'suave'   }
  };


  /* --------------------------------------------------------
     Entrada
     -------------------------------------------------------- */

  /**
   * @param {object} doc
   *   { cliente, contrato, loja, dados, preenchido_em, atualizado_em,
   *     fotos: { <id>: Uint8Array } }
   * @returns {Promise<Uint8Array>}
   */
  async function montar(doc) {
    const { PDFDocument, rgb } = window.PDFLib;

    const pdf = await PDFDocument.create();
    pdf.setTitle('Termo de medição — ' + (doc.cliente || ''));
    pdf.setSubject('Documento 101 · Revisão 3');
    pdf.setProducer('Dalmóbile · Central de Peças');

    const fontes = await carregarFontes(pdf);
    const logo = await carregarLogo(pdf, doc.loja);
    const fotos = await embutirFotos(pdf, doc.fotos);

    const e = {
      pdf, rgb, fontes, logo, fotos,
      pagina: null, y: 0, numero: 0, paginas: []
    };

    const dados = doc.dados || {};

    novaPagina(e);
    cabecalho(e, doc);

    blocoAmbientes(e, dados);
    blocoAdvertencia(e);
    blocoChecklist(e, dados);
    blocoParecerFinal(e, dados);
    blocoDoFecho(e, dados);

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

      const [m, n] = await Promise.all([
        baixar('Krub-Medium.ttf'),
        baixar('Krub-Bold.ttf')
      ]);

      return {
        media:   await pdf.embedFont(m, { subset: true }),
        negrito: await pdf.embedFont(n, { subset: true }),
        propria: true
      };
    } catch (err) {
      console.warn('Krub não carregou; o PDF sai em Helvetica.', err);
      return {
        media:   await pdf.embedFont(StandardFonts.Helvetica),
        negrito: await pdf.embedFont(StandardFonts.HelveticaBold),
        propria: false
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
      console.warn('Logo de ' + loja + ' não carregou (' + conf.logo + ').', err);
      return null;
    }
  }

  /* As fotos chegam da tela já comprimidas em JPEG. Uma que
     não embute não derruba o documento inteiro: ela some e o
     resto sai, porque um termo sem uma foto ainda vale mais
     que nenhum termo. */
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

    texto(e, 'TERMO DE MEDIÇÃO', 15, 'negrito', COR.tinta, { espacamento: 0.4 });
    e.y -= 8;

    texto(e,
      'Solicitação, compromisso e aprovação de medição. Preenchido pelo técnico ' +
      'responsável, no imóvel, na presença do cliente.',
      CORPO, 'media', COR.suave, { largura: UTIL });

    e.y -= 14;

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y, width: UTIL, height: 1.1,
      color: e.rgb.apply(null, COR.regua)
    });
    e.y -= 18;

    campoEm(e, MARGEM.esq, 'CLIENTE', doc.cliente || '—', UTIL);
    e.y -= 6;

    const meio = UTIL / 2;
    const yAntes = e.y;
    campoEm(e, MARGEM.esq, 'Nº DO CONTRATO', doc.contrato || '—', meio - 10);
    const yDepois = e.y;

    e.y = yAntes;
    campoEm(e, MARGEM.esq + meio, 'DATA DA VISITA',
            dataCurta(doc.preenchido_em || doc.atualizado_em), meio - 10);

    e.y = Math.min(yDepois, e.y);
    e.y -= 20;
  }

  function campoEm(e, x, rotulo, valor, largura) {
    e.pagina.drawText(rotulo, {
      x: x, y: e.y, size: 6.6, font: e.fontes.negrito,
      color: e.rgb.apply(null, COR.apagado), characterSpacing: 0.5
    });
    e.y -= 11;

    const linhas = quebrar(valor, e.fontes.media, 10.5, largura);
    linhas.forEach((l) => {
      e.pagina.drawText(l, {
        x: x, y: e.y, size: 10.5, font: e.fontes.media,
        color: e.rgb.apply(null, COR.tinta)
      });
      e.y -= 10.5 * ENTRELINHA;
    });

    e.y -= 2;
    e.pagina.drawRectangle({
      x: x, y: e.y + 4, width: largura, height: 0.6,
      color: e.rgb.apply(null, COR.linha)
    });
  }


  /* --------------------------------------------------------
     Bloco 1 — ambientes a liberar
     -------------------------------------------------------- */

  function blocoAmbientes(e, dados) {
    const parcial = dados.tipoContrato === 'parcial';

    caber(e, 60);
    titulo(e, 'AMBIENTES A SEREM LIBERADOS');

    texto(e, parcial ? 'Contrato parcial' : 'Contrato total',
          CORPO + 1, 'negrito', COR.tinta);
    e.y -= 12;

    const ambientes = (dados.ambientes || []).filter((a) => String(a.nome || '').trim());

    if (!ambientes.length) {
      texto(e, 'Nenhum ambiente foi relacionado.', CORPO, 'media', COR.falta);
      e.y -= 18;
      return;
    }

    /* Três colunas: nome, checklist, projeto definido. */
    const COLS = [
      { titulo: 'AMBIENTE',          largura: 231.28 },
      { titulo: 'CHECKLIST',         largura: 140 },
      { titulo: 'PROJETO DEFINIDO',  largura: 140 }
    ];

    linhaDeTitulos(e, COLS);

    ambientes.forEach((amb) => {
      const celulas = [
        { texto: String(amb.nome).trim(), cor: COR.tinta, peso: 'media' },
        rotuloChecklist(amb.checklist),
        rotuloSimNao(amb.projetoDefinido)
      ];

      const alturas = celulas.map((c, i) =>
        quebrar(c.texto, e.fontes[c.peso], CORPO, COLS[i].largura - 10).length);
      const altura = Math.max.apply(null, alturas) * (CORPO * ENTRELINHA) + 9;

      if (caber(e, altura)) linhaDeTitulos(e, COLS);

      let x = MARGEM.esq;
      celulas.forEach((c, i) => {
        const linhas = quebrar(c.texto, e.fontes[c.peso], CORPO, COLS[i].largura - 10);
        let yy = e.y - 4;
        linhas.forEach((l) => {
          e.pagina.drawText(l, {
            x: x + 4, y: yy - CORPO, size: CORPO, font: e.fontes[c.peso],
            color: e.rgb.apply(null, c.cor)
          });
          yy -= CORPO * ENTRELINHA;
        });
        x += COLS[i].largura;
      });

      e.y -= altura;
      e.pagina.drawRectangle({
        x: MARGEM.esq, y: e.y, width: UTIL, height: 0.5,
        color: e.rgb.apply(null, COR.linha)
      });
    });

    e.y -= 14;

    if (String(dados.observacao || '').trim()) {
      blocoDeTexto(e, 'OBSERVAÇÕES', String(dados.observacao).trim());
    }
  }

  /* Um ambiente sem checklist não é um detalhe de formulário:
     é exatamente o que a advertência abaixo proíbe liberar.
     Por isso ele sai em âmbar, igual ao "não informado" do 102. */
  function rotuloChecklist(valor) {
    if (valor === 'anexo')         return { texto: 'Em anexo',     cor: COR.tinta,  peso: 'media'   };
    if (valor === 'nao-se-aplica') return { texto: 'Não se aplica', cor: COR.suave,  peso: 'media'   };
    return { texto: 'não informado', cor: COR.falta, peso: 'negrito' };
  }

  function rotuloSimNao(valor) {
    if (valor === true)  return { texto: 'Sim',  cor: COR.tinta, peso: 'media'   };
    if (valor === false) return { texto: 'Não',  cor: COR.falta, peso: 'negrito' };
    return { texto: 'não informado', cor: COR.falta, peso: 'negrito' };
  }

  function linhaDeTitulos(e, COLS) {
    caber(e, 24);

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y - 14, width: UTIL, height: 14,
      color: e.rgb.apply(null, COR.fundo)
    });

    let x = MARGEM.esq;
    COLS.forEach((c) => {
      e.pagina.drawText(c.titulo, {
        x: x + 4, y: e.y - 10, size: 6.6, font: e.fontes.negrito,
        color: e.rgb.apply(null, COR.suave), characterSpacing: 0.5
      });
      x += c.largura;
    });

    e.y -= 14;
    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y, width: UTIL, height: 0.6,
      color: e.rgb.apply(null, COR.regua)
    });
  }


  /* --------------------------------------------------------
     Bloco 2 — a advertência oficial
     -------------------------------------------------------- */

  function blocoAdvertencia(e) {
    const linhas = quebrar(ADVERTENCIA, e.fontes.media, 7.8, UTIL - 20);
    const altura = linhas.length * (7.8 * 1.4) + 18;

    caber(e, altura + 10);

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y - altura, width: UTIL, height: altura,
      color: e.rgb.apply(null, COR.campo)
    });
    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y - altura, width: 2.2, height: altura,
      color: e.rgb.apply(null, COR.falta)
    });

    let yy = e.y - 13;
    linhas.forEach((l) => {
      e.pagina.drawText(l, {
        x: MARGEM.esq + 12, y: yy, size: 7.8, font: e.fontes.media,
        color: e.rgb.apply(null, COR.tinta)
      });
      yy -= 7.8 * 1.4;
    });

    e.y -= altura + 22;
  }


  /* --------------------------------------------------------
     Bloco 3 — o checklist, item por item
     -------------------------------------------------------- */

  function blocoChecklist(e, dados) {
    caber(e, 50);
    titulo(e, 'CHECKLIST PARA LIBERAÇÃO DA MEDIÇÃO');

    const respostas = dados.itens || {};

    ITENS.forEach((item) => {
      desenharItem(e, item, respostas[item.letra] || {});
    });

    if (String(dados.outros || '').trim()) {
      blocoDeTexto(e, 'OUTROS', String(dados.outros).trim());
    }
  }

  function desenharItem(e, item, resposta) {
    const fotos = (resposta.fotos || []).filter((f) => e.fotos[f.id || f]);

    /* Mede o item INTEIRO antes de desenhar — descrição, selo,
       parecer, motivo e fotos — e vira a página antes de começar
       se ele não couber no que sobrou.

       Isto não é capricho de diagramação. A foto é a prova do
       item: o cliente assina um termo que diz "conforme registro
       fotográfico", e uma foto que cai sozinha no topo da página
       seguinte, longe do item que ela documenta, é prova que se
       contesta. O item e a prova dele andam juntos. */
    const altura = alturaDoItem(e, item, resposta, fotos);
    const espacoDaPagina = PAGINA.altura - MARGEM.topo - MARGEM.baixo;

    if (e.y - altura < MARGEM.baixo && altura <= espacoDaPagina) {
      novaPagina(e);
    }

    /* Letra + título */
    e.pagina.drawText(item.letra + ')', {
      x: MARGEM.esq, y: e.y - 10, size: 10, font: e.fontes.negrito,
      color: e.rgb.apply(null, COR.tinta)
    });
    e.pagina.drawText(item.titulo, {
      x: MARGEM.esq + 16, y: e.y - 10, size: 10, font: e.fontes.negrito,
      color: e.rgb.apply(null, COR.tinta)
    });
    e.y -= 22;

    /* Descrição oficial */
    const descricao = quebrar(item.texto, e.fontes.media, 8.2, UTIL - 16);
    descricao.forEach((l) => {
      caber(e, 12);
      e.pagina.drawText(l, {
        x: MARGEM.esq + 16, y: e.y, size: 8.2, font: e.fontes.media,
        color: e.rgb.apply(null, COR.suave)
      });
      e.y -= 8.2 * 1.4;
    });
    e.y -= 8;

    /* Situação */
    selo(e, resposta.situacao);

    /* Parecer e motivo só aparecem se existirem. Campo vazio
       impresso é ruído; e o original já tem linha em branco
       demais. */
    if (String(resposta.parecer || '').trim()) {
      campoDeTexto(e, 'Parecer do técnico', String(resposta.parecer).trim());
    }
    if (String(resposta.motivo || '').trim()) {
      campoDeTexto(e, 'Motivo', String(resposta.motivo).trim());
    }

    if (fotos.length) desenharFotos(e, fotos, item);

    e.y -= 10;
    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y, width: UTIL, height: 0.5,
      color: e.rgb.apply(null, COR.linha)
    });
    e.y -= 14;
  }

  function selo(e, situacao) {
    const conf = SITUACOES[situacao];
    const rotulo = conf ? conf.rotulo : 'NÃO RESPONDIDO';
    const cor = conf ? COR[conf.cor] : COR.falta;

    const largura = e.fontes.negrito.widthOfTextAtSize(rotulo, 7.4) + 16;

    caber(e, 22);

    e.pagina.drawRectangle({
      x: MARGEM.esq + 16, y: e.y - 13, width: largura, height: 15,
      borderWidth: 0.9, borderColor: e.rgb.apply(null, cor)
    });
    e.pagina.drawText(rotulo, {
      x: MARGEM.esq + 24, y: e.y - 9, size: 7.4, font: e.fontes.negrito,
      color: e.rgb.apply(null, cor), characterSpacing: 0.4
    });

    e.y -= 24;
  }

  function campoDeTexto(e, rotulo, valor) {
    const linhas = quebrar(valor, e.fontes.media, 8.6, UTIL - 32);

    caber(e, linhas.length * (8.6 * 1.4) + 16);

    e.pagina.drawText(rotulo.toUpperCase(), {
      x: MARGEM.esq + 16, y: e.y, size: 6.4, font: e.fontes.negrito,
      color: e.rgb.apply(null, COR.apagado), characterSpacing: 0.5
    });
    e.y -= 11;

    linhas.forEach((l) => {
      caber(e, 12);
      e.pagina.drawText(l, {
        x: MARGEM.esq + 16, y: e.y, size: 8.6, font: e.fontes.media,
        color: e.rgb.apply(null, COR.tinta)
      });
      e.y -= 8.6 * 1.4;
    });

    e.y -= 6;
  }

  const FOTO = { largura: (UTIL - 16 - 10) / 2, teto: 150, vao: 10 };

  /* Duas por linha, altura pela proporção real com teto — foto em
     pé não pode ocupar meia página sozinha. */
  function linhasDeFotos(e, fotos) {
    const linhas = [];

    for (let i = 0; i < fotos.length; i += 2) {
      const medidas = fotos.slice(i, i + 2).map((f) => {
        const img = e.fotos[f.id || f];
        const escala = Math.min(FOTO.largura / img.width, FOTO.teto / img.height);
        return {
          img,
          largura: img.width * escala,
          altura: img.height * escala,
          legenda: String(f.legenda || '').trim()
        };
      });

      const altura = Math.max.apply(null, medidas.map((m) => m.altura));
      const temLegenda = medidas.some((m) => m.legenda);

      linhas.push({ medidas, altura, temLegenda, total: altura + (temLegenda ? 16 : 6) });
    }

    return linhas;
  }

  function desenharFotos(e, fotos, item) {
    linhasDeFotos(e, fotos).forEach((linha) => {
      /* Se esta fileira tiver mesmo que virar a página — item com
         muitas fotos, maior que uma folha —, ela se apresenta.
         Nunca uma foto solta no topo de uma página. */
      if (caber(e, linha.total + 10)) {
        e.pagina.drawText(item.letra + ') ' + item.titulo + ' — continuação', {
          x: MARGEM.esq, y: e.y - 10, size: 7.4, font: e.fontes.negrito,
          color: e.rgb.apply(null, COR.suave), characterSpacing: 0.4
        });
        e.y -= 22;
      }

      let x = MARGEM.esq + 16;

      linha.medidas.forEach((m) => {
        e.pagina.drawImage(m.img, {
          x: x, y: e.y - m.altura, width: m.largura, height: m.altura
        });

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

  /* Altura do item inteiro, para decidir a quebra antes de
     desenhar qualquer coisa. Os números acompanham o que o
     desenho faz logo abaixo; mudar um pede mudar o outro. */
  function alturaDoItem(e, item, resposta, fotos) {
    let h = 22;   // letra + título

    h += quebrar(item.texto, e.fontes.media, 8.2, UTIL - 16).length * (8.2 * 1.4) + 8;
    h += 24;      // selo

    ['parecer', 'motivo'].forEach((campo) => {
      const valor = String(resposta[campo] || '').trim();
      if (!valor) return;
      h += 11 + quebrar(valor, e.fontes.media, 8.6, UTIL - 32).length * (8.6 * 1.4) + 6;
    });

    if (fotos.length) {
      h += linhasDeFotos(e, fotos).reduce((s, l) => s + l.total, 0) + 4;
    }

    return h + 24;   // régua e respiro até o próximo item
  }


  /* --------------------------------------------------------
     Bloco 4 — parecer final e assinatura do técnico
     -------------------------------------------------------- */

  function blocoParecerFinal(e, dados) {
    caber(e, 120);
    titulo(e, 'PARECER FINAL DO TÉCNICO RESPONSÁVEL');

    const aptos = dados.parecerFinal === 'aptos';
    const naoAptos = dados.parecerFinal === 'nao-aptos';

    const rotulo = aptos    ? 'AMBIENTES APTOS PARA MEDIÇÃO'
                 : naoAptos ? 'AMBIENTES NÃO APTOS PARA MEDIÇÃO'
                            : 'PARECER NÃO INFORMADO';
    const cor = aptos ? COR.aprova : naoAptos ? COR.reprova : COR.falta;

    const largura = e.fontes.negrito.widthOfTextAtSize(rotulo, 9) + 20;

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y - 16, width: largura, height: 19,
      borderWidth: 1.1, borderColor: e.rgb.apply(null, cor)
    });
    e.pagina.drawText(rotulo, {
      x: MARGEM.esq + 10, y: e.y - 11, size: 9, font: e.fontes.negrito,
      color: e.rgb.apply(null, cor), characterSpacing: 0.4
    });
    e.y -= 30;

    if (naoAptos && String(dados.ambientesNaoAptos || '').trim()) {
      campoDeTexto(e, 'Ambientes não aptos (medição parcial)',
                   String(dados.ambientesNaoAptos).trim());
    }

    e.y -= 10;
    assinaturaDoTecnico(e, dados);
  }

  function assinaturaDoTecnico(e, dados) {
    caber(e, 70);

    const nome = String(dados.tecnico || '').trim();

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y, width: 280, height: 0.8,
      color: e.rgb.apply(null, COR.regua)
    });
    e.y -= 12;

    e.pagina.drawText(nome || 'nome não informado', {
      x: MARGEM.esq, y: e.y, size: 10, font: e.fontes.negrito,
      color: e.rgb.apply(null, nome ? COR.tinta : COR.falta)
    });
    e.y -= 12;

    e.pagina.drawText('Técnico responsável pela medição', {
      x: MARGEM.esq, y: e.y, size: 7.4, font: e.fontes.media,
      color: e.rgb.apply(null, COR.suave)
    });
    e.y -= 26;
  }


  /* --------------------------------------------------------
     Bloco 5 — o fecho, que depende do parecer
     --------------------------------------------------------
     TRÊS DESFECHOS, TRÊS DOCUMENTOS DIFERENTES. Esta é a parte
     do PDF com consequência contratual, e por isso ela nunca
     adivinha: cada caminho só sai quando o técnico disse qual é.

       aptos
         O cliente assina dando ciência de que o prazo começa.

       nao-aptos + caminho 'prosseguir'
         O cliente assina o termo de responsabilidade e o prazo
         começa assim mesmo, com o risco por escrito.

       nao-aptos + caminho 'corrigir'
         O CLIENTE NÃO ASSINA. Quem assina é a Dalmóbile, e o
         documento vale como prova de que a visita aconteceu e
         de que o cliente foi avisado. O prazo fica suspenso.

     Sem o caminho escolhido, o documento sai dizendo que falta
     escolher — e não sai nem um termo nem outro. Imprimir um
     termo de assinatura "por via das dúvidas" é convidar
     alguém a assinar depois, sem ninguém saber de quê.
     -------------------------------------------------------- */

  function blocoDoFecho(e, dados) {
    const aptos = dados.parecerFinal === 'aptos';
    const naoAptos = dados.parecerFinal === 'nao-aptos';

    if (aptos) return termoDeCiencia(e);

    if (naoAptos && dados.caminhoInapto === 'prosseguir') return termoDeResponsabilidade(e);
    if (naoAptos && dados.caminhoInapto === 'corrigir')    return parecerDeSuspensao(e, dados);

    /* Parecer em branco, ou "não apto" sem caminho escolhido. */
    caber(e, 70);
    e.y -= 6;

    avisoEmFalta(e, naoAptos
      ? 'O técnico marcou os ambientes como NÃO APTOS, mas não registrou se o cliente ' +
        'optou por corrigir e remarcar ou por prosseguir assumindo os riscos. Sem essa ' +
        'escolha não há como emitir o termo correto, e os prazos contratuais não se ' +
        'iniciam por este documento.'
      : 'O parecer final do técnico não foi informado. Este documento não conclui pela ' +
        'aptidão nem pela inaptidão do imóvel, e os prazos contratuais não se iniciam ' +
        'por ele.');

    fechamento(e);
  }

  function avisoEmFalta(e, aviso) {
    const linhas = quebrar(aviso, e.fontes.negrito, 9, UTIL - 32);
    const altura = linhas.length * (9 * 1.45) + 26;

    caber(e, altura + 20);

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y - altura, width: UTIL, height: altura,
      color: e.rgb(0.99, 0.96, 0.91)
    });
    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y - altura, width: 2.4, height: altura,
      color: e.rgb.apply(null, COR.falta)
    });

    let yy = e.y - 18;
    linhas.forEach((l) => {
      e.pagina.drawText(l, {
        x: MARGEM.esq + 14, y: yy, size: 9, font: e.fontes.negrito,
        color: e.rgb.apply(null, COR.falta)
      });
      yy -= 9 * 1.45;
    });

    e.y -= altura + 20;
  }

  /* O que o cliente assina sempre começa em página própria:
     assinar o rodapé de uma página que começa no meio de outro
     assunto é pedir contestação. */

  function termoDeCiencia(e) {
    novaPagina(e);
    titulo(e, 'TERMO DE CIÊNCIA E INÍCIO DE PRAZOS');

    texto(e,
      'Os ambientes relacionados neste documento foram considerados aptos para medição. ' +
      'Assine abaixo para dar ciência do início dos prazos contratuais:',
      8.6, 'media', COR.suave, { largura: UTIL });
    e.y -= 16;

    caixaDeTermo(e, TERMO_CIENCIA);
    e.y -= 40;

    linhaDeAssinatura(e, 'Nome do cliente');
    e.y -= 14;
    linhaDeAssinatura(e, 'Assinatura do cliente');
    e.y -= 26;

    fechamento(e);
  }

  function termoDeResponsabilidade(e) {
    novaPagina(e);
    titulo(e, 'TERMO DE RESPONSABILIDADE DO CLIENTE');

    texto(e,
      'O parecer do técnico responsável foi "Não apto para medição" e o cliente optou ' +
      'por prosseguir com a medição e a elaboração do Projeto Executivo. Assine o ' +
      'termo abaixo:',
      8.6, 'media', COR.suave, { largura: UTIL });
    e.y -= 16;

    caixaDeTermo(e, TERMO_RESPONSABILIDADE);
    e.y -= 40;

    linhaDeAssinatura(e, 'Nome do cliente');
    e.y -= 14;
    linhaDeAssinatura(e, 'Assinatura do cliente');
    e.y -= 26;

    texto(e, NOTA_RISCOS, 7.2, 'media', COR.suave, { largura: UTIL });
    e.y -= 18;

    fechamento(e);
  }

  /* Aqui NÃO há linha de assinatura do cliente, e isso é o ponto
     do documento: ele prova que a Dalmóbile foi, viu e avisou.
     Uma linha em branco esperando o cliente faria parecer que
     falta alguma coisa para o prazo ficar suspenso — e não
     falta. O aviso basta. */
  function parecerDeSuspensao(e, dados) {
    novaPagina(e);
    titulo(e, 'PARECER DE INAPTIDÃO E SUSPENSÃO DE PRAZOS');

    caixaDeTermo(e, PARECER_SUSPENSAO);
    e.y -= 24;

    texto(e,
      'Documento emitido e assinado pela Dalmóbile. Não requer assinatura do cliente.',
      8, 'negrito', COR.suave, { largura: UTIL });
    e.y -= 22;

    assinaturaDoTecnico(e, dados);
    e.y -= 6;

    fechamento(e);
  }

  function caixaDeTermo(e, conteudo) {
    const linhas = quebrar(conteudo, e.fontes.media, 10, UTIL - 32);
    const altura = linhas.length * (10 * 1.45) + 28;

    caber(e, altura + 20);

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y - altura, width: UTIL, height: altura,
      color: e.rgb.apply(null, COR.campo)
    });

    let yy = e.y - 20;
    linhas.forEach((l) => {
      e.pagina.drawText(l, {
        x: MARGEM.esq + 16, y: yy, size: 10, font: e.fontes.media,
        color: e.rgb.apply(null, COR.tinta)
      });
      yy -= 10 * 1.45;
    });

    e.y -= altura;
  }

  function linhaDeAssinatura(e, rotulo) {
    caber(e, 44);
    e.y -= 20;

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y, width: 340, height: 0.8,
      color: e.rgb.apply(null, COR.regua)
    });
    e.y -= 11;

    e.pagina.drawText(rotulo, {
      x: MARGEM.esq, y: e.y, size: 7.4, font: e.fontes.media,
      color: e.rgb.apply(null, COR.suave)
    });
    e.y -= 8;
  }

  function fechamento(e) {
    caber(e, 36);
    texto(e, FECHAMENTO, 8.6, 'media', COR.tinta, { largura: UTIL });
    e.y -= 14;
  }


  /* --------------------------------------------------------
     Peças comuns
     -------------------------------------------------------- */

  function titulo(e, rotulo) {
    e.pagina.drawText(rotulo, {
      x: MARGEM.esq, y: e.y - 10, size: 9.6, font: e.fontes.negrito,
      color: e.rgb.apply(null, COR.tinta), characterSpacing: 0.5
    });
    e.y -= 18;

    e.pagina.drawRectangle({
      x: MARGEM.esq, y: e.y, width: UTIL, height: 0.9,
      color: e.rgb.apply(null, COR.regua)
    });
    e.y -= 16;
  }

  function blocoDeTexto(e, rotulo, valor) {
    const linhas = quebrar(valor, e.fontes.media, 8.8, UTIL - 24);

    caber(e, linhas.length * (8.8 * 1.4) + 26);

    e.pagina.drawText(rotulo, {
      x: MARGEM.esq, y: e.y, size: 6.6, font: e.fontes.negrito,
      color: e.rgb.apply(null, COR.apagado), characterSpacing: 0.5
    });
    e.y -= 13;

    linhas.forEach((l) => {
      caber(e, 12);
      e.pagina.drawText(l, {
        x: MARGEM.esq, y: e.y, size: 8.8, font: e.fontes.media,
        color: e.rgb.apply(null, COR.tinta)
      });
      e.y -= 8.8 * 1.4;
    });

    e.y -= 14;
  }

  function rodapes(e, doc) {
    const total = e.paginas.length;

    e.paginas.forEach((pagina, i) => {
      const loja = LOJAS[doc.loja];

      const esquerda = 'Documento 101 · Revisão 3 · Dalmóbile' +
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

      const tecnico = String((doc.dados || {}).tecnico || '').trim();
      pagina.drawText(
        'Preenchido em campo' + (tecnico ? ' por ' + tecnico : '') + ' em ' +
        dataLonga(doc.preenchido_em || doc.atualizado_em) +
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
      caber(e, tamanho * ENTRELINHA + 4);
      e.pagina.drawText(l, {
        x: MARGEM.esq, y: e.y, size: tamanho, font: fonte,
        color: e.rgb.apply(null, cor),
        characterSpacing: o.espacamento || 0
      });
      e.y -= tamanho * ENTRELINHA;
    });
  }

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
     Datas e nome do arquivo
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

  function nomeDoArquivo(doc) {
    const limpo = String(doc.cliente || 'cliente')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    return 'termo-medicao-' + limpo + (doc.contrato ? '-' + doc.contrato : '') + '.pdf';
  }

  return { montar, nomeDoArquivo, ITENS, SITUACOES };
})();

/* Um `const` no topo de um script não vira propriedade de
   window — vira ligação do escopo do script. Quem escreve
   `PDF101` alcança; quem escreve `window.PDF101` recebe
   undefined, e a tela conclui, errado, que o gerador não
   carregou. A linha abaixo fecha esse buraco. */
window.PDF101 = PDF101;

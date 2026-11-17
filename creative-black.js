/* ============================================================
   ABA "CREATIVE BLACK" — kit dos consultores, nov/2026
   ------------------------------------------------------------
   ⚠️ COMO CADA NOME PODE SER USADO.

   "Creative Black" é o nome da campanha da fábrica. Textos,
   imagens e peça falam em "Condição de Fábrica", e o nome da
   liquidação de fim de ano ("Black Friday") não aparece para o
   cliente.

   Não é capricho de redação: a Dalmóbile vende móvel planejado
   de ticket alto, e esse nome põe o projeto na mesma prateleira
   da liquidação. A condição é da fábrica, para quem fecha agora,
   e é assim que ela tem de chegar.

   Então, se um dia alguém for "padronizar" os nomes aqui: o nome
   da aba pode mudar à vontade; o que está dentro das strings de
   TEXTOS e o que o canvas desenha, não.

   O termo proibido aparece de propósito em dois lugares deste
   arquivo — aqui e na regra que manda não usá-lo — porque regra
   que proíbe uma palavra precisa dizer qual é. A prova 9 conhece
   estes dois lugares pelo texto e cai se ele surgir num terceiro.

   ------------------------------------------------------------
   POR QUE TUDO NUM ARQUIVO SÓ

   A ação acaba em 30/11/2026. Um arquivo só, com os textos, a
   montagem da tela e o gerador juntos, faz a retirada ser
   trivial: apague creative-black.js e as DUAS linhas que o
   index.html tem por causa dele (a tag <script> e a chamada de
   CreativeBlack.montar() dentro do iniciarCargos). Nada mais no
   repositório sabe que esta aba existiu — o CSS também nasce
   daqui, de propósito.

   Não entra no precache do sw.js: aquela lista é das telas de
   obra, que precisam abrir sem sinal dentro de um apartamento.
   Esta aba é de loja, com rede, e as imagens são pesadas.
   ============================================================ */

window.CreativeBlack = (function () {
  'use strict';

  /* ------------------------------------------------------------
     A DATA DE SAÍDA
     ------------------------------------------------------------
     Fim do dia 30/11/2026 no horário de Brasília (UTC-3), que em
     1º/12 às 00:00 vira 03:00 UTC.

     A aba sai do menu sozinha porque os textos prometem "até 28
     de novembro" por escrito. Uma aba esquecida no ar em
     dezembro faria o consultor abrir a conversa oferecendo uma
     condição que a fábrica já fechou — e o cliente cobraria, com
     o print na mão. Esquecer de tirar é o caso normal, não o
     excepcional: é por isso que quem tira é o código.

     Os dois dias de folga entre o 28 (último dia para o cliente)
     e o 30 são de propósito: o fechamento de sábado ainda é
     lançado na segunda, e o consultor precisa da aba para isso.
     ------------------------------------------------------------ */
  const FIM_CREATIVE_BLACK = new Date('2026-12-01T03:00:00Z');

  function dentroDoPrazo(agora) {
    return (agora || new Date()) < FIM_CREATIVE_BLACK;
  }

  /* A chave da aba na matriz de vitrine. O prefixo 'aba-' é o que
     o index.html já usa para as outras cinco. */
  const CHAVE_ABA = 'aba-creative-black';

  /* ============================================================
     OS TEXTOS
     ------------------------------------------------------------
     Fonte única: o documento da ação. Estão aqui letra por letra,
     sem reescrita, porque quem escreveu pesou cada palavra contra
     o que pode e o que não pode ser dito por escrito ao cliente.
     Melhorar a redação aqui é mudar a política da ação sem
     passar por quem a definiu.
     ============================================================ */

  const TEXTOS = {

    /* --- B1 · topo --- */
    topo: {
      rotulo: 'CREATIVE BLACK · ATÉ 28 DE NOVEMBRO',
      titulo: 'Condições especiais para fechar projetos na Creative Black',
      apoio: 'Mensagens prontas, imagens para o WhatsApp e a peça com o ' +
             'nome do cliente. A condição vale nas duas lojas, para toda a ' +
             'linha Dalmóbile. Para o cliente, o nome é sempre Condição de ' +
             'Fábrica ou Creative Black.'
    },

    /* --- B2 · a caixa que não recolhe ---
       Aqui, e só aqui, o percentual aparece. A aba fica atrás do
       login, então este número é interno. Ele é TEXTO DA TELA: não
       passa pelo canvas, não entra em peça e não é copiável por
       botão nenhum, para não acabar colado numa conversa. */
    regras: {
      titulo: 'Antes de falar com o cliente',
      itens: [
        { forte: 'A condição é de 12% de desconto em projetos que estão na casa!',},
        { forte: 'O pedido precisa ser implantado até dia 30/11. ',
          resto: ' O pagamento fica com prazo limite para 07/12.' },
        { forte: 'O número de desconto só sai por ligação ou na loja.',
          resto: ' Nunca por escrito: nem no WhatsApp, nem em imagem, nem em e-mail. Caso as negociações já estejam sendo feitas via WhatsApp, abrir excessão.' },
      
        { forte: 'Para o cliente, fale em "Creative Black" ou "Condição de Fábrica".',
          resto: ' Não use "Black Friday" nem "promoção".' },
        { forte: 'Puxe o fechamento para o quanto antes.',
          resto: ' O dia 28 é o último empurrão, não a meta.' },
        { forte: 'Pagamento:',
          resto: ' segue a regra da fábrica, até 07/12.' },
        { forte: 'Não fale de 30/11 nem de 07/12 com o cliente.',
          resto: ' Para ele, o prazo é 28 de novembro.' }
      ]
    },

    /* --- B3 · o calendário --- */
    calendario: {
      titulo: 'O que mandar e quando',
      linhas: [
        { quando: '16 a 19/11',      mensagem: 'Mensagem 1 · Abertura',        imagem: 'W1 Reservado ou a peça com o nome' },
        { quando: '17 a 22/11',      mensagem: 'Para quem não respondeu',      imagem: 'W2 Na conversa' },
        { quando: '20/11',           mensagem: 'Feriado: não mande nada',      imagem: '—' },
        { quando: '23 e 24/11',      mensagem: 'Mensagem 2 · Convite',         imagem: 'W3 Convite + W4 Faltam 5 dias' },
        { quando: '25/11 · quarta',  mensagem: 'Dia Grafite na loja',          imagem: 'W4 Faltam 3 dias (de manhã)', destaque: true },
        { quando: '26 e 27/11',      mensagem: 'Mensagem 3 · Última chamada',  imagem: 'W4 Falta 1 dia (no dia 27)' },
        { quando: '28/11 · sábado',  mensagem: 'Último dia',                   imagem: 'W5 Último dia', destaque: true }
      ]
    },

    /* --- B4 · as mensagens ---
       Os colchetes FICAM no texto copiado, de propósito: quem
       troca [Nome] por "Marina" é o consultor, olhando a conversa.
       Preencher automático erraria o apelido, o ambiente e o
       tratamento, e um "Oi, Marina e Rafael Toledo" colado errado
       estraga mais do que o colchete à mostra. */
    mensagens: {
      titulo: 'Mensagens prontas',
      apoio: 'Troque o que está entre colchetes. A imagem vai junto, mas ' +
             'quem chama o cliente é a sua mensagem.',
      itens: [
        { nome: 'Mensagem 1 · Abertura', quando: '16 a 19/11',
          texto: 'Oi, [Nome], como vai? Aqui é [Consultor], da Dalmóbile. A fábrica ' +
                 'abriu uma condição muito especial que vale até o dia 28 de novembro, e o ' +
                 'seu projeto [da cozinha] pode fazer parte dessa condição especial. Gostaria de ter um tempo para ' +
                 'te explicar melhor por telefone ou aqui na loja, porque muda o valor final. Qual horário fica ' +
                 'bom pra você esta semana?' },
        { nome: 'Mensagem 2 · Convite', quando: '23 e 24/11',
          texto: 'Oi, [Nome]! Na quarta, dia 25, a loja vai dedicar o dia inteiro a quem ' +
                 'quer fechar o projeto dentro da condição especial da Creative Black. Posso reservar um horário pra você e acertarmos os ' +
                 'detalhes do seu [ambiente]?' },
        { nome: 'Mensagem 3 · Última chamada', quando: '26 e 27/11',
          texto: '[Nome], passando pra lembrar: sábado, dia 28, é o último dia da ' +
                 'Condição de Fábrica. Depois disso, o projeto volta para a condição ' +
                 'normal da loja. Consegue vir aqui no sábado, ou prefere que eu te ' +
                 'ligue antes?' }
      ]
    },

    /* --- B4 · as legendas curtas --- */
    legendas: {
      titulo: 'Legendas curtas',
      apoio: 'Para mandar junto com cada imagem.',
      itens: [
        { nome: 'W1 Reservado',
          texto: 'Oi, [Nome]! Separei isto para o seu projeto. Posso te ligar hoje para explicar?' },
        { nome: 'W2 Na conversa',
          texto: '[Nome], o seu projeto pode entrar nessa condição.  Vamos conversar para que eu te explique como pode ficar?' },
        { nome: 'W3 Convite',
          texto: 'Fica o convite para quarta, [Nome]. Me diz o melhor horário que eu deixo reservado.' },
        { nome: 'W4 Contagem',
          texto: 'Faltam poucos dias pra acabar a nossa Creative Black, [Nome]. Quer que eu reserve um horário para fecharmos?' },
        { nome: 'W5 Último dia',
          texto: '[Nome], hoje é o último dia com condições especiais para fecharmos seu projeto! Ainda dá tempo, vamos marcar nossa reunião?' }
      ]
    },

    /* --- B5 · as respostas --- */
    respostas: {
      titulo: 'Se o cliente perguntar',
      itens: [
        { nome: '"Que condição é essa?"',
          texto: 'É uma condição que a fábrica abriu para as lojas neste fim de ano, e ' +
                 'vale até o dia 28. Ela muda o valor do projeto, e eu prefiro te mostrar ' +
                 'com os números do seu. Posso te ligar agora?' },
        { nome: '"Me manda o valor por aqui."',
          texto: 'Te passo, sim, mas por ligação: quero conferir com você os itens do ' +
                 'projeto antes, porque a condição entra sobre o que a gente fechar. São ' +
                 'uns dez minutos. Pode ser [horário]?' },
        { nome: '"Posso fechar depois do dia 28?"',
          texto: 'A condição vale para os projetos fechados até sábado, dia 28. Depois ' +
                 'disso, ele segue com a condição normal da loja.' },
        { nome: '"Ainda não tenho projeto. Dá tempo?"',
          texto: 'Dá, se a gente começar agora. Me conta qual é o ambiente e se o imóvel ' +
                 'já está pronto para a medição, que eu vejo com o projetista o caminho ' +
                 'mais rápido.' },
        { nome: '"Vale para qualquer ambiente?"',
          texto: 'Vale para toda a linha Dalmóbile.' }
      ]
    },

    /* --- B6 · as imagens ---
       Os arquivos existem duas vezes, em imgs/creative-black/sjc/ e
       .../cgt/, com o mesmo nome: cada loja tem a sua logo
       aplicada na arte, exportada do Illustrator. É o caminho que
       muda, nunca o nome. */
    imagens: {
      titulo: 'Imagens para mandar na conversa',
      apoio: 'Já estão com a logo da sua loja. Mande sempre com uma mensagem sua.',
      itens: [
        { arquivo: 'w1-reservado.jpg',  nome: 'Reservado',            para: 'Abrir a conversa' },
        { arquivo: 'w2-na-conversa.jpg', nome: 'Na conversa',          para: 'Para quem não respondeu' },
        { arquivo: 'w3-convite.jpg',    nome: 'Convite · Dia Grafite', para: 'Convidar para quarta, 25/11' },
        { arquivo: 'w4-faltam-5.jpg',   nome: 'Faltam 5 dias',        para: '23/11' },
        { arquivo: 'w4-faltam-3.jpg',   nome: 'Faltam 3 dias',        para: '25/11' },
        { arquivo: 'w4-falta-1.jpg',    nome: 'Falta 1 dia',          para: '27/11' },
        { arquivo: 'w5-ultimo-dia.jpg', nome: 'Último dia',           para: '28/11' }
      ]
    },

    /* --- B7 · o gerador --- */
    gerador: {
      titulo: 'Peça com o nome do cliente',
      apoio: 'Preencha e gere. A imagem sai com a logo da sua loja e o seu nome.',
      aviso: 'A peça não mostra valor nem percentual, de propósito. O número é ' +
             'sempre por ligação ou na loja.'
    },

    /* --- B8 · rodapé --- */
    rodape: 'Dúvidas sobre a condição: fale com a gerência da sua loja.'
  };

  /* ============================================================
     O AMBIENTE E O GÊNERO DA FRASE
     ------------------------------------------------------------
     "o projeto da sua cozinha" x "o projeto do seu closet". O
     mapa é curto de propósito: ambiente que não está nele cai na
     frase SEM ambiente, que está sempre certa.

     É a escolha conservadora. Chutar a concordância por
     terminação ("termina em A, então é feminino") acerta cozinha
     e erra "área de serviço do seu"... e erra calado, numa peça
     que já foi mandada para o cliente com o nome dele. Frase
     mais curta e certa vale mais que frase completa e errada.
     ============================================================ */
  const AMBIENTES = {
    /* femininos */
    'cozinha': 'da sua', 'sala': 'da sua', 'lavanderia': 'da sua',
    'area gourmet': 'da sua', 'varanda gourmet': 'da sua',
    'suite': 'da sua', 'despensa': 'da sua',
    /* masculinos */
    'closet': 'do seu', 'quarto': 'do seu', 'escritorio': 'do seu',
    'home office': 'do seu', 'banheiro': 'do seu', 'dormitorio': 'do seu',
    'home theater': 'do seu', 'lavabo': 'do seu'
  };

  /* A chave do mapa é sem acento e minúscula, para "Área Gourmet"
     e "area gourmet" caírem no mesmo lugar. O que vai desenhado é
     o que a pessoa digitou, só em minúscula: a peça diz "da sua
     cozinha", não "da sua COZINHA". */
  function chaveAmbiente(texto) {
    return String(texto || '').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ');
  }

  function artigoDoAmbiente(texto) {
    return AMBIENTES[chaveAmbiente(texto)] || null;
  }

  /* ============================================================
     A PEÇA — 1080 × 1350, no KV Creative Black
     ------------------------------------------------------------
     A mesma arte da imagem w5-ultimo-dia.jpg: fundo granulado,
     metade de baixo em grafite, lettering da campanha em cima,
     foto no meio e o nome do cliente embaixo.

     Desenhada em canvas, emprestando do pecas.js por
     Pecas._ajudantes as fontes, o carregamento de imagem e o
     recorte da tinta da logo.

     ⚠️ A REGRA QUE NÃO PODE QUEBRAR: nada aqui desenha valor,
     percentual ou a palavra "desconto". O que o canvas escreve é
     só o que está em MOLDE, e MOLDE não tem número de dinheiro
     nenhum. O percentual vive na caixa de regras (B2), que é
     texto de tela. A prova 5 confere espiando o fillText.

     ⚠️ TODA FALTA DE ARQUIVO É ABSORVIDA, e isso não é zelo
     excessivo: o consultor está com o cliente na linha. Fundo,
     lettering, foto e logo têm cada um a sua reserva, e cada
     falta deixa registro no console.warn. Peça feia ainda serve;
     peça que não sai, não.
     ============================================================ */

  const PECA = {
    largura: 1080,
    altura: 1350,

    /* O KV da fábrica: fundo granulado inteiro, e a metade de
       baixo em grafite. O grafite começa ACIMA do pé da foto, de
       propósito — a foto cai por cima dele e é essa sobreposição
       que dá a profundidade da arte. Por isso a ordem de desenho
       (fundo, grafite, foto) não pode ser trocada. */
    grafite: { de: 810, cor: '#262626' },
    fundoLiso: '#0B0A09',

    lettering: { largura: 646, direita: 990, topo: 96 },

    /* Reserva para quando o lettering.png não vier. */
    letteringTexto: { corpo: 40, espacamento: 0.2 },

    foto: { x: 90, y: 278, largura: 900, altura: 646, vazia: '#1A1A1A' },

    faixa: {
      x: 90, y: 974, largura: 900, altura: 62,
      contorno: 1.2, corpo: 27, espacamento: 0.52
    },

    frase: {
      x: 90, base: 1090, entrelinha: 38,
      corpo: 22, corpoMinimo: 17, espacamento: 0.36,
      larguraMaxima: 900,
      fio: { depois: 40, espessura: 2, ate: 1080 }
    },

    data: { x: 90, base: 1254, corpo: 42, espacamento: 0.12 },

    consultor: {
      x: 90, base: 1290, corpo: 15, espacamento: 0.3, cor: '#CDC8C0'
    },

    logo: { direita: 990, altura: 56 },

    tinta: '#FFFFFF'
  };

  /* O que o canvas escreve, inteiro.

     ⚠️ Nada aqui tem número de dinheiro, percentual nem a palavra
     "desconto". A data diz 28/11 — dois números que são dia e
     mês, e que não formam a sequência "12". O percentual vive na
     caixa de regras (B2), que é texto de tela e não passa por
     aqui. A prova 5 confere isso espiando o fillText. */
  const MOLDE = {
    faixa: 'CONDIÇÃO ESPECIAL DE FÁBRICA',
    letteringReserva: 'CREATIVE BLACK',
    data: 'ATÉ 28/11',
    cargo: 'CONSULTOR(A) DE VENDAS',
    fecho: 'ENTRA NA CONDIÇÃO ESPECIAL.',
    semAmbiente: 'O SEU PROJETO',
    comAmbiente: 'O PROJETO {ARTIGO} {AMBIENTE}'
  };

  /* Os caminhos da arte da campanha. Ficam juntos porque é o que
     se procura quando a peça sai errada. */
  const ARTE = {
    fundo: 'imgs/creative-black/fundo.jpg',
    lettering: 'imgs/creative-black/lettering.png'
  };

  const LIMITE_NOME = 24;

  /* A Krub-Light é opcional. Ela é o peso da DATA ("ATÉ 28/11") e
     do lettering de reserva. Se o arquivo não estiver na raiz, o
     navegador sintetiza um 300 a partir da Medium: fica mais
     gordo que a arte da fábrica, mas sai. A peça não pode deixar
     de sair porque um arquivo de fonte não subiu.

     Tentamos carregar UMA vez e guardamos a promessa — inclusive
     a que falhou. Tentar a cada peça faria um 404 por clique. */
  let luzPronta = null;
  function carregarLuz() {
    if (luzPronta) return luzPronta;
    luzPronta = new FontFace('KrubPeca', 'url(Krub-Light.ttf)', { weight: '300' })
      .load()
      .then(function (f) { document.fonts.add(f); return true; })
      .catch(function () { return false; });
    return luzPronta;
  }

  /* ------------------------------------------------------------
     Escrita com espaçamento entre letras
     ------------------------------------------------------------
     Feita à mão em vez de ctx.letterSpacing porque o Safari só
     passou a aceitar a propriedade na 17.4, e o consultor abre
     isto no iPhone que tem. Sem o espaçamento nada quebra — o
     texto só sai apertado, errado em relação ao KV, e ninguém
     reclamaria. Falha calada, então é feita à mão.

     Trabalha em PEDAÇOS ({t, peso}) porque na frase o nome do
     cliente é negrito e o resto não, na mesma linha.
     ------------------------------------------------------------ */

  /* Onde a linha termina, para quem precisa (o fio, a
     centralização da faixa). Devolve o cursor final. */
  function escreverPedacos(ctx, pedacos, x, base, corpo, espaco, A) {
    let cursor = x;
    let primeira = true;

    pedacos.forEach(function (p) {
      ctx.font = A.fonteDe(p.peso, corpo);

      String(p.t).split('').forEach(function (letra) {
        /* Como no escreverNaMancha do pecas.js: a primeira letra
           é ancorada pela TINTA, não pela caneta, senão a linha
           começa num lugar diferente conforme a letra inicial. */
        if (primeira) {
          cursor += ctx.measureText(letra).actualBoundingBoxLeft;
          primeira = false;
        }
        ctx.fillText(letra, cursor, base);
        cursor += ctx.measureText(letra).width + espaco;
      });
    });

    /* O vão depois da última letra não é parte da linha: ele é
       espaço ENTRE letras, e contá-lo faria o fio nascer 0.36em
       mais à direita do que devia. */
    return cursor - espaco;
  }

  /* Quanto a linha vai ocupar, antes de escrever.
     ctx.measureText da string inteira NÃO serve: ela não conhece
     o espaçamento, e erraria por 0.36em vezes o número de letras
     — numa frase de 30 letras isso é mais de 200 px, e a conta
     que decide se o nome cabe daria sempre "cabe". */
  function larguraPedacos(ctx, pedacos, corpo, espaco, A) {
    let total = 0;

    pedacos.forEach(function (p) {
      ctx.font = A.fonteDe(p.peso, corpo);
      String(p.t).split('').forEach(function (letra) {
        total += ctx.measureText(letra).width + espaco;
      });
    });

    return total > 0 ? total - espaco : 0;
  }

  function escreverEspacado(ctx, texto, x, base, corpo, espaco, A, peso) {
    return escreverPedacos(ctx, [{ t: texto, peso: peso || 'medium' }],
                           x, base, corpo, espaco, A);
  }

  /* ------------------------------------------------------------
     A frase da peça, em duas linhas
     ------------------------------------------------------------
     A linha 1 muda com o ambiente; a linha 2 é fixa. O nome vai
     em negrito, COM a vírgula — a vírgula pertence ao nome
     visualmente, e deixá-la no peso do resto faz um degrau
     esquisito logo no começo da frase.

     Ambiente que o mapa não conhece cai na frase sem ambiente,
     que está sempre certa. É o mesmo artigoDoAmbiente de antes:
     chutar o gênero por terminação acertaria "cozinha" e erraria
     "closet", calado, na peça que vai para o cliente.
     ------------------------------------------------------------ */
  function frasePeca(dados) {
    const artigo = artigoDoAmbiente(dados.ambiente);
    const nome = String(dados.nome).trim().toUpperCase();

    const resto = artigo
      ? MOLDE.comAmbiente
          .replace('{ARTIGO}', artigo.toUpperCase())
          .replace('{AMBIENTE}', String(dados.ambiente).trim().toUpperCase())
      : MOLDE.semAmbiente;

    return [
      [{ t: nome + ',', peso: 'bold' }, { t: ' ' + resto, peso: 'medium' }],
      [{ t: MOLDE.fecho, peso: 'medium' }]
    ];
  }

  /* ------------------------------------------------------------
     A logo, em branco
     ------------------------------------------------------------
     As logos do repositório são PRETAS, e o KV é escuro. Em vez
     de um arquivo novo (que vira mais um asset buscado por
     string, mais uma coisa para faltar), a tinta é trocada num
     canvas auxiliar.

     'source-in' mantém o alfa do que já está desenhado e
     substitui a cor. Pintar por cima com 'source-atop' deixaria
     halo cinza nas bordas antialiasadas da logo; o 'source-in'
     respeita o alfa de cada pixel e a borda sai limpa.
     ------------------------------------------------------------ */
  function logoBranca(lg, altura) {
    const largura = Math.max(1, Math.round(altura * (lg.sl / lg.sa)));
    const alta = Math.max(1, Math.round(altura));

    const c = document.createElement('canvas');
    c.width = largura;
    c.height = alta;
    const x = c.getContext('2d');

    x.drawImage(lg.img, lg.sx, lg.sy, lg.sl, lg.sa, 0, 0, largura, alta);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#FFFFFF';
    x.fillRect(0, 0, largura, alta);

    return { tela: c, largura: largura, altura: alta };
  }

  /* ------------------------------------------------------------
     A peça
     ------------------------------------------------------------
     Toda falta de arquivo é absorvida: a peça NUNCA pode deixar
     de sair. O consultor está com o cliente na linha, e um
     arquivo de arte que não subiu é problema nosso, não dele.
     Cada falta deixa registro no console.warn e segue.
     ------------------------------------------------------------ */
  async function desenhar(dados) {
    const A = Pecas._ajudantes;
    const loja = dados.loja === 'cgt' ? 'cgt' : 'sjc';

    await A.carregarFontes();
    await carregarLuz();

    const tela = document.createElement('canvas');
    tela.width = PECA.largura;
    tela.height = PECA.altura;
    const ctx = tela.getContext('2d');
    ctx.textBaseline = 'alphabetic';

    /* ---------- 1. o fundo ----------
       O liso entra ANTES de tentar a imagem: assim, se ela não
       vier, o que sobra é o preto da campanha e não um canvas
       transparente que o PNG salvaria como quadriculado. */
    ctx.fillStyle = PECA.fundoLiso;
    ctx.fillRect(0, 0, PECA.largura, PECA.altura);

    try {
      const fundo = await A.imagemDe(ARTE.fundo);
      ctx.drawImage(fundo, 0, 0, PECA.largura, PECA.altura);
    } catch (e) {
      console.warn('[creative-black] não carreguei ' + ARTE.fundo, e);
    }

    /* ---------- 2. o grafite da metade de baixo ---------- */
    ctx.fillStyle = PECA.grafite.cor;
    ctx.fillRect(0, PECA.grafite.de, PECA.largura, PECA.altura - PECA.grafite.de);

    /* ---------- 3. o lettering ---------- */
    try {
      const lt = await A.imagemDe(ARTE.lettering);
      const largura = PECA.lettering.largura;
      const altura = largura * (lt.naturalHeight / lt.naturalWidth);
      ctx.drawImage(lt, PECA.lettering.direita - largura, PECA.lettering.topo,
                    largura, altura);
    } catch (e) {
      /* Reserva em texto. Não é igual ao lettering da fábrica,
         mas diz o nome da campanha no lugar certo — melhor que um
         vazio que ninguém entende. */
      console.warn('[creative-black] não carreguei ' + ARTE.lettering, e);

      ctx.fillStyle = PECA.tinta;
      const corpo = PECA.letteringTexto.corpo;
      const espaco = corpo * PECA.letteringTexto.espacamento;
      ctx.font = A.fonteDe('light', corpo);
      const larg = larguraPedacos(ctx, [{ t: MOLDE.letteringReserva, peso: 'light' }],
                                  corpo, espaco, A);
      escreverEspacado(ctx, MOLDE.letteringReserva,
                       PECA.lettering.direita - larg,
                       PECA.lettering.topo + corpo,
                       corpo, espaco, A, 'light');
    }

    /* ---------- 4. a foto ----------
       Por cima do grafite de propósito: é a sobreposição que dá a
       profundidade do KV. */
    const F = PECA.foto;
    const caminhoFoto = 'imgs/creative-black/' + loja + '/foto-' + loja + '.jpg';

    try {
      const foto = await A.imagemDe(caminhoFoto);

      /* "cover": cobre a área toda, centralizada, sem distorcer —
         a mesma conta do recorte de foto do aniversário. */
      const escala = Math.max(foto.naturalWidth / F.largura,
                              foto.naturalHeight / F.altura);
      const larguraFonte = F.largura * escala;
      const alturaFonte = F.altura * escala;

      ctx.drawImage(
        foto,
        (foto.naturalWidth - larguraFonte) / 2,
        (foto.naturalHeight - alturaFonte) / 2,
        larguraFonte, alturaFonte,
        F.x, F.y, F.largura, F.altura
      );
    } catch (e) {
      /* A foto é da arte, não do cliente: se faltar, o consultor
         não tem o que fazer a respeito, e a peça com o nome ainda
         é útil. Fica o registro e um retângulo no lugar. */
      console.warn('[creative-black] não carreguei ' + caminhoFoto, e);
      ctx.fillStyle = F.vazia;
      ctx.fillRect(F.x, F.y, F.largura, F.altura);
    }

    /* ---------- 5. a faixa ---------- */
    const FX = PECA.faixa;

    ctx.strokeStyle = PECA.tinta;
    ctx.lineWidth = FX.contorno;
    /* O meio-pixel alinha o contorno de 1.2 px à grade: sem ele o
       traço cai entre dois pixels e sai cinza-claro dos dois
       lados, parecendo mais fino do que a arte pede. */
    ctx.strokeRect(FX.x + 0.5, FX.y + 0.5, FX.largura - 1, FX.altura - 1);

    const espacoFaixa = FX.corpo * FX.espacamento;
    const pedacosFaixa = [{ t: MOLDE.faixa, peso: 'bold' }];

    ctx.font = A.fonteDe('bold', FX.corpo);
    const largFaixa = larguraPedacos(ctx, pedacosFaixa, FX.corpo, espacoFaixa, A);
    const mFaixa = ctx.measureText(MOLDE.faixa);

    ctx.fillStyle = PECA.tinta;
    escreverPedacos(ctx, pedacosFaixa,
                    FX.x + (FX.largura - largFaixa) / 2,
                    /* Centralizado na altura pela TINTA do texto,
                       não pela linha de base: em caixa alta não há
                       descida, e centralizar pela base deixaria o
                       texto visivelmente baixo dentro da faixa. */
                    FX.y + (FX.altura + mFaixa.actualBoundingBoxAscent) / 2,
                    FX.corpo, espacoFaixa, A);

    /* ---------- 6. a frase ---------- */
    const FR = PECA.frase;
    const linhas = frasePeca(dados);

    /* O nome tem até 24 caracteres e o ambiente é livre, então a
       linha 1 pode passar de 900 px. As DUAS linhas descem juntas
       de corpo: tamanhos diferentes na mesma frase leem como
       erro de diagramação, não como ajuste. */
    let corpoFrase = FR.corpo;
    while (corpoFrase > FR.corpoMinimo
           && larguraPedacos(ctx, linhas[0], corpoFrase,
                             corpoFrase * FR.espacamento, A) > FR.larguraMaxima) {
      corpoFrase -= 1;
    }

    const espacoFrase = corpoFrase * FR.espacamento;
    ctx.fillStyle = PECA.tinta;

    const fins = linhas.map(function (linha, i) {
      return escreverPedacos(ctx, linha, FR.x, FR.base + i * FR.entrelinha,
                             corpoFrase, espacoFrase, A);
    });

    /* O fio, saindo da linha 2 até a borda. */
    const baseLinha2 = FR.base + FR.entrelinha;
    ctx.font = A.fonteDe('medium', corpoFrase);
    const altoLinha2 = ctx.measureText(MOLDE.fecho).actualBoundingBoxAscent;

    ctx.fillStyle = PECA.tinta;
    ctx.fillRect(fins[1] + FR.fio.depois,
                 Math.round(baseLinha2 - altoLinha2 / 2 - FR.fio.espessura / 2),
                 FR.fio.ate - (fins[1] + FR.fio.depois),
                 FR.fio.espessura);

    /* ---------- 7. a data ---------- */
    const D = PECA.data;
    ctx.fillStyle = PECA.tinta;
    ctx.font = A.fonteDe('light', D.corpo);
    const altoData = ctx.measureText(MOLDE.data).actualBoundingBoxAscent;
    escreverEspacado(ctx, MOLDE.data, D.x, D.base,
                     D.corpo, D.corpo * D.espacamento, A, 'light');

    /* ---------- 8. o consultor ---------- */
    const C = PECA.consultor;
    const rodape = String(dados.consultor).trim().toUpperCase()
                 + ' · ' + MOLDE.cargo;

    ctx.fillStyle = C.cor;
    escreverEspacado(ctx, rodape, C.x, C.base,
                     C.corpo, C.corpo * C.espacamento, A);

    /* ---------- 9. a logo, em branco, na altura da data ---------- */
    try {
      /* O recorte da tinta do pecas.js vem primeiro: sem ele a de
         Caraguá — que tem 85 px vazios embaixo — sairia mais alta
         que a de SJC, e cada uma pareceria certa sozinha. */
      const lg = await A.logoRecortada(A.LOGOS[loja]);
      const br = logoBranca(lg, PECA.logo.altura);

      ctx.drawImage(br.tela,
                    PECA.logo.direita - br.largura,
                    Math.round(D.base - altoData / 2 - br.altura / 2),
                    br.largura, br.altura);
    } catch (e) {
      console.warn('[creative-black] não carreguei a logo de ' + loja, e);
    }

    return {
      ok: true,
      b64: tela.toDataURL('image/png').split(',')[1],
      tipo: 'image/png',
      nome: 'condicao-fabrica-' + (A.semAcento(dados.nome) || 'cliente') + '.png'
    };
  }

  /* ============================================================
     SALVAR E COMPARTILHAR
     ============================================================ */

  /* O iPhone não faz download forçado: o <a download> abre o
     arquivo e quem salva é a pessoa, pelo botão de compartilhar.
     O index.html já aprendeu isso.

     ⚠️ A conta está repetida aqui, e não emprestada de lá, por um
     motivo de escopo: no index.html EH_IOS é declarada com const,
     e const no escopo global NÃO vira propriedade do window —
     window.EH_IOS é undefined. Ler pelo nome solto também não
     resolve, porque este arquivo roda ANTES do script de lá, e
     naquele instante a constante ainda não existe. Então a escolha
     é entre repetir quatro linhas e mover a constante para um
     terceiro lugar; repetir é mais barato numa aba que sai em
     duas semanas. Se as duas divergirem, a de lá é a boa. */
  const EH_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function bytesDeBase64(b64) {
    const binario = atob(String(b64 || '').replace(/\s+/g, ''));
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes;
  }

  function entregar(blob, nome) {
    const url = URL.createObjectURL(blob);

    if (EH_IOS) {
      window.open(url, '_blank');
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      return;
    }

    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); link.remove(); }, 1000);
  }

  /* Compartilhar só existe onde o navegador aceita MANDAR ARQUIVO.
     navigator.share sozinho não serve: no desktop ele às vezes
     existe e recusa o arquivo, e aí o botão não faz nada. Botão
     morto é pior que botão ausente — a pessoa fica tentando. */
  function podeCompartilharArquivo() {
    try {
      if (!navigator.canShare || !navigator.share) return false;
      const teste = new File([new Uint8Array(1)], 't.png', { type: 'image/png' });
      return navigator.canShare({ files: [teste] });
    } catch (e) {
      return false;
    }
  }

  const DA_COMPARTILHAR = podeCompartilharArquivo();

  async function compartilhar(blob, nome) {
    const arquivo = new File([blob], nome, { type: blob.type || 'image/png' });
    try {
      await navigator.share({ files: [arquivo] });
    } catch (e) {
      /* Cancelar o menu do sistema cai aqui e não é erro. */
      if (e && e.name !== 'AbortError') {
        console.warn('[creative-black] compartilhar falhou', e);
      }
    }
  }

  /* ============================================================
     A TELA
     ============================================================ */

  const CSS = [
    '.cb-caixa{background:var(--card);border:1px solid var(--line);',
    'border-radius:var(--radius);padding:16px 18px;margin-bottom:18px}',
    '.cb-regras{border-color:var(--line-2);background:#fbfaf8}',
    '.cb-regras h3{margin:0 0 10px;font-size:12px;font-weight:700;',
    'letter-spacing:.1em;text-transform:uppercase;color:var(--ink)}',
    '.cb-regras ol{margin:0;padding-left:20px;font-size:13px;line-height:1.55;color:var(--ink-2)}',
    '.cb-regras li{margin-bottom:5px}',
    '.cb-regras b{color:var(--ink)}',
    '.cb-rotulo{font-size:10px;font-weight:700;letter-spacing:.16em;',
    'text-transform:uppercase;color:var(--muted);margin:0 0 6px}',
    '.cb-titulo{margin:0 0 6px;font-size:19px;font-weight:700;letter-spacing:-.01em}',
    '.cb-apoio{margin:0 0 20px;font-size:13px;color:var(--ink-2);line-height:1.5}',
    '.cb-secao{margin-top:30px}',
    '.cb-secao>h3{margin:0 0 4px;font-size:11px;font-weight:700;',
    'letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}',
    '.cb-secao>p.cb-sub{margin:0 0 12px;font-size:12px;color:var(--ink-2)}',
    '.cb-cal{width:100%;border-collapse:collapse;font-size:12px}',
    '.cb-cal th{text-align:left;font-size:10px;letter-spacing:.1em;',
    'text-transform:uppercase;color:var(--muted);font-weight:700;padding:0 8px 6px 0}',
    '.cb-cal td{padding:7px 8px 7px 0;border-top:1px solid var(--line);',
    'vertical-align:top;color:var(--ink-2)}',
    '.cb-cal td:first-child{white-space:nowrap;color:var(--ink);font-weight:600}',
    '.cb-cal tr.cb-forte td{color:var(--ink);font-weight:600}',
    '.cb-msg{border-top:1px solid var(--line);padding:13px 0}',
    '.cb-msg:first-child{border-top:0;padding-top:0}',
    '.cb-msg-topo{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}',
    '.cb-msg-nome{font-size:13px;font-weight:600;flex:1}',
    '.cb-msg-quando{font-size:11px;color:var(--muted);white-space:nowrap}',
    '.cb-msg-texto{margin:0 0 9px;font-size:13px;line-height:1.55;color:var(--ink-2)}',
    '.cb-copiar{border:1px solid var(--line-2);background:var(--card);',
    'border-radius:7px;padding:6px 11px;font-family:inherit;font-size:11px;',
    'font-weight:700;letter-spacing:.04em;text-transform:uppercase;',
    'color:var(--ink);cursor:pointer}',
    '.cb-copiar:hover{background:var(--bg)}',
    '.cb-copiar.cb-feito{border-color:var(--ok);color:var(--ok)}',
    '.cb-imgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}',
    '.cb-img{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--card)}',
    '.cb-img img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;background:var(--bg)}',
    '.cb-img-pe{padding:9px 10px 10px}',
    '.cb-img-nome{font-size:12px;font-weight:600}',
    '.cb-img-para{font-size:11px;color:var(--muted);margin-bottom:8px}',
    '.cb-img-bts{display:flex;gap:6px}',
    '.cb-img-bts button{flex:1}',
    '.cb-campo{margin-bottom:12px}',
    '.cb-campo label{display:block;font-size:12px;font-weight:600;margin-bottom:4px}',
    '.cb-campo input{width:100%;padding:10px 12px;border:1px solid var(--line);',
    'border-radius:9px;font-size:15px;font-family:inherit;color:var(--ink);background:var(--card)}',
    '.cb-campo input:focus{outline:none;border-color:var(--accent);',
    'box-shadow:0 0 0 3px rgba(20,22,24,.07)}',
    '.cb-campo input[aria-invalid="true"]{border-color:var(--erro)}',
    '.cb-campo .cb-erro{display:none;margin:5px 0 0;font-size:12px;color:var(--erro)}',
    '.cb-campo input[aria-invalid="true"]~.cb-erro{display:block}',
    '.cb-campo .cb-dica{margin:4px 0 0;font-size:11px;color:var(--muted)}',
    '.cb-previa{display:block;width:100%;max-width:340px;margin:14px auto 0;',
    'border:1px solid var(--line);border-radius:10px}',
    '.cb-bts{display:flex;gap:8px;margin-top:12px}',
    '.cb-bts .botao{margin-top:0}',
    '.cb-nota{margin:12px 0 0;font-size:12px;color:var(--muted);line-height:1.5}',
    '.cb-pe{margin:30px 0 0;font-size:12px;color:var(--muted);text-align:center}'
  ].join('');

  function elemento(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }

  /* O botão de copiar, com o "Copiado" de 2 segundos. O texto
     copiado é o do TEXTOS, letra por letra, colchetes incluídos. */
  function botaoCopiar(texto) {
    const b = elemento('button', 'cb-copiar', 'Copiar');
    b.type = 'button';
    let volta = null;

    b.addEventListener('click', async function () {
      try {
        await navigator.clipboard.writeText(texto);
        b.textContent = 'Copiado';
        b.classList.add('cb-feito');
      } catch (e) {
        /* Sem permissão de área de transferência o consultor ainda
           consegue selecionar o texto na tela. Dizer isso é melhor
           que um botão que parece ter funcionado. */
        b.textContent = 'Selecione e copie';
      }
      clearTimeout(volta);
      volta = setTimeout(function () {
        b.textContent = 'Copiar';
        b.classList.remove('cb-feito');
      }, 2000);
    });

    return b;
  }

  function blocoDeTextos(fonte) {
    const secao = elemento('div', 'cb-secao');
    secao.appendChild(elemento('h3', null, fonte.titulo));
    if (fonte.apoio) secao.appendChild(elemento('p', 'cb-sub', fonte.apoio));

    const caixa = elemento('div', 'cb-caixa');

    fonte.itens.forEach(function (item) {
      const bloco = elemento('div', 'cb-msg');

      const topo = elemento('div', 'cb-msg-topo');
      topo.appendChild(elemento('span', 'cb-msg-nome', item.nome));
      if (item.quando) {
        topo.appendChild(elemento('span', 'cb-msg-quando', item.quando));
      }
      bloco.appendChild(topo);

      bloco.appendChild(elemento('p', 'cb-msg-texto', item.texto));
      bloco.appendChild(botaoCopiar(item.texto));
      caixa.appendChild(bloco);
    });

    secao.appendChild(caixa);
    return secao;
  }

  function caixaDeRegras() {
    const caixa = elemento('div', 'cb-caixa cb-regras');
    caixa.appendChild(elemento('h3', null, TEXTOS.regras.titulo));

    const ol = document.createElement('ol');
    TEXTOS.regras.itens.forEach(function (item) {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = item.forte;
      li.appendChild(b);
      if (item.resto) li.appendChild(document.createTextNode(item.resto));
      ol.appendChild(li);
    });

    caixa.appendChild(ol);
    return caixa;
  }

  function tabelaDoCalendario() {
    const secao = elemento('div', 'cb-secao');
    secao.appendChild(elemento('h3', null, TEXTOS.calendario.titulo));

    const caixa = elemento('div', 'cb-caixa');
    const tabela = elemento('table', 'cb-cal');

    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    ['Quando', 'Mensagem', 'Imagem'].forEach(function (t) {
      tr.appendChild(elemento('th', null, t));
    });
    thead.appendChild(tr);
    tabela.appendChild(thead);

    const tbody = document.createElement('tbody');
    TEXTOS.calendario.linhas.forEach(function (linha) {
      const l = document.createElement('tr');
      if (linha.destaque) l.className = 'cb-forte';
      l.appendChild(elemento('td', null, linha.quando));
      l.appendChild(elemento('td', null, linha.mensagem));
      l.appendChild(elemento('td', null, linha.imagem));
      tbody.appendChild(l);
    });
    tabela.appendChild(tbody);

    caixa.appendChild(tabela);
    secao.appendChild(caixa);
    return secao;
  }

  /* ------------------------------------------------------------
     As imagens da loja
     ------------------------------------------------------------
     Redesenhadas quando a loja muda, porque é o caminho do
     arquivo que carrega a logo certa.
     ------------------------------------------------------------ */
  function grelhaDeImagens(loja) {
    const grelha = elemento('div', 'cb-imgs');

    TEXTOS.imagens.itens.forEach(function (item) {
      const caminho = 'imgs/creative-black/' + loja + '/' + item.arquivo;

      const cartao = elemento('div', 'cb-img');

      const img = document.createElement('img');
      img.src = caminho;
      img.alt = item.nome;
      img.loading = 'lazy';
      cartao.appendChild(img);

      const pe = elemento('div', 'cb-img-pe');
      pe.appendChild(elemento('div', 'cb-img-nome', item.nome));
      pe.appendChild(elemento('div', 'cb-img-para', item.para));

      const bts = elemento('div', 'cb-img-bts');

      const baixar = elemento('button', 'cb-copiar', 'Baixar');
      baixar.type = 'button';
      baixar.addEventListener('click', function () {
        pegarImagem(caminho).then(function (blob) {
          entregar(blob, item.arquivo);
        }).catch(function () {
          baixar.textContent = 'Falhou';
          setTimeout(function () { baixar.textContent = 'Baixar'; }, 2000);
        });
      });
      bts.appendChild(baixar);

      /* Só onde o navegador aceita mandar arquivo. Onde não, o
         botão não é criado — nada de botão morto. */
      if (DA_COMPARTILHAR) {
        const mandar = elemento('button', 'cb-copiar', 'Enviar');
        mandar.type = 'button';
        mandar.addEventListener('click', function () {
          pegarImagem(caminho).then(function (blob) {
            compartilhar(blob, item.arquivo);
          }).catch(function () {});
        });
        bts.appendChild(mandar);
      }

      pe.appendChild(bts);
      cartao.appendChild(pe);
      grelha.appendChild(cartao);
    });

    return grelha;
  }

  function pegarImagem(caminho) {
    return fetch(caminho).then(function (r) {
      if (!r.ok) throw new Error('imagem ' + r.status);
      return r.blob();
    });
  }

  /* ------------------------------------------------------------
     O gerador
     ------------------------------------------------------------ */
  function campo(id, rotulo, exemplo, dica) {
    const bloco = elemento('div', 'cb-campo');

    const lab = elemento('label', null, rotulo);
    lab.setAttribute('for', id);
    bloco.appendChild(lab);

    const input = document.createElement('input');
    input.id = id;
    input.type = 'text';
    input.placeholder = exemplo;
    input.autocomplete = 'off';
    bloco.appendChild(input);

    const erro = elemento('p', 'cb-erro');
    erro.id = id + '-erro';
    bloco.appendChild(erro);

    if (dica) bloco.appendChild(elemento('p', 'cb-dica', dica));

    return { bloco: bloco, input: input, erro: erro };
  }

  function secaoDoGerador(estado) {
    const secao = elemento('div', 'cb-secao');
    secao.appendChild(elemento('h3', null, TEXTOS.gerador.titulo));
    secao.appendChild(elemento('p', 'cb-sub', TEXTOS.gerador.apoio));

    const caixa = elemento('div', 'cb-caixa');

    const nome = campo('cb-nome', 'Nome do cliente', 'Ex.: Ana',
                       'Até ' + LIMITE_NOME + ' caracteres.');
    nome.input.maxLength = LIMITE_NOME;

    const ambiente = campo('cb-ambiente', 'Ambiente (opcional)', 'Ex.: cozinha',
                           'Ambiente que a peça não souber concordar sai de fora ' +
                           'da frase, não errado.');

    /* "Seu nome" vem preenchido com o nome do perfil, e editável:
       quem manda a peça às vezes é a gerência cobrindo a folga de
       um consultor, e aí o rodapé tem de dizer o nome de quem vai
       atender, não o de quem gerou. */
    const consultor = campo('cb-consultor', 'Seu nome', 'Ex.: Juliana Mendes');
    /* Mesma pegadinha do EH_IOS: EU é const no index.html, então
       window.EU é undefined e só o nome solto resolve. */
    consultor.input.value = (typeof EU !== 'undefined' && EU.nome) ? EU.nome : '';

    caixa.append(nome.bloco, ambiente.bloco, consultor.bloco);

    const bts = elemento('div', 'cb-bts');

    const gerar = elemento('button', 'botao', 'Gerar');
    gerar.type = 'button';
    bts.appendChild(gerar);
    caixa.appendChild(bts);

    const saida = elemento('div');
    caixa.appendChild(saida);

    caixa.appendChild(elemento('p', 'cb-nota', TEXTOS.gerador.aviso));
    secao.appendChild(caixa);

    function avisarCampo(c, texto) {
      c.input.setAttribute('aria-invalid', 'true');
      c.input.setAttribute('aria-describedby', c.erro.id);
      c.erro.textContent = texto;
      c.input.focus();
    }

    function limparAviso(c) {
      c.input.removeAttribute('aria-invalid');
      c.input.removeAttribute('aria-describedby');
      c.erro.textContent = '';
    }

    nome.input.addEventListener('input', function () { limparAviso(nome); });
    consultor.input.addEventListener('input', function () { limparAviso(consultor); });

    gerar.addEventListener('click', async function () {
      limparAviso(nome);
      limparAviso(consultor);
      saida.innerHTML = '';

      const valorNome = nome.input.value.trim();
      if (!valorNome) {
        avisarCampo(nome, 'Escreva o nome do cliente.');
        return;
      }
      if (valorNome.length > LIMITE_NOME) {
        avisarCampo(nome, 'No máximo ' + LIMITE_NOME + ' caracteres.');
        return;
      }

      const valorConsultor = consultor.input.value.trim();
      if (!valorConsultor) {
        avisarCampo(consultor, 'Escreva o seu nome, que vai no pé da peça.');
        return;
      }

      gerar.disabled = true;
      gerar.textContent = 'Gerando...';

      try {
        const peca = await desenhar({
          loja: estado.loja(),
          nome: valorNome,
          ambiente: ambiente.input.value,
          consultor: valorConsultor
        });

        const previa = document.createElement('img');
        previa.className = 'cb-previa';
        previa.alt = 'Prévia da peça';
        previa.src = 'data:image/png;base64,' + peca.b64;
        saida.appendChild(previa);

        const blob = new Blob([bytesDeBase64(peca.b64)], { type: 'image/png' });

        const linha = elemento('div', 'cb-bts');

        const baixar = elemento('button', 'botao verde', 'Baixar PNG');
        baixar.type = 'button';
        baixar.addEventListener('click', function () {
          entregar(blob, peca.nome);
        });
        linha.appendChild(baixar);

        if (DA_COMPARTILHAR) {
          const mandar = elemento('button', 'botao vazado', 'Enviar');
          mandar.type = 'button';
          mandar.addEventListener('click', function () {
            compartilhar(blob, peca.nome);
          });
          linha.appendChild(mandar);
        }

        saida.appendChild(linha);

      } catch (e) {
        console.warn('[creative-black] não gerei a peça', e);
        saida.appendChild(elemento('p', 'cb-erro',
          'Não consegui montar a peça. Recarregue a página e tente de novo.'));
        saida.querySelector('.cb-erro').style.display = 'block';
      } finally {
        gerar.disabled = false;
        gerar.textContent = 'Gerar';
      }
    });

    return secao;
  }

  /* ============================================================
     MONTAGEM
     ------------------------------------------------------------
     Chamada pelo index.html DEPOIS de o perfil chegar do banco,
     por dois motivos:

       1. A matriz de vitrine só é conhecida aí. Montar antes
          mostraria a aba para um cargo que a tem escondida, e
          "falha fecha, nunca abre" é a regra da casa.
       2. O campo "Seu nome" sai do perfil.

     É idempotente: chamar de novo não duplica nada, só reavalia
     quem pode ver.
     ============================================================ */

  let montado = false;
  let botaoAba = null;
  let painel = null;
  let areaImagens = null;

  /* A loja é a do seletor global do Central, o mesmo que serve as
     outras abas. Não há seletor próprio aqui de propósito: dois
     seletores de loja na mesma tela deixam a pessoa sem saber
     qual manda, e o de cima já abre na loja do perfil de quem
     entrou. Uma regra de loja só, para o Central todo. */
  function lojaAtual() {
    const sel = document.getElementById('loja');
    return (sel && sel.value === 'cgt') ? 'cgt' : 'sjc';
  }

  function construir() {

    /* A aba se inscreve na matriz do administrador. A lista de
       abas de lá é fixa no index.html, e sem esta linha a aba
       nasceria visível para todos os cargos — o que é certo — mas
       SEM caixinha para desmarcar, e o administrador não teria
       como esconder dos cargos que não vendem. Aba que não se
       pode esconder não é vitrine, é imposição.

       Entra aqui, e não no index.html, para a retirada continuar
       sendo um arquivo e duas linhas. Vale empurrar num const: o
       que é imutável é o nome, não o conteúdo do array. */
    if (typeof ABAS_PARA_A_MATRIZ !== 'undefined'
        && !ABAS_PARA_A_MATRIZ.some(function (a) { return a.id === CHAVE_ABA; })) {
      ABAS_PARA_A_MATRIZ.push({ id: CHAVE_ABA, nome: 'Creative Black' });
    }

    const estilo = document.createElement('style');
    estilo.id = 'cb-estilo';
    estilo.textContent = CSS;
    document.head.appendChild(estilo);

    /* ---------- a aba ---------- */
    const abas = document.getElementById('abas');
    botaoAba = document.createElement('button');
    botaoAba.type = 'button';
    botaoAba.setAttribute('role', 'tab');
    botaoAba.setAttribute('aria-selected', 'false');
    botaoAba.dataset.aba = 'creative-black';
    botaoAba.textContent = 'Creative Black';
    abas.appendChild(botaoAba);

    /* ---------- o painel ---------- */
    painel = elemento('div', 'painel-aba oculto');
    painel.dataset.painel = 'creative-black';

    painel.appendChild(elemento('p', 'cb-rotulo', TEXTOS.topo.rotulo));
    painel.appendChild(elemento('h2', 'cb-titulo', TEXTOS.topo.titulo));
    painel.appendChild(elemento('p', 'cb-apoio', TEXTOS.topo.apoio));

    /* A caixa de regras vem antes de tudo e não recolhe. Recolhida
       ela seria fechada no primeiro dia e nunca mais aberta, e é
       justamente ela que diz o que não pode ser escrito ao
       cliente. */
    painel.appendChild(caixaDeRegras());

    painel.appendChild(tabelaDoCalendario());
    painel.appendChild(blocoDeTextos(TEXTOS.mensagens));
    painel.appendChild(blocoDeTextos(TEXTOS.legendas));
    painel.appendChild(blocoDeTextos(TEXTOS.respostas));

    /* ---------- as imagens ---------- */
    const secaoImgs = elemento('div', 'cb-secao');
    secaoImgs.appendChild(elemento('h3', null, TEXTOS.imagens.titulo));
    secaoImgs.appendChild(elemento('p', 'cb-sub', TEXTOS.imagens.apoio));
    areaImagens = elemento('div');
    secaoImgs.appendChild(areaImagens);
    painel.appendChild(secaoImgs);

    painel.appendChild(secaoDoGerador({ loja: lojaAtual }));

    painel.appendChild(elemento('p', 'cb-pe', TEXTOS.rodape));

    /* Depois do último painel, para a ordem na tela seguir a
       ordem das abas. */
    const paineis = document.querySelectorAll('.painel-aba');
    const ultimo = paineis[paineis.length - 1];
    ultimo.parentNode.insertBefore(painel, ultimo.nextSibling);

    desenharImagens();

    /* A loja muda pelo seletor de cima; as imagens trocam de
       pasta junto. O gerador lê a loja na hora de gerar, então
       não precisa de nada aqui. */
    const sel = document.getElementById('loja');
    if (sel) sel.addEventListener('change', desenharImagens);

    montado = true;
  }

  function desenharImagens() {
    if (!areaImagens) return;
    areaImagens.innerHTML = '';
    areaImagens.appendChild(grelhaDeImagens(lojaAtual()));
  }

  /* Quem pode ver: a matriz de vitrine, pela função do Central —
     que já resolve o administrador antes de qualquer matriz. E o
     prazo, que é absoluto: passou de 30/11, ninguém vê, nem
     admin. Não é permissão; é data de validade. */
  function podeVer(agora) {
    if (!dentroDoPrazo(agora)) return false;
    if (typeof itemOculto === 'function') return !itemOculto(CHAVE_ABA);
    return true;
  }

  function montar(agora) {
    const mostrar = podeVer(agora);

    /* Fora do prazo nem constrói: a aba não existe no DOM, então
       nem o inspetor mostra um painel escondido com os textos de
       uma condição vencida. */
    if (!mostrar) {
      if (montado) {
        botaoAba.classList.add('oculto');
        painel.classList.add('oculto');
      }
      return false;
    }

    if (!montado) construir();

    botaoAba.classList.remove('oculto');

    /* Se a aba lembrada no navegador era esta, reabre nela. O
       index.html já fez a sua escolha antes de a gente existir,
       então só entramos quando ela era nossa. */
    try {
      if (localStorage.getItem('dalmobile:aba') === 'creative-black'
          && !location.hash) {
        trocarAba('creative-black');
      }
    } catch (e) {}

    return true;
  }

  return {
    montar: montar,
    dentroDoPrazo: dentroDoPrazo,
    FIM: FIM_CREATIVE_BLACK,
    CHAVE_ABA: CHAVE_ABA,

    /* expostos para as provas de tela */
    _textos: TEXTOS,
    _desenhar: desenhar,
    _artigoDoAmbiente: artigoDoAmbiente
  };
})();

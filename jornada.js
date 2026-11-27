/* ============================================================
   JORNADA DALMÓBILE — o fluxo da loja, passo a passo
   ------------------------------------------------------------
   O que a equipe faz, o que ela diz e qual material usa em cada
   momento, do primeiro contato à entrega da caixinha.

   ------------------------------------------------------------
   DE ONDE VEIO CADA COISA

   Três fontes, e elas discordavam entre si. Este arquivo é a
   conciliação, e cada passo diz de onde veio o que está nele:

     Miro · Fluxograma Dalmobile   o fluxo e os cargos
     Miro · Fluxograma Marketing   os pontos de marketing
     Roteiro do vídeo da jornada v2 (25/11/2026)   as etapas e
                                   as falas com o cliente

   ⚠️ O ROTEIRO v2 MANDA onde houver conflito. Ele é o mais novo
   e foi ele que consertou a confusão de nome que estava nos
   outros dois: "Medição aprovada" NÃO é a medição aprovada — é o
   Supervisor aprovando o AMBIENTE para o Executivo poder medir.
   São duas visitas, de duas pessoas, com dois objetivos. Nos
   quadros antigos as duas se chamavam parecido, e quem lesse
   entenderia que a medição já tinha passado.

   ------------------------------------------------------------
   ONDE ISTO VAI MORAR

   Hoje: neste arquivo. Amanhã: numa tabela, editada pelo painel.
   Por isso a forma é de BANCO, não de JavaScript: lista plana,
   um registro por passo, id estável, ordem com espaço entre os
   números. Migrar é copiar os campos, sem reescrever a tela.

   ⚠️ A `ordem` anda de 10 em 10 de propósito. Inserir um passo
   entre dois existentes é escolher 115; sem o espaço, seria
   renumerar tudo embaixo — e no banco isso é uma migração por
   causa de um passo novo.

   ------------------------------------------------------------
   AS FALAS, E O QUE É RASCUNHO MEU

   `falaFonte` diz de onde a fala saiu, e a tela MOSTRA isso:

     'roteiro'    está no roteiro v2, aprovado
     'manual'     está no manual de ações de marketing
     'rascunho'   ESCRITO POR MIM. Ninguém aprovou.

   Separar os três não é zelo: a aba vai ser usada na frente do
   cliente. Rascunho meu passando por fala aprovada é a pessoa
   lendo em voz alta uma frase que a loja nunca disse.
   ============================================================ */

const JORNADA = (function () {
  'use strict';

  /* ----------------------------------------------------------
     Os cargos, com as cores do Miro
     ----------------------------------------------------------
     As cores são as da legenda do quadro, de propósito: quem já
     conhece o fluxograma reconhece a faixa na hora, sem ter de
     aprender um segundo código de cores. */
  const CARGOS = {
    inicio:     { nome: 'Início e fim',          fundo: '#c9e98b', borda: '#7ba738', texto: '#344b18' },
    consultor:  { nome: 'Consultor(a)',          fundo: '#e8f0ff', borda: '#3566b8', texto: '#16345c' },
    gerente:    { nome: 'Gerente',               fundo: '#eee5fa', borda: '#8052aa', texto: '#4d2d6c' },
    executivo:  { nome: 'Projetista Executivo',  fundo: '#ddf3f1', borda: '#23847d', texto: '#174e49' },
    montagem:   { nome: 'Supervisor de Montagem',fundo: '#fff0da', borda: '#c27a25', texto: '#744415' },
    financeiro: { nome: 'Financeiro',            fundo: '#e3f2e5', borda: '#438850', texto: '#285331' },
    marketing:  { nome: 'Marketing',             fundo: '#fce4ed', borda: '#b54b75', texto: '#792d4c' }
  };


  /* ----------------------------------------------------------
     As nove fases
     ----------------------------------------------------------
     A numeração é a que o roteiro do vídeo usa ("Fase 03", "Fase
     04 · Validação"). Mantive a dele em vez de inventar outra:
     duas numerações para o mesmo fluxo é como o nome da medição
     se perdeu. */
  const FASES = [
    { id: 'f01', numero: '01', nome: 'Atendimento e venda',
      resumo: 'Do primeiro contato ao contrato assinado. O vídeo da jornada não cobre esta fase — ele começa depois do fechamento.' },

    { id: 'f02', numero: '02', nome: 'Contrato e grupo',
      resumo: 'Documentação, financeiro e a criação do grupo do cliente. É aqui que o vídeo completo é enviado.' },

    { id: 'f03', numero: '03', nome: 'Avaliação do ambiente',
      resumo: 'O Supervisor vai à obra ver se o ambiente está pronto para receber os móveis. NÃO é a medição.' },

    { id: 'f04', numero: '04', nome: 'Medição técnica, projeto e aprovação',
      resumo: 'O Executivo mede, detalha o projeto, a equipe revisa e o cliente aprova. Nada vai à fábrica sem o ok dele.' },

    { id: 'f05', numero: '05', nome: 'Produção',
      resumo: 'O pedido na fábrica, em Bento Gonçalves, e o cliente acompanhando pelo link.' },

    { id: 'f06', numero: '06', nome: 'Entrega e montagem',
      resumo: 'Mercadoria na obra, montagem combinada com o cliente e a casa protegida.' },

    { id: 'f07', numero: '07', nome: 'Vistoria',
      resumo: 'O Supervisor confere peça por peça e o relatório vai ao Gerente e ao Financeiro.' },

    { id: 'f08', numero: '08', nome: 'Assistência',
      resumo: 'O desvio: só acontece quando a vistoria aponta algo a ajustar. Obra em assistência não vai para as redes.' },

    { id: 'f09', numero: '09', nome: 'Entrega da caixinha',
      resumo: 'O manual com as fotos do ambiente do cliente, a entrega em pessoa e o pedido de avaliação.' }
  ];


  /* ----------------------------------------------------------
     Os níveis de captação
     ----------------------------------------------------------
     Decididos pelo Gerente no contrato, e mudam o que o
     Marketing faz na obra. Vindos do Fluxograma Marketing. */
  const NIVEIS = [
    { n: 1, oque: 'Supervisor, Executivo ou Consultor grava vídeos ou tira fotos e entrega ao Marketing organizadas.' },
    { n: 2, oque: 'O Marketing acompanha a obra para gravar.' },
    { n: 3, oque: 'Arquitetos e Consultor acompanham, com filmagem especializada.' }
  ];


  /* ----------------------------------------------------------
     Os trechos do vídeo da jornada
     ----------------------------------------------------------
     ⚠️ ESTES NOMES SÃO OS DO ROTEIRO v2, e são os que valem. Os
     dois quadros do Miro ainda têm os antigos ("Medição
     aprovada", "Projeto aprovado"), e o próprio roteiro registra
     que F04 e F23 precisam ser atualizados. Enquanto isso não
     acontece, este arquivo é o lugar com o nome certo.

     ⚠️ NENHUM DELES EXISTE AINDA. O vídeo é a ficha 1 e está por
     fazer. A tela mostra o trecho como PENDENTE em vez de um
     botão que não baixa nada. */
  const TRECHOS = {
    t0: { n: '0', nome: 'Versão completa',       arquivo: 'jornada_00_completo.mp4',  dura: '~3 min 30 s', quem: 'gerente' },
    t1: { n: '1', nome: 'Avaliação do ambiente', arquivo: 'jornada_01_avaliacao.mp4', dura: '22 s', quem: 'montagem' },
    t2: { n: '2', nome: 'Medição técnica',       arquivo: 'jornada_02_medicao.mp4',   dura: '22 s', quem: 'executivo' },
    t3: { n: '3', nome: 'Projeto executivo',     arquivo: 'jornada_03_projeto.mp4',   dura: '22 s', quem: 'executivo' },
    t4: { n: '4', nome: 'Aprovação do projeto',  arquivo: 'jornada_04_aprovacao.mp4', dura: '22 s', quem: 'consultor' },
    t5: { n: '5', nome: 'Produção',              arquivo: 'jornada_05_producao.mp4',  dura: '25 s', quem: 'executivo' },
    t6: { n: '6', nome: 'Entrega e montagem',    arquivo: 'jornada_06_entrega.mp4',   dura: '25 s', quem: 'montagem' },
    t7: { n: '7', nome: 'Vistoria',              arquivo: 'jornada_07_vistoria.mp4',  dura: '22 s', quem: 'montagem' },
    t8: { n: '8', nome: 'Entrega da caixinha',   arquivo: 'jornada_08_caixinha.mp4',  dura: '25 s', quem: 'marketing' }
  };


  /* ----------------------------------------------------------
     OS PASSOS
     ----------------------------------------------------------
     materiais: id de item que já existe na Central, ou
     { pendente: 'nome', oque: '...' } para o que ainda não
     existe. Link quebrado é pior que um aviso de pendência:
     quebrado a pessoa acha que é problema dela.
     ---------------------------------------------------------- */
  const PASSOS = [

    /* ===== FASE 01 · ATENDIMENTO E VENDA ===== */

    { id: 'p-inicio', fase: 'f01', ordem: 10, cargo: 'inicio',
      titulo: 'Início do atendimento',
      oque: 'O cliente chega à loja, por telefone ou pelo WhatsApp.',
      fala: 'Seja bem-vindo(a) à Dalmóbile São José dos Campos. Me conta o que você está querendo fazer?',
      falaFonte: 'rascunho',
      sistema: null,
      materiais: [],
      cuidado: null },

    { id: 'p-abertura', fase: 'f01', ordem: 20, cargo: 'consultor',
      titulo: 'Abertura do cliente no sistema',
      oque: 'Abrir o cliente no sistema e registrar DE ONDE ELE VEIO. A origem é campo obrigatório.',
      fala: 'Só pra eu registrar aqui: como você chegou até a gente?',
      falaFonte: 'rascunho',
      sistema: 'Cliente aberto, com a origem preenchida.',
      materiais: [],
      cuidado: 'A origem é o que o relatório do dia 1º usa para decidir a verba de anúncios do mês seguinte. '
             + 'Em branco, aquele atendimento não conta para nada.' },

    { id: 'p-pasta-neg', fase: 'f01', ordem: 30, cargo: 'consultor',
      titulo: 'Pasta do cliente na rede',
      oque: 'Criar a pasta com o nome do cliente na rede, em Vendas, na pasta do vendedor, dentro de "Em negociação".',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: null },

    { id: 'p-apresentar', fase: 'f01', ordem: 40, cargo: 'consultor',
      titulo: 'Apresentar a loja e o projeto',
      oque: 'Apresentação da Dalmóbile e do projeto com os materiais da Central.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: ['apres-clientes', 'apres-arquitetos', 'catalogos-sjc', 'catalogos-cgt'],
      cuidado: null },

    { id: 'p-orcamento', fase: 'f01', ordem: 50, cargo: 'consultor',
      titulo: 'Orçamento e negociação',
      oque: 'Orçamento e negociação no sistema. O Gerente participa da negociação na mesa.',
      fala: null, falaFonte: null,
      sistema: 'Orçamento registrado.',
      materiais: ['orcamento', 'projeto'],
      cuidado: null },

    { id: 'p-kanban-atend', fase: 'f01', ordem: 60, cargo: 'consultor',
      titulo: 'Atualizar o atendimento no Kanban',
      oque: 'Mover o atendimento no Kanban conforme a conversa andar.',
      fala: null, falaFonte: null,
      sistema: 'Kanban atualizado.',
      materiais: [],
      cuidado: null },

    { id: 'p-perdido', fase: 'f01', ordem: 70, cargo: 'consultor',
      desvio: true,
      titulo: 'Se o cliente não fechar',
      oque: 'Organizar a pasta na rede com o ANO e o nome do cliente, dentro de "Perdidos".',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: 'O ano no nome da pasta é o que faz dar para procurar depois. Sem ele, "Perdidos" '
             + 'vira uma lista de nomes sem época.' },

    { id: 'p-fechamento', fase: 'f01', ordem: 80, cargo: 'consultor',
      titulo: 'Fechamento do contrato',
      oque: 'Fechamento e lançamento do contrato no sistema.',
      fala: null, falaFonte: null,
      sistema: 'Contrato no sistema.',
      materiais: [],
      cuidado: null },


    /* ===== FASE 02 · CONTRATO E GRUPO ===== */

    { id: 'p-assinatura', fase: 'f02', ordem: 100, cargo: 'consultor',
      titulo: 'Assinatura do contrato e pasta "Vendido"',
      oque: 'Assinar o contrato e criar a pasta "Vendido" na rede com: arquivo do Promob, projeto inicial, '
          + 'contrato e toda a documentação do processo de venda.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: 'O PROJETO INICIAL é o documento que protege a loja sobre qual projeto o cliente comprou. '
             + 'Faltando ele na pasta, não há como mostrar depois o que foi vendido.' },

    { id: 'p-autorizacao', fase: 'f02', ordem: 110, cargo: 'consultor',
      titulo: 'Termo de Autorização de Uso de Imagem',
      oque: 'Enviar ao cliente pelo Autentique, junto com o contrato.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [{ pendente: 'Termo de Autorização de Uso de Imagem',
                    oque: 'Ficha 18. Texto ainda a validar com o jurídico.' }],
      cuidado: 'Sem este termo assinado, nada daquela obra pode ir para as redes — nem foto do manual, nem caso.' },

    { id: 'p-gerente-contrato', fase: 'f02', ordem: 120, cargo: 'gerente',
      titulo: 'Conferir o contrato e encaminhar ao Financeiro',
      oque: 'Receber o contrato com a capa preenchida, revisar a documentação e encaminhar ao Financeiro.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: null },

    { id: 'p-captacao', fase: 'f02', ordem: 130, cargo: 'gerente',
      titulo: 'Decidir se a obra tem captação, e o nível',
      oque: 'Marcar sim ou não e, se sim, qual nível. Critérios para sim: ambiente com potencial de portfólio, '
          + 'recurso que diferencia a Dalmóbile (curvas, ripado, laca, vidro), projeto de arquiteto parceiro, '
          + 'e cliente que assinou a autorização.',
      fala: null, falaFonte: null,
      sistema: 'Obra registrada no controle de captações, com o nível.',
      materiais: [],
      cuidado: null,
      niveis: true },

    { id: 'p-financeiro-pgto', fase: 'f02', ordem: 140, cargo: 'financeiro',
      titulo: 'Fechar a forma de pagamento',
      oque: 'O Financeiro (Jaime) finaliza a forma de pagamento com o cliente, devolve a pasta ao Gerente '
          + 'e atualiza o Kanban.',
      fala: null, falaFonte: null,
      sistema: 'Kanban atualizado pelo Financeiro.',
      materiais: [],
      cuidado: null },

    { id: 'p-compra-fechada', fase: 'f02', ordem: 150, cargo: 'consultor',
      titulo: 'Compra fechada',
      oque: 'Juntar o que vai para o cliente: projeto inicial, renders e Checklist de Eletros. '
          + 'E-mail para o cliente, o Financeiro e o Gerente da loja.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: ['itens-extras', 'projeto'],
      cuidado: 'O Checklist de Eletros é gerado na Central (tela "Checklist de Eletros") e vai para o cliente '
             + 'logo na criação do grupo.' },

    { id: 'p-grupo', fase: 'f02', ordem: 160, cargo: 'gerente',
      titulo: 'Criar o grupo do cliente no WhatsApp',
      oque: 'O GERENTE cria o grupo pelo CELULAR DA LOJA. Nome do grupo: Nome do Contrato + Número do Contrato. '
          + 'Participantes: cliente, profissional, consultor, executivo, gerente e supervisor. '
          + 'Ordem do que é postado: texto de boas-vindas, card "Quem cuida do seu projeto", '
          + 'vídeo completo da jornada, projeto inicial, renders e Checklist de Eletros.',
      fala: 'Olá, [nome]! Seja bem-vindo(a) à Dalmóbile São José dos Campos. Este é o grupo oficial do seu projeto: '
          + 'aqui você fala com toda a equipe que vai cuidar dele, do projeto à instalação. Logo abaixo, quem cuida '
          + 'de cada etapa e um vídeo que mostra o caminho todo. Qualquer dúvida, é só chamar por aqui.',
      falaFonte: 'manual',
      sistema: 'Grupo criado no MESMO DIA do contrato.',
      materiais: ['boas-vindas', 'logo-grupos-wpp', 'itens-extras',
                  { pendente: 'jornada_00_completo.mp4', oque: 'Vídeo da jornada, versão completa (~3 min 30 s). Ficha 1.' }],
      cuidado: 'O GRUPO É DO GERENTE, PELO CELULAR DA LOJA — não do celular do consultor. '
             + 'A caixa azul do Fluxograma Dalmobile ainda diz "Consultor... e cria grupo WPP", e está '
             + 'desatualizada. Criado do aparelho de uma pessoa, a conversa do cliente sai da loja com ela.',
      trecho: 't0' },

    { id: 'p-vincular-drive', fase: 'f02', ordem: 170, cargo: 'gerente',
      titulo: 'Vincular o grupo à pasta do cliente no Drive',
      oque: 'A partir daqui, toda a comunicação acontece no grupo, e o grupo aponta para a pasta do cliente no Drive.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: 'Daqui em diante NADA de conversa por fora do grupo. O que acontece em mensagem privada não '
             + 'existe para o resto da equipe, e é onde combinado some.' },

    { id: 'p-subpasta-mkt', fase: 'f02', ordem: 180, cargo: 'marketing',
      titulo: 'Criar a subpasta Marketing no Drive',
      oque: 'Dentro da pasta do cliente: 01 Antes, 02 Obra, 03 Fotos do manual, 04 Fotos de portfólio, '
          + '05 Entrega, 06 Depoimentos. Vale para TODA obra, com captação ou sem.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: 'Nome dos arquivos: AAAA-MM-DD_cliente_etapa_01 (ex.: 2026-11-23_silva_antes_01.jpg).' },

    { id: 'p-kanban-posvenda', fase: 'f02', ordem: 190, cargo: 'consultor',
      titulo: 'Kanban em "Comercial/PósVenda"',
      oque: 'Manter nessa etapa até a "Medição Solicitada" ser validada.',
      fala: null, falaFonte: null,
      sistema: 'Kanban: Comercial/PósVenda.',
      materiais: [],
      cuidado: null },


    /* ===== FASE 03 · AVALIAÇÃO DO AMBIENTE ===== */

    { id: 'p-medicao-pedida', fase: 'f03', ordem: 200, cargo: 'montagem',
      titulo: 'Cliente pede a medição; Supervisor combina a visita',
      oque: 'O Supervisor de Montagem combina no grupo a visita à obra para avaliar o ambiente.',
      fala: 'O primeiro passo acontece na sua casa. O Supervisor de Montagem vai até o ambiente para ver se ele '
          + 'está pronto para receber os móveis: piso, paredes, pontos de luz e de água. Parece detalhe, mas é '
          + 'isso que evita surpresas no dia da montagem.',
      falaFonte: 'roteiro',
      sistema: 'Kanban: Medição Solicitada.',
      materiais: [{ pendente: 'jornada_01_avaliacao.mp4', oque: 'Trecho 1 do vídeo da jornada (22 s).' }],
      cuidado: null,
      trecho: 't1' },

    { id: 'p-avaliacao', fase: 'f03', ordem: 210, cargo: 'montagem',
      titulo: 'Supervisor avalia o ambiente e registra o Termo de Medição',
      oque: 'Na obra: conferir piso, prumo das paredes, pontos de elétrica e de água. '
          + 'Registrar o Termo de Medição na Central de Peças e informar o resultado no grupo.',
      fala: null, falaFonte: null,
      sistema: 'Termo de Medição registrado na Central.',
      materiais: ['medicao'],
      cuidado: null },

    { id: 'p-ambiente-ok', fase: 'f03', ordem: 220, cargo: 'montagem',
      titulo: 'Ambiente aprovado para medir',
      oque: 'Aprovado, ou aprovado com termo de responsabilidade assinado pelo cliente.',
      fala: null, falaFonte: null,
      sistema: 'Kanban: Medição Aprovada.',
      materiais: [],
      cuidado: '⚠️ O NOME NO SISTEMA ENGANA. "Medição Aprovada" não quer dizer que mediram e passou: quer dizer '
             + 'que o AMBIENTE foi aprovado para o Executivo poder medir. A medição em si é a fase 04, com '
             + 'outra pessoa. Quem lê o status sem saber isso acha que esta fase já acabou.' },

    { id: 'p-ambiente-nao', fase: 'f03', ordem: 230, cargo: 'montagem',
      desvio: true,
      titulo: 'Se o ambiente não estiver pronto',
      oque: 'Medição reprovada: o Supervisor combina nova visita no grupo quando a obra estiver em condições.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: null },


    /* ===== FASE 04 · MEDIÇÃO TÉCNICA, PROJETO E APROVAÇÃO ===== */

    { id: 'p-medicao-tecnica', fase: 'f04', ordem: 300, cargo: 'executivo',
      titulo: 'Executivo agenda e faz a medição técnica',
      oque: 'Com o projeto inicial em mãos, o Executivo mede cada parede no local e confirma os eletrodomésticos '
          + 'pelo Checklist de Eletros.',
      fala: 'Agora é a vez do Projetista Executivo. Com o projeto inicial em mãos, ele mede cada parede de novo, '
          + 'milímetro a milímetro. É aqui também que a gente confirma os seus eletrodomésticos pelo Checklist de '
          + 'Eletros, para que tudo se encaixe certinho. Se pensar em trocar algum eletro, conte para a gente '
          + 'antes: uma troca muda as medidas e o projeto.',
      falaFonte: 'roteiro',
      sistema: null,
      materiais: ['itens-extras',
                  { pendente: 'jornada_02_medicao.mp4', oque: 'Trecho 2 do vídeo da jornada (22 s).' }],
      cuidado: 'Troca de eletro depois daqui muda medida e muda projeto — e pode mudar o prazo. '
             + 'O aviso ao cliente é nesta etapa, não depois.',
      trecho: 't2' },

    { id: 'p-projeto-exec', fase: 'f04', ordem: 310, cargo: 'executivo',
      titulo: 'Executivo detalha o projeto executivo',
      oque: 'Ferragens, acabamentos e o lugar de cada gaveta, comparando com o saldo financeiro.',
      fala: 'Com as medidas certas, o projeto ganha cada detalhe: ferragens, acabamentos, o lugar de cada gaveta. '
          + 'E antes de chegar até você, ele passa por três olhares: quem vendeu, quem detalhou e quem vai montar. '
          + 'Assim, o que vai para a fábrica já foi pensado pela equipe toda.',
      falaFonte: 'roteiro',
      sistema: 'Kanban: Projeto Executivo.',
      materiais: [{ pendente: 'jornada_03_projeto.mp4', oque: 'Trecho 3 do vídeo da jornada (22 s).' }],
      cuidado: null,
      trecho: 't3' },

    { id: 'p-reuniao-tres', fase: 'f04', ordem: 320, cargo: 'executivo',
      titulo: 'Reunião dos três: Consultor, Executivo e Supervisor',
      oque: 'Todos aprovam o projeto ANTES de gerar os PDFs.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: 'É esta reunião que o vídeo promete ao cliente ("três olhares em cada projeto"). Pulá-la é '
             + 'desmentir o que ele acabou de assistir.' },

    { id: 'p-valor', fase: 'f04', ordem: 330, cargo: 'executivo',
      titulo: 'O valor ficou dentro do acordado?',
      oque: 'Dentro: o Executivo gera os arquivos de impressão. Fora: notifica o Consultor, que reúne o cliente '
          + 'para falar de projeto e valores.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: 'Se o cliente não quiser pagar a diferença, o projeto VOLTA AO ORIGINAL, com a ciência e a '
             + 'aprovação dele registradas.' },

    { id: 'p-aprovacao', fase: 'f04', ordem: 340, cargo: 'consultor',
      titulo: 'Consultor apresenta o projeto para o cliente aprovar',
      oque: 'Apresentar o projeto completo e colher a assinatura. Pedido de ajuste volta ao Executivo.',
      fala: 'Chegou a sua vez. A Consultora apresenta o projeto completo e você confere tudo com calma. Se quiser '
          + 'ajustar algo, é agora. Nada vai para a fábrica sem o seu ok. E vale saber: qualquer mudança, em '
          + 'qualquer etapa, pode mudar também o tempo até a entrega. Por isso essa conferência com calma faz '
          + 'tanta diferença. Com o projeto aprovado e assinado, o seu pedido segue para a produção.',
      falaFonte: 'roteiro',
      sistema: null,
      materiais: ['projeto',
                  { pendente: 'jornada_04_aprovacao.mp4', oque: 'Trecho 4 do vídeo da jornada (22 s).' }],
      cuidado: 'NADA vai para a fábrica sem o ok do cliente. É a promessa mais forte do vídeo.',
      trecho: 't4' },

    { id: 'p-projeto-assinado', fase: 'f04', ordem: 350, cargo: 'consultor',
      titulo: 'Devolver o projeto assinado ao Executivo',
      oque: 'Projeto aprovado e assinado volta ao Executivo para implantação.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: null },


    /* ===== FASE 05 · PRODUÇÃO ===== */

    { id: 'p-implanta', fase: 'f05', ordem: 400, cargo: 'executivo',
      titulo: 'Executivo implanta na fábrica',
      oque: 'Implantação do pedido e passagem do Kanban para Produção.',
      fala: null, falaFonte: null,
      sistema: 'Kanban: Produção.',
      materiais: [],
      cuidado: null },

    { id: 'p-libera-prod', fase: 'f05', ordem: 410, cargo: 'financeiro',
      titulo: 'Financeiro analisa e libera a produção',
      oque: 'Sem a liberação do Financeiro, o pedido não anda.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: null },

    { id: 'p-avisa-producao', fase: 'f05', ordem: 420, cargo: 'executivo',
      titulo: 'Avisar o cliente no grupo, com o link do pedido',
      oque: 'Pelo NÚMERO DA LOJA, confirmar no grupo que o pedido está na fábrica e mandar o link '
          + '"Acompanhe seu pedido".',
      fala: 'O seu pedido chegou à fábrica da Dalmóbile, em Bento Gonçalves, na Serra Gaúcha. Lá, cada peça é '
          + 'cortada, recebe a fita de borda com cola PUR, a laca e o vidro, e sai com o selo de origem no fundo. '
          + 'E você acompanha cada etapa pelo link do pedido, que chega aqui no grupo.',
      falaFonte: 'roteiro',
      sistema: null,
      materiais: ['acompanhe-pedido',
                  { pendente: 'jornada_05_producao.mp4', oque: 'Trecho 5 do vídeo da jornada (25 s).' }],
      cuidado: 'SEM PRAZO na mensagem e sem prazo no vídeo. Prazo fica no contrato — foi decisão de 25/11.',
      trecho: 't5' },


    /* ===== FASE 06 · ENTREGA E MONTAGEM ===== */

    { id: 'p-pasta-supervisor', fase: 'f06', ordem: 500, cargo: 'executivo',
      titulo: 'Executivo envia a pasta do projeto ao Supervisor',
      oque: 'A pasta completa passa para quem vai montar.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: null },

    { id: 'p-prep-entrega', fase: 'f06', ordem: 510, cargo: 'montagem',
      titulo: 'Preparação para o recebimento e agendamento',
      oque: 'Preparar o recebimento da mercadoria e manter o cliente informado do andamento.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: null },

    { id: 'p-mercadoria', fase: 'f06', ordem: 520, cargo: 'montagem',
      titulo: 'Mercadoria chega',
      oque: 'Recebimento e conferência.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: null },

    { id: 'p-agenda-montagem', fase: 'f06', ordem: 530, cargo: 'montagem',
      titulo: 'Supervisor agenda a entrega e a montagem pelo grupo',
      oque: 'Combinar dia e horário com o cliente, no grupo.',
      fala: 'Os móveis chegaram! O Supervisor combina com você o dia e o horário da montagem. A equipe chega '
          + 'uniformizada, protege o piso e os cantos e deixa tudo organizado no fim de cada dia. A sua casa é '
          + 'tratada com o mesmo cuidado que o seu móvel.',
      falaFonte: 'roteiro',
      sistema: null,
      materiais: ['agendamento', 'montagem',
                  { pendente: 'jornada_06_entrega.mp4', oque: 'Trecho 6 do vídeo da jornada (25 s).' }],
      cuidado: null,
      trecho: 't6' },

    { id: 'p-padroes-obra', fase: 'f06', ordem: 540, cargo: 'montagem',
      titulo: 'Padrões de obra',
      oque: 'Tapete de obra, salva-piso e salva-quina, ferramentas e caixas limpas, uniforme, obra organizada, '
          + 'horários combinados com o cliente e adesivo nas peças danificadas.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: 'O vídeo promete casa protegida do começo ao fim. Estes padrões são conferidos na Vistoria de '
             + 'Equipe de Montagem.' },

    { id: 'p-fotos-manual', fase: 'f06', ordem: 550, cargo: 'marketing',
      titulo: 'As 4 fotos do manual (toda obra)',
      oque: 'Com tudo montado e ANTES da vistoria final, o Marketing tira as 4 fotos do ambiente e, no mesmo dia, '
          + 'gera as páginas personalizadas na Central.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: ['manual-garantia'],
      cuidado: 'Antes da vistoria, e no mesmo dia. É o que faz a caixinha estar pronta no dia da entrega, '
             + 'sem correria.' },

    { id: 'p-montagem-fim', fase: 'f06', ordem: 560, cargo: 'montagem',
      titulo: 'Montagem finalizada',
      oque: 'Montagem concluída, pronta para a vistoria.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: null },


    /* ===== FASE 07 · VISTORIA ===== */

    { id: 'p-vistoria', fase: 'f07', ordem: 600, cargo: 'montagem',
      titulo: 'Supervisor faz a vistoria final',
      oque: 'Peça por peça, na Central de Peças: portas alinhadas, gavetas e corrediças, acabamentos.',
      fala: 'Montagem concluída. Agora o Supervisor faz a vistoria final, peça por peça: portas alinhadas, '
          + 'gavetas correndo, acabamento conferido. Se algum item precisar de ajuste, ele abre a ordem de '
          + 'serviço e acompanha tudo com a fábrica até ficar pronto.',
      falaFonte: 'roteiro',
      sistema: 'Vistoria registrada na Central.',
      materiais: ['vistoria-montagem',
                  { pendente: 'jornada_07_vistoria.mp4', oque: 'Trecho 7 do vídeo da jornada (22 s).' }],
      cuidado: null,
      trecho: 't7' },

    { id: 'p-relatorio', fase: 'f07', ordem: 610, cargo: 'montagem',
      titulo: 'Relatório ao Gerente e ao Financeiro',
      oque: 'O relatório da vistoria e da montagem vai aos dois, com: custos de fábrica, custos de loja e '
          + 'a indicação de quem vai custear a finalização 100% da montagem.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: 'Sem a indicação de quem custeia, o relatório não fecha e a conta fica em aberto entre loja '
             + 'e fábrica.' },

    { id: 'p-doc-financeiro', fase: 'f07', ordem: 620, cargo: 'montagem',
      titulo: 'Sem assistência: documentação ao Financeiro',
      oque: 'O Supervisor envia a documentação ao Financeiro e sinaliza a montagem finalizada.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: null },


    /* ===== FASE 08 · ASSISTÊNCIA (desvio) ===== */

    { id: 'p-os', fase: 'f08', ordem: 700, cargo: 'montagem',
      desvio: true,
      titulo: 'Supervisor gera a Ordem de Serviço',
      oque: 'Com pedido de assistência: gerar a OS no sistema e solicitá-la ao Projetista Executivo.',
      fala: null, falaFonte: null,
      sistema: 'Ordem de Serviço no sistema.',
      materiais: [],
      cuidado: 'Obra em assistência NÃO vai para as redes, e nada é gravado até liberar.' },

    { id: 'p-os-fabrica', fase: 'f08', ordem: 710, cargo: 'executivo',
      desvio: true,
      titulo: 'Executivo envia o pedido à fábrica',
      oque: 'Enviar o pedido e informar o Financeiro e o Supervisor de Montagem.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: null },

    { id: 'p-os-libera', fase: 'f08', ordem: 720, cargo: 'financeiro',
      desvio: true,
      titulo: 'Financeiro libera e informa Pós-venda e Logística',
      oque: 'Liberação da produção da assistência.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: null },

    { id: 'p-os-entrega', fase: 'f08', ordem: 730, cargo: 'montagem',
      desvio: true,
      titulo: 'Mercadoria chega e a assistência é agendada',
      oque: 'O Supervisor de Montagem agenda a entrega e a assistência com o cliente. '
          + 'Depois, volta à vistoria.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: 'No Fluxograma Dalmobile este passo está escrito como "Coordenador". A confirmar se é o próprio '
             + 'Supervisor de Montagem — é o entendimento de hoje.',
      confirmar: true },


    /* ===== FASE 09 · ENTREGA DA CAIXINHA ===== */

    { id: 'p-imprime', fase: 'f09', ordem: 800, cargo: 'marketing',
      titulo: 'Imprimir as páginas e montar a caixinha',
      oque: 'As páginas personalizadas já estão prontas desde a montagem. Imprimir, juntar ao livreto base do '
          + 'Manual de Uso e Garantia e montar: livreto, cheirinho Dalmóbile, chaveiro de madeira e cartão QR.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: ['manual-garantia'],
      cuidado: null },

    { id: 'p-confere-caixinha', fase: 'f09', ordem: 810, cargo: 'marketing',
      titulo: 'Conferir e fotografar a caixinha',
      oque: 'Conferir pelo checklist, fotografar a caixinha montada e avisar o Consultor que está pronta.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: [],
      cuidado: null },

    { id: 'p-agenda-caixinha', fase: 'f09', ordem: 820, cargo: 'consultor',
      titulo: 'Consultor agenda a entrega da caixinha',
      oque: 'Combinar com o cliente o dia da entrega em pessoa.',
      fala: null, falaFonte: null,
      sistema: null,
      materiais: ['entrega'],
      cuidado: null },

    { id: 'p-entrega-caixinha', fase: 'f09', ordem: 830, cargo: 'marketing',
      titulo: 'Consultor, Gerente e Marketing entregam',
      oque: 'Os três entregam a caixinha juntos. O Marketing registra em foto e vídeo, com autorização.',
      fala: 'Tudo pronto! Para fechar, a gente entrega pessoalmente a sua caixinha Dalmóbile, com o manual de uso '
          + 'feito com fotos do seu ambiente. Obrigado por criar o seu projeto com a gente.',
      falaFonte: 'roteiro',
      sistema: null,
      materiais: ['entrega'],
      cuidado: null },

    { id: 'p-avaliacao-google', fase: 'f09', ordem: 840, cargo: 'marketing',
      titulo: 'Pedir a avaliação no Google',
      oque: 'NO DIA SEGUINTE: mandar o trecho final do vídeo e a mensagem com o link de avaliação. '
          + 'Se o cliente não avaliar em uma semana, um lembrete gentil — só um.',
      fala: 'Se puder, conte no Google como foi. Isso ajuda muito a nossa equipe.',
      falaFonte: 'roteiro',
      sistema: null,
      materiais: ['google-sjc', 'google-cgt', 'pos-visita',
                  { pendente: 'jornada_08_caixinha.mp4', oque: 'Trecho 8 do vídeo da jornada (25 s).' }],
      cuidado: 'Um lembrete, e só um. Dois viram cobrança.',
      trecho: 't8' },

    { id: 'p-fim', fase: 'f09', ordem: 850, cargo: 'inicio',
      titulo: 'Fim do processo',
      oque: 'Com captação: as fotos vão ao arquiteto com o crédito padrão, e o caso é publicado e enviado ao '
          + 'cliente e ao arquiteto, marcando os dois.',
      fala: null, falaFonte: null,
      sistema: 'Obra fechada no controle de captações.',
      materiais: [],
      cuidado: null }
  ];


  /* ----------------------------------------------------------
     Leitura
     ---------------------------------------------------------- */
  function passosDaFase(faseId) {
    return PASSOS.filter(function (p) { return p.fase === faseId; })
                 .sort(function (a, b) { return a.ordem - b.ordem; });
  }

  function cargoDe(id) {
    return CARGOS[id] || CARGOS.inicio;
  }

  function trechoDe(id) {
    return id ? (TRECHOS[id] || null) : null;
  }

  /* Quantas falas ainda são rascunho meu. A tela mostra isto no
     topo: o número é o que faz alguém sentar e revisar. */
  function contarRascunhos() {
    return PASSOS.filter(function (p) { return p.falaFonte === 'rascunho'; }).length;
  }

  function contarPendencias() {
    let n = 0;
    PASSOS.forEach(function (p) {
      (p.materiais || []).forEach(function (m) { if (m && m.pendente) n++; });
    });
    return n;
  }

  return {
    CARGOS, FASES, PASSOS, NIVEIS, TRECHOS,
    passosDaFase, cargoDe, trechoDe, contarRascunhos, contarPendencias
  };
})();

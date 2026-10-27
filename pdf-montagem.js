/* ============================================================
   VISTORIA DE EQUIPE DE MONTAGEM — a receita
   ------------------------------------------------------------
   O desenho do PDF mora em pdf-doc.js. Aqui ficam só as coisas
   que são DESTE documento: os itens, os títulos e quem assina.

   Separado assim porque a vistoria com o cliente usa o mesmo
   desenho e itens diferentes. Enquanto era um arquivo só, criar
   o segundo documento significava copiar 776 linhas — e toda
   correção passaria a ser feita duas vezes, até alguém esquecer
   de uma.

   Carregue pdf-doc.js ANTES deste arquivo.

   Uso, igual ao de antes:
       await PDFMontagem.montar(doc);
       PDFMontagem.nomeDoArquivo(doc);
       PDFMontagem.BLOCOS        // fonte única dos itens
   ============================================================ */

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

const PDFMontagem = PDFDoc.criar({
  /* 'nome' e a caixa mista: vai nos metadados do PDF e no
     rodape. 'titulo' e o grito do cabecalho. Eram dois textos
     diferentes antes da extracao, e precisam continuar dois. */
  nome: 'Vistoria de Equipe de Montagem',
  titulo: 'VISTORIA DE EQUIPE DE MONTAGEM',
  subtitulo: 'Controle interno de qualidade. Preenchido pelo responsável durante e ao ' +
             'final da montagem.',
  assunto: 'Controle interno de montagem',
  prefixo: 'vistoria-equipe-montagem',
  blocos: BLOCOS,
  assinatura: { campo: 'responsavel', legenda: 'Responsável pelo preenchimento' },
  /* Documento interno: não tem parecer, não libera nada. */
  parecer: null
});

window.PDFMontagem = PDFMontagem;

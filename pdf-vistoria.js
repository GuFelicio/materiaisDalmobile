/* ============================================================
   VISTORIA DE MONTAGEM — as receitas

   O desenho do PDF mora em pdf-doc.js. Aqui ficam só as coisas
   que são DESTE documento: os itens, os títulos, o parecer e
   quem assina.

   SÃO DUAS RECEITAS, UM REGISTRO SÓ.

   A liberação da obra e o pedido de assistência técnica não são
   dois documentos: são dois jeitos de olhar a mesma vistoria.
   Fossem registros separados, o vistoriador preencheria os
   mesmos 15 itens duas vezes, e nada impediria que existissem,
   para o mesmo contrato, uma liberação E uma assistência — que é
   exatamente a contradição que a regra "se tem assistência, não
   libera" existe para evitar.

   Com um registro e um parecer, a regra se sustenta sozinha: o
   parecer é consequência das respostas, não uma escolha. Uma não
   conformidade e a obra não está liberada, ponto. Resolveu na
   hora? O caminho é mudar o item para Conforme, não contornar o
   parecer.

   Carregue pdf-doc.js ANTES deste arquivo.

   Uso:
       await PDFVistoria.montar(doc);            // a liberação
       await PDFVistoria.assistencia.montar(doc); // só as pendências
   ============================================================ */

/* Os quinze itens que falam do MÓVEL ENTREGUE — não de como a
   equipe trabalhou. Esses ficaram no documento interno.

   Três deles repetem, no estado final, o que o documento da
   equipe pergunta durante o processo (regulagem, tapa-furo,
   acabamentos). Não é duplicata: lá a pergunta é "a equipe fez
   certo enquanto montava", aqui é "está certo agora, com o
   cliente olhando". */
const ITENS_VISTORIA = [
  {
    id: 'vistoria',
    titulo: 'VISTORIA DA MONTAGEM',
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
      { id: 'v14', texto: 'Emblema Dalmóbile' },
      { id: 'v15', texto: 'Limpeza do ambiente e dos móveis' }
    ]
  }
];

/* O prazo é de contrato, não combinado em obra. Por isso é texto
   fixo e não campo: um prazo digitado à mão vira promessa
   particular de quem estava lá, e o documento assinado passa a
   dizer coisa diferente do contrato. */
const PRAZO_ASSISTENCIA = '20 dias úteis';

/* ------------------------------------------------------------
   O parecer
   ------------------------------------------------------------
   Três estados, não dois. "Incompleta" existe porque uma
   vistoria com item em branco não é nem liberação nem pendência
   — e chamá-la de qualquer uma das duas seria mentir no
   documento que o cliente assina.
   ------------------------------------------------------------ */
function parecerDaVistoria(dados, c) {
  if (c.faltam) {
    return { texto: 'VISTORIA INCOMPLETA', cor: [0.54, 0.29, 0.07] };
  }
  if (c.nao) {
    return {
      texto: c.nao === 1 ? '1 PENDÊNCIA — OBRA NÃO LIBERADA'
                         : c.nao + ' PENDÊNCIAS — OBRA NÃO LIBERADA',
      cor: [0.70, 0.15, 0.12]
    };
  }
  return { texto: 'OBRA LIBERADA', cor: [0.11, 0.42, 0.25] };
}

/* Mesma pergunta, em palavras de quem lê: serve para a tela e
   para qualquer lugar que precise do veredito sem montar o PDF. */
function situacao(contagem) {
  if (contagem.faltam) return 'incompleta';
  return contagem.nao ? 'pendencias' : 'liberada';
}


/* ------------------------------------------------------------
   1. A liberação — o documento que o cliente assina
   ------------------------------------------------------------ */
const PDFVistoria = PDFDoc.criar({
  nome: 'Vistoria de Montagem',
  titulo: 'VISTORIA DE MONTAGEM',
  subtitulo: 'Conferência da montagem com o cliente. O que estiver conforme fica ' +
             'liberado; o que ficar pendente segue para assistência técnica, em até ' +
             PRAZO_ASSISTENCIA + ', conforme contrato.',
  assunto: 'Vistoria e liberação de montagem',
  prefixo: 'vistoria-montagem',
  blocos: ITENS_VISTORIA,
  assinatura: { campo: 'cliente_assina', legenda: 'Cliente' },
  legendaDoRodape: 'Vistoria conferida com o cliente',
  parecer: parecerDaVistoria
});


/* ------------------------------------------------------------
   2. A assistência técnica — o mesmo registro, só as pendências
   ------------------------------------------------------------
   Sai do MESMO documento, filtrado. A equipe de assistência
   recebe o que precisa sem ninguém redigitar, e sem risco de a
   lista dela discordar da que o cliente assinou.
   ------------------------------------------------------------ */
PDFVistoria.assistencia = PDFDoc.criar({
  nome: 'Assistência Técnica',
  titulo: 'PEDIDO DE ASSISTÊNCIA TÉCNICA',
  subtitulo: 'Pendências apontadas na vistoria de montagem e assinadas pelo cliente. ' +
             'Prazo de atendimento: ' + PRAZO_ASSISTENCIA + ', conforme contrato.',
  assunto: 'Pendências de montagem',
  prefixo: 'assistencia-tecnica',
  blocos: ITENS_VISTORIA,
  assinatura: { campo: 'cliente_assina', legenda: 'Cliente' },
  legendaDoRodape: 'Pendências conferidas com o cliente',
  parecer: parecerDaVistoria,
  /* Só o que ficou pendente. Item conforme não dá trabalho a
     ninguém e só faria a lista parecer maior do que é. */
  filtroDeItem: function (item, resposta) {
    return resposta.resposta === 'nao';
  }
});

PDFVistoria.ITENS = ITENS_VISTORIA;
PDFVistoria.PRAZO_ASSISTENCIA = PRAZO_ASSISTENCIA;
PDFVistoria.situacao = situacao;

window.PDFVistoria = PDFVistoria;

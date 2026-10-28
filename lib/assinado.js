/* ============================================================
   O PDF ASSINADO NA AUTENTIQUE — Dalmóbile
   ------------------------------------------------------------
   Pegar o arquivo assinado tem três armadilhas, e as três já
   custaram tempo. Elas moram aqui, num lugar só, porque agora
   DUAS rotas precisam do mesmo arquivo:

       /api/documento   — entrega para quem abre a ficha na Central
       /api/autentique  — anexa no e-mail da equipe e no do cliente

   Duas cópias disso envelheceriam em direções diferentes: uma
   ganharia a correção e a outra não, e a que ficasse para trás
   seria justamente a que ninguém olha — a do e-mail, que roda
   sozinha de madrugada.

   ⚠️ ESTE ARQUIVO NÃO GUARDA SEGREDO NENHUM, e não pode passar a
   guardar. Ele vive fora de functions/, então o Cloudflare o
   publica como arquivo estático: qualquer pessoa pode ler
   https://materiais.luminamkt.co/lib/assinado.js. O token entra
   por argumento, em tempo de execução, e é só isso que o mantém
   fora do alcance de quem lê o código.

   (Por que fora de functions/: lá dentro, cada arquivo vira uma
   ROTA. A documentação do Cloudflare não promete exceção para
   nome começando com underscore, e um módulo de apoio virando
   endereço público — ou quebrando o build — é o tipo de surpresa
   que aparece no deploy, não aqui.)
   ============================================================ */

const AUTENTIQUE = 'https://api.autentique.com.br/v2/graphql';


/* ------------------------------------------------------------
   1. Quais arquivos servem, e em que ordem
   ------------------------------------------------------------
   TODOS os endereços, em ordem de preferência — e não só o
   primeiro. Isto já quebrou: a Autentique devolve um endereço de
   PAdES mesmo quando esse arquivo não foi gerado, e ele dá 404.
   Escolher um e desistir fazia o documento parecer inexistente,
   enquanto o 'signed' estava lá do lado.

   PAdES primeiro porque é o PDF que carrega a assinatura digital
   dentro dele, que qualquer leitor reconhece sem depender de a
   Autentique continuar no ar. Mas se ele não vier, o assinado
   comum serve.

   ⚠️ O 'original' NÃO entra nesta lista, de propósito. Ele é o
   PDF que NÓS mandamos, antes de qualquer assinatura. Entregá-lo
   sob o nome 'termo-assinado' seria pior que não entregar nada:
   um documento sem assinatura nenhuma circulando como se tivesse
   as duas. Havia um ramo para ele aqui, inofensivo só porque a
   consulta nunca pedia o campo — pedra esperando que alguém
   acrescentasse 'original' à query.
   ------------------------------------------------------------ */
export function candidatosDoDoc(doc) {
  if (!doc || !doc.files) return [];

  const lista = [];
  if (doc.files.pades)  lista.push({ tipo: 'pades',  endereco: doc.files.pades });
  if (doc.files.signed) lista.push({ tipo: 'signed', endereco: doc.files.signed });

  return lista.filter(function (c) {
    /* Endereço relativo não dá para buscar daqui, e fetch com ele
       estoura de um jeito que não ajuda ninguém. Melhor saber que
       veio assim. */
    if (!/^https?:\/\//i.test(c.endereco)) {
      console.warn('[assinado] endereço não absoluto em ' + c.tipo + ': ' + c.endereco);
      return false;
    }
    return true;
  });
}


/* Os campos de arquivo que a consulta precisa pedir. Fica aqui
   para a query e a leitura não se separarem: quem acrescentar um
   tipo em candidatosDoDoc() tem de passar por este trecho. */
export const CAMPOS_DE_ARQUIVO = 'files { signed pades }';


/* ------------------------------------------------------------
   2. Perguntar à Autentique onde está o arquivo
   ------------------------------------------------------------
   Para quem AINDA NÃO tem a resposta dela em mão. Quem já
   consultou o documento (o webhook consulta, para conferir se
   todos assinaram) usa candidatosDoDoc() direto e economiza uma
   ida.
   ------------------------------------------------------------ */
export async function enderecosDoAssinado(token, docId) {
  const query = `
    query Arquivo($id: UUID!) {
      document(id: $id) {
        id
        name
        ${CAMPOS_DE_ARQUIVO}
        signatures { signed { created_at } }
      }
    }`;

  const corpo = new FormData();
  corpo.append('operations', JSON.stringify({ query: query, variables: { id: docId } }));
  corpo.append('map', '{}');

  const r = await fetch(AUTENTIQUE, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token },
    body: corpo
  });

  const texto = await r.text();

  let json = null;
  try { json = JSON.parse(texto); } catch (e) { json = null; }

  if (!r.ok || !json) throw falha('Não consegui falar com a Autentique agora.', 502);

  if (json.errors && json.errors.length) {
    /* Documento apagado — acontece com sandbox, que a Autentique
       remove em poucos dias. Recado claro em vez de erro cru. */
    throw falha('A Autentique não encontrou este documento. '
      + 'Se foi um envio de teste, ela o apaga depois de alguns dias.', 404);
  }

  return candidatosDoDoc(json.data && json.data.document);
}


/* ------------------------------------------------------------
   3. Baixar
   ------------------------------------------------------------
   DUAS TENTATIVAS POR ARQUIVO, NESTA ORDEM, E A ORDEM NÃO É
   ARBITRÁRIA.

   O endereço que a Autentique devolve pode ser de dois tipos, e
   eles se excluem:

     1. Link assinado de armazenamento (o caso comum). A
        credencial já está na própria URL — e mandar um cabeçalho
        'authorization' junto FAZ a S3 recusar com 400. Por isso a
        primeira tentativa é limpa.

     2. Endereço da própria Autentique, que exige o token. Aí a
        primeira tentativa volta 401/403 e a segunda resolve.

   Se as duas falharem, o recado leva os códigos — sem isso, "não
   consegui baixar" não diz se é permissão, se o arquivo não
   existe, ou se foi um documento de teste já apagado.
   ------------------------------------------------------------ */
export async function baixar(candidatos, token) {
  if (!candidatos || !candidatos.length) {
    throw falha('A Autentique ainda não tem o arquivo assinado deste documento.', 409);
  }

  const tentativas = [];

  for (const c of candidatos) {
    for (const comToken of [false, true]) {
      try {
        const r = await fetch(c.endereco,
          comToken ? { headers: { authorization: 'Bearer ' + token } } : undefined);

        if (r.ok) return { resposta: r, tipo: c.tipo };

        tentativas.push(c.tipo + (comToken ? '+token' : '') + ':' + r.status);
      } catch (e) {
        tentativas.push(c.tipo + (comToken ? '+token' : '') + ':erro');
      }
    }
  }

  /* Tudo 404 em todos os arquivos: o documento realmente não está
     mais lá. Qualquer outra combinação é outra coisa, e o recado
     leva o mapa inteiro das tentativas — sem ele, 'não consegui
     baixar' não distingue permissão de arquivo inexistente de
     endereço errado. */
  const soQuatroCentoQuatro = tentativas.every(function (t) { return t.endsWith(':404'); });

  if (soQuatroCentoQuatro) {
    throw falha('O arquivo assinado não está mais disponível na Autentique. '
      + 'Documento de teste é apagado por lá depois de alguns dias.', 404);
  }

  throw falha('Não consegui baixar o documento. Tentativas: '
    + tentativas.join(', ') + '. Me mande isso.', 502);
}


/* ------------------------------------------------------------
   4. O nome do arquivo
   ------------------------------------------------------------
   É o nome que a pessoa vê na aba do navegador e no anexo do
   e-mail, e é por ele que ela vai procurar o arquivo seis meses
   depois. Cliente e contrato, sem acento e sem espaço.
   ------------------------------------------------------------ */
export function nomeDoArquivo(ficha, tipo) {
  const pedaco = function (t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  };

  /* Vistoria e medição geram documentos diferentes, e um e-mail
     com dois anexos chamados 'termo-assinado' não ajuda ninguém. */
  const inicio = ficha && ficha.tipo === 'vistoria' ? 'vistoria-assinada' : 'termo-assinado';

  return [inicio, pedaco(ficha && ficha.cliente), pedaco(ficha && ficha.contrato)]
    .filter(Boolean).join('-').slice(0, 90) + (tipo === 'pades' ? '-pades' : '') + '.pdf';
}


/* ------------------------------------------------------------
   5. O arquivo em base64, para anexar em e-mail
   ------------------------------------------------------------
   O Resend recebe anexo como base64 no corpo JSON. Converter
   2 MB de PDF com btoa(String.fromCharCode(...bytes)) ESTOURA A
   PILHA: 'apply' com dois milhões de argumentos não é uma
   chamada que o motor aceite. Por isso o laço em pedaços.

   O teto existe por causa do tempo de CPU do Cloudflare, que é
   contado por invocação. Um PDF gigante travaria o webhook — e
   travar o webhook é perder a assinatura, que é muito pior que
   mandar o e-mail sem anexo. Acima do teto, devolve null e quem
   chamou decide o que fazer.
   ------------------------------------------------------------ */
export const TETO_DO_ANEXO = 8 * 1024 * 1024;

export function emBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  if (u8.length > TETO_DO_ANEXO) {
    console.warn('[assinado] arquivo grande demais para anexar: ' + u8.length + ' bytes');
    return null;
  }

  let texto = '';
  const passo = 8192;
  for (let i = 0; i < u8.length; i += passo) {
    texto += String.fromCharCode.apply(null, u8.subarray(i, i + passo));
  }

  return btoa(texto);
}


/* ------------------------------------------------------------
   6. O caminho inteiro, de uma vez
   ------------------------------------------------------------
   Para quem quer o anexo e não quer saber de candidato, tentativa
   nem base64. NUNCA ESTOURA: devolve null quando não dá.

   Não estourar é a decisão de desenho aqui, e ela é deliberada.
   Quem chama isto está no meio de processar uma assinatura, e um
   erro no anexo não pode derrubar o resto — o anexo é conforto,
   a assinatura é o prazo contratual.
   ------------------------------------------------------------ */
export async function anexoAssinado(token, doc, ficha) {
  try {
    const candidatos = candidatosDoDoc(doc);
    if (!candidatos.length) {
      console.warn('[assinado] a Autentique ainda não tem arquivo assinado');
      return null;
    }

    const baixado = await baixar(candidatos, token);
    const base64 = emBase64(await baixado.resposta.arrayBuffer());
    if (!base64) return null;

    return {
      filename: nomeDoArquivo(ficha, baixado.tipo),
      content: base64,
      tipo: baixado.tipo
    };
  } catch (e) {
    console.warn('[assinado] não consegui preparar o anexo: ' + (e && e.message));
    return null;
  }
}


/* ------------------------------------------------------------
   Miudezas
   ------------------------------------------------------------ */

function falha(publico, status) {
  const e = new Error(publico);
  e.publico = publico;
  e.status = status || 500;
  return e;
}

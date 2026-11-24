/* ============================================================
   FOTOS DA APRESENTAÇÃO — Dalmóbile · roda no Cloudflare
   ------------------------------------------------------------
   Guarda no Drive da Dalmóbile cada foto usada numa apresentação
   de projeto, e devolve a foto quando a apresentação é reaberta.

   ONDE ESTE ARQUIVO MORA
       functions/api/foto.js   →  /api/foto

   O PROBLEMA QUE ELE RESOLVE
   Hoje a apresentação guarda só { nome, tamanho } de cada foto e
   reencontra o arquivo pelo nome quando o consultor reabre — o
   que só funciona na mesma máquina, com os mesmos arquivos no
   mesmo lugar. Trocou de computador, o servidor da loja mudou de
   pasta, ou o cliente pediu a apresentação seis meses depois: as
   fotos não voltam. Agora voltam.

   VARIÁVEIS: as de /api/documento, mais as três do Google.
       GOOGLE_PASTA_APRESENTACOES   opcional. Id de uma pasta que
                                    já exista, para o app guardar
                                    dentro dela.

   ⚠️ O ID DO ARQUIVO NO DRIVE NUNCA SAI DAQUI.
   O navegador pede por trabalho + ambiente + ordem. Se ele
   pedisse por id, esta rota seria um proxy aberto: bastaria
   tentar ids até acertar o de outra loja. Pedindo pelo lugar, a
   pergunta "você pode?" é respondida pela RLS de `trabalhos`,
   que já existe e já está certa — o seu, sempre; o gerente, o da
   própria loja; o administrador, tudo.

   DUAS PERMISSÕES DIFERENTES, DE PROPÓSITO
       GET  (baixar)  → quem PODE VER o trabalho
       POST (subir)   → quem PODE ALTERAR o trabalho
   O gerente vê a apresentação do consultor mas não escreve nela.
   Em vez de copiar essa regra para cá — onde ela envelheceria
   em separado — o POST a verifica USANDO-A: ele tenta tocar o
   `atualizado_em` do trabalho com o token da própria pessoa. Se
   a RLS barra, não vem linha nenhuma e a resposta é 403. A regra
   continua morando num lugar só.
   ============================================================ */

import {
  temDrive, tokenDeAcesso, pastaDaApresentacao,
  subirArquivo, acharArquivo, baixarComTipo
} from '../../lib/drive.js';


/* Tipos que aceitamos subir. Lista fechada, não "tudo que começa
   com image/": um SVG é imagem para o navegador e também é um
   documento que executa script, e ele voltaria desta rota com o
   content-type que o Drive devolvesse. */
const TIPOS = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp'
};

/* As fotos já chegam reduzidas pelo projeto.html (1920px, 0.86),
   o que dá 300–800 KB. O teto é folga para uma foto que resista
   bem à compressão, não licença para subir o original de 12 MB. */
const TETO = 6 * 1024 * 1024;


export async function onRequest(context) {
  const { request, env } = context;

  const url     = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const secreta = String(env.SUPABASE_SECRET || '').trim();

  if (!url || !secreta) {
    return responder({ erro: 'Rota fora do ar. Avise o escritório.' }, 500);
  }

  if (!temDrive(env)) {
    /* Sem as três variáveis do Google o sistema segue como hoje:
       as fotos continuam vindo do disco do consultor. Dizer isto
       em voz alta é melhor que um 500 misterioso. */
    return responder({ erro: 'O Drive ainda não está configurado.' }, 503);
  }

  try {
    const sessao = (request.headers.get('authorization') || '')
      .replace(/^Bearer\s+/i, '').trim();
    if (!sessao) throw falha('Faça login de novo e tente mais uma vez.', 401);

    if (request.method === 'POST') {
      return await subir(request, env, url, secreta, sessao);
    }
    if (request.method === 'GET') {
      return await baixar(request, env, url, secreta, sessao);
    }

    return responder({ erro: 'Esta rota aceita GET e POST.' }, 405);

  } catch (e) {
    if (e && e.publico) return responder({ erro: e.publico }, e.status);
    console.error('[foto] ' + ((e && e.message) || 'falhou sem mensagem'));
    return responder({ erro: 'Não consegui agora. Tente de novo.' }, 500);
  }
}


/* ------------------------------------------------------------
   SUBIR
   ------------------------------------------------------------ */
async function subir(request, env, url, secreta, sessao) {
  let forma;
  try { forma = await request.formData(); }
  catch (e) { throw falha('Pedido mal formado.', 400); }

  const lugar = ondeFica(
    forma.get('trabalho'), forma.get('ambiente'), forma.get('ordem'));

  const arquivo = forma.get('arquivo');
  if (!arquivo || typeof arquivo.arrayBuffer !== 'function') {
    throw falha('Nenhum arquivo chegou.', 400);
  }

  const tipo = String(arquivo.type || '').toLowerCase().split(';')[0];
  if (!TIPOS[tipo]) {
    throw falha('Só aceito foto em JPG, PNG ou WebP.', 415);
  }
  if (arquivo.size > TETO) {
    throw falha('Essa foto passa de 6 MB. Reduza antes de subir.', 413);
  }

  /* A cerca. Tocar o trabalho com o token da pessoa: se a RLS
     não deixa, não volta linha e paramos aqui — sem ter subido
     nada e sem ter copiado a regra de permissão para cá. */
  const dono = await podeAlterar(url, secreta, sessao, lugar.trabalho);

  /* Daqui para baixo é servidor: a pergunta já foi respondida.
     O perfil que nomeia a pasta é o do AUTOR, não o de quem está
     subindo — se o administrador mexe na apresentação da
     Patrícia, ela continua sendo da Patrícia e mora na pasta
     dela. */
  const pessoa = await perfilDoAutor(url, secreta, dono.autor);

  const bytes = new Uint8Array(await arquivo.arrayBuffer());

  const acesso = await tokenDeAcesso(env);

  const pasta = await pastaDaApresentacao(
    acesso, env,
    function (escopo, chave, pastaNova, nome) {
      return reservarPasta(url, secreta, escopo, chave, pastaNova, nome);
    },
    pessoa, dono.cliente, dono);

  const nome = nomeDaFoto(lugar.ordem, arquivo.name, TIPOS[tipo]);

  /* ⚠️ PROCURAR ANTES DE SUBIR. Fecha uma janela real: o envio
     dá certo e o `registrar_foto_drive` falha logo depois. A foto
     está no Drive, o banco não sabe onde, e a segunda tentativa
     subiria a MESMA foto outra vez — o Drive aceita nome repetido
     sem reclamar, então ficariam duas iguais na pasta e nenhum
     jeito de saber qual é qual.

     Com a busca antes, repetir é seguro: acha a que subiu,
     devolve o id, e o registro acontece. É a mesma cerca que o
     documento assinado já tinha; aqui ela faltava, e foi a prova
     23 que mostrou. */
  const anterior = await acharArquivo(acesso, pasta, nome);

  const id = anterior || await subirArquivo(acesso, pasta, { nome: nome, bytes: bytes }, tipo, {
    descricao: 'Apresentação de projeto · ' + (dono.cliente || 'sem cliente')
             + ' · ambiente ' + lugar.ambiente,
    propriedades: {
      trabalho: lugar.trabalho,
      ambiente: lugar.ambiente,
      ordem:    String(lugar.ordem)
    }
  });

  await registrarFoto(url, secreta, lugar, id, nome, bytes.length);

  /* Devolve o lugar, nunca o id. */
  return responder({
    ok: true,
    ambiente: lugar.ambiente,
    ordem: lugar.ordem,
    nome: nome
  });
}


/* ------------------------------------------------------------
   BAIXAR
   ------------------------------------------------------------ */
async function baixar(request, env, url, secreta, sessao) {
  const q = new URL(request.url).searchParams;

  const lugar = ondeFica(
    q.get('trabalho'), q.get('ambiente'), q.get('ordem'));

  /* Aqui a cerca é só de leitura: o gerente enxerga o trabalho
     do consultor da loja dele. Volta vazio, acaba. */
  const visivel = await podeVer(url, secreta, sessao, lugar.trabalho);
  if (!visivel) throw falha('Apresentação não encontrada.', 404);

  const foto = await acharFoto(url, secreta, lugar);
  if (!foto) throw falha('Essa foto não está guardada.', 404);

  const baixada = await baixarComTipo(env, foto.drive_id);
  if (!baixada) {
    /* O registro existe e o arquivo não: alguém apagou do Drive.
       Vale distinguir de "nunca subiu" — é a única pista de que
       a cópia foi perdida. */
    throw falha('A foto estava guardada mas não está mais no Drive.', 410);
  }

  const tipo = TIPOS[String(baixada.tipo).toLowerCase().split(';')[0]]
    ? baixada.tipo : 'application/octet-stream';

  return new Response(baixada.bytes, {
    status: 200,
    headers: {
      'content-type': tipo,
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
      /* O nome volta para o navegador poder reconstruir o File
         com o mesmo nome — é o que faz um salvamento seguinte
         reencontrar este arquivo em vez de subir outra cópia. */
      'content-disposition': 'inline; filename="'
        + String(foto.nome || 'foto.jpg').replace(/[^A-Za-z0-9._-]/g, '_') + '"'
    }
  });
}


/* ------------------------------------------------------------
   O LUGAR DA FOTO
   ------------------------------------------------------------ */
function ondeFica(trabalho, ambiente, ordem) {
  const t = String(trabalho || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(t)) throw falha('Apresentação inválida.', 400);

  /* O id do ambiente é gerado pelo app, mas chega pela rede:
     vai para dentro de `properties` do Drive e para a chave
     primária da tabela. Lista branca, não lista negra. */
  const a = String(ambiente || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(a)) throw falha('Ambiente inválido.', 400);

  const o = Number(ordem);
  if (!Number.isInteger(o) || o < 0 || o > 199) {
    throw falha('Posição de foto inválida.', 400);
  }

  return { trabalho: t, ambiente: a, ordem: o };
}

/* Nome legível para quem abre o Drive, e DETERMINÍSTICO para a
   mesma foto no mesmo lugar — é o que faz uma repetição do envio
   reencontrar o arquivo em vez de subir uma segunda cópia.

   Trocar a foto de um ambiente gera nome novo e o arquivo antigo
   FICA no Drive. É a decisão que você tomou para o PDF, pelo
   mesmo motivo: o PDF se substitui, as fotos se guardam. */
function nomeDaFoto(ordem, original, extensao) {
  const limpo = String(original || '')
    .replace(/\.[^.]+$/, '')
    /* A foto que desceu do Drive já se chama "foto-03-cozinha".
       Subindo de volta — o consultor reordenou os ambientes —
       ela viraria "foto-05-foto-03-cozinha", e no salvamento
       seguinte outra camada. Tira o prefixo antes de pôr o
       novo. */
    .replace(/^foto-\d{2,3}-?/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  const n = String(ordem + 1).padStart(2, '0');
  return 'foto-' + n + (limpo ? '-' + limpo : '') + extensao;
}


/* ------------------------------------------------------------
   AS CONVERSAS COM O BANCO
   ------------------------------------------------------------
   Duas vozes, e a diferença importa:

   comoUsuario  → apikey secreta + Bearer da SESSÃO. O papel vem
                  do token da pessoa, então a RLS vale. É a cerca.
   comoServidor → apikey secreta + Bearer da SECRETA. Ignora RLS.
                  Só depois de a cerca ter respondido sim.
   ------------------------------------------------------------ */
function cabecalhos(secreta, bearer, extra) {
  return Object.assign({
    apikey: secreta,
    authorization: 'Bearer ' + bearer,
    accept: 'application/json'
  }, extra || {});
}

async function podeVer(url, secreta, sessao, trabalho) {
  const r = await fetch(url + '/rest/v1/trabalhos'
    + '?select=id&limit=1&id=eq.' + encodeURIComponent(trabalho),
    { headers: cabecalhos(secreta, sessao) });

  if (r.status === 401 || r.status === 403) {
    throw falha('Sua sessão expirou. Entre de novo.', 401);
  }
  if (!r.ok) throw falha('Não consegui ler a apresentação agora.', 502);

  const linhas = await r.json();
  return !!(linhas && linhas[0]);
}

async function podeAlterar(url, secreta, sessao, trabalho) {
  /* Um toque, não uma leitura: `atualizado_em` é exatamente o
     que um salvamento deveria mexer, e a RLS de alteração é
     quem decide se ele acontece. Zero linhas = não pode. */
  const r = await fetch(url + '/rest/v1/trabalhos'
    + '?select=id,autor,cliente,criado_em&id=eq.' + encodeURIComponent(trabalho), {
    method: 'PATCH',
    headers: cabecalhos(secreta, sessao, {
      'content-type': 'application/json',
      prefer: 'return=representation'
    }),
    body: JSON.stringify({ atualizado_em: new Date().toISOString() })
  });

  if (r.status === 401) throw falha('Sua sessão expirou. Entre de novo.', 401);
  if (r.status === 403) throw falha('Essa apresentação não é sua.', 403);
  if (!r.ok) throw falha('Não consegui guardar a foto agora.', 502);

  const linhas = await r.json();
  if (!linhas || !linhas[0]) {
    /* Pode ser "não existe" ou "não é sua". Não distingo de
       propósito: a diferença contaria a quem tentou que a
       apresentação existe. */
    throw falha('Essa apresentação não é sua.', 403);
  }

  return linhas[0];
}

async function perfilDoAutor(url, secreta, autor) {
  const r = await fetch(url + '/rest/v1/perfis'
    + '?select=id,nome,email&limit=1&id=eq.' + encodeURIComponent(autor),
    { headers: cabecalhos(secreta, secreta) });

  if (!r.ok) throw falha('Não consegui ler o perfil do autor.', 502);

  const linhas = await r.json();
  /* Perfil apagado com o trabalho órfão é possível. A pasta
     "sem nome" é pior que nada? Não: é melhor que perder a foto. */
  return (linhas && linhas[0]) || { id: autor, nome: null, email: null };
}

async function reservarPasta(url, secreta, escopo, chave, pasta, nome) {
  const r = await fetch(url + '/rest/v1/rpc/reservar_pasta_drive', {
    method: 'POST',
    headers: cabecalhos(secreta, secreta, { 'content-type': 'application/json' }),
    body: JSON.stringify({
      p_escopo: escopo, p_chave: chave, p_pasta: pasta, p_nome: nome
    })
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error('[foto] reservar_pasta_drive devolveu '
      + r.status + ': ' + t.slice(0, 160));
  }

  const v = await r.json();
  return v === null || v === '' ? null : String(v);
}

async function registrarFoto(url, secreta, lugar, driveId, nome, bytes) {
  const r = await fetch(url + '/rest/v1/rpc/registrar_foto_drive', {
    method: 'POST',
    headers: cabecalhos(secreta, secreta, { 'content-type': 'application/json' }),
    body: JSON.stringify({
      p_trabalho: lugar.trabalho,
      p_ambiente: lugar.ambiente,
      p_ordem:    lugar.ordem,
      p_drive_id: driveId,
      p_nome:     nome,
      p_bytes:    bytes
    })
  });

  if (!r.ok) {
    const t = await r.text();
    /* A foto está no Drive e o banco não sabe onde. A próxima
       tentativa reencontra o arquivo pelo nome (determinístico) e
       registra — por isso ela pode falhar em voz alta aqui. */
    throw new Error('[foto] registrar_foto_drive devolveu '
      + r.status + ': ' + t.slice(0, 160));
  }
}

async function acharFoto(url, secreta, lugar) {
  const r = await fetch(url + '/rest/v1/trabalho_fotos'
    + '?select=drive_id,nome&limit=1'
    + '&trabalho=eq.' + encodeURIComponent(lugar.trabalho)
    + '&ambiente=eq.' + encodeURIComponent(lugar.ambiente)
    + '&ordem=eq.' + encodeURIComponent(lugar.ordem),
    { headers: cabecalhos(secreta, secreta) });

  if (!r.ok) throw falha('Não consegui achar a foto agora.', 502);

  const linhas = await r.json();
  return (linhas && linhas[0]) || null;
}


/* ------------------------------------------------------------ */
function responder(dados, status) {
  return new Response(JSON.stringify(dados), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function falha(publico, status) {
  const e = new Error(publico);
  e.publico = publico;
  e.status = status || 500;
  return e;
}

/* ============================================================
   CONTAS — Dalmóbile  ·  roda no Cloudflare, não no navegador
   ------------------------------------------------------------
   Criar conta exige a chave secreta do Supabase, e chave secreta
   NÃO pode ir para o navegador: quem tem ela passa por cima de
   toda a proteção das tabelas. Então este arquivo roda no
   servidor da Cloudflare, guarda a chave lá e só atende quem já
   entrou e está marcado como admin.

   ONDE ESTE ARQUIVO MORA
   Na raiz do repositório, exatamente neste caminho:

       functions/api/usuarios.js

   A Cloudflare lê a pasta "functions" sozinha e publica este
   arquivo no endereço /api/usuarios. Não precisa configurar
   build, nem instalar nada. A pasta fica ao lado dos html, não
   dentro deles.

   AS DUAS VARIÁVEIS QUE FALTAM
   No painel da Cloudflare: Workers & Pages → seu projeto →
   Settings → Variables and Secrets → Add.

       SUPABASE_URL      https://<id-do-projeto>.supabase.co
       SUPABASE_SECRET   a "secret key" (sb_secret_...)

   Marque "Encrypt" nas duas, principalmente na segunda. Depois
   de salvar, publique de novo (Deployments → Retry deployment),
   porque variável nova só vale para publicação nova.

   A secret key está em Settings → API Keys, na mesma tela de
   onde saiu a publishable. São diferentes de propósito: a
   publishable fica no navegador, esta nunca.

   POR QUE ISSO DISPENSA O SMTP
   A conta é criada já confirmada e com a senha que você define —
   a própria documentação do Supabase diz que esse caminho não
   envia e-mail nenhum. Você entrega a senha pela mão, e a pessoa
   troca depois lá dentro, no rodapé da Central.
   ============================================================ */

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return responder({ erro: 'Esta rota só aceita POST.' }, 405);
  }

  const url = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const secreta = String(env.SUPABASE_SECRET || '').trim();

  if (!url || !secreta) {
    return responder({
      erro: 'Faltam as variáveis SUPABASE_URL e SUPABASE_SECRET no painel da ' +
            'Cloudflare. Depois de criar as duas, publique o site de novo.'
    }, 500);
  }

  let corpo;
  try {
    corpo = await request.json();
  } catch (e) {
    return responder({ erro: 'Pedido mal formado.' }, 400);
  }

  /* --- quem está pedindo --- */

  const token = String(request.headers.get('Authorization') || '')
    .replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return responder({ erro: 'Sua sessão não veio no pedido. Recarregue a página.' }, 401);
  }

  const eu = await quemSou(url, secreta, token);
  if (!eu) {
    return responder({ erro: 'Sua sessão expirou. Recarregue a página e entre de novo.' }, 401);
  }

  /* Quem manda é o banco, não a tela: mesmo que alguém chame esta
     rota na mão, sem admin = true no perfil não passa daqui. */
  if (!(await souAdmin(url, secreta, eu.id))) {
    return responder({ erro: 'Esta área é só do administrador.' }, 403);
  }

  try {
    return await executar(String(corpo.acao || ''), corpo, { url, secreta, eu });
  } catch (e) {
    return responder({ erro: e.message || 'Deu errado aqui no servidor.' },
                     e.status || 500);
  }
}


/* ------------------------------------------------------------
   As ações
   ------------------------------------------------------------ */

async function executar(acao, corpo, ctx) {
  if (acao === 'listar')  return await listar(ctx);
  if (acao === 'criar')   return await criar(corpo, ctx);
  if (acao === 'senha')   return await novaSenha(corpo, ctx);
  if (acao === 'perfil')  return await salvarPerfil(corpo, ctx);
  if (acao === 'admin')   return await marcarAdmin(corpo, ctx);
  if (acao === 'acesso')  return await mudarAcesso(corpo, ctx);
  if (acao === 'apagar')  return await apagar(corpo, ctx);

  throw falha('Ação desconhecida: ' + acao, 400);
}


/* --- lista as contas, juntando as três fontes --- */

async function listar({ url, secreta, eu }) {
  const [contas, perfis, trabalhos] = await Promise.all([
    todasAsContas(url, secreta),
    perfisComCargo(url, secreta),
    sb(url, secreta, '/rest/v1/trabalhos?select=autor&limit=5000')
  ]);

  const porId = {};
  (perfis || []).forEach((p) => { porId[p.id] = p; });

  const quantos = {};
  (trabalhos || []).forEach((t) => {
    quantos[t.autor] = (quantos[t.autor] || 0) + 1;
  });

  const agora = Date.now();

  const lista = contas.map((c) => {
    const p = porId[c.id] || {};
    const ate = c.banned_until ? Date.parse(c.banned_until) : 0;

    return {
      id: c.id,
      email: c.email || '',
      nome: p.nome || '',
      loja: p.loja || '',
      admin: p.admin === true,
      gerente: p.gerente === true,
      bloqueado: !!(ate && ate > agora),
      criado_em: c.created_at || null,
      ultimo_acesso: c.last_sign_in_at || null,
      trabalhos: quantos[c.id] || 0,
      sou_eu: c.id === eu.id
    };
  });

  /* Admins primeiro, depois alfabético — a lista fica igual
     todas as vezes, e a sua conta é fácil de achar. */
  lista.sort((a, b) => {
    if (a.admin !== b.admin) return a.admin ? -1 : 1;
    return (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR');
  });

  return responder({ contas: lista, eu: eu.id });
}

/* A coluna gerente nasceu depois desta tela. Onde o
   supabase-cargos.sql ainda não rodou, pedir por ela derrubaria a
   lista inteira — e perder a tela de contas por causa de um selo
   seria troca ruim. Sem a coluna, todo mundo vem sem gerência. */
async function perfisComCargo(url, secreta) {
  try {
    return await sb(url, secreta, '/rest/v1/perfis?select=id,nome,loja,admin,gerente');
  } catch (e) {
    return await sb(url, secreta, '/rest/v1/perfis?select=id,nome,loja,admin');
  }
}

/* A Admin API devolve de página em página. Com 8 contas isso nunca
   passa da primeira, mas a volta extra custa nada e evita a lista
   silenciosamente cortada quando a equipe crescer. */
async function todasAsContas(url, secreta) {
  const porPagina = 100;
  let pagina = 1;
  let todas = [];

  while (pagina <= 10) {
    const r = await sb(url, secreta,
      '/auth/v1/admin/users?page=' + pagina + '&per_page=' + porPagina);

    const lote = (r && r.users) || [];
    todas = todas.concat(lote);

    if (lote.length < porPagina) break;
    pagina++;
  }

  return todas;
}


/* --- cria a conta, já confirmada e com senha --- */

async function criar(corpo, { url, secreta }) {
  const email = String(corpo.email || '').trim().toLowerCase();
  const senha = String(corpo.senha || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw falha('Esse e-mail não parece certo. Confira antes de criar.', 400);
  }
  if (senha.length < 8) {
    throw falha('A senha precisa ter pelo menos 8 caracteres.', 400);
  }

  const nova = await sb(url, secreta, '/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: email,
      password: senha,
      email_confirm: true   // já confirmada: nenhum e-mail sai do Supabase
    })
  });

  if (!nova || !nova.id) {
    throw falha('O Supabase criou a conta mas não devolveu o identificador. ' +
                'Atualize a lista para conferir.', 502);
  }

  /* O gatilho do banco já criou o perfil. Aqui só completamos o
     que ele não tem como saber: nome bonito, loja e se é admin.
     O nome sai do e-mail quando você não digita um. */
  const campos = {
    nome: String(corpo.nome || '').trim() || nomeDoEmail(email),
    loja: String(corpo.loja || '').trim() || null,
    admin: corpo.admin === true
  };

  try {
    await sb(url, secreta, '/rest/v1/perfis?id=eq.' + conferirId(nova.id), {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify(campos)
    });
  } catch (e) {
    /* A conta já existe e funciona; só o enfeite falhou. Dizer que
       deu errado aqui faria você criar a conta duas vezes. */
    return responder({
      ok: true, id: nova.id, email: email,
      aviso: 'A conta foi criada, mas não consegui gravar o nome e a loja. ' +
             'Ajuste na lista depois.'
    });
  }

  return responder({ ok: true, id: nova.id, email: email });
}


/* --- define uma senha nova para alguém (o lugar do "esqueci") --- */

async function novaSenha(corpo, { url, secreta }) {
  const id = conferirId(corpo.id);
  const senha = String(corpo.senha || '');

  if (senha.length < 8) {
    throw falha('A senha precisa ter pelo menos 8 caracteres.', 400);
  }

  await sb(url, secreta, '/auth/v1/admin/users/' + id, {
    method: 'PUT',
    body: JSON.stringify({ password: senha })
  });

  return responder({ ok: true });
}


/* --- nome e loja --- */

async function salvarPerfil(corpo, { url, secreta }) {
  const id = conferirId(corpo.id);

  const campos = {};
  if (typeof corpo.nome === 'string') campos.nome = corpo.nome.trim() || null;
  if (typeof corpo.loja === 'string') campos.loja = corpo.loja.trim() || null;

  if (!Object.keys(campos).length) {
    throw falha('Nada para mudar.', 400);
  }

  await sb(url, secreta, '/rest/v1/perfis?id=eq.' + id, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify(campos)
  });

  return responder({ ok: true });
}


/* --- liga e desliga o administrador --- */

async function marcarAdmin(corpo, { url, secreta, eu }) {
  const id = conferirId(corpo.id);
  const valor = corpo.valor === true;

  /* Tirar o próprio admin é a única porta que tranca por fora:
     sem ninguém admin, esta tela deixa de abrir para todos e só
     volta pelo SQL Editor. */
  if (id === eu.id && !valor) {
    throw falha('Você não pode tirar o seu próprio acesso de administrador. ' +
                'Marque outra pessoa primeiro.', 400);
  }

  await sb(url, secreta, '/rest/v1/perfis?id=eq.' + id, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ admin: valor })
  });

  return responder({ ok: true });
}


/* --- bloqueia e libera a entrada, sem apagar nada --- */

async function mudarAcesso(corpo, { url, secreta, eu }) {
  const id = conferirId(corpo.id);
  const bloquear = corpo.bloquear === true;

  if (id === eu.id && bloquear) {
    throw falha('Você não pode bloquear a si mesmo.', 400);
  }

  /* 'none' tira o bloqueio; o prazo longo equivale a bloquear sem
     prazo. É isto que se usa quando alguém sai da loja: a entrada
     fecha e as apresentações ficam todas lá. */
  await sb(url, secreta, '/auth/v1/admin/users/' + id, {
    method: 'PUT',
    body: JSON.stringify({ ban_duration: bloquear ? '876000h' : 'none' })
  });

  return responder({ ok: true });
}


/* --- apaga de vez (leva os trabalhos junto) --- */

async function apagar(corpo, { url, secreta, eu }) {
  const id = conferirId(corpo.id);

  if (id === eu.id) {
    throw falha('Você não pode apagar a sua própria conta.', 400);
  }

  /* A tela mostra quantas apresentações vão embora e pede para
     confirmar. Sem essa confirmação explícita, aqui não apaga —
     o estrago é definitivo e o banco apaga em cascata. */
  if (corpo.confirmo !== true) {
    throw falha('Falta confirmar a exclusão.', 400);
  }

  await sb(url, secreta, '/auth/v1/admin/users/' + id, { method: 'DELETE' });

  return responder({ ok: true });
}


/* ------------------------------------------------------------
   Conversa com o Supabase
   ------------------------------------------------------------ */

/* Chamada com a chave secreta: passa por cima das regras das
   tabelas, e é por isso que tudo acima dela confere o admin. */
async function sb(url, secreta, caminho, opcoes) {
  const o = opcoes || {};

  const r = await fetch(url + caminho, {
    method: o.method || 'GET',
    body: o.body,
    headers: Object.assign({
      apikey: secreta,
      authorization: 'Bearer ' + secreta,
      'content-type': 'application/json'
    }, o.headers || {})
  });

  const texto = await r.text();

  let dados = null;
  if (texto) {
    try { dados = JSON.parse(texto); } catch (e) { dados = { msg: texto }; }
  }

  if (!r.ok) throw falha(traduzir(dados, r.status), r.status >= 500 ? 502 : 400);

  return dados;
}

/* Confere a sessão de quem chamou usando o token DELE, não a chave
   secreta — é o que garante que o pedido veio de alguém que entrou. */
async function quemSou(url, secreta, token) {
  try {
    const r = await fetch(url + '/auth/v1/user', {
      headers: { apikey: secreta, authorization: 'Bearer ' + token }
    });
    if (!r.ok) return null;

    const u = await r.json();
    return (u && u.id) ? u : null;
  } catch (e) {
    return null;
  }
}

async function souAdmin(url, secreta, id) {
  try {
    const linhas = await sb(url, secreta,
      '/rest/v1/perfis?select=admin&id=eq.' + conferirId(id));
    return !!(linhas && linhas[0] && linhas[0].admin === true);
  } catch (e) {
    return false;   // na dúvida, não é admin
  }
}


/* ------------------------------------------------------------
   Miudezas
   ------------------------------------------------------------ */

function responder(dados, status) {
  return new Response(JSON.stringify(dados), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function falha(mensagem, status) {
  const e = new Error(mensagem);
  e.status = status || 500;
  return e;
}

/* O id entra no endereço da chamada, então ele é conferido antes —
   nada que não seja um uuid passa daqui. */
function conferirId(valor) {
  const id = String(valor || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    throw falha('Conta inválida.', 400);
  }
  return id;
}

/* Mesma regra do supabase-nomes.sql: o que vem antes do @, com as
   primeiras letras maiúsculas. */
function nomeDoEmail(email) {
  return String(email || '').split('@')[0]
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((p) => p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '')
    .join(' ');
}

/* As mensagens do Supabase chegam em inglês e algumas assustam à toa */
function traduzir(dados, status) {
  const m = String(
    (dados && (dados.msg || dados.message || dados.error_description ||
               dados.error || dados.hint)) || ''
  );

  if (/already been registered|already exists|duplicate key/i.test(m)) {
    return 'Já existe uma conta com esse e-mail.';
  }
  if (/password.*(short|least|weak)|weak_password/i.test(m)) {
    return 'Essa senha é curta ou fraca demais. Tente uma mais longa.';
  }
  if (/invalid.*email|email_address_invalid/i.test(m)) {
    return 'Esse e-mail não foi aceito pelo Supabase.';
  }
  if (/user not found|not_found/i.test(m) || status === 404) {
    return 'Essa conta não existe mais. Atualize a lista.';
  }
  if (/invalid api key|api key/i.test(m) || status === 401) {
    return 'A chave secreta no Cloudflare não foi aceita. Confira o valor de ' +
           'SUPABASE_SECRET e publique o site de novo.';
  }
  if (/relation .* does not exist/i.test(m)) {
    return 'As tabelas ainda não existem no Supabase. Rode o supabase.sql.';
  }
  if (status >= 500) {
    return 'O Supabase está fora do ar no momento. Tente de novo em instantes.';
  }

  return m || ('O Supabase recusou o pedido (erro ' + status + ').');
}

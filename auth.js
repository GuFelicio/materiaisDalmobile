/* ============================================================
   TRAVA DE ENTRADA — Dalmóbile
   ------------------------------------------------------------
   Carregado por TODAS as páginas da Central. Quem não fez login
   não usa nenhuma delas, inclusive colando o endereço direto de
   projeto.html ou orcamento.html.

   O QUE ISSO PROTEGE, E O QUE NÃO PROTEGE
   Protege o uso das ferramentas. NÃO protege os arquivos soltos
   ao lado delas (bases-sjc.pdf, as fontes), que continuam
   baixando por URL direta, nem os links do Drive e os endereços
   do Apps Script, que vivem no Google. Isso é cerca, não cofre —
   e é o combinado.

   CONTAS
   São por convite. No painel do Supabase, em Authentication →
   Users → Invite user, você cadastra o e-mail; a pessoa recebe o
   convite e define a própria senha. Com o cadastro aberto
   desligado (Providers → Email → Allow new users to sign up),
   ninguém cria conta sozinho.

   ONDE PEGAR OS DOIS VALORES ABAIXO
   url   → botão "Connect", no topo do painel do projeto. É o
           endereço https://<id-do-projeto>.supabase.co
   chave → Settings → API Keys. Pegue a "publishable key", que
           começa com sb_publishable_. Se o projeto só mostrar a
           "anon key" antiga, ela também funciona — mas a Supabase
           vai aposentar as antigas, então prefira a nova quando
           as duas aparecerem.

   A CHAVE ABAIXO É PÚBLICA DE PROPÓSITO
   Ela foi feita para ficar no navegador e não dá acesso a dado
   nenhum sozinha — quem libera ou nega leitura é a política de
   cada tabela, no servidor. Pode subir para o GitHub sem medo.
   As que NUNCA entram aqui são a "secret key" (sb_secret_...) e a
   antiga "service_role"; essas passam por cima de tudo.
   ============================================================ */

const AUTH = {
  url:  'https://voskzxjvoqxflefpsjla.supabase.co',
  chave: 'sb_publishable_26bPTN_WZbfINc38ICv6Fw_wQCckTOP',

  /* Texto da tela de entrada */
  titulo: 'Central de Peças',
  subtitulo: 'Entre com o e-mail da loja para usar os materiais.'
};


/* ------------------------------------------------------------
   A página começa escondida (cada arquivo tem a trava no <head>)
   e só aparece quando a sessão é confirmada. Se este script não
   carregar, nada aparece — falha fechando, que é o certo para
   uma trava.
   ------------------------------------------------------------ */

(function () {
  'use strict';

  /* A página de criar senha nova carrega este arquivo só para
     reaproveitar o endereço e a chave. Quem cai lá está, por
     definição, sem senha para entrar — então a trava não vale. */
  if (window.AUTH_SEM_TRAVA) return;

  if (!window.supabase || !window.supabase.createClient) {
    mostrarAviso('A biblioteca de login não carregou. Recarregue a página.');
    return;
  }

  const cliente = window.supabase.createClient(AUTH.url, AUTH.chave, {
    auth: {
      persistSession: true,       // guarda a sessão no navegador
      autoRefreshToken: true,     // renova sozinha, sem novo login
      detectSessionInUrl: true    // completa a entrada pelo link de e-mail
    }
  });

  window.dalmobileAuth = { cliente: cliente, usuario: null };

  iniciar();

  async function iniciar() {
    let sessao = null;

    try {
      const r = await cliente.auth.getSession();
      sessao = r.data ? r.data.session : null;
    } catch (e) {
      console.error(e);
    }

    if (sessao) return liberar(sessao);

    montarEntrada();
    destravar();   // mostra a página só com a tela de entrada por cima

    cliente.auth.onAuthStateChange((evento, nova) => {
      if (nova && (evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED')) {
        liberar(nova);
      }
    });
  }

  function liberar(sessao) {
    window.dalmobileAuth.usuario = sessao.user;

    const tela = document.getElementById('tela-entrada');
    if (tela) tela.remove();

    destravar();
    montarSair(sessao.user);

    /* A limpeza tira os pedaços de token que o link de e-mail
       deixa no endereço, para não ficarem no histórico. */
    if (location.hash.indexOf('access_token') !== -1) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function destravar() {
    const trava = document.getElementById('trava-entrada');
    if (trava) trava.remove();
    document.documentElement.style.visibility = '';
  }

  function mostrarAviso(texto) {
    document.documentElement.style.visibility = '';
    const trava = document.getElementById('trava-entrada');
    if (trava) trava.remove();
    document.body.innerHTML =
      '<p style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;' +
      'max-width:420px;margin:80px auto;padding:0 20px;color:#4a5054">' +
      texto + '</p>';
  }


  /* ------------------------------------------------------------
     Tela de entrada
     ------------------------------------------------------------ */

  function montarEntrada() {
    const estilo = document.createElement('style');
    estilo.textContent = `
      #tela-entrada {
        position: fixed; inset: 0; z-index: 9999;
        background: #f2f2f0;
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
        font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      #tela-entrada .auth-caixa {
        width: 100%; max-width: 360px;
        background: #fff; border: 1px solid #e0e1df;
        border-radius: 14px; padding: 28px 24px;
      }
      /* position/opacity vão declarados porque as páginas têm uma
         regra .tracos posicionada no canto — classe diferente já
         resolve, mas o reset deixa a tela imune a futuras. */
      #tela-entrada .auth-tracos {
        position: static; opacity: 1;
        display: flex; gap: 4px; margin-bottom: 16px;
      }
      #tela-entrada .auth-tracos i {
        position: static;
        width: 16px; height: 2px; background: #141618; display: block;
      }
      #tela-entrada .auth-tracos i:nth-child(2) { width: 9px; opacity: .55; }
      #tela-entrada .auth-tracos i:nth-child(3) { width: 5px; opacity: .3; }
      #tela-entrada h1 {
        font-size: 19px; font-weight: 700; color: #141618;
        margin: 0 0 6px; letter-spacing: -0.01em;
      }
      #tela-entrada p.auth-sub {
        font-size: 13px; line-height: 1.5; color: #8a9094; margin: 0 0 22px;
      }
      #tela-entrada label {
        display: block; font-size: 12px; font-weight: 600;
        color: #4a5054; margin: 0 0 5px;
      }
      #tela-entrada input {
        width: 100%; box-sizing: border-box; margin-bottom: 14px;
        padding: 12px 13px; font-size: 15px; font-family: inherit;
        border: 1px solid #c9cbc8; border-radius: 9px; background: #fff;
        color: #141618;
      }
      #tela-entrada input:focus {
        outline: none; border-color: #141618;
      }
      #tela-entrada button {
        width: 100%; padding: 14px; border: 0; border-radius: 9px;
        background: #141618; color: #fff;
        font-size: 15px; font-weight: 600; font-family: inherit;
        cursor: pointer;
      }
      #tela-entrada button:disabled { opacity: .45; cursor: default; }
      #tela-entrada button.auth-vazado {
        background: none; color: #4a5054;
        border: 1px solid #c9cbc8; margin-top: 10px;
      }
      #tela-entrada .auth-recado {
        margin: 16px 0 0; font-size: 13px; line-height: 1.5;
        color: #4a5054;
      }
      #tela-entrada .auth-recado.erro { color: #b3261e; }
      #tela-entrada .auth-recado.ok   { color: #1c6b3f; }
      #tela-entrada .auth-esqueci {
        display: block; width: 100%; margin-top: 14px;
        background: none; border: 0; padding: 0;
        font-size: 12px; color: #8a9094; font-family: inherit;
        text-align: center; cursor: pointer;
      }
      #tela-entrada .auth-esqueci:hover { color: #141618; }
    `;
    document.head.appendChild(estilo);

    const tela = document.createElement('div');
    tela.id = 'tela-entrada';
    tela.innerHTML = `
      <div class="auth-caixa">
        <div class="auth-tracos"><i></i><i></i><i></i></div>
        <h1>${AUTH.titulo}</h1>
        <p class="auth-sub">${AUTH.subtitulo}</p>

        <label for="auth-email">E-mail</label>
        <input id="auth-email" type="email" autocomplete="username"
               placeholder="voce@dalmobilesjc.com.br">

        <label for="auth-senha">Senha</label>
        <input id="auth-senha" type="password" autocomplete="current-password"
               placeholder="••••••••">

        <button id="auth-entrar" type="button">Entrar</button>
        <button id="auth-link" class="auth-vazado" type="button">Entrar por link no e-mail</button>
        <button id="auth-esqueci" class="auth-esqueci" type="button">Esqueci minha senha</button>

        <p class="auth-recado" id="auth-recado"></p>
      </div>`;
    document.body.appendChild(tela);

    const email = document.getElementById('auth-email');
    const senha = document.getElementById('auth-senha');
    const recado = document.getElementById('auth-recado');
    const botoes = tela.querySelectorAll('button');

    const dizer = (texto, classe) => {
      recado.textContent = texto;
      recado.className = 'auth-recado' + (classe ? ' ' + classe : '');
    };

    const travarBotoes = (v) => botoes.forEach((b) => { b.disabled = v; });

    const precisaEmail = () => {
      const v = email.value.trim();
      if (!v) { dizer('Escreva o seu e-mail primeiro.', 'erro'); email.focus(); }
      return v;
    };

    /* --- entrar com senha --- */
    document.getElementById('auth-entrar').addEventListener('click', async () => {
      const v = precisaEmail();
      if (!v) return;
      if (!senha.value) { dizer('Escreva a sua senha.', 'erro'); senha.focus(); return; }

      travarBotoes(true);
      dizer('Entrando...');

      const { error } = await cliente.auth.signInWithPassword({
        email: v, password: senha.value
      });

      if (error) {
        travarBotoes(false);
        dizer(traduzir(error), 'erro');
      }
      /* Dando certo, o onAuthStateChange libera a página sozinho. */
    });

    /* --- entrar por link --- */
    document.getElementById('auth-link').addEventListener('click', async () => {
      const v = precisaEmail();
      if (!v) return;

      travarBotoes(true);
      dizer('Enviando...');

      const { error } = await cliente.auth.signInWithOtp({
        email: v,
        options: {
          shouldCreateUser: false,          // conta é só por convite
          emailRedirectTo: location.href
        }
      });

      travarBotoes(false);
      dizer(error ? traduzir(error)
                  : 'Pronto. Abra o link que chegou no seu e-mail, nesta mesma máquina.',
            error ? 'erro' : 'ok');
    });

    /* --- esqueci a senha --- */
    document.getElementById('auth-esqueci').addEventListener('click', async () => {
      const v = precisaEmail();
      if (!v) return;

      travarBotoes(true);
      dizer('Enviando...');

      const { error } = await cliente.auth.resetPasswordForEmail(v, {
        redirectTo: location.origin + '/nova-senha.html'
      });

      travarBotoes(false);
      dizer(error ? traduzir(error)
                  : 'Enviei um link para você criar uma senha nova.',
            error ? 'erro' : 'ok');
    });

    /* Enter em qualquer campo tenta entrar */
    [email, senha].forEach((campo) => {
      campo.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') document.getElementById('auth-entrar').click();
      });
    });

    email.focus();
  }

  /* As mensagens do Supabase vêm em inglês e algumas assustam à toa */
  function traduzir(error) {
    const m = String(error && error.message || error);

    if (/Invalid login credentials/i.test(m)) {
      return 'E-mail ou senha não conferem.';
    }
    if (/Email not confirmed/i.test(m)) {
      return 'Essa conta ainda não foi confirmada. Procure o convite no seu e-mail.';
    }
    if (/Signups not allowed|not allowed for otp|User not found/i.test(m)) {
      return 'Esse e-mail não está cadastrado. Peça para o Gu liberar o seu acesso.';
    }
    if (/rate limit|too many/i.test(m)) {
      return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
    }
    if (/fetch|network/i.test(m)) {
      return 'Sem conexão com o servidor de login. Verifique a internet.';
    }
    return m;
  }


  /* ------------------------------------------------------------
     Botão de sair, discreto, no rodapé de quem está dentro
     ------------------------------------------------------------ */

  function montarSair(usuario) {
    if (document.getElementById('auth-sair')) return;

    const estilo = document.createElement('style');
    estilo.textContent = `
      #auth-sair {
        display: flex; align-items: center; justify-content: center;
        gap: 8px; flex-wrap: wrap;
        margin: 0 0 28px; font-size: 12px; color: #8a9094;
        font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      #auth-sair button {
        background: none; border: 0; padding: 0;
        font-size: 12px; font-family: inherit; color: #8a9094;
        text-decoration: underline; cursor: pointer;
      }
      #auth-sair button:hover { color: #141618; }
    `;
    document.head.appendChild(estilo);

    const barra = document.createElement('div');
    barra.id = 'auth-sair';
    barra.innerHTML =
      '<span>' + (usuario.email || '') + '</span><button type="button">sair</button>';

    barra.querySelector('button').addEventListener('click', async () => {
      await cliente.auth.signOut();
      location.reload();
    });

    const rodape = document.querySelector('.rodape');
    if (rodape && rodape.parentNode) rodape.parentNode.insertBefore(barra, rodape);
    else document.body.appendChild(barra);
  }

})();

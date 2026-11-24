/* ============================================================
   TRABALHOS SALVOS — Dalmóbile
   ------------------------------------------------------------
   Guarda e devolve a FICHA de cada apresentação e orçamento:
   cliente, loja, ambientes, valores, descrições e o orçamento já
   conferido. O PDF não é guardado — ele é montado na hora. Assim
   um trabalho antigo reaberto sai já com a diagramação nova.

   AS FOTOS NÃO SOBEM. Guardamos só nome e tamanho de cada
   arquivo. Ao reabrir, a pessoa aponta a pasta do projeto e esta
   página casa os arquivos sozinha, avisando o que não achou.
   Isso mantém o custo em zero e evita duas cópias da mesma foto.

   Depende do auth.js (sessão) e da biblioteca do Supabase.
   ============================================================ */

const DADOS = (function () {
  'use strict';

  const cliente = () =>
    (window.dalmobileAuth && window.dalmobileAuth.cliente) || null;

  const usuario = () =>
    (window.dalmobileAuth && window.dalmobileAuth.usuario) || null;

  function exigirSessao() {
    const c = cliente();
    if (!c) throw new Error('Sessão não encontrada. Recarregue a página e entre de novo.');
    return c;
  }

  /* --------------------------------------------------------
     Gravar
     -------------------------------------------------------- */

  /**
   * Cria ou atualiza. Passando um id, atualiza aquele trabalho;
   * sem id, cria um novo e devolve o id para a tela guardar.
   */
  async function salvar(trabalho, id) {
    const c = exigirSessao();
    const u = usuario();

    const linha = {
      tipo:      trabalho.tipo,
      loja:      trabalho.loja,
      cliente:   String(trabalho.cliente || '').trim(),
      arquiteto: String(trabalho.arquiteto || '').trim() || null,
      dados:     trabalho.dados || {}
    };

    if (id) {
      const { data, error } = await c
        .from('trabalhos').update(linha).eq('id', id).select('id').single();
      if (error) throw new Error(traduzir(error));
      return data.id;
    }

    linha.autor = u ? u.id : undefined;

    const { data, error } = await c
      .from('trabalhos').insert(linha).select('id').single();
    if (error) throw new Error(traduzir(error));
    return data.id;
  }

  /* --------------------------------------------------------
     Ler
     -------------------------------------------------------- */

  /* --------------------------------------------------------
     Quem sou eu, e o que eu posso ver
     -------------------------------------------------------- */

  let meuPerfilCache = null;

  async function meuPerfil() {
    if (meuPerfilCache) return meuPerfilCache;

    const c = exigirSessao();
    const u = usuario();
    if (!u) return { admin: false };

    const { data, error } = await c
      .from('perfis').select('id, email, nome, loja, admin, gerente').eq('id', u.id).single();

    /* Perfil ausente não é motivo para travar a página — a pessoa
       só não é administradora. */
    meuPerfilCache = (error || !data) ? { id: u.id, email: u.email, admin: false } : data;
    return meuPerfilCache;
  }

  async function souAdmin() {
    const p = await meuPerfil();
    return p.admin === true;
  }

  async function souGerente() {
    const p = await meuPerfil();
    return p.gerente === true;
  }

  /* A pergunta que as listas realmente fazem.
     ------------------------------------------------------------
     Elas perguntavam "sou administrador?" para decidir se mostram
     de quem é cada trabalho. Errado desde que o cargo de gerência
     existe: o gerente TAMBÉM vê o trabalho dos outros, só que
     limitado à loja dele — e via a lista sem nome em cima de
     nada, sem entender por quê.

     Quem enxerga trabalho alheio é quem precisa saber de quem
     ele é. É esta a pergunta. */
  async function vejoDeOutros() {
    const p = await meuPerfil();
    return p.admin === true || p.gerente === true;
  }

  /* Nome de exibição de cada autor.
     O banco decide quem alcança qual perfil: pode_ver_perfil()
     libera o próprio, tudo para o administrador, e a loja inteira
     para o gerente. Quem não alcança recebe mapa vazio e a tela
     fica sem o selo — que é o lado certo de errar. */
  async function autores(ids) {
    const c = exigirSessao();
    const unicos = Array.from(new Set((ids || []).filter(Boolean)));
    if (!unicos.length) return {};

    const { data, error } = await c
      .from('perfis').select('id, email, nome').in('id', unicos);

    if (error || !data) return {};

    const mapa = {};
    data.forEach((p) => {
      mapa[p.id] = (p.nome && p.nome.trim()) || p.email || 'sem nome';
    });
    return mapa;
  }

  /* Lista de consultores, para o filtro do administrador */
  async function listaDeConsultores() {
    const c = exigirSessao();
    const { data, error } = await c
      .from('perfis').select('id, email, nome').order('email');
    if (error || !data) return [];
    return data.map((p) => ({
      id: p.id,
      nome: (p.nome && p.nome.trim()) || p.email || 'sem nome'
    }));
  }

  async function listar(tipo, busca, autorId) {
    const c = exigirSessao();
    const u = usuario();

    let q = c.from('trabalhos')
      .select('id, tipo, loja, cliente, arquiteto, criado_em, atualizado_em, autor')
      .order('atualizado_em', { ascending: false })
      .limit(200);

    if (tipo) q = q.eq('tipo', tipo);
    if (busca && busca.trim()) q = q.ilike('cliente', '%' + busca.trim() + '%');
    if (autorId) q = q.eq('autor', autorId);

    const { data, error } = await q;
    if (error) throw new Error(traduzir(error));

    const linhas = data || [];

    /* Marca o que é meu e, para o administrador, de quem é o resto */
    const nomes = await autores(linhas.map((l) => l.autor));

    linhas.forEach((l) => {
      l.meu = !!(u && l.autor === u.id);
      l.autorNome = nomes[l.autor] || (l.meu ? 'você' : '');
    });

    return linhas;
  }

  async function abrir(id) {
    const c = exigirSessao();
    const { data, error } = await c
      .from('trabalhos').select('*').eq('id', id).single();
    if (error) throw new Error(traduzir(error));
    return data;
  }

  async function apagar(id) {
    const c = exigirSessao();
    const { error } = await c.from('trabalhos').delete().eq('id', id);
    if (error) throw new Error(traduzir(error));
  }

  /* --------------------------------------------------------
     Fotos: guardamos a identidade, não o arquivo
     -------------------------------------------------------- */

  const marcarFoto = (arquivo) => ({
    nome: arquivo.name,
    tamanho: arquivo.size
  });

  /**
   * Recebe os arquivos que a pessoa escolheu ao reabrir e devolve
   * um índice para procurar por nome. O tamanho entra como
   * desempate quando há arquivos de mesmo nome em pastas
   * diferentes.
   */
  function indexar(arquivos) {
    const porChave = new Map();
    const porNome = new Map();

    for (const a of arquivos) {
      porChave.set(a.name + '|' + a.size, a);
      if (!porNome.has(a.name)) porNome.set(a.name, []);
      porNome.get(a.name).push(a);
    }

    return {
      achar(marca) {
        if (!marca || !marca.nome) return null;

        const exato = porChave.get(marca.nome + '|' + marca.tamanho);
        if (exato) return exato;

        /* Mesmo nome e tamanho diferente: o arquivo foi reexportado.
           Aceita, porque é a foto certa, só que mexida. */
        const iguais = porNome.get(marca.nome);
        return iguais && iguais.length ? iguais[0] : null;
      }
    };
  }

  /* --------------------------------------------------------
     Mensagens
     -------------------------------------------------------- */

  function traduzir(error) {
    const m = String((error && (error.message || error.hint)) || error);

    if (/row-level security|violates row-level/i.test(m)) {
      return 'Esse trabalho não é seu, então não dá para alterar. ' +
             'Peça para quem montou, ou para o Gu.';
    }
    if (/relation .* does not exist|schema cache/i.test(m)) {
      return 'As tabelas ainda não foram criadas no Supabase. ' +
             'Rode o supabase.sql no SQL Editor.';
    }
    if (/JWT|not authenticated|session/i.test(m)) {
      return 'Sua sessão expirou. Recarregue a página e entre de novo.';
    }
    if (/fetch|network/i.test(m)) {
      return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
    }
    return m;
  }

  /* --------------------------------------------------------
     OS CLIENTES QUE JÁ EXISTEM
     --------------------------------------------------------
     Para a tela oferecer a lista em vez de campo livre. Ninguém
     digita igual duas vezes, e "Carlos e Bia" digitado de duas
     formas vira dois clientes para o sistema: duas pastas no
     Drive, cada uma com metade dos projetos, as duas parecendo
     certas para quem olha.

     ⚠️ A DEDUPLICAÇÃO USA A MESMA `chaveDe` DO lib/drive.js, e
     tem de usar: é ela que decide em qual pasta a foto entra. Se
     a lista agrupasse por uma regra e o Drive por outra, a pessoa
     escolheria um cliente da lista e o Drive criaria outra pasta
     — e nada ligaria as duas coisas. Por isso a função mora num
     arquivo só, e por isso aqui ela é EXIGIDA em vez de ter
     cópia local: cópia é o que envelhece em direção diferente.

     O `import()` dinâmico, e não uma variável global posta pela
     página: módulo é carregado depois dos scripts clássicos, e um
     global dependeria de a página ter terminado de carregar antes
     desta função rodar. "Normalmente terminou" não é garantia —
     é um defeito que aparece uma vez em vinte, na máquina lenta
     da loja, e nunca na minha.

     A RLS faz a parte dela: `trabalhos` já só devolve o que a
     pessoa pode ver, então a lista do consultor é a dele e a do
     gerente é a da loja. Não há filtro de permissão aqui porque
     não deve haver — seria uma segunda cópia da regra.
     -------------------------------------------------------- */
  async function clientesConhecidos(tipo) {
    const c = exigirSessao();

    const { chaveDe } = await import('./lib/chave.js');

    /* Espera a sessão antes de perguntar. O `window.dalmobileAuth`
       é montado na hora, mas o TOKEN vem de um getSession() que
       ainda está no ar — e consulta sem token volta vazia, sem
       erro. A lista apareceria vazia e o seletor convidaria a
       cadastrar de novo um cliente que já existe, que é
       exatamente o defeito que ele veio impedir. */
    await c.auth.getSession();

    let q = c.from('trabalhos')
      .select('cliente, atualizado_em')
      .order('atualizado_em', { ascending: false })
      .limit(500);

    if (tipo) q = q.eq('tipo', tipo);

    const { data, error } = await q;
    if (error) throw new Error(traduzir(error));

    /* A grafia que fica é a MAIS RECENTE — a lista vem ordenada
       por atualizado_em, então o primeiro de cada chave ganha. É
       a que a pessoa acabou de usar e reconhece. A pasta no Drive
       pode ter o nome de uma grafia antiga, e isso não importa:
       lá a identidade é o id, não o nome. */
    const vistos = new Map();

    (data || []).forEach(function (l) {
      const nome = String(l.cliente || '').trim();
      if (!nome) return;
      const k = chaveDe(nome);
      if (!k || vistos.has(k)) return;
      vistos.set(k, nome);
    });

    return Array.from(vistos.values())
      .sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  }


  /* --------------------------------------------------------
     AS FOTOS NO DRIVE
     --------------------------------------------------------
     Até aqui este arquivo dizia, com razão: AS FOTOS NÃO SOBEM.
     Agora sobem — para o Drive da Dalmóbile, não para o banco.
     A diferença importa: o plano grátis do Supabase tem 1 GB e,
     passando dele, restringe o projeto; a conta da Dalmóbile tem
     5 TB já pagos. Uma apresentação de 20 fotos é 10 MB.

     O que NÃO mudou: a reposição pelo nome continua de pé, e é
     ela que atende as apresentações salvas antes disto.

     ⚠️ O id do arquivo no Drive não chega aqui, nunca. Pedimos a
     foto pelo LUGAR dela — trabalho + ambiente + ordem — e quem
     responde "você pode?" é a RLS de `trabalhos`, lá no
     /api/foto. Se o navegador soubesse o id, bastaria tentar ids
     até achar o projeto de outra loja.
     -------------------------------------------------------- */

  async function tokenDaSessao() {
    const c = exigirSessao();
    const se = await c.auth.getSession();
    const t = se && se.data && se.data.session && se.data.session.access_token;
    if (!t) throw new Error('Sua sessão expirou. Entre de novo.');
    return t;
  }

  /* Sobe o que ainda não está lá.

     NUNCA ESTOURA. Quem chama isto acabou de salvar a
     apresentação com sucesso: o texto, os valores e o orçamento
     já estão no banco. Derrubar a tela por causa do Drive
     trocaria "as fotos não subiram" por "o salvamento falhou", e
     a segunda é muito pior — o consultor refaria o trabalho.

     Devolve a conta para a tela dizer o que houve. */
  /* `reduzir` vem da tela porque é lá que mora o canvas, e a
     redução tem de ser A MESMA que o PDF usa — senão o Drive
     guardaria uma foto e o cliente receberia outra.

     ⚠️ ELA NÃO É OPCIONAL NA PRÁTICA. As fotos em `a.imagens`
     são os ORIGINAIS escolhidos no disco: render de 4K pesa
     vários MB, e uma apresentação de 20 fotos passaria de 150 MB
     de subida — pela internet da loja, no meio do atendimento.
     Reduzida, cada uma fica em 300–800 KB. */
  async function guardarFotos(trabalho, ambientes, aoAndar, reduzir) {
    const conta = { guardadas: 0, falharam: 0, desligado: false, semSessao: false };
    if (!trabalho) return conta;

    let token;
    try { token = await tokenDaSessao(); }
    catch (e) { conta.semSessao = true; return conta; }

    /* A lista do que falta, montada antes de subir nada: é ela
       que dá o total honesto para a contagem na tela. */
    const fila = [];
    (ambientes || []).forEach(function (a) {
      if (!a || !a.uid) return;
      (a.imagens || []).forEach(function (f, ordem) {
        if (!f || typeof f.arrayBuffer !== 'function') return;

        /* Já veio do Drive e está no mesmo lugar: nada a fazer.
           Sem esta linha, cada salvamento subiria tudo de novo. */
        if (f.__doDrive === ordem) return;

        fila.push({ uid: a.uid, ordem: ordem, arquivo: f });
      });
    });

    if (!fila.length) return conta;

    async function subirUma(tok, id, item) {
      try {
        /* Reduz aqui, não na escolha do arquivo: é o momento em
           que o original ainda está em mão e o PDF já aceitou
           esse mesmo tratamento. */
        let corpo = item.arquivo;
        if (reduzir) {
          try { corpo = await reduzir(item.arquivo); }
          catch (e) {
            console.warn('[fotos] não reduzi ' + item.arquivo.name
              + ': ' + ((e && e.message) || 'erro'));
            return false;
          }
        }

        const forma = new FormData();
        forma.append('trabalho', id);
        forma.append('ambiente', item.uid);
        forma.append('ordem', String(item.ordem));
        forma.append('arquivo', corpo, nomeJpeg(item.arquivo.name));

        const r = await fetch('/api/foto', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + tok },
          body: forma
        });

        if (r.status === 503) { conta.desligado = true; return false; }
        if (!r.ok) {
          console.warn('[fotos] ' + r.status + ' em ' + item.uid + '/' + item.ordem);
          return false;
        }
        return true;

      } catch (e) {
        console.warn('[fotos] ' + ((e && e.message) || 'falhou'));
        return false;
      }
    }

    /* Três por vez: uma a uma demora demais com 20 fotos, e
       todas de uma vez estrangulam a conexão da loja. */
    let proxima = 0;

    async function trabalhar() {
      while (proxima < fila.length) {
        const item = fila[proxima++];
        const ok = await subirUma(token, trabalho, item);

        if (ok) {
          conta.guardadas++;
          /* Marca para o próximo salvamento não repetir. */
          try { item.arquivo.__doDrive = item.ordem; } catch (e) {}
        } else if (conta.desligado) {
          return;
        } else {
          conta.falharam++;
        }

        if (aoAndar) {
          try { aoAndar(conta.guardadas + conta.falharam, fila.length); }
          catch (e) {}
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(3, fila.length) }, trabalhar));

    return conta;
  }


  /* Traz de volta o que o Drive tiver.

     Também não estoura: o que não vier cai na reposição pelo
     nome. Pior caso, a tela fica exatamente como era antes desta
     função existir. */
  async function trazerFotos(trabalho, ambientes, aoAndar) {
    const conta = { trazidas: 0, faltaram: 0, desligado: false };
    if (!trabalho) return conta;

    let token;
    try { token = await tokenDaSessao(); } catch (e) { return conta; }

    /* Quantas fotos cada ambiente tinha: é o que a ficha salva
       registra em `marcas`, e é por ele que sabemos quantos
       lugares pedir. */
    const fila = [];
    (ambientes || []).forEach(function (a) {
      if (!a || !a.uid) return;
      const quantas = (a.marcas && a.marcas.length) || 0;
      for (let o = 0; o < quantas; o++) fila.push({ amb: a, uid: a.uid, ordem: o });
    });

    if (!fila.length) return conta;

    async function baixarUma(tok, id, item) {
      try {
        const r = await fetch('/api/foto?trabalho=' + encodeURIComponent(id)
          + '&ambiente=' + encodeURIComponent(item.uid)
          + '&ordem=' + encodeURIComponent(item.ordem),
          { headers: { authorization: 'Bearer ' + tok } });

        if (r.status === 503) { conta.desligado = true; return null; }
        if (!r.ok) return null;          /* 404 = nunca subiu. Normal. */

        const blob = await r.blob();
        const nome = nomeDoCabecalho(r) || ('foto-' + (item.ordem + 1) + '.jpg');
        const f = new File([blob], nome, { type: blob.type || 'image/jpeg' });

        /* A marca que evita subir de volta o que acabou de
           descer. Propriedade solta num File é feio, e a
           alternativa — uma segunda estrutura em paralelo com
           esta — envelheceria em separado. */
        try { f.__doDrive = item.ordem; } catch (e) {}

        return f;

      } catch (e) {
        return null;
      }
    }

    let proxima = 0;

    async function trabalhar() {
      while (proxima < fila.length) {
        const item = fila[proxima++];
        const f = await baixarUma(token, trabalho, item);

        if (f) {
          /* Guarda no ÍNDICE, não no fim: a ordem no array tem
             de bater com a ordem no Drive. Os furos são
             resolvidos abaixo. */
          if (!item.amb.__baixadas) item.amb.__baixadas = [];
          item.amb.__baixadas[item.ordem] = f;
        } else if (conta.desligado) {
          return;
        }

        if (aoAndar) { try { aoAndar(proxima, fila.length); } catch (e) {} }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(3, fila.length) }, trabalhar));

    /* ⚠️ TUDO OU NADA, POR AMBIENTE — e esta é a regra que
       importa entender.

       Se o Drive tem 3 das 4 fotos de um ambiente, aceitar as 3
       e pedir a 4ª pela reposição parece melhor. Não é: a que
       falta pode ser a PRIMEIRA, e a reposição acrescenta no
       fim. A apresentação sairia com as fotos daquele ambiente
       em outra ordem — a de detalhe abrindo, a geral no fim — e
       ninguém veria erro nenhum, só uma apresentação pior.

       Então: ambiente completo vem do Drive e não pede nada;
       ambiente incompleto cai INTEIRO na reposição pelo nome,
       que é o que o sistema já fazia e que acerta a ordem. */
    (ambientes || []).forEach(function (a) {
      const quantas  = (a.marcas && a.marcas.length) || 0;
      const baixadas = a.__baixadas || [];

      let completo = quantas > 0;
      for (let o = 0; o < quantas; o++) if (!baixadas[o]) completo = false;

      if (completo) {
        a.imagens = baixadas.slice(0, quantas);
        a.marcas  = [];                 /* nada a repor */
        conta.trazidas += quantas;
      } else {
        conta.faltaram += quantas;      /* a reposição assume */
      }

      delete a.__baixadas;
    });

    return conta;
  }

  /* O nome vai sem a extensão original porque o que sobe é
     sempre JPEG. Sem isto, uma foto escolhida como .png subiria
     chamada .png contendo JPEG. */
  function nomeJpeg(nome) {
    const base = String(nome || 'foto').replace(/\.[^.]+$/, '');
    return (base || 'foto') + '.jpg';
  }

  function nomeDoCabecalho(r) {
    const d = r.headers.get('content-disposition') || '';
    const m = /filename="?([^";]+)"?/i.exec(d);
    return m ? m[1] : null;
  }


  /* --------------------------------------------------------
     Formatação de datas para a lista
     -------------------------------------------------------- */

  function quando(iso) {
    const d = new Date(iso);
    const agora = new Date();
    const dia = 86400000;

    const soData = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
    const diff = Math.round((soData(agora) - soData(d)) / dia);

    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    if (diff === 0) return 'hoje, ' + hora;
    if (diff === 1) return 'ontem, ' + hora;
    if (diff < 7)   return diff + ' dias atrás';

    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  return {
    salvar, listar, abrir, apagar,
    souAdmin, souGerente, vejoDeOutros, meuPerfil, listaDeConsultores,
    marcarFoto, indexar, quando, traduzir,
    guardarFotos, trazerFotos, clientesConhecidos
  };
})();

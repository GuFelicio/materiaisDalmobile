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
    marcarFoto, indexar, quando, traduzir
  };
})();

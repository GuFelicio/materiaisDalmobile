/* ============================================================
   TELA DE DOCUMENTO DE CAMPO — compartilhada

   Uma tela só serve a vistoria de equipe e a vistoria com o
   cliente: as duas listam fichas, abrem, guardam no aparelho,
   sincronizam, geram PDF e registram versão exatamente igual. O
   que muda entre elas cabe num punhado de linhas, e está no
   DOC_CONFIG que cada página define antes de carregar este
   arquivo.

   Por que um arquivo e não duas cópias: as regras que importam
   aqui são as silenciosas. A fila de marcos que sobe em ordem,
   a ficha que não pode ser sobrescrita depois de assinada, o
   atraso de 4 segundos que guarda a ficha e não a variável. Em
   duas cópias, bastaria uma receber uma correção para os dois
   documentos passarem a se comportar diferente — e os dois
   continuariam "funcionando", que é o pior jeito de descobrir.

   Cada página define, antes de carregar:

       window.DOC_CONFIG = {
         gaveta:        'montagens',     // armazém no aparelho
         tipo:          'montagem',      // tipo no banco
         prefixoId:     'mont',
         receita:       PDFMontagem,     // ou PDFVistoria
         umaPalavra:    'montagem',      // para as frases da tela
         variasPalavras:'montagens',
         rotuloEquipe:  'Montagens da equipe'
       };

   Partes opcionais da marcação (as fichas de montador, por
   exemplo) são procuradas antes de usar: a página que não as
   tiver simplesmente não as ganha.
   ============================================================ */

(function () {
  'use strict';

  const D = window.DOC_CONFIG;
  if (!D) throw new Error('DOC_CONFIG não definido antes de tela-doc.js');

  'use strict';

  const C = window.Campo;
  const Armazem = C.armazem(D.gaveta);


  let atual = null;
  let salvando = null;

  function el(id) { return document.getElementById(id); }


  /* ============================================================
     Nova ficha
     ============================================================ */

  function fichaNova() {
    const eu = window.dalmobileAuth && window.dalmobileAuth.usuario;

    return {
      id: C.novoId(D.prefixoId),
      remoto: null,
      enviado: false,
      cliente: '', contrato: '',
      loja: (window.EU && window.EU.loja) || 'sjc',
      criado_em: C.agora(),
      atualizado_em: C.agora(),
      dados: {
        ambiente: '',
        montadores: [],
        responsavel: (eu && eu.user_metadata && eu.user_metadata.nome) || '',
        itens: {},
        observacoes: ''
      }
    };
  }


  /* ============================================================
     Conexão
     ============================================================ */

  async function pintarRede() {
    const faixa = el('rede');
    const pendentes = (await Armazem.todas()).filter(function (m) { return !m.enviado && !m.removido; }).length;

    faixa.className = 'rede';
    faixa.innerHTML = '';

    if (!navigator.onLine) {
      faixa.classList.add('off');
      faixa.innerHTML = 'Sem internet — tudo continua funcionando.' +
        '<b>O que você preencher fica salvo aqui e sobe sozinho quando o sinal voltar. ' +
        'O PDF você gera mesmo offline.</b>';
      return;
    }

    if (pendentes) {
      faixa.classList.add('pendente');
      faixa.innerHTML = pendentes +
        (pendentes > 1 ? ' ' + D.variasPalavras + ' ainda não subiram.'
                       : ' ' + D.umaPalavra + ' ainda não subiu.') +
        '<b>Elas sobem sozinhas; se demorar, é só abrir a ' + D.umaPalavra +
        ' que ela tenta de novo.</b>';
    }
  }

  window.addEventListener('online',  function () { pintarRede(); sincronizarTudo(); });
  window.addEventListener('offline', pintarRede);


  /* ============================================================
     Lista
     ============================================================ */

  const TIPO_DOC = D.tipo;

  /* A tela dos itens mora em tela-itens.js, compartilhada com a
     vistoria do cliente. Ela não conhece armazenamento nem
     sincronia: avisa que mudou, e quem decide o que fazer é esta
     página. */
  const Itens = TelaItens({
    caixa: el('blocos'),
    receita: D.receita,
    ficha: function () { return atual; },
    guardar: function () { return guardar(); },
    aoMudar: function () { pintarEstado(); }
  });
  const ROTULO_EQUIPE = D.rotuloEquipe;

  async function montarPdfDe(doc) {
    const bytes = await D.receita.montar(doc);
    return { nome: D.receita.nomeDoArquivo(doc),
             blob: new Blob([bytes], { type: 'application/pdf' }) };
  }

  /* ============================================================
     Documentos da equipe
     ------------------------------------------------------------
     A lista de cima é o que está NESTE aparelho, que é o que o
     medidor edita. Esta é o que está no servidor, que é só
     consulta — e por isso não tem botão de editar, só de baixar
     o PDF, que o navegador remonta a partir dos dados.

     Aparece só para gerente e administrador. Para o consultor a
     seção inteira some: a lista dele já é a de cima.

     E não aparece offline. Sem rede não há o que mostrar, e uma
     seção vazia com um aviso de erro no meio da tela de campo
     seria ruído num lugar onde ruído atrapalha.
     ============================================================ */

  async function desenharEquipe() {
    const caixa = el('equipe');
    const titulo = el('equipe-titulo');
    const sub = el('equipe-sub');

    const eu = await C.eu();
    const podeVer = eu.admin || eu.gerente;

    if (!podeVer || !C.temServidor()) {
      titulo.classList.add('oculto');
      sub.classList.add('oculto');
      caixa.innerHTML = '';
      return;
    }

    titulo.classList.remove('oculto');
    sub.classList.remove('oculto');
    el('equipe-rotulo').textContent = ROTULO_EQUIPE;
    sub.textContent = eu.admin
      ? 'Todas as lojas. Só consulta — para editar, use o aparelho de quem preencheu.'
      : 'Da sua loja. Só consulta — para editar, use o aparelho de quem preencheu.';

    caixa.innerHTML = '<p class="vazio-msg">Carregando...</p>';

    const linhas = await C.listarDaEquipe(TIPO_DOC);

    if (linhas === null) {
      caixa.innerHTML = '<p class="vazio-msg">Não consegui carregar agora.</p>';
      return;
    }

    /* O que já está neste aparelho sai da lista: apareceria duas
       vezes, uma editável e outra não, o que confunde mais do
       que ajuda. */
    const meus = (await Armazem.todas())
      .map(function (m) { return m.remoto; })
      .filter(Boolean);

    const outros = linhas.filter(function (l) { return meus.indexOf(l.id) === -1; });

    if (!outros.length) {
      caixa.innerHTML = '<p class="vazio-msg">Nada da equipe por aqui ainda.</p>';
      return;
    }

    caixa.innerHTML = '';

    outros.forEach(function (d) {
      caixa.appendChild(cartaoDaEquipe(d, eu));
    });
  }

  function cartaoDaEquipe(d, eu) {
    const cartao = document.createElement('div');
    cartao.className = 'ficha';

    const meu = d.autor === eu.id;

    const corpo = document.createElement('div');
    corpo.style.padding = '15px 16px';
    corpo.innerHTML =
      '<h3>' + C.escapar(d.cliente || 'Sem nome') + '</h3>' +
      '<p>' + C.escapar(d.contrato || 'sem contrato') + ' · ' +
              (d.loja === 'cgt' ? 'Caraguatatuba' : 'São José dos Campos') + ' · ' +
              C.dataCurta(d.atualizado_em) + '</p>' +
      '<div class="tags">' +
        C.pintarEtiqueta(C.etiquetaParecer(d)) +
        C.pintarEtiqueta(C.etiquetaEstado(d)) +
        (d.autorNome
          ? '<span class="autor' + (meu ? ' meu' : '') + '">' +
            C.escapar(meu ? 'você' : d.autorNome) + '</span>'
          : '') +
      '</div>';

    cartao.appendChild(corpo);

    const acoes = document.createElement('div');
    acoes.className = 'acoes';
    acoes.style.paddingTop = '0';

    const baixar = document.createElement('button');
    baixar.textContent = 'baixar PDF';
    baixar.style.borderColor = 'var(--line-2)';
    baixar.style.color = 'var(--ink-2)';

    baixar.onclick = async function () {
      baixar.disabled = true;
      baixar.textContent = 'gerando…';

      try {
        /* As fotos ficam no aparelho de quem preencheu, não no
           servidor. O PDF sai completo no texto e sem imagem —
           e diz isso, para ninguém achar que não houve foto. */
        const pdf = await montarPdfDe({
          cliente: d.cliente, contrato: d.contrato, loja: d.loja,
          dados: d.dados, preenchido_em: d.atualizado_em, fotos: {}
        });
        await C.entregar(null, pdf.blob, pdf.nome);
      } catch (erro) {
        console.error(erro);
        alert('Não consegui gerar o PDF. ' + (erro.message || ''));
      } finally {
        baixar.disabled = false;
        baixar.textContent = 'baixar PDF';
      }
    };

    acoes.appendChild(baixar);

    if (eu.admin) {
      const apagar = document.createElement('button');
      apagar.textContent = 'apagar do sistema';

      apagar.onclick = async function () {
        if (!confirm('Mandar o documento de ' + (d.cliente || 'sem nome') +
                     ' para a lixeira?\n\nDá para restaurar na aba Contas.')) return;

        apagar.disabled = true;
        apagar.textContent = 'apagando…';

        try {
          await C.mandarParaLixeira(d.id);
          desenharEquipe();
        } catch (erro) {
          alert(erro.message);
          apagar.disabled = false;
          apagar.textContent = 'apagar do sistema';
        }
      };

      acoes.appendChild(apagar);
    }

    cartao.appendChild(acoes);
    return cartao;
  }

  async function mostrarLista() {
    el('tela-ficha').classList.add('oculto');
    el('tela-lista').classList.remove('oculto');
    el('barra').classList.add('oculto');
    atual = null;
    Itens.limparPrevias();

    await pintarRede();
    desenharEquipe();

    const todas = (await Armazem.todas()).sort(function (a, b) {
      return String(b.atualizado_em).localeCompare(String(a.atualizado_em));
    });

    const caixa = el('lista');

    if (!todas.length) {
      caixa.innerHTML = '<p class="vazio-msg">Nenhuma ' + D.umaPalavra + ' ainda.<br>' +
        'Toque em <b>' + D.rotuloNovo + '</b> antes de sair — assim a tela já fica ' +
        'guardada no aparelho.</p>';
      return;
    }

    caixa.innerHTML = '';

    const souAdmin = (await C.eu()).admin;

    todas.forEach(function (m) {
      const c = D.receita.contar(m.dados);

      const cartao = document.createElement('div');
      cartao.className = 'ficha' + (m.removido ? ' removido' : '');

      const abrir = document.createElement('button');
      abrir.className = 'abrir';
      abrir.onclick = function () { abrirFicha(m.id); };

      abrir.innerHTML =
        '<h3>' + C.escapar(m.cliente || 'Sem nome') + '</h3>' +
        '<p>' + C.escapar(m.dados.ambiente || 'ambiente não informado') + ' · ' +
                C.escapar(m.contrato || 'sem contrato') + ' · ' +
                C.dataCurta(m.atualizado_em) + '</p>' +
        '<div class="tags">' +
          etiquetaDoEnvio(m) +
          (m.versao ? '<span class="tag">versão ' + m.versao + '</span>' : '') +
          ((m.marcos || []).length
            ? '<span class="tag aviso">' + m.marcos.length + ' versão a subir</span>' : '') +
          C.pintarEtiqueta(C.etiquetaParecer({ tipo: TIPO_DOC, dados: m.dados })) +
          (c.faltam ? '<span class="tag">' + c.faltam + ' sem resposta</span>' : '') +
          (c.nao ? '<span class="tag erro">' + c.nao + ' não conforme</span>' : '') +
          (!c.faltam && !c.nao ? '<span class="tag ok">tudo conforme</span>' : '') +
        '</div>';

      cartao.appendChild(abrir);

      if (souAdmin && m.remoto && !m.removido) {
        cartao.appendChild(acaoDeApagar(m, D.umaPalavra));
      }

      caixa.appendChild(cartao);
    });
  }


  /* ============================================================
     Ficha
     ============================================================ */

  async function abrirFicha(id) {
    const m = await Armazem.ler(id);
    if (!m) return mostrarLista();

    atual = m;
    Itens.limparPrevias();

    el('tela-lista').classList.add('oculto');
    el('tela-ficha').classList.remove('oculto');
    el('barra').classList.remove('oculto');
    window.scrollTo(0, 0);

    el('f-cliente').value     = m.cliente || '';
    el('f-contrato').value    = m.contrato || '';
    el('f-loja').value        = m.loja || 'sjc';
    el('f-ambiente').value    = m.dados.ambiente || '';
    el('f-responsavel').value = m.dados.responsavel || '';
    if (el('f-cliente-assina')) {
      el('f-cliente-assina').value = m.dados.cliente_assina || '';
    }
    if (el('f-whatsapp')) el('f-whatsapp').value = m.dados.whatsapp || '';
    if (el('f-email'))    el('f-email').value    = m.dados.email    || '';
    /* Ficha antiga não tem o campo: sem isto, o primeiro toque
       num montador leria undefined e perderia a escolha. */
    if (!Array.isArray(m.dados.montadores)) m.dados.montadores = [];
    pintarMontadores();

    /* Fecha o histórico ao trocar de ficha: aberto, ele mostraria
       as versões da anterior até alguém tocar de novo. */
    if (el('historico-lista')) {
      el('historico-lista').hidden = true;
      el('historico-lista').innerHTML = '';
      el('ver-historico').setAttribute('aria-expanded', 'false');
    }
    el('f-observacoes').value = m.dados.observacoes || '';

    Itens.desenhar();
    pintarEstado();
    sincronizar(m);
  }

  /* ------------------------------------------------------------
     Histórico de versões
     ------------------------------------------------------------
     A versão já era gravada em cada PDF gerado, com a impressão
     digital do arquivo — faltava onde olhar.

     Duas origens, e as duas importam: o que já subiu (servidor)
     e o que ainda está na fila do aparelho. Mostrar só o que
     subiu esconderia justamente a versão do momento em que o
     cliente viu o documento, que é a que foi gerada na obra, sem
     sinal.
     ------------------------------------------------------------ */
  const MOTIVOS = {
    pdf: 'PDF gerado',
    assinado: 'documento assinado',
    correcao: 'correção depois de assinado',
    reabertura: 'medição reaberta'
  };

  function cartaoDeVersao(v, pendente) {
    const d = document.createElement('div');
    d.className = 'versao' + (pendente ? ' pendente' : '');

    const topo = document.createElement('div');
    topo.className = 'topo';

    const num = document.createElement('span');
    num.className = 'numero';
    num.textContent = pendente ? 'a subir' : 'versão ' + v.numero;

    const quando = document.createElement('span');
    quando.className = 'quando';
    quando.textContent = dataLonga(pendente ? v.em : v.criada_em);

    topo.append(num, quando);

    const porque = document.createElement('p');
    porque.className = 'porque';
    porque.textContent = (MOTIVOS[v.motivo] || v.motivo || 'sem motivo registrado') +
      (v.criada_por_nome ? ' · ' + v.criada_por_nome : '');

    d.append(topo, porque);

    if (v.hash) {
      const dig = document.createElement('p');
      dig.className = 'digital';
      /* Os 16 primeiros bastam para conferir à vista se o papel
         na mão é esta versão; o resto só ocuparia a tela. */
      dig.textContent = 'impressão digital ' + String(v.hash).slice(0, 16);
      d.appendChild(dig);
    }

    return d;
  }

  function dataLonga(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return 'sem data';
    return d.toLocaleDateString('pt-BR') + ' às ' +
           d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function recado(caixa, texto) {
    const p = document.createElement('p');
    p.className = 'recado';
    p.textContent = texto;
    caixa.appendChild(p);
  }

  async function desenharHistorico() {
    const caixa = el('historico-lista');
    caixa.innerHTML = '';
    if (!atual) return;

    /* A fila do aparelho primeiro: é o que acabou de acontecer. */
    const fila = atual.marcos || [];

    const sb = C.temServidor();
    let subidas = [];
    let falhou = null;

    if (sb && atual.remoto) {
      try {
        const r = await sb.from('formulario_historico')
          .select('numero, motivo, hash, criada_em, criada_por_nome')
          .eq('formulario', atual.remoto)
          .order('numero', { ascending: false });
        if (r.error) falhou = r.error.message;
        else subidas = r.data || [];
      } catch (e) {
        falhou = e.message;
      }
    }

    fila.slice().reverse().forEach(function (m) {
      caixa.appendChild(cartaoDeVersao(m, true));
    });
    subidas.forEach(function (v) { caixa.appendChild(cartaoDeVersao(v, false)); });

    if (!fila.length && !subidas.length) {
      recado(caixa, falhou
        ? 'Não consegui ler o histórico agora: ' + falhou
        : (!atual.remoto
            ? 'Esta ' + D.umaPalavra + ' ainda não subiu. A primeira versão nasce quando o PDF for gerado.'
            : 'Nenhuma versão ainda. Elas nascem quando o PDF é gerado.'));
      return;
    }

    if (!sb || !atual.remoto) {
      recado(caixa, 'Sem conexão: aparecem só as versões guardadas neste aparelho. ' +
                    'As que já subiram aparecem quando houver sinal.');
    } else if (falhou) {
      recado(caixa, 'As versões do servidor não vieram agora: ' + falhou);
    }
  }

  (function ligarHistorico() {
    const b = el('ver-historico');
    const caixa = el('historico-lista');
    if (!b || !caixa) return;

    b.addEventListener('click', async function () {
      const abrindo = caixa.hidden;
      caixa.hidden = !abrindo;
      b.setAttribute('aria-expanded', String(abrindo));
      if (abrindo) {
        caixa.innerHTML = '';
        recado(caixa, 'Carregando...');
        await desenharHistorico();
      }
    });
  })();

  /* Quantos faltam em cada bloco. Com 36 itens, rolar de volta
     para procurar o que ficou em branco é o jeito mais rápido de
     desistir do formulário. */

  /* Três estados, não dois. O terceiro só aparece depois que a
     sincronia descobre que o administrador mandou a ficha para a
     lixeira — e é importante que o medidor veja isso, em vez de
     achar que o registro dele continua valendo. */
  function etiquetaDoEnvio(m) {
    if (m.removido) return '<span class="tag erro">removido pelo administrador</span>';
    return m.enviado ? '<span class="tag ok">no sistema</span>'
                     : '<span class="tag aviso">só neste aparelho</span>';
  }

  /* Só para administrador, e só no que já subiu: o que ainda está
     no aparelho se resolve com o "Apagar" de dentro da ficha. */
  function acaoDeApagar(m, oQue) {
    const linha = document.createElement('div');
    linha.className = 'acoes';

    const b = document.createElement('button');
    b.textContent = 'apagar do sistema';

    b.onclick = async function () {
      if (!confirm('Mandar a ' + oQue + ' de ' + (m.cliente || 'sem nome') +
                   ' para a lixeira?\n\n' +
                   'Ela some das listas na hora. Dá para restaurar depois, ' +
                   'na aba Contas da Central.')) return;

      b.disabled = true;
      b.textContent = 'apagando…';

      try {
        await C.mandarParaLixeira(m.remoto);
        m.removido = true;
        await Armazem.salvar(m);
        mostrarLista();
      } catch (erro) {
        alert(erro.message);
        b.disabled = false;
        b.textContent = 'apagar do sistema';
      }
    };

    linha.appendChild(b);
    return linha;
  }




  /* ============================================================
     Salvar
     ============================================================ */

  /* ------------------------------------------------------------
     Equipe de montagem
     ------------------------------------------------------------
     O registro guarda NOME e id, não só o id. O nome é o que
     importa daqui a um ano: se o montador sair da equipe e for
     inativado, a vistoria tem que continuar dizendo quem estava
     lá — e um id solto, sem a linha do cadastro à mão, não diz
     nada a ninguém.
     ------------------------------------------------------------ */
  let cadastroDeMontadores = C.montadoresGuardados();

  function escolhidos() {
    return (atual && Array.isArray(atual.dados.montadores))
      ? atual.dados.montadores : [];
  }

  function pintarMontadores() {
    const area = el('f-montadores');
    /* A vistoria com o cliente não tem este campo. Procurar antes
       de usar é o que permite as duas telas dividirem um script
       só sem cada uma precisar fingir que tem a marcação da
       outra. */
    if (!area) return;
    area.innerHTML = '';
    if (!atual) return;

    const marcados = escolhidos();
    const ativos = cadastroDeMontadores.filter(function (m) { return m.ativo !== false; });

    /* Quem está no registro mas não está mais na lista de ativos
       entra assim mesmo, no fim: tirar da tela seria apagar da
       vistoria alguém que trabalhou nela. */
    const extras = marcados.filter(function (e) {
      return !ativos.some(function (m) { return m.id === e.id; });
    });

    const tudo = ativos.map(function (m) { return { id: m.id, nome: m.nome, fora: false }; })
      .concat(extras.map(function (e) { return { id: e.id, nome: e.nome, fora: true }; }));

    if (!tudo.length) {
      const vazio = document.createElement('p');
      vazio.className = 'vazio';
      vazio.textContent = cadastroDeMontadores.length
        ? 'Nenhum montador ativo no cadastro.'
        : 'A lista ainda não chegou neste aparelho. Abra a Central com internet uma vez e ela fica guardada.';
      area.appendChild(vazio);
      return;
    }

    tudo.forEach(function (m) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = m.nome;
      if (m.fora) b.className = 'fora';
      const ligado = marcados.some(function (x) { return x.id === m.id; });
      b.setAttribute('aria-pressed', ligado ? 'true' : 'false');

      b.addEventListener('click', function () {
        const lista = escolhidos().slice();
        const i = lista.findIndex(function (x) { return x.id === m.id; });
        if (i >= 0) lista.splice(i, 1);
        else lista.push({ id: m.id, nome: m.nome });
        atual.dados.montadores = lista;
        pintarMontadores();
        guardar();
      });

      area.appendChild(b);
    });
  }

  /* Busca a lista quando houver rede e repinta. Se não houver,
     a guardada continua valendo e nada na tela muda. */
  (async function trazerMontadores() {
    if (!el('f-montadores')) return;
    try {
      cadastroDeMontadores = await C.montadores();
      if (atual) pintarMontadores();
    } catch (e) {
      console.warn('Lista de montadores não atualizou agora.', e);
    }
  })();

  function colher() {
    if (!atual) return;
    atual.cliente  = el('f-cliente').value.trim();
    atual.contrato = el('f-contrato').value.trim();
    atual.loja     = el('f-loja').value;

    atual.dados.ambiente    = el('f-ambiente').value.trim();
    atual.dados.responsavel = el('f-responsavel').value.trim();
    atual.dados.observacoes = el('f-observacoes').value;

    /* Só a vistoria com o cliente tem este campo. É o nome que
       vai na linha de assinatura do PDF. */
    if (el('f-cliente-assina')) {
      atual.dados.cliente_assina = el('f-cliente-assina').value.trim();
    }
    if (el('f-whatsapp')) atual.dados.whatsapp = el('f-whatsapp').value.trim();
    if (el('f-email'))    atual.dados.email    = el('f-email').value.trim();
  }

  async function guardar() {
    if (!atual) return;
    colher();
    atual.atualizado_em = C.agora();
    atual.enviado = false;
    await Armazem.salvar(atual);
    pintarEstado();

    clearTimeout(salvando);

    /* Guarda a ficha, não a variável. Quando o atraso vence, o
       medidor já pode ter voltado para a lista — e aí 'atual' é
       nulo, a sincronia dispara contra nada e o que estava para
       subir fica parado no aparelho sem ninguém perceber. */
    const pendente = atual;
    salvando = setTimeout(function () { sincronizar(pendente); }, 4000);
  }

  ['f-cliente','f-contrato','f-ambiente','f-responsavel','f-observacoes',
   'f-cliente-assina','f-whatsapp','f-email']
    .forEach(function (id) {
      const campo = el(id);
      if (campo) campo.addEventListener('input', guardar);
    });
  el('f-loja').addEventListener('change', guardar);

  function pintarEstado() {
    if (!atual) return;
    const c = D.receita.contar(atual.dados);

    el('estado').innerHTML = c.faltam
      ? '<b>' + (c.total - c.faltam) + '</b> de ' + c.total + ' respondidos'
      : (c.nao ? '<b>' + c.nao + '</b> não conforme' + (c.nao > 1 ? 's' : '')
               : 'Tudo conforme');

    pintarParecer(c);
    pintarAssinatura(c);
  }

  /* ------------------------------------------------------------
     O parecer da vistoria
     ------------------------------------------------------------
     A escolha só aparece quando há pendência. Sem pendência não
     há o que decidir, e oferecer a escolha ali seria convidar
     alguém a marcar "reprovada" numa obra conforme — ou, pior, a
     aprovar com restrição uma obra que não tem nenhuma.

     Com item em branco também não aparece: antes de concluir é
     preciso terminar.
     ------------------------------------------------------------ */
  /* ------------------------------------------------------------
     Assinatura
     ------------------------------------------------------------
     Quem assina sai do parecer, e quem decide de verdade é o
     servidor: ele relê as respostas no banco. O que acontece
     aqui é só não deixar a pessoa tocar num botão que vai ser
     recusado do outro lado — e dizer por quê antes, em vez de
     depois.
     ------------------------------------------------------------ */
  function faseDaAssinatura(c) {
    const d = atual.dados;

    if (d.assinatura) return { fase: 'enviada' };

    const quem = D.receita.quemAssina ? D.receita.quemAssina(d, c) : 'cliente';

    if (!quem) {
      return { fase: 'falta', porque: c.faltam
        ? 'Responda todos os itens para concluir a vistoria.'
        : 'Escolha entre aprovar com assistência e reprovar.' };
    }

    /* O que falta preencher vem ANTES do que falta de sinal: na
       obra dá para preencher sem rede, e aí quando o sinal
       chegar é só enviar. Dizer "aguardando sinal" para quem
       ainda nem pôs o WhatsApp manda a pessoa esperar por nada. */
    if (quem === 'cliente' && !C.normalizarWhatsapp(d.whatsapp)) {
      return { fase: 'falta', porque: 'Informe o WhatsApp do cliente, com DDD.' };
    }

    /* Reprovada vai por e-mail e o e-mail é obrigatório: sem ele
       o documento nasce assinado e não chega a ninguém. */
    if (quem === 'loja' && !C.emailValido(d.email)) {
      return { fase: 'falta', porque: 'Informe o e-mail do cliente: é por ele que a vistoria reprovada é entregue.' };
    }

    if (!atual.remoto) {
      return { fase: 'esperando', porque: 'A vistoria ainda não subiu para o sistema.' };
    }

    return { fase: 'pronta', quem: quem };
  }

  function pintarAssinatura(c) {
    const botao = el('assinar');
    if (!botao) return;          /* só a vistoria assina */

    const caixa = el('caixa-assinatura');
    const e = faseDaAssinatura(c);

    if (e.fase === 'enviada') {
      botao.hidden = true;
      el('salvar').className = 'btn';
      caixa.classList.remove('oculto');
      el('resumo-assinatura').innerHTML = resumoDaAssinatura(atual.dados.assinatura);
      return;
    }

    caixa.classList.add('oculto');

    if (e.fase === 'pronta') {
      botao.hidden = false;
      botao.disabled = false;
      botao.title = '';
      botao.textContent = e.quem === 'cliente' ? 'Enviar para assinatura' : 'Assinar e enviar';
      el('salvar').className = 'btn vazio';
      return;
    }

    /* Apagado, e não escondido: ver que o botão existe e por que
       ainda não dá vale mais do que não vê-lo. */
    botao.hidden = false;
    botao.disabled = true;
    botao.textContent = e.fase === 'esperando' ? 'Aguardando sinal' : 'Falta preencher';
    botao.title = e.porque || '';
    el('salvar').className = 'btn';
  }

  function resumoDaAssinatura(a) {
    const linhas = [];
    linhas.push('<p>' + (a.clienteAssina
      ? 'Enviada para o cliente assinar, por ' + C.escapar(a.canal || 'WhatsApp') + '.'
      : 'Assinada pela Dalmóbile e enviada ao cliente por e-mail.') + '</p>');
    if (a.em) linhas.push('<p>' + C.escapar(dataLonga(a.em)) + '</p>');
    if (a.sandbox) {
      linhas.push('<p class="alerta">Documento de teste (sandbox): não tem validade.</p>');
    }
    if (a.aviso) linhas.push('<p class="alerta">' + C.escapar(a.aviso) + '</p>');
    return linhas.join('');
  }

  (function ligarAssinatura() {
    const botao = el('assinar');
    if (!botao) return;

    botao.onclick = async function () {
      const d = atual.dados;
      const c = D.receita.contar(d);
      const e = faseDaAssinatura(c);
      if (e.fase !== 'pronta') return;

      const pergunta = e.quem === 'cliente'
        ? 'Enviar a vistoria para ' + (atual.cliente || 'o cliente') + ' assinar, no WhatsApp '
          + C.mascararWhatsapp(d.whatsapp) + '?'
        : 'Assinar a vistoria pela Dalmóbile e enviar para ' + d.email + '?';

      /* Depois de enviado não tem como desfazer sem custo: o
         documento foi criado e cobrado, e o cliente já recebeu o
         aviso. */
      if (!confirm(pergunta)) return;

      botao.disabled = true;
      const antes = botao.textContent;

      try {
        botao.textContent = 'Subindo a vistoria…';
        colher();
        await guardar();
        await sincronizar(atual);

        if (!atual.remoto) {
          throw new Error('A vistoria não subiu para o sistema. Confira o sinal e tente de novo.');
        }

        botao.textContent = 'Gerando o PDF…';
        const pdf = await montarPdf();

        botao.textContent = 'Enviando…';
        const r = await C.pedirAssinatura({
          remoto: atual.remoto, blob: pdf.blob, nome: pdf.nome,
          whatsapp: d.whatsapp, email: d.email
        });

        atual.dados.assinatura = {
          documento: r.documento, em: C.agora(), canal: r.canal,
          clienteAssina: r.clienteAssina, link: r.linkDoCliente || null,
          assinadoPor: r.assinadoPor || null, aviso: r.aviso || null,
          sandbox: !!r.sandbox
        };

        await guardar();
        await sincronizar(atual);

        alert(r.clienteAssina
          ? 'Pronto. O cliente recebeu o pedido de assinatura no WhatsApp.'
          : 'Pronto. A vistoria foi assinada pela Dalmóbile e enviada por e-mail.');

      } catch (erro) {
        console.error(erro);
        alert(erro.message || 'Não consegui enviar para assinatura.');
        botao.textContent = antes;
      } finally {
        botao.disabled = false;
        pintarEstado();
      }
    };
  })();

  function pintarParecer(c) {
    const area = el('parecer');
    if (!area) return;            /* só a vistoria tem isto */

    const dados = atual.dados;

    if (c.faltam) {
      area.className = 'parecer aguardando';
      area.innerHTML = '<p class="recado">Responda todos os itens para concluir a vistoria.</p>';
      return;
    }

    if (!c.nao) {
      /* Automático: some qualquer escolha gravada antes, senão um
         "reprovada" de quando havia pendência ficaria valendo
         depois que ela foi corrigida. */
      if (dados.parecer) { delete dados.parecer; guardar(); }
      area.className = 'parecer aprovada';
      area.innerHTML = '<p class="veredito">Obra aprovada sem restrição</p>' +
        '<p class="recado">Nenhuma não conformidade. O cliente assina a liberação.</p>';
      return;
    }

    area.className = 'parecer escolher';
    area.innerHTML = '';

    const titulo = document.createElement('p');
    titulo.className = 'veredito';
    titulo.textContent = c.nao === 1 ? '1 pendência encontrada'
                                     : c.nao + ' pendências encontradas';

    const ajuda = document.createElement('p');
    ajuda.className = 'recado';
    ajuda.textContent = 'As duas saídas registram as pendências e geram o pedido de ' +
                        'assistência. A diferença é quem assina.';

    const caixa = document.createElement('div');
    caixa.className = 'parecer-opcoes';

    [
      { v: 'assistencia', r: 'Aprovar com assistência', sub: 'O cliente assina' },
      { v: 'reprovada',   r: 'Reprovar a obra',         sub: 'A Dalmóbile assina; o cliente recebe' }
    ].forEach(function (o) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(dados.parecer === o.v));
      b.innerHTML = '<b></b><small></small>';
      b.querySelector('b').textContent = o.r;
      b.querySelector('small').textContent = o.sub;

      b.onclick = function () {
        /* Tocar de novo desmarca: um parecer dado por engano
           precisa ter volta, como qualquer resposta aqui. */
        dados.parecer = (dados.parecer === o.v) ? '' : o.v;
        guardar();
        pintarParecer(c);
      };

      caixa.appendChild(b);
    });

    area.append(titulo, ajuda, caixa);

    if (!dados.parecer) {
      const falta = document.createElement('p');
      falta.className = 'recado aviso';
      falta.textContent = 'Escolha uma das duas para concluir.';
      area.appendChild(falta);
    }
  }


  /* ============================================================
     Sincronia
     ============================================================ */

  async function sincronizar(m) {
    if (!m || m.enviado) return;

    /* Removido pelo administrador: não insiste. Sem isto o
       aparelho reenviaria a cada abertura, para sempre, e o
       banco devolveria sempre o mesmo 'apagado'. */
    if (m.removido) return;

    const sb = C.temServidor();
    if (!sb) return;

    const linha = {
      tipo: D.tipo,
      cliente: m.cliente || '',
      contrato: m.contrato || '',
      loja: m.loja,
      dados: m.dados,
      status: 'preenchido',
      preenchido_em: m.atualizado_em
    };

    try {
      /* A ficha criada em obra pode subir dias depois. Sem mandar
         a data de abertura no insert, ela viraria a data da
         SINCRONIA — e com ela o prazo contratual escorregaria
         para frente sozinho. No update ela nem vai: o banco a
         tranca, e é essa a intenção. */
      const r = m.remoto
        ? await sb.from('formularios').update(linha).eq('id', m.remoto).select('id,status').single()
        : await sb.from('formularios')
                  .insert(Object.assign({ pedido_em: m.criado_em }, linha))
                  .select('id,status').single();

      if (r.error) throw r.error;

      m.remoto = r.data.id;
      m.enviado = true;

      /* O banco devolve o estado DEPOIS do gatilho. Se voltou
         'apagado', o administrador mandou esta ficha para a
         lixeira: o conteúdo foi gravado, mas ela não revive. É
         assim que este aparelho fica sabendo. */
      m.removido = r.data.status === 'apagado';

      await Armazem.salvar(m);
      await C.enviarMarcos(m, Armazem);
      await Armazem.salvar(m);

      pintarEstado();
      pintarRede();

    } catch (erro) {
      console.warn('Não subiu agora; fica para a próxima.', erro);
    }
  }

  async function sincronizarTudo() {
    for (const m of await Armazem.todas()) {
      if (!m.enviado && !m.removido) await sincronizar(m);
    }
    pintarRede();
    if (!el('tela-lista').classList.contains('oculto')) mostrarLista();
  }


  /* ============================================================
     PDF
     ============================================================ */

  async function montarPdf() {
    colher();

    const listas = D.receita.todosOsItens().map(function (par) {
      return (atual.dados.itens[par.item.id] || {}).fotos;
    });

    const fotos = await C.bytesDasFotos(listas);

    const bytes = await D.receita.montar({
      cliente: atual.cliente,
      contrato: atual.contrato,
      loja: atual.loja,
      dados: atual.dados,
      preenchido_em: atual.atualizado_em,
      fotos: fotos
    });

    /* Gerar o PDF é o evento que vira versão: foi este arquivo
       que alguém imprimiu ou mandou. O marco fica no aparelho e
       sobe na próxima sincronia, com a data de hoje — não a de
       quando houver sinal. */
    C.anotarMarco(atual, 'pdf', await C.hashDoPdf(bytes));
    await guardar();

    return {
      nome: D.receita.nomeDoArquivo(atual),
      blob: new Blob([bytes], { type: 'application/pdf' })
    };
  }

  /* A pasta é pedida ANTES de montar o PDF: o diálogo só abre
     enquanto o toque ainda vale para o navegador, e um checklist
     com fotos demora o bastante para estourar esse prazo. */
  el('salvar').onclick = async function () {
    if (!atual) return;

    const botao = this;
    colher();

    const destino = await C.escolherPasta(D.receita.nomeDoArquivo(atual));
    if (destino === 'cancelado') return;

    botao.disabled = true;
    botao.textContent = 'Gerando…';

    try {
      const pdf = await montarPdf();
      await C.entregar(destino, pdf.blob, pdf.nome);
    } catch (erro) {
      console.error(erro);
      alert('Não consegui salvar o PDF. ' + (erro.message || ''));
    } finally {
      botao.disabled = false;
      botao.textContent = 'Salvar PDF';
    }
  };

  el('enviar').onclick = async function () {
    if (!atual) return;

    const botao = this;
    botao.disabled = true;
    botao.textContent = 'Gerando…';

    try {
      const pdf = await montarPdf();
      await C.compartilhar(pdf.blob, pdf.nome);
    } catch (erro) {
      console.error(erro);
      alert('Não consegui gerar o PDF. ' + (erro.message || ''));
    } finally {
      botao.disabled = false;
      botao.textContent = 'Enviar';
    }
  };

  el('enviar').hidden = !C.podeCompartilharArquivo();


  /* ============================================================
     Botões gerais
     ============================================================ */

  el('nova').onclick = async function () {
    const m = fichaNova();
    await Armazem.salvar(m);
    abrirFicha(m.id);
  };

  el('voltar-lista').onclick = async function () {
    await guardar();
    mostrarLista();
  };

  el('apagar').onclick = async function () {
    if (!atual) return;

    const aviso = atual.enviado
      ? 'Apagar esta ' + D.umaPalavra + ' deste aparelho? Ela já subiu para o sistema e continua lá.'
      : 'Apagar esta ' + D.umaPalavra + '? Ela ainda NÃO subiu para o sistema — isso não tem volta.';

    if (!confirm(aviso)) return;

    for (const par of D.receita.todosOsItens()) {
      const r = atual.dados.itens[par.item.id];
      for (const f of ((r && r.fotos) || [])) await C.fotos.apagar(f.id);
    }

    await Armazem.apagar(atual.id);
    mostrarLista();
  };


  /* ============================================================
     Miudezas e partida
     ============================================================ */



  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && atual) guardar();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      console.warn('Service worker não registrou; a tela não vai abrir offline.', e);
    });
  }

  if (!D.receita) {
    alert('O gerador de PDF não carregou. Abra a tela uma vez com internet.');
  }

  mostrarLista();
  sincronizarTudo();

})();

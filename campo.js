/* ============================================================
   CAMPO — o que as telas de obra têm em comum
   ------------------------------------------------------------
   O Documento 101 (medição) e o checklist de montagem são
   preenchidos no mesmo lugar: dentro de um imóvel, pelo celular,
   muitas vezes sem sinal. As duas telas precisam exatamente das
   mesmas três coisas, e elas moram aqui:

       armazém local    guardar o rascunho no aparelho
       fotos            comprimir e guardar imagem da câmera
       conexão          saber se dá para falar com o servidor

   POR QUE ISTO É UM ARQUIVO E NÃO CÓDIGO COPIADO
   Isto nasceu dentro do medicao.html. Ao construir o segundo
   documento, copiar seria mais rápido — e criaria dois lugares
   para corrigir o mesmo defeito, que é como duas telas que
   deviam ser iguais começam a divergir sem ninguém perceber.

   DEPENDE DE NADA. Pode carregar antes de qualquer outra coisa.
   ============================================================ */

window.Campo = (function () {
  'use strict';

  /* ------------------------------------------------------------
     Armazém local — IndexedDB
     ------------------------------------------------------------
     Por que IndexedDB e não localStorage: as fotos. localStorage
     guarda texto, tem teto de uns 5 MB e obrigaria a converter
     cada imagem em base64, que incha o arquivo em um terço. Três
     fotos de obra já estouram. IndexedDB guarda Blob do jeito que
     saiu da câmera, com folga de centenas de MB.

     Uma gaveta por documento, e as fotos numa gaveta só. Assim o
     rascunho de uma medição nunca aparece na lista de montagem, e
     ainda assim existe um lugar único para apagar imagem órfã.
     ------------------------------------------------------------ */

  const BANCO = 'dalmobile-campo';
  const VERSAO = 1;
  const GAVETAS = ['medicoes', 'montagens', 'fotos'];

  let bd = null;

  function abrir() {
    if (bd) return Promise.resolve(bd);

    return new Promise(function (ok, falha) {
      const p = indexedDB.open(BANCO, VERSAO);

      p.onupgradeneeded = function () {
        const b = p.result;
        GAVETAS.forEach(function (g) {
          if (!b.objectStoreNames.contains(g)) b.createObjectStore(g, { keyPath: 'id' });
        });
      };

      p.onsuccess = function () { bd = p.result; ok(bd); };
      p.onerror   = function () { falha(p.error); };
    });
  }

  function transacao(gaveta, modo, acao) {
    return abrir().then(function (b) {
      return new Promise(function (ok, falha) {
        const t = b.transaction(gaveta, modo);
        const pedido = acao(t.objectStore(gaveta));
        t.oncomplete = function () { ok(pedido ? pedido.result : undefined); };
        t.onerror    = function () { falha(t.error); };
      });
    });
  }

  /** Abre o armazém de um tipo de documento: 'medicoes', 'montagens'. */
  function armazem(gaveta) {
    if (GAVETAS.indexOf(gaveta) === -1) {
      throw new Error('gaveta desconhecida: ' + gaveta);
    }

    return {
      salvar: function (f)  { return transacao(gaveta, 'readwrite', function (s) { return s.put(f); }); },
      ler:    function (id) { return transacao(gaveta, 'readonly',  function (s) { return s.get(id); }); },
      todas:  function ()   { return transacao(gaveta, 'readonly',  function (s) { return s.getAll(); }); },
      apagar: function (id) { return transacao(gaveta, 'readwrite', function (s) { return s.delete(id); }); }
    };
  }

  const fotos = {
    salvar: function (f)  { return transacao('fotos', 'readwrite', function (s) { return s.put(f); }); },
    ler:    function (id) { return transacao('fotos', 'readonly',  function (s) { return s.get(id); }); },
    apagar: function (id) { return transacao('fotos', 'readwrite', function (s) { return s.delete(id); }); }
  };


  /* ------------------------------------------------------------
     Fotos — comprimir antes de guardar
     ------------------------------------------------------------
     Um celular atual entrega 4 a 12 MB por foto. Dez dessas no
     PDF dão um arquivo que não passa no WhatsApp e um rascunho
     que não cabe no aparelho. 1400px no lado maior, JPEG 72%,
     resolve em ~200 KB e ainda mostra com sobra o detalhe que o
     documento precisa provar.
     ------------------------------------------------------------ */

  const LADO_MAIOR = 1400;
  const QUALIDADE = 0.72;

  function comprimir(arquivo) {
    return new Promise(function (ok, falha) {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();

      img.onload = function () {
        URL.revokeObjectURL(url);

        const escala = Math.min(1, LADO_MAIOR / Math.max(img.width, img.height));
        const l = Math.round(img.width * escala);
        const a = Math.round(img.height * escala);

        const tela = document.createElement('canvas');
        tela.width = l; tela.height = a;
        tela.getContext('2d').drawImage(img, 0, 0, l, a);

        tela.toBlob(function (blob) {
          if (blob) ok(blob); else falha(new Error('não consegui converter a foto'));
        }, 'image/jpeg', QUALIDADE);
      };

      img.onerror = function () {
        URL.revokeObjectURL(url);
        falha(new Error('não consegui abrir a foto'));
      };

      img.src = url;
    });
  }

  /* Recebe o que veio do <input type=file>, comprime, guarda e
     devolve as entradas para a lista do item. Um arquivo que
     falha não derruba os outros da mesma seleção. */
  async function receber(arquivos, aoFalhar) {
    const novas = [];

    for (const arquivo of Array.prototype.slice.call(arquivos || [])) {
      try {
        const blob = await comprimir(arquivo);
        const id = novoId('foto');
        await fotos.salvar({ id: id, blob: blob });
        novas.push({ id: id, legenda: '' });
      } catch (erro) {
        console.error(erro);
        if (aoFalhar) aoFalhar(erro);
      }
    }

    return novas;
  }

  /** Carrega as fotos de uma lista como bytes, para o pdf-lib. */
  async function bytesDasFotos(listas) {
    const saida = {};

    for (const lista of listas) {
      for (const f of (lista || [])) {
        const reg = await fotos.ler(f.id);
        if (reg) saida[f.id] = new Uint8Array(await reg.blob.arrayBuffer());
      }
    }

    return saida;
  }


  /* ------------------------------------------------------------
     Conexão
     ------------------------------------------------------------
     Devolve o cliente do Supabase só quando dá mesmo para falar
     com ele. A marca 'offline' é posta pelo auth.js quando a
     página abriu com sessão guardada e sem rede — nesse estado a
     tela funciona inteira, mas não tenta gravar no servidor.
     ------------------------------------------------------------ */

  function temServidor() {
    if (!navigator.onLine) return null;

    const a = window.dalmobileAuth;
    if (!a || !a.cliente || a.offline) return null;

    return a.cliente;
  }


  /* ------------------------------------------------------------
     Quem sou eu
     ------------------------------------------------------------
     O cargo vem do banco e fica guardado no aparelho, porque em
     obra não há rede para perguntar de novo.

     ⚠️ ISTO É DICA DE TELA, NÃO É TRANCA.
     Quem mexer no armazenamento do próprio navegador faz o botão
     de apagar aparecer. E não vai conseguir nada: apagar é uma
     função do banco que confere eh_admin() do lado de lá. O que
     está aqui decide o que se MOSTRA; o que se PODE está no
     Supabase, onde ninguém alcança pelo console.
     ------------------------------------------------------------ */

  const CHAVE_EU = 'dalmobile-eu';
  const NINGUEM = { id: null, nome: '', loja: '', admin: false, gerente: false };

  let euGuardado = null;

  function lerEuDoAparelho() {
    try {
      const bruto = localStorage.getItem(CHAVE_EU);
      return bruto ? JSON.parse(bruto) : null;
    } catch (e) {
      return null;
    }
  }

  async function eu() {
    if (euGuardado) return euGuardado;

    const doAparelho = lerEuDoAparelho();
    const sb = temServidor();
    const sessao = window.dalmobileAuth && window.dalmobileAuth.usuario;

    if (!sb || !sessao) {
      euGuardado = doAparelho || NINGUEM;
      return euGuardado;
    }

    try {
      const r = await sb.from('perfis')
        .select('id,nome,loja,admin,gerente')
        .eq('id', sessao.id)
        .limit(1);

      if (r.error || !r.data || !r.data.length) throw r.error || new Error('perfil não veio');

      const p = r.data[0];
      euGuardado = {
        id: p.id,
        nome: p.nome || '',
        loja: p.loja || '',
        admin: p.admin === true,
        gerente: p.gerente === true
      };

      try { localStorage.setItem(CHAVE_EU, JSON.stringify(euGuardado)); } catch (e) {}

    } catch (erro) {
      console.warn('Não li o perfil; uso o que estava guardado.', erro);
      euGuardado = doAparelho || NINGUEM;
    }

    return euGuardado;
  }


  /* ------------------------------------------------------------
     Lixeira
     ------------------------------------------------------------
     Três ações, todas decididas pelo banco. A tela só chama e
     mostra o que voltar — inclusive o erro, que já vem escrito
     em português de dentro do Postgres.
     ------------------------------------------------------------ */

  function exigeServidor() {
    const sb = temServidor();
    if (!sb) throw new Error('Sem internet. Isto precisa de conexão — tente de novo quando o sinal voltar.');
    return sb;
  }

  async function mandarParaLixeira(id) {
    const r = await exigeServidor().rpc('apagar_formulario', { alvo: id });
    if (r.error) throw new Error(r.error.message || 'Não consegui apagar.');
  }

  async function restaurarDaLixeira(id) {
    const r = await exigeServidor().rpc('restaurar_formulario', { alvo: id });
    if (r.error) throw new Error(r.error.message || 'Não consegui restaurar.');
  }

  /* Sem volta. Só da lixeira, e só o banco deixa. */
  async function apagarDeVez(id) {
    const r = await exigeServidor().from('formularios').delete().eq('id', id).select('id');
    if (r.error) throw new Error(r.error.message || 'Não consegui apagar.');

    /* delete que não casa linha nenhuma volta sem erro e sem
       dados: para o RLS, "não pode" e "não existe" são a mesma
       resposta. Sem esta conferência, a tela diria que apagou. */
    if (!r.data || !r.data.length) {
      throw new Error('Nada foi apagado. O formulário já não existia, ou seu perfil não é administrador.');
    }
  }


  /* ------------------------------------------------------------
     Etiquetas
     ------------------------------------------------------------
     DOIS EIXOS, NÃO UM. O parecer e o estado não se excluem —
     se multiplicam, e a combinação que mais importa é justamente
     a que uma etiqueta só esconderia:

       não aprovado + assinado
         o imóvel tinha problema, o cliente aceitou seguir assim
         mesmo, e o prazo está correndo.

     Numa etiqueta só isso vira "não aprovado" OU "assinado", e
     qualquer uma das duas, sozinha, dá a impressão errada.

     O parecer só aparece onde significa alguma coisa: o Doc 102
     é o cliente informando aparelhos, não tem o que aprovar.
     ------------------------------------------------------------ */

  function etiquetaParecer(doc) {
    const d = doc.dados || {};

    if (doc.tipo === 'medicao') {
      if (d.parecerFinal === 'aptos')     return { texto: 'aprovado',     classe: 'ok' };
      if (d.parecerFinal === 'nao-aptos') return { texto: 'não aprovado', classe: 'erro' };
      return { texto: 'sem parecer', classe: 'aviso' };
    }

    if (doc.tipo === 'montagem') {
      const itens = d.itens || {};
      let nao = 0, faltam = 0;

      Object.keys(itens).forEach(function (k) {
        const r = itens[k].resposta;
        if (r === 'nao') nao += 1;
        else if (!r) faltam += 1;
      });

      /* Conta só o que está gravado: uma montagem sincronizada
         com o checklist pela metade tem menos chaves que itens,
         e dizer "tudo conforme" nesse caso seria mentira. */
      const respondidos = Object.keys(itens).length - faltam;

      if (nao) return { texto: nao + ' não conforme', classe: 'erro' };
      if (respondidos < 36) return { texto: 'incompleto', classe: 'aviso' };
      return { texto: 'tudo conforme', classe: 'ok' };
    }

    return null;   // itens-extras não tem parecer
  }

  function etiquetaEstado(doc) {
    if (doc.status === 'assinado')   return { texto: 'assinado',       classe: 'ok' };
    if (doc.status === 'cancelado')  return { texto: 'cancelado',      classe: '' };
    if (doc.status === 'preenchido') return { texto: 'não assinado',   classe: 'aviso' };
    return { texto: 'não preenchido', classe: '' };
  }

  function pintarEtiqueta(et) {
    if (!et) return '';
    return '<span class="tag' + (et.classe ? ' ' + et.classe : '') + '">' +
           escapar(et.texto) + '</span>';
  }


  /* ------------------------------------------------------------
     Documentos da equipe
     ------------------------------------------------------------
     As telas de campo listam o que está NESTE aparelho. Isto aqui
     é o outro lado: o que está no servidor, da equipe.

     Quem vê o quê não é decidido aqui — é o RLS. Um gerente
     recebe a loja dele, o administrador recebe tudo, e um
     consultor recebe só o que é dele. Por isso a tela chama sem
     filtro: o filtro já veio de fábrica.
     ------------------------------------------------------------ */

  async function listarDaEquipe(tipo, limite) {
    const sb = temServidor();
    if (!sb) return null;   // null = não deu para perguntar, diferente de lista vazia

    const r = await sb
      .from('formularios_sem_token')
      .select('id,tipo,autor,loja,cliente,contrato,status,dados,atualizado_em')
      .eq('tipo', tipo)
      .order('atualizado_em', { ascending: false })
      .limit(limite || 40);

    if (r.error) {
      console.warn('Não listei os documentos da equipe.', r.error);
      return null;
    }

    const linhas = r.data || [];
    const nomes = await nomesDosAutores(sb, linhas.map(function (l) { return l.autor; }));

    linhas.forEach(function (l) { l.autorNome = nomes[l.autor] || ''; });
    return linhas;
  }

  /* O banco decide quais perfis esta pessoa alcança. Quem não
     alcança recebe mapa vazio e a tela fica sem o nome — que é
     o lado certo de errar. */
  async function nomesDosAutores(sb, ids) {
    const unicos = Array.from(new Set((ids || []).filter(Boolean)));
    if (!unicos.length) return {};

    const r = await sb.from('perfis').select('id,nome,email').in('id', unicos);
    if (r.error || !r.data) return {};

    const mapa = {};
    r.data.forEach(function (p) {
      mapa[p.id] = (p.nome && p.nome.trim()) || p.email || 'sem nome';
    });
    return mapa;
  }


  /* ------------------------------------------------------------
     Miudezas
     ------------------------------------------------------------ */

  function agora() { return new Date().toISOString(); }

  function novoId(prefixo) {
    const r = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
    return prefixo + '-' + r;
  }

  function escapar(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function dataCurta(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR');
  }

  /* Baixar ou deixar a pessoa escolher a pasta.

     A ORDEM IMPORTA: quem chama tem de pedir a pasta ANTES de
     montar o PDF. O diálogo só abre enquanto o toque ainda vale
     para o navegador, e isso dura poucos segundos — gerar
     primeiro faria o diálogo ser recusado justamente nos
     documentos mais pesados, que são os que têm mais fotos. */

  async function escolherPasta(nomeSugerido) {
    if (!window.showSaveFilePicker) return null;

    try {
      return await window.showSaveFilePicker({
        suggestedName: nomeSugerido,
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
      });
    } catch (erro) {
      if (erro && erro.name === 'AbortError') return 'cancelado';
      return null;   // navegador recusou; o chamador baixa do jeito comum
    }
  }

  async function entregar(destino, blob, nome) {
    if (destino && destino !== 'cancelado') {
      const escrita = await destino.createWritable();
      await escrita.write(blob);
      await escrita.close();
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function podeCompartilharArquivo() {
    try {
      const teste = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' });
      return !!(navigator.canShare && navigator.canShare({ files: [teste] }));
    } catch (e) {
      return false;
    }
  }

  async function compartilhar(blob, nome) {
    const arquivo = new File([blob], nome, { type: 'application/pdf' });

    try {
      await navigator.share({ files: [arquivo], title: nome });
    } catch (erro) {
      /* Fechar o menu sem escolher nada não é erro. */
      if (!erro || erro.name !== 'AbortError') throw erro;
    }
  }


  return {
    armazem: armazem,
    fotos: fotos,
    comprimir: comprimir,
    receber: receber,
    bytesDasFotos: bytesDasFotos,
    temServidor: temServidor,
    eu: eu,
    etiquetaParecer: etiquetaParecer,
    etiquetaEstado: etiquetaEstado,
    pintarEtiqueta: pintarEtiqueta,
    listarDaEquipe: listarDaEquipe,
    mandarParaLixeira: mandarParaLixeira,
    restaurarDaLixeira: restaurarDaLixeira,
    apagarDeVez: apagarDeVez,
    agora: agora,
    novoId: novoId,
    escapar: escapar,
    dataCurta: dataCurta,
    escolherPasta: escolherPasta,
    entregar: entregar,
    podeCompartilharArquivo: podeCompartilharArquivo,
    compartilhar: compartilhar
  };
})();

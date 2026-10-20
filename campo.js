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

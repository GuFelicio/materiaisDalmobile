/* ============================================================
   TELA DOS ITENS — compartilhada entre os documentos de campo

   Desenha os blocos, os itens, as respostas, as observações, as
   fotos e os itens acrescentados à mão. É a maior parte da tela
   de qualquer checklist de obra, e é idêntica na vistoria de
   equipe e na vistoria com o cliente.

   Está aqui, e não copiada em cada página, porque as regras
   sutis moram neste código: o id com acaso junto do relógio,
   tirar um item levando a resposta dele, não conforme abrindo a
   observação sozinho, tocar de novo para desmarcar. Duplicadas,
   bastaria uma cópia receber uma correção para as duas telas
   passarem a se comportar diferente — e ninguém perceber, porque
   as duas continuariam "funcionando".

   Uso:

       const Itens = TelaItens({
         caixa:   document.getElementById('blocos'),
         receita: PDFMontagem,          // ou PDFVistoria
         ficha:   function () { return atual; },
         guardar: guardar,              // salva a ficha
         aoMudar: pintarEstado          // repinta o resto da tela
       });

       Itens.desenhar();                // monta tudo
       Itens.pintarContas();            // só os contadores
       Itens.limparPrevias();           // ao sair da ficha

   O módulo NÃO conhece armazenamento nem sincronia: ele avisa
   que mudou e quem chamou decide o que fazer. É o que permite a
   mesma tela servir um documento interno e um que o cliente
   assina.
   ============================================================ */

window.TelaItens = function (config) {
  const C = window.Campo;
  const caixa = config.caixa;
  const receita = config.receita;

  const ficha = config.ficha;
  const guardar = config.guardar || function () {};
  const aoMudar = config.aoMudar || function () {};

  /* Endereços de pré-visualização das fotos. Vivem aqui porque
     quem cria o URL é quem precisa revogá-lo; espalhar isso pela
     página foi o que já deixou memória presa antes. */
  const previas = {};

  function dados() {
    const f = ficha();
    return f ? f.dados : null;
  }

  /* A lista de verdade: a receita mais o que foi acrescentado
     nesta ficha. */
  function blocos() {
    return receita.blocos(dados());
  }


  /* ------------------------------------------------------------
     Itens acrescentados à mão
     ------------------------------------------------------------
     A obra traz coisa que o checklist não previu. Antes isso só
     cabia em "observações gerais", onde não responde, não conta
     e não recebe foto.

     O id leva acaso junto com o relógio: duas fichas podem ser
     preenchidas no mesmo milissegundo em aparelhos diferentes e
     subir para o mesmo contrato. Dois itens com o mesmo id
     compartilhariam resposta e foto, calados.
     ------------------------------------------------------------ */
  function novoIdDeItem() {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function acrescentarItem(bloco) {
    const area = document.createElement('div');
    area.className = 'acrescentar';

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mais';
    b.textContent = '+ acrescentar item';

    const forma = document.createElement('div');
    forma.className = 'acrescentar-forma oculto';

    const campo = document.createElement('input');
    campo.type = 'text';
    campo.placeholder = 'O que verificar';
    campo.autocomplete = 'off';

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'mais firme';
    ok.textContent = 'Incluir';

    function abrir() {
      forma.classList.remove('oculto');
      b.classList.add('oculto');
      campo.focus();
    }

    function fechar() {
      forma.classList.add('oculto');
      b.classList.remove('oculto');
      campo.value = '';
    }

    function incluir() {
      const texto = campo.value.trim();
      if (!texto) { campo.focus(); return; }

      const d = dados();
      d.extras = Array.isArray(d.extras) ? d.extras : [];
      d.extras.push({ id: novoIdDeItem(), bloco: bloco.id, texto: texto });

      fechar();
      guardar();
      desenhar();
    }

    b.addEventListener('click', abrir);
    ok.addEventListener('click', incluir);
    campo.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') incluir();
      if (e.key === 'Escape') fechar();
    });

    forma.append(campo, ok);
    area.append(b, forma);
    return area;
  }

  /* Tirar um item acrescentado leva junto a resposta e as fotos
     dele. Sem isso, a contagem passaria a somar uma resposta de
     um item que ninguém mais vê. */
  function tirarExtra(id) {
    const d = dados();
    d.extras = (d.extras || []).filter(function (x) { return x.id !== id; });

    const resposta = (d.itens || {})[id];
    if (resposta) {
      (resposta.fotos || []).forEach(function (f) {
        C.fotos.apagar(f.id);
        if (previas[f.id]) { URL.revokeObjectURL(previas[f.id]); delete previas[f.id]; }
      });
      delete d.itens[id];
    }

    guardar();
    desenhar();
  }


  /* ------------------------------------------------------------
     Desenho
     ------------------------------------------------------------ */

  function desenhar() {
    caixa.innerHTML = '';
    if (!ficha()) return;

    blocos().forEach(function (bloco) {
      const cab = document.createElement('div');
      cab.className = 'bloco-titulo';
      cab.innerHTML = '<h2>' + C.escapar(bloco.titulo) + '</h2>' +
                      '<span class="conta" data-bloco="' + bloco.id + '"></span>';
      caixa.appendChild(cab);

      bloco.itens.forEach(function (item) {
        caixa.appendChild(montarItem(bloco, item));
      });

      caixa.appendChild(acrescentarItem(bloco));
    });

    pintarContas();
  }

  /* Quantos faltam em cada bloco. Com dezenas de itens, rolar de
     volta para procurar o que ficou em branco é o jeito mais
     rápido de desistir do formulário. */
  function pintarContas() {
    const d = dados();
    if (!d) return;

    blocos().forEach(function (bloco) {
      const alvo = caixa.querySelector('.conta[data-bloco="' + bloco.id + '"]');
      if (!alvo) return;

      const respostas = d.itens || {};
      const faltam = bloco.itens.filter(function (i) {
        return !(respostas[i.id] || {}).resposta;
      }).length;

      alvo.textContent = faltam
        ? faltam + ' de ' + bloco.itens.length + ' sem resposta'
        : 'completo';
      alvo.className = 'conta ' + (faltam ? 'falta' : 'pronto');
    });
  }

  /* A classe do item sai de uma função só porque ela é recalculada
     ao responder. Montada à mão nos dois lugares, o segundo
     esquecia o "acrescentado" e a marca do item sumia assim que
     alguém respondia — defeito que existiu de verdade. */
  function classeDoItem(item, resposta) {
    return 'item' +
      (resposta.resposta === 'nao' ? ' nao' : '') +
      (item.extra ? ' acrescentado' : '');
  }

  function montarItem(bloco, item) {
    const v = receita.VOCABULARIO[bloco.vocabulario];
    const d = dados();

    const resposta = d.itens[item.id] ||
                     (d.itens[item.id] = { resposta: '', obs: '', fotos: [] });

    const caixaItem = document.createElement('div');
    caixaItem.className = classeDoItem(item, resposta);

    caixaItem.innerHTML =
      '<h3>' + C.escapar(item.texto) +
        (item.extra ? '<button type="button" class="tirar-extra" title="Tirar este item">×</button>' : '') +
      '</h3>' +
      '<div class="escolha">' +
        '<button type="button" class="sim" data-v="ok">'  + C.escapar(v.ok)  + '</button>' +
        '<button type="button" class="nao" data-v="nao">' + C.escapar(v.nao) + '</button>' +
        '<button type="button" class="na"  data-v="na">'  + C.escapar(v.na)  + '</button>' +
      '</div>' +
      '<div class="extras">' +
        '<label class="anexar"><span>+</span> Foto' +
          '<input type="file" accept="image/*" capture="environment" hidden multiple>' +
        '</label>' +
        '<button type="button" class="obs-btn" aria-expanded="false">Observação</button>' +
      '</div>' +
      '<div class="obs-campo" hidden>' +
        '<textarea placeholder="O que foi encontrado"></textarea>' +
      '</div>' +
      '<div class="fotos"></div>';

    const botaoTirar = caixaItem.querySelector('.tirar-extra');
    if (botaoTirar) {
      /* Sem confirmar: o item foi escrito agora, por quem está
         olhando, e devolver é só escrever de novo. Confirmação em
         cada toque treina a pessoa a dizer sim sem ler. */
      botaoTirar.onclick = function () { tirarExtra(item.id); };
    }

    const anexar = caixaItem.querySelector('.anexar');
    const obsBtn = caixaItem.querySelector('.obs-btn');
    const obsCampo = caixaItem.querySelector('.obs-campo');
    const obs = caixaItem.querySelector('textarea');
    const fotos = caixaItem.querySelector('.fotos');

    obs.value = resposta.obs || '';
    obs.oninput = function () { resposta.obs = obs.value; guardar(); };

    obsBtn.onclick = function () {
      const abrindo = obsCampo.hidden;
      obsCampo.hidden = !abrindo;
      obsBtn.setAttribute('aria-expanded', String(abrindo));
      if (abrindo) obs.focus();
    };

    caixaItem.querySelectorAll('.escolha button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(resposta.resposta === b.dataset.v));

      b.onclick = function () {
        /* Tocar de novo no que já estava marcado desmarca — um
           "conforme" dado por engano precisa ter volta. */
        resposta.resposta = (resposta.resposta === b.dataset.v) ? '' : b.dataset.v;

        caixaItem.querySelectorAll('.escolha button').forEach(function (o) {
          o.setAttribute('aria-pressed', String(resposta.resposta === o.dataset.v));
        });

        caixaItem.className = classeDoItem(item, resposta);

        /* Não conforme abre a observação sozinho: é ali que se
           diz o que precisa ser corrigido. */
        if (resposta.resposta === 'nao' && obsCampo.hidden) {
          obsCampo.hidden = false;
          obsBtn.setAttribute('aria-expanded', 'true');
        }

        pintar();
        guardar();
        aoMudar();
        pintarContas();
      };
    });

    function pintar() {
      anexar.classList.toggle('vazio', !(resposta.fotos || []).length);
      if (resposta.obs && obsCampo.hidden) {
        obsCampo.hidden = false;
        obsBtn.setAttribute('aria-expanded', 'true');
      }
    }

    anexar.querySelector('input').onchange = async function () {
      const novas = await C.receber(this.files, function () {
        alert('Não consegui usar uma das fotos.');
      });
      this.value = '';

      resposta.fotos = (resposta.fotos || []).concat(novas);
      await guardar();
      desenharFotos(fotos, resposta, pintar);
      pintar();
    };

    desenharFotos(fotos, resposta, pintar);
    pintar();

    return caixaItem;
  }

  function desenharFotos(area, resposta, depois) {
    area.innerHTML = '';

    (resposta.fotos || []).forEach(function (f, i) {
      const d = document.createElement('div');
      d.className = 'foto';
      d.innerHTML =
        '<img alt="">' +
        '<button type="button" class="tirar" title="Remover">×</button>' +
        '<input type="text" placeholder="Legenda" value="' + C.escapar(f.legenda || '') + '">';

      const img = d.querySelector('img');

      C.fotos.ler(f.id).then(function (reg) {
        if (!reg) return;
        if (previas[f.id]) URL.revokeObjectURL(previas[f.id]);
        previas[f.id] = URL.createObjectURL(reg.blob);
        img.src = previas[f.id];
      });

      d.querySelector('input').oninput = function () {
        resposta.fotos[i].legenda = this.value;
        guardar();
      };

      d.querySelector('.tirar').onclick = function () {
        C.fotos.apagar(f.id);
        if (previas[f.id]) { URL.revokeObjectURL(previas[f.id]); delete previas[f.id]; }
        resposta.fotos.splice(i, 1);
        guardar();
        desenharFotos(area, resposta, depois);
        if (depois) depois();
      };

      area.appendChild(d);
    });
  }

  function limparPrevias() {
    Object.keys(previas).forEach(function (id) {
      URL.revokeObjectURL(previas[id]);
      delete previas[id];
    });
  }

  return {
    desenhar: desenhar,
    pintarContas: pintarContas,
    limparPrevias: limparPrevias,
    blocos: blocos
  };
};

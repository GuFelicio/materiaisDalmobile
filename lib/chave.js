/* ============================================================
   A CHAVE DE UM NOME — Dalmóbile
   ------------------------------------------------------------
   O NOME é o que a pessoa digitou: é o que a equipe reconhece ao
   abrir o Drive, e fica como foi digitado da primeira vez.
   A CHAVE é como o sistema identifica aquilo, e ela ignora o que
   não distingue nada.

   ⚠️ SEM ISTO, "OR-7", "or-7" e "OR 7" são três contratos — três
   pastas que parecem certas para quem olha, com um terço dos
   documentos em cada. "Carlos e Bia" e "carlos e bia", dois
   clientes. Ninguém digita igual duas vezes.

   O que ela NÃO resolve, e é honesto dizer: "OR-07" e "OR-7"
   continuam diferentes. Adivinhar que o zero à esquerda não
   conta seria inventar regra de numeração que é do cliente, não
   nossa. Para esse caso o remédio é oferecer a lista do que já
   existe em vez de campo livre — e é por isso que a tela do
   projeto usa ESTA MESMA função para montar a lista.

   ------------------------------------------------------------
   POR QUE ESTE ARQUIVO EXISTE SOZINHO

   Duas partes do sistema precisam concordar sobre o que é "o
   mesmo cliente": o lib/drive.js, que decide em qual pasta a
   foto entra, e a tela, que monta a lista de clientes conhecidos.
   Se cada uma tivesse a sua cópia, elas envelheceriam em
   direções diferentes — a lista mostraria um cliente e o Drive
   criaria outra pasta, e ninguém ligaria as duas coisas.

   Ele vive em lib/ porque lib/ está fora de functions/, então o
   Cloudflare o publica como arquivo estático e o navegador
   alcança. ⚠️ Por isso mesmo ele NÃO PODE guardar segredo —
   e não guarda: é uma função pura, sem rede e sem estado.
   ============================================================ */

export function chaveDe(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

# As provas

```
node provas/provar-foto.mjs            --defeitos
node provas/provar-assinado-drive.mjs  --defeitos
node provas/provar-dados.mjs           --defeitos
node provas/provar-cliente-seletor.mjs --defeitos
node provas/provar-jornada.mjs           --defeitos
```

Hoje: **92 provas e 63 defeitos**, todos pegos.

---

## `--defeitos` não é opcional

Prova verde não diz nada sobre o que ela pega. O que diz é a prova ficar
**vermelha quando o defeito volta**.

Esse modo reintroduz cada defeito, um a um, numa cópia do código, e exige que
alguma prova quebre. Antes de cada defeito ele roda a cópia **sem** defeito: se
ela não vier verde, o arreio está mentindo e ele grita `ARREIO QUEBRADO` em vez
de dizer "pego".

Três coisas que ele pode responder:

| | o que significa |
|---|---|
| `✓` | o defeito foi pego pela prova nomeada ao lado |
| `✗ IMPUNE` | o defeito voltou e **nenhuma prova viu**. Falta uma prova |
| `! DESATUALIZADO` | o trecho não existe mais. O defeito precisa ser reescrito |
| `! ARREIO QUEBRADO` | a cópia sã já estava vermelha. Nada ali prova nada |

Na primeira versão deste arreio os 21 defeitos deram "pego", e **era mentira**:
o Node guarda módulo em cache pelo caminho, e a pasta temporária era sempre a
mesma — o `lib/drive.js` do primeiro defeito ficava cacheado e os 21 testes
rodavam todos contra ele. Só apareceu porque todos acusavam a *mesma* primeira
vermelha. Hoje cada defeito tem pasta própria, sorteada, fora do repo.

---

## O que cada suíte cobre

### `provar-foto.mjs` — 31 provas, 25 defeitos
A rota `/api/foto`: as fotos da apresentação no Drive. A árvore
`APRESENTAÇÕES - MATERIAIS > pessoa > cliente > projeto`, as duas permissões
(baixar exige quem **vê**, subir exige quem **altera**), o id do Drive que
nunca sai na resposta, a reserva das pastas, a validação do que entra.

### `provar-assinado-drive.mjs` — 19 provas, 10 defeitos
O arquivamento do documento assinado. A árvore
`Documentos assinados > contrato > gaveta da ficha`, a normalização do
contrato (`OR-7` = `or-7` = `OR 7`), o "procurar antes de subir", e a promessa
de **nunca estourar** — quem chama está processando uma assinatura já
registrada.

### `provar-dados.mjs` — 15 provas, 10 defeitos
O `dados.js`: a deduplicação dos clientes conhecidos, o **tudo ou nada por
ambiente** ao trazer fotos do Drive, a redução antes de subir.

### `provar-jornada.mjs` — 18 provas, 12 defeitos
O `jornada.js` é DADO, não código: ele é editado toda vez que a loja muda um
passo, uma fala ou um material. As provas olham a integridade — id de material
que não existe na Central, trecho do vídeo com o cargo errado, fala sem
procedência, passo órfão numa fase que não existe. Nada disso aparece na tela:
um id com erro de digitação vira um chip cinza igual ao de um material que
ainda não foi feito.

### `provar-cliente-seletor.mjs` — 9 provas, 6 defeitos
⚠️ **Esta precisa do Playwright.** Ela abre o `projeto.html` num navegador de
verdade e mexe na tela, porque lógica de interface com quatro estados não se
confere lendo.

```
npm i -D playwright && npx playwright install chromium
```

Sem ele a suíte **avisa alto e sai com código 0** — sair com erro faria o CI
vermelho por falta de ferramenta, e sair calado seria pior: alguém leria
"0 vermelhas" e acharia que a tela foi conferida. As outras três rodam com Node
puro, sem instalar nada.

---

## O princípio dos dublês

**Dublê mais generoso que o serviço real é pior que dublê nenhum: ele dá verde
para o que o serviço recusaria.**

Foi assim que 102 provas deste projeto passaram com o anexo sempre nulo —
o dublê não conhecia o download do PDF. E foi assim que a coluna `tipo`
faltando em `/api/documento` passou batida: o dublê devolvia todas as colunas,
ignorando o `select=`.

Então, aqui:

- a busca do Drive só filtra lixeira se a consulta pedir `trashed = false`;
- nome repetido na mesma pasta é **aceito**, porque o Drive aceita;
- o PostgREST devolve `[]` com status **200** quando a RLS barra um PATCH,
  não 403;
- o `select=` é respeitado em todo dublê de banco;
- `reservar_pasta_drive` com pasta nula só **lê**, e com pasta usa
  `on conflict do nothing`.

O dublê do Drive mora em **`duble-drive.mjs`, um só**, compartilhado pelas
suítes que precisam dele. Dois dublês do mesmo serviço envelhecem em direções
diferentes.

---

## O que ainda NÃO tem prova

**A lógica do `/api/autentique`** em volta do arquivamento: os três estados da
reserva, os dois e-mails, a recusa, a reabertura. Aquelas 102 provas morreram
com o container da sessão onde foram escritas, porque nunca foram para o repo.
A suíte do assinado cobre o Drive, que é onde estava a falha — não substitui
aquela.

**As telas de campo** (medição, montagem, vistoria) e o `campo.js`.

**O `projeto.html` além do seletor de cliente**: a montagem do PDF, a
reposição de fotos pelo nome, o orçamento.

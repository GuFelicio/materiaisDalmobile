# Central de Peças — Dalmóbile

Sistema interno da Dalmóbile (móveis planejados, lojas em São José dos
Campos e Caraguatatuba, marca do grupo Orizon). Ele faz três coisas:

1. **Gera peças de marketing** — cards de WhatsApp, avisos de agendamento e
   entrega, boas-vindas impresso. Desenhadas por código, não por template.
2. **Gera documentos de obra** — termo de medição, vistoria de montagem,
   vistoria de equipe, checklist de eletros, apresentação de projeto,
   orçamento.
3. **Coleta assinatura do cliente** nos documentos que precisam dela, pela
   Autentique, e guarda o documento assinado com histórico por rodada.

Produção: **materiais.luminamkt.co**

---

## Regra zero

**A assinatura dispara prazo contratual.** Marcar um documento como assinado
faz começar a contar produção, entrega e montagem. Por isso o sistema é
desconfiado por desenho: quem bate na porta dizendo "o documento tal foi
assinado" não é acreditado — nós perguntamos à Autentique.

Três consequências que atravessam o código todo:

- **Nada que decide prazo roda no navegador.** O navegador pede; quem decide
  é a Function no Cloudflare ou a função no Postgres.
- **Nada assinado se apaga.** Reabrir acrescenta uma rodada; a anterior fica
  guardada, imutável, com o documento dela.
- **Falha fecha, nunca abre.** Leitura que não chegou esconde o item em vez
  de mostrar. Permissão que não respondeu é "não", nunca "talvez".

---

## Onde roda — três camadas

```
NAVEGADOR            páginas estáticas, funcionam offline,
(celular na obra)    guardam no IndexedDB e sincronizam depois
       │
       │  fetch /api/*
       ▼
CLOUDFLARE PAGES     functions/api/*.js — guardam as chaves secretas
FUNCTIONS            e são as únicas que falam com a Autentique e o Resend
       │
       │  PostgREST + RPC
       ▼
SUPABASE             Postgres com RLS. A permissão de verdade mora aqui:
(Postgres)           nenhuma trava do navegador é a proteção
```

**Variáveis** (nomes só; os valores vivem no painel do Cloudflare, nunca no
repositório): `SUPABASE_URL`, `SUPABASE_SECRET`, `AUTENTIQUE_TOKEN`,
`AUTENTIQUE_WEBHOOK_SECRET`, `RESEND_API_KEY`, e as opcionais
`AUTENTIQUE_SANDBOX`, `AUTENTIQUE_TETO_MB`, `EMAIL_REMETENTE`,
`EMAIL_TESTE_PARA`, `EMAIL_RESPONDER_PARA`.

⚠️ **Variável nova só vale para deployment novo.** Salvar no painel e não
refazer o deploy é o motivo mais comum de "a rota voltou 503".

---

## Mapa de arquivos

### Páginas (raiz — e elas FICAM na raiz)

| Arquivo | URL | O que é |
|---|---|---|
| `index.html` | `/` | O Central: gera as peças, lista materiais e links, e tem a aba Contas (painel do administrador) |
| `medicao.html` | `/medicao` | Termo de medição. Offline, com fotos |
| `montagem.html` | `/montagem` | Vistoria de Equipe de Montagem — documento interno, 21 itens |
| `vistoria.html` | `/vistoria` | Vistoria de Montagem — o cliente assina a liberação da obra, 15 itens |
| `formularios.html` | `/formularios` | Tela interna que cria e acompanha o Checklist de Eletros |
| `itens-extras.html` | `/itens-extras?t=TOKEN` | A tela **do cliente**. Sem login: o token do link é tudo que ele tem |
| `projeto.html` | `/projeto` | Apresentação de projeto, em cima de um PDF base |
| `orcamento.html` | `/orcamento` | Orçamento, em cima de um PDF base |
| `usuarios.html` | `/usuarios` | Criar conta, trocar senha, bloquear quem saiu |
| `nova-senha.html` | `/nova-senha` | Primeira senha e redefinição |

**Por que não mover para pastas:** as URLs estão em favorito da equipe, no
botão do e-mail de aviso (`materiais.luminamkt.co/vistoria`) e no
`location.href` de dentro do próprio sistema. E o `sw.js` precisa da raiz —
o escopo de um service worker é a pasta dele, então dentro de `js/` ele
deixaria de controlar as telas de obra e o offline morreria.

### Compartilhados

| Arquivo | Quem usa | O que é |
|---|---|---|
| `auth.js` | todas | Sessão do Supabase, tela de entrada, `window.dalmobileAuth`. Tem a porta `window.AUTH_SEM_TRAVA`, que as provas usam |
| `campo.js` | telas de obra | A maquinaria de campo: IndexedDB, fotos, sincronia, etiquetas, chamadas aos endpoints, montadores |
| `dados.js` | projeto, orçamento | Guarda a **ficha** da apresentação e do orçamento. O PDF não é guardado — é montado na hora, então trabalho antigo reaberto sai com a diagramação nova. As fotos não sobem: guarda nome e tamanho, e ao reabrir casa os arquivos da pasta |
| `tela-doc.js` | montagem, vistoria | A tela inteira das duas, dirigida por `window.DOC_CONFIG`. Foi o que tirou 1248 linhas duplicadas |
| `tela-itens.js` | montagem, vistoria | Os blocos, itens, fotos e os campos acrescentados à mão |
| `lib/assinado.js` | `/api/documento`, `/api/autentique` | Achar, baixar e nomear o PDF assinado na Autentique. **Fora de `functions/` de propósito:** lá dentro cada arquivo vira uma rota |

### Geradores de PDF e de peça

| Arquivo | O que gera |
|---|---|
| `pecas.js` | As peças de marketing, desenhadas em **canvas** (não PDF): card de WhatsApp, pós-visita, agendamento, entrega, aniversário |
| `pdf-101.js` | Os PDFs da medição (apto, responsabilidade, suspensão) |
| `pdf-102.js` | O PDF do Checklist de Eletros |
| `pdf-doc.js` | **O motor** dos documentos de obra: capa, blocos, itens, fotos, parecer, assinatura, rodapé. Recebe uma receita |
| `pdf-montagem.js` | Só a receita da Vistoria de Equipe: 21 itens em 3 blocos |
| `pdf-vistoria.js` | Só a receita da Vistoria de Montagem: 15 itens, o parecer e quem assina. Tem duas receitas — a liberação e o pedido de assistência, do mesmo registro, filtrado |

### Endpoints (`functions/api/`)

| Rota | O que faz | Quem chama |
|---|---|---|
| `/api/assinatura` | Cria o documento na Autentique, assina pela Dalmóbile, registra no banco. Também **cancela** um pedido não assinado | a tela, com a sessão da pessoa |
| `/api/autentique` | **Webhook.** Recebe `document.finished` e `signature.rejected`, confere com a Autentique, marca no banco e manda os dois e-mails | a Autentique |
| `/api/documento` | Entrega o PDF assinado, buscando na hora. Aceita `versao` para trazer o de uma rodada encerrada | a tela |
| `/api/formulario` | A porta do **cliente**: o token do link abre um formulário, nunca uma lista, e devolve só o que a tela dele precisa | `itens-extras.html` |
| `/api/usuarios` | Criar conta, senha, bloquear. Guarda a chave secreta e confere se quem pediu é admin | `usuarios.html` |

### Assets (buscados por string em tempo de execução — cuidado ao mover)

`Krub-Medium.ttf`, `Krub-Bold.ttf` (as fontes dos PDFs e das peças),
`imgs/dalmoSJC_preto_1.png`, `imgs/logoDalmo_caraguaPreto.png`,
`bases-sjc.pdf`, `bases-cgt.pdf` (os PDFs base do orçamento),
`vendor/pdf-lib.min.js`, `vendor/fontkit.umd.min.js`.

Esses caminhos estão escritos **como texto dentro do JS** — `pecas.js` faz
`url(Krub-Medium.ttf)`, `pdf-101.js` tem `'imgs/dalmoSJC_preto_1.png'`.
Mover um deles sem achar todas as strings não dá erro: o PDF sai sem a
logo, calado. É o motivo de a arrumação em pastas ter sido descartada.

`imgsRef/` são referências visuais de trabalho — não fazem parte do site,
mas hoje são publicadas junto com ele.

⚠️ **`marca.png` (116 KB na raiz) É USADO — não apague.** Ele é a etiqueta
aplicada no canto inferior direito de cada foto de ambiente da apresentação:
`projeto.html` o declara em `MARCA.arquivo`, com `MARCA.usar = true`.

Esta linha já disse o contrário, e a correção fica registrada porque o engano
é fácil de repetir: buscar `marca` no código acha o campo "modelo/marca" do
eletro e dá a impressão de que o arquivo está solto. Quem decide é a busca por
`marca.png`. Apagar não daria erro — as fotos sairiam sem etiqueta, caladas,
exatamente como o resto dos assets buscados por string.

---

## Os documentos, e o que acontece com cada um

| Documento | Tipo no banco | Quem assina | Reabre? |
|---|---|---|---|
| Termo de medição | `medicao` | o cliente (apto, ou inapto prosseguindo) ou a Dalmóbile (inapto a corrigir) | sim, `reabrir_medicao` |
| Vistoria de Equipe de Montagem | `montagem` | ninguém — é controle interno | — |
| Vistoria de Montagem | `vistoria` | depende do parecer | sim, `reabrir_vistoria`, sem limite de rodadas |
| Checklist de Eletros | `itens-extras` | o cliente, pela tela dele | — |

### A Vistoria de Montagem, que é a mais cheia de regra

Cinco estados, e **só dois são escolha de alguém**:

```
item em branco           → VISTORIA INCOMPLETA     (não assina)
nenhuma pendência        → OBRA APROVADA SEM RESTRIÇÃO  → o CLIENTE assina
pendência, sem escolha   → PARECER NÃO DEFINIDO    (não assina)
pendência + assistência  → APROVADA COM ASSISTÊNCIA → o CLIENTE assina
pendência + reprovação   → OBRA REPROVADA          → a DALMÓBILE assina,
                                                      e o cliente recebe
```

"Aprovada sem restrição" **não existe como opção na tela** — é consequência
das respostas. É isso que impede alguém de marcar "sem restrição" com
pendência na lista. Resolveu na hora? O caminho é mudar o item para
Conforme, não contornar o parecer.

A liberação e o pedido de assistência **não são dois documentos**: são dois
jeitos de olhar o mesmo registro. Fossem separados, o vistoriador
preencheria os mesmos 15 itens duas vezes, e nada impediria que
existissem, para o mesmo contrato, uma liberação **e** uma assistência — a
contradição que a regra "se tem assistência, não libera" existe para evitar.

Prazo de assistência: **20 dias úteis, conforme contrato.** É texto fixo, não
campo. Prazo digitado à mão vira promessa particular de quem estava lá, e o
documento assinado passa a dizer coisa diferente do contrato.

---

## Assinatura: o caminho inteiro

```
1. a tela gera o PDF e manda para /api/assinatura
2. a Function recria o plano LENDO O BANCO (não acredita no corpo do pedido)
3. cria o documento na Autentique, assina pela Dalmóbile
4. grava o id no banco ANTES de assinar — se outra requisição chegou
   primeiro, é aqui que se descobre, e o documento novo vai para a lixeira
5. o cliente recebe por WhatsApp (ou por e-mail, na reprovada)
6. ele assina → a Autentique bate em /api/autentique
7. a Function PERGUNTA à Autentique se todos assinaram
8. marcar_assinado() → status assinado + versão imutável com o documento
9. busca o PDF assinado UMA vez e manda dois e-mails:
      equipe  — aviso com o PDF anexo e o botão da Central
      cliente — recibo com o PDF anexo, sem link da Central
```

**Os dois e-mails têm reservas separadas no banco** (`avisado_em` e
`avisado_cliente_em`). O endpoint reserva antes de mandar e devolve a
reserva se o envio falhar, para a Autentique poder repetir. Com uma reserva
só, falha no segundo e-mail faria o primeiro sair duas vezes.

**Sem o PDF pronto, as duas decisões são opostas, de propósito.** A equipe
recebe o aviso igual, com uma linha dizendo que o arquivo ainda estava
sendo gerado — ela tem a Central. O cliente **não** recebe nada e a reserva
dele não é gasta, porque para ele o e-mail *é* o anexo.

**Cancelar ≠ reabrir.** Cancelar é para a rodada que **não** terminou: o
documento é descartado na Autentique **antes** de o banco limpar o ponteiro
(ao contrário, um erro no meio deixaria o cliente com um link vivo para
assinar uma versão abandonada). Reabrir é para a rodada que **terminou**: o
documento fica guardado na versão.

---

## Permissão e vitrine — duas camadas que não se misturam

| | **Permissão** | **Vitrine (cargo)** |
|---|---|---|
| Onde | `perfis.admin / gerente / financeiro / executivo / loja` | `perfis.cargo` + `cargo_oculta` |
| Decide | quem edita a ficha de quem, quem vê a outra loja, quem apaga | o que aparece no Central |
| Quem muda | o administrador | o administrador |
| Onde é imposta | RLS do Postgres | a tela |

Separadas porque **os dois erros têm preços diferentes**. Errar a vitrine
esconde um atalho e alguém reclama no mesmo dia. Errar a permissão expõe
ficha de cliente, e ninguém reclama — porque quem viu o que não devia não
vai contar. Uma tabela só faria um clique de vitrine poder virar um buraco
de permissão.

A matriz guarda **o que está escondido**, não o que está visível: item novo
nasce visível, e a tabela só guarda exceção. No contrário, cada item novo
nasceria invisível para todos os cargos e alguém ficaria sem trabalhar por
uma linha que ninguém sabia que faltava.

**Administrador vê tudo, sempre** — senão um admin se esconderia a aba
Contas e perderia o caminho até o painel onde desfaria o engano.
A aba **Contas não entra na matriz**: é permissão, e liberá-la por cargo
pareceria dar acesso sem dar.

---

## O banco

### Tabelas e visões

| Objeto | O que guarda |
|---|---|
| `perfis` | quem tem acesso: nome, loja, as caixinhas de permissão e o cargo de vitrine |
| `formularios` | todo documento, de todo tipo. `dados` é jsonb |
| `formulario_versoes` | o histórico. Versão de assinatura e de recusa nascem **imutáveis** e carregam o `autentique_id` daquela rodada |
| `formulario_historico` | a visão que a tela lê — versões com nome de quem criou e o parecer daquele momento |
| `formularios_lixeira` | o que foi apagado, para o administrador restaurar |
| `formularios_sem_token` | a lista sem a coluna `token`, para ele nunca aparecer numa listagem |
| `montadores` | quem aparece para escolher na vistoria. Não é conta: não entra, não tem senha |
| `avisos_vistoria` | quem recebe o aviso de vistoria assinada |
| `cargos`, `cargo_oculta` | os cargos de vitrine e a matriz |

### Funções, e quem pode executar

**Só `service_role`** — ou seja, só a Function com a chave secreta, nunca o
navegador:

```
marcar_assinado          marcar_recusa
marcar_avisado           marcar_cliente_avisado
destinatarios_do_aviso
```

**`authenticated`** (a pessoa logada, com RLS conferindo o alcance):

```
registrar_pedido_assinatura   cancelar_pedido_assinatura
reabrir_vistoria              reabrir_medicao
registrar_versao              apagar_formulario / restaurar_formulario
meus_itens_ocultos            pode_gerir_montadores
```

**Ajudantes de leitura** (`eh_admin`, `eh_servidor`, `pode_ver_trabalho`,
`pode_ver_perfil`): qualquer papel executa, porque são usados **dentro** das
políticas de RLS.

⚠️ `eh_servidor()` olha o **papel da conexão**, não `auth.uid()`. Quem não
fez login também tem uid nulo — confundir os dois abriria a porta para o
anônimo.

### Os arquivos SQL, e a ordem importa

Todos idempotentes: rodar de novo não estraga. Mas **rodar um antigo depois
de um novo desfaz o novo, em silêncio**, porque vários se sobrepõem com
`create or replace`.

```
 1  supabase.sql                      o esquema inicial
 2  supabase-formularios.sql
 3  supabase-nomes.sql
 4  supabase-versoes.sql              formulario_versoes
 5  supabase-lixeira.sql              apagar e restaurar
 6  supabase-assinatura.sql           registrar_pedido / marcar_assinado
 7  supabase-permissoes.sql           eh_servidor, pode_ver_trabalho
 8  supabase-recusa.sql               marcar_recusa
 9  supabase-admin.sql
10  supabase-cargos.sql               a coluna gerente
11  supabase-cargos-financeiro.sql    financeiro e executivo + travar_cargos
12  supabase-vistoria.sql             avisos_vistoria
13  supabase-montadores.sql
14  supabase-vistoria-rodadas.sql     reabrir + documento por versão
15  supabase-cancelar-assinatura.sql
16  supabase-aviso-cliente.sql        ⚠️ refaz reabrir_vistoria do nº 14
17  supabase-historico-assinado.sql   ⚠️ refaz marcar_recusa do nº 8
18  supabase-cargos-visiveis.sql      ⚠️ refaz travar_cargos do nº 11
```

**`supabase-o-que-ja-rodou.sql`** lê o banco e diz, arquivo por arquivo, o
que já está aplicado — `rodou`, `FALTA` ou `INCOMPLETO`. Não muda nada.
Use antes de sair conferindo função por função.

Cada arquivo termina com uma **conferência**. Todas as linhas têm de dizer
"certo". Se alguma disser "CONFIRA!", pare ali: o resto não funciona e o
problema só apareceria no primeiro contrato de verdade.

---

## Offline

As telas de obra funcionam sem sinal, porque o medidor trabalha em
apartamento sem rede.

- **`sw.js`** guarda as páginas e os scripts. Tem duas coisas acopladas que
  **precisam andar juntas**: a lista de precache e a constante `VERSAO`.
  Mexeu em arquivo da lista? **Suba a versão.** Senão o aparelho continua com
  a tela velha. Mudou de arquivo sem atualizar a lista? O offline quebra com
  "X is not defined".
- **IndexedDB** (`dalmobile-campo`) guarda as fichas e as fotos. Gaveta nova
  exige **subir a versão do banco**, senão o `onupgradeneeded` não roda.
- A ficha criada em obra pode subir dias depois. O `pedido_em` vai no insert
  de propósito: sem ele, a data de abertura viraria a data da sincronia — e
  o prazo contratual escorregaria para frente sozinho.

---

## As provas

Não são enfeite: elas já pegaram defeito que teria custado contrato.

| Onde | Como rodar | Quantas |
|---|---|---|
| Banco | `bash /var/tmp/pgprova/rodar.sh` (ou um nome só) | 295 |
| Endpoints | `node /tmp/claude-0/tass/teste-*.mjs` | 308 |
| Telas | `node /tmp/claude-0/tela/teste-*.mjs` (Playwright) | 311 |

**A regra que vale mais que o número:** toda prova nova tem de **falhar com
o defeito reintroduzido**. Prova que passa com o código errado não prova
nada — e isso já aconteceu aqui várias vezes, sempre pelo mesmo motivo:
dublê mais generoso que a realidade.

---

## Armadilhas que já custaram caro

Cada uma destas é um bug que aconteceu de verdade. Elas estão aqui porque
nenhuma delas dá erro na hora.

**Dublê generoso concorda com o código errado.** O dublê do `/api/assinatura`
devolvia a ficha inteira ignorando o `select=`; o do `/api/documento` fazia
o mesmo. As duas vezes isso esconder uma coluna que a consulta de verdade
não pedia, e 13 provas passavam felizes. **O dublê tem de ser tão mesquinho
quanto o serviço.**

**O id da Autentique NÃO é UUID com traços.** A API tipa como `UUID!` e
devolve hexadecimal longo e sem traços. A primeira versão do webhook exigia
36 caracteres: todo aviso era descartado em silêncio, a rota devolvia 200, o
painel marcava 100% de entrega, o Error Logs ficava limpo. Falha invisível
dos dois lados. **Rigor só compensa onde ele decide alguma coisa.**

**Coluna que falta no `select=` não dá erro.** Faltou `tipo` na consulta e
toda vistoria caiu no caminho da medição ("Preencha o parecer final"). Mais
tarde, a mesma coluna faltando fez vistoria baixar com o nome do documento
da medição.

**Chave repetida em objeto literal não dá erro** — a última cala a primeira.
`reabertura` estava duas vezes no mapa de motivos, e toda vistoria reaberta
aparecia como "medição reaberta".

**Prova vazia passa sempre.** Uma prova lia `window.__fichaAtual`, que era
`undefined`. Outra testava "admin não se esconde de si mesmo" com um admin
sem cargo — a consulta não achava nada por falta de cargo, não pela trava.
Tirar a trava mantinha 29 provas verdes.

**`create or replace view` não insere coluna no meio.** Ele entende como
renomear a que estava naquela posição e recusa. Coluna nova vai **no fim**.

**Acento em nome de arquivo tem duas formas.** `git add "imgsRef/pós-visita.png"`
não fazia nada (NFD vs NFC). `git add -A imgsRef` funciona.

**O git deixa `.lock` para trás aqui.** Apagar na pasta conectada falha até o
usuário aprovar, então `commit` e `pull` deixam `.lock` dentro do `.git` e o
comando seguinte — inclusive o dele no VS Code — falha com "File exists".

**Claude não tem credencial do GitHub.** O arranjo é: **Claude commita e
avisa "falta o push"; o Gu dá o push.** Já aconteceu eu dizer "commitado no
repositório" com três commits que nunca subiram.

---

## O que falta

- **O domínio do Resend não está verificado.** Enquanto `EMAIL_REMETENTE` não
  apontar para um domínio da Dalmóbile, o remetente é `onboarding@resend.dev`,
  que **só entrega no e-mail da conta Resend**. O e-mail para o cliente não
  chega a cliente nenhum ainda. Para testar, use `EMAIL_TESTE_PARA`.
- **A conta da Autentique é da Lumina, em sandbox.** O Passo 7 do doc de
  integração tem o roteiro da troca.
- `avisos_vistoria` tem só um e-mail — a equipe de verdade não recebe nada
  até cadastrar quem deve receber.
- O histórico de versões existe em montagem e vistoria, **não na medição**.
- Fichas preenchidas antes de `totalDeItens` existir caem num palpite para a
  etiqueta.
- Os itens acrescentados à mão não aparecem marcados como "acrescentado" no
  PDF.
- Os aniversariantes ainda saem do Apps Script.

---

## Quando trabalhar neste repositório

- **Comentário em português**, e explicando **por quê**, não o quê. O código
  diz o que faz; o comentário existe para o próximo não desfazer uma decisão
  achando que é descuido.
- **Prova nova tem de falhar com o defeito de volta.** Se não falhar, ela não
  está medindo o que diz medir.
- **Mexeu em arquivo do precache? Suba a `VERSAO` do `sw.js`.**
- **Nenhuma chave neste repositório.** Nem em comentário, nem em exemplo.
  Tudo que é segredo mora no painel do Cloudflare.
- **Se a mudança afrouxa uma permissão, pare e pergunte.** Afrouxar é a única
  classe de erro aqui que ninguém reporta.

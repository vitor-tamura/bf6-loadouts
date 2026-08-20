# Manter o dataset em dia

Battlefield 6 recebe arma, acessório e ajuste de balanceamento a cada temporada.
Este documento é sobre como isso entra aqui sem trabalho manual repetido e sem
atropelar o que foi corrigido à mão.

```bash
npm run sync              # o que mudou lá fora — não escreve nada
npm run sync:apply      # grava o que dá para gravar
npm run images:download    # busca a foto das armas que ainda não têm
npm test                  # a rede de segurança
```

No repositório, `.github/workflows/sync-data.yml` roda isso toda segunda e
abre um Pull Request quando encontra diferença. Nada vai para produção sozinho:
item novo chega com campos marcados `TODO`, e isso é proposital.

---

## A fonte

O catálogo vem do backend Convex que serve o bf6loadouts.com, cujas balísticas
saem do sym.gg. É a fonte pública mais completa — cadência, velocidade,
capacidade, recarga, escada de dano e compatibilidade acessório-por-arma.

Ela erra, atrasa e às vezes discorda do jogo. Por isso o sincronizador não
sobrescreve: ele compara.

## Por que não é "baixar e sobrescrever"

Uma parte relevante dos números daqui foi corrigida à mão — escadas de dano
medidas no jogo, valores que a fonte tem errados, a compatibilidade filtrada pelas
regras por categoria do Gunsmith. Sobrescrever tudo a cada rodada desfaria esse
trabalho em silêncio, e ninguém perceberia até alguém reclamar que o TTK está
errado.

O script compara **três** valores por campo: o que a fonte diz hoje, o que ela
dizia na última sincronização (`scripts/sync-snapshot.json`) e o que está no
dataset.

| A fonte mudou? | O dataset foi mexido? | O que acontece |
| --- | --- | --- |
| não | — | nada |
| sim | não | **atualiza** — ninguém tinha opinião sobre esse campo |
| sim | sim | **conflito**: relata e não toca |
| não | sim | curadoria local, preservada |

É por isso que a primeira execução em uma máquina só registra a base: sem ela não
há como distinguir um número curado de um número que ainda não foi atualizado.

### Compatibilidade

A lista de armas de cada acessório recebe o mesmo tratamento, e aqui isso pesa
mais do que em qualquer outro campo: a lista local **não** é a da fonte, ela
passou pelo filtro por categoria da planilha do Gunsmith — mira de sniper precisa
de 2,5× para cima, escopeta não aceita supressor, pistola não aceita acoplamento.
Comparar direto com a fonte proporia desfazer esse filtro inteiro, toda semana.
O que entra é só o que a fonte **mudou** desde a última rodada.

## O que o script nunca faz

- **Não traduz.** Item novo entra com `name: 'TODO: traduzir'` e aparece assim na
  interface, o que é a intenção: é visível, incomoda, e alguém corrige.
- **Não inventa efeito.** Acessório novo entra com `mods: {}` — sem efeito
  nenhum — porque a fonte não publica os multiplicadores. Preencher isso é
  curadoria.
- **Não remove.** Arma que sumiu da fonte é relatada e mantida: apagá-la
  quebraria todo link compartilhado que a use, e sumir da fonte quase sempre
  significa que a fonte atrasou, não que a arma saiu do jogo.
- **Não fatia arquivo por posição.** O texto é partido em blocos por `id`, cada
  bloco é tratado sozinho, e a contagem de itens é conferida antes de gravar. Um
  arquivo que perdeu item no caminho não chega ao disco.

## Ids são contrato

O id de uma arma aparece no link compartilhado. Renomear `l85a3` para seguir a
grafia da fonte quebraria todo loadout já compartilhado com essa arma — então
quem se adapta é o sincronizador, em `APELIDOS_DE_ARMA` (`scripts/sync/fonte.mjs`).
Acessório reclassificado de slot é reconhecido pelo nome original, sem precisar
de lista.

---

## Acrescentar à mão

Nem tudo vem da fonte. Conteúdo de temporada costuma chegar aqui antes.

**Arma:** entrada em `src/data/weapons.ts` e a URL da foto em
`src/data/weapon-images.ts`; depois `npm run images:download`. Os slots saem da
categoria.

**Acessório:** entrada em `src/data/attachments.ts` com slot, custo em pontos,
modificadores e compatibilidade. O ícone sai do slot e do nome original — só
precisa de código se for uma família de desenho nova (`IMAGENS.md`).

**Gadget:** entrada em `src/data/gadgets.ts` e o glifo em
`src/components/icons/gadget-icon.tsx`, com o id como chave.

**Temporada:** entrada em `src/data/season.ts`. O tema veste o site enquanto ela
durar e sai sozinho quando ela encerra.

## Os canos, e o que ainda falta neles

A tela "Selecionar cano" não nomeia a peça pela medida. Ela cruza comprimento
com perfil, e o nome sai desse cruzamento:

|            | curto        | básico     | estendido        |
| ---------- | ------------ | ---------- | ---------------- |
| **normal** | `Curto`      | `Básico`   | `Estendido`      |
| **leve**   | `Curto Leve` | `Leve`     | `Estendido Leve` |
| **pesado** | —            | `Pesado`   | `Ext. Pesado`    |

Fora da matriz existe o `Crio`, que é peça própria. `Fluted` e `Pencil` são o
`Leve` — não há "cano estriado" nem "cano fino" no jogo.

A M16A4 é a régua: é a única arma com sete canos, e a tela dela bate peça por
peça com a regra. A B36A4 confere as variantes leves.

**O que falta.** Vinte e cinco grupos ainda têm duas peças com o mesmo nome na
mesma arma — canos de comprimento e perfil iguais, com modificadores idênticos,
como `415mm Factory` e `415mm Prototype`. Nada no dataset os separa. Some-se a
isso que toda arma tem exatamente um cano básico montado de fábrica, e hoje
dezesseis armas têm mais de um e a GRT-CPS não tem nenhum.

Duas lacunas maiores estão por trás disso:

- **O perfil pesado não é modelado.** Três dos 163 canos têm mod de controle ou
  recuo, então o cano pesado é hoje uma cópia do básico de mesmo comprimento —
  e é isso que produz os pares indistinguíveis.
- **O cano de fábrica não existe no modelo.** `factoryAttachments`
  (`src/lib/loadout.ts`) monta munição e mira, e nenhum cano. No jogo o básico
  já vem equipado e consome pontos, então o `x/100` daqui não bate com o de lá.

**Só a tela do jogo resolve.** O catálogo Convex não tem o campo, e está atrás
do jogo: os custos divergem (na M16A4 o jogo cobra 5, 10, 15 e 20; a fonte diz
10 em tudo) e faltam peças (há arma com oito canos na tela e nenhuma com mais
de sete na fonte). Resumo de guia, tabela de comunidade e texto gerado por IA
foram testados contra o dataset e reprovaram: citam peças que não existem em
nenhum slot, armas que não são do jogo e custos que as próprias telas
desmentem.

Uma foto da tela, sem trocar nada, entrega tudo de uma vez: o rótulo de cada
tile é a categoria, o número é o custo, a tile marcada `EQUIPADO` é o básico, e
a contagem revela cano faltando no catálogo.

## O meta, a cada patch

A tela `/meta` não vem do catálogo: ela é curadoria, guardada em
[`src/data/meta.ts`](./src/data/meta.ts) e relida todo dia pelo workflow
`meta-daily`, que grava [`src/data/meta-live.json`](./src/data/meta-live.json).
Não existe API pública de uso real no Battlefield 6 — a do gametools serve
estatística por jogador e só tem endpoint agregado de arma para BF1, BF3, BF4 e
BFV; o tracker.gg tem os números e não os publica.

**A tela é do multiplayer.** O REDSEC, o battle royale, tem meta próprio, e essa
é a armadilha mais fácil de cair — não porque seja difícil de ver, mas porque o
erro parece certo. Uma lista de armas que existem, bem escrita, publicada
ontem, com um nome errado no topo. A KTS100 MK8 é o caso exemplar: primeira
colocada **geral** do REDSEC e fora do pódio das metralhadoras do multiplayer.
Ela entrou nesta tela em agosto de 2026 como "melhor metralhadora do
multiplayer", vinda de guia que não declarava modo — e ficou dias no ar.

### De onde o dado vem, desde agosto de 2026

O lastro mudou. Antes eram guias editoriais que ranqueavam arma por classe, e
foi de lá que veio o erro acima: matéria que não diz de que modo fala quase
sempre descreve o battle royale, porque é dele que vêm os vídeos. Hoje entram
três coisas, e cada uma responde por uma parte:

| O quê | Quem | Decide |
| --- | --- | --- |
| **Posição** | rastreador que separa os modos por endereço | quem é o primeiro de cada classe |
| **Mudança** | notas oficiais da EA e registro de balanceamento | o que o patch mexeu — e, por exaustão, o que não mexeu |
| **Percepção** | fórum oficial da EA, subreddits, comunicados do Battlefield Comms | o que entra em `TRENDING` |

Percepção não vira posição no ranking. Quando o fórum disser que uma arma está
absurda e a medição não confirmar, isso vira o motivo do card de trending — não
uma promoção na lista de meta.

### O modo está no endereço, não no texto

Quem ranqueia os dois modos separa por caminho, e é o caminho que declara o
modo:

| Endereço | Vale? |
| --- | --- |
| `wzstats.gg/battlefield-6/multiplayer/…` | sim |
| `wzstats.gg/battlefield-6/meta` | não — é o REDSEC |
| `wzstats.gg/battlefield-6/ranked/meta` | não — o Ranqueado do BF6 é battle royale |
| qualquer caminho com `redsec` ou `battle-royale` | não |
| raiz de site de meta, sem `multiplayer` no caminho | não — o padrão dessas páginas é o battle royale |

Isso não é só recomendação: `ehPaginaDeOutroModo`, em
[`scripts/meta/leitura.mjs`](./scripts/meta/leitura.mjs), recusa essas páginas
antes de a leitura diária virar arquivo, e a leitura em que todas as fontes
caírem por modo é descartada inteira, com o motivo no log do workflow.

### Quando o jogo receber atualização de balanceamento

É quando o catálogo público muda e o PR automático aparece.

1. **Confira o modo antes de tudo.** Registre em `scope` o trecho que prova de
   que modo a fonte fala; sem esse indício a fonte não entra. O teste de
   sanidade é a KTS100 MK8 no topo: se ela aparecer lá, a leitura é do REDSEC.
2. Ancore no patch. Leia as notas oficiais e o
   [BF6 Balance Log](https://bf6balancelog.com/) arma por arma — é de lá que
   sai o fato datável que cada card precisa citar. Vale também o que o estúdio
   faz **fora** do patch: em agosto de 2026 o Match Trigger foi desligado da
   EF88 e da BROD 3 por comunicado, sem uma linha em changelog nenhum.
3. Procure a conversa onde ela acontece — `forums.ea.com`, `answers.ea.com`,
   r/Battlefield6, r/Battlefield —, por "broken", "nerf", "buff", "why is
   everyone using". Fórum não declara data de publicação; registre a data da
   leitura e diga isso no `scope`, como as fontes de agosto de 2026 fazem.
   **Data manda.** Guia de lançamento não entra, por mais completo que seja.
   Publicação brasileira dentro da janela é bem-vinda e aparece com selo `BR`;
   fora da janela, não.
4. Cruze duas fontes antes de mover uma arma. Duas páginas do mesmo rastreador
   **não** são duas fontes — o teste em
   [`src/data/meta.test.ts`](./src/data/meta.test.ts) só conta, então quem
   cobra honestidade aqui é quem escreve. O par que sustenta um destaque é
   posição + fato datável do patch.
5. Atualize `UPDATED_AT`, `META_SEASON` e a lista `SOURCES` — cada fonte com
   nome, link e a data que ela mesma declara. Mantenha a ordem de `SOURCES`
   igual à de `meta-live.json`: os cards citam a fonte pelo número, e a tela usa
   a lista da leitura do dia mesmo nos blocos que vêm de `meta.ts`.
6. Refaça `NOT_MULTIPLAYER` comparando o primeiro escalão dos dois modos, na
   mesma leitura e no mesmo dia. É a seção que explica ao leitor por que as
   listas que ele viu por aí não batem com esta.
7. Tire quem saiu das listas. Manter indicação velha só para a tela parecer
   cheia é pior do que uma lista curta.

O nome da arma na fonte nem sempre é o nome do dataset. Confira o id em
[`src/data/weapons.ts`](./src/data/weapons.ts) antes de escrever: guia já citou
arma que não existe no arsenal, e ali é melhor deixar de fora do que adivinhar
equivalência.

## A rede de segurança

Os testes cobrem a integridade do dataset, não só as fórmulas: id repetido,
degrau de dano fora de ordem, slot sem nenhuma opção compatível, arma que não
consegue ser montada dentro dos 100 pontos, temporada com fase fora da janela.
Um patch que quebre qualquer uma dessas coisas derruba a suíte antes de chegar à
interface — e, no PR automático, aparece como CI vermelho em vez de dado errado
publicado.

### O montador contra as fontes

```bash
npm run catalog:compat              # confere
npm run catalog:compat -- --baseline  # aceita o estado atual da versão
```

Os testes cobrem o dataset por dentro; esta conferência cobre o que ele tem a
ver com o jogo. Ela cruza o montador (`src/data/`) com duas fontes: a matriz de
compatibilidade da versão (`data/versions/<v>/`), que cobre as 62 armas, e o
instantâneo do bf6loadouts, que cobre as 27 que a captura manual conseguiu ler.

A distinção que dá sentido ao resultado é entre **ausência** e **negativa**: o
instantâneo não ter a peça só vale como evidência contrária quando ele enumerou
aquele slot daquela arma. Quando ele nem leu a arma, o que existe é fonte única —
e foi assim que a L115 ficou meses sem telêmetro no site, com tudo verde.

O estado aceito de cada versão fica em `data/compatibility/<v>.json`, com o
motivo de cada divergência e o que cada fonte disse sobre ela. A execução comum
**não** regrava esse arquivo: se regravasse, o CI se curaria sozinho. Depois de
conferir uma divergência nova no jogo, aceite-a com `-- --baseline` e commite o
arquivo junto da mudança.

Quando a próxima versão chegar, o baseline anterior continua no repositório: a
diferença entre dois arquivos desses é o changelog de compatibilidade do patch,
que nem a EA publica.

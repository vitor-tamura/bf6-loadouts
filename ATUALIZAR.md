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
[`src/data/meta.ts`](./src/data/meta.ts). Não existe API pública de uso real no
Battlefield 6 — a do gametools serve estatística por jogador e só tem endpoint
agregado de arma para BF1, BF3, BF4 e BFV; o tracker.gg tem os números e não os
publica. Então o que vale é o que os portais especializados escrevem.

**A tela é do multiplayer.** O REDSEC, o battle royale, tem meta próprio, e essa
é a armadilha mais fácil de cair: boa parte das listas de "melhores armas do
BF6" que aparecem na busca descreve o battle royale sem avisar. A KTS100 MK8 é o
caso exemplar — primeira colocada geral do REDSEC e apenas a sexta metralhadora
do multiplayer. Fonte que mistura os dois modos no mesmo texto não entra: em
agosto de 2026 o Nerdschalk saiu por isso ("effective in both public matches and
Ranked REDSEC play"), e com ele caiu a única sustentação que a RPK-74M tinha
entre os destaques.

Quando o jogo receber atualização de balanceamento — que é quando o catálogo
público muda e o PR automático aparece:

1. Procure guias e matérias publicados **depois** do patch, nos veículos de
   maior alcance que ranqueiam arma por classe. O que interessa é matéria com data e nome de
   arma, não vídeo nem opinião solta de fórum.
   **Data manda.** Guia de lançamento não entra, por mais completo que seja:
   entre ele e hoje vieram quatro temporadas e o patch que mexeu em velocidade e
   recuo. Em agosto de 2026 as duas publicações brasileiras que ranqueavam armas
   — Critical Hits e Omelete — eram de outubro de 2025, e por isso ficaram de
   fora. Publicação brasileira dentro da janela é bem-vinda e aparece com selo
   `BR`; fora da janela, não.
2. **Confira o modo antes de tudo.** Registre em `escopo` o trecho que prova de
   que modo a fonte fala; sem esse indício a fonte não entra. O
   [wzstats](https://wzstats.gg/battlefield-6/multiplayer/meta) ranqueia os dois
   modos em páginas separadas (`/multiplayer/meta`, `/meta` e `/ranked/meta`), o
   que o torna útil duas vezes: decide o primeiro nome de cada classe e serve de
   controle para saber se um guia sem modo declarado está descrevendo o battle
   royale.
3. Cruze pelo menos duas fontes antes de mover uma arma. Uma citação isolada
   entra como menção, não como destaque — o teste em
   [`src/data/meta.test.ts`](./src/data/meta.test.ts) cobra isso.
4. Atualize `ATUALIZADO_EM`, `TEMPORADA_DO_META` e a lista `FONTES` — cada fonte
   com nome, link e a data que ela mesma declara.
5. Refaça `NAO_E_MULTIPLAYER` comparando o primeiro escalão dos dois modos. É a
   seção que explica ao leitor por que as listas que ele viu por aí não batem
   com esta.
6. Tire quem saiu das listas. Manter indicação velha só para a tela parecer
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

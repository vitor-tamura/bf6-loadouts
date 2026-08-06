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

## A rede de segurança

Os testes cobrem a integridade do dataset, não só as fórmulas: id repetido,
degrau de dano fora de ordem, slot sem nenhuma opção compatível, arma que não
consegue ser montada dentro dos 100 pontos, temporada com fase fora da janela.
Um patch que quebre qualquer uma dessas coisas derruba a suíte antes de chegar à
interface — e, no PR automático, aparece como CI vermelho em vez de dado errado
publicado.

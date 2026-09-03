# Compatibilidade

Que peças cada arma aceita é a informação mais delicada do catálogo, e a que tem
a regra mais rígida:

> **Compatibilidade nunca é deduzida. Ela é registrada, uma relação por vez, com
> a fonte que a confirma.**

A EA afirma que cada arma tem o próprio conjunto de acessórios, e que acessórios
custam Attachment Points. Não existe "toda SMG aceita esta empunhadura". Não
existe "esta arma é da mesma categoria, então deve aceitar o mesmo".

## O que é proibido

- herança por categoria (`todas as ARs aceitam X`);
- herança por arquétipo (`armas parecidas aceitam o mesmo`);
- copiar a lista de uma arma para outra;
- assumir que uma peça global vale para todas as armas.

O último merece atenção: "global" descreve o **escopo da peça** — ela não
pertence a uma arma específica —, e não a sua disponibilidade. O 50 MW Violet é
global e está em quatro armas.

## A forma de uma relação

```json
{
  "gameVersion": "1.3.3.0",
  "weaponId": "m121a2",
  "attachmentId": "50mw_violet",
  "slot": "laser",
  "status": "active",
  "source": { "provider": "bf6loadouts", "type": "current_state" }
}
```

Uma linha por relação, por versão. Ela carrega a própria procedência, e não a do
arquivo — o mesmo `compatibility.json` mistura linhas confirmadas pelo estado
atual do jogo com linhas herdadas da matriz da comunidade.

## Os três estados

| Status | O que significa | Entra no site? |
| --- | --- | --- |
| `active` | a fonte confirma nesta versão | sim |
| `removed` | existia e deixou de existir | não |
| `needs_review` | nenhuma fonte sustenta com clareza | **não** |

`needs_review` é o estado que impede palpite de virar dado. Ele fica fora dos
índices e fora do artefato público; a interface pode dizer que há pendências
pela contagem em `pending`, sem fingir que sabe quais são.

## Pendências abertas hoje

**As cinco empunhaduras da vz61.** A fonte se contradiz: as peças declaram
`underbarrel`, e a matriz as lista em `laser` — e a arma fica sem nenhuma linha
de empunhadura. O conserto parece óbvio, e mesmo assim o pipeline não o faz:
decidir qual lado da fonte está certo é decisão de quem tem o jogo aberto. As
cinco estão como `needs_review`.

**Dez peças sem arma.** Eram 23, e treze eram de ergonomia: a matriz da planilha
mestra cobre sete slots e `ergonomics` não é um deles, então o slot inteiro
ficava sem uma linha sequer. `catalog:import-analyzer-compat` as ligou, lendo
`WEAPON_ERGO` do dataset da comunidade — 124 vínculos em 54 armas, e para a M16A4
exatamente as cinco peças que uma print do jogo já tinha confirmado.

As dez restantes seguem sem arma porque **nenhuma fonte alcançável diz em quais
elas entram**: quatro miras que o Analyzer só enumera para as secundárias, quatro
variantes VSSM de underbarrel, `extended_barrel` e a `1p86_lpvo` — anunciada no
patch note 1.4.1.0 sem matriz de compatibilidade. A tentação de escrever "toda
arma aceita munição padrão" é forte e seria exatamente o tipo de dedução que esta
página proíbe. Elas continuam como peças sem arma até uma fonte dizer.

Oito armas ficam sem ergonomia — três escopetas, três metralhadoras, `miniscout`
e `svk86`. Isso não é pendência: `WEAPON_ERGO` enumera arma por arma, e ausência
em fonte que enumera é evidência contrária, não silêncio.

## Índices

`data/indexes/current.json` tem os dois sentidos da mesma relação:

- `attachmentsByWeapon` — que peças esta arma aceita;
- `weaponsByAttachment` — que armas aceitam esta peça;
- `attachmentsByWeaponSlot` — o mesmo, agrupado por slot.

Os índices são **derivados**. `npm run catalog:indexes` os reconstrói inteiros a
partir da compatibilidade, e o workflow de validação recusa Pull Request em que
o índice commitado discorde da fonte. Há teste garantindo que os dois sentidos
descrevem o mesmo conjunto de relações.

## Como consultar

```ts
import { getWeaponAttachments, isCompatible } from '@/catalog';

getWeaponAttachments('m121a2');          // as peças da arma
isCompatible('m121a2', '50mw_violet');   // true
```

Uma arma sem relação registrada devolve lista vazia. Essa é a resposta certa:
significa que nenhuma fonte confirmou peça alguma para ela — não que ela aceite
o que as outras da categoria aceitam.

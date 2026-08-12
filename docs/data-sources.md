# Fontes de dados

O catálogo usa três fontes. Cada uma responde bem a uma pergunta diferente, e
confundir os papéis é o erro que produz dado errado com aparência de confirmado.

| Fonte | Responde | Tipo |
| --- | --- | --- |
| [Patch notes da EA](https://www.ea.com/games/battlefield/battlefield-6/news) | o que mudou | `official` |
| [BF6 Loadouts](https://bf6loadouts.com) | o que existe hoje | `current_state` |
| [raymdl/BF6-Weapon-Analyzer](https://github.com/raymdl/BF6-Weapon-Analyzer) | balística, dano, recuo, conferência | `community` |

O Analyzer entrou como fonte dos números de simulação, que nenhuma das outras
publica: curva de dano, velocidade do projétil, arrasto, recuo, espalhamento e
recarga, para as 62 armas. Ele declara que seu levantamento vem do Sym.gg
(v1.3.3.0) com validação da comunidade.

Importação:

```bash
npm run catalog:fetch-github      # instantâneo preso ao commit
npm run catalog:import-analyzer   # entra em ballistics/damage-models/recoil/spread/reload
```

## Hierarquia, por tipo de informação

Não existe uma ordem única. A precedência depende do que se está perguntando:

| Pergunta | Ordem |
| --- | --- |
| O que mudou neste patch | EA → GitHub → comunidade |
| Que peças esta arma aceita hoje | BF6 Loadouts → GitHub |
| Histórico de uma mudança | EA → GitHub |
| Estatística numérica | EA (quando publica o número) → GitHub |

O GitHub nunca é tratado como oficial. O patch note nunca é tratado como
descrição completa da compatibilidade — ele diz o que mudou, não o que existe.

## O tipo `inferred`

Existe no modelo e é recusado pelo validador. Nenhum registro do catálogo pode
nascer de dedução; a constante está lá para que uma tentativa de introduzi-la
falhe alto em vez de passar.

## Toda leitura fica registrada

Cada ida a uma fonte grava duas coisas: o payload bruto em
`data/sources/imports/` e uma linha no registro correspondente
(`data/sources/ea.json`, `bf6loadouts.json`, `github.json`).

O bruto fica porque páginas somem. Um patch note de duas temporadas atrás pode
não estar mais no ar quando o parser melhorar e for preciso reprocessá-lo.

Do GitHub, o registro guarda o **SHA do commit** — não o nome do branch. "Baixei
do main" é uma frase que envelhece: o main de hoje não é o de semana que vem, e
uma importação que só cita o branch não pode ser refeita nem conferida.

## Quando as fontes discordam

Nada é sobrescrito em silêncio. A divergência vira um evento
`source_conflict` em `changes.json`, com as duas observações preservadas, e a
resolução — quando houver — diz qual fonte prevaleceu e por quê.

O caso conhecido é o **50 MW Violet**: a matriz da comunidade liga o laser a
dezenas de armas, e o estado atual do jogo o mostra em quatro — `m121a2`,
`rpk74m`, `cz3a1`, `db12`. O catálogo serve as quatro, porque compatibilidade
atual é decidida por quem observa o jogo atual. O conflito continua registrado, e
há um teste que falha se a lista mudar sem decisão humana.

## O import inicial

A identidade e a compatibilidade nasceram de
`BF6_Catalogo_ESCALAVEL_v5.json`, preservado em
`data/sources/imports/`. Ele já vinha com as duas leituras — a matriz da
comunidade e a confirmação do estado atual —, e cada linha importada carrega qual
das duas a sustenta.

## Qualidade declarada

Todo dado de simulação carrega o nível de confiança que a **fonte** declara, não
uma avaliação nossa:

| Nível | Significado |
| --- | --- |
| `verified` | medido pela fonte |
| `provisional` | a própria fonte marca como provisório |
| `estimated` | derivado de arma semelhante |
| `unavailable` | não existe — diferente de estimativa |

Hoje **as 62 curvas de dano estão `provisional`**, porque é assim que o Analyzer
as publica. A tela que as exibir deve dizer isso;
`getWeaponDataQuality(weaponId)` responde por arma.

## O coeficiente de arrasto está em disputa

| Fonte | Base | Longo alcance |
| --- | --- | --- |
| BF6 Weapon Analyzer | 0,0035 /m | 0,002 |
| Planilha da comunidade (r/Battlefield) | 0,0025 /m | 0,001 |
| EA | confirma que existe arrasto | não publica o coeficiente |

O catálogo usa o do Analyzer, por ser o do dataset importado, e registra a
divergência como `source_conflict` **aberto** — em `changes.json` e também em
`ballistics.json`, onde quem for escrever a conta de queda de bala vai olhar.
Escolher em silêncio faria a trajetória parecer exata.

## O import inicial

Duas lacunas vieram dele e continuam abertas, porque preenchê-las exigiria
inventar:

- **munição e ergonomia sem compatibilidade** — 28 peças que existem no catálogo
  e não estão ligadas a arma nenhuma;
- **munição sem custo** — 15 peças com `cost: null`.

Ver [compatibility.md](compatibility.md) para o motivo de elas não serem
completadas por regra.

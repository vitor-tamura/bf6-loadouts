# Fontes de dados

O catálogo se organiza por **papéis**, não por sites. Cada papel responde bem a
uma pergunta diferente, e confundir os papéis é o erro que produz dado errado com
aparência de confirmado.

| Papel | Responde | Tipo | Onde é decidido |
| --- | --- | --- | --- |
| oficial | o que mudou neste patch | `official` | no código |
| `estado_atual` | que peças esta arma aceita hoje | `current_state` | no registro |
| `numeros_de_simulacao` | dano, velocidade, arrasto, recuo, espalhamento, recarga | `community` | no registro |
| `enumeracao_de_slot` | a lista fechada de um slot numa arma | `community` | no registro |
| `registro_de_patch` | o changelog linha a linha, por categoria e ligado às armas que nomeia | `community` | no registro |

## Só uma fonte é estática

A **EA** é a única cujo nome é parte do desenho. Ela responde "o que mudou" com
autoridade, não tem substituta, e por isso o endereço dela mora no código —
`EA_NEWS`, em `scripts/catalog/lib/sources.ts`.

Todas as outras estão no pipeline **pelo papel que cumprem**, não por serem quem
são. Qualquer uma pode sair do ar, parar de atualizar ou ser superada por outra
melhor, e quando isso acontecer o papel continua existindo. Elas vivem em
[`data/sources/registry.json`](../data/sources/registry.json) e se pedem por
`fonteAtiva(papel)`. Trocar uma é editar um arquivo de dados — não um script.

Quem cumpre cada papel hoje:

| Papel | Em uso hoje | Sobrescreve com |
| --- | --- | --- |
| `estado_atual` | [BF6 Loadouts](https://bf6loadouts.com) | `CATALOG_LOADOUTS_URL` |
| `numeros_de_simulacao` | [raymdl/BF6-Weapon-Analyzer](https://github.com/raymdl/BF6-Weapon-Analyzer) | `CATALOG_GITHUB_REPO` |
| `enumeracao_de_slot` | [rnkd.gg](https://rnkd.gg/battlefield6/weapons) | `CATALOG_ARSENAL_URL` |
| `registro_de_patch` | [BF6 Balance Log](https://bf6balancelog.com/) | `CATALOG_BALANCE_LOG_URL` |

Esta tabela envelhece; a de cima, não.

### A EA pendura o mesmo patch em jogos diferentes

O Game Update 1.4.2.5 saiu em `/games/battlefield/**redsec**/news/`, e não em
`battlefield-6` como os anteriores. O extrator exigia `battlefield-6` no meio do
endereço e ficou doze dias reportando "nenhuma versão a processar" com a versão
publicada. Hoje o segmento do jogo é curinga: quem afirma que a versão existe é o
`game-update-` do slug do artigo, não a seção do site.

## Uma fonte oficial só, quando falha, falha em silêncio

O `registro_de_patch` existe por causa de dois acidentes que têm a mesma raiz.

**O primeiro foi de visão.** A 1.4.2.5 saiu sob `redsec` e o extrator ficou doze
dias dizendo "nenhuma versão a processar" com a versão publicada. O padrão do
endereço foi consertado, mas a lição não é sobre aquele padrão: uma fonte só,
quando deixa de enxergar, não avisa — ela responde "nada de novo", que é
exatamente o que o pipeline esperava ouvir num dia normal.

**O segundo foi de leitura.** A 1.4.2.5 mexeu em uma coisa de arma:

> The Match Trigger attachment no longer affects fully automatic fire on the
> BROD and EF88.

O parser largou a frase. Não tem número, não tem "removed", e "fully automatic
fire" não é nenhum dos campos que ele reconhece. Com zero mudanças num texto que
tem cara de patch note, o pipeline concluiu "patch de correções" e escreveu a
1.4.2.5 como cópia byte a byte da 1.4.2.0. Uma peça saiu de duas armas e o
catálogo não ficou sabendo — sem erro, sem aviso, sem issue.

O [BF6 Balance Log](https://bf6balancelog.com/) responde às duas coisas porque
publica o changelog **estruturado**, e não em prosa:

```html
<li data-item="brod-3 ef88 match-trigger">The Match Trigger attachment no longer…
```

- **a categoria é afirmada, não inferida.** A linha está sob `WEAPONS` porque
  quem lê o jogo a pôs lá. O parser não precisa deduzir do texto se a frase é de
  arma — e é justamente aí que ele errava por omissão, que é o erro caro:
  produz o mesmo zero de um patch que legitimamente não mexeu em nada.
- **as entidades vêm resolvidas.** A EA escreveu "the BROD"; o catálogo guarda
  `brod3`. O `data-item` diz que são a mesma coisa, e isso é casamento por
  identificador — não por parecença de texto, que casaria "M4" com "M4A1".

Ele **não** substitui a EA. Segue sendo um terceiro transcrevendo, e quando os
dois discordarem vale a página oficial, guardada inteira em
`data/patches/<versão>.json`. O que ele acrescenta é a segunda testemunha:

- `catalog:discover` confere a listagem da EA contra ele, **só para a frente** —
  ele arquiva desde o lançamento, e reprocessar 2025 não é o que se está
  pedindo. Versão que só ele vê sai com aviso no log.
- `catalog:fetch-balance-log` grava `data/sources/balance-log.json`, e
  `catalog:update` o atualiza antes de ler o patch note.
- `catalog:nomes` cruza os identificadores dele com o dataset — ver abaixo.

Quando ele não responde, o que se perde é a conferência, nunca a rodada.

## Nome de fonte vira id do catálogo só com prova

`catalog:nomes` casa a forma que a fonte escreve com o id que o catálogo guarda,
e a regra é uma só: **a frase precisa forçar o par**.

Descontadas todas as entidades que o texto já nomeia por uma forma conhecida, se
restar exatamente um id sem nome e exatamente um nome sem id, não há outra
atribuição possível. Foi assim que "BROD" virou apelido de `brod3`: o texto
nomeia a EF88 por um nome que o catálogo tem, a fonte afirma `brod-3` e `ef88`,
e sobra um de cada lado.

Dois de cada lado é escolha, e escolha aqui é chute: vai para `emAberto` no
relatório, com a linha inteira, para uma pessoa decidir. Identificador que a
fonte tem e o catálogo não conhece vai para `semEntidade` — nunca vira entidade
nova, porque id novo precisa de categoria, calibre e compatibilidade, que
nenhuma linha de changelog publica.

O relatório é `data/entities/nomes-das-fontes.json`. Gravar os apelidos no
dataset é um segundo comando, deliberado:

```bash
npm run catalog:nomes              # o relatório
npm run catalog:nomes -- --aplicar # grava os apelidos provados
```

Duas recusas que já custaram apelido errado, e por isso estão testadas: sem
descartar o que não tem letra, "cost 5 points, reduced from 15 points" propunha
que o Extended Barrel também se chama "15"; sem tirar o artigo, o apelido do
1P86 LPVO saía "The 1P86". Apelido errado é pior que apelido nenhum — ele passa
a casar frases que não falam daquela peça, e o erro reaparece como mudança
atribuída à arma errada, já com aparência de apurada.

## Enumerar é diferente de mencionar

A distinção que decide como se lê uma ausência:

- fonte que **enumera** o slot inteiro de uma arma — a ficha do rnkd.gg lista as
  oito bocas da AK4D — permite ler ausência como **negativa**. A peça não está
  lá porque não entra.
- fonte que **menciona** peças uma a uma não permite nada disso. O que ela não
  diz é silêncio, não negativa.

É o mesmo princípio que separa `conflito` de `não conferido` no `catalog:compat`,
e ele decide linha por linha o que o pipeline aplica sozinho.

## Hierarquia, por tipo de informação

Não existe uma ordem única. A precedência depende do que se está perguntando:

| Pergunta | Ordem |
| --- | --- |
| O que mudou neste patch | oficial → comunidade |
| Que peças esta arma aceita hoje | `estado_atual` → `enumeracao_de_slot` → `numeros_de_simulacao` |
| Histórico de uma mudança | oficial → comunidade |
| Estatística numérica | oficial (quando publica o número) → `numeros_de_simulacao` |

Fonte comunitária nunca é tratada como oficial. O patch note nunca é tratado como
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

## Dataset atrasado não sobrescreve dado curado

A fonte de números declara a que versão do jogo o levantamento dela se refere, e
o importador recusa dataset que descreva versão anterior à corrente. Número velho
sobrescrevendo número novo é regressão, e ela viria assinada como importação
nova.

**A trava já falhou uma vez, em silêncio.** O Analyzer trocou
`data/ballistics.json#release: "1.3.3.0"` por `baseline: "current-live"` e
empurrou a versão para `data/provenance/live-baseline.json`. O importador lia só
`release`; ausente, a comparação curto-circuitava e **liberava** exatamente a
importação que a trava existia para barrar. Um dataset de 1.3.3.0 sobrescreveu a
balística curada — arrasto, velocidade de saída, multiplicador de cabeça, marca de
provisório — e a 1.4.2.5 quebrou seis testes no CI.

Duas lições viraram código, em `declaredRelease`:

- a busca pela versão é **em cadeia** — `release`, depois `baseline`, depois o
  arquivo que `source` aponta;
- versão que não se acha **bloqueia** a importação, em vez de liberá-la. Rótulo
  não vira versão: `current-live` diz o que o dataset gostaria de ser, e o que
  vale é a versão que ele declara ter lido.

Importação:

```bash
npm run catalog:fetch-github            # instantâneo preso ao commit
npm run catalog:import-analyzer         # números: ballistics/damage-models/recoil/spread/reload
npm run catalog:import-analyzer-compat  # ergonomia: que armas aceitam cada peça
```

Os dois importadores são separados porque as duas coisas envelhecem em ritmos
diferentes. "A M16A4 aceita Gatilho" não é medição que a temporada refaz com
outro valor: é fato sobre o arsenal, que a EA muda acrescentando peça. Segurar a
compatibilidade pela trava dos números deixaria treze peças sem arma por tempo
indeterminado.

## Qualidade declarada

Todo dado de simulação carrega o nível de confiança que a **fonte** declara, não
uma avaliação nossa:

| Nível | Significado |
| --- | --- |
| `verified` | medido pela fonte |
| `provisional` | a própria fonte marca como provisório |
| `estimated` | derivado de arma semelhante |
| `unavailable` | não existe — diferente de estimativa |

Hoje **as 62 curvas de dano estão `provisional`**. A tela que as exibir deve
dizer isso; `getWeaponDataQuality(weaponId)` responde por arma.

## Quando as fontes discordam

Nada é sobrescrito em silêncio. A divergência vira um evento `source_conflict` em
`changes.json`, com as duas observações preservadas, e a resolução — quando
houver — diz qual fonte prevaleceu e por quê.

O caso conhecido é o **50 MW Violet**: a matriz da comunidade liga o laser a
dezenas de armas, e o estado atual do jogo o mostra em quatro — `m121a2`,
`rpk74m`, `cz3a1`, `db12`. O catálogo serve as quatro, porque compatibilidade
atual é decidida por quem observa o jogo atual. O conflito continua registrado, e
há um teste que falha se a lista mudar sem decisão humana.

### O coeficiente de arrasto

| Fonte | Base | Longo alcance |
| --- | --- | --- |
| Analyzer | 0,0035 /m | 0,002 |
| Planilha de TTK | 0,0025 /m | 0,001 |
| Planilha da comunidade (r/Battlefield) | 0,0025 /m | 0,001 |
| EA | confirma que existe arrasto | não publica o coeficiente |

O catálogo usa **0,0025**, e o conflito está `resolved` — duas fontes
independentes contra uma, e a do Analyzer é de 1.3.3.0. A escolha fica escrita em
`changes.json` e também em `ballistics.json`, onde quem for escrever a conta de
queda de bala vai olhar. Continua sendo escolha entre fontes, não medição:
escolher em silêncio faria a trajetória parecer exata.

## O import inicial

A identidade e a compatibilidade nasceram de `BF6_Catalogo_ESCALAVEL_v5.json`,
preservado em `data/sources/imports/`. Ele já vinha com as duas leituras — a
matriz da comunidade e a confirmação do estado atual —, e cada linha importada
carrega qual das duas a sustenta.

Depois, a matriz da **planilha mestra** substituiu essa compatibilidade. A
planilha cobre sete slots, e `ergonomics` não é um deles: as treze peças de
ergonomia ficaram no catálogo sem arma nenhuma, e as cinco relações da M16A4 que
uma print do jogo tinha confirmado sumiram junto.

`catalog:import-analyzer-compat` as recuperou, lendo `WEAPON_ERGO` do dataset da
comunidade — 124 vínculos em 54 armas. Para a M16A4 a fonte enumerou exatamente
as cinco peças da print, sem que uma soubesse da outra, e há teste fixando isso.

**Dez peças seguem sem arma**, e é falta de fonte, não falta de código:

- quatro miras — `thermal`, `therm_hyb`, `var_high`, `var_low`. O Analyzer
  enumera `sight` por arma **só para as sete secundárias**, e nelas lista
  exatamente `iron` e `std_optic` — as catorze linhas que a matriz já tem. Para
  as primárias ele não declara lista nenhuma;
- quatro variantes VSSM de underbarrel e `extended_barrel`, que nenhuma fonte
  alcançável enumera;
- `1p86_lpvo`, anunciada no patch note 1.4.1.0 sem matriz de compatibilidade.

Oito armas ficam sem ergonomia — três escopetas, três metralhadoras, `miniscout`
e `svk86`. Não é lacuna: `WEAPON_ERGO` enumera arma por arma, e ausência em fonte
que enumera é evidência contrária.

Ver [compatibility.md](compatibility.md) para o motivo de lacuna não ser
preenchida por regra.

## O que o `estado_atual` não entrega

Investigado em 12/08/2026, com o BF6 Loadouts nesse papel. O site responde a
cliente automatizado, mas **não serve no HTML** o que falta ao catálogo: custo em
pontos e lista de acessórios por arma. Foram lidas a home, `/create`, `/weapons` e
uma página de loadout — nenhuma traz esses campos. É um aplicativo Next.js que
monta as telas no navegador; no HTML só existem rotas de imagem
(`/api/storage/...`).

As duas saídas seriam rodar um navegador dentro do pipeline ou reconstruir a API
interna a partir dos pacotes JavaScript. A primeira traz um navegador inteiro como
dependência de um script de dados; a segunda quebra a cada publicação do site, e
quebra calada.

O que sobra, e funciona: **print da tela do jogo** — ver
[contributing-data.md](contributing-data.md).

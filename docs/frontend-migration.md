# Migração do frontend

Durante a transição existem duas fontes de dados, e isso é intencional:

```
                    FONTES
                       │
        ┌──────────────┴──────────────┐
    src/data/*.ts              pipeline JSON
        │                             │
        │                    catalog.current.json
        │                             │
        │                        src/catalog
        └──────────────┬──────────────┘
                       │
                    telas
```

`src/data/*.ts` **continua sendo a fonte que as telas consomem**. `src/catalog`
é adotado por domínio, conforme cada um ganha cobertura completa.

## A regra de ouro

> **Nunca migrar uma feature só porque a entidade básica existe. Migrar somente
> quando todos os campos necessários àquela feature estiverem cobertos,
> validados e testados.**

A página da arma precisa de nome, categoria e lista de peças — pode migrar. O
cálculo de TTK precisa de curva de dano, cadência, velocidade e arrasto — só
migra quando os quatro existirem para **todas** as armas.

## Três perguntas diferentes

Ter os dados não é ter a feature, e ter a feature não é poder migrar a tela.
`npm run catalog:coverage` responde as três separadamente:

| Seção | Pergunta | Estados |
| --- | --- | --- |
| DATA COVERAGE | quantas armas têm cada campo? | contagem |
| FEATURE COVERAGE | existe código que usa esses dados? | `READY`, `NOT IMPLEMENTED`, `BLOCKED` |
| MIGRATION STATUS | a tela pode trocar de fonte? | `SAFE`, `WAITING ENGINE`, `BLOCKED` |

O TTK é o exemplo de por que a separação existe: os dados ficaram completos
antes de haver qualquer função que os transformasse em milissegundos. Chamar
aquilo de "pronto" convidaria a apontar a tela para um motor inexistente. O
estado correto naquele momento era `WAITING ENGINE`.

Por baixo, quem decide é `capabilities`, calculado pelo build sobre os dados
reais. Uma capacidade só é verdadeira com **cobertura completa**: um gráfico que
funciona em 40 armas e falha em 22 é um gráfico quebrado.

```ts
import { supports } from '@/catalog';

if (supports('ttk')) { /* ... */ }
```

## Estado hoje — catálogo 1.3.3.0

| Fase | Domínio | Dados | Motor | Migração |
| --- | --- | --- | --- | --- |
| 1 | Arsenal — lista, busca, página da arma | completos | — | **SAFE** |
| 1 | Montador — slots, peças, orçamento | 15 munições sem custo | — | BLOCKED |
| 2 | Painel de estatísticas | ADS em 58/62, recarga em 59/62 e 56/62 | — | BLOCKED |
| 3 | TTK e tiros para abater | completos | `src/simulation/ttk.ts` | **SAFE** |
| 4 | Gráficos — dano e queda de bala | completos | `src/simulation/ballistics.ts` | **SAFE** |
| 5 | Comparação detalhada | ADS incompleto | `src/simulation` | BLOCKED |

`SAFE` significa que dados e motor existem — **não** que a migração já foi
feita. Ela ainda exige paridade funcional com a tela atual.

Ressalva que vale para tudo que depende de dano: **as 62 curvas estão marcadas
`provisional` pela fonte**. Elas sustentam gráfico e TTK, desde que a tela diga
que são provisórias — `getWeaponDataQuality(weaponId)` responde isso por arma.

## As fases

**Fase 1 — catálogo básico.** Armas, acessórios, slots, compatibilidade,
carregadores, munição. Alimenta lista, busca, filtros, página da arma e montador.

**Fase 2 — dados de gameplay.** Dano, queda, velocidade, arrasto, cadência,
recuo, espalhamento, ADS, recarga. Já estão na estrutura versionada:
`ballistics.json`, `damage-models.json`, `recoil.json`, `spread.json`,
`reload.json`.

**Fase 3 — TTK.** O motor existe, em `src/simulation` — fora do catálogo, porque
o catálogo responde "quais são os dados" e o simulador responde "o que acontece
com eles".

```ts
import { calculateTTK, ttkCurve } from '@/simulation';

calculateTTK('m433', { distance: 50, headshots: 1 });
ttkCurve('m433', [0, 25, 50, 100]);
```

TTK **não é dado**, é resultado. Não se armazena `"ttk": 217`: guarda-se a curva,
a cadência e o modelo de voo, e o número sai para qualquer distância, zona de
acerto e vida de alvo. Ver [simulation-engine.md](simulation-engine.md).

**Fase 4 — gráficos.** Dano por distância, queda da bala, velocidade, recuo.

**Fase 5 — comparação.** Armas, acessórios, estatísticas e TTK lado a lado.

**Fase 6 — remover `src/data/*.ts`.** Só quando ninguém mais depender dele:

```bash
rg -l "@/data/" src
```

`0 consumidores → deprecated → remove`. Antes disso, nunca.

## Regras da transição

**Paridade funcional antes de trocar.** Nenhuma tela pode perder comportamento
na migração. Se a fonte nova não faz o que a antiga fazia, a migração não
aconteceu — foi uma regressão.

**Fallback é explícito ou não existe.** Durante a transição, um seletor pode
escolher a origem, desde que a escolha esteja escrita e seja temporária:

```ts
const stats = supports('ads') ? getWeaponStats(id) : legacyStats(id);
```

O que não pode existir é o fallback genérico escondido — aquele que ninguém
lembra de tirar e que transforma "duas fontes por um tempo" em "duas fontes para
sempre".

**Ids têm um tradutor só.** As duas fontes nomeiam as armas de formas diferentes
(`ak-205` × `ak205`). `src/catalog/adapters/legacy-ids.ts` é o único lugar que
sabe disso — 59 dos 68 casam por normalização, 3 são renomeações declaradas à
mão, 6 não existem no catálogo e devolvem `null` em vez de a arma mais parecida.

**A fronteira é `src/catalog`.** Nenhuma tela importa o JSON. Precisou de algo
que os seletores não dão? A função nova vai em `catalog.selectors.ts`.

## O artefato vai crescer

`catalog.current.json` está em ~1,1 MB com os dados de simulação. Enquanto
nenhuma tela o consome, isso não custa nada. Quando a primeira migrar, medir o
efeito no bundle — e, se pesar, dividir em `catalog.current.json` (identidade,
compatibilidade, custos) e um arquivo de simulação carregado só onde há gráfico.
A fachada não muda; muda o que ela abre por baixo.

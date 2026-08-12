# Arquitetura do catálogo

O catálogo é o conjunto de dados do jogo — armas, acessórios, o que cada arma
aceita e quanto isso custa. Ele vive em arquivos JSON versionados no Git. Não há
banco de dados, e não deve haver: o histórico que interessa é o do jogo, e o Git
já sabe guardar histórico, mostrar diferença e exigir revisão antes de aceitar
mudança.

## As três camadas

O modelo separa identidade, estado e mudança. A separação é a razão de tudo
funcionar, então vale entendê-la antes de mexer em qualquer arquivo.

**Identidade** (`data/entities/`) é o que uma coisa é, independente de patch. A
M121 A2 tem um id que nunca muda, mesmo que ela seja renomeada, rebalanceada ou
retirada do jogo. Identidade não tem estatística, não tem custo e não tem
compatibilidade — só id, nome, apelidos e o ciclo de vida.

**Estado** (`data/versions/<versão>/`) é como o jogo estava num patch: que peças
cada arma aceitava, quanto elas custavam, o que faziam, qual era a cadência da
arma. Cada versão é um instantâneo fechado. Nenhuma versão reescreve outra.

**Mudança** (`data/versions/<versão>/changes.json` e `data/patches/`) é a
passagem de um estado ao seguinte, com a fonte que a sustenta. É o que permite
responder, meses depois, por que uma relação sumiu.

## Onde fica cada coisa

```
data/
├── entities/          identidade permanente
│   ├── weapons.json
│   ├── attachments.json
│   ├── categories.json
│   └── slots.json
├── versions/          um diretório por versão do jogo
│   └── 1.3.3.0/
│       ├── metadata.json        de onde veio, quando, quantos registros
│       ├── weapons.json         instantâneo das armas na versão
│       ├── attachments.json     instantâneo das peças na versão
│       ├── compatibility.json   arma → peça, uma linha por relação
│       ├── stats.json           estatísticas de menu, por arma
│       ├── effects.json         o que cada peça faz, e quanto custa
│       ├── ballistics.json      velocidade, arrasto e gravidade
│       ├── damage-models.json   curva de dano por distância
│       ├── recoil.json          modelo polar de recuo
│       ├── spread.json          espalhamento e recuperação
│       ├── reload.json          recarga tática e com pente vazio
│       └── changes.json         eventos que produziram esta versão
├── patches/           o texto original dos patch notes da EA
├── sources/           registro das leituras externas
│   └── imports/       os payloads brutos, como vieram
├── indexes/           mapas derivados (regeráveis)
└── diffs/             comparações entre duas versões
```

E o artefato:

```
public/data/catalog.current.json    o único arquivo que o site abre
```

## O caminho de um dado até a tela

```
data/entities + data/versions/<atual>
        ↓  scripts/catalog/generate-indexes.ts
data/indexes/current.json
        ↓  scripts/catalog/build.ts
public/data/catalog.current.json
        ↓  src/catalog/index.ts
telas
```

Nenhuma tela lê `data/`. Nenhuma tela sabe o que é versão, patch note ou
conflito de fontes. O que existe para quem desenha interface é a camada de
acesso — `getWeapon`, `getWeaponAttachments`, `getAttachmentEffects` — descrita
em [contributing-data.md](contributing-data.md).

Essa fronteira é deliberada. O catálogo vai mudar de forma outra vez; quando
mudar, o que se reescreve é `src/catalog/index.ts`, e as telas seguem inteiras.

## O que é gerado e o que é escrito

| Arquivo | Origem |
| --- | --- |
| `data/entities/*` | pipeline, revisado por gente |
| `data/versions/*` | pipeline, revisado por gente |
| `data/patches/*` | baixado da EA, nunca editado |
| `data/sources/*` | registro automático de cada leitura |
| `data/indexes/*` | **gerado** — `npm run catalog:indexes` |
| `data/diffs/*` | **gerado** — `npm run catalog:diff` |
| `public/data/catalog.current.json` | **gerado** — `npm run catalog:build` |

Editar um arquivo gerado é perder a edição no build seguinte. O que se corrige é
sempre a camada de origem — e o workflow de validação recusa Pull Request em que
o gerado discorde da origem.

## Princípios que o código aplica

1. **IDs nunca são reutilizados.** Nem depois de a entidade sair do jogo.
2. **Nada é apagado.** Remoção é `status: "removed"` com `removedIn` preenchido.
3. **Compatibilidade nunca é deduzida.** Ver [compatibility.md](compatibility.md).
4. **Dado ausente é `null`, nunca um palpite.** Ver [data-sources.md](data-sources.md).
5. **Índice é derivado.** Se ele discordar da compatibilidade, quem está errado é
   o índice.
6. **`main` nunca é escrita pela automação.** Ver [update-workflow.md](update-workflow.md).
7. **Capacidade só é verdadeira com cobertura completa.** `capabilities`, no
   artefato, diz o que o catálogo sustenta — e é o que autoriza cada domínio do
   site a migrar. Ver [frontend-migration.md](frontend-migration.md).
8. **A confiança viaja com o número.** Dado provisório chega à tela marcado como
   provisório. Ver [data-sources.md](data-sources.md).

## Estatísticas e simulação são coisas diferentes

`stats.json` guarda o que o menu do jogo mostra — cadência, carregador, tempo de
mira. Os arquivos de simulação guardam o que descreve o projétil no ar — curva
de dano, velocidade, arrasto. Procedências diferentes, confiabilidades
diferentes, e é por isso que não moram no mesmo arquivo.

TTK não é armazenado. Guarda-se a curva, a cadência e o modelo de voo; o tempo
para abater sai daí, para qualquer distância.

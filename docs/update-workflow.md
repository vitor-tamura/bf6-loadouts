# Atualização automática

O gatilho e a fonte são os **patch notes oficiais da EA**. O pipeline não
depende de Reddit, do BF6 Loadouts nem do dataset da comunidade para saber que
saiu versão nova — essas fontes seguem valendo para balística e conferência,
mas não decidem quando atualizar.

## Um comando só

```bash
npm run catalog:update                       # descobre e processa o que faltar
npm run catalog:update -- --version 1.4.2.0  # uma versão específica
npm run catalog:update -- --dry-run          # mostra o que faria, sem escrever
```

É exatamente o que o GitHub Actions executa. Se o workflow rodasse uma sequência
própria de passos, viraria uma caixa preta que só falha em produção.

O `--dry-run` imprime as mudanças reconhecidas com o nível de cada uma e não
toca em arquivo nenhum:

```
[catalog] 1.4.1.0: mudanças reconhecidas { total: 2, auto: 0, review: 2 }
[catalog]   🟡 weapon_added —
[catalog]   🟡 compatibility_added m87a1, m1014, ks18k, db12
[catalog] 1.4.1.0: nenhum arquivo foi modificado (--dry-run)
```

## De onde sai a versão

Do **endereço do artigo**, nunca do corpo da página:

```
/news/battlefield-6-game-update-1-4-1-5   →   1.4.1.5
```

A página de novidades tem números de quatro grupos por toda parte —
`2.926.379.084`, `069.342.055.185` — que são identificadores de componente. Um
extrator que varresse o texto colheria um deles como versão, e o pipeline
baixaria um patch note inexistente e abriria Pull Request para uma versão que a
EA nunca lançou.

## Os três workflows

Em `.github/workflows/`:

| Arquivo | Quando | O que faz |
| --- | --- | --- |
| `bf6-update-check.yml` | a cada 6 h | pergunta à EA se há versão nova |
| `bf6-update-process.yml` | disparado pelo anterior | processa todas as versões que faltam e publica em `main` |
| `ci.yml` | em PR e push | testes, lint, tipos, build e arquivos gerados do catálogo |

## Sem revisão manual

A automação aplica e publica em `main` sozinha. O site não fica mais parado no
patch anterior esperando alguém aprovar um Pull Request.

O que segura a publicação é a validação, não uma pessoa: testes, lint, tipos,
compatibilidade e build rodam antes do push. Falhando qualquer um, nada vai para
`main` e abre-se uma issue com o link da execução.

O que o patch note diz com certeza (🟢) é aplicado. O que ele diz de forma
ambígua (🟡) fica registrado no catálogo como evento `review` — marcado, nunca
adivinhado.

## Verificação

Roda de seis em seis horas e faz uma pergunta só: apareceu na página de
novidades da EA algum número de versão que `data/versions` ainda não tem, com
data de publicação até hoje. Artigo com data futura fica para a rodada em que a
data chegar.

Quando há versões novas, o processamento é disparado **uma vez**, e processa
todas elas da mais antiga até a mais recente: cada versão parte do estado da
anterior, e é assim que a mudança entre uma atualização e outra entra inteira.

Se a página responder e **nenhum** número de versão for encontrado, o workflow
falha de propósito: isso não significa "não há patch", significa que a página
mudou de forma ou de endereço, e seguir em frente diria que está tudo em dia
justamente quando o pipeline parou de enxergar.

## Processamento

```
baixa patch note → lê → concilia → índices → valida → diff → build
      → cobertura → análise para o site → apelidos → auditoria de acessórios
      → checagens → push em main
```

### Análise para o site

O parser acima lê frase por frase com regra fixa e grava no catálogo versionado.
O site lê `src/data`, e o patch nem sempre fala a língua de uma regra — na
1.4.3.0 a Interdictor só aparecia no título "Interdictor Balance Updates", e o
comentário do desenvolvedor dizia "80 damage to the chest and limbs at all
ranges" em vez de um "de X para Y".

`npm run catalog:analisar-patch` faz essa leitura com as mesmas duas fontes de
uma revisão manual: o patch note da EA (baixado da página de novidades) e as
linhas de arma do bf6balancelog. Um modelo (OpenAI, ou o Gemini gratuito quando o
crédito acaba) propõe as mudanças; o código só aplica a proposta que:

- cita frases que existem, palavra por palavra, no patch ou no balancelog;
- tem todos os números nessas frases;
- fala da arma certa — pelo nome na frase, pelo título da seção logo acima, ou
  pela ligação que o balancelog faz;
- mexe em peça que a arma aceita.

O resultado, aplicado e recusado com o motivo, fica em
`data/versions/<versão>/site.json`. Versão sem esse arquivo continua pendente, e
a verificação de seis em seis horas dispara o processamento de novo até a
análise fechar.

## O que o patch note consegue aplicar sozinho

| Situação | O que acontece |
| --- | --- |
| "Weapon X has been removed" | 🟢 entidade passa a `removed`, com `removedIn` |
| "from 800 to 820" | 🟢 os dois números vêm da fonte |
| "available for the M87A1, M1014, 18.5KS-K, and DB-12" | 🟢 as relações nascem, se a peça e todas as armas resolverem |
| "recoil reduced by 10%" | 🟡 registra operação e proporção, sem virar número |
| "Added a new laser attachment" (sem slot/custo) | 🟡 falta o que o patch não publicou |
| peça citada que não existe no catálogo | 🟡 precisa ser criada antes |

Compatibilidade só nasce sozinha quando a EA **lista as armas**. Sem lista, é
pendência — nunca dedução por categoria.

## Idempotência

Rodar de novo não duplica nada:

- versão já em `data/versions` é pulada;
- patch note já baixado não é rebaixado;
- duas execuções nunca correm juntas: o processamento tem uma fila só.

## Quando algo falha

Nada é publicado: abre-se uma **issue** com o link da execução, e o site segue na
última versão que passou.

Um caso não é falha: patch note **sem mudanças de catálogo**. Um update de
correções — deploy, animação, som, interface — legitimamente não altera arma
nenhuma, e o pipeline segue com zero mudanças. O que separa isso de "o parser
não entendeu" é a estrutura do texto: tendo changelog e seções, zero é resposta;
não tendo, é falha.

## Revisar

1. Leia a contagem `review` — é o que precisa de decisão.
2. Confira em `changes.json` cada evento marcado, com a frase de origem ao lado.
3. Para percentuais, meça no jogo e atualize `stats.json` à mão, se for o caso.
4. Para conflito de fontes, escolha e escreva o porquê em `resolution.reason`.
5. Rode `npm run catalog` e commite o gerado.

O workflow de validação confere se o gerado está em dia com a origem — Pull
Request com índice defasado é recusado.

## Rodar passo a passo

`catalog:update` faz tudo, mas cada passo continua utilizável sozinho — é assim
que se depura um pipeline quando ele quebra:

```bash
npm run catalog:discover
npm run catalog:fetch-patch  -- 1.4.2.0
npm run catalog:parse-patch  -- 1.4.2.0
npm run catalog:reconcile    -- 1.4.2.0
npm run catalog
npm run catalog:diff -- 1.4.1.5 1.4.2.0
npm run catalog:coverage
```

A balística tem caminho próprio, e não sai do patch note:

```bash
npm run catalog:fetch-github
npm run catalog:import-analyzer
```

Uma versão nova **herda** a simulação da anterior — sem isso, um patch que só
corrige um botão derrubaria as capacidades `damageCurves`, `velocity` e `ttk`
para falso, e o TTK e os gráficos deixariam de existir da noite para o dia.

## Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `GITHUB_TOKEN` | eleva o limite da API do GitHub |
| `CATALOG_EA_NEWS_URL` | muda a página de novidades da EA |
| `CATALOG_LOADOUTS_URL` | troca a fonte de `estado_atual` numa execução |
| `CATALOG_GITHUB_REPO` | troca a fonte de `numeros_de_simulacao` numa execução |
| `CATALOG_GITHUB_BRANCH` | o branch dela (padrão `main`) |
| `CATALOG_ARSENAL_URL` | troca a fonte de `enumeracao_de_slot` numa execução |
| `CATALOG_HTTP_TIMEOUT_MS` | tempo de cada requisição (padrão 30 s) |
| `CATALOG_HTTP_RETRIES` | tentativas por requisição (padrão 3) |

As três últimas trocas de fonte valem só para aquela execução. Troca permanente é
edição de [`data/sources/registry.json`](../data/sources/registry.json) — a EA é
a única fonte que mora no código. Ver
[data-sources.md](data-sources.md).

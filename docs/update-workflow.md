# Atualização automática

Três workflows em `.github/workflows/`.

| Arquivo | Quando | O que faz |
| --- | --- | --- |
| `bf6-update-check.yml` | a cada 6 h | pergunta à EA se há versão nova |
| `bf6-update-process.yml` | disparado pelo anterior | processa e abre Pull Request |
| `catalog-validation.yml` | em PR e push | valida o catálogo |

## A regra que não se quebra

**A automação nunca escreve em `main`.**

Nem quando a mudança é óbvia, nem quando a validação passa limpa. O que sai do
processamento é sempre um branch `data/update/<versão>` e um Pull Request. O
catálogo alimenta um site que diz às pessoas o que montar; uma leitura errada
publicada sozinha é uma recomendação errada dada em nome do projeto.

## Verificação

Roda de seis em seis horas e faz uma pergunta só: apareceu na página de
novidades da EA algum número de versão que `data/versions` ainda não tem. Na
maioria das execuções a resposta é não e o workflow termina em segundos.

Quando há várias versões novas, o processamento é disparado uma vez por versão,
da mais antiga para a mais nova.

Se a página responder e **nenhum** número de versão for encontrado, o workflow
falha de propósito: isso não significa "não há patch", significa que a página
mudou de forma ou de endereço, e seguir em frente diria que está tudo em dia
justamente quando o pipeline parou de enxergar.

## Processamento

```
baixa patch note → lê → estado atual → dataset da comunidade
      → concilia → valida → diff → build → branch → Pull Request
```

Falhas têm pesos diferentes:

- **sem patch note** — interrompe; não há o que conciliar;
- **patch note ilegível** — `blocked`: abre issue `[CATALOG] Revisão manual
  necessária`, não altera nada;
- **sem estado atual ou sem dataset da comunidade** — segue, marcado. O PR
  informa que a matriz não foi reconfirmada;
- **testes falhando** — segue, e o PR explica. Os testes fixam relações
  confirmadas à mão (o 50 MW Violet, entre outras): uma falha significa que o
  patch mudou uma delas, e isso precisa de confirmação com o jogo aberto, não de
  um teste ajustado às pressas.

## O corpo do Pull Request

Título: `feat(data): update Battlefield 6 to <versão>`

Traz o diff resumido (armas, acessórios, compatibilidade, stats, efeitos,
custos), a contagem por nível de automação, o resultado de cada fonte e o
lembrete de que percentuais não viraram número.

## Revisar

1. Leia a contagem `review` — é o que precisa de decisão.
2. Confira em `changes.json` cada evento marcado, com a frase de origem ao lado.
3. Para percentuais, meça no jogo e atualize `stats.json` à mão, se for o caso.
4. Para conflito de fontes, escolha e escreva o porquê em `resolution.reason`.
5. Rode `npm run catalog` e commite o gerado.

O workflow de validação confere se o gerado está em dia com a origem — Pull
Request com índice defasado é recusado.

## Rodar na mão

```bash
npm run catalog:discover
npm run catalog:fetch-patch  -- 1.4.2.0
npm run catalog:parse-patch  -- 1.4.2.0
npm run catalog:fetch-loadouts
npm run catalog:fetch-github
npm run catalog:reconcile    -- 1.4.2.0
npm run catalog
npm run catalog:diff -- 1.3.3.0 1.4.2.0
```

## Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `GITHUB_TOKEN` | eleva o limite da API do GitHub |
| `CATALOG_EA_NEWS_URL` | muda a página de novidades |
| `CATALOG_LOADOUTS_URL` | muda o endereço do estado atual |
| `CATALOG_GITHUB_REPO` | troca o dataset da comunidade |
| `CATALOG_HTTP_TIMEOUT_MS` | tempo de cada requisição (padrão 30 s) |
| `CATALOG_HTTP_RETRIES` | tentativas por requisição (padrão 3) |

# Versionamento

Cada versão do jogo é um instantâneo independente em `data/versions/<versão>/`.
Nenhuma sobrescreve outra. O Git guarda a história do repositório; estes
diretórios guardam a história do jogo, que é outra coisa — um `git revert` desfaz
um erro de importação, mas não devolve o que a M16A4 tinha de cadência em
1.3.3.0.

## Formato

Quatro grupos de dígitos, como a EA numera: `1.3.3.0`, `1.4.2.0`. `1.4` e
`Season 4` são recusados pelo validador.

A ordenação é numérica, nunca alfabética — em ordem de texto `1.4.10.0` viria
antes de `1.4.2.0`, e o pipeline processaria patches fora de ordem, reescrevendo
o estado novo com o velho.

## IDs estáveis

Um id nunca é reutilizado, nem depois de a entidade sair do jogo.

Quando o nome muda, o id fica:

```json
{
  "id": "50mw_violet",
  "name": "Violet 50 MW Laser",
  "aliases": ["50 MW Violet"]
}
```

O nome antigo desce para `aliases` — senão a busca por "50 MW Violet" deixaria de
achar a peça no dia da renomeação, e todo registro histórico que a cita ficaria
órfão.

## Ciclo de vida

```json
{
  "status": "active",
  "introducedIn": "1.3.3.0",
  "removedIn": null
}
```

| Status | Significado |
| --- | --- |
| `active` | está no jogo |
| `removed` | saiu; `removedIn` diz quando |
| `deprecated` | ainda existe, a caminho da saída |

Entidade removida **não é apagada**. Ela continua em `data/entities/`, e a
compatibilidade histórica que a cita continua nos instantâneos antigos. O que
muda é que ela para de aparecer no artefato público.

Se voltar ao jogo, o mesmo id é reaproveitado — `status` volta a `active` e um
evento `weapon_reintroduced` ou `attachment_reintroduced` registra a volta.

## Qual versão está no ar

Quem decide é `status: "current"` no `metadata.json`, não a ordem dos números.
Uma versão pode existir em `data/versions/` sem estar publicada — é exatamente o
que acontece enquanto o Pull Request de um patch novo aguarda revisão.

`reconcile` marca a nova como `current` e rebaixa a anterior a `historical`. O
merge do PR é o que publica.

## Peças com escopo de arma

Carregadores não são compartilhados. O "30 Rnd" da M4A1 é uma entidade diferente
do "30 Rnd" de qualquer outra arma — capacidade, custo e efeito são próprios —, e
o id carrega o dono:

```
magazine:m121a2:100_rnd
magazine:ks18k:4_rnd
```

Munição segue a mesma ideia de prefixo, com escopo global:

```
ammo:standard
ammo:hollow_pt
```

O validador recusa uma peça de escopo de arma que apareça na compatibilidade de
outra arma.

## Comparar duas versões

```bash
npm run catalog:diff -- 1.3.3.0 1.4.0.0
```

Escreve `data/diffs/1.3.3.0-to-1.4.0.0.json` e imprime o resumo que vai no corpo
do Pull Request. O diff só lê; pode rodar quantas vezes for preciso, inclusive
sobre versões antigas.

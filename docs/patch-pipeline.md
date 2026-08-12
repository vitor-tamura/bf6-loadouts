# O pipeline de patch

Os scripts vivem em `scripts/catalog/` e rodam em Node 24 com
`--experimental-strip-types` — TypeScript direto, sem passo de build.

## Os comandos

| Comando | O que faz |
| --- | --- |
| `npm run catalog:migrate` | importa `BF6_Catalogo_ESCALAVEL_v5.json` (só a primeira vez) |
| `npm run catalog:discover` | pergunta à EA se há versão nova |
| `npm run catalog:fetch-patch -- <versão>` | baixa e guarda o patch note |
| `npm run catalog:parse-patch -- <versão>` | lê o patch note e estrutura as mudanças |
| `npm run catalog:fetch-loadouts` | guarda o estado atual do jogo |
| `npm run catalog:fetch-github` | guarda o dataset da comunidade, preso ao commit |
| `npm run catalog:import-analyzer` | traz balística, dano, recuo, espalhamento e recarga |
| `npm run catalog:coverage` | diz que domínios do site já podem migrar |
| `npm run catalog:reconcile -- <versão>` | cria a versão nova |
| `npm run catalog:indexes` | regera os índices |
| `npm run catalog:validate` | confere o catálogo inteiro |
| `npm run catalog:diff -- <de> <para>` | compara duas versões |
| `npm run catalog:build` | gera `public/data/catalog.current.json` |
| `npm run catalog` | índices + validação + build |

## A ordem

```
discover-updates      há versão nova?
      ↓
fetch-patch-note      baixa o texto e guarda inteiro
      ↓
parse-patch-note      o texto vira mudanças estruturadas
      ↓
fetch-loadouts        o que existe hoje
fetch-github-data     conferência, presa a um commit
      ↓
reconcile             cria data/versions/<nova>/
      ↓
generate-indexes      regera os mapas
      ↓
validate              recusa dado inconsistente
      ↓
diff                  o resumo que vai no Pull Request
      ↓
build                 o artefato que o site lê
```

Download e leitura são passos separados de propósito: quando o parser melhorar,
os patch notes guardados podem ser reprocessados sem depender de a EA manter as
páginas no ar.

## O que o `reconcile` aplica sozinho

Pouca coisa:

- **remoção anunciada pela EA** — a entidade passa a `removed`, com a versão da
  saída, e as relações dela são encerradas. Nada é apagado;
- **estatística com os dois números na fonte** — "from 800 to 820" traz o antes e
  o depois.

## O que ele nunca aplica

**Percentual.** "Recoil reduced by 10%" é registrado como operação e proporção:

```json
{ "operation": "percentage", "value": -10, "before": null, "after": null }
```

Calcular 10% sobre o valor que o catálogo tem hoje só funcionaria se esse valor
estivesse certo e se o arredondamento do jogo fosse o do JavaScript. O evento
fica marcado `review`, para confirmação com medição.

**Adição.** Arma nova precisa de id, categoria, calibre e da lista inteira de
peças que aceita. O patch note anuncia o nome; o resto viria de palpite.

**Compatibilidade sem confirmação do estado atual.** Se a leitura do BF6
Loadouts falhar, a matriz da versão anterior é copiada como está e o evento diz
que ela não foi reconfirmada. A alternativa — deduzir da categoria — é o que
[compatibility.md](compatibility.md) proíbe.

## Os três níveis

| Nível | Quando | Efeito |
| --- | --- | --- |
| `auto` | fonte confirma, entidade existe, operação reconhecida | aplicado |
| `review` | fontes divergem, entidade desconhecida, número ausente | vai ao PR marcado |
| `blocked` | o parser não identificou nem do que se trata | catálogo intacto, issue aberta |

## Validação

`npm run catalog:validate` erra (e falha) em: id repetido, categoria ou slot
inexistente, relação apontando para entidade desconhecida, peça no slot errado,
peça de arma em arma alheia, relação duplicada, `removedIn` anterior a
`introducedIn`, registro sem procedência, dado marcado `inferred`, índice em
disco discordando da compatibilidade.

Avisa (e segue) em: relação `needs_review`, peça sem nenhuma arma, arma sem
nenhuma peça, custo não publicado, efeito com campo que a fonte marcou como
suposição dela.

A distinção importa: uma pendência conhecida não pode travar o pipeline, senão a
saída mais fácil vira apagá-la.

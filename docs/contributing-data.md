# Mexer no catálogo

## Antes de tudo

Descubra se o arquivo que você quer editar é **origem** ou **gerado**.

| Origem — edite | Gerado — não edite |
| --- | --- |
| `data/entities/*` | `data/indexes/*` |
| `data/versions/*` | `data/diffs/*` |
| `data/sources/*` | `public/data/catalog.current.json` |

Editar um arquivo gerado é perder a edição no build seguinte, e o workflow de
validação recusa o Pull Request.

Depois de qualquer mudança em `data/`:

```bash
npm run catalog     # índices + validação + build
npm test
```

## Resolver uma pendência de compatibilidade

Encontre a relação em `data/versions/<atual>/compatibility.json`:

```json
{
  "weaponId": "vz61",
  "attachmentId": "fold_stubby",
  "slot": "underbarrel",
  "status": "needs_review",
  "note": "A matriz da fonte registra esta relação no slot \"laser\"..."
}
```

Com o jogo aberto, confirme. Se a relação existe, mude `status` para `active`,
apague a `note` e ajuste a `source` para quem confirmou. Se não existe, use
`removed`. Depois registre um evento em `changes.json`:

```json
{
  "id": "evt-2026-09-01-vz61-grips",
  "gameVersion": "1.3.3.0",
  "timestamp": "2026-09-01",
  "type": "source_conflict_resolved",
  "entityType": "compatibility",
  "entityId": "vz61",
  "changes": { "attachments": ["fold_stubby"], "status": "active" },
  "sources": [{ "provider": "jogo", "type": "verified", "version": "1.3.3.0" }],
  "automation": "auto",
  "resolution": { "status": "resolved", "selectedSource": "jogo", "reason": "Confirmado no menu de personalização." }
}
```

Nunca apague o conflito ao resolvê-lo. Sem o registro, daqui a três patches
ninguém saberá que a decisão foi uma decisão.

## Adicionar uma arma

1. Entidade em `data/entities/weapons.json`, com id novo (nunca reutilizado),
   `introducedIn` na versão em que ela entrou e `source`.
2. Instantâneo em `data/versions/<versão>/weapons.json`.
3. Estatísticas em `stats.json` — só os campos que a fonte publica; o resto fica
   de fora, não vira zero.
4. Compatibilidade em `compatibility.json`, **uma linha por peça**, cada uma com
   procedência. Não copie a lista de outra arma.
5. Evento `weapon_added` em `changes.json`.

## Adicionar um acessório

Igual, com duas diferenças:

- se a peça pertence a uma arma só (carregador, por exemplo), use
  `scope: "weapon"`, preencha `weaponScope` e dê um id com escopo:
  `magazine:<arma>:<peça>`;
- efeitos e custo vão em `effects.json`, não na entidade. Custo que a fonte não
  publica é `null`.

## Nomes em português

As entidades guardam o nome da **fonte**, em inglês — é o dado importado, e
reescrevê-lo faria o catálogo deixar de bater com o que a fonte publica. O nome
que o jogo usa em português vive em `data/entities/names.pt-BR.json`, e o build
compõe os dois: `name` em português, `originalName` em inglês.

```json
{
  "50mw_violet": { "pt": "Laser Violeta de 50 MW", "original": "50 MW Violet", "from": "dataset" }
}
```

`from` diz de onde a tradução veio:

| Origem | Significado | Precedência |
| --- | --- | --- |
| `jogo` | conferido numa print da tela | **manda sobre todas** |
| `matriz` | tela "Selecionar cano" — comprimento × perfil | alta |
| `dataset` | nomenclatura curada em `src/data/attachments.ts` | média |
| `curadoria` | traduzido seguindo o vocabulário das outras | baixa |

**A print do jogo manda.** O dataset curado já errou dois nomes: a peça de
ergonomia da M16A4 é `Receptor A3` (não "Receiver A3") e o supressor de 30
pontos é `Supressor Leve` (não "Supressor Aliviado"). Quando uma print
contradiz qualquer outra origem, ela vence — e a entrada passa a `from: "jogo"`,
com a tela citada na nota.

Os 283 carregadores não estão listados um a um: eles seguem padrão fechado
(`30 Rnd`, `30 Fast`) e são resolvidos pelas `rules` do mesmo arquivo. Escrever
283 linhas à mão só criaria 283 lugares para errar.

### Canos seguem a matriz do jogo

O BF6 nomeia cano pelo cruzamento de comprimento com perfil, não pela medida:

| | curto | básico | estendido |
| --- | --- | --- | --- |
| normal | Cano Curto | Cano Básico | Cano Estendido |
| leve | Cano Curto Leve | Cano Leve | Cano Estendido Leve |
| pesado | — | Cano Pesado | Cano Ext. Pesado |

Fora da matriz existe o **Crio**. A fonte de verdade é a print do jogo — não o
sym.gg, não texto de IA. Há teste fixando essa matriz.

### Peça nova sem tradução

Aparece na tela com o nome de origem, e `catalog:validate` avisa. Não é erro: é
melhor mostrar "Folding Stubby" do que uma tradução inventada na hora. Mas é o
passo que se esquece quando um patch traz peça nova.

## Renomear

Mude `name`, empurre o nome antigo para `aliases`, mantenha o id e registre
`weapon_renamed` ou `attachment_renamed`.

## Remover

Nunca apague. `status: "removed"`, `removedIn` na versão da saída, e as relações
passam a `removed`. O histórico das versões anteriores continua intacto.

## A camada de acesso

O site nunca lê `data/`. Ele usa `src/catalog`:

```ts
import {
  getCurrentCatalog,
  getVersion,
  getWeapon,
  getWeapons,
  getAttachment,
  getAttachments,
  getWeaponAttachments,
  getWeaponAttachmentsBySlot,
  getAttachmentWeapons,
  getAttachmentEffects,
  getAttachmentCost,
  getWeaponStats,
  isCompatible,
  getPending,
} from '@/catalog';
```

Se uma tela precisa de algo que essas funções não dão, a função nova vai em
`src/catalog/index.ts` — não em `import` direto do JSON. A fronteira é o que
permite trocar a forma do catálogo sem reescrever as telas.

## Os efeitos vêm em degraus

`getAttachmentEffects` devolve as chaves da fonte: `adsTimeTierMod`,
`hipSpreadTierMod`, `movingAdsSpreadTierMod`. São **degraus**, não porcentagens.
Nenhuma fonte publica a tabela de conversão, então exiba o degrau — inventar o
percentual é criar precisão que ninguém mediu.

## Testes

`src/catalog/catalog.test.ts` lê o artefato de verdade e fixa relações
confirmadas à mão. Ele falha quando o catálogo muda — é o alarme funcionando.

Se um patch mudar de fato uma dessas relações, atualize o teste **junto com a
confirmação no jogo**, e diga no Pull Request o que foi conferido.

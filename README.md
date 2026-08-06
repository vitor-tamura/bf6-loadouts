# Arsenal BF6

Montador de loadouts de **Battlefield 6** em português do Brasil. Escolha a
classe e a arma, encaixe os acessórios dentro dos 100 pontos, veja as
estatísticas e os gráficos de dano e queda de bala se recalcularem a cada peça, e
compartilhe a build por um link.

Três telas: **Montar**, **Todas as Armas** (catálogo com filtros e ordenação) e
**Comparar** (até quatro armas lado a lado).

Funciona no navegador do celular (Android e iPhone), dentro de WebView, e pode
ser instalado na tela inicial.

- **O que o projeto faz e por quê:** [`CARACTERISTICAS.md`](./CARACTERISTICAS.md)
- **Como manter o dataset em dia:** [`ATUALIZAR.md`](./ATUALIZAR.md)
- **Relação de todas as armas:** [`ARMAS.md`](./ARMAS.md)
- **Relação de todos os acessórios:** [`ACESSORIOS.md`](./ACESSORIOS.md)
- **Imagens e ícones:** [`IMAGENS.md`](./IMAGENS.md)

## Rodando

```bash
npm install
npm run dev      # http://localhost:3000
```

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | gera o site estático em `out/` |
| `npm test` | 56 testes de dataset, cálculo, balística, link e temporada |
| `npm run typecheck` | checagem de tipos |
| `npm run sync` | compara o dataset com o catálogo público — só relata |
| `npm run sync:apply` | grava o que dá para gravar, preservando a curadoria |
| `npm run images` | mostra quais fotos de arma ainda faltam |
| `npm run images:download` | baixa as que faltam para `public/weapons/` |
| `npm run docs:attachments` | regenera `ACESSORIOS.md` a partir do dataset |
| `npm run docs:weapons` | regenera `ARMAS.md` a partir do dataset |

A sincronização também roda sozinha toda segunda, pelo GitHub Actions, e abre um
Pull Request quando o jogo muda alguma coisa — ver [`ATUALIZAR.md`](./ATUALIZAR.md).

## Publicando

No ar em **https://bf6-loadouts.vercel.app**.

A Vercel publica a partir do GitHub, sem passo manual: push na `main` atualiza a
produção, e `dev` e cada Pull Request ganham uma URL de preview própria — é lá
que a mudança se confere antes de virar o site que todo mundo vê.

O build gera HTML estático em `out/`, sem backend nem banco — o loadout inteiro
viaja dentro da URL. Serve em qualquer hospedagem estática (Vercel, Netlify,
GitHub Pages, S3, nginx), mas o domínio precisa ser a raiz: o link compartilhado
é montado com `window.location.origin`, que descarta subcaminho.

```bash
npm run build
npx serve out    # conferência local do build
```

### Branches e versões

Trabalho novo entra em `dev` e só vai para `main` depois de conferido — `main` é
o que se publica. A sincronização automática de dados abre o Pull Request contra
`dev` pelo mesmo motivo: dado de jogo também passa por teste.

A `main` é protegida: entra por Pull Request, com uma aprovação do dono do código
(ver [`.github/CODEOWNERS`](./.github/CODEOWNERS)), sem force-push e sem apagar a
branch.

A release sai da versão, não do push. Ao promover para `main` com um `version`
novo no `package.json`, o Actions cria a tag `vX.Y.Z` e publica a release com os
commits desde a anterior; promoção que não mexe na versão não gera release
nenhuma.

## Milestones (GitHub)

### Concluídas

- **Base do produto publicada:** montador, catálogo e comparação funcionando em
	produção na Vercel.
- **Sincronização automática de dados:** workflow
	[`.github/workflows/sync-data.yml`](./.github/workflows/sync-data.yml) executa
	semanalmente, detecta diferenças no catálogo e abre Pull Request automático.
- **Fluxo de release automatizado:** workflow
	[`.github/workflows/release.yml`](./.github/workflows/release.yml) cria tag e
	release quando há mudança de versão no `package.json`.
- **Governança de branch principal:** `main` protegida com revisão obrigatória e
	ownership por [`.github/CODEOWNERS`](./.github/CODEOWNERS).
- **Rede de segurança validada:** suíte de testes cobrindo dataset, cálculos,
	balística, share link e regras de temporada integrada ao fluxo de PR.

### Próximas implementações

- **M-01 · Fechar pendências de tradução e descrição de peças**
	Objetivo: eliminar entradas `TODO: traduzir` e `TODO: descrever em português`
	no dataset de acessórios.
	Entrega esperada: experiência 100% em português no montador e no catálogo,
	sem placeholders visíveis.
- **M-02 · Completar mídia do arsenal**
	Objetivo: fechar as fotos faltantes de armas (especialmente corpo a corpo e
	Interdictor) e manter cobertura contínua para novos itens de temporada.
	Entrega esperada: preview visual completo, sem fallback para marcador textual.
- **M-03 · Reduzir heranças temporárias de compatibilidade**
	Objetivo: substituir slots herdados em armas recém-chegadas por listas nativas
	de compatibilidade assim que a fonte publicar os dados completos.
	Entrega esperada: maior fidelidade entre montagem no site e comportamento real
	do Gunsmith para 100% do arsenal.
- **M-04 · Expandir curadoria de efeitos numéricos**
	Objetivo: migrar gradualmente peças com efeito aproximado para valores
	validados (`provenance: game`) com critérios rastreáveis.
	Entrega esperada: redução do uso de aproximação em TTK, recuo, manejo e
	balística, melhorando a confiança dos comparativos.
- **M-05 · Observabilidade de atualização de conteúdo**
	Objetivo: enriquecer o PR automático de sync com resumo estruturado (itens
	novos, conflitos de curadoria e riscos de regressão).
	Entrega esperada: revisão mais rápida das mudanças de temporada e menor tempo
	entre patch do jogo e publicação no site.

## Stack

Next.js 16 (App Router, exportação estática) · TypeScript · Tailwind CSS 4 ·
Zustand · Vitest. Gráficos e desenhos das armas são SVG próprio, sem bibliotecas
de visualização.

O código usa nomes em inglês; a interface e o dataset, português.

---

Projeto de fã, sem vínculo com a Electronic Arts ou a DICE. Battlefield é marca
registrada da Electronic Arts.

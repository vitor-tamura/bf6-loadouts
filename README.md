# Arsenal BF6

Montador de loadouts de **Battlefield 6** em português do Brasil. Escolha a
classe e a arma, encaixe os acessórios dentro dos 100 pontos, veja as
estatísticas e os gráficos de dano e queda de bala se recalcularem a cada peça, e
compartilhe a build por um link.

Funciona no navegador do celular (Android e iPhone), dentro de WebView, e pode
ser instalado na tela inicial.

- **O que o projeto faz e por quê:** [`CARACTERISTICAS.md`](./CARACTERISTICAS.md)
- **Como produzir as imagens das armas:** [`IMAGENS.md`](./IMAGENS.md)

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
| `npm test` | 47 testes de dataset, cálculo, balística e link |
| `npm run typecheck` | checagem de tipos |
| `node scripts/imagens.mjs` | mostra quais imagens de arma e acessório ainda faltam |

## Publicando

O build gera HTML estático em `out/`, sem backend nem banco — o loadout inteiro
viaja dentro da URL. Serve em qualquer hospedagem estática (Vercel, Netlify,
GitHub Pages, S3, nginx).

```bash
npm run build
npx serve out    # conferência local do build
```

## Stack

Next.js 16 (App Router, exportação estática) · TypeScript · Tailwind CSS 4 ·
Zustand · Vitest. Gráficos e desenhos das armas são SVG próprio, sem bibliotecas
de visualização.

---

Projeto de fã, sem vínculo com a Electronic Arts ou a DICE. Battlefield é marca
registrada da Electronic Arts.

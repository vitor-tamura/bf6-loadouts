# Imagens e ícones

Duas coisas diferentes aparecem na tela, e elas seguem caminhos separados:

| O quê | Como é desenhado | Onde mora |
| --- | --- | --- |
| A arma, no quadro de preview | fotografia | `public/weapons/` |
| Gadgets | fotografia, com ícone de reserva | `public/gadgets/` |
| Acessórios | ícone vetorial | `src/components/icons/` |

---

## A arma

As 67 fotos ficam no projeto, em `public/weapons/<id-da-arma>.webp`. A
aplicação não faz nenhuma requisição para fora: nada depende de site de
terceiros continuar no ar nem de o CDN permitir hotlink.

Todas seguem um padrão só: a arte de catálogo do BattlefieldMeta, a mesma
renderização que o jogo mostra na tela de montagem — uma arma, de perfil, com
fundo transparente —, em 1366 x 409 px, com a arma centrada no quadro. Até
outubro de 2026 a primeira escolha era a captura do IMFDB, e o arsenal parecia
de três sites diferentes: duas armas empilhadas num fundo escuro, capturas do
menu com a interface na tela, e renders de 320 px ao lado de fotos de 800.

O preview procura, nesta ordem:

1. `public/weapons/<id-da-arma>.webp`;
2. a URL de origem, se o arquivo local faltar — a arte grande do BattlefieldMeta
   primeiro, a captura de `src/data/weapon-images.ts` de reserva;
3. um marcador com o nome da arma, quando não há nenhuma das duas.

Busca de foto que "não acha a arma" costuma ser nome errado: a Interdictor é a
**Desert Tech HTI** no IMFDB, a Z84M é a **Zastava M84M**, a ELR-40 é a
**Cadex Defence CDX-40 SHDW**.

### Baixar

A versão da arte vem da API do BattlefieldMeta (`imageVersion`), e o endereço
é `https://img.battlefieldmeta.gg/<id>_version<n>/public`. Arma que a API ainda
não lista cai na reserva de `weapon-images.ts` (Battlefield Wiki, IMFDB). O
download é um comando:

```bash
npm run images:download                                  # só o que falta
python3 scripts/download_images.py --force --armas       # rebaixa todas as armas
```

Ele grava o WebP na largura da fonte, com qualidade 90 (cerca de 45 KB por
arma), e a cópia em PNG de 960 px para o cartão de compartilhamento, que o
Satori monta sem ler WebP. O workflow de novidades roda o mesmo comando, então
arma nova chega com foto. Para conferir o inventário sem baixar nada:

```bash
node scripts/images.mjs          # o que falta
node scripts/images.mjs --todas  # tudo, com a situação de cada um
node scripts/images.mjs --md     # tabela em Markdown
```

Para acrescentar uma arma: registre a URL em `weapon-images.ts` e rode o script.
Uma foto própria também serve — basta soltar o `.webp` na pasta com o id como
nome, sem mexer em código.

### Especificação

| Item | Valor |
| --- | --- |
| Formato | WebP, sRGB, fundo transparente, qualidade 90 |
| Quadro | 1366 x 409 px, arma centrada |
| Orientação | cano à **esquerda**, coronha à direita, como na tela de montagem do jogo |
| Vista | lateral, de perfil, uma arma só |
| Cartão | cópia em PNG de 960 x 287, paleta de 256 cores, em `public/weapons/card/` |

A foto mostra a arma **montada de fábrica**, então ela não muda quando um
acessório é encaixado — quem responde à montagem é o ícone do slot.

---

## Acessórios e gadgets

Não são imagens — são ícones desenhados em SVG, com traço em `currentColor`, de
modo que acompanham o tema e o estado do bloco (aceso quando há peça, apagado
quando o slot está vazio).

| Arquivo | Cobre |
| --- | --- |
| `src/components/icons/attachment-icon.tsx` | os 317 acessórios |
| `src/components/icons/gadget-icon.tsx` | os 43 gadgets, equipamentos e arremessáveis |

A diferença entre os dois é proposital. Gadget é item único, então cada um tem o
seu desenho. Acessório se agrupa por **família**: o que o jogador precisa
reconhecer é que aquilo é um supressor, uma luneta longa, um tambor — e não qual
dos 152 canos é. `desenhoPara()` escolhe o glifo pelo slot e por palavras-chave
do nome original, incluindo a ampliação da mira (pontual, prismático, luneta
média, luneta longa) e o comprimento e o perfil do cano.

Para acrescentar um desenho, basta adicionar o `case` correspondente — nenhum
arquivo novo, nenhum asset.

### Gadgets

39 dos 43 têm foto, em `public/gadgets/<id>.webp` — 256 KB no total. A origem é
um template público do TierMaker, cujos nomes de arquivo descrevem a função
("smoke-nade", "recon-drone") em vez da designação que este projeto usa ("M18
Smoke", "XFGM-6D"); o mapa item a item mora em `src/data/gadget-images.ts`, e o
mesmo script baixa tudo.

Os quatro sem foto — Repair Tool, Acoustic Sensor, AIO Impact e Biohazard Gas —
aparecem com o ícone vetorial. É por isso que os ícones de gadget continuam
existindo: eles não são enfeite, são o que aparece nesses quatro e em qualquer
gadget novo antes de a arte chegar.

### Conferência

`/icones` é uma folha de contato com todos os desenhos lado a lado, fora do menu.
É onde se percebe que duas famílias ficaram parecidas demais ou que um traço
some no tamanho real.

# Imagens e ícones

Duas coisas diferentes aparecem na tela, e elas seguem caminhos separados:

| O quê | Como é desenhado | Onde mora |
| --- | --- | --- |
| A arma, no quadro de preview | fotografia | `public/weapons/` |
| Gadgets | fotografia, com ícone de reserva | `public/gadgets/` |
| Acessórios | ícone vetorial | `src/components/icons/` |

---

## A arma

As 62 fotos ficam no projeto, em `public/weapons/<id-da-arma>.webp` — 1,5 MB no
total. A aplicação não faz nenhuma requisição para fora: nada depende de site de
terceiros continuar no ar nem de o CDN permitir hotlink.

O preview procura, nesta ordem:

1. `public/weapons/<id-da-arma>.webp`;
2. a URL de origem em `src/data/weapon-images.ts`, se o arquivo local faltar;
3. um marcador com o nome da arma, quando não há nenhuma das duas.

Falta uma: a **Interdictor**, da Temporada 4, que ainda não apareceu em nenhuma
fonte pública.

### Baixar

`weapon-images.ts` guarda, por arma, até duas URLs de origem: a arte de catálogo
da Battlefield Wiki (`<ARMA>_BF6.png` — a arma no cenário de inspeção do jogo) e
uma reserva no IMFDB ou no battlefieldmeta.gg. O download é um comando:

```bash
python3 scripts/download_images.py           # só o que falta
python3 scripts/download_images.py --forcar  # rebaixa tudo
```

Ele converte para WebP a até 800 px de largura — a mesma foto em PNG ocupa perto
de dez vezes mais. Para conferir o inventário sem baixar nada:

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
| Formato | WebP, sRGB, alfa preservado quando a origem tem |
| Largura | até 800 px |
| Orientação | arma apontando para a **direita**, coronha à esquerda |
| Vista | lateral, de perfil |

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

As miras são a exceção dentro dos acessórios: em vez de contorno, elas têm
volume — face de cima preenchida e lente cheia —, e são oito silhuetas mapeadas
peça a peça em `SIGHT_SHAPE`, não escolhidas pela ampliação. O formato não segue
o aumento: a SF-G2 é 5× e é uma caixa holográfica, a CCO é 2× e é um tubo. É a
mira que o jogador escolhe primeiro e reconhece de longe, e o contorno sozinho
achatava a diferença entre um ponto vermelho e uma luneta de 8×.

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

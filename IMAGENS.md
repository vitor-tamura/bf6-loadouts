# Imagens e ícones

Duas coisas diferentes aparecem na tela, e elas seguem caminhos separados:

| O quê | Como é desenhado | Onde mora |
| --- | --- | --- |
| A arma, no quadro de preview | fotografia | `public/armas/` |
| Acessórios e gadgets | ícone vetorial | `src/components/icons/` |

---

## A arma

As 62 fotos ficam no projeto, em `public/armas/<id-da-arma>.webp` — 1,5 MB no
total. A aplicação não faz nenhuma requisição para fora: nada depende de site de
terceiros continuar no ar nem de o CDN permitir hotlink.

O preview procura, nesta ordem:

1. `public/armas/<id-da-arma>.webp`;
2. a URL de origem em `src/data/weapon-images.ts`, se o arquivo local faltar;
3. um marcador com o nome da arma, quando não há nenhuma das duas.

Falta uma: a **Interdictor**, da Temporada 4, que ainda não apareceu em nenhuma
fonte pública.

### Baixar

`weapon-images.ts` guarda, por arma, até duas URLs de origem: a arte de catálogo
da Battlefield Wiki (`<ARMA>_BF6.png` — a arma no cenário de inspeção do jogo) e
uma reserva no IMFDB ou no battlefieldmeta.gg. O download é um comando:

```bash
python3 scripts/baixar_imagens.py           # só o que falta
python3 scripts/baixar_imagens.py --forcar  # rebaixa tudo
```

Ele converte para WebP a até 800 px de largura — a mesma foto em PNG ocupa perto
de dez vezes mais. Para conferir o inventário sem baixar nada:

```bash
node scripts/imagens.mjs          # o que falta
node scripts/imagens.mjs --todas  # tudo, com a situação de cada um
node scripts/imagens.mjs --md     # tabela em Markdown
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

A diferença entre os dois é proposital. Gadget é item único, então cada um tem o
seu desenho. Acessório se agrupa por **família**: o que o jogador precisa
reconhecer é que aquilo é um supressor, uma luneta longa, um tambor — e não qual
dos 152 canos é. `desenhoPara()` escolhe o glifo pelo slot e por palavras-chave
do nome original, incluindo a ampliação da mira (pontual, prismático, luneta
média, luneta longa) e o comprimento e o perfil do cano.

Para acrescentar um desenho, basta adicionar o `case` correspondente — nenhum
arquivo novo, nenhum asset.

### Conferência

`/icones` é uma folha de contato com todos os desenhos lado a lado, fora do menu.
É onde se percebe que duas famílias ficaram parecidas demais ou que um traço
some no tamanho real.

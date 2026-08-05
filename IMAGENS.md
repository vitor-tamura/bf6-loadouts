# Imagens e ícones

Duas coisas diferentes aparecem na tela, e elas seguem caminhos separados:

| O quê | Como é desenhado | Onde mora |
| --- | --- | --- |
| A arma, no quadro de preview | fotografia | `public/armas/` ou fonte externa |
| Acessórios e gadgets | ícone vetorial | `src/components/icons/` |

---

## A arma

O preview procura, nesta ordem:

1. `public/armas/<id-da-arma>.png` — arte própria, se alguém colocar uma;
2. a foto do jogo, hospedada fora do projeto (`src/data/weapon-images.ts`);
3. um marcador com o nome da arma, quando nenhuma das duas carrega.

Para ver quais ids ainda não têm arte própria:

```bash
node scripts/imagens.mjs          # o que falta
node scripts/imagens.mjs --todas  # tudo, com a situação de cada um
node scripts/imagens.mjs --md     # tabela em Markdown
```

Não é preciso mexer em código para adicionar uma: basta soltar o PNG na pasta com
o id da arma como nome.

### Especificação

| Item | Valor |
| --- | --- |
| Formato | PNG-24, sRGB |
| Peso | idealmente abaixo de 300 KB |
| Proporção | 8:3 (o quadro do preview) |
| Orientação | arma apontando para a **direita**, coronha à esquerda |
| Vista | lateral, de perfil |

### Fontes externas

`weapon-images.ts` guarda, por arma, até duas URLs: a arte de catálogo da
Battlefield Wiki (`<ARMA>_BF6.png` — a arma no cenário de inspeção do jogo) e um
render de reserva. Nada é copiado para o repositório; as imagens são carregadas
direto da origem, o que tem duas consequências:

- é material da EA/DICE servido por terceiros, e pode sair do ar sem aviso;
- a foto mostra a arma **montada de fábrica**, então ela não muda quando um
  acessório é encaixado.

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

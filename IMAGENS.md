# Imagens do preview

O preview da arma é montado **em camadas**: uma imagem da arma sem acessórios e
uma imagem por peça, sobrepostas em tempo real sobre pontos de ancoragem.

Isso existe por um motivo prático. Uma imagem por combinação seria impossível:
só a AK4D tem 8 miras × 7 bocas × 6 canos × 5 acoplamentos × 5 carregadores ×
8 munições × 5 ergonomias × 4 ópticos × 4 acessórios laterais × 4 acessórios
laterais ≈ **10,7 milhões de imagens** — e são 63 armas. Em camadas, o total cai
para **108 arquivos** e qualquer combinação continua aparecendo montada.

Enquanto um arquivo não existir, o preview cai sozinho no desenho vetorial. Não
é preciso mexer em código ao adicionar imagens: basta soltar o PNG na pasta.

---

## O que gerar

```
public/armas/<id-da-arma>.png          63 arquivos
public/acessorios/<id-do-acessorio>.png 45 arquivos
```

Para ver a lista completa de ids e o que já está pronto:

```bash
node scripts/imagens.mjs          # o que falta
node scripts/imagens.mjs --todas  # tudo, com a situação de cada um
node scripts/imagens.mjs --md     # tabela em Markdown
```

Armas de corpo a corpo não entram: elas não usam o compositor.

---

## Especificação dos arquivos

### Comum a todos

| Item | Valor |
| --- | --- |
| Formato | PNG-24 com canal alfa (fundo **transparente**, não preto) |
| Cor | sRGB |
| Peso | idealmente abaixo de 300 KB por arquivo |
| Orientação | arma apontando para a **direita**, coronha à esquerda |
| Vista | lateral, perfeitamente de perfil, sem perspectiva |

Perspectiva é o ponto mais importante: se a arma base estiver levemente girada e
as peças não, o encaixe fica visivelmente torto. Renderize tudo com a **mesma
câmera ortográfica**.

### Imagem da arma

- **2400 × 900 px**, proporção 8:3 (o preview usa exatamente essa proporção)
- A arma ocupa a largura toda, com uma folga de ~4% em cada lado
- **Sem** mira, sem boca de fogo, sem empunhadura inferior, sem laser: só o
  corpo, o cano de fábrica, a coronha de fábrica e o carregador de fábrica
- Centralizada verticalmente pelo eixo do cano

### Imagem do acessório

- Só a peça, recortada justa, sem sombra projetada no fundo
- Altura livre; a **largura** é o que importa, porque a peça é escalada em
  proporção à largura da arma (ver tabela abaixo)
- Renderize na mesma escala física da arma: uma luneta de 6× deve ser desenhada
  no tamanho que ela teria montada em cima de um fuzil de 2400 px

**Ponto de encaixe** — a parte da imagem que encosta na arma:

| Slot | Encaixa pela | Enquadre a peça de modo que… |
| --- | --- | --- |
| Mira, Acessório Óptico | base, centro | a sapata fique rente à borda inferior |
| Cano, Boca | esquerda, meio | a rosca fique rente à borda esquerda |
| Acoplamento Inferior | topo, centro | a garra fique rente à borda superior |
| Carregador | topo, centro | o lábio fique rente à borda superior |
| Ergonomia (coronha) | direita, meio | o tubo fique rente à borda direita |
| Acessórios laterais | esquerda, meio | a garra fique rente à borda esquerda |

### Proporção de cada peça

A largura da peça é uma fração da largura da imagem da arma, definida em
`src/componentes/preview-arma/manifesto.ts` (`LARGURA_DA_PECA`). Os valores
atuais, em fração:

| Peça | Fração | Peça | Fração |
| --- | --- | --- | --- |
| Supressor | 0,13 | Luneta média | 0,16 |
| Freio | 0,055 | Luneta longa | 0,23 |
| Compensador | 0,065 | Ampliador | 0,06 |
| Quebra-chamas | 0,07 | Empunhadura vertical | 0,03 |
| Cano curto | 0,08 | Empunhadura angular | 0,045 |
| Cano longo | 0,21 | Apoio de mão | 0,025 |
| Cano pesado | 0,18 | Bipé | 0,10 |
| Ponto vermelho | 0,065 | Carregador | 0,045 |
| Holográfica | 0,09 | Tambor | 0,10 |
| Ferro | 0,03 | Laser | 0,05 |
| Coronha leve | 0,11 | Lanterna | 0,065 |
| Coronha pesada | 0,13 | | |

Se uma peça sair grande ou pequena demais, ajuste o número nessa tabela em vez
de reexportar a imagem.

---

## Ajuste fino do encaixe

As âncoras de cada arma são derivadas do arquétipo dela e valem para a maioria
dos casos. Quando uma imagem específica precisar de correção — o trilho está mais
alto, o poço do carregador mais à frente — preencha `AJUSTES_POR_ARMA` no
`manifesto.ts`:

```ts
export const AJUSTES_POR_ARMA: Record<string, Partial<AncorasImagem>> = {
  'ak4d': {
    trilho: { x: 0.36, y: 0.42 },      // fração da largura e da altura da imagem
    carregador: { x: 0.48, y: 0.66 },
  },
};
```

Os valores são frações, então continuam corretos se você trocar a resolução das
imagens depois.

---

## Sobre direitos autorais

Não use capturas de tela nem arte extraída do Battlefield 6: são material
protegido da EA/DICE e a aplicação é pública. Renders próprios, arte licenciada
ou modelos low-poly que você tenha direito de usar resolvem sem risco.

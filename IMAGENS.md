# Imagens do preview

O preview da arma é montado **em camadas**: uma imagem da arma sem acessórios e
uma imagem por peça, sobrepostas em tempo real sobre pontos de ancoragem.

Isso existe por um motivo aritmético, não por preguiça. Contando o catálogo real
de acessórios compatíveis, com o slot vazio como opção:

| | |
| --- | --- |
| Combinações só da AK4D | **336.798.000** |
| Total somando as 63 armas de fogo | **21.218.274.000 imagens** |
| Espaço a 300 KB por PNG | **6.365 TB** |
| Tempo gerando 10 por segundo | **67 anos** |

Em camadas, o total cai para **108 arquivos** e qualquer uma daquelas 21 bilhões
de combinações continua aparecendo montada.

**O preview depende inteiramente destes arquivos.** Não existe mais desenho
vetorial de reserva: sem a arte própria, o preview mostra a foto do jogo — que é
da arma já montada de fábrica e, por isso, não reage aos acessórios. É colocando
os PNGs aqui que o preview volta a responder à montagem.

Não é preciso mexer em código ao adicionar imagens: basta soltar o PNG na pasta.

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

### Munição: duas versões por cartucho

O formato do estojo muda com a arma. Fuzil, carabina, LMG e rifle de precisão
usam cartucho **garrafa** — corpo largo, ombro, pescoço fino e o projétil na
ponta. Pistola e submetralhadora (9 mm, .45) usam estojo **reto**: o projétil
assenta direto sobre um corpo de largura constante, e o conjunto é bem mais
curto.

Por isso cada munição de cartucho tem duas imagens:

```
public/acessorios/municao-fmj.png            garrafa — fuzis, carabinas, LMGs, DMRs, snipers
public/acessorios/municao-fmj--pistola.png   reto    — pistolas e submetralhadoras
```

O sufixo `--pistola` é escolhido sozinho, a partir da categoria da arma
(`attachmentImagePath` em `src/components/weapon-preview/manifest.ts`). Sem o
arquivo, a versão garrafa é usada nas duas.

As sete munições de cartucho têm as duas versões: Encamisada, Núcleo de
Tungstênio, Estojo Polimérico, Grau Competição, Frangível, Ponta Oca e Ponta
Sintética. Chumbo Grosso, Flechette e Balote são de escopeta e têm desenho
próprio.

### Proporção de cada peça

A largura da peça é uma fração da largura da imagem da arma, definida em
`src/components/weapon-preview/manifest.ts` (`PART_WIDTH`). Os valores
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
alto, o poço do carregador mais à frente — preencha `WEAPON_ANCHOR_OVERRIDES` no
`manifest.ts`:

```ts
export const WEAPON_ANCHOR_OVERRIDES: Record<string, Partial<ImageAnchors>> = {
  ak4d: {
    rail: { x: 0.36, y: 0.42 },       // fração da largura e da altura da imagem
    magazine: { x: 0.48, y: 0.66 },
  },
};
```

Os valores são frações, então continuam corretos se você trocar a resolução das
imagens depois.

---

## Sobre direitos autorais

O modo **Foto do jogo** carrega capturas do Battlefield 6 hospedadas em sites de
terceiros (IMFDB e battlefieldmeta.gg), exatamente como o protótipo
`bf6-arsenal.html` faz. Nada é copiado para cá, mas vale saber o que isso
implica:

- é material da EA/DICE hospedado por terceiros, e servir a partir da origem
  depende de esses sites permitirem;
- pode parar de funcionar sem aviso, e aí o preview cai sozinho no esquema.

Para uma versão pública sem essa dependência, o caminho é `public/armas/`: arte
própria, licenciada ou modelos low-poly com direito de uso, que têm prioridade
sobre a fonte externa.

# Arsenal BF6 — características do projeto

Montador de loadouts de Battlefield 6 em português do Brasil. O jogador escolhe a
classe e a arma, encaixa os acessórios dentro do orçamento de 100 pontos, vê as
estatísticas se recalcularem a cada peça e compartilha a build por um link.

Aplicação web mobile-first: roda em navegador de celular Android e iPhone, dentro
de WebView, e pode ser instalada na tela inicial como aplicativo (PWA).

---

## O que existe

### Arsenal

- **63 armas de fogo + 5 de corpo a corpo**, com os nomes que aparecem no jogo,
  divididas em fuzis de assalto, carabinas, submetralhadoras, metralhadoras,
  rifles de precisão semiautomáticos, rifles de precisão, escopetas, pistolas e
  corpo a corpo. Cobre o conteúdo de lançamento e das Temporadas 1 a 4.
- **317 acessórios** distribuídos em dez slots, com o nome em português e o
  original em inglês ao lado. A compatibilidade é **peça por arma**, não por
  categoria: cada cano aparece só na arma a que pertence.
- **33 gadgets** com a designação do jogo (Tarantula ALX, M320A1 HE, Powerpulse)
  e **10 arremessáveis** — três universais e sete exclusivos de classe.
- **4 classes** — Assalto, Suporte, Engenheiro e Reconhecimento — com o traço
  passivo e a categoria de arma que recebe o bônus.

### Montagem

- Os dez slots da localização brasileira: Mira, Boca, Cano, Acoplamento Inferior,
  Carregador, Munição, Ergonomia, Acessório Óptico, Acessório Esquerdo e
  Acessório Direito.
- **Orçamento em blocos de dez**, como no Gunsmith: dez blocos para a arma
  principal, seis para a pistola. Peça que não cabe continua visível,
  porém desabilitada, com o motivo escrito — esconder a opção deixaria o jogador
  sem entender por que ela sumiu.
- Compatibilidade real, vinda de duas fontes que se completam: a lista exata de
  armas por peça (bf6loadouts) e as regras por categoria da planilha — é assim
  que uma SMG deixa de aceitar supressor longo e uma pistola deixa de aceitar
  empunhadura inferior.
- Onze armas ainda não têm peças listadas na fonte (as seis mais recentes e
  cinco que o catálogo deixou em branco). Elas herdam a montagem de uma arma
  equivalente da mesma categoria, para não ficarem sem opção.
- Trocar de arma descarta sozinho o que não faz sentido na nova.

### Preview e ícones

O quadro de preview mostra a arma como ela aparece no Battlefield 6. As fontes,
em ordem:

1. **`public/weapons/<id>.png`** — arte própria, se alguém colocar uma;
2. **Foto do jogo** — carregada de fonte externa: a arte de catálogo da
   Battlefield Wiki e, como reserva, um render de terceiros;
3. **Marcador** com o nome da arma, quando não há nem uma nem outra.

Hoje 62 das 68 armas têm foto; as 6 restantes (corpo a corpo e Interdictor)
mostram o marcador.

Todas essas fontes mostram a arma **montada de fábrica**, então o quadro não muda
quando um acessório entra. Quem responde à montagem é o resto da tela: os
números, os gráficos e o **ícone de cada peça** no bloco do slot, que aparece
com uma animação curta de encaixe a cada troca.

O ícone é um desenho vetorial em `currentColor` — aceso quando há peça, apagado
quando o slot está vazio. Ele diz o que está encaixado: supressor, luneta longa,
tambor, cano pesado. Os gadgets têm um ícone próprio cada um. `IMAGENS.md`
detalha como os desenhos são escolhidos, e `/icones` os mostra todos lado a lado.

### Números

Tudo recalculado a cada acessório, sempre ao lado do valor de fábrica, com seta
verde ou vermelha conforme a mudança favoreça ou não o jogador:

- Tempo para matar, tiros para matar, tiros na cabeça, alcance efetivo e dano por
  segundo;
- Precisão, controle, mobilidade e tiro sem visada, em barras de 0 a 100, com a
  marca de onde estava o valor original;
- Dano de perto, cadência, velocidade da bala, capacidade do carregador, recarga
  tática e com a arma vazia, tempo de mira, troca de arma e recuo vertical e
  horizontal;
- A escada de dano completa, faixa por faixa, com quantos tiros são necessários
  em cada uma.

### Gráficos

Dois gráficos que redesenham a cada peça encaixada, com a curva de fábrica
tracejada por baixo para comparação:

- **Dano por distância**, em degraus, com o número de tiros necessários marcado em
  cada patamar. Munição e cano deslocam os degraus.
- **Queda da bala**, em centímetros, calculada a partir da velocidade efetiva do
  projétil. Trocar o cano ou usar munição subsônica muda a curva na hora.

Ambos respondem ao toque e ao cursor: uma linha-guia mostra o dano, os tiros, o
tempo para matar e o quanto mirar acima naquela distância exata.

### Três telas

- **Montar** — escolher a arma, encaixar acessórios e ler o resultado.
- **Todas as Armas** — o catálogo inteiro em grade, com desenho, resumo e os
  quatro números que decidem a escolha (dano, cadência, tempo para matar e
  tiros). Filtra por categoria e por classe, busca por nome e ordena por dano,
  cadência, tempo para matar ou velocidade. Clicar em uma arma abre o montador
  já com ela equipada.
- **Comparar** — até quatro armas de fábrica lado a lado, com a tabela
  destacando o melhor valor de cada linha e as curvas de dano e de queda
  sobrepostas no mesmo par de eixos.

### Compartilhamento

O loadout inteiro é codificado dentro da própria URL. Não há servidor nem banco:
o link não expira, funciona com o site hospedado em qualquer lugar e nada do que
o jogador monta sai do dispositivo dele. A janela de compartilhamento traz o link
para copiar, o compartilhamento nativo do celular e um **QR code**, para o caso
mais comum — montar no computador e conferir no celular.

O formato do link é versionado (`1~arma~acessórios~classe~…`), então mudanças
futuras no dataset não quebram links antigos. A leitura é tolerante: um acessório
que não existe mais é ignorado em vez de derrubar a página.

---

## Fórmulas

### Dano e tempo para matar

O jogo trata a queda de dano em degraus: cada degrau vale da sua distância até o
próximo. Com 100 de vida:

```
tiros = teto(100 / (dano × projéteis × multiplicador de cabeça))
tempo = (tiros − 1) × 60000 / cadência
```

O primeiro tiro sai no instante zero, então só contam os intervalos entre
disparos — por isso um rifle de precisão que mata com um tiro tem tempo zero.

### Queda da bala

Trajetória com arrasto proporcional à velocidade, que tem solução fechada e roda
barato o suficiente para redesenhar a cada acessório:

```
t = (e^(k·d) − 1) / (k · v₀)       k = 0,0006 × coeficiente de arrasto
queda = ½ · 9,81 · t²
```

O coeficiente de arrasto varia por calibre: projétil de rifle de precisão corta o
ar melhor que munição pistola subsônica.

### Aplicação dos acessórios

Ordem fixa, para que o resultado nunca dependa da ordem em que o jogador montou:

1. somam-se todos os valores aditivos;
2. multiplicam-se todos os multiplicadores;
3. o resultado é limitado ao intervalo válido da estatística.

Em recuo, tempo de mira, troca e recarga, **menor é melhor** — por isso uma
melhoria aparece como multiplicador abaixo de 1.

---

## Procedência dos números

Cada arma e cada acessório carrega um campo `provenance`:

- **`game`** — valor levantado do jogo ou de medições publicadas pela comunidade.
- **`curated`** — valor calibrado por analogia, quando não havia medição publicada.

Tudo marcado como `curated` aparece na interface com o sinal **≈** e, quando o
loadout usa alguma dessas peças, um aviso explica em texto o que isso significa.

O que sustenta cada tipo de número:

| Dado | Origem |
| --- | --- |
| Nomes das armas, categorias e temporadas | Wiki Battlefield (Fandom) e planilha do usuário |
| Dano por faixa de distância e velocidade do projétil | Planilha do usuário, com a queda descrita como rampa (dano máximo até onde ela começa, decaindo até onde termina) e convertida em quatro degraus |
| Nome, slot, custo em pontos e compatibilidade dos acessórios | Catálogo do bf6loadouts.com, que deriva dos dados do jogo |
| Restrições por categoria de arma | Planilha `attachments-compatibility.xlsx`, aplicada como filtro sobre a lista acima |
| Nomes e funções dos gadgets e arremessáveis | Planilha do usuário, com as designações do jogo |
| Efeito numérico dos acessórios | Derivado do que o nome da peça informa — comprimento do cano, capacidade do carregador, ampliação da mira, potência do laser — e da descrição de efeito da planilha. Nenhuma fonte publica os multiplicadores, então continuam marcados como aproximados |

Onde faltou fonte, o critério foi coerência interna: uma arma sem medição recebe
o perfil de outra de mesmo calibre e cadência, para que a comparação entre builds
continue válida mesmo que o número absoluto não seja exato.

---

## Decisões de projeto

**Sem backend e sem banco.** O loadout cabe na URL, então não há o que guardar. O
site é exportado como HTML estático e roda em qualquer hospedagem, inclusive
offline depois da primeira visita.

**A URL é a única memória.** Não há `localStorage`: seria uma segunda fonte de
verdade para o mesmo dado, com risco de divergir do link compartilhado.
Recarregar a página não perde o trabalho porque o endereço já descreve a build.

**Gráficos escritos à mão.** São dois gráficos pequenos que precisam responder a
cada acessório e funcionar nos dois temas. Uma biblioteca traria muito mais peso
e menos controle do que as poucas contas de escala necessárias.

**Nada de menu escondido.** No computador, escolher a arma, montar e ler o
resultado acontecem em três colunas visíveis ao mesmo tempo. No celular, cada aba
pede uma decisão de cada vez, com o preview fixo no topo — sempre visível, porque
é ele que responde à pergunta "o que esse acessório fez com a minha arma?".

**Tudo em português para quem usa, inglês para quem programa.** Nomes de
acessórios, slots e estatísticas na interface seguem a localização brasileira do
jogo, com o nome em inglês ao lado — boa parte da comunidade joga com o cliente
em inglês e busca por ele. Já no código, identificadores, arquivos e tipos são
todos em inglês. Os ids do dataset (`mira`, `ak4d`, `cano-longo`) são a exceção:
viajam dentro do link compartilhável, então renomeá-los quebraria links.

**Cada slot mostra a peça encaixada.** Os dez slots aparecem como blocos com
miniatura, e não como uma lista de texto: dá para reconhecer a montagem inteira
de relance, e as opções dentro de cada slot também vêm com miniatura, custo e
efeito.

---

## Estrutura

```
src/
├── app/
│   ├── page.tsx            montador
│   ├── armas/              catálogo completo
│   ├── comparar/           comparação entre armas
│   └── manifest.ts         PWA
├── data/
│   ├── types.ts            modelo de dados
│   ├── weapons.ts          68 armas
│   ├── attachments.ts      65 acessórios e as regras de compatibilidade
│   ├── gadgets.ts          gadgets e arremessáveis por classe
│   └── classes.ts          classes, slots e orçamento
├── lib/
│   ├── stats.ts            aplicação dos acessórios e orçamento
│   ├── ballistics.ts       dano, tempo para matar e queda da bala
│   ├── loadout.ts          o loadout e a limpeza de incompatíveis
│   └── share.ts            codificação do link
├── componentes/
│   ├── weapon-preview/     quadro da arma
│   ├── icons/              ícones de acessório e de gadget
│   ├── charts.tsx          dano e queda
│   ├── stats-panel.tsx     estatísticas com comparação
│   ├── slots-panel.tsx     montagem e orçamento
│   ├── class-panel.tsx     classe, gadgets e arremessável
│   ├── weapon-selector.tsx busca e catálogo
│   ├── attachment-thumb.tsx miniatura de cada peça
│   ├── header.tsx          cabeçalho e menu
│   └── share-button.tsx    link e QR code
└── state/loadout.ts        estado e sincronia com a URL
```

---

## Como estender

**Nova arma:** acrescente a entrada em `src/data/weapons.ts`. Os slots vêm da
categoria — não é preciso mexer em mais nada. Marque `season` e `provenance`, e
aponte a foto em `src/data/weapon-images.ts`.

**Novo acessório:** acrescente em `src/data/attachments.ts` com o slot, o custo em
pontos, os modificadores e a compatibilidade. O ícone sai do slot e do nome
original; se a peça for de uma família nova, acrescente o `case` em
`src/components/icons/attachment-icon.tsx`.

**Novo gadget:** acrescente em `src/data/gadgets.ts` e desenhe o glifo em
`src/components/icons/gadget-icon.tsx`, com o id do gadget como chave.

**Nova temporada:** as armas novas entram com o campo `temporada`, que já é usado
como filtro e aparece no cartão de cada arma.

Os testes cobrem a integridade do dataset: id repetido, degraus de dano fora de
ordem, slot sem nenhuma opção compatível e arma que não consegue ser montada
dentro dos 100 pontos quebram a suíte antes de chegar à interface.

```bash
npm test          # 47 testes de dataset, cálculo, balística e link
npm run typecheck
npm run build
```

---

## Aviso

Projeto de fã, sem vínculo com a Electronic Arts ou a DICE. Battlefield é marca
registrada da Electronic Arts. Nenhum recurso do jogo é distribuído aqui: todo o
material visual é autoral.

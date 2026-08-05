/**
 * Onde o preview procura a arte da arma.
 *
 * O projeto já teve aqui um compositor que empilhava a peça sobre a arma por
 * pontos de ancoragem. Ele saiu junto com as imagens de acessório: hoje quem
 * mostra o que está encaixado é o ícone de cada peça, no painel de slots. Do
 * manifesto sobrou só a resolução do caminho da arte da arma.
 */

/** Arte própria da arma, quando existir em `public/armas/`. */
export function weaponImagePath(id: string): string {
  return `/armas/${id}.png`;
}

/**
 * Onde o preview procura a arte da arma.
 *
 * O projeto já teve aqui um compositor que empilhava a peça sobre a arma por
 * pontos de ancoragem. Ele saiu junto com as imagens de acessório: hoje quem
 * mostra o que está encaixado é o ícone de cada peça, no painel de slots. Do
 * manifesto sobrou só a resolução do caminho da arte da arma.
 */

/**
 * Foto da arma servida pelo próprio projeto.
 *
 * WebP porque a mesma foto em PNG ocupa perto de dez vezes mais; os arquivos
 * são gerados por `scripts/baixar_imagens.py`.
 */
export function weaponImagePath(id: string): string {
  return `/armas/${id}.webp`;
}

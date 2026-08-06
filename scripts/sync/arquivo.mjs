/**
 * Escrita cirúrgica nos arquivos de dados.
 *
 * O dataset é TypeScript, não JSON, e isso é de propósito: ele carrega tipos,
 * comentários e a curadoria em português. Reescrever o arquivo inteiro a partir
 * de um objeto apagaria tudo isso — então o que se faz aqui é trocar um campo
 * dentro de um bloco, deixando o resto intacto byte a byte.
 *
 * A regra que evita o acidente clássico: **nunca fatiar por posição**. O texto é
 * partido em blocos por `id:`, cada bloco é tratado isoladamente e a contagem é
 * conferida antes de gravar. Um arquivo que perdeu ou ganhou item no caminho não
 * chega ao disco.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const INICIO_DE_ITEM = /(?=\n {2}\{\n {4}id: )/;

export class DataFile {
  constructor(caminho) {
    this.caminho = caminho;
    this.texto = readFileSync(caminho, 'utf8');
    this.itensNoInicio = this.contar();
    this.alteracoes = [];
  }

  contar(texto = this.texto) {
    return (texto.match(/^ {4}id: '/gm) ?? []).length;
  }

  /** Aplica uma função a cada bloco, preservando tudo o que estiver fora deles. */
  mapearBlocos(fn) {
    this.texto = this.texto
      .split(INICIO_DE_ITEM)
      .map((bloco) => {
        const id = bloco.match(/^\n {2}\{\n {4}id: '([^']+)'/)?.[1];
        return id ? fn(bloco, id) : bloco;
      })
      .join('');
  }

  /**
   * Troca `campo: <valor>` dentro do bloco de um item.
   *
   * `valor` já vem serializado — quem chama sabe se aquilo é número, texto ou
   * lista, e como o projeto costuma escrever cada um.
   */
  definir(id, campo, valor) {
    let trocou = false;
    this.mapearBlocos((bloco, idDoBloco) => {
      if (idDoBloco !== id) return bloco;
      const alvo = new RegExp(`^( {4}${campo}: )(.+?)(,\n)`, 'ms');
      if (!alvo.test(bloco)) return bloco;
      trocou = true;
      return bloco.replace(alvo, `$1${valor}$3`);
    });
    if (trocou) this.alteracoes.push(`${id}.${campo}`);
    return trocou;
  }

  /** Acrescenta um item ao fim da lista, antes do `];`. */
  acrescentar(bloco) {
    const fim = this.texto.lastIndexOf('\n];');
    if (fim < 0) throw new Error(`${this.caminho}: não achei o fim da lista`);
    this.texto = this.texto.slice(0, fim) + '\n' + bloco.trimEnd() + this.texto.slice(fim);
    this.alteracoes.push(`+ ${bloco.match(/id: '([^']+)'/)?.[1]}`);
  }

  /**
   * Grava, se algo mudou.
   *
   * A conferência de contagem é o que separa uma troca de campo de um estrago:
   * qualquer item que suma no caminho aborta a escrita.
   */
  salvar({ itensEsperados = null } = {}) {
    if (this.alteracoes.length === 0) return false;

    const agora = this.contar();
    const esperado = itensEsperados ?? this.itensNoInicio;
    if (agora !== esperado) {
      throw new Error(
        `${this.caminho}: a contagem mudou de ${esperado} para ${agora} — nada foi gravado`,
      );
    }

    writeFileSync(this.caminho, this.texto, 'utf8');
    return true;
  }
}

/** Número como o dataset escreve: sem `.0` pendurado. */
export function numero(valor, casas = 2) {
  return String(Number(Number(valor).toFixed(casas)));
}

/** Lista de ids em uma linha, como o campo `compat` já é escrito. */
export function listaDeIds(ids) {
  return `[${ids.map((id) => `'${id}'`).join(', ')}]`;
}

/** Escada de dano, no recuo de quatro espaços do dataset. */
export function escada(degraus) {
  const linhas = degraus.map(([dano, distancia]) => `      [${numero(dano)}, ${numero(distancia)}],`);
  return `[\n${linhas.join('\n')}\n    ]`;
}

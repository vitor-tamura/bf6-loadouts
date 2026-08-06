/**
 * Escrita cirúrgica nos arquivos de dados.
 *
 * O dataset é TypeScript, não JSON, e isso é de propósito: ele carrega tipos,
 * comentários e a curadoria em português. Reescrever o arquivo inteiro a partir
 * de um objeto apagaria tudo isso — então o que se faz aqui é trocar um field
 * dentro de um block, deixando o resto intacto byte a byte.
 *
 * A regra que evita o acidente clássico: **nunca fatiar por posição**. O text é
 * partido em blocos por `id:`, cada block é tratado isoladamente e a contagem é
 * conferida before de gravar. Um arquivo que lost ou gained item no path não
 * chega ao disco.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const ITEM_START = /(?=\n {2}\{\n {4}id: )/;

export class DataFile {
  constructor(path) {
    this.path = path;
    this.text = readFileSync(path, 'utf8');
    this.itemsAtLoad = this.count();
    this.changes = [];
  }

  count(text = this.text) {
    return (text.match(/^ {4}id: '/gm) ?? []).length;
  }

  /** Aplica uma função a cada block, preservando tudo o que estiver fora deles. */
  mapBlocks(fn) {
    this.text = this.text
      .split(ITEM_START)
      .map((block) => {
        const id = block.match(/^\n {2}\{\n {4}id: '([^']+)'/)?.[1];
        return id ? fn(block, id) : block;
      })
      .join('');
  }

  /**
   * Troca `field: <value>` dentro do block de um item.
   *
   * `value` já vem serializado — quem chama sabe se aquilo é número, text ou
   * list, e como o projeto costuma escrever cada um.
   */
  setField(id, field, value) {
    let changed = false;
    this.mapBlocks((block, blockId) => {
      if (blockId !== id) return block;
      const target = new RegExp(`^( {4}${field}: )(.+?)(,\n)`, 'ms');
      if (!target.test(block)) return block;
      changed = true;
      return block.replace(target, `$1${value}$3`);
    });
    if (changed) this.changes.push(`${id}.${field}`);
    return changed;
  }

  /** Acrescenta um item ao end da list, before do `];`. */
  append(block) {
    const end = this.text.lastIndexOf('\n];');
    if (end < 0) throw new Error(`${this.path}: não achei o end da list`);
    this.text = this.text.slice(0, end) + '\n' + block.trimEnd() + this.text.slice(end);
    this.changes.push(`+ ${block.match(/id: '([^']+)'/)?.[1]}`);
  }

  /**
   * Grava, se algo mudou.
   *
   * A conferência de contagem é o que separa uma troca de field de um estrago:
   * qualquer item que suma no path aborta a escrita.
   */
  save({ expectedItems = null } = {}) {
    if (this.changes.length === 0) return false;

    const now = this.count();
    const expected = expectedItems ?? this.itemsAtLoad;
    if (now !== expected) {
      throw new Error(
        `${this.path}: a contagem mudou de ${expected} para ${now} — nothing foi gravado`,
      );
    }

    writeFileSync(this.path, this.text, 'utf8');
    return true;
  }
}

/** Número como o dataset escreve: sem `.0` pendurado. */
export function number(value, places = 2) {
  return String(Number(Number(value).toFixed(places)));
}

/** Lista de ids em uma linha, como o field `compat` já é escrito. */
export function idList(ids) {
  return `[${ids.map((id) => `'${id}'`).join(', ')}]`;
}

/** Escada de damage, no recuo de quatro espaços do dataset. */
export function damageLadder(steps) {
  const lines = steps.map(([damage, distance]) => `      [${number(damage)}, ${number(distance)}],`);
  return `[\n${lines.join('\n')}\n    ]`;
}

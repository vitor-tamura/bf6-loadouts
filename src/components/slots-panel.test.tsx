/**
 * O que a peça cobra tem de aparecer junto do que ela dá.
 *
 * As descrições do dataset foram escritas para apresentar a peça, e boa parte
 * delas só conta a vantagem: "duas portas: mais controle ainda" não avisa que o
 * tiro sem visada cai seis pontos. Como a contrapartida é derivada dos
 * modificadores, e não escrita à mão em 216 frases, ela não pode divergir do
 * número — e é isso que estes testes fixam.
 */

import { describe, expect, it } from 'vitest';
import { downsides } from './slots-panel';
import { ATTACHMENTS } from '@/data/attachments';

const attachment = (id: string) => {
  const found = ATTACHMENTS.find((item) => item.id === id);
  if (!found) throw new Error(`peça ${id} não existe no dataset`);
  return found;
};

describe('o que a peça cobra', () => {
  it('sai dos modificadores, e não do texto', () => {
    // O freio de porta dupla: -16% recuo vertical, +8 controle, -6 tiro sem visada.
    expect(downsides(attachment('muzzle-double-port-brake'))).toEqual(['tiro sem visada']);
  });

  it('fica vazio quando a peça só melhora', () => {
    // A angular de fábrica acelera a mira, firma o recuo lateral e não cobra nada.
    expect(downsides(attachment('underbarrel-factory-angled'))).toEqual([]);

    const semCusto = ATTACHMENTS.filter((item) => downsides(item).length === 0);
    expect(semCusto.length).toBeGreaterThan(0);
  });

  it('não repete o custo que a descrição já contou', () => {
    /*
     * "Silêncio com o recuo mais firme dos supressores; o preço é o tiro sem
     * visada" já nomeia a perda. Emendar "piora tiro sem visada" atrás disso
     * escreve a mesma coisa duas vezes na mesma linha.
     */
    const supressor = ATTACHMENTS.find((item) => /o preço é o tiro sem visada/i.test(item.description));

    expect(supressor).toBeTruthy();
    expect(downsides(supressor!)).not.toContain('tiro sem visada');
  });

  it('conta uma vez a estatística que piora em soma e em proporção', () => {
    for (const item of ATTACHMENTS) {
      const lista = downsides(item);
      expect(new Set(lista).size).toBe(lista.length);
    }
  });
});

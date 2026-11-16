import { describe, expect, it } from 'vitest';

import { ATTACHMENTS } from '../../src/data/attachments.ts';
import { WEAPONS, WEAPONS_BY_ID } from '../../src/data/weapons.ts';
import { chave, conferirArma, decidir, type Jogo } from './conferir-battlefieldmeta.ts';

const b36a4 = WEAPONS_BY_ID.get('b36a4')!;

describe('conferência com o BattlefieldMeta', () => {
  it('lê os nomes dele com as chaves daqui', () => {
    expect(chave('HYBRID SUPPRESSOR [K]')).toBe(chave('Hybrid Suppressor (K)'));
    expect(chave('30 RND')).toBe(chave('30RND Magazine'));
    expect(chave('45 FAST')).toBe(chave('45RND Fast Mag'));
    expect(chave('100 RND')).toBe(chave('100RND Belt Box'));
    expect(chave('MOUNT')).toBe(chave('Underslung Mount'));
    expect(chave('CANTED IRON SIGHTS')).toBe(chave('Canted Iron Sight'));
    expect(chave('ST PRISIM 5.00X')).toBe(chave('ST Prism 5.00x'));
  });

  it('acha a divergência de custo e a peça que falta, e ignora o que bate e o marcador de papel', () => {
    const divergencias = conferirArma(b36a4, [
      { slotId: 'underbarrel', name: 'SLIM HANDSTOP', point: 15 },
      { slotId: 'ammunition', name: 'FRANGIBLE', point: 20 },
      { slotId: 'scope', name: 'PEÇA QUE NÃO EXISTE', point: 10 },
      { slotId: 'barrel', name: 'EXTENDED', point: 5 },
    ]);
    expect(divergencias.map((d) => [d.tipo, d.peca])).toEqual([
      ['custo', 'FRANGIBLE'],
      ['faltaNoSite', 'PEÇA QUE NÃO EXISTE'],
    ]);
  });

  it('resolve sem gente: o jogo decide, a trava da curadoria vale, e o BattlefieldMeta só onde o jogo cala', () => {
    const jogo: Jogo = new Map([['b36a4', new Map([['nome:frangible', 15]])], ['ef88', new Map()]]);
    const frangivel = conferirArma(b36a4, [{ slotId: 'ammunition', name: 'FRANGIBLE', point: 20 }])[0];
    expect(decidir(frangivel, jogo, WEAPONS, ATTACHMENTS)).toMatchObject({ decisao: 'jogo', jogo: 15 });

    const gatilho = { arma: 'ef88', slot: 'ergonomics', peca: 'MATCH TRIGGER', tipo: 'faltaNoSite' as const, battlefieldmeta: 15 };
    expect(decidir(gatilho, jogo, WEAPONS, ATTACHMENTS).decisao).toBe('curadoria');

    // O jogo enumera a B36A4 e não tem a peça: a falta já está decidida.
    const inexistente = { arma: 'b36a4', slot: 'scope', peca: 'PEÇA QUE NÃO EXISTE', tipo: 'faltaNoSite' as const, battlefieldmeta: 10 };
    expect(decidir(inexistente, jogo, WEAPONS, ATTACHMENTS).decisao).toBe('jogo');

    // O site tem a peça e o jogo não lhe dá preço: vale o do BattlefieldMeta.
    const semPreco = { ...frangivel, peca: 'FLASHLIGHT', idNoSite: 'leftRail-flashlight' };
    expect(decidir(semPreco, jogo, WEAPONS, ATTACHMENTS).decisao).toBe('battlefieldmeta');
  });
});

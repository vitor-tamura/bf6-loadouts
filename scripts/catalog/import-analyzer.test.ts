import { describe, expect, it } from 'vitest';
import { declaredRelease } from './import-analyzer.ts';

/**
 * A versão que o dataset da comunidade declara descrever.
 *
 * A trava que impede dataset atrasado de sobrescrever dado curado depende
 * inteiramente desta leitura — e ela falhou uma vez, em silêncio, porque o
 * upstream mudou o nome do campo.
 */
describe('versão declarada pelo instantâneo', () => {
  it('lê o campo do esquema antigo', () => {
    expect(declaredRelease({ release: '1.3.3.0' } as never, {})).toMatchObject({ version: '1.3.3.0' });
  });

  it('segue o ponteiro quando o esquema novo põe um rótulo no lugar da versão', () => {
    /*
     * Em `fb7a214` o Analyzer trocou `release: "1.3.3.0"` por
     * `baseline: "current-live"` e empurrou a versão para o arquivo de
     * proveniência. `current-live` é o que o dataset gostaria de ser; o que vale
     * é a versão que ele declara ter lido.
     */
    const ballistics = {
      baseline: 'current-live',
      source: 'data/provenance/live-baseline.json#sym-bf6-json',
    };
    const files = {
      'data/provenance/live-baseline.json': {
        sources: [
          { id: 'ea-update-notes', sourceVersion: '1.3.3.0' },
          { id: 'sym-bf6-json', sourceVersion: '1.3.3.0' },
        ],
      },
    };

    expect(declaredRelease(ballistics as never, files)).toMatchObject({ version: '1.3.3.0' });
  });

  it('fica com a mais nova entre as fontes da proveniência', () => {
    // A trava pergunta se o dataset alcançou o patch; quem responde é a leitura
    // mais recente que ele declara ter feito.
    const files = {
      'p.json': {
        sources: [{ sourceVersion: '1.3.3.0' }, { sourceVersion: '1.4.2.0' }, { sourceVersion: '1.4.1.5' }],
      },
    };

    expect(declaredRelease({ baseline: 'x', source: 'p.json' } as never, files)).toMatchObject({
      version: '1.4.2.0',
    });
  });

  it('aceita baseline que já venha como versão', () => {
    expect(declaredRelease({ baseline: '1.4.2.0' } as never, {})).toMatchObject({ version: '1.4.2.0' });
  });

  it('devolve nulo quando o instantâneo não declara versão em lugar nenhum', () => {
    /*
     * Este é o caso que quebrou o pipeline: a versão sumiu, `release &&` deu
     * falso, e a trava liberou a importação que ela existia para barrar. Nulo é
     * a resposta honesta, e quem chama trata nulo como "não importa".
     */
    expect(declaredRelease({} as never, {}).version).toBeNull();
    expect(declaredRelease({ baseline: 'current-live' } as never, {}).version).toBeNull();
  });

  it('devolve nulo quando o ponteiro não leva a lugar nenhum', () => {
    const ballistics = { baseline: 'current-live', source: 'data/provenance/sumiu.json#x' };

    expect(declaredRelease(ballistics as never, {}).version).toBeNull();
    expect(declaredRelease(ballistics as never, { 'data/provenance/sumiu.json': {} }).version).toBeNull();
    expect(
      declaredRelease(ballistics as never, {
        'data/provenance/sumiu.json': { sources: [{ id: 'x', sourceVersion: 'current-live' }] },
      }).version,
    ).toBeNull();
  });

  it('diz onde procurou, para o log explicar a decisão', () => {
    // Quem for depurar um "nada importado" precisa saber que caminho foi lido.
    expect(declaredRelease({ release: '1.3.3.0' } as never, {}).how).toContain('release');
    expect(declaredRelease({} as never, {}).how).toContain('não declara versão');
  });
});

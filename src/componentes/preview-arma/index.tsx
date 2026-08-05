'use client';

import { useEffect, useState } from 'react';
import { ArmaSvg } from '@/componentes/arma-svg';
import type { Acessorio, Arma } from '@/dados/tipos';
import {
  ancorasDaArma,
  caminhoImagemAcessorio,
  caminhoImagemArma,
  larguraDaPeca,
  MONTAGEM_DO_SLOT,
  REGISTRO_DA_PECA,
} from './manifesto';

/**
 * Preview da arma montada.
 *
 * Prefere as imagens em `public/armas` e `public/acessorios`, compostas em
 * camadas sobre pontos de ancoragem. Se a imagem da arma ainda não existir, cai
 * no desenho vetorial — assim o montador funciona desde já e vai ganhando as
 * imagens conforme elas forem entrando, sem mudar uma linha de código.
 */

interface Props {
  arma: Arma;
  acessorios: Acessorio[];
  comRotulo?: boolean;
  className?: string;
}

/** Proporção do quadro do preview, igual à esperada das imagens. */
const PROPORCAO = '8 / 3';

export function PreviewArma({ arma, acessorios, comRotulo = false, className }: Props) {
  const [semImagem, setSemImagem] = useState(false);
  const [pecasQuebradas, setPecasQuebradas] = useState<Set<string>>(new Set());

  // Ao trocar de arma, volta a tentar a imagem: a próxima pode existir.
  useEffect(() => {
    setSemImagem(false);
    setPecasQuebradas(new Set());
  }, [arma.id]);

  if (semImagem) {
    return <ArmaSvg arma={arma} acessorios={acessorios} comRotulo={comRotulo} className={className} />;
  }

  const ancoras = ancorasDaArma(arma);

  return (
    <div className={className} style={{ position: 'relative', aspectRatio: PROPORCAO }}>
      <img
        src={caminhoImagemArma(arma.id)}
        alt={`${arma.nome} sem acessórios`}
        onError={() => setSemImagem(true)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      />

      {acessorios.map((acessorio) => {
        if (!acessorio.peca) return null;
        if (pecasQuebradas.has(acessorio.id)) return null;

        const montagem = MONTAGEM_DO_SLOT[acessorio.slot];
        if (!montagem) return null;

        const ancora = ancoras[montagem];
        const registro = REGISTRO_DA_PECA[montagem];
        const largura = larguraDaPeca(acessorio.peca);

        return (
          // O deslocamento de ancoragem fica no wrapper; a animação de encaixe
          // fica na imagem, senão uma sobrescreveria o `transform` da outra.
          <span
            key={acessorio.id}
            style={{
              position: 'absolute',
              left: `${ancora.x * 100}%`,
              top: `${ancora.y * 100}%`,
              width: `${largura * 100}%`,
              transform: `translate(${-registro.x * 100}%, ${-registro.y * 100}%)`,
              lineHeight: 0,
            }}
          >
            <img
              src={caminhoImagemAcessorio(acessorio.id)}
              alt={acessorio.nome}
              className="peca-encaixe"
              onError={() =>
                setPecasQuebradas((atual) => {
                  const novo = new Set(atual);
                  novo.add(acessorio.id);
                  return novo;
                })
              }
              style={{ width: '100%', display: 'block' }}
            />
          </span>
        );
      })}

      {comRotulo && (
        <span
          className="rotulo"
          style={{ position: 'absolute', right: 8, bottom: 6, color: 'var(--destaque)', opacity: 0.6 }}
        >
          {arma.nome}
        </span>
      )}
    </div>
  );
}

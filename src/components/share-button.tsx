'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import qrcode from 'qrcode-generator';
import { loadoutUrl } from '@/lib/share';
import type { Loadout } from '@/lib/loadout';

/**
 * Compartilhamento do loadout.
 *
 * O loadout inteiro vive na URL, então compartilhar é entregar o endereço. O QR
 * code existe porque o caso mais comum é montar no computador e querer conferir
 * a build no celular antes de entrar na partida.
 */

function QrCode({ text, size = 168 }: { text: string; size?: number }) {
  const qrPath = useMemo(() => {
    // Nível de correção baixo: o código já é longo e o QR aparece na tela, sem
    // risco de sujeira ou dobra como em papel.
    const qr = qrcode(0, 'L');
    qr.addData(text);
    qr.make();

    const moduleCount = qr.getModuleCount();
    const segments: string[] = [];
    for (let row = 0; row < moduleCount; row++) {
      for (let column = 0; column < moduleCount; column++) {
        if (qr.isDark(row, column)) segments.push(`M${column},${row}h1v1h-1z`);
      }
    }
    return { d: segments.join(''), moduleCount };
  }, [text]);

  return (
    <svg
      viewBox={`-1 -1 ${qrPath.moduleCount + 2} ${qrPath.moduleCount + 2}`}
      width={size}
      height={size}
      role="img"
      aria-label="QR code do loadout"
      style={{ background: '#fff' }}
      className="bevel-sm"
    >
      <path d={qrPath.d} fill="#000" />
    </svg>
  );
}

export function ShareButton({ loadout, disabled }: { loadout: Loadout; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState('');

  // A URL só existe no navegador; montar no servidor daria uma origem errada.
  useEffect(() => {
    if (open) setUrl(loadoutUrl(loadout));
  }, [open, loadout]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Sem permissão de área de transferência: o campo fica selecionado para
      // o jogador copiar à mão.
      const field = document.getElementById('campo-link') as HTMLInputElement | null;
      field?.select();
    }
  }

  async function shareNative() {
    if (!navigator.share) return copyLink();
    try {
      await navigator.share({ title: 'Meu loadout de Battlefield 6', url });
    } catch {
      // Compartilhamento cancelado pelo jogador — nada a fazer.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="bevel-sm touch px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-40"
        style={{ background: 'var(--accent)', color: '#14170f' }}
      >
        Compartilhar
      </button>

      {/* O botão vive dentro do cabeçalho, que usa `backdrop-blur`. Um ancestral
          com filtro vira o bloco de contenção de `position: fixed`, e a janela
          ficaria presa à faixa do cabeçalho — por isso ela é montada no body. */}
      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ background: 'rgb(0 0 0 / 0.6)' }}
          onClick={() => setOpen(false)}
          role="presentation"
        >
          {/* A janela rola por dentro: com o QR code e os botões ela pode ficar
              mais alta que a tela de um celular pequeno. */}
          <div
            className="card bevel pb-safe max-h-[92dvh] w-full max-w-md overflow-y-auto p-4 sm:pb-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Compartilhar loadout"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Compartilhar loadout</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="touch px-2 text-lg"
                aria-label="Fechar"
                style={{ color: 'var(--text-dim)' }}
              >
                ✕
              </button>
            </div>

            <p className="mb-3 text-sm" style={{ color: 'var(--text-soft)' }}>
              O loadout inteiro está dentro do link — não há servidor guardando nada, e ele não expira.
            </p>

            <div className="mb-3 flex justify-center">{url && <QrCode text={url} />}</div>

            <input
              id="campo-link"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="bevel-sm mb-2 w-full px-3 py-2 font-mono text-xs"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
              aria-label="Link do loadout"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyLink}
                className="bevel-sm touch flex-1 px-3 py-2 text-sm font-semibold"
                style={{ background: 'var(--accent)', color: '#14170f' }}
              >
                {copied ? 'Link copiado' : 'Copiar link'}
              </button>
              <button
                type="button"
                onClick={shareNative}
                className="bevel-sm touch px-3 py-2 text-sm"
                style={{ border: '1px solid var(--border)' }}
              >
                Enviar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

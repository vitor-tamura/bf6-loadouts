'use client';

import { App, Button, Input, Modal, Typography } from 'antd';
import { useMemo, useState } from 'react';
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
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);

  /*
   * A URL sai do próprio render, e não de um efeito guardando estado.
   *
   * `loadoutUrl` lê `window.location`, que não existe no servidor — por isso a
   * conta só pode acontecer com a janela aberta, e a janela só abre no
   * navegador. Calcular aqui ainda corrige um caso que o efeito errava: trocar
   * um acessório com a janela aberta atualizava o link um quadro depois do QR
   * code, e por um instante os dois apontavam para loadouts diferentes.
   */
  const url = open ? loadoutUrl(loadout) : '';

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      message.success('Link copiado');
    } catch {
      // Sem permissão de área de transferência: o campo fica selecionado para
      // o jogador copiar à mão.
      const field = document.getElementById('campo-link') as HTMLInputElement | null;
      field?.select();
      message.info('Copie o link selecionado');
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
      <Button
        type="primary"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="bevel-sm touch font-semibold"
        style={{ color: '#14170f' }}
      >
        Compartilhar
      </Button>

      {/*
        O `Modal` do antd resolve sozinho o que aqui era feito à mão: o portal no
        `body`, o fundo escurecido, o fechar no ESC e a devolução do foco. O
        portal, em especial, não era preferência — o botão vive no cabeçalho, que
        usa `backdrop-blur`, e um ancestral com filtro vira bloco de contenção do
        `position: fixed`, prendendo a janela à faixa do cabeçalho.
      */}
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        title={<span className="font-display text-lg font-semibold">Compartilhar loadout</span>}
        className="bevel"
        width={448}
        styles={{ body: { maxHeight: '80dvh', overflowY: 'auto' } }}
      >
        <Typography.Paragraph className="mb-3 text-sm" style={{ color: 'var(--text-soft)' }}>
          O loadout inteiro está dentro do link — não há servidor guardando nada, e ele não expira.
        </Typography.Paragraph>

        <div className="mb-3 flex justify-center">{url && <QrCode text={url} />}</div>

        <Input
          id="campo-link"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="bevel-sm mb-2 font-mono text-xs"
          aria-label="Link do loadout"
        />

        <div className="flex gap-2">
          <Button
            type="primary"
            onClick={copyLink}
            className="bevel-sm touch flex-1 font-semibold"
            style={{ color: '#14170f' }}
          >
            Copiar link
          </Button>
          <Button onClick={shareNative} className="bevel-sm touch">
            Enviar
          </Button>
        </div>
      </Modal>
    </>
  );
}

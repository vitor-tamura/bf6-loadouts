'use client';

import { App, Button, Input, Modal, Typography } from 'antd';
import { useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import {
  IMAGE_FORMATS,
  loadoutImageFilename,
  loadoutImageUrl,
  loadoutUrl,
  type ImageFormat,
} from '@/lib/share';
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

  /*
   * O cartão sai da mesma string que o link, então nunca mostra um loadout
   * diferente do que o endereço abre. O endereço é absoluto porque ele existe
   * para ser colado fora daqui — caminho relativo só funciona dentro do site.
   */
  const imagemUrl = open ? loadoutImageUrl(loadout) : '';

  async function copiarImagem() {
    try {
      await navigator.clipboard.writeText(imagemUrl);
      message.success('Link da imagem copiado');
    } catch {
      const field = document.getElementById('campo-imagem') as HTMLInputElement | null;
      field?.select();
      message.info('Copie o link selecionado');
    }
  }

  /*
   * As imagens do Instagram, já baixadas para o aparelho.
   *
   * O Instagram não recebe link de imagem: no celular, ele só aparece como
   * destino quando o que se compartilha é o próprio arquivo. E o Safari só
   * deixa abrir a folha de compartilhamento enquanto o toque ainda está
   * "fresco" — se o clique primeiro esperar a imagem ser desenhada no
   * servidor, a permissão expira e o `navigator.share` é recusado.
   *
   * Por isso a busca começa quando a janela abre, antes do toque no botão, e o
   * arquivo fica guardado pelo endereço: o clique quase sempre encontra a
   * promessa já resolvida. Guardar pelo endereço (e não pelo formato) também
   * resolve o loadout que muda com a janela aberta — endereço novo, busca nova.
   * É `useRef` porque o conteúdo não aparece na tela: trocar o arquivo pronto
   * não precisa de novo render.
   */
  const arquivos = useRef(new Map<string, Promise<File>>());
  const [preparando, setPreparando] = useState<ImageFormat | null>(null);

  function arquivoDaImagem(formato: ImageFormat): Promise<File> {
    const endereco = loadoutImageUrl(loadout, undefined, formato);
    const guardado = arquivos.current.get(endereco);
    if (guardado) return guardado;

    const busca = fetch(endereco)
      .then((resposta) => {
        if (!resposta.ok) throw new Error(`imagem respondeu ${resposta.status}`);
        return resposta.blob();
      })
      .then((blob) => new File([blob], loadoutImageFilename(loadout), { type: 'image/png' }));
    // Falha não fica guardada: o próximo toque tenta de novo.
    busca.catch(() => arquivos.current.delete(endereco));
    arquivos.current.set(endereco, busca);
    return busca;
  }

  function abrir() {
    setOpen(true);
    for (const formato of Object.keys(IMAGE_FORMATS) as ImageFormat[]) {
      arquivoDaImagem(formato).catch(() => {
        // Erro aqui só adia: o botão busca de novo e avisa se falhar.
      });
    }
  }

  function baixar(arquivo: File) {
    const endereco = URL.createObjectURL(arquivo);
    const link = document.createElement('a');
    link.href = endereco;
    link.download = arquivo.name;
    link.click();
    // O navegador precisa do endereço até o download começar; depois, é lixo.
    setTimeout(() => URL.revokeObjectURL(endereco), 30_000);
  }

  /**
   * Entrega a imagem no formato pedido: pela folha de compartilhamento quando
   * o aparelho aceita arquivo (é por ela que o Instagram recebe a imagem no
   * celular), e como download no resto — no computador, o caminho é baixar e
   * subir pelo site do Instagram.
   */
  async function imagemParaInstagram(formato: ImageFormat) {
    setPreparando(formato);
    let arquivo: File;
    try {
      arquivo = await arquivoDaImagem(formato);
    } catch {
      setPreparando(null);
      message.error('Não deu para gerar a imagem agora. Tente de novo em instantes.');
      return;
    }
    setPreparando(null);

    /*
     * Só arquivo, sem título nem texto: com texto junto, parte dos destinos
     * (o próprio Instagram entre eles) descarta a imagem e fica só com a
     * legenda. O endereço do site já está desenhado no cartão.
     */
    const dados: ShareData = { files: [arquivo] };
    if (navigator.canShare?.(dados)) {
      try {
        await navigator.share(dados);
        return;
      } catch (erro) {
        // Cancelado pelo jogador: nada a fazer. Recusado pelo navegador (o
        // toque "esfriou" ou o destino falhou): o arquivo ainda chega por download.
        if (erro instanceof DOMException && erro.name === 'AbortError') return;
      }
    }
    baixar(arquivo);
    message.success(`Imagem para o ${IMAGE_FORMATS[formato].rotulo} baixada`);
  }

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
        onClick={abrir}
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

        {/*
          O cartão em imagem existe para a conversa em que o link não é clicado:
          a lista de peças aparece de relance, sem ninguém precisar abrir o site.

          O endereço vem antes do download. A imagem sempre foi uma rota GET com
          o mesmo código do link — baixar o arquivo para depois anexá-lo era o
          caminho longo para o que um endereço colado já resolve, e em celular
          custava uma ida à galeria. Quem quiser o arquivo tem os botões do
          Instagram logo abaixo.
        */}
        <Typography.Paragraph
          className="mt-4 mb-1 text-[11px]"
          style={{ color: 'var(--text-dim)' }}
        >
          Imagem do loadout — cola direto na conversa, sem baixar nada.
        </Typography.Paragraph>

        <Input
          id="campo-imagem"
          readOnly
          value={imagemUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="bevel-sm mb-2 font-mono text-xs"
          aria-label="Link da imagem do loadout"
        />

        <div className="flex gap-2">
          <Button onClick={copiarImagem} className="bevel-sm touch flex-1" disabled={!imagemUrl}>
            Copiar link da imagem
          </Button>
          <Button
            href={imagemUrl || undefined}
            target="_blank"
            rel="noreferrer noopener"
            className="bevel-sm touch"
            disabled={!imagemUrl}
          >
            Abrir
          </Button>
        </div>

        {/*
          A imagem do Instagram, em 1080x1920. O "Baixar" que ficava ao lado
          do link virou este botão.

          No celular, ele abre a folha de compartilhamento com o arquivo, de
          onde o Instagram recebe a imagem direto. No computador, onde essa
          folha não aceita arquivo, o botão baixa.
        */}
        <Typography.Paragraph
          className="mt-4 mb-1 text-[11px]"
          style={{ color: 'var(--text-dim)' }}
        >
          Para o Instagram — a imagem já vem no tamanho certo e com a marca do site.
        </Typography.Paragraph>

        <div className="flex gap-2">
          {(Object.keys(IMAGE_FORMATS) as ImageFormat[]).map((formato) => (
            <Button
              key={formato}
              onClick={() => imagemParaInstagram(formato)}
              loading={preparando === formato}
              disabled={!imagemUrl}
              className="bevel-sm touch flex-1"
            >
              {IMAGE_FORMATS[formato].rotulo} ({IMAGE_FORMATS[formato].proporcao})
            </Button>
          ))}
        </div>
      </Modal>
    </>
  );
}

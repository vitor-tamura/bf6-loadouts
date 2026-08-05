import { AttachmentIcon } from '@/components/icons/attachment-icon';
import type { Attachment, SlotId } from '@/data/types';

/**
 * Miniatura da peça encaixada no slot.
 *
 * O desenho é um ícone vetorial ([AttachmentIcon]), não uma foto: o bloco só
 * precisa dizer que tipo de peça está ali — supressor, luneta, tambor — e o
 * ícone faz isso em qualquer tamanho e nos dois temas, sem depender de arte
 * externa. O quadro fica aceso quando há peça e apagado quando o slot está
 * vazio.
 */

export function AttachmentThumb({
  attachment,
  slot,
  size = 56,
}: {
  /** Sem acessório, mostra o ícone genérico do slot, apagado. */
  attachment: Attachment | null;
  slot: SlotId;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="chanfro-sm flex items-center justify-center"
      style={{
        width: size,
        height: size,
        border: `1px solid ${attachment ? 'var(--destaque)' : 'var(--borda)'}`,
        color: attachment ? 'var(--destaque)' : 'var(--texto-fraco)',
        background: attachment ? 'color-mix(in srgb, var(--destaque) 8%, transparent)' : 'transparent',
        opacity: attachment ? 1 : 0.45,
      }}
    >
      {/* A `key` no id faz a animação de encaixe rodar de novo a cada troca. */}
      <span key={attachment?.id ?? 'vazio'} className={attachment ? 'peca-encaixe' : undefined} style={{ lineHeight: 0 }}>
        <AttachmentIcon attachment={attachment} slot={slot} size={size * 0.7} />
      </span>
    </span>
  );
}

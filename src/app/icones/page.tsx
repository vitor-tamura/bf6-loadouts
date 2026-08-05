import { AttachmentIcon } from '@/components/icons/attachment-icon';
import { GadgetIcon } from '@/components/icons/gadget-icon';
import { ATTACHMENTS } from '@/data/attachments';
import { GADGETS } from '@/data/gadgets';
import type { Attachment } from '@/data/types';

/**
 * Folha de contato dos ícones — página de conferência, fora do menu.
 *
 * Existe para olhar todos os desenhos lado a lado: é onde se percebe que duas
 * famílias ficaram parecidas demais ou que um traço some no tamanho real.
 */

/** Um representante por desenho, para a folha não repetir o mesmo glifo 152 vezes. */
function samples(): Attachment[] {
  const seen = new Set<string>();
  return ATTACHMENTS.filter((a) => {
    const key = `${a.slot}:${a.originalName.toLowerCase().replace(/[\d."]/g, '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function IconSheet() {
  return (
    <main className="p-4" style={{ color: 'var(--texto)' }}>
      <h1 className="rotulo mb-3">Acessórios</h1>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
        {samples().map((a) => (
          <li key={a.id} className="chanfro-sm flex flex-col items-center gap-1 p-2" style={{ border: '1px solid var(--borda)' }}>
            <span style={{ color: 'var(--destaque)' }}>
              <AttachmentIcon attachment={a} slot={a.slot} size={40} />
            </span>
            <span className="text-center text-[10px] leading-tight">{a.name}</span>
          </li>
        ))}
      </ul>

      <h1 className="rotulo mb-3 mt-6">Gadgets</h1>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
        {GADGETS.map((g) => (
          <li key={g.id} className="chanfro-sm flex flex-col items-center gap-1 p-2" style={{ border: '1px solid var(--borda)' }}>
            <span style={{ color: 'var(--destaque)' }}>
              <GadgetIcon gadget={g} size={40} />
            </span>
            <span className="text-center text-[10px] leading-tight">{g.name}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

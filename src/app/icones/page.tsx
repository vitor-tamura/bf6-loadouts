'use client';

import { Card, Col, Row, Typography } from 'antd';
import { AttachmentIcon } from '@/components/icons/attachment-icon';
import { GadgetArt } from '@/components/gadget-art';
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

/** Seis por linha no computador, dois no celular — o desenho é o que importa. */
const COLS = { xs: 12, sm: 8, md: 6, lg: 4, xl: 3 };

export default function IconSheet() {
  return (
    <main className="p-4" style={{ color: 'var(--text)' }}>
      <Typography.Title level={2} className="label !mb-3">
        Acessórios
      </Typography.Title>
      <Row gutter={[8, 8]}>
        {samples().map((a) => (
          <Col key={a.id} {...COLS}>
            <Celula nome={a.name}>
              <AttachmentIcon attachment={a} slot={a.slot} size={40} />
            </Celula>
          </Col>
        ))}
      </Row>

      <Typography.Title level={2} className="label mt-6 !mb-3">
        Gadgets
      </Typography.Title>
      <Row gutter={[8, 8]}>
        {GADGETS.map((g) => (
          <Col key={g.id} {...COLS}>
            <Celula nome={g.name}>
              <GadgetArt gadget={g} size={40} />
            </Celula>
          </Col>
        ))}
      </Row>
    </main>
  );
}

function Celula({ nome, children }: { nome: string; children: React.ReactNode }) {
  return (
    <Card
      variant="outlined"
      className="bevel-sm h-full"
      styles={{ body: { padding: 8 } }}
      style={{ border: '1px solid var(--border)' }}
    >
      <span className="flex flex-col items-center gap-1">
        <span style={{ color: 'var(--accent)' }}>{children}</span>
        <span className="text-center text-[10px] leading-tight">{nome}</span>
      </span>
    </Card>
  );
}

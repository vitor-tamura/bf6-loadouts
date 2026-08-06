'use client';

import { useEffect } from 'react';

/**
 * Redireciona `/armas/` para a raiz.
 *
 * O catálogo morou aqui até virar a tela principal. A rota antiga circula em
 * links e favoritos, e o site é estático — não há servidor para responder um
 * 301 —, então quem chegar por ela é reencaminhado no navegador.
 */
export default function ArmasRedirect() {
  useEffect(() => {
    window.location.replace(`/${window.location.search}`);
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center p-8">
      <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
        O catálogo agora é a tela inicial. Redirecionando…
      </p>
    </main>
  );
}

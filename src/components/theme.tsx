'use client';

import { ConfigProvider } from 'antd';
import ptBR from 'antd/locale/pt_BR';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { antdTheme } from '@/lib/antd-theme';

/**
 * O tema claro/escuro, e o Ant Design vestido com ele.
 *
 * A troca morava dentro do cabeçalho, que era o único interessado. Agora o
 * `ConfigProvider` também precisa saber qual dos dois está no ar — ele deriva a
 * paleta inteira do antd a partir disso — então o estado subiu para um contexto
 * e o botão virou só mais um leitor.
 *
 * Quem escreve `data-theme` no `<html>` continua sendo daqui: o CSS do site
 * inteiro pendura nesse atributo, e o antd é o convidado, não o dono.
 */

/** Quanto dura o esmaecimento entre os temas — o mesmo valor está no CSS. */
const THEME_FADE_MS = 320;

interface Tema {
  light: boolean;
  toggle: () => void;
}

const TemaContext = createContext<Tema>({ light: false, toggle: () => {} });

export const useTheme = () => useContext(TemaContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [light, setLight] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = light ? 'light' : 'dark';

    // Na primeira renderização não há de onde transicionar, e marcar o `<html>`
    // faria a página inteira nascer esmaecendo.
    if (first.current) {
      first.current = false;
      return;
    }

    root.dataset.themeSwitching = '';
    const timer = setTimeout(() => delete root.dataset.themeSwitching, THEME_FADE_MS);
    return () => clearTimeout(timer);
  }, [light]);

  return (
    <TemaContext.Provider value={{ light, toggle: () => setLight((v) => !v) }}>
      <ConfigProvider theme={antdTheme(light)} locale={ptBR}>
        {children}
      </ConfigProvider>
    </TemaContext.Provider>
  );
}

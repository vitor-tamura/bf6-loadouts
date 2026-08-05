#!/usr/bin/env python3
"""
Baixa as fotos das armas e grava cada uma em `public/armas/`.

Enquanto as imagens vinham de fora, bastava uma URL por arma. Trazidas para o
projeto, elas param de depender de site de terceiros continuar no ar e do CDN
permitir hotlink — e o build estático passa a ser realmente autossuficiente.

    python3 scripts/baixar_imagens.py           # só o que falta
    python3 scripts/baixar_imagens.py --forcar  # rebaixa tudo

A saída é WebP: a mesma foto em PNG ocupa perto de dez vezes mais, e o formato é
aceito por todo navegador que roda a aplicação. O alfa é preservado quando a
origem tem.
"""
import re
import sys
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / 'public' / 'armas'
FONTE = RAIZ / 'src' / 'data' / 'weapon-images.ts'

# Sem User-Agent de navegador, parte das origens devolve 403.
CABECALHOS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/131.0 Safari/537.36',
}

LARGURA_MAXIMA = 800
QUALIDADE = 82


def fontes() -> dict[str, list[str]]:
    """Lê o mapa de imagens do TypeScript: id da arma → URLs, da melhor à reserva."""
    texto = FONTE.read_text(encoding='utf8')
    wiki = re.search(r"const WIKI = '([^']+)'", texto).group(1)

    saida = {}
    for linha in texto.splitlines():
        entrada = re.match(r"\s*'?([\w-]+)'?:\s*\{(.+)\},\s*$", linha)
        if not entrada or 'photo' not in entrada.group(2) and 'render' not in entrada.group(2):
            continue
        arma, corpo = entrada.group(1), entrada.group(2)
        urls = []
        for campo in ('photo', 'render'):
            valor = re.search(rf"{campo}:\s*[`']([^`']+)[`']", corpo)
            if valor:
                urls.append(valor.group(1).replace('${WIKI}', wiki))
        if urls:
            saida[arma] = urls
    return saida


def baixar(url: str) -> bytes:
    pedido = urllib.request.Request(url, headers=CABECALHOS)
    with urllib.request.urlopen(pedido, timeout=30) as resposta:
        return resposta.read()


def gravar(dados: bytes, caminho: Path) -> tuple[int, int]:
    imagem = Image.open(BytesIO(dados))
    if imagem.width > LARGURA_MAXIMA:
        altura = round(imagem.height * LARGURA_MAXIMA / imagem.width)
        imagem = imagem.resize((LARGURA_MAXIMA, altura), Image.LANCZOS)
    # Modo P com transparência vira RGBA; o resto segue como está.
    if imagem.mode not in ('RGB', 'RGBA'):
        imagem = imagem.convert('RGBA' if 'transparency' in imagem.info else 'RGB')
    imagem.save(caminho, 'WEBP', quality=QUALIDADE, method=6)
    return imagem.size


def main() -> int:
    forcar = '--forcar' in sys.argv
    DESTINO.mkdir(parents=True, exist_ok=True)

    prontas = falhas = puladas = 0
    for arma, urls in sorted(fontes().items()):
        caminho = DESTINO / f'{arma}.webp'
        if caminho.exists() and not forcar:
            puladas += 1
            continue

        for url in urls:
            try:
                largura, altura = gravar(baixar(url), caminho)
            except Exception as erro:  # origem fora do ar, formato ilegível, 403
                ultimo = f'{type(erro).__name__}: {erro}'
                continue
            print(f'  ✓ {arma:14} {largura}x{altura}  {caminho.stat().st_size // 1024} KB')
            prontas += 1
            break
        else:
            print(f'  ✗ {arma:14} nenhuma fonte respondeu — {ultimo}')
            falhas += 1

    print(f'\n{prontas} baixadas · {puladas} já existiam · {falhas} falharam')
    return 1 if falhas else 0


if __name__ == '__main__':
    raise SystemExit(main())

# Motor de simulação

```
src/catalog      quais são os dados
src/simulation   o que acontece quando eles são aplicados
telas            o que mostrar
```

A fronteira é deliberada. Cálculo dentro do catálogo faria a regra de TTK viajar
junto com o arquivo de dados; separados, trocar a fonte dos dados não toca numa
linha de matemática, e corrigir a matemática não toca num byte de dado.

```ts
import { calculateTTK, damageAtRange, flightTime, dragModelFor } from '@/simulation';
```

## TTK não é dado

Guardar `"ttk": 217` obrigaria a uma linha por distância, por zona de acerto,
por vida de alvo e por munição — e cada patch que mexesse na curva invalidaria
todas de uma vez. O que se guarda é a curva, a cadência e o modelo de voo:

```
curva de dano ──► dano por tiro na distância
                       │
                  zona de acerto
                       │
                       ▼
                tiros para abater
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
   cadência (intervalo)        tempo de voo
         └─────────────┬─────────────┘
                       ▼
                      TTK
```

```ts
calculateTTK('m433', { distance: 50, headshots: 1 });
ttkCurve('m433', [0, 25, 50, 100]);
```

## Três regras que o motor aplica

**O degrau que termina na distância exata é o que vale.** A curva vem como
poligonal em que distâncias repetidas são queda instantânea. A M433 lê 26,05 em
21 m e 20,67 em 21,5 m. Ler ao contrário desloca o TTK de toda arma exatamente
onde a queda acontece — que é onde as pessoas comparam armas. A primeira versão
deste código errava isso; o teste que pegou compara com o exemplo documentado
pela fonte (NVO-228E: 35,22 em 9 m, 27,48 em 10 m).

**O último tiro não espera o intervalo seguinte.** O tempo entre o primeiro e o
último disparo é `(tiros − 1) × intervalo`. Somar um intervalo a mais infla o TTK
de arma lenta em dezenas de milissegundos.

**Falta de dado devolve `null`.** Nunca uma aproximação silenciosa. `Infinity` é
outra coisa: significa que o dano não mata, o que é uma resposta.

## O coeficiente de arrasto é parâmetro

Duas fontes discordam: 0,0035 /m (Analyzer) e 0,0025 /m (planilha da
comunidade). A EA confirma o mecanismo e não publica o número. O motor **não
escolhe**:

```ts
flightTime(dragModelFor('m433', { dragSource: 'analyzer' }), 100);
flightTime(dragModelFor('m433', { dragSource: 'community' }), 100);
```

Dá para rodar a mesma trajetória com os dois e medir a diferença, em vez de
discutir qual é o certo no escuro. O padrão é `analyzer`, por ser o do dataset
importado.

## Confiança acompanha o resultado

Todo `calculateTTK` devolve `quality`. Hoje é `provisional` para todas as armas,
porque é assim que a fonte publica as curvas. A tela precisa dizer isso — dado
disponível não é dado oficial.

## O que ainda não está no motor

- **Efeito de acessório.** Cano, freio de boca e munição mudam velocidade,
  recuo e dano. Os efeitos estão no catálogo, em degraus (`adsTimeTierMod`), e a
  tabela que converte degrau em número não foi publicada por nenhuma fonte.
- **Recuo e espalhamento aplicados.** Os modelos estão no catálogo
  (`recoil.json`, `spread.json`) e ninguém os interpreta ainda.
- **Escopetas.** `pellets` é parâmetro com padrão 1; nenhuma fonte publica a
  contagem de projéteis, então o dano de escopeta sai por projétil.

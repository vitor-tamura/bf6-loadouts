/**
 * O motor de simulação.
 *
 * O catálogo responde **"quais são os dados"**. Este módulo responde **"o que
 * acontece quando eles são aplicados"** — quanto dano a esta distância, quantos
 * tiros para abater, quanto tempo a bala leva, quanto ela cai.
 *
 * A fronteira entre os dois é deliberada. Cálculo dentro do catálogo faria a
 * regra de TTK viajar junto com o arquivo de dados, e mudar uma exigiria mexer
 * no outro. Aqui, o motor recebe dados e devolve resultado; trocar a fonte dos
 * dados não toca numa linha de matemática, e corrigir a matemática não toca num
 * byte de dado.
 *
 * ```
 * src/catalog      quais são os dados
 * src/simulation   o que acontece com eles
 * telas            o que mostrar
 * ```
 *
 * ## Duas coisas que este módulo não faz
 *
 * **Não escolhe coeficiente de arrasto.** As fontes discordam, e `dragSource` é
 * parâmetro — a resposta pode ser calculada com os dois e comparada.
 *
 * **Não esconde falta de dado.** Onde falta curva ou velocidade, o resultado é
 * `null`, nunca uma aproximação silenciosa. E todo resultado de TTK carrega
 * `quality`, que hoje é `provisional` para todas as armas porque é assim que a
 * fonte publica as curvas de dano.
 */

export {
  DEFAULT_HEALTH,
  damageAtRange,
  damagePerShot,
  shotsToKill,
  zoneMultiplier,
  type HitZone,
  type ShotsToKillOptions,
} from './damage';

export {
  dragModelFor,
  dropRelativeToZero,
  flightTime,
  isProjectileModel,
  trajectoryAt,
  type DragSource,
  type ProjectileModel,
  type Trajectory,
} from './ballistics';

export {
  calculateTTK,
  shotInterval,
  ttkCurve,
  type TimeToKill,
  type TimeToKillOptions,
} from './ttk';

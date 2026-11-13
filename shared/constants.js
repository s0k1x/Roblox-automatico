// Constantes físicas. Unidades: "uu" (1 uu = 1 cm), segundos, eje Z hacia arriba.
// Los valores siguen las mediciones públicas que la comunidad de bots/física de
// fútbol de coches ha documentado (tick de 120 Hz, gravedad -650, balón de radio 91.25, etc.).

export const TICK_RATE = 120;
export const DT = 1 / TICK_RATE;

export const PHYS = {
  GRAVITY: -650,

  // Balón
  BALL_RADIUS: 91.25,
  BALL_MASS: 30,
  BALL_MAX_SPEED: 6000,
  BALL_MAX_ANG: 6,
  BALL_DRAG: 0.03, // v *= (1 - 0.03 * dt)
  BALL_RESTITUTION: 0.6,
  BALL_FRICTION: 0.35,
  BALL_REST_Z: 93.15,

  // Coche
  CAR_MASS: 180,
  CAR_MAX_SPEED: 2300,
  SUPERSONIC: 2200,
  SUPERSONIC_KEEP: 2100,
  CAR_MAX_ANG: 5.5,
  REST_HEIGHT: 17.0, // altura del centro de masas sobre el suelo en reposo

  // Aceleración del acelerador según la velocidad hacia delante (uu/s -> uu/s²)
  THROTTLE_CURVE: [
    [0, 1600],
    [1400, 160],
    [1410, 0],
  ],
  BRAKE_ACCEL: 3500,
  COAST_ACCEL: 525,
  AIR_THROTTLE_ACCEL: 66.667,

  // Turbo
  BOOST_ACCEL: 991.667,
  BOOST_USE: 33.333, // por segundo
  BOOST_START: 33.3,

  // Curvatura de giro (1/uu) según velocidad: velocidad angular = curvatura * velocidad
  STEER_CURVE: [
    [0, 0.0069],
    [500, 0.00398],
    [1000, 0.00235],
    [1500, 0.001375],
    [1750, 0.0011],
    [2500, 0.00088],
  ],
  LATERAL_GRIP: 7000,
  POWERSLIDE_GRIP: 1100, // (sin uso directo: el agarre en derrape es LATERAL_GRIP × POWERSLIDE_LAT_FACTOR)
  // Derrape: el freno de mano entra en 0.2 s y sale en 0.5 s; el agarre lateral cae al 10 %
  // y las ruedas giran más (ángulo de dirección en derrape frente al normal, según la velocidad).
  POWERSLIDE_RISE: 5,
  POWERSLIDE_FALL: 2,
  POWERSLIDE_LAT_FACTOR: 0.1,
  STEER_ANGLE_CURVE: [[0, 0.53356], [500, 0.3193], [1000, 0.18203], [1500, 0.1057], [1750, 0.08507], [3000, 0.03454]],
  POWERSLIDE_STEER_ANGLE_CURVE: [[0, 0.39235], [2500, 0.1261]],

  STICKY_ACCEL: 325,

  // Salto
  JUMP_IMPULSE: 291.667,
  JUMP_HOLD_ACCEL: 1458.333,
  JUMP_HOLD_MAX: 0.2,
  DOUBLE_JUMP_IMPULSE: 291.667,
  FLIP_WINDOW: 1.25,

  // Dodge / flip
  DODGE_FORWARD: 500,
  DODGE_BACKWARD: 533.333,
  DODGE_SIDE: 500,
  DODGE_TIME: 0.65,
  DODGE_DEADZONE: 0.5,

  // Control aéreo (rad/s² por unidad de input) y amortiguación
  AIR_TORQUE_ROLL: 36.0796,
  AIR_TORQUE_PITCH: 12.146,
  AIR_TORQUE_YAW: 8.9196,
  AIR_DAMP_ROLL: 4.4717,
  AIR_DAMP_PITCH: 2.7982,
  AIR_DAMP_YAW: 1.8865,

  // Impulso extra coche->balón (curva de escala según velocidad relativa)
  HIT_SCALE_CURVE: [
    [0, 0.65],
    [500, 0.65],
    [2300, 0.55],
    [4600, 0.3],
  ],
  HIT_Z_SCALE: 0.35,
  HIT_FORWARD_SCALE: 0.35,
  HIT_MAX_DV: 4600,

  DEMO_RESPAWN: 3,

  // Detalles finos (medidos por la comunidad de simulación del género)
  BOOST_MIN_TIME: 0.1, // el turbo dura al menos 0.1 s aunque se suelte antes
  JUMP_MIN_TIME: 0.025, // el salto empuja al menos 0.025 s
  STICKY_GROUND: 0.5, // × gravedad sobre suelo plano
  FLIP_Z_DAMP_120: 0.35, // amortiguación vertical por tick (a 120 Hz) durante el flip
  FLIP_Z_DAMP_START: 0.15,
  FLIP_Z_DAMP_END: 0.21,
  FLIP_SIDE_MAX_SPEED_SCALE: 1.9,
  FLIP_BACKWARD_MAX_SPEED_SCALE: 2.5,
  FLIP_BACKWARD_SCALE_X: 16 / 15,
  SUPERSONIC_MAINTAIN_MAX: 1.0,
  BUMP_COOLDOWN: 0.25,
  BUMP_VEL_GROUND: [[0, 5 / 6], [1400, 1100], [2200, 1530]],
  BUMP_VEL_AIR: [[0, 5 / 6], [1400, 1390], [2200, 1945]],
  BUMP_VEL_UP: [[0, 2 / 6], [1400, 278], [2200, 417]],
};

// Clases de hitbox (largo, ancho, alto) y desplazamiento del centro de la caja
// respecto al centro de masas. Nombres genéricos.
export const HITBOXES = [
  { id: 'estandar', name: 'Estándar', size: [118.01, 84.2, 36.16], off: [13.88, 0, 20.75], color: '#2f8cff' },
  { id: 'plano', name: 'Plano', size: [127.93, 83.28, 31.3], off: [9.0, 0, 15.75], color: '#2f8cff' },
  { id: 'tabla', name: 'Tabla', size: [128.82, 84.67, 29.39], off: [9.01, 0, 12.09], color: '#2f8cff' },
  { id: 'largo', name: 'Largo', size: [131.49, 80.52, 30.3], off: [12.5, 0, 11.75], color: '#2f8cff' },
  { id: 'hibrido', name: 'Híbrido', size: [127.02, 82.19, 34.16], off: [13.88, 0, 20.75], color: '#2f8cff' },
  { id: 'alto', name: 'Alto', size: [120.72, 76.71, 41.66], off: [11.38, 0, 21.5], color: '#2f8cff' },
];

export const MATCH = {
  DURATION: 300,
  COUNTDOWN: 3,
  GOAL_PAUSE: 3,
};

export const TEAM_COLORS = ['#2f8cff', '#ff8a1f'];
export const TEAM_NAMES = ['Azul', 'Naranja'];

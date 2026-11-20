import { IncidentReport, PreventiveRoute, SocialPost, TrustedContact } from '../types';

export const DEMO_INCIDENTS: IncidentReport[] = [
  {
    id: 'VIG-2025-0101',
    category: 'asalto',
    riskLevel: 'alto',
    title: 'Asalto a mano armada en paradero',
    description: 'Dos sujetos en motocicleta lineal interceptaron a transeúntes esperando transporte público. Se dieron a la fuga hacia la auxiliar.',
    date: '2025-05-12',
    time: '21:30',
    district: 'Comas',
    approxLocation: {
      lat: -11.9352,
      lng: -77.0541,
      address: 'Av. Túpac Amaru cdra. 38 (cerca al paradero España)'
    },
    status: 'Verificado',
    isDemo: true,
    evidenceNote: 'Reportado por 4 vecinos de la junta vecinal local.',
    falseReportFlags: 0,
    helpfulCount: 28,
    reportedByRole: 'Peatón',
    createdAt: '2025-05-12T21:35:00Z'
  },
  {
    id: 'VIG-2025-0102',
    category: 'extorsion',
    riskLevel: 'alto',
    title: 'Amenazas y cobro de cupos a bodegas',
    description: 'Dejaron nota extorsiva y sobre cerrado en tres pequeños comercios de la cuadra durante la madrugada. Se alertó a serenazgo de zona.',
    date: '2025-05-12',
    time: '06:15',
    district: 'San Juan de Lurigancho',
    approxLocation: {
      lat: -11.9865,
      lng: -77.0042,
      address: 'Av. Próceres de la Independencia alt. Estación Los Postes'
    },
    status: 'Verificado',
    isDemo: true,
    evidenceNote: 'Cámaras comunitarias de seguridad registraron vehículo sospechoso.',
    falseReportFlags: 1,
    helpfulCount: 42,
    reportedByRole: 'Comerciante',
    createdAt: '2025-05-12T06:40:00Z'
  },
  {
    id: 'VIG-2025-0103',
    category: 'robo',
    riskLevel: 'medio',
    title: 'Robo de autopartes a vehículos estacionados',
    description: 'Sujetos forcejearon espejos laterales y computadoras de dos automóviles estacionados en calle con poca iluminación.',
    date: '2025-05-11',
    time: '23:10',
    district: 'Santiago de Surco',
    approxLocation: {
      lat: -12.1384,
      lng: -76.9892,
      address: 'Jr. Batalla de Ayacucho, Urb. Las Gardenias'
    },
    status: 'Verificado',
    isDemo: true,
    evidenceNote: 'Vecinos solicitaron mayor patrullaje integrado de serenazgo.',
    falseReportFlags: 0,
    helpfulCount: 19,
    reportedByRole: 'Conductor',
    createdAt: '2025-05-11T23:25:00Z'
  },
  {
    id: 'VIG-2025-0104',
    category: 'hurto_menor',
    riskLevel: 'medio',
    title: 'Arrebato de celular al paso en semáforo',
    description: 'Delincuente en bicicleta arrebató teléfono móvil a pasajera a través de la ventana semiabierta de un taxi detenido en luz roja.',
    date: '2025-05-12',
    time: '18:45',
    district: 'Miraflores',
    approxLocation: {
      lat: -12.1215,
      lng: -77.0302,
      address: 'Cruce Av. José Larco con Calle Schell'
    },
    status: 'Verificado',
    isDemo: true,
    evidenceNote: 'Intervino serenazgo de Miraflores a los pocos minutos.',
    falseReportFlags: 0,
    helpfulCount: 35,
    reportedByRole: 'Peatón',
    createdAt: '2025-05-12T18:50:00Z'
  },
  {
    id: 'VIG-2025-0105',
    category: 'accidente',
    riskLevel: 'alto',
    title: 'Choque múltiple con congestión severa',
    description: 'Colisión entre cúster y vehículo de carga ligera provocó derrame de combustible y bloqueo de dos carriles en sentido sur-norte.',
    date: '2025-05-12',
    time: '14:20',
    district: 'Callao',
    approxLocation: {
      lat: -12.0435,
      lng: -77.1189,
      address: 'Av. Elmer Faucett cruce con Av. Morales Duárez'
    },
    status: 'Verificado',
    isDemo: true,
    evidenceNote: 'Unidades de bomberos y ambulancia atendieron en el lugar.',
    falseReportFlags: 0,
    helpfulCount: 51,
    reportedByRole: 'Conductor',
    createdAt: '2025-05-12T14:30:00Z'
  },
  {
    id: 'VIG-2025-0106',
    category: 'actividad_sospechosa',
    riskLevel: 'medio',
    title: 'Automóvil con placa adulterada rondando ferreterías',
    description: 'Vehículo sedan color oscuro sin placa delantera dando vueltas insistentes frente a distribuidores de materiales y farmacias.',
    date: '2025-05-12',
    time: '11:05',
    district: 'Lima',
    approxLocation: {
      lat: -12.0521,
      lng: -77.0289,
      address: 'Jr. Huanta cdra. 9, Barrios Altos'
    },
    status: 'Pendiente de validación',
    isDemo: true,
    evidenceNote: 'Comerciantes agrupados en comité vecinal emitieron alerta por radio.',
    falseReportFlags: 0,
    helpfulCount: 14,
    reportedByRole: 'Comerciante',
    createdAt: '2025-05-12T11:10:00Z'
  },
  {
    id: 'VIG-2025-0107',
    category: 'otro',
    riskLevel: 'informativo',
    title: 'Semáforos inoperativos y falta de iluminación pública',
    description: 'Corte de alumbrado público en 3 cuadras consecutivas y semáforos intermitentes tras trabajos técnicos. Tomar precauciones al cruzar.',
    date: '2025-05-11',
    time: '19:00',
    district: 'Los Olivos',
    approxLocation: {
      lat: -11.9922,
      lng: -77.0705,
      address: 'Av. Carlos Izaguirre cruce con Av. Las Palmeras'
    },
    status: 'Verificado',
    isDemo: true,
    evidenceNote: 'Notificado a la municipalidad y empresa de energía.',
    falseReportFlags: 0,
    helpfulCount: 22,
    reportedByRole: 'Ciudadano',
    createdAt: '2025-05-11T19:15:00Z'
  },
  {
    id: 'VIG-2025-0108',
    category: 'asalto',
    riskLevel: 'alto',
    title: 'Intento de asalto a repartidor de delivery',
    description: 'Falso pedido en pasaje cerrado. Dos sujetos intentaron sustraer la moto del repartidor; la oportuna alarma comunitaria los ahuyentó.',
    date: '2025-05-10',
    time: '20:40',
    district: 'San Juan de Lurigancho',
    approxLocation: {
      lat: -11.9610,
      lng: -77.0115,
      address: 'Av. Wiesse cerca a Paradero 12 de Canto Grande'
    },
    status: 'Verificado',
    isDemo: true,
    evidenceNote: 'Red de repartidores de la zona advertida.',
    falseReportFlags: 0,
    helpfulCount: 38,
    reportedByRole: 'Conductor',
    createdAt: '2025-05-10T20:45:00Z'
  },
  {
    id: 'VIG-2025-0109',
    category: 'actividad_sospechosa',
    riskLevel: 'informativo',
    title: 'Presuntos falsos encuestadores pidiendo datos de viviendas',
    description: 'Personas sin credenciales oficiales tocando timbres pidiendo inventario familiar y horarios en que las casas quedan vacías.',
    date: '2025-05-12',
    time: '10:30',
    district: 'Santiago de Surco',
    approxLocation: {
      lat: -12.1280,
      lng: -76.9995,
      address: 'Calle Doña Esther, Urb. Los Rosales'
    },
    status: 'Pendiente de validación',
    isDemo: true,
    evidenceNote: 'Junta vecinal verificó con la municipalidad que no hay censo.',
    falseReportFlags: 0,
    helpfulCount: 16,
    reportedByRole: 'Ciudadano',
    createdAt: '2025-05-12T10:45:00Z'
  },
  {
    id: 'VIG-2025-0110',
    category: 'robo',
    riskLevel: 'medio',
    title: 'Hurto de mercadería a distribuidor de gaseosas',
    description: 'Aprovecharon descarga para forzar compuerta trasera y sustraer 8 paquetes de bebidas mientras el conductor cobraba en tienda.',
    date: '2025-05-11',
    time: '15:15',
    district: 'Comas',
    approxLocation: {
      lat: -11.9480,
      lng: -77.0620,
      address: 'Av. Universitaria con Av. Micaela Bastidas'
    },
    status: 'Verificado',
    isDemo: true,
    evidenceNote: 'Comerciantes vecinos colaboraron con registro de video.',
    falseReportFlags: 0,
    helpfulCount: 12,
    reportedByRole: 'Conductor',
    createdAt: '2025-05-11T15:30:00Z'
  }
];

export const DEMO_PREVENTIVE_ROUTES: PreventiveRoute[] = [
  {
    id: 'route-1',
    name: 'Comas (Túpac Amaru) → Miraflores (Parque Kennedy)',
    origin: { name: 'Comas (Paradero España)', lat: -11.9352, lng: -77.0541 },
    destination: { name: 'Miraflores (Parque Kennedy)', lat: -12.1215, lng: -77.0302 },
    // Main path (corridor vía Evitamiento / Vía Expresa Paseo de la República - menor exposición)
    mainPath: [
      [-11.9352, -77.0541],
      [-11.9680, -77.0580],
      [-12.0120, -77.0450],
      [-12.0450, -77.0260],
      [-12.0720, -77.0300],
      [-12.0980, -77.0320],
      [-12.1215, -77.0302]
    ],
    // Alternative path (corredor por vías alternas no iluminadas con más reportes recientes)
    altPath: [
      [-11.9352, -77.0541],
      [-11.9550, -77.0420],
      [-12.0250, -77.0180],
      [-12.0580, -77.0190],
      [-12.0850, -77.0220],
      [-12.1215, -77.0302]
    ],
    exposureLevel: 'menor',
    altExposureLevel: 'mayor',
    distanceKm: 24.8,
    durationMinutes: 48,
    incidentCountNear: 2,
    lightingQuality: 'Buena',
    patrolFrequency: 'Frecuente (Serenazgo y PNP)',
    safetyNotes: [
      'Corredor con iluminación continua y cámaras de videovigilancia de Lima Metropolitana.',
      'Ruta alternativa registra 7 incidentes recientes en tramos con poca luz.',
      'Recomendación nocturna: Mantener ventanillas cerradas en paraderos intermedios.'
    ]
  },
  {
    id: 'route-2',
    name: 'Callao (Aeropuerto / Faucett) → Cercado de Lima (Plaza Mayor)',
    origin: { name: 'Callao (Av. Elmer Faucett)', lat: -12.0435, lng: -77.1189 },
    destination: { name: 'Lima Cercado (Plaza Mayor)', lat: -12.0463, lng: -77.0427 },
    mainPath: [
      [-12.0435, -77.1189],
      [-12.0480, -77.0980],
      [-12.0510, -77.0750],
      [-12.0490, -77.0560],
      [-12.0463, -77.0427]
    ],
    altPath: [
      [-12.0435, -77.1189],
      [-12.0350, -77.0920],
      [-12.0380, -77.0650],
      [-12.0463, -77.0427]
    ],
    exposureLevel: 'menor',
    altExposureLevel: 'medio',
    distanceKm: 11.2,
    durationMinutes: 28,
    incidentCountNear: 1,
    lightingQuality: 'Buena',
    patrolFrequency: 'Frecuente (Serenazgo y PNP)',
    safetyNotes: [
      'Vía arterial Av. Colonial / La Marina presenta mayor presencia de patrullaje integrado.',
      'Evitar desvíos laterales por zonas industriales desiertas a partir de las 20:00 hrs.'
    ]
  },
  {
    id: 'route-3',
    name: 'San Juan de Lurigancho (Wiesse) → San Isidro (Centro Financiero)',
    origin: { name: 'SJL (Av. Próceres)', lat: -11.9865, lng: -77.0042 },
    destination: { name: 'San Isidro (Canaval y Moreyra)', lat: -12.0965, lng: -77.0275 },
    mainPath: [
      [-11.9865, -77.0042],
      [-12.0150, -77.0120],
      [-12.0400, -77.0180],
      [-12.0650, -77.0240],
      [-12.0965, -77.0275]
    ],
    altPath: [
      [-11.9865, -77.0042],
      [-11.9950, -76.9850],
      [-12.0480, -77.0050],
      [-12.0965, -77.0275]
    ],
    exposureLevel: 'menor',
    altExposureLevel: 'mayor',
    distanceKm: 17.5,
    durationMinutes: 42,
    incidentCountNear: 3,
    lightingQuality: 'Regular',
    patrolFrequency: 'Moderada',
    safetyNotes: [
      'Corredor de Línea 1 y Av. Abancay / Vía Expresa cuenta con monitoreo de cámaras municipales.',
      'Se aconseja precaución en transbordo de pasajeros en paraderos con alta afluencia.'
    ]
  },
  {
    id: 'route-4',
    name: 'Santiago de Surco (Benavides) → Barranco (Parque Municipal)',
    origin: { name: 'Surco (Av. Benavides)', lat: -12.1384, lng: -76.9892 },
    destination: { name: 'Barranco (Parque Municipal)', lat: -12.1485, lng: -77.0210 },
    mainPath: [
      [-12.1384, -76.9892],
      [-12.1350, -77.0020],
      [-12.1420, -77.0150],
      [-12.1485, -77.0210]
    ],
    altPath: [
      [-12.1384, -76.9892],
      [-12.1520, -76.9950],
      [-12.1580, -77.0120],
      [-12.1485, -77.0210]
    ],
    exposureLevel: 'menor',
    altExposureLevel: 'medio',
    distanceKm: 5.6,
    durationMinutes: 16,
    incidentCountNear: 1,
    lightingQuality: 'Buena',
    patrolFrequency: 'Frecuente (Serenazgo y PNP)',
    safetyNotes: [
      'Eje vial preferencial con ciclovías señalizadas y botones de auxilio de serenazgo.',
      'Tránsito fluido en horas de la mañana y tarde.'
    ]
  }
];

export const DEMO_TRUSTED_CONTACTS: TrustedContact[] = [
  {
    id: 'contact-1',
    name: 'María Fernández (Madre)',
    phone: '+51 987 654 321',
    relationship: 'Familiar directo',
    isConfirmed: true,
    createdAt: '2025-04-10T10:00:00Z'
  },
  {
    id: 'contact-2',
    name: 'Carlos Mendoza (Hermano)',
    phone: '+51 912 345 678',
    relationship: 'Familiar directo',
    isConfirmed: true,
    createdAt: '2025-04-12T14:30:00Z'
  },
  {
    id: 'contact-3',
    name: 'Compañero de Trabajo / Chofer',
    phone: '+51 955 888 222',
    relationship: 'Contacto de ruta laboral',
    isConfirmed: false,
    createdAt: '2025-05-01T09:15:00Z'
  }
];

export const ALLOWED_SOCIAL_DISTRICTS = [
  'Lima',
  'Callao',
  'Comas',
  'Los Olivos',
  'San Juan de Lurigancho',
  'San Martín de Porres',
  'Santiago de Surco',
  'Villa El Salvador',
  'Miraflores',
  'Ate',
  'Chorrillos'
] as const;

export const PERU_DISTRICTS = [
  'Todos los distritos',
  'Lima',
  'Lima (Cercado)',
  'Comas',
  'San Juan de Lurigancho',
  'Santiago de Surco',
  'Miraflores',
  'Callao',
  'Los Olivos',
  'San Isidro',
  'Ate',
  'San Martín de Porres',
  'Villa El Salvador',
  'San Borja',
  'La Victoria',
  'Independencia',
  'Chorrillos'
];

export const EMERGENCY_SERVICES = [
  {
    name: 'Policía Nacional del Perú (PNP)',
    phone: '105',
    description: 'Central de Emergencias Policiales a nivel nacional 24/7',
    color: 'bg-blue-900 text-white'
  },
  {
    name: 'Serenazgo de Lima Metropolitana',
    phone: '01 318 5050',
    description: 'Patrullaje municipal y auxilio ciudadano metropolitano',
    color: 'bg-emerald-800 text-white'
  },
  {
    name: 'Cuerpo General de Bomberos Voluntarios',
    phone: '116',
    description: 'Incendios, rescates vehiculares y emergencias médicas',
    color: 'bg-red-800 text-white'
  },
  {
    name: 'SAMU (Atención Médica de Urgencia)',
    phone: '106',
    description: 'Ambulancias y soporte vital del Ministerio de Salud',
    color: 'bg-amber-800 text-white'
  },
  {
    name: 'Línea 100 (Violencia Familiar / Género)',
    phone: '100',
    description: 'Orientación y auxilio ante violencia familiar y de género',
    color: 'bg-purple-800 text-white'
  }
];

export const DISTRICT_APPROX_COORDS: Record<string, { lat: number; lng: number }> = {
  Lima: { lat: -12.0464, lng: -77.0428 },
  'Lima (Cercado)': { lat: -12.0464, lng: -77.0428 },
  Comas: { lat: -11.9352, lng: -77.0541 },
  'San Juan de Lurigancho': { lat: -11.9865, lng: -77.0042 },
  'Santiago de Surco': { lat: -12.1384, lng: -76.9892 },
  Miraflores: { lat: -12.1215, lng: -77.0302 },
  Callao: { lat: -12.0435, lng: -77.1189 },
  'Los Olivos': { lat: -11.9922, lng: -77.0705 },
  'San Isidro': { lat: -12.0965, lng: -77.0275 },
  Ate: { lat: -12.0268, lng: -76.9187 },
  'San Martín de Porres': { lat: -12.0086, lng: -77.0688 },
  'Villa El Salvador': { lat: -12.2125, lng: -76.9394 },
  'San Borja': { lat: -12.0942, lng: -76.9996 },
  'La Victoria': { lat: -12.0672, lng: -77.0186 },
  Independencia: { lat: -11.9904, lng: -77.0542 },
  Chorrillos: { lat: -12.1695, lng: -77.0181 }
};

export const DEMO_SOCIAL_POSTS: SocialPost[] = [
  {
    id: 'SOC-DEMO-01',
    platform: 'x',
    source: 'x',
    externalPostId: 'demo-x-189001',
    postUrl: 'https://x.com/i/web/status/189001',
    text: '[Datos de demostración] Vecinos reportan asalto al paso en paradero cercano al óvalo en Los Olivos. Recomiendan esperar transporte en zona iluminada.',
    publishedAt: '2026-11-19T15:20:00Z',
    importedAt: '2026-11-19T15:25:00Z',
    queryUsed: '(robo OR asalto OR extorsion OR inseguridad) ("Los Olivos" OR Callao OR "San Juan de Lurigancho") lang:es -is:retweet',
    status: 'Pendiente de validación',
    state: 'pending_validation',
    suggestedCategory: 'asalto',
    suggestedRiskLevel: 'alto',
    suggestedDistrict: 'Los Olivos',
    detectedDistrict: 'Los Olivos',
    isDemo: true
  },
  {
    id: 'SOC-DEMO-02',
    platform: 'x',
    source: 'x',
    externalPostId: 'demo-x-189002',
    postUrl: 'https://x.com/i/web/status/189002',
    text: '[Datos de demostración] Congestión vehicular fuerte por accidente leve en cruce principal del Callao. Unidades de auxilio ya en camino.',
    publishedAt: '2026-11-18T14:10:00Z',
    importedAt: '2026-11-18T14:15:00Z',
    queryUsed: '(robo OR asalto OR extorsion OR inseguridad) ("Los Olivos" OR Callao OR "San Juan de Lurigancho") lang:es -is:retweet',
    status: 'Pendiente de validación',
    state: 'pending_validation',
    suggestedCategory: 'accidente',
    suggestedRiskLevel: 'medio',
    suggestedDistrict: 'Callao',
    detectedDistrict: 'Callao',
    isDemo: true
  },
  {
    id: 'SOC-DEMO-03',
    platform: 'x',
    source: 'x',
    externalPostId: 'demo-x-189003',
    postUrl: 'https://x.com/i/web/status/189003',
    text: '[Datos de demostración] Comerciantes alertan sobre mensajes de extorsión en zona comercial de San Juan de Lurigancho. Piden mayor patrullaje preventivo.',
    publishedAt: '2026-11-17T11:45:00Z',
    importedAt: '2026-11-17T11:50:00Z',
    queryUsed: '(robo OR asalto OR extorsion OR inseguridad) ("Los Olivos" OR Callao OR "San Juan de Lurigancho") lang:es -is:retweet',
    status: 'Pendiente de validación',
    state: 'pending_validation',
    suggestedCategory: 'extorsion',
    suggestedRiskLevel: 'alto',
    suggestedDistrict: 'San Juan de Lurigancho',
    detectedDistrict: 'San Juan de Lurigancho',
    isDemo: true
  },
  {
    id: 'SOC-DEMO-04',
    platform: 'x',
    source: 'x',
    externalPostId: 'demo-x-189004',
    postUrl: 'https://x.com/i/web/status/189004',
    text: '[Datos de demostración] Publicación genérica sobre inseguridad sin precisar distrito ni referencia en Lima o Callao.',
    publishedAt: '2026-11-16T09:30:00Z',
    importedAt: '2026-11-16T09:35:00Z',
    queryUsed: '(robo OR asalto OR extorsion OR inseguridad) lang:es -is:retweet',
    status: 'Descartado',
    state: 'discarded',
    suggestedCategory: 'actividad_sospechosa',
    suggestedRiskLevel: 'informativo',
    suggestedDistrict: 'Sin distrito',
    detectedDistrict: 'Sin distrito',
    moderatorName: 'Filtro automático Lima/Callao',
    reviewReason: 'No identifica un distrito permitido de Lima Metropolitana o Callao.',
    reviewedAt: '2026-11-16T09:35:00Z',
    isDemo: true
  }
];

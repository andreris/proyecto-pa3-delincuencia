# Vigila.pe 🇵🇪

**Plataforma comunitaria de geoseguridad para ciudadanos, conductores y pequeños comerciantes del Perú.**

> *“Infórmate, planifica y muévete con mayor prevención.”*
>
> ⚠️ **Aviso Importante:** La información comunitaria es netamente referencial y **no reemplaza** a las centrales oficiales de emergencia (Policía Nacional del Perú 105, Bomberos 116, SAMU 106 ni Serenazgo local).

---

## 📱 Versión App Móvil (PWA) y Versión Web

Vigila.pe ahora incluye una **experiencia dual interactiva**:
1. **Versión App Móvil**:
   - Shell nativo de smartphone con barra de estado (reloj, batería, 5G, isla dinámica).
   - Barra de navegación inferior (Tab Bar) con 5 accesos directos y botón central flotante **“+ Reportar”**.
   - Simulador de notificaciones push de alerta vecinal por georradar.
   - PWA instalable en Android (APK/WebAPK) y iPhone/iPad (Safari: *Agregar a pantalla de inicio*).
   - Soporte para funcionamiento **sin conexión (offline)** gracias a Service Workers y Workbox con almacenamiento en caché de mapas e incidentes.
2. **Versión Web / Portal**:
   - Vista completa de escritorio para monitoreo, salas de serenazgo, juntas vecinales y panel de moderación extendido.

---

## 🚀 Características Principales

1. **Mapa Interactivo con Leaflet y OpenStreetMap**:
   - Centrado en Lima Metropolitana con visualización de incidentes en Comas, San Juan de Lurigancho, Santiago de Surco, Miraflores, Callao, Los Olivos y Cercado de Lima.
   - Atribución visible a OpenStreetMap contributors.
   - Marcadores codificados por color según nivel de riesgo:
     - 🔴 **Rojo**: Riesgo alto (Asalto a mano armada, extorsión, accidentes graves).
     - 🟡 **Amarillo**: Riesgo medio (Robo de autopartes, arrebatos, merodeo).
     - 🔵 **Azul**: Informativo (Cortes de luz, semáforos inoperativos, obras viales).
   - Capa opcional de círculos de calor y radio de influencia de riesgo.
   - Filtros en tiempo real por distrito, categoría de incidente, fecha y estado de validación.

2. **Registro Ciudadano Seguro y Anónimo**:
   - Georreferenciación con GPS del dispositivo o selección sobre el mapa.
   - **Garantía estricta de privacidad**: Las coordenadas públicas se aproximan automáticamente mediante dispersión geométrica para no revelar domicilios específicos.
   - Prohibición explícita de compartir datos personales o rostros de víctimas.
   - Estado inicial obligatorio: **“Pendiente de validación”**.

3. **Rutas Preventivas**:
   - Trazado de corredores metropolitanos con Leaflet (Comas ↔ Miraflores, Callao ↔ Lima Centro, SJL ↔ San Isidro, Surco ↔ Barranco).
   - Comparación entre ruta principal y alternativa.
   - Indicador referencial de exposición: *“Menor exposición”*, *“Exposición media”* o *“Mayor exposición”* según densidad de incidentes y calidad de iluminación.

4. **Botón SOS y Red de Contactos de Confianza**:
   - Botón rojo de auxilio accesible con pantalla de confirmación.
   - Captura de geolocalización actual y generación de mensaje listo para WhatsApp / SMS.
   - Registro de hasta 3 contactos de confianza.
   - Directorio directo para marcado rápido a la PNP (105), Bomberos (116) y SAMU (106).

5. **Panel Oficial de Moderación y Auditoría**:
   - Cola de incidentes pendientes con aprobación (“Verificado”) o descarte con motivo.
   - Métricas de concentración por distrito y distribución por categoría.
   - Bitácora de acciones de moderación.

6. **Perfiles Multirrol**:
   - Peatón / pasajero
   - Conductor (taxi / particular / reparto)
   - Comerciante (bodegas, farmacias, locales)
   - Moderador comunitario

---

## 🛠️ Tecnologías Empleadas

- **Frontend**: React 19 + TypeScript.
- **Estilos**: Tailwind CSS v4 con paleta institucional (#0B1F3A, #2563EB, #DBEAFE, #F8FAFC, #0F172A).
- **Mapas y Geoprocesamiento**: Leaflet (`leaflet` + `@types/leaflet`) con mosaicos de **OpenStreetMap**.
- **Iconografía**: Lucide React.
- **Almacenamiento Local**: LocalStorage con hidratación automática de datos demo realistas.

---

## ⚙️ Guía de Configuración de Firebase (Opcional para Sincronización Remota)

Si deseas conectar Vigila.pe a un proyecto en la nube de Google Firebase (Authentication y Cloud Firestore), sigue estos pasos:

1. **Crear Proyecto en Firebase Console**:
   - Ingresa a [https://console.firebase.google.com/](https://console.firebase.google.com/) y crea un proyecto (ej. `vigila-pe-prod`).
2. **Habilitar Firebase Authentication**:
   - Dirígete a **Authentication** > **Sign-in method**.
   - Habilita el proveedor **Correo electrónico/Contraseña** (o Google Sign-in).
3. **Crear Base de Datos Firestore**:
   - Ve a **Cloud Firestore** > **Crear base de datos**.
   - Selecciona la región (ej. `southamerica-east1` o `us-central1`).
4. **Colecciones sugeridas**:
   - `users`: `{ uid, name, email, district, userType, role, createdAt }`
   - `reports`: `{ id, category, riskLevel, title, description, district, approxLocation, status, reportedByRole, createdAt }`
   - `trustedContacts`: `{ id, userId, name, phone, relationship, isConfirmed }`
   - `moderationActions`: `{ id, reportId, action, moderatorName, timestamp, reason }`
5. **Configurar Credenciales**:
   - En la configuración de tu app web en Firebase, copia las variables en tu archivo `.env`:
     ```env
     VITE_FIREBASE_API_KEY="AIzaSy..."
     VITE_FIREBASE_AUTH_DOMAIN="vigila-pe.firebaseapp.com"
     VITE_FIREBASE_PROJECT_ID="vigila-pe"
     VITE_FIREBASE_STORAGE_BUCKET="vigila-pe.appspot.com"
     VITE_FIREBASE_MESSAGING_SENDER_ID="..."
     VITE_FIREBASE_APP_ID="..."
     ```

---

## 🗺️ Mapa y Cartografía

Esta versión utiliza **Leaflet** con mosaicos de **OpenStreetMap** (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`), asegurando funcionamiento autónomo, gratuito y sin necesidad de claves de API externas bloqueadas por cuotas.

---

## 🐦 Integración Oficial con X (Backend Express + API v2)

Vigila.pe permite incorporar publicaciones **públicas** recientes de X como **fuentes externas referenciales** para que un moderador humano las revise antes de convertirlas en incidentes visibles en el mapa.

### Principios de Seguridad y Privacidad
- **Solo publicaciones públicas**: Se utiliza exclusivamente la API oficial de X v2 (`/2/tweets/search/recent`). No se realiza scraping, ni se accede a mensajes privados, perfiles privados, seguidores o recolección masiva.
- **Secreto protegido en el backend**: `X_BEARER_TOKEN` reside únicamente en el entorno del servidor Express (`/server`). Nunca se expone en variables `VITE_*`, `localStorage`, código cliente ni logs.
- **Revisión humana obligatoria**: Ninguna publicación importada de X aparece automáticamente en el mapa público ni se muestran nombres de usuario por defecto. Todo registro generado desde X ingresa con estado **“Pendiente de validación”** y requiere que el moderador confirme manualmente un distrito y ubicación aproximada.
- **Retención configurable**: Las publicaciones descartadas se depuran automáticamente según `SOCIAL_RETENTION_DAYS` (por defecto, **30 días**).

### Cómo obtener `X_BEARER_TOKEN`
1. Ingresa al **X Developer Portal** ([developer.x.com](https://developer.x.com/)) y crea o selecciona un Project / App con permisos de lectura (**Read-only**).
2. En la pestaña **Keys and tokens**, genera el **Bearer Token**.
3. Copia el archivo `.env.example` a `.env` en la raíz del proyecto y asigna `X_BEARER_TOKEN` (sin comillas ni espacios adicionales).

### Cómo ejecutar Frontend + Backend
1. Copia la configuración base:
   ```bash
   cp .env.example .env
   ```
2. Inicia frontend (puerto `3000`) y backend Express (puerto `4000`) en paralelo:
   ```bash
   npm run dev:all
   ```
   O por separado:
   ```bash
   npm run dev         # Frontend React + Vite en http://localhost:3000
   npm run dev:server  # Backend Express + TypeScript en http://localhost:4000
   ```
3. Si no configuras backend ni `X_BEARER_TOKEN`, la aplicación continúa operando en **Modo demo** con datos locales de demostración claramente etiquetados.

### Persistencia: SQLite (desarrollo) y PostgreSQL (producción)
- **Desarrollo local**: Si `DATABASE_URL` está vacío, el servidor crea automáticamente una base SQLite en `server/data/vigila.db`.
- **Producción**: Define `DATABASE_URL="postgresql://usuario:password@host:5432/vigila_pe"` en el entorno del servidor para usar PostgreSQL sin cambiar la lógica de negocio.

### Limitaciones conocidas de X API v2
- El endpoint de búsqueda reciente (`/2/tweets/search/recent`) cubre típicamente los últimos **7 días** según el plan de X Developer.
- Los planes gratuitos/básicos de X tienen límites estrictos de solicitudes y volumen mensual (`rate limits`, código `429`). El backend respeta paginación acotada, evita sincronizaciones concurrentes y deduplica automáticamente por `external_post_id`.

### Flujo de Moderación Humana
1. Inicia sesión o activa el rol **Moderador** e ingresa a **Moderación → Fuentes sociales**.
2. Configura (opcionalmente) la consulta de búsqueda oficial (solo moderadores) y presiona **“Sincronizar X”**.
3. Revisa cada publicación segura: abre el enlace original en X, valida si corresponde a un incidente real y elige:
   - **Crear reporte desde publicación**: exige confirmar distrito/zona aproximada y crea el incidente con estado **“Pendiente de validación”** (aún oculto en el mapa público).
   - **Vincular a reporte existente**: asocia la publicación como respaldo informativo.
   - **Descartar**: registra el descarte en auditoría y aplica retención de 30 días.
4. En **Cola de Validación**, aprueba (**“Verificado”**) el reporte para que recién sea visible en el mapa público.

### Verificación y Pruebas
```bash
npm test          # Pruebas de deduplicación, autorización de moderador y flujo SocialPost -> IncidentReport
npm run typecheck # Verificación de tipos TypeScript (frontend + backend)
npm run build     # Compilación de producción del frontend
npm run build:server # Compilación TypeScript del backend Express
```


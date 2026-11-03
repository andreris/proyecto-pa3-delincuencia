# Vigila.pe 🇵🇪

**Plataforma comunitaria de geoseguridad para ciudadanos, conductores y pequeños comerciantes del Perú.**

> *“Infórmate, planifica y muévete con mayor prevención.”*
>
> ⚠️ **Aviso Importante:** La información comunitaria es netamente referencial y **no reemplaza** a las centrales oficiales de emergencia (Policía Nacional del Perú 105, Bomberos 116, SAMU 106 ni Serenazgo local).

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

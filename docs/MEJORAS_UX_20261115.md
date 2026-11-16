# Mejoras de experiencia de uso (15/11/2026)

> **Estado:** implementadas y probadas **en local** (rama `feat/catalogo-clientes`, sin commit, sin fusionar y sin desplegar). Producción sigue con la versión anterior.
> Las reglas de negocio, los permisos por rol y los cálculos no cambiaron.

## Qué cambió para quien usa la aplicación

| Área | Antes | Ahora |
|---|---|---|
| Propuesta | «Proveedores considerados» pedía identificadores escritos a mano | Una sección por servicio con los **proveedores activos que lo ofrecen**, por nombre y con su contacto. «Banquete; Música» son dos servicios |
| Servicios sin proveedor | Error genérico | Aviso claro y acceso al catálogo (si el rol lo permite); no se puede avanzar con proveedores inexistentes |
| Aceptar propuesta | Pedía escribir la versión | Solo confirma; usa la versión vigente |
| Preparar contrato | Seguía visible con el contrato ya creado | Se oculta y aparece **«Ver contrato»** |
| Política de no reembolso | Seguía visible tras comunicarla y su segunda captura reemplazaba la fecha | Se oculta, muestra **«Política comunicada»** con su fecha, y el servidor **conserva la fecha original** |
| Firma / pagos | Acciones repetidas; verificar un pago exigía escribir su identificador | La firma se ofrece una sola vez; cada pago registrado tiene su botón **«Verificar pago»** |
| Detalle del evento | Todas las acciones a la vez | Panel **«Qué sigue en este evento»**: paso actual, requisitos que faltan, botón correspondiente y progreso de 13 pasos |
| Proveedor | Tabla genérica y mensaje vacío sin orientación | Grupos «Pendientes de tu respuesta», «Aceptados» y «Rechazados»; botones **«Aceptar servicio»** y **«Rechazar servicio»**; mensaje claro si no tiene servicios |
| Listas y filtros | Identificadores (`EV-…`, `PV-…`) | Nombres: evento (tipo · fecha · cliente), proveedor y contrato |
| Mensajes | «No es posible realizar esta operación en el estado actual» | Qué pasó y qué sigue (por ejemplo, «El contrato ya fue preparado. Puedes consultarlo desde el detalle del evento.») |

## Pasos del flujo guiado (estados reales, sin estados nuevos)

Registro del evento → revisión de necesidades → propuesta → aceptación → contrato → política comunicada → firma → anticipo registrado y verificado → confirmación → asignación de proveedores → respuesta de los proveedores → pago final → realización y cierre. Un evento **cancelado** o **cerrado sin contratación** se muestra como terminal. El servidor sigue validando cada operación; el panel solo guía.

## Cambios en el servidor (aditivos)

- `GET /eventos/{id}/administracion`: cada contrato añade `propuestaId`, `politicaComunicada`, `politicaComunicadaEn` y `firmadoEn`.
- `GET /eventos/{id}/pagos`: cada pago registrado añade `pagoId` (se usa internamente para verificarlo; no se muestra).
- `POST /contratos/{id}/comunicacion-politica-no-reembolso`: es **idempotente**; si ya estaba comunicada responde 200 con `ya_registrada: true` y la fecha original, sin sobrescribirla.
- Servicios: «Banquete; Música» se separa en dos servicios al registrar el evento y al crear la propuesta; las propuestas anteriores no se reescriben (la interfaz las muestra separadas).
- Equivalencias de nombres de servicio **explícitas** (`EQUIVALENCIAS_DE_SERVICIOS` en `src/domain/proveedor.py`: plural/singular de banquete, salón, música, fotografía, decoración, invitación, transporte y mesero) además de mayúsculas, acentos y espacios. No hay coincidencia aproximada. Ampliar la tabla es una decisión de negocio.

## Comprobaciones realizadas (local)

- Pruebas automatizadas nuevas: `tests/test_ux_simplificacion.py` (16 pruebas: dominio, API en memoria y PostgreSQL, y la lógica del flujo guiado y los mensajes con Node).
- Recorrido real en Chrome con Coordinación, Administración y tres cuentas de proveedor: registrar cliente y evento → propuesta por servicio → aceptación → contrato (desaparece «Preparar contrato», aparece «Ver contrato») → política (confirmación, desaparece la acción, se conserva al recargar) → firma → anticipo de 3,000.00 (30 %) registrado y verificado por Administración → asignación de un proveedor distinto por servicio → cada proveedor ve solo lo suyo, acepta o rechaza → Coordinación ve las respuestas.
- Seguridad: 28 solicitudes no autorizadas o repetidas contra el servidor con sesiones reales (403, 401, 422 según corresponde); ninguna se permitió.

## Teléfono: exactamente 10 dígitos

- **Regla:** solo dígitos, exactamente 10 (sin espacios, guiones, paréntesis, «+» ni letras). Mensaje único: «El número telefónico debe contener exactamente 10 dígitos».
- **Interfaz:** el campo solo deja teclear dígitos y bloquea el dígito número 11; al pegar se quitan espacios, guiones y letras, y si quedan más de 10 dígitos **no se recorta**: se marca como inválido. La validación se repite al enviar.
- **Servidor:** la misma regla en el dominio (`src/domain/telefono.py`), no solo en JavaScript. Un teléfono inválido responde 422 y no crea cliente ni evento.
- **Dónde aplica:** teléfono del cliente (obligatorio, al registrar el evento) y **teléfono del proveedor** (campo nuevo, opcional). El «contacto» del proveedor sigue siendo texto libre (persona, correo, horario) porque los registros existentes lo usan así.
- **Base de datos:** revisión **0011** (aditiva): `proveedor.telefono` con valor `''` y restricción `'' o exactamente 10 dígitos`; los proveedores existentes quedan sin teléfono. La tabla `cliente` no tiene restricción de formato para conservar cualquier registro histórico.
- **Registros históricos:** un cliente guardado con formato («55 1234 5678») se lista y se reconoce por sus dígitos; no se reescribe. Los datos de demostración (`CL-DEMO-01/02/03`) no guardan teléfono y no se afectan.
- **Pruebas:** `tests/test_telefono.py` (10 dígitos aceptado; 9, 11, letras, símbolos, espacios, vacío y dígitos de otro alfabeto rechazados; dominio, API de clientes y proveedores, PostgreSQL, migración 0011 y paridad con el navegador).

## Indisponibilidad del proveedor, versiones de propuesta, solicitudes guiadas y anexos (16/11/2026)

> Implementado y probado **en local** (rama `feat/catalogo-clientes`, sin commit ni despliegue). Añade la migración **0012** (aditiva) y una operación nueva: `POST /eventos/{evento_id}/servicios/{servicio_contratado_id}/indisponibilidad` (80 operaciones).

**El proveedor que ya aceptó puede reportar que no puede cumplir.** Antes solo podía aceptar o rechazar *antes* de aceptar; después de aceptar no había nada. Ahora su cuenta muestra **«Reportar indisponibilidad»** en «Servicios aceptados» (motivo obligatorio de una lista, descripción opcional u obligatoria con «Otro motivo»; la fecha y la hora las pone el servidor). El servidor: valida que sea su servicio, que ya lo haya aceptado y que el evento esté En organización y no haya iniciado; deja el servicio en «Proveedor no disponible» **conservando la aceptación original y su fecha**; abre la sustitución con el motivo, la descripción y la fecha; y avisa a Coordinación. No elimina la asignación ni toca el contrato. Permiso nuevo `proveedores.reportar`, solo del proveedor.

**Sustitución (flujo existente, sin estados nuevos).** Coordinación ve el reporte en «Solicitudes del evento» y en la página «Solicitudes»: proveedor original, motivo, fecha y cuándo había aceptado. Los pasos son: indisponibilidad reportada → proponer un proveedor alternativo (activo, que ofrezca exactamente el servicio, **distinto del original**, con costo adicional y condiciones) → aprobación del Cliente → autorización de Administración → anexo → integrar el costo adicional (si lo hay) → confirmar. Registrar una alternativa **no** completa la sustitución. Si el Cliente o Administración la rechazan, se propone otra. Al confirmar el servicio pasa al nuevo proveedor y el historial del anterior (reporte, motivo y fecha) se conserva. *Límite de la arquitectura:* la disponibilidad del proveedor alternativo la registra Coordinación al proponerlo (decisión D-P3); el nuevo proveedor responde después desde su cuenta y, si más tarde no puede cumplir, puede reportarlo con el mismo botón.

**Propuestas y versiones.** «Crear propuesta» y «Generar nueva versión» usan una cotización por servicio: el catálogo de servicios sale de los proveedores activos y de los servicios del evento (se puede agregar o quitar cualquiera, no solo los pedidos al inicio); cada servicio lleva **su proveedor** (solo activos que lo ofrecen) y **su importe cotizado** (no se asignan precios automáticamente); el **total se calcula solo**, también en el servidor. Cada versión conserva sus servicios, proveedores, importes y condiciones (`version_propuesta.desglose`); «Ver versiones» muestra el historial y la nueva pasa a ser la vigente, otra vez en revisión del Cliente. Una propuesta aceptada ya no admite versiones: lo aceptado se modifica con «Solicitar cambio», «Sustituir proveedor» o «Solicitar servicio adicional», cada uno con su anexo (la pantalla lo explica). Las propuestas anteriores (solo con total) se siguen mostrando y se pueden versionar capturando los importes.

**Solicitudes como proceso guiado.** Cada solicitud tiene un panel con sus pasos (✓ hecho, ➜ siguiente, ○ pendiente, – no aplica) y **solo** la acción que corresponde, calculada por el servidor a partir del estado guardado (`src/application/flujo_solicitudes.py`; el backend sigue validando cada operación). Orden por tipo:
- *Cambio:* solicitud → viabilidad → decisión del Cliente y autorización (solo si afecta costos o condiciones) → **anexo** → comunicar el importe adicional → pago verificado → confirmar. **Sin importe adicional** se omiten los pasos de pago y no se genera ninguna obligación por $0.
- *Servicio adicional:* solicitud → proveedor, costo y condiciones → aprobación del Cliente → autorización → anexo → comunicar el pago → pago verificado → confirmar.
- *Sustitución:* ver arriba.

**Sobre los $2,000 de un cambio con más de 7 días.** El código ya cobraba el cargo por cambio tardío solo con menos de 7 días naturales (diferencia de fechas locales) y nunca por una tarifa escrita a mano. Los $2,000 que se veían eran el **costo adicional del proveedor** registrado en la viabilidad (en la base local: `costo_proveedor = 2000` y `tarifa_importe = 0.00`), que según BN-003 se cobra aparte. La confusión era de presentación: ahora cada panel muestra por separado «Costo adicional del proveedor», «Cargo por cambio tardío» («Sin cargo» con 7 días o más) y el total, con la explicación de los días de anticipación. Hay pruebas de ambos casos (más y menos de 7 días).

**Anexos.** «Anexos del contrato» muestra en el detalle del evento cada anexo (tipo de solicitud, descripción, fecha, estado de formalización e importe adicional) con «Consultar anexo»; el panel de la solicitud lo vincula; el botón «Registrar anexo del contrato» desaparece al existir y un segundo registro se rechaza sin sobrescribir. Los anexos no aparecen en otro evento y persisten al recargar (probado con PostgreSQL). *Causa de que antes «no se vieran»:* ninguna vista del detalle los leía; la solicitud solo guardaba el identificador del anexo y la interfaz seguía ofreciendo el botón según el estado.

## Pantalla en blanco al abrir en Chrome normal (corregido)

- **Síntoma:** en Chrome normal se veía el menú completo y el contenido en blanco, sin inicio de sesión; en incógnito funcionaba.
- **Causa comprobada** (reproducida en Chrome real): la interfaz se servía con `ETag` y `Last-Modified` pero **sin `Cache-Control`**. Chrome aplicaba caché heurística y, tras reconstruir la aplicación, mezclaba módulos JavaScript de versiones distintas (`SyntaxError: The requested module './texto.js' does not provide an export named …`). `main.js` nunca se ejecutaba: el menú del HTML (que se veía completo porque nadie lo ocultaba) quedaba solo. No era un problema de sesión, tokens ni `localStorage`: la sesión es una cookie `HttpOnly`, no hay Service Workers y la interfaz no guarda credenciales.
- **Corrección:** `Cache-Control: no-cache` en toda la interfaz (se revalida con ETag y responde 304 si no cambió); el HTML arranca sin menú y con «Cargando Eventos Nova…»; `js/arranque.js` detecta un fallo de enlace y muestra una explicación con **«Actualizar la aplicación»** (vuelve a pedir los archivos sin usar la caché y recarga, sin tocar la sesión ni los datos); `reiniciar.html` hace lo mismo desde una dirección; y `main.js` ya no confunde un error de conexión con una sesión vencida: muestra «No se pudo comprobar tu sesión» con **Reintentar**.
- **Limitación honesta:** las copias que Chrome ya tenga guardadas de la versión anterior no se pueden invalidar desde el servidor. Una sola vez hay que abrir `http://127.0.0.1:8000/app/reiniciar.html` (o recargar con Ctrl+Shift+R). A partir de ahí no vuelve a ocurrir.

## Pendientes y límites

- Un proveedor que **rechaza** un servicio obliga a registrar una **sustitución** (regla existente); el panel lo indica pero no la automatiza.
- Los DOCX/PDF de manuales no se actualizaron con estas pantallas (ver `docs/BORRADOR_ACTUALIZACION_DOCUMENTOS_FINALES.md`).
- No se probó en un dispositivo móvil físico; el diseño responsivo existente se conserva y los nuevos bloques usan rejillas adaptables.

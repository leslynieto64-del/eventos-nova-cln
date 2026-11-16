# Informe final de verificación documental — Eventos Nova

Fecha: 06/11/2026 · Base: commit `1dfcfdd` de `leslynieto64-del/eventos-nova-cln` · Alcance: solo documentación y evidencias. No se modificó código, pruebas, configuración ni recursos de producción.

## 1. Resultados de referencia usados en todos los documentos

| Fuente | Resultado |
|---|---|
| GitHub Actions, ejecución `42268272652`, commit `1dfcfdd` | 2 trabajos aprobados; 1,787 pruebas; sentencias 98.12 % (6,751/6,880); ramas 93.36 % (1,378/1,476); total combinado 97.3 % |
| Docker Compose local (06/11/2026) | `docker compose config` válido; `db` y `api` *healthy*; `/ready` 200; 1,787 aprobadas y 9 omitidas contra `eventosnova_test`. El servicio `migrate` no se ejecutó en esa sesión y no se hizo un `docker compose up` completo. El `worker` se reinició 3 veces por «failed to resolve host 'db'» y después quedó estable |
| Render | `eventosnova-api` y `eventosnova-worker` en estado *Live* con `1dfcfdd` |
| PostgreSQL de producción (consulta de solo lectura) | Outbox: 9 eventos PROCESADO, 0 pendientes en el momento de la consulta. No se afirma un procesamiento continuo |

Las pruebas locales no se presentan como pruebas de producción en ningún documento.

## 2. Validación final (sección 9 de la instrucción)

| # | Comprobación | Resultado |
|---|---|---|
| 1 | Reporte PDF y DOCX con el mismo contenido | El PDF se exportó del mismo DOCX con LibreOffice; 50 páginas, 24 capítulos que cubren los 33 apartados solicitados (portada, datos e índice incluidos), 42 figuras |
| 2 | Todas las páginas verticales | Verificado en todos los PDF de `docs/`; la única excepción es la presentación, en 16:9 por diseño |
| 3 | Sin páginas vacías | 0 páginas vacías en los PDF revisados |
| 4 | Diagramas legibles | Diagramas grandes divididos en partes con superposición; diagramas de clases regenerados en vertical desde las fuentes `.puml` |
| 5 | Imágenes sin cortes | Revisión visual de las 50 páginas del reporte y de las 20 diapositivas |
| 6 | Índice de evidencias contra archivos reales | `INDICE_EVIDENCIAS.md/.xlsx` cubre los 82 archivos de evidencia de las 11 carpetas; la única referencia a un nombre inexistente es la nota que documenta el renombrado de `06_Coordinador_GET_Usuarios_200_REDACTADO.png` |
| 7 | Enlaces | Los cinco enlaces aparecen igual en el README, el reporte y la última diapositiva. Desde este entorno no hay salida a Render ni a GitHub, así que la respuesta HTTP 200 se toma de las evidencias del 06/11/2026 (`04_PRUEBAS_MANUALES_SWAGGER`, `06_DESPLIEGUE_RENDER`, `11_PRODUCCION_SIN_SESION`) |
| 8 | Conclusiones individuales completas | Tres conclusiones distintas con nombre y matrícula. Las de Lesly (etapas 1–3 y 10–12) y Christopher (etapas 4–6) reflejan su mayor participación según la bitácora; la de Francisco corresponde a las etapas 7–9 |
| 9 | Nombres y matrículas | Lesly Adamaris Cotlame Nieto 2226958, Christopher Bethancourt Contreras 2226948 y Francisco Mora Ruiz 2226912, iguales en todos los documentos |
| 10 | Cifras de pruebas y cobertura | 1,787 / 98.12 % / 93.36 % / 97.3 % coinciden en el reporte, la presentación, los manuales, el README y los informes de calidad, y con `coverage_CI_42268272652_1dfcfdd.json` |
| 11 | Sin contraseñas, tokens, secretos, cookies ni cadenas de conexión | Revisión del diff sin hallazgos; `.env.example` tiene solo valores ficticios; `.env` sigue en `.gitignore` y no forma parte de los cambios |
| 12 | README | Incluye instalación, creación de `.env` desde `.env.example`, Docker Compose, pruebas, cobertura, CI/CD, migraciones, acceso, Swagger, URL y la sección final «Enlaces del proyecto y demostración» |

Otras validaciones:
- Todos los DOCX y el PPTX generados pasan la validación de esquema OOXML.
- Las pruebas que leen documentación y pueden ejecutarse sin dependencias (`test_render_blueprint`, `test_brd_markdown`, `test_coherencia_diagramas`, `test_auditoria_requisitos`) aprueban.
- Las que importan la aplicación (FastAPI, SQLAlchemy, argon2) no pueden ejecutarse en este entorno. Sus archivos de entrada (`docs/api/openapi.json`, `docs/BRD.md`, matrices de trazabilidad) no se modificaron y son los mismos con los que aprobó la CI `42268272652`.

## 3. Archivos

### Nuevos
- `docs/entrega_final/REPORTE_FINAL_PIA_EVENTOS_NOVA.docx` y `.pdf`
- `docs/entrega_final/PRESENTACION_FINAL_PIA_EVENTOS_NOVA.pptx` y `.pdf`
- `docs/architecture/definitivo/Diagramas_BPMN_Eventos_Nova.docx` y `.pdf`
- `docs/architecture/definitivo/Diagramas_Clases_Eventos_Nova.docx`
- `docs/architecture/definitivo/Diagramas_Secuencia_Eventos_Nova.docx`
- `docs/calidad/evidencias/01_…` a `11_…`: evidencias del paquete corregido, más:
  - `05_CI_CD_FINAL/coverage_CI_42268272652_1dfcfdd.json`
  - `09_DOCKER_COMPOSE_LOCAL/`
  - `10_GITHUB/`
  - `11_PRODUCCION_SIN_SESION/`
- `docs/documentacion_final/INFORME_VERIFICACION_DOCUMENTAL_20261106.md` (este informe)

### Modificados
- Raíz: `README.md`, `.env.example`.
- Manuales en `docs/manuales/`:
  - Usuario, Instalación y Técnico (reescritos), en DOCX y PDF.
  - Seguridad, Entrega Continua, Integración Continua y Repositorio GitHub (actualizados), en DOCX y PDF.
  - `DOCKER_COMPOSE_Y_VARIABLES.md`, `GUIA_DESPLIEGUE_RENDER.md` y `ESTRUCTURA_REPOSITORIO.txt`.
- Arquitectura:
  - `docs/ADR/Registro_ADR_Eventos_Nova.*`, ahora en vertical.
  - `docs/architecture/definitivo/Decisiones_Tecnicas_Eventos_Nova.*`.
  - `Modelo_Relacional_Eventos_Nova.*` (solo la fecha).
  - `Diagramas_Clases_Eventos_Nova.pdf` y `Diagramas_Secuencia_Eventos_Nova.pdf`.
  - `docs/architecture/ci-cd-y-despliegue.md`.
- API: `docs/api/Documentacion_API_Eventos_Nova.*`.
- Calidad en `docs/calidad/`:
  - `Informe_General_Pruebas_Eventos_Nova.*` y `Guia_Pruebas_Manuales_Eventos_Nova.*`.
  - `MATRIZ_PRUEBAS_DESPLIEGUE_RENDER.md`.
  - `cobertura/Reporte_Cobertura_Eventos_Nova.*` y `cobertura/VERIFICACION_COBERTURA.md`.
  - `evidencias/INDICE_EVIDENCIAS.md` y `.xlsx`.
- Control documental: `docs/documentacion_final/LEEME.md` y `REGISTRO_DE_CAMBIOS.md`.

### Retirados (con respaldo)
- `docs/entrega_final/Reporte_Final_PIA_Eventos_Nova.*` y `Presentacion_Defensa_PIA_Eventos_Nova.*`, sustituidos por las versiones finales.
- `docs/calidad/evidencias/05_PRUEBAS_MANUALES/`, `06_CI_CD/` y `07_DESPLIEGUE/`: solo contenían `LEEME_PENDIENTE.md`.
- `docs/trazabilidad/matriz-trazabilidad.pdf`: era una exportación apaisada. Se conservan `matriz-trazabilidad.xlsx` (la usan las pruebas) y `Matriz_Trazabilidad_Eventos_Nova.*`.
- Las tres mediciones de `01_AUTOMATIZADAS_MEDICION_20261103/` se movieron a `01_MEDICION_AUTOMATIZADA_HISTORICA_20261103/`.

### Conservados sin cambios
- Código y configuración: `src/`, `tests/`, `alembic/`, `.github/workflows/` (incluido `publicar-imagen.yml`, que no se ejecutó), `Dockerfile`, `docker-compose.yml`, `render.yaml`, `requirements*.txt`, `.coveragerc` y `.gitignore`.
- Documentación usada por las pruebas: `docs/BRD.md`, `docs/api/openapi.json`, `trazabilidad-api-persistencia.md`, `INTERFAZ_WEB_COBERTURA.md`, `auditoria-requisitos-fase-final.md` y el resto de `docs/trazabilidad/`.
- Registros de auditoría con fecha (`CIERRE_AUDITORIA_FINAL.md`, `PROGRESO_FASE_FINAL.md`, `auditoria-final-pia.md`). Describen el estado del 25–30/10/2026, cuando aún no existían el repositorio remoto, la CI ni el despliegue. Se conservan como historial y su estado lo sustituyen este informe y el reporte final.

## 4. Observaciones

- **Captura de `GET /usuarios`.** No hay una captura que muestre la sesión del rol coordinador. La captura de `GET /usuarios` se renombró y se describe como consulta del administrador, porque la operación exige `usuarios.administrar`. Los permisos del coordinador están verificados con `test_seguridad`.
- **Nombre del docente.** Los documentos usan «Miguel Ángel Gómez Marroquín», como todo el material del proyecto. El PDF oficial de la actividad aparece firmado por Ing. Rogelio G. Garza Rivera. Se recomienda que el equipo confirme el nombre antes de entregar.
- **Acciones no realizadas.** No se escribió en producción. No se crearon eventos. No se ejecutó `publicar-imagen.yml`. No se publicaron imágenes en GHCR. No se crearon tags, commits ni push.
- **Respaldos.** Copia de cada archivo reemplazado o retirado en `RESPALDOS_20261106/` del paquete de entrega, con la misma ruta relativa.

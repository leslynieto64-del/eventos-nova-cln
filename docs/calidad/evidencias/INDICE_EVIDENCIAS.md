# Índice de evidencias — Eventos Nova

Actualizado el 06/11/2026 a partir de los archivos presentes en esta carpeta. Cada evidencia indica su entorno; los resultados locales, de CI y de producción no son intercambiables. No se agregaron capturas ficticias ni se rellenaron carpetas vacías. Las capturas con sesión están redactadas: no muestran contraseñas, tokens, cookies, valores CSRF ni cadenas de conexión.

## Resultados finales documentados

- **CI:** GitHub Actions, ejecución `42268272652`, commit `1dfcfdd` en `main`, estado `Success`, dos trabajos aprobados; 1,787 pruebas (omitidas: 1 en «pruebas» y 9 en «docker»); sentencias 98.12 % (6,751/6,880), ramas 93.36 % (1,378/1,476), combinada 97.3 %.
- **Docker Compose local:** configuración válida; `db` y `api` healthy; `/ready` 200; 1,787 pruebas aprobadas y 9 omitidas contra `eventosnova_test`. No se ejecutó `migrate` ni un `up` completo en esa sesión; el worker tuvo 3 reinicios transitorios al arrancar y luego quedó estable.
- **Render:** `eventosnova-api` y `eventosnova-worker` Live con `1dfcfdd`; dominio <https://eventosnova-api.onrender.com>; Swagger, ReDoc, OpenAPI, `/health` y `/ready` disponibles.
- **PostgreSQL / Outbox:** consulta de solo lectura con 9 eventos `PROCESADO` y 0 pendientes en el momento de la consulta. Los registros del worker con 0 eventos procesados corresponden a cierres de instancias concretas; no se afirma procesamiento continuo.

## Carpetas

| Carpeta | Entorno | Vigencia | Contenido | Archivos |
|---|---|---|---|---:|
| `01_MEDICION_AUTOMATIZADA_HISTORICA_20261103/` | Local (Windows + PostgreSQL 18.6) | Histórico | Medición automatizada del 03/11/2026: 1,654 pruebas en 8 grupos; 98.19 % de líneas y 93.20 % de ramas. Se conserva para trazabilidad; no es el resultado final. | 13 |
| `02_INTERFAZ_CAPTURAS_AUTOMATICAS/` | Local (captura automatizada) | Complementaria | Capturas automáticas de la interfaz: ingreso, paneles, diálogos y menú móvil. No sustituyen pruebas manuales. | 8 |
| `03_PAQUETE_OFICIAL_F2/` | Local (ejecutor del paquete) | Vigente | Resultados del paquete oficial 16_Eventos_Nova: 60 operaciones, 120 casos y 20 transiciones. | 6 |
| `04_PRUEBAS_MANUALES_SWAGGER/` | Producción (Swagger UI) | Vigente | Pruebas selectivas de solo lectura en producción: Swagger, health, ready, 401, sesiones de administrador y proveedor, asignaciones y 403. | 11 |
| `05_CI_CD_FINAL/` | CI (GitHub Actions) | Vigente + histórico separado | Ejecución final 42268272652 sobre 1dfcfdd y su coverage.json; material anterior en HISTORICO_NO_USAR_COMO_FINAL/. | 18 |
| `06_DESPLIEGUE_RENDER/` | Render | Vigente | API y worker Live con 1dfcfdd, dominio público, despliegue del worker, registros y acceso a la aplicación. | 8 |
| `07_BLOQUE_A_CHROME/` | Chrome, entorno manual local (127.0.0.1:8001) | Vigente | Recorrido del Bloque A: cuentas, pago, cambio y vista del proveedor en escritorio y móvil. | 6 |
| `08_BASE_DE_DATOS_POSTGRESQL/` | PostgreSQL de producción (Render Shell, solo lectura) | Vigente | Migraciones, usuario sin superusuario y estado del Outbox. | 7 |
| `09_DOCKER_COMPOSE_LOCAL/` | Local (Docker Desktop) | Vigente | Configuración, servicios, /ready y suite completa en contenedor contra eventosnova_test. | 2 |
| `10_GITHUB/` | GitHub | Vigente | Pull requests #1 a #8 fusionadas y commits de main con 1dfcfdd a la cabeza. | 2 |
| `11_PRODUCCION_SIN_SESION/` | Producción (captura automatizada sin sesión) | Complementaria | ReDoc publicado en producción (solo GET). | 1 |

## Archivos

### 01_MEDICION_AUTOMATIZADA_HISTORICA_20261103

| Archivo | Qué demuestra | Uso |
|---|---|---|
| `LEEME_HISTORICO.md` | Explica por qué la medición es histórica. | Índice de evidencias |
| `cobertura_grupo1.txt` | Registro de cobertura del grupo 1 (histórico; renombrado de .log a .txt para versionarlo). | Índice de evidencias |
| `cobertura_grupo2.txt` | Registro de cobertura del grupo 2 (histórico; renombrado de .log a .txt para versionarlo). | Índice de evidencias |
| `cobertura_grupo3.txt` | Registro de cobertura del grupo 3 (histórico; renombrado de .log a .txt para versionarlo). | Índice de evidencias |
| `cobertura_grupo4.txt` | Registro de cobertura del grupo 4 (histórico; renombrado de .log a .txt para versionarlo). | Índice de evidencias |
| `cobertura_grupo5.txt` | Registro de cobertura del grupo 5 (histórico; renombrado de .log a .txt para versionarlo). | Índice de evidencias |
| `cobertura_grupo6.txt` | Registro de cobertura del grupo 6 (histórico; renombrado de .log a .txt para versionarlo). | Índice de evidencias |
| `cobertura_grupo7.txt` | Registro de cobertura del grupo 7 (histórico; renombrado de .log a .txt para versionarlo). | Índice de evidencias |
| `cobertura_grupo8.txt` | Registro de cobertura del grupo 8 (histórico; renombrado de .log a .txt para versionarlo). | Índice de evidencias |
| `coverage.json` | Artefacto de cobertura de la medición del 03/11/2026 (histórico). | Índice de evidencias |
| `coverage_reporte.txt` | Salida de coverage report de la medición histórica. | Índice de evidencias |
| `coverage_verificacion_80.txt` | Verificación del umbral de 80 % de la medición histórica. | Índice de evidencias |
| `ejecucion_consola.txt` | Consola de la ejecución por grupos (1,654 pruebas). | Índice de evidencias |

### 02_INTERFAZ_CAPTURAS_AUTOMATICAS

| Archivo | Qué demuestra | Uso |
|---|---|---|
| `NOTA_EVIDENCIA.md` | Alcance de las capturas automáticas. | Índice de evidencias |
| `README_original.md` | Descripción original del paquete de capturas. | Índice de evidencias |
| `auto_admin_panel_1440.png` | Panel del administrador a 1440 px. | Manual de usuario |
| `auto_coord_panel_1440.png` | Panel del coordinador a 1440 px. | Manual de usuario |
| `auto_dialogo_confirmacion_390.png` | Diálogo de confirmación en móvil (390 px). | Índice de evidencias |
| `auto_dialogo_validacion_320.png` | Diálogo de validación en móvil (320 px). | Índice de evidencias |
| `auto_login_1440.png` | Pantalla de ingreso a 1440 px. | Índice de evidencias |
| `auto_menu_abierto_390.png` | Menú móvil abierto (390 px). | Índice de evidencias |

### 03_PAQUETE_OFICIAL_F2

| Archivo | Qué demuestra | Uso |
|---|---|---|
| `casos_resultados.csv` | 120 casos: todos APROBADOS. | Índice de evidencias |
| `diferencias_modelo.csv` | Diferencias documentadas entre el paquete y el modelo. | Índice de evidencias |
| `mapeo_estados_acciones.csv` | Mapeo de estados y acciones del paquete al dominio. | Índice de evidencias |
| `resumen.md` | Resumen: 60 operaciones coinciden con el oráculo; 19 de 20 transiciones APROBADAS y 1 NO_EJECUTABLE. | Índice de evidencias |
| `totales_operaciones.csv` | Totales de las 60 operaciones. | Índice de evidencias |
| `transiciones_resultados.csv` | Resultado de las 20 transiciones. | Índice de evidencias |

### 04_PRUEBAS_MANUALES_SWAGGER

| Archivo | Qué demuestra | Uso |
|---|---|---|
| `01_Swagger_Produccion.png` | Swagger UI disponible en producción (/docs). | Reporte §12; presentación; manual de usuario |
| `02_Health_200.png` | GET /health respondió 200. | Índice de evidencias |
| `03_Ready_200.png` | GET /ready respondió 200 (distinto de /health: verifica la base). | Reporte §19 |
| `04_Auth_Sin_Sesion_401.png` | GET /auth/yo sin sesión respondió 401. | Reporte §15 |
| `05_Administrador_Auth_200_REDACTADO.png` | GET /auth/yo con rol administrador y 12 permisos; datos personales ocultos. | Reporte §15 |
| `06_GET_Usuarios_200_REDACTADO.png` | GET /usuarios 200 con 3 usuarios (cuerpo oculto). Requiere usuarios.administrar; no demuestra el rol coordinador. | Índice de evidencias |
| `07_Proveedor_Auth_200_REDACTADO.png` | GET /auth/yo con rol proveedor (proveedores.propios y proveedores.responder). | Reporte §15 |
| `08_Proveedor_Mis_Asignaciones_200.png` | GET /mis-asignaciones 200: Banquete del evento [DEMO] pendiente de confirmación, respuesta nula. | Reporte §15; presentación |
| `09_Proveedor_Catalogo_403.png` | GET /proveedores con el proveedor: 403 esperado. | Reporte §15; presentación |
| `NOTAS_PRUEBAS.md` | Notas de las pruebas en Swagger. | Índice de evidencias |
| `referencias/Proveedores_Catalogo_Endpoints.png` | Mapa de endpoints del catálogo (referencia, no ejecución). | Índice de evidencias |

### 05_CI_CD_FINAL

| Archivo | Qué demuestra | Uso |
|---|---|---|
| `01_CI_Run_42268272652_Commit_1dfcfdd.png` | Resumen de la ejecución final: Success, dos jobs verdes; 2 anotaciones de la prueba que simula un fallo. | Reporte §17; presentación |
| `02_CI_Pruebas_1787_OK_1_Skip.png` | Job de pruebas: Ran 1787 tests, OK (skipped=1). | Reporte §17 |
| `03_CI_Cobertura_98_12_93_36.png` | Cobertura: sentencias 98.12 %, ramas 93.36 %, cumple 80 %. | Reporte §16 |
| `04_CI_Docker_Compose_Exitoso.png` | Job Docker Compose (DB + App + Tests) exitoso. | Reporte §17 |
| `05_CI_Workflow_ci_yml.png` | Archivo .github/workflows/ci.yml en main (configuración). | Índice de evidencias |
| `HISTORICO_NO_USAR_COMO_FINAL/GH-01B_commit_integracion_PR006.png` | Material histórico de PR #6 / commit 7ce5329; no es el resultado final. | Índice de evidencias |
| `HISTORICO_NO_USAR_COMO_FINAL/GH-01_repositorio_main_7ce5329.png` | Material histórico de PR #6 / commit 7ce5329; no es el resultado final. | Índice de evidencias |
| `HISTORICO_NO_USAR_COMO_FINAL/GH-02_PR006_fusionada.png` | Material histórico de PR #6 / commit 7ce5329; no es el resultado final. | Índice de evidencias |
| `HISTORICO_NO_USAR_COMO_FINAL/GH-03_PR006_diff_app_css.png` | Material histórico de PR #6 / commit 7ce5329; no es el resultado final. | Índice de evidencias |
| `HISTORICO_NO_USAR_COMO_FINAL/GH-04_PR006_checks_verdes.png` | Material histórico de PR #6 / commit 7ce5329; no es el resultado final. | Índice de evidencias |
| `HISTORICO_NO_USAR_COMO_FINAL/GH-05_CI_main_7ce5329.png` | Material histórico de PR #6 / commit 7ce5329; no es el resultado final. | Índice de evidencias |
| `HISTORICO_NO_USAR_COMO_FINAL/GH-06_CI_job_pruebas.png` | Material histórico de PR #6 / commit 7ce5329; no es el resultado final. | Índice de evidencias |
| `HISTORICO_NO_USAR_COMO_FINAL/GH-07_CI_job_docker_compose.png` | Material histórico de PR #6 / commit 7ce5329; no es el resultado final. | Índice de evidencias |
| `HISTORICO_NO_USAR_COMO_FINAL/GH-08_CI_coverage_resumen.png` | Material histórico de PR #6 / commit 7ce5329; no es el resultado final. | Índice de evidencias |
| `HISTORICO_NO_USAR_COMO_FINAL/GH-10_coverage.json` | Material histórico de PR #6 / commit 7ce5329; no es el resultado final. | Índice de evidencias |
| `HISTORICO_NO_USAR_COMO_FINAL/LEEME.md` | Explica el material histórico de CI. | Índice de evidencias |
| `NOTAS_CI_FINAL.md` | Notas de la ejecución final. | Índice de evidencias |
| `coverage_CI_42268272652_1dfcfdd.json` | Artefacto cobertura de la ejecución final: 6,751/6,880 sentencias y 1,378/1,476 ramas. | Índice de evidencias |

### 06_DESPLIEGUE_RENDER

| Archivo | Qué demuestra | Uso |
|---|---|---|
| `01_Render_API_Estado_Live_1dfcfdd.png` | eventosnova-api Live con 1dfcfdd y lista de despliegues. | Reporte §19; presentación; manual de instalación |
| `02_Render_Dominio_Publico.png` | Dominio público https://eventosnova-api.onrender.com. | Reporte §19 |
| `03_Render_Worker_Estado_Live_1dfcfdd.png` | eventosnova-worker Live con 1dfcfdd. | Reporte §19; presentación |
| `04_Render_Deploy_Worker_Success_1dfcfdd.png` | Despliegue del worker de 1dfcfdd: Deploy succeeded. | Índice de evidencias |
| `05_Render_Logs_API_Ready_200.png` | Registros de la API: GET /ready 200. | Reporte §19 |
| `06_Render_Logs_Worker_Ciclos_0_Procesados.png` | Registros del worker: arranques y resúmenes de cierre de instancia con 0 eventos procesados. | Reporte §19 |
| `07_Aplicacion_Produccion_Login.png` | La aplicación /app/ abre en producción con la pantalla de ingreso. | Reporte §19; presentación; manual de usuario |
| `NOTAS_DESPLIEGUE.md` | Notas del despliegue. | Índice de evidencias |

### 07_BLOQUE_A_CHROME

| Archivo | Qué demuestra | Uso |
|---|---|---|
| `01_cuentas_busqueda_y_filtros_1440.png` | COR-13: búsqueda y filtros de cuentas. | Reporte §10.2; manual de usuario |
| `02_pago_advertencia_importe_superior_al_saldo_1440.png` | COR-07: advertencia de importe superior al saldo. | Reporte §10.2; manual de usuario |
| `03_cambio_precarga_datos_del_evento_1440.png` | COR-16: precarga de datos del evento en el cambio. | Manual de usuario |
| `04_proveedor_sin_condiciones_comerciales_1440.png` | COR-05: vista del proveedor sin condiciones (escritorio). | Reporte §10.2; manual de usuario |
| `05_proveedor_sin_condiciones_comerciales_390.png` | COR-05 en móvil (390 px); complementaria. | Índice de evidencias |
| `NOTA_BLOQUE_A.md` | Alcance de las capturas del Bloque A. | Índice de evidencias |

### 08_BASE_DE_DATOS_POSTGRESQL

| Archivo | Qué demuestra | Uso |
|---|---|---|
| `001_alembic_current.png` | alembic current: 0009 (head). | Reporte §13; presentación |
| `002_alembic_heads.png` | alembic heads: una sola cabeza 0009. | Manual técnico §8 |
| `003_database_user.png` | Base y usuario actuales: eventosnova / eventosnova. | Índice de evidencias |
| `004_no_superuser.png` | pg_roles: el usuario no es superusuario. | Reporte §13 |
| `005_outbox_procesado.png` | Tablas outbox_evento y outbox_reaccion; PROCESADO: 9. | Índice de evidencias |
| `06_Outbox_9_Procesados_0_Pendientes_ReadOnly.png` | Transacción READ ONLY: 9 PROCESADO y 0 pendientes en la consulta. | Reporte §13; presentación |
| `NOTAS_POSTGRESQL.md` | Notas de las consultas de solo lectura. | Índice de evidencias |

### 09_DOCKER_COMPOSE_LOCAL

| Archivo | Qué demuestra | Uso |
|---|---|---|
| `compose_tests_20261106.txt` | Registro completo de docker compose run --rm --build tests. | Índice de evidencias |
| `docker_compose_20261106.txt` | config válida; db y api healthy; /ready 200; 1,787 OK y 9 omitidas; nota del worker. | Reporte §18 |

### 10_GITHUB

| Archivo | Qué demuestra | Uso |
|---|---|---|
| `02_github_prs_fusionadas_20261106.png` | PR #1 a #8 cerradas y fusionadas, 2/2 checks. | Reporte §17 |
| `03_github_commits_main_20261106.png` | Commits de main con 1dfcfdd a la cabeza. | Índice de evidencias |

### 11_PRODUCCION_SIN_SESION

| Archivo | Qué demuestra | Uso |
|---|---|---|
| `07-02_redoc_produccion_20261106.png` | ReDoc en producción (GET sin sesión). | Reporte §12 |

## Decisiones sobre el paquete

1. `06_Coordinador_GET_Usuarios_200_REDACTADO.png` se renombró a `06_GET_Usuarios_200_REDACTADO.png`: la operación exige `usuarios.administrar` (solo administrador) y la captura no muestra el rol; los permisos del coordinador están verificados por `test_seguridad`.
2. La captura de *Secrets and variables* con `DEPLOY_HOOK_URL` no se incluye: no demuestra un requisito y el secreto no debe mostrarse.
3. `/health` y `/ready` se conservan por separado porque son operaciones distintas.
4. Las capturas automatizadas sin sesión del 06/11/2026 de `/docs`, `/health`, `/ready` y `/app/` no se incluyen porque duplican las capturas de Chrome; se incluye solo ReDoc.
5. La captura de CI del 06/11/2026 tomada por la herramienta duplicaba `05_CI_CD_FINAL/01_…`; no se incluye.
6. Los registros `cobertura_grupoN.log` se renombraron a `.txt` porque `.gitignore` excluye `*.log`; su contenido no cambió.
7. Las dos anotaciones «fallo técnico simulado» del CI las escribe a propósito `tests/test_d3_llegada_de_t.py` (línea 174).

El inventario con SHA-256 de cada archivo está en `INDICE_EVIDENCIAS.xlsx`.

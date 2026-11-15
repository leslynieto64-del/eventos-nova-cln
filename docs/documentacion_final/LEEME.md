# Eventos Nova — Documentación final del PIA

Equipo 16 · Componentes de Lógica de Negocios · Prof. Miguel Ángel Gómez Marroquín  
Lesly Adamaris Cotlame Nieto (2226958) · Christopher Bethancourt Contreras (2226948) · Francisco Mora Ruiz (2226912)

Entrega oficial del PIA: 06/11/2026. Repositorio: <https://github.com/leslynieto64-del/eventos-nova-cln> (`main` en `1dfcfdd`, 60 commits, PR #1 a #8 fusionadas). Sistema desplegado: <https://eventosnova-api.onrender.com/app> (Swagger UI en `/docs`).

## Documentos finales

| Área | Documento | Ubicación |
|---|---|---|
| Entrega | Reporte final del PIA (DOCX y PDF) | `docs/entrega_final/REPORTE_FINAL_PIA_EVENTOS_NOVA.*` |
| Entrega | Presentación final (PPTX y PDF, 20 diapositivas 16:9) | `docs/entrega_final/PRESENTACION_FINAL_PIA_EVENTOS_NOVA.*` |
| Análisis | BRD, historias de usuario, especificación Gherkin (10 `.feature`), glosario | `docs/analisis/`, `docs/BRD.md` |
| Análisis | Procesos BPMN SP01 a SP10 en páginas verticales | `docs/architecture/definitivo/Diagramas_BPMN_Eventos_Nova.*` |
| Arquitectura | Registro de ADR y ADR-001 a ADR-011 | `docs/ADR/` |
| Arquitectura | Decisiones técnicas, patrones y SOLID, modelo relacional | `docs/architecture/definitivo/` |
| Arquitectura | Diagramas de clases y de secuencia en páginas verticales | `docs/architecture/definitivo/Diagramas_Clases_Eventos_Nova.*`, `Diagramas_Secuencia_Eventos_Nova.*` |
| API | OpenAPI, catálogo de operaciones y documentación de la API | `docs/api/` |
| Calidad | Informe general de pruebas, cobertura, guía de pruebas manuales, matriz de permisos, matriz de pruebas en Render | `docs/calidad/` |
| Evidencias | Índice de evidencias (Markdown y Excel) y 11 carpetas por entorno | `docs/calidad/evidencias/` |
| Manuales | Usuario, instalación, técnico, integración continua, entrega continua, seguridad, repositorio | `docs/manuales/` |
| Trazabilidad | Matriz de trazabilidad y auditorías | `docs/trazabilidad/` |

Todos los documentos DOCX y PDF del reporte, los manuales y la documentación técnica están en orientación vertical; la presentación es 16:9.

## Resultados técnicos de referencia

| Resultado | Valor |
|---|---|
| CI de GitHub Actions | Ejecución 42268272652 sobre `1dfcfdd`: dos trabajos aprobados; 1,787 pruebas (omitidas 1 y 9) |
| Cobertura | Sentencias 98.12 % (6,751/6,880), ramas 93.36 % (1,378/1,476), combinada 97.3 % |
| Docker Compose local | Configuración válida; `db` y `api` healthy; `/ready` 200; 1,787 aprobadas y 9 omitidas contra `eventosnova_test` |
| Render | `eventosnova-api` y `eventosnova-worker` Live con `1dfcfdd` |
| PostgreSQL de producción | `alembic current` 0009 (head); usuario sin superusuario; Outbox con 9 procesados y 0 pendientes en la consulta |

## Alcance no comprobado en producción

En producción solo se ejecutaron consultas: no hay escrituras, la asignación de CL-DEMO-02 se reserva para la demostración en vivo, no hay captura de una sesión con rol coordinador y no se afirma procesamiento continuo del worker. Los casos manuales de la interfaz web están documentados como procedimiento en la guía de pruebas manuales; las comprobaciones de interfaz registradas son el recorrido automatizado del Bloque A en Chrome (30/30, 3 repeticiones) y las capturas automáticas.

El historial de cambios documentales está en [`REGISTRO_DE_CAMBIOS.md`](REGISTRO_DE_CAMBIOS.md).

- [Informe final de verificación documental (06/11/2026)](INFORME_VERIFICACION_DOCUMENTAL_20261106.md)

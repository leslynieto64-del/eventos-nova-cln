# Borrador: actualización de los documentos finales (NO es la versión definitiva)

Preparado el 06/11/2026. Las versiones finales **no se generan** hasta contar con las capturas de producción pendientes (`docs/INFORME_CIERRE_PIA_20261106.md`, secciones 2.1 y 6). Datos ya verificables y listos para incorporar:

## Datos verificados que deben aparecer en todos los documentos
- Repositorio: https://github.com/leslynieto64-del/eventos-nova-cln (público, `main`, 60 commits, PR #1 a #8 fusionadas).
- Aplicación: https://eventosnova-api.onrender.com/app/ · Swagger: …/docs · ReDoc: …/redoc · OpenAPI: …/openapi.json · Salud: …/health y …/ready.
- Commit desplegado: `1dfcfdd` (GitHub registra `success` en API y Worker). Render: región Ohio; `eventosnova-api`, `eventosnova-worker`, `eventosnova-db` (PostgreSQL).
- CI (run 42268272652): 2 trabajos aprobados; 1,787 pruebas; sentencias 98.12 % (6,751/6,880), ramas 93.36 % (1,378/1,476), combinado 97.3 %; mínimo 80 % sobre sentencias.
- Docker Compose local (06/11): 1,787 pruebas OK (9 omitidas) en contenedor.
- API: 77 operaciones (19 GET, 58 POST), OpenAPI 3.1; mensajes de resultado en español (`X-Mensaje`); Swagger con token CSRF automático.

## Por documento
| Documento | Qué actualizar | Depende de evidencia pendiente |
|---|---|---|
| Reporte final PDF (`docs/entrega/Reporte_Final_PIA_Eventos_Nova.pdf`, del 29/10) | Sección de producción (URL, Render, Swagger), CI y cobertura vigentes, PR #3 a #8, capturas numeradas, conclusiones; quitar toda mención de «sin despliegue» | Sí: capturas con sesión por rol, Worker/Outbox, CL-DEMO |
| Presentación (`Presentacion_Defensa_Eventos_Nova.pptx`) | Diapositivas de despliegue, Swagger y demostración con URL reales; cifras de CI | Sí: capturas |
| Manual técnico y manual de instalación | Variables de entorno de producción (`EVENTOSNOVA_ENTORNO`, `EVENTOSNOVA_DOCS`, `FORWARDED_ALLOW_IPS`), `render.yaml`, `preDeployCommand`, Compose | No (datos ya verificados) |
| Manual de usuario | Acceso a la aplicación desplegada y a Swagger (inicia sesión en `/app/`, luego `/docs`) | Capturas por rol |
| Documentación de API (`docs/api/Documentacion_API_…`) | Confirmar 77 operaciones, esquema de seguridad `SesionCookie` y CSRF | No |
| Documentos de arquitectura y ADR | Añadir una decisión sobre el aviso de resultado (`X-Mensaje`) y el interceptor CSRF de Swagger (PR #7 y #8), si el equipo lo aprueba | No |
| `docs/REPORTE_FINAL_DESPLIEGUE_RENDER.md` | Pendiente de su aprobación; se alimentará con Worker/Outbox | Sí |
| Todos los PDF/DOCX con la URL antigua del repositorio | Regenerar con la URL canónica | No |

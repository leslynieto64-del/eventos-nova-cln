# Evidencias PostgreSQL y Outbox

- Las capturas 01–04 muestran comprobaciones de Alembic, conexión/usuario y privilegios en el entorno de Render.
- `05_outbox_procesado.png` muestra inspección de las tablas de Outbox y el total de 9 registros `PROCESADO`.
- `06_Outbox_9_Procesados_0_Pendientes_ReadOnly.png` muestra una consulta de solo lectura que agrupa por estado y consulta pendientes: resultado visible `PROCESADO: 9` y `TOTAL DE EVENTOS PENDIENTES: 0`.
- No se ejecutaron INSERT, UPDATE ni DELETE para obtener estas cifras. El conteo representa el estado al momento de la consulta y no prueba que el Worker procese eventos continuamente.

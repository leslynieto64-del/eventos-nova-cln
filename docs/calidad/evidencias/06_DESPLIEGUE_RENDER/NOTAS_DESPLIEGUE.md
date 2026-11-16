# Evidencias de despliegue en Render

- La API se muestra `Live` y asociada al commit `1dfcfdd`; el dominio público es `https://eventosnova-api.onrender.com`.
- El Worker se muestra `Live` y su deploy más reciente en la captura corresponde al commit `1dfcfdd`.
- Los logs de API muestran solicitudes GET `/ready` con HTTP 200.
- Los logs del Worker muestran arranques del servicio y el mensaje `Trabajador detenido; eventos procesados: 0` justo antes de cada `Deploying…`: es el resumen de cierre de una instancia sustituida por un despliegue e indica que esa instancia no procesó eventos. No demuestra procesamiento continuo ni un fallo.
- El estado acumulado de Outbox al momento de la consulta de solo lectura se documenta por separado en `08_BASE_DE_DATOS_POSTGRESQL/06_Outbox_9_Procesados_0_Pendientes_ReadOnly.png`: 9 procesados y 0 pendientes. Esto puede coexistir con ciclos posteriores que no procesaron eventos nuevos.

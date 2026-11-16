# Pruebas manuales seleccionadas en Swagger

- `02_Health_200.png` demuestra GET `/health` con HTTP 200.
- `03_Ready_200.png` demuestra GET `/ready` con HTTP 200. No son duplicadas.
- `04_Auth_Sin_Sesion_401.png` demuestra HTTP 401 en `/auth/yo` sin sesión.
- `05_Administrador_Auth_200_REDACTADO.png` muestra `/auth/yo` exitoso y el rol administrador.
- `06_GET_Usuarios_200_REDACTADO.png` (antes `06_Coordinador_GET_Usuarios_200_REDACTADO.png`) muestra GET `/usuarios` con HTTP 200 y 3 usuarios; el cuerpo se ocultó por privacidad. La operación exige el permiso `usuarios.administrar`, que solo tiene el administrador, y la captura no muestra el rol de la sesión: no se usa como evidencia del rol coordinador.
- `07_Proveedor_Auth_200_REDACTADO.png` muestra `/auth/yo` exitoso y el rol proveedor; se ocultaron identificadores, correo y valores CSRF.
- `08_Proveedor_Mis_Asignaciones_200.png` muestra GET `/mis-asignaciones` con HTTP 200 y un resultado. No afirmar que el identificador CL-DEMO-02 aparece en esta imagen, porque no es legible/visible en la captura.
- `09_Proveedor_Catalogo_403.png` muestra que el proveedor no tiene permiso para consultar el catálogo general. HTTP 403 es el resultado esperado de esta restricción, no una falla de la prueba.
- `referencias/Proveedores_Catalogo_Endpoints.png` es un mapa de endpoints del catálogo, no una ejecución.

Las capturas de roles se prepararon como copias seguras para compartir: se ocultaron identificadores, correos, nombres o tokens sensibles cuando estaban visibles.

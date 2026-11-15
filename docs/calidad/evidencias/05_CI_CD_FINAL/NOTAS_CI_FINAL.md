# Evidencias del CI final

- Ejecución GitHub Actions: run `42268272652`, commit `1dfcfdd`, rama `main`, estado global `Success`. Los dos jobs aparecen verdes.
- Pruebas: el log muestra `Ran 1787 tests` y `OK (skipped=1)`. Por precisión, documentar 1,787 ejecutadas y 1 omitida.
- Cobertura del run: sentencias 98.12 % (6,751/6,880), ramas 93.36 % (1,378/1,476), total mostrado 97.3 %.
- Docker Compose (DB + App + Tests): el job aparece como `succeeded` y lista validación de docker-compose, construcción de imágenes, suite dentro de Docker y levantamiento de DB/migraciones/API/Worker.
- La captura general muestra 2 anotaciones de error con el texto `fallo técnico simulado`. Las escribe a propósito la prueba `tests/test_d3_llegada_de_t.py` (línea 174), que simula un fallo con `mock` para comprobar la recuperación del trabajador; no son fallos del CI. El estado global es Success y los dos jobs están verdes.
- `05_CI_Workflow_ci_yml.png` documenta el archivo de workflow en `main`; no es un resultado de ejecución.
- `coverage_CI_42268272652_1dfcfdd.json` es el artefacto `cobertura` de esa ejecución.
- Job «Docker Compose»: 1,787 pruebas con 9 omitidas (pruebas de navegador que requieren Node.js o Chrome).

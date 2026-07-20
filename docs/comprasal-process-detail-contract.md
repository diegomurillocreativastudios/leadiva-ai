# Contrato observado: detalle de proceso público COMPRASAL

Fuente consultada una sola vez el 19 de julio de 2026:

`GET /api/v1/publico/obtener/detalle/procesos/publicos/135317`

La respuesta fue HTTP 200 con `content-type: application/json; charset=utf-8`.
La fixture conserva la forma y los tipos observados, pero sustituye el nombre
del proceso, la institución y los códigos por valores de ejemplo.

## Raíz y datos generales

La raíz es `{ data, message }`. `message` fue
`Detalle de proceso público cargado correctamente.` y `data` fue un objeto con:

- identificadores numéricos `id`, `id_tipo_proceso` e `id_institucion`;
- `codigo_proceso`, `codigo_interno`, `nombre_proceso` y `version`;
- `fecha_inicio_proceso` y `fecha_contratacion` como fechas civiles `YYYY-MM-DD`;
- `created_at` y `fecha_publicacion` como timestamps ISO 8601 UTC con `Z`;
- `fecha_adjudicacion` y `monto_adjudicado` en `null`;
- `proceso_publico` booleano;
- objetos `Institucion`, `SeguimientoProceso`, `FormaContratacion` y
  `EstadoProceso`;
- el array `EtapaPorProcesos`.

## Etapas del PIP

`data.EtapaPorProcesos` contuvo 15 etapas. Cada fila tuvo exactamente los
campos utilizados por el PIP:

- `id`: entero positivo;
- `nombre`: string;
- `fecha_hora_inicio`: timestamp ISO 8601 con zona o `null`;
- `fecha_hora_fin`: timestamp ISO 8601 con zona o `null`.

No se observó un campo de orden, duración oficial o estado por etapa. Una etapa
tenía ambas fechas en `null`. El array no estaba ordenado cronológicamente:
`Emisión de adendas`, con fecha de julio, aparecía después de etapas de agosto.

## Comparación con el snapshot disponible

Las filas de `rawData.etapas` y `rawData.EtapaPorProcesos` usan los mismos
cuatro campos. En la muestra local disponible, `rawData.etapas` estaba en orden
cronológico y contenía el plan, mientras `rawData.EtapaPorProcesos` contenía la
etapa activa. En el endpoint de detalle, `EtapaPorProcesos` contiene el plan
completo y llega desordenado.

No existe un snapshot local de `rawData.etapas` para el mismo proceso 135317,
por lo que no es posible afirmar igualdad, etapas adicionales o mayor frescura
fila por fila sin realizar otra consulta. La implementación da prioridad al
detalle remoto validado y conserva ambos arrays almacenados como fallback.

## Vacíos y errores

La muestra no incluyó arrays vacíos ni un payload de error. Esos contratos no
se inventan: las pruebas cubren `EtapaPorProcesos: []`, 404, timeout, contenido
no JSON y payload inválido. Los cuerpos de error nunca se exponen en la UI.

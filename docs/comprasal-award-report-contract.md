# Contrato observado: informe de adjudicación COMPRASAL

Fuente consultada una sola vez el 19 de julio de 2026:

`GET /api/v1/publico/obtener/informe-adjudicacion/135317`

La respuesta fue HTTP 200 con `content-type: application/json; charset=utf-8`.
La fixture del repositorio conserva la estructura y los tipos observados, pero
reemplaza nombres de personas, proveedores, el nombre del contrato y el cifrado
presupuestario por valores de ejemplo.

## Estructura raíz

- `data`: objeto con el informe.
- `message`: texto de estado (`Informe cargado correctamente.` en la muestra).

## Campos observados

`data.adjudicacion` es un objeto con:

- `nombre_contrato`, `forma_contratacion`, `estado_proceso`;
- `plazo_contractual` como entero;
- `monto_planificado` y `monto_certificado` como strings decimales;
- `fecha_publicacion`, `fecha_apertura`, `fecha_cierre` y `fecha_firma` como
  timestamps ISO 8601 UTC con `Z`.

Arrays de `data`:

- `cifrados`: objetos con `cifrado_presupuestario`.
- `ofertasOferentes`: objetos con `nombre_comercial` y `fecha_carga`. La muestra
  repite oferentes en distintas fechas y no identifica un proveedor ganador.
- `modificacionesContractuales`: vacío en la muestra; no se conoce el contrato
  interno de sus elementos.
- `etapas`: objetos con `etapa`, `monto_total` numérico y `fecha_mostrar`.
- `pagos`: objetos con `etapa`, `monto_total` decimal como string y
  `fecha_mostrar`.
- `beneficiarios`: objetos con `created_at`, `persona` y `pais`. Los componentes
  del nombre pueden ser `null`; `pais` contiene `gentilicio`.

La muestra no contiene IDs del informe o de sus filas, moneda, URLs oficiales
ni documentos. El único estado observado es `adjudicacion.estado_proceso`.

## Ausencias relevantes

La respuesta observada no incluye el ID ni el código del proceso, institución,
moneda, documentos, URLs, actividades o ítems, ni una lista explícita de
adjudicaciones/lotes. Estos datos no se infieren. La ficha usa el resultado
canónico para el encabezado y presenta `ofertasOferentes` como oferentes.

No se hizo una segunda consulta para localizar un proceso sin informe: no había
un processId de ese tipo confirmado en fixtures o datos locales. El caso se
cubre mediante respuestas simuladas.

Tampoco se observó un payload de error real. Los casos 404, timeout, 429/5xx,
contenido no JSON y contrato inválido se simulan en pruebas; sus cuerpos no se
propagan a la interfaz ni a mensajes de error.

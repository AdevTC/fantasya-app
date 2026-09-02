# Runbook de release Firebase y Vercel

Este procedimiento publica la migración V2 de forma aditiva, comprobable y
reversible. No autoriza por sí mismo ningún push, merge, despliegue, cambio IAM
ni escritura en producción: cada grupo mutable requiere aprobación explícita en
el momento de ejecutarlo.

Producción está fijada a:

- repositorio `https://github.com/AdevTC/fantasya-app.git`;
- Firebase `tictaktools` con `jordisumba@gmail.com`;
- región `us-central1` y runtime `nodejs22` para todas las Functions;
- despliegue web mediante la integración Git de Vercel del repositorio.

La sincronización de Football Data queda fuera de esta release. Los controles y
el cliente nuevo de sync permanecen desactivados: en producción el catálogo de
jugadores se lee desde Firestore en modo de sólo lectura y no intenta
sincronizarse. El fixture y el sync sólo permanecen activos en desarrollo con
emuladores. Los tres endpoints legacy `syncLaLigaPlayers`,
`getLaLigaSyncStatus` y `clearLaLigaPlayers` siguen desplegados temporalmente
para mantener la compatibilidad hasta superar la observación de 24 horas y la
retirada con aprobación separada de la fase 7.

## Puertas obligatorias antes de empezar

No iniciar la fase 1 mientras falte cualquiera de estas condiciones:

1. Node 22 y Java 21 o superior están activos; los dos lockfiles están
   instalados con `npm ci` y `npm --prefix functions ci`.
2. `npm run verify` termina con código 0 y la rama de la PR está limpia y
   publicada en su upstream.
3. La CI de GitHub y el check de Vercel están verdes para el SHA exacto de la
   PR. No vale un resultado de otro commit.
4. El preflight confirma el repositorio canónico, una sola PR abierta no draft
   contra `main`, SHA coincidente, estado mergeable limpio, Firebase
   `tictaktools` visible y la cuenta esperada activa.
5. Una persona con acceso de billing confirma que el proyecto tiene alertas de
   presupuesto activas y destinatarios atendidos. Las alertas pueden retrasarse
   y no son un límite de gasto; se comprueba también cualquier control de gasto
   aplicable, incluido el spend cap de Cloud Run Functions si está disponible,
   antes de publicar. Los spend caps de Cloud Run Functions no son un
   límite duro ni instantáneo: puede existir overage por el retraso del
   reporting. Véase
   [evitar facturas inesperadas](https://firebase.google.com/docs/projects/billing/avoid-surprise-bills).
6. Functions, Cloud Logging y Vercel permiten observar invocaciones, errores y
   el SHA publicado. Firebase documenta la consulta en
   [escritura y visualización de logs](https://firebase.google.com/docs/functions/writing-and-viewing-logs).
7. Hay una persona responsable durante toda la ventana, con el commit anterior
   identificado y capacidad de parar o revertir.

No se inspecciona ningún valor ni metadato de secretos en este rollout. Está
prohibido leer secretos y también usar la salida JSON de `functions:list`, ya
que puede revelar información que no forma parte del inventario requerido. Los
inventarios usan únicamente la proyección sanitizada de Cloud Functions v2:
nombre, región, runtime y estado.

## Umbrales de pausa y rollback

Mantener abiertos Functions/Cloud Logging, los checks de GitHub y el deployment
de Vercel durante todas las fases. Registrar hora, SHA, grupo y conteos antes y
después de cada cambio.

Pausar de inmediato y no iniciar el siguiente grupo si ocurre cualquiera:

- falla un despliegue, un check o el inventario exacto;
- una Function nueva no queda `ACTIVE` en `us-central1` con `nodejs22`;
- el smoke controlado produce un error inesperado, una escritura parcial o un
  `permission-denied`;
- aparecen 5 o más errores de aplicación en 10 minutos en las rutas tocadas;
- con al menos 100 invocaciones en 10 minutos, la tasa de error supera el 1 %;
- las invocaciones de una ruta tocada superan 3 veces la misma ventana de la
  semana anterior sin que el tráfico o el smoke lo expliquen, o superan 100 en
  10 minutos cuando aún no existe una referencia comparable;
- Vercel publica un SHA distinto o faltan variables necesarias.

Hacer rollback, en vez de limitarse a pausar, ante datos incoherentes, acceso no
autorizado, escritura parcial, crecimiento sostenido durante otros 10 minutos
después de pausar el tráfico de prueba, o repetición del mismo error tras un
reintento controlado. Ante una señal de coste, detener nuevas pruebas y avisar
al responsable de billing; una alerta no garantiza que el gasto se detenga.

App Check **no se fuerza en este rollout** porque el cliente aún no está
preparado para aportar attestations verificables. Se acepta temporalmente el
riesgo residual de abuso, mitigado por autenticación, validación y rate limits.
Antes de ampliar la audiencia se deben instrumentar y observar las métricas de
peticiones verificadas/no verificadas, preparar los clientes y decidir una
activación gradual. Firebase recomienda revisar primero
[métricas de App Check](https://firebase.google.com/docs/app-check/monitor-metrics)
y después configurar su
[aplicación en Cloud Functions](https://firebase.google.com/docs/app-check/cloud-functions).

## Fase 1: Functions aditivas antes del merge

Trabajar desde la rama publicada de la PR. Registrar el SHA completo:

```powershell
git rev-parse HEAD
npm run production:preflight:pr
npm run production:functions:inventory -- baseline
```

El preflight exige el mismo SHA en Git, en la PR y en sus checks. Cada wrapper
es interactivo, vuelve a comprobar ese estado tras la confirmación literal y
valida inventarios exactos antes y después. Con una aprobación independiente
por grupo, ejecutar en este orden y detenerse ante cualquier desviación:

```powershell
npm run deploy:prod:pr:functions:core-v2
npm run production:functions:inventory -- core-v2

npm run deploy:prod:pr:functions:league
npm run production:functions:inventory -- league

npm run deploy:prod:pr:functions:content-v2
npm run production:functions:inventory -- content-v2
```

Los grupos sólo añaden Functions; no sustituyen ni eliminan las siete del
inventario inicial. `onSeasonJoin` ya existe en producción y permanece intacta.
Tras cada grupo revisar logs, los umbrales anteriores y el inventario completo.

## Fase 2: merge sólo tras los tres inventarios

No mergear hasta que `core-v2`, `league` y `content-v2` hayan terminado con
sus inventarios exactos, la rama siga limpia y el SHA de la PR conserve todos
sus checks verdes. Registrar los resultados en la PR o ticket y entonces
solicitar la aprobación específica del merge.

## Fase 3: esperar `main` y Vercel

Registrar el SHA del merge y esperar a que finalicen tanto la CI de `main` como
el check/deployment de Vercel para ese SHA exacto. Una URL accesible o un check
verde de un commit anterior no sirven. Si el check de Vercel no aparece, o el
proceso solicita autorización o cambios de variables/dashboard, detenerse y
pedir al owner que lo revise.

La [integración Git de Vercel](https://vercel.com/docs/git) permite deployments
desde Git. Su documentación de
[colaboración en proyectos](https://vercel.com/docs/deployments/troubleshoot-project-collaboration)
distingue la colaboración gratuita en repositorios públicos de los proyectos
Hobby privados, restringidos al owner; los forks públicos pueden requerir
autorización. Este repositorio/PR se acepta sólo cuando el check del SHA exacto
lo confirma. Eso no demuestra acceso de Jordi al dashboard, variables, dominio
o ajustes, que siguen siendo owner-only.

## Fase 4: smoke de producción

Primero realizar un smoke estrictamente de sólo lectura:

- abrir login y cerrar sesión;
- cargar dashboard, una liga existente, perfil, feed, chat y catálogo de
  jugadores;
- confirmar que el catálogo procede de Firestore y que no aparece control de
  sync ni banner de emuladores;
- revisar consola, red, logs de Functions y SHA mostrado por Vercel.

Sólo si lo anterior está limpio y existe aprobación separada, realizar un smoke
funcional controlado con cuentas y participantes designados: crear/eliminar una
publicación desechable propia, editar/restaurar un campo seguro del perfil y,
si hay consentimiento del receptor, enviar un mensaje normal. Verificar que un
reintento no duplica contenido ni XP. No inventar solicitudes, equipos,
transferencias o mensajes con datos reales para completar la checklist.

## Fase 5: índices, reglas y Storage desde `main`

Sincronizar un checkout limpio de `main` con `origin/main`, volver a ejecutar
`npm run verify` y `npm run production:preflight`. Con una aprobación distinta
para cada grupo, ejecutar en orden:

```powershell
npm run deploy:prod:indexes
npm run deploy:prod:firestore
npm run deploy:prod:storage
```

Cada wrapper exige `main`, divergencia cero, terminal interactiva, proyecto y
cuenta fijos, confirmación literal y recheck del estado. Después de cada grupo,
repetir el smoke aplicable y revisar los umbrales. Si Storage solicita el rol
cross-service documentado por Firebase, detenerse: verificar proyecto y
principal, y aceptar sólo con una aprobación IAM específica.

## Fase 6: rollback, especialmente después de reglas

No usar `git reset --hard`, reescribir historial ni editar producción de forma
improvisada desde la consola.

Si el fallo ocurre después de publicar Firestore o Storage, el orden de
rollback es obligatorio:

1. restaurar en Git los últimos archivos de reglas legacy conocidos como buenos
   mediante un commit/revert revisado;
2. desplegar y verificar primero esas reglas legacy mientras el frontend V2
   sigue publicado;
3. confirmar que las lecturas/escrituras compatibles vuelven a funcionar;
4. sólo entonces crear, verificar y publicar el revert del frontend mediante
   Git/Vercel.

Después de restaurar las reglas legacy y publicar el revert del frontend, las
Functions aditivas quedan desplegadas sin uso. Cualquier corrección o retirada
del backend requiere una release separada, diseñada y aprobada; no se improvisa
ningún comando de Functions durante el incidente. Mantener los endpoints legacy
y conservar logs y tiempos sin copiar datos personales ni secretos.

## Fase 7: retirada posterior de las Functions legacy

Esta fase no forma parte del despliegue inicial. Tras al menos 24 horas de
producción estable, observar individualmente durante una ventana continua de
24 horas estas tres Functions:

- `syncLaLigaPlayers`;
- `getLaLigaSyncStatus`;
- `clearLaLigaPlayers`.

No borrar ninguna si cualquiera registra una llamada, faltan datos de
observación, el frontend del SHA nuevo no está confirmado o existe una anomalía
de reglas. Exigir que las tres muestren exactamente cero invocaciones durante
la ventana completa, repetir el inventario `content-v2` y obtener una nueva
aprobación destructiva separada. Sólo entonces se puede ejecutar:

```powershell
npm run delete:prod:functions:legacy-sync
```

El wrapper no acepta nombres arbitrarios; su confirmación literal y allowlist
incluyen exactamente las tres Functions anteriores. Después debe validarse el
inventario `legacy-players-removed`. Esta guía no autoriza ejecutar el borrado.

## Fase 8: Football Data sigue diferido

La credencial de Football Data expuesta anteriormente debe rotarse en una tarea
dedicada antes de reactivar cualquier integración real. No registrar, pegar,
leer ni verificar su valor en esta release. Después de rotarla habrá que diseñar
y aprobar por separado el almacenamiento del secreto, la función de sync, sus
cuotas, alertas y pruebas; hasta entonces producción conserva el catálogo
Firestore en modo de sólo lectura.

## Registro mínimo de la release

Guardar en la PR o ticket, sin secretos ni datos personales:

- SHA de PR, SHA de merge y SHAs de rollback;
- resultado y hora de CI, Vercel, preflights e inventarios;
- identidad que realizó cada operación Firebase y owner implicado en Vercel;
- aprobación, inicio/fin y resultado de cada grupo;
- smoke de lectura y funcional, métricas observadas y cualquier umbral activado;
- ventana completa de 24 horas de las tres Functions legacy antes de considerar
  su retirada.

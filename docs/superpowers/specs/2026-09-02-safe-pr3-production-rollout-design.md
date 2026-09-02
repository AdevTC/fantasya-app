# Diseño: rollout seguro de la PR #3 sin Football Data

- **Estado:** aprobado conceptualmente y revisado; listo para implementación
- **Fecha:** 2026-09-02
- **PR:** `AdevTC/fantasya-app#3`
- **Rama:** `codex/firebase-safe-development`
- **Producción Firebase:** `tictaktools`

## 1. Contexto

La PR #3 tiene CI y preview de Vercel verdes, pero todavía no puede fusionarse
sin preparar antes el backend. La integración GitHub -> Vercel publica `main`
automáticamente, mientras que producción sólo contiene siete Functions legacy y
el frontend nuevo invoca varias callables que aún no existen.

El guard de producción actual exige ejecutar desde una rama `main` idéntica a
`origin/main`. Ese requisito protege releases normales, pero hace imposible
publicar primero las Functions aditivas y después fusionar la PR, que es el orden
compatible con el despliegue automático de Vercel.

La inspección de inventario mediante `firebase functions:list --json` mostró en
la salida una variable legacy sensible. Su valor no se usará ni se documentará.
Esta release excluye el proveedor Football Data, su clave y las nuevas Functions
de sincronización. La credencial deberá rotarse posteriormente por haber
aparecido en una salida local.

## 2. Objetivos y no objetivos

El rollout debe:

1. mantener visible y consultable la base de jugadores ya almacenada;
2. impedir que preview o producción llamen desde el cliente a sync;
3. desplegar desde el SHA exacto y verde de la PR sólo Functions nuevas que no
   sobrescriban las siete Functions actuales;
4. evitar doble concesión o pérdida de XP al cambiar de frontend;
5. fusionar mediante merge commit y dejar que Vercel publique `main`;
6. verificar CI, deployment y navegación sin escribir datos reales;
7. conservar reglas, índices, Storage y `onSeasonJoin` hasta fases posteriores.

Quedan fuera:

- crear, leer, migrar, desplegar o rotar ahora `FOOTBALL_DATA_API_KEY`;
- desplegar `functions-sync`;
- borrar `onSeasonJoin` o cualquiera de las Functions core legacy;
- desplegar reglas de Firestore, índices o Storage en la misma fase;
- crear datos de prueba en producción;
- cambiar ajustes del proyecto Vercel o contratar Vercel Pro.

## 3. Alternativas consideradas

### A. Functions aditivas previas al merge desde el SHA verde — elegida

Se añade un guard independiente que sólo admite tres grupos allowlisted, exige
una PR abierta y verde contra `main`, fija el SHA del head y vuelve a comprobarlo
justo antes del deploy. Las implementaciones endurecidas de tres callables
existentes reciben nombres `V2`, por lo que la versión legacy no se sobrescribe.
Esto preserva el orden backend -> frontend, deja un rollback inmediato mediante
revert del frontend y no necesita acceso al dashboard de Vercel.

### B. Pausar el autodeploy de Vercel

El owner podría pausar la integración, fusionar, desplegar Firebase y reanudarla.
Evita un guard nuevo, pero introduce coordinación manual, exige permisos que
Jordi no tiene y deja una ventana operativa fácil de ejecutar en orden erróneo.

### C. Dividir la PR en backend y frontend

Es la separación histórica más estricta, pero obliga a reescribir una PR grande,
resolver dependencias entre commits y repetir una validación ya verde. No reduce
lo suficiente el riesgo como para justificar ese coste ahora.

## 4. Capacidad de sincronización de jugadores

La lectura de jugadores no depende de Football Data. `PlayersSyncTab` seguirá
leyendo Firestore, mostrando la tabla, filtros, ordenación y paginación.

La capacidad de sincronización tendrá un estado explícito:

- en preview y producción estará desactivada de forma cerrada en cliente;
- el componente no consultará estado ni llamará a una callable de sync;
- la interfaz mostrará un aviso estable de que la actualización automática está
  temporalmente desactivada, sin presentarlo como error;
- el botón de sincronización no será accionable;
- si no hay registros, el estado vacío no sugerirá pulsar un botón inexistente;
- en desarrollo con emuladores se conserva la sincronización por fixture local,
  sin red ni credencial real.

La capa de servicio aplicará defensa en profundidad: una llamada de sync fuera
del emulador fallará localmente antes de construir o ejecutar una callable. Así
un cambio accidental de UI no puede contactar un endpoint ausente o legacy.

Durante la ventana anterior al merge seguirán existiendo en producción los dos
endpoints HTTP legacy de sync y el frontend anterior aún puede llamarlos.
También permanece `clearLaLigaPlayers`, una Function antigua sin consumidor en
el repositorio actual. Por tanto, el cierre inicial es de cliente, no de toda la
superficie backend. Tras confirmar que Vercel sirve el SHA nuevo, se propondrá
borrar exclusivamente `syncLaLigaPlayers`, `getLaLigaSyncStatus` y
`clearLaLigaPlayers` con un wrapper acotado y una aprobación destructiva
separada. Si se aplaza, la release puede ser funcional, pero se registrará
expresamente el riesgo residual y no se declarará cerrada la superficie de sync.

## 5. Compatibilidad de callables y XP

Las implementaciones endurecidas que sustituyen contratos ya existentes se
publicarán con nombres nuevos:

- `createProfileDocumentsV2`
- `unlinkUserFromTeamV2`
- `createOrGetChatV2`

El frontend de la PR usará esos nombres. Las Functions legacy con el nombre
anterior no se modifican en este rollout y quedan disponibles para un revert del
frontend. `setUserAppRole` y `recalculateXp` ya son nuevas y pueden desplegarse
de forma aditiva.

Los triggers de XP se eliminan del rollout. Un marcador escrito por cliente no
sería una barrera de confianza mientras sigan activas las reglas legacy. En su
lugar se añaden dos callables nuevas y exclusivamente servidoras:

- `createPostV2`
- `createTransferV2`

Cada operación recibe un `operationId` estable generado antes de llamar. La
clave idempotente efectiva es `{uid, operationType, operationId}` y nunca un ID
global controlado por cliente. El servidor normaliza el payload, calcula su hash
canónico y almacena tipo, UID, hash y resultado en el registro de operación.
Repetir la misma clave sólo devuelve el resultado si UID, tipo y hash coinciden;
el mismo ID con otro usuario queda aislado y cualquier cambio de payload o tipo
falla. Los IDs de los documentos resultantes se derivan de la clave, por lo que
un retry concurrente converge en el mismo recurso.

Después de validar autenticación, payload y permisos, cada callable deriva en
servidor los datos de identidad y ejecuta en una sola transacción la creación
canónica, el registro idempotente de operación/XP y el incremento
correspondiente. Un fallo transaccional no deja contenido sin XP ni XP sin
contenido.

`createTransferV2` vuelve a leer liga y temporada dentro de esa transacción y
exige `requireSeasonAdmin`: sólo el owner de la liga o un miembro con rol
`admin` puede registrar el fichaje. Comprador y vendedor deben ser `market` o
miembros existentes, deben ser distintos y al menos uno debe ser un equipo.
Los placeholders se permiten para conservar la gestión de equipos fantasma,
pero nunca reciben XP. Nombres de comprador/vendedor se derivan de la temporada;
el cliente no puede fijarlos. El XP se concede una sola vez al comprador real y
elegible, no al caller, y nunca a `market`, un placeholder o un UID inexistente.

El frontend anterior seguirá creando directamente y concediendo XP desde
cliente. El frontend nuevo usará exclusivamente las callables V2 y no llamará a
`grantXp`. Como los caminos se distinguen por el endpoint servidor, no existe
una barrera falsificable ni una ventana de doble concesión o de eventos perdidos.
Los previews no se usarán para crear datos reales durante la preparación.

Después de que el frontend nuevo esté activo, las reglas de Firestore denegarán
la creación directa de posts y transfers; sus actualizaciones legítimas seguirán
permitidas. Esto cierra el bypass cliente sin formar parte del premerge.

## 6. Guard de despliegue pre-merge

El flujo pre-merge será deliberadamente distinto del flujo normal desde
`main`. No se relajará el guard existente para reglas, Storage, índices, sync o
borrados.

El nuevo guard exige, antes de mostrar la confirmación:

- Node 22, árbol de trabajo limpio y `origin` canónico;
- rama local distinta de `main` con upstream y sin divergencia;
- exactamente una PR abierta cuyo head sea esa rama y cuyo base sea `main`;
- `HEAD`, el head remoto y `headRefOid` iguales;
- PR no draft, `mergeable=MERGEABLE` y `mergeStateStatus=CLEAN`;
- todos los checks publicados terminados correctamente, incluyendo la suite de
  GitHub Actions y el deployment de Vercel;
- cuenta Firebase activa `jordisumba@gmail.com` y visibilidad de `tictaktools`;
- target exactamente uno de `functions-core-v2`, `functions-content-v2` o
  `functions-league`.

La confirmación literal incluirá proyecto, target y SHA completo. Después de la
confirmación se repetirá la comprobación de Git y GitHub; cualquier movimiento
del head, nuevo commit, cambio de estado o check no verde abortará sin desplegar.

El guard no consultará metadatos ni valores de secretos. Tampoco aceptará
argumentos arbitrarios para `--only`.

## 7. Inventario seguro

No se volverá a ejecutar `firebase functions:list --json` para esta release. Se
añadirá una inspección contra Cloud Functions v2 con proyección remota de campos.
La respuesta se transformará de inmediato al DTO exacto
`{ name, region, runtime, state }`; ninguna otra clave se conserva o llega a
stdout/stderr. Sólo se acepta `region=us-central1`, `runtime=nodejs22` y
`state=ACTIVE`. Un elemento incompleto, desconocido o duplicado hace fallar la
verificación. Los errores se resumen sin imprimir el objeto devuelto por la API.

El baseline previo al primer deploy es el conjunto exacto de siete nombres ya
observados:

- `clearLaLigaPlayers`
- `createOrGetChat`
- `createProfileDocuments`
- `getLaLigaSyncStatus`
- `onSeasonJoin`
- `syncLaLigaPlayers`
- `unlinkUserFromTeam`

Después de cada fase se exige exactamente el baseline unido a todos los grupos
desplegados hasta entonces. Una Function adicional no se oculta: se trata como
cambio concurrente y detiene el rollout para revisar su procedencia. Después de
una supresión legacy aprobada, el conjunto esperado elimina exactamente las tres
Functions de sincronización/limpieza y ninguna otra.

Tras cada grupo se verificará que están presentes y activas estas Functions:

**Core V2 (aditivo)**

- `createProfileDocumentsV2`
- `unlinkUserFromTeamV2`
- `setUserAppRole`
- `createOrGetChatV2`
- `recalculateXp`

**Contenido y XP atómicos (aditivo)**

- `createPostV2`
- `createTransferV2`

**League**

- `joinSeasonByInviteCode`
- `submitJoinRequest`
- `reviewJoinRequest`
- `replaceSeasonTrophies`
- `saveSeasonChallenge`
- `deleteSeasonChallenge`
- `setChallengeWinners`
- `refreshCareerAchievements`

La Function legacy `onSeasonJoin`, que sí existe hoy en producción, se conserva.
El alta nueva realiza la migración de placeholder de forma atómica y no depende
de borrarla. Su retirada requiere observación de compatibilidad y una operación
separada, acotada y aprobada.

## 8. Secuencia de rollout

1. Implementar el capability gate, los aliases V2, las operaciones atómicas de
   contenido/XP, el guard pre-merge y el inventario seguro mediante pruebas que
   fallen primero.
2. Actualizar el runbook para reflejar la realidad de `onSeasonJoin`, la
   exclusión de sync y la ruta de PR verde.
3. Ejecutar la verificación local completa y obtener revisión de código.
4. Confirmar de nuevo que el SHA de la PR y todos sus checks siguen verdes.
5. Con autorización explícita de producción, desplegar `functions-core-v2`.
6. Verificar únicamente los metadatos permitidos y detenerse ante cualquier
   Function ausente o no activa.
7. Desplegar `functions-league`, después `functions-content-v2`, y repetir la
   verificación tras cada grupo. Todos los nombres publicados son nuevos.
8. Revalidar que la PR no cambió y fusionarla con **merge commit**, sin borrar la
   rama, para preservar la ascendencia de los commits locales existentes.
9. Esperar la CI de `main` y el deployment automático de producción de Vercel.
10. Hacer un smoke de sólo lectura: login/logout, dashboard, perfil, feed,
    chats, liga existente y tabla de jugadores; revisar consola y red.
11. Con otra aprobación explícita, desplegar índices, reglas de Firestore y
    Storage uno a uno; verificar después de cada grupo. Desde este punto, las
    pestañas del frontend legacy deben refrescarse para crear posts o fichajes.
12. Tras una ventana observable mínima de 24 horas sin invocaciones de ninguno
    de los dos endpoints sync ni de `clearLaLigaPlayers`, y con otra aprobación
    explícita, borrar únicamente esas tres Functions. Si no se puede demostrar
    el uso cero de las tres, no se borra ninguna. Si se aplaza, registrar el
    riesgo residual. La integración con Football Data permanece fuera.

## 9. Fallos y rollback

- Si un grupo falla: no desplegar el siguiente ni fusionar.
- Si el inventario no coincide: detenerse y conservar la salida saneada.
- Si la PR cambia tras un deploy: no fusionar; volver a verificar y revisar el
  diff antes de cualquier acción.
- Si falla el merge o Vercel: todas las callables nuevas permanecen aditivas y
  sin uso por el frontend anterior. No se borra nada durante el incidente.
- Si el frontend nuevo falla: revertir el merge mediante un nuevo commit, dejar
  que CI/Vercel publiquen el revert y mantener las Functions V2 aditivas. El
  frontend anterior volverá a usar las tres Functions legacy intactas y su
  concesión XP cliente.
- Como ninguna Function existente se sobrescribe, no hace falta reconstruir
  código desde un SHA histórico para rollback.
- Si ya se borraron las tres Functions legacy de jugadores, su restauración no
  forma parte del
  rollback general: necesita aprobación específica, una credencial rotada y un
  release propio de Football Data.
- Si ya se desplegaron reglas restrictivas, con el frontend V2 todavía activo se
  restauran primero las reglas del SHA anterior mediante el wrapper allowlisted.
  Esas reglas siguen siendo compatibles con las callables V2. Sólo después de
  verificar el deploy de reglas se fusiona/publica el revert del frontend. Si la
  restauración de reglas falla, el frontend legacy no se publica.

## 10. Pruebas y criterios de aceptación

Las pruebas unitarias cubrirán:

- sync permitido únicamente en emulador y rechazo antes de `httpsCallable` en
  preview/producción;
- carga de jugadores sin consulta de estado cuando sync está desactivado;
- clientes nuevos dirigidos exclusivamente a las callables V2;
- creación V2 de post y transfer validada, atómica e idempotente por
  `operationId`, incluido rollback completo ante fallo;
- reintento con payload idéntico, rechazo con el mismo ID y payload/tipo
  diferente, y aislamiento del mismo ID entre usuarios;
- transfer permitido para owner/admin, denegado para miembro normal, validación
  de participantes, mercado y placeholders, XP al comprador elegible y
  convergencia ante concurrencia;
- ausencia de `grantXp` y de escritura directa de contenido en el cliente nuevo;
- parsing fail-closed de PR, checks, divergencia y SHA;
- rechazo de draft, PR no limpia, check pendiente/fallido, head remoto distinto,
  target desconocido y más de una PR candidata;
- confirmación ligada al SHA y revalidación posterior;
- allowlist estricta de los tres grupos;
- inventario con DTO exacto y rechazo de estados, regiones o runtimes no
  aceptados, demostrando que configuración y valores sensibles nunca llegan a
  la salida.

Antes del deploy deben pasar `npm run verify`, build, tests de Functions,
Security Rules, guard tests y CI remota para el mismo SHA. La fase se considera
funcional cuando core V2, league y contenido V2 están activos, `main` y Vercel
están verdes y el smoke de sólo lectura no muestra regresiones. Sólo se
considerará cerrada la superficie de sincronización cuando el inventario
confirme que las tres Functions legacy ya no existen; la rotación de la
credencial externa seguirá siendo una tarea explícita pendiente.

El smoke productivo de esta fase es deliberadamente de sólo lectura. La
aceptación de `createPostV2` y `createTransferV2` se apoya en pruebas integradas
contra emuladores; probar esas mutaciones con datos reales requerirá otra
aprobación y un escenario desechable y reversible acordado con sus participantes.

## 11. Decisiones aplazadas

En una tarea posterior se decidirá si reactivar sync. Esa tarea empezará por
rotar la credencial legacy, migrarla a Secret Manager sin exponerla, desplegar
las Functions V2 de sincronización y hacer su propio rollout. También se
decidirá por separado la retirada de `onSeasonJoin` y, tras una ventana de
compatibilidad, de las tres callables core legacy.

## 12. Referencias

- [Gestión y despliegue parcial de Functions](https://firebase.google.com/docs/functions/manage-functions)
- [API de Cloud Functions v2](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions)
- [Integración Git de Vercel](https://vercel.com/docs/git)

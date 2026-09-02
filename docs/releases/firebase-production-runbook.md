# Runbook de release Firebase y Vercel

Este documento prepara una release compatible y reversible. No autoriza ningún
push, merge, secreto, cambio IAM, despliegue ni escritura de prueba en
producción. Cada fase necesita aprobación explícita en el momento de ejecutarla.

Producción está fijada a:

- repositorio `https://github.com/AdevTC/fantasya-app.git`;
- rama `main`;
- Firebase `tictaktools` con `jordisumba@gmail.com`;
- integración Git/Vercel propiedad del owner actual.

## Puerta obligatoria

No empezar mientras falte cualquiera de estos puntos:

1. Node 22 y Java 21 o superior están activos.
2. `npm ci` y `npm --prefix functions ci` parten de los lockfiles de la release.
3. `npm run verify` termina con código 0 dos veces desde sesiones limpias si ha
   cambiado infraestructura de emuladores.
4. La CI de GitHub está verde para el SHA exacto que se pretende publicar.
5. `main` está limpia, usa el `origin` canónico y coincide con `origin/main`.
6. `npm run production:preflight` termina con código 0 y muestra exactamente
   `jordisumba@gmail.com`, `tictaktools` visible y divergencia cero. El comando
   hace `git fetch` y actualiza referencias locales, pero no escribe remotamente.
7. El preflight muestra `FOOTBALL_DATA_API_KEY metadata: present` antes de
   desplegar el grupo de sync.
8. Hay una pestaña de Firebase Console abierta sólo para observar Functions y
   logs. Nunca se muestra el valor del secreto.
9. La integración Git de Vercel puede publicar el SHA y su check permite
   observar el build; quedó comprobado con la PR #3. El owner está disponible
   sólo si hacen falta ajustes o autorización.
10. Existe aprobación explícita para la fase concreta y un responsable disponible
    durante la comprobación y posible rollback.

Firebase documenta que el despliegue de Functions requiere Cloud Functions
Admin y Service Account User, y que reglas e índices tienen permisos propios:
[permisos IAM de Firebase](https://firebase.google.com/docs/projects/iam/permissions).
La comprobación de solo lectura del 2 de septiembre de 2026 confirmó esos
permisos para Jordi, pero se vuelve a validar el estado al preparar la release.

## Preparar el secreto de fútbol, sólo si falta

El entorno local usa fixture y no necesita una clave real. Si el preflight de
producción informa `missing`, detener la release y conseguir una clave legítima
de football-data.org. No enviarla por chat ni guardarla en `.env`, historial de
PowerShell, GitHub, Vercel, documentación o capturas.

Después de una aprobación específica, crear o actualizar el secreto con el CLI
local ya fijado por el lockfile:

```powershell
& .\node_modules\.bin\firebase.cmd functions:secrets:set FOOTBALL_DATA_API_KEY --project tictaktools --account jordisumba@gmail.com
```

El valor se introduce únicamente en el prompt interactivo. Firebase explica
este flujo en su guía de
[Secret Manager para Functions](https://firebase.google.com/docs/functions/config-env#secret_parameters).
Volver a ejecutar `npm run production:preflight` y exigir estado `present`; no
usar `functions:secrets:access`, porque mostraría el valor.

## Fase A: Functions aditivas y compatibles

Con aprobación explícita, ejecutar un grupo cada vez:

```powershell
npm run deploy:prod:functions:core
npm run deploy:prod:functions:sync
npm run deploy:prod:functions:league
```

Cada wrapper vuelve a comprobar Git/Firebase, exige una confirmación literal y
fija cuenta, proyecto y lista de Functions. Si un grupo falla, detener la fase;
no continuar con el siguiente. Los grupos tienen diez Functions o menos, como
recomienda Firebase para evitar cuotas durante despliegues grandes:
[gestión de Functions](https://firebase.google.com/docs/functions/manage-functions#deploy_functions).

El resultado esperado es:

| Grupo | Functions |
| --- | --- |
| core | `createProfileDocuments`, `unlinkUserFromTeam`, `setUserAppRole`, `createOrGetChat`, `onPostCreatedAwardXp`, `onTransferCreatedAwardXp`, `recalculateXp` |
| sync | `syncLaLigaPlayersV2`, `getLaLigaSyncStatusV2`, `syncLaLigaPlayers`, `getLaLigaSyncStatus` |
| league | `joinSeasonByInviteCode`, `submitJoinRequest`, `reviewJoinRequest`, `replaceSeasonTrophies`, `saveSeasonChallenge`, `deleteSeasonChallenge`, `setChallengeWinners`, `refreshCareerAchievements` |

Los dos endpoints sync legacy se vuelven a desplegar con los handlers endurecidos
para mantener el frontend anterior durante la ventana de compatibilidad. No
existe una Function `onSeasonJoin`: el alta directa se sustituyó deliberadamente
por `joinSeasonByInviteCode` y los flujos de solicitud/revisión.

Comprobar el inventario sin cambiarlo:

```powershell
& .\node_modules\.bin\firebase.cmd functions:list --project tictaktools --account jordisumba@gmail.com
```

Observar logs y cold starts. No avanzar ante error de carga, secreto, permisos,
región o runtime.

## Fase B: frontend mediante GitHub y Vercel

El permiso GitHub `WRITE` de Jordi no concede acceso al dashboard de Vercel,
pero la [integración Git de Vercel](https://vercel.com/docs/git) del repositorio
público sí generó correctamente el preview de la PR #3. El flujo habitual no
requiere una plaza Pro ni que el owner dispare cada preview. El owner conserva
variables, dominio, ajustes y promociones manuales; tampoco se crea un segundo
proyecto Vercel como atajo.

1. Tras aprobación, abrir la PR o hacer el push previsto y registrar
   `git rev-parse HEAD`.
2. Esperar la CI verde del SHA exacto.
3. Esperar el check automático de Vercel. Si no aparece o solicita autorización,
   pedir al owner que revise la conexión GitHub o autorice ese deployment.
4. Confirmar que el deployment resultante declara el SHA esperado. No basta con
   que la URL responda.
5. Si faltan variables `VITE_*`, detenerse y pedir al owner que restaure las del
   proyecto actual. No copiar valores a chat ni inventar un proyecto nuevo.

Primero hacer smoke de sólo lectura sobre la URL canónica indicada por Vercel:

- cargar login y cerrar sesión;
- abrir dashboard, una liga existente, perfil, feed y lista de chats;
- revisar consola del navegador y errores de red;
- confirmar que no aparece el banner de emuladores.

Las pruebas que escriban datos requieren una aprobación separada y una cuenta o
escenario designado. Sólo usar cambios reversibles y consentidos, por ejemplo
editar/restaurar una bio o crear/eliminar una publicación desechable. Nunca
ejecutar el fixture local contra producción ni fabricar solicitudes, equipos o
mensajes con datos reales para completar una checklist.

## Fase C: índices y reglas restrictivas

Sólo después de que el frontend nuevo funcione con las reglas anteriores:

```powershell
npm run deploy:prod:indexes
npm run deploy:prod:firestore
npm run deploy:prod:storage
```

Detenerse tras cada comando y comprobar logs y smoke. `storage.rules` consulta
documentos de Firestore mediante `firestore.get`. La primera publicación puede
pedir conceder a la cuenta de servicio de Storage el rol
`roles/firebaserules.firestoreServiceAgent`. Firebase documenta ese enlace en
[reglas cross-service de Storage](https://firebase.google.com/docs/rules/manage-deploy#manage_permissions_for_cross-service_cloud_storage_security_rules).

Aceptar ese prompt sólo con aprobación explícita, verificando que el principal
termina en `@gcp-sa-firebasestorage.iam.gserviceaccount.com` y que el proyecto es
`tictaktools`. El rol corresponde a la cuenta de servicio, no a un usuario.

Repetir el smoke de lectura. Para validar escrituras, usar únicamente escenarios
aprobados y reversibles:

- editar y restaurar campos seguros del perfil propio;
- renombrar y restaurar el equipo propio si no afecta a otros participantes;
- enviar y retirar una imagen propia;
- enviar un mensaje normal sólo a un participante que lo consienta;
- procesar una solicitud real únicamente si ya existe y su participante espera
  esa acción.

Una situación real ausente queda cubierta por las pruebas de emuladores; no es
permiso para crear datos artificiales en producción.

## Rollback

No usar `git reset --hard`, borrar historial ni editar producción desde la
consola para improvisar una reparación.

- Frontend: crear un `git revert` del commit o merge problemático, revisar la
  CI y dejar que la integración Git publique el revert. Pedir ayuda al owner si
  el check no aparece o requiere una acción de dashboard.
- Firestore/Storage/índices: restaurar los archivos desde el último commit bueno
  mediante un nuevo revert y desplegar únicamente el grupo guardado afectado.
- Functions: conservar los endpoints legacy, revertir los handlers en Git y
  desplegar sólo el grupo afectado. No borrar Functions nuevas durante el
  incidente hasta que el frontend anterior esté restaurado.
- Si hay una denegación inesperada, parar escrituras, conservar logs y volver a
  las reglas anteriores antes de investigar con datos reales.

## Fase D: retirar compatibilidad

Esperar como mínimo 48 horas después de la Fase C y exigir todos estos puntos:

- ningún uso de `syncLaLigaPlayers` ni `getLaLigaSyncStatus` en las últimas
  24 horas de logs;
- ninguna subida anómala de `permission-denied` asociada a las reglas nuevas;
- el owner confirma que producción sigue ejecutando el frontend del SHA nuevo;
- existe un commit revisado que elimina exports y cualquier cliente legacy;
- `npm run verify` y la CI de ese commit están verdes.

Tras una nueva aprobación explícita, ejecutar únicamente:

```powershell
npm run delete:prod:functions:legacy-sync
```

El prompt debe nombrar exactamente `syncLaLigaPlayers` y
`getLaLigaSyncStatus`. No pasar argumentos adicionales ni aceptar otro recurso.

## Registro mínimo de la release

Guardar en la PR o ticket, sin secretos:

- SHA publicado y SHA del rollback;
- resultado de CI y hora de cada fase;
- identidad que realizó Firebase y owner que realizó Vercel;
- grupos desplegados y resultado de smoke;
- incidencias, decisiones de parada y hora de retirada legacy.

# Diseño: entorno de desarrollo local seguro para Fantasya

- **Estado:** aprobado conceptualmente; pendiente de implementación
- **Fecha:** 2026-09-02
- **Proyecto de producción:** `tictaktools`
- **Proyecto local de demostración:** `demo-fantasya`

## 1. Contexto y problema

Fantasya funciona hoy contra Firebase y se despliega en Vercel desde GitHub. El repositorio no dispone aún de un entorno local completo y aislado: el frontend puede recibir configuración de producción, las Cloud Functions no se conectan al emulador desde el cliente, no hay datos de prueba reproducibles y algunas operaciones dependen de URLs de Cloud Run escritas directamente en el código.

La auditoría previa confirma además varios riesgos funcionales o de autorización que deben resolverse junto al entorno local, no ocultarse:

- Un usuario puede modificar actualmente cualquier campo de su propio documento salvo `createdAt`, incluidos `appRole` y `xp`.
- Las funciones HTTP de sincronización autentican al usuario, pero no comprueban que sea `superadmin`.
- Las reglas de `players` permiten escribir a cualquier usuario autenticado, aunque la pantalla está protegida como superadministración.
- Las reglas de temporadas permiten que un miembro reescriba el mapa completo `members` y que un usuario nuevo se añada con un payload arbitrario; eso permite alterar otros miembros o autoconcederse rol de administrador.
- Cualquier usuario autenticado puede leer y actualizar cualquier chat; además puede cambiar el estado de una solicitud de unión enviada en un mensaje.
- Los likes de posts y comentarios se escriben desde cualquier cuenta, pero las reglas actuales sólo permiten actualizar al autor.
- La interfaz permite que un superadministrador elimine posts, pero las reglas no se lo permiten.
- El cliente usa `profile-pictures/{uid}` y `season-pictures/{leagueId}/{seasonId}`; las reglas sólo contemplan `profilePhotos/{uid}/...` y no contemplan imágenes de temporada.
- La concesión y el recálculo de XP se ejecutan desde el cliente.
- El alta por email usa `createProfileDocuments`, pero el flujo de perfil incompleto todavía crea `users` y `usernames` directamente desde el cliente.
- La sincronización de jugadores y su estado usan URLs de Cloud Run de producción escritas directamente en `PlayersSyncTab`.
- `firestore.indexes.json` está referenciado por Firebase, pero ignorado por Git.
- El build funciona, pero no hay pruebas automatizadas ni CI; el lint arrastra una deuda previa que se tratará de forma separada para no mezclarla con la seguridad del setup.

## 2. Objetivos

El resultado debe cumplir simultáneamente estas condiciones:

1. `npm run dev` arranca una sesión local completa y reproducible.
2. El desarrollo normal no puede leer ni escribir en `tictaktools`, ni siquiera si existe una variable de entorno global mal configurada.
3. Auth, Firestore, Functions y Storage funcionan localmente en conjunto.
4. El entorno incluye cuentas y datos deterministas suficientes para recorrer las funciones principales.
5. Las pruebas verifican tanto las operaciones permitidas como los intentos de escalada de privilegios.
6. Las funciones visibles actuales —registro, perfiles, seguidores, feed, likes, guardados, chat, ligas, archivo, jugadores, sincronización y XP— siguen funcionando tras endurecer las reglas.
7. Node 24 puede permanecer instalado globalmente, pero Functions y CI se ejecutan con Node 22, que es el runtime declarado y soportado.
8. La implantación en producción es gradual, reversible y no exige pertenecer al equipo de pago de Vercel.

## 3. No objetivos

- No copiar datos reales de usuarios a local.
- No compartir por defecto una base de pruebas remota.
- No automatizar despliegues de Firebase a producción en cada `push`.
- No resolver en este trabajo los 83 errores y 12 avisos de lint ya existentes, salvo los que afecten a archivos modificados.
- No cambiar de proveedor de hosting ni crear un plan de pago de Vercel.
- No eliminar inmediatamente los endpoints HTTP antiguos; se retirarán sólo después de validar la migración.

## 4. Decisiones de arquitectura

### 4.1 Matriz de entornos

| Entorno | ID Firebase | Servicios | Datos | API de fútbol |
| --- | --- | --- | --- | --- |
| Desarrollo local | `demo-fantasya` | Emuladores locales | Seed determinista y efímero | Fixture local |
| Pruebas automatizadas | `demo-fantasya` | Emuladores locales | Seed aislado por ejecución | Fixture local |
| Preview de Vercel | `tictaktools` mientras no exista staging | Firebase real | Datos reales | Funciones desplegadas |
| Producción | `tictaktools` | Firebase real | Datos reales | Secret de producción |

Un ID con prefijo `demo-` no representa un proyecto Firebase real. Si algún servicio no está emulado, la llamada debe fallar en vez de caer silenciosamente en producción.

No se crea ahora un proyecto remoto de staging. Sólo se justificará si hace falta que dos personas reproduzcan el mismo estado, probar desde dispositivos externos, validar OAuth/webhooks reales o conectar un preview remoto sin tocar producción. En ese caso será un proyecto Firebase independiente y nunca una copia indiscriminada de datos reales.

Mientras no exista ese proyecto, cualquier preview de Vercel que tenga las variables actuales se tratará como producción: sirve para comprobar build, navegación y un smoke controlado, pero no para generar datos ficticios ni ejecutar pruebas destructivas.

### 4.2 Invariantes de seguridad local

- El modo Vite `development` exige `VITE_USE_FIREBASE_EMULATORS=true` y `VITE_FIREBASE_PROJECT_ID=demo-fantasya`.
- Si `import.meta.env.DEV` detecta otro project ID o el flag del emulador está desactivado, la aplicación aborta al iniciar con un error claro.
- No existe fallback de desarrollo hacia servicios reales.
- Los scripts locales pasan siempre `--project demo-fantasya`; no dependen del proyecto Firebase seleccionado globalmente.
- Los scripts de despliegue pasan siempre `--project tictaktools` de forma explícita.
- Ningún seed, test o limpieza acepta `tictaktools` como destino.
- La configuración de producción y los secretos de la API de fútbol no se escriben en archivos versionados.

### 4.3 Servicios y puertos

`firebase.json` declarará una topología fija:

| Servicio | Host | Puerto |
| --- | --- | ---: |
| Auth | `127.0.0.1` | 9099 |
| Firestore | `127.0.0.1` | 8080 |
| Functions | `127.0.0.1` | 5001 |
| Storage | `127.0.0.1` | 9199 |
| Emulator UI | `127.0.0.1` | 4000 |
| Vite | `127.0.0.1` | 5173 |

Se usará `singleProjectMode` para detectar mezclas accidentales de project IDs.

### 4.4 Flujo de arranque

`npm run dev` será la entrada principal. Internamente:

1. valida Node, Java, puertos y el ID `demo-fantasya`;
2. arranca Auth, Firestore, Functions, Storage y Emulator UI mediante `firebase emulators:exec`;
3. espera a que los servicios estén listos;
4. carga el seed determinista;
5. arranca Vite;
6. al cerrar Vite, detiene también los emuladores.

Habrá comandos separados para diagnóstico (`dev:web`, `dev:emulators`, `dev:seed`) y para ejecutar pruebas (`test:emulators`). La ruta normal seguirá siendo un solo comando.

No se importará ni exportará estado automáticamente entre sesiones. Así cada arranque parte del mismo escenario. La importación/exportación quedará como comando optativo para depuración puntual, en una carpeta ignorada por Git.

### 4.5 Configuración del cliente Firebase

`src/config/firebase.js` se convertirá en el único punto de inicialización y exportará:

- `app`
- `auth`
- `db`
- `functions`
- `storage`
- `analytics`

En desarrollo conectará una sola vez mediante `connectAuthEmulator`, `connectFirestoreEmulator`, `connectFunctionsEmulator` y `connectStorageEmulator`. Analytics quedará desactivado localmente.

Todos los componentes dejarán de llamar a `getFunctions()` por su cuenta. Las callable Functions usarán la instancia central con región `us-central1`, por lo que el SDK resolverá automáticamente emulador o producción.

Se versionará `.env.development` únicamente con valores ficticios del proyecto `demo-fantasya`. Los valores reales seguirán fuera del repositorio.

### 4.6 Functions y sincronización de jugadores

Los endpoints actuales no se sustituirán de golpe. Se añadirán primero callables V2 con nombres nuevos y comprobaciones de rol:

- `syncLaLigaPlayersV2`: exige autenticación y `appRole == "superadmin"`.
- `getLaLigaSyncStatusV2`: exige autenticación; la mutación sigue reservada al superadministrador.

El frontend migrará a `httpsCallable(functions, ...)`, eliminando las URLs `*.a.run.app` y el consejo actual de conceder Invoker a `allAuthenticatedUsers`. Los endpoints antiguos permanecerán durante la validación y se retirarán en un cambio posterior.

En emulador, la sincronización usa por defecto un fixture versionado con una muestra representativa de equipos, posiciones, altas, cambios y bajas. El acceso real a `football-data.org` requiere simultáneamente:

- un comando explícito de modo live;
- `ALLOW_LIVE_FOOTBALL_API=true`;
- `FOOTBALL_DATA_API_KEY` disponible sólo para Functions.

La ausencia de cualquiera de esas tres condiciones impide la llamada externa. El desarrollo habitual no necesita cuenta ni API key de football-data.org.

En producción la clave se declarará con `defineSecret("FOOTBALL_DATA_API_KEY")` y se vinculará sólo a la función que la consume. El override local vivirá en un archivo ignorado por Git.

### 4.7 Autorización y escrituras sensibles

Se añadirá un helper de reglas `isSuperAdmin()` basado en el documento del usuario. Las reglas y Functions se probarán como una unidad.

#### Perfiles

- Los flujos de email y Google/perfil incompleto convergen en `createProfileDocuments`, que será idempotente y validará el esquema en servidor.
- Las reglas deniegan la creación directa de perfiles y usernames desde el cliente; Admin SDK realiza ambas escrituras de forma atómica.
- El propietario sólo puede editar los campos de perfil necesarios: `bio`, `photoURL`, `pinnedTrophies`, `savedPosts` y su lista `following`, con validaciones de tipo y límites.
- `username`, `email`, `createdAt`, `xp` y `appRole` quedan fuera de las escrituras directas del cliente.
- Un usuario sólo puede añadir o quitar su propio UID en `followers` de otra persona; no puede reescribir el resto del array.
- La operación de seguir/dejar de seguir conserva la transacción actual de dos documentos y tendrá pruebas positivas y negativas.

#### Roles

- Se añade `setUserAppRole`, callable sólo por superadministradores.
- Se validan únicamente los roles conocidos.
- No se permite eliminar el último superadministrador.
- El seed crea directamente un superadministrador local mediante Admin SDK; la producción conserva sus administradores existentes.

#### XP

- Ningún cliente puede escribir `xp` directamente.
- Los eventos de XP se derivan en Functions de documentos canónicos —por ejemplo posts y transferencias— y son idempotentes mediante un identificador de evento.
- El recálculo completo se mueve a una callable de superadministración.
- La puntuación visible debe ser igual a la calculada por la lógica actual para el mismo conjunto de datos.

#### Jugadores

- La lectura de `players` y `laLigaPlayers` sigue disponible donde hoy la necesita la app.
- Crear, editar o borrar `players` requiere `superadmin`, coherente con `SuperAdminRoute`.
- `laLigaPlayers` sólo se escribe desde Admin SDK en Functions.
- La sincronización comprueba el rol en servidor; ocultar la pantalla no cuenta como autorización.

#### Ligas y membresía

- Crear una liga exige que `ownerId` coincida con el usuario autenticado; las reglas dejarán de consultar el campo inexistente `creatorId`.
- Crear una temporada exige que el creador quede como administrador inicial y que la forma mínima del documento sea válida.
- Un miembro normal sólo puede cambiar sus campos permitidos dentro de `members.{uid}` —por ejemplo `teamName` y `finances`— sin tocar `role`, puntos, otros miembros ni el resto de la temporada.
- Abandonar una temporada sólo puede eliminar la entrada propia y nunca la de terceros.
- Alta, expulsión, cambio de rol, aprobación/rechazo y desvinculación se ejecutan por operaciones de administrador verificadas. La aprobación de solicitudes convergerá en una callable `reviewJoinRequest` atómica usada tanto por `AdminTab` como por `ChatPage`.
- La unión directa con un payload arbitrario queda denegada; las reglas no confían en que la interfaz oculte controles.

#### Chat

- Crear o recuperar conversaciones sigue pasando por `createOrGetChat` y la función valida que el segundo usuario exista.
- Sólo los UIDs presentes en `participants` pueden leer el chat, actualizar sus metadatos, leer mensajes o crear mensajes.
- `senderId` debe coincidir con el usuario autenticado y los campos de participación permanecen inmutables.
- El estado de una solicitud de unión se cambia mediante `reviewJoinRequest`; ningún cliente puede editarlo directamente en el mensaje.
- La revisión de una solicitud actualiza de forma atómica la solicitud, la membresía y el estado visible; si la notificación de chat falla, la operación no deja una membresía a medias.

#### Feed y moderación

- Autoría y campos inmutables de posts, comentarios y respuestas quedan validados.
- Un usuario autenticado sólo puede añadir o quitar su propio UID en `likes`.
- El autor puede borrar su contenido.
- Un superadministrador puede borrar posts para que la interfaz de moderación funcione realmente.
- Guardar posts sólo modifica `savedPosts` del propio usuario.

### 4.8 Storage

Las rutas del código y las reglas se unifican. La ruta canónica inicial será la que ya usa el cliente:

- `profile-pictures/{uid}`: lectura pública, escritura del propietario.
- `posts/{uid}/{file}`: lectura autenticada y escritura del propietario.
- `chats/{chatId}/{file}`: sólo participantes del chat.
- `season-pictures/{leagueId}/{seasonId}`: lectura autenticada y escritura de administradores de esa temporada.

Las reglas limitarán tamaño y `contentType` a imágenes admitidas. Las comprobaciones de participantes y administradores se harán contra Firestore cuando sea necesario. Se crearán pruebas específicas para subida, lectura y borrado, incluida la denegación entre usuarios.

### 4.9 Seed local

El seed será idempotente, sólo aceptará `demo-fantasya` y generará UIDs estables. Documentará estas cuentas ficticias:

| Rol | Email | Contraseña local |
| --- | --- | --- |
| Superadministrador | `superadmin@fantasya.local` | `FantasyaDev1!` |
| Administrador de liga | `league-admin@fantasya.local` | `FantasyaDev1!` |
| Usuario normal | `user@fantasya.local` | `FantasyaDev1!` |

Los datos mínimos incluirán:

- perfiles y relaciones de seguimiento;
- una liga activa y otra archivada;
- una temporada con administrador, miembro y equipo fantasma;
- jornadas, alineaciones, transferencias y porra;
- posts, comentario, respuesta, likes y guardado;
- jugadores manuales y una muestra sincronizada;
- estado de sincronización, trofeo, logro y XP coherente.

Estas credenciales no son secretos ni sirven fuera del emulador.

## 5. Pruebas y calidad

Se incorporará `@firebase/rules-unit-testing` y un runner de pruebas compatible con Node 22.

### 5.1 Matriz mínima de reglas

Las pruebas deberán demostrar, como mínimo:

- un usuario no puede promoverse, cambiar su XP ni editar identidad protegida;
- un superadministrador puede cambiar roles y un usuario normal no;
- no puede eliminarse el último superadministrador;
- seguir, dejar de seguir, guardar y fijar trofeos siguen funcionando;
- un usuario sólo puede alterar su propia reacción en likes;
- el autor y el superadministrador pueden moderar según lo previsto;
- un usuario normal no puede mutar la base global de jugadores ni ejecutar sync;
- un administrador de liga conserva todas las operaciones que usa la UI;
- un miembro no adquiere permisos de administrador modificando payloads;
- un miembro no puede alterar a otro miembro ni unirse directamente saltándose la solicitud;
- un usuario ajeno no puede leer, escribir ni subir archivos en un chat;
- sólo un administrador de la temporada puede aprobar o rechazar su solicitud de unión;
- Storage acepta las cuatro rutas legítimas y rechaza acceso cruzado, tamaño o MIME inválidos.

### 5.2 Pruebas de Functions

- creación de perfil e idempotencia;
- comprobación de autenticación y roles;
- XP idempotente y recálculo;
- sincronización con fixture, incluida actualización de estado y errores;
- protección frente a modo live sin las tres condiciones;
- callables de chat y desvinculación con sus permisos actuales.

### 5.3 Prueba integrada y smoke manual

Una ejecución con emuladores recorrerá registro/login, creación de liga, alta y edición de jugador, archivo/restauración, post/like/comentario, seguimiento, subida de imágenes y sync fixture.

Antes de producción se comprobarán además:

- `npm run build`;
- sintaxis y carga de Functions con Node 22;
- reglas e índices versionados;
- preview de Vercel;
- logs de Functions y una prueba de humo con cuenta real autorizada.

El emulador de Firestore no reproduce IAM ni exige índices compuestos como producción, y Functions no replica exactamente el contenedor, CPU o memoria desplegados. Por eso la suite local no sustituye el smoke de producción.

## 6. CI y versiones

- Se añaden `.nvmrc` y `.node-version` con Node 22 y `engines.node` en el `package.json` raíz; `fnm` activa Node 22 mediante un script versionado sólo en la sesión del proyecto. Node 24 global no se desinstala.
- GitHub Actions usa Node 22 y ejecuta instalación limpia, build, comprobación de Functions y pruebas con emuladores.
- `firestore.indexes.json` deja de estar ignorado y se versiona.
- El pipeline bloquea cualquier aumento sobre la deuda lint auditada de 83 errores y 12 avisos, además de bloquear build y tests. Una reducción pasa y permite bajar el presupuesto en un cambio posterior; la deuda histórica no vuelve rojo el primer CI por sí sola.
- Firebase no se despliega automáticamente desde CI. Los comandos de producción son manuales y explícitos.

## 7. Estrategia de entrega sin interrupciones

1. Añadir infraestructura local, seed, fixtures y pruebas sin cambiar producción.
2. Corregir reglas y cliente bajo pruebas de regresión.
3. Desplegar primero las nuevas callable Functions V2 manteniendo las antiguas.
4. Publicar el frontend que consume V2 mediante el flujo GitHub → Vercel ya existente.
5. Validar preview y producción.
6. Desplegar las reglas endurecidas sólo cuando el frontend nuevo esté activo.
7. Retirar endpoints HTTP antiguos en un cambio posterior tras comprobar uso y logs.

Cada paso tendrá su propio commit y podrá revertirse sin restaurar datos. No se borrarán ni migrarán datos reales como parte del setup.

## 8. Accesos y cuentas

Accesos ya confirmados:

- Firebase CLI: `jordisumba@gmail.com`, rol propietario sobre `tictaktools`.
- GitHub: `JordiSRodriguez`, permiso de escritura sobre el repositorio.
- Vercel: sin acceso directo confirmado, pero no es necesario para el flujo de despliegue automático desde GitHub.

No se necesita iniciar sesión ahora en Gmail ni en Firebase Console para implementar o probar el entorno local. Codex Browser no tenía una pestaña visible que permitiera verificar Gmail, pero el acceso efectivo a Firebase ya está demostrado por CLI.

Sólo podrían hacer falta más adelante:

- Firebase/Google Cloud Console, para revisar logs, IAM o secretos durante el smoke de producción;
- Vercel owner, únicamente si hay que cambiar variables, dominios o configuración del proyecto, no para que Git genere despliegues;
- football-data.org, únicamente para rotar o crear la API key real; no para desarrollo local.

## 9. Criterios de aceptación

La implementación se considerará terminada cuando:

- una máquina limpia pueda seguir la documentación y arrancar con `npm run dev`;
- la UI muestre claramente que está usando emuladores;
- ningún comando de desarrollo, seed o pruebas pueda apuntar por accidente a `tictaktools`;
- las tres cuentas de seed puedan recorrer sus permisos esperados;
- todas las pruebas de reglas, Storage y Functions pasen en Node 22;
- el fixture de fútbol permita probar la sincronización sin red ni credenciales;
- build y CI estén verdes;
- se haya ejecutado el checklist de regresión de las funciones visibles;
- la migración de producción se haya hecho por fases, sin depender de Vercel Pro.

## 10. Fuentes de diseño

- Firebase Emulator Suite: <https://firebase.google.com/docs/emulator-suite/install_and_configure>
- Firestore Emulator y proyectos demo: <https://firebase.google.com/docs/emulator-suite/connect_firestore>
- Functions Emulator: <https://firebase.google.com/docs/emulator-suite/connect_functions>
- Authentication Emulator: <https://firebase.google.com/docs/emulator-suite/connect_auth>
- Storage Emulator: <https://firebase.google.com/docs/emulator-suite/connect_storage>
- Pruebas de Security Rules: <https://firebase.google.com/docs/firestore/security/test-rules-emulator>
- Variables y modos de Vite: <https://vite.dev/guide/env-and-mode>

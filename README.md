# Fantasya

Aplicación React + Firebase para gestionar ligas de fantasía. El entorno de
desarrollo usa exclusivamente Firebase Emulator Suite y el proyecto ficticio
`demo-fantasya`; no necesita acceso a Firebase ni a Vercel.

## Requisitos

- Windows 11 con PowerShell.
- [`fnm`](https://github.com/Schniz/fnm) para activar Node.js 22 sólo en este
  repositorio. Node.js 24 puede seguir instalado globalmente.
- npm 10 o superior.
- Java 21 o superior para Firebase Emulator Suite.

Si falta `fnm`, se puede instalar para el usuario actual con:

```powershell
winget install --exact --id Schniz.fnm --accept-source-agreements --accept-package-agreements
```

Después hay que abrir una PowerShell nueva.

## Instalación

Desde la raíz del repositorio:

```powershell
. .\scripts\activate-node22.ps1
npm ci
npm --prefix functions ci
if (-not (Test-Path -LiteralPath functions\.secret.local)) {
    Copy-Item -LiteralPath functions\.secret.local.example -Destination functions\.secret.local
}
```

El script comprueba que la sesión está usando Node.js 22. Los archivos
`.nvmrc` y `.node-version` contienen la misma versión para otros gestores
compatibles.

## Desarrollo local seguro

```powershell
. .\scripts\activate-node22.ps1
npm run dev
```

Abre <http://127.0.0.1:5173>. La Emulator UI está en
<http://127.0.0.1:4000>. En la aplicación debe verse
“Firebase local · demo-fantasya”.

`npm run dev` arranca Auth, Firestore, Functions y Storage Emulator, crea datos
deterministas y después inicia Vite. Al detenerlo con `Ctrl+C`, el wrapper y un
watchdog oculto limpian únicamente el árbol de procesos de esa sesión cuando
pertenece a este checkout y al proyecto demo, y comprueban que sus puertos
locales hayan quedado libres.

| Rol | Email | Contraseña |
| --- | --- | --- |
| Superadministrador | `superadmin@fantasya.local` | `FantasyaDev1!` |
| Administrador de liga | `league-admin@fantasya.local` | `FantasyaDev1!` |
| Usuario normal | `user@fantasya.local` | `FantasyaDev1!` |

Estas cuentas sólo existen en Auth Emulator. El frontend y el seed abortan si
el project ID no es exactamente `demo-fantasya` o falta algún emulador
obligatorio. No se copian datos reales.

## Seguridad local verificable

| Identidad | Operaciones permitidas | Operaciones bloqueadas |
| --- | --- | --- |
| Miembro de temporada | Editar sus campos de perfil seguros y su equipo, salir de la temporada, publicar y reaccionar con su propio UID, chatear como participante y subir sus imágenes. | Cambiar roles, XP, propietarios, otros miembros, premios o eventos de sistema; leer chats ajenos. |
| Administrador de temporada | Lo anterior, más operaciones de temporada, revisión atómica de solicitudes, trofeos, retos e imagen de temporada. El propietario conserva en exclusiva la creación y eliminación de liga/temporada. | Suplantar identidades, alterar el propietario o escribir directamente los espejos de logros/XP. |
| Superadministrador global | Asignar roles mediante Function, sincronizar jugadores y moderar publicaciones e imágenes. | Acceder por ese rol a chats privados o temporadas de las que no sea miembro/administrador. |
| Usuario ajeno a una liga | Leer contenido público, usar su propio perfil/feed y solicitar acceso por el flujo controlado. | Leer transferencias, miembros o chats privados; modificar la liga o incorporarse directamente. |

Las reglas y handlers anteriores se comprueban en una sola sesión aislada de
emuladores con:

```powershell
npm run test:integrity
```

## Comprobaciones

```powershell
npm run test:unit
npm run test:seed
npm run test:integrity
npm run build
npm run verify
```

`npm run test:seed` posee todo el ciclo de vida de los emuladores, así que se
puede repetir sin dejar servicios escuchando ni duplicar datos.

## Producción

El desarrollo local no requiere iniciar sesión en Firebase, Google o Vercel.
Los despliegues son manuales, requieren autorización separada y siempre deben
nombrar el proyecto real `tictaktools` explícitamente. Mientras no exista un
entorno de staging aislado, cualquier preview de Vercel debe tratarse como
producción.

Consulta [el setup diario y la matriz de accesos](docs/development.md). El orden
de publicación, las comprobaciones y el rollback se documentan en el
[runbook de producción](docs/releases/firebase-production-runbook.md); el
runbook no autoriza por sí mismo a ejecutar ninguna acción remota.

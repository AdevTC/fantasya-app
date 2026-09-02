# Desarrollo local y accesos

Este documento describe el entorno seguro de desarrollo de Fantasya. El flujo
normal funciona sin iniciar sesión en Firebase, Google, Vercel ni
football-data.org: usa exclusivamente Firebase Emulator Suite, el proyecto
ficticio `demo-fantasya` y datos deterministas versionados.

Estado de accesos comprobado el 2 de septiembre de 2026. Los permisos cloud
pueden cambiar y deben volver a comprobarse antes de una release.

## Primer setup en Windows

Requisitos:

- Windows 11 y PowerShell.
- Node 22 instalado previamente con `fnm install 22` desde una PowerShell
  normal.
- Java 21 o superior.
- Acceso Git al repositorio para clonar o actualizar el código.

Desde la raíz del repositorio:

```powershell
. .\scripts\activate-node22.ps1
node --version
java -version
npm ci
npm --prefix functions ci
if (-not (Test-Path -LiteralPath functions\.secret.local)) {
    Copy-Item -LiteralPath functions\.secret.local.example -Destination functions\.secret.local
}
npm run dev
```

El script activa Node 22 sólo en la PowerShell actual. Acepta únicamente un
`node.exe` oficial firmado por OpenJS Foundation, reutiliza el caché canónico de
`fnm` cuando Codex no puede ver su alias de WinGet y fija el `npm` de esa misma
instalación. Node 24 puede permanecer instalado globalmente, pero no se usa en
Fantasya: que una versión sea posterior no garantiza compatibilidad total con
Firebase Functions, dependencias nativas o CI. El repositorio y las Functions
declaran Node 22 y rechazan otra versión para mantener el mismo runtime en
local, pruebas y despliegue.

La aplicación queda en <http://127.0.0.1:5173> y Emulator UI en
<http://127.0.0.1:4000>. Debe aparecer el indicador
`Firebase local · demo-fantasya`. `Ctrl+C` detiene Vite y los emuladores de esa
sesión; el wrapper comprueba también que sus puertos queden libres.

## Uso diario

Una vez instaladas las dependencias:

```powershell
. .\scripts\activate-node22.ps1
npm run dev
```

Repite ambos `npm ci` cuando cambie cualquiera de los lockfiles. No uses
`npm install` para una preparación reproducible.

Las cuentas locales son:

| Rol | Email | Contraseña |
| --- | --- | --- |
| Superadministrador | `superadmin@fantasya.local` | `FantasyaDev1!` |
| Administrador de liga | `league-admin@fantasya.local` | `FantasyaDev1!` |
| Usuario normal | `user@fantasya.local` | `FantasyaDev1!` |

Sólo existen en Auth Emulator. El seed se puede repetir y restaura un escenario
con ligas, miembros, perfil, feed, chat, premios y jugadores. Nunca importa
cuentas ni documentos de `tictaktools`.

No necesitamos una base de pruebas compartida: cada desarrollador obtiene el
mismo estado inicial desde el seed y el fixture de LaLiga versionados. Un estado
compartido sólo tendría sentido para reproducir una secuencia mutable que el
seed aún no modele. En ese caso se añade al repositorio un fixture mínimo,
ficticio y revisado; no se exportan datos reales ni se comparte una instancia
cloud de pruebas improvisada.

## Comprobaciones

```powershell
npm run test:unit
npm run test:ci
npm run verify
```

- `test:unit` es la comprobación rápida sin emuladores.
- `test:ci` crea una sesión limpia de Auth, Firestore, Functions y Storage,
  carga el seed y ejecuta todas las pruebas de reglas y handlers.
- `verify` añade build, sintaxis de Functions y el presupuesto ESLint. Es la
  puerta local completa antes de una PR o release.

La CI de GitHub ejecuta el mismo `verify` con Node 22 y Java 21, sin credenciales
ni permisos de despliegue.

### Auditoría de dependencias

Estado comprobado el 2 de septiembre de 2026 con `npm audit --omit=dev`:

- La aplicación web tiene 0 vulnerabilidades conocidas en dependencias de
  producción.
- Functions no tiene avisos altos ni críticos. npm informa de 7 avisos
  moderados que corresponden a una única vulnerabilidad transitiva de `uuid`
  incluida por la ruta de Cloud Storage de la versión más reciente de
  `firebase-admin`. El código de Functions de Fantasya no usa ese cliente de
  Storage.
- npm sólo ofrece resolverlos con `--force`, bajando a
  `firebase-admin@10.3.0`. No se aplica: introduciría una versión antigua y un
  cambio incompatible. Debe reevaluarse cuando Google publique una cadena de
  dependencias corregida.

La auditoría completa puede mostrar además avisos en herramientas sólo de
desarrollo, principalmente Firebase CLI. No forman parte del artefacto web ni
del runtime desplegado; se mantienen actualizadas y se revisan por separado.

## Matriz de accesos

| Capacidad | ¿Se necesita en local? | Estado comprobado | Cuenta o acción |
| --- | --- | --- | --- |
| Clonar, crear ramas, push y PR | Sí para colaborar | Disponible; repositorio público y permiso `WRITE` | GitHub `JordiSRodriguez` sobre `AdevTC/fantasya-app` |
| Auth, Firestore, Functions y Storage Emulator | Sí | Disponible sin login cloud | Proyecto ficticio `demo-fantasya` |
| Firebase producción | Sólo para release | Login y proyecto visibles; el test IAM de solo lectura pasó para Functions, reglas, índices, metadatos de secretos, `iam.serviceAccounts.actAs` y ajustes IAM | `jordisumba@gmail.com`, proyecto `tictaktools` |
| Sincronización real de LaLiga | Sólo para sync real en producción | Bloqueada: falta el secreto `FOOTBALL_DATA_API_KEY` | Preparar una clave existente o una cuenta en football-data.org antes de esa release |
| Despliegue fuente en Vercel | Sólo tras merge/push aprobado | No disponible directamente para Jordi en el proyecto Hobby | El owner de Vercel debe disparar o autorizar el despliegue del commit |
| Variables, dominio y ajustes de Vercel | Sólo si cambian | Sin acceso local: no hay Vercel CLI ni vínculo `.vercel/project.json` | Lo realiza el owner del proyecto Vercel |
| Gmail | No | No conectado ni inspeccionado | No hace falta; Firebase CLI ya está autenticado |

La prueba IAM es una fotografía puntual, no una concesión nueva de permisos. No
leyó datos de usuarios, valores de secretos ni políticas; sólo preguntó qué
acciones permite la identidad activa.

No hace falta iniciar ninguna sesión adicional para desarrollar. Antes de la
sincronización real hará falta la clave de football-data.org. Para publicar, el
owner de Vercel debe estar disponible; añadir a Jordi como miembro de un proyecto
Hobby no es la solución y Vercel reserva esa colaboración de equipo para Pro.
La [documentación actual de Vercel sobre colaboración](https://vercel.com/docs/deployments/troubleshoot-project-collaboration)
indica que, en Hobby, el autor que dispara el despliegue debe ser el owner.

## Frontera de producción

Los comandos de desarrollo, seed, pruebas y CI sólo aceptan `demo-fantasya` y
los hosts locales esperados. No pueden desactivarse mediante una variable de
entorno.

Los comandos `deploy:prod:*` son otra ruta: exigen Node 22, `main`, árbol limpio,
`origin` canónico, igualdad con `origin/main`, cuenta y proyecto fijos, terminal
interactiva y una confirmación literal. `production:preflight` ejecuta un
`git fetch origin main`, por lo que actualiza esa referencia Git local, pero no
escribe en GitHub, Firebase ni Vercel.

El `origin` de release se compara de forma deliberadamente estricta con
`https://github.com/AdevTC/fantasya-app.git`. Un clon configurado por SSH puede
desarrollar normalmente, pero no supera el preflight hasta usar esa URL HTTPS
exacta; es un cierre fail-closed para evitar publicar desde un fork.

No ejecutes ningún comando de producción desde esta guía. El orden, las
aprobaciones y el rollback están en el
[runbook de release de Firebase](releases/firebase-production-runbook.md).

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
deterministas y después inicia Vite. Al detenerlo con `Ctrl+C`, el wrapper
espera a Firebase y elimina únicamente cualquier proceso Firestore huérfano
que haya arrancado esa misma sesión y pertenezca a este checkout.

| Rol | Email | Contraseña |
| --- | --- | --- |
| Superadministrador | `superadmin@fantasya.local` | `FantasyaDev1!` |
| Administrador de liga | `league-admin@fantasya.local` | `FantasyaDev1!` |
| Usuario normal | `user@fantasya.local` | `FantasyaDev1!` |

Estas cuentas sólo existen en Auth Emulator. El frontend y el seed abortan si
el project ID no es exactamente `demo-fantasya` o falta algún emulador
obligatorio. No se copian datos reales.

## Comprobaciones

```powershell
npm run test:unit
npm run test:seed
npm run build
```

`npm run test:seed` posee todo el ciclo de vida de los emuladores, así que se
puede repetir sin dejar servicios escuchando ni duplicar datos.

## Producción

El desarrollo local no requiere iniciar sesión en Firebase, Google o Vercel.
Los despliegues son manuales, requieren autorización separada y siempre deben
nombrar el proyecto real `tictaktools` explícitamente. Mientras no exista un
entorno de staging aislado, cualquier preview de Vercel debe tratarse como
producción.

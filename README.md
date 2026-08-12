# Agent Genia for Windows

Aplicación oficial de escritorio de Agent Genia para Windows 10/11 de 64 bits.

Este repositorio contiene el cliente Electron, el backend Python de Agent Genia
y el harness completo de Pi. El instalador incluye un Python aislado, Pi, la
extensión de conectores y pi-chrome; Electron inicia el backend en loopback y lo
detiene al cerrar la aplicación. La autenticación, los planes y los secretos de
producción siguen en los servicios de Agent Genia y nunca se incluyen en el
instalador.

## Funcionalidad

- Inicio de sesión real con Google.
- Marketplace y conexiones OAuth de plugins.
- Creación, personalización y persistencia local de bots.
- Checkout y portal de suscripción de Stripe.
- Sesiones cifradas con `safeStorage` de Electron, que usa DPAPI en Windows.
- Instancia única y controles de ventana nativos de Windows.
- Backend local en un puerto aleatorio de `127.0.0.1`, con token administrativo
  efímero, SQLite/clave por instalación y proceso administrado por Electron.
- Harness de Pi con ejecuciones aisladas, carga dinámica de conectores y soporte
  de pi-chrome mediante perfiles efímeros por tarea.

## Desarrollo

Requiere Node.js 22, pnpm 11 y Python 3.12 para desarrollo y pruebas.

```powershell
pnpm install
pnpm start
```

Por defecto, la cuenta y la facturación usan
`https://agentgenia-api.onrender.com`, mientras que el catálogo alojado de
conectores usa `https://outcome-service.onrender.com`. Para desarrollo se
pueden sustituir con `WRAPPER_SERVICE_URL` y `OUTCOME_SERVICE_URL`.

## Validación

```powershell
pnpm test
pnpm test:connectors
python -m unittest discover -s tests -p "test_*.py"
pnpm smoke
```

## Crear el instalador

En Windows:

```powershell
pnpm dist:win
```

El instalador NSIS se guarda en `release/AgentGenia-Setup-<version>-x64.exe`.
Cada push a `main` también ejecuta la compilación en GitHub Actions y publica
el instalador como artifact del workflow.

## Seguridad

El renderer está aislado (`contextIsolation`, sandbox y sin integración de
Node). Todas las operaciones de red y secretos pasan por IPC validado en el
proceso principal. El runtime escucha solo en loopback, hereda una lista mínima
de variables de entorno y recibe un `ADMIN_TOKEN` aleatorio nuevo en cada
arranque. El instalador no contiene secretos de servidor.

# Agent Genia for Windows

Aplicación oficial de escritorio de Agent Genia para Windows 10/11 de 64 bits.

Este repositorio contiene únicamente el cliente Electron. La autenticación, los
planes y el acceso a los modelos se procesan en el backend de Agent Genia; las
credenciales privadas de Stripe, Google y los conectores nunca se incluyen en
el instalador.

## Funcionalidad

- Inicio de sesión real con Google.
- Marketplace y conexiones OAuth de plugins.
- Creación, personalización y persistencia local de bots.
- Checkout y portal de suscripción de Stripe.
- Sesiones cifradas con `safeStorage` de Electron, que usa DPAPI en Windows.
- Instancia única y controles de ventana nativos de Windows.

## Desarrollo

Requiere Node.js 22 y pnpm 11.

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
proceso principal. El instalador no contiene secretos de servidor.

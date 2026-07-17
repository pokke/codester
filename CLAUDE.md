# CLAUDE.md — Codester

Windows-klient för kod & Git. Electron 31 + React 18 + TypeScript, byggd med
electron-vite. Se [README.md](README.md) för vad appen gör.

## Språk

- **All UI-text, alla kommentarer och alla commit-meddelanden på svenska.**
- **Inga `Co-Authored-By`- eller andra AI-trailers i commit-meddelanden.** Någonsin.

## Arkitektur

Tre processer med hårda gränser:

- `src/main/` – all git-, GitHub-, terminal- och filsystemslogik. Services i
  `services/`, IPC-handlers i `ipc.ts`.
- `src/preload/` – enda bryggan. Exponerar en typad `window.api`.
- `src/renderer/` – React-UI. Rör aldrig Node/Electron direkt.
- `src/shared/types.ts` – delade typer.

**IPC-mönstret:** `handle()`-wrappern i `ipc.ts` packar allt i ett
`Result<T> = { ok: true; data } | { ok: false; error }`. Preload exponerar
`invoke<T>()`. Renderern packar upp via `useUnwrap()` (visar fel som toast).
En ny förmåga går alltid: **service → ipc.ts → preload → renderer**.

## Säkerhet (icke förhandlingsbart)

- GitHub-token lagras krypterat via `safeStorage` (DPAPI) och **läcker aldrig till
  renderern**. `github.getToken()` är main-only.
- `safeStorage` fungerar **först efter app 'ready'** – ladda därför token **lat**
  (`ensureTokenLoaded`), aldrig vid modul-import. (Annars tvingas omlogin varje start.)
- All GitHub-API-trafik sker i main (`services/github.ts`).
- Externa länkar: bara `https`/`http`/`mailto` via den scheme-allowlistade
  `setWindowOpenHandler` → `shell.openExternal`.
- **Inga native OS-dialoger** för bekräftelser – allt i appen (`useConfirm`).
- Git-nätverk mot github.com autentiseras med token via engångs-`http.extraheader`
  på kommandoraden. Token får aldrig hamna i `.git/config`.

## Verifiering (varje ändring)

```bash
npm run typecheck   # tsc mot web + node
npm run build       # electron-vite build
npm run dev         # kort boot, kolla stderr
```

Ignorera detta brus i dev-stderr: `gpu_process`, `network_service`,
`exit_code=143`, `Electron Security Warning`, `Failed to fetch extension`,
`DevTools`.

**Bygg inte installern lokalt** (`npm run dist`) – CI gör det. Undantag: om själva
paketeringen ändrats.

## Versionering & release

Per ändring: bumpa `version` i `package.json` → committa → `git tag vX.Y.Z`.
Användaren pushar själv.

- Commit-meddelanden skrivs via message-fil (`git commit -F`) – PowerShell hanterar
  inte backticks/citattecken väl. Använd Bash-heredoc.
- **Pusha en tagg i taget.** GitHub triggar inte tagg-workflows om fler än tre
  taggar pushas samtidigt. Alternativt: Actions → Run workflow (bygger senaste taggen).
- CI publicerar bara den **högsta** taggen.

## Kända fallgropar

- **xterm-storlek:** `.xterm-host` får **inte** ha padding – FitAddon mäter värdens
  storlek men drar bara av `.xterm`-elementets padding, vilket ger en kolumn/rad för
  mycket. Luft läggs utanför terminalen. På skalade skärmar (HiDPI) är den *faktiskt
  renderade* cellbredden bredare än den rapporterade – därför clampas cols/rows mot
  uppmätt DOM-storlek i `refit()`. WebGL-canvasen målar in i padding (innanför
  `overflow:hidden`), så luckor måste ligga utanför elementet.
- **Flex-hygien:** varje led i kedjan behöver `min-width: 0` **och** `min-height: 0`,
  annars tvingar innehållet ut layouten ur fönstret.
- **TS/JS-diagnostik från LSP är avstängd** (`editor/lsp.ts`) – bundlad tsserver
  klarar inte projektets multi-tsconfig och gav falska fel. Sanningen är
  `npm run typecheck`/CI. Slå inte på igen utan att lösa projektupplösningen.
- **Uppdaterarens intervall** är 5 min (+ vid start). Manuell koll kringgår strypningen.

## Nuläge

- AI-integration är **pausad** på användarens begäran.
- Repot måste vara **publikt** (krävs för auto-update via GitHub Releases).
- Arbetssätt: större sammanhållna block per version, verifiera, committa, tagga.

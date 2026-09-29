# CLAUDE.md — Codester

Windows-klient för kod & Git. Electron 43 + React 18 + TypeScript, byggd med
electron-vite 5 (Vite 7), paketerad med electron-builder 26. Se
[README.md](README.md) för vad appen gör.

## Språk

- **All UI-text, alla kommentarer och alla commit-meddelanden på svenska.**
- **Inga `Co-Authored-By`- eller andra AI-trailers i commit-meddelanden.** Någonsin.

## Arkitektur

Tre processer med hårda gränser:

- `src/main/` – all git-, GitHub-, terminal- och filsystemslogik. Services i
  `services/`, IPC-hanterare i `ipc.ts`.
- `src/preload/` – enda bryggan. Exponerar en typad `window.api`.
- `src/renderer/` – React-UI. Rör aldrig Node/Electron direkt.
- `src/shared/` – delade typer (`types.ts`) och IPC-kontraktet (`ipc.ts`).

**IPC-kontraktet:** `src/shared/ipc.ts` (`IpcContract`) anger för varje
invoke-kanal argument och returtyp. `handlers` i `ipc.ts` kontrolleras mot det med
`satisfies IpcHandlerMap`, och preloads `invoke()` härleder typerna därifrån – skriv
aldrig `invoke<T>` för hand. Allt packas i `Result<T> = { ok: true; data } | { ok:
false; error }`; renderern packar upp via `useUnwrap()` (visar fel som toast).

En ny förmåga: **service → kontraktsrad i `shared/ipc.ts` → hanterare i `ipc.ts` →
metod i preload → renderer.** Glömmer man ett led blir det kompileringsfel.
Kanaler som behöver avsändaren (`e.sender`) eller inte ska Result-packas –
terminal, LSP och språkserverinstallation – registreras direkt i `registerIpc()`
och ingår inte i kontraktet.

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

Om den installerade Codester körs samtidigt delar de datakatalog: dev-instansen
får `disk_cache`/`cache_util`-fel, och första `localStorage`-läsningen kan blockera
~6 s på låset. **Mät prestanda mot produktionsbygget med egen datakatalog:**
`node_modules/electron/dist/electron.exe . --user-data-dir=<temp>` efter
`npm run build` (dev-servern är långsammare och missvisande).

Inga tester finns. Rena funktioner (t.ex. `ui/gitStatus.ts`) verifieras genom att
bunta dem med `npx esbuild` och köra mot kända indata.

**Bygg inte installern lokalt** (`npm run dist`) – CI gör det. Undantag: om själva
paketeringen ändrats.

## Versionering & release

Per ändring: bumpa `version` i `package.json` → committa → `git tag vX.Y.Z`.
Användaren pushar själv.

- Commit-meddelanden skrivs via message-fil (`git commit -F`) – PowerShell hanterar
  inte backticks/citattecken väl. Använd Bash-heredoc.
- **Git Bash-heredocs slår ihop `\\` till `\`**, även med `<< 'EOF'`. Skript med
  escapes (`\n`, `\0`, regex) skrivs med filverktyget, inte via heredoc.
- **Pusha en tagg i taget.** GitHub triggar inte tagg-workflows om fler än tre
  taggar pushas samtidigt. Alternativt: Actions → Run workflow (bygger senaste taggen).
- CI publicerar bara den **högsta** taggen. Betataggar (`vX.Y.Z-beta.N`) blir
  prereleases med egen uppdateringskanal.

## Kända fallgropar

- **Filbevakning** (`services/watcher.ts`): en rekursiv `fs.watch` per rot – **inte**
  chokidar, som skapade en synkron `fs.watch` per fil och låste main i sekunder vid
  start. Ändringar filtreras: gitignorerade filer (`git check-ignore --stdin -z`)
  och kataloger räknas inte. Kataloger måste bort, annars ger `.git` (som ändras
  varje gång git tar `index.lock`) en loop där appens egna git-anrop utlöser nya
  omladdningar. Filer inuti `.git/` räknas alltid.
- **Terminalsessioner lever i main** och överlever att xterm-instansen avmonteras
  (projektbyte). Main buffrar rå utdata per session och spelar upp den när en ny
  xterm ansluter (`ensureTerminal`) – annars tappas historiken och markören hamnar fel.
- **Skal:** pwsh 7 föredras när det finns, annars Windows PowerShell 5.1.
  PSReadLine slår **inte** på bracketed paste under ConPTY (varken 5.1 eller 7),
  så flerradig inklistring frågar först när läget är av. `Ctrl+V` hanteras i
  xterms key-handler med `preventDefault()` – annars kör även webbläsarens egen
  paste och allt klistras in två gånger.
- **xterm-storlek:** `.xterm-host` får **inte** ha padding – FitAddon mäter värdens
  storlek men drar bara av `.xterm`-elementets padding, vilket ger en kolumn/rad för
  mycket. Luft läggs utanför terminalen. På skalade skärmar (HiDPI) är den *faktiskt
  renderade* cellbredden bredare än den rapporterade – därför clampas cols/rows mot
  uppmätt DOM-storlek i `refit()`. WebGL-canvasen målar in i padding (innanför
  `overflow:hidden`), så luckor måste ligga utanför elementet.
- **Git-statuskoder** tolkas bara via `ui/gitStatus.ts` (`classifyStatus`,
  `statusClass`) – skriv aldrig en egen variant. Undantag: commit-förslaget i
  `CommitBox` resonerar om index-kolumnen, där t.ex. `AD` är en tilläggning.
- **Designtokens:** använd `--fs-xxs…--fs-lg` och `--radius-sm/--radius/--radius-lg`
  (`styles/global.css`), inte råa px. Varje tema ska ge accent ≥ 3:1 mot
  bakgrunden och knapptext ≥ 4.5:1 mot accenten.
- **Flex-hygien:** varje led i kedjan behöver `min-width: 0` **och** `min-height: 0`,
  annars tvingar innehållet ut layouten ur fönstret.
- **TS/JS-diagnostik från LSP är avstängd** (`editor/lsp.ts`) – bundlad tsserver
  klarar inte projektets multi-tsconfig och gav falska fel. Sanningen är
  `npm run typecheck`/CI. Slå inte på igen utan att lösa projektupplösningen.
- **Mappdialoger** måste ha `defaultPath` – sedan Electron 43 öppnas annars
  Hämtade filer i stället för senast använda mapp.
- **Uppdaterarens intervall** är 5 min (+ vid start). Manuell koll kringgår strypningen.

## Nuläge

- AI-integration är **pausad** på användarens begäran.
- Repot måste vara **publikt** (krävs för auto-update via GitHub Releases).
- Arbetssätt: större sammanhållna block per version, verifiera, committa, tagga.

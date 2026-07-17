# Codester

En lättviktig kod- och Git-klient för Windows. Koppla mot GitHub, överblicka
branches, läs och redigera kod, committa – och kör agentverktyg som Claude Code i
en förstklassig integrerad terminal. Utan kommandoradens friktion eller de tunga
IDE:ernas komplexitet.

**Ledord:** Enkelhet · Tydlighet · Personlig anpassning.

## Teknik

- **Electron 31** – skrivbordsskal för Windows
- **React 18 + TypeScript** – gränssnitt
- **electron-vite** – byggverktyg och dev-server
- **simple-git** – all git-logik (i main-processen)
- **Monaco** – editorn (samma motor som VS Code), buntad lokalt
- **xterm.js + @lydell/node-pty** – riktig PTY-terminal (conpty)
- **electron-updater** – auto-uppdatering via GitHub Releases
- Temasystem byggt på CSS-variabler

## Kom igång

```bash
npm install      # installera beroenden
npm run dev      # starta appen i utvecklingsläge (hot reload)
npm run typecheck
npm run build    # produktionsbygge
npm run dist     # bygg en Windows-installer (.exe) – görs normalt av CI
```

## Funktioner

### Arbetsyta

- **Flera projekt** – öppna flera mappar; växla aktivt projekt i väljaren. Filträd,
  ändringar, grenar och terminaler följer med.
- **Mappar utan Git** – öppna vilken mapp som helst. Git-init erbjuds via en knapp,
  det är inget krav.
- **Filutforskare** – virtualiserat träd med multi-select, drag-flytt, kontextmeny
  (skapa/byt namn/radera/klipp ut/kopiera/klistra in) och git-statusfärger.
- **Sök & ersätt** i hela repot, fritext med träfflista och hopp till rad.

### Git

- Status, staging (per fil och per hunk), discard, commit (+ amend), push/pull/fetch
- **Grenar** – main överst, sedan senast ändrad. Skapa, checka ut, ta bort
  (lokalt **och** på origin) med skydd mot ej mergade grenar.
- **Historik** – commit-graf (SVG-lanes), commit-detaljer med full diff, fil-tidslinje
- **Merge-konflikter** – 3-vägs merge-editor, lös per block eller hela filen
- **Stash** – stasha, lista, pop, ta bort
- **Blame** – inline-annotering

### GitHub

Två-nivå-navigering: **Mitt konto** (Repositories · Sök · Notiser · Gists) och
**Detta repo** (Översikt · Pull requests · Issues · Actions · Releaser).

- **Pull requests** – lista, detaljvy med diff + checks, konversation (kommentarer
  och reviews), skapa, granska, merga, checka ut lokalt, stäng/återöppna
- **Issues** – lista, detalj med kommentarer, skapa med labels/assignees, stäng
- **Actions** – körningar med jobb/steg, avbryt, kör om (felade eller alla),
  live-uppdatering var 3:e sek medan bygget kör
- **Releaser** – assets (t.ex. `latest.yml`/`.exe`), skapa, redigera, publicera, radera
- **Notiser** – inkorg med olästräknare på aktivitetsfältet
- **Publicera på GitHub** – lokalt repo utan remote? Skapa repo och pusha med ett klick
  (git-init sker automatiskt vid behov)

Git-nätverk mot github.com autentiseras med din token via en engångs-`extraheader` –
token hamnar aldrig i `.git/config`.

### Editor

- **Monaco** med diff mot HEAD, redigering, spara, format vid spara (Prettier)
- **Radbrytning** (Alt+Z), sticky scroll, minimap, kommandopalett, quick open
- Språkstöd via LSP + snippets (`snippets/<lang>.json`)

### Terminal

Byggd för att köra agentverktyg (t.ex. **Claude Code**) på bästa sätt:

- **Riktig PTY** (conpty) med truecolor – interaktiva TUI:er, pilmenyer, Ctrl+C
- **Egen center-vy** – fyller ytan; sidofältet kan visas bredvid
- **Split-layout** – 1, 2 sida vid sida, 2 på varandra eller 2×2 (fyra agenter samtidigt)
- **Claude Code-knapp** – startar `claude` i fokuserad terminal (med PATH-koll)
- **Klickbara `fil:rad`** i utdata → öppnar filen i editorn; URL:er externt
- **WebGL-rendering** för slät token-streaming, 10 000 rader scrollback
- **Sök** (Ctrl+F), kopiera/klistra (högerklick eller Ctrl+Shift+C/V)
- **Notis + taskbar-blink** när agenten är klar eller väntar (terminal-bell)
- Sessioner per projekt, överlever vy-byten

### Övrigt

- **10 teman** – Dark+, Light+, One Dark, Dracula, Nord, Monokai, Solarized Dark/Light,
  GitHub Dark, Gruvbox Dark. Plus accent, teckenstorlek, UI-skala, täthet.
- **Redigerbar konfiguration** – `settings.json`, `keybindings.json`, snippets
- **Auto-uppdatering** – kollar GitHub Releases vid start och var 5:e minut;
  knapp i aktivitetsfältet för att söka direkt. Installerar tyst och startar om.
- **Filbevakning** (chokidar) – git-status och filträd uppdateras automatiskt, även
  när ett agentverktyg ändrar filer på disk.

## Säkerhet

- GitHub-token lagras aldrig i klartext – krypteras med OS:ets nyckelvalv (DPAPI via
  `safeStorage`) och lämnar aldrig main-processen.
- All GitHub- och Git-logik körs i main; renderern når den bara via en typad,
  kontextisolerad `window.api`-brygga (contextIsolation på, ingen nodeIntegration).
- Externa länkar öppnas bara för `https`/`http`/`mailto` (scheme-allowlist).
- Strikt Content-Security-Policy; Monaco buntas lokalt (inget från CDN).

## Bygge & release

CI ([`.github/workflows/build.yml`](.github/workflows/build.yml)) bygger på
`windows-latest`, paketerar NSIS-installern och bifogar den till GitHub Releases.

- **Push av en `v*`-tagg** → bygger och publicerar (bara om det är den högsta taggen).
- **Manuell körning** (Actions → Run workflow) → bygger valfri/senaste tagg.
- Code signing är förberett via `CSC_LINK`/`CSC_KEY_PASSWORD` – se [SIGNING.md](SIGNING.md).
  Utan certifikat byggs installern osignerad.

> **Obs:** GitHub triggar inte tagg-workflows om man pushar fler än tre taggar
> samtidigt. Pusha en tagg i taget.

## Projektstruktur

```
src/
  main/            Electron main-process
    services/      git, github, terminal, updater, watcher, lsp, files, store …
    ipc.ts         IPC-handlers (Result<T>-kuvert)
  preload/         Säker, typad brygga renderer ⇄ main (window.api)
  shared/          Delade typer
  renderer/src/
    components/    UI (Sidebar, EditorGroup, TerminalView, GitHub*, …)
    editor/        Monaco-integration, LSP, markers, snippets
    state/         RepoContext (arbetsyta, git-state)
    settings/      Inställnings-context
    themes/        Temadefinitioner
    ui/            Delade primitiver (Toast, Confirm, Markdown, States, …)
    styles/        CSS
```

## Kvar att bygga vidare på

- Faktiskt signerad installer (kräver code signing-certifikat, se SIGNING.md)
- Editor/terminal-split (se båda samtidigt)
- Intern djuplänkning från notiser/sök till interna detaljvyer
- AI-integration (pausad på användarens begäran)

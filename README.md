# Codester

En lättviktig kod- och Git-klient för Windows. Koppla mot GitHub, överblicka
branches, läs kod med tydlig syntaxfärgning och committa – utan kommandoradens
friktion eller de tunga IDE:ernas komplexitet.

**Ledord:** Enkelhet · Tydlighet · Personlig anpassning.

## Teknik

- **Electron** – skrivbordsskal för Windows
- **React + TypeScript** – gränssnitt
- **electron-vite** – byggverktyg och dev-server
- Temasystem byggt på CSS-variabler (lätt att anpassa och utöka)

## Kom igång

```bash
npm install      # installera beroenden
npm run dev      # starta appen i utvecklingsläge (hot reload)
npm run build    # produktionsbygge
npm run dist     # bygg en Windows-installer (.exe)
npm run typecheck
```

## Status: Fas 0–4 implementerade ✅

**Fas 0 – Skelett**
- Electron + React + TypeScript, eget fönster, 3-zonslayout + aktivitetsfält
- Temasystem (5 teman) + anpassning: accent, teckenstorlek, UI-skala, täthet

**Fas 1 – MVP (Must)**
- Git-motor i main-processen (`simple-git`): status, branches, diff, stage/unstage,
  discard, commit, push/pull/fetch
- Öppna lokalt repo och klona via dialog
- GitHub-inloggning med Personal Access Token, krypterad via Windows DPAPI
  (`safeStorage`), listning + kloning av dina repon
- **Monaco-editor** (samma motor som VS Code) med diff-vy mot HEAD och
  redigeringsläge med spara

**Fas 2 – Komfort (Should)**
- Commit-historik med refs
- Filredigering med spara
- **Filutforskare** – bläddra hela repots filträd och läs/redigera vilken fil som helst
- **Merge-konflikthantering** – upptäck konflikter, välj vår/deras sida, markera som löst
- **Justerbara paneler** – dra för att ändra bredd på sidofält/commit-panel (sparas)
- Sök/filter bland repon, pull request-listning
- Visnings-/panelväxling (editor · historik · GitHub), dölj commit-panelen

**Fas 3 – Polish (Could)**
- Kommandopalett (Ctrl+P) – byt branch, tema, kör git-kommandon
- Förslag på commit-meddelande (✨) utifrån stagade filer
- Blame-stöd i git-lagret, 5 teman

**Fas 4 – Release**
- `electron-builder` konfigurerad för Windows NSIS-installer (`npm run dist`),
  anpassningsbar installationsmapp + genvägar
- Code signing förberett via `CSC_LINK`/`CSC_KEY_PASSWORD` – se [SIGNING.md](SIGNING.md)
- `npm run dist` bygger `release/Codester-Setup-<version>.exe` (verifierat lokalt).
  Kräver Windows **Developer Mode** eller admin första gången (symlänk-uppackning)

**Commit-graf & merge**
- Grafisk **commit-graf** i historiken (SVG-lanes med grenar/merges)
- **3-vägs merge-editor**: lös konflikter per block (våra/deras/båda) eller hela filen
- **OAuth Device Flow**-inloggning (utöver PAT) – kräver ett OAuth-client-ID

**Senaste omgången**
- **Commit-detaljer** – klicka en commit i historiken → se ändrade filer + full diff
- **Sök i hela repot** – fritextsökning (git grep) med träfflista och hopp till rad
- **App-ikon & branding** – egen ikon för fönster + installer (`npm run icons`), About-dialog
- **Auto-uppdatering** – filbevakning (chokidar) uppdaterar git-status automatiskt

**Tidigare extra**
- **Integrerad terminal** – uthålligt PowerShell-skal i repo-mappen, med
  kommandohistorik (↑/↓). Strömmad utdata, ANSI-rensad. (Ej full PTY – TUI-program
  som vim stöds inte.)
- **Stash** – stasha alla ändringar, lista, pop och ta bort
- **10 inbyggda teman** – Dark+, Light+, One Dark, Dracula, Nord, Monokai,
  Solarized Dark/Light, GitHub Dark, Gruvbox Dark
- **CI** – [GitHub Actions-workflow](.github/workflows/build.yml) som bygger och
  paketerar installern på `windows-latest` (kringgår lokala symlänk-rättigheter),
  laddar upp den som artefakt och bifogar den till GitHub Releases vid `v*`-taggar

> Verifierat: `npm run typecheck`, `npm run build` och app-boot passerar rent.

## Säkerhet

- GitHub-token lagras aldrig i klartext – krypteras med OS:ets nyckelvalv (DPAPI).
- All GitHub- och Git-logik körs i main-processen; renderern når den bara via en
  typad, kontextisolerad `window.api`-brygga (contextIsolation på, ingen nodeIntegration).
- Strikt Content-Security-Policy; Monaco buntas lokalt (inget laddas från CDN).

## Roadmap (MoSCoW)

| Fas | Innehåll | Status |
|-----|----------|--------|
| **0 – Skelett** | Projekt, layout, temasystem | ✅ |
| **1 – MVP (Must)** | GitHub-auth, klona, branches, diff, stage, commit, push/pull, Monaco | ✅ |
| **2 – Komfort (Should)** | Historik, redigering, sök, pull requests, panel-layout | ✅ |
| **3 – Polish (Could)** | Kommandopalett, commit-förslag, blame, fler teman | ✅ |
| **4 – Release** | Installer (NSIS) | ✅ konfig |

### Kvar att bygga vidare på
- Faktiskt signerad installer (kräver code signing-certifikat, se SIGNING.md);
  bygget i sig löses av CI-workflowen ovan
- Full PTY-terminal (node-pty) för interaktiva program
- AI-integration (pausad på användarens begäran)

## Projektstruktur

```
src/
  main/        Electron main-process (fönster, IPC)
  preload/     Säker brygga renderer ⇄ main
  renderer/
    src/
      components/   UI-komponenter (Sidebar, CodeView, Inspector, ...)
      themes/       Temadefinitioner
      settings/     Inställnings-context (tema, anpassning)
      data/         Mockdata (ersätts i Fas 1)
      styles/       CSS
```

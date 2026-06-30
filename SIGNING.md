# Code signing (Windows)

Codester byggs med `electron-builder`. Installern fungerar **osignerad** som
standard (`forceCodeSigning: false`), men för distribution bör den signeras så
att Windows SmartScreen inte varnar användarna.

## Förutsättningar

Du behöver ett **code signing-certifikat** (`.pfx`/`.p12`) från en betrodd CA,
t.ex. DigiCert, Sectigo eller SSL.com. EV-certifikat ger bäst SmartScreen-rykte.

## Signera lokalt

`electron-builder` läser automatiskt två miljövariabler:

```bash
# PowerShell
$env:CSC_LINK = "C:\sökväg\till\cert.pfx"     # eller base64-kodad sträng
$env:CSC_KEY_PASSWORD = "ditt-lösenord"
npm run dist
```

```bash
# bash
export CSC_LINK="/c/sökväg/till/cert.pfx"
export CSC_KEY_PASSWORD="ditt-lösenord"
npm run dist
```

Hittar `electron-builder` certifikatet signeras installern automatiskt.

## Signera i CI (rekommenderat)

Lägg certifikatet som base64 och lösenordet som hemligheter (t.ex. GitHub
Actions secrets) och exportera dem som `CSC_LINK` och `CSC_KEY_PASSWORD` i
build-steget. Lägg **aldrig** certifikatet eller lösenordet i git.

## Verifiera signaturen

```powershell
Get-AuthenticodeSignature ".\release\Codester-Setup-0.1.0.exe"
```

Status `Valid` betyder att signeringen lyckades.

## Felsökning: "Cannot create symbolic link … A required privilege is not held"

Första gången `npm run dist` körs laddar electron-builder ner paketet
`winCodeSign` (som innehåller `signtool` och `rcedit`). Det innehåller
macOS-symlänkar, och Windows tillåter bara symlänk-skapande om något av
följande gäller:

1. **Developer Mode är på** – Inställningar → Sekretess och säkerhet →
   För utvecklare → slå på "Utvecklarläge". *(rekommenderas, kräver ej admin)*
2. Bygget körs i en **PowerShell/terminal startad som administratör**.

Detta är en engångsåtgärd på datorn. Med någon av dessa på lyckas
`npm run dist` och installern hamnar i `release/`. CI-miljöer (t.ex. GitHub
Actions `windows-latest`) har redan rätt rättigheter.

## Azure Trusted Signing (alternativ)

Saknar du eget certifikat kan Azure Trusted Signing användas via
`electron-builder`s `azureSignOptions`. Se electron-builders dokumentation.

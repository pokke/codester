// Tolkar gits statuskod (XY = index + arbetsträd, t.ex. "AD", " M", "??", eller
// en bokstav från `git show --name-status`) till en visningskategori.
//
// Enda stället som bestämmer tolkningen. Tidigare hade Ändringar-listan,
// filträdet och commit-detaljerna var sin variant, och de gav olika svar för
// t.ex. "AD" (stagad ny fil som sedan raderats): grön i listan, röd i trädet.
// Borttagning vinner – finns filen inte kvar i arbetsträdet är "raderad" det
// som stämmer med vad användaren ser.
export type StatusKind = 'added' | 'modified' | 'deleted'

export function classifyStatus(code: string): StatusKind {
  if (code.includes('D')) return 'deleted'
  if (code.includes('A') || code.includes('?')) return 'added'
  return 'modified'
}

// CSS-klass för ändringslistor (Ändringar, commit-detaljer), där borttagen
// fil heter 'removed'.
export function statusClass(code: string): 'added' | 'modified' | 'removed' {
  const kind = classifyStatus(code)
  return kind === 'deleted' ? 'removed' : kind
}

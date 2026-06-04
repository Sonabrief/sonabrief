// Parser iCalendar minimale (RFC 5545), nessuna libreria esterna.
// Estrae i VEVENT dal testo ICS. Gestisce il line-unfolding: una riga che
// inizia con spazio o tab è la continuazione della riga precedente.

export interface IcsAttendee {
  name?: string
  email: string
}

export interface IcsEvent {
  uid: string
  summary: string
  dtstart: string
  dtend: string
  location: string
  description: string
  attendees: IcsAttendee[]
  status?: string
}

// Unfolding: per RFC 5545 le righe lunghe vengono spezzate e la continuazione
// è prefissata da un singolo spazio o tab. Ricuciamo prima di parsare.
function unfold(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, '\n').split('\n')
  const lines: string[] = []
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

// Una riga ICS è "NAME;PARAM=val:VALUE". Separiamo il nome (con eventuali
// parametri) dal valore al primo ":". Il nome base è prima di ";"; `params` è la
// stringa parametri grezza (tutto tra il nome e il ":"), serve per ATTENDEE (CN=).
function splitLine(line: string): { name: string; params: string; value: string } | null {
  const colon = line.indexOf(':')
  if (colon === -1) return null
  const namePart = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const semi = namePart.indexOf(';')
  const name = (semi === -1 ? namePart : namePart.slice(0, semi)).toUpperCase()
  const params = semi === -1 ? '' : namePart.slice(semi + 1)
  return { name, params, value }
}

// Parsa una riga ATTENDEE: estrae CN= dai parametri (→ name) e l'indirizzo
// dopo "mailto:" dal valore (→ email). Es: ATTENDEE;CN=Mario Rossi:mailto:m@x.com
function parseAttendee(params: string, value: string): IcsAttendee | null {
  const email = value.replace(/^mailto:/i, '').trim()
  if (!email) return null
  let name: string | undefined
  const cn = params.match(/(?:^|;)CN=([^;]*)/i)
  if (cn) {
    // Il CN può essere tra doppi apici; togliamoli e applichiamo l'unescape ICS.
    name = unescapeText(cn[1]!.trim().replace(/^"(.*)"$/, '$1')) || undefined
  }
  return { name, email }
}

// Unescape dei caratteri ICS nei valori testuali (RFC 5545 §3.3.11).
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

export function parseIcs(text: string): IcsEvent[] {
  const lines = unfold(text)
  const events: IcsEvent[] = []
  let current: Partial<IcsEvent> | null = null

  for (const line of lines) {
    const parsed = splitLine(line)
    if (!parsed) continue
    const { name, params, value } = parsed

    if (name === 'BEGIN' && value.toUpperCase() === 'VEVENT') {
      current = { attendees: [] }
      continue
    }
    if (name === 'END' && value.toUpperCase() === 'VEVENT') {
      if (current) {
        events.push({
          uid: current.uid ?? '',
          summary: current.summary ?? '',
          dtstart: current.dtstart ?? '',
          dtend: current.dtend ?? '',
          location: current.location ?? '',
          description: current.description ?? '',
          attendees: current.attendees ?? [],
          status: current.status,
        })
      }
      current = null
      continue
    }
    if (!current) continue

    switch (name) {
      case 'UID':
        current.uid = value
        break
      case 'SUMMARY':
        current.summary = unescapeText(value)
        break
      case 'DTSTART':
        current.dtstart = value
        break
      case 'DTEND':
        current.dtend = value
        break
      case 'LOCATION':
        current.location = unescapeText(value)
        break
      case 'DESCRIPTION':
        current.description = unescapeText(value)
        break
      case 'STATUS':
        current.status = value
        break
      case 'ATTENDEE': {
        const a = parseAttendee(params, value)
        if (a) (current.attendees ??= []).push(a)
        break
      }
    }
  }

  return events
}

const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function fmt(d) {
  if (!d) return '—';
  try {
    const date = new Date(d);
    const datePart = date.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: userTz,
    }).split(' ').join('-');
    const timePart = date.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: userTz,
    });
    return `${datePart} ${timePart}`;
  } catch {
    return String(d);
  }
}

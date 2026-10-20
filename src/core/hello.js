/**
 * Hälsning från hello-verktyget. Finns bara för att verifiera kedjan Claude Code till Worker.
 * @param {string} [name]
 * @returns {string}
 */
export function greeting(name) {
  return `Hej ${name?.trim() || "du"}, roundtable svarar.`;
}

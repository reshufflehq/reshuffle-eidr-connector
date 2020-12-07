// Validate an EIDR content or other ID with the
// following formats:
//
//   10.5240/xxxx-xxxx-xxxx-xxxx-xxxx-y
//   10.5238/xxxx-xxxx
//   10.5237/xxxx-xxxx
//
// where every 'x' is a hexadecimal digit (0-F) and 'y' is
// any digit (0-9) or a capital letter (A-Z).
//
// @param ID EIDR ID string
//
// @return true for valid IDs, false otherwise
//
export function validateId(id: string): boolean {
  const contentRe = /^10\.5240\/([0-9A-F]{4}-){5}[0-9A-Z]$/
  const otherRe = /^10\.523[79]\/[0-9A-F]{4}-[0-9A-F]{4}$/
  return typeof id === 'string' && (contentRe.test(id) || otherRe.test(id))
}

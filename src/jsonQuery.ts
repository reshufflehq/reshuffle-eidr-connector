import { validateId } from './validate'

type Obj = Record<string, any>

function assertSingleProperty(obj: Obj) {
  if (typeof obj !== 'object') {
    throw new Error(`Not an object: ${JSON.stringify(obj)}`)
  }
  if (Object.keys(obj).length !== 1) {
    throw new Error(
      `Object must have one single property: ${JSON.stringify(obj)}`
    )
  }
  return [Object.keys(obj)[0], Object.values(obj)[0]]
}

function nary(op: string, expressions: string[]) {
  op = op.toUpperCase()
  if (!Array.isArray(expressions)) {
    throw new Error(`${op} requires an array: ${expressions}`)
  }
  for (const expression of expressions) {
    if (typeof expression !== 'string' || expression.trim().length === 0) {
      throw new Error(`${op} requires string expressions: ${expression}`)
    }
  }
  const many = 1 < expressions.length
  return `${many ? '(' : ''}${
    expressions.map((e) => e.trim()).join(` ${op} `)
  }${many ? ')' : ''}`
}

function OR(expressions: string[]) {
  return nary('or', expressions)
}

function NOT(expression: string) {
  if (typeof expression !== 'string' || expression.trim().length === 0) {
    throw new Error(`NOT requires a string expression: ${expression}`)
  }
  return `(NOT ${expression})`
}

const textElements: Record<string, string[]> = {
  title: ['ResourceName'],
  alttitle: ['AlternateResourceName'],
  anytitle: ['ResourceName', 'AlternateResourceName'],
  coo: ['CountryOfOrigin'],
  struct: ['StructuralType'],
  reftype: ['ReferentType'],
  lang: ['OriginalLanguage'],
  aoname: ['AssociatedOrg/DisplayName'],
  aoaltname: ['Associatedorg/AlternateName'],
  aoanyname: ['AssociatedOrg/DisplayName', 'AssociatedOrg/AlternateName'],
  aoid: ['AssociatedOrg@organizationID'],
  actor: ['Credits/Actor/DisplayName', 'Credits/Actor/SortName'],
  director: ['Credits/Director/DisplayName', 'Credits/Director/SortName'],
  contributor: ['Credits/Director/DisplayName', 'Credits/Actor/DisplayName'],
  altid: ['AlternateID'],
  altidtype: ['AlternateID@type'],
  altiddomain: ['AlternateID@domain'],
}

function textQuery(key: string, obj: Obj) {
  const [op, list] = assertSingleProperty(obj)
  if (typeof list !== 'string') {
    throw new Error(`Invalid text query word list: ${list}`)
  }
  const words = list.split(' ').filter((s) => 0 < s.length)
  if (words.length === 0) {
    throw new Error(`Empty text query word list: ${list}`)
  }
  const te = textElements[key].map((p) => `/FullMetadata/BaseObjectData/${p}`)
  switch (op) {
  case 'words':
    return OR(te.map((p) => words.map((w) => `(${p} ${w})`)).flat())
  case 'contains':
    return OR(te.map((p) => `(${p} "${words.join(' ')}")`))
  case 'exact':
    return OR(te.map((p) => `(${p} IS "${words.join(' ')}")`))
  default:
    throw new Error(`Invalid text query operation: ${op}`)
  }
}

function idQuery(obj: Obj) {
  const [op, list] = assertSingleProperty(obj)
  if (typeof list !== 'string') {
    throw new Error(`Invalid ID list: ${list}`)
  }
  const ids = list.split(' ').filter((s) => 0 < s.length)
  if (ids.length === 0) {
    throw new Error(`Empty ID list: ${list}`)
  }
  for (const id of ids) {
    if (!validateId(id)) {
      throw new Error(`Invalid ID: ${id}`)
    }
  }
  switch (op) {
  case 'words':
    return OR(ids.map((id) => `/FullMetadata/BaseObjectData/ID ${id}`))
  case 'exact':
    if (ids.length !== 1) {
      throw new Error(`Excat ID expect single ID, but found ${ids.length}`)
    }
    return `(/FullMetadata/BaseObjectData/ID ${ids[0]})`
  default:
    throw new Error(`Invalid ID query operation: ${op}`)
  }
}

function dateQuery(obj: Obj) {
  const [op, date] = assertSingleProperty(obj)
  if (typeof date !== 'string' || date.trim().length === 0) {
    throw new Error(`Invalid date: ${date}`)
  }
  switch (op) {
  case 'date':
    return `(/FullMetadata/BaseObjectData/ReleaseDate ${date})`
  case 'before':
    return `(/FullMetadata/BaseObjectData/ReleaseDate <= ${date})`
  case 'after':
    return `(/FullMetadata/BaseObjectData/ReleaseDate >= ${date})`
  default:
    throw new Error(`Invalid date query operation: ${op}`)
  }
}

function lengthQuery(obj: Obj) {
  const [op, length] = assertSingleProperty(obj)
  if (typeof length !== 'string' || length.trim().length === 0) {
    throw new Error(`Invalid length: ${length}`)
  }
  switch (op) {
  case 'length':
    return `(/FullMetadata/BaseObjectData/ApproximateLength ${length})`
  case 'maxlength':
    return `(/FullMetadata/BaseObjectData/ApproximateLength <= ${length})`
  case 'minlength':
    return `(/FullMetadata/BaseObjectData/ApproximateLength >= ${length})`
  default:
    throw new Error(`Invalid length query operation: ${op}`)
  }
}

function existsQuery(element: string) {
  if (element === 'date') {
    return '(/FullMetadata/BaseObjectData/ReleaseDate EXISTS)'
  }
  if (element === 'length') {
    return '(/FullMetadata/BaseObjectData/ApproximateLength EXISTS)'
  }
  if (!(element in textElements)) {
    throw new Error(`Invalid element: ${element}`)
  }
  if (textElements[element].length !== 1) {
    throw new Error(`Invalid element for EXISTS query: ${element}`)
  }
  return `(/FullMetadata/BaseObjectData/${textElements[element][0]} EXISTS)`
}

function isRootQuery(value :boolean) {
  if (typeof value !== 'boolean') {
    throw new Error(`isroot value must be boolean: ${value}`)
  }
  const notRootQuery = OR([
    '(/FullMetadata/ExtraObjectMetadata/SeasonInfo EXISTS)',
    '(/FullMetadata/ExtraObjectMetadata/ClipInfo EXISTS)',
    '(/FullMetadata/ExtraObjectMetadata/ManifestationInfo EXISTS)',
    '(/FullMetadata/ExtraObjectMetadata/EpisodeInfo EXISTS)',
    '(/FullMetadata/ExtraObjectMetadata/EditInfo EXISTS)',
  ])
  return value ? NOT(notRootQuery) : notRootQuery
}

function parentQuery(id: string) {
  if (!validateId(id)) {
    throw new Error(`Invalida parent ID: ${id}`)
  }
  return OR([
    `(/FullMetadata/ExtraObjectMetadata/SeasonInfo/Parent ${id})`,
    `(/FullMetadata/ExtraObjectMetadata/ClipInfo/Parent ${id})`,
    `(/FullMetadata/ExtraObjectMetadata/ManifestationInfo/Parent ${id})`,
    `(/FullMetadata/ExtraObjectMetadata/EpisodeInfo/Parent ${id})`,
    `(/FullMetadata/ExtraObjectMetadata/EditInfo/Parent ${id})`,
  ])
}

export function buildJsonQuery(obj: Obj): string {
  const [element, value] = assertSingleProperty(obj)
  if (element === 'and' || element === 'or') {
    return nary(element, value.map(buildJsonQuery))
  }
  if (element === 'not') {
    return NOT(buildJsonQuery(value))
  }
  if (element in textElements) {
    return textQuery(element, value)
  }
  if (element === 'id') {
    return idQuery(value)
  }
  if (element === 'date') {
    return dateQuery(value)
  }
  if (element === 'length') {
    return lengthQuery(value)
  }
  if (element === 'exists') {
    return existsQuery(value)
  }
  if (element === 'isroot') {
    return isRootQuery(value)
  }
  if (element === 'parent') {
    return parentQuery(value)
  }
  throw new Error(`Invalid element: ${element}`)
}

// const qs = query(event.req.body)
// console.log(qs)
// await app.getConnector('eidr').query(qs)
// return event.res.send(qs)

// Tests:

// { title: { words: 'star wars' }, length: 3 }
// Error: Object must have one single property

// { title: { words: 'star wars' } }
// (
//   (/FullMetadata/BaseObjectData/ResourceName star) OR
//   (/FullMetadata/BaseObjectData/ResourceName wars)
// )

// { alltitles: { words: 'star wars' } }
// (
//   (/FullMetadata/BaseObjectData/ResourceName star) OR
//   (/FullMetadata/BaseObjectData/ResourceName wars) OR
//   (/FullMetadata/BaseObjectData/AlternateResourceName star) OR
//   (/FullMetadata/BaseObjectData/AlternateResourceName wars)
// )

// { and: [{ title: { contains: 'star wars' } }, { coo: { exact: 'us' } }] }
// (
//   (/FullMetadata/BaseObjectData/ResourceName "star wars") AND
//   (/FullMetadata/BaseObjectData/CountryOfOrigin IS "us")
// )

// { or: [{ title: { contains: 'star wars' } }, { coo: { exact: 'us' } }] }
// (
//   (/FullMetadata/BaseObjectData/ResourceName "star wars") OR
//   (/FullMetadata/BaseObjectData/CountryOfOrigin IS "us")
// )

// { not: { title: { contains: 'star wars' } } }
// (NOT (/FullMetadata/BaseObjectData/ResourceName "star wars"))

// { date: { date: '2000' } }
// (/FullMetadata/BaseObjectData/ReleaseDate 2000)

// { date: { before: '2000' } }
// (/FullMetadata/BaseObjectData/ReleaseDate <= 2000)

// { date: { after: '2000' } }
// (/FullMetadata/BaseObjectData/ReleaseDate >= 2000)

// { length: { length: 'PT23M' } }
// (/FullMetadata/BaseObjectData/ApproximateLength PT23M)

// { length: { maxlength: 'PT23M' } }
// (/FullMetadata/BaseObjectData/ApproximateLength <= PT23M)

// { length: { minlength: 'PT23M' } }
// (/FullMetadata/BaseObjectData/ApproximateLength >= PT23M)

// { exists: 'actor' }
// (/FullMetadata/BaseObjectData/Credits/Actor/DisplayName EXISTS)

// { isroot: true }
// (NOT (
//   (/FullMetadata/ExtraObjectMetadata/SeasonInfo EXISTS) OR
//   (/FullMetadata/ExtraObjectMetadata/ClipInfo EXISTS) OR
//   (/FullMetadata/ExtraObjectMetadata/ManifestationInfo EXISTS) OR
//   (/FullMetadata/ExtraObjectMetadata/EpisodeInfo EXISTS) OR
//   (/FullMetadata/ExtraObjectMetadata/EditInfo EXISTS))
// )

// { parent: '10.5240/75C0-4663-9D6D-C864-1D9B-I' }
// (
//   (
//     /FullMetadata/ExtraObjectMetadata/SeasonInfo/Parent
//     10.5240/75C0-4663-9D6D-C864-1D9B-I
//   ) OR (
//     /FullMetadata/ExtraObjectMetadata/ClipInfo/Parent
//     10.5240/75C0-4663-9D6D-C864-1D9B-I
//   ) OR (
//     /FullMetadata/ExtraObjectMetadata/ManifestationInfo/Parent
//     10.5240/75C0-4663-9D6D-C864-1D9B-I
//   ) OR (
//     /FullMetadata/ExtraObjectMetadata/EpisodeInfo/Parent
//     10.5240/75C0-4663-9D6D-C864-1D9B-I
//   ) OR (
//     /FullMetadata/ExtraObjectMetadata/EditInfo/Parent
//     10.5240/75C0-4663-9D6D-C864-1D9B-I
//   )
// )


// Defines the property path of the json to convert to object
// Define the fields separated by a period
// Can use wildcard notation - however, the last segment must be a field name
// i.e. '*.DisplayName' is ok, 'AssociatedOrg.*.DisplayName' is ok
// 'MetaDataObject.*' is NOT ok
const jsonFormatWithValueRules = [
  'ExtraObjectMetadata.EpisodeInfo.SequenceInfo.DistributionNumber',
  //   '*.SequenceInfo.DistributionNumber',   // Example with wildcard
]

// Recursion to convert primitive values in specified path of the JSON to an object
function parseJsonWithOneRule(jsonToParse: any, fields: string[]) {
  if (!fields?.length || !jsonToParse) {
    return
  }

  fields = fields.slice()

  const currentField = fields[0]
  if (fields.length === 1) {
    if (Array.isArray(jsonToParse[currentField])) {
      jsonToParse[currentField].forEach((arrItem: any, i: number) => {
        if (typeof arrItem !== 'object') {
          jsonToParse[i] = {
            value: arrItem,
          }
        }
      })
    } else if (typeof jsonToParse[currentField] !== 'object' && jsonToParse[currentField]) {
      jsonToParse[currentField] = {
        value: jsonToParse[currentField],
      }
    }
    return
  }

  const subFields = fields.slice(1, fields.length)

  // If wildcard syntax, check the branches all the way down
  if (currentField === '*') {
    if (typeof jsonToParse === 'object') {
      Object.keys(jsonToParse).forEach((value) => {
        parseJsonWithOneRule(jsonToParse[value], fields)
        parseJsonWithOneRule(jsonToParse[value], subFields)
      })
    }
    return
  }

  if (jsonToParse[currentField]) {
    if (Array.isArray(jsonToParse[currentField])) {
      jsonToParse[currentField].forEach((arrItem) => parseJsonWithOneRule(arrItem, subFields))
    } else {
      parseJsonWithOneRule(jsonToParse[currentField], subFields)
    }
  }
}

export function parseJsonWithValue(json: any) {
  if (!json || typeof json !== 'object') {
    return json;
  }
  jsonFormatWithValueRules.forEach((rule) =>
    parseJsonWithOneRule(json, rule.split('.')))
}

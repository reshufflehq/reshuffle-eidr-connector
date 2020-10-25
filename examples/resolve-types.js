const { Reshuffle } = require('reshuffle')
const { EIDRConnector } = require('reshuffle-eidr-connector')

;(async () => {
  const app = new Reshuffle()
  const eidr = new EIDRConnector(app)

  const contentIds = [
    '10.5240/5CA7-2626-3EF6-2B05-AD9C-M',
    '10.5240/7481-838B-59CA-63D0-B9A8-E',
    '10.5240/C8CE-3B86-2C4F-BAA4-C073-O',
    '10.5240/6C2B-152E-12B3-B7CF-F636-9',
    '10.5240/7910-DCFE-314D-9A16-81F8-S',
  ]

  const contentResolutionTypes = [
    'Full',
    'SelfDefined',
    'Simple',
    'DOIKernel',
    'Provenance',
    'AlternateIDs',
    'LinkedAlternateIDs'
  ]

  for (const id of contentIds) {
    for (const type of contentResolutionTypes) {
      const info = await eidr.resolve(id, type)
      console.log('=========================================' +
        '==========================')
      console.log(`Resolving ${type} for ${id}`)
      console.log('=========================================' +
        '==========================')
      console.log(info)
      console.log()
    }
  }

  const otherIds = [
    '10.5237/68A3-01BF',
    '10.5237/D82F-F97F',
    '10.5239/7B0E-F842',
    '10.5239/A313-25E7',
    '10.5239/EE0D-E181',
  ]

  const otherResolutionTypes = ['Full', 'DOIKernel']

  for (const id of otherIds) {
    for (const type of otherResolutionTypes) {
      const info = await eidr.resolve(id, type)
      console.log('=========================================')
      console.log(`Resolving ${type} for ${id}`)
      console.log('=========================================')
      console.log(info)
      console.log()
    }
  }

})().catch(console.error)

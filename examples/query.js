const { Reshuffle } = require('reshuffle')
const { EIDRConnector } = require('reshuffle-eidr-connector')

;(async () => {
  const app = new Reshuffle()
  const eidr = new EIDRConnector(app)

  const name = 'Abominable'
  const idOnly = false

  const { results } = await eidr.query({
    and: [
      { title: { exact: name } },
      { reftype: { exact: 'Movie' } },
      { struct: { exact: 'Performance' } },
      { date: { date: '2019' } },
    ],
  }, { idOnly })

  for (const result of results) {
    console.log(result)
  }

})().catch(console.error)

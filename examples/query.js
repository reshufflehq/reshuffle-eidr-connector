const { Reshuffle } = require('reshuffle')
const { EIDRConnector } = require('reshuffle-eidr-connector')

;(async () => {
  const app = new Reshuffle()
  const eidr = new EIDRConnector(app, {
    userId: process.env.EIDR_USERID,
    partyId: process.env.EIDR_PARTYID,
    password: process.env.EIDR_PASSWORD,
  })

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

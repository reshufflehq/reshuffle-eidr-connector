const { Reshuffle, HttpConnector } = require('reshuffle')
const { EIDRConnector } = require('reshuffle-eidr-connector')

const app = new Reshuffle()
const eidr = new EIDRConnector(app, {
  userId: process.env.EIDR_USERID,
  partyId: process.env.EIDR_PARTYID,
  password: process.env.EIDR_PASSWORD,
})
const http = new HttpConnector(app)

http.on({ method: 'GET', path: '/query' }, async (event) => {
  const name = (event.req.query.name || '').trim()
  if (name.length === 0) {
    return event.res.status(400).send('Missing name')
  }

  try {
    const { results } = await eidr.query({ title: { words: name } })
    return event.res.json(results)

  } catch (e) {
    return event.res.status(e.status).json({
      error: e.message,
      details: e.details,
    })
  }
})

app.start(8000)

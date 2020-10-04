const { Reshuffle, HttpConnector } = require('reshuffle')
const { EIDRConnector } = require('reshuffle-eidr-connector')

const app = new Reshuffle()
const eidr = new EIDRConnector(app)
const http = new HttpConnector(app)

http.on({ method: 'GET', path: '/query' }, async (event) => {
  const name = (event.context.req.query.name || '').trim()
  if (name.length === 0) {
    return event.context.res.status(400).send('Missing name')
  }

  try {
    const { results } = await eidr.query({ name })
    return event.context.res.json(results)

  } catch (e) {
    return event.context.res.status(e.status).json({
      error: e.message,
      details: e.details,
    })
  }
})

app.start(8000)

const { Reshuffle, HttpConnector } = require('reshuffle')
const { EIDRConnector } = require('reshuffle-eidr-connector')

const app = new Reshuffle()
const eidr = new EIDRConnector(app)
const http = new HttpConnector(app)

http.on({ method: 'GET', path: '/resolve' }, async (event) => {
  const id = event.req.query.id
  if (!/^10\.5240\/([0-9A-F]{4}-){5}[0-9A-Z]$/.test(id)) {
    return event.res.status(400).send(`Invalid EIDR ID: ${id}`)
  }

  try {
    const info = await eidr.resolve(id)
    return event.res.json(info)

  } catch (e) {
    return event.res.status(e.status).json({
      error: e.message,
      details: e.details,
    })
  }
})

app.start(8000)

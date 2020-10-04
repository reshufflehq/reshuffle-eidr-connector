const { Reshuffle, HttpConnector } = require('reshuffle')
const { EIDRConnector } = require('reshuffle-eidr-connector')

const app = new Reshuffle()
const eidr = new EIDRConnector(app)
const http = new HttpConnector(app)

http.on({ method: 'GET', path: '/resolve' }, async (event) => {
  const id = event.context.req.query.id
  if (!/^10\.5240\/([0-9A-F]{4}-){5}[0-9A-Z]$/.test(id)) {
    return event.context.res.status(400).send(`Invalid EIDR ID: ${id}`)
  }

  try {
    const info = await eidr.resolve(id)
    return event.context.res.json(info)

  } catch (e) {
    return event.context.res.status(e.status).json({
      error: e.message,
      details: e.details,
    })
  }
})

app.start(8000)

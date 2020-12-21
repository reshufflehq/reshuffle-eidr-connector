# reshuffle-eidr-connector

[Code](https://github.com/reshufflehq/reshuffle-eidr-connector) |
[npm](https://www.npmjs.com/package/reshuffle-eidr-connector) |
[Code sample](https://github.com/reshufflehq/reshuffle-eidr-connector/examples)

`npm install reshuffle-eidr-connector`

### Reshuffle EIDR Connector

This package contains a [Reshuffle](https://dev.reshuffle.com)
connector to the Entertainment Identifier Registry (EIDR) service
at [eidr.org](https://eidr.org/).

Please review the EIDR
[API Specification](http://eidr.org/documents/EIDR_2.1_REST_API.pdf) and
[User Guide](http://eidr.org/documents/EIDR_2.1_Registry_User_Guide.pdf) for
full details about the service.

The following example creates and API endpoint to query EIDR for movie data:

```js
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
    const { results } = await eidr.query({ title: { exact: name } })
    return event.res.json(results)

  } catch (e) {
    return event.res.status(e.status).json({
      error: e.message,
      details: e.details,
    })
  }
})

app.start(8000)
```

#### Table of Contents

[Configuration](#configuration) Configuration options

_Connector actions_:

[info](#info) Get connector information

[query](#query) Search for media information

[resolve](#resolve) Get information for one media resource

[simpleQuery](#simpleQuery) Simple search for media information

##### <a name="configuration"></a>Configuration options

```js
const app = new Reshuffle()
const eidrConnector = new EIDRConnector(app)
```

This default initialization will allow access to all public available EIDR
functions, including ID resolution. Some functions, including query and
ID registration, require EIDR membership credentials. Credentials can
be passed as an object in the form:

```ts
{
  userId: string
  partyId: string
  password?: string
  shaddow?: string
  domain?: string
}
```

The `userId` and `partyId` are mandatory and provided by EIDR to its members.
Either `password` or `shaddow` (the base64 encoded MD5 hash of password) must
also be provided. The `domain` can used left out in most cases unless there
is a specific reason to use a mirror service.

Credentials can also be passed as a string with the following format:
`Eidr <userId>:<partyId>:<shaddow>`.

Credentials can be passed as a second argument to the connector's constructor:

```js
const credentials = { ... }
const eidrConnector = new EIDRConnector(app, credentials)
```

or as the last optional argument to priviledged actions like [query](#query).
This method is usedful when building an service or API to allow third patries
to perform queries or other priviledged operations against the EIDR registry.

#### Connector actions

##### <a name="info"></a>Info action

_Definition:_

```
() => {
  eidrApiVersion: string,
  eidrConnectorVersion: string,
}
```

_Usage:_

```js
const info = await eidrConnector.info()
```

Get connector information.

##### <a name="query"></a>Query action

_Definition:_

```
(
  query: object | string,
  options?: object,
  credentials?: string | object,
) => {
  totalMatches: number,
  results: object[],
}
```

_Usage:_

```js
const q = '(/FullMetadata/BaseObjectData/ResourceName "abominable")'

// Get first 25 results
const { results } = await eidrConnector.query(q)

// Get results 11 - 20
const { results } = await eidrConnector.query(
  q,
  { pageNumber: 2, pageSize: 10 },
)
```

or

```js
const id = '10.5240/DF48-AB62-4486-C185-9E1B-4'
const { results } = await eidrConnector.query({ title: { exact: name } })
```

Search the EIDR database for matches to the query. You can specify the query
using EIDR XML query language or the EIDR Proxy JSON query language.

The optional `options` object supports the following optional fields:

* `pageNumber?: number` - Results page number (default is 1)
* `pageSize?: number` - Results page size (default is 25)
* `root?: string` - EIDR ID for rooted queries

See the [Configuration](#configuration) section above for more details about
access credentials.

##### <a name="resolve"></a>Resolve action

_Definition:_

```
(
  id: string,
) => {
  // media information
}
```

_Usage:_

```js
const id = '10.5240/DF48-AB62-4486-C185-9E1B-4'
const info = await eidrConnector.resolve(id)
```

Get the full information for the media resource (movie, tv show etc) with
the specified id. The full information can be very details, as described
in page 21 of the
[EIDR API Specification](http://eidr.org/documents/EIDR_2.1_REST_API.pdf).

##### <a name="simpleQuery"></a>Simple Query action

_Definition:_

```
(
  exprOrObj: string | object,
  compareFunction?: (a: object, b: object) => number,
  credentials?: string | object,
) => object[]
```

_Usage:_

```js
const id = '10.5240/DF48-AB62-4486-C185-9E1B-4'
const results = await eidrConnector.simpleQuery({
  name,
  movie: true,
  valid: true,
  StructuralType: 'Performance',
})
```

Search the EIDR database for matches to the query. See [query](#query) above
for details.

The Simple Query action does not support pagination and returns the results
array directly to the caller. The results are automatically sorted by
descending order of release date. You can control the sort order by specifying
a `compareFunction` that behaves like the one used by
[Array.sort](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort).

See the [Configuration](#configuration) section above for more details about
access credentials.

## Learn more

You can learn more about Reshuffle on
[dev.reshuffle.com](https://dev.reshuffle.com).

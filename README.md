# reshuffle-eidr-connector

[Code](https://github.com/reshufflehq/reshuffle-eidr-connector) |
[npm](https://www.npmjs.com/package/reshuffle-eidr-connector) |
[Code sample](https://github.com/reshufflehq/reshuffle-eidr-connector/examples)

`npm install reshuffle-eidr-connector`

### Reshuffle EIDR Connector

This package contains a [Resshufle](https://github.com/reshufflehq/reshuffle)
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
const eidr = new EIDRConnector(app)
const http = new HttpConnector(app)

http.on({ method: 'GET', path: '/query' }, async (event) => {
  const name = (event.req.query.name || '').trim()
  if (name.length === 0) {
    return event.res.status(400).send('Missing name')
  }

  try {
    const { results } = await eidr.query({ name })
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

[getQueryBuilder](#getQueryBuilder) Get a query builder interface

[query](#query) Search for media information

[resolve](#resolve) Get information for one media resource

[simpleQuery](#simpleQuery) Simple search for media information

##### <a name="configuration"></a>Configuration options

```js
const app = new Reshuffle()
const eidrConnector = new EIDRConnector(app)
```

#### Connector actions

##### <a name="getQueryBuilder"></a>Get query builder action

_Definition:_

```
=> queryBuilder: object
```

_Usage:_

```js
const Q = await eidrConnector.getQueryBuilder()
await eidrConnector.query(
  Q.and(
    Q.is('ResourceName', 'abominable'),
    Q.eq('ReferentType', 'Movie'),
    Q.eq('Status', 'valid'),
  )
)
```

Build a query in the EIDR query language, for use by the [query](#query)
action. The query builder is stateless and can be used to form multiple
queries.

The query language provides the following methods:

**Logical methods:**

* `and(...expressions)` logical and operand
* `eq(field, value)` match an object data field to a specific value
* `is(field, value)` exactly match an object data field to a specific value
* `meq(field, value)` match a meta data field to a specific value
* `mexists(field)` check if a meta data field exists
* `or(...expressions)` logical or operand

**Semantic methods:**

* `date(dt)` match entries with the specified date
* `id(id)` match ID
* `episodes(id)` get the eposides for a specific season ID
* `movie()` match movies
* `name(name)` match entries with the specified resource name
* `seasons(id)` get the seasons for a specific series ID
* `status(st)` match entries with the specified status
* `type(type)` match entries with the specified referent type
* `valid()` match entries with valid status

**Object query method:**

The `$` method allows the caller to use a *query object* to describe the
query. The properties of this object are names of semantic methods above
and their values are the method's argument (any value can be used if the
method requires no arguments).

The results of the methods corresponding to the proprties are joined with a
logical `and`. If the object is an array, then each element of the array is
processed as described above, and the results are joined with a logical
`or`.

The special property `$` can be used to nest `or`ed arrays inside objects.

For example, the query above can be written as

```js
Q.$({
  name: 'abominable',
  movie: true,
  valid: true,
})
```

Object based queries are useful, for example, for creating a JSON based
intefrace, as shown in this example HTTP triggered script:

```js
async (req, res) => {
  const Q = await eidrConnector.getQueryBuilder()
  const query = Q.$(req.body)
  const resources = await eidrConnector.query(query)

  return res
    .status(200)
    .set({ 'Content-Type': 'application/json' })
    .send(JSON.stringify(resources.results))
}
```

##### <a name="query"></a>Query action

_Definition:_

```
(
  query: object | string,
  options?: object,
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
const { results } = await eidrConnector.query({ id, valid: true })
```

Search the EIDR database for matches to the query. You can specify the query
using EIDR query language directly (as in the first example above),
use a query object or use the simplified query builder intefrace. See
[getQueryBuilder](#getQueryBuilder) below on how to use the query builder and
query objects.

The optional `options` object supports the following optional fields:

* `encoding?: string` - Query character encoding (default if ASCII)
* `pageNumber?: number` - Results page number (default is 1)
* `pageSize?: number` - Results page size (default is 25)
* `root?: string` - EIDR ID for rooted queries

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

## Learn more

You can learn more about Reshuffle on
[dev.reshuffle.com](https://dev.reshuffle.com).

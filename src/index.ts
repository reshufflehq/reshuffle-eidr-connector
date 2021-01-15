import crypto from 'crypto'
import xml2js from 'xml2js'
import fetch from 'node-fetch'
import { BaseConnector, Reshuffle } from 'reshuffle-base-connector'
import { validateId } from './validate'
import { buildJsonQuery } from './jsonQuery'

const eidrApiVersion = '2.6.0'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const eidrConnectorVersion = require('../package.json').version

type Obj = Record<string, any>
type Options = Record<string, any>

interface QueryOptions {
  idOnly?: boolean
  pageNumber?: number
  pageSize?: number
  root?: string
}

class EIDRError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: string = message,
  ) {
    super(`EIDRConnector: ${message}`)
  }
}

interface CredentialsInterface {
  userId: string
  partyId: string
  password?: string
  shadow?: string
  domain?: string
}

type Credentials = string | CredentialsInterface

class Authorization {
  public readonly endpoint: string
  public readonly headers: Obj = {}
  public readonly registered: boolean = false

  constructor(credentials: Credentials) {

    function validate(tag: string, value: string): string {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new EIDRError(`Invalid ${tag}`, 401)
      }
      return value.trim()
    }

    if (typeof credentials === 'string') {
      if (!/^Eidr [^\s]+:[^\s]+:[^\s]+$/.test(credentials)) {
        throw new EIDRError('Invalid credentials string', 401)
      }
      const [userId, partyId, shadow] = credentials.substr(5).split(':')
      this.headers = { Authorization: `Eidr ${userId}:${partyId}:${shadow}` }
      this.registered = true

    } else if (credentials.userId) {
      const userId = validate('userId', credentials.userId)
      const partyId = validate('partyId', credentials.partyId)

      let shadow
      if (credentials.password) {
        const password = validate('password', credentials.password)
        shadow = crypto.createHash('md5').update(password).digest('base64')
      } else if (credentials.shadow) {
        shadow = validate('shadow', credentials.shadow)
      } else {
        throw new EIDRError(
          'Missing password',
          401,
          'Password of shadow must be part of credentials'
        )
      }

      this.headers = { Authorization: `Eidr ${userId}:${partyId}:${shadow}` }
      this.registered = true
    }

    const domain = typeof credentials === 'string' || !credentials.domain ?
      'resolve.eidr.org' :
      validate('domain', credentials.domain)
    this.endpoint = `https://${domain}/EIDR/`
  }
}

export class EIDRConnector extends BaseConnector {
  private authorization: Authorization
  private xmlOptions: Obj

  constructor(app: Reshuffle, options: Options = {}, id?: string) {
    super(app, options, id)
    this.authorization = new Authorization(options as Credentials)
    this.xmlOptions = {
      trim: true,
      explicitArray: false,
    }
  }

  private renderOperationRequest(operation: string) {
    return `
      <Request xmlns="http://www.eidr.org/schema">
        <Operation>
          ${operation}
        </Operation>
      </Request>
    `
  }

  private renderQueryRequest(query: string, opts: QueryOptions) {
    return this.renderOperationRequest(`
      <Query>
        ${opts.root ? `<ID>${opts.root}</ID>` : ''}
        <Expression><![CDATA[${query}]]></Expression>
        <PageNumber>${opts.pageNumber || 1}</PageNumber>
        <PageSize>${opts.pageSize || 25}</PageSize>
      </Query>
    `)
  }

  // May be needed in the future
  // private renderRelationshipsRequest(id: string) {
  //   return this.renderOperationRequest(`
  //     <GetLightweightRelationships>
  //       <ID>${id}</ID>
  //     </GetLightweightRelationships>
  //   `)
  // }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    auth: Authorization = this.authorization,
    body?: string,
  ) {
    const res = await fetch(auth.endpoint + path, {
      method,
      headers: {
        ...auth.headers,
        'Content-Type': 'text/xml',
        'EIDR-Version': eidrApiVersion,
      },
      ...(body ? { body } : {}),
    })

    if (res.status !== 200) {
      throw new EIDRError(
        'API error',
        res.status,
        `HTTP error accessing EIDR registry API: ${
          res.status} ${res.statusText}`,
      )
    }

    const xml = await res.text()
    return xml2js.parseStringPromise(xml, this.xmlOptions)
  }

  // Actions ////////////////////////////////////////////////////////

  public info() {
    return {
      eidrApiVersion,
      eidrConnectorVersion,
    }
  }

  public async query(
    exprOrObj: string | Obj,
    options: QueryOptions = {},
    credentials?: Credentials,
  ) {
    const auth: Authorization = credentials ?
      new Authorization(credentials) :
      this.authorization
    if (!auth.registered) {
      throw new EIDRError(
        'Unregistered',
        401,
        'Query requires registered user credentials'
      )
    }

    const expr =
      typeof exprOrObj === 'string' ? exprOrObj :
      typeof exprOrObj === 'object' ? buildJsonQuery(exprOrObj) :
      undefined
    if (expr === undefined) {
      throw new EIDRError(
        'Invalid query',
        500,
        `Query must be a string or an object: ${typeof exprOrObj}`,
      )
    }
    const req = this.renderQueryRequest(expr, options)
    const obj = await this.request(
      'POST',
      `query/${options.idOnly ? '?type=ID' : ''}`,
      auth,
      req,
    )
    const res = obj.Response

    if (res.Status.Code !== '0') {
      console.log('Query:', req)
      throw new EIDRError(
        `Error ${res.Status.Code} ${res.Status.Type}`,
        (res.Status.Code === '4' || res.Status.Code === '5') ? 403 : 500,
        res.Status.Details,
      )
    }

    if (res.QueryResults) {
      const data = res.QueryResults[options.idOnly ? 'ID' : 'SimpleMetadata']
      const array = data ? (Array.isArray(data) ? data : [data]) : []
      return {
        totalMatches: Number(res.QueryResults.TotalMatches),
        results: array,
      }
    }

    throw new EIDRError(
      'Unrecognized response',
      500,
      'Unrecognized response from registry',
    )
  }

  public async resolve(id: string, type = 'Full') {
    if (!validateId(id)) {
      throw new EIDRError('Invalid ID', 400, `Invalid EIDR ID: ${id}`)
    }
    if (id.startsWith('10.5240')) {
      return this.resolveContentID(id, type)
    }
    if (id.startsWith('10.5239') || id.startsWith('10.5237')) {
      return this.resolveOtherID(id, type)
    }
    throw new EIDRError(
      'Unsupported type',
      500,
      `Unsupported record type: ${id.substring(0, 7)}`,
    )
  }

  private async resolveContentID(id: string, type = 'Full') {
    if (
      type !== 'AlternateIDs' &&
      type !== 'DOIKernel' &&
      type !== 'Full' &&
      type !== 'LinkedAlternateIDs' &&
      type !== 'Provenance' &&
      type !== 'SelfDefined' &&
      type !== 'Simple'
    ) {
      throw new EIDRError(
        'Unsupported type',
        500,
        `Unsupported resolution type: id=${id} type=${type}`,
      )
    }

    const pth = `object/${encodeURIComponent(id)}?type=${type}`
    const res = await this.request('GET', pth)

    if (res.Response &&
        res.Response.Status &&
        res.Response.Status.Code !== '0') {

      throw new EIDRError(
        `Error ${res.Response.Status.Code} ${res.Response.Status.Type}`,
        500,
        `Registry error: id=${id} type=${res.Response.Status.Type}`,
      )
    }

    if (type === 'Full' || type === 'SelfDefined') {
      const attr = `${type}Metadata`
      if (!res[attr] || !res[attr].BaseObjectData) {
        throw new EIDRError(
          'Unrecognized response',
          500,
          `Unrecognized response resolving: id=${id} type=${type}`,
        )
      }
      return {
        ...res[attr].BaseObjectData,
        ExtraObjectMetadata: res[attr].ExtraObjectMetadata,
      }
    }

    if (type === 'AlternateIDs' || type === 'LinkedAlternateIDs') {
      const prop = type.slice(0, -1)
      if (!res[type]) {
        throw new EIDRError(
          'Unrecognized response',
          500,
          `Unrecognized response resolving: id=${id} type=${type}`,
        )
      }
      return {
        ID: res[type].ID,
        [prop]: res[type][prop] || [],
      }
    }

    // type === 'Simple'|| type === 'Provenance' || type === 'DOIKernel'
    const attr = `${type === 'DOIKernel' ? 'kernel' : type}Metadata`
    if (!res[attr]) {
      throw new EIDRError(
        'Unrecognized response',
        500,
        `Unrecognized response resolving: id=${id} type=${type}`,
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-shadow
    const { $, ...response } = res[attr]
    return response
  }

  private async resolveOtherID(id: string, type = 'Full') {
    if (type !== 'Full' && type !== 'DOIKernel') {
      throw new EIDRError(
        'Unsupported type',
        500,
        `Unsupported resolution: id=${id} type=${type}`,
      )
    }

    const prefix = id.startsWith('10.5237') ? 'party' : 'service'
    const pth = `${prefix}/resolve/${encodeURIComponent(id)}?type=${type}`
    const res = await this.request('GET', pth)

    if (res.Response &&
        res.Response.Status &&
        res.Response.Status.Code !== '0') {
      throw new EIDRError(
        `Error ${res.Response.Status.Code} ${res.Response.Status.Type}`,
        500,
        `Registry error: id=${id} type=${res.Response.Status.Type}`,
      )
    }

    const which = id.startsWith('10.5237') ? 'Party' : 'Service'
    const payload = res && res[type === 'Full' ? which : 'kernelMetadata']
    if (!payload) {
      throw new EIDRError(
        'Unrecognized response',
        500,
        `Unrecognized response resolving: id=${id} type=${type}`,
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-shadow
    const { $, ...response } = payload
    return response
  }

  public async simpleQuery(
    exprOrObj: string | Obj,
    compareFunction?: (a: Obj, b: Obj) => number,
    credentials?: Credentials,
  ) {
    const { results } = await this.query(exprOrObj, {}, credentials)
    const defaultCompareFunction = ((a: any, b: any) => (
      (new Date(b.ReleaseDate)).getTime() -
      (new Date(a.ReleaseDate)).getTime()
    ))
    return results.sort(compareFunction || defaultCompareFunction)
  }
}

import crypto from 'crypto'
import xml2js from 'xml2js'
import fetch from 'node-fetch'
import { BaseConnector, Reshuffle } from 'reshuffle-base-connector'
import { validateId } from './validate'
import { buildJsonQuery } from './jsonQuery'

type Obj = Record<string, any>
type Options = Record<string, any>

interface QueryOptions {
  idOnly?: boolean
  pageNumber?: number
  pageSize?: number
  root?: string
}

class EIDRError extends Error {
  constructor(message: string, public status: number, public details: string) {
    super(`EIDRConnector: ${message}`)
  }
}

export class EIDRConnector extends BaseConnector {
  private endpoint: string
  private authorization: string
  private xmlOptions: Obj

  constructor(app: Reshuffle, options: Options = {}, id?: string) {
    super(app, options, id)

    let userId: string
    let partyId: string
    let shadow: string
    let domain: string

    function validate(opt: string): string {
      if (typeof options[opt] !== 'string' || options[opt].length === 0) {
        throw new EIDRError(
          'Invalid ${opt}',
          500,
          `Invalid ${opt}: ${options[opt]}`,
        )
      }
      return options[opt]
    }

    if (options.userId) {
      userId = validate('userId')
      partyId = validate('partyId')
      const password = validate('password')
      shadow = crypto.createHash('md5').update(password).digest('base64')
      domain = validate('domain')
    } else {
      userId = '10.5238/reshuffle-api'
      partyId = '10.5237/717F-CB6A'
      shadow = 'IRRrGhXH+DrDYBs82EBzzQ=='
      domain = 'resolve.eidr.org'
    }

    this.endpoint = `https://${domain}/EIDR/`
    this.authorization = `Eidr ${userId}:${partyId}:${shadow}`

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

  private async getRequest(pth: string) {
    const res = await fetch(this.endpoint + pth, {
      method: 'GET',
      headers: {
        Authorization: this.authorization,
        'Content-Type': 'text/xml',
        'EIDR-Version': '2.6.0',
      },
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

  private async postRequest(pth: string, requestBody: string) {
    const res = await fetch(this.endpoint + pth, {
      method: 'POST',
      headers: {
        Authorization: this.authorization,
        'Content-Type': 'text/xml',
        'EIDR-Version': '2.6.0',
      },
      body: requestBody,
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

  public async query(exprOrObj: string | Obj, options: QueryOptions = {}) {
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
    const obj = await this.postRequest(
      `query/${options.idOnly ? '?type=ID' : ''}`,
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
    const res = await this.getRequest(pth)

    if (res.Response &&
        res.Response.Status &&
        res.Response.Status.Code !== '0') {

      throw new EIDRError(
        `Error ${res.Response.Status.Code} ${res.Response.Status.Type}`,
        500,
        res.Response.Status.Type,
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
        `Unsupported resolution type: ${type}`,
      )
    }

    const prefix = id.startsWith('10.5237') ? 'party' : 'service'
    const pth = `${prefix}/resolve/${encodeURIComponent(id)}?type=${type}`
    const res = await this.getRequest(pth)

    if (res.Response &&
        res.Response.Status &&
        res.Response.Status.Code !== '0') {
      throw new EIDRError(
        `Error ${res.Response.Status.Code} ${res.Response.Status.Type}`,
        500,
        res.Response.Status.Type,
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
  ) {
    const { results } = await this.query(exprOrObj)
    const defaultCompareFunction = ((a: any, b: any) => (
      (new Date(b.ReleaseDate)).getTime() -
      (new Date(a.ReleaseDate)).getTime()
    ))
    return results.sort(compareFunction || defaultCompareFunction)
  }
}

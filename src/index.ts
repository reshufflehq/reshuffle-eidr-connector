import crypto from 'crypto'
import xml2js from 'xml2js'
import fetch from 'node-fetch'
import { BaseConnector, Reshuffle } from 'reshuffle-base-connector'

type Obj = Record<string, any>
type Options = Record<string, any>

interface QueryOptions {
  pageNumber?: number
  pageSize?: number
  root?: string
}

class EIDRError extends Error {
  constructor(message: string, public status: number, public details: string) {
    super(`EIDRConnector: ${message}`)
  }
}

const logical: Obj = {

  and: function and(...expressions: string[]) {
    const many = 1 < expressions.length
    return `${many ? '(' : ''}${expressions.join(' AND ')}${many ? ')' : ''}`
  },

  eq: function eq(field: string, value: string) {
    return `(/FullMetadata/BaseObjectData/${field} "${value}")`
  },

  is: function is(field: string, value: string) {
    return `(/FullMetadata/BaseObjectData/${field} IS "${value}")`
  },

  meq: function meq(field: string, value: string) {
    return `(/FullMetadata/ExtraObjectMetadata/${field} "${value}")`
  },

  mexists: function mexists(field: string) {
    return `(/FullMetadata/ExtraObjectMetadata/${field} EXISTS)`
  },

  not: function not(expression: string) {
    return `(NOT ${expression})`
  },

  or: function or(...expressions: string[]) {
    const many = 1 < expressions.length
    return `${many ? '(' : ''}${expressions.join(' OR ')}${many ? ')' : ''}`
  },
}

const semantic: Obj = {

  date: function date(dt: string) {
    return logical.eq('ReleaseDate', dt)
  },

  episodes: function episodes(id: string) {
    return logical.meq('EpisodeInfo/Parent', id)
  },

  id: function id(_id: string) {
    return logical.eq('ID', _id)
  },

  movie: function movie() {
    return logical.is('ReferentType', 'Movie')
  },

  name: function name(nm: string) {
    return logical.is('ResourceName', nm)
  },

  seasons: function seasons(id: string) {
    return logical.and(
      logical.meq('SeasonInfo/Parent', id),
      semantic.type('Season'),
    )
  },

  status: function status(st: string) {
    return logical.eq('Status', st)
  },

  type: function type(ty: string) {
    return logical.is('ReferentType', ty)
  },

  valid: function valid() {
    return logical.eq('Status', 'valid')
  },
}

function $(obj: Obj): string {
  return logical.and(...Object.entries(obj).map(([key, value]) => {
    if (key === 'and' || key === 'or') {
      if (!Array.isArray(value)) {
        throw new Error(`Logical ${key} must have an array value: ${value}`)
      }
      return logical[key](...value.map($))
    }
    if (key === 'not') {
      if (Array.isArray(value)) {
        throw new Error(`Logical not must have non-array value: ${value}`)
      }
      return logical.not($(value))
    }
    if (key in semantic) {
      return semantic[key](value)
    }
    if (key in logical) {
      return logical[key](value)
    }
    return logical.is(key, value)
  }))
}

const EIDRQueryBuilder = {
  ...logical,
  ...semantic,
  $,
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
        'EIDR-Version': '2.1',
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
        'EIDR-Version': '2.1',
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
    const xmlOptions = { ...this.xmlOptions, ignoreAttrs: true }
    return xml2js.parseStringPromise(xml, xmlOptions)
  }

  // Actions ////////////////////////////////////////////////////////

  public getQueryBuilder() {
    return EIDRQueryBuilder
  }

  public async query(exprOrObj: string | Obj, options: QueryOptions = {}) {
    const expr =
      typeof exprOrObj === 'string' ? exprOrObj :
      typeof exprOrObj === 'object' ? EIDRQueryBuilder.$(exprOrObj) :
      undefined
    if (expr === undefined) {
      throw new EIDRError(
        'Invalid query',
        500,
        `Query must be a string or an object: ${typeof exprOrObj}`,
      )
    }
    const req = this.renderQueryRequest(expr, options)
    const obj = await this.postRequest('query/', req)
    const res = obj.Response

    if (res.Status.Code !== '0') {
      throw new EIDRError(
        `Error ${res.Status.Code} ${res.Status.Type}`,
        (res.Status.Code === '4' || res.Status.Code === '5') ? 403 : 500,
        res.Status.Details,
      )
    }

    if (res.QueryResults) {
      const data = res.QueryResults.SimpleMetadata
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
        `Unsupported resolution type: ${type}`,
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

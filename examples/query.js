const { Reshuffle } = require('reshuffle')
const { EIDRConnector } = require('reshuffle-eidr-connector')

async function main() {
  const app = new Reshuffle()
  const eidr = new EIDRConnector(app)

  const name = 'Abominable'
  const { results } = await eidr.query({
    name,
    movie: true,
    ReleaseDate: 2019,
    StructuralType: 'Performance',
  })
  for (const result of results) {
    console.log(result)
  }
}

main()

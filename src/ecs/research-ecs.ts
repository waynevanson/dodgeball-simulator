// query first, then mutations
import * as v from 'valibot'

const Id = v.pipe(v.number(), v.brand('Id'))

const EntityId = v.pipe(
    Id,
    v.brand('EntityId')
)

const ComponentId = v.pipe(
    Id,
    v.brand('ComponentId')
)


